"""
backtest.py
===========

Event-driven backtester for the extracted strategy.

It replays historical bars (via yfinance) through the same
:class:`signals.SignalGenerator` used live, simulates a long-only alternating
portfolio with the configured risk controls (position sizing, stop-loss,
take-profit), and produces:

* a full performance report (win rate, total return, avg win/loss, largest win,
  largest drawdown, Sharpe), plus
* the indicator's own Wins / Trades / Win-Loss figures, matching the table in
  the original Pine Script, and
* an equity-curve PNG rendered with matplotlib.

Use it to validate the logic before risking anything live::

    python main.py backtest --ticker AAPL --start 2022-01-01 --equation both
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional

import pandas as pd

from data import fetch_history_yf
from signals import SignalGenerator

# Approx bars per year for Sharpe annualisation, by trading interval.
_PERIODS_PER_YEAR = {"1d": 252, "1h": 252 * 7, "1m": 252 * 390}


@dataclass
class SimTrade:
    entry_time: object
    entry_price: float
    qty: float
    exit_time: object = None
    exit_price: float = 0.0
    exit_reason: str = ""
    equation_set: int = 1

    @property
    def pnl_dollars(self) -> float:
        return (self.exit_price - self.entry_price) * self.qty

    @property
    def pnl_pct(self) -> float:
        return (self.exit_price / self.entry_price - 1.0) * 100.0 if self.entry_price else 0.0


@dataclass
class BacktestResult:
    ticker: str
    equation_set: int
    interval: str
    trades: List[SimTrade] = field(default_factory=list)
    equity: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    indicator_wins: int = 0
    indicator_trades: int = 0
    report: dict = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Simulation
# --------------------------------------------------------------------------- #
def simulate(
    df: pd.DataFrame,
    *,
    ticker: str,
    equation_set: int,
    lookback: int,
    signal_value: int = 2,
    interval: str = "1d",
    initial_cash: float = 100_000.0,
    position_pct: float = 100.0,
    stop_loss_pct: Optional[float] = None,
    take_profit_pct: Optional[float] = None,
    start_timestamp=None,
) -> BacktestResult:
    """Run the strategy across ``df`` (chronological OHLCV) and return results."""
    gen = SignalGenerator(equation_set=equation_set, lookback=lookback,
                          signal_value=signal_value)

    cash = initial_cash
    qty = 0.0
    entry_price = 0.0
    stop = target = None
    open_trade: Optional[SimTrade] = None
    trades: List[SimTrade] = []
    equity_points = []

    def mark_to_market(price: float) -> float:
        return cash + qty * price

    for ts, row in df.iterrows():
        o, h, l, c, v = (float(row["open"]), float(row["high"]), float(row["low"]),
                         float(row["close"]), float(row["volume"]))
        can_plot = start_timestamp is None or ts > start_timestamp
        res = gen.update({"open": o, "high": h, "low": l, "close": c, "volume": v},
                         can_plot=can_plot)

        # --- intrabar protective exits (check before acting on signal) ---
        if open_trade is not None and (stop is not None or target is not None):
            exit_px = None
            reason = ""
            # Conservative: if a bar spans both, assume the stop triggers first.
            if stop is not None and l <= stop:
                exit_px, reason = stop, "stop"
            elif target is not None and h >= target:
                exit_px, reason = target, "take_profit"
            if exit_px is not None:
                cash += qty * exit_px
                open_trade.exit_time, open_trade.exit_price = ts, exit_px
                open_trade.exit_reason = reason
                trades.append(open_trade)
                open_trade, qty, entry_price, stop, target = None, 0.0, 0.0, None, None

        # --- signal-driven actions ---
        if res.action == "SELL" and open_trade is not None:
            cash += qty * c
            open_trade.exit_time, open_trade.exit_price = ts, c
            open_trade.exit_reason = "signal"
            trades.append(open_trade)
            open_trade, qty, entry_price, stop, target = None, 0.0, 0.0, None, None

        elif res.action == "BUY" and open_trade is None:
            spend = mark_to_market(c) * (position_pct / 100.0)
            spend = min(spend, cash)
            buy_qty = math.floor(spend / c) if c > 0 else 0
            if buy_qty > 0:
                qty = float(buy_qty)
                entry_price = c
                cash -= qty * c
                stop = entry_price * (1 - stop_loss_pct / 100.0) if stop_loss_pct else None
                target = entry_price * (1 + take_profit_pct / 100.0) if take_profit_pct else None
                open_trade = SimTrade(entry_time=ts, entry_price=entry_price, qty=qty,
                                      equation_set=equation_set)

        equity_points.append((ts, mark_to_market(c)))

    # Close any open position at the final close for reporting completeness.
    if open_trade is not None:
        last_ts, last_close = df.index[-1], float(df["close"].iloc[-1])
        cash += qty * last_close
        open_trade.exit_time, open_trade.exit_price = last_ts, last_close
        open_trade.exit_reason = "end_of_data"
        trades.append(open_trade)

    equity = pd.Series({ts: val for ts, val in equity_points})
    report = compute_report(equity, trades, interval, initial_cash)
    return BacktestResult(
        ticker=ticker, equation_set=equation_set, interval=interval,
        trades=trades, equity=equity,
        indicator_wins=gen.wins, indicator_trades=gen.trades, report=report,
    )


def compute_report(equity: pd.Series, trades: List[SimTrade], interval: str,
                   initial_cash: float) -> dict:
    pnls = [t.pnl_dollars for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    n = len(trades)

    # Max drawdown from the equity curve.
    max_dd_pct = 0.0
    max_dd_dollars = 0.0
    if len(equity):
        running_max = equity.cummax()
        dd = running_max - equity
        max_dd_dollars = float(dd.max())
        dd_pct = (dd / running_max).replace([float("inf")], 0).fillna(0)
        max_dd_pct = float(dd_pct.max()) * 100.0

    # Sharpe from periodic equity returns.
    sharpe = 0.0
    if len(equity) > 2:
        rets = equity.pct_change().dropna()
        if len(rets) > 1 and rets.std() > 0:
            ppy = _PERIODS_PER_YEAR.get(interval, 252)
            sharpe = float(rets.mean() / rets.std() * math.sqrt(ppy))

    final_equity = float(equity.iloc[-1]) if len(equity) else initial_cash
    return {
        "trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": (len(wins) / n) if n else 0.0,
        "total_pnl": float(sum(pnls)),
        "total_return_pct": (final_equity / initial_cash - 1.0) * 100.0,
        "avg_win": (sum(wins) / len(wins)) if wins else 0.0,
        "avg_loss": (sum(losses) / len(losses)) if losses else 0.0,
        "largest_win": max(pnls) if pnls else 0.0,
        "largest_loss": min(pnls) if pnls else 0.0,
        "largest_drawdown_pct": max_dd_pct,
        "largest_drawdown_dollars": max_dd_dollars,
        "profit_factor": (sum(wins) / abs(sum(losses))) if losses else (math.inf if wins else 0.0),
        "sharpe": sharpe,
        "final_equity": final_equity,
        "initial_cash": initial_cash,
    }


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def run_backtest(
    ticker: str,
    start: str,
    end: Optional[str] = None,
    equation_set=1,
    lookback: int = 100,
    signal_value: int = 2,
    interval: str = "1d",
    yf_interval: str = "1d",
    initial_cash: float = 100_000.0,
    position_pct: float = 100.0,
    stop_loss_pct: Optional[float] = None,
    take_profit_pct: Optional[float] = None,
    chart_path: Optional[str] = None,
) -> List[BacktestResult]:
    """Fetch history and backtest one or both equation sets.

    ``equation_set`` may be ``1``, ``2`` or ``"both"``.
    """
    df = fetch_history_yf(ticker, yf_interval, start, end)
    if len(df) < lookback + 2:
        raise SystemExit(
            f"Not enough data for {ticker}: got {len(df)} bars, need > {lookback}. "
            "Widen the date range or lower --lookback."
        )

    sets = [1, 2] if str(equation_set).lower() == "both" else [int(equation_set)]
    results = []
    for eq in sets:
        res = simulate(
            df, ticker=ticker, equation_set=eq, lookback=lookback,
            signal_value=signal_value, interval=interval, initial_cash=initial_cash,
            position_pct=position_pct, stop_loss_pct=stop_loss_pct,
            take_profit_pct=take_profit_pct,
        )
        results.append(res)
        print(format_report(res))

    plot_equity_curves(results, ticker, chart_path)
    return results


def format_report(res: BacktestResult) -> str:
    r = res.report
    win_loss = (res.indicator_wins / res.indicator_trades) if res.indicator_trades else 0.0
    lines = [
        "",
        f"===== Backtest: {res.ticker}  |  Equation set {res.equation_set}  |  {res.interval} =====",
        f"  Trades:            {r['trades']}",
        f"  Win rate:          {r['win_rate'] * 100:.1f}%   ({r['wins']}W / {r['losses']}L)",
        f"  Total return:      {r['total_return_pct']:+.2f}%   (${r['total_pnl']:,.2f})",
        f"  Final equity:      ${r['final_equity']:,.2f}  (from ${r['initial_cash']:,.2f})",
        f"  Avg win / loss:    ${r['avg_win']:,.2f} / ${r['avg_loss']:,.2f}",
        f"  Largest win/loss:  ${r['largest_win']:,.2f} / ${r['largest_loss']:,.2f}",
        f"  Max drawdown:      {r['largest_drawdown_pct']:.2f}%  (${r['largest_drawdown_dollars']:,.2f})",
        f"  Profit factor:     {r['profit_factor']:.2f}",
        f"  Sharpe (ann.):     {r['sharpe']:.2f}",
        "  --- indicator table (matches the Pine Script) ---",
        f"  Wins: {res.indicator_wins} | Trades: {res.indicator_trades} | "
        f"Win/Loss: {win_loss:.4f}",
    ]
    return "\n".join(lines)


def plot_equity_curves(results: List[BacktestResult], ticker: str,
                       chart_path: Optional[str]) -> str:
    # Imported lazily so the scanner / web dashboard don't require matplotlib.
    import matplotlib
    matplotlib.use("Agg")  # headless-safe
    import matplotlib.pyplot as plt

    chart_path = chart_path or f"backtest_{ticker}.png"
    plt.figure(figsize=(11, 6))
    for res in results:
        if len(res.equity):
            plt.plot(res.equity.index, res.equity.values,
                     label=f"Equation set {res.equation_set}")
    plt.title(f"Equity Curve -- {ticker}")
    plt.xlabel("Date")
    plt.ylabel("Portfolio value ($)")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(chart_path, dpi=120)
    plt.close()
    print(f"\nEquity curve saved to: {chart_path}")
    return chart_path
