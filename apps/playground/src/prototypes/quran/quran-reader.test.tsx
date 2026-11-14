import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/app'
import { http, HttpResponse } from 'msw'
import { server, quranEndpoint } from '../../test-server'
import { searchService } from './search-service'

async function renderReader() {
  const user = userEvent.setup()
  window.history.pushState({}, '', '/quran/')
  render(<App />)
  await screen.findByRole('heading', { name: 'Al-Fātiḥah' })
  await screen.findByRole('button', { name: 'Bookmark verse 1' })
  return { user }
}

afterEach(() => window.history.pushState({}, '', '/'))

it('opens Read by default and shows only the selected destination', async () => {
  const { user } = await renderReader()
  const controls = within(screen.getByRole('navigation', { name: 'Reader controls' }))
  expect(controls.getByRole('button', { name: 'Read', pressed: true })).toBeVisible()
  expect(screen.queryByRole('heading', { name: /^Chapters/ })).not.toBeInTheDocument()
  expect(screen.queryByText('A moment with the Quran.')).not.toBeInTheDocument()

  await user.click(controls.getByRole('button', { name: 'Chapters' }))
  expect(screen.getByRole('heading', { name: /^Chapters/ })).toHaveFocus()
  expect(screen.queryByRole('region', { name: 'Verses' })).not.toBeInTheDocument()
  await user.click(controls.getByRole('button', { name: 'Read' }))
  expect(screen.getByRole('region', { name: 'Verses' })).toBeVisible()
})

it('opens a separate Quran search destination', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  expect(screen.getByRole('heading', { name: 'Search', level: 1 })).toHaveFocus()
  expect(screen.getByRole('textbox', { name: 'Search the Quran' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Verses' })).not.toBeInTheDocument()
})

it('focuses Search when returning after using reader navigation', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.click(screen.getByRole('button', { name: 'Read' }))
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  expect(screen.getByRole('heading', { name: 'Search', level: 1 })).toHaveFocus()
})

it('focuses Search when opened from Chapters', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: 'Chapters' }))
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  expect(screen.getByRole('heading', { name: 'Search', level: 1 })).toHaveFocus()
})

it('opens a direct verse reference from Search', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:3')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(await screen.findByText('1:3')).toBeVisible()
  expect(screen.getByText('1:3').closest('article')).toHaveFocus()
})

it('retains the reference when returning to Search', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:3')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await screen.findByText('1:3')
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  expect(screen.getByRole('textbox', { name: 'Search the Quran' })).toHaveValue('1:3')
})

it('restores the Search scroll position after reading a verse', async () => {
  const scrollingElement = document.documentElement
  const original = Object.getOwnPropertyDescriptor(document, 'scrollingElement')
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: scrollingElement })
  const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(250)
  try {
    const { user } = await renderReader()
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:3')
    await user.click(screen.getByRole('button', { name: 'Search Quran' }))
    await screen.findByText('1:3')
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    expect(scrollingElement.scrollTop).toBe(250)
  } finally {
    scrollY.mockRestore()
    if (original) Object.defineProperty(document, 'scrollingElement', original)
    else Reflect.deleteProperty(document, 'scrollingElement')
    scrollingElement.scrollTop = 0
  }
})

it('removes the verse highlight after navigation', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:3')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  const verse = (await screen.findByText('1:3')).closest('article')
  expect(verse).toHaveClass('bg-ui-background')
  await waitFor(() => expect(verse).not.toHaveClass('bg-ui-background'), { timeout: 3500 })
})

it('does not retain a navigation highlight after leaving and returning to Read', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:3')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await screen.findByText('1:3')
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.click(screen.getByRole('button', { name: 'Read' }))
  const verse = (await screen.findByText('1:3')).closest('article')
  await waitFor(() => expect(verse).not.toHaveClass('bg-ui-background'), { timeout: 3500 })
})

it('preserves a verse activation made while the navigation highlight is visible', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:3')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  const bookmark = await screen.findByRole('button', { name: 'Bookmark verse 3' })
  await user.click(bookmark)
  await new Promise(resolve => setTimeout(resolve, 2200))
  expect(bookmark).toHaveAttribute('aria-pressed', 'true')
  expect(bookmark.closest('article')).toHaveClass('bg-ui-background')
})

it('explains that text search is unavailable when no provider is configured', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(screen.getByRole('status')).toHaveTextContent('Quran text search is not available yet.')
})

it('opens a result from the search service', async () => {
  const search = vi.spyOn(searchService, 'search').mockResolvedValue({ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: 'Result translation', translationName: 'Translator' }], nextPage: null, coverage: 'complete' })
  try {
    const { user } = await renderReader()
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
    await user.click(screen.getByRole('button', { name: 'Search Quran' }))
    await user.click(await screen.findByRole('button', { name: /Al-Fātiḥah 1:3/ }))
    expect((await screen.findByText('1:3')).closest('article')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    expect(screen.getByRole('button', { name: /Al-Fātiḥah 1:3/ })).toHaveFocus()
  } finally {
    search.mockRestore()
  }
})

it('restores the selected result page after returning from Read', async () => {
  const search = vi.spyOn(searchService, 'search')
    .mockResolvedValueOnce({ status: 'ready', results: [{ chapter: 1, verse: 2, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: 'First page', translationName: 'Translator' }], nextPage: 'next', coverage: 'complete' })
    .mockResolvedValueOnce({ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'الرَّحْمَٰنِ الرَّحِيمِ', translation: 'Second page', translationName: 'Translator' }], nextPage: null, coverage: 'complete' })
  try {
    const { user } = await renderReader()
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
    await user.click(screen.getByRole('button', { name: 'Search Quran' }))
    await user.click(await screen.findByRole('button', { name: 'Next results' }))
    await user.click(await screen.findByRole('button', { name: /Al-Fātiḥah 1:3/ }))
    await screen.findByText('1:3')
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    expect(screen.getByText('Second page')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Search the Quran' })).toHaveValue('mercy')
    expect(screen.getByRole('button', { name: /Al-Fātiḥah 1:3/ })).toHaveFocus()
  } finally {
    search.mockRestore()
  }
})

it('reports unavailable chapter content when a result is selected', async () => {
  server.use(http.get(`${quranEndpoint}/chapters`, () => HttpResponse.json({ chapters: [{ id: 1, name: 'Al-Fātiḥah', arabic: 'الفاتحة', meaning: 'The Opening', verses: 7, place: 'Meccan' }] })))
  const search = vi.spyOn(searchService, 'search').mockResolvedValue({ status: 'ready', results: [{ chapter: 2, verse: 255, chapterName: 'Al-Baqarah', arabic: 'نص', translation: 'Result translation', translationName: 'Translator' }], nextPage: null, coverage: 'limited' })
  try {
    const { user } = await renderReader()
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
    await user.click(screen.getByRole('button', { name: 'Search Quran' }))
    await user.click(await screen.findByRole('button', { name: /Al-Baqarah 2:255/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('This chapter is unavailable in the current content.')
  } finally {
    search.mockRestore()
  }
})

it('clears a result navigation error after selecting an available verse', async () => {
  server.use(http.get(`${quranEndpoint}/chapters`, () => HttpResponse.json({ chapters: [{ id: 1, name: 'Al-Fātiḥah', arabic: 'الفاتحة', meaning: 'The Opening', verses: 7, place: 'Meccan' }] })))
  const search = vi.spyOn(searchService, 'search').mockResolvedValue({ status: 'ready', results: [
    { chapter: 2, verse: 255, chapterName: 'Al-Baqarah', arabic: 'نص', translation: 'Unavailable result', translationName: 'Translator' },
    { chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: 'Available result', translationName: 'Translator' },
  ], nextPage: null, coverage: 'limited' })
  try {
    const { user } = await renderReader()
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
    await user.click(screen.getByRole('button', { name: 'Search Quran' }))
    await user.click(await screen.findByRole('button', { name: /Al-Baqarah 2:255/ }))
    await user.click(screen.getByRole('button', { name: /Al-Fātiḥah 1:3/ }))
    await screen.findByText('1:3')
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  } finally {
    search.mockRestore()
  }
})

it('explains when a verse reference is out of range', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:8')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid chapter and verse reference.')
  expect(screen.getByRole('textbox', { name: 'Search the Quran' })).toHaveAttribute('aria-invalid', 'true')
})

it('opens the last verse of a chapter', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:7')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect((await screen.findByText('1:7')).closest('article')).toHaveFocus()
})

it('clears reference errors when the query is edited', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  const input = screen.getByRole('textbox', { name: 'Search the Quran' })
  await user.type(input, '1:8')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.clear(input)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('reports a malformed reference', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid chapter and verse reference.')
})

it('explains when the requested chapter is unavailable', async () => {
  server.use(http.get(`${quranEndpoint}/chapters`, () => HttpResponse.json({ chapters: [{ id: 1, name: 'Al-Fātiḥah', arabic: 'الفاتحة', meaning: 'The Opening', verses: 7, place: 'Meccan' }] })))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '2:255')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(screen.getByRole('alert')).toHaveTextContent('This chapter is unavailable in the current content.')
})

it('rejects verse zero even when the chapter is unavailable', async () => {
  server.use(http.get(`${quranEndpoint}/chapters`, () => HttpResponse.json({ chapters: [{ id: 1, name: 'Al-Fātiḥah', arabic: 'الفاتحة', meaning: 'The Opening', verses: 7, place: 'Meccan' }] })))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '2:0')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid chapter and verse reference.')
})

it.each(['0:1', '115:1', '1:0', '1:287'])('rejects the out-of-range reference %s', async reference => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), reference)
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid chapter and verse reference.')
})

it('loads and focuses a verse on an unloaded page', async () => {
  server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
    const params = new URL(request.url).searchParams
    if (params.get('chapter') === '2' && params.get('page') === '13') {
      return HttpResponse.json({ verses: [{ number: 255, arabic: 'نص للاختبار', translationHtml: 'Verse 255.' }], translationName: 'Translator', nextPage: null })
    }
    return HttpResponse.json({ verses: [{ number: 1, arabic: 'نص للاختبار', translationHtml: 'Opening.' }], translationName: 'Translator', nextPage: null })
  }))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '2:255')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect((await screen.findByText('2:255')).closest('article')).toHaveFocus()
})

it('reports when a requested verse is missing from the loaded page', async () => {
  server.use(http.get(`${quranEndpoint}/verses`, () => HttpResponse.json({ verses: [{ number: 1, arabic: 'نص', translationHtml: 'Opening.' }], translationName: 'Translator', nextPage: null })))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:3')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The requested verse is unavailable.')
})

it('keeps the latest verse selection when an earlier request finishes late', async () => {
  const pending = Promise.withResolvers<Response>()
  server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
    const params = new URL(request.url).searchParams
    if (params.get('chapter') === '2') return pending.promise
    return HttpResponse.json({ verses: [{ number: 1, arabic: 'نص', translationHtml: 'First.' }, { number: 3, arabic: 'نص', translationHtml: 'Third.' }], translationName: 'Translator', nextPage: null })
  }))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  const input = screen.getByRole('textbox', { name: 'Search the Quran' })
  await user.type(input, '2:255')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.clear(screen.getByRole('textbox', { name: 'Search the Quran' }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '1:3')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect((await screen.findByText('1:3')).closest('article')).toHaveFocus()
  await act(async () => { pending.resolve(HttpResponse.json({ verses: [{ number: 255, arabic: 'نص', translationHtml: 'Older.' }], translationName: 'Translator', nextPage: null })) })
  expect(screen.queryByText('Older.')).not.toBeInTheDocument()
})

it('cancels a pending verse jump when a chapter is selected', async () => {
  const pending = Promise.withResolvers<Response>()
  server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
    if (new URL(request.url).searchParams.get('chapter') === '2') return pending.promise
    return HttpResponse.json({ verses: [{ number: 1, arabic: 'نص', translationHtml: 'Opening.' }], translationName: 'Translator', nextPage: null })
  }))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '2:255')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(screen.getByRole('button', { name: 'Chapters' }))
  await user.click(screen.getByRole('button', { name: /Al-Fātiḥah/ }))
  expect(await screen.findByText('Opening.')).toBeVisible()
  expect(screen.queryByText('The requested verse is unavailable.')).not.toBeInTheDocument()
  await act(async () => { pending.resolve(HttpResponse.json({ verses: [{ number: 255, arabic: 'نص', translationHtml: 'Older.' }], translationName: 'Translator', nextPage: null })) })
  expect(screen.queryByText('Older.')).not.toBeInTheDocument()
})

it('does not highlight a verse from a cancelled jump in another chapter', async () => {
  const pending = Promise.withResolvers<Response>()
  server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
    if (new URL(request.url).searchParams.get('chapter') === '2') return pending.promise
    return HttpResponse.json({ verses: [{ number: 1, arabic: 'نص', translationHtml: 'Opening.' }], translationName: 'Translator', nextPage: null })
  }))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '2:1')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(screen.getByRole('button', { name: 'Chapters' }))
  await user.click(screen.getByRole('button', { name: /Al-Fātiḥah/ }))
  expect((await screen.findByText('1:1')).closest('article')).not.toHaveClass('bg-ui-background')
  await act(async () => { pending.resolve(HttpResponse.json({ verses: [{ number: 1, arabic: 'نص', translationHtml: 'Older.' }], translationName: 'Translator', nextPage: null })) })
})

it('cancels a pending verse jump when the reader changes page', async () => {
  const pending = Promise.withResolvers<Response>()
  server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
    const params = new URL(request.url).searchParams
    if (params.get('page') === '13') return pending.promise
    return HttpResponse.json({ verses: [{ number: params.get('page') === '12' ? 221 : 1, arabic: 'نص', translationHtml: 'Current page.' }], translationName: 'Translator', nextPage: null })
  }))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '2:255')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(screen.getByRole('button', { name: 'Previous verses' }))
  expect(await screen.findByText('2:221')).toBeVisible()
  expect(screen.queryByText('The requested verse is unavailable.')).not.toBeInTheDocument()
  await act(async () => { pending.resolve(HttpResponse.json({ verses: [{ number: 255, arabic: 'نص', translationHtml: 'Older.' }], translationName: 'Translator', nextPage: null })) })
})

it('does not restore a cancelled highlight when the reader later opens that page', async () => {
  const pending = Promise.withResolvers<Response>()
  const secondPage = vi.fn().mockReturnValueOnce(pending.promise).mockReturnValue(HttpResponse.json({ verses: [{ number: 21, arabic: 'نص', translationHtml: 'Page two.' }], translationName: 'Translator', nextPage: null }))
  server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
    const params = new URL(request.url).searchParams
    if (params.get('page') === '2') return secondPage()
    return HttpResponse.json({ verses: [{ number: 1, arabic: 'نص', translationHtml: 'First page.' }], translationName: 'Translator', nextPage: 2 })
  }))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '2:21')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(screen.getByRole('button', { name: 'Previous verses' }))
  await screen.findByText('2:1')
  await user.click(screen.getByRole('button', { name: 'Next verses' }))
  expect((await screen.findByText('2:21')).closest('article')).not.toHaveClass('bg-ui-background')
  await act(async () => { pending.resolve(HttpResponse.json({ verses: [{ number: 21, arabic: 'نص', translationHtml: 'Old response.' }], translationName: 'Translator', nextPage: null })) })
})

it('cancels a pending search jump when a bookmark is opened', async () => {
  const pending = Promise.withResolvers<Response>()
  server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
    if (new URL(request.url).searchParams.get('chapter') === '2') return pending.promise
    return HttpResponse.json({ verses: [{ number: 1, arabic: 'نص', translationHtml: 'Opening.' }], translationName: 'Translator', nextPage: null })
  }))
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: 'Bookmark verse 1' }))
  await user.click(screen.getByRole('button', { name: /^Search$/ }))
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '2:255')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(screen.getByRole('button', { name: 'Bookmarks' }))
  await user.click(screen.getByRole('button', { name: /Al-Fātiḥah 1:1/ }))
  expect(await screen.findByRole('button', { name: 'Bookmark verse 1' })).toHaveFocus()
  await act(async () => { pending.resolve(HttpResponse.json({ verses: [{ number: 255, arabic: 'نص', translationHtml: 'Older.' }], translationName: 'Translator', nextPage: null })) })
  expect(screen.queryByText('Older.')).not.toBeInTheDocument()
})

it('shows the saved verse and focuses Bookmarks when Bookmarks is selected', async () => {
  const { user } = await renderReader()
  const header = within(screen.getByRole('navigation', { name: 'Reader controls' }))
  expect(header.getByRole('button', { name: 'Read', pressed: true })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Bookmark verse 1' }))
  await user.click(header.getByRole('button', { name: /Bookmarks/ }))
  expect(screen.getByRole('heading', { name: 'Bookmarks 1' })).toHaveFocus()
  expect(screen.getByRole('button', { name: /Al-Fātiḥah 1:1/ })).toBeVisible()
})

it('keeps the reader shell visible and announces chapter loading', async () => {
  server.use(http.get(`${quranEndpoint}/chapters`, () => new Promise(() => {})))
  window.history.pushState({}, '', '/quran/')
  render(<App />)

  expect(await screen.findByText('Loading chapters…')).toHaveAttribute('role', 'status')
  expect(screen.getByRole('heading', { name: 'Quran reader' })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Sources' })).toBeVisible()
  const reading = screen.getByRole('region', { name: 'Current chapter' })
  expect(reading).toHaveAttribute('aria-busy', 'true')
  expect(within(reading).queryByRole('button')).not.toBeInTheDocument()
})

it('opens Al-Baqarah at the beginning when selected in Chapters', async () => {
  const { user } = await renderReader()
  await user.click(screen.getByRole('button', { name: 'Chapters' }))
  await user.click(screen.getByRole('button', { name: /Al-Baqarah/ }))
  expect(await screen.findByRole('heading', { name: 'Al-Baqarah' })).toHaveFocus()
  expect(screen.getByText('Page 1')).toBeVisible()
})

it('shows the Bismillah before chapter 2 only on its first page and omits it for chapters 1 and 9', async () => {
  server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
    const page = Number(new URL(request.url).searchParams.get('page'))
    return HttpResponse.json({ verses: [{ number: page === 1 ? 1 : 21, arabic: 'نص للاختبار', translationHtml: 'Translation.' }], translationName: 'Translator', nextPage: page === 1 ? 2 : null })
  }))
  const { user } = await renderReader()
  const bismillah = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'
  expect(screen.queryByText(bismillah)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Chapters' }))
  await user.click(screen.getByRole('button', { name: /Al-Baqarah/ }))
  expect(screen.getByText(bismillah)).toBeVisible()
  await screen.findByText('Translation.')
  await user.click(screen.getByRole('button', { name: 'Next verses' }))
  expect(screen.queryByText(bismillah)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Chapters' }))
  await user.click(screen.getByRole('button', { name: /At-Tawbah/ }))
  expect(screen.queryByText(bismillah)).not.toBeInTheDocument()
})

it('announces verse loading when changing chapters and shows the new translation when ready', async () => {
  const { user } = await renderReader()
  const pending = Promise.withResolvers<Response>()
  server.use(http.get(`${quranEndpoint}/verses`, () => pending.promise))
  await user.click(screen.getByRole('button', { name: /^NEXT/ }))

  expect(screen.getByRole('status')).toHaveTextContent('Loading verses…')
  expect(screen.getByRole('region', { name: 'Current chapter' })).not.toContainElement(screen.getByRole('status'))
  const verses = screen.getByRole('region', { name: 'Verses' })
  expect(verses).toHaveAttribute('aria-busy', 'true')
  expect(screen.queryByText('All praise is for Allah—Lord of all worlds,')).not.toBeInTheDocument()
  pending.resolve(HttpResponse.json({ verses: [{ number: 1, arabic: 'نص للاختبار', translationHtml: 'New chapter text.' }], translationName: 'Translator', nextPage: null }))

  expect(await screen.findByText('New chapter text.')).toBeVisible()
  expect(verses).toHaveAttribute('aria-busy', 'false')
})

describe('Quran reader bookmarks', () => {
  it('announces which chapter view is selected when switching to Bookmarks', async () => {
    const { user } = await renderReader()
    expect(screen.getByRole('button', { name: 'Read', pressed: true })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Bookmarks/, pressed: false }))
    expect(screen.getByRole('button', { name: /Bookmarks/, pressed: true })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Read', pressed: false })).toBeVisible()
    expect(screen.getByText('Your saved verses will find a home here.')).toBeVisible()
  })

  it('marks the verse bookmark as pressed when Bookmark verse is selected', async () => {
    const { user } = await renderReader()
    const bookmark = screen.getByRole('button', { name: 'Bookmark verse 1' })

    expect(bookmark).toHaveAttribute('aria-pressed', 'false')
    await user.click(bookmark)
    expect(bookmark).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Quran reader chapter search', () => {
  it('clears the filter when the search toggle closes the field', async () => {
    const { user } = await renderReader()
    await user.click(screen.getByRole('button', { name: 'Chapters' }))
    const toggle = screen.getByRole('button', { name: 'Search chapters' })
    await user.click(toggle)
    await user.type(screen.getByRole('textbox', { name: 'Search chapters' }), 'unknown chapter')
    await user.click(toggle)
    expect(screen.queryByRole('textbox', { name: 'Search chapters' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Al-Fātiḥah/ })).toBeVisible()
  })

  it('announces no matching chapters and retains the query when changing views', async () => {
    const { user } = await renderReader()
    const url = window.location.href
    await user.click(screen.getByRole('button', { name: 'Chapters' }))
    await user.click(screen.getByRole('button', { name: 'Search chapters' }))
    await user.type(screen.getByRole('textbox', { name: 'Search chapters' }), 'unknown chapter')
    expect(screen.getByRole('status')).toHaveTextContent('No chapters match this search.')
    await user.click(within(screen.getByRole('navigation', { name: 'Reader controls' })).getByRole('button', { name: /Bookmarks/ }))
    await user.click(screen.getByRole('button', { name: 'Chapters' }))
    expect(screen.getByRole('textbox', { name: 'Search chapters' })).toHaveValue('unknown chapter')
    expect(window.location.href).toBe(url)
  })

  it('returns focus to Search chapters and clears the query when search is closed', async () => {
    const { user } = await renderReader()
    await user.click(screen.getByRole('button', { name: 'Chapters' }))
    const toggle = screen.getByRole('button', { name: 'Search chapters' })
    await user.click(toggle)
    await user.type(screen.getByRole('textbox', { name: 'Search chapters' }), 'Yūnus')
    await user.click(screen.getByRole('button', { name: 'Close search' }))

    expect(toggle).toHaveFocus()
    await user.click(toggle)
    expect(screen.getByRole('textbox', { name: 'Search chapters' })).toHaveValue('')
    expect(screen.getByRole('button', { name: /Al-Fātiḥah/ })).toBeVisible()
  })

  it('shows matching chapters when a chapter name is entered in Search chapters', async () => {
    const { user } = await renderReader()

    await user.click(screen.getByRole('button', { name: 'Chapters' }))
    await user.click(screen.getByRole('button', { name: 'Search chapters' }))
    const search = screen.getByRole('textbox', { name: 'Search chapters' })
    await user.type(search, 'Yūnus')

    expect(screen.getByRole('button', { name: /Yūnus/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Al-Fātiḥah/ })).not.toBeInTheDocument()
  })
})

describe('Quran reader chapter navigation', () => {
  it('shows the next available chapter when Next is selected', async () => {
    const { user } = await renderReader()

    await user.click(screen.getByRole('button', { name: 'Chapters' }))
    await user.click(screen.getByRole('button', { name: /Yūnus/ }))
    await user.click(screen.getByRole('button', { name: /NEXT/ }))

    expect(screen.getByRole('heading', { name: 'Al-Kahf' })).toBeVisible()
    expect(await screen.findByText('18:1')).toBeVisible()
  })
})

describe('Quran reader chapter bookmark', () => {
  it('keeps a saved chapter tied to its original chapter after reading another', async () => {
    const { user } = await renderReader()
    await user.click(screen.getByRole('button', { name: 'Bookmark this chapter' }))
    await user.click(screen.getByRole('button', { name: /^NEXT/ }))
    expect(screen.getByRole('button', { name: 'Bookmark this chapter', pressed: false })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Bookmarks' }))
    await user.click(screen.getByRole('button', { name: /Al-Fātiḥah/ }))
    expect(screen.getByRole('heading', { name: 'Al-Fātiḥah' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Bookmark this chapter', pressed: true })).toBeVisible()
  })

  it('marks the chapter bookmark as pressed when Bookmark this chapter is selected', async () => {
    const { user } = await renderReader()

    const bookmark = screen.getByRole('button', { name: 'Bookmark this chapter', pressed: false })
    await user.click(bookmark)

    expect(screen.getByRole('button', { name: 'Bookmark this chapter', pressed: true })).toBeVisible()
  })
})

describe('Quran reader saved verse removal', () => {
  it('shows the empty bookmarks message when the last saved verse is unbookmarked', async () => {
    const { user } = await renderReader()

    await user.click(screen.getByRole('button', { name: 'Bookmark verse 1' }))
    await user.click(within(screen.getByRole('navigation', { name: 'Reader controls' })).getByRole('button', { name: /Bookmarks/ }))
    await user.click(screen.getByRole('button', { name: /Al-Fātiḥah 1:1/ }))
    await user.click(screen.getByRole('button', { name: 'Bookmark verse 1', pressed: true }))

    expect(screen.getByRole('button', { name: 'Bookmark verse 1', pressed: false })).toBeVisible()
    await user.click(within(screen.getByRole('navigation', { name: 'Reader controls' })).getByRole('button', { name: 'Bookmarks' }))
    expect(screen.getByText('Your saved verses will find a home here.')).toBeVisible()
  })
})

describe('Quran API content', () => {
  it('shows the API chapter and its verses with translation attribution', async () => {
    server.use(
      http.get(`${quranEndpoint}/chapters`, () => HttpResponse.json({ chapters: [{ id: 112, name: 'Al-Ikhlas', arabic: 'الإخلاص', meaning: 'Sincerity', verses: 4, place: 'Meccan' }] })),
      http.get(`${quranEndpoint}/verses`, () => HttpResponse.json({ verses: [{ number: 1, arabic: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ', translationHtml: 'Say, “He is Allah—One.”' }], translationName: 'Dr. Mustafa Khattab, The Clear Quran', nextPage: null })),
    )
    window.history.pushState({}, '', '/quran/')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Al-Ikhlas' })).toBeVisible()
    expect(await screen.findByText('Say, “He is Allah—One.”')).toBeVisible()
    expect(screen.getByText(/Dr. Mustafa Khattab/)).toBeVisible()
    expect(screen.queryByText('All praise is for Allah—Lord of all worlds,')).not.toBeInTheDocument()
  })
})

describe('Quran request recovery and pagination', () => {
  it('cancels the previous verse request when another chapter is opened', async () => {
    const olderRequest = new Promise<AbortSignal>(started => {
      server.use(http.get(`${quranEndpoint}/verses`, async ({ request }) => {
        const chapter = new URL(request.url).searchParams.get('chapter')
        if (chapter === '1') {
          started(request.signal)
          await new Promise<void>(resolve => request.signal.addEventListener('abort', () => resolve(), { once: true }))
        }
        return HttpResponse.json({
          verses: [{ number: 1, arabic: 'نص للاختبار', translationHtml: `Translation for chapter ${chapter}.` }],
          translationName: 'Verse translator', nextPage: null,
        })
      }))
    })
    const user = userEvent.setup()
    window.history.pushState({}, '', '/quran/')
    render(<App />)
    const signal = await olderRequest

    await user.click(screen.getByRole('button', { name: 'Chapters' }))
    await user.click(screen.getByRole('button', { name: /Al-Baqarah/ }))

    expect(await screen.findByText('Translation for chapter 2.')).toBeVisible()
    expect(signal.aborted).toBe(true)
    expect(screen.queryByText('Translation for chapter 1.')).not.toBeInTheDocument()
  })

  it('lets readers retry chapter loading after an unavailable response', async () => {
    server.use(http.get(`${quranEndpoint}/chapters`, () => HttpResponse.json({ error: 'private server detail' }, { status: 503 })))
    window.history.pushState({}, '', '/quran/')
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Quran content is not configured yet.')
    expect(screen.getByRole('heading', { name: 'Quran reader' })).toBeVisible()
    const reading = screen.getByRole('region', { name: 'Current chapter' })
    expect(reading).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByText(/private server detail/)).not.toBeInTheDocument()
    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Retry chapters' }))
    expect(await screen.findByRole('heading', { name: 'Al-Fātiḥah' })).toBeVisible()
  })

  it('loads the next verse page and opens a saved verse on its original page', async () => {
    server.use(http.get(`${quranEndpoint}/verses`, ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page'))
      return HttpResponse.json({ verses: [{ number: page === 1 ? 1 : 21, arabic: 'نص للاختبار', translationHtml: `Page ${page} translation.` }], translationName: 'Dr. Mustafa Khattab, The Clear Quran', nextPage: page === 1 ? 2 : null })
    }))
    const { user } = await renderReader()
    expect(screen.getByText('Page 1 translation.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^NEXT/ }))
    await screen.findByRole('heading', { name: 'Al-Baqarah' })
    await screen.findByText('Page 1 translation.')
    await user.click(screen.getByRole('button', { name: 'Next verses' }))
    expect(await screen.findByText('Page 2 translation.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Al-Baqarah' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Chapters' }))
    await user.click(screen.getByRole('button', { name: 'Read' }))
    expect(screen.getByText('Page 2 translation.')).toBeVisible()
    expect(screen.queryByText('Page 1 translation.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next verses' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Bookmark verse 21' }))
    await user.click(screen.getByRole('button', { name: 'Previous verses' }))
    await screen.findByText('Page 1 translation.')
    await user.click(within(screen.getByRole('navigation', { name: 'Reader controls' })).getByRole('button', { name: /Bookmarks/ }))
    await user.click(screen.getByRole('button', { name: 'Al-Baqarah 2:21' }))
    expect(await screen.findByRole('button', { name: 'Bookmark verse 21', pressed: true })).toBeVisible()
  })

  it('hides old verses when a new chapter fails and lets readers retry', async () => {
    const { user } = await renderReader()
    server.use(http.get(`${quranEndpoint}/verses`, () => HttpResponse.json({}, { status: 502 })))
    await user.click(screen.getByRole('button', { name: /NEXT/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
    expect(screen.queryByText('All praise is for Allah—Lord of all worlds,')).not.toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Retry verses' }))
    expect(await screen.findByText('Test translation for chapter 2.')).toBeVisible()
  })
})

describe('Translation attribution', () => {
  it('shows the supplied translation and translator attribution', async () => {
    server.use(http.get(`${quranEndpoint}/verses`, () => HttpResponse.json({ verses: [{ number: 1, arabic: 'نص للاختبار', translationHtml: 'Pre-live English translation.' }], translationName: 'M.A.S. Abdel Haleem', nextPage: null })))
    window.history.pushState({}, '', '/quran/')
    render(<App />)
    expect(await screen.findByText('Pre-live English translation.')).toBeVisible()
    expect(screen.getByText(/M.A.S. Abdel Haleem/)).toBeVisible()
    expect(screen.queryByText(/Dr. Mustafa Khattab/)).not.toBeInTheDocument()
  })
})
