"""
dashboard.py
============

A read-only ``rich`` terminal dashboard for monitoring the system while the
engine runs in another process.

It shows, refreshing every ``DASHBOARD_REFRESH_SECONDS`` (default 30s):

* system status (mode, broker, equation set, interval, kill switch, market open)
* account: total portfolio value, equity, cash, buying power remaining
* open positions with unrealised PnL ($ and %)
* today's closed trades
* current win rate (today and all-time)
* the active tickers being monitored

Run it with::

    python main.py dashboard
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from broker import build_broker
from config import CONFIG
from database import Database


def _fmt_money(x) -> str:
    try:
        return f"${float(x):,.2f}"
    except Exception:
        return "-"


def _fmt_pct(x) -> str:
    try:
        return f"{float(x) * 100:+.2f}%"
    except Exception:
        return "-"


class Dashboard:
    def __init__(self, config=CONFIG):
        self.config = config
        self.db = Database(config.db_path)
        self._broker = None
        self._broker_error = None
        try:
            self._broker = build_broker(config)
        except Exception as exc:
            self._broker_error = str(exc)

    # ------------------------------------------------------------------ #
    # Rendering
    # ------------------------------------------------------------------ #
    def render(self):
        from rich.console import Group
        from rich.panel import Panel
        from rich.table import Table

        return Group(
            self._status_panel(),
            self._positions_table(),
            self._today_table(),
        )

    def _status_panel(self):
        from rich.panel import Panel
        from rich.table import Table

        account = None
        market_open = None
        if self._broker is not None:
            try:
                account = self._broker.get_account()
            except Exception as exc:
                self._broker_error = str(exc)
            try:
                market_open = self._broker.is_market_open()
            except Exception:
                market_open = None

        t = Table.grid(padding=(0, 2))
        t.add_column(justify="right", style="bold cyan")
        t.add_column()

        mode = "LIVE" if self.config.is_live else "PAPER"
        mode_style = "bold red" if self.config.is_live else "bold green"
        kill = self.config.kill_switch
        t.add_row("Mode", f"[{mode_style}]{mode}[/]   broker={self.config.broker}")
        t.add_row("Strategy", f"equation set {self.config.equation_set} | "
                              f"lookback {self.config.lookback_length} | interval {self.config.interval}")
        t.add_row("Kill switch", "[bold red]ACTIVE[/]" if kill else "[green]off[/]")
        if market_open is not None:
            t.add_row("Market", "[green]open[/]" if market_open else "[yellow]closed[/]")
        t.add_row("Tickers", ", ".join(self.config.tickers))

        if account is not None:
            t.add_row("Portfolio value", _fmt_money(account.portfolio_value))
            t.add_row("Equity", _fmt_money(account.equity))
            t.add_row("Buying power", _fmt_money(account.buying_power))
        elif self._broker_error:
            t.add_row("Account", f"[red]unavailable: {self._broker_error}[/]")

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
        return Panel(t, title="System Status", subtitle=f"updated {now}",
                     border_style="cyan")

    def _positions_table(self):
        from rich.panel import Panel
        from rich.table import Table

        table = Table(expand=True)
        for col in ("Symbol", "Qty", "Avg Entry", "Current", "Mkt Value",
                    "Unreal. PnL", "PnL %"):
            table.add_column(col)

        positions = []
        if self._broker is not None:
            try:
                positions = self._broker.get_positions()
            except Exception as exc:
                self._broker_error = str(exc)

        if not positions:
            table.add_row("—", "", "", "", "", "", "")
        for p in positions:
            pnl_style = "green" if p.unrealized_pl >= 0 else "red"
            table.add_row(
                p.symbol, f"{p.qty:g}", _fmt_money(p.avg_entry_price),
                _fmt_money(p.current_price), _fmt_money(p.market_value),
                f"[{pnl_style}]{_fmt_money(p.unrealized_pl)}[/]",
                f"[{pnl_style}]{_fmt_pct(p.unrealized_plpc)}[/]",
            )
        return Panel(table, title="Open Positions", border_style="blue")

    def _today_table(self):
        from rich.panel import Panel
        from rich.table import Table

        today = self.db.get_today_closed_trades()
        report_today = self.db.performance_report(
            since_iso=datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
        )
        report_all = self.db.performance_report()

        table = Table(expand=True)
        for col in ("Ticker", "Eq", "Entry", "Exit", "PnL $", "PnL %", "Reason"):
            table.add_column(col)
        if not today:
            table.add_row("—", "", "", "", "", "", "")
        for tr in today:
            pnl = tr["pnl_dollars"] or 0.0
            style = "green" if pnl >= 0 else "red"
            table.add_row(
                tr["ticker"], str(tr["equation_set"]),
                _fmt_money(tr["entry_price"]), _fmt_money(tr["exit_price"]),
                f"[{style}]{_fmt_money(pnl)}[/]",
                f"[{style}]{(tr['pnl_pct'] or 0.0):+.2f}%[/]",
                tr["exit_reason"] or "",
            )

        subtitle = (
            f"today: {report_today['wins']}/{report_today['trades']} "
            f"({report_today['win_rate'] * 100:.0f}% win) "
            f"PnL {_fmt_money(report_today['total_pnl'])}   |   "
            f"all-time: {report_all['wins']}/{report_all['trades']} "
            f"({report_all['win_rate'] * 100:.0f}% win)  "
            f"Sharpe {report_all['sharpe']:.2f}"
        )
        return Panel(table, title="Today's Closed Trades", subtitle=subtitle,
                     border_style="magenta")

    # ------------------------------------------------------------------ #
    # Live loop
    # ------------------------------------------------------------------ #
    def run(self) -> None:
        try:
            from rich.console import Console
            from rich.live import Live
        except ImportError as exc:  # pragma: no cover
            raise SystemExit("`rich` is required for the dashboard: pip install rich") from exc

        console = Console()
        refresh = max(1, self.config.dashboard_refresh_seconds)
        console.print(f"[dim]Dashboard refreshing every {refresh}s. Ctrl-C to exit.[/]")
        try:
            with Live(self.render(), console=console, screen=True,
                      refresh_per_second=4) as live:
                while True:
                    live.update(self.render())
                    time.sleep(refresh)
        except KeyboardInterrupt:
            console.print("dashboard stopped.")


if __name__ == "__main__":
    Dashboard().run()
