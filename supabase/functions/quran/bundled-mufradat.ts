import { z } from 'zod'
import { MufradatEntryIdSchema, MufradatEntrySchema, MufradatResponseSchema, MufradatCompleteResponseSchema, type MufradatEntry, type MufradatRequest } from '../../../packages/api-contracts/src/quran.ts'
import { cacheIndex, selectEntries } from './dictionary-index.ts'

const IndexSchema = z.object({ roots: z.record(z.string(), z.array(MufradatEntryIdSchema)), lemmas: z.record(z.string(), z.array(MufradatEntryIdSchema)) })
const ManifestSchema = z.object({ files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) })

export function createBundledMufradatReader(readFile: (path: URL) => Promise<Uint8Array>, directory = new URL('./mufradat-data/', import.meta.url)) {
  let cachedManifest: z.infer<typeof ManifestSchema> | null = null
  const entries = new Map<string, MufradatEntry>()
  async function read(path: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted()
    const manifest = cachedManifest ?? ManifestSchema.parse(JSON.parse(new TextDecoder().decode(await readFile(new URL('manifest.json', directory)))))
    cachedManifest = manifest
    const raw = await readFile(new URL(path, directory))
    const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(raw))
    const checksum = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    if (checksum !== manifest.files[path]) throw new Error('Mufradat asset checksum mismatch')
    signal?.throwIfAborted()
    return JSON.parse(new TextDecoder().decode(raw))
  }
  const loadIndex = cacheIndex(async () => IndexSchema.parse(await read('index.json')))
  const load = async (query: MufradatRequest, signal: AbortSignal, complete: boolean) => {
    signal.throwIfAborted()
    const index = await loadIndex(signal)
    signal.throwIfAborted()
    const { ids } = selectEntries(query, index)
    if (ids.length === 0) return MufradatResponseSchema.parse({ status: 'missing' })
    if (ids.length > 1 && !complete) return MufradatResponseSchema.parse({ status: 'ambiguous', ids })
    const matches = await Promise.all(ids.map(async id => {
      const entry = entries.get(id) ?? MufradatEntrySchema.parse(await read(`entries/${id}.json`, signal))
      if (entry.id !== id) throw new Error('Mufradat entry identity mismatch')
      entries.set(id, entry)
      return entry
    }))
    return MufradatCompleteResponseSchema.parse(matches.length === 1 ? { status: 'matched', entry: matches[0] } : { status: 'multiple', entries: matches })
  }
  return {
    legacy: async (query: MufradatRequest, signal: AbortSignal) => MufradatResponseSchema.parse(await load(query, signal, false)),
    all: (query: MufradatRequest, signal: AbortSignal) => load(query, signal, true),
    loadCoverageIndex: loadIndex,
    async loadIndex() {
      const index = await loadIndex()
      return (query: MufradatRequest) => selectEntries(query, index).ids
    },
  }
}
