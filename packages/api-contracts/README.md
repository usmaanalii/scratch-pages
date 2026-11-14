# API contracts

`@scratch-pages/api-contracts` owns browser-safe Zod 4 schemas and inferred TypeScript types for the Supabase HTTP APIs. Both frontends and the edge handlers consume it. It contains no provider models, database access, secrets, runtime configuration, or server initialization. Source TypeScript is consumed directly; no build or code generation step is required.

Install from the repository root with `pnpm install`. Import only the relevant subpath:

```ts
import { HelloResponseSchema, type HelloResponse } from '@scratch-pages/api-contracts/hello'
import { ChaptersResponseSchema, VersesRequestSchema, VersesResponseSchema } from '@scratch-pages/api-contracts/quran'
import { ApiErrorSchema } from '@scratch-pages/api-contracts/error'
```

## Contracts

`SearchRequestSchema` and `SearchResponseSchema` define an application-owned
search interface. A request carries a non-empty query, Arabic or English mode,
and a nullable opaque page token. A ready response carries attributed text
results, a nullable next-page token and complete, limited or unknown coverage.
An unavailable response is distinct from an empty result. Result strings are
rendered as text. The reader calls the Quran function's `/v2/search` route when
configured. That route currently returns results from chapters 1–2 with
Content API text and translation attribution. The page token is the next
provider page number, encoded as a string.

Quran verses may additionally contain `words: QuranWord[]`. Each word has
`chapter`, `verse`, `position` (positive provider position), `arabic`, and nullable
`meaning` and `transliteration`. The occurrence key is `chapter:verse:position`.
Only selectable words are included; end markers are excluded. Consumers may
ignore this additive field. Invalid optional word enrichment is discarded while
the base verse remains validated; the reader also checks occurrence chapter and
verse against the requested reading context. Provider models remain backend-only.

- `hello`: GET `/functions/v1/hello` returns `{ ok: true, message: string }`.
- `quran`: GET `/functions/v1/quran/v2/chapters` returns `{ chapters: Chapter[] }`. Chapter fields are `id`, `name`, `arabic`, `meaning`, `verses`, and `place` (`Meccan` or `Medinan`).
- `quran`: GET `/functions/v1/quran/v2/verses?chapter=1&page=1` returns `{ verses: [{ number, arabic, translationHtml }], translationName, nextPage }`. Chapter is 1–114; page is 1–15 and defaults to 1. A page contains 1–20 verses. `nextPage` is the next sequential page or null.
- `error`: application errors with JSON bodies use `{ error: string }` and the HTTP status. CORS rejection and preflight have empty bodies; platform-generated errors are outside this schema.
- `quran`: GET `/functions/v1/quran/v2/dictionary?root=سمو&lemma=ٱسْم` returns `{ entries: [{ id, entry }] }`. At least one exact root (1–16 characters) or lemma (1–80 characters) is required. Unknown/duplicate query parameters are rejected.

`LaneRequestSchema` and `LaneResponseSchema` own the dictionary contract.
A lookup returns at most 12 distinct entries. A successful `entry` contains its
ID, headword, source root/file, pinned XML URL and structured form/text/sense
blocks with inert text runs, language and emphasis. `entry: null` means a matched
entry temporarily failed to load; other entries remain usable. An empty array
means there is no reviewed match. Transport/index failures use the existing error
schema and status codes. Response IDs must be unique and agree with their entries.
The browser renders strings as text and uses only validated HTTPS source links.
The mapping/index representation remains private to the backend.
Deploy and verify this new backend route before publishing its frontend consumer.

`LanePageRequestSchema` and `LanePageResponseSchema` own the additive
`GET /functions/v1/quran/v2/dictionary/entries` contract.
It returns at most `LANE_PAGE_SIZE` (12) entries, the complete ordered `entryIds`,
a catalogue `revision`, and nullable `nextCursor`.
Continue with the same exact root/lemma and the returned cursor.
The backend rejects invalid, mismatched or stale cursors with 400.
Clients fetch every page and keep successful entries retryable when continuation fails.
The original dictionary route remains compatible with existing browser builds.

`translationHtml` is explicitly untrusted provider markup. Playground extracts inert text and removes script, style, and footnote nodes; never insert this field directly into HTML. Attribution and translation selection belong to the backend. Component display models may differ from wire DTOs.

Quran v2 verses may include selectable `words`. Each word carries its chapter,
verse and position, Arabic, nullable meaning and transliteration. Optional
`grammar` is `available` with ordered display segments, `unavailable` for an
unmatched occurrence, or `temporarily_unavailable` for enrichment failures.
Display segments expose kind, Arabic, part of speech, nullable root/lemma and
readable features. Source identifiers and raw corpus features stay backend-only.
Malformed grammar falls back inside the word boundary so meanings survive.
Older v2 responses without grammar remain valid. `VERSES_PER_PAGE` owns the
20-verse page size used by the contract, handler and browser pagination.

Verses can also include an optional `availability` object on each word, with
`corpus`, `lane`, and `mufradat` statuses. Older responses remain valid.
Malformed availability is discarded at the word boundary, preserving grammar
and meaning. See the [status definitions](../../supabase/functions/quran/README.md#word-source-availability-46).

Ordinary Zod objects accept and strip unknown response fields so additive server changes remain compatible. Do not use strict response objects. Removing fields, changing types, requiring new inputs, and expanding exhaustively handled enums require compatibility planning. Keep the legacy Quran routes available until their consumers have migrated; package versions alone do not protect existing browser builds.

Mufradāt uses `MufradatRequestSchema` with the same bounded exact root/lemma
query contract as Lane. `GET /functions/v1/quran/v2/mufradat` returns a
`MufradatResponseSchema`: `matched` with one original Arabic entry, `missing`, or
`ambiguous` with candidate IDs. No candidate is silently selected.
Entry data includes an ID, Arabic headword, full paragraphs, the original raw span,
actual page markers and a pinned source link with line numbers.
Backend read/validation failures use the existing safe JSON error with HTTP 503.
The route is an additive local implementation; deploy it before publishing its client.

`@scratch-pages/api-contracts/dictionary-lookups` derives distinct exact
root/lemma lookups from verified stems. The browser uses these lookups to request
articles, and the Quran function uses them to report index coverage.

`MufradatCompleteResponseSchema` owns the additive
`GET /functions/v1/quran/v2/mufradat/entries` response.
It accepts all original response shapes and adds `multiple` with distinct verified
`entries`. Multiple source-backed results remain readable without selecting a
contextual sense. The inspected catalogue currently has at most two entries per
lookup, so it requires no pagination. The legacy route retains its original
matched/missing/ambiguous contract.

## Verification and deployment

From the repository root:

```sh
pnpm test:all
pnpm typecheck:all
pnpm lint
pnpm --filter edge-functions test:coverage
pnpm --filter edge-functions check:deno # Deno 2.9.6
```

Handler tests validate real HTTP responses with MSW upstream fixtures. Frontend tests validate network responses, cancellation, and inert translation text. Deno checks exercise the actual entry-point import graphs with frozen per-function lockfiles. These checks do not prove hosted credentials or deployment bundling.

Node consumers resolve the workspace package via pnpm. Edge handlers use explicit relative `.ts` imports into this package, with `zod` mapped to the same pinned npm version in each function's `deno.json`. Deploy from the complete repository root with the Supabase CLI so the local import graph is bundled; uploading only `index.ts` and `handler.ts` is insufficient.

Quran v2 was deployed as function version 5 on 2026-10-30, with hello version 3. Live HTTP checks verified the shared-schema deployment, chapters, verse pages, attribution, legacy routes, and request restrictions. The corresponding frontend is published separately through Pages after this change is pushed. See [function release instructions](../../supabase/functions/quran/README.md). No new frontend environment variables are required.
