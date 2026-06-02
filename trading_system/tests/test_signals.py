"""
Tests for the signal logic ported from the Pine Script.

Run with pytest::

    pytest trading_system/tests

or directly (no pytest needed)::

    python trading_system/tests/test_signals.py
"""

import math
import os
import sys

# Make the project importable whether run via pytest or directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import signals as S  # noqa: E402


# --------------------------------------------------------------------------- #
# Low-level helpers
# --------------------------------------------------------------------------- #
def test_sign_series():
    out = S.sign_series([3.0, -2.0, 0.0, float("nan")])
    assert out[0] == 1.0 and out[1] == -1.0 and out[2] == 0.0
    assert math.isnan(out[3])


def test_ts_delta_series_quirk():
    # First `period` entries are NaN; in-place forward delta is preserved.
    s = list(range(20))
    out = S.ts_delta_series(s, 8)
    assert len(out) == 20
    assert all(math.isnan(x) for x in out[:8])
    # range(20): out[8] = 8-0 = 8; out[9] = 9-1 = 8; ...
    assert out[8] == 8 and out[9] == 8


def test_sub_trailing_zeros():
    # Result length == len(a); trailing entries beyond len(b) stay 0.
    out = S.sub([10.0, 20.0, 30.0], [1.0, 2.0])
    assert out == [9.0, 18.0, 0.0]


def test_delta_is_offset_one_bar_diff():
    # `period` is a START offset; the diff is always 1 bar.
    assert S.delta([10, 11, 13, 16, 20], 2) == [2, 3, 4]


def test_avg_length():
    # Quirky rolling mean: length == n - period + 2.
    s = [float(i) for i in range(40)]
    out = S.avg(s, 30)
    assert len(out) == len(s) - 30 + 2


def test_rank_series_deterministic():
    a = S.rank_series([5.0, 1.0, 3.0, 3.0, 9.0])
    b = S.rank_series([5.0, 1.0, 3.0, 3.0, 9.0])
    assert a == b
    assert len(a) == 5


def test_rsi_length_and_range():
    closes = [100 + math.sin(i / 3.0) * 5 for i in range(60)]
    r = S.rsi(closes, 14)
    # Faithful length: the original slices deltas as [period, size-1) (exclusive),
    # dropping the last delta -> length is n - period - 1, not n - period.
    assert len(r) == len(closes) - 14 - 1
    # Non-NaN RSI values stay within [0, 100] (up/down remain non-negative even
    # with the preserved precedence quirk, so rs >= 0).
    for v in r:
        if not math.isnan(v):
            assert -0.001 <= v <= 100.001


def test_tally_votes():
    buy, sell = S.tally_votes([[1.0, -2.0, 0.0, float("nan"), 3.0]])
    assert buy == 2 and sell == 1


# --------------------------------------------------------------------------- #
# Stateful generator
# --------------------------------------------------------------------------- #
def _synthetic_bars(n=400, seed=7):
    import numpy as np
    rng = np.random.default_rng(seed)
    price = 100 + np.cumsum(rng.normal(0.05, 1.0, n))
    bars = []
    for i in range(n):
        c = float(price[i])
        bars.append({
            "open": c + float(rng.normal(0, 0.2)),
            "high": c + abs(float(rng.normal(0.5, 0.3))),
            "low": c - abs(float(rng.normal(0.5, 0.3))),
            "close": c,
            "volume": float(rng.integers(1_000_000, 5_000_000)),
        })
    return bars


def test_generator_needs_full_lookback():
    gen = S.SignalGenerator(equation_set=1, lookback=100)
    for bar in _synthetic_bars(50):
        res = gen.update(bar)
        assert res.action is None  # never enough data
    assert not gen.ready


def test_actions_strictly_alternate():
    for eq in (1, 2):
        gen = S.SignalGenerator(equation_set=eq, lookback=100, signal_value=2)
        actions = []
        for bar in _synthetic_bars(500):
            res = gen.update(bar)
            if res.action:
                actions.append(res.action)
        # BUY/SELL must alternate -- can_buy/can_sell forbid repeats.
        for prev, cur in zip(actions, actions[1:]):
            assert prev != cur, f"eq{eq}: repeated {cur} action"


def test_generator_is_deterministic():
    bars = _synthetic_bars(300)
    runs = []
    for _ in range(2):
        gen = S.SignalGenerator(equation_set=2, lookback=100)
        seq = [gen.update(b).action for b in bars]
        runs.append(seq)
    assert runs[0] == runs[1]


def test_wins_never_exceed_trades():
    gen = S.SignalGenerator(equation_set=1, lookback=100)
    last = None
    for bar in _synthetic_bars(500):
        last = gen.update(bar)
    assert last.wins <= last.trades
    assert 0.0 <= last.win_rate <= 1.0


# --------------------------------------------------------------------------- #
# Direct runner
# --------------------------------------------------------------------------- #
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
