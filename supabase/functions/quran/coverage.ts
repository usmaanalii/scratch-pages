import { z } from 'zod'
import {
  COVERAGE_PAGE_SIZE, CoverageAnalysisKeySchema, CoverageOccurrenceSchema,
  type CoverageDictionaryStatus, type CoverageLookupRequest, type CoverageLookupResponse,
} from '../../../packages/api-contracts/src/quran.ts'
import { selectEntries } from './dictionary-index.ts'

export const CoverageIndexSchema = z.object({
  revision: z.string().min(1),
  words: z.record(z.string(), z.array(CoverageOccurrenceSchema.extend({ analyses: z.array(CoverageAnalysisKeySchema) }))),
  roots: z.record(z.string(), z.number().int().positive()),
})
export type CoverageIndex = z.infer<typeof CoverageIndexSchema>
type LookupKeys = Parameters<typeof selectEntries>[0]
type LoadDictionary = (signal: AbortSignal) => Promise<Parameters<typeof selectEntries>[1]>

export class InvalidCoverageCursor extends Error {}

export function wordComparisonKey(value: string) {
  return value.normalize('NFC').replace(/[\u0640\u064B-\u0652]/gu, '').trim().replace(/\s+/gu, ' ')
}

async function dictionaryLookup(load: LoadDictionary, signal: AbortSignal): Promise<(keys: LookupKeys) => CoverageDictionaryStatus> {
  const index = await load(signal).catch(() => null)
  return keys => {
    if (!keys.root && !keys.lemma) return { status: 'no_key' }
    if (!index) return { status: 'temporarily_unavailable' }
    const { ids, match } = selectEntries(keys, index)
    return ids.length && match
      ? { status: 'indexed', count: ids.length, basis: match.kind }
      : { status: 'missing' }
  }
}

export function createCoverageLookup(
  loadIndex: (signal: AbortSignal) => Promise<CoverageIndex>,
  dictionaries: { lane: LoadDictionary; mufradat: LoadDictionary },
) {
  return async (input: CoverageLookupRequest, signal: AbortSignal): Promise<CoverageLookupResponse> => {
    const index = await loadIndex(signal)
    const [lane, mufradat] = await Promise.all([
      dictionaryLookup(dictionaries.lane, signal),
      dictionaryLookup(dictionaries.mufradat, signal),
    ])
    signal.throwIfAborted()
    if (input.mode === 'root') {
      const root = input.query.normalize('NFC')
      return { mode: 'root', root, total: index.roots[root] ?? 0, lane: lane({ root }), mufradat: mufradat({ root }) }
    }

    const key = wordComparisonKey(input.query)
    const matches = index.words[key] ?? []
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
    const binding = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
    const offset = input.cursor ? Number(input.cursor.split('.')[1]) : 0
    const cursorAt = (position: number) => `${index.revision}.${position}.${binding}`
    if (input.cursor && (!Number.isSafeInteger(offset) || offset <= 0 || offset >= matches.length
      || offset % COVERAGE_PAGE_SIZE !== 0 || input.cursor !== cursorAt(offset))) throw new InvalidCoverageCursor()
    const next = offset + COVERAGE_PAGE_SIZE
    const occurrences = matches.slice(offset, next).map(word => ({
      ...word,
      analyses: word.analyses.map(analysis => {
        const keys = { root: analysis.root ?? undefined, lemma: analysis.lemma ?? undefined }
        return { ...analysis, lane: lane(keys), mufradat: mufradat(keys) }
      }),
    }))
    return { mode: 'word', total: matches.length, occurrences, nextCursor: next < matches.length ? cursorAt(next) : null }
  }
}
