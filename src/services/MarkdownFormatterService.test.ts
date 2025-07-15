import { describe, it, expect } from 'vitest';
import {
  MarkdownFormatterService,
  type FileInfo,
  type SearchResult,
  type ProjectInfo,
} from './MarkdownFormatterService.js';

describe('MarkdownFormatterService', () => {
  describe('formatFileList', () => {
    it('ファイル一覧を正しいMarkdown形式で生成する', () => {
      const files: FileInfo[] = [
        {
          filename: 'test1.md',
          preview: 'プレビュー1\n内容1',
        },
        {
          filename: 'test2.txt',
          preview: 'プレビュー2\n内容2',
        },
      ];

      const result = MarkdownFormatterService.formatFileList(
        'テストファイル一覧',
        'test-project',
        files,
      );

      expect(result).toContain('## テストファイル一覧');
      expect(result).toContain('**プロジェクト:** test-project');
      expect(result).toContain('**ファイル数:** 2');
      expect(result).toContain('### 1. test1.md');
      expect(result).toContain('### 2. test2.txt');
      expect(result).toContain('```\nプレビュー1\n内容1\n```');
      expect(result).toContain('```\nプレビュー2\n内容2\n```');
    });

    it('空のファイル一覧を正しく処理する', () => {
      const files: FileInfo[] = [];

      const result = MarkdownFormatterService.formatFileList(
        '空のファイル一覧',
        'empty-project',
        files,
      );

      expect(result).toContain('## 空のファイル一覧');
      expect(result).toContain('**プロジェクト:** empty-project');
      expect(result).toContain('**ファイル数:** 0');
      expect(result).not.toContain('### 1.');
    });

    it('単一ファイルを正しく処理する', () => {
      const files: FileInfo[] = [
        {
          filename: 'single.md',
          preview: '単一ファイル',
        },
      ];

      const result = MarkdownFormatterService.formatFileList(
        '単一ファイル',
        'single-project',
        files,
      );

      expect(result).toContain('**ファイル数:** 1');
      expect(result).toContain('### 1. single.md');
      expect(result).not.toContain('### 2.');
    });
  });

  describe('formatEmptyFileList', () => {
    it('空のファイル一覧メッセージを正しく生成する', () => {
      const result = MarkdownFormatterService.formatEmptyFileList(
        'エラー一覧',
        'error-project',
        'エラーファイルが見つかりませんでした。',
      );

      expect(result).toContain('## エラー一覧');
      expect(result).toContain('**プロジェクト:** error-project');
      expect(result).toContain('**ファイル数:** 0');
      expect(result).toContain('エラーファイルが見つかりませんでした。');
    });
  });

  describe('formatSearchResults', () => {
    it('検索結果を正しいMarkdown形式で生成する', () => {
      const results: SearchResult[] = [
        {
          filename: 'result1.md',
          matchingLines: ['マッチした行1', 'マッチした行2'],
        },
        {
          filename: 'result2.txt',
          matchingLines: ['別のマッチ行'],
        },
      ];

      const result = MarkdownFormatterService.formatSearchResults(
        '検索結果',
        'search-project',
        'テストキーワード',
        'キーワード',
        results,
      );

      expect(result).toContain('## 検索結果');
      expect(result).toContain('**プロジェクト:** search-project');
      expect(result).toContain('**クエリ:** テストキーワード');
      expect(result).toContain('**検索タイプ:** キーワード');
      expect(result).toContain('**結果数:** 2');
      expect(result).toContain('### 結果 1: result1.md');
      expect(result).toContain('### 結果 2: result2.txt');
      expect(result).toContain('> マッチした行1');
      expect(result).toContain('> マッチした行2');
      expect(result).toContain('> 別のマッチ行');
    });

    it('単一の検索結果を正しく処理する', () => {
      const results: SearchResult[] = [
        {
          filename: 'single-result.md',
          matchingLines: ['単一のマッチ行'],
        },
      ];

      const result = MarkdownFormatterService.formatSearchResults(
        '単一検索結果',
        'single-project',
        '単一キーワード',
        '正規表現',
        results,
      );

      expect(result).toContain('**結果数:** 1');
      expect(result).toContain('**検索タイプ:** 正規表現');
      expect(result).toContain('### 結果 1: single-result.md');
      expect(result).not.toContain('### 結果 2:');
    });

    it('複数行のマッチを正しく引用形式で表示する', () => {
      const results: SearchResult[] = [
        {
          filename: 'multi-line.md',
          matchingLines: ['行1', '行2', '行3'],
        },
      ];

      const result = MarkdownFormatterService.formatSearchResults(
        'マルチライン検索',
        'multi-project',
        'マルチキーワード',
        'キーワード',
        results,
      );

      expect(result).toContain('> 行1\n>\n> 行2\n>\n> 行3');
    });
  });

  describe('formatEmptySearchResults', () => {
    it('空の検索結果メッセージを正しく生成する', () => {
      const result = MarkdownFormatterService.formatEmptySearchResults(
        '空の検索結果',
        'empty-search-project',
        '検索クエリ',
        'キーワード',
        'マッチするファイルが見つかりませんでした。',
      );

      expect(result).toContain('## 空の検索結果');
      expect(result).toContain('**プロジェクト:** empty-search-project');
      expect(result).toContain('**クエリ:** 検索クエリ');
      expect(result).toContain('**検索タイプ:** キーワード');
      expect(result).toContain('**結果数:** 0');
      expect(result).toContain('マッチするファイルが見つかりませんでした。');
    });
  });

  describe('formatProjectList', () => {
    it('プロジェクト一覧を正しいMarkdown形式で生成する', () => {
      const projects: ProjectInfo[] = [
        {
          id: 'project1',
          title: 'プロジェクト1',
          description: 'テストプロジェクト1の説明',
        },
        {
          id: 'project2',
          title: 'プロジェクト2',
          description: 'テストプロジェクト2の説明',
        },
      ];

      const result = MarkdownFormatterService.formatProjectList(projects);

      expect(result).toContain('## 利用可能な小説プロジェクト');
      expect(result).toContain('**プロジェクト数:** 2');
      expect(result).toContain('### 1. プロジェクト1');
      expect(result).toContain('### 2. プロジェクト2');
      expect(result).toContain('**プロジェクトID:** `project1`');
      expect(result).toContain('**プロジェクトID:** `project2`');
      expect(result).toContain('**概要:** テストプロジェクト1の説明');
      expect(result).toContain('**概要:** テストプロジェクト2の説明');
    });

    it('説明がないプロジェクトを正しく処理する', () => {
      const projects: ProjectInfo[] = [
        {
          id: 'no-desc-project',
          title: '説明なしプロジェクト',
        },
      ];

      const result = MarkdownFormatterService.formatProjectList(projects);

      expect(result).toContain('### 1. 説明なしプロジェクト');
      expect(result).toContain('**プロジェクトID:** `no-desc-project`');
      expect(result).not.toContain('**概要:**');
    });

    it('空のプロジェクト一覧を正しく処理する', () => {
      const projects: ProjectInfo[] = [];

      const result = MarkdownFormatterService.formatProjectList(projects);

      expect(result).toContain('## 利用可能な小説プロジェクト');
      expect(result).toContain('**プロジェクト数:** 0');
      expect(result).not.toContain('### 1.');
    });
  });

  describe('getSearchType', () => {
    it('正規表現フラグがtrueの場合は正規表現を返す', () => {
      const result = MarkdownFormatterService.getSearchType(true);
      expect(result).toBe('正規表現');
    });

    it('正規表現フラグがfalseの場合はキーワードを返す', () => {
      const result = MarkdownFormatterService.getSearchType(false);
      expect(result).toBe('キーワード');
    });

    it('正規表現フラグがundefinedの場合はキーワードを返す', () => {
      const result = MarkdownFormatterService.getSearchType(undefined);
      expect(result).toBe('キーワード');
    });
  });

  describe('generateEmptySearchMessage', () => {
    it('空の検索結果メッセージを正しく生成する', () => {
      const result = MarkdownFormatterService.generateEmptySearchMessage(
        'キーワード',
        'テストキーワード',
        '設定ファイル',
      );

      expect(result).toBe(
        'キーワード「テストキーワード」に一致する設定ファイルが見つかりませんでした。',
      );
    });

    it('正規表現検索の空の結果メッセージを正しく生成する', () => {
      const result = MarkdownFormatterService.generateEmptySearchMessage(
        '正規表現',
        '.*test.*',
        '本文ファイル',
      );

      expect(result).toBe('正規表現「.*test.*」に一致する本文ファイルが見つかりませんでした。');
    });
  });

  describe('統合テスト', () => {
    it('実際のワークフローをシミュレートする', () => {
      // 設定ファイル検索のシミュレーション
      const searchResults: SearchResult[] = [
        {
          filename: 'character.md',
          matchingLines: ['主人公は勇敢な騎士である', '彼は剣の達人でもある'],
        },
      ];

      const searchResult = MarkdownFormatterService.formatSearchResults(
        '設定ファイル検索結果',
        'fantasy-novel',
        '主人公',
        'キーワード',
        searchResults,
      );

      expect(searchResult).toContain('## 設定ファイル検索結果');
      expect(searchResult).toContain('**プロジェクト:** fantasy-novel');
      expect(searchResult).toContain('**クエリ:** 主人公');

      // 空の検索結果のシミュレーション
      const emptyMessage = MarkdownFormatterService.generateEmptySearchMessage(
        'キーワード',
        '存在しないキーワード',
        '設定ファイル',
      );

      const emptyResult = MarkdownFormatterService.formatEmptySearchResults(
        '設定ファイル検索結果',
        'fantasy-novel',
        '存在しないキーワード',
        'キーワード',
        emptyMessage,
      );

      expect(emptyResult).toContain('**結果数:** 0');
      expect(emptyResult).toContain(
        'キーワード「存在しないキーワード」に一致する設定ファイルが見つかりませんでした。',
      );
    });
  });
});
