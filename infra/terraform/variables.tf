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

variable "nano_banana_endpoint" {
  type        = string
  description = "Base URL for nano banana API"
  default     = "https://api.nano-banana.invalid"
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

variable "logging_dataset" {
  type        = string
  description = "BigQuery dataset for log sink"
}

variable "notification_channels" {
  type        = list(string)
  description = "Monitoring notification channels"
  default     = []
}
