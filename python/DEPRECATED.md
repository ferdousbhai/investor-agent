# Python Version (Deprecated)

The Python implementation of investor-agent (v1.x, published on PyPI as `investor-agent`) has been superseded by v2.0, a complete rewrite in TypeScript on Cloudflare Workers.

## What changed

| | v1.x (Python) | v2.0 (TypeScript) |
|---|---|---|
| **Runtime** | Local Python process | Cloudflare Workers + Durable Objects |
| **Transport** | stdio | HTTP (URL-based MCP) |
| **Tools** | 14 individual MCP tools | 1 `codemode` tool with 14 sandbox functions |
| **Caching** | requests-cache (local SQLite) | Cloudflare KV (edge, per-function TTLs) |
| **Data** | yfinance, pytrends, httpx | yahoo-finance2, trading-signals, native fetch |
| **Install** | `pip install investor-agent` | `pnpm install` + `wrangler deploy` |

## Key difference: codemode

Instead of 14 separate tool calls, v2.0 exposes a single `codemode` tool. The LLM writes JavaScript that orchestrates multiple data-fetching functions in one call, reducing round trips and enabling richer analysis in a single interaction.

## Migration steps

1. Remove the Python package: `pip uninstall investor-agent`
2. Clone the repository: `git clone https://github.com/ferdousbhai/investor-agent`
3. Follow the setup instructions in the root [README.md](../README.md)
4. Update your MCP client configuration to use the URL-based transport

## Why the Python files are kept

These files are preserved for reference during the migration period. They will be removed in a future release.

## Questions

Open an issue at [github.com/ferdousbhai/investor-agent](https://github.com/ferdousbhai/investor-agent/issues).
