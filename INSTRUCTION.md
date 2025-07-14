# Dialogoi ― フェーズ 1 インストラクションファイル

> **対象範囲** FlexSearch だけを用いた Retrieval-Augmented Generation (RAG) ツールチェーンを実装する。
> 本書はフェーズ 2（Qdrant ハイブリッド検索）開始までの **単一の信頼ソース** とする。

---

## 1 高レベル目標

1. **全文検索 RAG MVP** - 自然言語クエリから関連テキストチャンク（ID とスニペット）を返す。
2. **外部依存ゼロ** - Docker / GPU を一切使わず Node.js ≥ 20 だけで動作。
3. **ホットリロード** - プロジェクトファイルの変更をリアルタイムでインデックスに反映。
4. **将来拡張** - 公開 API を固定し、後で Qdrant バックエンドを差し込める。

---

## 2 アーキテクチャ概要

```mermaid
flowchart TD
    A["watcher.ts(chokidar)"] -->|diff chunks| IDX["indexer.ts(KeywordFlexBackend)"]
    subgraph MCP Layer
      NS[NovelService] -->|search| IM[IndexerManager]
      IM -->|manage| IDX
    end
    subgraph API Layer
      SR[search_novel_settings/content] -->|query| NS
    end
```

- **`watcher.ts`** ― ファイルシステム監視。追加 / 変更 / 削除イベントを発火。（実装予定）
- **`indexer.ts` / KeywordFlexBackend** ― FlexSearch `Document` インデックスを生成・維持する。
- **`NovelService`** ― 小説プロジェクト管理とMCPツールの実装。
- **`IndexerManager`** ― 複数の小説プロジェクトのインデックスを管理。

> **注** バックエンドは `SearchBackend` 抽象を介して呼び出す。フェーズ 2 で `HybridBackend` を差し替えても呼び出し側は無変更。

---

## 3 データモデル

### 3.1 Chunkクラス

```ts
export class Chunk {
  constructor(
    public title: string,      // 章・節タイトル
    public content: string,    // チャンク本文
    public filePath: string,   // ファイルパス
    public startLine: number,  // 開始行番号
    public endLine: number,    // 終了行番号
    public chunkIndex: number, // チャンク番号
    public novelId: string,    // 小説プロジェクトID
    public tags?: string[]     // オプションのタグ
  ) {}

  get baseId(): string // ハッシュなしのベースID
  get id(): string     // ハッシュ付きの一意ID
  get hash(): string   // タイトル+コンテンツのMD5ハッシュ（8文字）
}
```

### 3.2 WordDocument（形態素解析結果）

| フィールド | 型       | 説明                       |
| ---------- | -------- | -------------------------- |
| `id`       | `number` | ユニークID                 |
| `word`     | `string` | 表層形                     |
| `basic`    | `string` | 基本形                     |
| `reading`  | `string` | 読み（カタカナ）           |
| `pos`      | `string` | 品詞                       |
| `chunkId`  | `string` | 所属チャンクID             |
| `novelId`  | `string` | 小説プロジェクトID         |

**FlexSearch 設定（KeywordFlexBackend）**

```ts
document: {
  id: 'id',
  index: [
    { field: 'word', tokenize: 'reverse' },     // 前後部分一致
    { field: 'basic', tokenize: 'reverse' },    // 基本形検索
    { field: 'reading', tokenize: 'reverse' }   // 読み検索
  ],
  tag: ['chunkId', 'filePath', 'novelId'],
  store: true
}
```

---

## 4 依存ライブラリ

| パッケージ            | バージョン | 用途                       |
| --------------------- | ---------- | -------------------------- |
| `flexsearch`          | ^0.8.2     | 全文検索 (Document Search) |
| `kuromojin`           | ^3.0.1     | 日本語形態素解析           |
| `@modelcontextprotocol/sdk` | ^1.12.3 | MCPサーバー実装      |
| `dotenv`              | ^16.4.5    | 環境変数管理               |
| `zod`                 | ^3.25.67   | スキーマ検証               |

Node 20 以上で標準機能を活用。

---

## 5 プロジェクト構成

```
dialogoi/
├─ src/
│  ├─ backends/
│  │   ├─ SearchBackend.ts      # 抽象インターフェース
│  │   └─ KeywordFlexBackend.ts # 形態素解析ベース実装
│  ├─ services/
│  │   └─ novelService.ts       # 小説プロジェクト管理
│  ├─ lib/
│  │   ├─ chunker.ts            # 再帰チャンク化ヘルパ
│  │   ├─ morphAnalyzer.ts      # 日本語形態素解析
│  │   ├─ indexerManager.ts     # インデックス管理
│  │   └─ config.ts             # 設定管理
│  ├─ utils/
│  │   └─ fileUtils.ts          # ファイル操作ユーティリティ
│  ├─ domain/
│  │   └─ novel.ts              # ドメインモデル
│  ├─ dto/
│  │   └─ novelDto.ts           # MCPレスポンス型定義
│  ├─ indexer.ts                # 単一インデックス管理
│  └─ index.ts                  # MCPサーバーエントリポイント
├─ config/
│  └─ dialogoi.config.json      # 設定ファイル
├─ novels/                      # 小説プロジェクトディレクトリ
│  ├─ sample_novel/
│  └─ mystery_story/
└─ test/
   └─ *.test.ts                 # vitest テストファイル
```

---

## 6 ワークフロー

### 6.1 起動時

1. `dialogoi.config.json` をロード（コマンドライン引数で上書き可能）。
2. MCPサーバーとして起動、NovelServiceが小説プロジェクトを検出。
3. IndexerManagerが各プロジェクトのインデックスを管理（遅延初期化）。

### 6.2 インデックス構築（初回検索時）

1. 対象プロジェクトの **`*.md` / `*.txt`** を全走査。
2. `MarkdownChunkingStrategy` でチャンク化（20%オーバーラップ）。
3. `KeywordFlexBackend` で形態素解析 → 単語単位でインデックス。
4. メモリ内に保持（高速検索を実現）。

### 6.3 ライブ更新（実装予定）

1. `watcher.ts` が FS イベントを受信。
2. 差分計算 → 追加／削除チャンクを抽出。
3. `removeByFile()` / `updateChunks()` でメモリ内インデックスを更新。
4. デバウンスで変更を反映。

### 6.4 検索フロー

```
MCPツール → NovelService.searchRag() → IndexerManager → KeywordFlexBackend
```

戻り値:

```ts
{
  id: string,
  score: number,    // 0–1 正規化スコア
  snippet: string,  // マッチ箇所の周辺テキスト
  payload: { 
    file: string,
    start: number,
    end: number,
    tags?: string[]
  }
}
```

---

## 7 実装チェックリスト

### フェーズ1完了項目 ✅

- [x] **chunker.ts** ― MarkdownChunkingStrategy (20%オーバーラップ)
- [x] **KeywordFlexBackend.ts** ― 形態素解析ベース全文検索
- [x] **morphAnalyzer.ts** ― kuromojinによる日本語解析
- [x] **indexer.ts** ― 単一プロジェクトのインデックス管理
- [x] **indexerManager.ts** ― 複数プロジェクトの管理
- [x] **novelService.ts** ― MCPツール実装とRAG検索統合
- [x] **fileUtils.ts** ― ファイル操作ユーティリティ
- [x] **config.ts** ― CLI引数対応の設定管理
- [x] **MCPサーバー統合** ― search_novel_settings/content実装

### 実装予定項目 📋

- [ ] **watcher.ts** ― chokidarを使ったファイル監視
- [ ] **ホットリロード** ― ファイル変更の自動反映
- [ ] **インデックス永続化** ― 起動時間の短縮

### 現在の進捗状況 (2025-01-14)

**アーキテクチャの主な特徴:**

1. **形態素解析ベース検索** - kuromojinで日本語を解析し、表層形・基本形・読みで検索
2. **MCPサーバー統合** - NovelServiceがMCPツールを提供、既存APIと完全互換
3. **遅延インデックス** - 初回検索時にインデックス構築、メモリ効率的
4. **抽象化設計** - SearchBackendインターフェースで将来のベクトル検索に対応

**技術的な実装詳細:**

- **FlexSearch Document API** - 単語単位でインデックス、reverse tokenizeで部分一致
- **スニペット生成** - マッチ位置から前後の文脈を抽出（最大240文字）
- **スコアリング** - 品詞による重み付け（名詞1.0、動詞0.8、形容詞0.7）
- **並列チャンク処理** - Promise.allで効率的なインデックス構築
- **型安全性** - any型を排除、TypeScript strictモード準拠

---

## 8 設定例

```json
{
  "vector": "none",
  "projectRoot": "./novels",
  "chunk": {
    "maxTokens": 400,
    "overlap": 0.2
  },
  "flex": {
    "profile": "fast"
  },
  "search": {
    "defaultK": 10,
    "maxK": 50
  }
}
```

コマンドライン引数での上書き例：

```bash
npm run dev -- --project-root ./my-novels --max-tokens 300
```

---

## 9 パフォーマンス目標

| 指標                              | 目標値  |
| --------------------------------- | ------- |
| コールドスタート (50 k チャンク)  | < 3 秒  |
| インクリメンタル更新 (1 ファイル) | < 50 ms |
| 検索レイテンシ (k=10)             | ≤ 10 ms |
| メモリ使用量                      | < 50 MB |

---

## 10 フェーズ2フック ― HybridBackend スケルトン

`backends/HybridBackend.ts` を追加し `SearchBackend` を実装。Qdrant 未起動時は例外を投げ、呼び出し側で FlexBackend へフォールバックできるようにする。

---

## 11 マイルストーン

| 略号   | 期間 (目安) | 内容                                            |
| ------ | ----------- | ----------------------------------------------- |
| **M1** | 1 日        | プロジェクト骨格 & 設定ローダ                   |
| **M2** | 3 日        | チャンク化 + フルインデックス + search_rag 基礎 |
| **M3** | 2 日        | ファイル監視 & 増分更新                         |
| **M4** | 1 日        | ユニットテスト & チューニング                   |
| **M5** | 1 日        | ドキュメント・CI 追加                           |

> _上記は AI コーディング支援を前提とした保守的な見積もりです。_

---

## 12 Appendix ― コマンド

```bash
# 開発モード (ts-node)
npm run dev

# ビルド & バンドル (esbuild → dist/)
npm run build

# 単体テスト実行
npm t
```

---

_フェーズ 1 インストラクションここまで_
