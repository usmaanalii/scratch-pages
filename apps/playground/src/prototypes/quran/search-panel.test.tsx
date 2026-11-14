import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SearchPanel } from './search-panel'

it('displays attributed results from the search service', async () => {
  const service = { search: vi.fn().mockResolvedValue({ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'الرَّحْمَٰنِ الرَّحِيمِ', translation: 'The Most Merciful', translationName: 'Translator' }], nextPage: null, coverage: 'complete' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(await screen.findByText('The Most Merciful')).toBeVisible()
  expect(screen.getByText('Translator')).toBeVisible()
})

it('identifies limited search coverage', async () => {
  const service = { search: vi.fn().mockResolvedValue({ status: 'ready', results: [], nextPage: null, coverage: 'limited' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(await screen.findByText('Searching Al-Fatihah and Al-Baqarah only.')).toBeVisible()
})

it('announces a pending search', async () => {
  const service = { search: vi.fn().mockReturnValue(new Promise(() => {})) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(screen.getByRole('status')).toHaveTextContent('Searching')
})

it('asks for a query when the input is empty', async () => {
  const service = { search: vi.fn().mockResolvedValue({ status: 'unavailable' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a reference or search term.')
  expect(service.search).not.toHaveBeenCalled()
})

it('sends Arabic queries in Arabic mode', async () => {
  const service = { search: vi.fn().mockResolvedValue({ status: 'unavailable' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'رحمة')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ language: 'arabic' }), expect.any(AbortSignal))
})

it('sends a trimmed query to the search service', async () => {
  const service = { search: vi.fn().mockResolvedValue({ status: 'unavailable' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), '  mercy  ')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'mercy' }), expect.any(AbortSignal))
})

it('lets the reader retry a failed search', async () => {
  const service = { search: vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce({ status: 'ready', results: [], nextPage: null, coverage: 'complete' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(await screen.findByRole('button', { name: 'Retry search' }))
  expect(await screen.findByRole('status')).toHaveTextContent('No matches in Al-Fatihah or Al-Baqarah on this page')
})

it('reports malformed search responses as a retryable failure', async () => {
  const service = { search: vi.fn().mockResolvedValue({ status: 'ready', results: [{ chapter: 1, verse: 0 }], nextPage: null, coverage: 'complete' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(await screen.findByRole('button', { name: 'Retry search' })).toBeVisible()
})

it('loads the next page of search results', async () => {
  const service = { search: vi.fn().mockResolvedValueOnce({ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: 'First result', translationName: 'Translator' }], nextPage: 'next', coverage: 'complete' }).mockResolvedValueOnce({ status: 'ready', results: [{ chapter: 1, verse: 4, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: 'Second result', translationName: 'Translator' }], nextPage: null, coverage: 'complete' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(await screen.findByRole('button', { name: 'Next results' }))
  expect(await screen.findByText('Second result')).toBeVisible()
  expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({ page: 'next' }), expect.any(AbortSignal))
})

it('retries the page that failed', async () => {
  const service = { search: vi.fn().mockResolvedValueOnce({ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: 'First result', translationName: 'Translator' }], nextPage: 'next', coverage: 'complete' }).mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce({ status: 'ready', results: [], nextPage: null, coverage: 'complete' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Search the Quran' }), 'mercy')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.click(await screen.findByRole('button', { name: 'Next results' }))
  await user.click(await screen.findByRole('button', { name: 'Retry search' }))
  expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({ page: 'next' }), expect.any(AbortSignal))
})

it('ignores an older search that finishes after a newer one', async () => {
  const old = Promise.withResolvers<{ status: 'ready'; results: []; nextPage: null; coverage: 'complete' }>()
  const service = { search: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce({ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: 'New result', translationName: 'Translator' }], nextPage: null, coverage: 'complete' }) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  const input = screen.getByRole('textbox', { name: 'Search the Quran' })
  await user.type(input, 'old')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.clear(input)
  await user.type(input, 'new')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  expect(await screen.findByText('New result')).toBeVisible()
  await act(async () => { old.resolve({ status: 'ready', results: [], nextPage: null, coverage: 'complete' }) })
  expect(screen.getByText('New result')).toBeVisible()
})

it('does not show results for a query after it has been edited', async () => {
  const pending = Promise.withResolvers<{ status: 'ready'; results: []; nextPage: null; coverage: 'complete' }>()
  const service = { search: vi.fn().mockReturnValue(pending.promise) }
  render(<SearchPanel service={service} onSelect={() => {}} />)
  const user = userEvent.setup()
  const input = screen.getByRole('textbox', { name: 'Search the Quran' })
  await user.type(input, 'old')
  await user.click(screen.getByRole('button', { name: 'Search Quran' }))
  await user.clear(input)
  await user.type(input, 'new')
  await act(async () => { pending.resolve({ status: 'ready', results: [], nextPage: null, coverage: 'complete' }) })
  expect(screen.queryByText('No matches in Al-Fatihah or Al-Baqarah on this page.')).not.toBeInTheDocument()
})
