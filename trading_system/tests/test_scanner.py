"""
Tests for the signals-only scanner and its combination logic.

Run with pytest, or directly:  python trading_system/tests/test_scanner.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("TICKERS", "SYN1,SYN2")
os.environ.setdefault("ACCOUNT_SIZE", "50000")
os.environ.setdefault("MAX_POSITION_PCT", "10")
os.environ.setdefault("STOP_LOSS_PCT", "5")
os.environ.setdefault("TAKE_PROFIT_PCT", "10")
os.environ.setdefault("AI_BRIEFING", "false")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from config import Config  # noqa: E402
import scanner as SC  # noqa: E402


def _df(seed, n=400):
    rng = np.random.default_rng(seed)
    price = 100 + np.cumsum(rng.normal(0.04, 1.0, n))
    idx = pd.date_range("2022-01-01", periods=n, freq="D", tz="UTC")
    return pd.DataFrame({
        "open": price + rng.normal(0, 0.2, n),
        "high": price + np.abs(rng.normal(0.6, 0.3, n)),
        "low": price - np.abs(rng.normal(0.6, 0.3, n)),
        "close": price,
        "volume": rng.integers(1_000_000, 5_000_000, n).astype(float),
    }, index=idx)


def _ev(stance, conviction=50.0):
    return SC.EquationView(stance=stance, fresh=(stance in ("BUY", "SELL")),
                           conviction=conviction, buy_votes=0, sell_votes=0,
                           edge_win_rate=0.5, edge_return_pct=1.0, edge_trades=3)


def test_combine_strong_buy():
    rec, conv, agree = SC.Scanner._combine(_ev("BUY", 60), _ev("BUY", 80))
    assert rec == "STRONG BUY" and agree is True
    assert conv > 60  # agreement bonus applied


def test_combine_single_buy():
    rec, _, _ = SC.Scanner._combine(_ev("BUY"), _ev("WAIT"))
    assert rec == "BUY"


def test_combine_conflict_is_wait():
    # One fresh BUY against one fresh SELL is a genuine conflict -> WAIT (no action).
    rec, _, agree = SC.Scanner._combine(_ev("BUY"), _ev("SELL"))
    assert rec == "WAIT"
    assert agree is False


def test_combine_hold_and_wait():
    assert SC.Scanner._combine(_ev("HOLD"), _ev("WAIT"))[0] == "HOLD"
    assert SC.Scanner._combine(_ev("WAIT"), _ev("WAIT"))[0] == "WAIT"


def test_scan_ticker_produces_levels():
    cfg = Config()
    s = SC.Scanner(cfg)
    s._fetch = lambda t: _df(1)
    sig = s.scan_ticker("SYN1")
    assert sig.error is None
    assert sig.price > 0
    # stop below entry, target above entry
    assert sig.stop < sig.entry < sig.target
    # shares respect the 10% cap on a 50k account
    assert 0 <= sig.shares * sig.entry <= cfg.account_size * 0.10 + sig.entry
    assert sig.recommendation in SC._REC_RANK


def test_scan_results_are_json_serializable():
    from webapp import _signal_json
    cfg = Config()
    s = SC.Scanner(cfg)
    dfs = {"SYN1": _df(1), "SYN2": _df(2)}
    s._fetch = lambda t: dfs[t]
    results = s.scan()
    # ranked descending
    assert [r.rank for r in results] == sorted([r.rank for r in results], reverse=True)
    # every signal serializes cleanly to JSON
    payload = [_signal_json(r) for r in results]
    json.dumps(payload)  # raises if not serializable


def test_scan_ticker_insufficient_data():
    cfg = Config()
    s = SC.Scanner(cfg)
    s._fetch = lambda t: _df(1, n=50)  # < lookback
    sig = s.scan_ticker("SYN1")
    assert sig.error is not None


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print(f"FAIL {name}: {exc}")
    print(f"\n{'all passed' if not failures else str(failures) + ' failed'}")
    sys.exit(1 if failures else 0)
