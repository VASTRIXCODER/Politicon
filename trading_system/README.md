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
- [Authentication (Supabase login gate)](#authentication-optional-supabase-login-gate)
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
├── scanner.py            # signals-only engine: ranked, actionable signals + edge
├── webapp.py             # Flask web dashboard (signals-only)
├── ai_brief.py           # optional Claude AI briefing layer (off by default)
├── data.py               # OHLCV fetching (yfinance / Alpaca), normalised
├── broker.py             # Broker interface + Alpaca implementation
├── coinbase_broker.py    # optional crypto scaffold (Coinbase Advanced Trade)
├── risk.py               # position sizing, stops, daily-loss, kill switch
├── engine.py             # the live trading loop
├── backtest.py           # historical simulation + report + equity-curve chart
├── database.py           # SQLite trade log + performance analytics
├── dashboard.py          # rich terminal monitoring UI (broker mode)
├── connectivity_check.py # pre-flight checks
├── main.py               # CLI entry point
├── requirements.txt
├── .env.example
├── setup.sh              # installs deps + runs the connectivity check
└── tests/                # test_signals.py, test_scanner.py
```

## Two ways to run it

| Mode | What it does | Needs a broker / API keys? |
|---|---|---|
| **Signals-only** (`scan`, `web`) | Tells you **what / when / how** to buy — ranked signals with entry, stop, target, exact share count, conviction, and each ticker's backtested edge. You place trades yourself. | **No.** Uses free yfinance data. |
| **Automated** (`run`, `dashboard`) | Auto-executes signals through Alpaca with full risk management. | Yes — Alpaca paper keys. |

Start with **signals-only** — it needs no keys.

## Quick start (signals-only — no keys)

```bash
cd trading_system
./setup.sh                      # creates a venv, installs deps
source .venv/bin/activate       # activate it in your shell
python main.py scan             # ranked signals in the terminal
python main.py web              # browser dashboard → http://127.0.0.1:5000
python main.py backtest --ticker AAPL --start 2022-01-01 --equation both
```

## Quick start (automated paper trading — needs Alpaca keys)

```bash
# edit .env and paste your Alpaca PAPER keys (https://app.alpaca.markets)
python main.py check            # confirm broker + data connectivity
python main.py run              # start PAPER trading
python main.py dashboard        # monitor it (separate terminal)
```

Manual install (instead of `setup.sh`):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then edit it
```

Prefer `make`? The common tasks are wrapped as targets (run `make` to list them):

```bash
make setup     # full setup: venv + deps + .env + connectivity check
make env       # just create .env from .env.example, then paste your keys
make web       # launch the browser dashboard
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
| `ACCOUNT_SIZE` | `100000` | notional account used to size share suggestions (signals-only) |
| `EDGE_YEARS` | `3` | years of history used to compute each ticker's backtested edge |
| `WEB_HOST` / `WEB_PORT` | `127.0.0.1` / `5000` | web dashboard bind address |
| `WEB_REFRESH_SECONDS` | `30` | how often the web dashboard re-scans |
| `AI_BRIEFING` | `false` | enable the optional Claude AI briefing layer |
| `ANTHROPIC_API_KEY` | — | required only when `AI_BRIEFING=true` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` | model for AI briefings |
| `AUTH_ENABLED` | `false` | turn on the optional Supabase login gate (needs the 3 vars below) |
| `SUPABASE_URL` | — | your Supabase project URL |
| `SUPABASE_ANON_KEY` | — | Supabase public anon key (safe to expose to the browser) |
| `SUPABASE_JWT_SECRET` | — | Supabase JWT secret (server-only; verifies logins) |
| `AUTH_ALLOWED_EMAILS` | — | optional comma-separated allow-list of emails |
| `AUTH_COOKIE_SECURE` | `false` | mark the session cookie `Secure` (set `true` when serving over HTTPS) |

See [Authentication (optional Supabase login gate)](#authentication-optional-supabase-login-gate)
below for the full walkthrough.

## Authentication (optional Supabase login gate)

By default the web UI is **open** — bound to `127.0.0.1` it's only reachable
from your own machine. If you want to put the whole dashboard behind a login
(e.g. before exposing it on a network), switch on the built-in **single-tenant
Supabase gate**. It needs no extra Python packages: the server verifies
Supabase's JWT using only the standard library.

**1. Create a Supabase project** at <https://supabase.com> and add at least one
user (Authentication → Users → *Add user*, or enable email sign-ups).

**2. Copy three values from your Supabase dashboard into `.env`:**

| `.env` field | Where to find it in Supabase |
|---|---|
| `SUPABASE_URL` | Project Settings → API → **Project URL** |
| `SUPABASE_ANON_KEY` | Project Settings → API → **Project API keys → `anon` `public`** |
| `SUPABASE_JWT_SECRET` | Project Settings → API → **JWT Settings → JWT Secret** |

**3. Turn the gate on** in `.env` (all four lines):

```env
AUTH_ENABLED=true
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...        # the public anon key
SUPABASE_JWT_SECRET=your-jwt-secret    # stays server-side, never sent to the browser
```

Optional hardening:

```env
AUTH_ALLOWED_EMAILS=you@example.com,teammate@example.com   # empty = anyone who can sign in
AUTH_COOKIE_SECURE=true                                    # set when serving over HTTPS
```

**4. Restart the web app** (`python main.py web`). You'll land on a `/login`
page; sign in with your Supabase email/password and the dashboard unlocks. Sign
out from the command palette (**Account → Sign out**).

The gate stays completely inert unless `AUTH_ENABLED=true` **and** all three
Supabase values are set — leaving them blank keeps the app open exactly as
before. Only the public anon key ever reaches the browser; the JWT secret is
used server-side to verify each login token's signature and expiry.

## Usage

```bash
# signals-only (no broker)
python main.py scan                  # ranked actionable signals in the terminal
python main.py web                   # browser dashboard, auto-refreshes every 30s
python main.py backtest --ticker AAPL --start 2022-01-01 --end 2024-01-01 \
    --equation both --interval 1d --stop 5 --take 10

# walk-forward validation — the honest out-of-sample edge test (run this first!)
python main.py walkforward --tickers AAPL,MSFT,SPY --start 2015-01-01

# verify execution works — places a tiny PAPER order, then cleans up
python main.py testorder

# auto-trading (trades exactly what the dashboard shows)
python main.py autotrade --dry-run   # PREVIEW what it would do — no orders, no keys needed
python main.py check                 # pre-flight connectivity + config checks (needs keys)
python main.py autotrade             # paper trading (real orders need TRADING_MODE=live)
python main.py dashboard             # broker monitoring UI, refreshes every 30s
python main.py report                # performance report from the trade log
python main.py signals               # print the raw signal/votes per ticker
```

### The path to auto-trading (do it in this order)

The engine trades **exactly** what the dashboard recommends, gated by a
market-tuned policy (`AUTOTRADE_SIGNAL`, `AUTOTRADE_MIN_CONVICTION`,
`AUTOTRADE_REQUIRE_UPTREND`). Move through these steps deliberately:

1. **Preview** — `python main.py autotrade --dry-run`. No keys, no orders; it
   prints exactly what it *would* buy/sell (shares, dollars, stops, targets) for
   your `ACCOUNT_SIZE`. Use this to sanity-check the policy.
2. **Paper trade** — add your Alpaca **paper** keys, then `python main.py autotrade`.
   This places **simulated** orders and is a real-time forward-test. Let it run
   for weeks and review `python main.py report`.
3. **Go live (only after paper proves out)** — set `TRADING_MODE=live` and add
   **live** Alpaca keys. This places **real-money** orders. The engine warns
   loudly, paper stays the default, and the **kill switch** (`KILL_SWITCH=true`)
   flattens everything on the next cycle.

> Honest note: paper auto-trading **is** the validation step — it forward-tests
> the strategy with zero risk. Don't skip to live, and remember no strategy
> guarantees profit.

### The web dashboard (an advisor — it places no orders)

`python main.py web` serves a browser dashboard at `http://127.0.0.1:5000`
(use `WEB_PORT=5001` on macOS, where AirPlay grabs 5000). It is **advisory**: it
tells you exactly what to do and you place the trade in your own broker. It
re-scans a diverse default universe (~150 names across 13 sectors + ETFs, or a
named `WATCHLIST`) every `WEB_REFRESH_SECONDS` — pushed live over Server-Sent
Events the instant a scan lands — in parallel (`SCAN_WORKERS`), and shows:

- a **settings panel** — type in your real capital, max % per position, stop %
  and take-profit %; every share count, dollar amount, stop, target and plan
  recomputes instantly and is saved in your browser;
- **order tickets** for each buy — the exact order type (limit / market / stop /
  bracket), share count, dollar cost, stop and target prices, dollar risk and
  reward, and when to place it, step by step;
- a **diversification** breakdown of your buy signals by sector;
- a **portfolio summary** (capital to deploy, total risk, profit-at-targets, EV);
- a full ranked table where every ticker links to a **detail page** with
  interactive price/equity charts, a TradingView technical-rating gauge, full
  edge stats, and signal history;
- an **Options** view that translates your BUY signals into concrete
  at-the-money **call ideas** (premium, break-even, max risk) and lets you look
  up any ticker's option chain — plus a per-ticker **options ticket** on each
  detail page. The original indicator is price-only; this expresses its signals
  with options as **decision support (no orders are placed)**.

Each signal shows a **conviction** score (0–100, from the buy/sell vote margin),
whether **both equations agree** (a STRONG BUY), and the historical **edge** of
the strategy on that specific ticker.

> **No Anthropic key is needed for any of this** — it's all computed from price
> data. **Robinhood** can't be auto-linked (no official stock API; unofficial
> ones violate its ToS and risk your account) — place the dashboard's exact
> orders in the Robinhood app yourself, or use Alpaca for automation.

### Optional Claude AI briefing layer

Off by default. When enabled it adds, to the top buy signals, a plain-English
**rationale** plus a **news/earnings risk-check** (via Claude's web search) — for
example, flagging when a technical buy collides with an upcoming earnings date.

```env
AI_BRIEFING=true
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5     # cheap + fast; good for many tickers
```

> **Honest scope:** the AI layer **does not** improve the quant signal's math or
> its statistical edge (those are fixed formulas), and it does not predict
> prices — it annotates and risk-checks. It costs per API call and can be wrong,
> so treat it as context, not a recommendation. It degrades gracefully: if the
> key is missing or web search is unavailable, signals still display without it.

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

## Crypto & Polymarket engines (frontier feeds)

Two **specialised, read-only engines** run alongside the equity scanner, each
with its own background scan loop and dashboard view:

- **Crypto** (`dexscreener.py`) — scans live on-chain DEX pairs via the public
  [DexScreener API](https://docs.dexscreener.com/api/reference) and ranks
  momentum opportunities (recency-weighted price change + buy/sell pressure,
  gated by liquidity). Includes a token/pair look-up box.
- **Polymarket** (`polymarket.py`) — scans the most active prediction markets via
  the [Gamma API](https://gamma-api.polymarket.com), showing implied
  probabilities, 24h moves and the biggest movers.

Both call the public HTTP APIs directly (the matching **MCP servers in
`.mcp.json` are for the agent/co-pilot layer** — the app can't call MCPs at
runtime, same as TradingView). They are **analysis only**: they surface live
opportunities but place **no on-chain swaps or Polymarket orders** (that needs a
funded wallet and is a deliberate follow-up). Toggle/tune via `.env`:

```env
CRYPTO_ENABLED=true        # CRYPTO_TOKENS=SOL,ETH,WIF   CRYPTO_INTERVAL_SECONDS=45
POLYMARKET_ENABLED=true    # POLYMARKET_INTERVAL_SECONDS=60
```

> Like the rest of the dashboard's live data, these need outbound internet to the
> respective APIs; with no network they show a clear "offline" state rather than
> erroring.

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
