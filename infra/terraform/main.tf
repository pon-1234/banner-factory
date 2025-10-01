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
  core_service_names = [
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
  count        = length(local.core_service_names)
  account_id   = local.core_service_names[count.index]
  display_name = "${local.core_service_names[count.index]} service"
}

resource "google_service_account" "campaign_portal" {
  account_id   = "campaign-portal"
  display_name = "campaign-portal service"
}

module "cloud_run_services" {
  source = "./modules/cloud_run_service"

  for_each = var.manage_cloud_run_services ? { for name in local.core_service_names : name => name } : {}

  service_name    = each.key
  region          = var.region
  image           = "${var.artifact_registry}/${each.key}:latest"
  service_account = element(google_service_account.services[*].email, index(local.core_service_names, each.key))
  env = merge(var.default_env, {
    OUTPUT_BUCKET      = google_storage_bucket.assets.name,
    STOCK_BUCKET       = google_storage_bucket.stock_backgrounds.name,
    BG_TOPIC           = google_pubsub_topic.bg.name,
    COMPOSE_TOPIC      = google_pubsub_topic.compose.name,
    QC_TOPIC           = google_pubsub_topic.qc.name,
    DELIVERY_TOPIC     = google_pubsub_topic.delivery.name,
    BG_MODEL           = var.background_model,
    SLACK_WEBHOOK_URL  = var.slack_webhook_url,
    NOTION_API_KEY     = var.notion_api_key,
    NOTION_DATABASE_ID = var.notion_database_id
  })
  secrets = each.key == "compositor" ? {
    OPENAI_API_KEY = {
      secret_name    = "openai-api-key"
      secret_version = "latest"
    }
  } : {}
  ingress        = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  min_instances  = 0
  max_instances  = 5
  cpu_throttling = true
  labels         = local.labels
}

module "campaign_portal_service" {
  source = "./modules/cloud_run_service"

  count = var.deploy_campaign_portal ? 1 : 0

  service_name    = "campaign-portal"
  region          = var.region
  image           = "${var.artifact_registry}/campaign-portal:latest"
  service_account = google_service_account.campaign_portal.email
  env = merge(var.default_env, {
    NEXT_PUBLIC_INGEST_API_BASE_URL = var.campaign_portal_ingest_base_url != "" ? var.campaign_portal_ingest_base_url : data.google_cloud_run_service.ingest_api.status[0].url
  })
  ingress        = "INGRESS_TRAFFIC_ALL"
  min_instances  = 0
  max_instances  = 3
  cpu_throttling = true
  labels         = local.labels
}

resource "google_cloud_run_service_iam_member" "campaign_portal_public" {
  count    = var.deploy_campaign_portal ? 1 : 0
  project  = var.project_id
  location = var.region
  service  = module.campaign_portal_service[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
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

data "google_cloud_run_service" "ingest_api" {
  name     = "ingest-api"
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
