variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  description = "Primary region for Cloud Run and Workflows"
  default     = "asia-northeast1"
}

variable "asset_bucket_name" {
  type        = string
  description = "Storage bucket for generated assets"
}

variable "stock_bucket_name" {
  type        = string
  description = "Storage bucket for fallback backgrounds"
}

variable "artifact_registry" {
  type        = string
  description = "Artifact Registry repository path"
}

variable "slack_webhook_url" {
  type        = string
  description = "Slack Incoming Webhook URL"
  default     = ""
}

variable "notion_api_key" {
  type        = string
  description = "Notion integration token"
  default     = ""
}

variable "notion_database_id" {
  type        = string
  description = "Notion database ID for delivery logging"
  default     = ""
}

variable "campaign_portal_ingest_base_url" {
  type        = string
  description = "Override for the portal ingest API base URL; defaults to the ingest-api Cloud Run URL"
  default     = ""
}

variable "deploy_campaign_portal" {
  type        = bool
  description = "Whether to manage the campaign portal Cloud Run service"
  default     = true
}

variable "labels" {
  type        = map(string)
  description = "Common resource labels"
  default     = {}
}

variable "default_env" {
  type        = map(string)
  description = "Default environment variables shared across services"
  default     = {}
}

variable "background_model" {
  type        = string
  description = "Gemini image model identifier for background generation"
  default     = "gemini-2.5-flash-image-preview"
}

variable "logging_dataset" {
  type        = string
  description = "BigQuery dataset for log sink"
}

variable "notification_channels" {
  type        = list(string)
  description = "Monitoring notification channels"
  default     = []
}

variable "manage_render_workflow" {
  type        = bool
  description = "Whether Terraform should manage the render orchestrator workflow"
  default     = false
}

variable "manage_cloud_run_services" {
  type        = bool
  description = "Whether Terraform should manage Cloud Run services (set to true for full infra control)"
  default     = false
}
