"""
webapp.py
=========

A lightweight Flask web UI for **signals-only** mode — the "what / when / how to
buy" dashboard.

A background thread re-scans every ``WEB_REFRESH_SECONDS`` and stores the latest
results; the browser polls ``/api/signals`` and re-renders. No broker, no orders
— it reads free yfinance data and shows ranked, actionable signals.

Run it::

    python main.py web
    # then open http://127.0.0.1:5000
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
    """Runs the scanner on a background thread and caches the latest results."""

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
            except Exception as exc:  # pragma: no cover - defensive
                log.exception("scan loop error")
                with self._lock:
                    self._status = "error"
                    self._error = str(exc)
            self._stop.wait(max(5, self.config.web_refresh_seconds))

    def snapshot(self) -> Dict:
        with self._lock:
            return {
                "status": self._status,
                "updated": self._updated,
                "error": self._error,
                "mode": "live" if self.config.is_live else "paper",
                "ai_enabled": bool(self.scanner.briefer and self.scanner.briefer.enabled),
                "config": {
                    "equation_set": self.config.equation_set,
                    "lookback": self.config.lookback_length,
                    "interval": self.config.interval,
                    "account_size": self.config.account_size,
                    "stop_loss_pct": self.config.stop_loss_pct,
                    "take_profit_pct": self.config.take_profit_pct,
                    "tickers": self.config.tickers,
                },
                "signals": [_signal_json(s) for s in self._signals],
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
        from flask import Flask, jsonify, render_template_string
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("Flask is required for the web UI: pip install flask") from exc

    from ai_brief import AIBriefer

    app = Flask(__name__)
    service = ScannerService(config, briefer=AIBriefer(config))
    service.start()

    @app.route("/")
    def index():
        return render_template_string(_PAGE, refresh=config.web_refresh_seconds)

    @app.route("/api/signals")
    def api_signals():
        return jsonify(service.snapshot())

    app.scanner_service = service  # for tests / shutdown
    return app


def run(config=CONFIG) -> None:
    app = create_app(config)
    log.info("starting web UI at http://%s:%d (Ctrl-C to stop)",
             config.web_host, config.web_port)
    app.run(host=config.web_host, port=config.web_port, threaded=True)


# --------------------------------------------------------------------------- #
# Front-end (single-page, polls /api/signals)
# --------------------------------------------------------------------------- #
_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HP Analytics — Signal Dashboard</title>
<style>
  :root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--fg:#e6edf3;--muted:#8b949e;
        --green:#3fb950;--red:#f85149;--amber:#d29922;--blue:#58a6ff;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
       font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  header{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;
         align-items:center;gap:16px;flex-wrap:wrap;background:var(--panel)}
  header h1{font-size:18px;margin:0}
  .meta{color:var(--muted);font-size:12px}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
  .dot.ok{background:var(--green)} .dot.scanning{background:var(--amber)} .dot.error{background:var(--red)}
  .wrap{padding:20px 24px;max-width:1280px;margin:0 auto}
  .disclaimer{background:rgba(210,153,34,.1);border:1px solid var(--amber);color:#e3b341;
              padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:18px}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:24px 0 10px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px}
  .card.strong{border-color:var(--green);box-shadow:0 0 0 1px rgba(63,185,80,.4)}
  .card .top{display:flex;justify-content:space-between;align-items:baseline}
  .tk{font-size:20px;font-weight:700}
  .px{color:var(--muted)}
  .chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.03em}
  .chip.STRONGBUY{background:var(--green);color:#06210f}
  .chip.BUY{background:rgba(63,185,80,.2);color:var(--green);border:1px solid var(--green)}
  .chip.HOLD{background:rgba(88,166,255,.15);color:var(--blue);border:1px solid var(--blue)}
  .chip.WAIT{background:rgba(139,148,158,.15);color:var(--muted);border:1px solid var(--border)}
  .chip.SELL,.chip.STRONGSELL{background:rgba(248,81,73,.18);color:var(--red);border:1px solid var(--red)}
  .agree{font-size:11px;color:var(--green);margin-left:6px}
  .bar{height:6px;border-radius:3px;background:#21262d;margin:10px 0 4px;overflow:hidden}
  .bar>span{display:block;height:100%;background:linear-gradient(90deg,#1f6feb,#3fb950)}
  .levels{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;font-size:12px}
  .levels div span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase}
  .lvl-stop{color:var(--red)} .lvl-tgt{color:var(--green)}
  .eq{font-size:11px;color:var(--muted);margin-top:8px}
  .brief{margin-top:10px;padding:10px;background:#0d1117;border:1px solid var(--border);
         border-radius:6px;font-size:12px;white-space:pre-wrap}
  .brief b{color:var(--blue)}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--border)}
  th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  .err{color:var(--red)}
  .foot{color:var(--muted);font-size:11px;margin-top:24px}
</style>
</head>
<body>
<header>
  <h1>🦙 HP Analytics — Signal Dashboard</h1>
  <span class="meta" id="status"><span class="dot scanning"></span>loading…</span>
  <span class="meta" id="cfg"></span>
  <span class="meta" style="margin-left:auto" id="updated"></span>
</header>
<div class="wrap">
  <div class="disclaimer">⚠️ Educational signals only — not financial advice. The
    system tells you what its formulas flag; you decide and place any trades. No
    strategy guarantees profit. Backtested "edge" is historical, not a forecast.</div>

  <h2>Top Buys</h2>
  <div class="cards" id="topbuys"></div>

  <h2>All Tickers</h2>
  <table id="alltable">
    <thead><tr>
      <th>Ticker</th><th>Signal</th><th>Conv.</th><th class="num">Price</th>
      <th class="num">Entry</th><th class="num">Stop</th><th class="num">Target</th>
      <th class="num">Shares</th><th>Eq1 / Eq2</th><th>Edge (eq1)</th>
    </tr></thead>
    <tbody id="allbody"></tbody>
  </table>
  <div class="foot" id="foot"></div>
</div>
<script>
const REFRESH = {{ refresh }} * 1000;
const money = x => x==null ? '—' : '$' + Number(x).toLocaleString(undefined,{maximumFractionDigits:2});
const pct = x => (x*100).toFixed(0) + '%';
const cls = r => (r||'').replace(/\\s/g,'');

function briefHTML(t){
  if(!t) return '';
  return t.replace(/(Rationale:|Risk check:|Caution:)/g,'<b>$1</b>');
}

function card(s){
  const strong = s.recommendation==='STRONG BUY' ? ' strong':'';
  const agree = s.agree ? '<span class="agree">✓ both agree</span>':'';
  const brief = s.ai_brief ? `<div class="brief">${briefHTML(s.ai_brief)}</div>`:'';
  return `<div class="card${strong}">
    <div class="top"><span class="tk">${s.ticker}</span>
      <span><span class="chip ${cls(s.recommendation)}">${s.recommendation}</span>${agree}</span></div>
    <div class="px">${money(s.price)} · conviction ${s.conviction.toFixed(0)}/100</div>
    <div class="bar"><span style="width:${s.conviction}%"></span></div>
    <div class="levels">
      <div><span>Entry</span>${money(s.entry)}</div>
      <div><span>Stop</span><span class="lvl-stop">${money(s.stop)}</span></div>
      <div><span>Target</span><span class="lvl-tgt">${money(s.target)}</span></div>
    </div>
    <div class="eq">Buy ${s.shares} sh (${money(s.notional)}) · eq1 ${s.eq1?s.eq1.stance:'–'} / eq2 ${s.eq2?s.eq2.stance:'–'}</div>
    ${brief}
  </div>`;
}

function row(s){
  if(s.error) return `<tr><td>${s.ticker}</td><td colspan="9" class="err">${s.error}</td></tr>`;
  const edge = s.eq1 ? `${pct(s.eq1.edge_win_rate)} win · ${s.eq1.edge_return_pct>=0?'+':''}${s.eq1.edge_return_pct.toFixed(0)}% (${s.eq1.edge_trades}t)` : '—';
  return `<tr>
    <td><b>${s.ticker}</b></td>
    <td><span class="chip ${cls(s.recommendation)}">${s.recommendation}</span></td>
    <td>${s.conviction.toFixed(0)}</td>
    <td class="num">${money(s.price)}</td>
    <td class="num">${money(s.entry)}</td>
    <td class="num lvl-stop">${money(s.stop)}</td>
    <td class="num lvl-tgt">${money(s.target)}</td>
    <td class="num">${s.shares}</td>
    <td>${s.eq1?s.eq1.stance:'–'} / ${s.eq2?s.eq2.stance:'–'}</td>
    <td>${edge}</td>
  </tr>`;
}

async function tick(){
  try{
    const r = await fetch('/api/signals'); const d = await r.json();
    const dot = d.status==='ok'?'ok':(d.status==='error'?'error':'scanning');
    document.getElementById('status').innerHTML =
      `<span class="dot ${dot}"></span>${d.status}${d.error?': '+d.error:''}`;
    const c = d.config;
    document.getElementById('cfg').textContent =
      `eq${c.equation_set} · lookback ${c.lookback} · ${c.interval} · acct ${money(c.account_size)}`
      + (d.ai_enabled?' · AI on':'');
    document.getElementById('updated').textContent = d.updated ? 'updated '+d.updated : '';
    const buys = d.signals.filter(s=>s.is_buy && !s.error);
    document.getElementById('topbuys').innerHTML =
      buys.length ? buys.map(card).join('') :
      '<div class="card"><div class="px">No fresh buy signals right now.</div></div>';
    document.getElementById('allbody').innerHTML = d.signals.map(row).join('');
    document.getElementById('foot').textContent =
      `${d.signals.length} tickers monitored · refreshing every ${REFRESH/1000}s · mode ${d.mode}`;
  }catch(e){
    document.getElementById('status').innerHTML='<span class="dot error"></span>fetch error';
  }
}
tick(); setInterval(tick, REFRESH);
</script>
</body>
</html>"""
