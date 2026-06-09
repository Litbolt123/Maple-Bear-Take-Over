# Abandoned settlements (100% zombie villages)

Maple Bear worlds use **only** Minecraft-style **abandoned villages** (zombie villages): cobwebs, mossy stone, no doors/torches, zombie villagers — not a mix of normal and abandoned.

## Why not “pure” vanilla?

Bedrock/Java pick abandoned villages with a **~2% random roll** when a village generates. Addon JSON **cannot** change that roll (legacy jigsaw villages are not data-driven). So the pack:

1. **Turns off** vanilla village generation (`BP/biomes/worldgen_no_village/` — no `minecraft:village_type`).
2. **Lamp post markers** only via worldgen (`BP/feature_rules/village_marker_*.json`). Old **barrel/cobweb ruin scatter** rules are archived under `BP/_archived/feature_rules/abandoned_settlement_worldgen_ruins/` (not active).
3. **Cannot** place legacy vanilla zombie villages through `placeJigsawStructure` — IDs like `minecraft:village_plains` return *Invalid structure name*.
4. **Script layer** builds tiered hamlets/villages on **loaded** chunks at the **simulation edge**, with optional **addon jigsaw** (`mb:abandoned_village_*`) when structure files exist.

See also: [ABANDONED_VILLAGE_STRUCTURES.md](./ABANDONED_VILLAGE_STRUCTURES.md) (custom jigsaw POC).

## What the pack does

| Layer | What |
|--------|------|
| **Biomes** | `worldgen_no_village/*.biome.json` — strips `minecraft:village_type`. |
| **Feature rules** | `feature_rules/village_marker_*.json` — lamp posts on the site grid only (no ruin scatter). |
| **Scripts** | `mb_abandonedVillageWorldgen.js` — scan, rolls, processor, zombify. |
| **Scripts** | `mb_abandonedSettlementBuilder.js` — tiers, phased placement, jigsaw try-first. |
| **Scripts** | `mb_villagerSpawnPolicy.js` — living villagers removed; zombie villagers kept. |

## Exploration distance (horizon placement)

Scripts only edit **loaded** chunks (client simulation distance, often ~4–14 chunks).

| Setting | Default | Notes |
|---------|---------|--------|
| Scan radius | **12** chunks | World property `mb_av_scan_radius` (4–16) |
| Min distance from player | **scan − 1** | Outer loaded **shell** preferred |
| Attempts per scan | **1–3** | Scales with **player count** + spawn load (see `mb_abandonedVillagePerf.js`) |
| Scan interval | **20–80** ticks | Stretches with lag comfort, wall stress, mob pressure (same probes as spawn) |

Settlements appear at the **edge of loaded terrain** so you see paths/roofs ahead while walking.

## Settlement tiers (seed-stable)

Per winning chunk roll, `getSettlementTier` picks:

| Tier | ~Frequency (far from infected) | Layout |
|------|--------------------------------|--------|
| **Hamlet** | ~70% | Well + plaza; **3 houses** + **weaponsmith** + **market** (10% cartographer/shepherd instead of a house) — no church/pen |
| **Village** | ~25% | Houses + **smithy**, **farm**, **pen**, **fisherman/fletcher/shepherd** work slots, **librarian**, **church** (6 variants), **market** |
| **Large** | ~5% | More houses, core work buildings + **2** rolled extras from 15 professions, church, market, animal pen |

Near **large/medium infected** snow, weights shift toward village/large.

**Phased build:** ~12 block edits/tick (adaptive down to ~4–5 under heavy load), incremental structures — avoids watchdog hangs.

**Performance (aligned with spawn / mining):** `mb_abandonedVillagePerf.js` reads `getPlayerThriftTier`, `getSpawnBlockBudgetScale`, wall/mob probes, and `shouldDeferVillageBurst` (villager chunk load, work-spread). Multiplayer: **one horizon scan per tick** (rotates players); lamp arrivals still run for everyone. Ruin processor block budget scales with world load.

**Job-site blocks** (anvil, loom, composter, etc.) are placed only via `placeInteriorBlock` — inside **houses** (per floor plan), **smithy**, **farm**, or **market** footprints, never on paths or open grass.

## Chest & barrel loot (`mb_villageChestLoot.js`)

All storage uses vanilla **`chests/village/village_*`** tables via `/loot`, with **script fallbacks** (spread slots) when the command fails. Remap is centralized — work/church plans get tables in **`applyStructureLootToPlan`** when `getWorkBuildingPlan` / `getChurchPlan` runs.

| Category | Table / behavior |
|----------|------------------|
| **Biome houses** | `village_plains_house`, `village_desert_house`, `village_savanna_house`, `village_taiga_house`, `village_snowy_house`; jungle → plains house |
| **House variants** | Workstation-themed when layout has loom/smoker/grindstone/etc. (e.g. loom → shepherd); ~18% sprinkle of armorer/weaponsmith/fletcher/fisherman/mason on generic layouts |
| **Infected ruleset** | Taiga house + optional `mb:snow` in fallback pool |
| **Snowy ruleset** | `village_snowy_house` + snowballs / snow blocks / ice / powder snow in chests & barrels |
| **Farmer / greenhouse** | Butcher + plains (crops) |
| **Butcher / bakery** | Butcher |
| **Smith line** | Weaponsmith / toolsmith / armorer |
| **Librarian / school** | Plains + book-heavy fallback (no vanilla librarian chest) |
| **Cleric / brewery** | Temple |
| **Market hall** | Cartographer + butcher stalls; **plaza stall barrels** → butcher |
| **Trading post** | Armorer chest + butcher/toolsmith barrels (not all cartographer) |
| **Church** | Temple (altar); cathedral upper → librarian |
| **Prison cell** | Sparse plains/generic fallback |
| **Cellars / basements** | Honey bottles, preserved meat/fish, crops, pie, **ice** (script pool; barrel + chest under hatch) |
| **Blacksmiths** (weaponsmith, toolsmith, armorer) | Mostly **iron** tools/ingots; **~4%** diamond tool on fallback, **~3.5%** after vanilla fill; **obsidian** ~12–14% |

After edits: **clear abandoned village site registry** (dev menu) or use a fresh chunk so chests refill with the new tables.

## Roofs and roof access

After walls, a dedicated **`roof`** build phase places seed-stable profiles from each plan’s `roofStyle` (or resolver fallbacks in `mb_abandonedSettlementBuilder.js`):

| Style | Typical use | Shape |
|-------|-------------|--------|
| **`peaked`** | Most houses, churches | Full-block (plank/cobble) A-frame over the **whole** footprint: plank layers + stair slopes (normal + upside-down), log ridge |
| **`shed`** | Shed rows, butcher, some smithies | Mono-pitch across the footprint (high side opposite the door) |
| **`flat`** | Some farms, desert rolls | Single **full block** cap (plank/cobble) + ruin holes |
| **`steeple`** | Large churches | Peaked + taller center stack |

**Rooftop deck** (~26% of 1-story houses, ~50% of multi-story): fence rail on the crown, 2×2 plank platform, optional mast. **Access:** interior ladder column (2-story shaft or 1-story deck) — **early pass** ~0.4s after build, then **again** when the ruin processor finishes (aging pass can strip rungs). **Exterior** supported stair run on the door flank when a deck exists or the building is multi-story. Dev single-build: **Gable house** (plan 14), **Roof deck** (forced lookout + stairs/ladders).

## Rulesets (materials)

| Ruleset | Biomes | Materials |
|---------|--------|-----------|
| `plains` | plains, meadow, sunflower | Oak |
| `desert` | desert | Sandstone |
| `savanna` | savanna | Acacia |
| `jungle` | jungle, bamboo jungle | Jungle |
| `taiga` | taiga, cold/mega taiga | Spruce |
| `ice` | ice plains, spikes, frozen peaks | Spruce + **packed ice** paths (not mb-snow themed) |
| `snowy` | snowy plains/taiga | Spruce / cobble (vanilla snowy look; not mb-snow themed) |
| `infected` | `mb:infected_biome_*` | Spruce + **`mb:dusted_dirt`** pads |

## Spawn frequency (hybrid site grid)

Pre-planned **site anchors** every **384 blocks**. Full **script villages** activate on the horizon ring — not per-chunk rolls.

### On infected Maple Bear biomes (script)

| Biome | Abandoned village chance |
|-------|---------------------------|
| **Large** infected | **3 guaranteed slots** per ~384-block grid cell (up to **3 builds per scan tick** while exploring) |
| **Medium** infected | **50%** per site cell |
| **Small** infected | **~1%** per site cell |

### Village lamp markers (worldgen)

Tall **lamp posts** (your `.mcstructure` exports) generate on the **same 384-block grid** as script villages so players can see a landmark when terrain loads, before sim-distance village build.

**At the lamp (≤56 blocks, Chebyshev):** structure/jigsaw artifacts are cleared, then a **script village is queued** (seed roll skipped; biome read at the lamp). Standing on the post counts — there is no “too close” dead zone. If that cell was already built, nothing new spawns. After a **script reload** (empty in-memory registry), `reconcileBuiltSiteFromWorldNearLamp` + `findBuiltSiteNearWorld` (~88 blocks) prevent a second hub on top of existing ruins.

| Biome / tag | Lamps per 384-block cell | Lamp structure |
|-------------|--------------------------|----------------|
| `plains`, `meadow`, `sunflower_plains` | 1 at (+64, +64) | **Oak** |
| `savanna` | 1 at (+64, +64) | **Warm** (acacia) |
| `jungle` (incl. bamboo jungle) | 1 at (+64, +64) | **Rain** (jungle wood) |
| `desert` | 1 at (+64, +64) | **Hot** (`hot_lamp_post` / `mb:village_marker/hot_lamp_post`) — `village_marker_desert_slot0.json` |
| `infected_biome_large` | 3 (X +64 / +192 / +320, Z +64) | **Cold** (spruce) |
| `infected_biome_medium` | 1 at (+64, +64), **50%** scatter | **Cold** |

Structures: `BP/structures/mb/village_marker/*_lamp_post.mcstructure`. Rules: `BP/feature_rules/village_marker_*.json`. Script **`jungle`** ruleset builds abandoned villages in jungle biomes; anchors still **jitter within ~40 blocks** of `lampMarkerWorldPosition()` in `mb_abandonedVillageSites.js`.

### Elsewhere (proximity to infected snow)

| Region | ~1 site per N grid cells |
|--------|---------------------------|
| Far from infected | **~48** |
| Near small/medium/large (not standing in infected) | **~22 / ~12 / ~6** |

**No worldgen barrel ruins** in infected biomes (archived `feature_rules` — script hamlets only).

Built/failed sites: `mb_av_village_sites`. **Clear cache** in debug resets.

**Verbose logging:** **Abandoned village debug → Content Log ON** — `[ABANDONED VILLAGE]` every scan tick.

Toggle: **Script toggles → Abandoned village placement**.

## Placement order

1. `placeJigsawStructure("mb:abandoned_village_<ruleset>")` if pack structure exists.
2. Procedural builder (`script:ruin_settlement`, tiered).
3. Abandoned block processor + delayed zombify in bounding box.

## Water, ice, and piers

- **Village center** may be **land/ice** or a **pier deck** over water: `analyzeColumn` places log **poles** down to solid ground (max 12 blocks), then paths/structures build on the deck (`resolveColumnFloorY`).
- Lake **lamp arrival** tries pier at the post first, then dry shore in rings (`resolveSettlementCenterNearLamp`). Failed lamp sites **clear and retry** while you stay at the post (no permanent fail loop).
- If the anchor is wet, `resolveSettlementCenter` also seeds the **lamp** position and allows high water % when the hub is a pier.
- **Over water elsewhere:** paths and buildings use **log poles** down to solid ground (max ~12 blocks), then mossy path / floors on the deck.
- **Savanna (acacia):** farm plots on dry land get **irrigation**; savanna **well** is water only when the center column is land (not a pier).

## Hybrid site registry

| Piece | Module |
|-------|--------|
| Grid + rolls + persistence | `mb_abandonedVillageSites.js` |
| Horizon scan + build | `mb_abandonedVillageWorldgen.js` |

Same as before: live **biome** check, **center not on water** (ice OK), **piers** on water at edges, phased builder, jigsaw try-first.

## How to find them

1. **New terrain** in village-eligible biomes.
2. Walk so **new** chunks load at the horizon; do not stand still on one chunk.
3. **Dev:** **Abandoned villages (debug)** → Hamlet / Village / **Large** / **Single building…** (house, smithy, farm, market, church, pen); Content Log `[ABANDONED VILLAGE]`. **Infected** prepaves **`mb:dusted_dirt`**. **`mb:snow_layer`** after build: **snowy** ruleset always (when day factor allows); **taiga / ice / mega & redwood taiga** never; other rulesets optional ~34% × day (`settlementRollsMbSnowSprinkle(ruleset, …)`). **Lamp on lakes:** pier-capable footing search. Dev reset: clear site slot / force place.
4. **Clear chunk cache** in debug menu after script updates on an old world.

## Regenerating biome overrides

```bash
node tools/generateNoVillageBiomeOverrides.js
```

Commit `BP/biomes/worldgen_no_village/` and `BP - Dev/biomes/worldgen_no_village/`.

## Performance (structure / footing search)

Placement defers heavy work off the 20-tick scan (`pendingActivations`). Cost hotspots and mitigations:

| Area | What it does | Optimization |
|------|----------------|---------------|
| `resolveSettlementCenter` | Ring of `getBlock` column probes per try | Narrow Y scan with `hintY` on infected; **column cache** per placement; try **lamp grid** + site anchor before spiral |
| `getInfectedProximityTier` | ~29×29 biome reads per call | **Per-scan cache** (cleared each `scanPlayersForVillageSites`) |
| `collectActivatableSitesNearPlayer` | Grid loop + biome per slot | Tighter gx/gz bounds; **prox cache** per chunk; skip extra large slots when player is in-cell but not on large infected |
| Build phase | `cachedFloorY` during phased build | Already cached per job |

Tuning: lower `mb_av_scan_radius` (world property) reduces horizon work; keep `CHUNKS_PER_SCAN_TICK` at 3.

## Troubleshooting

1. **Old logs (1/14 rolls, taiga in plains)** — sync latest scripts; clear chunk cache.
2. **`place featurerule` fails from script** — expected on some builds; script builder is the main path.
3. **Jigsaw `minecraft:village_*` invalid** — expected; use `mb:abandoned_village_*` or procedural fallback.
4. **Biome** — Must match a ruleset (plains/desert/savanna/taiga/snowy/**ice**/infected).
5. **Toggle** — `abandoned_village_worldgen` must be ON.

## Floor plan catalog (`mb_settlementStructures.js`)

**70 house variants** (`HOUSE_VARIANT_COUNT = 70`), rolled per slot via **`pickHouseVariantIndex(ruleset, cx, cz, salt)`**. Indices **0–49** are universal (L/T/U/H, courtyard, octagon, dogtrot, etc.); **50–69** are **biome-exclusive** shells (desert riad, jungle stilt lodge, taiga longhouse, infected spire, meadow bloom court, …) chosen ~45% of the time when the ruleset has a pool.

### Engine fields (builder reads these in `mb_abandonedSettlementBuilder.js`)

| Field | Effect |
|--------|--------|
| `occupied(lx,lz,w,d)` | Non-rect footprints: L/T/U/H, courtyard void, cross nave, octagon, arcade |
| `appendages[]` | Porches, **stilt decks**, forge patios, bell towers, **mill wheels**, dock porches, chimneys (`role`: porch / bell_tower / stilt_deck / forge_patio / …) |
| `basementDepth` + `basementFloor` + `basementHatch` | Carved cellar under shell |
| `roofStyle` | `flat` / `shed` / `peaked` / `steeple` — extra slab layers |
| `facade` | Door arch (stairs), columns, gable trim |
| `wallHAt(lx,lz)` | Taller aisle / tower cells |
| `stories` + `midFloorLevels` | 2–3 story shells, multi mid-floor passes |
| `partitions` | Vertical **or** horizontal interior walls |

### House groups (index ranges)

| Range | Group | Examples |
|-------|--------|----------|
| 0–11 | Core refreshed | small/medium/wide/narrow, loft, **L-wing (11)** |
| 12–19 | 2-story + wide | two_story_a–d, courtyard **(15)**, shed, long_hall |
| 20–26 | Cottages | thatch, hermit, beekeeper, porch, chimney |
| 27–31 | Row / terrace | 2-bay, 3-bay, shopfront, dormer, duplex |
| 32–37 | Farm & rural | **dogtrot (32)**, T-farmhouse, barnhouse, granary |
| 38–42 | Manor & inn | H-plan, U-plan, library wing, tavern, merchant |
| 43–48 | Multi-story | 3-story townhouse, tower house, split-level, attic |
| 49 | Cellars | root cellar, smith cellar, crypt house |
| **50–69** | **Biome-exclusive** | desert riad, savanna kraal, jungle stilt, taiga longhouse, icy sod roof, infected spire, meadow bloom court, … |

Rolling: **`pickHouseVariantIndex`** — biome pool when ruleset matches, else shaped universal bias (~33%), else any universal 0–49.

### Work buildings (25+ footprints)

Core professions each have **1–3 variants**; **`getWorkBuildingPlan`** prefers shaped plans (~58%) when `occupied` or `appendages` exist. Biome-tagged work (e.g. **`farmer_desert_yard`**) filter by `rulesets`.

Added: bakery, brewery, apiary_shed, hunter_lodge, mill_ruin, schoolhouse, town_hall, prison_cell, greenhouse_ruin, trading_post.

Church via **`getChurchPlan(ruleset, roll)`**: chapel_small, chapel_stone, church_cross, church_belltower, cathedral_ruin (crypt basement), desert_shrine.

### Dev single-build menu

**Journal → Abandoned villages → Single building** includes courtyard, cellar, L-wing, dogtrot, **desert riad / jungle stilt / taiga longhouse / infected spire**, bakery, schoolhouse, trading post, town hall, greenhouse, cathedral (forced roll), plus existing smithy/farm/market/church.

**After script updates:** clear site registry in debug so new plans appear on **new** horizon builds.
