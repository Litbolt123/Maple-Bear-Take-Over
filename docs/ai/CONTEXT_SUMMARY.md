# Context Summary

## Recent Changes (Latest Session)

### Achievements Gating: Persisted Powdery Journal State (Feb 15)
- **Problem**: `playerHasPowderyJournal(player)` only checks inventory; achievements stayed hidden if the journal was obtained earlier but not carried.
- **Fix**: Replaced single-condition gate with combined check: `if (!playerHasPowderyJournal(player) && !isPowderyJournalUnlocked(player))`.
- **New helper**: `isPowderyJournalUnlocked(p)` reads persisted `codex.items.snowBookCrafted` (set when journal is crafted or obtained).
- **Result**: Achievements show if the player either has the journal in inventory OR has ever crafted/obtained it (persisted codex state). No changes needed to crafting/obtainment code—`snowBookCrafted` already set in main.js (periodic inventory check and when opening codex via snow_book).

### Mining Interval & Dev Tools Fixes (Feb 8)
- **Mining Min Interval menu fix**: Slider now uses object form `{ valueStep, defaultValue }`; `.catch()` returns to `openAIThrottleMenu()` instead of Developer Tools to avoid main-menu redirect. Clamped default and result values.
- **Settings confirmation**: Every AI throttle change (dynamic interval, min interval, override, reset) sends a chat message and `console.warn` for logging.
- **Manual Mining Interval Override**: Expanded text field explanation: "0 = use computed (day-scaled). Overrides the normal formula so all bears break blocks every N ticks regardless of day."

### Simulate Next Day Message (Feb 8)
- **Day change message**: When using Developer Tools → Simulate Next Day, the same "A new day begins... Day X" (or post-victory variant) is broadcast to the world via `world.sendMessage`, using `getDayDisplayInfo(newDay)` for color/symbols.

### Infection Dev Menu: View & Adjust (Feb 8)
- **Infection Dev Tools** (Developer Tools → Clear/Set Infection): New options:
  - **View Infection Status**: Shows infection type, ticks left, current snow (severity), max snow level achieved.
  - **Adjust Infection Timer**: Modal to enter remaining ticks; applies to live infection state.
  - **Adjust Snow Level**: Modal to set snow count (infection severity) and update max snow level.
- **New debug commands** in `main.js`: `set_infection_timer <target?> <ticks>`, `set_snow_level <target?> <level>`. Target optional; without target, uses sender.
- **Files**: `mb_codex.js` (expanded `openInfectionDevMenu`, `showInfectionStatus`, `promptAdjustInfectionTimer`, `promptAdjustSnowLevel`), `main.js` (simulate_next_day message, set_infection_timer, set_snow_level).

### Storm Intersection, Per-Storm Controls & Storm Hub (Feb 8)
- **Storm intersection**: Overlapping storms boost each other (more violent). When storms overlap (distance < sum of radii), `intersectionBoost` increases each tick; when separated, it decays. Effective intensity capped at 2.5.
- **Per-storm enable/disable**: Each storm has `enabled`. Disabled storms don't drift, place snow, spawn particles, or affect players. `setStormEnabled(id, enabled)` and `endStormById(id)` for dev.
- **Multi-storm toggle**: World property `mb_storm_multi_enabled`. When OFF, max 1 storm, 0% secondary chance. `isMultiStormEnabled()`, `setMultiStormEnabled(bool)`.
- **Storm hub** (like Spawn Controller): Developer Tools → Storm. Single entry with: Multi-storm ON/OFF, Summon Minor/Major, End All, Storm List (per-storm enable/disable, end), Storm Override, Storm Control Settings, Snow Storm Debug. Removed separate Summon Storm, Storm State, Storm Override, Storm Control entries. Pin migration: storm_control, summon_storm, storm_state, storm_override → storm.

### Multi-Storm Support & Storm Control Dev Tool (Feb 8)
- **Storm Control** journal dev tool: Codex → Developer Tools → Storm Control. Controls all snow storm parameters:
  - Summon Minor/Major Storm, End Storm, Storm State, Storm Override (duration, cooldown), Storm Control Settings (intensity, multi-storm), Snow Storm Debug
- **Storm Control Settings** modal: Intensity override (Auto, 0.5–2.0), Max concurrent storms (1–3), Secondary storm chance (0–50% when 1+ storms active)
- **Multi-storm**: `mb_snowStorm.js` refactored to support 1–3 concurrent storms. Each storm: own center, drift, intensity, particles, placement, mob damage, block destruction
- **Throttling**: Secondary storms use `secondaryStormChance` (0–50%) when 1+ storms already active; no cooldown between secondary spawns
- **Persistence**: Saves `storms` array; loads legacy single-storm format for backward compat
- **Spawn tiles**: `getStormSpawnTiles` merges tiles from all storms for Maple Bear spawning
- **PINNABLE_DEV_ITEMS**: `storm_control` entry for quick access

### Spawn Presets (Feb 15)
- **New**: Spawn Controller → Presets (or Advanced → Presets) with 5 coordinated profiles: Low, Med-Low, Med, Med-High, High.
- Each preset sets: Block Query, Max Spawns/Tick, Range, Tile Intensity, Blocks Per Tick, Spawn Speed, Spawn Difficulty.
- **Low**: Minimal lag (25% blockQ, 12 spawns/tick, close range, 50% tiles/blocks, 0.5× speed, Easy).
- **Med**: Balanced default (100% all, 24 spawns, normal range, 1× speed, Normal difficulty).
- **High**: Aggressive (150% blockQ, 48 spawns, far range, 125% tiles, 1.5× blocks, 2× speed, Hard).

### Spawn Advanced Options (Feb 15)
- **New**: Spawn Controller → Advanced Options with 5 tunables:
  - **Block Query Budget**: 25%, 50%, Normal (100%), 150% – multiplies block scan limit (lower = less lag).
  - **Max Spawns Per Tick**: 12, 18, 24, 36, 48 – cap total spawns across all players.
  - **Spawn Range**: Close (20–35), Normal (15–45), Far (10–55) – min/max distance from player.
  - **Tile Scan Intensity**: 60%, 75%, Normal, 125% – candidates and spaced tiles per scan.
  - **Blocks Per Tick**: 60%, 80%, Normal, 150% – progressive block scan budget (lower = spread load more).
- World properties: `mb_spawn_block_query_mult`, `mb_spawn_max_global`, `mb_spawn_range`, `mb_spawn_tile_intensity`, `mb_spawn_blocks_per_tick_mult`. Reset All clears overrides.

### Spawn Controller Consolidation (Feb 15)
- **Hub**: Developer Tools → Spawn Controller now contains all spawn-related settings in one place.
- **Contents**: Script ON/OFF, Spawn Difficulty, Spawn Speed, Spawn Type Toggles, Force Spawn. Back from submenus returns to hub.
- **Replaced**: Separate Dev Tools entries for Spawn Difficulty, Spawn Speed, Spawn Type Toggles, Force Spawn.
- **Pins**: `spawn_difficulty`, `spawn_type_toggles`, `force_spawn` migrated to `spawn_controller` for Pin/Unpin compatibility.

### Spawn Speed Override in Dev Tools (Feb 15)
- **Feature**: Manual override to throttle or speed up the spawn controller from Developer Tools → Spawn Speed.
- **Options**: Very Slow (0.25×), Slow (0.5×), Normal (1×), Fast (2×), Very Fast (3×), Custom (0.25–4).
- **Implementation**: World property `mb_spawn_speed_multiplier`. Spawn loop runs every 20 ticks but executes only when `(tick - lastRun) >= 60/multiplier`. Slower = less frequent runs (helps lag); faster = more frequent runs.
- **Files**: mb_spawnController.js (getSpawnSpeedMultiplier, SPAWN_SPEED_PROPERTY, tick gating), mb_codex.js (openSpawnSpeedMenu, promptCustomSpawnSpeed).

### Spawn Controller Multi-Player Lag Optimization (Feb 15)
- **Problem**: Lag with 2+ players spread out or 2 near + 1 far. Batch entity count used huge radius (e.g. 200+ blocks) when players far apart, causing massive entity enumeration.
- **Fix 1 – Batch entity skip when spread**: `getBatchEntityCounts` now returns early when `maxPlayerDistance > 80` blocks. Each player uses `getEntityCountsForPlayer` (small per-player radius) instead of one giant batch query.
- **Fix 2 – Skip batch call when not tight group**: Main loop only calls `getBatchEntityCounts` when `isTightGroupMode` (players within 32 blocks). Spread players always use per-player entity queries.
- **Fix 3 – Single player per tick when spread**: In spread mode, process only ONE player per tick (break after first match). Stagger intervals increased: 2 players 2→3, 3 players 4→6, 4+ players 10→12 ticks between processing.
- **Impact**: mb_spawnController.js. Reduces entity queries, block scans, and tile collection when players are far apart.

### Achievements Hidden Until Powdery Journal (Feb 12)
- **Design**: Achievements are earned and tracked in the background regardless of journal ownership. They are **hidden from view** until the player has the Powdery Journal (`mb:snow_book`) in their inventory.
- **Implementation**: Added `playerHasPowderyJournal(player)` helper in mb_codex.js that checks inventory for `mb:snow_book`. In `openAchievements()`, if the player doesn't have the journal, shows a placeholder instead of the full achievement list: "§7Well that was something!\n\n§8Your deeds are being recorded... but you'll need the Powdery Journal to make sense of these notes."
- **When visible**: Full achievements list shown when player opens the codex and has snow_book (e.g. opened via snow_book use). If opened via Debug/Developer Tools from Basic Journal without having crafted the Powdery Journal yet, they see the teaser.
- **Impact**: mb_codex.js only. No linter errors.

### Snow Block Lists: grass_block Contradiction & Storm vs Death/Torpedo Distinction (Feb 12)
- **Contradiction fix**: `minecraft:grass_block` was in both `SNOW_NEVER_REPLACE_BLOCKS` and `SNOW_REPLACEABLE_BLOCKS`. Removed from `SNOW_REPLACEABLE_BLOCKS` so it only appears in `SNOW_NEVER_REPLACE_BLOCKS`. Full ground blocks (grass_block, dirt, etc.) are never replaced by snow.
- **Distinction for future work**: Added comments in `mb_blockLists.js` clarifying:
  - **Storm**: Uses `SNOW_NEVER_REPLACE_BLOCKS` — storm only places snow in air above these; never replaces full ground blocks.
  - **Death/torpedo/buff snow placement**: Uses `SNOW_REPLACEABLE_BLOCKS` — these blocks (grass, flowers, foliage) can be replaced with snow. Excludes grass_block.
- **Impact**: main.js, mb_torpedoAI.js, mb_buffAI.js now place snow without replacing grass_block. Storm (mb_snowStorm.js) already treated grass_block as never-replace via `SNOW_NEVER_REPLACE_BLOCKS`. No linter errors.

### Storm Load Fix & Village Freeze Mitigation (Feb 8)
- **Storm not restoring on rejoin**: `loadStormState` was missing the logic to restore `stormActive`, `stormType`, `stormCenterX/Z/Y`, `stormIntensity`, `stormDriftAngle` from saved state. It only handled ticks; the condition `if (stormActive && ...)` was always false on load. Now all variables are restored and center is validated.
- **Village freeze mitigation**: Added per-pass cap (80 blocks) to major storm destruction to reduce chunk overload. See `docs/development/STORM_TROUBLESHOOTING.md` for recovery steps (villager pathfinding in heavily modified terrain).

### Storm Intensity, Shelter & Obstacle Deflection (Feb 8)
- **Storm intensity**: Each storm now has random intensity (0.85–1.15, bell-curve-like) applied to radius, placement count, particle density, mob damage. Persisted with storm state.
- **Storm drift deflection**: Storm deflects when target is inside terrain. When mountain ahead (8+ blocks higher), 70% chance to deflect (prefer going around); 30% chance to climb. Storm can still go up mountains but prefers going around.
- **Shelter system (Phase 1+2)**: 6-direction raycast (`isEntityShelteredFromStorm`) from entity head. If any ray reaches max distance without hitting solid = opening = exposed. All 6 hit solid = enclosed = sheltered. Only checked for entities in storm radius (performance). Players: no infection/blindness/nausea when sheltered. Mobs: no storm damage when sheltered.
- **Vanilla snow infection fix**: Removed `minecraft:snow_layer` from `INFECTED_GROUND_BLOCKS`. Only `mb:snow_layer` and `mb:dusted_dirt` cause ground infection. Vanilla snow no longer infects.
- **Storm cooldown**: 5–10 min at start, scales to 3 min by day 20 via linear interpolation.

### Minecraft 1.26 Compatibility (Feb 12)
- **Analysis doc**: Created `docs/development/MINECRAFT_1.26_COMPATIBILITY.md` with full changelog review.
- **Infected Cow migration**: Split `minecraft:breedable` into `minecraft:offspring_data` + `minecraft:breedable` for 1.26. Required for addon to load.
- **Infected Pig breeding**: Added breeding (pig + pig, mb:snow) using 1.26 offspring_data format. Includes ageable, follow_parent, pig_adult component group, spawn_adult/entity_transformed events.
- **Manifest update**: BP and RP `min_engine_version` set to [26,0,0]. Addon now targets Minecraft 1.26+.
- **AI goal schemas**: Stricter parsing in 1.26—validate in-game; addon usage appears standard.
- **New feature ideas**: EntityItemPickup events, command macros, camera splines, biome tags, World.seed.

### Storm Mob Damage and Conversion (Feb 8)
- **Mob storm damage**: Mobs inside the storm radius take 0.5 HP damage every 2 seconds. Excludes players, Maple Bears, infected pig/cow, items, projectiles.
- **Storm death conversion**: When a mob dies from storm damage, it can transform like being killed by an infected mob (pig→infected pig, cow→infected cow, others→Maple Bear). Uses same conversion rate and nearby bear limits as bear kills.
- **Tracking**: `stormKillCandidates` Map tracks entities we damaged; `wasKilledByStorm(entityId)` consumed on entityDie to trigger `handleStormMobConversion`. Conversion deferred via `system.run` and uses `convertEntityAtLocation` (location/dimension) since entity may be invalid.

### Storm Placement, Spawn, Ambience, Journal (Feb 8)
- **Placement debug**: Snow placement now restricted to positions within 96 blocks of any player (loaded chunks only). Placement always logs summary when 0 placed; full details when Placement debug on.
- **Storm infection**: Verified—storm exposure (`isPlayerInStorm`) increases `stormSeconds` in main.js; when it reaches infection seconds, triggers infection like standing on infected blocks.
- **Nearby ambience**: Players within 1.8× storm radius (but outside) hear storm ambience at reduced volume (0.4).
- **Storm journal entry**: Added "Infection Storm" to Biomes and Blocks section. Progressive knowledge: basic (seen), intermediate (minor/major types), expert (details on bears spawning in storm, types, day gates).
- **Maple Bears in storm**: Spawn controller merges storm spawn tiles via `getStormSpawnTiles()`. Up to 15 surface positions in storm radius within spawn range are added as valid spawn tiles. Debug: "Added X storm spawn tiles" when spawn general/tileScanning on.
- **Particles debug conditional**: Particle logs only when Particles debug toggle on (Codex → Storm Debug → Particles).
- **Codex storm discovery**: `stormSeen`, `stormMinorSeen`, `stormMajorSeen` in biomes; marked when player enters storm.
- **Exports**: `isPositionInStormRadius(x,z)`, `getStormSpawnInfo()`, `getStormSpawnTiles()` for spawn controller integration.

### Storm Particles Fix & Debug (Feb 8)
- **No particles visible**: Switched to `dimension.spawnParticle("mb:white_dust_particle", loc)` only (no runCommand – Bedrock /particle syntax differs). Vanilla snowflake unreliable; custom particle works.
- **Loaded chunks**: Spawn around ALL overworld players (not just those in storm) so we always spawn in loaded chunks; center spawns can be in unloaded area.
- **Debug: particle count**: Movement debug line includes `particles=X, skipped=Y`. Storm State shows "Last particle pass: X spawned, Y skipped".

### Infection Timer Persistence Fix (Feb 8)
- **Root cause**: Dynamic property handler uses cached writes; actual `setDynamicProperty` runs in a batch every 600 ticks (~30s). If the player closed the world before the batch ran, infection timer and other settings were lost.
- **Fix**: Import `saveAllProperties` from `mb_dynamicPropertyHandler.js` and call it immediately after saving settings in both Powdery Journal (`openGeneralSettings`) and Basic Journal settings. This forces an immediate flush of dirty player and world properties so settings persist right away.

### Storm & Mining Persistence (Feb 8)
- **Storm persistence**: Storm state (active/type/center/ticks remaining/cooldown) saved to world property `mb_storm_state` every 5 seconds and on start/end. Restored on world load so storms continue across sessions.
- **Mining MB target persistence**: When a mining bear targets a player, that player name is stored on the entity (`mb_target_player`). On world reload, the bear prefers its persisted target first; if that player is online and in range, it resumes targeting them.

### Snow Storm Enhancements & Dev Tools (Feb 8)
- **Storm debug toggles**: Added `snow_storm` debug category with General, Movement, Placement, Particles, Toggle All buttons in the Storm Debug menu (Codex → Debug Menu → Snow Storm).
- **Storm Y variance**: Storm center Y now drifts up/down (±12 blocks) so it doesn’t stay stuck on tree tops; blends with surface over time.
- **Storm movement**: More movement (2 blocks/1s vs 0.5/2s). Persistent drift direction with occasional erratic turns; ~25% chance for big direction change.
- **Pin/Unpin to Main Menu**: New Developer Tools option “Pin/Unpin to Main Menu” to pin shortcuts (Script Toggles, Summon Storm, Storm State, etc.) on the journal main menu for quick access.
- **Snow never replaces dirt**: Added `SNOW_NEVER_REPLACE_BLOCKS` (dirt, grass_block, coarse_dirt, podzol, mycelium, etc.). Storm placement only puts snow in air above solid blocks; never replaces full ground blocks.
- **Major storm particles**: Switched to uniform distribution inside the circle (r = radius * sqrt(random)) so particles fill the area instead of only a ring at the edge.
- **Vanilla snow particles**: Using `minecraft:snowflake_particle` (Bedrock working particle ID) via `dimension.spawnParticle`.
- **Blindness in storm**: Blindness 1 applied while player is in storm; removed when they leave.
- **Storage**: `mb_pinned_dev_items` added to dynamic property list for pin persistence.

### Snow Storm Design (Feb 8)
- **New doc**: `docs/development/SNOW_STORM_DESIGN.md` – design for a “snow storm” (dust-storm style) that places snow layers during the storm.
- **Integration**: New script module `mb_snowStorm.js` recommended; reuse existing snow placement rules (`tryPlaceSnowLayerUnder`-style, `SNOW_REPLACEABLE_BLOCKS`), particles (`mb:white_dust_particle`, snowflake), and runInterval pattern. No existing dust storm implementation in this addon (Raboy’s is external); area/region logic would be new.
- **Area**: Start with per-player radius (e.g. 48–64 blocks); optional later: world AABB or biome-based (e.g. only in infected biome where fog already exists).
- **Fog**: Script API cannot set fog; foggy = use existing infected-biome fog when in storm there, or optional blindness effect elsewhere.
- **Random**: Storm start/cooldown random; snow placement at random positions in area, same rules as bears (no snow-on-snow, replace grass).
- **Open questions** (for user): dimension (overworld only?), day gate, infection from storm-placed snow, Raboy addon compatibility.

### QoL Brainstorm & Edge Cases Doc (Feb 4)
- **New doc**: `docs/development/QOL_AND_EDGE_CASES.md` created.
- **QoL ideas**: Infection/cure reminders and checklist, codex bookmark/"new" badges and quick stats, bear-type subtitle on first hit, optional day in HUD, next-milestone teaser, biome warning, settings presets and sound categories, co-op "who is infected" and knowledge-share reminder, addon-active and settings-confirmation messages.
- **Edge cases**: Player disconnect and ID reuse, entity validity and stale Maps, infection/cure same-tick ordering, timer/snow overflow and NaN, immunity persistence, day rollback and tick overflow, chunk unload and spawn validation, codex size/corruption and knowledge-share merge, multiplayer ordering, AI target/block validity, division-by-zero and coordinate bounds, addon lifecycle and script reload.
- **Purpose**: Checklist for UX polish and robustness; prioritize by player impact.

### Snow Layer Placement: No Stacking, Replace Grass/Small Blocks (Jan 31)
- **Problem**: Snow layers were placed on top of other snow layers and on grass/small blocks, making things look messy.
- **Desired behavior**: (1) Never place snow on top of existing snow layers. (2) Replace grass and other small/non-full blocks with snow instead of stacking.
- **main.js – `tryPlaceSnowLayerUnder`**: If the block under the entity is already a snow layer, return (don’t place). In the “replace grass with snow” branch, if the block above is already snow, return so we don’t create snow-on-snow. Grass/flowers/etc. are still replaced by snow when the space above is not snow.
- **main.js – death explosion**: Already checked for snow at placement level and skipped; no change.
- **main.js – conversion spawn**: Before placing snow at spawn, skip if the block below is already a snow layer (don’t place on snow).
- **mb_torpedoAI.js – explosion**: At the start of each column, if the block at `topSolidY + 1` is a snow layer, skip the column so we never place or replace in a way that stacks snow.
- **mb_spawnController.js – spawn**: Skip snow placement when the block below the spawn is already a snow layer.
- **Replaceable-by-snow list**: grass, tall_grass, fern, flowers, vines, lily pad, etc. are replaced by snow when appropriate (and not creating snow-on-snow). grass_block was removed (Feb 12) — full ground blocks stay; only foliage/small plants are replaced.
- **Debug**: Toggleable “Snow Placement” (Main) and “Block Placement” (Torpedo) in Debug Menu. “Replace foliage above” logic so grass/tall_grass above solid block is replaced instead of snow stacking on top.
- **2-block-tall plants (implemented) (lilac, sunflower, rose_bush, peony, large_fern)**: (1) Lilacs (and other 2-block plants) were broken when only the bottom block was replaced; top block left floating. (2) Snow was placed “in the middle” because the “top solid” search can find the upper half of the plant. Fix: treat 2-block plants as a unit—either replace both blocks (bottom → snow, top → air) or skip them; and when top solid is the upper half of a 2-block plant, consider the block below and replace/skip accordingly so snow isn’t placed in the middle.

### Script Toggles & Beta Features (Jan 31)
- **Developer Tools – Script Toggles**: New "Script Toggles" menu in Developer Tools (Dusted Journal/Basic Journal with cheats). Toggle on/off: Mining AI, Infected AI, Flying AI, Torpedo AI, Biome Ambience. Use to quickly disable scripts if something breaks.
- **Settings – Beta Features**: New "Beta Features" section in Settings for both books. **Owner** = first player to join the world (set on playerSpawn when no owner exists). **Can edit** = owner OR anyone with `mb_cheats` tag.
- **Beta: Infected AI**: Infected AI (nox7 pathfinding) is a beta feature. **Defaults OFF** on world load; must be turned on in the book. When off, infected AI stops running (vanilla entity behaviors continue).
- **Visible to others**: Owner can toggle "Visible to others in book" so non-owners see the Beta section (read-only). When off, only owner/mb_cheats see Beta.
- **Edit access**: Only first joiner (owner) or players with `mb_cheats` can change beta settings. Others see read-only state when "visible to all" is on.
- **Storage**: Script toggles and beta settings use world dynamic properties. `mb_scriptToggles.js` provides `isScriptEnabled`, `isBetaInfectedAIEnabled`, etc. All AI scripts check these at the start of their tick.

### Infected Maple Bear: Advanced nox7 Pathfinding Fix (Jan 31)
- **Root cause**: Infected bears use shared nox7-style pathfinding from `mb_miningAI.js`, but `processPathfindingChunk` and the cleanup interval only searched for mining bear types (`mb:mining_mb`, `mb:mining_mb_day20`). Infected entities were treated as non-existent and their pathfinding was canceled immediately.
- **`PATHFINDING_ENTITY_TYPES`**: Added constant listing all entity types that share pathfinding (mining bears + infected bears/pig/cow). Used in entity lookup instead of hardcoded mining types.
- **`processPathfindingChunk`**: Now searches all pathfinding entity types when verifying entity exists, so infected pathfinding completes instead of being canceled.
- **Cleanup interval**: Entity-existence check updated to use `PATHFINDING_ENTITY_TYPES` instead of mining-only types.
- **mb_infectedAI waypoint fallback**: When pathfinding has a cached path, infected AI now uses waypoint-based movement (impulse toward next waypoint) instead of always falling back to direct target impulse. Aligns with mining AI behavior.

### Mining Bear: No Flying When in Open Air (Continued)
- **Open cave fix** (Jan 31): Bear still flew when player was above in an open cave. Root cause: steering toward an *air* step (no solid block to land on) still applied upward impulse.
- **`steerTowardStep` stepIsSolid param**: Added `stepIsSolid` (default true). When `false` (elevated step is air, open cave), never apply upward impulse — only forward. Prevents launching bear into void.
- **Elevated step (air) path**: When `!stepReady && isElevatedStep && headroomClear`, now calls `steerTowardStep(..., false)` so no upward impulse.
- **Same-level air fallback**: Removed upward impulse when same-level step is air. Only forward impulse so bear can move toward blocks; no upward (would cause flying).
- **More isOnGround gates**: Added `isOnGround` checks to: carveStair step 2 impulse (4258), carveSpiralStair impulse after mining (5651), "not actively targeting" movement (7850), pathfinding fallback (8088), "target too high for pitfall" (8557).
- **Previous fix**: `steerTowardStep` and move-toward-target already gated with `isOnGround`; this session added `stepIsSolid` and air-step-specific fixes.

### Mining Bear: No Flying When Target Directly Above (Continued)
- **Root cause**: Bears flew when player was directly above (e.g. in caves). carveStair applied upward impulse (y: 0.20–0.22) every time a block was mined, so mining straight up rocketed the bear higher each block.
- **targetDirectlyAbove (horizontalDist < 2)**: Added a guard so that when target is directly above (horizontal distance < 2 blocks), upward impulse is never applied.
- **carveStair**: All “block mined” upward impulses now check `!targetDirectlyAbove`. When target is directly above, mining only clears blocks; no impulse is applied.
- **steerTowardStep**: Added `pathfindDirectlyAbove` (pathfind target same x,z as bear) so no upward impulse is applied when pathfinding straight up.
- **Stair fallbacks**: Added `targetDirectlyAboveFallback` and `targetDirectlyAboveOrig` to stair pathfinding fallbacks so no upward impulse when target is directly above.
- **carveSpiralStair**: Applied `targetDirectlyAbove` checks to all climb impulses (block-mined impulse, open-shaft impulse, mining-loop impulse).

### Spiral Stair Descending Pattern (carveSpiralStair)
- **`blocksToMine` now branches on `goingDown`** in `BP/scripts/mb_miningAI.js` (~5512–5527).
- **Ascending** (unchanged): above head `(bearX, bearY+2, bearZ)`, in front at head `(frontX_final, bearY+1, frontZ_final)`, above front `(frontX_final, bearY+2, frontZ_final)`.
- **Descending** (new): front floor `(frontX_final, bearY-1, frontZ_final)`, headroom `(frontX_final, bearY, frontZ_final)`, headroom above `(frontX_final, bearY+1, frontZ_final)` at the lower level.
- Front floor is the future foothold; `isSpiralBlockProtected` skips it, so we never mine it. The two headroom blocks are mined to clear space for the next step down.
- Existing loops over `blocksToMine` (work-lock check, mine-in-order) are unchanged; they use the same variable and thus already process the descending list when `goingDown` is true.

### Day Milestones & Infection Rate Update
- **Infection Rate Refactor**: Replaced hard-coded day checks with `INFECTION_RATE_STEPS` in `BP/scripts/main.js`, adding day 11/15/17 steps and a 100% cap at day 20.
- **Codex Milestones**: Updated milestone list in `BP/scripts/mb_codex.js` to include day 11, 15, and 17 (escalation, mining bears, torpedo bears).

### Performance & Architecture Improvements
- **Dynamic Property Handler**: Implemented `mb_dynamicPropertyHandler.js` with cached read/write system and batch saving
  - Lazy loading for world properties to avoid early execution errors
  - 1-tick delay for loading properties of players already in world
  - Chunking support for large dynamic properties (codex, player settings)
  - Defensive checks for player validity and property existence
  - All scripts migrated to use new handler (`getPlayerProperty`, `setPlayerProperty`, `getWorldProperty`, `setWorldProperty`)
- **Item Finder Utility**: Created `mb_itemFinder.js` with priority-based inventory search
  - Replaces scattered inventory scanning code
  - Priority system: hotbar → main inventory → offhand
- **Item Event Registry**: Created `mb_itemRegistry.js` with modular event registration system
  - Replaced direct `itemCompleteUse` handler with registry pattern
  - Cleaner code organization for item consumption events
- **Isolated Player Optimizations**: Enhanced spawn system for players far from others (>96 blocks)
  - Reduced resource usage: scan radius (75→40), entity queries (45→30), tile limits (-40%), cache TTL (+50%)
  - Skip progressive scanning for isolated players
  - Compensate with increased spawn attempts (+25%) and spawn chance multiplier (1.4x)
  - Maintains balanced gameplay while reducing lag

### Minor Infection System Enhancements
- **Random Effects System**: Minor infection now has random, severity-scaling effects
  - Severity levels: 0 (no effects), 1 (mild), 2 (moderate), 3 (severe)
  - Cooldowns scale with severity (7200, 4800, 3600, 2400 ticks)
  - Effect pools by severity (milder than major infection)
  - Per-player effects (not global)
- **Respawn Messaging**: Enhanced respawn experience for minor infection
  - First-time respawn: Full message, on-screen title, sounds (enderman portal + villager idle)
  - Subsequent respawns: Minimal message only
  - No immediate slowness on respawn (effects applied by timer loop only)
  - Shorter blindness duration (60 ticks vs 200)
- **Progression Messaging**: Reduced message spam for subsequent infections
  - First minor reinfection: Full text
  - Subsequent minor reinfections: Minimal text ("§eMinor infection.")
  - First major infection: Full text
  - Subsequent major infections: Minimal text ("§cMajor infection.")
  - Suppress messages if player dies from the hit that would cause progression

### Intro Sequence & Welcome System
- **Intro Sequence Fixes**: Fixed replay issues and timing
  - Proper boolean handling for `introSeen` property (handles true, "true", 1, "1")
  - Uses persistent world property instead of in-memory Set
  - Consistent intro check across all handlers
- **Welcome Messages**: Fixed for both first-time and returning players
  - Returning players: Current day message + sound immediately on join
  - First-time players: "Day 0" after intro (consistent format)
  - `showPlayerTitle` only plays sound when day is not null/undefined
- **First-Time Welcome Screen**: Archived (disabled but code preserved)
  - `showFirstTimeWelcomeScreen` function commented out
  - Normal journal UI always shown instead

### Debug System Expansions
- **New Debug Menus**: Added to journal debugging section
  - Dynamic Property Handler: Chunking, caching, reads, writes, errors flags
  - Codex/Knowledge System: Progressive, experience, flags, chunking, saving flags
- **Expanded Existing Menus**:
  - Spawn Controller: Added isolated flag
  - Main Script: Added minorInfection flag
- **Updated Debug Defaults**: New categories and flags in `getDefaultDebugSettings()`

### Code Quality & Verification
- **Code Verification**: Comprehensive verification of all recent changes
  - No linter errors
  - All imports correct
  - All function dependencies verified
  - All constants and properties properly defined
  - Logic flow verified
- **Verification Report**: Created `docs/VERIFICATION_REPORT.md` documenting all checks

### Documentation Updates
- **Co-Creator Documentation**: Created `docs/Compoohter/` folder
  - `TASKS_FOR_CO_CREATOR.md`: Detailed task list with corrected line numbers
  - `UI_CREATION_GUIDE.md`: Guide for UI creation and patterns
  - `NEXT_SESSION_TASKS.md`: Planned AI improvements (torpedo bear block breaking, mining bear pathfinding)
- **Reference Documentation**: Updated `docs/reference/COLORS_AND_STYLING.md`
  - All current UI elements documented
  - Line numbers updated to match current code
  - New sections: Minor Infection Analysis, respawn messages, etc.

### Discovery-Based Knowledge Progression System
- **Knowledge Progression**: Infection knowledge now grows as players discover items and gain experience
- **Gold Items Added**: Added Gold Ingot and Gold Nugget to items list with progressive discovery-based descriptions
- **Enhanced Item Descriptions**: Golden Apple, Golden Carrot, and Enchanted Golden Apple now have progressive descriptions based on:
  - Infection knowledge level (0-3: no knowledge, basic awareness, understanding, expert)
  - Related item discoveries (gold, golden items, cure items)
  - Current infection status and cure progress
  - Permanent immunity status
- **Major Infection Cure**: Curing major infection now also grants permanent immunity (like minor infection cure)
  - Both cures grant permanent immunity to minor infection
  - Major infection cure also grants temporary immunity (5 minutes)
  - Both cures update codex to mark minor cure as known/completed
- **Knowledge Level System**: Three-tier knowledge progression:
  - Level 1 (Basic Awareness): Any infection experience or discovery
  - Level 2 (Understanding): Multiple discoveries, cure knowledge, or related items
  - Level 3 (Expert): Deep knowledge from many experiences, both cures known, multiple related items
- **Progressive Item Information**: All cure-related items now show progressive information:
  - Basic information if no knowledge
  - Properties and connections with basic awareness
  - Cure details with understanding
  - Expert analysis with expert knowledge
- **Knowledge Triggers**: Knowledge progression automatically updates when:
  - Infections are discovered (bear, snow, minor, major)
  - Cure items are discovered (golden apple, golden carrot, enchanted golden apple, weakness potion)
  - Gold items are discovered (gold ingot, gold nugget)
  - Cures are completed
  - Golden apple infection reduction is discovered

### Minor Infection Starter System
- **Minor Infection on Spawn**: Players now spawn with a "minor infection" (10-day timer) that persists through death until cured
- **Minor Infection Cure**: Requires consuming both a Golden Apple and Golden Carrot separately (any order) to cure and gain permanent immunity
- **Permanent Immunity**: Once cured from minor infection, players gain permanent immunity - they never get minor infection again on respawn, and require 3 hits (instead of 2) to get infected
- **Infection Progression**: Minor infection can progress to major infection (2 hits from Maple Bears OR 1 snow consumption)
- **Infection Types**: System now tracks "minor" (10-day, mild effects) vs "major" (5-day, severe effects) infections
- **World Intro Sequence**: Added intro sequence that plays once per world with narrative messages and gives basic journal at the end
- **Journal Updates**: Updated goal screen and infection section to emphasize journal upgrade importance and show minor vs major infection details
- **Golden Carrot**: Added to codex items section with detailed information about its role in minor infection cure
- **Status Display**: Updated codex status display to show infection type, cure progress, and permanent immunity status

### Snow Layer System Archived
- **Snow Layer Falling/Breaking System**: Archived (commented out) the snow layer falling and breaking system in `main.js`. The system that made snow layers fall when placed without support and break when landing on other snow layers has been temporarily disabled. Code is preserved in comments marked with `[ARCHIVED]` for future reference.

### Sound System Integration
- **Sound Progress Document Created**: Added `docs/development/sounds/SOUND_PROGRESS.md` to track sound integration progress
- **Documentation Reorganized**: Moved all development-related MD files to `docs/development/` folder
- **Debug Logging Silenced**: Made all ambience debug logs conditional on codex debug flags for cleaner console output
- **Sound System Status**: ~95% complete - all core sounds implemented and working

### Sound Integration Complete
- ✅ All entity sounds implemented (tiny, infected, buff, flying, mining, torpedo bears)
- ✅ All script-triggered sounds working (flight, dive, dig, explode)
- ✅ Biome ambience system fully functional with day-based volume progression
- ✅ Buff bear proximity ambience system working (day 8+)
- ✅ All sounds registered in `sound_definitions.json` and `sounds.json`
- ✅ Debug logging integrated and conditional on codex debug flags

### Documentation Reorganization
- Moved `HOW_TO_ADD_SOUNDS.md` → `docs/development/guides/`
- Moved `SOUND_GENERATION_PROMPT.md` → `docs/development/sounds/`
- Moved `SPAWN_SYSTEM_EXPLANATION.md` → `docs/development/systems/`
- Moved `BIOME_GENERATION_VARIABLE_SIZES.md` → `docs/development/systems/`
- Moved `maple_bear_condensed_prompts.md` → `docs/development/prompts/`
- Moved `maple_bear_sound_prompts.md` → `docs/development/sounds/`
- Moved `cursor ai/CONTEXT_SUMMARY.md` → `docs/ai/CONTEXT_SUMMARY.md`
- Created `docs/development/sounds/SOUND_PROGRESS.md` for tracking sound integration

### Previous Work: Spawn System Error Fixes
- Fixed spawn system errors related to entity queries and dimension handling
- Improved error handling in spawn controller
- Added better validation for entity spawning

## Current Project State

### Performance Optimizations
- **Status**: Major improvements implemented
- **Dynamic Properties**: Cached handler with lazy loading and batch saving
- **Isolated Players**: Optimized resource usage with spawn compensation
- **Shared Caches**: Player and mob caching across all AI scripts
- **Block Caching**: Mining AI block queries cached for 1 tick

### Minor Infection System
- **Status**: Fully implemented with enhancements
- **Core Features**: Random effects, respawn messaging, progression handling
- **Cure System**: Golden Apple + Golden Carrot grants permanent immunity
- **Progression**: Can advance to major infection via bear hits or snow consumption

### Documentation
- **Structure**: Organized into `design/`, `development/`, `reference/`, `ai/`, and `Compoohter/` folders
- **New Files**: Verification report, co-creator tasks, UI guide, next session tasks
- **Organization**: All development docs in `docs/development/` folder
- **Co-Creator Support**: Dedicated folder with tasks, UI guide, and line number references

### Key Files
- `BP/scripts/mb_dynamicPropertyHandler.js` - Cached dynamic property system
- `BP/scripts/mb_itemFinder.js` - Priority-based inventory search
- `BP/scripts/mb_itemRegistry.js` - Modular item event registration
- `BP/scripts/mb_sharedCache.js` - Shared player/mob caching
- `BP/scripts/mb_codex.js` - Journal UI with progressive knowledge system
- `BP/scripts/main.js` - Core game logic with minor infection system
- `BP/scripts/mb_spawnController.js` - Spawn system with isolated player optimizations
- `BP/scripts/mb_dayTracker.js` - Day tracking with welcome messages
- `RP/sounds/sound_definitions.json` - All sound definitions
- `RP/sounds.json` - Entity sound mappings
- `BP/scripts/mb_biomeAmbience.js` - Biome ambience system
- `BP/scripts/mb_flyingAI.js` - Flight sounds
- `BP/scripts/mb_torpedoAI.js` - Flight and explosion sounds
- `BP/scripts/mb_miningAI.js` - Dig sounds

## Important Notes

### Dynamic Property Handler
- All scripts use `getPlayerProperty`, `setPlayerProperty`, `getWorldProperty`, `setWorldProperty`
- Lazy loading prevents early execution errors
- Chunking supports large properties (codex, settings)
- Batch saving reduces I/O operations

### Minor Infection System
- Random effects scale with severity (0-3)
- Effects are per-player, not global
- Respawn messaging distinguishes first-time vs subsequent
- No immediate effects on respawn (applied by timer loop)

### Intro Sequence
- Uses persistent world property (`WORLD_INTRO_SEEN_PROPERTY`)
- Boolean handling supports multiple formats (true, "true", 1, "1")
- Welcome messages consistent for first-time and returning players

### Debug System
- New categories: Dynamic Property Handler, Codex/Knowledge System
- Expanded: Spawn Controller (isolated flag), Main Script (minorInfection flag)
- All debug flags toggleable in-game via journal

### Documentation Structure
- `docs/design/` - Design philosophy and vision
- `docs/development/` - Technical docs, guides, and progress tracking
- `docs/reference/` - External resources and links
- `docs/ai/` - AI assistant context (this file)
- `docs/Compoohter/` - Co-creator tasks and guides### Next Session Tasks
- Torpedo Bear: Fix block breaking for blocks directly above (when under structures)
- Mining Bear: Add pathfinding from Discord resources, reduce vanilla behaviors
- See `docs/Compoohter/NEXT_SESSION_TASKS.md` for details
