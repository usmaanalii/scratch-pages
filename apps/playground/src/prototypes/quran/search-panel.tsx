import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { Button, Input } from '@scratch-pages/ui'
import { SearchResponseSchema } from '@scratch-pages/api-contracts/quran'
import { SearchResults } from './search-results'
import type { SearchResponse, SearchService } from './search-service'

type SearchPanelProps = {
  readonly service: SearchService
  readonly onSelect: (chapter: number, verse: number) => void
  readonly headingRef?: Ref<HTMLHeadingElement>
  readonly onReference?: (chapter: number, verse: number) => void
  readonly referenceError?: string
  readonly onEdit?: () => void
}

export function SearchPanel({ service, onSelect, headingRef, onReference, referenceError, onEdit }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [inputError, setInputError] = useState('')
  const errorId = useId()
  const inputId = useId()
  const [response, setResponse] = useState<SearchResponse | { status: 'loading' | 'error' } | null>(null)
  const request = useRef<AbortController | null>(null)
  const requestedPage = useRef<string | null>(null)
  const error = referenceError || inputError
  useEffect(() => () => request.current?.abort(), [])
  const search = (page: string | null = null) => {
    requestedPage.current = page
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setResponse({ status: 'loading' })
    const language = /\p{Script=Arabic}/u.test(query) ? 'arabic' : 'english'
    void service.search({ query: query.trim(), language, page }, controller.signal).then(result => {
      if (!controller.signal.aborted) setResponse(SearchResponseSchema.parse(result))
    }).catch(() => {
      if (!controller.signal.aborted) setResponse({ status: 'error' })
    })
  }
  return <section>
    {headingRef && <h1 ref={headingRef} tabIndex={-1} className="mt-0 mb-4 font-ui-heading text-xl font-semibold">Search</h1>}
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault()
      if (!query.trim()) {
        setInputError('Enter a reference or search term.')
        return
      }
      const match = /^(\d+):(\d+)$/.exec(query.trim())
      if (match && onReference) {
        onReference(Number(match[1]), Number(match[2]))
        return
      }
      if (query.includes(':') && onReference) {
        onReference(0, 0)
        return
      }
      search()
    }}>
      <label htmlFor={inputId} className="block text-sm font-semibold">Search the Quran
        <Input id={inputId} className="mt-2" value={query} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} onChange={event => {
          request.current?.abort()
          setQuery(event.target.value)
          setInputError('')
          onEdit?.()
          setResponse(null)
        }}/>
      </label>
      <p className="text-sm text-ui-muted">Enter a chapter and verse, such as 1:3.</p>
      <Button type="submit">Search Quran</Button>
    </form>
    {error && <p id={errorId} role="alert" className="text-ui-error">{error}</p>}
    {response?.status === 'unavailable' && <p role="status" className="text-ui-muted">Quran text search is not available yet.</p>}
    {response?.status === 'ready' && response.coverage === 'limited' && <p>Searching Al-Fatihah and Al-Baqarah only.</p>}
    {response && response.status !== 'unavailable' && <SearchResults
      state={response} onSelect={onSelect} onRetry={() => search(requestedPage.current)} onNextPage={search}
    />}
  </section>
}
