# Quran content function

Read-only bridge between Playground and the current Quran Foundation Content API. It uses native fetch and the documented OAuth2 Client Credentials flow; no database, service-role client, or user login is needed. The official SDK 3.15.1 was evaluated: its token cache handles early renewal but its Content path lacks in-flight token coordination and a 401 retry. The two-route HTTP integration implements the documented lifecycle directly instead of adding SDK-specific workarounds.

## Configuration

Set these in Supabase Dashboard → Edge Functions → Secrets:

| Variable | Value |
| --- | --- |
| `QF_CLIENT_ID` | Backend/server client ID for the selected environment |
| `QF_CLIENT_SECRET` | Corresponding secret; never a browser variable |
| `QF_ENV` | `prelive` (default) or `production` |
| `QF_ALLOWED_ORIGINS` | Optional comma-separated origins; default `https://usmaanalii.github.io` |

Local template: `../.env.example`; copy to the gitignored `../.env`. Do not commit credentials, print them in logs, or paste them into chat. Store the one-time client secret in a password manager. Pre-live only contains chapters 1 and 2. Switch credentials and environment together after production permission is approved. Rotate a compromised secret in Quran Foundation, replace the Supabase secret, and redeploy to replace instances holding the old token.

## Production access

New Quran Foundation apps start in **pre-live**, a testing environment containing only Al-Fatihah (1) and Al-Baqarah (2). The full Quran requires approved production Content API access. This is the provider's access policy; it is not a restriction imposed by Supabase or this reader. The provider's [official quickstart](https://api-docs.quran.foundation/docs/quickstart/) documents the limitation but does not explain the reason for it. Our live checks confirmed that the configured pre-live credentials return exactly those two chapters.

To enable the complete Quran:

1. Open the existing Backend/server app in the [Quran Foundation Developer Console](https://api-docs.quran.foundation/request-access/) and request production `content` permission.
2. Once approved, save the matching production `QF_CLIENT_ID` and `QF_CLIENT_SECRET` directly in Supabase Edge Function secrets, and set `QF_ENV=production`. Never commit the credentials. The function selects the matching production OAuth and content hosts from this setting; changing the environment alone cannot upgrade pre-live credentials.
3. Redeploy the function to replace any instances using the previous configuration or token.
4. Verify the live chapter catalogue contains all 114 chapters, the selected production translation (131) is available, and verses outside chapters 1 and 2 load correctly. Run the deployment browser smoke against the actual website after publishing the corresponding frontend.

The current pre-live catalogue offers English translation 85 (M.A.S. Abdel Haleem), not 131. The function therefore selects 85 in pre-live and 131 in production, and the reader displays attribution from the returned resource. Production access and content have not yet been verified. Pushing the frontend to GitHub Pages does not grant production API access; while `QF_ENV=prelive`, the deployed prototype remains limited to two chapters.

## API contract

The entry point is `index.ts`, which imports `handler.ts`, the private `provider.ts` adapter, and schemas from `packages/api-contracts`. Deploy function `quran` to the existing `scratch-pages-hello-world` project from the complete repository root using the Supabase CLI; it must bundle all relative imports. Keep the function-specific `deno.json` and `deno.lock`. Uploading only the two former source files is insufficient. This is a deliberately public reading endpoint; `verify_jwt=false` allows visitors without user sessions. Do not reuse that setting for private data endpoints. The browser sends its public `apikey` header, but the handler does not treat this public value as authentication.

- `GET /functions/v1/quran/chapters`: chapter metadata, `language=en`.
- `GET /functions/v1/quran/verses?chapter=<1–114>&page=<1–15>`: one page of up to 20 verses, Uthmani text, translation 85 (M.A.S. Abdel Haleem) in pre-live or 131 (Dr. Mustafa Khattab, The Clear Quran) in production. Page defaults to 1.
- `OPTIONS`: CORS preflight for allowed browser origins.
- Unknown routes/parameters, duplicate parameters, and out-of-range inputs return 400; other methods return 405. Disallowed or absent Origin returns 403. Missing/invalid server configuration returns 503. Upstream failures return a generic 502, or 429 for upstream throttling.

Responses are `no-store`; chapter and verse content are not cached. Access tokens remain server-side, are reused within a warm function instance, and are re-requested 30 seconds before expiry. Concurrent token acquisition shares one promise. A content 401 invalidates that token and retries once; a repeated failure is surfaced safely. Environments have separate function configurations and token state.

## Security and operational limits

Fixed HTTPS upstream hosts and two allowlisted operations prevent arbitrary URL forwarding. Secrets/tokens stay in server memory and outbound auth headers; no upstream error bodies or auth headers are returned or logged. Requests reject redirects and each upstream fetch has an 8-second timeout. The frontend validates response shapes and renders translation content as inert text rather than injecting HTML.

CORS only controls which browser origins may read responses. It does not authenticate callers: non-browser callers can supply an allowed Origin. The aggregate budget of 60 valid requests per minute **per warm function instance** bounds local work, but is not a distributed rate limit and resets when an instance restarts. Shared token requests reduce duplicate authentication only inside one instance. This does not provide global denial-of-service or quota protection. Review project usage and upstream quotas before broader public rollout; add a distributed limiter if required by observed traffic or provider limits.

No tables or database privileges are introduced. If private bookmarks or progress are added later, they need separate user authorization and RLS policies.

## Owned v2 contract and migration

The new frontend calls `GET /functions/v1/quran/v2/chapters` and `GET /functions/v1/quran/v2/verses?chapter=<1–114>&page=<1–15>`. Page defaults to 1. See the [shared contract package](../../../packages/api-contracts/README.md) for exact schemas. Responses expose application-owned chapter/verse fields, translation attribution, and pagination. Provider field names and translation IDs remain in `provider.ts`. The explicit `translationHtml` field carries untrusted markup; the frontend extracts inert text.

Existing `/chapters` and `/verses` routes retain their previous upstream-shaped bodies for deployed clients. They are superseded by `/v2/chapters` and `/v2/verses` and must remain until older consumers have migrated. Both versions retain the same CORS, methods, request restrictions, token lifecycle, and shared per-instance budget. Malformed upstream v2 payloads and nonsequential pagination return a generic 502 without validation details.

Quran v2 was deployed as function version 5 on 2026-10-30 using the Supabase connector with the complete source/import graph, including function-specific Deno configuration and shared schemas. Live checks confirmed two pre-live chapters, Al-Fatihah verses 1–7, Al-Baqarah page 2 (21–40) and page 15 (281–286), translation attribution, unchanged legacy response formats, CORS, preflight, and invalid-input rejection. The frontend publishes separately through Pages after push. For future releases, deploy backend first:

1. Run the backend suite and `pnpm --filter edge-functions check:deno` with Deno 2.9.6, then the frontend checks.
2. With the CLI linked to the existing project, run `supabase functions deploy quran` from the repository root. Preserve the existing public-function configuration and server-only secrets.
3. Verify real v2 chapters, verse pages, attribution, invalid inputs, and CORS; verify the legacy routes still return their original shape. Check the deployed bundle contains the provider adapter and shared schemas.
4. Only after v2 is verified, approve the frontend commit/push to publish Pages. Run `test:smoke` against the deployed website after publication.

This release deployed the backend without changing credentials or upgrading provider access; the project remains in pre-live.

## Word data addition (#18)

Version 6, deployed 2026-11-01: v2 verse requests add `words=true`,
`word_fields=text_uthmani`, and `language=en` to the existing chapter operation.
Translation selection (85/131), authentication, token coordination, timeout,
retry, origin/request restrictions and legacy upstream requests are unchanged.

The provider adapter validates word text, type, position and annotations and
publishes optional application-owned words with chapter/verse/position identity,
Arabic, nullable English meaning and nullable transliteration. Records are
ordered by provider position. Duplicate/missing positions, invalid text and
unknown character types discard enrichment for that verse, preserving the whole
verse. End markers are excluded; absent annotations produce null. English glosses
are accepted only when their language is English. Source credit is Quran
Foundation word data, independent of full-verse translation attribution.

Backend fixtures in `../tests/quran/words.test.ts` cover request selectors,
mapping, invalid/missing enrichment and legacy compatibility. Frontend fixtures
prove display behaviour separately. Live HTTP checks on 2026-11-01 using current
credentials verified 29 words across all 7 Al-Fatihah verses, 230 words on
Al-Baqarah page 1, 370 on page 2 and 279 on page 15 (6 verses). Every sampled
verse had sequential occurrence positions, Arabic, English glosses and
transliteration. Translation 85, legacy responses, CORS/preflight, invalid input
and disallowed origins also passed. These samples do not establish full-Quran
coverage; the catalogue still contains only chapters 1 and 2 in pre-live.

For future releases, deploy the complete compatible backend first. Using the existing
credentials, check v2 Al-Fatihah page 1 and Al-Baqarah pages 1, 2 and 15 for real
words, positions, English glosses, transliteration, non-selectable end markers and
translation attribution. Verify legacy responses, CORS and invalid-input
rejection. If enrichment is absent, inspect the actual provider schema before
publishing the frontend; do not count whole-verse fallback as a word-data pass.
Then publish the approved frontend commit/push and verify the live reader. No credential
or environment change is required for this pre-live slice.

References: [Word fields](https://api-docs.quran.foundation/docs/api/field-reference/),
[Chapter operation](https://api-docs.quran.com/docs/content_apis_versioned/4.0.0/verses-by-chapter-number/),
[Native dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

## Grammar enrichment (#19, local implementation)

V2 verse pages automatically receive optional grammar outcomes beside word
meanings. `morphology.ts` matches chapter, verse, position and Arabic text against
the pinned corpus. Only NFC and presentation-tatweel removal are permitted.
Missing or mismatched occurrences return `unavailable`. Read, checksum, schema
and deadline failures return `temporarily_unavailable` while retaining verses
and meanings. Legacy routes are unchanged.

`bundled-morphology.ts` reads one gzip chapter per verse-page request. It checks
compressed and decoded hashes and sizes before source validation. Decoded data
is bounded to its manifest size, with a 3 MB maximum. No chapter cache, database,
Storage bucket or browser corpus is needed. Public segments omit source IDs,
forms and raw annotation tokens.

Enrichment has a provisional 200 ms added-work budget after verse mapping.
Cancellation reaches decompression. Timers cannot interrupt synchronous parsing,
so elapsed time is also checked before validation and after matching. A late
result falls back to temporary unavailability. This budget is not a hosted SLO.

Generate the complete local package from the repository root:

```sh
pnpm --filter playground quran:backend
```

The output is gitignored `supabase/functions/quran/data/`. Its manifest records
gzip hashes, decoded sizes, pinned provenance, reference identity and preview
status. `supabase/config.toml` includes the explicit nested gzip glob and notices
for bundling. Use `pnpm --filter playground quran:backend` for a release package.
That command refuses to write data while publication evidence is absent.
Preview packages must not be deployed. The raw Supabase CLI does not enforce
this project guard; always regenerate through the guarded release command.
Deploy with the Docker bundler. Do not use `--use-api`: its successful upload
does not include the static assets needed by this reader. Verify an available
grammar response after every deployment.

Publication evidence in `apps/playground/data/quran/publication.json` records
the published website/application-use grant reviewed on 2026-11-06. The original
source ZIP and notices are preserved. Package and deploy the backend first. Verify aligned and
unavailable occurrences, real latency, CORS and legacy responses before frontend
publication. A local Colima worker check does not replace those live checks.

## Lane dictionary (#20)

`GET /functions/v1/quran/v2/dictionary?root=سمو&lemma=ٱسْم` serves Lane entries
on demand through this existing function. The browser supplies verified grammar
stem annotations. The backend owns exact, reviewed root/lemma mappings and
exceptions; surface matching is not supported. The route does not contact Quran
Foundation or require provider credentials. It reuses CORS, read-only methods,
safe JSON errors, `no-store` responses and the per-isolate request budget.

`packages/api-contracts` owns the bounded request and structured response schemas.
`bundled-lane.ts` hides the mapping/index and file representations behind a single
lookup operation. It verifies file checksums before parsing and caches successful
reads within the function instance. A failed entry returns `entry: null` while
other matches remain distinct; index/read failures produce a safe 503 response.
No match returns an empty array. Existing chapters, verses and legacy routes
retain their contracts.

Generate both backend datasets before a release:

```sh
pnpm --filter playground quran:backend
pnpm --filter playground lane:data
```

The Lane command uses Python 3 and the pinned, unchanged archive offline.
It writes `lane-data/index.json`, `lane-data/lane/{entryId}.json`, a checksum
manifest and attribution notices. `supabase/config.toml` includes these files in
the existing function bundle. Use the Docker bundler, as for morphology; a
successful server-side upload does not establish static-file inclusion.
Backend-owned tests cover the HTTP contract, actual source matches, checksum
failure and caching. Deno entry-point checks cover imports and types. Playwright
calls the real local Deno route using bundled Lane files and fixture verse data.
These checks do not establish hosted Supabase bundling or physical-device use.

Initial coverage is eight entries through three root mappings and two lemma
exceptions. See [source, licence and coverage](../../../apps/playground/data/lane/README.md).
Deploy and verify name/Allah matches, multiple mercy entries, no-match and retry
outcomes, CORS and existing content before frontend publication.
The #20 route is available in function version 9, recorded below.

## Mufradāt (#21, local implementation)

`GET /functions/v1/quran/v2/mufradat?root=رحم` serves the inspected original
Arabic entry through this function’s existing public read-only API pattern.
It accepts exact root and/or lemma keys with Lane’s request bounds.
The route requires no Quran Foundation call or credentials.
It shares the existing CORS, methods, safe errors, timeout and per-instance budget.
Successful responses distinguish matched, missing and ambiguous data.
Source/index/entry read failures return a safe 503 and remain retryable.

`bundled-mufradat.ts` checks asset checksums and caches successfully validated data.
The source review, four-entry mapping set and CC BY-NC-SA 4.0 conditions are
documented in [Mufradāt sources](../../../apps/playground/data/mufradat/README.md).
Only original Arabic is distributed. No published English translation is included.

Before deployment, generate all three datasets:

```sh
pnpm --filter playground quran:backend
pnpm --filter playground lane:data
pnpm --filter playground mufradat:data
```

The last command uses Python 3 and pinned offline inputs.
`static_files` includes `mufradat-data/entries/*.json`, the index, manifest and notice.
Deploy the complete function with the Docker bundler.
Verify name/Allah exceptions, رحم and حمد, missing data, invalid input, CORS,
existing Lane/content routes and bundle inclusion before frontend publication.
Local Node/MSW and Deno/browser evidence does not prove hosted deployment.
Version 10 includes the four entries. Live checks compare each hosted entry with
the pinned import output before frontend publication.

## Dictionary expansion (#44)

The additive `/v2/dictionary/entries` route accepts exact `root`, `lemma` and optional `cursor` parameters.
It returns at most 12 structured entries, the complete ordered `entryIds`, the catalogue checksum as `revision`, and nullable `nextCursor`.
Send continuation cursors with the same lookup.
Invalid, mismatched or expired cursors return 400.
The legacy `/v2/dictionary` retains its original eight-entry mapping set and response contract.
The reader fetches every page and preserves successful entries when continuation fails.

Lane's expanded catalogue uses pinned XML root groups and exact indexed headwords.
It contains 18,889 entries in 591 deterministic gzip packs of at most 32 entries.
The Mufradāt catalogue combines the four original spans with 242 additional inspected spans.
The legacy Mufradāt matched/missing/ambiguous response is preserved.
The reader displays distinct successful stem matches separately and leaves uncertain associations ambiguous.
The additive `/v2/mufradat/entries` route also returns `multiple` with every verified entry when one lookup has several results.
The largest inspected Mufradāt group has two entries and needs no continuation.

Generate morphology, Lane and Mufradāt together with the commands above before every release.
Use the Docker bundler so `static_files` are included.
The selected morphology, Lane and Mufradāt assets total 13,075,513 bytes before function code and bundler overhead.
Offline dictionary occurrence reports are excluded from `static_files`.
Browser builds contain attribution notices and API client code; they contain no dictionary packs or entry files.

Each dictionary's `coverage.json` records the raw 114-chapter inventory, baseline and expanded associations, snapshot-verified denominators, unresolved keys and every word identity.
The overlap command in [Mufradāt sources](../../../apps/playground/data/mufradat/README.md#reproducible-import-and-delivery) verifies common input identity and hashes both reports.
The chapters 1–2 reference verifies 5,250 occurrences, including 5,221 in Al-Baqarah.
Expanded Lane associates 3,105 Al-Baqarah words; Mufradāt associates 1,258.
Both associate 1,099 of those words.
These associations identify source-related reading, without selecting contextual senses.
Unreviewed Mufradāt spans and production alignment beyond chapters 1–2 remain explicit gaps.

One local Deno measurement of كتب returned 22 Lane entries over two pages.
The first Lane page was 61,781 JSON bytes and took 43.5 ms cold and 0.4 ms warm.
The Mufradāt response was 21,571 bytes and took 3.6 ms cold and 0.3 ms warm.
These single-process measurements exclude gateway and network latency.
Version 11 was deployed with the Docker bundler before frontend publication.
The CLI reported a 12 MB script bundle.
Live HTTP checks compared all Lane entries for كتب, رزق, نفق and علم with the pinned local packs.
The same checks compared those four Mufradāt entries, both بعد entries and the original name/Allah entries with local imports.
The largest Lane group, روح, also returned all 56 entries across five hosted pages with exact local-source equality.
Rootless lookups, no-match, validation, methods, preflight/CORS and existing content/grammar checks passed.
The hosted catalogue still contains chapters 1–2 only.

## Lane match provenance (#45)

The complete `/v2/dictionary/entries` route adds optional per-result
`match: { kind: 'lemma' | 'root', key: string }` metadata to the shared contract.
Successful results identify the catalogue selection used to produce them.
Lemma mappings, including empty overrides, take precedence over roots.
Root matches identify source-group membership and do not select a contextual sense.
Unresolved associations return no entries. Failed entry reads retain `entry: null`
without a match claim. Every continuation retains the same lookup provenance.

The legacy route and responses without metadata remain compatible.
The reader treats missing provenance as unavailable and never reconstructs it from
provider fields, query parameters or Arabic spelling.
See [matching policy and reader states](../../../apps/playground/data/lane/README.md#match-provenance-45).

Before publishing the frontend, regenerate all three datasets and deploy the
complete function with the documented Docker bundler. Verify live name/Allah lemma
selections, root matches across كتب continuations, unresolved roots, legacy routes
and existing content/grammar. Then publish the frontend and run the narrow
unmocked deployment smoke. Keep fixture-backed browser evidence separate from
hosted verification and from full-Quran production access.

## Word source availability (#46)

`GET /functions/v1/quran/v2/verses` can include an `availability` object on each
selectable word alongside its existing `grammar` field. Clients can treat a
missing `availability` field as unknown, including on older responses.

| Source | Status | Meaning |
| --- | --- | --- |
| `corpus` | `lexical` | A verified stem has a root or lemma. |
| `corpus` | `grammar_only` | The occurrence has verified morphology without a keyed stem. |
| `corpus` | `missing` | The chapter was read and no usable analysis matched the occurrence. |
| All | `temporarily_unavailable` | The source read, validation or enrichment deadline failed. |
| `lane`, `mufradat` | `indexed` | One distinct article ID matched the verified stem keys. |
| `lane`, `mufradat` | `multiple` | More than one distinct article ID matched. The index leaves sense selection open. |
| `lane`, `mufradat` | `missing` | The verified analysis has no lookup keys, or the index contains no matching IDs. |
| `lane`, `mufradat` | `unknown` | Verified morphology or the index reader was unavailable for the lookup. |

Each stem uses an exact lemma mapping first, including an explicit empty
override. An absent lemma mapping falls back to the exact root. The function
counts distinct IDs across stems. An index hit can still lead to an article
read failure when the client opens the dictionary.

The function shares each checksum-verified index with its article endpoint
within the worker. The handler receives each bundled dictionary as a source
with its own index and article operations. Concurrent requests share an in-flight load with a 200 ms
deadline. The next request can retry a failed or timed-out load. Cancelling an
article request stops its wait and lets other requests continue using the same
load. Verses access only the bundled Lane catalogue and Mufradāt index and
their manifests. The loads run in parallel after grammar enrichment. A slow or
failed index leaves the other source, verses and grammar available.

In three local Deno HTTP runs, the Al-Baqarah first-page fixture had 230
selectable words and used the generated release assets. Fresh-process responses
took 52–53 ms at baseline and 76–78 ms with availability. The median of ten warm
responses per process was about 29 ms in both versions. The uncompressed JSON
grew from 89,849 to 107,025 bytes. Each updated process read the two indexes and
their manifests once, read zero article files and made the same number of
provider calls as the baseline. These measurements use the pinned provider
snapshot over loopback and exclude hosted gateway and provider latency.

After deployment, verify availability on Al-Fatihah and Al-Baqarah alongside
grammar and both article endpoints, and measure cold and warm hosted responses.

## Data coverage lookup (#68)

Use `GET /functions/v1/quran/v2/coverage/lookup?mode=word&query=…` or
`mode=root`. The API reads pinned local sources. It requires no Foundation
credentials. Word results include up to 25 positions per page, the total,
and a continuation tied to the comparison key and index revision. Each
position has the imported Arabic spelling, chapter, verse, word position,
and ordered stem analyses with root, lemma and a source variant where present.
Root results give the exact root and its distinct Corpus position count.
Each dictionary result gives its status and, when indexed, its count and
lemma or root match basis.

### Publication scope

The owner confirmed noncommercial Playground use on 2026-11-14. The published
Corpus terms permit attributed annotation use in a website or application.
Apply that grant to the bounded results displayed in Playground. Preserve
the original imported spelling in each result and apply normalisation to
comparison keys only. Keep the unchanged Corpus 0.4 archive and reproduce
its Corpus and embedded Tanzil Uthmani 1.0.2 notices. The generated index
and verbatim notices stay in the function bundle, and the site links to the
public source notices. This decision covers the integrated lookup. A
downloadable, corpus-wide index needs a separate decision.
[Corpus terms](https://corpus.quran.com/download/) ·
[Pinned Corpus and Tanzil notices](../../../apps/playground/data/quran/README.md#publication-status)

Lane and Mufradāt contribute status, match basis, and counts per source.
Keep the source credits and licence links with the results via the page's
source notices. The underlying Lane mapping adaptation is CC BY-SA 3.0 US.
The reviewed OpenITI Mufradāt mapping adaptation is CC BY-NC-SA 4.0. Each
source retains its own licence and the lookup returns no headwords, entry IDs,
or article bodies.
[Lane source and licence](../../../apps/playground/data/lane/README.md#attribution-and-licence) ·
[Mufradāt source and licence](../../../apps/playground/data/mufradat/README.md#licence-and-attribution)

Quran Foundation evidence on the page is limited to documented chapter
availability and historical aggregate join counts. The lookup index uses
the Corpus archive alone. Each query reports Foundation coverage as
unmeasured. The site and lookup response carry no Foundation snapshot payload.
[Quran Foundation developer terms](https://api-docs.quran.foundation/legal/developer-terms/)

### Release checks

Generate the existing morphology and both dictionary bundles. Generate the
coverage asset from the workspace root:

```sh
pnpm --filter playground exec node scripts/quran-data/coverage-index.mjs ../../supabase/functions/quran/coverage-data
```

The Docker bundler selects the coverage index, checksum manifest and verbatim
notice via `static_files`. Run the local function and verify word form, exact
root and a continuation against those generated assets. After approved
deployment, repeat the lookup checks on the hosted function before publishing
the Pages route. Confirm the route URL after Pages deployment and add it to
Quick access.

## Deployed history

Version 13 of the `quran` function was deployed on 2026-11-13 for #46 from
[`352d41b`](https://github.com/usmaanalii/personal-tools/commit/352d41b288dcb1a77af50b3a8f021c5db89ee57a).
Hosted verse responses included availability for Corpus, Lane and Mufradāt on
all 259 words checked in Al-Fatihah and Al-Baqarah page 1. Live checks also
verified occurrence grammar and both dictionary entries endpoints.

When deploying an isolated revision with the Docker bundler, stage it in a
directory shared with Docker. During the version 13 release, Colima could not
see the function entry point under `/private/tmp`. Bundling succeeded from a
staging directory inside the checkout.

Version 12 of the `quran` function was deployed on 2026-11-13 for #45.
The Docker release included regenerated morphology and both dictionaries. Live
checks verified the ٱسْم and ٱللَّه lemma selections, all 22 كتب root-related
entries across two pages, an unresolved root, the legacy Lane response,
Mufradāt, chapter and verse content, occurrence morphology, and CORS.

Previous deployment: function `quran` version 11, released on 2026-11-07 for #44.
It adds complete dictionary browsing with regenerated morphology and both lexicons.
Twenty-nine unmocked HTTP checks and one preflight passed before frontend publication.
Provider credentials, pre-live access and public JWT configuration remain unchanged.
Frontend publication follows through the Pages workflow.

Previous deployment: function `quran` version 10, released on 2026-11-07 for #21
with the Docker bundler and regenerated morphology, Lane and Mufradāt assets.
The four hosted Mufradāt entries match the pinned import output, including Arabic
wording, raw source ranges and page markers. Eleven live HTTP checks also cover
missing matches, invalid input, preflight/CORS, Lane, pre-live chapter content,
verse grammar and the legacy catalogue. The provider remains in pre-live.
Frontend publication follows through Pages.

Previous deployment: function `quran` version 9, released on 2026-11-06 from
[af358a5](https://github.com/usmaanalii/personal-tools/commit/af358a5626b42194769736ddaadc514b01928487)
with the Docker bundler and regenerated morphology/Lane assets. Eleven live HTTP
checks verified name/Allah matches, distinct mercy entries, no match, v2 chapters,
available grammar and meaning, legacy chapters, validation, CORS, methods and
preflight. Provider credentials and pre-live access were unchanged. Frontend
publication follows separately through Pages.

Previous deployment: function `quran` version 8, released on 2026-11-06 with
bundled grammar and unchanged credentials/access environment. Live HTTP checks
confirmed all 29 Al-Fatihah analyses and available/unavailable outcomes on
Al-Baqarah pages 1, 2, 13 and 15. Meanings, legacy responses and CORS checks
passed. The account still provides only the two pre-live chapters.
The complete 114-chapter corpus is bundled, but this is not live full-Quran
alignment evidence. Frontend publication uses the separate Pages workflow.

Version 7 used server-side bundling and returned temporary grammar failures
because its static assets were absent. Version 8 supersedes that deployment.

Function `quran` version 4 was deployed on 2026-10-30 with credentials configured. Live HTTP checks confirmed 2 pre-live chapters, all 7 Al-Fatihah verses, Al-Baqarah page 2 (2:21–2:40), and its final page (2:281–2:286), including Arabic text and translation 85. The resource catalogue confirmed that pre-live provides English translation 85 rather than 131; a temporary diagnostic was removed in version 4. Desktop and mobile browser checks passed against the live services with the local production build mounted at the website origin. The Pages workflow publishes the frontend integration when these changes are pushed to `main`; this backend deployment does not publish the static website.

## Verification and release

From the repository root using Node 24:

```sh
pnpm test:functions
pnpm --filter edge-functions test:coverage
pnpm --filter playground test
pnpm --filter playground typecheck
pnpm --filter playground build
pnpm --filter playground test:e2e
pnpm lint
```

The backend-owned tests in `../tests/quran/handler.test.ts` exercise this handler through its Request/Response interface with MSW upstream responses. Coverage measures the handler, not the Deno environment/server entry point. Production static-site/layout browser checks use fixture content; neither proves real provider credentials. The separate deployment smoke uses the deployed website and real service responses. After credentials are saved and the function deployed, separately verify live chapters and verses, preflight, invalid-input rejection, and generic error responses. Never print token responses or request auth headers. Verify the frontend build contains no QF credentials before publishing. Commit/push and GitHub Pages release require the repository owner's approval.

Official references: [Content quickstart](https://api-docs.quran.foundation/docs/quickstart/), [token lifecycle](https://api-docs.quran.foundation/docs/quickstart/token-management/), [Supabase secrets](https://supabase.com/docs/guides/functions/secrets), [public function authentication](https://supabase.com/docs/guides/functions/auth).
