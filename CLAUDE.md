# CLAUDE.md

## Commands

- `pnpm run dev` — local development
- `pnpm run typecheck` — type check
- `pnpm run test` — run tests
- `pnpm run test:watch` — run tests in watch mode

## Deployment

CI/CD is in `.github/workflows/publish.yml`. Pushing to `main` triggers typecheck + tests, then auto-deploys to Cloudflare Workers. Do NOT run `pnpm run deploy` manually — just commit and push, then watch the GitHub Actions run.
