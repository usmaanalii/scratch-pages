import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CoverageDictionaryStatus } from '@scratch-pages/api-contracts/quran'
import { CoverageLookupRequestSchema } from '@scratch-pages/api-contracts/quran'
import { lookupCoverage } from './quran-api'

type LookupResult = Awaited<ReturnType<typeof lookupCoverage>>
type LookupMode = LookupResult['mode']
type PreviousPage = { result: Extract<LookupResult, { mode: 'word' }>; cursor: string }
type LookupState =
  | { status: 'idle' | 'invalid' }
  | { status: 'pending'; previous?: PreviousPage }
  | { status: 'ready'; result: LookupResult; query: string }
  | { status: 'page_failed'; query: string; previous: PreviousPage }
  | { status: 'failed'; query: string; mode: LookupMode }

function dictionaryStatus(match: CoverageDictionaryStatus) {
  if (match.status === 'indexed') {
    const entries = match.count === 1 ? '1 indexed match' : `${match.count} indexed matches`
    return `${entries} (${match.basis === 'root' ? 'root association' : 'lemma match'})`
  }
  return {
    missing: 'No indexed match',
    no_key: 'No lexical key',
    unknown: 'Unknown',
    temporarily_unavailable: 'Temporarily unavailable',
  }[match.status]
}

const control = 'min-h-11 rounded-ui-control border border-ui-border bg-ui-surface px-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ui-focus'

export function QuranCoverageLookup() {
  const [state, setState] = useState<LookupState>({ status: 'idle' })
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])

  async function search(mode: LookupMode, query: string, previous?: PreviousPage) {
    pending.current?.abort()
    const request = new AbortController()
    pending.current = request
    setState({ status: 'pending', previous })
    try {
      const result = await lookupCoverage(mode, query, request.signal, previous?.cursor)
      if (request.signal.aborted) return
      if (previous && (result.mode !== 'word' || result.total !== previous.result.total || result.nextCursor === previous.cursor)) {
        throw new Error('The lookup continuation is invalid.')
      }
      setState({
        status: 'ready', query, result: previous && result.mode === 'word'
          ? { ...result, occurrences: [...previous.result.occurrences, ...result.occurrences] }
          : result,
      })
    } catch {
      if (!request.signal.aborted) setState(previous ? { status: 'page_failed', query, previous } : { status: 'failed', query, mode })
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const query = fields.get('query')
    const mode = fields.get('mode') === 'root' ? 'root' : 'word'
    const input = CoverageLookupRequestSchema.safeParse({ mode, query })
    if (!input.success) {
      pending.current?.abort()
      setState({ status: 'invalid' })
      event.currentTarget.querySelector('input')?.focus()
      return
    }
    void search(input.data.mode, input.data.query)
  }

  const result = state.status === 'ready' ? state.result : state.status === 'pending' || state.status === 'page_failed' ? state.previous?.result : undefined
  return (
    <section className="my-8" aria-labelledby="coverage-lookup">
      <h2 id="coverage-lookup" className="font-ui-heading text-xl font-semibold">Lookup</h2>
      <form onSubmit={submit} noValidate className="grid max-w-sm gap-2">
        <label htmlFor="coverage-mode">Lookup type</label>
        <select id="coverage-mode" name="mode" className={control}>
          <option value="word">Word form</option>
          <option value="root">Exact root</option>
        </select>
        <label htmlFor="coverage-query">Arabic query</label>
        <input id="coverage-query" name="query" lang="ar" dir="rtl" required maxLength={64} className={control}
          aria-invalid={state.status === 'invalid'} aria-describedby="coverage-query-help"
          onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }} />
        <p id="coverage-query-help" className="m-0 text-sm text-ui-muted">Word lookup ignores short vowels. Exact root lookup uses the Corpus root spelling.</p>
        <button type="submit" className="min-h-11 rounded-ui-control bg-ui-primary px-4 text-ui-on-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ui-focus">Search</button>
      </form>
      <p role="status">
        {state.status === 'invalid' && 'Enter an Arabic word or root.'}
        {state.status === 'pending' && (state.previous ? 'Loading more occurrences…' : 'Searching…')}
        {state.status === 'ready' && (state.result.total === 0 ? 'No Corpus occurrences found.' : `${state.result.total} Corpus occurrences${state.result.mode === 'word' && state.result.occurrences.length < state.result.total ? `, showing ${state.result.occurrences.length}` : ''}`)}
        {state.status === 'failed' && 'Lookup temporarily unavailable.'}
        {state.status === 'page_failed' && 'More occurrences could not be loaded.'}
      </p>
      {state.status === 'failed' && <button type="button" className={control} onClick={() => void search(state.mode, state.query)}>Retry lookup</button>}
      {result?.mode === 'word' && <ol className="space-y-2 pl-5">
        {result.occurrences.map(({ chapter, verse, position, spelling, analyses }) => (
          <li key={`${chapter}:${verse}:${position}`}>
            <bdi lang="ar" dir="rtl">{spelling}</bdi>{' '}
            <span>{chapter}:{verse}, word {position}</span>
            {analyses.map(analysis => (
              <fieldset key={analysis.segment} className="my-2 min-w-0 rounded-ui-card border border-ui-border bg-ui-surface p-3">
                <legend className="px-1">Corpus segment {analysis.segment}</legend>
                <p className="my-1">
                  Root {analysis.root ? <bdi lang="ar" dir="rtl">{analysis.root}</bdi> : 'absent'}
                  {' · '}
                  Lemma {analysis.lemma ? <bdi lang="ar" dir="rtl">{analysis.lemma}</bdi> : 'absent'}
                  {analysis.lemmaVariant && ` (source variant ${analysis.lemmaVariant})`}
                </p>
                <ul className="m-0 space-y-1 pl-5">
                  <li>Lane: {dictionaryStatus(analysis.lane)}</li>
                  <li>Mufradāt: {dictionaryStatus(analysis.mufradat)}</li>
                </ul>
              </fieldset>
            ))}
          </li>
        ))}
      </ol>}
      {result?.mode === 'root' && <div>
        <h3><bdi lang="ar" dir="rtl">{result.root}</bdi></h3>
        <ul className="space-y-2 pl-5">
          <li>Lane: {dictionaryStatus(result.lane)}</li>
          <li>Mufradāt: {dictionaryStatus(result.mufradat)}</li>
        </ul>
      </div>}
      {result && <p>Quran Foundation: Unmeasured for this query</p>}
      {state.status === 'ready' && state.result.mode === 'word' && state.result.nextCursor && (
        <button type="button" className={control} onClick={() => {
          if (state.result.mode === 'word' && state.result.nextCursor) void search('word', state.query, { result: state.result, cursor: state.result.nextCursor })
        }}>Load more occurrences</button>
      )}
      {state.status === 'page_failed' && <div className="flex flex-wrap gap-2">
        <button type="button" className={control} onClick={() => void search('word', state.query, state.previous)}>Retry loading more</button>
        <button type="button" className={control} onClick={() => void search('word', state.query)}>Restart lookup</button>
      </div>}
    </section>
  )
}
