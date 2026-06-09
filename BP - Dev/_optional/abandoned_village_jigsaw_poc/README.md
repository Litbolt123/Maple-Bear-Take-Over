# Abandoned village jigsaw (reference copy)

**Active worldgen lives in `BP - Dev/worldgen/`** when testing — this folder is a mirror for docs / release merge.

## Plains test set (8 pieces)

All `.mcstructure` files under `structures/mb/av_plains/`:

| File | Role |
|------|------|
| `plains_house_1.mcstructure` | House |
| `plains_house_2_tall.mcstructure` | House (tall) |
| `plains_house_3.mcstructure` | House |
| `plains_smithy.mcstructure` | Smithy |
| `plains_bakery.mcstructure` | Bakery |
| `plains_librarian_study.mcstructure` | Librarian |
| `plains_church_cathedral_ruin.mcstructure` | Church |
| `plains_farmhouse.mcstructure` | Farm |

## Spawn frequency (test)

`structure_sets/mb/abandoned_village_plains.json`: **spacing 2**, **separation 1** (~one site per 2-chunk grid — max practical density).

## Behavior

- Each worldgen site picks **one random** building from the start pool (exports have no jigsaw connectors yet).
- **Multi-building hamlets** need a hub `.mcstructure` with jigsaw blocks + side pools — future step.
- **BP - Dev:** `JIGSAW_SCRIPT_VILLAGES_ENABLED` follows dev tools — script tries `placeJigsawStructure("mb:abandoned_village_plains")` before procedural fallback.
- **New chunks only** — use a fresh world or explore ungenerated terrain.

See `docs/development/ABANDONED_VILLAGE_STRUCTURES.md`.
