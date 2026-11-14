import { z } from 'zod'

export const VERSES_PER_PAGE = 20

export const ChapterSchema = z.object({
  id: z.number().int().min(1).max(114),
  name: z.string().trim().min(1),
  arabic: z.string().trim().min(1),
  meaning: z.string().trim().min(1),
  verses: z.number().int().min(1).max(286),
  place: z.enum(['Meccan', 'Medinan']),
})
export type Chapter = z.infer<typeof ChapterSchema>

export const SearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  language: z.enum(['arabic', 'english']),
  page: z.string().min(1).nullable(),
})
export type SearchRequest = z.infer<typeof SearchRequestSchema>
export const SearchResultSchema = z.object({
  chapter: z.number().int().min(1).max(114),
  verse: z.number().int().min(1).max(286),
  chapterName: z.string().trim().min(1),
  arabic: z.string().trim().min(1),
  translation: z.string().trim().min(1),
  translationName: z.string().trim().min(1),
})
export type SearchResult = z.infer<typeof SearchResultSchema>
export const SearchResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unavailable') }),
  z.object({ status: z.literal('ready'), results: z.array(SearchResultSchema), nextPage: z.string().min(1).nullable(), coverage: z.enum(['complete', 'limited', 'unknown']) }),
])
export type SearchResponse = z.infer<typeof SearchResponseSchema>

export const ChaptersResponseSchema = z.object({
  chapters: z.array(ChapterSchema).min(1).max(114)
    .refine(chapters => new Set(chapters.map(chapter => chapter.id)).size === chapters.length, 'Duplicate chapter IDs'),
})


export const VersesRequestSchema = z.object({
  chapter: z.number().int().min(1).max(114),
  page: z.number().int().min(1).max(15).default(1),
})
export type VersesRequest = z.input<typeof VersesRequestSchema>

export const GrammarSegmentSchema = z.object({
  kind: z.enum(['prefix', 'stem', 'suffix']),
  arabic: z.string(),
  partOfSpeech: z.string().min(1),
  root: z.string().nullable(),
  lemma: z.string().nullable(),
  features: z.array(z.string()),
})
export const WordGrammarSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('available'), segments: z.array(GrammarSegmentSchema).min(1) }),
  z.object({ status: z.literal('unavailable') }),
  z.object({ status: z.literal('temporarily_unavailable') }),
])
export type WordGrammar = z.infer<typeof WordGrammarSchema>

const DictionaryAvailabilitySchema = z.enum(['unknown', 'missing', 'indexed', 'multiple', 'temporarily_unavailable'])
const WordAvailabilitySchema = z.object({
  corpus: z.enum(['lexical', 'grammar_only', 'missing', 'temporarily_unavailable']),
  lane: DictionaryAvailabilitySchema,
  mufradat: DictionaryAvailabilitySchema,
})

export const WordSchema = z.object({
  chapter: z.number().int().min(1).max(114),
  verse: z.number().int().min(1).max(286),
  position: z.number().int().min(1),
  arabic: z.string().trim().min(1),
  meaning: z.string().trim().min(1).nullable(),
  transliteration: z.string().trim().min(1).nullable(),
  // Grammar failure must not trigger the enclosing words fallback and lose meanings.
  grammar: WordGrammarSchema.optional().catch({ status: 'temporarily_unavailable' }),
  availability: WordAvailabilitySchema.optional().catch(undefined),
})
export type QuranWord = z.infer<typeof WordSchema>

export const VerseSchema = z.object({
  number: z.number().int().min(1).max(286),
  arabic: z.string().trim().min(1),
  // Provider markup is untrusted. Consumers must render inert text or sanitize it.
  translationHtml: z.string().trim().min(1),
  // Optional enrichment must never prevent whole-verse reading.
  words: z.array(WordSchema).min(1)
    .refine(words => words.every((word, index) => word.position === index + 1))
    .optional().catch(undefined),
})
export const VersesResponseSchema = z.object({
  verses: z.array(VerseSchema).min(1).max(VERSES_PER_PAGE),
  translationName: z.string().trim().min(1),
  nextPage: z.number().int().min(1).max(15).nullable(),
})
export type VersesResponse = z.infer<typeof VersesResponseSchema>

export const LaneEntryIdSchema = z.string().regex(/^n\d+$/)
export const LaneRequestSchema = z.object({
  root: z.string().min(1).max(16).optional(),
  lemma: z.string().min(1).max(80).optional(),
}).strict().refine(query => query.root || query.lemma, 'A root or lemma is required')
export type LaneRequest = z.infer<typeof LaneRequestSchema>

export const LaneEntrySchema = z.object({
  id: LaneEntryIdSchema, headword: z.string(), root: z.string(), file: z.string().regex(/^[A-Za-z0-9_$]+\.xml$/),
  sourceUrl: z.string().regex(/^https:\/\/github\.com\/alpheios-project\/lan\/blob\/[a-f0-9]{40}\/db\/lexica\/ara\/lan\/[A-Za-z0-9_$]+\.xml$/),
  blocks: z.array(z.object({ kind: z.enum(['text', 'form', 'sense']), label: z.string(),
    runs: z.array(z.object({ text: z.string(), lang: z.string().nullable(), emphasis: z.boolean() })),
  })),
})
export type LaneEntry = z.infer<typeof LaneEntrySchema>
export const LANE_PAGE_SIZE = 12
export const LaneMatchSchema = z.object({ kind: z.enum(['lemma', 'root']), key: z.string().min(1).max(80) })
export type LaneMatch = z.infer<typeof LaneMatchSchema>
export const LaneResponseSchema = z.object({
  entries: z.array(z.object({ id: LaneEntryIdSchema, entry: LaneEntrySchema.nullable(), match: LaneMatchSchema.optional() })).max(LANE_PAGE_SIZE)
    .refine(entries => entries.every(item => !item.entry || item.entry.id === item.id), 'Entry identity mismatch')
    .refine(entries => new Set(entries.map(item => item.id)).size === entries.length, 'Duplicate entries'),
})
export type LaneResponse = z.infer<typeof LaneResponseSchema>

const LaneCursorSchema = z.string().max(200).regex(/^[a-f0-9]{64}\.[1-9]\d*\.[a-f0-9]{64}$/)
export const LanePageRequestSchema = LaneRequestSchema.safeExtend({ cursor: LaneCursorSchema.optional() })
export type LanePageRequest = z.infer<typeof LanePageRequestSchema>
export const LanePageResponseSchema = LaneResponseSchema.safeExtend({
  entryIds: z.array(LaneEntryIdSchema),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  nextCursor: LaneCursorSchema.nullable(),
})
export type LanePageResponse = z.infer<typeof LanePageResponseSchema>

export const MufradatRequestSchema = LaneRequestSchema
export type MufradatRequest = z.infer<typeof MufradatRequestSchema>
export const MufradatEntryIdSchema = z.string().regex(/^jk-l[1-9]\d*$/)
export const MufradatEntrySchema = z.object({
  id: MufradatEntryIdSchema,
  headword: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  sourceUrl: z.string().regex(/^https:\/\/github\.com\/OpenITI\/0525AH\/blob\/[a-f0-9]{40}\/data\/0502RaghibIsbahani\/0502RaghibIsbahani.Mufradat\/0502RaghibIsbahani.Mufradat.JK001150-ara1#L\d+-L\d+$/),
  raw: z.string().min(1),
  pages: z.array(z.string().regex(/^PageV\d+P\d+$/)),
  paragraphs: z.array(z.string().min(1)).min(1),
})
export type MufradatEntry = z.infer<typeof MufradatEntrySchema>
export const MufradatResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('matched'), entry: MufradatEntrySchema }),
  z.object({ status: z.literal('missing') }),
  z.object({ status: z.literal('ambiguous'), ids: z.array(MufradatEntryIdSchema).min(2).max(12) }),
])
export type MufradatResponse = z.infer<typeof MufradatResponseSchema>
export const MufradatCompleteResponseSchema = z.union([
  MufradatResponseSchema,
  z.object({ status: z.literal('multiple'), entries: z.array(MufradatEntrySchema).min(2)
    .refine(entries => new Set(entries.map(entry => entry.id)).size === entries.length, 'Duplicate entries') }),
])
export type MufradatCompleteResponse = z.infer<typeof MufradatCompleteResponseSchema>
