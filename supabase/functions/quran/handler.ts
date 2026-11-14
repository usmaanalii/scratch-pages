import { VERSES_PER_PAGE, VersesRequestSchema, LaneRequestSchema, LaneResponseSchema, LanePageRequestSchema, LanePageResponseSchema, SearchResponseSchema } from '../../../packages/api-contracts/src/quran.ts'
import { ApiErrorSchema } from '../../../packages/api-contracts/src/error.ts'
import { mapChapters, mapVerses } from './provider.ts'
import { enrichGrammar, type MorphologyReader } from './morphology.ts'
import { MufradatRequestSchema, MufradatResponseSchema, MufradatCompleteResponseSchema } from '../../../packages/api-contracts/src/quran.ts'
import { InvalidLaneCursor, type createBundledLaneReader } from './bundled-lane.ts'
import type { createBundledMufradatReader } from './bundled-mufradat.ts'
import { enrichDictionaryAvailability } from './word-availability.ts'
import { CoverageLookupRequestSchema, CoverageLookupResponseSchema } from '../../../packages/api-contracts/src/quran.ts'
import { InvalidCoverageCursor, type createCoverageLookup } from './coverage.ts'
import { z } from 'zod'

const ProviderSearchSchema = z.object({
  pagination: z.object({ current_page: z.number().int().positive(), next_page: z.number().int().positive().nullable() }),
  result: z.object({ verses: z.array(z.object({ result_type: z.string(), key: z.string() })) }),
})
const ProviderSearchVerseSchema = z.object({
  verse: z.object({ verse_number: z.number().int(), text_uthmani: z.string().trim().min(1), translations: z.array(z.object({ resource_id: z.number(), text: z.string().trim().min(1) })) }),
})

type Config = {
  clientId: string
  clientSecret: string
  environment: string
  origins: string[]
  timeoutMs?: number
  readMorphology?: MorphologyReader
  lane?: ReturnType<typeof createBundledLaneReader>
  mufradat?: ReturnType<typeof createBundledMufradatReader>
  lookupCoverage?: ReturnType<typeof createCoverageLookup>
}

export function createQuranHandler(config: Config) {
  const { lane, mufradat } = config
  const authBase = config.environment === 'production' ? 'https://oauth2.quran.foundation' : 'https://prelive-oauth2.quran.foundation'
  const apiBase = config.environment === 'production' ? 'https://apis.quran.foundation' : 'https://apis-prelive.quran.foundation'
  let windowStart = Date.now()
  let requests = 0
  const cachedTokens: Partial<Record<'content' | 'search', { value: string; expiresAt: number }>> = {}
  const pendingTokens: Partial<Record<'content' | 'search', Promise<string>>> = {}
  async function fetchToken(scope: 'content' | 'search'): Promise<string> {
    const auth = await fetch(`${authBase}/oauth2/token`, {
      method: 'POST',
      signal: AbortSignal.timeout(config.timeoutMs ?? 8_000),
      redirect: 'error',
      headers: { Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&scope=${scope}`,
    })
    const token: unknown = await auth.json()
    if (!auth.ok || typeof token !== 'object' || token === null || !('access_token' in token) || typeof token.access_token !== 'string' || !token.access_token || !('expires_in' in token) || typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new Error('Token request failed.')
    cachedTokens[scope] = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 }
    return token.access_token
  }
  function getToken(scope: 'content' | 'search' = 'content'): Promise<string> {
    const cached = cachedTokens[scope]
    if (cached && cached.expiresAt > Date.now() + 30_000) return Promise.resolve(cached.value)
    pendingTokens[scope] ??= fetchToken(scope).finally(() => { pendingTokens[scope] = undefined })
    return pendingTokens[scope]
  }
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? ''
    const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    const error = (message: string, status: number) => Response.json(ApiErrorSchema.parse({ error: message }), { status, headers })
    if (!config.origins.includes(origin)) return new Response(null, { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'GET') return error('Method not allowed.', 405)
    const url = new URL(request.url)
    const pathRoute = url.pathname.split('/quran/')[1] ?? ''
    const ownedContract = pathRoute.startsWith('v2/')
    const route = ownedContract ? pathRoute.slice(3) : pathRoute
    const chapter = url.searchParams.get('chapter') ?? ''
    const page = url.searchParams.get('page') ?? '1'
    const completeMufradat = ownedContract && route === 'mufradat/entries'
    const mufradatRoute = ownedContract && (route === 'mufradat' || completeMufradat)
    const dictionaryPage = ownedContract && route === 'dictionary/entries'
    const dictionary = ownedContract && (route === 'dictionary' || dictionaryPage || mufradatRoute)
    const coverage = ownedContract && route === 'coverage/lookup'
    const search = ownedContract && route === 'search'
    const allowed = search ? ['query', 'language', 'page'] : coverage ? ['mode', 'query', 'cursor'] : dictionaryPage ? ['root', 'lemma', 'cursor'] : dictionary ? ['root', 'lemma'] : route === 'chapters' ? [] : ['chapter', 'page']
    if ((!search && !coverage && !dictionary && route !== 'chapters' && route !== 'verses') || [...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return error('Invalid content request.', 400)
    if (route === 'verses' && (!/^[1-9]\d{0,2}$/.test(chapter) || !/^[1-9]\d?$/.test(page) || !VersesRequestSchema.safeParse({ chapter: Number(chapter), page: Number(page) }).success)) return error('Invalid chapter or page.', 400)
    if (!coverage && !dictionary && (!config.clientId || !config.clientSecret || !['prelive', 'production'].includes(config.environment))) return error('Quran content is not configured yet.', 503)
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0 }
    // A bounded per-isolate budget, not a global or per-user rate limiter.
    if (++requests > 60) return Response.json(ApiErrorSchema.parse({ error: 'Too many requests. Please try again shortly.' }), { status: 429, headers: { ...headers, 'Retry-After': '60' } })
    if (search) {
      const query = url.searchParams.get('query')?.trim() ?? ''
      const language = url.searchParams.get('language')
      const requestedPage = url.searchParams.get('page') ?? '1'
      if (!query || query.length > 100 || !['arabic', 'english'].includes(language ?? '') || !/^[1-9]\d{0,2}$/.test(requestedPage)) return error('Invalid search request.', 400)
      try {
        const pageNumber = Number(requestedPage)
        const params = new URLSearchParams({ mode: 'advanced', query, page: requestedPage, size: '20', translation_ids: config.environment === 'prelive' ? '85' : '131', highlight: '0' })
        const searchUrl = `${apiBase}/search/api/v1/search?${params}`
        const readSearch = (token: string) => fetch(searchUrl, { signal: AbortSignal.timeout(config.timeoutMs ?? 8_000), redirect: 'error', headers: { 'x-auth-token': token, 'x-client-id': config.clientId, Accept: 'application/json' } })
        const searchToken = await getToken('search')
        let found = await readSearch(searchToken)
        if (found.status === 401) {
          if (cachedTokens.search?.value === searchToken) delete cachedTokens.search
          found = await readSearch(await getToken('search'))
        }
        if (!found.ok) return error('Quran search is temporarily unavailable. Please try again.', found.status === 429 ? 429 : 502)
        const provider = ProviderSearchSchema.parse(await found.json())
        if (provider.pagination.current_page !== pageNumber || (provider.pagination.next_page !== null && provider.pagination.next_page !== pageNumber + 1)) throw new Error('Unexpected search page')
        const keys = provider.result.verses.filter(verse => verse.result_type === 'ayah' && /^(1|2):[1-9]\d{0,2}$/.test(verse.key)).map(verse => verse.key)
        const contentToken = keys.length ? await getToken('content') : ''
        const results = await Promise.all(keys.map(async key => {
          const [chapter, verse] = key.split(':').map(Number)
          const translationId = config.environment === 'prelive' ? 85 : 131
          const contentUrl = `${apiBase}/content/api/v4/verses/by_key/${key}?fields=text_uthmani&translations=${translationId}`
          const readContent = (token: string) => fetch(contentUrl, { signal: AbortSignal.timeout(config.timeoutMs ?? 8_000), redirect: 'error', headers: { 'x-auth-token': token, 'x-client-id': config.clientId, Accept: 'application/json' } })
          let content = await readContent(contentToken)
          if (content.status === 401) {
            if (cachedTokens.content?.value === contentToken) delete cachedTokens.content
            content = await readContent(await getToken('content'))
          }
          if (!content.ok) throw new Error('Verse unavailable')
          const mapped = ProviderSearchVerseSchema.parse(await content.json()).verse
          if (mapped.verse_number !== verse) throw new Error('Verse identity mismatch')
          const translation = mapped.translations.find(item => item.resource_id === translationId)?.text
          return { chapter, verse, chapterName: chapter === 1 ? 'Al-Fatihah' : 'Al-Baqarah', arabic: mapped.text_uthmani, translation, translationName: translationId === 85 ? 'M.A.S. Abdel Haleem' : 'Dr. Mustafa Khattab, The Clear Quran' }
        }))
        return Response.json(SearchResponseSchema.parse({ status: 'ready', results, nextPage: provider.pagination.next_page?.toString() ?? null, coverage: 'limited' }), { headers })
      } catch {
        return error('Quran search is temporarily unavailable. Please try again.', 502)
      }
    }
    if (coverage) {
      const query = CoverageLookupRequestSchema.safeParse(Object.fromEntries(url.searchParams))
      if (!query.success) return error('Enter an Arabic word or root.', 400)
      if (!config.lookupCoverage) return error('Coverage lookup temporarily unavailable.', 503)
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs ?? 8_000)])
        return Response.json(CoverageLookupResponseSchema.parse(await config.lookupCoverage(query.data, signal)), { headers })
      } catch (cause) {
        if (cause instanceof InvalidCoverageCursor) return error('Restart the lookup to see current results.', 400)
        return error('Coverage lookup temporarily unavailable.', 503)
      }
    }
    if (dictionaryPage) {
      const query = LanePageRequestSchema.safeParse(Object.fromEntries(url.searchParams))
      if (!query.success) return error('Invalid dictionary request.', 400)
      if (!lane) return error('Dictionary temporarily unavailable.', 503)
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs ?? 8_000)])
        return Response.json(LanePageResponseSchema.parse(await lane.page(query.data, signal)), { headers })
      } catch (cause) {
        if (cause instanceof InvalidLaneCursor) return error('Invalid or expired dictionary continuation.', 400)
        return error('Dictionary temporarily unavailable.', 503)
      }
    }
    if (mufradatRoute) {
      const query = MufradatRequestSchema.safeParse(Object.fromEntries(url.searchParams))
      if (!query.success) return error('Invalid Mufradat request.', 400)
      if (!mufradat) return error('Mufradat temporarily unavailable.', 503)
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs ?? 8_000)])
        const content = completeMufradat
          ? MufradatCompleteResponseSchema.parse(await mufradat.all(query.data, signal))
          : MufradatResponseSchema.parse(await mufradat.legacy(query.data, signal))
        return Response.json(content, { headers })
      } catch {
        return error('Mufradat temporarily unavailable.', 503)
      }
    }
    if (dictionary) {
      const query = LaneRequestSchema.safeParse(Object.fromEntries(url.searchParams))
      if (!query.success) return error('Invalid dictionary request.', 400)
      if (!lane) return error('Dictionary temporarily unavailable.', 503)
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs ?? 8_000)])
        const content = LaneResponseSchema.parse(await lane.legacy(query.data, signal))
        return Response.json(content, { headers })
      } catch {
        return error('Dictionary temporarily unavailable.', 503)
      }
    }
    const translationId = config.environment === 'prelive' ? 85 : 131
    const path = route === 'chapters' ? 'chapters?language=en' : `verses/by_chapter/${chapter}?fields=text_uthmani&translations=${translationId}&per_page=${VERSES_PER_PAGE}&page=${page}${ownedContract ? '&words=true&word_fields=text_uthmani&language=en' : ''}`
    try {
      const read = async (token: string) => fetch(`${apiBase}/content/api/v4/${path}`, { signal: AbortSignal.timeout(config.timeoutMs ?? 8_000), redirect: 'error', headers: { 'x-auth-token': token, 'x-client-id': config.clientId } })
      const token = await getToken()
      let response = await read(token)
      if (response.status === 401) {
        // Do not invalidate a newer token acquired by a simultaneous request.
        if (cachedTokens.content?.value === token) delete cachedTokens.content
        response = await read(await getToken())
      }
      if (!response.ok) return error('Quran content is temporarily unavailable. Please try again.', response.status === 429 ? 429 : 502)
      const payload: unknown = await response.json()
      const content = ownedContract
        ? route === 'chapters' ? mapChapters(payload) : await enrichDictionaryAvailability(
          await enrichGrammar(mapVerses(payload, translationId, Number(page), Number(chapter)), Number(chapter), request.signal, config.readMorphology),
          lane, mufradat,
        )
        : payload
      return Response.json(content, { headers })
    } catch {
      return error('Quran content is temporarily unavailable. Please try again.', 502)
    }
  }
}
