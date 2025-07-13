import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  fileExists,
  readFileWithPreview,
  findFilesRecursively,
  ensureDirectory,
} from './fileUtils.js';

describe('fileUtils', () => {
  const tempRoot = path.join(process.cwd(), 'test-temp-utils');
  const nestedDir = path.join(tempRoot, 'nested');
  const testFilePath = path.join(nestedDir, 'test.txt');
  const testContent = ['Line 1', 'Line 2', 'Line 3', 'Line 4'].join('\n');

  beforeEach(async () => {
    // Clean slate before running each test
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean up after the test run
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('ensureDirectory creates a directory that did not exist', async () => {
    await ensureDirectory(nestedDir);
    const exists = await fileExists(nestedDir);
    expect(exists).toBe(true);
  });

  it('fileExists correctly detects existing and non-existing files', async () => {
    // non-existing should be false
    expect(await fileExists(testFilePath)).toBe(false);

    // create file and test again
    await ensureDirectory(nestedDir);
    await fs.writeFile(testFilePath, testContent, 'utf-8');
    expect(await fileExists(testFilePath)).toBe(true);
  });

  it('readFileWithPreview returns correct preview lines', async () => {
    await ensureDirectory(nestedDir);
    await fs.writeFile(testFilePath, testContent, 'utf-8');

    const result = await readFileWithPreview(testFilePath, tempRoot, 2);
    expect(result.relativePath).toBe(path.relative(tempRoot, testFilePath));
    expect(result.preview).toBe('Line 1\nLine 2');
  });

  it('findFilesRecursively returns files with specified extensions', async () => {
    await ensureDirectory(nestedDir);
    const txtPath = path.join(nestedDir, 'file1.txt');
    const mdPath = path.join(nestedDir, 'file2.md');
    const otherPath = path.join(nestedDir, 'file3.json');

    await fs.writeFile(txtPath, 'txt', 'utf-8');
    await fs.writeFile(mdPath, 'md', 'utf-8');
    await fs.writeFile(otherPath, 'json', 'utf-8');

    const result = await findFilesRecursively(tempRoot, ['txt', 'md']);
    expect(result).toContain(txtPath);
    expect(result).toContain(mdPath);
    expect(result).not.toContain(otherPath);
  });
});
