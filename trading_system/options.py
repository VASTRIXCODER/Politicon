"""
options.py
==========

Lightweight options-chain summary via yfinance (Yahoo data — the same source
the rest of the signals-only mode uses).

Powers the web detail page's **options-flow panel**: nearest-expiry call/put
volume, the put/call ratio (a quick directional-positioning read), and the most
active strikes by volume. Network-dependent and **best-effort**: every public
function returns a plain dict and never raises, so the web layer can render an
error string instead of 500-ing.
"""

from __future__ import annotations

from typing import Dict, Optional


def _f(x, default: float = 0.0) -> float:
    try:
        v = float(x)
        return v if v == v else default  # NaN guard
    except (TypeError, ValueError):
        return default


def _i(x) -> int:
    return int(_f(x))


def options_summary(symbol: str, expiry: Optional[str] = None, top: int = 6) -> Dict:
    """Summarise the nearest (or requested) options expiry for ``symbol``.

    Returns a dict with the expiry list, aggregate call/put volume, the
    put/call volume ratio, and the top-``top`` most active call & put strikes.
    On any problem returns ``{"error": "..."}``.
    """
    try:
        import yfinance as yf
    except Exception:  # pragma: no cover - import guard
        return {"error": "yfinance is not installed"}

    try:
        tkr = yf.Ticker(symbol)
        expiries = list(getattr(tkr, "options", []) or [])
        if not expiries:
            return {"error": f"no listed options for {symbol.upper()}"}
        exp = expiry if expiry in expiries else expiries[0]
        chain = tkr.option_chain(exp)
        calls, puts = chain.calls, chain.puts

        def top_rows(df, side: str):
            rows = []
            if df is None or len(df) == 0:
                return rows
            ordered = df.sort_values("volume", ascending=False).head(top)
            for _, r in ordered.iterrows():
                rows.append({
                    "side": side,
                    "strike": _f(r.get("strike")),
                    "last": _f(r.get("lastPrice")),
                    "bid": _f(r.get("bid")),
                    "ask": _f(r.get("ask")),
                    "volume": _i(r.get("volume")),
                    "open_interest": _i(r.get("openInterest")),
                    "iv": round(_f(r.get("impliedVolatility")) * 100, 1),
                    "itm": bool(r.get("inTheMoney")),
                })
            return rows

        cv = _f(calls["volume"].fillna(0).sum()) if "volume" in calls else 0.0
        pv = _f(puts["volume"].fillna(0).sum()) if "volume" in puts else 0.0
        pcr = round(pv / cv, 2) if cv else None
        return {
            "symbol": symbol.upper(),
            "expiry": exp,
            "expiries": expiries[:12],
            "call_volume": int(cv),
            "put_volume": int(pv),
            "put_call_ratio": pcr,
            "bias": _bias(pcr),
            "calls": top_rows(calls, "call"),
            "puts": top_rows(puts, "put"),
        }
    except Exception as exc:  # pragma: no cover - network/shape guard
        return {"error": f"options lookup failed: {exc}"}


def _bias(put_call_ratio) -> str:
    """A coarse read on the put/call volume ratio."""
    if put_call_ratio is None:
        return "n/a"
    if put_call_ratio >= 1.3:
        return "bearish (heavy put volume)"
    if put_call_ratio <= 0.6:
        return "bullish (heavy call volume)"
    return "balanced"
