"""
apiclient.py
============

Tiny, resilient JSON-over-HTTP helper shared by the live external feeds (the
DexScreener crypto engine and the Polymarket prediction-market engine).

Best-effort by design: returns ``(data, None)`` on success or
``(None, "error message")`` on any failure — it never raises, so the engines and
web layer can degrade gracefully (and stay usable offline / when a feed is down).
"""

from __future__ import annotations

from typing import Optional, Tuple

_UA = "HP-Analytics-Trading/1.0 (+https://github.com/vastrixcoder/politicon)"


def get_json(url: str, params: Optional[dict] = None, timeout: float = 12.0,
             headers: Optional[dict] = None) -> Tuple[Optional[object], Optional[str]]:
    """GET ``url`` and parse JSON. Returns ``(data, error)``; never raises."""
    try:
        import requests
    except Exception:  # pragma: no cover - dependency guard
        return None, "the 'requests' package is required for live feeds"
    try:
        resp = requests.get(
            url,
            params=params or {},
            timeout=timeout,
            headers={"User-Agent": _UA, "Accept": "application/json", **(headers or {})},
        )
    except Exception as exc:  # network/DNS/timeout
        return None, f"network error: {exc}"
    if resp.status_code != 200:
        return None, f"HTTP {resp.status_code} from {url}"
    try:
        return resp.json(), None
    except Exception as exc:
        return None, f"bad JSON: {exc}"
