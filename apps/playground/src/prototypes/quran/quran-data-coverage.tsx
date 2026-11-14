import '../../app/home.css'
import counts from './quran-coverage-counts.json'
import { QuranCoverageLookup } from './quran-coverage-lookup'

const dictionaryCoverage = [
  { label: 'All Corpus positions', ...counts.dictionary.all },
  { label: 'Positions with a root or lemma', ...counts.dictionary.keyed },
  { label: 'Distinct Corpus roots', ...counts.dictionary.roots },
  { label: 'Historical strict joins, chapters 1–2', ...counts.dictionary.historical },
] as const

const sourceCoverage = [
  { label: 'Corpus chapters', scope: 'Corpus 0.4', count: counts.corpus.chapters, total: 114 },
  { label: 'Corpus word positions', scope: 'Corpus 0.4 morphology inventory', count: counts.corpus.words, total: counts.corpus.words },
  { label: 'Positions with a root', scope: 'Corpus 0.4', count: counts.corpus.withRoot, total: counts.corpus.words },
  { label: 'Positions with a lemma', scope: 'Corpus 0.4', count: counts.corpus.withLemma, total: counts.corpus.words },
  { label: 'Historical strict joins', scope: 'Corpus × Quran Foundation, 5 November 2026, chapters 1–2', count: counts.historical.matched, total: counts.historical.reference },
  { label: 'Documented pre-live chapters', scope: 'Quran Foundation Content API', count: 2, total: 114 },
  { label: 'Documented production core chapters', scope: 'Quran Foundation Content Sync', count: 114, total: 114 },
  { label: 'Current production account coverage', scope: 'Quran Foundation', count: null },
] as const

const numbers = new Intl.NumberFormat('en', { useGrouping: true })
const percentages = new Intl.NumberFormat('en', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function coverageCount(count: number, total: number) {
  return `${numbers.format(count)} of ${numbers.format(total)} (${percentages.format(count / total)})`
}

export default function QuranDataCoverage() {
  return (
    <main className="playground-shell mx-auto min-h-dvh max-w-[52rem] px-4 py-8 font-ui-body text-ui-foreground sm:px-8">
      <a className="inline-flex min-h-11 items-center text-ui-primary focus-visible:outline-3 focus-visible:outline-ui-focus" href={import.meta.env.BASE_URL}>← All playground pages</a>
      <h1 className="mt-4 font-ui-heading text-3xl font-bold">Qur’an data coverage</h1>
      <table className="mb-8 w-full table-fixed border-collapse text-sm sm:text-base">
        <caption className="mb-3 text-left font-ui-heading text-xl font-semibold">Source coverage</caption>
        <thead>
          <tr className="border-b border-ui-border text-left">
            <th scope="col" className="w-[58%] p-2">Measure and evidence</th>
            <th scope="col" className="p-2">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {sourceCoverage.map(row => (
            <tr key={row.label} className="border-b border-ui-border align-top">
              <th scope="row" className="p-2 text-left">
                {row.label}
                <span className="block font-normal text-ui-muted">{row.scope}</span>
              </th>
              <td className="p-2">{row.count === null ? 'Unknown' : coverageCount(row.count, row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full table-fixed border-collapse text-sm sm:text-base">
        <caption className="mb-3 text-left font-ui-heading text-xl font-semibold">Dictionary coverage</caption>
        <thead>
          <tr className="border-b border-ui-border text-left">
            <th scope="col" className="w-[34%] p-2">Population</th>
            <th scope="col" className="p-2">Lane</th>
            <th scope="col" className="break-words p-2">Mufradāt</th>
            <th scope="col" className="p-2">Either</th>
          </tr>
        </thead>
        <tbody>
          {dictionaryCoverage.map(({ label, total, lane, mufradat, either }) => (
            <tr key={label} className="border-b border-ui-border align-top">
              <th scope="row" className="p-2 text-left">{label}</th>
              <td className="p-2">{coverageCount(lane, total)}</td>
              <td className="p-2">{coverageCount(mufradat, total)}</td>
              <td className="p-2">{coverageCount(either, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-ui-muted">Dictionary coverage reflects indexed associations. Word positions can match through a lemma or root. Distinct roots use direct root indexes.</p>
      <ul className="space-y-2 pl-5 text-sm">
        <li><a href={`${import.meta.env.BASE_URL}quran-data/NOTICE.txt`}>Quranic Arabic Corpus 0.4 and Tanzil 1.0.2 notices</a></li>
        <li><a href={`${import.meta.env.BASE_URL}quran-lexicons/NOTICE.txt`}>Lane’s Lexicon source notice (revision 7dd04e1)</a></li>
        <li><a href={`${import.meta.env.BASE_URL}quran-mufradat/NOTICE.txt`}>Mufradāt source notice (OpenITI revision 6290621)</a></li>
        <li><a href="https://api-docs.quran.foundation/docs/tutorials/faq/">Quran Foundation Content API documentation</a></li>
      </ul>
      <QuranCoverageLookup />
    </main>
  )
}
