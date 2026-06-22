/**

 * Adaptive budgets for abandoned-village worldgen — same signals as spawn load,

 * performance profile (lag comfort, wall stress, mob pressure), and work-spread deferrals.

 */



import { system } from "@minecraft/server";

import { getCachedPlayers } from "./mb_sharedCache.js";

import { getCurrentDay } from "./mb_dayTracker.js";

import {

    getAiIntervalStretch,

    getLagComfortLevel,

    getPerfMobPressureForSpawn01,

    getPerfWallStress01,

    getPlayerThriftTier

} from "./mb_performanceProfile.js";

import { getSpawnBlockBudgetScale } from "./mb_spawnLoadMetrics.js";

import { shouldDeferAbandonedVillageHorizonScan } from "./mb_workSpread.js";

import {

    SETTLEMENT_BUILD_PAUSE_DIST,

    SETTLEMENT_HUD_CENTER_DIST

} from "./mb_abandonedVillageConstants.js";



const BASE_SCAN_INTERVAL_TICKS = 20;

const BASE_ACTIVATIONS_PER_SCAN = 3;

const BASE_PROCESSOR_BLOCKS_PER_TICK = 160;

const BASE_BUILD_BLOCKS_PER_TICK = 12;

const BASE_LAMP_CLEANUP_INTERVAL_TICKS = 40;



/** Spawn metrics under-report load before day 2 — floor when village work is active nearby. */

const DAY01_LOAD_FLOOR = 0.4;

const DAY01_MAX_PROCESSOR_PER_TICK = 48;

const DAY01_MIN_SCAN_INTERVAL = 40;



const OUTER_BAND_BUILD_MULT = 0.6;



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

 *   lampCleanupIntervalTicks: number,

 *   idle: boolean,

 *   nearInterest: boolean,

 *   nearLamp: boolean

 * }} AbandonedVillagePerfBudget

 */



/** @type {AbandonedVillagePerfBudget | null} */

let cachedBudget = null;

let cachedBudgetTick = -1;

/** @type {string} */

let cachedBudgetKey = "";



/**

 * @param {boolean} idle

 * @param {boolean} nearInterest

 * @returns {number}

 */

function computeWorldLoad01(idle, nearInterest) {

    const blockScale = getSpawnBlockBudgetScale();

    const wall = getPerfWallStress01();

    const mob = getPerfMobPressureForSpawn01();

    let load01 = Math.min(1, (1 - blockScale) * 0.55 + wall * 0.25 + mob * 0.2);

    try {

        if (getCurrentDay() < 2 && !(idle && !nearInterest)) {

            load01 = Math.max(load01, DAY01_LOAD_FLOOR);

        }

    } catch {

        /* ignore */

    }

    return load01;

}



/**

 * Witness band full budget; mid band ~60%; beyond pause dist caller should not build.

 * @param {number} baseBudget

 * @param {number} distBlocks

 * @returns {number}

 */

export function resolveSettlementBuildBudget(baseBudget, distBlocks) {

    if (!Number.isFinite(distBlocks) || distBlocks > SETTLEMENT_BUILD_PAUSE_DIST) return 0;

    if (distBlocks <= SETTLEMENT_HUD_CENTER_DIST) return baseBudget;

    return Math.max(1, Math.round(baseBudget * OUTER_BAND_BUILD_MULT));

}



/**

 * Recompute once per game tick (cheap reads from cached spawn/perf probes).

 * @param {number} [tick]

 * @param {{ idle?: boolean, nearInterest?: boolean, nearLamp?: boolean }} [opts]

 * @returns {AbandonedVillagePerfBudget}

 */

export function refreshAbandonedVillagePerf(tick = system.currentTick, opts = {}) {

    const idle = opts.idle === true;

    const nearInterest = opts.nearInterest === true;

    const nearLamp = opts.nearLamp === true;

    const cacheKey = `${idle ? 1 : 0}:${nearInterest ? 1 : 0}:${nearLamp ? 1 : 0}`;

    if (cachedBudget && cachedBudgetTick === tick && cachedBudgetKey === cacheKey) return cachedBudget;

    cachedBudgetTick = tick;

    cachedBudgetKey = cacheKey;



    const players = getCachedPlayers() || [];

    const playerCount = Math.max(1, players.length);

    const thriftTier = getPlayerThriftTier();

    const stretch = getAiIntervalStretch();

    const lagComfort = getLagComfortLevel();

    const load01 = computeWorldLoad01(idle, nearInterest);

    const blockScale = getSpawnBlockBudgetScale();

    const deferHorizonScan = shouldDeferAbandonedVillageHorizonScan("avWorldgen");

    let earlyDay = false;

    try {

        earlyDay = getCurrentDay() < 2;

    } catch {

        /* ignore */

    }



    let scanIntervalTicks = Math.round(BASE_SCAN_INTERVAL_TICKS * stretch);

    if (lagComfort >= 3) scanIntervalTicks = Math.round(scanIntervalTicks * 1.2);

    if (load01 > 0.55) scanIntervalTicks = Math.round(scanIntervalTicks * (1 + load01 * 0.3));

    if (earlyDay) scanIntervalTicks = Math.max(DAY01_MIN_SCAN_INTERVAL, scanIntervalTicks);

    let scanIntervalMax = 80;

    if (nearLamp) {

        scanIntervalTicks = BASE_SCAN_INTERVAL_TICKS;

        scanIntervalMax = BASE_SCAN_INTERVAL_TICKS;

    } else if (idle) {

        scanIntervalTicks = Math.round(scanIntervalTicks * (earlyDay ? 8 : 4));

        scanIntervalMax = earlyDay ? 320 : 160;

        if (earlyDay) scanIntervalTicks = Math.max(160, scanIntervalTicks);

    }

    scanIntervalTicks = Math.min(scanIntervalMax, Math.max(BASE_SCAN_INTERVAL_TICKS, scanIntervalTicks));



    let activationsPerScan = Math.max(1, Math.round(BASE_ACTIVATIONS_PER_SCAN / Math.sqrt(playerCount)));

    if (thriftTier >= 2) activationsPerScan = Math.max(1, activationsPerScan - 1);

    if (thriftTier >= 3 || load01 > 0.65) activationsPerScan = 1;



    let processorBlocksPerTick = Math.round(BASE_PROCESSOR_BLOCKS_PER_TICK * blockScale);

    if (thriftTier >= 3) processorBlocksPerTick = Math.round(processorBlocksPerTick * 0.8);

    if (load01 > 0.5) processorBlocksPerTick = Math.round(processorBlocksPerTick * (1 - load01 * 0.2));

    processorBlocksPerTick = Math.max(48, Math.min(BASE_PROCESSOR_BLOCKS_PER_TICK, processorBlocksPerTick));

    if (earlyDay) processorBlocksPerTick = Math.min(processorBlocksPerTick, DAY01_MAX_PROCESSOR_PER_TICK);

    if (idle && !nearInterest) processorBlocksPerTick = Math.min(processorBlocksPerTick, DAY01_MAX_PROCESSOR_PER_TICK);



    let buildBlocksPerTick = Math.round(BASE_BUILD_BLOCKS_PER_TICK * blockScale);

    if (thriftTier >= 2) buildBlocksPerTick = Math.max(5, buildBlocksPerTick - 1);

    if (load01 > 0.6) buildBlocksPerTick = Math.max(4, buildBlocksPerTick - 2);



    let scanRadiusScale = blockScale;

    if (playerCount >= 3) scanRadiusScale *= 0.9;

    if (playerCount >= 5) scanRadiusScale *= 0.85;

    scanRadiusScale = Math.max(0.68, Math.min(1, scanRadiusScale));



    let lampCleanupIntervalTicks = Math.round(BASE_LAMP_CLEANUP_INTERVAL_TICKS * stretch);

    if (load01 > 0.5) lampCleanupIntervalTicks = Math.round(lampCleanupIntervalTicks * 1.15);

    if (idle) lampCleanupIntervalTicks = Math.round(lampCleanupIntervalTicks * (earlyDay ? 4 : 2));

    lampCleanupIntervalTicks = Math.min(idle && earlyDay ? 200 : 100, Math.max(BASE_LAMP_CLEANUP_INTERVAL_TICKS, lampCleanupIntervalTicks));



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

        lampCleanupIntervalTicks,

        idle,

        nearInterest,

        nearLamp

    };

    return cachedBudget;

}



/**

 * @param {{ idle?: boolean, nearInterest?: boolean }} [opts]

 * @returns {AbandonedVillagePerfBudget}

 */

export function getAbandonedVillagePerfBudget(opts = {}) {

    return refreshAbandonedVillagePerf(system.currentTick, opts);

}



/**

 * @param {{ idle?: boolean, nearInterest?: boolean }} [opts]

 * @returns {number}

 */

export function getSettlementBuildBlocksPerTick(opts = {}) {

    return getAbandonedVillagePerfBudget(opts).buildBlocksPerTick;

}



/**

 * One-line debug for journal / self-test.

 * @param {{ idle?: boolean, nearInterest?: boolean, nearLamp?: boolean, active?: boolean }} [opts]

 * @returns {string}

 */

export function formatAbandonedVillagePerfBudget(opts = {}) {

    const b = getAbandonedVillagePerfBudget(opts);

    const active = opts.active === true ? 1 : 0;

    const lamp = opts.nearLamp === true || b.nearLamp ? 1 : 0;

    return (

        `players=${b.playerCount} thrift=${b.thriftTier} load=${b.load01.toFixed(2)} ` +

        `scan=${b.scanIntervalTicks}t act=${b.activationsPerScan} build=${b.buildBlocksPerTick}/t ` +

        `proc=${b.processorBlocksPerTick}/t rScale=${b.scanRadiusScale.toFixed(2)} ` +

        `deferHorizon=${b.deferHorizonScan ? 1 : 0} rotHorizon=${b.horizonRotatePlayers ? 1 : 0} ` +

        `idle=${b.idle ? 1 : 0} near=${b.nearInterest ? 1 : 0} lamp=${lamp} active=${active} ` +

        `lampClean=${b.lampCleanupIntervalTicks}t`

    );

}


