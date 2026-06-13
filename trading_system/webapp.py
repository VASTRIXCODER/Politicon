"""
webapp.py
=========

Beautiful, animated **advisory** trading dashboard for signals-only mode.

It places **no orders** — it tells you exactly what to do (down to the order type)
and you execute it in your own broker. Highlights:

* a prominent **account panel** — set your capital, max % per position, stop %,
  take-profit %; everything recomputes instantly and is remembered.
* **order tickets** with specific order types — MARKET / LIMIT BUY / **BUY STOP** /
  **SELL STOP** / STOP-LIMIT / SELL LIMIT / BRACKET-OCO — share counts, dollar
  amounts, risk & reward, and timing, step by step.
* **context indicators** (trend, RSI, momentum, volume) + sparklines for depth.
* a sortable / searchable / filterable table across a large diverse universe.
* per-ticker **detail page** with interactive price & equity charts.

No API keys required (free yfinance data). The Pine Script remains the signal
core; the edge shown is the Pine Script's own win/trade accounting.

Run::  python main.py web   →   http://127.0.0.1:5000  (use WEB_PORT=5051 on macOS)
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict
from typing import Dict, List, Optional

from config import CONFIG
from scanner import Scanner, TickerSignal

log = logging.getLogger("webapp")


# --------------------------------------------------------------------------- #
# Background scanning service
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
            "config": {
                "equation_set": self.config.equation_set,
                "lookback": self.config.lookback_length,
                "interval": self.config.interval,
                "universe": len(self.config.tickers),
            },
            "signals": [_signal_json(s) for s in signals],
        }


def _signal_json(s: TickerSignal) -> Dict:
    d = s.as_dict()
    d["eq1"] = asdict(s.eq1) if s.eq1 else None
    d["eq2"] = asdict(s.eq2) if s.eq2 else None
    d["is_buy"] = s.is_buy
    return d


# --------------------------------------------------------------------------- #
# Flask app
# --------------------------------------------------------------------------- #
def create_app(config=CONFIG):
    try:
        from flask import Flask, Response, jsonify, request
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("Flask is required for the web UI: pip install flask") from exc

    from ai_brief import AIBriefer

    app = Flask(__name__)
    service = ScannerService(config, briefer=AIBriefer(config))
    service.start()

    defaults = {
        "__REFRESH__": str(config.web_refresh_seconds),
        "__CAP__": str(config.account_size),
        "__MAXPCT__": str(config.max_position_pct),
        "__STOPPCT__": str(config.stop_loss_pct),
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

    app.scanner_service = service
    return app


def run(config=CONFIG) -> None:
    app = create_app(config)
    log.info("starting web UI at http://%s:%d (Ctrl-C to stop)",
             config.web_host, config.web_port)
    app.run(host=config.web_host, port=config.web_port, threaded=True)


# --------------------------------------------------------------------------- #
# CSS — animated design system
# --------------------------------------------------------------------------- #
_CSS = """
  :root{--bg:#0a0e14;--panel:#121823;--panel2:#1a2230;--border:#243044;--fg:#e8eef7;
        --muted:#8a96a8;--green:#41d18b;--red:#ff5d6c;--amber:#f5b840;--blue:#5aa9ff;
        --grad:linear-gradient(135deg,#5aa9ff,#41d18b);}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:radial-gradient(1200px 600px at 70% -10%,#13243a 0%,var(--bg) 55%);
       color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       min-height:100vh}
  a{color:var(--blue);text-decoration:none} a:hover{text-decoration:underline}
  ::selection{background:rgba(90,169,255,.3)}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(65,209,139,.5)}70%{box-shadow:0 0 0 7px rgba(65,209,139,0)}100%{box-shadow:0 0 0 0 rgba(65,209,139,0)}}
  @keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
  @keyframes spin{to{transform:rotate(360deg)}}
  header{position:sticky;top:0;z-index:20;padding:13px 26px;display:flex;align-items:center;gap:14px;
         flex-wrap:wrap;background:rgba(10,14,20,.72);backdrop-filter:blur(14px);
         border-bottom:1px solid var(--border)}
  header h1{font-size:17px;margin:0;font-weight:700;letter-spacing:-.01em}
  header h1 .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .meta{color:var(--muted);font-size:12px}
  .pill{display:inline-block;padding:3px 9px;border:1px solid var(--border);border-radius:999px;
        font-size:11px;color:var(--muted);background:var(--panel)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
  .dot.ok{background:var(--green);animation:pulse 2s infinite}
  .dot.scanning{background:var(--amber);animation:spin 1s linear infinite;border:2px solid var(--amber);border-top-color:transparent;background:transparent}
  .dot.error{background:var(--red)}
  .wrap{padding:20px 26px 60px;max-width:1340px;margin:0 auto}
  .disclaimer{background:rgba(245,184,64,.08);border:1px solid rgba(245,184,64,.4);color:#f5cf86;
              padding:9px 13px;border-radius:9px;font-size:12px;margin:0 0 16px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);
     margin:26px 0 11px;font-weight:700}
  .panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px 18px}
  /* account / settings */
  .account{background:linear-gradient(135deg,rgba(90,169,255,.08),rgba(65,209,139,.06));
           border:1px solid var(--border);border-radius:14px;padding:16px 18px;
           display:flex;gap:22px;flex-wrap:wrap;align-items:flex-end;animation:fadeUp .5s both}
  .account .field{display:flex;flex-direction:column;gap:6px}
  .account .field span{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
  .account .field input{background:#0a0e14;border:1px solid var(--border);color:var(--fg);
        border-radius:9px;padding:10px 12px;width:150px;font-size:17px;font-weight:600;
        font-variant-numeric:tabular-nums;transition:border-color .2s,box-shadow .2s}
  .account .field input:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(90,169,255,.18)}
  .account .hint{font-size:11.5px;color:var(--muted);max-width:280px;line-height:1.5}
  /* summary cards */
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}
  .stat{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:13px 15px;
        animation:fadeUp .5s both;transition:transform .2s,border-color .2s}
  .stat:hover{transform:translateY(-2px);border-color:#33425c}
  .stat .k{color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
  .stat .v{font-size:21px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
  .v.green{color:var(--green)} .v.red{color:var(--red)} .v.blue{color:var(--blue)}
  /* sector bars */
  .secbar{display:flex;gap:9px;flex-wrap:wrap}
  .secchip{background:var(--panel);border:1px solid var(--border);border-radius:999px;
           padding:5px 13px;font-size:12px;display:flex;gap:7px;align-items:center;animation:fadeUp .5s both}
  .secchip b{color:var(--green);font-variant-numeric:tabular-nums}
  /* controls */
  .controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
  .search{background:var(--panel);border:1px solid var(--border);color:var(--fg);border-radius:9px;
          padding:8px 12px;font-size:13px;width:200px;transition:border-color .2s}
  .search:focus{outline:none;border-color:var(--blue)}
  .fchip{background:var(--panel);border:1px solid var(--border);color:var(--muted);border-radius:999px;
         padding:6px 13px;font-size:12px;cursor:pointer;transition:all .15s}
  .fchip:hover{color:var(--fg);border-color:#33425c}
  .fchip.active{background:var(--grad);color:#06210f;border-color:transparent;font-weight:700}
  /* cards */
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:15px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px;
        animation:fadeUp .5s both;transition:transform .2s,box-shadow .2s,border-color .2s}
  .card:hover{transform:translateY(-3px);box-shadow:0 14px 40px -18px rgba(0,0,0,.7)}
  .card.strong{border-color:rgba(65,209,139,.6);box-shadow:0 0 0 1px rgba(65,209,139,.25)}
  .card .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .tk{font-size:21px;font-weight:800;letter-spacing:-.02em}
  .chip{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.03em}
  .chip.STRONGBUY{background:var(--green);color:#06210f}
  .chip.BUY{background:rgba(65,209,139,.2);color:var(--green);border:1px solid var(--green)}
  .chip.HOLD{background:rgba(90,169,255,.16);color:var(--blue);border:1px solid var(--blue)}
  .chip.WAIT{background:rgba(138,150,168,.14);color:var(--muted);border:1px solid var(--border)}
  .chip.SELL,.chip.STRONGSELL{background:rgba(255,93,108,.18);color:var(--red);border:1px solid var(--red)}
  .agree{font-size:11px;color:var(--green);margin-left:6px}
  .subline{font-size:11.5px;color:var(--muted);margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .spark{vertical-align:middle}
  .bar{height:7px;border-radius:4px;background:#10151f;margin:11px 0 5px;overflow:hidden}
  .bar>span{display:block;height:100%;background:var(--grad);width:0;transition:width .9s cubic-bezier(.2,.8,.2,1)}
  .badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
  .badge{font-size:10.5px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:#10151f}
  .badge.green{color:var(--green);border-color:rgba(65,209,139,.4)}
  .badge.red{color:var(--red);border-color:rgba(255,93,108,.4)}
  .badge.muted{color:var(--muted)}
  /* order ticket */
  .ticket{margin-top:12px;border-top:1px solid var(--border);padding-top:12px}
  .tline{font-size:13px;margin-bottom:10px;font-variant-numeric:tabular-nums}
  .tline .tk2{font-weight:800}
  .ostep{display:flex;gap:11px;margin:9px 0}
  .num2{flex:none;width:22px;height:22px;border-radius:50%;background:var(--panel2);border:1px solid var(--border);
        display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--blue)}
  .osh{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px}
  .orow{font-size:12.5px;margin:3px 0;font-variant-numeric:tabular-nums}
  .ot{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10px;font-weight:800;
      background:#10151f;border:1px solid var(--border);letter-spacing:.02em;white-space:nowrap;margin-right:3px}
  .ot.buy{color:var(--green);border-color:rgba(65,209,139,.45)}
  .ot.sell{color:var(--red);border-color:rgba(255,93,108,.45)}
  .note{font-size:12px;padding:9px 11px;border-radius:8px;background:#10151f;border:1px solid var(--border);margin-top:10px}
  .note.warn{color:var(--amber);border-color:rgba(245,184,64,.4)}
  .brief{margin-top:11px;padding:11px;background:#0a0e14;border:1px solid var(--border);
         border-radius:9px;font-size:12px;white-space:pre-wrap}
  .brief b{color:var(--blue)}
  /* table */
  .tablewrap{overflow-x:auto;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
  thead th{color:var(--muted);font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;
           cursor:pointer;user-select:none;position:sticky;top:55px;background:var(--panel);transition:color .15s}
  thead th:hover{color:var(--fg)}
  th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
  tbody tr{transition:background .15s} tbody tr:hover{background:rgba(90,169,255,.05)}
  .green{color:var(--green)} .red{color:var(--red)} .muted{color:var(--muted)}
  .foot{color:var(--muted);font-size:11.5px;margin-top:24px;text-align:center}
  .btn{background:var(--panel2);border:1px solid var(--border);color:var(--fg);
       padding:7px 13px;border-radius:8px;cursor:pointer;font-size:12px;transition:all .15s}
  .btn:hover{border-color:#33425c} .btn.active{background:var(--grad);color:#06210f;border-color:transparent;font-weight:700}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media(max-width:900px){.grid2{grid-template-columns:1fr}.cards{grid-template-columns:1fr}}
  canvas{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:9px}
  .skel{height:120px;border-radius:14px;background:linear-gradient(90deg,#121823,#1a2230,#121823);
        background-size:800px 100%;animation:shimmer 1.4s infinite linear}
"""

# --------------------------------------------------------------------------- #
# Shared JS — settings, economics, sparkline, context, order tickets
# --------------------------------------------------------------------------- #
_SHARED_JS = """
const money = x => x==null ? '—' : (x<0?'-$':'$') + Math.abs(Number(x)).toLocaleString(undefined,{maximumFractionDigits:0});
const usd = x => x==null ? '—' : '$' + Number(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = x => (x*100).toFixed(0)+'%';
const cls = r => (r||'').replace(/\\s/g,'');
const edgeWin = x => (x.eq1 && x.eq1.edge_win_rate!=null) ? x.eq1.edge_win_rate : 0.5;

function getSettings(){
  return {
    capital:  +(localStorage.getItem('capital')  || __CAP__),
    maxPct:   +(localStorage.getItem('maxPct')    || __MAXPCT__),
    stopPct:  +(localStorage.getItem('stopPct')   || __STOPPCT__),
    targetPct:+(localStorage.getItem('targetPct') || __TGTPCT__),
  };
}

function economics(price, winRate, s){
  const entry=price, stop=entry*(1-s.stopPct/100), target=entry*(1+s.targetPct/100);
  const budget=s.capital*(s.maxPct/100);
  const shares=entry>0?Math.max(0,Math.floor(budget/entry)):0;
  const cost=shares*entry, risk=shares*(entry-stop), reward=shares*(target-entry);
  const rr=risk>0?reward/risk:0, w=(winRate==null)?0.5:winRate;
  const ev=w*reward-(1-w)*risk;
  return {entry,stop,target,shares,cost,risk,reward,rr,ev,pctCap:s.capital?cost/s.capital*100:0};
}

function sparkline(arr){
  if(!arr || arr.length<2) return '';
  const w=104,h=28,p=3,min=Math.min(...arr),max=Math.max(...arr),rng=(max-min)||1;
  const pts=arr.map((v,i)=>{
    const x=p+i*(w-2*p)/(arr.length-1), y=p+(h-2*p)*(1-(v-min)/rng);
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  const col=arr[arr.length-1]>=arr[0]?'#41d18b':'#ff5d6c';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" points="${pts}"/></svg>`;
}

function rsiCls(r){ return r>=70?'red':(r<=30?'green':'muted'); }
function contextBadges(s){
  return `<span class="badge ${s.trend==='Uptrend'?'green':'red'}">${s.trend||'—'}</span>`+
    `<span class="badge ${rsiCls(s.rsi)}">RSI ${Math.round(s.rsi)}</span>`+
    `<span class="badge ${s.momentum>=0?'green':'red'}">Mom ${s.momentum>=0?'+':''}${(s.momentum||0).toFixed(1)}%</span>`+
    `<span class="badge muted">Vol ${s.vol_note||'—'}</span>`;
}

function orderTicket(sig, e, s, interval){
  const t=sig.ticker, rec=sig.recommendation;
  if(rec==='STRONG BUY'||rec==='BUY'){
    if(e.shares<=0) return `<div class="note warn">Your capital × max% is too small to buy even 1 share of ${t} at ${usd(e.entry)}. Raise your capital or max % per position above.</div>`;
    const buystop=e.entry*1.005, slLimit=e.stop*0.995;
    return `<div class="ticket">
      <div class="tline"><span class="tk2">📋 ${rec} ${t}</span> &nbsp;—&nbsp; ${e.shares} shares · ${money(e.cost)} (${e.pctCap.toFixed(0)}% of capital)</div>
      <div class="ostep"><div class="num2">1</div><div>
        <div class="osh">Entry — pick the style that fits you</div>
        <div class="orow"><span class="ot buy">MARKET BUY</span> fills now at ~<b>${usd(e.entry)}</b></div>
        <div class="orow"><span class="ot buy">LIMIT BUY</span> at <b>${usd(e.entry)}</b> — you'll never pay above this</div>
        <div class="orow"><span class="ot buy">BUY STOP</span> at <b>${usd(buystop)}</b> — only buys if it breaks out higher (momentum confirmation)</div>
      </div></div>
      <div class="ostep"><div class="num2">2</div><div>
        <div class="osh">Protect it — required</div>
        <div class="orow"><span class="ot sell">SELL STOP</span> at <b>${usd(e.stop)}</b> (−${s.stopPct}%) — auto-exits on a drop · max loss ≈ <span class="red">${money(e.risk)}</span></div>
        <div class="orow"><span class="ot sell">STOP-LIMIT</span> trigger ${usd(e.stop)} / limit ${usd(slLimit)} — same idea, with price control</div>
      </div></div>
      <div class="ostep"><div class="num2">3</div><div>
        <div class="osh">Take profit</div>
        <div class="orow"><span class="ot sell">SELL LIMIT</span> at <b>${usd(e.target)}</b> (+${s.targetPct}%) — auto-exits in profit ≈ <span class="green">${money(e.reward)}</span> · <b>${e.rr.toFixed(1)}:1</b> reward-to-risk</div>
      </div></div>
      <div class="ostep"><div class="num2">4</div><div>
        <div class="osh">Easiest — one order</div>
        <div class="orow"><span class="ot">BRACKET / OCO</span> attach the SELL STOP and SELL LIMIT to your buy; whichever triggers first cancels the other.</div>
      </div></div>
      <div class="ostep"><div class="num2">5</div><div>
        <div class="osh">When</div>
        <div class="orow muted">Place during US market hours (9:30am–4:00pm ET). Signal is from the latest closed ${interval} bar. Hold until a level hits or this flips to SELL.</div>
      </div></div>
    </div>`;
  }
  if(rec==='HOLD'){
    return `<div class="ticket"><div class="ostep"><div class="num2">!</div><div>
      <div class="osh">${t} already triggered a BUY earlier — not a fresh entry</div>
      <div class="orow">If you hold it: keep a <span class="ot sell">SELL STOP</span> near <b>${usd(e.stop)}</b> and a <span class="ot sell">SELL LIMIT</span> near <b>${usd(e.target)}</b>.</div>
      <div class="orow muted">If you're not in it: wait for the next fresh BUY rather than chasing.</div>
    </div></div></div>`;
  }
  if(rec==='SELL'||rec==='STRONG SELL'){
    return `<div class="ticket"><div class="ostep"><div class="num2">↓</div><div>
      <div class="osh">${t} is flashing a SELL (exit)</div>
      <div class="orow">If you hold ${t}: <span class="ot sell">MARKET SELL</span>, or <span class="ot sell">SELL LIMIT</span> near ${usd(e.entry)}, to close.</div>
      <div class="orow muted">If you don't hold it: nothing to do — this is an exit, not a short.</div>
    </div></div></div>`;
  }
  return `<div class="note">No action on ${t} — neutral (WAIT). Wait for a fresh BUY with rising conviction.</div>`;
}
"""

# --------------------------------------------------------------------------- #
# Main page
# --------------------------------------------------------------------------- #
_MAIN_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HP Analytics — Trade Advisor</title><style>""" + _CSS + """</style></head><body>
<header>
  <h1>🦙 HP Analytics <span class="g">Trade Advisor</span></h1>
  <span class="meta" id="status"><span class="dot scanning"></span>loading…</span>
  <span class="pill" id="cfg"></span>
  <span class="meta" style="margin-left:auto" id="updated"></span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational advisory only — not financial advice. This tool places
    <b>no</b> orders; it tells you exactly what to do and you place it in your own broker.
    "Projected"/"expected" figures are estimates from the levels and the Pine Script's historical win rate — not guarantees.</div>

  <h2>💰 Your account</h2>
  <div class="account">
    <div class="field"><span>Capital ($)</span><input id="capital" type="number" min="0" step="100"></div>
    <div class="field"><span>Max % / position</span><input id="maxPct" type="number" min="1" max="100" step="1"></div>
    <div class="field"><span>Stop-loss %</span><input id="stopPct" type="number" min="0.5" step="0.5"></div>
    <div class="field"><span>Take-profit %</span><input id="targetPct" type="number" min="0.5" step="0.5"></div>
    <div class="hint">Type your real numbers — every share count, dollar amount, stop, target and order
      ticket recomputes instantly and is saved in this browser.</div>
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
  <div class="tablewrap"><table id="alltable"><thead><tr>
    <th data-k="rank" onclick="setSort('rank')">Ticker</th>
    <th>Trend</th>
    <th data-k="conviction" onclick="setSort('conviction')" class="num">Conv</th>
    <th data-k="price" onclick="setSort('price')" class="num">Price</th>
    <th data-k="change" onclick="setSort('change')" class="num">20-bar</th>
    <th data-k="rsi" onclick="setSort('rsi')" class="num">RSI</th>
    <th data-k="shares" onclick="setSort('shares')" class="num">Shares</th>
    <th data-k="ev" onclick="setSort('ev')" class="num">Exp.value</th>
    <th data-k="win" onclick="setSort('win')" class="num">Win rate</th>
    <th></th>
  </tr></thead><tbody id="allbody"></tbody></table></div>
  <div class="foot" id="foot"></div>
</div>
<script>
const REFRESH = __REFRESH__ * 1000;
""" + _SHARED_JS + """
let LAST=null, FILTER='all', SEARCH='', SORTK='rank', SORTD=-1;
const briefHTML = t => !t ? '' : t.replace(/(Rationale:|Risk check:|Caution:)/g,'<b>$1</b>');
const recRank = {'STRONG BUY':5,'BUY':4,'HOLD':3,'WAIT':2,'SELL':1,'STRONG SELL':0};

function initInputs(){
  const s=getSettings();
  ['capital','maxPct','stopPct','targetPct'].forEach(k=>{
    const el=document.getElementById(k); el.value=s[k];
    el.onchange=()=>{ const v=parseFloat(el.value); if(!isNaN(v)&&v>0){localStorage.setItem(k,v); render();} };
  });
  document.getElementById('search').oninput=e=>{ SEARCH=e.target.value.trim().toLowerCase(); render(); };
}
function setFilter(el){ FILTER=el.dataset.f; document.querySelectorAll('.fchip').forEach(c=>c.classList.toggle('active',c===el)); render(); }
function setSort(k){ if(SORTK===k) SORTD*=-1; else {SORTK=k; SORTD=-1;} render(); }

function metric(x,k,s){
  const e=economics(x.price, edgeWin(x), s);
  switch(k){
    case 'rank': return recRank[x.recommendation] ?? 2;
    case 'conviction': return x.conviction; case 'price': return x.price;
    case 'change': return x.change_pct||0; case 'rsi': return x.rsi||0;
    case 'shares': return e.shares; case 'ev': return e.ev; case 'win': return edgeWin(x);
  } return 0;
}

function card(x,s){
  const e=economics(x.price, edgeWin(x), s);
  const strong=x.recommendation==='STRONG BUY'?' strong':'';
  const agree=x.agree?'<span class="agree">✓ both equations agree</span>':'';
  const brief=x.ai_brief?`<div class="brief">${briefHTML(x.ai_brief)}</div>`:'';
  return `<div class="card${strong}">
    <div class="top">
      <div><a class="tk" href="/ticker/${x.ticker}">${x.ticker}</a>
        <span class="meta">${x.sector}</span></div>
      <span><span class="chip ${cls(x.recommendation)}">${x.recommendation}</span>${agree}</span>
    </div>
    <div class="subline">${usd(x.price)} · conv ${x.conviction.toFixed(0)}/100 · edge ${pct(edgeWin(x))} win ${sparkline(x.spark)}</div>
    <div class="bar"><span data-w="${x.conviction}"></span></div>
    <div class="badges">${contextBadges(x)}</div>
    ${orderTicket(x,e,s,LAST.config.interval)}
    ${brief}
  </div>`;
}

function row(x,s){
  if(x.error) return `<tr><td><a href="/ticker/${x.ticker}">${x.ticker}</a></td><td colspan="9" class="red">${x.error}</td></tr>`;
  const e=economics(x.price, edgeWin(x), s);
  return `<tr>
    <td><a href="/ticker/${x.ticker}"><b>${x.ticker}</b></a> <span class="chip ${cls(x.recommendation)}">${x.recommendation}</span><div class="meta">${x.sector}</div></td>
    <td><span class="badge ${x.trend==='Uptrend'?'green':'red'}">${x.trend||'—'}</span></td>
    <td class="num">${x.conviction.toFixed(0)}</td>
    <td class="num">${usd(x.price)}</td>
    <td class="num ${(x.change_pct||0)>=0?'green':'red'}">${(x.change_pct||0)>=0?'+':''}${(x.change_pct||0).toFixed(1)}%</td>
    <td class="num ${rsiCls(x.rsi)}">${Math.round(x.rsi)}</td>
    <td class="num">${e.shares}</td>
    <td class="num ${e.ev>=0?'green':'red'}">${money(e.ev)}</td>
    <td class="num">${pct(edgeWin(x))} <span class="muted">(${x.eq1?x.eq1.edge_trades:0}t)</span></td>
    <td>${sparkline(x.spark)}</td>
  </tr>`;
}

function visible(s){
  let arr=LAST.signals.slice();
  if(SEARCH) arr=arr.filter(x=>x.ticker.toLowerCase().includes(SEARCH)||(x.sector||'').toLowerCase().includes(SEARCH));
  if(FILTER==='buys') arr=arr.filter(x=>x.is_buy);
  else if(FILTER==='strong') arr=arr.filter(x=>x.recommendation==='STRONG BUY');
  else if(FILTER==='hold') arr=arr.filter(x=>x.recommendation==='HOLD');
  else if(FILTER==='sell') arr=arr.filter(x=>(x.recommendation||'').includes('SELL'));
  arr.sort((a,b)=>{ const va=metric(a,SORTK,s),vb=metric(b,SORTK,s); return va<vb?SORTD:va>vb?-SORTD:0; });
  return arr;
}

function render(){
  if(!LAST) return;
  const s=getSettings();
  const buys=LAST.signals.filter(x=>x.is_buy&&!x.error);
  let tCost=0,tRisk=0,tRew=0,tEv=0;
  buys.forEach(x=>{const e=economics(x.price,edgeWin(x),s);tCost+=e.cost;tRisk+=e.risk;tRew+=e.reward;tEv+=e.ev;});
  const dep=s.capital?(tCost/s.capital*100):0;
  document.getElementById('summary').innerHTML=[
    ['Your capital',money(s.capital),''],['Buy signals',buys.length,'blue'],
    ['Capital to deploy',money(tCost)+' ('+dep.toFixed(0)+'%)',''],
    ['Total risk (stops)',money(tRisk),'red'],['Profit at targets',money(tRew),'green'],
    ['Expected value',money(tEv),tEv>=0?'green':'red'],
  ].map((c,i)=>`<div class="stat" style="animation-delay:${i*40}ms"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');

  const bySec={}; buys.forEach(x=>bySec[x.sector]=(bySec[x.sector]||0)+1);
  const secs=Object.keys(bySec).sort();
  document.getElementById('sectors').innerHTML=secs.length
    ? secs.map((k,i)=>`<div class="secchip" style="animation-delay:${i*40}ms">${k} <b>${bySec[k]}</b></div>`).join('')
    : '<span class="hint">No buy signals right now — nothing to diversify yet.</span>';

  document.getElementById('topbuys').innerHTML=buys.length
    ? buys.map((x,i)=>card(x,s).replace('<div class="card','<div style="animation-delay:'+(i*50)+'ms" class="card')).join('')
    : '<div class="card"><div class="subline">No fresh buy signals right now. The scanner re-checks automatically every '+(REFRESH/1000)+'s.</div></div>';

  document.getElementById('allbody').innerHTML=visible(s).map(x=>row(x,s)).join('');
  // animate conviction bars after paint
  requestAnimationFrame(()=>document.querySelectorAll('.bar>span').forEach(b=>b.style.width=b.dataset.w+'%'));
  document.getElementById('foot').textContent=`${LAST.signals.length} tickers monitored · refreshing every ${REFRESH/1000}s · click any ticker for charts & detail`;
}

async function tick(){
  try{
    LAST=await (await fetch('/api/signals')).json();
    const dot=LAST.status==='ok'?'ok':(LAST.status==='error'?'error':'scanning');
    document.getElementById('status').innerHTML=`<span class="dot ${dot}"></span>${LAST.status==='scanning'?'scanning '+LAST.config.universe+' stocks…':LAST.status}${LAST.error?': '+LAST.error:''}`;
    const c=LAST.config;
    document.getElementById('cfg').textContent=`advisor · eq${c.equation_set} · ${c.interval} · ${c.universe} stocks`+(LAST.ai_enabled?' · AI on':'');
    document.getElementById('updated').textContent=LAST.updated?'updated '+LAST.updated:'';
    render();
  }catch(e){ document.getElementById('status').innerHTML='<span class="dot error"></span>fetch error'; }
}
initInputs(); tick(); setInterval(tick, REFRESH);
</script></body></html>"""


# --------------------------------------------------------------------------- #
# Detail page
# --------------------------------------------------------------------------- #
_DETAIL_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TICKER__ — detail</title><style>""" + _CSS + """</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script></head><body>
<header>
  <h1>🦙 <span class="g">__TICKER__</span></h1>
  <a href="/" class="meta">← back to advisor</a>
  <span class="meta" id="head"></span>
  <span style="margin-left:auto">
    <button class="btn active" id="b1" onclick="setEq(1)">Equation 1</button>
    <button class="btn" id="b2" onclick="setEq(2)">Equation 2</button>
  </span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational only — not financial advice. Backtested edge and expected
    value are historical estimates, not guarantees of future profit.</div>
  <h2>📋 Your order ticket (uses your saved account &amp; risk settings)</h2>
  <div id="planbox"></div>
  <h2>📈 Price &amp; signals (recent) · Equity curve (full backtest)</h2>
  <div class="grid2"><canvas id="priceChart" height="150"></canvas><canvas id="equityChart" height="150"></canvas></div>
  <h2>🧮 Edge — this strategy on __TICKER__</h2>
  <div class="summary" id="stats"></div>
  <h2>🕓 Recent signal history</h2>
  <div class="tablewrap"><table><thead><tr><th>Date</th><th>Signal</th><th class="num">Price</th></tr></thead>
    <tbody id="hist"></tbody></table></div>
  <div class="foot" id="foot"></div>
</div>
<script>
const TICKER="__TICKER__"; let EQ=1, priceChart, equityChart;
""" + _SHARED_JS + """
function setEq(n){ EQ=n; document.getElementById('b1').classList.toggle('active',n===1);
  document.getElementById('b2').classList.toggle('active',n===2); load(); }
function statCard(k,v,c){ return `<div class="stat"><div class="k">${k}</div><div class="v ${c||''}">${v}</div></div>`; }
function drawCharts(d){
  if(typeof Chart==='undefined'){ document.getElementById('foot').textContent='(charts need internet to load the chart library; numbers still work)'; return; }
  const ax={grid:{color:'#1a2230'},ticks:{color:'#8a96a8',maxTicksLimit:8}};
  if(priceChart) priceChart.destroy();
  priceChart=new Chart(document.getElementById('priceChart'),{type:'line',data:{labels:d.chart.labels,datasets:[
    {label:'Price',data:d.chart.price,borderColor:'#5aa9ff',borderWidth:1.6,pointRadius:0,tension:.12},
    {label:'Buy',data:d.chart.buys,borderColor:'#41d18b',backgroundColor:'#41d18b',showLine:false,pointRadius:6,pointStyle:'triangle'},
    {label:'Sell',data:d.chart.sells,borderColor:'#ff5d6c',backgroundColor:'#ff5d6c',showLine:false,pointRadius:6,pointStyle:'triangle',rotation:180},
  ]},options:{responsive:true,plugins:{legend:{labels:{color:'#e8eef7'}}},scales:{x:ax,y:ax}}});
  if(equityChart) equityChart.destroy();
  equityChart=new Chart(document.getElementById('equityChart'),{type:'line',data:{labels:d.equity.labels,datasets:[
    {label:'Equity ($)',data:d.equity.values,borderColor:'#41d18b',borderWidth:1.6,pointRadius:0,fill:true,backgroundColor:'rgba(65,209,139,.09)',tension:.12}]},
    options:{responsive:true,plugins:{legend:{labels:{color:'#e8eef7'}}},scales:{x:ax,y:ax}}});
}
async function load(){
  document.getElementById('head').textContent='loading…';
  const d=await (await fetch(`/api/ticker/${TICKER}?eq=${EQ}`)).json();
  if(d.error){ document.getElementById('head').innerHTML=`<span class="red">${d.error}</span>`; return; }
  document.getElementById('head').innerHTML=`<span class="chip ${cls(d.recommendation)}">${d.recommendation}</span> · ${d.sector} · ${usd(d.price)} · conv ${d.conviction.toFixed(0)}/100`;
  const s=getSettings(), e=economics(d.price,(d.stats?d.stats.win_rate:0.5),s);
  document.getElementById('planbox').innerHTML=`<div class="card">${orderTicket(d,e,s,'bar')}</div>`;
  const st=d.stats;
  document.getElementById('stats').innerHTML=
    statCard('Win rate',(st.win_rate*100).toFixed(0)+'%','blue')+
    statCard('Total return',(st.return_pct>=0?'+':'')+st.return_pct.toFixed(0)+'%',st.return_pct>=0?'green':'red')+
    statCard('Trades',st.trades)+statCard('Avg win',money(st.avg_win),'green')+
    statCard('Avg loss',money(st.avg_loss),'red')+statCard('Max drawdown',st.max_dd_pct.toFixed(1)+'%','red')+
    statCard('Sharpe',st.sharpe.toFixed(2))+statCard('Profit factor',st.profit_factor.toFixed(2));
  document.getElementById('hist').innerHTML=(d.history||[]).map(h=>
    `<tr><td>${h.date}</td><td><span class="chip ${h.action}">${h.action}</span></td><td class="num">${usd(h.price)}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">no signals in range</td></tr>';
  document.getElementById('foot').textContent=`as of ${d.asof} · equation set ${d.equation_set} · ${st.trades} historical trades`;
  drawCharts(d);
}
load(); setInterval(load, __REFRESH__*1000);
</script></body></html>"""
