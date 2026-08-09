---
title: Archive
status: archived
owner: Mario
last_reviewed: 2026-07-13
---

# Archive

Historical material kept for provenance. **Not canonical** — current knowledge lives in the [product](../product/vision.md), [architecture](../architecture/overview.md), [decisions](../decisions/index.md), and [operations](../operations/deployment.md) sections. Where these documents made a decision, that decision now lives as an [ADR](../decisions/index.md).

| Document | What it is |
|---|---|
| [design-original.md](design-original.md) | The original single-file design plan (product goal, flows, stack, phases). Superseded by the product + architecture sections and ADRs 0001–0003. |
| [dev-notes.md](dev-notes.md) | Working developer notes (build recipes, Firebase/SEO checklists, permission matrix). Live content extracted into [development/setup.md](../development/setup.md) and [operations/deployment.md](../operations/deployment.md). |
| [wiki-docs-architecture-note.md](wiki-docs-architecture-note.md) | Design note that motivated this docs-as-code structure. |
| `docs/archive/plans/` (in-repo) | ~40 dated design/implementation plans — the historical "changelog of thoughts". Retained in the repository but excluded from the rendered site; new decisions go to [decisions/](../decisions/index.md) as ADRs instead. |

## Why keep, not delete

These record *why* the project is shaped as it is. Deleting them loses provenance; promoting them wholesale into canonical docs would drown the current picture in history. The rule going forward: capture new decisions as ADRs, not as another dated plan file.
