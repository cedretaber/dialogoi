# Dialogoi - Novel Writing Support MCP Server

[![CI](https://github.com/cedretaber/dialogoi/actions/workflows/ci.yml/badge.svg)](https://github.com/cedretaber/dialogoi/actions/workflows/ci.yml)

小説執筆を支援するRAG搭載MCP（Model Context Protocol）サーバーです。

## 特徴

- **RAG検索**: Qdrant + multilingual-e5-small による意味的類似度検索
- **全文検索**: 正規表現対応の高速テキスト検索
- **ファイルタイプ別検索**: 設定ファイル・本文ファイルを区別した検索
- **リアルタイム監視**: ファイル変更時の自動インデックス更新
- **Claude Desktop統合**: MCPプロトコルによる完全統合

## インストール

### 前提条件

- Node.js 20.0.0以上
- Docker（RAG検索機能を使用する場合）

### セットアップ

```bash
git clone https://github.com/cedretaber/dialogoi
cd dialogoi
npm install
npm run build
```

## 使用方法

### 1. 小説プロジェクトの準備

```
novels/
├── my_novel/
│   ├── novel.json          # プロジェクト設定
│   ├── settings/           # 設定ファイル
│   │   ├── characters.md
│   │   └── world.md
│   └── contents/           # 本文ファイル
│       ├── chapter1.md
│       └── chapter2.md
```

**novel.json例:**

```json
{
  "title": "私の小説",
  "author": "作者名",
  "description": "小説の説明",
  "settingsDirectories": ["settings"],
  "contentDirectories": ["contents"],
  "instructionFiles": ["DIALOGOI.md"]
}
```

### 2. Claude Desktop連携

`claude_desktop_config.json`に追加：

```json
{
  "mcpServers": {
    "dialogoi": {
      "command": "node",
      "args": ["/path/to/dialogoi/dist/index.js", "--project-root", "/path/to/novels"],
      "cwd": "/path/to/dialogoi"
    }
  }
}
```

**設定ファイルの場所:**

- Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### 3. 主要なコマンドライン引数

```bash
node dist/index.js [オプション]
```

- `--project-root <PATH>`: 小説プロジェクトのルートディレクトリ
- `--qdrant-url <URL>`: QdrantサーバーURL（未設定時はDocker自動起動）
- `--docker-enabled <true|false>`: Docker自動起動の有効/無効

## MCP API

### プロジェクト管理

- `list_novel_projects`: プロジェクト一覧を取得
- `get_novel_settings/content/instructions`: ファイル内容を取得
- `add_novel_setting/content`: 新規ファイル作成

### 検索機能

- `search_novel_text`: 統合テキスト検索（正規表現対応）
- `search_rag`: RAG検索（意味的類似度検索）

両方の検索で `fileType` パラメータによる絞り込みが可能：

- `content`: 本文ファイルのみ
- `settings`: 設定ファイルのみ
- `both`: 両方（デフォルト）

## RAG検索の特徴

- **multilingual-e5-small**: 384次元ベクトルによる多言語対応
- **Qdrant**: 高速ベクトル検索エンジン
- **事前フィルタリング**: Qdrant側での高速フィルタリング
- **スマートチャンキング**: 20%オーバーラップによる文脈保持
- **自動フォールバック**: Qdrant利用不可時の詳細なエラーガイダンス

## 開発

### 基本コマンド

```bash
npm run dev          # 開発モード
npm run build        # ビルド
npm test             # ユニットテスト
npm run test:integration  # 統合テスト
npm run lint         # ESLint
npm run typecheck    # TypeScript型チェック
```

### アーキテクチャ

- **Repository Pattern**: データアクセス層の抽象化
- **Service Pattern**: ビジネスロジック層
- **Backend Pattern**: 検索エンジン抽象化
- **依存性注入**: コンストラクタベース

## ライセンス

MIT License
