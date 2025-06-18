// DEPRECATED: use ../domain/novel.ts (domain types) or ../dto/novelDto.ts (DTO) instead
export { NovelConfig, NovelProject } from '../domain/novel';

export interface MCPRequest {
  type: 'settings' | 'content';
  novelId: string;
  chapter?: number;
  query?: string;
}

export interface MCPResponse {
  success: boolean;
  data?: string; // プレーンテキスト/マークダウンの内容をそのまま返す
  error?: string;
} 
