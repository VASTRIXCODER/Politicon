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

import logging
import threading
import time
from collections import deque
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

from config import CONFIG, apply_day_trade_preset
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
            except Exception as exc:  # pragma: no cover
                log.exception("scan loop error")
                with self._lock:
                    self._status = "error"
                    self._error = str(exc)
            self._stop.wait(max(5, self.config.web_refresh_seconds))

    def snapshot(self) -> Dict:
        with self._lock:
            signals = list(self._signals)
            status, updated, error = self._status, self._updated, self._error
        return {
            "status": status, "updated": updated, "error": error,
            "ai_enabled": bool(self.scanner.briefer and self.scanner.briefer.enabled),
            "config": {"equation_set": self.config.equation_set, "lookback": self.config.lookback_length,
                       "interval": self.config.interval, "universe": len(self.config.tickers),
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


class EngineController:
    def __init__(self, config=CONFIG):
        self.config = config
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
        from flask import Flask, Response, jsonify, request
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("Flask is required for the web UI: pip install flask") from exc

    from ai_brief import AIBriefer
    from database import Database

    app = Flask(__name__)
    service = ScannerService(config, briefer=AIBriefer(config))
    service.start()
    controller = EngineController(config)
    db = Database(config.db_path)
    broker_holder: Dict = {"broker": None, "error": None, "tried": False}

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
        return jsonify({"ok": True, "atr_adaptive": config.atr_adaptive,
                        "aggressive_mode": config.aggressive_mode, "ai_gate": config.ai_gate,
                        "day_trade": daytrade["on"], "interval": config.interval,
                        "engine_interval_seconds": config.engine_interval_seconds})

    app.scanner_service = service
    app.engine_controller = controller
    return app


def run(config=CONFIG) -> None:
    app = create_app(config)
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
  @media (prefers-reduced-motion: reduce){ .section.vin{animation:none} .sidebar,.palette,.scrim{transition:none} }
"""

# --------------------------------------------------------------------------- #
# App-shell behaviour (view routing · command palette · TradingView · status)
# --------------------------------------------------------------------------- #
_SHELL_JS = r"""
(function(){
  var app=document.getElementById('app');
  if(!app)return;
  var VIEWS=['dashboard','markets','signals','engine','risk','trades'];
  var TITLES={dashboard:'Mission Control',markets:'Markets',signals:'Signals',engine:'Engine',risk:'Risk',trades:'Activity'};
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
<title>HP Analytics — Control Center</title><style>""" + _CSS + _SHELL_CSS + """</style></head><body class="osapp">
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
    <div class="navitem" data-view="signals" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3 7 5-15 3 8h5"/></svg>
      <span class="navlabel">Signals</span></div>
    <div class="navgroup-title">Trading</div>
    <div class="navitem" data-view="engine" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2L4 13h7l-1 9 10-12h-7z"/></svg>
      <span class="navlabel">Engine</span></div>
    <div class="navitem" data-view="risk" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.3 7.8-8 9-4.7-1.2-8-4.5-8-9V6z"/></svg>
      <span class="navlabel">Risk</span></div>
    <div class="navitem" data-view="trades" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h5"/></svg>
      <span class="navlabel">Activity</span></div>
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
        <div class="tvnote">Charts &amp; data © TradingView. Loads live in your browser and needs internet access.</div>
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

      <section id="sec-trades" class="section" data-views="dashboard trades">
        <div class="sectionhead"><div class="eyebrow">Trades</div><div class="title">Today's closed trades</div>
          <div class="desc">Every position the engine has opened and closed since midnight UTC, with realised P&amp;L.</div></div>
        <div class="tablewrap"><table><thead><tr><th>Ticker</th><th class="num">Entry</th><th class="num">Exit</th>
          <th class="num">PnL $</th><th class="num">PnL %</th><th>Reason</th></tr></thead><tbody id="todaybody"></tbody></table></div>
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
function renderSignals(){if(!LAST)return;const s=getSettings();const buys=LAST.signals.filter(x=>x.is_buy&&!x.error);let tc=0,tr=0,tw=0,te=0;buys.forEach(x=>{const e=econ(x,s);tc+=e.cost;tr+=e.risk;tw+=e.reward;te+=e.ev;});const dep=CAPITAL?(tc/CAPITAL*100):0;document.getElementById('summary').innerHTML=[['Account equity',money(CAPITAL),''],['Buy signals',buys.length,'blue'],['Capital to deploy',money(tc)+' ('+dep.toFixed(0)+'%)',''],['Total risk (stops)',money(tr),'red'],['Profit at targets',money(tw),'green'],['Expected value',money(te),te>=0?'green':'red']].map((c,i)=>`<div class="stat" style="animation-delay:${i*40}ms"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');const bySec={};buys.forEach(x=>bySec[x.sector]=(bySec[x.sector]||0)+1);const secs=Object.keys(bySec).sort();document.getElementById('sectors').innerHTML=secs.length?secs.map((k,i)=>`<div class="secchip" style="animation-delay:${i*40}ms">${k} <b>${bySec[k]}</b></div>`).join(''):'<span class="hint">No buy signals right now.</span>';document.getElementById('topbuys').innerHTML=buys.length?buys.map((x,i)=>card(x,s).replace('<div class="card','<div style="animation-delay:'+(i*50)+'ms" class="card')).join(''):'<div class="card"><div class="subline">No fresh buy signals right now. The scanner re-checks automatically.</div></div>';document.getElementById('allbody').innerHTML=visible(s).map(x=>row(x,s)).join('');requestAnimationFrame(()=>document.querySelectorAll('.bar>span').forEach(b=>b.style.width=b.dataset.w+'%'));document.getElementById('foot').textContent=`${LAST.signals.length} tickers monitored · refreshing every ${REFRESH/1000}s · click any ticker for full detail · build __BUILD__`;}

async function tickSignals(){try{LAST=await (await fetch('/api/signals')).json();const dot=LAST.status==='ok'?'ok':(LAST.status==='error'?'error':'scanning');document.getElementById('sigstatus').innerHTML=`<span class="dot ${dot}"></span>signals ${LAST.status==='scanning'?'scanning '+LAST.config.universe+'…':LAST.status}`;const c=LAST.config;document.getElementById('cfg').textContent=`eq${c.equation_set} · ${c.interval} · ${c.universe} stocks`+(LAST.ai_enabled?' · AI on':'');document.getElementById('updated').textContent=LAST.updated?'updated '+LAST.updated:'';SIZEMODE=LAST.config.atr_adaptive?'atr':'fixed';updateModeUI();renderSignals();}catch(e){document.getElementById('sigstatus').innerHTML='<span class="dot error"></span>fetch error';}}
async function tickAccount(){try{ACC=await (await fetch('/api/account')).json();renderAccount();}catch(e){}}
initInputs(); tickSignals(); tickAccount(); setInterval(tickSignals,REFRESH); setInterval(tickAccount,Math.min(REFRESH,15000));
</script></body></html>"""


# --------------------------------------------------------------------------- #
# Detail page
# --------------------------------------------------------------------------- #
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
function drawCharts(d){if(typeof Chart==='undefined'){document.getElementById('foot').textContent='(charts need internet to load chart library)';return;}const ax={grid:{color:'rgba(255,255,255,.06)'},border:{color:'rgba(255,255,255,.08)'},ticks:{color:'#737d8e',maxTicksLimit:8}};if(priceChart)priceChart.destroy();priceChart=new Chart(document.getElementById('priceChart'),{type:'line',data:{labels:d.chart.labels,datasets:[{label:'Price',data:d.chart.price,borderColor:'#6c8cff',borderWidth:1.8,pointRadius:0,tension:.12},{label:'Buy',data:d.chart.buys,borderColor:'#4cc38a',backgroundColor:'#4cc38a',showLine:false,pointRadius:6,pointStyle:'triangle'},{label:'Sell',data:d.chart.sells,borderColor:'#e5635f',backgroundColor:'#e5635f',showLine:false,pointRadius:6,pointStyle:'triangle',rotation:180}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aeb6c4',usePointStyle:true,boxWidth:7}}},scales:{x:ax,y:ax}}});if(equityChart)equityChart.destroy();equityChart=new Chart(document.getElementById('equityChart'),{type:'line',data:{labels:d.equity.labels,datasets:[{label:'Equity ($)',data:d.equity.values,borderColor:'#4cc38a',borderWidth:1.8,pointRadius:0,fill:true,backgroundColor:'rgba(76,195,138,.10)',tension:.12}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aeb6c4',usePointStyle:true,boxWidth:7}}},scales:{x:ax,y:ax}}});}
async function load(){document.getElementById('head').textContent='loading…';const d=await (await fetch(`/api/ticker/${TICKER}?eq=${EQ}`)).json();if(d.error){document.getElementById('head').innerHTML=`<span class="red">${d.error}</span>`;return;}document.getElementById('head').innerHTML=`<span class="chip ${cls(d.recommendation)}">${d.recommendation}</span> · ${d.sector} · ${usd(d.price)} · conv ${d.conviction.toFixed(0)}/100`;SIZEMODE=d.atr_adaptive?'atr':'fixed';const s=getSettings();const _x={ticker:d.ticker,recommendation:d.recommendation,price:d.price,atr:d.atr,atr_stop:d.atr_stop,atr_target:d.atr_target,eq1:{edge_win_rate:(d.stats?d.stats.win_rate:0.5)}};const e=econ(_x,s);document.getElementById('planbox').innerHTML=`<div class="card">${orderTicket(d,e,s,'bar')}</div>`;const st=d.stats;document.getElementById('stats').innerHTML=statCard('Win rate',(st.win_rate*100).toFixed(0)+'%','blue')+statCard('Total return',(st.return_pct>=0?'+':'')+st.return_pct.toFixed(0)+'%',st.return_pct>=0?'green':'red')+statCard('Trades',st.trades)+statCard('Avg win',money(st.avg_win),'green')+statCard('Avg loss',money(st.avg_loss),'red')+statCard('Max drawdown',st.max_dd_pct.toFixed(1)+'%','red')+statCard('Sharpe',st.sharpe.toFixed(2))+statCard('Profit factor',st.profit_factor.toFixed(2));document.getElementById('hist').innerHTML=(d.history||[]).map(h=>`<tr><td>${h.date}</td><td><span class="chip ${h.action}">${h.action}</span></td><td class="num">${usd(h.price)}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">no signals in range</td></tr>';document.getElementById('foot').textContent=`as of ${d.asof} · equation set ${d.equation_set} · ${st.trades} historical trades`;drawCharts(d);}
fetch('/api/account').then(r=>r.json()).then(a=>{if(a&&a.account)CAPITAL=a.account.equity;}).catch(()=>{}).finally(()=>{load();setInterval(load,__REFRESH__*1000);});
</script></body></html>"""
