#!/bin/bash

# コンテナビルド＆デプロイスクリプト

set -e

# 環境変数の設定
export REGION="asia-northeast1"
export REPO="banner-factory"
export PROJECT_ID="banner-factory"

echo "🐳 コンテナビルド＆デプロイを開始します..."

# Artifact Registryリポジトリの作成
echo "📦 Artifact Registryリポジトリを作成します..."
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION \
  --description="Banner Factory container images" || echo "リポジトリは既に存在します"

# 依存関係のインストールとビルド
echo "📦 依存関係をインストールしてビルドします..."
npm install
npm run build

# 各サービスのビルドとデプロイ
services=("ingest-api" "prompt-builder" "bg-generator" "compositor" "qc-service" "delivery-service")

for svc in "${services[@]}"; do
    echo "🔨 $svc をビルドしています..."
    
    # コンテナイメージのビルド
    gcloud builds submit --tag \
        "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${svc}:$(git rev-parse --short HEAD)" \
        ./services/${svc}
    
    echo "🚀 $svc をデプロイしています..."
    
    # Cloud Runへのデプロイ
    gcloud run deploy ${svc} \
        --region=${REGION} \
        --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${svc}:$(git rev-parse --short HEAD)" \
        --platform=managed \
        --allow-unauthenticated=false \
        --service-account="${svc}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    echo "✅ $svc のデプロイが完了しました"
done

echo "🎉 すべてのサービスのデプロイが完了しました！"
