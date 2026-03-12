export interface Paper {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  published_at: number;
  updated_at: number;
  categories: string[];
  pdf_url: string;
  summary?: string | null;
}

export interface SearchResponse {
  papers: Paper[];
  query: string;
  categories?: string[] | null;
  count: number;
}
