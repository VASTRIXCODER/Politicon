"""
data.py
=======

OHLCV market-data access, normalised to a single tidy shape regardless of the
provider:

    a pandas DataFrame indexed by an ascending tz-aware DatetimeIndex with
    lower-case columns ``open, high, low, close, volume``.

Two providers are supported:

* **yfinance** -- free, great for backtests and perfectly fine for daily/longer
  live cadences.
* **Alpaca market data** -- used when ``DATA_SOURCE=alpaca`` (IEX feed by
  default, which is free).

The rest of the system only ever sees the normalised frame, so swapping
providers never ripples outward.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd


REQUIRED_COLUMNS = ["open", "high", "low", "close", "volume"]


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Lower-case columns, keep OHLCV, drop NaNs, sort ascending by time."""
    if df is None or len(df) == 0:
        return pd.DataFrame(columns=REQUIRED_COLUMNS)

    df = df.copy()
    # Flatten any MultiIndex columns (yfinance does this for single tickers too).
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df.columns = [str(c).lower() for c in df.columns]

    rename = {"adj close": "adj_close"}
    df = df.rename(columns=rename)
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"data is missing columns {missing}; got {list(df.columns)}")

    df = df[REQUIRED_COLUMNS].dropna()
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return df


# --------------------------------------------------------------------------- #
# yfinance
# --------------------------------------------------------------------------- #
def fetch_history_yf(ticker: str, interval: str, start, end=None) -> pd.DataFrame:
    """Historical bars for a backtest (``interval`` is a yfinance string)."""
    import yfinance as yf

    df = yf.download(
        ticker, start=start, end=end, interval=interval,
        auto_adjust=False, progress=False, threads=False,
    )
    return _normalise(df)


def fetch_recent_yf(ticker: str, yf_interval: str, bars: int) -> pd.DataFrame:
    """Most recent ``bars`` rows, respecting yfinance's intraday lookback caps."""
    import yfinance as yf

    # yfinance limits how far back intraday data goes.
    if yf_interval == "1m":
        period = "7d"
    elif yf_interval in ("60m", "1h"):
        period = "60d"
    else:  # daily or longer -- pull enough calendar days to cover `bars`.
        period = f"{max(bars * 2, 30) + 10}d"

    df = yf.Ticker(ticker).history(period=period, interval=yf_interval, auto_adjust=False)
    df = _normalise(df)
    return df.tail(bars)


# --------------------------------------------------------------------------- #
# Provider abstraction
# --------------------------------------------------------------------------- #
class DataProvider:
    """Returns recent normalised bars for the live engine."""

    def __init__(self, config):
        self.config = config

    def recent(self, ticker: str, bars: int) -> pd.DataFrame:
        if self.config.data_source == "alpaca":
            return self._recent_alpaca(ticker, bars)
        return fetch_recent_yf(ticker, self.config.yf_interval, bars)

    def _recent_alpaca(self, ticker: str, bars: int) -> pd.DataFrame:
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

        tf_map = {
            "1m": TimeFrame(1, TimeFrameUnit.Minute),
            "1h": TimeFrame(1, TimeFrameUnit.Hour),
            "1d": TimeFrame(1, TimeFrameUnit.Day),
        }
        tf = tf_map.get(self.config.interval, TimeFrame(1, TimeFrameUnit.Day))

        # Pull a generous window then trim, so we always clear `bars`.
        seconds = self.config.interval_seconds
        start = datetime.now(timezone.utc) - timedelta(seconds=seconds * bars * 3 + 86400)

        client = StockHistoricalDataClient(
            self.config.alpaca_api_key, self.config.alpaca_secret_key
        )
        req = StockBarsRequest(
            symbol_or_symbols=[ticker],
            timeframe=tf,
            start=start,
            feed=self.config.alpaca_data_feed,
        )
        bars_resp = client.get_stock_bars(req)
        df = bars_resp.df
        if df is None or len(df) == 0:
            return pd.DataFrame(columns=REQUIRED_COLUMNS)
        # Alpaca returns a (symbol, timestamp) MultiIndex.
        if isinstance(df.index, pd.MultiIndex):
            df = df.xs(ticker, level="symbol")
        df = _normalise(df)
        return df.tail(bars)
