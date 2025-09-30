# Banner Factory on GCP

This repository contains the reference implementation for an automated banner generation pipeline built on Google Cloud Platform. The system ingests campaign inputs, orchestrates background image generation, composes banners across multiple aspect ratios, runs automated QC checks, and distributes approved assets to Slack and Notion.

## Repository layout

- `docs/`	Design documentation, sequence diagrams, and runbooks.
- `infra/terraform/`	Infrastructure-as-code for core GCP resources (Cloud Run, Workflows, Pub/Sub, Firestore, Storage, Monitoring).
- `packages/shared/`	Shared TypeScript library with schema definitions, validation helpers, and common utilities.
- `services/`	Cloud Run services and Cloud Run Jobs implementing ingestion, prompt building, background generation, composition, QC, and delivery flows.
- `tasks/`	Cloud Tasks/Workflows definitions plus local simulation tooling.

## Getting started

1. Install Node.js 20.x and Terraform 1.6+ locally.
2. Run `npm install` at repo root to install workspace dependencies.
3. Copy `infra/terraform/terraform.tfvars.example` to `terraform.tfvars` and adjust values (defaults assume GCP project `banner-factory`, project number `572452461891`).
4. Deploy infrastructure with Terraform, then deploy each Cloud Run service using Cloud Build or `gcloud run deploy` (see `docs/deployment.md`).

For a detailed high-level architecture overview, see `docs/architecture.md`.
