---
title: ADR-0009 Temporarily disable early-access SMTP fallback
status: accepted
owner: Mario
last_reviewed: 2026-08-08
---

# ADR-0009: Temporarily disable early-access SMTP fallback

- Status: Accepted
- Date: 2026-08-08
- Supersedes: ADR-0008
- Superseded by: —

## Context

The Workspace Google Group is now the single tester-access path. Requiring SMTP
configuration to deploy the Group enrollment function delays this setup and
introduces an unrelated credential dependency.

## Decision

Disable SMTP notification for early-access requests. The callable writes the
request first, attempts the Workspace Group insertion, and records
`membershipStatus: 'failed'` if it cannot add the requester. It still returns a
successful receipt to the visitor so the address is retained for manual
recovery.

## Alternatives considered

- **Keep SMTP as a required fallback:** preserves automatic operator email but
  requires a separate Gmail credential before deployment. Rejected for now.
- **Reject the form on enrollment failure:** gives no recovery record and loses
  interested testers. Rejected.

## Consequences

- No `SMTP_PASSWORD` secret or Nodemailer dependency is required.
- Operators must monitor `earlyAccessRequests` where
  `membershipStatus == "failed"` until a fallback is deliberately restored.
- This decision should be superseded when a durable non-SMTP recovery workflow
  is available or SMTP fallback is configured.

## Verification

`functions/src/earlyAccess.test.ts` covers successful, idempotent, duplicate,
and failed Group enrollment without an email side effect.

## Reusable lesson

No global lesson proposed: this is a temporary project-specific rollout choice.
