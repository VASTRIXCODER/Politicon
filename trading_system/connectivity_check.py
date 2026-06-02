"""
connectivity_check.py
=====================

Pre-flight checks. Run this before ever starting the engine::

    python main.py check

It verifies, with clear PASS / WARN / FAIL output:

1. configuration is internally valid,
2. the market-data source returns bars,
3. the broker authenticates and the account is reachable,
4. the SQLite trade log is writable.

Exits non-zero if any hard check fails, so it can gate a setup script.
"""

from __future__ import annotations

import sys

from config import CONFIG

OK = "[ OK ]"
WARN = "[WARN]"
FAIL = "[FAIL]"


class _Results:
    def __init__(self):
        self.failed = False
        self.warned = False

    def ok(self, msg):
        print(f"{OK} {msg}")

    def warn(self, msg):
        self.warned = True
        print(f"{WARN} {msg}")

    def fail(self, msg):
        self.failed = True
        print(f"{FAIL} {msg}")


def _check_config(r: _Results) -> None:
    problems = CONFIG.validate()
    # The "live enabled" notice is informational, not a hard failure.
    live_note = [p for p in problems if "TRADING_MODE=live" in p]
    hard = [p for p in problems if "TRADING_MODE=live" not in p]

    if live_note:
        r.warn("LIVE trading mode is enabled -- real orders will be placed.")
    if hard:
        for p in hard:
            r.fail(f"config: {p}")
    else:
        r.ok(f"config valid -- {CONFIG.summary()}")


def _check_data(r: _Results) -> None:
    ticker = CONFIG.tickers[0] if CONFIG.tickers else "AAPL"
    try:
        from data import DataProvider
        df = DataProvider(CONFIG).recent(ticker, CONFIG.lookback_length)
        if df is None or len(df) == 0:
            r.fail(f"data source '{CONFIG.data_source}' returned no bars for {ticker}.")
        elif len(df) < CONFIG.lookback_length:
            r.warn(
                f"data source returned only {len(df)} bars for {ticker} "
                f"(< lookback {CONFIG.lookback_length}); signals will be delayed."
            )
        else:
            last = df['close'].iloc[-1]
            r.ok(f"data source '{CONFIG.data_source}' OK -- {ticker} {len(df)} bars, "
                 f"last close {last:.2f}")
    except Exception as exc:
        r.fail(f"data source '{CONFIG.data_source}' error: {exc}")


def _check_broker(r: _Results) -> None:
    if CONFIG.broker == "alpaca" and not (CONFIG.alpaca_api_key and CONFIG.alpaca_secret_key):
        r.fail("Alpaca keys missing -- set ALPACA_API_KEY / ALPACA_SECRET_KEY in .env.")
        return
    try:
        from broker import build_broker
        broker = build_broker(CONFIG)
        account = broker.get_account()
        endpoint = "paper" if getattr(broker, "paper", True) else "LIVE"
        r.ok(f"broker '{CONFIG.broker}' ({endpoint}) authenticated -- "
             f"equity {account.equity:,.2f} {account.currency}, "
             f"buying power {account.buying_power:,.2f}")
    except Exception as exc:
        r.fail(f"broker '{CONFIG.broker}' connection failed: {exc}")


def _check_db(r: _Results) -> None:
    try:
        from database import Database
        db = Database(CONFIG.db_path)
        db.get_open_trades()  # exercises a read against the schema
        r.ok(f"trade database writable at {CONFIG.db_path}")
    except Exception as exc:
        r.fail(f"database error: {exc}")


def run_checks() -> int:
    print("=" * 64)
    print(" HP Analytics Trading System -- connectivity check")
    print("=" * 64)
    r = _Results()
    _check_config(r)
    _check_db(r)
    _check_data(r)
    _check_broker(r)
    print("-" * 64)
    if r.failed:
        print(f"{FAIL} One or more checks failed. Fix the above before trading.")
        return 1
    if r.warned:
        print(f"{WARN} Checks passed with warnings. Review them before trading.")
        return 0
    print(f"{OK} All systems go.")
    return 0


if __name__ == "__main__":
    sys.exit(run_checks())
