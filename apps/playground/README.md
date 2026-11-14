# Playground

The Supabase connection page adopts the workspace's shared light tokens and owned Button. Its direct public Edge Function call, JSON response, local loading/error states and retry action remain app-owned. The shared guide is in [`docs/style-guide`](../../docs/style-guide/README.md). The Vite integration scans shared UI sources; `pnpm --filter playground build` verifies its production CSS. No private credentials belong in `VITE_*` variables.

A React and Vite app with separately addressable pages: the homepage (`/`), Quran reader (`/quran/`), and Supabase demo (`/supabase/`). The reader loads chapters and paginated Arabic verses with an English translation (M.A.S. Abdel Haleem in pre-live; The Clear Quran in production) through the Supabase `quran` Edge Function. Bookmarks last for the current session; audio and reading progress are not connected. The Pages workflow publishes frontend changes from `main`.

The homepage and lazy-route loading shells use shared typography, surfaces, focus and spacing. Navigation cards have larger text and use the default guide without Quran-specific decoration. Each loading shell names its destination, announces progress with a polite status and links back to the homepage. The route-specific loading text is unchanged. Ordinary presentation uses Tailwind in each component. `src/app/styles.css` generates utilities once for the app, excluding test and story sources; `home.css` retains only the conditional document baseline. Prototype layouts and content remain app-owned. No dependencies or configuration values were added for #27.

Storybook includes the homepage and both route-loading shells under Playground, plus the Quran reader's chapter-loading and failed-request shells. The chapter stories show isolated browsing states and search. Use the reader itself to review its destination navigation. These examples remain local until an approved push publishes the combined Pages artifact.

The Quran reader opens in **Read**. **Search** accepts chapter and verse references such as `1:3` and opens the verse in Read. The verse is focused and briefly highlighted. Arabic and English text search is unavailable until a search service is configured. **Chapters** contains chapter search, and **Bookmarks** lists saved chapters and verses. Navigation stays at the top on all screen sizes. Read uses the document scroll and keeps the chapter heading compact. Page and chapter controls, translation credits, the word-source legend and source links follow the verses.

All four views share the static `/quran/` entry point. Switching to Chapters or Bookmarks and back preserves the selected chapter, page and scroll position. Search retains its query, results and scroll position during the current visit. Selecting a chapter opens its first page. Selecting a saved verse opens its page and focuses the verse's bookmark control. The browser's Back and Forward buttons traverse page visits. A fresh load or refresh starts in Read at the first available chapter. Search and bookmarks belong to the current reader visit.

`use-reader.ts` owns chapter requests, selection, bookmarks, verse loading, retries and pagination. `quran-reader.tsx` owns the active destination, search and focus. Shared Skeleton placeholders respect reduced motion. The reader announces loading and offers retry actions for failed chapter and verse requests. Chapter choices use the available API catalogue. The [chapter browsing state inventory](src/prototypes/quran/chapter-browsing-journeys.md) records the earlier layout.

`pnpm --filter @scratch-pages/ui storybook` opens the shared catalogue, including Playground's twelve chapter examples (six states at mobile and desktop widths). Playground declares the same pinned Storybook renderer as a development dependency so its colocated stories are included in normal TypeScript checks; it adds no production dependency. The combined Pages workflow will publish these additions after an approved push.

## Development

Use Node 24 for Playground checks (the current jsdom/Undici test dependencies fail to load on Node 22.22.3). The separate Next.js app retains its own Node requirements. Install dependencies from the repository root with `pnpm install`.

```sh
pnpm --filter playground dev
pnpm --filter playground test
pnpm --filter playground typecheck
pnpm --filter playground build:preview
pnpm --filter playground test:e2e
```

For both the Quran reader and Supabase demo, copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are public browser configuration; never use a secret or service-role key. Vitest uses `.env.test` and MSW responses.

Grammar in #19 uses the recorded published website/application-use grant.
`build` and the Pages build enforce its publication record.
`build:preview` is for local verification. Both builds create frontend assets and source notices.
Grammar and dictionary data are packaged separately for the backend. See the source
[provenance and publication record](data/quran/README.md).

Lane imports require Python 3. Browser checks also require Deno 2.9.6, already used by the backend checks.
Playwright starts the actual local Quran function on port 8000 with empty provider credentials and restricted permissions.
It builds the frontend against that local URL; verse/provider responses remain fixtures and dictionary requests use the real local route.

## Quran API setup

The browser calls `/functions/v1/quran/v2/chapters` and `/functions/v1/quran/v2/verses?chapter=1&page=1` on `VITE_SUPABASE_URL`. Each verse page contains at most 20 verses. Previous/Next verses navigate pages; opening a saved verse restores its page. Chapter search uses the chapter list returned by the API.

The reader shows three circles under each selectable Arabic word. Their order is always Corpus, Lane and Mufradāt from left to right. A filled circle indicates Corpus analysis (including grammar-only analysis) or one or more indexed dictionary matches. A hollow circle can mean a missing match, unknown coverage or a temporary source failure. When the verse response omits availability, the circles are hollow and the word’s accessible description says availability was not reported. Otherwise, the description gives the status for each source.

The indicators use the optional [word source availability](../../supabase/functions/quran/README.md#word-source-availability-46) that comes with the verse page. An indexed match indicates possible content. The word dialog uses the existing grammar payload and requests dictionary articles when their tabs are opened.

The **Quran word availability** Playground page (`/quran-word-availability/`) shows one filled or hollow circle per source on captured Arabic verses. It runs offline using v13 verses responses. See the [design decision and verification](src/prototypes/quran/word-availability-review.md) for the sample provenance and how the prototype maps availability.

Create a Backend/server app in the [Quran Foundation Developer Console](https://api-docs.quran.foundation/request-access/). Save `QF_CLIENT_ID`, `QF_CLIENT_SECRET`, and `QF_ENV=prelive` directly in Supabase Edge Function secrets. Never expose these through Vite or GitHub Pages configuration. Testing access includes only Al-Fatihah and Al-Baqarah; complete Quran content requires production approval and production credentials. This is Quran Foundation’s access policy, not a Supabase or reader limitation. See [Production access](../../supabase/functions/quran/README.md#production-access) for the approval and environment-switch steps.

The function is deployed and verified against real pre-live content. Desktop and mobile browser checks also passed against the live function. The Pages workflow publishes the frontend integration from `main`. Deploy future function updates from the complete repository root with the Supabase CLI, separately from the static website, so shared-contract imports are bundled. This frontend requires `/quran/v2/`; that backend was deployed as version 5 and verified against real pre-live content on 2026-10-30 before frontend publication. For local function development, copy `supabase/functions/.env.example` to the gitignored `.env`, populate the credentials, and configure the frontend public Supabase values for your local project. Explicitly configure `QF_ALLOWED_ORIGINS` for local browser origins; the hosted default only permits `https://usmaanalii.github.io`.

See the [Quran function README](../../supabase/functions/quran/README.md) for the API contract, security controls, limitations, and deployment verification. Without configuration or during upstream failures, the reader shows a retryable error; it never substitutes sample verses. The translation is rendered as plain text with attribution; formatting and footnote markers are removed. Quranic text opts out of browser translation. Audio controls are disabled until playback is implemented, and the chapter shortcut does not claim saved reading progress.

## Word meanings (#18)

When the backend supplies validated word data, tap an Arabic word (or activate it
with Enter/Space) to highlight it and open its English gloss, available
transliteration and verse reference. The owned shared Dialog fills the available mobile
viewport and stays centred on desktop. A compact word summary remains above
Grammar and Dictionary tabs. The active panel owns the main scrolling area;
long meanings, analysis and source credits scroll inside it. Previous/next stays within the verse;
Close/Escape restores focus to the last selected word. Changing the chapter or
verse page closes the details. Verse-end markers remain non-interactive.

Words come with the verse page, so opening details needs no extra request.
Occurrence identities use chapter, verse and provider position. Missing or
invalid word records retain whole-verse Arabic; missing annotations have explicit
unavailable labels. Word text is rendered inertly. The English word data is
credited to Quran Foundation separately from the selected whole-verse translator;
no authorship by that translator is implied. Grammar and dictionary behaviour are documented separately below.
See the [journey/state inventory](src/prototypes/quran/word-meaning-journeys.md).

No new environment variables or backend dependencies are required. The dialog
migration adds the exact `@radix-ui/react-dialog` 1.1.23 runtime dependency to
`@scratch-pages/ui`; see the [#26 verification record](src/prototypes/quran/word-dialog-verification.md)
for compatibility, bundle impact and revert details. Backend version 6 was
deployed on 2026-11-01 with the existing server-side credentials. Live checks
verified all 7 Al-Fatihah verses and Al-Baqarah pages 1, 2 and 15, including word
positions, English glosses, transliteration, translation attribution, legacy
responses and CORS. Pages publishes the frontend through the approved push;
the deployment smoke checks real word details after publication. An older
backend remains usable but supplies whole-verse reading only. Full-Quran
coverage still needs production access. See the [backend rollout checklist](../../supabase/functions/quran/README.md#word-data-addition-18).

### Word-details ownership (#23)

The Quran modules remain app-local. `use-word-selection.ts` owns selected
position and verse-bounded navigation; `word-content.tsx` renders the existing
word fields independently from fixture data; `word-dialog.tsx` owns Quran modal
lifecycle and names it through the shared Dialog title. `packages/ui/src/dialog.tsx`
contains the Radix imports and owns the shared accessible primitive wrappers and
Tailwind-styled surface. `verse-words.tsx` composes them and owns occurrence button
refs and highlighting. It supplies a target lookup to `word-dialog.tsx`, which
owns focus return and the deferred fallback to the reader's chapter heading.
Callers provide DOM targets without coordinating focus timing. Reader's chapter/page/retry keys
discard stale selection along with the old verses.

Close/Escape returns focus to the latest connected occurrence. When context
invalidation removes the details, focus stays on a surviving focused control;
if focus was lost, the word dialog focuses the current chapter heading, which is outside
the normal Tab order. The fallback runs after old DOM targets have been removed.
The shared primitive traps modal focus and handles Escape; the feature prevents
outside dismissal and returns focus to the most recently selected connected word.
The app composes Tailwind utilities on a single dialog primitive for its centered
desktop surface and full-screen mobile layout, using safe-area padding and
shared theme tokens. Shared Radix Tabs wrappers provide keyboard navigation.
Arrow keys move between tabs; Enter or Space selects the focused tab. Grammar
is selected on opening. Moving between words preserves the active tab;
closing and reopening starts with Grammar.

See the [#23 verification record](src/prototypes/quran/word-selection-verification.md)
for checks and evidence limits. The existing Pages workflow publishes the
frontend after an approved push; this refactor adds no deployment steps.

## Word grammar (#19)

Open a word's meaning to read **Grammar** immediately. Grammar arrives with the
existing verse page from Supabase. Selecting Grammar makes no request. Each component shows its prefix, stem or suffix role, part of speech,
available root and lemma, and readable corpus features. Components without a
root have an explicit source-based label. Some words contain multiple stems.
Roots are morphological annotations, not claims about historical etymology or
the intended contextual meaning.

Meanings stay visible when grammar is unavailable. Temporary failures offer
**Retry grammar**, which re-requests the current verse page in place. Loading
keeps keyboard focus on Retry. Successful recovery returns focus to the grammar
analysis if Retry still has focus. Leaving the panel or occurrence cancels a pending retry.
Recovered grammar stays with the current
verse page, so closing the dialog or moving between words preserves it. Recovery
updates only the matching occurrence's grammar and leaves its meaning intact.
The Reader owns the retry request and checks the Word occurrence before
updating the active page. The grammar panel owns cancellation, loading feedback
and focus.
Missing, mismatched or withheld analyses
show **Analysis unavailable**. Older responses without grammar remain readable.

The importer uses the unchanged Quranic Arabic Corpus v0.4 ZIP. It preserves both
original notices in every generated chapter and in `quran-data/NOTICE.txt`.
One **Sources** section below the reader links to the corpus, Tanzil and those
notices. Word grammar panels do not repeat these links. Supabase
reads compressed bundled chapters, verifies checksums and matches exact word
occurrences. A provisional 200 ms budget limits added enrichment work after
verse mapping. It preserves verses and meanings on failure. Synchronous parsing
cannot be pre-empted by a timer; elapsed time is also checked after parsing.
This is not a hosted response-time guarantee. No database or new environment
variable is required. Deploy the compatible backend before publishing the UI.

Generate the data offline with Node 24 and `unzip`:

```sh
pnpm --filter playground quran:data --notices-only
pnpm --filter playground quran:data --output /tmp/quran-data
pnpm --filter playground quran:backend
```

`dev` and `build:preview` generate only notices for the browser. Keep full
offline imports outside `public/`. If `public/quran-data/` contains an older
full import, move that directory outside the app before building. The notices
step refuses stale corpus files so Vite cannot copy them into the website.
Backend packaging writes gzip files
under `supabase/functions/quran/data/`. The normal `quran:backend` command blocks
if publication evidence is absent. The checked-in record cites the published
website/application-use grant and its attribution and notice conditions.
Use `--preview` only for local packages. Both packages use the pinned ZIP and
saved Foundation snapshot without fetching upstream data. Generated files are
ignored by Git. Backend `manifest.json` records source versions, checksums,
decoded sizes and preview status. `coverage.json` records
corpus coverage, aligned references and all missing, mismatched or ambiguous
occurrence keys. See [the input contract and known differences](data/quran/README.md).

The source contains 77,429 words and 128,219 segments across 114 chapters. The
saved 2026-11-05 snapshot covers 6,145 Foundation occurrences in chapters 1 and 2.
Of these, 5,250 match and 895 differ. None are missing or ambiguous in that
snapshot. These are measured import results, not full-Quran alignment evidence.
On the backend every lookup also checks the current Foundation occurrence and
Arabic text. Only NFC normalization and removal of presentation tatweel are
allowed. Diacritic, pause-mark and spelling differences remain unavailable;
there are no fuzzy matches or automatic mapping exceptions.

Importer and validation tests use real v0.4 examples. Reader integration tests
cover tab selection, retry, unavailable/rootless data and rapid selection through
MSW. Backend tests own compressed-file validation and occurrence matching.
Browser dialog checks verify tab keyboard navigation, native focus, axe and
narrow-width fit. Deployment smoke follows the notices link under
`/personal-tools/`. These fixture-backed
browser checks do not prove live full-Quran connectivity or physical-device
screen-reader behaviour.

## Linting

Run `pnpm lint` from the repository root for shared Biome recommended lint rules across all apps. `pnpm lint:fix` applies safe fixes without formatting. Existing CSS cascade and user-triggered search autofocus exceptions have inline explanations.

## Tests

UI test descriptions use the visible interaction and outcome: **shows** for displayed results, **opens** for navigation, and **marks** for pressed bookmark states.

Vitest with React Testing Library in jsdom covers component routing, greetings, request errors, chapter search and navigation, bookmark state, pagination, loading recovery, and safe translation text. Backend API-contract tests belong to the independent `edge-functions` workspace under `supabase/functions/tests/`; run `pnpm test:functions` from the repository root. They exercise real handlers against mocked upstream token/content endpoints, including token reuse, expiry, bounded retry, input restrictions, request budgets, and timeouts. These checks do not verify hosted credentials. The UI suite does not prove browser layout or deployed routing.

Search tests use fixture results to exercise loading, pagination, errors and result navigation. The configured service returns an unavailable state and does not publish fixture results. Direct references use the existing Content API. The pre-live catalogue limits which chapters can be opened.

Keep detailed page behavior in Vitest with real application components and HTTP-level MSW responses. Add Playwright coverage only for a distinct served-app or browser risk.

`test:e2e` builds preview assets and serves only those static files at `http://127.0.0.1:5173/personal-tools/`, without an SPA fallback. Playwright owns the server and refuses to reuse that port. Desktop and mobile Chromium checks cover:

- `tests/prototypes/quran/reader.e2e.ts` checks homepage keyboard entry, axe, overflow, reader refresh, and Back and Forward across the static pages.
- `tests/prototypes/quran/loading-layout.e2e.ts` checks reduced motion and the position of the verse region as scripture loads.
- `tests/prototypes/quran/mobile-reading-space.e2e.ts` checks visible scripture at 320×568, document scrolling, scroll restoration at narrow and desktop widths, saved-verse focus and the start of the next word's analysis. Physical software keyboard and safe-area behaviour require device testing.
- `tests/prototypes/quran/dictionary-browser.e2e.ts`: scrolling an entry returned by the actual local Deno dictionary while the selected word and verse context remain visible, then returning focus on close. Query mapping and source URL details are covered by Vitest.
- `tests/prototypes/supabase/demo.e2e.ts`: direct loading, refresh, navigation back to the homepage and keyboard entry through its second destination.

The suite includes navigation journeys and focused browser checks for loading layout and word dialogs. Detailed feature behavior belongs in Vitest; `quran-words.test.tsx` covers real page composition, word content, Arabic language metadata and attribution with HTTP fixtures. Content assertions share that integration surface rather than repeating them in an isolated word-content suite. `quran-reader.test.tsx` also checks cancellation of a pending verse request when another chapter is opened. The word journeys close the dialog before navigating to another chapter or verse page. `word-dialog-browser.e2e.ts` verifies browser focus containment, Escape, accessible naming/axe, focus return and stable dialog bounds across grammar retries. Its long-content case checks viewport fit and keeps sources, word context and navigation in view after scrolling, then uses the word controls and closes the dialog in landscape. `reader-presentation.e2e.ts` checks selected-button hover contrast on desktop. Typography and precise positioning are reviewed visually. The shared word factory validates fixtures with the production schema; fixtures reject unsupported chapter/page requests, and pagination uses Al-Baqarah rather than inventing a second page for seven-verse Al-Fatihah.

The static-server fallback/404 contract runs once in Vitest's Node infrastructure project, not in a browser matrix. Word-data mapping and failure recovery are covered independently in backend-owned tests. Vitest/jsdom verifies real composition and word behavior; it does not prove browser focus containment or rendered geometry. The focused browser checks use fixture content and do not prove live backend connectivity, physical safe areas or browser zoom. See the historical [#23 verification record](src/prototypes/quran/word-selection-verification.md) and [#26 dialog record](src/prototypes/quran/word-dialog-verification.md) for their original evidence and limits.

`pnpm build:pages && pnpm test:pages` verifies catalogue navigation and refresh, then each static page's direct loading and refresh in the combined publication artifact. It samples catalogue navigation without enumerating every visual variant. Vitest verifies each real lazy route's loading heading, status, home destination and replacement by tool content. Browser checks cover keyboard navigation, responsive fit and static route loading under `/personal-tools/`; they do not prove live backend connectivity or screen-reader announcements.

Tests follow the same ownership as source code:

```text
src/app/app.test.tsx                         # shared homepage/routing
src/prototypes/quran/*.test.tsx              # reader page integration
src/prototypes/supabase/*.test.tsx           # demo page integration
tests/prototypes/quran/                      # reader E2E, deployment smoke and content fixture
tests/prototypes/supabase/                   # demo E2E and deployment smoke
tests/infrastructure/                       # static server, launcher and HTTP integration check
../../supabase/functions/tests/             # backend-owned API contracts
```

Quran content is supplied at the HTTP boundary solely to make these static-site/layout checks independent of hosted services. They prove production assets, the deployment prefix, navigation and layout; they do not prove the Edge Function or Quran Foundation connectivity. The build uses explicit test-only public configuration; it must not be published as the deployed build.

## Deployment smoke

Run against an existing deployed website, including its base prefix and trailing slash. The Quran smoke also opens a real word's English meaning and transliteration after refresh:

```sh
PLAYWRIGHT_BASE_URL=https://usmaanalii.github.io/personal-tools/ pnpm --filter playground test:smoke
```

The `*-deployment.e2e.ts` files alongside each prototype’s E2E tests open the actual deployed Quran reader, confirm content and translation load after refresh, and call the greeting function through the Supabase demo. They run on desktop and mobile Chromium without replacing HTML, assets or backend responses. They do not build or deploy anything, and do not repeat detailed pagination/bookmark behavior. Loopback HTTP URLs are accepted for testing an already-served production build configured against real services. The Playwright workflow accepts the same root URL through its optional manual `deployment_url` input.

## Deployment

The Pages workflow uses Node 24 for Playground tests and builds. GitHub Actions builds and deploys this app together with the shared UI Storybook in one GitHub Pages artifact. From the repository root, use `pnpm build:pages` followed by `pnpm test:pages` to verify that complete artifact; `pnpm build` remains the standalone Playground build. See [Storybook publishing and recovery](../../packages/ui/README.md#publishing-and-verification). The default base is `/personal-tools/`; use `VITE_BASE_PATH=/` for hosting at a domain root. Each route has an HTML entry point configured in `vite.config.ts`.

See the [root README](../../README.md) for live links, repository variables, and GitHub Pages setup.


## API contracts

Public schemas and inferred types live in [`@scratch-pages/api-contracts`](../../packages/api-contracts/README.md). The hello and Quran fetch adapters validate successful responses using those schemas. Quran consumes application-owned v2 data and backend attribution; it retains only display-specific conversion of untrusted translation HTML into inert text. No additional environment variables or generation step are needed.

The v2 backend was deployed and verified on 2026-10-30; frontend publication follows the approved push through Pages. Existing legacy backend routes remain available for older browser builds. Backend rollout must precede this frontend release; see the [migration instructions](../../supabase/functions/quran/README.md#owned-v2-contract-and-migration).

## Lane dictionary (#20)

Open word details and select the **Dictionary** tab. The browser sends available,
verified grammar stem roots/lemmas to the existing Supabase Quran function.
Matching and entry files remain backend-owned. No dictionary request is made
until that tab opens, and no additional Quran Foundation call is required.

Entries show their own headword. **Read full entry** expands long content inside
the active tab's scrolling area. The compact header retains the selected word
while reading on narrow and landscape screens. Entry IDs, filenames, pinned XML
links, dictionary notes and licence credits follow the entries. English word
attribution also follows the active panel's reading content. Required Corpus
and Tanzil links remain in the page's Sources section.
Arabic, forms, sense divisions and available page markers remain distinct from
the contextual word gloss. Text is rendered inertly.

The #45 reader labels backend-selected entries **Lemma match** or **Related to root**,
with the Arabic lookup key beside each original headword. A lemma match selects a
headword; root-related entries can discuss other words and senses. Neither selects
the meaning in this verse. Responses without provenance show **Match basis unavailable**.
No verified dictionary match and unavailable morphology have separate announcements.
Request and individual entry
failures offer **Retry dictionary** while keeping meaning and successful entries
visible. Leaving the tab or changing word/grammar discards pending results.
Successful responses remain cached while the verse is mounted, including closing
and reopening the dialog. Changing the chapter/page clears that local cache.

The #44 import expands the original eight-entry baseline to source-derived root
groups and exact rootless lemmas. The reader follows bounded continuation pages
to display every result, including groups larger than 12. This remains incomplete
dictionary coverage. See [sources, mappings,
licence, import commands and journey states](data/lane/README.md).

No new frontend environment variables are required. Generate backend files with
`pnpm --filter playground lane:data`, then deploy and verify the complete Quran
function before publishing this frontend. Backend version 9 was deployed and verified
on 2026-11-06 from `af358a5`; the Pages workflow publishes the frontend separately.
Backend version 12 adds the #45 provenance field to the expanded dictionary route.
Live API checks verified lemma and root matches before frontend publication.

### Original Arabic Mufradāt (#21)

The Mufradāt tab loads al-Rāghib’s original Arabic explanation for reviewed
root/lemma matches through the existing Supabase Quran function.
Entries expand inside the word sheet while its selected-word context stays visible.
Missing matches, ambiguous mappings and retryable failures have separate states.
Meaning, grammar and Lane remain independently usable.

The #44 mapping set contains 246 inspected entries, 238 root keys and eight
lemma keys, preserving all four original entries. It uses OpenITI’s cleaned `JK001150-ara1` version with exact
source ranges, page markers, checksum and attribution.
The Arabic data and mapping adaptation use CC BY-NC-SA 4.0, including its
non-commercial and ShareAlike conditions. No English translation is included.
See [edition comparison, review limits, imports and coverage](data/mufradat/README.md).

Run `pnpm --filter playground mufradat:data` before bundling the Quran function.
Frontend development/builds generate attribution notices only.
The API delivery supersedes #21’s original static entry-asset proposal.
It uses existing browser configuration and works independently of the Pages prefix.
Backend version 10 includes the four entries. Publish the frontend through Pages
after verifying the backend, then run the deployment smoke against the published site.
Expanded backend version 11 is deployed and verified for #44.
The Pages workflow publishes the #44 reader after the approved push.

## Default-guide adoption (#28)

Home, route-loading shells, the connection demo and the Quran interface use the shared default guide. Verse toolbar and word-dialog actions use the owned Button, including its 44px action size and focus treatment. Latin translations use the shared 16px body font. Quran text retains Noto Naskh Arabic, shaping and its existing line layout. `VerseView` owns app-local verse presentation. The reading module owns chapter requests, bookmarks and pagination; the word-dialog module owns focus restoration.

Storybook shows that same verse view stacked and with a parallel translation on wider canvases. The examples share data and actions; they introduce no production layout switcher. The catalogue also demonstrates an optional semantic theme without changing the production default. These #28 changes need an approved push before publication. There are no new environment variables or dependencies.

See the [maintained adoption inventory](../../docs/style-guide/adoption.md) for surface/state evidence, justified native content choices and remaining accessibility limits. After `pnpm build:pages`, run `pnpm test:pages` for combined-artifact routing and `pnpm test:catalogue` for browser-only component presentation. The latter checks responsive composition, portal font inheritance, target size and semantic control colours without duplicating feature journeys. Keep Pages checks serial with `test:e2e` because those two use the same local server port and Playground build output.
