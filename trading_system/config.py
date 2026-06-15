"""
config.py
=========

Single source of truth for every tunable in the trading system.

Settings are read from environment variables (typically via a local ``.env``
file -- see ``.env.example``) and fall back to sensible, *safe* defaults.  The
most important default: **paper trading**.  Nothing will ever touch real money
unless ``TRADING_MODE=live`` is set explicitly *and* live API keys are present.

Import the ready-made singleton::

    from config import CONFIG
    print(CONFIG.tickers, CONFIG.trading_mode)
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

try:
    from dotenv import load_dotenv
    load_dotenv()  # loads a .env file in the cwd / project root if present
except Exception:  # python-dotenv not installed yet -- env vars still work
    pass


BASE_DIR = Path(__file__).resolve().parent


# A diverse default universe across sectors (used when TICKERS isn't set in .env).
DEFAULT_TICKERS = [
    # Technology
    "AAPL", "MSFT", "NVDA", "AMD", "CRM", "ADBE", "ORCL", "INTC", "CSCO", "QCOM", "AVGO", "TXN",
    # Communication
    "GOOGL", "META", "NFLX", "DIS", "T", "VZ",
    # Consumer Discretionary
    "AMZN", "HD", "MCD", "NKE", "SBUX", "TSLA", "LOW",
    # Consumer Staples
    "WMT", "COST", "KO", "PG", "PEP",
    # Financials
    "JPM", "BAC", "V", "MA", "GS", "WFC", "MS", "C",
    # Healthcare
    "UNH", "JNJ", "LLY", "ABBV", "PFE", "MRK", "TMO",
    # Energy
    "XOM", "CVX", "COP",
    # Industrials
    "CAT", "BA", "GE", "HON", "UPS",
    # Index ETFs
    "SPY", "QQQ", "IWM", "DIA",
]

_SECTOR_GROUPS = {
    "Technology": ["AAPL", "MSFT", "NVDA", "AMD", "CRM", "ADBE", "ORCL", "INTC", "CSCO", "QCOM", "AVGO", "TXN"],
    "Communication": ["GOOGL", "META", "NFLX", "DIS", "T", "VZ"],
    "Consumer Disc.": ["AMZN", "HD", "MCD", "NKE", "SBUX", "TSLA", "LOW"],
    "Consumer Staples": ["WMT", "COST", "KO", "PG", "PEP"],
    "Financials": ["JPM", "BAC", "V", "MA", "GS", "WFC", "MS", "C"],
    "Healthcare": ["UNH", "JNJ", "LLY", "ABBV", "PFE", "MRK", "TMO"],
    "Energy": ["XOM", "CVX", "COP"],
    "Industrials": ["CAT", "BA", "GE", "HON", "UPS"],
    "Index ETF": ["SPY", "QQQ", "IWM", "DIA"],
}
# Flattened ticker -> sector map.
SECTORS = {t: sec for sec, names in _SECTOR_GROUPS.items() for t in names}


# --------------------------------------------------------------------------- #
# Env parsing helpers
# --------------------------------------------------------------------------- #
def _str(key: str, default: str) -> str:
    val = os.getenv(key)
    return val if val is not None and val != "" else default


def _bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None or val == "":
        return default
    return val.strip().lower() in ("1", "true", "yes", "on", "y")


def _int(key: str, default: int) -> int:
    try:
        return int(_str(key, str(default)))
    except ValueError:
        return default


def _float(key: str, default: float) -> float:
    try:
        return float(_str(key, str(default)))
    except ValueError:
        return default


def _list(key: str, default: List[str]) -> List[str]:
    raw = os.getenv(key)
    if not raw:
        return list(default)
    return [item.strip().upper() for item in raw.split(",") if item.strip()]


# Map a trading interval to its yfinance string and seconds-per-bar.
INTERVAL_MAP = {
    "1m": {"yf": "1m", "alpaca": "1Min", "seconds": 60},
    "1h": {"yf": "60m", "alpaca": "1Hour", "seconds": 3600},
    "1d": {"yf": "1d", "alpaca": "1Day", "seconds": 86400},
}


@dataclass
class Config:
    """All runtime settings. Values are resolved from the environment on init."""

    # --- strategy ---------------------------------------------------------- #
    # Which equation set drives the signal (1 = sign(high)*delta(open,8),
    # 2 = the RSI/rank comparison).  The original notes: set 1 suits a 1-day
    # timeframe, set 2 suits a 1-hour timeframe.
    equation_set: int = field(default_factory=lambda: _int("EQUATION_SET", 1))
    lookback_length: int = field(default_factory=lambda: _int("LOOKBACK_LENGTH", 100))
    signal_value: int = field(default_factory=lambda: _int("SIGNAL_VALUE", 2))

    # --- universe & cadence ------------------------------------------------ #
    tickers: List[str] = field(
        default_factory=lambda: _list("TICKERS", DEFAULT_TICKERS)
    )
    # Parallel workers for the multi-ticker scan (keeps a big universe fast).
    scan_workers: int = field(default_factory=lambda: _int("SCAN_WORKERS", 12))
    interval: str = field(default_factory=lambda: _str("INTERVAL", "1d"))
    data_source: str = field(default_factory=lambda: _str("DATA_SOURCE", "yfinance"))

    # --- broker / mode ----------------------------------------------------- #
    trading_mode: str = field(default_factory=lambda: _str("TRADING_MODE", "paper"))
    broker: str = field(default_factory=lambda: _str("BROKER", "alpaca"))

    alpaca_api_key: str = field(default_factory=lambda: _str("ALPACA_API_KEY", ""))
    alpaca_secret_key: str = field(default_factory=lambda: _str("ALPACA_SECRET_KEY", ""))
    # Optional override for the data feed ("iex" is free, "sip" needs a sub).
    alpaca_data_feed: str = field(default_factory=lambda: _str("ALPACA_DATA_FEED", "iex"))

    # Optional Coinbase Advanced Trade keys (crypto expansion).
    coinbase_api_key: str = field(default_factory=lambda: _str("COINBASE_API_KEY", ""))
    coinbase_api_secret: str = field(default_factory=lambda: _str("COINBASE_API_SECRET", ""))

    # --- risk management --------------------------------------------------- #
    max_position_pct: float = field(default_factory=lambda: _float("MAX_POSITION_PCT", 10.0))
    stop_loss_pct: float = field(default_factory=lambda: _float("STOP_LOSS_PCT", 5.0))
    take_profit_pct: float = field(default_factory=lambda: _float("TAKE_PROFIT_PCT", 10.0))
    max_open_positions: int = field(default_factory=lambda: _int("MAX_OPEN_POSITIONS", 5))
    max_daily_loss_pct: float = field(default_factory=lambda: _float("MAX_DAILY_LOSS_PCT", 3.0))

    # When the daily-loss limit is hit, also flatten everything? (default: keep
    # protective stops/take-profits live, just stop opening new positions).
    flatten_on_daily_loss: bool = field(
        default_factory=lambda: _bool("FLATTEN_ON_DAILY_LOSS", False)
    )

    # --- auto-trading policy (which dashboard signals the engine acts on) --- #
    # "strong" = only act on STRONG BUY (both equations agree) -- conservative.
    # "buy"    = act on BUY or STRONG BUY.
    autotrade_signal: str = field(default_factory=lambda: _str("AUTOTRADE_SIGNAL", "strong"))
    # Only enter when conviction >= this (0-100). 0 disables the gate.
    autotrade_min_conviction: float = field(
        default_factory=lambda: _float("AUTOTRADE_MIN_CONVICTION", 0.0)
    )
    # Only enter when the ticker is in an uptrend (price >= SMA50) -- market-tuned.
    autotrade_require_uptrend: bool = field(
        default_factory=lambda: _bool("AUTOTRADE_REQUIRE_UPTREND", True)
    )
    # Global preview switch (the CLI --dry-run flag is the usual way to set this).
    dry_run: bool = field(default_factory=lambda: _bool("DRY_RUN", False))

    # --- ATR-adaptive (volatility-based) risk ----------------------------- #
    # When on, stops/targets/sizing adapt to each stock's recent volatility
    # (Average True Range) instead of fixed percentages. The default sizing
    # risks ATR_RISK_PCT of equity per trade, with the stop distance setting the
    # share count -- proper volatility-normalised risk.
    atr_adaptive: bool = field(default_factory=lambda: _bool("ATR_ADAPTIVE", False))
    atr_period: int = field(default_factory=lambda: _int("ATR_PERIOD", 14))
    atr_stop_mult: float = field(default_factory=lambda: _float("ATR_STOP_MULT", 2.0))
    atr_target_mult: float = field(default_factory=lambda: _float("ATR_TARGET_MULT", 4.0))
    atr_risk_pct: float = field(default_factory=lambda: _float("ATR_RISK_PCT", 1.0))

    # --- aggressive / active mode + AI risk-gate -------------------------- #
    # Aggressive mode loosens entries: acts on BUY (not just STRONG BUY) and
    # ignores the uptrend gate -> more, lower-conviction trades. HIGHER RISK.
    aggressive_mode: bool = field(default_factory=lambda: _bool("AGGRESSIVE_MODE", False))
    # Optional AI risk-gate: before a BUY the engine asks Claude to veto on
    # imminent event risk (earnings/halt/major news). It is a SAFETY FILTER only
    # -- it does NOT train the model or change the strategy. Needs ANTHROPIC_API_KEY.
    ai_gate: bool = field(default_factory=lambda: _bool("AI_GATE", False))

    # --- safety ------------------------------------------------------------ #
    # The kill switch is re-read from the environment on every loop iteration so
    # it can be flipped without restarting the process.
    kill_switch_env: str = "KILL_SWITCH"

    # Only trade when the market is open (equities). Crypto trades 24/7.
    require_market_open: bool = field(
        default_factory=lambda: _bool("REQUIRE_MARKET_OPEN", True)
    )

    # --- signals-only mode / web UI --------------------------------------- #
    # Notional account size used to size share suggestions when not connected
    # to a broker (signals-only mode).
    account_size: float = field(default_factory=lambda: _float("ACCOUNT_SIZE", 100_000.0))
    # Years of history used to compute each ticker's backtested "edge".
    edge_years: float = field(default_factory=lambda: _float("EDGE_YEARS", 3.0))
    web_host: str = field(default_factory=lambda: _str("WEB_HOST", "127.0.0.1"))
    web_port: int = field(default_factory=lambda: _int("WEB_PORT", 5000))
    web_refresh_seconds: int = field(
        default_factory=lambda: _int("WEB_REFRESH_SECONDS", 30)
    )

    # --- optional Claude AI briefing layer (off by default) --------------- #
    ai_briefing: bool = field(default_factory=lambda: _bool("AI_BRIEFING", False))
    anthropic_api_key: str = field(default_factory=lambda: _str("ANTHROPIC_API_KEY", ""))
    anthropic_model: str = field(
        default_factory=lambda: _str("ANTHROPIC_MODEL", "claude-haiku-4-5")
    )

    # --- infra ------------------------------------------------------------- #
    db_path: str = field(default_factory=lambda: _str("DB_PATH", str(BASE_DIR / "trades.db")))
    dashboard_refresh_seconds: int = field(
        default_factory=lambda: _int("DASHBOARD_REFRESH_SECONDS", 30)
    )
    log_level: str = field(default_factory=lambda: _str("LOG_LEVEL", "INFO"))
    # How often the auto-trade engine wakes to re-check signals and (critically)
    # enforce stop-loss / take-profit against the LATEST price -- independent of
    # the bar timeframe. Default 60s so it runs continuously, not once a day.
    engine_interval_seconds: int = field(
        default_factory=lambda: _int("ENGINE_INTERVAL_SECONDS", 60)
    )

    # ---------------------------------------------------------------------- #
    # Derived helpers
    # ---------------------------------------------------------------------- #
    @property
    def is_live(self) -> bool:
        return self.trading_mode.strip().lower() == "live"

    @property
    def is_paper(self) -> bool:
        return not self.is_live

    @property
    def kill_switch(self) -> bool:
        """Re-read every access so it can be toggled at runtime."""
        return _bool(self.kill_switch_env, False)

    def position_pct_for(self, ticker: str) -> float:
        """Per-ticker max position size, falling back to the global default.

        Override a single ticker via ``MAX_POSITION_PCT_<TICKER>`` in the
        environment, e.g. ``MAX_POSITION_PCT_AAPL=5`` or, for symbols with a
        dash, ``MAX_POSITION_PCT_BTC_USD=2``.
        """
        env_key = "MAX_POSITION_PCT_" + ticker.upper().replace("-", "_")
        return _float(env_key, self.max_position_pct)

    def sector_for(self, ticker: str) -> str:
        return SECTORS.get(ticker.upper(), "Other")

    @property
    def interval_seconds(self) -> int:
        return INTERVAL_MAP.get(self.interval, INTERVAL_MAP["1d"])["seconds"]

    @property
    def yf_interval(self) -> str:
        return INTERVAL_MAP.get(self.interval, INTERVAL_MAP["1d"])["yf"]

    @property
    def alpaca_interval(self) -> str:
        return INTERVAL_MAP.get(self.interval, INTERVAL_MAP["1d"])["alpaca"]

    # ---------------------------------------------------------------------- #
    # Validation
    # ---------------------------------------------------------------------- #
    def validate(self) -> List[str]:
        """Return a list of human-readable problems (empty == OK)."""
        problems: List[str] = []

        if self.equation_set not in (1, 2):
            problems.append("EQUATION_SET must be 1 or 2.")
        if self.lookback_length < 1:
            problems.append("LOOKBACK_LENGTH must be >= 1.")
        if self.equation_set == 2 and self.lookback_length < 32:
            problems.append(
                "EQUATION_SET 2 needs LOOKBACK_LENGTH >= 32 "
                "(it uses RSI-20 and a 30-period average)."
            )
        if self.signal_value < 1:
            problems.append("SIGNAL_VALUE must be >= 1.")
        if self.interval not in INTERVAL_MAP:
            problems.append(f"INTERVAL must be one of {list(INTERVAL_MAP)}.")
        if self.data_source not in ("yfinance", "alpaca"):
            problems.append("DATA_SOURCE must be 'yfinance' or 'alpaca'.")
        if self.trading_mode.lower() not in ("paper", "live"):
            problems.append("TRADING_MODE must be 'paper' or 'live'.")
        if self.broker not in ("alpaca", "coinbase"):
            problems.append("BROKER must be 'alpaca' or 'coinbase'.")

        if not (0 < self.max_position_pct <= 100):
            problems.append("MAX_POSITION_PCT must be in (0, 100].")
        if self.stop_loss_pct <= 0:
            problems.append("STOP_LOSS_PCT must be > 0.")
        if self.take_profit_pct <= 0:
            problems.append("TAKE_PROFIT_PCT must be > 0.")
        if self.max_open_positions < 1:
            problems.append("MAX_OPEN_POSITIONS must be >= 1.")
        if self.max_daily_loss_pct <= 0:
            problems.append("MAX_DAILY_LOSS_PCT must be > 0.")

        if self.broker == "alpaca" and not (self.alpaca_api_key and self.alpaca_secret_key):
            problems.append(
                "ALPACA_API_KEY / ALPACA_SECRET_KEY are not set "
                "(needed for the Alpaca broker)."
            )

        # Loud guard rail: live trading is opt-in and must be deliberate.
        if self.is_live:
            problems.append(
                "TRADING_MODE=live is enabled -- this places REAL orders. "
                "Remove this line only if that is truly intended."
            )

        return problems

    def summary(self) -> str:
        return (
            f"mode={self.trading_mode} broker={self.broker} "
            f"equation_set={self.equation_set} lookback={self.lookback_length} "
            f"interval={self.interval} source={self.data_source} "
            f"tickers={','.join(self.tickers)}"
        )


# Importable singleton.
CONFIG = Config()
