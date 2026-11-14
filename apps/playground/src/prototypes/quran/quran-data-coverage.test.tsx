import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { server } from '../../test-server'
import QuranDataCoverage from './quran-data-coverage'

it('shows pinned dictionary coverage by word position and direct root', () => {
  render(<QuranDataCoverage />)

  const coverage = screen.getByRole('table', { name: 'Dictionary coverage' })
  expect(within(coverage).getByRole('row', { name: /All Corpus positions.*49,452 of 77,429.*63\.87%/ })).toBeVisible()
  expect(within(coverage).getByRole('row', { name: /Distinct Corpus roots.*1,283 of 1,642.*78\.14%/ })).toBeVisible()
})

it('looks up a word with the keyboard and shows separate occurrences', async () => {
  server.use(http.get(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quran/v2/coverage/lookup`, ({ request }) => {
    const params = new URL(request.url).searchParams
    if (params.get('mode') !== 'word' || params.get('query') !== 'أَظْلَمَ') return new HttpResponse(null, { status: 400 })
    return HttpResponse.json({
      mode: 'word', total: 2, nextCursor: null,
      occurrences: [
        { chapter: 2, verse: 20, position: 11, spelling: 'أَظْلَمَ', analyses: [] },
        { chapter: 53, verse: 52, position: 8, spelling: 'أَظْلَمَ', analyses: [] },
      ],
    })
  }))
  const user = userEvent.setup()
  render(<QuranDataCoverage />)
  await user.type(screen.getByRole('textbox', { name: 'Arabic query' }), 'أَظْلَمَ{Enter}')

  expect(await screen.findByText('2:20, word 11')).toBeVisible()
  expect(screen.getByText('53:52, word 8')).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('2 Corpus occurrences')
})

it('shows direct root-index results independently for each source', async () => {
  server.use(http.get(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quran/v2/coverage/lookup`, ({ request }) => {
    const params = new URL(request.url).searchParams
    if (params.get('mode') !== 'root' || params.get('query') !== 'بعد') return new HttpResponse(null, { status: 400 })
    return HttpResponse.json({
      mode: 'root', root: 'بعد', total: 3,
      lane: { status: 'missing' }, mufradat: { status: 'indexed', count: 2, basis: 'root' },
    })
  }))
  const user = userEvent.setup()
  render(<QuranDataCoverage />)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Lookup type' }), 'root')
  await user.type(screen.getByRole('textbox', { name: 'Arabic query' }), 'بعد{Enter}')

  expect(await screen.findByText('Lane: No indexed match')).toBeVisible()
  expect(screen.getByText('Mufradāt: 2 indexed matches (root association)')).toBeVisible()
  expect(screen.getByText('Quran Foundation: Unmeasured for this query')).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('3 Corpus occurrences')
})

it('shows the dictionary evidence for each analysis at one word position', async () => {
  server.use(http.get(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quran/v2/coverage/lookup`, () => HttpResponse.json({
    mode: 'word', total: 1, nextCursor: null,
    occurrences: [{
      chapter: 8, verse: 57, position: 1, spelling: 'فَإِمَّا',
      analyses: [
        { segment: 2, root: null, lemma: 'إِن', lane: { status: 'missing' }, mufradat: { status: 'temporarily_unavailable' } },
        { segment: 3, root: null, lemma: null, lane: { status: 'no_key' }, mufradat: { status: 'no_key' } },
      ],
    }],
  })))
  const user = userEvent.setup()
  render(<QuranDataCoverage />)
  await user.type(screen.getByRole('textbox', { name: 'Arabic query' }), 'فَإِمَّا{Enter}')

  const first = await screen.findByRole('group', { name: 'Corpus segment 2' })
  expect(within(first).getByText('Mufradāt: Temporarily unavailable')).toBeVisible()
  const second = screen.getByRole('group', { name: 'Corpus segment 3' })
  expect(within(second).getByText('Lane: No lexical key')).toBeVisible()
})

it('keeps the displayed positions when loading more fails and retries the same continuation', async () => {
  let attempts = 0
  server.use(http.get(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quran/v2/coverage/lookup`, ({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor')
    if (cursor !== null && ++attempts === 1) return new HttpResponse(null, { status: 503 })
    return HttpResponse.json({
      mode: 'word', total: 2, nextCursor: cursor === null ? 'next' : null,
      occurrences: [{ chapter: 2, verse: 2, position: cursor === null ? 1 : 2, spelling: 'كَانَ', analyses: [] }],
    })
  }))
  const user = userEvent.setup()
  render(<QuranDataCoverage />)
  await user.type(screen.getByRole('textbox', { name: 'Arabic query' }), 'كان{Enter}')
  await user.click(await screen.findByRole('button', { name: 'Load more occurrences' }))

  const retry = await screen.findByRole('button', { name: 'Retry loading more' })
  expect(screen.getByText('2:2, word 1')).toBeVisible()
  await user.click(retry)
  expect(await screen.findByText('2:2, word 2')).toBeVisible()
})

it('keeps the lookup editable after invalid input and announces a valid miss', async () => {
  server.use(http.get(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quran/v2/coverage/lookup`, () => HttpResponse.json({
    mode: 'word', total: 0, nextCursor: null, occurrences: [],
  })))
  const user = userEvent.setup()
  render(<QuranDataCoverage />)
  const query = screen.getByRole('textbox', { name: 'Arabic query' })
  await user.click(screen.getByRole('button', { name: 'Search' }))
  expect(query).toHaveFocus()
  expect(query).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('Enter an Arabic word or root.')

  await user.type(query, 'أبجدهوز{Enter}')
  expect(await screen.findByText('No Corpus occurrences found.')).toBeVisible()
  expect(query).toHaveAttribute('aria-invalid', 'false')
})

it('distinguishes historical joins from documented and measured provider coverage', () => {
  render(<QuranDataCoverage />)

  const coverage = screen.getByRole('table', { name: 'Source coverage' })
  expect(within(coverage).getByRole('row', { name: /Historical strict joins.*5,250 of 6,145/ })).toBeVisible()
  expect(within(coverage).getByRole('row', { name: /Documented production core chapters.*114 of 114/ })).toBeVisible()
  expect(within(coverage).getByRole('row', { name: /Current production account coverage.*Unknown/ })).toBeVisible()
})
