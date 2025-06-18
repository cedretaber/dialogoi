# Dialogoi - Novel Writing Support MCP Server

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

### 1. `list_novel_projects`
利用可能な小説プロジェクト一覧を取得

**使用例:** "どんな小説があるか教えて"

### 2. `list_novel_settings`
指定した小説の設定ファイル一覧とプレビューを取得

**パラメータ:**
- `novelId`: 小説のID

### 3. `get_novel_settings`
設定ファイルの内容を取得（全体結合または個別指定）

**パラメータ:**
- `novelId`: 小説のID
- `filename`: ファイル名（省略時は全設定ファイルを結合）

### 4. `search_novel_settings`
設定ファイル内をキーワード検索

**パラメータ:**
- `novelId`: 小説のID
- `keyword`: 検索キーワード

**使用例:** "魔法システムについて調べて"

### 5. `list_novel_content`
指定した小説の本文ファイル一覧とプレビューを取得

**パラメータ:**
- `novelId`: 小説のID

### 6. `get_novel_content`
本文ファイルの内容を取得（全体結合または個別指定）

**パラメータ:**
- `novelId`: 小説のID
- `filename`: ファイル名（省略時は全本文ファイルを結合）

## 使用例

Claude Desktopでの実際の使用例：

```
1. "現在執筆中の小説一覧を教えて"
   → list_novel_projects が実行され、プロジェクト一覧を表示

2. "ミステリー小説のキャラクター設定を確認したい"
   → search_novel_settings でキャラクター関連の設定を検索

3. "第1章を読み上げて"
   → get_novel_content で該当チャプターを取得
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
