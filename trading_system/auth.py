"""
auth.py
=======

Optional **single-tenant** Supabase auth gate for the web UI.

It is completely inert unless ``AUTH_ENABLED=true`` *and* the Supabase URL,
anon key and JWT secret are all set (``config.auth_active``). When active, the
web app puts a login wall in front of everything.

Security model: the browser authenticates with Supabase (email/password) using
the public anon key; Supabase returns an access token (a JWT signed with the
project's JWT secret using HS256). The server verifies that token's signature
and expiry here — using only the Python standard library, so there is **no new
dependency** — and, optionally, checks the email against an allow-list.

The JWT secret never leaves the server; only the public anon key is sent to the
browser.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Dict, List, Optional


def _b64url_decode(segment: str) -> bytes:
    pad = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + pad)


def verify_supabase_jwt(token: str, secret: str, *, leeway: int = 30) -> Optional[Dict]:
    """Return the token's claims if the HS256 signature and expiry check out.

    Returns ``None`` for anything invalid — bad shape, wrong algorithm, bad
    signature, or expired/not-yet-valid. Never raises.
    """
    if not token or not secret:
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    header_b64, payload_b64, sig_b64 = parts
    try:
        header = json.loads(_b64url_decode(header_b64))
        if header.get("alg") != "HS256":
            return None
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected, actual):
            return None
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception:
        return None

    now = time.time()
    exp = claims.get("exp")
    if exp is not None:
        try:
            if now > float(exp) + leeway:
                return None
        except (TypeError, ValueError):
            return None
    nbf = claims.get("nbf")
    if nbf is not None:
        try:
            if now + leeway < float(nbf):
                return None
        except (TypeError, ValueError):
            return None
    return claims


def email_allowed(claims: Dict, allowed: List[str]) -> bool:
    """Single-tenant allow-list check. Empty list = anyone who can authenticate."""
    if not allowed:
        return True
    email = (claims.get("email") or "").lower()
    return email in {e.lower() for e in allowed}
