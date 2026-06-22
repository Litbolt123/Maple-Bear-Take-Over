/**
 * Pre-planned abandoned village sites (seed-stable grid + world persistence).
 * Large infected biomes get 3 village slots per grid cell (guaranteed rolls).
 */

import { hashChunkRoll, hasWorldgenLampMarkerAt, findWorldgenLampMarkerNear, LAMP_MARKER_SEARCH_RADIUS } from "./mb_abandonedSettlementBuilder.js";
import { SETTLEMENT_BUILD_PAUSE_DIST } from "./mb_abandonedVillageConstants.js";
import {
    flushWorldPropertyToDisk,
    getWorldProperty,
    invalidateWorldPropertyCache,
    setWorldProperty
} from "./mb_dynamicPropertyHandler.js";

/** Blocks between grid cell origins (~384 = sparse overworld villages). */
export const SITE_GRID_BLOCKS = 384;

/** Village anchors per cell when the anchor sits on large infected snow. */
export const SITES_PER_LARGE_INFECTED_CELL = 3;

/** Try up to this many large-infected placements per scan tick. */
export const LARGE_INFECTED_ACTIVATIONS_PER_SCAN = 3;

const SITES_PROP = "mb_av_village_sites";
const MAX_PERSISTED_SITE_KEYS = 2500;

/**
 * Bump only when intentionally invalidating future regen policy (built keys are never auto-cleared).
 * @type {number}
 */
export const SETTLEMENT_BUILD_SCHEMA = 2;

/** @type {Set<string>} */
const builtSiteKeys = new Set();
/** @type {Set<string>} */
const failedSiteKeys = new Set();
/** Partial script build — blocks reconcile-as-built; activation may retry. */
/** @type {Set<string>} */
const incompleteSiteKeys = new Set();
/** @type {Map<string, { x: number, y: number, z: number }>} */
const incompleteSiteCenters = new Map();
/** @type {Set<string>} */
const pendingSiteKeys = new Set();
/** @type {Map<string, { x: number, y: number, z: number }>} */
const builtSiteCenters = new Map();
/** @type {Map<string, import("./mb_abandonedSettlementStructureRegistry.js").SiteStructureManifest>} */
const siteStructureManifests = new Map();

let sitesLoaded = false;

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function siteKey(gx, gz, subIndex = 0) {
    return subIndex === 0 ? `${gx},${gz}` : `${gx},${gz},${subIndex}`;
}

/**
 * @param {number} worldX
 * @param {number} worldZ
 */
export function worldToSiteGrid(worldX, worldZ) {
    return {
        gx: Math.floor(worldX / SITE_GRID_BLOCKS),
        gz: Math.floor(worldZ / SITE_GRID_BLOCKS)
    };
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex 0..SITES_PER_LARGE_INFECTED_CELL-1
 */
export function siteWorldAnchorForSlot(gx, gz, subIndex) {
    const third = Math.floor(SITE_GRID_BLOCKS / SITES_PER_LARGE_INFECTED_CELL);
    const zoneStart = subIndex * third;
    const margin = 28;
    const span = Math.max(8, third - margin * 2);
    const jx = zoneStart + margin + hashChunkRoll(gx, gz, 900 + subIndex * 2, span);
    const jz = zoneStart + margin + hashChunkRoll(gx, gz, 901 + subIndex * 2, span);
    return {
        x: gx * SITE_GRID_BLOCKS + jx,
        z: gz * SITE_GRID_BLOCKS + jz,
        subIndex
    };
}

/**
 * @param {number} gx
 * @param {number} gz
 */
export function siteWorldAnchor(gx, gz) {
    return siteWorldAnchorForSlot(gx, gz, 0);
}

/** Fixed worldgen lamp position inside a site cell (villages jitter nearby). */
export const LAMP_MARKER_GRID_OFFSET = 64;

/**
 * Min distance for horizon ring only — NOT used to exclude lamp arrival.
 * Standing on the post (0 blocks) must still trigger lamp-arrival placement.
 */
export const LAMP_ARRIVAL_DIST_MIN = 0;

/** Max distance from lamp to count as "arrived" (seed roll skipped; biome sampled at lamp). */
export const LAMP_ARRIVAL_DIST_MAX = 56;

/** Start script village when player is this far from the lamp (visible landmark range). */
export const LAMP_APPROACH_DIST_MIN = 40;

/** Still activate by lamp distance when walking in (below horizon min). */
export const LAMP_APPROACH_DIST_MAX = 224;

const LAMP_MARKER_ZONE_BLOCKS = Math.floor(SITE_GRID_BLOCKS / SITES_PER_LARGE_INFECTED_CELL);

/**
 * Worldgen lamp post position for a grid cell slot (matches feature_rules snap).
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function lampMarkerWorldPosition(gx, gz, subIndex = 0) {
    return {
        x: gx * SITE_GRID_BLOCKS + LAMP_MARKER_GRID_OFFSET + subIndex * LAMP_MARKER_ZONE_BLOCKS,
        z: gz * SITE_GRID_BLOCKS + LAMP_MARKER_GRID_OFFSET,
        subIndex
    };
}

/**
 * Chebyshev distance from player to lamp + anchor (activation uses lamp — matches what players walk toward).
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 */
export function getSiteActivationDistances(playerX, playerZ, gx, gz, subIndex) {
    const lamp = lampMarkerWorldPosition(gx, gz, subIndex);
    const anchor = siteWorldAnchorForSlot(gx, gz, subIndex);
    const distLamp = Math.max(Math.abs(lamp.x - playerX), Math.abs(lamp.z - playerZ));
    const distAnchor = Math.max(Math.abs(anchor.x - playerX), Math.abs(anchor.z - playerZ));
    return { distLamp, distAnchor, lamp, anchor };
}

/**
 * @param {number} distLamp
 * @param {number} minHorizonBlocks
 * @param {number} maxHorizonBlocks
 * @returns {{ ok: boolean, mode?: "arrival"|"approach"|"horizon" }}
 */
export function sitePassesActivationDistance(distLamp, minHorizonBlocks, maxHorizonBlocks) {
    if (distLamp > maxHorizonBlocks) return { ok: false };
    if (distLamp <= LAMP_ARRIVAL_DIST_MAX) {
        return { ok: true, mode: "arrival" };
    }
    if (distLamp >= LAMP_APPROACH_DIST_MIN && distLamp <= LAMP_APPROACH_DIST_MAX) {
        return { ok: true, mode: "approach" };
    }
    if (distLamp >= minHorizonBlocks && distLamp <= maxHorizonBlocks) {
        return { ok: true, mode: "horizon" };
    }
    return { ok: false };
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function lampMarkerChunkCoords(gx, gz, subIndex = 0) {
    const lamp = lampMarkerWorldPosition(gx, gz, subIndex);
    return {
        lamp,
        cx: Math.floor(lamp.x / 16),
        cz: Math.floor(lamp.z / 16)
    };
}

/**
 * Lamp chunk must be loaded; anchor chunk required unless the player is at the lamp (arrival).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {(dimension: import("@minecraft/server").Dimension, cx: number, cz: number) => boolean} isChunkLoaded
 * @param {{ allowAnchorUnloaded?: boolean }} [opts]
 */
export function isSiteChunksReadyForActivation(
    dimension,
    gx,
    gz,
    subIndex,
    isChunkLoaded,
    opts = {}
) {
    const { cx: lcx, cz: lcz } = lampMarkerChunkCoords(gx, gz, subIndex);
    if (!isChunkLoaded(dimension, lcx, lcz)) return false;
    const anchor = siteWorldAnchorForSlot(gx, gz, subIndex);
    const acx = Math.floor(anchor.x / 16);
    const acz = Math.floor(anchor.z / 16);
    if (isChunkLoaded(dimension, acx, acz)) return true;
    return opts.allowAnchorUnloaded === true;
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function clearSiteFailedForLampArrival(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    if (!isSiteFailed(gx, gz, subIndex) || isSiteBuilt(gx, gz, subIndex)) return;
    failedSiteKeys.delete(siteKey(gx, gz, subIndex));
    persistSites();
}

/**
 * @param {string|undefined} biomeId
 * @returns {number}
 */
export function siteSlotCountForBiome(biomeId) {
    return infectedBiomeTierFromId(biomeId) === "large" ? SITES_PER_LARGE_INFECTED_CELL : 1;
}

/**
 * @param {string|undefined} biomeId
 * @returns {"large"|"medium"|"small"|null}
 */
export function infectedBiomeTierFromId(biomeId) {
    if (!biomeId?.startsWith("mb:infected_biome")) return null;
    if (biomeId.includes("large")) return "large";
    if (biomeId.includes("medium")) return "medium";
    return "small";
}

/**
 * @param {string|undefined} biomeId
 * @param {number} infectedProx
 */
export function describeSiteRollChance(biomeId, infectedProx) {
    const on = infectedBiomeTierFromId(biomeId);
    if (on === "large") return `guaranteed ×${SITES_PER_LARGE_INFECTED_CELL} slots/cell (large infected)`;
    if (on === "medium") return "~50% (medium infected)";
    if (on === "small") return "~1% (small infected)";
    const denom = siteSeedRollDenominator(infectedProx);
    return `~1/${denom} (near infected +${infectedProx})`;
}

/**
 * @param {number} infectedProx
 */
export function siteSeedRollDenominator(infectedProx) {
    if (infectedProx >= 3) return 6;
    if (infectedProx >= 2) return 12;
    if (infectedProx >= 1) return 22;
    return 48;
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} infectedProx
 * @param {string|undefined} biomeId
 */
export function sitePassesSeedRoll(gx, gz, infectedProx, biomeId) {
    const on = infectedBiomeTierFromId(biomeId);
    if (on === "large") return true;
    if (on === "medium") return hashChunkRoll(gx, gz, 802, 2) === 0;
    if (on === "small") return hashChunkRoll(gx, gz, 803, 100) === 0;
    const denom = siteSeedRollDenominator(infectedProx);
    return hashChunkRoll(gx, gz, 800, denom) === 0;
}

function loadSitesFromWorldProperty() {
    try {
        const raw = getWorldProperty(SITES_PROP);
        if (typeof raw !== "string" || !raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return;
        if (Array.isArray(data.built)) {
            for (const k of data.built) {
                if (typeof k === "string") builtSiteKeys.add(k);
            }
        }
        if (Array.isArray(data.failed)) {
            for (const k of data.failed) {
                if (typeof k === "string") failedSiteKeys.add(k);
            }
        }
        if (Array.isArray(data.incomplete)) {
            for (const k of data.incomplete) {
                if (typeof k === "string") incompleteSiteKeys.add(k);
            }
        }
        const centers = data.centers;
        if (centers && typeof centers === "object") {
            for (const [k, v] of Object.entries(centers)) {
                if (
                    typeof k === "string" &&
                    v &&
                    typeof v === "object" &&
                    typeof v.x === "number" &&
                    typeof v.y === "number" &&
                    typeof v.z === "number"
                ) {
                    builtSiteCenters.set(k, {
                        x: Math.floor(v.x),
                        y: Math.floor(v.y),
                        z: Math.floor(v.z)
                    });
                }
            }
        }
        const incompleteCenters = data.incompleteCenters;
        if (incompleteCenters && typeof incompleteCenters === "object") {
            for (const [k, v] of Object.entries(incompleteCenters)) {
                if (
                    typeof k === "string" &&
                    v &&
                    typeof v === "object" &&
                    typeof v.x === "number" &&
                    typeof v.y === "number" &&
                    typeof v.z === "number"
                ) {
                    incompleteSiteCenters.set(k, {
                        x: Math.floor(v.x),
                        y: Math.floor(v.y),
                        z: Math.floor(v.z)
                    });
                }
            }
        }
        const manifests = data.structureManifests;
        if (manifests && typeof manifests === "object") {
            for (const [k, v] of Object.entries(manifests)) {
                if (typeof k === "string" && v && typeof v === "object" && Array.isArray(v.slots)) {
                    siteStructureManifests.set(k, v);
                }
            }
        }
    } catch {
        /* ignore */
    }
}

function ensureSitesLoaded() {
    if (sitesLoaded) return;
    sitesLoaded = true;
    loadSitesFromWorldProperty();
}

/** Re-read `mb_av_village_sites` from disk (fixes empty registry if module loaded before world was ready). */
export function reloadAbandonedVillageSiteRegistry() {
    invalidateWorldPropertyCache(SITES_PROP);
    builtSiteKeys.clear();
    failedSiteKeys.clear();
    incompleteSiteKeys.clear();
    pendingSiteKeys.clear();
    builtSiteCenters.clear();
    incompleteSiteCenters.clear();
    siteStructureManifests.clear();
    sitesLoaded = false;
    ensureSitesLoaded();
}

function persistSites() {
    try {
        const built = [...builtSiteKeys];
        const failed = [...failedSiteKeys];
        const incomplete = [...incompleteSiteKeys];
        const trimBuilt =
            built.length > MAX_PERSISTED_SITE_KEYS ? built.slice(-MAX_PERSISTED_SITE_KEYS) : built;
        const trimFailed =
            failed.length > MAX_PERSISTED_SITE_KEYS ? failed.slice(-MAX_PERSISTED_SITE_KEYS) : failed;
        const trimIncomplete =
            incomplete.length > MAX_PERSISTED_SITE_KEYS
                ? incomplete.slice(-MAX_PERSISTED_SITE_KEYS)
                : incomplete;
        /** @type {Record<string, { x: number, y: number, z: number }>} */
        const centers = {};
        for (const k of trimBuilt) {
            const c = builtSiteCenters.get(k);
            if (c) centers[k] = c;
        }
        /** @type {Record<string, { x: number, y: number, z: number }>} */
        const incompleteCenters = {};
        for (const k of trimIncomplete) {
            const c = incompleteSiteCenters.get(k);
            if (c) incompleteCenters[k] = c;
        }
        /** @type {Record<string, import("./mb_abandonedSettlementStructureRegistry.js").SiteStructureManifest>} */
        const structureManifests = {};
        for (const k of trimIncomplete) {
            const m = siteStructureManifests.get(k);
            if (m) structureManifests[k] = m;
        }
        setWorldProperty(
            SITES_PROP,
            JSON.stringify({
                schema: SETTLEMENT_BUILD_SCHEMA,
                built: trimBuilt,
                failed: trimFailed,
                incomplete: trimIncomplete,
                centers,
                incompleteCenters,
                structureManifests
            })
        );
        flushWorldPropertyToDisk(SITES_PROP);
    } catch {
        /* ignore */
    }
}

export function loadAbandonedVillageSiteRegistry() {
    ensureSitesLoaded();
}

export function clearAbandonedVillageSiteRegistry() {
    builtSiteKeys.clear();
    failedSiteKeys.clear();
    incompleteSiteKeys.clear();
    pendingSiteKeys.clear();
    builtSiteCenters.clear();
    incompleteSiteCenters.clear();
    siteStructureManifests.clear();
    try {
        setWorldProperty(
            SITES_PROP,
            JSON.stringify({
                built: [],
                failed: [],
                incomplete: [],
                centers: {},
                incompleteCenters: {},
                structureManifests: {}
            })
        );
    } catch {
        /* ignore */
    }
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function isSiteBuilt(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    return builtSiteKeys.has(siteKey(gx, gz, subIndex));
}

/**
 * Built sites stay built across sessions and addon updates (world property `mb_av_village_sites`).
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function siteGenerationIsComplete(gx, gz, subIndex = 0) {
    return isSiteBuilt(gx, gz, subIndex);
}

/**
 * Persisted settlement center for a built site (prevents offset re-builds on retry).
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 * @returns {{ x: number, y: number, z: number }|undefined}
 */
export function getBuiltSiteCenter(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    return builtSiteCenters.get(siteKey(gx, gz, subIndex));
}

/** Blocks that indicate a script settlement already exists (post-reload / lost registry). */
const SETTLEMENT_PRESENCE_BLOCK_IDS = new Set([
    "minecraft:mossy_cobblestone",
    "minecraft:cobblestone",
    "minecraft:dirt_path",
    "minecraft:farmland",
    "minecraft:spruce_planks",
    "minecraft:oak_planks",
    "minecraft:acacia_planks",
    "minecraft:jungle_planks",
    "minecraft:sandstone",
    "minecraft:smooth_sandstone",
    "minecraft:packed_ice",
    "mb:dusted_dirt"
]);

/** Unambiguous script village blocks (not natural desert sandstone / stone shores). */
const SETTLEMENT_STRONG_PRESENCE_IDS = new Set([
    "minecraft:mossy_cobblestone",
    "minecraft:dirt_path",
    "minecraft:farmland",
    "minecraft:spruce_planks",
    "minecraft:oak_planks",
    "minecraft:acacia_planks",
    "minecraft:jungle_planks",
    "mb:dusted_dirt"
]);

/** Used for reconcile only — excludes smooth_sandstone / hay (desert temples & wells). */
const SETTLEMENT_SCRIPT_SIGNATURE_IDS = new Set([
    "minecraft:mossy_cobblestone",
    "minecraft:dirt_path",
    "minecraft:farmland",
    "minecraft:spruce_planks",
    "minecraft:oak_planks",
    "minecraft:acacia_planks",
    "minecraft:jungle_planks",
    "mb:dusted_dirt"
]);

const SETTLEMENT_WEAK_PRESENCE_IDS = new Set([
    "minecraft:cobblestone",
    "minecraft:sandstone",
    "minecraft:smooth_sandstone",
    "minecraft:packed_ice"
]);

/** Do not build a second hub this close to an existing persisted settlement. */
export const BUILT_SITE_LAMP_OVERLAP_DIST = 88;

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} sampleY
 * @param {number} radius
 */
/** Natural desert stone — not script village evidence when reconciling. */
const NATURAL_DESERT_WEAK_PRESENCE_IDS = new Set([
    "minecraft:sandstone",
    "minecraft:smooth_sandstone",
    "minecraft:cut_sandstone",
    "minecraft:cobblestone"
]);

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} sampleY
 * @param {number} [radius]
 * @param {{ ignoreNaturalDesertStone?: boolean }} [opts]
 * @returns {{ strong: number, weak: number, mossy: number, scriptStrong: number }}
 */
function scanSettlementPresenceNear(dimension, wx, wz, sampleY, radius = 3, opts = {}) {
    let strong = 0;
    let weak = 0;
    let mossy = 0;
    let scriptStrong = 0;
    const yMid = Math.floor(sampleY);
    const skipNaturalDesert = opts.ignoreNaturalDesertStone === true;
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dy = -4; dy <= 6; dy++) {
                try {
                    const b = dimension.getBlock({ x: wx + dx, y: yMid + dy, z: wz + dz });
                    if (!b) continue;
                    const id = b.typeId;
                    if (id === "minecraft:mossy_cobblestone") {
                        mossy++;
                        scriptStrong++;
                        strong++;
                    } else if (SETTLEMENT_SCRIPT_SIGNATURE_IDS.has(id)) {
                        scriptStrong++;
                        strong++;
                    } else if (SETTLEMENT_STRONG_PRESENCE_IDS.has(id)) {
                        strong++;
                    } else if (SETTLEMENT_WEAK_PRESENCE_IDS.has(id)) {
                        if (skipNaturalDesert && NATURAL_DESERT_WEAK_PRESENCE_IDS.has(id)) continue;
                        weak++;
                    }
                } catch {
                    return { strong, weak, mossy, scriptStrong };
                }
            }
        }
    }
    return { strong, weak, mossy, scriptStrong };
}

/**
 * @param {number} mossy
 * @param {number} scriptStrong
 * @param {number} weak
 */
function scriptSettlementEvidenceIsConvincing(mossy, scriptStrong, weak) {
    if (mossy >= 8) return true;
    if (mossy >= 4 && scriptStrong >= 12) return true;
    if (mossy >= 2 && scriptStrong >= 8 && weak >= 6) return true;
    return false;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} hintY
 * @param {string|undefined} biomeId
 * @param {number} [radius]
 */
/**
 * True when a single structure footprint already has script village blocks (resume / retry).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} hintY
 * @param {number} [radius]
 */
export function structureSlotHasSettlementEvidence(dimension, wx, wz, hintY, radius = 5) {
    const { mossy, scriptStrong, weak } = scanSettlementPresenceNear(dimension, wx, wz, hintY, radius, {});
    if (mossy >= 3 && scriptStrong >= 6) return true;
    if (scriptStrong >= 12) return true;
    return scriptSettlementEvidenceIsConvincing(mossy, scriptStrong, weak);
}

function verifyScriptSettlementAt(dimension, wx, wz, hintY, biomeId, radius = 12) {
    const ignoreNaturalDesertStone =
        biomeId === "minecraft:desert" ||
        (typeof biomeId === "string" && biomeId.endsWith("_desert"));
    const { mossy, scriptStrong, weak } = scanSettlementPresenceNear(dimension, wx, wz, hintY, radius, {
        ignoreNaturalDesertStone
    });
    return scriptSettlementEvidenceIsConvincing(mossy, scriptStrong, weak);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} lampX
 * @param {number} lampZ
 * @param {number} [hintY]
 * @param {number} [searchRadius]
 * @returns {{ x: number, y: number, z: number }|undefined}
 */
export function probeSettlementCenterNearWorld(
    dimension,
    lampX,
    lampZ,
    hintY = 64,
    searchRadius = 36,
    biomeId
) {
    const ignoreNaturalDesertStone =
        biomeId === "minecraft:desert" ||
        (typeof biomeId === "string" && biomeId.endsWith("_desert"));
    let best;
    for (let dx = -searchRadius; dx <= searchRadius; dx += 4) {
        for (let dz = -searchRadius; dz <= searchRadius; dz += 4) {
            const wx = Math.floor(lampX) + dx;
            const wz = Math.floor(lampZ) + dz;
            const { mossy, scriptStrong, weak } = scanSettlementPresenceNear(dimension, wx, wz, hintY, 3, {
                ignoreNaturalDesertStone
            });
            if (!scriptSettlementEvidenceIsConvincing(mossy, scriptStrong, weak)) continue;
            if (mossy < 4) continue;
            const score = mossy * 6 + scriptStrong * 2 + weak;
            if (!best || score > best.score) {
                let y = hintY;
                for (let dy = 8; dy >= -8; dy--) {
                    try {
                        const b = dimension.getBlock({ x: wx, y: Math.floor(hintY) + dy, z: wz });
                        if (b && SETTLEMENT_PRESENCE_BLOCK_IDS.has(b.typeId)) {
                            y = Math.floor(hintY) + dy + 1;
                            break;
                        }
                    } catch {
                        break;
                    }
                }
                best = { x: wx, y, z: wz, score };
            }
        }
    }
    return best ? { x: best.x, y: best.y, z: best.z } : undefined;
}

/**
 * When the registry is empty/stale but mossy paths + structures remain near the lamp (pack reload, lost property).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {number} hintY
 * @param {string|undefined} biomeId
 * @returns {boolean} true when an orphan village was linked and activation should skip
 */
export function tryLinkOrphanSettlementNearLamp(dimension, gx, gz, subIndex, hintY, biomeId) {
    const lamp = lampMarkerWorldPosition(gx, gz, subIndex);
    const orphan = probeSettlementCenterNearWorld(dimension, lamp.x, lamp.z, hintY, 36, biomeId);
    if (!orphan) return false;
    if (!verifyScriptSettlementAt(dimension, orphan.x, orphan.z, orphan.y, biomeId, 14)) return false;
    linkSiteToExistingSettlement(gx, gz, subIndex, orphan);
    return true;
}

/**
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} [maxDist]
 * @returns {{ key: string, center: { x: number, y: number, z: number }, dist: number }|undefined}
 */
export function findBuiltSiteNearWorld(worldX, worldZ, maxDist = BUILT_SITE_LAMP_OVERLAP_DIST) {
    ensureSitesLoaded();
    let best;
    for (const key of builtSiteKeys) {
        const center = builtSiteCenters.get(key);
        if (!center) continue;
        const dist = Math.max(Math.abs(center.x - worldX), Math.abs(center.z - worldZ));
        if (dist > maxDist) continue;
        if (!best || dist < best.dist) best = { key, center, dist };
    }
    return best;
}

/**
 * After script reload: re-mark site built if village blocks remain near the lamp.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {number} [hintY]
 * @returns {boolean}
 */
export function reconcileBuiltSiteFromWorldNearLamp(dimension, gx, gz, subIndex, hintY, biomeId) {
    if (isSiteBuilt(gx, gz, subIndex)) return true;
    if (isSitePending(gx, gz, subIndex) || isSiteIncomplete(gx, gz, subIndex)) return false;
    const saved = getBuiltSiteCenter(gx, gz, subIndex);
    if (!saved) return false;
    if (verifyScriptSettlementAt(dimension, saved.x, saved.z, saved.y ?? hintY, biomeId, 14)) {
        markSiteBuilt(gx, gz, subIndex, saved);
        return true;
    }
    resetSiteSlot(gx, gz, subIndex);
    return false;
}

/**
 * Skip activation when persisted, reconciled from blocks, or linked to a nearby hub.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {number} hintY
 * @param {string|undefined} biomeId
 * @returns {boolean}
 */
/**
 * True when the registry says built and mossy-path footprint still exists at the saved center.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {number} hintY
 * @param {string|undefined} biomeId
 */
export function persistedSiteHasScriptSettlementInWorld(
    dimension,
    gx,
    gz,
    subIndex,
    hintY,
    biomeId
) {
    if (!isSiteBuilt(gx, gz, subIndex)) return false;
    const saved = getBuiltSiteCenter(gx, gz, subIndex);
    if (!saved) return true;
    return verifyScriptSettlementAt(dimension, saved.x, saved.z, saved.y ?? hintY, biomeId, 14);
}

export function shouldSkipSiteActivationForExistingSettlement(
    dimension,
    gx,
    gz,
    subIndex,
    hintY,
    biomeId
) {
    if (isSiteIncomplete(gx, gz, subIndex)) return false;
    if (isSiteBuilt(gx, gz, subIndex)) {
        const saved = getBuiltSiteCenter(gx, gz, subIndex);
        if (!saved) return true;
        if (verifyScriptSettlementAt(dimension, saved.x, saved.z, saved.y ?? hintY, biomeId, 14)) {
            return true;
        }
        if (tryLinkOrphanSettlementNearLamp(dimension, gx, gz, subIndex, hintY, biomeId)) {
            return true;
        }
        resetSiteSlot(gx, gz, subIndex);
        return false;
    }
    reconcileBuiltSiteFromWorldNearLamp(dimension, gx, gz, subIndex, hintY, biomeId);
    if (isSiteBuilt(gx, gz, subIndex)) return true;
    const lamp = lampMarkerWorldPosition(gx, gz, subIndex);
    const overlap = findBuiltSiteNearWorld(lamp.x, lamp.z, BUILT_SITE_LAMP_OVERLAP_DIST);
    if (
        overlap &&
        verifyScriptSettlementAt(dimension, overlap.center.x, overlap.center.z, overlap.center.y, biomeId, 14)
    ) {
        linkSiteToExistingSettlement(gx, gz, subIndex, overlap.center);
        return true;
    }
    if (tryLinkOrphanSettlementNearLamp(dimension, gx, gz, subIndex, hintY, biomeId)) {
        return true;
    }
    return isSiteBuilt(gx, gz, subIndex);
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {{ x: number, y: number, z: number }} center
 */
export function linkSiteToExistingSettlement(gx, gz, subIndex, center) {
    markSiteBuilt(gx, gz, subIndex, center);
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function isSiteFailed(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    return failedSiteKeys.has(siteKey(gx, gz, subIndex));
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function isSiteIncomplete(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    return incompleteSiteKeys.has(siteKey(gx, gz, subIndex));
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 * @returns {{ x: number, y: number, z: number }|undefined}
 */
export function getIncompleteSiteCenter(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    return incompleteSiteCenters.get(siteKey(gx, gz, subIndex));
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 * @param {{ x: number, y: number, z: number }} center
 */
/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 * @returns {import("./mb_abandonedSettlementStructureRegistry.js").SiteStructureManifest|undefined}
 */
export function getSiteStructureManifest(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    return siteStructureManifests.get(siteKey(gx, gz, subIndex));
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {import("./mb_abandonedSettlementStructureRegistry.js").SiteStructureManifest} manifest
 */
export function setSiteStructureManifest(gx, gz, subIndex, manifest) {
    ensureSitesLoaded();
    siteStructureManifests.set(siteKey(gx, gz, subIndex), manifest);
    persistSites();
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function clearSiteStructureManifest(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    if (siteStructureManifests.delete(siteKey(gx, gz, subIndex))) persistSites();
}

export function markSiteIncomplete(gx, gz, subIndex = 0, center) {
    ensureSitesLoaded();
    const key = siteKey(gx, gz, subIndex);
    builtSiteKeys.delete(key);
    builtSiteCenters.delete(key);
    failedSiteKeys.delete(key);
    incompleteSiteKeys.add(key);
    if (
        center &&
        typeof center.x === "number" &&
        typeof center.y === "number" &&
        typeof center.z === "number"
    ) {
        incompleteSiteCenters.set(key, {
            x: Math.floor(center.x),
            y: Math.floor(center.y),
            z: Math.floor(center.z)
        });
    }
    persistSites();
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function clearSiteIncomplete(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    const key = siteKey(gx, gz, subIndex);
    if (!incompleteSiteKeys.delete(key) && !incompleteSiteCenters.has(key)) return;
    incompleteSiteCenters.delete(key);
    persistSites();
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function isSitePending(gx, gz, subIndex = 0) {
    return pendingSiteKeys.has(siteKey(gx, gz, subIndex));
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function markSiteBuilt(gx, gz, subIndex = 0, center) {
    ensureSitesLoaded();
    const key = siteKey(gx, gz, subIndex);
    builtSiteKeys.add(key);
    failedSiteKeys.delete(key);
    incompleteSiteKeys.delete(key);
    incompleteSiteCenters.delete(key);
    siteStructureManifests.delete(key);
    pendingSiteKeys.delete(key);
    if (
        center &&
        typeof center.x === "number" &&
        typeof center.y === "number" &&
        typeof center.z === "number"
    ) {
        builtSiteCenters.set(key, {
            x: Math.floor(center.x),
            y: Math.floor(center.y),
            z: Math.floor(center.z)
        });
    }
    persistSites();
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function markSiteFailed(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    const key = siteKey(gx, gz, subIndex);
    builtSiteKeys.delete(key);
    builtSiteCenters.delete(key);
    incompleteSiteKeys.delete(key);
    incompleteSiteCenters.delete(key);
    siteStructureManifests.delete(key);
    failedSiteKeys.add(key);
    pendingSiteKeys.delete(key);
    persistSites();
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function markSitePending(gx, gz, subIndex = 0) {
    pendingSiteKeys.add(siteKey(gx, gz, subIndex));
}

/**
 * Claim a site slot so only one activation/build runs at a time (multiplayer-safe).
 * @returns {boolean} false if already built or another player/queue holds pending
 */
export function tryClaimSiteForBuild(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    const key = siteKey(gx, gz, subIndex);
    if (builtSiteKeys.has(key) || pendingSiteKeys.has(key)) return false;
    pendingSiteKeys.add(key);
    return true;
}

/**
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function clearSitePending(gx, gz, subIndex = 0) {
    pendingSiteKeys.delete(siteKey(gx, gz, subIndex));
}

/**
 * Clear built/failed/pending for a site slot (force place retry).
 * @param {number} gx
 * @param {number} gz
 * @param {number} [subIndex]
 */
export function resetSiteSlot(gx, gz, subIndex = 0) {
    ensureSitesLoaded();
    const key = siteKey(gx, gz, subIndex);
    builtSiteKeys.delete(key);
    builtSiteCenters.delete(key);
    failedSiteKeys.delete(key);
    incompleteSiteKeys.delete(key);
    incompleteSiteCenters.delete(key);
    siteStructureManifests.delete(key);
    pendingSiteKeys.delete(key);
    persistSites();
}

/**
 * Reset all slots in a grid cell (large infected has 3).
 * @param {number} gx
 * @param {number} gz
 */
export function resetSiteCell(gx, gz) {
    for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
        resetSiteSlot(gx, gz, sub);
    }
}

export function getAbandonedVillageSiteRegistryStats() {
    ensureSitesLoaded();
    return {
        built: builtSiteKeys.size,
        failed: failedSiteKeys.size,
        incomplete: incompleteSiteKeys.size,
        pending: pendingSiteKeys.size,
        gridBlocks: SITE_GRID_BLOCKS,
        largeSlotsPerCell: SITES_PER_LARGE_INFECTED_CELL
    };
}

/**
 * @param {number} ax
 * @param {number} az
 * @param {number} bx
 * @param {number} bz
 * @returns {number}
 */
export function chebyshevDistXZ(ax, az, bx, bz) {
    return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

/**
 * @param {string} key
 * @returns {{ gx: number, gz: number, sub: number }|undefined}
 */
function parseSiteKeyParts(key) {
    if (typeof key !== "string") return undefined;
    const parts = key.split(",");
    const gx = Number(parts[0]);
    const gz = Number(parts[1]);
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) return undefined;
    const sub = parts.length > 2 ? Number(parts[2]) : 0;
    return { gx, gz, sub: Number.isFinite(sub) ? sub : 0 };
}

/**
 * Registered site centers + lamp anchors for proximity checks (no full grid sweep).
 * @returns {Generator<{ x: number, z: number, kind: string }>}
 */
function* iterRegisteredSiteInterestPoints() {
    ensureSitesLoaded();
    const seen = new Set();
    for (const [key, center] of builtSiteCenters) {
        if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) {
            const id = `${center.x},${center.z}`;
            if (!seen.has(id)) {
                seen.add(id);
                yield { x: center.x, z: center.z, kind: "built" };
            }
        }
    }
    for (const [key, center] of incompleteSiteCenters) {
        if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) {
            const id = `${center.x},${center.z}`;
            if (!seen.has(id)) {
                seen.add(id);
                yield { x: center.x, z: center.z, kind: "incomplete" };
            }
        }
    }
    for (const key of pendingSiteKeys) {
        const parsed = parseSiteKeyParts(key);
        if (!parsed) continue;
        const lamp = lampMarkerWorldPosition(parsed.gx, parsed.gz, parsed.sub);
        const id = `${lamp.x},${lamp.z}`;
        if (!seen.has(id)) {
            seen.add(id);
            yield { x: lamp.x, z: lamp.z, kind: "pending" };
        }
    }
}

/**
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} [maxDist]
 * @returns {number}
 */
export function distToNearestRegisteredSiteInterest(playerX, playerZ, maxDist = Infinity) {
    let best = Infinity;
    for (const pt of iterRegisteredSiteInterestPoints()) {
        const d = chebyshevDistXZ(playerX, playerZ, pt.x, pt.z);
        if (d < best) best = d;
        if (best <= maxDist) break;
    }
    return best;
}

/**
 * Current grid cell only — theoretical lamp slot within arrival distance (56 blocks).
 * @param {number} px
 * @param {number} pz
 * @returns {boolean}
 */
export function playerNearTheoreticalLampSlot(px, pz) {
    const { gx, gz } = worldToSiteGrid(px, pz);
    for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
        const { distLamp } = getSiteActivationDistances(px, pz, gx, gz, sub);
        if (distLamp <= LAMP_ARRIVAL_DIST_MAX) return true;
    }
    return false;
}

/**
 * @param {import("@minecraft/server").Dimension|undefined} dimension
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {boolean}
 */
export function playerNearWorldgenLampMarker(dimension, px, py, pz) {
    if (!dimension) return false;
    try {
        if (findWorldgenLampMarkerNear(dimension, px, pz, py, LAMP_MARKER_SEARCH_RADIUS)) return true;
    } catch {
        /* ignore */
    }
    try {
        if (hasWorldgenLampMarkerAt(dimension, px, pz, py)) return true;
    } catch {
        /* ignore */
    }
    return false;
}

/**
 * Horizon / large-infected scan band — infected biome, registered site within 224, or placed lamp marker.
 * Does NOT use theoretical 224-block grid slots (avoids always-on interest).
 * @param {import("@minecraft/server").Dimension|undefined} dimension
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {string|undefined} playerBiome
 * @returns {boolean}
 */
export function playerInVillageApproachBand(dimension, px, py, pz, playerBiome) {
    if (infectedBiomeTierFromId(playerBiome) != null) return true;
    if (distToNearestRegisteredSiteInterest(px, pz, LAMP_APPROACH_DIST_MAX) <= LAMP_APPROACH_DIST_MAX) {
        return true;
    }
    return playerNearWorldgenLampMarker(dimension, px, py, pz);
}

/**
 * Main-loop interest: infected biome, registered site within pause dist, lamp marker, or theoretical arrival slot (56).
 * @param {import("@minecraft/server").Dimension|undefined} dimension
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {string|undefined} playerBiome
 * @returns {boolean}
 */
export function playerNearVillageInterest(dimension, px, py, pz, playerBiome) {
    if (infectedBiomeTierFromId(playerBiome) != null) return true;
    if (distToNearestRegisteredSiteInterest(px, pz, SETTLEMENT_BUILD_PAUSE_DIST) <= SETTLEMENT_BUILD_PAUSE_DIST) {
        return true;
    }
    if (playerNearWorldgenLampMarker(dimension, px, py, pz)) return true;
    return playerNearTheoreticalLampSlot(px, pz);
}

/**
 * @param {import("@minecraft/server").Player[]} players
 * @param {(dimension: import("@minecraft/server").Dimension, x: number, z: number, sampleY?: number) => string|undefined} getBiomeIdAt
 * @returns {boolean}
 */
export function anyPlayerNearLampActivation(players, getBiomeIdAt) {
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
        if (playerNearWorldgenLampMarker(dim, px, py, pz)) return true;
        if (playerNearTheoreticalLampSlot(px, pz)) return true;
    }
    return false;
}

/**
 * @param {import("@minecraft/server").Player[]} players
 * @param {(dimension: import("@minecraft/server").Dimension, x: number, z: number, sampleY?: number) => string|undefined} getBiomeIdAt
 * @returns {boolean}
 */
export function anyPlayerNearVillageInterest(players, getBiomeIdAt) {
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
        let biome;
        try {
            biome = getBiomeIdAt(dim, px, pz, py);
        } catch {
            biome = undefined;
        }
        if (playerNearVillageInterest(dim, px, py, pz, biome)) return true;
    }
    return false;
}

/**
 * Site centers within maxDist for targeted lamp cleanup (avoids 224-block grid loops).
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} maxDist
 * @returns {{ x: number, z: number, kind: string }[]}
 */
export function listRegisteredSiteInterestNearPlayer(playerX, playerZ, maxDist = LAMP_APPROACH_DIST_MAX) {
    /** @type {{ x: number, z: number, kind: string }[]} */
    const out = [];
    for (const pt of iterRegisteredSiteInterestPoints()) {
        if (chebyshevDistXZ(playerX, playerZ, pt.x, pt.z) <= maxDist) out.push(pt);
    }
    return out;
}

/**
 * @typedef {{ gx: number, gz: number, subIndex: number, x: number, z: number, cx: number, cz: number, distBlocks: number, biomeId?: string, lampArrival?: boolean }} VillageSiteCandidate
 */

/**
 * Anchor biome is sampled at y≈64; infected snow is often higher. When the player stands on
 * large infected in this grid cell, treat all three slots as large for rolls/activation.
 * @param {number} gx
 * @param {number} gz
 * @param {string|undefined} anchorBiomeId
 * @param {number} playerX
 * @param {number} playerZ
 * @param {string|undefined} playerBiomeId
 */
function effectiveBiomeForSlot(
    gx,
    gz,
    anchorBiomeId,
    playerX,
    playerZ,
    playerBiomeId,
    getBiomeIdAt,
    dimension,
    subIndex = 0,
    playerSampleY
) {
    const { distLamp } = getSiteActivationDistances(playerX, playerZ, gx, gz, subIndex);
    if (distLamp <= LAMP_ARRIVAL_DIST_MAX && getBiomeIdAt && dimension) {
        const lamp = lampMarkerWorldPosition(gx, gz, subIndex);
        const lampBiome = getBiomeIdAt(dimension, lamp.x, lamp.z, playerSampleY);
        if (lampBiome) return lampBiome;
    }
    const { gx: pgx, gz: pgz } = worldToSiteGrid(playerX, playerZ);
    if (pgx === gx && pgz === gz && infectedBiomeTierFromId(playerBiomeId) === "large") {
        return playerBiomeId ?? anchorBiomeId;
    }
    return anchorBiomeId;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {number} playerX
 * @param {number} playerZ
 * @param {(dimension: import("@minecraft/server").Dimension, x: number, z: number, sampleY?: number) => string|undefined} getBiomeIdAt
 * @param {string|undefined} [playerBiomeId]
 * @returns {VillageSiteCandidate|undefined}
 */
function buildCandidateIfReady(
    dimension,
    gx,
    gz,
    subIndex,
    playerX,
    playerZ,
    getBiomeIdAt,
    playerBiomeId,
    playerSampleY,
    opts = {}
) {
    if (isSiteBuilt(gx, gz, subIndex) || isSitePending(gx, gz, subIndex)) {
        return undefined;
    }
    if (!opts.allowFailedRetry && isSiteFailed(gx, gz, subIndex)) {
        return undefined;
    }
    const anchor = siteWorldAnchorForSlot(gx, gz, subIndex);
    const anchorBiome = getBiomeIdAt(dimension, anchor.x, anchor.z, playerSampleY);
    const biomeId = effectiveBiomeForSlot(
        gx,
        gz,
        anchorBiome,
        playerX,
        playerZ,
        playerBiomeId,
        getBiomeIdAt,
        dimension,
        subIndex,
        playerSampleY
    );
    if (subIndex > 0 && infectedBiomeTierFromId(biomeId) !== "large") {
        return undefined;
    }
    const cx = Math.floor(anchor.x / 16);
    const cz = Math.floor(anchor.z / 16);
    const { distLamp } = getSiteActivationDistances(playerX, playerZ, gx, gz, subIndex);
    return {
        gx,
        gz,
        subIndex,
        x: anchor.x,
        z: anchor.z,
        cx,
        cz,
        distBlocks: distLamp,
        biomeId,
        lampArrival: opts.lampArrival === true
    };
}

/**
 * Large infected: up to maxCount sites (3 slots per cell), relaxed distance while exploring the biome.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} scanRadiusChunks
 * @param {(dimension: import("@minecraft/server").Dimension, cx: number, cz: number) => boolean} isChunkLoaded
 * @param {(dimension: import("@minecraft/server").Dimension, x: number, z: number) => string|undefined} getBiomeIdAt
 * @param {number} [maxCount]
 */
export function findLargeInfectedSitesNeedingVillage(
    dimension,
    playerX,
    playerZ,
    scanRadiusChunks,
    isChunkLoaded,
    getBiomeIdAt,
    maxCount = LARGE_INFECTED_ACTIVATIONS_PER_SCAN,
    playerBiomeId,
    playerSampleY
) {
    ensureSitesLoaded();
    const maxDist = scanRadiusChunks * 16 + 96;
    const minDistLarge = 32;
    const { gx: gx0, gz: gz0 } = worldToSiteGrid(playerX - maxDist, playerZ - maxDist);
    const { gx: gx1, gz: gz1 } = worldToSiteGrid(playerX + maxDist, playerZ + maxDist);

    /** @type {VillageSiteCandidate[]} */
    const largeSites = [];

    for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
            for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                const cand = buildCandidateIfReady(
                    dimension,
                    gx,
                    gz,
                    sub,
                    playerX,
                    playerZ,
                    getBiomeIdAt,
                    playerBiomeId,
                    playerSampleY
                );
                if (!cand) continue;
                if (infectedBiomeTierFromId(cand.biomeId) !== "large") continue;
                if (!isSiteChunksReadyForActivation(dimension, gx, gz, sub, isChunkLoaded)) continue;
                if (cand.distBlocks > maxDist) continue;
                if (cand.distBlocks < minDistLarge && sub === 0) continue;
                largeSites.push(cand);
            }
        }
    }

    largeSites.sort((a, b) => a.distBlocks - b.distBlocks);
    return largeSites.slice(0, maxCount);
}

/** @deprecated use findLargeInfectedSitesNeedingVillage */
export function findLargeInfectedSiteNeedingVillage(
    dimension,
    playerX,
    playerZ,
    scanRadiusChunks,
    isChunkLoaded,
    getBiomeIdAt
) {
    const list = findLargeInfectedSitesNeedingVillage(
        dimension,
        playerX,
        playerZ,
        scanRadiusChunks,
        isChunkLoaded,
        getBiomeIdAt,
        1
    );
    return list[0];
}

/**
 * All slots in the player's current grid cell when standing on large infected (for guaranteed local trio).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerX
 * @param {number} playerZ
 * @param {(dimension: import("@minecraft/server").Dimension, x: number, z: number) => string|undefined} getBiomeIdAt
 */
export function largeInfectedSlotsNearPlayer(
    dimension,
    playerX,
    playerZ,
    getBiomeIdAt,
    playerBiomeId,
    playerSampleY
) {
    if (infectedBiomeTierFromId(playerBiomeId) !== "large") {
        return [];
    }
    const { gx, gz } = worldToSiteGrid(playerX, playerZ);
    /** @type {VillageSiteCandidate[]} */
    const out = [];
    for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
        const cand = buildCandidateIfReady(
            dimension,
            gx,
            gz,
            sub,
            playerX,
            playerZ,
            getBiomeIdAt,
            playerBiomeId,
            playerSampleY
        );
        if (!cand) continue;
        out.push(cand);
    }
    return out;
}

/**
 * Sites whose worldgen lamp is within walking distance — used before horizon scan.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerX
 * @param {number} playerZ
 * @param {(dimension: import("@minecraft/server").Dimension, cx: number, cz: number) => boolean} isChunkLoaded
 * @param {(dimension: import("@minecraft/server").Dimension, x: number, z: number, sampleY?: number) => string|undefined} getBiomeIdAt
 * @param {string|undefined} playerBiomeId
 * @param {number} [playerSampleY]
 */
/**
 * One site slot when the player is at/near the lamp (for cleanup → build hook).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} gx
 * @param {number} gz
 * @param {number} subIndex
 * @param {number} playerX
 * @param {number} playerZ
 * @param {(dimension: import("@minecraft/server").Dimension, x: number, z: number, sampleY?: number) => string|undefined} getBiomeIdAt
 * @param {string|undefined} playerBiomeId
 * @param {number} [playerSampleY]
 * @returns {VillageSiteCandidate|undefined}
 */
export function lampArrivalCandidateAtGrid(
    dimension,
    gx,
    gz,
    subIndex,
    playerX,
    playerZ,
    getBiomeIdAt,
    playerBiomeId,
    playerSampleY
) {
    const { distLamp } = getSiteActivationDistances(playerX, playerZ, gx, gz, subIndex);
    if (distLamp > LAMP_ARRIVAL_DIST_MAX) return undefined;
    const lamp = lampMarkerWorldPosition(gx, gz, subIndex);
    if (!hasWorldgenLampMarkerAt(dimension, lamp.x, lamp.z, playerSampleY)) return undefined;
    clearSiteFailedForLampArrival(gx, gz, subIndex);
    return buildCandidateIfReady(
        dimension,
        gx,
        gz,
        subIndex,
        playerX,
        playerZ,
        getBiomeIdAt,
        playerBiomeId,
        playerSampleY,
        { lampArrival: true }
    );
}

export function collectLampArrivalSitesNearPlayer(
    dimension,
    playerX,
    playerZ,
    isChunkLoaded,
    getBiomeIdAt,
    playerBiomeId,
    playerSampleY
) {
    ensureSitesLoaded();
    const range = LAMP_ARRIVAL_DIST_MAX + SITE_GRID_BLOCKS;
    const gx0 = Math.floor((playerX - range) / SITE_GRID_BLOCKS);
    const gx1 = Math.floor((playerX + range) / SITE_GRID_BLOCKS);
    const gz0 = Math.floor((playerZ - range) / SITE_GRID_BLOCKS);
    const gz1 = Math.floor((playerZ + range) / SITE_GRID_BLOCKS);

    /** @type {VillageSiteCandidate[]} */
    const out = [];
    /** @type {Set<string>} */
    const seen = new Set();

    const tryAddLampSlot = (gx, gz, sub) => {
        const key = siteKey(gx, gz, sub);
        if (seen.has(key)) return;
        const { distLamp } = getSiteActivationDistances(playerX, playerZ, gx, gz, sub);
        if (distLamp > LAMP_ARRIVAL_DIST_MAX + LAMP_MARKER_SEARCH_RADIUS) return;
        const lamp = lampMarkerWorldPosition(gx, gz, sub);
        if (!hasWorldgenLampMarkerAt(dimension, lamp.x, lamp.z, playerSampleY)) return;
        clearSiteFailedForLampArrival(gx, gz, sub);
        const cand = buildCandidateIfReady(
            dimension,
            gx,
            gz,
            sub,
            playerX,
            playerZ,
            getBiomeIdAt,
            playerBiomeId,
            playerSampleY,
            { lampArrival: true }
        );
        if (!cand) return;
        if (
            !isSiteChunksReadyForActivation(dimension, gx, gz, sub, isChunkLoaded, {
                allowAnchorUnloaded: true
            })
        ) {
            return;
        }
        seen.add(key);
        out.push(cand);
    };

    const feetHit = findWorldgenLampMarkerNear(dimension, playerX, playerZ, playerSampleY);
    if (feetHit) {
        const distToPost = Math.max(Math.abs(feetHit.x - playerX), Math.abs(feetHit.z - playerZ));
        if (distToPost <= LAMP_ARRIVAL_DIST_MAX) {
            const { gx: fgx, gz: fgz } = worldToSiteGrid(feetHit.x, feetHit.z);
            for (let dgx = -1; dgx <= 1; dgx++) {
                for (let dgz = -1; dgz <= 1; dgz++) {
                    for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                        const snap = lampMarkerWorldPosition(fgx + dgx, fgz + dgz, sub);
                        if (
                            Math.max(Math.abs(snap.x - feetHit.x), Math.abs(snap.z - feetHit.z)) >
                            LAMP_MARKER_SEARCH_RADIUS
                        ) {
                            continue;
                        }
                        tryAddLampSlot(fgx + dgx, fgz + dgz, sub);
                    }
                }
            }
        }
    }

    for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
            for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                tryAddLampSlot(gx, gz, sub);
            }
        }
    }

    out.sort((a, b) => a.distBlocks - b.distBlocks);
    return out;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} scanRadiusChunks
 * @param {number} minPlaceChunkDist
 * @param {(dimension: import("@minecraft/server").Dimension, cx: number, cz: number) => boolean} isChunkLoaded
 * @param {(dimension: import("@minecraft/server").Dimension, cx: number, cz: number) => number} getInfectedProx
 * @param {(dimension: import("@minecraft/server").Dimension, x: number, z: number) => string|undefined} getBiomeIdAt
 */
export function collectActivatableSitesNearPlayer(
    dimension,
    playerX,
    playerZ,
    scanRadiusChunks,
    minPlaceChunkDist,
    isChunkLoaded,
    getInfectedProx,
    getBiomeIdAt,
    playerBiomeId,
    playerSampleY
) {
    ensureSitesLoaded();
    const playerLarge = infectedBiomeTierFromId(playerBiomeId) === "large";
    const minHorizon = playerLarge ? Math.max(64, (minPlaceChunkDist - 2) * 16) : minPlaceChunkDist * 16;
    const maxHorizon = scanRadiusChunks * 16 + SITE_GRID_BLOCKS;

    const gx0 = Math.floor((playerX - maxHorizon) / SITE_GRID_BLOCKS);
    const gx1 = Math.floor((playerX + maxHorizon) / SITE_GRID_BLOCKS);
    const gz0 = Math.floor((playerZ - maxHorizon) / SITE_GRID_BLOCKS);
    const gz1 = Math.floor((playerZ + maxHorizon) / SITE_GRID_BLOCKS);
    const { gx: pgx, gz: pgz } = worldToSiteGrid(playerX, playerZ);
    const playerOnLarge = infectedBiomeTierFromId(playerBiomeId) === "large";

    /** @type {VillageSiteCandidate[]} */
    const all = [];
    /** @type {Map<string, number>} */
    const proxCache = new Map();

    for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
            for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                if (sub > 0 && pgx === gx && pgz === gz && !playerOnLarge) {
                    continue;
                }
                const cand = buildCandidateIfReady(
                    dimension,
                    gx,
                    gz,
                    sub,
                    playerX,
                    playerZ,
                    getBiomeIdAt,
                    playerBiomeId,
                    playerSampleY
                );
                if (!cand) continue;
                const { distLamp } = getSiteActivationDistances(playerX, playerZ, gx, gz, sub);
                const pass = sitePassesActivationDistance(distLamp, minHorizon, maxHorizon);
                if (!pass.ok || pass.mode === "arrival") continue;
                if (!isSiteChunksReadyForActivation(dimension, gx, gz, sub, isChunkLoaded)) continue;
                const proxKey = `${cand.cx},${cand.cz}`;
                let infectedProx = proxCache.get(proxKey);
                if (infectedProx === undefined) {
                    infectedProx = getInfectedProx(dimension, cand.cx, cand.cz);
                    proxCache.set(proxKey, infectedProx);
                }
                if (!sitePassesSeedRoll(gx, gz, infectedProx, cand.biomeId)) continue;
                all.push(cand);
            }
        }
    }

    all.sort((a, b) => b.distBlocks - a.distBlocks);
    return all;
}

export function summarizeSiteScanNearPlayer(
    dimension,
    playerX,
    playerZ,
    scanRadiusChunks,
    minPlaceChunkDist,
    isChunkLoaded,
    getInfectedProx,
    getBiomeIdAt,
    playerBiomeId,
    playerSampleY
) {
    ensureSitesLoaded();
    const playerLarge = infectedBiomeTierFromId(playerBiomeId) === "large";
    const minHorizon = playerLarge ? Math.max(64, (minPlaceChunkDist - 2) * 16) : minPlaceChunkDist * 16;
    const maxHorizon = scanRadiusChunks * 16 + SITE_GRID_BLOCKS;
    const { gx: gx0, gz: gz0 } = worldToSiteGrid(
        playerX - maxHorizon - SITE_GRID_BLOCKS,
        playerZ - maxHorizon - SITE_GRID_BLOCKS
    );
    const { gx: gx1, gz: gz1 } = worldToSiteGrid(
        playerX + maxHorizon + SITE_GRID_BLOCKS,
        playerZ + maxHorizon + SITE_GRID_BLOCKS
    );

    const stats = {
        cells: 0,
        slots: 0,
        built: 0,
        failed: 0,
        pending: 0,
        tooClose: 0,
        tooFar: 0,
        notLoaded: 0,
        notLoadedLamp: 0,
        arrival: 0,
        rollMiss: 0,
        largeSlots: 0,
        ok: 0
    };

    for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
            stats.cells++;
            for (let sub = 0; sub < SITES_PER_LARGE_INFECTED_CELL; sub++) {
                stats.slots++;
                if (isSiteBuilt(gx, gz, sub)) {
                    stats.built++;
                    continue;
                }
                if (isSiteFailed(gx, gz, sub)) {
                    stats.failed++;
                    continue;
                }
                if (isSitePending(gx, gz, sub)) {
                    stats.pending++;
                    continue;
                }
                const anchor = siteWorldAnchorForSlot(gx, gz, sub);
                const anchorBiome = getBiomeIdAt(dimension, anchor.x, anchor.z, playerSampleY);
                const biomeId = effectiveBiomeForSlot(
                    gx,
                    gz,
                    anchorBiome,
                    playerX,
                    playerZ,
                    playerBiomeId,
                    getBiomeIdAt,
                    dimension,
                    sub,
                    playerSampleY
                );
                if (sub > 0 && infectedBiomeTierFromId(biomeId) !== "large") continue;
                if (infectedBiomeTierFromId(biomeId) === "large") stats.largeSlots++;
                const { distLamp } = getSiteActivationDistances(playerX, playerZ, gx, gz, sub);
                const pass = sitePassesActivationDistance(distLamp, minHorizon, maxHorizon);
                if (!pass.ok) {
                    if (distLamp < LAMP_ARRIVAL_DIST_MIN) stats.tooClose++;
                    else stats.tooFar++;
                    continue;
                }
                if (pass.mode === "arrival") {
                    stats.arrival++;
                    if (
                        !isSiteChunksReadyForActivation(dimension, gx, gz, sub, isChunkLoaded, {
                            allowAnchorUnloaded: true
                        })
                    ) {
                        stats.notLoadedLamp++;
                    }
                    continue;
                }
                if (!isSiteChunksReadyForActivation(dimension, gx, gz, sub, isChunkLoaded)) {
                    stats.notLoaded++;
                    continue;
                }
                const anchorCx = Math.floor(anchor.x / 16);
                const anchorCz = Math.floor(anchor.z / 16);
                const infectedProx = getInfectedProx(dimension, anchorCx, anchorCz);
                if (!sitePassesSeedRoll(gx, gz, infectedProx, biomeId)) {
                    stats.rollMiss++;
                    continue;
                }
                stats.ok++;
            }
        }
    }
    return stats;
}

/**
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} [subIndex]
 */
export function siteCandidateAtWorld(worldX, worldZ, subIndex = 0) {
    const { gx, gz } = worldToSiteGrid(worldX, worldZ);
    const anchor = siteWorldAnchorForSlot(gx, gz, subIndex);
    return {
        gx,
        gz,
        subIndex,
        x: anchor.x,
        z: anchor.z,
        cx: Math.floor(anchor.x / 16),
        cz: Math.floor(anchor.z / 16),
        distBlocks: 0
    };
}

