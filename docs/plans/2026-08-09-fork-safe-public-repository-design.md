---
title: Fork-safe public repository design
status: proposed
owner: Mario
last_reviewed: 2026-08-09
---

# Fork-safe public repository design

## Goal

Publish the complete web and Android source while ensuring a fresh clone has no
production credentials, deployment identity, Android signing material, Firebase
configuration, deep-link association, or owner-specific service configuration.

## Boundary

- Keep source, tests, scripts, documentation, Gradle wrapper, Android native
  plugin, and neutral configuration templates.
- Exclude generated output, local tool state, Firebase CLI state, signing
  material, `google-services.json`, local Android SDK configuration, real
  deep-link association, and Playwright browser state.
- Make package name, Android URL host/path, Play URLs, Firebase CORS origins,
  SEO files, and the privacy policy supplied by a private deployment overlay or
  neutral templates. A fork must not inherit its upstream deployment identity.

## Android design

The tracked Android tree remains. `android/app/google-services.json` is ignored
at its actual path; it is downloaded from the fork's Firebase project. Android
signing and SDK files stay ignored. Gradle and the manifest receive neutral
defaults with explicit local/CI override points, so the source can be built by a
fork without using the production package or App Link host.

## Verification

A clean archive/copy configured as a fresh Git repository must contain the
Android source but omit every excluded file. Static checks, root tests,
functions tests, build, and strict documentation build must pass with neutral
configuration.
