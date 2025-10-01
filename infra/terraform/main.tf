terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.20.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 5.20.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

locals {
  labels = merge(var.labels, {
    app = "banner-factory"
  })
  services = [
    "ingest-api",
    "prompt-builder",
    "bg-generator",
    "compositor",
    "qc-service",
    "delivery-service"
  ]
}


resource "google_storage_bucket" "assets" {
  name                        = var.asset_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  labels                      = local.labels

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
    condition {
      age = 30
    }
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 365
    }
  }
}

resource "google_storage_bucket" "stock_backgrounds" {
  name                        = var.stock_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  labels                      = local.labels
}

resource "google_pubsub_topic" "bg" {
  name   = "bg-tasks"
  labels = local.labels
}

resource "google_pubsub_topic" "compose" {
  name   = "compose-tasks"
  labels = local.labels
}

resource "google_pubsub_topic" "qc" {
  name   = "qc-tasks"
  labels = local.labels
}

resource "google_pubsub_topic" "delivery" {
  name   = "delivery-tasks"
  labels = local.labels
}

resource "google_service_account" "services" {
  count        = length(local.services)
  account_id   = local.services[count.index]
  display_name = "${local.services[count.index]} service"
}

module "cloud_run_services" {
  source = "./modules/cloud_run_service"

  for_each = var.manage_cloud_run_services ? toset(local.services) : toset([])

  service_name    = each.key
  region          = var.region
  image           = "${var.artifact_registry}/${each.key}:latest"
  service_account = element(google_service_account.services[*].email, index(local.services, each.key))
  env = merge(var.default_env, {
    OUTPUT_BUCKET        = google_storage_bucket.assets.name,
    STOCK_BUCKET         = google_storage_bucket.stock_backgrounds.name,
    BG_TOPIC             = google_pubsub_topic.bg.name,
    COMPOSE_TOPIC        = google_pubsub_topic.compose.name,
    QC_TOPIC             = google_pubsub_topic.qc.name,
    DELIVERY_TOPIC       = google_pubsub_topic.delivery.name,
    NANO_BANANA_ENDPOINT = var.nano_banana_endpoint,
    SLACK_WEBHOOK_URL    = var.slack_webhook_url,
    NOTION_API_KEY       = var.notion_api_key,
    NOTION_DATABASE_ID   = var.notion_database_id
  })
  ingress        = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  min_instances  = 0
  max_instances  = 5
  cpu_throttling = true
  labels         = local.labels
}

locals {
  push_subscriptions = {
    "bg-generator" = {
      topic = google_pubsub_topic.bg.name
      path  = "/tasks/bg-generator"
    }
    "compositor" = {
      topic = google_pubsub_topic.compose.name
      path  = "/tasks/compositor"
    }
    "qc-service" = {
      topic = google_pubsub_topic.qc.name
      path  = "/tasks/qc"
    }
    "delivery-service" = {
      topic = google_pubsub_topic.delivery.name
      path  = "/tasks/delivery"
    }
  }
}

data "google_cloud_run_service" "push_targets" {
  for_each = local.push_subscriptions

  name     = each.key
  location = var.region
}

resource "google_pubsub_subscription" "push" {
  for_each = local.push_subscriptions

  name  = "${each.key}-push"
  topic = each.value.topic

  ack_deadline_seconds = 600

  push_config {
    push_endpoint = "${data.google_cloud_run_service.push_targets[each.key].status[0].url}${each.value.path}"
    oidc_token {
      service_account_email = "${each.key}@${var.project_id}.iam.gserviceaccount.com"
      audience              = data.google_cloud_run_service.push_targets[each.key].status[0].url
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_workflows_workflow" "render" {
  count       = var.manage_render_workflow ? 1 : 0
  name        = "render-orchestrator"
  description = "Orchestrates banner background generation and composition"
  region      = var.region
  labels      = local.labels

  source_contents = file("${path.module}/../../tasks/workflows/render-orchestrator.yaml")
}

resource "google_cloud_tasks_queue" "bg" {
  name     = "bg-generator"
  location = var.region
}

resource "google_logging_project_sink" "errors" {
  name        = "banner-factory-errors"
  destination = "bigquery.googleapis.com/projects/${var.project_id}/datasets/${var.logging_dataset}"
  filter      = "severity>=ERROR"

  bigquery_options {
    use_partitioned_tables = true
  }
}

resource "google_monitoring_alert_policy" "high_failure" {
  display_name = "Banner factory failure rate"
  combiner     = "OR"

  conditions {
    display_name = "High background failure rate"
    condition_threshold {
      filter = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"bg-generator\" AND metric.labels.response_code=\"5xx\""
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_DELTA"
      }
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.notification_channels
}
