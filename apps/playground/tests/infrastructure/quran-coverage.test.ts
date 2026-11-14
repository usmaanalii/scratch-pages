import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { createBundledCoverageIndex } from '../../../../supabase/functions/quran/bundled-coverage'
import { createBundledMufradatReader } from '../../../../supabase/functions/quran/bundled-mufradat'
import { createCoverageLookup } from '../../../../supabase/functions/quran/coverage'
import { createQuranHandler } from '../../../../supabase/functions/quran/handler'

it('packages the private index, integrity manifest and verbatim Corpus and Tanzil notices', async () => {
  const output = await mkdtemp(join(tmpdir(), 'quran-coverage-bundle-'))
  try {
    execFileSync('node', ['scripts/quran-data/coverage-index.mjs', output])
    const [config, notice, index, manifest] = await Promise.all([
      readFile('../../supabase/config.toml', 'utf8'),
      readFile(join(output, 'NOTICE.txt'), 'utf8'),
      readFile(join(output, 'index.json.gz')),
      readFile(join(output, 'manifest.json'), 'utf8'),
    ])
    const archive = execFileSync('unzip', ['-p', 'data/quran/source/quranic-corpus-morphology-0.4.zip'], { maxBuffer: 10_000_000 })
    const headerEnd = archive.indexOf('LOCATION\tFORM\tTAG\tFEATURES')
    expect(notice).toBe(archive.subarray(0, headerEnd).toString('utf8'))
    expect(JSON.parse(manifest)).toEqual({ sha256: createHash('sha256').update(index).digest('hex') })
    for (const file of ['index.json.gz', 'manifest.json', 'NOTICE.txt']) {
      expect(config).toContain(`"./functions/quran/coverage-data/${file}"`)
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 20_000)

it('reproduces the display aggregate from the pinned importers', async () => {
  const output = await mkdtemp(join(tmpdir(), 'quran-coverage-'))
  try {
    const display = join(output, 'coverage.json')
    execFileSync('python3', ['scripts/quran-data/coverage-summary.py', display])
    expect(await readFile(display, 'utf8')).toBe(
      await readFile('src/prototypes/quran/quran-coverage-counts.json', 'utf8'),
    )
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 60_000)

it('loads the private pinned Corpus lookup with the original spelling and ordered analyses', async () => {
  const output = await mkdtemp(join(tmpdir(), 'quran-lookup-'))
  try {
    execFileSync('node', ['scripts/quran-data/coverage-index.mjs', output])
    const read = createBundledCoverageIndex(readFile, pathToFileURL(`${output}/`))
    const index = await read(new AbortController().signal)
    expect(index.roots['رحم']).toBeGreaterThan(0)
    expect(index.words['فَإِمَّا']).toBeUndefined()
    expect(index.words['فإما']).toEqual(expect.arrayContaining([
      expect.objectContaining({ chapter: 8, verse: 57, position: 1, spelling: 'فَإِمَّا', analyses: [
        expect.objectContaining({ segment: 2, root: null, lemma: 'إِن' }),
        expect.objectContaining({ segment: 3, root: null, lemma: 'مَا' }),
      ] }),
    ]))
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 20_000)

it('serves metadata from the pinned corpus and dictionary while isolating a failed source', async () => {
  const output = await mkdtemp(join(tmpdir(), 'quran-lookup-contract-'))
  try {
    const mufradatPath = join(output, 'mufradat')
    execFileSync('node', ['scripts/quran-data/coverage-index.mjs', output])
    execFileSync('python3', ['scripts/mufradat-data/import.py', '--expanded', '--output', mufradatPath])
    const mufradat = createBundledMufradatReader(readFile, pathToFileURL(`${mufradatPath}/`))
    const lookupCoverage = createCoverageLookup(createBundledCoverageIndex(readFile, pathToFileURL(`${output}/`)), {
      lane: async () => { throw new Error('Read failed') },
      mufradat: mufradat.loadCoverageIndex,
    })
    const origin = 'https://usmaanalii.github.io'
    const handle = createQuranHandler({ clientId: '', clientSecret: '', environment: '', origins: [origin], lookupCoverage })
    const request = async (mode: string, query: string) => {
      const params = new URLSearchParams({ mode, query })
      return handle(new Request(`https://example.test/functions/v1/quran/v2/coverage/lookup?${params}`, { headers: { Origin: origin } }))
    }
    const root = await request('root', 'اله')
    expect(await root.json()).toEqual({
      mode: 'root', root: 'اله', total: expect.any(Number),
      lane: { status: 'temporarily_unavailable' }, mufradat: { status: 'missing' },
    })
    const word = await request('word', 'ٱللَّهِ')
    const result = await word.json()
    expect(result.occurrences[0]).toEqual({
      chapter: 1, verse: 1, position: 2, spelling: 'ٱللَّهِ',
      analyses: [{ segment: 1, root: 'اله', lemma: 'ٱللَّه', lane: { status: 'temporarily_unavailable' },
        mufradat: { status: 'indexed', count: 1, basis: 'lemma' } }],
    })
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 20_000)
