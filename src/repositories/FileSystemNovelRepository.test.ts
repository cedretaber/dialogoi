import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { FileSystemNovelRepository } from './FileSystemNovelRepository.js';
import { ProjectNotFoundError } from '../errors/index.js';

// 実際のnovelsディレクトリを使用してテストする
const novelsDir = path.join(process.cwd(), 'novels');
const SAMPLE_NOVEL_ID = 'sample_novel';

describe('FileSystemNovelRepository', () => {
  let repository: FileSystemNovelRepository;

  beforeEach(() => {
    repository = new FileSystemNovelRepository(novelsDir);
  });

  describe('listProjects', () => {
    it('利用可能なプロジェクト一覧を取得できる', async () => {
      const projects = await repository.listProjects();

      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);

      // sample_novelが含まれていることを確認
      const sampleProject = projects.find((p) => p.id === SAMPLE_NOVEL_ID);
      expect(sampleProject).toBeDefined();
      expect(sampleProject?.title).toBeTruthy();
    });

    it('プロジェクトにタイトルと説明が含まれる', async () => {
      const projects = await repository.listProjects();

      projects.forEach((project) => {
        expect(project.id).toBeTruthy();
        expect(project.title).toBeTruthy();
        // descriptionはオプションなので存在チェックのみ
        if (project.description) {
          expect(typeof project.description).toBe('string');
        }
      });
    });
  });

  describe('getProject', () => {
    it('既存のプロジェクトを取得できる', async () => {
      const project = await repository.getProject(SAMPLE_NOVEL_ID);

      expect(project.id).toBe(SAMPLE_NOVEL_ID);
      expect(project.path).toContain(SAMPLE_NOVEL_ID);
      expect(project.config).toBeDefined();
      expect(project.config.title).toBeTruthy();
    });

    it('存在しないプロジェクトでProjectNotFoundErrorを投げる', async () => {
      await expect(repository.getProject('non_existent_project')).rejects.toThrow(
        ProjectNotFoundError,
      );
    });
  });

  describe('listSettingsFiles', () => {
    it('設定ファイル一覧をプレビュー付きで取得できる', async () => {
      const files = await repository.listSettingsFiles(SAMPLE_NOVEL_ID);

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);

      files.forEach((file) => {
        expect(file.filename).toBeTruthy();
        expect(file.preview).toBeTruthy();
        expect(file.filename).toMatch(/\.(md|txt)$/);
      });
    });

    it('basic.mdが含まれている', async () => {
      const files = await repository.listSettingsFiles(SAMPLE_NOVEL_ID);
      const basicFile = files.find((f) => f.filename.includes('basic.md'));

      expect(basicFile).toBeDefined();
      expect(basicFile?.preview.length).toBeGreaterThan(0);
    });
  });

  describe('getSettingsContent', () => {
    it('特定のファイルの内容を取得できる', async () => {
      const content = await repository.getSettingsContent(SAMPLE_NOVEL_ID, 'settings/basic.md');

      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });

    it('ファイル名を省略すると全ファイルが結合される', async () => {
      const content = await repository.getSettingsContent(SAMPLE_NOVEL_ID);

      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('===');
    });

    it('存在しないファイルでエラーを投げる', async () => {
      await expect(
        repository.getSettingsContent(SAMPLE_NOVEL_ID, 'nonexistent.md'),
      ).rejects.toThrow();
    });
  });

  describe('searchSettingsFiles', () => {
    it('キーワード検索で結果を取得できる', async () => {
      const results = await repository.searchSettingsFiles(SAMPLE_NOVEL_ID, 'キャラクター');

      expect(Array.isArray(results)).toBe(true);
      // 結果がある場合の構造をテスト
      if (results.length > 0) {
        results.forEach((result) => {
          expect(result.filename).toBeTruthy();
          expect(Array.isArray(result.matchingLines)).toBe(true);
        });
      }
    });

    it('正規表現検索が動作する', async () => {
      const results = await repository.searchSettingsFiles(
        SAMPLE_NOVEL_ID,
        '主人公|キャラクター',
        true,
      );

      expect(Array.isArray(results)).toBe(true);
    });

    it('無効な正規表現でエラーを投げる', async () => {
      await expect(
        repository.searchSettingsFiles(SAMPLE_NOVEL_ID, '[invalid', true),
      ).rejects.toThrow('無効な正規表現');
    });
  });

  describe('listContentFiles', () => {
    it('本文ファイル一覧をソート済みで取得できる', async () => {
      const files = await repository.listContentFiles(SAMPLE_NOVEL_ID);

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);

      // ソートされていることを確認
      const filenames = files.map((f) => f.filename);
      const sortedFilenames = [...filenames].sort();
      expect(filenames).toEqual(sortedFilenames);
    });
  });

  describe('getContentFiles', () => {
    it('特定のファイルの内容を取得できる', async () => {
      const files = await repository.listContentFiles(SAMPLE_NOVEL_ID);
      if (files.length > 0) {
        const content = await repository.getContentFiles(SAMPLE_NOVEL_ID, files[0].filename);

        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it('ファイル名を省略すると全ファイルが結合される', async () => {
      const content = await repository.getContentFiles(SAMPLE_NOVEL_ID);

      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe('searchContentFiles', () => {
    it('本文ファイルでキーワード検索できる', async () => {
      const results = await repository.searchContentFiles(SAMPLE_NOVEL_ID, '太郎');

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('listInstructionFiles', () => {
    it('指示ファイル一覧を取得できる', async () => {
      const files = await repository.listInstructionFiles(SAMPLE_NOVEL_ID);

      expect(Array.isArray(files)).toBe(true);

      // DIALOGOI.mdが存在する場合の確認
      const dialogoiFile = files.find((f) => f.filename === 'DIALOGOI.md');
      if (dialogoiFile) {
        expect(dialogoiFile.preview).toBeTruthy();
      }
    });
  });

  describe('getInstructionFiles', () => {
    it('指示ファイルの内容を取得できる', async () => {
      const files = await repository.listInstructionFiles(SAMPLE_NOVEL_ID);

      if (files.length > 0) {
        const content = await repository.getInstructionFiles(SAMPLE_NOVEL_ID, files[0].filename);
        expect(typeof content).toBe('string');
      } else {
        // ファイルがない場合はエラーが発生することを確認
        await expect(repository.getInstructionFiles(SAMPLE_NOVEL_ID)).rejects.toThrow();
      }
    });
  });

  describe('createSettingsFile', () => {
    const testDir = 'settings';
    const testFilename = 'test_setting.md';
    const testContent = '# テスト設定\n\nこれはテスト用の設定ファイルです。';

    it('設定ファイルを作成できる', async () => {
      await repository.createSettingsFile(SAMPLE_NOVEL_ID, testDir, testFilename, testContent);

      // 作成されたファイルを確認
      const project = await repository.getProject(SAMPLE_NOVEL_ID);
      const filePath = path.join(project.path, testDir, testFilename);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toBe(testContent);

      // テスト後のクリーンアップ
      await fs.unlink(filePath);
    });

    it('上書きフラグなしで既存ファイルにエラーを投げる', async () => {
      // まずファイルを作成
      await repository.createSettingsFile(SAMPLE_NOVEL_ID, testDir, testFilename, testContent);

      try {
        // 上書きなしで再作成を試行
        await expect(
          repository.createSettingsFile(SAMPLE_NOVEL_ID, testDir, testFilename, testContent, false),
        ).rejects.toThrow('already exists');
      } finally {
        // クリーンアップ
        const project = await repository.getProject(SAMPLE_NOVEL_ID);
        const filePath = path.join(project.path, testDir, testFilename);
        await fs.unlink(filePath);
      }
    });

    it('無効なファイル名でエラーを投げる', async () => {
      await expect(
        repository.createSettingsFile(SAMPLE_NOVEL_ID, testDir, '../invalid.md', testContent),
      ).rejects.toThrow('不正な文字');
    });

    it('無効な拡張子でエラーを投げる', async () => {
      await expect(
        repository.createSettingsFile(SAMPLE_NOVEL_ID, testDir, 'test.js', testContent),
      ).rejects.toThrow('許可されていない拡張子');
    });
  });

  describe('createContentFile', () => {
    const testDir = 'contents';
    const testFilename = 'test_content.txt';
    const testContent = 'これはテスト用の本文ファイルです。';

    it('本文ファイルを作成できる', async () => {
      await repository.createContentFile(SAMPLE_NOVEL_ID, testDir, testFilename, testContent);

      // 作成されたファイルを確認
      const project = await repository.getProject(SAMPLE_NOVEL_ID);
      const filePath = path.join(project.path, testDir, testFilename);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toBe(testContent);

      // テスト後のクリーンアップ
      await fs.unlink(filePath);
    });
  });
});
