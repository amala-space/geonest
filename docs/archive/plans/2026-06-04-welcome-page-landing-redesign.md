# Welcome Page Landing Redesign

**Date:** 2026-06-04  
**Status:** Approved

## Overview

Redesign `/welcome` from a minimal button screen into a proper landing page that informs, showcases features, and serves both first-time and returning users.

## Routing Behaviour (unchanged)

- No projects → redirect to `/welcome`
- Has projects → `/` (projects list)
- Logo click from any screen → `/welcome`

## Nav Bar

Extend existing `PageHeader` with auth-aware right-side actions:

| State | Nav right side |
|---|---|
| Signed out | "Sign in" button → `/admin` |
| Signed in, no projects | "Account" button → `/admin` |
| Signed in, has projects | "My Projects" button → `/` + "Account" button → `/admin` |

Nav reads Firebase auth state and local project count on mount (same pattern as `+page.svelte`).

## Page Sections

### 1. Hero (full viewport)

- **Kicker pill:** "Field mapping made simple"
- **H1:** "GPS field mapping for survey teams"
- **Subheading:** "Capture points, polygons and routes in the field. Export as GeoJSON. Works offline and syncs across devices."
- **CTAs:** "New project" (primary filled) + "Join project" (ghost pill)
- **Background:** Keep existing radial-gradient (green/blue subtle)

### 2. What you can do

Three tiles in a row (stacks on mobile). Each: SVG icon + bold title + one-line description.

| Title | Description |
|---|---|
| Capture locations | Record GPS points, areas and routes directly on the map |
| Team collaboration | Invite surveyors via link. Each member uses their own named profile |
| Export data | Download your data as GeoJSON for use in any GIS tool |

### 3. How it works

Horizontal-scroll strip on mobile, 3-col then 2-row grid on desktop. Each item: phone-frame placeholder div + caption below.

5 frames in order:

| # | Caption |
|---|---|
| 1 | Create a project |
| 2 | Capture on the map |
| 3 | Record a route |
| 4 | Edit geometry |
| 5 | Export your data |

**Screenshot placeholders:** styled `<div>` with phone-frame border radius, aspect-ratio `9/19.5`, background `#e8eeeb`, dashed border. Include visible label:

```
Screenshot: [caption]
Recommended size: 390 × 844 px (PNG or WebP)
Place in: static/screenshots/[slug].png
```

Replace placeholder with `<img>` once screenshots are available.

### 4. Used for

Four cards in a 2×2 grid (4-col on desktop). Each: emoji icon + bold title + one-line description.

| Icon | Title | Description |
|---|---|---|
| 🌾 | Agriculture | Field boundary mapping, paddock surveys, crop monitoring |
| 🌿 | Environmental | Habitat assessments, land condition surveys |
| 🏗️ | Construction | Site surveys, infrastructure mapping |
| 🔬 | Research | Fieldwork data collection, spatial sampling |

### 5. Get started (CTA footer)

- **Headline:** "Get started"
- **CTAs:** "New project" (primary) + "Join project" (ghost) — same routes as hero
- **Caption:** "Works on Android, iOS and web. No account required."

## Implementation Notes

- Page is Svelte 5 (`$state`, `$effect`). Use same rune patterns as existing pages.
- Auth state: use `onAuthStateChanged` from `firebase/auth` + `listProjects` from `$lib/db` — same imports already used in `+page.svelte`.
- i18n: add new keys to `messages/en.json` for all new copy. Follow existing `home_` prefix.
- No new routes or components required. Self-contained in `src/routes/welcome/+page.svelte`.
- Screenshot placeholders must include visible instructions for the developer replacing them.
- Keep existing CSS variables (`--color-primary-dark`, `--color-border`, `--glass-bg`, etc.) — no new design tokens.
