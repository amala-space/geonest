# Public SEO Metadata in Geonest

- Date: 2026-06-08
- Status: Verified
- Scope: Project only
- Related files: `src/routes/welcome/+page.ts`, `src/routes/tutorials/+page.ts`, `src/routes/privacy/+page.ts`, `src/lib/seo.ts`, `static/robots.txt`, `static/sitemap.xml`
- Related decision: none

## Situation

Geonest uses a mostly CSR SvelteKit app (`ssr = false` in the root layout), which means route-specific `<svelte:head>` metadata is not present in initial HTML unless a public route explicitly opts into SSR.

## Finding

Public discoverability pages (`/welcome`, `/tutorials`, `/privacy`) should export `ssr = true` so generated HTML includes route-specific title, description, canonical, Open Graph, and Twitter card metadata before JavaScript runs.

Private/app routes should remain unindexed using both route-level `noindex, nofollow` and `robots.txt` disallow rules for deployed `/geonest/*` app paths.

## Evidence

Verified with:

- `rtk npm test -- src/routes/page-titles.test.ts src/routes/welcome-page.test.ts src/routes/tutorials-page.test.ts src/routes/admin-page.test.ts src/routes/landing-page.test.ts`
- `rtk npm run check`
- `rtk npm run build`
- `rg` checks against `build/welcome.html`, `build/tutorials.html`, `build/privacy.html`, `build/robots.txt`, and `build/sitemap.xml`

## Resolution

Public pages opt into SSR. Shared canonical/image constants live in `src/lib/seo.ts`. `static/sitemap.xml` lists only public URLs. `static/robots.txt` publishes the sitemap and disallows private app paths.

## Reuse Potential

Useful for future Geonest public routes. Any new public marketing/help page should opt into SSR and use the same SEO metadata pattern.

## Promotion Status

Promoted as a global playbook lesson in `~/engineering-playbook/lessons/sveltekit-static-csr-seo.md`.
