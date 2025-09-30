#!/bin/bash

# ワークフロー接続設定スクリプト

set -e

export PROJECT_ID="banner-factory"
export REGION="asia-northeast1"

echo "🔄 ワークフロー接続設定を開始します..."

# 環境変数を各サービスに設定
echo "⚙️ サービスに環境変数を設定します..."

# Prompt Builder のホスト設定
PROMPT_BUILDER_HOST=$(gcloud run services describe prompt-builder --region=$REGION --format="value(status.url)")

# Pub/Sub トピック名の取得
BG_TOPIC="bg-tasks"
COMPOSE_TOPIC="compose-tasks"
QC_TOPIC="qc-tasks"
DELIVERY_TOPIC="delivery-tasks"

# 各サービスに環境変数を設定
services=("ingest-api" "prompt-builder" "bg-generator" "compositor" "qc-service" "delivery-service")

for svc in "${services[@]}"; do
    echo "🔧 $svc に環境変数を設定します..."
    
    gcloud run services update $svc \
        --region=$REGION \
        --update-env-vars="PROMPT_BUILDER_HOST=$PROMPT_BUILDER_HOST,BG_TOPIC=$BG_TOPIC,COMPOSE_TOPIC=$COMPOSE_TOPIC,QC_TOPIC=$QC_TOPIC,DELIVERY_TOPIC=$DELIVERY_TOPIC"
done

# Workflows サービスアカウントの設定
echo "👤 Workflows サービスアカウントを設定します..."

# Workflows サービスアカウントの作成
gcloud iam service-accounts create workflows-sa \
    --display-name="Workflows Service Account" \
    --description="Service account for Workflows execution"

# Workflows サービスアカウントに必要なロールを付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:workflows-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/run.invoker"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:workflows-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:workflows-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/datastore.user"

# Workflows の実行権限を設定
echo "🔄 Workflows の実行権限を設定します..."

gcloud workflows workflows add-iam-policy-binding render-orchestrator \
    --location=$REGION \
    --member="serviceAccount:workflows-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/workflows.invoker"

echo "✅ ワークフロー接続設定が完了しました！"
