# TradingView MCP — agent-side data tools

This wires `atilaahmettaner/tradingview-mcp` into the **agent layer** (Claude
Code / the AI co-pilot), so the assistant can *query* TradingView's
screener/technical data as tools. It is **separate** from the web UI's
TradingView charts:

| Layer | What it is | Where it runs |
|-------|------------|---------------|
| **Web UI charts** (already integrated) | TradingView's free embeddable widgets — advanced chart, S&P 500 heatmap, ticker tape | the user's **browser** |
| **MCP** (this file) | TradingView screener/technical data exposed as MCP **tools** | a local **server** the agent connects to |

## How it's wired

The project ships a `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/atilaahmettaner/tradingview-mcp.git", "tradingview-mcp"]
    }
  }
}
```

Claude Code auto-discovers project-scoped `.mcp.json` and will prompt you to
**approve** the server the first time. Once approved, the agent gains
`mcp__tradingview__*` tools.

## Requirements

- [`uv`](https://docs.astral.sh/uv/) installed (provides `uvx`).
- Network egress to GitHub (to fetch the package) and to TradingView at runtime.

## If the entry point differs

I could not execute the server in this sandbox (no network), so the `uvx`
invocation above is the standard pattern but the package's exact console-script
name may differ. If approval fails, clone and run it directly, then point the
config at it:

```bash
git clone https://github.com/atilaahmettaner/tradingview-mcp.git external/tradingview-mcp
cd external/tradingview-mcp && uv sync   # or: pip install -e .
```

…and set `.mcp.json` to whatever the repo's README documents, e.g.:

```json
{ "mcpServers": { "tradingview": {
  "command": "python", "args": ["server.py"], "cwd": "./external/tradingview-mcp"
}}}
```

## Verifying

In a Claude Code session in this repo, run `/mcp` to see whether `tradingview`
is connected and which tools it exposes. Then you can ask the co-pilot things
like *“what's TradingView's technical rating for NVDA?”* and it will call the
tool.

> Note: the in-app web co-pilot (`/api/ai/ask`) talks to the Anthropic API
> directly and does **not** use this MCP server — MCP tools are available to the
> Claude Code agent. Bridging MCP tools into the in-app co-pilot is a future
> enhancement.
