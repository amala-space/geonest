# AGENTS.md

Router for coding agents working in this repository. This file stays small: it tells you **how to work now** and where to read. Knowledge (what/why/how) lives in [`docs/`](docs/index.md); rules are enforced by checks, not prose.

## Before changing code

1. Read [`docs/index.md`](docs/index.md) — the documentation map.
2. Read [`docs/architecture/overview.md`](docs/architecture/overview.md).
3. Read any doc linked from the area you are changing.
4. Check [`docs/decisions/`](docs/decisions/index.md) for ADRs that constrain the change — do not silently reverse an accepted decision; supersede it with a new ADR.

## Commands

- Install: `npm install`
- Type/diagnostic check: `npm run check`
- Test: `npm test`
- Build: `npm run build`
- Docs (strict, what CI runs): `mkdocs build --strict`

## Required verification before claiming done

- Run `npm run check` — must be green.
- Run relevant tests for touched logic.
- If you changed docs or moved pages, run `mkdocs build --strict` (fails on broken links / missing nav).
- If you touched `.gitignore`, added a config file, or added anything naming the production deployment, run `npm run verify:public` — CI runs it as the `boundary` job.
- Do not claim success unless checks are currently green.

## Hard rules (enforceable consequences)

- **Never break the load-bearing invariants** in [`docs/development/conventions.md`](docs/development/conventions.md): full i18n (`m.*()`) and ARIA coverage, Capacitor safe-area insets (`--sat`/`--sab`, not `env()`), `--visual-viewport-height` tracking, and the three-part Android deep-link wiring.
- **TypeScript is strict**: no `any`, `@ts-ignore`, or checker relaxation to silence errors; no `string | undefined` where `string` is required.
- **`FeatureRecord.properties.source` stays inside the `FeatureSource` union** — extend the union in `src/lib/db.ts` first (see [`docs/architecture/data-model.md`](docs/architecture/data-model.md)).
- **Do not make connectivity a prerequisite** for creating or editing a feature ([ADR-0001](docs/decisions/0001-offline-first-local-write.md)).
- **Do not remove `cleanUrls`** or un-prerender `/welcome` ([ADR-0004](docs/decisions/0004-cleanurls-seo-serving.md)).
- **New user-visible strings** go into `messages/en.json` and `messages/id.json` together.
- **Never commit deployment identity or credentials** — Firebase config, signing keys, service accounts, real `assetlinks.json`, or the production domain/package name. Ship a `.example` and read the real value from ignored local config; `npm run verify:public` fails the build otherwise.
- **Colors, radii, z-index, and shared components** follow [`docs/development/conventions.md`](docs/development/conventions.md) — no hardcoded hex/px/z-index, no re-implementing ProjectsPanel / DropdownMenu / PageHeader / pill-toggle.

## Definition of done

- Implementation complete.
- Tests added or updated for touched logic.
- `npm run check` (and tests) pass.
- Any user-visible behaviour change updates the relevant page in [`docs/`](docs/index.md).
- A new architectural/product decision is recorded as an ADR in [`docs/decisions/`](docs/decisions/index.md).
- The PR's *Documentation impact* section is filled in.

## Full detail

Design-system and code conventions: [`docs/development/conventions.md`](docs/development/conventions.md). Setup and build: [`docs/development/setup.md`](docs/development/setup.md). Deploy, SEO, deep-links, sync matrix: [`docs/operations/deployment.md`](docs/operations/deployment.md).
