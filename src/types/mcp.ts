export interface NovelSettingsParams {
  novelId: string;
}

export interface NovelContentParams {
  novelId: string;
  chapter: number;
}

export interface MCPResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
} 
