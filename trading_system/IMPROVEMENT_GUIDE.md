# HP Analytics — Signals, Data, Universe & UX Improvement Guide

This is the working design doc the agent generated for itself before making
changes. It captures the architecture reality, the concrete gaps found in the
codebase, and a phased plan. **All four phases (1–4) are now implemented** — see
the roadmap table in §4 for the per-phase breakdown.

---

## 0. Architecture reality (read this first)

The single most important constraint, which shapes every "integrate TradingView"
decision:

- **The TradingView MCP is an _agent-side_ toolset.** It is available to the
  Claude co-pilot and to build-time curation (i.e. the agent running in Claude
  Code). It is **NOT callable from the running Flask app** at request time — the
  app has no MCP client. So the app cannot "ask the MCP" for live data per page
  load.
- Therefore live market data for the app comes from one of three places:
  1. **yfinance** (default) / **Alpaca IEX** — the app's own Python data layer
     (`data.py`, used by `scanner.py` and `engine.py`).
  2. **TradingView _client-side widgets_** — free `embed-widget-*` iframes that
     run in the browser and self-update (advanced chart, ticker tape, heatmap,
     market overview, **technical-analysis gauge**, **screener**, symbol
     overview). This is the real, runtime "TradingView integration."
  3. **(Optional, future)** a server-side `tradingview-screener` Python package
     to pull live screener rows into the app — see Phase 3.
- The MCP itself is best used for: **(a)** one-time universe curation by the
  agent, **(b)** the in-app **co-pilot** (`ai_brief.py`) for market scans and
  per-ticker analysis, **(c)** ad-hoc research.
- Note: several MCP US-equity tools (`yahoo_price`, `market_snapshot`,
  `backtest_strategy`) are **Yahoo-backed** — the same source the app already
  uses. So "much more tickers" is delivered by **curation + widgets**, not by a
  new live feed.

---

## 1. Signal freshness — "make it more in sync and recent"

### Gaps found (file:line)
1. **Daily bars by default** (`config.py` `interval="1d"`). Intraday, the
   "current price" is the partial daily bar / prior close. Biggest "not recent"
   driver.
2. **5-min in-memory df cache** (`scanner.py` `_df_ttl=300`). Fine for 1d, far
   too long for 1m/1h.
3. **Cache keyed by ticker only, not interval** (`scanner.py`). A timeframe
   switch could serve wrong-interval bars; today it's worked around by manually
   clearing the cache in `webapp.py`.
4. **`asof` is _scan time_, not _bar time_** (`scanner.py _now_iso`). The UI's
   "as of" tells you when we computed, **not** how old the price is. The real
   last-bar timestamp (`df.index[-1]`) was never surfaced.
5. **Scan cadence vs UI poll** are independent (`webapp.py`), so the displayed
   `updated` can lag a poll interval.
6. **No market-closed/weekend handling** in the scanner — weekend shows Friday's
   data with a fresh-looking `asof` and no "stale/closed" badge.
7. **Edge in the list is the Pine native win-rate** (`edge_return_pct` always
   0.0) — never changes intraday, feels static.
8. **yfinance intraday delay** (~15 min) compounds the cache delay.

### Fixes
- **[Phase 1] Key the df cache by `(ticker, interval)`** and make the TTL
  **interval-aware** (short for intraday, longer for daily). Removes gap #3,
  mitigates #2/#8.
- **[Phase 1] Surface the real last-bar timestamp.** Add `bar_time` +
  `bar_age_seconds` + a `stale` flag to each signal and the snapshot; render
  "price as of &lt;bar time&gt;" and a data-age badge. Closes gap #4 / #6.
- **[Phase 2] Offer intraday default + a one-click timeframe selector** that
  flushes the cache (`INTERVAL_MAP` already supports 1m/1h). Addresses #1.
- **[Phase 2] SSE/websocket push** on scan completion so the UI updates the
  instant a scan lands instead of on the next poll. Addresses #5.
- **[Phase 3] Wire the scanner to the live quote path** (Alpaca IEX / a latest
  quote) to override the displayed entry price. Today `DATA_SOURCE=alpaca` is
  silently ignored by the dashboard.

---

## 2. Universe — "much much more tickers and options"

### Gaps
- `DEFAULT_TICKERS` was ~54–57 names; `DEFAULT_TICKERS` and `_SECTOR_GROUPS`
  were maintained **separately and could drift**.
- No notion of selectable **watchlists** (sector packs, crypto, ETFs).

### Fixes
- **[Phase 1] Make `_SECTOR_GROUPS` the single source of truth** and derive
  `DEFAULT_TICKERS` + `SECTORS` from it (no drift). Expand to ~140 liquid US
  names across 12 sectors + broad/sector/thematic ETFs.
- **[Phase 1] Add named `WATCHLISTS`** (e.g. `megacap`, `semis`, `ai`,
  `software`, `dividend`, `etfs`, `crypto`, `all`) and a `WATCHLIST` env var to
  pick one. `TICKERS` still overrides everything.
- **[Phase 1] Add a curated crypto pack** (`BTC-USD`, `ETH-USD`, …) — works
  through the existing yfinance path (24/7 symbols).
- **"Options" (centralised, [Phase 3])**: the original Pine script is a
  **price** buy/sell indicator — it has no options logic. Rather than invent an
  options strategy, the app now **translates the equity signal into options**:
  a dedicated **Options view** lists today's BUY signals as at-the-money call
  ideas (premium, break-even, max risk) and lets you look up any chain; each
  ticker's detail page shows an **options ticket** (the contract that expresses
  its signal) plus the full nearest-expiry flow. All of this is built on the
  app's own yfinance option-chain data (`options.py`) — **decision support, not
  order execution.** Actually placing options orders (e.g. via Alpaca's options
  API, paper-first) is a deliberate, higher-risk follow-up, intentionally not
  auto-wired.

> Performance note: the scan pulls ~3y of daily bars per ticker (cached) across
> `SCAN_WORKERS` threads. A very large universe (300+) can hit yfinance rate
> limits; keep the live-scanned default ~120 and use watchlists/`TICKERS` to go
> bigger, bumping `SCAN_WORKERS` accordingly.

---

## 3. UI / visualization / "prediction"

### What "prediction" means here (honest scoping)
This app is a **faithful port of a Pine indicator**; it is not an ML forecaster.
We make the forward-looking read **much stronger** without changing that
identity by surfacing three complementary, recognizable signals:
1. The strategy's own **conviction + backtested expectancy/edge** (already
   computed).
2. **TradingView's Technical-Analysis gauge** — a client-side widget that
   renders a Strong-Buy…Strong-Sell rating from oscillators + moving averages.
   This is the high-value, low-risk "prediction" surface. **[Phase 1]**
3. **Backtest equity / drawdown** visuals. **[Phase 2]**

A genuine ML model (e.g. gradient-boosted next-bar probability) is a separate,
clearly-labeled **[Phase 4]** experiment — documented, not silently bolted on.

### Viz gaps found & plan
- **[Phase 1] TradingView Technical-Analysis gauge** on the **detail page** and
  a **screener widget + TA gauge** in the **Markets** view (the app already
  lazy-loads tape/heatmap/overview the same way).
- **[Phase 1] Data-age badge** on signals (ties to §1).
- **[Phase 2] Mission Control equity sparkline** (today it has KPI cards/tables
  but no chart).
- **[Phase 2] Sector donut** instead of text chips; **portfolio allocation**
  treemap for positions.
- **[Phase 2] Drawdown / underwater chart** and **win/loss + R-multiple
  histograms** (the metrics already exist in `database.py`, just uncharted).

### How to extend safely (from the recon)
- New dashboard view: add a `.navitem[data-view]`, add to `VIEWS`/`TITLES`, add a
  `&lt;section data-views="…"&gt;`, hook `window.onOsView`. Command palette is free.
- New widget: add a container div + load via the existing `tvScript()` pattern
  in `initMarkets()`.
- New endpoint: `@app.route` inside `create_app` (closure access to `service`,
  `controller`, `db`, `briefer`, `config`).
- `fill()` does a naive `__TOKEN__` replace with no escaping — keep new tokens
  unique and escape user-influenced values in JS.

---

## 4. Phased roadmap

| Phase | Scope | Status |
|---|---|---|
| **1** | Universe expansion + watchlists (drift-free); `(ticker,interval)` cache + interval-aware TTL; real bar-time freshness + data-age badge; TradingView Technical-Analysis gauge (detail + markets) + screener widget | **Implemented with this guide** |
| **2** | Timeframe selector (1m/1h/1d, live); SSE push (instant refresh on scan); Mission-Control equity sparkline; sector donut; drawdown/underwater + win/loss charts | **Implemented** |
| **3** | **Centralised Options**: a dedicated Options view (ideas from BUY signals as ATM calls + any-ticker chain lookup), a per-ticker options ticket + flow panel on the detail page (`/api/options/<sym>`, `/api/options/idea/<sym>`, `/api/options/ideas`); optional server-side `tradingview-screener` live movers (`/api/movers`, graceful fallback) | **Implemented** |
| **4** | Experimental next-bar ML predictor (pure-NumPy logistic regression) on the detail page — separate, opt-in (`PREDICT_ENABLED`), clearly labelled, with an honest holdout accuracy; never feeds the strategy | **Implemented** |

---

## 5. Verification expectations
- Backend changes (config/scanner) are unit-checkable without network (synthetic
  DataFrames, config counts, `validate()`).
- UI changes are checkable via the Flask **test client** (assert the widget
  markup / endpoints render), independent of live market data.
