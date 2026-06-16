"""
market_extras.py
================

Optional **server-side** TradingView screener access for live market breadth
(top gainers/losers across the whole US market), via the third-party
``tradingview-screener`` package.

This is the runtime counterpart to the agent-side TradingView MCP: the Flask app
can't call the MCP, but it *can* query TradingView's screener directly if the
package is installed. It is **entirely optional** — without the package every
function degrades gracefully to an error dict with an install hint, and the UI
already covers live browsing via the embedded TradingView screener widget.

Enable with::

    pip install tradingview-screener
"""

from __future__ import annotations

from typing import Dict, List

_INSTALL_HINT = "pip install tradingview-screener"


def available() -> bool:
    try:
        import tradingview_screener  # noqa: F401
        return True
    except Exception:
        return False


def live_movers(direction: str = "gainers", limit: int = 25) -> Dict:
    """Top gainers/losers for the US market. Best-effort; never raises.

    Returns ``{"rows": [...]}`` on success or ``{"error": ..., "hint": ...}``.
    """
    try:
        from tradingview_screener import Query, col
    except Exception:
        return {"error": "tradingview-screener is not installed", "hint": _INSTALL_HINT}

    try:
        ascending = direction == "losers"
        _count, df = (
            Query()
            .select("name", "close", "change", "volume", "market_cap_basic")
            .where(col("market_cap_basic") > 2e9, col("volume") > 5e5)
            .order_by("change", ascending=ascending)
            .limit(int(limit))
            .get_scanner_data()
        )
        rows: List[Dict] = []
        for _, r in df.iterrows():
            rows.append({
                "ticker": str(r.get("name", "")).split(":")[-1],
                "price": round(float(r.get("close", 0) or 0), 2),
                "change_pct": round(float(r.get("change", 0) or 0), 2),
                "volume": int(float(r.get("volume", 0) or 0)),
            })
        return {"direction": direction, "rows": rows}
    except Exception as exc:  # pragma: no cover - network/shape guard
        return {"error": f"screener query failed: {exc}", "hint": _INSTALL_HINT}
