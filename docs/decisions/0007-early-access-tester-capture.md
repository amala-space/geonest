---
title: ADR-0007 Landing Play badge collects closed-testing addresses
status: accepted
owner: Mario
last_reviewed: 2026-08-08
---

# ADR-0007: The landing Play badge collects closed-testing addresses

- Status: Accepted
- Date: 2026-08-08
- Supersedes: —
- Superseded by: —

## Context

The Android app is in **closed testing** on Google Play. Access is granted per address in the Play Console, so a public "Get it on Google Play" link installs nothing for a visitor who is not already on the tester list. The badge on `/welcome` was therefore rendered disabled (`--coming-soon`, `tabindex="-1"`, `aria-hidden`), which spent prime landing-page space on a dead control and captured no interest.

Play grants tester access to any address backed by a **Google account** — Workspace domains included — not only `gmail.com`.

## Decision

The badge is an active control that opens `EarlyAccessDialog` and collects one email address. Submission goes through a `requestEarlyAccess` callable that mirrors `submitFeedback`: per-IP rate limit, server-side validation, a Firestore document in `earlyAccessRequests`, and an SMTP notification to the support inbox so the address can be added in the Play Console.

- The **request document is the source of truth**. A failed notification is recorded on the document (`notificationStatus: 'failed'`) and the caller still sees success — the address is already stored, so losing the mail must not lose the tester.
- The document id is `sha256(email)` truncated, so a repeat submission collapses onto the first request and never re-notifies. This keeps the badge from being a way to spam the support inbox.
- Client and server validate **shape only**; the form copy is what asks for a Google account.
- `earlyAccessRequests` / `earlyAccessRateLimits` deny all direct client access, like the feedback collections.

## Alternatives considered

- **Leave the badge disabled**: no capture, and the visitor has no way to ask for access. Rejected.
- **`mailto:` link**: no backend, but delivery depends on the visitor's mail client, keeps no record, and publishes the support address into prerendered HTML for scrapers. Rejected.
- **Firestore-only, no notification**: needs someone to poll the console. Rejected — the point is to act on a request quickly.
- **Trigger Email extension**: less code, but SMTP configuration would live outside the repo. Rejected for now; the callable owns the send.
- **Restrict to `@gmail.com`**: would reject Workspace addresses Play can grant perfectly well. Rejected.

## Consequences

- The callable needs SMTP configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` secret, `EARLY_ACCESS_NOTIFY_TO`). Without it the request is still stored, and its `notificationStatus` reads `failed`.
- Addresses are personal data: retention is 365 days via `expiresAt`, matching feedback.
- When the app reaches **open testing or production**, this decision should be superseded — the badge becomes a plain `PLAY_STORE_URL` link again and the capture flow is removed.

## Verification

`functions/src/earlyAccess.test.ts` covers validation, duplicate collapsing, and the notification-failure path; `src/lib/data/earlyAccess.test.ts` and `src/routes/welcome/welcome-page.test.ts` cover the client payload and the badge → dialog → submit flow. See [../operations/deployment.md](../operations/deployment.md) for the SMTP configuration.
