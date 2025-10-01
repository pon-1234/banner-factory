project_id            = "banner-factory"
region                = "asia-northeast1"
asset_bucket_name     = "banner-factory-assets"
stock_bucket_name     = "banner-factory-stock"
artifact_registry     = "asia-northeast1-docker.pkg.dev/banner-factory/banner-factory"
logging_dataset       = "banner_factory_logs"
background_model      = "gemini-2.5-flash-image-preview"
slack_webhook_url     = "https://hooks.slack.com/services/..."
notion_api_key        = "secret_..."
notion_database_id    = "..."
notification_channels = []
default_env = {
  "NODE_ENV"      = "production"
  "GCLOUD_REGION" = "asia-northeast1"
}
manage_cloud_run_services = true
