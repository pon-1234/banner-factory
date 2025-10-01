#!/bin/bash

# Secret ManagerとIAM設定スクリプト

set -e

export PROJECT_ID="${PROJECT_ID:-banner-factory}"
export REGION="${REGION:-asia-northeast1}"

echo "🔐 Secret ManagerとIAM設定を開始します..."

# 既存のterraform.tfvarsから値を補完（環境変数未指定時）
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
TFVARS_FILE="$ROOT_DIR/infra/terraform/terraform.tfvars"
if [ -f "$TFVARS_FILE" ]; then
  if [ -z "$SLACK_WEBHOOK_URL" ]; then
    SLACK_WEBHOOK_URL=$(awk -F'=' '/^slack_webhook_url/ {print $2}' "$TFVARS_FILE" | tr -d ' "' | sed 's/#.*$//' | head -n1)
  fi
  if [ -z "$NOTION_API_KEY" ]; then
    NOTION_API_KEY=$(awk -F'=' '/^notion_api_key/ {print $2}' "$TFVARS_FILE" | tr -d ' "' | sed 's/#.*$//' | head -n1)
  fi
  if [ -z "$NOTION_DATABASE_ID" ]; then
    NOTION_DATABASE_ID=$(awk -F'=' '/^notion_database_id/ {print $2}' "$TFVARS_FILE" | tr -d ' "' | sed 's/#.*$//' | head -n1)
  fi
fi

# Secret Managerにシークレットを登録
echo "🔑 Secret Managerにシークレットを登録します..."

NANO_BANANA_API_KEY=${NANO_BANANA_API_KEY:-""}
echo "$NANO_BANANA_API_KEY" | gcloud secrets create nano-banana-api-key --data-file=- || \
echo "$NANO_BANANA_API_KEY" | gcloud secrets versions add nano-banana-api-key --data-file=-

# Slack Webhook URL
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-""}
echo "$SLACK_WEBHOOK_URL" | gcloud secrets create slack-webhook-url --data-file=- || \
echo "$SLACK_WEBHOOK_URL" | gcloud secrets versions add slack-webhook-url --data-file=-

## Notion API Key
NOTION_API_KEY=${NOTION_API_KEY:-""}
echo "$NOTION_API_KEY" | gcloud secrets create notion-api-key --data-file=- || \
echo "$NOTION_API_KEY" | gcloud secrets versions add notion-api-key --data-file=-

## Notion Database ID
NOTION_DATABASE_ID=${NOTION_DATABASE_ID:-""}
echo "$NOTION_DATABASE_ID" | gcloud secrets create notion-database-id --data-file=- || \
echo "$NOTION_DATABASE_ID" | gcloud secrets versions add notion-database-id --data-file=-

# サービスアカウントにIAMロールを付与
echo "👤 サービスアカウントにIAMロールを付与します..."

services=("ingest-api" "prompt-builder" "bg-generator" "compositor" "qc-service" "delivery-service")

for svc in "${services[@]}"; do
    echo "🔧 $svc サービスアカウントにロールを付与します..."
    
    # Firestore Client
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${svc}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/datastore.user"
    
    # Pub/Sub Publisher/Subscriber
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${svc}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/pubsub.publisher"
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${svc}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/pubsub.subscriber"
    
    # Storage Object Admin
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${svc}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/storage.objectAdmin"
    
    # Secret Manager Secret Accessor
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${svc}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor"
    
    # Cloud Run Invoker
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${svc}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/run.invoker"
done

# 各サービスにシークレットを割り当て
echo "🔗 サービスにシークレットを割り当てます..."

for svc in "${services[@]}"; do
    echo "🔗 $svc にシークレットを割り当てます..."
    # 競合する既存の平文ENVを削除
    gcloud run services update $svc \
        --region=$REGION \
        --remove-env-vars="NANO_BANANA_API_KEY,SLACK_WEBHOOK_URL,NOTION_API_KEY,NOTION_DATABASE_ID" || true

    gcloud run services update $svc \
        --region=$REGION \
        --set-secrets="NANO_BANANA_API_KEY=nano-banana-api-key:latest,GOOGLE_API_KEY=nano-banana-api-key:latest,SLACK_WEBHOOK_URL=slack-webhook-url:latest,NOTION_API_KEY=notion-api-key:latest,NOTION_DATABASE_ID=notion-database-id:latest"
done

echo "✅ Secret ManagerとIAM設定が完了しました！"
