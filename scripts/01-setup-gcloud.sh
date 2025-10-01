#!/bin/bash

# Banner Factory デプロイセットアップスクリプト
# このスクリプトは gcloud の認証とプロジェクト設定を行います

set -e

echo "🚀 Banner Factory デプロイセットアップを開始します..."

# 環境変数の設定
export REGION="${REGION:-asia-northeast1}"
export REPO="${REPO:-banner-factory}"
export PROJECT_ID="${PROJECT_ID:-banner-factory}"

echo "📋 環境変数:"
echo "  REGION: $REGION"
echo "  REPO: $REPO"
echo "  PROJECT_ID: $PROJECT_ID"

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [ -z "$ACTIVE_ACCOUNT" ]; then
  echo "🔐 gcloud認証を実行します..."
  gcloud auth login
else
  echo "🔐 既に認証済み: $ACTIVE_ACCOUNT"
fi

# プロジェクト設定
echo "⚙️ プロジェクトを設定します..."
gcloud config set project $PROJECT_ID

# 必要なAPIの有効化
echo "🔧 必要なCloud APIsを有効化します..."
gcloud services enable \
  iam.googleapis.com \
  run.googleapis.com \
  workflows.googleapis.com \
  pubsub.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudtasks.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com

# Firestoreの初期化
echo "🗄️ Firestoreをネイティブモードで初期化します... (存在する場合はスキップ)"
gcloud firestore databases create --location=$REGION --type=firestore-native || echo "Firestore は既に初期化済み"

echo "✅ gcloudセットアップが完了しました！"
