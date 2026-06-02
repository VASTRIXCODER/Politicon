"""
database.py
===========

Local SQLite store for every trade the system takes, plus the performance
analytics derived from it.

Only the Python standard library (``sqlite3``) is used, so there is no extra
dependency and the database is a single portable file (``trades.db`` by
default).

Each *trade* is one round trip: an entry (BUY) and the matching exit (SELL /
stop / take-profit).  Open trades have ``status = 'open'`` and ``NULL`` exit
fields until they are closed.
"""

from __future__ import annotations

import math
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Dict, List, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker             TEXT    NOT NULL,
    side               TEXT    NOT NULL DEFAULT 'long',
    equation_set       INTEGER NOT NULL,
    qty                REAL    NOT NULL,
    entry_time         TEXT    NOT NULL,
    entry_price        REAL    NOT NULL,
    stop_price         REAL,
    take_profit_price  REAL,
    exit_time          TEXT,
    exit_price         REAL,
    pnl_dollars        REAL,
    pnl_pct            REAL,
    status             TEXT    NOT NULL DEFAULT 'open',
    exit_reason        TEXT,
    broker_order_id    TEXT,
    notes              TEXT
);
CREATE INDEX IF NOT EXISTS idx_trades_status  ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_ticker  ON trades(ticker);
CREATE INDEX IF NOT EXISTS idx_trades_exit    ON trades(exit_time);
"""


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    """Thin wrapper around a SQLite trade log."""

    def __init__(self, path: str):
        self.path = path
        self._init_schema()

    # ------------------------------------------------------------------ #
    # Connection plumbing
    # ------------------------------------------------------------------ #
    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._conn() as conn:
            conn.executescript(SCHEMA)

    # ------------------------------------------------------------------ #
    # Writes
    # ------------------------------------------------------------------ #
    def record_entry(
        self,
        *,
        ticker: str,
        equation_set: int,
        qty: float,
        entry_price: float,
        stop_price: Optional[float] = None,
        take_profit_price: Optional[float] = None,
        side: str = "long",
        entry_time: Optional[str] = None,
        broker_order_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> int:
        """Insert a new open trade; returns its row id."""
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO trades
                    (ticker, side, equation_set, qty, entry_time, entry_price,
                     stop_price, take_profit_price, status, broker_order_id, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (
                    ticker, side, equation_set, qty,
                    entry_time or _utcnow_iso(), entry_price,
                    stop_price, take_profit_price, broker_order_id, notes,
                ),
            )
            return int(cur.lastrowid)

    def record_exit(
        self,
        trade_id: int,
        *,
        exit_price: float,
        exit_reason: str,
        exit_time: Optional[str] = None,
    ) -> Optional[sqlite3.Row]:
        """Close an open trade and compute realised PnL."""
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM trades WHERE id = ?", (trade_id,)).fetchone()
            if row is None or row["status"] == "closed":
                return None

            entry = row["entry_price"]
            qty = row["qty"]
            direction = 1 if row["side"] == "long" else -1
            pnl_dollars = (exit_price - entry) * qty * direction
            pnl_pct = ((exit_price - entry) / entry * 100.0 * direction) if entry else 0.0

            conn.execute(
                """
                UPDATE trades
                   SET exit_time = ?, exit_price = ?, pnl_dollars = ?, pnl_pct = ?,
                       status = 'closed', exit_reason = ?
                 WHERE id = ?
                """,
                (exit_time or _utcnow_iso(), exit_price, pnl_dollars, pnl_pct,
                 exit_reason, trade_id),
            )
            return conn.execute("SELECT * FROM trades WHERE id = ?", (trade_id,)).fetchone()

    # ------------------------------------------------------------------ #
    # Reads
    # ------------------------------------------------------------------ #
    def _query(self, sql: str, params: tuple = ()) -> List[sqlite3.Row]:
        with self._conn() as conn:
            return conn.execute(sql, params).fetchall()

    def get_open_trades(self) -> List[sqlite3.Row]:
        return self._query("SELECT * FROM trades WHERE status = 'open' ORDER BY entry_time")

    def get_open_trade(self, ticker: str) -> Optional[sqlite3.Row]:
        rows = self._query(
            "SELECT * FROM trades WHERE status = 'open' AND ticker = ? "
            "ORDER BY entry_time DESC LIMIT 1",
            (ticker,),
        )
        return rows[0] if rows else None

    def get_closed_trades(self, since_iso: Optional[str] = None) -> List[sqlite3.Row]:
        if since_iso:
            return self._query(
                "SELECT * FROM trades WHERE status = 'closed' AND exit_time >= ? "
                "ORDER BY exit_time",
                (since_iso,),
            )
        return self._query(
            "SELECT * FROM trades WHERE status = 'closed' ORDER BY exit_time"
        )

    def get_today_closed_trades(self) -> List[sqlite3.Row]:
        start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
        return self.get_closed_trades(since_iso=start)

    # ------------------------------------------------------------------ #
    # Analytics
    # ------------------------------------------------------------------ #
    def realized_pnl_today(self) -> float:
        rows = self.get_today_closed_trades()
        return float(sum((r["pnl_dollars"] or 0.0) for r in rows))

    def performance_report(
        self,
        since_iso: Optional[str] = None,
        starting_equity: float = 100_000.0,
    ) -> Dict:
        """Aggregate stats over closed trades.

        ``starting_equity`` is only used to express the drawdown as a percentage;
        pass your account's starting value for an accurate figure.
        """
        trades = self.get_closed_trades(since_iso)
        report = _empty_report()
        report["starting_equity"] = starting_equity
        if not trades:
            return report

        pnls = [t["pnl_dollars"] or 0.0 for t in trades]
        pcts = [(t["pnl_pct"] or 0.0) / 100.0 for t in trades]  # as fractions
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]

        report["trades"] = len(trades)
        report["wins"] = len(wins)
        report["losses"] = len(losses)
        report["win_rate"] = len(wins) / len(trades)
        report["total_pnl"] = sum(pnls)
        report["total_return_pct"] = (sum(pnls) / starting_equity * 100.0) if starting_equity else 0.0
        report["avg_win"] = (sum(wins) / len(wins)) if wins else 0.0
        report["avg_loss"] = (sum(losses) / len(losses)) if losses else 0.0
        report["largest_win"] = max(pnls) if pnls else 0.0
        report["largest_loss"] = min(pnls) if pnls else 0.0
        report["profit_factor"] = (
            sum(wins) / abs(sum(losses)) if losses else math.inf if wins else 0.0
        )

        # Equity curve from realised PnL -> max drawdown.
        equity = starting_equity
        peak = starting_equity
        max_dd_dollars = 0.0
        max_dd_pct = 0.0
        for p in pnls:
            equity += p
            peak = max(peak, equity)
            dd = peak - equity
            if dd > max_dd_dollars:
                max_dd_dollars = dd
            if peak > 0 and (dd / peak) > max_dd_pct:
                max_dd_pct = dd / peak
        report["largest_drawdown_dollars"] = max_dd_dollars
        report["largest_drawdown_pct"] = max_dd_pct * 100.0

        # Sharpe ratio from per-trade returns (annualised with a rough estimate
        # of trades-per-year derived from the actual trade span).
        report["sharpe"] = _sharpe_from_trade_returns(pcts, trades)
        return report


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _empty_report() -> Dict:
    return {
        "trades": 0, "wins": 0, "losses": 0, "win_rate": 0.0,
        "total_pnl": 0.0, "total_return_pct": 0.0,
        "avg_win": 0.0, "avg_loss": 0.0,
        "largest_win": 0.0, "largest_loss": 0.0,
        "largest_drawdown_dollars": 0.0, "largest_drawdown_pct": 0.0,
        "profit_factor": 0.0, "sharpe": 0.0, "starting_equity": 0.0,
    }


def _sharpe_from_trade_returns(returns: List[float], trades: List) -> float:
    """Annualised Sharpe of per-trade returns (risk-free rate assumed 0)."""
    n = len(returns)
    if n < 2:
        return 0.0
    mean = sum(returns) / n
    var = sum((r - mean) ** 2 for r in returns) / (n - 1)
    std = math.sqrt(var)
    if std == 0:
        return 0.0

    # Estimate trades-per-year from the span between first and last exit.
    trades_per_year = n
    try:
        first = datetime.fromisoformat(trades[0]["exit_time"])
        last = datetime.fromisoformat(trades[-1]["exit_time"])
        days = max((last - first).total_seconds() / 86400.0, 1e-9)
        if days >= 1:
            trades_per_year = n / days * 365.0
    except Exception:
        pass

    return (mean / std) * math.sqrt(max(trades_per_year, 1.0))
