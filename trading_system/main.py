"""
main.py
=======

Command-line entry point for the whole system.

    python main.py check                       # pre-flight connectivity checks
    python main.py run                          # start the live trading loop
    python main.py dashboard                    # monitoring UI
    python main.py signals                      # print the latest signal per ticker
    python main.py report                       # performance report from the trade log
    python main.py backtest --ticker AAPL --start 2022-01-01 --equation both

Everything defaults to the values in ``config.py`` / ``.env`` -- in particular,
paper trading.  Live trading requires ``TRADING_MODE=live`` set explicitly.
"""

from __future__ import annotations

import argparse
import logging
import sys

from config import CONFIG, INTERVAL_MAP


def _setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, CONFIG.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )


# --------------------------------------------------------------------------- #
# Subcommand handlers
# --------------------------------------------------------------------------- #
def cmd_check(_args) -> int:
    from connectivity_check import run_checks
    return run_checks()


def cmd_run(_args) -> int:
    problems = [p for p in CONFIG.validate() if "TRADING_MODE=live" not in p]
    if problems:
        print("Refusing to start -- fix configuration first:")
        for p in problems:
            print(f"  - {p}")
        print("Run `python main.py check` for details.")
        return 1
    from engine import TradingEngine
    TradingEngine(CONFIG).run()
    return 0


def cmd_dashboard(_args) -> int:
    from dashboard import Dashboard
    Dashboard(CONFIG).run()
    return 0


def cmd_signals(_args) -> int:
    """Print the current signal/vote state for each ticker (no trading)."""
    from data import DataProvider
    from signals import SignalGenerator

    provider = DataProvider(CONFIG)
    print(f"Latest signals (equation set {CONFIG.equation_set}, "
          f"lookback {CONFIG.lookback_length}):")
    for ticker in CONFIG.tickers:
        try:
            df = provider.recent(ticker, CONFIG.lookback_length * 3)
        except Exception as exc:
            print(f"  {ticker:<8} data error: {exc}")
            continue
        gen = SignalGenerator(CONFIG.equation_set, CONFIG.lookback_length, CONFIG.signal_value)
        last = None
        for _, row in df.iterrows():
            last = gen.update({k: float(row[k]) for k in
                               ("open", "high", "low", "close", "volume")})
        if last is None or not gen.ready:
            print(f"  {ticker:<8} not enough data ({len(df)} bars)")
            continue
        action = last.action or "—"
        print(f"  {ticker:<8} action={action:<5} "
              f"buy_votes={last.buy_votes} sell_votes={last.sell_votes} "
              f"buySignal={last.buy_signal} sellSignal={last.sell_signal} "
              f"(wins {last.wins}/{last.trades})")
    return 0


def cmd_report(_args) -> int:
    from database import Database
    db = Database(CONFIG.db_path)
    r = db.performance_report()
    print("===== Performance report (all closed trades) =====")
    print(f"  Trades:          {r['trades']}  ({r['wins']}W / {r['losses']}L)")
    print(f"  Win rate:        {r['win_rate'] * 100:.1f}%")
    print(f"  Total PnL:       ${r['total_pnl']:,.2f}  ({r['total_return_pct']:+.2f}%)")
    print(f"  Avg win / loss:  ${r['avg_win']:,.2f} / ${r['avg_loss']:,.2f}")
    print(f"  Largest win:     ${r['largest_win']:,.2f}")
    print(f"  Largest loss:    ${r['largest_loss']:,.2f}")
    print(f"  Max drawdown:    {r['largest_drawdown_pct']:.2f}%  (${r['largest_drawdown_dollars']:,.2f})")
    print(f"  Profit factor:   {r['profit_factor']:.2f}")
    print(f"  Sharpe (ann.):   {r['sharpe']:.2f}")
    print(f"  Wins: {r['wins']} | Trades: {r['trades']} | "
          f"Win/Loss: {r['win_rate']:.4f}")
    return 0


def cmd_backtest(args) -> int:
    from backtest import run_backtest

    interval = args.interval or CONFIG.interval
    yf_interval = INTERVAL_MAP.get(interval, INTERVAL_MAP["1d"])["yf"]
    run_backtest(
        ticker=args.ticker,
        start=args.start,
        end=args.end,
        equation_set=args.equation,
        lookback=args.lookback or CONFIG.lookback_length,
        signal_value=CONFIG.signal_value,
        interval=interval,
        yf_interval=yf_interval,
        initial_cash=args.cash,
        position_pct=args.position_pct,
        stop_loss_pct=args.stop,
        take_profit_pct=args.take,
        chart_path=args.chart,
    )
    return 0


# --------------------------------------------------------------------------- #
# Parser
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="main.py", description="HP Analytics automated trading system")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="run connectivity / config checks")
    sub.add_parser("run", help="start the live trading loop")
    sub.add_parser("dashboard", help="launch the monitoring dashboard")
    sub.add_parser("signals", help="print the latest signal for each ticker")
    sub.add_parser("report", help="print a performance report from the trade log")

    bt = sub.add_parser("backtest", help="backtest one or both equations")
    bt.add_argument("--ticker", required=True)
    bt.add_argument("--start", required=True, help="start date YYYY-MM-DD")
    bt.add_argument("--end", default=None, help="end date YYYY-MM-DD (default: today)")
    bt.add_argument("--equation", default="both",
                    help="1, 2, or both (default: both)")
    bt.add_argument("--lookback", type=int, default=None)
    bt.add_argument("--interval", default=None, choices=list(INTERVAL_MAP),
                    help="1m, 1h or 1d (default: config)")
    bt.add_argument("--cash", type=float, default=100_000.0)
    bt.add_argument("--position-pct", type=float, default=100.0,
                    help="percent of equity per position (default 100)")
    bt.add_argument("--stop", type=float, default=None,
                    help="stop-loss %% (default: none)")
    bt.add_argument("--take", type=float, default=None,
                    help="take-profit %% (default: none)")
    bt.add_argument("--chart", default=None, help="output PNG path")
    return p


_HANDLERS = {
    "check": cmd_check,
    "run": cmd_run,
    "dashboard": cmd_dashboard,
    "signals": cmd_signals,
    "report": cmd_report,
    "backtest": cmd_backtest,
}


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    _setup_logging()
    return _HANDLERS[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
