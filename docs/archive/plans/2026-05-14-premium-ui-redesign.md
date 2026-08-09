# Premium UI Redesign — GeoTracker

**Date:** 2026-05-14  
**Aesthetic:** Field tool / outdoorsy — bold type, earthy palette, tactical feel (Gaia GPS tier)  
**Approach:** Option A — same layouts, full visual uplift. No interaction model changes.

---

## Scope

Two pages:
1. `src/routes/+page.svelte` — Projects list
2. `src/routes/projects/[id]/+page.svelte` — Project detail (map + feature list toggle)

CSS variables in `src/app.css` updated; no new dependencies.

---

## Projects List Page

### Header
- Left: map-pin SVG icon + `GeoTracker` wordmark (`font-size: 1.375rem`, `font-weight: 800`, `#1b4332`)
- Right: `+ New Project` — pill shape (`border-radius: 999px`), `background: #1b4332`, `padding: 0.6rem 1.25rem`

### Project Cards
- `border-radius: 12px`
- Layered shadow: `0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)`
- Left accent bar: `4px` wide, `background: var(--color-primary)`, full card height, `border-radius: 12px 0 0 12px`
- Content: project name `font-weight: 700`, date `font-size: 0.8rem` muted
- Right actions: `↑ Export` as small ghost-primary pill, `✕` as icon-only ghost-danger — separated by `1px` border

### Empty State
- Large muted map-pin icon, heading + subtext + CTA centered in screen

---

## Project Detail Page

### Header Bar
- Height: `52px`, `backdrop-filter: blur(8px)`, `background: rgba(255,255,255,0.92)`, `border-bottom: 1px solid var(--color-border)`
- Left: back arrow + `Projects` text (`btn-ghost small with-icon`)
- Center: project name, `font-weight: 700`, truncated
- Right: `Features (N)` — pill badge, `background: var(--color-primary)` when list shown, ghost when map shown

### Map View
- Retain existing map logic unchanged
- GPS focus button: upgrade shadow to `0 2px 12px rgba(0,0,0,0.2)`, add `border: 1.5px solid rgba(0,0,0,0.08)`
- Center crosshair: replace `⌖` text with proper SVG crosshair (4 lines + center dot)

### Action Bar (bottom)
- `padding: 0.75rem 1rem`, `gap: 0.75rem`
- Each action button: `flex: 1`, pill shape (`border-radius: 999px`), `height: 2.75rem`, icon + label
- Point: `background: #6b7280` (slate)
- Area: `background: var(--color-primary)` (green)
- Route: `background: #2563eb` (blue)
- Undo: ghost variant, green border

### Feature List (toggle view)
- Cards: same layered shadow as project cards, `border-radius: 12px`
- Left accent bar colored by feature type:
  - `point` → amber `#f4a261`
  - `polygon` → teal `#2a9d8f`
  - `track` → blue `#2563eb`
- Feature icon: `32x32` rounded square chip, `background: <accent-color>15` (10% opacity tint)
- Feature name `font-weight: 600`, timestamp `font-size: 0.78rem` muted below
- Delete: ghost-danger pill, `font-size: 0.8rem`, right-aligned

---

## CSS Variable Additions (`app.css`)

```css
--shadow-card: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
--radius-lg: 12px;
--radius-pill: 999px;
```

No font changes (system font stack sufficient).

---

## Out of Scope
- New/edit project page
- Track/polygon/point capture sub-pages
- Dark mode
- Animations/transitions (can be added later)
