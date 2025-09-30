# Deployment Guide

## Prerequisites
- Google Cloud project with billing enabled.
- `gcloud` CLI >= 456.0.0 authenticated against the project.
- Terraform >= 1.6.0.
- Cloud Build and Artifact Registry APIs enabled.
- Firestore (Native mode) database initialised in the target project.

## Bootstrap infrastructure

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with project-specific values
terraform init
terraform apply
```

The apply step provisions:
- Cloud Storage buckets for assets and stock backgrounds
- Pub/Sub topics for each pipeline stage
- Cloud Run services (with placeholder container images)
- Cloud Workflows definition for orchestration
- Monitoring alert policies and log sinks

## Build and push service images
Use Cloud Build or your preferred CI tool to build and push each service container. Example with Cloud Build (project ID `banner-factory`, project number `572452461891`):

```bash
PROJECT_ID="banner-factory"
REGION="asia-northeast1"
REPO="banner-factory"
for svc in ingest-api prompt-builder bg-generator compositor qc-service delivery-service; do
  gcloud builds submit --tag \
    "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${svc}:$(git rev-parse --short HEAD)" \
    ./services/${svc}
  gcloud run deploy ${svc} \
    --region=${REGION} \
    --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${svc}:$(git rev-parse --short HEAD)" \
    --platform=managed \
    --allow-unauthenticated=false
done
```

## Configure secrets
Store API keys and tokens in Secret Manager and inject them into Cloud Run services:

```bash
gcloud secrets create nano-banana-key --data-file=- <<'EOF'
YOUR_NANO_BANANA_KEY
EOF

for svc in bg-generator ingest-api compositor qc-service delivery-service; do
  gcloud run services update ${svc} \
    --region=${REGION} \
    --set-secrets=NANO_BANANA_API_KEY=nano-banana-key:latest
done
```

Similarly, create secrets for Slack webhook and Notion token, then attach them via `--set-secrets`.

## Workflows trigger
Create an HTTPS trigger or schedule to invoke the workflow when ingestion occurs. Example using REST call:

```bash
curl -X POST \
  "https://workflowexecutions.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/workflows/render-orchestrator/executions" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{"argument": "{\"campaign_id\":\"cmp_123\",\"templates\":[\"T1\",\"T2\"],\"sizes\":[\"1080x1080\"],\"count_per_template\":2}"}'
```

## Observability
- Cloud Logging contains JSON logs from each service. Use log-based metrics to monitor failure rates.
- Cloud Monitoring alert policy `Banner factory failure rate` triggers when background generation errors exceed thresholds.
- Export logs to BigQuery dataset (`logging_dataset`) for long-term analysis.

## Approval workflow
Reactions in Slack (`:+1:`) should be handled by a separate Cloud Run service (future work) subscribed to Slack Events API. The delivery service records initial delivery; human approval transitions Firestore `campaign.status` to `approved` via admin tooling.
