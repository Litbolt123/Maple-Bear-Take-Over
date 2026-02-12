# Snow Storm Design – “Dust Storm” Style with Block Placement

## Goal

A **snow storm** that behaves like a dust storm: reduced visibility (foggy), snow/dust particles in the air, and **snow layers accumulating** in a defined area at random positions during the storm. Inspired by Raboy’s Zombie Apoc dust storms, but with **block placing** (snow layers) in addition to atmosphere.

---

## Integration vs New System

### What we already have

| Piece | Where | Reusable? |
|-------|--------|------------|
| **Snow layer placement rules** | `main.js` – `tryPlaceSnowLayerUnder`, torpedo death, buff bear, spawn controller | **Yes** – same rules: no stacking on snow, replace grass/small blocks via `SNOW_REPLACEABLE_BLOCKS` / `SNOW_TWO_BLOCK_PLANTS` from `mb_blockLists.js`. |
| **Particles** | `mb:white_dust_particle`, `dimension.spawnParticle()`, `particle minecraft:snowflake` / `ash` | **Yes** – reuse white dust or add a dedicated “snow storm” particle. |
| **Weather** | `mb_spawnController.js` – `weatherChanged`, `detectWeatherFromAPI` (rain/thunder/clear) | **Optional** – could trigger storms when vanilla rain in overworld, or keep storms fully script-driven. |
| **Fog** | RP only – `mb:infected_biome`, `mb:dusted_plain` in biomes; **Script API cannot set fog** (see knowledge doc). | **Limited** – fog is biome/volume driven; we can’t turn fog on/off from script per player. |
| **“Area” / region** | Spawn controller uses chunks (128×128) and “near players”; no generic world region (AABB/biome) system. | **New** – storm needs a defined “zone” (see below). |

### Recommendation

- **New script module**: e.g. `mb_snowStorm.js` (or `mb_storm.js`) so spawn controller and main don’t get overloaded. This module owns:
  - When a storm is active (random start/cooldown).
  - Where it applies (area definition).
  - Spawning particles and placing snow in that area.
- **Reuse**:
  - Snow placement **logic** (same rules as `tryPlaceSnowLayerUnder` / torpedo/buff): either a **shared helper** in `main.js` or `mb_utilities.js` that takes `(dimension, x, y, z)` and “place one snow layer here if valid,” or call into logic that respects `SNOW_REPLACEABLE_BLOCKS` and “no snow on snow.”
  - Existing particles: `mb:white_dust_particle` and/or `minecraft:snowflake` / `ash` for “snow” in the air.
- **Fog**: Either (1) only in **infected biome** (fog already there; storm = particles + placement there), or (2) **blindness** effect (short duration, refreshed while in storm) to fake reduced visibility elsewhere, or (3) document that “foggy” is biome-only and storms are particles + accumulation only outside that biome.

So: **one new system (storm controller)** that **integrates** with existing snow placement rules and particles; area definition is new; fog is constrained by engine.

---

## Area: “Certain part of the world”

Options (easiest first):

1. **Per-player radius**  
   Storm is “active” globally or per dimension, but **snow placement and particles** only happen within **X blocks of each player** (e.g. 48–64). No fixed world box; “section” = dynamic around players. Easiest and works everywhere.

2. **World box (AABB)**  
   Configurable `minX, minZ, maxX, maxZ` (and optionally `minY, maxY`) in overworld. Storm only places snow / spawns particles inside that box. Good for “this biome/region only” without biome API.

3. **Biome-based**  
   When a player is in `mb:infected_biome` (or a list of biomes), they’re “in the storm zone.” Combines well with existing infected biome fog. Requires `dimension.getBiome(location)` (you already use this in main.js for biome checks).

4. **Hybrid**  
   Storm has a world box **and** only affects players in that box (or in a biome in that box). Combines 2 and 3.

Starting with **1 (per-player radius)** keeps implementation simple and “random in the certain area” means “random positions near each player.” We can add 2/3/4 later via config.

---

## Random placement in the area

- **When**: During “storm active,” every **N seconds** (e.g. 5–15), run a placement pass.
- **Where**: For each player in the dimension (and in the storm zone if we add box/biome):
  - Pick **random offsets** within the radius (e.g. ±32 blocks X/Z from player).
  - For each offset, get **top solid block** (like spawn controller / torpedo), then try to place a snow layer **above** it using the **same rules** as `tryPlaceSnowLayerUnder`: no snow on snow, replace grass/small plants with snow, etc.
- **How many per pass**: Cap (e.g. 1–3 placements per player per pass) so it feels like gradual accumulation, not instant carpeting.
- **Random**: Use `Math.random()` (or a seeded RNG if you want reproducible tests) for offset and which of the candidate blocks get chosen.

---

## Foggy during the storm

- **In infected biome**: No extra work – fog is already there; storm = particles + snow placement.
- **Outside infected biome**: Script API cannot change fog. Options:
  - **Blindness**: Apply a low-level, short-duration blindness effect while player is in storm zone; refresh every few seconds. Simulates “can’t see far.”
  - **No fog**: Storm is particles + accumulation only; “foggy” only in infected biome. Document in codex/settings.

Recommendation: Start with **particles + placement** everywhere; add **optional** blindness-in-storm (or “storm fog” in infected biome only) as a follow-up.

---

## Implementation outline

1. **New script**  
   - `mb_snowStorm.js` (or `mb_storm.js`).
   - `system.runInterval` (e.g. every 20–40 ticks) to:
     - Update storm state (start/end based on random timer and cooldown).
     - If storm active: for each player in overworld (and in zone if using box/biome), spawn particles around player and run placement pass.

2. **Storm state**  
   - `stormActive: boolean`, `stormEndTick: number`, `cooldownEndTick: number`.
   - Roll for “start storm” when not in cooldown (e.g. 1% chance every 100 ticks); set duration (e.g. 2–5 min) and cooldown (e.g. 10–20 min).

3. **Particles**  
   - Around each player in storm (e.g. 5–10 spawns per tick in a short radius): `dimension.spawnParticle("mb:white_dust_particle", ...)` and/or `runCommand('particle minecraft:snowflake ...')` so it looks like a snow/dust storm.

4. **Placement**  
   - Shared helper, e.g. `tryPlaceSnowLayerAt(dimension, blockX, blockY, blockZ)` that:
     - Gets block at (blockX, blockY, blockZ) and above.
     - Applies same rules as `tryPlaceSnowLayerUnder`: no placement on snow, replace grass/foliage, place above solid.
   - Placement pass: pick 1–3 random (x, z) in radius, find top solid Y, call `tryPlaceSnowLayerAt(dim, x, topY, z)` (placement above `topY`). Throttle per player per interval.

5. **Config**  
   - Constants (or later world dynamic props): radius, placement interval, placements per pass, storm duration range, cooldown range, enable/disable storms, optional blindness level/duration.

6. **Script toggles**  
   - Add “Snow Storm” (or “Storms”) to script toggles so it can be turned off like other systems.

---

## Optional: Custom “snow” particle

- You can add `mb:snow_storm_particle` (RP particle JSON) similar to `white_dust_particle` but tuned for falling/sideways “snow” (size, speed, lifetime) and use it instead of or in addition to `minecraft:snowflake` and `mb:white_dust_particle` for variety.

---

## Summary

| Question | Answer |
|----------|--------|
| **New system or integrate?** | **New module** (`mb_snowStorm.js`) that **reuses** snow placement rules and existing particles; area logic is new. |
| **Sectioned area?** | Start with **per-player radius**; optionally add world AABB or biome filter later. |
| **Snow accumulation?** | **Yes** – random placement in area using same rules as bears/torpedo (no stacking, replace grass). |
| **Foggy?** | In infected biome = existing fog. Elsewhere = optional blindness or “particles only.” |
| **Random?** | **Yes** – random positions within radius, random storm start/cooldown. |

---

## Requirements (Answered)

1. **Dimension**: **Overworld only** ✓
2. **Day gate**: 
   - **Normal**: Day 8+
   - **Hard**: Day 4+
   - **Easy**: Day 13+
   - Use `getAddonDifficultyState()` from `mb_dynamicPropertyHandler.js` to check difficulty
3. **Infection**: 
   - **Yes** – storm exposure should cause infection if inside for long periods
   - **Storm exposure should be faster** than standing on blocks (storm = more dangerous)
   - **Standing on blocks** should be slower (less dangerous than storm)
   - Adjust `GROUND_EXPOSURE_SECONDS_PER_TICK` or add separate `STORM_EXPOSURE_SECONDS_PER_TICK` multiplier
4. **Raboy compatibility**: **Not needed for now** ✓

## Additional Requirements

### Block Replacement Behavior
- **Minor storms (before day 20)**: 
  - **Do NOT replace** grass/small blocks
  - Only place snow on **solid blocks** that aren't grass/small blocks
  - Use different placement logic than `tryPlaceSnowLayerUnder` (which replaces grass)
- **Major storms (day 20+)**: 
  - **Can replace** grass/small blocks (like normal snow placement)
  - Use same rules as `tryPlaceSnowLayerUnder` / torpedo death
- **Major storm chance**: Increases each day after day 20 (when major storms first become possible)

### Future Ideas (Not Implemented Now)
- **Mask item**: Grants immunity to storm infection, has durability that decreases with usage
- **Filter items**: Similar to mask, provides protection
- Add to `docs/development/IDEA_BRAINSTORM.md` for future reference

---

## Implementation Notes

- **Difficulty check**: Import `getAddonDifficultyState` from `mb_dynamicPropertyHandler.js`, check `value` (-1 Easy, 0 Normal, 1 Hard)
- **Day check**: Use `getCurrentDay()` from `mb_dayTracker.js` (or world property `mb_currentDay`)
- **Storm exposure**: Track players "in storm" separately from ground exposure, apply faster infection rate
- **Placement logic**: Create two variants:
  - `tryPlaceSnowLayerAtMinor(dimension, x, y, z)` – no grass replacement
  - `tryPlaceSnowLayerAtMajor(dimension, x, y, z)` – replaces grass (reuses existing logic)
