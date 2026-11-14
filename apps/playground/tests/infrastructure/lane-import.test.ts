import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { LaneEntrySchema } from '@scratch-pages/api-contracts/quran'
import { LaneIndexSchema, LaneCatalogueSchema } from '../../../../supabase/functions/quran/bundled-lane'

const importer = new URL('../../scripts/lane-data/import.py', import.meta.url).pathname

async function expandedEntry(output: string, id: string) {
  const catalogue = LaneCatalogueSchema.parse(JSON.parse(await readFile(join(output, 'catalogue.json'), 'utf8')))
  const path = catalogue.entryFiles[id]
  if (!path) throw new Error('Missing entry file')
  const entries = JSON.parse(gunzipSync(await readFile(join(output, path))).toString('utf8'))
  return LaneEntrySchema.parse(entries[id])
}

it('generates source-derived entries for the previously unsupported Quranic root نفق', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-expanded-'))
  try {
    execFileSync('python3', [importer, '--expanded', '--output', output])
    const index = LaneIndexSchema.parse(JSON.parse(await readFile(join(output, 'catalogue.json'), 'utf8')))
    expect(index.roots['نفق']).toEqual(['n44080', 'n44081', 'n44082', 'n44083', 'n44084', 'n44085', 'n44086'])
    const entry = await expandedEntry(output, 'n44080')
    expect(entry).toMatchObject({ id: 'n44080', root: 'نفق', file: 'un1.xml' })
    expect(entry.blocks.length).toBeGreaterThan(0)
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

it('uses indexed headwords to keep a colliding source ID under its correct root', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-collision-'))
  try {
    execFileSync('python3', [importer, '--expanded', '--output', output])
    const index = LaneIndexSchema.parse(JSON.parse(await readFile(join(output, 'catalogue.json'), 'utf8')))
    expect(index.roots['يسر']).toContain('n42477')
    expect(index.roots['قبس']).not.toContain('n42477')
    const entry = await expandedEntry(output, 'n42477')
    expect(entry).toMatchObject({ root: 'يسر', headword: 'مَيْسِرَةٌ', file: 'u_Y0.xml' })
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

it('imports the pinned Lane entry for name with its Arabic, senses and source references', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-import-'))
  try {
    execFileSync('python3', [importer, '--output', output])
    const index = LaneIndexSchema.parse(JSON.parse(await readFile(join(output, 'index.json'), 'utf8')))
    expect(index.lemmas['ٱسْم']).toEqual(['n20831'])
    const entry = LaneEntrySchema.parse(JSON.parse(await readFile(join(output, 'lane/n20831.json'), 'utf8')))
    expect(entry).toMatchObject({
      id: 'n20831', headword: 'اِسْمٌ', root: 'سمو', file: 'us0.xml',
      sourceUrl: 'https://github.com/alpheios-project/lan/blob/7dd04e1182c13a4b0883978867d2a3b04616542a/db/lexica/ara/lan/us0.xml',
      blocks: expect.arrayContaining([
        expect.objectContaining({ kind: 'form', runs: expect.arrayContaining([{ text: 'اِسْمٌ', lang: 'ar', emphasis: false }]) }),
        { kind: 'text', label: '', runs: [{ text: 'name', lang: null, emphasis: true }] },
        { kind: 'sense', label: '2', runs: [] },
        { kind: 'text', label: '', runs: [{ text: ', (S, M, Msb, K,) with the conjunctive ', lang: null, emphasis: false }] },
      ]),
    })
    const readingOrder = entry.blocks.filter(block =>
      block.kind === 'sense' ||
      (block.kind === 'form' && block.runs.some(run => run.text === 'اِسْمٌ')) ||
      block.runs.some(run => run.text === 'name'),
    ).map(({ kind, label }) => ({ kind, label }))
    expect(readingOrder).toEqual([
      { kind: 'form', label: '' }, { kind: 'text', label: '' }, { kind: 'sense', label: '2' },
    ])
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

it('reports full-source and verified Al-Baqarah coverage separately from the original mapping baseline', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-coverage-'))
  try {
    execFileSync('python3', [importer, '--expanded', '--output', output])
    const report: unknown = JSON.parse(await readFile(join(output, 'coverage.json'), 'utf8'))
    expect(report).toMatchObject({
      inventory: { words: 77429, roots: 1642, lemmas: 4817, rootlessStems: 27947, keylessStems: 3307 },
      baseline: { verified: { words: 5250, matchedWords: 287, roots: 516, mappedRoots: 3, lemmas: 929, mappedLemmas: 2 }, baqarah: { words: 5221, matchedWords: 279, roots: 515, lemmas: 926 } },
      wordAudit: { '2:3:8': { verified: true, association: 'source-associated' }, '112:3:1': { verified: false, association: expect.any(String) } },
      roots: { mapped: expect.arrayContaining(['نفق', 'كتب']), unresolved: expect.arrayContaining([expect.objectContaining({ key: 'وقي' })]) },
    })
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

it('includes exact source-headword matches for rootless Quranic lemmas', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-rootless-'))
  try {
    execFileSync('python3', [importer, '--expanded', '--output', output])
    const index = LaneIndexSchema.parse(JSON.parse(await readFile(join(output, 'catalogue.json'), 'utf8')))
    expect(index.lemmas['فِى']).toEqual(['n34892'])
    expect(index.lemmas['لَا']).toEqual(['n43185'])
    expect(index.lemmas['ٱسْم']).toEqual(['n20831'])
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

it('rejects a lemma mapping absent from the pinned source index', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lane-missing-id-'))
  try {
    const mappings = join(directory, 'mappings.json')
    await writeFile(mappings, JSON.stringify({ roots: {}, lemmas: { 'ٱسْم': ['n999999'] }, notes: {} }))
    expect(() => execFileSync('python3', [importer, '--mappings', mappings, '--output', join(directory, 'rejected')], { stdio: 'pipe' })).toThrow(/Mapping entry is absent from the pinned source index/)
    expect(await readdir(directory)).not.toContain('rejected')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('generates browser notices without publishing the backend dictionary assets', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-notices-'))
  try {
    execFileSync('python3', [importer, '--notices-only', '--output', output])
    expect(await readdir(output)).toEqual(['NOTICE.txt'])
    expect(await readFile(join(output, 'NOTICE.txt'), 'utf8')).toContain('Perseus Digital Library')
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

it('refuses browser notice generation when dictionary assets remain in its output directory', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-stale-browser-'))
  try {
    await writeFile(join(output, 'index.json'), 'backend index')
    expect(() => execFileSync('python3', [importer, '--notices-only', '--output', output], { stdio: 'pipe' })).toThrow(/Move dictionary assets out of the browser notices directory/)
    expect(await readFile(join(output, 'index.json'), 'utf8')).toBe('backend index')
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

it('rejects a mapping whose entry belongs to another source root before publishing assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lane-invalid-mapping-'))
  try {
    const mappings = join(directory, 'mappings.json')
    await writeFile(mappings, JSON.stringify({ roots: { سمو: ['n1123'] }, lemmas: {}, notes: {} }))
    expect(() => execFileSync('python3', [importer, '--mappings', mappings, '--output', join(directory, 'rejected')], { stdio: 'pipe' })).toThrow(/Mapping root does not match source root/)
    expect(await readdir(directory)).not.toContain('rejected')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('preserves page markers actually present in the selected source entries', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-pages-'))
  try {
    execFileSync('python3', [importer, '--output', output])
    const mercy = LaneEntrySchema.parse(JSON.parse(await readFile(join(output, 'lane/n15091.json'), 'utf8')))
    const praise = LaneEntrySchema.parse(JSON.parse(await readFile(join(output, 'lane/n9032.json'), 'utf8')))
    expect(JSON.stringify(mercy.blocks)).toContain('1057')
    expect(JSON.stringify(praise.blocks)).toContain('639')
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

it('reproduces identical assets from independent offline imports', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-repro-'))
  try {
    const first = join(output, 'first')
    const second = join(output, 'second')
    execFileSync('python3', [importer, '--output', first])
    execFileSync('python3', [importer, '--output', second])
    expect(await readFile(join(first, 'manifest.json'), 'utf8')).toBe(await readFile(join(second, 'manifest.json'), 'utf8'))
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

it('removes stale generated entries when rebuilding an output directory', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-rebuild-'))
  try {
    execFileSync('python3', [importer, '--output', output])
    const manifest = await readFile(join(output, 'manifest.json'), 'utf8')
    await writeFile(join(output, 'lane/n999999.json'), 'stale generated entry')
    execFileSync('python3', [importer, '--output', output])
    expect(await readdir(join(output, 'lane'))).not.toContain('n999999.json')
    expect(await readFile(join(output, 'manifest.json'), 'utf8')).toBe(manifest)
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

it('rejects a changed source archive before writing data', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-corrupt-source-'))
  try {
    const corrupt = join(output, 'corrupt.tar.gz')
    await writeFile(corrupt, 'changed source')
    expect(() => execFileSync('python3', [importer, '--source', corrupt, '--output', join(output, 'rejected')], { stdio: 'pipe' })).toThrow(/Source checksum mismatch/)
    expect(await readdir(output)).not.toContain('rejected')
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

it('keeps reviewed root matches distinct and records lemma exceptions and pinned attribution', async () => {
  const output = await mkdtemp(join(tmpdir(), 'lane-mappings-'))
  try {
    execFileSync('python3', [importer, '--output', output])
    const index = LaneIndexSchema.parse(JSON.parse(await readFile(join(output, 'index.json'), 'utf8')))
    expect(index.roots['رحم']).toEqual(['n15076', 'n15091', 'n15096'])
    expect(index.roots['حمد']).toEqual(['n9032', 'n9039'])
    expect(index.lemmas['ٱللَّه']).toEqual(['n1123'])
    expect(index.lemmas['ٱسْم']).not.toContain('n2572')
    expect(index.roots['بسم']).toBeUndefined()
    const manifest: unknown = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({ commit: '7dd04e1182c13a4b0883978867d2a3b04616542a', archiveSha256: '633b60ec3dbccb8c5214dcb0dcdfb5979f26610789093dc18c32780ce2bb6b05', licence: 'CC BY-SA 3.0 US' })
    expect(manifest).toMatchObject({ files: { 'lane/n1123.json': expect.stringMatching(/^[a-f0-9]{64}$/) } })
    expect(await readFile(join(output, 'NOTICE.txt'), 'utf8')).toContain('Perseus Digital Library')
    expect(await readFile(join(output, 'NOTICE.txt'), 'utf8')).toContain('http://creativecommons.org/licenses/by-sa/3.0/us/')
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
