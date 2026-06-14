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


def cmd_testorder(args) -> int:
    """Place a tiny PAPER order to prove the bot can execute, then clean up."""
    import time
    if CONFIG.is_live and not args.force:
        print("Refusing: TRADING_MODE=live would place a REAL order.")
        print("Switch to paper, or pass --force if you really mean to test live.")
        return 1
    if CONFIG.broker == "alpaca" and not (CONFIG.alpaca_api_key and CONFIG.alpaca_secret_key):
        print("No Alpaca keys found in .env (ALPACA_API_KEY / ALPACA_SECRET_KEY).")
        return 1
    from broker import build_broker
    try:
        broker = build_broker(CONFIG)
        acct = broker.get_account()
    except Exception as exc:
        print(f"Could not connect to the broker: {exc}")
        return 1
    mode = "PAPER" if getattr(broker, "paper", True) else "LIVE"
    print(f"Connected: {mode} account | equity ${acct.equity:,.2f} | "
          f"buying power ${acct.buying_power:,.2f}")
    ticker, qty = args.ticker.upper(), args.qty
    print(f"Placing a TEST market BUY: {qty} share(s) of {ticker} ...")
    try:
        order_id = broker.submit_market_order(ticker, qty, "buy")
    except Exception as exc:
        print(f"❌ Order was REJECTED by Alpaca: {exc}")
        return 1
    print(f"✅ Order ACCEPTED by Alpaca — id {order_id}")
    time.sleep(2.0)
    pos = broker.get_position(ticker)
    if pos and pos.qty > 0:
        print(f"   Filled — you now hold {pos.qty} {ticker} @ ${pos.avg_entry_price:,.2f}.")
        if not args.keep:
            broker.close_position(ticker)
            print("   Cleaned up: sent an order to close the test position.")
    else:
        try:
            broker.cancel_all_orders()
            print("   Market closed, so it queued — cancelled it to keep your account clean.")
        except Exception:
            pass
    print("\n✅ Confirmed: the bot CAN place orders on your Alpaca account.")
    return 0


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


def cmd_autotrade(args) -> int:
    """Auto-trade what the dashboard shows. --dry-run previews with no broker/keys."""
    from engine import TradingEngine
    if getattr(args, "dry_run", False):
        TradingEngine(CONFIG, dry_run=True).preview()
        return 0
    problems = [p for p in CONFIG.validate() if "TRADING_MODE=live" not in p]
    if problems:
        print("Refusing to start -- fix configuration first:")
        for p in problems:
            print(f"  - {p}")
        print("Tip: `python main.py autotrade --dry-run` previews decisions with no keys needed.")
        return 1
    TradingEngine(CONFIG).run()
    return 0


def cmd_dashboard(_args) -> int:
    from dashboard import Dashboard
    Dashboard(CONFIG).run()
    return 0


def cmd_web(_args) -> int:
    """Launch the signals-only web dashboard (no broker needed)."""
    from webapp import run
    run(CONFIG)
    return 0


def cmd_scan(_args) -> int:
    """Print ranked, actionable signals for each ticker (no broker needed)."""
    from scanner import Scanner
    from ai_brief import AIBriefer

    scanner = Scanner(CONFIG, briefer=AIBriefer(CONFIG))
    print(f"Scanning {len(CONFIG.tickers)} tickers "
          f"(lookback {CONFIG.lookback_length}, {CONFIG.interval}, "
          f"account ${CONFIG.account_size:,.0f})...\n")
    results = scanner.scan()
    header = f"{'TICKER':<8}{'SIGNAL':<12}{'CONV':>5}  {'PRICE':>9}  {'ENTRY':>9}  {'STOP':>9}  {'TARGET':>9}  {'SHARES':>7}  EQ1/EQ2"
    print(header)
    print("-" * len(header))
    for s in results:
        if s.error:
            print(f"{s.ticker:<8}{'ERROR':<12}  {s.error}")
            continue
        eqs = f"{s.eq1.stance}/{s.eq2.stance}" if s.eq1 and s.eq2 else "-"
        agree = "  ✓agree" if s.agree else ""
        print(f"{s.ticker:<8}{s.recommendation:<12}{s.conviction:>5.0f}  "
              f"{s.price:>9.2f}  {s.entry:>9.2f}  {s.stop:>9.2f}  {s.target:>9.2f}  "
              f"{s.shares:>7}  {eqs}{agree}")
        if s.ai_brief:
            for line in s.ai_brief.splitlines():
                print(f"          {line}")
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


def cmd_walkforward(args) -> int:
    from walkforward import run_walkforward
    interval = args.interval or CONFIG.interval
    yf_interval = INTERVAL_MAP.get(interval, INTERVAL_MAP["1d"])["yf"]
    run_walkforward(
        tickers=args.tickers, start=args.start, end=args.end,
        equation_set=CONFIG.equation_set, signal_value=CONFIG.signal_value,
        interval=interval, yf_interval=yf_interval,
        train_bars=args.train_bars, test_bars=args.test_bars,
        objective=args.objective, chart_path=args.chart,
    )
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
    to = sub.add_parser("testorder", help="place a tiny PAPER order to prove execution works, then clean up")
    to.add_argument("--ticker", default="AAPL")
    to.add_argument("--qty", type=int, default=1)
    to.add_argument("--keep", action="store_true", help="don't auto-close/cancel the test order")
    to.add_argument("--force", action="store_true", help="allow even in live mode (places a REAL order)")
    sub.add_parser("scan", help="signals-only: print ranked actionable signals (no broker)")
    sub.add_parser("web", help="signals-only: launch the web dashboard (no broker)")
    at = sub.add_parser("autotrade", help="auto-trade the dashboard's signals (paper by default)")
    at.add_argument("--dry-run", action="store_true",
                    help="preview what it WOULD do — no orders, no broker/keys needed")
    sub.add_parser("run", help="alias for `autotrade` (live loop, needs a broker)")
    sub.add_parser("dashboard", help="launch the broker monitoring dashboard")
    sub.add_parser("signals", help="print the latest raw signal/votes for each ticker")
    sub.add_parser("report", help="print a performance report from the trade log")

    wf = sub.add_parser("walkforward", help="walk-forward validation (honest out-of-sample edge test)")
    wf.add_argument("--tickers", default="AAPL,MSFT,SPY", help="comma-separated")
    wf.add_argument("--start", default="2015-01-01", help="start date YYYY-MM-DD")
    wf.add_argument("--end", default=None)
    wf.add_argument("--interval", default=None, choices=list(INTERVAL_MAP))
    wf.add_argument("--train-bars", type=int, default=504, dest="train_bars",
                    help="in-sample training window (bars); 504 ~ 2y daily")
    wf.add_argument("--test-bars", type=int, default=126, dest="test_bars",
                    help="out-of-sample test window (bars); 126 ~ 6mo daily")
    wf.add_argument("--objective", default="sharpe", choices=["sharpe", "return", "profit_factor"])
    wf.add_argument("--chart", default=None)

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
    "testorder": cmd_testorder,
    "scan": cmd_scan,
    "web": cmd_web,
    "autotrade": cmd_autotrade,
    "run": cmd_run,
    "dashboard": cmd_dashboard,
    "signals": cmd_signals,
    "report": cmd_report,
    "walkforward": cmd_walkforward,
    "backtest": cmd_backtest,
}


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    _setup_logging()
    return _HANDLERS[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
