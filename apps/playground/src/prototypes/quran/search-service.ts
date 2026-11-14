import type { SearchRequest, SearchResponse } from '@scratch-pages/api-contracts/quran'

export type { SearchResult, SearchResponse } from '@scratch-pages/api-contracts/quran'
export interface SearchService {
  search(request: SearchRequest, signal: AbortSignal): Promise<SearchResponse>
}

export const searchService: SearchService = {
  async search() { return { status: 'unavailable' } },
}
