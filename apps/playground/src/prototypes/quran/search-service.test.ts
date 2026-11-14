import { expect, it } from 'vitest'
import { searchService } from './search-service'
import { SearchRequestSchema, SearchResponseSchema } from '@scratch-pages/api-contracts/quran'

it('reports unavailability when search is not configured', async () => {
  await expect(searchService.search({ query: 'mercy', language: 'english', page: null }, new AbortController().signal)).resolves.toEqual({ status: 'unavailable' })
})

it('rejects search results with an invalid verse identity', () => {
  const result = SearchResponseSchema.safeParse({ status: 'ready', results: [{ chapter: 1, verse: 0, chapterName: 'Al-Fātiḥah', arabic: 'الرَّحْمَٰنِ الرَّحِيمِ', translation: 'the Most Compassionate, Most Merciful,', translationName: 'The Clear Quran' }], nextPage: null, coverage: 'complete' })
  expect(result.success).toBe(false)
})

it('rejects an empty search query', () => {
  expect(SearchRequestSchema.safeParse({ query: ' ', language: 'english', page: null }).success).toBe(false)
})
