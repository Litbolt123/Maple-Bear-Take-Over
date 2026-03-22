# Maple Bear TakeOver — Systems & Features

This document maps **behavior-pack scripts**, **major JSON systems**, and **player-facing features**. Use it as a high-level architecture guide alongside [`MECHANICS_SUMMARY.md`](tracking/MECHANICS_SUMMARY.md) (mechanical detail), [`systems/INFECTION_SYSTEM.md`](systems/INFECTION_SYSTEM.md) (infection deep dive), and [`DESIGN_VISION.md`](../design/DESIGN_VISION.md) (intent).

---

## Repository layout

| Path | Purpose |
|------|---------|
| `BP/` | Behavior pack: entities, items, blocks, recipes, scripts |
| `RP/` | Resource pack: models, textures, sounds, particles, client biomes/fog |
| `tools/` | Node.js maintenance scripts (e.g. mining block lists) |
| `docs/` | Design, development notes, reference links |

Runtime logic lives in **`BP/scripts/`** (ES modules, `@minecraft/server` + `@minecraft/server-ui`).

---

## Script modules (`BP/scripts/`)

### `main.js` (entry point)

Central orchestration: world/player events, **bear-hit and snow infection progression**, **minor/major infection timers** and symptoms, **cures** (golden apple + carrot, weakness + enchanted golden apple), **immunity**, **player death → infected bear form**, **item use** (snow, journals, potions, cure items), **milestone/day messaging**, **intro sequence**, **ground exposure** on `mb:dusted_dirt` / `mb:snow_layer`, **corruption** on infected deaths, integration with codex marking, storms, and spawn registration (e.g. dusted dirt blocks). **Narrative + flowcharts:** [`systems/INFECTION_SYSTEM.md`](systems/INFECTION_SYSTEM.md).

### `mb_infectionAudio.js`

**Spatial infection cues**: cough loops (minor vs major), **powder hiccup** on `mb:snow` use, rare **dust breath** particle, **cure sigh** sounds; respects journal **emitter** vs **hear others** sliders and per-player master volume.

### `mb_devSoundCatalog.js`

**Developer Tools** — categorized list of custom `sound_definitions.json` event IDs for the “Play sound (catalog)” journal menu.

### `mb_codex.js`

**Powdery Journal** (`mb:snow_book`) and **Basic Journal** UIs: discovery-based **codex** (mobs, items, infections, cures, symptoms), **search**, **settings** (sound volume, spawn difficulty, search toggle), **achievements** (gated until journal obtained or unlock state), **knowledge sharing** near players with the book, **Developer Tools** (debug flags, day simulation, infection inspect/adjust, spawn controller hub, storm hub, emulsifier dev actions), and **Emulsifier machine UI** when interacting with the block.

### `mb_dayTracker.js`

**World day** advancement, **milestone days** (new bear types, narrative beats), **daily event log** data for the journal, and helpers used for welcome text and post–day-25 display.

### `mb_spawnController.js`

**Maple Bear spawning**: tile/block scanning, per-type weights, day scaling, **spawn difficulty**, weather modifiers, **isolated-player optimizations**, **multiplayer batching**, Nether/End **block-based spawn surfaces**, **flying/torpedo End multipliers**, type toggles, force-spawn dev paths, **advanced scan tuning** (block query budget, max spawns/tick, range, tile intensity, blocks/tick), **presets**, **spawn speed multiplier**. **Dusted dirt** block registration and counts. **Emulsifier zones**: purification scans, fuel queue, no-spawn bubbles, persistence.

### `mb_snowStorm.js`

**Snow storms** (multi-storm capable): centers, drift, intensity, overlap boost, player exposure, shelter raycasts, block effects, mob damage, persistence across reloads, dev override and per-storm controls. Integrates with spawn (storm tiles) and main (exposure / infection-adjacent effects).

### `mb_dimensionAdaptation.js`

**Nether**: time- and variant-based **fire resistance** for bears. **End**: spawn logic is biased in `mb_spawnController.js` (flying/torpedo emphasis); this module focuses on dimension-specific **entity adaptations**.

### `mb_miningAI.js`

**Mining Maple Bears**: pathfinding, stair/spiral mining, pitfall logic, heat-seeking / cave-aware behavior, leader death promotion, block breaking budgets, interaction with shared caches.

### `mb_torpedoAI.js` / `mb_flyingAI.js` / `mb_buffAI.js` / `mb_infectedAI.js`

Specialized AI and anger/targeting for **torpedo**, **flying**, **buff**, and **infected** bears (with performance-oriented tick intervals and caching where applied).

### `mb_biomeAmbience.js`

Client-facing **ambience** hooks tied to world/biome context (fog/sky feel in infected areas — pairs with RP client biome definitions).

### `mb_dynamicPropertyHandler.js`

**Cached read/write** for player/world dynamic properties (batching, chunking for large payloads) used across scripts.

### `mb_sharedCache.js`

**Shared player and mob queries** to reduce per-tick `getEntities` / `getAllPlayers` churn across AIs.

### `mb_itemRegistry.js` / `mb_itemFinder.js`

**Modular item-use registration** and **inventory search** helpers (hotbar → inventory → offhand patterns).

### `mb_scriptToggles.js`

Compile-time or world **feature toggles** (e.g. beta storm behavior flags).

### `mb_blockLists.js` / `mb_miningBlockList.js`

**Snow placement** allow/deny sets (storm vs death/torpedo/buff behavior differ) and **minable block lists** for mining bears.

### `mb_utilities.js` / `mb_chatColors.js`

Shared helpers and **consistent chat color tokens** for UI and messages.

---

## Major non-script systems (JSON / assets)

- **Entities**: Day-tier Maple Bears (tiny, infected, buff), **flying**, **mining**, **torpedo**, infected animals, corpse/loot variants as defined under `BP/entities/`.
- **Items**: `mb:snow`, journals, cure-related consumption hooks; crafting for Powdery Journal.
- **Blocks**: `mb:dusted_dirt`, `mb:snow_layer`, **Emulsifier machine**, related placement and loot.
- **World generation**: **Overworld** infected biome replacement (requires **Custom Biomes** experiment); Nether/End use **scripted spawning on vanilla surfaces**, not `replace_biomes` in those dimensions (see [`DIMENSION_ADAPTATIONS.md`](systems/DIMENSION_ADAPTATIONS.md)).
- **RP**: Models, animations, **sounds**, **particles**, **client biome** fog/sky/water for infected biome.

---

## Player-facing feature checklist

- **Progression**: World day drives spawns, milestones, and stronger variants.
- **Infection**: Minor vs major tracks, snow tiers, symptoms, timers, ground exposure, storm exposure.
- **Cures**: Minor and major cure paths; temporary and permanent immunity; golden apple snow reduction (discoverable in codex).
- **Journal / codex**: Progressive unlocks, biome notes, daily log, achievements, search, settings.
- **Combat threats**: Multiple bear archetypes with day-gated variants; infected wildlife; buff mini-boss style bears.
- **World corruption**: Dusted dirt spread; emulsifier purification zones; custom infected overworld biome feel.
- **Storms**: Dynamic snow storms with shelter, multi-storm, and dev tuning.
- **Developer / admin**: Cheats-gated dev menus for spawn, storm, infection, AI debug flags, day control, codex reset.

---

## Related documentation

| Document | Topic |
|----------|--------|
| [`MECHANICS_SUMMARY.md`](tracking/MECHANICS_SUMMARY.md) | Detailed current mechanics |
| [`SPAWN_SYSTEM_EXPLANATION.md`](systems/SPAWN_SYSTEM_EXPLANATION.md) | Spawn algorithm |
| [`DIMENSION_ADAPTATIONS.md`](systems/DIMENSION_ADAPTATIONS.md) | Nether fire resist, End spawn bias |
| [`SNOW_STORM_DESIGN.md`](SNOW_STORM_DESIGN.md) | Storm design notes |
| [`CODEX_UNLOCKS.md`](../CODEX_UNLOCKS.md) | Every codex unlock condition |
| [`TESTING_CHECKLIST.md`](testing/TESTING_CHECKLIST.md) | Manual QA |

---

*Last updated: 2026-03-20*
