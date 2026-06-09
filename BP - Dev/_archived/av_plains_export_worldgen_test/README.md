# Archived: plains export building worldgen (single-piece jigsaw test)

**Removed from active dev pack** (2026-06) — this was a **testing** path for placing one exported `.mcstructure` per jigsaw roll (dense spacing, `house_2_tall` only).

**Still active in the pack:**

- **Lamp post markers** — `feature_rules/village_marker_*.json` + `structures/mb/village_marker/`
- **Script villages** — `mb_abandonedVillageWorldgen.js` + `mb_abandonedSettlementBuilder.js`
- **Export assets for Maple Bear** — `structures/mb/av_plains/*.mcstructure` (not worldgen-linked until full jigsaw villages ship)

## What was archived here

| Path | Role |
|------|------|
| `worldgen/structures/mb/abandoned_village_plains.json` | Jigsaw structure definition |
| `worldgen/structure_sets/mb/abandoned_village_plains.json` | Spawn density (was spacing 2 for testing) |
| `worldgen/template_pools/mb/av_plains/start.json` | Single-building pool |
| `worldgen/processors/mb/av_empty.json` | block_ignore processor |
| `features/mb/av_plains/*` | Scatter / snap / structure_template chain |
| `tools/mbAvPlainsSpawnDensity.json` | Snapshot of density config at archive time |
| `tools/mbAvPlainsExportPool.json` | Snapshot of export pool at archive time |

## Restore (dev testing only)

1. Copy `worldgen/` and `features/` trees back into `BP - Dev/` (merge paths).
2. Set `tools/mbAvPlainsSpawnDensity.json` → `"active": "house_2_tall_test"` (or copy from `tools/` snapshot here).
3. Run `npm run sync:av-plains-export-pool` and `npm run sync:av-plains-spawn-density`.
4. Reload dev pack + explore **new chunks**.

For full connected villages, see `docs/development/VILLAGE_STRUCTURE_COLLAB_GUIDE.md` — do not restore this single-building test as the long-term design.
