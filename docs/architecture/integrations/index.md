---
title: Integration contracts
status: current
owner: Mario
last_reviewed: 2026-07-13
---

# Integration contracts

Contracts describing how Geonest data crosses a boundary into another system. These are interface agreements — change them deliberately and in lockstep with the consumer.

| Contract | Purpose |
|---|---|
| [Firebase ↔ Streamlit](firebase-streamlit-contract.md) | Shape and access model for the Streamlit reporting/review surface reading Firebase data. |
| [PostGIS mirror](postgis-mirror-contract.md) | How captured geometry is mirrored into PostGIS for downstream GIS work. |

These were the historical `docs/reporting/` contracts, relocated unchanged.
