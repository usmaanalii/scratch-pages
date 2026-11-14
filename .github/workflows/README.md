# GitHub Actions workflows

## Keep required checks visible on every PR

A required check must report a result even when a PR does not affect its app. A workflow-level `paths` filter can skip the whole workflow and leave that check pending, blocking the merge.

Let PR workflows start, then decide which jobs need to run. The Playground Playwright workflow uses `dorny/paths-filter` in its `changes` job and runs `playwright` only for relevant changes. A skipped job counts as success for required checks. Its main-branch pushes still use workflow-level path filters because those runs are not PR merge checks; a manual run starts the Playwright job.

The Vercel workflow uses a project list and an always-running summary check for the same reason.

## Vercel workspace apps

`next-app.yml` reads `scripts/releases/projects.json`, chooses the affected apps, and calls `vercel-app.yml` for each one. PRs compare the base and proposed changes and receive no production credentials. Main pushes compare against each project's last successful GitHub environment deployment. This picks up changes left behind by a failed or superseded release, even after an unrelated push. If CI cannot find a starting commit or work out what changed, it runs the project's checks and release steps. A manual run on `main` runs all configured projects and needs no deployment URL.

Each app first runs dependency installation with the frozen lockfile, its quality and coverage checks, and browser tests against a production build with a fake local backend. Pages owns the Storybook catalogue build and its browser checks. The release job can access the project's protected environment only after that app's checks pass, and only on main.

The change-selection job installs the root workspace dependencies with the frozen lockfile before running release-safety tests. Those tests use MSW at the HTTP boundary and run without production credentials. App dependencies and browser installation remain in their owning verification jobs.

The release job uses Vercel CLI 65.8.0 to build with production settings and upload to a new URL without changing the public domain. It tests that deployment against the real backend, points the public domain at the same build, checks the domain's deployment ID, then tests the public website. Action versions are pinned to commit SHAs. Each project's releases run one at a time, and a newer run cannot automatically cancel a release in progress.

Complete the setup in [the Vercel release runbook](VERCEL_RELEASES.md) before enabling releases. The Next app needs a GitHub environment named `vercel-next-production` and credentials configured there; source changes alone do not set them up. The runbook also covers adding another app and recovering from failures.

The caller passes the two deployment secret names explicitly, and the reusable workflow requires them. Their values come from the release job's GitHub environment. Keep this forwarding when adding another caller; GitHub otherwise supplies empty values even when the environment secrets exist.

Require **Next.js quality and E2E** and **Biome lint** in branch protection. The first check passes an intentional skip for unaffected apps and fails selection or app-job errors. Coverage keeps `NODE_ENV=test`. Production build output, environment files and browser login state are never cached or uploaded as artifacts.

## Repository lint

`lint.yml` runs `pnpm exec biome ci . --error-on-warnings` on every PR, main-branch push and manual run. It installs with the frozen lockfile and checks all apps and shared configuration without path filters. Errors and warnings fail the check.

Generated output follows `.gitignore`. Generated Next.js declarations and `pnpm-lock.yaml` are also explicitly excluded. Biome formatting and import organisation are disabled. The Next.js app adds its own lint rules and keeps Prettier in `next-app.yml`. Require **Biome lint** in branch protection to prevent merging a failing lint check.

## Playground Quran reader

The Pages and Playground E2E workflows use Node 24. Both run the separate Edge Function API-contract suite. This does not change the root Node pin or the separate Next.js job.

Playground app changes and any Edge Function workspace changes trigger Playground E2E. The workflow runs frontend Vitest tests and `pnpm test:functions`, builds the static production files, then uses desktop and mobile browsers to check routing, refresh and layout under `/personal-tools/`. There is no SPA fallback. The browser checks use fixture content; detailed page and handler tests use Vitest with MSW supplying HTTP responses.

To check an existing deployment against real services, run the workflow manually with `deployment_url`. Include the path prefix and trailing slash. That input runs `test:smoke`; the E2E workflow does not deploy anything.

The Supabase `quran` function is deployed separately from Pages. Its credentials belong in Supabase function secrets; Pages uses only the existing public Supabase variables. See `supabase/functions/quran/README.md` for live verification and the limit on request budgeting within each running function instance.

## Shared style guide

Changes in `packages/design-tokens/**` or `packages/ui/**` cause Pages, Playground E2E and Next checks to run, including the PR change-detection steps. Pages builds and checks the shared UI Storybook catalogue as part of its combined artifact. Next independently builds and checks its consumer; it does not repeat the catalogue build.

The short frontend/function Vitest suites remain in Pages to prevent publication on failure and in Playground E2E for independently dispatched verification. Pages browser checks cover artifact assembly, nested catalogue assets and route refresh. Its separate `test:catalogue` step checks browser-only component presentation: semantic control mapping, portal typography and responsive composition. Both use the catalogue built once for that workflow. Playground's browser suite covers app routing, focus and responsive integration. Detailed state behaviour belongs in Vitest.

The connection browser journeys run axe accessibility scans alongside their short route and action checks.

Playground's #20 dictionary journey calls the actual local Quran Deno entry point
with generated, pinned Lane assets. Playwright owns that server on port 8000,
starts it with empty provider credentials and restricted permissions, and builds
the frontend against its local URL. Verse/provider responses remain fixtures.
Deno 2.9.6 is installed before the browser step. The dictionary check covers
native reading, request timing, source content and accessibility through the
production frontend; it does not prove the hosted Supabase gateway or deployment.

## Shared API contracts

Changes to `packages/api-contracts/**` cause Pages, Playground E2E and Next verification to run, including PR change detection. Function changes also trigger Pages.

Playground E2E installs Deno 2.9.6 and runs `pnpm --filter edge-functions check:deno` on both actual function entry points with frozen function lockfiles. It also runs the Node/MSW handler tests. Deno checks imports and types; it cannot confirm a hosted deployment or provider credentials. Deploy and verify the Quran v2 backend before publishing the frontend that uses it.

## Combined Pages artifact and Storybook

`deploy-pages.yml` is the only Pages deployment owner. On every PR it runs the existing frontend and function tests, then `pnpm build:pages` and `pnpm test:pages` on Node 24 with frozen workspace installation. The named **Pages quality and routing** check always runs, so an unrelated PR does not leave it pending. It can be made a required check in branch protection. PR jobs have only read access and do not upload or deploy Pages artifacts.

Relevant pushes to `main` and manual dispatch on `main` run the same checks, upload `apps/playground/dist`, and publish that exact artifact. The build first cleans/rebuilds Playground, then builds Storybook and copies its complete output to `dist/storybook/`. UI, token, workspace/lockfile and Pages-workflow changes are covered by the main push paths. PR concurrency is separate from main; a PR cannot cancel the production run. Deploy permissions are scoped to the main-only deployment job. Existing public Playground Supabase variables are unchanged; Storybook needs no credentials.

`supabase/config.toml` is outside the Pages push paths. If a release or recovery depends on a config-only push, dispatch Pages after the fix reaches `main` with `gh workflow run deploy-pages.yml --ref main`.

The prefix-aware static server has no SPA fallback. Browser checks load every existing page shell directly and after refresh, and load the Storybook index/manager/preview through nested URLs. The local Quran check uses the existing HTTP fixture because the page waits for chapter data; no Storybook assets are intercepted. They do not prove backend connectivity. The prepublication check consumes the built artifact without rebuilding it. A failed test or build prevents upload/deployment.

Before publishing: install Chromium with `pnpm --filter playground exec playwright install --with-deps chromium`, run `pnpm build:pages`, then `pnpm test:pages`. For an existing public deployment, run `PLAYWRIGHT_BASE_URL=https://usmaanalii.github.io/personal-tools/ pnpm test:pages` (no local server or backend/asset mocks). Record the commit SHA, Pages run and hosted result on #33. The first hosted check passed on 2026-11-02 for commit `8a5706d` ([Pages run](https://github.com/usmaanalii/personal-tools/actions/runs/41484993463)); root Quick access now includes the verified Storybook URL.

To recover, revert the faulty change through the normal approved commit/push workflow and let Pages rebuild, test and redeploy the complete site. Alternatively, rerun a known-good workflow run whose source builds the complete artifact. Keep Playground and Storybook together; publishing Storybook alone would replace the other pages. Verify all public routes again after recovery. A failed prepublication run leaves the previous deployment serving; a failure during deployment requires checking the Pages run and public routes before claiming recovery.
