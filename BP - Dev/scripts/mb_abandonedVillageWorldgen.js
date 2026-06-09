/**
 * Abandoned settlements: vanilla villages disabled (worldgen_no_village).
 * Hybrid: seed-planned site grid (mb_abandonedVillageSites) + horizon activation when chunks load.
 */

import { system, world } from "@minecraft/server";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";
import { isScriptEnabled, SCRIPT_IDS } from "./mb_scriptToggles.js";
import { INCLUDE_FULL_DEVELOPER_TOOLS } from "./mb_buildConfig.js";
import {
    formatStructureCatalogManifest,
    layStructureCatalogPlatform,
    layoutPlainsStarterCatalog,
    STRUCTURE_CATALOG_Y
} from "./mb_abandonedStructureCatalog.js";
import {
    abortAllSettlementBuilds,
    abortSettlementBuildsForSiteCell,
    persistActiveSettlementBuildsForUnload,
    wakeSettlementBuildJob,
    clearLampColumnArtifacts,
    clearWorldgenArtifactsAt,
    hasWorldgenLampMarkerAt,
    findWorldgenLampMarkerNear,
    LAMP_MARKER_SEARCH_RADIUS,
    countLampColumnArtifacts,
    LAMP_ARTIFACT_COUNT_UNKNOWN,
    countWorldgenArtifactsAt,
    describeSettlementBuildQueue,
    diagnoseForcePlaceCenter,
    diagnoseSettlementCenter,
    enqueueSettlementBuild,
    getSettlementBuildJobForSite,
    getActiveSettlementBuildJobForSite,
    formatForcePlaceDiagnosis,
    formatSettlementCenterDiagnosis,
    getSettlementBuildQueueLength,
    getSettlementTier,
    JIGSAW_SCRIPT_VILLAGES_ENABLED,
    layoutForceStructure,
    layoutForceStructureComparePair,
    resolveForcePlaceCenter,
    resolveSettlementCenter,
    resolveSettlementCenterNearLamp,
    RUIN_MATERIALS_BY_RULESET,
    scheduleSettlementLadderPlacementsAfterRuin,
    SETTLEMENT_BLOCKS_PER_TICK,
    summarizeActiveSettlementBuildsForDebug,
    surfaceY,
    tryPlaceAddonJigsaw
} from "./mb_abandonedSettlementBuilder.js";
import {
    AV_DEBUG_LOG_ALL,
    AV_DEBUG_LOG_CAT,
    AV_DEBUG_LOG_DEFAULT,
    avLogBuildLine
} from "./mb_avDebugLog.js";
import {
    formatAbandonedVillagePerfBudget,
    getAbandonedVillagePerfBudget,
    refreshAbandonedVillagePerf
} from "./mb_abandonedVillagePerf.js";
import { SETTLEMENT_BUILD_PAUSE_DIST } from "./mb_abandonedVillageConstants.js";
import { getCachedPlayers } from "./mb_sharedCache.js";
import {
    clearSettlementBuildHudAtCenter,
    deliverSettlementCompleteNotify,
    notifyPlayersSettlementConstructionStarted
} from "./mb_abandonedVillageNotify.js";
import {
    SITE_GRID_BLOCKS,
    clearAbandonedVillageSiteRegistry,
    clearSiteFailedForLampArrival,
    reloadAbandonedVillageSiteRegistry,
    shouldSkipSiteActivationForExistingSettlement,
    collectActivatableSitesNearPlayer,
    collectLampArrivalSitesNearPlayer,
    lampArrivalCandidateAtGrid,
    LAMP_ARRIVAL_DIST_MAX,
    isSiteChunksReadyForActivation,
    lampMarkerChunkCoords,
    describeSiteRollChance,
    findLargeInfectedSitesNeedingVillage,
    getAbandonedVillageSiteRegistryStats,
    getSiteActivationDistances,
    infectedBiomeTierFromId,
    largeInfectedSlotsNearPlayer,
    LARGE_INFECTED_ACTIVATIONS_PER_SCAN,
    SITES_PER_LARGE_INFECTED_CELL,
    summarizeSiteScanNearPlayer,
    isSiteBuilt,
    isSitePending,
    isSiteFailed,
    isSiteIncomplete,
    tryClaimSiteForBuild,
    getBuiltSiteCenter,
    getIncompleteSiteCenter,
    markSiteBuilt,
    markSiteFailed,
    markSiteIncomplete,
    setSiteStructureManifest,
    clearSiteIncomplete,
    clearSitePending,
    persistedSiteHasScriptSettlementInWorld,
    resetSiteCell,
    resetSiteSlot,
    siteKey,
    worldToSiteGrid,
    siteCandidateAtWorld,
    sitePassesSeedRoll,
    siteSeedRollDenominator,
    lampMarkerWorldPosition,
    LAMP_APPROACH_DIST_MAX
} from "./mb_abandonedVillageSites.js";

export { AV_DEBUG_LOG_ALL, AV_DEBUG_LOG_CAT, AV_DEBUG_LOG_DEFAULT };

const CHUNK_PROP = "mb_abandoned_village_chunks";
const DEBUG_CHAT_PROP = "mb_av_debug_chat";
const DEBUG_LOG_PROP = "mb_av_debug_log";
const DEBUG_LOG_MASK_PROP = "mb_av_debug_log_mask";

const MAX_CHUNK_KEYS = 2000;
const SCAN_INTERVAL_TICKS = 20;
/** When nothing is building/processing, skip every other horizon scan (lamp arrivals still run). */
const IDLE_HORIZON_SCAN_SKIP = 2;
const ZOMBIFY_DELAY_TICKS = 100;
const MARK_RADIUS_CHUNKS = 6;
const BLOCKS_PER_PROCESSOR_TICK = 160;
/** Entity queries only — ruin pass uses tier radii below (much smaller than old 80-block cube). */
const VILLAGE_ENTITY_RADIUS = 56;
const RUIN_RADIUS_HAMLET = 34;
const RUIN_RADIUS_VILLAGE = 40;
const RUIN_RADIUS_LARGE = 48;
const SCAN_RADIUS_PROP = "mb_av_scan_radius";
const DEFAULT_SCAN_RADIUS_CHUNKS = 12;
/** Max placement attempts per scan when solo (scaled down with players / load). */
const CHUNKS_PER_SCAN_TICK = 3;
const MAX_SETTLEMENT_BUILDS_QUEUED = 2;
const MAX_PROCESSOR_JOBS = 2;
const FORCE_PLACE_PROCESS_RADIUS = 28;
/** Chunks to search for nearby infected biomes (denser hamlets near snow). */
const INFECTED_PROXIMITY_RADIUS_CHUNKS = 12;
/** Coarser chunk sampling inside proximity scan (4× fewer biome reads). */
const INFECTED_PROXIMITY_SAMPLE_STEP = 2;

/** Per-scan cache — getInfectedProximityTier is expensive (O(radius²) biome reads). */
const infectedProxCache = new Map();
/** @type {number} */
let idleHorizonScanStreak = 0;

/** @type {Set<string>} */
const chunkKeysMemory = new Set();
let watchStarted = false;

/** Live counters for journal debug (session). */
const avDebugStats = {
    scans: 0,
    skipChunkDone: 0,
    skipWrongBiome: 0,
    skipLostRoll: 0,
    skipNoSite: 0,
    placeSuccess: 0,
    placeFail: 0,
    lastBiome: "—",
    lastChunk: "—",
    lastUsedStructureId: "—",
    lastEvent: "—",
    lastFailureCode: "—",
    lastFailureSummary: "—",
    lastBuildManifest: "—",
    /** @type {string[]} */
    lastBuildStructures: []
};

/** @type {string|undefined} */
let lastPlaceFailureId = undefined;

/** @type {string|undefined} */
let lastPlacementFailureDetail = undefined;

/** @type {Map<string, { dimId: string, cx: number, cz: number, y: number, dueTick: number }>} */
const pendingZombify = new Map();

/**
 * @typedef {import("./mb_abandonedSettlementBuilder.js").SettlementLadderColumnPayload} SettlementLadderColumnPayload
 */

/**
 * @typedef {{
 *   minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
 *   cursor: number, ruleset: string,
 * }} ProcessorJob
 */

/** @type {ProcessorJob[]} */
const processorQueue = [];

/**
 * Placement work deferred off the scan/activate call stack (resolveSettlementCenter + build start).
 * @type {{ dimension: import("@minecraft/server").Dimension, site: object, opts: object }[]}
 */
const pendingActivations = [];

/**
 * Abandoned-structure ids to try first (engine may not expose these; harmless if missing).
 * @type {Record<string, string[]>}
 */
const ABANDONED_STRUCTURE_CANDIDATES = {
    plains: [
        "minecraft:abandoned_village_plains",
        "minecraft:zombie_village_plains",
        "minecraft:village_plains_abandoned"
    ],
    desert: [
        "minecraft:abandoned_village_desert",
        "minecraft:zombie_village_desert",
        "minecraft:village_desert_abandoned"
    ],
    savanna: [
        "minecraft:abandoned_village_savanna",
        "minecraft:zombie_village_savanna",
        "minecraft:village_savanna_abandoned"
    ],
    jungle: [
        "minecraft:abandoned_village_jungle",
        "minecraft:zombie_village_jungle",
        "minecraft:village_jungle_abandoned"
    ],
    taiga: [
        "minecraft:abandoned_village_taiga",
        "minecraft:zombie_village_taiga",
        "minecraft:village_taiga_abandoned"
    ],
    snowy: [
        "minecraft:abandoned_village_snowy",
        "minecraft:zombie_village_snowy",
        "minecraft:village_snowy_abandoned"
    ],
    infected: [
        "minecraft:abandoned_village_snowy",
        "minecraft:zombie_village_snowy",
        "minecraft:village_snowy_abandoned"
    ],
    ice: [
        "minecraft:abandoned_village_snowy",
        "minecraft:zombie_village_snowy",
        "minecraft:village_snowy_abandoned"
    ]
};

/** @type {Record<string, string[]>} */
/** Fallback ids — engine/version dependent; failures are silent until one works. */
const STRUCTURE_CANDIDATES_COMMON = ["minecraft:village", "village"];

const STRUCTURE_CANDIDATES_BY_BIOME = {
    "minecraft:plains": ["minecraft:village_plains", "village_plains"],
    "minecraft:sunflower_plains": ["minecraft:village_plains", "village_plains"],
    "minecraft:meadow": ["minecraft:village_plains", "village_plains"],
    "minecraft:desert": ["minecraft:village_desert", "village_desert"],
    "minecraft:savanna": ["minecraft:village_savanna", "village_savanna"],
    "minecraft:jungle": ["minecraft:village_jungle", "village_jungle"],
    "minecraft:bamboo_jungle": ["minecraft:village_jungle", "village_jungle"],
    "minecraft:taiga": ["minecraft:village_taiga", "village_taiga"],
    "minecraft:taiga_hills": ["minecraft:village_taiga", "village_taiga"],
    "minecraft:cold_taiga": ["minecraft:village_taiga", "village_taiga"],
    "minecraft:cold_taiga_hills": ["minecraft:village_taiga", "village_taiga"],
    "minecraft:ice_plains": ["minecraft:village_snowy", "village_snowy"],
    "minecraft:ice_plains_spikes": ["minecraft:village_snowy", "village_snowy"],
    "mb:infected_biome_large": ["minecraft:village_snowy", "village_snowy"],
    "mb:infected_biome_medium": ["minecraft:village_snowy", "village_snowy"],
    "mb:infected_biome_small": ["minecraft:village_snowy", "village_snowy"]
};

/** Base scatter denominators (higher = rarer). Script boosts density near infected biomes. */
const SCATTER_BY_BIOME = {
    "minecraft:plains": 80,
    "minecraft:sunflower_plains": 80,
    "minecraft:meadow": 72,
    "minecraft:desert": 72,
    "minecraft:savanna": 68,
    "minecraft:jungle": 64,
    "minecraft:bamboo_jungle": 64,
    "minecraft:taiga": 64,
    "minecraft:taiga_hills": 64,
    "minecraft:cold_taiga": 56,
    "minecraft:cold_taiga_hills": 56,
    "minecraft:cold_taiga_mutated": 56,
    "minecraft:ice_plains": 52,
    "minecraft:ice_plains_spikes": 48,
    "mb:infected_biome_large": 8,
    "mb:infected_biome_medium": 14,
    "mb:infected_biome_small": 28
};

/** @type {Set<string>} */
const PLAINS_BIOME_IDS = new Set([
    "minecraft:plains",
    "minecraft:sunflower_plains",
    "minecraft:meadow"
]);

/** @type {Set<string>} */
const ICE_BIOME_IDS = new Set([
    "minecraft:ice_plains",
    "minecraft:ice_plains_spikes",
    "minecraft:frozen_peaks",
    "minecraft:frozen_ocean",
    "minecraft:deep_frozen_ocean"
]);

/** @type {Set<string>} */
const SNOWY_BIOME_IDS = new Set([
    "minecraft:snowy_plains",
    "minecraft:snowy_taiga",
    "minecraft:snowy_slopes",
    "minecraft:grove",
    "minecraft:cold_ocean",
    "minecraft:deep_cold_ocean"
]);

/** @type {Set<string>} */
const TAIGA_BIOME_IDS = new Set([
    "minecraft:taiga",
    "minecraft:taiga_hills",
    "minecraft:cold_taiga",
    "minecraft:cold_taiga_hills",
    "minecraft:cold_taiga_mutated",
    "minecraft:old_growth_pine_taiga",
    "minecraft:old_growth_spruce_taiga",
    "minecraft:mega_taiga",
    "minecraft:mega_taiga_hills",
    "minecraft:redwood_taiga",
    "minecraft:redwood_taiga_hills",
    "minecraft:redwood_taiga_mutated",
    "minecraft:redwood_taiga_hills_mutated"
]);

/** Vanilla zombie_* processor rules (Java data — approximated on Bedrock). */
const ABANDONED_BLOCK_RULES = {
    plains: [
        { id: "minecraft:cobblestone", out: "minecraft:mossy_cobblestone", p: 0.8 },
        { id: "minecraft:torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:wall_torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:cobblestone", out: "minecraft:web", p: 0.07 },
        { id: "minecraft:mossy_cobblestone", out: "minecraft:web", p: 0.07 },
        { id: "minecraft:white_terracotta", out: "minecraft:web", p: 0.07 },
        { id: "minecraft:oak_log", out: "minecraft:web", p: 0.05 },
        { id: "minecraft:oak_planks", out: "minecraft:web", p: 0.1 },
        { id: "minecraft:oak_stairs", out: "minecraft:web", p: 0.03 },
        { id: "minecraft:stripped_oak_log", out: "minecraft:web", p: 0.02 },
        { id: "minecraft:glass_pane", out: "minecraft:web", p: 0.5 },
        { id: "minecraft:glass_pane", out: "minecraft:brown_stained_glass_pane", p: 0.35 }
    ],
    desert: [
        { id: "minecraft:sandstone", out: "minecraft:web", p: 0.05 },
        { id: "minecraft:smooth_sandstone", out: "minecraft:web", p: 0.05 },
        { id: "minecraft:cut_sandstone", out: "minecraft:web", p: 0.04 },
        { id: "minecraft:terracotta", out: "minecraft:web", p: 0.06 },
        { id: "minecraft:torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:wall_torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:glass_pane", out: "minecraft:web", p: 0.5 },
        { id: "minecraft:glass_pane", out: "minecraft:brown_stained_glass_pane", p: 0.35 }
    ],
    savanna: [
        { id: "minecraft:cobblestone", out: "minecraft:mossy_cobblestone", p: 0.75 },
        { id: "minecraft:acacia_log", out: "minecraft:web", p: 0.05 },
        { id: "minecraft:acacia_planks", out: "minecraft:web", p: 0.1 },
        { id: "minecraft:torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:wall_torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:glass_pane", out: "minecraft:web", p: 0.5 }
    ],
    taiga: [
        { id: "minecraft:cobblestone", out: "minecraft:mossy_cobblestone", p: 0.8 },
        { id: "minecraft:spruce_log", out: "minecraft:web", p: 0.05 },
        { id: "minecraft:spruce_planks", out: "minecraft:web", p: 0.1 },
        { id: "minecraft:torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:wall_torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:glass_pane", out: "minecraft:web", p: 0.5 }
    ],
    snowy: [
        { id: "minecraft:cobblestone", out: "minecraft:mossy_cobblestone", p: 0.8 },
        { id: "minecraft:spruce_log", out: "minecraft:web", p: 0.05 },
        { id: "minecraft:spruce_planks", out: "minecraft:web", p: 0.1 },
        { id: "minecraft:torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:wall_torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:glass_pane", out: "minecraft:web", p: 0.5 }
    ],
    ice: [
        { id: "minecraft:cobblestone", out: "minecraft:mossy_cobblestone", p: 0.85 },
        { id: "minecraft:packed_ice", out: "minecraft:web", p: 0.04 },
        { id: "minecraft:spruce_log", out: "minecraft:web", p: 0.05 },
        { id: "minecraft:spruce_planks", out: "minecraft:web", p: 0.1 },
        { id: "minecraft:torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:wall_torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:glass_pane", out: "minecraft:brown_stained_glass_pane", p: 0.4 }
    ],
    infected: [
        { id: "minecraft:cobblestone", out: "minecraft:mossy_cobblestone", p: 0.85 },
        { id: "minecraft:spruce_log", out: "minecraft:web", p: 0.06 },
        { id: "minecraft:spruce_planks", out: "minecraft:web", p: 0.12 },
        { id: "minecraft:snow", out: "minecraft:web", p: 0.04 },
        { id: "minecraft:torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:wall_torch", out: "minecraft:air", p: 1 },
        { id: "minecraft:glass_pane", out: "minecraft:brown_stained_glass_pane", p: 0.4 }
    ]
};

function loadChunkKeys() {
    try {
        const raw = getWorldProperty(CHUNK_PROP);
        if (typeof raw !== "string" || !raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        for (const k of arr) {
            if (typeof k === "string") chunkKeysMemory.add(k);
        }
    } catch {
        /* ignore */
    }
}

function persistChunkKeys() {
    try {
        const arr = [...chunkKeysMemory];
        const trimmed = arr.length > MAX_CHUNK_KEYS ? arr.slice(-MAX_CHUNK_KEYS) : arr;
        setWorldProperty(CHUNK_PROP, JSON.stringify(trimmed));
    } catch {
        /* ignore */
    }
}

/** @param {number} cx @param {number} cz */
function chunkKey(cx, cz) {
    return `${cx},${cz}`;
}

function getScanRadiusChunks() {
    try {
        const v = getWorldProperty(SCAN_RADIUS_PROP);
        const n = typeof v === "number" ? v : parseInt(String(v), 10);
        if (Number.isFinite(n) && n >= 4 && n <= 16) return n;
    } catch {
        /* ignore */
    }
    return DEFAULT_SCAN_RADIUS_CHUNKS;
}

function getMinPlaceChunkDist(scanRadiusChunks = getScanRadiusChunks()) {
    return Math.max(4, scanRadiusChunks - 3);
}

/**
 * @param {import("./mb_abandonedVillagePerf.js").AbandonedVillagePerfBudget} [budget]
 */
function getEffectiveScanRadiusChunks(budget) {
    const base = getScanRadiusChunks();
    const scale = budget?.scanRadiusScale ?? 1;
    return Math.max(4, Math.min(16, Math.round(base * scale)));
}

function getMaxPlaceDistBlocks() {
    return getScanRadiusChunks() * 16 + SITE_GRID_BLOCKS;
}

/** @type {Set<string>} */
const clearedLampArtifactKeys = new Set();

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} cx
 * @param {number} cz
 * @returns {boolean}
 */
function isOverworldChunkLoaded(dimension, cx, cz) {
    try {
        const block = dimension.getBlock({ x: cx * 16 + 8, y: 64, z: cz * 16 + 8 });
        return block != null;
    } catch {
        return false;
    }
}

/**
 * Chunks to try this tick: loaded, not yet remembered, farthest-first, away from player.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerCx
 * @param {number} playerCz
 * @param {boolean} [includeNearPlayer]
 * @returns {{ cx: number, cz: number, dist: number }[]}
 */
function collectPlacementChunkCandidates(dimension, playerCx, playerCz, includeNearPlayer = false) {
    const scanR = getScanRadiusChunks();
    const minDist = getMinPlaceChunkDist();
    /** @type {{ cx: number, cz: number, dist: number }[]} */
    const all = [];

    for (let dx = -scanR; dx <= scanR; dx++) {
        for (let dz = -scanR; dz <= scanR; dz++) {
            const tcx = playerCx + dx;
            const tcz = playerCz + dz;
            if (chunkKeysMemory.has(chunkKey(tcx, tcz))) continue;
            if (!isOverworldChunkLoaded(dimension, tcx, tcz)) continue;

            const dist = Math.max(Math.abs(dx), Math.abs(dz));
            if (!includeNearPlayer && dist < minDist) continue;
            all.push({ cx: tcx, cz: tcz, dist });
        }
    }

    const shell = all.filter((c) => c.dist === scanR);
    const pick = shell.length > 0 ? shell : all;
    pick.sort((a, b) => b.dist - a.dist);
    return pick;
}

/** @param {number} cx @param {number} cz */
function markChunkRegion(cx, cz) {
    for (let dx = -MARK_RADIUS_CHUNKS; dx <= MARK_RADIUS_CHUNKS; dx++) {
        for (let dz = -MARK_RADIUS_CHUNKS; dz <= MARK_RADIUS_CHUNKS; dz++) {
            chunkKeysMemory.add(chunkKey(cx + dx, cz + dz));
        }
    }
    persistChunkKeys();
}

/**
 * @param {string} biomeId
 * @returns {"plains"|"desert"|"savanna"|"jungle"|"taiga"|"snowy"|"ice"|"infected"|undefined}
 */
/**
 * Biomes that place the spruce cold lamp post during chunk worldgen.
 * @param {string|undefined} biomeId
 */
export function isColdLampMarkerBiome(biomeId) {
    if (!biomeId) return false;
    if (ICE_BIOME_IDS.has(biomeId) || biomeId.includes("ice_plains")) return true;
    if (biomeId === "minecraft:grove") return true;
    if (biomeId.includes("cold_taiga")) return true;
    return TAIGA_BIOME_IDS.has(biomeId) && biomeId.includes("cold");
}

/** Desert worldgen lamp post (`mb:village_marker/hot_lamp_post`). */
export function isHotLampMarkerBiome(biomeId) {
    if (!biomeId) return false;
    return biomeId === "minecraft:desert" || biomeId.endsWith("_desert");
}

export function rulesetForBiome(biomeId) {
    if (!biomeId) return undefined;
    if (biomeId.startsWith("mb:infected_biome")) return "infected";
    if (PLAINS_BIOME_IDS.has(biomeId)) return "plains";
    if (biomeId === "minecraft:desert" || biomeId.endsWith("_desert")) return "desert";
    if (biomeId.includes("mesa") || biomeId.includes("badlands")) return "desert";
    if (biomeId.includes("savanna")) return "savanna";
    if (biomeId.includes("jungle")) return "jungle";
    if (ICE_BIOME_IDS.has(biomeId)) return "ice";
    if (SNOWY_BIOME_IDS.has(biomeId) || biomeId.includes("snowy_")) return "snowy";
    if (TAIGA_BIOME_IDS.has(biomeId) || biomeId.includes("_taiga")) return "taiga";
    if (biomeId === "minecraft:plains" || biomeId === "minecraft:sunflower_plains") return "plains";
    if (biomeId === "minecraft:meadow") return "plains";
    if (biomeId === "minecraft:beach" || biomeId === "minecraft:stony_shore") return "plains";
    return undefined;
}

/**
 * Vertical hint for footing / column scans (dunes, jungle canopy, infected snow).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {SettlementRuleset} ruleset
 * @param {{ x: number, z: number }} lamp
 * @param {number} [fallbackY]
 */
function footingHintYForSite(dimension, ruleset, lamp, fallbackY) {
    if (ruleset === "infected") {
        try {
            const y = surfaceY(dimension, lamp.x, lamp.z);
            if (y != null && Number.isFinite(y)) return y;
        } catch {
            /* ignore */
        }
        return Math.floor(fallbackY ?? 88);
    }
    if (ruleset === "jungle") return 72;
    if (ruleset === "desert" || ruleset === "savanna") {
        try {
            const y = surfaceY(dimension, lamp.x, lamp.z);
            if (y != null && Number.isFinite(y)) return y;
        } catch {
            /* ignore */
        }
        return Math.floor(fallbackY ?? 64);
    }
    return undefined;
}

/**
 * 0 = none, 1 = small infected nearby, 2 = medium, 3 = large.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} cx
 * @param {number} cz
 * @returns {number}
 */
function clearInfectedProximityCache() {
    infectedProxCache.clear();
}

/**
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementTier} tier
 */
export function ruinProcessorRadiusForTier(tier) {
    if (tier === "large") return RUIN_RADIUS_LARGE;
    if (tier === "village") return RUIN_RADIUS_VILLAGE;
    return RUIN_RADIUS_HAMLET;
}

function getInfectedProximityTier(dimension, cx, cz) {
    const key = `${cx},${cz}`;
    if (infectedProxCache.has(key)) return infectedProxCache.get(key);
    let tier = 0;
    const step = INFECTED_PROXIMITY_SAMPLE_STEP;
    for (let dx = -INFECTED_PROXIMITY_RADIUS_CHUNKS; dx <= INFECTED_PROXIMITY_RADIUS_CHUNKS; dx += step) {
        for (let dz = -INFECTED_PROXIMITY_RADIUS_CHUNKS; dz <= INFECTED_PROXIMITY_RADIUS_CHUNKS; dz += step) {
            const tcx = cx + dx;
            const tcz = cz + dz;
            if (!isOverworldChunkLoaded(dimension, tcx, tcz)) continue;
            let biomeId;
            try {
                const biome = dimension.getBiome({ x: tcx * 16 + 8, y: 64, z: tcz * 16 + 8 });
                biomeId = typeof biome === "string" ? biome : biome?.id;
            } catch {
                continue;
            }
            if (!biomeId?.startsWith("mb:infected_biome")) continue;
            if (biomeId.includes("large")) tier = Math.max(tier, 3);
            else if (biomeId.includes("medium")) tier = Math.max(tier, 2);
            else tier = Math.max(tier, 1);
        }
    }
    infectedProxCache.set(key, tier);
    return tier;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} cx
 * @param {number} cz
 * @param {string} biomeId
 * @returns {number|undefined}
 */
function scatterDenominatorForChunk(dimension, cx, cz, biomeId) {
    const prox = getInfectedProximityTier(dimension, cx, cz);
    const inInfected = biomeId.startsWith("mb:infected_biome");

    if (prox >= 3 || (inInfected && biomeId.includes("large"))) return 7;
    if (prox >= 2 || (inInfected && biomeId.includes("medium"))) return 12;
    if (prox >= 1 || inInfected) return 22;

    if (SCATTER_BY_BIOME[biomeId] != null) return SCATTER_BY_BIOME[biomeId];
    const ruleset = rulesetForBiome(biomeId);
    if (ruleset === "plains") return 80;
    if (ruleset === "desert" || ruleset === "savanna" || ruleset === "jungle") return 72;
    if (ruleset === "taiga") return 64;
    if (ruleset === "snowy" || ruleset === "ice" || ruleset === "infected") return 48;
    return undefined;
}

/**
 * @param {string} biomeId
 * @returns {string[]|undefined}
 */
function structureCandidatesForBiome(biomeId) {
    const ruleset = rulesetForBiome(biomeId);
    const base = STRUCTURE_CANDIDATES_BY_BIOME[biomeId];
    const merge = (specific) => [...ABANDONED_STRUCTURE_CANDIDATES[ruleset] ?? [], ...specific, ...STRUCTURE_CANDIDATES_COMMON];

    if (base && ruleset) return merge(base);
    if (biomeId.includes("plains")) {
        return merge(STRUCTURE_CANDIDATES_BY_BIOME["minecraft:plains"]);
    }
    if (biomeId.includes("desert")) {
        return merge(STRUCTURE_CANDIDATES_BY_BIOME["minecraft:desert"]);
    }
    if (biomeId.includes("savanna")) {
        return merge(STRUCTURE_CANDIDATES_BY_BIOME["minecraft:savanna"]);
    }
    if (biomeId.includes("jungle")) {
        return merge(STRUCTURE_CANDIDATES_BY_BIOME["minecraft:jungle"]);
    }
    if (biomeId.includes("taiga") || biomeId.includes("cold")) {
        return merge(STRUCTURE_CANDIDATES_BY_BIOME["minecraft:taiga"]);
    }
    if (biomeId.includes("ice") || biomeId.includes("snow") || biomeId.includes("frozen")) {
        return merge(STRUCTURE_CANDIDATES_BY_BIOME["minecraft:ice_plains"]);
    }
    return undefined;
}

/**
 * @param {import("@minecraft/server").BlockBoundingBox|undefined} box
 * @param {{ x: number, y: number, z: number }} center
 * @param {number} [radius]
 */
function boxFromPlacement(box, center, radius = RUIN_RADIUS_VILLAGE) {
    if (box) {
        try {
            const from = box.from ?? box.min;
            const to = box.to ?? box.max;
            if (from && to) {
                return {
                    minX: Math.floor(Math.min(from.x, to.x)),
                    minY: Math.floor(Math.min(from.y, to.y)),
                    minZ: Math.floor(Math.min(from.z, to.z)),
                    maxX: Math.ceil(Math.max(from.x, to.x)),
                    maxY: Math.ceil(Math.max(from.y, to.y)),
                    maxZ: Math.ceil(Math.max(from.z, to.z))
                };
            }
        } catch {
            /* fall through */
        }
    }
    const r = radius;
    return {
        minX: Math.floor(center.x - r),
        minY: Math.max(-60, Math.floor(center.y - 12)),
        minZ: Math.floor(center.z - r),
        maxX: Math.ceil(center.x + r),
        maxY: Math.min(320, Math.ceil(center.y + 40)),
        maxZ: Math.ceil(center.z + r)
    };
}

export function isAbandonedVillageDebugChatEnabled() {
    try {
        const v = getWorldProperty(DEBUG_CHAT_PROP);
        return v === 1 || v === true || v === "1";
    } catch {
        return false;
    }
}

export function setAbandonedVillageDebugChatEnabled(enabled) {
    try {
        setWorldProperty(DEBUG_CHAT_PROP, enabled ? 1 : 0);
    } catch {
        /* ignore */
    }
}

/** Content Log (console) — default ON when unset. */
export function isAbandonedVillageDebugLogEnabled() {
    try {
        const v = getWorldProperty(DEBUG_LOG_PROP);
        if (v === undefined || v === null) return true;
        if (v === false || v === 0 || v === "0") return false;
        return true;
    } catch {
        return true;
    }
}

export function setAbandonedVillageDebugLogEnabled(enabled) {
    try {
        setWorldProperty(DEBUG_LOG_PROP, enabled ? 1 : 0);
    } catch {
        /* ignore */
    }
}

/**
 * @returns {number}
 */
export function getAbandonedVillageDebugLogMask() {
    try {
        const v = getWorldProperty(DEBUG_LOG_MASK_PROP);
        if (v === undefined || v === null) return AV_DEBUG_LOG_DEFAULT;
        const n = Number(v);
        return Number.isFinite(n) ? n & AV_DEBUG_LOG_ALL : AV_DEBUG_LOG_DEFAULT;
    } catch {
        return AV_DEBUG_LOG_DEFAULT;
    }
}

/**
 * @param {number} mask
 */
export function setAbandonedVillageDebugLogMask(mask) {
    try {
        setWorldProperty(DEBUG_LOG_MASK_PROP, Number(mask) & AV_DEBUG_LOG_ALL);
    } catch {
        /* ignore */
    }
}

/**
 * @param {number} cat
 * @returns {boolean}
 */
export function isAbandonedVillageLogCategoryEnabled(cat) {
    return (getAbandonedVillageDebugLogMask() & cat) !== 0;
}

/**
 * @param {number} cat
 * @param {boolean} enabled
 */
export function setAbandonedVillageLogCategoryEnabled(cat, enabled) {
    let mask = getAbandonedVillageDebugLogMask();
    if (enabled) mask |= cat;
    else mask &= ~cat;
    setAbandonedVillageDebugLogMask(mask);
}

/**
 * @returns {string}
 */
export function formatAbandonedVillageLogCategoriesReport() {
    const m = getAbandonedVillageDebugLogMask();
    const on = (c) => ((m & c) !== 0 ? "§aON" : "§7off");
    return [
        "§7Content Log categories §8(master switch on main menu):",
        `§8Scans §f${on(AV_DEBUG_LOG_CAT.SCANS)} §8— Scan #N, horizon ring, defer villager load`,
        `§8Activation §f${on(AV_DEBUG_LOG_CAT.ACTIVATION)} §8— lamp arrival, activate site, large infected`,
        `§8Build §f${on(AV_DEBUG_LOG_CAT.BUILD)} §8— build started, queue, phased manifest`,
        `§8Success §f${on(AV_DEBUG_LOG_CAT.SUCCESS)} §8— placed, village complete`,
        `§8Failures §f${on(AV_DEBUG_LOG_CAT.FAILURES)} §8— FAIL [code] footing, queue, biome`,
        `§8Lamp §f${on(AV_DEBUG_LOG_CAT.LAMP)} §8— artifact cleanup near posts`
    ].join("\n");
}

/**
 * @param {number} cat
 * @param {string} msg
 * @param {"info"|"error"|"always"} [level]
 */
function avLogCategory(cat, msg, level = "info") {
    const master = isAbandonedVillageDebugLogEnabled();
    if (!master) {
        if (cat !== AV_DEBUG_LOG_CAT.FAILURES) return;
    } else if (!isAbandonedVillageLogCategoryEnabled(cat)) {
        return;
    }
    try {
        console.warn(`[ABANDONED VILLAGE] ${msg}`);
    } catch {
        /* ignore */
    }
}

function avLogScan(msg) {
    avLogCategory(AV_DEBUG_LOG_CAT.SCANS, msg);
}

function avLogActivation(msg) {
    avLogCategory(AV_DEBUG_LOG_CAT.ACTIVATION, msg);
}

function avLogBuild(msg) {
    avLogCategory(AV_DEBUG_LOG_CAT.BUILD, msg);
}

/**
 * @param {string} msg
 * @param {"info"|"error"|"always"} [level]
 */
function avLogSuccess(msg, level = "info") {
    avLogCategory(AV_DEBUG_LOG_CAT.SUCCESS, msg, level);
}

function avLogLamp(msg) {
    avLogCategory(AV_DEBUG_LOG_CAT.LAMP, msg);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 */
/**
 * Prefer infected biomes when sampling vertically (snow layers sit above y=64).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {number} [sampleY]
 */
function getBiomeIdAt(dimension, x, z, sampleY) {
    /** @type {number[]} */
    const heights = [];
    if (sampleY != null && Number.isFinite(sampleY)) {
        heights.push(Math.floor(sampleY), 72);
    } else {
        heights.push(96, 72, 64);
    }
    let fallback;
    for (const y of heights) {
        try {
            const biome = dimension.getBiome({ x, y: Math.max(-64, Math.min(320, y)), z });
            const id = typeof biome === "string" ? biome : biome?.id;
            if (!id) continue;
            if (!fallback) fallback = id;
            if (id.startsWith("mb:infected_biome")) return id;
        } catch {
            /* try next height */
        }
    }
    return fallback;
}

/**
 * @param {string} msg
 */
function avDebugChat(msg) {
    if (!isAbandonedVillageDebugChatEnabled()) return;
    try {
        for (const p of world.getAllPlayers()) {
            if (!p?.isValid) continue;
            p.sendMessage(`§8[Abandoned village] §7${msg}`);
        }
    } catch {
        /* ignore */
    }
}

/**
 * @param {string} event
 * @param {Partial<typeof avDebugStats>} [patch]
 * @param {"info"|"error"} [level]
 */
function noteAvEvent(event, patch = {}, level = "info", cat = AV_DEBUG_LOG_CAT.SUCCESS) {
    avDebugStats.lastEvent = event;
    Object.assign(avDebugStats, patch);
    const logLevel = level === "error" ? "error" : "info";
    avLogCategory(cat, event, logLevel);
    avDebugChat(event);
}

/**
 * Rich placement failure for Content Log (+ short chat). Always writes when log debug is on.
 * @param {string} code
 * @param {string} summary
 * @param {string} [detail]
 * @param {boolean} [countAsPlaceFail]
 */
function recordPlacementFailure(code, summary, detail, countAsPlaceFail = true) {
    lastPlaceFailureId = `${code}: ${summary}`;
    lastPlacementFailureDetail = detail;
    avDebugStats.lastEvent = summary;
    avDebugStats.lastFailureCode = code;
    avDebugStats.lastFailureSummary = summary;
    if (countAsPlaceFail) avDebugStats.placeFail++;
    avLogCategory(AV_DEBUG_LOG_CAT.FAILURES, `FAIL [${code}] ${summary}`, "error");
    if (detail) {
        for (const line of detail.split("\n")) {
            const t = line.trim();
            if (t) avLogCategory(AV_DEBUG_LOG_CAT.FAILURES, `  ${t}`, "error");
        }
    }
    avDebugChat(`§c${code}: §7${summary}`);
}

/**
 * Write full placement report to Content Log (plain text).
 * @param {import("@minecraft/server").Player} [player]
 */
export function logAbandonedVillageDiagnosticsToContentLog(player) {
    const plain = getAbandonedVillageDebugReport(player).replace(/§./g, "");
    try {
        console.warn("[ABANDONED VILLAGE] --- diagnostic snapshot ---\n" + plain);
    } catch {
        /* ignore */
    }
    if (lastPlaceFailureId) {
        avLogCategory(AV_DEBUG_LOG_CAT.FAILURES, `Last placement failure: ${lastPlaceFailureId}`, "error");
    }
    if (lastPlacementFailureDetail) {
        for (const line of lastPlacementFailureDetail.split("\n")) {
            const t = line.trim();
            if (t) avLogCategory(AV_DEBUG_LOG_CAT.FAILURES, `  ${t}`, "error");
        }
    }
}

export function clearAbandonedVillageChunkCache() {
    abortAllSettlementBuilds();
    pendingActivations.length = 0;
    chunkKeysMemory.clear();
    clearedLampArtifactKeys.clear();
    clearAbandonedVillageSiteRegistry();
    try {
        setWorldProperty(CHUNK_PROP, "[]");
    } catch {
        /* ignore */
    }
    noteAvEvent("Chunk + site registry cleared (build queue flushed)");
}

/**
 * Dev: clear built/failed/pending for the site grid cell under world XZ (all sub-slots).
 * @param {number} worldX
 * @param {number} worldZ
 * @returns {{ gx: number, gz: number }}
 */
export function resetAbandonedVillageSiteAtWorld(worldX, worldZ) {
    const { gx, gz } = worldToSiteGrid(worldX, worldZ);
    const dropped = abortSettlementBuildsForSiteCell(gx, gz);
    resetSiteCell(gx, gz);
    noteAvEvent(
        `Site grid ${gx},${gz} reset (registry cleared${dropped ? `, ${dropped} in-memory build(s) dropped` : ""})`
    );
    return { gx, gz };
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} cx
 * @param {number} cz
 * @param {string} biomeId
 * @param {string} ruleset
 * @param {{ x: number, y: number, z: number }} loc
 * @param {import("@minecraft/server").BlockBoundingBox} [box]
 * @param {string} usedId
 * @param {string} tier
 * @param {number} [siteGx]
 * @param {number} [siteGz]
 * @param {number} [siteSub]
 * @param {boolean} [skipProcessor]
 * @param {number} [processorRadius]
 */
function finishSettlementPlacement(
    dimension,
    cx,
    cz,
    biomeId,
    ruleset,
    loc,
    box,
    usedId,
    tier,
    siteGx,
    siteGz,
    siteSub = 0,
    skipProcessor = false,
    processorRadius,
    pendingLadderColumns = []
) {
    avDebugStats.placeSuccess++;
    markChunkRegion(cx, cz);
    if (siteGx != null && siteGz != null) {
        markSiteBuilt(siteGx, siteGz, siteSub, loc);
        clearSiteIncomplete(siteGx, siteGz, siteSub);
        clearSitePending(siteGx, siteGz, siteSub);
    }

    if (!skipProcessor && processorQueue.length < MAX_PROCESSOR_JOBS) {
        const bounds = boxFromPlacement(box, loc, processorRadius);
        processorQueue.push({
            ...bounds,
            cursor: 0,
            ruleset
        });
    }

    const notifyComplete = () => deliverSettlementCompleteNotify(dimension, loc.x, loc.y, loc.z);

    if (pendingLadderColumns.length > 0) {
        scheduleSettlementLadderPlacementsAfterRuin(
            dimension,
            pendingLadderColumns,
            skipProcessor,
            () => processorQueue.length === 0,
            notifyComplete
        );
    } else {
        notifyComplete();
    }

    pendingZombify.set(`${cx},${cz},${system.currentTick}`, {
        dimId: dimension.id,
        cx,
        cz,
        y: loc.y,
        dueTick: system.currentTick + ZOMBIFY_DELAY_TICKS
    });

    avLogSuccess(`Placed ${usedId} tier=${tier} ruleset=${ruleset} @ ${cx},${cz} y=${loc.y}`);
    noteAvEvent(`Placed ${usedId} (${tier}) @ ${cx},${cz}`, {
        lastUsedStructureId: usedId,
        lastBiome: biomeId,
        lastChunk: `${cx}, ${cz}`
    });
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {string} ruleset
 * @param {{ x: number, y: number, z: number }} location
 * @param {number} cx
 * @param {number} cz
 * @param {string} biomeId
 * @param {number} [siteGx]
 * @param {number} [siteGz]
 * @param {number} [siteSub]
 * @param {{
 *   forceTier?: import("./mb_abandonedSettlementBuilder.js").SettlementTier,
 *   skipProcessor?: boolean,
 *   processorRadius?: number,
 *   forceStructures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[],
 *   animalPen?: { ox: number, oz: number, gateFace: number },
 *   singleStructureOnly?: boolean,
 *   debugForceLadders?: boolean,
 *   skipProcessor?: boolean,
 *   resumeIncomplete?: boolean
 * }} [placeOpts]
 * @returns {{ placed: boolean, queued: boolean }}
 */
function beginSettlementPlacement(
    dimension,
    ruleset,
    location,
    cx,
    cz,
    biomeId,
    siteGx,
    siteGz,
    siteSub = 0,
    placeOpts = {}
) {
    const infectedProx = getInfectedProximityTier(dimension, cx, cz);
    const tier = placeOpts.forceTier ?? getSettlementTier(cx, cz, infectedProx);
    const skipProcessor = placeOpts.skipProcessor === true;
    const processorRadius =
        placeOpts.processorRadius ?? ruinProcessorRadiusForTier(tier);

    if (siteGx != null && siteGz != null && isSiteBuilt(siteGx, siteGz, siteSub)) {
        if (
            persistedSiteHasScriptSettlementInWorld(
                dimension,
                siteGx,
                siteGz,
                siteSub,
                location.y,
                biomeId
            )
        ) {
            avLogActivation(
                `Skip build — site ${siteGx},${siteGz},${siteSub} already built (persisted across sessions)`
            );
            return { placed: true, queued: false };
        }
        resetSiteSlot(siteGx, siteGz, siteSub);
        avLogActivation(
            `Stale built flag cleared for ${siteGx},${siteGz},${siteSub} — no script village at saved center`
        );
    }

    if (getSettlementBuildQueueLength() >= MAX_SETTLEMENT_BUILDS_QUEUED) {
        return { placed: false, queued: false };
    }

    const jigsaw =
        JIGSAW_SCRIPT_VILLAGES_ENABLED && !skipProcessor
            ? tryPlaceAddonJigsaw(dimension, ruleset, location)
            : { placed: false };
    if (jigsaw.placed) {
        finishSettlementPlacement(
            dimension,
            cx,
            cz,
            biomeId,
            ruleset,
            location,
            jigsaw.box,
            jigsaw.usedId ?? "jigsaw",
            tier,
            siteGx,
            siteGz,
            siteSub,
            skipProcessor,
            processorRadius,
            []
        );
        return { placed: true, queued: false };
    }

    const queued = enqueueSettlementBuild(dimension, location, ruleset, tier, cx, cz, (result) => {
        if (result.buildManifest) {
            avDebugStats.lastBuildManifest = result.buildManifest;
            avDebugStats.lastBuildStructures = result.builtStructures ?? [];
        }
        if (result.placed && result.usedId !== "script:already_built") {
            if (result.buildManifest) {
                avLogBuild(
                    `Settlement built @ ${cx},${cz} site=${siteGx},${siteGz},${siteSub}:\n${result.buildManifest}`
                );
                avDebugChat(
                    `Built ${(result.builtStructures ?? []).length} structure(s) @ ${cx},${cz} — see Content Log for full list`
                );
            }
            finishSettlementPlacement(
                dimension,
                cx,
                cz,
                biomeId,
                ruleset,
                location,
                undefined,
                result.usedId,
                tier,
                siteGx,
                siteGz,
                siteSub,
                skipProcessor,
                processorRadius,
                result.pendingLadderColumns ?? []
            );
        } else if (result.usedId !== "script:already_built") {
            clearSettlementBuildHudAtCenter(dimension, location.x, location.y, location.z);
            if (siteGx != null && siteGz != null) {
                clearSitePending(siteGx, siteGz, siteSub);
                const stalled = result.usedId?.includes("stalled");
                const aborted = result.usedId === "script:aborted";
                if (stalled && (result.totalEdits ?? 0) > 0) {
                    markSiteIncomplete(siteGx, siteGz, siteSub, location);
                    if (result.structureManifest) {
                        setSiteStructureManifest(siteGx, siteGz, siteSub, result.structureManifest);
                    }
                } else if (stalled || aborted) {
                    clearSiteIncomplete(siteGx, siteGz, siteSub);
                    markSiteFailed(siteGx, siteGz, siteSub);
                } else if (!result.placed) {
                    markSiteIncomplete(siteGx, siteGz, siteSub, location);
                    if (result.structureManifest) {
                        setSiteStructureManifest(siteGx, siteGz, siteSub, result.structureManifest);
                    }
                }
            }
            const stalled = result.usedId?.includes("stalled");
            const detail = [
                `Site ${siteGx},${siteGz},${siteSub} · chunk ${cx},${cz}`,
                `Build ${stalled ? "stalled (no block progress ~800 ticks)" : "finished with too few edits"} · edits=${result.totalEdits} · id=${result.usedId}`,
                `Queue now: ${describeSettlementBuildQueue()}`,
                result.buildManifest ? `Partial build manifest:\n${result.buildManifest}` : ""
            ]
                .filter(Boolean)
                .join("\n");
            recordPlacementFailure(
                stalled ? "BUILD_STALL" : "BUILD_INCOMPLETE",
                stalled
                    ? `Build stalled @ ${cx},${cz} (${result.totalEdits} edits)`
                    : `Build incomplete @ ${cx},${cz} (${result.totalEdits} edits)`,
                detail
            );
        }
    }, {
        structures: placeOpts.forceStructures,
        animalPen: placeOpts.animalPen,
        biomeId,
        singleStructureOnly: placeOpts.singleStructureOnly === true,
        debugForceLadders: placeOpts.debugForceLadders === true,
        skipProcessor: placeOpts.skipProcessor === true,
        structureCatalogMode: placeOpts.structureCatalogMode === true,
        catalogManifest: placeOpts.catalogManifest,
        catalogCols: placeOpts.catalogCols,
        siteGx,
        siteGz,
        siteSub,
        resumeIncomplete: placeOpts.resumeIncomplete === true
    });

    if (queued) {
        notifyPlayersSettlementConstructionStarted(dimension, location.x, location.y, location.z);
    }
    return { placed: queued, queued };
}


/**
 * @param {import("@minecraft/server").Block} block
 * @returns {boolean}
 */
function isDoorBlock(block) {
    if (!block) return false;
    try {
        const tags = block.getTags?.();
        if (tags?.includes("minecraft:is_door") || tags?.includes("door")) return true;
    } catch {
        /* ignore */
    }
    const id = block.typeId;
    return id.includes("door") && !id.includes("doorbell");
}

/**
 * @param {import("@minecraft/server").Block} block
 * @param {{ id: string, out: string, p: number }[]} rules
 */
function applyAbandonedRulesToBlock(block, rules) {
    if (!block || block.typeId === "minecraft:air") return;

    const typeId = block.typeId;
    if (
        typeId === "minecraft:ladder" ||
        typeId === "minecraft:chain" ||
        typeId === "minecraft:vine"
    ) {
        return;
    }

    if (typeId === "minecraft:campfire" || typeId === "minecraft:soul_campfire") {
        try {
            const loc = block.location;
            const cmdId = typeId.replace("minecraft:", "");
            block.dimension?.runCommand(
                `setblock ${loc.x} ${loc.y} ${loc.z} ${cmdId} ["extinguished"=true]`
            );
        } catch {
            /* ignore */
        }
        return;
    }

    if (isDoorBlock(block)) {
        try {
            block.setType("minecraft:air");
        } catch {
            /* ignore */
        }
        return;
    }

    for (const rule of rules) {
        if (typeId !== rule.id) continue;
        if (rule.p < 1 && Math.random() > rule.p) continue;
        try {
            block.setType(rule.out);
        } catch {
            /* ignore */
        }
        return;
    }
}

/**
 * @param {ProcessorJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 */
/**
 * @param {ProcessorJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} [blocksPerTick]
 */
function tickProcessorJob(job, dimension, blocksPerTick = BLOCKS_PER_PROCESSOR_TICK) {
    const rules = ABANDONED_BLOCK_RULES[job.ruleset] ?? ABANDONED_BLOCK_RULES.plains;
    const volumeX = job.maxX - job.minX + 1;
    const volumeZ = job.maxZ - job.minZ + 1;
    const volumeY = job.maxY - job.minY + 1;
    const total = volumeX * volumeZ * volumeY;
    let processed = 0;

    while (job.cursor < total && processed < blocksPerTick) {
        const idx = job.cursor++;
        const ly = job.minY + Math.floor(idx / (volumeX * volumeZ));
        const rem = idx % (volumeX * volumeZ);
        const lz = job.minZ + Math.floor(rem / volumeX);
        const lx = job.minX + (rem % volumeX);

        let block;
        try {
            block = dimension.getBlock({ x: lx, y: ly, z: lz });
        } catch {
            processed++;
            continue;
        }
        applyAbandonedRulesToBlock(block, rules);
        processed++;
    }
}

function processProcessorQueue(budget = getAbandonedVillagePerfBudget()) {
    if (processorQueue.length === 0) return;
    const job = processorQueue[0];
    let dim;
    try {
        dim = world.getDimension("minecraft:overworld");
    } catch {
        processorQueue.shift();
        return;
    }
    tickProcessorJob(job, dim, budget.processorBlocksPerTick);
    const volume =
        (job.maxX - job.minX + 1) *
        (job.maxZ - job.minZ + 1) *
        (job.maxY - job.minY + 1);
    if (job.cursor >= volume) {
        processorQueue.shift();
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {{ x: number, y: number, z: number }} center
 */
function zombifyVillageNear(dimension, center) {
    let villagers;
    try {
        villagers = [
            ...dimension.getEntities({ type: "minecraft:villager", location: center, maxDistance: VILLAGE_ENTITY_RADIUS }),
            ...dimension.getEntities({ type: "minecraft:villager_v2", location: center, maxDistance: VILLAGE_ENTITY_RADIUS })
        ];
    } catch {
        return;
    }

    for (const entity of villagers) {
        if (!entity?.isValid) continue;
        let loc;
        try {
            loc = entity.location;
        } catch {
            continue;
        }
        try {
            entity.remove();
        } catch {
            continue;
        }
        try {
            dimension.spawnEntity("minecraft:zombie_villager", loc);
        } catch {
            /* ignore */
        }
    }

    try {
        const golems = dimension.getEntities({
            type: "minecraft:iron_golem",
            location: center,
            maxDistance: VILLAGE_ENTITY_RADIUS
        });
        for (const g of golems) {
            if (g?.isValid) g.remove();
        }
    } catch {
        /* ignore */
    }
}

function processPendingZombify() {
    if (pendingZombify.size === 0) return;
    const now = system.currentTick;
    for (const [id, job] of [...pendingZombify.entries()]) {
        if (job.dueTick > now) continue;
        pendingZombify.delete(id);
        let dim;
        try {
            dim = world.getDimension(job.dimId);
        } catch {
            continue;
        }
        const center = { x: job.cx * 16 + 8, y: job.y, z: job.cz * 16 + 8 };
        zombifyVillageNear(dim, center);
    }
}

/**
 * Heavy placement (footing search + build queue) — runs on a later tick, not during scan.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {{ gx: number, gz: number, x: number, z: number, cx: number, cz: number, subIndex?: number, biomeId?: string }} site
 * @param {{
 *   force?: boolean,
 *   skipSeedRoll?: boolean,
 *   forceTier?: import("./mb_abandonedSettlementBuilder.js").SettlementTier,
 *   skipProcessor?: boolean,
 *   processorRadius?: number,
 *   usePlayerCenter?: boolean,
 *   playerX?: number,
 *   playerZ?: number,
 *   forceStructures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[],
 *   animalPen?: { ox: number, oz: number, gateFace: number },
 *   singleStructureOnly?: boolean,
 *   forceRuleset?: SettlementRuleset,
 *   lampArrival?: boolean
 * }} opts
 * @returns {boolean}
 */
function runAbandonedVillagePlacementWork(dimension, site, opts) {
    const { gx, gz, x, z, cx, cz } = site;
    const sub = site.subIndex ?? 0;
    if (!opts.force && isSiteBuilt(gx, gz, sub)) {
        return true;
    }
    const biomeId = site.biomeId ?? getBiomeIdAt(dimension, x, z);
    if (!biomeId) {
        recordPlacementFailure(
            "NO_BIOME",
            `Biome unknown @ site ${gx},${gz},${sub}`,
            `Sample ${x},${z} — chunk loaded but getBiome failed at all heights`
        );
        return false;
    }

    const ruleset = opts.forceRuleset ?? rulesetForBiome(biomeId);
    if (!ruleset) {
        recordPlacementFailure(
            "WRONG_BIOME",
            `No village ruleset for ${biomeId}`,
            `Site ${gx},${gz},${sub} · supported: plains, desert, savanna, jungle, taiga, snowy, grove, ice, infected, beach`
        );
        return false;
    }

    const lamp = lampMarkerWorldPosition(gx, gz, sub);
    const lampArrivalEarly = opts.lampArrival === true || site.lampArrival === true;
    if (!opts.force) {
        const hintY = footingHintYForSite(dimension, ruleset, lamp, site.y ?? 64);
        if (shouldSkipSiteActivationForExistingSettlement(dimension, gx, gz, sub, hintY, biomeId)) {
            if (lampArrivalEarly) {
                avLogActivation(`Site ${gx},${gz},${sub} already built — skip lamp activation`);
            } else {
                avLogActivation(`Site ${gx},${gz},${sub} reconciled or linked — skip placement`);
            }
            return false;
        }
    }

    const infectedProx = getInfectedProximityTier(dimension, cx, cz);
    const tier = opts.forceTier ?? getSettlementTier(cx, cz, infectedProx);
    const footingHintY = footingHintYForSite(dimension, ruleset, lamp, site.y ?? 64);
    const lampArrival = lampArrivalEarly;
    /** Grid anchors in large infected cells often sit on cliffs/water; search dry footing at the lamp. */
    const useLampCenterSearch = lampArrival || ruleset === "infected";
    const poleId = (RUIN_MATERIALS_BY_RULESET[ruleset] ?? RUIN_MATERIALS_BY_RULESET.plains).log;
    const centerSearchOpts = {
        hintY: footingHintY,
        ruleset,
        biomeId,
        poleId,
        avoidLamp: { x: lamp.x, z: lamp.z },
        seedXZ: [{ x, z }, { x: lamp.x, z: lamp.z }]
    };
    const savedCenter = !opts.force ? getBuiltSiteCenter(gx, gz, sub) : undefined;
    const incompleteCenter = !opts.force ? getIncompleteSiteCenter(gx, gz, sub) : undefined;
    let loc = opts.forceLocation
        ? { x: opts.forceLocation.x, y: opts.forceLocation.y, z: opts.forceLocation.z }
        : savedCenter
        ? { x: savedCenter.x, y: savedCenter.y, z: savedCenter.z }
        : incompleteCenter
          ? { x: incompleteCenter.x, y: incompleteCenter.y, z: incompleteCenter.z }
          : opts.usePlayerCenter
          ? resolveForcePlaceCenter(dimension, opts.playerX ?? x, opts.playerZ ?? z, tier)
          : undefined;
    if (!loc && !opts.usePlayerCenter) {
        if (useLampCenterSearch) {
            loc = resolveSettlementCenterNearLamp(
                dimension,
                lamp.x,
                lamp.z,
                x,
                z,
                tier,
                cx,
                cz,
                centerSearchOpts
            );
        }
        if (!loc) {
            loc = resolveSettlementCenter(dimension, x, z, tier, cx, cz, centerSearchOpts);
        }
    }
    const placeCx = opts.usePlayerCenter
        ? Math.floor((opts.playerX ?? x) / 16)
        : loc
          ? Math.floor(loc.x / 16)
          : cx;
    const placeCz = opts.usePlayerCenter
        ? Math.floor((opts.playerZ ?? z) / 16)
        : loc
          ? Math.floor(loc.z / 16)
          : cz;
    if (!loc) {
        const wasFailed = isSiteFailed(gx, gz, sub);
        if (!opts.force && !useLampCenterSearch) markSiteFailed(gx, gz, sub);
        if (!wasFailed) {
            const where = opts.usePlayerCenter ? "underfoot" : `grid ${gx},${gz},${sub}`;
            let detail;
            if (opts.usePlayerCenter) {
                detail = formatForcePlaceDiagnosis(
                    diagnoseForcePlaceCenter(dimension, opts.playerX ?? x, opts.playerZ ?? z)
                );
            } else {
                detail = formatSettlementCenterDiagnosis(
                    diagnoseSettlementCenter(dimension, x, z, tier, cx, cz, {
                        hintY: footingHintY,
                        ruleset,
                        biomeId,
                        poleId,
                        lampX: lamp.x,
                        lampZ: lamp.z,
                        avoidLamp: { x: lamp.x, z: lamp.z },
                        seedXZ: centerSearchOpts.seedXZ
                    })
                );
            }
            recordPlacementFailure(
                "BAD_FOOTING",
                `Bad footing @ ${where} · ${biomeId} tier=${tier}`,
                `${detail}\nAnchor world ${x},${z} · infectedProx=${infectedProx}`
            );
        } else if (useLampCenterSearch) {
            avLogActivation(
                `Bad footing @ ${gx},${gz},${sub} — no pier/shore center near lamp (will retry while you explore)`
            );
        }
        return false;
    }

    markChunkRegion(placeCx, placeCz);

    if (!opts.force && isSiteIncomplete(gx, gz, sub) && isSitePending(gx, gz, sub)) {
        clearSitePending(gx, gz, sub);
    }
    if (!opts.force && !tryClaimSiteForBuild(gx, gz, sub)) {
        if (isSiteIncomplete(gx, gz, sub)) {
            avLogActivation(`Site ${gx},${gz},${sub} resume — could not claim slot (retry next tick)`);
        }
        return false;
    }

    const resumeIncomplete = !opts.force && isSiteIncomplete(gx, gz, sub);

    const started = beginSettlementPlacement(dimension, ruleset, loc, placeCx, placeCz, biomeId, gx, gz, sub, {
        forceTier: opts.forceTier,
        skipProcessor: opts.skipProcessor,
        processorRadius: opts.processorRadius,
        forceStructures: opts.forceStructures,
        animalPen: opts.animalPen,
        singleStructureOnly: opts.singleStructureOnly,
        debugForceLadders: opts.debugForceLadders,
        structureCatalogMode: opts.structureCatalogMode === true,
        catalogManifest: opts.catalogManifest,
        catalogCols: opts.catalogCols,
        resumeIncomplete
    });
    if (!started.placed) {
        clearSitePending(gx, gz, sub);
        const qLen = getSettlementBuildQueueLength();
        const busy = qLen >= MAX_SETTLEMENT_BUILDS_QUEUED;
        const detail = [
            `Site ${gx},${gz},${sub} · tier=${tier} ruleset=${ruleset}`,
            `Center ${loc.x},${loc.y},${loc.z} · pending activations=${pendingActivations.length}`,
            `Build queue ${qLen}/${MAX_SETTLEMENT_BUILDS_QUEUED}: ${describeSettlementBuildQueue()}`,
            busy ? "Clear cache in Abandoned village debug or wait for builds to finish" : "enqueueSettlementBuild returned false"
        ].join("\n");
        recordPlacementFailure(
            busy ? "QUEUE_FULL" : "ENQUEUE_FAIL",
            busy ? `Build queue full (${qLen}) @ ${gx},${gz}` : `Could not enqueue build @ ${gx},${gz}`,
            detail
        );
        return false;
    }

    avLogBuild(
        `Settlement build ${resumeIncomplete ? "resumed" : "started"} tier=${tier} ruleset=${ruleset} world ${Math.floor(loc.x)},${Math.floor(loc.z)} chunk ${placeCx},${placeCz} site=${gx},${gz},${sub}${opts.usePlayerCenter ? " (at player)" : ""}`
    );
    return true;
}

/**
 * Free stuck queues and let force place retry this grid cell.
 * @param {number} worldX
 * @param {number} worldZ
 */
function prepareForcePlaceAt(worldX, worldZ) {
    abortAllSettlementBuilds();
    pendingActivations.length = 0;
    const { gx, gz } = worldToSiteGrid(worldX, worldZ);
    resetSiteCell(gx, gz);
}

function processPendingActivations() {
    if (pendingActivations.length === 0) return;
    const job = pendingActivations.shift();
    if (!job?.dimension) return;
    try {
        runAbandonedVillagePlacementWork(job.dimension, job.site, job.opts);
    } catch (err) {
        const sub = job.site.subIndex ?? 0;
        clearSitePending(job.site.gx, job.site.gz, sub);
        const msg = err instanceof Error ? err.message : String(err);
        recordPlacementFailure(
            "ACTIVATE_EXCEPTION",
            `Placement threw @ site ${job.site.gx},${job.site.gz}`,
            msg
        );
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {{ gx: number, gz: number, x: number, z: number, cx: number, cz: number }} site
 * @param {{
 *   force?: boolean,
 *   skipSeedRoll?: boolean,
 *   forceTier?: import("./mb_abandonedSettlementBuilder.js").SettlementTier,
 *   skipProcessor?: boolean,
 *   processorRadius?: number,
 *   usePlayerCenter?: boolean,
 *   playerX?: number,
 *   playerZ?: number,
 *   forceStructures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[],
 *   animalPen?: { ox: number, oz: number, gateFace: number },
 *   singleStructureOnly?: boolean,
 *   debugForceLadders?: boolean
 * }} [opts]
 * @returns {boolean}
 */
function isSiteActivationQueued(gx, gz, sub) {
    const key = siteKey(gx, gz, sub);
    return pendingActivations.some(
        (p) => siteKey(p.site.gx, p.site.gz, p.site.subIndex ?? 0) === key
    );
}

/** @type {Map<string, number>} */
const buildInProgressLogTick = new Map();
const BUILD_IN_PROGRESS_LOG_COOLDOWN = 100;

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} sub
 * @param {import("./mb_abandonedSettlementBuilder.js").BuildJob} job
 */
function logBuildInProgressThrottled(gx, gz, sub, job) {
    const key = siteKey(gx, gz, sub);
    const now = system.currentTick;
    const last = buildInProgressLogTick.get(key) ?? 0;
    if (now - last < BUILD_IN_PROGRESS_LOG_COOLDOWN) return;
    buildInProgressLogTick.set(key, now);
    avLogActivation(
        `Site ${gx},${gz},${sub} — build in progress (phase=${job.phase} edits=${job.totalEdits ?? 0}); stay within village band to continue`
    );
}

/**
 * @param {import("@minecraft/server").Player} player
 */
function resumeIncompleteSettlementsNearPlayer(player) {
    if (!player?.isValid) return;
    const dim = player.dimension;
    if (!dim?.id || dim.id !== "minecraft:overworld") return;
    const loc = player.location;
    const { gx, gz } = worldToSiteGrid(loc.x, loc.z);
    for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
        if (!isSiteIncomplete(gx, gz, sub)) continue;
        const center = getIncompleteSiteCenter(gx, gz, sub);
        if (!center) continue;
        const dist = Math.max(Math.abs(loc.x - center.x), Math.abs(loc.z - center.z));
        if (dist > SETTLEMENT_BUILD_PAUSE_DIST) continue;
        const existing = getSettlementBuildJobForSite(gx, gz, sub);
        if (existing) {
            wakeSettlementBuildJob(existing);
            continue;
        }
        tryActivateAbandonedVillageSite(
            dim,
            {
                gx,
                gz,
                subIndex: sub,
                x: center.x,
                z: center.z,
                cx: Math.floor(center.x / 16),
                cz: Math.floor(center.z / 16),
                lampArrival: true
            },
            { lampArrival: true, skipSeedRoll: true }
        );
    }
}

function tryActivateAbandonedVillageSite(dimension, site, opts = {}) {
    const { gx, gz, x, z, cx, cz } = site;
    const sub = site.subIndex ?? 0;

    if (isSiteActivationQueued(gx, gz, sub)) return false;
    const activeJob = !opts.force ? getActiveSettlementBuildJobForSite(gx, gz, sub) : undefined;
    if (activeJob) {
        wakeSettlementBuildJob(activeJob);
        logBuildInProgressThrottled(gx, gz, sub, activeJob);
        return false;
    }
    if (!opts.force && isSiteIncomplete(gx, gz, sub) && getIncompleteSiteCenter(gx, gz, sub)) {
        if (isSiteActivationQueued(gx, gz, sub)) return false;
        if (isSitePending(gx, gz, sub)) {
            clearSitePending(gx, gz, sub);
        }
        pendingActivations.push({
            dimension,
            site: { ...site, lampArrival: true },
            opts: { ...opts, lampArrival: true, skipSeedRoll: true }
        });
        avLogActivation(`Site ${gx},${gz},${sub} incomplete — queued resume (saved center)`);
        return true;
    }
    if (!opts.force && (isSiteBuilt(gx, gz, sub) || isSitePending(gx, gz, sub))) return false;

    const biomeId = site.biomeId ?? getBiomeIdAt(dimension, x, z);
    if (!biomeId) {
        recordPlacementFailure(
            "NO_BIOME",
            `Biome read failed @ site ${gx},${gz}`,
            `Chunk ${cx},${cz} at ${x},${z}`,
            false
        );
        return false;
    }

    avDebugStats.lastBiome = biomeId;
    avDebugStats.lastChunk = `${cx}, ${cz} (site ${gx},${gz} slot ${sub})`;

    const ruleset = opts.forceRuleset ?? rulesetForBiome(biomeId);
    if (!ruleset) {
        avDebugStats.skipWrongBiome++;
        if (!opts.force) markSiteFailed(gx, gz, sub);
        recordPlacementFailure(
            "WRONG_BIOME",
            `Wrong biome ${biomeId} @ grid ${gx},${gz},${sub}`,
            `River/ocean/mushroom etc. have no ruleset — move site or use force on valid biome`,
            false
        );
        return false;
    }

    const lampFootingActivate = ruleset === "infected";
    if (opts.lampArrival === true || site.lampArrival === true || lampFootingActivate) {
        const lamp = lampMarkerWorldPosition(gx, gz, sub);
        clearSiteFailedForLampArrival(gx, gz, sub);
        if (isSiteIncomplete(gx, gz, sub)) {
            avLogActivation(`Site ${gx},${gz},${sub} incomplete — resume at saved center`);
        }
        const cleared = clearLampColumnArtifacts(dimension, lamp.x, lamp.z);
        if (cleared > 0) {
            avLogLamp(
                `Cleared ${cleared} lamp artifact block(s) @ ${gx},${gz},${sub}${lampFootingActivate ? " (infected)" : " (arrival)"}`
            );
        }
        clearedLampArtifactKeys.delete(siteKey(gx, gz, sub));
    }

    const infectedProx = getInfectedProximityTier(dimension, cx, cz);
    if (!opts.force && !opts.skipSeedRoll && !sitePassesSeedRoll(gx, gz, infectedProx, biomeId)) {
        avDebugStats.skipNoSite++;
        avLogActivation(
            `Roll miss site ${gx},${gz},${sub} ${biomeId} · ${describeSiteRollChance(biomeId, infectedProx)}`
        );
        return false;
    }

    if (!opts.force) {
        const lamp = lampMarkerWorldPosition(gx, gz, sub);
        const hintY = footingHintYForSite(dimension, ruleset, lamp, site.y ?? 64);
        if (shouldSkipSiteActivationForExistingSettlement(dimension, gx, gz, sub, hintY, biomeId)) {
            avLogActivation(`Site ${gx},${gz},${sub} already built/reconciled — skip activation`);
            return false;
        }
    }

    if (opts.force) {
        avLogActivation(
            `Activate site ${gx},${gz},${sub} ${biomeId} FORCE (immediate) tier-prox=${infectedProx}`
        );
        return runAbandonedVillagePlacementWork(dimension, { ...site, biomeId }, opts);
    }

    if (pendingActivations.length >= MAX_SETTLEMENT_BUILDS_QUEUED) {
        avLogActivation(
            `Activate deferred — activation queue full (${pendingActivations.length}/${MAX_SETTLEMENT_BUILDS_QUEUED}) · build queue: ${describeSettlementBuildQueue()}`
        );
        return false;
    }

    avLogActivation(
        `Activate site ${gx},${gz},${sub} ${biomeId} tier-prox=${infectedProx} roll=${describeSiteRollChance(biomeId, infectedProx)} (queued)`
    );

    pendingActivations.push({
        dimension,
        site: { ...site, biomeId },
        opts: { ...opts, lampArrival: opts.lampArrival === true || site.lampArrival === true }
    });
    return true;
}

/**
 * Strip structure_block from worldgen lamps when the player gets close (before village build starts).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} scanRadiusChunks
 * @param {number} [hintY] player Y — centers vertical scan on savanna / hill lamps
 */
/**
 * Queue a script village when the player is at the lamp and artifacts are clear.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} gx
 * @param {number} gz
 * @param {number} sub
 * @param {number} [hintY]
 * @param {string|undefined} [playerBiome]
 */
function tryActivateLampSiteWhenPlayerPresent(
    dimension,
    playerX,
    playerZ,
    gx,
    gz,
    sub,
    hintY,
    playerBiome
) {
    const lampPos = lampMarkerWorldPosition(gx, gz, sub);
    if (!hasWorldgenLampMarkerAt(dimension, lampPos.x, lampPos.z, hintY)) return;
    const rulesetEarly = rulesetForBiome(
        getBiomeIdAt(dimension, lampPos.x, lampPos.z) ?? "minecraft:desert"
    );
    if (rulesetEarly) {
        const hintEarly = footingHintYForSite(dimension, rulesetEarly, lampPos, 64);
        if (shouldSkipSiteActivationForExistingSettlement(dimension, gx, gz, sub, hintEarly, undefined)) {
            return;
        }
    } else if (isSiteBuilt(gx, gz, sub)) {
        return;
    }
    const cand = lampArrivalCandidateAtGrid(
        dimension,
        gx,
        gz,
        sub,
        playerX,
        playerZ,
        getBiomeIdAt,
        playerBiome,
        hintY
    );
    if (!cand) return;
    if (
        !isSiteChunksReadyForActivation(dimension, gx, gz, sub, isOverworldChunkLoaded, {
            allowAnchorUnloaded: true
        })
    ) {
        return;
    }
    if (
        tryActivateAbandonedVillageSite(dimension, cand, {
            skipSeedRoll: true,
            lampArrival: true
        })
    ) {
        avLogActivation(`Lamp approach build queued @ site ${gx},${gz},${sub} (player at post)`);
    }
}

function clearNearbyLampArtifacts(dimension, playerX, playerZ, scanRadiusChunks, hintY, playerBiome) {
    const range = scanRadiusChunks > 0 ? scanRadiusChunks * 16 + 128 : LAMP_APPROACH_DIST_MAX;
    const { gx: gx0, gz: gz0 } = worldToSiteGrid(playerX - range, playerZ - range);
    const { gx: gx1, gz: gz1 } = worldToSiteGrid(playerX + range, playerZ + range);
    for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
            for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                const key = siteKey(gx, gz, sub);
                const { distLamp, lamp } = getSiteActivationDistances(playerX, playerZ, gx, gz, sub);
                if (distLamp > LAMP_APPROACH_DIST_MAX + 32) continue;
                const lcx = Math.floor(lamp.x / 16);
                const lcz = Math.floor(lamp.z / 16);
                if (!isOverworldChunkLoaded(dimension, lcx, lcz)) continue;
                const remainBefore = countLampColumnArtifacts(dimension, lamp.x, lamp.z, hintY);
                if (remainBefore === LAMP_ARTIFACT_COUNT_UNKNOWN) continue;
                if (clearedLampArtifactKeys.has(key) && remainBefore === 0 && distLamp > 80) continue;
                const n = clearLampColumnArtifacts(dimension, lamp.x, lamp.z, hintY);
                const remain = countLampColumnArtifacts(dimension, lamp.x, lamp.z, hintY);
                if (remain === LAMP_ARTIFACT_COUNT_UNKNOWN) continue;
                if (remain === 0) clearedLampArtifactKeys.add(key);
                else clearedLampArtifactKeys.delete(key);
                if (n > 0 && isAbandonedVillageDebugLogEnabled()) {
                    avLogLamp(`Cleared ${n} worldgen artifact block(s) @ lamp ${gx},${gz},${sub}`);
                }
                if (distLamp <= LAMP_ARRIVAL_DIST_MAX) {
                    let artifacts = remain;
                    if (artifacts > 0 && artifacts !== LAMP_ARTIFACT_COUNT_UNKNOWN) {
                        for (let pass = 0; pass < 2 && artifacts > 0; pass++) {
                            clearLampColumnArtifacts(dimension, lamp.x, lamp.z, hintY);
                            artifacts = countLampColumnArtifacts(dimension, lamp.x, lamp.z, hintY);
                        }
                        remain = artifacts;
                    }
                    if (artifacts === LAMP_ARTIFACT_COUNT_UNKNOWN) {
                        if (isAbandonedVillageDebugLogEnabled()) {
                            avLogLamp(
                                `Lamp ${gx},${gz},${sub} chunk not ready for artifact scan — retry activation later`
                            );
                        }
                    } else if (artifacts > 0 && isAbandonedVillageDebugLogEnabled()) {
                        avLogLamp(
                            `Lamp ${gx},${gz},${sub} still has ${artifacts} artifact block(s) after clear — queueing village anyway`
                        );
                    }
                    tryActivateLampSiteWhenPlayerPresent(
                        dimension,
                        playerX,
                        playerZ,
                        gx,
                        gz,
                        sub,
                        hintY,
                        playerBiome
                    );
                }
            }
        }
    }
}

/**
 * @param {import("./mb_abandonedVillagePerf.js").AbandonedVillagePerfBudget} budget
 */
let lastHorizonDeferLogTick = -999999;

function scanPlayersForVillageSites(budget) {
    if (!isScriptEnabled(SCRIPT_IDS.abandonedVillageWorldgen)) return;
    const deferHorizon = budget.deferHorizonScan === true;
    if (deferHorizon) {
        const t = system.currentTick;
        if (t - lastHorizonDeferLogTick >= 200) {
            lastHorizonDeferLogTick = t;
            avLogScan(
                "Horizon/large-infected scan deferred (villager load) — lamp arrivals + cleanup still run"
            );
        }
    }
    clearInfectedProximityCache();
    avDebugStats.scans++;

    let players;
    try {
        players = getCachedPlayers() || [];
    } catch {
        return;
    }

    const scanR = getEffectiveScanRadiusChunks(budget);
    const minDist = getMinPlaceChunkDist(scanR);
    const maxActivations = budget.activationsPerScan;
    const systemBusy =
        getSettlementBuildQueueLength() > 0 ||
        processorQueue.length > 0 ||
        pendingActivations.length > 0;
    let attemptsThisTick = 0;
    let activatedThisTick = false;

    /** @type {{ player: import("@minecraft/server").Player, dim: import("@minecraft/server").Dimension, px: number, pz: number, py: number, pcx: number, pcz: number, playerBiome: string|undefined }[]} */
    const overworldPlayers = [];
    for (const player of players) {
        if (!player?.isValid) continue;
        let dim;
        try {
            dim = player.dimension;
        } catch {
            continue;
        }
        if (dim?.id !== "minecraft:overworld") continue;
        const px = player.location.x;
        const pz = player.location.z;
        overworldPlayers.push({
            player,
            dim,
            px,
            pz,
            py: Math.floor(player.location.y),
            pcx: Math.floor(px / 16),
            pcz: Math.floor(pz / 16),
            playerBiome: getBiomeIdAt(dim, px, pz, Math.floor(player.location.y))
        });
    }
    if (overworldPlayers.length === 0) return;

    const horizonPlayerIndex = budget.horizonRotatePlayers
        ? avDebugStats.scans % overworldPlayers.length
        : 0;

    for (let pi = 0; pi < overworldPlayers.length; pi++) {
        const { dim, px, pz, py, pcx, pcz, playerBiome } = overworldPlayers[pi];
        const runHorizonScan = !budget.horizonRotatePlayers || pi === horizonPlayerIndex;

        const siteStats = getAbandonedVillageSiteRegistryStats();
        avLogScan(
            `Scan #${avDebugStats.scans} p${pi + 1}/${overworldPlayers.length} @ chunk ${pcx},${pcz} ring ${scanR} dist ${minDist}-${Math.floor((scanR * 16 + SITE_GRID_BLOCKS) / 16)}ch biome=${playerBiome ?? "?"} built=${siteStats.built} horizon=${runHorizonScan ? "yes" : "skip"}`
        );

        const lampArrivals = collectLampArrivalSitesNearPlayer(
            dim,
            px,
            pz,
            isOverworldChunkLoaded,
            getBiomeIdAt,
            playerBiome,
            py
        );
        if (lampArrivals.length > 0) {
            avLogScan(`  ${lampArrivals.length} lamp-arrival site(s)`);
        }
        for (const site of lampArrivals) {
            if (attemptsThisTick >= maxActivations) break;
            avLogActivation(
                `  → lamp arrival ${site.gx},${site.gz},${site.subIndex ?? 0} distLamp=${site.distBlocks} biome=${site.biomeId ?? "?"}`
            );
            if (
                tryActivateAbandonedVillageSite(dim, site, {
                    skipSeedRoll: true,
                    lampArrival: true
                })
            ) {
                attemptsThisTick++;
                activatedThisTick = true;
            }
        }

        if (deferHorizon) {
            continue;
        }

        let largePlaced = 0;
        const largeTargets = findLargeInfectedSitesNeedingVillage(
            dim,
            px,
            pz,
            scanR,
            isOverworldChunkLoaded,
            getBiomeIdAt,
            LARGE_INFECTED_ACTIVATIONS_PER_SCAN,
            playerBiome,
            py
        );
        for (const site of largeTargets) {
            if (largePlaced >= LARGE_INFECTED_ACTIVATIONS_PER_SCAN) break;
            avLogActivation(
                `Large infected slot ${site.gx},${site.gz},${site.subIndex} @ ${site.x},${site.z} dist=${site.distBlocks}`
            );
            if (tryActivateAbandonedVillageSite(dim, site, { skipSeedRoll: true })) {
                largePlaced++;
            }
        }
        if (largePlaced === 0 && infectedBiomeTierFromId(playerBiome) === "large") {
            const localSlots = largeInfectedSlotsNearPlayer(dim, px, pz, getBiomeIdAt, playerBiome, py);
            avLogActivation(`Large infected underfoot — ${localSlots.length} local slot(s)`);
            for (const site of localSlots) {
                if (largePlaced >= LARGE_INFECTED_ACTIVATIONS_PER_SCAN) break;
                if (tryActivateAbandonedVillageSite(dim, site, { skipSeedRoll: true })) {
                    largePlaced++;
                }
            }
        }
        if (largePlaced > 0) {
            avLogActivation(`Large infected placements this tick: ${largePlaced}`);
            activatedThisTick = true;
        }

        if (!runHorizonScan) {
            continue;
        }

        if (!systemBusy) {
            if (activatedThisTick) idleHorizonScanStreak = 0;
            else {
                idleHorizonScanStreak++;
                if (idleHorizonScanStreak % IDLE_HORIZON_SCAN_SKIP !== 0) {
                    continue;
                }
            }
        } else {
            idleHorizonScanStreak = 0;
        }

        const candidates = collectActivatableSitesNearPlayer(
            dim,
            px,
            pz,
            scanR,
            minDist,
            isOverworldChunkLoaded,
            getInfectedProximityTier,
            getBiomeIdAt,
            playerBiome,
            py
        );
        avLogScan(`  ${candidates.length} activatable site(s) in horizon ring`);
        for (const site of candidates) {
            if (attemptsThisTick >= maxActivations) break;
            avLogScan(
                `  → try site ${site.gx},${site.gz},${site.subIndex ?? 0} distLamp=${site.distBlocks} biome=${site.biomeId ?? "?"}`
            );
            if (tryActivateAbandonedVillageSite(dim, site)) {
                attemptsThisTick++;
                activatedThisTick = true;
            }
        }
        if (isAbandonedVillageDebugLogEnabled() && attemptsThisTick === 0 && candidates.length === 0) {
            const diag = summarizeSiteScanNearPlayer(
                dim,
                px,
                pz,
                scanR,
                minDist,
                isOverworldChunkLoaded,
                getInfectedProximityTier,
                getBiomeIdAt,
                playerBiome,
                py
            );
            avLogScan(
                `  0 activatable — cells=${diag.cells} slots=${diag.slots} largeSlots=${diag.largeSlots} ok=${diag.ok} arrival=${diag.arrival} rollMiss=${diag.rollMiss} built=${diag.built} failed=${diag.failed} !load=${diag.notLoaded} !lamp=${diag.notLoadedLamp} close=${diag.tooClose} far=${diag.tooFar}`
            );
        }
    }
}

/**
 * Multi-line report for journal Abandoned village debug menu.
 * @param {import("@minecraft/server").Player} player
 * @returns {string}
 */
export function getAbandonedVillageDebugReport(player) {
    const lines = [];
    const push = (s) => lines.push(s);

    const scanR = getScanRadiusChunks();
    const siteStats = getAbandonedVillageSiteRegistryStats();
    push("§7How placement works §8(hybrid site grid):");
    push(`§81.§7 Seed-planned sites every §f~${SITE_GRID_BLOCKS} blocks§7; activate on horizon.`);
    const perf = getAbandonedVillagePerfBudget();
    push(
        `§82.§7 Scan every §f~${perf.scanIntervalTicks} ticks§7 (adaptive), §f~${getEffectiveScanRadiusChunks(perf)} chunk§7 ring §8(≥${getMinPlaceChunkDist(getEffectiveScanRadiusChunks(perf))} ch§7 from you).`
    );
    push(`§8§oMultiplayer: horizon scan rotates one player/tick; activations scale with player count.`);
    push(`§83.§7 Large infected: §f${SITES_PER_LARGE_INFECTED_CELL} villages§7 per grid cell §8(guaranteed rolls§7).`);
    push("§84.§7 Medium 50% · small ~1% · elsewhere ~1/48 §8(script village§7).");
    push("§85.§7 Elsewhere: ~1/48 plains; denser near infected snow §8(proximity§7).");
    push("§86.§7 Live biome + dry/ice center; piers over water at edges.");
    push(`§87.§7 Tiers: hamlet / village / large — phased build §8(~${SETTLEMENT_BLOCKS_PER_TICK} blocks/tick§7).`);
    push("§88.§7 No worldgen barrel ruins in infected §8(script only§7).");
    push("§89.§7 Debug: §aHamlet test§7 / §eVillage test§7 at your feet §8(pin in codex§7).");
    push("§810.§7 Content Log: master switch + §fLog categories…§7 §8(Scans off by default§7).");
    push(`§7Sites built §f${siteStats.built}§7 · failed §f${siteStats.failed}§7 · pending §f${siteStats.pending}`);
    push("§8§oVanilla village jigsaws are legacy (disabled).");
    push("");
    push("§7Vanilla villages are §cOFF§7 §8(worldgen_no_village biomes).");

    const sm = world.structureManager;
    push(
        sm?.placeJigsawStructure
            ? "§7Jigsaw API present §8(mb:abandoned_village_* + legacy blocked)"
            : "§cJigsaw API missing"
    );
    push(
        `§7Script toggle: §f${isScriptEnabled(SCRIPT_IDS.abandonedVillageWorldgen) ? "§aON" : "§cOFF"}`
    );
    push(`§7Content Log: §f${isAbandonedVillageDebugLogEnabled() ? "§aON" : "§7OFF"} §8(Failures still log when OFF)`);
    push(formatAbandonedVillageLogCategoriesReport());
    push(`§7Chat mirror: §f${isAbandonedVillageDebugChatEnabled() ? "§aON" : "§7OFF"}`);
    push(`§7Chunks remembered: §f${chunkKeysMemory.size}`);
    push(
        `§7Build queue: §f${getSettlementBuildQueueLength()} §7· activate: §f${pendingActivations.length} §7· processor: §f${processorQueue.length} §7· zombify: §f${pendingZombify.size}`
    );
    push(`§7Adaptive: §f${formatAbandonedVillagePerfBudget()}`);
    push("");
    push("§7Session stats:");
    push(`§8Scans §f${avDebugStats.scans} §8· skip done-chunk §f${avDebugStats.skipChunkDone}`);
    push(`§8· skip biome §f${avDebugStats.skipWrongBiome} §8· skip grid roll §f${avDebugStats.skipNoSite}`);
    push(`§8· placed §a${avDebugStats.placeSuccess} §8· failed §c${avDebugStats.placeFail}`);
    push(`§7Last: §f${avDebugStats.lastEvent}`);
    const lastBuilt = avDebugStats.lastBuildStructures ?? [];
    if (lastBuilt.length > 0) {
        push(`§7Last build §8(${lastBuilt.length} buildings)§7:`);
        const maxLines = 8;
        for (let i = 0; i < Math.min(maxLines, lastBuilt.length); i++) {
            const plain = String(lastBuilt[i]).replace(/§./g, "").slice(0, 56);
            push(`§8  ${plain}${String(lastBuilt[i]).length > 56 ? "…" : ""}`);
        }
        if (lastBuilt.length > maxLines) {
            push(`§8  … +${lastBuilt.length - maxLines} more §8(Content Log)`);
        }
    }
    if (avDebugStats.lastFailureCode && avDebugStats.lastFailureCode !== "—") {
        push(`§7Last fail code: §c${avDebugStats.lastFailureCode}`);
    }
    if (lastPlaceFailureId) {
        push(`§eLast error: §f${lastPlaceFailureId.slice(0, 72)}`);
    }
    if (lastPlacementFailureDetail) {
        const snippet = lastPlacementFailureDetail.split("\n")[0]?.slice(0, 64) ?? "";
        if (snippet) push(`§8Detail: §7${snippet}… §8(full lines in Content Log)`);
    }

    if (player?.isValid) {
        try {
            const dim = player.dimension;
            const cx = Math.floor(player.location.x / 16);
            const cz = Math.floor(player.location.z / 16);
            const biome = dim.getBiome(player.location);
            const biomeId = typeof biome === "string" ? biome : biome?.id ?? "?";
            const ruleset = rulesetForBiome(biomeId);
            const prox = getInfectedProximityTier(dim, cx, cz);
            const nearSite = siteCandidateAtWorld(player.location.x, player.location.z);
            const gx = nearSite.gx;
            const gz = nearSite.gz;
            const rollDesc = describeSiteRollChance(biomeId, prox);
            const infTier = infectedBiomeTierFromId(biomeId);
            const { distLamp, lamp } = getSiteActivationDistances(
                player.location.x,
                player.location.z,
                gx,
                gz,
                0
            );
            const coldLamp = isColdLampMarkerBiome(biomeId);
            const hotLamp = isHotLampMarkerBiome(biomeId);
            const lampKind = hotLamp ? "hot (desert)" : coldLamp ? "cold" : "warm/oak/rain";
            push("");
            push("§7You are here:");
            push(`§8Biome §f${biomeId} §8· chunk §f${cx}, ${cz} §8· site grid §f${gx}, ${gz}`);
            push(
                ruleset
                    ? `§8Biome OK §a(${ruleset})§8 · ${infTier ? `infected ${infTier}` : "not infected"} · roll ${rollDesc}`
                    : "§8Biome §cNO §8— not a village biome"
            );
            push(
                `§8Lamp marker §f${lamp.x}, ${Math.floor(player.location.y)}, ${lamp.z} §8· dist §f${Math.floor(distLamp)}§8 · post §f${lampKind}`
            );
            const pyDbg = Math.floor(player.location.y);
            const feetHit = findWorldgenLampMarkerNear(
                dim,
                player.location.x,
                player.location.z,
                pyDbg
            );
            push(
                feetHit
                    ? `§8Post at your feet: §aYES §8@ §f${feetHit.x}, ${feetHit.z}§8 (${feetHit.maxRun} marker blocks)`
                    : "§8Post at your feet: §cNO §8(within 8 blocks — stand on the post)"
            );
            for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                const { distLamp: dL, lamp: lp } = getSiteActivationDistances(
                    player.location.x,
                    player.location.z,
                    gx,
                    gz,
                    sub
                );
                if (dL > LAMP_ARRIVAL_DIST_MAX + 32) continue;
                const hit = findWorldgenLampMarkerNear(dim, lp.x, lp.z, pyDbg);
                const dx = hit ? hit.x - lp.x : 0;
                const dz = hit ? hit.z - lp.z : 0;
                push(
                    hit
                        ? `§8  slot ${sub} snap §f${lp.x},${lp.z} §8dist §f${Math.floor(dL)} §8· post §aYES §8@ §f${hit.x},${hit.z} §8(Δ${dx},${dz})`
                        : `§8  slot ${sub} snap §f${lp.x},${lp.z} §8dist §f${Math.floor(dL)} §8· post §cNO §8(searched ±${LAMP_MARKER_SEARCH_RADIUS})`
                );
            }
            const lampArrivals = collectLampArrivalSitesNearPlayer(
                dim,
                player.location.x,
                player.location.z,
                isOverworldChunkLoaded,
                getBiomeIdAt,
                biomeId,
                pyDbg
            );
            push(`§8Lamp-arrival sites ready: §f${lampArrivals.length} §8(within ${LAMP_ARRIVAL_DIST_MAX}m + post detected)`);
            for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                const built = isSiteBuilt(gx, gz, sub);
                const failed = isSiteFailed(gx, gz, sub);
                const pending = isSitePending(gx, gz, sub);
                if (!built && !failed && !pending) continue;
                push(
                    `§8  slot ${sub} registry: ${built ? "§ebuilt" : ""}${failed ? "§cfailed" : ""}${pending ? "§7pending" : ""} §8— use Reset site grid if stuck`
                );
            }
            const nearby = collectActivatableSitesNearPlayer(
                dim,
                player.location.x,
                player.location.z,
                scanR,
                getMinPlaceChunkDist(),
                isOverworldChunkLoaded,
                getInfectedProximityTier,
                getBiomeIdAt,
                biomeId,
                pyDbg
            );
            push(`§8Activatable sites in ring: §f${nearby.length}`);
        } catch {
            /* ignore */
        }
    }

    return lines.join("\n");
}

/** @typedef {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} SettlementRuleset */

/** @typedef {"hamlet"|"village"|"full"|"large"|"house"|"twoStory"|"gableHouse"|"roofDeckTest"|"smithy"|"farm"|"market"|"librarian"|"butcher"|"church"|"pen"|"ladderTest"} ForcePlaceTestMode */

/** @typedef {ForcePlaceTestMode|{ mode?: ForcePlaceTestMode, tier?: "hamlet"|"village"|"large", forceRuleset?: SettlementRuleset, housePlan?: number, compare?: boolean }} ForcePlaceOptions */

/** Dev force-spawn: ruleset × tier (ignores biome underfoot). */
export const FORCE_PLACE_RULESET_TIERS = [
    { ruleset: "plains", label: "Plains", color: "§a" },
    { ruleset: "desert", label: "Desert", color: "§e" },
    { ruleset: "savanna", label: "Savanna", color: "§6" },
    { ruleset: "jungle", label: "Jungle", color: "§2" },
    { ruleset: "taiga", label: "Taiga", color: "§3" },
    { ruleset: "snowy", label: "Snowy", color: "§b" },
    { ruleset: "ice", label: "Ice", color: "§9" },
    { ruleset: "infected", label: "Infected", color: "§c" }
];

/** Journal single-building menu — keep in sync with {@link FORCE_SINGLE_STRUCTURE_KINDS}. */
export const FORCE_SINGLE_BUILDING_MENU = [
    { mode: "house", label: "§aHouse§f (random / 70 plans)" },
    { mode: "gableHouse", label: "§aGable house§f (peaked plan 14)" },
    { mode: "roofDeckTest", label: "§aRoof deck§f (forced lookout + stairs)" },
    { mode: "twoStory", label: "§a2-story§f (plan A)" },
    { mode: "courtyardHouse", label: "§aCourtyard house§f (plan 15)" },
    { mode: "cellarHouse", label: "§aCellar house§f (plan 49)" },
    { mode: "lWingHouse", label: "§aL-wing house§f (plan 11)" },
    { mode: "dogtrotHouse", label: "§aDogtrot§f (plan 32)" },
    { mode: "desertRiad", label: "§6Desert riad§f (plan 52 · desert/savanna)" },
    { mode: "jungleStilt", label: "§2Jungle stilt lodge§f (plan 57)" },
    { mode: "taigaLonghouse", label: "§3Taiga longhouse§f (plan 61)" },
    { mode: "infectedSpire", label: "§5Infected spire§f (plan 67)" },
    { mode: "librarian", label: "§bLibrarian§f (2-story)" },
    { mode: "market", label: "§eMarket hall§f (2-story)" },
    { mode: "smithy", label: "§fSmithy" },
    { mode: "farm", label: "§2Farm" },
    { mode: "butcher", label: "§cButcher" },
    { mode: "bakery", label: "§6Bakery" },
    { mode: "schoolhouse", label: "§9Schoolhouse" },
    { mode: "tradingPost", label: "§eTrading post" },
    { mode: "townHall", label: "§3Town hall" },
    { mode: "greenhouse", label: "§2Greenhouse ruin" },
    { mode: "church", label: "§5Church§f (random variant)" },
    { mode: "cathedral", label: "§5Cathedral§f (church roll)" },
    { mode: "ladderTest", label: "§dLadder test§f (librarian)" },
    { mode: "pen", label: "§6Animal pen" }
];

const FORCE_SINGLE_STRUCTURE_KINDS = new Set(
    FORCE_SINGLE_BUILDING_MENU.map((k) => k.mode)
);

/**
 * Force place at player (debug): builds underfoot, ignores chunk memory and roll.
 * @param {import("@minecraft/server").Player} player
 * @param {ForcePlaceTestMode|ForcePlaceOptions} [modeOrOpts]
 * @returns {boolean}
 */
export function forcePlaceAbandonedVillageAtPlayer(player, modeOrOpts = "hamlet") {
    if (!player?.isValid) return false;
    const dim = player.dimension;
    if (dim?.id !== "minecraft:overworld") {
        noteAvEvent("Force place: not overworld", {}, "error", AV_DEBUG_LOG_CAT.FAILURES);
        return false;
    }
    /** @type {ForcePlaceTestMode} */
    let mode = "hamlet";
    /** @type {SettlementRuleset|undefined} */
    let forceRuleset;
    if (typeof modeOrOpts === "object" && modeOrOpts !== null) {
        forceRuleset = modeOrOpts.forceRuleset;
        mode = modeOrOpts.mode ?? modeOrOpts.tier ?? "hamlet";
    } else {
        mode = modeOrOpts;
    }
    const px = player.location.x;
    const pz = player.location.z;
    const py = Math.floor(player.location.y);
    const biomeId = getBiomeIdAt(dim, px, pz, py);
    const ruleset = forceRuleset ?? rulesetForBiome(biomeId);
    if (!ruleset) {
        noteAvEvent(
            forceRuleset
                ? `Force place: unknown ruleset ${forceRuleset}`
                : `Force place: not a village biome (${biomeId ?? "?"}). Use §7Force by biome§8 or stand on a supported biome.`,
            {},
            "error",
            AV_DEBUG_LOG_CAT.FAILURES
        );
        return false;
    }
    prepareForcePlaceAt(px, pz);
    const site = siteCandidateAtWorld(px, pz);
    site.biomeId = biomeId;
    const placeCx = Math.floor(px / 16);
    const placeCz = Math.floor(pz / 16);

    if (FORCE_SINGLE_STRUCTURE_KINDS.has(mode)) {
        const layoutKind = mode === "ladderTest" ? "ladderTest" : mode;
        const slotOpts = { ruleset: forceRuleset ?? ruleset };
        const housePlan =
            typeof modeOrOpts === "object" && modeOrOpts !== null && modeOrOpts.housePlan != null
                ? modeOrOpts.housePlan
                : undefined;
        if (housePlan != null) slotOpts.housePlan = housePlan;
        const useCompare =
            typeof modeOrOpts === "object" && modeOrOpts !== null && modeOrOpts.compare === true;
        const layout = useCompare
            ? layoutForceStructureComparePair(placeCx, placeCz, layoutKind, slotOpts)
            : layoutForceStructure(placeCx, placeCz, layoutKind, slotOpts);
        return tryActivateAbandonedVillageSite(dim, site, {
            force: true,
            skipSeedRoll: true,
            forceTier: "hamlet",
            forceRuleset,
            skipProcessor: true,
            processorRadius: FORCE_PLACE_PROCESS_RADIUS,
            usePlayerCenter: true,
            playerX: px,
            playerZ: pz,
            forceStructures: layout.structures,
            animalPen: layout.animalPen,
            singleStructureOnly: true,
            debugForceLadders: mode === "ladderTest",
            debugForceLookout: mode === "roofDeckTest"
        });
    }

    const forceTier =
        mode === "large" ? "large" : mode === "village" || mode === "full" ? "village" : "hamlet";
    const processorRadius =
        mode === "large" ? 52 : mode === "village" || mode === "full" ? 40 : FORCE_PLACE_PROCESS_RADIUS;
    return tryActivateAbandonedVillageSite(dim, site, {
        force: true,
        skipSeedRoll: true,
        forceTier,
        forceRuleset,
        skipProcessor: true,
        processorRadius,
        usePlayerCenter: true,
        playerX: px,
        playerZ: pz
    });
}

/**
 * @param {import("@minecraft/server").Player} player
 * @returns {number}
 */
export function countLoadedPlacementCandidatesNearPlayer(player) {
    if (!player?.isValid || player.dimension?.id !== "minecraft:overworld") return 0;
    const py = Math.floor(player.location.y);
    const playerBiome = getBiomeIdAt(
        player.dimension,
        player.location.x,
        player.location.z,
        py
    );
    return collectActivatableSitesNearPlayer(
        player.dimension,
        player.location.x,
        player.location.z,
        getScanRadiusChunks(),
        getMinPlaceChunkDist(),
        isOverworldChunkLoaded,
        getInfectedProximityTier,
        getBiomeIdAt,
        playerBiome,
        py
    ).length;
}

/**
 * Lines for Developer Tools script self-test (does not place a village).
 * @returns {string[]}
 */
export function getAbandonedVillageSelfTestLines() {
    const lines = [formatAbandonedVillagePerfBudget()];
    const sm = world.structureManager;
    if (!sm) {
        lines.push("§cVillages: world.structureManager missing");
        return lines;
    }
    if (!sm.placeJigsawStructure) {
        lines.push("§cVillages: placeJigsawStructure missing §8(update game / @minecraft/server)");
        return lines;
    }
    lines.push("§aVillages: force featurerule, /place feature, or script ruin patch");
    lines.push(
        `§7Toggle §fabandoned_village_worldgen§7: §f${isScriptEnabled(SCRIPT_IDS.abandonedVillageWorldgen) ? "ON" : "OFF"}`
    );
    lines.push(`§7Chunk keys stored: §f${chunkKeysMemory.size}`);
    if (lastPlaceFailureId) {
        lines.push(`§eLast place fail: §f${lastPlaceFailureId.slice(0, 80)}`);
    }
    lines.push(`§7Content Log default: §aON §8Â· search log for §f[ABANDONED VILLAGE]`);
    lines.push("§8Self-test does not spawn villages — use §6Abandoned village debug§8.");
    return lines;
}

let avScanPhaseTicks = 0;
let avLampCleanupPhaseTicks = 0;

export function initializeAbandonedVillageWorldgen() {
    if (watchStarted) return;
    watchStarted = true;
    reloadAbandonedVillageSiteRegistry();
    system.runTimeout(() => {
        try {
            reloadAbandonedVillageSiteRegistry();
        } catch {
            /* ignore */
        }
    }, 1);
    loadChunkKeys();

    if (isAbandonedVillageDebugLogEnabled()) {
        avLogBuild(
            "Worldgen watch started — journal → Abandoned villages → Content Log categories (enable Scans for horizon Scan #N)"
        );
    }

    system.runTimeout(() => {
        try {
            for (const player of world.getAllPlayers()) {
                resumeIncompleteSettlementsNearPlayer(player);
            }
        } catch {
            /* ignore */
        }
    }, 60);

    try {
        world.beforeEvents.playerLeave.subscribe((ev) => {
            const name = ev.player?.name ?? ev.player?.id ?? "?";
            try {
                persistActiveSettlementBuildsForUnload();
            } catch {
                /* ignore */
            }
            avLogBuildLine(
                `Player LEFT (${name}) — build queue ${getSettlementBuildQueueLength()}: ${summarizeActiveSettlementBuildsForDebug()} (incomplete sites saved for reload)`
            );
        });
    } catch {
        /* ignore */
    }

    try {
        world.afterEvents.playerSpawn.subscribe((ev) => {
            const player = ev.player;
            if (!player?.isValid) return;
            avLogBuildLine(
                `Player SPAWN (${player.name}) — build queue ${getSettlementBuildQueueLength()}: ${summarizeActiveSettlementBuildsForDebug()}`
            );
            system.runTimeout(() => {
                try {
                    resumeIncompleteSettlementsNearPlayer(player);
                } catch {
                    /* ignore */
                }
            }, 40);
        });
    } catch {
        /* ignore */
    }

    system.runInterval(() => {
        try {
            if (!isScriptEnabled(SCRIPT_IDS.abandonedVillageWorldgen)) return;
            const budget = refreshAbandonedVillagePerf(system.currentTick);
            processPendingActivations();
            processProcessorQueue(budget);
            processPendingZombify();
            avScanPhaseTicks += SCAN_INTERVAL_TICKS;
            if (avScanPhaseTicks >= budget.scanIntervalTicks) {
                avScanPhaseTicks = 0;
                scanPlayersForVillageSites(budget);
            }
        } catch {
            /* ignore */
        }
    }, SCAN_INTERVAL_TICKS);

    system.runInterval(() => {
        try {
            if (!isScriptEnabled(SCRIPT_IDS.abandonedVillageWorldgen)) return;
            const budget = getAbandonedVillagePerfBudget();
            avLampCleanupPhaseTicks += SCAN_INTERVAL_TICKS;
            if (avLampCleanupPhaseTicks < budget.lampCleanupIntervalTicks) return;
            avLampCleanupPhaseTicks = 0;

            const players = getCachedPlayers() || [];
            for (const player of players) {
                if (!player?.isValid) continue;
                let dim;
                try {
                    dim = player.dimension;
                } catch {
                    continue;
                }
                if (dim?.id !== "minecraft:overworld") continue;
                const px = player.location.x;
                const pz = player.location.z;
                const py = Math.floor(player.location.y);
                const { gx: gx0, gz: gz0 } = worldToSiteGrid(px - LAMP_APPROACH_DIST_MAX, pz - LAMP_APPROACH_DIST_MAX);
                const { gx: gx1, gz: gz1 } = worldToSiteGrid(px + LAMP_APPROACH_DIST_MAX, pz + LAMP_APPROACH_DIST_MAX);
                let anyNear = false;
                for (let gx = gx0; gx <= gx1 && !anyNear; gx++) {
                    for (let gz = gz0; gz <= gz1 && !anyNear; gz++) {
                        for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                            const { distLamp } = getSiteActivationDistances(px, pz, gx, gz, sub);
                            if (distLamp <= LAMP_APPROACH_DIST_MAX) {
                                anyNear = true;
                                break;
                            }
                        }
                    }
                }
                if (!anyNear) continue;
                try {
                    clearNearbyLampArtifacts(dim, px, pz, 0, py, playerBiome);
                } catch {
                    /* ignore */
                }
            }
        } catch {
            /* ignore */
        }
    }, SCAN_INTERVAL_TICKS);
}

/**
 * @param {import("@minecraft/server").Player} player
 * @returns {boolean}
 */
/**
 * Force place a chosen building with a random house plan beside it (dev compare row).
 * @param {import("@minecraft/server").Player} player
 * @param {ForcePlaceTestMode|ForcePlaceOptions} modeOrOpts
 * @returns {boolean}
 */
export function forcePlaceAbandonedVillageCompareAtPlayer(player, modeOrOpts) {
    if (typeof modeOrOpts === "object" && modeOrOpts !== null) {
        return forcePlaceAbandonedVillageAtPlayer(player, { ...modeOrOpts, compare: true });
    }
    return forcePlaceAbandonedVillageAtPlayer(player, { mode: modeOrOpts, compare: true });
}

/**
 * Force place one house shell by plan index (0 … HOUSE_VARIANT_COUNT - 1).
 * @param {import("@minecraft/server").Player} player
 * @param {number} housePlan
 * @param {SettlementRuleset} [forceRuleset]
 * @param {boolean} [withRandomNeighbor]
 */
export function forcePlaceHousePlanAtPlayer(player, housePlan, forceRuleset, withRandomNeighbor = false) {
    const opts = { mode: "house", housePlan, forceRuleset };
    if (withRandomNeighbor) opts.compare = true;
    return forcePlaceAbandonedVillageAtPlayer(player, opts);
}

/**
 * Dev sky-yard: plains starter set at Y=200 — structures only, one pad each (Structure Block export).
 * @param {import("@minecraft/server").Player} player
 * @returns {boolean}
 */
export function placeStarterSetForExportAtPlayer(player) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || !player?.isValid) return false;
    const dim = player.dimension;
    if (dim?.id !== "minecraft:overworld") {
        noteAvEvent("Structure catalog: not overworld", {}, "error", AV_DEBUG_LOG_CAT.FAILURES);
        return false;
    }
    const px = player.location.x;
    const pz = player.location.z;
    const anchorX = Math.floor(px);
    const anchorZ = Math.floor(pz);
    const cx = Math.floor(anchorX / 16);
    const cz = Math.floor(anchorZ / 16);
    const ruleset = "plains";
    const layout = layoutPlainsStarterCatalog(cx, cz, ruleset);
    prepareForcePlaceAt(px, pz);
    layStructureCatalogPlatform(dim, anchorX, anchorZ, layout, STRUCTURE_CATALOG_Y);
    const manifestText = formatStructureCatalogManifest(
        anchorX,
        anchorZ,
        STRUCTURE_CATALOG_Y,
        layout.manifest,
        { ruleset, cols: layout.cols, entryCount: layout.entryCount }
    );
    console.warn(`[MBA structure catalog]\n${manifestText}`);
    avLogBuild(`Starter set for export queued (${ruleset}, Y=${STRUCTURE_CATALOG_Y}):\n${manifestText}`);
    try {
        player.teleport(
            {
                x: anchorX + Math.floor(layout.yardWidth / 2) + 0.5,
                y: STRUCTURE_CATALOG_Y + 8,
                z: anchorZ + Math.floor(layout.yardDepth / 2) + 0.5
            },
            { dimension: dim }
        );
    } catch {
        /* ignore */
    }
    const site = siteCandidateAtWorld(px, pz);
    site.biomeId = "minecraft:plains";
    return runAbandonedVillagePlacementWork(dim, site, {
        force: true,
        skipSeedRoll: true,
        forceRuleset: ruleset,
        forceTier: "hamlet",
        skipProcessor: true,
        structureCatalogMode: true,
        forceStructures: layout.structures,
        catalogManifest: layout.manifest,
        catalogCols: layout.cols,
        singleStructureOnly: false,
        forceLocation: { x: anchorX, y: STRUCTURE_CATALOG_Y, z: anchorZ }
    });
}

/**
 * Dev: place one random exported .mcstructure via jigsaw at the player's feet (existing chunks OK).
 * @param {import("@minecraft/server").Player} player
 * @returns {boolean}
 */
export function placeJigsawExportAtPlayer(player) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || !player?.isValid) return false;
    const dim = player.dimension;
    if (dim?.id !== "minecraft:overworld") {
        noteAvEvent("Jigsaw export: not overworld", {}, "error", AV_DEBUG_LOG_CAT.FAILURES);
        return false;
    }
    const px = Math.floor(player.location.x);
    const pz = Math.floor(player.location.z);
    const mat = RUIN_MATERIALS_BY_RULESET.plains;
    const y =
        surfaceY(dim, px, pz, mat.log, Math.floor(player.location.y)) ?? Math.floor(player.location.y);
    const result = tryPlaceAddonJigsaw(dim, "plains", { x: px, y, z: pz });
    if (result.placed) {
        avLogBuild(
            `Jigsaw export placed ${result.usedId ?? "mb:abandoned_village_plains"} @ ${px},${y},${pz} (random pool piece — see tools/mbAvPlainsExportPool.json)`
        );
        return true;
    }
    avLogBuild(
        `Jigsaw export FAILED @ ${px},${y},${pz} — check structures/mb/av_plains/*.mcstructure + worldgen JSON; Content Log Build category`
    );
    return false;
}

/** @deprecated Use {@link placeStarterSetForExportAtPlayer} */
export function forcePlaceStructureCatalogAtPlayer(player) {
    return placeStarterSetForExportAtPlayer(player);
}

export function devPlaceAbandonedVillageAtPlayer(player, mode = "hamlet") {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || !player?.isValid) return false;
    const placed = forcePlaceAbandonedVillageAtPlayer(player, mode);
    try {
        const labels = {
            hamlet: "Hamlet",
            village: "Village",
            full: "Village",
            large: "Large village",
            house: "House",
            smithy: "Smithy",
            farm: "Farm",
            market: "Market",
            church: "Church",
            pen: "Animal pen"
        };
        const label = labels[mode] ?? mode;
        player.sendMessage(
            placed
                ? `§a${label} test queued at your feet (~12 blocks/tick).`
                : "§cTest place failed — open §eAbandoned village debug§c for last error."
        );
    } catch {
        /* ignore */
    }
    return placed;
}

initializeAbandonedVillageWorldgen();
