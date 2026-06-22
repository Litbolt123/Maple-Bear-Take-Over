/**
 * Day 0–1 (and chunk-edge) work spreading: avoid bursting expensive Script API calls
 * when many chunks load at once (first village, fast travel). Systems stay correct but
 * react over a longer window.
 *
 * Entity queries use a 3×3 grid of smaller radii around each player (32 blocks per cell)
 * instead of one large sphere (e.g. 128 blocks) per tick.
 */

import { system, world } from "@minecraft/server";
import { INCLUDE_FULL_DEVELOPER_TOOLS } from "./mb_buildConfig.js";
import { getCurrentDay } from "./mb_dayTracker.js";
import { clearMobCache } from "./mb_sharedCache.js";
import {
    extendVillagerEntityQueryMute,
    extendZeroBearStanddown,
    getVillagerEntityQueryMuteTicksRemaining,
    getZeroBearStanddownTicksRemaining,
    isEarlyWorldZeroBearPhase,
    isEngineBacklogQuietActive,
    isVillagerEntityQueryMuteActive,
    noteGenericEntityQuerySkipped,
    registerEngineBacklogHandler,
    registerVillagerDeferChecker,
    registerVillagerQuietTicksRemaining,
    shouldSkipExpensiveEntityQueries,
    VILLAGER_ENTITY_QUERY_MUTE_TICKS
} from "./mb_entityQueryGate.js";
import { shouldPauseDayZeroAddonLoops, shouldSleepDayZeroWorldWork } from "./mb_dayZeroPerfBisect.js";
import { isScriptEnabled, SCRIPT_IDS } from "./mb_scriptToggles.js";
import { isVillagerSuppressionEnabled } from "./mb_villagerSpawnPolicy.js";
import { isEntityQueryTraceActive, traceEntityQueryRun } from "./mb_entityQueryTraceDev.js";

/** Through day 1 inclusive — matches spawn loop off before day 2. */
export const SPREAD_THROTTLE_DAY_MAX = 1;

/** Days 2–3: lighter spread for entity/metrics (villages, early exploration) — slower, not one burst. */
export const VILLAGE_ENTITY_SPREAD_DAY_MAX = 3;
export const VILLAGE_ENTITY_SPREAD_MULT = 4;

/** How much longer intervals run while throttling (8× ≈ 8 seconds per 1-second nominal tick). */
export const SPREAD_THROTTLE_MULT = 8;

/** Softer spread on day 2+ when spawn-load metrics report heavy world (see setMetricsSpreadLoad01). */
export const SOFT_SPREAD_MULT = 2;

/** Vanilla chunk width — detect entering new chunks (villages load many at once). */
export const VANILLA_CHUNK_BLOCKS = 16;

/** After a chunk-edge crossing, defer burst-prone polls (~6s). */
export const CHUNK_EDGE_DEFER_TICKS = 120;

const METRICS_SPREAD_LOAD_THRESHOLD = 0.45;
let metricsSpreadLoad01 = 0;

/** Called from mb_spawnLoadMetrics after recomputeCachedMultipliers. */
export function setMetricsSpreadLoad01(load01) {
    metricsSpreadLoad01 = Math.max(0, Math.min(1, Number(load01) || 0));
}

export function getMetricsSpreadLoad01() {
    return metricsSpreadLoad01;
}

/** Day 0–1 aggressive spread, or day 2+ when load is high (entity metrics only). */
export function isMetricsSpreadActive() {
    if (isSpreadThrottleActive()) return true;
    try {
        if (getCurrentDay() < 2) return false;
    } catch {
        return false;
    }
    return metricsSpreadLoad01 >= METRICS_SPREAD_LOAD_THRESHOLD;
}

/** Effective spread multiplier for claimSpreadSlice (1, 2, or 8). */
export function getEffectiveSpreadMult() {
    let mult = 1;
    if (isSpreadThrottleActive()) {
        mult = SPREAD_THROTTLE_MULT;
    } else if (isVillageEntitySpreadActive()) {
        mult = VILLAGE_ENTITY_SPREAD_MULT;
    } else if (isMetricsSpreadActive()) {
        mult = SOFT_SPREAD_MULT;
    }
    if (isAnyChunkEdgeDeferActive()) {
        mult = Math.max(mult, SOFT_SPREAD_MULT * 2);
    }
    return mult;
}

/** Each staggered entity query uses this radius (smaller than full mob cache radius). */
export const SPREAD_CELL_RADIUS = 32;

/** 3×3 grid around player feet (XZ), one cell per stagger step. */
export const SPREAD_CELL_OFFSETS_XZ = [
    { dx: 0, dz: 0 },
    { dx: 32, dz: 0 },
    { dx: -32, dz: 0 },
    { dx: 0, dz: 32 },
    { dx: 0, dz: -32 },
    { dx: 32, dz: 32 },
    { dx: 32, dz: -32 },
    { dx: -32, dz: 32 },
    { dx: -32, dz: -32 }
];

export const SPREAD_CELL_COUNT = SPREAD_CELL_OFFSETS_XZ.length;

const sliceLastTick = new Map();
const playerRotate = new Map();
const sectionRotate = new Map();
const playerVanillaChunkKey = new Map();
const playerChunkEdgeDeferUntil = new Map();

/** Villager bulk spawn/load (creative eggs or village chunk) — defer mob cache / snapshot polls. */
export const VILLAGER_BURST_TYPES = new Set([
    "minecraft:villager",
    "minecraft:villager_v2",
    "minecraft:wandering_trader"
]);
/** Any villager/trader spawn — pause heavy addon polls (~10s @ 20 TPS). Matches vanilla village-load batches. */
export const VILLAGER_SPAWN_DEFER_TICKS = 200;
/** Extra defer per additional villager in the same tick (natural village chunk load). */
const VILLAGER_SPAWN_DEFER_PER_EXTRA_IN_TICK = 20;
const VILLAGER_SPAWN_DEFER_MAX_TICKS = 400;
/** While already deferred, a lone spawn only extends the window this much (paced eggs). */
const VILLAGER_SPAWN_DEFER_DRIP_TICKS = 60;
/** Spawns faster than this (game ticks) count as "fast pace" → full 10s defer, not drip (~1s @ 20 TPS). */
export const VILLAGER_FAST_SPAWN_GAP_TICKS = 20;
/** Rolling window: this many villager spawns → post-session recovery quiet period. */
const VILLAGER_PRESSURE_WINDOW_TICKS = 600;
const VILLAGER_PRESSURE_SPAWN_THRESHOLD = 4;
/** After pressure threshold, keep heavy polls off even between single spawns (~20s). */
export const VILLAGER_RECOVERY_DEFER_TICKS = 400;
/** Ticks between addon slices after a villager batch (mob cache, log, …). */
export const VILLAGER_SPAWN_WORK_SPREAD_INTERVAL = 5;
/** While spreading, block heavy entity polls (~3s base, extended per queued batch). */
export const VILLAGER_SPAWN_SPREAD_BASE_TICKS = 60;
/** Gap since last villager spawn → reentry (pause then more eggs / village approach). */
export const VILLAGER_QUIET_REENTRY_TICKS = 100;
/** Min game ticks between routine single-spawn Content Log lines (reduces warn spam). */
const VILLAGER_LOG_MIN_INTERVAL_TICKS = 14;
/** Max pending spawns before one flush line; larger batches collapse silently during pressure. */
const VILLAGER_FLUSH_LOG_MIN_PENDING = 12;
const VILLAGER_FLUSH_LOG_MIN_INTERVAL_TICKS = 40;
/** Keep addon polls quiet for this long after any villager spawn (egg session / village). */
const VILLAGER_ADDON_SESSION_TICKS = 400;
const VILLAGER_MOB_CACHE_CLEAR_COOLDOWN = 300;
/** Same-tick adult count at or above this → skip mob-cache clear, longer spread slices. */
const VILLAGER_HEAVY_BATCH_ADULTS = 3;
const VILLAGER_HEAVY_SPREAD_INTERVAL = 10;
/** Same-tick spawns at or above this → no spread pipeline (logs show 48/tick engine stalls). */
export const VILLAGER_MEGA_BATCH_ADULTS = 8;
/** Ultra burst: max defer/standdown immediately on spawn tick. */
const VILLAGER_ULTRA_BATCH_ADULTS = 16;

let villagerBurstDeferUntil = 0;
let villagerSpawnSpreadUntil = 0;
let villagerPressureUntil = 0;
let villagerAddonSessionUntil = 0;
let lastVillagerMobCacheClearTick = -999999;
let villagerSpawnBatchReentry = false;
/** Rolling spawn count for pressure (no per-spawn array growth). */
let villagerSpawnWindowCount = 0;
let villagerSpawnWindowStartTick = -1;
let lastVillagerSpawnTick = -1;
let villagerSpawnLogCount = 0;

let villagerSpawnBatchTick = -1;
/** Last spawn tick before the current batch tick (for reentry gap). */
let villagerSpawnBatchGapPrevTick = -1;
let villagerSpawnBatchCount = 0;
let villagerSpawnBatchLastType = "";
let villagerSpawnBatchLastLoc = "";
let villagerSpawnBatchLogQueued = false;
let villagerSpawnBatchSyncLogged = false;
/** Spawns recorded since last Content Log line (sync); catches hitch ticks before system.run runs. */
let villagerSpawnsSinceLastLog = 0;
/** Game-tick span for pending log lines (flush only — not one-tick batch size). */
let villagerSpawnLogPendingFirstTick = -1;
let villagerSpawnLogPendingLastTick = -1;
let villagerSpawnBatchFirstTick = -1;
let villagerSpawnLogFlushIntervalId = null;
/** Adults spawned this tick — drained once via system.run (absorbs chunk-load gulps). */
let villagerPendingSpawnCount = 0;
let villagerPendingSpawnTick = -1;
let villagerPendingLastType = "";
/** @type {import("@minecraft/server").Entity | null} */
let villagerPendingLastEntity = null;
let villagerEndOfTickDrainScheduled = false;
/** Per-tick sync bump so paced eggs do not queue a drain each time. */
let villagerSyncQuietBumpTick = -1;
/** @type {{ spawnTick: number, count: number, wasDeferred: boolean, underPressure: boolean, skipMobCacheClear: boolean, reentrySpawn: boolean, step: number } | null} */
let activeVillagerSpreadJob = null;
/** @type {Array<{ spawnTick: number, count: number, wasDeferred: boolean, underPressure: boolean, skipMobCacheClear: boolean, reentrySpawn: boolean, step: number }>} */
const villagerSpreadJobQueue = [];
let villagerSpreadPumpPending = false;
/** Avoid duplicate Content Log lines for the same tick+source only. */
let lastVillagerSpawnLogKey = "";
let lastVillagerRoutineLogTick = -999;
let lastVillagerFlushLogTick = -999;
let villagerSpawnLogWatchStarted = false;

/** Pre-arm entity quiet when the player uses a villager spawn egg (before entitySpawn). */
const VILLAGER_SPAWN_EGG_TYPES = new Set([
    "minecraft:villager_spawn_egg",
    "minecraft:wandering_trader_spawn_egg"
]);

/**
 * Baby villagers use lighter vanilla AI — do not run adult burst/defer pipeline.
 * @param {import("@minecraft/server").Entity} [entity]
 */
function isBabyVillagerEntity(entity) {
    if (!entity) return false;
    try {
        if (entity.isBaby === true) return true;
    } catch {
        /* ignore */
    }
    try {
        const baby = entity.getComponent?.("minecraft:is_baby");
        if (baby) return true;
    } catch {
        /* ignore */
    }
    try {
        const ageable = entity.getComponent?.("minecraft:ageable");
        if (ageable?.isBaby === true) return true;
    } catch {
        /* ignore */
    }
    return false;
}

/**
 * @param {"defer" | "flush"} source
 */
function resetVillagerSpawnLogPending() {
    villagerSpawnsSinceLastLog = 0;
    villagerSpawnLogPendingFirstTick = -1;
    villagerSpawnLogPendingLastTick = -1;
    villagerSpawnBatchFirstTick = -1;
}

function noteVillagerSpawnForPendingLog(spawnTick, add = 1) {
    const n = Math.max(1, Math.min(add, 64));
    villagerSpawnsSinceLastLog += n;
    if (villagerSpawnLogPendingFirstTick < 0) {
        villagerSpawnLogPendingFirstTick = spawnTick;
    }
    villagerSpawnLogPendingLastTick = spawnTick;
}

function shouldEmitVillagerSpawnLogNow(tick, countThisTick, source, pending = 0) {
    if (source === "flush") {
        if (pending <= 0) return false;
        if (isVillagerPressureActive() && pending < VILLAGER_FLUSH_LOG_MIN_PENDING) return false;
        return (
            pending >= VILLAGER_FLUSH_LOG_MIN_PENDING * 2 ||
            tick - lastVillagerFlushLogTick >= VILLAGER_FLUSH_LOG_MIN_INTERVAL_TICKS
        );
    }
    if (isVillagerPressureActive()) return false;
    if (countThisTick >= 2 || countThisTick >= VILLAGER_MEGA_BATCH_ADULTS) return true;
    return tick - lastVillagerRoutineLogTick >= VILLAGER_LOG_MIN_INTERVAL_TICKS;
}

function emitVillagerSpawnLogLine(source) {
    const tick = villagerSpawnBatchTick;
    if (tick < 0) return;

    const countThisTick = villagerSpawnBatchCount;
    const pending = villagerSpawnsSinceLastLog;
    const count = source === "flush" ? pending : countThisTick;
    if (count <= 0) return;
    if (!shouldEmitVillagerSpawnLogNow(tick, countThisTick, source, pending)) return;

    const logKey = source === "flush" ? `flush:${pending}:${villagerSpawnLogPendingLastTick}` : `${tick}:defer`;
    if (logKey === lastVillagerSpawnLogKey) return;
    lastVillagerSpawnLogKey = logKey;

    const spanFirst =
        villagerSpawnLogPendingFirstTick >= 0 ? villagerSpawnLogPendingFirstTick : tick;
    const spanLast =
        villagerSpawnLogPendingLastTick >= 0 ? villagerSpawnLogPendingLastTick : tick;

    villagerSpawnLogCount += count;
    resetVillagerSpawnLogPending();

    const vilLeft = getVillagerBurstDeferTicksRemaining();
    const chunkEdge = isAnyChunkEdgeDeferActive();
    const sdLeft = getZeroBearStanddownTicksRemaining();
    const pressureLeft = getVillagerPressureTicksRemaining();
    const mega = source !== "flush" && countThisTick >= VILLAGER_MEGA_BATCH_ADULTS ? " mega=1" : "";

    let countPart;
    if (source === "flush") {
        countPart = `flush pending=${count} tickSpan=${spanFirst}-${spanLast} lastBatchTick=${tick} countThisTick=${countThisTick}`;
    } else {
        countPart = `tick=${tick} countThisTick=${countThisTick}`;
    }

    const muteLeft = getVillagerEntityQueryMuteTicksRemaining();
    console.warn(
        `[VILLAGER SPAWN] ${countPart}${mega} adults last=${villagerSpawnBatchLastType}${villagerSpawnBatchLastLoc} ` +
            `vilDefer=${vilLeft}t entityQuiet=${muteLeft}t pressure=${pressureLeft}t recent=${getRecentVillagerSpawnCount()} ` +
            `session=${villagerSpawnLogCount} spread=${getVillagerSpawnSpreadTicksRemaining()}t reentry=${villagerSpawnBatchReentry ? 1 : 0} ` +
            `chunkEdge=${chunkEdge} standdown=${sdLeft}t`
    );

    villagerSpawnBatchLogQueued = false;
    villagerSpawnBatchSyncLogged = false;
    if (source === "flush") {
        lastVillagerFlushLogTick = tick;
    } else {
        lastVillagerRoutineLogTick = tick;
    }
}

function flushStaleVillagerSpawnLog() {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || villagerSpawnsSinceLastLog <= 0) return;
    if (isVillagerPressureActive()) return;
    const now = system.currentTick;
    const anchor = villagerSpawnBatchFirstTick >= 0 ? villagerSpawnBatchFirstTick : villagerSpawnBatchTick;
    if (anchor < 0) return;
    if (now - anchor < 3) return;
    if (villagerSpawnBatchLogQueued && now - villagerSpawnBatchTick <= 2) return;
    emitVillagerSpawnLogLine("flush");
}

function scheduleVillagerSpawnBatchLog() {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS) return;
    if (villagerSpawnBatchFirstTick < 0) {
        villagerSpawnBatchFirstTick = villagerSpawnBatchTick;
    }
    if (villagerSpawnBatchLogQueued) return;
    villagerSpawnBatchLogQueued = true;
    system.run(() => {
        emitVillagerSpawnLogLine("defer");
    });
}

function ensureVillagerSpawnLogWatch() {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || villagerSpawnLogWatchStarted) return;
    villagerSpawnLogWatchStarted = true;
    initializeVillagerSpawnLogWatch();
}

/** Dev: flush spawn lines if game ticks stall during a hitch (system.run delayed). */
export function initializeVillagerSpawnLogWatch() {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || villagerSpawnLogFlushIntervalId !== null) return;
    villagerSpawnLogFlushIntervalId = system.runInterval(() => {
        try {
            flushStaleVillagerSpawnLog();
        } catch {
            /* ignore */
        }
    }, 40);
}

function clearVillagerSpreadBacklog() {
    villagerSpreadJobQueue.length = 0;
    activeVillagerSpreadJob = null;
    villagerSpreadPumpPending = false;
    resetVillagerSpawnLogPending();
}

/** @param {number} tick
 * @param {number} [count]
 */
function noteVillagerSpawnForPressure(tick, count = 1) {
    const n = Math.max(1, Math.min(count, 32));
    if (
        villagerSpawnWindowStartTick < 0 ||
        tick - villagerSpawnWindowStartTick > VILLAGER_PRESSURE_WINDOW_TICKS
    ) {
        villagerSpawnWindowStartTick = tick;
        villagerSpawnWindowCount = 0;
    }
    villagerSpawnWindowCount += n;
    lastVillagerSpawnTick = tick;
    if (villagerSpawnWindowCount >= VILLAGER_PRESSURE_SPAWN_THRESHOLD) {
        villagerPressureUntil = Math.max(villagerPressureUntil, tick + VILLAGER_RECOVERY_DEFER_TICKS);
        clearVillagerSpreadBacklog();
    }
}

function recordVillagerSpawnPressure(tick) {
    noteVillagerSpawnForPressure(tick, 1);
}

function recordVillagerSpawnPressureForBatch(spawnTick, count) {
    noteVillagerSpawnForPressure(spawnTick, count);
}

function recordVillagerSpawnPressureBulk(spawnTick, count) {
    noteVillagerSpawnForPressure(spawnTick, Math.min(count, 16));
    if (count >= VILLAGER_ULTRA_BATCH_ADULTS) {
        villagerPressureUntil = Math.max(
            villagerPressureUntil,
            spawnTick + VILLAGER_RECOVERY_DEFER_TICKS * 2
        );
    }
}

function applyMegaBatchDeferOnSpawnTick(tick, count) {
    villagerAddonSessionUntil = Math.max(
        villagerAddonSessionUntil,
        tick + VILLAGER_ADDON_SESSION_TICKS + (count >= VILLAGER_ULTRA_BATCH_ADULTS ? VILLAGER_ADDON_SESSION_TICKS : 0)
    );
    villagerBurstDeferUntil = Math.max(villagerBurstDeferUntil, tick + VILLAGER_SPAWN_DEFER_MAX_TICKS);
    villagerPressureUntil = Math.max(villagerPressureUntil, tick + VILLAGER_RECOVERY_DEFER_TICKS);
    extendZeroBearStanddown(VILLAGER_SPAWN_DEFER_MAX_TICKS);
    extendVillagerSpawnSpreadWindow(Math.min(count * 2, 100));
}

export function isVillagerAddonSessionActive() {
    return system.currentTick < villagerAddonSessionUntil;
}

function tryClearMobCacheForVillagerSpawn() {
    const t = system.currentTick;
    if (t - lastVillagerMobCacheClearTick < VILLAGER_MOB_CACHE_CLEAR_COOLDOWN) return false;
    lastVillagerMobCacheClearTick = t;
    try {
        clearMobCache();
    } catch {
        /* ignore */
    }
    return true;
}

/** Arm entity-query mute before villagers exist (spawn egg use). */
export function primeVillagerSpawnEntityQuiet() {
    const tick = system.currentTick;
    extendVillagerEntityQueryMute(VILLAGER_ENTITY_QUERY_MUTE_TICKS);
    villagerBurstDeferUntil = Math.max(villagerBurstDeferUntil, tick + 40);
    villagerAddonSessionUntil = Math.max(villagerAddonSessionUntil, tick + 80);
}

function bumpVillagerSpawnQuietTimers(tick) {
    if (tick === villagerSyncQuietBumpTick) return;
    villagerSyncQuietBumpTick = tick;
    extendVillagerEntityQueryMute(VILLAGER_ENTITY_QUERY_MUTE_TICKS);
    villagerBurstDeferUntil = Math.max(villagerBurstDeferUntil, tick + 40);
    villagerAddonSessionUntil = Math.max(villagerAddonSessionUntil, tick + 80);
}

/**
 * entitySpawn (sync): count only. If already in pressure / day-0 zero-bear, extend quiet timers and stop
 * (no system.run drain — second dispenser wave was hitching on "catch-up" drain + dev trace).
 * @param {string} typeId
 * @param {import("@minecraft/server").Entity} [entity]
 */
function noteVillagerEntitySpawn(typeId, entity) {
    if (shouldSleepDayZeroWorldWork("villager_listen")) return;
    if (isBabyVillagerEntity(entity)) return;
    const tick = system.currentTick;
    if (!shouldSleepDayZeroWorldWork("villager_quiet")) {
        bumpVillagerSpawnQuietTimers(tick);
    }
    if (shouldSleepDayZeroWorldWork("villager_spawn")) return;

    if (villagerPendingSpawnTick < 0) {
        villagerPendingSpawnTick = tick;
    }
    villagerPendingSpawnCount++;
    if (villagerPendingSpawnCount <= 12) {
        villagerPendingLastType = typeId;
        villagerPendingLastEntity = entity ?? null;
    }

    if (isEarlyWorldZeroBearPhase() || tick < villagerPressureUntil) {
        return;
    }

    scheduleVillagerSpawnDrain();
}

function scheduleVillagerSpawnDrain() {
    if (villagerEndOfTickDrainScheduled) return;
    villagerEndOfTickDrainScheduled = true;
    system.run(() => {
        villagerEndOfTickDrainScheduled = false;
        drainVillagerSpawnsAfterTick();
    });
}

/**
 * One addon reaction per game tick per villager batch (1 egg or 40 chunk spawns → one drain).
 */
function drainVillagerSpawnsAfterTick() {
    const count = villagerPendingSpawnCount;
    const tick = villagerPendingSpawnTick >= 0 ? villagerPendingSpawnTick : system.currentTick;

    villagerPendingSpawnCount = 0;
    villagerPendingSpawnTick = -1;

    if (count <= 0) return;

    const alreadyPressure = tick < villagerPressureUntil;

    if (tick !== villagerSpawnBatchTick) {
        villagerSpawnBatchGapPrevTick = lastVillagerSpawnTick;
        villagerSpawnBatchTick = tick;
        villagerSpawnBatchSyncLogged = false;
    }
    villagerSpawnBatchCount = count;
    villagerSpawnBatchLastType = villagerPendingLastType;
    villagerSpawnBatchLastLoc = "";
    if (count <= 12 && villagerPendingLastEntity) {
        try {
            const l = villagerPendingLastEntity.location;
            villagerSpawnBatchLastLoc = l
                ? ` pos=${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`
                : "";
        } catch {
            villagerSpawnBatchLastLoc = "";
        }
    }
    villagerPendingLastType = "";
    villagerPendingLastEntity = null;

    extendVillagerEntityQueryMute(VILLAGER_ENTITY_QUERY_MUTE_TICKS);
    villagerBurstDeferUntil = Math.max(villagerBurstDeferUntil, tick + 40);
    villagerAddonSessionUntil = Math.max(villagerAddonSessionUntil, tick + 80);
    noteVillagerSpawnForPressure(tick, count);

    if (alreadyPressure || tick < villagerPressureUntil) {
        return;
    }

    if (count >= VILLAGER_MEGA_BATCH_ADULTS) {
        applyMegaBatchDeferOnSpawnTick(tick, count);
    }

    /** Day 0–3 with no bears: polls already off — skip finalize/spread/logs (even 1–3 eggs hitch here). */
    if (isEarlyWorldZeroBearPhase()) {
        return;
    }

    ensureVillagerSpawnLogWatch();
    noteVillagerSpawnForPendingLog(tick, count);
    finalizeVillagerSpawnBatch();
}

/**
 * @param {number} tick
 * @param {number} count
 * @param {boolean} forceFullDefer
 * @param {boolean} wasDeferred
 */
function applyVillagerDeferGates(tick, count, forceFullDefer, wasDeferred) {
    const extra = Math.min(
        VILLAGER_SPAWN_DEFER_MAX_TICKS - VILLAGER_SPAWN_DEFER_TICKS,
        Math.max(0, count - 1) * VILLAGER_SPAWN_DEFER_PER_EXTRA_IN_TICK
    );
    const fullDeferLen = VILLAGER_SPAWN_DEFER_TICKS + extra;
    const dripSpawn = wasDeferred && count === 1 && extra === 0 && !forceFullDefer;

    if (forceFullDefer || count >= 2) {
        villagerBurstDeferUntil = Math.max(villagerBurstDeferUntil, tick + fullDeferLen);
        extendZeroBearStanddown(fullDeferLen);
    } else if (dripSpawn) {
        villagerBurstDeferUntil = Math.min(
            Math.max(villagerBurstDeferUntil, tick) + VILLAGER_SPAWN_DEFER_DRIP_TICKS,
            tick + VILLAGER_SPAWN_DEFER_MAX_TICKS
        );
        extendZeroBearStanddown(VILLAGER_SPAWN_DEFER_DRIP_TICKS);
    } else {
        villagerBurstDeferUntil = Math.max(villagerBurstDeferUntil, tick + fullDeferLen);
        extendZeroBearStanddown(fullDeferLen);
    }

    if (isVillagerPressureActive()) {
        villagerPressureUntil = Math.max(villagerPressureUntil, tick + VILLAGER_RECOVERY_DEFER_TICKS);
    }
}

function extendVillagerSpawnSpreadWindow(extraTicks = 0) {
    const now = system.currentTick;
    const add = VILLAGER_SPAWN_SPREAD_BASE_TICKS + Math.max(0, extraTicks);
    villagerSpawnSpreadUntil = Math.max(villagerSpawnSpreadUntil, now + add);
}

function scheduleVillagerSpreadPump(intervalTicks = VILLAGER_SPAWN_WORK_SPREAD_INTERVAL) {
    if (villagerSpreadPumpPending) return;
    villagerSpreadPumpPending = true;
    const delay = Math.max(VILLAGER_SPAWN_WORK_SPREAD_INTERVAL, intervalTicks);
    system.runTimeout(() => {
        villagerSpreadPumpPending = false;
        pumpVillagerSpreadQueue();
    }, delay);
}

/** One light slice per interval — never mob cache + log + pressure in one tick. */
function pumpVillagerSpreadQueue() {
    if (!activeVillagerSpreadJob) {
        activeVillagerSpreadJob = villagerSpreadJobQueue.shift() ?? null;
        if (!activeVillagerSpreadJob) return;
        activeVillagerSpreadJob.step = 0;
    }

    const job = activeVillagerSpreadJob;
    extendVillagerSpawnSpreadWindow();

    switch (job.step) {
        case 0: {
            if (job.count >= VILLAGER_MEGA_BATCH_ADULTS) {
                recordVillagerSpawnPressureBulk(job.spawnTick, job.count);
            } else if (job.count > 1) {
                recordVillagerSpawnPressureForBatch(job.spawnTick, job.count);
            } else {
                recordVillagerSpawnPressure(job.spawnTick);
            }
            job.step = 1;
            scheduleVillagerSpreadPump();
            return;
        }
        case 1:
            if (!job.skipMobCacheClear && job.count < VILLAGER_HEAVY_BATCH_ADULTS) {
                tryClearMobCacheForVillagerSpawn();
            }
            job.step = 2;
            scheduleVillagerSpreadPump(
                job.count >= VILLAGER_HEAVY_BATCH_ADULTS ? VILLAGER_HEAVY_SPREAD_INTERVAL : VILLAGER_SPAWN_WORK_SPREAD_INTERVAL
            );
            return;
        case 2:
            job.step = 3;
            scheduleVillagerSpreadPump(
                job.count >= VILLAGER_HEAVY_BATCH_ADULTS ? VILLAGER_HEAVY_SPREAD_INTERVAL : VILLAGER_SPAWN_WORK_SPREAD_INTERVAL
            );
            return;
        default:
            activeVillagerSpreadJob = null;
            if (villagerSpreadJobQueue.length > 0) {
                scheduleVillagerSpreadPump();
            }
            return;
    }
}

/**
 * Skip multi-tick spread pump when polls are already quiet — avoids backlog hitch
 * when a few eggs land after a paced session (reentry + pressure still active).
 */
function shouldSkipVillagerSpreadPipeline(count, ctx) {
    if (count >= VILLAGER_MEGA_BATCH_ADULTS) return true;
    const pressureNow = ctx.underPressure || isVillagerPressureActive();
    if (pressureNow || isVillagerAddonSessionActive() || ctx.wasDeferred) return true;
    if (count >= VILLAGER_HEAVY_BATCH_ADULTS) return false;
    return count <= 2 || ctx.reentrySpawn;
}

/**
 * @param {{ spawnTick: number, count: number, wasDeferred: boolean, underPressure: boolean, skipMobCacheClear: boolean, reentrySpawn: boolean, step: number }} job
 */
function enqueueVillagerSpreadJob(job) {
    const spreadInterval =
        job.count >= VILLAGER_HEAVY_BATCH_ADULTS
            ? VILLAGER_HEAVY_SPREAD_INTERVAL
            : VILLAGER_SPAWN_WORK_SPREAD_INTERVAL;

    const tail = villagerSpreadJobQueue[villagerSpreadJobQueue.length - 1];
    if (
        tail &&
        !activeVillagerSpreadJob &&
        tail.spawnTick === job.spawnTick &&
        job.count < VILLAGER_HEAVY_BATCH_ADULTS &&
        tail.count < VILLAGER_HEAVY_BATCH_ADULTS
    ) {
        tail.count += job.count;
        tail.skipMobCacheClear = tail.skipMobCacheClear || job.skipMobCacheClear;
        tail.reentrySpawn = tail.reentrySpawn || job.reentrySpawn;
        scheduleVillagerSpreadPump(spreadInterval);
        return;
    }

    villagerSpreadJobQueue.push(job);
    scheduleVillagerSpreadPump(spreadInterval);
}

/** Defer gates now; mob cache + log spread across ticks (runs once after spawn batch). */
function finalizeVillagerSpawnBatch() {
    const tick = villagerSpawnBatchTick;
    const count = villagerSpawnBatchCount;
    if (count <= 0 || tick < 0) return;

    extendVillagerEntityQueryMute(
        Math.max(VILLAGER_ENTITY_QUERY_MUTE_TICKS, getVillagerBurstDeferTicksRemaining())
    );

    const wasDeferred = tick < villagerBurstDeferUntil;
    const underPressure = tick < villagerPressureUntil;
    const pressureActive = underPressure || isVillagerPressureActive();

    const gapSinceLast =
        villagerSpawnBatchGapPrevTick >= 0 ? tick - villagerSpawnBatchGapPrevTick : 999999;
    const reentrySpawn =
        villagerSpawnBatchGapPrevTick >= 0 && gapSinceLast > VILLAGER_QUIET_REENTRY_TICKS;
    const fastPace = count === 1 && gapSinceLast < VILLAGER_FAST_SPAWN_GAP_TICKS;
    const burstQuiet = tick >= villagerBurstDeferUntil;
    /** Reentry after pause: full defer only when burst timers expired and pressure is off. */
    const forceFullDefer =
        fastPace || count >= 2 || (reentrySpawn && burstQuiet && !pressureActive);

    villagerAddonSessionUntil = Math.max(villagerAddonSessionUntil, tick + VILLAGER_ADDON_SESSION_TICKS);
    if (reentrySpawn && count >= 2 && !pressureActive) {
        villagerPressureUntil = Math.max(villagerPressureUntil, tick + VILLAGER_RECOVERY_DEFER_TICKS);
    }

    applyVillagerDeferGates(tick, Math.min(count, 24), forceFullDefer, wasDeferred || pressureActive);

    villagerSpawnBatchReentry = reentrySpawn;

    if (count >= VILLAGER_MEGA_BATCH_ADULTS) {
        recordVillagerSpawnPressureBulk(tick, count);
        if (count >= VILLAGER_HEAVY_BATCH_ADULTS) {
            villagerPressureUntil = Math.max(villagerPressureUntil, tick + VILLAGER_RECOVERY_DEFER_TICKS);
        }
        extendVillagerSpawnSpreadWindow(Math.min(count * 2, 100));
        if (INCLUDE_FULL_DEVELOPER_TOOLS) {
            emitVillagerSpawnLogLine("defer");
        }
        return;
    }

    const skipSpread = shouldSkipVillagerSpreadPipeline(count, {
        wasDeferred,
        underPressure,
        reentrySpawn
    });

    if (skipSpread) {
        recordVillagerSpawnPressureForBatch(tick, count);
        villagerBurstDeferUntil = Math.max(
            villagerBurstDeferUntil,
            tick + Math.min(VILLAGER_SPAWN_DEFER_DRIP_TICKS, 80)
        );
        if (INCLUDE_FULL_DEVELOPER_TOOLS) {
            scheduleVillagerSpawnBatchLog();
        }
        return;
    }

    extendVillagerSpawnSpreadWindow(count * 3);

    if (count >= VILLAGER_HEAVY_BATCH_ADULTS) {
        villagerPressureUntil = Math.max(villagerPressureUntil, tick + VILLAGER_RECOVERY_DEFER_TICKS);
    }

    const skipMobCacheClear =
        count >= 2 ||
        wasDeferred ||
        underPressure ||
        isVillagerAddonSessionActive() ||
        reentrySpawn;

    if (INCLUDE_FULL_DEVELOPER_TOOLS) {
        scheduleVillagerSpawnBatchLog();
    }

    enqueueVillagerSpreadJob({
        spawnTick: tick,
        count,
        wasDeferred,
        underPressure,
        skipMobCacheClear,
        reentrySpawn,
        step: 0
    });
}

/** Spawns in the current game tick (for debug HUD). */
export function getVillagerSpawnsThisTick() {
    const tick = system.currentTick;
    let n = tick === villagerSpawnBatchTick ? villagerSpawnBatchCount : 0;
    if (tick === villagerPendingSpawnTick) {
        n += villagerPendingSpawnCount;
    }
    return n;
}

/** True when several villagers spawned in one tick (typical egg spam hitch). */
export function isHeavyVillagerSpawnTick() {
    return getVillagerSpawnsThisTick() >= VILLAGER_MEGA_BATCH_ADULTS;
}

/** True while villager/trader spawn defer is active (spawn eggs / village load). */
export function isVillagerBurstDeferActive() {
    return system.currentTick < villagerBurstDeferUntil;
}

export function getVillagerBurstDeferTicksRemaining() {
    return Math.max(0, villagerBurstDeferUntil - system.currentTick);
}

/** True after several villager spawns in a short window — keeps polls quiet between later single spawns. */
export function isVillagerPressureActive() {
    return system.currentTick < villagerPressureUntil;
}

export function getVillagerPressureTicksRemaining() {
    return Math.max(0, villagerPressureUntil - system.currentTick);
}

export function getRecentVillagerSpawnCount() {
    const tick = system.currentTick;
    if (
        villagerSpawnWindowStartTick < 0 ||
        tick - villagerSpawnWindowStartTick > VILLAGER_PRESSURE_WINDOW_TICKS
    ) {
        return 0;
    }
    return villagerSpawnWindowCount;
}

/** True while post-spawn addon work is intentionally spread across ticks. */
export function isVillagerSpawnWorkSpreading() {
    return system.currentTick < villagerSpawnSpreadUntil;
}

export function getVillagerSpawnSpreadTicksRemaining() {
    return Math.max(0, villagerSpawnSpreadUntil - system.currentTick);
}

/**
 * @returns {boolean} True on day 0–1 when work should be spread aggressively.
 */
export function isSpreadThrottleActive() {
    try {
        return getCurrentDay() <= SPREAD_THROTTLE_DAY_MAX;
    } catch {
        return false;
    }
}

/** Days 2–3: spread entity/metrics work (chunk scans still day 2+ only). */
export function isVillageEntitySpreadActive() {
    if (isSpreadThrottleActive()) return true;
    try {
        return getCurrentDay() <= VILLAGE_ENTITY_SPREAD_DAY_MAX;
    } catch {
        return false;
    }
}

/** Entity queries use section grid when day 0–3 spread or metrics spread is on. */
export function isEntityQuerySpreadActive() {
    return isVillageEntitySpreadActive() || isMetricsSpreadActive();
}

/** @returns {boolean} True while any player is in post-chunk-edge defer window. */
export function isAnyChunkEdgeDeferActive() {
    const now = system.currentTick;
    for (const until of playerChunkEdgeDeferUntil.values()) {
        if (now < until) return true;
    }
    return false;
}

/** @param {string} [playerId]
 * @returns {boolean}
 */
export function isPlayerChunkEdgeDeferActive(playerId) {
    if (!playerId) return isAnyChunkEdgeDeferActive();
    return system.currentTick < (playerChunkEdgeDeferUntil.get(playerId) ?? 0);
}

/**
 * @returns {string|null} Why burst defer is active, or null if not deferring.
 */
export function getVillageBurstDeferReason() {
    if (shouldPauseDayZeroAddonLoops()) return "addon_loops_paused";
    if (isEngineBacklogQuietActive()) return "engine_backlog";
    if (isVillagerEntityQueryMuteActive()) return "villager_query_mute";
    if (isAnyChunkEdgeDeferActive()) return "chunk_edge";
    if (isVillagerBurstDeferActive()) return "villager_burst";
    if (isVillagerPressureActive()) return "villager_pressure";
    if (isVillagerSpawnWorkSpreading()) return "villager_spawn_spread";
    if (isVillagerAddonSessionActive()) return "villager_session";
    return null;
}

/**
 * Skip non-critical polls right after crossing a chunk boundary (village approach).
 * @param {string} [_category]
 */
export function shouldDeferVillageBurst(_category) {
    return getVillageBurstDeferReason() != null;
}

/**
 * Defer heavy abandoned-village horizon scans only — NOT chunk-edge defer (players walk to lamps
 * across chunks) and NOT lamp artifact cleanup / lamp-arrival activation.
 * @param {string} [_category]
 */
export function shouldDeferAbandonedVillageHorizonScan(_category) {
    return (
        shouldPauseDayZeroAddonLoops() ||
        isEngineBacklogQuietActive() ||
        isVillagerEntityQueryMuteActive() ||
        isVillagerBurstDeferActive() ||
        isVillagerPressureActive() ||
        isVillagerSpawnWorkSpreading() ||
        isVillagerAddonSessionActive()
    );
}

/**
 * Call from a light interval (e.g. 20t) — extends defer when players cross 16-block chunks.
 */
export function tickPlayerChunkEdgeWatch() {
    const now = system.currentTick;
    try {
        for (const p of world.getAllPlayers()) {
            if (!p?.isValid || !p.id || !p.location) continue;
            const cx = Math.floor(p.location.x / VANILLA_CHUNK_BLOCKS);
            const cz = Math.floor(p.location.z / VANILLA_CHUNK_BLOCKS);
            const key = `${cx},${cz}`;
            const prev = playerVanillaChunkKey.get(p.id);
            playerVanillaChunkKey.set(p.id, key);
            if (prev != null && prev !== key) {
                playerChunkEdgeDeferUntil.set(p.id, now + CHUNK_EDGE_DEFER_TICKS);
                if (
                    !isVillagerBurstDeferActive() &&
                    !isVillagerPressureActive() &&
                    !isVillagerAddonSessionActive() &&
                    !isHeavyVillagerSpawnTick()
                ) {
                    try {
                        clearMobCache();
                    } catch {
                        /* ignore */
                    }
                }
            }
        }
    } catch {
        /* ignore */
    }
    for (const [pid, until] of playerChunkEdgeDeferUntil.entries()) {
        if (now >= until) playerChunkEdgeDeferUntil.delete(pid);
    }
    for (const [pid] of playerVanillaChunkKey.entries()) {
        if (!world.getAllPlayers().some((p) => p?.id === pid)) {
            playerVanillaChunkKey.delete(pid);
            playerChunkEdgeDeferUntil.delete(pid);
        }
    }
}

/** @returns {number} Interval multiplier (1 or SPREAD_THROTTLE_MULT). */
export function getSpreadThrottleMult() {
    return isSpreadThrottleActive() ? SPREAD_THROTTLE_MULT : 1;
}

/**
 * Gate periodic work: returns true at most once per (baseInterval × throttle mult) ticks per category.
 * @param {string} category
 * @param {number} baseIntervalTicks nominal spacing at normal throttle
 */
export function claimSpreadSlice(category, baseIntervalTicks) {
    if (!isScriptEnabled(SCRIPT_IDS.workSpread)) return false;
    const now = system.currentTick;
    const eff = Math.max(1, Math.floor(baseIntervalTicks * getEffectiveSpreadMult()));
    const last = sliceLastTick.get(category) ?? -999999;
    if (now - last < eff) return false;
    sliceLastTick.set(category, now);
    return true;
}

/**
 * Pick one player per call (round-robin) while throttling MP; otherwise all players.
 * @param {import("@minecraft/server").Player[]} players
 * @param {string} category
 * @returns {import("@minecraft/server").Player[]}
 */
export function spreadPlayersForWork(players, category) {
    if (!players?.length) return [];
    if (!isVillageEntitySpreadActive() || players.length <= 1) return players;
    let i = playerRotate.get(category) ?? 0;
    const picked = players[i % players.length];
    playerRotate.set(category, (i + 1) % players.length);
    return picked ? [picked] : [];
}

/** Mob cache TTL when a full refresh completed. */
export function getSpreadMobCacheCompletedTicks() {
    if (isSpreadThrottleActive()) return 50;
    if (isVillageEntitySpreadActive()) return 24;
    return 2;
}

/** Bear snapshot TTL when dimension has zero bears. */
export function getSpreadBearSnapshotEmptyTtl() {
    if (isSpreadThrottleActive()) return 240;
    if (isVillageEntitySpreadActive()) return 120;
    return 40;
}

/**
 * @param {number} nominalRadius full search radius when not throttling
 */
export function getSpreadEntityQueryRadius(nominalRadius) {
    if (!isEntityQuerySpreadActive()) return nominalRadius;
    return Math.min(nominalRadius, SPREAD_CELL_RADIUS);
}

/**
 * @param {{ x: number, y: number, z: number }} baseAnchor
 * @param {number} sectionIndex
 */
export function getSpreadSectionLocation(baseAnchor, sectionIndex) {
    const off = SPREAD_CELL_OFFSETS_XZ[sectionIndex % SPREAD_CELL_COUNT];
    return {
        x: baseAnchor.x + off.dx,
        y: baseAnchor.y,
        z: baseAnchor.z + off.dz
    };
}

/**
 * Advance section index for a category (per dimension).
 * @param {string} categoryKey
 * @returns {number} section index used this call
 */
export function nextSpreadSectionIndex(categoryKey) {
    const i = sectionRotate.get(categoryKey) ?? 0;
    sectionRotate.set(categoryKey, (i + 1) % SPREAD_CELL_COUNT);
    return i;
}

/**
 * Player feet positions in a dimension (for location-scoped entity queries).
 * @param {import("@minecraft/server").Dimension} dimension
 * @returns {{ x: number, y: number, z: number }[]}
 */
export function getPlayerAnchorsInDimension(dimension) {
    const out = [];
    if (!dimension?.id) return out;
    try {
        for (const p of world.getAllPlayers()) {
            if (!p?.isValid || p.dimension?.id !== dimension.id) continue;
            const loc = p.location;
            if (loc) out.push({ x: loc.x, y: loc.y, z: loc.z });
        }
    } catch {
        /* ignore */
    }
    return out;
}

/**
 * Merge entity lists; dedupe by id.
 * @param {import("@minecraft/server").Entity[]} prior
 * @param {import("@minecraft/server").Entity[]} added
 * @returns {import("@minecraft/server").Entity[]}
 */
export function mergeEntitiesById(prior, added) {
    const seen = new Set();
    const out = [];
    for (const e of [...(prior || []), ...(added || [])]) {
        if (!e?.id) continue;
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        out.push(e);
    }
    return out;
}

/**
 * One small section per call when throttling; full nominal sphere when not.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {string} categoryKey unique key per consumer (e.g. "mobCache:overworld")
 * @param {{ x: number, y: number, z: number }} baseAnchor
 * @param {number} nominalRadius
 * @param {object} options getEntities filter (type, families, excludeTypes, …)
 * @returns {import("@minecraft/server").Entity[]}
 */
export function queryEntitiesOneSpreadSection(dimension, categoryKey, baseAnchor, nominalRadius, options = {}) {
    if (!dimension || !baseAnchor) return [];
    if (shouldSkipExpensiveEntityQueries(categoryKey)) {
        noteGenericEntityQuerySkipped();
        return [];
    }
    const dimId = dimension?.id ?? "?";
    const typeHint = options?.type ?? options?.families?.[0] ?? "";
    if (!isEntityQuerySpreadActive()) {
        try {
            const result =
                dimension.getEntities({
                    ...options,
                    location: baseAnchor,
                    maxDistance: nominalRadius
                }) ?? [];
            traceEntityQueryRun(
                categoryKey,
                `dim=${dimId} r=${nominalRadius} n=${result.length}${typeHint ? ` t=${typeHint}` : ""}`
            );
            return result;
        } catch {
            return [];
        }
    }
    const secIdx = nextSpreadSectionIndex(categoryKey);
    const loc = getSpreadSectionLocation(baseAnchor, secIdx);
    try {
        const result =
            dimension.getEntities({
                ...options,
                location: loc,
                maxDistance: SPREAD_CELL_RADIUS
            }) ?? [];
        traceEntityQueryRun(
            categoryKey,
            `dim=${dimId} cell=${secIdx} r=${SPREAD_CELL_RADIUS} n=${result.length}${typeHint ? ` t=${typeHint}` : ""}`
        );
        return result;
    } catch {
        return [];
    }
}

/**
 * Full query immediately, or one section while throttling (call every tick to cover 3×3 grid).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {string} categoryKey
 * @param {{ x: number, y: number, z: number }} baseAnchor
 * @param {number} nominalRadius
 * @param {object} options
 * @returns {import("@minecraft/server").Entity[]}
 */
export function queryEntitiesSpread(dimension, categoryKey, baseAnchor, nominalRadius, options = {}) {
    return queryEntitiesOneSpreadSection(dimension, categoryKey, baseAnchor, nominalRadius, options);
}

/**
 * Gated wrapper for direct `dimension.getEntities` call sites (mining, storms, etc.).
 * @returns {import("@minecraft/server").Entity[]}
 */
export function safeQueryEntitiesNear(dimension, categoryKey, baseAnchor, nominalRadius, options = {}) {
    return queryEntitiesOneSpreadSection(dimension, categoryKey, baseAnchor, nominalRadius, options);
}

function getVillagerQuietTicksRemaining() {
    return Math.max(
        getVillagerBurstDeferTicksRemaining(),
        getVillagerPressureTicksRemaining(),
        isVillagerAddonSessionActive() ? Math.max(0, villagerAddonSessionUntil - system.currentTick) : 0,
        isVillagerSpawnWorkSpreading() ? getVillagerSpawnSpreadTicksRemaining() : 0
    );
}

registerVillagerQuietTicksRemaining(getVillagerQuietTicksRemaining);

registerVillagerDeferChecker(
    () =>
        isVillagerBurstDeferActive() ||
        isVillagerPressureActive() ||
        isVillagerSpawnWorkSpreading() ||
        isVillagerAddonSessionActive()
);

registerEngineBacklogHandler((skippedTicks) => {
    const tick = system.currentTick;
    const extra = Math.min(VILLAGER_SPAWN_DEFER_MAX_TICKS, Math.max(80, skippedTicks * 30));
    villagerBurstDeferUntil = Math.max(villagerBurstDeferUntil, tick + extra);
    villagerAddonSessionUntil = Math.max(villagerAddonSessionUntil, tick + extra);
    if (skippedTicks >= 6) {
        villagerPressureUntil = Math.max(villagerPressureUntil, tick + VILLAGER_RECOVERY_DEFER_TICKS);
    }
});

try {
    if (typeof world !== "undefined" && world?.afterEvents?.entitySpawn) {
        world.afterEvents.entitySpawn.subscribe((event) => {
            try {
                if (isVillagerSuppressionEnabled()) return;
                if (shouldSleepDayZeroWorldWork("villager_listen")) return;
                const entity = event?.entity;
                const typeId = entity?.typeId;
                if (!typeId || !VILLAGER_BURST_TYPES.has(typeId)) return;
                try {
                    if (entity?.isBaby === true) return;
                } catch {
                    /* ignore */
                }
                noteVillagerEntitySpawn(typeId, entity);
            } catch {
                /* ignore */
            }
        });
    }
} catch {
    /* world not ready at import */
}

try {
    if (typeof world !== "undefined" && world?.afterEvents?.itemUse) {
        world.afterEvents.itemUse.subscribe((event) => {
            try {
                if (isVillagerSuppressionEnabled()) return;
                if (shouldSleepDayZeroWorldWork("villager_quiet")) return;
                const itemId = event?.itemStack?.typeId;
                if (!itemId || !VILLAGER_SPAWN_EGG_TYPES.has(itemId)) return;
                primeVillagerSpawnEntityQuiet();
            } catch {
                /* ignore */
            }
        });
    }
} catch {
    /* world not ready at import */
}
