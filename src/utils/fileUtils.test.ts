import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  fileExists,
  readFileWithPreview,
  findFilesRecursively,
  ensureDirectory,
  readFileLines,
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

  it('readFileLines returns specified line range correctly', async () => {
    await ensureDirectory(nestedDir);
    await fs.writeFile(testFilePath, testContent, 'utf-8');

    // Test reading middle lines
    const result = await readFileLines(testFilePath, 2, 3);
    expect(result).toBe('Line 2\nLine 3');

    // Test reading single line
    const singleLine = await readFileLines(testFilePath, 1, 1);
    expect(singleLine).toBe('Line 1');

    // Test reading all lines
    const allLines = await readFileLines(testFilePath, 1, 4);
    expect(allLines).toBe(testContent);
  });

  it('readFileLines handles edge cases properly', async () => {
    await ensureDirectory(nestedDir);
    await fs.writeFile(testFilePath, testContent, 'utf-8');

    // Test reading beyond file end
    const beyondEnd = await readFileLines(testFilePath, 3, 10);
    expect(beyondEnd).toBe('Line 3\nLine 4');

    // Test reading from line 0 (should start from 1)
    const fromZero = await readFileLines(testFilePath, 0, 2);
    expect(fromZero).toBe('Line 1\nLine 2');

    // Test reading non-existent file
    await expect(readFileLines(path.join(nestedDir, 'nonexistent.txt'), 1, 1)).rejects.toThrow();
  });
});
