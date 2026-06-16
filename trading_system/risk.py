"""
risk.py
=======

The risk-management layer. Every order the engine wants to place is gated
through here first.  It enforces:

* **Max position size** -- a position can use at most ``MAX_POSITION_PCT`` of
  total portfolio value (and never more than available buying power).
* **Stop loss / take profit** -- computed for every entry and checked on every
  loop against the latest price.
* **Max concurrent positions** -- caps how many tickers can be open at once.
* **Max daily loss** -- if the account's equity drops ``MAX_DAILY_LOSS_PCT``
  below the day's starting equity, new entries halt for the rest of the day.
* **Kill switch** -- an environment variable that, when truthy, signals the
  engine to cancel orders and flatten everything immediately.

The day boundary uses US/Eastern (the equities trading day) when available.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

try:
    from zoneinfo import ZoneInfo
    _EASTERN = ZoneInfo("America/New_York")
except Exception:  # pragma: no cover - fall back to UTC if tzdata missing
    _EASTERN = timezone.utc


@dataclass
class SizingDecision:
    allowed: bool
    qty: float
    reason: str


def _attr(obj, key, default=None):
    """Read ``key`` from a dict or an object (works for TickerSignal or its dict)."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def market_regime(signals) -> dict:
    """A 0..1 market-health score from a set of signals (breadth + trend + conviction).

    ~0.2 = broadly risk-off (few names in uptrend), ~1.0 = risk-on. Used to scale
    the dynamic position cap and to drive the Auto-Tune preset. Pure function of
    data the scanner already produces — no extra network calls.
    """
    sigs = [s for s in (signals or []) if not _attr(s, "error")]
    n = len(sigs)
    if n == 0:
        return {"score": 0.5, "label": "Neutral", "breadth": 0.0,
                "uptrend_frac": 0.0, "avg_conviction": 0.0, "n": 0, "buys": 0}
    buys = [s for s in sigs if _attr(s, "recommendation") in ("BUY", "STRONG BUY")]
    breadth = len(buys) / n
    uptrend_frac = sum(1 for s in sigs if _attr(s, "trend") == "Uptrend") / n
    avg_conv = (sum(float(_attr(s, "conviction", 0.0)) for s in buys) / len(buys) / 100.0
                ) if buys else 0.0
    score = 0.20 + 0.60 * uptrend_frac + 0.15 * min(1.0, breadth * 5.0) + 0.05 * avg_conv
    score = max(0.15, min(1.0, score))
    label = "Risk-on" if score >= 0.70 else ("Risk-off" if score < 0.45 else "Neutral")
    return {"score": round(score, 3), "label": label, "breadth": round(breadth, 3),
            "uptrend_frac": round(uptrend_frac, 3), "avg_conviction": round(avg_conv, 3),
            "n": n, "buys": len(buys)}


class RiskManager:
    def __init__(self, config):
        self.config = config
        self.fractional = config.broker == "coinbase"  # crypto allows fractional
        self._day = None
        self.start_of_day_equity: Optional[float] = None
        self.halted_today = False

    # ------------------------------------------------------------------ #
    # Daily bookkeeping
    # ------------------------------------------------------------------ #
    @staticmethod
    def _today() -> str:
        return datetime.now(_EASTERN).strftime("%Y-%m-%d")

    def roll_day(self, current_equity: float) -> None:
        """Reset the daily baseline if the trading day has changed."""
        today = self._today()
        if self._day != today:
            self._day = today
            self.start_of_day_equity = current_equity
            self.halted_today = False

    # ------------------------------------------------------------------ #
    # Kill switch
    # ------------------------------------------------------------------ #
    def kill_switch_active(self) -> bool:
        return self.config.kill_switch

    # ------------------------------------------------------------------ #
    # Daily loss limit
    # ------------------------------------------------------------------ #
    def daily_loss_breached(self, current_equity: float) -> bool:
        """True once equity has fallen past the daily-loss threshold today."""
        if self.start_of_day_equity is None or self.start_of_day_equity <= 0:
            return False
        change_pct = (current_equity - self.start_of_day_equity) / self.start_of_day_equity * 100.0
        if change_pct <= -abs(self.config.max_daily_loss_pct):
            self.halted_today = True
        return self.halted_today

    # ------------------------------------------------------------------ #
    # Position sizing
    # ------------------------------------------------------------------ #
    def size_position(
        self, price: float, equity: float, buying_power: float,
        max_pct: float | None = None,
    ) -> SizingDecision:
        """How many units to buy, respecting max position % and buying power.

        ``max_pct`` overrides the global cap (used for per-ticker limits).
        """
        if price <= 0:
            return SizingDecision(False, 0.0, "invalid price")

        pct = self.config.max_position_pct if max_pct is None else max_pct
        max_dollars = equity * (pct / 100.0)
        spend = min(max_dollars, buying_power)
        if spend <= 0:
            return SizingDecision(False, 0.0, "no buying power available")

        raw_qty = spend / price
        qty = raw_qty if self.fractional else math.floor(raw_qty)
        if qty <= 0:
            return SizingDecision(
                False, 0.0,
                f"position cap (${max_dollars:,.2f}) too small for 1 share @ ${price:,.2f}",
            )
        return SizingDecision(True, float(qty), "ok")

    # ------------------------------------------------------------------ #
    # Concurrency
    # ------------------------------------------------------------------ #
    def dynamic_position_cap(self, equity: float, regime_score: float) -> int:
        """Variable max-open-positions from account size + market regime.

        Bounded three ways and takes the tightest:
        * **capacity**  — how many positions fit by % sizing (never > 100% deployed)
        * **affordable** — equity / MIN_POSITION_USD (a small account holds fewer)
        * **regime**    — capacity scaled by a 0..1 market-health score (risk-off
                          markets hold fewer; risk-on holds more)
        """
        pct = max(1.0, self.config.max_position_pct)
        capacity = max(1, int(100 // pct))
        affordable = capacity
        if equity and equity > 0 and self.config.min_position_usd > 0:
            affordable = max(1, int(equity // self.config.min_position_usd))
        # Capital (capacity + affordability) sets the ceiling; the market regime only
        # MODULATES it (50%..100% of capacity) so you still hold plenty in a neutral
        # tape and fewer only when it's genuinely risk-off.
        regime_cap = max(1, round(capacity * (0.5 + 0.5 * float(regime_score))))
        return max(1, min(capacity, affordable, regime_cap))

    def effective_position_cap(self, equity: Optional[float] = None,
                               regime_score: Optional[float] = None) -> int:
        """The cap in force right now: dynamic when enabled + context given, else fixed."""
        if (self.config.dynamic_positions and equity is not None
                and regime_score is not None):
            return self.dynamic_position_cap(equity, regime_score)
        return self.config.max_open_positions

    def can_open_new(self, open_position_count: int, equity: Optional[float] = None,
                     regime_score: Optional[float] = None) -> tuple[bool, str]:
        cap = self.effective_position_cap(equity, regime_score)
        if open_position_count >= cap:
            return False, f"max open positions reached ({open_position_count}/{cap})"
        return True, "ok"

    # ------------------------------------------------------------------ #
    # Stops / take-profits
    # ------------------------------------------------------------------ #
    def stop_price(self, entry: float, side: str = "long") -> float:
        pct = self.config.stop_loss_pct / 100.0
        return entry * (1 - pct) if side == "long" else entry * (1 + pct)

    def take_profit_price(self, entry: float, side: str = "long") -> float:
        pct = self.config.take_profit_pct / 100.0
        return entry * (1 + pct) if side == "long" else entry * (1 - pct)

    # -- ATR-adaptive (volatility-based) variants -------------------------- #
    def atr_stop_price(self, entry: float, atr: float) -> float:
        return entry - atr * self.config.atr_stop_mult

    def atr_take_profit_price(self, entry: float, atr: float) -> float:
        return entry + atr * self.config.atr_target_mult

    def size_position_atr(self, entry: float, atr: float, equity: float,
                          buying_power: float) -> SizingDecision:
        """Volatility-normalised sizing: risk ATR_RISK_PCT of equity per trade,
        with the ATR-based stop distance setting the share count (capped by the
        max position % and buying power)."""
        risk_per_share = atr * self.config.atr_stop_mult
        if entry <= 0 or risk_per_share <= 0:
            return SizingDecision(False, 0.0, "no ATR / price")
        risk_budget = equity * (self.config.atr_risk_pct / 100.0)
        qty_by_risk = risk_budget / risk_per_share
        max_dollars = min(equity * (self.config.max_position_pct / 100.0), buying_power)
        qty_by_cap = (max_dollars / entry) if max_dollars > 0 else 0.0
        qty = min(qty_by_risk, qty_by_cap)
        qty = qty if self.fractional else math.floor(qty)
        if qty <= 0:
            return SizingDecision(False, 0.0, "position too small for ATR risk")
        return SizingDecision(True, float(qty), "atr")

    def exit_reason(
        self, entry: float, current_price: float, side: str = "long"
    ) -> Optional[str]:
        """Return 'stop' / 'take_profit' if a protective level is hit."""
        stop = self.stop_price(entry, side)
        target = self.take_profit_price(entry, side)
        if side == "long":
            if current_price <= stop:
                return "stop"
            if current_price >= target:
                return "take_profit"
        else:
            if current_price >= stop:
                return "stop"
            if current_price <= target:
                return "take_profit"
        return None
