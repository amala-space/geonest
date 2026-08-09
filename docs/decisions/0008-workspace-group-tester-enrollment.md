---
title: ADR-0008 Workspace Group enrolls closed-test requesters
status: accepted
owner: Mario
last_reviewed: 2026-08-08
---

# ADR-0008: Workspace Group enrolls closed-test requesters

- Status: Accepted
- Date: 2026-08-08
- Supersedes: ADR-0007
- Superseded by: —

## Context

ADR-0007 collected interested testers and emailed support so a person could add
them to the Play Console email list. The closed track now uses a Google Group,
which lets the Google Admin SDK Directory API add new requesters automatically.

## Decision

The early-access callable writes the Firestore request first, then uses a
domain-wide-delegated service account to add its normalized email to the
configured tester Google Group. A Directory API conflict means the address is
already a member and is treated as success.

If Group enrollment cannot run or fails, the callable records
`membershipStatus: 'failed'` and sends the existing support notification as a
manual-enrollment fallback. Failed membership or notification work never
changes the successful public callable response: the request document remains
the source of truth.

## Alternatives considered

- **Keep Play Console email lists:** supports existing manual testers but has no
  supported API for adding individual addresses. Rejected as the primary path.
- **Open-join Group:** reduces administrative setup but lets unapproved people
  request access. Rejected.
- **Fail the form when Directory API fails:** can lose a willing tester during a
  temporary Workspace outage. Rejected.

## Consequences

- The Google Group must permit external members and direct member addition;
  users still separately opt in to the Play closed test.
- Deployment needs the tester Group address, a delegated Workspace admin email,
  and a Firebase secret holding the service-account JSON. The service account
  receives only the group-membership OAuth scope.
- The old Play Console email list should be migrated into the Group before the
  track is switched; a closed track uses one tester source at a time.
- Existing duplicate submissions are intentionally not backfilled, so neither
  integration can be abused to generate repeated changes or email.

## Verification

`functions/src/earlyAccess.test.ts` covers successful, idempotent, and failed
enrollment plus SMTP fallback. `functions/src/workspaceGroup.test.ts` verifies
credential validation, request shape, and the Directory API's conflict mapping.

## Reusable lesson

No global lesson proposed: this is specific to Google Play closed testing and
the Google Workspace Directory API.
