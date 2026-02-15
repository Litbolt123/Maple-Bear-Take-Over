# Context Summary

**Date:** 2026-02-14

## Mining AI optimization (3-bear lag) – IMPLEMENTED

User reported major lag when 3 mining bears are active. Quick wins implemented; natural spawn capped at 3.

### Changes made (mb_miningAI.js)
1. **Bear-count threshold** – BEAR_COUNT_THRESHOLD_FEW = 3 (was 5); 3+ bears now process every 2 ticks instead of every tick.
2. **Pathfinding Set** – `closed` uses `Set` instead of array; `closed.has()` instead of `closed.includes()` for O(1) lookup.
3. **Pathfinding constants** – PATHFINDING_MAX_NODES 180→120, PATHFINDING_NODES_PER_CHUNK 25→15, PATHFINDING_MAX_CONCURRENT 5→3.
4. **Pathfinding entity lookup** – Store `entityTypeId` in state; single `getEntities` per chunk instead of 8×; fallback to other types if entity not found.
5. **Stagger** – When 3+ bears have targets, spread processing across ticks via `(tick + entityId.charCodeAt(0)) % 2` so not all run same tick.

### Changes made (mb_spawnController.js)
- **ENTITY_TYPE_CAPS** – Mining 20→3. Max 3 mining bears (both variants) from natural spawn.
- **SPAWN_CONFIGS** – MINING_BEAR_ID and MINING_BEAR_DAY20_ID maxCountCap set to 3.
- Debug log and comment updated for new cap.

### Minecraft 1.26 check
- No Script API changes in 1.26 that would make mining AI more taxing. Lag was pre-existing; optimizations address script cost. Note added to MINING_AI_OPTIMIZATION_OPTIONS.md.

---

**Date:** 2026-02-12

## Achievements: hidden until Powdery Journal

Achievements are earned in the background (first cure, first kills, Day 25, etc.) even without the Powdery Journal. They remain **hidden from view** until the player has the Powdery Journal (`mb:snow_book`) in their inventory.

### Changes made (mb_codex.js)

1. **playerHasPowderyJournal(player)** – Helper that checks if `mb:snow_book` exists in the player's inventory.
2. **openAchievements()** – If the player does not have the journal, shows a placeholder instead of the full list:
   - "§7Well that was something!\n\n§8Your deeds are being recorded... but you'll need the Powdery Journal to make sense of these notes."

When the player obtains and holds the Powdery Journal, the full achievement list is visible. This applies whether the codex is opened via snow_book use or via Debug/Developer Tools from the Basic Journal (with cheats).

---

**Date:** 2026-02-12

## Infected Pig: natural spawn and birth event handlers (BP/entities/infected_pig.json)

Added handlers so naturally spawned adults get `pig_adult` and newborns from breeding get `pig_baby`.

### Changes made

1. **pig_baby component group** – Added to component_groups with `minecraft:is_baby` (scale removed to fix "huge babies").
2. **minecraft:entity_spawned** – Adds `pig_adult` component group when the entity spawns naturally (world spawn).
3. **minecraft:entity_born** – Adds `pig_baby` component group when born via breeding.
4. **breed_event** – Explicit `breed_event` in breedable so bred babies reliably receive `entity_born` → `pig_baby`.

Flow: natural spawns → entity_spawned → pig_adult; breeding → entity_born → pig_baby; baby grows up → entity_transformed → pig_adult.

### Baby size fix (same session)

Baby infected pigs appeared huge or "crazy". Removed redundant `minecraft:scale` (0.5) from pig_baby; `minecraft:is_baby` alone applies correct baby sizing. Adding both could conflict and cause wrong scale. Also added explicit `breed_event` in breedable to ensure bred babies receive entity_born.

### Baby head scale fix (same session)

Babies still had big heads despite normal body size. Cause: `animation.pig.baby_transform` in `RP/animations/infected_pig.animation.json` set head bone `scale` to 2 (designed for vanilla pig geometry). Custom `geometry.infected_pig` has different proportions—scale 2 made heads huge. Changed head scale from 2 to 1 so head scales uniformly with the entity.

### Infected pig adult head (reverted Feb 12)

Adults had heads offset from body; attempted fix removed head position from setup.v1.0, which caused heads to render inside the body. Reverted—head position [0,9,7] restored. Heads may remain slightly offset but no longer clipped.

### Snow and leaf litter (Feb 12)

Added `minecraft:leaf_litter` to SNOW_REPLACEABLE_BLOCKS, STORM_PARTICLE_PASS_THROUGH, STORM_DESTRUCT_BLOCKS. Death/torpedo/buff/trail snow placement now replaces leaf litter with snow. Storm skips placing on leaf litter (treats it like grass); particles pass through it to find ground; major storms can destroy it.

---

**Date:** 2026-02-12

## Mining AI: persisted target (mb_target_player) clear when invalid – stop cache bypass

The `mb_target_player` dynamic property (persisted target) was never cleared when the saved player was missing, out of range, or in creative/spectator, causing `targetCache.delete(entityId)` every tick and bypassing caching indefinitely.

### Changes made (mb_miningAI.js, findNearestTarget)

1. **Removed unconditional cache bypass** – No longer call `targetCache.delete(entityId)` at the start of the persisted-target block.
2. **Bypass only when using persisted target** – `targetCache.delete(entityId)` runs only when the persisted player passes all checks (exists, not creative/spectator, in range), right before caching and returning.
3. **Clear dynamic property when invalid** – When the persisted player is missing, out of range, wrong game mode, or any exception occurs, the code now calls `entity.setDynamicProperty?.("mb_target_player", undefined)` so normal targeting and caching can resume.
4. **Catch path** – The inner try/catch around game-mode and distance checks is unchanged; the outer clear runs after the block, so any exception also triggers the clear.

Result: Bears with a stale `mb_target_player` (e.g. player left, switched to creative, or moved out of range) clear the property once and then use normal `targetCache`, `entityId`, and `currentTick` logic instead of bypassing every tick.

---

**Date:** 2026-02-12

## mb_snowStorm: Remove unreachable VANILLA_SNOW_LAYER block in tryPlaceSnowLayerMajor

The `if (belowType === VANILLA_SNOW_LAYER)` block that calls `blockBelow.setType(SNOW_LAYER_BLOCK)` (lines 444–451) was unreachable because the earlier guard `if (belowType === SNOW_LAYER_BLOCK || belowType === VANILLA_SNOW_LAYER) return false;` already returned for VANILLA_SNOW_LAYER.

### Fix

- Relaxed the early guard so only `SNOW_LAYER_BLOCK` returns: `if (belowType === SNOW_LAYER_BLOCK) return false;`
- Kept a single handling path for VANILLA_SNOW_LAYER: the replacement block now runs and correctly converts vanilla snow to custom via `blockBelow.setType(SNOW_LAYER_BLOCK)`
- `aboveType` still returns for both SNOW_LAYER_BLOCK and VANILLA_SNOW_LAYER (never place snow on top of existing snow)

---

**Date:** 2026-02-12

## Snow block lists: grass_block contradiction fix & storm vs death/torpedo distinction

`minecraft:grass_block` appeared in both `SNOW_NEVER_REPLACE_BLOCKS` and `SNOW_REPLACEABLE_BLOCKS`, causing contradictory membership. Removed from `SNOW_REPLACEABLE_BLOCKS` so it only appears in `SNOW_NEVER_REPLACE_BLOCKS`.

### Changes made

1. **`BP/scripts/mb_blockLists.js`**
   - Removed `minecraft:grass_block` from `SNOW_REPLACEABLE_BLOCKS`.
   - Added header comment distinguishing: storm never replaces (SNOW_NEVER_REPLACE_BLOCKS) vs death/torpedo/buff replaceable (SNOW_REPLACEABLE_BLOCKS).
   - Updated JSDoc for `SNOW_REPLACEABLE_BLOCKS`: "Excludes grass_block - full ground blocks stay."

### Impact

- Death, torpedo, and buff bear snow placement no longer replace grass_block with snow; full ground stays.
- Storm (mb_snowStorm.js) already used SNOW_NEVER_REPLACE_BLOCKS for grass_block; no change needed.
- No other references expect grass_block to be replaceable (main.js uses grass_block only for dusted-dirt conversion, not snow).

---

**Date:** 2026-02-04

## Buff AI: Rejoin fix – world load / leave / spawn pipeline (mb_buffAI.js)

After the previous init hardening, the Buff AI still sometimes failed to run after **leaving the world and rejoining**: the timer/loop would not start, and sometimes even debug/init logs did not appear. Cause: the script stays loaded when leaving the world, so module-level state (`buffAIIntervalId`, `buffAIInitialized`) persisted, but the **interval was no longer valid** after world unload. The fallback only ran when `buffAIIntervalId === null`, so it never re-initialized on rejoin.

### Changes made

1. **playerLeave cleanup**  
   When the last player leaves (`world.getPlayers().length === 0`), the script now:
   - Calls `system.clearRun(buffAIIntervalId)` to cancel the interval
   - Sets `buffAIIntervalId = null`, `buffAIInitialized = false`, `buffInitAttempts = 0`  
   So on next join the fallback sees “not initialized” and starts a fresh interval.

2. **playerSpawn (initialSpawn) fallback**  
   Subscribed to `world.afterEvents.playerSpawn` with `event.initialSpawn` check. If the AI is still not initialized, it schedules `initializeBuffAI()` after 15 ticks so initialization can run after the player is fully in the world.

3. **Heartbeat `scriptEnabled` fix**  
   The heartbeat line used `enabled=${scriptEnabled}` but `scriptEnabled` was never defined in scope (causing a ReferenceError and potentially breaking the interval). It now uses `isScriptEnabled(SCRIPT_IDS.buff)` and logs correctly.

4. **Outer try/catch in interval callback**  
   The interval callback had an outer `try` without a `catch`; the inner `try/catch` was the only one. Added an outer `catch` so any error in the callback is logged and does not prevent the interval from continuing.

Result: Leaving the world clears the Buff AI interval; rejoining triggers playerJoin and/or playerSpawn fallback and re-initializes the AI loop. Multiple hooks (script load delay, playerJoin, playerSpawn) plus leave cleanup ensure the pipeline turns on reliably on world load and after rejoin.

---

**Date:** 2026-02-04

## Buff AI: Robust initialization with error handling (mb_buffAI.js)

The Buff AI script had intermittent initialization failures - sometimes it wouldn't initialize on world load, requiring multiple rejoin attempts. The issue was caused by:
1. `buffAIInitialized` flag being set inside the interval callback (too late)
2. Missing error handling around `system.runTimeout` and `world.afterEvents.playerJoin.subscribe` calls
3. No checks for API availability before using them

### Changes made

- **Set `buffAIInitialized = true` immediately** when initialization succeeds (before creating the interval), not inside the callback, so the fallback knows not to retry
- **Comprehensive error handling**: All `system.runTimeout` calls wrapped in try-catch with logging
- **API availability checks**: Check `typeof system !== "undefined"` and `typeof world !== "undefined"` before using APIs
- **Robust fallback subscription**: The `world.afterEvents.playerJoin` fallback now has full error handling and checks system availability before scheduling retries
- **Better retry error handling**: All retry attempts in `initializeBuffAI` now have try-catch around `system.runTimeout` calls with error logging

Result: The Buff AI script now reliably initializes on world load with multiple fallback mechanisms and clear error logging for debugging. Initialization attempts are logged at every step, making it easier to diagnose any remaining issues.

---

**Date:** 2026-02-03

## Spawn controller: ocean floor detection + isolation fix (mb_spawnController.js)

Standing at the ocean floor with dusted dirt/infected biome nearby, the spawn controller was not detecting blocks. On land it worked; the issue was specific to ocean/underwater.

### Root cause

**Scan order was corner-first** — The loop iterated X and Z from (xStart, zStart), so the first ~2000 blocks checked per tick were always the same corner of the bounding box, far from the player. Dusted dirt near the player (e.g. on ocean floor) was never checked before the per-tick budget ran out.

### Changes made

- **Center-out scan order** — Build `xzPositionsByDistance`: all (x,z) within discovery radius, sorted by distance from player. Iterate this list instead of nested for (x) for (z). The main scan and expanded scan both use this order. Nearby dusted dirt (ocean floor, shore) is now checked first.
- **Isolation definition** — "Isolated" is multiplayer-only: other players exist in the world but none within 96 blocks. If the player is the **only** player in the world, they are never isolated. Added early return in `isPlayerIsolated` when `allPlayers.length <= 1` so single player always gets full discovery radius (75 blocks), not the reduced 40.

### Additional fixes (ocean floor + infected biome scan)

- **Quick check / scanAroundDustedDirt: don't break on water** — When scanning for dusted dirt, the code used to `break` on any non-air block. Water is non-air, so the scan stopped at the water surface and never reached dusted dirt on the ocean floor. Changed to `if (isAirOrWater(block)) continue` so we scan through water to find dusted dirt below.
- **Infected biome fallback scan** — When the normal scan finds few or no tiles (and we're in overworld), the controller now calls `dimension.findClosestBiome(..., "mb:infected_biome", {...})`. If an infected biome is found within range (96 blocks), it runs a focused scan around that biome center (20-block radius XZ, ±15 Y). Uses the same water-continue logic. This helps when the player is in an ocean but dusted dirt exists in a nearby infected biome on shore.

---

**Date:** 2026-02-01

## Intro: per-player so each new player gets full intro

Previously the intro was tracked with a **world** property (`mb_world_intro_seen`), so once any player had seen the intro in that world, no other player ever got it. Requirement: **each player who has not joined a world before should get the full intro.**

### Changes made

1. **main.js**
   - Added **PLAYER_INTRO_SEEN_PROPERTY** (`mb_intro_seen`) — per-player dynamic property meaning "this player has seen the intro."
   - **showWorldIntroSequence**: checks/sets **getPlayerProperty(player, PLAYER_INTRO_SEEN_PROPERTY)** instead of world property, so only that player is marked as having seen the intro.
   - **Player join handler**: uses **getPlayerProperty(player, PLAYER_INTRO_SEEN_PROPERTY)** to decide whether to show intro for this player.
   - **Discovery suppression**, **spawn fallback**, **minor infection init**, **giveBasicJournalIfNeeded**: all now use the **player’s** intro-seen flag (getPlayerProperty(player, PLAYER_INTRO_SEEN_PROPERTY)) so behavior is per-player.
   - Left WORLD_INTRO_SEEN_PROPERTY in place as legacy; intro logic no longer uses it.

2. **mb_dayTracker.js**
   - Import **getPlayerProperty** from `mb_dynamicPropertyHandler.js`.
   - "First-time player" and welcome-message timing now use **getPlayerProperty(player, "mb_intro_seen")** so each player is classified by whether **they** have seen the intro.

Result: Every player who joins and has not seen the intro before gets the full intro sequence; returning players skip it. State is stored per player (dynamic property), not per world.

---

**Date:** 2026-02-01

## Mining AI: cleanup lastBlockBreakTick to prevent unbounded memory growth (mb_miningAI.js)

The per-entity Map **lastBlockBreakTick** (lines 267–269) was never cleared; only **lastMiningTick** was pruned in the existing cleanup routine. Inactive entity IDs could accumulate in **lastBlockBreakTick** and cause memory growth.

### Fix

- In the same cleanup block that prunes **lastMiningTick** (around line 10676), added a matching loop for **lastBlockBreakTick**: iterate over `lastBlockBreakTick.entries()`, and for each `entityId` where `!activeWorkerIds.has(entityId)`, call `lastBlockBreakTick.delete(entityId)`.
- **buildQueues** is already cleaned in this routine via the existing loop that calls `releasePlan(entityId)` for inactive entities (lines 10655–10660), so no change was needed there.

Result: **lastBlockBreakTick** and **lastMiningTick** stay in sync; both maps are pruned for the same inactive entity IDs, preventing unbounded growth.

---

**Date:** 2026-02-01

## Mining AI: run every tick for movement, throttle only block breaking (mb_miningAI.js)

Bears were going slow and not climbing blocks/stairs because **processContext** was only called every **miningInterval** ticks (2–12 ticks by day) for leaders and followers. That throttled the whole AI (pathfinding, steering, climbing) instead of only block-breaking speed.

### Fix

1. **Main loop**  
   Leaders and followers now run **processContext every tick**. The `if (ticksSinceLastMining >= miningInterval)` guard and `lastMiningTick.set` for leaders/followers were removed so movement and climbing run every tick.

2. **Block-breaking throttle inside processContext**  
   - New map: **lastBlockBreakTick** — last tick this entity broke a block.  
   - At start of processContext: `miningInterval = getMiningInterval()`, `allowMiningThisTick = (tick - lastBlockBreakTick) >= miningInterval`, `effectiveBudget = allowMiningThisTick ? digBudget : 0`, and **digContext.max = effectiveBudget**.  
   - At end of processContext: if `digContext.cleared > 0` then `lastBlockBreakTick.set(entity.id, tick)`.

Result: Bears get steering/impulse and stair logic every tick (responsive movement and climbing). Block breaking still respects mining speed (every 2–12 ticks by day). Idle bears unchanged (still process at miningInterval * 2).

---

## Mining debug logging reverted (mb_miningAI.js)

Rate-limited mining debug (DEBUG_LOG_INTERVAL / shouldLogMiningDebug) was reverted because mining bears stopped jumping onto 1-block steps and climbing upward stairs. All rate-limiting was removed and the original pattern restored (see above for the actual movement fix).

---

**Date:** 2026-02-01

## Snow block lists extracted to shared module

`SNOW_REPLACEABLE_BLOCKS` and `SNOW_TWO_BLOCK_PLANTS` were duplicated in `BP/scripts/mb_torpedoAI.js` (lines 28–46) and `BP/scripts/main.js`. They were moved into a shared module and both files now import them.

### Changes made

1. **New `BP/scripts/mb_blockLists.js`**  
   - Exports `SNOW_REPLACEABLE_BLOCKS` and `SNOW_TWO_BLOCK_PLANTS` (same names).  
   - Contains the canonical Sets used for death/torpedo snow placement (grass, flowers, foliage; 2-block-tall plants).  
   - `SNOW_REPLACEABLE_BLOCKS` originally included `minecraft:grass_block`; removed Feb 12 (see above) to avoid contradiction with SNOW_NEVER_REPLACE_BLOCKS.

2. **`BP/scripts/mb_torpedoAI.js`**  
   - Removed inline `SNOW_REPLACEABLE_BLOCKS` and `SNOW_TWO_BLOCK_PLANTS` definitions.  
   - Added: `import { SNOW_REPLACEABLE_BLOCKS, SNOW_TWO_BLOCK_PLANTS } from "./mb_blockLists.js";`  
   - All existing usages (e.g. `.has(blockType)`) unchanged; symbols now come from the import.

3. **`BP/scripts/main.js`**  
   - Removed inline `SNOW_REPLACEABLE_BLOCKS` and `SNOW_TWO_BLOCK_PLANTS` definitions.  
   - Added: `import { SNOW_REPLACEABLE_BLOCKS, SNOW_TWO_BLOCK_PLANTS } from "./mb_blockLists.js";`  
   - All references in death/snow placement logic unchanged; symbols now come from the import.

Result: Single source of truth for snow-replaceable and two-block-plant lists; no code changes needed at call sites beyond the new imports.

---

**Date:** 2026-01-31

## "Check your journal" — one-time only (fixed)

The "Check your journal" message was repeating (once per "batch" until the player opened the journal). It should behave like other discovery messages: **show once ever when the player discovers something new**, and **never repeat** for that same discovery.

### Changes made

1. **Persistent flag in codex** (`mb_codex.js`)  
   - Added `checkJournalMessageShown: false` to `codex.items` in `getDefaultCodex()` so the one-time state is saved with the player's codex.

2. **`main.js`**  
   - Removed the in-memory `checkJournalPendingByPlayer` Map and all references (including the delete when opening the journal).  
   - **`sendDiscoveryMessage`**: When the player has the journal (`snowBookCrafted`), the message and sound are shown only if `!codex.items.checkJournalMessageShown`. When shown, set `codex.items.checkJournalMessageShown = true`, call `markCodex` and `saveCodex`.  
   - **Golden apple infection reduction**: Same logic — show "Check your journal" only if the flag is false; when shown, set the flag and rely on the existing `saveCodex` to persist.

Result: "Check your journal" is sent **once per player** (first discovery with journal); it never repeats, consistent with other discovery messages.

---

**Date:** 2026-02-01

## Addon difficulty (Easy / Normal / Hard)

Per-world difficulty toggle that affects spawn rate, hits to infect, and infection speed. Only first joiner or players with **mb_cheats** can change it; others can see the current value in Settings.

### Changes made

1. **mb_dynamicPropertyHandler.js**
   - **ADDON_DIFFICULTY_PROPERTY** (`mb_addonDifficulty`): world property, values -1 (Easy), 0 (Normal), 1 (Hard).
   - **getAddonDifficultyState()**: returns `{ value, spawnMultiplier, hitsBase, infectionDecayMultiplier, miningIntervalMultiplier, torpedoMaxBlocksMultiplier }` (Easy: 0.7, 4, 0.8, 1.2, 0.85; Normal: 1.0, 3, 1.0, 1.0, 1.0; Hard: 1.3, 2, 1.2, 0.6, 1.5).

2. **mb_spawnController.js**
   - Import **getAddonDifficultyState** from `mb_dynamicPropertyHandler.js`.
   - Spawn chance multiplier is multiplied by **getAddonDifficultyState().spawnMultiplier** (on top of existing Spawn Difficulty).

3. **main.js**
   - Import **getAddonDifficultyState** from `mb_dynamicPropertyHandler.js`.
   - **Hits to infect**: `hitsNeeded` is now **addonDifficulty.hitsBase** (default/immune) or **addonDifficulty.hitsBase - 1** (minor infected), instead of fixed HITS_TO_INFECT / MINOR_HITS_TO_INFECT.
   - **Infection speed**: infection timer decrement (40-tick step) and snow-tier daily decay are multiplied by **getAddonDifficultyState().infectionDecayMultiplier**.
   - Cure messages (minor and major) now show dynamic hit counts from addon difficulty.

4. **mb_codex.js**
   - Import **ADDON_DIFFICULTY_PROPERTY**, **getAddonDifficultyState** from `mb_dynamicPropertyHandler.js`.
   - **openGeneralSettings**: added **Addon Difficulty** dropdown (Easy / Normal / Hard). Read from world property; on save (only if **canChangeBeta(player)**), set **mb_addonDifficulty** and sync **mb_spawnDifficulty** to the same value so spawn matches until overridden in Developer Tools.

5. **docs/CODEX_UNLOCKS.md**
   - New **§11. Addon difficulty**: describes what it affects, where to set it (Journal → Settings → General), who can change it, and that Spawn Difficulty in Developer Tools is separate and can override spawn.

Result: Players set Easy/Normal/Hard in Basic or Powdery Journal → Settings → General; it affects spawn rate, hits to infect, and infection speed for the whole world. Spawn Difficulty (dev-only -5 to +5) remains separate and can be fine-tuned after changing addon difficulty.

---

**Date:** 2026-02-01

## Addon difficulty: UI label, hit messages, mining & torpedo (Hard)

- **Settings label** (mb_codex.js): Normal players see only "Addon Difficulty". Players with **mb_cheats** see the full description with numeric multipliers (spawn, major hits from nothing/minor, infection decay, mining interval, torpedo max blocks) and E/N/H values.
- **Difficulty hit messages**: All player-facing hit counts (summary, infection screen, cure text, item descriptions, progression) now use **getAddonDifficultyState()** instead of hardcoded 2/3.
- **Hard mode** (mb_dynamicPropertyHandler.js): `miningIntervalMultiplier` 0.6 → **0.5**, `torpedoMaxBlocksMultiplier` 1.5 → **2.0**. CODEX_UNLOCKS.md §11 updated to mention mining bear mine speed and torpedo max blocks per dive.

---

**Date:** 2026-02-01

## Developer Tools: Infection button fix and new optional tools

### Bug fix: Infection button (Dusted Journal)

- **Problem**: Clicking "Infection" in the Dusted Journal after using "Fully Unlock Codex" closed the book.
- **Causes**: (1) `isMinor` was only defined inside `if (hasInfection)` but used later when the player had no infection → ReferenceError. (2) `fullyUnlockCodex` set `codex.infections.minor = true` and `codex.infections.major = true` (booleans), while the rest of the code expects `codex.infections.minor.discovered` / `codex.infections.major.discovered` (objects).
- **Fixes**: Define `isMinor` at the start of `openInfections()`; in `fullyUnlockCodex` set `codex.infections.minor = { discovered: true }` and `codex.infections.major = { discovered: true }`; use `minorDiscovered` / `majorDiscovered` helpers that support both object and boolean shapes for existing saves.

### New optional Developer Tools (Codex → Developer Tools)

After existing options (e.g. Spawn Difficulty, Fully Unlock Codex):

1. **Clear / Set Infection** — Menu: Clear infection | Set minor | Set major (`clear_infection`, `set_infection [minor|major]`).
2. **Grant / Remove Immunity** — Grant permanent | Grant temporary (5 min) | Remove immunity (`grant_immunity`, `remove_immunity`).
3. **Reset Intro** — Clears `mb_intro_seen` so the intro plays again on next join (`reset_intro`).
4. **List Nearby Bears** — Prints bear-type counts within 128 blocks in chat (`list_bears`).
5. **Force Spawn** — Choose bear type → target (Near me | other players) → distance (Near 2 blocks | 5 | 10 | 15 | 20 | Random within 20). Spawns at a random angle at that distance (`force_spawn [entityId] [playerName?] [distance|random]`).
6. **Dump Codex State** — Sends truncated codex JSON to chat (`dump_codex`).
7. **Set Kill Counts** — Select mob type, then 0–500 slider for that mob’s kill count (`set_kill_count [mobKey] [value]`).

**main.js**: New `executeMbCommand` cases for the above. Force spawn supports 2 args (entityId, distance) or 3 (entityId, playerName, distance); distance can be numeric or `"random"` (1–20 blocks).

---

**Date:** 2026-02-03

## Nausea when standing on infected ground too long

Player requested a "little extra push" when standing on infected blocks: add **nausea for 5 seconds** at the same times the existing message (and/or sound) already fire.

### Changes made (main.js)

1. **Constant**  
   - **GROUND_NAUSIA_DURATION_TICKS** = 100 (5 seconds), placed with other ground-exposure constants.

2. **applyEffect(player, "minecraft:nausea", GROUND_NAUSIA_DURATION_TICKS, { amplifier: 0 })** added at every infected-ground warning:
   - **Minor ground warning** (10s): after "§eThe ground beneath you feels wrong...".
   - **Ground warning** (60s): after "§eYou start to feel off...".
   - **Ambient warning** (10 min): after "§eYou start to feel off...".
   - **Major snow increase from ground** (in `applySnowExposureIncrease` when `fromGround`): after the existing subtle `mob.enderman.portal` sound.

Result: Whenever the player gets a message or sound from standing on infected ground (dusted dirt / snow layer), they also get 5 seconds of nausea. Duration is controlled by one constant for easy tuning.

---

**Date:** 2026-02-03

## Achievements, journal UI order, and new/updated section tracking

### 1. Achievements (main.js + mb_codex.js)

- **First Minor Cure**: On first minor cure, set `codex.achievements.firstMinorCure = true`, show action bar "§7First cure. Well done."
- **First Major Cure**: On first major cure, set `codex.achievements.firstMajorCure = true`, show action bar "§7Major infection cured. You did it."
- **First bear kill (per base type)**: In `trackBearKill`, when a base type’s kill count becomes 1, set `codex.achievements.firstKill_<type> = true` and send chat message "§7Achievement: First &lt;label&gt; kill." Base types: Maple Bear (tinyBear), Infected Bear, Buff Maple Bear, Flying Maple Bear, Mining Maple Bear, Torpedo Maple Bear.
- **Achievements section**: Always visible in the Powdery Journal main menu (no longer gated on having any achievement). **openAchievements** now shows First Minor Cure, First Major Cure, and all six first-kill achievements (✓/✗).

### 2. Powdery Journal main menu (mb_codex.js)

- **Order**: Infection → Symptoms → Mobs → Items → Biomes and Blocks → Late Lore → Timeline → Achievements → (Debug Menu, Developer Tools if mb_cheats) → Settings → Search (if enabled).
- **Colors**: §f for content sections, §e for Settings, §b for Search and Debug, §c for Developer Tools. Achievements always shown with §f.
- Search remains toggleable in Settings ("Show Search Button"); Settings and Search at bottom.

### 3. New/updated section tracking (mb_codex.js + mb_dayTracker.js)

- **Default codex**: `journal.sectionLastUnlock`, `journal.sectionLastViewed`, `journal.hasOpenedBefore` added.
- **markCodex**: Maps path prefix (infections/cures/status → infection; effects/snowEffects/symptomsUnlocks/minorInfectionEffects → symptoms; mobs, items, biomes, journal → lateLore) and sets `sectionLastUnlock[section] = Date.now()`.
- **markSectionUnlock(player, section)** exported; **mb_dayTracker** calls it for section `"timeline"` when **recordDailyEvent** adds a new event.
- **markSectionViewed(player, sectionId)** (internal): called when opening Infection, Symptoms, Mobs, Items, Biomes, Late Lore, Timeline; sets `sectionLastViewed[sectionId] = Date.now()`.
- **Main menu buttons**: If a section has unseen content (`sectionLastUnlock` set and either never viewed or `sectionLastUnlock > sectionLastViewed`), button shows **§l§o** (bold+italic) and " §8(new)" or " §8(updated)" (new = never viewed, updated = viewed before but new content since). Cleared when that section is opened.
- **First open**: First time opening the Powdery Journal shows body line "§7Things are logged as you experience them!" and sets `hasOpenedBefore = true`.

---

**Date:** 2026-02-03

## Addon-wide message color coding (plan updated)

Plan file: `.cursor/plans/addon-wide_message_color_coding_3d442138.plan.md`.

### Intro unchanged

- **Intro sequence** is **not** changed color-wise. All intro/welcome messages stay exactly as they are (current hardcoded colors). Do not replace any intro text with the new chat color constants. Sanity-check allows hardcoded § codes in intro messages.

### What each color means (quick reference)

| Constant | Code | In-game color | Meaning |
| -------- | ---- | ------------- | ------- |
| `CHAT_ACHIEVEMENT` | §6 | Gold | Achievements (first kill, first cure, KO, etc.). |
| `CHAT_DANGER` | §c | Red | Danger / infection / severe warnings. |
| `CHAT_DANGER_STRONG` | §4 | Dark red | Highest severity (e.g. "SOMETHING IS WRONG"). |
| `CHAT_SUCCESS` | §a | Green | Success: cured, immune, saved, "Settings saved!", unlock confirmed. |
| `CHAT_WARNING` | §e | Yellow | Caution: ground feels wrong, immunity weakening, minor infection. |
| `CHAT_INFO` | §7 | Gray | Neutral info: hits left, journal hints, general text. |
| `CHAT_DEV` | §8 | Dark gray | MBI/debug only; low emphasis. |
| `CHAT_HIGHLIGHT` | §f | White | Highlight for names, numbers, or emphasis inside a line. |
| `CHAT_SPECIAL` | §b | Aqua / cyan | Special/secondary emphasis (e.g. who shared with you, temporary immunity note). |

Implementation: new `BP/scripts/mb_chatColors.js`; then replace hardcoded colors in `main.js`, `mb_codex.js`, and `mb_dayTracker.js` (excluding intro).

---

**Date:** 2026-02-03

## QoL and dev tools ideas (documentation only)

User asked for quality-of-life ideas and more developer tools. No code changes; a new doc was added.

### Created

- **docs/QoL_AND_DEV_TOOLS_IDEAS.md** – Central list of:
  - **QoL ideas**: Codex (resume last section, bookmarks, “new” badges, day/mood quote); infection (optional on-screen timer, cure reminder, quick reference, post-cure summary); discovery (toast/sound on unlock, next-milestone hint, kill-count progress); settings (bear vs journal sound sliders, notification frequency, minimal UI); fun (easter-egg entries, achievement pop).
  - **Dev tool ideas**: Dump codex full/summary and target player; list bears with radius/dimension options; force spawn quantity; simulate next day; clear all bears in radius; inspect nearest bear; export/import codex; reset single codex section; spawn difficulty preview text; optional performance snapshot.

Existing dev tools (Script Toggles, Fully Unlock, Reset/Set Day, Spawn Difficulty, infection/immunity menus, Reset Intro, List Bears, Force Spawn, Dump Codex, Set Kill Counts, Debug Menu) are summarized in the same doc for reference.

---

**Date:** 2026-02-03

## Implementation of QoL and Dev Tools (from docs/QoL_AND_DEV_TOOLS_IDEAS.md)

All tailored features from the ideas doc were implemented.

### QoL
- **Flying bears 10% distracted** – 10% of flying Maple Bears target closest mob/entity instead of only players (`mb_flyingAI.js`: `flyingDistractedMap`, `isFlyingDistracted`, cleanup).
- **Optional infection timer on screen** – Settings: “Infection timer on screen” and “Only critical infection/day warnings”. Actionbar shows “~X days left” when infected and option on (`main.js` interval; `mb_codex.js` getPlayerSettings, settings UI).
- **Cure reminder** – If major infection and player has weakness + enchanted golden apple, actionbar “You have the cure components.” (cooldown 300 ticks) (`main.js`).
- **First-aid summary in book** – Infections page shows “Quick reference: Minor: Golden Apple + Golden Carrot. Major: Weakness + Enchanted Golden Apple.” when player has cured before and all cure items unlocked (`mb_codex.js` openInfections).
- **Post-cure summary** – Minor/Major cure success messages now include “Cured on Day X” and “Permanent immunity granted” (`main.js`).
- **Next milestone hint** – Day message includes “Tomorrow: a turning point approaches.” when next day is a milestone (`mb_dayTracker.js`).
- **Critical warnings only** – When “Only critical infection/day warnings” is on, day messages show full text only on milestone days; otherwise “Day X” only (`mb_dayTracker.js` getPlayerSettings).
- **Bear / block break volume** – Already in Settings (dropdowns). **Infection timer** and **critical warnings** toggles added to General Settings (Powdery and Basic Journal).
- **Easter-egg hidden achievements** – Death by all bear types, Day 100 survived, 100 torpedo kills. Tracked in codex; shown in Achievements only when unlocked (`main.js` entityDie, `mb_dayTracker.js` day 100, `main.js` trackBearKill, `mb_codex.js` openAchievements).
- **Daily log mood** – When viewing a day in Daily Log, a short mood line (hopeful/grim/dry) by day index (`mb_codex.js` openDailyLog).

### Dev tools
- **Spawn Controller toggle** – Added to Script Toggles and `mb_scriptToggles.js` (SCRIPT_IDS.spawnController). `mb_spawnController.js` checks `isScriptEnabled(SCRIPT_IDS.spawnController)` at start of main runInterval.
- **Dump Codex** – Snippet / Summary / Full; output to chat and logs. Target player picker before dump. `main.js` dump_codex handles args `[mode?, targetName?]`; Summary = high-level keys/counts; Full = chunked chat + full to console.
- **Target player for dev commands** – Reset Codex, Clear/Set Infection, Grant/Remove Immunity, Set Kill Counts, Dump Codex now open “Apply to: [Me] [Player list]” before running (`mb_codex.js` openTargetPlayerMenu, openInfectionDevMenu(targetName), openImmunityDevMenu(targetName), openSetKillCountMenu(targetName), openDumpCodexTargetMenu).
- **Bears target specific player** – Dev tool “Bears Target Player”: set world property `mb_force_target_player` to player name or clear. Flying, Torpedo, and Mining AI check this in findTarget/findNearestTarget and prefer that player (`main.js` set_force_target_player; `mb_flyingAI.js`, `mb_torpedoAI.js`, `mb_miningAI.js` getWorldProperty("mb_force_target_player")).
- **List bears radius/dimension** – “List Nearby Bears” opens menu: radius 32/64/128/256 (current dim) or 128 in overworld/nether/end. `main.js` list_bears uses args[0]=radius, args[1]=dimension id.
- **Force spawn quantity** – After choosing bear type and target/distance, new step “Quantity: 1 / 5 / 10”. `main.js` force_spawn uses args[3] as quantity (default 1).
- **Simulate next day** – New command/button: increment world day by 1, run milestone logic. `main.js` simulate_next_day.
- **Clear bears (radius)** – New command/button: kill all Maple Bears and infected mobs within 64 or 128 blocks. `main.js` clear_bears.
- **Inspect nearest bear** – New command/button: nearest bear within 20 blocks; typeId, health, position, dimension to chat. `main.js` inspect_entity.
- **Reset single codex section** – New command/button: target player then section Mobs/Items/Infections/Journal/All. `main.js` reset_codex_section.
- **Spawn difficulty preview** – In Spawn Difficulty menu, one-line reminder (e.g. "Fewer spawns, longer intervals." for value ≤ -2). `mb_codex.js` getSpawnDifficultyPreview, openSpawnDifficultyMenu.

---

**Date:** 2026-02-03

## Flying Maple Bear anger spread (Minecraft-style)

Flying Maple Bears now "spread anger" like vanilla mobs: if a player hits a flying MB, it targets that player; if any Maple Bear hits a player, nearby flying MBs also target that player.

### Changes made

1. **mb_flyingAI.js**
   - **angerTargetMap** – per-entity map: `entityId → { entity: Player, expireTick }`. Duration **ANGER_DURATION_TICKS** (600 = 30 s). **ANGER_SPREAD_RADIUS** = 24 blocks for "nearby" when another bear hits a player.
   - **findTarget()** – after dev force-target, checks angerTargetMap; if valid (same dimension, in range, not creative/spectator), returns that player as target and caches it.
   - **setFlyingBearAngerTarget(flyingEntity, player)** – exported; sets this flying MB to target the player for 30 seconds and clears target cache.
   - **angerNearbyFlyingBearsAtPlayer(dimension, location, targetPlayer, radius)** – exported; finds flying MBs within radius and sets their anger target to the player.
   - Cleanup: when targetCache entry is removed (entity invalid), angerTargetMap entry is removed for that entityId.

2. **main.js**
   - Import **setFlyingBearAngerTarget** and **angerNearbyFlyingBearsAtPlayer** from `mb_flyingAI.js`.
   - **entityHurt (flying MB hurt by player)** – new subscription: if hurt entity is a flying MB and damage source is a player, call `setFlyingBearAngerTarget(hurtEntity, source.damagingEntity)`.
   - **entityHurt (player hurt by bear)** – inside existing "player hurt by Maple Bear" block, call `angerNearbyFlyingBearsAtPlayer(player.dimension, player.location, player)` so nearby flying MBs target that player.

Result: Hitting a flying MB makes it chase you; when any bear hits a player, flying MBs within 24 blocks also chase that player for 30 seconds. “Fewer spawns, longer intervals.” for value ≤ -2). `mb_codex.js` getSpawnDifficultyPreview, openSpawnDifficultyMenu.

---

**Date:** 2026-02-03

## Mining AI: force-target dev override before cache (mb_miningAI.js)

Cached targets could hide the dev override from `getWorldProperty("mb_force_target_player")`: the cache was checked first and returned a stale target before the force-target block ran.

### Changes made

- **findNearestTarget** – Moved the block that reads `forceTargetName` and resolves `forcePlayer` to run **before** the cached-target logic.
- When `mb_force_target_player` is set, the function now calls `targetCache.delete(entityId)` so the cache is bypassed for that entity while the override is active, then runs the force-player resolution; if the forced player is in range, it returns (and caches) that target.
- `origin`, `maxDistSq`, and `dimensionId` are computed once at the start so both the force-target and cache paths can use them; the inner redundant `const origin` in the cache block was removed.

Result: The force-target check always runs first; targetCache cannot return a stale target while `mb_force_target_player` is set.
