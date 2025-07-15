/**
 * Markdown形式でのレスポンス生成サービス
 * MCPツールからのレスポンスを統一されたMarkdown形式に変換する
 */

export interface FileInfo {
  filename: string;
  preview: string;
}

export interface SearchResult {
  filename: string;
  matchingLines: string[];
}

export interface ProjectInfo {
  id: string;
  title: string;
  description?: string;
}

export interface SearchOptions {
  searchType?: 'キーワード' | '正規表現';
}

/**
 * Markdown形式でのレスポンス生成サービス
 */
export class MarkdownFormatterService {
  /**
   * ファイル一覧をMarkdown形式で生成
   */
  static formatFileList(title: string, projectId: string, files: FileInfo[]): string {
    return `## ${title}

**プロジェクト:** ${projectId}
**ファイル数:** ${files.length}

${files
  .map(
    (file, index) => `### ${index + 1}. ${file.filename}

\`\`\`
${file.preview}
\`\`\``,
  )
  .join('\n\n')}`;
  }

  /**
   * 空のファイル一覧をMarkdown形式で生成
   */
  static formatEmptyFileList(title: string, projectId: string, emptyMessage: string): string {
    return `## ${title}

**プロジェクト:** ${projectId}
**ファイル数:** 0

${emptyMessage}`;
  }

  /**
   * 検索結果をMarkdown形式で生成
   */
  static formatSearchResults(
    title: string,
    projectId: string,
    query: string,
    searchType: string,
    results: SearchResult[],
  ): string {
    return `## ${title}

**プロジェクト:** ${projectId}
**クエリ:** ${query}
**検索タイプ:** ${searchType}
**結果数:** ${results.length}

${results
  .map(
    (result, index) => `### 結果 ${index + 1}: ${result.filename}

${result.matchingLines.map((line) => `> ${line}`).join('\n>\n')}`,
  )
  .join('\n\n')}`;
  }

  /**
   * 空の検索結果をMarkdown形式で生成
   */
  static formatEmptySearchResults(
    title: string,
    projectId: string,
    query: string,
    searchType: string,
    emptyMessage: string,
  ): string {
    return `## ${title}

**プロジェクト:** ${projectId}
**クエリ:** ${query}
**検索タイプ:** ${searchType}
**結果数:** 0

${emptyMessage}`;
  }

  /**
   * プロジェクト一覧をMarkdown形式で生成
   */
  static formatProjectList(projects: ProjectInfo[]): string {
    return `## 利用可能な小説プロジェクト

**プロジェクト数:** ${projects.length}

${projects
  .map(
    (project, index) => `### ${index + 1}. ${project.title}

**プロジェクトID:** \`${project.id}\`${project.description ? `\n**概要:** ${project.description}` : ''}`,
  )
  .join('\n\n')}`;
  }

  /**
   * 検索タイプを判定
   */
  static getSearchType(useRegex?: boolean): string {
    return useRegex ? '正規表現' : 'キーワード';
  }

  /**
   * 空の検索結果メッセージを生成
   */
  static generateEmptySearchMessage(searchType: string, keyword: string, fileType: string): string {
    return `${searchType}「${keyword}」に一致する${fileType}が見つかりませんでした。`;
  }
}
