"""
walkforward.py
==============

Walk-forward validation — the honest test of whether the strategy has an edge.

For each rolling window it:

1. **optimises** the parameters (lookback, stop %, take-profit %) on an
   *in-sample* training window (picks the best by Sharpe), then
2. **applies** those parameters to the *next* window of **unseen** out-of-sample
   data and records the result, then rolls forward and repeats.

The concatenated out-of-sample (OOS) results are a realistic estimate of live
performance — there's no look-ahead and no curve-fitting to the whole dataset.
A big gap between in-sample and OOS performance means the strategy is overfit;
OOS results that hold up mean the edge is more likely real.

Run::

    python main.py walkforward --tickers AAPL,MSFT,SPY --start 2015-01-01
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import pandas as pd

from backtest import simulate
from data import fetch_history_yf

# Small, coarse grid -- a coarse grid is far less prone to overfitting than a
# fine one, and keeps the walk-forward fast.
DEFAULT_GRID = {
    "lookback": [60, 100, 140],
    "stoptarget": [(4.0, 8.0), (5.0, 10.0), (7.0, 14.0)],
}
_PPY = {"1d": 252, "1h": 252 * 7, "1m": 252 * 390}


@dataclass
class WFResult:
    tickers: List[str] = field(default_factory=list)
    windows: int = 0
    oos_trades: list = field(default_factory=list)
    oos_report: dict = field(default_factory=dict)
    insample_avg_sharpe: float = 0.0
    oos_equity: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    per_ticker: dict = field(default_factory=dict)


def _score(report: dict, objective: str) -> float:
    if objective == "return":
        return report["total_return_pct"]
    if objective == "profit_factor":
        return min(report["profit_factor"], 99.0)
    return report["sharpe"]


def _combos(grid):
    for lb in grid["lookback"]:
        for sl, tp in grid["stoptarget"]:
            yield {"lookback": lb, "stop": sl, "target": tp}


def _walk_ticker(df, ticker, equation_set, signal_value, interval,
                 train_bars, test_bars, grid, objective):
    """Return (oos_trades, in_sample_sharpes, n_windows) for one ticker."""
    n = len(df)
    oos_trades = []
    in_sharpes = []
    n_windows = 0
    idx = train_bars
    while idx + test_bars <= n:
        in_slice = df.iloc[idx - train_bars:idx]
        out_start_ts = df.index[idx]
        out_end_idx = min(idx + test_bars, n)

        # 1. optimise on the in-sample window
        best = None  # (score, params, report)
        for p in _combos(grid):
            if len(in_slice) < p["lookback"] + 5:
                continue
            try:
                r = simulate(in_slice, ticker=ticker, equation_set=equation_set,
                             lookback=p["lookback"], signal_value=signal_value,
                             interval=interval, stop_loss_pct=p["stop"],
                             take_profit_pct=p["target"])
            except Exception:
                continue
            if r.report["trades"] < 1:
                continue
            sc = _score(r.report, objective)
            if best is None or sc > best[0]:
                best = (sc, p, r.report)
        if best is None:
            idx += test_bars
            continue

        # 2. apply to the unseen out-of-sample window (warm up over all prior bars)
        _, bp, in_rep = best
        try:
            r_oos = simulate(df.iloc[:out_end_idx], ticker=ticker,
                             equation_set=equation_set, lookback=bp["lookback"],
                             signal_value=signal_value, interval=interval,
                             stop_loss_pct=bp["stop"], take_profit_pct=bp["target"],
                             start_timestamp=out_start_ts)
        except Exception:
            idx += test_bars
            continue
        oos_trades.extend(r_oos.trades)  # gated -> all are OOS
        in_sharpes.append(in_rep["sharpe"])
        n_windows += 1
        idx += test_bars
    return oos_trades, in_sharpes, n_windows


def _aggregate(trades, interval, initial=100_000.0):
    """Compound the OOS trades into one equity curve + a performance report."""
    trades = sorted([t for t in trades if t.exit_time is not None],
                    key=lambda t: t.exit_time)
    report = {"trades": 0, "win_rate": 0.0, "total_return_pct": 0.0, "sharpe": 0.0,
              "max_dd_pct": 0.0, "profit_factor": 0.0, "avg_win": 0.0, "avg_loss": 0.0}
    if not trades:
        return report, pd.Series(dtype=float)

    equity = initial
    pts = {}
    rets = []
    for t in trades:
        r = (t.pnl_pct or 0.0) / 100.0
        equity *= (1 + r)
        rets.append(r)
        pts[t.exit_time] = equity
    eq = pd.Series(pts)

    wins = [r for r in rets if r > 0]
    losses = [r for r in rets if r < 0]
    n = len(rets)
    report["trades"] = n
    report["win_rate"] = len(wins) / n
    report["total_return_pct"] = (equity / initial - 1) * 100.0
    report["avg_win"] = (sum(wins) / len(wins) * 100) if wins else 0.0
    report["avg_loss"] = (sum(losses) / len(losses) * 100) if losses else 0.0
    report["profit_factor"] = (sum(wins) / abs(sum(losses))) if losses else (math.inf if wins else 0.0)

    running = eq.cummax()
    dd = (running - eq) / running
    report["max_dd_pct"] = float(dd.max()) * 100.0 if len(eq) else 0.0

    if n > 1:
        mean = sum(rets) / n
        var = sum((r - mean) ** 2 for r in rets) / (n - 1)
        std = math.sqrt(var)
        if std > 0:
            # annualise using trades-per-year from the actual span
            try:
                days = max((trades[-1].exit_time - trades[0].exit_time).days, 1)
                tpy = n / days * 365.0
            except Exception:
                tpy = n
            report["sharpe"] = (mean / std) * math.sqrt(max(tpy, 1.0))
    return report, eq


def run_walkforward(tickers, start, end=None, equation_set=1, signal_value=2,
                    interval="1d", yf_interval="1d", train_bars=504, test_bars=126,
                    objective="sharpe", chart_path=None):
    """Fetch data, walk-forward each ticker, aggregate OOS, print + chart."""
    if isinstance(tickers, str):
        tickers = [t.strip().upper() for t in tickers.split(",") if t.strip()]

    all_oos = []
    all_in = []
    total_windows = 0
    per_ticker = {}
    print(f"Walk-forward: {len(tickers)} ticker(s), train {train_bars} bars / "
          f"test {test_bars} bars, optimise by {objective}, equation set {equation_set}")
    print("(this fits parameters on each training window, then tests on UNSEEN data)\n")

    for t in tickers:
        try:
            df = fetch_history_yf(t, yf_interval, start, end)
        except Exception as exc:
            print(f"  {t:<6} data error: {exc}")
            continue
        if len(df) < train_bars + test_bars + 20:
            print(f"  {t:<6} not enough data ({len(df)} bars) — widen --start")
            continue
        oos, ins, nw = _walk_ticker(df, t, equation_set, signal_value, interval,
                                    train_bars, test_bars, DEFAULT_GRID, objective)
        rep, _ = _aggregate(oos, interval)
        per_ticker[t] = {"windows": nw, "report": rep}
        all_oos.extend(oos)
        all_in.extend(ins)
        total_windows += nw
        print(f"  {t:<6} {nw:>2} windows | OOS {rep['trades']:>3} trades | "
              f"win {rep['win_rate']*100:>4.0f}% | return {rep['total_return_pct']:>+7.1f}% | "
              f"Sharpe {rep['sharpe']:>5.2f}")

    combined, eq = _aggregate(all_oos, interval)
    in_avg = (sum(all_in) / len(all_in)) if all_in else 0.0
    res = WFResult(tickers=tickers, windows=total_windows, oos_trades=all_oos,
                   oos_report=combined, insample_avg_sharpe=in_avg, oos_equity=eq,
                   per_ticker=per_ticker)
    print(_format(res))
    if len(eq) > 1:
        _plot(eq, chart_path or "walkforward_oos.png")
    return res


def _format(res: WFResult) -> str:
    r = res.oos_report
    gap = res.insample_avg_sharpe - r["sharpe"]
    if r["trades"] < 10:
        verdict = "⚠️  Too few out-of-sample trades to conclude anything. Widen the date range / universe."
    elif r["sharpe"] <= 0 or r["total_return_pct"] <= 0:
        verdict = "❌ No out-of-sample edge — the strategy did NOT make money on unseen data. Do not trade this live."
    elif gap > 1.0:
        verdict = ("⚠️  Likely OVERFIT — in-sample Sharpe is much higher than out-of-sample. "
                   "The edge is fragile; treat results with heavy skepticism.")
    else:
        verdict = ("✅ The edge held up out-of-sample (no big in-sample vs OOS gap). "
                   "More likely real — but keep paper-trading to confirm.")
    return "\n".join([
        "",
        "=" * 70,
        " WALK-FORWARD OUT-OF-SAMPLE RESULTS (the honest, unseen-data performance)",
        "=" * 70,
        f"  Tickers:            {', '.join(res.tickers)}",
        f"  Windows tested:     {res.windows}",
        f"  OOS trades:         {r['trades']}",
        f"  OOS win rate:       {r['win_rate']*100:.1f}%",
        f"  OOS total return:   {r['total_return_pct']:+.1f}%  (compounded across all OOS trades)",
        f"  OOS Sharpe (ann.):  {r['sharpe']:.2f}",
        f"  OOS max drawdown:   {r['max_dd_pct']:.1f}%",
        f"  OOS profit factor:  {r['profit_factor']:.2f}",
        f"  Avg win / loss:     {r['avg_win']:+.2f}% / {r['avg_loss']:+.2f}%",
        "  --- overfitting check ---",
        f"  In-sample avg Sharpe {res.insample_avg_sharpe:.2f}  vs  OOS Sharpe {r['sharpe']:.2f}"
        f"   (gap {gap:+.2f})",
        "",
        f"  {verdict}",
    ])


def _plot(eq: pd.Series, path: str) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.figure(figsize=(11, 6))
    plt.plot(eq.index, eq.values, color="#41d18b")
    plt.title("Walk-forward out-of-sample equity (unseen data)")
    plt.xlabel("Trade exit date")
    plt.ylabel("Equity ($)")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(path, dpi=120)
    plt.close()
    print(f"\nOut-of-sample equity curve saved to: {path}")
    return path
