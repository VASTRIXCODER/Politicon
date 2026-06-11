"""
ai_brief.py
===========

**Optional, off-by-default** Claude "AI briefing" layer.

For a technical signal it returns a short plain-English rationale plus a
news/earnings risk-check (using Claude's server-side web search to look for
recent catalysts). It is **disabled** unless both:

* ``AI_BRIEFING=true`` in the environment, and
* ``ANTHROPIC_API_KEY`` is set.

Honesty contract: this annotates and risk-checks signals — it does **not**
predict prices or improve the quant edge. The system prompt instructs the model
accordingly. If anything fails (no key, web search unavailable, API error) the
briefer degrades gracefully and returns ``None`` so signals still display.

Built per Anthropic's current SDK guidance: prompt caching on the stable system
prompt, the volatile per-ticker data in the user turn, and the
``web_search_20250305`` server tool with a no-tools fallback.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, Optional

log = logging.getLogger("ai_brief")

# Stable system prompt (kept byte-for-byte constant so it can be prompt-cached).
_SYSTEM_PROMPT = """You are a risk-aware trading-signal briefer embedded in an \
automated technical-analysis system. You are given a single technical signal \
that was produced by a fixed quantitative formula (not by you).

Your job is to write a SHORT briefing with exactly these parts:
- Rationale: 1-2 plain-English sentences explaining what this technical setup \
means (e.g. momentum turning up over the lookback, RSI/rank divergence). Tie it \
to the numbers you were given.
- Risk check: Use web search to look for imminent catalysts for this ticker — \
upcoming or just-passed earnings, major news, analyst actions, or sector events \
in the last few days. State plainly if a catalyst could override the technical \
signal. If you find nothing notable, say so.
- Caution: one short line.

Hard rules:
- Do NOT predict the price or promise profit. You add context, not forecasts.
- Be concise: under 120 words total. Use the three labels above.
- This is informational only and not financial advice. Do not tell the user to \
buy or sell; the system already generated the signal.
- If web search returns nothing useful, still give the rationale and say the \
catalyst check was inconclusive."""

# Output cap is small — these briefings are short.
_MAX_TOKENS = 1024


class AIBriefer:
    """Wraps the Anthropic client with caching and graceful degradation."""

    def __init__(self, config):
        self.config = config
        self._client = None
        self._import_error: Optional[str] = None
        # tiny TTL cache so repeated scans don't re-bill the same signal
        self._cache: Dict[str, tuple[float, str]] = {}
        self._cache_ttl = 600  # seconds

    # ------------------------------------------------------------------ #
    @property
    def enabled(self) -> bool:
        return bool(self.config.ai_briefing and self.config.anthropic_api_key)

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            from anthropic import Anthropic
        except ImportError as exc:  # pragma: no cover - dependency guard
            self._import_error = (
                "the `anthropic` package is required for AI briefings "
                "(pip install anthropic)"
            )
            log.warning(self._import_error)
            return None
        self._client = Anthropic(api_key=self.config.anthropic_api_key)
        return self._client

    # ------------------------------------------------------------------ #
    def brief(self, signal: Dict) -> Optional[str]:
        """Return a short briefing string for a signal, or None if unavailable."""
        if not self.enabled:
            return None
        client = self._get_client()
        if client is None:
            return None

        cache_key = self._cache_key(signal)
        cached = self._cache.get(cache_key)
        if cached and (time.time() - cached[0]) < self._cache_ttl:
            return cached[1]

        prompt = self._format_signal(signal)
        text = self._call(client, prompt, use_web_search=True)
        if text is None:
            # Retry once without web search (it may be unavailable on the plan).
            text = self._call(client, prompt, use_web_search=False)
        if text:
            self._cache[cache_key] = (time.time(), text)
        return text

    # ------------------------------------------------------------------ #
    def _call(self, client, prompt: str, *, use_web_search: bool) -> Optional[str]:
        import anthropic

        kwargs = dict(
            model=self.config.anthropic_model,
            max_tokens=_MAX_TOKENS,
            system=[{
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": prompt}],
        )
        if use_web_search:
            kwargs["tools"] = [{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 3,
            }]

        try:
            messages = list(kwargs["messages"])
            for _ in range(4):  # allow a few server-tool continuations
                resp = client.messages.create(**{**kwargs, "messages": messages})
                if resp.stop_reason == "pause_turn":
                    # Server-side tool loop paused; resend to resume.
                    messages = messages + [{"role": "assistant", "content": resp.content}]
                    continue
                return self._extract_text(resp)
            return self._extract_text(resp)
        except anthropic.APIError as exc:
            level = logging.INFO if use_web_search else logging.WARNING
            log.log(level, "AI brief call failed (web_search=%s): %s", use_web_search, exc)
            return None
        except Exception as exc:  # never let the briefer crash a scan
            log.warning("AI brief unexpected error: %s", exc)
            return None

    @staticmethod
    def _extract_text(resp) -> Optional[str]:
        parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
        text = "\n".join(p.strip() for p in parts if p and p.strip())
        return text or None

    @staticmethod
    def _format_signal(s: Dict) -> str:
        return (
            "Technical signal to brief:\n"
            f"- Ticker: {s.get('ticker')}\n"
            f"- Recommendation: {s.get('recommendation')} "
            f"(conviction {s.get('conviction', 0):.0f}/100)\n"
            f"- Equation set(s): {s.get('equation_summary', 'n/a')}\n"
            f"- Last price: {s.get('price')}\n"
            f"- Suggested entry / stop / target: "
            f"{s.get('entry')} / {s.get('stop')} / {s.get('target')}\n"
            f"- Recent price action: {s.get('price_summary', 'n/a')}\n"
            f"- Backtest edge (this strategy on this ticker): "
            f"win rate {s.get('edge_win_rate', 0):.0%}, "
            f"return {s.get('edge_return_pct', 0):+.1f}% over "
            f"{s.get('edge_trades', 0)} trades\n"
            "Write the briefing now."
        )

    @staticmethod
    def _cache_key(s: Dict) -> str:
        price = s.get("price") or 0
        return f"{s.get('ticker')}|{s.get('recommendation')}|{round(float(price), 2)}"
