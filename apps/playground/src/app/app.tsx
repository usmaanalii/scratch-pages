import { lazy, Suspense } from 'react'
import { PlaygroundHome } from './playground-home'
import { RouteLoading } from './route-loading'
import { ReaderLoading } from '../prototypes/quran/reader-loading'

const QuranReader = lazy(() => import('../prototypes/quran/quran-reader'))
const WordAvailabilityPreview = lazy(() => import('../prototypes/quran/word-availability-preview'))
const QuranDataCoverage = lazy(() => import('../prototypes/quran/quran-data-coverage'))
const SupabaseDemo = lazy(() => import('../prototypes/supabase/supabase-demo'))
export default function App() {
  const route = window.location.pathname.split('/').filter(Boolean).at(-1)

  if (route === 'quran') {
    return (
      <Suspense fallback={<ReaderLoading message="Loading Quran reader…" />}>
        <QuranReader />
      </Suspense>
    )
  }
  if (route === 'quran-word-availability') {
    return (
      <Suspense fallback={<RouteLoading title="Quran word availability" message="Loading word availability…" />}>
        <WordAvailabilityPreview />
      </Suspense>
    )
  }
  if (route === 'quran-data-coverage') {
    return (
      <Suspense fallback={<RouteLoading title="Qur’an data coverage" message="Loading coverage…" />}>
        <QuranDataCoverage />
      </Suspense>
    )
  }
  if (route === 'supabase') {
    return (
      <Suspense fallback={<RouteLoading title="Supabase API demo" message="Loading Supabase demo…" />}>
        <SupabaseDemo />
      </Suspense>
    )
  }
  return <PlaygroundHome />
}
