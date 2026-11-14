# Personal Tools

## Quick access

- [Playground index](https://usmaanalii.github.io/personal-tools/)
- [Quran reader](https://usmaanalii.github.io/personal-tools/quran/)
- [Quran word availability](https://usmaanalii.github.io/personal-tools/quran-word-availability/)
- [Qur’an data coverage](https://usmaanalii.github.io/personal-tools/quran-data-coverage/)
- [Supabase API demo](https://usmaanalii.github.io/personal-tools/supabase/)
- [Next.js connection lab](https://next-vercel-supabase-app.vercel.app)
- [Shared UI Storybook](https://usmaanalii.github.io/personal-tools/storybook/)

A small monorepo for personal web app experiments.

The Playground homepage, route-loading shells, Quran interface and two connection demos use the [shared light style guide](docs/style-guide/README.md) from `packages/design-tokens` and `packages/ui`. The [adoption inventory](docs/style-guide/adoption.md) records states, content exceptions and verification limits. The links above open the live sites. Local changes reach them only after an approved push and successful deployment. Production dark mode is planned for later; an alternate semantic mapping is demonstrated only in the local #28 catalogue additions.

## Playground

The playground is a small collection of tools and experiments. Start at the [index page](https://usmaanalii.github.io/personal-tools/) to choose one.

The Quran word availability prototype uses captured verses to show whether each of the three sources has data for a word. [Design decision and verification](apps/playground/src/prototypes/quran/word-availability-review.md)

### Quran reader

**Page:** [Open the Quran reader](https://usmaanalii.github.io/personal-tools/quran/)

A reading prototype designed for phones, with a wider layout on desktop.
The reader uses verse data to show source availability for Corpus, Lane and Mufradāt beneath selectable words. [Reader guide](apps/playground/README.md#quran-api-setup)

Issue #19 adds grammar analysis to word details through the existing verse API.
Release packaging records the published website/application-use grant and
preserves the original source notices. The release guard still rejects missing
permission evidence.
See [grammar sources and publication status](apps/playground/data/quran/README.md).

The #20 implementation adds on-demand Lane dictionary reading through the
existing Supabase Quran function. Its initial reviewed mapping set covers eight
entries. Backend version 9 was deployed and verified before frontend publication.
See [dictionary sources and coverage](apps/playground/data/lane/README.md).

The #21 implementation adds original Arabic Mufradāt entries through the
same Supabase function. It includes four inspected entries from OpenITI’s cleaned
JK edition. Backend version 10 includes the four entries; frontend publication
follows the approved push through Pages.
See [edition review, licence and mappings](apps/playground/data/mufradat/README.md).

- Search for a chapter by name or English meaning.
- Open a chapter to read Arabic text with an English translation.
- Tap an Arabic word for its English meaning and transliteration, then move between words in the verse.
- Bookmark an ayah and find it again in My bookmarks.
- View the chapter list beside the reader on desktop, or stacked on mobile.

The reader loads Quran Foundation content through a Supabase Edge Function. It loads verses in pages, credits the translation source, and lets you retry failed requests. The current API environment is pre-live, so only Al-Fatihah and Al-Baqarah are available. All 114 chapters require Quran Foundation production approval; see [Production access](supabase/functions/quran/README.md#production-access). Frontend changes are published by the Pages workflow after a push to `main`. Audio playback and reading progress are not connected yet. See the [Playground setup](apps/playground/README.md#quran-api-setup) and [function setup](supabase/functions/quran/README.md).

## Shared API contracts

[`packages/api-contracts`](packages/api-contracts/README.md) holds the Zod schemas and inferred types shared by both frontends and the Edge Functions. They are safe to use in browser code. Fetch adapters check responses against these schemas, while the Quran backend adapter handles provider-specific data formats. No code generation is needed.

Our Quran `/v2/` routes were deployed and checked on 2026-10-30 as backend version 5. The Pages workflow publishes the corresponding frontend after push; legacy routes remain available during migration. See [release order](supabase/functions/quran/README.md#owned-v2-contract-and-migration).

## Test strategy

Use Vitest to test detailed page and handler behaviour. Run the real application code and supply fake HTTP responses only where needed. Use Playwright for short journeys through a production build and for browser behaviour such as direct routing, refresh and layout. Repeat an assertion across the suites only when the browser test catches a separate integration risk.

The Edge Function API-contract tests have their own workspace under `supabase/functions/tests/`. Run `pnpm test:functions` or `pnpm --filter edge-functions test:coverage`; see [backend test ownership and setup](supabase/functions/README.md).

Both apps have a `test:smoke` command that opens an existing deployment using `PLAYWRIGHT_BASE_URL` and calls its real backend. Local checks use HTTP fixtures; the Playground dictionary journey also runs the real local Deno entry point with pinned data. These checks cannot confirm the hosted service works. Each app README explains the commands and what they check.

Run release-policy tests with `node --experimental-strip-types --test scripts/releases/*.test.mjs`. They exercise selection, staging, promotion, credential containment and failure reporting without deploying. The CLI test uses the root MSW development dependency to intercept HTTP at the network boundary; unexpected hosts, methods and metadata queries fail the test.

## Local setup

Use Node 24 for Playground tests and the Pages build; the separate Next.js app uses Node 22. Install dependencies with pnpm:

```sh
corepack pnpm install
```

Run Playground locally:

```sh
pnpm dev
```

Common checks:

```sh
pnpm lint
pnpm lint:fix # Apply safe lint fixes; review the diff
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

Biome lints supported source and configuration files across the repository, including new apps. It uses the recommended rules, follows `.gitignore`, and excludes generated Next.js declarations and the pnpm lockfile. Formatting and import organisation are disabled so linting does not rewrite existing code. The Next.js app adds Next.js/React and floating-promise rules and uses Prettier for formatting. Documented inline exceptions preserve the Quran reader's focus and CSS cascade behaviour.

The **Biome lint** GitHub Actions check runs on every pull request and push to `main`. Add it as a required check in branch protection to enforce it before merge.

Run a workspace app directly with `pnpm --filter playground <script>`.

See the [Playground README](apps/playground/README.md) for route-specific browser test files and the boundaries of the test evidence.

### Supabase API demo

**Page:** [Open the Supabase API demo](https://usmaanalii.github.io/personal-tools/supabase/)

Try a GET request to the public `hello` Edge Function and inspect the response. The Quran reader is a separate page and does not call this function.

For local work on the Supabase example, copy `apps/playground/.env.example` to `apps/playground/.env.local` and fill in the project URL and publishable key. GitHub Actions reads the same public values from repository variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Values prefixed with `VITE_` are included in the browser build. Use only the Supabase publishable key there; it is intentionally public and must be paired with appropriate Row Level Security policies. Never put a Supabase secret or service-role key in a `VITE_` variable or frontend code.

The function at `supabase/functions/hello/index.ts` returns a public demo response. It does not read or write private data. Add database changes as Supabase migrations and enable Row Level Security for tables accessed by client apps.

## GitHub Pages

GitHub Actions builds Playground and the shared UI Storybook into one GitHub Pages artifact, then checks its static routes and Storybook preview before publishing. See [Storybook setup and publishing](packages/ui/README.md). The shared UI catalogue is available through Quick access above. The Vite base path defaults to `/personal-tools/`; set `VITE_BASE_PATH=/` when deploying the app at a domain root.

In repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions**.

## Next.js app

**Live app:** [Next.js connection lab](https://next-vercel-supabase-app.vercel.app)

[`apps/next-vercel-supabase-app`](apps/next-vercel-supabase-app/README.md) is an independent Next.js App Router app configured for Vercel and the existing public Supabase demo function.

Select **Check connection** to call Supabase through the Next.js server. The page shows progress, displays the greeting on success, and lets you retry after a failed request. The app has strict TypeScript, lint and formatting checks, API and page integration tests, and desktop/mobile browser smoke checks.

```sh
pnpm dev:next
pnpm check:next
pnpm --filter next-vercel-supabase-app test:e2e
```

Root commands such as `pnpm dev`, `pnpm test`, and `pnpm build` run Playground. Use `pnpm test:all`, `pnpm typecheck:all`, `pnpm build:all`, or `pnpm test:e2e:all` to run the corresponding scripts across the workspace; `test:all` also includes the Edge Function tests.

See the app README for server-only environment variables and browser checks. After the one-time environment and credential setup, the [shared Vercel release workflow](.github/workflows/VERCEL_RELEASES.md) tests each new production build at its own URL before pointing the public domain at it. The live URLs above stay the same.
