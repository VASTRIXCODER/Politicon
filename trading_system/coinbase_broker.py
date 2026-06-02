"""
coinbase_broker.py
==================

**Optional / experimental** Coinbase Advanced Trade integration for a future
crypto expansion.

This is a scaffold that implements the same :class:`broker.Broker` interface as
Alpaca so the engine can drive it unchanged, but it is intentionally
conservative: methods that would move money are wired to the official
``coinbase-advanced-py`` SDK where the mapping is unambiguous, and clearly raise
``NotImplementedError`` where crypto semantics differ from equities (e.g. there
is no built-in stock-style market clock, and "positions" are really wallet
balances).

It is **not** enabled unless ``BROKER=coinbase``.  Treat it as a starting point
and test thoroughly on small sizes before relying on it.
"""

from __future__ import annotations

import time
import uuid
from typing import List, Optional

from broker import AccountInfo, Broker, PositionInfo


class CoinbaseBroker(Broker):
    """Scaffolded Coinbase Advanced Trade broker (crypto, 24/7)."""

    name = "coinbase"
    paper = False  # Coinbase Advanced Trade has no paper endpoint.

    def __init__(self, api_key: str, api_secret: str, quote_currency: str = "USD"):
        try:
            from coinbase.rest import RESTClient
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise ImportError(
                "coinbase-advanced-py is required for the Coinbase broker. "
                "Install it with `pip install coinbase-advanced-py`."
            ) from exc

        if not api_key or not api_secret:
            raise ValueError("Coinbase API key/secret are required.")

        self.quote_currency = quote_currency
        self._client = RESTClient(api_key=api_key, api_secret=api_secret)

    # ------------------------------------------------------------------ #
    # Account / positions
    # ------------------------------------------------------------------ #
    def get_account(self) -> AccountInfo:
        """Approximate an equities-style account from wallet balances.

        Sums the available quote-currency (e.g. USD) balance as cash/buying
        power.  A full implementation would also value crypto holdings at the
        current mark to populate ``equity``/``portfolio_value`` precisely.
        """
        accounts = self._client.get_accounts()
        cash = 0.0
        for acct in getattr(accounts, "accounts", []) or []:
            if getattr(acct, "currency", None) == self.quote_currency:
                bal = getattr(acct, "available_balance", None)
                if bal is not None:
                    cash += float(getattr(bal, "value", 0) or 0)
        # NOTE: equity/portfolio_value should also include marked crypto holdings.
        return AccountInfo(
            equity=cash, cash=cash, buying_power=cash,
            portfolio_value=cash, currency=self.quote_currency,
        )

    def get_positions(self) -> List[PositionInfo]:
        # TODO: derive positions from non-quote wallet balances and mark them to
        # market via get_latest_price. Returning empty keeps the engine safe.
        return []

    def get_position(self, symbol: str) -> Optional[PositionInfo]:
        for p in self.get_positions():
            if p.symbol == symbol:
                return p
        return None

    # ------------------------------------------------------------------ #
    # Pricing
    # ------------------------------------------------------------------ #
    def get_latest_price(self, symbol: str) -> float:
        product = self._client.get_product(symbol)  # e.g. "BTC-USD"
        return float(getattr(product, "price", 0) or 0)

    # ------------------------------------------------------------------ #
    # Orders
    # ------------------------------------------------------------------ #
    def submit_market_order(self, symbol: str, qty: float, side: str) -> str:
        client_order_id = uuid.uuid4().hex
        if side.lower() == "buy":
            # Coinbase market buys are sized in quote currency (quote_size).
            price = self.get_latest_price(symbol)
            quote_size = round(qty * price, 2)
            resp = self._client.market_order_buy(
                client_order_id=client_order_id,
                product_id=symbol,
                quote_size=str(quote_size),
            )
        else:
            resp = self._client.market_order_sell(
                client_order_id=client_order_id,
                product_id=symbol,
                base_size=str(qty),
            )
        return str(getattr(resp, "order_id", client_order_id))

    def close_position(self, symbol: str) -> Optional[str]:
        pos = self.get_position(symbol)
        if not pos or pos.qty <= 0:
            return None
        return self.submit_market_order(symbol, pos.qty, "sell")

    def close_all_positions(self) -> None:
        for pos in self.get_positions():
            if pos.qty > 0:
                self.close_position(pos.symbol)
                time.sleep(0.2)  # be gentle with rate limits

    def cancel_all_orders(self) -> None:
        # TODO: list open orders via get_orders(...) then cancel_orders([...]).
        raise NotImplementedError(
            "cancel_all_orders is not implemented in the Coinbase scaffold yet."
        )

    # ------------------------------------------------------------------ #
    # Market clock
    # ------------------------------------------------------------------ #
    def is_market_open(self) -> bool:
        return True  # crypto trades 24/7
