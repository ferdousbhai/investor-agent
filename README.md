# investor-agent

> **Warning**
> **Migration from v1.x (Python):** The Python MCP server previously published on PyPI as `investor-agent` is deprecated. v2.0 is a complete rewrite in TypeScript on Cloudflare Workers. The PyPI package will not receive further updates.

A financial research MCP server that exposes a single **codemode** tool with 5 sandbox functions. The LLM writes JavaScript that orchestrates data fetching, calculations, and result assembly in one round trip.

## MCP client configuration

```json
{
  "mcpServers": {
    "investor-agent": {
      "type": "url",
      "url": "https://investor.ferdousbhai.com/mcp"
    }
  }
}
```

Health check: `GET https://investor.ferdousbhai.com/` returns `200 OK`.

## Architecture

- **Runtime:** Cloudflare Workers with Durable Objects for persistent MCP sessions
- **Sandbox:** [@cloudflare/codemode](https://www.npmjs.com/package/@cloudflare/codemode) v0.2.0 `DynamicWorkerExecutor` runs LLM-generated JavaScript in a sandboxed V8 isolate
- **Caching:** Cloudflare KV with per-function TTLs (1 minute to 24 hours)
- **Data sources:** [yahoo-finance2](https://www.npmjs.com/package/yahoo-finance2) v3, CNN Fear & Greed, [alternative.me](https://alternative.me/crypto/fear-and-greed-index/) Crypto Fear & Greed, NASDAQ API
- **Technical analysis:** [trading-signals](https://www.npmjs.com/package/trading-signals) (SMA, EMA, RSI, MACD, Bollinger Bands)

## The `codemode` tool

The server exposes a single MCP tool called `codemode`. It accepts a `code` parameter containing JavaScript that runs in a sandboxed V8 isolate. All functions are available on the `codemode` object and accept a single argument object.

### Sandbox functions

| Function | Description |
|----------|-------------|
| `quoteSummary({ symbol, modules })` | Yahoo Finance quote summary (modules: `assetProfile`, `financialData`, `price`, `recommendationTrend`, `summaryDetail`, etc.) |
| `getHistorical({ symbol, period1, period2?, interval? })` | Historical OHLCV price data. Interval: `1d`, `1wk`, `1mo` |
| `getOptions({ symbol, date? })` | Options chain. Omit `date` to get available expirations |
| `getMarketData({ source, ... })` | Market-wide data: `"movers"` (top gainers/losers/most-active), `"earnings"` (NASDAQ calendar), or `"fear-greed"` (CNN or crypto sentiment) |
| `calculateIndicator({ ticker, indicator, ... })` | Calculate SMA, EMA, RSI, MACD, or BBANDS with configurable parameters |

### Examples

The `code` parameter must be an **async arrow function expression** — the runtime wraps it as `(CODE)()`.

Fetch the current price of AAPL and calculate its 14-day RSI in a single call:

```javascript
async () => {
  const [summary, rsi] = await Promise.all([
    codemode.quoteSummary({ symbol: "AAPL", modules: ["price"] }),
    codemode.calculateIndicator({ ticker: "AAPL", indicator: "RSI", timeperiod: 14, numResults: 1 })
  ]);
  return {
    price: summary.price.regularMarketPrice,
    rsi: rsi.values.at(-1).rsi
  };
}
```

Compare market and crypto sentiment:

```javascript
async () => {
  const [stock, crypto] = await Promise.all([
    codemode.getMarketData({ source: "fear-greed" }),
    codemode.getMarketData({ source: "fear-greed", market: "crypto" })
  ]);
  return { stock: stock.fear_and_greed, crypto };
}
```

## Development

```bash
pnpm install

# Create KV namespace (first time only)
wrangler kv namespace create CACHE
# Copy the returned id into wrangler.jsonc under kv_namespaces

# Local development
pnpm run dev

# Deploy
pnpm run deploy

# Testing
pnpm run test
pnpm run test:watch
pnpm run typecheck
```

## License

MIT
