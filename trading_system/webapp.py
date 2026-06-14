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

from config import CONFIG
from scanner import Scanner, TickerSignal

log = logging.getLogger("webapp")


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
                       "interval": self.config.interval, "universe": len(self.config.tickers)},
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

    defaults = {
        "__REFRESH__": str(config.web_refresh_seconds), "__CAP__": str(config.account_size),
        "__MAXPCT__": str(config.max_position_pct), "__STOPPCT__": str(config.stop_loss_pct),
        "__TGTPCT__": str(config.take_profit_pct),
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
  :root{--bg:#0a0e14;--panel:#121823;--panel2:#1a2230;--border:#243044;--fg:#e8eef7;
        --muted:#8a96a8;--green:#41d18b;--red:#ff5d6c;--amber:#f5b840;--blue:#5aa9ff;
        --grad:linear-gradient(135deg,#5aa9ff,#41d18b);}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:radial-gradient(1200px 600px at 70% -10%,#13243a 0%,var(--bg) 55%);
       color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;min-height:100vh}
  a{color:var(--blue);text-decoration:none} a:hover{text-decoration:underline}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(65,209,139,.5)}70%{box-shadow:0 0 0 7px rgba(65,209,139,0)}100%{box-shadow:0 0 0 0 rgba(65,209,139,0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  header{position:sticky;top:0;z-index:20;padding:13px 26px;display:flex;align-items:center;gap:14px;
         flex-wrap:wrap;background:rgba(10,14,20,.74);backdrop-filter:blur(14px);border-bottom:1px solid var(--border)}
  header h1{font-size:17px;margin:0;font-weight:700;letter-spacing:-.01em}
  header h1 .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .meta{color:var(--muted);font-size:12px}
  .pill{display:inline-block;padding:3px 9px;border:1px solid var(--border);border-radius:999px;font-size:11px;color:var(--muted);background:var(--panel)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
  .dot.ok{background:var(--green);animation:pulse 2s infinite} .dot.run{background:var(--green);animation:pulse 1.6s infinite}
  .dot.scanning,.dot.idle{background:var(--amber)} .dot.error,.dot.off{background:var(--red)} .dot.stopped{background:var(--muted)}
  .wrap{padding:20px 26px 70px;max-width:1340px;margin:0 auto}
  .disclaimer{background:rgba(245,184,64,.08);border:1px solid rgba(245,184,64,.4);color:#f5cf86;padding:9px 13px;border-radius:9px;font-size:12px;margin:0 0 16px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:24px 0 11px;font-weight:700}
  .panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px 18px}
  .ctrl{display:flex;gap:14px;flex-wrap:wrap;align-items:center;background:linear-gradient(135deg,rgba(90,169,255,.07),rgba(65,209,139,.05));
        border:1px solid var(--border);border-radius:14px;padding:16px 18px;animation:fadeUp .5s both}
  .bigbtn{padding:11px 20px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:var(--panel2);color:var(--fg);transition:all .15s}
  .bigbtn:hover{transform:translateY(-1px)} .bigbtn:disabled{opacity:.45;cursor:not-allowed;transform:none}
  .bigbtn.start{background:var(--grad);color:#06210f;border-color:transparent}
  .bigbtn.startlive{background:var(--red);color:#fff;border-color:transparent}
  .bigbtn.stop{background:rgba(255,93,108,.14);color:var(--red);border-color:var(--red)}
  .estatus{display:flex;align-items:center;gap:9px;font-size:13px;margin-left:auto;flex-wrap:wrap}
  .mode{padding:3px 10px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:.04em}
  .mode.PAPER,.mode.DRYRUN{background:rgba(65,209,139,.2);color:var(--green);border:1px solid var(--green)}
  .mode.LIVE{background:rgba(255,93,108,.2);color:var(--red);border:1px solid var(--red)}
  .actfeed{background:#070a0f;border:1px solid var(--border);border-radius:10px;padding:10px 12px;
           font:11.5px/1.55 ui-monospace,Menlo,Consolas,monospace;max-height:210px;overflow:auto;color:#9fb0c4}
  .actfeed div{white-space:pre-wrap}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}
  .stat{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:13px 15px;animation:fadeUp .5s both;transition:transform .2s,border-color .2s}
  .stat:hover{transform:translateY(-2px);border-color:#33425c}
  .stat .k{color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
  .stat .v{font-size:21px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
  .v.green{color:var(--green)} .v.red{color:var(--red)} .v.blue{color:var(--blue)}
  .account{background:linear-gradient(135deg,rgba(90,169,255,.07),rgba(65,209,139,.05));border:1px solid var(--border);border-radius:14px;padding:16px 18px;display:flex;gap:22px;flex-wrap:wrap;align-items:flex-end;animation:fadeUp .5s both}
  .account .field{display:flex;flex-direction:column;gap:6px}
  .account .field span{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
  .account .field input{background:#0a0e14;border:1px solid var(--border);color:var(--fg);border-radius:9px;padding:10px 12px;width:150px;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;transition:border-color .2s,box-shadow .2s}
  .account .field input:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(90,169,255,.18)}
  .account .hint{font-size:11.5px;color:var(--muted);max-width:280px;line-height:1.5}
  .secbar{display:flex;gap:9px;flex-wrap:wrap}
  .secchip{background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:5px 13px;font-size:12px;display:flex;gap:7px;align-items:center;animation:fadeUp .5s both}
  .secchip b{color:var(--green)}
  .controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
  .search{background:var(--panel);border:1px solid var(--border);color:var(--fg);border-radius:9px;padding:8px 12px;font-size:13px;width:200px;transition:border-color .2s}
  .search:focus{outline:none;border-color:var(--blue)}
  .fchip{background:var(--panel);border:1px solid var(--border);color:var(--muted);border-radius:999px;padding:6px 13px;font-size:12px;cursor:pointer;transition:all .15s}
  .fchip:hover{color:var(--fg);border-color:#33425c} .fchip.active{background:var(--grad);color:#06210f;border-color:transparent;font-weight:700}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:15px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px;animation:fadeUp .5s both;transition:transform .2s,box-shadow .2s,border-color .2s}
  .card:hover{transform:translateY(-3px);box-shadow:0 14px 40px -18px rgba(0,0,0,.7)}
  .card.strong{border-color:rgba(65,209,139,.6);box-shadow:0 0 0 1px rgba(65,209,139,.25)}
  .card .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .tk{font-size:21px;font-weight:800;letter-spacing:-.02em}
  .chip{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.03em}
  .chip.STRONGBUY,.chip.BUY{color:var(--green)} .chip.STRONGBUY{background:var(--green);color:#06210f}
  .chip.BUY{background:rgba(65,209,139,.2);border:1px solid var(--green)}
  .chip.HOLD{background:rgba(90,169,255,.16);color:var(--blue);border:1px solid var(--blue)}
  .chip.WAIT{background:rgba(138,150,168,.14);color:var(--muted);border:1px solid var(--border)}
  .chip.SELL,.chip.STRONGSELL{background:rgba(255,93,108,.18);color:var(--red);border:1px solid var(--red)}
  .chip.SKIP,.chip.ERROR{background:rgba(245,184,64,.16);color:var(--amber);border:1px solid var(--amber)}
  .agree{font-size:11px;color:var(--green);margin-left:6px}
  .subline{font-size:11.5px;color:var(--muted);margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .bar{height:7px;border-radius:4px;background:#10151f;margin:11px 0 5px;overflow:hidden}
  .bar>span{display:block;height:100%;background:var(--grad);width:0;transition:width .9s cubic-bezier(.2,.8,.2,1)}
  .badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
  .badge{font-size:10.5px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:#10151f}
  .badge.green{color:var(--green);border-color:rgba(65,209,139,.4)} .badge.red{color:var(--red);border-color:rgba(255,93,108,.4)} .badge.muted{color:var(--muted)}
  .ticket{margin-top:12px;border-top:1px solid var(--border);padding-top:12px}
  .tline{font-size:13px;margin-bottom:10px;font-variant-numeric:tabular-nums} .tline .tk2{font-weight:800}
  .ostep{display:flex;gap:11px;margin:9px 0}
  .num2{flex:none;width:22px;height:22px;border-radius:50%;background:var(--panel2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--blue)}
  .osh{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px}
  .orow{font-size:12.5px;margin:3px 0;font-variant-numeric:tabular-nums}
  .ot{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10px;font-weight:800;background:#10151f;border:1px solid var(--border);letter-spacing:.02em;white-space:nowrap;margin-right:3px}
  .ot.buy{color:var(--green);border-color:rgba(65,209,139,.45)} .ot.sell{color:var(--red);border-color:rgba(255,93,108,.45)}
  .note{font-size:12px;padding:9px 11px;border-radius:8px;background:#10151f;border:1px solid var(--border);margin-top:10px}
  .note.warn{color:var(--amber);border-color:rgba(245,184,64,.4)}
  .brief{margin-top:11px;padding:11px;background:#0a0e14;border:1px solid var(--border);border-radius:9px;font-size:12px;white-space:pre-wrap} .brief b{color:var(--blue)}
  .tablewrap{overflow-x:auto;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
  thead th{color:var(--muted);font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;user-select:none}
  thead th:hover{color:var(--fg)} th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
  tbody tr{transition:background .15s} tbody tr:hover{background:rgba(90,169,255,.05)}
  .green{color:var(--green)} .red{color:var(--red)} .muted{color:var(--muted)}
  .foot{color:var(--muted);font-size:11.5px;margin-top:24px;text-align:center}
  .btn{background:var(--panel2);border:1px solid var(--border);color:var(--fg);padding:7px 13px;border-radius:8px;cursor:pointer;font-size:12px;transition:all .15s}
  .btn:hover{border-color:#33425c} .btn.active{background:var(--grad);color:#06210f;border-color:transparent;font-weight:700}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px} @media(max-width:900px){.grid2{grid-template-columns:1fr}.cards{grid-template-columns:1fr}}
  canvas{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:9px}
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
function getSettings(){return {capital:+(localStorage.getItem('capital')||__CAP__),maxPct:+(localStorage.getItem('maxPct')||__MAXPCT__),stopPct:+(localStorage.getItem('stopPct')||__STOPPCT__),targetPct:+(localStorage.getItem('targetPct')||__TGTPCT__)};}
function economics(price,winRate,s){const entry=price,stop=entry*(1-s.stopPct/100),target=entry*(1+s.targetPct/100);const budget=s.capital*(s.maxPct/100);const shares=entry>0?Math.max(0,Math.floor(budget/entry)):0;const cost=shares*entry,risk=shares*(entry-stop),reward=shares*(target-entry);const rr=risk>0?reward/risk:0,w=(winRate==null)?0.5:winRate;return {entry,stop,target,shares,cost,risk,reward,rr,ev:w*reward-(1-w)*risk,pctCap:s.capital?cost/s.capital*100:0};}
function sparkline(arr){if(!arr||arr.length<2)return '';const w=104,h=28,p=3,min=Math.min(...arr),max=Math.max(...arr),rng=(max-min)||1;const pts=arr.map((v,i)=>{const x=p+i*(w-2*p)/(arr.length-1),y=p+(h-2*p)*(1-(v-min)/rng);return x.toFixed(1)+','+y.toFixed(1);}).join(' ');const col=arr[arr.length-1]>=arr[0]?'#41d18b':'#ff5d6c';return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" points="${pts}"/></svg>`;}
function rsiCls(r){return r>=70?'red':(r<=30?'green':'muted');}
function contextBadges(s){return `<span class="badge ${s.trend==='Uptrend'?'green':'red'}">${s.trend||'—'}</span><span class="badge ${rsiCls(s.rsi)}">RSI ${Math.round(s.rsi)}</span><span class="badge ${s.momentum>=0?'green':'red'}">Mom ${s.momentum>=0?'+':''}${(s.momentum||0).toFixed(1)}%</span><span class="badge muted">Vol ${s.vol_note||'—'}</span>`;}
function orderTicket(sig,e,s,interval){const t=sig.ticker,rec=sig.recommendation;if(rec==='STRONG BUY'||rec==='BUY'){if(e.shares<=0)return `<div class="note warn">Your capital × max% is too small to buy even 1 share of ${t} at ${usd(e.entry)}.</div>`;const buystop=e.entry*1.005,slLimit=e.stop*0.995;return `<div class="ticket"><div class="tline"><span class="tk2">📋 ${rec} ${t}</span> &nbsp;—&nbsp; ${e.shares} shares · ${money(e.cost)} (${e.pctCap.toFixed(0)}% of capital)</div><div class="ostep"><div class="num2">1</div><div><div class="osh">Entry — pick the style that fits you</div><div class="orow"><span class="ot buy">MARKET BUY</span> fills now at ~<b>${usd(e.entry)}</b></div><div class="orow"><span class="ot buy">LIMIT BUY</span> at <b>${usd(e.entry)}</b> — never pay above this</div><div class="orow"><span class="ot buy">BUY STOP</span> at <b>${usd(buystop)}</b> — only buys if it breaks out higher</div></div></div><div class="ostep"><div class="num2">2</div><div><div class="osh">Protect it — required</div><div class="orow"><span class="ot sell">SELL STOP</span> at <b>${usd(e.stop)}</b> (−${s.stopPct}%) · max loss ≈ <span class="red">${money(e.risk)}</span></div><div class="orow"><span class="ot sell">STOP-LIMIT</span> trigger ${usd(e.stop)} / limit ${usd(slLimit)}</div></div></div><div class="ostep"><div class="num2">3</div><div><div class="osh">Take profit</div><div class="orow"><span class="ot sell">SELL LIMIT</span> at <b>${usd(e.target)}</b> (+${s.targetPct}%) · ≈ <span class="green">${money(e.reward)}</span> · <b>${e.rr.toFixed(1)}:1</b></div></div></div><div class="ostep"><div class="num2">4</div><div><div class="osh">Easiest — one order</div><div class="orow"><span class="ot">BRACKET / OCO</span> attach the SELL STOP + SELL LIMIT to your buy.</div></div></div></div>`;}if(rec==='HOLD')return `<div class="ticket"><div class="ostep"><div class="num2">!</div><div><div class="osh">${t} already triggered earlier — not a fresh entry</div><div class="orow">If holding: keep a <span class="ot sell">SELL STOP</span> near <b>${usd(e.stop)}</b> and <span class="ot sell">SELL LIMIT</span> near <b>${usd(e.target)}</b>.</div></div></div></div>`;if(rec==='SELL'||rec==='STRONG SELL')return `<div class="ticket"><div class="ostep"><div class="num2">↓</div><div><div class="osh">${t} is flashing a SELL (exit)</div><div class="orow">If holding: <span class="ot sell">MARKET SELL</span> to close.</div></div></div></div>`;return `<div class="note">No action on ${t} — neutral (WAIT).</div>`;}
"""

# --------------------------------------------------------------------------- #
# Main page (the control center)
# --------------------------------------------------------------------------- #
_MAIN_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HP Analytics — Control Center</title><style>""" + _CSS + """</style></head><body>
<header>
  <h1>🦙 HP Analytics <span class="g">Control Center</span></h1>
  <span class="meta" id="sigstatus"><span class="dot scanning"></span>loading…</span>
  <span class="pill" id="cfg"></span>
  <span class="meta" style="margin-left:auto" id="updated"></span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational only — not financial advice. The automation is <b>paper by default</b>
    and runs only when you press Start. Live trading needs <code>TRADING_MODE=live</code> set deliberately and asks for confirmation.
    No strategy guarantees profit.</div>

  <h2>🤖 Auto-trading engine</h2>
  <div class="ctrl">
    <button class="bigbtn ghost" id="btnPreview" onclick="previewEngine()">👁 Preview (dry run)</button>
    <button class="bigbtn start" id="btnStart" onclick="startEngine()">▶ Start</button>
    <button class="bigbtn stop" id="btnStop" onclick="stopEngine()" disabled>■ Stop</button>
    <span class="estatus" id="estatus"></span>
  </div>
  <div id="previewbox"></div>
  <div style="margin-top:12px"><div class="osh" style="margin-bottom:6px">Engine activity</div>
    <div class="actfeed" id="actfeed"><div class="muted">Engine idle. Press Preview to see what it would do, or Start to run it.</div></div></div>

  <h2>🏦 Live account</h2>
  <div class="summary" id="acctcards"></div>
  <div id="posbox"></div>

  <h2>💰 Your settings — sizing for the signals below</h2>
  <div class="account">
    <div class="field"><span>Capital ($)</span><input id="capital" type="number" min="0" step="100"></div>
    <div class="field"><span>Max % / position</span><input id="maxPct" type="number" min="1" max="100" step="1"></div>
    <div class="field"><span>Stop-loss %</span><input id="stopPct" type="number" min="0.5" step="0.5"></div>
    <div class="field"><span>Take-profit %</span><input id="targetPct" type="number" min="0.5" step="0.5"></div>
    <div class="hint">Sizes the order tickets and previews. The live engine uses your real Alpaca equity.</div>
  </div>

  <h2>📊 Portfolio — if you take every buy below</h2>
  <div class="summary" id="summary"></div>
  <h2>🧭 Diversification (buys by sector)</h2>
  <div class="secbar" id="sectors"></div>
  <h2>🚀 Top Buys — your exact order tickets</h2>
  <div class="cards" id="topbuys"></div>

  <h2>📋 All tickers</h2>
  <div class="controls">
    <input class="search" id="search" placeholder="Search ticker or sector…">
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

  <h2>🕓 Today's closed trades</h2>
  <div class="tablewrap"><table><thead><tr><th>Ticker</th><th class="num">Entry</th><th class="num">Exit</th>
    <th class="num">PnL $</th><th class="num">PnL %</th><th>Reason</th></tr></thead><tbody id="todaybody"></tbody></table></div>
  <div class="foot" id="foot"></div>
</div>
<script>
const REFRESH = __REFRESH__ * 1000;
""" + _SHARED_JS + """
let LAST=null, ACC=null, FILTER='all', SEARCH='', SORTK='rank', SORTD=-1;
const briefHTML = t => !t ? '' : t.replace(/(Rationale:|Risk check:|Caution:)/g,'<b>$1</b>');
const recRank = {'STRONG BUY':5,'BUY':4,'HOLD':3,'WAIT':2,'SELL':1,'STRONG SELL':0};

function initInputs(){const s=getSettings();['capital','maxPct','stopPct','targetPct'].forEach(k=>{const el=document.getElementById(k);el.value=s[k];el.onchange=()=>{const v=parseFloat(el.value);if(!isNaN(v)&&v>0){localStorage.setItem(k,v);renderSignals();}};});document.getElementById('search').oninput=e=>{SEARCH=e.target.value.trim().toLowerCase();renderSignals();};}
function setFilter(el){FILTER=el.dataset.f;document.querySelectorAll('.fchip').forEach(c=>c.classList.toggle('active',c===el));renderSignals();}
function setSort(k){if(SORTK===k)SORTD*=-1;else{SORTK=k;SORTD=-1;}renderSignals();}

// ---- engine control ----
async function eng(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});return r.json();}
async function startEngine(){
  const mode=ACC&&ACC.engine?ACC.engine.mode:'PAPER';
  if(mode==='LIVE' && !confirm('⚠️ LIVE MODE — this places REAL orders with REAL money.\\n\\nStart live auto-trading?')) return;
  if(mode!=='LIVE' && !confirm('Start PAPER auto-trading? (simulated money — safe)')) return;
  const r=await eng('/api/engine/start',{}); if(!r.ok) alert('Could not start: '+(r.error||'unknown')); tickAccount();
}
async function stopEngine(){ await eng('/api/engine/stop',{}); tickAccount(); }
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
  const feed=e.recent&&e.recent.length?e.recent.slice(-40).map(l=>`<div>${l.replace(/</g,'&lt;')}</div>`).join(''):'<div class="muted">No engine activity yet.</div>';
  const af=document.getElementById('actfeed'); af.innerHTML=feed; af.scrollTop=af.scrollHeight;
}

function renderAccount(){
  if(!ACC) return; const a=ACC.account, rep=ACC.report||{};
  if(a){
    const todayPnl=(ACC.today||[]).reduce((s,t)=>s+(t.pnl_dollars||0),0);
    document.getElementById('acctcards').innerHTML=[
      ['Portfolio value',money(a.portfolio_value),''],['Buying power',money(a.buying_power),'blue'],
      ['Equity',money(a.equity),''],['Open positions',(ACC.positions||[]).length,''],
      ['Today P&L',money(todayPnl),todayPnl>=0?'green':'red'],
      ['All-time win',rep.trades?Math.round(rep.win_rate*100)+'% ('+rep.trades+')':'—','blue'],
    ].map((c,i)=>`<div class="stat" style="animation-delay:${i*40}ms"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');
  } else {
    document.getElementById('acctcards').innerHTML=`<div class="stat" style="grid-column:1/-1"><div class="k">Account</div><div class="v" style="font-size:14px;color:var(--amber)">Not connected — add Alpaca paper keys to .env, then this shows your live account. (${ACC.broker_error||''})</div></div>`;
  }
  const pos=ACC.positions||[];
  document.getElementById('posbox').innerHTML = pos.length ? `<div class="tablewrap" style="margin-top:11px"><table><thead><tr><th>Symbol</th><th class="num">Qty</th><th class="num">Avg entry</th><th class="num">Current</th><th class="num">Mkt value</th><th class="num">Unreal. PnL</th><th class="num">PnL %</th></tr></thead><tbody>`+
    pos.map(p=>{const c=p.unrealized_pl>=0?'green':'red';return `<tr><td><b>${p.symbol}</b></td><td class="num">${p.qty}</td><td class="num">${usd(p.avg_entry_price)}</td><td class="num">${usd(p.current_price)}</td><td class="num">${money(p.market_value)}</td><td class="num ${c}">${money(p.unrealized_pl)}</td><td class="num ${c}">${(p.unrealized_plpc*100).toFixed(2)}%</td></tr>`;}).join('')+`</tbody></table></div>` : '';
  document.getElementById('todaybody').innerHTML=(ACC.today||[]).length?(ACC.today.map(t=>{const c=(t.pnl_dollars||0)>=0?'green':'red';return `<tr><td><b>${t.ticker}</b></td><td class="num">${usd(t.entry_price)}</td><td class="num">${usd(t.exit_price)}</td><td class="num ${c}">${money(t.pnl_dollars)}</td><td class="num ${c}">${(t.pnl_pct||0).toFixed(2)}%</td><td>${t.exit_reason||''}</td></tr>`;}).join('')):'<tr><td colspan="6" class="muted">no closed trades today</td></tr>';
  renderEngine();
}

// ---- signals ----
function metric(x,k,s){const e=economics(x.price,edgeWin(x),s);switch(k){case 'rank':return recRank[x.recommendation]??2;case 'conviction':return x.conviction;case 'price':return x.price;case 'change':return x.change_pct||0;case 'rsi':return x.rsi||0;case 'shares':return e.shares;case 'ev':return e.ev;case 'win':return edgeWin(x);}return 0;}
function card(x,s){const e=economics(x.price,edgeWin(x),s);const strong=x.recommendation==='STRONG BUY'?' strong':'';const agree=x.agree?'<span class="agree">✓ both agree</span>':'';const brief=x.ai_brief?`<div class="brief">${briefHTML(x.ai_brief)}</div>`:'';return `<div class="card${strong}"><div class="top"><div><a class="tk" href="/ticker/${x.ticker}">${x.ticker}</a> <span class="meta">${x.sector}</span></div><span><span class="chip ${cls(x.recommendation)}">${x.recommendation}</span>${agree}</span></div><div class="subline">${usd(x.price)} · conv ${x.conviction.toFixed(0)}/100 · edge ${pct(edgeWin(x))} win ${sparkline(x.spark)}</div><div class="bar"><span data-w="${x.conviction}"></span></div><div class="badges">${contextBadges(x)}</div>${orderTicket(x,e,s,LAST.config.interval)}${brief}</div>`;}
function row(x,s){if(x.error)return `<tr><td><a href="/ticker/${x.ticker}">${x.ticker}</a></td><td colspan="9" class="red">${x.error}</td></tr>`;const e=economics(x.price,edgeWin(x),s);return `<tr><td><a href="/ticker/${x.ticker}"><b>${x.ticker}</b></a> <span class="chip ${cls(x.recommendation)}">${x.recommendation}</span><div class="meta">${x.sector}</div></td><td><span class="badge ${x.trend==='Uptrend'?'green':'red'}">${x.trend||'—'}</span></td><td class="num">${x.conviction.toFixed(0)}</td><td class="num">${usd(x.price)}</td><td class="num ${(x.change_pct||0)>=0?'green':'red'}">${(x.change_pct||0)>=0?'+':''}${(x.change_pct||0).toFixed(1)}%</td><td class="num ${rsiCls(x.rsi)}">${Math.round(x.rsi)}</td><td class="num">${e.shares}</td><td class="num ${e.ev>=0?'green':'red'}">${money(e.ev)}</td><td class="num">${pct(edgeWin(x))} <span class="muted">(${x.eq1?x.eq1.edge_trades:0}t)</span></td><td>${sparkline(x.spark)}</td></tr>`;}
function visible(s){let arr=LAST.signals.slice();if(SEARCH)arr=arr.filter(x=>x.ticker.toLowerCase().includes(SEARCH)||(x.sector||'').toLowerCase().includes(SEARCH));if(FILTER==='buys')arr=arr.filter(x=>x.is_buy);else if(FILTER==='strong')arr=arr.filter(x=>x.recommendation==='STRONG BUY');else if(FILTER==='hold')arr=arr.filter(x=>x.recommendation==='HOLD');else if(FILTER==='sell')arr=arr.filter(x=>(x.recommendation||'').includes('SELL'));arr.sort((a,b)=>{const va=metric(a,SORTK,s),vb=metric(b,SORTK,s);return va<vb?SORTD:va>vb?-SORTD:0;});return arr;}
function renderSignals(){if(!LAST)return;const s=getSettings();const buys=LAST.signals.filter(x=>x.is_buy&&!x.error);let tc=0,tr=0,tw=0,te=0;buys.forEach(x=>{const e=economics(x.price,edgeWin(x),s);tc+=e.cost;tr+=e.risk;tw+=e.reward;te+=e.ev;});const dep=s.capital?(tc/s.capital*100):0;document.getElementById('summary').innerHTML=[['Your capital',money(s.capital),''],['Buy signals',buys.length,'blue'],['Capital to deploy',money(tc)+' ('+dep.toFixed(0)+'%)',''],['Total risk (stops)',money(tr),'red'],['Profit at targets',money(tw),'green'],['Expected value',money(te),te>=0?'green':'red']].map((c,i)=>`<div class="stat" style="animation-delay:${i*40}ms"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');const bySec={};buys.forEach(x=>bySec[x.sector]=(bySec[x.sector]||0)+1);const secs=Object.keys(bySec).sort();document.getElementById('sectors').innerHTML=secs.length?secs.map((k,i)=>`<div class="secchip" style="animation-delay:${i*40}ms">${k} <b>${bySec[k]}</b></div>`).join(''):'<span class="hint">No buy signals right now.</span>';document.getElementById('topbuys').innerHTML=buys.length?buys.map((x,i)=>card(x,s).replace('<div class="card','<div style="animation-delay:'+(i*50)+'ms" class="card')).join(''):'<div class="card"><div class="subline">No fresh buy signals right now. The scanner re-checks automatically.</div></div>';document.getElementById('allbody').innerHTML=visible(s).map(x=>row(x,s)).join('');requestAnimationFrame(()=>document.querySelectorAll('.bar>span').forEach(b=>b.style.width=b.dataset.w+'%'));document.getElementById('foot').textContent=`${LAST.signals.length} tickers monitored · refreshing every ${REFRESH/1000}s · click any ticker for charts & detail`;}

async function tickSignals(){try{LAST=await (await fetch('/api/signals')).json();const dot=LAST.status==='ok'?'ok':(LAST.status==='error'?'error':'scanning');document.getElementById('sigstatus').innerHTML=`<span class="dot ${dot}"></span>signals ${LAST.status==='scanning'?'scanning '+LAST.config.universe+'…':LAST.status}`;const c=LAST.config;document.getElementById('cfg').textContent=`eq${c.equation_set} · ${c.interval} · ${c.universe} stocks`+(LAST.ai_enabled?' · AI on':'');document.getElementById('updated').textContent=LAST.updated?'updated '+LAST.updated:'';renderSignals();}catch(e){document.getElementById('sigstatus').innerHTML='<span class="dot error"></span>fetch error';}}
async function tickAccount(){try{ACC=await (await fetch('/api/account')).json();renderAccount();}catch(e){}}
initInputs(); tickSignals(); tickAccount(); setInterval(tickSignals,REFRESH); setInterval(tickAccount,Math.min(REFRESH,15000));
</script></body></html>"""


# --------------------------------------------------------------------------- #
# Detail page
# --------------------------------------------------------------------------- #
_DETAIL_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TICKER__ — detail</title><style>""" + _CSS + """</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script></head><body>
<header><h1>🦙 <span class="g">__TICKER__</span></h1><a href="/" class="meta">← back to control center</a>
  <span class="meta" id="head"></span>
  <span style="margin-left:auto"><button class="btn active" id="b1" onclick="setEq(1)">Equation 1</button>
  <button class="btn" id="b2" onclick="setEq(2)">Equation 2</button></span></header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational only — not financial advice. Backtested edge is historical, not a guarantee.</div>
  <h2>📋 Your order ticket</h2><div id="planbox"></div>
  <h2>📈 Price &amp; signals · Equity curve (backtest)</h2>
  <div class="grid2"><canvas id="priceChart" height="150"></canvas><canvas id="equityChart" height="150"></canvas></div>
  <h2>🧮 Edge — this strategy on __TICKER__</h2><div class="summary" id="stats"></div>
  <h2>🕓 Recent signal history</h2>
  <div class="tablewrap"><table><thead><tr><th>Date</th><th>Signal</th><th class="num">Price</th></tr></thead><tbody id="hist"></tbody></table></div>
  <div class="foot" id="foot"></div>
</div>
<script>
const TICKER="__TICKER__"; let EQ=1, priceChart, equityChart;
""" + _SHARED_JS + """
function setEq(n){EQ=n;document.getElementById('b1').classList.toggle('active',n===1);document.getElementById('b2').classList.toggle('active',n===2);load();}
function statCard(k,v,c){return `<div class="stat"><div class="k">${k}</div><div class="v ${c||''}">${v}</div></div>`;}
function drawCharts(d){if(typeof Chart==='undefined'){document.getElementById('foot').textContent='(charts need internet to load chart library)';return;}const ax={grid:{color:'#1a2230'},ticks:{color:'#8a96a8',maxTicksLimit:8}};if(priceChart)priceChart.destroy();priceChart=new Chart(document.getElementById('priceChart'),{type:'line',data:{labels:d.chart.labels,datasets:[{label:'Price',data:d.chart.price,borderColor:'#5aa9ff',borderWidth:1.6,pointRadius:0,tension:.12},{label:'Buy',data:d.chart.buys,borderColor:'#41d18b',backgroundColor:'#41d18b',showLine:false,pointRadius:6,pointStyle:'triangle'},{label:'Sell',data:d.chart.sells,borderColor:'#ff5d6c',backgroundColor:'#ff5d6c',showLine:false,pointRadius:6,pointStyle:'triangle',rotation:180}]},options:{responsive:true,plugins:{legend:{labels:{color:'#e8eef7'}}},scales:{x:ax,y:ax}}});if(equityChart)equityChart.destroy();equityChart=new Chart(document.getElementById('equityChart'),{type:'line',data:{labels:d.equity.labels,datasets:[{label:'Equity ($)',data:d.equity.values,borderColor:'#41d18b',borderWidth:1.6,pointRadius:0,fill:true,backgroundColor:'rgba(65,209,139,.09)',tension:.12}]},options:{responsive:true,plugins:{legend:{labels:{color:'#e8eef7'}}},scales:{x:ax,y:ax}}});}
async function load(){document.getElementById('head').textContent='loading…';const d=await (await fetch(`/api/ticker/${TICKER}?eq=${EQ}`)).json();if(d.error){document.getElementById('head').innerHTML=`<span class="red">${d.error}</span>`;return;}document.getElementById('head').innerHTML=`<span class="chip ${cls(d.recommendation)}">${d.recommendation}</span> · ${d.sector} · ${usd(d.price)} · conv ${d.conviction.toFixed(0)}/100`;const s=getSettings(),e=economics(d.price,(d.stats?d.stats.win_rate:0.5),s);document.getElementById('planbox').innerHTML=`<div class="card">${orderTicket(d,e,s,'bar')}</div>`;const st=d.stats;document.getElementById('stats').innerHTML=statCard('Win rate',(st.win_rate*100).toFixed(0)+'%','blue')+statCard('Total return',(st.return_pct>=0?'+':'')+st.return_pct.toFixed(0)+'%',st.return_pct>=0?'green':'red')+statCard('Trades',st.trades)+statCard('Avg win',money(st.avg_win),'green')+statCard('Avg loss',money(st.avg_loss),'red')+statCard('Max drawdown',st.max_dd_pct.toFixed(1)+'%','red')+statCard('Sharpe',st.sharpe.toFixed(2))+statCard('Profit factor',st.profit_factor.toFixed(2));document.getElementById('hist').innerHTML=(d.history||[]).map(h=>`<tr><td>${h.date}</td><td><span class="chip ${h.action}">${h.action}</span></td><td class="num">${usd(h.price)}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">no signals in range</td></tr>';document.getElementById('foot').textContent=`as of ${d.asof} · equation set ${d.equation_set} · ${st.trades} historical trades`;drawCharts(d);}
load(); setInterval(load,__REFRESH__*1000);
</script></body></html>"""
