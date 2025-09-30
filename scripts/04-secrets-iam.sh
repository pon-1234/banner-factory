#!/bin/bash

# Secret ManagerとIAM設定スクリプト

set -e

export PROJECT_ID="banner-factory"
export REGION="asia-northeast1"

echo "🔐 Secret ManagerとIAM設定を開始します..."

# Secret Managerにシークレットを登録
echo "🔑 Secret Managerにシークレットを登録します..."

# nano banana API キー
echo "Nano Banana APIキーを登録してください:"
read -s NANO_BANANA_API_KEY
echo "$NANO_BANANA_API_KEY" | gcloud secrets create nano-banana-api-key --data-file=- || \
echo "$NANO_BANANA_API_KEY" | gcloud secrets versions add nano-banana-api-key --data-file=-

# Slack Webhook URL
echo "Slack Webhook URLを登録してください:"
read -s SLACK_WEBHOOK_URL
echo "$SLACK_WEBHOOK_URL" | gcloud secrets create slack-webhook-url --data-file=- || \
echo "$SLACK_WEBHOOK_URL" | gcloud secrets versions add slack-webhook-url --data-file=-

# Notion Token
echo "Notion API Tokenを登録してください:"
read -s NOTION_TOKEN
echo "$NOTION_TOKEN" | gcloud secrets create notion-token --data-file=- || \
echo "$NOTION_TOKEN" | gcloud secrets versions add notion-token --data-file=-

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
    
    gcloud run services update $svc \
        --region=$REGION \
        --set-secrets="NANO_BANANA_API_KEY=nano-banana-api-key:latest,SLACK_WEBHOOK_URL=slack-webhook-url:latest,NOTION_TOKEN=notion-token:latest"
done

echo "✅ Secret ManagerとIAM設定が完了しました！"
