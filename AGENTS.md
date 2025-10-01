# Repository Guidelines

## Project Structure & Module Organization
- `services/*`: Cloud Run microservices (`ingest-api`, `prompt-builder`, `bg-generator`, `compositor`, `qc-service`, `delivery-service`). Entrypoint `src/server.ts`, compiled to `dist/`.
- `packages/shared`: Shared TypeScript library (schemas, prompt/copy builders, utils). Published in-repo as `@banner/shared`.
- `infra/terraform`: GCP IaC (Storage, Pub/Sub, Cloud Run, Workflows, Monitoring).
- `tasks/`: Cloud Workflows and local tools (e.g., `tasks/local/simulate.ts`).
- `docs/`, `scripts/`: Architecture/deployment docs and deployment scripts.

## Build, Test, and Development Commands
- Install: `npm install` (workspaces), then `npm run build` (Turbo builds all packages).
- Lint: `npm run lint` (TypeScript + ESLint + Prettier rules).
- Test (all): `npm run test`; specific pkg: `npm run test -w @banner/shared`.
- Dev (a service): `npm run dev -w ingest-api` (or any service name).
- Targeted build: `npx turbo run build --filter=compositor`.

## Coding Style & Naming Conventions
- TypeScript strict mode; CommonJS output with `esModuleInterop` enabled.
- Formatting via Prettier (2 spaces, semicolons). If needed: `npx prettier -w .`.
- Naming: files `kebab-case.ts`; types/interfaces `PascalCase`; variables/functions `camelCase`; constants `UPPER_SNAKE_CASE`.
- Import shared code from `@banner/shared` (avoid relative cross-package imports).

## Testing Guidelines
- Framework: Vitest (currently configured in `packages/shared`).
- Place tests alongside source as `*.test.ts`. Example: `packages/shared/src/utils.test.ts`.
- Run: `npm run test` (all) or `npm run test -w @banner/shared`.
- Focus: pure functions (schemas, utils, prompt/copy builders). For services, prefer Fastify `inject`-based tests when added.

## Commit & Pull Request Guidelines
- Commits: short, imperative, and scoped. Examples:
  - `services/compositor: fix text wrapping for long headlines`
  - `infra/terraform: add QC alert policy`
- PRs: clear description, linked issue(s), test plan (commands and expected output), and preview/screenshot or sample payload when applicable. Update docs/infra when behavior or contracts change.

## Security & Configuration Tips
- Never commit secrets. Secrets (Slack, Notion, API keys) are managed via Secret Manager and wired by Terraform/scripts. See `scripts/README.md`.
- Use environment variables provided by deploy (e.g., `OUTPUT_BUCKET`, `BG_TOPIC`, `COMPOSE_TOPIC`, `QC_TOPIC`, `DELIVERY_TOPIC`). Avoid hardcoding project/bucket names.
- Large assets belong in GCS buckets, not the repo.

