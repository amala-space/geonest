---
title: ADR-0010 Testers enrol themselves; the backend is removed
status: accepted
owner: Mario
last_reviewed: 2026-08-08
---

# ADR-0010: Testers enrol themselves, and the early-access backend is removed

- Status: Accepted
- Date: 2026-08-08
- Supersedes: [0007](0007-early-access-tester-capture.md), [0008](0008-workspace-group-tester-enrollment.md), [0009](0009-temporarily-disable-early-access-smtp-fallback.md)
- Superseded by: —

## Context

Three ADRs tried to move an address from the landing page into Play's tester list. [0007](0007-early-access-tester-capture.md) collected it and mailed support. [0008](0008-workspace-group-tester-enrollment.md) added the requester to the original Workspace Group through the Admin SDK. [0009](0009-temporarily-disable-early-access-smtp-fallback.md) then removed the mail fallback, leaving signups told "You're on the list" while nothing granted access and nothing reached support.

Play refuses that Group. Measured against the live account with `scripts/check-play-tester-group.mjs`, same service account and track, minutes apart:

| Payload | Result |
|---|---|
| `googleGroups: ["workspace-group@example.com"]` | 403 `PERMISSION_DENIED` |
| `googleGroups: []` | accepted |

The rejection attaches to the Group value, not the caller's permission — Play reuses a generic "caller does not have permission" message. Play documents only the `yourgroupname@googlegroups.com` form.

That puts the two required properties in permanent tension. Play accepts a **consumer** Group; consumer Group membership is manageable by **no API at all** (Admin SDK Directory and Cloud Identity Groups both operate only on groups owned by a Workspace/Cloud Identity customer), and `edits.testers` cannot touch Play's own email lists either.

So no amount of backend makes enrolment automatic. Every design that collected an address was paying for infrastructure — a callable, a Firestore collection, rate limiting, a mailer, a service-account secret, domain-wide delegation — to deliver information the user could act on directly.

## Decision

Delete the whole path. The badge opens a dialog showing three links: join the tester Group, accept the test on Play, install. Nothing is collected, no callable is invoked, and there is no fallback route.

- The Group is a **consumer** Group set to *anyone on the web can join*; Play's closed track points at it. Membership is what grants eligibility.
- Links come from build-time config: `PUBLIC_EARLY_ACCESS_GROUP_URL`, and `PUBLIC_ANDROID_APP_ID` for the opt-in and store URLs.
- The existing tester email list on the original track is **never migrated**. Play treats email lists and Groups as alternatives per track, so repointing a track would strand everyone already opted in until they re-joined. Self-enrolment runs on a second closed track; the original keeps its list untouched.

Removed with it: `requestEarlyAccess`, `earlyAccessRequests` / `earlyAccessRateLimits` and their rules, the Workspace Directory integration, the Gmail/SMTP sender, and `google-auth-library`.

## Alternatives considered

- **Keep collecting the address for funnel data**: a required step that buys the user nothing, on the highest-intent click on the page. The cost lands on the user, the benefit on us. Rejected.
- **Email the links instead of showing them**: makes a working flow depend on mail setup, deliverability and spam filtering, for links the user could have clicked immediately. Rejected.
- **Consumer Group + scripted membership**: no supported API; browser automation against Google Groups is fragile and against terms. Rejected.
- **Nested Groups** (Workspace Group as a member of the consumer Group): undocumented whether Play expands nested membership. Untested; cheap to try if automation ever becomes worth it.
- **Open testing**: removes tester lists entirely but forfeits the closed-test requirement for production access, which is evaluated per closed track. Rejected while that requirement stands.

## Consequences

- **Nothing is recorded.** No addresses, no request count, no per-CTA funnel. Interest is visible only as Play's opted-in tester count.
- The Group must stay open-join. Closing it breaks step 1 for everyone with no error surfaced to us — the failure is silent by construction.
- `PUBLIC_EARLY_ACCESS_GROUP_URL` and `PUBLIC_ANDROID_APP_ID` are **build-time**; a web rebuild is required to change them, and a missing app id silently produces `com.example.geonest` links.
- Play's opt-in link is app-level, resolving to whichever track the tester is eligible for. A tester eligible for both tracks lands on one by Play's precedence, so both tracks must carry compatible builds.
- When the app reaches open testing or production, supersede this ADR: the badge returns to a plain `PLAY_STORE_URL` link and the dialog is deleted.

## Verification

`src/lib/components/EarlyAccessDialog.test.ts` asserts the three links render with no address field and no backend call; `src/routes/welcome/welcome-page.test.ts` covers badge → dialog. The Play rejection is reproducible with `scripts/check-play-tester-group.mjs`, which opens an edit, patches, and deletes the edit without ever committing.
