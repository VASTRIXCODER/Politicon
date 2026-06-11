"""
webapp.py
=========

In-depth, interactive Flask dashboard for **signals-only** mode.

* ``/``                 — portfolio summary + Top-Buys cards (with step-by-step
                          trade plans and economics) + a full ranked table.
* ``/ticker/<sym>``     — a detail page: interactive price chart with buy/sell
                          markers, equity curve, full edge stats, the trade plan,
                          and recent signal history.
* ``/api/signals``      — JSON snapshot powering the main page.
* ``/api/ticker/<sym>`` — JSON powering a detail page (``?eq=1`` or ``?eq=2``).

A background thread re-scans every ``WEB_REFRESH_SECONDS``. No broker, no orders,
no API keys — it reads free yfinance data. (The optional Claude AI briefing is
the only thing that uses an Anthropic key, and it's off by default.)

Run::  python main.py web   →   http://127.0.0.1:5000
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

        buys = [s for s in signals if s.is_buy and not s.error]
        acct = self.config.account_size or 0.0
        total_cost = sum(s.cost for s in buys)
        portfolio = {
            "account_size": acct,
            "num_buys": len(buys),
            "total_cost": round(total_cost, 2),
            "deployed_pct": round(total_cost / acct * 100.0, 1) if acct else 0.0,
            "total_risk": round(sum(s.risk_dollars for s in buys), 2),
            "total_reward": round(sum(s.reward_dollars for s in buys), 2),
            "total_ev": round(sum(s.ev_dollars for s in buys), 2),
            "monitored": len(signals),
        }
        return {
            "status": status, "updated": updated, "error": error,
            "mode": "live" if self.config.is_live else "paper",
            "ai_enabled": bool(self.scanner.briefer and self.scanner.briefer.enabled),
            "config": {
                "equation_set": self.config.equation_set,
                "lookback": self.config.lookback_length,
                "interval": self.config.interval,
                "account_size": acct,
                "stop_loss_pct": self.config.stop_loss_pct,
                "take_profit_pct": self.config.take_profit_pct,
                "tickers": self.config.tickers,
            },
            "portfolio": portfolio,
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
    refresh = str(config.web_refresh_seconds)

    @app.route("/")
    def index():
        return Response(_MAIN_PAGE.replace("__REFRESH__", refresh), mimetype="text/html")

    @app.route("/ticker/<sym>")
    def ticker_page(sym):
        html = _DETAIL_PAGE.replace("__TICKER__", sym.upper()).replace("__REFRESH__", refresh)
        return Response(html, mimetype="text/html")

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
              padding:8px 12px;border-radius:6px;font-size:12px;margin:0 0 16px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:22px 0 10px}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:6px}
  .stat{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:11px 13px}
  .stat .k{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.03em}
  .stat .v{font-size:19px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
  .v.green{color:var(--green)} .v.red{color:var(--red)} .v.blue{color:var(--blue)}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px}
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
  .bar{height:6px;border-radius:3px;background:#21262d;margin:9px 0 4px;overflow:hidden}
  .bar>span{display:block;height:100%;background:linear-gradient(90deg,#1f6feb,#3fb950)}
  .econ{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0;font-size:12px}
  .econ div{background:var(--panel2);border-radius:7px;padding:7px 9px}
  .econ .k{color:var(--muted);font-size:10px;text-transform:uppercase}
  .econ .red{color:var(--red)} .econ .green{color:var(--green)}
  ol.plan{margin:8px 0 4px;padding-left:18px;font-size:12.5px}
  ol.plan li{margin:4px 0}
  ol.plan li:first-child{list-style:none;margin-left:-18px;font-weight:600;color:var(--blue)}
  .brief{margin-top:10px;padding:10px;background:#0d1117;border:1px solid var(--border);
         border-radius:6px;font-size:12px;white-space:pre-wrap}
  .brief b{color:var(--blue)}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--border)}
  th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;cursor:pointer}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .err{color:var(--red)} .green{color:var(--green)} .red{color:var(--red)}
  .foot{color:var(--muted);font-size:11px;margin-top:22px}
  .btn{background:var(--panel2);border:1px solid var(--border);color:var(--fg);
       padding:6px 12px;border-radius:7px;cursor:pointer;font-size:12px}
  .btn.active{background:var(--blue);color:#06210f;border-color:var(--blue);font-weight:700}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media(max-width:900px){.grid2{grid-template-columns:1fr}}
  canvas{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:8px}
"""


# --------------------------------------------------------------------------- #
# Main page
# --------------------------------------------------------------------------- #
_MAIN_PAGE = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HP Analytics — Signal Dashboard</title><style>""" + _CSS + """</style></head><body>
<header>
  <h1>🦙 HP Analytics — Signal Dashboard</h1>
  <span class="meta" id="status"><span class="dot scanning"></span>loading…</span>
  <span class="meta" id="cfg"></span>
  <span class="meta" style="margin-left:auto" id="updated"></span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational signals only — not financial advice. These
    are what the formulas flag; you decide and place any trades. "Projected" and
    "expected" figures are arithmetic from the levels and historical win rate — estimates, not guarantees.</div>

  <h2>Portfolio (if you take every buy below)</h2>
  <div class="summary" id="summary"></div>

  <h2>Top Buys — what to buy, how much, and your plan</h2>
  <div class="cards" id="topbuys"></div>

  <h2>All Tickers</h2>
  <table id="alltable"><thead><tr>
    <th>Ticker</th><th>Signal</th><th class="num">Conv</th><th class="num">Price</th>
    <th class="num">Entry</th><th class="num">Stop</th><th class="num">Target</th>
    <th class="num">Shares</th><th class="num">R:R</th><th class="num">Exp.value</th>
    <th>Edge (eq1)</th>
  </tr></thead><tbody id="allbody"></tbody></table>
  <div class="foot" id="foot"></div>
</div>
<script>
const REFRESH = __REFRESH__ * 1000;
const money = x => x==null ? '—' : (x<0?'-$':'$') + Math.abs(Number(x)).toLocaleString(undefined,{maximumFractionDigits:0});
const money2 = x => x==null ? '—' : (x<0?'-$':'$') + Math.abs(Number(x)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = x => (x*100).toFixed(0)+'%';
const cls = r => (r||'').replace(/\\s/g,'');
const briefHTML = t => !t ? '' : t.replace(/(Rationale:|Risk check:|Caution:)/g,'<b>$1</b>');

function summary(p){
  const cards = [
    ['Account', money(p.account_size), ''],
    ['Buy signals', p.num_buys, 'blue'],
    ['Capital to deploy', money(p.total_cost)+' ('+p.deployed_pct+'%)', ''],
    ['Total risk (stops)', money(p.total_risk), 'red'],
    ['Profit at targets', money(p.total_reward), 'green'],
    ['Expected value', money(p.total_ev), p.total_ev>=0?'green':'red'],
  ];
  return cards.map(c=>`<div class="stat"><div class="k">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join('');
}

function card(s){
  const strong = s.recommendation==='STRONG BUY' ? ' strong':'';
  const agree = s.agree ? '<span class="agree">✓ both agree</span>':'';
  const brief = s.ai_brief ? `<div class="brief">${briefHTML(s.ai_brief)}</div>`:'';
  const plan = (s.plan||[]).map(p=>`<li>${p}</li>`).join('');
  return `<div class="card${strong}">
    <div class="top">
      <a class="tk" href="/ticker/${s.ticker}">${s.ticker} ↗</a>
      <span><span class="chip ${cls(s.recommendation)}">${s.recommendation}</span>${agree}</span>
    </div>
    <div class="meta">${money2(s.price)} · conviction ${s.conviction.toFixed(0)}/100 · edge ${s.eq1?pct(s.eq1.edge_win_rate):'–'} win</div>
    <div class="bar"><span style="width:${s.conviction}%"></span></div>
    <div class="econ">
      <div><div class="k">Buy</div>${s.shares} sh · ${money(s.cost)}</div>
      <div><div class="k">Risk → stop</div><span class="red">${money(s.risk_dollars)}</span></div>
      <div><div class="k">Reward → target</div><span class="green">${money(s.reward_dollars)}</span></div>
      <div><div class="k">Risk:Reward</div>1 : ${s.risk_reward.toFixed(1)}</div>
      <div><div class="k">Exp. value</div><span class="${s.ev_dollars>=0?'green':'red'}">${money(s.ev_dollars)}</span></div>
      <div><div class="k">Stop / Target</div>${money2(s.stop)} / ${money2(s.target)}</div>
    </div>
    <ol class="plan">${plan}</ol>
    ${brief}
  </div>`;
}

function row(s){
  if(s.error) return `<tr><td><a href="/ticker/${s.ticker}">${s.ticker}</a></td><td colspan="10" class="err">${s.error}</td></tr>`;
  const edge = s.eq1 ? `${pct(s.eq1.edge_win_rate)} win · ${s.eq1.edge_return_pct>=0?'+':''}${s.eq1.edge_return_pct.toFixed(0)}% (${s.eq1.edge_trades}t)` : '—';
  return `<tr>
    <td><a href="/ticker/${s.ticker}"><b>${s.ticker}</b></a></td>
    <td><span class="chip ${cls(s.recommendation)}">${s.recommendation}</span></td>
    <td class="num">${s.conviction.toFixed(0)}</td>
    <td class="num">${money2(s.price)}</td>
    <td class="num">${money2(s.entry)}</td>
    <td class="num red">${money2(s.stop)}</td>
    <td class="num green">${money2(s.target)}</td>
    <td class="num">${s.shares}</td>
    <td class="num">1:${s.risk_reward.toFixed(1)}</td>
    <td class="num ${s.ev_dollars>=0?'green':'red'}">${money(s.ev_dollars)}</td>
    <td>${edge}</td>
  </tr>`;
}

async function tick(){
  try{
    const d = await (await fetch('/api/signals')).json();
    const dot = d.status==='ok'?'ok':(d.status==='error'?'error':'scanning');
    document.getElementById('status').innerHTML = `<span class="dot ${dot}"></span>${d.status}${d.error?': '+d.error:''}`;
    const c = d.config;
    document.getElementById('cfg').textContent =
      `eq${c.equation_set} · lookback ${c.lookback} · ${c.interval} · stop ${c.stop_loss_pct}% / target ${c.take_profit_pct}%`
      + (d.ai_enabled?' · AI on':'');
    document.getElementById('updated').textContent = d.updated ? 'updated '+d.updated : '';
    document.getElementById('summary').innerHTML = summary(d.portfolio);
    const buys = d.signals.filter(s=>s.is_buy && !s.error);
    document.getElementById('topbuys').innerHTML = buys.length ? buys.map(card).join('')
      : '<div class="card"><div class="meta">No fresh buy signals right now. Hold tight — the scanner re-checks automatically.</div></div>';
    document.getElementById('allbody').innerHTML = d.signals.map(row).join('');
    document.getElementById('foot').textContent =
      `${d.portfolio.monitored} tickers monitored · refreshing every ${REFRESH/1000}s · click any ticker for charts & detail`;
  }catch(e){ document.getElementById('status').innerHTML='<span class="dot error"></span>fetch error'; }
}
tick(); setInterval(tick, REFRESH);
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
  <a href="/" class="meta">← back to dashboard</a>
  <span class="meta" id="head"></span>
  <span style="margin-left:auto">
    <button class="btn active" id="b1" onclick="setEq(1)">Equation 1</button>
    <button class="btn" id="b2" onclick="setEq(2)">Equation 2</button>
  </span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational only — not financial advice. Backtested edge
    and expected value are historical estimates, not guarantees of future profit.</div>

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
const money = x => x==null ? '—' : (x<0?'-$':'$') + Math.abs(Number(x)).toLocaleString(undefined,{maximumFractionDigits:0});
const money2 = x => x==null ? '—' : (x<0?'-$':'$') + Math.abs(Number(x)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

function setEq(n){ EQ=n; document.getElementById('b1').classList.toggle('active',n===1);
  document.getElementById('b2').classList.toggle('active',n===2); load(); }

function statCard(k,v,c){ return `<div class="stat"><div class="k">${k}</div><div class="v ${c||''}">${v}</div></div>`; }

function drawCharts(d){
  if(typeof Chart==='undefined'){
    document.getElementById('foot').textContent='(charts need internet to load the chart library; the numbers above still work)';
    return;
  }
  const ax={grid:{color:'#21262d'},ticks:{color:'#8b949e',maxTicksLimit:8}};
  if(priceChart) priceChart.destroy();
  priceChart=new Chart(document.getElementById('priceChart'),{type:'line',
    data:{labels:d.chart.labels,datasets:[
      {label:'Price',data:d.chart.price,borderColor:'#58a6ff',borderWidth:1.5,pointRadius:0,tension:.1},
      {label:'Buy',data:d.chart.buys,borderColor:'#3fb950',backgroundColor:'#3fb950',showLine:false,pointRadius:6,pointStyle:'triangle'},
      {label:'Sell',data:d.chart.sells,borderColor:'#f85149',backgroundColor:'#f85149',showLine:false,pointRadius:6,pointStyle:'triangle',rotation:180},
    ]},
    options:{responsive:true,plugins:{legend:{labels:{color:'#e6edf3'}}},scales:{x:ax,y:ax}}});
  if(equityChart) equityChart.destroy();
  equityChart=new Chart(document.getElementById('equityChart'),{type:'line',
    data:{labels:d.equity.labels,datasets:[
      {label:'Equity ($)',data:d.equity.values,borderColor:'#3fb950',borderWidth:1.5,pointRadius:0,
       fill:true,backgroundColor:'rgba(63,185,80,.08)',tension:.1}]},
    options:{responsive:true,plugins:{legend:{labels:{color:'#e6edf3'}}},scales:{x:ax,y:ax}}});
}

async function load(){
  document.getElementById('head').textContent='loading…';
  const d = await (await fetch(`/api/ticker/${TICKER}?eq=${EQ}`)).json();
  if(d.error){ document.getElementById('head').innerHTML=`<span class="err">${d.error}</span>`; return; }
  document.getElementById('head').innerHTML =
    `<span class="chip ${(d.recommendation||'').replace(/\\s/g,'')}">${d.recommendation}</span> · ${money2(d.price)} · conviction ${d.conviction.toFixed(0)}/100`;

  const plan=(d.plan||[]).map(p=>`<li>${p}</li>`).join('');
  document.getElementById('planbox').innerHTML = `<div class="card">
    <div class="econ">
      <div><div class="k">Buy</div>${d.shares} sh · ${money(d.cost)}</div>
      <div><div class="k">Entry</div>${money2(d.entry)}</div>
      <div><div class="k">Stop (−${d.risk_pct}%)</div><span class="red">${money2(d.stop)}</span></div>
      <div><div class="k">Target (+${d.reward_pct}%)</div><span class="green">${money2(d.target)}</span></div>
      <div><div class="k">Risk / Reward</div><span class="red">${money(d.risk_dollars)}</span> / <span class="green">${money(d.reward_dollars)}</span> (1:${d.risk_reward.toFixed(1)})</div>
      <div><div class="k">Expected value</div><span class="${d.ev_dollars>=0?'green':'red'}">${money(d.ev_dollars)} (${d.ev_pct.toFixed(1)}%)</span></div>
    </div>
    <ol class="plan">${plan}</ol></div>`;

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
    `<tr><td>${h.date}</td><td><span class="chip ${h.action}">${h.action}</span></td><td class="num">${money2(h.price)}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="meta">no signals in range</td></tr>';

  document.getElementById('foot').textContent = `as of ${d.asof} · equation set ${d.equation_set} · ${st.trades} historical trades`;
  drawCharts(d);
}
load(); setInterval(load, __REFRESH__*1000);
</script></body></html>"""
