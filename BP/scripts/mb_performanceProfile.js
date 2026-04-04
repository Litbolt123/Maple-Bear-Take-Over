/**
 * World-wide performance tuning: journal "Have lag?" tiers, optional manual overrides,
 * and helpers for storm/mining work cadence. Spawn spatial auto-tuning flag lives here
 * (read by mb_spawnController without this module importing spawn).
 *
 * Adaptive auto (default lag tier only / mild on "a little"): there is no Script API MSPT.
 * We approximate "spikes" with wall-clock ms per game tick (median over a short window) and
 * heavy Maple Bear counts (weighted: mining > buff / flying / torpedo). Both nudge storm +
 * mining work multipliers only when storm/mining are on auto (not manual overrides).
 */

import { system, world } from "@minecraft/server";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";

/** 0 = default / auto-balanced (no journal bundle), 1 = a little, 2 = mid, 3 = laggy */
export const LAG_COMFORT_PROPERTY = "mb_lag_comfort";

/** 1 = use spatial clusters for spawn scan budgets (default). 0 = treat as fully spread (max MP-style cost). */
export const SPATIAL_SPAWN_TUNING_PROPERTY = "mb_spawn_spatial_tuning";

/** Optional manual storm interval multiplier (1–4). Unset = derive from lag comfort + player count. */
export const STORM_WORK_MULT_PROPERTY = "mb_storm_work_mult";

/** Optional manual mining AI load multiplier (1–3). Unset = derive from lag comfort + players. */
export const MINING_WORK_MULT_PROPERTY = "mb_mining_work_mult";

/** Set to 1 to disable adaptive mob + wall-clock nudges (storm/mining auto only). */
export const PERF_DISABLE_ADAPTIVE_PROPERTY = "mb_perf_disable_adaptive";

const DIMENSION_IDS = ["overworld", "nether", "the_end"];

/** Weighted toward script-heavy bears (mining highest). */
const EXPENSIVE_MB_TYPES = [
    ["mb:mining_mb", 1.35],
    ["mb:mining_mb_day20", 1.35],
    ["mb:buff_mb", 0.95],
    ["mb:buff_mb_day13", 0.95],
    ["mb:buff_mb_day20", 0.95],
    ["mb:flying_mb", 0.95],
    ["mb:flying_mb_day15", 0.95],
    ["mb:flying_mb_day20", 0.95],
    ["mb:torpedo_mb", 0.95],
    ["mb:torpedo_mb_day20", 0.95]
];

/** ~this weighted entity sum → mob pressure ~1.0 */
const MOB_WEIGHT_SCORE_FOR_FULL_PRESSURE = 52;

const MSPT_WINDOW_MAX = 22;
const IDEAL_MS_PER_TICK = 50;
/** Median ms/tick above this contributes to wall stress 0–1 */
const WALL_STRESS_MS_OVER = 22;

let adaptiveWatchStarted = false;
let lastSampleWallMs = -1;
let lastSampleGameTick = -1;
/** @type {number[]} */
const msPerTickSamples = [];
let cachedWeightedMobScore = 0;

function isAdaptiveProbeEnabled() {
    const v = getWorldProperty(PERF_DISABLE_ADAPTIVE_PROPERTY);
    return !(v === 1 || v === true || v === "1");
}

function medianSorted(arr) {
    if (!arr.length) return IDEAL_MS_PER_TICK;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

function getWallClockStress01() {
    if (msPerTickSamples.length < 6) return 0;
    const med = medianSorted(msPerTickSamples);
    return Math.min(1, Math.max(0, (med - IDEAL_MS_PER_TICK) / WALL_STRESS_MS_OVER));
}

/** For mb_spawnLoadMetrics probe registration (spawn scaling). */
export function getPerfWallStress01() {
    return getWallClockStress01();
}

function getCachedMobLoadPressure01() {
    return Math.min(1.35, cachedWeightedMobScore / MOB_WEIGHT_SCORE_FOR_FULL_PRESSURE);
}

/** For mb_spawnLoadMetrics probe registration (spawn scaling). */
export function getPerfMobPressureForSpawn01() {
    return getCachedMobLoadPressure01();
}

/**
 * Extra multiplier on storm + mining auto work (>=1). Capped so manual tiers stay meaningful.
 */
function getAdaptiveWorkMultiplierAddon() {
    if (!isAdaptiveProbeEnabled()) return 1;

    const comfort = getLagComfortLevel();
    if (comfort >= 3) return 1;

    const mobP = getCachedMobLoadPressure01();
    let mobBoost = 1 + Math.min(0.36, mobP * 0.2);
    if (comfort === 2) {
        mobBoost = 1 + Math.min(0.1, mobP * 0.06);
    }

    let tickBoost = 1;
    if (comfort <= 1) {
        const stress = getWallClockStress01();
        const scale = comfort === 0 ? 1 : 0.42;
        tickBoost = 1 + Math.min(0.3, stress * 0.26) * scale;
    }

    return Math.min(1.52, mobBoost * tickBoost);
}

function recordWallClockSample() {
    const now = Date.now();
    const g = system.currentTick;
    if (lastSampleWallMs >= 0 && lastSampleGameTick >= 0) {
        const dWall = now - lastSampleWallMs;
        const dTick = g - lastSampleGameTick;
        if (dTick > 0 && dWall > 0 && dWall < 20000) {
            const mpt = dWall / dTick;
            if (Number.isFinite(mpt) && mpt < 500) {
                msPerTickSamples.push(mpt);
                while (msPerTickSamples.length > MSPT_WINDOW_MAX) msPerTickSamples.shift();
            }
        }
    }
    lastSampleWallMs = now;
    lastSampleGameTick = g;
}

function refreshExpensiveMobLoadCache() {
    let score = 0;
    for (const dimId of DIMENSION_IDS) {
        let dim;
        try {
            dim = world.getDimension(dimId);
        } catch {
            continue;
        }
        if (!dim) continue;
        for (const [typeId, w] of EXPENSIVE_MB_TYPES) {
            try {
                const ents = dim.getEntities({ type: typeId });
                score += (ents?.length || 0) * w;
            } catch {
                /* ignore */
            }
        }
    }
    cachedWeightedMobScore = score;
}

/**
 * Call once from main.js after the property handler is up. Idempotent.
 */
export function initializeAdaptivePerformanceWatch() {
    if (adaptiveWatchStarted) return;
    adaptiveWatchStarted = true;
    try {
        system.runInterval(() => {
            try {
                recordWallClockSample();
            } catch {
                /* ignore */
            }
        }, 1);
        system.runInterval(() => {
            try {
                refreshExpensiveMobLoadCache();
            } catch {
                /* ignore */
            }
        }, 40);
    } catch {
        /* ignore */
    }
}

/** Dev / debug: snapshot of adaptive inputs (optional UI). */
export function getAdaptivePerfDebugSnapshot() {
    return {
        adaptiveAddon: getAdaptiveWorkMultiplierAddon(),
        weightedMobScore: cachedWeightedMobScore,
        mobPressure: getCachedMobLoadPressure01(),
        wallStress01: getWallClockStress01(),
        medianMsPerTick: msPerTickSamples.length ? medianSorted(msPerTickSamples) : 0,
        msptSampleCount: msPerTickSamples.length
    };
}

export function getLagComfortLevel() {
    const raw = getWorldProperty(LAG_COMFORT_PROPERTY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 3) return Math.floor(n);
    return 0;
}

export function setLagComfortLevel(level) {
    const n = Math.max(0, Math.min(3, Math.floor(Number(level) || 0)));
    setWorldProperty(LAG_COMFORT_PROPERTY, n);
}

/** When true (default), spawn uses cluster-aware load. When false, budgets use full dimension player count. */
export function isSpatialSpawnTuningEnabled() {
    const raw = getWorldProperty(SPATIAL_SPAWN_TUNING_PROPERTY);
    if (raw === undefined || raw === null || raw === "") return true;
    return !(raw === 0 || raw === false || raw === "0");
}

export function setSpatialSpawnTuningEnabled(enabled) {
    setWorldProperty(SPATIAL_SPAWN_TUNING_PROPERTY, enabled ? 1 : 0);
}

function getPlayerCountSafe() {
    try {
        const pl = world.getAllPlayers();
        return pl && pl.length > 0 ? pl.length : 1;
    } catch {
        return 1;
    }
}

/**
 * Storm / snow work runs less often when multiplier > 1 (longer effective intervals).
 */
export function getStormWorkIntervalMultiplier() {
    const manual = Number(getWorldProperty(STORM_WORK_MULT_PROPERTY));
    if (Number.isFinite(manual) && manual >= 1 && manual <= 4) {
        return manual;
    }
    const lag = getLagComfortLevel();
    const baseFromLag = [1, 1.22, 1.55, 2.05][lag] ?? 1;
    const pc = getPlayerCountSafe();
    const spreadBoost = lag === 0 ? 1 + Math.min(0.35, Math.max(0, pc - 1) * 0.06) : 1;
    const adaptive = getAdaptiveWorkMultiplierAddon();
    return Math.min(4, baseFromLag * spreadBoost * adaptive);
}

/**
 * Mining AI idle tick interval scales up with this (more load = run less often per bear batch).
 */
export function getMiningWorkMultiplier() {
    const manual = Number(getWorldProperty(MINING_WORK_MULT_PROPERTY));
    if (Number.isFinite(manual) && manual >= 1 && manual <= 3) {
        return manual;
    }
    const lag = getLagComfortLevel();
    const baseFromLag = [1, 1.12, 1.38, 1.72][lag] ?? 1;
    const pc = getPlayerCountSafe();
    const spreadBoost = lag === 0 ? 1 + Math.min(0.28, Math.max(0, pc - 1) * 0.05) : 1;
    const adaptive = getAdaptiveWorkMultiplierAddon();
    return Math.min(3, baseFromLag * spreadBoost * adaptive);
}

export function setStormWorkMultiplierManual(value) {
    if (value === undefined || value === null || value === "") {
        setWorldProperty(STORM_WORK_MULT_PROPERTY, 0);
        return;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) {
        setWorldProperty(STORM_WORK_MULT_PROPERTY, 0);
        return;
    }
    setWorldProperty(STORM_WORK_MULT_PROPERTY, Math.min(4, n));
}

export function setMiningWorkMultiplierManual(value) {
    if (value === undefined || value === null || value === "") {
        setWorldProperty(MINING_WORK_MULT_PROPERTY, 0);
        return;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) {
        setWorldProperty(MINING_WORK_MULT_PROPERTY, 0);
        return;
    }
    setWorldProperty(MINING_WORK_MULT_PROPERTY, Math.min(3, n));
}

/** 0 = use auto (lag + players). */
export function getStormWorkManualOrZero() {
    const manual = Number(getWorldProperty(STORM_WORK_MULT_PROPERTY));
    if (Number.isFinite(manual) && manual >= 1 && manual <= 4) return manual;
    return 0;
}

export function getMiningWorkManualOrZero() {
    const manual = Number(getWorldProperty(MINING_WORK_MULT_PROPERTY));
    if (Number.isFinite(manual) && manual >= 1 && manual <= 3) return manual;
    return 0;
}
