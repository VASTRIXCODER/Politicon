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
    def can_open_new(self, open_position_count: int) -> tuple[bool, str]:
        if open_position_count >= self.config.max_open_positions:
            return False, (
                f"max open positions reached "
                f"({open_position_count}/{self.config.max_open_positions})"
            )
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
