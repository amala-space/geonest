---
title: ADR-0006 One static bundle ships as PWA and Capacitor WebView
status: accepted
owner: Mario
last_reviewed: 2026-07-13
---

# ADR-0006: One `adapter-static` bundle ships as PWA and Capacitor WebView

- Status: Accepted
- Date: 2026-05-14 (retro-recorded 2026-07-13)
- Supersedes: —
- Superseded by: —

## Context

Geonest targets both the web (installable PWA) and Android (Capacitor). Maintaining two codebases or a server-rendered runtime inside the Android WebView would multiply cost and platform bugs.

## Decision

Use SvelteKit with `adapter-static`: the app is prerendered to static HTML/JS and the **same** bundle is served as the PWA and loaded inside the Capacitor Android WebView. Android-only capability (background GPS) is reached through the native plugin bridge, not a separate app.

## Alternatives considered

- **Separate native Android app**: duplicate UI/logic; rejected for a small team.
- **Server-rendered runtime**: needs a running server, conflicts with offline-first and Play-Store-free distribution.

## Consequences

- No server runtime; all logic is client-side, aligning with [ADR-0001](0001-offline-first-local-write.md).
- Platform differences (geolocation typing, safe-area insets, WebView quirks) are handled in shared code with minimal shims — see [../development/conventions.md](../development/conventions.md).
- Distribution can be Play-Store-free (APK + link/QR) with an installable PWA on the web.

## Verification

`npm run build` produces a static `build/`; `npx cap sync` loads it in Android; both render identically.

## Reusable lesson

—
