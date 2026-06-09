/**
 * Adaptive budgets for abandoned-village worldgen — same signals as spawn load,
 * performance profile (lag comfort, wall stress, mob pressure), and work-spread deferrals.
 */

import { system } from "@minecraft/server";
import { getCachedPlayers } from "./mb_sharedCache.js";
import {
    getAiIntervalStretch,
    getLagComfortLevel,
    getPerfMobPressureForSpawn01,
    getPerfWallStress01,
    getPlayerThriftTier
} from "./mb_performanceProfile.js";
import { getSpawnBlockBudgetScale } from "./mb_spawnLoadMetrics.js";
import { shouldDeferAbandonedVillageHorizonScan } from "./mb_workSpread.js";

const BASE_SCAN_INTERVAL_TICKS = 20;
const BASE_ACTIVATIONS_PER_SCAN = 3;
const BASE_PROCESSOR_BLOCKS_PER_TICK = 160;
const BASE_BUILD_BLOCKS_PER_TICK = 12;
const BASE_LAMP_CLEANUP_INTERVAL_TICKS = 40;

/**
 * @typedef {{
 *   tick: number,
 *   playerCount: number,
 *   thriftTier: number,
 *   lagComfort: number,
 *   load01: number,
 *   deferHorizonScan: boolean,
 *   scanIntervalTicks: number,
 *   activationsPerScan: number,
 *   processorBlocksPerTick: number,
 *   buildBlocksPerTick: number,
 *   scanRadiusScale: number,
 *   horizonRotatePlayers: boolean,
 *   lampCleanupIntervalTicks: number
 * }} AbandonedVillagePerfBudget
 */

/** @type {AbandonedVillagePerfBudget | null} */
let cachedBudget = null;
let cachedBudgetTick = -1;

function computeWorldLoad01() {
    const blockScale = getSpawnBlockBudgetScale();
    const wall = getPerfWallStress01();
    const mob = getPerfMobPressureForSpawn01();
    return Math.min(1, (1 - blockScale) * 0.55 + wall * 0.25 + mob * 0.2);
}

/**
 * Recompute once per game tick (cheap reads from cached spawn/perf probes).
 * @param {number} [tick]
 * @returns {AbandonedVillagePerfBudget}
 */
export function refreshAbandonedVillagePerf(tick = system.currentTick) {
    if (cachedBudget && cachedBudgetTick === tick) return cachedBudget;
    cachedBudgetTick = tick;

    const players = getCachedPlayers() || [];
    const playerCount = Math.max(1, players.length);
    const thriftTier = getPlayerThriftTier();
    const stretch = getAiIntervalStretch();
    const lagComfort = getLagComfortLevel();
    const load01 = computeWorldLoad01();
    const blockScale = getSpawnBlockBudgetScale();
    const deferHorizonScan = shouldDeferAbandonedVillageHorizonScan("avWorldgen");

    let scanIntervalTicks = Math.round(BASE_SCAN_INTERVAL_TICKS * stretch);
    if (lagComfort >= 3) scanIntervalTicks = Math.round(scanIntervalTicks * 1.2);
    if (load01 > 0.55) scanIntervalTicks = Math.round(scanIntervalTicks * (1 + load01 * 0.3));
    scanIntervalTicks = Math.min(80, Math.max(BASE_SCAN_INTERVAL_TICKS, scanIntervalTicks));

    let activationsPerScan = Math.max(1, Math.round(BASE_ACTIVATIONS_PER_SCAN / Math.sqrt(playerCount)));
    if (thriftTier >= 2) activationsPerScan = Math.max(1, activationsPerScan - 1);
    if (thriftTier >= 3 || load01 > 0.65) activationsPerScan = 1;

    let processorBlocksPerTick = Math.round(BASE_PROCESSOR_BLOCKS_PER_TICK * blockScale);
    if (thriftTier >= 3) processorBlocksPerTick = Math.round(processorBlocksPerTick * 0.8);
    if (load01 > 0.5) processorBlocksPerTick = Math.round(processorBlocksPerTick * (1 - load01 * 0.2));
    processorBlocksPerTick = Math.max(48, Math.min(BASE_PROCESSOR_BLOCKS_PER_TICK, processorBlocksPerTick));

    let buildBlocksPerTick = Math.round(BASE_BUILD_BLOCKS_PER_TICK * blockScale);
    if (thriftTier >= 2) buildBlocksPerTick = Math.max(5, buildBlocksPerTick - 1);
    if (load01 > 0.6) buildBlocksPerTick = Math.max(4, buildBlocksPerTick - 2);

    let scanRadiusScale = blockScale;
    if (playerCount >= 3) scanRadiusScale *= 0.9;
    if (playerCount >= 5) scanRadiusScale *= 0.85;
    scanRadiusScale = Math.max(0.68, Math.min(1, scanRadiusScale));

    let lampCleanupIntervalTicks = Math.round(BASE_LAMP_CLEANUP_INTERVAL_TICKS * stretch);
    if (load01 > 0.5) lampCleanupIntervalTicks = Math.round(lampCleanupIntervalTicks * 1.15);
    lampCleanupIntervalTicks = Math.min(100, Math.max(BASE_LAMP_CLEANUP_INTERVAL_TICKS, lampCleanupIntervalTicks));

    cachedBudget = {
        tick,
        playerCount,
        thriftTier,
        lagComfort,
        load01,
        deferHorizonScan,
        scanIntervalTicks,
        activationsPerScan,
        processorBlocksPerTick,
        buildBlocksPerTick,
        scanRadiusScale,
        horizonRotatePlayers: playerCount >= 2,
        lampCleanupIntervalTicks
    };
    return cachedBudget;
}

/** @returns {AbandonedVillagePerfBudget} */
export function getAbandonedVillagePerfBudget() {
    return refreshAbandonedVillagePerf(system.currentTick);
}

/** Blocks placed per settlement build tick (feeds mb_abandonedSettlementBuilder). */
export function getSettlementBuildBlocksPerTick() {
    return getAbandonedVillagePerfBudget().buildBlocksPerTick;
}

/**
 * One-line debug for journal / self-test.
 * @returns {string}
 */
export function formatAbandonedVillagePerfBudget() {
    const b = getAbandonedVillagePerfBudget();
    return (
        `players=${b.playerCount} thrift=${b.thriftTier} load=${b.load01.toFixed(2)} ` +
        `scan=${b.scanIntervalTicks}t act=${b.activationsPerScan} build=${b.buildBlocksPerTick}/t ` +
        `proc=${b.processorBlocksPerTick}/t rScale=${b.scanRadiusScale.toFixed(2)} ` +
        `deferHorizon=${b.deferHorizonScan ? 1 : 0} rotHorizon=${b.horizonRotatePlayers ? 1 : 0}`
    );
}
