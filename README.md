# Dialogoi - Novel Writing Support MCP Server

[![CI](https://github.com/cedretaber/dialogoi/actions/workflows/ci.yml/badge.svg)](https://github.com/cedretaber/dialogoi/actions/workflows/ci.yml)

小説執筆を支援するMCP（Model Context Protocol）サーバです。

## インストール

### 前提条件
- Node.js (18.0.0以上)
- npm または yarn

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
      "args": ["path/to/dialogoi/dist/index.js", "--base-dir", "path/to/novels"],
      "cwd": "path/to/dialogoi"
    }
  }
}
```

**設定ファイルの場所:**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

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

#### 4. `search_novel_settings`
設定ファイル内をキーワード検索

**パラメータ:**
- `novelId`: 小説のID
- `keyword`: 検索キーワード

**使用例:** "魔法システムについて調べて"

#### 5. `add_novel_setting`
設定ファイルを新規作成（セキュリティ機能付き）

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

#### 8. `search_novel_content`
本文ファイル内をキーワード検索

**パラメータ:**
- `novelId`: 小説のID
- `keyword`: 検索キーワード

**使用例:** "主人公の名前が出てくる箇所を探して"

#### 9. `add_novel_content`
本文ファイルを新規作成（セキュリティ機能付き）

**パラメータ:**
- `novelId`: 小説のID
- `directory`: 本文ディレクトリ名
- `filename`: ファイル名（.md または .txt）
- `content`: ファイル内容
- `overwrite`: 既存ファイルを上書きするか（デフォルト: false）

**使用例:** "新しい章を追加して"

## セキュリティ機能

ファイル作成API（`add_novel_setting`、`add_novel_content`）には以下のセキュリティ機能が実装されています：

### 安全性の確保
- **パストラバーサル攻撃防止**: `../` などの不正なパスをブロック
- **ファイル拡張子制限**: `.md` と `.txt` のみ許可
- **ファイル名制限**: 英数字、日本語、一部記号のみ許可
- **ファイルサイズ制限**: 最大10MB
- **ディレクトリ制限**: プロジェクト設定で許可されたディレクトリのみ
- **上書き保護**: 既存ファイルの誤上書きを防止（明示的な許可が必要）

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
   → search_novel_settings で魔法関連の設定を検索

5. "主人公が出てくる場面を本文から探して"
   → search_novel_content で主人公の登場箇所を検索
```

### ファイル作成機能
```
6. "新しいキャラクター設定ファイルを作成して"
   → add_novel_setting で設定ファイルを安全に作成

7. "第3章を新しく書き始めたいので空のファイルを作って"
   → add_novel_content で本文ファイルを新規作成

8. "既存の設定ファイルを更新したい（上書き許可）"
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

### テスト
```bash
npm test
```

## ライセンス

MIT License
 