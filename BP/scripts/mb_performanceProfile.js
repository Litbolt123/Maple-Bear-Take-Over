/**
 * World-wide performance tuning: journal "Have lag?" tiers, optional manual overrides,
 * and helpers for storm/mining work cadence. Spawn spatial auto-tuning flag lives here
 * (read by mb_spawnController without this module importing spawn).
 */

import { world } from "@minecraft/server";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";

/** 0 = default / auto-balanced (no journal bundle), 1 = a little, 2 = mid, 3 = laggy */
export const LAG_COMFORT_PROPERTY = "mb_lag_comfort";

/** 1 = use spatial clusters for spawn scan budgets (default). 0 = treat as fully spread (max MP-style cost). */
export const SPATIAL_SPAWN_TUNING_PROPERTY = "mb_spawn_spatial_tuning";

/** Optional manual storm interval multiplier (1–4). Unset = derive from lag comfort + player count. */
export const STORM_WORK_MULT_PROPERTY = "mb_storm_work_mult";

/** Optional manual mining AI load multiplier (1–3). Unset = derive from lag comfort + players. */
export const MINING_WORK_MULT_PROPERTY = "mb_mining_work_mult";

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
    return Math.min(4, baseFromLag * spreadBoost);
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
    return Math.min(3, baseFromLag * spreadBoost);
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
