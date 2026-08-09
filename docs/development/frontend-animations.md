# Learning: Frontend animation system

- Date: 2026-06-07
- Status: Verified (typecheck); device runtime pending
- Scope: Project only
- Related files: src/routes/+layout.svelte, src/app.css,
  src/routes/+page.svelte, src/routes/projects/[id]/+page.svelte,
  src/lib/components/{ConfirmDialog,Toaster,TutorialSheet}.svelte,
  src/routes/admin/+page.svelte, src/routes/join/+page.svelte

## Situation
Native-feeling motion wanted on this SvelteKit + Capacitor (Android) app,
which keeps a persistent WebGL map layer alive across navigation.

## Finding
- Page nav: View Transitions API via `onNavigate` in `+layout.svelte`;
  Material fade-through defined in `app.css`.
- The persistent map layer (`.persistent-map-layer`) MUST carry its own
  `view-transition-name: persistent-map`, or the WebGL canvas re-snapshots
  and flickers/crossfades on every nav. Hard constraint.
- State-driven UI (ConfirmDialog, Toaster, TutorialSheet, admin/join
  overlays) uses Svelte transitions (`in:`/`out:`), NOT the VT API.
- Shared-element morph: the tapped project card's `.project-name` carries a
  conditional `view-transition-name: project-hero`; target is the `<h1>` on
  `projects/[id]`. Only ONE element may carry the name per snapshot
  (`morphingId` state set in `openProject()` + `afterNavigate` cleanup).
- TutorialSheet auto-enters native fullscreen video on Android via
  `requestFullscreen()` (Capacitor's default WebChromeClient handles the
  custom-view + landscape); best-effort, exits on close.

## Evidence
`svelte-check`: 0 errors / 0 warnings across all changes.

## Resolution
Forward morph (card -> h1) shipped. Reverse morph (back nav) deliberately
NOT implemented: `afterNavigate` runs after the VT snapshot is captured, so
the returning card never carries the name in time. Reverse would require
setting the name during a layout-level `onNavigate` keyed on
`navigation.from`.

## Reuse potential
Carve-out rule, mechanism split, and morph-timing gotcha generalize — see
the global lesson `native-transitions-in-spa-webview-apps`.

## Promotion status
Carve-out + morph-timing + Capacitor-fullscreen patterns promoted to the
global playbook (2026-06-07).
