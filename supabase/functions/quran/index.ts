import { createQuranHandler } from './handler.ts'
import { createBundledMorphologyReader } from './bundled-morphology.ts'
import { createBundledLaneReader } from './bundled-lane.ts'
import { createBundledMufradatReader } from './bundled-mufradat.ts'
import { createBundledCoverageIndex } from './bundled-coverage.ts'
import { createCoverageLookup } from './coverage.ts'

const lane = createBundledLaneReader(Deno.readFile)
const mufradat = createBundledMufradatReader(Deno.readFile)

const handler = createQuranHandler({
  clientId: Deno.env.get('QF_CLIENT_ID') ?? '',
  clientSecret: Deno.env.get('QF_CLIENT_SECRET') ?? '',
  environment: Deno.env.get('QF_ENV') ?? 'prelive',
  origins: (Deno.env.get('QF_ALLOWED_ORIGINS') ?? 'https://usmaanalii.github.io').split(',').map(origin => origin.trim()).filter(Boolean),
  readMorphology: createBundledMorphologyReader(Deno.readFile),
  lane,
  mufradat,
  lookupCoverage: createCoverageLookup(createBundledCoverageIndex(Deno.readFile), {
    lane: lane.loadCoverageIndex,
    mufradat: mufradat.loadCoverageIndex,
  }),
})

Deno.serve(handler)
