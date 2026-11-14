import { z } from 'zod'
import { LANE_PAGE_SIZE, LaneEntryIdSchema, LaneEntrySchema, LaneResponseSchema, LanePageResponseSchema, type LanePageRequest, type LanePageResponse, type LaneEntry, type LaneRequest, type LaneResponse } from '../../../packages/api-contracts/src/quran.ts'
import { cacheIndex, selectEntries } from './dictionary-index.ts'

export class InvalidLaneCursor extends Error {}

export const LaneIndexSchema = z.object({
  roots: z.record(z.string(), z.array(LaneEntryIdSchema)),
  lemmas: z.record(z.string(), z.array(LaneEntryIdSchema)),
})
export const LaneCatalogueSchema = LaneIndexSchema.extend({ entryFiles: z.record(LaneEntryIdSchema, z.string().regex(/^packs\/n\d+\.json\.gz$/)) })
const ManifestSchema = z.object({ files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) })

async function checksum(raw: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(raw))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function createBundledLaneReader(readFile: (path: URL) => Promise<Uint8Array>, directory = new URL('./lane-data/', import.meta.url)) {
  let manifest: z.infer<typeof ManifestSchema> | null = null
  let index: z.infer<typeof LaneIndexSchema> | null = null
  const cache = new Map<string, LaneEntry>()
  async function read(path: string, signal?: AbortSignal, compressed = false): Promise<unknown> {
    signal?.throwIfAborted()
    const assets = manifest ?? ManifestSchema.parse(JSON.parse(new TextDecoder().decode(await readFile(new URL('manifest.json', directory)))))
    manifest = assets
    const raw = Uint8Array.from(await readFile(new URL(path, directory)))
    if (await checksum(raw) !== assets.files[path]) throw new Error('Lane asset checksum mismatch')
    signal?.throwIfAborted()
    const text = compressed
      ? await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'), { signal })).text()
      : new TextDecoder().decode(raw)
    return JSON.parse(text)
  }
  const legacy = async (query: LaneRequest, signal: AbortSignal): Promise<LaneResponse> => {
    signal.throwIfAborted()
    const lookup = index ?? LaneIndexSchema.parse(await read('index.json', signal))
    index = lookup
    const { ids } = selectEntries(query, lookup)
    const entries = await Promise.all(ids.map(id => Promise.resolve(cache.get(id))
      .then(async cached => {
        const entry = cached ?? LaneEntrySchema.parse(await read(`lane/${id}.json`, signal))
        cache.set(id, entry)
        return { id, entry }
      }).catch(() => ({ id, entry: null }))))
    signal.throwIfAborted()
    return LaneResponseSchema.parse({ entries })
  }
  const loadCatalogue = cacheIndex(async () => LaneCatalogueSchema.parse(await read('catalogue.json')))
  const page = async (query: LanePageRequest, signal: AbortSignal): Promise<LanePageResponse> => {
    signal.throwIfAborted()
    const lookup = await loadCatalogue(signal)
    signal.throwIfAborted()
    const revision = manifest?.files['catalogue.json'] ?? ''
    const { ids, match } = selectEntries(query, lookup)
    const binding = await checksum(new TextEncoder().encode(JSON.stringify({ root: query.root ?? null, lemma: query.lemma ?? null })))
    const offset = query.cursor ? Number(query.cursor.split('.')[1]) : 0
    if (query.cursor && (query.cursor.split('.')[0] !== revision || query.cursor.split('.')[2] !== binding || !Number.isSafeInteger(offset) || offset <= 0 || offset >= ids.length || offset % LANE_PAGE_SIZE !== 0)) throw new InvalidLaneCursor()
    const packs = new Map<string, Promise<Record<string, LaneEntry>>>()
    const entries = await Promise.all(ids.slice(offset, offset + LANE_PAGE_SIZE).map(async id => {
      try {
        const file = lookup.entryFiles[id]
        if (!file) throw new Error('Missing Lane pack')
        if (!cache.has(id) && !packs.has(file)) packs.set(file, read(file, signal, true).then(value => z.record(LaneEntryIdSchema, LaneEntrySchema).parse(value)))
        const entry = cache.get(id) ?? (await packs.get(file))?.[id]
        if (!entry || entry.id !== id) throw new Error('Lane entry identity mismatch')
        cache.set(id, entry)
        return { id, entry, match }
      } catch {
        return { id, entry: null }
      }
    }))
    signal.throwIfAborted()
    return LanePageResponseSchema.parse({ entries, entryIds: ids, revision, nextCursor: offset + LANE_PAGE_SIZE < ids.length ? `${revision}.${offset + LANE_PAGE_SIZE}.${binding}` : null })
  }
  return { legacy, page, loadCoverageIndex: loadCatalogue, async loadIndex() {
    const lookup = await loadCatalogue()
    return (query: LaneRequest) => selectEntries(query, lookup).ids
  } }
}
