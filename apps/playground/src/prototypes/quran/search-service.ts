import { SearchRequestSchema, SearchResponseSchema, type SearchRequest, type SearchResponse } from '@scratch-pages/api-contracts/quran'

export type { SearchResult, SearchResponse } from '@scratch-pages/api-contracts/quran'
export interface SearchService {
  search(request: SearchRequest, signal: AbortSignal): Promise<SearchResponse>
}

export const searchService: SearchService = {
  async search(request, signal) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) return { status: 'unavailable' }
    const input = SearchRequestSchema.parse(request)
    const params = new URLSearchParams({ query: input.query, language: input.language })
    if (input.page) params.set('page', input.page)
    const response = await fetch(`${url}/functions/v1/quran/v2/search?${params}`, { signal, headers: { apikey: key, Accept: 'application/json' } })
    if (!response.ok) throw new Error('Search is temporarily unavailable.')
    return SearchResponseSchema.parse(await response.json())
  },
}
