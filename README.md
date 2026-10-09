# investor-agent

Financial research MCP server for long-term investors.

## Setup

### Hosted (remote MCP)

A hosted instance runs on Cloudflare Workers at `https://investor.ferdousbhai.com/mcp` (Streamable HTTP, no auth). For Claude Code:

```bash
claude mcp add --transport http investor-agent https://investor.ferdousbhai.com/mcp
```

Or in an MCP client config that supports remote servers:

```json
{
  "mcpServers": {
    "investor-agent": {
      "type": "http",
      "url": "https://investor.ferdousbhai.com/mcp"
    }
  }
}
```

### Local (stdio, from source)

This package is not published to npm. Do not run `npx investor-agent`: nothing under that npm name is published by this project. Build from this repository instead:

```bash
git clone https://github.com/ferdousbhai/investor-agent.git
cd investor-agent
pnpm install
pnpm run build
```

Then point your client at the built entry point:

```json
{
  "mcpServers": {
    "investor-agent": {
      "command": "node",
      "args": ["/absolute/path/to/investor-agent/dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `get_stock_info` | Stock fundamentals — price, financials, earnings, ownership, analyst ratings, profile |
| `historical_prices` | OHLCV price history (default: 1 year weekly, limit 100) |
| `get_options` | Options contracts sorted by open interest (default: top 25 per type) |
| `market_movers` | Top gaining, losing, or most active stocks |
| `earnings_calendar` | Upcoming earnings reports from NASDAQ |
| `fear_greed_index` | CNN stock market or crypto Fear & Greed index |
| `technical_indicator` | SMA, EMA, RSI, MACD, or Bollinger Bands |

## Development

```bash
pnpm install
pnpm run test
pnpm run typecheck
```

## Deploy to Cloudflare Workers

The server also runs as a remote MCP server on Workers (`src/worker.ts`). `cloudflare.config.ts` is ready to deploy as-is with the `cf` CLI:

```bash
pnpm install
pnpm run deploy
```

Point your client at `https://investor-agent.<your-subdomain>.workers.dev/mcp`, or attach a custom domain in the Cloudflare dashboard.

## License

MIT
