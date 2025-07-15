import { describe, it, expect } from 'vitest';
import path from 'path';
import { NovelService } from './novelService.js';
import { FileSystemNovelRepository } from '../repositories/FileSystemNovelRepository.js';
import { IndexerSearchService } from './IndexerSearchService.js';
import { IndexerFileOperationsService } from './IndexerFileOperationsService.js';
import { IndexerManager } from '../lib/indexerManager.js';
import { loadConfig } from '../lib/config.js';

const novelsDir = path.join(process.cwd(), 'novels');
const config = loadConfig();

// 新しいアーキテクチャでサービスを初期化
const novelRepository = new FileSystemNovelRepository(novelsDir);
const indexerManager = new IndexerManager(config);
const searchService = new IndexerSearchService(novelRepository, indexerManager);
const fileOperationsService = new IndexerFileOperationsService(novelRepository, indexerManager);
const service = new NovelService(novelRepository, searchService, fileOperationsService);

const SAMPLE_NOVEL_ID = 'sample_novel';
const instructionFileName = 'DIALOGOI.md';

describe('NovelService instruction file operations', () => {
  it('listNovelInstructions should include DIALOGOI.md', async () => {
    const list = await service.listNovelInstructions(SAMPLE_NOVEL_ID);
    const filenames = list.map((l) => l.filename);
    expect(filenames).toContain(instructionFileName);
    // preview should contain first line
    const instr = list.find((l) => l.filename === instructionFileName);
    expect(instr?.preview.length).toBeGreaterThan(0);
  });

  it('getNovelInstructions should return content when filename specified', async () => {
    const content = await service.getNovelInstructions(SAMPLE_NOVEL_ID, instructionFileName);
    expect(content).toContain('DIALOGOI Instruction');
  });

  it('getNovelInstructions (aggregated) should include marker', async () => {
    const content = await service.getNovelInstructions(SAMPLE_NOVEL_ID);
    expect(content).toMatch(/=== DIALOGOI\.md ===/);
    expect(content).toContain('DIALOGOI Instruction');
  });
});
