---
title: Geonest documentation
status: current
owner: Mario
last_reviewed: 2026-07-13
---

# Geonest documentation

Offline-first field mapping for Android and the web. Capture GPS points, areas, and routes in the field, edit geometry, and export clean GeoJSON — online or off.

This is the **knowledge** layer (what the system is, why, how, and what was decided). It is deliberately separate from:

- **Agent instructions** — `AGENTS.md` at the repo root: a small router telling an agent how to work right now.
- **Executable checks** — `npm run check`, `npm test`, and `mkdocs build --strict` verify the rules held.

## Documentation map

| Question | Read |
|---|---|
| What is this product, and what is it deliberately *not*? | [product/vision.md](product/vision.md) |
| What do the domain terms mean? | [product/terminology.md](product/terminology.md) |
| How does the system fit together? | [architecture/overview.md](architecture/overview.md) |
| What is the local/remote data model? | [architecture/data-model.md](architecture/data-model.md) |
| How do the Firebase / PostGIS integrations behave? | [architecture/integrations/index.md](architecture/integrations/index.md) |
| Why was a technology or approach chosen? | [decisions/index.md](decisions/index.md) |
| How do I set up and run it? | [development/setup.md](development/setup.md) |
| What are the design-system and code conventions? | [development/conventions.md](development/conventions.md) |
| How do I deploy web + Android and keep SEO/deep-links working? | [operations/deployment.md](operations/deployment.md) |
| What was the original design intent / historical plans? | [archive/index.md](archive/index.md) |

## Conventions for this wiki

- Every major page carries a metadata header (`title`, `status`, `owner`, `last_reviewed`, and `related_code` where relevant) so stale knowledge is visible.
- Meaningful decisions are recorded as immutable [ADRs](decisions/index.md). A decision is changed by adding a new ADR that supersedes the old one, never by editing history.
- Documentation changes travel with the code change that caused them (see the PR template's *Documentation impact* section).
- `mkdocs build --strict` in CI fails on broken internal links and missing navigation entries.
