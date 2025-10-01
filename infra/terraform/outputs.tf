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
  value = google_service_account.services[*].email
}

output "workflows_render_id" {
  value       = try(google_workflows_workflow.render[0].name, null)
  description = "Render orchestrator workflow name when managed"
}
