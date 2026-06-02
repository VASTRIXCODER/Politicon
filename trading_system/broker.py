"""
broker.py
=========

Broker abstraction plus the Alpaca implementation.

Everything the engine needs from a broker is captured by the small
:class:`Broker` interface, so a second venue (see ``coinbase.py``) can be
slotted in without touching the engine.  Account and position data are
normalised into the plain :class:`AccountInfo` / :class:`PositionInfo`
dataclasses.

Safety: :class:`AlpacaBroker` selects the paper or live endpoint purely from
``CONFIG.is_live``.  The default config is paper, so you cannot accidentally
trade real money without explicitly setting ``TRADING_MODE=live``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional


# --------------------------------------------------------------------------- #
# Normalised data structures
# --------------------------------------------------------------------------- #
@dataclass
class AccountInfo:
    equity: float
    cash: float
    buying_power: float
    portfolio_value: float
    currency: str = "USD"


@dataclass
class PositionInfo:
    symbol: str
    qty: float
    avg_entry_price: float
    current_price: float
    market_value: float
    unrealized_pl: float
    unrealized_plpc: float  # as a fraction (0.05 == +5%)


# --------------------------------------------------------------------------- #
# Interface
# --------------------------------------------------------------------------- #
class Broker(ABC):
    """Minimal broker contract used by the engine, dashboard and risk layer."""

    name: str = "broker"
    paper: bool = True

    @abstractmethod
    def get_account(self) -> AccountInfo: ...

    @abstractmethod
    def get_positions(self) -> List[PositionInfo]: ...

    @abstractmethod
    def get_position(self, symbol: str) -> Optional[PositionInfo]: ...

    @abstractmethod
    def get_latest_price(self, symbol: str) -> float: ...

    @abstractmethod
    def submit_market_order(self, symbol: str, qty: float, side: str) -> str:
        """Place a market order; ``side`` is 'buy' or 'sell'. Returns order id."""

    @abstractmethod
    def close_position(self, symbol: str) -> Optional[str]: ...

    @abstractmethod
    def close_all_positions(self) -> None: ...

    @abstractmethod
    def cancel_all_orders(self) -> None: ...

    @abstractmethod
    def is_market_open(self) -> bool: ...


# --------------------------------------------------------------------------- #
# Alpaca
# --------------------------------------------------------------------------- #
class AlpacaBroker(Broker):
    """Alpaca implementation built on the official ``alpaca-py`` SDK."""

    name = "alpaca"

    def __init__(self, api_key: str, secret_key: str, paper: bool = True,
                 data_feed: str = "iex"):
        try:
            from alpaca.trading.client import TradingClient
            from alpaca.data.historical import StockHistoricalDataClient
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise ImportError(
                "alpaca-py is required for the Alpaca broker. "
                "Install it with `pip install alpaca-py`."
            ) from exc

        if not api_key or not secret_key:
            raise ValueError("Alpaca API key/secret are required.")

        self.paper = paper
        self.data_feed = data_feed
        self._client = TradingClient(api_key, secret_key, paper=paper)
        self._data = StockHistoricalDataClient(api_key, secret_key)

    # -- account / positions ---------------------------------------------- #
    def get_account(self) -> AccountInfo:
        a = self._client.get_account()
        return AccountInfo(
            equity=float(a.equity),
            cash=float(a.cash),
            buying_power=float(a.buying_power),
            portfolio_value=float(a.portfolio_value),
            currency=getattr(a, "currency", "USD") or "USD",
        )

    def get_positions(self) -> List[PositionInfo]:
        return [self._to_position(p) for p in self._client.get_all_positions()]

    def get_position(self, symbol: str) -> Optional[PositionInfo]:
        try:
            p = self._client.get_open_position(symbol)
        except Exception:
            return None
        return self._to_position(p)

    @staticmethod
    def _to_position(p) -> PositionInfo:
        return PositionInfo(
            symbol=p.symbol,
            qty=float(p.qty),
            avg_entry_price=float(p.avg_entry_price),
            current_price=float(getattr(p, "current_price", 0) or 0),
            market_value=float(getattr(p, "market_value", 0) or 0),
            unrealized_pl=float(getattr(p, "unrealized_pl", 0) or 0),
            unrealized_plpc=float(getattr(p, "unrealized_plpc", 0) or 0),
        )

    # -- pricing ----------------------------------------------------------- #
    def get_latest_price(self, symbol: str) -> float:
        from alpaca.data.requests import StockLatestTradeRequest

        req = StockLatestTradeRequest(symbol_or_symbols=symbol, feed=self.data_feed)
        trade = self._data.get_stock_latest_trade(req)
        return float(trade[symbol].price)

    # -- orders ------------------------------------------------------------ #
    def submit_market_order(self, symbol: str, qty: float, side: str) -> str:
        from alpaca.trading.requests import MarketOrderRequest
        from alpaca.trading.enums import OrderSide, TimeInForce

        order_side = OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL
        req = MarketOrderRequest(
            symbol=symbol,
            qty=qty,
            side=order_side,
            time_in_force=TimeInForce.DAY,
        )
        order = self._client.submit_order(order_data=req)
        return str(order.id)

    def close_position(self, symbol: str) -> Optional[str]:
        try:
            order = self._client.close_position(symbol)
            return str(getattr(order, "id", "")) or None
        except Exception:
            return None

    def close_all_positions(self) -> None:
        self._client.close_all_positions(cancel_orders=True)

    def cancel_all_orders(self) -> None:
        self._client.cancel_orders()

    # -- market clock ------------------------------------------------------ #
    def is_market_open(self) -> bool:
        return bool(self._client.get_clock().is_open)


# --------------------------------------------------------------------------- #
# Factory
# --------------------------------------------------------------------------- #
def build_broker(config) -> Broker:
    """Construct the broker selected in config (defaults to Alpaca paper)."""
    if config.broker == "coinbase":
        from coinbase_broker import CoinbaseBroker
        return CoinbaseBroker(
            api_key=config.coinbase_api_key,
            api_secret=config.coinbase_api_secret,
        )

    return AlpacaBroker(
        api_key=config.alpaca_api_key,
        secret_key=config.alpaca_secret_key,
        paper=config.is_paper,
        data_feed=config.alpaca_data_feed,
    )
