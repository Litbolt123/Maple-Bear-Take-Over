/**
 * Procedural abandoned settlements: variable tiers, phased block placement, addon jigsaw hook.
 */

import { BlockPermutation, system, world } from "@minecraft/server";
import { isSettlementReplaceableBlockId } from "./mb_miningBlockList.js";
import {
    fillVillageStorageAt,
    houseLootKeyForRuleset,
    housePantryLootKeyForRuleset,
    houseStorageLootForVariant,
    isWorldgenArtifactBlockId,
    lootForMarketStallBarrel,
    lootTableForWorkKind,
    resolveInteriorLootTable,
    VILLAGE_LOOT
} from "./mb_villageChestLoot.js";
import {
    applyStructureManifestToJob,
    countStructuresBuiltFromStates,
    exportJobStructureManifest,
    formatStructureRegistrySummary,
    getStructureSlotState,
    recordStructureSlotOutcome,
    refreshAllStructureSlotsFromWorld,
    structureSlotCountsAsBuilt,
    structureSlotShouldSkipBuild
} from "./mb_abandonedSettlementStructureRegistry.js";
import {
    clearSitePending,
    getSiteStructureManifest,
    setSiteStructureManifest,
    isSiteBuilt,
    lampMarkerWorldPosition,
    markSiteIncomplete,
    SITE_GRID_BLOCKS,
    SITES_PER_LARGE_INFECTED_CELL,
    structureSlotHasSettlementEvidence
} from "./mb_abandonedVillageSites.js";
import {
    SETTLEMENT_BUILD_PAUSE_DIST,
    SETTLEMENT_BUILD_RESUME_DIST,
    SETTLEMENT_CHUNK_SIM_CHECK_DIST
} from "./mb_abandonedVillageConstants.js";
import { avLogBuildLine } from "./mb_avDebugLog.js";
import { getSettlementBuildBlocksPerTick } from "./mb_abandonedVillagePerf.js";

export { SETTLEMENT_BUILD_PAUSE_DIST, SETTLEMENT_BUILD_RESUME_DIST };
import {
    getChurchPlan,
    getHousePlanForRuleset,
    getWorkBuildingPlan,
    HOUSE_VARIANT_COUNT,
    pickHouseVariantIndex,
    pickMeetingVariant,
    pickSettlementLayoutVariant,
    settlementLayoutOffset,
    structureKindForSlot
} from "./mb_settlementStructures.js";
import { getCurrentDay } from "./mb_dayTracker.js";

/** Pass to trySetBlock mayReplace — replace leaves, vines, logs, etc. (not bedrock / lava / water). */
export const SETTLEMENT_REPLACE_ANY = Symbol("settlement_replace_any");

/** Drop stuck cleanup-only jobs after a long pause with zero edits (queue relief; does not fail the site). */
const SETTLEMENT_PAUSED_DROP_TICKS = 6000;

/** Block-edit budget per game tick (structures are incremental — never one whole house per tick). */
/** Default; live builds use {@link getSettlementBuildBlocksPerTick} from mb_abandonedVillagePerf.js. */
export const SETTLEMENT_BLOCKS_PER_TICK = 12;

/** Jigsaw structures are optional POC only — calling placeJigsawStructure can hang ~10s if assets are missing. */
export const JIGSAW_SCRIPT_VILLAGES_ENABLED = false;

const MAX_COLUMN_SCAN_STEPS = 72;
const MAX_FOOTPRINT_CENTER_TRIES = 14;

/** @typedef {"hamlet"|"village"|"large"} SettlementTier */
/** @typedef {"plains"|"desert"|"savanna"|"jungle"|"taiga"|"snowy"|"ice"|"infected"} SettlementRuleset */

/** Maple Bear snow layer block — never vanilla `minecraft:snow_layer` on settlements. */
export const MAPLE_BEAR_SNOW_LAYER = "mb:snow_layer";

/** Max water columns allowed under a single building footprint. */
const MAX_STRUCTURE_FOOTPRINT_WATER_RATIO = 0.2;

/** @type {Set<string>} */
export const RUIN_FLOOR_REPLACEABLE = new Set([
    "minecraft:grass",
    "minecraft:grass_block",
    "minecraft:dirt",
    "minecraft:podzol",
    "minecraft:coarse_dirt",
    "minecraft:sand",
    "minecraft:red_sand",
    "minecraft:snow_layer",
    "minecraft:snow",
    "minecraft:stone",
    "minecraft:cobblestone",
    "minecraft:mossy_cobblestone",
    "mb:dusted_dirt"
]);

/** Open water — piers allowed, but not for village center. */
const WATER_SURFACE_IDS = new Set([
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:bubble_column",
    "minecraft:kelp",
    "minecraft:seagrass"
]);

/** Solid ground we can build settlements on. */
const BUILDABLE_GROUND_IDS = new Set([
    "minecraft:grass_block",
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:podzol",
    "minecraft:sand",
    "minecraft:red_sand",
    "minecraft:sandstone",
    "minecraft:smooth_sandstone",
    "minecraft:cut_sandstone",
    "minecraft:chiseled_sandstone",
    "minecraft:red_sandstone",
    "minecraft:smooth_red_sandstone",
    "minecraft:cut_red_sandstone",
    "minecraft:chiseled_red_sandstone",
    "minecraft:stone",
    "minecraft:cobblestone",
    "minecraft:mossy_cobblestone",
    "minecraft:gravel",
    "minecraft:snow",
    "minecraft:snow_layer",
    "minecraft:mud",
    "minecraft:packed_ice",
    "minecraft:ice",
    "mb:dusted_dirt"
]);

/** True when this block can anchor a village center or structure footprint. */
function isSettlementFootingBlockId(id) {
    return BUILDABLE_GROUND_IDS.has(id) || RUIN_FLOOR_REPLACEABLE.has(id);
}

/** Max open-water columns in footprint (piers used on those cells). */
const MAX_FOOTPRINT_WATER_RATIO = 0.42;

/** When the hub is a pier deck, most of the ring can be water (poles under paths/buildings). */
const MAX_FOOTPRINT_WATER_RATIO_PIER = 0.94;

/** Lamp / structure export cleanup box (blocks per tick during cleanup phase). */
const MARKER_CLEANUP_HALF_W = 2;
const MARKER_CLEANUP_HEIGHT = 28;
const MARKER_CLEANUP_VOLUME = (MARKER_CLEANUP_HALF_W * 2 + 1) ** 2 * MARKER_CLEANUP_HEIGHT;

/** @type {Set<string>} */
const WORLDGEN_ARTIFACT_IDS = new Set(["minecraft:structure_block", "minecraft:jigsaw", "jigsaw"]);

/** Max log poles under a deck. */
const MAX_SUPPORT_POLE_HEIGHT = 12;

/** Dry-land search radius when chunk center is wet. */
const CENTER_SEARCH_RADIUS = 12;

/** @type {Record<SettlementRuleset, { path: string, wall: string, wallMossy: string, plank: string, log: string, stair: string, slab: string, fence: string, roofAccent?: string }>} */
export const RUIN_MATERIALS_BY_RULESET = {
    plains: {
        path: "minecraft:mossy_cobblestone",
        wall: "minecraft:cobblestone",
        wallMossy: "minecraft:mossy_cobblestone",
        plank: "minecraft:oak_planks",
        log: "minecraft:oak_log",
        stair: "minecraft:oak_stairs",
        slab: "minecraft:oak_slab",
        fence: "minecraft:oak_fence"
    },
    desert: {
        path: "minecraft:mossy_cobblestone",
        wall: "minecraft:sandstone",
        wallMossy: "minecraft:mossy_cobblestone",
        plank: "minecraft:smooth_sandstone",
        log: "minecraft:sandstone",
        stair: "minecraft:sandstone_stairs",
        slab: "minecraft:sandstone_slab",
        fence: "minecraft:oak_fence"
    },
    savanna: {
        path: "minecraft:mossy_cobblestone",
        wall: "minecraft:cobblestone",
        wallMossy: "minecraft:mossy_cobblestone",
        plank: "minecraft:acacia_planks",
        log: "minecraft:acacia_log",
        stair: "minecraft:acacia_stairs",
        slab: "minecraft:acacia_slab",
        fence: "minecraft:acacia_fence"
    },
    jungle: {
        path: "minecraft:mossy_cobblestone",
        wall: "minecraft:cobblestone",
        wallMossy: "minecraft:mossy_cobblestone",
        plank: "minecraft:jungle_planks",
        log: "minecraft:jungle_log",
        stair: "minecraft:jungle_stairs",
        slab: "minecraft:jungle_slab",
        fence: "minecraft:jungle_fence"
    },
    taiga: {
        path: "minecraft:mossy_cobblestone",
        wall: "minecraft:cobblestone",
        wallMossy: "minecraft:mossy_cobblestone",
        plank: "minecraft:spruce_planks",
        log: "minecraft:spruce_log",
        stair: "minecraft:spruce_stairs",
        slab: "minecraft:spruce_slab",
        fence: "minecraft:spruce_fence"
    },
    snowy: {
        path: "minecraft:mossy_cobblestone",
        wall: "minecraft:cobblestone",
        wallMossy: "minecraft:mossy_cobblestone",
        plank: "minecraft:spruce_planks",
        log: "minecraft:spruce_log",
        stair: "minecraft:spruce_stairs",
        slab: "minecraft:spruce_slab",
        fence: "minecraft:spruce_fence"
    },
    ice: {
        path: "minecraft:packed_ice",
        wall: "minecraft:cobblestone",
        wallMossy: "minecraft:mossy_cobblestone",
        plank: "minecraft:spruce_planks",
        log: "minecraft:spruce_log",
        stair: "minecraft:spruce_stairs",
        slab: "minecraft:spruce_slab",
        fence: "minecraft:spruce_fence"
    },
    infected: {
        path: "minecraft:mossy_cobblestone",
        wall: "minecraft:cobblestone",
        wallMossy: "minecraft:mossy_cobblestone",
        plank: "minecraft:spruce_planks",
        log: "minecraft:spruce_log",
        stair: "minecraft:spruce_stairs",
        slab: "minecraft:spruce_slab",
        fence: "minecraft:spruce_fence"
    }
};

const ADDON_JIGSAW_BY_RULESET = {
    plains: "mb:abandoned_village_plains",
    desert: "mb:abandoned_village_desert",
    savanna: "mb:abandoned_village_savanna",
    jungle: "mb:abandoned_village_jungle",
    taiga: "mb:abandoned_village_taiga",
    snowy: "mb:abandoned_village_snowy",
    ice: "mb:abandoned_village_ice",
    infected: "mb:abandoned_village_infected"
};

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} salt
 * @param {number} modulus
 */
export function hashChunkRoll(cx, cz, salt, modulus) {
    if (modulus <= 0) return 0;
    let h = (cx * 3418731285) ^ (cz * 1328979879) ^ (salt * 974531);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) % modulus;
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} infectedProx 0-3
 * @returns {SettlementTier}
 */
export function getSettlementTier(cx, cz, infectedProx) {
    const roll = hashChunkRoll(cx, cz, 41, 100);
    let hamletMax = 70;
    let villageMax = 95;
    if (infectedProx >= 3) {
        hamletMax = 35;
        villageMax = 80;
    } else if (infectedProx >= 2) {
        hamletMax = 50;
        villageMax = 88;
    } else if (infectedProx >= 1) {
        hamletMax = 60;
        villageMax = 92;
    }
    if (roll < hamletMax) return "hamlet";
    if (roll < villageMax) return "village";
    return "large";
}

/**
 * @param {SettlementTier} tier
 */
export function pathRadiusForTier(tier) {
    if (tier === "hamlet") return 14;
    if (tier === "village") return 26;
    return 36;
}

/** Path half-width: 1 → 3-block-wide spokes and plaza connections. */
const SETTLEMENT_PATH_HALF_WIDTH = 1;

/** Chebyshev radius of the central plaza pad (11×11 at 5). */
const SETTLEMENT_PLAZA_RADIUS = 5;

/**
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {SettlementRuleset} ruleset
 * @param {number} wx
 * @param {number} wz
 * @param {number} salt
 */
function pickSettlementPathBlock(mat, ruleset, wx, wz, salt) {
    const r = hashChunkRoll(wx, wz, salt + 77, 100);
    if (ruleset === "plains" || ruleset === "savanna") {
        if (r < 28) return "minecraft:dirt";
        if (r < 58) return mat.path;
        if (r < 78) return mat.wall;
        return mat.wallMossy;
    }
    if (ruleset === "desert") {
        if (r < 20) return "minecraft:sand";
        return r < 60 ? mat.path : mat.wallMossy;
    }
    if (r < 22) return mat.wall;
    return r < 55 ? mat.path : mat.wallMossy;
}

/**
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} wx
 * @param {number} wz
 * @param {number} salt
 */
function pickSettlementWallBlock(mat, wx, wz, salt) {
    return hashChunkRoll(wx, wz, salt + 31, 100) < 50 ? mat.wallMossy : mat.wall;
}

/**
 * @param {string} id
 */
function isWaterBlockId(id) {
    return WATER_SURFACE_IDS.has(id) || (id.includes("water") && !id.includes("waterlogged"));
}

/**
 * @param {string} id
 */
function isSolidAnchorId(id) {
    return (
        BUILDABLE_GROUND_IDS.has(id) ||
        RUIN_FLOOR_REPLACEABLE.has(id) ||
        id === "minecraft:stone" ||
        id === "minecraft:deepslate" ||
        id === "minecraft:granite" ||
        id === "minecraft:andesite" ||
        id === "minecraft:diorite" ||
        id === "minecraft:mycelium" ||
        id === "minecraft:sandstone" ||
        id === "minecraft:smooth_sandstone" ||
        id === "minecraft:cut_sandstone" ||
        id === "minecraft:red_sandstone" ||
        id === "minecraft:smooth_red_sandstone"
    );
}

/**
 * Village hub may sit on land/ice or on a pier deck over water (log poles to solid below).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {number} [hintY]
 */
export function isValidVillageCenterColumn(dimension, x, z, hintY) {
    const col = analyzeColumn(dimension, x, z, hintY);
    return col.kind === "land" || col.kind === "water";
}

/**
 * @param {string} id
 */
function isVegetationId(id) {
    return (
        id === "minecraft:air" ||
        id === "minecraft:short_grass" ||
        id === "minecraft:tall_grass" ||
        id === "minecraft:snow_layer" ||
        id === "minecraft:fern" ||
        id === "minecraft:large_fern" ||
        id === "minecraft:dead_bush" ||
        id === "minecraft:cactus"
    );
}

/** Column scan passes through these to find ground below (jungle trees, vines, etc.). */
function isPassThroughForColumnScan(id) {
    if (isVegetationId(id)) return true;
    if (id.includes("leaves")) return true;
    if (id.includes("vine")) return true;
    if (id.includes("_log") && !id.includes("stripped")) return true;
    if (id.includes("_wood") && !id.includes("stripped")) return true;
    if (id.includes("_stem")) return true;
    if (id === MAPLE_BEAR_SNOW_LAYER || id === "minecraft:snow_layer") return true;
    if (id === "minecraft:glow_lichen" || id === "minecraft:moss_carpet" || id === "minecraft:sculk_vein") {
        return true;
    }
    return false;
}

/** Trees, snow, and loose ice above walk level — cleared before structure pad / walls. Water is kept. */
function isStructureFootprintObstructionId(id) {
    if (isPassThroughForColumnScan(id)) return true;
    if (id.includes("_log") && !id.includes("stripped")) return true;
    if (id.includes("_wood") && !id.includes("stripped")) return true;
    if (id.includes("_stem")) return true;
    if (id === "minecraft:brown_mushroom_block" || id === "minecraft:red_mushroom_block") return true;
    if (id === "minecraft:ice" || id === "minecraft:packed_ice" || id === "minecraft:blue_ice") return true;
    return false;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @returns {"land"|"water"|"unknown"}
 */
export function classifySurfaceColumn(dimension, x, z, hintY) {
    const yMax = hintY != null ? Math.min(320, Math.floor(hintY) + 32) : 320;
    const yMin = hintY != null ? Math.max(-60, Math.floor(hintY) - 48) : -60;
    let steps = 0;
    for (let y = yMax; y >= yMin && steps < MAX_COLUMN_SCAN_STEPS; y--, steps++) {
        let block;
        try {
            block = dimension.getBlock({ x, y, z });
        } catch {
            continue;
        }
        if (!block) continue;
        const id = block.typeId;
        if (isPassThroughForColumnScan(id)) continue;
        if (isWaterBlockId(id)) return "water";
        if (isSettlementFootingBlockId(id)) return "land";
        if (isSettlementReplaceableBlockId(id)) return "land";
        return "unknown";
    }
    return "unknown";
}

/**
 * @typedef {{ kind: "land", floorY: number } | { kind: "water", deckY: number, anchorY: number, topWaterY: number } | { kind: "invalid" }} ColumnAnalysis
 */

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @returns {ColumnAnalysis}
 */
export function analyzeColumn(dimension, x, z, hintY) {
    const probeY = hintY != null ? Math.floor(hintY) : 64;
    if (
        !isSettlementChunkLoaded(
            dimension,
            Math.floor(x / 16),
            Math.floor(z / 16),
            probeY
        )
    ) {
        return { kind: "invalid" };
    }
    let topWaterY = undefined;
    let bottomWaterY = undefined;
    const yMax = hintY != null ? Math.min(320, Math.floor(hintY) + 56) : 320;
    const yMin = hintY != null ? Math.max(-60, Math.floor(hintY) - 40) : -60;
    for (let y = yMax; y >= yMin; y--) {
        let block;
        try {
            block = dimension.getBlock({ x, y, z });
        } catch {
            continue;
        }
        if (!block) continue;
        const id = block.typeId;
        if (isPassThroughForColumnScan(id)) continue;
        if (isWaterBlockId(id)) {
            if (topWaterY === undefined) topWaterY = y;
            bottomWaterY = y;
            continue;
        }
        if (topWaterY !== undefined) {
            if (!isSolidAnchorId(id)) return { kind: "invalid" };
            const span = topWaterY - y;
            if (span > MAX_SUPPORT_POLE_HEIGHT) return { kind: "invalid" };
            return { kind: "water", deckY: topWaterY + 1, anchorY: y, topWaterY };
        }
        if (isSettlementFootingBlockId(id)) {
            return { kind: "land", floorY: y + 1 };
        }
        if (isSettlementReplaceableBlockId(id)) {
            return { kind: "land", floorY: y + 1 };
        }
        return { kind: "invalid" };
    }
    if (topWaterY !== undefined && bottomWaterY !== undefined) {
        return { kind: "invalid" };
    }
    return { kind: "invalid" };
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {number} anchorY
 * @param {number} topWaterY
 * @param {string} poleId
 */
function placeSupportPoles(dimension, x, z, anchorY, topWaterY, poleId) {
    const replace = new Set([...WATER_SURFACE_IDS, "minecraft:air", "minecraft:kelp", "minecraft:seagrass"]);
    for (let y = anchorY + 1; y <= topWaterY; y++) {
        trySetBlock(dimension, x, y, z, poleId, replace);
    }
}

/**
 * Land or pier deck Y; places poles when column is water.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {string} poleId
 * @returns {number|undefined}
 */
export function resolveColumnFloorY(dimension, x, z, poleId, hintY) {
    const col = analyzeColumn(dimension, x, z, hintY);
    if (col.kind === "land") return col.floorY;
    if (col.kind === "water") {
        placeSupportPoles(dimension, x, z, col.anchorY, col.topWaterY, poleId);
        return col.deckY;
    }
    return undefined;
}

/**
 * Y for dry land / ice only (no pier build).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @returns {number|undefined}
 */
export function findBuildSurfaceY(dimension, x, z, hintY) {
    const col = analyzeColumn(dimension, x, z, hintY);
    if (col.kind === "land") return col.floorY;
    return undefined;
}

/**
 * @param {Map<string, ColumnAnalysis>} cache
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {number} [hintY]
 * @returns {ColumnAnalysis}
 */
function getCachedColumnAnalysis(cache, dimension, x, z, hintY) {
    const k = `${x},${z}`;
    if (cache.has(k)) return cache.get(k);
    const col = analyzeColumn(dimension, x, z, hintY);
    cache.set(k, col);
    return col;
}

/**
 * @param {Map<string, ColumnAnalysis>} cache
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {number} [hintY]
 * @returns {"land"|"water"|"unknown"}
 */
function classifySurfaceColumnCached(cache, dimension, x, z, hintY) {
    const col = getCachedColumnAnalysis(cache, dimension, x, z, hintY);
    if (col.kind === "land") return "land";
    if (col.kind === "water") return "water";
    return "unknown";
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 */
export function surfaceY(dimension, x, z) {
    const y = findBuildSurfaceY(dimension, x, z);
    if (y !== undefined) return y;
    for (let yy = 320; yy >= -60; yy--) {
        let block;
        try {
            block = dimension.getBlock({ x, y: yy, z });
        } catch {
            continue;
        }
        if (!block) continue;
        const id = block.typeId;
        if (isVegetationId(id)) continue;
        return yy + 1;
    }
    return 70;
}

/**
 * Shoreline / desert cells allow more water in the footprint ring (piers fill those cells).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {ColumnAnalysis} centerCol
 * @param {{ ruleset?: SettlementRuleset, biomeId?: string }} [footprintOpts]
 */
function maxFootprintWaterRatio(dimension, centerX, centerZ, centerCol, footprintOpts = {}) {
    let max = MAX_FOOTPRINT_WATER_RATIO;
    const { ruleset, biomeId } = footprintOpts;
    if (ruleset === "desert") max = 0.58;
    if (biomeId === "minecraft:beach" || biomeId === "minecraft:stony_shore") max = 0.6;
    if (biomeId?.startsWith("mb:infected_biome")) max = Math.max(max, 0.58);
    if (centerCol?.kind === "land") {
        try {
            const ground = dimension.getBlock({ x: centerX, y: centerCol.floorY - 1, z: centerZ });
            const gid = ground?.typeId;
            if (gid === "minecraft:sand" || gid === "minecraft:red_sand") max = Math.max(max, 0.62);
        } catch {
            /* unloaded */
        }
    }
    return max;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} pathRadius
 */
export function scoreSettlementFootprint(dimension, centerX, centerZ, pathRadius, hintY, columnCache, footprintOpts = {}) {
    const r = pathRadius + 2;
    const step = Math.max(2, Math.floor(r / 5));
    let land = 0;
    let water = 0;
    let unknown = 0;
    const cache = columnCache ?? new Map();
    for (let dx = -r; dx <= r; dx += step) {
        for (let dz = -r; dz <= r; dz += step) {
            if (dx * dx + dz * dz > r * r) continue;
            const wx = centerX + dx;
            const wz = centerZ + dz;
            const kind = columnCache
                ? classifySurfaceColumnCached(cache, dimension, wx, wz, hintY)
                : classifySurfaceColumn(dimension, wx, wz, hintY);
            if (kind === "land") land++;
            else if (kind === "water") water++;
            else unknown++;
        }
    }
    const total = land + water + unknown;
    const waterRatio = total > 0 ? water / total : 1;
    const centerCol = getCachedColumnAnalysis(cache, dimension, centerX, centerZ, hintY);
    const centerPier = centerCol.kind === "water";
    const centerOk = centerCol.kind === "land" || centerPier;
    let maxWater =
        footprintOpts.maxWaterRatio ??
        maxFootprintWaterRatio(dimension, centerX, centerZ, centerCol, footprintOpts);
    if (centerPier) {
        maxWater = Math.max(maxWater, MAX_FOOTPRINT_WATER_RATIO_PIER);
    }
    return {
        land,
        water,
        waterRatio,
        centerOk,
        ok: centerOk && waterRatio <= maxWater,
        centerCol,
        maxWaterRatio: maxWater,
        pierCenter: centerPier
    };
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {string} poleId
 * @param {number} [hintY]
 * @param {ReturnType<typeof scoreSettlementFootprint>} score
 */
function settlementCenterFromFootprintScore(dimension, x, z, poleId, hintY, score) {
    if (!score.ok) return undefined;
    const col = score.centerCol;
    if (col?.kind === "land") {
        return { x, y: col.floorY, z };
    }
    if (col?.kind === "water") {
        const y = resolveColumnFloorY(dimension, x, z, poleId, hintY);
        if (y !== undefined) return { x, y, z };
    }
    return undefined;
}

/**
 * Pick dry center near chunk anchor; seed-stable offset order.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} anchorX
 * @param {number} anchorZ
 * @param {SettlementTier} tier
 * @param {number} cx
 * @param {number} cz
 * @returns {{ x: number, y: number, z: number }|undefined}
 */
/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} anchorX
 * @param {number} anchorZ
 * @param {SettlementTier} tier
 * @param {number} cx
 * @param {number} cz
 * @param {{ hintY?: number, seedXZ?: { x: number, z: number }[], ruleset?: SettlementRuleset, biomeId?: string, avoidLamp?: { x: number, z: number }, poleId?: string }} [searchOpts]
 */
export function resolveSettlementCenter(dimension, anchorX, anchorZ, tier, cx, cz, searchOpts = {}) {
    const pathRadius = pathRadiusForTier(tier);
    const hintY = searchOpts.hintY;
    const poleId = searchOpts.poleId ?? "minecraft:oak_log";
    const columnCache = new Map();
    const footprintOpts = { ruleset: searchOpts.ruleset, biomeId: searchOpts.biomeId };
    const maxTries = tier === "hamlet" ? 10 : tier === "village" ? MAX_FOOTPRINT_CENTER_TRIES : MAX_FOOTPRINT_CENTER_TRIES + 4;

    const tryCell = (x, z) => {
        if (searchOpts.avoidLamp) {
            const lampDist = Math.max(
                Math.abs(x - searchOpts.avoidLamp.x),
                Math.abs(z - searchOpts.avoidLamp.z)
            );
            if (lampDist < LAMP_CENTER_MIN_DISTANCE) return undefined;
        }
        const score = scoreSettlementFootprint(dimension, x, z, pathRadius, hintY, columnCache, footprintOpts);
        return settlementCenterFromFootprintScore(dimension, x, z, poleId, hintY, score);
    };

    /** @type {{ x: number, z: number }[]} */
    const seeds = [{ x: Math.floor(anchorX), z: Math.floor(anchorZ) }];
    if (searchOpts.seedXZ) {
        for (const s of searchOpts.seedXZ) {
            seeds.push({ x: Math.floor(s.x), z: Math.floor(s.z) });
        }
    }
    for (const s of seeds) {
        const hit = tryCell(s.x, s.z);
        if (hit) return hit;
    }

    for (let i = 1; i <= maxTries; i++) {
        const angle = (hashChunkRoll(cx, cz, 500 + i, 360) * Math.PI) / 180;
        const dist =
            2 + (hashChunkRoll(cx, cz, 510 + i, Math.max(1, CENTER_SEARCH_RADIUS - 1)) % (CENTER_SEARCH_RADIUS - 1));
        const x = Math.floor(anchorX + Math.cos(angle) * dist);
        const z = Math.floor(anchorZ + Math.sin(angle) * dist);
        const hit = tryCell(x, z);
        if (hit) return hit;
    }
    return undefined;
}

/** Max ring distance from lamp when searching dry village center on lakeshores. */
const LAMP_SHORE_CENTER_SEARCH_MAX = 56;

/**
 * When the grid anchor is wet, try pier deck at the lamp then dry shore in rings.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} lampX
 * @param {number} lampZ
 * @param {number} anchorX
 * @param {number} anchorZ
 * @param {SettlementTier} tier
 * @param {number} cx
 * @param {number} cz
 * @param {{ hintY?: number, seedXZ?: { x: number, z: number }[], ruleset?: SettlementRuleset, biomeId?: string, avoidLamp?: { x: number, z: number }, poleId?: string }} [searchOpts]
 */
export function resolveSettlementCenterNearLamp(
    dimension,
    lampX,
    lampZ,
    anchorX,
    anchorZ,
    tier,
    cx,
    cz,
    searchOpts = {}
) {
    const pathRadius = pathRadiusForTier(tier);
    const hintY = searchOpts.hintY;
    const poleId = searchOpts.poleId ?? "minecraft:oak_log";
    const columnCache = new Map();
    const biomeId = searchOpts.biomeId;
    const pierFootprintOpts = { ruleset: searchOpts.ruleset, biomeId };
    const shoreFootprintOpts = {
        ruleset: searchOpts.ruleset,
        biomeId,
        maxWaterRatio: 0.62
    };

    const tryAt = (x, z, footprintOpts) => {
        if (searchOpts.avoidLamp) {
            const lampDist = Math.max(
                Math.abs(x - searchOpts.avoidLamp.x),
                Math.abs(z - searchOpts.avoidLamp.z)
            );
            if (lampDist < LAMP_CENTER_MIN_DISTANCE) return undefined;
        }
        const score = scoreSettlementFootprint(
            dimension,
            x,
            z,
            pathRadius,
            hintY,
            columnCache,
            footprintOpts
        );
        return settlementCenterFromFootprintScore(dimension, x, z, poleId, hintY, score);
    };

    const atLamp = tryAt(Math.floor(lampX), Math.floor(lampZ), pierFootprintOpts);
    if (atLamp) return atLamp;

    for (let dist = 3; dist <= LAMP_SHORE_CENTER_SEARCH_MAX; dist += 3) {
        const steps = Math.min(24, 8 + Math.floor(dist / 2));
        for (let i = 0; i < steps; i++) {
            const angleDeg = (i / steps) * 360 + hashChunkRoll(cx, cz, 601 + dist, 360);
            const rad = (angleDeg * Math.PI) / 180;
            const x = Math.floor(lampX + Math.cos(rad) * dist);
            const z = Math.floor(lampZ + Math.sin(rad) * dist);
            const hit = tryAt(x, z, shoreFootprintOpts);
            if (hit) return hit;
        }
    }

    return resolveSettlementCenter(dimension, anchorX, anchorZ, tier, cx, cz, {
        ...searchOpts,
        poleId,
        seedXZ: [{ x: lampX, z: lampZ }, ...(searchOpts.seedXZ ?? [{ x: anchorX, z: anchorZ }])]
    });
}

/**
 * @param {ReturnType<typeof scoreSettlementFootprint>} score
 */
function footingFailureReason(score) {
    const parts = [];
    const centerKind = score.centerCol?.kind ?? "unknown";
    if (centerKind === "invalid") {
        parts.push("center too deep for pier poles");
    } else if (!score.centerOk) {
        parts.push(`center column ${centerKind} not buildable`);
    }
    if (score.waterRatio > score.maxWaterRatio) {
        parts.push(
            `water ${Math.round(score.waterRatio * 100)}% > limit ${Math.round(score.maxWaterRatio * 100)}% (land=${score.land} water=${score.water})`
        );
    }
    if (parts.length === 0) {
        parts.push("no build surface Y");
    }
    return parts.join("; ");
}

/**
 * Probe seeds + spiral without placing — for Content Log placement failures.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} anchorX
 * @param {number} anchorZ
 * @param {SettlementTier} tier
 * @param {number} cx
 * @param {number} cz
 * @param {{ hintY?: number, seedXZ?: { x: number, z: number }[], ruleset?: SettlementRuleset, biomeId?: string, lampX?: number, lampZ?: number }} [searchOpts]
 */
export function diagnoseSettlementCenter(dimension, anchorX, anchorZ, tier, cx, cz, searchOpts = {}) {
    const pathRadius = pathRadiusForTier(tier);
    const hintY = searchOpts.hintY;
    const columnCache = new Map();
    const footprintOpts = { ruleset: searchOpts.ruleset, biomeId: searchOpts.biomeId };
    const maxTries =
        tier === "hamlet" ? 10 : tier === "village" ? MAX_FOOTPRINT_CENTER_TRIES : MAX_FOOTPRINT_CENTER_TRIES + 4;

    /** @type {{ label: string, x: number, z: number, land: number, water: number, waterRatio: number, maxWaterRatio: number, centerKind: string, reason: string, wouldPlace: boolean }[]} */
    const probes = [];

    const poleId = searchOpts.poleId ?? "minecraft:oak_log";
    const probeAt = (x, z, label) => {
        const score = scoreSettlementFootprint(dimension, x, z, pathRadius, hintY, columnCache, footprintOpts);
        const centerKind = score.centerCol?.kind ?? "unknown";
        const placed = settlementCenterFromFootprintScore(dimension, x, z, poleId, hintY, score);
        const wouldPlace = placed !== undefined;
        probes.push({
            label,
            x: Math.floor(x),
            z: Math.floor(z),
            land: score.land,
            water: score.water,
            waterRatio: score.waterRatio,
            maxWaterRatio: score.maxWaterRatio,
            centerKind,
            reason: wouldPlace ? "ok" : footingFailureReason(score),
            wouldPlace
        });
    };

    probeAt(anchorX, anchorZ, "grid anchor");
    if (searchOpts.seedXZ) {
        let si = 0;
        for (const s of searchOpts.seedXZ) {
            probeAt(s.x, s.z, si === 0 ? "lamp" : `seed${si}`);
            si++;
        }
    }
    for (let i = 1; i <= maxTries; i++) {
        const angle = (hashChunkRoll(cx, cz, 500 + i, 360) * Math.PI) / 180;
        const dist =
            2 + (hashChunkRoll(cx, cz, 510 + i, Math.max(1, CENTER_SEARCH_RADIUS - 1)) % (CENTER_SEARCH_RADIUS - 1));
        const x = Math.floor(anchorX + Math.cos(angle) * dist);
        const z = Math.floor(anchorZ + Math.sin(angle) * dist);
        probeAt(x, z, `spiral${i}`);
    }

    const partialLand = probes.filter((p) => p.centerKind === "land" && !p.wouldPlace);
    partialLand.sort((a, b) => a.waterRatio - b.waterRatio);
    const bestPartial = partialLand[0];

    return {
        tier,
        pathRadius,
        ruleset: searchOpts.ruleset,
        biomeId: searchOpts.biomeId,
        anchorX: Math.floor(anchorX),
        anchorZ: Math.floor(anchorZ),
        lampX: searchOpts.lampX,
        lampZ: searchOpts.lampZ,
        cx,
        cz,
        probes,
        bestPartial
    };
}

/**
 * @param {ReturnType<typeof diagnoseSettlementCenter>} diag
 */
export function formatSettlementCenterDiagnosis(diag) {
    const pct = (r) => `${Math.round(r * 100)}%`;
    const lines = [
        `Footing: tier=${diag.tier} pathR=${diag.pathRadius} ruleset=${diag.ruleset ?? "?"} biome=${diag.biomeId ?? "?"}`,
        `Grid anchor ${diag.anchorX},${diag.anchorZ} chunk ${diag.cx},${diag.cz}` +
            (diag.lampX != null ? ` · lamp ${diag.lampX},${diag.lampZ}` : "")
    ];
    for (const p of diag.probes) {
        lines.push(
            `[${p.label}] ${p.x},${p.z}: ${p.reason} · center=${p.centerKind} H2O=${pct(p.waterRatio)}/${pct(p.maxWaterRatio)} samples L${p.land}/W${p.water}`
        );
    }
    if (diag.bestPartial) {
        const b = diag.bestPartial;
        lines.push(
            `Closest fix: ${b.x},${b.z} (${b.reason}) — try drier ground or move lamp off shore`
        );
    }
    return lines.join("\n");
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerX
 * @param {number} playerZ
 */
export function diagnoseForcePlaceCenter(dimension, playerX, playerZ) {
    const px = Math.floor(playerX);
    const pz = Math.floor(playerZ);
    /** @type {{ label: string, x: number, z: number, column: string, surfaceY?: number, reason: string }[]} */
    const probes = [];
    const probeAt = (x, z, label) => {
        const col = classifySurfaceColumn(dimension, x, z);
        const y = col !== "water" ? findBuildSurfaceY(dimension, x, z) : undefined;
        let reason = "ok";
        if (col === "water") reason = "standing in water";
        else if (col === "unknown") reason = "unknown column (no solid ground)";
        else if (y === undefined) reason = "no build surface";
        probes.push({ label, x, z, column: col, surfaceY: y, reason });
    };
    probeAt(px, pz, "feet");
    for (let ring = 1; ring <= 3; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
            for (let dz = -ring; dz <= ring; dz++) {
                if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
                probeAt(px + dx, pz + dz, `ring${ring}`);
            }
        }
    }
    const ok = probes.find((p) => p.reason === "ok");
    return { px, pz, probes, nearestOk: ok };
}

/**
 * @param {ReturnType<typeof diagnoseForcePlaceCenter>} diag
 */
export function formatForcePlaceDiagnosis(diag) {
    const lines = [`Force-place footing @ ${diag.px},${diag.pz}:`];
    for (const p of diag.probes) {
        lines.push(`[${p.label}] ${p.x},${p.z}: ${p.reason} · column=${p.column}${p.surfaceY != null ? ` Y=${p.surfaceY}` : ""}`);
    }
    if (!diag.nearestOk) {
        lines.push(
            "No buildable footing within 3 blocks — stand on grass, dirt, sand, or mb:dusted_dirt (not water alone)"
        );
    }
    return lines.join("\n");
}

/**
 * Debug / force place: build at the player's feet (relaxed footprint — no full ring scan).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerX
 * @param {number} playerZ
 * @param {SettlementTier} [_tier]
 * @returns {{ x: number, y: number, z: number }|undefined}
 */
export function resolveForcePlaceCenter(dimension, playerX, playerZ, _tier = "hamlet") {
    const px = Math.floor(playerX);
    const pz = Math.floor(playerZ);
    const poleId = "minecraft:oak_log";
    const tryCell = (x, z) => {
        if (!isValidVillageCenterColumn(dimension, x, z)) return undefined;
        const y = resolveColumnFloorY(dimension, x, z, poleId);
        if (y === undefined) return undefined;
        return { x, y, z };
    };
    const atFeet = tryCell(px, pz);
    if (atFeet) return atFeet;
    for (let ring = 1; ring <= 10; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
            for (let dz = -ring; dz <= ring; dz++) {
                if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
                const hit = tryCell(px + dx, pz + dz);
                if (hit) return hit;
            }
        }
    }
    return undefined;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} typeId
 * @param {Set<string>|typeof SETTLEMENT_REPLACE_ANY} [mayReplace]
 */
export function trySetBlock(dimension, x, y, z, typeId, mayReplace) {
    try {
        if (
            !isSettlementChunkLoaded(
                dimension,
                Math.floor(x / 16),
                Math.floor(z / 16),
                y
            )
        ) {
            return false;
        }
        const block = dimension.getBlock({ x, y, z });
        if (!block) return false;
        const current = block.typeId;
        if (current === typeId) return false;
        if (mayReplace === SETTLEMENT_REPLACE_ANY) {
            if (!isSettlementReplaceableBlockId(current)) return false;
        } else if (mayReplace && !mayReplace.has(current) && current !== "minecraft:air") {
            return false;
        } else if (!mayReplace && current !== "minecraft:air") {
            return false;
        }
        block.setType(typeId);
        return true;
    } catch {
        return false;
    }
}

function trySetGround(dimension, x, z, typeId, mayReplace, poleId, hintY) {
    const surface = resolveColumnFloorY(dimension, x, z, poleId ?? "minecraft:oak_log", hintY);
    if (surface === undefined) return false;
    const replace = mayReplace ?? SETTLEMENT_REPLACE_ANY;
    return trySetBlock(dimension, x, surface - 1, z, typeId, replace);
}

function trySetColumnAir(dimension, x, z, height, typeId, poleId) {
    const baseY = resolveColumnFloorY(dimension, x, z, poleId ?? "minecraft:oak_log");
    if (baseY === undefined) return 0;
    let n = 0;
    for (let dy = 0; dy < height; dy++) {
        if (trySetBlock(dimension, x, baseY + dy, z, typeId, SETTLEMENT_REPLACE_ANY)) n++;
    }
    return n;
}

/**
 * Vanilla-style ruined crop field: log border, farmland, irrigation channel, sparse crops.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} originX
 * @param {number} originZ
 * @param {number} w
 * @param {number} d
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} salt
 * @param {number} hintY
 * @param {Map<string, number|undefined>} floorCache
 */
function placeRuinedVillageFarmland(dimension, originX, originZ, w, d, mat, salt, hintY, floorCache) {
    let changed = 0;
    const crops = ["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes"];
    const cropId = crops[hashChunkRoll(originX, originZ, salt + 40, crops.length)];
    const channelLz = Math.floor(d / 2);
    const channelLx = Math.floor(w / 2);

    for (let lx = 1; lx < w - 1; lx++) {
        for (let lz = 1; lz < d - 1; lz++) {
            const wx = originX + lx;
            const wz = originZ + lz;
            if (classifySurfaceColumn(dimension, wx, wz, hintY) === "water") continue;
            const sy = cachedFloorY(floorCache, dimension, wx, wz, mat.log, hintY);
            if (sy === undefined) continue;

            const onBorder = lx === 1 || lx === w - 2 || lz === 1 || lz === d - 2;
            const onChannelRow = lz === channelLz;
            const onChannelCol = lx === channelLx;
            const isChannel = onChannelRow || onChannelCol;

            if (onBorder && !isChannel) {
                if (trySetBlock(dimension, wx, sy, wz, mat.log, SETTLEMENT_REPLACE_ANY)) changed++;
                if (hashChunkRoll(wx, wz, salt + 11, 100) < 40) {
                    if (trySetBlock(dimension, wx, sy + 1, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) changed++;
                }
                continue;
            }

            if (isChannel) {
                if (trySetBlock(dimension, wx, sy - 1, wz, "minecraft:water", SETTLEMENT_REPLACE_ANY)) changed++;
                trySetBlock(dimension, wx, sy, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY);
                continue;
            }

            if (trySetBlock(dimension, wx, sy - 1, wz, "minecraft:farmland", SETTLEMENT_REPLACE_ANY)) {
                changed++;
            }
            const roll = hashChunkRoll(wx, wz, salt + 22, 100);
            if (roll < 55) {
                if (trySetBlock(dimension, wx, sy, wz, cropId, SETTLEMENT_REPLACE_ANY)) changed++;
            } else if (roll < 68) {
                if (trySetBlock(dimension, wx, sy, wz, "minecraft:short_grass", SETTLEMENT_REPLACE_ANY)) changed++;
            }
        }
    }

    if (hashChunkRoll(originX, originZ, salt + 50, 100) < 50 && w >= 5 && d >= 5) {
        const pondX = originX + w - 2;
        const pondZ = originZ + d - 2;
        for (let dx = 0; dx < 2; dx++) {
            for (let dz = 0; dz < 2; dz++) {
                const wx = pondX + dx;
                const wz = pondZ + dz;
                if (classifySurfaceColumn(dimension, wx, wz, hintY) !== "land") continue;
                const surface = findBuildSurfaceY(dimension, wx, wz, hintY);
                if (surface === undefined) continue;
                if (trySetBlock(dimension, wx, surface - 1, wz, "minecraft:water", SETTLEMENT_REPLACE_ANY)) {
                    changed++;
                }
            }
        }
    }
    return changed;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {SettlementRuleset} ruleset
 * @param {{ x: number, y: number, z: number }} location
 */
export function tryPlaceAddonJigsaw(dimension, ruleset, location) {
    const id = ADDON_JIGSAW_BY_RULESET[ruleset];
    if (!id) return { placed: false };
    const sm = world.structureManager;
    if (!sm?.placeJigsawStructure) return { placed: false };
    try {
        const box = sm.placeJigsawStructure(id, dimension, location, {
            includeEntities: true,
            ignoreStartHeight: true
        });
        return { placed: true, box, usedId: id };
    } catch {
        return { placed: false };
    }
}

/** @typedef {import("./mb_settlementStructures.js").WorkStructureKind|"house"|"smithy"|"farm"} StructureKind */

/**
 * @typedef {{ type: StructureKind, ox: number, oz: number, door: number, housePlan?: number, churchRoll?: number, forceLookout?: boolean }} StructureSlot
 */

/** @typedef {{ dx: number, dz: number }} PathCell */

/** @typedef {{ lx: number, lz: number, id: string }} InteriorSpec */

/** @typedef {{ lx: number, lz0: number, lz1: number }} PartitionSpec */

/**
 * @typedef {{
 *   id: string,
 *   w: number,
 *   d: number,
 *   wallH: number,
 *   cobCount: number,
 *   glassChance: number,
 *   floor: (lx: number, lz: number, w: number, d: number) => "log"|"plank"|"skip",
 *   interior: InteriorSpec[],
 *   partitions?: PartitionSpec[]
 * }} HousePlan
 */

/**
 * @param {number} lx
 * @param {number} lz
 * @param {number} w
 * @param {number} d
 */
function isHouseCornerCell(lx, lz, w, d) {
    return (lx === 0 || lx === w - 1) && (lz === 0 || lz === d - 1);
}

/**
 * @param {number} lx
 * @param {number} lz
 * @param {number} w
 * @param {number} d
 */
function isHouseEdgeCell(lx, lz, w, d) {
    return lx === 0 || lx === w - 1 || lz === 0 || lz === d - 1;
}

const ANIMAL_PEN_W = 5;

/**
 * Ruined roof: mostly intact slab cap with scattered holes (not collapsed into the shell).
 * @param {number} wx
 * @param {number} wz
 * @param {number} salt
 * @param {boolean} [edgeCell]
 */
function ruinRoofIsHole(wx, wz, salt, edgeCell = true) {
    const roll = hashChunkRoll(wx, wz, salt + 3, 1000);
    const keep = edgeCell ? 940 : 960;
    return roll >= keep;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} baseY
 * @param {number} wallH
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} salt
 */
/**
 * @param {SettlementRuleset} ruleset
 */
/** @typedef {"flat"|"shed"|"peaked"|"steeple"} RoofStyleKind */

/**
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @returns {RoofStyleKind}
 */
function resolveRoofStyle(st, plan) {
    if (plan?.roofStyle) return plan.roofStyle;
    if (st.variant !== "house") {
        if (st.variant === "farm" || st.variant === "farmer") {
            return hashChunkRoll(st.cx, st.cz, st.salt + 902, 100) < 35 ? "flat" : "shed";
        }
        return "peaked";
    }
    if (st.ruleset === "desert" && hashChunkRoll(st.cx, st.cz, st.salt + 901, 100) < 28) return "flat";
    const roll = hashChunkRoll(st.cx, st.cz, st.salt + 900, 100);
    if (roll < 8) return "shed";
    if (roll < 18) return "flat";
    return "peaked";
}

/**
 * @param {StructureBuildState} st
 * @param {RoofStyleKind} style
 */
function getRoofPeakHeight(st, style) {
    if (style === "flat") return 0;
    const span = Math.min(st.w, st.d);
    let peak = span >= 9 ? 3 : span >= 6 ? 2 : 1;
    if (style === "steeple") peak += 1;
    return peak;
}

/**
 * @param {StructureBuildState} st
 * @param {string|undefined} slabOverride
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function roofFillBlockForStructure(st, mat, slabOverride) {
    if (slabOverride === "minecraft:cobblestone_slab" || structureUsesStoneShell(st)) {
        return st.ruleset === "desert" ? "minecraft:sandstone" : "minecraft:cobblestone";
    }
    return mat.plank;
}

/**
 * @param {number} w
 * @param {number} d
 */
function ridgeAxisAlongZ(w, d) {
    return w >= d;
}

/**
 * Long wall faces of a gable (stair slopes); gable-end triangles are the short sides.
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isRoofSlopeFaceCell(st, lx, lz) {
    if (!isOccupiedStructureEdge(st, lx, lz)) return false;
    const ridgeAlongZ = ridgeAxisAlongZ(st.w, st.d);
    if (ridgeAlongZ) {
        return lz === 0 || lz === st.d - 1;
    }
    return lx === 0 || lx === st.w - 1;
}

/**
 * Vanilla-style stair-framed gable on the two long roof faces.
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {RoofStyleKind} style
 */
function structureUsesFramedRoof(st, plan, style) {
    if (plan?.roofFramed === false) return false;
    if (plan?.roofFramed === true) return true;
    if (style !== "peaked" && style !== "steeple") return false;
    if (structureIsMultiStory(plan)) return false;
    const span = Math.min(st.w, st.d);
    if (span < 5) return false;
    return hashChunkRoll(st.cx, st.cz, st.salt + 904, 100) < 62;
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 * @param {RoofStyleKind} style
 * @param {number} peak
 */
function structureRoofExtraAt(st, lx, lz, style, peak) {
    if (peak <= 0 || style === "flat") return 0;
    const midX = (st.w - 1) / 2;
    const midZ = (st.d - 1) / 2;
    if (style === "shed") {
        let t = 0;
        if (st.doorFace === 0) t = lz / Math.max(1, st.d - 1);
        else if (st.doorFace === 2) t = (st.d - 1 - lz) / Math.max(1, st.d - 1);
        else if (st.doorFace === 1) t = (st.w - 1 - lx) / Math.max(1, st.w - 1);
        else t = lx / Math.max(1, st.w - 1);
        return Math.min(peak, Math.max(0, Math.round(t * peak)));
    }
    const alongZ = ridgeAxisAlongZ(st.w, st.d);
    const dist = alongZ ? Math.abs(lx - midX) : Math.abs(lz - midZ);
    const maxDist = alongZ ? Math.max(1, Math.floor((st.w - 1) / 2)) : Math.max(1, Math.floor((st.d - 1) / 2));
    const extra = Math.max(0, Math.round(peak * (1 - dist / maxDist)));
    if (style === "steeple" && dist < 0.5) return peak + 1;
    return extra;
}

/**
 * @param {StructureBuildState} st
 * @param {RoofStyleKind} style
 * @param {number} peak
 */
function structureMaxRoofExtra(st, style, peak) {
    if (style === "flat" || peak <= 0) return 0;
    let max = 0;
    for (let lx = 0; lx < st.w; lx++) {
        for (let lz = 0; lz < st.d; lz++) {
            if (!structureCellOccupied(st, lx, lz)) continue;
            max = Math.max(max, structureRoofExtraAt(st, lx, lz, style, peak));
        }
    }
    return max;
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @param {number} lx
 * @param {number} lz
 */
function structureCellRoofExtra(st, lx, lz, style, peak) {
    if (style === "flat" || peak <= 0) return 0;
    return structureRoofExtraAt(st, lx, lz, style, peak);
}

/**
 * Y of the topmost roof block at this column.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @param {number} lx
 * @param {number} lz
 */
function structureCellRoofSurfaceY(st, dimension, floorCache, mat, hintY, lx, lz) {
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (sy === undefined) return undefined;
    const plan = getStructureFloorPlan(st);
    const style = resolveRoofStyle(st, plan);
    const peak = getRoofPeakHeight(st, style);
    const wh = structureCellWallH(st, lx, lz);
    const extra = structureCellRoofExtra(st, lx, lz, style, peak);
    return sy + wh + extra;
}

/** @deprecated alias */
function structureCellCrownY(st, dimension, floorCache, mat, hintY, lx, lz) {
    return structureCellRoofSurfaceY(st, dimension, floorCache, mat, hintY, lx, lz);
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
function structureMaxRoofSurfaceY(st, dimension, floorCache, mat, hintY) {
    let maxY = st.platformY ?? 0;
    for (let lx = 0; lx < st.w; lx++) {
        for (let lz = 0; lz < st.d; lz++) {
            if (!structureCellOccupied(st, lx, lz)) continue;
            const ry = structureCellRoofSurfaceY(st, dimension, floorCache, mat, hintY, lx, lz);
            if (ry !== undefined) maxY = Math.max(maxY, ry);
        }
    }
    return maxY;
}

/** @deprecated alias */
function structureMaxCrownY(st, dimension, floorCache, mat, hintY) {
    return structureMaxRoofSurfaceY(st, dimension, floorCache, mat, hintY);
}

/**
 * @param {number} lx
 * @param {number} lz
 * @param {boolean} ridgeAlongZ
 * @param {number} midX
 * @param {number} midZ
 * @returns {number} Bedrock weirdo_direction 0=east 1=west 2=south 3=north
 */
function stairWeirdoAwayFromRidge(lx, lz, ridgeAlongZ, midX, midZ) {
    if (ridgeAlongZ) {
        if (lx > midX) return 1;
        if (lx < midX) return 0;
        return hashChunkRoll(lx, lz, 31, 2) === 0 ? 0 : 1;
    }
    if (lz > midZ) return 3;
    if (lz < midZ) return 2;
    return hashChunkRoll(lx, lz, 32, 2) === 0 ? 2 : 3;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} stairId
 * @param {boolean} upsideDown
 * @param {number} weirdoDirection
 */
function trySetRoofStair(dimension, x, y, z, stairId, upsideDown, weirdoDirection) {
    try {
        const perm = BlockPermutation.resolve(stairId, {
            upside_down_bit: upsideDown,
            weirdo_direction: weirdoDirection
        });
        dimension.getBlock({ x, y, z })?.setPermutation(perm);
        return true;
    } catch {
        /* fall through */
    }
    try {
        dimension.runCommand(
            `setblock ${x} ${y} ${z} ${stairId.replace("minecraft:", "")} ["upside_down_bit"=${upsideDown ? "true" : "false"},"weirdo_direction"=${weirdoDirection}]`
        );
        return true;
    } catch {
        return trySetBlock(dimension, x, y, z, stairId, SETTLEMENT_REPLACE_ANY);
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} y
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} salt
 */
function tryRoofSnowAccent(dimension, wx, wz, y, mat, salt, ruleset) {
    void dimension;
    void wx;
    void wz;
    void y;
    void mat;
    void salt;
    void ruleset;
    /* mb:snow_layer only in final sprinkle phase when settlementRollsMbSnowSprinkle */
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} baseY
 * @param {number} wallH
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} salt
 * @param {boolean} [edgeCell]
 * @param {string|undefined} slabOverride
 */
function placeFlatRoofCell(
    dimension,
    wx,
    wz,
    baseY,
    wallH,
    mat,
    salt,
    edgeCell = true,
    slabOverride,
    ruleset = "plains",
    fillId
) {
    if (ruinRoofIsHole(wx, wz, salt, edgeCell)) return;
    const roofY = baseY + wallH;
    const blockId = fillId ?? roofFillBlockForStructure({ ruleset }, mat, slabOverride);
    trySetBlock(dimension, wx, roofY, wz, blockId, SETTLEMENT_REPLACE_ANY);
    tryRoofSnowAccent(dimension, wx, wz, roofY, mat, salt, ruleset);
}

/** @deprecated Use placeFlatRoofCell */
function placeRuinRoofCell(
    dimension,
    wx,
    wz,
    baseY,
    wallH,
    mat,
    salt,
    ruleset,
    edgeCell = true,
    slabOverride,
    st,
    lx,
    lz
) {
    void ruleset;
    void st;
    void lx;
    void lz;
    placeFlatRoofCell(dimension, wx, wz, baseY, wallH, mat, salt, edgeCell, slabOverride);
}

/**
 * Peaked / steeple roof column (inverted-V slope).
 * @returns {number} blocks placed
 */
function placeFramedPeakedRoofColumn(
    dimension,
    st,
    lx,
    lz,
    baseY,
    cellWallH,
    mat,
    salt,
    peak,
    style
) {
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    const extra = structureRoofExtraAt(st, lx, lz, style, peak);
    const eaveY = baseY + cellWallH;
    const midX = (st.w - 1) / 2;
    const midZ = (st.d - 1) / 2;
    const ridgeAlongZ = ridgeAxisAlongZ(st.w, st.d);
    const dist = ridgeAlongZ ? Math.abs(lx - midX) : Math.abs(lz - midZ);
    const weirdo = stairWeirdoAwayFromRidge(lx, lz, ridgeAlongZ, midX, midZ);
    let n = 0;
    if (extra <= 0) {
        if (trySetRoofStair(dimension, wx, eaveY, wz, mat.stair, false, weirdo)) n++;
        return n;
    }
    for (let dy = 0; dy < extra; dy++) {
        if (trySetRoofStair(dimension, wx, eaveY + dy, wz, mat.stair, false, weirdo)) n++;
    }
    const topY = eaveY + extra;
    if (dist < 0.01) {
        if (style === "steeple") {
            if (trySetBlock(dimension, wx, topY, wz, mat.log, SETTLEMENT_REPLACE_ANY)) n++;
            if (trySetBlock(dimension, wx, topY + 1, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) n++;
        } else if (trySetBlock(dimension, wx, topY, wz, mat.log, SETTLEMENT_REPLACE_ANY)) {
            n++;
        }
    } else {
        const capUpside = hashChunkRoll(wx, wz, salt + 41, 100) < 28;
        if (trySetRoofStair(dimension, wx, topY, wz, mat.stair, capUpside, weirdo)) n++;
    }
    tryRoofSnowAccent(dimension, wx, wz, topY, mat, salt, st.ruleset);
    return n;
}

/**
 * Peaked / steeple roof column (inverted-V slope).
 * @returns {number} blocks placed
 */
function placePeakedRoofColumn(
    dimension,
    st,
    lx,
    lz,
    baseY,
    cellWallH,
    mat,
    salt,
    slabOverride,
    peak,
    style
) {
    const plan = getStructureFloorPlan(st);
    if (structureUsesFramedRoof(st, plan, style) && isRoofSlopeFaceCell(st, lx, lz)) {
        return placeFramedPeakedRoofColumn(
            dimension,
            st,
            lx,
            lz,
            baseY,
            cellWallH,
            mat,
            salt,
            peak,
            style
        );
    }
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    const extra = structureRoofExtraAt(st, lx, lz, style, peak);
    const fillId = roofFillBlockForStructure(st, mat, slabOverride);
    if (extra <= 0) {
        placeFlatRoofCell(
            dimension,
            wx,
            wz,
            baseY,
            cellWallH,
            mat,
            salt,
            true,
            slabOverride,
            st.ruleset,
            fillId
        );
        return 1;
    }
    const eaveY = baseY + cellWallH;
    const midX = (st.w - 1) / 2;
    const midZ = (st.d - 1) / 2;
    const ridgeAlongZ = ridgeAxisAlongZ(st.w, st.d);
    const dist = ridgeAlongZ ? Math.abs(lx - midX) : Math.abs(lz - midZ);
    const weirdo = stairWeirdoAwayFromRidge(lx, lz, ridgeAlongZ, midX, midZ);
    let n = 0;
    if (trySetBlock(dimension, wx, eaveY, wz, fillId, SETTLEMENT_REPLACE_ANY)) n++;
    for (let dy = 1; dy < extra; dy++) {
        const y = eaveY + dy;
        if (trySetBlock(dimension, wx, y, wz, fillId, SETTLEMENT_REPLACE_ANY)) n++;
        if (extra >= 2 && dy === extra - 1 && dist >= 0.5) {
            if (trySetRoofStair(dimension, wx, y, wz, mat.stair, false, weirdo)) n++;
        }
    }
    const topY = eaveY + extra;
    if (dist < 0.01 && style === "steeple") {
        if (trySetBlock(dimension, wx, topY, wz, mat.log, SETTLEMENT_REPLACE_ANY)) n++;
        if (trySetBlock(dimension, wx, topY + 1, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) n++;
    } else if (dist < 0.01) {
        if (trySetBlock(dimension, wx, topY, wz, mat.log, SETTLEMENT_REPLACE_ANY)) n++;
    } else {
        const capRoll = hashChunkRoll(wx, wz, salt + 42, 100);
        if (capRoll < 30) {
            if (trySetRoofStair(dimension, wx, topY, wz, mat.stair, true, weirdo)) n++;
        } else if (capRoll < 55) {
            if (trySetRoofStair(dimension, wx, topY, wz, mat.stair, false, weirdo)) n++;
        } else {
            const fillId = roofFillBlockForStructure(st, mat, slabOverride);
            if (trySetBlock(dimension, wx, topY, wz, fillId, SETTLEMENT_REPLACE_ANY)) n++;
        }
    }
    tryRoofSnowAccent(dimension, wx, wz, topY, mat, salt, st.ruleset);
    return n;
}

/**
 * @returns {number} blocks placed
 */
function placeShedRoofColumn(
    dimension,
    st,
    lx,
    lz,
    baseY,
    cellWallH,
    mat,
    salt,
    slabOverride,
    peak
) {
    return placePeakedRoofColumn(
        dimension,
        st,
        lx,
        lz,
        baseY,
        cellWallH,
        mat,
        salt,
        slabOverride,
        peak,
        "shed"
    );
}

/**
 * @param {StructureBuildState} st
 * @returns {number} blocks placed
 */
function placeRoofColumnForCell(st, dimension, floorCache, mat, hintY, lx, lz) {
    if (!structureCellOccupied(st, lx, lz)) return 0;
    if (isStructureDoorOpeningCell(st, lx, lz) || isInAccessShaft(st, lx, lz) || isInBasementShaft(st, lx, lz)) return 0;
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    const baseY = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (baseY === undefined) return 0;
    const plan = getStructureFloorPlan(st);
    const style = resolveRoofStyle(st, plan);
    const peak = getRoofPeakHeight(st, style);
    const cellWallH = structureCellWallH(st, lx, lz);
    const slabOverride = roofSlabForStructure(st, mat);
    const edge = isOccupiedStructureEdge(st, lx, lz);
    const fillId = roofFillBlockForStructure(st, mat, slabOverride);
    const multi = structureIsMultiStory(plan);
    if (multi && !edge && style !== "flat") {
        if (!ruinRoofIsHole(wx, wz, st.salt, false)) {
            placeFlatRoofCell(
                dimension,
                wx,
                wz,
                baseY,
                cellWallH,
                mat,
                st.salt,
                false,
                slabOverride,
                st.ruleset,
                fillId
            );
            return 1;
        }
        return 0;
    }
    if (style === "flat") {
        if (!ruinRoofIsHole(wx, wz, st.salt, edge)) {
            placeFlatRoofCell(
                dimension,
                wx,
                wz,
                baseY,
                cellWallH,
                mat,
                st.salt,
                edge,
                slabOverride,
                st.ruleset,
                fillId
            );
            return 1;
        }
        return 0;
    }
    if (ruinRoofIsHole(wx, wz, st.salt, edge) && hashChunkRoll(wx, wz, st.salt + 5, 100) < 30) {
        return 0;
    }
    if (style === "shed") {
        return placeShedRoofColumn(
            dimension,
            st,
            lx,
            lz,
            baseY,
            cellWallH,
            mat,
            st.salt,
            slabOverride,
            peak
        );
    }
    return placePeakedRoofColumn(
        dimension,
        st,
        lx,
        lz,
        baseY,
        cellWallH,
        mat,
        st.salt,
        slabOverride,
        peak,
        style
    );
}

/**
 * @param {SettlementRuleset} ruleset
 */
function rulesetUsesRoofOverhang(ruleset) {
    return ruleset !== "desert";
}

/**
 * Outward eave targets for occupied perimeter cells (mask-aware silhouettes).
 * @param {StructureBuildState} st
 * @returns {{ lx: number, lz: number, dx: number, dz: number }[]}
 */
function collectRoofOverhangTargets(st) {
    /** @type {{ lx: number, lz: number, dx: number, dz: number }[]} */
    const targets = [];
    const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
    ];
    for (let lx = 0; lx < st.w; lx++) {
        for (let lz = 0; lz < st.d; lz++) {
            if (!isOccupiedStructureEdge(st, lx, lz)) continue;
            if (isStructureDoorOpeningCell(st, lx, lz)) continue;
            for (const [dx, dz] of dirs) {
                const nx = lx + dx;
                const nz = lz + dz;
                if (nx >= 0 && nz >= 0 && nx < st.w && nz < st.d && structureCellOccupied(st, nx, nz)) {
                    continue;
                }
                targets.push({ lx, lz, dx, dz });
            }
        }
    }
    return targets;
}

/**
 * @param {number} dx
 * @param {number} dz
 * @returns {number}
 */
function overhangStairWeirdo(dx, dz) {
    if (dx === -1) return 1;
    if (dx === 1) return 0;
    if (dz === -1) return 2;
    return 3;
}

/**
 * One-block eave lip beyond the wall line (skipped in desert rulesets).
 * @param {StructureBuildState} st
 * @returns {number}
 */
function placeRoofOverhangTarget(
    st,
    dimension,
    floorCache,
    mat,
    hintY,
    lx,
    lz,
    dx,
    dz
) {
    if (!rulesetUsesRoofOverhang(st.ruleset)) return 0;
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    const ox = wx + dx;
    const oz = wz + dz;
    const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (sy === undefined) return 0;
    const plan = getStructureFloorPlan(st);
    const style = resolveRoofStyle(st, plan);
    const cellWallH = structureCellWallH(st, lx, lz);
    const eaveY = sy + cellWallH;
    const slabOverride = roofSlabForStructure(st, mat);
    const slabId = slabOverride ?? mat.slab;
    let n = 0;
    if (style === "flat") {
        if (trySetBlock(dimension, ox, eaveY, oz, slabId, SETTLEMENT_REPLACE_ANY)) n++;
        return n;
    }
    const weirdo = overhangStairWeirdo(dx, dz);
    const lipRoll = hashChunkRoll(ox, oz, st.salt + 903, 100);
    if (lipRoll < 38) {
        if (trySetBlock(dimension, ox, eaveY, oz, slabId, SETTLEMENT_REPLACE_ANY)) n++;
    } else if (lipRoll < 78) {
        if (trySetRoofStair(dimension, ox, eaveY, oz, mat.stair, false, weirdo)) n++;
    } else {
        if (trySetRoofStair(dimension, ox, eaveY, oz, mat.stair, true, weirdo)) n++;
        if (lipRoll >= 94 && trySetBlock(dimension, ox, eaveY - 1, oz, slabId, SETTLEMENT_REPLACE_ANY)) {
            n++;
        }
    }
    return n;
}

/**
 * Keep multi-story living volumes walkable — clears stray roof/seal blocks between floor slabs.
 * @param {StructureBuildState} st
 * @returns {number}
 */
function clearMultiStoryInteriorAir(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    if (!structureIsMultiStory(plan)) return 0;
    const keepDy = new Set(planMidFloorLevels(plan).map((h) => h - 1));
    let n = 0;
    for (let lx = 1; lx < st.w - 1; lx++) {
        for (let lz = 1; lz < st.d - 1; lz++) {
            if (!structureCellOccupied(st, lx, lz)) continue;
            if (isInAccessShaft(st, lx, lz)) continue;
            const wx = st.originX + lx;
            const wz = st.originZ + lz;
            const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
            if (sy === undefined) continue;
            for (let dy = 1; dy < st.wallH; dy++) {
                if (keepDy.has(dy)) continue;
                if (trySetBlock(dimension, wx, sy + dy, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) n++;
            }
        }
    }
    return n;
}
const ANIMAL_PEN_D = 5;

/**
 * Structural beam / frame block (oak log, acacia log, sandstone pillar per ruleset).
 * @param {"log"|"plank"|"skip"} kind
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function resolveFloorBlockId(kind, mat) {
    if (kind === "plank") return mat.plank;
    if (kind === "log") return mat.log;
    if (kind === "stone") return mat.wallMossy;
    return mat.plank;
}

/**
 * @param {StructureBuildState} st
 * @returns {boolean}
 */
function structureUsesStoneShell(st) {
    const plan = getStructureFloorPlan(st);
    return plan?.buildStyle === "stone";
}

/**
 * @param {StructureBuildState} st
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function roofSlabForStructure(st, mat) {
    if (!structureUsesStoneShell(st)) return mat.slab;
    if (st.ruleset === "desert") return mat.slab;
    return "minecraft:cobblestone_slab";
}

/**
 * @param {string|undefined} slabOverride
 */
function structureUsesStoneShellFromSlab(slabOverride) {
    return slabOverride === "minecraft:cobblestone_slab";
}

/**
 * @param {SettlementRuleset} ruleset
 */
function carpetIdForRuleset(ruleset) {
    switch (ruleset) {
        case "desert":
        case "savanna":
            return "minecraft:orange_carpet";
        case "jungle":
            return "minecraft:lime_carpet";
        case "taiga":
        case "snowy":
        case "ice":
        case "infected":
            return "minecraft:gray_carpet";
        default:
            return "minecraft:white_carpet";
    }
}

/**
 * @param {number} wx
 * @param {number} wz
 * @param {number} salt
 */
function pickFlowerPotId(wx, wz, salt) {
    const flowers = [
        "minecraft:poppy",
        "minecraft:dandelion",
        "minecraft:oxeye_daisy",
        "minecraft:cornflower",
        "minecraft:azure_bluet"
    ];
    return flowers[hashChunkRoll(wx, wz, salt + 77, flowers.length)];
}

/**
 * Rugs, bedside stairs, flower pots — vanilla abandoned-house flavor.
 * @param {SettlementRuleset} ruleset
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function generateHouseDecor(ruleset, variant, w, d, mat) {
    const carpet = carpetIdForRuleset(ruleset);
    /** @type {{ lx: number, lz: number, id: string, floor?: 1|2 }[]} */
    const out = [];
    const midX = Math.max(2, Math.floor(w / 2));
    const midZ = Math.max(2, Math.floor(d / 2));
    const area = Math.max(1, (w - 2) * (d - 2));
    const detailRoll = hashChunkRoll(variant, w + d, 501, 100);

    if (detailRoll < 85) {
        out.push({ lx: midX, lz: midZ, id: carpet });
    }
    if (w > 5 && d > 4 && detailRoll < 78) {
        out.push({
            lx: Math.min(w - 2, midX + 1),
            lz: Math.min(d - 2, midZ),
            id: "minecraft:flower_pot"
        });
    }
    if (area >= 12 && hashChunkRoll(variant, w, 502, 100) < 62) {
        out.push({ lx: 2, lz: Math.min(d - 2, midZ + 1), id: "minecraft:lantern" });
    }
    if (area >= 16 && hashChunkRoll(variant, d, 503, 100) < 48) {
        out.push({ lx: Math.max(1, w - 3), lz: 2, id: "minecraft:decorated_pot" });
    }
    if (area >= 20 && hashChunkRoll(variant, w, 504, 100) < 42) {
        out.push({ lx: midX, lz: Math.max(1, midZ - 1), id: "minecraft:bookshelf" });
    }
    if (area >= 24 && hashChunkRoll(variant, d, 505, 100) < 38) {
        out.push({
            lx: Math.max(1, Math.min(w - 2, midX - 1)),
            lz: Math.max(1, Math.min(d - 2, midZ + 2)),
            id: "minecraft:barrel"
        });
    }
    if (area >= 28 && hashChunkRoll(variant, w + d, 506, 100) < 34) {
        out.push({ lx: 2, lz: 2, id: "minecraft:smoker" });
    }
    void mat;
    return out;
}

/**
 * Resolve floor plan once per structure (avoid re-running loot stamping every tick).
 * @param {StructureBuildState} st
 * @returns {import("./mb_settlementStructures.js").HousePlan|null}
 */
function resolveStructureFloorPlan(st) {
    if (st.variant === "church" && st.churchRoll != null) {
        return getChurchPlan(st.ruleset, st.churchRoll);
    }
    const work = getWorkBuildingPlan(st.variant, st.cx, st.cz, st.salt, st.ruleset);
    if (work) return work;
    if (st.variant === "house" && st.housePlan != null) {
        return getHousePlanForRuleset(st.ruleset, st.housePlan);
    }
    return null;
}

/**
 * @param {StructureBuildState} st
 * @returns {HousePlan|null}
 */
function getStructureFloorPlan(st) {
    if (st.floorPlan !== undefined) return st.floorPlan;
    return resolveStructureFloorPlan(st);
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function structureCellOccupied(st, lx, lz) {
    if (lx < 0 || lz < 0 || lx >= st.w || lz >= st.d) return false;
    const plan = getStructureFloorPlan(st);
    if (plan?.occupied) return plan.occupied(lx, lz, st.w, st.d);
    return true;
}

/**
 * Occupied cell on the structural outline (mask-aware edges).
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isOccupiedStructureEdge(st, lx, lz) {
    if (!structureCellOccupied(st, lx, lz)) return false;
    if (lx === 0 || lx === st.w - 1 || lz === 0 || lz === st.d - 1) return true;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dz] of dirs) {
        if (!structureCellOccupied(st, lx + dx, lz + dz)) return true;
    }
    return false;
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function structureCellWallH(st, lx, lz) {
    const plan = getStructureFloorPlan(st);
    if (plan?.wallHAt) return plan.wallHAt(lx, lz);
    return st.wallH;
}

/**
 * @param {HousePlan|null|undefined} plan
 */
function planMidFloorLevels(plan) {
    if (plan?.midFloorLevels?.length) return plan.midFloorLevels;
    if ((plan?.stories ?? 1) >= 2) return [plan?.midFloorH ?? 3];
    return [];
}

/**
 * @param {StructureKind} type
 * @param {number} [housePlan]
 */
export function footprintForStructure(type, housePlan, ruleset = "plains") {
    if (type === "house" && housePlan != null) {
        const p = getHousePlanForRuleset(ruleset, housePlan);
        return { w: p.w, d: p.d, wallH: p.wallH };
    }
    const work = getWorkBuildingPlan(type);
    if (work) return { w: work.w, d: work.d, wallH: work.wallH };
    return structureDimsForVariant(type);
}

/** Blocks of earth berm around submerged cellars (outside footprint). */
const CELLAR_BURY_MARGIN = 1;

/**
 * @param {SettlementRuleset} ruleset
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function cellarBuryFillId(ruleset, mat) {
    if (ruleset === "desert" || ruleset === "savanna") return "minecraft:sand";
    if (ruleset === "snowy" || ruleset === "ice" || ruleset === "taiga") return "minecraft:cobblestone";
    if (ruleset === "infected") {
        return mat.wallMossy ?? mat.path ?? "minecraft:mossy_cobblestone";
    }
    return mat.pathDirt ?? "minecraft:dirt";
}

/**
 * @param {SettlementRuleset} ruleset
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function cellarSurfaceCapId(ruleset, mat) {
    if (ruleset === "desert" || ruleset === "savanna") return "minecraft:sand";
    if (ruleset === "snowy" || ruleset === "ice") return "minecraft:snow_block";
    if (ruleset === "infected") return "mb:dusted_dirt";
    return mat.pathGrass ?? "minecraft:grass_block";
}

/** Infected building pads: only the walk surface is dusted; fill is ruin stone/dirt. */
function infectedPadSurfaceCapId() {
    return "mb:dusted_dirt";
}

/**
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} wx
 * @param {number} wz
 * @param {number} [salt]
 */
function infectedPadFillId(mat, wx, wz, salt = 0) {
    const r = hashChunkRoll(wx, wz, salt + 902, 100);
    if (r < 42) return mat.path ?? "minecraft:mossy_cobblestone";
    if (r < 84) return mat.wall ?? "minecraft:cobblestone";
    return mat.wallMossy ?? "minecraft:mossy_cobblestone";
}

/**
 * @param {StructureBuildState} st
 */
function structureHasCellar(st) {
    return (getStructureFloorPlan(st)?.basementDepth ?? 0) > 0;
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isInBasementShaft(st, lx, lz) {
    if (!structureHasCellar(st)) return false;
    const hatch = getStructureFloorPlan(st)?.basementHatch;
    return !!hatch && hatch.lx === lx && hatch.lz === lz;
}

/**
 * @param {StructureBuildState} st
 * @param {number} ax
 * @param {number} az
 */
function shaftFitsInterior(st, ax, az) {
    for (let dlx = 0; dlx < 2; dlx++) {
        for (let dlz = 0; dlz < 2; dlz++) {
            const lx = ax + dlx;
            const lz = az + dlz;
            if (!structureCellOccupied(st, lx, lz)) return false;
            if (isOccupiedStructureEdge(st, lx, lz)) return false;
        }
    }
    return true;
}

/**
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {number} ax
 * @param {number} az
 */
function isLootStorageBlockId(blockId) {
    return blockId === "minecraft:chest" || blockId === "minecraft:barrel";
}

/**
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {number} lx
 * @param {number} lz
 */
function plannedLootStorageAt(plan, lx, lz) {
    for (const spec of plan?.interior ?? []) {
        if (!isLootStorageBlockId(spec.id)) continue;
        if (spec.lx === lx && spec.lz === lz) return true;
    }
    return false;
}

/**
 * One ladder column inside the 2×2 shaft — other shaft cells may hold chests/barrels.
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {number} shaftLx
 * @param {number} shaftLz
 * @returns {{ ladderFootLx: number, ladderFootLz: number }|null}
 */
function pickLadderFootInShaft(plan, shaftLx, shaftLz) {
    /** @type {[number, number][]} */
    const offsets = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1]
    ];
    for (const [dlx, dlz] of offsets) {
        const lx = shaftLx + dlx;
        const lz = shaftLz + dlz;
        if (!plannedLootStorageAt(plan, lx, lz)) return { ladderFootLx: lx, ladderFootLz: lz };
    }
    return null;
}

/**
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {number} accessLx
 * @param {number} accessLz
 */
function commitAccessShaft(st, plan, accessLx, accessLz) {
    st.accessLx = accessLx;
    st.accessLz = accessLz;
    const foot = pickLadderFootInShaft(plan, accessLx, accessLz);
    if (foot) {
        st.ladderFootLx = foot.ladderFootLx;
        st.ladderFootLz = foot.ladderFootLz;
    } else {
        st.ladderFootLx = accessLx;
        st.ladderFootLz = accessLz;
    }
}

/**
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @returns {[number, number][]}
 */
function accessShaftCandidatesForPlan(st, plan) {
    const hp = st.housePlan;
    const planId = plan?.id ?? "";
    if (plan?.lWingWide) {
        return [
            [3, 2],
            [4, 2],
            [2, 3],
            [3, 3]
        ];
    }
    if (planId === "librarian" || planId === "librarian_study") {
        return [
            [1, 3],
            [1, 4],
            [Math.max(1, st.w - 4), Math.max(1, st.d - 4)],
            [2, Math.max(1, st.d - 4)]
        ];
    }
    if (hp === 38) {
        return [
            [2, 3],
            [5, 3],
            [3, 5],
            [Math.max(1, st.w - 4), 3]
        ];
    }
    if (hp === 37) {
        return [
            [3, 3],
            [4, 3],
            [Math.max(1, st.w - 4), 3],
            [2, Math.max(1, st.d - 4)]
        ];
    }
    if (hp === 39 || planId === "manor_library") {
        return [
            [1, 3],
            [Math.max(1, st.w - 4), 3],
            [1, 4],
            [Math.max(1, st.w - 4), 4]
        ];
    }
    return [
        [1, 3],
        [Math.max(1, st.w - 4), Math.max(1, st.d - 4)],
        [Math.max(1, Math.floor(st.w / 2) - 1), Math.max(1, Math.floor(st.d / 2) - 1)],
        [2, Math.max(1, st.d - 4)]
    ];
}

/**
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {number} ax
 * @param {number} az
 */
function accessShaftOriginValid(st, plan, ax, az) {
    if (ax < 1 || az < 1 || ax + 1 >= st.w - 1 || az + 1 >= st.d - 1) return false;
    const door = st.doorFace;
    if (door === 0 && az <= 1) return false;
    if (door === 2 && az >= st.d - 2) return false;
    if (door === 1 && ax >= st.w - 2) return false;
    if (door === 3 && ax <= 1) return false;
    if (!shaftFitsInterior(st, ax, az)) return false;
    if (!pickLadderFootInShaft(plan, ax, az)) return false;
    for (let dlx = 0; dlx < 2; dlx++) {
        for (let dlz = 0; dlz < 2; dlz++) {
            const lx = ax + dlx;
            const lz = az + dlz;
            if (isStructureDoorOpeningCell(st, lx, lz)) return false;
            if (isDoorApproachCell(st, lx, lz)) return false;
            if (isInBasementShaft(st, lx, lz)) return false;
            if (isBasementHatchCell(st, lx, lz)) return false;
            if (isFloorPantryCell(st, lx, lz)) return false;
        }
    }
    return true;
}

/**
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @returns {{ accessLx: number, accessLz: number }|null}
 */
function pickProspectiveAccessShaft(st, plan) {
    for (const [ax, az] of accessShaftCandidatesForPlan(st, plan)) {
        if (accessShaftOriginValid(st, plan, ax, az)) return { accessLx: ax, accessLz: az };
    }
    for (let az = 2; az < st.d - 3; az++) {
        for (let ax = 2; ax < st.w - 3; ax++) {
            if (accessShaftOriginValid(st, plan, ax, az)) return { accessLx: ax, accessLz: az };
        }
    }
    return null;
}

/**
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 */
function structureWillUseAccessShaft(st, plan) {
    if (structureIsMultiStory(plan)) return true;
    if (st.forceLookout) return true;
    if (plan?.roofDeck) return true;
    const rollMax = 26;
    return hashChunkRoll(st.cx, st.cz, st.salt + 880, 100) < rollMax;
}

/**
 * Reserve 2×2 shaft + ladder foot before furnishings (storage may use other shaft cells).
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 */
function reserveProspectiveAccessShaft(st, plan) {
    if (structureIsMultiStory(plan)) return;
    if (!structureWillUseAccessShaft(st, plan)) return;
    const shaft = pickProspectiveAccessShaft(st, plan);
    if (shaft) commitAccessShaft(st, plan, shaft.accessLx, shaft.accessLz);
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function doorExteriorOffset(st, lx, lz) {
    if (lx === 0) return { ox: -1, oz: 0 };
    if (lx === st.w - 1) return { ox: 1, oz: 0 };
    if (lz === 0) return { ox: 0, oz: -1 };
    if (lz === st.d - 1) return { ox: 0, oz: 1 };
    if (st.doorFace === 0) return { ox: 0, oz: -1 };
    if (st.doorFace === 2) return { ox: 0, oz: 1 };
    if (st.doorFace === 1) return { ox: 1, oz: 0 };
    return { ox: -1, oz: 0 };
}

/** Extra empty blocks between structure footprints (not counting outer walls). */
const MIN_STRUCTURE_GAP = 3;

/** Max Y spread across footprint before we refuse to build. */
const STRUCTURE_PAD_MAX_SLOPE = 10;
/** Max blocks we raise a low column when leveling to platformY. */
const STRUCTURE_PAD_MAX_FILL = 12;
/** Pillar down through air when a leveled floor overhangs a ravine. */
const STRUCTURE_FOUNDATION_MAX_DEPTH = 14;

/** Must match {@link catalogStructureSalt} in mb_abandonedStructureCatalog.js */
function structureBuildSaltForSlot(job, slotIndex) {
    if (job?.structureCatalogMode) return 500 + slotIndex * 31;
    return 100 + (slotIndex + 1) * 17;
}

/** Well shaft depth below surface (water + bottom cap). */
const WELL_SHAFT_DEPTH = 4;

/** countLampColumnArtifacts when the lamp chunk is not loaded (do not treat as clear). */
export const LAMP_ARTIFACT_COUNT_UNKNOWN = -1;

/** Matches structure_template_feature adjustment_radius on lamp posts (+ margin). */
const LAMP_ARTIFACT_HALF_W = 8;
const LAMP_ARTIFACT_Y_BELOW = 12;
const LAMP_ARTIFACT_Y_ABOVE = 48;

/** Blocks we may replace when raising a hillside structure pad. */
const STRUCTURE_PAD_REPLACE = new Set([
    ...RUIN_FLOOR_REPLACEABLE,
    "minecraft:gravel",
    "minecraft:stone",
    "minecraft:andesite",
    "minecraft:diorite",
    "minecraft:granite",
    "minecraft:tuff",
    "minecraft:deepslate",
    "minecraft:mud",
    "minecraft:clay",
    "minecraft:sandstone",
    "minecraft:red_sandstone"
]);

/** Keep ruins off the central well / plaza. */
const STRUCTURE_CENTER_EXCLUSION = 13;

/** Settlement center must be at least this far from the worldgen lamp (Chebyshev). */
export const LAMP_CENTER_MIN_DISTANCE = 14;

/** No building footprints within this range of the lamp post (relative to village center). */
const LAMP_STRUCTURE_EXCLUSION = 10;

/** No path / dusted-ground cells on the lamp post (Chebyshev); wider than 1-block post for path half-width. */
const LAMP_PATH_EXCLUSION = 4;

/**
 * @param {number|undefined} lampRelDx
 * @param {number|undefined} lampRelDz
 * @param {number} dx offset from village center
 * @param {number} dz
 */
function pathCellOverlapsLampMarker(lampRelDx, lampRelDz, dx, dz) {
    if (lampRelDx === undefined || lampRelDz === undefined) return false;
    return Math.max(Math.abs(dx - lampRelDx), Math.abs(dz - lampRelDz)) <= LAMP_PATH_EXCLUSION;
}

/**
 * @param {StructureKind} variant
 */
function structureDimsForVariant(variant) {
    const work = getWorkBuildingPlan(variant);
    if (work) return { w: work.w, d: work.d, wallH: work.wallH };
    return { w: 6, d: 5, wallH: 3 };
}

/**
 * @param {number} ox
 * @param {number} oz
 * @param {number} w
 * @param {number} d
 * @returns {number} door face 0=north (-Z) … 3=west (-X), toward village center
 */
export function doorFacingPlaza(ox, oz, w, d) {
    const mx = ox + w * 0.5;
    const mz = oz + d * 0.5;
    if (Math.abs(mx) >= Math.abs(mz)) return mx > 0 ? 3 : 1;
    return mz > 0 ? 2 : 0;
}

/**
 * @param {StructureSlot} slot
 * @returns {{ dx: number, dz: number }}
 */
function structureDoorPathTarget(slot, ruleset = "plains", cx = 0, cz = 0) {
    const { w, d } = footprintForStructure(slot.type, slot.housePlan, ruleset);
    /** @type {StructureBuildState} */
    const probe = {
        originX: 0,
        originZ: 0,
        doorFace: slot.door,
        variant: slot.type,
        housePlan: slot.housePlan,
        cx,
        cz,
        salt: 0,
        ruleset,
        w,
        d,
        wallH: 3,
        lx: 0,
        lz: 0,
        phase: "grid"
    };
    const doorCells = computeStructureDoorCells(probe);
    const primary = doorCells[0] ?? { lx: Math.floor(w / 2), lz: Math.floor(d / 2) };
    const door = slot.door;
    if (door === 0) return { dx: slot.ox + primary.lx, dz: slot.oz - 1 };
    if (door === 2) return { dx: slot.ox + primary.lx, dz: slot.oz + d };
    if (door === 1) return { dx: slot.ox + w, dz: slot.oz + primary.lz };
    return { dx: slot.ox - 1, dz: slot.oz + primary.lz };
}

/**
 * @param {(dx: number, dz: number) => void} visit
 * @param {number} dx
 * @param {number} dz
 * @param {"x"|"z"|"both"} axis
 */
function visitWidePathCell(visit, dx, dz, axis) {
    visit(dx, dz);
    if (axis === "x" || axis === "both") {
        for (let w = 1; w <= SETTLEMENT_PATH_HALF_WIDTH; w++) {
            visit(dx, dz - w);
            visit(dx, dz + w);
        }
    }
    if (axis === "z" || axis === "both") {
        for (let w = 1; w <= SETTLEMENT_PATH_HALF_WIDTH; w++) {
            visit(dx - w, dz);
            visit(dx + w, dz);
        }
    }
}

/**
 * @param {number} x0
 * @param {number} z0
 * @param {number} x1
 * @param {number} z1
 * @param {(dx: number, dz: number) => void} visit
 */
function traceManhattanPath(x0, z0, x1, z1, visit) {
    const add = (x, z, axis) => visitWidePathCell(visit, x, z, axis);
    let x = x0;
    let z = z0;
    add(x, z, "both");
    while (x !== x1) {
        x += x < x1 ? 1 : -1;
        add(x, z, "x");
    }
    while (z !== z1) {
        z += z < z1 ? 1 : -1;
        add(x, z, "z");
    }
}

/**
 * Plaza, spokes to each building door, and a light outer ring.
 * @param {StructureSlot[]} structures
 * @param {number} pathRadius
 * @param {{ ox: number, oz: number, gateFace: number }|undefined} [animalPen]
 * @returns {PathCell[]}
 */
function planSettlementPaths(
    structures,
    pathRadius,
    animalPen,
    ruleset = "plains",
    cx = 0,
    cz = 0,
    lampRelDx,
    lampRelDz
) {
    /** @type {Map<string, PathCell>} */
    const cells = new Map();
    const add = (dx, dz) => {
        if (pathCellOverlapsLampMarker(lampRelDx, lampRelDz, dx, dz)) return;
        if (dx * dx + dz * dz > (pathRadius + 2) * (pathRadius + 2)) return;
        const k = `${dx},${dz}`;
        if (!cells.has(k)) cells.set(k, { dx, dz });
    };

    for (let dx = -SETTLEMENT_PLAZA_RADIUS; dx <= SETTLEMENT_PLAZA_RADIUS; dx++) {
        for (let dz = -SETTLEMENT_PLAZA_RADIUS; dz <= SETTLEMENT_PLAZA_RADIUS; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) <= SETTLEMENT_PLAZA_RADIUS) add(dx, dz);
        }
    }

    for (const slot of structures) {
        const target = structureDoorPathTarget(slot, ruleset, cx, cz);
        traceManhattanPath(0, 0, target.dx, target.dz, add);
    }

    if (animalPen) {
        const gate = animalPenGatePathTarget(animalPen);
        traceManhattanPath(0, 0, gate.dx, gate.dz, add);
    }

    const ringR = Math.max(6, pathRadius - 2);
    for (let i = 0; i < 48; i++) {
        const ang = ((i / 48) * Math.PI * 2);
        const rx = Math.round(Math.cos(ang) * ringR);
        const rz = Math.round(Math.sin(ang) * ringR);
        visitWidePathCell(add, rx, rz, "both");
    }

    return [...cells.values()];
}

/**
 * Infected ruleset only — cold/taiga/ice/snowy must not get dusted path/pad fill from biome proximity.
 * @param {SettlementRuleset} ruleset
 */
export function settlementUsesDustedGround(ruleset) {
    return ruleset === "infected";
}

/** Base site roll cap (0–100) before day scaling — not tied to cold biomes. */
const SETTLEMENT_MB_SNOW_SPRINKLE_ROLL_MAX = 34;

/**
 * Infection-day multiplier for optional `mb:snow_layer` ruin sprinkle (early days = rarer).
 * @param {number} day
 */
export function settlementMbSnowSprinkleDayFactor(day) {
    if (day < 5) return 0;
    if (day < 12) return 0.25;
    if (day < 20) return 0.55;
    if (day < 28) return 0.85;
    return 1;
}

/**
 * Safe cold villages (taiga / ice / mega taiga) — no Maple Bear snow layer ruin sprinkle.
 * @param {SettlementRuleset} ruleset
 */
export function settlementRulesetNeverSprinklesMbSnow(ruleset) {
    return ruleset === "taiga" || ruleset === "ice";
}

/**
 * `mb:snow_layer` on paths/roofs after build.
 * - **snowy** ruleset: always (when day factor allows).
 * - **taiga / ice**: never (safe cold — spruce/cobble only).
 * - Other rulesets: optional infection-story sprinkle (~34% × day).
 * @param {SettlementRuleset} ruleset
 * @param {number} cx
 * @param {number} cz
 * @param {number} [siteSub]
 * @param {number} [day] defaults to {@link getCurrentDay}
 */
export function settlementRollsMbSnowSprinkle(ruleset, cx, cz, siteSub = 0, day = getCurrentDay()) {
    if (settlementRulesetNeverSprinklesMbSnow(ruleset)) return false;

    const dayFactor = settlementMbSnowSprinkleDayFactor(day);
    if (dayFactor <= 0) return false;

    if (ruleset === "snowy") return true;

    const scaledMax = Math.floor(SETTLEMENT_MB_SNOW_SPRINKLE_ROLL_MAX * dayFactor);
    if (scaledMax <= 0) return false;
    return hashChunkRoll(cx, cz, 11902 + (siteSub | 0) * 31, 100) < scaledMax;
}

/** @deprecated Use {@link settlementRollsMbSnowSprinkle} with ruleset. */
export function settlementUsesSnowCap(ruleset, cx, cz, siteSub = 0, day = getCurrentDay()) {
    return settlementRollsMbSnowSprinkle(ruleset, cx, cz, siteSub, day);
}

/**
 * @param {StructureSlot[]} structures
 * @param {PathCell[]} pathCells
 * @param {number} pathRadius
 * @param {{ ox: number, oz: number }|undefined} animalPen
 * @param {boolean} singleStructureOnly
 * @returns {PathCell[]}
 */
function planInfectedGroundCells(
    structures,
    pathCells,
    pathRadius,
    animalPen,
    singleStructureOnly,
    lampRelDx,
    lampRelDz
) {
    /** @type {Map<string, PathCell>} */
    const cells = new Map();
    const add = (dx, dz) => {
        if (pathCellOverlapsLampMarker(lampRelDx, lampRelDz, dx, dz)) return;
        const k = `${dx},${dz}`;
        if (!cells.has(k)) cells.set(k, { dx, dz });
    };
    for (const s of structures) {
        const fp = footprintForStructure(s.type, s.housePlan);
        for (let lx = -1; lx <= fp.w; lx++) {
            for (let lz = -1; lz <= fp.d; lz++) add(s.ox + lx, s.oz + lz);
        }
    }
    if (animalPen) {
        for (let lx = -1; lx < ANIMAL_PEN_W + 1; lx++) {
            for (let lz = -1; lz < ANIMAL_PEN_D + 1; lz++) add(animalPen.ox + lx, animalPen.oz + lz);
        }
    }
    return [...cells.values()];
}

/**
 * Maple snow on paths, ring, and sparse pads (sprinkle roll only; applied after structures).
 * @param {PathCell[]} pathCells
 * @param {StructureSlot[]} structures
 * @param {number} cx
 * @param {number} cz
 * @param {number} pathRadius
 * @param {{ ox: number, oz: number }|undefined} animalPen
 */
function planSnowCapCells(pathCells, structures, cx, cz, pathRadius, animalPen) {
    /** @type {Map<string, PathCell>} */
    const cells = new Map();
    const add = (dx, dz) => {
        if (dx * dx + dz * dz > (pathRadius + 4) * (pathRadius + 4)) return;
        const k = `${dx},${dz}`;
        if (!cells.has(k)) cells.set(k, { dx, dz });
    };
    for (const c of pathCells) {
        add(c.dx, c.dz);
        add(c.dx + 1, c.dz);
        add(c.dx - 1, c.dz);
        add(c.dx, c.dz + 1);
        add(c.dx, c.dz - 1);
    }
    for (const s of structures) {
        const fp = footprintForStructure(s.type, s.housePlan);
        for (let lx = 1; lx < fp.w - 1; lx++) {
            for (let lz = 1; lz < fp.d - 1; lz++) {
                if (hashChunkRoll(cx + s.ox + lx, cz + s.oz + lz, 881, 100) < 24) {
                    add(s.ox + lx, s.oz + lz);
                }
            }
        }
    }
    if (animalPen) {
        for (let lx = 0; lx < ANIMAL_PEN_W; lx++) {
            for (let lz = 0; lz < ANIMAL_PEN_D; lz++) add(animalPen.ox + lx, animalPen.oz + lz);
        }
    }
    return [...cells.values()];
}

/**
 * Structure spawn pad: cobble/dirt fill with dusted dirt only on the top surface block.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {string} poleId
 * @param {number} [hintY]
 */
function trySetInfectedPadFooting(dimension, x, z, mat, poleId, hintY) {
    const surface = resolveColumnFloorY(dimension, x, z, poleId, hintY);
    if (surface === undefined) return false;
    const capY = surface - 1;
    const capId = infectedPadSurfaceCapId();
    let changed = false;
    try {
        const capBlock = dimension.getBlock({ x, y: capY, z });
        if (capBlock?.typeId === capId) return false;
        const fillId = infectedPadFillId(mat, x, z, 0);
        const belowBlock = dimension.getBlock({ x, y: capY - 1, z });
        const belowId = belowBlock?.typeId;
        if (
            belowBlock &&
            (isFoundationVoidId(belowId) ||
                isVegetationId(belowId) ||
                STRUCTURE_PAD_REPLACE.has(belowId) ||
                isSettlementReplaceableBlockId(belowId))
        ) {
            if (trySetBlock(dimension, x, capY - 1, z, fillId, SETTLEMENT_REPLACE_ANY)) changed = true;
        }
        if (trySetBlock(dimension, x, capY, z, capId, SETTLEMENT_REPLACE_ANY)) changed = true;
    } catch {
        return false;
    }
    return changed;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {string} poleId
 * @param {number} [hintY]
 */
function trySetMapleSnowCap(dimension, x, z, poleId, hintY) {
    const floorY = resolveColumnFloorY(dimension, x, z, poleId, hintY);
    if (floorY === undefined) return false;
    return trySetBlock(dimension, x, floorY, z, MAPLE_BEAR_SNOW_LAYER, SETTLEMENT_REPLACE_ANY);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} originX
 * @param {number} originZ
 * @param {number} w
 * @param {number} d
 * @param {number} [hintY]
 */
function columnSupportsStructureFooting(dimension, x, z, hintY) {
    const col = analyzeColumn(dimension, x, z, hintY);
    return col.kind === "land" || col.kind === "water";
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} chunkX
 * @param {number} chunkZ
 * @param {number} [hintY]
 */
function isSettlementChunkLoaded(dimension, chunkX, chunkZ, hintY = 64) {
    const y = Math.max(-60, Math.min(320, Math.floor(hintY)));
    try {
        const block = dimension.getBlock({ x: chunkX * 16 + 8, y, z: chunkZ * 16 + 8 });
        return block != null;
    } catch {
        return false;
    }
}

/**
 * All chunks covering a structure footprint must be loaded (simulation distance).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} originX
 * @param {number} originZ
 * @param {number} w
 * @param {number} d
 */
function structureFootprintChunksLoaded(dimension, originX, originZ, w, d, hintY) {
    const minCx = Math.floor(originX / 16);
    const maxCx = Math.floor((originX + Math.max(1, w) - 1) / 16);
    const minCz = Math.floor(originZ / 16);
    const maxCz = Math.floor((originZ + Math.max(1, d) - 1) / 16);
    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
            if (!isSettlementChunkLoaded(dimension, cx, cz, hintY)) return false;
        }
    }
    return true;
}

/**
 * Every chunk that paths, structures, lamp, or bunkers may touch for this job.
 * @param {BuildJob} job
 * @returns {{ minCx: number, maxCx: number, minCz: number, maxCz: number }}
 */
/**
 * @param {number} dx
 * @param {number} dz
 * @param {number} lampRelDx
 * @param {number} lampRelDz
 */
function chebyshevFromLampOffset(dx, dz, lampRelDx, lampRelDz) {
    return Math.max(Math.abs(dx - lampRelDx), Math.abs(dz - lampRelDz));
}

/**
 * @param {PathCell[]} pathCells
 * @param {number} lampRelDx
 * @param {number} lampRelDz
 */
function sortPathCellsNearLampFirst(pathCells, lampRelDx, lampRelDz) {
    return pathCells
        .slice()
        .sort(
            (a, b) =>
                chebyshevFromLampOffset(a.dx, a.dz, lampRelDx, lampRelDz) -
                chebyshevFromLampOffset(b.dx, b.dz, lampRelDx, lampRelDz)
        );
}

/**
 * @param {StructureSlot[]} structures
 * @param {number} lampRelDx
 * @param {number} lampRelDz
 */
function sortStructuresNearLampFirst(structures, lampRelDx, lampRelDz) {
    return structures
        .slice()
        .sort(
            (a, b) =>
                chebyshevFromLampOffset(a.ox, a.oz, lampRelDx, lampRelDz) -
                chebyshevFromLampOffset(b.ox, b.oz, lampRelDx, lampRelDz)
        );
}

function computeSettlementWorkChunkBounds(job) {
    const margin = 8;
    let minWx = job.centerX - job.pathRadius - margin;
    let maxWx = job.centerX + job.pathRadius + margin;
    let minWz = job.centerZ - job.pathRadius - margin;
    let maxWz = job.centerZ + job.pathRadius + margin;

    for (const cell of job.pathCells ?? []) {
        const wx = job.centerX + cell.dx;
        const wz = job.centerZ + cell.dz;
        if (wx < minWx) minWx = wx;
        if (wx > maxWx) maxWx = wx;
        if (wz < minWz) minWz = wz;
        if (wz > maxWz) maxWz = wz;
    }

    for (const slot of job.structures ?? []) {
        const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
        const ox = job.centerX + slot.ox;
        const oz = job.centerZ + slot.oz;
        minWx = Math.min(minWx, ox - 4);
        maxWx = Math.max(maxWx, ox + fp.w + 4);
        minWz = Math.min(minWz, oz - 4);
        maxWz = Math.max(maxWz, oz + fp.d + 4);
    }

    for (const bunker of job.bunkers ?? []) {
        const wx = job.centerX + bunker.ox;
        const wz = job.centerZ + bunker.oz;
        minWx = Math.min(minWx, wx - 6);
        maxWx = Math.max(maxWx, wx + 6);
        minWz = Math.min(minWz, wz - 6);
        maxWz = Math.max(maxWz, wz + 6);
    }

    if (job.lampWorldX != null && job.lampWorldZ != null) {
        minWx = Math.min(minWx, job.lampWorldX - 16);
        maxWx = Math.max(maxWx, job.lampWorldX + 16);
        minWz = Math.min(minWz, job.lampWorldZ - 16);
        maxWz = Math.max(maxWz, job.lampWorldZ + 16);
    }

    return {
        minCx: Math.floor(minWx / 16),
        maxCx: Math.floor(maxWx / 16),
        minCz: Math.floor(minWz / 16),
        maxCz: Math.floor(maxWz / 16)
    };
}

/**
 * Chebyshev blocks from nearest player — only these chunks must be loaded (sim distance).
 * @param {BuildJob} job
 */
function settlementChunkSimCheckDistBlocks(job) {
    return Math.min(SETTLEMENT_CHUNK_SIM_CHECK_DIST, (job.pathRadius ?? 20) + 48);
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} simDistBlocks
 */
function settlementChunkIsInPlayerSimRange(cx, cz, playerX, playerZ, simDistBlocks) {
    const wx = cx * 16 + 8;
    const wz = cz * 16 + 8;
    return Math.max(Math.abs(wx - playerX), Math.abs(wz - playerZ)) <= simDistBlocks;
}

/**
 * @param {BuildJob} job
 * @returns {{ x: number, z: number }|undefined}
 */
function nearestPlayerLocationToSettlement(job) {
    const dimId = job.dimension?.id;
    if (!dimId) return undefined;
    let best = Infinity;
    /** @type {{ x: number, z: number }|undefined} */
    let bestLoc;
    for (const player of world.getAllPlayers()) {
        if (!player?.isValid) continue;
        try {
            if (player.dimension?.id !== dimId) continue;
            const loc = player.location;
            const dCenter = Math.max(Math.abs(loc.x - job.centerX), Math.abs(loc.z - job.centerZ));
            let d = dCenter;
            if (job.lampWorldX != null && job.lampWorldZ != null) {
                const dLamp = Math.max(
                    Math.abs(loc.x - job.lampWorldX),
                    Math.abs(loc.z - job.lampWorldZ)
                );
                d = Math.min(dCenter, dLamp);
            }
            if (d < best) {
                best = d;
                bestLoc = { x: loc.x, z: loc.z };
            }
        } catch {
            /* ignore */
        }
    }
    return bestLoc;
}

/**
 * @param {BuildJob} job
 */
function isPlayerInSettlementBuildBand(job) {
    const dist = nearestPlayerDistToSettlement(job);
    return Number.isFinite(dist) && dist <= SETTLEMENT_BUILD_PAUSE_DIST;
}

/**
 * Chunks near the nearest player that overlap this job (not the full large-tier footprint).
 * While you are in the village band, chunk checks are skipped so construction never stalls at the lamp.
 * @param {BuildJob} job
 * @returns {boolean}
 */
function areAllSettlementWorkChunksLoaded(job) {
    if (isPlayerInSettlementBuildBand(job)) return true;
    const dim = job.dimension;
    if (!dim) return false;
    const player = nearestPlayerLocationToSettlement(job);
    if (!player) return false;
    const hintY = job.y;
    const simDist = settlementChunkSimCheckDistBlocks(job);
    const b = job.workChunkBounds ?? computeSettlementWorkChunkBounds(job);
    for (let cx = b.minCx; cx <= b.maxCx; cx++) {
        for (let cz = b.minCz; cz <= b.maxCz; cz++) {
            if (!settlementChunkIsInPlayerSimRange(cx, cz, player.x, player.z, simDist)) continue;
            if (!isSettlementChunkLoaded(dim, cx, cz, hintY)) return false;
        }
    }
    return true;
}

/**
 * @param {BuildJob} job
 * @returns {{ total: number, missing: string[], missingCount: number, simDistBlocks: number }}
 */
function summarizeMissingSettlementWorkChunks(job) {
    const dim = job.dimension;
    const b = job.workChunkBounds ?? computeSettlementWorkChunkBounds(job);
    const simDistBlocks = settlementChunkSimCheckDistBlocks(job);
    const player = nearestPlayerLocationToSettlement(job);
    /** @type {string[]} */
    const missing = [];
    let missingCount = 0;
    let total = 0;
    if (!dim) {
        return { total: 1, missing: ["no-dimension"], missingCount: 1, simDistBlocks };
    }
    if (!player) {
        return { total: 1, missing: ["no-players"], missingCount: 1, simDistBlocks };
    }
    const hintY = job.y;
    for (let cx = b.minCx; cx <= b.maxCx; cx++) {
        for (let cz = b.minCz; cz <= b.maxCz; cz++) {
            if (!settlementChunkIsInPlayerSimRange(cx, cz, player.x, player.z, simDistBlocks)) continue;
            total++;
            if (isSettlementChunkLoaded(dim, cx, cz, hintY)) continue;
            missingCount++;
            if (missing.length < 6) missing.push(`${cx},${cz}`);
        }
    }
    return { total, missing, missingCount, simDistBlocks };
}

/**
 * @param {BuildJob} job
 * @param {boolean} pausing
 */
function logSettlementChunkPause(job, pausing) {
    if (pausing) {
        if (job.lastLoggedChunkPause === true) return;
        job.lastLoggedChunkPause = true;
        const { total, missing, missingCount, simDistBlocks } = summarizeMissingSettlementWorkChunks(job);
        const site =
            job.siteGx != null
                ? ` site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
                : "";
        avLogBuildLine(
            `Build PAUSED (${missingCount}/${total} chunks unloaded within ${simDistBlocks}ch of player — sim distance?) e.g. ${missing.join(" ")} phase=${job.phase} edits=${job.totalEdits ?? 0}${site}`
        );
        return;
    }
    if (job.lastLoggedChunkPause !== true) return;
    job.lastLoggedChunkPause = false;
    avLogBuildLine(
        `Build RESUMED (chunks loaded near player) phase=${job.phase} edits=${job.totalEdits ?? 0} site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
    );
}

function structureFootprintIsBuildable(dimension, originX, originZ, w, d, hintY) {
    let supported = 0;
    const total = w * d;
    for (let lx = 0; lx < w; lx++) {
        for (let lz = 0; lz < d; lz++) {
            if (columnSupportsStructureFooting(dimension, originX + lx, originZ + lz, hintY)) {
                supported++;
            }
        }
    }
    if (supported / total < 0.45) return false;
    const midX = originX + Math.floor(w / 2);
    const midZ = originZ + Math.floor(d / 2);
    return columnSupportsStructureFooting(dimension, midX, midZ, hintY);
}

/** @typedef {"house"|"smithy"|"farm"|"market"|"church"|"pen"|"twoStory"|"ladderTest"|"gableHouse"|"roofDeckTest"|"courtyardHouse"|"cellarHouse"|"lWingHouse"|"dogtrotHouse"|"desertRiad"|"jungleStilt"|"taigaLonghouse"|"infectedSpire"|"townHall"|"cathedral"|"bakery"|"schoolhouse"|"tradingPost"|"greenhouse"} ForceStructureKind */

/** @typedef {{ housePlan?: number, forceLookout?: boolean, churchRoll?: number, ruleset?: import("./mb_settlementStructures.js").SettlementRuleset }} ForceStructureSlotOpts */

/**
 * Map dev force kind → structure type + optional house plan index.
 * @param {ForceStructureKind|string} kind
 * @param {number} cx
 * @param {number} cz
 * @param {ForceStructureSlotOpts} [opts]
 */
function resolveForceStructureMapping(kind, cx, cz, opts = {}) {
    const ruleset = opts.ruleset ?? "plains";
    if (kind === "pen") {
        return { structureKind: "pen", housePlan: undefined, churchRoll: undefined, forceLookout: false };
    }
    let structureKind = kind;
    let housePlan =
        kind === "house"
            ? opts.housePlan ?? pickHouseVariantIndex(ruleset, cx, cz, 600)
            : undefined;
    if (kind === "twoStory") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 12;
    }
    if (kind === "courtyardHouse") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 15;
    }
    if (kind === "cellarHouse") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 49;
    }
    if (kind === "lWingHouse") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 11;
    }
    if (kind === "dogtrotHouse") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 32;
    }
    if (kind === "desertRiad") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 52;
    }
    if (kind === "jungleStilt") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 57;
    }
    if (kind === "taigaLonghouse") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 61;
    }
    if (kind === "infectedSpire") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 67;
    }
    if (kind === "cathedral") {
        structureKind = "church";
        housePlan = undefined;
    }
    if (kind === "townHall") structureKind = "town_hall";
    if (kind === "bakery") structureKind = "bakery";
    if (kind === "schoolhouse") structureKind = "schoolhouse";
    if (kind === "tradingPost") structureKind = "trading_post";
    if (kind === "greenhouse") structureKind = "greenhouse_ruin";
    if (kind === "ladderTest") {
        structureKind = "librarian";
        housePlan = undefined;
    }
    if (kind === "gableHouse") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 14;
    }
    if (kind === "roofDeckTest") {
        structureKind = "house";
        housePlan = opts.housePlan ?? 6;
    }
    if (kind === "librarian" || kind === "butcher" || kind === "market") {
        structureKind = kind;
        housePlan = undefined;
    }
    if (structureKind === "house" && opts.housePlan != null) {
        housePlan = opts.housePlan;
    }
    return {
        structureKind,
        housePlan,
        churchRoll: kind === "cathedral" ? opts.churchRoll ?? 4 : undefined,
        forceLookout: kind === "roofDeckTest" || opts.forceLookout === true
    };
}

/**
 * One structure slot centered on force-place origin (relative ox/oz).
 * @param {number} cx
 * @param {number} cz
 * @param {ForceStructureKind|string} kind
 * @param {ForceStructureSlotOpts} [opts]
 * @returns {StructureSlot}
 */
export function buildForceStructureSlot(cx, cz, kind, opts = {}) {
    const ruleset = opts.ruleset ?? "plains";
    const { structureKind, housePlan, churchRoll, forceLookout } = resolveForceStructureMapping(
        kind,
        cx,
        cz,
        opts
    );
    const { w, d } = footprintForStructure(structureKind, housePlan, ruleset);
    const ox = -Math.floor(w / 2);
    const oz = -Math.floor(d / 2);
    return {
        type: structureKind,
        ox,
        oz,
        door: doorFacingPlaza(ox, oz, w, d),
        ...(housePlan !== undefined ? { housePlan } : {}),
        ...(churchRoll !== undefined ? { churchRoll } : {}),
        ...(forceLookout ? { forceLookout: true } : {})
    };
}

/**
 * One structure centered on force-place origin (relative ox/oz).
 * @param {number} cx
 * @param {number} cz
 * @param {ForceStructureKind|string} kind
 * @param {ForceStructureSlotOpts} [opts]
 */
export function layoutForceStructure(cx, cz, kind, opts = {}) {
    if (kind === "pen") {
        return {
            structures: [],
            animalPen: { ox: -2, oz: -2, gateFace: 0 }
        };
    }
    return {
        structures: [buildForceStructureSlot(cx, cz, kind, opts)],
        animalPen: undefined
    };
}

const FORCE_COMPARE_GAP_BLOCKS = 5;

/**
 * Chosen building (west) + random house plan (east) for dev comparison rows.
 * @param {number} cx
 * @param {number} cz
 * @param {ForceStructureKind|string} kind
 * @param {ForceStructureSlotOpts} [opts]
 */
export function layoutForceStructureComparePair(cx, cz, kind, opts = {}) {
    if (kind === "pen") {
        return layoutForceStructure(cx, cz, kind, opts);
    }
    const ruleset = opts.ruleset ?? "plains";
    const slotA = buildForceStructureSlot(cx, cz, kind, opts);
    const fpA = footprintForStructure(slotA.type, slotA.housePlan, ruleset);
    let randomPlan = pickHouseVariantIndex(ruleset, cx, cz, 701 + (slotA.housePlan ?? 0));
    if (slotA.housePlan !== undefined && randomPlan === slotA.housePlan) {
        randomPlan = (randomPlan + 13) % HOUSE_VARIANT_COUNT;
    }
    const slotB = buildForceStructureSlot(cx, cz, "house", { ruleset, housePlan: randomPlan });
    const fpB = footprintForStructure(slotB.type, slotB.housePlan, ruleset);
    slotB.ox = slotA.ox + fpA.w + FORCE_COMPARE_GAP_BLOCKS;
    slotB.oz = slotA.oz + Math.floor((fpA.d - fpB.d) / 2);
    slotB.door = doorFacingPlaza(slotB.ox, slotB.oz, fpB.w, fpB.d);
    return { structures: [slotA, slotB], animalPen: undefined };
}

/**
 * @param {number} i
 * @param {number} count
 * @param {SettlementTier} tier
 * @param {number} cx
 * @param {number} cz
 * @returns {StructureKind}
 */
function structureTypeForIndex(i, count, tier, cx, cz) {
    return structureKindForSlot(tier, i, count, cx, cz);
}

/**
 * @param {StructureSlot[]} slots
 * @param {number} ox
 * @param {number} oz
 */
function penOverlapsSettlement(slots, ox, oz) {
    if (structureOverlapsCenterPlaza(ox, oz, ANIMAL_PEN_W, ANIMAL_PEN_D)) return true;
    for (const s of slots) {
        const fp = footprintForStructure(s.type, s.housePlan);
        if (structureFootprintsOverlap(ox, oz, ANIMAL_PEN_W, ANIMAL_PEN_D, s.ox, s.oz, fp.w, fp.d)) {
            return true;
        }
    }
    return false;
}

/**
 * @param {{ ox: number, oz: number, gateFace: number }} pen
 * @returns {{ dx: number, dz: number }}
 */
function animalPenGatePathTarget(pen) {
    const midX = Math.floor(ANIMAL_PEN_W / 2);
    const midZ = Math.floor(ANIMAL_PEN_D / 2);
    if (pen.gateFace === 0) return { dx: pen.ox + midX, dz: pen.oz - 1 };
    if (pen.gateFace === 2) return { dx: pen.ox + midX, dz: pen.oz + ANIMAL_PEN_D };
    if (pen.gateFace === 1) return { dx: pen.ox + ANIMAL_PEN_W, dz: pen.oz + midZ };
    return { dx: pen.ox - 1, dz: pen.oz + midZ };
}

/**
 * Fence pen beside the farm (village / large).
 * @param {StructureSlot[]} structures
 * @param {number} cx
 * @param {number} cz
 * @returns {{ ox: number, oz: number, gateFace: number }|undefined}
 */
function findAnimalPenPlacement(structures, cx, cz) {
    const farm = structures.find((s) => s.type === "farm" || s.type === "farmer");
    if (!farm) return undefined;
    const farmFp = footprintForStructure(farm?.type ?? "farmer");
    /** @type {{ ox: number, oz: number, gateFace: number }[]} */
    const candidates = [
        { ox: farm.ox + farmFp.w + 1, oz: farm.oz + 1, gateFace: 3 },
        { ox: farm.ox - ANIMAL_PEN_W - 1, oz: farm.oz + 1, gateFace: 1 },
        { ox: farm.ox + 1, oz: farm.oz + farmFp.d + 1, gateFace: 0 },
        { ox: farm.ox + 1, oz: farm.oz - ANIMAL_PEN_D - 1, gateFace: 2 }
    ];
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[(i + hashChunkRoll(cx, cz, 701, candidates.length)) % candidates.length];
        if (!penOverlapsSettlement(structures, c.ox, c.oz)) return c;
    }
    return undefined;
}

/**
 * @param {number} ox
 * @param {number} oz
 * @param {number} w
 * @param {number} d
 * @param {number} bx
 * @param {number} bz
 * @param {number} bw
 * @param {number} bd
 * @param {number} [gap]
 */
function structureFootprintsOverlap(ox, oz, w, d, bx, bz, bw, bd, gap = MIN_STRUCTURE_GAP) {
    return !(
        ox + w + gap <= bx ||
        bx + bw + gap <= ox ||
        oz + d + gap <= bz ||
        bz + bd + gap <= oz
    );
}

/**
 * @param {number} ox
 * @param {number} oz
 * @param {number} w
 * @param {number} d
 */
function structureOverlapsCenterPlaza(ox, oz, w, d) {
    const half = STRUCTURE_CENTER_EXCLUSION;
    return !(
        ox >= half ||
        oz >= half ||
        ox + w <= -half ||
        oz + d <= -half
    );
}

/**
 * @param {number} ox structure origin relative to village center
 * @param {number} oz
 * @param {number} w
 * @param {number} d
 * @param {number} lampRelDx lamp world X minus center X
 * @param {number} lampRelDz
 */
function structureOverlapsLampMarker(ox, oz, w, d, lampRelDx, lampRelDz) {
    const pad = LAMP_STRUCTURE_EXCLUSION;
    const lx0 = lampRelDx - pad;
    const lz0 = lampRelDz - pad;
    const lx1 = lampRelDx + pad;
    const lz1 = lampRelDz + pad;
    return !(ox + w < lx0 || ox > lx1 || oz + d < lz0 || oz > lz1);
}

/**
 * @param {StructureSlot[]} slots
 * @param {number} ox
 * @param {number} oz
 * @param {StructureKind} type
 * @param {number} lampRelDx
 * @param {number} lampRelDz
 */
function structureOverlapsPlaced(slots, ox, oz, type, housePlan, ruleset, lampRelDx, lampRelDz) {
    const { w, d } = footprintForStructure(type, housePlan, ruleset);
    if (structureOverlapsCenterPlaza(ox, oz, w, d)) return true;
    if (structureOverlapsLampMarker(ox, oz, w, d, lampRelDx, lampRelDz)) return true;
    for (const existing of slots) {
        const other = footprintForStructure(existing.type, existing.housePlan, ruleset);
        if (structureFootprintsOverlap(ox, oz, w, d, existing.ox, existing.oz, other.w, other.d)) {
            return true;
        }
    }
    return false;
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {SettlementTier} tier
 * @returns {StructureSlot[]}
 */
function layoutStructures(cx, cz, tier, ruleset, lampRelDx, lampRelDz) {
    /** @type {StructureSlot[]} */
    const slots = [];
    const count = tier === "hamlet" ? 5 : tier === "village" ? 9 : 14;
    const spread = tier === "hamlet" ? 14 : tier === "village" ? 24 : 30;
    const minRing = tier === "hamlet" ? 11 : tier === "village" ? 15 : 18;
    const layoutVariant = pickSettlementLayoutVariant(cx, cz);

    for (let i = 0; i < count; i++) {
        const type = structureTypeForIndex(i, count, tier, cx, cz);
        const housePlan = type === "house" ? pickHouseVariantIndex(ruleset, cx, cz, 600 + i * 13) : undefined;
        const { w, d } = footprintForStructure(type, housePlan, ruleset);
        let placed = false;

        for (let attempt = 0; attempt < 28 && !placed; attempt++) {
            const salt = 50 + i * 37 + attempt * 19;
            const { ox, oz } = settlementLayoutOffset(
                layoutVariant,
                i,
                count,
                cx,
                cz,
                salt,
                minRing,
                spread
            );
            if (structureOverlapsPlaced(slots, ox, oz, type, housePlan, ruleset, lampRelDx, lampRelDz)) {
                continue;
            }
            const door = doorFacingPlaza(ox, oz, w, d);
            slots.push({ type, ox, oz, door, housePlan });
            placed = true;
        }

        if (placed) continue;

        const ringDist = minRing + Math.floor(spread * 0.55);
        for (let ringTry = 0; ringTry < count * 4 && !placed; ringTry++) {
            const slotAngle = (2 * Math.PI * (i + ringTry * 0.17)) / count;
            const jitter = ((hashChunkRoll(cx, cz, 900 + i * 11 + ringTry, 100) - 50) / 100) * 0.35;
            const angle = slotAngle + jitter;
            const ox = Math.floor(Math.cos(angle) * ringDist);
            const oz = Math.floor(Math.sin(angle) * ringDist);
            if (structureOverlapsPlaced(slots, ox, oz, type, housePlan, ruleset, lampRelDx, lampRelDz)) {
                continue;
            }
            const door = doorFacingPlaza(ox, oz, w, d);
            slots.push({ type, ox, oz, door, housePlan });
            placed = true;
        }

        if (!placed && slots.length > 0) {
            const last = slots[slots.length - 1];
            const other = footprintForStructure(last.type, last.housePlan, ruleset);
            const ox = last.ox + other.w + MIN_STRUCTURE_GAP + 1;
            const oz = last.oz;
            if (!structureOverlapsPlaced(slots, ox, oz, type, housePlan, ruleset, lampRelDx, lampRelDz)) {
                slots.push({ type, ox, oz, door: doorFacingPlaza(ox, oz, w, d), housePlan });
            }
        }
    }

    return slots;
}

/** Horizontal dig size and headroom below the trapdoor hatch. */
const BUNKER_FOOTPRINT = 3;
const BUNKER_HEADROOM = 2;

/**
 * @typedef {{ ox: number, oz: number, ruined?: boolean, lightMode?: "none"|"lantern"|"torch"|"both" }} BunkerSite
 */

/** ~1/5 of hide bunkers spawn collapsed / looted. */
const BUNKER_RUINED_DENOMINATOR = 5;

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} ox
 * @param {number} oz
 * @param {number} salt
 * @returns {BunkerSite}
 */
function assignBunkerSiteTraits(cx, cz, ox, oz, salt) {
    const ruined = hashChunkRoll(cx, cz, ox * 41 + oz * 67 + salt + 5200, BUNKER_RUINED_DENOMINATOR) === 0;
    if (ruined) return { ox, oz, ruined: true };
    const lightRoll = hashChunkRoll(cx, cz, ox * 31 + oz * 53 + salt + 5300, 100);
    /** @type {BunkerSite["lightMode"]} */
    let lightMode = "none";
    if (lightRoll >= 25 && lightRoll < 50) lightMode = "lantern";
    else if (lightRoll >= 50 && lightRoll < 75) lightMode = "torch";
    else if (lightRoll >= 75) lightMode = "both";
    return { ox, oz, ruined: false, lightMode };
}

/**
 * @param {number} ox
 * @param {number} oz
 * @param {StructureSlot[]} structures
 * @param {SettlementRuleset} ruleset
 * @param {number} lampRelDx
 * @param {number} lampRelDz
 */
function bunkerSiteOverlapsSettlement(ox, oz, structures, ruleset, lampRelDx, lampRelDz) {
    const shellOx = ox - 1;
    const shellOz = oz - 1;
    const shellW = BUNKER_FOOTPRINT + 2;
    const shellD = BUNKER_FOOTPRINT + 2;
    const overhangMargin = 2;
    if (structureOverlapsCenterPlaza(shellOx, shellOz, shellW, shellD)) return true;
    if (structureOverlapsLampMarker(shellOx, shellOz, shellW, shellD, lampRelDx, lampRelDz)) return true;
    for (const existing of structures) {
        const other = footprintForStructure(existing.type, existing.housePlan, ruleset);
        if (
            structureFootprintsOverlap(
                shellOx,
                shellOz,
                shellW,
                shellD,
                existing.ox,
                existing.oz,
                other.w,
                other.d,
                overhangMargin
            )
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Emergency hide holes on settlement paths (trapdoor flush with path, chest below).
 * @param {number} cx
 * @param {number} cz
 * @param {SettlementTier} tier
 * @param {PathCell[]} pathCells
 * @param {StructureSlot[]} structures
 * @param {number} lampRelDx
 * @param {number} lampRelDz
 * @param {SettlementRuleset} ruleset
 * @returns {BunkerSite[]}
 */
function layoutBunkerSites(cx, cz, tier, pathCells, structures, lampRelDx, lampRelDz, ruleset) {
    const count = tier === "hamlet" ? 2 : tier === "village" ? 3 : 5;
    /** @type {Map<string, { ox: number, oz: number, score: number }>} */
    const candidateMap = new Map();

    for (const cell of pathCells) {
        const { dx, dz } = cell;
        if (pathCellOverlapsLampMarker(lampRelDx, lampRelDz, dx, dz)) continue;
        const ox = dx - 1;
        const oz = dz - 1;
        const key = `${ox},${oz}`;
        if (candidateMap.has(key)) continue;
        if (bunkerSiteOverlapsSettlement(ox, oz, structures, ruleset, lampRelDx, lampRelDz)) continue;
        const score = hashChunkRoll(cx, cz, dx * 19 + dz * 37 + 3100, 10000);
        candidateMap.set(key, { ox, oz, score });
    }

    /** @type {{ ox: number, oz: number, score: number }[]} */
    const candidates = [...candidateMap.values()].sort((a, b) => a.score - b.score);

    /** @type {BunkerSite[]} */
    const bunkers = [];
    for (const c of candidates) {
        if (bunkers.length >= count) break;
        if (bunkers.some((b) => Math.abs(b.ox - c.ox) < 6 && Math.abs(b.oz - c.oz) < 6)) continue;
        bunkers.push(assignBunkerSiteTraits(cx, cz, c.ox, c.oz, bunkers.length * 17));
    }

    if (bunkers.length >= count) return bunkers;

    const minDist = 6;
    const maxDist = tier === "hamlet" ? 12 : tier === "village" ? 16 : 22;
    for (let attempt = 0; attempt < 48 && bunkers.length < count; attempt++) {
        const salt = 4100 + attempt * 23;
        const angle = (hashChunkRoll(cx, cz, salt, 360) / 360) * Math.PI * 2;
        const dist = minDist + hashChunkRoll(cx, cz, salt + 1, Math.max(1, maxDist - minDist));
        const ox = Math.round(Math.cos(angle) * dist) - 1;
        const oz = Math.round(Math.sin(angle) * dist) - 1;
        if (bunkerSiteOverlapsSettlement(ox, oz, structures, ruleset, lampRelDx, lampRelDz)) continue;
        if (bunkers.some((b) => Math.abs(b.ox - ox) < 6 && Math.abs(b.oz - oz) < 6)) continue;
        bunkers.push(assignBunkerSiteTraits(cx, cz, ox, oz, salt));
    }
    return bunkers;
}

/**
 * Cobblestone shell for most rulesets; desert uses sandstone via {@link RUIN_MATERIALS_BY_RULESET}.
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function hideBunkerShellWallId(mat) {
    return mat.wall;
}

/**
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {BunkerSite} site
 * @param {number} sy
 */
function applyHideBunkerInteriorFinish(job, dimension, mat, site, sy) {
    if (site.ruined) {
        const ox = job.centerX + site.ox;
        const oz = job.centerZ + site.oz;
        const floorY = sy - BUNKER_HEADROOM - 1;
        for (let dlx = 0; dlx < BUNKER_FOOTPRINT; dlx++) {
            for (let dlz = 0; dlz < BUNKER_FOOTPRINT; dlz++) {
                const roll = hashChunkRoll(job.centerX, job.centerZ, site.ox * 13 + site.oz * 19 + dlx * 7 + dlz * 11, 100);
                if (roll >= 28) continue;
                const wx = ox + dlx;
                const wz = oz + dlz;
                const cy = floorY + 1 + (roll % BUNKER_HEADROOM);
                trySetBlock(dimension, wx, cy, wz, "minecraft:cobweb", SETTLEMENT_REPLACE_ANY);
            }
        }
        return;
    }
    if (!site.lightMode || site.lightMode === "none") return;
    const ox = job.centerX + site.ox;
    const oz = job.centerZ + site.oz;
    const ly = sy - 1;
    if (site.lightMode === "lantern" || site.lightMode === "both") {
        trySetBlock(dimension, ox + 2, ly, oz + 1, "minecraft:lantern", SETTLEMENT_REPLACE_ANY);
    }
    if (site.lightMode === "torch" || site.lightMode === "both") {
        trySetBlock(dimension, ox, ly, oz + 2, "minecraft:torch", SETTLEMENT_REPLACE_ANY);
    }
}

/**
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {BunkerSite} site
 */
function enqueueHideBunkerFinish(job, dimension, mat, site) {
    const trapWx = job.centerX + site.ox + 1;
    const trapWz = job.centerZ + site.oz + 1;
    const sy = cachedFloorY(job.floorYCache, dimension, trapWx, trapWz, mat.log, job.y);
    /** @type {Array<{ kind: "wall", x: number, y: number, z: number, id: string }>} */
    const queue = [];
    if (sy === undefined) {
        job.bunkerFinishQueue = queue;
        return;
    }
    const wallId = hideBunkerShellWallId(mat);
    const floorY = sy - BUNKER_HEADROOM - 1;
    for (let dlx = -1; dlx <= BUNKER_FOOTPRINT; dlx++) {
        for (let dlz = -1; dlz <= BUNKER_FOOTPRINT; dlz++) {
            if (dlx >= 0 && dlx < BUNKER_FOOTPRINT && dlz >= 0 && dlz < BUNKER_FOOTPRINT) continue;
            const wx = job.centerX + site.ox + dlx;
            const wz = job.centerZ + site.oz + dlz;
            for (let y = floorY; y <= sy; y++) {
                if (
                    site.ruined &&
                    hashChunkRoll(job.centerX, job.centerZ, wx * 17 + wz * 23 + y * 3 + site.ox, 100) < 38
                ) {
                    continue;
                }
                queue.push({ kind: "wall", x: wx, y, z: wz, id: wallId });
            }
        }
    }
    job.bunkerFinishQueue = queue;
    job.bunkerFinishSy = sy;
}

/**
 * Ladders + trapdoor hatch deferred until after ruin processor (structure build must not overwrite them).
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {BunkerSite} site
 * @returns {SettlementLadderColumnPayload|undefined}
 */
function captureHideBunkerLadderPayload(job, dimension, mat, site) {
    if (
        site.ruined &&
        hashChunkRoll(job.centerX, job.centerZ, site.ox * 19 + site.oz * 29 + 5400, 100) >= 42
    ) {
        return undefined;
    }
    const ox = job.centerX + site.ox;
    const oz = job.centerZ + site.oz;
    const trapWx = ox + 1;
    const trapWz = oz + 1;
    const sy = cachedFloorY(job.floorYCache, dimension, trapWx, trapWz, mat.log, job.y);
    if (sy === undefined) return undefined;
    const floorY = sy - BUNKER_HEADROOM - 1;
    const ladderX = ox + 2;
    const ladderZ = oz + 2;
    return {
        dimensionId: dimension.id,
        ruleset: job.ruleset,
        originX: ox,
        originZ: oz,
        accessLx: 2,
        accessLz: 2,
        ladderFootLx: 2,
        ladderFootLz: 2,
        wx: ladderX,
        wz: ladderZ,
        backWx: ladderX + 1,
        backWz: ladderZ,
        baseSy: floorY + 1,
        ladderTopDy: BUNKER_HEADROOM - 1,
        wallH: 0,
        basementShaft: true,
        hideBunkerShaft: true,
        ladderFace: LADDER_FACING.east,
        trapdoorY: sy,
        trapdoorWx: trapWx,
        trapdoorWz: trapWz
    };
}

/**
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @returns {number}
 */
function tickHideBunkerFinishQueue(job, dimension, mat) {
    const queue = job.bunkerFinishQueue;
    if (!queue?.length) return 0;
    const item = queue.shift();
    if (!item) return 0;
    if (trySetBlock(dimension, item.x, item.y, item.z, item.id, SETTLEMENT_REPLACE_ANY)) {
        job.totalEdits++;
    }
    if (queue.length === 0) delete job.bunkerFinishQueue;
    return 1;
}

/**
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} budget
 * @returns {number}
 */
function tickSettlementBunkers(job, dimension, mat, budget) {
    const bunkers = job.bunkers ?? [];
    if (bunkers.length === 0) return 0;
    /** @type {Set<string>} */
    const pathSet = new Set((job.pathCells ?? []).map((c) => `${c.dx},${c.dz}`));
    let spent = 0;
    const cellTotal = BUNKER_FOOTPRINT * BUNKER_FOOTPRINT;
    while (spent < budget && (job.bunkerIndex ?? 0) < bunkers.length) {
        const site = bunkers[job.bunkerIndex ?? 0];
        if (job.bunkerFinishQueue?.length) {
            spent += tickHideBunkerFinishQueue(job, dimension, mat);
            if (!job.bunkerFinishQueue?.length) {
                const sy = job.bunkerFinishSy;
                if (sy !== undefined) applyHideBunkerInteriorFinish(job, dimension, mat, site, sy);
                delete job.bunkerFinishSy;
                const payload = captureHideBunkerLadderPayload(job, dimension, mat, site);
                if (payload) {
                    if (!job.pendingLadderColumns) job.pendingLadderColumns = [];
                    job.pendingLadderColumns.push(payload);
                }
                job.bunkerIndex = (job.bunkerIndex ?? 0) + 1;
                job.bunkerCellIndex = 0;
            }
            continue;
        }
        const cellIdx = job.bunkerCellIndex ?? 0;
        if (cellIdx >= cellTotal) {
            enqueueHideBunkerFinish(job, dimension, mat, site);
            if (!job.bunkerFinishQueue?.length) {
                const sy = job.bunkerFinishSy;
                if (sy !== undefined) applyHideBunkerInteriorFinish(job, dimension, mat, site, sy);
                delete job.bunkerFinishSy;
                const payload = captureHideBunkerLadderPayload(job, dimension, mat, site);
                if (payload) {
                    if (!job.pendingLadderColumns) job.pendingLadderColumns = [];
                    job.pendingLadderColumns.push(payload);
                }
                job.bunkerIndex = (job.bunkerIndex ?? 0) + 1;
                job.bunkerCellIndex = 0;
            }
            continue;
        }
        const dlx = cellIdx % BUNKER_FOOTPRINT;
        const dlz = Math.floor(cellIdx / BUNKER_FOOTPRINT);
        job.bunkerCellIndex = cellIdx + 1;
        spent++;
        const wx = job.centerX + site.ox + dlx;
        const wz = job.centerZ + site.oz + dlz;
        const relDx = wx - job.centerX;
        const relDz = wz - job.centerZ;
        const onPath = pathSet.has(`${relDx},${relDz}`);
        const sy = cachedFloorY(job.floorYCache, dimension, wx, wz, mat.log, job.y);
        if (sy === undefined) continue;
        const isTrap = dlx === 1 && dlz === 1;
        const isChest = dlx === 0 && dlz === 0;
        const capId = onPath
            ? pickSettlementPathBlock(mat, job.ruleset, wx, wz, relDx * 13 + relDz * 29 + 89)
            : cellarSurfaceCapId(job.ruleset, mat);
        let placed = 0;
        const skipFloor =
            site.ruined &&
            hashChunkRoll(job.centerX, job.centerZ, site.ox * 7 + site.oz * 11 + cellIdx, 100) < 32;
        if (
            !skipFloor &&
            trySetBlock(dimension, wx, sy - BUNKER_HEADROOM - 1, wz, mat.plank, SETTLEMENT_REPLACE_ANY)
        ) {
            placed++;
        }
        for (let dy = 1; dy <= BUNKER_HEADROOM; dy++) {
            if (trySetBlock(dimension, wx, sy - dy, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) placed++;
        }
        if (isTrap) {
            const placeTrap =
                !site.ruined ||
                hashChunkRoll(job.centerX, job.centerZ, site.ox * 3 + site.oz * 5 + 5500, 100) < 52;
            if (placeTrap && trySetBlock(dimension, wx, sy, wz, settlementTrapdoorId(mat), SETTLEMENT_REPLACE_ANY)) {
                placed++;
            } else if (trySetBlock(dimension, wx, sy, wz, capId, SETTLEMENT_REPLACE_ANY)) {
                placed++;
            }
        } else if (trySetBlock(dimension, wx, sy, wz, capId, SETTLEMENT_REPLACE_ANY)) {
            placed++;
        }
        if (isChest) {
            const placeChest =
                !site.ruined ||
                hashChunkRoll(job.centerX, job.centerZ, site.ox * 11 + site.oz * 13 + 5600, 100) < 44;
            if (placeChest && trySetBlock(dimension, wx, sy - 2, wz, "minecraft:chest", SETTLEMENT_REPLACE_ANY)) {
                placed++;
                fillVillageStorageAt(
                    dimension,
                    wx,
                    sy - 2,
                    wz,
                    site.ruined ? VILLAGE_LOOT.hide_bunker_ruined : VILLAGE_LOOT.hide_bunker,
                    "minecraft:chest",
                    job.ruleset
                );
            }
        }
        if (placed > 0) job.totalEdits += placed;
    }
    return spent;
}

/**
 * Only remove worldgen structure_block / jigsaw at the lamp — keep fence post + barrel.
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dim
 */
function clearLampWorldgenArtifactsOnly(job, dim) {
    const lx = job.lampWorldX ?? (job.lampRelDx !== undefined ? job.centerX + job.lampRelDx : undefined);
    const lz = job.lampWorldZ ?? (job.lampRelDz !== undefined ? job.centerZ + job.lampRelDz : undefined);
    if (lx === undefined || lz === undefined) return;
    const hintY = job.y;
    const n = clearLampColumnArtifacts(dim, lx, lz, hintY);
    const remain = countLampColumnArtifacts(dim, lx, lz, hintY);
    if (remain !== LAMP_ARTIFACT_COUNT_UNKNOWN) {
        job.lampArtifactDone = remain === 0;
    }
    if (n > 0) job.totalEdits += n;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} originX
 * @param {number} originZ
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} doorFace
 * @param {"house"|"smithy"|"farm"|"hall"} variant
 * @param {number} cx
 * @param {number} cz
 * @param {number} salt
 * @param {SettlementRuleset} ruleset
 */
function placeStructureStub(dimension, originX, originZ, mat, doorFace, variant, cx, cz, salt, ruleset) {
    const w = variant === "hall" ? 8 : variant === "farm" ? 7 : 6;
    const d = variant === "hall" ? 6 : 5;
    const wallH = variant === "hall" ? 4 : 3;
    let changed = 0;
    for (let lx = 0; lx < w; lx++) {
        for (let lz = 0; lz < d; lz++) {
            const wx = originX + lx;
            const wz = originZ + lz;
            const edge = lx === 0 || lx === w - 1 || lz === 0 || lz === d - 1;
            if (!edge) {
                if (hashChunkRoll(wx, wz, salt + 1, 100) < 80) {
                    if (trySetGround(dimension, wx, wz, mat.plank, SETTLEMENT_REPLACE_ANY, mat.log)) changed++;
                }
                continue;
            }
            if (trySetGround(dimension, wx, wz, pickSettlementWallBlock(mat, wx, wz, salt), SETTLEMENT_REPLACE_ANY, mat.log)) {
                changed++;
            }

            const isDoor =
                (doorFace === 0 && lz === 0 && lx === Math.floor(w / 2)) ||
                (doorFace === 2 && lz === d - 1 && lx === Math.floor(w / 2)) ||
                (doorFace === 1 && lx === w - 1 && lz === Math.floor(d / 2)) ||
                (doorFace === 3 && lx === 0 && lz === Math.floor(d / 2));

            const corner = (lx === 0 || lx === w - 1) && (lz === 0 || lz === d - 1);
            const baseY = resolveColumnFloorY(dimension, wx, wz, mat.log);
            if (baseY === undefined) continue;
            for (let h = 1; h <= wallH; h++) {
                if (isDoor && h <= 2) continue;
                const wallType = corner && h <= wallH ? mat.log : pickSettlementWallBlock(mat, wx, wz, salt + h);
                if (trySetBlock(dimension, wx, baseY + h - 1, wz, wallType, SETTLEMENT_REPLACE_ANY)) changed++;
                if (h === 2 && !isDoor && hashChunkRoll(wx, wz, salt + 2, 100) < 45) {
                    trySetBlock(
                        dimension,
                        wx,
                        baseY + h - 1,
                        wz,
                        "minecraft:brown_stained_glass_pane",
                        SETTLEMENT_REPLACE_ANY
                    );
                }
            }

            if (!isDoor) {
                placeRuinRoofCell(dimension, wx, wz, baseY, wallH, mat, salt, ruleset);
                changed++;
            }
        }
    }

    const cobCount = variant === "hall" ? 10 : 6;
    for (let i = 0; i < cobCount; i++) {
        const lx = 1 + (hashChunkRoll(cx, cz, salt + 10 + i, 100) % Math.max(1, w - 2));
        const lz = 1 + (hashChunkRoll(cx, cz, salt + 20 + i, 100) % Math.max(1, d - 2));
        changed += trySetColumnAir(dimension, originX + lx, originZ + lz, 2, "minecraft:web", mat.log);
    }

    const stubPlan = getWorkBuildingPlan(variant);
    if (stubPlan) {
        for (const spec of stubPlan.interior) {
            const sy = resolveColumnFloorY(dimension, originX + spec.lx, originZ + spec.lz, mat.log);
            if (sy === undefined) continue;
            if (trySetBlock(dimension, originX + spec.lx, sy, originZ + spec.lz, spec.id, SETTLEMENT_REPLACE_ANY)) {
                changed++;
            }
            const loot = resolveInteriorLootTable(spec, {
                structureKind: variant,
                workLootTable: lootTableForWorkKind(variant),
                ruleset: "plains"
            });
            if (loot && (spec.id === "minecraft:chest" || spec.id === "minecraft:barrel")) {
                fillVillageStorageAt(dimension, originX + spec.lx, sy, originZ + spec.lz, loot, spec.id, "plains");
            }
        }
    }

    if (variant === "farm" || variant === "farmer") {
        const stubCache = new Map();
        changed += placeRuinedVillageFarmland(
            dimension,
            originX,
            originZ,
            w,
            d,
            mat,
            salt,
            undefined,
            stubCache
        );
        const cx2 = originX + Math.floor(w / 2);
        const cz2 = originZ + Math.floor(d / 2);
        const fy = resolveColumnFloorY(dimension, cx2, cz2, mat.log);
        if (fy !== undefined) {
            if (trySetBlock(dimension, cx2, fy, cz2, "minecraft:composter", SETTLEMENT_REPLACE_ANY)) changed++;
            if (trySetBlock(dimension, cx2 + 1, fy, cz2, "minecraft:hay_block", SETTLEMENT_REPLACE_ANY)) changed++;
        }
    }

    if (variant === "hall") {
        const bx = originX + Math.floor(w / 2);
        const bz = originZ + Math.floor(d / 2);
        const by = resolveColumnFloorY(dimension, bx, bz, mat.log);
        if (by === undefined) return changed;
        if (trySetBlock(dimension, bx, by, bz, "minecraft:lectern", SETTLEMENT_REPLACE_ANY)) changed++;
    }

    return changed;
}

/**
 * @param {Map<string, number|undefined>} cache
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {string} poleId
 * @param {number} [hintY]
 * @returns {number|undefined}
 */
function cachedFloorY(cache, dimension, x, z, poleId, hintY) {
    const k = `${x},${z}`;
    if (cache.has(k)) return cache.get(k);
    const y = resolveColumnFloorY(dimension, x, z, poleId, hintY);
    cache.set(k, y);
    return y;
}

/**
 * Level platform Y when pad ran; otherwise per-column surface.
 * @param {StructureBuildState} st
 * @param {Map<string, number|undefined>} floorCache
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {string} poleId
 * @param {number} [hintY]
 */
function isWithinStructureFootprint(st, wx, wz) {
    const lx = wx - st.originX;
    const lz = wz - st.originZ;
    return lx >= 0 && lx < st.w && lz >= 0 && lz < st.d;
}

function structureSurfaceY(st, floorCache, dimension, wx, wz, poleId, hintY) {
    if (st.catalogExport && st.platformY !== undefined) return st.platformY;
    const k = `${wx},${wz}`;
    if (floorCache.has(k)) {
        const cached = floorCache.get(k);
        if (cached !== undefined) return cached;
    }
    if (st.platformY !== undefined && isWithinStructureFootprint(st, wx, wz)) {
        return st.platformY;
    }
    return cachedFloorY(floorCache, dimension, wx, wz, poleId, hintY);
}

/**
 * Level footprint to the highest column so walls/roofs share one floor (hills get dirt/cobble fill).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} originX
 * @param {number} originZ
 * @param {number} w
 * @param {number} d
 * @param {string} poleId
 * @param {number} [hintY]
 * @returns {number|undefined}
 */
function computeStructurePlatformY(dimension, originX, originZ, w, d, poleId, hintY, preferMin = false) {
    /** @type {number[]} */
    const ys = [];
    for (let lx = 0; lx < w; lx++) {
        for (let lz = 0; lz < d; lz++) {
            const y = resolveColumnFloorY(dimension, originX + lx, originZ + lz, poleId, hintY);
            if (y !== undefined) ys.push(y);
        }
    }
    if (ys.length === 0) return undefined;
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spread = maxY - minY;
    if (spread > STRUCTURE_PAD_MAX_SLOPE && spread > 14) return undefined;
    return preferMin ? minY : maxY;
}

/**
 * @param {string} id
 */
function isFoundationVoidId(id) {
    return (
        id === "minecraft:air" ||
        id === "minecraft:cave_air" ||
        id === "minecraft:void_air" ||
        id === "minecraft:lava" ||
        id === "minecraft:flowing_lava"
    );
}

/**
 * Fill air below a leveled floor so cliff / ravine footprints stay walkable.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {number} platformY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @returns {number}
 */
/**
 * Remove logs/leaves above a column so hillside pads don't wrap living trees.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} fromY
 * @param {number} toY
 */
function clearVegetationInColumn(dimension, wx, wz, fromY, toY) {
    let n = 0;
    for (let y = fromY; y <= toY; y++) {
        let block;
        try {
            block = dimension.getBlock({ x: wx, y, z: wz });
        } catch {
            break;
        }
        if (!block) break;
        const id = block.typeId;
        if (isWaterBlockId(id)) continue;
        if (isStructureFootprintObstructionId(id)) {
            if (trySetBlock(dimension, wx, y, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) n++;
        }
    }
    return n;
}

function ensureStructureColumnFoundation(dimension, x, z, platformY, mat) {
    const support =
        mat.pathCobble ?? mat.wallMossy ?? mat.wall ?? "minecraft:cobblestone";
    const footY = platformY - 1;
    let placed = 0;
    for (let y = footY; y >= footY - STRUCTURE_FOUNDATION_MAX_DEPTH; y--) {
        let block;
        try {
            block = dimension.getBlock({ x, y, z });
        } catch {
            break;
        }
        if (!block) break;
        const id = block.typeId;
        if (y < footY && !isFoundationVoidId(id) && !isVegetationId(id) && !isStructureFootprintObstructionId(id)) {
            break;
        }
        if (id === "mb:dusted_dirt" && y === footY) break;
        if (
            isFoundationVoidId(id) ||
            isVegetationId(id) ||
            STRUCTURE_PAD_REPLACE.has(id) ||
            isStructureFootprintObstructionId(id)
        ) {
            if (trySetBlock(dimension, x, y, z, support, SETTLEMENT_REPLACE_ANY)) placed++;
            continue;
        }
        break;
    }
    return placed;
}

/**
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {SettlementRuleset} ruleset
 */
function pickStructurePadBlock(mat, ruleset, wx = 0, wz = 0, salt = 0) {
    if (ruleset === "desert") return "minecraft:sandstone";
    if (ruleset === "snowy" || ruleset === "ice" || ruleset === "taiga") return "minecraft:cobblestone";
    if (ruleset === "infected") return infectedPadFillId(mat, wx, wz, salt);
    return mat.pathDirt ?? "minecraft:dirt";
}

/**
 * Top block of a leveled structure pad (infected only — dusted surface).
 * @param {SettlementRuleset} ruleset
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} wx
 * @param {number} wz
 * @param {number} [salt]
 */
function pickStructurePadSurfaceCap(mat, ruleset, wx, wz, salt = 0) {
    if (ruleset === "infected") return infectedPadSurfaceCapId();
    return pickStructurePadBlock(mat, ruleset, wx, wz, salt);
}

/**
 * @param {StructureBuildState} st
 * @param {BuildJob} job
 */
function lootContextForStructure(st, job) {
    const biomeHouse = houseLootKeyForRuleset(job.ruleset);
    const plan = getStructureFloorPlan(st);
    if (st.variant === "house") {
        const variant = st.housePlan ?? 0;
        return {
            structureKind: "house",
            ruleset: job.ruleset,
            planId: `house_${variant}`,
            houseLootTable: houseStorageLootForVariant(variant, biomeHouse, job.ruleset)
        };
    }
    const workLoot =
        st.variant === "farmer" || st.variant === "farm"
            ? lootTableForWorkKind("farmer") ?? biomeHouse
            : lootTableForWorkKind(st.variant);
    return {
        structureKind: st.variant,
        ruleset: job.ruleset,
        planId: plan?.id ?? st.variant,
        workLootTable: workLoot ?? biomeHouse,
        houseLootTable: workLoot ?? biomeHouse
    };
}

/**
 * @param {StructureBuildState} st
 * @param {{ floor?: 1|2 }} spec
 */
function structureInteriorYOffset(st, spec) {
    const plan = getStructureFloorPlan(st);
    const level = spec.floor ?? 1;
    const levels = planMidFloorLevels(plan);
    if (level >= 2 && levels.length > 0) {
        const idx = Math.min(level - 2, levels.length - 1);
        return levels[idx];
    }
    return 0;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} floorId
 */
function ensureBedFloor(dimension, x, y, z, floorId, hx, hz) {
    trySetBlock(dimension, x, y - 1, z, floorId, SETTLEMENT_REPLACE_ANY);
    trySetBlock(dimension, hx, y - 1, hz, floorId, SETTLEMENT_REPLACE_ANY);
}

/**
 * Both bed halves must sit on occupied interior (mask-aware — H/L/T plans have courtyard gaps).
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isValidBedFootprintCell(st, lx, lz) {
    if (lx < 1 || lx >= st.w - 1 || lz >= 1 || lz >= st.d - 1) return false;
    return structureCellOccupied(st, lx, lz);
}

/**
 * Pick bed orientation so the head half stays off the perimeter.
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 * @returns {{ headDLx: number, headDLz: number, direction: number }|null}
 */
function resolveBedPlacement(st, lx, lz) {
    if (!isValidBedFootprintCell(st, lx, lz)) return null;
    const midX = (st.w - 1) / 2;
    const midZ = (st.d - 1) / 2;
    /** @type {{ headDLx: number, headDLz: number, direction: number }[]} */
    const candidates = [
        { headDLx: 0, headDLz: -1, direction: 0 },
        { headDLx: 0, headDLz: 1, direction: 2 },
        { headDLx: -1, headDLz: 0, direction: 1 },
        { headDLx: 1, headDLz: 0, direction: 3 }
    ];
    const scored = candidates
        .filter((c) => isValidBedFootprintCell(st, lx + c.headDLx, lz + c.headDLz))
        .sort((a, b) => {
            const headAx = lx + a.headDLx;
            const headAz = lz + a.headDLz;
            const headBx = lx + b.headDLx;
            const headBz = lz + b.headDLz;
            const distA = Math.abs(headAx - midX) + Math.abs(headAz - midZ);
            const distB = Math.abs(headBx - midX) + Math.abs(headBz - midZ);
            return distA - distB;
        });
    return scored[0] ?? null;
}

/**
 * Place both halves of a bed (commands + permutations — Bedrock is picky).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} hx
 * @param {number} hz
 * @param {number} direction
 * @param {string} [floorId]
 */
function placeStructureBedAt(dimension, x, y, z, hx, hz, direction, floorId = "minecraft:oak_planks") {
    ensureBedFloor(dimension, x, y, z, floorId, hx, hz);

    const cmdSets = [
        [
            `setblock ${x} ${y} ${z} bed ["direction"=${direction},"head_piece_bit"=false]`,
            `setblock ${hx} ${y} ${hz} bed ["direction"=${direction},"head_piece_bit"=true]`
        ],
        [
            `setblock ${x} ${y} ${z} white_bed ["direction"=${direction},"head_piece_bit"=false]`,
            `setblock ${hx} ${y} ${hz} white_bed ["direction"=${direction},"head_piece_bit"=true]`
        ]
    ];
    for (const cmds of cmdSets) {
        try {
            dimension.runCommand(cmds[0]);
            dimension.runCommand(cmds[1]);
            return true;
        } catch {
            /* try next */
        }
    }

    try {
        const foot = BlockPermutation.resolve("minecraft:bed", {
            direction,
            head_piece_bit: false
        });
        const head = BlockPermutation.resolve("minecraft:bed", {
            direction,
            head_piece_bit: true
        });
        dimension.getBlock({ x, y, z })?.setPermutation(foot);
        dimension.getBlock({ x: hx, y, z: hz })?.setPermutation(head);
        return true;
    } catch {
        return (
            trySetBlock(dimension, x, y, z, "minecraft:bed", SETTLEMENT_REPLACE_ANY) &&
            trySetBlock(dimension, hx, y, hz, "minecraft:bed", SETTLEMENT_REPLACE_ANY)
        );
    }
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} lx
 * @param {number} lz
 * @param {number} wy
 * @param {string} floorId
 */
function placeStructureBedInShell(st, dimension, lx, lz, wy, floorId) {
    const placement = resolveBedPlacement(st, lx, lz);
    if (!placement) return false;
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    const hx = st.originX + lx + placement.headDLx;
    const hz = st.originZ + lz + placement.headDLz;
    return placeStructureBedAt(
        dimension,
        wx,
        wy,
        wz,
        hx,
        hz,
        placement.direction,
        floorId
    );
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} wallX
 * @param {number} wallZ
 */
function placeStructureLadder(dimension, x, y, z, wallX, wallZ, wallBlockId = "minecraft:cobblestone") {
    let face = LADDER_FACING.north;
    if (wallX < x) face = LADDER_FACING.west;
    else if (wallX > x) face = LADDER_FACING.east;
    else if (wallZ < z) face = LADDER_FACING.north;
    else if (wallZ > z) face = LADDER_FACING.south;

    trySetBlock(dimension, wallX, y, wallZ, wallBlockId, SETTLEMENT_REPLACE_ANY);

    try {
        const perm = BlockPermutation.resolve("minecraft:ladder", { facing_direction: face });
        dimension.getBlock({ x, y, z })?.setPermutation(perm);
        return true;
    } catch {
        /* fall through */
    }
    try {
        dimension.runCommand(`setblock ${x} ${y} ${z} ladder ["facing_direction"=${face}]`);
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function placeStructureLadderAuto(dimension, x, y, z, mat) {
    /** @type {[number, number, number][]} */
    const dirs = [
        [-1, 0, LADDER_FACING.west],
        [1, 0, LADDER_FACING.east],
        [0, -1, LADDER_FACING.north],
        [0, 1, LADDER_FACING.south]
    ];
    for (const [dx, dz, face] of dirs) {
        const wx = x + dx;
        const wz = z + dz;
        let block;
        try {
            block = dimension.getBlock({ x: wx, y, z: wz });
        } catch {
            continue;
        }
        const id = block?.typeId;
        if (id && !isFoundationVoidId(id) && !isVegetationId(id)) {
            try {
                const perm = BlockPermutation.resolve("minecraft:ladder", { facing_direction: face });
                dimension.getBlock({ x, y, z })?.setPermutation(perm);
                return true;
            } catch {
                try {
                    dimension.runCommand(`setblock ${x} ${y} ${z} ladder ["facing_direction"=${face}]`);
                    return true;
                } catch {
                    /* try next */
                }
            }
        }
    }
    return placeSupportedLadderAt(dimension, x, y, z, mat, x - 1, z);
}

/**
 * Place a solid backing block then a ladder (avoids dropped ladder items).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} wallX
 * @param {number} wallZ
 */
function placeSupportedLadderAt(dimension, x, y, z, mat, wallX, wallZ) {
    trySetBlock(dimension, wallX, y, wallZ, mat.log, SETTLEMENT_REPLACE_ANY);
    return placeStructureLadder(dimension, x, y, z, wallX, wallZ, mat.wall);
}

/**
 * Interior + exterior access for two-story shells.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
/**
 * Solid fill from each column's roof surface up to the walking deck (fixes floating rails).
 * @param {StructureBuildState} st
 */
function sealRoofVolumeToDeck(st, dimension, floorCache, mat, hintY, deckWalkY) {
    const fillId = roofFillBlockForStructure(st, mat, roofSlabForStructure(st, mat));
    const plan = getStructureFloorPlan(st);
    const multi = structureIsMultiStory(plan);
    let n = 0;
    for (let lx = 0; lx < st.w; lx++) {
        for (let lz = 0; lz < st.d; lz++) {
            if (!structureCellOccupied(st, lx, lz)) continue;
            if (isInAccessShaft(st, lx, lz)) continue;
            const wx = st.originX + lx;
            const wz = st.originZ + lz;
            const surfaceY = structureCellRoofSurfaceY(st, dimension, floorCache, mat, hintY, lx, lz);
            if (surfaceY === undefined) continue;
            const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
            const minFillY = multi && sy !== undefined ? sy + st.wallH : surfaceY + 1;
            for (let y = Math.max(surfaceY + 1, minFillY); y < deckWalkY; y++) {
                if (trySetBlock(dimension, wx, y, wz, fillId, SETTLEMENT_REPLACE_ANY)) n++;
            }
        }
    }
    return n;
}

/**
 * Ladder shaft, exterior stair landing, and door approach — keep open at deck height.
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isRooftopAccessOpeningCell(st, lx, lz) {
    if (isInAccessShaft(st, lx, lz)) return true;
    if (isDoorApproachCell(st, lx, lz)) return true;
    const flank = pickExteriorStairFlank(st);
    if (lx === flank.lx && lz === flank.lz) return true;
    if (st.doorFace === 0 && lz <= 1 && Math.abs(lx - flank.lx) <= 1) return true;
    if (st.doorFace === 2 && lz >= st.d - 2 && Math.abs(lx - flank.lx) <= 1) return true;
    if (st.doorFace === 1 && lx >= st.w - 2 && Math.abs(lz - flank.lz) <= 1) return true;
    if (st.doorFace === 3 && lx <= 1 && Math.abs(lz - flank.lz) <= 1) return true;
    if (st.accessLx !== undefined && st.accessLz !== undefined) {
        const ax = st.accessLx + 0.5;
        const az = st.accessLz + 0.5;
        const dist = Math.abs(lx - ax) + Math.abs(lz - az);
        if (dist <= 2.5 && isOccupiedStructureEdge(st, lx, lz)) return true;
    }
    return false;
}

/**
 * Optional corner mast — never on the access shaft.
 * @param {StructureBuildState} st
 * @param {number} holeLx
 * @param {number} holeLz
 */
function pickLookoutMastCorner(st, holeLx, holeLz) {
    /** @type {[number, number][]} */
    const corners = [
        [1, 1],
        [st.w - 2, 1],
        [1, st.d - 2],
        [st.w - 2, st.d - 2]
    ];
    let best = corners[0];
    let bestDist = -1;
    const hx = holeLx + 0.5;
    const hz = holeLz + 0.5;
    for (const [lx, lz] of corners) {
        if (!structureCellOccupied(st, lx, lz)) continue;
        if (isInAccessShaft(st, lx, lz)) continue;
        if (isDoorApproachCell(st, lx, lz)) continue;
        const d = Math.abs(lx - hx) + Math.abs(lz - hz);
        if (d > bestDist) {
            bestDist = d;
            best = [lx, lz];
        }
    }
    return { lx: best[0], lz: best[1] };
}

function placeRooftopLookout(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    const isTwo = structureIsMultiStory(plan);
    const rollMax = isTwo ? 50 : 26;
    if (!st.forceLookout && hashChunkRoll(st.cx, st.cz, st.salt + 880, 100) >= rollMax) return 0;

    const shaft =
        st.accessLx !== undefined && st.accessLz !== undefined
            ? { accessLx: st.accessLx, accessLz: st.accessLz }
            : pickProspectiveAccessShaft(st, plan);
    if (!shaft) return 0;
    commitAccessShaft(st, plan, shaft.accessLx, shaft.accessLz);

    const holeLx = st.accessLx;
    const holeLz = st.accessLz;
    const maxSurfaceY = structureMaxRoofSurfaceY(st, dimension, floorCache, mat, hintY);
    const deckWalkY = maxSurfaceY + 1;
    let n = 0;

    const deckId = roofFillBlockForStructure(st, mat, roofSlabForStructure(st, mat));
    n += sealRoofVolumeToDeck(st, dimension, floorCache, mat, hintY, deckWalkY);
    if (isTwo) n += clearMultiStoryInteriorAir(st, dimension, floorCache, mat, hintY);

    const railY = deckWalkY + 1;
    const clearHeadY = railY + 2;

    for (let dlx = 0; dlx < 2; dlx++) {
        for (let dlz = 0; dlz < 2; dlz++) {
            const lx = holeLx + dlx;
            const lz = holeLz + dlz;
            if (lx < 0 || lz < 0 || lx >= st.w || lz >= st.d) continue;
            const wx = st.originX + lx;
            const wz = st.originZ + lz;
            const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
            if (sy === undefined) continue;
            for (let y = sy; y <= clearHeadY; y++) {
                if (trySetBlock(dimension, wx, y, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) n++;
            }
        }
    }

    for (let lx = 0; lx < st.w; lx++) {
        for (let lz = 0; lz < st.d; lz++) {
            if (!structureCellOccupied(st, lx, lz)) continue;
            if (isRooftopAccessOpeningCell(st, lx, lz)) continue;
            const px = st.originX + lx;
            const pz = st.originZ + lz;
            if (trySetBlock(dimension, px, deckWalkY, pz, deckId, SETTLEMENT_REPLACE_ANY)) n++;
        }
    }

    for (let lx = 0; lx < st.w; lx++) {
        for (let lz = 0; lz < st.d; lz++) {
            if (!isOccupiedStructureEdge(st, lx, lz)) continue;
            if (isRooftopAccessOpeningCell(st, lx, lz)) continue;
            const px = st.originX + lx;
            const pz = st.originZ + lz;
            if (trySetBlock(dimension, px, deckWalkY, pz, deckId, SETTLEMENT_REPLACE_ANY)) n++;
            if (trySetBlock(dimension, px, railY, pz, mat.fence, SETTLEMENT_REPLACE_ANY)) n++;
        }
    }

    if (st.w >= 6 && st.d >= 6) {
        const mast = pickLookoutMastCorner(st, holeLx, holeLz);
        const mastX = st.originX + mast.lx;
        const mastZ = st.originZ + mast.lz;
        if (trySetBlock(dimension, mastX, deckWalkY, mastZ, deckId, SETTLEMENT_REPLACE_ANY)) n++;
        if (trySetBlock(dimension, mastX, railY, mastZ, mat.fence, SETTLEMENT_REPLACE_ANY)) n++;
        if (trySetBlock(dimension, mastX, railY + 1, mastZ, mat.log, SETTLEMENT_REPLACE_ANY)) n++;
        if (trySetBlock(dimension, mastX, railY + 2, mastZ, mat.fence, SETTLEMENT_REPLACE_ANY)) n++;
    }

    st.hasRooftopDeck = true;
    st.deckWalkY = deckWalkY;
    return n;
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
function pickExteriorStairFlank(st) {
    const midX = Math.floor(st.w / 2);
    const midZ = Math.floor(st.d / 2);
    const roll = hashChunkRoll(st.cx, st.cz, st.salt + 882, 2);
    if (st.doorFace === 0) return { lx: roll === 0 ? midX - 2 : midX + 2, lz: 0, dir: 2 };
    if (st.doorFace === 2) return { lx: roll === 0 ? midX - 2 : midX + 2, lz: st.d - 1, dir: 0 };
    if (st.doorFace === 1) return { lx: st.w - 1, lz: roll === 0 ? midZ - 2 : midZ + 2, dir: 3 };
    return { lx: 0, lz: roll === 0 ? midZ - 2 : midZ + 2, dir: 1 };
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} z
 * @param {number} y
 */
function exteriorStepIsSupported(dimension, x, z, y) {
    try {
        const below = dimension.getBlock({ x, y: y - 1, z });
        if (!below) return false;
        const id = below.typeId;
        return id !== "minecraft:air" && id !== "minecraft:water" && !id.includes("lava");
    } catch {
        return false;
    }
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
function placeExteriorRoofStairs(st, dimension, floorCache, mat, hintY) {
    if (!st.hasRooftopDeck && !structureIsMultiStory(getStructureFloorPlan(st))) return 0;
    const deckY =
        st.deckWalkY ?? structureMaxRoofSurfaceY(st, dimension, floorCache, mat, hintY) + 1;
    const flank = pickExteriorStairFlank(st);
    const wx = st.originX + flank.lx;
    const wz = st.originZ + flank.lz;
    const groundY = findBuildSurfaceY(dimension, wx, wz, hintY) ?? st.platformY;
    if (groundY === undefined || deckY - groundY > 8 || deckY <= groundY) return 0;
    let n = 0;
    const weirdo = flank.dir;
    for (let y = groundY; y < deckY && n < 10; y++) {
        const stepY = y + 1;
        if (!exteriorStepIsSupported(dimension, wx, wz, stepY) && stepY > groundY + 1) {
            trySetBlock(dimension, wx, stepY - 1, wz, mat.wall, SETTLEMENT_REPLACE_ANY);
        }
        if (trySetRoofStair(dimension, wx, stepY, wz, mat.stair, false, weirdo)) n++;
    }
    return n;
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
function placeExteriorRoofLadder(st, dimension, floorCache, mat, hintY) {
    if (!st.hasRooftopDeck || structureIsMultiStory(getStructureFloorPlan(st))) return 0;
    const deckY =
        st.deckWalkY ?? structureMaxRoofSurfaceY(st, dimension, floorCache, mat, hintY) + 1;
    let lx = st.w - 2;
    let lz = Math.floor(st.d / 2);
    let backLx = lx - 1;
    if (st.doorFace === 1) {
        lx = 1;
        backLx = 0;
    } else if (st.doorFace === 3) {
        lx = st.w - 2;
        backLx = st.w - 1;
    } else if (st.doorFace === 0) {
        lx = Math.floor(st.w / 2);
        lz = st.d - 2;
        backLx = lx;
    } else if (st.doorFace === 2) {
        lx = Math.floor(st.w / 2);
        lz = 1;
        backLx = lx;
    }
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    const wallWx = st.originX + backLx;
    const wallWz = st.originZ + lz;
    const groundY = findBuildSurfaceY(dimension, wx, wz, hintY) ?? st.platformY;
    if (groundY === undefined) return 0;
    let n = 0;
    for (let y = groundY; y <= deckY; y++) {
        if (placeSupportedLadderAt(dimension, wx, y, wz, mat, wallWx, wallWz)) n++;
    }
    return n;
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
function placeRoofAccessFeatures(st, dimension, floorCache, mat, hintY) {
    let n = 0;
    n += placeExteriorRoofStairs(st, dimension, floorCache, mat, hintY);
    n += placeExteriorRoofLadder(st, dimension, floorCache, mat, hintY);
    return n;
}

/**
 * Carve 2×2 vertical shaft once (after walls sealed). Ladders go in a later phase.
 * @param {StructureBuildState} st
 */
function ensureTwoStoryShaftCarved(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    if (!structureIsMultiStory(plan) || st.shaftCarved) return 0;
    if (st.accessLx === undefined || st.accessLz === undefined) {
        initTwoStoryAccessShaft(st, plan);
    }
    carveTwoStoryShaft(st, dimension, floorCache, mat, hintY, plan.midFloorH ?? 3, true);
    st.shaftCarved = true;
    return 1;
}

/**
 * Place ladder columns last so carve / roof / seal steps cannot break them.
 * @param {StructureBuildState} st
 */
function placeStructureLaddersFinal(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    if (!structureIsMultiStory(plan)) return 0;
    if (st.accessLx === undefined || st.accessLz === undefined) {
        initTwoStoryAccessShaft(st, plan);
    }
    const ladderLx = st.ladderFootLx ?? st.accessLx;
    const ladderLz = st.ladderFootLz ?? st.accessLz;
    const wx = st.originX + ladderLx;
    const wz = st.originZ + ladderLz;
    const backWx = st.originX + (ladderLx > 0 ? ladderLx - 1 : ladderLx + 1);
    const backWz = wz;
    const baseSy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (baseSy === undefined) return 0;
    let n = 0;
    const top = st.wallH + 1;
    for (let dy = 0; dy <= top; dy++) {
        if (placeSupportedLadderAt(dimension, wx, baseSy + dy, wz, mat, backWx, backWz)) n++;
    }
    return n;
}

/**
 * Debug: /setblock ladder rungs (API placement can drop as items on block updates).
 * @param {StructureBuildState} st
 */
function forcePlaceLadderColumnCommands(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    if (!structureIsMultiStory(plan)) return 0;
    if (st.accessLx === undefined || st.accessLz === undefined) return 0;
    const ladderLx = st.ladderFootLx ?? st.accessLx;
    const ladderLz = st.ladderFootLz ?? st.accessLz;
    const wx = st.originX + ladderLx;
    const wz = st.originZ + ladderLz;
    const backWx = st.originX + (ladderLx > 0 ? ladderLx - 1 : ladderLx + 1);
    const baseSy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (baseSy === undefined) return 0;
    const face = ladderLx > (backWx - st.originX) ? LADDER_FACING.east : LADDER_FACING.west;
    let n = 0;
    const top = st.wallH + 1;
    for (let dy = 0; dy <= top; dy++) {
        const y = baseSy + dy;
        trySetBlock(dimension, backWx, y, wz, mat.log, SETTLEMENT_REPLACE_ANY);
        try {
            dimension.runCommand(`setblock ${wx} ${y} ${wz} ladder ["facing_direction"=${face}]`);
            n++;
        } catch {
            /* ignore */
        }
    }
    return n;
}

/**
 * @typedef {{
 *   dimensionId: string,
 *   ruleset: SettlementRuleset,
 *   originX: number,
 *   originZ: number,
 *   accessLx: number,
 *   accessLz: number,
 *   ladderFootLx?: number,
 *   ladderFootLz?: number,
 *   wallH: number,
 *   ladderTopDy: number,
 *   baseSy: number,
 *   backWx: number,
 *   backWz: number,
 *   wx: number,
 *   wz: number,
 *   debugForceLadders?: boolean,
 *   basementShaft?: boolean,
 *   trapdoorY?: number
 *   trapdoorWx?: number
 *   trapdoorWz?: number
 *   hideBunkerShaft?: boolean
 *   ladderFace?: number
 * }} SettlementLadderColumnPayload
 */

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @returns {SettlementLadderColumnPayload|undefined}
 */
function captureLadderColumnPayload(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    const multi = structureIsMultiStory(plan);
    if (!multi && !st.hasRooftopDeck) return undefined;
    if (st.accessLx === undefined || st.accessLz === undefined) return undefined;
    const ladderLx = st.ladderFootLx ?? st.accessLx;
    const ladderLz = st.ladderFootLz ?? st.accessLz;
    const wx = st.originX + ladderLx;
    const wz = st.originZ + ladderLz;
    const backWx = st.originX + (ladderLx > 0 ? ladderLx - 1 : ladderLx + 1);
    const baseSy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (baseSy === undefined) return undefined;
    const maxSurfaceY = structureMaxRoofSurfaceY(st, dimension, floorCache, mat, hintY);
    const deckTop =
        st.deckWalkY ?? (st.hasRooftopDeck ? maxSurfaceY + 1 : maxSurfaceY);
    const ladderTopDy = Math.max(st.wallH + 1, deckTop - baseSy);
    return {
        dimensionId: dimension.id,
        ruleset: st.ruleset,
        originX: st.originX,
        originZ: st.originZ,
        accessLx: st.accessLx,
        accessLz: st.accessLz,
        ladderFootLx: ladderLx,
        ladderFootLz: ladderLz,
        wallH: st.wallH,
        ladderTopDy,
        baseSy,
        backWx,
        backWz: wz,
        wx,
        wz,
        debugForceLadders: st.debugForceLadders === true
    };
}

/**
 * @param {SettlementLadderColumnPayload} payload
 * @param {import("@minecraft/server").Dimension} dimension
 */
/**
 * Pick a shaft corner that does not already hold chest/barrel (deferred ladder pass runs after furnishings).
 * @param {SettlementLadderColumnPayload} payload
 * @param {import("@minecraft/server").Dimension} dimension
 */
function resolveShaftLadderFoot(payload, dimension) {
    const top = payload.ladderTopDy ?? payload.wallH + 1;
    const preferredLx = payload.ladderFootLx ?? payload.accessLx;
    const preferredLz = payload.ladderFootLz ?? payload.accessLz;
    /** @type {[number, number][]} */
    const cells = [[preferredLx, preferredLz]];
    for (let dlx = 0; dlx < 2; dlx++) {
        for (let dlz = 0; dlz < 2; dlz++) {
            const lx = payload.accessLx + dlx;
            const lz = payload.accessLz + dlz;
            if (!cells.some(([ax, az]) => ax === lx && az === lz)) cells.push([lx, lz]);
        }
    }
    for (const [lx, lz] of cells) {
        const wx = payload.originX + lx;
        const wz = payload.originZ + lz;
        let blocked = false;
        for (let dy = 0; dy <= top; dy++) {
            const y = payload.baseSy + dy;
            try {
                const id = dimension.getBlock({ x: wx, y, z: wz })?.typeId;
                if (id && isLootStorageBlockId(id)) {
                    blocked = true;
                    break;
                }
            } catch {
                /* unloaded */
            }
        }
        if (blocked) continue;
        const backWx = payload.originX + (lx > 0 ? lx - 1 : lx + 1);
        return { wx, wz, backWx, ladderFootLx: lx, ladderFootLz: lz };
    }
    return {
        wx: payload.wx,
        wz: payload.wz,
        backWx: payload.backWx,
        ladderFootLx: preferredLx,
        ladderFootLz: preferredLz
    };
}

function placeLadderColumnFromPayload(payload, dimension) {
    const mat = RUIN_MATERIALS_BY_RULESET[payload.ruleset] ?? RUIN_MATERIALS_BY_RULESET.plains;
    const foot = payload.hideBunkerShaft
        ? {
              wx: payload.wx,
              wz: payload.wz,
              backWx: payload.backWx,
              ladderFootLx: payload.ladderFootLx ?? 2,
              ladderFootLz: payload.ladderFootLz ?? 2
          }
        : resolveShaftLadderFoot(payload, dimension);
    const face =
        payload.ladderFace ??
        (foot.ladderFootLx > foot.backWx - payload.originX ? LADDER_FACING.east : LADDER_FACING.west);
    const backingId = payload.basementShaft ? mat.wall : mat.log;
    const top = payload.ladderTopDy ?? payload.wallH + 1;
    for (let dy = 0; dy <= top; dy++) {
        const y = payload.baseSy + dy;
        try {
            const id = dimension.getBlock({ x: foot.wx, y, z: foot.wz })?.typeId;
            if (id && isLootStorageBlockId(id)) continue;
            if (id === "minecraft:ladder") continue;
        } catch {
            /* ignore */
        }
        trySetBlock(dimension, foot.backWx, y, foot.wz, backingId, SETTLEMENT_REPLACE_ANY);
        try {
            dimension.runCommand(
                `setblock ${foot.wx} ${y} ${foot.wz} ladder ["facing_direction"=${face}]`
            );
        } catch {
            try {
                const perm = BlockPermutation.resolve("minecraft:ladder", { facing_direction: face });
                dimension.getBlock({ x: foot.wx, y, z: foot.wz })?.setPermutation(perm);
            } catch {
                /* ignore */
            }
        }
    }
    if (payload.basementShaft && payload.trapdoorY != null) {
        const tx = payload.trapdoorWx ?? payload.wx;
        const tz = payload.trapdoorWz ?? payload.wz;
        trySetBlock(
            dimension,
            tx,
            payload.trapdoorY,
            tz,
            settlementTrapdoorId(mat),
            SETTLEMENT_REPLACE_ANY
        );
    }
}

/**
 * Defer cellar hatch ladders until after ruin processor (same as multi-story shafts).
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @returns {SettlementLadderColumnPayload|undefined}
 */
function captureBasementLadderPayload(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    const depth = plan?.basementDepth;
    const hatch = plan?.basementHatch;
    if (!depth || !hatch || st.platformY === undefined) return undefined;
    const floorY = st.platformY - 1;
    const baseY = floorY - depth;
    const rungCount = floorY - baseY - 1;
    if (rungCount <= 0) return undefined;
    const wx = st.originX + hatch.lx;
    const wz = st.originZ + hatch.lz;
    let backWx = wx;
    let backWz = wz;
    let ladderFace = LADDER_FACING.north;
    if (hatch.lx > 0 && structureCellOccupied(st, hatch.lx - 1, hatch.lz)) {
        backWx = wx - 1;
        ladderFace = LADDER_FACING.east;
    } else if (hatch.lx < st.w - 1 && structureCellOccupied(st, hatch.lx + 1, hatch.lz)) {
        backWx = wx + 1;
        ladderFace = LADDER_FACING.west;
    } else if (hatch.lz > 0 && structureCellOccupied(st, hatch.lx, hatch.lz - 1)) {
        backWz = wz - 1;
        ladderFace = LADDER_FACING.south;
    } else if (hatch.lz < st.d - 1 && structureCellOccupied(st, hatch.lx, hatch.lz + 1)) {
        backWz = wz + 1;
        ladderFace = LADDER_FACING.north;
    }
    return {
        dimensionId: dimension.id,
        ruleset: st.ruleset,
        originX: st.originX,
        originZ: st.originZ,
        accessLx: hatch.lx,
        accessLz: hatch.lz,
        wallH: st.wallH,
        ladderTopDy: rungCount - 1,
        baseSy: baseY + 1,
        backWx,
        backWz,
        wx,
        wz,
        ladderFace,
        basementShaft: true,
        trapdoorY: floorY,
        debugForceLadders: st.debugForceLadders === true
    };
}

/**
 * After ruin processor (or immediately for force place). Uses /setblock like ladder test.
 * @param {SettlementLadderColumnPayload[]} payloads
 * @param {() => void} [onAllPassesDone]
 */
export function runSettlementLadderPlacements(payloads, onAllPassesDone) {
    if (!payloads?.length) {
        try {
            onAllPassesDone?.();
        } catch {
            /* ignore */
        }
        return;
    }
    let dim;
    try {
        dim = world.getDimension(payloads[0].dimensionId);
    } catch {
        try {
            onAllPassesDone?.();
        } catch {
            /* ignore */
        }
        return;
    }
    const passCount = payloads.some((p) => p.debugForceLadders) ? 2 : 1;
    let pass = 0;
    const step = () => {
        if (pass >= passCount) {
            try {
                onAllPassesDone?.();
            } catch {
                /* ignore */
            }
            return;
        }
        pass++;
        for (const payload of payloads) {
            placeLadderColumnFromPayload(payload, dim);
        }
        system.run(step);
    };
    system.run(step);
}

/** Max ticks to wait for ruin processor before placing ladders anyway (~30s). */
const LADDER_PLACE_MAX_WAIT_TICKS = 600;

/**
 * Place ladders after the ruin processor finishes (or after a timeout).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {SettlementLadderColumnPayload[]} payloads
 * @param {boolean} [skipProcessor]
 * @param {() => boolean} [processorIdle] returns true when ruin processor queue is empty
 * @param {() => void} [onAllLaddersPlaced]
 */
export function scheduleSettlementLadderPlacementsAfterRuin(
    dimension,
    payloads,
    skipProcessor = false,
    processorIdle = () => true,
    onAllLaddersPlaced
) {
    if (!payloads?.length) {
        try {
            onAllLaddersPlaced?.();
        } catch {
            /* ignore */
        }
        return;
    }
    const copy = payloads.map((p) => ({ ...p }));
    let waitTicks = skipProcessor ? 0 : LADDER_PLACE_MAX_WAIT_TICKS;
    let settleTicks = skipProcessor ? 1 : 10;
    const step = () => {
        if (!skipProcessor && !processorIdle() && waitTicks > 0) {
            waitTicks--;
            system.run(step);
            return;
        }
        if (settleTicks > 0) {
            settleTicks--;
            system.run(step);
            return;
        }
        runSettlementLadderPlacements(copy, onAllLaddersPlaced);
    };
    system.run(step);
}

/**
 * Re-seal perimeter after shaft carve (clears interior blocks only).
 * @param {StructureBuildState} st
 */
function sealStructurePerimeterQuick(st, dimension, floorCache, mat, hintY) {
    let n = 0;
    for (const { lx, lz } of structurePerimeterCells(st)) {
        n += sealStructureWallColumn(st, dimension, floorCache, mat, hintY, lx, lz);
    }
    return n;
}

/**
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {number} lx
 * @param {number} lz
 */
function isNearPlannedBed(plan, lx, lz) {
    if (!plan?.interior) return false;
    for (const spec of plan.interior) {
        if (!spec.id.includes("bed")) continue;
        if (Math.abs(spec.lx - lx) <= 1 && Math.abs(spec.lz - lz) <= 1) return true;
    }
    return false;
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isBasementHatchCell(st, lx, lz) {
    const plan = getStructureFloorPlan(st);
    const hatch = plan?.basementHatch;
    return !!hatch && hatch.lx === lx && hatch.lz === lz;
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isFloorPantryCell(st, lx, lz) {
    const fp = getStructureFloorPlan(st)?.floorPantry;
    return !!fp && fp.lx === lx && fp.lz === lz;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function trySetFloorTrapdoor(dimension, x, y, z, mat) {
    const trapId = settlementTrapdoorId(mat);
    try {
        const perm = BlockPermutation.resolve(trapId, {
            open_bit: false,
            upside_down_bit: true,
            direction: hashChunkRoll(x, z, 71, 4)
        });
        dimension.getBlock({ x, y, z })?.setPermutation(perm);
        return true;
    } catch {
        /* fall through */
    }
    try {
        dimension.runCommand(
            `setblock ${x} ${y} ${z} ${trapId.replace("minecraft:", "")} ["open_bit"=false,"upside_down_bit"=true]`
        );
        return true;
    } catch {
        return trySetBlock(dimension, x, y, z, trapId, SETTLEMENT_REPLACE_ANY);
    }
}

/**
 * Trapdoor in the floor + chest one block below (food pantry).
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
function placeFloorPantry(st, dimension, floorCache, mat, hintY) {
    const fp = getStructureFloorPlan(st)?.floorPantry;
    if (!fp || st.variant !== "house") return 0;
    const wx = st.originX + fp.lx;
    const wz = st.originZ + fp.lz;
    const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (sy === undefined) return 0;
    const floorY = sy - 1;
    const pitY = sy - 2;
    let n = 0;
    if (trySetBlock(dimension, wx, pitY, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) n++;
    if (trySetBlock(dimension, wx, pitY, wz, "minecraft:chest", SETTLEMENT_REPLACE_ANY)) n++;
    fillVillageStorageAt(
        dimension,
        wx,
        pitY,
        wz,
        housePantryLootKeyForRuleset(st.ruleset),
        "minecraft:chest",
        st.ruleset,
        "pantry"
    );
    if (trySetFloorTrapdoor(dimension, wx, floorY, wz, mat)) n++;
    return n;
}

/**
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function settlementTrapdoorId(mat) {
    if (mat.plank.includes("spruce")) return "minecraft:spruce_trapdoor";
    if (mat.plank.includes("birch")) return "minecraft:birch_trapdoor";
    if (mat.plank.includes("dark_oak")) return "minecraft:dark_oak_trapdoor";
    if (mat.plank.includes("jungle")) return "minecraft:jungle_trapdoor";
    if (mat.plank.includes("acacia")) return "minecraft:acacia_trapdoor";
    return "minecraft:oak_trapdoor";
}

/**
 * Abandoned villages — cold ashes only (lit campfires ignite adjacent hay/logs on Bedrock).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} [blockId]
 */
function trySetExtinguishedCampfire(dimension, x, y, z, blockId = "minecraft:campfire") {
    const cmdId = blockId.replace("minecraft:", "");
    try {
        dimension.runCommand(`setblock ${x} ${y} ${z} ${cmdId} ["extinguished"=true]`);
        return true;
    } catch {
        /* fall through */
    }
    try {
        const perm = BlockPermutation.resolve(blockId, { extinguished: true });
        dimension.getBlock({ x, y, z })?.setPermutation(perm);
        return true;
    } catch {
        return false;
    }
}

/**
 * Dedicated bed pass — permutations often fail silently during the main interior tick.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
/** Chests/barrels on upper floors or under a rooftop deck are placed after lookout/roofAccess so deck sealing does not break them. */
function structureNeedsDeferredFurnishings(st) {
    const plan = getStructureFloorPlan(st);
    if (plan?.interior?.length) return true;
    if (st.variant === "house" && st.housePlan != null) return true;
    if (st.variant === "church") return true;
    return false;
}

/**
 * @param {StructureBuildState} st
 */
function advancePhaseAfterRoofAccess(st) {
    const plan = getStructureFloorPlan(st);
    const needsLadders =
        structureIsMultiStory(plan) ||
        (st.hasRooftopDeck && st.accessLx !== undefined) ||
        structureHasCellar(st);
    if (structureNeedsDeferredFurnishings(st)) {
        st.phase = "furnishings";
        st.furnishingsI = 0;
        st.furnishingsSub = "items";
        return;
    }
    st.phase = needsLadders ? "ladders" : "done";
}

function placeStructureBedsFromPlan(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    if (!plan?.interior) return 0;
    const used = new Set();
    let n = 0;
    for (const spec of plan.interior) {
        if (!spec.id.includes("bed")) continue;
        const key = `${spec.lx},${spec.lz},${spec.floor ?? 1}`;
        if (used.has(key)) continue;
        used.add(key);
        const wx = st.originX + spec.lx;
        const wz = st.originZ + spec.lz;
        const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
        if (sy === undefined) continue;
        const wy = sy + structureInteriorYOffset(st, spec);
        if (placeStructureBedInShell(st, dimension, spec.lx, spec.lz, wy, mat.plank)) n++;
    }
    return n;
}

/**
 * @param {number} lx
 * @param {number} lz
 * @param {number} w
 * @param {number} d
 */
function isStructureInteriorCell(lx, lz, w, d) {
    return lx >= 1 && lx < w - 1 && lz >= 1 && lz < d - 1;
}

/** @param {StructureBuildState} st @param {number} lx @param {number} lz */
function isStructurePerimeterRing(st, lx, lz) {
    return lx <= 0 || lz <= 0 || lx >= st.w - 1 || lz >= st.d - 1;
}

const INTERIOR_FIXTURE_IDS = new Set([
    "minecraft:chest",
    "minecraft:barrel",
    "minecraft:anvil",
    "minecraft:grindstone",
    "minecraft:smithing_table",
    "minecraft:blast_furnace",
    "minecraft:furnace",
    "minecraft:smoker",
    "minecraft:loom",
    "minecraft:cartography_table",
    "minecraft:lectern",
    "minecraft:brewing_stand",
    "minecraft:composter",
    "minecraft:cauldron",
    "minecraft:flower_pot",
    "minecraft:decorated_pot",
    "minecraft:bookshelf",
    "minecraft:lantern",
    "minecraft:soul_lantern",
    "minecraft:campfire"
]);

/** Workstation blocks — never on outer-wall-adjacent cells (mask edges, L-wings, etc.). */
const WORKSTATION_BLOCK_IDS = new Set([
    "minecraft:anvil",
    "minecraft:grindstone",
    "minecraft:smithing_table",
    "minecraft:blast_furnace",
    "minecraft:furnace",
    "minecraft:smoker",
    "minecraft:loom",
    "minecraft:cartography_table",
    "minecraft:lectern",
    "minecraft:brewing_stand",
    "minecraft:composter",
    "minecraft:cauldron",
    "minecraft:fletching_table",
    "minecraft:enchanting_table"
]);

/** @param {string} blockId */
function isWorkstationBlockId(blockId) {
    return WORKSTATION_BLOCK_IDS.has(blockId);
}

/** @param {string} blockId */
function isInteriorFixtureBlockId(blockId) {
    if (blockId.includes("_bed")) return true;
    if (INTERIOR_FIXTURE_IDS.has(blockId)) return true;
    if (blockId.includes("carpet")) return true;
    return false;
}

/**
 * @param {StructureBuildState} st
 * @param {{ preferCenter?: boolean }} [opts]
 * @returns {{ lx: number, lz: number, dist: number }[]}
 */
function listStructureInteriorSlots(st, opts = {}) {
    const midX = (st.w - 1) / 2;
    const midZ = (st.d - 1) / 2;
    /** @type {{ lx: number, lz: number, dist: number }[]} */
    const out = [];
    for (let lz = 1; lz < st.d - 1; lz++) {
        for (let lx = 1; lx < st.w - 1; lx++) {
            if (!structureCellOccupied(st, lx, lz)) continue;
            if (isStructurePerimeterRing(st, lx, lz)) continue;
            if (isDoorApproachCell(st, lx, lz)) continue;
            if (isStructureDoorOpeningCell(st, lx, lz)) continue;
            if (isLadderFootCell(st, lx, lz)) continue;
            if (isInBasementShaft(st, lx, lz)) continue;
            if (isBasementHatchCell(st, lx, lz)) continue;
            if (isFloorPantryCell(st, lx, lz)) continue;
            out.push({ lx, lz, dist: Math.abs(lx - midX) + Math.abs(lz - midZ) });
        }
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} lx
 * @param {number} lz
 * @param {number} hintY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function structureFloorYAt(st, dimension, floorCache, hintY, mat, lx, lz) {
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    return structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
}

/**
 * Guarantee loot containers + beds for sparse houses / edge-blocked plans.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 */
function ensureStructureMinimumFurnishings(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    if (!plan) return 0;
    const ctx = st.lootCtx ?? lootContextForStructure(st, { ruleset: st.ruleset });
    const slots = listStructureInteriorSlots(st, { preferCenter: true });
    if (slots.length === 0) return 0;

    let n = 0;
    const isHouse = st.variant === "house";
    const workKind =
        st.variant === "smithy"
            ? "weaponsmith"
            : st.variant === "farm" || st.variant === "farmer"
              ? "farmer"
              : st.variant;

    const storageNeeded = isHouse ? 1 : 1;
    const bedsNeeded = isHouse ? 1 : 0;

    let storagePlaced = 0;
    let bedsPlaced = 0;
    let slotIdx = 0;

    const existingStorage = (plan.interior ?? []).filter((s) =>
        s.id === "minecraft:chest" || s.id === "minecraft:barrel"
    ).length;

    const tryStorage = (preferBarrel) => {
        if (existingStorage >= storageNeeded) return;
        while (slotIdx < slots.length && storagePlaced + existingStorage < storageNeeded) {
            const { lx, lz } = slots[slotIdx++];
            if (!canPlaceStorageFurnishing(st, lx, lz)) continue;
            const sy = structureFloorYAt(st, dimension, floorCache, hintY, mat, lx, lz);
            if (sy === undefined) continue;
            const blockId =
                preferBarrel && storagePlaced > 0 ? "minecraft:barrel" : "minecraft:chest";
            const spec = {
                id: blockId,
                lootSlot: "primary"
            };
            const loot =
                resolveInteriorLootTable(spec, ctx) ??
                lootTableForWorkKind(workKind) ??
                ctx.houseLootTable;
            if (!trySetBlock(dimension, st.originX + lx, sy, st.originZ + lz, blockId, SETTLEMENT_REPLACE_ANY)) {
                continue;
            }
            if (loot) {
                fillVillageStorageAt(
                    dimension,
                    st.originX + lx,
                    sy,
                    st.originZ + lz,
                    loot,
                    blockId,
                    ctx.ruleset ?? st.ruleset,
                    spec.lootSlot
                );
            }
            storagePlaced++;
            n++;
        }
    };

    tryStorage(false);

    while (slotIdx < slots.length && bedsPlaced < bedsNeeded) {
        const { lx, lz } = slots[slotIdx++];
        const sy = structureFloorYAt(st, dimension, floorCache, hintY, mat, lx, lz);
        if (sy === undefined) continue;
        if (placeStructureBedInShell(st, dimension, lx, lz, sy, mat.plank)) {
            bedsPlaced++;
            n++;
        }
    }

    if (storagePlaced < storageNeeded) {
        slotIdx = 0;
        tryStorage(true);
    }

    return n;
}

/**
 * Chests/barrels may sit in the 2×2 access well but not on the reserved ladder column cell.
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function canPlaceStorageFurnishing(st, lx, lz) {
    if (lx < 0 || lz < 0 || lx >= st.w || lz >= st.d) return false;
    if (!structureCellOccupied(st, lx, lz)) return false;
    if (isStructurePerimeterRing(st, lx, lz)) return false;
    if (isOccupiedStructureEdge(st, lx, lz)) return false;
    if (isStructureDoorOpeningCell(st, lx, lz)) return false;
    if (isDoorApproachCell(st, lx, lz)) return false;
    if (isLadderFootCell(st, lx, lz)) return false;
    if (isInBasementShaft(st, lx, lz)) return false;
    if (isBasementHatchCell(st, lx, lz)) return false;
    if (isFloorPantryCell(st, lx, lz)) return false;
    return true;
}

/**
 * Plan-driven furnishings may sit on the outer ring (not corners); still inside the shell.
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function canPlacePlannedFurnishing(st, lx, lz, blockId) {
    if (lx < 0 || lz < 0 || lx >= st.w || lz >= st.d) return false;
    if (!structureCellOccupied(st, lx, lz)) return false;
    if (isStructurePerimeterRing(st, lx, lz)) return false;
    const isStorage = blockId === "minecraft:chest" || blockId === "minecraft:barrel";
    if (isStorage) return canPlaceStorageFurnishing(st, lx, lz);
    if (isWorkstationBlockId(blockId) && isOccupiedStructureEdge(st, lx, lz)) return false;
    if (isOccupiedStructureEdge(st, lx, lz)) {
        if (blockId.includes("_bed")) {
            if (!resolveBedPlacement(st, lx, lz)) return false;
        } else if (!isInteriorFixtureBlockId(blockId)) {
            return false;
        }
    }
    if (isDoorApproachCell(st, lx, lz)) return false;
    return true;
}

/**
 * Door row + one interior tile in front — keep clear for paths and vertical access.
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isDoorApproachCell(st, lx, lz) {
    const cells = st.doorCells ?? computeStructureDoorCells(st);
    for (const door of cells) {
        if (lx === door.lx && lz === door.lz) return true;
        const { ox, oz } = doorExteriorOffset(st, door.lx, door.lz);
        const ax = door.lx + ox;
        const az = door.lz + oz;
        if (lx === ax && Math.abs(lz - door.lz) <= 1) return true;
        if (lz === az && Math.abs(lx - door.lx) <= 1) return true;
    }
    return false;
}

/**
 * Place furnishings/job blocks only inside a structure shell (never on paths or grass).
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {number} hintY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} lx
 * @param {number} lz
 * @param {{ id: string, loot?: string, floor?: 1|2 }} spec
 * @returns {boolean}
 */
function placeInteriorFurnishing(st, dimension, floorCache, hintY, mat, spec, lootTable, lootCtx) {
    const { lx, lz, id: blockId } = spec;
    const inBasement = spec.zone === "basement";
    if (inBasement) {
        if (
            !structureCellOccupied(st, lx, lz) ||
            isBasementHatchCell(st, lx, lz) ||
            isFloorPantryCell(st, lx, lz)
        ) {
            return false;
        }
    } else if (isFloorPantryCell(st, lx, lz)) {
        return false;
    } else if (!canPlacePlannedFurnishing(st, lx, lz, blockId)) {
        return false;
    }
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (sy === undefined) return false;
    let wy = sy + structureInteriorYOffset(st, spec);
    if (inBasement) {
        const plan = getStructureFloorPlan(st);
        const depth = plan?.basementDepth ?? 0;
        if (depth > 0 && st.platformY !== undefined) {
            wy = st.platformY - 1 - depth;
        }
    }
    let ok = false;
    if (blockId.includes("_bed")) {
        ok = placeStructureBedInShell(st, dimension, lx, lz, wy, mat.plank);
    } else if (blockId === "minecraft:ladder") {
        const fp = getStructureFloorPlan(st);
        if (structureIsMultiStory(fp)) return false;
        ok = placeStructureLadder(dimension, wx, wy, wz, st.originX + 1, wz);
    } else if (blockId === "minecraft:campfire" || blockId === "minecraft:soul_campfire") {
        ok = trySetExtinguishedCampfire(dimension, wx, wy, wz, blockId);
    } else {
        ok = trySetBlock(dimension, wx, wy, wz, blockId, SETTLEMENT_REPLACE_ANY);
    }
    const loot =
        lootTable ??
        resolveInteriorLootTable(spec, lootCtx ?? { houseLootTable: VILLAGE_LOOT.house_generic });
    if (ok && loot && (blockId === "minecraft:chest" || blockId === "minecraft:barrel")) {
        fillVillageStorageAt(
            dimension,
            wx,
            wy,
            wz,
            loot,
            blockId,
            lootCtx?.ruleset ?? st.ruleset,
            spec.lootSlot
        );
    }
    return ok;
}

/**
 * @typedef {{
 *   originX: number, originZ: number,
 *   doorFace: number,
 *   variant: StructureKind,
 *   cx: number, cz: number, salt: number, ruleset: SettlementRuleset,
 *   w: number, d: number, wallH: number,
 *   lx: number, lz: number,
 *   phase: "pad"|"basement"|"cellarBury"|"grid"|"roof"|"roofOverhang"|"midfloor"|"cob"|"interior"|"repair"|"appendages"|"facade"|"shaft"|"lookout"|"roofAccess"|"furnishings"|"ladders"|"smithy"|"farm"|"market"|"done",
 *   roofLx?: number,
 *   roofLz?: number,
 *   overhangI?: number,
 *   overhangTargets?: { lx: number, lz: number, dx: number, dz: number }[],
 *   hasRooftopDeck?: boolean,
 *   deckWalkY?: number,
 *   forceLookout?: boolean,
 *   floorPlan?: import("./mb_settlementStructures.js").HousePlan|null,
 *   shaftCarved?: boolean,
 *   repairCell: number,
 *   repairPass?: number,
 *   midLx: number,
 *   midLz: number,
 *   subPhase: "foot"|"walls"|"roof"|"cell_done",
 *   platformY?: number,
 *   padLx: number,
 *   padLz: number,
 *   padFillY?: number,
 *   lootCtx?: { structureKind?: string, houseLootTable?: string, workLootTable?: string },
 *   wallHProgress: number,
 *   doorCells?: { lx: number, lz: number }[],
 *   gateCells?: { lx: number, lz: number }[],
 *   cobI: number,
 *   interiorI: number,
 *   furnishingsI?: number,
 *   furnishingsSub?: "items"|"beds"|"decor"|"doors",
 *   marketI: number,
 *   farmFx: number, farmFz: number,
 *   farmToolI: number,
 *   smithyI: number,
 *   housePlan?: number,
 *   accessLx?: number,
 *   accessLz?: number,
 *   ladderFootLx?: number,
 *   ladderFootLz?: number,
 *   shaftCarved?: boolean,
 *   debugForceLadders?: boolean,
 *   churchRoll?: number,
 *   basementLx?: number,
 *   basementLz?: number,
 *   cellarBuryLx?: number,
 *   cellarBuryLz?: number,
 *   appendageI?: number,
 *   appendageLx?: number,
 *   appendageLz?: number,
 *   midFloorLevelIndex?: number
 * }} StructureBuildState
 */

/** Bedrock ladder facing_direction: 2=north 3=south 4=west 5=east (block the ladder attaches to is opposite). */
const LADDER_FACING = { north: 2, south: 3, west: 4, east: 5 };

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isInAccessShaft(st, lx, lz) {
    if (st.accessLx === undefined || st.accessLz === undefined) return false;
    return lx >= st.accessLx && lx < st.accessLx + 2 && lz >= st.accessLz && lz < st.accessLz + 2;
}

/**
 * Single cell where ladder rungs are placed (inside the 2×2 carved shaft).
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isLadderFootCell(st, lx, lz) {
    if (st.ladderFootLx !== undefined && st.ladderFootLz !== undefined) {
        return lx === st.ladderFootLx && lz === st.ladderFootLz;
    }
    if (st.accessLx !== undefined && st.accessLz !== undefined) {
        return lx === st.accessLx && lz === st.accessLz;
    }
    return false;
}

/**
 * @param {StructureBuildState} st
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 */
function initTwoStoryAccessShaft(st, plan) {
    if (!structureIsMultiStory(plan)) return;
    const shaft = pickProspectiveAccessShaft(st, plan);
    if (shaft) {
        commitAccessShaft(st, plan, shaft.accessLx, shaft.accessLz);
        return;
    }
    for (let az = 2; az < st.d - 3; az++) {
        for (let ax = 2; ax < st.w - 3; ax++) {
            if (accessShaftOriginValid(st, plan, ax, az)) {
                commitAccessShaft(st, plan, ax, az);
                return;
            }
        }
    }
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @param {number} midH
 */
function carveTwoStoryShaft(st, dimension, floorCache, mat, hintY, midH, throughRoof = false) {
    if (st.accessLx === undefined || st.accessLz === undefined) return;
    const plan = getStructureFloorPlan(st);
    const style = resolveRoofStyle(st, plan);
    const peak = getRoofPeakHeight(st, style);
    const roofClear = st.wallH + structureMaxRoofExtra(st, style, peak) + 2;
    const clearTop = throughRoof ? roofClear : Math.max(midH + 2, st.wallH + 1);
    for (let dlx = 0; dlx < 2; dlx++) {
        for (let dlz = 0; dlz < 2; dlz++) {
            const lx = st.accessLx + dlx;
            const lz = st.accessLz + dlz;
            const wx = st.originX + lx;
            const wz = st.originZ + lz;
            const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
            if (sy === undefined) continue;
            for (let y = sy; y <= sy + clearTop; y++) {
                trySetBlock(dimension, wx, y, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY);
            }
        }
    }
}

/**
 * @param {StructureBuildState} st
 * @returns {{ lx: number, lz: number }[]}
 */
function structurePerimeterCells(st) {
    /** @type {{ lx: number, lz: number }[]} */
    const out = [];
    for (let lx = 0; lx < st.w; lx++) {
        for (let lz = 0; lz < st.d; lz++) {
            if (isOccupiedStructureEdge(st, lx, lz)) out.push({ lx, lz });
        }
    }
    return out;
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
/**
 * Occupied perimeter cells on the face that opens toward the plaza.
 * @param {StructureBuildState} st
 * @returns {{ lx: number, lz: number }[]}
 */
function doorEdgeOccupiedCells(st) {
    /** @type {{ lx: number, lz: number }[]} */
    const out = [];
    const w = st.w;
    const d = st.d;
    const face = st.doorFace;
    if (face === 0) {
        for (let lx = 0; lx < w; lx++) {
            const lz = 0;
            if (structureCellOccupied(st, lx, lz) && isOccupiedStructureEdge(st, lx, lz)) out.push({ lx, lz });
        }
    } else if (face === 2) {
        for (let lx = 0; lx < w; lx++) {
            const lz = d - 1;
            if (structureCellOccupied(st, lx, lz) && isOccupiedStructureEdge(st, lx, lz)) out.push({ lx, lz });
        }
    } else if (face === 1) {
        for (let lz = 0; lz < d; lz++) {
            const lx = w - 1;
            if (structureCellOccupied(st, lx, lz) && isOccupiedStructureEdge(st, lx, lz)) out.push({ lx, lz });
        }
    } else {
        for (let lz = 0; lz < d; lz++) {
            const lx = 0;
            if (structureCellOccupied(st, lx, lz) && isOccupiedStructureEdge(st, lx, lz)) out.push({ lx, lz });
        }
    }
    return out;
}

/**
 * @param {StructureBuildState} st
 */
function planHasDogtrot(st) {
    return getStructureFloorPlan(st)?.dogtrot != null;
}

/**
 * @param {StructureBuildState} st
 */
function planHasWideLWing(st) {
    return getStructureFloorPlan(st)?.lWingWide === true;
}

/**
 * Wing doors on each pen — never the open breezeway center.
 * @param {StructureBuildState} st
 * @returns {{ lx: number, lz: number }[]}
 */
function computeDogtrotDoorCells(st) {
    const w = st.w;
    const d = st.d;
    const inset = getStructureFloorPlan(st)?.dogtrot?.wingDoorInset ?? 2;
    const west = inset;
    const east = w - inset - 1;
    const wingLz = Math.min(d - 2, Math.max(1, 2));
    /** @type {{ lx: number, lz: number }[]} */
    const cells = [];

    /** Lateral wing doors — west pen and east pen exteriors. */
    if (structureCellOccupied(st, 0, wingLz) && isOccupiedStructureEdge(st, 0, wingLz)) {
        cells.push({ lx: 0, lz: wingLz });
    }
    if (structureCellOccupied(st, w - 1, wingLz) && isOccupiedStructureEdge(st, w - 1, wingLz)) {
        cells.push({ lx: w - 1, lz: wingLz });
    }

    /** Front/back wing doors on plaza-facing and opposite sides. */
    const addFaceDoors = (face) => {
        if (face === 0) {
            cells.push({ lx: west, lz: 0 }, { lx: east, lz: 0 });
        } else if (face === 2) {
            cells.push({ lx: west, lz: d - 1 }, { lx: east, lz: d - 1 });
        } else if (face === 1) {
            cells.push({ lx: w - 1, lz: west }, { lx: w - 1, lz: east });
        } else {
            cells.push({ lx: 0, lz: west }, { lx: 0, lz: east });
        }
    };
    addFaceDoors(st.doorFace);
    addFaceDoors((st.doorFace + 2) % 4);

    /** @type {string[]} */
    const seen = [];
    return cells.filter((c) => {
        const key = `${c.lx},${c.lz}`;
        if (seen.includes(key)) return false;
        if (!structureCellOccupied(st, c.lx, c.lz) || !isOccupiedStructureEdge(st, c.lx, c.lz)) return false;
        seen.push(key);
        return true;
    });
}

/**
 * Breezeway mouth cells — fence gates instead of air gaps.
 * @param {StructureBuildState} st
 * @returns {{ lx: number, lz: number }[]}
 */
function computeDogtrotGateCells(st) {
    const w = st.w;
    const d = st.d;
    const mid = Math.floor(w / 2);
    const cols = [mid - 1, mid];
    /** @type {{ lx: number, lz: number }[]} */
    const gates = [];
    for (const lx of cols) {
        if (structureCellOccupied(st, lx, 0)) gates.push({ lx, lz: 0 });
        if (structureCellOccupied(st, lx, d - 1)) gates.push({ lx, lz: d - 1 });
    }
    return gates;
}

/**
 * Door on the wide bar, away from the L re-entrant corner.
 * @param {StructureBuildState} st
 * @returns {{ lx: number, lz: number }[]}
 */
function computeLWingDoorCells(st) {
    const w = st.w;
    const d = st.d;
    const face = st.doorFace;
    /** @type {{ lx: number, lz: number }[]} */
    let cells = [];
    if (face === 0) cells = [{ lx: 3, lz: 0 }];
    else if (face === 2) cells = [{ lx: 3, lz: d - 1 }];
    else if (face === 1) cells = [{ lx: w - 1, lz: 2 }];
    else cells = [{ lx: 0, lz: 2 }];
    return cells.filter(
        (c) => structureCellOccupied(st, c.lx, c.lz) && isOccupiedStructureEdge(st, c.lx, c.lz)
    );
}

/**
 * @param {SettlementRuleset} ruleset
 */
function settlementFenceGateId(ruleset) {
    if (ruleset === "desert" || ruleset === "savanna") return "minecraft:acacia_fence_gate";
    if (ruleset === "snowy" || ruleset === "ice" || ruleset === "taiga") return "minecraft:spruce_fence_gate";
    if (ruleset === "jungle") return "minecraft:jungle_fence_gate";
    return "minecraft:oak_fence_gate";
}

/**
 * Pick 2–3 adjacent occupied edge cells for a clear doorway (mask-aware).
 * @param {StructureBuildState} st
 * @returns {{ lx: number, lz: number }[]}
 */
function computeStructureDoorCells(st) {
    if (planHasDogtrot(st)) return computeDogtrotDoorCells(st);
    if (planHasWideLWing(st)) return computeLWingDoorCells(st);

    const midX = Math.floor(st.w / 2);
    const midZ = Math.floor(st.d / 2);
    const cands = doorEdgeOccupiedCells(st);
    const axisKey = (c) =>
        st.doorFace === 0 || st.doorFace === 2 ? Math.abs(c.lx - midX) : Math.abs(c.lz - midZ);
    cands.sort((a, b) => axisKey(a) - axisKey(b));

    if (cands.length === 0) {
        /** @type {{ lx: number, lz: number }} */
        const fallback =
            st.doorFace === 0
                ? { lx: midX, lz: 0 }
                : st.doorFace === 2
                  ? { lx: midX, lz: st.d - 1 }
                  : st.doorFace === 1
                    ? { lx: st.w - 1, lz: midZ }
                    : { lx: 0, lz: midZ };
        return [fallback];
    }

    const want =
        st.variant === "market" || st.variant === "hall" || st.w >= 8 ? 3 : 2;
    const primary = cands[0];
    /** @type {{ lx: number, lz: number }[]} */
    const picked = [primary];
    const sameRow = (a, b) => a.lx === b.lx || a.lz === b.lz;
    for (const c of cands) {
        if (picked.length >= want) break;
        if (picked.some((p) => p.lx === c.lx && p.lz === c.lz)) continue;
        if (Math.abs(c.lx - primary.lx) + Math.abs(c.lz - primary.lz) === 1) {
            picked.push(c);
        }
    }
    if (picked.length < want) {
        for (const c of cands) {
            if (picked.length >= want) break;
            if (picked.some((p) => p.lx === c.lx && p.lz === c.lz)) continue;
            if (sameRow(c, primary)) picked.push(c);
        }
    }
    picked.sort((a, b) => axisKey(a) - axisKey(b));
    return picked;
}

/**
 * Door gap at ground level — uses mask-aware doorCells (market = up to 3 wide).
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isStructureDoorOpeningCell(st, lx, lz) {
    const cells = st.doorCells ?? computeStructureDoorCells(st);
    return cells.some((c) => c.lx === lx && c.lz === lz);
}

/**
 * Dogtrot breezeway fence-gate cells (not wing doors).
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
function isStructureGateCell(st, lx, lz) {
    const cells = st.gateCells ?? [];
    return cells.some((c) => c.lx === lx && c.lz === lz);
}

/**
 * Place fence gates at breezeway mouths after walls are built.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @returns {number}
 */
function placeDogtrotFenceGates(st, dimension, floorCache, mat, hintY) {
    if (!planHasDogtrot(st)) return 0;
    const gateId = settlementFenceGateId(st.ruleset);
    let n = 0;
    for (const { lx, lz } of st.gateCells ?? computeDogtrotGateCells(st)) {
        const wx = st.originX + lx;
        const wz = st.originZ + lz;
        const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
        if (sy === undefined) continue;
        if (trySetBlock(dimension, wx, sy, wz, gateId, SETTLEMENT_REPLACE_ANY)) n++;
        if (trySetBlock(dimension, wx, sy + 1, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) n++;
    }
    return n;
}

/**
 * Carve a 2-block-tall doorway on occupied edge cells (post-wall safety pass).
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @returns {number}
 */
function ensureStructureDoorwayClear(st, dimension, floorCache, mat, hintY) {
    let n = 0;
    const cells = st.doorCells ?? computeStructureDoorCells(st);
    for (const { lx, lz } of cells) {
        if (!structureCellOccupied(st, lx, lz)) continue;
        const wx = st.originX + lx;
        const wz = st.originZ + lz;
        const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
        if (sy === undefined) continue;
        for (let h = 0; h <= 2; h++) {
            if (trySetBlock(dimension, wx, sy + h, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) n++;
        }
    }
    return n;
}

/**
 * Clear one block outside each door cell and lay a path pad so entries connect to spokes.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @returns {number}
 */
function ensureExteriorDoorApproach(st, dimension, floorCache, mat, hintY) {
    let n = 0;
    const cells = st.doorCells ?? computeStructureDoorCells(st);
    for (const { lx, lz } of cells) {
        const { ox, oz } = doorExteriorOffset(st, lx, lz);
        const wx = st.originX + lx + ox;
        const wz = st.originZ + lz + oz;
        let sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
        if (sy === undefined && st.platformY !== undefined) sy = st.platformY;
        if (sy === undefined) continue;
        for (let h = 0; h <= 2; h++) {
            if (trySetBlock(dimension, wx, sy + h, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) n++;
        }
        if (trySetGround(dimension, wx, wz, mat.path, SETTLEMENT_REPLACE_ANY, mat.log, hintY)) n++;
    }
    return n;
}

/**
 * Fill missing perimeter wall blocks (ravine / partial ticks).
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @param {number} lx
 * @param {number} lz
 */
/**
 * @param {string} id
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function isSettlementWallBlockId(id, mat) {
    return (
        id === mat.wall ||
        id === mat.wallMossy ||
        id === mat.log ||
        id.includes("cobblestone") ||
        id.includes("glass_pane") ||
        id.includes("sandstone")
    );
}

/**
 * @param {string} id
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function shouldReplacePerimeterWallCell(id, mat) {
    if (isFoundationVoidId(id) || isVegetationId(id)) return true;
    if (id.includes("_bed")) return true;
    if (id === mat.plank || id === mat.stair || id === mat.slab) return true;
    if (id.includes("planks") || id.includes("stairs") || id.includes("slab")) return true;
    if (id === "minecraft:ladder" || id === "minecraft:chain") return true;
    return false;
}

function sealStructureWallColumn(st, dimension, floorCache, mat, hintY, lx, lz) {
    const wx = st.originX + lx;
    const wz = st.originZ + lz;
    let baseY = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (baseY === undefined && st.platformY !== undefined) baseY = st.platformY;
    if (baseY === undefined) return 0;
    const isDoor = isStructureDoorOpeningCell(st, lx, lz);
    const isGate = isStructureGateCell(st, lx, lz);
    const isShaft = isInBasementShaft(st, lx, lz);
    const corner = (lx === 0 || lx === st.w - 1) && (lz === 0 || lz === st.d - 1);
    const stoneShell = structureUsesStoneShell(st);
    const gateId = settlementFenceGateId(st.ruleset);
    let n = 0;
    for (let h = 1; h <= st.wallH; h++) {
        if (isShaft && h <= 2) continue;
        if (isGate && h === 1) {
            if (trySetBlock(dimension, wx, baseY + h - 1, wz, gateId, SETTLEMENT_REPLACE_ANY)) n++;
            continue;
        }
        if ((isDoor || isGate) && h <= 2) continue;
        const wy = baseY + h - 1;
        let id = "minecraft:air";
        try {
            id = dimension.getBlock({ x: wx, y: wy, z: wz })?.typeId ?? id;
        } catch {
            continue;
        }
        if (!shouldReplacePerimeterWallCell(id, mat) && isSettlementWallBlockId(id, mat)) continue;
        if (id === "minecraft:brown_stained_glass_pane") continue;
        const wallType = stoneShell
            ? pickSettlementWallBlock(mat, wx, wz, st.salt + h)
            : corner
              ? mat.log
              : pickSettlementWallBlock(mat, wx, wz, st.salt + h);
        if (trySetBlock(dimension, wx, wy, wz, wallType, SETTLEMENT_REPLACE_ANY)) n++;
    }
    return n;
}

/**
 * @param {StructureBuildState} st
 * @param {number} lx
 * @param {number} lz
 */
/** Market door row gets a porch plank in the foot phase only (walls still built above). */
function isMarketDoorPorchCell(st, lx, lz) {
    return st.variant === "market" && isStructureDoorOpeningCell(st, lx, lz);
}

/**
 * @param {SettlementRuleset} ruleset
 */
function churchAisleBlockId(ruleset) {
    if (ruleset === "desert" || ruleset === "savanna") return "minecraft:smooth_sandstone";
    return "minecraft:polished_andesite";
}

/**
 * Post-interior church polish: stained glass bands, aisle trim.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @returns {number}
 */
function placeChurchDecor(st, dimension, floorCache, mat, hintY) {
    if (st.variant !== "church") return 0;
    const plan = getStructureFloorPlan(st);
    if (!plan) return 0;
    let n = 0;
    const aisle = churchAisleBlockId(st.ruleset);
    const midX = Math.floor(st.w / 2);
    for (let lz = 1; lz < st.d - 1; lz++) {
        if (!structureCellOccupied(st, midX, lz)) continue;
        const wx = st.originX + midX;
        const wz = st.originZ + lz;
        const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
        if (sy === undefined) continue;
        if (trySetBlock(dimension, wx, sy - 1, wz, aisle, SETTLEMENT_REPLACE_ANY)) n++;
    }
    for (let lz = 0; lz < st.d; lz++) {
        for (let lx = 0; lx < st.w; lx++) {
            if (!isOccupiedStructureEdge(st, lx, lz)) continue;
            const wx = st.originX + lx;
            const wz = st.originZ + lz;
            const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
            if (sy === undefined) continue;
            const wh = structureCellWallH(st, lx, lz);
            if (hashChunkRoll(wx, wz, st.salt + 77, 100) < 35) {
                if (trySetBlock(dimension, wx, sy + 1, wz, "minecraft:yellow_stained_glass_pane", SETTLEMENT_REPLACE_ANY)) {
                    n++;
                }
            }
            if (wh >= 5 && hashChunkRoll(wx, wz, st.salt + 78, 100) < 28) {
                if (trySetBlock(dimension, wx, sy + 3, wz, "minecraft:blue_stained_glass_pane", SETTLEMENT_REPLACE_ANY)) {
                    n++;
                }
            }
        }
    }
    return n;
}

/**
 * Door-face arch and column trim from plan.facade.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @returns {number}
 */
function placeStructureFacade(st, dimension, floorCache, mat, hintY) {
    const plan = getStructureFloorPlan(st);
    const facade = plan?.facade;
    if (!facade) return 0;
    let n = 0;
    const midX = Math.floor(st.w / 2);
    const midZ = Math.floor(st.d / 2);
    /** @type {{ lx: number, lz: number }[]} */
    const doorCells = [];
    for (let lx = 0; lx < st.w; lx++) {
        for (let lz = 0; lz < st.d; lz++) {
            if (isStructureDoorOpeningCell(st, lx, lz)) doorCells.push({ lx, lz });
        }
    }
    if (facade.doorArc) {
        for (const { lx, lz } of doorCells) {
            const wx = st.originX + lx;
            const wz = st.originZ + lz;
            const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
            if (sy === undefined) continue;
            if (trySetBlock(dimension, wx, sy + 2, wz, mat.stair, SETTLEMENT_REPLACE_ANY)) n++;
        }
    }
    if (facade.columns) {
        const colOff = st.doorFace === 0 || st.doorFace === 2 ? [{ lx: 1, lz: 0 }, { lx: st.w - 2, lz: 0 }] : [{ lx: 0, lz: 1 }, { lx: 0, lz: st.d - 2 }];
        for (const off of colOff) {
            const lx = st.doorFace === 2 ? off.lx : off.lx;
            const lz = st.doorFace === 2 ? st.d - 1 : st.doorFace === 0 ? 0 : off.lz;
            let clx = midX - 2;
            let clz = st.doorFace === 0 ? 0 : st.doorFace === 2 ? st.d - 1 : midZ - 2;
            if (st.doorFace === 1) clx = st.w - 1;
            if (st.doorFace === 3) clx = 0;
            if (st.doorFace === 0 || st.doorFace === 2) {
                clx = midX - 2;
                clz = st.doorFace === 0 ? 0 : st.d - 1;
                for (const dx of [0, 4]) {
                    const wx = st.originX + clx + dx;
                    const wz = st.originZ + clz;
                    const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
                    if (sy === undefined) continue;
                    for (let h = 0; h < 3; h++) {
                        if (trySetBlock(dimension, wx, sy + h, wz, mat.log, SETTLEMENT_REPLACE_ANY)) n++;
                    }
                }
            }
        }
    }
    if (facade.gableTrim) {
        const wx = st.originX + midX;
        const wz = st.originZ + (st.doorFace === 0 ? 0 : st.doorFace === 2 ? st.d - 1 : midZ);
        const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
        if (sy !== undefined) {
            const wh = st.wallH;
            if (trySetBlock(dimension, wx, sy + wh, wz, mat.stair, SETTLEMENT_REPLACE_ANY)) n++;
        }
    }
    return n;
}

/**
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @param {number} maxOps
 * @returns {number}
 */
function tickBasementPhase(st, dimension, floorCache, mat, hintY, maxOps) {
    const plan = getStructureFloorPlan(st);
    const depth = plan?.basementDepth;
    if (!depth || st.platformY === undefined) {
        st.phase = "grid";
        st.lx = 0;
        st.lz = 0;
        st.subPhase = "foot";
        return 0;
    }
    let ops = 0;
    const over = () => ops >= maxOps;
    const spend = (n = 1) => {
        ops += n;
    };
    while (!over() && st.phase === "basement") {
        if (st.basementLz >= st.d) {
            if (st.catalogExport) {
                st.phase = "grid";
                st.lx = 0;
                st.lz = 0;
                st.subPhase = "foot";
            } else {
                st.phase = "cellarBury";
                st.cellarBuryLx = -CELLAR_BURY_MARGIN;
                st.cellarBuryLz = -CELLAR_BURY_MARGIN;
            }
            break;
        }
        const lx = st.basementLx ?? 0;
        const lz = st.basementLz ?? 0;
        if (!structureCellOccupied(st, lx, lz)) {
            st.basementLx = lx + 1;
            if (st.basementLx >= st.w) {
                st.basementLx = 0;
                st.basementLz = (st.basementLz ?? 0) + 1;
            }
            continue;
        }
        const wx = st.originX + lx;
        const wz = st.originZ + lz;
        const floorY = st.platformY - 1;
        const baseY = floorY - depth;
        for (let y = floorY; y > baseY && !over(); y--) {
            if (trySetBlock(dimension, wx, y, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) spend(1);
        }
        if (!over()) {
            const bf = plan.basementFloor?.(lx, lz, st.w, st.d) ?? "stone";
            if (bf !== "skip") {
                const floorId = resolveFloorBlockId(bf, mat);
                if (trySetBlock(dimension, wx, baseY, wz, floorId, SETTLEMENT_REPLACE_ANY)) spend(1);
            }
            const wallId = structureUsesStoneShell(st) ? mat.wallMossy : mat.wall;
            if (isOccupiedStructureEdge(st, lx, lz)) {
                for (let h = 1; h <= depth && !over(); h++) {
                    if (trySetBlock(dimension, wx, baseY + h, wz, wallId, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
            }
        }
        const hatch = plan.basementHatch;
        if (hatch && hatch.lx === lx && hatch.lz === lz && !over()) {
            for (let y = baseY + 1; y < floorY && !over(); y++) {
                if (trySetBlock(dimension, wx, y, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) spend(1);
            }
        }
        st.basementLx = lx + 1;
        if (st.basementLx >= st.w) {
            st.basementLx = 0;
            st.basementLz = (st.basementLz ?? 0) + 1;
        }
    }
    return ops;
}

/**
 * Bury cellar walls with earth/grass so the room sits fully below grade.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @param {number} maxOps
 * @returns {number}
 */
function tickCellarBuryPhase(st, dimension, mat, hintY, maxOps) {
    if (st.catalogExport) {
        st.phase = "grid";
        st.lx = 0;
        st.lz = 0;
        st.subPhase = "foot";
        return 0;
    }
    const plan = getStructureFloorPlan(st);
    const depth = plan?.basementDepth;
    if (!depth || st.platformY === undefined) {
        st.phase = "grid";
        st.lx = 0;
        st.lz = 0;
        st.subPhase = "foot";
        return 0;
    }
    const floorY = st.platformY - 1;
    const baseY = floorY - depth;
    const buryId = cellarBuryFillId(st.ruleset, mat);
    const capId = cellarSurfaceCapId(st.ruleset, mat);
    const maxLx = st.w - 1 + CELLAR_BURY_MARGIN;
    const maxLz = st.d - 1 + CELLAR_BURY_MARGIN;
    let ops = 0;
    const over = () => ops >= maxOps;
    const spend = (n = 1) => {
        ops += n;
    };

    while (!over() && st.phase === "cellarBury") {
        const lx = st.cellarBuryLx ?? -CELLAR_BURY_MARGIN;
        const lz = st.cellarBuryLz ?? -CELLAR_BURY_MARGIN;
        if (lz > maxLz) {
            st.phase = "grid";
            st.lx = 0;
            st.lz = 0;
            st.subPhase = "foot";
            break;
        }

        const inside =
            lx >= 0 && lz >= 0 && lx < st.w && lz < st.d && structureCellOccupied(st, lx, lz);
        const wx = st.originX + lx;
        const wz = st.originZ + lz;
        const surf = resolveColumnFloorY(dimension, wx, wz, mat.log, hintY);

        if (!inside && surf !== undefined && !over()) {
            const topY = Math.max(surf - 1, floorY);
            for (let y = baseY; y <= topY && !over(); y++) {
                const id = y === surf - 1 ? capId : buryId;
                if (trySetBlock(dimension, wx, y, wz, id, SETTLEMENT_REPLACE_ANY)) spend(1);
            }
        }

        st.cellarBuryLx = lx + 1;
        if (st.cellarBuryLx > maxLx) {
            st.cellarBuryLx = -CELLAR_BURY_MARGIN;
            st.cellarBuryLz = lz + 1;
        }
    }
    return ops;
}

/**
 * Build porch / tower appendages after main shell.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Map<string, number|undefined>} floorCache
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} hintY
 * @param {number} maxOps
 * @returns {number}
 */
function tickAppendagePhase(st, dimension, floorCache, mat, hintY, maxOps) {
    const plan = getStructureFloorPlan(st);
    const appendages = plan?.appendages ?? [];
    if (!appendages.length) {
        st.phase = "facade";
        return 0;
    }
    let ops = 0;
    const over = () => ops >= maxOps;
    const spend = (n = 1) => {
        ops += n;
    };
    const ai = st.appendageI ?? 0;
    if (ai >= appendages.length) {
        st.phase = "facade";
        return 0;
    }
    const app = appendages[ai];
    const aw = app.w;
    const ad = app.d;
    const aWallH = app.wallH ?? 2;
    const ax0 = st.originX + app.ox;
    const az0 = st.originZ + app.oz;
    let alx = st.appendageLx ?? 0;
    let alz = st.appendageLz ?? 0;
    if (alz >= ad) {
        st.appendageI = ai + 1;
        st.appendageLx = 0;
        st.appendageLz = 0;
        if ((st.appendageI ?? 0) >= appendages.length) st.phase = "facade";
        return ops;
    }
    const wx = ax0 + alx;
    const wz = az0 + alz;
    const edgeA = alx === 0 || alx === aw - 1 || alz === 0 || alz === ad - 1;
    const sy = st.platformY ?? structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
    if (sy !== undefined && !over()) {
        const stoneApp =
            app.buildStyle === "stone" ||
            app.role === "tower" ||
            app.role === "bell_tower" ||
            app.role === "forge_patio";
        const openPatio = app.role === "forge_patio" || app.role === "dock_porch";
        const wallId = stoneApp ? pickSettlementWallBlock(mat, wx, wz, st.salt) : mat.wall;
        if (!edgeA) {
            if (app.role === "stilt_deck" && !st.catalogExport) {
                for (let drop = 1; drop <= 4 && !over(); drop++) {
                    if (trySetBlock(dimension, wx, sy - drop, wz, mat.log, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
            }
            if (trySetBlock(dimension, wx, sy - 1, wz, mat.plank, SETTLEMENT_REPLACE_ANY)) spend(1);
            if (app.role === "dock_porch" && !over()) {
                if (trySetBlock(dimension, wx, sy, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) spend(1);
            }
        } else {
            if (trySetBlock(dimension, wx, sy - 1, wz, wallId, SETTLEMENT_REPLACE_ANY)) spend(1);
            for (let h = 0; h < aWallH && !over(); h++) {
                const patioOpen = openPatio && h >= 1;
                if (!patioOpen) {
                    if (trySetBlock(dimension, wx, sy + h, wz, wallId, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
                if (app.role === "porch" && h === 0 && !over()) {
                    if (trySetBlock(dimension, wx, sy + 1, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
                if (app.role === "dock_porch" && h === 0 && !over()) {
                    if (trySetBlock(dimension, wx, sy + 1, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
                if (app.role === "forge_patio" && h === 0 && !over()) {
                    if (trySetBlock(dimension, wx, sy + 1, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
                if (app.role === "mill_wheel" && h === 1 && !over()) {
                    if (trySetBlock(dimension, wx, sy + 1, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
            }
            const chimney =
                app.role === "smoke_chimney" || app.role === "oven_chimney";
            if (chimney && alx === Math.floor(aw / 2) && alz === 0 && !over()) {
                for (let ch = aWallH; ch < aWallH + 3 && !over(); ch++) {
                    if (trySetBlock(dimension, wx, sy + ch, wz, mat.log, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
            }
        }
        if (app.role === "tower" || app.role === "bell_tower") {
            for (let h = 0; h < aWallH + 2 && !over(); h++) {
                if (trySetBlock(dimension, wx, sy + h, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) spend(1);
            }
        }
        if ((app.role === "tower" || app.role === "bell_tower") && edgeA && alz === 0 && alx === Math.floor(aw / 2) && !over()) {
            if (trySetBlock(dimension, wx, sy + aWallH + 1, wz, "minecraft:bell", SETTLEMENT_REPLACE_ANY)) spend(1);
            if (trySetBlock(dimension, wx, sy + aWallH + 2, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) spend(1);
            if (trySetBlock(dimension, wx, sy + aWallH + 3, wz, mat.log, SETTLEMENT_REPLACE_ANY)) spend(1);
        }
    }
    alx++;
    if (alx >= aw) {
        alx = 0;
        alz++;
    }
    st.appendageLx = alx;
    st.appendageLz = alz;
    return ops;
}

/**
 * @param {StructureBuildState} st
 */
function roofVegetationClearHeight(st) {
    const plan = getStructureFloorPlan(st);
    const style = resolveRoofStyle(st, plan);
    const peak = getRoofPeakHeight(st, style);
    return st.wallH + peak + 5;
}

/**
 * @param {HousePlan|null|undefined} plan
 */
function structureIsMultiStory(plan) {
    return (plan?.stories ?? 1) >= 2;
}

/**
 * Clear spruce/oak columns, snow layers, and loose ice in the footprint before pad/grid.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} originX
 * @param {number} originZ
 * @param {number} w
 * @param {number} d
 * @param {number} wallH
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} [hintY]
 */
function sweepStructureFootprintObstructions(dimension, originX, originZ, w, d, wallH, mat, hintY) {
    const topY = (hintY ?? 70) + wallH + 14;
    let n = 0;
    for (let lx = 0; lx < w; lx++) {
        for (let lz = 0; lz < d; lz++) {
            const wx = originX + lx;
            const wz = originZ + lz;
            const walkY = resolveColumnFloorY(dimension, wx, wz, mat.log, hintY);
            if (walkY === undefined) continue;
            n += clearVegetationInColumn(dimension, wx, wz, walkY, topY);
        }
    }
    return n;
}

/**
 * @param {StructureSlot} slot
 * @param {BuildJob} job
 * @param {number} salt
 * @returns {StructureBuildState}
 */
function beginStructureBuild(slot, job, salt, dimension, mat) {
    const { w, d, wallH } = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
    const originX = job.centerX + slot.ox;
    const originZ = job.centerZ + slot.oz;
    if (!structureFootprintChunksLoaded(dimension, originX, originZ, w, d, job.y)) {
        return {
            originX,
            originZ,
            doorFace: slot.door,
            variant: slot.type,
            housePlan: slot.housePlan,
            cx: job.cx,
            cz: job.cz,
            salt,
            ruleset: job.ruleset,
            w,
            d,
            wallH,
            lx: 0,
            lz: 0,
            phase: "waiting_chunks",
            subPhase: "foot",
            platformY: undefined,
            padLx: 0,
            padLz: 0,
            waitingChunks: true
        };
    }
    const midX = originX + Math.floor(w / 2);
    const midZ = originZ + Math.floor(d / 2);
    if (
        !job.structureCatalogMode &&
        structureSlotHasSettlementEvidence(dimension, midX, midZ, job.y, 5)
    ) {
        return {
            originX,
            originZ,
            doorFace: slot.door,
            variant: slot.type,
            housePlan: slot.housePlan,
            cx: job.cx,
            cz: job.cz,
            salt,
            ruleset: job.ruleset,
            w,
            d,
            wallH,
            lx: 0,
            lz: 0,
            phase: "done",
            subPhase: "foot",
            platformY: undefined,
            padLx: 0,
            padLz: 0,
            alreadyPresent: true
        };
    }
    sweepStructureFootprintObstructions(dimension, originX, originZ, w, d, wallH, mat, job.y);
    const catalogPad = job.structureCatalogMode === true;
    if (!catalogPad && !structureFootprintIsBuildable(dimension, originX, originZ, w, d, job.y)) {
        return {
            originX,
            originZ,
            doorFace: slot.door,
            variant: slot.type,
            housePlan: slot.housePlan,
            cx: job.cx,
            cz: job.cz,
            salt,
            ruleset: job.ruleset,
            w,
            d,
            wallH,
            lx: 0,
            lz: 0,
            phase: "done",
            subPhase: "foot",
            platformY: undefined,
            padLx: 0,
            padLz: 0,
            skippedFooting: true
        };
    }
    const previewPlan =
        slot.type === "house" && slot.housePlan != null
            ? getHousePlanForRuleset(job.ruleset, slot.housePlan)
            : slot.type === "church" && slot.churchRoll != null
              ? getChurchPlan(job.ruleset, slot.churchRoll)
              : getWorkBuildingPlan(slot.type, job.cx, job.cz, salt, job.ruleset);
    const preferMinPlatform = !!(previewPlan?.basementDepth);
    const platformY = catalogPad
        ? job.y
        : computeStructurePlatformY(dimension, originX, originZ, w, d, mat.log, job.y, preferMinPlatform) ??
          job.y;
    const catalogStartPhase = previewPlan?.basementDepth ? "basement" : "grid";
    const st = {
        originX,
        originZ,
        doorFace: slot.door,
        variant: slot.type,
        housePlan: slot.housePlan,
        cx: job.cx,
        cz: job.cz,
        salt,
        ruleset: job.ruleset,
        w,
        d,
        wallH,
        lx: 0,
        lz: 0,
        phase: catalogPad ? catalogStartPhase : platformY !== undefined ? "pad" : "grid",
        subPhase: "foot",
        wallHProgress: 0,
        platformY,
        catalogExport: catalogPad,
        catalogFloorSeeded: false,
        basementLx: catalogPad && previewPlan?.basementDepth ? 0 : undefined,
        basementLz: catalogPad && previewPlan?.basementDepth ? 0 : undefined,
        padLx: 0,
        padLz: 0,
        padFillY: undefined,
        lootCtx: undefined,
        midLx: 1,
        midLz: 1,
        cobI: 0,
        interiorI: 0,
        marketI: 0,
        farmFx: 1,
        farmFz: 1,
        farmToolI: 0,
        smithyI: 0,
        repairCell: 0,
        repairPass: 0,
        debugForceLadders: job.debugForceLadders === true,
        churchRoll: slot.churchRoll,
        forceLookout: slot.forceLookout === true
    };
    st.lootCtx = lootContextForStructure(st, job);
    st.floorPlan = resolveStructureFloorPlan(st);
    if (st.floorPlan) {
        if (st.floorPlan.w) st.w = st.floorPlan.w;
        if (st.floorPlan.d) st.d = st.floorPlan.d;
        if (st.floorPlan.wallH != null) st.wallH = st.floorPlan.wallH;
    }
    st.doorCells = computeStructureDoorCells(st);
    if (planHasDogtrot(st)) {
        st.gateCells = computeDogtrotGateCells(st);
    }
    initTwoStoryAccessShaft(st, st.floorPlan);
    reserveProspectiveAccessShaft(st, st.floorPlan);
    return st;
}

/**
 * Incremental ruin structure — respects maxOps so one house cannot freeze a tick.
 * @param {StructureBuildState} st
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {Map<string, number|undefined>} floorCache
 * @param {number} hintY
 * @param {number} maxOps
 * @returns {number}
 */
function seedCatalogFloorCache(st, floorCache) {
    if (!st.catalogExport || st.platformY === undefined || st.catalogFloorSeeded) return;
    for (let px = 0; px < st.w; px++) {
        for (let pz = 0; pz < st.d; pz++) {
            if (!structureCellOccupied(st, px, pz)) continue;
            floorCache.set(`${st.originX + px},${st.originZ + pz}`, st.platformY);
        }
    }
    st.catalogFloorSeeded = true;
}

function tickStructureBuild(st, dimension, mat, floorCache, hintY, maxOps, job) {
    if (st.phase === "waiting_chunks") {
        return 0;
    }
    seedCatalogFloorCache(st, floorCache);
    let ops = 0;
    const over = () => ops >= maxOps;
    const maxGuard = Math.min(16, maxOps + 4);
    let guard = 0;
    const guardHit = () => {
        guard++;
        return guard >= maxGuard;
    };
    const spend = (n = 1) => {
        ops += n;
    };
    const padFillBlock = pickStructurePadBlock(mat, st.ruleset, st.originX, st.originZ, st.salt);
    const padCapAt = (wx, wz, y) =>
        pickStructurePadSurfaceCap(mat, st.ruleset, wx, wz, st.salt + y);

    while (!over() && !guardHit() && st.phase === "basement") {
        spend(tickBasementPhase(st, dimension, floorCache, mat, hintY, maxOps - ops));
    }

    while (!over() && !guardHit() && st.phase === "cellarBury") {
        spend(tickCellarBuryPhase(st, dimension, mat, hintY, maxOps - ops));
    }

    while (!over() && !guardHit() && st.phase === "pad") {
        if (st.catalogExport) {
            seedCatalogFloorCache(st, floorCache);
            const padPlan = getStructureFloorPlan(st);
            if (padPlan?.basementDepth) {
                st.phase = "basement";
                st.basementLx = 0;
                st.basementLz = 0;
            } else {
                st.phase = "grid";
                st.lx = 0;
                st.lz = 0;
                st.subPhase = "foot";
            }
            break;
        }
        if (st.platformY === undefined) {
            st.phase = "grid";
            break;
        }
        if (st.padLz >= st.d) {
            if (st.platformY !== undefined) {
                for (let px = 0; px < st.w; px++) {
                    for (let pz = 0; pz < st.d; pz++) {
                        if (!structureCellOccupied(st, px, pz)) continue;
                        floorCache.set(`${st.originX + px},${st.originZ + pz}`, st.platformY);
                    }
                }
            }
            const padPlan = getStructureFloorPlan(st);
            if (padPlan?.basementDepth) {
                st.phase = "basement";
                st.basementLx = 0;
                st.basementLz = 0;
            } else {
                st.phase = "grid";
                st.lx = 0;
                st.lz = 0;
                st.subPhase = "foot";
            }
            break;
        }
        const wx = st.originX + st.padLx;
        const wz = st.originZ + st.padLz;
        if (!structureCellOccupied(st, st.padLx, st.padLz)) {
            st.padLx++;
            if (st.padLx >= st.w) {
                st.padLx = 0;
                st.padLz++;
            }
            continue;
        }
        const natural = resolveColumnFloorY(dimension, wx, wz, mat.log, hintY);
        spend(1);
        if (natural !== undefined && st.platformY !== undefined) {
            if (!over()) {
                spend(
                    clearVegetationInColumn(
                        dimension,
                        wx,
                        wz,
                        natural,
                        st.platformY + roofVegetationClearHeight(st)
                    )
                );
            }
            const rise = st.platformY - natural;
            if (rise < 0) {
                for (let cy = st.platformY; cy < natural && !over(); cy++) {
                    if (trySetBlock(dimension, wx, cy, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY)) spend(1);
                }
                if (
                    !over() &&
                    trySetBlock(dimension, wx, st.platformY - 1, wz, padCapAt(wx, wz, st.platformY), SETTLEMENT_REPLACE_ANY)
                ) {
                    spend(1);
                }
                if (!over()) spend(ensureStructureColumnFoundation(dimension, wx, wz, st.platformY, mat));
                floorCache.set(`${wx},${wz}`, st.platformY);
            } else if (rise > 0 && rise <= STRUCTURE_PAD_MAX_FILL) {
                const fillFrom = st.padFillY ?? natural;
                const capY = st.platformY - 1;
                if (fillFrom < capY) {
                    if (!over() && trySetBlock(dimension, wx, fillFrom, wz, padFillBlock, SETTLEMENT_REPLACE_ANY)) {
                        spend(1);
                    }
                    st.padFillY = fillFrom + 1;
                    if (st.padFillY < capY) continue;
                }
                if (
                    !over() &&
                    trySetBlock(dimension, wx, capY, wz, padCapAt(wx, wz, capY), SETTLEMENT_REPLACE_ANY)
                ) {
                    spend(1);
                }
                if (!over()) spend(ensureStructureColumnFoundation(dimension, wx, wz, st.platformY, mat));
                floorCache.set(`${wx},${wz}`, st.platformY);
            } else if (rise === 0) {
                if (
                    !over() &&
                    trySetBlock(dimension, wx, st.platformY - 1, wz, padCapAt(wx, wz, st.platformY), SETTLEMENT_REPLACE_ANY)
                ) {
                    spend(1);
                }
                if (!over()) spend(ensureStructureColumnFoundation(dimension, wx, wz, st.platformY, mat));
                floorCache.set(`${wx},${wz}`, st.platformY);
            } else {
                const target = st.platformY - 1;
                const from = st.padFillY ?? natural;
                if (from < target) {
                    const fillId = from < target - 1 ? padFillBlock : padCapAt(wx, wz, from);
                    if (!over() && trySetBlock(dimension, wx, from, wz, fillId, SETTLEMENT_REPLACE_ANY)) {
                        spend(1);
                    }
                    st.padFillY = from + 1;
                    if (st.padFillY < target) continue;
                }
                if (!over()) {
                    spend(ensureStructureColumnFoundation(dimension, wx, wz, st.platformY, mat));
                }
                floorCache.set(`${wx},${wz}`, st.platformY);
            }
        }
        if (
            !over() &&
            st.platformY !== undefined &&
            floorCache.get(`${wx},${wz}`) === st.platformY &&
            st.padFillY === undefined
        ) {
            spend(ensureStructureColumnFoundation(dimension, wx, wz, st.platformY, mat));
        }
        st.padFillY = undefined;
        st.padLx++;
        if (st.padLx >= st.w) {
            st.padLx = 0;
            st.padLz++;
        }
    }

    while (!over() && !guardHit() && st.phase === "grid") {
        if (st.lx >= st.w) {
            st.lx = 0;
            st.lz++;
        }
        if (st.lz >= st.d) {
            st.phase = "roof";
            st.roofLx = 0;
            st.roofLz = 0;
            break;
        }

        if (!structureCellOccupied(st, st.lx, st.lz)) {
            st.lx++;
            if (st.lx >= st.w) {
                st.lx = 0;
                st.lz++;
            }
            st.subPhase = "foot";
            st.wallHProgress = 0;
            continue;
        }

        const wx = st.originX + st.lx;
        const wz = st.originZ + st.lz;
        const edge = isOccupiedStructureEdge(st, st.lx, st.lz);
        const marketPorch = isMarketDoorPorchCell(st, st.lx, st.lz);

        if (st.subPhase === "foot") {
            if (marketPorch) {
                const surface = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
                spend(1);
                if (surface !== undefined && !over()) {
                    if (trySetBlock(dimension, wx, surface - 1, wz, mat.plank, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
            }
            if (!edge) {
                const floorPlan = getStructureFloorPlan(st);
                const hatchSkip =
                    isBasementHatchCell(st, st.lx, st.lz) || isFloorPantryCell(st, st.lx, st.lz);
                if (hatchSkip) {
                    /* Leave opening for cellar trapdoor + ladder shaft. */
                } else if (floorPlan) {
                    const fk = floorPlan.floor(st.lx, st.lz, st.w, st.d);
                    if (fk === "skip") {
                        st.subPhase = "cell_done";
                        st.wallHProgress = 0;
                        if (over()) break;
                        continue;
                    }
                    const surface = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
                    spend(1);
                    if (!over() && surface !== undefined) {
                        const floorId = resolveFloorBlockId(fk, mat);
                        if (trySetBlock(dimension, wx, surface - 1, wz, floorId, SETTLEMENT_REPLACE_ANY)) spend(1);
                    }
                } else if (!hatchSkip && hashChunkRoll(wx, wz, st.salt + 1, 100) < 80) {
                    const surface = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
                    spend(1);
                    if (!over() && surface !== undefined) {
                        if (trySetBlock(dimension, wx, surface - 1, wz, mat.plank, SETTLEMENT_REPLACE_ANY)) spend(1);
                    }
                }
            } else if (!over()) {
                const surface = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
                spend(1);
                if (surface !== undefined) {
                    const stoneShell = structureUsesStoneShell(st);
                    const useBeam =
                        !stoneShell && st.variant === "house" && isHouseCornerCell(st.lx, st.lz, st.w, st.d);
                    const foundation = stoneShell
                        ? pickSettlementWallBlock(mat, wx, wz, st.salt)
                        : useBeam
                          ? mat.log
                          : pickSettlementWallBlock(mat, wx, wz, st.salt);
                    if (trySetBlock(dimension, wx, surface - 1, wz, foundation, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
            }
            st.subPhase = edge ? "walls" : "cell_done";
            st.wallHProgress = 0;
            if (over()) break;
            continue;
        }

        if (st.subPhase === "walls" && edge) {
            const isDoor = isStructureDoorOpeningCell(st, st.lx, st.lz);
            const isGate = isStructureGateCell(st, st.lx, st.lz);
            const isShaft = isInBasementShaft(st, st.lx, st.lz);
            const corner = (st.lx === 0 || st.lx === st.w - 1) && (st.lz === 0 || st.lz === st.d - 1);
            let baseY = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
            if (baseY === undefined && st.platformY !== undefined) baseY = st.platformY;
            spend(1);
            if (baseY === undefined && st.platformY !== undefined) baseY = st.platformY;
            if (baseY === undefined) {
                st.subPhase = "cell_done";
                continue;
            }
            const cellWallH = structureCellWallH(st, st.lx, st.lz);
            const gateId = settlementFenceGateId(st.ruleset);
            for (let h = st.wallHProgress + 1; h <= cellWallH; h++) {
                if (over()) break;
                if (isShaft && h <= 2) {
                    st.wallHProgress = h;
                    continue;
                }
                if (isGate && h === 1) {
                    if (trySetBlock(dimension, wx, baseY, wz, gateId, SETTLEMENT_REPLACE_ANY)) spend(1);
                    st.wallHProgress = h;
                    continue;
                }
                if ((isDoor || isGate || isShaft) && h <= 2) {
                    st.wallHProgress = h;
                    continue;
                }
                const stoneShell = structureUsesStoneShell(st);
                const wallType = stoneShell
                    ? pickSettlementWallBlock(mat, wx, wz, st.salt + h)
                    : corner && h <= cellWallH
                      ? mat.log
                      : pickSettlementWallBlock(mat, wx, wz, st.salt + h);
                if (trySetBlock(dimension, wx, baseY + h - 1, wz, wallType, SETTLEMENT_REPLACE_ANY)) spend(1);
                const fp = getStructureFloorPlan(st);
                let glassChance = fp ? fp.glassChance : 45;
                if (fp?.stories && fp.stories >= 2) glassChance = Math.min(glassChance, 22);
                if (h === 2 && !isDoor && hashChunkRoll(wx, wz, st.salt + 2, 100) < glassChance) {
                    if (trySetBlock(dimension, wx, baseY + h - 1, wz, "minecraft:brown_stained_glass_pane", SETTLEMENT_REPLACE_ANY)) {
                        spend(1);
                    }
                }
                st.wallHProgress = h;
            }
            if (st.wallHProgress >= cellWallH) {
                st.subPhase = "cell_done";
            }
            if (over()) break;
            continue;
        }

        if (st.subPhase === "cell_done") {
            st.lx++;
            st.subPhase = "foot";
            st.wallHProgress = 0;
        }
    }

    while (!over() && !guardHit() && st.phase === "roof") {
        if (st.roofLz === undefined) st.roofLz = 0;
        if (st.roofLx === undefined) st.roofLx = 0;
        if (st.roofLz >= st.d) {
            const roofPlan = getStructureFloorPlan(st);
            if (rulesetUsesRoofOverhang(st.ruleset)) {
                st.overhangTargets = collectRoofOverhangTargets(st);
                st.overhangI = 0;
                st.phase = "roofOverhang";
            } else if (structureIsMultiStory(roofPlan)) {
                st.phase = "midfloor";
                st.midLx = 1;
                st.midLz = 1;
                st.midFloorLevelIndex = 0;
            } else {
                st.phase = "cob";
                st.cobI = 0;
            }
            break;
        }
        const rlx = st.roofLx;
        const rlz = st.roofLz;
        if (!over()) {
            spend(placeRoofColumnForCell(st, dimension, floorCache, mat, hintY, rlx, rlz));
        }
        st.roofLx++;
        if (st.roofLx >= st.w) {
            st.roofLx = 0;
            st.roofLz++;
        }
    }

    while (!over() && !guardHit() && st.phase === "roofOverhang") {
        const targets = st.overhangTargets ?? [];
        if ((st.overhangI ?? 0) >= targets.length) {
            const roofPlan = getStructureFloorPlan(st);
            if (structureIsMultiStory(roofPlan)) {
                st.phase = "midfloor";
                st.midLx = 1;
                st.midLz = 1;
                st.midFloorLevelIndex = 0;
            } else {
                st.phase = "cob";
                st.cobI = 0;
            }
            st.overhangTargets = undefined;
            break;
        }
        const t = targets[st.overhangI ?? 0];
        st.overhangI = (st.overhangI ?? 0) + 1;
        if (!over()) {
            spend(
                placeRoofOverhangTarget(
                    st,
                    dimension,
                    floorCache,
                    mat,
                    hintY,
                    t.lx,
                    t.lz,
                    t.dx,
                    t.dz
                )
            );
        }
    }

    while (!over() && !guardHit() && st.phase === "midfloor") {
        const midPlan = getStructureFloorPlan(st);
        const levels = planMidFloorLevels(midPlan);
        const levelIdx = st.midFloorLevelIndex ?? 0;
        if (levelIdx >= levels.length) {
            if (!over()) spend(clearMultiStoryInteriorAir(st, dimension, floorCache, mat, hintY));
            st.phase = "cob";
            st.cobI = 0;
            break;
        }
        const midH = levels[levelIdx];
        if (st.midLz >= st.d - 1) {
            st.midFloorLevelIndex = levelIdx + 1;
            st.midLx = 1;
            st.midLz = 1;
            continue;
        }
        const lx = st.midLx;
        const lz = st.midLz;
        if (!structureCellOccupied(st, lx, lz)) {
            st.midLx++;
            if (st.midLx >= st.w - 1) {
                st.midLx = 1;
                st.midLz++;
            }
            continue;
        }
        const wx = st.originX + lx;
        const wz = st.originZ + lz;
        const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
        spend(1);
        if (sy !== undefined && !over() && !isInAccessShaft(st, lx, lz)) {
            const midId = structureUsesStoneShell(st) ? mat.wallMossy : mat.plank;
            if (trySetBlock(dimension, wx, sy + midH - 1, wz, midId, SETTLEMENT_REPLACE_ANY)) spend(1);
            trySetBlock(dimension, wx, sy + midH, wz, "minecraft:air", SETTLEMENT_REPLACE_ANY);
        }
        st.midLx++;
        if (st.midLx >= st.w - 1) {
            st.midLx = 1;
            st.midLz++;
        }
    }

    const floorPlanForCob = getStructureFloorPlan(st);
    const cobCount = floorPlanForCob
        ? floorPlanForCob.cobCount
        : st.variant === "market"
          ? 8
          : 6;
    while (!over() && st.phase === "cob") {
        if (st.cobI >= cobCount) {
            if (getStructureFloorPlan(st)) {
                st.phase = "interior";
                st.interiorI = 0;
            } else if (st.variant === "farmer" || st.variant === "farm") {
                st.phase = "farm";
                st.farmFx = 1;
                st.farmFz = 1;
                st.farmToolI = 0;
            } else {
                st.phase = "repair";
                st.repairCell = 0;
            }
            break;
        }
        const lx = 1 + (hashChunkRoll(st.cx, st.cz, st.salt + 10 + st.cobI, 100) % Math.max(1, st.w - 2));
        const lz = 1 + (hashChunkRoll(st.cx, st.cz, st.salt + 20 + st.cobI, 100) % Math.max(1, st.d - 2));
        const cobPlan = getStructureFloorPlan(st);
        if (isNearPlannedBed(cobPlan, lx, lz) || isDoorApproachCell(st, lx, lz)) {
            st.cobI++;
            continue;
        }
        const baseY = structureSurfaceY(
            st,
            floorCache,
            dimension,
            st.originX + lx,
            st.originZ + lz,
            mat.log,
            hintY
        );
        spend(1);
        if (baseY !== undefined && !over()) {
            for (let dy = 0; dy < 2 && !over(); dy++) {
                if (trySetBlock(dimension, st.originX + lx, baseY + dy, st.originZ + lz, "minecraft:web", SETTLEMENT_REPLACE_ANY)) {
                    spend(1);
                }
            }
        }
        st.cobI++;
    }

    while (!over() && st.phase === "interior") {
        const plan = getStructureFloorPlan(st);
        const partitions = plan?.partitions ?? [];
        if (st.interiorI < partitions.length) {
            const part = partitions[st.interiorI];
            if ("lz0" in part) {
                for (let lz = part.lz0; lz <= part.lz1 && !over(); lz++) {
                    if (!structureCellOccupied(st, part.lx, lz)) continue;
                    const wx = st.originX + part.lx;
                    const wz = st.originZ + lz;
                    const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
                    spend(1);
                    if (sy === undefined) continue;
                    if (trySetBlock(dimension, wx, sy, wz, mat.log, SETTLEMENT_REPLACE_ANY)) spend(1);
                    if (!over() && trySetBlock(dimension, wx, sy + 1, wz, mat.log, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
            } else {
                for (let lx = part.lx0; lx <= part.lx1 && !over(); lx++) {
                    if (!structureCellOccupied(st, lx, part.lz)) continue;
                    const wx = st.originX + lx;
                    const wz = st.originZ + part.lz;
                    const sy = structureSurfaceY(st, floorCache, dimension, wx, wz, mat.log, hintY);
                    spend(1);
                    if (sy === undefined) continue;
                    if (trySetBlock(dimension, wx, sy, wz, mat.log, SETTLEMENT_REPLACE_ANY)) spend(1);
                    if (!over() && trySetBlock(dimension, wx, sy + 1, wz, mat.log, SETTLEMENT_REPLACE_ANY)) spend(1);
                }
            }
            st.interiorI++;
            continue;
        }
        if (structureNeedsDeferredFurnishings(st)) {
            st.phase = "repair";
            st.repairCell = 0;
            break;
        }
        const furnishings = plan?.interior ?? [];
        const fi = st.interiorI - partitions.length;
        if (fi >= furnishings.length) {
            if (!over()) spend(placeStructureBedsFromPlan(st, dimension, floorCache, mat, hintY));
            if (!over() && st.variant === "house" && st.housePlan != null) {
                const decor = generateHouseDecor(st.ruleset, st.housePlan, st.w, st.d, mat);
                for (const spec of decor) {
                    if (over()) break;
                    if (isDoorApproachCell(st, spec.lx, spec.lz)) continue;
                    if (
                        placeInteriorFurnishing(
                            st,
                            dimension,
                            floorCache,
                            hintY,
                            mat,
                            spec,
                            undefined,
                            st.lootCtx
                        )
                    ) {
                        spend(1);
                    }
                }
            }
            if (!over() && st.variant === "church") {
                spend(placeChurchDecor(st, dimension, floorCache, mat, hintY));
            }
            if (!over()) spend(ensureStructureMinimumFurnishings(st, dimension, floorCache, mat, hintY));
            if (!over()) spend(ensureStructureDoorwayClear(st, dimension, floorCache, mat, hintY));
            if (!over()) spend(placeDogtrotFenceGates(st, dimension, floorCache, mat, hintY));
            if (!over()) spend(ensureExteriorDoorApproach(st, dimension, floorCache, mat, hintY));
            st.phase = "repair";
            st.repairCell = 0;
            break;
        }
        const spec = furnishings[fi];
        st.interiorI++;
        spend(1);
        if (
            !over() &&
            placeInteriorFurnishing(
                st,
                dimension,
                floorCache,
                hintY,
                mat,
                spec,
                resolveInteriorLootTable(spec, st.lootCtx),
                st.lootCtx
            )
        ) {
            spend(1);
        }
    }

    const perimeterCells = structurePerimeterCells(st);
    while (!over() && st.phase === "repair") {
        if (st.repairCell >= perimeterCells.length) {
            if ((st.repairPass ?? 0) < 2) {
                st.repairPass = (st.repairPass ?? 0) + 1;
                st.repairCell = 0;
                continue;
            }
            if (!over()) spend(ensureStructureDoorwayClear(st, dimension, floorCache, mat, hintY));
            if (!over()) spend(placeDogtrotFenceGates(st, dimension, floorCache, mat, hintY));
            if (!over()) spend(ensureExteriorDoorApproach(st, dimension, floorCache, mat, hintY));
            const rPlan = getStructureFloorPlan(st);
            if (rPlan?.appendages?.length) {
                st.phase = "appendages";
                st.appendageI = 0;
                st.appendageLx = 0;
                st.appendageLz = 0;
            } else if (rPlan?.facade) {
                st.phase = "facade";
            } else {
                st.phase = structureIsMultiStory(rPlan) ? "shaft" : "lookout";
            }
            break;
        }
        const { lx, lz } = perimeterCells[st.repairCell];
        st.repairCell++;
        spend(sealStructureWallColumn(st, dimension, floorCache, mat, hintY, lx, lz));
    }

    while (!over() && st.phase === "appendages") {
        spend(tickAppendagePhase(st, dimension, floorCache, mat, hintY, maxOps - ops));
    }

    while (!over() && st.phase === "facade") {
        if (!over()) spend(placeStructureFacade(st, dimension, floorCache, mat, hintY));
        const fPlan = getStructureFloorPlan(st);
        st.phase = structureIsMultiStory(fPlan) ? "shaft" : "lookout";
        break;
    }

    while (!over() && st.phase === "shaft") {
        if (!over()) spend(ensureTwoStoryShaftCarved(st, dimension, floorCache, mat, hintY));
        if (!over()) spend(sealStructurePerimeterQuick(st, dimension, floorCache, mat, hintY));
        st.phase = "lookout";
        break;
    }

    while (!over() && st.phase === "lookout") {
        if (!over()) spend(placeRooftopLookout(st, dimension, floorCache, mat, hintY));
        st.phase = "roofAccess";
        break;
    }

    while (!over() && st.phase === "roofAccess") {
        if (!over()) spend(placeRoofAccessFeatures(st, dimension, floorCache, mat, hintY));
        advancePhaseAfterRoofAccess(st);
        break;
    }

    while (!over() && st.phase === "furnishings") {
        const sub = st.furnishingsSub ?? "items";
        if (sub === "items") {
            const plan = getStructureFloorPlan(st);
            const furnishings = plan?.interior ?? [];
            const fi = st.furnishingsI ?? 0;
            if (fi >= furnishings.length) {
                st.furnishingsSub = "beds";
                continue;
            }
            const spec = furnishings[fi];
            st.furnishingsI = fi + 1;
            spend(1);
            if (
                !over() &&
                placeInteriorFurnishing(
                    st,
                    dimension,
                    floorCache,
                    hintY,
                    mat,
                    spec,
                    resolveInteriorLootTable(spec, st.lootCtx),
                    st.lootCtx
                )
            ) {
                spend(1);
            }
            continue;
        }
        if (sub === "beds") {
            if (!over()) spend(placeStructureBedsFromPlan(st, dimension, floorCache, mat, hintY));
            st.furnishingsSub = "decor";
            continue;
        }
        if (sub === "decor") {
            if (!over() && st.variant === "house" && st.housePlan != null) {
                const decor = generateHouseDecor(st.ruleset, st.housePlan, st.w, st.d, mat);
                for (const spec of decor) {
                    if (over()) break;
                    if (isDoorApproachCell(st, spec.lx, spec.lz)) continue;
                    if (
                        placeInteriorFurnishing(
                            st,
                            dimension,
                            floorCache,
                            hintY,
                            mat,
                            spec,
                            undefined,
                            st.lootCtx
                        )
                    ) {
                        spend(1);
                    }
                }
            }
            if (!over() && st.variant === "church") {
                spend(placeChurchDecor(st, dimension, floorCache, mat, hintY));
            }
            if (!over()) spend(ensureStructureMinimumFurnishings(st, dimension, floorCache, mat, hintY));
            if (!over()) spend(placeFloorPantry(st, dimension, floorCache, mat, hintY));
            st.furnishingsSub = "doors";
            continue;
        }
        if (!over()) spend(ensureStructureDoorwayClear(st, dimension, floorCache, mat, hintY));
        if (!over()) spend(placeDogtrotFenceGates(st, dimension, floorCache, mat, hintY));
        if (!over()) spend(ensureExteriorDoorApproach(st, dimension, floorCache, mat, hintY));
        const plan = getStructureFloorPlan(st);
        const needsLadders =
            structureIsMultiStory(plan) ||
            (st.hasRooftopDeck && st.accessLx !== undefined) ||
            structureHasCellar(st);
        st.phase = needsLadders ? "ladders" : "done";
        break;
    }

    if (st.phase === "ladders") {
        const payload = captureLadderColumnPayload(st, dimension, floorCache, mat, hintY);
        const basementPayload = captureBasementLadderPayload(st, dimension, floorCache, mat, hintY);
        if (job) {
            if (!job.pendingLadderColumns) job.pendingLadderColumns = [];
            if (payload) job.pendingLadderColumns.push(payload);
            if (basementPayload) job.pendingLadderColumns.push(basementPayload);
        }
        st.phase = "done";
    }

    while (!over() && st.phase === "farm") {
        if (st.farmToolI === 0) {
            spend(
                placeRuinedVillageFarmland(
                    dimension,
                    st.originX,
                    st.originZ,
                    st.w,
                    st.d,
                    mat,
                    st.salt,
                    hintY,
                    floorCache
                )
            );
            st.farmToolI = 1;
        }
        st.phase = "repair";
        st.repairCell = 0;
        break;
    }

    return ops;
}

/**
 * @typedef {{
 *   dimension: import("@minecraft/server").Dimension,
 *   centerX: number, centerZ: number, y: number,
 *   ruleset: SettlementRuleset, tier: SettlementTier,
 *   cx: number, cz: number,
 *   pathRadius: number,
 *   workChunkBounds?: { minCx: number, maxCx: number, minCz: number, maxCz: number },
 *   structures: StructureSlot[],
 *   pathCells: PathCell[],
 *   pathIndex: number, structureIndex: number, zombieCount: number,
 *   phase: "ground"|"snow"|"paths"|"bunkers"|"structures"|"structure_retry"|"structure_hold"|"pen"|"well"|"zombies"|"done",
 *   structureRetryIndices?: number[],
 *   structureRetryCursor?: number,
 *   structureSlotStates?: import("./mb_abandonedSettlementStructureRegistry.js").StructureSlotState[],
 *   structureSlotAbandoned?: Set<number>,
 *   structureRetryNoProgress?: number,
 *   structureRetryRelaxed?: boolean,
 *   structureRetryLogKey?: string,
 *   structureSlotRelocated?: Set<number>,
 *   pendingApproachPaths?: PathCell[],
 *   bunkers?: BunkerSite[],
 *   bunkerIndex?: number,
 *   bunkerCellIndex?: number,
 *   useDustedGround: boolean,
 *   useSnowCap: boolean,
 *   groundCells: PathCell[],
 *   groundIndex: number,
 *   snowCells: PathCell[],
 *   snowIndex: number,
 *   snowSubPhase?: "paths"|"roofs",
 *   snowRoofStruct?: number,
 *   snowRoofLx?: number,
 *   snowRoofLz?: number,
 *   singleStructureOnly: boolean,
 *   skipWell: boolean,
 *   skipZombies: boolean,
 *   animalPen?: { ox: number, oz: number, gateFace: number },
 *   penCellIndex: number,
 *   penSpawnDone: boolean,
 *   wellStep: number,
 *   meetingVariant: import("./mb_settlementStructures.js").MeetingVariant,
 *   layoutVariant?: import("./mb_settlementStructures.js").SettlementLayoutVariant,
 *   totalEdits: number,
 *   floorYCache: Map<string, number|undefined>,
 *   activeStructure?: StructureBuildState,
 *   zombieSpawnSkips: number,
 *   stallTicks?: number,
 *   paused?: boolean,
 *   pauseActionBarCooldown?: number,
 *   debugForceLadders?: boolean,
 *   skipProcessor?: boolean,
 *   pendingLadderColumns?: import("./mb_abandonedSettlementBuilder.js").SettlementLadderColumnPayload[],
 *   onComplete: (result: {
 *     placed: boolean,
 *     usedId: string,
 *     totalEdits: number,
 *     pendingLadderColumns?: import("./mb_abandonedSettlementBuilder.js").SettlementLadderColumnPayload[]
 *   }) => void
 * }} BuildJob
 */

/** @type {BuildJob[]} */
const buildQueue = [];

let settlementBuildIntervalId = null;

export function ensureSettlementBuildTickLoop() {
    if (settlementBuildIntervalId != null) return;
    settlementBuildIntervalId = system.runInterval(() => {
        if (buildQueue.length === 0) return;
        try {
            tickSettlementBuildQueue(getSettlementBuildBlocksPerTick());
        } catch {
            /* ignore */
        }
    }, 1);
}

/**
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} budget
 * @returns {number}
 */
function tickAnimalPen(job, dimension, mat, budget) {
    const pen = job.animalPen;
    if (!pen) return 0;
    let spent = 0;
    const cellTotal = ANIMAL_PEN_W * ANIMAL_PEN_D;
    const midLX = Math.floor(ANIMAL_PEN_W / 2);
    const midLZ = Math.floor(ANIMAL_PEN_D / 2);

    while (spent < budget && job.penCellIndex < cellTotal) {
        const idx = job.penCellIndex++;
        const lx = idx % ANIMAL_PEN_W;
        const lz = Math.floor(idx / ANIMAL_PEN_W);
        const wx = job.centerX + pen.ox + lx;
        const wz = job.centerZ + pen.oz + lz;
        const edge = lx === 0 || lx === ANIMAL_PEN_W - 1 || lz === 0 || lz === ANIMAL_PEN_D - 1;
        const isGate =
            (pen.gateFace === 0 && lz === 0 && lx === midLX) ||
            (pen.gateFace === 2 && lz === ANIMAL_PEN_D - 1 && lx === midLX) ||
            (pen.gateFace === 1 && lx === ANIMAL_PEN_W - 1 && lz === midLZ) ||
            (pen.gateFace === 3 && lx === 0 && lz === midLZ);
        const sy = cachedFloorY(job.floorYCache, dimension, wx, wz, mat.log, job.y);
        spent++;
        if (sy === undefined) continue;
        if (!edge) {
            if (trySetBlock(dimension, wx, sy - 1, wz, "minecraft:hay_block", SETTLEMENT_REPLACE_ANY)) {
                job.totalEdits++;
            }
        } else if (!isGate) {
            if (trySetBlock(dimension, wx, sy, wz, mat.fence, SETTLEMENT_REPLACE_ANY)) {
                job.totalEdits++;
            }
        }
    }

    if (spent < budget && job.penCellIndex >= cellTotal && !job.penSpawnDone) {
        job.penSpawnDone = true;
        const ax = job.centerX + pen.ox + midLX;
        const az = job.centerZ + pen.oz + midLZ;
        const ay = cachedFloorY(job.floorYCache, dimension, ax, az, mat.log, job.y);
        spent++;
        if (ay !== undefined) {
            const roll = hashChunkRoll(job.cx, job.cz, 702, 10);
            const mobId =
                roll < 4 ? "minecraft:cow" : roll < 7 ? "minecraft:pig" : "minecraft:sheep";
            try {
                dimension.spawnEntity(mobId, { x: ax + 0.5, y: ay, z: az + 0.5 });
                job.totalEdits += 2;
            } catch {
                /* ignore */
            }
        }
    }

    return spent;
}

/**
 * @param {BuildJob} job
 * @param {number} budget
 */
/**
 * @param {BuildJob} job
 */
function beginSnowOverlayPhase(job) {
    job.snowIndex = 0;
    job.snowSubPhase = "paths";
    job.snowRoofStruct = 0;
    job.snowRoofLx = 0;
    job.snowRoofLz = 0;
}

/**
 * After paths / pen / well — hide bunkers (paths only), then maple snow, then optional zombies.
 * @param {BuildJob} job
 */
function enterPhaseAfterBunkers(job) {
    if (job.useSnowCap && job.snowCells.length > 0) {
        beginSnowOverlayPhase(job);
        job.phase = "snow";
        return;
    }
    if (job.skipZombies) {
        requestSettlementDonePhase(job);
        return;
    }
    job.phase = "zombies";
    job.zombieCount = 0;
    job.zombieSpawnSkips = 0;
}

/**
 * @param {BuildJob} job
 * @param {number} budget
 * @returns {number}
 */
function tickStructureCatalogSigns(job, budget) {
    const manifest = job.catalogManifest;
    if (!manifest?.length) {
        job.phase = "done";
        return 0;
    }
    const dim = job.dimension;
    const floorY = job.y;
    let spent = 0;
    const start = job.catalogSignIndex ?? 0;
    while (spent < budget && start + spent < manifest.length) {
        const entry = manifest[start + spent];
        if (!entry) break;
        const signX = job.centerX + entry.relOx + Math.floor(entry.w / 2);
        const signZ = job.centerZ + entry.boxMinZ - 1;
        trySetBlock(dim, signX, floorY, signZ, "minecraft:grass_block", SETTLEMENT_REPLACE_ANY);
        trySetBlock(dim, signX, floorY + 1, signZ, "minecraft:oak_sign", SETTLEMENT_REPLACE_ANY);
        try {
            const block = dim.getBlock({ x: signX, y: floorY + 1, z: signZ });
            const sign = block?.getComponent("minecraft:sign");
            if (sign?.setText) {
                const shortName =
                    entry.exportName.length > 28 ? entry.exportName.slice(0, 26) + ".." : entry.exportName;
                sign.setText(`[${entry.index}]\n${shortName}`);
            }
        } catch {
            /* optional sign text */
        }
        spent++;
    }
    job.catalogSignIndex = start + spent;
    if ((job.catalogSignIndex ?? 0) >= manifest.length) {
        job.phase = "done";
    }
    return spent;
}

/**
 * After paths / pen / well — hide bunkers on paths first when present, else snow / zombies.
 * @param {BuildJob} job
 */
function enterPhaseAfterSettlementFeatures(job) {
    if ((job.bunkers?.length ?? 0) > 0 && !job.singleStructureOnly) {
        job.phase = "bunkers";
        job.bunkerIndex = job.bunkerIndex ?? 0;
        job.bunkerCellIndex = job.bunkerCellIndex ?? 0;
        return;
    }
    enterPhaseAfterBunkers(job);
}

function phaseAfterMarkerCleanup(job) {
    if (job.structureCatalogMode) return "structures";
    if (job.useDustedGround && job.groundCells.length > 0) return "ground";
    return "paths";
}

/**
 * @param {BuildJob} job
 * @param {number} budget
 * @returns {number}
 */
function tickSettlementSnowPhase(job, budget) {
    const dim = job.dimension;
    const mat = RUIN_MATERIALS_BY_RULESET[job.ruleset] ?? RUIN_MATERIALS_BY_RULESET.plains;
    let spent = 0;
    const sub = job.snowSubPhase ?? "paths";

    if (sub === "paths") {
        while (spent < budget && job.snowIndex < job.snowCells.length) {
            const cell = job.snowCells[job.snowIndex++];
            if (trySetMapleSnowCap(dim, job.centerX + cell.dx, job.centerZ + cell.dz, mat.log, job.y)) {
                spent++;
                job.totalEdits++;
            }
        }
        if (job.snowIndex >= job.snowCells.length) {
            job.snowSubPhase = "roofs";
            job.snowRoofStruct = 0;
            job.snowRoofLx = 0;
            job.snowRoofLz = 0;
        }
        return spent;
    }

    while (spent < budget && (job.snowRoofStruct ?? 0) < job.structures.length) {
        const si = job.snowRoofStruct ?? 0;
        const slot = job.structures[si];
        const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
        const ox = job.centerX + slot.ox;
        const oz = job.centerZ + slot.oz;
        let roofLx = job.snowRoofLx ?? 0;
        let roofLz = job.snowRoofLz ?? 0;
        while (spent < budget && roofLz < fp.d) {
            const wx = ox + roofLx;
            const wz = oz + roofLz;
            const edge = roofLx === 0 || roofLx === fp.w - 1 || roofLz === 0 || roofLz === fp.d - 1;
            const roll = hashChunkRoll(wx, wz, job.cx + job.cz + 831, 100);
            if (roll < (edge ? 78 : 42)) {
                const floorY = cachedFloorY(job.floorYCache, dim, wx, wz, mat.log, job.y);
                if (floorY !== undefined) {
                    const snowY = floorY + fp.wallH;
                    if (
                        trySetBlock(dim, wx, snowY, wz, MAPLE_BEAR_SNOW_LAYER, SETTLEMENT_REPLACE_ANY)
                    ) {
                        spent++;
                        job.totalEdits++;
                    }
                }
            }
            roofLx++;
            if (roofLx >= fp.w) {
                roofLx = 0;
                roofLz++;
            }
        }
        if (roofLz >= fp.d) {
            job.snowRoofStruct = si + 1;
            job.snowRoofLx = 0;
            job.snowRoofLz = 0;
        } else {
            job.snowRoofLx = roofLx;
            job.snowRoofLz = roofLz;
            break;
        }
    }

    if ((job.snowRoofStruct ?? 0) >= job.structures.length) {
        if (job.skipZombies) requestSettlementDonePhase(job);
        else {
            job.phase = "zombies";
            job.zombieCount = 0;
            job.zombieSpawnSkips = 0;
        }
    }
    return spent;
}

/**
 * Remove structure_block / jigsaw left in exported lamp .mcstructure (call when player nears a lamp).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} worldX
 * @param {number} worldZ
 * @returns {number} blocks cleared
 */
function scanWorldgenArtifactsAt(dimension, worldX, worldZ, mutate) {
    const centerX = Math.floor(worldX);
    const centerZ = Math.floor(worldZ);
    const floorY = findBuildSurfaceY(dimension, centerX, centerZ) ?? 64;
    const side = MARKER_CLEANUP_HALF_W * 2 + 1;
    const yMin = floorY - 4;
    const yMax = floorY + MARKER_CLEANUP_HEIGHT + 12;
    let count = 0;
    for (let lx = 0; lx < side; lx++) {
        for (let lz = 0; lz < side; lz++) {
            const dx = lx - MARKER_CLEANUP_HALF_W;
            const dz = lz - MARKER_CLEANUP_HALF_W;
            for (let y = yMin; y <= yMax; y++) {
                try {
                    const b = dimension.getBlock({ x: centerX + dx, y, z: centerZ + dz });
                    if (b && (WORLDGEN_ARTIFACT_IDS.has(b.typeId) || isWorldgenArtifactBlockId(b.typeId))) {
                        if (mutate) b.setType("minecraft:air");
                        count++;
                    }
                } catch {
                    /* unloaded */
                }
            }
        }
    }
    return count;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} worldX
 * @param {number} worldZ
 * @returns {number}
 */
export function countWorldgenArtifactsAt(dimension, worldX, worldZ) {
    return scanWorldgenArtifactsAt(dimension, worldX, worldZ, false);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} worldX
 * @param {number} worldZ
 * @returns {number} blocks cleared
 */
export function clearWorldgenArtifactsAt(dimension, worldX, worldZ) {
    const before = countWorldgenArtifactsAt(dimension, worldX, worldZ);
    if (before === 0) return 0;
    return scanWorldgenArtifactsAt(dimension, worldX, worldZ, true);
}

/**
 * Vertical scan band for lamp exports. Uses surfaceY (not findBuildSurfaceY) so a
 * structure_block above the post does not make the column "invalid" and skip cleanup.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} cx
 * @param {number} cz
 * @param {number} [hintY]
 * @returns {{ yMin: number, yMax: number } | undefined}
 */
function lampArtifactScanVerticalBounds(dimension, cx, cz, hintY) {
    let anchorY =
        hintY != null ? Math.floor(hintY) : surfaceY(dimension, cx, cz);
    if (anchorY == null) anchorY = surfaceY(dimension, cx, cz);
    if (anchorY == null) {
        for (let y = 200; y >= 50; y -= 8) {
            try {
                const b = dimension.getBlock({ x: cx, y, z: cz });
                if (b && b.typeId !== "minecraft:air") {
                    anchorY = y;
                    break;
                }
            } catch {
                return undefined;
            }
        }
    }
    if (anchorY == null) return undefined;

    return {
        yMin: Math.max(-60, anchorY - LAMP_ARTIFACT_Y_BELOW),
        yMax: Math.min(320, anchorY + LAMP_ARTIFACT_Y_ABOVE)
    };
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function tryClearArtifactAt(dimension, x, y, z) {
    let wasArtifact = false;
    try {
        const b = dimension.getBlock({ x, y, z });
        if (!b) return false;
        const id = b.typeId;
        if (!WORLDGEN_ARTIFACT_IDS.has(id) && !isWorldgenArtifactBlockId(id)) return false;
        wasArtifact = true;
        try {
            b.setType("minecraft:air");
        } catch {
            /* setType often fails on structure_block */
        }
        const after = dimension.getBlock({ x, y, z });
        if (after && (WORLDGEN_ARTIFACT_IDS.has(after.typeId) || isWorldgenArtifactBlockId(after.typeId))) {
            dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
        }
        return wasArtifact;
    } catch {
        if (!wasArtifact) {
            try {
                dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
                return true;
            } catch {
                return false;
            }
        }
        return wasArtifact;
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} cx
 * @param {number} cz
 * @param {{ yMin: number, yMax: number }} bounds
 * @param {(x: number, y: number, z: number) => void} visit
 */
function forEachLampArtifactCell(dimension, cx, cz, bounds, visit) {
    for (let y = bounds.yMin; y <= bounds.yMax; y++) {
        for (let dx = -LAMP_ARTIFACT_HALF_W; dx <= LAMP_ARTIFACT_HALF_W; dx++) {
            for (let dz = -LAMP_ARTIFACT_HALF_W; dz <= LAMP_ARTIFACT_HALF_W; dz++) {
                visit(cx + dx, y, cz + dz);
            }
        }
    }
}

/**
 * Clear structure_block / jigsaw along the lamp column (tall lamp exports).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} [hintY] village surface Y near the lamp (improves scan band)
 * @returns {number}
 */
export function clearLampColumnArtifacts(dimension, worldX, worldZ, hintY) {
    const cx = Math.floor(worldX);
    const cz = Math.floor(worldZ);
    const bounds = lampArtifactScanVerticalBounds(dimension, cx, cz, hintY);
    if (!bounds) return 0;
    let cleared = 0;
    forEachLampArtifactCell(dimension, cx, cz, bounds, (x, y, z) => {
        if (tryClearArtifactAt(dimension, x, y, z)) cleared++;
    });
    return cleared;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} [hintY]
 * @returns {number} artifact count, or LAMP_ARTIFACT_COUNT_UNKNOWN if chunk not loaded
 */
export function countLampColumnArtifacts(dimension, worldX, worldZ, hintY) {
    const cx = Math.floor(worldX);
    const cz = Math.floor(worldZ);
    const bounds = lampArtifactScanVerticalBounds(dimension, cx, cz, hintY);
    if (!bounds) return LAMP_ARTIFACT_COUNT_UNKNOWN;
    let count = 0;
    let probed = 0;
    forEachLampArtifactCell(dimension, cx, cz, bounds, (x, y, z) => {
        try {
            const b = dimension.getBlock({ x, y, z });
            if (!b) return;
            probed++;
            if (WORLDGEN_ARTIFACT_IDS.has(b.typeId) || isWorldgenArtifactBlockId(b.typeId)) count++;
        } catch {
            /* unloaded */
        }
    });
    if (probed === 0) return LAMP_ARTIFACT_COUNT_UNKNOWN;
    return count;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} surfaceY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
/**
 * 5×5 well pool with water depth and mossy floor.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} surfaceY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} [poolRadius]
 */
function buildVillageWellPool(dimension, centerX, centerZ, surfaceY, mat, poolRadius = 2) {
    const bottomY = surfaceY - WELL_SHAFT_DEPTH;
    for (let dx = -poolRadius; dx <= poolRadius; dx++) {
        for (let dz = -poolRadius; dz <= poolRadius; dz++) {
            const wx = centerX + dx;
            const wz = centerZ + dz;
            trySetBlock(dimension, wx, bottomY, wz, mat.wallMossy, SETTLEMENT_REPLACE_ANY);
            for (let y = bottomY + 1; y < surfaceY; y++) {
                trySetBlock(dimension, wx, y, wz, "minecraft:water", SETTLEMENT_REPLACE_ANY);
            }
        }
    }
    sealWellPerimeter(dimension, centerX, centerZ, surfaceY, mat, poolRadius);
}

/**
 * Cobble ring around the pool so water does not leak into adjacent soil.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} surfaceY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} [poolRadius]
 */
function sealWellPerimeter(dimension, centerX, centerZ, surfaceY, mat, poolRadius = 2) {
    const bottomY = surfaceY - WELL_SHAFT_DEPTH;
    const outer = poolRadius + 1;
    for (let dx = -outer; dx <= outer; dx++) {
        for (let dz = -outer; dz <= outer; dz++) {
            if (Math.abs(dx) <= poolRadius && Math.abs(dz) <= poolRadius) continue;
            const wx = centerX + dx;
            const wz = centerZ + dz;
            let capY = surfaceY;
            const landY = findBuildSurfaceY(dimension, wx, wz);
            if (landY !== undefined) capY = Math.max(capY, landY);
            for (let y = bottomY; y < capY; y++) {
                trySetBlock(dimension, wx, y, wz, mat.wall, SETTLEMENT_REPLACE_ANY);
            }
            trySetBlock(dimension, wx, capY, wz, mat.wallMossy, SETTLEMENT_REPLACE_ANY);
        }
    }
}

/**
 * Cobble canopy ring above the well (open center) with corner posts.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} surfaceY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 * @param {number} [poolRadius]
 */
function buildVillageWellCanopy(dimension, centerX, centerZ, surfaceY, mat, poolRadius = 2) {
    const canopyY = surfaceY;
    for (let dx = -poolRadius; dx <= poolRadius; dx++) {
        for (let dz = -poolRadius; dz <= poolRadius; dz++) {
            if (dx === 0 && dz === 0) continue;
            trySetBlock(dimension, centerX + dx, canopyY, centerZ + dz, mat.wall, SETTLEMENT_REPLACE_ANY);
            if (hashChunkRoll(centerX + dx, centerZ + dz, 1501, 100) < 35) {
                trySetBlock(
                    dimension,
                    centerX + dx,
                    canopyY + 1,
                    centerZ + dz,
                    mat.wallMossy,
                    SETTLEMENT_REPLACE_ANY
                );
            }
        }
    }
    const postR = poolRadius + 1;
    for (const [dx, dz] of [
        [-postR, -postR],
        [postR, -postR],
        [-postR, postR],
        [postR, postR]
    ]) {
        trySetBlock(dimension, centerX + dx, canopyY, centerZ + dz, mat.log, SETTLEMENT_REPLACE_ANY);
        trySetBlock(dimension, centerX + dx, canopyY + 1, centerZ + dz, mat.fence, SETTLEMENT_REPLACE_ANY);
        trySetBlock(dimension, centerX + dx, canopyY + 2, centerZ + dz, mat.slab, SETTLEMENT_REPLACE_ANY);
    }
}

/**
 * Bell on solid cobble at village center only.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} surfaceY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function placeVillageCenterBell(dimension, wx, wz, surfaceY, mat) {
    trySetBlock(dimension, wx, surfaceY - 1, wz, mat.wall, SETTLEMENT_REPLACE_ANY);
    trySetBlock(dimension, wx, surfaceY, wz, "minecraft:bell", SETTLEMENT_REPLACE_ANY);
}

/**
 * Well pool, cobble canopy, and center bell (meeting point only).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} surfaceY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function buildVillageMeetingCenter(dimension, centerX, centerZ, surfaceY, mat) {
    buildVillageWellPool(dimension, centerX, centerZ, surfaceY, mat, 2);
    buildVillageWellCanopy(dimension, centerX, centerZ, surfaceY, mat, 2);
    placeVillageCenterBell(dimension, centerX + 3, centerZ, surfaceY, mat);
}

/**
 * Stone shrine plaza — lectern, benches, corner posts.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} surfaceY
 * @param {typeof RUIN_MATERIALS_BY_RULESET.plains} mat
 */
function buildVillageShrineCenter(dimension, centerX, centerZ, surfaceY, mat) {
    for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
            const edge = Math.max(Math.abs(dx), Math.abs(dz)) >= 3;
            const wx = centerX + dx;
            const wz = centerZ + dz;
            const floorId = edge ? mat.wallMossy : mat.path;
            trySetBlock(dimension, wx, surfaceY - 1, wz, floorId, SETTLEMENT_REPLACE_ANY);
            if (edge) {
                trySetBlock(dimension, wx, surfaceY, wz, mat.wall, SETTLEMENT_REPLACE_ANY);
                if (Math.abs(dx) === 3 && Math.abs(dz) === 3) {
                    trySetBlock(dimension, wx, surfaceY + 1, wz, mat.fence, SETTLEMENT_REPLACE_ANY);
                    trySetBlock(dimension, wx, surfaceY + 2, wz, mat.slab, SETTLEMENT_REPLACE_ANY);
                }
            }
        }
    }
    trySetBlock(dimension, centerX, surfaceY, centerZ, "minecraft:lectern", SETTLEMENT_REPLACE_ANY);
    trySetBlock(dimension, centerX - 1, surfaceY, centerZ, "minecraft:bookshelf", SETTLEMENT_REPLACE_ANY);
    trySetBlock(dimension, centerX + 1, surfaceY, centerZ, "minecraft:bookshelf", SETTLEMENT_REPLACE_ANY);
    trySetBlock(dimension, centerX, surfaceY, centerZ - 1, mat.stair, SETTLEMENT_REPLACE_ANY);
    trySetBlock(dimension, centerX, surfaceY, centerZ + 1, mat.stair, SETTLEMENT_REPLACE_ANY);
    placeVillageCenterBell(dimension, centerX + 2, centerZ + 2, surfaceY, mat);
}

/**
 * @param {BuildJob} job
 * @param {number} budget
 * @returns {number}
 */
function tickMarkerCleanup(job, budget) {
    const dim = job.dimension;
    const side = MARKER_CLEANUP_HALF_W * 2 + 1;
    let spent = 0;
    while (spent < budget && job.cleanupIndex < MARKER_CLEANUP_VOLUME) {
        const idx = job.cleanupIndex++;
        const lx = idx % side;
        const lz = Math.floor(idx / side) % side;
        const dy = Math.floor(idx / (side * side));
        const dx = lx - MARKER_CLEANUP_HALF_W;
        const dz = lz - MARKER_CLEANUP_HALF_W;
        try {
            const b = dim.getBlock({ x: job.centerX + dx, y: job.y + dy, z: job.centerZ + dz });
            if (b && (WORLDGEN_ARTIFACT_IDS.has(b.typeId) || isWorldgenArtifactBlockId(b.typeId))) {
                b.setType("minecraft:air");
                job.totalEdits++;
            }
        } catch {
            /* unloaded */
        }
        spent++;
    }
    if (job.cleanupIndex >= MARKER_CLEANUP_VOLUME) {
        job.phase = phaseAfterMarkerCleanup(job);
    }
    return spent;
}

/**
 * @param {BuildJob} job
 * @returns {number}
 */
function nearestPlayerDistToSettlement(job) {
    const loc = nearestPlayerLocationToSettlement(job);
    if (!loc) return Infinity;
    const dCenter = Math.max(Math.abs(loc.x - job.centerX), Math.abs(loc.z - job.centerZ));
    if (job.lampWorldX == null || job.lampWorldZ == null) return dCenter;
    const dLamp = Math.max(Math.abs(loc.x - job.lampWorldX), Math.abs(loc.z - job.lampWorldZ));
    return Math.min(dCenter, dLamp);
}

/** No block edits expected — do not treat as BUILD_STALL. */
function shouldCountSettlementBuildStall(job) {
    if (job.paused) return false;
    if (isPlayerInSettlementBuildBand(job)) return false;
    if (!hasMinimumStructuresBuilt(job)) return false;
    const phase = job.phase;
    if (phase === "structure_hold" || phase === "structure_retry" || phase === "done") return false;
    return true;
}

/**
 * @param {BuildJob} job
 * @returns {boolean} true when build work should not run this tick
 */
/**
 * @param {BuildJob} job
 * @param {string} usedId
 */
function finishBuildJobEarly(job, usedId) {
    if (!job || job.finished) return;
    job.finished = true;
    job.phase = "done";
    const siteGx = job.siteGx;
    const siteGz = job.siteGz;
    const siteSub = job.siteSub ?? 0;
    if (siteGx != null && siteGz != null) {
        try {
            clearSitePending(siteGx, siteGz, siteSub);
        } catch {
            /* ignore */
        }
    }
    try {
        job.onComplete({
            placed: false,
            usedId,
            totalEdits: job.totalEdits ?? 0,
            builtStructures: job.builtStructures ?? [],
            buildManifest: buildSettlementCompletionManifest(job)
        });
    } catch {
        /* ignore */
    }
}

/**
 * Stuck cleanup with zero edits — drop from queue without failing site or firing village complete.
 * @param {BuildJob} job
 */
function dropPausedStuckBuildJob(job) {
    if (!job || job.finished) return;
    job.finished = true;
    job.phase = "done";
    const siteGx = job.siteGx;
    const siteGz = job.siteGz;
    const siteSub = job.siteSub ?? 0;
    if (siteGx != null && siteGz != null) {
        try {
            clearSitePending(siteGx, siteGz, siteSub);
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {BuildJob} job
 * @returns {boolean}
 */
function shouldDropPausedStuckBuild(job) {
    if (!job.paused || (job.totalEdits ?? 0) > 0) return false;
    const phase = job.phase;
    if (phase !== "cleanup" && phase !== "structures" && phase !== "structure_hold") return false;
    const pausedTicks = job.pausedStallTicks ?? 0;
    return pausedTicks >= SETTLEMENT_PAUSED_DROP_TICKS;
}

function countSettlementStructuresBuilt(job) {
    if (job.structureSlotStates?.length) {
        return countStructuresBuiltFromStates(job);
    }
    let n = 0;
    for (const row of job.builtStructures ?? []) {
        if (String(row).includes("SKIPPED")) continue;
        n++;
    }
    return n;
}

/**
 * @param {BuildJob} job
 */
function settlementStructureTierFloor(job) {
    if (job.singleStructureOnly) return 1;
    if (job.tier === "hamlet") return 4;
    if (job.tier === "village") return 6;
    return 9;
}

/**
 * After resume or before retry, mark slots that already exist in the world.
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dimension
 */
function seedStructureSlotsFromWorld(job, dimension) {
    const slots = job.structures ?? [];
    if (!slots.length || !dimension) return;
    const seeded = refreshAllStructureSlotsFromWorld(job, footprintForStructure);
    if (seeded > 0) {
        avLogBuildLine(
            `Build resume — ${seeded} structure slot(s) tracked in world (${countSettlementStructuresBuilt(job)} toward minimum) site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}\n${formatStructureRegistrySummary(job)}`
        );
    }
}

/**
 * @param {BuildJob} job
 * @returns {number}
 */
function activeStructureSlotIndex(job) {
    if (job.activeStructureSlotIndex != null) return job.activeStructureSlotIndex;
    return job.structureIndex ?? 0;
}

/**
 * @param {BuildJob} job
 * @param {number} idx
 */
function setActiveStructureForSlot(job, st, idx) {
    job.activeStructure = st;
    job.activeStructureSlotIndex = idx;
}

/**
 * Find a free footprint outside the main ring when the planned slot is blocked.
 * @param {BuildJob} job
 * @param {number} slotIndex
 * @returns {{ ox: number, oz: number }|undefined}
 */
function findRelocatedStructureOffset(job, slotIndex) {
    if (job.structureCatalogMode) return undefined;
    const slot = job.structures[slotIndex];
    if (!slot) return undefined;
    const dim = job.dimension;
    if (!dim) return undefined;
    const tier = job.tier;
    const spread = tier === "hamlet" ? 14 : tier === "village" ? 24 : 30;
    const minRing = tier === "hamlet" ? 11 : tier === "village" ? 15 : 18;
    const { w, d } = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
    const startRing = minRing + Math.floor(spread * 0.55);
    const maxRing = minRing + spread + 12;
    for (let ring = startRing; ring <= maxRing; ring += 2) {
        const steps = Math.max(10, ring + 4);
        for (let s = 0; s < steps; s++) {
            const angle = (2 * Math.PI * (s + slotIndex * 0.17)) / steps;
            const ox = Math.floor(Math.cos(angle) * ring);
            const oz = Math.floor(Math.sin(angle) * ring);
            if (
                structureOverlapsPlaced(
                    job.structures,
                    ox,
                    oz,
                    slot.type,
                    slot.housePlan,
                    job.ruleset,
                    job.lampRelDx,
                    job.lampRelDz
                )
            ) {
                continue;
            }
            const originX = job.centerX + ox;
            const originZ = job.centerZ + oz;
            const midX = originX + Math.floor(w / 2);
            const midZ = originZ + Math.floor(d / 2);
            if (structureSlotHasSettlementEvidence(dim, midX, midZ, job.y, 4)) continue;
            if (!structureFootprintIsBuildable(dim, originX, originZ, w, d, job.y)) continue;
            return { ox, oz };
        }
    }
    return undefined;
}

/**
 * @param {BuildJob} job
 * @param {StructureSlot} slot
 */
function queueApproachPathToSlot(job, slot) {
    const target = structureDoorPathTarget(slot, job.ruleset, job.cx, job.cz);
    if (!job.pendingApproachPaths) job.pendingApproachPaths = [];
    const seen = new Set(job.pendingApproachPaths.map((c) => `${c.dx},${c.dz}`));
    traceManhattanPath(0, 0, target.dx, target.dz, (dx, dz) => {
        const k = `${dx},${dz}`;
        if (seen.has(k)) return;
        seen.add(k);
        job.pendingApproachPaths.push({ dx, dz });
    });
}

/**
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dim
 * @param {ReturnType<typeof RUIN_MATERIALS_BY_RULESET.plains>} mat
 * @param {number} budget
 * @returns {number}
 */
function tickPendingApproachPaths(job, dim, mat, budget) {
    const pending = job.pendingApproachPaths;
    if (!pending?.length) return 0;
    let spent = 0;
    while (spent < budget && pending.length > 0) {
        const cell = pending.shift();
        if (!cell) break;
        if (pathCellOverlapsLampMarker(job.lampRelDx, job.lampRelDz, cell.dx, cell.dz)) continue;
        const wx = job.centerX + cell.dx;
        const wz = job.centerZ + cell.dz;
        const plaza = Math.max(Math.abs(cell.dx), Math.abs(cell.dz)) <= SETTLEMENT_PLAZA_RADIUS;
        const pathBlock = pickSettlementPathBlock(
            mat,
            job.ruleset,
            wx,
            wz,
            plaza ? job.cx + job.cz + 500 : cell.dx * 13 + cell.dz * 29 + 89
        );
        if (trySetGround(dim, wx, wz, pathBlock, SETTLEMENT_REPLACE_ANY, mat.log, job.y)) {
            spent++;
            job.totalEdits++;
        }
    }
    return spent;
}

/**
 * Move a blocked slot outward and queue a plaza path to its door.
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dim
 * @param {number} slotIndex
 * @returns {boolean} true when relocated
 */
function tryRelocateStructureSlot(job, dim, slotIndex) {
    if (job.structureCatalogMode) return false;
    if (job.structureSlotRelocated?.has(slotIndex)) return false;
    const slot = job.structures[slotIndex];
    if (!slot) return false;
    const alt = findRelocatedStructureOffset(job, slotIndex);
    if (!alt) return false;
    if (!job.structureSlotRelocated) job.structureSlotRelocated = new Set();
    job.structureSlotRelocated.add(slotIndex);
    const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
    slot.ox = alt.ox;
    slot.oz = alt.oz;
    slot.door = doorFacingPlaza(slot.ox, slot.oz, fp.w, fp.d);
    queueApproachPathToSlot(job, slot);
    avLogBuildLine(
        `Build relocated slot ${slotIndex + 1} (${slot.type}) → offset ${alt.ox},${alt.oz} + approach path site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
    );
    return true;
}

/**
 * If the planned slot is already built, record it. Otherwise relocate when footprint is blocked.
 * @returns {boolean} true when no build is needed this slot
 */
function ensureStructureSlotReadyForBuild(job, dim, idx) {
    const slot = job.structures[idx];
    if (!slot) return true;
    if (structureSlotShouldSkipBuild(job, idx, slot, dim, footprintForStructure)) {
        const state = getStructureSlotState(job, idx);
        if (state && !state.label) {
            recordStructureSlotOutcome(
                job,
                idx,
                slot,
                `${formatSettlementStructureLabel(slot, job, idx, undefined)} · existing`,
                { alreadyPresent: true }
            );
        }
        return true;
    }
    const originX = job.centerX + slot.ox;
    const originZ = job.centerZ + slot.oz;
    const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
    if (
        !job.structureCatalogMode &&
        !job.structureSlotRelocated?.has(idx) &&
        !structureFootprintIsBuildable(dim, originX, originZ, fp.w, fp.d, job.y)
    ) {
        tryRelocateStructureSlot(job, dim, idx);
    }
    return false;
}

/**
 * @param {BuildJob} job
 */
function minimumStructuresRequired(job) {
    const planned = job.structures?.length ?? 0;
    if (planned <= 0) return 1;
    if (job.structureCatalogMode) return planned;
    if (job.singleStructureOnly) return 1;
    const tierFloor = job.tier === "hamlet" ? 4 : job.tier === "village" ? 6 : 9;
    const need = Math.max(tierFloor, Math.ceil(planned * 0.8));
    return Math.min(planned, need);
}

/**
 * @param {BuildJob} job
 */
/**
 * First slot that still needs placement or ladder work.
 * @param {BuildJob} job
 * @returns {number}
 */
function findFirstStructureSlotNeedingWork(job) {
    const n = job.structures?.length ?? 0;
    for (let i = 0; i < n; i++) {
        const state = getStructureSlotState(job, i);
        if (!state || state.status === "pending") return i;
        if (state.status === "skipped") return i;
        if (state.ladders === "needed" || state.ladders === "pending") return i;
    }
    return n;
}

function hasMinimumStructuresBuilt(job) {
    if (job.structureCatalogMode) {
        const n = job.structures?.length ?? 0;
        if (n === 0) return false;
        if ((job.structureIndex ?? 0) >= n && !job.activeStructure) return true;
    }
    const placed = countSettlementStructuresBuilt(job);
    const need = minimumStructuresRequired(job);
    if (placed >= need) return true;
    if (job.structureRetryRelaxed === true) {
        const floor = settlementStructureTierFloor(job);
        return placed >= Math.min(job.structures?.length ?? 0, floor);
    }
    return false;
}

/**
 * @param {BuildJob} job
 */
function prepareStructureRetry(job) {
    /** @type {number[]} */
    const retry = [];
    const abandoned = job.structureSlotAbandoned ?? new Set();
    const dim = job.dimension;
    for (let i = 0; i < job.structures.length; i++) {
        if (abandoned.has(i)) continue;
        const state = getStructureSlotState(job, i);
        if (state && structureSlotCountsAsBuilt(state)) continue;
        if (state?.status === "skipped") {
            /* may relocate */
        } else if (dim && ensureStructureSlotReadyForBuild(job, dim, i)) continue;
        retry.push(i);
    }
    retry.sort((ia, ib) => {
        const sa = job.structures[ia];
        const sb = job.structures[ib];
        if (!sa || !sb) return 0;
        return (
            chebyshevFromLampOffset(sa.ox, sa.oz, job.lampRelDx, job.lampRelDz) -
            chebyshevFromLampOffset(sb.ox, sb.oz, job.lampRelDx, job.lampRelDz)
        );
    });
    job.structureRetryIndices = retry;
    job.structureRetryCursor = 0;
    job.activeStructure = undefined;
}

/**
 * @param {BuildJob} job
 */
/**
 * @param {BuildJob} job
 * @param {number} placedBefore
 */
function noteStructureRetryCycleResult(job, placedBefore) {
    const placedAfter = countSettlementStructuresBuilt(job);
    if (placedAfter > placedBefore) {
        job.structureRetryNoProgress = 0;
        return;
    }
    const streak = (job.structureRetryNoProgress ?? 0) + 1;
    job.structureRetryNoProgress = streak;
    if (streak < 2) return;
    const abandoned = job.structureSlotAbandoned ?? new Set();
    for (const idx of job.structureRetryIndices ?? []) {
        abandoned.add(idx);
    }
    job.structureSlotAbandoned = abandoned;
    job.structureRetryRelaxed = true;
    job.structureRetryIndices = undefined;
    avLogBuildLine(
        `Build structure retry — no progress after ${streak} pass(es); advancing with ${placedAfter} placed (tier floor ${settlementStructureTierFloor(job)}) site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
    );
}

function enterStructureRetryOrHold(job) {
    if ((job.structureRetryIndices?.length ?? 0) === 0) {
        prepareStructureRetry(job);
    }
    if ((job.structureRetryIndices?.length ?? 0) > 0) {
        job.phase = "structure_retry";
        job.activeStructure = undefined;
        const key = job.structureRetryIndices.join(",");
        if (job.structureRetryLogKey !== key) {
            job.structureRetryLogKey = key;
            avLogBuildLine(
                `Build structure retry — need ${minimumStructuresRequired(job)} placed, have ${countSettlementStructuresBuilt(job)}, retrying ${job.structureRetryIndices.length} slot(s) site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
            );
        }
        return;
    }
    if (hasMinimumStructuresBuilt(job)) {
        if (job.structureCatalogMode) {
            job.phase = "catalog_signs";
            job.catalogSignIndex = 0;
        } else {
            job.phase = "well";
            job.wellStep = 0;
        }
        return;
    }
    job.phase = "structure_hold";
    const holdKey = `hold:${countSettlementStructuresBuilt(job)}`;
    if (job.structureRetryLogKey !== holdKey) {
        job.structureRetryLogKey = holdKey;
        avLogBuildLine(
            `Build structure hold — need ${minimumStructuresRequired(job)} placed, have ${countSettlementStructuresBuilt(job)} (waiting / abandoned slots) site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
        );
    }
}

/**
 * Advance to paths/well/zombies only after enough buildings; otherwise retry SKIPPED slots.
 * @param {BuildJob} job
 * @returns {boolean} true when caller may continue past the structures phase
 */
function tryAdvancePastStructuresPhase(job) {
    if (hasMinimumStructuresBuilt(job)) return true;
    if (job.phase === "structure_retry") return false;
    enterStructureRetryOrHold(job);
    return false;
}

/**
 * @param {BuildJob} job
 */
function requestSettlementDonePhase(job) {
    if (job.stallAborted) {
        job.phase = "done";
        return;
    }
    if (!hasMinimumStructuresBuilt(job)) {
        enterStructureRetryOrHold(job);
        return;
    }
    job.phase = "done";
}

/**
 * @param {BuildJob} job
 * @param {import("@minecraft/server").Dimension} dim
 * @param {ReturnType<typeof RUIN_MATERIALS_BY_RULESET.plains>} mat
 * @param {number} budget
 * @returns {number}
 */
function tickStructureRetryPhase(job, dim, mat, budget) {
    let spent = 0;
    const indices = job.structureRetryIndices ?? [];
    const placedBeforeCycle = countSettlementStructuresBuilt(job);
    spent += tickPendingApproachPaths(job, dim, mat, budget - spent);

    while (spent < budget && (job.structureRetryCursor ?? 0) < indices.length) {
        const idx = indices[job.structureRetryCursor ?? 0];
        const slot = job.structures[idx];
        if (!slot) {
            job.structureRetryCursor = (job.structureRetryCursor ?? 0) + 1;
            continue;
        }
        if (ensureStructureSlotReadyForBuild(job, dim, idx)) {
            job.structureRetryCursor = (job.structureRetryCursor ?? 0) + 1;
            job.activeStructure = undefined;
            continue;
        }
        spent += tickPendingApproachPaths(job, dim, mat, budget - spent);
        if (spent >= budget) break;
        if (!job.activeStructure) {
            setActiveStructureForSlot(
                job,
                beginStructureBuild(slot, job, structureBuildSaltForSlot(job, idx), dim, mat),
                idx
            );
        }
        if (job.activeStructure?.phase === "waiting_chunks") {
            const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
            const ox = job.centerX + slot.ox;
            const oz = job.centerZ + slot.oz;
            if (!structureFootprintChunksLoaded(dim, ox, oz, fp.w, fp.d, job.y)) {
                break;
            }
            setActiveStructureForSlot(
                job,
                beginStructureBuild(slot, job, structureBuildSaltForSlot(job, idx), dim, mat),
                idx
            );
        }
        const n = tickStructureBuild(
            job.activeStructure,
            dim,
            mat,
            job.floorYCache,
            job.y,
            budget - spent,
            job
        );
        job.totalEdits += n;
        spent += n;
        if (job.activeStructure.phase === "waiting_chunks") break;
        if (job.activeStructure.phase !== "done") break;
        if (job.activeStructure.alreadyPresent === true) {
            recordStructureSlotOutcome(
                job,
                idx,
                slot,
                formatSettlementStructureLabel(slot, job, idx, job.activeStructure),
                job.activeStructure
            );
            job.structureRetryCursor = (job.structureRetryCursor ?? 0) + 1;
            job.activeStructure = undefined;
            break;
        }
        if (job.activeStructure.skippedFooting) {
            if (!job.structureCatalogMode && tryRelocateStructureSlot(job, dim, idx)) {
                job.activeStructure = undefined;
                break;
            }
            recordStructureSlotOutcome(
                job,
                idx,
                slot,
                formatSettlementStructureLabel(slot, job, idx, job.activeStructure),
                job.activeStructure
            );
        } else {
            recordStructureSlotOutcome(
                job,
                idx,
                slot,
                formatSettlementStructureLabel(slot, job, idx, job.activeStructure),
                job.activeStructure
            );
        }
        job.structureRetryCursor = (job.structureRetryCursor ?? 0) + 1;
        job.activeStructure = undefined;
        break;
    }
    if ((job.structureRetryCursor ?? 0) >= indices.length) {
        noteStructureRetryCycleResult(job, placedBeforeCycle);
        job.structureRetryIndices = undefined;
        if (hasMinimumStructuresBuilt(job)) {
            if (job.animalPen) {
                job.phase = "pen";
                job.penCellIndex = 0;
                job.penSpawnDone = false;
            } else {
                job.phase = "well";
                job.wellStep = 0;
            }
        } else {
            enterStructureRetryOrHold(job);
        }
    }
    return spent;
}

/**
 * Real village complete — not cleanup-only, aborted early, or mostly skipped footprints.
 * @param {BuildJob} job
 * @returns {boolean}
 */
/** @type {Map<string, number>} */
const completionWaitLogTick = new Map();
const COMPLETION_WAIT_LOG_COOLDOWN = 120;

/**
 * Jobs still in queue for onComplete but not actively placing blocks.
 * @param {BuildJob} job
 * @returns {boolean}
 */
function isJobAwaitingWitnessFinalize(job) {
    return !!job && !job.finished && job.phase === "done";
}

/**
 * @param {BuildJob} job
 * @returns {boolean}
 */
function isJobActivelyBuilding(job) {
    if (!job || job.finished) return false;
    return !isJobAwaitingWitnessFinalize(job);
}

/**
 * @param {BuildJob} job
 * @param {number} idx
 * @param {StructureSlot} slot
 * @param {string} kind
 * @param {string} [detail]
 */
function logStructureBuildProgress(job, idx, slot, kind, detail = "") {
    const label = formatSettlementStructureLabel(slot, job, idx, undefined);
    const wx = Math.floor(job.centerX + slot.ox);
    const wz = Math.floor(job.centerZ + slot.oz);
    const built = countSettlementStructuresBuilt(job);
    const planned = job.structures?.length ?? 0;
    const site =
        job.siteGx != null
            ? ` site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
            : "";
    const extra = detail ? ` — ${detail}` : "";
    avLogBuildLine(
        `Structure ${kind}: ${label} @ ${wx},${Math.floor(job.y)},${wz} (${built}/${planned} placed) phase=${job.phase}${site}${extra}`
    );
}

/**
 * @param {BuildJob} job
 * @param {number} idx
 * @param {string} kind
 */
function logStructureBuildProgressOnce(job, idx, kind) {
    if (!job.structureLogOnce) job.structureLogOnce = new Set();
    const key = `${kind}:${idx}`;
    if (job.structureLogOnce.has(key)) return;
    job.structureLogOnce.add(key);
    const slot = job.structures[idx];
    if (!slot) return;
    logStructureBuildProgress(job, idx, slot, kind);
}

function settlementBuildCountsAsPlaced(job) {
    if (job.stallAborted) return false;
    if ((job.totalEdits ?? 0) < 12) return false;
    const planned = job.structures?.length ?? 0;
    const placed = countSettlementStructuresBuilt(job);
    if (job.singleStructureOnly) return placed >= 1;
    if (planned <= 0) return false;
    const tierFloor = job.tier === "hamlet" ? 4 : job.tier === "village" ? 6 : 9;
    const need = Math.max(tierFloor, Math.ceil(planned * 0.8));
    return placed >= Math.min(planned, need);
}

/**
 * Defer finalizing until a player is near (build can reach phase done while you walk away).
 * @param {BuildJob} job
 * @returns {boolean}
 */
function shouldDeferSettlementBuildCompletion(job) {
    if (job.stallAborted) return false;
    const dist = nearestPlayerDistToSettlement(job);
    if (!Number.isFinite(dist)) return true;
    return dist > SETTLEMENT_BUILD_PAUSE_DIST;
}

/**
 * @param {BuildJob} job
 * @param {boolean} paused
 * @param {number|undefined} dist
 */
function logSettlementBuildPresence(job, paused, dist) {
    const site =
        job.siteGx != null
            ? ` site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
            : "";
    const distTxt = Number.isFinite(dist) ? `${Math.floor(dist)}ch` : "no overworld players";
    const reason = !Number.isFinite(dist)
        ? "world empty"
        : dist > SETTLEMENT_BUILD_PAUSE_DIST
          ? "left village band"
          : "in range";
    avLogBuildLine(
        `Build ${paused ? "PAUSED" : "RESUMED"} (${reason}, ${distTxt}) phase=${job.phase} edits=${job.totalEdits ?? 0}${site}`
    );
}

/**
 * Persist partial progress so lamp return resumes the same center (not a second village).
 * @param {BuildJob} job
 */
function noteBuildPausedForSite(job) {
    const gx = job.siteGx;
    const gz = job.siteGz;
    if (gx == null || gz == null || job.finished) return;
    if ((job.totalEdits ?? 0) < 1) return;
    try {
        markSiteIncomplete(gx, gz, job.siteSub ?? 0, {
            x: job.centerX,
            y: job.y,
            z: job.centerZ
        });
        const manifest = exportJobStructureManifest(job);
        if (manifest) setSiteStructureManifest(gx, gz, job.siteSub ?? 0, manifest);
    } catch {
        /* ignore */
    }
}

/**
 * Advance structure phase when world already has enough footprints (resume / return).
 * @param {BuildJob} job
 */
function tryAdvanceStuckStructuresPhase(job) {
    if (!hasMinimumStructuresBuilt(job)) return;
    if (job.phase === "structures" && (job.structureIndex ?? 0) >= (job.structures?.length ?? 0)) {
        job.activeStructure = undefined;
        if (!tryAdvancePastStructuresPhase(job)) {
            if (job.animalPen) {
                job.phase = "pen";
                job.penCellIndex = 0;
                job.penSpawnDone = false;
            } else {
                job.phase = "well";
                job.wellStep = 0;
            }
        }
    } else if (job.phase === "structure_hold") {
        if (job.animalPen) {
            job.phase = "pen";
            job.penCellIndex = 0;
            job.penSpawnDone = false;
        } else {
            job.phase = "well";
            job.wellStep = 0;
        }
    }
}

/**
 * Unpause and re-sync structure progress when the player returns (lamp / horizon).
 * @param {BuildJob} job
 * @returns {boolean}
 */
export function wakeSettlementBuildJob(job) {
    if (!job || job.finished) return false;
    const wasPaused = job.paused === true;
    job.paused = false;
    job.lastLoggedPaused = false;
    job.pausedStallTicks = 0;
    job.stallTicks = 0;
    const dim = job.dimension;
    if (
        dim &&
        (job.phase === "structures" ||
            job.phase === "structure_hold" ||
            job.phase === "structure_retry")
    ) {
        refreshAllStructureSlotsFromWorld(job, footprintForStructure);
        const next = findFirstStructureSlotNeedingWork(job);
        if (job.activeStructure) {
            job.activeStructureSlotIndex = activeStructureSlotIndex(job);
        } else if (next < (job.structures?.length ?? 0)) {
            job.structureIndex = next;
        }
        tryAdvanceStuckStructuresPhase(job);
    }
    avLogBuildLine(
        `Build wake site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0} phase=${job.phase} slot=${activeStructureSlotIndex(job) + 1}/${job.structures?.length ?? 0} structures=${countSettlementStructuresBuilt(job)}/${job.structures?.length ?? 0} edits=${job.totalEdits ?? 0}${wasPaused ? " (was paused)" : ""}`
    );
    return true;
}

/**
 * Unpause the in-progress build at this settlement center (HUD return / lamp).
 * @param {string} dimId
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 * @returns {boolean}
 */
export function tryWakeSettlementBuildAtCenter(dimId, centerX, centerY, centerZ) {
    for (const job of buildQueue) {
        if (!isJobActivelyBuilding(job)) continue;
        if (job.dimension?.id !== dimId) continue;
        if (Math.abs(job.centerX - centerX) >= 2) continue;
        if (Math.abs((job.y ?? centerY) - centerY) >= 4) continue;
        if (Math.abs(job.centerZ - centerZ) >= 2) continue;
        return wakeSettlementBuildJob(job);
    }
    return false;
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 * @returns {boolean}
 */
export function abortSettlementBuildForSite(gx, gz, subIndex = 0) {
    for (let i = buildQueue.length - 1; i >= 0; i--) {
        const job = buildQueue[i];
        if (!job || job.finished) continue;
        if (job.siteGx !== gx || job.siteGz !== gz || (job.siteSub ?? 0) !== subIndex) continue;
        finishBuildJobEarly(job, "script:site_reset");
        buildQueue.splice(i, 1);
        return true;
    }
    return false;
}

/** Drop in-memory builds for every slot in a site grid cell (dev site reset). */
export function abortSettlementBuildsForSiteCell(gx, gz) {
    let n = 0;
    for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
        if (abortSettlementBuildForSite(gx, gz, sub)) n++;
    }
    return n;
}

/** Persist incomplete centers + manifests when the last player leaves (reload-safe). */
export function persistActiveSettlementBuildsForUnload() {
    for (const job of buildQueue) {
        if (!job || job.finished) continue;
        if ((job.totalEdits ?? 0) < 1) continue;
        noteBuildPausedForSite(job);
    }
}

/**
 * @param {BuildJob} job
 */
function updateSettlementBuildPauseState(job) {
    const dist = nearestPlayerDistToSettlement(job);
    const noPlayers = !Number.isFinite(dist);
    const wasPaused = job.paused === true;

    if (wasPaused) {
        if ((job.totalEdits ?? 0) === 0) {
            job.pausedStallTicks = (job.pausedStallTicks ?? 0) + 1;
        }
        if (!noPlayers && dist <= SETTLEMENT_BUILD_RESUME_DIST) {
            job.paused = false;
            job.stallTicks = 0;
            job.pausedStallTicks = 0;
            job.pauseActionBarCooldown = 0;
            if (job.lastLoggedPaused !== false) {
                job.lastLoggedPaused = false;
                logSettlementBuildPresence(job, false, dist);
            }
            if (!noPlayers) {
                tickSettlementResumeHud(job);
            }
            return false;
        }
        job.paused = true;
        if (job.lastLoggedPaused !== true) {
            job.lastLoggedPaused = true;
            logSettlementBuildPresence(job, true, dist);
        }
        return true;
    }
    job.pausedStallTicks = 0;
    if (noPlayers || dist > SETTLEMENT_BUILD_PAUSE_DIST) {
        job.paused = true;
        noteBuildPausedForSite(job);
        if (job.lastLoggedPaused !== true) {
            job.lastLoggedPaused = true;
            logSettlementBuildPresence(job, true, dist);
        }
        return true;
    }
    if (job.lastLoggedPaused === true) {
        job.lastLoggedPaused = false;
        logSettlementBuildPresence(job, false, dist);
    }
    return false;
}

/**
 * Finish queue job — may defer if no player is near or everyone left the world.
 * @param {BuildJob} job
 */
function finalizeSettlementBuildJob(job) {
    if (job.finished) return;
    if (shouldDeferSettlementBuildCompletion(job)) {
        job.paused = true;
        const dist = nearestPlayerDistToSettlement(job);
        const distTxt = Number.isFinite(dist) ? `${Math.floor(dist)}ch` : "no players";
        const site =
            job.siteGx != null
                ? `${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
                : "?";
        const logKey = site;
        const now = system.currentTick;
        const last = completionWaitLogTick.get(logKey) ?? 0;
        if (now - last >= COMPLETION_WAIT_LOG_COOLDOWN) {
            completionWaitLogTick.set(logKey, now);
            const built = countSettlementStructuresBuilt(job);
            const planned = job.structures?.length ?? 0;
            avLogBuildLine(
                `Build finished off-site (${distTxt}) — ${built}/${planned} structures, edits=${job.totalEdits ?? 0} site=${site}; return within ${SETTLEMENT_BUILD_PAUSE_DIST}ch for wrap-up (not still generating)`
            );
        }
        return;
    }
    job.finished = true;
    job.paused = false;
    const placed = settlementBuildCountsAsPlaced(job);
    const built = countSettlementStructuresBuilt(job);
    const planned = job.structures?.length ?? 0;
    const dist = nearestPlayerDistToSettlement(job);
    const distTxt = Number.isFinite(dist) ? `${Math.floor(dist)}ch` : "no players";
    const outcome = placed
        ? "success"
        : job.stallAborted
          ? "stalled"
          : `incomplete (player ${distTxt} from site — not a leave-world pause)`;
    avLogBuildLine(
        `Build completion FINAL ${outcome} placed=${placed} structures=${built}/${planned} edits=${job.totalEdits ?? 0} site=${job.siteGx},${job.siteGz},${job.siteSub ?? 0}`
    );
    const buildManifest = buildSettlementCompletionManifest(job);
    job.onComplete({
        placed,
        usedId: job.stallAborted ? `script:${job.tier}_stalled` : `script:${job.tier}_settlement`,
        totalEdits: job.totalEdits,
        pendingLadderColumns: job.pendingLadderColumns ?? [],
        builtStructures: job.builtStructures ?? [],
        buildManifest,
        structureManifest: exportJobStructureManifest(job)
    });
}

/**
 * @param {BuildJob} job
 */
function tickSettlementPausedHud(_job) {
    /* Paused line uses merged HUD in mb_abandonedVillageNotify.js (SETTLEMENT_BUILD slot). */
}

/**
 * @param {BuildJob} job
 */
function tickSettlementResumeHud(job) {
    const dimId = job.dimension?.id;
    for (const player of world.getAllPlayers()) {
        if (!player?.isValid) continue;
        try {
            if (player.dimension?.id !== dimId) continue;
            const dist = Math.max(
                Math.abs(player.location.x - job.centerX),
                Math.abs(player.location.z - job.centerZ)
            );
            if (dist > SETTLEMENT_BUILD_RESUME_DIST + 16) continue;
            player.onScreenDisplay?.setActionBar?.("§aVillage construction resumed");
        } catch {
            /* ignore */
        }
    }
}

function tickBuildJob(job, budget) {
    if (job.finished) return;
    if (job.phase === "done") {
        finalizeSettlementBuildJob(job);
        return;
    }
    if (shouldDropPausedStuckBuild(job)) {
        dropPausedStuckBuildJob(job);
        return;
    }
    if (updateSettlementBuildPauseState(job)) {
        job.stallTicks = 0;
        tickSettlementPausedHud(job);
        return;
    }
    if (!job.lampArtifactDone && job.lampWorldX != null && job.lampWorldZ != null) {
        clearLampWorldgenArtifactsOnly(job, job.dimension);
    }
    if (shouldCountSettlementBuildStall(job)) {
        if (job.lastEditCount !== job.totalEdits) {
            job.lastEditCount = job.totalEdits;
            job.stallTicks = 0;
        } else {
            job.stallTicks = (job.stallTicks ?? 0) + 1;
            if (job.stallTicks > 800) {
                job.phase = "done";
                job.stallAborted = true;
            }
        }
    } else {
        job.stallTicks = 0;
    }
    const dim = job.dimension;
    const mat = RUIN_MATERIALS_BY_RULESET[job.ruleset] ?? RUIN_MATERIALS_BY_RULESET.plains;
    let spent = 0;

    if (job.phase === "cleanup") {
        spent += tickMarkerCleanup(job, budget - spent);
        if (spent >= budget) return;
    }

    while (spent < budget && job.phase === "ground") {
        if (job.groundIndex >= job.groundCells.length) {
            job.phase = "paths";
            job.groundIndex = 0;
            break;
        }
        const cell = job.groundCells[job.groundIndex++];
        if (pathCellOverlapsLampMarker(job.lampRelDx, job.lampRelDz, cell.dx, cell.dz)) {
            continue;
        }
        if (trySetInfectedPadFooting(dim, job.centerX + cell.dx, job.centerZ + cell.dz, mat, mat.log, job.y)) {
            spent++;
            job.totalEdits++;
        }
    }

    if (job.phase === "snow") {
        spent += tickSettlementSnowPhase(job, budget - spent);
        if (spent >= budget) return;
    }

    if (job.phase === "catalog_signs") {
        spent += tickStructureCatalogSigns(job, budget - spent);
        if (spent >= budget) return;
    }

    while (spent < budget && job.phase === "paths") {
        if (job.pathIndex >= job.pathCells.length) {
            job.phase = "structures";
            job.pathIndex = 0;
            job.structureIndex = 0;
            break;
        }
        const cell = job.pathCells[job.pathIndex++];
        if (pathCellOverlapsLampMarker(job.lampRelDx, job.lampRelDz, cell.dx, cell.dz)) {
            continue;
        }
        const wx = job.centerX + cell.dx;
        const wz = job.centerZ + cell.dz;
        const plaza = Math.max(Math.abs(cell.dx), Math.abs(cell.dz)) <= SETTLEMENT_PLAZA_RADIUS;
        const pathBlock = pickSettlementPathBlock(
            mat,
            job.ruleset,
            wx,
            wz,
            plaza ? job.cx + job.cz + 500 : cell.dx * 13 + cell.dz * 29 + 89
        );
        if (trySetGround(dim, wx, wz, pathBlock, SETTLEMENT_REPLACE_ANY, mat.log, job.y)) {
            spent++;
            job.totalEdits++;
        }
    }

    if (spent < budget && job.phase === "structures") {
        const pendingIdx = findFirstStructureSlotNeedingWork(job);
        if (
            !job.activeStructure &&
            (job.structureIndex ?? 0) >= (job.structures?.length ?? 0) &&
            pendingIdx < (job.structures?.length ?? 0)
        ) {
            job.structureIndex = pendingIdx;
        }
        if (!job.activeStructure && job.structureIndex < job.structures.length) {
            if (ensureStructureSlotReadyForBuild(job, dim, job.structureIndex)) {
                job.structureIndex++;
            }
        }
        if (!job.activeStructure) {
            if (job.structureIndex >= job.structures.length) {
                if (!tryAdvancePastStructuresPhase(job)) {
                    /* hold / retry */
                } else if (job.structureCatalogMode) {
                    job.phase = "catalog_signs";
                    job.catalogSignIndex = 0;
                } else if (job.singleStructureOnly) {
                    if (job.animalPen) {
                        job.phase = "pen";
                        job.penCellIndex = 0;
                        job.penSpawnDone = false;
                    } else {
                        enterPhaseAfterSettlementFeatures(job);
                    }
                } else if (job.animalPen) {
                    job.phase = "pen";
                    job.penCellIndex = 0;
                    job.penSpawnDone = false;
                } else {
                    job.phase = "well";
                    job.wellStep = 0;
                }
            } else {
                const idx = job.structureIndex;
                const slot = job.structures[idx];
                if (
                    slot &&
                    !structureSlotShouldSkipBuild(job, idx, slot, dim, footprintForStructure)
                ) {
                    setActiveStructureForSlot(
                        job,
                        beginStructureBuild(slot, job, structureBuildSaltForSlot(job, idx), dim, mat),
                        idx
                    );
                    if (job.activeStructure?.phase === "waiting_chunks") {
                        logStructureBuildProgressOnce(job, idx, "WAIT chunks");
                    } else if (job.activeStructure?.alreadyPresent) {
                        logStructureBuildProgress(job, idx, slot, "EXISTING");
                    } else if (job.activeStructure?.skippedFooting) {
                        logStructureBuildProgress(job, idx, slot, "SKIP footing");
                    } else if (job.activeStructure) {
                        logStructureBuildProgress(job, idx, slot, "START");
                    }
                } else if (slot) {
                    job.structureIndex++;
                }
            }
        }
        if (job.activeStructure) {
            if (job.activeStructure.phase === "waiting_chunks") {
                const idx = activeStructureSlotIndex(job);
                const slot = job.structures[idx];
                if (slot) {
                    const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
                    const ox = job.centerX + slot.ox;
                    const oz = job.centerZ + slot.oz;
                    if (structureFootprintChunksLoaded(dim, ox, oz, fp.w, fp.d, job.y)) {
                        setActiveStructureForSlot(
                            job,
                            beginStructureBuild(slot, job, structureBuildSaltForSlot(job, idx), dim, mat),
                            idx
                        );
                        if (job.activeStructure?.phase !== "waiting_chunks") {
                            logStructureBuildProgress(job, idx, slot, "RESUME chunks");
                        }
                    } else if (isPlayerInSettlementBuildBand(job)) {
                        logStructureBuildProgressOnce(job, idx, "WAIT chunks (still loading)");
                    }
                }
            }
            const n = tickStructureBuild(
                job.activeStructure,
                dim,
                mat,
                job.floorYCache,
                job.y,
                budget - spent,
                job
            );
            job.totalEdits += n;
            spent += n;
            if (job.activeStructure.phase === "done") {
                const idx = activeStructureSlotIndex(job);
                const slot = job.structures[idx];
                if (slot) {
                    if (
                        !job.activeStructure.alreadyPresent &&
                        !job.activeStructure.skippedFooting
                    ) {
                        logStructureBuildProgress(job, idx, slot, "DONE");
                    }
                    if (job.activeStructure.alreadyPresent === true) {
                        recordStructureSlotOutcome(
                            job,
                            idx,
                            slot,
                            formatSettlementStructureLabel(slot, job, idx, job.activeStructure),
                            job.activeStructure
                        );
                    } else if (job.activeStructure.skippedFooting) {
                        if (job.structureCatalogMode || !tryRelocateStructureSlot(job, dim, idx)) {
                            recordStructureSlotOutcome(
                                job,
                                idx,
                                slot,
                                formatSettlementStructureLabel(slot, job, idx, job.activeStructure),
                                job.activeStructure
                            );
                            job.structureIndex++;
                        }
                        job.activeStructure = undefined;
                        return;
                    } else {
                        recordStructureSlotOutcome(
                            job,
                            idx,
                            slot,
                            formatSettlementStructureLabel(slot, job, idx, job.activeStructure),
                            job.activeStructure
                        );
                    }
                }
                job.structureIndex = idx + 1;
                job.activeStructure = undefined;
                job.activeStructureSlotIndex = undefined;
            }
        }
    }

    if (job.phase === "structure_hold") {
        if (!hasMinimumStructuresBuilt(job)) {
            seedStructureSlotsFromWorld(job, dim);
        }
        if (hasMinimumStructuresBuilt(job)) {
            if (job.structureCatalogMode) {
                job.phase = "catalog_signs";
                job.catalogSignIndex = 0;
            } else {
                job.phase = "well";
                job.wellStep = 0;
            }
        } else {
            prepareStructureRetry(job);
            if ((job.structureRetryIndices?.length ?? 0) > 0) {
                job.phase = "structure_retry";
            }
        }
    }

    if (spent < budget && job.phase === "structure_retry") {
        spent += tickStructureRetryPhase(job, dim, mat, budget - spent);
    }

    while (spent < budget && job.phase === "pen") {
        spent += tickAnimalPen(job, dim, mat, budget - spent);
        const penDone =
            job.animalPen &&
            job.penCellIndex >= ANIMAL_PEN_W * ANIMAL_PEN_D &&
            job.penSpawnDone;
        if (penDone) {
            if (job.singleStructureOnly) {
                enterPhaseAfterSettlementFeatures(job);
            } else {
                job.phase = "well";
                job.wellStep = 0;
            }
        }
    }

    const wellRing = [];
    for (let wdx = -3; wdx <= 3; wdx++) {
        for (let wdz = -3; wdz <= 3; wdz++) {
            if (Math.abs(wdx) <= 2 && Math.abs(wdz) <= 2) continue;
            wellRing.push([wdx, wdz]);
        }
    }
    const wellPosts = [
        [-4, -4],
        [4, -4],
        [-4, 4],
        [4, 4],
        [-4, 0],
        [4, 0],
        [0, -4],
        [0, 4]
    ];

    const fountainRing = [];
    for (let fdx = -4; fdx <= 4; fdx++) {
        for (let fdz = -4; fdz <= 4; fdz++) {
            if (Math.max(Math.abs(fdx), Math.abs(fdz)) < 3) continue;
            fountainRing.push([fdx, fdz]);
        }
    }

    const campfireRing = [];
    for (let cdx = -3; cdx <= 3; cdx++) {
        for (let cdz = -3; cdz <= 3; cdz++) {
            if (cdx === 0 && cdz === 0) continue;
            if (Math.max(Math.abs(cdx), Math.abs(cdz)) >= 2) campfireRing.push([cdx, cdz]);
        }
    }

    const shrineRing = [];
    for (let sdx = -4; sdx <= 4; sdx++) {
        for (let sdz = -4; sdz <= 4; sdz++) {
            if (Math.max(Math.abs(sdx), Math.abs(sdz)) === 4) shrineRing.push([sdx, sdz]);
        }
    }
    /** @type {[number, number][]} */
    const marketRing = [];
    for (let mdx = -5; mdx <= 5; mdx++) {
        for (let mdz = -5; mdz <= 5; mdz++) {
            if (Math.max(Math.abs(mdx), Math.abs(mdz)) >= 3 && Math.max(Math.abs(mdx), Math.abs(mdz)) <= 5) {
                marketRing.push([mdx, mdz]);
            }
        }
    }
    const marketStalls = [
        { dx: -5, dz: -1, wool: "minecraft:red_wool", barrelDx: -4, barrelDz: -1 },
        { dx: 5, dz: -1, wool: "minecraft:blue_wool", barrelDx: 4, barrelDz: -1 },
        { dx: -5, dz: 1, wool: "minecraft:yellow_wool", barrelDx: -4, barrelDz: 1 },
        { dx: 5, dz: 1, wool: "minecraft:lime_wool", barrelDx: 4, barrelDz: 1 },
        { dx: -1, dz: -5, wool: "minecraft:orange_wool", barrelDx: -1, barrelDz: -4 },
        { dx: 1, dz: 5, wool: "minecraft:pink_wool", barrelDx: 1, barrelDz: 4 }
    ];
    const marketStallSteps = marketRing.length + 1 + marketStalls.length * 4 + 1;

    while (spent < budget && job.phase === "well") {
        if (job.skipWell) {
            enterPhaseAfterSettlementFeatures(job);
            break;
        }
        const step = job.wellStep;
        const meeting = job.meetingVariant ?? "well";

        if (meeting === "fountain" && step < fountainRing.length) {
            const [dx, dz] = fountainRing[step];
            const wx = job.centerX + dx;
            const wz = job.centerZ + dz;
            const pathBlock = Math.max(Math.abs(dx), Math.abs(dz)) <= 2 ? mat.path : mat.wallMossy;
            if (trySetGround(dim, wx, wz, pathBlock, SETTLEMENT_REPLACE_ANY, mat.log, job.y)) job.totalEdits++;
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "fountain" && step === fountainRing.length) {
            if (isValidVillageCenterColumn(dim, job.centerX, job.centerZ)) {
                const sy = findBuildSurfaceY(dim, job.centerX, job.centerZ);
                if (sy !== undefined) {
                    buildVillageMeetingCenter(dim, job.centerX, job.centerZ, sy, mat);
                    job.totalEdits += WELL_SHAFT_DEPTH * 9 + 12;
                }
            }
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "fountain" && step > fountainRing.length) {
            enterPhaseAfterSettlementFeatures(job);
            continue;
        }

        if (meeting === "market" && step < marketRing.length) {
            const [dx, dz] = marketRing[step];
            const wx = job.centerX + dx;
            const wz = job.centerZ + dz;
            const pathBlock = pickSettlementPathBlock(mat, job.ruleset, wx, wz, job.cx + step);
            if (trySetGround(dim, wx, wz, pathBlock, SETTLEMENT_REPLACE_ANY, mat.log, job.y)) job.totalEdits++;
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "market" && step === marketRing.length) {
            for (let dx = -2; dx <= 2 && spent < budget; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const wx = job.centerX + dx;
                    const wz = job.centerZ + dz;
                    const pathBlock = pickSettlementPathBlock(mat, job.ruleset, wx, wz, 1400 + dx + dz);
                    if (trySetGround(dim, wx, wz, pathBlock, SETTLEMENT_REPLACE_ANY, mat.log, job.y)) {
                        job.totalEdits++;
                    }
                }
            }
            const sy = cachedFloorY(job.floorYCache, dim, job.centerX, job.centerZ, mat.log, job.y);
            if (sy !== undefined && spent < budget) {
                buildVillageMeetingCenter(dim, job.centerX, job.centerZ, sy, mat);
                job.totalEdits += WELL_SHAFT_DEPTH * 9 + 12;
            }
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "market" && step > marketRing.length && step < marketStallSteps) {
            const stallIdx = Math.floor((step - marketRing.length - 1) / 4);
            const part = (step - marketRing.length - 1) % 4;
            const stall = marketStalls[stallIdx];
            if (stall) {
                const wx = job.centerX + stall.dx;
                const wz = job.centerZ + stall.dz;
                const sy = cachedFloorY(job.floorYCache, dim, wx, wz, mat.log, job.y);
                if (sy !== undefined) {
                    if (part === 0) {
                        trySetBlock(dim, wx, sy, wz, mat.fence, SETTLEMENT_REPLACE_ANY);
                        trySetBlock(dim, wx, sy + 1, wz, stall.wool, SETTLEMENT_REPLACE_ANY);
                    } else if (part === 1) {
                        const bx = job.centerX + stall.barrelDx;
                        const bz = job.centerZ + stall.barrelDz;
                        const by = cachedFloorY(job.floorYCache, dim, bx, bz, mat.log, job.y);
                        if (
                            by !== undefined &&
                            trySetBlock(dim, bx, by, bz, "minecraft:barrel", SETTLEMENT_REPLACE_ANY)
                        ) {
                            fillVillageStorageAt(
                                dim,
                                bx,
                                by,
                                bz,
                                lootForMarketStallBarrel(job.ruleset),
                                "minecraft:barrel",
                                job.ruleset
                            );
                        }
                    } else if (part === 2) {
                        trySetBlock(dim, wx, sy - 1, wz, mat.plank, SETTLEMENT_REPLACE_ANY);
                    }
                    job.totalEdits++;
                }
            }
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "market" && step >= marketStallSteps) {
            enterPhaseAfterSettlementFeatures(job);
            continue;
        }

        if (meeting === "campfire" && step < campfireRing.length) {
            const [dx, dz] = campfireRing[step];
            const wx = job.centerX + dx;
            const wz = job.centerZ + dz;
            const sy = cachedFloorY(job.floorYCache, dim, wx, wz, mat.log, job.y);
            if (sy !== undefined) {
                const logRing = hashChunkRoll(job.cx, job.cz, 1300 + step, 100) < 40;
                trySetBlock(dim, wx, sy, wz, logRing ? mat.log : "minecraft:hay_block", SETTLEMENT_REPLACE_ANY);
                job.totalEdits++;
            }
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "campfire" && step === campfireRing.length) {
            const sy = cachedFloorY(job.floorYCache, dim, job.centerX, job.centerZ, mat.log, job.y);
            if (sy !== undefined) {
                trySetBlock(
                    dim,
                    job.centerX,
                    sy - 1,
                    job.centerZ,
                    pickSettlementPathBlock(mat, job.ruleset, job.centerX, job.centerZ, 1305),
                    SETTLEMENT_REPLACE_ANY
                );
                trySetExtinguishedCampfire(dim, job.centerX, sy, job.centerZ);
                placeVillageCenterBell(dim, job.centerX + 2, job.centerZ, sy, mat);
                job.totalEdits += 3;
            }
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "campfire" && step > campfireRing.length) {
            enterPhaseAfterSettlementFeatures(job);
            continue;
        }

        if (meeting === "shrine" && step < shrineRing.length) {
            const [dx, dz] = shrineRing[step];
            const wx = job.centerX + dx;
            const wz = job.centerZ + dz;
            const pathBlock = pickSettlementPathBlock(mat, job.ruleset, wx, wz, job.cx + step + 1600);
            if (trySetGround(dim, wx, wz, pathBlock, SETTLEMENT_REPLACE_ANY, mat.log, job.y)) job.totalEdits++;
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "shrine" && step === shrineRing.length) {
            const sy = cachedFloorY(job.floorYCache, dim, job.centerX, job.centerZ, mat.log, job.y);
            if (sy !== undefined) {
                buildVillageShrineCenter(dim, job.centerX, job.centerZ, sy, mat);
                job.totalEdits += 28;
            }
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "shrine" && step > shrineRing.length) {
            enterPhaseAfterSettlementFeatures(job);
            continue;
        }

        if (step < wellRing.length) {
            const [dx, dz] = wellRing[step];
            const wx = job.centerX + dx;
            const wz = job.centerZ + dz;
            if (trySetGround(dim, wx, wz, mat.wallMossy, SETTLEMENT_REPLACE_ANY, mat.log, job.y)) {
                job.totalEdits++;
            }
            job.wellStep++;
            spent++;
            continue;
        }
        if (step === wellRing.length && meeting === "well") {
            if (isValidVillageCenterColumn(dim, job.centerX, job.centerZ)) {
                const sy = findBuildSurfaceY(dim, job.centerX, job.centerZ);
                if (sy !== undefined) {
                    buildVillageMeetingCenter(dim, job.centerX, job.centerZ, sy, mat);
                    job.totalEdits += WELL_SHAFT_DEPTH * 9 + 12;
                }
            }
            job.wellStep++;
            spent++;
            continue;
        }
        if (meeting === "well" && step === wellRing.length + 1) {
            job.wellStep++;
            spent++;
            continue;
        }
        const postIdx = step - wellRing.length - 2;
        if (postIdx < wellPosts.length) {
            const [dx, dz] = wellPosts[postIdx];
            const wx = job.centerX + dx;
            const wz = job.centerZ + dz;
            const sy = cachedFloorY(job.floorYCache, dim, wx, wz, mat.log, job.y);
            if (sy !== undefined) {
                trySetBlock(dim, wx, sy, wz, mat.fence, SETTLEMENT_REPLACE_ANY);
                job.totalEdits++;
            }
            job.wellStep++;
            spent++;
            continue;
        }
        enterPhaseAfterSettlementFeatures(job);
    }

    while (spent < budget && job.phase === "bunkers") {
        spent += tickSettlementBunkers(job, dim, mat, budget - spent);
        const bunkersDone =
            (job.bunkerIndex ?? 0) >= (job.bunkers?.length ?? 0) && !(job.bunkerFinishQueue?.length);
        if (bunkersDone) {
            enterPhaseAfterBunkers(job);
            break;
        }
        if (spent >= budget) break;
    }

    const zombieTarget = job.tier === "hamlet" ? 2 : job.tier === "village" ? 4 : 6;
    while (spent < budget && job.phase === "zombies") {
        if (job.skipZombies) {
            requestSettlementDonePhase(job);
            break;
        }
        if (job.zombieCount >= zombieTarget) {
            requestSettlementDonePhase(job);
            break;
        }
        spent++;
        const slot = job.zombieCount;
        const angle = (hashChunkRoll(job.cx, job.cz, 400 + slot, 360) * Math.PI) / 180;
        const spread = Math.max(4, job.pathRadius);
        const dist = 4 + (hashChunkRoll(job.cx, job.cz, 410 + slot, spread) % spread);
        const sx = Math.floor(job.centerX + Math.cos(angle) * dist);
        const sz = Math.floor(job.centerZ + Math.sin(angle) * dist);
        let sy = cachedFloorY(job.floorYCache, dim, sx, sz, mat.log, job.y);
        if (sy === undefined) {
            sy = cachedFloorY(job.floorYCache, dim, job.centerX, job.centerZ, mat.log, job.y);
        }
        if (sy === undefined) {
            job.zombieSpawnSkips++;
            if (job.zombieSpawnSkips >= 6) {
                job.zombieCount++;
                job.zombieSpawnSkips = 0;
            }
            continue;
        }
        try {
            dim.spawnEntity("minecraft:zombie_villager", { x: sx + 0.5, y: sy, z: sz + 0.5 });
            job.zombieCount++;
            job.zombieSpawnSkips = 0;
            job.totalEdits += 2;
        } catch {
            job.zombieSpawnSkips++;
            if (job.zombieSpawnSkips >= 4) {
                job.zombieCount++;
                job.zombieSpawnSkips = 0;
            }
        }
    }

    if (job.phase === "zombies" && job.zombieCount >= zombieTarget) {
        requestSettlementDonePhase(job);
    }

    if (job.phase === "done") {
        finalizeSettlementBuildJob(job);
    }
}

/**
 * Resolve plan id for debug manifest lines.
 * @param {StructureSlot} slot
 * @param {BuildJob} job
 * @param {number} salt
 */
function resolveStructurePlanIdForManifest(slot, job, salt) {
    if (slot.type === "house" && slot.housePlan != null) {
        const plan = getHousePlanForRuleset(job.ruleset, slot.housePlan);
        return plan?.id ?? `house#${slot.housePlan}`;
    }
    if (slot.type === "church") {
        const roll = slot.churchRoll ?? 0;
        const plan = getChurchPlan(job.ruleset, roll);
        return plan?.id ?? `church#${roll}`;
    }
    const plan = getWorkBuildingPlan(slot.type, job.cx, job.cz, salt, job.ruleset);
    return plan?.id ?? String(slot.type);
}

/**
 * One structure line for Content Log / debug UI.
 * @param {StructureSlot} slot
 * @param {BuildJob} job
 * @param {number} index zero-based slot index
 * @param {StructureBuildState} [buildState]
 */
export function formatSettlementStructureLabel(slot, job, index, buildState) {
    const salt = 100 + (index + 1) * 17;
    const planId = resolveStructurePlanIdForManifest(slot, job, salt);
    const wx = job.centerX + slot.ox;
    const wz = job.centerZ + slot.oz;
    const skipped = buildState?.skippedFooting === true;
    let label = `${index + 1}. ${slot.type}`;
    if (planId && planId !== slot.type) label += ` (${planId})`;
    if (slot.type === "house" && slot.housePlan != null) label += ` · variant#${slot.housePlan}`;
    if (slot.churchRoll != null && slot.type === "church") label += ` · roll#${slot.churchRoll}`;
    label += ` · @ ${wx}, ${wz} · door=${slot.door}`;
    if (skipped) label += " · SKIPPED (bad footing)";
    return label;
}

/**
 * Full building list + features after a settlement job finishes (or aborts).
 * @param {BuildJob} job
 */
export function buildSettlementCompletionManifest(job) {
    const lines = [];
    lines.push(
        `tier=${job.tier} ruleset=${job.ruleset} center=${job.centerX},${Math.floor(job.y)},${job.centerZ} chunk=${job.cx},${job.cz}`
    );
    lines.push(`layout=${job.layoutVariant ?? "?"} · plaza=${job.meetingVariant ?? "well"}`);
    if (job.singleStructureOnly) lines.push("mode=single structure only");
    const built = job.builtStructures ?? [];
    const planned = job.structures?.length ?? 0;
    lines.push(`buildings (${built.length}/${planned} slots):`);
    if (built.length === 0) {
        lines.push("  (none finished)");
    } else {
        for (const row of built) lines.push(`  ${row}`);
    }
    lines.push("structure registry:");
    lines.push(formatStructureRegistrySummary(job));
    if (built.length < planned) {
        lines.push(`  … ${planned - built.length} slot(s) not built (aborted, stalled, or still queued)`);
    }
    /** @type {string[]} */
    const features = [];
    if (!job.skipWell && !job.singleStructureOnly) {
        features.push(`meeting=${job.meetingVariant ?? "well"}`);
    }
    if (job.animalPen) {
        features.push(`animalPen offset ${job.animalPen.ox},${job.animalPen.oz}`);
    }
    if (job.pathCells?.length) features.push(`paths=${job.pathCells.length}`);
    if (job.bunkers?.length) features.push(`pathBunkers=${job.bunkers.length}`);
    if (job.useDustedGround && job.groundCells?.length) {
        features.push(`dustedGround=${job.groundCells.length}`);
    }
    if (job.useSnowCap && job.snowCells?.length) {
        features.push(`snowCap=${job.snowCells.length}`);
    }
    if (!job.skipZombies && job.zombieCount > 0) {
        features.push(`zombies=${job.zombieCount}`);
    }
    if (features.length) lines.push(`features: ${features.join(" · ")}`);
    lines.push(`blockEdits=${job.totalEdits ?? 0}`);
    return lines.join("\n");
}

/** Drop stuck or in-progress settlement builds (dev force place / clear cache). */
export function abortAllSettlementBuilds() {
    while (buildQueue.length > 0) {
        const job = buildQueue.shift();
        if (!job || job.finished) continue;
        job.finished = true;
        job.phase = "done";
        try {
            job.onComplete({
                placed: false,
                usedId: "script:aborted",
                totalEdits: job.totalEdits ?? 0,
                builtStructures: job.builtStructures ?? [],
                buildManifest: buildSettlementCompletionManifest(job)
            });
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {{ x: number, y: number, z: number }} center
 * @param {SettlementRuleset} ruleset
 * @param {SettlementTier} tier
 * @param {number} cx
 * @param {number} cz
 * @param {(r: { placed: boolean, usedId: string, totalEdits: number }) => void} onComplete
 * @param {{
 *   structures?: StructureSlot[],
 *   animalPen?: { ox: number, oz: number, gateFace: number },
 *   biomeId?: string,
 *   singleStructureOnly?: boolean,
 *   siteGx?: number,
 *   siteGz?: number,
 *   siteSub?: number,
 *   debugForceLadders?: boolean,
 *   skipProcessor?: boolean,
 *   resumeIncomplete?: boolean
 * }} [enqueueOpts]
 * @returns {boolean}
 */
export { exportJobStructureManifest } from "./mb_abandonedSettlementStructureRegistry.js";

export function enqueueSettlementBuild(dimension, center, ruleset, tier, cx, cz, onComplete, enqueueOpts = {}) {
    const siteGx = enqueueOpts.siteGx ?? cx;
    const siteGz = enqueueOpts.siteGz ?? cz;
    const siteSub = enqueueOpts.siteSub ?? 0;
    if (isSiteBuilt(siteGx, siteGz, siteSub)) {
        try {
            onComplete({ placed: false, usedId: "script:already_built", totalEdits: 0 });
        } catch {
            /* ignore */
        }
        return false;
    }

    const catalogMode = enqueueOpts.structureCatalogMode === true;
    const singleOnly = enqueueOpts.singleStructureOnly === true && !catalogMode;
    const pathRadius = catalogMode ? 0 : singleOnly ? 3 : pathRadiusForTier(tier);
    const centerX = Math.floor(center.x);
    const centerZ = Math.floor(center.z);
    const lamp = lampMarkerWorldPosition(siteGx, siteGz, siteSub);
    const lampRelDx = lamp.x - centerX;
    const lampRelDz = lamp.z - centerZ;
    const layoutStructuresList =
        enqueueOpts.structures ?? layoutStructures(cx, cz, tier, ruleset, lampRelDx, lampRelDz);
    const structures = sortStructuresNearLampFirst(layoutStructuresList, lampRelDx, lampRelDz);
    const animalPen = catalogMode
        ? undefined
        : enqueueOpts.animalPen !== undefined
          ? enqueueOpts.animalPen
          : tier === "hamlet" || singleOnly
            ? undefined
            : findAnimalPenPlacement(structures, cx, cz);
    const pathCells = catalogMode
        ? []
        : sortPathCellsNearLampFirst(
              planSettlementPaths(structures, pathRadius, animalPen, ruleset, cx, cz, lampRelDx, lampRelDz),
              lampRelDx,
              lampRelDz
          );
    const bunkers =
        catalogMode || singleOnly
            ? []
            : layoutBunkerSites(cx, cz, tier, pathCells, structures, lampRelDx, lampRelDz, ruleset);
    const useDusted = catalogMode ? false : settlementUsesDustedGround(ruleset);
    const useSnow = catalogMode ? false : settlementRollsMbSnowSprinkle(ruleset, cx, cz, siteSub);
    const groundCells =
        catalogMode || !useDusted
            ? []
            : sortPathCellsNearLampFirst(
                  planInfectedGroundCells(
                      structures,
                      pathCells,
                      pathRadius,
                      animalPen,
                      singleOnly,
                      lampRelDx,
                      lampRelDz
                  ),
                  lampRelDx,
                  lampRelDz
              );
    const snowCells =
        catalogMode || !useSnow
            ? []
            : sortPathCellsNearLampFirst(
                  planSnowCapCells(pathCells, structures, cx, cz, pathRadius, animalPen),
                  lampRelDx,
                  lampRelDz
              );
    const resumeIncomplete = enqueueOpts.resumeIncomplete === true;
    /** @type {BuildJob} */
    const job = {
        dimension,
        centerX,
        centerZ,
        y: center.y,
        lampRelDx,
        lampRelDz,
        lampWorldX: lamp.x,
        lampWorldZ: lamp.z,
        ruleset,
        tier,
        cx,
        cz,
        pathRadius,
        structures,
        bunkers,
        bunkerIndex: 0,
        bunkerCellIndex: 0,
        animalPen,
        penCellIndex: 0,
        penSpawnDone: false,
        pathCells,
        structureIndex: 0,
        builtStructures: [],
        zombieCount: 0,
        useDustedGround: useDusted,
        useSnowCap: useSnow,
        groundCells,
        snowCells,
        snowSubPhase: "paths",
        snowRoofStruct: 0,
        snowRoofLx: 0,
        snowRoofLz: 0,
        singleStructureOnly: singleOnly,
        structureCatalogMode: catalogMode,
        catalogManifest: enqueueOpts.catalogManifest ?? [],
        catalogCols: enqueueOpts.catalogCols,
        catalogSignIndex: 0,
        skipWell: catalogMode || singleOnly,
        skipZombies: catalogMode || singleOnly,
        skipProcessor: catalogMode || enqueueOpts.skipProcessor === true,
        phase: resumeIncomplete ? "structures" : "cleanup",
        cleanupIndex: 0,
        pathIndex: resumeIncomplete ? pathCells.length : 0,
        groundIndex: resumeIncomplete ? groundCells.length : 0,
        snowIndex: resumeIncomplete ? snowCells.length : 0,
        lampArtifactDone: resumeIncomplete || catalogMode,
        wellStep: 0,
        meetingVariant: pickMeetingVariant(ruleset, cx, cz),
        layoutVariant: pickSettlementLayoutVariant(cx, cz),
        totalEdits: 0,
        floorYCache: new Map(),
        zombieSpawnSkips: 0,
        lastEditCount: 0,
        stallTicks: 0,
        paused: false,
        pausedStallTicks: 0,
        pauseActionBarCooldown: 0,
        siteGx: enqueueOpts.siteGx,
        siteGz: enqueueOpts.siteGz,
        siteSub: enqueueOpts.siteSub ?? 0,
        finished: false,
        stallAborted: false,
        debugForceLadders: enqueueOpts.debugForceLadders === true,
        pendingLadderColumns: [],
        onComplete
    };
    job.workChunkBounds = computeSettlementWorkChunkBounds(job);
    if (resumeIncomplete && siteGx != null && siteGz != null) {
        const saved = getSiteStructureManifest(siteGx, siteGz, siteSub);
        if (saved) applyStructureManifestToJob(job, saved);
    }
    if (resumeIncomplete) {
        seedStructureSlotsFromWorld(job, dimension);
        const nextIdx = findFirstStructureSlotNeedingWork(job);
        job.structureIndex = nextIdx;
        job.activeStructure = undefined;
        if (nextIdx < structures.length) {
            job.phase = "structures";
            avLogBuildLine(
                `Build resume — continuing structures at slot ${nextIdx + 1}/${structures.length} (${countSettlementStructuresBuilt(job)} already placed) site=${siteGx},${siteGz},${siteSub ?? 0}`
            );
        } else if (hasMinimumStructuresBuilt(job)) {
            job.phase = job.animalPen ? "pen" : "well";
            job.wellStep = 0;
            job.penCellIndex = 0;
            job.penSpawnDone = false;
        } else {
            job.phase = "structure_hold";
        }
    }
    buildQueue.push(job);
    ensureSettlementBuildTickLoop();
    return true;
}

/**
 * Active world centers for construction HUD (nearest build per player).
 * @returns {{ dimId: string, x: number, y: number, z: number, paused: boolean }[]}
 */
export function getSettlementBuildJobForSite(gx, gz, subIndex = 0) {
    for (const job of buildQueue) {
        if (!job || job.finished) continue;
        if (job.siteGx === gx && job.siteGz === gz && (job.siteSub ?? 0) === subIndex) return job;
    }
    return undefined;
}

/** Active placement only (excludes phase=done waiting for player witness). */
export function getActiveSettlementBuildJobForSite(gx, gz, subIndex = 0) {
    const job = getSettlementBuildJobForSite(gx, gz, subIndex);
    return isJobActivelyBuilding(job) ? job : undefined;
}

export function listActiveSettlementBuildCenters() {
    /** @type {{ dimId: string, x: number, y: number, z: number, lampX?: number, lampZ?: number, paused: boolean, phase?: string, edits?: number, structuresBuilt?: number, structuresPlanned?: number, structureIndex?: number }[]} */
    const out = [];
    for (const job of buildQueue) {
        if (!isJobActivelyBuilding(job)) continue;
        const dimId = job.dimension?.id;
        if (!dimId) continue;
        out.push({
            dimId,
            x: job.centerX,
            y: job.y ?? 64,
            z: job.centerZ,
            lampX: job.lampWorldX,
            lampZ: job.lampWorldZ,
            paused: job.paused === true,
            phase: job.phase,
            edits: job.totalEdits ?? 0,
            structuresBuilt: countSettlementStructuresBuilt(job),
            structuresPlanned: job.structures?.length ?? 0,
            structureIndex: job.activeStructure
                ? activeStructureSlotIndex(job)
                : job.structureIndex ?? 0
        });
    }
    return out;
}

export function tickSettlementBuildQueue(blockBudget = SETTLEMENT_BLOCKS_PER_TICK) {
    if (buildQueue.length === 0) return;
    if (buildQueue.length > 1) {
        let bestIdx = 0;
        let bestDist = nearestPlayerDistToSettlement(buildQueue[0]);
        for (let i = 1; i < buildQueue.length; i++) {
            const d = nearestPlayerDistToSettlement(buildQueue[i]);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }
        if (bestIdx > 0) {
            const [near] = buildQueue.splice(bestIdx, 1);
            buildQueue.unshift(near);
        }
    }
    const job = buildQueue[0];
    tickBuildJob(job, blockBudget);
    if (job.finished) {
        buildQueue.shift();
    }
}

export function getSettlementBuildQueueLength() {
    return buildQueue.length;
}

/**
 * True while a site has an unfinished job in the build queue (not finalized).
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function isSettlementBuildActiveForSite(gx, gz, subIndex = 0) {
    for (const job of buildQueue) {
        if (job.finished) continue;
        if (job.siteGx === gx && job.siteGz === gz && (job.siteSub ?? 0) === subIndex) return true;
    }
    return false;
}

/** One-line summary for player join/leave debug. */
export function summarizeActiveSettlementBuildsForDebug() {
    if (buildQueue.length === 0) return "no active builds";
    return buildQueue
        .filter((j) => j && !j.finished)
        .map(
            (j) =>
                `${j.tier}/${j.ruleset}@${j.centerX},${j.centerZ} phase=${j.phase}${j.paused ? " PAUSED" : ""} edits=${j.totalEdits ?? 0}`
        )
        .join(" | ");
}

/** One-line per in-progress settlement build (debug). */
export function describeSettlementBuildQueue() {
    if (buildQueue.length === 0) return "empty";
    return buildQueue
        .map((j, i) => {
            const stall = j.stallTicks ?? 0;
            const pauseTag = j.paused ? " PAUSED" : "";
            return `#${i + 1} ${j.tier}/${j.ruleset} world ${j.centerX},${j.centerZ} chunk ${j.cx},${j.cz} phase=${j.phase} edits=${j.totalEdits ?? 0} stall=${stall}${pauseTag}`;
        })
        .join(" | ");
}
