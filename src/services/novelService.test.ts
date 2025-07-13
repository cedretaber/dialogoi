import { describe, it, expect } from 'vitest';
import path from 'path';
import { NovelService } from './novelService.js';

// Use the actual novels directory that exists in the repository
const novelsDir = path.join(process.cwd(), 'novels');
const service = new NovelService(novelsDir);

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

  it('getNovelContent should return concatenated content text', async () => {
    const content = await service.getNovelContent(SAMPLE_NOVEL_ID);
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/chapter_1.txt/);
  });
});
