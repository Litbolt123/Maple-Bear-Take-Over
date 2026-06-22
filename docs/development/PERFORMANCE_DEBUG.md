# Performance debug — tick stalls (MSPT)

Symptoms like **entities still making sound, blocks frozen, hits catching up after** are usually **server tick stalls**, not client FPS. Addon scripts share the main simulation thread.

## Day 0–1 note

**Work spread (`mb_workSpread.js`):** On day 0–1, most periodic systems run at **8×** nominal spacing (one player / one dimension / one anchor per slice). Entity queries use a **3×3 grid of 32-block cells** around each player instead of one large radius per tick (mob cache, bear snapshot, conversion counts). Mob cache builds over multiple ticks; `findClosestBiome` is off; world init is staggered. Re-test villages after pack reload.

**Day 2+ soft spread:** When spawn-load metrics report a heavy world (`load01 ≥ 0.45`), item entity sampling uses **2×** interval spacing (not the full 8× day-0–1 throttle). AI `getAiIntervalStretch()` also nudges up slightly.

**`main.js` intervals (2026-05):** Infection timers stay on **40t**; inventory codex discovery moved to **120t** with one pass per slot batch and skip when all flags are set; biome discovery on its own **40t** slice with block-cache underfoot check.

**Village / chunk-edge pass (2026-05-20):** Crossing a **16-block** chunk boundary starts a **~6s defer** (`shouldDeferVillageBurst`) for biome ambience, mob cache builds, item metrics, bear snapshot refresh, and inventory discovery. **Days 2–3** use **4×** entity spread (not just day 0–1). **Solo** new-chunk tile scans are **queued and staggered** (same idea as MP), **quadrant progressive** discovery on first visit, **1** full chunk scan and **1** enqueue per tick max. Chunk scans get **lower block budgets** while the area is “new” — completeness builds as you **stay in the area**.

**Day 0 bisect (dev):** Journal → **Entity query / village** → **Day 0 bisect (find lag)**. Requires **day 0** and **no Maple Bears**. Turn **bisect mode ON**, use **All systems OFF**, then enable **one** toggle at a time and re-test dispensers. **All ON** should reproduce full-addon lag; **All OFF** is vanilla-like script load. Bisect **off** = normal addon on day 0. Systems: infection, ground, villager spawn, perf sampler, entity-query HUD, spawn metrics, chunk edge, discovery, snow trail.

**Abandoned village lag (2026-06):** Script toggle **Abandoned village placement** OFF should remove periodic block/mob freeze hitches. If lag returns **after** visiting a lamp and leaving, check dev **Journal → Abandoned villages** — **`idle=1`**, **`near=0`**, **`heavyScan=0`**, **`active=0`** when far in plains (scan interval **`scan=160–320t`** on day 0–1). Repro matrix:

1. Day 0, toggle ON, plains **200+ blocks** from any village — smooth breaking/combat.
2. Lamp → village → stay within **96 blocks** — full build speed.
3. Leave **200+ blocks** while build paused — hitches stop; build resumes when you return within **192 blocks**.
4. Toggle OFF — no lag (regression).

Root fixes: paused build queue no longer marks the world globally busy; heavy scans and lamp cleanup are **player-proximity** gated (not global `incomplete > 0`); main 20t loop sleeps when no player near village interest.

**Entity trace (dev, 2026-05-20):** Journal → **Entity query / village** → turn **Content log** on. Content Log tags: **`[ENTITY QUERY]`** (summary ~2s), **`[ENTITY TRACE] RUN/SKIP`** per `getEntities` / gate (budget 16 lines/tick), **`[VILLAGER SPAWN]`** on eggs. Hub: **Log entity trace**, **Clear trace stats**. Skip reasons: `villagerMute`, `villagerDefer`, `zeroBearStanddown`, `earlyZeroBear`, `villageDefer`.

**Post-villager entity mute (2026-05-20):** Each adult villager/trader spawn extends **`VILLAGER_ENTITY_QUERY_MUTE_TICKS`** (**100** ≈ **5s** @ 20 TPS; tune **60–100** for 3–5s) in **`mb_entityQueryGate.js`**. While active, **`shouldSkipExpensiveEntityQueries`** blocks mob cache, bear snapshot rebuilds, spawn metrics sweeps, etc. **Exception:** query categories whose name includes **`mining`** when a mining MB was recently known (`lastKnownMiningBearCount` from snapshot or spawn). **Mining AI** keeps running on cached bear handles during mute; other bear AI stays dormant. HUD: **`mute=Nt`**, **`M=`** mining count. Also defers infection/biome/ground polls via **`shouldDeferVillageBurst`**.

**Villager load (2026-05-20):** Repro: villagers (even **3** spawn eggs) → tick freeze with pack on, fine in vanilla. Causes: (1) mob cache **`mob`/`villager`** family sweeps; (2) with **zero Maple Bears**, **`mb_bearSnapshot.js`** still ran **21 typed `getEntities` per dimension** every few ticks (mining/flying/torpedo/metrics). Fix: **`mb_entityQueryGate.js`** zero-bear **standdown** (~10s, probe every 80t except during villager defer); mob cache **`monster`** family only; **any** villager/trader spawn extends **`shouldDeferVillageBurst`** **10s** (`VILLAGER_SPAWN_DEFER_TICKS` = 200, +20t per extra in same tick, **+60t drip** if already deferred); **pressure mode** (≥4 spawns in 30s → 20s recovery quiet, log `pressure=`); mob cache clear deferred to **next tick** and skipped on chunk-edge during defer/pressure. **Engine hitch:** when many villagers spawn in **one** game tick, the game itself stalls — scripts do not run that tick; defer only spreads **addon** work afterward. Loaded villagers still cost vanilla AI.

**Fast egg pace (&lt;~1s apart):** Treated as batch load — full **10s** defer per spawn (`VILLAGER_FAST_SPAWN_GAP_TICKS` = 20). **`entitySpawn`** only increments a pending counter; **`system.run`** drains **once per game tick** (40 chunk villagers = one drain, not 40 finalize calls). Villager spawn eggs **`itemUse`** pre-arm entity mute before **`entitySpawn`**. **Spread pump** (mob cache clear slices) is **skipped** when pressure/defer/session is already active — avoids a backlog of per-egg jobs that hitch when you place a few eggs after a pause. **Reentry** (gap &gt;5s since last villager): no longer forces full 10s defer if pressure is still on; uses **drip** extend instead. HUD/log: **`S=`** spread window remaining.

**Content Log during hitches:** `[VILLAGER SPAWN]` lines are queued with `system.run` (next game tick). During a freeze you may see **fewer lines than eggs placed**. **`countThisTick=N`** = adults that fired `entitySpawn` on **that** game tick (real batch size). **`flush pending=N tickSpan=A-B`** = **N** spawns accumulated since the last log line across ticks **A–B** (not “N eggs in one go”); often appears after a stall when `system.run` was delayed. **`mega=1`** only when **`countThisTick ≥ 8`**. **`session=`** = total logged this world session. **Reload world** after sync — Bridge must push updated **`BP - Dev`** or **`BP/`**.

**Spawn feel balance:** Full scans may wait, but the **chunk you stand in** is scheduled first, a **16-block** ring around the player is still probed for dusted dirt, progressive discovery starts in the **player’s quadrant**, and spawn **attempts/chance** ramp higher when tiles are still sparse (`THROTTLED_SCAN_SPAWN_*`). Re-test: bears near feet within ~3–6s of entering a village, distant tiles filling in over ~15–30s.

The spawn controller **main loop does not run** when `getCurrentDay() < 2` (no dusted-dirt chunk tile scans from that loop). Early-day spikes are more often:

- Vanilla chunk load + village entity AI
- Custom **infected biome** borders
- **`findClosestBiome`** fallback in [`main.js`](../../BP/scripts/main.js) (`getBiomeIdAt`)
- **Spawn load metrics** (`getEntities` sweeps + overworld item count) — throttled on day 0–1 in script
- **Biome ambience** (`getBiome` every 1–3s per player)
- **Emulsifier** block scans if any machine is active

## A/B test (do this first)

1. Same world, seed, day 0–1, two players walking into **new chunks** near a village.
2. Run **with** addon packs, then **without** (remove behavior + resource packs only).
3. If vanilla-only is smooth → focus addon toggles below. If both lag → note world gen / hardware; script fixes help marginally.

## Confirm the right pack

| In-world behavior pack name | Folder |
|----------------------------|--------|
| **The Maple Bear Apocalypse (Dev)** | `BP - Dev` |
| **The Maple Bear Apocalypse** (no Dev) | `BP` release |

Bridge template: `npm run bridge:config:dev` or `bridge:config:release` — see [`config/README.md`](../../config/README.md).

## In-game toggles (dev pack, Content Log)

Journal → **Developer Tools** → **Debug** / script toggles:

| Toggle | Effect |
|--------|--------|
| Spawn controller off | Little change on day 0–1 (main spawn loop already off) |
| Biome ambience off | Stops periodic `getBiome` + ambient restarts |
| Spawn scan perf HUD off | Stops extra 10t HUD work (metrics still refresh on 40t watch) |
| No emulsifier machines nearby | Avoids 10t `processEmulsifierZones` block budgets |

**LAGGY** / performance tier — note if stalls align with high adaptive stress (`mb_performanceProfile.js`).

## What to report

- Day number, 1p vs 2p, dev vs release pack title
- Near **infected biome** or village only?
- **First visit** to chunk vs every revisit
- Any **emulsifier** running?
- Vanilla A/B result

## Entity query audit (who calls `getEntities` / snapshot)

| System | When it queries | Day 0 / 0 bears (2026-05) |
|--------|-----------------|---------------------------|
| **`mb_bearSnapshot.js`** | ~21 typed `getEntities` per dimension refresh | **Skipped** (standdown, villager defer, spread `S=`) |
| **`mb_sharedCache.js`** mob cache | `monster` family, 128 radius, 3×3 grid when spread | **Skipped** when gate says so |
| **Mining / flying / torpedo / buff / infected AI** | `getBearSnapshot(s)` + mob cache for targeting | **Intervals off** day 0–1 until day 2 or first MB bear (`mb_bearAiBootstrap.js`); then dormant + 1/40 wake |
| **`mb_bearAiBootstrap.js`** | Registers bear AI `runInterval`s | **Deferred** day 0–1 with 0 bears |
| **`mb_dimensionAdaptation.js`** | Bear snapshot | Same sleep as AI |
| **`mb_performanceProfile.js`** | Bear snapshot for weighted mob score | **Skipped** when 0 bears |
| **`mb_spawnLoadMetrics.js`** | Overworld **items** near players | Deferred during villager burst |
| **`main.js` snow trail** | Bear snapshot | Deferred during villager burst |
| **`mb_spawnController.js`** | Bear snapshot for counts; some tile scans use `getEntities` | Main spawn loop **off** day &lt; 2 |
| **`mb_buffAI.js`** | Extra `getEntities` for block breaking | Dormant when 0 bears |
| **Infection / ground** (`main.js`) | Block checks, not entity sweeps | Deferred during villager burst |
| **Emulsifier** (`mb_spawnController.js`) | Block scans | Only if machines exist |

**Villager eggs:** Addon polls should show `mobSkip=true`, `defer=true`, `snap age` climbing. If defer is on and you still hitch, check **`mb_bearAiBootstrap.js`**: on day 0–1 with zero bears, mining/flying/buff/torpedo/infected **`runInterval`s should not exist** until day 2 or first MB bear spawn (no BUFF/MINING init spam in Content Log on join).

**Village walk-in:** We do **not** scan for villagers. Each villager fires **`world.afterEvents.entitySpawn`** when its chunk loads (same handler as spawn eggs). A village is a **burst of spawn events** in a few ticks — same code path as fast eggs.

**Why 6 fast eggs OK but 2 after 5s lags:** During a fast burst, `vilDefer` / `pressure` / `S=` stay active — addon stays asleep. After ~5s quiet, those can expire briefly before `finalize`; the next spawn was a **cold reentry** (mob-cache clear + spread pipeline). Fix: sync defer on spawn tick; **`reentry=1`** → full defer + skip mob-cache clear; **`VILLAGER_ADDON_SESSION`** ~20s after any villager spawn.

## Maintainer hotspots

| File | Work |
|------|------|
| `mb_spawnLoadMetrics.js` | Bear/item entity queries; day &lt; 2 light path |
| `main.js` | `getBiomeIdAt`, infection interval, biome discovery 40t |
| `mb_spawnController.js` | Chunk scan queue (day 2+), progressive block scan resume, MP group one-player-per-tick, emulsifier 10t |
| `mb_dimensionAdaptation.js` | Uses `mb_bearSnapshot` (not unfiltered `getEntities`) |
| `mb_entityQueryGate.js` | **`shouldSkipExpensiveEntityQueries()`** — villager defer, standdown, day 0–3 zero bears |
| `mb_workSpread.js` | **`safeQueryEntitiesNear()`** — gated spread/direct entity queries |
| `mb_sharedCache.js` | Mob cache: scoped per player (128), **`monster`** family; excludes items/orbs/villagers |
| `mb_workSpread.js` | Per-villager spawn defer (10s) + chunk-edge defer |
| `mb_bearAiBootstrap.js` | Lazy-start bear AI intervals (day 2+ or first MB bear) |
| `mb_miningAI.js` | Target coordination: per-id `getEntity`, not mob-cache sweep |
| `mb_spawnController.js` | Spawn bear counts via `getBearSnapshot` (not all entities in radius — villages) |
| `mb_bearSnapshot.js` | Empty snapshot TTL 40t (not 4t) when no bears loaded |
| `mb_spawnLoadMetrics.js` | Item count sampled near players (96), not whole overworld |
| `mb_biomeAmbience.js` | In-biome checks |

After changes: `npm run check` on PC; in-game **Script self-test** (dev) is supplementary.

**Roadmap (tiers + phases):** [PERFORMANCE_OPTIMIZATION_ROADMAP.md](PERFORMANCE_OPTIMIZATION_ROADMAP.md).
