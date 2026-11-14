import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@scratch-pages/ui'
import './styles.css'
import { VerseView } from './verse-view'
import { ChapterList } from './chapter-list'
import { BookmarkList, ChapterBrowser, ChapterSearch, type ChapterView } from './chapter-browser'
import { ReaderLayout } from './reader-layout'
import { ReadingPanel } from './reading-panel'
import { Icon } from './reader-icon'
import type { Chapter } from './quran-api'
import { useChapters, useReader } from './use-reader'
import { ReaderLoading, VerseSkeleton } from './reader-loading'
import { WordAvailabilityLegend } from './word-availability'
import { SearchPanel } from './search-panel'
import { searchService } from './search-service'

const destinations = [
  { id: 'read', label: 'Read' },
  { id: 'search', label: 'Search' },
  { id: 'chapters', label: 'Chapters' },
  { id: 'bookmarks', label: 'Bookmarks' },
] as const

export default function App() {
  const { state, retry } = useChapters()
  if (state.status === 'loading') return <ReaderLoading/>
  if (state.status === 'error') return <ReaderLoading failure={{ message: state.message, onRetry: retry }}/>
  return <Reader chapters={state.chapters}/>
}

function Reader({ chapters }: { chapters: [Chapter, ...Chapter[]] }) {
  const searchToggle = useRef<HTMLButtonElement>(null)
  const readingHeading = useRef<HTMLHeadingElement>(null)
  const browsingHeading = useRef<HTMLHeadingElement>(null)
  const searchHeading = useRef<HTMLHeadingElement>(null)
  const { reading, bookmarks, actions } = useReader(chapters)
  const { selected, chapter, previousChapter, nextChapter, page, current, verses, key, activeVerse } = reading
  const { bookmarked, savedChapters, savedVerses, isVerseSaved } = bookmarks
  const { openChapter, openSavedVerse, toggleSavedVerse, toggleChapterBookmark, activateVerse, previousPage, nextPage, retryVerses, retryGrammar } = actions
  const [query, setQuery] = useState('')
  const [referenceError, setReferenceError] = useState('')
  const [navigationError, setNavigationError] = useState('')
  const [highlightedVerse, setHighlightedVerse] = useState<number | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [view, setView] = useState<'read' | 'search' | ChapterView>('read')
  const viewChanged = useRef(false)
  const readingPosition = useRef(0)
  const searchPosition = useRef(0)
  const searchFocus = useRef<HTMLElement | null>(null)
  const searchContainer = useRef<HTMLDivElement>(null)
  const savedVerseJump = useRef<number | null>(null)
  const savedVerseButton = useRef<HTMLButtonElement>(null)
  const searchVerse = useRef<HTMLElement>(null)
  const pendingSearchVerse = useRef<number | null>(null)
  const visibleChapters = chapters.filter(item => `${item.name} ${item.meaning} ${item.id}`.toLowerCase().includes(query.toLowerCase()))
  const changeView = (destination: typeof view) => {
    if (destination === view) return
    if (view === 'read') {
      readingPosition.current = window.scrollY
      pendingSearchVerse.current = null
      setHighlightedVerse(null)
    }
    if (view === 'search') {
      searchPosition.current = window.scrollY
      const focused = document.activeElement
      searchFocus.current = focused instanceof HTMLElement && searchContainer.current?.contains(focused) ? focused : null
    }
    viewChanged.current = true
    setView(destination)
  }
  useLayoutEffect(() => {
    if (!viewChanged.current) return
    viewChanged.current = false
    const heading = view === 'read' ? readingHeading.current : view === 'search' ? searchHeading.current : browsingHeading.current
    const position = view === 'read' ? readingPosition.current : view === 'search' ? searchPosition.current : 0
    if (view === 'search' && searchFocus.current?.isConnected) searchFocus.current.focus({ preventScroll: true })
    else if (position === 0) heading?.focus({ preventScroll: true })
    if (document.scrollingElement) document.scrollingElement.scrollTop = position
    if (view === 'read' && position > 0) {
      const top = document.querySelector('nav[aria-label="Reader controls"]')?.getBoundingClientRect().bottom ?? 0
      const verse = Array.from(document.querySelectorAll<HTMLElement>('.verse-list article'))
        .find(item => item.getBoundingClientRect().bottom > top)
      verse?.focus({ preventScroll: true })
    }
  }, [view])
  useLayoutEffect(() => {
    const button = savedVerseButton.current
    if (view !== 'read' || current.status !== 'ready' || savedVerseJump.current === null) return
    savedVerseJump.current = null
    button?.focus({ preventScroll: true })
    button?.scrollIntoView({ block: 'center' })
  }, [view, current])
  useLayoutEffect(() => {
    if (view !== 'read' || current.status !== 'ready' || pendingSearchVerse.current === null) return
    pendingSearchVerse.current = null
    if (!searchVerse.current) {
      setHighlightedVerse(null)
      setNavigationError('The requested verse is unavailable.')
      return
    }
    searchVerse.current?.focus({ preventScroll: true })
    searchVerse.current.scrollIntoView({ block: 'start' })
    const timer = window.setTimeout(() => setHighlightedVerse(null), 2000)
    return () => {
      window.clearTimeout(timer)
      setHighlightedVerse(null)
    }
  }, [view, current])
  const selectChapter = (id: number) => {
    savedVerseJump.current = null
    pendingSearchVerse.current = null
    setNavigationError('')
    readingPosition.current = 0
    openChapter(id)
    changeView('read')
  }
  const focusReading = () => {
    savedVerseJump.current = null
    pendingSearchVerse.current = null
    setHighlightedVerse(null)
    setNavigationError('')
    readingHeading.current?.focus({ preventScroll: true })
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0
  }
  const navigateToVerse = (chapterId: number, verseNumber: number) => {
    setNavigationError('')
    if (chapterId < 1 || chapterId > 114 || verseNumber < 1 || verseNumber > 286) {
      setReferenceError('Enter a valid chapter and verse reference.')
      return
    }
    const target = chapters.find(item => item.id === chapterId)
    if (!target) {
      setReferenceError('This chapter is unavailable in the current content.')
      return
    }
    if (verseNumber > target.verses) {
      setReferenceError('Enter a valid chapter and verse reference.')
      return
    }
    setReferenceError('')
    pendingSearchVerse.current = verseNumber
    setHighlightedVerse(verseNumber)
    readingPosition.current = 0
    openChapter(chapterId, verseNumber)
    changeView('read')
  }

  return <ReaderLayout
    navigation={<nav aria-label="Reader controls" className="reader-navigation border-0 border-b border-solid border-ui-border bg-ui-surface">
      {destinations.map(destination => <Button key={destination.id} variant="ghost" size="compact" className="min-w-0 wrap-anywhere transition-none"
        aria-pressed={view === destination.id} onClick={() => changeView(destination.id)}>{destination.label}</Button>)}
    </nav>}>
        <div ref={searchContainer} hidden={view !== 'search'}><SearchPanel service={searchService} headingRef={searchHeading} referenceError={referenceError} onEdit={() => setReferenceError('')} onSelect={navigateToVerse} onReference={navigateToVerse}/></div>
        {(view === 'chapters' || view === 'bookmarks') && <ChapterBrowser total={view === 'chapters' ? chapters.length : bookmarks.count} tab={view} headingRef={browsingHeading}
            search={view === 'chapters' && <>
              <Button ref={searchToggle} variant="outline" aria-expanded={searchOpen} onClick={() => { if (searchOpen) setQuery(''); setSearchOpen(!searchOpen) }}>Search chapters</Button>
              {searchOpen && <ChapterSearch query={query} onQueryChange={setQuery} onClose={() => { setSearchOpen(false); setQuery(''); searchToggle.current?.focus() }}/>}
            </>}
          >
            {view === 'chapters'
            ? <ChapterList chapters={visibleChapters} selectedId={selected} onSelect={selectChapter}/>
              : <BookmarkList chapters={chapters} savedChapters={savedChapters} savedVerses={savedVerses} onOpenChapter={selectChapter}
                  onOpenVerse={(chapterId, verseNumber) => { pendingSearchVerse.current = null; setNavigationError(''); readingPosition.current = 0; savedVerseJump.current = verseNumber; openSavedVerse(chapterId, verseNumber); changeView('read') }}/>
            }
          </ChapterBrowser>}
        {view === 'read' && <>
        {navigationError && <p role="alert">{navigationError}</p>}
        {current.status === 'loading' && <p role="status" className="sr-only">Loading verses…</p>}
        <ReadingPanel busy={current.status === 'loading'} header={<>
            <div className="min-w-0 wrap-anywhere">
              <h1 ref={readingHeading} tabIndex={-1} className="m-0 font-ui-heading text-xl font-semibold">{chapter.name}</h1>
              <p className="mt-1 mb-0 text-sm leading-relaxed text-ui-muted">{chapter.meaning} · {chapter.place} · {chapter.verses} verses</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Bookmark this chapter" aria-pressed={bookmarked} onClick={toggleChapterBookmark}><Icon name="bookmark"/></Button>
          </>} ornament={selected !== 1 && selected !== 9 && page === 1 && <p className="bismillah m-0" translate="no" lang="ar" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>}
          footer={<><div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-2 text-sm">
          <Button variant="outline" size="compact" disabled={page === 1} onClick={() => { previousPage(); focusReading() }}>Previous verses</Button>
          <span>Page {page}</span>
          <Button variant="outline" size="compact" disabled={current.status !== 'ready' || current.data.nextPage === null} onClick={() => { nextPage(); focusReading() }}>Next verses</Button>
        </div>
          <div className="grid grid-cols-2 items-center gap-2 border-0 border-t border-solid border-ui-border pt-2">
            <Button variant="ghost" className="min-w-0 flex-1 basis-40" disabled={!previousChapter} onClick={() => { if (previousChapter) { openChapter(previousChapter.id); focusReading() } }}><Icon name="back" size={17}/><span className="min-w-0 text-left wrap-anywhere"><span className="block text-xs whitespace-nowrap">PREVIOUS</span>{previousChapter?.name ?? 'Beginning'}</span></Button>
            <Button variant="ghost" className="min-w-0 flex-1 basis-40" disabled={!nextChapter} onClick={() => { if (nextChapter) { openChapter(nextChapter.id); focusReading() } }}><span className="min-w-0 text-right wrap-anywhere"><span className="block text-xs whitespace-nowrap">NEXT</span>{nextChapter?.name ?? 'End of Quran'}</span><Icon name="next" size={17}/></Button>
          </div></>}>
          {current.status === 'loading' && <VerseSkeleton/>}
          {current.status === 'error' && <div><p role="alert">{current.message}</p><Button onClick={retryVerses}>Retry verses</Button></div>}
          {verses.map(verse => <VerseView key={`${key}-${verse.number}`} verse={verse} chapter={chapter} active={activeVerse === verse.number || highlightedVerse === verse.number} saved={isVerseSaved(verse)}
            verseRef={highlightedVerse === verse.number ? searchVerse : undefined}
            bookmarkRef={activeVerse === verse.number ? savedVerseButton : undefined}
            onBookmark={() => toggleSavedVerse(verse)} onActivate={() => activateVerse(verse.number)} readingFocusRef={readingHeading} onRetryGrammar={retryGrammar}/>) }
          {current.status === 'ready' && <p className="my-2 px-3 text-sm leading-relaxed text-ui-muted">{current.data.translationName} · Quran Foundation</p>}
          {verses.some(verse => verse.words?.length) && <WordAvailabilityLegend/>}
        </ReadingPanel></>}
  </ReaderLayout>
}
