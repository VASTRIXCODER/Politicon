"""
scanner.py
==========

The signal engine for **signals-only** mode (no broker, no orders).

For every configured ticker it:

1. pulls history (yfinance),
2. runs BOTH equation sets bar-by-bar to get the current stance + a conviction
   score derived from the buy/sell vote margin,
3. combines them into one recommendation (STRONG BUY when both agree),
4. computes specific, actionable levels — entry, stop-loss, take-profit, and an
   exact share count for your configured account size, and
5. backtests each equation on that ticker to show its historical edge.

The result is a ranked list of ``TickerSignal`` objects ("Top Buys" first),
optionally annotated by the Claude AI briefer.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from backtest import simulate
from data import fetch_history_yf
from signals import SignalGenerator

log = logging.getLogger("scanner")

# Rank weights so "Top Buys" sort to the top.
_REC_RANK = {
    "STRONG BUY": 5, "BUY": 4, "HOLD": 3, "WAIT": 2, "SELL": 1, "STRONG SELL": 0,
}


@dataclass
class EquationView:
    stance: str          # BUY / SELL / HOLD / WAIT
    fresh: bool          # signal fired on the most recent bar
    conviction: float    # 0-100 from the latest vote margin
    buy_votes: int
    sell_votes: int
    edge_win_rate: float
    edge_return_pct: float
    edge_trades: int


@dataclass
class TickerSignal:
    ticker: str
    price: float = 0.0
    recommendation: str = "WAIT"
    conviction: float = 0.0
    agree: bool = False
    entry: float = 0.0
    stop: float = 0.0
    target: float = 0.0
    shares: int = 0
    notional: float = 0.0
    price_summary: str = ""
    eq1: Optional[EquationView] = None
    eq2: Optional[EquationView] = None
    ai_brief: Optional[str] = None
    error: Optional[str] = None
    asof: str = ""

    @property
    def rank(self) -> tuple:
        return (_REC_RANK.get(self.recommendation, 2), self.conviction)

    @property
    def is_buy(self) -> bool:
        return self.recommendation in ("STRONG BUY", "BUY")

    @property
    def equation_summary(self) -> str:
        parts = []
        if self.eq1:
            parts.append(f"eq1={self.eq1.stance}")
        if self.eq2:
            parts.append(f"eq2={self.eq2.stance}")
        return ", ".join(parts)

    # convenience dict for the AI briefer / JSON
    def as_dict(self) -> Dict:
        d = {
            "ticker": self.ticker, "price": self.price,
            "recommendation": self.recommendation, "conviction": self.conviction,
            "agree": self.agree, "entry": self.entry, "stop": self.stop,
            "target": self.target, "shares": self.shares, "notional": self.notional,
            "price_summary": self.price_summary, "equation_summary": self.equation_summary,
            "ai_brief": self.ai_brief, "error": self.error, "asof": self.asof,
        }
        for name, ev in (("eq1", self.eq1), ("eq2", self.eq2)):
            if ev:
                d[name] = ev.__dict__
        # surface the driving equation's edge at the top level for the briefer
        drive = self.eq1 or self.eq2
        if drive:
            d["edge_win_rate"] = drive.edge_win_rate
            d["edge_return_pct"] = drive.edge_return_pct
            d["edge_trades"] = drive.edge_trades
        return d


class Scanner:
    def __init__(self, config, briefer=None):
        self.config = config
        self.briefer = briefer

    # ------------------------------------------------------------------ #
    def scan(self, brief_top: int = 3) -> List[TickerSignal]:
        """Scan all tickers; optionally AI-brief the top ``brief_top`` buys."""
        results: List[TickerSignal] = []
        for ticker in self.config.tickers:
            try:
                results.append(self.scan_ticker(ticker))
            except Exception as exc:  # one bad ticker shouldn't sink the scan
                log.warning("scan failed for %s: %s", ticker, exc)
                results.append(TickerSignal(ticker=ticker, error=str(exc),
                                            asof=_now_iso()))

        results.sort(key=lambda s: s.rank, reverse=True)

        if self.briefer and self.briefer.enabled:
            briefed = 0
            for sig in results:
                if briefed >= brief_top:
                    break
                if sig.is_buy and not sig.error:
                    sig.ai_brief = self.briefer.brief(sig.as_dict())
                    briefed += 1
        return results

    # ------------------------------------------------------------------ #
    def scan_ticker(self, ticker: str) -> TickerSignal:
        df = self._fetch(ticker)
        if len(df) < self.config.lookback_length + 2:
            return TickerSignal(
                ticker=ticker, asof=_now_iso(),
                error=f"only {len(df)} bars (need > {self.config.lookback_length})",
            )

        price = float(df["close"].iloc[-1])
        eq1 = self._evaluate(df, 1)
        eq2 = self._evaluate(df, 2)
        rec, conviction, agree = self._combine(eq1, eq2)

        # Actionable levels (per-ticker position cap on the configured account).
        pct = self.config.position_pct_for(ticker)
        entry = price
        stop = entry * (1 - self.config.stop_loss_pct / 100.0)
        target = entry * (1 + self.config.take_profit_pct / 100.0)
        budget = self.config.account_size * (pct / 100.0)
        shares = math.floor(budget / entry) if entry > 0 else 0

        return TickerSignal(
            ticker=ticker, price=price, recommendation=rec, conviction=conviction,
            agree=agree, entry=round(entry, 2), stop=round(stop, 2),
            target=round(target, 2), shares=shares, notional=round(shares * entry, 2),
            price_summary=self._price_summary(df), eq1=eq1, eq2=eq2, asof=_now_iso(),
        )

    # ------------------------------------------------------------------ #
    def _evaluate(self, df, equation_set: int) -> EquationView:
        """Run one equation to get the current stance + conviction + edge."""
        gen = SignalGenerator(
            equation_set=equation_set,
            lookback=self.config.lookback_length,
            signal_value=self.config.signal_value,
        )
        last = None
        fired_action = None       # action on the most recent bar
        position = "flat"         # 'long' after a BUY, 'flat' after a SELL
        for _, row in df.iterrows():
            res = gen.update({k: float(row[k]) for k in
                              ("open", "high", "low", "close", "volume")})
            last = res
            fired_action = res.action
            if res.action == "BUY":
                position = "long"
            elif res.action == "SELL":
                position = "flat"

        # Stance from the most recent bar's action, then the standing position.
        if fired_action == "BUY":
            stance, fresh = "BUY", True
        elif fired_action == "SELL":
            stance, fresh = "SELL", True
        elif position == "long":
            stance, fresh = "HOLD", False
        else:
            stance, fresh = "WAIT", False

        bv, sv = (last.buy_votes, last.sell_votes) if last else (0, 0)
        total = bv + sv
        conviction = (abs(bv - sv) / total * 100.0) if total else 0.0

        # Historical edge on this ticker (reuses the tested backtester).
        try:
            res = simulate(
                df, ticker="scan", equation_set=equation_set,
                lookback=self.config.lookback_length,
                signal_value=self.config.signal_value, interval=self.config.interval,
                position_pct=100.0,
            )
            rep = res.report
            edge_win, edge_ret, edge_n = (
                rep["win_rate"] * 100.0, rep["total_return_pct"], rep["trades"],
            )
        except Exception:
            edge_win = edge_ret = 0.0
            edge_n = 0

        return EquationView(
            stance=stance, fresh=fresh, conviction=round(conviction, 1),
            buy_votes=bv, sell_votes=sv, edge_win_rate=edge_win / 100.0,
            edge_return_pct=edge_ret, edge_trades=edge_n,
        )

    @staticmethod
    def _combine(eq1: EquationView, eq2: EquationView):
        stances = [eq1.stance, eq2.stance]
        fresh_buys = sum(1 for e in (eq1, eq2) if e.stance == "BUY")
        fresh_sells = sum(1 for e in (eq1, eq2) if e.stance == "SELL")
        buyish = [e for e in (eq1, eq2) if e.stance in ("BUY", "HOLD")]
        sellish = [e for e in (eq1, eq2) if e.stance == "SELL"]

        agree = (
            all(s in ("BUY", "HOLD") for s in stances)
            or all(s == "SELL" for s in stances)
        )

        if fresh_buys == 2:
            rec = "STRONG BUY"
        elif fresh_buys == 1 and fresh_sells == 0:
            rec = "BUY"
        elif fresh_sells == 2:
            rec = "STRONG SELL"
        elif fresh_sells == 1 and fresh_buys == 0:
            rec = "SELL"
        elif "HOLD" in stances:
            rec = "HOLD"
        else:
            rec = "WAIT"

        if rec in ("STRONG BUY", "BUY", "HOLD"):
            base = [e.conviction for e in buyish] or [0.0]
            conviction = sum(base) / len(base)
        elif rec in ("STRONG SELL", "SELL"):
            base = [e.conviction for e in sellish] or [0.0]
            conviction = sum(base) / len(base)
        else:
            conviction = 0.0
        if agree and rec not in ("WAIT",):
            conviction = min(100.0, conviction + 15.0)
        return rec, round(conviction, 1), agree

    # ------------------------------------------------------------------ #
    def _fetch(self, ticker):
        yf_interval = self.config.yf_interval
        now = datetime.now(timezone.utc)
        if yf_interval == "1m":
            start = now - timedelta(days=7)
        elif yf_interval in ("60m", "1h"):
            start = now - timedelta(days=59)
        else:
            days = int(self.config.edge_years * 365) + 30
            start = now - timedelta(days=days)
        return fetch_history_yf(ticker, yf_interval, start.strftime("%Y-%m-%d"))

    @staticmethod
    def _price_summary(df) -> str:
        closes = df["close"]
        last = float(closes.iloc[-1])

        def chg(n):
            if len(closes) > n:
                prev = float(closes.iloc[-1 - n])
                return (last / prev - 1.0) * 100.0 if prev else 0.0
            return 0.0

        return (f"last {last:.2f}; "
                f"{chg(1):+.1f}% 1-bar, {chg(5):+.1f}% 5-bar, {chg(20):+.1f}% 20-bar")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
