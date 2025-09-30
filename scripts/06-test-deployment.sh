#!/bin/bash

# デプロイメントテストスクリプト

set -e

export PROJECT_ID="banner-factory"
export REGION="asia-northeast1"

echo "🧪 デプロイメントテストを開始します..."

# Ingest API のURLを取得
INGEST_API_URL=$(gcloud run services describe ingest-api --region=$REGION --format="value(status.url)")

echo "📡 Ingest API URL: $INGEST_API_URL"

# テスト用のリクエストデータ
TEST_DATA='{
  "prompt": "Create a modern banner for a tech startup",
  "dimensions": {
    "width": 1200,
    "height": 630
  },
  "style": "modern",
  "color_scheme": "blue"
}'

echo "📤 テストリクエストを送信します..."
echo "リクエストデータ: $TEST_DATA"

# テストリクエストの送信
RESPONSE=$(curl -X POST \
  -H "Content-Type: application/json" \
  -d "$TEST_DATA" \
  "$INGEST_API_URL/api/banners" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s)

echo "📥 レスポンス:"
echo "$RESPONSE"

# レスポンスの確認
if echo "$RESPONSE" | grep -q "HTTP Status: 200\|HTTP Status: 201"; then
    echo "✅ テストリクエストが成功しました！"
    
    # ジョブIDを抽出（レスポンスに含まれている場合）
    JOB_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4 || echo "")
    
    if [ ! -z "$JOB_ID" ]; then
        echo "🆔 ジョブID: $JOB_ID"
        echo "📊 Firestoreでジョブの進行状況を確認できます"
    fi
else
    echo "❌ テストリクエストが失敗しました"
    exit 1
fi

# Cloud Loggingでログを確認
echo "📋 Cloud Loggingでログを確認します..."
echo "以下のコマンドでログを確認できます:"
echo "gcloud logging read 'resource.type=\"cloud_run_revision\"' --limit=50 --format='table(timestamp,severity,textPayload)'"

# Firestoreでジョブの確認
echo "🗄️ Firestoreでジョブの確認方法:"
echo "gcloud firestore databases documents list --collection-group=banner-jobs"

echo "✅ デプロイメントテストが完了しました！"
