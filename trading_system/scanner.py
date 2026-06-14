"""
scanner.py
==========

The signal engine for **signals-only** mode (no broker, no orders).

For every configured ticker it:

1. pulls history (yfinance, cached briefly),
2. runs BOTH equation sets bar-by-bar to get the current stance + a conviction
   score derived from the buy/sell vote margin,
3. combines them into one recommendation (STRONG BUY when both agree),
4. computes specific, actionable economics — entry, stop, target, exact share
   count, dollar cost, dollar risk, dollar reward, risk/reward, and a historical
   expected value — plus a plain step-by-step trade plan, and
5. backtests each equation on that ticker for its edge (win rate, avg win/loss,
   drawdown, Sharpe, profit factor).

``Scanner.detail()`` returns the deeper per-ticker payload (price series with
buy/sell markers, equity curve, full stats, signal history) used by the web UI's
detail page.

Honesty: "projected profit" / "expected value" are arithmetic from the displayed
levels and the strategy's *historical* win rate — estimates, not guarantees.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import numpy as np

from backtest import simulate
from data import fetch_history_yf
from signals import SignalGenerator, generate_signals

log = logging.getLogger("scanner")


def _rsi14(closes, period: int = 14) -> float:
    """Textbook Wilder RSI on chronological closes (context display only)."""
    closes = np.asarray(closes, dtype=float)
    if len(closes) <= period:
        return 50.0
    d = np.diff(closes)
    up = np.clip(d, 0, None)
    dn = -np.clip(d, None, 0)
    ru, rd = up[:period].mean(), dn[:period].mean()
    for i in range(period, len(d)):
        ru = (ru * (period - 1) + up[i]) / period
        rd = (rd * (period - 1) + dn[i]) / period
    if rd == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + ru / rd)

_REC_RANK = {
    "STRONG BUY": 5, "BUY": 4, "HOLD": 3, "WAIT": 2, "SELL": 1, "STRONG SELL": 0,
}


@dataclass
class EquationView:
    stance: str
    fresh: bool
    conviction: float
    buy_votes: int
    sell_votes: int
    edge_win_rate: float
    edge_return_pct: float
    edge_trades: int
    avg_win: float = 0.0
    avg_loss: float = 0.0
    max_dd_pct: float = 0.0
    sharpe: float = 0.0
    profit_factor: float = 0.0


@dataclass
class TickerSignal:
    ticker: str
    sector: str = "Other"
    price: float = 0.0
    recommendation: str = "WAIT"
    conviction: float = 0.0
    agree: bool = False
    entry: float = 0.0
    stop: float = 0.0
    target: float = 0.0
    shares: int = 0
    notional: float = 0.0
    # economics
    cost: float = 0.0
    risk_dollars: float = 0.0
    reward_dollars: float = 0.0
    risk_pct: float = 0.0
    reward_pct: float = 0.0
    risk_reward: float = 0.0
    ev_dollars: float = 0.0
    ev_pct: float = 0.0
    plan: List[str] = field(default_factory=list)
    price_summary: str = ""
    # context indicators (depth / "why")
    trend: str = ""
    rsi: float = 50.0
    momentum: float = 0.0
    vol_note: str = ""
    change_pct: float = 0.0
    spark: List[float] = field(default_factory=list)
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

    def as_dict(self) -> Dict:
        d = {
            "ticker": self.ticker, "sector": self.sector, "price": self.price,
            "recommendation": self.recommendation, "conviction": self.conviction,
            "agree": self.agree, "entry": self.entry, "stop": self.stop,
            "target": self.target, "shares": self.shares, "notional": self.notional,
            "cost": self.cost, "risk_dollars": self.risk_dollars,
            "reward_dollars": self.reward_dollars, "risk_pct": self.risk_pct,
            "reward_pct": self.reward_pct, "risk_reward": self.risk_reward,
            "ev_dollars": self.ev_dollars, "ev_pct": self.ev_pct, "plan": self.plan,
            "price_summary": self.price_summary, "equation_summary": self.equation_summary,
            "trend": self.trend, "rsi": self.rsi, "momentum": self.momentum,
            "vol_note": self.vol_note, "change_pct": self.change_pct, "spark": self.spark,
            "ai_brief": self.ai_brief, "error": self.error, "asof": self.asof,
        }
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
        self._df_cache: Dict[str, tuple[float, object]] = {}
        self._df_ttl = 300  # seconds

    # ------------------------------------------------------------------ #
    def scan(self, brief_top: int = 3) -> List[TickerSignal]:
        from concurrent.futures import ThreadPoolExecutor

        def one(ticker):
            try:
                return self.scan_ticker(ticker)
            except Exception as exc:
                log.warning("scan failed for %s: %s", ticker, exc)
                return TickerSignal(ticker=ticker, sector=self.config.sector_for(ticker),
                                    error=str(exc), asof=_now_iso())

        workers = max(1, min(self.config.scan_workers, len(self.config.tickers) or 1))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(one, self.config.tickers))

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
        sector = self.config.sector_for(ticker)
        df = self._fetch(ticker)
        if len(df) < self.config.lookback_length + 2:
            return TickerSignal(
                ticker=ticker, sector=sector, asof=_now_iso(),
                error=f"only {len(df)} bars (need > {self.config.lookback_length})",
            )

        price = float(df["close"].iloc[-1])
        eq1 = self._evaluate(df, 1)
        eq2 = self._evaluate(df, 2)
        rec, conviction, agree = self._combine(eq1, eq2)

        pct = self.config.position_pct_for(ticker)
        entry = price
        stop = entry * (1 - self.config.stop_loss_pct / 100.0)
        target = entry * (1 + self.config.take_profit_pct / 100.0)
        budget = self.config.account_size * (pct / 100.0)
        shares = math.floor(budget / entry) if entry > 0 else 0

        cost = shares * entry
        risk_dollars = shares * (entry - stop)
        reward_dollars = shares * (target - entry)
        risk_reward = (reward_dollars / risk_dollars) if risk_dollars > 0 else 0.0

        # Expected value using the buy-aligned equations' historical win rate.
        buyish = [e for e in (eq1, eq2) if e.stance in ("BUY", "HOLD")]
        win = (sum(e.edge_win_rate for e in buyish) / len(buyish)) if buyish else 0.0
        ev_dollars = win * reward_dollars - (1 - win) * risk_dollars
        ev_pct = (ev_dollars / cost * 100.0) if cost > 0 else 0.0

        sig = TickerSignal(
            ticker=ticker, sector=sector, price=round(price, 2), recommendation=rec,
            conviction=conviction, agree=agree, entry=round(entry, 2),
            stop=round(stop, 2), target=round(target, 2), shares=shares,
            notional=round(cost, 2), cost=round(cost, 2),
            risk_dollars=round(risk_dollars, 2), reward_dollars=round(reward_dollars, 2),
            risk_pct=self.config.stop_loss_pct, reward_pct=self.config.take_profit_pct,
            risk_reward=round(risk_reward, 2), ev_dollars=round(ev_dollars, 2),
            ev_pct=round(ev_pct, 2), price_summary=self._price_summary(df),
            eq1=eq1, eq2=eq2, asof=_now_iso(),
        )
        ctx = self._context(df)
        sig.trend = ctx["trend"]
        sig.rsi = ctx["rsi"]
        sig.momentum = ctx["momentum"]
        sig.vol_note = ctx["vol_note"]
        sig.change_pct = ctx["change_pct"]
        sig.spark = ctx["spark"]
        sig.plan = self._build_plan(sig)
        return sig

    # ------------------------------------------------------------------ #
    def detail(self, ticker: str, equation_set: int = 1) -> Dict:
        """Deep per-ticker payload for the web detail page."""
        sig = self.scan_ticker(ticker)
        df = self._fetch(ticker)
        if sig.error or len(df) < self.config.lookback_length + 2:
            return {"ticker": ticker, "error": sig.error or "not enough data"}

        fmt = "%Y-%m-%d" if self.config.interval == "1d" else "%m-%d %H:%M"

        # Price chart window (recent bars) with buy/sell markers.
        window = df.tail(400)
        labels = [d.strftime(fmt) for d in window.index]
        prices = [round(float(x), 2) for x in window["close"]]
        actions, _ = generate_signals(
            df, equation_set=equation_set,
            lookback=self.config.lookback_length, signal_value=self.config.signal_value,
        )
        pos = {d: i for i, d in enumerate(window.index)}
        buys = [None] * len(window)
        sells = [None] * len(window)
        history = []
        for ts, act, px in actions:
            history.append({"date": ts.strftime(fmt), "action": act, "price": round(px, 2)})
            if ts in pos:
                (buys if act == "BUY" else sells)[pos[ts]] = round(px, 2)

        # Equity curve + full stats for the chosen equation.
        res = simulate(
            df, ticker=ticker, equation_set=equation_set,
            lookback=self.config.lookback_length, signal_value=self.config.signal_value,
            interval=self.config.interval, position_pct=100.0,
            stop_loss_pct=self.config.stop_loss_pct,
            take_profit_pct=self.config.take_profit_pct,
        )
        eq = res.equity
        stride = max(1, len(eq) // 400)
        eq_labels = [d.strftime(fmt) for d in eq.index[::stride]]
        eq_values = [round(float(v), 2) for v in eq.values[::stride]]
        rep = res.report

        view = sig.eq1 if equation_set == 1 else sig.eq2
        return {
            "ticker": ticker, "sector": sig.sector,
            "equation_set": equation_set, "error": None,
            "recommendation": sig.recommendation, "conviction": sig.conviction,
            "agree": sig.agree, "price": sig.price, "entry": sig.entry,
            "stop": sig.stop, "target": sig.target, "shares": sig.shares,
            "cost": sig.cost, "risk_dollars": sig.risk_dollars,
            "reward_dollars": sig.reward_dollars, "risk_reward": sig.risk_reward,
            "ev_dollars": sig.ev_dollars, "ev_pct": sig.ev_pct,
            "risk_pct": sig.risk_pct, "reward_pct": sig.reward_pct,
            "plan": sig.plan, "price_summary": sig.price_summary,
            "stance": view.stance if view else "?",
            "chart": {"labels": labels, "price": prices, "buys": buys, "sells": sells},
            "equity": {"labels": eq_labels, "values": eq_values},
            "stats": {
                "win_rate": rep["win_rate"], "return_pct": rep["total_return_pct"],
                "trades": rep["trades"], "avg_win": rep["avg_win"],
                "avg_loss": rep["avg_loss"], "max_dd_pct": rep["largest_drawdown_pct"],
                "sharpe": rep["sharpe"], "profit_factor": rep["profit_factor"],
                "largest_win": rep["largest_win"], "largest_loss": rep["largest_loss"],
            },
            "history": history[-15:][::-1],
            "asof": sig.asof,
        }

    # ------------------------------------------------------------------ #
    def _evaluate(self, df, equation_set: int) -> EquationView:
        gen = SignalGenerator(
            equation_set=equation_set, lookback=self.config.lookback_length,
            signal_value=self.config.signal_value,
        )
        last = None
        fired_action = None
        position = "flat"
        for _, row in df.iterrows():
            res = gen.update({k: float(row[k]) for k in
                              ("open", "high", "low", "close", "volume")})
            last = res
            fired_action = res.action
            if res.action == "BUY":
                position = "long"
            elif res.action == "SELL":
                position = "flat"

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

        # Edge = the Pine Script's OWN win/trade accounting (its native, central
        # measure of success) — also far faster than a full portfolio backtest,
        # which is what makes a large universe practical. The detail page still
        # runs the full backtest for return/drawdown/Sharpe + the equity curve.
        win_rate = (gen.wins / gen.trades) if gen.trades else 0.0
        return EquationView(
            stance=stance, fresh=fresh, conviction=round(conviction, 1),
            buy_votes=bv, sell_votes=sv, edge_win_rate=win_rate,
            edge_return_pct=0.0, edge_trades=gen.trades,
        )

    @staticmethod
    def _combine(eq1: EquationView, eq2: EquationView):
        stances = [eq1.stance, eq2.stance]
        fresh_buys = sum(1 for e in (eq1, eq2) if e.stance == "BUY")
        fresh_sells = sum(1 for e in (eq1, eq2) if e.stance == "SELL")
        buyish = [e for e in (eq1, eq2) if e.stance in ("BUY", "HOLD")]
        sellish = [e for e in (eq1, eq2) if e.stance == "SELL"]

        agree = (all(s in ("BUY", "HOLD") for s in stances)
                 or all(s == "SELL" for s in stances))

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
        if agree and rec != "WAIT":
            conviction = min(100.0, conviction + 15.0)
        return rec, round(conviction, 1), agree

    def _build_plan(self, s: TickerSignal) -> List[str]:
        t = s.ticker
        if s.recommendation in ("STRONG BUY", "BUY"):
            head = ("Strong setup — both equations agree."
                    if s.recommendation == "STRONG BUY" and s.agree else "Buy setup.")
            return [
                head,
                f"1. Buy {s.shares} shares of {t} at about ${s.entry:,.2f} "
                f"(market order) — roughly ${s.cost:,.2f} of capital.",
                f"2. Immediately set a stop-loss at ${s.stop:,.2f} (−{s.risk_pct:.1f}%). "
                f"This caps your loss at about ${s.risk_dollars:,.2f} if it goes against you.",
                f"3. Set a take-profit target at ${s.target:,.2f} (+{s.reward_pct:.1f}%). "
                f"That's about ${s.reward_dollars:,.2f} of profit if hit — "
                f"a {s.risk_reward:.1f}:1 reward-to-risk trade.",
                f"4. Hold until the system flips to SELL or your stop/target triggers. "
                f"Re-run the scan each {self.config.interval} bar to check.",
            ]
        if s.recommendation == "HOLD":
            return [
                f"{t} already triggered a BUY on an earlier bar — this is NOT a fresh entry.",
                f"1. If you already hold {t}, keep a stop near ${s.stop:,.2f} and a "
                f"target near ${s.target:,.2f}.",
                "2. If you're not in it yet, wait for the next fresh BUY rather than chasing.",
                "3. Watch for the system to flip to SELL.",
            ]
        if s.recommendation in ("SELL", "STRONG SELL"):
            return [
                f"{t} is flashing a SELL (exit) signal.",
                f"1. If you hold {t}, consider closing the position around ${s.entry:,.2f}.",
                "2. If you don't hold it, there's nothing to do — this is an exit, not a short.",
            ]
        return [
            f"No action on {t} right now — the signal is neutral (WAIT).",
            "1. Don't enter yet; wait for a fresh BUY with rising conviction.",
            "2. Re-check on the next scan.",
        ]

    # ------------------------------------------------------------------ #
    def _fetch(self, ticker):
        cached = self._df_cache.get(ticker)
        if cached and (time.time() - cached[0]) < self._df_ttl:
            return cached[1]
        yf_interval = self.config.yf_interval
        now = datetime.now(timezone.utc)
        if yf_interval == "1m":
            start = now - timedelta(days=7)
        elif yf_interval in ("60m", "1h"):
            start = now - timedelta(days=59)
        else:
            start = now - timedelta(days=int(self.config.edge_years * 365) + 30)
        df = fetch_history_yf(ticker, yf_interval, start.strftime("%Y-%m-%d"))
        self._df_cache[ticker] = (time.time(), df)
        return df

    @staticmethod
    def _context(df) -> Dict:
        """Cheap supporting indicators shown for depth (don't change the signal)."""
        closes = df["close"].to_numpy(dtype=float)
        vols = df["volume"].to_numpy(dtype=float)
        last = float(closes[-1])
        sma50 = float(closes[-50:].mean()) if len(closes) >= 50 else float(closes.mean())
        v20 = float(vols[-20:].mean()) if len(vols) >= 20 else float(vols.mean())
        return {
            "trend": "Uptrend" if last >= sma50 else "Downtrend",
            "rsi": round(_rsi14(closes), 0),
            "momentum": round((last / closes[-11] - 1) * 100, 1) if len(closes) > 11 else 0.0,
            "vol_note": "Above avg" if (len(vols) and vols[-1] > v20) else "Below avg",
            "change_pct": round((last / closes[-21] - 1) * 100, 1) if len(closes) > 21 else 0.0,
            "spark": [round(float(x), 2) for x in closes[-32:]],
        }

    @staticmethod
    def _price_summary(df) -> str:
        closes = df["close"]
        last = float(closes.iloc[-1])

        def chg(n):
            if len(closes) > n:
                prev = float(closes.iloc[-1 - n])
                return (last / prev - 1.0) * 100.0 if prev else 0.0
            return 0.0

        return (f"last {last:.2f}; {chg(1):+.1f}% 1-bar, "
                f"{chg(5):+.1f}% 5-bar, {chg(20):+.1f}% 20-bar")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
