import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { importCorpus } from './corpus.ts'
import { wordComparisonKey } from '../../../../supabase/functions/quran/coverage.ts'

const output = process.argv[2]
if (!output) throw new Error('Provide a private output directory for the coverage index.')
const source = fileURLToPath(new URL('../../data/quran/source/quranic-corpus-morphology-0.4.zip', import.meta.url))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
if (sha256(await readFile(source)) !== 'fda26f87cc58b42fc992a3ad666a562805b636f34bcecb46326d048337ca7999') {
  throw new Error('Corpus source checksum mismatch')
}
const text = execFileSync('unzip', ['-p', source], { maxBuffer: 10_000_000 }).toString('utf8')
const { chapters, notices } = importCorpus(text)
const words = Object.create(null)
const roots = Object.create(null)

for (const chapter of Object.values(chapters)) {
  for (const [identity, word] of Object.entries(chapter.words)) {
    const [, verse, position] = identity.split(':').map(Number)
    const analyses = word.segments.flatMap(segment => {
      if (segment.kind !== 'stem') return []
      const lemmaVariant = /(?:^|\|)LEM:[^|]*?(\d+)(?:\||$)/.exec(segment.rawFeatures)?.[1]
      return [{
        segment: Number(segment.id.split(':').at(-1)),
        root: segment.root,
        lemma: segment.lemma,
        ...(lemmaVariant ? { lemmaVariant } : {}),
      }]
    })
    const key = wordComparisonKey(word.arabic)
    words[key] ??= []
    words[key].push({ chapter: chapter.chapter, verse, position, spelling: word.arabic, analyses })
    for (const root of new Set(analyses.flatMap(analysis => analysis.root ? [analysis.root] : []))) {
      roots[root] = (roots[root] ?? 0) + 1
    }
  }
}

const compressed = gzipSync(JSON.stringify({ words, roots }))
await mkdir(output, { recursive: true })
await writeFile(join(output, 'index.json.gz'), compressed)
await writeFile(join(output, 'NOTICE.txt'), notices)
await writeFile(join(output, 'manifest.json'), `${JSON.stringify({ sha256: sha256(compressed) })}\n`)
