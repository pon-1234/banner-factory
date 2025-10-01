# Campaign Portal

Next.js portal that allows non-technical teammates to submit campaign briefs for the Banner Factory pipeline.

## Development

```bash
npm install --ignore-scripts
npm run dev --workspace @banner/campaign-portal
```

Set the following environment variables (see `.env.example`):

- `NEXT_PUBLIC_INGEST_API_BASE_URL` – base URL for the ingest-api Cloud Run service
- `SUBMISSION_LOG_WEBHOOK` – optional webhook for submission audit logs (kept server-side)

## Testing

```bash
npm run test --workspace @banner/campaign-portal
```

Vitest + React Testing Library cover form validation and conditional requirements. Linting is handled via `next lint`.
