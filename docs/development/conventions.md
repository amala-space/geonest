---
title: Code and design-system conventions
status: current
owner: Mario
last_reviewed: 2026-07-13
related_code:
  - src/app.css
  - src/lib/components/
---

# Code and design-system conventions

The **enforceable** short form of these rules lives in the repo-root `AGENTS.md` router. This page is the full reference. Where a rule protects a load-bearing behaviour, that context is in [../architecture/overview.md](../architecture/overview.md).

## Load-bearing invariants — do not break

- **i18n**: every user-visible string uses `m.*()` from `$lib/paraglide/messages.js`. No hardcoded strings in templates, ever. New keys go into `messages/en.json` **and** `messages/id.json` simultaneously.
- **ARIA**: `aria-label`, `aria-expanded`, `role="menu"`, `role="menuitem"`, `aria-live`, `aria-hidden` are applied throughout. Do not remove or omit them on interactive elements.
- **Safe-area insets**: Capacitor Android reads native bar heights via `GpsTracker.getSafeAreaInsets()`, exposed as `--sat`/`--sab`. Do not replace with `env(safe-area-inset-*)` — unreliable in the Capacitor WebView.
- **Visual viewport**: `--visual-viewport-height` is updated on `visualViewport resize` in the root layout to keep dialogs keyboard-safe on Android. Do not remove.
- **Glass morphism**: the ActionBar uses `var(--color-surface-raised)` + `backdrop-filter: blur(14px)` to match the top nav. Do not spread glass effects to other components without deliberate reason.
- **Android deep linking**: `android:exported="true"` on `MainActivity`, the local `assetlinks.json` at `/.well-known/`, and the HTTPS intent filter configured through `PUBLIC_ANDROID_DEEP_LINK_HOST` / `PUBLIC_ANDROID_DEEP_LINK_PATH_PREFIX` are wired together. Changing package name, scheme, host, or path means updating all three (see [../operations/deployment.md](../operations/deployment.md)).

## TypeScript (strict)

- Never silence errors with `any`, `@ts-ignore`, or checker-config relaxation.
- Never pass `string | undefined` where `string` is required. For route params, make a safe local: `const safeProjectId = projectId ?? ''`.
- **Geolocation typing**: web and Capacitor position types differ. Depend only on the fields you use (`coords.latitude/longitude/accuracy/heading`); do not require DOM-only `GeolocationPosition`.
- **Domain types**: keep `FeatureRecord.properties.source` inside the `FeatureSource` union. Add a new source to the union in `src/lib/db.ts` first, then use it. See [../architecture/data-model.md](../architecture/data-model.md).
- **Test-only types**: for browser event mocks (e.g. iOS `webkitCompassHeading`), define a test-local extended type; do not widen production types.

## Svelte accessibility baseline

- No click handlers on non-interactive elements (`li`, `div`) for navigation/actions — use `button`/`a`.
- Icon-only buttons need an accessible name (`aria-label`/`aria-labelledby`/`title`).
- Avoid `autofocus`; focus explicitly after render with `bind:this` + `tick()` when a revealed field should receive focus.

## Design system

### Color tokens

All colors come from CSS custom properties in `:root` of `src/app.css`. Never hardcode hex outside `var(--token, #fallback)`.

- Primary actions: `--color-primary-dark` / `--color-primary-hover`
- Tools: `--color-tool-point`, `--color-tool-area`, `--color-map-blue`
- Area display: `--color-area-accent`
- Text: `--color-text`, `--color-text-dark`, `--color-text-nav`, `--color-muted`
- Surfaces: `--color-surface`, `--color-surface-raised`, `--color-surface-subtle`
- Badges: `--color-badge-*`, `--color-chip-neutral-*`
- Status: `--color-sync-*`, `--color-error-*`, `--color-danger`, `--color-warning`
- Do **not** use `--color-border` as a fill/background — border tokens are for 1px strokes only.

### Border radius

Use tokens only, never hardcoded px: `--radius` (8) inputs · `--radius-md` (10) buttons · `--radius-lg` (12) pill containers · `--radius-card` (14) cards/panels · `--radius-card-lg` (18) sign-in card · `--radius-card-xl` (20) modals · `--radius-card-xxl` (24) hero auth card · `--radius-pill` (999) pills/avatars.

### Z-index scale

Use only the documented tiers (comment block in `src/app.css`): map canvas 0 · page headers 500 · context menus 900 · modals 1000 · map boot loader 1300 · project header 1500 · dropdowns 1600. Do not invent values.

### Touch targets (Android)

Minimum tap area 44px (2.75rem). When the visual element must stay small (e.g. avatar circles), expand the tap area invisibly:

```css
.btn { position: relative; isolation: isolate; width: 2.75rem; height: 2.75rem; }
.btn::before {
  content: ''; position: absolute;
  width: 2.25rem; height: 2.25rem; border-radius: 50%;
  background: var(--avatar-bg, var(--color-primary-dark)); z-index: -1;
}
```

Pass dynamic colors as CSS variables (`style="--avatar-bg: {color}"`), not `style:background`.

### Pill-toggle pattern

Segmented controls use global `.pill-toggle` / `.pill-btn` / `.pill-btn.active` from `src/app.css` — do not re-implement locally. Inside a component with a broad `button` selector, exclude pill buttons:

```css
.header-tools button:not(.pill-btn):not(.profile-avatar-btn):not(.dropdown-item) { ... }
```

### Button specificity traps

The global button reset has specificity (0,1,1). Scoped Svelte rules with a parent class are ≥ (0,2,0) and win. Broad scoped selectors like `.parent button {}` override global component styles on any nested button — use `:not()` exclusions or target specific classes, never bare `button`.

### Shared components

- **ProjectsPanel** (`src/lib/components/ProjectsPanel.svelte`) — all project list panels. Pass `buttonTourId` when the new-project button needs a `data-tour`.
- **DropdownMenu** (`src/lib/components/DropdownMenu.svelte`) — all context/overflow menus. Do not build inline menus.
- **PageHeader** (`src/lib/components/PageHeader.svelte`) — standard page headers. The project map page keeps its custom header (unique inline tooling); do not force PageHeader there.

### MapLibre CSS

- Do not set `background-color` on `.maplibregl-ctrl-attrib-button` — MapLibre 5.x uses `mask-image` + `background-color` for the ⓘ icon; overriding hides it.
- Map paint properties (e.g. `fill-color`) cannot use CSS variables — define JS constants co-located with the `setPaintProperty` call.
- The persistent map canvas is `position: fixed; inset: 0`. Overlays that must align with map center (e.g. crosshair) use `position: fixed`, not `absolute` in a child.

### Svelte scoping and global CSS

- Global classes (`.pill-btn`, `.dropdown-item`) on elements in a component still get the component's Svelte hash; global rules targeting those classes still apply.
- Avoid `!important` except for MapLibre overrides where specificity cannot be won.
- Use `background-color`, not the `background` shorthand, when only the color changes — shorthand resets `background-image`.
