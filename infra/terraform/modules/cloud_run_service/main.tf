variable "service_name" {
  type = string
}

variable "region" {
  type = string
}

variable "image" {
  type = string
}

variable "service_account" {
  type = string
}

variable "env" {
  type    = map(string)
  default = {}
}

variable "ingress" {
  type    = string
  default = "all"
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 5
}

variable "cpu_throttling" {
  type    = bool
  default = true
}

resource "google_cloud_run_v2_service" "service" {
  name     = var.service_name
  location = var.region
  ingress  = var.ingress
  labels   = var.labels

  template {
    service_account = var.service_account
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
    containers {
      image = var.image
      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = var.cpu_throttling
      }
    }
  }
}

output "uri" {
  value = google_cloud_run_v2_service.service.uri
}
