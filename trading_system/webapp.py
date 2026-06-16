"""
webapp.py
=========

The unified **control center** — one beautiful page that merges everything:

* **Engine control** — Preview / Start / Stop buttons that drive the auto-trading
  backend in a background thread, with a live activity feed.
* **Live account** — portfolio value, buying power, equity, open positions and
  today's closed trades, straight from your Alpaca account.
* **Signals** — the full advisor (Top Buys with order tickets, sortable table,
  sparklines, context indicators).
* **Your settings** — capital / risk that size everything instantly.

It places no orders on its own — *you* press Start, and even then it's **paper
by default** (live needs ``TRADING_MODE=live`` set deliberately, and the Start
button asks for confirmation in live mode). The kill switch and all risk controls
still apply.

Run::  python main.py web   →   http://127.0.0.1:5000  (use WEB_PORT=5051 on macOS)
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

from config import CONFIG, INTERVAL_MAP, apply_day_trade_preset
from scanner import Scanner, TickerSignal

log = logging.getLogger("webapp")


def _build_tag() -> str:
    """Short git commit of the running code, so the UI can show which build it is."""
    import os
    import subprocess
    try:
        h = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        return h or "unknown"
    except Exception:
        return "zip (not a git clone)"


# --------------------------------------------------------------------------- #
# Background signal scanning
# --------------------------------------------------------------------------- #
class ScannerService:
    def __init__(self, config=CONFIG, briefer=None):
        self.config = config
        self.scanner = Scanner(config, briefer=briefer)
        self._lock = threading.Lock()
        # Condition shares the lock so we can bump version + notify SSE listeners
        # atomically from inside the scan loop.
        self._cv = threading.Condition(self._lock)
        self._version = 0
        self._signals: List[TickerSignal] = []
        self._status = "starting"
        self._updated: Optional[str] = None
        self._error: Optional[str] = None
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            with self._lock:
                self._status = "scanning"
            try:
                signals = self.scanner.scan()
                with self._lock:
                    self._signals = signals
                    self._status = "ok"
                    self._error = None
                    self._updated = time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime())
                    self._version += 1
                    self._cv.notify_all()  # wake SSE listeners the instant a scan lands
            except Exception as exc:  # pragma: no cover
                log.exception("scan loop error")
                with self._lock:
                    self._status = "error"
                    self._error = str(exc)
                    self._version += 1
                    self._cv.notify_all()
            self._stop.wait(max(5, self.config.web_refresh_seconds))

    def version(self) -> int:
        with self._lock:
            return self._version

    def wait_for_update(self, last_version: int, timeout: float) -> int:
        """Block until the scan version moves past ``last_version`` (or timeout)."""
        with self._cv:
            if self._version == last_version:
                self._cv.wait(timeout)
            return self._version

    def snapshot(self) -> Dict:
        with self._lock:
            signals = list(self._signals)
            status, updated, error = self._status, self._updated, self._error
        return {
            "status": status, "updated": updated, "error": error, "version": self._version,
            "ai_enabled": bool(self.scanner.briefer and self.scanner.briefer.enabled),
            "config": {"equation_set": self.config.equation_set, "lookback": self.config.lookback_length,
                       "interval": self.config.interval, "universe": len(self.config.tickers),
                       "data_source": self.config.data_source,
                       "atr_adaptive": self.config.atr_adaptive, "atr_risk_pct": self.config.atr_risk_pct,
                       "atr_stop_mult": self.config.atr_stop_mult, "atr_target_mult": self.config.atr_target_mult},
            "signals": [_signal_json(s) for s in signals],
        }


def _signal_json(s: TickerSignal) -> Dict:
    d = s.as_dict()
    d["eq1"] = asdict(s.eq1) if s.eq1 else None
    d["eq2"] = asdict(s.eq2) if s.eq2 else None
    d["is_buy"] = s.is_buy
    return d


# --------------------------------------------------------------------------- #
# Engine controller — start/stop the auto-trader in a background thread
# --------------------------------------------------------------------------- #
class _BufHandler(logging.Handler):
    def __init__(self, buf: deque):
        super().__init__()
        self.buf = buf

    def emit(self, record):
        try:
            self.buf.append(self.format(record))
        except Exception:
            pass


class _DbLogHandler(logging.Handler):
    """Persists engine log lines to SQLite so the Logs view keeps full history."""

    def __init__(self, db):
        super().__init__()
        self.db = db

    def emit(self, record):
        try:
            self.db.log_event(record.getMessage(), level=record.levelname)
        except Exception:
            pass


class EngineController:
    def __init__(self, config=CONFIG, db=None):
        self.config = config
        self.db = db
        self._engine = None
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._started_at: Optional[str] = None
        self._log_buffer: deque = deque(maxlen=300)
        eng_log = logging.getLogger("engine")
        eng_log.setLevel(logging.INFO)  # ensure INFO cycle logs reach the activity feed
        h = _BufHandler(self._log_buffer)
        h.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%H:%M:%S"))
        eng_log.addHandler(h)
        if db is not None:
            eng_log.addHandler(_DbLogHandler(db))  # full persistent history

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self, dry_run: bool = False) -> Dict:
        from engine import TradingEngine
        with self._lock:
            if self.running:
                return {"ok": False, "error": "already running"}
            try:
                self._engine = TradingEngine(self.config, dry_run=dry_run)
            except Exception as exc:
                return {"ok": False, "error": str(exc)}
            self._started_at = time.strftime("%H:%M:%SZ", time.gmtime())
            self._thread = threading.Thread(target=self._run_safe, daemon=True)
            self._thread.start()
            return {"ok": True}

    def _run_safe(self) -> None:
        try:
            self._engine.run()
        except Exception:
            log.exception("engine thread crashed")

    def stop(self) -> Dict:
        if self._engine is not None:
            self._engine._stop = True
        return {"ok": True}

    def preview(self) -> List[Dict]:
        from engine import TradingEngine
        return TradingEngine(self.config, dry_run=True).preview_rows()

    def status(self) -> Dict:
        mode = "PAPER"
        if self._engine is not None and self._engine.dry_run:
            mode = "DRY-RUN"
        elif self.config.is_live:
            mode = "LIVE"
        return {
            "running": self.running,
            "mode": mode,
            "aggressive": self.config.aggressive_mode,
            "ai_gate": self.config.ai_gate,
            "started_at": self._started_at if self.running else None,
            "kill_switch": self.config.kill_switch,
            "policy": {
                "signal": self.config.autotrade_signal,
                "min_conviction": self.config.autotrade_min_conviction,
                "require_uptrend": self.config.autotrade_require_uptrend,
            },
            "recent": list(self._log_buffer)[-40:],
        }


# --------------------------------------------------------------------------- #
# Flask app
# --------------------------------------------------------------------------- #
def create_app(config=CONFIG):
    try:
        from flask import Flask, Response, jsonify, redirect, request
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("Flask is required for the web UI: pip install flask") from exc

    from ai_brief import AIBriefer
    from database import Database

    app = Flask(__name__)
    briefer = AIBriefer(config)
    service = ScannerService(config, briefer=briefer)
    service.start()
    db = Database(config.db_path)
    controller = EngineController(config, db)
    broker_holder: Dict = {"broker": None, "error": None, "tried": False}

    # Specialised frontier engines (separate scan loops; read-only/analysis).
    crypto_engine = polymarket_engine = None
    if config.crypto_enabled:
        from live_engines import CryptoEngine
        crypto_engine = CryptoEngine(tokens=config.crypto_tokens or None,
                                     interval=config.crypto_interval_seconds)
        crypto_engine.start()
    if config.polymarket_enabled:
        from live_engines import PolymarketEngine
        polymarket_engine = PolymarketEngine(interval=config.polymarket_interval_seconds)
        polymarket_engine.start()

    def display_broker():
        if not broker_holder["tried"]:
            broker_holder["tried"] = True
            try:
                from broker import build_broker
                broker_holder["broker"] = build_broker(config)
            except Exception as exc:
                broker_holder["error"] = str(exc)
        return broker_holder["broker"]

    # ----- one-click "Day-trade mode" preset ------------------------------- #
    # Bundles the three levers that actually create fast-paced behaviour:
    # 1h bars (signals refresh intraday), aggressive entries (act on any BUY),
    # and a fast engine loop. Turning it off restores whatever was set before.
    daytrade: Dict = {"on": False, "saved": None}

    def _flush_scanner_caches():
        # The df cache is keyed by ticker only, so a timeframe change must clear
        # it or stale daily bars get served for the new hourly requests.
        try:
            service.scanner._df_cache.clear()
        except Exception:
            pass
        eng = getattr(controller, "_engine", None)
        if eng is not None:
            try:
                eng.scanner._df_cache.clear()
            except Exception:
                pass

    def _set_day_trade(on: bool):
        if on and not daytrade["on"]:
            daytrade["saved"] = {
                "interval": config.interval,
                "aggressive_mode": config.aggressive_mode,
                "engine_interval_seconds": config.engine_interval_seconds,
            }
            apply_day_trade_preset(config)
            daytrade["on"] = True
            _flush_scanner_caches()
        elif not on and daytrade["on"]:
            saved = daytrade["saved"] or {}
            config.interval = saved.get("interval", "1d")
            config.aggressive_mode = saved.get("aggressive_mode", False)
            config.engine_interval_seconds = saved.get("engine_interval_seconds", 60)
            daytrade["on"] = False
            daytrade["saved"] = None
            _flush_scanner_caches()

    defaults = {
        "__REFRESH__": str(config.web_refresh_seconds), "__CAP__": str(config.account_size),
        "__MAXPCT__": str(config.max_position_pct), "__STOPPCT__": str(config.stop_loss_pct),
        "__TGTPCT__": str(config.take_profit_pct), "__ATRRISK__": str(config.atr_risk_pct),
        "__ATRSTOPM__": str(config.atr_stop_mult), "__ATRTGTM__": str(config.atr_target_mult),
        "__BUILD__": _build_tag(),
    }

    def fill(tpl: str, extra: Optional[Dict] = None) -> str:
        for k, v in {**defaults, **(extra or {})}.items():
            tpl = tpl.replace(k, v)
        return tpl

    @app.route("/")
    def index():
        return Response(fill(_MAIN_PAGE), mimetype="text/html")

    @app.route("/ticker/<sym>")
    def ticker_page(sym):
        return Response(fill(_DETAIL_PAGE, {"__TICKER__": sym.upper()}), mimetype="text/html")

    @app.route("/api/signals")
    def api_signals():
        return jsonify(service.snapshot())

    @app.route("/api/ticker/<sym>")
    def api_ticker(sym):
        try:
            eq = int(request.args.get("eq", "1"))
            eq = eq if eq in (1, 2) else 1
            return jsonify(service.scanner.detail(sym.upper(), eq))
        except Exception as exc:  # pragma: no cover
            return jsonify({"ticker": sym.upper(), "error": str(exc)}), 200

    @app.route("/api/account")
    def api_account():
        out: Dict = {"account": None, "broker_error": None, "positions": [],
                     "engine": controller.status()}
        out["engine"]["day_trade"] = daytrade["on"]
        out["engine"]["interval"] = config.interval
        out["engine"]["loop_secs"] = config.engine_interval_seconds
        # Surface the live market regime + the position cap currently in force.
        from risk import RiskManager, market_regime
        _reg = market_regime(service._signals)
        out["engine"]["regime"] = _reg
        out["engine"]["dynamic_positions"] = config.dynamic_positions
        out["engine"]["max_open_fixed"] = config.max_open_positions
        broker = display_broker()
        if broker is None:
            out["broker_error"] = broker_holder["error"] or "no broker configured"
        else:
            try:
                a = broker.get_account()
                out["account"] = {"equity": a.equity, "cash": a.cash,
                                  "buying_power": a.buying_power, "portfolio_value": a.portfolio_value}
                out["positions"] = [
                    {"symbol": p.symbol, "qty": p.qty, "avg_entry_price": p.avg_entry_price,
                     "current_price": p.current_price, "market_value": p.market_value,
                     "unrealized_pl": p.unrealized_pl, "unrealized_plpc": p.unrealized_plpc}
                    for p in broker.get_positions()
                ]
            except Exception as exc:
                out["broker_error"] = str(exc)
        _eq = (out["account"] or {}).get("equity") or config.account_size
        out["engine"]["max_open_effective"] = RiskManager(config).effective_position_cap(
            _eq, _reg["score"])
        start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
        out["today"] = [
            {"ticker": t["ticker"], "entry_price": t["entry_price"], "exit_price": t["exit_price"],
             "pnl_dollars": t["pnl_dollars"], "pnl_pct": t["pnl_pct"], "exit_reason": t["exit_reason"]}
            for t in db.get_closed_trades(since_iso=start)
        ]
        out["report"] = db.performance_report()
        return jsonify(out)

    @app.route("/api/engine/start", methods=["POST"])
    def api_engine_start():
        return jsonify(controller.start(dry_run=bool((request.get_json(silent=True) or {}).get("dry_run"))))

    @app.route("/api/engine/stop", methods=["POST"])
    def api_engine_stop():
        return jsonify(controller.stop())

    @app.route("/api/engine/preview", methods=["POST"])
    def api_engine_preview():
        return jsonify({"rows": controller.preview()})

    @app.route("/api/config", methods=["POST"])
    def api_config():
        body = request.get_json(silent=True) or {}
        if "atr_adaptive" in body:
            config.atr_adaptive = bool(body["atr_adaptive"])
        if "aggressive_mode" in body:
            config.aggressive_mode = bool(body["aggressive_mode"])
        if "ai_gate" in body:
            config.ai_gate = bool(body["ai_gate"])
        if "day_trade" in body:
            _set_day_trade(bool(body["day_trade"]))
        if "interval" in body:
            iv = str(body["interval"]).strip()
            if iv in INTERVAL_MAP and iv != config.interval:
                config.interval = iv
                _flush_scanner_caches()  # force a refetch at the new bar size
        if "dynamic_positions" in body:
            config.dynamic_positions = bool(body["dynamic_positions"])

        autotune = None
        if body.get("autotune"):
            # Read current market conditions and apply the best RISK-ADJUSTED combo.
            # NOT a profit guarantee -- it adapts entries/sizing/cap to the regime.
            from risk import RiskManager, market_regime
            reg = market_regime(service._signals)
            s = reg["score"]
            config.dynamic_positions = True     # equity + market-aware position cap
            config.atr_adaptive = True          # volatility-normalised sizing & stops
            config.autotrade_require_uptrend = True
            if s >= 0.70:                        # risk-on -> lean in
                config.aggressive_mode = True
                config.autotrade_signal = "buy"
            elif s < 0.45:                       # risk-off -> defensive
                config.aggressive_mode = False
                config.autotrade_signal = "strong"
            else:                                # neutral
                config.aggressive_mode = False
                config.autotrade_signal = "buy"
            eq = config.account_size
            try:
                b = display_broker()
                if b is not None:
                    eq = b.get_account().equity
            except Exception:
                pass
            cap = RiskManager(config).effective_position_cap(eq, s)
            autotune = {"regime": reg, "cap": cap, "message": (
                f"{reg['label']} market (score {s:.2f}, {int(reg['uptrend_frac']*100)}% of names "
                f"in uptrend): {'aggressive' if config.aggressive_mode else 'conservative'} entries, "
                f"ATR-adaptive sizing, dynamic cap ≈ {cap} positions. Risk-adjusted, not a "
                f"profit guarantee.")}

        resp = {"ok": True, "atr_adaptive": config.atr_adaptive,
                "aggressive_mode": config.aggressive_mode, "ai_gate": config.ai_gate,
                "day_trade": daytrade["on"], "interval": config.interval,
                "dynamic_positions": config.dynamic_positions,
                "autotrade_signal": config.autotrade_signal,
                "engine_interval_seconds": config.engine_interval_seconds}
        if autotune:
            resp["autotune"] = autotune
        return jsonify(resp)

    @app.route("/api/stream")
    def api_stream():
        # Server-Sent Events: pushes a "tick" the instant a scan completes so the
        # browser refetches immediately instead of waiting for its poll interval.
        once = request.args.get("once")

        def gen():
            yield "retry: 5000\n\n"
            last = service.wait_for_update(-1, 0)   # current version, no wait
            yield f"event: tick\ndata: {last}\n\n"
            if once:
                return
            deadline = time.time() + 120   # recycle the connection ~every 2 min
            while time.time() < deadline:
                v = service.wait_for_update(last, 15)
                if v != last:
                    last = v
                    yield f"event: tick\ndata: {v}\n\n"
                else:
                    yield ": keepalive\n\n"          # heartbeat to hold the connection

        resp = Response(gen(), mimetype="text/event-stream")
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["X-Accel-Buffering"] = "no"    # don't let proxies buffer SSE
        return resp

    @app.route("/api/options/<sym>")
    def api_options(sym):
        from options import options_summary
        return jsonify(options_summary(sym, request.args.get("expiry")))

    @app.route("/api/options/idea/<sym>")
    def api_option_idea(sym):
        from options import options_idea
        side = "bear" if request.args.get("side") == "bear" else "bull"
        return jsonify(options_idea(sym.upper(), side=side, spot=request.args.get("spot", type=float)))

    @app.route("/api/options/ideas")
    def api_option_ideas():
        # Express the current top BUY signals as call ideas (decision support).
        from options import options_idea
        with service._lock:
            sigs = list(service._signals)
        buys = [s for s in sigs if s.is_buy and not s.error][:6]
        ideas = []
        for s in buys:
            idea = options_idea(s.ticker, side="bull", spot=s.price)
            idea.update({"recommendation": s.recommendation, "conviction": s.conviction,
                         "sector": s.sector})
            ideas.append(idea)
        return jsonify({"ideas": ideas, "count": len(ideas)})

    @app.route("/api/movers")
    def api_movers():
        from market_extras import live_movers
        direction = "losers" if request.args.get("dir") == "losers" else "gainers"
        return jsonify(live_movers(direction))

    # ----- frontier feeds: crypto (DexScreener) + Polymarket ----------------- #
    @app.route("/api/crypto")
    def api_crypto():
        if not crypto_engine:
            return jsonify({"status": "disabled", "items": [],
                            "error": "crypto engine off (set CRYPTO_ENABLED=true)"})
        return jsonify(crypto_engine.snapshot())

    @app.route("/api/crypto/search")
    def api_crypto_search():
        import dexscreener
        q = (request.args.get("q") or "").strip()
        if not q:
            return jsonify({"items": [], "error": "empty query"})
        items, err = dexscreener.search_top(q)
        return jsonify({"items": items, "error": err})

    @app.route("/api/polymarket")
    def api_polymarket():
        if not polymarket_engine:
            return jsonify({"status": "disabled", "items": [], "movers": [],
                            "error": "polymarket engine off (set POLYMARKET_ENABLED=true)"})
        return jsonify(polymarket_engine.snapshot())

    @app.route("/api/polymarket/market")
    def api_polymarket_market():
        import polymarket as pm
        slug = (request.args.get("slug") or "").strip()
        if not slug:
            return jsonify({"error": "empty slug"})
        return jsonify(pm.market_detail(slug))

    @app.route("/api/predict/<sym>")
    def api_predict(sym):
        if not config.predict_enabled:
            return jsonify({"error": "prediction disabled (set PREDICT_ENABLED=true)"})
        from predict import predict_next_up
        try:
            df = service.scanner._fetch(sym.upper())
        except Exception as exc:
            return jsonify({"error": f"data fetch failed: {exc}"})
        return jsonify(predict_next_up(df))

    @app.route("/api/engine/log")
    def api_engine_log():
        limit = min(int(request.args.get("limit", 600) or 600), 5000)
        return jsonify({"rows": db.get_engine_log(
            limit=limit, search=request.args.get("q") or None,
            level=request.args.get("level") or None)})

    @app.route("/api/performance")
    def api_performance():
        base = float(config.account_size)
        report = db.performance_report(starting_equity=base)
        series = db.equity_series(starting_equity=base)
        closed = [
            {"ticker": t["ticker"], "entry_price": t["entry_price"], "exit_price": t["exit_price"],
             "qty": t["qty"], "pnl_dollars": t["pnl_dollars"], "pnl_pct": t["pnl_pct"],
             "exit_time": t["exit_time"], "exit_reason": t["exit_reason"]}
            for t in db.get_closed_trades()
        ][-300:][::-1]
        return jsonify({"report": report, "equity": series, "closed": closed,
                        "starting_equity": base})

    @app.route("/api/backtest")
    def api_backtest():
        from datetime import timedelta
        from config import INTERVAL_MAP
        ticker = (request.args.get("ticker") or "AAPL").upper().strip()
        eq = int(request.args.get("eq", config.equation_set) or config.equation_set)
        eq = eq if eq in (1, 2) else 1
        interval = request.args.get("interval") or config.interval
        if interval not in INTERVAL_MAP:
            interval = config.interval
        try:
            years = max(0.5, min(float(request.args.get("years", 3) or 3), 15))
        except ValueError:
            years = 3.0
        try:
            from data import fetch_history_yf
            from backtest import simulate
            yf_interval = INTERVAL_MAP[interval]["yf"]
            start = (datetime.now(timezone.utc) - timedelta(days=int(years * 365) + 30)).strftime("%Y-%m-%d")
            df = fetch_history_yf(ticker, yf_interval, start)
            if df is None or len(df) < config.lookback_length + 5:
                return jsonify({"ok": False, "error": f"Not enough data for {ticker}."})
            res = simulate(df, ticker=ticker, equation_set=eq, lookback=config.lookback_length,
                           signal_value=config.signal_value, interval=interval, position_pct=100.0,
                           stop_loss_pct=config.stop_loss_pct, take_profit_pct=config.take_profit_pct)
            e = res.equity
            stride = max(1, len(e) // 420)
            fmt = "%Y-%m-%d" if interval == "1d" else "%m-%d %H:%M"
            return jsonify({"ok": True, "ticker": ticker, "equation_set": eq, "interval": interval,
                            "years": years, "report": res.report,
                            "equity": {"labels": [d.strftime(fmt) for d in e.index[::stride]],
                                       "values": [round(float(v), 2) for v in e.values[::stride]]}})
        except Exception as exc:  # pragma: no cover - network/runtime guard
            return jsonify({"ok": False, "error": str(exc)})

    def _ai_context():
        import json as _json
        try:
            snap = service.snapshot()
            sigs = snap.get("signals", [])
            buys = [s for s in sigs if s.get("is_buy") and not s.get("error")][:8]
            top = [{"ticker": s.get("ticker"), "rec": s.get("recommendation"),
                    "conv": s.get("conviction"), "price": s.get("price"), "trend": s.get("trend"),
                    "sector": s.get("sector")} for s in buys]
            acct = None
            broker = display_broker()
            if broker is not None:
                try:
                    a = broker.get_account()
                    acct = {"equity": a.equity, "cash": a.cash, "buying_power": a.buying_power}
                except Exception:
                    pass
            est = controller.status()
            return "\n".join([
                "Config: " + _json.dumps(snap.get("config", {})),
                "Account: " + _json.dumps(acct),
                "Engine: " + _json.dumps({"running": est.get("running"), "mode": est.get("mode"),
                                          "policy": est.get("policy")}),
                "Today report: " + _json.dumps(db.performance_report(starting_equity=config.account_size)),
                "Top buy signals: " + _json.dumps(top),
            ])
        except Exception:
            return None

    @app.route("/api/ai/status")
    def api_ai_status():
        return jsonify({"enabled": bool(briefer.has_key), "model": config.anthropic_model})

    @app.route("/api/ai/ask", methods=["POST"])
    def api_ai_ask():
        body = request.get_json(silent=True) or {}
        res = briefer.ask((body.get("question") or "").strip(), context=_ai_context())
        return jsonify(res)

    # ----- optional Supabase auth gate (single-tenant; off unless configured) ---
    def _is_local() -> bool:
        """True when the request originates from the loopback interface.

        Handles IPv4-mapped IPv6 (``::ffff:127.0.0.1``) and the whole 127/8
        block, which some browsers / Python 3.14 use for localhost — otherwise
        dev-mode would be wrongly rejected with a 403.
        """
        addr = (request.remote_addr or "").strip().lower()
        if addr.startswith("::ffff:"):
            addr = addr[7:]
        return (addr in ("127.0.0.1", "::1", "localhost", "")
                or addr.startswith("127."))

    @app.before_request
    def _auth_gate():
        if not config.auth_active:
            return None
        p = request.path
        if p == "/login" or p.startswith("/api/auth/") or p.startswith("/static/"):
            return None
        # Dev-mode escape hatch: a local operator can opt out of the login gate.
        # Honored only for loopback requests, so a publicly-served instance stays
        # protected even if the cookie is somehow set.
        if request.cookies.get("dev_bypass") == "1" and _is_local():
            return None
        from auth import verify_supabase_jwt, email_allowed
        claims = verify_supabase_jwt(request.cookies.get("sb_token", ""), config.supabase_jwt_secret)
        if claims and email_allowed(claims, config.auth_allowed_emails):
            return None
        if p.startswith("/api/"):
            return jsonify({"error": "unauthorized"}), 401
        return redirect("/login")

    @app.route("/login")
    def login_page():
        if not config.auth_active:
            return redirect("/")
        # JSON-encode so a stray quote / trailing space in SUPABASE_URL can't break
        # the page's JS (a classic "Failed to fetch" cause). Also trim a trailing slash.
        sb_url = json.dumps((config.supabase_url or "").strip().rstrip("/"))
        sb_key = json.dumps((config.supabase_anon_key or "").strip())
        return Response(fill(_LOGIN_PAGE, {"__SBURL__": sb_url, "__SBKEY__": sb_key,
                                           "__DEVLOCAL__": "true" if _is_local() else "false"}),
                        mimetype="text/html")

    @app.route("/api/auth/dev", methods=["POST"])
    def auth_dev():
        """Set a local-only bypass cookie so the operator can skip sign-in."""
        if not config.auth_active:
            return jsonify({"ok": True})  # nothing to bypass
        if not _is_local():
            return jsonify({"ok": False,
                            "error": "Dev mode is only available on localhost."}), 403
        resp = jsonify({"ok": True})
        # Dev-mode is localhost-only; do NOT mark the cookie Secure or it won't be
        # sent back over http://127.0.0.1 (which would loop you back to /login).
        resp.set_cookie("dev_bypass", "1", max_age=86400, httponly=True,
                        samesite="Lax", secure=request.is_secure)
        return resp

    @app.route("/api/auth/session", methods=["POST"])
    def auth_session():
        if not config.auth_active:
            return jsonify({"ok": False, "error": "auth disabled"})
        from auth import verify_supabase_jwt, email_allowed
        token = ((request.get_json(silent=True) or {}).get("access_token") or "").strip()
        claims = verify_supabase_jwt(token, config.supabase_jwt_secret)
        if not claims:
            return jsonify({"ok": False, "error": "invalid or expired token"}), 401
        if not email_allowed(claims, config.auth_allowed_emails):
            return jsonify({"ok": False, "error": "this account is not allowed"}), 403
        resp = jsonify({"ok": True})
        try:
            max_age = max(60, int(float(claims.get("exp", time.time() + 3600))) - int(time.time()))
        except Exception:
            max_age = 3600
        resp.set_cookie("sb_token", token, max_age=max_age, httponly=True, samesite="Lax",
                        secure=bool(config.auth_cookie_secure or request.is_secure))
        return resp

    @app.route("/api/auth/logout", methods=["POST"])
    def auth_logout():
        resp = jsonify({"ok": True})
        resp.delete_cookie("sb_token")
        resp.delete_cookie("dev_bypass")
        return resp

    app.crypto_engine = crypto_engine
    app.polymarket_engine = polymarket_engine
    app.scanner_service = service
    app.engine_controller = controller
    return app


def _tune_runtime() -> None:
    """Best-effort: raise the open-file limit and quiet noisy third-party logs.

    macOS ships a 256 soft file-descriptor limit; a multi-ticker scan + SSE
    streams on the threaded dev server can exhaust it, which surfaces as
    ``OSError: [Errno 24] Too many open files`` and, downstream,
    ``sqlite3.OperationalError: unable to open database file``. Raise the soft
    limit toward the hard cap (stepping down if the kernel rejects the value).
    """
    try:
        import resource
        soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        for want in (8192, 4096, 2048, 1024):
            cap = want if hard == resource.RLIM_INFINITY else min(want, hard)
            if cap <= soft:
                break
            try:
                resource.setrlimit(resource.RLIMIT_NOFILE, (cap, hard))
                log.info("raised open-file limit %s -> %s", soft, cap)
                break
            except (ValueError, OSError):
                continue
    except Exception:
        pass  # non-POSIX (e.g. Windows) or restricted: carry on
    # yfinance logs every throttled/missing ticker at ERROR; the scan already
    # records those as error rows, so keep the operator's console readable.
    for name in ("yfinance", "yfinance.data", "yfinance.ticker", "yfinance.utils", "peewee"):
        try:
            logging.getLogger(name).setLevel(logging.CRITICAL)
        except Exception:
            pass


def run(config=CONFIG) -> None:
    _tune_runtime()
    app = create_app(config)
    # Make the auth state obvious at startup. A half-configured gate (enabled but
    # missing a Supabase value) silently leaves the dashboard OPEN -- shout about it.
    if config.auth_active:
        log.info("auth: Supabase login gate is ACTIVE -- the dashboard requires sign-in.")
    elif config.auth_enabled:
        missing = [name for name, val in (
            ("SUPABASE_URL", config.supabase_url),
            ("SUPABASE_ANON_KEY", config.supabase_anon_key),
            ("SUPABASE_JWT_SECRET", config.supabase_jwt_secret),
        ) if not val]
        log.warning(
            "auth: AUTH_ENABLED=true but the login gate is OFF because these are "
            "unset in .env: %s. The dashboard is OPEN to anyone who can reach it.",
            ", ".join(missing),
        )
    else:
        log.info("auth: login gate off (AUTH_ENABLED is not true) -- dashboard is open.")
    log.info("starting web control center at http://%s:%d (Ctrl-C to stop)",
             config.web_host, config.web_port)
    app.run(host=config.web_host, port=config.web_port, threaded=True)


# --------------------------------------------------------------------------- #
# CSS
# --------------------------------------------------------------------------- #
_CSS = """
  /* ===================================================================
     HP Analytics — design system
     tokens (color · space · type · radius · shadow · motion) → base →
     layout → components. Class names are preserved for the render layer;
     only the presentation changes.
     =================================================================== */
  :root{
    /* surfaces / depth */
    --bg:#0a0c10; --surface:#0e1117; --surface-2:#141824; --surface-3:#1b2030;
    --hairline:rgba(255,255,255,.07); --hairline-2:rgba(255,255,255,.12);
    /* text */
    --fg:#e7eaf1; --fg-2:#b3bbc9; --muted:#828b9b;
    /* single restrained accent */
    --accent:#6c8cff; --accent-2:#9db0ff; --accent-soft:rgba(108,140,255,.14);
    /* semantic */
    --profit:#4cc38a; --profit-soft:rgba(76,195,138,.13);
    --loss:#e5635f;   --loss-soft:rgba(229,99,95,.13);
    --warn:#e0a337;   --warn-soft:rgba(224,163,55,.12);
    --brand-grad:linear-gradient(120deg,#9db0ff 0%,#67d6c3 100%);
    /* aliases kept so existing class + inline-style references still resolve */
    --panel:var(--surface); --panel2:var(--surface-2); --border:var(--hairline);
    --green:var(--profit); --red:var(--loss); --blue:var(--accent); --amber:var(--warn);
    --grad:var(--brand-grad); --fgcolor:var(--fg);
    /* radius / shadow / motion */
    --r-sm:8px; --r-md:12px; --r-lg:16px;
    --sh-1:0 1px 2px rgba(0,0,0,.4); --sh-2:0 6px 22px -10px rgba(0,0,0,.55);
    --sh-3:0 20px 48px -20px rgba(0,0,0,.7);
    --ease:cubic-bezier(.2,.8,.2,1); --fast:.16s var(--ease); --slow:.5s var(--ease);
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--fg);min-height:100vh;overflow-x:hidden;
       font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
       -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-variant-numeric:tabular-nums}
  body::after{content:"";position:fixed;inset:0 0 auto 0;height:360px;pointer-events:none;z-index:0;
       background:radial-gradient(900px 320px at 50% -130px,rgba(108,140,255,.10),transparent 70%)}
  header,.subnav,.wrap{position:relative;z-index:1}
  a{color:var(--accent);text-decoration:none;transition:color var(--fast)} a:hover{color:var(--accent-2)}
  ::selection{background:var(--accent-soft)}
  :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
  *::-webkit-scrollbar{width:10px;height:10px}
  *::-webkit-scrollbar-thumb{background:var(--surface-3);border-radius:10px;border:2px solid var(--bg)}
  *::-webkit-scrollbar-thumb:hover{background:#2a3142}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes pulse{0%{box-shadow:0 0 0 0 var(--profit-soft)}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes shimmer{to{background-position:-200% 0}}

  /* ---- top bar ---- */
  header{position:sticky;top:0;z-index:30;min-height:60px;padding:0 28px;display:flex;align-items:center;gap:16px;
         background:rgba(10,12,16,.82);background:color-mix(in srgb,var(--bg) 80%,transparent);
         -webkit-backdrop-filter:saturate(150%) blur(16px);backdrop-filter:saturate(150%) blur(16px);
         border-bottom:1px solid var(--hairline)}
  header h1,.brand{font-size:15px;margin:0;font-weight:650;letter-spacing:-.01em;display:flex;align-items:center;gap:9px;white-space:nowrap}
  header h1 .g,.brand .g{background:var(--brand-grad);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700}
  .statusrow{display:flex;align-items:center;gap:12px;min-width:0;flex-wrap:wrap}
  .meta{color:var(--muted);font-size:12px}
  .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border:1px solid var(--hairline);border-radius:999px;font-size:11.5px;color:var(--fg-2);background:var(--surface-2)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:middle;flex:none}
  .dot.ok,.dot.run{background:var(--profit);animation:pulse 2s infinite}
  .dot.scanning,.dot.idle{background:var(--warn)} .dot.error,.dot.off{background:var(--loss)} .dot.stopped{background:var(--muted)}

  /* ---- section nav ---- */
  .subnav{position:sticky;top:60px;z-index:20;display:flex;gap:4px;padding:8px 28px;overflow-x:auto;
          background:rgba(10,12,16,.9);background:color-mix(in srgb,var(--bg) 88%,transparent);
          -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom:1px solid var(--hairline)}
  .subnav a{color:var(--muted);font-size:12.5px;font-weight:550;padding:7px 13px;border-radius:8px;white-space:nowrap;transition:var(--fast)}
  .subnav a:hover{color:var(--fg);background:var(--surface-2)}
  .subnav a.active{color:var(--fg);background:var(--surface-3)}

  .wrap{padding:26px 28px 80px;max-width:1320px;margin:0 auto}
  .disclaimer{background:var(--warn-soft);border:1px solid rgba(224,163,55,.32);color:#e9c98a;padding:11px 14px;border-radius:var(--r-md);font-size:12px;margin:0 0 22px;line-height:1.55}
  .disclaimer code{background:rgba(0,0,0,.3);padding:1px 6px;border-radius:5px;font-size:11.5px}

  /* ---- section scaffolding ---- */
  .section{scroll-margin-top:124px;margin:36px 0 0} .section:first-of-type{margin-top:10px}
  .sectionhead{margin:0 0 16px}
  .eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--accent-2)}
  .eyebrow::before{content:"";width:14px;height:2px;border-radius:2px;background:var(--accent);display:inline-block}
  .sectionhead .title{font-size:20px;font-weight:650;letter-spacing:-.02em;color:var(--fg);margin:8px 0 0}
  .sectionhead .desc{font-size:13px;color:var(--muted);margin-top:5px;max-width:64ch;line-height:1.55}
  .subhead{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:700;margin:24px 0 12px;display:flex;align-items:center;gap:9px}

  /* h2 retained (detail page) */
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:26px 0 12px;font-weight:700;display:flex;align-items:center;gap:9px}
  h2::before{content:"";width:3px;height:13px;border-radius:2px;background:var(--accent);display:inline-block;flex:none}

  .chartbox{position:relative;height:340px;width:100%;background:var(--surface);border:1px solid var(--hairline);border-radius:var(--r-lg);padding:14px;box-shadow:var(--sh-1)}
  .chartbox canvas{width:100%!important;height:100%!important;background:transparent!important;border:0!important;padding:0!important}
  .panel{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--sh-1)}

  /* ---- engine controls ---- */
  .ctrl{display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:var(--surface);border:1px solid var(--hairline);border-radius:var(--r-lg);padding:16px 18px;box-shadow:var(--sh-1);animation:fadeUp var(--slow) both}
  .bigbtn{padding:11px 20px;border-radius:var(--r-md);font-size:13.5px;font-weight:650;cursor:pointer;border:1px solid var(--hairline-2);background:var(--surface-2);color:var(--fg);transition:var(--fast);display:inline-flex;align-items:center;gap:8px}
  .bigbtn:hover{transform:translateY(-1px);background:var(--surface-3);box-shadow:var(--sh-2)}
  .bigbtn:active{transform:translateY(0)} .bigbtn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
  .bigbtn.start{background:var(--accent);color:#0a0f1f;border-color:transparent;box-shadow:0 6px 20px -8px var(--accent)}
  .bigbtn.start:hover{background:var(--accent-2)}
  .bigbtn.startlive{background:var(--loss);color:#fff;border-color:transparent}
  .bigbtn.stop{background:var(--loss-soft);color:var(--loss);border-color:rgba(229,99,95,.4)}
  .bigbtn.ghost{background:transparent}
  .estatus{display:flex;align-items:center;gap:10px;font-size:13px;margin-left:auto;flex-wrap:wrap}
  .mode{padding:3px 10px;border-radius:6px;font-size:10.5px;font-weight:800;letter-spacing:.05em}
  .mode.PAPER,.mode.DRYRUN{background:var(--profit-soft);color:var(--profit);border:1px solid rgba(76,195,138,.4)}
  .mode.LIVE{background:var(--loss-soft);color:var(--loss);border:1px solid rgba(229,99,95,.5)}
  .actfeed{background:#070910;border:1px solid var(--hairline);border-radius:var(--r-md);padding:12px 14px;font:11.5px/1.6 ui-monospace,"SF Mono",Menlo,Consolas,monospace;max-height:230px;overflow:auto;color:#94a1b6}
  .actfeed div{white-space:pre-wrap}

  /* ---- KPI stats ---- */
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px}
  .stat{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--r-md);padding:15px 16px;animation:fadeUp var(--slow) both;transition:transform .2s var(--ease),border-color .2s,box-shadow .2s}
  .stat:hover{transform:translateY(-2px);border-color:var(--hairline-2);box-shadow:var(--sh-2)}
  .stat .k{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
  .stat .v{font-size:23px;font-weight:650;margin-top:6px;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1.1}
  .v.green{color:var(--profit)} .v.red{color:var(--loss)} .v.blue{color:var(--accent-2)}

  /* ---- settings panel ---- */
  .account{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--r-lg);padding:18px 20px;display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end;box-shadow:var(--sh-1);animation:fadeUp var(--slow) both}
  .account .field{display:flex;flex-direction:column;gap:7px}
  .account .field>span:first-child{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
  .account .field input{background:var(--bg);border:1px solid var(--hairline-2);color:var(--fg);border-radius:var(--r-sm);padding:10px 13px;width:150px;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;transition:var(--fast)}
  .account .field input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  .account .hint{font-size:12px;color:var(--muted);max-width:300px;line-height:1.55}

  .secbar{display:flex;gap:9px;flex-wrap:wrap}
  .secchip{background:var(--surface);border:1px solid var(--hairline);border-radius:999px;padding:6px 14px;font-size:12px;display:flex;gap:8px;align-items:center;animation:fadeUp var(--slow) both;transition:var(--fast)}
  .secchip:hover{border-color:var(--hairline-2)} .secchip b{color:var(--profit)}

  .controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
  .search{background:var(--surface);border:1px solid var(--hairline-2);color:var(--fg);border-radius:var(--r-sm);padding:9px 13px;font-size:13px;width:230px;transition:var(--fast)}
  .search::placeholder{color:var(--muted)} .search:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  .fchip{background:var(--surface);border:1px solid var(--hairline);color:var(--muted);border-radius:999px;padding:7px 14px;font-size:12px;cursor:pointer;transition:var(--fast)}
  .fchip:hover{color:var(--fg);border-color:var(--hairline-2)} .fchip.active{background:var(--accent-soft);color:var(--accent-2);border-color:rgba(108,140,255,.5);font-weight:650}

  /* ---- signal cards ---- */
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:16px}
  .card{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--r-lg);padding:18px;animation:fadeUp var(--slow) both;transition:transform .2s var(--ease),box-shadow .2s,border-color .2s;box-shadow:var(--sh-1)}
  .card:hover{transform:translateY(-3px);box-shadow:var(--sh-3);border-color:var(--hairline-2)}
  .card.strong{border-color:rgba(76,195,138,.5);box-shadow:0 0 0 1px rgba(76,195,138,.18),var(--sh-1)}
  .card .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .tk{font-size:20px;font-weight:750;letter-spacing:-.02em;color:var(--fg)} a.tk:hover{color:var(--accent-2)}
  .chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:10.5px;font-weight:750;letter-spacing:.04em}
  .chip.STRONGBUY{background:var(--profit);color:#06210f} .chip.BUY{background:var(--profit-soft);color:var(--profit);border:1px solid rgba(76,195,138,.5)}
  .chip.HOLD{background:var(--accent-soft);color:var(--accent-2);border:1px solid rgba(108,140,255,.45)}
  .chip.WAIT{background:var(--surface-3);color:var(--muted);border:1px solid var(--hairline)}
  .chip.SELL,.chip.STRONGSELL{background:var(--loss-soft);color:var(--loss);border:1px solid rgba(229,99,95,.5)}
  .chip.SKIP,.chip.ERROR{background:var(--warn-soft);color:var(--warn);border:1px solid rgba(224,163,55,.5)}
  .agree{font-size:11px;color:var(--profit);margin-left:6px}
  .subline{font-size:12px;color:var(--fg-2);margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .bar{height:6px;border-radius:4px;background:var(--surface-3);margin:12px 0 6px;overflow:hidden}
  .bar>span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--profit));width:0;transition:width 1s var(--ease)}
  .badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
  .badge{font-size:10.5px;padding:3px 9px;border-radius:6px;border:1px solid var(--hairline);background:var(--surface-2);color:var(--fg-2)}
  .badge.green{color:var(--profit);border-color:rgba(76,195,138,.35)} .badge.red{color:var(--loss);border-color:rgba(229,99,95,.35)} .badge.muted{color:var(--muted)}
  .ticket{margin-top:14px;border-top:1px solid var(--hairline);padding-top:14px}
  .tline{font-size:13px;margin-bottom:12px;font-variant-numeric:tabular-nums} .tline .tk2{font-weight:750}
  .ostep{display:flex;gap:12px;margin:11px 0}
  .num2{flex:none;width:23px;height:23px;border-radius:50%;background:var(--accent-soft);border:1px solid rgba(108,140,255,.4);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent-2)}
  .osh{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:4px;font-weight:600}
  .orow{font-size:12.5px;margin:4px 0;font-variant-numeric:tabular-nums;color:var(--fg-2)}
  .ot{display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:800;background:var(--surface-2);border:1px solid var(--hairline);letter-spacing:.03em;white-space:nowrap;margin-right:4px;color:var(--fg)}
  .ot.buy{color:var(--profit);border-color:rgba(76,195,138,.45)} .ot.sell{color:var(--loss);border-color:rgba(229,99,95,.45)}
  .note{font-size:12.5px;padding:11px 13px;border-radius:var(--r-sm);background:var(--surface-2);border:1px solid var(--hairline);margin-top:12px;color:var(--fg-2)}
  .note.warn{color:var(--warn);border-color:rgba(224,163,55,.4);background:var(--warn-soft)}
  .brief{margin-top:12px;padding:13px;background:var(--bg);border:1px solid var(--hairline);border-radius:var(--r-md);font-size:12px;white-space:pre-wrap;line-height:1.6;color:var(--fg-2)} .brief b{color:var(--accent-2)}

  /* ---- tables ---- */
  .tablewrap{overflow-x:auto;border:1px solid var(--hairline);border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--sh-1)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--hairline);white-space:nowrap}
  tbody tr:last-child td{border-bottom:0}
  thead th{position:sticky;top:0;background:var(--surface-2);color:var(--muted);font-weight:650;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;user-select:none;z-index:1}
  thead th:hover{color:var(--fg)} th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
  tbody tr{transition:background .14s} tbody tr:hover{background:var(--accent-soft)} td b{color:var(--fg);font-weight:650}
  .green{color:var(--profit)} .red{color:var(--loss)} .muted{color:var(--muted)}
  .foot{color:var(--muted);font-size:11.5px;margin-top:28px;text-align:center;line-height:1.6}
  .btn{background:var(--surface-2);border:1px solid var(--hairline);color:var(--fg);padding:8px 14px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;font-weight:550;transition:var(--fast)}
  .btn:hover{border-color:var(--hairline-2);background:var(--surface-3)} .btn.active{background:var(--accent-soft);color:var(--accent-2);border-color:rgba(108,140,255,.5);font-weight:650}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}

  /* ---- skeleton loaders ---- */
  .skel{background:linear-gradient(100deg,var(--surface-2) 28%,var(--surface-3) 50%,var(--surface-2) 72%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:var(--r-md)}
  .skel-stat{height:80px} .skel-card{height:240px;border-radius:var(--r-lg)}

  @media(max-width:900px){
    .grid2{grid-template-columns:1fr}.cards{grid-template-columns:1fr}
    header{padding:0 16px}.subnav{position:static;top:auto;padding:8px 16px}.wrap{padding:20px 16px 70px}
    .estatus{margin-left:0}
  }
  @media (prefers-reduced-motion: reduce){
    *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
  }
"""

# --------------------------------------------------------------------------- #
# Shared JS
# --------------------------------------------------------------------------- #
_SHARED_JS = """
const money = x => x==null ? '—' : (x<0?'-$':'$') + Math.abs(Number(x)).toLocaleString(undefined,{maximumFractionDigits:0});
const usd = x => x==null ? '—' : '$' + Number(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = x => (x*100).toFixed(0)+'%';
const cls = r => (r||'').replace(/\\s/g,'');
const edgeWin = x => (x.eq1 && x.eq1.edge_win_rate!=null) ? x.eq1.edge_win_rate : 0.5;
let CAPITAL = __CAP__;  // set from the live Alpaca account when connected
let SIZEMODE = 'fixed';  // driven by the server config (config.atr_adaptive)
const ATR_RISK = __ATRRISK__, ATR_STOPM = __ATRSTOPM__, ATR_TGTM = __ATRTGTM__;
function getSettings(){return {maxPct:+(localStorage.getItem('maxPct')||__MAXPCT__),stopPct:+(localStorage.getItem('stopPct')||__STOPPCT__),targetPct:+(localStorage.getItem('targetPct')||__TGTPCT__)};}
function economics(price,winRate,s){const entry=price,stop=entry*(1-s.stopPct/100),target=entry*(1+s.targetPct/100);const budget=CAPITAL*(s.maxPct/100);const shares=entry>0?Math.max(0,Math.floor(budget/entry)):0;const cost=shares*entry,risk=shares*(entry-stop),reward=shares*(target-entry);const rr=risk>0?reward/risk:0,w=(winRate==null)?0.5:winRate;return {entry,stop,target,shares,cost,risk,reward,rr,ev:w*reward-(1-w)*risk,pctCap:CAPITAL?cost/CAPITAL*100:0};}
function econ(x,s){const win=edgeWin(x);if(SIZEMODE==='atr'&&x.atr>0){const entry=x.price,stop=x.atr_stop,target=x.atr_target,rps=entry-stop;const byRisk=rps>0?Math.floor(CAPITAL*ATR_RISK/100/rps):0;const byCap=entry>0?Math.floor(CAPITAL*s.maxPct/100/entry):0;const shares=Math.max(0,Math.min(byRisk,byCap));const cost=shares*entry,risk=shares*rps,reward=shares*(target-entry);return {entry,stop,target,shares,cost,risk,reward,rr:risk>0?reward/risk:0,ev:win*reward-(1-win)*risk,pctCap:CAPITAL?cost/CAPITAL*100:0};}return economics(x.price,win,s);}
function sparkline(arr){if(!arr||arr.length<2)return '';const w=104,h=28,p=3,min=Math.min(...arr),max=Math.max(...arr),rng=(max-min)||1;const pts=arr.map((v,i)=>{const x=p+i*(w-2*p)/(arr.length-1),y=p+(h-2*p)*(1-(v-min)/rng);return x.toFixed(1)+','+y.toFixed(1);}).join(' ');const col=arr[arr.length-1]>=arr[0]?'#4cc38a':'#e5635f';return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" points="${pts}"/></svg>`;}
function rsiCls(r){return r>=70?'red':(r<=30?'green':'muted');}
function contextBadges(s){return `<span class="badge ${s.trend==='Uptrend'?'green':'red'}">${s.trend||'—'}</span><span class="badge ${rsiCls(s.rsi)}">RSI ${Math.round(s.rsi)}</span><span class="badge ${s.momentum>=0?'green':'red'}">Mom ${s.momentum>=0?'+':''}${(s.momentum||0).toFixed(1)}%</span><span class="badge muted">Vol ${s.vol_note||'—'}</span>`;}
function orderTicket(sig,e,s,interval){const t=sig.ticker,rec=sig.recommendation;if(rec==='STRONG BUY'||rec==='BUY'){if(e.shares<=0)return `<div class="note warn">Your capital × max% is too small to buy even 1 share of ${t} at ${usd(e.entry)}.</div>`;const buystop=e.entry*1.005,slLimit=e.stop*0.995;return `<div class="ticket"><div class="tline"><span class="tk2">📋 ${rec} ${t}</span> &nbsp;—&nbsp; ${e.shares} shares · ${money(e.cost)} (${e.pctCap.toFixed(0)}% of capital)</div><div class="ostep"><div class="num2">1</div><div><div class="osh">Entry — pick the style that fits you</div><div class="orow"><span class="ot buy">MARKET BUY</span> fills now at ~<b>${usd(e.entry)}</b></div><div class="orow"><span class="ot buy">LIMIT BUY</span> at <b>${usd(e.entry)}</b> — never pay above this</div><div class="orow"><span class="ot buy">BUY STOP</span> at <b>${usd(buystop)}</b> — only buys if it breaks out higher</div></div></div><div class="ostep"><div class="num2">2</div><div><div class="osh">Protect it — required</div><div class="orow"><span class="ot sell">SELL STOP</span> at <b>${usd(e.stop)}</b> (−${s.stopPct}%) · max loss ≈ <span class="red">${money(e.risk)}</span></div><div class="orow"><span class="ot sell">STOP-LIMIT</span> trigger ${usd(e.stop)} / limit ${usd(slLimit)}</div></div></div><div class="ostep"><div class="num2">3</div><div><div class="osh">Take profit</div><div class="orow"><span class="ot sell">SELL LIMIT</span> at <b>${usd(e.target)}</b> (+${s.targetPct}%) · ≈ <span class="green">${money(e.reward)}</span> · <b>${e.rr.toFixed(1)}:1</b></div></div></div><div class="ostep"><div class="num2">4</div><div><div class="osh">Easiest — one order</div><div class="orow"><span class="ot">BRACKET / OCO</span> attach the SELL STOP + SELL LIMIT to your buy.</div></div></div></div>`;}if(rec==='HOLD')return `<div class="ticket"><div class="ostep"><div class="num2">!</div><div><div class="osh">${t} already triggered earlier — not a fresh entry</div><div class="orow">If holding: keep a <span class="ot sell">SELL STOP</span> near <b>${usd(e.stop)}</b> and <span class="ot sell">SELL LIMIT</span> near <b>${usd(e.target)}</b>.</div></div></div></div>`;if(rec==='SELL'||rec==='STRONG SELL')return `<div class="ticket"><div class="ostep"><div class="num2">↓</div><div><div class="osh">${t} is flashing a SELL (exit)</div><div class="orow">If holding: <span class="ot sell">MARKET SELL</span> to close.</div></div></div></div>`;return `<div class="note">No action on ${t} — neutral (WAIT).</div>`;}
"""

# --------------------------------------------------------------------------- #
# App-shell stylesheet (sidebar · topbar · command palette · TradingView)
# --------------------------------------------------------------------------- #
_SHELL_CSS = """
  /* ===== operating-system shell ===== */
  :root{--sb:252px;--sb-collapsed:68px;--topbar-h:58px}
  .osapp{height:100vh;overflow:hidden}
  .app{display:grid;grid-template-columns:auto 1fr;min-height:100vh}
  .sidebar{width:var(--sb);height:100vh;position:sticky;top:0;align-self:start;display:flex;flex-direction:column;gap:3px;
    padding:14px 12px;background:rgba(13,16,22,.74);background:color-mix(in srgb,var(--surface) 88%,transparent);
    -webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border-right:1px solid var(--hairline);
    transition:width .3s var(--ease);overflow-x:hidden;overflow-y:auto;z-index:40}
  .app.collapsed .sidebar{width:var(--sb-collapsed)}
  .sb-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 16px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
  .sb-brand .logo{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:var(--brand-grad);font-size:17px;flex:none;box-shadow:0 8px 20px -8px var(--accent)}
  .sb-brand .brandtext{font-size:14px;line-height:1.1}
  .sb-brand .brandtext .g{background:var(--brand-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sb-brand .brandtext small{display:block;color:var(--muted);font-size:10.5px;font-weight:600;letter-spacing:.05em;margin-top:2px}
  .navgroup-title{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:700;padding:13px 12px 6px}
  .navitem{display:flex;align-items:center;gap:12px;padding:9px 11px;border-radius:10px;color:var(--fg-2);font-size:13.5px;font-weight:550;cursor:pointer;white-space:nowrap;transition:var(--fast);border:1px solid transparent;position:relative;user-select:none}
  .navitem svg{width:18px;height:18px;flex:none;transition:transform var(--fast)}
  .navitem:hover{background:var(--surface-2);color:var(--fg)} .navitem:hover svg{transform:scale(1.12)}
  .navitem.active{background:var(--accent-soft);color:var(--fg);border-color:rgba(108,140,255,.30)}
  .navitem.active svg{color:var(--accent-2)}
  .navitem.active::before{content:"";position:absolute;left:-12px;top:50%;transform:translateY(-50%);width:3px;height:18px;border-radius:0 3px 3px 0;background:var(--accent)}
  .navitem .navlabel{flex:1}
  .app.collapsed .navlabel,.app.collapsed .navgroup-title,.app.collapsed .brandtext,.app.collapsed .sbf-text{display:none}
  .app.collapsed .navitem{justify-content:center;padding:10px} .app.collapsed .sb-brand{justify-content:center;padding:6px 0 16px}
  .sb-foot{margin-top:auto;border-top:1px solid var(--hairline);padding-top:10px;display:flex;flex-direction:column;gap:3px}
  .sbf-row{display:flex;align-items:center;gap:9px;padding:7px 11px;font-size:11.5px;color:var(--muted)}
  .kbd{display:inline-flex;align-items:center;justify-content:center;min-width:18px;padding:2px 6px;border-radius:6px;border:1px solid var(--hairline-2);background:var(--surface-2);font:600 10.5px/1 ui-monospace,Menlo,monospace;color:var(--fg-2)}
  /* main column */
  .main{min-width:0;height:100vh;overflow-y:auto}
  .topbar{position:sticky;top:0;z-index:30;min-height:var(--topbar-h);display:flex;align-items:center;gap:13px;padding:0 22px;
    background:rgba(10,12,16,.7);background:color-mix(in srgb,var(--bg) 72%,transparent);
    -webkit-backdrop-filter:saturate(150%) blur(16px);backdrop-filter:saturate(150%) blur(16px);border-bottom:1px solid var(--hairline)}
  .iconbtn{width:34px;height:34px;border-radius:9px;border:1px solid var(--hairline);background:var(--surface-2);color:var(--fg-2);display:grid;place-items:center;cursor:pointer;transition:var(--fast);flex:none}
  .iconbtn:hover{background:var(--surface-3);color:var(--fg)} .iconbtn svg{width:18px;height:18px}
  .crumb{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--muted);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .crumb b{color:var(--fg);font-weight:650} .crumb .sep{opacity:.45}
  .cmdk{margin-left:auto;display:inline-flex;align-items:center;gap:9px;padding:7px 12px;border-radius:10px;border:1px solid var(--hairline-2);background:var(--surface-2);color:var(--muted);font-size:12.5px;cursor:pointer;transition:var(--fast)}
  .cmdk:hover{border-color:var(--accent);color:var(--fg)}
  .content{padding:24px 26px 90px;max-width:1280px;width:100%;margin:0 auto}
  @keyframes viewIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .section.vin{animation:viewIn .42s var(--ease) both}
  /* command palette */
  .scrim{position:fixed;inset:0;z-index:100;background:rgba(4,6,10,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .2s var(--ease)}
  .scrim.open{opacity:1;pointer-events:auto}
  .palette{position:fixed;left:50%;top:13vh;transform:translate(-50%,-8px) scale(.98);z-index:101;width:min(640px,92vw);
    background:rgba(16,20,28,.97);background:color-mix(in srgb,var(--surface-2) 97%,transparent);border:1px solid var(--hairline-2);
    border-radius:16px;box-shadow:var(--sh-3);overflow:hidden;opacity:0;pointer-events:none;transition:opacity .2s var(--ease),transform .22s var(--ease)}
  .palette.open{opacity:1;pointer-events:auto;transform:translate(-50%,0) scale(1)}
  .palette input{width:100%;border:0;background:transparent;color:var(--fg);font-size:16px;padding:18px 20px;outline:none;border-bottom:1px solid var(--hairline)}
  .palette input::placeholder{color:var(--muted)}
  .palres{max-height:52vh;overflow:auto;padding:8px}
  .pgroup{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;padding:11px 12px 5px}
  .pitem{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer;font-size:13.5px;color:var(--fg-2)}
  .pitem .pi-ic{width:20px;text-align:center;color:var(--muted);flex:none}
  .pitem .pi-meta{margin-left:auto;color:var(--muted);font-size:11.5px}
  .pitem.sel,.pitem:hover{background:var(--accent-soft);color:var(--fg)} .pitem.sel .pi-ic{color:var(--accent-2)}
  /* tradingview */
  .tvwrap{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--r-lg);padding:8px;box-shadow:var(--sh-1);overflow:hidden}
  .tv-tall{height:520px} .tv-mid{height:420px} .tv-tape{height:50px;padding:0}
  .tvwrap .tradingview-widget-container,.tvwrap .tradingview-widget-container__widget{height:100%;width:100%}
  .tvnote{font-size:11.5px;color:var(--muted);margin-top:9px}
  .navtoggle{display:none}
  @media(max-width:900px){
    .app{grid-template-columns:1fr}
    .sidebar{position:fixed;left:0;top:0;transform:translateX(-100%);transition:transform .3s var(--ease);box-shadow:var(--sh-3)}
    .app.navopen .sidebar{transform:none}
    .navtoggle{display:grid}
    .content{padding:18px 14px 80px}
  }
  /* ===== activity-log console ===== */
  .logconsole{background:#070910;border:1px solid var(--hairline);border-radius:var(--r-lg);padding:6px 0;max-height:64vh;overflow:auto;font:12px/1.5 ui-monospace,"SF Mono",Menlo,Consolas,monospace;box-shadow:var(--sh-1)}
  .logline{display:flex;gap:12px;padding:5px 16px;border-bottom:1px solid rgba(255,255,255,.03)}
  .logline:hover{background:rgba(255,255,255,.025)}
  .logts{color:var(--muted);flex:none;width:144px}
  .loglv{flex:none;width:62px;font-weight:700;font-size:10.5px;letter-spacing:.04em}
  .logmsg{color:var(--fg-2);white-space:pre-wrap;word-break:break-word}
  .amber{color:var(--warn)}
  /* ===== AI co-pilot ===== */
  .copilot-fab{position:fixed;right:22px;bottom:22px;z-index:90;display:inline-flex;align-items:center;gap:9px;padding:12px 17px;border-radius:999px;border:1px solid rgba(108,140,255,.45);background:linear-gradient(120deg,var(--accent),#7b6cff);color:#fff;font-weight:650;font-size:13.5px;cursor:pointer;box-shadow:0 12px 30px -10px var(--accent);transition:var(--fast)}
  .copilot-fab svg{width:19px;height:19px} .copilot-fab:hover{transform:translateY(-2px);box-shadow:0 18px 42px -12px var(--accent)}
  .copilot-fab.hide{opacity:0;pointer-events:none;transform:scale(.9)}
  .copilot{position:fixed;right:22px;bottom:22px;z-index:95;width:min(420px,94vw);height:min(620px,82vh);display:flex;flex-direction:column;
    background:rgba(16,20,28,.97);background:color-mix(in srgb,var(--surface-2) 97%,transparent);border:1px solid var(--hairline-2);border-radius:18px;
    box-shadow:var(--sh-3);overflow:hidden;opacity:0;pointer-events:none;transform:translateY(16px) scale(.98);transition:opacity .22s var(--ease),transform .22s var(--ease)}
  .copilot.open{opacity:1;pointer-events:auto;transform:none}
  .cp-head{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid var(--hairline)}
  .cp-title{font-weight:700;letter-spacing:-.01em} .cp-status{font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:5px}
  .cp-head .iconbtn{margin-left:auto;width:30px;height:30px}
  .cp-msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
  .cp-msg{display:flex;gap:9px;max-width:100%} .cp-msg.me{flex-direction:row-reverse}
  .cp-av{width:24px;height:24px;border-radius:7px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-2);font-size:13px}
  .cp-bubble{padding:10px 13px;border-radius:13px;font-size:13px;line-height:1.55;background:var(--surface-3);color:var(--fg);max-width:84%;word-break:break-word}
  .cp-msg.me .cp-bubble{background:var(--accent);color:#0a0f1f}
  .cp-input{display:flex;gap:9px;padding:12px;border-top:1px solid var(--hairline);align-items:flex-end}
  .cp-input textarea{flex:1;resize:none;background:var(--bg);border:1px solid var(--hairline-2);color:var(--fg);border-radius:11px;padding:10px 12px;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none;max-height:120px}
  .cp-input textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)} .cp-input .bigbtn{padding:10px 16px}
  @media(max-width:560px){.copilot{right:8px;left:8px;width:auto;bottom:8px}.copilot-fab{right:14px;bottom:14px}}
  @media (prefers-reduced-motion: reduce){ .section.vin{animation:none} .sidebar,.palette,.scrim,.copilot{transition:none} }
"""

# --------------------------------------------------------------------------- #
# App-shell behaviour (view routing · command palette · TradingView · status)
# --------------------------------------------------------------------------- #
_SHELL_JS = r"""
(function(){
  var app=document.getElementById('app');
  if(!app)return;
  var VIEWS=['dashboard','markets','crypto','polymarket','signals','options','engine','risk','performance','backtest','logs','trades'];
  var TITLES={dashboard:'Mission Control',markets:'Markets',crypto:'Crypto',polymarket:'Polymarket',signals:'Signals',options:'Options',engine:'Engine',risk:'Risk',performance:'Performance',backtest:'Backtesting',logs:'Activity Log',trades:'Trades'};
  var marketsReady=false;

  function setCrumb(v){var c=document.getElementById('crumb');if(c)c.innerHTML='Workspace <span class="sep">/</span> <b>'+(TITLES[v]||v)+'</b>';}
  function applyView(v,skipHash){
    if(VIEWS.indexOf(v)<0)v='dashboard';
    app.setAttribute('data-view',v);
    document.querySelectorAll('.content .section').forEach(function(s){
      var views=(s.getAttribute('data-views')||'').split(/\s+/);
      if(views.indexOf(v)>=0){s.style.display='';s.classList.remove('vin');void s.offsetWidth;s.classList.add('vin');}
      else s.style.display='none';
    });
    document.querySelectorAll('.navitem[data-view]').forEach(function(n){n.classList.toggle('active',n.getAttribute('data-view')===v);});
    setCrumb(v);
    if(v==='markets')initMarkets();
    if(window.onOsView){try{window.onOsView(v);}catch(e){}}
    var main=document.querySelector('.main');if(main)main.scrollTop=0;
    app.classList.remove('navopen');
    if(!skipHash){try{history.replaceState(null,'','#'+v);}catch(e){}}
  }
  window.osView=applyView;
  document.querySelectorAll('.navitem[data-view]').forEach(function(n){n.addEventListener('click',function(){applyView(n.getAttribute('data-view'));});});

  var col=document.getElementById('collapseBtn');
  if(col)col.addEventListener('click',function(){app.classList.toggle('collapsed');try{localStorage.setItem('sbCollapsed',app.classList.contains('collapsed')?'1':'0');}catch(e){}});
  try{if(localStorage.getItem('sbCollapsed')==='1')app.classList.add('collapsed');}catch(e){}
  var ham=document.getElementById('navToggle');if(ham)ham.addEventListener('click',function(){app.classList.toggle('navopen');});

  // mirror the live signal status into the sidebar footer (no extra polling)
  var ss=document.getElementById('sigstatus');
  function mirror(){try{var d=ss.querySelector('.dot'),sd=document.getElementById('sbdot');if(d&&sd)sd.className=d.className;var st=document.getElementById('sbstatus');if(st)st.textContent=ss.textContent.trim();}catch(e){}}
  if(ss){new MutationObserver(mirror).observe(ss,{childList:true,subtree:true,characterData:true});mirror();}

  // TradingView market widgets (free embeds, loaded lazily on first visit)
  function tvScript(parent,src,cfg){var s=document.createElement('script');s.src=src;s.async=true;s.type='text/javascript';s.innerHTML=JSON.stringify(cfg);parent.appendChild(s);}
  function initMarkets(){
    if(marketsReady)return;marketsReady=true;
    try{
      var tape=document.querySelector('#tv-tape .tradingview-widget-container__widget');
      if(tape)tvScript(tape.parentElement,'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js',{symbols:[{description:'S&P 500',proName:'FOREXCOM:SPXUSD'},{description:'Nasdaq 100',proName:'FOREXCOM:NSXUSD'},{description:'AAPL',proName:'NASDAQ:AAPL'},{description:'NVDA',proName:'NASDAQ:NVDA'},{description:'TSLA',proName:'NASDAQ:TSLA'},{description:'BTC',proName:'BITSTAMP:BTCUSD'}],showSymbolLogo:true,colorTheme:'dark',isTransparent:true,displayMode:'adaptive',locale:'en'});
      var heat=document.querySelector('#tv-heatmap .tradingview-widget-container__widget');
      if(heat)tvScript(heat.parentElement,'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js',{dataSource:'SPX500',blockSize:'market_cap_basic',blockColor:'change',grouping:'sector',locale:'en',colorTheme:'dark',hasTopBar:false,isDataSetEnabled:false,isZoomEnabled:true,hasSymbolTooltip:true,isMonoSize:false,width:'100%',height:'100%'});
      var ov=document.querySelector('#tv-overview .tradingview-widget-container__widget');
      if(ov)tvScript(ov.parentElement,'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js',{colorTheme:'dark',dateRange:'1D',showChart:true,locale:'en',isTransparent:true,showSymbolLogo:true,width:'100%',height:'100%',tabs:[{title:'Indices',symbols:[{s:'FOREXCOM:SPXUSD',d:'S&P 500'},{s:'FOREXCOM:NSXUSD',d:'Nasdaq 100'},{s:'FOREXCOM:DJI',d:'Dow 30'}]},{title:'Tech',symbols:[{s:'NASDAQ:AAPL'},{s:'NASDAQ:MSFT'},{s:'NASDAQ:NVDA'},{s:'NASDAQ:AMZN'}]}]});
      var scr=document.querySelector('#tv-screener .tradingview-widget-container__widget');
      if(scr)tvScript(scr.parentElement,'https://s3.tradingview.com/external-embedding/embed-widget-screener.js',{width:'100%',height:'100%',defaultColumn:'overview',defaultScreen:'most_capitalized',market:'america',showToolbar:true,colorTheme:'dark',locale:'en',isTransparent:true});
      var gg=document.querySelector('#tv-gauge .tradingview-widget-container__widget');
      if(gg)tvScript(gg.parentElement,'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js',{interval:'1D',width:'100%',height:'100%',isTransparent:true,symbol:'AMEX:SPY',showIntervalTabs:true,displayMode:'single',locale:'en',colorTheme:'dark'});
    }catch(e){}
  }

  // command palette (Cmd/Ctrl-K): navigate, run actions, jump to a ticker
  var scrim=document.getElementById('scrim'),pal=document.getElementById('palette'),pin=document.getElementById('palinput'),pres=document.getElementById('palres');
  var sel=0,items=[];
  function actions(){
    var a=[];
    VIEWS.forEach(function(v){a.push({g:'Navigate',t:'Go to '+(TITLES[v]||v),ic:'→',run:function(){applyView(v);}});});
    a.push({g:'Engine',t:'Preview (dry run)',ic:'◉',run:function(){applyView('engine');if(window.previewEngine)previewEngine();}});
    a.push({g:'Engine',t:'Start auto-trading',ic:'▶',run:function(){if(window.startEngine)startEngine();}});
    a.push({g:'Engine',t:'Stop engine',ic:'■',run:function(){if(window.stopEngine)stopEngine();}});
    a.push({g:'Mode',t:'Conservative mode',ic:'○',run:function(){if(window.setAggressive)setAggressive(false);}});
    a.push({g:'Mode',t:'Aggressive mode',ic:'◉',run:function(){if(window.setAggressive)setAggressive(true);}});
    a.push({g:'Mode',t:'Toggle Day-trade mode',ic:'⚡',run:function(){if(window.toggleDayTrade)toggleDayTrade();}});
    a.push({g:'Mode',t:'Toggle AI risk-gate',ic:'✦',run:function(){if(window.toggleGate)toggleGate();}});
    a.push({g:'Sizing',t:'Fixed % sizing',ic:'%',run:function(){if(window.setSizeMode)setSizeMode('fixed');}});
    a.push({g:'Sizing',t:'ATR-adaptive sizing',ic:'≈',run:function(){if(window.setSizeMode)setSizeMode('atr');}});
    a.push({g:'AI',t:'Ask the AI co-pilot',ic:'✦',run:function(){if(window.openCopilot)openCopilot();}});
    a.push({g:'Account',t:'Sign out',ic:'⎋',run:function(){fetch('/api/auth/logout',{method:'POST'}).then(function(){location.href='/login';});}});
    var sg=(window.LAST&&LAST.signals)||[];
    sg.slice(0,50).forEach(function(x){a.push({g:'Tickers',t:x.ticker+'  ·  '+(x.recommendation||''),ic:'▫',meta:x.sector||'',run:function(){location.href='/ticker/'+x.ticker;}});});
    return a;
  }
  function renderPal(){
    var q=(pin.value||'').trim().toLowerCase();
    items=actions().filter(function(it){return !q||it.t.toLowerCase().indexOf(q)>=0||(it.g||'').toLowerCase().indexOf(q)>=0;});
    if(sel>=items.length)sel=0;
    var html='',lastg=null;
    items.forEach(function(it,i){if(it.g!==lastg){html+='<div class="pgroup">'+it.g+'</div>';lastg=it.g;}
      html+='<div class="pitem'+(i===sel?' sel':'')+'" data-i="'+i+'"><span class="pi-ic">'+it.ic+'</span><span>'+it.t.replace(/</g,'&lt;')+'</span>'+(it.meta?'<span class="pi-meta">'+it.meta+'</span>':'')+'</div>';});
    pres.innerHTML=html||'<div class="pgroup">No matches</div>';
    var s=pres.querySelector('.pitem.sel');if(s)s.scrollIntoView({block:'nearest'});
    pres.querySelectorAll('.pitem').forEach(function(el){el.addEventListener('click',function(){run(+el.dataset.i);});});
  }
  function openPal(){scrim.classList.add('open');pal.classList.add('open');pin.value='';sel=0;renderPal();setTimeout(function(){pin.focus();},30);}
  function closePal(){scrim.classList.remove('open');pal.classList.remove('open');}
  function run(i){var it=items[i];if(!it)return;closePal();setTimeout(function(){try{it.run();}catch(e){}},10);}
  if(pin)pin.addEventListener('input',function(){sel=0;renderPal();});
  document.addEventListener('keydown',function(e){
    var k=(e.key||'').toLowerCase();
    if((e.metaKey||e.ctrlKey)&&k==='k'){e.preventDefault();pal.classList.contains('open')?closePal():openPal();return;}
    if(!pal||!pal.classList.contains('open'))return;
    if(e.key==='Escape')closePal();
    else if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(items.length-1,sel+1);renderPal();}
    else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(0,sel-1);renderPal();}
    else if(e.key==='Enter'){e.preventDefault();run(sel);}
  });
  if(scrim)scrim.addEventListener('click',closePal);
  var cmdkBtn=document.getElementById('cmdkBtn');if(cmdkBtn)cmdkBtn.addEventListener('click',openPal);

  var initv=(location.hash||'').replace('#','');
  applyView(VIEWS.indexOf(initv)>=0?initv:'dashboard',true);
})();
"""

# --------------------------------------------------------------------------- #
# Main page (the control center)
# --------------------------------------------------------------------------- #
_MAIN_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HP Analytics — Control Center</title><style>""" + _CSS + _SHELL_CSS + """</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script></head><body class="osapp">
<div class="app" id="app" data-view="dashboard">
  <aside class="sidebar" id="sidebar">
    <div class="sb-brand">
      <span class="logo">🦙</span>
      <span class="brandtext"><span class="g">HP Analytics</span><small>TRADING OS</small></span>
    </div>
    <div class="navgroup-title">Workspace</div>
    <div class="navitem active" data-view="dashboard" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="13" width="7" height="8" rx="1.5"/></svg>
      <span class="navlabel">Mission Control</span></div>
    <div class="navitem" data-view="markets" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16l5-5 4 3 8-8"/><path d="M16 6h5v5"/></svg>
      <span class="navlabel">Markets</span></div>
    <div class="navitem" data-view="crypto" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 8.5h4a2 2 0 0 1 0 4h-4h4a2 2 0 0 1 0 4h-4M11 7v10"/></svg>
      <span class="navlabel">Crypto</span></div>
    <div class="navitem" data-view="polymarket" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0"/><path d="M8 12l3 3 5-6"/></svg>
      <span class="navlabel">Polymarket</span></div>
    <div class="navitem" data-view="signals" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3 7 5-15 3 8h5"/></svg>
      <span class="navlabel">Signals</span></div>
    <div class="navitem" data-view="options" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
      <span class="navlabel">Options</span></div>
    <div class="navgroup-title">Trading</div>
    <div class="navitem" data-view="engine" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2L4 13h7l-1 9 10-12h-7z"/></svg>
      <span class="navlabel">Engine</span></div>
    <div class="navitem" data-view="risk" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.3 7.8-8 9-4.7-1.2-8-4.5-8-9V6z"/></svg>
      <span class="navlabel">Risk</span></div>
    <div class="navitem" data-view="trades" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h5"/></svg>
      <span class="navlabel">Trades</span></div>
    <div class="navgroup-title">Analyze</div>
    <div class="navitem" data-view="performance" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M8 16l3-4 3 2 4-7"/></svg>
      <span class="navlabel">Performance</span></div>
    <div class="navitem" data-view="backtest" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/><circle cx="7" cy="14" r="0.6"/></svg>
      <span class="navlabel">Backtesting</span></div>
    <div class="navitem" data-view="logs" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14M5 9h14M5 14h9M5 19h9"/></svg>
      <span class="navlabel">Activity Log</span></div>
    <div class="sb-foot">
      <div class="sbf-row"><span class="dot scanning" id="sbdot"></span><span class="sbf-text" id="sbstatus">connecting…</span></div>
      <div class="navitem" id="collapseBtn" role="button" tabindex="0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l-5-5 5-5"/><path d="M19 17l-5-5 5-5"/></svg>
        <span class="navlabel">Collapse</span></div>
    </div>
  </aside>
  <div class="main">
    <header class="topbar">
      <button class="iconbtn navtoggle" id="navToggle" aria-label="Open menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <div class="crumb" id="crumb">Workspace <span class="sep">/</span> <b>Mission Control</b></div>
      <span class="meta" id="sigstatus"><span class="dot scanning"></span>loading…</span>
      <span class="pill" id="cfg"></span>
      <span class="tfsel" id="tfsel" title="Signal timeframe (bar size)" style="display:inline-flex;gap:4px">
        <button class="btn" data-iv="1m">1m</button><button class="btn" data-iv="1h">1h</button><button class="btn active" data-iv="1d">1d</button>
      </span>
      <button class="cmdk" id="cmdkBtn" aria-label="Open command palette">⌕ Search &amp; commands <span class="kbd">⌘K</span></button>
      <span class="meta" id="updated"></span>
    </header>
    <main class="content">
      <div class="disclaimer">⚠️ Educational only — not financial advice. The automation is <b>paper by default</b>
        and runs only when you press Start. Live trading needs <code>TRADING_MODE=live</code> set deliberately and asks for confirmation.
        No strategy guarantees profit.</div>

      <section id="sec-overview" class="section" data-views="dashboard">
        <div class="sectionhead"><div class="eyebrow">Overview</div><div class="title">Your account at a glance</div>
          <div class="desc">Live balances, today's P&amp;L and open exposure — read the bot's health in a single look.</div></div>
        <div class="summary" id="acctcards">
          <div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div>
          <div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div>
        </div>
        <div class="subhead">Account equity over time</div>
        <div class="chartbox" style="height:150px"><canvas id="miniEquity"></canvas></div>
        <div class="subhead">Open positions</div>
        <div id="posbox"><div class="note muted">No open positions yet — they appear here once the engine fills an order.</div></div>
      </section>

      <section id="sec-markets" class="section" data-views="markets" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Markets</div><div class="title">Live market intelligence</div>
          <div class="desc">Real-time prices, sector heatmap and index overview — powered by TradingView, rendered in your browser.</div></div>
        <div class="tvwrap tv-tape" id="tv-tape"><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div></div>
        <div class="subhead">S&amp;P 500 heatmap — size by market cap, color by daily change</div>
        <div class="tvwrap tv-tall" id="tv-heatmap"><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div></div>
        <div class="subhead">Index &amp; sector overview</div>
        <div class="tvwrap tv-mid" id="tv-overview"><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div></div>
        <div class="subhead">Full market screener — filter thousands of US tickers live (ratings, RSI, volume, %)</div>
        <div class="tvwrap tv-tall" id="tv-screener"><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div></div>
        <div class="subhead">Market-wide technical rating (S&amp;P 500 proxy)</div>
        <div class="tvwrap tv-mid" id="tv-gauge"><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div></div>
        <div class="tvnote">Charts &amp; data © TradingView. Loads live in your browser and needs internet access.</div>
      </section>

      <section id="sec-crypto" class="section" data-views="crypto" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Crypto engine · DexScreener</div><div class="title">On-chain opportunities</div>
          <div class="desc">A dedicated engine scanning ~70 tokens across categories on live DEX pairs — recency-weighted momentum, buy/sell pressure, turnover and liquidity. Charts render <b>inline</b> from DexScreener. Separate from the equity strategy; analysis only — no on-chain orders.</div></div>
        <div class="statusrow" style="margin-bottom:8px"><span class="meta" id="cryptostatus"><span class="dot scanning"></span>loading…</span></div>
        <div class="tvwrap tv-tall" id="cryptochart"><div class="note muted" style="padding:14px">Pick an opportunity below to load its live DexScreener chart here.</div></div>
        <div class="controls" id="cryptocats" style="margin-top:12px"></div>
        <div class="cards" id="cryptocards"><div class="skel skel-card"></div><div class="skel skel-card"></div></div>
        <div class="subhead">Look up any token / pair</div>
        <div class="controls">
          <input class="search" id="cryptoq" placeholder="Token, symbol or address (e.g. WIF)" aria-label="Crypto search" style="max-width:280px">
          <button class="btn" id="cryptogo">Search</button>
        </div>
        <div id="cryptolookup"></div>
        <div class="tvnote">Data &amp; charts © DexScreener · load live in your browser and need internet access.</div>
      </section>

      <section id="sec-polymarket" class="section" data-views="polymarket" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Polymarket engine</div><div class="title">Prediction-market opportunities</div>
          <div class="desc">A dedicated engine scanning Polymarket's most active markets — implied probabilities, 24h moves, categories, biggest movers and what's closing soon. Separate engine; analysis only — placing orders needs a funded Polygon wallet and is not wired here.</div></div>
        <div class="statusrow" style="margin-bottom:8px"><span class="meta" id="pmstatus"><span class="dot scanning"></span>loading…</span></div>
        <div class="subhead">Biggest movers (24h)</div>
        <div class="cards" id="pmmovers"><div class="skel skel-card"></div></div>
        <div class="subhead">Closing soon (≤ 7 days)</div>
        <div class="cards" id="pmclosing"></div>
        <div class="subhead">Most active markets</div>
        <div class="controls" id="pmcats"></div>
        <div class="tablewrap"><table><thead><tr><th>Market</th><th>Category</th><th>Leading</th><th class="num">Probability</th><th class="num">24h</th><th class="num">Volume</th><th>Ends</th></tr></thead><tbody id="pmbody"></tbody></table></div>
        <div class="tvnote">Data © Polymarket Gamma API · loads live and needs internet access.</div>
      </section>

      <section id="sec-engine" class="section" data-views="dashboard engine">
        <div class="sectionhead"><div class="eyebrow">Engine</div><div class="title">Auto-trading control</div>
          <div class="desc">Preview exactly what it would do, then start it. Paper by default — it only trades while it is running.</div></div>
        <div class="ctrl">
          <button class="bigbtn ghost" id="btnPreview" onclick="previewEngine()">👁 Preview (dry run)</button>
          <button class="bigbtn start" id="btnStart" onclick="startEngine()">▶ Start</button>
          <button class="bigbtn stop" id="btnStop" onclick="stopEngine()" disabled>■ Stop</button>
          <span class="estatus" id="estatus"></span>
        </div>
        <div class="ctrl" style="margin-top:12px">
          <span class="meta">Trading mode:</span>
          <button class="btn" id="aggOff" onclick="setAggressive(false)">🛡 Conservative</button>
          <button class="btn" id="aggOn" onclick="setAggressive(true)">🔥 Aggressive</button>
          <button class="btn" id="dayBtn" onclick="toggleDayTrade()">⚡ Day-trade mode: off</button>
          <button class="btn" id="gateBtn" onclick="toggleGate()">🤖 AI risk-gate: off</button>
          <span class="meta" id="aggwarn"></span>
        </div>
        <div class="ctrl" style="margin-top:12px">
          <button class="bigbtn start" id="autotuneBtn" onclick="autoTune()" title="Read live market conditions and apply the best risk-adjusted combination of settings">⚡ Auto-Tune (adaptive)</button>
          <button class="btn" id="dynBtn" onclick="toggleDynPos()">📊 Dynamic positions: off</button>
          <span class="meta" id="regimeReadout"></span>
        </div>
        <div class="hint" id="autotuneMsg" style="margin-top:8px">Auto-Tune reads current market breadth/trend and sets entries, ATR sizing and a variable position cap to a risk-adjusted combination. It does not guarantee profit.</div>
        <div id="previewbox"></div>
        <div class="subhead">Engine activity</div>
        <div class="actfeed" id="actfeed"><div class="muted">Engine idle. Press Preview to see what it would do, or Start to run it.</div></div>
      </section>

      <section id="sec-risk" class="section" data-views="risk" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Risk</div><div class="title">Position &amp; risk preferences</div>
          <div class="desc">Applied to both the signals below and the live engine. Choose fixed-percent or volatility-aware (ATR) sizing.</div></div>
        <div class="account">
          <div class="field"><span>Sizing mode</span>
            <span><button class="btn" id="mFixed" onclick="setSizeMode('fixed')">Fixed %</button>
            <button class="btn" id="mAtr" onclick="setSizeMode('atr')">📈 ATR-adaptive</button></span></div>
          <div class="field"><span>Max % / position</span><input id="maxPct" type="number" min="1" max="100" step="1"></div>
          <div class="field"><span>Stop-loss %</span><input id="stopPct" type="number" min="0.5" step="0.5"></div>
          <div class="field"><span>Take-profit %</span><input id="targetPct" type="number" min="0.5" step="0.5"></div>
          <div class="hint" id="caphint">Sizing off your account balance.</div>
        </div>
        <div class="hint" id="modehint" style="margin-top:11px"></div>
      </section>

      <section id="sec-signals" class="section" data-views="signals" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Signals</div><div class="title">Live opportunities</div>
          <div class="desc">Ranked across the universe. The projection assumes you take every buy; each card is a ready-to-place order ticket.</div></div>
        <div class="subhead">Portfolio — if you take every buy below</div>
        <div class="summary" id="summary">
          <div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div>
          <div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div>
        </div>
        <div class="subhead">Diversification — buys by sector</div>
        <div class="secbar" id="sectors"></div>
        <div class="chartbox" style="height:210px;max-width:540px;margin-top:10px"><canvas id="sectorDonut"></canvas></div>
        <div class="subhead">Top buys — your exact order tickets</div>
        <div class="cards" id="topbuys"><div class="skel skel-card"></div><div class="skel skel-card"></div></div>
        <div class="subhead">All tickers</div>
        <div class="controls">
          <input class="search" id="search" placeholder="Search ticker or sector…" aria-label="Search tickers">
          <span class="fchip active" data-f="all" onclick="setFilter(this)">All</span>
          <span class="fchip" data-f="strong" onclick="setFilter(this)">Strong buy</span>
          <span class="fchip" data-f="buys" onclick="setFilter(this)">Buys</span>
          <span class="fchip" data-f="hold" onclick="setFilter(this)">Hold</span>
          <span class="fchip" data-f="sell" onclick="setFilter(this)">Sell</span>
        </div>
        <div class="tablewrap"><table><thead><tr>
          <th onclick="setSort('rank')">Ticker</th><th>Trend</th><th class="num" onclick="setSort('conviction')">Conv</th>
          <th class="num" onclick="setSort('price')">Price</th><th class="num" onclick="setSort('change')">20-bar</th>
          <th class="num" onclick="setSort('rsi')">RSI</th><th class="num" onclick="setSort('shares')">Shares</th>
          <th class="num" onclick="setSort('ev')">Exp.value</th><th class="num" onclick="setSort('win')">Win rate</th><th></th>
        </tr></thead><tbody id="allbody"></tbody></table></div>
      </section>

      <section id="sec-options" class="section" data-views="options" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Options</div><div class="title">Express your signals as options</div>
          <div class="desc">The strategy is a price buy/sell signal; this view translates today's BUY signals into a concrete options trade (an at-the-money call), and lets you inspect any ticker's chain. <b>Decision support — not advice, and no orders are placed.</b></div></div>
        <div class="subhead">Options ideas from your BUY signals — at-the-money calls (nearest expiry)</div>
        <div id="optideas"><div class="skel skel-card"></div></div>
        <div class="subhead">Look up any options chain</div>
        <div class="controls">
          <input class="search" id="optsym" placeholder="Ticker, e.g. AAPL" aria-label="Options ticker" style="max-width:220px">
          <button class="btn" id="optgo">Load chain</button>
        </div>
        <div id="optlookup"><div class="note muted">Enter a ticker above to see its nearest-expiry calls &amp; puts, volume and put/call ratio.</div></div>
        <div class="tvnote">Options data © Yahoo via yfinance · loads live and needs internet access.</div>
      </section>

      <section id="sec-trades" class="section" data-views="dashboard trades">
        <div class="sectionhead"><div class="eyebrow">Trades</div><div class="title">Today's closed trades</div>
          <div class="desc">Every position the engine has opened and closed since midnight UTC, with realised P&amp;L.</div></div>
        <div class="tablewrap"><table><thead><tr><th>Ticker</th><th class="num">Entry</th><th class="num">Exit</th>
          <th class="num">PnL $</th><th class="num">PnL %</th><th>Reason</th></tr></thead><tbody id="todaybody"></tbody></table></div>
      </section>

      <section id="sec-performance" class="section" data-views="performance" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Performance</div><div class="title">Realised performance</div>
          <div class="desc">Built from your own closed trades — win rate, P&amp;L, drawdown and the equity curve over time.</div></div>
        <div class="summary" id="perfcards">
          <div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div>
          <div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div>
        </div>
        <div class="subhead">Equity curve (realised P&amp;L)</div>
        <div class="chartbox"><canvas id="perfChart"></canvas></div>
        <div class="subhead">Drawdown (underwater — % below peak equity)</div>
        <div class="chartbox" style="height:170px"><canvas id="ddChart"></canvas></div>
        <div class="subhead">Win / loss split</div>
        <div class="chartbox" style="height:210px;max-width:420px"><canvas id="wlDonut"></canvas></div>
        <div class="subhead">Closed trades</div>
        <div class="tablewrap"><table><thead><tr><th>Ticker</th><th class="num">Entry</th><th class="num">Exit</th>
          <th class="num">Qty</th><th class="num">PnL $</th><th class="num">PnL %</th><th>Closed</th><th>Reason</th></tr></thead>
          <tbody id="perfbody"></tbody></table></div>
      </section>

      <section id="sec-backtest" class="section" data-views="backtest" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Backtesting</div><div class="title">Test a strategy on history</div>
          <div class="desc">Replays the strategy over historical data for any ticker, using your current lookback, stop and target settings.</div></div>
        <div class="account">
          <div class="field"><span>Ticker</span><input id="btTicker" type="text" value="AAPL" style="width:120px;text-transform:uppercase"></div>
          <div class="field"><span>Equation</span><span><button class="btn active" id="btEq1" onclick="btSetEq(1)">Eq 1</button>
            <button class="btn" id="btEq2" onclick="btSetEq(2)">Eq 2</button></span></div>
          <div class="field"><span>Years</span><input id="btYears" type="number" min="0.5" max="15" step="0.5" value="3" style="width:90px"></div>
          <div class="field"><span>&nbsp;</span><button class="bigbtn start" id="btRun" onclick="runBacktest()">▶ Run backtest</button></div>
        </div>
        <div id="btresult" style="margin-top:16px"></div>
      </section>

      <section id="sec-logs" class="section" data-views="logs" style="display:none">
        <div class="sectionhead"><div class="eyebrow">Activity Log</div><div class="title">Engine activity history</div>
          <div class="desc">Every line the engine has logged — entries, exits, cycle summaries, warnings — persisted across restarts.</div></div>
        <div class="controls">
          <input class="search" id="logSearch" placeholder="Filter messages…" oninput="logFilter()" aria-label="Filter log">
          <span class="fchip active" data-lv="ALL" onclick="logLevel(this)">All</span>
          <span class="fchip" data-lv="INFO" onclick="logLevel(this)">Info</span>
          <span class="fchip" data-lv="WARNING" onclick="logLevel(this)">Warnings</span>
          <span class="fchip" data-lv="ERROR" onclick="logLevel(this)">Errors</span>
          <button class="btn" onclick="loadLogs()">↻ Refresh</button>
        </div>
        <div class="logconsole" id="logbox"><div class="muted">Loading activity history…</div></div>
      </section>

      <div class="foot" id="foot"></div>
    </main>
  </div>
</div>
<div class="scrim" id="scrim"></div>
<div class="palette" id="palette" role="dialog" aria-modal="true" aria-label="Command palette">
  <input id="palinput" placeholder="Search tickers, jump to a page, or run a command…" aria-label="Command palette search">
  <div class="palres" id="palres"></div>
</div>
<button class="copilot-fab" id="copilotFab" aria-label="Open AI co-pilot">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/></svg>
  <span class="cf-label">Ask AI</span></button>
<div class="copilot" id="copilot" aria-label="AI co-pilot" role="dialog">
  <div class="cp-head"><span class="cp-title">✦ AI Co-pilot</span><span class="cp-status" id="cpStatus"></span>
    <button class="iconbtn" id="cpClose" aria-label="Close co-pilot">✕</button></div>
  <div class="cp-msgs" id="cpMsgs"></div>
  <div class="cp-input"><textarea id="cpInput" rows="1" placeholder="Ask about your signals, risk, or a ticker…" aria-label="Ask the AI co-pilot"></textarea>
    <button class="bigbtn start" id="cpSend">Send</button></div>
</div>
<script>""" + _SHELL_JS + """</script>
<script>
const REFRESH = __REFRESH__ * 1000;
""" + _SHARED_JS + """
let LAST=null, ACC=null, FILTER='all', SEARCH='', SORTK='rank', SORTD=-1;
const briefHTML = t => !t ? '' : t.replace(/(Rationale:|Risk check:|Caution:)/g,'<b>$1</b>');
const recRank = {'STRONG BUY':5,'BUY':4,'HOLD':3,'WAIT':2,'SELL':1,'STRONG SELL':0};

function initInputs(){const s=getSettings();['maxPct','stopPct','targetPct'].forEach(k=>{const el=document.getElementById(k);el.value=s[k];el.onchange=()=>{const v=parseFloat(el.value);if(!isNaN(v)&&v>0){localStorage.setItem(k,v);renderSignals();}};});document.getElementById('search').oninput=e=>{SEARCH=e.target.value.trim().toLowerCase();renderSignals();};}
function setFilter(el){FILTER=el.dataset.f;document.querySelectorAll('.fchip').forEach(c=>c.classList.toggle('active',c===el));renderSignals();}
function setSort(k){if(SORTK===k)SORTD*=-1;else{SORTK=k;SORTD=-1;}renderSignals();}
function setSizeMode(m){SIZEMODE=m;updateModeUI();renderSignals();fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({atr_adaptive:m==='atr'})});}
function updateModeUI(){const f=document.getElementById('mFixed'),a=document.getElementById('mAtr');if(!f)return;f.classList.toggle('active',SIZEMODE==='fixed');a.classList.toggle('active',SIZEMODE==='atr');document.getElementById('modehint').innerHTML=SIZEMODE==='atr'?`<b>ATR-adaptive sizing is ON</b> — stops &amp; targets come from each stock's recent volatility (×${ATR_STOPM} stop, ×${ATR_TGTM} target), risking <b>${ATR_RISK}%</b> of equity per trade. Calm stocks get tight stops, volatile ones wider — automatically. The Stop/Take-profit % above are ignored in this mode, and the live engine uses it too.`:`<b>Fixed % sizing</b> — every trade uses the Stop / Take-profit % above. Switch to ATR-adaptive for volatility-aware risk that also drives the engine.`;}

// ---- engine control ----
async function eng(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});return r.json();}
async function startEngine(){
  const mode=ACC&&ACC.engine?ACC.engine.mode:'PAPER';
  if(mode==='LIVE' && !confirm('⚠️ LIVE MODE — this places REAL orders with REAL money.\\n\\nStart live auto-trading?')) return;
  if(mode!=='LIVE' && !confirm('Start PAPER auto-trading? (simulated money — safe)')) return;
  const r=await eng('/api/engine/start',{}); if(!r.ok) alert('Could not start: '+(r.error||'unknown')); tickAccount();
}
async function stopEngine(){ await eng('/api/engine/stop',{}); tickAccount(); }
function setAggressive(on){if(on&&!confirm('🔥 Aggressive mode takes more, lower-conviction trades (any BUY, any trend) — higher risk. Turn it on?'))return;eng('/api/config',{aggressive_mode:on}).then(tickAccount);}
function toggleGate(){const on=!(ACC&&ACC.engine&&ACC.engine.ai_gate);eng('/api/config',{ai_gate:on}).then(tickAccount);}
function toggleDayTrade(){const on=!(ACC&&ACC.engine&&ACC.engine.day_trade);if(on&&!confirm('⚡ Day-trade mode switches to 1-hour bars, turns ON aggressive entries (any BUY), and runs the engine every ~3s.\\n\\nMore frequent trades, higher risk. Turn it on?'))return;eng('/api/config',{day_trade:on}).then(tickAccount);}
function toggleDynPos(){const on=!(ACC&&ACC.engine&&ACC.engine.dynamic_positions);eng('/api/config',{dynamic_positions:on}).then(tickAccount);}
async function autoTune(){const b=document.getElementById('autotuneBtn');b.disabled=true;const old=b.textContent;b.textContent='⚡ Tuning…';try{const r=await eng('/api/config',{autotune:true});if(r&&r.autotune){document.getElementById('autotuneMsg').innerHTML='✅ '+r.autotune.message;}else{document.getElementById('autotuneMsg').textContent='Auto-Tune applied.';}}catch(e){document.getElementById('autotuneMsg').textContent='Auto-Tune failed.';}finally{b.disabled=false;b.textContent=old;tickAccount();}}
async function previewEngine(){
  document.getElementById('previewbox').innerHTML='<div class="note">Running preview…</div>';
  const r=await eng('/api/engine/preview',{}); const rows=r.rows||[];
  const acts=rows.filter(x=>x.action==='BUY'||x.action==='SELL');
  const body=rows.map(x=>{
    const lv=x.action==='BUY'?`${x.shares} sh · ${money(x.cost)} · stop ${usd(x.stop)} / target ${usd(x.target)}`:(x.action==='SELL'?'close position':(x.reason||''));
    return `<tr><td><b>${x.ticker}</b></td><td><span class="chip ${cls(x.action)}">${x.action}</span></td><td class="muted">${x.recommendation||''} ${x.conviction!=null?'· conv '+x.conviction.toFixed(0):''} ${x.trend||''}</td><td>${lv}</td></tr>`;
  }).join('');
  document.getElementById('previewbox').innerHTML=`<div class="panel" style="margin-top:12px"><div class="osh" style="margin-bottom:8px">Dry-run preview — would place ${acts.length} order(s), nothing was sent</div><div class="tablewrap"><table><thead><tr><th>Ticker</th><th>Action</th><th>Why</th><th>Plan</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function renderEngine(){
  if(!ACC) return; const e=ACC.engine;
  const running=e.running;
  document.getElementById('btnStart').disabled=running||(!ACC.account&&e.mode!=='DRY-RUN');
  document.getElementById('btnStop').disabled=!running;
  const bs=document.getElementById('btnStart');
  bs.className='bigbtn '+(e.mode==='LIVE'?'startlive':'start');
  bs.textContent=running?'▶ Running':(e.mode==='LIVE'?'▶ Start LIVE':'▶ Start Paper');
  const dot=running?'run':'stopped';
  const pol=e.policy;
  document.getElementById('estatus').innerHTML=
    `<span class="dot ${dot}"></span><span class="mode ${cls(e.mode)}">${e.mode}</span>`+
    `<span class="meta">${running?'running since '+e.started_at:'stopped'} · policy ${pol.signal}${pol.require_uptrend?' · uptrend-only':''}${e.kill_switch?' · <span class="red">KILL SWITCH ON</span>':''}</span>`;
  const agg=e.aggressive;
  document.getElementById('aggOff').classList.toggle('active',!agg);
  document.getElementById('aggOn').classList.toggle('active',agg);
  const gb=document.getElementById('gateBtn');gb.textContent='🤖 AI risk-gate: '+(e.ai_gate?'on':'off');gb.classList.toggle('active',e.ai_gate);
  const dt=e.day_trade;const dtb=document.getElementById('dayBtn');
  if(dtb){dtb.textContent=dt?`⚡ Day-trade mode: ON (${e.interval||'1h'} · ${e.loop_secs||3}s loop)`:'⚡ Day-trade mode: off';dtb.classList.toggle('active',dt);}
  document.getElementById('aggwarn').innerHTML=dt?'<span style="color:var(--amber);font-weight:700">⚡ DAY-TRADE: 1h bars · aggressive · ~3s loop — more trades, higher risk</span>':(agg?'<span style="color:var(--red);font-weight:700">🔥 AGGRESSIVE: more, lower-conviction trades — higher risk</span>':'');
  const dyn=e.dynamic_positions;const db2=document.getElementById('dynBtn');
  if(db2){db2.textContent='📊 Dynamic positions: '+(dyn?'ON':'off');db2.classList.toggle('active',dyn);}
  const rr=document.getElementById('regimeReadout');
  if(rr&&e.regime){const cap=dyn?e.max_open_effective:e.max_open_fixed;const rl=e.regime.label||'';const rcls=rl==='Risk-on'?'green':(rl==='Risk-off'?'red':'amber');rr.innerHTML=`max positions <b>${cap}</b> ${dyn?'(dynamic)':'(fixed)'} · market <span style="color:var(--${rcls});font-weight:700">${rl}</span> ${Math.round((e.regime.uptrend_frac||0)*100)}% uptrend`;}
  const feed=e.recent&&e.recent.length?e.recent.slice(-40).map(l=>`<div>${l.replace(/</g,'&lt;')}</div>`).join(''):'<div class="muted">No engine activity yet.</div>';
  const af=document.getElementById('actfeed'); af.innerHTML=feed; af.scrollTop=af.scrollHeight;
}

function renderAccount(){
  if(!ACC) return; const a=ACC.account, rep=ACC.report||{};
  if(a){
    CAPITAL=a.equity||__CAP__; const _ch=document.getElementById('caphint'); if(_ch)_ch.textContent='Sizing off your live Alpaca equity: '+money(CAPITAL);
    const todayPnl=(ACC.today||[]).reduce((s,t)=>s+(t.pnl_dollars||0),0);
    document.getElementById('acctcards').innerHTML=[
      ['Portfolio value',money(a.portfolio_value),''],['Buying power',money(a.buying_power),'blue'],
      ['Equity',money(a.equity),''],['Open positions',(ACC.positions||[]).length,''],
      ['Today P&L',money(todayPnl),todayPnl>=0?'green':'red'],
      ['All-time win',rep.trades?Math.round(rep.win_rate*100)+'% ('+rep.trades+')':'—','blue'],
    ].map((c,i)=>`<div class="stat" style="animation-delay:${i*40}ms"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');
  } else {
    CAPITAL=__CAP__; const _ch=document.getElementById('caphint'); if(_ch)_ch.textContent='Sizing off default '+money(__CAP__)+' — connect Alpaca to size off your real balance.';
    document.getElementById('acctcards').innerHTML=`<div class="stat" style="grid-column:1/-1"><div class="k">Account</div><div class="v" style="font-size:14px;color:var(--amber)">Not connected — add Alpaca paper keys to .env, then this shows your live account. (${ACC.broker_error||''})</div></div>`;
  }
  const pos=ACC.positions||[];
  document.getElementById('posbox').innerHTML = pos.length ? `<div class="tablewrap" style="margin-top:11px"><table><thead><tr><th>Symbol</th><th class="num">Qty</th><th class="num">Avg entry</th><th class="num">Current</th><th class="num">Mkt value</th><th class="num">Unreal. PnL</th><th class="num">PnL %</th></tr></thead><tbody>`+
    pos.map(p=>{const c=p.unrealized_pl>=0?'green':'red';return `<tr><td><b>${p.symbol}</b></td><td class="num">${p.qty}</td><td class="num">${usd(p.avg_entry_price)}</td><td class="num">${usd(p.current_price)}</td><td class="num">${money(p.market_value)}</td><td class="num ${c}">${money(p.unrealized_pl)}</td><td class="num ${c}">${(p.unrealized_plpc*100).toFixed(2)}%</td></tr>`;}).join('')+`</tbody></table></div>` : '';
  document.getElementById('todaybody').innerHTML=(ACC.today||[]).length?(ACC.today.map(t=>{const c=(t.pnl_dollars||0)>=0?'green':'red';return `<tr><td><b>${t.ticker}</b></td><td class="num">${usd(t.entry_price)}</td><td class="num">${usd(t.exit_price)}</td><td class="num ${c}">${money(t.pnl_dollars)}</td><td class="num ${c}">${(t.pnl_pct||0).toFixed(2)}%</td><td>${t.exit_reason||''}</td></tr>`;}).join('')):'<tr><td colspan="6" class="muted">no closed trades today</td></tr>';
  renderSignals();
  renderEngine();
}

// ---- signals ----
function metric(x,k,s){const e=econ(x,s);switch(k){case 'rank':return recRank[x.recommendation]??2;case 'conviction':return x.conviction;case 'price':return x.price;case 'change':return x.change_pct||0;case 'rsi':return x.rsi||0;case 'shares':return e.shares;case 'ev':return e.ev;case 'win':return edgeWin(x);}return 0;}
function card(x,s){const e=econ(x,s);const strong=x.recommendation==='STRONG BUY'?' strong':'';const agree=x.agree?'<span class="agree">✓ both agree</span>':'';const brief=x.ai_brief?`<div class="brief">${briefHTML(x.ai_brief)}</div>`:'';return `<div class="card${strong}"><div class="top"><div><a class="tk" href="/ticker/${x.ticker}">${x.ticker}</a> <span class="meta">${x.sector}</span></div><span><span class="chip ${cls(x.recommendation)}">${x.recommendation}</span>${agree}</span></div><div class="subline">${usd(x.price)} · conv ${x.conviction.toFixed(0)}/100 · edge ${pct(edgeWin(x))} win ${sparkline(x.spark)}</div><div class="bar"><span data-w="${x.conviction}"></span></div><div class="badges">${contextBadges(x)}</div>${orderTicket(x,e,s,LAST.config.interval)}${brief}</div>`;}
function row(x,s){if(x.error)return `<tr><td><a href="/ticker/${x.ticker}">${x.ticker}</a></td><td colspan="9" class="red">${x.error}</td></tr>`;const e=econ(x,s);return `<tr style="cursor:pointer" onclick="location.href='/ticker/${x.ticker}'"><td><a href="/ticker/${x.ticker}"><b>${x.ticker}</b></a> <span class="chip ${cls(x.recommendation)}">${x.recommendation}</span><div class="meta">${x.sector}</div></td><td><span class="badge ${x.trend==='Uptrend'?'green':'red'}">${x.trend||'—'}</span></td><td class="num">${x.conviction.toFixed(0)}</td><td class="num">${usd(x.price)}</td><td class="num ${(x.change_pct||0)>=0?'green':'red'}">${(x.change_pct||0)>=0?'+':''}${(x.change_pct||0).toFixed(1)}%</td><td class="num ${rsiCls(x.rsi)}">${Math.round(x.rsi)}</td><td class="num">${e.shares}</td><td class="num ${e.ev>=0?'green':'red'}">${money(e.ev)}</td><td class="num">${pct(edgeWin(x))} <span class="muted">(${x.eq1?x.eq1.edge_trades:0}t)</span></td><td>${sparkline(x.spark)}</td></tr>`;}
function visible(s){let arr=LAST.signals.slice();if(SEARCH)arr=arr.filter(x=>x.ticker.toLowerCase().includes(SEARCH)||(x.sector||'').toLowerCase().includes(SEARCH));if(FILTER==='buys')arr=arr.filter(x=>x.is_buy);else if(FILTER==='strong')arr=arr.filter(x=>x.recommendation==='STRONG BUY');else if(FILTER==='hold')arr=arr.filter(x=>x.recommendation==='HOLD');else if(FILTER==='sell')arr=arr.filter(x=>(x.recommendation||'').includes('SELL'));arr.sort((a,b)=>{const va=metric(a,SORTK,s),vb=metric(b,SORTK,s);return va<vb?SORTD:va>vb?-SORTD:0;});return arr;}
function renderSignals(){if(!LAST)return;const s=getSettings();const buys=LAST.signals.filter(x=>x.is_buy&&!x.error);let tc=0,tr=0,tw=0,te=0;buys.forEach(x=>{const e=econ(x,s);tc+=e.cost;tr+=e.risk;tw+=e.reward;te+=e.ev;});const dep=CAPITAL?(tc/CAPITAL*100):0;document.getElementById('summary').innerHTML=[['Account equity',money(CAPITAL),''],['Buy signals',buys.length,'blue'],['Capital to deploy',money(tc)+' ('+dep.toFixed(0)+'%)',''],['Total risk (stops)',money(tr),'red'],['Profit at targets',money(tw),'green'],['Expected value',money(te),te>=0?'green':'red']].map((c,i)=>`<div class="stat" style="animation-delay:${i*40}ms"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');const bySec={};buys.forEach(x=>bySec[x.sector]=(bySec[x.sector]||0)+1);const secs=Object.keys(bySec).sort();document.getElementById('sectors').innerHTML=secs.length?secs.map((k,i)=>`<div class="secchip" style="animation-delay:${i*40}ms">${k} <b>${bySec[k]}</b></div>`).join(''):'<span class="hint">No buy signals right now.</span>';drawSectorDonut(bySec);document.getElementById('topbuys').innerHTML=buys.length?buys.map((x,i)=>card(x,s).replace('<div class="card','<div style="animation-delay:'+(i*50)+'ms" class="card')).join(''):'<div class="card"><div class="subline">No fresh buy signals right now. The scanner re-checks automatically.</div></div>';document.getElementById('allbody').innerHTML=visible(s).map(x=>row(x,s)).join('');requestAnimationFrame(()=>document.querySelectorAll('.bar>span').forEach(b=>b.style.width=b.dataset.w+'%'));document.getElementById('foot').textContent=`${LAST.signals.length} tickers monitored · refreshing every ${REFRESH/1000}s · click any ticker for full detail · build __BUILD__`;}

async function tickSignals(){try{LAST=await (await fetch('/api/signals')).json();const dot=LAST.status==='ok'?'ok':(LAST.status==='error'?'error':'scanning');document.getElementById('sigstatus').innerHTML=`<span class="dot ${dot}"></span>signals ${LAST.status==='scanning'?'scanning '+LAST.config.universe+'…':LAST.status}`;const c=LAST.config;document.getElementById('cfg').textContent=`eq${c.equation_set} · ${c.interval} · ${c.universe} stocks · ${c.data_source==='alpaca'?'alpaca RT':'yfinance ~15m'}`+(LAST.ai_enabled?' · AI on':'');try{document.querySelectorAll('#tfsel .btn').forEach(function(b){b.classList.toggle('active',b.dataset.iv===c.interval);});}catch(e){}(function(){var sg=(LAST.signals||[]).filter(function(x){return x.bar_time;});var fr='',stale=false;if(sg.length){sg.forEach(function(x){if(x.bar_time>fr)fr=x.bar_time;});stale=sg.filter(function(x){return x.stale;}).length>sg.length/2;}var fb=fr?(/00:00:00Z$/.test(fr)?fr.slice(0,10):fr.slice(0,16)):'';var pill=fb?('<span class="badge '+(stale?'red':'green')+'">'+(stale?'stale':'live')+'</span> data '+fb+(LAST.updated?' · ':'')):'';document.getElementById('updated').innerHTML=pill+(LAST.updated?'scanned '+LAST.updated:'');})();SIZEMODE=LAST.config.atr_adaptive?'atr':'fixed';updateModeUI();renderSignals();}catch(e){document.getElementById('sigstatus').innerHTML='<span class="dot error"></span>fetch error';}}
async function tickAccount(){try{ACC=await (await fetch('/api/account')).json();renderAccount();}catch(e){}}
// ===== charts (Chart.js) =====
const CHARTS={};
function lineChart(id,labels,values,color,fill){if(typeof Chart==='undefined')return;const ax={grid:{color:'rgba(255,255,255,.06)'},border:{color:'rgba(255,255,255,.08)'},ticks:{color:'#828b9b',maxTicksLimit:8}};if(CHARTS[id])CHARTS[id].destroy();CHARTS[id]=new Chart(document.getElementById(id),{type:'line',data:{labels:labels,datasets:[{data:values,borderColor:color,borderWidth:1.8,pointRadius:0,tension:.12,fill:!!fill,backgroundColor:fill||'transparent'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:ax,y:ax}}});}
function statCardHTML(k,v,c){return `<div class="stat"><div class="k">${k}</div><div class="v ${c||''}">${v}</div></div>`;}
var SECCOLORS=['#6c8cff','#4cc38a','#e0a337','#e5635f','#9db0ff','#67d6c3','#b38bf5','#f0883e','#56b6c2','#d19a66','#98c379','#e06c75','#61afef'];
function donutChart(id,labels,values,colors){if(typeof Chart==='undefined')return;const el=document.getElementById(id);if(!el)return;if(CHARTS[id])CHARTS[id].destroy();CHARTS[id]=new Chart(el,{type:'doughnut',data:{labels:labels,datasets:[{data:values,backgroundColor:colors,borderColor:'rgba(0,0,0,0)',borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'right',labels:{color:'#aeb6c4',usePointStyle:true,boxWidth:8,font:{size:11}}}}}});}
function drawSectorDonut(bySec){const el=document.getElementById('sectorDonut');if(!el)return;const ks=Object.keys(bySec);if(!ks.length){if(CHARTS['sectorDonut']){CHARTS['sectorDonut'].destroy();delete CHARTS['sectorDonut'];}return;}donutChart('sectorDonut',ks,ks.map(k=>bySec[k]),ks.map((_,i)=>SECCOLORS[i%SECCOLORS.length]));}
function drawDrawdown(eq){if(!eq||!eq.length)return;let peak=-1e18;const dd=eq.map(p=>{peak=Math.max(peak,p.equity);return peak>0?((p.equity-peak)/peak*100):0;});lineChart('ddChart',eq.map(p=>(p.time||'').slice(0,10)),dd,'#e5635f','rgba(229,99,95,.12)');}
async function loadMiniEquity(){try{const d=await (await fetch('/api/performance')).json();const eq=d.equity||[];if(!eq.length)return;lineChart('miniEquity',eq.map(p=>(p.time||'').slice(0,10)),eq.map(p=>p.equity),'#6c8cff','rgba(108,140,255,.10)');}catch(e){}}
// ===== Options (centralised) =====
function optChainHTML(d){
  if(!d||d.error)return '<div class="note muted">'+((d&&d.error)||'No data')+'</div>';
  function tbl(rows){return '<table><thead><tr><th></th><th class="num">Strike</th><th class="num">Last</th><th class="num">Vol</th><th class="num">OI</th><th class="num">IV%</th></tr></thead><tbody>'+((rows||[]).map(function(r){return '<tr><td>'+(r.itm?'<span class="badge green">ITM</span>':'')+'</td><td class="num">'+r.strike+'</td><td class="num">'+usd(r.last)+'</td><td class="num">'+(r.volume||0).toLocaleString()+'</td><td class="num">'+(r.open_interest||0).toLocaleString()+'</td><td class="num">'+r.iv+'</td></tr>';}).join('')||'<tr><td colspan="6" class="muted">none</td></tr>')+'</tbody></table>';}
  var pcr=d.put_call_ratio==null?'—':d.put_call_ratio,bcls=/bull/.test(d.bias||'')?'green':(/bear/.test(d.bias||'')?'red':'muted');
  return '<div class="card"><div class="summary">'+statCardHTML(d.symbol+' · '+d.expiry,'expiry')+statCardHTML('Call volume',(d.call_volume||0).toLocaleString(),'green')+statCardHTML('Put volume',(d.put_volume||0).toLocaleString(),'red')+statCardHTML('Put / Call',pcr,bcls)+'</div><div style="margin:8px 0"><span class="badge '+bcls+'">'+(d.bias||'')+'</span></div><div class="subhead">Most active calls</div><div class="tablewrap">'+tbl(d.calls)+'</div><div class="subhead">Most active puts</div><div class="tablewrap">'+tbl(d.puts)+'</div></div>';
}
function ideaCardHTML(x){
  if(!x||x.error)return '<div class="card"><div class="subline"><b>'+((x&&x.symbol)||'?')+'</b> — '+((x&&x.error)||'no idea')+'</div></div>';
  return '<div class="card"><div style="display:flex;align-items:center;gap:9px;margin-bottom:6px"><span class="chip '+cls(x.recommendation)+'">'+(x.recommendation||'')+'</span> <b>'+x.label+'</b></div><div class="summary">'+statCardHTML('Premium',usd(x.premium))+statCardHTML('Break-even',usd(x.breakeven))+statCardHTML('Spot',usd(x.spot))+statCardHTML('IV',x.iv+'%')+statCardHTML('Max risk / contract',usd(x.max_risk_per_contract),'red')+'</div><div class="subline" style="margin-top:6px">Buy 1 contract of <b>'+x.label+'</b> to express the '+(x.recommendation||'BUY')+' — ≈ '+usd(x.max_risk_per_contract)+' risk, break-even '+usd(x.breakeven)+'. <a href="/ticker/'+x.symbol+'">full detail →</a></div></div>';
}
async function loadOptionChain(sym){sym=(sym||'').trim().toUpperCase();if(!sym)return;var box=document.getElementById('optlookup');box.innerHTML='<div class="skel skel-card"></div>';try{const d=await (await fetch('/api/options/'+encodeURIComponent(sym))).json();box.innerHTML=optChainHTML(d);}catch(e){box.innerHTML='<div class="note muted">Could not load '+sym+' chain (needs internet).</div>';}}
async function loadOptionsView(){
  var go=document.getElementById('optgo');
  if(go&&!go._wired){go._wired=true;go.addEventListener('click',function(){loadOptionChain(document.getElementById('optsym').value);});document.getElementById('optsym').addEventListener('keydown',function(e){if(e.key==='Enter')loadOptionChain(document.getElementById('optsym').value);});}
  var box=document.getElementById('optideas');box.innerHTML='<div class="skel skel-card"></div><div class="skel skel-card"></div>';
  try{const d=await (await fetch('/api/options/ideas')).json();const ideas=d.ideas||[];box.innerHTML=ideas.length?ideas.map(ideaCardHTML).join(''):'<div class="card"><div class="subline">No BUY signals right now — options ideas appear here when the scanner finds buys.</div></div>';}
  catch(e){box.innerHTML='<div class="note muted">Could not load options ideas (needs internet).</div>';}
}

// ===== Performance =====
async function loadPerformance(){try{const d=await (await fetch('/api/performance')).json();const r=d.report||{};const pf=(r.profit_factor==null)?'—':(r.profit_factor>99?'∞':r.profit_factor.toFixed(2));
  document.getElementById('perfcards').innerHTML=[['Closed trades',r.trades||0,''],['Win rate',r.trades?Math.round(r.win_rate*100)+'%':'—','blue'],['Total P&L',money(r.total_pnl),(r.total_pnl||0)>=0?'green':'red'],['Total return',((r.total_return_pct||0)>=0?'+':'')+(r.total_return_pct||0).toFixed(1)+'%',(r.total_return_pct||0)>=0?'green':'red'],['Max drawdown',(r.largest_drawdown_pct||0).toFixed(1)+'%','red'],['Profit factor',pf,'']].map((c,i)=>`<div class="stat" style="animation-delay:${i*40}ms"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');
  const eqs=d.equity||[];lineChart('perfChart',eqs.map(p=>(p.time||'').slice(0,10)),eqs.map(p=>p.equity),'#6c8cff','rgba(108,140,255,.10)');
  drawDrawdown(eqs);const cl=d.closed||[];const wins=cl.filter(t=>(t.pnl_dollars||0)>0).length,losses=cl.length-wins;if(cl.length)donutChart('wlDonut',['Wins','Losses'],[wins,losses],['#4cc38a','#e5635f']);
  document.getElementById('perfbody').innerHTML=(d.closed&&d.closed.length)?d.closed.map(t=>{const c=(t.pnl_dollars||0)>=0?'green':'red';return `<tr><td><b>${t.ticker}</b></td><td class="num">${usd(t.entry_price)}</td><td class="num">${usd(t.exit_price)}</td><td class="num">${t.qty||0}</td><td class="num ${c}">${money(t.pnl_dollars)}</td><td class="num ${c}">${(t.pnl_pct||0).toFixed(2)}%</td><td class="muted">${(t.exit_time||'').replace('T',' ').slice(0,16)}</td><td class="muted">${t.exit_reason||''}</td></tr>`;}).join(''):'<tr><td colspan="8" class="muted">No closed trades yet — they appear here once the engine completes round trips.</td></tr>';}catch(e){}}

// ===== Backtesting =====
let BT_EQ=1;
function btSetEq(n){BT_EQ=n;document.getElementById('btEq1').classList.toggle('active',n===1);document.getElementById('btEq2').classList.toggle('active',n===2);}
async function runBacktest(){const t=(document.getElementById('btTicker').value||'').trim().toUpperCase();const y=document.getElementById('btYears').value||3;const box=document.getElementById('btresult');if(!t){box.innerHTML='<div class="note warn">Enter a ticker symbol.</div>';return;}
  const btn=document.getElementById('btRun');btn.disabled=true;btn.textContent='Running…';box.innerHTML='<div class="summary"><div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div></div>';
  try{const d=await (await fetch(`/api/backtest?ticker=${encodeURIComponent(t)}&eq=${BT_EQ}&years=${y}`)).json();
    if(!d.ok){box.innerHTML=`<div class="note warn">${(d.error||'Backtest failed.')}</div>`;return;}
    const r=d.report||{};const pf=(r.profit_factor>99?'∞':(r.profit_factor||0).toFixed(2));
    box.innerHTML=`<div class="summary">${statCardHTML('Win rate',Math.round(r.win_rate*100)+'%','blue')}${statCardHTML('Total return',((r.total_return_pct||0)>=0?'+':'')+(r.total_return_pct||0).toFixed(0)+'%',(r.total_return_pct||0)>=0?'green':'red')}${statCardHTML('Trades',r.trades)}${statCardHTML('Max drawdown',(r.largest_drawdown_pct||0).toFixed(1)+'%','red')}${statCardHTML('Sharpe',(r.sharpe||0).toFixed(2))}${statCardHTML('Profit factor',pf)}${statCardHTML('Avg win',money(r.avg_win),'green')}${statCardHTML('Avg loss',money(r.avg_loss),'red')}</div><div class="subhead">Equity curve — ${d.ticker} · eq${d.equation_set} · ${d.interval} · ${d.years}y</div><div class="chartbox"><canvas id="btChart"></canvas></div>`;
    lineChart('btChart',d.equity.labels,d.equity.values,'#4cc38a','rgba(76,195,138,.10)');
  }catch(e){box.innerHTML='<div class="note warn">Backtest error: '+e+'</div>';}finally{btn.disabled=false;btn.textContent='▶ Run backtest';}}

// ===== Activity log =====
let LOG_LV='ALL',LOG_T=null,LOG_AUTO=null;
function logLevel(el){LOG_LV=el.dataset.lv;document.querySelectorAll('#sec-logs .fchip').forEach(c=>c.classList.toggle('active',c===el));loadLogs();}
function logFilter(){clearTimeout(LOG_T);LOG_T=setTimeout(loadLogs,250);}
async function loadLogs(){const q=(document.getElementById('logSearch').value||'').trim();try{const d=await (await fetch(`/api/engine/log?limit=800&level=${LOG_LV}&q=${encodeURIComponent(q)}`)).json();const rows=d.rows||[];
  document.getElementById('logbox').innerHTML=rows.length?rows.map(r=>{const lv=r.level||'INFO';const cl=(lv==='ERROR'||lv==='CRITICAL')?'red':(lv==='WARNING'?'amber':'muted');const ts=(r.ts||'').replace('T',' ').slice(0,19);return `<div class="logline"><span class="logts">${ts}</span><span class="loglv ${cl}">${lv}</span><span class="logmsg">${(r.message||'').replace(/</g,'&lt;')}</span></div>`;}).join(''):'<div class="muted" style="padding:14px 16px">No log entries yet. Start the engine and its activity will accumulate here.</div>';}catch(e){document.getElementById('logbox').innerHTML='<div class="red" style="padding:14px 16px">Could not load the log.</div>';}}

// ===== AI co-pilot =====
let CP_MSGS=[],CP_READY=false;
function openCopilot(){document.getElementById('copilot').classList.add('open');document.getElementById('copilotFab').classList.add('hide');if(!CP_READY)cpInit();setTimeout(()=>document.getElementById('cpInput').focus(),60);}
function closeCopilot(){document.getElementById('copilot').classList.remove('open');document.getElementById('copilotFab').classList.remove('hide');}
window.openCopilot=openCopilot;
async function cpInit(){CP_READY=true;try{const s=await (await fetch('/api/ai/status')).json();document.getElementById('cpStatus').innerHTML=s.enabled?'<span class="dot ok"></span>online':'<span class="dot off"></span>add key';if(!CP_MSGS.length)cpPush('ai',s.enabled?"Hi — I'm your co-pilot. Ask me about a signal, your risk settings, or what to do next.":"I'm off right now. Add ANTHROPIC_API_KEY to .env and restart to switch me on.");}catch(e){}}
function cpPush(who,text){CP_MSGS.push({who,text});const box=document.getElementById('cpMsgs');box.innerHTML=CP_MSGS.map(m=>`<div class="cp-msg ${m.who}">${m.who==='ai'?'<span class="cp-av">✦</span>':''}<div class="cp-bubble">${(m.text||'').replace(/</g,'&lt;').replace(/\\n/g,'<br>')}</div></div>`).join('');box.scrollTop=box.scrollHeight;}
async function cpSend(){const inp=document.getElementById('cpInput');const q=(inp.value||'').trim();if(!q)return;inp.value='';inp.style.height='auto';cpPush('me',q);cpPush('ai','…');try{const d=await (await fetch('/api/ai/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})})).json();CP_MSGS.pop();cpPush('ai',d.answer||'No response.');}catch(e){CP_MSGS.pop();cpPush('ai','Network error — try again.');}}

// ===== view hook + wiring =====
// ===== Crypto engine (DexScreener) — inline charts + category filter =====
var CRYPTO={data:null,cat:'All'};
function cryptoEmbed(url){var box=document.getElementById('cryptochart');if(!url){box.innerHTML='<div class="note muted" style="padding:14px">No chart available for this pair.</div>';return;}box.innerHTML='<iframe src="'+url+'" style="width:100%;height:100%;border:0;border-radius:12px" loading="lazy" referrerpolicy="no-referrer"></iframe>';}
function cryptoChips(){var cats=(CRYPTO.data&&CRYPTO.data.categories)||{};var el=document.getElementById('cryptocats');var html='<span class="fchip'+(CRYPTO.cat==='All'?' active':'')+'" data-c="All">All</span>';Object.keys(cats).forEach(function(c){html+='<span class="fchip'+(CRYPTO.cat===c?' active':'')+'" data-c="'+c+'">'+c+' '+cats[c]+'</span>';});el.innerHTML=html;el.querySelectorAll('.fchip').forEach(function(ch){ch.onclick=function(){CRYPTO.cat=ch.dataset.c;cryptoRender();};});}
function cryptoCard(x){var c=cls(x.recommendation),co=x.components||{};return '<div class="card"><div style="display:flex;align-items:center;gap:9px;margin-bottom:5px;flex-wrap:wrap"><span class="chip '+c+'">'+(x.recommendation||'')+'</span> <b>'+x.symbol+'</b> <span class="badge muted">'+(x.category||'')+'</span> <span class="meta">'+x.chain+' · '+x.dex+'</span></div><div class="summary">'+statCardHTML('Price',usd(x.price_usd))+statCardHTML('24h',(x.change_h24>=0?'+':'')+(x.change_h24||0).toFixed(1)+'%',x.change_h24>=0?'green':'red')+statCardHTML('Liquidity',money(x.liquidity))+statCardHTML('24h volume',money(x.volume24))+statCardHTML('Conviction',(x.conviction||0)+'/100','blue')+'</div><div class="subline" style="margin-top:6px">mom '+(co.momentum!=null?co.momentum:'–')+' · pressure '+(co.pressure!=null?co.pressure:'–')+' · turnover '+(co.turnover!=null?co.turnover:'–')+'x · <a href="#" class="vchart" data-embed="'+(x.embed_url||'')+'">view chart ↑</a>'+(x.url?' · <a href="'+x.url+'" target="_blank" rel="noopener">DexScreener →</a>':'')+'</div></div>';}
function cryptoRender(){var box=document.getElementById('cryptocards');var items=(CRYPTO.data&&CRYPTO.data.items)||[];if(CRYPTO.cat!=='All')items=items.filter(function(x){return x.category===CRYPTO.cat;});box.innerHTML=items.length?items.map(cryptoCard).join(''):'<div class="card"><div class="subline">No opportunities in this category right now.</div></div>';box.querySelectorAll('.vchart').forEach(function(a){a.onclick=function(e){e.preventDefault();cryptoEmbed(a.dataset.embed);document.getElementById('cryptochart').scrollIntoView({behavior:'smooth',block:'nearest'});};});cryptoChips();}
async function loadCrypto(){var go=document.getElementById('cryptogo');if(go&&!go._wired){go._wired=true;go.addEventListener('click',cryptoSearch);document.getElementById('cryptoq').addEventListener('keydown',function(e){if(e.key==='Enter')cryptoSearch();});}var st=document.getElementById('cryptostatus');try{const d=await (await fetch('/api/crypto')).json();CRYPTO.data=d;st.innerHTML='<span class="dot '+(d.status==='ok'?'ok':(d.status==='error'?'error':'scanning'))+'"></span>'+(d.error?('crypto: '+d.error):('scanned '+(d.scanned||0)+' · '+((d.items||[]).length)+' ranked'+(d.thin?(' · '+d.thin+' thin'):'')))+(d.updated?(' · '+d.updated):'');cryptoRender();var first=(d.items||[])[0];if(first&&first.embed_url&&!document.querySelector('#cryptochart iframe'))cryptoEmbed(first.embed_url);}catch(e){st.innerHTML='<span class="dot error"></span>fetch error';}}
async function cryptoSearch(){var q=document.getElementById('cryptoq').value,box=document.getElementById('cryptolookup');if(!(q||'').trim())return;box.innerHTML='<div class="skel skel-card"></div>';try{const d=await (await fetch('/api/crypto/search?q='+encodeURIComponent(q))).json();if(d.error){box.innerHTML='<div class="note muted">'+d.error+'</div>';return;}var its=(d.items||[]).slice(0,12);box.innerHTML=its.length?'<div class="tablewrap"><table><thead><tr><th>Pair</th><th>Chain / DEX</th><th class="num">Price</th><th class="num">24h</th><th class="num">Liquidity</th><th class="num">24h vol</th><th></th></tr></thead><tbody>'+its.map(function(x){return '<tr><td><b>'+x.symbol+'</b></td><td class="muted">'+x.chain+' · '+x.dex+'</td><td class="num">'+usd(x.price_usd)+'</td><td class="num '+(x.change_h24>=0?'green':'red')+'">'+(x.change_h24>=0?'+':'')+(x.change_h24||0).toFixed(1)+'%</td><td class="num">'+money(x.liquidity)+'</td><td class="num">'+money(x.volume24)+'</td><td><a href="#" class="vchart" data-embed="'+(x.embed_url||'')+'">chart ↑</a></td></tr>';}).join('')+'</tbody></table></div>':'<div class="note muted">No pairs found.</div>';box.querySelectorAll('.vchart').forEach(function(a){a.onclick=function(e){e.preventDefault();cryptoEmbed(a.dataset.embed);document.getElementById('cryptochart').scrollIntoView({behavior:'smooth',block:'nearest'});};});}catch(e){box.innerHTML='<div class="note muted">Search failed (needs internet).</div>';}}
// ===== Polymarket engine — categories, movers, closing-soon, probability bars =====
var PM={data:null,cat:'All'};
function pmSig(s){return '<span class="badge '+(s==='BIG MOVER'?'green':'muted')+'">'+s+'</span>';}
function pmProb(p){var pct=Math.round((p||0)*100);return '<span class="bar" style="display:inline-block;width:64px;vertical-align:middle;margin-right:6px"><span style="width:'+pct+'%"></span></span>'+pct+'%';}
function pmCard(x){var up=x.change24>=0;return '<div class="card"><div style="margin-bottom:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="badge '+(up?'green':'red')+'">'+(up?'+':'')+((x.change24||0)*100).toFixed(0)+' pts</span> <b>'+x.top_outcome+' '+((x.top_prob||0)*100).toFixed(0)+'%</b> <span class="badge muted">'+(x.category||'')+'</span></div><div class="subline">'+x.question+' · '+money(x.volume)+' vol'+(x.days_left!=null&&x.days_left>=0?(' · '+x.days_left+'d left'):'')+(x.url?' · <a href="'+x.url+'" target="_blank" rel="noopener">open →</a>':'')+'</div></div>';}
function pmChips(){var cats=(PM.data&&PM.data.categories)||{};var el=document.getElementById('pmcats');var html='<span class="fchip'+(PM.cat==='All'?' active':'')+'" data-c="All">All</span>';Object.keys(cats).forEach(function(c){html+='<span class="fchip'+(PM.cat===c?' active':'')+'" data-c="'+c+'">'+c+' '+cats[c]+'</span>';});el.innerHTML=html;el.querySelectorAll('.fchip').forEach(function(ch){ch.onclick=function(){PM.cat=ch.dataset.c;pmRender();};});}
function pmRow(x){var up=x.change24>=0;return '<tr><td><a href="'+x.url+'" target="_blank" rel="noopener">'+x.question+'</a> '+pmSig(x.signal)+'</td><td class="muted">'+(x.category||'')+'</td><td>'+x.top_outcome+'</td><td class="num">'+pmProb(x.top_prob)+'</td><td class="num '+(up?'green':'red')+'">'+(up?'+':'')+((x.change24||0)*100).toFixed(0)+'</td><td class="num">'+money(x.volume)+'</td><td class="muted">'+x.end_date+(x.days_left!=null&&x.days_left>=0?(' ('+x.days_left+'d)'):'')+'</td></tr>';}
function pmRender(){var items=(PM.data&&PM.data.items)||[];var fil=PM.cat==='All'?items:items.filter(function(x){return x.category===PM.cat;});document.getElementById('pmbody').innerHTML=fil.length?fil.map(pmRow).join(''):'<tr><td colspan="7" class="muted">No markets in this category.</td></tr>';pmChips();}
async function loadPolymarket(){var st=document.getElementById('pmstatus');try{const d=await (await fetch('/api/polymarket')).json();PM.data=d;st.innerHTML='<span class="dot '+(d.status==='ok'?'ok':(d.status==='error'?'error':'scanning'))+'"></span>'+(d.error?('polymarket: '+d.error):((d.count||0)+' markets'))+(d.updated?(' · '+d.updated):'');var movers=d.movers||[];document.getElementById('pmmovers').innerHTML=movers.length?movers.map(pmCard).join(''):'<div class="card"><div class="subline">No big movers right now.</div></div>';var closing=d.closing_soon||[];document.getElementById('pmclosing').innerHTML=closing.length?closing.map(pmCard).join(''):'<div class="card"><div class="subline">Nothing resolving in the next 7 days.</div></div>';pmRender();}catch(e){st.innerHTML='<span class="dot error"></span>fetch error';}}
window.onOsView=function(v){if(LOG_AUTO){clearInterval(LOG_AUTO);LOG_AUTO=null;}if(v==='performance')loadPerformance();else if(v==='dashboard')loadMiniEquity();else if(v==='options')loadOptionsView();else if(v==='crypto')loadCrypto();else if(v==='polymarket')loadPolymarket();else if(v==='logs'){loadLogs();LOG_AUTO=setInterval(loadLogs,5000);}};
function setTimeframe(iv){fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({interval:iv})}).then(function(){document.querySelectorAll('#tfsel .btn').forEach(function(b){b.classList.toggle('active',b.dataset.iv===iv);});tickSignals();}).catch(function(){});}
document.querySelectorAll('#tfsel .btn').forEach(function(b){b.addEventListener('click',function(){setTimeframe(b.dataset.iv);});});
// SSE: refresh the instant a scan lands (falls back to polling if unsupported)
try{var _es=new EventSource('/api/stream');_es.addEventListener('tick',function(){tickSignals();tickAccount();});}catch(e){}
(function(){const fab=document.getElementById('copilotFab');if(fab)fab.addEventListener('click',openCopilot);const x=document.getElementById('cpClose');if(x)x.addEventListener('click',closeCopilot);const s=document.getElementById('cpSend');if(s)s.addEventListener('click',cpSend);const i=document.getElementById('cpInput');if(i){i.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();cpSend();}});i.addEventListener('input',()=>{i.style.height='auto';i.style.height=Math.min(120,i.scrollHeight)+'px';});}})();

initInputs(); tickSignals(); tickAccount(); loadMiniEquity(); setInterval(tickSignals,REFRESH); setInterval(tickAccount,Math.min(REFRESH,15000));
</script></body></html>"""


# --------------------------------------------------------------------------- #
# Detail page
# --------------------------------------------------------------------------- #
# --------------------------------------------------------------------------- #
# Login page (only served when the Supabase auth gate is active)
# --------------------------------------------------------------------------- #
_LOGIN_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HP Analytics — Sign in</title><style>""" + _CSS + """
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;min-height:100vh;overflow:hidden;position:relative}
  /* animated aurora backdrop */
  .auth-bg{position:fixed;inset:0;z-index:0;background:
    radial-gradient(1100px 620px at 12% -8%,var(--accent-soft),transparent 58%),
    radial-gradient(900px 520px at 112% 116%,rgba(76,195,138,.14),transparent 55%),var(--bg)}
  .auth-bg span{position:absolute;border-radius:50%;filter:blur(80px);opacity:.55;will-change:transform}
  .auth-bg .b1{width:480px;height:480px;left:-130px;top:-140px;background:var(--brand-grad);animation:drift 18s ease-in-out infinite}
  .auth-bg .b2{width:400px;height:400px;right:-120px;bottom:-150px;background:linear-gradient(135deg,#4cc38a,#3aa0ff);animation:drift 22s ease-in-out infinite reverse}
  .auth-bg .b3{width:300px;height:300px;left:48%;top:62%;background:linear-gradient(135deg,#a855f7,#6366f1);opacity:.28;animation:drift 26s ease-in-out infinite}
  @keyframes drift{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,30px) scale(1.07)}66%{transform:translate(-30px,20px) scale(.96)}}
  @media (prefers-reduced-motion:reduce){.auth-bg span{animation:none}}

  .authwrap{position:relative;z-index:2;min-height:100vh;display:grid;place-items:center;padding:24px}
  .authcard{width:min(424px,94vw);background:var(--surface);border:1px solid var(--hairline);border-radius:24px;padding:36px 32px 30px;box-shadow:0 40px 90px -28px rgba(0,0,0,.65);animation:fadeUp .6s cubic-bezier(.2,.7,.2,1) both;position:relative;overflow:hidden}
  @supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
    .authcard{background:color-mix(in srgb,var(--surface) 78%,transparent);backdrop-filter:blur(20px) saturate(1.5);-webkit-backdrop-filter:blur(20px) saturate(1.5)}}
  .authcard::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent)}

  .authbrand{display:flex;align-items:center;gap:12px;font-weight:800;font-size:19px;letter-spacing:-.01em}
  .authbrand .logo{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--brand-grad);font-size:21px;box-shadow:0 8px 22px -8px var(--accent)}
  .authbrand .g{background:var(--brand-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .authtitle{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:22px 0 6px}
  .authsub{color:var(--muted);font-size:13.5px;margin-bottom:24px}

  .authfield{margin-bottom:15px}
  .authfield label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin-bottom:7px}
  .inp{display:flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--hairline-2);border-radius:12px;padding:0 12px;transition:.18s}
  .inp:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  .inp svg{flex:0 0 auto;width:17px;height:17px;color:var(--muted);opacity:.85}
  .inp input{flex:1;min-width:0;background:none;border:0;color:var(--fg);font-size:15px;padding:12px 0;outline:none}
  .inp input::placeholder{color:var(--muted);opacity:.6}
  .eye{background:none;border:0;color:var(--muted);cursor:pointer;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:4px 2px;opacity:.75}
  .eye:hover{opacity:1;color:var(--accent-2)}

  .authbtn{position:relative;width:100%;margin-top:6px;padding:14px;border-radius:13px;border:0;background:var(--brand-grad);color:#06122b;font-weight:800;font-size:14.5px;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 12px 28px -12px var(--accent);display:flex;align-items:center;justify-content:center;gap:9px}
  .authbtn:hover{transform:translateY(-1px);box-shadow:0 16px 34px -12px var(--accent)}
  .authbtn:active{transform:translateY(0)}
  .authbtn:disabled{opacity:.7;cursor:wait;transform:none}
  .authbtn .spin{display:none;width:16px;height:16px;border:2px solid rgba(6,18,43,.35);border-top-color:#06122b;border-radius:50%;animation:spin .7s linear infinite}
  .authbtn.loading .spin{display:inline-block}
  @keyframes spin{to{transform:rotate(360deg)}}

  .authmsg{font-size:13px;margin-top:15px;padding:11px 13px;border-radius:11px;display:none;line-height:1.5}
  .authmsg.err{display:block;background:var(--loss-soft);color:var(--loss);border:1px solid rgba(229,99,95,.4)}
  .authmsg.ok{display:block;background:var(--profit-soft);color:var(--profit);border:1px solid rgba(76,195,138,.4)}

  .authfoot{text-align:center;margin-top:20px;color:var(--muted);font-size:13px}
  .authlink{background:none;border:0;color:var(--accent-2);cursor:pointer;font-size:13px;font-weight:700;padding:0}
  .authlink:hover{text-decoration:underline}

  .authdiv{display:flex;align-items:center;gap:12px;margin:22px 0 16px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
  .authdiv::before,.authdiv::after{content:"";height:1px;flex:1;background:var(--hairline)}
  .devbtn{width:100%;padding:11px;border-radius:11px;border:1px dashed var(--hairline-2);background:transparent;color:var(--muted);font-weight:600;font-size:13px;cursor:pointer;transition:.18s;display:flex;align-items:center;justify-content:center;gap:8px}
  .devbtn:hover:not(:disabled){border-color:var(--accent-2);color:var(--accent-2);background:var(--accent-soft)}
  .devbtn:disabled{opacity:.45;cursor:not-allowed}
  .devnote{text-align:center;color:var(--muted);font-size:11.5px;margin-top:9px;opacity:.8}
  .authcredit{position:relative;z-index:2;text-align:center;color:var(--muted);font-size:11.5px;margin-top:18px;opacity:.7}
</style></head><body>
<div class="auth-bg"><span class="b1"></span><span class="b2"></span><span class="b3"></span></div>
<div class="authwrap"><div>
  <div class="authcard">
    <div class="authbrand"><span class="logo">🦙</span><span>HP Analytics <span class="g">OS</span></span></div>
    <div class="authtitle" id="authtitle">Welcome back</div>
    <div class="authsub" id="authsub">Sign in to your control center.</div>
    <div class="authfield"><label for="email">Email</label>
      <div class="inp">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
        <input id="email" type="email" autocomplete="email" placeholder="you@example.com">
      </div>
    </div>
    <div class="authfield"><label for="password">Password</label>
      <div class="inp">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <input id="password" type="password" autocomplete="current-password" placeholder="••••••••">
        <button class="eye" id="eye" type="button" aria-label="Show password">show</button>
      </div>
    </div>
    <button class="authbtn" id="primaryBtn"><span class="lbl">Sign in</span><span class="spin" aria-hidden="true"></span></button>
    <div class="authmsg" id="msg"></div>
    <div class="authfoot"><span id="toggleText">New here?</span> <button class="authlink" id="toggleBtn">Create an account</button></div>
    <div class="authdiv">or</div>
    <button class="devbtn" id="devBtn" title="Skip sign-in for local access">⚡ Dev mode — skip sign-in</button>
    <div class="devnote" id="devNote"></div>
  </div>
  <div class="authcredit">🔒 Secured by Supabase · single-tenant gate</div>
</div></div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
const SB_URL=__SBURL__, SB_KEY=__SBKEY__, DEV_LOCAL=__DEVLOCAL__;
let client=null, mode='signin', busy=false;
try{ client = window.supabase ? supabase.createClient(SB_URL, SB_KEY) : null; }catch(e){ client=null; }
const $=id=>document.getElementById(id);
function setMsg(t,ok){const m=$('msg');m.textContent=t;m.className='authmsg '+(ok?'ok':'err');}
function clearMsg(){const m=$('msg');m.textContent='';m.className='authmsg';}
function loading(on){busy=on;const b=$('primaryBtn');b.disabled=on;b.classList.toggle('loading',on);}
function friendly(err){
  const m=((err&&err.message)||err||'').toString();
  if(/failed to fetch|networkerror|load failed|fetch/i.test(m))
    return "Couldn't reach Supabase. Check SUPABASE_URL in your .env (no quotes or trailing spaces), that the project is active, and that email auth is enabled.";
  if(/invalid login credentials/i.test(m)) return "Wrong email or password.";
  if(/user already registered|already been registered/i.test(m)) return "That email already has an account — try signing in instead.";
  if(/password/i.test(m)&&/least|short|6/i.test(m)) return "Password is too short (Supabase requires at least 6 characters).";
  return m||'Something went wrong. Please try again.';
}
function setMode(m){
  mode=m;clearMsg();
  $('authtitle').textContent=m==='signin'?'Welcome back':'Create your account';
  $('primaryBtn').querySelector('.lbl').textContent=m==='signin'?'Sign in':'Create account';
  $('authsub').textContent=m==='signin'?'Sign in to your control center.':'Set up access to your control center.';
  $('toggleText').textContent=m==='signin'?'New here?':'Already have an account?';
  $('toggleBtn').textContent=m==='signin'?'Create an account':'Sign in';
  $('password').setAttribute('autocomplete',m==='signin'?'current-password':'new-password');
}
$('toggleBtn').onclick=()=>setMode(mode==='signin'?'signup':'signin');
$('eye').onclick=()=>{const p=$('password');const sh=p.type==='password';p.type=sh?'text':'password';$('eye').textContent=sh?'hide':'show';p.focus();};
async function establish(token){
  try{
    const r=await fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:token})});
    const d=await r.json();
    if(d.ok){location.href='/';}else{setMsg(d.error||'Could not start session.',false);}
  }catch(e){setMsg('Could not reach the server to start your session.',false);}
}
async function submit(){
  if(busy)return;
  if(!client){setMsg('Auth is not configured on the server. Check SUPABASE_URL / SUPABASE_ANON_KEY in .env, then restart.',false);return;}
  const email=$('email').value.trim(), password=$('password').value;
  if(!email||!password){setMsg('Enter your email and password.',false);return;}
  loading(true);clearMsg();
  try{
    if(mode==='signup'){
      const {data,error}=await client.auth.signUp({email,password});
      if(error){setMsg(friendly(error),false);}
      else if(data.session){await establish(data.session.access_token);}
      else{setMsg('Account created — check your email to confirm, then sign in.',true);setMode('signin');}
    }else{
      const {data,error}=await client.auth.signInWithPassword({email,password});
      if(error){setMsg(friendly(error),false);}
      else if(data.session){await establish(data.session.access_token);}
      else{setMsg('Could not sign in.',false);}
    }
  }catch(e){setMsg(friendly(e),false);}
  finally{loading(false);}
}
$('primaryBtn').onclick=submit;
$('email').addEventListener('keydown',e=>{if(e.key==='Enter')$('password').focus();});
$('password').addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
(function(){
  const b=$('devBtn'), note=$('devNote');
  if(!DEV_LOCAL){b.disabled=true;note.textContent='Available only when viewing from the server machine (localhost).';return;}
  note.textContent='Bypasses the login gate on this machine only.';
  b.onclick=async()=>{
    b.disabled=true;
    try{
      const r=await fetch('/api/auth/dev',{method:'POST'});
      const d=await r.json();
      if(d.ok){location.href='/';}else{setMsg(d.error||'Dev mode unavailable.',false);b.disabled=false;}
    }catch(e){setMsg('Could not reach the server.',false);b.disabled=false;}
  };
})();
</script></body></html>"""


_DETAIL_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TICKER__ — detail</title><style>""" + _CSS + _SHELL_CSS + """</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script></head><body>
<header>
  <h1 class="brand">🦙 <span class="g">__TICKER__</span></h1>
  <a href="/" class="meta">← Control Center</a>
  <span class="meta" id="head"></span>
  <span class="statusrow" style="margin-left:auto">
    <button class="btn active" id="b1" onclick="setEq(1)">Equation 1</button>
    <button class="btn" id="b2" onclick="setEq(2)">Equation 2</button>
  </span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational only — not financial advice. Backtested edge is historical, not a guarantee.</div>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">Order ticket</div><div class="title">How to place this trade</div></div>
    <div id="planbox"><div class="skel skel-card"></div></div>
  </section>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">Live chart</div><div class="title">__TICKER__ · TradingView</div>
      <div class="desc">Live, interactive price action. The strategy's own buy/sell markers and backtest are below.</div></div>
    <div class="tvwrap tv-tall">
      <div class="tradingview-widget-container" style="height:100%;width:100%">
        <div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>
        <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>
        {"autosize":true,"symbol":"__TICKER__","interval":"D","timezone":"Etc/UTC","theme":"dark","style":"1","locale":"en","hide_top_toolbar":false,"hide_legend":false,"allow_symbol_change":false,"save_image":false,"backgroundColor":"rgba(14,17,23,1)","gridColor":"rgba(255,255,255,0.06)","calendar":false}
        </script>
      </div>
    </div>
    <div class="tvnote">Live chart © TradingView · loads in your browser and needs internet access.</div>
  </section>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">Technical rating</div><div class="title">__TICKER__ · TradingView signal gauge</div>
      <div class="desc">An independent Buy / Sell read from TradingView's oscillators &amp; moving averages, across timeframes — a second opinion next to the HP Analytics strategy signal.</div></div>
    <div class="tvwrap tv-mid">
      <div class="tradingview-widget-container" style="height:100%;width:100%">
        <div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>
        <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js" async>
        {"interval":"1D","width":"100%","isTransparent":true,"height":"100%","symbol":"__TICKER__","showIntervalTabs":true,"displayMode":"single","locale":"en","colorTheme":"dark"}
        </script>
      </div>
    </div>
    <div class="tvnote">Technical-rating gauge © TradingView · independent of the HP Analytics strategy.</div>
  </section>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">Options ticket</div><div class="title">__TICKER__ · express this signal with options</div>
      <div class="desc">A concrete at-the-money contract that expresses the strategy's signal (call for a buy, put for a bearish read), then the full nearest-expiry flow. <b>Decision support — no orders are placed.</b></div></div>
    <div id="optidea"></div>
    <div id="optbox"><div class="skel skel-card"></div></div>
  </section>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">Prediction · experimental</div><div class="title">__TICKER__ · next-bar direction model</div>
      <div class="desc">A small experimental ML model (logistic regression on this ticker's own history) estimating the chance the next bar closes higher. <b>Not part of the HP Analytics strategy</b> and easily overfit — context only, not advice.</div></div>
    <div id="predbox"><div class="skel skel-card"></div></div>
  </section>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">Price &amp; signals</div><div class="title">__TICKER__ price with buy / sell markers</div></div>
    <div class="chartbox"><canvas id="priceChart"></canvas></div>
  </section>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">Backtest</div><div class="title">Equity curve</div></div>
    <div class="chartbox"><canvas id="equityChart"></canvas></div>
  </section>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">Edge</div><div class="title">This strategy on __TICKER__</div></div>
    <div class="summary" id="stats">
      <div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div>
    </div>
  </section>
  <section class="section">
    <div class="sectionhead"><div class="eyebrow">History</div><div class="title">Recent signal history</div></div>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Signal</th><th class="num">Price</th></tr></thead><tbody id="hist"></tbody></table></div>
  </section>
  <div class="foot" id="foot"></div>
</div>
<script>
const TICKER="__TICKER__"; let EQ=1, priceChart, equityChart;
""" + _SHARED_JS + """
function setEq(n){EQ=n;document.getElementById('b1').classList.toggle('active',n===1);document.getElementById('b2').classList.toggle('active',n===2);load();}
function statCard(k,v,c){return `<div class="stat"><div class="k">${k}</div><div class="v ${c||''}">${v}</div></div>`;}
async function loadOptions(){const box=document.getElementById('optbox');try{const d=await (await fetch('/api/options/'+TICKER)).json();if(d.error){box.innerHTML='<div class="note muted">Options: '+d.error+'</div>';return;}
  function tbl(rows){return '<table><thead><tr><th></th><th class="num">Strike</th><th class="num">Last</th><th class="num">Vol</th><th class="num">OI</th><th class="num">IV%</th></tr></thead><tbody>'+((rows||[]).map(r=>'<tr><td>'+(r.itm?'<span class="badge green">ITM</span>':'')+'</td><td class="num">'+r.strike+'</td><td class="num">'+usd(r.last)+'</td><td class="num">'+(r.volume||0).toLocaleString()+'</td><td class="num">'+(r.open_interest||0).toLocaleString()+'</td><td class="num">'+r.iv+'</td></tr>').join('')||'<tr><td colspan="6" class="muted">none</td></tr>')+'</tbody></table>';}
  const pcr=d.put_call_ratio==null?'—':d.put_call_ratio;const bcls=/bull/.test(d.bias||'')?'green':(/bear/.test(d.bias||'')?'red':'muted');
  box.innerHTML='<div class="card"><div class="summary">'+statCard('Expiry',d.expiry)+statCard('Call volume',(d.call_volume||0).toLocaleString(),'green')+statCard('Put volume',(d.put_volume||0).toLocaleString(),'red')+statCard('Put / Call',pcr,bcls)+'</div><div style="margin:8px 0"><span class="badge '+bcls+'">'+(d.bias||'')+'</span></div><div class="subhead">Most active calls</div><div class="tablewrap">'+tbl(d.calls)+'</div><div class="subhead">Most active puts</div><div class="tablewrap">'+tbl(d.puts)+'</div></div>';
}catch(e){box.innerHTML='<div class="note muted">Options data unavailable (needs internet).</div>';}}
async function loadPredict(){const box=document.getElementById('predbox');if(!box)return;try{const d=await (await fetch('/api/predict/'+TICKER)).json();if(d.error){box.innerHTML='<div class="note muted">Prediction: '+d.error+'</div>';return;}const up=d.prob_up>=0.5;box.innerHTML='<div class="card"><div class="summary">'+statCard('P(next bar up)',(d.prob_up*100).toFixed(1)+'%',up?'green':'red')+statCard('Direction',(d.direction||'').toUpperCase(),up?'green':'red')+statCard('Confidence',d.confidence+'%')+statCard('Holdout accuracy',(d.holdout_accuracy*100).toFixed(0)+'%','blue')+'</div><div class="note warn" style="margin-top:8px">⚠️ Experimental — logistic regression on '+d.n_train+' bars; base rate up '+(d.base_rate_up*100).toFixed(0)+'%. A score near 50% / accuracy near the base rate is expected. Not part of the strategy; not advice.</div></div>';}catch(e){box.innerHTML='<div class="note muted">Prediction unavailable.</div>';}}
async function loadOptionIdea(side,spot){const box=document.getElementById('optidea');if(!box)return;try{const x=await (await fetch('/api/options/idea/'+TICKER+'?side='+side+'&spot='+(spot||''))).json();if(!x||x.error){box.innerHTML='<div class="note muted" style="margin-bottom:10px">Options idea: '+((x&&x.error)||'unavailable')+'</div>';return;}box.innerHTML='<div class="card" style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:9px;margin-bottom:6px"><span class="badge '+(side==='bear'?'red':'green')+'">'+(side==='bear'?'PUT':'CALL')+'</span> <b>'+x.label+'</b></div><div class="summary">'+statCard('Premium',usd(x.premium))+statCard('Break-even',usd(x.breakeven))+statCard('Spot',usd(x.spot))+statCard('IV',x.iv+'%')+statCard('Max risk / contract',usd(x.max_risk_per_contract),'red')+'</div><div class="subline" style="margin-top:6px">Buy 1 contract of <b>'+x.label+'</b> ≈ '+usd(x.max_risk_per_contract)+' risk, break-even '+usd(x.breakeven)+'. Expresses the signal directionally; not advice, no order placed.</div></div>';}catch(e){box.innerHTML='';}}
function drawCharts(d){if(typeof Chart==='undefined'){document.getElementById('foot').textContent='(charts need internet to load chart library)';return;}const ax={grid:{color:'rgba(255,255,255,.06)'},border:{color:'rgba(255,255,255,.08)'},ticks:{color:'#737d8e',maxTicksLimit:8}};if(priceChart)priceChart.destroy();priceChart=new Chart(document.getElementById('priceChart'),{type:'line',data:{labels:d.chart.labels,datasets:[{label:'Price',data:d.chart.price,borderColor:'#6c8cff',borderWidth:1.8,pointRadius:0,tension:.12},{label:'Buy',data:d.chart.buys,borderColor:'#4cc38a',backgroundColor:'#4cc38a',showLine:false,pointRadius:6,pointStyle:'triangle'},{label:'Sell',data:d.chart.sells,borderColor:'#e5635f',backgroundColor:'#e5635f',showLine:false,pointRadius:6,pointStyle:'triangle',rotation:180}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aeb6c4',usePointStyle:true,boxWidth:7}}},scales:{x:ax,y:ax}}});if(equityChart)equityChart.destroy();equityChart=new Chart(document.getElementById('equityChart'),{type:'line',data:{labels:d.equity.labels,datasets:[{label:'Equity ($)',data:d.equity.values,borderColor:'#4cc38a',borderWidth:1.8,pointRadius:0,fill:true,backgroundColor:'rgba(76,195,138,.10)',tension:.12}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aeb6c4',usePointStyle:true,boxWidth:7}}},scales:{x:ax,y:ax}}});}
async function load(){document.getElementById('head').textContent='loading…';const d=await (await fetch(`/api/ticker/${TICKER}?eq=${EQ}`)).json();if(d.error){document.getElementById('head').innerHTML=`<span class="red">${d.error}</span>`;return;}document.getElementById('head').innerHTML=`<span class="chip ${cls(d.recommendation)}">${d.recommendation}</span> · ${d.sector} · ${usd(d.price)} · conv ${d.conviction.toFixed(0)}/100`;SIZEMODE=d.atr_adaptive?'atr':'fixed';const s=getSettings();const _x={ticker:d.ticker,recommendation:d.recommendation,price:d.price,atr:d.atr,atr_stop:d.atr_stop,atr_target:d.atr_target,eq1:{edge_win_rate:(d.stats?d.stats.win_rate:0.5)}};const e=econ(_x,s);document.getElementById('planbox').innerHTML=`<div class="card">${orderTicket(d,e,s,'bar')}</div>`;const st=d.stats;document.getElementById('stats').innerHTML=statCard('Win rate',(st.win_rate*100).toFixed(0)+'%','blue')+statCard('Total return',(st.return_pct>=0?'+':'')+st.return_pct.toFixed(0)+'%',st.return_pct>=0?'green':'red')+statCard('Trades',st.trades)+statCard('Avg win',money(st.avg_win),'green')+statCard('Avg loss',money(st.avg_loss),'red')+statCard('Max drawdown',st.max_dd_pct.toFixed(1)+'%','red')+statCard('Sharpe',st.sharpe.toFixed(2))+statCard('Profit factor',st.profit_factor.toFixed(2));document.getElementById('hist').innerHTML=(d.history||[]).map(h=>`<tr><td>${h.date}</td><td><span class="chip ${h.action}">${h.action}</span></td><td class="num">${usd(h.price)}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">no signals in range</td></tr>';document.getElementById('foot').textContent=`as of ${d.asof} · equation set ${d.equation_set} · ${st.trades} historical trades`;const _side=(d.recommendation||'').includes('SELL')?'bear':'bull';loadOptionIdea(_side,d.price);drawCharts(d);}
fetch('/api/account').then(r=>r.json()).then(a=>{if(a&&a.account)CAPITAL=a.account.equity;}).catch(()=>{}).finally(()=>{load();loadOptions();loadPredict();setInterval(load,__REFRESH__*1000);});
</script></body></html>"""
