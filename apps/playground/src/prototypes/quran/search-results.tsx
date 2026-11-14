import { Button } from '@scratch-pages/ui'
import type { SearchResult } from './search-service'

function translationText(markup: string) {
  const document = new DOMParser().parseFromString(markup, 'text/html')
  document.querySelectorAll('script, style, sup, img').forEach(node => { node.remove() })
  return document.body.textContent?.trim() ?? ''
}

export function SearchResults({ state, onSelect, onRetry, onNextPage }: {
  state: { status: 'loading' } | { status: 'error' } | { status: 'ready'; results: SearchResult[]; nextPage: string | null }
  onSelect: (chapter: number, verse: number) => void
  onRetry: () => void
  onNextPage: (page: string) => void
}) {
  if (state.status === 'loading') return <p role="status">Searching…</p>
  if (state.status === 'error') return <div>
    <p role="alert">Search is temporarily unavailable.</p>
    <Button onClick={onRetry}>Retry search</Button>
  </div>
  const nextPage = state.nextPage
  return <div className="mt-4 space-y-3">
    {state.results.length === 0 && <p role="status">No matches in Al-Fatihah or Al-Baqarah on this page.{nextPage ? ' Continue to the next page.' : ''}</p>}
    {state.results.map(result => <button
      className="block min-h-11 w-full rounded-ui-control border border-solid border-ui-border bg-ui-surface p-4 text-left text-ui-foreground focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-ui-focus"
      type="button" key={`${result.chapter}:${result.verse}`} onClick={() => onSelect(result.chapter, result.verse)}
    >
      <span className="block font-semibold">{result.chapterName} {result.chapter}:{result.verse}</span>
      <span className="arabic-text block wrap-anywhere" lang="ar" dir="rtl">{result.arabic}</span>
      <span className="block wrap-anywhere">{translationText(result.translation)}</span>
      <span className="mt-2 block text-sm text-ui-muted">{result.translationName}</span>
    </button>)}
    {nextPage && <Button onClick={() => onNextPage(nextPage)}>Next results</Button>}
  </div>
}
