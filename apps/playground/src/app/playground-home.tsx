import './home.css'

const basePath = import.meta.env.BASE_URL
const destinations = [
  { path: 'quran/', title: 'Quran reader', description: 'Explore chapters and read verses in a calm, phone-first layout.' },
  { path: 'quran-word-availability/', title: 'Quran word availability', description: 'See which sources have data for each word in sample verses.' },
  { path: 'quran-data-coverage/', title: 'Qur’an data coverage', description: 'Compare corpus, dictionary and provider coverage.' },
  { path: 'supabase/', title: 'Supabase API demo', description: 'Send a request to a public Edge Function and inspect its response.' },
] as const

export function PlaygroundHome() {
  return (
    <main className="playground-shell grid min-h-dvh content-start bg-ui-background px-6 py-12 font-ui-body text-ui-foreground sm:content-center">
      <div className="mx-auto w-full max-w-[40rem]">
        <p className="m-0 mb-3 text-xs font-bold tracking-widest text-ui-muted">PERSONAL TOOLS</p>
        <h1 className="m-0 font-ui-heading text-4xl leading-tight font-bold sm:text-5xl">Playground</h1>
        <p className="mt-4 mb-6 max-w-[32rem] text-base leading-relaxed text-ui-muted">A small collection of ideas and experiments. Choose a page to explore.</p>
        <nav className="grid gap-4" aria-label="Playground pages">
          {destinations.map(destination => <a key={destination.path} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-ui-card border border-solid border-ui-border bg-ui-surface p-6 text-ui-foreground no-underline shadow-ui-card transition-colors hover:border-ui-primary hover:bg-ui-background focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ui-focus" href={`${basePath}${destination.path}`}>
            <span className="min-w-0"><strong className="block text-base font-semibold">{destination.title}</strong><small className="mt-2 block text-sm leading-relaxed text-ui-muted">{destination.description}</small></span>
            <span className="text-xl text-ui-primary" aria-hidden="true">→</span>
          </a>)}
        </nav>
      </div>
    </main>
  )
}
