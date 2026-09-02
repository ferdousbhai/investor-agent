# investor-agent

MCP server for market data, available through a stdio CLI and Cloudflare Worker transport.

## Code index

- `src/server.ts` — `McpServer` construction and tool registration
- `src/index.ts` — stdio entry point
- `src/worker.ts` — Worker transport entry point
- `src/tools/` — MCP tool implementations
- `src/lib/yahoo.ts` — Yahoo client seam and market-data access
- `src/lib/cache.ts`, `src/lib/retry.ts`, and `src/lib/fetch.ts` — request resilience
- `src/lib/validation.ts` — shared input validation
- `test/` — tool and library tests
- `commands/` and `skills/` — Claude Code plugin surface, outside the MCP build
- `wrangler.jsonc` — Worker configuration

Tool contracts and TypeScript types are authoritative and must change together.

## Commands

```sh
pnpm run typecheck
pnpm run test
pnpm run lint
pnpm run build
```
