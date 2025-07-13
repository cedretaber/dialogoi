# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## 開発コマンド

### 基本開発

- `npm run dev` - ts-node を使用して開発サーバーを起動
- `npm run build` - TypeScript を dist/ にビルド
- `npm run start` - dist/ からビルド済みサーバーを実行

### テストと品質管理

- `npm test` - vitest でテストを実行
- `npm run test:watch` - ウォッチモードでテストを実行
- `npm run lint` - ESLint チェック（警告0個を強制）
- `npm run typecheck` - TypeScript 型チェック
- `npm run format` - Prettier でコードをフォーマット
- `npm run format:check` - コードフォーマットをチェック

## アーキテクチャ概要

Dialogoi は小説執筆支援のための RAG 搭載 MCP（Model Context Protocol）サーバーです。小説プロジェクトの検索とファイル管理ツールを提供します。

### 主要コンポーネント

1. **MCP サーバー** (`src/index.ts`) - 全ての MCP ツールを登録するメインサーバー
2. **NovelService** (`src/services/novelService.ts`) - 小説操作のコアビジネスロジック
3. **SearchBackend** (`src/backends/SearchBackend.ts`) - 検索機能の抽象インターフェース
4. **設定管理** (`src/lib/config.ts`) - CLI 上書きサポート付き設定ローダー

### プロジェクト構造パターン

小説プロジェクトは以下の構造に従います：

```
novels/
├── project_name/
│   ├── novel.json          # プロジェクト設定
│   ├── DIALOGOI.md        # AI ガイドライン（任意）
│   ├── settings/           # キャラクター・世界観設定
│   └── contents/           # 原稿ファイル
```

### 提供される MCP ツール

- `list_novel_projects` - 利用可能な小説プロジェクト一覧
- `list_novel_settings/content/instructions` - プレビュー付きファイル一覧
- `get_novel_settings/content/instructions` - ファイル内容を取得
- `search_novel_settings/content` - ファイル内検索
- `add_novel_setting/content` - 新規ファイル作成（セキュリティチェック付き）

### 設定システム

設定の読み込み優先順位：

1. CLI 引数（`--project-root`、`--max-tokens` など）
2. `config/dialogoi.config.json`
3. デフォルト値

主要設定項目：

- `projectRoot` - 小説プロジェクトのベースディレクトリ
- `chunk.maxTokens` - チャンクあたりの最大トークン数（400）
- `search.defaultK/maxK` - 検索結果の件数制限

### 検索アーキテクチャ（フェーズ 1）

FlexSearch 0.8.205 ベースの Document Search API を使用。タグ・タイトル・コンテンツを横断する部分一致検索で、小説執筆に最適化された直感的な検索を提供。抽象 SearchBackend インターフェースにより、将来のベクトル検索追加をサポート。

### 主要技術仕様

- **FlexSearch 0.8.205**: Document Search API、メモリ内インデックス
- **Chunkクラス**: getter方式でid/hash/baseIdを動的生成
- **ファイル単位削除**: タグシステムを使った効率的な削除機能
- **メモリ効率**: FlexSearchのstore機能を活用、冗長データ構造を排除

### セキュリティ機能

ファイル作成 API には以下が含まれます：

- パストラバーサル攻撃防止
- ファイル拡張子制限（.md、.txt のみ）
- プロジェクト設定ディレクトリへの制限
- ファイルサイズ制限（10MB）
- 上書き保護（明示的フラグが必要）

## 開発時の注意事項

- 全てのファイル操作は絶対パスを使用
- 小説プロジェクトには `novel.json` 設定ファイルが必要
- settings/contents ディレクトリはプロジェクト毎に設定可能
- DIALOGOI.md ファイルはプロジェクト固有の AI ガイドラインを提供
- サーバーは厳格な ESLint ルールを使用（警告0個必須）
- テストは vitest フレームワークを使用
- **ライブラリの動作に不明点があればまずは公式ドキュメントを調査すること**
  - 型定義だけでなく、公式ドキュメントやリポジトリの examples/ を確認
  - 特に FlexSearch、chokidar などサードパーティライブラリの適切な使用法を把握する

### コーディング規約と型安全性

**基本原則：** コーディング規約、型安全性についてはその言語のベストプラクティスに従うこと。敢えてベストプラクティスから外れる場合はその理由を明記すること。

**TypeScript 固有の注意事項：**

- `any` 型の使用は極力避ける（型安全性を損なうため）
- `unknown` や適切な型ガードを使用して型安全を保つ
- `as` キャストは最小限に留め、型の整合性を保証できる場合のみ使用
- 関数の戻り値型は明示的に指定する（推論に頼らない）
- `strict` モードを有効にしたまま開発する

**例外的な使用が許される場合：**

- サードパーティライブラリの型定義が不完全な場合
- 複雑な型変換で一時的な型キャストが必要な場合
- ただし、その理由をコメントで明記すること

## **重要：作業完了前の必須チェック**

**新しいファイルを作成・編集した後は、必ず以下のコマンドを実行してCIの通過を確保すること：**

1. `npm run lint` - ESLint チェック（警告0個必須）
2. `npm run format` - Prettier フォーマット
3. `npm run typecheck` - TypeScript 型チェック
4. `npm test` - 全テストの実行

これらのチェックを怠ると GitHub Actions CI が失敗する。コミット前に必ず実行すること。
