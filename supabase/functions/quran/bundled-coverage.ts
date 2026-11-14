import { z } from 'zod'
import { CoverageIndexSchema } from './coverage.ts'

const ManifestSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })

export function createBundledCoverageIndex(readFile: (path: URL) => Promise<Uint8Array>, directory = new URL('./coverage-data/', import.meta.url)) {
  const decoder = new TextDecoder()
  async function load() {
    const manifest = ManifestSchema.parse(JSON.parse(decoder.decode(await readFile(new URL('manifest.json', directory)))))
    const compressed = Uint8Array.from(await readFile(new URL('index.json.gz', directory)))
    const hash = await crypto.subtle.digest('SHA-256', compressed)
    const revision = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
    if (revision !== manifest.sha256) throw new Error('Coverage index checksum mismatch')
    const decoded = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
    return CoverageIndexSchema.parse({ ...decoded, revision })
  }

  let pending: ReturnType<typeof load> | undefined
  return async (signal: AbortSignal) => {
    signal.throwIfAborted()
    pending ??= load().catch(error => {
      pending = undefined
      throw error
    })
    const index = await pending
    signal.throwIfAborted()
    return index
  }
}
