# investor-agent

Financial research MCP server for long-term investors.

## Setup

```json
{
  "mcpServers": {
    "investor-agent": {
      "command": "npx",
      "args": ["-y", "investor-agent"]
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

The server also runs as a remote MCP server on Workers (`src/worker.ts`). `wrangler.jsonc` is ready to deploy as-is:

```bash
pnpm install
pnpm run deploy
```

Point your client at `https://investor-agent.<your-subdomain>.workers.dev`, or attach a custom domain in the Cloudflare dashboard.

## License

MIT
