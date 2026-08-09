---
title: ADR-0002 Local storage is IndexedDB via idb
status: accepted
owner: Mario
last_reviewed: 2026-07-13
---

# ADR-0002: Local storage is IndexedDB via `idb`

- Status: Accepted
- Date: 2026-05-14 (retro-recorded 2026-07-13)
- Supersedes: —
- Superseded by: —

## Context

[ADR-0001](0001-offline-first-local-write.md) requires durable local persistence that works in both the browser PWA and the Capacitor Android WebView, holding projects, features, and autosaved track points.

## Decision

Use IndexedDB via the `idb` wrapper as the local store. Revisit SQLite only if a future sync phase demands it.

## Alternatives considered

- **SQLite (native/Capacitor plugin)**: more powerful queries, but adds a native dependency and platform-specific code for a data model that is simple key/collection access. Deferred.
- **localStorage**: too small and synchronous; unsuitable for track-point volume.

## Consequences

- One storage path for web and Android — no platform branching for persistence.
- Query power is limited to IndexedDB semantics; complex reporting happens downstream (see [PostGIS mirror](../architecture/integrations/postgis-mirror-contract.md)).
- If sync scale later needs transactional SQL, migration is a known, bounded follow-up.

## Verification

Feature CRUD and track autosave persist across app restarts on web and Android.

## Reusable lesson

—
