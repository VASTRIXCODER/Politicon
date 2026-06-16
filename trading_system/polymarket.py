"""
polymarket.py
=============

**Data client** for Polymarket's public **Gamma API**
(https://gamma-api.polymarket.com) — the same data the Polymarket MCP wraps. No
API key for read-only market data. This module ONLY fetches + normalises
markets; the prediction-market *algorithm* (categorisation, scoring, grouping)
lives in ``polymarket_scanner.py`` — mirroring the equity ``data.py`` /
``scanner.py`` split.

Best-effort: returns plain data, never raises, so the engine + web degrade
gracefully offline.
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


def norm_market(m: dict) -> Optional[Dict]:
    """Normalise one raw Gamma market; ``None`` if it has no usable prices."""
    outcomes = [str(o) for o in _as_list(m.get("outcomes"))]
    prices = [_f(p) for p in _as_list(m.get("outcomePrices"))]
    if not outcomes or not prices or len(prices) != len(outcomes):
        return None
    top_i = max(range(len(prices)), key=lambda i: prices[i])
    slug = m.get("slug") or ""
    tags = m.get("tags") or []
    if isinstance(tags, list):
        tags = [str(t.get("label") if isinstance(t, dict) else t) for t in tags]
    return {
        "question": m.get("question") or m.get("title") or "?",
        "slug": slug,
        "url": f"https://polymarket.com/event/{slug}" if slug else "https://polymarket.com",
        "outcomes": outcomes,
        "prices": [round(p, 4) for p in prices],
        "top_outcome": outcomes[top_i],
        "top_prob": round(prices[top_i], 4),
        "volume": round(_f(m.get("volumeNum")) or _f(m.get("volume")), 2),
        "volume24": round(_f(m.get("volume24hr")) or _f(m.get("volume24hrClob")), 2),
        "liquidity": round(_f(m.get("liquidityNum")) or _f(m.get("liquidity")), 2),
        "change24": round(_f(m.get("oneDayPriceChange")), 4),
        "end_date": (m.get("endDate") or "")[:10],
        "category": (m.get("category") or (tags[0] if tags else "") or ""),
        "tags": tags[:5],
    }


def list_markets_raw(limit: int = 60, active: bool = True) -> tuple:
    """Raw Gamma markets (un-normalised), most-active first."""
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
        return [], err
    rows = data if isinstance(data, list) else (data or {}).get("data") or []
    return [m for m in rows if isinstance(m, dict)], None


def list_markets(limit: int = 60, active: bool = True) -> Dict:
    """Normalised, volume-ranked open markets."""
    raw, err = list_markets_raw(limit=limit, active=active)
    if err:
        return {"items": [], "error": err}
    items = [n for n in (norm_market(m) for m in raw) if n]
    items.sort(key=lambda x: x["volume"], reverse=True)
    return {"items": items[:limit], "count": len(items)}


def market_detail(slug: str) -> Dict:
    """A single market by slug (for a look-up box)."""
    data, err = get_json(f"{BASE}/markets", params={"slug": slug, "limit": 1})
    if err:
        return {"error": err}
    rows = data if isinstance(data, list) else (data or {}).get("data") or []
    for m in rows:
        n = norm_market(m) if isinstance(m, dict) else None
        if n:
            return n
    return {"error": f"no market for slug '{slug}'"}
