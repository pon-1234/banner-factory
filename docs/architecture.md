# Banner Factory Architecture

## Objectives
- Accept multi-channel campaign inputs (form/CSV/JSON) and translate them into consistent banner variants.
- Render final creatives through OpenAI image models while preserving deterministic fallbacks.
- Auto-expand to multiple aspect ratios (1:1, 4:5, 1200×628, 1080×1920) while respecting safe zones and layout rules.
- Enforce QC/compliance gates (text legibility, forbidden claims, stat evidence) prior to delivery.
- Deliver final assets and metadata to Slack/Notion along with audit trails and approvals.

## High-level data flow

```mermaid
flowchart LR
    subgraph ingest[Ingestion]
        form[Input Form]
        csv[Bulk CSV]
        api[JSON API]
    end
    form & csv & api --> run1(Cloud Run: ingest-api)
    run1 --> fs[(Firestore: campaign, input)]
    run1 --> wf(Cloud Workflows: render-orchestrator)

    wf --> pub[Pub/Sub: render-tasks]
    pub --> tasks[Cloud Tasks: bg-queue]
    tasks --> run2(Cloud Run Job: prompt-builder)
    run2 --> run3(Cloud Run Job: bg-generator)
    run3 --> storage[(Cloud Storage: banner-assets)]

    storage --> run4(Cloud Run Job: compositor)
    run4 --> run5(Cloud Run: qc-service)
    run5 --> storage
    run5 --> fs

    run5 --> run6(Cloud Run: delivery-service)
    run6 --> slack[Slack Webhook]
    run6 --> notion[Notion API]
    run6 --> fs
```

## Core services

### ingest-api (Cloud Run)
- REST endpoints for form/UI submissions and bulk uploads.
- Validates against shared JSON Schemas (see `packages/shared/schemas`).
- Creates `campaign` documents, expands render requests into prompt-builder variants, and enqueues background generation tasks.
- Provides `GET /campaigns/:id` for status and metadata retrieval.
- Exposes `GET /campaigns/:id/progress` to aggregate render job states for the campaign portal dashboard.

### render-orchestrator (Cloud Workflows)
- Reads templates, sizes, and variant counts from request payload.
- Generates deterministic IDs (`variant_id`, `render_job_id`).
- Publishes tasks to `render-tasks` Pub/Sub for prompt + background generation.
- Implements retry/backoff policies and fallbacks (e.g., switch to stock background).

### prompt-builder (Cloud Run Job)
- Resolves template config (T1/T2/T3) and tone/style modifiers.
- Builds image prompts and records prompt hash + references in Firestore `variant` documents.

### bg-generator (Cloud Run Job)
- Enriches prompt payloads and republishes compose tasks for each requested aspect ratio.
- Records generation metadata (provider, timestamps) on the `variant` document in Firestore.
- No longer creates intermediate background layers; downstream services render the final creative.

```ts
import OpenAI from "openai";
import * as fs from "node:fs";

async function main() {
  const client = new OpenAI();
  const prompt = [
    "Elegant Japanese financial advertisement",
    "Tone: 緊急",
    "Include headline: コインアシストの緊急復旧チーム",
    "Include CTA: 今すぐ無料相談"
  ].join("\n");

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    response_format: "b64_json"
  });

  const base64 = response.data?.[0]?.b64_json;
  if (!base64) return;
  const buffer = Buffer.from(base64, "base64");
  fs.writeFileSync("openai-banner.png", buffer);
}

void main();
```

### compositor (Cloud Run Job)
- Calls the OpenAI Image API (`gpt-image-1` by default) to render complete banners with integrated text.
- Persists generation metadata JSON alongside PNG/JPEG outputs and updates `render_job` status.
- Falls back to deterministic Canvas rendering when the API fails or the key is unavailable.

### qc-service (Cloud Run)
- Runs text legibility checks, safe zone validation, and ensures stat claims include evidence.
- Invokes Cloud Vision OCR to detect embedded text inside background layers.
- Calls Vertex AI endpoint to score facial expressions if backgrounds contain people.
- Flags issues for manual review; supports auto-regeneration with modified tone/intensity.

### delivery-service (Cloud Run)
- Monitors Firestore for QC-passed assets (via Eventarc trigger) and posts Slack/Notion messages.
- Handles approval workflow (two :+1: reactions) before marking assets as "publishable".

### campaign-portal (Cloud Run)
- Next.js front-end for internal teams to submit campaign briefs.
- Calls `ingest-api` via the `NEXT_PUBLIC_INGEST_API_BASE_URL` environment variable.
- Served publicly via Cloud Run with static assets generated at build time.
- Includes `/campaign/[campaignId]/progress` dashboard to inspect render statuses and previews sourced from Firestore.

## Storage layout
```
/gs://banner-assets/{brand}/{campaign_id}/{date}/
  T1-emergency-1080x1080-v01_slug.png
  T1-emergency-1200x628-v01_slug.png
  meta/T1-v01.json
  previews/T1-emergency-1080x1080-v01.jpg
```
- Metadata JSON contains input payloads, prompt text, refs hash, generation timestamps, QC report summary.

## Datastore (Firestore) schema
- `campaign`: brand, lp_url, objective, style_code, created_at, status, approvals.
- `template`: template_code, layout JSON (grid, safe zones, text styles), updated_at.
- `variant`: campaign_id, template_code, tone, prompt_hash, refs_hash, bg_asset_path.
- `render_job`: campaign_id, variant_id, size, status (`queued`→`processing`→`composited`→`qc_passed`→`delivered`), asset/preview URLs, generation metadata, QC findings.
- `asset`: render_job_id, storage_path, preview_url, qc_passed.
- `evidence`: stat_claim_id, url, note, verified_by, verified_at.

## Workflow resilience
- Cloud Tasks ensures idempotent job execution with dedupe keys per variant/size.
- Workflows catches errors and triggers fallback flows defined in `docs/recovery.md`.
- Alerting via Cloud Monitoring for error rate, render latency, QC failure rate.

## Security & compliance
- Cloud Armor fronting HTTPS Load Balancer to protect public endpoints.
- Service-to-service auth with IAM service accounts and Audience-limited OAuth tokens.
- Secret Manager for API keys (OpenAI, Slack, Notion) with automatic rotation.
- VPC Service Controls around Storage/Firestore to prevent data exfiltration.

## Deployment pipeline
- Cloud Build triggers on main branch merges.
- Builds container images per service and pushes to Artifact Registry.
- Cloud Deploy orchestrates staged rollouts (dev → staging → prod) per environment.

## Local development
- Run individual services with `npm run dev --workspace services/<service>`.
- Use `tasks/local/` scripts to simulate Workflows/Cloud Tasks by invoking service entrypoints sequentially.
- Exercise the fallback Canvas path during local runs to avoid unnecessary OpenAI usage.
