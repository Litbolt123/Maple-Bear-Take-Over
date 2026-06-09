# Abandoned village jigsaw POC (optional — not loaded by default)

Minecraft logs **`Invalid asset path mb/av_plains/well_center`** on world load if these JSON files are active **without** the matching `.mcstructure` file.

## Enable jigsaw (after export)

1. Export **`well_center.mcstructure`** to `BP/structures/mb/av_plains/` (Structure Block in Creative).
2. Copy this folder’s contents into the behavior pack:
   - `worldgen/structures/mb/abandoned_village_plains.json` → `BP/worldgen/structures/mb/`
   - `worldgen/template_pools/mb/av_plains/start.json` → `BP/worldgen/template_pools/mb/av_plains/`
   - `worldgen/processors/mb/av_empty.json` → `BP/worldgen/processors/mb/`
3. Reload the world.

Until then, villages use **script placement only** (`placeJigsawStructure` fails silently and procedural builder runs).

See `docs/development/ABANDONED_VILLAGE_STRUCTURES.md`.
