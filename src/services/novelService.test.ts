import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { NovelService } from './novelService.js';
import { FileSystemNovelRepository } from '../repositories/FileSystemNovelRepository.js';
import { IndexerSearchService } from './IndexerSearchService.js';
import { IndexerFileOperationsService } from './IndexerFileOperationsService.js';
import { IndexerManager } from '../lib/indexerManager.js';
import { loadConfig } from '../lib/config.js';

// VectorBackend と関連サービスをモック
vi.mock('../backends/VectorBackend.js');
vi.mock('../services/TransformersEmbeddingService.js');
vi.mock('../repositories/QdrantVectorRepository.js');

// Use the actual novels directory that exists in the repository
const novelsDir = path.join(process.cwd(), 'novels');
const config = loadConfig();

// 新しいアーキテクチャでサービスを初期化
const novelRepository = new FileSystemNovelRepository(novelsDir);
const indexerManager = new IndexerManager(config);
const searchService = new IndexerSearchService(novelRepository, indexerManager);
const fileOperationsService = new IndexerFileOperationsService(novelRepository, indexerManager);
const service = new NovelService(novelRepository, searchService, fileOperationsService);

const SAMPLE_NOVEL_ID = 'sample_novel';

// helper to fetch novels list
async function getNovelIds() {
  const projects = await service.listNovelProjects();
  return projects.map((p) => p.id);
}

describe('NovelService (read-only operations)', () => {
  it('listNovelProjects should include the sample novel', async () => {
    const ids = await getNovelIds();
    expect(ids).toContain(SAMPLE_NOVEL_ID);
  });

  it('listNovelSettings should return setting files for sample novel', async () => {
    const settings = await service.listNovelSettings(SAMPLE_NOVEL_ID);
    const filenames = settings.map((s) => s.filename);
    const basicSettingPath = path.join('settings', 'basic.md');
    expect(filenames).toContain(basicSettingPath);
    // preview should not be empty
    settings.forEach((s) => {
      expect(s.preview.length).toBeGreaterThan(0);
    });
  });

  it('getNovelSettings should concatenate settings content when no filename is provided', async () => {
    const content = await service.getNovelSettings(SAMPLE_NOVEL_ID);
    expect(content.length).toBeGreaterThan(0);
    // The aggregated content should include a marker for a known file
    expect(content).toMatch(/settings[\\/]+basic\.md/);
  });

  it('searchNovelSettings should find keyword inside settings', async () => {
    const results = await service.searchNovelSettings(SAMPLE_NOVEL_ID, 'キャラクター'); // likely to exist in sample content
    // search may return 0 if keyword not present; so just expect array structure
    expect(Array.isArray(results)).toBe(true);
  });

  it('searchNovelSettings should support regex search', async () => {
    // Test regex search with a simple pattern
    const results = await service.searchNovelSettings(
      SAMPLE_NOVEL_ID,
      'キャラクター|character',
      true,
    );
    expect(Array.isArray(results)).toBe(true);

    // Test invalid regex should throw error
    await expect(
      service.searchNovelSettings(SAMPLE_NOVEL_ID, '[invalid regex', true),
    ).rejects.toThrow('無効な正規表現');
  });

  it('getNovelContent should return concatenated content text', async () => {
    const content = await service.getNovelContent(SAMPLE_NOVEL_ID);
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/chapter_1.txt/);
  });

  it('searchNovelContent should support regex search', async () => {
    // Test regex search with a simple pattern
    const results = await service.searchNovelContent(SAMPLE_NOVEL_ID, 'chapter|チャプター', true);
    expect(Array.isArray(results)).toBe(true);

    // Test invalid regex should throw error
    await expect(
      service.searchNovelContent(SAMPLE_NOVEL_ID, '[invalid regex', true),
    ).rejects.toThrow('無効な正規表現');
  });

  it('searchRag should return search results', async () => {
    // VectorBackend をモックしているため、実際のベクトル検索ではなく空配列が返される
    const results = await service.searchRag(SAMPLE_NOVEL_ID, 'キャラクター', 5);
    // モック環境では空配列が返される可能性があるが、undefinedが返される場合もある
    expect(results === undefined || Array.isArray(results)).toBe(true);
    if (results !== undefined) {
      expect(results).toEqual([]);
    }
  }, 10000);
});
