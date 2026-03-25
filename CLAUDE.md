# CLAUDE.md

## Commands

- `pnpm run test` — run tests
- `pnpm run typecheck` — type check
- `pnpm run dev` — local dev server

## Ship

Commit, push to `main`, and watch the GitHub Actions run. CI runs typecheck + tests, then auto-deploys to Cloudflare Workers.
