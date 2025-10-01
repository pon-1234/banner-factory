output "asset_bucket" {
  value = google_storage_bucket.assets.name
}

output "stock_background_bucket" {
  value = google_storage_bucket.stock_backgrounds.name
}

output "pubsub_topics" {
  value = {
    bg       = google_pubsub_topic.bg.name
    compose  = google_pubsub_topic.compose.name
    qc       = google_pubsub_topic.qc.name
    delivery = google_pubsub_topic.delivery.name
  }
}

output "pubsub_push_subscriptions" {
  value = { for key, sub in google_pubsub_subscription.push : key => sub.name }
}

output "service_accounts" {
  value = concat(
    [for account in google_service_account.services : account.email],
    [google_service_account.campaign_portal.email]
  )
}

output "workflows_render_id" {
  value       = try(google_workflows_workflow.render[0].name, null)
  description = "Render orchestrator workflow name when managed"
}

output "background_model" {
  value       = var.background_model
  description = "Gemini image model used for background generation"
}

output "campaign_portal_url" {
  value       = var.deploy_campaign_portal ? module.campaign_portal_service[0].uri : null
  description = "Public URL for the campaign portal Cloud Run service"
}
