# Dialogoi - Novel Writing Support MCP Server

[![CI](https://github.com/cedretaber/dialogoi/actions/workflows/ci.yml/badge.svg)](https://github.com/cedretaber/dialogoi/actions/workflows/ci.yml)

小説執筆を支援するRAG搭載MCP（Model Context Protocol）サーバです。Qdrantベクトル検索による意味的類似度検索と、従来の全文検索機能を提供し、小説の設定や本文を横断的に検索できます。ファイル監視機能により、ファイル変更時のインデックス自動更新に対応しています。

## インストール

### 前提条件

- Node.js (20.0.0以上)
- npm または yarn
- Docker（RAG検索機能を使用する場合）

### セットアップ

```bash
git clone https://github.com/cedretaber/dialogoi
cd dialogoi

npm install

npm run build
```

## プロジェクト構造

```
novels/
├── your_novel_1/
│   ├── novel.json          # プロジェクト設定
│   ├── DIALOGOI.md        # 生成AI向けガイドライン（任意）
│   ├── settings/           # 設定ファイル
│   │   ├── characters.md
│   │   └── worldbuilding.txt
│   └── contents/           # 本文ファイル
│       ├── chapter_1.txt
│       └── chapter_2.md
├── your_novel_2/
│   ├── novel.json
│   ├── docs/              # 異なるディレクトリ構造も可能
│   └── manuscript/
└── ...
```

### novel.json設定例

```json
{
  "title": "小説のタイトル",
  "author": "作者名",
  "description": "小説の概要",
  "settingsDirectories": ["settings", "docs"],
  "contentDirectories": ["contents", "chapters"],
  "instructionFiles": ["DIALOGOI.md"],
  "createdAt": "2024-03-14T00:00:00Z",
  "updatedAt": "2024-03-14T00:00:00Z"
}
```

## Claude Desktop連携

### 設定ファイル例

`claude_desktop_config.json`に以下を追加：

```json
{
  "mcpServers": {
    "dialogoi": {
      "command": "node",
      "args": ["path/to/dialogoi/dist/index.js", "--project-root", "path/to/novels"],
      "cwd": "path/to/dialogoi"
    }
  }
}
```

**設定ファイルの場所:**

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### コマンドライン引数

Dialogoi MCPサーバーは、設定ファイルの値をコマンドライン引数で上書きできます：

#### 基本設定

```bash
node dist/index.js [オプション]
```

**一般設定:**

- `--project-root <PATH>` - 小説プロジェクトのルートディレクトリ（デフォルト: `./novels`）
- `--base-dir <PATH>` - `--project-root` の別名（後方互換性）

**チャンキング設定:**

- `--max-tokens <NUMBER>` - チャンクの最大トークン数（デフォルト: 400）
- `--overlap <NUMBER>` - チャンク間のオーバーラップ率（デフォルト: 0.2）

**検索設定:**

- `--default-k <NUMBER>` - デフォルトの検索結果数（デフォルト: 10）
- `--max-k <NUMBER>` - 最大検索結果数（デフォルト: 50）

#### Qdrant関連設定

**接続設定:**

- `--qdrant-url <URL>` - Qdrantサーバーの接続URL（未設定時はDocker自動起動）
- `--qdrant-api-key <KEY>` - Qdrant APIキー（認証が必要な場合）
- `--qdrant-collection <NAME>` - 使用するコレクション名（デフォルト: `dialogoi-chunks`）
- `--qdrant-timeout <MS>` - 接続タイムアウト（ミリ秒、デフォルト: 5000）

**Docker関連設定:**

- `--docker-enabled <true|false>` - Docker自動起動の有効/無効（デフォルト: true）
- `--docker-image <IMAGE>` - 使用するDockerイメージ名（デフォルト: `qdrant/qdrant`）
- `--docker-timeout <MS>` - Docker起動タイムアウト（ミリ秒、デフォルト: 30000）
- `--docker-auto-cleanup <true|false>` - プロセス終了時の自動削除（デフォルト: true）

#### 使用例

```bash
# 特定のQdrant URLを指定してサーバーを起動
node dist/index.js --qdrant-url http://custom-qdrant:6333

# Docker無効でサーバーを起動（既存のQdrantサーバーのみ使用）
node dist/index.js --docker-enabled false

# カスタムコレクション名とタイムアウトを指定
node dist/index.js --qdrant-collection my-collection --qdrant-timeout 10000

# 複数設定を組み合わせ
node dist/index.js --project-root ./my-novels --max-tokens 600 --docker-enabled false
```

#### Claude Desktop設定での使用

```json
{
  "mcpServers": {
    "dialogoi": {
      "command": "node",
      "args": [
        "path/to/dialogoi/dist/index.js",
        "--project-root",
        "path/to/novels",
        "--qdrant-url",
        "http://localhost:6333",
        "--docker-enabled",
        "true"
      ],
      "cwd": "path/to/dialogoi"
    }
  }
}
```

## API一覧

### プロジェクト管理

#### 1. `list_novel_projects`

利用可能な小説プロジェクト一覧を取得

**使用例:** "どんな小説があるか教えて"

### 設定ファイル操作

#### 2. `list_novel_settings`

指定した小説の設定ファイル一覧とプレビューを取得

**パラメータ:**

- `novelId`: 小説のID

#### 3. `get_novel_settings`

設定ファイルの内容を取得（全体結合または個別指定）

**パラメータ:**

- `novelId`: 小説のID
- `filename`: ファイル名（省略時は全設定ファイルを結合）

#### 4. `search_novel_text` 🔍 **統合テキスト検索**

プロジェクト内のテキストファイルからキーワードを検索します（正規表現検索も可能）

**パラメータ:**

- `novelId`: 小説のID
- `keyword`: 検索キーワード（正規表現も可能）
- `useRegex`: 正規表現として検索するか（デフォルト: false）
- `fileType`: 検索対象のファイルタイプ（`content`, `settings`, `both`）（デフォルト: `both`）

**使用例:**

- "魔法システムについて調べて" (全体検索)
- "設定ファイルから魔法について調べて" (`fileType: "settings"`)
- "本文から主人公の名前が出てくる箇所を探して" (`fileType: "content"`)
- "正規表現で `魔法|魔術` を含む設定を探して" (`useRegex: true, fileType: "settings"`)

#### 5. `add_novel_setting`

設定ファイルを新規作成

**パラメータ:**

- `novelId`: 小説のID
- `directory`: 設定ディレクトリ名
- `filename`: ファイル名（.md または .txt）
- `content`: ファイル内容
- `overwrite`: 既存ファイルを上書きするか（デフォルト: false）

**使用例:** "新しいキャラクター設定ファイルを作成して"

### 本文ファイル操作

#### 6. `list_novel_content`

指定した小説の本文ファイル一覧とプレビューを取得

**パラメータ:**

- `novelId`: 小説のID

#### 7. `get_novel_content`

本文ファイルの内容を取得（全体結合または個別指定）

**パラメータ:**

- `novelId`: 小説のID
- `filename`: ファイル名（省略時は全本文ファイルを結合）

#### 8. `add_novel_content`

本文ファイルを新規作成

**パラメータ:**

- `novelId`: 小説のID
- `directory`: 本文ディレクトリ名
- `filename`: ファイル名（.md または .txt）
- `content`: ファイル内容
- `overwrite`: 既存ファイルを上書きするか（デフォルト: false）

**使用例:** "新しい章を追加して"

#### 9. `list_novel_instructions`

小説プロジェクト内の指示ファイル一覧とプレビューを取得（デフォルトは DIALOGOI.md）

**パラメータ:**

- `novelId`: 小説のID

#### 10. `get_novel_instructions`

指示ファイルの内容を取得（filename を省略すると複数ファイルを結合）

**パラメータ:**

- `novelId`: 小説のID
- `filename`: ファイル名（省略時は全指示ファイルを結合）

### RAG検索機能

#### 11. `search_rag` 🔍 **高度な全文検索**

プロジェクト全体から関連テキストチャンクをRAG検索

**パラメータ:**

- `novelId`: 小説のID
- `query`: 検索クエリ（自然言語）
- `k`: 取得する結果数（省略時: 10、最大: 50）
- `fileType`: 検索対象のファイルタイプ（`content`, `settings`, `both`）（省略時: `both`）

**使用例:**

- "主人公が魔法を使うシーン" (全体検索)
- "設定ファイルから魔法システムについて調べて" (`fileType: "settings"`)
- "本文から感情表現を探して" (`fileType: "content"`)

**RAG検索の特徴:**

- **ベクトル検索**: multilingual-e5-small モデルによる意味的類似度検索
- **ファイルタイプ別検索**: 本文・設定・両方を選択可能
- **Qdrant側フィルタリング**: 高速な事前フィルタリング
- **スマートチャンキング**: 20%オーバーラップで文脈を保持
- **高精度検索**: 384次元ベクトルによる意味理解
- **コンテキスト表示**: マッチ箇所の前後最大120文字を抽出
- **LLM最適化**: Markdown引用形式で結果を整形
- **フォールバック対応**: Qdrant利用不可時の詳細なエラーガイダンス

**エラーハンドリング:**

Qdrantベクターデータベースが利用できない場合、システムは以下の情報を提供します：

- **問題の詳細説明**: セマンティック検索機能が利用できない理由
- **対処方法のガイド**: Qdrantサーバーの起動確認、設定ファイルの確認手順
- **代替手段の案内**: `search_settings_files` や `search_content_files` によるキーワード検索の提案

## セキュリティ機能

ファイル作成API（`add_novel_setting`、`add_novel_content`）には以下のセキュリティ機能が実装されています：

### 安全性の確保

- **パストラバーサル攻撃防止**: `../` などの不正なパスをブロック
- **ファイル拡張子制限**: `.md` と `.txt` のみ許可
- **ファイル名制限**: 英数字、日本語、一部記号のみ許可
- **ファイルサイズ制限**: 最大10MB
- **ディレクトリ制限**: プロジェクト設定で許可されたディレクトリのみ
- **上書き保護**: 既存ファイルの誤上書きを防止（明示的な許可が必要）

## 機能の特徴

### 検索・データ管理

- **リアルタイム監視**: ファイル変更時の自動インデックス更新
- **正規表現検索**: 高度な検索パターンに対応
- **多言語対応**: multilingual-e5-small による意味検索
- **RAG検索**: 関連テキストチャンクの intelligent retrieval

### 統合・安全性

- **MCPプロトコル**: Claude Desktopと完全統合
- **セキュア**: ファイル作成時の包括的なセキュリティチェック
- **統一エラーハンドリング**: 構造化エラー管理とコンテキスト情報
- **構造化ロギング**: デバッグ・監視のための詳細ログ出力

### 開発・メンテナンス

- **型安全性**: TypeScript strictモード、危険な型アサーション除去
- **テスト駆動**: 220個のテストケース、継続的品質管理
- **ベクトル検索**: Qdrant統合による高精度意味検索

## 前提条件

### Qdrant サーバーの準備

RAG検索機能を使用するには、Qdrant サーバーが必要です。

#### 自動起動機能（推奨）

Dialogoi には **Docker自動起動機能** が内蔵されており、Qdrant サーバーがない場合に自動でDockerコンテナを起動します：

```bash
# 設定不要 - Dialogoi起動時に自動でQdrantコンテナが起動されます
npm run dev
```

**自動起動の動作:**

1. **明示的接続の試行**: localhost:6333 への接続を試行
2. **Docker自動起動**: 接続失敗時、自動的に `qdrant/qdrant` コンテナを起動
3. **ヘルスチェック**: コンテナ起動後、接続可能になるまで待機（最大30秒）
4. **グレースフル終了**: プロセス終了時に起動したコンテナを自動削除

#### 手動でのQdrant起動

手動でQdrantサーバーを管理したい場合：

```bash
# Qdrant サーバーを起動
docker run -p 6333:6333 qdrant/qdrant

# または、バックグラウンドで起動
docker run -d -p 6333:6333 --name dialogoi-qdrant qdrant/qdrant
```

#### 設定（config/dialogoi.config.json）

```json
{
  "qdrant": {
    "url": "http://localhost:6333",
    "collection": "dialogoi-chunks",
    "timeout": 5000,
    "docker": {
      "enabled": true,
      "image": "qdrant/qdrant",
      "timeout": 30000,
      "autoCleanup": true
    }
  }
}
```

**Docker自動起動の設定オプション:**

- `enabled`: Docker自動起動の有効/無効（デフォルト: true）
- `image`: 使用するDockerイメージ（デフォルト: "qdrant/qdrant"）
- `timeout`: ヘルスチェックのタイムアウト（デフォルト: 30秒）
- `autoCleanup`: 終了時のコンテナ自動削除（デフォルト: true）

#### フォールバック機能

Qdrant サーバーが利用できない場合、従来の文字列検索・正規表現検索のみで動作します。Docker権限がない環境でも安全に動作します。

## 使用例

Claude Desktopでの実際の使用例：

### 基本的な読み取り操作

```
1. "現在執筆中の小説一覧を教えて"
   → list_novel_projects が実行され、プロジェクト一覧を表示

2. "ミステリー小説のキャラクター設定を確認したい"
   → search_novel_settings でキャラクター関連の設定を検索

3. "第1章を読み上げて"
   → get_novel_content で該当チャプターを取得
```

### 検索機能

```
4. "魔法システムについて設定ファイルから調べて"
   → search_novel_text で fileType="settings" を指定して魔法関連の設定を検索

5. "主人公が出てくる場面を本文から探して"
   → search_novel_text で fileType="content" を指定して主人公の登場箇所を検索

6. "正規表現で感情表現を探して"
   → search_novel_text で useRegex=true として `悲しい|寂しい|辛い` を検索

7. "主人公が魔法を使うシーンを詳しく探して"
   → search_rag でプロジェクト全体をRAG検索（高度な検索）
```

### ファイル作成機能

```
8. "新しいキャラクター設定ファイルを作成して"
   → add_novel_setting で設定ファイルを安全に作成

9. "第3章を新しく書き始めたいので空のファイルを作って"
   → add_novel_content で本文ファイルを新規作成

10. "既存の設定ファイルを更新したい（上書き許可）"
    → add_novel_setting with overwrite=true で安全な上書き
```

## 開発

### ビルド

```bash
npm run build
```

### 開発モード

```bash
npm run dev
```

### テスト・品質管理

```bash
# テスト実行
npm test
npm run test:watch

# コード品質チェック
npm run lint        # ESLint チェック（警告0個必須）
npm run typecheck   # TypeScript 型チェック
npm run format      # Prettier フォーマット
```

### 技術仕様・実装計画

詳細な技術仕様、アーキテクチャ、リファクタリング計画については `INSTRUCTION.md` を参照してください。

**現在の実装状況:**

- ✅ Phase 1完了（統一エラーハンドリング・ロギング・型安全性向上）
- ✅ Phase 2完了（Repositoryパターン・検索サービス分離・依存性注入）
- ✅ Phase 3完了（Qdrant統合・ベクトル検索・FlexSearch廃止・Docker自動起動）
- ✅ Phase 4完了（RAG検索最適化・ファイルタイプ別検索・Qdrant側フィルタリング）

全体進捗: 100% 🎉

## ライセンス

MIT License
