# Context Summary

Running log of **what changed and why** (gameplay, scripts, assets, docs). Used by humans and AI assistants. **Convention:** add new work as **dated sections at the top** (newest first). Older material stays below.

**Single source of truth:** This file replaces the separate `docs/ai/CONTEXT_SUMMARY.md` log (that path now redirects here). A **historical archive** from the old AI file is appended at the **bottom** of this document; if something disagrees with a newer dated section above, trust the dated section.

---

**Date:** 2026-03-28

## Camp: big-base footprint (100 XZ / ±150 Y) + gentler ramp

- **`mb_spawnMobilityCamp.js`**: **Ramping** still only while cluster centroid is inside **30 XZ / ±50 Y** of the anchor (leave = no camp build + 2× decay). **Big-base mode**: centroid must stay inside **100 XZ / ±150 Y** for **48 000 ticks (~2 in-game days)** to qualify; leaving that footprint resets qualification and turns big mode off. When `bigBaseActive`: full ramp **36 000t** (vs 12 000t), spawn cap **+22%** (vs +35%), storm slice **+7%** (vs +12%). Storm scale uses **per-cluster** `ramp × stormCap` max across overworld clusters (`lastOverworldStormCampExtra`).
- **`mb_spawnController.js`**: Camp dev HUD uses `rampFullTicks` for ETA; **`§dB§r`** = big-base active, **`§7·§r`** = small.
- **`mb_codex.js`**: Dump + dev “half/max ramp” use current cluster `rampFullTicks`.

## Spawn scan perf HUD: own 10t interval (merge with camp)

- **Bedrock** exposes a **single** action bar; dev HUDs are **merged** in `mb_actionBarHud.js` (`[n]` prefix when multiple segments). Camp refreshed every 10t while **spawn scan overlay** only ran inside the **throttled** main spawn loop (often skipped for `currentDay < 2` or spawn speed gate), so the Scan segment was missing while Camp kept repainting — looked like “only one bar.” **Change:** `refreshSpawnScanPerfHudOverlay()` + **`system.runInterval(..., 10)`** (after spawn script check; clears segment when spawn script off). Removed duplicate overlay block from the main spawn interval.

## Camp dev HUD: ETA to full spawn bonus

- **`mb_spawnController.js`**: Camp watch action bar shows **time until the camp ramp hits max** (same half-day `CAMP_RAMP_FULL_TICKS` sedentary accumulation as spawn pressure). Uses cluster centroid + `getClusterCampDebugMetrics`: **`§amax§r`** at 100% ramp; **`§7+~10m§r`**-style cold start when no camp state yet; **`§6>~Xm§r`** while inside the camp cylinder (still building); **`§c!~Xm§r`** while **outside** the cylinder (ramp decaying — the ETA is “if you stay put in-zone from current progress”).

## Action bar: camp dev HUD persistence + merged layout

- **`mb_actionBarHud.js`**: Bedrock fades the action bar if `setActionBar` is not called often enough; camp/spawn text can stay identical for many ticks while infection text changes. **Change:** repaint when merged **content** changes **or** when `system.currentTick - lastPaint >= 10` (`ACTION_BAR_HEARTBEAT_TICKS`, aligned with infection HUD refresh). Added **`system.runInterval(..., 10)`** to call `applyHudActionBar` for every player with active segments so the line is refreshed at least every 10 ticks even if only the camp segment is enabled. Slot order unchanged: **infection (10) → spawn scan perf (20) → camp dev (30)** with `§8┃` separators and `[n]` prefix when multiple segments.
- **`mb_spawnController.js`**: Camp dev HUD interval **12 → 10** ticks so updates align with the action-bar heartbeat.

## Dev: public admin UI preview + quiet public console

- **`mb_codex.js`**: Exported `isDevPreviewAdminMainMenuEnabled()` (world flag `mb_world_dev_preview_admin_main`). When `INCLUDE_FULL_DEVELOPER_TOOLS` is true, **Developer Tools** gains a **Public release preview** block: toggle showing **§6Admin tools** on the powdery + basic journal main menus (same placement as public), and a button to open the admin panel via **`runAdminSurfaceWithDisclaimer(..., { forcePublicDisclaimer: true })`**. While preview is on, **`openAdminToolsWithDisclaimer`** uses that forced path so the main-menu Admin entry matches the public disclaimer → menu flow. Pinned dev shortcuts on the main menu still skip the admin disclaimer in full dev (unchanged).
- **`mb_buildConfig.js`** (release + dev twin): If `!INCLUDE_FULL_DEVELOPER_TOOLS`, replace `console.log` / `info` / `warn` / `debug` with no-ops; **`console.error` unchanged**.
- **`main.js`**: Side-effect **`import "./mb_buildConfig.js"`** immediately after `@minecraft/server-ui` so the console patch runs before other app modules load.
- **`AGENTS.md`**: Bridge/testing note — use **`BP - Dev/`** + **`RP - Dev/`** in Bridge pack folders; restore dev **`mb_buildConfig.js`** after syncing from public `BP/`.
- **`BP - Dev/`**: Synced **`main.js`** and **`mb_codex.js`** from `BP/`; dev **`mb_buildConfig.js`** keeps the same console block (inactive while dev tools flag is true).

**Date:** 2026-03-31

## AGENTS + Cursor rule: single context log

- **`AGENTS.md`**: “Context log (single file)” — maintain **`docs/context summary.md`** only; **`docs/ai/CONTEXT_SUMMARY.md`** is a redirect stub.
- **`.cursor/rules/what-is-the-maple-bear-addon.mdc`**: same instruction for session summaries.

## Dev tools: world perf combos (spawn + scan + storm + mining)

- **`mb_codex.js`**: **Spawn Controller → Performance → World perf combos** — one tap applies spawn intensity + scan preset + `mb_storm_work_mult` / `mb_mining_work_mult` (or clears manuals for “auto storm/mining”). Pairs align with **Quick combos** + **Heavy perf** Low / Ultra / Med-Low tiers.

## Documentation: one context log

- Merged **`docs/ai/CONTEXT_SUMMARY.md`** into the **Historical archive** at the bottom of this file; **`docs/ai/CONTEXT_SUMMARY.md`** is now a redirect stub.
- Updated **`docs/README.md`**, **`docs/ORGANIZATION.md`**, **`docs/development/DEVELOPER_ONBOARDING.md`**.

## Emulsifier fuel UI: Snow + Iron label contrast (`mb_codex.js`)

- **Add Fuel / Change Fuel** option **Snow + Iron** used `§7` (gray) on the button title; hard to read on light-grey ActionForm backgrounds. **Change:** use `§9` (blue) for the iron-tier label in both `openAddFuelMenu` and `openFuelMenu` option arrays.
- **Dev refuel menu** (`getFuelCostAvailabilityLine`): material names after counts were `§7`; **change** to `§f` (white) with `§8` on the “You have:” prefix for clearer inventory lines on buttons.

## Emulsifier machine item + dusted dirt crafting + recipes

- **Emulsifier item:** `BP/items/emulsifier_machine.json` — `mb:emulsifier_machine` with `minecraft:block_placer` → `mb:emulsifier_machine` (loot table already referenced this item; it was missing from the pack). **No `minecraft:icon`** so the client uses the **block’s 3D/item appearance** (avoids broken flat icons when pointing `item_texture` at terrain-only paths).
- **Emulsifier recipe:** `BP/recipes/emulsifier_machine.json` — top `IHI` (iron corners, hopper above center), middle `RDG` (redstone **block**, `mb:dusted_dirt`, glowstone), bottom `III` (iron row). Unlock: `mb:dusted_dirt`.
- **Dusted dirt item:** `BP/items/dusted_dirt.json` — placeable `mb:dusted_dirt` via `block_placer`; **no `minecraft:icon`** (same block-icon behavior as emulsifier).
- **Dusted dirt (shapeless, crafting table):** one `mb:snow` + one soil block → 1× `mb:dusted_dirt` — `dusted_dirt_from_dirt.json`, `dusted_dirt_from_grass_block.json`, `dusted_dirt_from_coarse_dirt.json`, `dusted_dirt_from_podzol.json`, `dusted_dirt_from_mycelium.json` (replaced invalid `minecraft:rooted_dirt` recipe for Bedrock). Unlock: `mb:snow`.

## Emulsifier running sounds (`RP/sounds/emulsifier`, `mb_spawnController.js`)

- **Definitions:** `sound_definitions.json` adds `mb.emulsifier_run` (block category, **`max_distance` 16* blocks so it fades out sooner; was 24) with three random variants: `Gurgling Machine Sounds`, `Loud Mechanical Machine Sound`, `Machine Sounds` under `sounds/emulsifier/` (paths match existing pack convention, no extension).
- **When it plays:** While `processEmulsifierZones` has a zone **active** and **with fuel** after `advanceZoneFuelQueue`, `maybePlayEmulsifierRunningSound` fires at most every **90 ticks** (~4.5s) per machine via **`dimension.playSound`** at the **block center** (true positional audio; `sound_definitions` `max_distance` still applies).
- **Cleanup:** `emulsifierRunSoundLastTick` map keys cleared when fuel runs out, machine disabled, zone removed, block gone, or dev remove-nearest.
- **Dev tools:** `mb_devSoundCatalog.js` — category "Emulsifier" for previewing `mb.emulsifier_run`.

## Emulsifier machine on/off block textures

- **RP:** `terrain_texture.json` adds `emulsifier_machine_on` → `textures/blocks/emuslsifierblocktexture_on`; `emulsifier_machine` stays on the off atlas (`emuslsifierblocktexture_off_`).
- **BP:** `emulsifier_machine.json` defines state `mb:active` `[false, true]`, default off texture in base `material_instances`, permutation when `mb:active == true` uses `emulsifier_machine_on`.
- **Script (`mb_spawnController.js`):** `BlockPermutation.resolve` + `scheduleSyncEmulsifierMachineBlockVisual` after zone mutations (fuel, enable/disable, upsert, fuel depletion) and one-time bootstrap on first `processEmulsifierZones` when zones exist (world load / addon upgrade).
- **Fix (`mb_codex.js`):** Emulsifier UI “Enable/Disable” now checks `setEmulsifierActiveAtBlock` result with `r?.ok` (function returns `{ ok }`, not a boolean).
- **Unchanged:** `emulsifier.geo.json` (same UV layout for both atlases); `main.js` not required—placement already calls `upsertEmulsifierZoneAtBlock`, which syncs the block.

---

**Date:** 2026-03-28

## Multiplayer spawn load + snow hiccup self-only

- **`mb_spawnController.js`:** Stronger per-player scan shrink (`perPlayerRadiusDrop`, tight-group penalty), slightly higher barren cooldown multiplier and queue stagger defaults; **lowLag** preset tuned further. **Barren cooldown** scales 2→8 players instead of capping at 3+. **Per-tick spawn budget** uses steeper multipliers for 4–8 players (floor 1). **Global spawn cap** uses `getEffectiveMaxGlobalSpawnsPerTick()` (scales down from world player count). **Spread / tight-group tick staggering** uses dedicated helpers so 4–8 players rotate less often per tick (spread up to 28t, tight up to 26t).
- **`mb_infectionAudio.js`:** `playPowderHiccup` defaults to **radius 0** so only the eater hears the powder hiccup; pass `true` as 5th arg to restore nearby broadcast.

### Spawn controller verification (same session, code pass)

- **Scan HUD toggle:** `setSpawnScanPerfOverlayEnabled` stores **0** for off (not `undefined`) so deferred `setWorldProperty` cache does not re-read stale **1** from `world.getDynamicProperty`; codex toggle stays in sync.
- **Dusted cache validation:** Wave start tick only advances when a **non-empty** sample exists; drain uses **`world.getDimension(value.dimension)`** so a shared queue validates entries in their real dimension.
- **Scan yield balance:** `getScanYieldBalanceMultiplier` vs spread-MP reference limit; **`BLOCKS_PER_TICK_BUDGET`** keyed by **`getQueryBudgetPlayerCount`**; **`getEffectiveMaxCandidates` / SpacedTiles** and spawn tick modifiers use the same multiplier where intended.
- **Ideal bear pressure:** `getIdealNearbyBearTarget` + `getIdealBearPressureFactors` computed once per processed player from **`totalNearbyBears`**; **`idealBearPressureChanceMult` / `idealBearSpawnRateMult`** on modifiers feed **`attemptSpawnType`** (chance before cap; per-tick spawn cap and attempts). Hard limits unchanged (type caps, `maxCount`, global cap). *Nuance:* End / milestone chance tweaks run **after** ideal chance multiply—intentional for dimension-specific curves.

---

## Infection action bar hidden during scripted intro (`main.js`)

- **Issue:** `tryRefreshInfectionHudActionBar` only skipped the major-infection **cure hint** when `introInProgress.has(id)`; **timer line** (`showInfectionTimer`) still drew during the intro.
- **Change:** After the `infectionActionBarSuppressedUntilSpawn` check, if `introInProgress.has(id)`, call **`clearInfectionHudActionBar(player)`** and **return**. Removed redundant `!introInProgress.has(id)` from the cure-hint branch (intro path exits earlier).

---

## `countNearbyDustedDirtBlocks` dimension handling (`mb_spawnController.js`)

- **Issue:** `world.getDimension(dimension)` was called for string args without try/catch; cache compared `value.dimension` to a raw string while `dimensionId` could diverge from the resolved `Dimension.id`.
- **Change:** Resolve `resolvedDimension` with `try/catch` around `world.getDimension` (string id or `dimension.id`); if lookup fails, fall back to the passed-in object when it already exposes `getBlock`. Normalize **`dimensionId`** from **`resolvedDimension.id`** for cache filtering (`value.dimension !== dimensionId`). Require **`typeof resolvedDimension.getBlock === "function"`** before LOS checks so failed lookups do not throw.

---

**Date:** 2026-03-20

## Documentation refresh
- Updated root `README.md`, `TODO.md`, and `docs/README.md` (fixed mechanics summary path; added index entries).
- Added `docs/development/ADDON_SYSTEMS_AND_FEATURES.md` (systems/features catalog) and `docs/development/PROJECT_STATUS.md` (status + next steps).
- Cross-linked `docs/development/tracking/MECHANICS_SUMMARY.md` to the systems doc.

---

**Date:** 2026-03-15

## Emulsifier: break drop netherite, disable when no fuel, placed disabled, full-dome scan (log 16:01:48–16:04:55)

User requests:
1. **Break machine:** When the emulsifier block is broken, **drop one netherite ingot** if the zone had netherite fuel (permanent). Do **not** drop other fuels (they run out).
2. **Disable with no fuel:** Allow **disabling** the machine from the UI even when it has **no fuel** and is currently enabled.
3. **Placed = disabled:** When the machine is first created (first UI open at that block), the zone starts **disabled** (`active: false`). Already implemented in `upsertEmulsifierZoneAtBlock`.
4. **Rejoin still on:** Zone state (including `active`) is persisted; rejoin correctly restores it. No change (by design).
5. **Scan coverage:** After rejoin, first big scan only purified blocks within ~6 blocks horizontally (and 3 below/above). Outer radius (7–30) was never scanned because the old loop used a **per-layer cap** (150) so each layer only got inner rings; outer rings were never processed.

**Fixes applied:**
- **Drop netherite on break (`main.js`):** In `playerBreakBlock` for `mb:emulsifier_machine`, call `getEmulsifierZoneAtBlock` before `removeEmulsifierZoneAtBlock`. If zone exists and `zone.fuelType === "netherite"`, spawn one `minecraft:netherite_ingot` at the block center, then remove the zone. No drop for other fuel types.
- **Disable when no fuel:** UI already shows "Disable Machine" when `zone.active === true` regardless of fuel. `setEmulsifierActiveAtBlock` does not check fuel; it sets `zone.active = active === true`. No code change.
- **Ring-based scan (`mb_spawnController.js`):** Replaced per-layer cap loop with **ring-based** scanning so the full dome (0..powerRadius) is covered over multiple runs. Each run processes one **ring index** (`zone.scanRing`) across all layers; when the ring is complete, advance `zone.scanRing` and reset `zone.scanLayerIndex`. When budget runs out mid-ring, persist `scanRing` and `scanLayerIndex` so the next run resumes. Added `scanRing` and `scanLayerIndex` to zone state (persisted); reset them to 0 when refueling, enabling, or on first scan / rehydrate so active zones get a full sweep from ring 0.

**Log reference (16:01:48–16:04:55):** Zone at -111 70 -55 then -47 68 -71; firstScan=true with budget 5220 queued conversions; later runs had below/at/above 750/150/550 and queued 0—only inner ~6 blocks per layer were scanned. With ring-based scan, each run processes one ring (0 to powerRadius) for all layers, so over time the full radius is covered.

**Ring-13 stuck fix (2026-03-15, log 16:25–16:28):** Scan advanced to `maxHorizR` 1→13 then stayed at 13. Cause: when budget ran out we saved `scanLayerIndex = ii` and resumed by redoing that layer; with two-pass order (layerStart→end, then 0→layerStart-1) this produced a cycle (e.g. 12→25→2→12) so the ring never completed. **Fix:** persist **within-layer** resume with `zone.scanDx` and `zone.scanDz`. When we run out we save the (dx, dz) we just processed; next run we skip (dx, dz) ≤ (scanDx, scanDz) in iteration order so we never redo the same position and make forward progress. When the ring completes we clear `scanDx`/`scanDz`; all reset sites (refuel, enable, first scan) also clear them. Scan can now advance past ring 13 to the full 30-block radius.

**Rejoin reset + phase skip (2026-03-15):** (1) On load/rehydrate only set `lastDetoxTick = undefined`; do **not** reset scan state. (2) `hasPendingScan = (zone.scanRing ?? 0) <= powerRadius` so we use interval=1 for all rings including the last (avoids stuck at phase 6/16 on ring 30). (3) **Ring 13 stuck (continually checking 13th block):** The scan used a **two-pass** loop: pass 0 = layers layerStart→end (with resume), pass 1 = layers 0→layerStart-1 (no resume). Pass 1 re-scanned the early layers every run; we’d run out of budget there and save a low layerStart, so we kept redoing the same layers and never advanced the ring. **Fix:** single forward pass only — iterate layers from layerStart to end, resume only on layerStart; never re-scan layers 0..layerStart-1 in the same run. Progress is monotonic and the ring advances to 14, 15, … 30. (4) **Phase 6/16 + same y:** When on ring 30, `scanRing < powerRadius` was false so interval went to 20 → only ran when phase=0. **Fix:** use `<= powerRadius`. **Layer order:** Non–first-scan used to prioritize machine y (±3) so most checks were at machine level; **fix:** use bottom-to-top (0..totalLayers-1) for all scans so below/above get even coverage.

**Scan pacing + fuel inventory (2026-03-15):** (1) **First scan faster:** After placing and adding fuel, the first scan uses interval=1 and a higher budget (`firstScanBudgetMult` 2.2 per fuel) to clear the area quickly. (2) **Later scans steadier and slower:** Per-fuel `scanIntervalNormal`, `scanIntervalQuiet`, `scanIntervalMax`. Scan runs all the time and slowly decreases speed; never stops until fuel runs out. (3) **Fuel queue:** Fuel is stored as a **queue** (`zone.fuelQueue`: array of `{ fuelType, ticksRemaining }`). You can **see all fuel** in the machine and **add different types**; they run one after another. **Burn order** is selectable: **Order added (queue)** (FIFO), **Most efficient first**, or **Least efficient first**. Cap: 12 entries per machine (`EMULSIFIER_MAX_QUEUE_LENGTH`). **Add Fuel** adds one unit of any type to the queue; **Change / Set Fuel** replaces the whole queue with one unit. Legacy `fuelType`/`fuelTicksRemaining` zones are migrated to `fuelQueue` on first read. Exports: `zoneHasFuel`, `getZoneCurrentFuelType`, `getZoneFuelQueueForUI`, `setEmulsifierFuelOrderAtBlock`. Break block drops netherite ingot if any queue entry is netherite. (4) **Netherite lock + refund:** If the queue **contains netherite**, you cannot add any other fuel (Add Fuel button hidden; API returns `has_netherite`). When you **add netherite**, all **unused** fuel (entries not yet started / not the current burning entry) are **refunded** to the player (one unit’s cost per refunded entry); queue becomes [current (if any), netherite].

**Emulsifier dome: 10 y below + persistence shape (2026-03-15):** (1) **10 blocks below machine:** Dome vertical range changed from 5 to **10** blocks below the machine (`maxDown = Math.min(10, powerRadius)`), so purification can reach 10 y levels below. (2) **Persistence loop (jsonLen 367/345/340):** Zone scan state used `delete zone.scanDx` / `delete zone.scanDz` on ring completion and resets, so saved JSON sometimes had those keys and sometimes not, causing alternating save sizes. **Fix:** use `zone.scanDx = null` and `zone.scanDz = null` instead of `delete` everywhere (first scan, ring completion, refuel, enable, reset). Resume logic already treats `zone.scanDx != null` so null/undefined both mean "no resume". Saved zone shape is now consistent (keys always present); jsonLen may still vary slightly (null vs number values) but no longer flip-flop between missing keys and present keys.

---

**Date:** 2026-03-13

## Emulsifier: no blocks purified after netherite refuel (log 16:39:52–16:40:49)

User refueled with netherite; no new blocks were purified.

**Log findings:**
- **16:39:52** – Pack load; then `no zones, exit` until **16:40:10** when `persistence save: zones= 0 jsonLen= 0` (empty cache saved, wiping world); then `no data from world after 8 attempts`; then user opened UI → zone created (inactive), then refueled → `persistence save: zones= 1 jsonLen= 247`.
- **16:40:14** – Purification scan ran: firstScan=true, budget=5220, **checked 5220, queued 0**, below/at/above **0/2997/2223**, sampleTypes air, grass_block, dirt, short_grass, emulsifier_machine (no dusted_dirt). So the whole budget was spent on machine Y and above; **no positions below machine Y** were checked, so ground-level dusted_dirt were never scanned.

**Fixes (`mb_spawnController.js`):**
- **First-scan layer order:** When `isFirstScan`, build `layerOrder` as **bottom-up** (layer 0 to totalLayers-1) so ground layers (where dusted_dirt usually are) are checked before the budget is exhausted on machine Y. Later scans keep the priority-band order.
- **Don’t remove zone when block check fails:** `isZoneMachinePresent` now returns **true** on catch (chunk unloaded / dimension error) so we don’t remove the zone and then save empty, which was wiping persisted data.
- **Don’t overwrite world with empty when world has data:** In `saveEmulsifierZones()`, when `zones.length === 0`, call `readEmulsifierZonesRaw()`; if world has data, **skip** writing undefined so we don’t wipe persisted zones when our cache is empty.

---

**Date:** 2026-03-13

## Emulsifier: fuel reset on rejoin + zone overwrite (log 16:31:22–16:32:27)

User reported: after leave/rejoin, fuel reset (UI showed it), weird behavior, no new detox.

**Relevant log window only: 16:31:22 – 16:32:27** (ContentLog; stop there).

- **16:31:22** – Pack load (Plugin Discovered, spawn controller, PropertyHandler). Player join over next ~8s.
- **16:31:30 – 16:31:40** – Repeated `processEmulsifierZones: no zones, exit. zones= 0 cache= 0` (rehydrate never filled cache).
- **16:31:41** – `persistence save: zones= 1 jsonLen= 194` then every 10 ticks `zones skip zone (inactive): -88 67 -31 active= false`. Opening the block UI created a new default zone (no fuel, inactive) and saved it, overwriting previous saved data.
- **16:31:41 – 16:31:46** – Only skip zone (inactive) and periodic persistence save; no purification scans.
- **16:32:00 – 16:32:16** – Log shows `purification skip zone (phase): -88 -31 interval= 5 phase= 1` and `persistence save: zones= 1 jsonLen= 268`. So in this window the zone was later updated (refuel/enable in UI → 268 bytes) and then phase-skipped, not inactive; still no purification scan runs in this segment.
- **16:32:21** – Plugin Discovered again (pack reload / new session); after that `no zones, exit` again.

**Script fixes from this window:**
- **Refuel / enable reset throttle** (`setEmulsifierFuelAtBlock`, `setEmulsifierActiveAtBlock`, `setNearestEmulsifierFuel`): When the user refuels or enables the zone, set `lastDetoxTick = undefined` and `firstScanDone = false` so the next run uses interval=1 (no phase-skip) and gets the higher first-scan budget.
- **Loaded zones get a run** (`loadEmulsifierZones`): When we load zones from persistence (initial load or rehydrate), for each zone that is active and has fuel (netherite or fuelTicksRemaining > 0), set `lastDetoxTick = undefined` and `firstScanDone = false` so rehydrated zones are not phase-skipped and get at least one full scan.

**Root cause:** On first load, `readEmulsifierZonesRaw()` returned empty (world/handler not ready or order of reads), so cache was set to `[]`. When the player opened the block UI, `upsertEmulsifierZoneAtBlock` didn’t find a zone (cache was empty) and **created a new default zone** (no fuel, `active: false`) and saved it, **overwriting** the previously persisted zone data.

**Fixes (`mb_spawnController.js`):**
- **Persistence read order:** `readEmulsifierZonesRaw()` now tries **direct** `world.getDynamicProperty(main)` and `world.getDynamicProperty(backup)` first, then handler main/chunked. This avoids the handler cache (which can be empty or stale on first read) and prefers the world’s persisted value after rejoin.
- **Initial load retries:** When cache is null and raw is empty, we no longer set cache to `[]` immediately. We retry up to `EMULSIFIER_INITIAL_LOAD_RETRIES` (8) times, leaving cache null so the next call to `loadEmulsifierZones()` tries again (world may not be ready on the first few ticks).
- **No overwrite on UI open:** In `upsertEmulsifierZoneAtBlock`, if no zone is found at the block and cache was empty (or null), we **force a fresh load** (`emulsifierZoneCache = null` then `loadEmulsifierZones()`), then look up again. Only if still not found do we create a new zone. So opening the UI after rejoin no longer overwrites saved fuel/active with a default zone.
- **clearEmulsifierZoneCache** resets `emulsifierInitialLoadAttempts` so debug clear doesn’t block retries.

---

## Emulsifier scan: chunk-loaded check and spawn alignment

- **Chunk-loaded check in purification dome** (`mb_spawnController.js`): Before sampling or queuing a block at `(wx, wz)`, we now skip when `!isChunkLoadedCached(dimension, wx, wz)` (same pattern as spawn block scanning). Skipped positions still consume `opsBudget`; we count `chunksSkipped` and log it in purification debug.
- **Spawn reference**: Comment added that dome scan order and chunk checks are aligned with spawn scanning (`collectDustedTiles`, `isChunkLoadedCached`). `queueEmulsifierConversion` now uses `TARGET_BLOCK` / `TARGET_BLOCK_2` so emulsifier targets stay in sync with spawn.

---

**Date:** 2026-03-13

## Emulsifier deep debug + persistence rehydrate + stronger scan coverage

User reported after world reload (`16:22:50` and later) that netherite fuel still did not persist and detox coverage seemed biased near/above machine Y with weaker post-first-scan behavior.

### Log findings
- Repeated lines immediately after reload: `processEmulsifierZones: no zones, exit. zones=0 cache=0`, meaning the in-memory cache remained empty right after startup.
- Later, interacting with machine recreated/loaded a zone as inactive (`skip zone (inactive)`), matching user symptom that fuel/state looked reset.
- Quiet zones were throttled by adaptive interval (`interval=20` and phase skips), making activity sparse after no recent detox.

### Changes made
- **Persistence rehydrate / stronger saves (`mb_spawnController.js`)**
  - Added `readEmulsifierZonesRaw()` loader probe with explicit source priority:
    1) handler main prop, 2) handler chunked, 3) direct main dynamic prop, 4) direct backup prop.
  - Added periodic rehydrate for empty cache every 20 ticks so startup-empty cache can recover persisted zones.
  - Save now logs persistence debug metrics (`zones`, `jsonLen`) and continues writing both main + backup dynamic keys.
  - Added save on `world.beforeEvents.playerLeave` plus faster periodic save (`50` ticks) when zones exist.
- **Detox scan behavior / diagnostics (`mb_spawnController.js`)**
  - Increased non-first-scan concurrency budget (`baseBudget = 700 + 300 * performance`).
  - Increased first-scan multiplier to `1.8x` and keeps `2x` searching multiplier.
  - Enforced explicit priority scan order:
    - First process Y band `machineY ± 3` (full horizontal circles per layer),
    - then remaining lower/upper layers.
  - Added richer purification telemetry:
    - checked vs queued
    - below/at/above checked counts
    - max horizontal radius reached
    - sampled nearby block type frequencies (top entries) while debug is enabled.
- **Debug UI diagnostics (`mb_codex.js`)**
  - Emulsifier diagnostics now also show backup raw length and load-probe source/raw length.

---

**Date:** 2026-03-12

## Emulsifier: purification not running + data not persisting across save/rejoin

User reported: (1) Emulsifier no longer purifies blocks; (2) machine state (fuel, enabled, etc.) resets when leaving and rejoining the world.

### Cause
- **Purification**: Adaptive scan interval used `lastDetoxTick ?? createdTick ?? now`, so zones loaded from save (with no `lastDetoxTick`) used old `createdTick` and got a large `quietTicks`, so `interval` became 5 or 20 and the zone was rarely scanned. Also only one Y-layer was processed per run with a 20-tick interval, so progress was very slow.
- **Persistence**: Zones were saved via the handler’s `setWorldProperty` + `saveAllProperties()`; reliance on the handler’s cache/flush or Bedrock world property persistence could leave data unwritten before exit.

### Changes made (mb_spawnController.js)
- **Purification**
  - Adaptive interval now only throttles when `zone.lastDetoxTick` is defined. If it’s undefined (new or loaded zone), `quietTicks` is 0 so `interval = 1` and the zone is scanned every run.
  - Dome scan now processes up to 4 Y-layers per run (instead of 1) with a shared ops budget so more of the dome is covered each run.
  - Emulsifier loop interval reduced from 20 to 10 ticks so `processEmulsifierZones` runs twice as often.
- **Persistence**
  - Load: try `getWorldProperty(EMULSIFIER_ZONES_PROPERTY)` first, then fallback to `getWorldPropertyChunked` for older chunked saves.
  - Save: still use `setWorldProperty` and `saveAllProperties()`, and additionally call `world.setDynamicProperty(EMULSIFIER_ZONES_PROPERTY, json)` so the world is written immediately and survives save/rejoin.

---

**Date:** 2026-03-12

## Emulsifier block UI: exit and no re-open when looking at block

User could not exit the Emulsifier machine UI when looking at the block; closing or backing out sent them back to the main menu instead of fully closing.

### Cause
- Block interaction (`playerInteractWithBlock`) can fire again when the form closes while the player is still looking at the block, so the UI was being reopened immediately.
- Any response that wasn’t explicitly “Refuel” or “Enable/Disable” (e.g. odd cancel behavior) needed to be treated as “exit” and never reopen.

### Changes made
- **main.js** – Cooldown for opening the Emulsifier UI: `emulsifierUiLastOpenTick` map and `EMULSIFIER_UI_COOLDOWN_TICKS` (40 ticks / 2 s). We only open the UI if the last open for that player was more than 2 seconds ago, so closing the form no longer re-triggers an immediate reopen from the same interaction/look.
- **mb_codex.js** – Main Emulsifier form: exit on Close, cancel, or any invalid/unknown selection (`res.selection !== 0 && res.selection !== 1`). Catch handler stays empty (no reopen on error).

Result: Close and cancel (ESC / look away) fully exit the UI; the 2 s cooldown prevents the block from reopening the UI until the player interacts again after moving away or waiting.

---

**Date:** 2026-03-12

## Emulsifier: dust particles, delay, and sounds

User wanted: dust particles during conversion, a short "working" delay before blocks transform, and sounds in the UI and when the machine is working.

### Changes made
- **mb_spawnController.js**
  - Pending conversion queue: blocks are queued instead of converted instantly. `pendingEmulsifierConversions` set prevents double-queueing.
  - Dust particles: `mb:white_dust_particle` spawned at block when conversion starts and when it completes.
  - Delay: 15 ticks (~0.75 s) between "start working" and actual block conversion.
  - Sounds: `block.enchantment_table.use` (subtle hum) when work starts; `block.composter.fill_success` when block is converted. Played to players within 20 blocks.
- **mb_codex.js**
  - UI sounds: `mb.codex_open` when opening the machine UI; `mb.codex_turn_page` when Refuel/Enable/Disable/Back/fuel selection; `mb.codex_close` when closing the UI.

---

**Date:** 2026-03-12

## Emulsifier: persistence and block-break behavior

User wanted: Emulsifier data to persist across sessions (like other addon data), and when the machine block is broken, it stops outputting.

### Already in place
- **Persistence**: Zones are stored via `setWorldProperty("mb_emulsifier_zones", JSON.stringify(zones))`. World dynamic properties are saved every 30 ticks and persist across sessions.
- **Player break**: `playerBreakBlock` calls `removeEmulsifierZoneAtBlock`, removing the zone and saving.

### Changes made (mb_spawnController.js)
- **Non-player break**: When the machine block is gone (explosion, piston, etc.), zones are now **removed** instead of only deactivated. Cleanup runs in `processEmulsifierZones` and `getActiveEmulsifierZonesForDimension`. Prevents orphaned zone entries and keeps saved data correct.

---

**Date:** 2026-03-11

## Dev tools: restricted to Litbolt123 or mb_cheats

User wanted the first player who joins a world to **not** automatically get debug/dev tools in the Basic or Powdery Journal, unless they are `Litbolt123` or have the `mb_cheats` tag. First-player settings access (beta features, addon difficulty, etc.) should stay as-is.

### Changes made (mb_codex.js)
- **Powdery Journal main menu** – `hasDebugOptions` now checks only `player.hasTag("mb_cheats")` or `player.name === "Litbolt123"`; it no longer unlocks Debug/Developer Tools just because world cheats are enabled.
- **Basic Journal main menu** – Same `hasDebugOptions` condition applied so Debug/Developer Tools buttons only show for `Litbolt123` or players with `mb_cheats`. First-player “owner” behavior for beta/settings is unchanged; only dev/debug menus are affected.

---

**Date:** 2026-02-15

## Achievements: persisted Powdery Journal unlock – IMPLEMENTED

Achievements were hidden if the journal was obtained earlier but not carried, because `playerHasPowderyJournal` only checks inventory.

### Changes made (mb_codex.js)
1. **isPowderyJournalUnlocked(p)** – New helper that reads persisted `codex.items.snowBookCrafted`.
2. **openAchievements()** – Gate changed from `if (!playerHasPowderyJournal(player))` to `if (!playerHasPowderyJournal(player) && !isPowderyJournalUnlocked(player))`.

Achievements now show if the player either has the journal in inventory OR has ever crafted/obtained it. The `snowBookCrafted` flag is already set in main.js when the journal is crafted or opened (periodic inventory check + itemUseBeforeItemUse).

---

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

---

**Date:** 2026-03-12

## Emulsifier system + spawn scan scheduler tuning

Added a first-pass Emulsifier gameplay system and expanded Spawn Controller dev tools with scan scheduler controls/presets to reduce multiplayer lag spikes from heavy scans.

### Changes made

1. **mb_spawnController.js**
   - **Emulsifier zones (new world-state system)**:
     - New zone storage via world property `mb_emulsifier_zones`.
     - New fuel tiers:
       - `redstone` (baseline)
       - `iron` (`snow + iron`, low tier)
       - `copper` (`snow + copper`, mid tier)
       - `gold` (`snow + gold`, high tier)
       - `netherite` (permanent fuel)
     - New exported Dev Tools helpers:
       - `getEmulsifierStateForDevTools(player)`
       - `addEmulsifierZoneAtPlayer(player, fuelType)`
       - `removeNearestEmulsifierZone(player, maxDistance)`
       - `setNearestEmulsifierFuel(player, fuelType, maxDistance)`
   - **Detox processing loop**:
     - New interval runs every 20 ticks to process active Emulsifier zones.
     - Neutralization behavior:
       - `mb:dusted_dirt -> minecraft:dirt`
       - `mb:snow_layer`/`minecraft:snow_layer -> minecraft:air`
     - Fuel drains over time for finite fuels; `netherite` is permanent.
   - **No-spawn field around active Emulsifiers**:
     - Natural Maple Bear spawns are blocked if spawn location is within active Emulsifier exclusion radius.
   - **Scan scheduler tuning system (new)**:
     - New override properties:
       - `mb_scan_discovery_radius`
       - `mb_scan_min_discovery_radius`
       - `mb_scan_radius_drop_per_player`
       - `mb_scan_tight_group_penalty`
       - `mb_scan_barren_cooldown_mult`
       - `mb_scan_stagger_ticks`
       - `mb_scan_chunk_load_delay`
     - New exported helpers:
       - `getSpawnScanSettingsForDevTools()`
       - `applySpawnScanPreset(presetKey)`
       - `SPAWN_SCAN_PRESETS`
       - `SPAWN_SCAN_OVERRIDE_PROPERTIES`
   - **Lag-spike reduction updates in scanning flow**:
     - Discovery radius is now adaptive by player count and grouping.
     - Barren-area cooldown now uses dynamic multiplier + chunk-based jitter to desync expensive rescans.
     - Chunk scan queue staggering and new-chunk scan delay now read adaptive settings from dev tools.

2. **mb_codex.js**
   - **Spawn Controller menu additions**:
     - Added `Scan Scheduler` button.
     - Added `Emulsifier` button.
     - Spawn menu body now shows scan and Emulsifier status snapshots.
   - **New Scan Scheduler dev UI**:
     - Preset application.
     - Manual controls for:
       - discovery radius
       - min discovery radius
       - per-player radius drop
       - tight-group penalty
       - barren cooldown multiplier
       - stagger ticks
       - chunk load delay
     - Reset to defaults button.
   - **New Emulsifier dev UI**:
     - Create zone at player position.
     - Refuel nearest zone (fuel tier selection).
     - Remove nearest zone.
     - Status display for active/total zones, nearest zone, and fuel state.

Result: You can now tune scan behavior with presets and direct controls in Dev Tools, and prototype the Emulsifier loop (detox + anti-natural-spawn field + fuel tiers) without needing new block/item assets yet.

---

**Date:** 2026-03-12

## Emulsifier machine block + machine UI

Converted the Emulsifier from a dev-only abstract zone concept into a placeable machine block with direct interaction UI, and corrected snow detox behavior so corrupted snow becomes safe vanilla snow.

### Changes made

1. **Physical Emulsifier assets**
   - Added block: `BP/blocks/emulsifier_machine.json` (`mb:emulsifier_machine`)
   - Added item: `BP/items/emulsifier_machine.json` (`minecraft:block_placer` -> `mb:emulsifier_machine`)
   - Added crafting recipe: `BP/recipes/emulsifier_machine.json`
   - Added loot table: `BP/loot_tables/blocks/emulsifier_machine.json` (drops machine item)
   - Added RP mappings:
     - `RP/blocks.json` sound entry for `mb:emulsifier_machine`
     - `RP/textures/terrain_texture.json` texture key `emulsifier_machine`
     - `RP/textures/item_texture.json` icon key `mb_emulsifier_machine`
     - `RP/texts/en_US.lang` item/tile names

2. **Machine block interaction flow**
   - `main.js` now:
     - Registers an Emulsifier zone when `mb:emulsifier_machine` is placed.
     - Removes the zone when the block is broken.
     - Opens machine UI when player interacts with the machine block.

3. **Machine UI**
   - Added exported UI entrypoint in `mb_codex.js`: `showEmulsifierMachineUI(player, block)`.
   - UI supports:
     - View fuel type + remaining time.
     - Enable/disable machine.
     - Refuel/change fuel via in-inventory material costs.
   - Implemented fuel-cost inventory consumption:
     - Redstone
     - Snow + Iron
     - Snow + Copper
     - Snow + Gold
     - Netherite (permanent core)
   - Fuel UI now shows live inventory counts per tier (have/need for each ingredient) and re-checks them each time you open the fuel menu; costs are script-consumed when you select a fuel tier.

4. **Spawn controller Emulsifier block integration**
   - Added block-anchored zone helpers in `mb_spawnController.js`:
     - `upsertEmulsifierZoneAtBlock`
     - `removeEmulsifierZoneAtBlock`
     - `getEmulsifierZoneAtBlock`
     - `setEmulsifierFuelAtBlock`
     - `setEmulsifierActiveAtBlock`
   - Active zones now verify machine block existence; missing machines deactivate their zones.

5. **Detox conversion fix (requested)**
   - Updated detox behavior:
     - `mb:snow_layer` now converts to `minecraft:snow_layer` (safe)
   - No longer converts snow layers to air in Emulsifier detox pass.

Result: Emulsifier is now a true placeable machine with fuel UI workflow, and corrupted snow neutralizes to harmless vanilla snow as requested.

---

## 2026-03-28 — Spatial cluster scan budgeting + spawn dev UI

**Spawn controller (`mb_spawnController.js`)**

- `countSpatialProximityClusters(players)` counts XZ-connected groups using the same 32-block threshold as tight groups.
- Per dimension, that count is passed as `scanLoadCount` into `getTilesForPlayer` → tile collection.
- `getDiscoveryBudgetPlayerCount` / `getQueryBudgetPlayerCount` feed `getAdaptiveDiscoveryRadius`, `getBlockQueryLimit`, and per-scan tile limits so **5 players in 3 distant clusters** shrink discovery and queries more like **3 players**, while **query** tiers never drop below a “duo” level when the dimension is actually multiplayer (avoids solo-sized block budgets for one stacked party).
- New `SPAWN_SCAN_PRESETS`: `minimal`, `multiplayerSpread`, `soloHost` (existing presets unchanged).

**Codex dev menus (`mb_codex.js`)**

- Spawn Controller hub: **Core** (difficulty, speed, types), **Performance** (intensity presets, quick combos, advanced, scan scheduler), **Force spawn** (by category), Emulsifier.
- **Spawn intensity presets**: added `ultraLow`, `mpLite`; menu builds from `Object.keys(SPAWN_PRESETS)`.
- **Quick combos**: one tap applies spawn preset + `applySpawnScanPreset` (e.g. Low + Low Lag, Ultra + Minimal scan).
- Force spawn: **category** screen then type list (Tiny / Infected / Buff / Flying / Mining / Torpedo).
- Back navigation returns to Performance or Core hubs where appropriate.

---

## 2026-03-28 — Scan spikes, barren, global cap by world clusters, HUD

**`mb_spawnController.js`**

- **`computeSpatialClusterMeta`**: union-find at file top (shared 32-block XZ rule); `countSpatialProximityClusters` wraps it.
- **`getWorldWideSpawnLoadCount`**: sums per-dimension cluster counts; **`getEffectiveMaxGlobalSpawnsPerTick`** scales the global spawn cap from this load (cached once per tick), not raw player count only.
- **Barren:** `getBarrenCooldownTicks(..., scanLoadCount)` adds **stacked boost** when `totalPlayerCount > scanLoadCount` (many players, few clusters). Do not mark chunk barren if **`blockQueryCount >= queryLimit`** (incomplete scan); **`minQueriesForBarrenMark`** scales with query budget (~14%, min 48).
- **Cache validation:** up to 50-sample waves, **`CACHE_VALIDATION_BLOCKS_PER_TICK` (10)** `getBlock` calls per `collectDustedTiles` call (spread spike). Drain step uses **`world.getDimension(value.dimension)`** so a wave started in one dimension is still validated when another dimension’s tile collect advances the queue; wave timestamp is set only when a non-empty sample is created.
- **Chunk queue fairness:** `clusterIndex` on queue entries; **fairness wiggle** on new-chunk schedule; **readyScans** secondary sort rotates by `clusterIndex` over time.
- **Same-tick load spreading:** **`playersTriggeredTileRescan`** — on tile rescan, defer **`getEntities`** (spawn cap counts) refresh if cache still “recent enough”. Buff proximity ambience is unchanged (no deferral).
- **HUD:** world property `mb_spawn_scan_perf_debug`; **`isSpawnScanPerfOverlayEnabled` / `setSpawnScanPerfOverlayEnabled`**; action bar `P/C/D/W` per player’s dimension + world load.

**`mb_codex.js`**

- Spawn Performance hub: toggle **scan HUD** (action bar).

---

## 2026-03-28 — Lag comfort, spatial spawn toggle, storm/mining cadence

**`mb_performanceProfile.js`**

- World props: `mb_lag_comfort` (0–3), `mb_spawn_spatial_tuning` (default on), optional `mb_storm_work_mult` / `mb_mining_work_mult` (manual overrides; `0` = auto).
- `getStormWorkIntervalMultiplier()` / `getMiningWorkMultiplier()`: lag tier + optional player-count boost when lag is 0; respect manual mults when set.

**`mb_spawnController.js`**

- When spatial tuning is **off**, spawn load uses per-dimension **player** counts instead of cluster counts (full “spread” cost).

**`mb_snowStorm.js`**, **`mb_miningAI.js`**

- Storm intervals and mining batch pacing use the performance profile multipliers (mining still respects `mb_ai_mining_dynamic_interval` dev override when set).

**`mb_codex.js`**

- **Settings** (Powdery codex + Basic journal): **Have lag?** → **How much?** with Default / A little / Mid / LAGGY (`openJournalLagComfortWizard`, `applyJournalLagComfortBundle`).
- **Spawn → Performance**: toggle **spatial spawn groups** (same as world prop).
- **Developer Tools → Heavy perf**: storm cadence presets, mining cadence presets, spatial groups toggle.

---

## 2026-03-28 — Dust storms world flag + dev-only toggles

**`mb_scriptToggles.js`**

- World property **`mb_dust_storms_enabled`** — `isDustStormsEnabled()` / `setDustStormsEnabled()`.

**`mb_snowStorm.js`**, **`main.js`**

- Storm logic uses `isDustStormsEnabled()`; summon help text points to **Developer Tools → Storm hub**.

**`mb_codex.js`**

- **No** dust / multi-storm toggles in journal **General** (player-facing settings).
- **Developer Tools → Storm hub**: first button toggles **dust storms (world)**; second toggles **multiple storms**.
- **Heavy perf → Storm / Mining cadence**: named preset lists (Auto + Base/Lite/Low/Med-Low/Med/Med-High/Heavy/Extreme/Ultra) similar in spirit to spawn intensity presets.

---

# Historical archive (merged from docs/ai/CONTEXT_SUMMARY.md, 2026-03-31)

Long-form **Recent Changes** bullets and **Current Project State** from the former `docs/ai/CONTEXT_SUMMARY.md`. Topics may overlap with **dated sections** higher in this file; prefer newer dates for current behavior.

---


## Recent Changes (Latest Session)

### Powdery settings: infection timer toggle matches HUD (2026-03-28)
- **`mb_codex.js` `getSettings`**: Merge **`showInfectionTimer`** from chunked `mb_player_settings_*` when the key exists (HUD already read it there; modal had skipped it). **`openGeneralSettings` save**: `Object.assign` merged **`settings`** into a fresh **`getCodex`** before **`saveCodex`** (avoid saving a stale second codex copy).

### Minor infection “after death” UI only after real death (2026-03-28)
- **`main.js`**: `playerSpawn` runs on **rejoin** too, so the old `!mb_minor_respawned` check wrongly showed **“persists even after death”** without dying. **`mb_minor_post_death_ui_pending`** is set in **`handlePlayerDeath`** (minor path) and cleared when showing UI on the next spawn; rejoin with minor = tag only, **no** death lines.

### Proximity ambient: dust breath + tuned bumps (2026-03-28)
- **`main.js`**: `applyProximityAmbientFromInfectedPlayer` runs on **`playedCough`** and **`playedBreath`**. Bumps toward **630** `ambientSeconds`: major **36** cough / **48** breath; minor **8** / **6** (doubled from earlier tuning to halve event count to fill meter).

### Infection cough vs dust breath (minor vs major) (2026-03-28)
- **`mb_infectionAudio.js`**: **Cough** stays **audio-only** (no particle). **Minor** coughs are **much rarer** than major (wider spacing, threshold ~0.052 vs ~0.34). **Dust breath** (particle + sound): **major** unchanged in spirit; **minor** only in **last quarter** of timer (`ticksLeft * 4 <= maxInfectionTicks`), lower chance, **minor** cough sound. **`main.js`** passes **`maxInfectionTicks`** on `tickInfectionCoughAndBreath` context; **`infectionType`/`maxTicks`** hoisted before the audio block.

### Beta Features only in Powdery/Dusted journal settings (2026-03-28)
- **`mb_codex.js`**: Removed **Beta Features** from **Basic** journal `showSettingsChooserBasic` (and removed unused `showBetaSettingsScreen`). Powdery book **`openSettings`** still offers General + Beta.
- **Update**: **Dust storms** use world key **`mb_dust_storms_enabled`**; on/off only in **Developer Tools → Storm hub** (not journal General). **Heavy perf** storm/mining menus expose multi-step named presets (Auto + tiered multipliers).

### Infection HUD: death screen, last-day precision, journal hint (2026-03-28)
- **`main.js`**: `infectionActionBarSuppressedUntilSpawn` + `clearInfectionHudActionBar` on **`handlePlayerDeath`**; cleared on **`playerSpawn`**. **`formatInfectionHudTimeRemaining`** — after **24000** ticks, `~days`; within last day, **in-game** `Xh Ym` / minutes / seconds.
- **`mb_codex.js`**: Powdery summary **Time** line matches last-day precision; one-time **`powderyHudTimerHintShown`** tip under that line (saved with **`saveCodex`**, not **`markCodex`**, to avoid mis-mapping `journal.*` to Late Lore).

### Infection action bar refresh rate (2026-03-28)
- **`main.js`**: Infection timer / cure hint action bar moved to **`tryRefreshInfectionHudActionBar`** + **`system.runInterval(..., 10)`** so Bedrock does not fade the text between **40-tick** infection updates. Setting remains **Dusted/Powdery Journal only** (`getPlayerSettings` / `showInfectionTimer`).

### Infection HUD, cough proximity, dimension toggle, mining break_blocks (2026-03-28)
- **`main.js`**: Powdery **infection timer** uses **`setActionBar`** (with **major cure** hint combined when due). **`applyProximityAmbientFromInfectedPlayer`** — on **played cough** / **played breath**, bumps **`ambientSeconds`** for others within **3 blocks** with **`hasInfectionExposureLineOfSight`**; skips creative/spectator, permanent immunity, temporary immunity, and players already **major** infected.
- **`mb_scriptToggles.js`**: **`SCRIPT_IDS.dimensionAdaptation`** (`dimension_adaptation`). **`mb_dimensionAdaptation.js`**: early return when disabled (interval + **`entitySpawn`**).
- **`mb_codex.js`**: Script Toggles entry for dimension adaptation; Powdery settings toggle label **action bar**; **`PINNABLE_DEV_ITEMS`** reordered (storm / set day / simulate / infection / immunity / kill / clear earlier).
- **`BP/entities/mining_mb.json`** & **`mining_mb_day20.json`**: **`minecraft:break_blocks`** lists synced from **`mb_miningBlockList.js`** (PowerShell-assisted insert in repo when Node unavailable).

### Infection exposure line-of-sight + script breaking notes (2026-03-28)
- **`BP/scripts/mb_infectionExposureLos.js`**: Ray from **~eye to ~eye**; **occludes** on solid blocks; **passes** air, liquids, snow layers, redstone/tripwire/string/cobweb, and IDs from **`SNOW_REPLACEABLE_BLOCKS`** + **`STORM_PARTICLE_PASS_THROUGH`** (`mb_blockLists.js`).
- **`mb_infectionAudio.js`**: `playInfectionSpatialSound` applies LOS for **other** players (self unchanged).
- **`mb_spawnController.js` `countNearbyDustedDirtBlocks`**: Only counts **`mb:dusted_dirt`** the player could “see” (same ray), so **walls** don’t inflate **ambient** pressure.
- **`mb_miningAI.js` / `mb_torpedoAI.js`**: File-header notes — **block breaking is script-driven**; **`AGENTS.md`** Tools section updated (`updateMiningBlocks.js` syncs list to optional entity `break_blocks`).
- **`docs/development/systems/INFECTION_SYSTEM.md`**: §11 LOS + ambient; quick-reference row.

### Short white dust particle for infection breath (2026-03-28)
- **`RP/particles/white_dust_particle_short.particle.json`**: New effect `mb:white_dust_particle_short` — same texture/material as `mb:white_dust_particle`, tuned for **brief** emission (`emitter_lifetime_once` ~0.38s, particle `max_lifetime` ~0.42s, smaller burst vs the 6s original).
- **`BP/scripts/mb_infectionAudio.js`**: Rare **dust breath** (infection cough/breath path) spawns **`mb:white_dust_particle_short`** instead of the long vanilla-style puff. Other systems (death dust, storms, conversion VFX) still use **`mb:white_dust_particle`**.
- **`docs/development/systems/INFECTION_SYSTEM.md`**: Dust breath line updated to the short identifier.

### Bedrock block format_version vs game 26.x (2026-03-28)
- **`BP/blocks/*.json`**: Use **`format_version": "1.21.130"`** for custom blocks. On at least some **1.26.x** clients, **`1.21.40`**, **`1.26.0`**, and **`1.26.10`** all log **Unexpected version for the loaded data** while blocks can still behave normally; **`1.21.130`** is a known-good block format line (newer than 1.21.40) per [block format history](https://wiki.bedrock.dev/blocks/block-format-history).
- **Noisy content log (2026-03-28)**: If **`[Blocks][error] block_definitions … Unexpected version`** still appears but **blocks look and sound correct**, it may be a **strict validator / fallback parse** quirk or **unsynced `com.mojang\development_behavior_packs\`** copy vs repo. **Reasonable to ignore** for development if behavior is verified; watch for real breakage (missing registry, `?` blocks). No widely indexed “everyone has this” thread found; worth **Mojang feedback / Jira** if reproducible with minimal pack.
- **`snow_layer.json`**: No BP root **`sound`** (sounds in **`RP/blocks.json`**). **`placement_filter`** uses **`tag:mb:maple_bear_snow_layer`** + **`block_filter`** **`tags`**: `!q.any_tag('mb:maple_bear_snow_layer')` for **up** face (no stacking on another maple snow layer).
- **`emulsifier_machine.json`**: **`minecraft:geometry": "minecraft:geometry.full_block"`** alongside **`material_instances`** — 1.26+ requires both (fixes **Block needs both a geometry and material instances** / missing registry / block_placer errors).
- **`BP/manifest.json` / `RP/manifest.json`**: **`min_engine_version`** **`[1, 26, 10]`**; **`@minecraft/server`** **`2.6.0`**.

### DDUI vs Preview / Powdery Journal (2026-03-28, Q&A)
- **Retail Bedrock 1.26.10+**: DDUI is not limited to the Preview *app* once that version is installed; Mojang documents **`CustomForm`** / **`MessageBox`** on Learn under the stable docs tree but marks them **pre-release** (signatures may change).
- **Changelog placement**: In [26.10 Bedrock changelog](https://www.minecraft.net/en-us/article/minecraft-26-10-bedrock-changelog), DDUI is under **Experimental Technical Updates** — expect **world/script experiments** (e.g. Beta JavaScript APIs), not “works everywhere with no toggles.”
- **Powdery Journal direction (when targeting 26.10+)**: Pilot **one** screen (settings, Script Toggles, or Developer Tools hub) as **`CustomForm`** (`header`/`label`/`divider`/`toggle`/`slider`/`button` + **Observables**); keep **`ActionFormData`/`ModalFormData`** fallback for older `min_engine_version`; handle **1-tick delay** between close→open and **UI queueing** per Mojang known issues.

### Infection cough audio vs settings / creative (2026-03-22)
- **`mb_infectionAudio.js`**: Emitter tier **Off** — **you** still get quiet cough/hiccup/sigh; others hear nothing. **Dust breath**: particle + **`mb.infection_cough_major`** (random variant from definitions), softer gain than a normal major cough; no separate emitter gate on the breath roll. **`main.js`**: Cough/breath in **creative** too (not **spectator**). **`mb_codex.js`**: Symptoms copy for Off / Low / High; **Basic → Your Goal** infection-time line kept **short**.

### Powdery Journal: experience-gated lore (2026-03-22)
- **`BP/scripts/mb_codex.js`**
  - **Infection → Infection Mechanics:** bullets unlock only after relevant play (bear hits/discovery, minor/major seen, infection effects, snow/powder affecting major timer, day ≥3 + infection footprint, day ≥20 for full-kill conversion line). If none apply: placeholder `???` text.
  - **Symptoms → Infection level analysis:** no longer opens from “infected with zero snow” alone; needs snow discovery, max snow level, `snow` infection discovery, or current snow count > 0 (or dev unlock flag).
  - **Infection level analysis page:** short note when max snow &lt; 5 that higher tiers fill in after actually reaching those levels.
  - **Timeline → Days & Milestones:** milestone *titles* stay `???` until the matching encounter (e.g. Day 2 needs Tiny Maple Bear seen; Day 4 needs an infected mob seen; Days 8/13/15/17 need that mob type seen; Days 11/20/25 use calendar survival). Hint line when a day is passed but the note is still locked. **Day 20 “Knowledge”** paragraphs require major infection, storm, or Day-20-variant exposure—not day count alone.

### Powdery + Basic journal progressive pass (2026-03-22)
- **Powdery home (`buildSummary`):** “Previously infected” and **immunity** lines wait until **Infection** section viewed once or a cure/immunity beat; **“Immunity: None”** only after opening Infection. **Day** color/symbols until day ≥2 or **Timeline** opened once.
- **Infection → History:** “Total cures” / “Last cure” only after first cure.
- **Basic Journal → Your Goal:** **Infection time** bullets — basic book has no countdown; **Powdery Journal** (recipe on main screen) shows time left + fuller log (not on Basic main menu).
- **Snow tiers:** named blocks unlock at band **entry** (1, 6, 11, 21, 51, >100); live tier **name** gated on max-ever in that band.
- **Symptom detail:** stub then **detailed log** after ≥5 `symptomsMeta` episodes. **Snow effect detail:** mechanics after snow level 2 or ≥3 effects seen.
- **Timeline:** **Victory** label hidden until day 25; **post-victory** rows need `minDay` reached for labels.
- **Mobs:** combat stats at **40+** kills; day-4 variant text uses per-type flags; day 8/13 fall back to **global** unlock if per-type unset (`main.js`).
- **Biome knowledge:** level 2/3 from visits + ground/ambient discoveries (`checkKnowledgeProgression`). **Storms:** minor vs major copy split by `stormMinorSeen` / `stormMajorSeen`.

### Infection body sound volumes (2026-03-22)
- **`RP/sounds/sound_definitions.json`**: Cough minor/major and powder hiccup per-file **volume 0.68** (two decimals; ~−9% vs 0.75). Cure sigh minor/major **0.34** (~−10% then ~−50% vs original 0.75). Script `BASE_DEFINITION_ATTENUATION` unchanged; gain still applied in `mb_infectionAudio.js`.

### Infection cough timing (2026-03-22)
- **`BP/scripts/mb_infectionAudio.js`**: Replaced fixed cooldown + roll with **per-player `nextCoughDueTick`** — randomized gaps after each cough (major ~520–1280 ticks base, minor ~1300–3400; shortened by storm/ground synergy), jittered retries on failed rolls, staggered first window. Slightly **lower** per-attempt thresholds (major 0.32, minor 0.2). Goal: **less frequent**, **less periodic** coughs.

### Dev Tools: play sound catalog (2026-03-22)
- **`BP/scripts/mb_devSoundCatalog.js`**: categorized addon sound event IDs (matches `RP/sounds/sound_definitions.json`).
- **`mb_codex.js`**: Developer Tools → **Play sound (catalog)** — category → sound → target (**me** or another online player); uses `target.playSound` and target’s `getPlayerSoundVolume`. Pinnable as **Play sound (catalog)**.

### Powdery Developer Tools menu layout (2026-03-22)
- **`mb_codex.js` `openDeveloperTools()`**: Main list reorganized — **Spawning & systems** (Script Toggles with hint text, Spawn Controller), **Bears** (clear/kill/target/list/inspect), **Storm hub**, **Infection & players**, **Audio & debug** (Play sound catalog first, then AI Throttle, Debug Menu). Body text describes the flow. **Script Toggles** submenu already lists **Infection Audio** and **Snow Storm** with other scripts. Pinnable storm label aligned to **Storm hub**.

### Infection body sounds implementation (2026-03-22)
- **Shipped**: `BP/scripts/mb_infectionAudio.js` — nearby-player `playSound` loop; cough tier minor/major (major louder + more frequent), storm **or** corrupted-ground synergy; rare `mb:white_dust_particle` breath; `mb.dust_eat_hiccup` at pitch **1.25** on powder eat; cure sigh minor/major.
- **RP**: `sound_definitions.json` entries `mb.infection_cough_minor`, `mb.infection_cough_major`, `mb.dust_eat_hiccup`, `mb.cure_sigh_relief_minor` / `_major` — per-file volumes **0.68** (cough/hiccup) and **0.34** (cure sighs); see “Infection body sound volumes” above.
- **Settings (option C)**: `infectionCueEmitterVolume` + `infectionCueHearOthersVolume` (Off/Low/High) in Powdery settings modal; exports `getInfectionCueEmitterTier` / `getInfectionCueHearOthersTier` in `mb_codex.js`.
- **Codex**: `symptomsUnlocks.infectionBodySoundsUnlocked`; Symptoms menu **Body sounds (infection)**; Infection section mechanics line when unlocked. Docs: `INFECTION_SYSTEM.md` §11, `ADDON_SYSTEMS_AND_FEATURES.md` (`mb_infectionAudio.js`).

### Infection audio brainstorm (2026-03-22)
- **User idea**: Random **cough** (and similar) sounds while infected—**audible to nearby players**, more frequent/intense for **major** than **minor**; new **Powdery Journal** volume control (pattern like `bearSoundVolume`). Implementation notes: prefer **positional `playsound`** or **per-nearby-player `playSound`** over `player.playSound` alone for multiplayer; hook in `main.js` infection interval with per-player cooldown; register custom sounds in RP. Design fork: emitter-only “off” vs per-listener volume vs both. Additional ideas discussed: wheeze, storm synergy, cure exhale, optional particles, codex unlock.

### Infection system documentation (2026-03-22)
- **User request**: Explain infection mechanics; later requested as **markdown** (update existing where applicable).
- **Added** [`docs/development/systems/INFECTION_SYSTEM.md`](../development/systems/INFECTION_SYSTEM.md): full reference (minor/major, `snowCount`, environmental timers, cures, transformation paths, mob conversion, mermaid flowcharts, file index).
- **Updated** [`docs/development/tracking/MECHANICS_SUMMARY.md`](../development/tracking/MECHANICS_SUMMARY.md) (infection section slimmed + link; transformation note for timer vs bear-kill bear variant), [`docs/README.md`](../README.md) (systems index), [`docs/development/ADDON_SYSTEMS_AND_FEATURES.md`](../development/ADDON_SYSTEMS_AND_FEATURES.md) (links from overview + `main.js`).
- **Implementation anchors**: `BP/scripts/main.js`, `mb_snowStorm.js`, `mb_infectedAI.js`, `mb_biomeAmbience.js`, `mb_dimensionAdaptation.js`.

### Documentation pass (2026-03-20)
- **Root `README.md`**: Expanded with project summary, repo layout, doc links, `npm run check`, install notes.
- **`TODO.md`**: Rebuilt with next steps, consolidated “implemented” summary, backlog checkboxes, technical notes; removed outdated “Nether/End only future” framing in favor of **implemented** Nether/End spawn + adaptation + remaining endgame/content tasks.
- **New `docs/development/ADDON_SYSTEMS_AND_FEATURES.md`**: Maps each `BP/scripts/*.js` module, major JSON/asset systems, and player-facing features; links to mechanics, spawn, dimension, storm, codex docs.
- **New `docs/development/PROJECT_STATUS.md`**: Snapshot of recently solidified systems, gaps, suggested priorities.
- **`docs/README.md`**: Fixed Quick Link to `MECHANICS_SUMMARY.md` (correct `tracking/` path); indexed new docs.

---

## Recent Changes (Earlier Sessions)

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
- `docs/context summary.md` - AI + dev session log (canonical; see also stub at `docs/ai/CONTEXT_SUMMARY.md`)
- `docs/Compoohter/` - Co-creator tasks and guides

### Next Session Tasks
- Torpedo Bear: Fix block breaking for blocks directly above (when under structures)
- Mining Bear: Add pathfinding from Discord resources, reduce vanilla behaviors
- See `docs/Compoohter/NEXT_SESSION_TASKS.md` for details

---

### 2026-03-28 — Hybrid mobility + cluster camp (spawn TPS + pressure)

- **Confirmed model:** per-player horizontal-movement EMA scales **block query budgets** (TPS); cluster **centroid vs smoothed anchor** in a horizontal **30-block** cylinder with **|ΔY| ≤ 50** accumulates **sedentary time** over **12 000 ticks** (half in-game day) for **spawn chance** (up to **×1.35**) and a smaller **storm start roll** boost (cached from overworld clusters).
- **New:** `BP/scripts/mb_spawnMobilityCamp.js` — `tickMobilityCampForDimension` (called once per dimension each spawn tick for all online players), `getPlayerMobilityQueryMult`, `getClusterSpawnPressureMult`, `getStormStartChanceCampScale`.
- **Wiring:** `mb_spawnController.js` — `clampMobilityQueryMult` + floor on query limits; `getTilesForPlayer` / `collectMiningSpawnTiles` / `collectDustedTiles` take `mobilityQueryMult`; group rescan uses **per-member** mobility; `chanceMultiplier` includes cluster camp mult; storm scale in `mb_snowStorm.js` `checkStormStart`.
- **Note:** `npm run check` was not run in this environment (Node/npm unavailable on PATH).

### 2026-03-28 — Dev: camp / mobility debug UI

- **Developer Tools** (and pin list): **Camp / mobility debug** — toggles tag **`mb_dev_camp_watch`** for a live **action bar** (cluster, ramp, spawn mult, mobility query mult, overworld storm ramp / roll scale); **Dump full details** to chat; dev **anchor at feet**, **+half / max sedentary**, **clear cluster state**.
- **`mb_spawnMobilityCamp.js`:** dev mutators + `getCampTuningConstants`, `getClusterCampDebugMetrics`, `getLastOverworldStormCampRamp01`.
- **`mb_spawnController.js`:** exports **`computeSpatialClusterMeta`**; **`runInterval`** (~12t) updates HUD for tagged dev players.

### 2026-03-28 — Public release policy + admin disclaimer

- **Public `BP/`:** `INCLUDE_FULL_DEVELOPER_TOOLS` must stay **false** (no dev UI reachable). **Admin** surfaces (menu, pinned storm/list on release) use **`runAdminSurfaceWithDisclaimer`** + player property **`mb_admin_tools_disclaimer_v1`**. Dev build skips that flow when `INCLUDE_FULL_DEVELOPER_TOOLS` is true.
- **`mb_buildConfig.js` / `AGENTS.md`:** Document that stores ship **only** `BP`+`RP`, not `BP - Dev`.

### 2026-03-28 — Release vs dev packs, admin menu, disclaimer, beta versioning

- **`BP/scripts/mb_buildConfig.js`** (release) vs **`BP - Dev/scripts/mb_buildConfig.js`**: `INCLUDE_FULL_DEVELOPER_TOOLS`, `INCLUDE_ADMIN_TOOLS`, `BUILD_FLAVOR`, semver fields + `getAddonVersionDisplayString()`. After bulk-copying `BP` → `BP - Dev`, **restore the dev `mb_buildConfig.js`** (copy overwrites it).
- **Release (`BP`)**: Powdery/Basic journal shows **Admin tools** only (`mb_cheats` / Litbolt123): storm hub, force spawn, list bears; pins limited to **storm** + **list bears**. No full Developer Tools / Debug / camp HUD interval (spawn controller checks `INCLUDE_FULL_DEVELOPER_TOOLS`).
- **Dev (`BP - Dev`)**: Full developer tree; first open uses **disclaimer** (`mb_dev_tools_disclaimer_v1` player property). Admin button hidden when full dev is on (redundant).
- **Navigation**: `journalPowerToolsBack` + `forceSpawnNav` so storm/spawn/list flows return to admin vs dev root correctly; pins set back to `openMain`.
- **Manifests**: beta text only in **header `description`**; **`version` arrays stay `[1, 0, 0]`** on header, modules, and pack dependencies. Dev packs named **MapleBear TakeOver (Dev)**.

### 2026-03-28 — Merged action bar (multi-HUD)

- **`mb_actionBarHud.js`:** slot priorities **INFECTION (10)**, **SPAWN_SCAN_PERF (20)**, **CAMP_DEV (30)**; **`setHudActionBarSegment` / `clearHudActionBarSegment`** merge with **`┃`**; when **2+** segments, line is prefixed with **`[n]`**; **`getHudActionBarDebugInfo`** for dev dump.
- **`main.js`:** infection timer/cure line uses infection slot (tag **`Infect`** in segment).
- **`mb_spawnController.js`:** camp dev + spawn scan overlay use composer; overlay off clears scan slot for all players.
- **Camp dev dump** includes merged action-bar segment count and preview.
