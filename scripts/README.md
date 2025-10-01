# Banner Factory デプロイスクリプト

このディレクトリには、Banner Factory のデプロイに必要なスクリプトが含まれています。

## デプロイ手順

### 前提条件

- Google Cloud SDK (gcloud) がインストールされていること
- Node.js と npm がインストールされていること
- Terraform がインストールされていること
- プロジェクトのルートディレクトリで実行すること

### 自動デプロイ

```bash
# すべてのステップを自動実行
./scripts/deploy.sh
```

### 手動デプロイ（ステップ別）

#### 1. 依存セットアップ
```bash
npm install
npm run build
```

#### 2. gcloud認証とプロジェクト設定
```bash
./scripts/01-setup-gcloud.sh
```

#### 3. Terraformによる基盤構築
```bash
./scripts/02-terraform-deploy.sh
```

#### 4. コンテナビルド＆デプロイ
```bash
./scripts/03-container-deploy.sh
```

#### 5. Secret ManagerとIAM設定
```bash
./scripts/04-secrets-iam.sh
```

#### 6. ワークフロー接続設定
```bash
./scripts/05-workflow-config.sh
```

#### 7. デプロイメントテスト
```bash
./scripts/06-test-deployment.sh
```

## スクリプトの詳細

### 01-setup-gcloud.sh
- gcloud認証
- プロジェクト設定
- 必要なCloud APIsの有効化
- Firestoreの初期化

### 02-terraform-deploy.sh
- Terraformの初期化
- 基盤リソースの構築（バケット、Pub/Sub、Cloud Run、Workflows等）

### 03-container-deploy.sh
- Artifact Registryリポジトリの作成
- 各サービスのコンテナビルド
- Cloud Runへのデプロイ

### 04-secrets-iam.sh
- Secret Managerへのシークレット登録
- サービスアカウントへのIAMロール付与
- サービスへのシークレット割り当て

### 05-workflow-config.sh
- 環境変数の設定
- Workflowsサービスアカウントの設定
- 実行権限の設定

### 06-test-deployment.sh
- テストリクエストの送信
- レスポンスの確認
- ログとジョブの確認方法の案内

## トラブルシューティング

### よくある問題

1. **gcloud認証エラー**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Terraformエラー**
   ```bash
   cd infra/terraform
   terraform init
   terraform plan
   ```

3. **コンテナビルドエラー**
   ```bash
   gcloud builds list --limit=10
   gcloud builds log [BUILD_ID]
   ```

4. **Cloud Runデプロイエラー**
   ```bash
   gcloud run services list --region=asia-northeast1
   gcloud run services describe [SERVICE_NAME] --region=asia-northeast1
   ```

### ログの確認

```bash
# Cloud Run のログ
gcloud logging read 'resource.type="cloud_run_revision"' --limit=50

# 特定のサービスのログ
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="ingest-api"' --limit=50

# Firestore のデータ
gcloud firestore databases documents list --collection-group=banner-jobs
```

## 環境変数

デプロイ時に設定される主要な環境変数：

- `REGION`: asia-northeast1
- `REPO`: banner-factory
- `PROJECT_ID`: banner-factory
- `OPENAI_API_KEY`: Secret Managerから取得（OpenAI Image API）
- `SLACK_WEBHOOK_URL`: Secret Managerから取得
- `NOTION_TOKEN`: Secret Managerから取得

## セキュリティ

- すべてのシークレットは Secret Manager で管理
- サービスアカウントには最小権限の原則を適用
- Cloud Run サービスは認証が必要
- 内部通信は VPC 内で実行
