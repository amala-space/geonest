---
title: Terminology
status: current
owner: Mario
last_reviewed: 2026-07-13
related_code:
  - src/lib/db.ts
---

# Terminology

Shared vocabulary for Geonest. Where a term maps to a concrete type, the authoritative definition lives in `src/lib/db.ts`; this page explains intent.

| Term | Meaning |
|---|---|
| **Project** | The top-level container a user creates. Holds features and (optionally) members. Carries `createdByUid` to distinguish the creator from invited members. |
| **Feature** | A saved geo-object (`FeatureRecord`): a point, polygon, or track with geometry plus properties. |
| **Point** | A single location. GeoJSON `Point`. Capture source `manual_point`. |
| **Area** | A polygon. GeoJSON `Polygon`, auto-closed, minimum 3 corners. Capture source `polygon_corners` (or converted from a closed track). |
| **Track / Route** | A recorded GPS line. GeoJSON `LineString`. Capture source `live_track`. Recorded by the native Android foreground service. |
| **Track point** | A single sample within a live track (`lon`, `lat`, `accuracy`, `timestamp`). |
| **Capture source** | `FeatureRecord.properties.source`, constrained to the `FeatureSource` union: `manual_point`, `polygon_corners`, `live_track`. New sources require extending the union first. |
| **Capture mode** | How the user places geometry: **GPS mode** (use the device location) vs **click/tap mode** (place on the map). |
| **Profile / Surveyor profile** | A named identity for a person doing fieldwork on a device, enabling multi-user teams on shared hardware. |
| **Member / Membership** | A user's access to a project, stored at `projects/{projectId}/members/{uid}` with `role: 'admin' | 'member'`. |
| **Join link / Invite** | A revocable, token-gated link (and QR code) an admin shares so surveyors can join a project. |
| **Cloud sync eligibility** | Per-project `cloudSyncEnabled` flag deciding whether a project pushes/pulls to Firestore. See [../decisions/0005-per-project-cloud-sync-eligibility.md](../decisions/0005-per-project-cloud-sync-eligibility.md). |
| **Basemap** | The map tiles rendered under captured geometry (MapLibre GL + Protomaps PMTiles). |
