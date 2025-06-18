export interface NovelSummaryDto {
  id: string;
  title: string;
  description?: string;
}

export interface NovelDetailDto extends NovelSummaryDto {
  author?: string;
  createdAt?: string; // ISO8601
  updatedAt?: string;
} 
