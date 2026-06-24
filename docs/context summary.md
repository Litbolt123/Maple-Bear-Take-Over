# Context Summary

Running log of **what changed and why** (gameplay, scripts, assets, docs). Used by humans and AI assistants. **Convention:** add new work as **dated sections at the top** (newest first). Older material stays below.

**Single source of truth:** This file replaces the separate `docs/ai/CONTEXT_SUMMARY.md` log (that path now redirects here). A **historical archive** from the old AI file is appended at the **bottom** of this document; if something disagrees with a newer dated section above, trust the dated section.

---

## 2026-06-24 — What's new still showed beta.4.1 (stale Bridge export)

- **Diagnosis:** Screenshot matched **pre-4.2** scripts (`MapleBear TakeOver`, `Recent highlights`, beta.4.1). Journal does **not** cache changelog text — world was on an old pack export. Root `config.json` had been on **`./BP`** (release), not **`./BP - Dev`**.
- **Fix:** `npm run bridge:config:dev:sync` → Bridge now targets dev packs. `copyBridgeConfig.js` reads **`BP - Dev/scripts/mb_buildConfig.js`** for dev flavor. Join Content Log warns expected **Dev Beta 4.2** version. User must **re-export `.mcpack` from Bridge** and replace the behavior pack on the world.

---

## 2026-06-24 — What's new version tracking (Dev Beta 4.2, existing worlds)

- **Root cause:** `PLAYER_CHANGELOG_VERSION` was never wired to journal UI — no per-player `whatsNewLastSeenVersion`, no **(new)** badge. What's new body is **not** cached (always from `getPlayerChangelogBody()`); stale text in existing worlds usually means the world still runs **public `BP/`** scripts or an old dev export.
- **`mb_playerChangelog.js`:** `getPlayerChangelogDisplayLabel()` → **Dev Beta 4.2** (dev) / **Beta 4** (public); `isPlayerChangelogUnread(codex)`.
- **`mb_journalWhatsNew.js`:** title `What's new — Dev Beta 4.2`; marks seen on open.
- **`mb_codex.js`:** `journal.whatsNewLastSeenVersion`, `markPlayerChangelogSeen`, `ensurePlayerChangelogMigration`; Powdery main menu **What's new (new)** when version differs.
- **`main.js`:** `ensurePlayerChangelogMigration` on player join. Mirrored `BP/` + `BP - Dev/`.

---

- **`BP/scripts/mb_playerChangelog.js`:** snow buzz + infection shake bullets (version still `beta.4`).
- **`mb_codex.js`:** Snow (Powder) item entry mentions camera buzz when identified.
- Dev 4.2 version/manifests/Patreon docs committed.

---

## 2026-06-22 — Dev Beta 4.2 journal + version alignment

- **`BP - Dev/`** `mb_buildConfig.js` → `beta.4.2`; `mb_playerChangelog.js` What's new; codex infection mechanics + settings label.
- **`docs/PLAYER_CHANGELOG.md`** Dev Beta 4.2 section; smoke checklist row; `syncPackMetadata.js` reads dev prerelease from `BP - Dev/scripts/mb_buildConfig.js`.
- Public **`BP/`** changelog/version unchanged (`beta.4`).

---

## 2026-06-22 — Dev Beta 4.2 release notes + Patreon draft

- **`docs/development/releases/DEV_BETA_4.2.md`** — dev drop scope (camera shake, day-0 perf, opt-in villages, clean exports).
- **`docs/marketing/PATREON_DEV_BETA_4.2.md`** — paste-ready Patreon post (video hook for snow buzz / jitter).

---

## 2026-06-22 — Snow eat camera buzz (stacking, diminishing)

- **`triggerSnowEatCameraBuzz`** in `mb_infectionCameraShake.js` — rotational + light positional pulse on `mb:snow` use.
- **Stacks** if re-eaten within ~5s (longer linger, up to ~6.5s); each rapid bite adds a **weaker** pulse.
- **Lifetime `snowCount`** dims intensity (√ decay) so late-tier snow feels muted — matches tier messaging.
- Same journal toggle: **Settings → Camera shake (infection + snow buzz)**.

---

## 2026-06-22 — Clean structure exports (no runtime artifact cleanup)

- **Discovery:** Structures can be saved for natural spawn **without** `structure_block` ever appearing in-world — no export bake, no script strip pass on approach.
- **`SKIP_WORLDGEN_ARTIFACT_CLEANUP`** in `mb_abandonedVillageConstants.js` (default `true`): skips lamp cleanup interval, build `cleanup` phase, and activation-time column scans.
- **`VILLAGE_STRUCTURE_COLLAB_GUIDE.md`:** export checklist updated; `strip:mcstructures` marked legacy-only.
- Re-export old lamp/building `.mcstructure` files when convenient; flip flag to `false` only if legacy baked artifacts return.

---

## 2026-06-22 — Script villages: WIP rationale (default OFF)

- **Why off by default:** Current script placement path is **laggy** and **buggy**; not ready for normal play.
- **Ship goal:** **Natural jigsaw worldgen** (connected `.mcstructure` pieces) per `docs/development/VILLAGE_STRUCTURE_COLLAB_GUIDE.md` — not block-by-block script builds.
- **Dev path:** Journal → **Settings → Dev world features** → Script villages (WIP). Manual test places in Developer Tools still work when OFF.

---

## 2026-06-22 — Abandoned villages: dev opt-in (Settings, default OFF)

- **`mb_scriptToggles.js`:** `SCRIPT_DEFAULT_OFF` includes `abandoned_village_worldgen` — unset world property = OFF. `isAbandonedVillageWorldgenEnabled()` helper. Removed from Script toggles infection category (use Settings instead).
- **`mb_codex.js`:** Dev pack → **Settings → Dev world features** → Abandoned villages ON/OFF. Script toggles hub notes the new location.
- **`mb_abandonedVillageWorldgen.js`:** `resumeIncompleteSettlementsNearPlayer` skips when setting OFF; debug HUD points to Settings.
- New worlds join with villages **off** until enabled; manual test places (Developer Tools) still work.

---

## 2026-06-22 — Abandoned village lag: fix 224-block theoretical lamp interest

- **Root cause:** `playerNearVillageInterest` returned true for almost every overworld player because `distLamp <= LAMP_APPROACH_DIST_MAX` (224) matched the current grid cell's theoretical lamp — main 20t loop never slept → lag spikes (especially day 0).
- **`mb_abandonedVillageSites.js`:** `playerNearTheoreticalLampSlot` (≤56), `playerNearWorldgenLampMarker`, `playerInVillageApproachBand` (horizon band without 224 grid), `anyPlayerNearLampActivation`. `playerNearVillageInterest` now uses infected biome, registered site ≤192, lamp marker, or theoretical arrival ≤56 only.
- **`mb_abandonedVillageWorldgen.js`:** `shouldRunHeavyVillageScans` uses `playerInVillageApproachBand`; lamp arrival bypasses spread when `atLampPost`; `nearLamp` passed to perf refresh; debug HUD shows `lamp`/`approach` flags.
- **`mb_abandonedVillagePerf.js`:** `nearLamp` opt caps scan interval to 20t and skips idle 8× stretch when at a lamp.
- **`mb_scriptToggles.js`:** toggle note that placement sleeps when far from sites/lamps. BP + BP - Dev synced; `npm run check` OK.

---

## 2026-06-22 — Abandoned village proximity perf (post-lamp lag fix)

- **Root cause:** Paused build jobs in queue counted as globally busy; global `incomplete/pending` registry forced heavy horizon scans everywhere; lamp cleanup never slept after first `built` site.
- **`mb_abandonedVillageSites.js`:** `playerNearVillageInterest`, `anyPlayerNearVillageInterest`, `listRegisteredSiteInterestNearPlayer`, `distToNearestRegisteredSiteInterest`.
- **`mb_abandonedSettlementBuilder.js`:** `isSettlementBuildActivelyWorking`, `getSettlementBuildBlocksForJob` + proximity budget (≤96 full, 96–192 ~60%).
- **`mb_abandonedVillageWorldgen.js`:** `isAbandonedVillageActivelyWorking`, proximity `shouldRunHeavyVillageScans`, main-loop sleep, processor only near players, lamp cleanup via registry + `claimSpreadSlice`.
- **`mb_abandonedVillagePerf.js`:** idle + `nearInterest` opts; day-0 load floor only when not idle-far; dev HUD shows `idle/active/near/heavyScan`.

---

## 2026-06-22 — Infection camera shake softer (+30% cut, 30s ramp)

- **Shake:** Another ~30% reduction — base **0.28** (was 0.4), peak **0.7** (was 1.0). Gradual ramp over the **last 30s** before transform instead of jumping to full in the final phase. Lower jitter/burst caps and burst frequency. BP + BP - Dev.

---

## 2026-06-22 — Gate minor infection scaled-timer Content Log spam

- **Bug:** `[MINOR INFECTION] Day N: Scaled timer to …` logged every **40t** from `getScaledMinorInfectionTicks()` (infection loop calls it for `maxTicks`) — ignored debug toggles.
- **Fix:** `isMinorInfectionDebugEnabled()` gates scaled-timer, init, load-cap, and days-left logs behind **Main Script → Minor Infection** (or Infection / all). **Clear infection debug** also clears `main.infection` + `main.minorInfection`. BP + BP - Dev.

---

## 2026-06-22 — Idle abandoned-village scan throttling

- **Root cause (confirmed):** Lag with **Abandoned village placement** ON while **not near a village** came from background scans every ~20–40t: lamp grid loops (224-block radius), `findLargeInfectedSitesNeedingVillage`, and horizon ring + `getInfectedProximityTier` (O(radius²) biome reads) — not settlement block placement.
- **`mb_abandonedVillageWorldgen.js`:** `isAbandonedVillageWorkIdle()` (no build / processor / activation queues). When idle + vanilla biome + no lamp marker at feet: **skip** lamp grid, large-infected search, and horizon scan entirely. Lamp arrivals when near a marker use `claimSpreadSlice("avLampArrival", 160t)` when idle. Dynamic `getIdleHorizonScanSkip`: 8× on day 0–1 idle, 4× idle, 2× when busy. Lamp cleanup skipped when registry empty; per-player skip when idle vanilla far from lamps.
- **`mb_abandonedVillagePerf.js`:** `refreshAbandonedVillagePerf(tick, { idle })` — idle multiplies scan interval up to **320t** (day 0–1) / **160t** (later days); lamp cleanup interval 2–4× longer when idle.
- **Synced** BP + BP - Dev. `npm run test:scripts:release` OK.

---

## 2026-06-22 — Revert settlement build throttling (keep scan idle opts)

- **Playtest finding:** Lag traced to **idle horizon scans**, not settlement block placement. Reverted building-only caps in `mb_abandonedVillagePerf.js` + `mb_abandonedSettlementBuilder.js` (BP + BP - Dev).
- **Removed:** `DAY01_MAX_BUILD_PER_TICK` (day 0–1 build ≤6/t), outer-band throttling (`OUTER_BAND_*`, `resolveSettlementBuildBudget`, `shouldSpendSettlementBuildBudgetThisTick`). `tickSettlementBuildQueue` again uses full adaptive `getSettlementBuildBlocksPerTick()` every tick.
- **Kept:** Day 0–1 processor cap (≤48/t), scan interval floor (`DAY01_MIN_SCAN_INTERVAL`), load floor, horizon scan defer (`shouldDeferAbandonedVillageHorizonScan`), adaptive scan/processor budgets.

---

## 2026-06-22 — Village perf + softer infection shake

- **Village lag fix (confirmed: `abandoned_village_worldgen` toggle):** Day 0–1 load floor + caps (build ≤6/t, processor ≤48/t). **≤96 blocks** from center: full capped budget (faster witness build). **96–192**: ~30% budget, every other tick. Processor skips on village burst defer + high wall stress.
- **Shake:** ~60% weaker outside final **2s** (`ticksLeft ≤ 40`); full intensity preserved at transform. Burst chance reduced outside final window. Shake debug dev-pack only; `clearInfectionDevDebugForPlayer` in Infection Dev Tools.

---

## 2026-06-22 — Abandoned village worldgen confirmed as tick-stall source

- **Playtest:** Script toggle **Abandoned village placement** OFF → lag gone; ON → periodic block-break / mob-freeze hitches return. Not infection or camera shake.
- **Cause:** `mb_abandonedVillageWorldgen.js` — processor up to **160 blocks/20t**, settlement builder up to **12 blocks/tick** when queue active near player (~192 blocks).
- **Day 0 gap:** `mb_spawnLoadMetrics` skips bear/item sampling before day 2, so `mb_abandonedVillagePerf` often sees **load01 ≈ 0** and keeps **full** build/processor budgets on day 0 (worst case for new worlds).

---

## 2026-06-22 — Periodic tick stalls (blocks/mobs freeze)

- **Symptom:** ~2s smooth, then 1–2s where block breaks and mob movement pause, then catch-up — repeats. That is **server tick stall** (MSPT), not camera shake or client FPS.
- **Likely culprits (day 0):** (1) **Abandoned village worldgen** — every **20t** applies up to **160** infected-biome block rules per tick; settlement builder places up to **12 blocks/tick** when queue active (within ~192 blocks of site). Action bar may show *Generating abandoned village…*. (2) **Infection loop** every **40t** — minor cost alone; not enough for multi-second hitches after save throttle. (3) **Ground exposure** if standing on infected/dusted dirt.
- **Isolate:** Script toggles → **Abandoned village placement** OFF; or walk **200+ blocks** from any generating village. Day 0 bisect → **Infection timer** off vs **All OFF**. Shake debug off.

---

## 2026-06-22 — Day 0 lag (infection loop + camera shake)

- **Why lag with shake OFF:** Day 0 already has heavy baseline work (chunk load, abandoned village worldgen, 8× work spread, biome checks, spawn metrics). The infection loop runs every **40t** regardless of camera shake — timer decay, `syncSimPlayerInfectionEntries`, and (previously) **`saveInfectionData` every 40t** (8+ dynamic property writes). After the timer-pause fix, the loop **no longer skips entirely** during village/chunk defer (only symptoms/audio/snow defer), so infected players add steady cost on day 0.
- **Why shake ON feels the same early:** `shouldTickInfectionCameraShake` skips shake when the timer is still high (>45% remaining on minor / not in last day phase on major). Toggle off only saves a `getCodex` read per 40t tick — not the main hitch.
- **Perf fixes:** `saveInfectionData` throttled to **200t** for loop saves; event saves (cure, apply infection, leave, dev) still `{ force: true }`. Shake API mode cached per player; debug logging gated on dev toggle. Synced `main.js` + `mb_infectionCameraShake.js` to `BP - Dev/`.
- **Isolate lag:** Journal → Developer Tools → **Day 0 bisect** — turn infection off vs all off; check shake **debug** is not left on (Content Log flood).

---

## 2026-06-22 — Infection timer pause fix

- **Root cause:** `shouldDeferVillageBurst("infection")` paused the **entire** infection loop (including timer decay) during chunk crossings / village load — HUD still refreshed, so the timer looked stuck (~6–8s) then jumped.
- **Fix:** Timer decay + transformation always run; only symptoms/audio/snow decay defer. Intro path now still expires at 0 ticks. Dev timer adjust resets `warningSent` when > 1 min left.
- **Camera shake:** Two layers — jitters + random bursts. **Major** = full intensity always (+ snow boost). **Minor** = milder when healthy, ramps to **full** shake near death (same as major at urgency ≥ 88%).

---

- **Bunkers:** Hatch on east interior edge (`2,1`); ladder shaft on east shell wall beside it; trap via `trySetFloorTrapdoor`; ladders placed **last** after caps/chest/lights; `trySetLadderRung` skips invalid rungs (no `/setblock` force → no item drops).
- **Houses:** Brown stained glass panes never roll on perimeter **corner** columns (grid + stub build).
- **Cellar houses:** Main-floor barrels/pantry stripped; food in cellar (`lootSlot: cellar`).
- **Floor pantry houses:** Same main-floor rule — barrels/pantry furnishings removed from plan; **`placeFloorPantry`** fills the pit chest with `housePantryLootKeyForRuleset` (food stays under the trapdoor, not on open floor).

---

## 2026-06-02 — Hide bunkers build right after paths

- **Design:** Path trapdoor bunkers are early safe holes while the village generates (lore later).
- **Change:** Build phase order is now paths → **bunkers** → structures → pen → well → snow → zombies. Bunker ladders place immediately (not deferred to ruin pass). Resume with zero structures placed re-enters bunker phase first.

---

## 2026-06-02 — Village structure ring layout + build order

- **Symptom:** Houses clustered on one side of the village (worse when standing on that side).
- **Cause:** Default layout used **random angles** per slot (clustering expected); layout variant 2 was a **270° arc**; build order sorted **nearest lamp first** (player often at lamp).
- **Fix:** `ringOffsetForSlot` — even angular spacing + small jitter for ring/default/cross-fill/arc layouts; build order `sortStructuresAroundCenter` (clockwise by angle) instead of lamp distance.

---

## 2026-06-02 — Church regen skeleton + hide bunker box cleanup

- **Church “correct then broken”:** Second build pass ran pad carve (`rise < 0` → air in footprint) after resume/retry on partial footprints. **Fix:** `footprintHasSubstantialShellEvidence` → skip rebuild when perimeter shell already present; skip vegetation sweep when partial debris or chunks unloaded; `skipPadCarve` jumps pad phase on partial resume so existing walls/interior are not carved away.
- **Hide bunkers on slopes:** Per-cell `cachedFloorY` made uneven floors, hill-meld shells, lanterns/torches/ladders on bad attachment (item drops). **Fix:** uniform 5×5 box from max reference Y across shell; prep pass carves flat floor + interior air + shell walls; caps/trap/chest only after prep; `trySetSettlementLantern`/`trySetSettlementTorch` + ladder back-wall checks before placement.

---

## 2026-06-02 — Pack update / orphan village overlap protection

- **Concern:** Reinstalling the BP on a world that already has script villages — will it build again on top?
- **Usually no:** `mb_av_village_sites` world property (built keys + centers) lives in the **world save**, not the pack; survives pack delete/reinstall on the same world. Activation checks `isSiteBuilt` + block verify before building.
- **Could happen if:** registry lost/reset (dev “clear registry”), stale built flag cleared without blocks at saved coords, or village finished in-world but never `markSiteBuilt` (left mid-build → resumes instead).
- **Fix:** Wired `probeSettlementCenterNearWorld` → `tryLinkOrphanSettlementNearLamp` into activation + placement (was dead code). Scans mossy/path footprint near lamp, links site as built instead of placing again.

---

- **Symptom (ContentLog):** Rejoin meadow site `2,-4,0` → `Build resume — 6 slot(s) demoted`, fletcher **relocated** onto other houses, edits climbing 7k→15k in `structure_retry` loop; wake showed `structures=0/9` then full rebuild.
- **Cause:** `reconcile` fail-closed on unloaded chunks → demoted real completes → vegetation sweep + rebuild; ran on every wake + every `structure_hold` tick. Pending ladders blocked completion → infinite retry.
- **Fix:** Tri-state footprint (`undefined`=unloaded, never demote); demote only with partial debris; no reconcile on wake; structure_hold seeds once; skip/relocate blocked when shell complete; ladders no longer block structure completion.

---

## 2026-06-02 — Village false completion + empty enchanted books

- **Village stuck at 9/9 / “finished” with half-built houses:** Loose footprint probes (paths + partial mossy cobble) marked slots **existing** without full walls/roof; wake/resume then advanced to well/done. **Fix:** `footprintHasCompleteStructureEvidence` (perimeter + roof line), demote false completes on resume (`reconcileStructureSlotStatesBeforeResume`), no footprint skip during live `structures`/`structure_retry`/`structure_hold`, `allResolvableStructureSlotsFinished` required before placement success, incomplete finalize persists manifest + `markSiteIncomplete`.
- **Enchanted books empty:** Smith/librarian augments spawned bare `minecraft:enchanted_book`; `canAddEnchantment` often fails on books. **Fix:** `applyEnchantsToStack` forces `addEnchantment` on books, random `ENCHANTED_BOOK_POOL`, librarian fallback entries with Protection/Sharpness I.

---

## 2026-06-09 — Dev Beta 4.1 tagged (Patreon dev drop)

- Version **`v0.9.0-beta.4.1`** on **`BP - Dev/`** only; public **`BP/`** stays **`beta.4`** until next store release.
- **`docs/development/releases/DEV_BETA_4.1.md`** — install + scope notes.

---

## 2026-06-02 — Lamp detection: horizontal search (grove / hills)

- **Symptom:** Grove/cold biomes — post visible, script still NO / no activation.
- **Cause:** `structure_template` **`adjustment_radius: 6`** shifts the lamp off the exact grid snap; script only probed one column. Hills/snow also needed wider vertical scan + snow_layer footing pass-through.
- **Fix:** `findWorldgenLampMarkerNear` (±8 blocks), player-feet shortcut in `collectLampArrivalSitesNearPlayer`, debug shows **Post at your feet** + Δ offset from snap. Cold lamp allowlist + feature rule tags for grove/snowy slopes/taiga.

---

## 2026-06-02 — Fix lamp post detection (script sees post: NO)

- **Symptom:** Walk to worldgen lamp → scans run but no village activation; debug never showed lamp arrivals.
- **Cause:** `hasWorldgenLampMarkerAt` assumed fences start at `surfaceY`; exported lamps have **cobble/sandstone base** below fences. Desert posts use **`sandstone_wall`**, not `fence`.
- **Fix:** Vertical band scan (hintY ± margin) for fence/wall/barrel/lantern column (≥2 blocks) + footing below. Debug menu now shows **script sees post: YES/NO** per slot and **lamp-arrival sites ready** count.

---

## 2026-06-02 — Commit prep: archive plains export worldgen test

- **Kept:** lamp post markers (`village_marker_*`), script procedural villages (`mb_abandonedVillageWorldgen.js` + `mb_abandonedSettlementBuilder.js`), `.mcstructure` assets under `structures/mb/av_plains/` for Maple Bear collab.
- **Archived:** single-building jigsaw/scatter test → `BP - Dev/_archived/av_plains_export_worldgen_test/` (worldgen JSON + `features/mb/av_plains/` + tool config snapshots).
- **`JIGSAW_SCRIPT_VILLAGES_ENABLED = false`** (dev + release); dev menu **Jigsaw export @ feet** removed.
- **`tools/mbAvPlainsSpawnDensity.json`** → `"active": "off"`; **`syncAvPlainsSpawnDensity.js`** removes active jigsaw/scatter paths when off.
- Docs: `ABANDONED_VILLAGE_STRUCTURES.md`, `structures/mb/av_plains/README.txt`.

---

## 2026-06-05 — Collab guide: full jigsaw villages + bunker backlog

- **`VILLAGE_STRUCTURE_COLLAB_GUIDE.md`** rewritten — **Maple Bear** builds **full jigsaw villages**; **script structure spawning on hold**. Milestones: well + paths → hamlet → village pools.
- **Future:** random **lore bunkers** (worldgen) added to `TODO.md` + `IDEA_BRAINSTORM.md` — separate from village work and legacy script hide bunkers.

---

- **`docs/development/VILLAGE_STRUCTURE_COLLAB_GUIDE.md`** — handoff for co-creator building abandoned jigsaw/Structure Block pieces: per-biome counts (~4 houses), art rules, export checklist, loot vs script split, MS Learn + Creator Camp watch list, delivery options, milestones. Indexed in `docs/README.md` + `docs/collaborators/`.

---

## 2026-06-05 — Export floor alignment (ocean_floor + ignore grass_block)

- **Symptom:** `plains_house_2_tall` jigsaw spawn — grass/dirt rim, floor floating ~1 block (Y=0 in file = grass_block pad; real floor at Y=1).
- **Fix:** `heightmap_projection: ocean_floor`; processor **`block_ignore`** adds **`minecraft:grass_block`**. User confirmed improvement after reload.
- **Re-export tip:** floor at structure **Y=0** (cobble/plank) or void — never save ground grass as Y=0.

---

- User re-exported **`plains_house_2_tall.mcstructure`** (9×12×10, validate ok). Pool + jigsaw synced to **this file only**; spawn profile **`house_2_tall_test`** (spacing 2 chunks, jigsaw-only).
- Palette check: **no `structure_void`** in file yet (93 air); dirt/grass blocks present in export — will place as solids.

---

**Goal:** Match vanilla structure placement habits for export buildings.

**Shipped:**
- **`mb_catalogExportVoid.js`** + **`catalog_void`** build phase — after starter-set build, fills export-box air with **`structure_void`** (open floors/margins preserve terrain; room air stays air). Jigsaw **`av_empty`** processor ignores void blocks.
- **`tools/mbAvPlainsSpawnDensity.json`** — `scatter.enabled: false` (release + test); **`terrain_adaptation`** per profile (`none` default; set `beard_thin` to experiment). **`syncAvPlainsSpawnDensity.js`** removes scatter feature rules when disabled, writes jigsaw structure + structure set.
- Export pool still **3 valid** structures until user re-exports broken files.

**User:** Reload dev pack → **new chunks**. Re-run **Starter set for export** (void fill runs automatically) → Structure Block save → strip → validate → add back to export pool when all pass.

---

**User report:** huge oak plank boxes; buildings carving into hills.

**Root cause:** `npm run validate:mcstructures` on `BP - Dev/structures/mb/av_plains/`:
- **`plains_church_cathedral_ruin`** — 21×12×23 volume **100% solid `oak_planks`** (no air) → the “plank boxes” in world.
- **`plains_house_1`, `house_3`, `bakery`, `farmhouse`** — **100% air** (empty/broken exports; likely corrupted by an unsafe Y-shift).
- **OK:** `plains_house_2_tall`, `librarian_study`, `smithy`.

**Fix shipped:**
- **`tools/mbAvPlainsExportPool.json`** + **`npm run sync:av-plains-export-pool`** — worldgen scatter + jigsaw pool restricted to the **3 valid** structures until re-export.
- **`npm run validate:mcstructures`** added; **`shiftMcstructureDown.js`** refuses shifts that would leave &lt;2% solids.
- README: no solid filler boxes; validate before re-enabling pool entries.

**Terrain carving:** any non-air block in the save volume replaces world blocks (including dirt/stone under oversized boxes). Tight export boxes + air inside footprint reduce carving. Procedural script villages (`mb_abandonedSettlementBuilder.js`) also clear obstructions separately.

**User action:** re-export broken 5 files (Journal → Starter set for export, tight box, Offset 0,0,0), strip + validate, re-add to export pool. Reload dev pack + **new chunks** (old chunks keep broken placements). Set spawn density back to `release` when done testing.

---

## 2026-06-05 — Test spawn density profile (32-grid, 2 slots)

- **`tools/mbAvPlainsSpawnDensity.json`** — `active: test` (32-block scatter grid, 2 anchors, jigsaw spacing 4) vs `release` (128-grid, 1 anchor, spacing 28).
- **`npm run sync:av-plains-spawn-density`** regenerates scatter features, feature rules, structure set.

---

## 2026-06-05 — Float on slopes: adjustment_radius 0

- **High float** (whole building above beach/slope): `adjustment_radius: 4` moved placement up to a nearby higher column; set to **0** (grid-locked XZ).
- Scatter Y hint back to **motion_blocking** + dry-land gate; snap **vertical_search_range 24**.

---

## 2026-06-05 — Fix Bedrock block IDs in export allowlists

- **Json errors:** `minecraft:rooted_dirt` → **`minecraft:dirt_with_roots`**, `minecraft:dead_bush` → **`minecraft:deadbush`** in snap + place block_intersection (see `data/bedrock_blocks.json`).
- **`applyAvPlainsPlaceConstraints.js`** now reads **`tools/mbAvPlainsSurfaceBlocks.json`** (single source for all 8 place + snap files).

---

## 2026-06-05 — Structure world placement pass (snap, shift, constraints)

- **`shiftMcstructureDown.js`** — shifts export voxels down 1 when Y=0 is thin trim only; ran on 5/8 `.mcstructure` files (user re-exports in folder).
- **All `place_*.json`:** `adjustment_radius: 4` + **`block_intersection`** surface allowlist (skips cliff/tree overlap; searches nearby column).
- **`snap_export_building`:** `vertical_search_range: 48`, **`allowed_surface_blocks`** land list.
- **Jigsaw:** `world_surface` + `max_distance_from_center`; **`liquid_settings`** kept; structure set **spacing 28 / separation 10** (scatter remains primary).
- **Processor:** ignore **`structure_void`** for future exports.
- npm: **`shift:mcstructures`**, **`shift:mcstructures:dry`**.

---

## 2026-06-05 — snap_to_surface wrapper on export scatter chain

- Added **`features/mb/av_plains/snap_export_building.json`** — `surface: floor`, `vertical_search_range: 32`, `allow_underwater_placement: false`.
- Scatter grid now places snap → weighted random → structure_template; removed manual dry-land + motion_blocking molang from scatter.

---

## 2026-06-05 — Features + structure block docs mapped to scatter path

- **Structure Block default Offset Y=-1** ([intro](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontostructureblocks)) explains export air at Y=0 / floor at Y=1; README re-export step added.
- **Feature chain** matches MS pattern: feature_rule → scatter → weighted_random → structure_template ([features intro](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/featuresintroduction)).
- **`snap_to_surface_feature`** + `allow_underwater_placement: false` documented as future cleaner alternative to dry-land molang.

---

## 2026-06-05 — Jigsaw aligned with MS Learn (placement + water)

- **Docs:** [Jigsaw intro](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontojigsawstructures), [tutorial](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/jigsawtutorial), [terrain FAQ](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/terrainmatchingtips).
- **`mb:abandoned_village_plains`:** `heightmap_projection` **world_surface → ocean_floor** (top solid, matches scatter motion_blocking); **`liquid_settings: apply_waterlogging`** per terrain FAQ for water overlap.
- **Keep `projection: rigid`** on pool — terrain_matching is for multi-piece chains on slopes, not single export buildings.
- **Scatter path** still has dry-land molang gate; jigsaw has no equivalent — shore/river edge spawns may still occur via structure set.

---

## 2026-06-05 — Export placement: motion_blocking anchor + skip water

- **1-block gap persisted:** `.mcstructure` files have **air at Y=0**, walls/floor at **Y=1**; `grounded` + `world_surface` heightmap stacked another block on top.
- **Fix:** Removed `grounded` from all `place_*.json`; scatter **y = motion_blocking_no_leaves** so structure Y=1 meets grass; **dry-land gate** skips fluid columns (`motion_blocking + 1 >= world_surface`).
- **Water render bugs:** buildings no longer scatter over rivers/ocean columns.
- **No grass under footprint:** expected — floor is cobble/dirt, not grass; flush placement, not a void.

---

## 2026-06-05 — Export float gap, hill clip, false lamp arrival

- **1-block air gap:** `unburied` lifted whole structure on slopes; scatter features back to **`grounded`** only (surface exports, no basement).
- **Hill clipping:** same — `unburied` raised anchor on high corner while low corner floated; grounded seats lowest block on terrain.
- **False lamp @ grid 0,-1,0:** lamp-arrival used math grid only; now requires **`hasWorldgenLampMarkerAt`** (fence post column at lamp snap).

---

## 2026-06-05 — structure_block in export spawns in world

- **Cause:** Structure Block was inside the save volume when exporting smaller boxes; scatter features bake all blocks into the template (no processor pass).
- **Fix:** Jigsaw processor `block_ignore` for structure_block/jigsaw; `npm run strip:mcstructures` tool; export tip — place Structure Block outside save box.

---

- **Cause:** Oversized Structure Block save boxes (side/bottom margin in old manifest) + `grounded` anchoring to the lowest block in the file — not necessarily basement (church was exported surface-only per author). Large footprints made the extra margin more visible as a dirt/stone pit.
- **Fix:** Catalog builds skip basement; export box is tight (floor = structure Y=0); removed `grounded` from scatter features; scatter y = raw heightmap. **Re-export all 8 `.mcstructure` files** via Starter set for export.

---

- **Sunk 1 block:** catalog exports anchor at walkable Y (floor + 1); scatter used raw `q.heightmap` (grass top). Scatter `y` now `heightmap + 1`; jigsaw `start_height.absolute` → **1**.
- **Dirt pad around buildings:** scatter `adjustment_radius` **0** (was 4–6); jigsaw `terrain_adaptation` **none** (was `beard_thin`).

---

- **Template pool `location`:** `mb/av_plains/plains_house_1` (slash) — colon form caused `Invalid asset path av_plains/...` in Content Log.
- **`structure_template_feature.structure_name`:** `mb:av_plains/plains_house_1` (colon) — slash form caused “must be prefixed by a namespace”.
- Structure set: spacing **4**, separation **1** (valid).

---

- **Why nothing spawned:** jigsaw `biome_filters` listed plains/meadow/sunflower as separate entries (AND) — no biome matched. Fixed with `any_of`.
- **Not like lamps:** lamps = small posts on 384-block grid + script build. Export buildings = full `.mcstructure` on terrain via scatter (128-block grid) or jigsaw structure set — **new chunks only**.
- **Instant test:** Journal → Abandoned villages → **Jigsaw export @ feet** (works in existing world).
- **`feature_rules/av_plains_export_building_slot0.json`** + `features/mb/av_plains/*` weighted random of 8 pieces.

---

## 2026-06-04 — Plains jigsaw spawn density cranked up

- Structure set **spacing 8 → 2** (separation 1) — ~4× more sites; near the engine minimum (`spacing` must stay > `separation`).
- **`BP - Dev/worldgen/structure_sets/mb/abandoned_village_plains.json`**

---

## 2026-06-04 — Plains jigsaw worldgen (dev test frequency)

- **8 exported pieces** wired in `BP - Dev/worldgen/` — start pool picks one random building per site (`plains_house_1`, `plains_house_2_tall`, `plains_house_3`, smithy, bakery, librarian, church, farmhouse).
- **High spawn rate for testing:** structure set spacing **2**, separation **1** (plains/meadow/sunflower_plains).
- **Dev only:** `JIGSAW_SCRIPT_VILLAGES_ENABLED` = true when `INCLUDE_FULL_DEVELOPER_TOOLS`; public `BP/` unchanged.
- Multi-building hamlets still need a hub `.mcstructure` with jigsaw connectors — current exports are single-piece spawns.

---

## 2026-06-04 — Catalog export: no grass pads; church with cellar

- **Grass pads removed:** `layStructureCatalogPlatform` only places the gold yard marker; manifest no longer lists pad bounds; catalog signs use smooth stone.
- **Church cellar:** starter set uses **`churchRoll: 4`** (`cathedral_ruin` with `basementDepth` + crypt storage). Catalog mode now **runs basement carve** but still skips **cellar bury** (no fake earth berm in sky yard). Export box extends below floor by basement depth.
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedStructureCatalog.js`, `mb_abandonedSettlementBuilder.js`.

---

## 2026-06-04 — Catalog export: no cobble pillars, full footprints, aligned pads

- **Symptom:** Starter set at Y=200 — missing grass pads (6–8), cobblestone pillars from sky pads down to terrain, stained-glass building (librarian) only half built.
- **Pillars:** Normal village **pad leveling** scanned air columns down to ground and filled ~130-block columns; `ensureStructureColumnFoundation` added cobble under pads. Catalog mode now **skips pad/basement/cellar** phases and uses flat `platformY` only.
- **Partial building:** Layout used generic `footprintForStructure` (9×8) while runtime salt picked **librarian_study** (10×8) — west wall never built. Build now **syncs w/d/wallH from resolved floor plan**; catalog layout uses **`catalogFootprintForSlot`** + shared **`catalogStructureSalt(index)`** with runtime build.
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`, `mb_abandonedStructureCatalog.js`.

---

## 2026-06-04 — Catalog export build: fix watchdog hang on structure 6+

- **Symptom:** Starter set for export built 5/8, then `Structure SKIP footing` on librarian/church → `findRelocatedStructureOffset` / `analyzeColumn` ran thousands of column scans → `InternalError: interrupted` + ~10s watchdog hang → server shutdown.
- **Cause:** Sky pads at Y=200 still used normal village footing checks and relocation ring search when footing failed.
- **Fix (`structureCatalogMode`):** skip `structureFootprintIsBuildable`, settlement-evidence check, and relocation; trust pre-laid pads and use `job.y` as `platformY`; advance to `catalog_signs` when all slots processed; hold/retry paths route to catalog signs not well.
- **Naming:** church export name no longer doubles biome prefix (`plains_church_chapel_small` not `plains_church_plains_chapel_small`).
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`, `mb_abandonedStructureCatalog.js`.

---

## 2026-06-04 — Playtest: leave/return resume OK; some houses look incomplete

- **Validated:** player can leave construction band and return; village build continues and finishes (wake/slot-index fix).
- **Open:** some structure slots may look visually unfinished — likely skip-footing, relocate, `EXISTING`/partial registry vs blocks, or chunk edge; not blocking resume flow.
- **`BP - Dev/`** playtest feedback (user).

---

## 2026-06-04 — Wake HUD no longer jumps structure slot to 5/5

- **Symptom:** after leave/return during `WAIT chunks`, `Build wake` showed `slot=5/5` with `structures=2/5`, heartbeats frozen (`edits` stuck), no `RESUME chunks`.
- **Cause:** `seedStructureSlotsFromWorld` / wake set `job.structureIndex = slots.length` while `activeStructure` was still on slot 3 — chunk retry and HUD used the wrong index.
- **Fix:** `activeStructureSlotIndex` + `setActiveStructureForSlot`; wake uses `refreshAllStructureSlotsFromWorld` only (no index bump); structures phase resets index via `findFirstStructureSlotNeedingWork` when needed; DONE advances `structureIndex = idx + 1`.
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`.

---

## 2026-06-04 — WAIT chunks resume + incomplete reload continues pending slots

- **Stuck at `Structure WAIT chunks`:** main `structures` phase never retried `beginStructureBuild` when chunks loaded (retry existed only in `structure_retry`). Now retries each tick → `Structure RESUME chunks` then builds.
- **Reload resume skipped pending houses:** `resumeIncomplete` jumped to well/bunkers when tier minimum met even if slots were still `pending` — now resumes at first pending/skipped/ladder slot.
- **HUD return:** `tryWakeSettlementBuildAtCenter` on enter construction HUD / return to build band.
- **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — HUD vs done village, per-structure build logs

- **False “Generating” after leave:** `phase=done` jobs waiting for witness were still in `listActiveSettlementBuildCenters` — HUD showed active build while logs said `Build completion FINAL`. HUD now ignores witness-pending jobs; log says `Build finished off-site` (throttled, not “still generating”).
- **Per-structure Content Log:** `Structure START/DONE/WAIT chunks/EXISTING/SKIP` with slot index and world coords (Build category).
- **Re-enter logging:** presence state resets on village switch; ~10s HUD heartbeat with phase/edits/structure progress while in band.
- **`getActiveSettlementBuildJobForSite`** — lamp activation no longer blocked by a finished-but-not-finalized queue entry.
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`, `mb_abandonedVillageNotify.js`, `mb_abandonedVillageWorldgen.js`.

---

## 2026-06-04 — Village return: fix structures crash, resume after reload

- **Root cause:** `ensureStructureSlotReadyForBuild` used undefined `fp` → thrown every tick (swallowed) → HUD “Generating” but `edits=0` forever and “build already in queue” spam.
- **Fix:** define footprint `fp`; `wakeSettlementBuildJob` on lamp/horizon when job exists; throttle activation log; persist incomplete + manifest on player leave; resume incomplete sites on spawn/reload; dev site reset drops in-memory queue jobs.
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`, `mb_abandonedVillageWorldgen.js`.

---

## 2026-06-04 — Fix AV_DEBUG_LOG_ALL load error (circular import)

- **`mb_entityQueryDebugDev.js`** imports `AV_DEBUG_LOG_ALL` / `AV_DEBUG_LOG_CAT` from **`mb_avDebugLog.js`** (not worldgen) so `main.js` → `codex` → entityQuery no longer loads worldgen before its exports exist.
- **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Abandoned village log defaults + leave/return presence

- **Horizon scans off by default** on new worlds (`AV_DEBUG_LOG_DEFAULT` = all categories except Scans). Enable **Journal → Developer Tools → Abandoned villages → Content Log categories → Scans ON**.
- **`avLogBuildLine`** now respects master switch + **Build** category (join/leave/pause lines were bypassing the mask).
- **Presence logging** in `mb_abandonedVillageNotify.js` mirrors the construction HUD: entered/left HUD band (96ch center), left/returned build band (192ch pause) — same transitions the action bar uses.
- **`BP/`** + **`BP - Dev/`** — `mb_avDebugLog.js`, `mb_abandonedVillageWorldgen.js`, `mb_abandonedVillageNotify.js`, `mb_entityQueryDebugDev.js` (dev menu hint).

---

## 2026-06-04 — Per-structure registry (position, status, ladders)

- **`mb_abandonedSettlementStructureRegistry.js`:** each building slot tracks `ox/oz`, status (`pending` | `complete` | `existing` | `skipped`), and ladders (`none` | `needed` | `pending` | `placed`). Resume loads saved manifest from world property `structureManifests` (schema v2); incomplete builds persist manifest so rejoin knows what not to rebuild.
- **No item entity scans** — ladder state uses block probes + pending ladder queue only (cheap).
- **Content log:** build manifest includes `structure registry:` lines per slot.
- **`BP/`** + **`BP - Dev/`** — registry, `mb_abandonedSettlementBuilder.js`, `mb_abandonedVillageSites.js`, `mb_abandonedVillageWorldgen.js`.

---

## 2026-06-04 — Structure relocate to outer ring + resume skip overlay

- **Stacking on resume:** incomplete resume no longer replays the full `structures` phase over existing houses; goes to `structure_hold` / retry only. Blocked slots **relocate** to a free offset outside the hamlet/village ring, with a **Manhattan approach path** from the plaza.
- **Retry spam:** log key no longer cleared every pass; `tryAdvancePastStructuresPhase` skips re-entry while already in `structure_retry`.
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`.

---

## 2026-06-04 — Structure retry loop fix (7/8 placed, resume)

- **Infinite retry log:** `prepareStructureRetry` filtered `builtStructures` and lost slot indices; retries re-hit footprints that already had buildings → SKIPPED forever. Slot-indexed `structureSlotRecords`, world seed on resume (`structureSlotHasSettlementEvidence`), treat existing footprints as placed in `beginStructureBuild`.
- **Stuck at 7/8:** after 3 retry passes with no new placements, abandon remaining slots and accept tier floor (village ≥6) so well/zombies can finish.
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`, `mb_abandonedVillageSites.js`.

---

## 2026-06-04 — Abandoned village: resume claim bug, HUD at lamp, stall in band

- **Resume never started:** incomplete lamp path called `markSitePending` before placement, so `tryClaimSiteForBuild` always failed → stuck `pending`, only `→ lamp arrival` spam. Resume queue no longer pre-marks pending; stale pending cleared before claim.
- **HUD followed lamp:** action bar used min(dist to center, dist to lamp) within 192ch — standing at the lamp kept “Generating…” after leaving the built area. HUD now uses **96ch from settlement center only** (`SETTLEMENT_HUD_CENTER_DIST`); build pause still uses center+lamp at 192ch.
- **BUILD_STALL while nearby:** stall timer disabled while you are in the build band or before minimum structures are placed; stalled jobs finalize immediately (no defer).
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedVillageConstants.js`, `mb_abandonedSettlementBuilder.js`, `mb_abandonedVillageWorldgen.js`, `mb_abandonedVillageNotify.js`.

---

## 2026-06-04 — Journal: Starter set for export (sky pads, biome+variant names)

- **Journal → Developer Tools → Systems → Starter set for export** (pin `starter_set_export`); same in Abandoned villages debug.
- **Y=200:** one **isolated pad per building** (gaps = air) — structures only, no paths/well/ruin. **Gold block** = yard corner.
- **Filenames:** `{biome}_{type}_{variantId}_planNN.mcstructure` e.g. `plains_house_small_1_plan00`, `plains_church_chapel_stone`, `plains_weaponsmith`.
- Content Log lists pad bounds + Structure Block box per piece → `BP/structures/mb/av_plains/`.

---

## 2026-06-04 — Dev sky structure catalog (plains starter, Y=200)

- **`mb_abandonedStructureCatalog.js`:** 8-piece plains starter grid (3 houses + smithy, bakery, librarian, church, farm) on a stone/grass platform at **Y=200** with gold-block origin marker.
- **Journal → Abandoned villages debug → Sky catalog (plains Y200):** lays yard, teleports you above center, logs full Structure Block export manifest (box corners + filenames) to Content Log; oak signs label each cell when build finishes. No ruin processor / paths / well.
- **`BP - Dev/`** — `mb_abandonedStructureCatalog.js`, `mb_abandonedSettlementBuilder.js`, `mb_abandonedVillageWorldgen.js`, `mb_entityQueryDebugDev.js`.

---

## 2026-06-04 — Hide bunkers: ~1/5 ruined + mixed lantern/torch lighting

- **Ruined bunkers (~20%):** partial cobble/sandstone shell, cobwebs, broken floor patches, ~50% chance no trapdoor (path cap instead), ~44% sparse chest (`hide_bunker_ruined`), ~42% chance no ladder (collapsed entrance).
- **Intact bunkers:** loot table restored **torch + lantern** in chest; in-world light roll — none / lantern at (2,1) / torch at (0,2) / both (torches do not spread fire; plaza campfire+hay fix unchanged).
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`, `mb_villageChestLoot.js`.

---

## 2026-06-04 — Settlement build watchdog hang when leaving village

- **Cause:** walking away unloaded chunks while `tickStructureBuild` kept calling `getBlock` on distant cells (10s+ watchdog). Structure phase could also run multiple heavy sub-ticks per game tick.
- **Fix:** distance-only pause (no chunk scan on leave); `trySetBlock` / `analyzeColumn` skip unloaded chunks; one structure sub-tick per game tick; lower structure guard cap.
- **`BP/`** + **`BP - Dev/`** (`mb_abandonedSettlementBuilder.js`).

---

## 2026-06-04 — PropertyHandler `mb_intro_seen` cache fix

- **`getPlayerProperty`:** lazy load used `const cache` then reassigned it → Bedrock `TypeError: 'cache' is read-only` on spawn. Now `let cache` + empty `Map` fallback if load fails.
- **`BP/`** + **`BP - Dev/`** (`mb_dynamicPropertyHandler.js`).

---

## 2026-06-04 — Village HUD + build-near-lamp (in-band chunk bypass)

- **HUD:** “Paused until you return…” only during the **~10s linger after you leave** the village band — not when approaching a lamp or when `job.paused` (chunk/distance). In range → always “Generating village…”.
- **Chunks:** no chunk-load stall while **inside the 192ch village band**; chunk checks only apply when you are away (completion defer).
- **Build order:** paths, structures, ground/snow, and structure retries sorted **nearest lamp first**.
- **`mb_abandonedVillageNotify.js`**, **`mb_abandonedSettlementBuilder.js`** — **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Settlement build: sim distance / false “finished” while nearby

- **`Build completion FINAL` while &lt;192ch** was usually **incomplete pipeline end**, not failed leave-band pause. Log now notes `incomplete (player Nch from site — not a leave-world pause)`.
- Unloaded footprint chunks → **`waiting_chunks`** per structure (in addition to global chunk pause above).

---

## 2026-06-04 — Abandoned village: structure retry, incomplete sites, reconcile fix

- **Root cause (12:02 log):** build ran paths/well/zombies and hit `phase=done` with only **4/9** structures (`BUILD_INCOMPLETE`), so construction stopped; partial mossy paths then **reconciled** as “already built” after grid reset.
- **Builder:** do not advance past **structures** until `minimumStructuresRequired` (hamlet 4/5, village 6/9, etc.); **`structure_retry`** re-attempts SKIPPED footing slots when player is in range; **`structure_hold`** when no slots left to retry. Snow/zombies/`done` only after enough buildings. Pause distance uses **min(dist to center, dist to lamp)**.
- **Sites:** persisted **`incomplete`** slot flag + center; blocks reconcile-from-world without a saved **built** center; incomplete sites are **not** skipped on lamp arrival (retry allowed). **`markSiteIncomplete`** on `placed=false` completion.
- **`BP/`** + **`BP - Dev/`** — `mb_abandonedSettlementBuilder.js`, `mb_abandonedVillageSites.js`, `mb_abandonedVillageWorldgen.js`.

---

## 2026-06-04 — Structure footprint clears trees / snow / ice (water kept)

- **Column scan** passes through **tree logs/wood/stems** to find real ground under spruce (etc.), not the trunk surface.
- **`sweepStructureFootprintObstructions`** runs at structure start — clears logs, leaves, snow layers, loose ice above walk level in the full footprint; **water untouched** (flooded bunkers / river edges stay).
- **Pad leveling** uses `SETTLEMENT_REPLACE_ANY` so fill/cap replaces logs and ice; foundations fill through obstructions.
- **`BP/`** + **`BP - Dev/`** (`mb_abandonedSettlementBuilder.js`).

---

## 2026-06-04 — Settlement fire spread (campfire plaza + bunkers)

- **Campfire plaza:** center fire placed **extinguished** (`trySetExtinguishedCampfire`) — lit campfires on Bedrock ignite adjacent **hay** / **log** ring blocks. Fits abandoned-village look.
- **Ruin processor:** any remaining lit `campfire` / `soul_campfire` in the processor volume forced extinguished.
- **Hide bunkers:** removed random **wall torch** in pit; bunker loot **torch → lantern** (chest only, no open flame in confined space).
- **`BP/`** + **`BP - Dev/`** (`mb_abandonedSettlementBuilder.js`, `mb_abandonedVillageWorldgen.js`, `mb_villageChestLoot.js`).

---

## 2026-06-04 — Hide bunker build order + deferred ladders + surface rim

- **Build order:** paths → structures → pen/well → **bunkers** → snow/zombies. Bunkers no longer run before houses — structure roofs/overhangs were overwriting bunker caps and ladder columns mid-build.
- **Ladders + trapdoor:** deferred to `pendingLadderColumns` (placed after ruin processor via `/setblock`, same as cellar/multi-story shafts).
- **Shell “roof”:** cobble/sandstone rim now includes **surface layer** (`y = sy`) on the 5×5 outer ring.
- **Placement:** overlap check uses full 5×5 shell + 2-block overhang margin vs structure footprints. **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Hide bunker cobble/sandstone shell + ladder exit

- After the 3×3 pit is carved, **`enqueueHideBunkerFinish`** builds a **5×5 perimeter shell** (floor through headroom) using ruleset **`mat.wall`** — **cobblestone** most biomes, **sandstone** in desert.
- **Ladder** in the SE corner `(2,2)` opposite the NW chest, backed by the east shell wall; climb to the center **trapdoor hatch** on paths.
- Finish work drains via **`bunkerFinishQueue`** across ticks (same budget as cell carve). **`BP/`** + **`BP - Dev/`** (`mb_abandonedSettlementBuilder.js`).

---

## 2026-06-04 — Workstations off walls, librarian loot, food → floor pantries

- **Workstations** (lectern, loom, brewing stand, enchanting table, etc.) blocked on **mask edge / outer-wall-adjacent** cells — no more lecterns in walls on L-wings and irregular footprints.
- **Librarian:** chests **`primary` / librarian loot only** (script table — no vanilla plains food). **Enchanting tables restored** on librarian / manor library upper floors; food/library mash-up fix kept.
- **Food storage:** default house interiors no longer spawn **pantry barrels** in-room; **`stripHousePantryStorageFromPlan`** on all houses. Floor trapdoor pantry rate **78%** (6×6+) / **62%** (5×5). Minimum-furnishing fallback adds **one primary chest** only (never pantry food). Work-building pantry slots resolve to **primary** themed loot, not house food.
- **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Floor trapdoor pantries (1-block pit)

- **`floorPantry`** on house plans: ~**52%** of houses ≥6×6 ( **38%** if 5×5+) without a full cellar get a **trapdoor in the floor** + **food chest one block below**. `appendFloorPantryToPlan` picks a free interior cell, drops one redundant pantry barrel when present.
- Builder: skip floor plank at pantry cell; `placeFloorPantry` during furnishings (dig pit, chest + pantry loot, upside-down trapdoor). Reserved like cellar hatch for furnishings/shaft picks.
- **`BP/`** + **`BP - Dev/`** (`mb_villageChestLoot.js`, `mb_abandonedSettlementBuilder.js`, `mb_settlementStructures.js`).

---

## 2026-06-04 — Roof eaves variety + vanilla framed gable roofs

- **Eave overhangs:** no longer always upside-down stairs + slab below. Lip rolls **38% slab**, **40% right-side-up stair**, **22% upside-down stair**; under-slab only **~6%** (when upside-down eave). Non-framed peaked caps mix upside-down / right-side-up / full block instead of always inverted stair.
- **Framed gable roofs:** `placeFramedPeakedRoofColumn` — stair run from eave to ridge on **both long faces** (vanilla village style). ~**62%** of peaked houses (span ≥5) or explicit `roofFramed: true` on shell. Gable-end triangles keep block fill.
- **`roofFramed`** plan flag on 14 peaked house shells (wide, manor, plains_gabled_el, etc.). **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Ladder no-drop + chest loot theming (pantry vs gear)

- **Cellar/shaft ladders:** single placement pass (2 only in debug force mode); **10-tick settle** after ruin processor before placing; skip rungs that already have `minecraft:ladder`; **`/setblock` only** for ladder blocks (no `trySetBlock` fallback that drops items); skip re-placing backing when rung exists.
- **Chest loot:** `lootSlot` (`pantry` | `primary` | …) passed from interior specs through `fillVillageStorageAt` → fallback/augment. **Pantry** chests get food only; **primary/work/gear** strip food from fallback and skip house clutter augment. **Work-building** tables skip food mixing and `LIVED_IN_CLUTTER` / compass-map profiles. House augment is light valuables/torch only (no paper/compass sprinkle on gear chests).
- **`BP/`** + **`BP - Dev/`** (`mb_abandonedSettlementBuilder.js`, `mb_villageChestLoot.js`).

---

## 2026-06-04 — Village build defer fix + join/leave debug

- **Bug:** `tickBuildJob` returned early when `phase===done`, so deferred completion never ran after leaving; empty world (`dist=Infinity`) did not defer → instant **Village Complete** + `markSiteBuilt`. Queue dropped jobs on `phase=done` before `finished`.
- **Fix:** `finalizeSettlementBuildJob` at start of tick when done; defer when no players or >192ch; queue shifts only when `finished`; **Village Complete** via `deliverSettlementCompleteNotify` (witness ~160ch, queued until return). Content Log: **Build PAUSED/RESUMED/WAITING/FINAL**, **Player LEFT/JOIN**. **`mb_abandonedSettlementBuilder.js`**, **`mb_abandonedVillageNotify.js`**, **`mb_avDebugLog.js`** — **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — World load crash: SETTLEMENT_BUILD_PAUSE_DIST circular import

- **Log @ reload:** `ReferenceError: SETTLEMENT_BUILD_PAUSE_DIST is not initialized` in `mb_abandonedVillageNotify.js` → `main.js` failed; cascade `DAY_COUNT_KEY` / `BISECT_MODE_PROP` not initialized.
- **Fix:** distances in **`mb_abandonedVillageConstants.js`** (no imports); builder re-exports; notify imports constants only. **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Village pause at 192 + no complete while away / partial hamlet

- **Pause band = HUD band (192 ch):** build **pauses** when you leave the village UI range (was ~238). **Village Complete** and `markSiteBuilt` wait until you are back — `phase=done` defers `onComplete` while all players are far.
- **Placed threshold:** only non-**SKIPPED** buildings count (hamlet needs **4/5**, ~80% for larger tiers). Your ice/taiga logs with 3/5 built + 2 skipped no longer fire **Village Complete** or lock the site as built.
- **`mb_abandonedSettlementBuilder.js`**, **`mb_abandonedVillageNotify.js`** — **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Village build HUD linger + no false “Village Complete”

- **HUD:** only within **~192** blocks while generating; leaving shows **`Paused until you return…`** for **~3s** then clears (no long-range follow).
- **Build:** leaving pauses work and **resumes** when you return — no **5s abort** on paused cleanup; incomplete builds no longer count as placed (need real structures), so no premature **Village Complete** / `markSiteBuilt`. Incomplete drops clear pending without `markSiteFailed`. **`mb_abandonedVillageNotify.js`**, **`mb_abandonedSettlementBuilder.js`**, **`mb_abandonedVillageWorldgen.js`** — **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Abandoned village Content Log categories (debug)

- **Journal → Abandoned villages:** master **Content Log** switch plus **Content Log categories…** submenu — toggle **Scans**, **Activation**, **Build**, **Success**, **Failures**, **Lamp cleanup** (bitmask `mb_av_debug_log_mask`). Master OFF still logs **Failures** only.
- **`mb_abandonedVillageWorldgen.js`:** `AV_DEBUG_LOG_CAT`, `avLogScan` / `avLogActivation` / `avLogBuild` / `avLogSuccess` / `avLogLamp`; debug report lists category ON/OFF. **`mb_entityQueryDebugDev.js`:** category menu. **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-04 — Library / librarian ladder vs loot + spoiled pantry

- **Librarian work buildings** (`librarian`, `librarian_study`): removed plan `minecraft:ladder` specs (multi-story uses shaft ladders); moved chests/barrels to back corners (`lz≈6`); shaft candidates prefer `[1,3]` not center bookshelf stack.
- **Manor library (house plan 39):** storage at side walls (`lx 1` / `w-2`, `lz≈5`); dedicated shaft candidates away from center.
- **Ladder vs loot (all buildings):** 2×2 shaft is carved for climbing; only **`ladderFootLx/Lz`** (one cell) is reserved for rungs. Chests/barrels may use the other shaft cells. `commitAccessShaft` + `isLadderFootCell` / `canPlaceStorageFurnishing`; deferred ladder pass uses the same foot.
- **U-plan manor (variant 38):** Chest/barrel on interior wings; door/perimeter rules unchanged.
- **`mb_villageChestLoot.js`:** ~70% spoilage / ~30% fresh food; cellar + snowy ice pantry preserved. **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — Village build speed / HUD vs pause (log review)

- **Logs:** Not mining bears — repeated `Horizon/large-infected scan deferred (villager load)`; build queue `PAUSED` at distant world coords while player at another slot in same cell; HUD only at enqueue (~140 blocks). Successful infected build: `center=40014,63,40385 chunk=2500,2524`.
- **Fix:** Build pause/resume ~**238/206** blocks (half site cell); abort paused cleanup with **0 edits** after ~5s; queue prefers **nearest** build to player; construction HUD **syncs** to active `buildQueue` within **192** blocks; debug queue lines label **world** vs **chunk**. **`mb_abandonedSettlementBuilder.js`**, **`mb_abandonedVillageNotify.js`**, **`mb_abandonedVillageWorldgen.js`** — **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — Infected pads: dusted dirt top only

- **Building pads:** `mb:dusted_dirt` only on the **top** surface block; fill is mossy cobble / cobble / dirt mix. Ground prep limited to **structure footprints** (not whole village disk). Cellar bury uses stone, not dusted. **`mb_abandonedSettlementBuilder.js`** — **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — Abandoned village construction HUD (action bar)

- **While building:** nearby players get merged action bar **`§e§lGenerating abandoned village…`** for **~5s** (`CONSTRUCTION_HUD_BOOST_TICKS`), then **`§7Generating village…`** until ladders/complete; cleared on complete, failed build, or leaving range. Slot **`ACTION_BAR_SLOT.SETTLEMENT_BUILD`** in **`mb_actionBarHud.js`**. **`Village Complete`** title unchanged. **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — Large infected: lamp-relative footing (log review)

- **Logs (`ContentLog2026-06-03_20-18-29_1.txt`):** Slot **0** at lamp arrival built at **y≈63** (`dustedGround=737`); slots **1–2** failed **`BAD_FOOTING`** at **grid anchors** (`center too deep for pier poles`, `center=invalid`) — not missing dusted dirt.
- **Fix:** All **`infected`** placements use **`resolveSettlementCenterNearLamp`** (same as lamp arrival), not only when `lampArrival` is set; infected activations **do not** `markSiteFailed` on footing miss (retry while exploring); **`clearSiteFailedForLampArrival`** + lamp artifact cleanup on infected activate. **`mb_abandonedVillageWorldgen.js`** — **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — Village loot tables: variety, lived-in houses, enchanted rewards

- **`mb_villageChestLoot.js`:** Expanded all script fallback pools (food, profession, biome pantries). **Pantry** barrels use `house_pantry_*` script tables (food-heavy); chests keep biome + themed rolls + `house_lived_clutter` / `house_lived_treasure` sprinkles.
- **Augments after fill:** Smith — enchanted iron sword/pick, enchanted books, diamond tools; armorer — enchanted iron armor; fletcher — bow (10%), enchanted bow (~4.5%), enchanted crossbow rare; librarian — enchanted books; fisherman — enchanted rod; houses — profile-based clutter + rare sword/apple.
- Vanilla `/loot` still runs first when available; script tables fill or top up. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — Settlement interiors: smithy loot + house detail

- **Smithy / work buildings:** `canPlacePlannedFurnishing` allowed beds on mask edges but **rejected chests, barrels, and workstations** on those cells (most smith plans place storage on walls). Fixtures may use mask-edge cells; beds still need valid orientation.
- **Guarantee pass:** `ensureStructureMinimumFurnishings` after decor — houses get ≥1 bed + ≥1 loot container; work sites get ≥2 filled chests/barrels. `smithy_workshop` loot slot order added.
- **Houses:** Bumped **small_1**, **cottage_hermit**, **courtyard** footprints; richer default `interiorForVariant` base; fixed **courtyard (15)** `lz: w-2` typo; expanded `generateHouseDecor` (carpet, lantern, bookshelf, extra barrel by floor area). Weaponsmith plans: inner-room stations + blast furnace.

---

## 2026-06-03 — Manor H beds + unified Place building dev menu

- **manor_h (plan 37):** Shell **11×11**; H-plan wings use **`hPlanWingWidth`** (w/3, min 3 blocks) for more interior; beds in wings at **lz 3**; center partition only on the connector bar. **`canPlacePlannedFurnishing`** allows beds on mask edge cells when **`resolveBedPlacement`** succeeds (wing bedrooms were skipped as “edge”).
- **Dev menu:** **Place building…** merges single + compare — top toggle **+ Random neighbor ON/OFF**, then presets + **House plan index** (white button labels, no §7/§8 on buttons). Removed duplicate **Compare buildings** entry on main abandoned-village menu.

---

## 2026-06-03 — Dev: compare building + random neighbor

- **API:** `layoutForceStructureComparePair`, `forcePlaceAbandonedVillageCompareAtPlayer`, `forcePlaceHousePlanAtPlayer` (`compare: true`). `listHouseShellSummaries()` for paged plan picker. Mirrored **`BP - Dev/`** + **`BP/scripts/`**.

---

## 2026-06-03 — Abandoned village footing: `mb:dusted_dirt`

- **Footing:** Column scans pass through `mb:snow_layer` to reach dusted dirt below; infected sites use **surface Y at the lamp** (not fixed 88) for footing probes; pad foundation keeps existing dusted dirt at foot level. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — Abandoned villages: `minecraft:grove` → snowy ruleset

- **Grove** is a cold mountain biome (snow surface, spruce) but has the **`grove`** tag, not **`taiga`** — it was not in `rulesetForBiome` and cold lamp feature rules only matched cold+taiga. Now **`minecraft:grove`** uses **snowy** villages, **cold lamp** posts, and `isColdLampMarkerBiome`. Exact ID only (not `cherry_grove`). Mirrored **`BP/`** + **`BP - Dev/`** scripts + feature rule.

---

## 2026-06-03 — Village Complete waits for deferred ladders

- **Village Complete** title fires after `runSettlementLadderPlacements` finishes all passes (post–ruin-processor), not when the phased build queue ends. Villages with no ladder payloads still notify immediately. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — Abandoned village debug: per-site + title-flag reset

- **Dev journal** → Abandoned villages: **Reset site grid underfoot** (`resetAbandonedVillageSiteAtWorld`) — one grid cell only; **Reset my village title flags** — `mb_av_settlements_discovered` + `mb_av_construction_witnessed`. **Clear chunk cache** still wipes all sites worldwide.

---

## 2026-06-03 — Abandoned village: false “built” on lamp + notify UX

- **Savanna `3,2,0` bug (Content Log):** `tryClaimSiteForBuild` set **pending**, then `enqueueSettlementBuild` treated **pending** as already built → sync `onComplete({ placed: true, script:already_built })` → `finishSettlementPlacement` marked site built with **0 edits** and showed **Village Complete** with no hamlet.
- **Fix:** Drop `isSitePending` guard in enqueue; `already_built` uses `placed: false`; `beginSettlementPlacement` returns `{ placed: queued }` from enqueue return; skip `markSiteFailed` on `already_built`.
- **UI:** Completion — large title **Village Complete**; short flavor on **action bar** (hotbar). First construction witness — title **Constructing abandoned village...** once per player (`mb_av_construction_witnessed`). Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Abandoned village: multiplayer hardening

- **Shared world state:** Site registry (`mb_av_village_sites`) stays on **world** property — one built/pending truth for all players.
- **Duplicate activation:** `tryClaimSiteForBuild` before `beginSettlementPlacement`; `tryActivate` / `enqueueSettlementBuild` skip when `isSitePending` or already built; activation queue dedupe unchanged.
- **Pause/resume:** Nearest-player distance uses `world.getAllPlayers()` (not 2-tick player cache) — build pauses only when **everyone** in the job dimension is beyond 140 blocks; anyone within 120 resumes.
- **Completion titles:** `mb_abandonedVillageNotify.js` — per-player `mb_av_settlements_discovered`; all players within 140 blocks get titles independently. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Dev Tools: readable button labels (no grey §7/§8 on buttons)

- **Symptom:** Developer Tools → **Performance**, **Systems**, spawn/HUD submenus, biome checker, and entity-query debug used **§7/§8** (grey) on ActionForm **buttons** — hard to read on Bedrock button chrome.
- **Fix:** New **`BP - Dev/scripts/mb_devFormUi.js`** — `DEV_BTN_BACK` (`§f← Back`), `devBtnParen()`, `DEV_BTN_DOT`, `devBtnBackTo()`. Wired through **`mb_codex.js`** (dev root, Performance, Systems, spawn controller chain, heavy perf presets, HUD, camp, script toggles) and **`mb_entityQueryDebugDev.js`** / **`mb_biomeCheckerDev.js`**. Body text still uses grey for secondary info; buttons use white hints or colored labels only.

---

## 2026-06-02 — Abandoned village: paths skip lamp post column

- **Symptom:** Mossy path footing placed on desert (and other) worldgen lamp posts, breaking the barrel.
- **Fix:** `pathCellOverlapsLampMarker` (4-block Chebyshev around lamp) filters `planSettlementPaths`, infected dusted ground, and runtime path/ground placement. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Abandoned village: pause when leaving + completion titles

- **Pause/unpause:** Phased `enqueueSettlementBuild` jobs pause when no overworld player is within **140** blocks of the hub (resume at **120**). Stall timer does not tick while paused. Action bar: paused / resumed hints. Debug queue shows `PAUSED`.
- **Completion UI:** `mb_abandonedVillageNotify.js` — title **Village Complete**; first discovery subtitle *You found your first village...*; later *Another one found and another one gone...* (per-player `mb_av_settlements_discovered`). Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Abandoned village: strict reconcile (no false “built” skips)

- **Symptom:** New desert lamp site `2,3,0` logged `already built/reconciled` with `built=3` but no hamlet placed (Content Log 21:21–21:24).
- **Cause:** Loose reconcile counted smooth_sandstone / hay / 2 generic “strong” blocks (desert temples, etc.) and persisted `markSiteBuilt` without mossy path footprint.
- **Fix:** Reconcile requires **mossy cobble path cluster** (`scriptSettlementEvidenceIsConvincing`); verify saved center before skip; **reset stale** registry slots with no footprint; overlap link only when center verifies. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Abandoned village: no rebuild on world rejoin

- **Symptom:** Rejoining near an existing script hamlet (e.g. desert site `0,3,0`) queued a full **Settlement built** again.
- **Cause:** (1) `mb_av_village_sites` was only in the property-handler dirty cache until the 30s autosave — leaving before flush lost “built” keys. (2) Registry could load empty if the module imported before the world was ready (`sitesLoaded` stuck). (3) **Lamp arrival** skipped block reconcile, so a missing registry always re-built.
- **Fix:** `flushWorldPropertyToDisk` on site persist; `reloadAbandonedVillageSiteRegistry` on worldgen init (+ 1-tick retry); `shouldSkipSiteActivationForExistingSettlement` for all activations including lamp arrival; stronger desert reconcile blocks + 56-block probe. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Tower house: chest loot no longer scattered during build

- **Symptom:** `desert_tower_house` (and other multi-story / roof-deck houses) dropped items on the ground mid-build — upper-floor chests/barrels broken when the rooftop balcony deck was sealed.
- **Cause:** Phased build placed plan **interior** (chests on `floor: 2+`) during **`interior`**, then **`placeRooftopLookout`** cleared air and laid deck planks over the footprint.
- **Fix:** New **`furnishings`** phase after **`roofAccess`** (partitions still in **`interior`**). `structureNeedsDeferredFurnishings` defers plan interior, beds, house/church decor, and doorway clears until the deck is finished. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Desert abandoned villages: footing + reconcile fixes

- **Symptom:** Desert lamp sites on sand/sandstone never built; biome was valid but footing failed or site marked “already built” without a script village.
- **Cause:** `classifySurfaceColumn` / `analyzeColumn` did not treat **sandstone** (common on desert surface) as land → `BAD_FOOTING`. Reconcile counted natural **sandstone** as weak ruin evidence and skipped activation. Dune height used y≈64 hint instead of surface at lamp.
- **Fix:** Sandstone variants (+ cactus pass-through) in `BUILDABLE_GROUND_IDS` / pier anchors; `footingHintYForSite` for desert/savanna from `surfaceY` at lamp; lamp arrival tries `resolveSettlementCenterNearLamp` before grid spiral; desert reconcile ignores natural sandstone weak counts. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Abandoned village: building list in Content Log on build complete

- **`mb_abandonedSettlementBuilder.js`:** Tracks each finished structure slot (`formatSettlementStructureLabel` — type, plan id, variant#, world offset, door, SKIPPED footing). `buildSettlementCompletionManifest` adds tier, layout, plaza, paths/pen/snow/zombies, edit count.
- **`mb_abandonedVillageWorldgen.js`:** On successful placement, **`[ABANDONED VILLAGE] Settlement built @ …`** logs full manifest (`always`). Failures include partial manifest. Debug report shows last build lines (up to 8). Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-02 — Multiplayer journal HUD settings + dev HUD toggles

- **Symptom:** Guest with `mb_cheats` could use dev menus (e.g. single village house place) but Powdery/Basic **Settings** (infection timer, etc.) and **Developer Tools → HUD & action bar** looked toggled in the journal while only the host’s bar/world behavior changed.
- **Cause:** Journal UI settings were stored on **world** dynamic props (`mb_player_settings_<playerId>`) instead of the player; dev HUD keys were not in the property preload list and cache could miss disk values. **Broadcast** / legacy world scan HUD can show on a guest’s screen when the **host** has HUD on even if the guest’s **my** toggles are off (menu already had “You see” vs “Your toggles”).
- **Fix (`mb_dynamicPropertyHandler.js`, `mb_codex.js`, spawn/biome/sim/entity-query HUD setters):** `mb_journal_settings` on **player** with migration from legacy world keys; `getPlayerProperty` falls back to `player.getDynamicProperty`; preload `mb_dev_hud_*` keys; `flushPlayerPropertyToDisk` on HUD toggles; clearer HUD menu note when broadcast/legacy affects “You see”. Mirrored **`BP/`** + **`BP - Dev/`**.

---

## 2026-06-03 — H-plan manor beds sticking out (plains)

- **Bug:** `manor_h` / H-plan houses placed beds at `(2,2)` and `(w-3,2)` — courtyard gaps in `hPlanMask`, so bed heads sat outside the shell.
- **Fix:** `isValidBedFootprintCell` requires `structureCellOccupied`; wing bed coords via `hPlanWingBedLx`; interior templates updated for plans 33, 37, 66/68. **`BP - Dev/`** + **`BP/`**.

---

## 2026-06-02 — Mining bear cap: 2 per player (dimension)

- **Balance:** `MINING_BEARS_MAX_PER_PLAYER = 2` — max **2** loaded mining bears per player in a dimension (4 for 2-player co-op), **2** within spawn scan radius. `ENTITY_TYPE_CAPS` mining family **3 → 2**.
- **`mb_miningCap.js`:** Near + dimension checks on natural spawn (like buff); overflow cull removes farthest miners over cap every 40t. Dev toggle **Mining overflow cull**.
- **Spawn configs:** `maxCountCap` 2, day-20 late ramp no longer spikes to 10; **1** mining spawn attempt per tick max.

---

## 2026-06-02 — MP spawn: spread stagger + co-located duo pacing

- **Spread-apart bug:** Tile scans used `system.currentTick % staggerInterval` while the spawn loop runs ~every 60t → one player could never scan. **Fix:** `spawnControllerInvocationCount` + round-robin on spread runs.
- **Nearby duo (tight group):** Within 32 blocks, the game treated 2 players like a heavy MP stack: only **1/5** of spawn-loop runs, **8×** group rescan cooldown, forced **duo** block-query tier (half budget), **50%** spawn attempts, **1–2** attempts/tick. Felt “super slow” vs solo.
- **Co-located fix:** ≤2 players or one spatial cluster → run every spawn loop; solo scan cooldown/query budget; full spawn attempts; optional 1.25× chance like solo. Large tight stacks (3+ clusters) keep old throttles. **`BP - Dev/`** + **`BP/`**.

---

## 2026-06-04 — Weaponsmith loot dedupe (no spear stacks)

- **`applyLootPoolToContainer`:** **Category dedupe** — max one spear, saddle, horse armor, sword, etc. per chest roll.
- **Weaponsmith pool:** Spears/mount gear removed from static table; **one weighted spear** + optional **one** saddle *or* horse armor in `buildSmithFallbackPool`.
- **Augment:** Runs **once** per chest (fill retries no longer stack bonuses); weaponsmith augment is **one** optional extra (skips if type already present).
- Synced **`BP/`**.

---

## 2026-06-04 — Weaponsmith / smithy blacksmith loot

- **`mb_villageChestLoot.js`:** Expanded **`house_weaponsmith`** fallback — spears (copper/stone/iron + rare gold/diamond rolls), **saddle**, **horse armor** (leather→diamond), chain/iron pieces, obsidian, diamond, bread/apple, bucket. Script fallback + **`maybeAugmentWeaponsmithStorage`** bonus pass on top of vanilla `/loot`.
- Synced **`BP/`**.

---

## 2026-06-04 — Villager hide bunkers (pre-structure) + tanner note

- **Hide bunkers:** **`bunkers`** phase after paths, before structures. **3×3** pit (trapdoor center, chest NW corner, 2-block headroom). Count: hamlet **2**, village **3**, large **5**. Sites chosen from **path cells** (trapdoor on path); ring fallback if needed. **`hide_bunker`** loot. Dev log: `pathBunkers=N`. Not placed for **`singleStructureOnly`** dev builds.
- **Tanner:** Work building **`leatherworker`** (cauldron + barrel + tannery chest loot) — rolls on **large** settlements; not a fixed slot on hamlet/village tiers yet.
- Synced **`BP/`**.

---

## 2026-06-04 — Roof eave overhangs + functional upper floors

- **Roof overhangs:** New `roofOverhang` build phase — upside-down stair + optional slab eave **1 block beyond** occupied perimeter on all rulesets **except desert** (mask-aware; skips door openings). Flat roofs get a slab lip.
- **Second stories:** Multi-story interiors use **flat ceiling** at wall height (peaked/shed slope on **perimeter only**). `clearMultiStoryInteriorAir` after mid-floor pass; rooftop deck seal raised to `sy + wallH` so deck flattening no longer fills living volumes. Re-clear after optional rooftop lookout on 2-story shells.
- Synced **`BP/`**.

---

## 2026-06-02 — Cellar ladder deferral + smithy build hang fix

- **Cellar hatch ladders:** Rungs + trapdoor now deferred like multi-story shafts (`captureBasementLadderPayload` → `pendingLadderColumns` → `runSettlementLadderPlacements` after ruin pass). Basement phase only carves air in the shaft; no early ladder/trapdoor placement that bury/repair/grid passes overwrote.
- **Smithy watchdog crash:** Cached `st.floorPlan` once in `beginStructureBuild` (avoids re-running `applyStructureLootToPlan` every tick). Interior **partition** pass always advances `interiorI` even when beams fail to place (fixed infinite loop on smithy workshop partition at lx=7).
- **Verified in-game:** cellar hatch ladder + trapdoor survive full build; settlements look good for current pass.
- Synced **`BP/`**.

---

## 2026-06-02 — Librarian, smithy, church & cathedral overhaul

- **Librarian:** 9×8 / 10×8 footprints; **14+ bookshelves** per variant (ground + gallery), partitions, ladder to enchant floor.
- **Smithy:** Removed narrow T-shape `smithy_large`; new **10×7 workshop** (full interior, forge patio, blast furnace); weaponsmith pool prefers full footprints; default smithy 7×6.
- **Churches:** New **`churchLMask`** (standing L nave + transept); **solid stone floors** (removed random skip → no more foundation-only shells); enlarged all variants (parish 10×13, stone chapel 11×15, cross 14×17, belltower 12×15, **cathedral 16×20**); partitions, gallery bookshelves, ladders, richer interiors.
- Synced **`BP/`**.

---

- **Cellars:** `cellarBury` phase berm-fills dirt/grass around footprint so rooms sit below grade; cellar buildings use **lowest** column for platform Y; hatch ladders use backed `placeStructureLadder`; shaft cells skipped in wall/repair passes.
- **Dogtrot:** Wing doors on **west/east exteriors** plus front/back pair per pen; door approach paths use per-door exterior offset (fixes missing door on chest/bed wing).
- **L-wing:** Rooftop lookout shaft must fit fully inside occupied interior (candidates in wide bar); skips invalid 2×2 that punched void corners.
- Synced **`BP/`**.

---

- **`mb_settlementStructures.js`:** `cellarDepthForVariant()` — all cellars carve **3–5** blocks deep (split-level, cellar cottage, crypt, taiga smoke cabin, cathedral crypt). Shells use `hasCellar: true` instead of fixed depth 2/3.
- **`mb_villageChestLoot.js`:** `appendBasementCellarStorage` tiers — ~22% bare, sparse barrels (mix of **empty** and cold-storage loot), furnished adds chest + lantern/bookshelf in deeper cellars.
- Synced **`BP/`**.

---

- **Dogtrot (plan 32):** Shell **13×8**; wing doors on each pen (inset from breezeway center, not the open passage); **fence gates** at front/back breezeway mouths (biome wood gate id). Builder: `computeDogtrotDoorCells`, `computeDogtrotGateCells`, `placeDogtrotFenceGates`, gate-aware wall/repair passes.
- **L-wing house (plan 11):** Replaced tiny **8×5** `corner_1` with **12×10** `l_wing_house` using `lWingHouseMask` (wide front bar + tall left stem); partitions/interior refreshed; door on wide bar away from re-entrant corner (`computeLWingDoorCells`).
- **`mb_settlementStructures.js`:** Plan flags `dogtrot`, `lWingWide`; removed duplicate `case 41` in `occupiedForVariant`.
- Synced **`BP/`**.

---

- **`mb_villageChestLoot.js`:** `house_cellar` cold-storage fallback (honey bottles, meat/fish, crops, ice, pie); `appendBasementCellarStorage` on house plans with `basementDepth`; cellar skips vanilla `/loot` (fallback only). Smith tables: iron-heavy fallback, rare diamond tools (~4% fallback / ~3.5% augment), obsidian rolls; `maybeAugmentSmithStorage` after fill.
- **`mb_abandonedSettlementBuilder.js`:** `zone: "basement"` furnishings placed at cellar floor Y.
- Synced **`BP/`**.

---

## 2026-06-02 — Settlement loot full remap

- **`mb_villageChestLoot.js`:** Central **`WORK_LOOT_PROFILES`**, per-plan storage slot order (`market_bazaar`, `trading_post`, churches, …), **`houseStorageLootForVariant`** (70 variants + infected sprinkle), expanded fallbacks for every profession table, **`applyStructureLootToPlan`**, **`lootForMarketStallBarrel`** (butcher). Librarian uses plains + book fallback; trading post remapped off cartographer-only.
- **`mb_settlementStructures.js`:** Work/church plans stripped of inline loot; loot applied at plan fetch. Houses pass **ruleset** into variant storage resolution.
- **`mb_abandonedSettlementBuilder.js`:** Farmer → butcher context; market stalls + fill pass **ruleset**; loot ctx includes `planId` / `ruleset`.
- **Docs:** [`docs/development/ABANDONED_SETTLEMENTS.md`](development/ABANDONED_SETTLEMENTS.md) loot table section. Synced **`BP/`**.

---

## 2026-06-02 — Wider paths, 5 plaza/layout variants, bigger hub, door approach pads

- **Paths:** 3-block-wide spokes/plaza ring; **11×11** central plaza pad (`SETTLEMENT_PLAZA_RADIUS = 5`); larger path radius per tier.
- **Hub:** **5 meeting variants** (well, fountain, market, campfire, **shrine**); enlarged well (5×5 pool + corner posts), market stalls, shrine lectern plaza.
- **Layout:** **5 structure layouts** (ring, cross, arc, double ring, square corners) via `pickSettlementLayoutVariant` / `settlementLayoutOffset`.
- **Access:** 2–3-wide mask-aware doors; exterior **path pad + air** in front of every door after build.

---

## 2026-06-02 — Fletcher loot / door / interior fixes

- **`mb_abandonedSettlementBuilder.js`:** Furnishings must sit on **occupied interior** cells (not mask voids or walls). **Mask-aware door cells** — 2-wide openings on real perimeter edges; paths aim at resolved door; post-interior **doorway carve** pass.
- **`mb_settlementStructures.js`:** Fletcher, toolsmith, leatherworker → full rectangular shells + porch (removed broken L/C masks on small footprints); butcher L-wing and brewery enlarged with corrected interior coords.

---

## 2026-06-02 — Biome-exclusive house shapes + shaped work buildings

- **`mb_settlementStructures.js`:** `HOUSE_VARIANT_COUNT = 70` (50 universal + 20 biome-exclusive indices **50–69**). New masks: C-shape, longhouse, arcade, stilt bay, plus, octagon. **`pickHouseVariantIndex(ruleset, cx, cz, salt)`** — ~45% biome pool, ~33% shaped universal, else random universal. Work buildings upgraded with non-rect **`occupied`** masks and appendages (forge patio, smoke chimney, mill wheel, dock porch); **`farmer_desert_yard`** for desert/savanna; butcher L-wing variant.
- **`mb_abandonedSettlementBuilder.js`:** Layout uses **`pickHouseVariantIndex`**; appendage phase handles **stilt_deck**, **dock_porch**, **forge_patio**, **mill_wheel**, **smoke/oven chimney** stacks.
- **Dev menu:** Single-build entries for desert riad (52), jungle stilt (57), taiga longhouse (61), infected spire (67); random house label → **70 plans**.

---

## 2026-06-02 — Lamp arrival villages failing (reconcile + artifact gate)

- **Logs:** `Site reconciled from world blocks — skip activation` with no village; desert lamp structure block visible, `built=0`, no `Lamp approach build queued`.
- **Cause:** Reload reconcile treated natural **sandstone** as a finished village; lamp activation required `artifact count === 0` before queueing build.
- **Fix:** Stricter ruin evidence (`strong` planks/path/mossy + weak stone); **no reconcile on lamp arrival**; retry artifact clear + **always queue** build at lamp; `lampArtifactScanVerticalBounds` works when player Y mismatches surface; **mesa/badlands → desert** ruleset.

---

## 2026-06-02 — Snow sprinkle vs snowy loot (taiga safe / snowy themed)

- **`settlementRollsMbSnowSprinkle(ruleset, …)`** — **taiga** + **ice** never get `mb:snow_layer` (mega / redwood taiga safe zones). **snowy** ruleset always sprinkles when day factor allows. Other rulesets keep optional ~34% infection sprinkle.
- **TAIGA_BIOME_IDS** — `redwood_taiga_mutated`, `redwood_taiga_hills_mutated`, `mega_taiga_hills`.
- **Snowy chests** — `FALLBACK_SNOWY_SUPPLIES` + `maybeAugmentSnowyStorage` (snowballs, snow blocks, ice, powder snow, boots) on all snowy-ruleset storage.

---

## 2026-06-02 — Smithy chest/barrel placement fix

- **Cause:** Planned chests in weaponsmith/armorer/toolsmith layouts often sat in the **door-approach** clearance zone; `canPlacePlannedFurnishing` skipped them while grindstone/anvil still placed.
- **Fix:** Allow chests/barrels in approach tiles; moved storage to safer coords; **chest + barrel** per smith building with `lootSlot` primary/pantry and vanilla `village_weaponsmith` / armorer / toolsmith tables (`BP` + `BP - Dev`).

---

## 2026-06-02 — Duplicate village fix, desert hot lamp, force-by-biome debug

- **Reload / resync duplicate hubs:** `mb_abandonedVillageSites.js` — `probeSettlementCenterNearWorld`, `reconcileBuiltSiteFromWorldNearLamp`, `findBuiltSiteNearWorld` / `linkSiteToExistingSettlement` (~88 block overlap). `tryActivateAbandonedVillageSite` + `runAbandonedVillagePlacementWork` skip or link before queueing a second build.
- **Desert lamp worldgen:** `BP/structures/mb/village_marker/hot_lamp_post.mcstructure`, `hot_lamp.json`, `scatter_hot_lamp_grid.json`, `village_marker_desert_slot0.json` (mirrored to `BP - Dev/`). Debug report shows **hot (desert)** vs cold vs warm/oak/rain.
- **Dev menus:** Journal → Abandoned village debug → **Force by biome style…** (ruleset × hamlet/village/large); **Single building** list driven by `FORCE_SINGLE_BUILDING_MENU` in `mb_abandonedVillageWorldgen.js` (optional ruleset from biome-force submenu).

---

## NEW CHAT HANDOFF — Abandoned villages (2026-06-02, updated)

**Design note (user):** Cold biomes (`taiga` / `ice` / `snowy`) are **not** `mb:snow_layer` themed — they are spruce/cobble (ice = packed ice paths). Colder areas = **less infection/mob pressure** in pack design. **`mb:snow_layer`** sprinkle (~34% seed roll per site, any ruleset) is optional ruin flavor, applied **last** after structures — see `settlementRollsMbSnowSprinkle` in `mb_abandonedSettlementBuilder.js`.

---

## NEW CHAT HANDOFF — Abandoned villages (2026-06-02)

**Paste this block into a new Cursor chat** when continuing abandoned-village / cold-biome / lamp work. Prior transcript (if needed): agent transcript `c3cc7275-3a33-4227-90bf-cddd2936ce4c`.

### Project slice

Maple Bear TakeOver — Bedrock addon. **Script-built abandoned villages** at worldgen **lamp markers** (spruce fence posts). Public pack: `BP/` + `RP/`. Dev/testing: `BP - Dev/` + `RP - Dev/` (Bridge → dev trees). Entry: `BP/scripts/main.js`. Design doc: [`docs/development/ABANDONED_SETTLEMENTS.md`](development/ABANDONED_SETTLEMENTS.md).

### User goals this thread (done unless noted)

| Topic | Status |
|--------|--------|
| Ladders in normal lamp villages (not just ladder test) | **Done** — `scheduleSettlementLadderPlacementsAfterRuin` after processor drain |
| Cold biome lamps (`ice_plains`, cold taiga) | **Done** — `BP/feature_rules/village_marker_cold_overworld_slot0.json` (new chunks) |
| Day ~20 lag from village scripts | **Mitigated** — `mb_abandonedVillagePerf.js`, smaller ruin radius, deferred horizon scan, MP rotate-one-player scan |
| Logs: endless `Scan skipped — village burst defer`, structure_block on lamp | **Done** — `shouldDeferAbandonedVillageHorizonScan()`; lamp cleanup/arrival not deferred; arrival ≤56 blocks incl. on post |
| Cold village: no dusted dirt on house pads | **Done** — `settlementUsesDustedGround(ruleset)` → infected only |
| Cold village: `mb:snow_layer` not vanilla snow; snow **last**, covering roofs | **Done** — `settlementUsesSnowCap`, `tickSettlementSnowPhase` (paths then roof overlay) after well |
| House floating over water | **Mitigated** — `structureFootprintIsBuildable` skips bad footprints (≤20% water, ≥55% land, center land) |

**Not committed** unless user asked — check `git status` before release.

### Build pipeline order (`mb_abandonedSettlementBuilder.js`)

`cleanup` → `ground` (infected dusted only) → `paths` → `structures` → `pen` → `well` → **`snow`** (`mb:snow_layer`) → `zombies` → `done`.

Exports/helpers: `MAPLE_BEAR_SNOW_LAYER`, `settlementUsesDustedGround`, `settlementUsesSnowCap`, `enqueueSettlementBuild`, `hashChunkRoll`.

### Key files

| File | Role |
|------|------|
| `mb_abandonedSettlementBuilder.js` | Phased settlement build, pads, snow, materials, structure skip on bad footing |
| `mb_abandonedVillageWorldgen.js` | Scan, lamp activation, processor queue, cleanup |
| `mb_abandonedVillageSites.js` | Grid, lamp positions, `lampArrivalCandidateAtGrid` |
| `mb_abandonedVillagePerf.js` | Adaptive budgets (thrift tier, scan interval, ruin radius) |
| `mb_workSpread.js` | `shouldDeferVillageBurst`, `shouldDeferAbandonedVillageHorizonScan` |
| `mb_settlementStructures.js` | 50 house plans, churches, work buildings |
| `village_marker_cold_overworld_slot0.json` | Cold lamp worldgen feature rule |

### Rulesets (materials)

`plains` / `desert` / `savanna` / `jungle` / **`taiga`** / **`snowy`** / **`ice`** (packed ice paths) / **`infected`** (dusted pads + snow cap). Cold = taiga + ice + snowy for snow overlay; infected for dusted ground.

### How to test in-game

1. `/reload` — use **`BP - Dev/`** in Bridge for full journal tools.
2. **New chunks** for cold worldgen lamps (existing chunks won’t retro-spawn cold posts).
3. Walk to lamp: Content Log should show cleanup + build queue, **not** endless full-scan defer.
4. Journal → **Abandoned village debug** for perf budget line.
5. Cold village: cobble pads, **`mb:snow_layer`** on paths/roofs after houses exist, no dusted house pads.

### Validation on PC

`npm run check` (or `node --check BP/scripts/mb_abandonedSettlementBuilder.js`). ESLint ~220 pre-existing `no-unused-vars` warnings OK.

### Likely follow-ups (user may ask)

- Tune roof snow density (`tickSettlementSnowPhase` thresholds 78 / 42 edge vs interior).
- If a structure slot is skipped for water, layout may look sparse — could re-roll placement in `layoutStructures` instead of silent skip.
- Confirm cold lamp spawns in target biomes after feature-rule edit.
- Merge `BP - Dev/` → `BP/` for store release per `AGENTS.md` checklist.

### Related log the user shared

`Minecraft Logs/logs/ContentLog2026-06-02_12-04-35_1.txt` (~L22681+) — defer spam + lamp artifacts before scan/lamp fixes; re-test after reload.

---

**Date:** 2026-06-02 (Ladder timing — early + post-ruin pass)

- **`scheduleSettlementLadderPlacementsAfterRuin`:** first ladder wave ~8t after build; second when ruin processor queue is empty (was: wait up to 30s only). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Lake pier villages + lamp retry)

- **Pier hubs:** `scoreSettlementFootprint` allows **water** center (up to ~94% water in ring); `settlementCenterFromFootprintScore` + `placeSupportPoles` (ruleset log). Structures/paths use `resolveColumnFloorY` on water cells.
- **Lamp:** try pier at post, then shore; `clearSiteFailedForLampArrival` on approach; lamp BAD_FOOTING does not permanently mark failed.
- Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Day-gated snow + lamp lake lag fix)

- **`mb:snow_layer` sprinkle:** `settlementRollsMbSnowSprinkle` × `settlementMbSnowSprinkleDayFactor(day)` from `getCurrentDay()` (0 before day 5 → full ~day 28).
- **Lamp lag loop:** BAD_FOOTING on lake lamp cleared `failed` every tick → endless activate + spiral logs. Now **`markSiteFailed`** always; skip re-activate if failed; no `clearSiteFailedForLampArrival` on approach. **`resolveSettlementCenterNearLamp`** searches dry shore up to 56 blocks from post.
- Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Mb snow sprinkle — not cold-themed)

- **`settlementRollsMbSnowSprinkle(cx, cz, siteSub)`** — ~34% of sites (any ruleset) get **`mb:snow_layer`** after build; **not** auto on taiga/ice/snowy.
- Cold rulesets stay spruce/cobble/ice paths only (design: cold = less infection, not mb-snow décor).

---

**Date:** 2026-06-02 (Cold village snow + pads + footing)

- **Cold rulesets** (`taiga`, `ice`, `snowy`): house pads use **cobblestone**, not `mb:dusted_dirt` (dusted ground is **infected ruleset only**).
- **Snow:** **`mb:snow_layer`** only when sprinkle roll hits; runs **after** paths, structures, pen, well (paths then roof overlay).
- **Footing:** Per-structure footprint must be **≥55% land**, **≤20% water**, center column on land — skips floating pier houses (village hub still allows shoreline piers).
- **`settlementUsesSnowCap`**, **`MAPLE_BEAR_SNOW_LAYER`**. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Roof planks/stairs + deck seal — fix floating rails)

- **Roofs:** Flat/peaked/shed use **full blocks** (planks/cobble), not slab caps; peaked/steeple fill the **entire** footprint with a sloped volume (stairs on slope faces). Taller peaks (2–3 blocks on medium/large shells). Work buildings default to **peaked** unless plan says otherwise.
- **Floating deck fix:** `sealRoofVolumeToDeck` fills air between local roof height and uniform deck; perimeter fence at **one** `deckWalkY + 1` (not per-cell crown).
- **Processor:** Lower chance stairs → cobweb (0.03). Mirrored **`BP/`**.

---

**Date:** 2026-06-02 (Gabled roofs + roof deck access)

- **Roofs:** Dedicated **`roof`** build phase after walls — `peaked`/`steeple` inverted-V (oriented upside-down stairs + log ridge), `shed` mono-pitch, `flat` slab cap without random roof stairs. Resolver fallbacks for houses; work buildings default flat where appropriate (`toolsmith`, `farmer`, `market_hall` + `roofDeck`).
- **Deck access:** `placeRooftopLookout` uses **crown Y** from roof geometry; **`roofAccess`** phase adds exterior supported stairs (deck or multi-story) + back-wall ladder on 1-story decks. Ladder payload **`ladderTopDy`** reaches deck after ruin processor.
- **Dev:** Single-build **Gable house** (plan 14), **Roof deck** (forced lookout). Docs: [`ABANDONED_SETTLEMENTS.md`](development/ABANDONED_SETTLEMENTS.md) roofs section. Synced **`BP/`**.

---

**Date:** 2026-06-02 (Abandoned village floor plan expansion — 50 houses, ornate churches)

- **Catalog:** `mb_settlementStructures.js` — **50** house variants (0–19 refreshed, 20–49 new: cottages, row, dogtrot, manor, 3-story, cellars); **25+** work footprints (10 new kinds: bakery, brewery, schoolhouse, town_hall, etc.); **6** church variants via `getChurchPlan()` (cross nave, bell tower, cathedral crypt).
- **Builder engine:** `occupied` cell masks, `appendages` (porch/bell_tower), `basement` phase, `roofStyle` extras, `facade` arches/columns, `wallHAt`, multi `midFloorLevels`, horizontal partitions, `placeChurchDecor()`.
- **Tier layouts:** Village slots 3/5/7 → fisherman/fletcher/shepherd; large **2** unique extra professions; hamlet 10% cartographer/shepherd.
- **Dev:** Expanded single-build menu (courtyard, cellar, dogtrot, cathedral, town hall, …); loot keys for new work kinds.
- **Docs:** [`ABANDONED_SETTLEMENTS.md`](development/ABANDONED_SETTLEMENTS.md) floor plan catalog + engine table. Mirrored **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Settlement floor plan expansion — structures catalog)

- **`mb_settlementStructures.js`:** Replaced with **50 house variants** (`HOUSE_VARIANT_COUNT = 50`); extended `HousePlan` (`occupied`, `appendages`, `basementDepth`/`basementFloor`/`basementHatch`, `roofStyle`, `facade`, `wallHAt`, stories up to 3, `midFloorLevels`). Mask helpers for **L-wing (11)**, **courtyard (15)**, **dogtrot (32)**, **T-shape (33)**, **H-plan (37)**, **U-plan (38)**; **`getChurchPlan(ruleset, roll)`** — 6 church variants including cross mask. **25 work/special plans** (upgraded smith/farm/lib/market + bakery, brewery, apiary, hunter lodge, mill, school, town hall, prison, greenhouse, trading post). **`getWorkBuildingPlan(kind, cx?, cz?, salt?, ruleset?)`** variant rolls; **`structureKindForSlot`** — village slots 3/5/7 = fisherman/fletcher/shepherd, hamlet 10% cartographer/shepherd, large expanded extra pool. Mirrored **`BP/scripts/`**. Builder engine still needs Phase 0 hooks to consume new fields.

---

**Date:** 2026-06-02 (Lamp at post → village must spawn)

- **Intent:** Find lamp → clean structure_block → script village if you are there.
- **Bug:** Lamp “arrival” required **6–56** blocks from the post, so standing on the lamp (0–5 blocks) hit a dead zone — cleanup could run but no activation.
- **Fix:** Arrival is **≤56** blocks (including on the post). After cleanup, **`tryActivateLampSiteWhenPlayerPresent`** queues build when artifacts are clear and player is in range (skip seed roll). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Village scan defer fix — lamps always run)

- **Bug:** `shouldDeferVillageBurst` includes **chunk-edge defer** (~6s per chunk crossed). Walking to a lamp kept defer true → entire scan returned early (“Scan skipped”) and **lamp cleanup never ran** — structure_block stayed visible.
- **Fix:** `shouldDeferAbandonedVillageHorizonScan()` (no chunk-edge) only gates horizon + large-infected scans. **Lamp arrivals**, **lamp artifact cleanup**, and **clear on arrival** always run. Verbose defer log throttled to ~10s. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Abandoned village adaptive perf — spawn/mining parity)

- **Was not** tied to pack auto-throttle before (fixed scan every 20t, full horizon scan **per player**, no `shouldDeferVillageBurst`).
- **`mb_abandonedVillagePerf.js`:** uses `getPlayerThriftTier`, `getAiIntervalStretch`, `getSpawnBlockBudgetScale`, wall/mob probes, `shouldDeferVillageBurst`. Scales scan interval, activations, ruin processor blocks, build blocks/tick, scan radius. **Multiplayer:** horizon ring scan **rotates one player per tick**; lamp arrivals still per player; shared activation cap.
- Debug report + self-test show live budget line. Docs: `ABANDONED_SETTLEMENTS.md`. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Cold lamp markers, village worldgen perf)

- **Cold villages:** Added `village_marker_cold_overworld_slot0.json` so **cold spruce lamp posts** worldgen in `ice_plains` (+ spikes) and **cold taiga** (tag `cold`+`taiga`). Script rulesets already mapped (`ice` / `taiga`); lamps were only on infected biomes before — walk to lamp still activates via `collectLampArrivalSitesNearPlayer`.
- **Debug:** `isColdLampMarkerBiome`, journal report shows nearest lamp coords + cold-post expectation.
- **Perf (day 20 load):** Ruin processor default radius **34–48** by tier (was **80** ≈ millions of block reads/village). Coarser infected-proximity scan, fewer `getBiome` heights, shared activation budget per tick, skip every other idle horizon scan, lamp cleanup **40t**. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Ladders never placed in normal villages — scheduling fix)

- **Cause:** Ladders were only triggered when a **processor job** finished with `pendingLadderColumns` attached. If the processor queue was full, the job never carried ladders, or the **ladders** build phase did not run before the tick budget expired, normal lamp villages never called placement (ladder test still worked via `skipProcessor`).
- **Fix:** Always collect ladder payloads on the build job; **`scheduleSettlementLadderPlacementsAfterRuin`** in `finishSettlementPlacement` waits until `processorQueue` is empty (or ~30s timeout) then runs the existing multi-pass `/setblock` placement. Ladders phase no longer consumes block budget (`if (phase === "ladders")` not gated on `!over()`). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Ladders after ruin processor — fix lamp village breaks)

- **Cause:** Ladder test uses `skipProcessor: true`; real villages run the **ruin processor** after build, which randomizes logs/planks to cobwebs and breaks ladder backing. Ladders were placed *before* that pass.
- **Fix:** Queue 2-story ladder columns on the build job; place with `/setblock` **after** processor finishes (or immediately when processor skipped). Processor never modifies ladder/vine/chain blocks.
- Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Market wall fix, ladder debug, single-build menu)

- **Missing wall center:** `marketFrontIsOpen` no longer skips the whole wall column — only a **3-wide × 2-tall** door gap; walls build above. Market porch planks unchanged.
- **Ladders:** Deferred **3** placement passes on later ticks; **Ladder test** single-build runs librarian + **5** passes with `/setblock` ladder commands.
- **Dev menu:** Single building adds **Librarian**, **Butcher**, **2-story house**, **Ladder test**; labels updated. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Ladders last, market wall face, shaft carve order)

- **Ladders breaking:** `placeRooftopLookout` was re-carving the 2-story shaft after ladders were placed, dropping them as items. New build order: **repair → shaft carve → perimeter re-seal → rooftop decor → ladders last** (`phase: "ladders"`).
- **Missing wall (lectern/barrel 2-story):** In **hamlet** the last building is **`market`**, not librarian — `marketFrontIsOpen` left the **entire door face** open. Now only a **3-wide door opening** (like other shells).
- **Shaft placement:** Access shaft candidates must stay **2+ blocks** from outer walls so carve cannot clip the perimeter. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Door clearance, center persistence, stairs/ladder policy)

- **Offset villages:** World property now stores **`centers`** per built site key; **`markSiteBuilt` only on successful placement** (removed early mark at queue start). Retries reuse saved center when present.
- **Stairs:** No decor stairs in houses; roof ruin stairs disabled for work buildings and all 2-story shells; no stacked roof stairs; door-adjacent roof uses slabs only.
- **Door zone:** `isDoorApproachCell` blocks workstations, cobwebs, decor, and roof stairs within 1 block of the door opening.
- **Walls:** `platformY` fallback from `job.y` when footprint slope probe fails; **3 repair passes** over the perimeter.
- **Ladders:** `placeSupportedLadderAt` (log backing, no chain fallback) for 2-story shaft + lookout. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Persist built sites, ladders, walls, market loot)

- **Persistence:** World property `mb_av_village_sites` stores built/failed site keys + schema; **built sites never rebuild** after addon reload (use Abandoned village debug → clear registry to regen). `siteGenerationIsComplete()` exported.
- **2-story:** Ladder-only shaft through mid-floor + roof; no interior stairs into walls; stronger perimeter seal (replaces stray planks/stairs on edges).
- **Market plaza:** Stall barrels get loot in the same step (cartographer table); pad pass clears logs/leaves in footprint (hill pads kept). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Beds in walls fix)

- **Cause:** Bed head was always placed at `z-1`, so beds at `lz=1` put the head on the wall row (`lz=0`). Default house plan used `lz:1` beds.
- **Fix:** `resolveBedPlacement` orients both halves inside the interior ring; perimeter repair replaces stray bed blocks with wall; default plan beds at `lz:2`. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Wall seal, weaponsmith loot, ladder/lookout)

- **Weaponsmith empty chest:** Chest was at `lz = d-1` (outside interior bounds) — never placed. Moved inward; `canPlacePlannedFurnishing` allows outer-ring (non-corner) plan slots.
- **Missing walls:** `structureSurfaceY` falls back to `platformY`; new **`repair`** phase seals air gaps on the perimeter after furnishings.
- **2-story:** Shaft carves through roof for lookout; **ladder** (chain fallback) instead of stacked stairs; diagonal stair in shaft corner; librarian barrel + no plan ladder.
- **Rooftop lookout:** Log + fence mast (not stair pole); ladder through roof hole from access shaft. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Ravine foundations, house loot, roof/stairs perf)

- **Ravine / cliff:** After leveling, **cobble pillars** fill air up to 14 blocks below each floor cell; deep columns still level to `platformY` (fill up to 12). Slope allowance widened (10–14 blocks).
- **Loot:** House chests/barrels use **biome house tables only** (no random butcher/toolsmith variant rolls).
- **Roofs:** Fewer decorative roof stairs / holes (less floating junk); **rooftop lookouts** on ~24% of 1-story and ~48% of 2-story houses.
- **2-story:** Straight interior stair column; **auto-facing ladders**; removed broken exterior stair runs.
- **Perf:** Lamp cleanup **20t**, approach-range only, removed duplicate clear from main scan; cleanup grid range = `LAMP_APPROACH_DIST_MAX` (not +96). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (2-story shaft, lamp cleanup, 20 house variants)

- **2-story access:** 2×2 **shaft** carved through mid-floor and roof; mid-floor planks skipped in shaft; interior ladders via numeric `facing_direction` + backing wall; interior stairs in shaft; exterior stairs only when ground supports each step; optional **rooftop lookout** (stairs + fence, ~42% roll).
- **Hills:** Pad fill max **8**; after pad, all footprint columns forced to **platformY** in floor cache.
- **Houses:** **20** variants (`wide_3`, `courtyard`, `shed`, `long_hall`, `two_story_c/d`); weaponsmith props spread; duplicate plan ladders removed.
- **Lamp:** Dedicated cleanup every **10t** while player in overworld; approach range **LAMP_APPROACH_DIST_MAX**; retry while within **80** blocks if artifacts remain. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Level pads, beds, ladders, stairs)

- **Hills:** Platform at **maxY**; fill up to 6 blocks; **trim** hillside cells into footprint (air above platform).
- **Beds:** `/setblock` bed pairs + floor under mattress; dedicated post-interior pass; skip cobwebs on bed cells.
- **2-story:** Ladder column on wall, interior stair run, exterior stairs at door. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (House decor, ruined farms, stone churches)

- **Houses:** Random carpets (biome-colored), stair bedside tables, flower pots / decorated pots after furnishings.
- **Farms:** `placeRuinedVillageFarmland` — log+fence border, `farmland`, cross irrigation water, wheat/carrot/potato mix, optional corner pond (all rulesets).
- **Church:** `buildStyle: stone` — cobble/mossy walls & floors, cobble roof slabs (sandstone in desert). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Village loot, beds, 2-story, well seal)

- **Loot:** Librarian → books/cartographer table; market/lectern → cartographer (not butcher); farmer → biome house crops; chests prefer `spec.loot` / work table over workstation heuristics.
- **Beds:** `placeStructureBed` (both halves via `BlockPermutation`).
- **2-story:** House variants 12–13; librarian, market, church (`midfloor` phase + upper furnishings).
- **Wells:** `sealWellPerimeter` — 5×5 cobble collar around 3×3 pool. Lamp clear confirmed working. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Savanna lamp structure_block — scan fix)

- **Root cause:** `findBuildSurfaceY` treated an exported **structure_block** atop the warm lamp as an invalid column, so lamp cleanup never ran (`!lamp=0` in logs was unrelated). **Fix:** `surfaceY`-based vertical band, **±8** XZ (worldgen `adjustment_radius` 6), verify-clear via **`setblock air destroy`**. Distant clear passes **player Y** as hint. Fallback loot picks **without replacement** (no triple shears). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Lamp unload false-done fix, wide loot spread)

- **Lamp:** `lampArtifactDone` no longer true when chunk unloaded (`LAMP_ARTIFACT_COUNT_UNKNOWN`); `setblock air destroy` fallback; 7×7 scan; distant scan re-tries until clear.
- **Loot:** Spread slots evenly across chest; split large stacks into separate piles. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Lamp clear every tick, loot defer+fallback, center bell/well)

- **Lamp:** `clearLampColumnArtifacts` 5×5×44 scan; runs on enqueue + every build tick until gone; stores `lampWorldX/Z`.
- **Loot:** Fill at 2/8/20t after block place; `/loot` path variants; script fallback + scatter only when items exist.
- **Bell:** Removed from market hall building; only village meeting center on **cobble** (not fence).
- **Well:** 3×3 water pool (4 deep), cobble canopy ring, open center. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (No double-build, pad cap, well bell, loot fix, lamp artifacts)

- **Reload:** Site marked built when build starts; skip if already built — stops villages stacking on reload.
- **Hills:** Pad only when slope ≤3 and raise ≤2 blocks (no dirt stilts); steep sites follow terrain.
- **Well:** 4-block shaft, mossy bottom; bell on post beside well (solid footing, not in water).
- **Loot:** Scatter no longer wipes chests when ≤1 stack; retry scatter after 2 ticks.
- **Lamp:** Taller column scan for structure_block; retries until clear. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Loot scatter + building-type tables, hillside pads)

- **Loot:** After `/loot` fill, **scatter** chest/barrel slots via inventory API (fixes slot 0–2 clumping); workstation + work-building loot maps; house variants use one table per layout (loom→shepherd, etc.); farmer barrel fixed to butcher.
- **Terrain:** Each structure **pads** low columns to a shared platform Y (dirt/cobble fill) before walls — buildings stay whole on hills. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Lamp preserved, loot replace, paths, market meeting, 12 house variants)

- **Lamp:** Stopped stripping fence post — only `structure_block`/`jigsaw` removed; full worldgen lamp stays.
- **Loot:** `loot replace block` for random container slots; barrels + chests; **loom → shepherd** table (wool).
- **Paths:** Plains/savanna mix **dirt**, mossy cobble, cobble; walls 50/50 cobble + mossy.
- **Villages:** Larger radius (12/22/32), more buildings, wider ring; **12** house layouts.
- **Meeting:** Well + bell, fountain + bell, **market** (wool stalls + barrels), campfire + bell. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-02 (Lamp pole overlap, barrel loot, wood stair roofs)

- **Pole build bug:** Village center no longer seeds on the lamp (`avoidLamp` 14+ blocks); structure layout excludes 10-block pad around lamp; build clears fence/log pole (keeps **barrel** on lamp).
- **Loot:** `fillVillageStorageAt` — `loot insert` on **chests and barrels** (vanilla village tables, random slots).
- **Roofs:** Higher **stair** rate on plains/savanna/jungle (52%) with optional second stair layer on edges. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-01 (Settlement roofs, 8 house variants, workstations, meeting points, chest loot)

- **Roofs:** Full footprint slab cap with ~10% edge / ~8% interior holes; removed double-layer slabs that read as “collapsed in.”
- **`mb_settlementStructures.js`:** 8 house layouts per ruleset; workstation buildings (weaponsmith, armorer, farmer, librarian, butcher, …) with correct job blocks; village/large slot layout.
- **Meeting points:** Per ruleset roll among **well**, **fountain** (5×5 plaza + bell), **campfire** (log/hay ring).
- **`mb_villageChestLoot.js`:** `loot insert` with vanilla `chests/village/village_*` tables on chest placement. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-01 (Lamp arrival activation — savanna-at-lamp fix)

- **Log (`ContentLog2026-06-01_21-44-18_1.txt`):** Jungle at **41 blocks** from lamp built; savanna at lamp had `close=1`, `ok=0`, `!load=8` — never activated. Second jungle/infected try: `BAD_FOOTING` at grid 134,124,2 then `failed=1` blocked retries; lamp cleanup sometimes skipped structure blocks.
- **Causes:** (1) Player **&lt; 40 blocks** from lamp counted as “too close” for horizon scan. (2) **Anchor chunk** unloaded while lamp chunk loaded (`!load`). (3) Failed sites stuck without retry at lamp. (4) Cleanup marked lamp “done” after **0** clears when artifact was above surface scan.
- **Fix:** **`LAMP_ARRIVAL_DIST`** 6–56 — `collectLampArrivalSitesNearPlayer` runs first (skip seed roll, biome at lamp, anchor chunk optional). **`isSiteChunksReadyForActivation`** requires lamp chunk; **`clearSiteFailedForLampArrival`** on arrival. Placement retries center at **lamp** when `lampArrival`; no `markSiteFailed` on arrival footing miss. Artifact scan **y−4…y+40**, `countWorldgenArtifactsAt` — only mark cleared when none remain. Duplicate activation queue guard. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-01 (Village structures replace leaves/vines)

- **User:** Structures stopped at leaves/vines; want mining-style replace (not bedrock/lava/water).
- **`mb_miningBlockList.js`:** `isSettlementReplaceableBlockId` — inverse of `UNBREAKABLE_BLOCKS` + fluids.
- **`mb_abandonedSettlementBuilder.js`:** `SETTLEMENT_REPLACE_ANY` for walls/roofs/paths; column scan passes through leaves/vines. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-01 (Lamp approach activation + artifact cleanup)

- **Log/session:** Lamps visible from distance; structure blocks until close; `ok=0 far=15` — no villages built walking in.
- **Cause:** Activation max distance (~240) &lt; site grid (384); walking toward lamp loaded chunk inside “too close” before horizon fired.
- **Fix:** Lamp-centric distances — **approach band** 40–224 blocks + max horizon `scanR×16+384`; `clearWorldgenArtifactsAt` within 128 blocks of lamp; docs note for user’s **sandstone desert** lamp. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-01 (Village marker Molang — v.worldx fix)

- **Log:** `[Molang][error] … unknown variable 'variable.worldx'` on all `village_marker_*` feature rules — lamps never placed.
- **Fix:** Grid math moved into **`minecraft:scatter_feature`** wrappers using **`v.originx` / `v.originz`** (chunk origin); feature rules only scatter once per chunk. `q.heightmap(v.worldx, v.worldz)` runs after x/z in scatter. Mirrored **`BP - Dev/`**.
- **Follow-up:** FeatureRegistry required **`"y": 0`** on feature_rule `distribution` (height still from scatter).

---

**Date:** 2026-06-01 (Village placement failure debug)

- **`recordPlacementFailure`** — coded failures (`BAD_FOOTING`, `QUEUE_FULL`, `BUILD_STALL`, `WRONG_BIOME`, …) with multi-line Content Log detail; journal shows last code + snippet.
- **`diagnoseSettlementCenter`** / **`diagnoseForcePlaceCenter`** — per-seed/spiral footing probes (water %, center column, closest partial fix). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-01 (Ruin scatter off, lamp cleanup, beach footing)

- **User:** Fresh world — barrel/cobweb/mossy cobble ruins everywhere; lamp still had structure block; village failed at lamp on sand/water shore (`Site bad footing` in Content Log).
- **Worldgen:** Archived all **`abandoned_settlement_*.json`** ruin feature rules → `BP/_archived/feature_rules/abandoned_settlement_worldgen_ruins/` (14 BP + 17 Dev). Active worldgen: **`village_marker_*.json`** only.
- **Scripts:** Build starts with **`cleanup`** phase — strips `minecraft:structure_block` / jigsaw in 5×5×28 around village center; relaxed footprint water ratio for beach/shore/sand/infected; `rulesetForBiome` maps beach/stony_shore → plains. Mirrored **`BP - Dev/`**; **`ABANDONED_SETTLEMENTS.md`** updated.

---

**Date:** 2026-06-01 (Force place — stuck build queue + river biome)

- **Logs:** `Build queue: 2` · `pending 2` · `failed 2` · force place “queue full”; user on `minecraft:river` (no village ruleset).
- **Fix:** `abortAllSettlementBuilds()` + `prepareForcePlaceAt()` before force place; force runs **immediate** (not fake queued success); `markSitePending` only after build enqueued; stall watchdog (~800 ticks); **Clear chunk cache** flushes queue; clearer errors for river/water footing. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-01 (Lamp biomes — oak plains, warm savanna, rain jungle)

- **User:** Oak = plains, warm = savanna, rain = jungle villages (not “future only”).
- **Worldgen:** `village_marker_plains_slot0` (oak), `savanna_slot0` (warm), `jungle_slot0` (rain) on 384-grid; infected still cold ×3/×1.
- **Scripts:** `jungle` ruleset + `rulesetForBiome` / scatter / structure candidates. README + **`ABANDONED_SETTLEMENTS.md`** table. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-06-01 (Village search / footing performance)

- **User:** Optimize village structure searching.
- **`mb_abandonedSettlementBuilder.js`:** `hintY` narrows column scans; footprint + placement share a **column cache**; `resolveSettlementCenter` tries lamp + anchor seeds before spiral; reuse center `analyzeColumn` for Y.
- **`mb_abandonedVillageWorldgen.js`:** **Per-scan** `getInfectedProximityTier` cache; infected `hintY` + `lampMarkerWorldPosition` seeds for footing.
- **`mb_abandonedVillageSites.js`:** Tighter site grid iteration; per-collect **prox cache**; skip large sub-slots 1–2 when player cell is not large infected. Mirrored **`BP - Dev/`**; **`ABANDONED_SETTLEMENTS.md`** performance table.

---

**Date:** 2026-06-01 (Village lamp post worldgen markers)

- **User:** Exported 4 lamp posts (3×3, 23y): oak, warm/acacia, rain/jungle, cold/spruce — visible at chunk gen before script village sim range.
- **Assets:** `BP/structures/mb/village_marker/{oak,warm,rain,cold}_lamp_post.mcstructure` (from `mb_village_*_lamp_post_mark` in dev).
- **Worldgen:** `mb:village_marker/cold_lamp` + `feature_rules/village_marker_infected_large_slot{0,1,2}` (always) and `village_marker_infected_medium_slot0` (50% scatter). Grid snap 384 / offsets 64+slot×128 on X.
- **`mb_abandonedVillageSites.js`:** `lampMarkerWorldPosition()` documents lamp vs jittered `siteWorldAnchorForSlot`. Mirrored **`BP - Dev/`**; **`ABANDONED_SETTLEMENTS.md`**.

---

**Date:** 2026-05-19 (Infected footing, snow, one job-site, force-place menu)

- **User:** Villages on `mb:dusted_dirt` (force place too), snow layers around/on them, one workstation per building (vanilla), large force place, per-building force list.
- **`mb_abandonedSettlementBuilder.js`:** `mb:dusted_dirt` buildable/replaceable; infected **ground** + **snow** phases before paths; `settlementUsesDustedGround`; trimmed house/smithy/farm/market/church to one job block each; `layoutForceStructure` for single-building tests.
- **`mb_abandonedVillageWorldgen.js`:** Force modes `hamlet` / `village` / `large` / `house` / `smithy` / `farm` / `market` / `church` / `pen`; custom structures passed into `enqueueSettlementBuild`.
- **`mb_entityQueryDebugDev.js`:** Large village button; **Single building…** submenu. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Church, animal pen, biome floor beams)

- **Church** (`CHURCH_PLAN` 7×9, 5-high): bookshelves, lectern, nave floors — village/large only (slot before market).
- **Animal pen** 5×5 fence + hay beside **farm**; path spoke to gate; cow/pig/sheep spawn (village/large).
- **`resolveFloorBlockId`:** ruleset `mat.log` = structural beam (oak / acacia / sandstone desert / spruce taiga). Hamlet count unchanged (4). Village 8 / large 13 structures. Mirrored **`BP - Dev/`**; **`ABANDONED_SETTLEMENTS.md`**.

---

**Date:** 2026-05-19 (Workstations interior-only enforcement)

- **User:** Job-site blocks must stay inside houses/work buildings only.
- **`placeInteriorBlock`** + `isStructureInteriorCell`; smithy uses fixed `SMITHY_INTERIOR` (removed random ±1 offset that placed anvils outdoors); farm `FARM_WORKSTATIONS`; house/market furnishings gated. Open-air prop phase already removed. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (House floor plans — log frames, varied interiors)

- **User:** Houses should feel like vanilla villages — different floor plans, logs not only planks.
- **`HOUSE_PLANS` (5):** cottage (cross beam), weaver (loom room + log partition), cabin (log ring + tall walls), forester (smithing tools), mason (checker floor + stonecutter). Per-plan footprint, floor fn, interiors, cobwebs. Seed-stable `housePlan` on each house slot. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Settlement village layout — paths, well, interiors, market)

- **User:** Hamlet/village force place works; workstations were random in open; want real village feel (paths, well, beds inside houses, market not bell hall).
- **`mb_abandonedSettlementBuilder.js`:** Spoke paths + plaza (`planSettlementPaths`); **well** (3×3 ring + water + fence posts); doors face center; **house interiors** (beds, barrel, chest, furnace, table); **market** replaces hall (open front, stalls, campfire); removed open-air prop scatter. Hamlet = 3 houses + market; village = +smithy + farm. Mirrored **`BP - Dev/`**; **`ABANDONED_SETTLEMENTS.md`** tier table.

---

**Date:** 2026-05-19 (Settlement structure layout — no overlaps)

- **User:** Ruin buildings sometimes stacked on the same footprint.
- **`layoutStructures`:** AABB checks with **2-block gap**, center plaza exclusion (well), up to 28 seeded retries + even ring fallback + last-resort offset. Min ring distance raised (hamlet 6+). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Hamlet zombies phase infinite loop)

- **Log (`ContentLog2026-06-01`):** Build placed terrain/structures ~13s then watchdog at `tickBuildJob` line 1263 (`hashChunkRoll` / `cachedFloorY`) — **zombies** phase used `if (sy === undefined) continue` without incrementing tick budget → infinite loop in one game tick.
- **Fix:** Always `spent++` per zombie attempt; fallback Y at village center; skip slot after 6 bad columns / 4 failed spawns; structure grid guard cap. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Hamlet build watchdog — incremental structures)

- **Crash log (`ContentLog2026-05-31_22-25-15`):** Hamlet at feet started, then ~13s later `InternalError: interrupted at analyzeColumn` in `tickBuildJob` / `placeStructureStub` — whole houses built in one tick despite phased queue.
- **Fix (`mb_abandonedSettlementBuilder.js`):** `tickStructureBuild` incremental grid/walls/roof; floor-Y cache; `analyzeColumn` bounded by `hintY`; budget **12 blocks/tick**; dedicated **`runInterval(1)`** build loop (decoupled from 20-tick scan). Removed duplicate “Settlement build started” log from `beginSettlementPlacement`. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (AV debug — build at feet, village test, codex pin)

- **Hamlet test failed:** `Site bad footing @ grid 133,136` — force place used **grid anchor** far from player, not feet. **`resolveForcePlaceCenter`** builds underfoot; **`usePlayerCenter`** on force queue.
- **Village test** button (tier `village`, phased, no processor). Codex pin **`abandoned_villages`** → Systems. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (AV watchdog hang — defer activate, skip jigsaw, slower build)

- **Crash log:** `Activate site … FORCE` then `Watchdog 10002 ms hang` — synchronous `placeJigsawStructure` (missing assets) and/or heavy `resolveSettlementCenter` footprint scans.
- **Fix:** `JIGSAW_SCRIPT_VILLAGES_ENABLED = false`; activation queued to next tick (`pendingActivations`); footprint/column scans capped; `SETTLEMENT_BLOCKS_PER_TICK` 35 (~2–4s hamlet); processor 200 blocks/tick. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (AV fixes — biome sampling, ruin worldgen off, safe force place)

- **Logs:** Player on `infected_biome_large` but `Large infected underfoot — 0 local slot(s)` — anchor biomes sampled at y=64 read `meadow`; slots rejected.
- **Fix:** `getBiomeIdAt` multi-height + prefers infected; `effectiveBiomeForSlot` uses player large-infected cell; wider ring when player on large; force place = hamlet only, no 80-block processor, queue cap.
- **Barrel/cobweb:** Moved active `abandoned_settlement_infected_*.json` feature rules to **`BP/_archived/feature_rules/abandoned_settlement_infected_ruins/`** (worldgen scatter). Script village props unchanged (inside built hamlets only). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Large infected — 3 guaranteed villages per grid cell)

- **User:** In a large infected biome, want **multiple** script villages, **at least 3 guaranteed**.
- **`mb_abandonedVillageSites.js`:** `SITES_PER_LARGE_INFECTED_CELL = 3` — three jittered anchors per ~384-block cell (slots 0/1/2); registry keys `gx,gz` or `gx,gz,1`, `gx,gz,2`; `findLargeInfectedSitesNeedingVillage` + `largeInfectedSlotsNearPlayer`; horizon scan iterates all slots.
- **`mb_abandonedVillageWorldgen.js`:** Up to **3 large-infected activations per scan tick** (`skipSeedRoll`); `subIndex` on pending/built/failed; debug report + Content Log slot ids. Mirrored **`BP - Dev/`**; **`ABANDONED_SETTLEMENTS.md`** updated.

---

**Date:** 2026-05-19 (Infected villages — no barrel ruins, rolls, verbose log)

- **User:** Remove tiny barrel worldgen ruins near small infected; more Content Log spam when ON; large infected = guaranteed script village, medium 50%, small ~1%.
- **Archived** `feature_rules/abandoned_settlement_infected_*.json` (worldgen ruin/barrel scatter). Villages in infected biomes are **script-only**.
- **`mb_abandonedVillageSites.js`:** `sitePassesSeedRoll` uses biome tier; `findLargeInfectedSiteNeedingVillage` for guaranteed large; `describeSiteRollChance` for debug.
- **`mb_abandonedVillageWorldgen.js`:** Verbose scan logging when Content Log ON; guaranteed large pass before horizon sites. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Jigsaw POC — disable until .mcstructure exists)

- **User log:** `[Json][error] Invalid asset path mb/av_plains/well_center` on world load.
- **Cause:** Template pool referenced `well_center.mcstructure` that was never exported.
- **Fix:** Removed active `BP/worldgen/` jigsaw JSON; copies live in **`BP/_optional/abandoned_village_jigsaw_poc/`** (enable after export). Script villages unchanged. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Abandoned villages — hybrid site grid)

- **User:** Hybrid pre-planned villages + horizon activation (not per-chunk endless rolls).
- **`mb_abandonedVillageSites.js` (new):** ~384-block seed grid, jittered anchors, 1/N site roll (denser near infected), `mb_av_village_sites` persistence (built/failed).
- **`mb_abandonedVillageWorldgen.js`:** Scans activatable sites in outer ring; `tryActivateAbandonedVillageSite` with live biome + `resolveSettlementCenter`; marks site on successful build. Clear cache wipes site registry. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Abandoned settlements — piers on water, ice centers OK)

- **User:** May build over water with support poles; village **center** must not be open water; **ice** is fine for center.
- **`mb_abandonedSettlementBuilder.js`:** `resolveColumnFloorY` + log poles to anchor; paths/structures on piers; `isValidVillageCenterColumn` rejects water-only hub (ice = land). Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Abandoned settlements — river avoidance + savanna irrigation)

- **User:** No building on rivers; water only where it makes sense; savanna/acacia farms need more water.
- **`mb_abandonedSettlementBuilder.js`:** `classifySurfaceColumn` / `findBuildSurfaceY` skip open water; `resolveSettlementCenter` nudges site off rivers (~14% max water in footprint); paths/structures/props skip water columns. **Savanna:** farm irrigation channel + optional pond; well center = water.
- **`mb_abandonedVillageWorldgen.js`:** Uses `resolveSettlementCenter` before placement; logs skip when debug ON. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Abandoned jigsaw worldgen — fix 1.26 load parse error)

- **User log:** `[Structure][error] unsupported version: no parser available for version 1.21.0` on `worldgen/template_pools/mb/av_plains/start.json`.
- **Fix:** `format_version` → **1.26.10** (matches `min_engine_version` 1.26.10); jigsaw definition moved to **`worldgen/structures/`** (not `jigsaw_structures/`); template `location` → `mb/av_plains/well_center` (no `structures/` prefix); added **`worldgen/processors/mb/av_empty.json`**; `biome_filters` as array. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Abandoned village expansion — tiers, horizon scan, ice ruleset, jigsaw POC)

- **Plan:** Abandoned village expansion (Track A script + Track B jigsaw POC); do not edit plan file.
- **`mb_abandonedSettlementBuilder.js` (new):** Seed-stable tiers (hamlet/village/large); ruleset materials including **ice** (packed ice paths); structure stubs (house, smithy, farm, hall + job-site props); phased build queue (~100 blocks/tick); `tryPlaceAddonJigsaw` → `mb:abandoned_village_<ruleset>`.
- **`mb_abandonedVillageWorldgen.js`:** Scan radius default **12** (`mb_av_scan_radius` 4–16); **outer shell** placement at `scanR−1` from player; wires builder + processor + zombify; roll-miss logs only when Content Log debug ON; success logs tier/ruleset.
- **Feature rules:** `abandoned_settlement_ice.json`, `abandoned_settlement_force_ice.json`.
- **Worldgen POC:** `BP/worldgen/jigsaw_structures/mb/abandoned_village_plains.json`, template pool `mb:av_plains/start` → `structures/mb/av_plains/well_center.mcstructure` (export in Creative; README in folder).
- **Docs:** `ABANDONED_SETTLEMENTS.md` updated; new `ABANDONED_VILLAGE_STRUCTURES.md`. Mirrored **`BP - Dev/`** scripts + worldgen + ice feature rules.

---

**Date:** 2026-05-19 (Abandoned villages — sparse plains, infected clusters, roofs, biome fix)

- **User:** More roof with holes; spruce hamlet in plains; too frequent spawns — want vanilla-sparse except near medium/large infected biomes.
- **Fix:** Full roof pass (~36% holes + second slab layer); **`rulesetForBiome`** exact IDs (plains before broad `snow`/`grove` matches); **`infected`** ruleset; **`scatterDenominatorForChunk`** + 14-chunk infected proximity (large ~1/7, medium ~1/12, far plains ~1/80); scan budget 3/tick; mark radius 6. Feature rule denominators aligned.

---

**Date:** 2026-05-19 (Abandoned villages — explore-ahead placement, seed-stable rolls)

- **User:** Wants settlements visible from farther away (like vanilla / Raboy-style), not pop-in at feet.
- **`mb_abandonedVillageWorldgen.js`:** Scans **loaded chunks** in 8-chunk ring; places only **≥2 chunks** from player; **deterministic** `hashChunkRoll` per chunk; up to 8 attempts/tick. **`ABANDONED_SETTLEMENTS.md`** — vanilla worldgen vs script vs feature_rules.

---

**Date:** 2026-05-19 (Abandoned villages — larger script ruin settlement)

- **User:** Script placement worked but too small (barrel + mossy patch only); asked for more.
- **`tryPlaceRuinPatchScripted`:** Expanded to ~22-block-radius paths, **4 house stubs** (walls, logs, slabs, brown glass, cobwebs), central well ring, props (barrels, hay, composter, cauldron, fences, ladders), **3 zombie villagers**, biome **`ruleset`** materials. Removed duplicate small implementation. Dropped broken `place feature` runCommand (slash parse error).

---

**Date:** 2026-05-19 (Abandoned villages — quoted place feature + script ruin fallback)

- **User log:** `place featurerule` → `status failed`; `place feature mb:abandoned_settlement/ruin` → parse error (slash split args).
- **Fix:** Quote feature id in command; add **`mb:abandoned_settlement_force_*`** feature rules (no scatter_chance); try execute-positioned featurerule; **`tryPlaceRuinPatchScripted`** (mossy floor + cobwebs + barrel) when commands fail; skip jigsaw spam unless **`INCLUDE_FULL_DEVELOPER_TOOLS`**. Mirrored **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Abandoned villages — featurerule placement; jigsaw blocked)

- **User log:** `placeJigsawStructure` failed for all vanilla village ids (`Invalid structure name`) at plains chunk 17,72; 0 placed / 1 failed.
- **Cause:** Legacy vanilla villages are not data-driven jigsaws on Bedrock; script API cannot place them.
- **Fix:** **`mb_abandonedVillageWorldgen.js`** tries **`/place featurerule mb:abandoned_settlement_*`** then **`/place feature mb:abandoned_settlement/ruin`** before jigsaw fallback. Restored **`BP/feature_rules/abandoned_settlement_*.json`** (9 files). Debug report + self-test text updated. Mirrored **`BP - Dev/`**.
- **Docs:** **`ABANDONED_SETTLEMENTS.md`** — honest limits (ruin patches vs full villages), troubleshooting for Force place + cheats.

---

**Date:** 2026-05-19 (100% abandoned villages — no vanilla 2% roll)

- **User:** All villages should be vanilla-style abandoned (zombie) villages, not a mix.
- **Limit:** Bedrock cannot force abandoned jigsaw via JSON; pack disables vanilla villages (`worldgen_no_village` restored via `generateNoVillageBiomeOverrides.js`) and places villages only in script.
- **`mb_abandonedVillageWorldgen.js`:** After each `placeJigsawStructure`, applies Java-style abandoned block processors (mossy cobble, cobwebs, doors/torches removed, brown glass) + zombify pass. Tries abandoned structure ids first when engine supports them.
- **Docs/tool:** **`ABANDONED_SETTLEMENTS.md`** explains 100% design; biome generator comment updated.

---

**Date:** 2026-05-19 (Full zombie villages + higher density)

- **User:** More abandoned settlements; full zombie villages (not mossy ruin patches).
- **Worldgen:** Removed `worldgen_no_village` biome overrides and `abandoned_settlement_*` feature rules — vanilla villages generate again.
- **Scripts:** **`mb_abandonedVillageWorldgen.js`** — `placeJigsawStructure` + zombify pass (living villagers → zombie villagers, golems removed). Denser rolls in snow/infected biomes. **`mb_villagerSpawnPolicy`** — purge/spawn hook only **living** villagers; zombie villagers kept. Script toggle **`abandoned_village_worldgen`**. Dev: **Place zombie village here** in Villager suppress menu.
- **Docs:** **`ABANDONED_SETTLEMENTS.md`** — locate, frequency table, dev test. **`generateNoVillageBiomeOverrides.js`** marked legacy.

---

**Date:** 2026-05-19 (Abandoned settlements — snow / infected patch density)

- **User:** More abandoned ruins in or near large and medium Maple Bear snow (infected) biomes.
- **Biomes:** `mb_infected_biome_large` / `_medium` / `_small` — added `infected_biome_large|medium|small` tags for feature filters.
- **Feature rules:** `abandoned_settlement_snowy` — broader filter (`ice_plains`, `ice`, `frozen`≠ocean, `cold`≠ocean) at **1/20** (was `ice_plains` only 1/32). New **1/14** large, **1/18** medium, **1/26** small infected rules. Mirrored **`BP - Dev/`**. **`ABANDONED_SETTLEMENTS.md`** table updated.

---

**Date:** 2026-05-19 (Abandoned settlements — vanilla village spawn density per biome)

- **User / Compoother:** Spawn abandoned sites as often as normal villages in each former village biome (not one rare 1/48 rule).
- **BP:** Replaced `abandoned_settlement_overworld.json` with six rules: plains (1/34), desert/savanna/taiga/snowy (1/32), meadow (1/34). Biome tags cover all 10 `worldgen_no_village` biomes. Docs table in **`ABANDONED_SETTLEMENTS.md`**. Mirrored **`BP - Dev/feature_rules/`**.

---

**Date:** 2026-05-19 (ABANDONED_SETTLEMENTS — vanilla egg lag note)

- **Finding:** Removing all BP scripts still leaves villager egg/dispenser hitch — stall is mostly vanilla spawn cost, not JS.
- **Doc:** **`docs/development/ABANDONED_SETTLEMENTS.md`** — new § *Villager spawn eggs and lag*.

---

**Date:** 2026-05-19 (Script toggles — all systems + bear cull + All OFF)

- **User:** Turn off everything except journal + day counter; enable one-by-one; include bear cleanup loops.
- **`mb_scriptToggles.js`:** Expanded **24** toggles (bear cull, buff overflow cull, infection/ground/mob conversion, perf, spawn metrics, HUD, emulsifier, villager suppress, work spread, etc.). **`setAllScriptToggles`**, **`areAllScriptTogglesOff`**, category groups.
- **Wiring:** Intervals gated; **`shouldSleepDayZeroWorldWork`** respects script map; **`shouldPauseDayZeroAddonLoops`** when all toggles off.
- **UI:** Developer Tools → Systems → **Script toggles** — hub with **All OFF / All ON** + 4 category submenus. Synced **`BP/`**.

---

**Date:** 2026-05-19 (Abandoned settlement worldgen — Content Log fixes)

- **User:** Villages gone (`/locate` OK) but Content Log errors on load.
- **`[FeatureRegistry][error]`:** Rule file `mb_abandoned_settlement_overworld.json` vs identifier `mb:abandoned_settlement_overworld` — Bedrock requires filename = id path after namespace. **Renamed** → `feature_rules/abandoned_settlement_overworld.json` (BP + BP - Dev).
- **`[Json][error]`:** `minecraft:cobweb` unknown in deferred block resolution — Bedrock uses **`minecraft:web`**. Fixed `ruin_cobweb_block.json`.
- **Unrelated:** wolf collar baby texture missing (RP/vanilla), API 2.6→2.7 promote (verbose), 372ms Watchdog on load (known pack init).

---

**Date:** 2026-05-19 (No villages worldgen + abandoned ruins + egg warnings)

- **User:** Villager suppress works (eggs removed, no natural spawn); spamming eggs still hitches — want **stronger warnings**. Also **remove vanilla villages** and add a **custom settlement** structure.
- **Egg warnings:** **`mb_villagerSpawnPolicy.js`** — per-player sliding window: action bar every block, bass sound, escalating chat (2/4/8/15), title at 5+/10+; **4+ egg cancels same tick** → bulk/dispenser warning to all players.
- **No villages:** **`tools/generateNoVillageBiomeOverrides.js`** → **`BP/biomes/worldgen_no_village/`** (10 Mojang biomes, `minecraft:village_type` stripped). **`npm run generate:no-village-biomes`** to refresh.
- **Replacement worldgen:** **`mb:abandoned_settlement/*`** features + **`mb_abandoned_settlement_overworld.json`** (~1/48 chunks, plains/savanna/taiga/meadow/desert) — mossy patch, barrel, cobwebs, dusted dirt. Docs: **`docs/development/ABANDONED_SETTLEMENTS.md`**. **New chunks only** for both village removal and ruins.
- Synced **`BP/scripts/`** from dev; mirrored features/feature_rules to **`BP - Dev/`**.

---

**Date:** 2026-05-20 (Villager suppress fix — eggs + villages still spawning)

- **User:** Spawn rules + scripts did not block eggs or village villagers.
- **Causes:** `getComponent("minecraft:is_baby")` truthy check skipped **all** removals; eggs often need **`itemUseOn`** not just `itemUse`; **structure villages ignore spawn rules**.
- **Fix:** Correct baby check; **`itemUse` + `itemUseOn`** cancel; **`entitySpawn` remove** + **`kill` fallback**; **20t purge** (`getEntities` by type, one type/rotation); early **`import "./mb_villagerSpawnPolicy.js"`**; spawn rules use impossible biome tag. Synced **`BP/`**.

---

**Date:** 2026-05-20 (No villagers — spawn rules + eggs + script despawn)

- **Design:** Abandoned-world direction — block employed villagers; wandering traders OK.
- **BP:** Restored **`zombie_villager.sr.json`** from `_archived/spawnrules` (emptied `conditions`); added **`villager`**, **`villager_v2`**, **`zombie_villager_v2`** spawn rules in **`BP/spawn_rules/`** + **`BP - Dev/spawn_rules/`**.
- **Scripts:** **`mb_villagerSpawnPolicy.js`** — cancel villager/zombie villager spawn eggs; remove adult villagers on `entitySpawn` (villages/dispensers). World prop **`mb_suppress_villagers`** (default on, `0` = allow for tests). **`mb_workSpread`** skips villager hooks when suppression on.

---

**Date:** 2026-05-20 (Bisect all-off — gate leftover world loops + status line)

- **User:** All OFF still lags; are entity/world things really off?
- **Answer:** Entity **logic** was off; several **world** timers still ran (bear cull, buff overflow cull, snow storm, dimension adapt loop, action bar, dev camp HUD, dusted-dirt/immunity cleanup). Bisect also **inactive** if day > 0 or `lastGlobalBearCount > 0`.
- **Fix:** Those loops now respect **`shouldPauseDayZeroAddonLoops()`**. Entity-query log/HUD first line: **`getDayZeroBisectDebugOneLiner()`** (shows `ALL OFF — entity-blind` or why bisect is inactive). Synced **`BP/`**.

---

**Date:** 2026-05-20 (Day 0 bisect — entity-blind + one-at-a-time rows)

- **User:** All-off still lagged; want entity-blind baseline, add hooks back one by one.
- **Fix:** Split **entity** bisect rows (top of menu): `villager_listen`, `villager_quiet`, `villager_spawn`, `entity_queries`, `entity_hurt`, `entity_die`, `bear_entity_spawn`. All OFF = no spawn/die/hurt work, no `getEntities` (`entityBlind` skip). Menu tap enables **only** that row. Wall-clock backlog sampler still runs. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Day 0 bisect “all off” still lagged — global minimal idle)

- **User:** Bisect ON + **All systems OFF** on day 0 — lag unchanged vs full addon.
- **Cause:** Bisect only gated 9 loops; **biome ambience** (`dimension.getBiome`), **emulsifier** `runInterval`s, and **villager quiet timers** still ran (with villager handler off, dispensers got **no** entity-query mute). Turning off **perf sampler** also disabled **wall-clock backlog** detection.
- **Fix:** **`isDayZeroBisectAllSystemsSleeping()`** / **`shouldPauseDayZeroAddonLoops()`** — when every category is off: global defer, entity-query `bisectMinimal`, AI dormant, skip deferred pack services. New bisect toggles: **biome_ambience**, **spawn_emulsifier**, **infection_director**. Villager spawn always arms quiet timers; heavy drain still respects **villager_spawn**. Wall-clock sampler always runs (mob snap still bisect-gated). Synced **`BP/`**.

---

**Date:** 2026-05-20 (Day 0 perf bisect menu — find lag source)

- **User:** A/B: no addon = no lag; addon = lag. Want per-script toggles like dev tools to pinpoint cause.
- **Fix:** **`mb_dayZeroPerfBisect.js`** + Journal → Entity query → **Day 0 bisect**: bisect mode, all off/on, per-system RUN/sleep (infection, ground, villager spawn, perf, HUD, metrics, chunk, discovery, snow). Bisect off = normal addon. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Day 0 zero-bear world dormant — A/B proved addon cost)

- **User:** No lag without addon; lag with addon on/off Content log. Not leftover villagers.
- **Fix:** **`isDayZeroZeroBearWorldDormant()`** — day 0, no MB bears: sleep infection/ground/HUD loops, perf sampler, spawn-metrics watch, entity-query HUD, **villager entitySpawn** (not just queries). Synced **`BP/`**.

---

**Date:** 2026-05-20 (Log L10726+ — @kill reset; villager die fast-path)

- **User:** `@kill @e` between tests; still intermittent smoke/stall. Log: **29s** freeze (46511→~80 ticks), `entityQuiet=90t`, all `SKIP`, no `RUN` scans.
- **Conclusion:** Not leftover entity count — tick stall on spawn + catch-up. **`main.js`:** skip mob-conversion **`entityDie`** work for villagers on day 0–3 zero-bear (`@kill` cleanup). Synced **`BP/`**.

---

**Date:** 2026-05-20 (Log L9643+ — 91s stall, stronger backlog defer)

- **Logs:** 10:58:14→10:59:45 wall **91s**, game ticks **~80** (smoke/no villagers); wake `entityQuiet=74t`, all `SKIP`, no `villagerSpawn` RUN. Good runs: `entityQuiet=0`, no Watchdog.
- **Fix:** Backlog also extends **`vilDefer`/pressure** via **`registerEngineBacklogHandler`**; threshold **2** ticks / **120ms** wall gap. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Tick backlog quiet — dispenser stall before entities)

- **User:** Friend says hitch is world script not entity; 12 dispenser villagers fine until scripts catch up; smoke/no entities then delayed spawn; no Content log.
- **Model:** Vanilla can stall tick while spawning; scripts pause too, then **backlog** runs infection/ground/perf + villager drains together.
- **Fix:** **`noteEngineTickBacklog`** in **`mb_entityQueryGate.js`** (from **`mb_performanceProfile`** when ≥3 ticks skipped in one wall-clock gap) extends entity quiet **before** `entitySpawn`. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager — skip drain when pressure / quiet trace)

- **User / logs (`ContentLog` L2449+):** 12 dispenser villagers fine; hitch on **second** wave when scripts “catch up.” Logs: one `batch=10` RUN, queries `SKIP`; no Watchdog during test — hitch = drain + Content Log trace spam (`SKIP` budget 16/tick).
- **Fix:** **`noteVillagerEntitySpawn`** — if pressure or day-0 zero-bear, only bump quiet timers (once/tick), **no** `system.run` drain. **`traceEntityQuerySkip`** — no immediate `[ENTITY TRACE] SKIP` for `villagerMute` / `earlyZeroBear` etc. (stats only). Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager spawn — end-of-tick batch drain)

- **User:** Big picture — villagers uniquely stress scripts; ignore them, or process one batch per tick not per entity.
- **Logs (`ContentLog2026-05-28`):** Entity polls mostly **SKIP** (`villagerMute`/`villagerDefer`); cost was per-`entitySpawn` sync work + deferred finalize backlog, not resumed `getEntities`.
- **Fix:** **`mb_workSpread.js`** — `entitySpawn` only increments **`villagerPendingSpawnCount`**; **`system.run`** drains **once per tick** (`drainVillagerSpawnsAfterTick`) for mute/defer/pressure/finalize. Spawn-egg **`itemUse`** pre-arms mute before entity exists. **Day 0–3 + zero bears:** drain extends quiet timers only — **no** `finalize`/spread/dev logs (fixes “even 3 eggs” hitch when scripts reacted). Synced **`BP/`**.

---

**Date:** 2026-05-20 (Entity query trace — journal Content log toggle)

- **User:** More debugging for entity checks, same journal flag as villager spawn.
- **Fix:** New **`mb_entityQueryTraceDev.js`** — `[ENTITY TRACE] RUN/SKIP` with category, reason, counts; wired through gate, **`queryEntitiesOneSpreadSection`**, mob cache, bear snapshot, spawn items, corrupt items. Hub: log trace dump + clear stats. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Overnight hitch — load defer + villager sync trim)

- **Logs:** 744ms Watchdog spike at pack load (before villagers); ongoing egg-session hitches.
- **Fix:** **`main.js`** staggers infection director, cull, item registry, telemetry to **+40t** (avoids load spike). Villager **`entitySpawn`**: pressure path = counter + timers only (no location, no finalize, mute once/tick, no standdown extend spam). Dev log watch starts on **first** villager, not at import. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager hitch fix — pressure ultra-light path)

- **Logs:** `flush pending=29`, `skipSpread=false` on `countThisTick=4` during pressure → spread pump + warn storm after stall.
- **Fix:** Pressure mode = **no** `system.run` finalize, no pending log, counter-based pressure window (no array). **Always skip spread** when pressure/session active (incl. count 4). Flush logs throttled/off under pressure; removed sync spread warn + expensive `deferPolls` in log line. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Entity quiet HUD + pressure finalize throttle)

- **User:** 30 eggs OK then hitch; `mute=0` while `vil` still high — thought queries resumed at ~5s after first egg.
- **Clarify:** Mute extends **per egg** (~5s each); pause between eggs can show `mute=0` while `vilDefer`/`pressure` still block polls. Hitch at 30 was `flush pending=27` (script backlog), not queries resuming.
- **Fix:** HUD **`entityQuiet=`** = max(per-egg mute, vil/pressure/session). Finalize throttled to every **8t** during pressure. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Post-villager entity-query mute ~5s, mining exception)

- **User:** Skip entity checks 3–5s after villager spawn; keep mining AI if mining MB present.
- **Fix:** **`extendVillagerEntityQueryMute(100t)`** on each adult villager spawn; gate blocks broad **`getEntities`** / snapshot / mob cache; **`mining*`** categories allowed when **`lastKnownMiningBearCount > 0`**. Mining AI uses **`shouldAllowMiningAiLoop()`** + cached counts during mute. **`shouldDeferVillageBurst`** includes mute. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager reentry hitch — skip spread backlog)

- **User:** 10 eggs fast OK; 1–2 eggs a few seconds later → intermittent hitch. Logs: `countThisTick=1`, `reentry=1`, `pressure=399t`, many spread lines while `deferPolls=true`.
- **Cause:** Each egg queued a **multi-tick spread job**; **reentry** forced **full 10s defer** even when pressure still active; sync path extended defer/standdown on every `entitySpawn`.
- **Fix:** Skip spread pipeline when pressure/defer/session active (record pressure inline). **Reentry** uses drip unless burst timers expired and pressure off. Coalesce spread jobs same tick. Slim `entitySpawn` path; rate-limit routine spawn logs. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager spawn log — flush was not “48 in one tick”)

- **User:** Did **not** spawn 48 eggs at once; old log `tick=27968 count=48 flush=1` was misleading.
- **Cause:** **`flush`** used **`villagerSpawnsSinceLastLog`** (all adults since last log line) but printed it as **`count=`** on **`lastBatchTick`** — looked like a 48-adult same-tick batch. **`mega=1`** could also appear on flush totals.
- **Fix:** Log **`countThisTick`** for normal defer lines; flush shows **`pending=`** + **`tickSpan=`** + **`lastBatchTick`**. **`mega=1`** only when **`countThisTick ≥ 8`**. Synced **`BP/`**; **`PERFORMANCE_DEBUG.md`** updated.

---

**Date:** 2026-05-20 (Mega-batch villager spawn — same-tick 8+ adults)

- **Fix:** **`VILLAGER_MEGA_BATCH_ADULTS` (8+)** on **`countThisTick`** → max defer on spawn tick, **no spread queue**, bulk pressure record. Ultra (16+) longer session. Per-spawn work trimmed after 12th in tick. Chunk-edge mob-cache clear skipped during session/heavy tick. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Global entity-query gate — early days + villager defer)

- **User:** Villagers should not cause this; audit every `getEntities` / snapshot path; be careful on starting days.
- **Fix:** Central **`shouldSkipExpensiveEntityQueries()`** in **`mb_entityQueryGate.js`** (villager defer, standdown, **day 0–3 + zero bears**). **`safeQueryEntitiesNear()`** gates **`queryEntitiesOneSpreadSection`**. Bear snapshot: no unscoped dimension scans on early days; **`getOrRefresh`** unified gate. Patched mining/buff/torpedo/storm/spawn metrics/telemetry/main dev list-bears. Adult baby skip unchanged. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Adult-only villager burst + logging restore)

- **User:** Baby villager eggs OK, adult eggs / many-at-once still spike; journal entity-query log seemed dead during tests.
- **Cause:** Babies share `villager_v2` but lighter vanilla AI — addon ran full burst pipeline for them too. `[ENTITY QUERY]` periodic log was **skipped entirely** while `deferPolls=true`. Log dedupe blocked flush+defer same tick.
- **Fix:** Skip addon burst for **baby** villagers (`isBaby` / `is_baby` / `ageable`). Adults only: heavier same-tick defer scaling, no mob-cache clear when batch ≥3, 10t spread slices, pressure on ≥3 adults. Entity-query log still runs during defer (~4s). `[VILLAGER SPAWN]` emitted from `finalize` (not only spread step). Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager finalize — fastPace read-only fix)

- **Bug:** `TypeError: 'fastPace' is read-only` in `finalizeVillagerSpawnBatch` when reentry tried to assign `const fastPace`.
- **Fix:** `useFullDefer = fastPace || reentrySpawn || count >= 2` passed to `applyVillagerDeferGates`. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Lazy bear AI bootstrap — addon script load on day 0)

- **User:** Vanilla world, any villager rate = no spikes; with addon = hitches. Not vanilla — **our pack**. Logs showed `deferPolls=true`, `mobSkip=true`, stale snapshots — entity sweeps already off; hitch was **addon `runInterval` overhead** (mining/flying/buff/torpedo/infected waking every 2–6 ticks even with zero bears).
- **Fix:** **`mb_bearAiBootstrap.js`** — bear AI intervals **do not register** until **day 2+** or first **MB bear** `entitySpawn`. Sync villager defer on spawn tick (before `finalize`); **reentry** forces full defer (no drip); dedupe duplicate `[VILLAGER SPAWN]` flush lines; pause perf wall-clock sample + entity-query periodic log during villager defer. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager reentry + village session — cold spawn after pause)

- **User:** 6 eggs fast sometimes fine; **2 eggs after 5s** lags; village walk-in? Scripts on day 0?
- **Cause:** After quiet gap, defer/pressure/`S` expire → next spawn **cold-starts** (mob-cache clear) while many villagers already loaded; village = same **`entitySpawn`** burst per chunk, not a scan.
- **Fix:** **`reentry=1`** when gap &gt;100t; skip mob-cache clear on reentry/session; **`VILLAGER_ADDON_SESSION`** (~20s) keeps `deferPolls`; mob-cache clear cooldown 300t. Docs updated.

---

**Date:** 2026-05-20 (Zero-bear AI sleep — no snapshot probes day 0–1)

- **User:** Still lags spawning many villagers standing still; which scripts query entities? Mining AI etc. should not run until bears/day warrant it.
- **Fix:** Day 0–1 + **0 bears** → **no 80t probe** (`isAddonBearActivityDormant` always dormant); bear AI intervals wake **1/40 ticks**; mining skips `getBearSnapshotsForDimensions` when count 0; perf mob snapshot skipped. Audit table in **`PERFORMANCE_DEBUG.md`**. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager spawn work spread pipeline)

- **User:** Spread addon work across ticks when villagers batch-spawn — not all on 1–5 ticks.
- **Fix:** After spawn batch: **defer gates immediately**; **pressure** → **mob cache clear** → **log** on separate slices every **`VILLAGER_SPAWN_WORK_SPREAD_INTERVAL` (5t)**; **`isVillagerSpawnWorkSpreading()`** blocks polls for **`S=`** window (~60t + 3t per villager). Queued batches run slices back-to-back. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Fast-paced villager eggs — batch defer on next tick)

- **User:** Slow placement OK; **&lt;1s apart** lag returns (batch load); scripts dislike batches.
- **Log:** `vilDefer=60t` on fast drip; `sync count=2` at hitch; `pressure=400t` after 4th spawn.
- **Fix:** **`entitySpawn`** only increments counter (sync); defer/pressure/**`clearMobCache`** once per tick via **`system.run`**. **&lt;20t** since last spawn → full **200t** defer (not drip). Drip extends **`until + 60t`**, not `tick + 60`. Infection + ground-decay skip during defer. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager spawn log — hitch-safe)

- **User:** During lag spikes, Content Log shows **fewer** villager spawns than eggs placed; only **1–2** lines during spike then speed returns.
- **Cause:** Batched log used **`system.run`** (next tick); engine hitch delays/skips ticks — **`entitySpawn`** may batch when simulation catches up.
- **Fix:** **`sync=1`** log on same-tick **`count≥2`**; **`flush=1`** watchdog if pending spawns &gt;3t without defer log; **`session=`** total. Documented in **`PERFORMANCE_DEBUG.md`**.

---

**Date:** 2026-05-20 (Villager recovery pressure + probe off during defer)

- **User:** Paced eggs (~0.5s) lag by 6–7 villagers; afterward **1–2** eggs still spike (sensitivity).
- **Cause:** Each egg reset full 10s defer + standdown; **80t probe** woke mining AI for snapshot passes; chunk-edge **`clearMobCache`** while flying; no quiet period after a session.
- **Fix:** **Drip extend** (+60t) when already deferred + single spawn; **pressure mode** (≥4 spawns in 30s → **20s** `pressure=` quiet, extends on more spawns); no probe during villager defer; skip mob-cache clear on chunk cross during defer/pressure; spawn log shows `pressure=` / `recent=`. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager defer — flat 10s; spawn-tick cache clear)

- **User:** Any villager spawn → **~10s** defer (vanilla batches only on village load); noticed **all scripts pause** during lag spike.
- **Change:** **`VILLAGER_SPAWN_DEFER_TICKS` = 200** on every villager/trader spawn (+20t per extra in same tick, cap 400); **`clearMobCache`** moved to **`system.run`** (next tick) when defer starts — less work on `entitySpawn`. **`isAddonBearActivityDormant`** also respects villager defer. Docs: engine hitch on same-tick bursts is **not** addon defer — game tick stalls. Synced **`BP/`**.

---

**Date:** 2026-05-20 (Villager log analysis — more dormant loop gates)

- **Log (`ContentLog2026-05-27`, L1117+):** Defer working (`deferPolls=true`, `mobSkip=true`); worst line **`count=7`** → `vilDefer=232t`. Many **`count=1`** eggs over ~2 min with **`chunkEdge=true`**. **`dormSkips`** still ~50/2s (mining/flying/torpedo wake every tick, early return only).
- **Fix:** **`mb_buffAI.js`**, **`mb_infectedAI.js`** — `isAddonBearActivityDormant()` early return; **`main.js`** ground fast/slow skip during **`shouldDeferVillageBurst`**; debug HUD shows **`batch=`** per tick; **`isHeavyVillagerSpawnTick()`** (≥5). Synced **`BP/`**.

---

**Date:** 2026-05-20 (Bulk villager spawn — batch handler; always Content Log)

- **User:** 50 villagers at once fine in **vanilla**, still spikes with addon — confirms addon per-spawn work, not vanilla AI alone.
- **Cause:** Each egg fired `clearMobCache`, standdown extend, and dev `console.warn` separately (50× in one tick).
- **Fix:** **One** cache clear + **one** `[VILLAGER SPAWN]` Content Log line per tick (`count=N`); longer defer scales with batch size; `getBearSnapshotsForDimensions` / perf mob snap / snow trail skip during villager defer.

---

**Date:** 2026-05-20 (Sprint-fly villager lag + debug HUD/log fixes)

- **Repro:** 5 villagers placed normally OK; **sprint-flying** while placing eggs → lag returns; afterward even **2** villagers hitch (recovery lag).
- **Cause:** During villager/chunk **defer**, mob cache still ran spread `getEntities` when cache empty; bear snapshot refreshed with no cache; **post-defer burst** of typed snapshot queries; chunk scans queued while flying.
- **Fix:** Defer → return empty/stale (no mob-cache build); extend **zero-bear standdown** on each villager spawn; **clearMobCache** on villager/chunk cross; skip **new chunk scan enqueue** during villager defer. **HUD** shortened (`Q0 S120 V80 d C`). **Log:** per-player interval + chat line on enable + log each villager spawn when log on.

---

**Date:** 2026-05-20 (Entity-query debug HUD — journal)

- **Journal → Debug → Entity query / village** (dev pack): HUD on action bar (bears, standdown, villager defer, skip counters) + optional Content log every 2s; Systems menu shortcut. **`mb_entityQueryDebugDev.js`**, slot **`ENTITY_QUERY`** in **`mb_actionBarHud.js`**.

---

**Date:** 2026-05-20 (Villager lag — zero-bear standdown; follow-up)

- **User:** First fix did **not** help; lag with **only 3** villager spawn eggs (not same-tick burst).
- **Root cause (broader):** With **no Maple Bears** loaded, scripts still refreshed **`mb_bearSnapshot.js`** (**21 typed `getEntities` per dimension**) every few ticks from mining/flying/torpedo/perf/metrics loops. Location-scoped queries still stress the engine when villagers are nearby.
- **Fix:** **`mb_entityQueryGate.js`** — after confirmed **0 bears**, **~10s standdown** skips snapshot/mob-cache queries; slow probe every **80t**; wake on bear spawn. **Mob cache** uses **`monster`** family only. **Any** villager/trader spawn defers heavy polls **~8s** (not ≥3 same tick). Mining/flying/torpedo/dimension-adaptation loops bail when dormant. Synced **`BP/`** via **`sync:bp-from-dev`**.

---

**Date:** 2026-05-20 (Villager bulk load — tick freeze fix, superseded in part)

- **Repro (user):** Release **beta.4**, day **0**, **LAGGY** tier — walking into a village or spawning **15–20 villagers** at once caused server tick freeze (sounds continue, blocks catch up). **50 villagers in vanilla** = fine. Cows in bulk = fine.
- **Cause:** **`mb_sharedCache.js`** mob cache queried **`families: ["mob", "villager"]`** within **128 blocks**; **`mb_miningAI.js`** also swept that cache every **20t** for target cleanup.
- **Fix (partial):** Mob cache **`mob` only** + exclude villager types; mining coordination uses **`world.getEntity(id)`**. See **2026-05-20 standdown** above for the fix that addresses **few** villagers with **0 bears**.

---

**Date:** 2026-05-19 (`sync:bp-from-dev` — merge dev scripts to release BP)

- **`tools/syncBpFromDev.js`** + **`npm run sync:bp-from-dev`**: copies all `BP - Dev/scripts/*.js` → `BP/scripts/` except **`mb_buildConfig.js`**. **`--dry-run`** supported. Documented in **`AGENTS.md`**, **`docs/releasing.md`**, ship checklist.
- Synced **`mb_propertyMigration.js`** + **`mb_snowPlacement.js`** (were line-ending-only drift).

---

**Date:** 2026-05-19 (Release assets — BP/RP only on GitHub)

- **Policy:** GitHub Release **download assets** = **`BP` + `RP`** zips only. **`BP - Dev` / `RP - Dev`** stay in the repo for Bridge/maintainers — **no** dev zips on the Release page.
- **`tools/packageRelease.js`**, **`.github/workflows/release.yml`**, **`docs/releasing.md`**, **`docs/RELEASE_BODY.md`**, **`AGENTS.md`**, **`UNRELEASED_DRAFT.md`** aligned.

---

**Date:** 2026-05-19 (Release bullets drafted — next beta)

- **`docs/development/releases/UNRELEASED_DRAFT.md`** — full player + dev + ship checklist for next beta (perf, buff dual-cap, torpedo duds, mining fixes).
- **`docs/PLAYER_CHANGELOG.md`** — **§ Unreleased (draft)** at top (no version bump).
- **`docs/development/tracking/CHANGELOG.md`** — unreleased summary; **`mb_playerChangelog.js`** file comment points at draft. Ship when user says release.

---

**Date:** 2026-05-19 (Playtest — village route, day 0, no lag)

- **User report (dev pack):** Fresh world, **day 0**, **render distance 44**, **three separate villages**. Walked back through one village to reach the next — **no noticeable lag** on that route.
- **Caveats:** Day 0 is before many systems ramp (spawn pressure, infection loops, buff bears, storms, etc.); needs **more testing** on later days and repeat passes through the same villages (prior spikes were reported around **day 20+** and heavy death/respawn loops).
- **Context:** Follows perf work (chunk-edge defer, spawn load scaling, biome checker, buff dual-cap, journal/pin menus). Treat as an early positive signal, not a full perf sign-off.

---

**Date:** 2026-05-19 (Buff bear cap — near + dimension, both required)

- **Dual caps** in **`mb_balance.js`**: **near player** (1 / 2 / 3 by player count) and **dimension-wide** higher ceiling (3 / 5 / 6). **`isBuffBearSpawnBlocked`** requires both — spawn uses `entityCounts` for near + snapshot for dimension; conversions use 64-block near + dimension + pending slots.
- **Overflow cull** trims only to the **dimension** cap (farthest first). **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Pinnable dev tools — menu refresh)

- **`mb_codex.js`:** Pinnable shortcuts reorganized to match **Developer Tools** categories (Performance, Systems, World, Bears, Storm, Infection, Codex, Debug). Added pins: **Spawn AUTO**, **Spawn HUD & spatial**, **Emulsifier**, **Biome checker**, **Force spawn**, **Bears hub**, **Developer Tools hub**. Pin UI is **category menus** instead of one flat list. **`force_spawn`** no longer migrates to spawn controller. Release **host/admin** pins (`storm`, `list bears`) work again via `pinInReleaseAdmin`. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (Biome checker — red Nether/End + action-bar HUD)

- **Nether/End** menu button is **§c** (red); list title **§cNether / End**; HUD status **§cNDIM** in Nether/End or for other-dim catalog ids.
- **Per-player biome HUD** on merged action bar (`ACTION_BAR_SLOT.BIOME_CHECKER`): live biome + LIST/SAFE/NDIM/GAP. Toggle in **Biome checker**, **Developer Tools → Systems**, and **HUD & action bar**. `initializeBiomeCheckerHudWatch()` in **`main.js`**. `formatBiomeCheckHudSegment` in sync template.

---

**Date:** 2026-05-19 (Dev menu — force spawn under Bears)

- **Journal → Developer Tools → Bears:** **Force spawn bears** moved here from **Spawn controller** hub (same category/target/distance/quantity flow; Back returns to Bears). **`BP/`** + **`BP - Dev/`** `mb_codex.js`.

---

**Date:** 2026-05-19 (Biome checker — safe-by-design vs Nether/End gaps)

- User confirmed overworld gaps (**mushroom island**, **mega taiga**, **ice mountains**, **redwood taiga** variants, etc.) are **intentional safe zones**, not omissions. Nether/End catalog ids were never added to **`mb_infected_biome_*.json`** (by design for now).
- **`tools/syncBiomeReplaceRegistry.cjs`**: **`INTENTIONAL_SAFE_OVERWORLD_BIOMES`**, **`OTHER_DIMENSION_CATALOG_IDS`**, **`getCatalogGapsOverworld()`**, **`isIntentionalSafeOverworld()`**; at-feet status **Safe by design** / **Other-dim id**.
- **`mb_biomeCheckerDev.js`**: hub shows three counts; menus **Safe by design**, **Review gaps**, **Nether/End**; sample grid **§bSAFE** tag. Regenerated **`mb_biomeReplaceRegistry.js`** in **`BP/`** + **`BP - Dev/`**.
- **`docs/design/SAFE_BIOMES.md`**: explicit safe-by-design table + Nether/End note.

---

**Date:** 2026-05-25 (MBA items plan — purify Mining Maple Bear Claw)

- **`docs/design/MBA_ITEMS_MASTER_PLAN.md`** v0.3: **Mining Maple Bear Claw** is purifiable (golden apple → **`mb:mining_maple_bear_claw_purified`**). Unpurified claw can rarely place **`mb:snow_layer` when mining**; purified claw **never** places snow on break. Repair purified with **Purified Dense "Snow"**. Journal purification page + claw entry append; codex **`miningMapleBearClawPurifiedSeen`**. Planning only.

---

**Date:** 2026-05-25 (MBA items & loot — master plan doc)

- **Planning only** (no BP/RP/scripts yet): custom gear and loot expansion spec **`docs/design/MBA_ITEMS_MASTER_PLAN.md`** (v0.2). Indexed in **`docs/README.md`**.
- **Gear:** Buff Bear Arm (1200 dur, extra knockback, random snow-on-hit; golden apple → purified arm, repair with Purified Dense "Snow"); Mining Maple Bear Claw (diamond mine speed except `UNBREAKABLE_BLOCKS`, iron-tier combat, anti-MB); Torpedo Spine (5 throws, blast damages **all** mobs in radius, dust; golden apple → cured, no dust); wing membrane → slow-fall brewing.
- **Materials:** snow block / dense snow / purified dense snow / dense snow block (TBD) chain — **no maple fuzz**. Tiny bears: no new drops; infected: low dense snow only.
- **Codex:** `mapleBearGearPurificationKnown` + per-item journal entries with purification appendices; torpedo dud spine drop rates tied to existing **`mb_torpedo_dud`** (5%); fizzle sound **`mb.torpedo_dud.fizzle`** TBD from maintainer.

---

**Date:** 2026-05-25 (Mining bears — more snow while digging)

- Mining bears leave snow more often: trail chance **0.28 / 0.38** (was 0.1 / 0.15), trail cooldown **15t** (was 40t). Each broken block also rolls **32% / 42%** to place `mb:snow_layer` on the floor column (`tryPlaceSnowLayerNearBreak` in **`mb_snowPlacement.js`**). Shared trail helper extracted from **`main.js`**. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-25 (Torpedo duds — 5% + dev force spawn)

- **5%** of torpedo bears (`mb:torpedo_mb`, `mb:torpedo_mb_day20`) spawn as **duds** (`mb_torpedo_dud` dynamic property), rolled once on **`world.afterEvents.entitySpawn`** in **`mb_torpedoAI.js`** (covers natural spawn, conversion, eggs, dev summon).
- Dud deaths skip explosion particles, explode sound, and snow ring in **`main.js`**; play **`torpedo_mb.death`** only. Block-budget exhaustion kills duds quietly (no blast) in **`checkTorpedoExhaustion`**. **`TORPEDO_DUD_CHANCE = 0.05`**; exports **`isTorpedoDud`**, **`isTorpedoBearTypeId`**, **`markTorpedoAsDud`**.
- **Dev:** Journal → Force spawn → **Torpedo bears** → **Torpedo (dud)** / **Torpedo (day 20, dud)**; **`force_spawn`** accepts trailing **`dud`** arg. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-20 (mining bear stair stall fix)

- Logs `Skipped movement after stairs - step not ready` with `hasClearedSpace=false`, `cleared=0`: movement branch did nothing when step blocked + mining budget throttled. **`mb_miningAI.js`:** else path now mines headroom/forward blocks when budget allows and **always** applies forward/up nudge (`dy>1.2`). Mirrored **`BP/`**.

---

**Date:** 2026-05-20 (dev Biome checker UI)

- **`mb_biomeReplaceRegistry.js`** (from `tools/syncBiomeReplaceRegistry.cjs` reading infected biome JSON) + **`mb_biomeCheckerDev.js`**. Journal → Developer Tools → Systems → **Biome checker**: at-feet status, missing vanilla ids (13 vs catalog: mushroom, mega_taiga, nether/end, etc.), browse replace groups, NSEW sample, Content Log dumps. `npm run sync:biome-registry`.

---

**Date:** 2026-05-20 (spawn feel balance for staggered chunk scans)

- User: slower scans must **compensate** so bear spawn feel matches before. **`mb_spawnController.js`:** player-chunk queue **priority 100** + sooner schedule; **16-block** quick tile scan with extra budget when full scan deferred; progressive quadrants start **under player**; **`THROTTLED_SCAN_SPAWN_*`** (82% initial, 3s ramp) + tile-density chance/attempt boost when `isChunkScanThrottledForSpawn`; fixed erroneous `return shouldSkipScan` from tile collector. Mirrored **`BP/`**.

---

**Date:** 2026-05-20 (village / chunk-edge performance pass)

- User repro: **solo village entry** lag with pack on, smooth with pack off. **`mb_workSpread.js`:** `tickPlayerChunkEdgeWatch`, **120t** defer after 16-block chunk cross, days **2–3** **4×** entity spread, defer bumps spread to **4×** during edge window. **`mb_spawnController.js`:** solo **chunk queue** + progressive quadrants on new visit; slower stagger (`getVillageScanStaggerTicks`), **1** scan/enqueue per tick, lower `queryLimit` on new/defer chunks. **`main.js`**, **`mb_biomeAmbience.js`**, **`mb_sharedCache.js`**, **`mb_bearSnapshot.js`**, **`mb_spawnLoadMetrics.js`** honor defer/spread. Mirrored **`BP/`**; **`PERFORMANCE_DEBUG.md`** updated.

---

**Date:** 2026-05-20 (script performance roadmap — phases A–E)

- **`docs/development/PERFORMANCE_OPTIMIZATION_ROADMAP.md`**, **`CURSOR_SDK.md`**, doc index links. **`main.js`:** infection 40t only; inventory discovery 120t + single-pass scan + skip when codex complete; biome discovery separate interval + cached underfoot block. **`mb_spawnController.js`:** tile `getBlock` cache, emulsifier fast exit, chunk queue enqueue cap (3/tick). **`mb_workSpread.js`:** soft metrics spread day 2+; **`mb_spawnLoadMetrics.js`** + **`mb_performanceProfile.js`** load-linked AI stretch. Mirrored **`BP/`** ↔ **`BP - Dev/`** (except `mb_buildConfig.js`). **`node tools/testAllScripts.js`** 94 OK.

---

**Date:** 2026-05-20 (Releases: BP+RP only; dev build config guard)

- **`tools/packageRelease.js`**: GitHub Releases attach **`BP/`** + **`RP/`** zips only (no dev assets). **`tools/verifyBuildConfig.js`** + **`npm run verify:build-config`**; dev **`mb_buildConfig.js`** runtime misconfig log. **`BP - Dev`**: `INCLUDE_FULL_DEVELOPER_TOOLS = true` enforced.

**Date:** 2026-05-19 (GitHub Releases CI — pack folder zips, Bridge for .mcpack)

- Tag **`v*`** → **`.github/workflows/release.yml`**: validate, package, **`docs/RELEASE_BODY.md`**, **`docs/releasing.md`**, **`tools/getVersion.js`**.

**Date:** 2026-05-19 (GitHub Releases CI — initial .mcpack attempt, superseded)

- First CI draft built `.mcpack` in Actions; replaced by folder zips per maintainer preference.

---

**Date:** 2026-05-19 (release — v0.9.0-beta.4)

- Shipped **beta.4** after user playtest (lag, buff cap, death explosions). **`ADDON_VERSION_PRERELEASE`** → **`beta.4`**; **`PLAYER_CHANGELOG_VERSION`** → **`0.9.0-beta.4`**; **`npm run sync:pack-metadata`**; **`docs/PLAYER_CHANGELOG.md`**, **`mb_playerChangelog.js`** (both packs), **`docs/development/releases/v0.9.0-beta.4.md`**, smoke checklist row. Tag **`v0.9.0-beta.4`** for GitHub Release (public **`BP/`** + **`RP/`**).

---

**Date:** 2026-05-19 (buff death explosion restored)

- Death burst was gated on **`BUFF_SPAWN_TIME`** (only bears within 64 blocks of a player when AI ran). Removed that gate; still skip only **`mb_conversion_spawn`** tag (instant conversion pop, not real deaths). **`mb_buffAI.js`**. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (storm conversion buff cap — dimension-wide + pending fix)

- Storm mass-convert still spawned unlimited **`mb:buff_mb_day20`**: pending slots released in **`finally`** before the next queued **`system.run`**, and cap only counted buffs within 64m. Fix: **dimension-wide** buff count, max from **players in that dimension**, pending held until **next tick** (`system.run` release). Solo world → at most **one** buff from conversions per storm wave; rest **infected**. **`mb_mainMobConversion.js`**.

---

**Date:** 2026-05-19 (conversion buff cap — single spawn gate)

- **All** mob→bear conversions now spawn through **`spawnConversionEntity`** → **`clampSpawnTypeForBuffCap`** (bear kill, storm, any path). Cap uses full **`getEntities`** count (not spread-throttled), same 1/1/2/3 player rule as spawn, plus **pending** reservations so multiple kills same tick cannot stack buffs. Over cap → **infected** tier for current day. **`mb_mainMobConversion.js`**. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (storm kill: bear attribution on entityDie)

- Buff bear + storm kills still ran **storm conversion** because `entityDie` often has **no `damagingEntity`** (storm flag set, bear gets credit on hurt only). Fix: **`LAST_MB_KILLER_BY_VICTIM`** on `entityHurt`, `resolveMapleBearKillerForConversion` / `wasMapleBearInvolvedInKill` — storm skipped when a bear hit the victim recently. Storm log now prints real **`typeId`** (not generic “Maple Bear”). **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (storm + bear kill double conversion fix)

- Iron golem (etc.) killed by a **buff bear in a storm** ran **both** `handleMobConversion` and `handleStormMobConversion` — storm path always rolled large→buff. Storm conversion now **skipped when killer is any Maple Bear type** (`isMapleBearKillerType`). **`main.js`**, **`mb_mainMobConversion.js`**. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (buff death explosion + conversion cap fixes)

- **Death explosion:** only for buff bears Buff AI was already tracking; **not** fresh `mb_conversion_spawn` tags (mob conversions). Stuck fuse unchanged. Fixed backdated spawn time that let conversion spawns stuck-explode immediately. **`mb_buffAI.js`**
- **Conversion buff cap:** `getMaxBuffBearsForNearbyPlayerCount` (same 1/1/2/3 as spawn); conversions **downgrade to infected** when capped instead of spawning more buffs. **`mb_balance.js`**, **`mb_mainMobConversion.js`**, **`mb_spawnController.js`**. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (buff bear death explosion + buff-kill conversion)

- **Buff bears** explode on death (same powder/block burst as stuck fuse; requires Buff AI script toggle). **`mb_buffAI.js`**
- **Buff bear mob kills** use **`resolveSizedMobKillConversion`** (victim tiny → tiny MB, large → buff, normal → infected for current day) — not flat `mb:mb_day00`. **`mb_mainMobConversion.js`**. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (entity queries — 3×3 sections around players)

- **`mb_workSpread.js`:** `queryEntitiesOneSpreadSection` / `SPREAD_CELL_RADIUS` (32) + 9-cell XZ grid around each anchor. **Mob cache:** one player × one cell per tick on day 0–1 (not one 128-block sphere). **Bear snapshot:** spread refresh = 3 types × one cell near players per call; day 2+ uses player-anchored 96-block queries (no full-dimension sweep when players present). **Mob conversion** / **buff debug scan** use spread helper. **Item metrics** incremental cells when spread active (day 2+ path). **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (day 0–1 work spread — `mb_workSpread.js`)

- First village / fast chunk load spikes: new **`mb_workSpread.js`** (8× intervals on day 0–1). Staggered: mob cache one player anchor per tick (MP), bear snapshot one dimension per call + 240t empty TTL, no `findClosestBiome`, snow trail/biome/ground/dim-adapt/metrics/HUD spread, deferred perf/spawn-load init. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (village lag — round 2)

- Still spiking at villages after round 1: fixed **spawn controller** `getEntityCountsForPlayer` / batch (was `getEntities` all types in ~45–200 block radius → villagers/items). Now **`countMbBearsNearPosition`** via bear snapshot. **Mob cache** excludes item/xp_orb/etc. **Bear snapshot** empty TTL 40t. **Item metrics** near players only. **Mining pathfind** entity lookup scoped. **Biome** `findClosestBiome` cooldown 1200t, smaller box. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (village lag — dimension adaptation + mob cache)

- **`mb_dimensionAdaptation.js`:** main loop uses **`getBearSnapshotsForDimensions`** instead of `dimension.getEntities()` (no full-world entity sweep). **`mb_sharedCache.js`:** mob cache refresh = one **`getEntities({ families, location, maxDistance: 128 })`** per player in dimension (deduped); empty when no players. Mining AI coordination cleanup uses player anchors (not 0,0 / 1000). Mirrored **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (village / new-chunk lag — code audit)

- User repro: spike reaching a **village** after **new terrain** (pre–Mid-default pack). Audit: spawn main loop **off** `day < 2`; likely addon + vanilla chunk/entity load. Top suspects: **`mb_dimensionAdaptation.js`** `dimension.getEntities()` unfiltered every 100t × 3 dims; **`mb_sharedCache.js`** `families: mob,villager` full-dimension refresh every 2t when mining AI runs; **`main.js`** `findClosestBiome` fallback per chunk; **`mb_biomeAmbience.js`** `getBiome` every 60t; day 2+ **`mb_spawnController`** chunk/block scans. See chat / `docs/development/PERFORMANCE_DEBUG.md`.

---

**Date:** 2026-05-19 (default lag tier = Mid)

- **Journal lag default** is now **Mid** (level 2): `DEFAULT_LAG_COMFORT_LEVEL`, `ensureWorldLagComfortDefaults()` on world load/migration when never set. Wizard **Default** button applies Mid; **Full auto** is advanced. Base scan settings = `lowLag` preset; spawn auto-combo tiers favor `low` + `lowLag`. Mirrored **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-05-19 (spawn + chunk scan — spread work over time)

- **`mb_spawnController.js` (`BP/` + `BP - Dev/`):** Wired **`progressiveBlockScanCache`** so discovery resumes across ticks instead of one-shot 6k queries. MP: removed “always process player 0” fallback; max **1** spawn player per controller tick; tight groups scan **one member per tick** (rotating). Chunk queue depth lowers per-tick block budget; cleanup stale partial scans. Docs: **`SPAWN_SYSTEM_EXPLANATION.md`**, **`PERFORMANCE_DEBUG.md`**.

---

**Date:** 2026-05-19 (config templates + day 0–1 perf mitigations)

- **Bridge config:** [`config/dev/bridge.json`](../../config/dev/bridge.json), [`config/release/bridge.json`](../../config/release/bridge.json), [`config/README.md`](../../config/README.md); [`tools/copyBridgeConfig.js`](../../tools/copyBridgeConfig.js) + `npm run bridge:config:dev|release` (optional `:sync` names from `mb_buildConfig.js`). Root `config.json` unchanged unless you run a script.
- **Lag playbook:** [`docs/development/PERFORMANCE_DEBUG.md`](development/PERFORMANCE_DEBUG.md).
- **Scripts (`BP/` + `BP - Dev/`):** spawn load metrics skip bear/item `getEntities` sweeps when `getCurrentDay() < 2`; `getBiomeIdAt` throttles/shrinks `findClosestBiome`; spawn scan perf HUD uses 40t cache only; chunk scan queue caps **2** full scans/tick + defers when queue deep; infection loop uses one `playersById` map per tick.

---

**Date:** 2026-05-19 (journal dev access — scripts only)

- **`mb_codex.js` (`BP - Dev/` + `BP/`):** `hasJournalPowerToolsAccess()` — when `INCLUDE_FULL_DEVELOPER_TOOLS` is true (dev pack), **Developer Tools** / **Debug** show for any player without `mb_cheats`. Release build unchanged: Host tools still need `mb_cheats` or Litbolt123. Bridge `config.json` left to user; `sync:pack-metadata` does not rewrite pack paths.

---

**Date:** 2026-05-17 (world setup — no experiments on 1.26.2+)

- **Playtest:** Infected custom biomes work on **Bedrock 1.26.2** with **no world experiments** (Custom Biomes off). **`docs/development/WORLD_SETUP.md`** is canonical; README, TODO, Patreon/Discord prompts, ADDON_SYSTEMS, PROJECT_STATUS, DEVELOPER_ONBOARDING updated. Old “enable Custom Biomes” guidance retired for 1.26.2+.

---

**Date:** 2026-05-17 (Bridge export name + version sync + GitHub rename prep)

- **Pack display name:** **The Maple Bear Apocalypse** in `BP/RP` manifests, `config.json` (`simpleRewrite.packName`), `PACK_DISPLAY_NAME` in `mb_buildConfig.js`.
- **`npm run sync:pack-metadata`** (`tools/syncPackMetadata.js`) — bumps manifest `header.name`, description with full semver, `header.version` `[0,9,0]` from build config.
- **GitHub:** `package.json` URLs → `Maple-Bear-Apocalypse`; rename steps in `docs/development/GITHUB_RENAME.md` (web/CLI — not run from agent).

---

**Date:** 2026-05-17 (rebrand — M.B.A / Maple Bear Apocalypse)

- **Canonical names:** **M.B.A** = **Maple Bear Apocalypse**; *Maple Bear Takeover* archived. **`docs/marketing/NAMING.md`**; updated README, AGENTS, package.json, DESIGN_VISION banner, Patreon + Discord Comet prompts.

---

**Date:** 2026-05-17 (Discord — Comet server prompt)

- **`docs/marketing/DISCORD_SERVER_COMET_PROMPT.md`:** Paste-in prompt for Comet AI — channels, roles, rules, FAQ, tone, placeholders, anti-impersonation / spoiler notes; links Patreon `[DISCORD_LINK]` when live.

---

**Date:** 2026-05-17 (build config docs — dev vs release gating)

- Clarified **`mb_buildConfig.js`**: public **`BP/`** only gates Host tools (`INCLUDE_FULL_DEVELOPER_TOOLS` false); **`BP - Dev/`** must keep full dev true and is never shipped. **`AGENTS.md`** release/merge notes updated.

---

**Date:** 2026-05-17 (release — Host tools / dumbed-down admin)

- **Public `BP/`:** Journal **Host tools** (was full Admin menu) for `mb_cheats` / Litbolt123 — minor storm + end all, enable dust if off, spawn tiny/infected only (1–3, near self), list bears, pin journal sections only. No dev pins, no storm override/multi/major, no spawn-controller path. **`mb_buildConfig.js`:** `isReleaseAdminBuild()`, allowlist + cap; **`main.js`** enforces on `force_spawn` / `summon_storm`. Dev pack unchanged (full Developer Tools when `INCLUDE_FULL_DEVELOPER_TOOLS`).

---

**Date:** 2026-05-17 (release journal — dev pin leak fix)

- **`mb_codex.js` (`BP/` + `BP - Dev/`):** `getPinEligibleDevItems()` wrongly treated `INCLUDE_ADMIN_TOOLS` like full dev and exposed **all** pinnable dev tools on the public pack; with `mb_cheats` / Litbolt123, pins could open Spawn Controller and other dev menus. Fixed: release admin only **`pinInReleaseAdmin`** items (storm hub, list bears); `sanitizePinnedDevItems()` on journal open; `openSpawnControllerMenu()` hard-blocks when `INCLUDE_FULL_DEVELOPER_TOOLS` is false.

---

**Date:** 2026-05-17 (Patreon — dread section + Comet archive)

- **`docs/marketing/PATREON_FIRST_POST_DRAFT.md`:** Added **The feeling of dread** section (slow-burn / ambient horror, no jumpscares; time pressure, false safety, world watches back, powder, co-op blame, death persists). Archived Comet browser export verbatim with diff table; note Comet used **Maple Bear Apocalypse** vs repo **Takeover**.

---

**Date:** 2026-05-17 (Patreon — first post draft)

- **`docs/marketing/PATREON_FIRST_POST_DRAFT.md`:** Player-facing welcome + vision/roadmap teaser + beta honesty (v0.9.0-beta.3), co-op/journal highlights, light Patreon ask; Comet placeholders for media/links/tiers. Includes About blurb, social teaser, five tags.

---

**Date:** 2026-05-17 (GitHub releases guide — near-term backlog)

- **`docs/development/github-versioning-releases-agent-guide.md`:** Kept as the canonical **agent/human playbook** for SemVer, `v*` tags, Actions, and Releases (written for MSBuild/.NET; **implementation deferred** — adapt guardrails to **`mb_buildConfig.js` / manifests**).
- **Tracked for implementation:** new **Near-term — GitHub versioning & releases** section + checkbox in root **`TODO.md`**; **`docs/development/PROJECT_STATUS.md`** near-term bullet; index row in **`docs/README.md`**.

---

**Date:** 2026-05-16 (release sync check — Compoohter / MrPoohter commits)

- Verified **MrPoohter** (`dascompoohterzucker90@gmail.com`) last **four** commits on `main`: **`9833cd4`** (larger `pack_icon.png` in all four pack roots), **`7374e41`** (root **`package.json`** / **`package-lock.json`** rename only), **`085775e`** (all four **`manifest.json`** — addon rename / authors), **`fbb03f8`** (first `pack_icon` refresh). Each commit that touched packs already updated **`BP/`** + **`RP/`** alongside **`BP - Dev/`** + **`RP - Dev/`** — no extra copy step needed for release trees for that work.
- Spot-check: **`BP/pack_icon.png`** ≡ **`BP - Dev/pack_icon.png`** and **`RP/pack_icon.png`** ≡ **`RP - Dev/pack_icon.png`** (SHA256 match). Public manifests correctly keep release naming (**`M.B.A`**) vs dev (**`M.B.A (Dev)`**).

---

**Date:** 2026-04-29 (release label — v0.9.0-beta.3)

- **`ADDON_VERSION_PRERELEASE`** → **`beta.3`** (stay on **0.9.0**); **`PLAYER_CHANGELOG_VERSION`** → **`0.9.0-beta.3`**; all four **`manifest.json`** descriptions and **`docs/PLAYER_CHANGELOG.md`** + **`mb_playerChangelog.js`** (both **`BP/`** and **`BP - Dev/`**) aligned. Smoke checklist row added for beta.3.

---

**Date:** 2026-04-30 (bear cull — per-type dev control)

- **`mb_bearCullDev.js`:** World JSON **`mb_dev_bear_cull_enabled_types`** (array of `typeId`s from **`ALL_MB_BEAR_TYPES`**) overrides which bears can be culled; unset = pack default (tiny + infected). **`getBearCullEligibleTypeSet()`**, **`BEAR_CULL_TYPE_GROUPS`** for journal submenus, **`DEFAULT_PACK_BEAR_CULL_TYPE_IDS`**. Cleared with other dev cull keys on reset.
- **`mb_bearPopulationCull.js`:** Cull batch uses **`getBearCullEligibleTypeSet()`** each pass; log line includes enabled type count.
- **`mb_codex.js`:** Bear cull dev menu — **Per-type eligibility** (6 groups: tiny, infected, buff, flying, mining, torpedo) with per-variant toggles; main screen shows **eligible types X/21**. **`BP/`** + **`BP - Dev/`**.

---

- **`mb_bearCullDev.js`:** World overrides (`mb_dev_bear_cull_*`) merge with **`mb_balance.js`** defaults; **`getBearCullEffectiveParams()`** used by **`mb_bearPopulationCull.js`**. Cull loop polls every **20t** but respects editable **interval** between passes.
- **`mb_codex.js`:** Journal **Developer Tools → Performance → Bear cull tuning (dev)** — summary, **Reset pack defaults**, modal sliders (trigger/target/removals/urgent/distances/interval). Dev pack + pin list only **`bear_cull_dev`** when dev flavor. **`BP/`** + **`BP - Dev/`**.
- **`mb_devScriptSelfTest.js`:** Dynamic import list **`+mb_bearCullDev.js`**.

---

**Date:** 2026-04-30 (bear population cull — 80 threshold, tiny/infected only)

- **`mb_balance.js`:** Cull activates when global Maple Bear count **> 80** (was 200); works toward **68** total; **6** removals max per **40t** pass (was 4). **Urgent** distance relax at global **> 140** (was 360). **`BP/`** + **`BP - Dev/`**.
- **`mb_bearPopulationCull.js`:** Only **tiny** (`mb:mb_day*`) and **infected** family (`mb:infected*`, pig/cow) are eligible; **buff / flying / mining / torpedo** are never culled here. Same distance rules (≥**56**m normal, ≥**28**m urgent), thrall skip unchanged. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-04-30 (storms — player-distance lite mode)

- **`mb_snowStorm.js`:** If **no overworld player** is within **200** blocks (horizontal) of a storm center, that storm skips **particles** and **snow placement** (and clears pending snow), drifts **less often** (`200t` vs `20t`), and only refreshes **center Y** from terrain every **100t**. Lifecycle (end tick, cooldown, player blindness when inside radius, etc.) unchanged. **Mob damage** and **major destruct** were already gated by a player within **96** blocks of the storm center. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-04-29 (mining AI — pathfinding cleanup lookup)

- **`mb_miningAI.js`:** Pathfinding cleanup interval no longer scans **3 dimensions × 8 entity types × all matching entities** per tracked pathfinding state to see if an entity still exists; it uses **`world.getEntity(entityId)`** + **`isEntityValid`**. Same cadence (**100t**), far cheaper on busy worlds. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-04-29 (sim players — debug heartbeat)

- **`mb_simPlayers.js`:** Throttled `[SIM PLAYERS]` Content Log line **does not run** when **`mb_sim_players_count` is 0** (no ghost clients): avoids warning spam every 100t while sims stay enabled but idle. **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-04-29 (codex — storm hub concurrent max wording)

- **`mb_codex.js`:** Storm hub **Settings** line no longer reads like a global “max one storm” — it shows **Concurrent max X/3** (configured limit vs hard cap). **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-04-29 (self-test Content Log text)

- **`mb_devScriptSelfTest.js`:** Replaced broken UTF-8 / replacement-character sequences in Quick + Full harness strings with **ASCII-safe** punctuation (`|`, `->`, `:`, `ch x`, etc.) so **Content Log** no longer shows `` for day/infection, spawn load, dust storm before/after, and related lines. Mirrored **`BP/`** ↔ **`BP - Dev/`**.

---

**Date:** 2026-04-29 (storms — canopy pass-through for spawn check)

- **`mb_blockLists.js`:** **`isStormSkyPassThroughBlock(typeId)`** — **`STORM_PARTICLE_PASS_THROUGH`** ∪ any type id containing **`leaves`** so forest canopies (e.g. dark oak) don’t block **`isOutdoorStormColumn`** in **`mb_snowStorm.js`**. **`SNOW_STORM_DESIGN.md`**. Mirrored **`BP/`** ↔ **`BP - Dev/`** (`mb_blockLists.js`, `mb_snowStorm.js`).

---

**Date:** 2026-04-29 (storms — cooldown + outdoor spawn)

- **`mb_snowStorm.js`:** Shorter **post-storm cooldown** (`BASE_COOLDOWN_*`, `COOLDOWN_DAY_20_TICKS`). **`tryPickOutdoorStormCenter`** / **`isOutdoorStormColumn`** — storm centers need ~**28** blocks of open column above surface so eyes **don’t** spawn on **cave ceilings**; **`startStorm`** returns false if no valid site / **`summonStorm`** retries angles. **`mb_codex.js`** storm blurb mentions open sky. **`SNOW_STORM_DESIGN.md`**. Mirrored **`BP/`** ↔ **`BP - Dev/`**.

---

**Date:** 2026-04-29 (storms — difficulty days + codex)

- **`mb_snowStorm.js`:** **`getStormStartDay()`** — **Hard** day **2**, **Normal** day **4**, **Easy** day **6**; retained higher **`BASE_START_CHANCE`** / **`CHANCE_SCALE_PER_DAY`**, **`STORM_MAJOR_UNLOCK_DAY`** (minors through day 10; majors day 11→19; day 20+ majors only). **`mb_codex.js`** **Biomes → Infection Storm** documents schedule + tiers; **`SNOW_STORM_DESIGN.md`**, **`INFECTION_SYSTEM.md`**, **`PLAYER_CHANGELOG.md`**, **`mb_playerChangelog.js`**. Mirrored **`BP/`** ↔ **`BP - Dev/`**.

---

**Date:** 2026-04-29 (follow-up)

- **Snow placement logging:** Completion line after a placement wave (`Placement: … placed, … attempts`) now logs **only** when **snow_storm → placement** (or **all**) debug is enabled — avoids Content Log spam when a wave places **0** snow (e.g. storm center far from loaded chunks / no valid surfaces near players). Same change **`BP/`** + **`BP - Dev/`**.

---

**Date:** 2026-04-29

- **Storm work spreading (`mb_snowStorm.js`):** Active storm loop uses **`runInterval(1)`** with **`currentTick % 10`** phases **`0 / 2 / 4 / 6 / 8`** so intersections + players (phase 0), particles (2), snow placement with **`_snowPending`** batches (4), mob damage with per-storm cooldown + iteration cap (6), and major destruct slicing + break cap (8) never all run in one tick. **`spawnParticle`** preferred over **`runCommand`** for white dust particles. **`SNOW_STORM_DESIGN.md`** documents the model; **`BP/`** and **`BP - Dev/`** mirrored.

- **Version alignment (beta.2):** `ADDON_VERSION_PRERELEASE` + `PLAYER_CHANGELOG_VERSION` + all four pack **manifest descriptions** stay on **v0.9.0-beta.2**; `AGENTS.md` checklist now calls that out; `BETA_SMOKE_CHECKLIST.md` has a **beta.2** row; `mb_buildConfig.js` comments note sync with changelog/manifests (`BP/` + `BP - Dev/`).
- **Infection Phase 4 (ship checklist):** Journal **Biomes → Infection Storm** — onboarding paragraphs **Pressure over time** + **Shelter & reclaim** (emulsifier detox bubble blocks natural Maple Bear spawns in-field). **`PLAYER_CHANGELOG_VERSION`** → **0.9.0-beta.2**; `docs/PLAYER_CHANGELOG.md` + `mb_playerChangelog.js` What's new. Spec: [INFECTION_MOD_PHASE4_SHIP_SPEC.md](development/planning/INFECTION_MOD_PHASE4_SHIP_SPEC.md). Game plan Phase 4 marked shipped. Mirrored `BP/` ↔ `BP - Dev/` (`mb_codex.js`, `mb_playerChangelog.js`).
- **Infection Phase 3 (director):** `mb_infectionDirector.js` — named tiers **scout / pressure / surge / stormfront** from **day bands** (1–7 / 8–14 / 15–19 / 20+); **`load01`** from `mb_spawnLoadMetrics` can escalate **one** tier (capped). Applies spawn **chance** multiplier + **extra attempts** at surge/stormfront in `mb_spawnController.js`. **`initializeInfectionDirectorWatch()`** in `main.js` — action-bar toast when **day band** advances (cooldown). Constants in `mb_balance.js`. Self-test **+1** module + director line in harness. Spec: [INFECTION_MOD_PHASE3_DIRECTOR_SPEC.md](development/planning/INFECTION_MOD_PHASE3_DIRECTOR_SPEC.md). Mirrored `BP/` ↔ `BP - Dev/`.
- **Infection Phase 2 (storm-center reservoir):** `mb_snowStorm.js` — `getStormReservoirSpawnChanceMult` applies up to **+8%** natural spawn chance when near an active storm eye (Overworld), tunable via `STORM_RESERVOIR_*` in `mb_balance.js`; wired in `mb_spawnController.js`. Spec: [INFECTION_MOD_PHASE2_RESERVOIR_SPEC.md](development/planning/INFECTION_MOD_PHASE2_RESERVOIR_SPEC.md). Mirrored `BP/` ↔ `BP - Dev/`.
- **Infection Phase 1 (storm-touch spawn):** `mb_exposureSpawnPressure.js` — storm exposure (`groundExposureState.stormSeconds`) scales natural Maple Bear spawn **chance** up to **×1.15** (`registerStormSecondsForSpawnPressure` in `main.js`, `getStormTouchSpawnChanceMult` in `mb_spawnController.js`). Self-test imports +1. Mirrored `BP/` ↔ `BP - Dev/`. [Spec](development/planning/INFECTION_MOD_PHASE1_STORM_TOUCH_SPEC.md).
- **Infection roadmap + Phase 0 (docs):** [game plan](development/planning/INFECTION_MOD_GAME_PLAN_2026-04-29.md) (phased, after [concept audit](development/planning/INFECTION_MOD_CONCEPT_AUDIT_2026-04-28.md)); [Phase 0](development/planning/INFECTION_MOD_PHASE0_2026-04-29.md) — pitch, provisional gates, engine touchpoints, Phase 1 option reminder. Indexed in `docs/README.md`. No `BP/scripts` changes.
- **Sim players Content Log debug:** world property `mb_sim_players_debug` + Journal **Simulated players → Content log debug** (`mb_simPlayers.js`). When dev pack + sims enabled, throttled `console.warn` every 100t: `[SIM PLAYERS]` real/sim/merged counts, full stress, orbit radius, anchor→sim0 horizontal distance. **Debug Menu → Simulated players** mirrors the same toggle (`mb_codex.js`). Mirrored `BP/` ↔ `BP - Dev/`.
- **Sim ghosts vs unloaded chunks:** `mb_spawnController.js` skips simulated players on a dimension tick when the ghost’s feet are not in a loaded chunk (`getBlockSafe`); `attemptSpawnType` suppresses `[SPAWN ERROR]` for sims on `LocationInUnloadedChunkError`. Mirrored `BP/` ↔ `BP - Dev/`.
- **`getAllPlayersIncludingSim()`:** added in `mb_simPlayers.js` — canonical merge of `world.getAllPlayers()` plus ghost sims when `mb_sim_players` is on (same rules as `getCachedPlayers()`). Exported `isSimulatedPlayer(p)` for real-only branches. `mb_sharedCache.js` now calls this helper; spawn stress merge delegates to it when full stress is enabled. Mirrored `BP/` ↔ `BP - Dev/`.
- **Sim “full stress” (dev-only):** world flag `mb_sim_players_full` + Journal toggle **Full stress** (`mb_codex.js`). When **`INCLUDE_FULL_DEVELOPER_TOOLS`** is true, `isSimFullBehaviorEnabled()` enables (1) **`syncSimPlayerInfectionEntries` / `tickSimulatedPlayerInfection`** in `main.js` — each ghost sim id `sim:N` gets a **minor** `playerInfection` entry with timer decay on the normal infection interval and reseed when it hits zero (no cough/transform/codex side effects); when full stress is off, `sim:` keys are removed from the map. (2) **`mergeSimPlayersForSpawnStress`** in `mb_spawnController.js` — ghost sims are merged into player lists used for spawn-auto / load counts. Release `BP/` ignores full stress because `isSimFullBehaviorEnabled()` is false without dev tools. Mirrored `BP/` ↔ `BP - Dev/`.
- **Sim players dev HUD + visibility:** new merged action-bar slot `ACTION_BAR_SLOT.SIM_PLAYERS` (`mb_actionBarHud.js`) with a per-player toggle in **Journal → Developer Tools → HUD & action bar** (`mb_dev_hud_sim_players`). `mb_simPlayers.js` refreshes a compact `Sim` line (count, dim mode, pattern, radius, speed, nearest in-world distance, marker state) and optional **world** `mb_sim_players_markers` particle markers at ghost positions (addon `mb:white_dust_particle`); sims are still not real entities—markers/HUD are the intended “see them” path. Sim menu gained a **Particle markers** toggle. Mirrored `BP/` and `BP - Dev/`.
- **Sim markers fix + stress entities:** marker particles now use **`mb:white_dust_particle_short`** (the long-lived `mb:white_dust_particle` emitter runs ~6s and looked like a ring). Optional **stress** toggles spawn **`minecraft:chest_minecart`** and/or **`minecraft:armor_stand`** per sim index (teleported every tick, minecarts filled with stacks + bundle attempts, stands get netherite+shield); world props `mb_sim_stress_chest_minecarts` / `mb_sim_stress_armor_stands`. Dev builds only (`INCLUDE_FULL_DEVELOPER_TOOLS`).

---

- **Script self-test:** After syncing the pack, Content Log shows **44** `BP` dynamic-import files (includes `mb_infectionDirector.js`) and **All 44 modules import OK**; **Full** harness still **21/21** spawns, **0** fails.

**Date:** 2026-04-28

- **Dev tool: simulated players (solo perf testing):** added `mb_simPlayers.js` (ghost players that orbit/jitter around an anchor) + a **Developer Tools** menu entry to enable/configure count/pattern/dimensions via world properties (`mb_sim_players*`). `getCachedPlayers()` now returns **real + simulated** players, so AI loops and cached per-dimension player positions can scale as if multiple players are present. Also fixed `mb_sharedCache.getCachedMobs` validity checks to use `isEntityValid` (Bedrock `Entity.isValid` is boolean, not a function).

- **Concept audit doc:** wrote `[INFECTION_MOD_CONCEPT_AUDIT_2026-04-28.md](development/planning/INFECTION_MOD_CONCEPT_AUDIT_2026-04-28.md)` for Java+Bedrock infection mod design patterns and MapleBear mapping (concepts only; no implementation yet).

**Date:** 2026-04-25 (follow-up — bear cull testing, next session)

- **Remember:** `mb_bearPopulationCull` was not validated in survival-like conditions yet. **Test ideas (pick later):** (1) Temporarily lower `MB_BEAR_CULL_WHEN_GLOBAL_ABOVE` / `TARGET` in a copy of the world or dev balance for a forced run. (2) Admin or command spawns to push global MB count above 200 across dimensions, then stand in one place so many spawns are more than 56m away; expect removals only far from the player. (3) Set world `mb_bear_cull_log` = `1` and watch for throttled `[BEAR CULL]` lines. (4) Urgent path: over 360 mobs, verify 28m floor. (5) Confirm a thrall (`infected_by`) is never removed. (6) After a full sync, script self-test should list **41** dynamic-import files (not 40); if logs still show 40, the Bridge or deploy pack is behind repo `BP/`.

---

**Date:** 2026-04-25 (edit 3)

- **Bear population cull (soft, "despawn-style"):** new `mb_bearPopulationCull.js` — when total addon MB mobs (overworld + nether + end) is at or above 200 (`MB_BEAR_CULL_WHEN_GLOBAL_ABOVE` in `mb_balance.js`), up to 4 mobs per 40t that are **farthest** from the **nearest player in their dimension** and beyond **56m** (normal) are `remove()`'d, working toward 180. **Urgent** mode if total is over 360: min distance **28m** so culling can still work when everything is bunched. Skips `infected_by` thrall bodies. World: `mb_bear_cull` = `0` to disable; `mb_bear_cull_log` = `1` for throttled `[BEAR CULL]` line. `initializeBearPopulationCull()` in `main.js`. Self-test module list +1. Mirrored `BP` / `BP - Dev`.

**Date:** 2026-04-25 (edit 2)

- **Removed defunct entity `mb:buff_mb_day8`** from scripts: dropped `BUFF_BEAR_DAY8_ID` in `mb_spawnEntityIds.js`; **Full self-test** and `ALL_MB_BEAR_TYPES` no longer request it. **Mob / storm conversions** that used day-8 large buff now spawn **`mb:buff_mb`** (base buff) for day 8–12. **Buff AI**, spawn controller buff counts/ambience, and `main.js` (thrall list, dust, codex day-8 unlock helper) updated. Removed the old “day 8 buff bear dies → day 13 buff” block. Mirrored **`BP - Dev/scripts/*` → `BP/scripts/*`**.

**Date:** 2026-04-25 (edit)

- **fix:** `mb_devScriptSelfTest.js` had **two** `import` lines from `./mb_snowStorm.js`, duplicating `getActiveStormCount` and causing in-game **Duplicate import binding** — merged into a single import.

**Date:** 2026-04-25

## Dev: “Full” script self-test (spawns + dust storm) (`mb_devScriptSelfTest.js`, `mb_codex.js`)

Developer Tools → **Script self-test** now opens a **menu**: **Quick** (read-only) vs **Full**. Full runs: every type in `ALL_MB_BEAR_TYPES` via `spawnEntity` (1 game tick between spawns, then cleanup `remove()`), then **minor** `summonStorm` and `endStorm(true)` when dust storms are on, snow script on, and the player is in the **overworld** (other dims skip the storm with a message). Long result bodies allow up to **~10k** characters before form truncation. Mirrored to `BP/scripts/`.

---

**Date:** 2026-04-24

## Fix: bear snapshot must include every type (`mb_bearSnapshot.js`); torpedo `type_family` (`torpedo_mb.json`, `torpedo_mb_day20.json`)

`getEntities({ families: ["infected"] })` **never** returned **torpedo** mobs because those entity files had **no** `minecraft:type_family` — and `[]` is truthy, so the old `if (!all) { per-type }` path did not run, leaving torpedo (and sometimes the whole snapshot) **empty** — **torpedo + mining** AIs had nothing to run. **Change:** `refreshDimension` now **only** uses the per-type list (still one shared pass for all scripts). **JSON:** add `infected` / `maple_bear` / `torpedo` `type_family` to both torpedo entity files. **Mining:** `isEntityStuck` / `findBestDirectionWhenStuck` now use `isEntityValid()`. **Self-test** (`mb_devScriptSelfTest.js`): import `mb_bearSnapshot` + `mb_blockCache`; add a live torpedo/mining/total count; reword the “all good” style lines. Mirrored to `BP/`.

---

**Date:** 2026-04-23

## Hotfix: `Entity.isValid` is a boolean (flying + torpedo + bear snapshot) (`mb_sharedCache.js`, `mb_bearSnapshot.js`, `mb_flyingAI.js`, `mb_torpedoAI.js`)

Bedrock’s `Entity.isValid` is a **boolean**, not a function. A bad guard (`typeof isValid === "function" && !isValid()`) never skipped **invalid** dead entities, so the snapshot/AI distance loops threw `InvalidEntityError` on `entity.location` and could abort the whole **flying** / **torpedo** `runInterval` tick. Torpedo (and flying) then looked “stuck” levitating with no script logic. Fix: add **`isEntityValid(entity)`** in `mb_sharedCache.js` (handles boolean or function), use it when building/processing the bear snapshot, and in torpedo/flying culling and inner loops. Mirrored to `BP/scripts/`.

---

**Date:** 2026-04-22

## Multiplayer script optimization pass (`BP - Dev/scripts/*`, mirrored to `BP/scripts/*`)

Goal: cut the per-player multiplier on repeated entity / block queries so 3-5 player worlds stop stacking lag the way solo worlds don't. Every change pairs a **reduction** with a **compensation** (larger batch, cached read, or an auto storm/mining nudge) so gameplay is unchanged at the solo baseline.

### New modules

- **`mb_bearSnapshot.js`** — per-dimension cache of all Maple Bear entities with a **4-tick TTL**, built with **one `getEntities({ type })` per type** in `ALL_MB_BEAR_TYPES` (see 2026-04-24: a single `families` pass could omit torpedo, and `[]` was truthy so the old “fallback” never ran). Exposes `getBearSnapshot`, `getBearsOfType`, `getAllBears`, `getBearSnapshotsForDimensions`, `countBearsAcrossDimensions`, `invalidateBearSnapshots`, `getBearSnapshotDebug`. **Consumers** share the snapshot instead of each doing independent sweeps.
- **`mb_blockCache.js`** — short-TTL block read cache (`getCachedBlockInfo(dim, loc, ttlTicks=5)`). Hot paths (ground-infection, airborne check, LOS ray) now hit this cache; defaults to 5 ticks, LOS uses 10.

### Player-count thrift tier

`mb_performanceProfile.js` adds:

- **`getPlayerThriftTier()`** → `0` (solo), `1` (2p), `2` (3-4p), `3` (5+p).
- **`getAiIntervalStretch()`** → `1 / 1.15 / 1.5 / 2.0` (same-shape multiplier on AI interval cadences).
- **`getAiBatchBoost()`** → `1 / 1.15 / 1.5 / 2.0` (same-shape multiplier on per-pass batch caps so throughput stays even when intervals stretch).

Wired into:

- **Infected AI:** runs every 6 ticks; thrift tier stretches the effective interval via a visit counter, and `MAX_INFECTED_PER_TICK` is boosted by `getAiBatchBoost()` so the total infected processed per second is unchanged.
- **Buff / flying / torpedo AI:** interval stretch only (work cap already distance-bound). Flying + torpedo use a visit counter gate.
- **Mining AI:** `dynamicInterval = ceil(dynamicInterval * miningWorkMult * getAiIntervalStretch())` (capped at 6). Pathfinding bears with active targets still re-evaluate through the existing per-bear cadence.
- **`mb_spawnController.js`:** `getBlockScanCooldown` gains a thrift multiplier (1 / 1.05 / 1.18 / 1.3), and `getBlockQueryLimit` shrinks the block-query budget by the same tier (1 / 0.95 / 0.85 / 0.75). The existing `getScanYieldBalanceMultiplier` auto-bumps per-scan work + spawn caps, so spawn population stays flat.

### main.js round-robin sharding

Only kicks in when **thrift tier ≥ 2** and there are 2+ players — solo + 2p behavior is unchanged. Shards by `floor(currentTick / loopInterval) mod playerCount`:

- **40-tick unified infection loop** — inventory scan + biome discovery shard across players. Codex item discovery runs once every ~`40 * playerCount` ticks per player; infection timers / effects / audio still run per player per tick via the outer loop.
- **60-tick ground-exposure slow loop** — state-transition detection shards. Fast loop (20t) still processes every tracked player; once a player is on infected ground they're in `playersOnInfectedGround` and keep ticking.

### LOS + block cache

- **`mb_infectionExposureLos.js`:** cap samples from `min(56, ceil(len*3))` → `min(18, ceil(len*1.3))`. Added a **mandatory midpoint sample** so chest-high walls still break LOS. All samples go through `getCachedBlockInfo` (10t TTL).
- **`main.js isPlayerAirborne`:** now reads via `getCachedBlockInfo` (5t TTL); both the 1-block simple path and 3-block "recently on infected ground" path.
- **`main.js isStandingOnInfectedGround`:** same 5t `getCachedBlockInfo` for feet / below / player cell (complements `isPlayerAirborne` and avoids duplicate `getBlock` when ground + audio run in the same few ticks). Does **not** replace `mb_sharedCache` (players/mobs) — that module stays the single place for `getWorldProperty`-style data via `mb_dynamicPropertyHandler` where scripts already use it; bear snapshot is the parallel win for **entity** lists, block cache for **static block reads**.

### Relationship to existing helpers

- **`mb_sharedCache.js`:** still used by mining / buff / flying / torpedo / infected AIs for **`getCachedPlayers`**, **`getCachedPlayerPositions`**, **`getCachedMobs`**; flying duplicate position push was removed to avoid double-counting.
- **`mb_dynamicPropertyHandler`:** unchanged; world/player properties for toggles, codex, spawn, etc. remain the single source of truth — optimizations avoid extra property reads, not a second property layer.
- **`mb_bearSnapshot.js` + `mb_blockCache.js`:** additive; they do what shared cache was not doing before (all addon-mob **entity** enumeration in one pass; **per-coordinate block** dedup). Could later re-export from `mb_sharedCache` for a single import surface if desired, without behavior change.

### Snow storm shelter cache

- **`mb_snowStorm.js isEntityShelteredFromStorm`** caches result per entity for **40 ticks**, invalidated when the entity moves > 2 blocks from the probe position. Each call previously did 6 `getBlockFromRay` rays. Storm mob damage loop still uses a generic `getEntities` (it already skips MB-prefix bears so swapping to the bear snapshot wouldn't help).

### Minor wins

- **`mb_miningAI.js`** main `runInterval(..., 1)` → `runInterval(..., 2)`. `dynamicInterval` already gated per-bear cadence, so this halves wake-up overhead without changing per-bear action frequency.
- **`mb_flyingAI.js`** no longer re-pushes player positions after `getCachedPlayerPositions()` (which already returns them per-dim), so `MAX_PROCESSING_DISTANCE` culling behaves correctly.
- **`mb_performanceProfile.js getAdaptiveWorkMultiplierAddon`** adds a small thrift-tier nudge (~1.06 at 3-4p, ~1.12 at 5+p) capped at 1.6, compounding with existing mob-pressure + wall-stress boosts so storm/mining auto tiers self-tighten for large parties.

### Tuneable knobs

- World property `mb_perf_disable_adaptive` = 1 still disables the adaptive probes (unchanged).
- `SHELTER_CACHE_TTL_TICKS = 40`, `SHELTER_CACHE_MOVE_EPS_SQ = 4` (mb_snowStorm.js) — tune if doorway-edge shelter detection feels laggy.
- `SNAPSHOT_TTL_TICKS = 4` (mb_bearSnapshot.js) — raise if entity queries still dominate, lower if AI reactivity suffers.
- Thrift tier thresholds live in `getPlayerThriftTier()` (mb_performanceProfile.js).

### Mirrored

All dev-side changes copied to `BP/scripts/` per the `AGENTS.md` release checklist. `BP/scripts/mb_buildConfig.js` left untouched (`INCLUDE_FULL_DEVELOPER_TOOLS === false`).

---

**Date:** 2026-03-28

## Day narrative + titles: shorter linger, HUD clears with title (`mb_dayTracker.js`, `mb_actionBarHud.js`)

- **Narrative slot** clear delay is **`narrativeClearTicksForTitle(same options as setTitle)`** (+6 tick pad), not a fixed **280** ticks — action bar drops with the big title.
- **Join / world init / returning** titles use **`TITLE_TIMING_JOIN`** (shorter stay than old 10+60+20). **Sunrise** uses **`TITLE_TIMING_SUNRISE`**. **First-time** follow-up “Day N” pulse uses **`TITLE_TIMING_DAY_PULSE`**.
- **Bugfix:** delayed follow-up after intro used **`3000`** ticks (~150s); comment said 3s — now **`60`** ticks. **BP - Dev** synced.
- Join/init narrative lines still use **`getReturningPlayerWelcome`** when the Journal toggle allows.

## Infected & mining Maple Bear: smaller mob inventory + faster despawn (`BP/entities/`, `BP - Dev/entities/`)

- **Infected + mining Maple Bear** (all six entity files): **`minecraft:inventory` `inventory_size` unified to 5** (same cap for base/day8/day13/day20 infected and `mining_mb` / `mining_mb_day20`).
- **`minecraft:despawn`** (same six files): **`despawn_from_distance`** **max_distance 128→96**, **min_distance 64→52** (tighter “no nearby player” bubble so distance-based cleanup can run sooner); **`min_range_inactivity_timer` 40→20**; **`min_range_random_chance` 520→260** (roughly double random-despawn roll frequency vs before). Render/simulation distance is still engine-controlled; this only tunes the entity despawn component.

## Tile scans + bounds: Overworld/End max Y **319** (build height), not **320** (`mb_spawnController.js`, `BP - Dev` mirror)

- **`OVERWORLD_END_BUILD_HEIGHT_MAX_Y = 319`** (1.18+ top placeable layer). **`getDimensionYBounds`** and **`MINING_SPAWN_SETTINGS`** day20 already used it; **`collectMiningSpawnTiles`** / **`collectDustedTiles`** still hard-coded **320** in Y loops and clamps — replaced with **`dimYMax = getDimensionYBounds(...).max`** so dusted/mining discovery matches real build column (**127** Nether unchanged).

## Flying / torpedo air spawn tiles: use dimension Y cap (`mb_spawnController.js`)

- Extra **`generateAirSpawnTiles`** band was **`minAbsoluteY + 60`** (~Y150), so sky spawns rarely used **`getDimensionYBounds` max** (Overworld/End **319**, Nether **127**). Now passes **`getDimensionYBounds(dimension.id).max`**; slightly more candidate tiles (**24**).

## Spawn HUD broadcast toggle: persist OFF + menu copy (`mb_spawnController.js`, `mb_codex.js`)

- **`setSpawnHudBroadcastEnabled`:** Write **`true`** when on; when off use **`setWorldProperty(..., undefined)`** plus immediate **`world.setDynamicProperty(..., undefined)`** with **`false`** fallback so the world flag actually clears (numeric **`0`** was unreliable for OFF). **`isSpawnHudBroadcastEnabled`** only treats **`true` / `1` / `"1"`** as ON. **HUD** menus label **`Broadcast (world)`** and note **`You see`** can stay ON from **legacy world scan HUD** even when broadcast is OFF.

## Action bar: day narrative auto-clear, join/init + sunrise, settings + dev clear (`mb_dayTracker.js`, `mb_codex.js`, `mb_actionBarHud.js`)

- **Cause:** Day tracker set merged **NARRATIVE** action bar on **world init** and **player join** and at **sunrise** but never cleared — text stayed until overwritten.
- **Fix:** `showPlayerActionbar` schedules **`clearHudActionBarSegment(NARRATIVE)`** after a **title-aligned** tick count (optional third arg; default = default title length + pad). Reschedules on each new line; clears pending timeout on **player leave**. **World first init** + **join welcome** + **sunrise** pass explicit clears. **`cancelAndClearDayNarrativeHud`** for **Developer → HUD → Clear day / ambient**. **`mb_actionBarHud.js`** slot blurb updated. **BP - Dev** synced.

## Block definitions: `format_version` `1.21.130` → `1.26.10` (`BP/blocks/`, `BP - Dev/blocks/`)

- Content log **`[Blocks][error] ... Unexpected version for the loaded data`** for **`snow_layer`**, **`emulsifier_machine`**, **`dusted_dirt`**. **`manifest.json`** already targets **`min_engine_version` [1, 26, 10]**; block files were still **`1.21.130`**. Updated all three to **`1.26.10`** so the engine accepts them on 1.26.10+.

## Property migrations: defer `runWorldPropertyMigrations` (`main.js`)

- **`world.setDynamicProperty`** is not allowed during **early execution**; calling **`saveAllProperties()`** from **`runWorldPropertyMigrations()`** at script top-level caused **`[PropertyHandler] Failed to save world property mb_addon_schema_version`**. **Fix:** wrap **`runWorldPropertyMigrations()`** in **`system.run(() => { ... })`** after **`initializePropertyHandler()`** (BP + **BP - Dev**).

## In-game script self-test: all `mb_*.js` dynamic import sweep (`mb_devScriptSelfTest.js`)

- After existing read-only checks, **`runInGameScriptSelfTest`** **`await`**s **`import()`** on each path in **`SELF_TEST_MODULE_IMPORTS`** (38 modules, sorted; **`main.js`** excluded as pack entry). UI shows **All N modules import OK** or lists **per-file error messages**. **`mb_codex.js`** uses **`await mod.runInGameScriptSelfTest(player)`**. **`BP - Dev/scripts`** synced. **`SCRIPT_TEST_MAP.md`** row updated.

## Docs tree reorganized (`docs/README.md`, `docs/ORGANIZATION.md`)

- **`docs/collaborators/`** — Renamed from `Compoohter/`. Co-creator tasks, UI guide, codex text candidates.
- **`docs/archive/`** — `VERIFICATION_REPORT.md`, `COMMIT_2026-02-01_session.md`, plus `archive/README.md`.
- **`development/systems/`** — Added **`CODEX_UNLOCKS.md`**, **`SNOW_STORM_DESIGN.md`**, **`STORM_TROUBLESHOOTING.md`** (moved from `development/` root).
- **`development/planning/`** — **`QOL_AND_EDGE_CASES.md`**, **`QoL_AND_DEV_TOOLS_IDEAS.md`**, **`STORM_SHELTER_BRAINSTORM.md`** (moved).
- **`development/guides/`** — **`DEBUG_LOGGING.md`**, **`MINECRAFT_1.26_COMPATIBILITY.md`** (moved).
- **`development/ai/`** — **`MINING_AI_OPTIMIZATION_OPTIONS.md`** (moved).
- **Removed duplicate** `docs/TASKS_FOR_CO_CREATOR.md` (root; use **`collaborators/TASKS_FOR_CO_CREATOR.md`**). **Removed duplicate** `development/IDEA_BRAINSTORM.md` (kept **`planning/IDEA_BRAINSTORM.md`**). *Clarification (same date):* content was **not** manually merged into other MDs. Root vs collaborators `TASKS` were identical when added; later edits only touched the collaborators path, so the kept file was authoritative. `IDEA_BRAINSTORM` was earlier a **git rename** into `planning/` (no line diff), not two diverging copies.
- **`development/ui/Chest_UI_Editor.md`** — Renamed from `Chest UI Editor.md` (spaces).
- **`docs/README.md`** — Rewritten as master index; **`docs/ORGANIZATION.md`** — layout principles.
- **Code refs:** `mb_miningAI.js` comment → `docs/development/guides/DEBUG_LOGGING.md`; **`TODO.md`** storm path updated.

## Docs: `docs/development/SCRIPTS_REFERENCE.md`

- **Purpose:** Table-style reference for **each** `BP/scripts/*.js` module (entry, build config, spawn, AI, infection, journal, dev helpers). Links to **`SCRIPT_TEST_MAP.md`** for testing.
- **`AGENTS.md`**, **`SCRIPT_TEST_MAP.md`:** Cross-links for discoverability.

## In-game dev: `mb_devScriptSelfTest.js` (Journal → Developer Tools → Systems)

- **`mb_devScriptSelfTest.js`:** Read-only diagnostics: current day, **`getInfectionRate`**, **`getAddonDifficultyState`**, spawn-load snapshot (**`refreshSpawnLoadMetrics`** / **`getSpawnLoadDebugSnapshot`**), **`getActiveStormCount`**, script toggles off-list, **`SPAWN_CONFIGS`** length + **`ENTITY_TYPE_CAPS`**, dimensions, block below feet, player count. Plain text **`console.warn`** for Content Log.
- **`mb_codex.js` (BP + BP - Dev):** **Systems** menu adds **Script self-test (in-game)**; **`PINNABLE_DEV_ITEMS`** entry **Script self-test (in-game)**. Uses **`import("./mb_devScriptSelfTest.js")`** so **`mb_codex`** load order stays safe.
- **`docs/development/testing/SCRIPT_TEST_MAP.md`:** In-game section + table row for **`mb_devScriptSelfTest.js`**.

## Script testing: `tools/testAllScripts.js`, `SCRIPT_TEST_MAP.md`

- **`tools/testAllScripts.js`:** Walks `BP/scripts/` and `BP - Dev/scripts/`, runs **`node --check`** on each file (cross-platform; fixes Windows vs bash `for` in old `validate:syntax`). Flags: **`--release-only`** (`BP/scripts/` only).
- **`package.json`:** **`validate:syntax`**, **`test:scripts`**, **`test:scripts:release`** invoke the tool. **`npm run check`** unchanged (JSON + syntax + lint).
- **`docs/development/testing/SCRIPT_TEST_MAP.md`:** Table of **npm commands** vs **in-game smoke** per script; links to **`TESTING_CHECKLIST.md`**, **`TEST_SCENARIOS.md`**, **`BETA_SMOKE_CHECKLIST.md`**.
- **`TESTING_CHECKLIST.md`:** Pointer at top to the script map + `npm run check`.
- **`AGENTS.md`:** Commands table + Tools + Gotchas updated for the above.

**Date:** 2026-04-19

## Maintainability: `mb_balance.js`, feature scripts, migration, telemetry, changelog docs

- **`mb_balance.js`:** Spawn **ENTITY_TYPE_CAPS**, **NATURAL_BUFF_SPAWN_COOLDOWN_TICKS**, mob→bear **conversion pressure** constants, **`MB_CONVERSION_BUFF_NEAR_CAP`**, **`getInfectionRate`**. Wired from **`main.js`** and **`mb_spawnController.js`**.
- **`mb_miningConstants.js`:** Mining **dimensions / bear types / pathfinding ids / air set** — **`mb_miningAI.js`** imports (flat `scripts/`).
- **`mb_propertyMigration.js`:** **`runWorldPropertyMigrations()`** after **`initializePropertyHandler()`**; bump **`CURRENT_PROPERTY_SCHEMA`** when adding key renames.
- **`mb_bearTelemetry.js`:** Dev-only; **`[BEAR TELEMETRY]`** to content log when Spawn → **Bear telemetry** on. **`ALL_MB_MOB_TYPES`** exported from **`mb_spawnLoadMetrics.js`**.
- **`mb_playerChangelog.js`**, **`mb_journalWhatsNew.js`**, **`docs/PLAYER_CHANGELOG.md`**, **`docs/development/testing/BETA_SMOKE_CHECKLIST.md`**, **`AGENTS.md`** updated. **`BP - Dev/scripts`** synced.

## Spawn + conversion caps: infected / flying (buff limits reverted + natural cooldown)

- **`ENTITY_TYPE_CAPS`:** infected **26→17**, flying **30→20**; **`SPAWN_CONFIGS` `maxCountCap`** tightened for infected/flying day20 ramps (see commit).
- **Buff bears:** mob→bear conversion near-cap restored to **5** (not **3**). Per-player buff **max** spawn rules restored (**1 / 2 / 3** by group size). Buff **`maxCountCap`** in configs restored to **2** where it had been lowered.
- **Natural buff spawn cooldown:** world-wide **2 minutes** between successful **spawn-controller** buff spawns (`NATURAL_BUFF_SPAWN_COOLDOWN_TICKS`); **does not** apply to conversions in `main.js`. **`lastNaturalBuffSpawnTick`** updates only when a buff variant actually spawns (not fallback-to-non-buff). **BP - Dev** synced from `BP/`.

## Dev reference: `dev/biomes stuff` (review only)

- **Folder contents:** ~80+ vanilla-style **`*.biome.json`** definitions (overworld, nether, end, oceans, mutated variants, **pale_garden**, etc.) plus **`Custom_Biome_Template.mcpack`** and unpacked **`Template Biome/`** (Bridge-generated behavior **data** pack).
- **Biome JSONs:** Appear to be **reference dumps** of Bedrock biome components (`minecraft:climate`, `multinoise_generation_rules`, `overworld_generation_rules`, `tags`, etc.) at mixed **`format_version`** values (e.g. **1.20.60** plains vs **1.21.40** pale garden) — useful for comparing **noise / climate / surface** tuning without opening vanilla packs.
- **Template pack pattern:** **`feature_rules/biome_overworld.json`** runs **`before_surface_pass`**, filters **`has_biome_tag` == `plains`**, **`fixed_grid`** distribution (256 iterations, 16×16 footprint), **`y`** at heightmap−1 — i.e. **surface decoration tied to an existing biome tag**, not a new biome registration by itself.
- **Custom patch feature:** **`custom_biome.json`** is a **`single_block_feature`** that replaces **`minecraft:grass`** with a placeholder block (comment says swap for custom grass); **`determinant_overworld`** + **`block_picker_overworld`** use Molang noise to pick a **`biome_idx`** and only place when **`t.biome_idx == 2`** — a **deterministic “which sub-patch of this chunk”** pattern.
- **Attribution:** Template manifest credits **BigChungus21220**, **Bridge 2.6.1**, **`min_engine_version` [1, 20, 30]** — align namespace **`yourid:`** and engine version if folded into Maple Bear packs.

**Date:** 2026-03-28

## Buff AI Debug: “Show Countdown” button clarity (`mb_codex.js`)

- **Issue:** **Show Countdown** only re-opened the menu; stuck / explosion text was already in the body, so it looked like it did nothing.
- **Change:** Menu body explains the block is a **64-block snapshot** and that **Refresh countdown** updates it. Button renamed to **Refresh countdown**; tap sends a short **chat** line that points at the menu text and General → content log. **BP - Dev** synced.

## Buff AI: content log countdowns when script toggle is off (`mb_buffAI.js`, `mb_codex.js`)

- **Issue:** Buff AI Debug in the journal could list nearby bears while **`console.warn`** countdown lines never appeared. The main interval returned immediately when **`isScriptEnabled(SCRIPT_IDS.buff)`** was false; **`getBuffBearCountdowns`** only scans the world and does not use that toggle.
- **Change:** If **General** buff debug is on (**`getDebugGeneral()`**), the interval still runs: **spawn/stuck tracking + countdown logs**. **Climbing / block break** and **explosions** run only when the Buff AI script toggle is on; if stuck fuse completes with script off, log **would explode — enable Buff AI**.
- **UI:** Buff AI Debug menu shows a short note when General is on but the Buff AI script is off. **`BP - Dev/scripts`** synced.

## Buff AI debug countdown: show bears before AI loop registers them (`mb_buffAI.js`)

- **`getBuffBearCountdowns`** (Buff AI Debug menu body) filtered out any buff bear **missing** **`BUFF_SPAWN_TIME`**; that map is only filled when the **2t AI interval** first processes the entity. Right after spawn / join, the menu could say **no bears within 64** despite entities present. **Fix:** if nearby buff bear has no spawn tick yet, **seed** **`currentTick - MIN_ALIVE_TIME_TICKS`** (same as the main loop) and store it. **Not** a continuous HUD — countdown text is built when that menu (re)opens.

## Journal: how to pin + Admin tools entry (`mb_codex.js`)

- **Full dev build:** Powdery Journal main → **Developer Tools** (accept disclaimer once) → **Codex** → **Pin / unpin to journal main** — tap an item to toggle; pinned rows show **(pinned)** in green. Reopen the journal main menu to see shortcuts above Settings.
- **Requirements:** `mb_cheats` (or legacy host name gate) and a build with dev or admin tools; pins save on the player as **`mb_pinned_dev_items`**.
- **Public Admin tools only:** Pin UI was only under Developer → Codex; **Admin tools** now includes **Pin / unpin journal main** (sets **`journalPowerToolsBack`** to Admin). **BP - Dev** synced.

## Buff bear stuck fuse: horizontal-only + hit advance (`mb_buffAI.js`)

- **Issue:** Stuck reset used **3D** distance, so **climbing** in a small **XZ** footprint exceeded **`STUCK_MOVEMENT_THRESHOLD`** and **cleared** the fuse repeatedly (alternating short vs long “stuck” in logs). After removing the wrong **`+stuckStartTick`** hit fix, hits no longer moved the fuse toward explosion.
- **Change:** **`checkIfStuck`** uses **horizontal `hypot(dx,dz)`** for escape / hurt-suppress. **`HIT_ADVANCE_STUCK_TICKS` (48):** while the fuse is active, each hit **pulls `stuckStartTick` earlier** (clamped to **`currentTick - STUCK_TIME_TICKS`**). **`BUFF_LAST_HURT_TICK`** still suppresses **horizontal** knockback reset for **`BUFF_HURT_SUPPRESS_STUCK_RESET_TICKS`**. **BP - Dev** synced.

## Spawn/scan preset recognition + HUD (`mb_spawnController.js`, `mb_codex.js`, `mb_actionBarHud.js`)

- **`SPAWN_INTENSITY_PRESETS`** exported from **`mb_spawnController.js`** (codex aliases as `SPAWN_PRESETS`). **`findMatchingSpawnIntensityPresetKey`**, **`findMatchingSpawnScanPresetKey`**, **`resolveSpawnTuningRecognition`** compare world overrides to named tiers + **`SPAWN_SCAN_PRESETS`**; detect **quick combos** and **world perf combos** when storm/mining manual multipliers align.
- **`getSpawnTuningSummaryForDevTools()`** → **`menuBody`** for dev menus (spawn controller hub, performance hub, intensity / quick / world combo menus, scan scheduler, scan presets, heavy perf).
- **Action bar** slot **`ACTION_BAR_SLOT.SPAWN_TUNING` (15)**: optional **preset hint HUD** (`mb_spawn_preset_hud`), dev builds only, toggled from **Spawn → Performance** next to scan HUD; 10t refresh with scan overlay.
- **`BP - Dev/scripts`** synced.

## Spawn load metrics + Developer Tools categories (`mb_spawnLoadMetrics.js`, `mb_codex.js`, `main.js`)

- **`mb_spawnLoadMetrics.js`**: periodic bear totals (all listed addon mob types, 3 dimensions), throttled overworld item-entity sample, storm count + perf probes; world props **`mb_spawn_load_auto`**, **`mb_spawn_load_bias`**; multipliers consumed by **`mb_spawnController.js`** (interval, block budget, caps, scan cooldown).
- **`main.js`**: **`initializeSpawnLoadScalerWatch()`** + **`registerSpawnLoadProbes`** with **`getActiveStormCount`**, **`getPerfWallStress01`**, **`getPerfMobPressureForSpawn01`**; early **`runTimeout`** primes metrics.
- **`mb_codex.js`**: Developer Tools is a **category hub** (Performance, Systems, Codex, World, Bears, Storm, Infection, Audio, Public preview); **Performance** holds **Spawn load & efficiency** (auto toggle, bias 0–4, chat dump, link to Heavy perf), camp, AI throttle. **`journalPowerToolsBack`** + **`triggerDebugCommand`** default completion return to the correct parent menu; new **pinnable** **`spawn_load`**. **`BP - Dev/scripts`** synced for edited scripts + new **`mb_spawnLoadMetrics.js`**.
- **`AGENTS.md`**: spawn load section.

## Adaptive storm/mining auto (`mb_performanceProfile.js`)

- **No Script API MSPT** — added **wall-clock ms per game tick** (rolling median, spike proxy) + **weighted Maple Bear counts** (mining heaviest, buff/flying/torpedo) refreshed every **40t** across overworld/nether/end. **`getAdaptiveWorkMultiplierAddon()`** applies only when **storm & mining multipliers are Auto** (manual overrides unchanged); **LAGGY** comfort tier skips adaptive; world **`mb_perf_disable_adaptive`** = `1` disables. **`main.js`** calls **`initializeAdaptivePerformanceWatch()`** after the property handler. **Heavy perf** menu shows live adaptive × when both autos on. **`AGENTS.md`**: short note.

## Dev / admin disclaimer persistence (`mb_dynamicPropertyHandler.js`)

- **`mb_dev_tools_disclaimer_v1`** and **`mb_admin_tools_disclaimer_v1`** were missing from **`loadPlayerProperties`**’s `playerProps` list, so acknowledgements were not reloaded after cache rebuild / rejoin — dev tools disclaimer could appear every time. **Fix:** add both keys to the whitelist. **`mb_codex.js`:** call **`saveAllProperties()`** after setting each disclaimer so the flag flushes immediately.

## AGENTS.md: public release checklist

- Added **Release checklist (public `BP/` + `RP/`)** — merge from dev trees, never overwrite public `mb_buildConfig.js` with dev, manifests, `npm run check`, ship only `BP`+`RP`, optional context log note.

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

- **`mb_actionBarHud.js`:** slots **INFECTION (10)**, **SPAWN_TUNING (15)**, **SPAWN_SCAN_PERF (20)**, **NARRATIVE (25)**, **CAMP_DEV (30)**, **TOAST (40)**; compact **`·`** separator and **`(n)`** prefix when many segments; **`formatHudMergeOrderForMenu`**, **`clearAllHudSegments`**, **`pushHudActionBarToast`**, **`getHudActiveSegmentCount`**, **`getHudActionBarDebugInfo`**; toast timeouts cleared on leave.
- **`main.js`:** infection line → infection slot; first minor/major cure messages → **`pushHudActionBarToast`** (no full-line wipe).
- **`mb_dayTracker.js`:** **`showPlayerActionbar`** → **NARRATIVE** slot (RawMessage still uses raw **`setActionBar`**).
- **`mb_spawnController.js`:** preset/scan/camp dev labels shorten (**Pr/Sc/Cp**) when **`getHudActiveSegmentCount` ≥ 4**.
- **`mb_codex.js`:** Developer Tools → **HUD & action bar** (merge legend, live preview, scan/preset toggles, camp-watch tag, clear, test toast, link to Spawn — Performance); pinnable **`hud_action_bar`**.

### 2026-03-28 — Perf: fewer bears, faster despawn (non-buff), smaller infected inventories

- **`mb_spawnController.js`:** Type caps **tiny 38** / **infected 26**; default **global cap/tick 18**; lower **per-tick spawn curve** and **`getPerTypeSpawnLimit`** for tiny/infected variants; per-player max spawns/tick **12**.
- **`main.js`:** **`MB_CONVERSION_NEARBY_BEAR_SOFT_CAP = 30`** for kill/storm mob→bear conversions (was 40).
- **Entities (non-buff):** **`minecraft:despawn`** inactivity **40** ticks, random chance **520** (was 60 / 800) on tiny, infected, flying, mining, torpedo (+ torpedo gained despawn); **infected pig/cow** gained full despawn (were distance-only).
- **Buff bears:** Despawn **slower** (inactivity **200**, chance **1600**) so they stay longer than other types.
- **Inventories (~−25%):** infected bears **15** (day20 **18**), torpedo **15**, flying **15** (day20 **18**), infected pig **14**.

### 2026-03-28 — Minor immunity copy, spawn HUD ~nearest, preset auto, spawn menu reorg

- **Journal:** Main summary + infection section clarify **permanent immunity is for minor infection** (major rules still apply).
- **`mb_spawnController.js`:** **`findClosestSpawnIntensityPresetKey` / `findClosestSpawnScanPresetKey`**; **`resolveSpawnTuningRecognition`** uses **`~Nearest`** labels + nearest-named line when not exact; **`§cA§r`** HUD prefix when **`mb_spawn_preset_auto`** ON; **`applySpawnIntensityPreset`**; **`tickSpawnPresetAutoApply`** (~100t) picks combo from **spawn load `load01` + `getWorldWideSpawnLoadCount()`**.
- **`mb_codex.js`:** Spawn Controller hub: **World tuning** | **Overlays & auto** (HUDs, spatial, spawn+scan AUTO, spawn load AUTO, load menu, storm/mining → Auto) | Core | Force | Emulsifier; **World tuning** submenu is presets/combos only (old Performance).

### 2026-03-28 — Spawn+scan AUTO default ON + bear-heavy tier scaling

- **`isSpawnPresetAutoEnabled`:** Unset property now means **ON** (explicit `0`/`false`/`"0"` = OFF), aligned with spawn load auto.
- **`computeAutoSpawnScanTarget`:** **`bearTierPressure`** from snapshot bear count + stronger **`load01 * 5.2`** so solo worlds with ~100+ bears reach **low/ultra** tiers (old `load01*3.2` maxed ~3.2 and bear term in `load01` saturated at 90 bears ≈ tier 0 Med).
- **`mb_spawnLoadMetrics.js`:** **`computeLoad01`** bear curve reworked; bear recount interval **24t** (was 40).

### 2026-03-28 — Spawn scan/preset HUD: per-player + optional broadcast

- **`mb_spawnController.js`:** Player props **`mb_dev_hud_scan_perf`**, **`mb_dev_hud_spawn_preset`**; world **`mb_dev_spawn_hud_broadcast`**. **`isSpawnScanPerfOverlayEnabledForPlayer` / `isSpawnPresetHudEnabledForPlayer`**; legacy world flags **`mb_spawn_scan_perf_debug`** / **`mb_spawn_preset_hud`** still apply to everyone until toggled (then cleared when using per-player setters). **`setSpawnScanPerfOverlayEnabled(enabled, player)`** requires toggling player.
- **`refreshSpawnScanPerfHudOverlay` / `refreshSpawnPresetHudOverlay`:** Update/clear per player from ForPlayer helpers.
- **`mb_codex.js`:** Spawn **HUD & spatial** + Developer **HUD & action bar**: **my** scan/preset toggles + **Broadcast spawn HUDs to all players**. **`mb_actionBarHud.js`:** merge legend text updated.

### 2026-03-28 — Spawn+scan AUTO: explicit 1–8 online player term

- **`mb_spawnController.js`:** `computeAutoSpawnScanTarget()` now adds **`onlineTerm`** from valid online players capped at **`AUTO_PRESET_ONLINE_CAP` (8)** (9+ saturates like 8), alongside existing **`load01`** and **cluster** sum. Design comment block documents how this relates to barren cooldowns, stagger, and `getEffectiveMaxGlobalSpawnsPerTick`. HUD/journal line: `online 1–8 + clusters + spawn load`. **`mb_codex.js`** Auto modes body text aligned.

### 2026-03-28 — Spawn dev UI: AUTO hub, HUD merge, narrative RawMessage

- **Behavior (unchanged in code):** **Spawn+scan AUTO** (`tickSpawnPresetAutoApply` ~100t) **overrides** manual spawn intensity + scan presets while ON. **Spawn load AUTO** scales controller interval/block budget separately (can stack). Manual picks **stick** when preset+scan AUTO is OFF.
- **`mb_codex.js` (BP + BP - Dev sync):** Spawn Controller root — **§aAuto modes** button first after script toggle; **HUD & spatial** (was overlays) for scan/preset HUD + spatial + links to AUTO hub and load menu; new **`openSpawnAutoModesMenu`** (preset+scan, load, storm/mining auto, load details). Performance + HUD dev menus link into AUTO hub. World tuning / heavy perf / spawn intensity preset bodies warn when AUTO replaces manual choices.
- **`mb_dayTracker.js`:** **`showPlayerActionbar`** flattens common **RawMessage** `rawText` into a string and uses **NARRATIVE** merged slot so day text does not wipe infection/spawn HUDs.
- **`main.js`:** Infection HUD refresh no longer bails on missing `setActionBar` check (merge API handles display).

### 2026-03-28 — Share knowledge: per-player first-kill achievements

- **Cause:** `shareKnowledge` merged all `codex.mobs` entries; numeric **Kills / MobKills / Hits** and **variantKills** from the sharer could copy to the recipient when their tallies were `0` (`!0` was true). `trackBearKill` then ran **every** first-kill check on **every** kill, so a copied `buffBearKills === 1` could grant **KO Buff Maple Bear** on the next unrelated bear kill.
- **Fix (`BP` + `BP - Dev`):** **`mb_codex.js`** — skip stat keys in the mob share loop via **`isMobCodexStatKey`**. **`main.js`** — **`getFirstKillAchievementForBearType`** awards the KO message/achievement only for the **slain** bear category.

### 2026-03-28 — New worlds: “full auto” = spawn controller + script toggles (not beta Infected AI)

- **User intent:** New worlds should run **spawning and related systems** in automatic mode until something is changed in the **book** (Spawn Controller menus, dev toggles, etc.). **Beta Infected AI** stays **OFF by default** — opt-in under **Settings → Beta**.
- **`isScriptEnabled`:** All main script toggles (including **spawn_controller**, mining, storms, etc.) default **ON** unless explicitly disabled in Developer Tools.
- **Spawn AUTO:** Preset+scan and related spawn-load auto behavior default **ON** when unset (explicit `0`/`false` turns off); see earlier **Spawn+scan AUTO default ON** entry.

### 2026-03-28 — Clarify: spawn AUTO defaults + entity-driven tuning

- **Preset+scan AUTO** and **spawn load AUTO** are both **ON** for a fresh world until toggled off in the book.
- **Entity/load reaction:** Addon bear-type counts (all dimensions, ~24t refresh) drive **`load01`** in **`mb_spawnLoadMetrics.js`**; **`computeAutoSpawnScanTarget`** also adds **`bearTierPressure`** from bear count plus cluster/online terms so high populations push toward lighter spawn+scan tiers. Storm/mining **Auto** in the journal means cleared manual multipliers so lag tiers + probes control cadence (separate from those two world properties).

### 2026-03-28 — Scan perf HUD: show bears + load scalers (not only P/C/D/W)

- **Issue:** Action bar showed **P1 C1 D1 W1** for solo worlds — correct for **player/spatial** counts but looked “stuck” vs the journal spawn-load screen (bears, `load01`, interval/block multipliers).
- **Fix (`mb_spawnController.js` + `BP - Dev` mirror):** **`refreshSpawnScanPerfHudOverlay`** calls **`refreshSpawnLoadMetrics(system.currentTick)`** each refresh (~10t) and appends **`b`ears, `L`% (load model), `i×` interval mult, `b×` block scale**; keeps **P/C/D/W** (compact **P/W** when HUD is crowded + solo). **`mb_actionBarHud.js`:** merge-order blurb updated.

### 2026-03-28 — Major infection: Maplethrall on PvP / non–bear death when infection is advanced

- **Cause:** **`handleInfectedPlayerDeath`** required **`damagingEntity`** to be a maple bear / infected pig-cow. **Player kills** use **`minecraft:player`** as killer, so the function **returned** and **no** infected bear (display **Maplethrall**) spawned. An early **`if (!source \|\| !source.damagingEntity) return`** also blocked thralls when there was no damage entity.
- **Fix (`main.js`, BP + BP - Dev):** **`MAJOR_THRALL_ON_DEATH_REMAINING_FRAC` (0.42)** — if **active major** infection and **`ticksLeft`** ≤ 42% of a full **major** timer (~58%+ through the timeline), any death that would have skipped the bear-kill path still **spawns** the same day-scaled infected bear + broadcast + daily log (distinct message vs bear kill).

### 2026-03-28 — Buff bear stuck explosion: hits no longer extend fuse or break countdown

- **Cause:** `entityHurt` advanced **`stuckStartTick` by +30 ticks**, which **shortened** accumulated stuck time and **delayed** explosion; repeated hits could make **`stuckStartTick > currentTick`** (negative “stuck” in logs). **Melee knockback** also moved the bear past **`STUCK_MOVEMENT_THRESHOLD`**, so **`checkIfStuck`** cleared **`stuckStartTick`** and **restarted** the 15s fuse — felt like the timer reset.
- **Fix (`mb_buffAI.js`, BP + BP - Dev):** Removed hit-based **`stuckStartTick`** edits. Added **`BUFF_LAST_HURT_TICK`** + **`BUFF_HURT_SUPPRESS_STUCK_RESET_TICKS`** (~2.5s): after damage, large movement **updates `lastPosition` but keeps `stuckStartTick`** so knockback does not reset the fuse. Cleanup on despawn / post-explosion.

### 2026-03-28 — Journal pins: all sections + full admin dev list; mob conversion pressure curve

- **`mb_codex.js` (BP + BP - Dev):** **`getJournalMainPinnableItems()`** adds pin-eligible **journal** shortcuts (Infection, Symptoms, Mobs, … Settings, Search when enabled) with **`journalPin`** so release builds skip the admin disclaimer for those. **`getPinEligibleDevItems()`** merges journal shortcuts with **all** **`PINNABLE_DEV_ITEMS`** when **`INCLUDE_ADMIN_TOOLS`** or full dev **`INCLUDE_FULL_DEVELOPER_TOOLS`** (release admin no longer limited to two pins). Main menu resolves pins via **`findPinnableItemById`**.
- **`main.js`:** Removed hard **nearby 30** conversion cutoff. **Nearby** (64m) and **world-wide** addon bear counts (via **`refreshSpawnLoadMetrics` / `getSpawnLoadDebugSnapshot`**) apply a **ramped multiplier** to **`getInfectionRate`** for pig/cow infected conversions and normal mob→bear rolls. **Buff-bear outcomes** (large mob + day 8+, storm or bear kill) keep the **full** conversion rate so boss-tier pressure stays. **Buff bear count ≥5 nearby** still blocks **new** buff spawns. Constants: **`MB_CONVERSION_NEARBY_PRESSURE_*`**, **`MB_CONVERSION_WORLD_PRESSURE_*`**.

### 2026-03-28 — Refactor: spawn configs + entity IDs; mob conversion module

- **`mb_spawnEntityIds.js`:** Canonical **`TINY_BEAR_ID`** / tier IDs + **`MAPLE_BEAR_*`** aliases, **`INFECTED_PIG_ID` / `INFECTED_COW_ID`**.
- **`mb_spawnConfigs.js`:** **`SPAWN_CONFIGS`** + **`SPAWN_CONFIG_DISPLAY_NAMES`** (numeric natural-spawn tuning in one file). **`mb_spawnController.js`** imports these; **`mb_balance.js`** header points here instead of inline controller tables.
- **`mb_mainMobConversion.js`:** **`handleMobConversion`**, **`handleStormMobConversion`**, internal helpers (`convertEntity`, pressure ramps, **`getMobSize`**, pig/cow conversions, storm-at-location). **`main.js`** wires **`entityDie`** only; bear **`typeId`** lists import from **`mb_spawnEntityIds.js`**.
- **`docs/development/ui/Notifications.md`:** Short **future** note (toasts vs chat, quests/achievements log, buff-kill rewards / rare rolls) — not implemented.
- **Codex:** **`mb_codexDebugMenus.js`** not split this pass (debug UI still lives inside **`showCodexBook`**); next step is factory or per-hub files to avoid a huge risky move.
- **`BP - Dev/scripts`:** Synced for touched files.
