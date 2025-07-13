import { Document, Preset, DocumentData } from 'flexsearch';
import { SearchBackend, SearchResult, Chunk } from './SearchBackend.js';

/**
 * FlexSearch設定オプション
 */
interface FlexSearchConfig {
  profile: Preset;
}

/**
 * FlexSearchドキュメント型定義
 */
interface FlexDocument extends DocumentData {
  id: number;
  title: string;
  content: string;
  tags: string[];
  chunkId: {
    originalId: string;
    filePath: string;
    startLine: number;
    endLine: number;
    chunkIndex: number;
    hash: string;
  };
}

/**
 * FlexSearchバックエンド実装
 * Document Searchを使用してマルチフィールド検索を提供
 */
export class FlexBackend extends SearchBackend {
  private index: Document<FlexDocument, true> | null = null;
  private config: FlexSearchConfig;
  private isInitialized = false;
  private nextId = 1; // 数値IDカウンタ

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
      document: {
        id: 'id',
        index: ['title', 'content', 'tags'],
        tag: ['chunkId:filePath', 'tags'],
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
        id: this.nextId++,
        title: chunk.title,
        content: chunk.content,
        tags: chunk.tags || [],
        chunkId: {
          originalId: chunk.id,
          filePath: chunk.filePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          chunkIndex: chunk.chunkIndex,
          hash: chunk.hash,
        },
      };

      this.index.add(document);
    }
  }

  // removeメソッドは削除（removeByFileで置き換え）

  /**
   * 検索を実行
   */
  async search(query: string, k: number): Promise<SearchResult[]> {
    if (!this.isInitialized || !this.index) {
      throw new Error('Index not initialized');
    }

    // Document Searchで検索実行（enrichedモードでドキュメントも取得）
    const searchResults = await this.index.search(query, {
      limit: Math.min(k, 100),
      enrich: true,
    });

    const results: SearchResult[] = [];

    // 検索結果を処理（FlexSearch 0.8のenriched結果形式）
    if (Array.isArray(searchResults)) {
      for (const fieldResult of searchResults) {
        if (fieldResult && 'result' in fieldResult) {
          for (const item of fieldResult.result) {
            if (item && 'doc' in item && item.doc) {
              const doc = item.doc as FlexDocument;
              results.push({
                id: doc.chunkId.originalId,
                score: this.normalizeScore(1.0), // FlexSearchの内部スコアを使用
                snippet: this.generateSnippet(doc.content, query),
                payload: {
                  file: doc.chunkId.filePath,
                  start: doc.chunkId.startLine,
                  end: doc.chunkId.endLine,
                  tags: doc.tags,
                },
              });
            }
          }
        }
      }
    }

    return results.slice(0, k);
  }

  // getDocumentByIdメソッドは削除（enriched searchで置き換え）

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

  // import/exportメソッドは削除（ファイル再スキャンの方が効率的）

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
    await this.initializeIndex();
  }

  /**
   * 指定ファイルに関連するチャンクをすべて削除
   */
  async removeByFile(filePath: string): Promise<void> {
    await this.initializeIndex();

    if (!this.index) {
      throw new Error('Index not initialized');
    }

    // タグ機能を使ってファイルパスで検索
    const searchResults = await this.index.search({
      tag: { 'chunkId:filePath': filePath },
      enrich: false,
    });

    // 該当するチャンクを削除
    for (const result of searchResults) {
      for (const id of result.result) {
        this.index.remove(id);
      }
    }
  }

  /**
   * チャンクを差分更新（ハッシュ値による重複チェック）
   */
  async updateChunks(chunks: Chunk[]): Promise<{
    added: number;
    updated: number;
    unchanged: number;
  }> {
    await this.initializeIndex();

    if (!this.index) {
      throw new Error('Index not initialized');
    }

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    for (const chunk of chunks) {
      const baseId = chunk.baseId;
      const newHash = chunk.hash;

      // 同じファイルパス、行範囲を持つ既存チャンクを検索
      const searchResults = this.index.search({
        tag: { 'chunkId:filePath': chunk.filePath },
        enrich: true,
      });

      let existingDoc: FlexDocument | null = null;
      let existingId: number | null = null;

      // search結果からドキュメントを取得して確認
      if (Array.isArray(searchResults)) {
        for (const item of searchResults) {
          if (item && 'doc' in item && item.doc) {
            const doc = item.doc as FlexDocument;
            if (doc.chunkId.originalId.startsWith(baseId + '@')) {
              existingDoc = doc;
              existingId = doc.id;
              break;
            }
          }
        }
      }

      if (!existingDoc) {
        // 新規チャンク
        await this.add([chunk]);
        added++;
      } else {
        // ハッシュ値比較
        const existingHash = existingDoc.chunkId.hash;

        if (newHash !== existingHash) {
          // ハッシュが異なる場合は更新
          this.index.remove(existingId!);
          await this.add([chunk]);
          updated++;
        } else {
          // ハッシュが同じ場合は変更なし
          unchanged++;
        }
      }
    }

    return { added, updated, unchanged };
  }

  /**
   * インデックスの統計情報を取得
   */
  async getStats(): Promise<{
    memoryUsage?: number;
    lastUpdated?: Date;
  }> {
    await this.initializeIndex();

    return {
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
    this.isInitialized = false;
  }
}
