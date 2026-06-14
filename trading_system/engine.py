"""
engine.py
=========

The automated trading loop — it trades **exactly what the dashboard shows**.

Each cycle, for every configured ticker it runs the same :class:`scanner.Scanner`
the web UI uses, applies the auto-trade **policy** (which signals to act on, plus
market-tuned gates), and — honouring position sizing, max-concurrent-positions,
stop-loss / take-profit, the daily-loss halt and the kill switch — places (or, in
dry-run, just *describes*) orders through the broker.

Safety:
* **Paper is the hard default.** Live trading needs ``TRADING_MODE=live`` set
  deliberately; the engine warns loudly when live.
* **Dry-run** (``--dry-run``) places no orders and needs **no broker/keys** — it
  uses your configured ``ACCOUNT_SIZE`` to show exactly what it *would* do.
* The **kill switch** (``KILL_SWITCH=true``) cancels orders + flattens everything
  on the next cycle, then stops.

Policy (config): ``AUTOTRADE_SIGNAL`` ("strong" = only STRONG BUY where both
equations agree, or "buy"), ``AUTOTRADE_MIN_CONVICTION``, and
``AUTOTRADE_REQUIRE_UPTREND`` (only enter when price >= SMA50).
"""

from __future__ import annotations

import logging
import signal as _signal
import time
from typing import Dict, Optional

from broker import AccountInfo, Broker, build_broker
from config import CONFIG, Config
from database import Database
from risk import RiskManager
from scanner import Scanner, TickerSignal

log = logging.getLogger("engine")


def _fmt_dur(secs: float) -> str:
    if secs >= 86400:
        return f"{secs / 86400:.0f}d"
    if secs >= 3600:
        return f"{secs / 3600:.0f}h"
    if secs >= 60:
        return f"{secs / 60:.0f}m"
    return f"{secs:.0f}s"


class TradingEngine:
    def __init__(
        self,
        config: Config = CONFIG,
        broker: Optional[Broker] = None,
        db: Optional[Database] = None,
        dry_run: Optional[bool] = None,
    ):
        self.config = config
        self.dry_run = config.dry_run if dry_run is None else dry_run
        # Dry-run needs no broker/keys -- it only previews decisions.
        self.broker = broker if broker is not None else (None if self.dry_run else build_broker(config))
        self.db = db or Database(config.db_path)
        self.risk = RiskManager(config)
        self.scanner = Scanner(config)
        self._stop = False

    # ------------------------------------------------------------------ #
    # Decision policy (shared by live trading and the preview)
    # ------------------------------------------------------------------ #
    def decide(self, sig: TickerSignal) -> Optional[str]:
        """Map a dashboard signal to an action under the auto-trade policy."""
        if sig.error:
            return None
        rec = sig.recommendation
        # Exit on a sell signal.
        if rec in ("SELL", "STRONG SELL"):
            return "SELL"
        # Entry gates.
        allowed = {"STRONG BUY"} if self.config.autotrade_signal == "strong" else {"STRONG BUY", "BUY"}
        if rec not in allowed:
            return None
        if sig.conviction < self.config.autotrade_min_conviction:
            return None
        if self.config.autotrade_require_uptrend and sig.trend != "Uptrend":
            return None
        return "BUY"

    def _reject_reason(self, sig: TickerSignal) -> str:
        """Human-readable reason a buy-ish signal was NOT taken (for the preview)."""
        rec = sig.recommendation
        allowed = {"STRONG BUY"} if self.config.autotrade_signal == "strong" else {"STRONG BUY", "BUY"}
        if rec in ("HOLD",):
            return "already triggered earlier (not a fresh entry)"
        if rec not in allowed and rec not in ("SELL", "STRONG SELL"):
            return f"{rec} below policy ({self.config.autotrade_signal})"
        if rec in allowed and sig.conviction < self.config.autotrade_min_conviction:
            return f"conviction {sig.conviction:.0f} < {self.config.autotrade_min_conviction:.0f}"
        if rec in allowed and self.config.autotrade_require_uptrend and sig.trend != "Uptrend":
            return "not in an uptrend"
        return "no signal"

    # ------------------------------------------------------------------ #
    # Preview (dry-run, no broker, no keys)
    # ------------------------------------------------------------------ #
    def preview_rows(self) -> list:
        """Structured 'what it would do this cycle' rows (no orders). For the UI/CLI."""
        eq = self.config.account_size
        rows = []
        for ticker in self.config.tickers:
            try:
                sig = self.scanner.scan_ticker(ticker)
            except Exception as exc:
                rows.append({"ticker": ticker, "action": "ERROR", "reason": str(exc)})
                continue
            if sig.error:
                rows.append({"ticker": ticker, "action": "ERROR", "reason": sig.error})
                continue
            action = self.decide(sig)
            row = {"ticker": ticker, "sector": sig.sector, "recommendation": sig.recommendation,
                   "conviction": sig.conviction, "trend": sig.trend, "price": sig.price,
                   "action": "HOLD", "reason": ""}
            if action == "BUY":
                d = self.risk.size_position(sig.price, eq, eq,
                                            max_pct=self.config.position_pct_for(ticker))
                if d.allowed:
                    row.update(action="BUY", shares=int(d.qty), cost=round(d.qty * sig.price, 2),
                               stop=round(self.risk.stop_price(sig.price), 2),
                               target=round(self.risk.take_profit_price(sig.price), 2))
                else:
                    row.update(action="SKIP", reason=d.reason)
            elif action == "SELL":
                row.update(action="SELL")
            else:
                row.update(action="HOLD", reason=self._reject_reason(sig))
            rows.append(row)
        return rows

    def preview(self) -> None:
        """Print exactly what the engine WOULD do this cycle. Places no orders."""
        print("=" * 78)
        print(f" AUTO-TRADE PREVIEW (dry run, no orders) | policy={self.config.autotrade_signal} "
              f"min_conv={self.config.autotrade_min_conviction:.0f} "
              f"uptrend_only={self.config.autotrade_require_uptrend}")
        print(f" Account ${self.config.account_size:,.0f} | max {self.config.max_position_pct:.0f}%/pos | "
              f"stop {self.config.stop_loss_pct:.0f}% | target {self.config.take_profit_pct:.0f}%")
        print("=" * 78)
        buys = sells = 0
        for r in self.preview_rows():
            t = r["ticker"]
            if r["action"] == "ERROR":
                print(f"  {t:<6} error: {r['reason']}")
            elif r["action"] == "BUY":
                buys += 1
                print(f"  ✅ BUY  {t:<6} {r['shares']} sh @ ~${r['price']:,.2f} (${r['cost']:,.0f}) | "
                      f"stop ${r['stop']:,.2f} target ${r['target']:,.2f} | "
                      f"{r['recommendation']} conv {r['conviction']:.0f} {r['trend']}")
            elif r["action"] == "SELL":
                sells += 1
                print(f"  ❎ SELL {t:<6} exit @ ~${r['price']:,.2f} | {r['recommendation']}")
            elif r["action"] == "SKIP":
                print(f"  ⚠️  BUY  {t:<6} skipped: {r['reason']}")
            else:
                print(f"  ·  hold {t:<6} {r['recommendation']:<11} conv {r['conviction']:>3.0f} "
                      f"{r['trend']:<9} — {r['reason']}")
        print("-" * 78)
        print(f"  Would place {buys} buy and {sells} sell order(s). No orders were sent (dry run).")
        print("  Start paper trading for real (no money) with:  python main.py autotrade")

    # ------------------------------------------------------------------ #
    # Live loop
    # ------------------------------------------------------------------ #
    def run(self) -> None:
        self._install_signal_handlers()
        log.info("starting auto-trade | %s", self.config.summary())
        log.info("policy: signal=%s min_conviction=%.0f uptrend_only=%s",
                 self.config.autotrade_signal, self.config.autotrade_min_conviction,
                 self.config.autotrade_require_uptrend)
        if self.dry_run:
            log.warning("DRY RUN -- decisions only, no orders will be placed.")
        elif self.config.is_live:
            log.warning("LIVE TRADING ENABLED -- REAL orders will be placed.")
        else:
            log.info("paper trading mode (no real money).")

        interval = self.config.interval_seconds
        next_run = time.monotonic()
        while not self._stop:
            if not self.dry_run and self.risk.kill_switch_active():
                self._handle_kill_switch()
                break
            try:
                self.step()
            except Exception:
                log.exception("error during trading step")

            next_run += interval
            log.info("idle until next cycle (~%s) -- engine is running; Ctrl-C to stop.",
                     _fmt_dur(interval))
            while not self._stop and time.monotonic() < next_run:
                if not self.dry_run and self.risk.kill_switch_active():
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
            pass

    # ------------------------------------------------------------------ #
    # One trading cycle
    # ------------------------------------------------------------------ #
    def step(self) -> None:
        if self.dry_run or self.broker is None:
            eq = self.config.account_size
            account = AccountInfo(equity=eq, cash=eq, buying_power=eq, portfolio_value=eq)
            positions: Dict = {}
        else:
            account = self.broker.get_account()
            positions = {p.symbol: p for p in self.broker.get_positions()}

        self.risk.roll_day(account.equity)
        open_trades = {t["ticker"]: t for t in self.db.get_open_trades()}

        halt_new_entries = False
        if not self.dry_run and self.risk.daily_loss_breached(account.equity):
            log.warning("daily loss limit hit (equity %.2f vs start %.2f) -- no new entries.",
                        account.equity, self.risk.start_of_day_equity or 0.0)
            if self.config.flatten_on_daily_loss:
                self._flatten_all(open_trades, reason="daily_loss")
                return
            halt_new_entries = True

        market_open = True
        if not self.dry_run and self.config.require_market_open and self.config.broker == "alpaca":
            try:
                market_open = self.broker.is_market_open()
            except Exception as exc:
                log.warning("could not read market clock: %s", exc)

        opened = closed = errors = 0
        for ticker in self.config.tickers:
            try:
                r = self._process_ticker(ticker, account, positions, open_trades,
                                         market_open=market_open, halt_new_entries=halt_new_entries)
                if r == "open":
                    opened += 1
                elif r == "close":
                    closed += 1
                elif r == "error":
                    errors += 1
            except Exception:
                log.exception("error processing %s", ticker)
                errors += 1

        holding = len(self.db.get_open_trades())
        log.info("cycle complete: scanned %d/%d, market %s, holding %d position(s), "
                 "%d opened / %d closed this cycle",
                 len(self.config.tickers) - errors, len(self.config.tickers),
                 "OPEN" if market_open else "CLOSED", holding, opened, closed)
        if not self.dry_run and self.config.require_market_open and not market_open:
            log.info("market is closed (weekend / after-hours) -- signals are still computed, "
                     "but new entries wait until it reopens.")

    def _process_ticker(self, ticker, account, positions, open_trades,
                        *, market_open, halt_new_entries) -> Optional[str]:
        sig = self.scanner.scan_ticker(ticker)
        if sig.error:
            log.debug("%s scan error: %s", ticker, sig.error)
            return "error"
        action = self.decide(sig)
        current_price = self._latest_price(ticker, sig.price)
        open_trade = open_trades.get(ticker)
        did: Optional[str] = None

        # 1. protective exits first
        if open_trade and current_price > 0:
            reason = self.risk.exit_reason(open_trade["entry_price"], current_price)
            if reason:
                self._close(ticker, open_trade, current_price, reason)
                open_trades.pop(ticker, None)
                positions.pop(ticker, None)
                open_trade = None
                did = "close"

        # 2. signal-driven exit
        if action == "SELL" and open_trade:
            self._close(ticker, open_trade, current_price, "signal")
            open_trades.pop(ticker, None)
            positions.pop(ticker, None)
            open_trade = None
            did = "close"

        # 3. signal-driven entry
        if action == "BUY" and open_trade is None:
            if halt_new_entries:
                log.info("%s BUY suppressed (daily-loss halt).", ticker)
                return did
            if not self.dry_run and self.config.require_market_open and not market_open:
                log.info("%s BUY signal -- suppressed (market closed).", ticker)
                return did
            can_open, why = self.risk.can_open_new(len(open_trades))
            if not can_open:
                log.info("%s BUY suppressed (%s).", ticker, why)
                return did
            self._open(ticker, account, current_price, open_trades, sig)
            did = "open"
        return did

    # ------------------------------------------------------------------ #
    # Order helpers (dry-run guarded)
    # ------------------------------------------------------------------ #
    def _open(self, ticker, account, ref_price, open_trades, sig: Optional[TickerSignal] = None) -> None:
        if ref_price <= 0:
            log.warning("%s: no price available, skipping entry.", ticker)
            return
        decision = self.risk.size_position(ref_price, account.equity, account.buying_power,
                                           max_pct=self.config.position_pct_for(ticker))
        if not decision.allowed:
            log.info("%s BUY skipped: %s", ticker, decision.reason)
            return

        tag = f"{sig.recommendation} conv {sig.conviction:.0f}" if sig else ""
        if self.dry_run:
            log.info("[DRY RUN] would BUY %s %.4f sh @ ~%.2f (stop %.2f / target %.2f) [%s]",
                     ticker, decision.qty, ref_price, self.risk.stop_price(ref_price),
                     self.risk.take_profit_price(ref_price), tag)
            return

        log.info("%s BUY %.4f @ ~%.2f [%s]", ticker, decision.qty, ref_price, tag)
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
            broker_order_id=order_id, notes=f"auto entry ({tag})",
        )
        open_trades[ticker] = self.db.get_open_trade(ticker)
        log.info("%s opened trade #%d @ %.2f (stop %.2f / target %.2f)",
                 ticker, trade_id, fill, stop, target)

    def _close(self, ticker, open_trade, ref_price, reason) -> None:
        if self.dry_run:
            log.info("[DRY RUN] would CLOSE %s qty %.4f @ ~%.2f [%s]",
                     ticker, open_trade["qty"], ref_price, reason)
            return
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
                     ticker, row["id"], row["pnl_dollars"] or 0.0, row["pnl_pct"] or 0.0, reason)

    def _flatten_all(self, open_trades, reason: str) -> None:
        log.warning("flattening all positions (%s).", reason)
        if self.dry_run or self.broker is None:
            for ticker, trade in list(open_trades.items()):
                self._close(ticker, trade, self._latest_price(ticker, 0.0), reason)
            return
        try:
            self.broker.cancel_all_orders()
        except Exception as exc:
            log.error("cancel_all_orders failed: %s", exc)
        for ticker, trade in list(open_trades.items()):
            self._close(ticker, trade, self._latest_price(ticker, 0.0), reason)
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
    def _latest_price(self, ticker, fallback) -> float:
        if self.broker is not None:
            try:
                p = float(self.broker.get_latest_price(ticker))
                if p > 0:
                    return p
            except Exception:
                pass
        return float(fallback) if fallback else 0.0

    def _resolve_fill_price(self, ticker, fallback, expect_flat: bool = False,
                            attempts: int = 3) -> float:
        if self.broker is None:
            return float(fallback)
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
        live = self._latest_price(ticker, fallback)
        return live if live > 0 else float(fallback)
