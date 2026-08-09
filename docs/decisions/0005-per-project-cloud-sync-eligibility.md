---
title: ADR-0005 Cloud sync is evaluated per project, not per account
status: accepted
owner: Mario
last_reviewed: 2026-07-13
---

# ADR-0005: Cloud sync is evaluated per project, not per account

- Status: Accepted
- Date: 2026-05-27 (retro-recorded 2026-07-13)
- Supersedes: —
- Superseded by: —

## Context

Users mix local-only projects with shared, invite-based projects, sometimes while anonymous. Sync must be safe for anonymous users joining a single shared project without turning on sync for everything they touch.

## Decision

Cloud sync eligibility is a **per-project** property (`cloudSyncEnabled`) read from local project-access records, not a global account setting. Anonymous sessions may sync **only** the specific invited project whose sync is enabled.

## Alternatives considered

- **Account-level "sync on/off"**: leaks local-only projects to the cloud or blocks legitimate shared sync; wrong granularity.
- **Require sign-in for any sync**: breaks the anonymous-surveyor-joins-via-invite flow that fieldwork depends on.

## Consequences

- The sync layer checks project access on every project, not once per session.
- Firestore rules and the `createdByUid` / membership model must agree with this matrix (see [../architecture/data-model.md](../architecture/data-model.md)).
- The full eligibility matrix is documented in [../operations/deployment.md](../operations/deployment.md).

## Verification

Anonymous user joins one invited project → only that project syncs; local projects stay local. Signed-in user with `cloudSyncEnabled=false` project stays local.

## Reusable lesson

—
