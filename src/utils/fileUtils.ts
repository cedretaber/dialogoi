import fs from 'fs/promises';
import path from 'path';

/**
 * ファイルが存在するかチェックする
 * @param filePath チェックするファイルのパス
 * @returns ファイルが存在する場合true
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ファイルを読み込んでプレビューを生成する
 * @param filePath 読み込むファイルのパス
 * @param basePath 相対パス計算の基準パス
 * @param previewLines プレビューの行数（デフォルト: 3）
 * @returns ファイルの相対パス、内容、プレビュー
 */
export async function readFileWithPreview(
  filePath: string, 
  basePath: string, 
  previewLines: number = 3
): Promise<{
  relativePath: string;
  content: string;
  preview: string;
}> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const preview = lines.slice(0, previewLines).join('\n');
  const relativePath = path.relative(basePath, filePath);
  
  return {
    relativePath,
    content,
    preview
  };
}

/**
 * 指定ディレクトリ内のファイルを再帰的に検索
 * @param dirPath 検索するディレクトリのパス
 * @param extensions 検索対象の拡張子リスト（拡張子のみ、ドットなし）
 * @returns 見つかったファイルの絶対パスリスト
 */
export async function findFilesRecursively(
  dirPath: string, 
  extensions: string[]
): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // サブディレクトリも検索
        const subFiles = await findFilesRecursively(fullPath, extensions);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // ディレクトリが存在しない場合はスキップ
  }
  
  return files;
}

/**
 * ディレクトリが存在しない場合は作成する
 * @param dirPath 作成するディレクトリのパス
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
} 
