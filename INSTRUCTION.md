# Dialogoi ― 実装インストラクション

> **現在のフェーズ**: Phase 3-4 - FlexSearch廃止とアーキテクチャ簡素化
> **最終更新**: 2025-01-15

---

## 1. プロジェクト概要

Dialogoi は小説執筆支援のための RAG 搭載 MCP（Model Context Protocol）サーバーです。

**技術構成**:

- TypeScript + Node.js ≥ 20
- Qdrant（ベクトル検索）
- @huggingface/transformers（multilingual-e5-small）
- MCP SDK

**目標**:

- 自然言語クエリから関連テキストチャンク（ID とスニペット）を返すRAG機能
- 単純な文字列検索・正規表現検索（既存実装）
- ベクトル検索（意味的類似度検索）
- ホットリロード（プロジェクトファイルの変更をリアルタイムで反映）
- 外部依存最小化（Docker / GPU 不要）

---

## 2. 現在のアーキテクチャ（Phase 3-3 完了後）

### 2.1 レイヤー構成

```
MCP API → NovelService → Repository/SearchService/FileOperationsService → Backend
```

**設計パターン**:

- Repository パターン（データアクセス層）
- Service パターン（ビジネスロジック層）
- Backend パターン（検索エンジン抽象化）
- 依存性注入（コンストラクタベース）

### 2.2 主要モジュール

```
src/
├── services/
│   ├── novelService.ts                # MCPツール実装・ファサード
│   ├── SearchService.ts               # 検索サービス抽象化
│   ├── IndexerSearchService.ts        # 実装（IndexerManager連携）
│   ├── EmbeddingService.ts            # Embedding抽象化
│   └── TransformersEmbeddingService.ts # multilingual-e5-small実装
├── repositories/
│   ├── NovelRepository.ts             # データアクセス抽象化
│   ├── FileSystemNovelRepository.ts   # ファイルシステム実装
│   ├── VectorRepository.ts            # ベクトルDB抽象化
│   └── QdrantVectorRepository.ts      # Qdrant実装
├── backends/
│   ├── SearchBackend.ts          # 検索エンジン抽象化
│   ├── KeywordFlexBackend.ts     # FlexSearch実装（削除予定）
│   └── VectorBackend.ts          # ベクトル検索実装
├── lib/
│   ├── indexerManager.ts         # インデックス管理
│   ├── chunker.ts                # チャンク化処理
│   └── config.ts                 # 設定管理
└── errors/, logging/             # エラーハンドリング・ログ
```

---

## 4. Phase 3: Qdrant統合とベクトル検索実装

### 4.1 実装目標

multilingual-e5-small モデルを使用した embedding 生成機能と、Qdrant によるベクトル検索機能を実装。FlexSearchと形態素解析を廃止し、システムアーキテクチャを簡素化する。

### 4.2 新規実装モジュール

#### 4.2.1 Embedding サービス層

**`src/services/EmbeddingService.ts`**

```typescript
interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  isReady(): boolean;
}
```

**`src/services/TransformersEmbeddingService.ts`**

```typescript
export class TransformersEmbeddingService implements EmbeddingService {
  private readonly modelName = 'intfloat/multilingual-e5-small';
  private readonly dimensions = 384;
  // multilingual-e5-small による embedding 生成
}
```

#### 4.2.2 Qdrant ベクトルリポジトリ

**`src/repositories/VectorRepository.ts`**

```typescript
interface VectorRepository {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  ensureCollection(collectionName: string, vectorSize: number): Promise<void>;
  upsertVectors(collectionName: string, vectors: VectorPoint[]): Promise<void>;
  searchVectors(
    collectionName: string,
    queryVector: number[],
    limit: number,
    scoreThreshold?: number,
  ): Promise<VectorSearchResult[]>;
  deleteVectors(collectionName: string, pointIds: string[]): Promise<void>;
}
```

**`src/repositories/QdrantVectorRepository.ts`**

```typescript
export class QdrantVectorRepository implements VectorRepository {
  // Repository パターンに従った Qdrant 実装
  // 将来的に Pinecone、Weaviate 等への切り替えに対応
}
```

#### 4.2.3 ベクトル検索バックエンド

**`src/backends/VectorBackend.ts`**

```typescript
export class VectorBackend extends SearchBackend {
  async search(query: string, k: number, novelId: string): Promise<SearchResult[]>;
  async indexChunk(chunk: Chunk): Promise<void>;
  async removeChunk(chunkId: string): Promise<void>;
  async updateChunk(chunk: Chunk): Promise<void>;
}
```

### 4.3 設定の拡張

```typescript
interface DialogoiConfig {
  // 既存設定...
  embedding: {
    enabled: boolean;
    model: string; // 'multilingual-e5-small'
    dimensions: number; // 384
    batchSize: number;
  };
  qdrant: {
    url: string; // 'http://localhost:6333'
    apiKey?: string;
    collection: string; // 'dialogoi-chunks'
    timeout: number;
  };
}
```

### 4.4 初期化戦略

#### 4.4.1 Qdrant 接続の段階的初期化

**セキュリティ重視のアプローチ:**

- ポート自動検出を廃止 → 指定ポートのみ使用
- Docker失敗時は即座にフォールバック
- 明確なエラーログとRAG無効化

**初期化フロー:**

1. **Phase 1: 明示的な接続先を試行**
   - 設定で `qdrant.url` が指定されている場合、その接続先に接続
   - 接続失敗時は即座に文字列検索モードにフォールバック（Docker試行せず）

2. **Phase 2: Docker自動起動を試行**
   - 設定で `docker.enabled = true` の場合のみ実行
   - 指定ポート（デフォルト6333）の使用状況をチェック
   - ポート使用中の場合は起動失敗としてフォールバック
   - Docker権限チェック → 失敗時はフォールバック
   - `docker run -d --name dialogoi-qdrant-{timestamp} -p {port}:6333 qdrant/qdrant`
   - ヘルスチェック待機（30秒タイムアウト）

3. **Phase 3: フォールバック（キーワード検索のみ）**
   - すべての試行が失敗した場合、RAG機能を無効化
   - 既存のキーワード検索（正規表現使用可能な全文検索）のみで動作
   - 明確な警告ログを出力

#### 4.4.2 Embedding サービスの遅延初期化

1. **MCPサーバー起動時**: 基本サービスの初期化、embedding サービスは遅延実行
2. **初回検索時**: multilingual-e5-small モデル読み込み、Qdrant 接続確認
3. **既存チャンクの embedding 生成**: バックグラウンドでの段階的生成

#### 4.4.3 設定例

```typescript
interface QdrantConfig {
  url?: string; // 明示的な接続先
  apiKey?: string;
  port: number; // デフォルト: 6333（固定）

  docker: {
    enabled: boolean; // デフォルト: true
    image: string; // デフォルト: 'qdrant/qdrant'
    timeout: number; // デフォルト: 30000ms
    autoCleanup: boolean; // 終了時にコンテナ削除
  };
}
```

#### 4.4.4 フォールバック機能

- **Qdrant 利用不可時**: 文字列検索・正規表現検索のみで動作
- **embedding 生成失敗時**: 既存の文字列検索結果を返す
- **モデル読み込み失敗時**: graceful degradation

### 4.5 実装フェーズ

#### Phase 3-1: Embedding サービス実装（優先度：高）✅ **完了**

- [x] `EmbeddingService` インターフェースの定義
- [x] `TransformersEmbeddingService` の実装
- [x] multilingual-e5-small モデルの統合
- [x] バッチ処理機能の実装

#### Phase 3-2: Qdrant 統合（優先度：高）✅ **完了**

- [x] `VectorRepository` インターフェースの定義
- [x] `QdrantVectorRepository` の実装（Repository パターン）
- [x] 接続管理とエラーハンドリング
- [x] コレクション管理機能
- [x] CRUD 操作の実装

#### Phase 3-3: ベクトル検索バックエンド（優先度：高）✅ **完了**

- [x] `VectorBackend` の実装
- [x] SearchBackend 抽象クラスの継承
- [x] チャンクのベクトル化とインデックス
- [x] ベクトル検索機能
- [x] テストの作成と実行

#### Phase 3-4: FlexSearch廃止とアーキテクチャ簡素化（優先度：高）

- [ ] FlexSearch 関連コードの削除
- [ ] `KeywordFlexBackend` の削除
- [ ] kuromojin 関連コードの削除
- [ ] `IndexerManager` をベクトル検索対応に更新
- [ ] `search_rag` ツールを `VectorBackend` 使用に更新
- [ ] 不要な依存関係を package.json から削除
- [ ] テストの更新と実行

#### Phase 3-5: 設定と初期化戦略（優先度：中）

- [ ] Qdrant 接続の初期化戦略実装
- [ ] Docker 自動起動機能の実装
- [ ] フォールバック機能の実装
- [ ] 包括的なテストの作成

---

### Phase 3-4 実装詳細

#### 3-4.1 FlexSearch 関連コードの削除

**削除対象ファイル:**

- `src/backends/KeywordFlexBackend.ts`
- `src/backends/KeywordFlexBackend.test.ts`
- FlexSearch に依存するコード

**削除対象ライブラリ:**

- flexsearch
- kuromojin
- @types/kuromojin

#### 3-4.2 IndexerManager の更新

`IndexerManager` を `VectorBackend` を使用するように更新:

- `KeywordFlexBackend` への依存を削除
- `VectorBackend` と `EmbeddingService`、`VectorRepository` を統合
- ベクトル検索用のインデックス管理を実装

#### 3-4.3 search_rag ツールの更新

`search_rag` ツールを `VectorBackend` を使用するように更新:

- `IndexerSearchService` 経由で `VectorBackend` を呼び出す
- フォールバック時のエラーハンドリングを実装

---

## 5. 開発コマンド

### 5.1 基本開発

- `npm run dev` - tsx を使用して開発サーバーを起動
- `npm run build` - TypeScript を dist/ にビルド
- `npm run start` - dist/ からビルド済みサーバーを実行

### 5.2 テストと品質管理

- `npm test` - vitest でテストを実行
- `npm run test:watch` - ウォッチモードでテストを実行
- `npm run lint` - ESLint チェック（警告0個を強制）
- `npm run typecheck` - TypeScript 型チェック
- `npm run format` - Prettier でコードをフォーマット

### 5.3 **重要：作業完了前の必須チェック**

新しいファイルを作成・編集した後は、必ず以下のコマンドを実行してCIの通過を確保すること：

1. `npm run lint` - ESLint チェック（警告0個必須）
2. `npm run format` - Prettier フォーマット
3. `npm run typecheck` - TypeScript 型チェック
4. `npm test` - 全テストの実行

---

## 6. 小説プロジェクト構造

```
novels/
├── project_name/
│   ├── novel.json          # プロジェクト設定
│   ├── DIALOGOI.md        # AI ガイドライン（任意）
│   ├── settings/           # キャラクター・世界観設定
│   └── contents/           # 原稿ファイル
```

### 6.1 提供される MCP ツール

- `list_novel_projects` - 利用可能な小説プロジェクト一覧
- `list_novel_settings/content/instructions` - プレビュー付きファイル一覧
- `get_novel_settings/content/instructions` - ファイル内容を取得
- `search_novel_settings/content` - ファイル内検索（文字列・正規表現）
- `search_rag` - ベクトル検索（意味的類似度）
- `add_novel_setting/content` - 新規ファイル作成（セキュリティチェック付き）

---

## 7. 進捗管理

**開始日**: 2025-01-15
**Phase 3-3 完了日**: 2025-01-15
**Phase 3-4 開始日**: 2025-01-15
**目標完了日**: 2025-01-18

**進捗追跡**: 各フェーズ完了時に INSTRUCTION.md を更新

---

## 8. 開発時の注意事項

- 全てのファイル操作は絶対パスを使用
- 厳格な ESLint ルール（警告0個必須）
- テストは vitest フレームワークを使用
- **ライブラリの動作に不明点があればまずは公式ドキュメントを調査**
- **コーディング規約、型安全性についてはベストプラクティスに従う**
- **`any` 型の使用は極力避け、`unknown` や適切な型ガードを使用**

---

_Phase 3 実装インストラクション（2025-01-15）_
