# Dialogoi ― 実装インストラクション

> **現在のフェーズ**: Phase 3-5 完了 - Qdrant初期化戦略実装とDocker自動起動
> **最終更新**: 2025-01-16

---

## 1. プロジェクト概要

Dialogoi は小説執筆支援のための RAG 搭載 MCP（Model Context Protocol）サーバーです。

**技術構成**:

- TypeScript + Node.js ≥ 20
- Qdrant（ベクトル検索）
- @huggingface/transformers（multilingual-e5-small）
- MCP SDK
- chokidar（ファイル監視）

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

#### Phase 3-4: FlexSearch廃止とアーキテクチャ簡素化（優先度：高）✅ **完了**

- [x] FlexSearch 関連コードの削除
- [x] `KeywordFlexBackend` の削除
- [x] kuromojin 関連コードの削除
- [x] `IndexerManager` をベクトル検索対応に更新
- [x] `search_rag` ツールを `VectorBackend` 使用に更新
- [x] 不要な依存関係を package.json から削除
- [x] テストの更新と実行

#### Phase 3-5: 設定と初期化戦略（優先度：中）✅ **完了**

- [x] Qdrant 接続の初期化戦略実装
- [x] Docker 自動起動機能の実装
- [x] フォールバック機能の実装
- [x] 包括的なテストの作成

---

### Phase 3-4 実装詳細

#### 3-4.1 FlexSearch 関連コードの削除

**削除対象ファイル:**

- `src/backends/KeywordFlexBackend.ts`
- `src/backends/KeywordFlexBackend.test.ts`
- FlexSearch に依存するコード

**削除対象ライブラリ:**

- flexsearch（削除済み）
- kuromojin（削除済み）

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

### Phase 3-5 実装詳細

#### 3-5.1 QdrantInitializationService の実装

**段階的初期化戦略:**

```typescript
export class QdrantInitializationService {
  async initialize(): Promise<QdrantInitializationResult>;
  private async tryExplicitConnection(): Promise<QdrantInitializationResult>;
  private async tryDockerAutoStart(): Promise<QdrantInitializationResult>;
  private async startQdrantContainer(): Promise<string>;
  private async waitForQdrantHealth(containerId: string): Promise<boolean>;
  async cleanup(): Promise<void>;
}
```

**実装された初期化フロー:**

1. **Phase 1**: 明示的接続（localhost:6333）の試行
2. **Phase 2**: Docker自動起動とヘルスチェック
3. **Phase 3**: フォールバック（キーワード検索のみ）

#### 3-5.2 Docker自動起動機能

**主要機能:**

- ポート使用状況チェック（6333番ポート）
- Docker権限の事前確認
- タイムスタンプ付きコンテナ名での起動
- `/healthz` エンドポイントでのヘルスチェック
- グレースフル終了時のコンテナ自動削除

**セキュリティ対応:**

- Docker権限がない場合の安全なフォールバック
- 不正なポート使用の防止
- コンテナのライフサイクル管理

#### 3-5.3 設定の拡張

```typescript
interface QdrantConfig {
  url: string;
  apiKey?: string;
  collection: string;
  timeout: number;
  docker: {
    enabled: boolean;
    image: string;
    timeout: number;
    autoCleanup: boolean;
  };
}
```

#### 3-5.4 エラーハンドリングとフォールバック

**RAG検索エラーハンドリング実装:**

- `SearchBackendUnavailableError` による明確なエラー識別
- Qdrant接続失敗時の詳細なユーザーガイダンス
- 対処方法と代替手段の具体的な案内
- 技術的な問題解決手順の提供

**フォールバック戦略:**

- RAG検索利用不可時の明確なエラーメッセージ表示
- `search_settings_files` / `search_content_files` への誘導
- 詳細なデバッグログ出力（開発者向け）
- ユーザーフレンドリーな問題解決ガイド

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
**Phase 3-4 完了日**: 2025-01-15
**Phase 3-5 完了日**: 2025-01-16
**プロジェクト完了日**: 2025-01-16

**進捗追跡**: 各フェーズ完了時に INSTRUCTION.md を更新

---

## 8. Phase 4: RAG検索の最適化とファイルタイプ別検索

### 8.1 実装目標

**現在の問題点**:

- RAG検索で全ファイルを対象としているが、「本文」と「設定」ファイルのみを対象とすべき
- アプリケーションレベルでのフィルタリングによる性能低下
- ファイルタイプによる検索の区別ができない

**改善目標**:

- NovelRepositoryを使用して適切なファイルのみをインデックス化
- Qdrantのpayloadインデックスと事前フィルタリングによる性能向上
- 本文・設定ファイルを区別した検索機能の実装

### 8.2 技術的アプローチ

#### 8.2.1 Qdrant効率性の考慮

**payloadインデックス戦略**:

- `novelId`: 小説プロジェクトID（高選択性、必須インデックス）
- `fileType`: "content" | "settings" （中選択性、必須インデックス）
- `relativeFilePath`: ファイルパス（高選択性、オプション）

**事前フィルタリング**:

- アプリケーションレベルでの後処理フィルタリングを廃止
- Qdrantクエリ時にfilterパラメータを使用
- 検索性能の大幅な向上

#### 8.2.2 payloadフィールドの再設計

```typescript
// VectorPointのpayload構造
payload: {
  novelId: string,        // 小説プロジェクトID（必須、インデックス推奨）
  fileType: string,       // "content" | "settings" （必須、インデックス推奨）
  relativeFilePath: string, // ファイルパス（必須）
  startLine: number,      // 開始行
  endLine: number,        // 終了行
  chunkIndex: number,     // チャンク番号
  title: string,          // タイトル
  content: string,        // コンテンツ
  tags?: string[],        // オプションのタグ
  baseId: string,         // ベースID
  hash: string,           // ハッシュ
}
```

### 8.3 実装フェーズ

#### Phase 4-1: ファイル検索ロジックの改善（優先度：高）✅ **完了**

**TODO**:

- [x] `Indexer.findTargetFiles`をNovelRepositoryベースに変更
- [x] `settingsDirectories`と`contentDirectories`を使用した適切なファイル検索
- [x] ファイルタイプの判定ロジック実装

#### Phase 4-2: payloadフィールドの拡張（優先度：高）✅ **完了**

**TODO**:

- [x] `Chunk`クラスに`fileType`プロパティを追加
- [x] `VectorBackend.add`でpayloadに`fileType`を含める
- [x] `QdrantVectorRepository`でpayloadインデックスを設定

#### Phase 4-3: 事前フィルタリングの実装（優先度：高）✅ **完了**

**TODO**:

- [x] `VectorRepository.searchVectors`にfilterパラメータを追加
- [x] `VectorBackend.search`でQdrant側フィルタリングを実装
- [x] アプリケーションレベルフィルタリングの削除

#### Phase 4-4: ファイルタイプ別検索機能（優先度：中）✅ **完了**

**TODO**:

- [x] `search_rag` MCPツールに`fileType`パラメータを追加
- [x] "content", "settings", "both"の選択肢を実装
- [x] 適切なエラーハンドリングとバリデーション

#### Phase 4-5: テストとドキュメント更新（優先度：低）

**TODO**:

- [ ] 新機能のテストケース追加
- [ ] 既存テストの更新（一部対応済み）
- [ ] MCPツールドキュメントの更新

### 8.5 Phase 4 進捗状況（2025-01-16）

**完了済み**:

- Phase 4-1: NovelRepositoryベースのファイル検索ロジック実装完了
- Phase 4-2: ChunkクラスへのfileTypeプロパティ追加とpayloadインデックス設定完了
- Phase 4-3: 事前フィルタリングの実装完了
- Phase 4-4: ファイルタイプ別検索機能の実装完了

**現在の状況**:

- Phase 4の主要機能はすべて実装完了
- 全テスト（228テスト）が通過
- lint、typecheck、formatすべてクリア
- 次の段階: Phase 4-5のテストとドキュメント更新（必要に応じて）

**実装の成果**:

- RAG検索で適切なファイルのみがインデックス化されるように改善
- Qdrantのpayloadインデックスによる検索性能の向上
- `search_rag`ツールでファイルタイプ別検索が可能に（content/settings/both）
- アプリケーションレベルフィルタリングの削除による効率化

### 8.4 実装詳細

#### 8.4.1 Indexerの改善

```typescript
// 現在の実装（非効率）
const files = await findFilesRecursively(novelPath, ['md', 'txt']);

// 改善後（効率的）
const project = await this.novelRepository.getProject(novelId);
const settingsFiles = await this.getFilesFromDirectories(
  project.config.settingsDirectories,
  'settings',
);
const contentFiles = await this.getFilesFromDirectories(
  project.config.contentDirectories,
  'content',
);
```

#### 8.4.2 Qdrantクエリの最適化

```typescript
// 現在（非効率）
const vectorResults = await this.vectorRepository.searchVectors(
  this.config.collectionName,
  queryEmbedding,
  k,
  this.config.scoreThreshold,
);
const filteredResults = vectorResults.filter((result) => result.payload?.novelId === novelId);

// 改善後（効率的）
const vectorResults = await this.vectorRepository.searchVectors(
  this.config.collectionName,
  queryEmbedding,
  k,
  this.config.scoreThreshold,
  {
    must: [
      { key: 'novelId', match: { value: novelId } },
      { key: 'fileType', match: { value: fileType } },
    ],
  },
);
```

---

## 9. 開発時の注意事項

- 全てのファイル操作は絶対パスを使用
- 厳格な ESLint ルール（警告0個必須）
- テストは vitest フレームワークを使用
- **ライブラリの動作に不明点があればまずは公式ドキュメントを調査**
- **コーディング規約、型安全性についてはベストプラクティスに従う**
- **`any` 型の使用は極力避け、`unknown` や適切な型ガードを使用**

---

_Phase 4 実装インストラクション（2025-01-16）_
