# Abandoned village jigsaw structures (Track B)

Addon data-driven jigsaws for full-structure placement via `world.structureManager.placeJigsawStructure`.

## Status (2026-06)

**Single-building plains export worldgen is archived** — not active in the dev pack. Lamps + script procedural villages remain the player-facing path.

| What | Status |
|------|--------|
| Lamp markers + script builder | **Active** — `village_marker_*`, `mb_abandonedVillageWorldgen.js`, `mb_abandonedSettlementBuilder.js` |
| Plains `.mcstructure` assets | **Kept** — `BP - Dev/structures/mb/av_plains/` (Maple Bear collab) |
| Jigsaw worldgen (test) | **Archived** — `BP - Dev/_archived/av_plains_export_worldgen_test/` |
| Script jigsaw try-first | **Off** — `JIGSAW_SCRIPT_VILLAGES_ENABLED = false` until full connected villages |

Public `BP/` keeps jigsaw **off**; mirror `_optional/abandoned_village_jigsaw_poc/` for the original POC reference.

## Archived test layout (restore for dev testing only)

| Asset | Archived path |
|-------|---------------|
| Structure files (live) | `BP - Dev/structures/mb/av_plains/*.mcstructure` |
| Jigsaw definition | `_archived/.../worldgen/structures/mb/abandoned_village_plains.json` |
| Structure set | `_archived/.../worldgen/structure_sets/mb/abandoned_village_plains.json` |
| Start pool | `_archived/.../worldgen/template_pools/mb/av_plains/start.json` |
| Processors | `_archived/.../worldgen/processors/mb/av_empty.json` |
| Scatter features | `_archived/.../features/mb/av_plains/` |

Restore steps: see README in the archive folder. Set `tools/mbAvPlainsSpawnDensity.json` → non-`off` profile, then `npm run sync:av-plains-spawn-density`.

Use `format_version` **1.26.10** and `worldgen/structures/` (not `jigsaw_structures/`).

Script order (`mb_abandonedSettlementBuilder.js`) when jigsaw returns:

1. `placeJigsawStructure("mb:abandoned_village_<ruleset>")` (currently skipped)
2. Procedural tiered settlement (hamlet / village / large)

## Export workflow

1. Build a small abandoned well or house in Creative (mossy cobble, cobwebs, no doors).
2. Use **Structure Block** → Save → `well_center.mcstructure`.
3. Place under `BP/structures/mb/av_plains/` — jigsaw pool `location` uses **`mb/av_plains/<name>`** (slash); scatter features use **`mb:av_plains/<name>`** (colon).
4. Reload world; **Force place** in dev journal or `/place structure mb:abandoned_village_plains`.

## Adding more biomes

Copy the plains trio, rename identifiers (`mb:abandoned_village_taiga`, etc.), adjust `biome_filters`, and add matching `.mcstructure` assets.

## Manifest

Requires Bedrock **1.21+** worldgen folders in the behavior pack (already used by feature rules).

## Microsoft Learn reference

Official jigsaw docs (dev pack follows these where applicable):

- [Introduction to Jigsaw Structures](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontojigsawstructures)
- [Working with Jigsaw Structures (tutorial)](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/jigsawtutorial)
- [Terrain Matching Tips & FAQ](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/terrainmatchingtips)

### How this maps to our export buildings

| Topic | MS guidance | Our choice |
|-------|-------------|------------|
| Single ruin on surface | Tutorial uses `terrain_adaptation: none`, `start_height.absolute: 0` | Same |
| Floor height vs grass | `heightmap_projection` anchors the structure origin | **`ocean_floor`** (top solid under grass) so structure Y=1 floor meets surface when Y=0 is void/ignored; processor skips exported **`grass_block`** pads |
| Slopes / hills | **`terrain_matching`** projection stacks pieces on highest point — quirks on cliffs | **`rigid`** in start pool — correct for one-piece ruins; expect some uphill clip on steep terrain |
| Water overlap | FAQ: add **`liquid_settings: apply_waterlogging`** | On `abandoned_village_plains.json` |
| Skip water entirely | `allow_underwater_placement: false` on snap | Snap fails over fluid — dry-land molang removed from scatter |
| Interior air | FAQ: **structure void** preserves existing blocks | Future export improvement — replace Y=0 air with void so grass stays under open floor cells |

| Two placement paths | **Jigsaw primary** (processors + structure_void). Scatter optional via `scatter.enabled` in spawn density config. | Same `.mcstructure` files |

### Features + structure blocks (scatter path)

Docs for the **feature_rules → scatter → structure_template** chain:

- [Introduction to Features](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/featuresintroduction)
- [Feature schema reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/examplefeatureschema)
- [Introduction to Structure Blocks](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontostructureblocks)
- [Structure command tutorial](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/structureblockscommandtutorial)

| Topic | MS guidance | Our scatter chain |
|-------|-------------|-------------------|
| Feature chain | Most worldgen decor is **scatter → … → block placer** | `feature_rule` → `scatter_export_building_grid` → **`snap_export_building`** → `random_export_building` → `place_*` |
| Vertical snap | **`minecraft:snap_to_surface_feature`** — `surface: floor`, **`allow_underwater_placement: false`** | **`snap_export_building.json`** wraps `random_export_building`; scatter uses `world_surface` Y as search hint only |
| Structure constraints | `grounded` / `unburied` / `block_intersection` on `structure_template_feature` | Exports: **`block_intersection`** + `adjustment_radius: 4` (no grounded); lamps keep grounded + intersection |
| Valid footing search | `adjustment_radius` 0–16 on structure_template | Export: **4** + surface allowlist; lamps: **6** |
| Export origin | Structure Block Save mode **default Offset Y = -1** | **`npm run shift:mcstructures`** or reset offset to **0,0,0** before export |
| Dev test placement | `/structure load … [waterlogged: Boolean]` | Journal hamlet/village/large @ feet; jigsaw export menu removed while worldgen archived |
