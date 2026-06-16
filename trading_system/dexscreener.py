"""
dexscreener.py
==============

Crypto market-data + signal layer powered by the **DexScreener** public REST API
(https://docs.dexscreener.com/api/reference) — the same data the DexScreener MCP
server wraps. No API key required.

The running app cannot call the MCP (that's an agent-side tool), so it talks to
the public API directly here. Everything is best-effort and returns plain dicts
(never raises) so the crypto engine + web layer degrade gracefully offline.

Signals are intentionally simple and transparent: a recency-weighted momentum of
the pair's price change plus a buy/sell-pressure tilt, gated by a minimum
liquidity. This is *not* the equity Pine strategy — it's a separate crypto read.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from apiclient import get_json

BASE = "https://api.dexscreener.com"

# A liquid default crypto universe (symbols DexScreener indexes well across DEXes).
DEFAULT_TOKENS = [
    "SOL", "ETH", "WBTC", "BONK", "WIF", "JUP", "JTO", "PYTH",
    "RAY", "PEPE", "DOGE", "SHIB", "LINK", "UNI", "AVAX", "ARB",
]

_STABLES = {"USDC", "USDT", "DAI", "USD", "USDC.E", "FDUSD", "TUSD", "USDE"}


def _f(x, default: float = 0.0) -> float:
    try:
        v = float(x)
        return v if v == v else default  # NaN guard
    except (TypeError, ValueError):
        return default


def _norm_pair(p: dict) -> Dict:
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
    }


def _best_pair(pairs: List[dict]) -> Optional[dict]:
    """Pick the most liquid pair, preferring a USD-stable quote."""
    norm = [_norm_pair(p) for p in pairs if isinstance(p, dict)]
    if not norm:
        return None
    stable = [n for n in norm if n["quote_symbol"].upper() in _STABLES]
    pool = stable or norm
    return max(pool, key=lambda n: n["liquidity"])


def _signal(n: Dict) -> Dict:
    """Recency-weighted momentum + buy-pressure tilt -> recommendation."""
    momentum = 0.5 * n["change_h1"] + 0.3 * n["change_h6"] + 0.2 * n["change_h24"]
    total_tx = n["buys24"] + n["sells24"]
    buy_ratio = (n["buys24"] / total_tx) if total_tx else 0.5
    score = momentum + (buy_ratio - 0.5) * 20.0

    if score >= 8 and n["change_h24"] > 0:
        rec = "STRONG BUY"
    elif score >= 3:
        rec = "BUY"
    elif score <= -8:
        rec = "STRONG SELL"
    elif score <= -3:
        rec = "SELL"
    else:
        rec = "HOLD"

    reason = (f"mom {momentum:+.1f}% (1h {n['change_h1']:+.1f} / 24h {n['change_h24']:+.1f}), "
              f"buys {buy_ratio*100:.0f}% of {total_tx} tx")
    return {
        "score": round(score, 2),
        "recommendation": rec,
        "conviction": round(min(100.0, abs(score) * 6.0), 0),
        "buy_ratio": round(buy_ratio, 3),
        "momentum": round(momentum, 2),
        "reason": reason,
    }


def _search_raw(query: str) -> Tuple[List[dict], Optional[str]]:
    """Raw DexScreener pairs for ``query`` (un-normalised API objects)."""
    data, err = get_json(f"{BASE}/latest/dex/search", params={"q": query})
    if err:
        return [], err
    return ((data or {}).get("pairs") or []), None


def search(query: str) -> Tuple[List[Dict], Optional[str]]:
    """Search DexScreener pairs for ``query`` (symbol, name or address)."""
    raw, err = _search_raw(query)
    if err:
        return [], err
    return [_norm_pair(p) for p in raw if isinstance(p, dict)], None


def search_top(query: str, limit: int = 12) -> Tuple[List[Dict], Optional[str]]:
    """Top pairs for ``query`` by liquidity (for the look-up box)."""
    pairs, err = search(query)
    if err:
        return [], err
    pairs.sort(key=lambda n: n["liquidity"], reverse=True)
    return pairs[:limit], None


def crypto_scan(tokens: Optional[List[str]] = None, min_liquidity: float = 25_000.0,
                limit: int = 40) -> Dict:
    """Scan the default (or given) crypto universe and rank opportunities.

    Returns ``{"items": [...], "errors": int}``; each item is a normalised pair
    plus its signal fields, sorted by recommendation strength then conviction.
    """
    toks = tokens or DEFAULT_TOKENS
    items: List[Dict] = []
    errors = 0
    for tok in toks[:limit]:
        raw, err = _search_raw(tok)
        if err:
            errors += 1
            continue
        best = _best_pair(raw)
        if not best or best["liquidity"] < min_liquidity:
            continue
        best.update(_signal(best))
        best["query"] = tok
        items.append(best)

    rank = {"STRONG BUY": 0, "BUY": 1, "HOLD": 2, "SELL": 3, "STRONG SELL": 4}
    items.sort(key=lambda x: (rank.get(x["recommendation"], 2), -x["conviction"]))
    return {"items": items, "errors": errors, "scanned": len(toks)}
