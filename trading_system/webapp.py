"""
webapp.py
=========

In-depth, interactive **advisory** dashboard for signals-only mode.

It places **no orders** (paper or real) — it tells you exactly what to do and you
execute it in your own broker. Features:

* a **settings panel** — enter your capital, max % per position, stop %, target %;
  everything (share counts, dollar amounts, plans) recomputes instantly and is
  remembered in your browser.
* **order tickets** — for each buy: order type (limit / market / stop / bracket),
  exact share count, dollar cost, stop and target prices, dollar risk and reward,
  and when to place it. Step by step.
* **diversification** — a sector breakdown of your buy signals.
* a per-ticker **detail page** with interactive charts.

No API keys required (free yfinance data). The optional Claude briefing is the
only thing that uses an Anthropic key, and it's off by default.

Run::  python main.py web   →   http://127.0.0.1:5000  (use WEB_PORT=5001 on macOS)
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
# Shared CSS
# --------------------------------------------------------------------------- #
_CSS = """
  :root{--bg:#0d1117;--panel:#161b22;--panel2:#1c2230;--border:#30363d;--fg:#e6edf3;
        --muted:#8b949e;--green:#3fb950;--red:#f85149;--amber:#d29922;--blue:#58a6ff;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
       font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  a{color:var(--blue);text-decoration:none} a:hover{text-decoration:underline}
  header{padding:14px 24px;border-bottom:1px solid var(--border);display:flex;
         align-items:center;gap:14px;flex-wrap:wrap;background:var(--panel)}
  header h1{font-size:17px;margin:0}
  .meta{color:var(--muted);font-size:12px}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
  .dot.ok{background:var(--green)} .dot.scanning{background:var(--amber)} .dot.error{background:var(--red)}
  .wrap{padding:18px 24px;max-width:1320px;margin:0 auto}
  .disclaimer{background:rgba(210,153,34,.1);border:1px solid var(--amber);color:#e3b341;
              padding:8px 12px;border-radius:6px;font-size:12px;margin:0 0 14px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:22px 0 10px}
  .settings{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;background:var(--panel);
            border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px}
  .settings label{display:flex;flex-direction:column;font-size:11px;color:var(--muted);gap:4px;
                  text-transform:uppercase;letter-spacing:.03em}
  .settings input{background:#0d1117;border:1px solid var(--border);color:var(--fg);
                  border-radius:7px;padding:8px 10px;width:130px;font-size:15px;font-variant-numeric:tabular-nums}
  .settings .hint{font-size:11px;color:var(--muted);max-width:240px;line-height:1.4}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:6px}
  .stat{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:11px 13px}
  .stat .k{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.03em}
  .stat .v{font-size:19px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
  .v.green{color:var(--green)} .v.red{color:var(--red)} .v.blue{color:var(--blue)}
  .secbar{display:flex;gap:8px;flex-wrap:wrap}
  .secchip{background:var(--panel);border:1px solid var(--border);border-radius:999px;
           padding:4px 12px;font-size:12px}
  .secchip b{color:var(--green)}
  details.guide{background:var(--panel);border:1px solid var(--border);border-radius:9px;
                padding:9px 13px;margin-bottom:14px;font-size:12.5px}
  details.guide summary{cursor:pointer;color:var(--blue);font-weight:600}
  details.guide table{margin-top:8px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:11px;padding:15px}
  .card.strong{border-color:var(--green);box-shadow:0 0 0 1px rgba(63,185,80,.35)}
  .card .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  .tk{font-size:20px;font-weight:700}
  .chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.03em}
  .chip.STRONGBUY{background:var(--green);color:#06210f}
  .chip.BUY{background:rgba(63,185,80,.2);color:var(--green);border:1px solid var(--green)}
  .chip.HOLD{background:rgba(88,166,255,.15);color:var(--blue);border:1px solid var(--blue)}
  .chip.WAIT{background:rgba(139,148,158,.15);color:var(--muted);border:1px solid var(--border)}
  .chip.SELL,.chip.STRONGSELL{background:rgba(248,81,73,.18);color:var(--red);border:1px solid var(--red)}
  .agree{font-size:11px;color:var(--green);margin-left:6px}
  .sector{font-size:11px;color:var(--muted)}
  .bar{height:6px;border-radius:3px;background:#21262d;margin:9px 0 4px;overflow:hidden}
  .bar>span{display:block;height:100%;background:linear-gradient(90deg,#1f6feb,#3fb950)}
  .ticket{margin-top:10px}
  .tline{background:var(--panel2);border:1px solid var(--border);border-radius:7px;padding:8px 10px;
         font-size:12.5px;margin-bottom:8px;font-variant-numeric:tabular-nums}
  ol.plan{margin:6px 0 2px;padding-left:20px;font-size:12.5px}
  ol.plan li{margin:5px 0}
  .ot{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10.5px;font-weight:700;
      background:#21262d;border:1px solid var(--border);letter-spacing:.02em;white-space:nowrap}
  .ot.buy{color:var(--green);border-color:var(--green)} .ot.sell{color:var(--red);border-color:var(--red)}
  .brief{margin-top:10px;padding:10px;background:#0d1117;border:1px solid var(--border);
         border-radius:6px;font-size:12px;white-space:pre-wrap}
  .brief b{color:var(--blue)}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--border)}
  th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .err{color:var(--red)} .green{color:var(--green)} .red{color:var(--red)} .muted{color:var(--muted)}
  .foot{color:var(--muted);font-size:11px;margin-top:22px}
  .btn{background:var(--panel2);border:1px solid var(--border);color:var(--fg);
       padding:6px 12px;border-radius:7px;cursor:pointer;font-size:12px}
  .btn.active{background:var(--blue);color:#06210f;border-color:var(--blue);font-weight:700}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media(max-width:900px){.grid2{grid-template-columns:1fr}}
  canvas{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:8px}
"""

# --------------------------------------------------------------------------- #
# Shared JS — settings, money math, and the order-ticket generator
# --------------------------------------------------------------------------- #
_SHARED_JS = """
const money = x => x==null ? '—' : (x<0?'-$':'$') + Math.abs(Number(x)).toLocaleString(undefined,{maximumFractionDigits:0});
const usd = x => x==null ? '—' : '$' + Number(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = x => (x*100).toFixed(0)+'%';
const cls = r => (r||'').replace(/\\s/g,'');

function getSettings(){
  return {
    capital:  +(localStorage.getItem('capital')  || __CAP__),
    maxPct:   +(localStorage.getItem('maxPct')    || __MAXPCT__),
    stopPct:  +(localStorage.getItem('stopPct')   || __STOPPCT__),
    targetPct:+(localStorage.getItem('targetPct') || __TGTPCT__),
  };
}
function saveSettings(s){ for(const k in s) localStorage.setItem(k, s[k]); }

// All the trade economics from a price + the user's settings + historical win rate.
function economics(price, winRate, s){
  const entry = price;
  const stop = entry*(1 - s.stopPct/100);
  const target = entry*(1 + s.targetPct/100);
  const budget = s.capital*(s.maxPct/100);
  const shares = entry>0 ? Math.max(0, Math.floor(budget/entry)) : 0;
  const cost = shares*entry;
  const risk = shares*(entry-stop);
  const reward = shares*(target-entry);
  const rr = risk>0 ? reward/risk : 0;
  const w = (winRate==null) ? 0.5 : winRate;
  const ev = w*reward - (1-w)*risk;
  return {entry,stop,target,shares,cost,risk,reward,rr,ev,pctCap:s.capital?cost/s.capital*100:0};
}

// The step-by-step order ticket (the exact thing to place in your broker).
function orderTicket(sig, e, s, interval){
  const t = sig.ticker, rec = sig.recommendation;
  if(rec==='STRONG BUY' || rec==='BUY'){
    if(e.shares<=0) return `<div class="tline muted">Your capital × max% is too small to buy even 1 share of ${t} at ${usd(e.entry)}. Raise your capital or max % per position.</div>`;
    return `<div class="ticket">
      <div class="tline">📋 <b>BUY ${e.shares} ${t}</b> · LIMIT <b>${usd(e.entry)}</b> &nbsp;·&nbsp; 🛑 STOP <b>${usd(e.stop)}</b> &nbsp;·&nbsp; 🎯 TARGET <b>${usd(e.target)}</b></div>
      <ol class="plan">
        <li><b>What &amp; how much</b> — Buy <b>${e.shares} shares</b> of ${t}, about <b>${money(e.cost)}</b> (${e.pctCap.toFixed(0)}% of your ${money(s.capital)}).</li>
        <li><b>Entry order</b> — Place a <span class="ot buy">LIMIT BUY</span> at <b>${usd(e.entry)}</b> (you won't pay above this). Want an instant fill? Use a <span class="ot">MARKET</span> order at ~${usd(e.entry)}.</li>
        <li><b>Protect it</b> — Once filled, place a <span class="ot sell">STOP&nbsp;SELL</span> at <b>${usd(e.stop)}</b> (−${s.stopPct}%). Auto-exits if it drops — caps your loss at ≈ <span class="red">${money(e.risk)}</span>.</li>
        <li><b>Take profit</b> — Place a <span class="ot sell">LIMIT SELL</span> at <b>${usd(e.target)}</b> (+${s.targetPct}%). Auto-exits in profit ≈ <span class="green">${money(e.reward)}</span> — a <b>${e.rr.toFixed(1)}:1</b> reward-to-risk trade.</li>
        <li><b>Easier</b> — If your broker offers a <span class="ot">BRACKET</span> / OCO order, attach the stop and target to the buy so one auto-cancels the other.</li>
        <li><b>When</b> — Place during US market hours (9:30am–4:00pm ET). The signal is from the latest closed ${interval} bar.</li>
        <li><b>Exit rule</b> — Otherwise hold until the stop or target triggers, or until this dashboard flips ${t} to SELL.</li>
      </ol></div>`;
  }
  if(rec==='HOLD'){
    return `<div class="ticket"><ol class="plan">
      <li><b>${t} already triggered a BUY earlier — this is not a fresh entry.</b></li>
      <li>If you already hold it: keep a <span class="ot sell">STOP&nbsp;SELL</span> near <b>${usd(e.stop)}</b> and a <span class="ot sell">LIMIT SELL</span> near <b>${usd(e.target)}</b>.</li>
      <li>If you're not in it: <b>wait</b> for the next fresh BUY rather than chasing.</li>
    </ol></div>`;
  }
  if(rec==='SELL' || rec==='STRONG SELL'){
    return `<div class="ticket"><ol class="plan">
      <li><b>${t} is flashing a SELL (exit) signal.</b></li>
      <li>If you hold ${t}: place a <span class="ot sell">MARKET SELL</span> (or LIMIT SELL near ${usd(e.entry)}) to close.</li>
      <li>If you don't hold it: nothing to do — this is an exit, not a short.</li>
    </ol></div>`;
  }
  return `<div class="tline muted">No action on ${t} — neutral (WAIT). Wait for a fresh BUY.</div>`;
}
"""

# --------------------------------------------------------------------------- #
# Main page
# --------------------------------------------------------------------------- #
_MAIN_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HP Analytics — Trade Advisor</title><style>""" + _CSS + """</style></head><body>
<header>
  <h1>🦙 HP Analytics — Trade Advisor</h1>
  <span class="meta" id="status"><span class="dot scanning"></span>loading…</span>
  <span class="meta" id="cfg"></span>
  <span class="meta" style="margin-left:auto" id="updated"></span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational advisory only — not financial advice. This tool
    places <b>no</b> orders; it tells you exactly what to do and you place it in your own broker.
    "Projected"/"expected" figures are arithmetic from the levels and historical win rate — estimates, not guarantees.</div>

  <h2>Your settings — everything below updates instantly</h2>
  <div class="settings">
    <label>Your capital ($)<input id="capital" type="number" min="0" step="100"></label>
    <label>Max % per position<input id="maxPct" type="number" min="1" max="100" step="1"></label>
    <label>Stop-loss %<input id="stopPct" type="number" min="0.5" step="0.5"></label>
    <label>Take-profit %<input id="targetPct" type="number" min="0.5" step="0.5"></label>
    <span class="hint">Enter your real numbers. Share counts, dollar amounts, stops, targets and
      plans all recompute for your account and are saved in this browser.</span>
  </div>

  <details class="guide"><summary>📘 Order types — quick guide (click to expand)</summary>
    <table>
      <tr><td><span class="ot">MARKET</span></td><td>Fills immediately at the current price. Simplest; price not guaranteed.</td></tr>
      <tr><td><span class="ot buy">LIMIT BUY</span></td><td>Fills only at your price or better — you won't overpay.</td></tr>
      <tr><td><span class="ot sell">STOP SELL</span></td><td>A "stop-loss" — auto-sells if the price falls to your stop. Caps your loss.</td></tr>
      <tr><td><span class="ot sell">LIMIT SELL</span></td><td>A "take-profit" — auto-sells when the price rises to your target.</td></tr>
      <tr><td><span class="ot">BRACKET / OCO</span></td><td>Attaches a stop and a target to your buy; if one fills the other cancels. Easiest way to manage a trade.</td></tr>
    </table>
  </details>

  <h2>If you take every buy below</h2>
  <div class="summary" id="summary"></div>

  <h2>Diversification (buys by sector)</h2>
  <div class="secbar" id="sectors"></div>

  <h2>Top Buys — your exact order tickets</h2>
  <div class="cards" id="topbuys"></div>

  <h2>All Tickers</h2>
  <table id="alltable"><thead><tr>
    <th>Ticker</th><th>Sector</th><th>Signal</th><th class="num">Conv</th><th class="num">Price</th>
    <th class="num">Shares</th><th class="num">Cost</th><th class="num">R:R</th>
    <th class="num">Exp.value</th><th>Edge (eq1)</th>
  </tr></thead><tbody id="allbody"></tbody></table>
  <div class="foot" id="foot"></div>
</div>
<script>
const REFRESH = __REFRESH__ * 1000;
""" + _SHARED_JS + """
let LAST = null;
const briefHTML = t => !t ? '' : t.replace(/(Rationale:|Risk check:|Caution:)/g,'<b>$1</b>');

function initInputs(){
  const s = getSettings();
  ['capital','maxPct','stopPct','targetPct'].forEach(k=>{
    const el=document.getElementById(k); el.value=s[k];
    el.onchange=()=>{ const v=parseFloat(el.value); if(!isNaN(v)&&v>0){ localStorage.setItem(k,v); render(); } };
  });
}

function card(x, s){
  const e = economics(x.price, x.edge_win_rate, s);
  const strong = x.recommendation==='STRONG BUY' ? ' strong':'';
  const agree = x.agree ? '<span class="agree">✓ both equations agree</span>':'';
  const brief = x.ai_brief ? `<div class="brief">${briefHTML(x.ai_brief)}</div>`:'';
  return `<div class="card${strong}">
    <div class="top">
      <a class="tk" href="/ticker/${x.ticker}">${x.ticker} ↗</a>
      <span><span class="chip ${cls(x.recommendation)}">${x.recommendation}</span>${agree}</span>
    </div>
    <div class="sector">${x.sector} · ${usd(x.price)} · conviction ${x.conviction.toFixed(0)}/100 · historical edge ${x.eq1?pct(x.eq1.edge_win_rate):'–'} win</div>
    <div class="bar"><span style="width:${x.conviction}%"></span></div>
    ${orderTicket(x, e, s, LAST.config.interval)}
    ${brief}
  </div>`;
}

function row(x, s){
  if(x.error) return `<tr><td><a href="/ticker/${x.ticker}">${x.ticker}</a></td><td>${x.sector||''}</td><td colspan="8" class="err">${x.error}</td></tr>`;
  const e = economics(x.price, x.edge_win_rate, s);
  const edge = x.eq1 ? `${pct(x.eq1.edge_win_rate)} win · ${x.eq1.edge_return_pct>=0?'+':''}${x.eq1.edge_return_pct.toFixed(0)}% (${x.eq1.edge_trades}t)` : '—';
  return `<tr>
    <td><a href="/ticker/${x.ticker}"><b>${x.ticker}</b></a></td>
    <td class="muted">${x.sector}</td>
    <td><span class="chip ${cls(x.recommendation)}">${x.recommendation}</span></td>
    <td class="num">${x.conviction.toFixed(0)}</td>
    <td class="num">${usd(x.price)}</td>
    <td class="num">${e.shares}</td>
    <td class="num">${money(e.cost)}</td>
    <td class="num">1:${e.rr.toFixed(1)}</td>
    <td class="num ${e.ev>=0?'green':'red'}">${money(e.ev)}</td>
    <td>${edge}</td>
  </tr>`;
}

function render(){
  if(!LAST) return;
  const s = getSettings();
  const buys = LAST.signals.filter(x=>x.is_buy && !x.error);
  let tCost=0,tRisk=0,tRew=0,tEv=0;
  buys.forEach(x=>{const e=economics(x.price,x.edge_win_rate,s); tCost+=e.cost; tRisk+=e.risk; tRew+=e.reward; tEv+=e.ev;});
  const dep = s.capital ? (tCost/s.capital*100) : 0;
  document.getElementById('summary').innerHTML = [
    ['Your capital', money(s.capital), ''],
    ['Buy signals', buys.length, 'blue'],
    ['Capital to deploy', money(tCost)+' ('+dep.toFixed(0)+'%)', ''],
    ['Total risk (stops)', money(tRisk), 'red'],
    ['Profit at targets', money(tRew), 'green'],
    ['Expected value', money(tEv), tEv>=0?'green':'red'],
  ].map(c=>`<div class="stat"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');

  const bySec={}; buys.forEach(x=>bySec[x.sector]=(bySec[x.sector]||0)+1);
  const secs=Object.keys(bySec).sort();
  document.getElementById('sectors').innerHTML = secs.length
    ? secs.map(k=>`<div class="secchip">${k} <b>${bySec[k]}</b></div>`).join('')
    : '<span class="hint">No buy signals right now — nothing to diversify yet.</span>';

  document.getElementById('topbuys').innerHTML = buys.length ? buys.map(x=>card(x,s)).join('')
    : '<div class="card"><div class="sector">No fresh buy signals right now. The scanner re-checks automatically.</div></div>';
  document.getElementById('allbody').innerHTML = LAST.signals.map(x=>row(x,s)).join('');
  document.getElementById('foot').textContent =
    `${LAST.signals.length} tickers monitored · refreshing every ${REFRESH/1000}s · click any ticker for charts & detail`;
}

async function tick(){
  try{
    LAST = await (await fetch('/api/signals')).json();
    const dot = LAST.status==='ok'?'ok':(LAST.status==='error'?'error':'scanning');
    document.getElementById('status').innerHTML = `<span class="dot ${dot}"></span>${LAST.status}${LAST.error?': '+LAST.error:''}`;
    const c = LAST.config;
    document.getElementById('cfg').textContent = `advisory · eq${c.equation_set} · lookback ${c.lookback} · ${c.interval}` + (LAST.ai_enabled?' · AI on':'');
    document.getElementById('updated').textContent = LAST.updated ? 'updated '+LAST.updated : '';
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
  <h1>🦙 __TICKER__</h1>
  <a href="/" class="meta">← back to advisor</a>
  <span class="meta" id="head"></span>
  <span style="margin-left:auto">
    <button class="btn active" id="b1" onclick="setEq(1)">Equation 1</button>
    <button class="btn" id="b2" onclick="setEq(2)">Equation 2</button>
  </span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational only — not financial advice. Backtested edge and
    expected value are historical estimates, not guarantees of future profit.</div>

  <h2>Your order ticket (uses your saved capital &amp; risk settings)</h2>
  <div id="planbox"></div>

  <h2>Price &amp; signals (recent) · Equity curve (full backtest)</h2>
  <div class="grid2">
    <canvas id="priceChart" height="150"></canvas>
    <canvas id="equityChart" height="150"></canvas>
  </div>

  <h2>Edge — this strategy on __TICKER__</h2>
  <div class="summary" id="stats"></div>

  <h2>Recent signal history</h2>
  <table><thead><tr><th>Date</th><th>Signal</th><th class="num">Price</th></tr></thead>
    <tbody id="hist"></tbody></table>
  <div class="foot" id="foot"></div>
</div>
<script>
const TICKER="__TICKER__"; let EQ=1; let priceChart, equityChart;
""" + _SHARED_JS + """
function setEq(n){ EQ=n; document.getElementById('b1').classList.toggle('active',n===1);
  document.getElementById('b2').classList.toggle('active',n===2); load(); }
function statCard(k,v,c){ return `<div class="stat"><div class="k">${k}</div><div class="v ${c||''}">${v}</div></div>`; }

function drawCharts(d){
  if(typeof Chart==='undefined'){ document.getElementById('foot').textContent='(charts need internet to load the chart library; the numbers still work)'; return; }
  const ax={grid:{color:'#21262d'},ticks:{color:'#8b949e',maxTicksLimit:8}};
  if(priceChart) priceChart.destroy();
  priceChart=new Chart(document.getElementById('priceChart'),{type:'line',
    data:{labels:d.chart.labels,datasets:[
      {label:'Price',data:d.chart.price,borderColor:'#58a6ff',borderWidth:1.5,pointRadius:0,tension:.1},
      {label:'Buy',data:d.chart.buys,borderColor:'#3fb950',backgroundColor:'#3fb950',showLine:false,pointRadius:6,pointStyle:'triangle'},
      {label:'Sell',data:d.chart.sells,borderColor:'#f85149',backgroundColor:'#f85149',showLine:false,pointRadius:6,pointStyle:'triangle',rotation:180},
    ]},options:{responsive:true,plugins:{legend:{labels:{color:'#e6edf3'}}},scales:{x:ax,y:ax}}});
  if(equityChart) equityChart.destroy();
  equityChart=new Chart(document.getElementById('equityChart'),{type:'line',
    data:{labels:d.equity.labels,datasets:[{label:'Equity ($)',data:d.equity.values,borderColor:'#3fb950',
      borderWidth:1.5,pointRadius:0,fill:true,backgroundColor:'rgba(63,185,80,.08)',tension:.1}]},
    options:{responsive:true,plugins:{legend:{labels:{color:'#e6edf3'}}},scales:{x:ax,y:ax}}});
}

async function load(){
  document.getElementById('head').textContent='loading…';
  const d = await (await fetch(`/api/ticker/${TICKER}?eq=${EQ}`)).json();
  if(d.error){ document.getElementById('head').innerHTML=`<span class="err">${d.error}</span>`; return; }
  document.getElementById('head').innerHTML =
    `<span class="chip ${cls(d.recommendation)}">${d.recommendation}</span> · ${d.sector} · ${usd(d.price)} · conviction ${d.conviction.toFixed(0)}/100`;

  const s = getSettings();
  const e = economics(d.price, (d.stats?d.stats.win_rate:0.5), s);
  document.getElementById('planbox').innerHTML = `<div class="card">${orderTicket(d, e, s, 'bar')}</div>`;

  const st=d.stats;
  document.getElementById('stats').innerHTML =
    statCard('Win rate',(st.win_rate*100).toFixed(0)+'%','blue')+
    statCard('Total return',(st.return_pct>=0?'+':'')+st.return_pct.toFixed(0)+'%',st.return_pct>=0?'green':'red')+
    statCard('Trades',st.trades)+
    statCard('Avg win',money(st.avg_win),'green')+
    statCard('Avg loss',money(st.avg_loss),'red')+
    statCard('Max drawdown',st.max_dd_pct.toFixed(1)+'%','red')+
    statCard('Sharpe',st.sharpe.toFixed(2))+
    statCard('Profit factor',st.profit_factor.toFixed(2));

  document.getElementById('hist').innerHTML = (d.history||[]).map(h=>
    `<tr><td>${h.date}</td><td><span class="chip ${h.action}">${h.action}</span></td><td class="num">${usd(h.price)}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="muted">no signals in range</td></tr>';

  document.getElementById('foot').textContent = `as of ${d.asof} · equation set ${d.equation_set} · ${st.trades} historical trades`;
  drawCharts(d);
}
load(); setInterval(load, __REFRESH__*1000);
</script></body></html>"""
