---
title: ADR-0003 Continuous tracking uses a custom Android foreground-service plugin
status: accepted
owner: Mario
last_reviewed: 2026-07-13
---

# ADR-0003: Continuous tracking uses a custom Android foreground-service plugin

- Status: Accepted
- Date: 2026-05-14 (retro-recorded 2026-07-13)
- Supersedes: —
- Superseded by: —

## Context

Live track recording must continue with the screen off, at a fixed interval with distance-based filtering and reliable autosave. Capacitor/Web Geolocation is adequate for one-shot points and polygon corners but cannot deliver dependable background capture.

## Decision

Use Capacitor Geolocation for simple location (points, corners, current accuracy) and a **custom Android plugin backed by a foreground service** (Fused Location Provider) for continuous tracking. Each native location is streamed to Svelte and stored locally immediately.

## Alternatives considered

- **Web Geolocation `watchPosition` only**: throttled/suspended in background WebViews; loses points when the screen is off. Rejected for tracking.
- **Third-party background-geo plugin**: heavier dependency and licensing; the needed behaviour is a thin, well-scoped native surface.

## Consequences

- Android shows a foreground-service notification during tracking (required and expected).
- Two location code paths exist; shared code depends only on a minimal position shape (see [../development/conventions.md](../development/conventions.md)).
- The `android/` plugin is tracked so forks retain native background tracking;
  Firebase configuration, signing material, and deployment identity remain local
  and ignored.

## Verification

Screen-off walk records a continuous track with autosave; points survive app backgrounding.

## Reusable lesson

Background-capture reliability on Android WebViews requires a native foreground service — a recurring lesson for Capacitor apps.
