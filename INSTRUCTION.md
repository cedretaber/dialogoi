# Dialogoi - 開発者向け技術仕様

## プロジェクト概要

Dialogoi は小説執筆支援のための RAG 搭載 MCP（Model Context Protocol）サーバーです。

### 技術スタック

- **Runtime**: TypeScript + Node.js ≥ 20
- **ベクトル検索**: Qdrant + multilingual-e5-small (384次元)
- **MCP**: Model Context Protocol SDK
- **ファイル監視**: chokidar
- **テスト**: vitest
- **CI/CD**: GitHub Actions

## アーキテクチャ

### レイヤー構成

```
MCP API → NovelService → Repository/SearchService → Backend → Database/Index
```

### 設計パターン

- **Repository Pattern**: データアクセス層の抽象化
- **Service Pattern**: ビジネスロジック層
- **Backend Pattern**: 検索エンジン抽象化
- **依存性注入**: コンストラクタベース

### ディレクトリ構造

```
src/
├── services/
│   ├── novelService.ts              # MCP API実装
│   ├── IndexerSearchService.ts      # 検索サービス
│   ├── EmbeddingService.ts          # 埋め込み生成抽象化
│   ├── TransformersEmbeddingService.ts  # multilingual-e5-small実装
│   └── QdrantInitializationService.ts  # Qdrant初期化
├── repositories/
│   ├── NovelRepository.ts           # データアクセス抽象化
│   ├── FileSystemNovelRepository.ts # ファイルシステム実装
│   ├── VectorRepository.ts          # ベクトルDB抽象化
│   └── QdrantVectorRepository.ts    # Qdrant実装
├── backends/
│   ├── SearchBackend.ts             # 検索エンジン抽象化
│   └── VectorBackend.ts             # ベクトル検索実装
├── lib/
│   ├── indexerManager.ts            # インデックス管理
│   ├── chunker.ts                   # テキスト分割
│   ├── config.ts                    # 設定管理
│   └── fileWatcher.ts               # ファイル監視
├── errors/                          # エラーハンドリング
├── logging/                         # ログ管理
└── utils/                           # ユーティリティ
```

## 主要機能

### 1. RAG検索

- **モデル**: multilingual-e5-small (384次元ベクトル)
- **ベクトルDB**: Qdrant
- **チャンキング**: 最大400トークン、20%オーバーラップ
- **フィルタリング**: Qdrant側での高速事前フィルタリング

### 2. 全文検索

- **正規表現対応**: 高度な検索パターン
- **ファイルタイプ別**: content/settings/both
- **リアルタイム更新**: ファイル変更時の自動インデックス更新

### 3. MCP統合

- **Claude Desktop**: MCPプロトコルによる完全統合
- **セキュリティ**: ファイル作成時の包括的な検証
- **エラーハンドリング**: 構造化エラー管理

## 設定管理

### 設定ファイル

```typescript
interface DialogoiConfig {
  projectRoot: string;
  chunk: {
    maxTokens: number;
    overlap: number;
  };
  embedding: {
    enabled: boolean;
    model: string;
    dimensions: number;
    batchSize: number;
  };
  qdrant: {
    url?: string;
    collection: string;
    timeout: number;
    docker: {
      enabled: boolean;
      image: string;
      timeout: number;
      autoCleanup: boolean;
    };
  };
  search: {
    defaultK: number;
    maxK: number;
  };
}
```

### Qdrant初期化戦略

1. **明示的接続**: 設定でURLが指定されている場合
2. **Docker自動起動**: 設定で有効化されている場合
3. **フォールバック**: 全文検索のみで動作

## 開発ガイド

### 必須コマンド

```bash
# 開発
npm run dev
npm run build

# テスト
npm test                    # ユニットテスト
npm run test:integration    # 統合テスト
npm run test:integration:qdrant  # Qdrant統合テスト（CI専用）

# 品質管理
npm run lint               # ESLint（警告0個必須）
npm run typecheck          # TypeScript型チェック
npm run format             # Prettier
```

### 作業フロー

1. **コード変更後の必須チェック**:

   ```bash
   npm run lint && npm run typecheck && npm test
   ```

2. **新機能追加時**:
   - 適切な抽象化レイヤーに実装
   - テストを追加
   - エラーハンドリングを実装

3. **コミット前**:
   - 全テストの通過確認
   - lint/typecheck/formatの実行

### 型安全性

- **TypeScript strict mode**: 厳格な型チェック
- **any型の禁止**: unknown型と型ガードを使用
- **明示的な戻り値型**: 推論に頼らない
- **エラーハンドリング**: 構造化エラー管理

## テスト戦略

### ユニットテスト

- **カバレッジ**: 主要ビジネスロジック
- **モック**: 外部依存の分離
- **型安全性**: 厳格な型チェック

### 統合テスト

- **MCP API**: 実際のAPI呼び出しテスト
- **ファイルシステム**: 実際のファイル操作
- **Qdrant**: 実際のベクトル検索（CI環境）

### CI/CD

- **GitHub Actions**: 自動テスト実行
- **Node.js**: 22.x, 24.x でのテスト
- **Qdrant**: Docker servicesでの統合テスト

## セキュリティ

### ファイル操作

- **パストラバーサル防止**: `../` 等の不正パスをブロック
- **拡張子制限**: `.md`, `.txt` のみ許可
- **ファイル名制限**: 英数字、日本語、一部記号のみ
- **サイズ制限**: 最大10MB
- **上書き保護**: 明示的な許可が必要

### 設定管理

- **設定の検証**: Zodによる厳格な型チェック
- **環境変数**: 機密情報の適切な管理
- **Docker**: 自動起動時の権限チェック

## 小説プロジェクト構造

```
novels/
├── project_name/
│   ├── novel.json          # プロジェクト設定
│   ├── DIALOGOI.md         # AI向けガイドライン（任意）
│   ├── settings/           # 設定ファイル
│   │   ├── characters.md
│   │   └── world.md
│   └── contents/           # 本文ファイル
│       ├── chapter1.md
│       └── chapter2.md
```

### novel.json

```json
{
  "title": "作品タイトル",
  "author": "作者名",
  "description": "作品概要",
  "settingsDirectories": ["settings"],
  "contentDirectories": ["contents"],
  "instructionFiles": ["DIALOGOI.md"],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

## トラブルシューティング

### Qdrant接続エラー

1. **Docker確認**: `docker ps` でコンテナ状態確認
2. **ポート確認**: 6333番ポートの使用状況確認
3. **ログ確認**: アプリケーションログでエラー詳細確認

### パフォーマンス問題

1. **チャンクサイズ**: 大きすぎる場合は分割
2. **バッチサイズ**: 埋め込み生成のバッチサイズ調整
3. **インデックス**: Qdrantのpayloadインデックス確認

### メモリ使用量

1. **モデル**: multilingual-e5-small の初期化確認
2. **ベクトル**: 大量データ処理時のメモリ管理
3. **ファイル監視**: chokidarのイベント処理確認
