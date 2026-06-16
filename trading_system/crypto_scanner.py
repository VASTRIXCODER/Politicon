"""
crypto_scanner.py
=================

The **crypto engine's algorithm** — separate from both the equity strategy and
the Polymarket engine. Mirrors the equity ``scanner.py``: a categorised universe
(like the equity sector groups) plus a transparent, multi-factor signal computed
from live DexScreener data (``dexscreener.py`` is the data client).

The composite signal blends four readable components, each surfaced for the UI:

* **momentum**  — recency-weighted price change (5m / 1h / 6h / 24h)
* **pressure**  — 24h buy vs sell transaction balance
* **turnover**  — 24h volume / liquidity (how fast the pool is changing hands)
* **liquidity** — a tier gate (thin pools are penalised, illiquid ones dropped)

Nothing here places on-chain orders; it ranks opportunities for display.
"""

from __future__ import annotations

from typing import Dict, List, Optional

import dexscreener as dx

# --------------------------------------------------------------------------- #
# Universe — categorised (the crypto analogue of the equity sector groups).
# --------------------------------------------------------------------------- #
CRYPTO_UNIVERSE = {
    "Layer 1": ["SOL", "ETH", "BNB", "AVAX", "ADA", "SUI", "APT", "SEI",
                "TON", "NEAR", "TRX", "DOT", "ATOM", "INJ", "TIA"],
    "Layer 2": ["ARB", "OP", "MATIC", "STRK", "MNT", "METIS", "ZK"],
    "DeFi": ["UNI", "AAVE", "LINK", "MKR", "LDO", "JUP", "RAY", "PENDLE",
             "ENA", "CRV", "SNX", "DYDX", "CAKE"],
    "Memecoins": ["DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI", "BRETT",
                  "POPCAT", "MEW", "TURBO", "FARTCOIN", "MOG"],
    "AI": ["FET", "RENDER", "TAO", "WLD", "AR", "GRT", "AKT", "VIRTUAL", "AI16Z"],
    "Gaming / NFT": ["IMX", "GALA", "SAND", "MANA", "AXS", "RON", "APE", "BLUR"],
    "Infra / Oracle": ["PYTH", "JTO", "RUNE", "KAS", "FIL", "HNT"],
}

# Flatten (de-duped, first category wins) + ticker -> category map.
def _build_universe():
    order: List[str] = []
    cat_of: Dict[str, str] = {}
    for cat, toks in CRYPTO_UNIVERSE.items():
        for t in toks:
            if t not in cat_of:
                cat_of[t] = cat
                order.append(t)
    return order, cat_of


DEFAULT_TOKENS, CATEGORY_OF = _build_universe()

_REC_RANK = {"STRONG BUY": 0, "BUY": 1, "HOLD": 2, "SELL": 3, "STRONG SELL": 4}


# --------------------------------------------------------------------------- #
# Signal
# --------------------------------------------------------------------------- #
def _signal(n: Dict) -> Dict:
    """Multi-factor composite -> recommendation, conviction + component breakdown."""
    # 1) recency-weighted momentum (%)
    momentum = (0.40 * n["change_h1"] + 0.30 * n["change_h6"]
                + 0.20 * n["change_h24"] + 0.10 * n["change_m5"])

    # 2) buy/sell pressure (-1 .. +1 -> scaled later)
    total_tx = n["buys24"] + n["sells24"]
    buy_ratio = (n["buys24"] / total_tx) if total_tx else 0.5
    pressure = (buy_ratio - 0.5) * 2.0

    # 3) turnover: 24h volume / liquidity (capped so a tiny pool can't dominate)
    turnover = (n["volume24"] / n["liquidity"]) if n["liquidity"] > 0 else 0.0
    turnover = min(turnover, 6.0)

    # Composite (momentum dominates; pressure & turnover are confirming tilts).
    score = momentum + pressure * 8.0 + turnover * 1.2

    if score >= 9 and n["change_h24"] > 0:
        rec = "STRONG BUY"
    elif score >= 3.5:
        rec = "BUY"
    elif score <= -9:
        rec = "STRONG SELL"
    elif score <= -3.5:
        rec = "SELL"
    else:
        rec = "HOLD"

    reason = (f"momentum {momentum:+.1f}% (1h {n['change_h1']:+.1f}/24h {n['change_h24']:+.1f}), "
              f"{buy_ratio*100:.0f}% buys of {total_tx} tx, turnover {turnover:.1f}x")
    return {
        "score": round(score, 2),
        "recommendation": rec,
        "conviction": round(min(100.0, abs(score) * 5.5), 0),
        "buy_ratio": round(buy_ratio, 3),
        "components": {
            "momentum": round(momentum, 2),
            "pressure": round(pressure * 8.0, 2),
            "turnover": round(turnover, 2),
        },
        "reason": reason,
    }


def crypto_scan(tokens: Optional[List[str]] = None, min_liquidity: float = 25_000.0,
                limit: int = 80) -> Dict:
    """Scan the categorised universe and rank opportunities.

    Returns ``{items, categories, scanned, errors, thin}`` — items carry the
    normalised pair, its signal, the component breakdown and category, sorted by
    recommendation strength then conviction.
    """
    toks = tokens if tokens else DEFAULT_TOKENS
    items: List[Dict] = []
    errors = thin = 0
    for tok in toks[:limit]:
        raw, err = dx.search_raw(tok)
        if err:
            errors += 1
            continue
        best = dx.best_pair(raw)
        if not best:
            continue
        if best["liquidity"] < min_liquidity:
            thin += 1
            continue
        best.update(_signal(best))
        best["query"] = tok
        best["category"] = CATEGORY_OF.get(str(tok).upper(), "Other")
        items.append(best)

    items.sort(key=lambda x: (_REC_RANK.get(x["recommendation"], 2), -x["conviction"]))

    categories: Dict[str, int] = {}
    for it in items:
        categories[it["category"]] = categories.get(it["category"], 0) + 1

    return {
        "items": items,
        "categories": categories,
        "scanned": len(toks),
        "errors": errors,
        "thin": thin,
    }
