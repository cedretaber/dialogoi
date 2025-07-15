import { tokenize } from 'kuromojin';
import { Chunk } from '../backends/SearchBackend.js';

/**
 * 形態素解析された単語の情報
 */
export interface AnalyzedWord {
  surface: string; // 表層形（実際の文字列）
  basic: string; // 基本形（原形）
  reading?: string; // 読み（カタカナ）
  pos: string; // 品詞
  charOffset: number; // チャンク内での文字オフセット
  chunkInfo: {
    // チャンク位置情報
    chunkId: string; // チャンクID
    filePath: string; // ファイルパス
    startLine: number; // チャンク開始行
    endLine: number; // チャンク終了行
    chunkIndex: number; // チャンクインデックス
    novelId: string; // 小説プロジェクトID
  };
}

/**
 * 形態素解析器のインターフェース
 */
export interface MorphAnalyzer {
  analyze(chunk: Chunk): Promise<AnalyzedWord[]>;
}

/**
 * kuromojinを使用した形態素解析器
 */
export class KuromojiAnalyzer implements MorphAnalyzer {
  private static instance: KuromojiAnalyzer | null = null;

  // 検索対象とする品詞（日本語の主要な内容語）
  private static readonly INDEXABLE_POS = [
    '名詞', // 名詞
    '動詞', // 動詞
    '形容詞', // 形容詞
    '副詞', // 副詞
    '感動詞', // 感動詞
    '連体詞', // 連体詞
  ];

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): KuromojiAnalyzer {
    if (!KuromojiAnalyzer.instance) {
      KuromojiAnalyzer.instance = new KuromojiAnalyzer();
    }
    return KuromojiAnalyzer.instance;
  }

  /**
   * チャンクを形態素解析し、検索対象の単語を抽出
   */
  async analyze(chunk: Chunk): Promise<AnalyzedWord[]> {
    try {
      // kuromojinでトークン化
      const tokens = await tokenize(chunk.content);

      const results: AnalyzedWord[] = [];
      let currentOffset = 0;

      for (const token of tokens) {
        // 単語の位置を計算
        const wordPosition = chunk.content.indexOf(token.surface_form, currentOffset);
        if (wordPosition === -1) continue;

        currentOffset = wordPosition + token.surface_form.length;

        // 検索対象の品詞かチェック
        if (this.isIndexableWord(token)) {
          results.push({
            surface: token.surface_form,
            basic: token.basic_form || token.surface_form,
            reading: token.reading,
            pos: token.pos,
            charOffset: wordPosition,
            chunkInfo: {
              chunkId: chunk.id,
              filePath: chunk.relativeFilePath,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              chunkIndex: chunk.chunkIndex,
              novelId: chunk.novelId,
            },
          });
        }
      }

      return results;
    } catch (error) {
      console.error('形態素解析エラー:', error);
      // フォールバック: 空白区切りで単語分割
      return this.fallbackAnalyze(chunk);
    }
  }

  /**
   * 検索対象とすべき単語かどうかを判定
   */
  private isIndexableWord(token: { surface_form: string; pos: string }): boolean {
    // 品詞チェック
    const isIndexablePOS = KuromojiAnalyzer.INDEXABLE_POS.some((pos) => token.pos.startsWith(pos));

    if (!isIndexablePOS) return false;

    // 長さチェック（1文字の単語は除外）
    if (token.surface_form.length < 2) return false;

    // 記号や数字のみの単語は除外
    if (/^[\d\s\p{P}]+$/u.test(token.surface_form)) return false;

    return true;
  }

  /**
   * 形態素解析に失敗した場合のフォールバック処理
   */
  private fallbackAnalyze(chunk: Chunk): AnalyzedWord[] {
    const words = chunk.content.split(/\s+/).filter((word) => word.length > 1);
    const results: AnalyzedWord[] = [];

    let currentOffset = 0;
    for (const word of words) {
      const wordPosition = chunk.content.indexOf(word, currentOffset);
      if (wordPosition === -1) continue;

      currentOffset = wordPosition + word.length;

      results.push({
        surface: word,
        basic: word,
        pos: '名詞', // フォールバック時は名詞として扱う
        charOffset: wordPosition,
        chunkInfo: {
          chunkId: chunk.id,
          filePath: chunk.relativeFilePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          chunkIndex: chunk.chunkIndex,
          novelId: chunk.novelId,
        },
      });
    }

    return results;
  }
}

/**
 * 形態素解析器のファクトリー関数
 */
export function createMorphAnalyzer(): MorphAnalyzer {
  return KuromojiAnalyzer.getInstance();
}
