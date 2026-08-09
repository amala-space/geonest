---
title: ADR-0001 Commit observations locally before any sync
status: accepted
owner: Mario
last_reviewed: 2026-07-13
---

# ADR-0001: Commit observations locally before any sync

- Status: Accepted
- Date: 2026-05-14 (retro-recorded 2026-07-13)
- Supersedes: —
- Superseded by: —

## Context

Field users frequently work in remote locations with no stable connectivity. Losing a capture because the network was unavailable is unacceptable.

## Decision

All observations are committed to the local database before any synchronization. Creating or editing a feature never waits on the server. Export works fully offline and without login.

## Alternatives considered

- **Server-authoritative writes**: rejected — makes connectivity a prerequisite for capture, the exact failure mode fieldwork cannot tolerate.
- **Optimistic UI over a server write**: still risks data loss if the process dies before the write lands; local-first is simpler and stronger.

## Consequences

- Creating observations never blocks on the network.
- Sync conflicts must be resolved explicitly (local is the source of truth until pushed).
- Server-only validation cannot block local capture; validation that matters must run client-side too.

## Verification

Airplane-mode capture + edit + GeoJSON export succeeds with no network. Enforced as a product invariant in [../development/conventions.md](../development/conventions.md).

## Reusable lesson

The offline-first-local-write pattern is a candidate global lesson for field/remote data apps.
