#!/bin/bash

# Banner Factory デプロイメインスクリプト

set -e

echo "🚀 Banner Factory デプロイを開始します..."

# スクリプトの実行権限を付与
chmod +x scripts/*.sh

# 1. 依存セットアップ
echo "📦 依存関係をセットアップします..."
npm install
npm run build

# 2. gcloud認証とプロジェクト設定
echo "🔐 gcloud認証とプロジェクト設定を実行します..."
./scripts/01-setup-gcloud.sh

# 3. Terraformによる基盤構築
echo "🏗️ Terraformによる基盤構築を実行します..."
./scripts/02-terraform-deploy.sh

# 4. コンテナビルド＆デプロイ
echo "🐳 コンテナビルド＆デプロイを実行します..."
./scripts/03-container-deploy.sh

# 5. Secret ManagerとIAM設定
echo "🔐 Secret ManagerとIAM設定を実行します..."
./scripts/04-secrets-iam.sh

# 6. ワークフロー接続設定
echo "🔄 ワークフロー接続設定を実行します..."
./scripts/05-workflow-config.sh

# 7. デプロイメントテスト
echo "🧪 デプロイメントテストを実行します..."
./scripts/06-test-deployment.sh

echo "🎉 Banner Factory のデプロイが完了しました！"
echo ""
echo "📋 次のステップ:"
echo "1. Cloud Console でサービスが正常に動作していることを確認"
echo "2. Firestore でジョブの進行状況を監視"
echo "3. Cloud Logging でログを確認"
echo "4. 必要に応じて Slack/Notion の通知設定を確認"
