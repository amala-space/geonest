---
title: Workspace tester enrollment design
status: approved
owner: Mario
last_reviewed: 2026-08-08
related_code:
  - functions/src/earlyAccess.ts
  - functions/src/index.ts
  - functions/src/earlyAccess.test.ts
---

# Workspace tester enrollment design

## Goal

Automatically add a new early-access requester to the Google Group that backs
the Play closed-testing track, while retaining support email as a reliable
fallback when Workspace enrollment cannot be completed.

## Decision

The Cloud Function will call the Google Admin SDK Directory API's
`members.insert` method with a service account that has domain-wide delegation.
The group address, delegated Workspace administrator, and service-account JSON
are deploy-time configuration; the service-account JSON is stored only as a
Firebase secret.

Each fresh request continues to be written to Firestore first. The function then
tries to add its normalized email address to the configured tester group.

- A successful insertion records `membershipStatus: 'added'`.
- Directory API's already-a-member response records `membershipStatus:
  'already-member'`; it is a success and does not send support email.
- Missing Workspace configuration or any other Directory API error records
  `membershipStatus: 'failed'` and invokes the existing support-email
  notification as a fallback. If that email fails too, its existing
  `notificationStatus: 'failed'` behavior remains intact.
- Duplicate form submissions do not call either integration, preserving the
  existing anti-spam guarantee.

The closed-testing Google Group must be configured by its administrator to
permit external members, because eligible Play testers may use a Google account
outside the organization domain.

## Security and privacy

The callable already hashes the document id, rate limits by IP, and denies
direct Firestore access. The new API adapter receives only the normalized email
and sends it only to the configured Google Group. No credential material is
committed, logged, included in the notification email, or returned to the
caller.

## Alternatives

- **Manual Play Console addition via support email:** remains the failure
  fallback but does not meet the automation goal.
- **Open-join consumer Google Group:** does not automatically enroll a
  requester and adds an abandonment step, so it is not the primary path.
- **Play Developer API email-list write:** unavailable because closed-test API
  enrollment is group-based rather than individual-email based.

## Verification

Unit tests will cover an inserted member, an already-existing member, Directory
API failure followed by successful support notification, and failure of both
integrations. Full Functions type checking and tests, frontend checks/tests, and
strict documentation build remain required.
