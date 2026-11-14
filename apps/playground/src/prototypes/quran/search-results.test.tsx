import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { SearchResults } from './search-results'

it('announces that search results are loading', () => {
  render(<SearchResults state={{ status: 'loading' }} onSelect={() => {}} onRetry={() => {}} onNextPage={() => {}} />)
  expect(screen.getByRole('status')).toHaveTextContent('Searching')
})

it('shows an attributed result and opens its verse', async () => {
  const onSelect = vi.fn()
  render(<SearchResults state={{ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'الرَّحْمَٰنِ الرَّحِيمِ', translation: 'The Most Merciful', translationName: 'Translator' }], nextPage: null }} onSelect={onSelect} onRetry={() => {}} onNextPage={() => {}} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Al-Fātiḥah 1:3/ }))
  expect(screen.getByText('الرَّحْمَٰنِ الرَّحِيمِ')).toBeVisible()
  expect(screen.getByText('The Most Merciful')).toBeVisible()
  expect(screen.getByText('Translator')).toBeVisible()
  expect(onSelect).toHaveBeenCalledWith(1, 3)
})

it('renders result text without interpreting markup', () => {
  render(<SearchResults state={{ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: '<img src=x onerror=alert(1)>', translationName: 'Translator' }], nextPage: null }} onSelect={() => {}} onRetry={() => {}} onNextPage={() => {}} />)
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('shows an empty result message', () => {
  render(<SearchResults state={{ status: 'ready', results: [], nextPage: null }} onSelect={() => {}} onRetry={() => {}} onNextPage={() => {}} />)
  expect(screen.getByRole('status')).toHaveTextContent('No results found')
})

it('offers a retry when search fails', async () => {
  const retry = vi.fn()
  render(<SearchResults state={{ status: 'error' }} onSelect={() => {}} onRetry={retry} onNextPage={() => {}} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry search' }))
  expect(retry).toHaveBeenCalledOnce()
})

it('requests the next result page', async () => {
  const next = vi.fn()
  render(<SearchResults state={{ status: 'ready', results: [{ chapter: 1, verse: 3, chapterName: 'Al-Fātiḥah', arabic: 'نص', translation: 'Merciful', translationName: 'Translator' }], nextPage: 'next' }} onSelect={() => {}} onRetry={() => {}} onNextPage={next} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Next results' }))
  expect(next).toHaveBeenCalledWith('next')
})

it('offers the next page when the current page is empty', async () => {
  const next = vi.fn()
  render(<SearchResults state={{ status: 'ready', results: [], nextPage: 'next' }} onSelect={() => {}} onRetry={() => {}} onNextPage={next} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Next results' }))
  expect(next).toHaveBeenCalledWith('next')
})
