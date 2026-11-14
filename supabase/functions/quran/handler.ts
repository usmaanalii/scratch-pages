import { VERSES_PER_PAGE, VersesRequestSchema, LaneRequestSchema, LaneResponseSchema, LanePageRequestSchema, LanePageResponseSchema } from '../../../packages/api-contracts/src/quran.ts'
import { ApiErrorSchema } from '../../../packages/api-contracts/src/error.ts'
import { mapChapters, mapVerses } from './provider.ts'
import { enrichGrammar, type MorphologyReader } from './morphology.ts'
import { MufradatRequestSchema, MufradatResponseSchema, MufradatCompleteResponseSchema } from '../../../packages/api-contracts/src/quran.ts'
import { InvalidLaneCursor, type createBundledLaneReader } from './bundled-lane.ts'
import type { createBundledMufradatReader } from './bundled-mufradat.ts'
import { enrichDictionaryAvailability } from './word-availability.ts'
import { CoverageLookupRequestSchema, CoverageLookupResponseSchema } from '../../../packages/api-contracts/src/quran.ts'
import { InvalidCoverageCursor, type createCoverageLookup } from './coverage.ts'

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
  let cachedToken: { value: string; expiresAt: number } | undefined
  let pendingToken: Promise<string> | undefined
  async function fetchToken(): Promise<string> {
    const auth = await fetch(`${authBase}/oauth2/token`, {
      method: 'POST',
      signal: AbortSignal.timeout(config.timeoutMs ?? 8_000),
      redirect: 'error',
      headers: { Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=content',
    })
    const token: unknown = await auth.json()
    if (!auth.ok || typeof token !== 'object' || token === null || !('access_token' in token) || typeof token.access_token !== 'string' || !token.access_token || !('expires_in' in token) || typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new Error('Token request failed.')
    cachedToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 }
    return cachedToken.value
  }
  function getToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return Promise.resolve(cachedToken.value)
    pendingToken ??= fetchToken().finally(() => { pendingToken = undefined })
    return pendingToken
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
    const allowed = coverage ? ['mode', 'query', 'cursor'] : dictionaryPage ? ['root', 'lemma', 'cursor'] : dictionary ? ['root', 'lemma'] : route === 'chapters' ? [] : ['chapter', 'page']
    if ((!coverage && !dictionary && route !== 'chapters' && route !== 'verses') || [...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return error('Invalid content request.', 400)
    if (route === 'verses' && (!/^[1-9]\d{0,2}$/.test(chapter) || !/^[1-9]\d?$/.test(page) || !VersesRequestSchema.safeParse({ chapter: Number(chapter), page: Number(page) }).success)) return error('Invalid chapter or page.', 400)
    if (!coverage && !dictionary && (!config.clientId || !config.clientSecret || !['prelive', 'production'].includes(config.environment))) return error('Quran content is not configured yet.', 503)
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0 }
    // A bounded per-isolate budget, not a global or per-user rate limiter.
    if (++requests > 60) return Response.json(ApiErrorSchema.parse({ error: 'Too many requests. Please try again shortly.' }), { status: 429, headers: { ...headers, 'Retry-After': '60' } })
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
        if (cachedToken?.value === token) cachedToken = undefined
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
