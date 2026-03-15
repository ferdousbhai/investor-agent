# investor-agent

> **Warning**
> **Migration from v1.x (Python):** The Python MCP server previously published on PyPI as `investor-agent` is deprecated. v2.0 is a complete rewrite in TypeScript on Cloudflare Workers. The PyPI package will not receive further updates.

A financial research MCP server that exposes a single **codemode** tool. Instead of calling 14 separate tools, the LLM writes JavaScript code that orchestrates multiple data-fetching functions in a single call -- fetching prices, calculating indicators, and combining results in one round trip.

## Architecture

- **Runtime:** Cloudflare Workers with Durable Objects for persistent MCP sessions
- **Sandbox:** [@cloudflare/codemode](https://www.npmjs.com/package/@cloudflare/codemode) v0.2.0 `DynamicWorkerExecutor` runs LLM-generated JavaScript in a sandboxed V8 isolate
- **Caching:** Cloudflare KV with per-function TTLs (1 minute to 24 hours)
- **Data sources:** [yahoo-finance2](https://www.npmjs.com/package/yahoo-finance2) v3, CNN Fear & Greed, [alternative.me](https://alternative.me/crypto/fear-and-greed-index/) Crypto Fear & Greed, NASDAQ API
- **Technical analysis:** [trading-signals](https://www.npmjs.com/package/trading-signals) (SMA, EMA, RSI, MACD, Bollinger Bands)

## Setup

```bash
pnpm install
```

### Create KV namespace

```bash
wrangler kv namespace create CACHE
# Copy the returned id into wrangler.jsonc under kv_namespaces
```

### Local development

```bash
pnpm run dev
# Starts wrangler dev server at http://localhost:8787
```

### Deploy

```bash
pnpm run deploy
```

## The `codemode` tool

The server exposes a single MCP tool called `codemode`. It accepts a `code` parameter containing JavaScript that runs in a sandboxed V8 isolate. All 13 functions are available on the `codemode` object and accept a single argument object.

### Sandbox functions

| Function | Description |
|----------|-------------|
| `fetchJson({ url, headers? })` | Fetch JSON from a URL with retry and browser headers |
| `fetchText({ url, headers? })` | Fetch raw text/HTML from a URL with retry and browser headers |
| `toCleanCsv({ rows })` | Convert an array of objects to CSV, auto-removing empty columns |
| `validateTicker({ ticker })` | Validate and normalize a ticker symbol (trims, uppercases) |
| `periodToDates({ period })` | Convert a period string (`1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`, `10y`, `ytd`, `max`) to `{ period1, period2 }` dates |
| `quoteSummary({ symbol, modules })` | Fetch Yahoo Finance quote summary (supports 27 modules: `assetProfile`, `financialData`, `price`, `recommendationTrend`, `earningsHistory`, etc.) |
| `getHistorical({ symbol, period1, period2?, interval? })` | Fetch historical OHLCV price data. Interval: `1d`, `1wk`, `1mo` |
| `getOptions({ symbol, date? })` | Fetch options chain. Omit `date` to get available expirations |
| `getMarketMovers({ category?, count?, session? })` | Top gainers, losers, or most active stocks. Session: `regular`, `pre-market`, `after-hours` |
| `getCnnFearGreed({})` | CNN Fear & Greed Index with sub-indicator scores |
| `getCryptoFearGreed({})` | Crypto Fear & Greed Index from alternative.me |
| `getNasdaqEarnings({ date?, limit? })` | NASDAQ earnings calendar for a given date |
| `calculateIndicator({ ticker, indicator, period?, timeperiod?, ... })` | Calculate SMA, EMA, RSI, MACD, or BBANDS with configurable parameters |

## MCP client configuration

### Cloudflare Workers deployment (URL-based)

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

### Local development

```json
{
  "mcpServers": {
    "investor-agent": {
      "type": "url",
      "url": "http://localhost:8787/mcp"
    }
  }
}
```

## Example codemode usage

Fetch the current price of AAPL and calculate its 14-day RSI in a single call:

```javascript
const [summary, rsi] = await Promise.all([
  codemode.quoteSummary({ symbol: "AAPL", modules: ["price"] }),
  codemode.calculateIndicator({ ticker: "AAPL", indicator: "RSI", timeperiod: 14, numResults: 1 })
]);

const price = summary.price.regularMarketPrice;
const latestRsi = rsi.values[rsi.values.length - 1];

return {
  ticker: "AAPL",
  price,
  rsi: latestRsi.rsi,
  date: latestRsi.date
};
```

Compare market and crypto sentiment:

```javascript
const [cnn, crypto] = await Promise.all([
  codemode.getCnnFearGreed({}),
  codemode.getCryptoFearGreed({})
]);

return { cnn: cnn.fear_and_greed, crypto };
```

## Testing

```bash
pnpm run test          # Run all tests
pnpm run test:watch    # Watch mode
pnpm run typecheck     # TypeScript type checking
```

## License

MIT
