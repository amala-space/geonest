---
title: Product vision
status: current
owner: Mario
last_reviewed: 2026-07-13
---

# Product vision

## What Geonest is

A lightweight PWA / Android app that lets **non-technical field users** capture geographic data and get clean GeoJSON out, with no GIS expertise required. The core loop:

> Open project → press button → walk or tap a boundary → save → share.

Three capture primitives:

- **Point** — a single GPS or tapped location (with accuracy, timestamp, optional note/photo).
- **Area** — a polygon captured by corners or converted from a closed track.
- **Route / track** — a live GPS line recorded continuously, including screen-off, via a native Android foreground service.

Everything is captured **offline-first**: data is written locally before any network involvement, and export never requires login or connectivity. Cloud sync (Firebase/Firestore) is optional and evaluated per project.

## What Geonest is deliberately *not*

The app must **not feel like GIS**. In the field UI there are no layers, CRS settings, shapefiles, projections, or geometry jargon. Connectivity is never a prerequisite for creating or editing a field observation. These are product invariants, not incidental choices — see the enforceable consequences in [../development/conventions.md](../development/conventions.md) and the rationale in the [ADRs](../decisions/index.md).

## Who it is for

Field surveyors and conservation-style projects that operate in remote locations with unreliable connectivity, often on borrowed or shared Android devices, coordinated by an admin who owns the project and invites members via join links.

## Distribution stance

Android-first, distributable outside the Play Store (APK + install link / QR), with an installable PWA for the web. Play Store distribution is supported but optional. See [../operations/deployment.md](../operations/deployment.md).

## Related knowledge

- Terminology: [terminology.md](terminology.md)
- Original design note (historical): [../archive/design-original.md](../archive/design-original.md)
