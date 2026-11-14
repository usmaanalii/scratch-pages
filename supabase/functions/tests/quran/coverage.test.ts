import { expect, it } from 'vitest'
import { createQuranHandler } from '../../quran/handler'
import { createCoverageLookup } from '../../quran/coverage'

it('pages a repeated word in order and rejects a continuation for a different query', async () => {
  const words = Array.from({ length: 26 }, (_, index) => ({
    chapter: 2, verse: index + 1, position: 1, spelling: 'كَانَ', analyses: [],
  }))
  const dictionary = async () => ({ roots: {}, lemmas: {} })
  const lookup = createCoverageLookup(async () => ({ revision: 'fixture', words: { 'كان': words }, roots: {} }), {
    lane: dictionary, mufradat: dictionary,
  })
  const signal = new AbortController().signal
  const first = await lookup({ mode: 'word', query: 'كان' }, signal)
  if (first.mode !== 'word' || !first.nextCursor) throw new Error('Expected a word continuation')
  expect(first.occurrences.map(word => word.verse)).toEqual(words.slice(0, 25).map(word => word.verse))
  expect(await lookup({ mode: 'word', query: 'كَانَ', cursor: first.nextCursor }, signal)).toEqual({
    mode: 'word', total: 26, occurrences: words.slice(25), nextCursor: null,
  })
  await expect(lookup({ mode: 'word', query: 'كاتب', cursor: first.nextCursor }, signal)).rejects.toThrow()
})

it('looks up exact dictionary evidence for a word without Foundation configuration', async () => {
  const origin = 'https://usmaanalii.github.io'
  const lookupCoverage = createCoverageLookup(async () => ({
    revision: 'fixture',
    words: {
      'ٱلله': [{
        chapter: 1, verse: 1, position: 2, spelling: 'ٱللَّهِ',
        analyses: [{ segment: 1, root: 'اله', lemma: 'ٱللَّه' }],
      }],
    },
    roots: { 'اله': 1 },
  }), {
    lane: async () => ({ roots: { 'اله': ['n1'] }, lemmas: { 'ٱللَّه': [] } }),
    mufradat: async () => ({ roots: {}, lemmas: { 'ٱللَّه': ['jk-l575'] } }),
  })
  const handler = createQuranHandler({ clientId: '', clientSecret: '', environment: '', origins: [origin], lookupCoverage })
  const params = new URLSearchParams({ mode: 'word', query: 'ٱللَّهِ' })
  const response = await handler(new Request(`https://example.test/functions/v1/quran/v2/coverage/lookup?${params}`, { headers: { Origin: origin } }))

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    mode: 'word', total: 1, nextCursor: null,
    occurrences: [{
      chapter: 1, verse: 1, position: 2, spelling: 'ٱللَّهِ',
      analyses: [{
        segment: 1, root: 'اله', lemma: 'ٱللَّه',
        lane: { status: 'missing' },
        mufradat: { status: 'indexed', count: 1, basis: 'lemma' },
      }],
    }],
  })
})
