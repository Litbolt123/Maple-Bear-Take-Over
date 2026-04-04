/**
 * Spawn load snapshot: Maple Bear entity counts, item entities (overworld sample), active dust storms,
 * plus optional probes for wall-clock tick stress and weighted mob pressure (registered from main.js).
 * Drives cheaper spawn scanning when the world is heavy — only affects spawn work, not game rules.
 */

import { system, world } from "@minecraft/server";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";

/** 1 = apply auto scaling from world snapshot + probes (default). 0 = bias presets only. */
export const SPAWN_LOAD_AUTO_PROPERTY = "mb_spawn_load_auto";

/** 0–4 manual thrift tier on top of (or instead of) auto. */
export const SPAWN_LOAD_BIAS_PROPERTY = "mb_spawn_load_bias";

const DIMENSION_IDS = ["overworld", "nether", "the_end"];

/** All addon bear / infected mobs that add ongoing script or pathfinding load. */
const ALL_MB_MOB_TYPES = [
    "mb:mb_day00",
    "mb:mb_day04",
    "mb:mb_day08",
    "mb:mb_day13",
    "mb:mb_day20",
    "mb:infected",
    "mb:infected_day08",
    "mb:infected_day13",
    "mb:infected_day20",
    "mb:infected_pig",
    "mb:infected_cow",
    "mb:buff_mb",
    "mb:buff_mb_day13",
    "mb:buff_mb_day20",
    "mb:flying_mb",
    "mb:flying_mb_day15",
    "mb:flying_mb_day20",
    "mb:mining_mb",
    "mb:mining_mb_day20",
    "mb:torpedo_mb",
    "mb:torpedo_mb_day20"
];

const ITEM_ENTITY_TYPE = "minecraft:item";

const probes = {
    storm: () => 0,
    wallStress: () => 0,
    mobPressure: () => 0
};

/** Re-query bear totals at least this often so load model reacts to population spikes. */
const BEAR_COUNT_REFRESH_INTERVAL_TICKS = 24;
let lastBearRefreshTick = -999999;
let lastItemRefreshTick = -999999;
let cachedBearTotal = 0;
let cachedItemTotal = 0;

let cachedIntervalMult = 1;
let cachedBlockScale = 1;

let scalerWatchStarted = false;

/**
 * Wire storm count + perf probes (wall stress, weighted mob pressure). Safe to call multiple times.
 * @param {{ storm?: () => number, wallStress?: () => number, mobPressure?: () => number }} partial
 */
export function registerSpawnLoadProbes(partial) {
    if (partial.storm) probes.storm = partial.storm;
    if (partial.wallStress) probes.wallStress = partial.wallStress;
    if (partial.mobPressure) probes.mobPressure = partial.mobPressure;
}

export function isSpawnLoadAutoEnabled() {
    const v = getWorldProperty(SPAWN_LOAD_AUTO_PROPERTY);
    if (v === undefined || v === null || v === "") return true;
    return !(v === 0 || v === false || v === "0");
}

export function setSpawnLoadAutoEnabled(on) {
    setWorldProperty(SPAWN_LOAD_AUTO_PROPERTY, on ? 1 : 0);
}

export function getSpawnLoadBiasLevel() {
    const n = Number(getWorldProperty(SPAWN_LOAD_BIAS_PROPERTY));
    if (Number.isFinite(n) && n >= 0 && n <= 4) return Math.floor(n);
    return 0;
}

export function setSpawnLoadBiasLevel(level) {
    const n = Math.max(0, Math.min(4, Math.floor(Number(level) || 0)));
    setWorldProperty(SPAWN_LOAD_BIAS_PROPERTY, n);
}

function countBearsAllDimensions(tick) {
    if (tick - lastBearRefreshTick < BEAR_COUNT_REFRESH_INTERVAL_TICKS) return;
    lastBearRefreshTick = tick;
    let total = 0;
    for (const dimId of DIMENSION_IDS) {
        let dim;
        try {
            dim = world.getDimension(dimId);
        } catch {
            continue;
        }
        if (!dim) continue;
        for (const typeId of ALL_MB_MOB_TYPES) {
            try {
                const ents = dim.getEntities({ type: typeId });
                total += ents?.length || 0;
            } catch {
                /* ignore */
            }
        }
    }
    cachedBearTotal = total;
}

function countItemsOverworldThrottled(tick) {
    if (tick - lastItemRefreshTick < 120) return;
    lastItemRefreshTick = tick;
    try {
        const ow = world.getDimension("overworld");
        if (!ow) {
            cachedItemTotal = 0;
            return;
        }
        const items = ow.getEntities({ type: ITEM_ENTITY_TYPE });
        const n = items?.length || 0;
        cachedItemTotal = Math.min(n, 4000);
    } catch {
        cachedItemTotal = 0;
    }
}

function computeLoad01() {
    const t = cachedBearTotal;
    // Core curve (was too weak past ~90 bears: min(1,t/90)*0.26 capped bear signal at 0.26).
    const bearCore = Math.min(0.52, Math.min(1, t / 42) * 0.38);
    const bearTail = Math.min(0.42, Math.max(0, t - 28) / 95);
    const bearCombined = Math.min(0.88, bearCore + bearTail);
    const stormN = Math.min(1, Math.max(0, probes.storm()) / 4);
    const itemN = Math.min(1, cachedItemTotal / 1400);
    const wall = Math.min(1, Math.max(0, probes.wallStress()));
    const mobP = Math.min(1, Math.max(0, probes.mobPressure()));
    return Math.min(
        1,
        bearCombined + stormN * 0.16 + itemN * 0.12 + wall * 0.16 + mobP * 0.18
    );
}

function recomputeCachedMultipliers() {
    const bias = getSpawnLoadBiasLevel();
    const biasInt = [1, 1.06, 1.12, 1.22, 1.34][bias] ?? 1;
    const biasBlock = [1, 0.95, 0.9, 0.82, 0.72][bias] ?? 1;

    if (!isSpawnLoadAutoEnabled()) {
        cachedIntervalMult = Math.min(2.15, biasInt);
        cachedBlockScale = Math.max(0.52, biasBlock);
        return;
    }

    const load01 = computeLoad01();
    const autoInt = 1 + load01 * 0.55;
    const autoBlock = 1 - load01 * 0.28;
    cachedIntervalMult = Math.min(2.35, biasInt * autoInt);
    cachedBlockScale = Math.max(0.5, biasBlock * autoBlock);
}

/**
 * Refresh counts and recompute multipliers. Safe to call often; internal throttling for queries.
 * @param {number} tick system.currentTick
 */
export function refreshSpawnLoadMetrics(tick) {
    try {
        countBearsAllDimensions(tick);
        countItemsOverworldThrottled(tick);
        recomputeCachedMultipliers();
    } catch {
        /* ignore */
    }
}

/** Multiply main spawn controller interval (higher = less frequent full spawn ticks). */
export function getSpawnControllerIntervalMultiplier() {
    return cachedIntervalMult;
}

/** Multiply block-query budgets and candidate caps (lower = cheaper scans). */
export function getSpawnBlockBudgetScale() {
    return cachedBlockScale;
}

/** Stretch per-player block scan cooldowns (milder than full interval mult). */
export function getSpawnScanCooldownMultiplier() {
    const m = cachedIntervalMult;
    return Math.min(1.85, 1 + (m - 1) * 0.52);
}

export function getSpawnLoadDebugSnapshot() {
    return {
        bears: cachedBearTotal,
        itemsOw: cachedItemTotal,
        storms: probes.storm(),
        load01: computeLoad01(),
        intervalMult: cachedIntervalMult,
        blockScale: cachedBlockScale,
        scanCooldownMult: getSpawnScanCooldownMultiplier(),
        auto: isSpawnLoadAutoEnabled(),
        bias: getSpawnLoadBiasLevel()
    };
}

export function initializeSpawnLoadScalerWatch() {
    if (scalerWatchStarted) return;
    scalerWatchStarted = true;
    try {
        system.runTimeout(() => {
            try {
                refreshSpawnLoadMetrics(system.currentTick);
            } catch {
                /* ignore */
            }
        }, 4);
        system.runInterval(() => {
            try {
                refreshSpawnLoadMetrics(system.currentTick);
            } catch {
                /* ignore */
            }
        }, 40);
    } catch {
        /* ignore */
    }
}
