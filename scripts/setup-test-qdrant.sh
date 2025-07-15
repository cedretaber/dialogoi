#!/bin/bash
# Qdrant Docker コンテナのセットアップスクリプト

set -e

echo "🚀 Qdrant Docker コンテナのセットアップを開始します..."

# 既存のコンテナを停止・削除
if docker ps -q -f name=dialogoi-test-qdrant > /dev/null 2>&1; then
    echo "⚠️  既存のコンテナ 'dialogoi-test-qdrant' を停止中..."
    docker stop dialogoi-test-qdrant
fi

if docker ps -aq -f name=dialogoi-test-qdrant > /dev/null 2>&1; then
    echo "🗑️  既存のコンテナ 'dialogoi-test-qdrant' を削除中..."
    docker rm dialogoi-test-qdrant
fi

# 新しいコンテナを起動
echo "🐳 新しい Qdrant コンテナを起動中..."
docker run -d \
    --name dialogoi-test-qdrant \
    -p 6333:6333 \
    -p 6334:6334 \
    qdrant/qdrant

echo "⏳ Qdrant の起動を待機中..."
sleep 5

# ヘルスチェック
echo "🔍 Qdrant の接続確認中..."
for i in {1..10}; do
    if curl -s http://localhost:6333/health > /dev/null 2>&1; then
        echo "✅ Qdrant が正常に起動しました！"
        echo "📊 Qdrant Web UI: http://localhost:6333/dashboard"
        echo "🔗 API エンドポイント: http://localhost:6333"
        exit 0
    fi
    echo "⏳ Qdrant の起動を待機中... ($i/10)"
    sleep 2
done

echo "❌ Qdrant の起動に失敗しました。"
echo "💡 以下のコマンドでログを確認してください:"
echo "   docker logs dialogoi-test-qdrant"
exit 1