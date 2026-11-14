import { expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test-server'
import { searchService } from './search-service'
import { SearchRequestSchema, SearchResponseSchema } from '@scratch-pages/api-contracts/quran'

it('loads an attributed search page through the Quran function', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key')
  server.use(http.get('https://example.supabase.co/functions/v1/quran/v2/search', ({ request }) => {
    expect(request.headers.get('apikey')).toBe('public-test-key')
    expect(new URL(request.url).searchParams.get('query')).toBe('mercy')
    return HttpResponse.json({ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fatihah', arabic: 'الرَّحْمَٰنِ الرَّحِيمِ', translation: 'the Lord of Mercy', translationName: 'M.A.S. Abdel Haleem' }], nextPage: '2', coverage: 'limited' })
  }))
  try {
    await expect(searchService.search({ query: 'mercy', language: 'english', page: null }, new AbortController().signal)).resolves.toMatchObject({ status: 'ready', nextPage: '2' })
  } finally {
    vi.unstubAllEnvs()
  }
})

it('rejects search results with an invalid verse identity', () => {
  const result = SearchResponseSchema.safeParse({ status: 'ready', results: [{ chapter: 1, verse: 0, chapterName: 'Al-Fātiḥah', arabic: 'الرَّحْمَٰنِ الرَّحِيمِ', translation: 'the Most Compassionate, Most Merciful,', translationName: 'The Clear Quran' }], nextPage: null, coverage: 'complete' })
  expect(result.success).toBe(false)
})

it('rejects an empty search query', () => {
  expect(SearchRequestSchema.safeParse({ query: ' ', language: 'english', page: null }).success).toBe(false)
})
