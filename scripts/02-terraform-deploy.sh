#!/bin/bash

# Terraformによる基盤構築スクリプト

set -e

echo "🏗️ Terraformによる基盤構築を開始します..."

cd infra/terraform

# terraform.tfvarsファイルの確認
if [ ! -f "terraform.tfvars" ]; then
    echo "⚠️ terraform.tfvarsファイルが見つかりません。"
    echo "terraform.tfvars.exampleをコピーして設定してください。"
    cp terraform.tfvars.example terraform.tfvars
    echo "📝 terraform.tfvarsファイルを作成しました。必要に応じて値を調整してください。"
    exit 1
fi

# Terraform初期化
echo "🔧 Terraformを初期化します..."
terraform init

# Terraformプラン
echo "📋 Terraformプランを作成します..."
terraform plan

# Terraform適用
echo "🚀 Terraformを適用します..."
terraform apply -auto-approve

echo "✅ Terraformによる基盤構築が完了しました！"
