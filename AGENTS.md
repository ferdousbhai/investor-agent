# investor-agent

## Delivery

Prefer `main` — branches/PRs only if asked. CI runs `typecheck` + `tests` on push.

## Rules

- Run `pnpm run typecheck` and `pnpm run test` before pushing; `pnpm run build` compiles to `dist/`.
- Keep tool contracts in sync with implementation — types are authoritative.

## Index

- [src/server.ts](src/server.ts) — entry
- [src/worker.ts](src/worker.ts) — worker bindings
- [src/tools/](src/tools/) — tool definitions
- [src/lib/](src/lib/) — shared helpers
- [test/](test/) — tests
- [package.json](package.json) — scripts: `test`/`typecheck`/`build`
- [wrangler.jsonc](wrangler.jsonc) — bindings (if present)
