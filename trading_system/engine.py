"""
engine.py
=========

The live trading loop.

On each interval the engine:

1. Re-reads the **kill switch**; if set, it cancels all orders, flattens every
   position, and stops.
2. Pulls the account and current positions.
3. Rolls the daily baseline and checks the **daily-loss limit**.
4. (Equities) checks the market clock.
5. For every configured ticker: fetches fresh bars, advances that ticker's
   :class:`SignalGenerator` with any newly-closed bar, and acts on the result --
   honouring position sizing, the max-concurrent-positions cap, stop-loss and
   take-profit levels.

State (the per-ticker signal machine) is warmed up from recent history at
startup and then advanced incrementally, so the consecutive-vote logic behaves
like the original indicator running bar by bar.

NOTE: live warmup primes the signal state from *recent* history only; for state
that exactly matches a full-history TradingView chart, validate with
``backtest.py`` over the same range.
"""

from __future__ import annotations

import logging
import signal as _signal
import time
from datetime import datetime, timezone
from typing import Dict, Optional

from broker import Broker, build_broker
from config import CONFIG, Config
from data import DataProvider
from database import Database
from risk import RiskManager
from signals import SignalGenerator

log = logging.getLogger("engine")


class TradingEngine:
    def __init__(
        self,
        config: Config = CONFIG,
        broker: Optional[Broker] = None,
        db: Optional[Database] = None,
    ):
        self.config = config
        self.broker = broker or build_broker(config)
        self.db = db or Database(config.db_path)
        self.risk = RiskManager(config)
        self.data = DataProvider(config)

        self.generators: Dict[str, SignalGenerator] = {
            t: SignalGenerator(
                equation_set=config.equation_set,
                lookback=config.lookback_length,
                signal_value=config.signal_value,
            )
            for t in config.tickers
        }
        self._last_bar_ts: Dict[str, object] = {}
        self._stop = False

    # ------------------------------------------------------------------ #
    # Warmup
    # ------------------------------------------------------------------ #
    def warmup(self) -> None:
        """Prime each ticker's signal state from recent history (no trading)."""
        bars_needed = max(self.config.lookback_length * 3, self.config.lookback_length + 50)
        for ticker in self.config.tickers:
            try:
                df = self.data.recent(ticker, bars_needed)
            except Exception as exc:
                log.warning("warmup fetch failed for %s: %s", ticker, exc)
                continue
            if len(df) < self.config.lookback_length:
                log.warning(
                    "warmup: only %d bars for %s (need %d) -- signals delayed",
                    len(df), ticker, self.config.lookback_length,
                )
            gen = self.generators[ticker]
            for ts, row in df.iterrows():
                gen.update(
                    {
                        "open": float(row["open"]), "high": float(row["high"]),
                        "low": float(row["low"]), "close": float(row["close"]),
                        "volume": float(row["volume"]),
                    },
                    can_plot=True,
                )
                self._last_bar_ts[ticker] = ts
            log.info("warmed up %s: %d bars, state buy=%d sell=%d",
                     ticker, len(df), gen.buy_signal, gen.sell_signal)

    # ------------------------------------------------------------------ #
    # Main loop
    # ------------------------------------------------------------------ #
    def run(self) -> None:
        self._install_signal_handlers()
        log.info("starting engine | %s", self.config.summary())
        if self.config.is_live:
            log.warning("LIVE TRADING ENABLED -- real orders will be placed.")
        else:
            log.info("paper trading mode (no real money).")

        self.warmup()

        interval = self.config.interval_seconds
        next_run = time.monotonic()
        while not self._stop:
            if self.risk.kill_switch_active():
                self._handle_kill_switch()
                break

            try:
                self.step()
            except Exception:  # never let one bad cycle kill the loop
                log.exception("error during trading step")

            next_run += interval
            # Sleep in short slices so the kill switch stays responsive.
            while not self._stop and time.monotonic() < next_run:
                if self.risk.kill_switch_active():
                    self._handle_kill_switch()
                    return
                time.sleep(min(5.0, max(0.0, next_run - time.monotonic())))

        log.info("engine stopped.")

    def _install_signal_handlers(self) -> None:
        def _handler(signum, frame):
            log.info("received signal %s -- shutting down gracefully.", signum)
            self._stop = True
        try:
            _signal.signal(_signal.SIGINT, _handler)
            _signal.signal(_signal.SIGTERM, _handler)
        except ValueError:
            pass  # not in main thread (e.g. tests) -- skip

    # ------------------------------------------------------------------ #
    # One trading cycle
    # ------------------------------------------------------------------ #
    def step(self) -> None:
        account = self.broker.get_account()
        self.risk.roll_day(account.equity)

        positions = {p.symbol: p for p in self.broker.get_positions()}
        open_trades = {t["ticker"]: t for t in self.db.get_open_trades()}

        # --- daily loss guard ---
        if self.risk.daily_loss_breached(account.equity):
            log.warning(
                "daily loss limit hit (equity %.2f vs start %.2f) -- no new entries.",
                account.equity, self.risk.start_of_day_equity or 0.0,
            )
            if self.config.flatten_on_daily_loss:
                self._flatten_all(open_trades, reason="daily_loss")
                return
            halt_new_entries = True
        else:
            halt_new_entries = False

        market_open = True
        if self.config.require_market_open and self.config.broker == "alpaca":
            try:
                market_open = self.broker.is_market_open()
            except Exception as exc:
                log.warning("could not read market clock: %s", exc)

        for ticker in self.config.tickers:
            try:
                self._process_ticker(
                    ticker, account, positions, open_trades,
                    market_open=market_open, halt_new_entries=halt_new_entries,
                )
            except Exception:
                log.exception("error processing %s", ticker)

    def _process_ticker(self, ticker, account, positions, open_trades,
                         *, market_open, halt_new_entries) -> None:
        gen = self.generators[ticker]

        # Advance the signal state with any newly-closed bars.
        df = self.data.recent(ticker, self.config.lookback_length + 5)
        action = None
        if len(df):
            last_ts = self._last_bar_ts.get(ticker)
            new_rows = df[df.index > last_ts] if last_ts is not None else df
            for ts, row in new_rows.iterrows():
                res = gen.update(
                    {
                        "open": float(row["open"]), "high": float(row["high"]),
                        "low": float(row["low"]), "close": float(row["close"]),
                        "volume": float(row["volume"]),
                    },
                    can_plot=True,
                )
                action = res.action
                self._last_bar_ts[ticker] = ts

        current_price = self._latest_price(ticker, df)
        open_trade = open_trades.get(ticker)

        # --- 1. protective exits always run first ---
        if open_trade and current_price > 0:
            reason = self.risk.exit_reason(open_trade["entry_price"], current_price)
            if reason:
                self._close(ticker, open_trade, current_price, reason)
                open_trades.pop(ticker, None)
                positions.pop(ticker, None)
                open_trade = None

        # --- 2. signal-driven SELL (exit long) ---
        if action == "SELL" and open_trade:
            self._close(ticker, open_trade, current_price, "signal")
            open_trades.pop(ticker, None)
            positions.pop(ticker, None)
            open_trade = None

        # --- 3. signal-driven BUY (enter long) ---
        if action == "BUY" and open_trade is None:
            if halt_new_entries:
                log.info("%s BUY suppressed (daily-loss halt).", ticker)
                return
            if self.config.require_market_open and not market_open:
                log.info("%s BUY suppressed (market closed).", ticker)
                return
            can_open, why = self.risk.can_open_new(len(open_trades))
            if not can_open:
                log.info("%s BUY suppressed (%s).", ticker, why)
                return
            self._open(ticker, account, current_price, open_trades)

    # ------------------------------------------------------------------ #
    # Order helpers
    # ------------------------------------------------------------------ #
    def _open(self, ticker, account, ref_price, open_trades) -> None:
        if ref_price <= 0:
            log.warning("%s: no price available, skipping entry.", ticker)
            return
        decision = self.risk.size_position(
            ref_price, account.equity, account.buying_power,
            max_pct=self.config.position_pct_for(ticker),
        )
        if not decision.allowed:
            log.info("%s BUY skipped: %s", ticker, decision.reason)
            return

        log.info("%s BUY %.4f @ ~%.2f", ticker, decision.qty, ref_price)
        try:
            order_id = self.broker.submit_market_order(ticker, decision.qty, "buy")
        except Exception as exc:
            log.error("%s order failed: %s", ticker, exc)
            return

        fill = self._resolve_fill_price(ticker, ref_price)
        stop = self.risk.stop_price(fill)
        target = self.risk.take_profit_price(fill)
        trade_id = self.db.record_entry(
            ticker=ticker, equation_set=self.config.equation_set, qty=decision.qty,
            entry_price=fill, stop_price=stop, take_profit_price=target,
            broker_order_id=order_id, notes=f"signal entry (eq{self.config.equation_set})",
        )
        open_trades[ticker] = self.db.get_open_trade(ticker)
        log.info("%s opened trade #%d @ %.2f (stop %.2f / target %.2f)",
                 ticker, trade_id, fill, stop, target)

    def _close(self, ticker, open_trade, ref_price, reason) -> None:
        log.info("%s CLOSE (%s) qty %.4f @ ~%.2f", ticker, reason, open_trade["qty"], ref_price)
        try:
            self.broker.close_position(ticker)
        except Exception as exc:
            log.error("%s close failed: %s", ticker, exc)
            return
        exit_price = self._resolve_fill_price(ticker, ref_price, expect_flat=True)
        row = self.db.record_exit(open_trade["id"], exit_price=exit_price, exit_reason=reason)
        if row:
            log.info("%s closed trade #%d: pnl $%.2f (%.2f%%) [%s]",
                     ticker, row["id"], row["pnl_dollars"] or 0.0,
                     row["pnl_pct"] or 0.0, reason)

    def _flatten_all(self, open_trades, reason: str) -> None:
        log.warning("flattening all positions (%s).", reason)
        try:
            self.broker.cancel_all_orders()
        except Exception as exc:
            log.error("cancel_all_orders failed: %s", exc)
        for ticker, trade in list(open_trades.items()):
            price = self._latest_price(ticker, None)
            self._close(ticker, trade, price, reason)
        try:
            self.broker.close_all_positions()
        except Exception as exc:
            log.error("close_all_positions failed: %s", exc)

    def _handle_kill_switch(self) -> None:
        log.critical("KILL SWITCH ACTIVE -- cancelling orders and flattening everything.")
        open_trades = {t["ticker"]: t for t in self.db.get_open_trades()}
        self._flatten_all(open_trades, reason="kill_switch")
        self._stop = True

    # ------------------------------------------------------------------ #
    # Pricing helpers
    # ------------------------------------------------------------------ #
    def _latest_price(self, ticker, df) -> float:
        try:
            return float(self.broker.get_latest_price(ticker))
        except Exception:
            pass
        if df is not None and len(df):
            return float(df["close"].iloc[-1])
        return 0.0

    def _resolve_fill_price(self, ticker, fallback, expect_flat: bool = False,
                            attempts: int = 3) -> float:
        """Best-effort fill price: read the (new) position's avg entry, else use
        the latest price, else the reference price."""
        for _ in range(attempts):
            try:
                pos = self.broker.get_position(ticker)
                if expect_flat and pos is None:
                    break
                if not expect_flat and pos is not None and pos.avg_entry_price > 0:
                    return float(pos.avg_entry_price)
            except Exception:
                pass
            time.sleep(0.4)
        live = self._latest_price(ticker, None)
        return live if live > 0 else float(fallback)
