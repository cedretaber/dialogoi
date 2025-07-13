import { Document, Preset } from 'flexsearch';
import fs from 'fs/promises';
import path from 'path';
import { SearchBackend, SearchResult, Chunk } from './SearchBackend.js';

/**
 * FlexSearch設定オプション
 */
interface FlexSearchConfig {
  profile: Preset;
  exportPath: string;
}

/**
 * FlexSearchドキュメント型定義
 */
interface FlexDocument {
  id: string;
  title: string;
  content: string;
  tags?: string[];
}

/**
 * FlexSearchバックエンド実装
 * Document Searchを使用してマルチフィールド検索を提供
 */
export class FlexBackend extends SearchBackend {
  private index: Document<FlexDocument, true> | null = null;
  private config: FlexSearchConfig;
  private chunks: Map<string, Chunk> = new Map();
  private isInitialized = false;

  constructor(config: FlexSearchConfig) {
    super();
    this.config = config;
  }

  /**
   * インデックスを初期化
   */
  private async initializeIndex(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Document Searchの設定（公式ドキュメントに従う）
    this.index = new Document({
      preset: this.config.profile,
      document: {
        id: 'id',
        index: ['title', 'content', 'tags'],
        store: true,
      },
    });

    this.isInitialized = true;
  }

  /**
   * チャンクをインデックスに追加
   */
  async add(chunks: Chunk[]): Promise<void> {
    await this.initializeIndex();

    if (!this.index) {
      throw new Error('Index not initialized');
    }

    // Document Searchにドキュメントを追加
    for (const chunk of chunks) {
      const document: FlexDocument = {
        id: chunk.id,
        title: chunk.title,
        content: chunk.content,
        tags: chunk.tags,
      };

      this.index.add(document);

      // 内部マップに保存（メタデータ用）
      this.chunks.set(chunk.id, chunk);
    }
  }

  /**
   * チャンクをインデックスから削除
   */
  async remove(ids: string[]): Promise<void> {
    await this.initializeIndex();

    if (!this.index) {
      throw new Error('Index not initialized');
    }

    for (const id of ids) {
      this.index.remove(id);
      this.chunks.delete(id);
    }
  }

  /**
   * 検索を実行
   */
  async search(query: string, k: number): Promise<SearchResult[]> {
    if (!this.isInitialized || !this.index) {
      throw new Error('Index not initialized');
    }

    // Document Searchで検索実行（まずsimpleモードで試す）
    const simpleResults = this.index.search(query, Math.min(k, 100));

    // simpleモードの結果をenrichedに変換
    const searchResults = simpleResults.map((fieldResult) => ({
      field: fieldResult.field,
      result: fieldResult.result
        .map((id) => {
          const doc = this.getDocumentById(String(id));
          return {
            id: [id],
            doc: doc,
          };
        })
        .filter((item) => item.doc !== null),
    }));

    const results: SearchResult[] = [];

    // 検索結果を処理（FlexSearchのDocument Searchの結果形式）
    if (Array.isArray(searchResults)) {
      for (const fieldResult of searchResults) {
        if (fieldResult && 'result' in fieldResult) {
          for (const item of fieldResult.result) {
            if (item && 'id' in item && 'doc' in item) {
              // idは配列なので最初の要素を使用
              const idArray = item.id;
              const docId = Array.isArray(idArray) ? idArray[0] : idArray;
              const chunk = this.chunks.get(String(docId));

              if (chunk && item.doc) {
                results.push({
                  id: String(docId),
                  score: this.normalizeScore(1.0), // FlexSearchの内部スコアを使用
                  snippet: this.generateSnippet(item.doc.content, query),
                  payload: {
                    file: chunk.metadata.file,
                    start: chunk.metadata.startLine,
                    end: chunk.metadata.endLine,
                    tags: chunk.tags,
                  },
                });
              }
            }
          }
        }
      }
    }

    return results.slice(0, k);
  }

  /**
   * IDでドキュメントを取得
   */
  private getDocumentById(id: string): FlexDocument | null {
    const chunk = this.chunks.get(id);
    if (!chunk) {
      return null;
    }

    return {
      id: chunk.id,
      title: chunk.title,
      content: chunk.content,
      tags: chunk.tags,
    };
  }

  /**
   * スコアを0-1の範囲に正規化
   */
  private normalizeScore(score: number): number {
    // FlexSearchのスコアは通常0-1の範囲だが、念のため正規化
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 検索キーワード周辺のスニペットを生成
   */
  private generateSnippet(content: string, query: string, maxLength: number = 120): string {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    // 最初にマッチした位置を見つける
    let matchPosition = -1;
    for (const word of queryWords) {
      const pos = contentLower.indexOf(word);
      if (pos >= 0) {
        matchPosition = pos;
        break;
      }
    }

    if (matchPosition === -1) {
      // マッチしない場合は先頭から
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }

    // マッチ位置を中心にスニペットを作成
    const halfLength = Math.floor(maxLength / 2);
    const start = Math.max(0, matchPosition - halfLength);
    const end = Math.min(content.length, start + maxLength);

    let snippet = content.substring(start, end);

    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < content.length) {
      snippet = snippet + '...';
    }

    return snippet;
  }

  /**
   * インデックスをエクスポート（永続化）
   */
  async exportIndex(exportPath?: string): Promise<void> {
    await this.initializeIndex();

    if (!this.index) {
      throw new Error('Index not initialized');
    }

    const targetPath = exportPath || this.config.exportPath;

    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });

    try {
      // FlexSearchの公式ドキュメントに従ったexport
      const indexData: Record<string, FlexDocument> = {};

      await this.index.export((id, doc) => {
        indexData[String(id)] = doc;
      });

      // チャンクメタデータも含めて保存
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        index: indexData,
        chunks: Array.from(this.chunks.entries()),
        config: this.config,
      };

      await fs.writeFile(targetPath, JSON.stringify(exportData, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to export index: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * インデックスをインポート（復元）
   */
  async importIndex(importPath?: string): Promise<void> {
    const targetPath = importPath || this.config.exportPath;

    try {
      const data = await fs.readFile(targetPath, 'utf-8');
      const exportData = JSON.parse(data);

      // バージョンチェック
      if (exportData.version !== '1.0') {
        throw new Error(`Unsupported index version: ${exportData.version}`);
      }

      // インデックスを初期化
      await this.initializeIndex();

      if (!this.index) {
        throw new Error('Index not initialized');
      }

      // FlexSearchの公式ドキュメントに従ったimport
      for (const [id, doc] of Object.entries(exportData.index) as [string, FlexDocument][]) {
        await this.index.import(id, doc);
      }

      // チャンクメタデータを復元
      this.chunks.clear();
      for (const [id, chunk] of exportData.chunks) {
        this.chunks.set(id, chunk);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        // ファイルが存在しない場合は新しいインデックスを作成
        await this.initializeIndex();
        return;
      }
      throw new Error(
        `Failed to import index: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * インデックスをクリア
   */
  async clear(): Promise<void> {
    await this.initializeIndex();

    if (!this.index) {
      throw new Error('Index not initialized');
    }

    // 新しいインデックスを作成（実質的にクリア）
    this.isInitialized = false;
    this.chunks.clear();
    await this.initializeIndex();
  }

  /**
   * インデックスの統計情報を取得
   */
  async getStats(): Promise<{
    totalChunks: number;
    memoryUsage?: number;
    lastUpdated?: Date;
  }> {
    await this.initializeIndex();

    return {
      totalChunks: this.chunks.size,
      memoryUsage: process.memoryUsage().heapUsed,
      lastUpdated: new Date(),
    };
  }

  /**
   * インデックスが初期化されているかチェック
   */
  isReady(): boolean {
    return this.isInitialized && this.index !== null;
  }

  /**
   * リソースをクリーンアップ
   */
  async dispose(): Promise<void> {
    if (this.index) {
      // FlexSearchにはdisposeメソッドがないため、参照をクリア
      this.index = null;
    }
    this.chunks.clear();
    this.isInitialized = false;
  }
}
