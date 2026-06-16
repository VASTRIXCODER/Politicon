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

# System prompt for the in-app AI co-pilot (explanations + Q&A, never advice).
_COPILOT_SYSTEM = (
    "You are the embedded AI co-pilot inside the HP Analytics trading platform — a "
    "calm, precise, risk-aware analyst. You help the user understand what the platform "
    "is showing: technical signals (produced by fixed quant formulas, not by you), "
    "their account and positions, risk settings, ATR sizing, backtest edge, and how to "
    "place the suggested orders. You may use web search for recent market context or "
    "news when it helps. Hard rules: be concise and concrete (short paragraphs or tight "
    "bullets); never promise profit or predict prices; this is educational, not financial "
    "advice; if given a data snapshot, ground your answer in it; if something is outside "
    "the provided context, say what you'd need. End with one short 'Next step:' line when "
    "the user asks what to do."
)

# System prompt for the pre-trade risk gate (a veto-only safety check).
_GATE_SYSTEM = (
    "You are a pre-trade risk checker for an automated trading system. You do NOT "
    "pick trades, predict prices, or change the strategy. You ONLY flag an imminent "
    "EVENT risk that would make taking a freshly-signalled long trade unwise right "
    "now (earnings within ~2 trading days, a trading halt, bankruptcy/fraud/delisting "
    "risk, or major adverse breaking news in the last day or two). Be conservative — "
    "only say SKIP for a clear, imminent red flag; otherwise say PROCEED."
)


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

    @property
    def has_key(self) -> bool:
        """The co-pilot only needs a key (independent of the AI_BRIEFING flag)."""
        return bool(self.config.anthropic_api_key)

    def ask(self, question: str, context: Optional[str] = None) -> Dict:
        """In-app co-pilot Q&A. Returns {'ok': bool, 'answer': str}.

        Degrades gracefully: no key / SDK / API error -> ok False with a clear
        message, so the UI never breaks.
        """
        if not self.has_key:
            return {"ok": False, "answer": "The AI co-pilot is off. Add ANTHROPIC_API_KEY "
                    "to your .env (and restart) to enable it."}
        client = self._get_client()
        if client is None:
            return {"ok": False, "answer": self._import_error or "AI client unavailable."}
        q = (question or "").strip()
        if not q:
            return {"ok": False, "answer": "Ask me anything about your signals, positions or risk."}
        prompt = q if not context else (
            "Current platform snapshot (JSON-ish):\n" + context[:6000] + "\n\nUser question: " + q
        )
        text = self._call_copilot(client, prompt)
        if not text:
            return {"ok": False, "answer": "I couldn't reach the model just now — try again."}
        return {"ok": True, "answer": text}

    def _call_copilot(self, client, prompt: str) -> Optional[str]:
        import anthropic
        base = dict(model=self.config.anthropic_model, max_tokens=1024, system=_COPILOT_SYSTEM)

        def run(tools):
            msgs = [{"role": "user", "content": prompt}]
            resp = None
            for _ in range(4):
                kw = dict(base, messages=msgs)
                if tools:
                    kw["tools"] = tools
                resp = client.messages.create(**kw)
                if resp.stop_reason == "pause_turn":
                    msgs = msgs + [{"role": "assistant", "content": resp.content}]
                    continue
                return self._extract_text(resp)
            return self._extract_text(resp)

        try:
            return run([{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}])
        except anthropic.APIError:
            try:
                return run(None)
            except Exception as exc:
                log.warning("copilot call failed: %s", exc)
                return None
        except Exception as exc:
            log.warning("copilot unexpected error: %s", exc)
            return None

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
    def gate(self, signal: Dict) -> Dict:
        """Pre-trade risk veto. Returns {'proceed': bool, 'reason': str}.

        Fail-open: any error / disabled / inconclusive -> proceed (the gate is an
        extra safety filter, not a hard requirement; it must never silently halt
        trading on an API hiccup).
        """
        if not self.enabled:
            return {"proceed": True, "reason": "AI gate off"}
        client = self._get_client()
        if client is None:
            return {"proceed": True, "reason": "no AI client"}
        prompt = (
            f"A momentum trading system wants to BUY {signal.get('ticker')} at about "
            f"${signal.get('price')} right now. Check for an imminent red flag that means "
            "we should skip this entry. First line: exactly PROCEED or SKIP. "
            "Second line: one short reason."
        )
        text = self._call_gate(client, prompt)
        if not text or not text.strip():
            return {"proceed": True, "reason": "AI gate inconclusive (proceeding)"}
        first = text.strip().split()[0].upper()
        return {"proceed": not first.startswith("SKIP"), "reason": text.strip()[:300]}

    def _call_gate(self, client, prompt: str) -> Optional[str]:
        import anthropic

        base = dict(model=self.config.anthropic_model, max_tokens=300, system=_GATE_SYSTEM)

        def run(tools):
            msgs = [{"role": "user", "content": prompt}]
            resp = None
            for _ in range(4):
                kw = dict(base, messages=msgs)
                if tools:
                    kw["tools"] = tools
                resp = client.messages.create(**kw)
                if resp.stop_reason == "pause_turn":
                    msgs = msgs + [{"role": "assistant", "content": resp.content}]
                    continue
                return self._extract_text(resp)
            return self._extract_text(resp)

        try:
            return run([{"type": "web_search_20250305", "name": "web_search", "max_uses": 2}])
        except anthropic.APIError:
            try:
                return run(None)
            except Exception:
                return None
        except Exception:
            return None

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
