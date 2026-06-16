"""
polymarket.py
=============

Prediction-market data + signal layer powered by **Polymarket's** public
**Gamma API** (https://gamma-api.polymarket.com) — the same data the Polymarket
MCP server wraps. No API key required for read-only market data.

The running app can't call the MCP (agent-side only), so it queries the public
Gamma API directly. Best-effort: every function returns plain dicts and never
raises, so the Polymarket engine + web layer degrade gracefully offline.

This surfaces *opportunities*, not trades: the most active markets, the implied
probability of each, 24h moves, and a coarse classification (toss-up / leaning /
consensus / big mover). Placing real orders needs a funded Polygon wallet and is
intentionally NOT wired here.
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional

from apiclient import get_json

BASE = "https://gamma-api.polymarket.com"


def _f(x, default: float = 0.0) -> float:
    try:
        v = float(x)
        return v if v == v else default
    except (TypeError, ValueError):
        return default


def _as_list(value) -> List:
    """Gamma returns ``outcomes`` / ``outcomePrices`` as JSON *strings*."""
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def _signal(top_prob: float, change24: float) -> str:
    if abs(change24) >= 0.08:
        return "BIG MOVER"
    if top_prob >= 0.90:
        return "CONSENSUS"
    if top_prob >= 0.60:
        return "LEANING"
    return "TOSS-UP"


def _norm_market(m: dict) -> Optional[Dict]:
    outcomes = [str(o) for o in _as_list(m.get("outcomes"))]
    prices = [_f(p) for p in _as_list(m.get("outcomePrices"))]
    if not outcomes or not prices or len(prices) != len(outcomes):
        return None
    top_i = max(range(len(prices)), key=lambda i: prices[i])
    top_prob = prices[top_i]
    change24 = _f(m.get("oneDayPriceChange"))
    volume = _f(m.get("volumeNum")) or _f(m.get("volume"))
    vol24 = _f(m.get("volume24hr")) or _f(m.get("volume24hrClob"))
    liquidity = _f(m.get("liquidityNum")) or _f(m.get("liquidity"))
    slug = m.get("slug") or ""
    return {
        "question": m.get("question") or m.get("title") or "?",
        "slug": slug,
        "url": f"https://polymarket.com/event/{slug}" if slug else "https://polymarket.com",
        "outcomes": outcomes,
        "prices": [round(p, 4) for p in prices],
        "top_outcome": outcomes[top_i],
        "top_prob": round(top_prob, 4),
        "volume": round(volume, 2),
        "volume24": round(vol24, 2),
        "liquidity": round(liquidity, 2),
        "change24": round(change24, 4),
        "end_date": (m.get("endDate") or "")[:10],
        "signal": _signal(top_prob, change24),
    }


def list_markets(limit: int = 40, active: bool = True) -> Dict:
    """Most-active open markets, normalised and ranked by total volume."""
    params = {
        "closed": "false",
        "active": "true" if active else "false",
        "archived": "false",
        "order": "volume",
        "ascending": "false",
        "limit": int(limit),
    }
    data, err = get_json(f"{BASE}/markets", params=params)
    if err:
        return {"items": [], "error": err}
    rows = data if isinstance(data, list) else (data or {}).get("data") or []
    items = [n for n in (_norm_market(m) for m in rows if isinstance(m, dict)) if n]
    items.sort(key=lambda x: x["volume"], reverse=True)
    return {"items": items[:limit], "count": len(items)}


def market_scan(limit: int = 40) -> Dict:
    """Scan open markets and split out the biggest movers for quick reads."""
    res = list_markets(limit=limit)
    if res.get("error"):
        return {"items": [], "movers": [], "error": res["error"]}
    items = res["items"]
    movers = sorted([x for x in items if x["signal"] == "BIG MOVER"],
                    key=lambda x: abs(x["change24"]), reverse=True)[:8]
    return {"items": items, "movers": movers, "count": len(items)}


def market_detail(slug: str) -> Dict:
    """A single market by slug (for a look-up box)."""
    data, err = get_json(f"{BASE}/markets", params={"slug": slug, "limit": 1})
    if err:
        return {"error": err}
    rows = data if isinstance(data, list) else (data or {}).get("data") or []
    for m in rows:
        n = _norm_market(m) if isinstance(m, dict) else None
        if n:
            return n
    return {"error": f"no market for slug '{slug}'"}
