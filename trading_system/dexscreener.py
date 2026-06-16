"""
dexscreener.py
==============

**Data client** for the DexScreener public REST API
(https://docs.dexscreener.com/api/reference) — the same data the DexScreener MCP
wraps. No API key. This module ONLY fetches + normalises pairs; the crypto
*algorithm* (universe, scoring, ranking) lives in ``crypto_scanner.py`` — exactly
the way the equity stack splits ``data.py`` (fetch) from ``scanner.py`` (logic).

Best-effort: every function returns plain data and never raises, so the crypto
engine and web layer degrade gracefully when a feed is down / offline.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from apiclient import get_json

BASE = "https://api.dexscreener.com"

# Quote symbols we treat as "USD" when choosing a canonical pair.
STABLES = {"USDC", "USDT", "DAI", "USD", "USDC.E", "FDUSD", "TUSD", "USDE", "USDBC"}


def _f(x, default: float = 0.0) -> float:
    try:
        v = float(x)
        return v if v == v else default  # NaN guard
    except (TypeError, ValueError):
        return default


def norm_pair(p: dict) -> Dict:
    """Normalise one raw DexScreener pair object into a tidy dict."""
    base = p.get("baseToken") or {}
    quote = p.get("quoteToken") or {}
    txns = (p.get("txns") or {}).get("h24") or {}
    pc = p.get("priceChange") or {}
    vol = p.get("volume") or {}
    liq = p.get("liquidity") or {}
    return {
        "symbol": (base.get("symbol") or "?") + "/" + (quote.get("symbol") or "?"),
        "base_symbol": base.get("symbol") or "?",
        "name": base.get("name") or base.get("symbol") or "?",
        "chain": p.get("chainId") or "?",
        "dex": p.get("dexId") or "?",
        "price_usd": _f(p.get("priceUsd")),
        "liquidity": _f(liq.get("usd")),
        "volume24": _f(vol.get("h24")),
        "volume6": _f(vol.get("h6")),
        "volume1": _f(vol.get("h1")),
        "change_m5": _f(pc.get("m5")),
        "change_h1": _f(pc.get("h1")),
        "change_h6": _f(pc.get("h6")),
        "change_h24": _f(pc.get("h24")),
        "buys24": int(_f(txns.get("buys"))),
        "sells24": int(_f(txns.get("sells"))),
        "fdv": _f(p.get("fdv")),
        "market_cap": _f(p.get("marketCap")),
        "url": p.get("url") or "",
        "pair_address": p.get("pairAddress") or "",
        "base_address": base.get("address") or "",
        "quote_symbol": quote.get("symbol") or "?",
        # DexScreener's own embeddable chart (used to render the pair *in-app*).
        "embed_url": (f"https://dexscreener.com/{p.get('chainId')}/{p.get('pairAddress')}"
                      "?embed=1&theme=dark&info=0&trades=0"
                      if p.get("chainId") and p.get("pairAddress") else ""),
    }


def best_pair(raw_pairs: List[dict]) -> Optional[Dict]:
    """Most liquid pair (preferring a USD-stable quote), normalised."""
    norm = [norm_pair(p) for p in raw_pairs if isinstance(p, dict)]
    if not norm:
        return None
    stable = [n for n in norm if n["quote_symbol"].upper() in STABLES]
    return max(stable or norm, key=lambda n: n["liquidity"])


def search_raw(query: str) -> Tuple[List[dict], Optional[str]]:
    """Raw (un-normalised) DexScreener pairs for a query."""
    data, err = get_json(f"{BASE}/latest/dex/search", params={"q": query})
    if err:
        return [], err
    return ((data or {}).get("pairs") or []), None


def search(query: str) -> Tuple[List[Dict], Optional[str]]:
    """Normalised pairs for a query (symbol, name or token address)."""
    raw, err = search_raw(query)
    if err:
        return [], err
    return [norm_pair(p) for p in raw if isinstance(p, dict)], None


def search_top(query: str, limit: int = 12) -> Tuple[List[Dict], Optional[str]]:
    """Top normalised pairs for a query by liquidity (for the look-up box)."""
    pairs, err = search(query)
    if err:
        return [], err
    pairs.sort(key=lambda n: n["liquidity"], reverse=True)
    return pairs[:limit], None
