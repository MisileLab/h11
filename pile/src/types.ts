export type ContentType = 'text' | 'url' | 'code' | 'image'

export interface Item {
  id: number
  content: string
  content_type: ContentType
  source_app: string | null
  created_at: number  // Unix timestamp
}

export interface SearchResult extends Item {
  distance?: number
  rank?: number
}
