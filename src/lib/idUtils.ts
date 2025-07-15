import { createHash } from 'crypto';

/**
 * 文字列IDを決定的にUUIDに変換する
 */
export function stringToUuid(input: string): string {
  // MD5ハッシュを使用して32文字の16進数文字列を生成
  const hash = createHash('md5').update(input).digest('hex');

  // UUID v4 形式に変換: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16), // version 4
    ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20), // variant
    hash.substring(20, 32),
  ].join('-');

  return uuid;
}

/**
 * UUIDから元の文字列IDを推測する（完全な復元は不可能）
 * これは主にデバッグ用途
 */
export function uuidToDebugString(uuid: string): string {
  return `uuid:${uuid.substring(0, 8)}...`;
}

/**
 * 文字列IDかUUIDかを判定
 */
export function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Qdrant用のpoint IDを生成
 * 文字列の場合はUUIDに変換、numberの場合はそのまま
 */
export function generatePointId(id: string | number): string {
  if (typeof id === 'number') {
    return id.toString();
  }

  // すでにUUIDの場合はそのまま
  if (isValidUuid(id)) {
    return id;
  }

  // 文字列の場合はUUIDに変換
  return stringToUuid(id);
}
