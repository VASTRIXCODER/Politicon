# HP Analytics Automated Trading System

A fully automated trading system built around the **"HP Analytics Buy/Sell
Indicator V1"** Pine Script (© FLIPPER401, MPL-2.0). It faithfully ports the
indicator's two equation sets to Python, generates buy/sell signals identical to
the TradingView chart, and wraps them in a complete trading stack: broker
integration (Alpaca), risk management, a live engine, a backtester, trade
logging, performance reporting, and a monitoring dashboard.

> ⚠️ **Trading involves risk of loss. This software is provided for research and
> educational purposes and is _not_ financial advice. It defaults to PAPER
> trading. You are solely responsible for any live trading you enable. Test
> thoroughly on paper first.**

---

## Table of contents

- [How the strategy works](#how-the-strategy-works)
- [Faithfulness to the original script](#faithfulness-to-the-original-script-the-quirks)
- [Project layout](#project-layout)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
- [Risk management](#risk-management)
- [Safety features](#safety-features)
- [Crypto / Coinbase (optional)](#crypto--coinbase-optional)
- [Known limitations](#known-limitations)

---

## How the strategy works

Every bar, the indicator builds fixed-length arrays from the most recent
`LOOKBACK_LENGTH` bars (default 100) and computes one of two "equation sets":

- **Equation set 1** — `sign(high) * delta(open, 8)`. Since `high` is positive,
  this is essentially the sign of an 8-period change in `open`. Designed for the
  **1-day** timeframe.
- **Equation set 2** — two rows combined:
  1. `rank(RSI(close, 7)) - rank(delta(close, 10))`
  2. `rank(RSI(close, 20)) - rank(close - avg(close, 30))`

  Designed for the **1-hour** timeframe.

Each cell of the resulting matrix votes: `> 0` is a buy vote, `< 0` is a sell
vote. If buy votes beat sell votes the bar is "buy-dominant" (and vice-versa). A
**signal fires after `SIGNAL_VALUE` consecutive dominant bars** (default 2). The
strategy is **long-only and alternating**: a BUY opens a long, the next SELL
closes it, and so on. The win/trade counters mirror the table shown in the
original script.

Select the equation set and lookback via config:

```env
EQUATION_SET=1      # or 2
LOOKBACK_LENGTH=100
SIGNAL_VALUE=2
```

## Faithfulness to the original script (the "quirks")

The goal is to reproduce the **exact same signals** the Pine Script plots. The
original contains several behaviours that differ from the textbook formulas they
resemble; these are **preserved on purpose** and flagged with `# QUIRK` comments
in [`signals.py`](signals.py):

1. The arrays are **reverse-chronological** (index 0 = current bar).
2. `tsDeltaSeries` mutates the series **in place while iterating forward**, so
   for indices `≥ 16` the lag-8 delta uses an already-modified value (a
   cumulative effect).
3. The hand-rolled `rsi` has a mis-parenthesised smoothing step, and its slice
   drops the most recent delta (output length is `n − period − 1`).
4. `delta(s, period)` is a **1-bar** difference that merely *starts* at index
   `period` (period is an offset, not the lag).
5. `avg(s, period)` sums `period − 2` elements but divides by `period`.
6. `rankSeries` **sorts the array in place** before assigning a competition-style
   rank with an off-by-one duplicate check.
7. `adv20` and the `vwap` array are computed in the original but never used, so
   they are omitted (they cannot affect signals).

If you want the "textbook" versions of these indicators instead, that is a
different strategy — this port's contract is *match the original chart*.

## Project layout

```
trading_system/
├── config.py             # all settings (env-driven, paper by default)
├── signals.py            # the ported equation logic + signal state machine
├── data.py               # OHLCV fetching (yfinance / Alpaca), normalised
├── broker.py             # Broker interface + Alpaca implementation
├── coinbase_broker.py    # optional crypto scaffold (Coinbase Advanced Trade)
├── risk.py               # position sizing, stops, daily-loss, kill switch
├── engine.py             # the live trading loop
├── backtest.py           # historical simulation + report + equity-curve chart
├── database.py           # SQLite trade log + performance analytics
├── dashboard.py          # rich terminal monitoring UI
├── connectivity_check.py # pre-flight checks
├── main.py               # CLI entry point
├── requirements.txt
├── .env.example
├── setup.sh              # installs deps + runs the connectivity check
└── tests/test_signals.py
```

## Quick start

```bash
cd trading_system
./setup.sh                      # creates a venv, installs deps, writes .env, runs checks
# edit .env and paste your Alpaca PAPER keys (https://app.alpaca.markets)
python main.py check            # confirm broker + data connectivity
python main.py backtest --ticker AAPL --start 2022-01-01 --equation both
python main.py run              # start PAPER trading
python main.py dashboard        # monitor it (separate terminal)
```

Manual install (instead of `setup.sh`):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then edit it
```

## Configuration

All settings live in `config.py` and are overridable via environment variables
(typically a local `.env` — see [`.env.example`](.env.example)). Highlights:

| Variable | Default | Meaning |
|---|---|---|
| `TRADING_MODE` | `paper` | `paper` or `live`. **Live places real orders.** |
| `KILL_SWITCH` | `false` | `true` → cancel orders + flatten everything, then stop |
| `EQUATION_SET` | `1` | `1` or `2` |
| `LOOKBACK_LENGTH` | `100` | bars used per equation |
| `SIGNAL_VALUE` | `2` | consecutive dominant bars required to fire |
| `TICKERS` | `AAPL,MSFT,SPY` | comma-separated universe |
| `INTERVAL` | `1d` | `1m`, `1h`, or `1d` (loop cadence + bar size) |
| `DATA_SOURCE` | `yfinance` | `yfinance` or `alpaca` |
| `MAX_POSITION_PCT` | `10` | max % of portfolio per position |
| `STOP_LOSS_PCT` | `5` | stop-loss % below entry |
| `TAKE_PROFIT_PCT` | `10` | take-profit % above entry |
| `MAX_OPEN_POSITIONS` | `5` | max concurrent positions |
| `MAX_DAILY_LOSS_PCT` | `3` | halt new entries if equity drops this % in a day |
| `FLATTEN_ON_DAILY_LOSS` | `false` | also close everything when the limit hits |
| `REQUIRE_MARKET_OPEN` | `true` | only enter while the equities market is open |

## Usage

```bash
python main.py check                 # pre-flight connectivity + config checks
python main.py run                   # live trading loop (paper unless TRADING_MODE=live)
python main.py dashboard             # monitoring UI, refreshes every 30s
python main.py signals               # print the current signal/votes per ticker
python main.py report                # performance report from the trade log
python main.py backtest --ticker AAPL --start 2022-01-01 --end 2024-01-01 \
    --equation both --interval 1d --stop 5 --take 10
```

The backtest prints a full report (win rate, total return, avg win/loss, largest
win, max drawdown, Sharpe) plus the indicator's own Wins/Trades/Win-Loss figures,
and saves an equity-curve PNG.

## Risk management

Every order is gated through [`risk.py`](risk.py):

- **Position size** — capped at `MAX_POSITION_PCT` of portfolio value and by
  available buying power. Override per ticker with
  `MAX_POSITION_PCT_<TICKER>` (e.g. `MAX_POSITION_PCT_AAPL=5`).
- **Stop-loss / take-profit** — computed for every entry and checked against the
  latest price on each loop; either one triggers a market exit.
- **Max concurrent positions** — `MAX_OPEN_POSITIONS`.
- **Max daily loss** — once equity falls `MAX_DAILY_LOSS_PCT` below the day's
  starting equity, new entries halt for the rest of the trading day (protective
  stops/take-profits stay active; set `FLATTEN_ON_DAILY_LOSS=true` to also close
  everything).
- **Kill switch** — see below.

## Safety features

- **Paper trading is the default.** Live trading requires `TRADING_MODE=live`
  *and* live keys; the connectivity check and engine both warn loudly when live.
- **Kill switch** — set `KILL_SWITCH=true` in the environment (or `.env`). It is
  re-read on every loop iteration, so you can flip it without restarting; the
  engine immediately cancels all open orders, closes all positions, records the
  exits, and stops.
- The engine never lets a single bad cycle crash the loop, and shuts down
  gracefully on Ctrl-C / SIGTERM.

## Crypto / Coinbase (optional)

`coinbase_broker.py` is a **scaffold** implementing the same `Broker` interface
via the official `coinbase-advanced-py` SDK. To experiment:

```bash
pip install coinbase-advanced-py
# in .env:  BROKER=coinbase  + COINBASE_API_KEY / COINBASE_API_SECRET
# TICKERS=BTC-USD,ETH-USD  REQUIRE_MARKET_OPEN=false
```

It is intentionally conservative — order placement and pricing are wired up, but
position reconstruction from wallet balances and order cancellation are left as
clearly-marked `TODO`s. Test on tiny sizes before relying on it.

## Known limitations

- **Live warmup** primes the signal state from *recent* history only; for state
  that exactly matches a full-history TradingView chart, validate the same range
  with `backtest.py`.
- **Forming bars**: depending on the data source, the most recent bar may still
  be forming. Prefer running shortly after each bar closes, or use a feed that
  returns only closed bars, to avoid acting on incomplete data.
- **yfinance intraday limits**: 1-minute data is only available for ~7 days and
  1-hour for ~60 days. Use `DATA_SOURCE=alpaca` for longer intraday history.
- Recorded entry/exit prices are best-effort (the position's average fill, or
  the latest trade price); real market-order fills can differ slightly.

---

*Strategy logic derived from the open-source Pine Script "HP Analytics Buy/Sell
Indicator V1" by FLIPPER401, used under the Mozilla Public License 2.0.*
