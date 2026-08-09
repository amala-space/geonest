## My recommendation

For your projects, I would use a **docs-as-code knowledge base built with Material for MkDocs**, stored alongside the code, but deliberately separated from agent instructions.

The important distinction is:

* **Wiki:** explains what the system is, why it exists, how it works, and what decisions were made.
* **Agent instructions:** tell an agent how to work right now.
* **Executable checks:** verify whether the agent actually followed the rules.

Trying to squeeze all three into one enormous `AGENTS.md` creates a swamp of commandments. The agent reads it, nods solemnly, then forgets half of it while crossing the context window.

## The architecture I would use

```text
project/
├── AGENTS.md
├── README.md
├── docs/
│   ├── index.md
│   ├── product/
│   │   ├── vision.md
│   │   ├── terminology.md
│   │   ├── user-flows.md
│   │   └── requirements.md
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── components.md
│   │   ├── data-model.md
│   │   ├── data-flow.md
│   │   └── diagrams/
│   ├── decisions/
│   │   ├── 0001-use-firestore.md
│   │   ├── 0002-offline-first.md
│   │   └── index.md
│   ├── development/
│   │   ├── setup.md
│   │   ├── commands.md
│   │   ├── testing.md
│   │   ├── conventions.md
│   │   └── release-process.md
│   ├── operations/
│   │   ├── deployment.md
│   │   ├── monitoring.md
│   │   └── troubleshooting.md
│   └── generated/
│       ├── database-schema.md
│       └── api-reference.md
├── mkdocs.yml
├── scripts/
│   ├── validate-docs.sh
│   └── generate-docs.sh
└── src/
```

Material for MkDocs gives you Markdown source, navigation, full-text search, diagrams, cross-references, and a pleasant static website without turning documentation into its own software product. It can also be built for offline use. ([GitHub Pages][1])

## What should remain in `AGENTS.md`

Keep it remarkably small. Think of it as a **router**, not an encyclopedia.

```markdown
# Project agent guide

## Before changing code

1. Read `docs/index.md`.
2. Read `docs/architecture/overview.md`.
3. Read any documentation linked from the module being changed.
4. Check `docs/decisions/` for relevant architectural decisions.

## Required commands

- Install: `npm ci`
- Validate: `npm run check`
- Test: `npm test`
- Build: `npm run build`

## Rules

- Do not introduce a new dependency without explaining why.
- Preserve offline-first behaviour.
- Database schema changes require a migration.
- Any user-visible behaviour change must update the relevant documentation.
- New architectural decisions require an ADR in `docs/decisions/`.

## Definition of done

- Implementation complete.
- Tests added or updated.
- Validation commands pass.
- Relevant documentation updated.
- No undocumented architectural decision introduced.
```

Codex officially supports hierarchical `AGENTS.md` files, including more specific files in subdirectories. Claude Code similarly supports scoped rules under `.claude/rules/`, while GitHub Copilot supports path-specific instruction files. In other words, the current direction across agent tools is **small, scoped, progressively loaded guidance**, not one enormous universal prompt. ([OpenAI Developers][2])

For example:

```text
src/
├── AGENTS.md
├── backend/
│   └── AGENTS.md
└── frontend/
    └── AGENTS.md
```

The backend file might mention database migrations and API conventions. The frontend file might mention accessibility, component patterns, and state management. The root file should not contain either in detail.

## Why your repo instructions probably did not work

### 1. Instructions were mixed with knowledge

Agents handle concrete rules better than descriptive essays.

Weak:

> The application follows an offline-first philosophy and was originally created because conservation projects frequently operate in remote locations...

Better:

> Do not make network connectivity a prerequisite for creating or editing field observations.

The background belongs in `docs/product/vision.md`. The enforceable consequence belongs in `AGENTS.md`.

### 2. Everything was loaded for every task

An instruction about Firestore migration strategy is noise while adjusting a button. An instruction about Android permission flows is noise while modifying the backend.

Scoped instructions reduce the amount of irrelevant context competing for attention. Claude’s current documentation explicitly recommends moving procedures out of the general project memory and into scoped rules or skills. Codex skills use progressive disclosure, loading their full contents only when relevant. ([Claude Platform Docs][3])

### 3. The instructions said what to do, but not how to verify it

“Follow the architecture” is atmospheric fog.

“Run `npm run architecture:test` and do not create imports from `domain` into `ui`” is verifiable.

Where possible, turn prose into:

* linters
* type checks
* schema validation
* unit tests
* dependency-boundary tests
* documentation link checks
* PR checklist items

Agents are much more reliable when failure becomes a red terminal line rather than a philosophical disagreement.

### 4. The documentation had no retrieval structure

Agents do not benefit much from a folder containing fifteen loosely named Markdown files. Give them a map:

```markdown
# Documentation map

| Question | Read |
|---|---|
| What is this product? | `product/vision.md` |
| What terms mean | `product/terminology.md` |
| How the system fits together | `architecture/overview.md` |
| Why a technology was chosen | `decisions/` |
| How to run it | `development/setup.md` |
| How to deploy it | `operations/deployment.md` |
```

Every major document should also begin with metadata:

```yaml
---
title: Offline synchronization
status: current
owner: Mario
last_reviewed: 2026-07-13
related_code:
  - src/sync/
  - src/storage/
---
```

That small header makes stale knowledge visible to both you and agents.

## Use ADRs for decisions, not a changelog of thoughts

Architecture Decision Records are particularly valuable for agent-driven development.

Each ADR should answer:

```markdown
# ADR-0004: Store raw field observations locally first

## Status

Accepted

## Context

Field users may lack stable connectivity.

## Decision

All observations are committed to the local database before synchronization.

## Consequences

- Creating observations never waits for the server.
- Sync conflicts must be explicitly resolved.
- Server-only validation cannot block local capture.

## Supersedes

None
```

This prevents an agent from “improving” the project by quietly reversing a deliberate decision six months later.

Keep ADRs immutable after acceptance except for corrections. When a decision changes, add a new ADR that supersedes the old one. The wiki then becomes the project’s fossil record, only significantly more useful than fossils.

## Maintenance should be part of code changes

The wiki will decay unless documentation updates are attached to development.

Add this to your pull request template:

```markdown
## Documentation impact

- [ ] No documentation affected
- [ ] Existing documentation updated
- [ ] New architecture decision recorded
- [ ] Generated documentation refreshed

Relevant pages:
```

Then add CI checks for:

* broken internal links
* missing navigation entries
* invalid Mermaid diagrams
* stale generated API/schema docs
* files missing required metadata
* code paths referenced by docs that no longer exist

AI can propose documentation updates, but it should not silently publish them. Recent research on agent-authored documentation found that these changes often receive very little human modification, which raises legitimate quality-control concerns. ([arXiv][4])

## What should be generated automatically

Generate facts that the code already knows:

* OpenAPI reference
* database schema
* CLI command reference
* configuration options
* environment variable inventory
* dependency graph
* event or message schemas
* package/module index

Write manually:

* product intent
* architecture narrative
* trade-offs
* domain terminology
* operational lessons
* ADRs
* unusual constraints
* examples of correct behaviour

Generated prose about architecture can be useful as a draft, but it should not become canonical merely because an LLM said it confidently. Emerging systems such as RepoDoc and CodeWiki show that repository-level and incremental documentation generation is improving, particularly when based on structural relationships rather than flat file summaries, but this area is still evolving. ([arXiv][5])


## Should you add RAG or an MCP documentation server?

Not initially.

Markdown inside the repository already gives coding agents:

* exact source files;
* Git history;
* grep/search;
* nearby code context;
* branch-specific documentation.

A vector database can actually make matters worse by retrieving semantically similar but outdated fragments.

Add a documentation MCP server only when:

* knowledge spans many repositories;
* some knowledge lives outside Git;
* access permissions differ;
* agents cannot inspect the full documentation tree;
* you need structured queries such as “show all accepted decisions affecting synchronization.”

MCP can expose documentation as model-readable resources, reusable prompts, and executable tools, but it should be an access layer over canonical sources, not another place where knowledge must be maintained. ([Model Context Protocol][8])

## The practical setup I would implement

For a project such as GeoNest:

1. Put canonical documentation in `/docs`.
2. Render it with Material for MkDocs.
3. Keep the root `AGENTS.md` under roughly 100 lines.
4. Add module-specific `AGENTS.md` files only where behaviour materially differs.
5. Maintain ADRs for meaningful technical or product decisions.
6. Generate schemas and API references from source code.
7. Add documentation checks to CI.
8. Require every substantial task to state which docs were consulted and which were updated.
9. Create reusable agent skills for procedures such as:

   * implementing a feature;
   * changing the data model;
   * preparing a release;
   * reviewing offline behaviour;
   * updating documentation.

The resulting flow becomes:

```text
Task arrives
    ↓
Agent reads root instructions
    ↓
Agent follows documentation map
    ↓
Agent loads only relevant project knowledge
    ↓
Agent performs scoped procedure
    ↓
Tests and checks enforce invariants
    ↓
Documentation changes travel with code changes
```

That is the crucial shift: **do not try to make the wiki itself control the agent**. Let the wiki provide knowledge, let small instruction files route the agent, and let automation police the borders.

[1]: https://squidfunk.github.io/mkdocs-material/?utm_source=chatgpt.com "Material for MkDocs"
[2]: https://developers.openai.com/codex/guides/agents-md?utm_source=chatgpt.com "Custom instructions with AGENTS.md – Codex"
[3]: https://docs.anthropic.com/en/docs/claude-code/memory?utm_source=chatgpt.com "How Claude remembers your project - Claude Code Docs"
[4]: https://arxiv.org/abs/2601.20171?utm_source=chatgpt.com "Who Writes the Docs in SE 3.0? Agent vs. Human Documentation Pull Requests"
[5]: https://arxiv.org/abs/2604.26523?utm_source=chatgpt.com "RepoDoc: A Knowledge Graph-Based Framework to Automatic Documentation Generation and Incremental Updates"
[6]: https://www.gitbook.com/?utm_source=chatgpt.com "GitBook: The knowledge layer for AI"
[7]: https://docusaurus.io/docs/versioning?utm_source=chatgpt.com "Versioning"
[8]: https://modelcontextprotocol.io/specification/2025-06-18/server/resources?utm_source=chatgpt.com "Resources"
