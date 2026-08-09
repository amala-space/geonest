# Contributing to Geonest

Thanks for your interest! This guide gets you to a working dev setup and a
mergeable PR.

## Setup

```bash
npm install
cp .env.example .env       # fill with YOUR Firebase web config
npm run dev
```

**Never use the maintainer's production Firebase project.** Create your own (see
[README](README.md#configure-firebase)). PRs that hardcode project ids, deploy
targets, or branding URLs will be asked to use the environment variables instead.

## Project conventions (please preserve)

- **i18n — no hardcoded user-facing strings.** Every visible string uses
  `m.*()` from `$lib/paraglide/messages.js`. Add new keys to the message
  catalog; never inline literal copy in templates.
- **Accessibility.** Interactive elements carry the right ARIA
  (`aria-label`, `aria-expanded`, `role`, `aria-live`, …). Don't drop them.
- **Branding/identity via env.** Deploy URL, Play Store id, and Android client
  id come from env (`PUBLIC_APP_URL`, `PUBLIC_ANDROID_APP_ID`,
  `PUBLIC_GOOGLE_ANDROID_CLIENT_ID`) and [`$lib/seo`](src/lib/seo.ts). Route new
  URLs through there.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — match the surrounding code.

## Before opening a PR

```bash
npm run check     # must pass (svelte-check)
npm test          # must pass (vitest)
```

- Keep PRs focused; describe the change and how you verified it.
- Update or add tests for behavior changes.
- Don't commit secrets, `.env`, `functions/.env`, `capacitor.config.ts`,
  `.firebaserc`, `static/.well-known/assetlinks.json`,
  `android/app/google-services.json`, Android signing files, or
  `play-service-account.json` — they are gitignored because they hold
  deployment identity specific to each fork.

## Reporting bugs / ideas

Open an issue with steps to reproduce (and platform: web or Android). For
features, describe the field-survey use case it serves.
