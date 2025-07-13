import crypto from 'crypto';

/**
 * トークン数計算の抽象インターフェース
 */
export interface TokenCounter {
  /**
   * テキストのトークン数を計算
   * @param text 計算対象のテキスト
   * @returns トークン数
   */
  count(text: string): number;
}

/**
 * 簡易トークンカウンター（文字数 ÷ 2.5 の近似）
 */
export class SimpleTokenCounter implements TokenCounter {
  count(text: string): number {
    // 日本語と英語の混在を考慮した簡易計算
    return Math.ceil(text.length / 2.5);
  }
}

/**
 * オーバーラップ計算の抽象インターフェース
 */
export interface OverlapCalculator {
  /**
   * オーバーラップサイズを計算
   * @param content コンテンツ
   * @param overlapRatio オーバーラップ比率（0-1）
   * @returns オーバーラップのサイズ（文字数）
   */
  calculateOverlapSize(content: string, overlapRatio: number): number;
}

/**
 * 文字数ベースのオーバーラップ計算
 */
export class CharacterOverlapCalculator implements OverlapCalculator {
  calculateOverlapSize(content: string, overlapRatio: number): number {
    return Math.floor(content.length * overlapRatio);
  }
}

/**
 * 長いテキストの分割戦略
 */
export interface TextSplitStrategy {
  /**
   * 長いテキストを指定されたトークン数以下のチャンクに分割
   * @param text 分割対象のテキスト
   * @param maxTokens 最大トークン数
   * @param tokenCounter トークンカウンター
   * @returns 分割されたテキストの配列
   */
  split(text: string, maxTokens: number, tokenCounter: TokenCounter): string[];
}

/**
 * 先頭から順次分割する戦略
 */
export class SequentialSplitStrategy implements TextSplitStrategy {
  split(text: string, maxTokens: number, tokenCounter: TokenCounter): string[] {
    const result: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (tokenCounter.count(remaining) <= maxTokens) {
        // 残りが最大トークン数以下なら全て追加
        result.push(remaining);
        break;
      }

      // 最大トークン数に収まる部分を探す
      let splitPoint = remaining.length;

      // 二分探索で適切な分割点を見つける
      let left = 0;
      let right = remaining.length;

      while (left < right) {
        const mid = Math.floor((left + right + 1) / 2);
        const testText = remaining.substring(0, mid);

        if (tokenCounter.count(testText) <= maxTokens) {
          left = mid;
        } else {
          right = mid - 1;
        }
      }

      splitPoint = left;

      // 最低でも1文字は進む（無限ループ防止）
      if (splitPoint === 0) {
        splitPoint = 1;
      }

      result.push(remaining.substring(0, splitPoint));
      remaining = remaining.substring(splitPoint);
    }

    return result;
  }
}

/**
 * チャンクデータ
 */
export interface ChunkData {
  id: string; // file::line-start-end::chunk-M@hash 形式
  title: string; // 章・節タイトル
  content: string; // チャンク本文
  tags?: string[]; // オプションのタグ
  metadata: {
    file: string; // ファイルパス
    startLine: number; // 開始行番号
    endLine: number; // 終了行番号
  };
}

/**
 * チャンク化戦略の抽象インターフェース
 */
export interface ChunkingStrategy {
  /**
   * テキストをチャンクに分割
   * @param text 分割対象のテキスト
   * @param filePath ファイルパス
   * @param maxTokens チャンクあたりの最大トークン数
   * @param overlapRatio オーバーラップ比率（0-1）
   * @returns チャンクの配列
   */
  chunk(text: string, filePath: string, maxTokens: number, overlapRatio: number): ChunkData[];
}

/**
 * Markdown対応の再帰チャンク化戦略
 */
export class MarkdownChunkingStrategy implements ChunkingStrategy {
  constructor(
    private tokenCounter: TokenCounter = new SimpleTokenCounter(),
    private overlapCalculator: OverlapCalculator = new CharacterOverlapCalculator(),
    private splitStrategy: TextSplitStrategy = new SequentialSplitStrategy(),
  ) {}

  chunk(text: string, filePath: string, maxTokens: number, overlapRatio: number): ChunkData[] {
    const lines = text.split('\n');
    const chunks: ChunkData[] = [];

    // セクション単位でまず分割
    const sections = this.extractSections(lines);

    for (const section of sections) {
      const sectionChunks = this.chunkSection(section, filePath, maxTokens, overlapRatio);
      chunks.push(...sectionChunks);
    }

    return chunks;
  }

  /**
   * テキストをセクション（見出し単位）に分割
   */
  private extractSections(lines: string[]): Section[] {
    const sections: Section[] = [];
    let currentSection: Section | null = null;
    let lineIndex = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // 新しい見出しが見つかった
        if (currentSection) {
          currentSection.endLine = lineIndex - 1;
          sections.push(currentSection);
        }

        currentSection = {
          title: headingMatch[2].trim(),
          level: headingMatch[1].length,
          startLine: lineIndex,
          endLine: lineIndex,
          lines: [line],
        };
      } else {
        if (currentSection) {
          // 現在のセクションに行を追加
          currentSection.lines.push(line);
          currentSection.endLine = lineIndex;
        } else {
          // 見出しがない場合のデフォルトセクション
          currentSection = {
            title: 'Document',
            level: 0,
            startLine: lineIndex,
            endLine: lineIndex,
            lines: [line],
          };
        }
      }

      lineIndex++;
    }

    // 最後のセクションを追加
    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * セクションをチャンクに分割
   */
  private chunkSection(
    section: Section,
    filePath: string,
    maxTokens: number,
    overlapRatio: number,
  ): ChunkData[] {
    const sectionText = section.lines.join('\n');
    const sectionTokens = this.tokenCounter.count(sectionText);

    // 段落を抽出して確認
    const paragraphs = this.extractParagraphs(section.lines);

    // セクション全体が最大トークン数以下で、かつ段落が1つ以下なら1つのチャンクとして返す
    if (sectionTokens <= maxTokens && paragraphs.length <= 1) {
      return [
        {
          id: this.generateChunkId(filePath, section.startLine, section.endLine, 0, sectionText),
          title: section.title,
          content: sectionText,
          metadata: {
            file: filePath,
            startLine: section.startLine,
            endLine: section.endLine,
          },
        },
      ];
    }

    // セクションを段落単位で分割してチャンク化
    return this.chunkByParagraphs(section, filePath, maxTokens, overlapRatio);
  }

  /**
   * 段落単位でチャンク化
   */
  private chunkByParagraphs(
    section: Section,
    filePath: string,
    maxTokens: number,
    overlapRatio: number,
  ): ChunkData[] {
    const chunks: ChunkData[] = [];
    const paragraphs = this.extractParagraphs(section.lines);

    let currentChunkLines: string[] = [];
    let currentTokens = 0;
    let chunkIndex = 0;
    let currentStartLine = section.startLine;

    for (const paragraph of paragraphs) {
      const paragraphText = paragraph.lines.join('\n');
      const paragraphTokens = this.tokenCounter.count(paragraphText);

      // 段落が単独で最大トークン数を超える場合は分割
      if (paragraphTokens > maxTokens) {
        // 現在のチャンクがあれば先に保存
        if (currentChunkLines.length > 0) {
          chunks.push(
            this.createChunk(
              filePath,
              section.title,
              currentChunkLines.join('\n'),
              currentStartLine,
              currentStartLine + currentChunkLines.length - 1,
              chunkIndex++,
            ),
          );

          // オーバーラップ処理
          const overlapLines = this.calculateOverlapLines(currentChunkLines, overlapRatio);
          currentChunkLines = overlapLines;
          currentStartLine = currentStartLine + currentChunkLines.length - overlapLines.length;
        }

        // 長い段落を分割してチャンクに追加
        const splitTexts = this.splitStrategy.split(paragraphText, maxTokens, this.tokenCounter);

        for (const splitText of splitTexts) {
          const splitLines = splitText.split('\n');
          const testTokens = this.tokenCounter.count(
            [...currentChunkLines, ...splitLines].join('\n'),
          );

          if (currentChunkLines.length > 0 && testTokens > maxTokens) {
            // 現在のチャンクを保存
            chunks.push(
              this.createChunk(
                filePath,
                section.title,
                currentChunkLines.join('\n'),
                currentStartLine,
                currentStartLine + currentChunkLines.length - 1,
                chunkIndex++,
              ),
            );

            // オーバーラップ処理
            const overlapLines = this.calculateOverlapLines(currentChunkLines, overlapRatio);
            currentChunkLines = [...overlapLines, ...splitLines];
            currentStartLine =
              currentStartLine + currentChunkLines.length - overlapLines.length - splitLines.length;
          } else {
            currentChunkLines.push(...splitLines);
          }
        }

        currentTokens = this.tokenCounter.count(currentChunkLines.join('\n'));
      } else {
        // 通常の段落処理
        const testTokens = currentTokens + paragraphTokens;

        if (testTokens <= maxTokens) {
          // 現在のチャンクに追加（段落間に空行を挿入）
          if (currentChunkLines.length > 0) {
            currentChunkLines.push(''); // 段落間の空行
          }
          currentChunkLines.push(...paragraph.lines);
          currentTokens = this.tokenCounter.count(currentChunkLines.join('\n'));
        } else {
          // 現在のチャンクを完成させる
          if (currentChunkLines.length > 0) {
            chunks.push(
              this.createChunk(
                filePath,
                section.title,
                currentChunkLines.join('\n'),
                currentStartLine,
                currentStartLine + currentChunkLines.length - 1,
                chunkIndex++,
              ),
            );

            // オーバーラップ処理
            const overlapLines = this.calculateOverlapLines(currentChunkLines, overlapRatio);
            currentChunkLines = [...overlapLines];
            if (currentChunkLines.length > 0) {
              currentChunkLines.push(''); // 段落間の空行
            }
            currentChunkLines.push(...paragraph.lines);
            currentStartLine =
              currentStartLine +
              currentChunkLines.length -
              overlapLines.length -
              paragraph.lines.length -
              (overlapLines.length > 0 ? 1 : 0);
          } else {
            currentChunkLines = [...paragraph.lines];
          }

          currentTokens = this.tokenCounter.count(currentChunkLines.join('\n'));
        }
      }
    }

    // 最後のチャンクを追加
    if (currentChunkLines.length > 0) {
      chunks.push(
        this.createChunk(
          filePath,
          section.title,
          currentChunkLines.join('\n'),
          currentStartLine,
          currentStartLine + currentChunkLines.length - 1,
          chunkIndex,
        ),
      );
    }

    return chunks;
  }

  /**
   * チャンクを作成
   */
  private createChunk(
    filePath: string,
    title: string,
    content: string,
    startLine: number,
    endLine: number,
    chunkIndex: number,
  ): ChunkData {
    return {
      id: this.generateChunkId(filePath, startLine, endLine, chunkIndex, content),
      title,
      content,
      metadata: {
        file: filePath,
        startLine,
        endLine,
      },
    };
  }

  /**
   * オーバーラップする行を計算
   */
  private calculateOverlapLines(lines: string[], overlapRatio: number): string[] {
    if (overlapRatio <= 0 || lines.length === 0) {
      return [];
    }

    const content = lines.join('\n');
    const overlapSize = this.overlapCalculator.calculateOverlapSize(content, overlapRatio);

    if (content.length <= overlapSize) {
      return [...lines];
    }

    // 末尾からoverlapSizeの文字数分を取得
    const overlapText = content.substring(content.length - overlapSize);
    return overlapText.split('\n');
  }

  /**
   * 段落を抽出（空行で区切られたテキストブロック）
   */
  private extractParagraphs(lines: string[]): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    let currentParagraph: string[] = [];
    let emptyLines: string[] = [];

    for (const line of lines) {
      if (line.trim() === '') {
        // 空行を一時保存
        emptyLines.push(line);
      } else {
        // 非空行の場合
        if (currentParagraph.length > 0) {
          // 既存の段落がある場合、空行で区切られていれば新しい段落として処理
          if (emptyLines.length > 0) {
            paragraphs.push({ lines: [...currentParagraph] });
            currentParagraph = [line];
          } else {
            currentParagraph.push(line);
          }
        } else {
          // 新しい段落の開始
          currentParagraph = [line];
        }
        emptyLines = []; // 空行をリセット
      }
    }

    // 最後の段落を追加
    if (currentParagraph.length > 0) {
      paragraphs.push({ lines: currentParagraph });
    }

    return paragraphs;
  }

  /**
   * チャンクIDを生成
   */
  private generateChunkId(
    filePath: string,
    startLine: number,
    endLine: number,
    chunkIndex: number,
    content: string,
  ): string {
    const hash = this.generateContentHash(content);
    return `${filePath}::${startLine}-${endLine}::chunk-${chunkIndex}@${hash}`;
  }

  /**
   * コンテンツのハッシュを生成
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex').substring(0, 8);
  }
}

/**
 * セクション情報
 */
interface Section {
  title: string;
  level: number; // 見出しレベル（1-6）
  startLine: number;
  endLine: number;
  lines: string[];
}

/**
 * 段落情報
 */
interface Paragraph {
  lines: string[];
}

/**
 * チャンカーのファクトリー関数
 */
export function createChunker(
  strategy?: ChunkingStrategy,
  tokenCounter?: TokenCounter,
  overlapCalculator?: OverlapCalculator,
  splitStrategy?: TextSplitStrategy,
): ChunkingStrategy {
  return strategy || new MarkdownChunkingStrategy(tokenCounter, overlapCalculator, splitStrategy);
}
