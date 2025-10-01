# Operations Runbook

## Workflow Execution Checklist
- Ensure Google Cloud CLI is authenticated for the `banner-factory` project (`gcloud auth list`).
- Set `CLOUDSDK_CONFIG` to a writable directory when running locally (the repo contains `.gcloud/` for this purpose).
- Deploy the latest workflow definition:
  ```bash
  gcloud workflows deploy render-orchestrator \
    --location=asia-northeast1 \
    --source=tasks/workflows/render-orchestrator.yaml \
    --service-account=workflows-sa@banner-factory.iam.gserviceaccount.com \
    --set-env-vars="PROJECT_ID=banner-factory,BG_TOPIC=bg-tasks,COMPOSE_TOPIC=compose-tasks,QC_TOPIC=qc-tasks,DELIVERY_TOPIC=delivery-tasks,PROMPT_BUILDER_HOST=https://prompt-builder-vk3mjut3xq-an.a.run.app"
  ```
- Trigger a test execution and wait for success:
  ```bash
  PAYLOAD=$(cat <<'JSON'
  {"campaign_id":"cmp_secret-refresh-test","inputs":[{"lp_url":"https://example.com/coin-recovery","brand_name":"CoinAssist","objective":"相談","target_note":"40-60代の暗号資産保有者。誤送金/ウォレット凍結に困っている層。","pain_points":["誤送金","アクセス不能","開けないウォレット"],"value_props":["無料相談","成功報酬","最短提案"],"cta_type":"無料で相談する","brand_color_hex":"#F7931A","logo_url":"https://assets.example.com/logo.png","stat_claim":"復旧成功率97.8%","stat_evidence_url":"https://assets.example.com/evidence.pdf","stat_note":"※2023-2024年/実案件n=345/自社定義の成功を復旧可否で算出","disclaimer_code":"NO_GUARANTEE_OWNER_CHECK","tone":"緊急","style_code":"AUTO"}],"templates":["T1"],"sizes":["1080x1080"],"count_per_template":1,"bg_mode":"generate"}
  JSON
  );
  gcloud workflows execute render-orchestrator \
    --location=asia-northeast1 \
    --data="$PAYLOAD";
  gcloud workflows executions wait <EXECUTION_ID> \
    --workflow=render-orchestrator \
    --location=asia-northeast1;
  ```
- If the workflow succeeds with `{"status":"queued"}`, proceed to downstream service verification.

## Downstream Service Verification
1. **Pub/Sub Topics & Subscriptions**
   - Confirm topics exist: `gcloud pubsub topics list --filter=bg|compose|qc|delivery`.
   - Ensure each Terraform-managed push subscription is present (`terraform output pubsub_push_subscriptions`).
   - For ad-hoc inspection:
     ```bash
     gcloud pubsub subscriptions list --filter=bg-generator-push
     ```
   - Pull a message non-destructively (ack deadline 0) to verify schema.

2. **Cloud Run Services**
   - Check environment variables:
     ```bash
     gcloud run services describe <service> --region=asia-northeast1 --format=json | jq '.spec.template.spec.containers[0].env'
     ```
   - Validate IAM: `workflows-sa` requires `roles/run.invoker`, `roles/pubsub.publisher`, `roles/datastore.user`.

3. **Service Logs**
   - Use Cloud Logging to confirm each stage handles the queued variant:
     ```bash
     gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="bg-generator"' --limit=20 --freshness=1h
     ```
   - Look for matching `variant_id` across `bg-generator`, `compositor`, `qc-service`, `delivery-service`.

4. **Firestore / Storage**
   - Confirm documents updated (`campaigns`, `variants`, `render_jobs`).
   - Ensure assets stored under the expected prefixes in `asset_bucket` and `stock_background_bucket`.

## API & Integration Tasks
- Document and solidify ingestion API contract (request schema, auth, error codes) in `docs/architecture.md` or a dedicated spec.
- New dashboard endpoint: `GET /v1/campaigns/:campaignId/progress` (ingest-api) surfaces per-variant render job status and preview URLs for portal use.
- Align internal service APIs with shared schemas; add response schema utilities to `packages/shared` as needed.
- Verify Slack and Notion integrations in `delivery-service`:
  - Slack Webhook URL managed via Secret Manager; test message formatting and approval flow.
  - Notion API key usage documented; ensure rate limits and retries are implemented.
- Plan for future Slack approval service (event handler) and document expected payloads/actions.

## Monitoring & Alerts
- Review Cloud Monitoring dashboards for error rates and latency across services.
- Ensure alerting policies (e.g., `Banner factory failure rate`) notify the correct Slack channels.
- Consider adding Workflow failure alerts via Cloud Logging sink → Pub/Sub → Slack.

## Testing & QA
- Expand Vitest coverage in `packages/shared` for prompt/copy builders.
- Add integration tests (Fastify inject) for each Cloud Run service where practical.
- Scripted end-to-end test that simulates a campaign end-to-end (including background jobs) for staging environments.

## Documentation
- Keep this runbook updated as procedures evolve.
- Capture incident playbooks (timeouts, Pub/Sub backlog, third-party API failures).
- Share highlights and recent fixes (e.g., Pub/Sub payload encoding change) in team knowledge base.
