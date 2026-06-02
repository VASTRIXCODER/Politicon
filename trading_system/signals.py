"""
signals.py
==========

Faithful Python port of the **"HP Analytics Buy/Sell Indicator V1"** Pine Script
(© FLIPPER401, MPL-2.0).

The original Pine Script builds, on every bar, a set of fixed-length arrays from
the most recent ``lengthLookback`` bars and derives a buy/sell vote from one of
two "equation sets".  This module reproduces that logic **bar-for-bar** so the
signals generated here match the labels plotted on a TradingView chart.

Conventions
-----------
* All the low-level array helpers operate on **reverse-chronological** data,
  exactly like the Pine arrays: ``index 0`` is the *current* bar, ``index i`` is
  ``i`` bars ago.  ``SignalGenerator`` accepts windows in normal chronological
  order (oldest first) and reverses them internally.

Faithfulness notes (a.k.a. "quirks of the original script")
-----------------------------------------------------------
The original script is reproduced verbatim, including several behaviours that
deviate from the textbook formulas they resemble.  They are preserved on
purpose so the Python signals are identical to the chart.  Each is flagged with
a ``# QUIRK`` comment:

1. ``ts_delta_series`` mutates the series *in place while iterating forward*, so
   for indices ``>= 2 * period`` the subtraction uses an already-modified value
   (a cumulative effect rather than a pure lag-8 delta).
2. ``rsi`` is a hand-rolled Wilder's RSI whose smoothing step is mis-parenthesised
   (``up * (period-1) + v / period`` instead of ``(up*(period-1) + v) / period``).
3. ``delta(s, period)`` is a **1-bar** difference that merely *starts* at index
   ``period`` -- ``period`` is a start offset, not the difference lag.
4. ``avg(s, period)`` sums ``period - 2`` elements but divides by ``period`` and
   iterates one element past the end of the series.
5. ``rank_series`` sorts the array in place (discarding the original
   element->position mapping) and then assigns a competition-style rank with an
   off-by-one duplicate check.
6. ``adv20`` and the ``vwap`` array are computed in the original but never used
   in either equation, so they are omitted here (they cannot affect signals).

If you want the "textbook" interpretation of these indicators instead, that is a
different strategy -- this module's contract is *match the original chart*.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Iterable, List, Optional, Sequence

NaN = float("nan")


# --------------------------------------------------------------------------- #
# Small numeric helpers
# --------------------------------------------------------------------------- #
def _isnan(x: float) -> bool:
    return isinstance(x, float) and math.isnan(x)


def _safe_div(a: float, b: float) -> float:
    """Pine returns ``na`` for float division by zero; mirror that with NaN."""
    if b == 0 or _isnan(a) or _isnan(b):
        return NaN
    return a / b


# --------------------------------------------------------------------------- #
# Low-level array operations (direct ports of the Pine functions)
# --------------------------------------------------------------------------- #
def sign_series(s: Sequence[float]) -> List[float]:
    """Element-wise ``math.sign`` (1 / 0 / -1), NaN-preserving."""
    out = []
    for x in s:
        if _isnan(x):
            out.append(NaN)
        elif x > 0:
            out.append(1.0)
        elif x < 0:
            out.append(-1.0)
        else:
            out.append(0.0)
    return out


def ts_delta_series(s: Sequence[float], period: int = 8) -> List[float]:
    """In-place forward delta, faithful to the Pine ``tsDeltaSeries``.

    ``s[i] -= s[i - period]`` for ``i`` in ``[period, n)`` then the first
    ``period`` entries become NaN.

    # QUIRK: because the subtraction is done in place while iterating forward,
    # for ``i >= 2 * period`` the value at ``i - period`` has *already* been
    # overwritten, producing a cumulative effect rather than a pure lag delta.
    """
    s = list(s)
    n = len(s)
    for i in range(period, n):
        s[i] = s[i] - s[i - period]
    for i in range(min(period, n)):
        s[i] = NaN
    return s


def mul(a: Sequence[float], b: Sequence[float]) -> List[float]:
    """Element-wise product over ``min(len(a), len(b))`` (NaN-propagating)."""
    n = min(len(a), len(b))
    return [a[i] * b[i] for i in range(n)]


def sub(a: Sequence[float], b: Sequence[float]) -> List[float]:
    """Element-wise subtraction.

    Faithful to the Pine ``sub``: the result has ``len(a)`` entries initialised
    to ``0`` and only the first ``min(len(a), len(b))`` are set to ``a-b``; any
    trailing entries stay ``0`` (and therefore count as a non-vote later).
    """
    n = len(a)
    res = [0.0] * n
    idx = min(len(a), len(b))
    for i in range(idx):
        res[i] = a[i] - b[i]
    return res


def rsi(s: Sequence[float], period: int) -> List[float]:
    """Hand-rolled Wilder-style RSI, faithful to the Pine ``rsi``.

    # QUIRK: the smoothing recurrence is mis-parenthesised relative to a
    # textbook Wilder's RSI; preserved verbatim so signals match.
    """
    deltas = [s[i] - s[i - 1] for i in range(1, len(s))]
    if len(deltas) < max(period, 1):
        return []

    seed = deltas[0 : period - 1]  # array.slice end index is exclusive in Pine
    up = 0.0
    down = 0.0
    for v in seed:
        if v > 0:
            up += v
        else:
            down += v
    up = up / period
    down = (down * -1) / period
    rs = _safe_div(up, down)
    out = [100 - _safe_div(100, 1 + rs)]

    sliced = deltas[period : len(deltas) - 1]  # exclusive end, as in the original
    for v in sliced:
        if v > 0.0:
            up = (up * (period - 1)) + v / period  # QUIRK: precedence preserved
            down = down * (period - 1)
        else:
            up = up * (period - 1)
            down = (down * (period - 1)) + (v * -1) / period
        rs = _safe_div(up, down)
        out.append(100 - _safe_div(100, 1 + rs))
    return out


def delta(s: Sequence[float], period: int) -> List[float]:
    """1-bar difference, *starting* at index ``period``.

    # QUIRK: ``period`` is a start offset, not the difference lag -- the diff is
    # always ``s[i] - s[i-1]``.
    """
    return [s[i] - s[i - 1] for i in range(period, len(s))]


def avg(s: Sequence[float], period: int) -> List[float]:
    """Rolling mean, faithful to the Pine ``avg``.

    # QUIRK: sums ``period - 2`` elements (slice end is exclusive) yet divides by
    # ``period``, and the loop runs one index past the end of the series.
    """
    out: List[float] = []
    n = len(s)
    for i in range(period - 1, n + 1):  # Pine 'to size' is inclusive
        lo = i - period + 1
        hi = i - 1
        window = s[lo:hi]
        out.append(sum(window) / period)
    return out


def rank_series(s: Sequence[float]) -> List[float]:
    """Faithful literal port of the Pine ``rankSeries``.

    # QUIRK: the array is sorted ascending *in place*, discarding the original
    # element->index mapping, then a competition-style rank is assigned with an
    # off-by-one look-ahead used as a (buggy) duplicate detector.  Reproduced
    # exactly because the downstream ``sub`` of two ranked arrays is what
    # produces the vote.
    """
    # NaN sorted to the end (Pine pushes na to the end on ascending sort).
    s = sorted(s, key=lambda x: (1, 0.0) if _isnan(x) else (0, x))
    n = len(s)
    if n < 2:
        return s

    value = s[1]
    found_double = False
    i = 0
    while i <= n - 2:
        if found_double:
            found_double = False
            i += 1
            continue
        if s[i] != value:
            s[i] = i + 1
            if i + 2 != n:
                value = s[i + 2]
        else:
            s[i] = float(i) + 0.5
            found_double = True
            value = i + 4
        i += 1
    return s


# --------------------------------------------------------------------------- #
# Equation sets
# --------------------------------------------------------------------------- #
def compute_matrix(
    opens: Sequence[float],
    highs: Sequence[float],
    lows: Sequence[float],
    closes: Sequence[float],
    volumes: Sequence[float],
    equation_set: int,
) -> List[List[float]]:
    """Build the "compute" matrix for the current bar.

    Inputs are reverse-chronological (index 0 = current bar), each of length
    ``lengthLookback``.  Returns a list of rows (1 row for set 1, 2 rows for
    set 2) matching the Pine ``compute`` matrix.
    """
    if equation_set == 1:
        # mul(signSeries(valueHigh), tsDeltaSeries(valueOpen, 8))
        row0 = mul(sign_series(highs), ts_delta_series(opens, 8))
        return [row0]

    # Equation set 2 (two rows).
    row0 = sub(rank_series(rsi(closes, 7)), rank_series(delta(closes, 10)))
    row1 = sub(
        rank_series(rsi(closes, 20)),
        rank_series(sub(closes, avg(closes, 30))),
    )
    return [row0, row1]


def tally_votes(matrix: Iterable[Iterable[float]]) -> tuple[int, int]:
    """Count buy votes (cell > 0) and sell votes (cell < 0); NaN/0 abstain."""
    buy = 0
    sell = 0
    for row in matrix:
        for cell in row:
            if _isnan(cell):
                continue
            if cell < 0:
                sell += 1
            elif cell > 0:
                buy += 1
    return buy, sell


# --------------------------------------------------------------------------- #
# Stateful, bar-by-bar signal generator (mirrors the Pine state machine)
# --------------------------------------------------------------------------- #
@dataclass
class SignalResult:
    """Outcome of feeding one bar to :class:`SignalGenerator`."""

    action: Optional[str]  # "BUY", "SELL" or None
    buy_votes: int
    sell_votes: int
    buy_signal: int
    sell_signal: int
    wins: int
    trades: int

    @property
    def win_rate(self) -> float:
        return (self.wins / self.trades) if self.trades else 0.0


@dataclass
class SignalGenerator:
    """Reproduces the original script's per-bar state machine.

    Feed bars in chronological order via :meth:`update`.  Once at least
    ``lookback`` bars have been seen, each call recomputes the equation matrix
    for the trailing window, updates the consecutive-vote counters and the
    long-only alternating buy/sell state, and returns a :class:`SignalResult`.
    """

    equation_set: int = 1
    lookback: int = 100
    signal_value: int = 2

    # --- internal Pine-equivalent state ---
    buy_signal: int = 0
    sell_signal: int = 0
    can_buy: bool = True
    can_sell: bool = True
    wins: int = 0
    trades: int = 0  # "calcs" in the original
    price_start: float = field(default=NaN)

    _buf: deque = field(default_factory=lambda: deque())

    def __post_init__(self) -> None:
        self._buf = deque(maxlen=self.lookback)

    # -- helpers ----------------------------------------------------------- #
    def reset(self) -> None:
        self.buy_signal = 0
        self.sell_signal = 0
        self.can_buy = True
        self.can_sell = True
        self.wins = 0
        self.trades = 0
        self.price_start = NaN
        self._buf.clear()

    @property
    def ready(self) -> bool:
        return len(self._buf) >= self.lookback

    # -- main entry point -------------------------------------------------- #
    def update(self, bar: dict, can_plot: bool = True) -> SignalResult:
        """Push one chronological OHLCV bar and compute the resulting signal.

        ``bar`` must expose ``open``/``high``/``low``/``close``/``volume`` keys.
        ``can_plot`` mirrors the Pine ``time > firstDate`` gate: when False the
        vote counters still advance (as in the original) but no action is fired
        and the win/trade bookkeeping is frozen.
        """
        self._buf.append(bar)
        if not self.ready:
            return SignalResult(None, 0, 0, self.buy_signal, self.sell_signal,
                                self.wins, self.trades)

        window = list(self._buf)  # chronological, length == lookback
        # Reverse-chronological arrays (index 0 = current bar).
        opens = [b["open"] for b in reversed(window)]
        highs = [b["high"] for b in reversed(window)]
        lows = [b["low"] for b in reversed(window)]
        closes = [b["close"] for b in reversed(window)]
        volumes = [b["volume"] for b in reversed(window)]
        current_close = closes[0]

        matrix = compute_matrix(opens, highs, lows, closes, volumes, self.equation_set)
        buy_votes, sell_votes = tally_votes(matrix)

        # Update consecutive-vote counters (always, regardless of can_plot).
        if buy_votes > sell_votes:
            self.buy_signal += 1
            self.sell_signal = 0
        elif sell_votes > buy_votes:
            self.buy_signal = 0
            self.sell_signal += 1
        # tie -> counters unchanged (matches the original)

        action: Optional[str] = None
        if can_plot:
            buy_fired = self.buy_signal == self.signal_value
            sell_fired = self.sell_signal == self.signal_value

            # The plotted label requires can_buy/can_sell as they stand *now*.
            if buy_fired and self.can_buy:
                action = "BUY"
            elif sell_fired and self.can_sell:
                action = "SELL"

            # State machine + win/trade bookkeeping (mirrors the original; note
            # it keys off ``== signal_value`` regardless of can_buy/can_sell).
            if buy_fired:
                self.can_sell = True
                self.can_buy = False
                self.price_start = current_close
            elif sell_fired:
                if self.can_sell and self.can_buy:
                    self.trades -= 1
                self.can_sell = False
                self.can_buy = True
                if not _isnan(self.price_start) and self.price_start < current_close:
                    self.wins += 1
                self.trades += 1

        return SignalResult(
            action=action,
            buy_votes=buy_votes,
            sell_votes=sell_votes,
            buy_signal=self.buy_signal,
            sell_signal=self.sell_signal,
            wins=self.wins,
            trades=self.trades,
        )


# --------------------------------------------------------------------------- #
# Convenience: run the generator over a pandas DataFrame (used by the backtest)
# --------------------------------------------------------------------------- #
def generate_signals(
    df,
    equation_set: int = 1,
    lookback: int = 100,
    signal_value: int = 2,
    start_timestamp=None,
):
    """Run :class:`SignalGenerator` across a chronological OHLCV DataFrame.

    ``df`` must have columns ``open/high/low/close/volume`` and a sorted
    DatetimeIndex.  Returns ``(actions, final_result)`` where ``actions`` is a
    list of ``(timestamp, "BUY"|"SELL", close)`` tuples.
    """
    gen = SignalGenerator(equation_set=equation_set, lookback=lookback,
                          signal_value=signal_value)
    actions = []
    last: Optional[SignalResult] = None
    for ts, row in df.iterrows():
        can_plot = True if start_timestamp is None else (ts > start_timestamp)
        bar = {
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
        }
        last = gen.update(bar, can_plot=can_plot)
        if last.action:
            actions.append((ts, last.action, bar["close"]))
    return actions, last
