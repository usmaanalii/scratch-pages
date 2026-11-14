import { Button } from '@scratch-pages/ui'
import type { Ref, RefObject } from 'react'
import type { Ayah, Chapter } from './quran-api'
import { Icon } from './reader-icon'
import { VerseWords } from './verse-words'
import type { RetryGrammar } from './use-reader'

type VerseViewProps = {
  readonly verse: Ayah
  readonly chapter: Pick<Chapter, 'id' | 'name'>
  readonly active: boolean
  readonly saved: boolean
  readonly onBookmark: () => void
  readonly bookmarkRef?: Ref<HTMLButtonElement>
  readonly verseRef?: Ref<HTMLElement>
  readonly onActivate: () => void
  readonly readingFocusRef: RefObject<HTMLElement | null>
  readonly onRetryGrammar: RetryGrammar
  readonly layout?: 'stacked' | 'parallel'
}

export function VerseView({ verse, chapter, active, saved, onBookmark, bookmarkRef, verseRef, onActivate, readingFocusRef, onRetryGrammar, layout = 'stacked' }: VerseViewProps) {
  const parallel = layout === 'parallel'
  return <article ref={verseRef} tabIndex={-1} className={`verse rounded-ui-control border-0 border-b border-solid border-ui-border p-3 transition-colors duration-(--theme-motion-fast) ${active ? 'bg-ui-background' : ''} ${parallel ? 'md:grid md:grid-cols-2 md:items-start md:gap-x-8' : ''}`}>
    <div className={`verse-toolbar flex flex-wrap items-center justify-between gap-2 ${parallel ? 'md:col-span-2' : ''}`}>
      <span className="font-ui-body text-sm font-semibold text-ui-muted"><span aria-hidden="true">۞ </span>{chapter.id}:{verse.number}</span>
      <div className="flex gap-2">
        <Button variant="ghost" size="icon" aria-label="Audio coming soon" disabled><Icon name="play" size={16}/></Button>
        <Button ref={bookmarkRef} variant="ghost" size="icon" aria-label={`Bookmark verse ${verse.number}`} aria-pressed={saved} onClick={event => { event.stopPropagation(); onBookmark(); onActivate() }}><Icon name="bookmark" size={16}/></Button>
        <Button variant="ghost" size="icon" aria-label="More verse actions" onClick={event => { event.stopPropagation(); onActivate() }}><Icon name="more" size={17}/></Button>
      </div>
    </div>
    <VerseWords verse={verse} chapterName={chapter.name} readingFocusRef={readingFocusRef} onRetryGrammar={onRetryGrammar} className={parallel ? 'md:col-start-2 md:row-start-2' : ''}/>
    <p className={`translation m-0 font-ui-body text-base leading-[1.7] text-ui-muted wrap-anywhere ${parallel ? 'md:col-start-1 md:row-start-2' : ''}`}>{verse.translation}</p>
  </article>
}
