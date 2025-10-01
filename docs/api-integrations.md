# API & Integration TODOs

## External Ingestion API (`ingest-api`)
- [ ] Document authenticated entrypoint (API key header + rate limit expectations).
- [ ] Validate request payloads against `@banner/shared` schemas before queuing workflows.
- [ ] Define idempotency strategy (campaign deduplication) and persist correlation IDs in Firestore.
- [ ] Expose health/readiness endpoint for Cloud Run monitoring.

## Internal Workflow APIs
- [ ] Publish OpenAPI snippets for `/workflows/variants` (prompt-builder) and `/tasks/*` endpoints.
- [ ] Align error responses to shared format `{ code, message, details }` and surface retriable vs permanent errors.
- [ ] Add request logging + trace propagation between services to improve debugging.

## Slack Delivery & Approvals
- [ ] Finalize Slack message template (preview image, CTA buttons, fallback text) in `delivery-service`.
- [ ] Ensure webhook secret rotation docs exist; prefer Secret Manager binding via Terraform.
- [ ] Implement Slack Events handler service for `reaction_added` approvals that updates Firestore `campaign.status`.
- [ ] Add failure alert to Slack when workflow execution or downstream task fails repeatedly.

## Notion Reporting
- [ ] Confirm delivery-service records to Notion database (fields: campaign, variant, status, preview URL).
- [ ] Implement retry/backoff for Notion API and surface failure metrics to Cloud Monitoring.
- [ ] Document manual remediation steps (e.g., re-run payload, edit Notion entry).

## Future Integrations
- [ ] Evaluate downstream exports (LINE Ads, Meta Ads) and capture API requirements.
- [ ] Build abstraction in `@banner/shared` for delivery channel payloads to keep services decoupled.
- [ ] Create staging sandbox credentials and add smoke test scripts under `tasks/local/`.
