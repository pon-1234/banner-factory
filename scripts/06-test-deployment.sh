#!/bin/bash

# デプロイメントテストスクリプト

set -e

export PROJECT_ID="${PROJECT_ID:-banner-factory}"
export REGION="${REGION:-asia-northeast1}"

echo "🧪 デプロイメントテストを開始します..."

# Ingest API のURLを取得
INGEST_API_URL=$(gcloud run services describe ingest-api --region=$REGION --format="value(status.url)")

echo "📡 Ingest API URL: $INGEST_API_URL"

TOKEN=$(gcloud auth print-identity-token --audiences=$INGEST_API_URL)

# サンプル入力 (InputSchema)
INPUT_PAYLOAD='{
  "lp_url": "https://example.com/coin-recovery",
  "brand_name": "CoinAssist",
  "objective": "相談",
  "target_note": "40-60代の暗号資産保有者",
  "pain_points": ["誤送金", "アクセス不能", "開けないウォレット"],
  "value_props": ["無料相談", "成功報酬", "最短提案"],
  "cta_type": "無料で相談する",
  "brand_color_hex": "#F7931A",
  "logo_url": "https://assets.example.com/logo.png",
  "stat_claim": "復旧成功率97.8%",
  "stat_evidence_url": "https://assets.example.com/evidence.pdf",
  "stat_note": "※2023-2024年/実案件n=345/自社定義の成功を復旧可否で算出",
  "disclaimer_code": "NO_GUARANTEE_OWNER_CHECK",
  "tone": "緊急",
  "style_code": "AUTO"
}'

echo "📤 キャンペーン作成リクエストを送信します..."
CREATE_RES=$(curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$INPUT_PAYLOAD" \
  "$INGEST_API_URL/v1/campaigns" -s -w "\nHTTP Status: %{http_code}\n")
echo "$CREATE_RES"

if ! echo "$CREATE_RES" | grep -q "HTTP Status: 201"; then
  echo "❌ キャンペーン作成に失敗しました"
  exit 1
fi

CAMPAIGN_ID=$(echo "$CREATE_RES" | grep -o '"campaign_id":"[^"]*"' | cut -d'"' -f4)
echo "🆔 Campaign ID: $CAMPAIGN_ID"

# レンダー実行
RENDER_PAYLOAD=$(cat <<JSON
{
  "inputs": [
    $INPUT_PAYLOAD
  ],
  "templates": ["T1"],
  "sizes": ["1080x1080"],
  "count_per_template": 1,
  "bg_mode": "generate"
}
JSON
)

echo "🚀 レンダーリクエストを送信します..."
RENDER_RES=$(curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$RENDER_PAYLOAD" \
  "$INGEST_API_URL/v1/campaigns/$CAMPAIGN_ID/render" -s -w "\nHTTP Status: %{http_code}\n")
echo "$RENDER_RES"

if echo "$RENDER_RES" | grep -q "HTTP Status: 202"; then
  echo "✅ レンダーリクエストがキューに入りました"
else
  echo "❌ レンダーリクエストに失敗しました"
  exit 1
fi

# Cloud Loggingでログを確認
echo "📋 Cloud Loggingでログを確認します..."
echo "以下のコマンドでログを確認できます:"
echo "gcloud logging read 'resource.type=\"cloud_run_revision\"' --limit=50 --format='table(timestamp,severity,textPayload)'"

# Firestoreでジョブの確認
echo "🗄️ Firestoreでジョブの確認方法:"
echo "gcloud firestore databases documents list --collection-group=render_job"

echo "✅ デプロイメントテストが完了しました！"
