"""
polymarket_scanner.py
=====================

The **Polymarket engine's algorithm** — separate from the equity strategy and
the crypto engine. Mirrors the equity ``scanner.py``: it takes normalised
markets from the ``polymarket.py`` data client, categorises them (Gamma category
or keyword inference), classifies each market, flags movers and
closing-soon markets, and groups everything for the dashboard.

Read-only: it ranks/labels live markets; it never places Polymarket orders.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List

import polymarket as pm

# Keyword inference when Gamma doesn't give us a category/tag.
_CATEGORY_KEYWORDS = {
    "Politics": ["president", "election", "senate", "congress", "trump", "biden",
                 "vote", "primary", "governor", "poll", "house", "parliament", "minister"],
    "Crypto": ["bitcoin", "btc", "ethereum", "eth", "crypto", "solana", "$", "token", "coin", "etf"],
    "Sports": ["nba", "nfl", "super bowl", "world cup", "champion", " vs ", "match",
               "ufc", "mlb", "premier league", "playoff", "win the", "finals"],
    "Economy": ["fed", "rate cut", "rate hike", "inflation", "cpi", "gdp",
                "recession", "jobs", "unemployment", "interest rate"],
    "Tech / AI": ["ai", "openai", "gpt", "apple", "tesla", "google", "launch", "model", "chip"],
    "Pop Culture": ["movie", "oscar", "grammy", "album", "box office", "celebrity", "song"],
}


def _categorise(market: Dict) -> str:
    if market.get("category"):
        return str(market["category"]).title()
    q = (market.get("question") or "").lower()
    for cat, words in _CATEGORY_KEYWORDS.items():
        if any(w in q for w in words):
            return cat
    return "Other"


def _classify(top_prob: float, change24: float) -> str:
    if abs(change24) >= 0.08:
        return "BIG MOVER"
    if top_prob >= 0.90:
        return "CONSENSUS"
    if top_prob >= 0.60:
        return "LEANING"
    return "TOSS-UP"


def _days_left(end_date: str):
    if not end_date:
        return None
    try:
        end = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return (end - datetime.now(timezone.utc)).days
    except Exception:
        return None


def market_scan(limit: int = 100) -> Dict:
    """Scan open markets; categorise, classify and group for the UI.

    Returns ``{items, movers, closing_soon, categories, count}`` (or
    ``{..., error}`` when offline). ``items`` are ranked by total volume.
    """
    res = pm.list_markets(limit=limit)
    if res.get("error"):
        return {"items": [], "movers": [], "closing_soon": [], "categories": {},
                "count": 0, "error": res["error"]}

    items: List[Dict] = []
    for m in res["items"]:
        m = dict(m)
        m["category"] = _categorise(m)
        m["signal"] = _classify(m["top_prob"], m["change24"])
        dl = _days_left(m["end_date"])
        m["days_left"] = dl
        m["closing_soon"] = dl is not None and 0 <= dl <= 7
        items.append(m)

    movers = sorted([x for x in items if x["signal"] == "BIG MOVER"],
                    key=lambda x: abs(x["change24"]), reverse=True)[:8]
    closing = sorted([x for x in items if x["closing_soon"]],
                     key=lambda x: x["volume"], reverse=True)[:8]
    categories: Dict[str, int] = {}
    for x in items:
        categories[x["category"]] = categories.get(x["category"], 0) + 1

    return {
        "items": items,
        "movers": movers,
        "closing_soon": closing,
        "categories": categories,
        "count": len(items),
    }
