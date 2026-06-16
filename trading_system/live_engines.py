"""
live_engines.py
===============

Two **specialised background engines** that sit alongside the equity scanner:

* :class:`CryptoEngine` — DexScreener (on-chain DEX pairs), via ``dexscreener``.
* :class:`PolymarketEngine` — Polymarket prediction markets, via ``polymarket``.

Each owns its own scan thread, status, version counter and snapshot — the same
contract the equity ``ScannerService`` exposes (so the web layer treats them
uniformly, incl. SSE-style ``wait_for_update``). They are **read-only/analysis**:
they rank live opportunities; they do not place on-chain or Polygon orders.

All scanning is best-effort and never raises out of the loop, so a feed being
down (or no network) just yields an empty, clearly-flagged snapshot.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Dict, Optional

log = logging.getLogger("feeds")


class FeedEngine:
    """Base background engine: scan loop + thread-safe snapshot + version signal."""

    name = "feed"

    def __init__(self, interval: int = 45):
        self.interval = max(15, int(interval))
        self._lock = threading.Lock()
        self._cv = threading.Condition(self._lock)
        self._data: Dict = {}
        self._status = "starting"
        self._updated: Optional[str] = None
        self._error: Optional[str] = None
        self._version = 0
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # -- lifecycle --------------------------------------------------------- #
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, daemon=True, name=f"{self.name}-engine")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _scan(self) -> Dict:  # pragma: no cover - overridden
        raise NotImplementedError

    def _loop(self) -> None:
        while not self._stop.is_set():
            with self._lock:
                self._status = "scanning"
            try:
                data = self._scan() or {}
                with self._lock:
                    self._data = data
                    self._status = "ok"
                    self._error = data.get("error")
                    self._updated = time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime())
                    self._version += 1
                    self._cv.notify_all()
            except Exception as exc:  # pragma: no cover - defensive
                log.exception("%s engine scan error", self.name)
                with self._lock:
                    self._status = "error"
                    self._error = str(exc)
                    self._version += 1
                    self._cv.notify_all()
            self._stop.wait(self.interval)

    # -- read side --------------------------------------------------------- #
    def version(self) -> int:
        with self._lock:
            return self._version

    def wait_for_update(self, last_version: int, timeout: float) -> int:
        with self._cv:
            if self._version == last_version:
                self._cv.wait(timeout)
            return self._version

    def snapshot(self) -> Dict:
        with self._lock:
            base = {"status": self._status, "updated": self._updated,
                    "error": self._error, "version": self._version}
            base.update(self._data)
            return base


class CryptoEngine(FeedEngine):
    name = "crypto"

    def __init__(self, tokens=None, interval: int = 45):
        super().__init__(interval)
        self.tokens = tokens or None

    def _scan(self) -> Dict:
        import dexscreener
        return dexscreener.crypto_scan(tokens=self.tokens)


class PolymarketEngine(FeedEngine):
    name = "polymarket"

    def __init__(self, limit: int = 40, interval: int = 60):
        super().__init__(interval)
        self.limit = int(limit)

    def _scan(self) -> Dict:
        import polymarket
        return polymarket.market_scan(limit=self.limit)
