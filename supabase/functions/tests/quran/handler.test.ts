import { afterEach, describe, expect, it, vi } from 'vitest'
import { delay, http, HttpResponse } from 'msw'
import { server } from '../server'
import { createQuranHandler } from '../../quran/handler'

const origin = 'https://usmaanalii.github.io'
function setup() {
  return createQuranHandler({ clientId: 'test-client', clientSecret: 'test-secret', environment: 'prelive', origins: [origin] })
}
function request(path = 'chapters', method = 'GET', requestOrigin = origin) {
  return new Request(`https://example.com/functions/v1/quran/${path}`, { method, headers: { Origin: requestOrigin } })
}
function upstream() {
  server.use(
    http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => HttpResponse.json({ access_token: 'private-token', expires_in: 3600 })),
    http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', ({ request }) => {
      expect(request.headers.get('x-auth-token')).toBe('private-token')
      return HttpResponse.json({ chapters: [{ id: 1 }] })
    }),
  )
}
function tokenScenario() {
  let tokens = 0
  server.use(
    http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => {
      tokens++
      return HttpResponse.json({ access_token: 'private-token', expires_in: 3600 })
    }),
    http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', () => HttpResponse.json({ chapters: [{ id: 1 }] })),
  )
  return { handler: setup(), tokenCount: () => tokens }
}
afterEach(() => vi.useRealTimers())

it('returns only readable search verses with attributed Content text and separate OAuth scopes', async () => {
  const scopes: string[] = []
  server.use(
    http.post('https://prelive-oauth2.quran.foundation/oauth2/token', async ({ request }) => {
      const scope = new URLSearchParams(await request.text()).get('scope') ?? ''
      scopes.push(scope)
      return HttpResponse.json({ access_token: `${scope}-token`, expires_in: 3600 })
    }),
    http.get('https://apis-prelive.quran.foundation/search/api/v1/search', ({ request }) => {
      expect(request.headers.get('x-auth-token')).toBe('search-token')
      expect(request.headers.get('x-client-id')).toBe('test-client')
      return HttpResponse.json({ pagination: { current_page: 1, next_page: null, per_page: 5, total_pages: 1, total_records: 2 }, result: { navigation: [], verses: [
        { result_type: 'ayah', key: '13:30', name: 'unavailable' },
        { result_type: 'ayah', key: '1:3', name: 'search excerpt' },
      ] } })
    }),
    http.get('https://apis-prelive.quran.foundation/content/api/v4/verses/by_key/1:3', ({ request }) => {
      expect(request.headers.get('x-auth-token')).toBe('content-token')
      return HttpResponse.json({ verse: { verse_number: 3, text_uthmani: 'الرَّحْمَٰنِ الرَّحِيمِ', translations: [{ resource_id: 85, text: 'the Lord of Mercy' }] } })
    }),
  )
  const response = await setup()(request('v2/search?query=mercy&language=english'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fatihah', arabic: 'الرَّحْمَٰنِ الرَّحِيمِ', translation: 'the Lord of Mercy', translationName: 'M.A.S. Abdel Haleem' }], nextPage: null, coverage: 'limited' })
  expect(scopes).toEqual(['search', 'content'])
})

it('renews a rejected Search token without changing Content authentication', async () => {
  let issued = 0
  server.use(
    http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => HttpResponse.json({ access_token: `search-${++issued}`, expires_in: 3600 })),
    http.get('https://apis-prelive.quran.foundation/search/api/v1/search', ({ request }) => request.headers.get('x-auth-token') === 'search-1'
      ? new HttpResponse(null, { status: 401 })
      : HttpResponse.json({ pagination: { current_page: 1, next_page: null, per_page: 20, total_pages: 0, total_records: 0 }, result: { navigation: [], verses: [] } })),
  )
  const response = await setup()(request('v2/search?query=mercy&language=english'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ready', results: [], nextPage: null, coverage: 'limited' })
  expect(issued).toBe(2)
})

it('renews a rejected Content token while enriching a search result', async () => {
  let contentTokens = 0
  server.use(
    http.post('https://prelive-oauth2.quran.foundation/oauth2/token', async ({ request }) => {
      const scope = new URLSearchParams(await request.text()).get('scope')
      return HttpResponse.json({ access_token: scope === 'search' ? 'search-token' : `content-${++contentTokens}`, expires_in: 3600 })
    }),
    http.get('https://apis-prelive.quran.foundation/search/api/v1/search', () => HttpResponse.json({ pagination: { current_page: 1, next_page: null, per_page: 20, total_pages: 1, total_records: 1 }, result: { navigation: [], verses: [{ result_type: 'ayah', key: '1:3' }] } })),
    http.get('https://apis-prelive.quran.foundation/content/api/v4/verses/by_key/1:3', ({ request }) => request.headers.get('x-auth-token') === 'content-1'
      ? new HttpResponse(null, { status: 401 })
      : HttpResponse.json({ verse: { verse_number: 3, text_uthmani: 'الرَّحْمَٰنِ', translations: [{ resource_id: 85, text: 'Merciful' }] } })),
  )
  const response = await setup()(request('v2/search?query=mercy&language=english'))
  expect(response.status).toBe(200)
  expect(contentTokens).toBe(2)
})

it('keeps provider pagination when a page has no verses in the available chapters', async () => {
  server.use(
    http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => HttpResponse.json({ access_token: 'search-token', expires_in: 3600 })),
    http.get('https://apis-prelive.quran.foundation/search/api/v1/search', ({ request }) => {
      expect(new URL(request.url).searchParams.get('page')).toBe('2')
      return HttpResponse.json({ pagination: { current_page: 2, next_page: 3, per_page: 20, total_pages: 3, total_records: 30 }, result: { navigation: [], verses: [{ result_type: 'ayah', key: '13:30' }] } })
    }),
  )
  const response = await setup()(request('v2/search?query=mercy&language=english&page=2'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ready', results: [], nextPage: '3', coverage: 'limited' })
})
describe('Quran content proxy', () => {
  it('returns content to simultaneous requests using one token', async () => {
    const { handler, tokenCount } = tokenScenario()

    const responses = await Promise.all([handler(request()), handler(request())])

    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect(await Promise.all(responses.map(response => response.json()))).toEqual([
      { chapters: [{ id: 1 }] }, { chapters: [{ id: 1 }] },
    ])
    expect(tokenCount()).toBe(1)
  })

  it('renews the token when less than 30 seconds remain', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    const { handler, tokenCount } = tokenScenario()
    await handler(request())

    vi.setSystemTime(3_570_001)
    const response = await handler(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ chapters: [{ id: 1 }] })
    expect(tokenCount()).toBe(2)
  })

  it('renews the token when exactly 30 seconds remain', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    const { handler, tokenCount } = tokenScenario()
    await handler(request())

    vi.setSystemTime(3_570_000)
    const response = await handler(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ chapters: [{ id: 1 }] })
    expect(tokenCount()).toBe(2)
  })

  it('reuses the token while more than 30 seconds remain', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    const { handler, tokenCount } = tokenScenario()
    await handler(request())

    vi.setSystemTime(3_569_999)
    const response = await handler(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ chapters: [{ id: 1 }] })
    expect(tokenCount()).toBe(1)
  })

  it.each([
    { reason: 'the method writes content', path: 'chapters', method: 'POST', status: 405, error: 'Method not allowed.' },
    { reason: 'the route is unknown', path: 'https://untrusted.example', method: 'GET', status: 400, error: 'Invalid content request.' },
    { reason: 'the chapter exceeds 114', path: 'verses?chapter=115', method: 'GET', status: 400, error: 'Invalid chapter or page.' },
    { reason: 'the verse page has more than two digits', path: 'verses?chapter=1&page=999', method: 'GET', status: 400, error: 'Invalid chapter or page.' },
    { reason: 'a query parameter is unsupported', path: 'chapters?url=https://untrusted.example', method: 'GET', status: 400, error: 'Invalid content request.' },
  ])('rejects a request when $reason', async ({ path, method, status, error }) => {
    const response = await setup()(request(path, method))

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
  })

  it('rejects an untrusted origin without exposing content or allowing CORS', async () => {
    const response = await setup()(request('chapters', 'GET', 'https://untrusted.example'))

    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(await response.text()).toBe('')
  })

  it('allows a read-only preflight from a trusted origin', async () => {
    const response = await setup()(request('chapters', 'OPTIONS'))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    expect(await response.text()).toBe('')
  })

  it('returns a configuration error when Quran content credentials are missing', async () => {
    const unconfigured = createQuranHandler({ clientId: '', clientSecret: '', environment: 'prelive', origins: [origin] })
    const response = await unconfigured(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Quran content is not configured yet.' })
  })

  it('returns a configuration error when the Quran environment is unsupported', async () => {
    const handler = createQuranHandler({ clientId: 'test-client', clientSecret: 'test-secret', environment: 'invalid', origins: [origin] })

    const response = await handler(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Quran content is not configured yet.' })
  })

  it('renews an invalid token once and returns a safe error if the retry also fails', async () => {
    let tokens = 0
    let calls = 0
    server.use(
      http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => { tokens++; return HttpResponse.json({ access_token: `token-${tokens}`, expires_in: 3600 }) }),
      http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', () => { calls++; return HttpResponse.json({ error: 'upstream private detail' }, { status: 401 }) }),
    )
    const response = await setup()(request())
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Quran content is temporarily unavailable. Please try again.' })
    expect(tokens).toBe(2)
    expect(calls).toBe(2)
  })
  it('returns a safe error when token acquisition times out', async () => {
    server.use(http.post('https://prelive-oauth2.quran.foundation/oauth2/token', async () => {
      await delay(100)
      return HttpResponse.json({ access_token: 'late-token', expires_in: 3600 })
    }))
    const handler = createQuranHandler({ clientId: 'test-client', clientSecret: 'test-secret', environment: 'prelive', origins: [origin], timeoutMs: 5 })
    const response = await handler(request())
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Quran content is temporarily unavailable. Please try again.' })
  })
  it('requests the English translation available in pre-live', async () => {
    upstream()
    let translationId = ''
    server.use(http.get('https://apis-prelive.quran.foundation/content/api/v4/verses/by_chapter/1', ({ request }) => {
      translationId = new URL(request.url).searchParams.get('translations') ?? ''
      return HttpResponse.json({ verses: [] })
    }))
    expect((await setup()(request('verses?chapter=1'))).status).toBe(200)
    expect(translationId).toBe('85')
  })
  it('keeps the selected production translation when using production credentials', async () => {
    let translationId = ''
    server.use(
      http.post('https://oauth2.quran.foundation/oauth2/token', () => HttpResponse.json({ access_token: 'production-token', expires_in: 3600 })),
      http.get('https://apis.quran.foundation/content/api/v4/verses/by_chapter/1', ({ request }) => {
        translationId = new URL(request.url).searchParams.get('translations') ?? ''
        return HttpResponse.json({ verses: [] })
      }),
    )
    const handler = createQuranHandler({ clientId: 'production-client', clientSecret: 'production-secret', environment: 'production', origins: [origin] })
    expect((await handler(request('verses?chapter=1'))).status).toBe(200)
    expect(translationId).toBe('131')
  })
  it('returns chapter content without exposing credentials or tokens', async () => {
    upstream()
    const response = await setup()(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ chapters: [{ id: 1 }] })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  })
})

describe('Quran API recovery and request contracts', () => {
  it.each([
    { reason: 'the payload is null', payload: null },
    { reason: 'the token fields are missing', payload: {} },
    { reason: 'the access token is empty', payload: { access_token: '', expires_in: 3600 } },
    { reason: 'the access token is not text', payload: { access_token: 42, expires_in: 3600 } },
    { reason: 'the token lifetime is missing', payload: { access_token: 'private-token' } },
    { reason: 'the token lifetime is zero', payload: { access_token: 'private-token', expires_in: 0 } },
    { reason: 'the token lifetime is negative', payload: { access_token: 'private-token', expires_in: -1 } },
    { reason: 'the token lifetime is not numeric', payload: { access_token: 'private-token', expires_in: '3600' } },
  ])('returns a safe error without requesting content when $reason', async ({ payload }) => {
    let contentRequests = 0
    server.use(
      http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => HttpResponse.json(payload)),
      http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', () => {
        contentRequests++
        return HttpResponse.json({ chapters: [] })
      }),
    )
    const response = await setup()(request())
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Quran content is temporarily unavailable. Please try again.' })
    expect(contentRequests).toBe(0)
  })

  it('recovers on a later request after token acquisition fails', async () => {
    upstream()
    server.use(http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => new HttpResponse('private auth failure', { status: 500 })))
    const handler = setup()
    const failed = await handler(request())
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({ error: 'Quran content is temporarily unavailable. Please try again.' })
    server.use(http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => HttpResponse.json({ access_token: 'private-token', expires_in: 3600 })))
    const recovered = await handler(request())
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toEqual({ chapters: [{ id: 1 }] })
  })

  it('retries rejected content with a fresh token and returns the recovered content', async () => {
    let tokens = 0
    server.use(
      http.post('https://prelive-oauth2.quran.foundation/oauth2/token', () => {
        tokens++
        return HttpResponse.json({ access_token: tokens === 1 ? 'stale-token' : 'fresh-token', expires_in: 3600 })
      }),
      http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', ({ request }) =>
        request.headers.get('x-auth-token') === 'fresh-token'
          ? HttpResponse.json({ chapters: [{ id: 2 }] })
          : new HttpResponse(null, { status: 401 }),
      ),
    )
    const response = await setup()(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ chapters: [{ id: 2 }] })
    expect(tokens).toBe(2)
  })

  it('forwards the requested verse page with bounded page size and translation', async () => {
    upstream()
    let requestedUrl: URL | undefined
    const content = { verses: [{ verse_number: 41 }], pagination: { next_page: 4 } }
    server.use(http.get('https://apis-prelive.quran.foundation/content/api/v4/verses/by_chapter/2', ({ request }) => {
      requestedUrl = new URL(request.url)
      return HttpResponse.json(content)
    }))
    const response = await setup()(request('verses?chapter=2&page=3'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(content)
    expect(Object.fromEntries(requestedUrl?.searchParams ?? [])).toEqual({ fields: 'text_uthmani', translations: '85', per_page: '20', page: '3' })
  })

  it('rejects requests after the budget is exhausted and resets exactly at the next minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    upstream()
    const handler = setup()
    for (let i = 0; i < 60; i++) expect((await handler(request())).status).toBe(200)
    const limited = await handler(request())
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('60')
    vi.setSystemTime(59_999)
    expect((await handler(request())).status).toBe(429)
    vi.setSystemTime(60_000)
    expect((await handler(request())).status).toBe(200)
  })
})

describe('Quran upstream response contracts', () => {
  it.each([429, 503])('returns a safe response for upstream HTTP %i', async status => {
    upstream()
    server.use(http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', () => new HttpResponse('private upstream detail', { status })))
    const response = await setup()(request())
    expect(response.status).toBe(status === 429 ? 429 : 502)
    expect(await response.json()).toEqual({ error: 'Quran content is temporarily unavailable. Please try again.' })
  })

  it('returns a safe error when upstream content is not JSON', async () => {
    upstream()
    server.use(http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', () => new HttpResponse('invalid private content')))
    const response = await setup()(request())
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Quran content is temporarily unavailable. Please try again.' })
  })

  it('rejects a request with no Origin header', async () => {
    const response = await setup()(new Request('https://example.com/functions/v1/quran/chapters'))
    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})


describe('Quran v2 owned contract', () => {
  it('returns owned chapter fields while preserving the legacy response', async () => {
    upstream()
    const provider = { chapters: [{ id: 1, name_simple: 'Al-Fatihah', name_arabic: 'الفاتحة', translated_name: { name: 'The Opening' }, verses_count: 7, revelation_place: 'makkah', private_extra: 'not public' }] }
    server.use(http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', () => HttpResponse.json(provider)))
    const handler = setup()
    const response = await handler(request('v2/chapters'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ chapters: [{ id: 1, name: 'Al-Fatihah', arabic: 'الفاتحة', meaning: 'The Opening', verses: 7, place: 'Meccan' }] })
    expect(await (await handler(request())).json()).toEqual(provider)
  })
})


it('returns owned verse content and attribution without provider translation IDs', async () => {
  upstream()
  server.use(http.get('https://apis-prelive.quran.foundation/content/api/v4/verses/by_chapter/2', () => HttpResponse.json({
    verses: [{ verse_number: 21, text_uthmani: 'نص', translations: [{ resource_id: 999, text: 'Wrong translation' }, { resource_id: 85, text: 'Translation<sup>1</sup>' }] }],
    pagination: { next_page: 3 },
  })))
  const response = await setup()(request('v2/verses?chapter=2&page=2'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ verses: [{ number: 21, arabic: 'نص', translationHtml: 'Translation<sup>1</sup>' }], translationName: 'M.A.S. Abdel Haleem', nextPage: 3 })
})


it('rejects an upstream pagination jump before publishing the owned response', async () => {
  upstream()
  server.use(http.get('https://apis-prelive.quran.foundation/content/api/v4/verses/by_chapter/1', () => HttpResponse.json({
    verses: [{ verse_number: 1, text_uthmani: 'نص', translations: [{ resource_id: 85, text: 'Translation' }] }],
    pagination: { next_page: 3 },
  })))
  const response = await setup()(request('v2/verses?chapter=1&page=1'))
  expect(response.status).toBe(502)
  expect(await response.json()).toEqual({ error: 'Quran content is temporarily unavailable. Please try again.' })
})


it.each([
  { reason: 'the provider chapter list is empty', payload: { chapters: [] } },
  { reason: 'provider chapter details are missing', payload: { chapters: [{ id: 1 }] } },
  { reason: 'the provider chapter number exceeds 114', payload: { chapters: [{ id: 115, name_simple: 'Invalid', name_arabic: 'نص', translated_name: { name: 'Invalid' }, verses_count: 7, revelation_place: 'makkah' }] } },
])('returns a safe error when $reason', async ({ payload }) => {
  upstream()
  server.use(http.get('https://apis-prelive.quran.foundation/content/api/v4/chapters', () => HttpResponse.json(payload)))
  const response = await setup()(request('v2/chapters'))
  expect(response.status).toBe(502)
  expect(await response.json()).toEqual({ error: 'Quran content is temporarily unavailable. Please try again.' })
})

it.each([
  { reason: 'the chapter is missing', path: 'verses' },
  { reason: 'the chapter is below one', path: 'verses?chapter=0' },
  { reason: 'the chapter exceeds 114', path: 'verses?chapter=115' },
  { reason: 'the verse page is below one', path: 'verses?chapter=1&page=0' },
  { reason: 'the verse page exceeds the supported limit', path: 'verses?chapter=1&page=16' },
  { reason: 'the chapter parameter is repeated', path: 'verses?chapter=1&chapter=2' },
  { reason: 'the page parameter is repeated', path: 'verses?chapter=1&page=1&page=2' },
  { reason: 'a verse query parameter is unsupported', path: 'verses?chapter=1&extra=1' },
  { reason: 'a chapter query parameter is unsupported', path: 'chapters?extra=1' },
])('rejects a v2 request when $reason', async ({ path }) => {
  expect((await setup()(request(`v2/${path}`))).status).toBe(400)
})
