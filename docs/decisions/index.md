---
title: Architecture decision records
status: current
owner: Mario
last_reviewed: 2026-07-13
---

# Architecture decision records (ADRs)

Immutable records of meaningful technical and product decisions. Once accepted, an ADR is not edited except for corrections — a changed decision is captured by a **new** ADR that supersedes the old one. This stops a later change (human or agent) from quietly reversing a deliberate choice.

New ADRs use the playbook ADR template (`~/engineering-playbook/templates/adr-template.md`) and the next free number.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-offline-first-local-write.md) | Commit observations locally before any sync | Accepted |
| [0002](0002-indexeddb-storage.md) | Local storage is IndexedDB via `idb` | Accepted |
| [0003](0003-custom-android-tracking-plugin.md) | Continuous tracking uses a custom Android foreground-service plugin | Accepted |
| [0004](0004-cleanurls-seo-serving.md) | `cleanUrls` + prerendered `/welcome` for SEO | Accepted |
| [0005](0005-per-project-cloud-sync-eligibility.md) | Cloud sync is evaluated per project, not per account | Accepted |
| [0006](0006-static-bundle-web-and-capacitor.md) | One `adapter-static` bundle ships as PWA and Capacitor WebView | Accepted |
| [0007](0007-early-access-tester-capture.md) | The landing Play badge collects closed-testing addresses | Superseded by 0010 |
| [0008](0008-workspace-group-tester-enrollment.md) | Workspace Group enrolls closed-test requesters | Superseded by 0010 |
| [0009](0009-temporarily-disable-early-access-smtp-fallback.md) | Temporarily disable early-access SMTP fallback | Superseded by 0010 |
| [0010](0010-tester-self-enrolment.md) | Testers enrol themselves; the early-access backend is removed | Accepted |
