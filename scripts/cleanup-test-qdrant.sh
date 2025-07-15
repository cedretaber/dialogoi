#!/bin/bash
# Qdrant Docker コンテナのクリーンアップスクリプト

set -e

echo "🧹 Qdrant Docker コンテナのクリーンアップを開始します..."

# コンテナを停止
if docker ps -q -f name=dialogoi-test-qdrant > /dev/null 2>&1; then
    echo "⚠️  コンテナ 'dialogoi-test-qdrant' を停止中..."
    docker stop dialogoi-test-qdrant
fi

# コンテナを削除
if docker ps -aq -f name=dialogoi-test-qdrant > /dev/null 2>&1; then
    echo "🗑️  コンテナ 'dialogoi-test-qdrant' を削除中..."
    docker rm dialogoi-test-qdrant
fi

echo "✅ Qdrant コンテナのクリーンアップが完了しました"