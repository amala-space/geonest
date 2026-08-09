---
title: ADR-0004 cleanUrls + prerendered /welcome for SEO
status: accepted
owner: Mario
last_reviewed: 2026-07-13
---

# ADR-0004: `cleanUrls` + prerendered `/welcome` for SEO

- Status: Accepted
- Date: 2026-06-04 (retro-recorded 2026-07-13)
- Supersedes: —
- Superseded by: —

## Context

Geonest is an SPA served from Firebase Hosting with a catch-all rewrite to the app shell. `/welcome` is the public, indexable marketing landing and must return real prerendered HTML to search engines, not the empty SPA shell.

## Decision

Set `"cleanUrls": true` in `firebase.json` and prerender `/welcome` (route-level `ssr = true`). Exact static-file matches win before the SPA rewrite. `PUBLIC_APP_URL` is baked at build time so the canonical URL is correct.

## Alternatives considered

- **SPA-only with client rendering**: Google indexes the empty shell → effectively invisible. Rejected.
- **Separate marketing site**: extra surface to maintain and deploy; unnecessary for a single landing page.

## Consequences

- `cleanUrls` is **load-bearing** — removing it drops `/welcome` into the catch-all rewrite and destroys indexing.
- Hosting builds must set `PUBLIC_APP_URL` or the canonical URL defaults to localhost.
- New indexable pages must be prerendered and land as exact static matches.

## Verification

`curl` of the deployed `/welcome` returns rendered marketing HTML with the correct canonical tag, not the app shell. See [../operations/deployment.md](../operations/deployment.md).

## Reusable lesson

SPA + prerendered marketing routes on Firebase Hosting need `cleanUrls` and static-match ordering — captured in the global playbook.
