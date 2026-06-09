/**
 * Procedural settlement footprints: 50 house variants per ruleset, workstation buildings, meeting points.
 */

import {
    appendBasementCellarStorage,
    appendFloorPantryToPlan,
    applyStructureLootToPlan,
    houseLootKeyForRuleset,
    houseStorageLootForVariant,
    stripHousePantryStorageFromPlan
} from "./mb_villageChestLoot.js";

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} salt
 * @param {number} modulus
 */
function hashChunkRoll(cx, cz, salt, modulus) {
    if (modulus <= 0) return 0;
    let h = (cx * 3418731285) ^ (cz * 1328979879) ^ (salt * 974531);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) % modulus;
}

/** @typedef {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} SettlementRuleset */
/** @typedef {import("./mb_abandonedSettlementBuilder.js").SettlementTier} SettlementTier */

/** @typedef {import("./mb_villageChestLoot.js").LootSlot} LootSlot */
/** @typedef {{ lx: number, lz: number, id: string, loot?: string, lootSlot?: LootSlot, floor?: 1|2|3, zone?: "basement" }} InteriorSpec */
/** @typedef {{ lx: number, lz0: number, lz1: number }|{ lz: number, lx0: number, lx1: number }} PartitionSpec */
/** @typedef {{ ox: number, oz: number, w: number, d: number, wallH?: number, buildStyle?: "wood"|"stone", role?: string }} AppendageSpec */
/** @typedef {{ doorArc?: boolean, columns?: boolean, gableTrim?: boolean }} FacadeSpec */
/**
 * @typedef {{
 *   id: string,
 *   w: number,
 *   d: number,
 *   wallH: number,
 *   cobCount: number,
 *   glassChance: number,
 *   stories?: 1|2|3,
 *   midFloorH?: number,
 *   midFloorLevels?: number[],
 *   buildStyle?: "wood"|"stone",
 *   occupied?: (lx: number, lz: number, w: number, d: number) => boolean,
 *   appendages?: AppendageSpec[],
 *   basementDepth?: 3|4|5,
 *   basementFloor?: (lx: number, lz: number, w: number, d: number) => "log"|"plank"|"stone"|"skip",
 *   basementHatch?: { lx: number, lz: number },
 *   floorPantry?: { lx: number, lz: number },
 *   roofStyle?: "flat"|"shed"|"peaked"|"steeple",
 *   roofFramed?: boolean,
 *   roofDeck?: boolean,
 *   facade?: FacadeSpec,
 *   wallHAt?: (lx: number, lz: number) => number,
 *   floor: (lx: number, lz: number, w: number, d: number) => "log"|"plank"|"stone"|"skip",
 *   interior: InteriorSpec[],
 *   partitions?: PartitionSpec[],
 *   dogtrot?: { wingDoorInset: number },
 *   lWingWide?: boolean
 * }} HousePlan
 */

/** Universal catalog (0–49) + biome-exclusive shaped shells (50–69). */
export const HOUSE_UNIVERSAL_COUNT = 50;
export const HOUSE_VARIANT_COUNT = 70;

/** @param {number} lx @param {number} lz @param {number} w @param {number} d */
function corner(lx, lz, w, d) {
    return (lx === 0 || lx === w - 1) && (lz === 0 || lz === d - 1);
}

/** @param {number} lx @param {number} lz @param {number} w @param {number} d */
function edge(lx, lz, w, d) {
    return lx === 0 || lx === w - 1 || lz === 0 || lz === d - 1;
}

/** @param {number} lx @param {number} lz @param {number} w @param {number} d */
function interiorCell(lx, lz, w, d) {
    return lx >= 1 && lx < w - 1 && lz >= 1 && lz < d - 1;
}

/**
 * @param {number} inner
 * @returns {(lx: number, lz: number, w: number, d: number) => boolean}
 */
function openCenterMask(inner) {
    return (lx, lz, w, d) => {
        const x0 = Math.floor((w - inner) / 2);
        const z0 = Math.floor((d - inner) / 2);
        if (lx >= x0 && lx < x0 + inner && lz >= z0 && lz < z0 + inner) return false;
        return true;
    };
}

/** L-wing: omit rear-right quadrant. */
function lWingMask(lx, lz, w, d) {
    const cutX = Math.max(2, Math.floor(w * 0.55));
    const cutZ = Math.max(2, Math.floor(d * 0.45));
    if (lx >= cutX && lz >= cutZ) return false;
    return true;
}

/** Large L-house: wide front bar + tall left stem (both wings generous). */
function lWingHouseMask(lx, lz, w, d) {
    const barDepth = Math.max(4, Math.floor(d * 0.42));
    const stemWidth = Math.max(6, Math.floor(w * 0.52));
    if (lz < barDepth) return true;
    if (lx < stemWidth) return true;
    return false;
}

/** Dogtrot: two side pens with open 2-wide breezeway. */
function dogtrotMask(lx, lz, w, d) {
    const mid = Math.floor(w / 2);
    if (lx >= mid - 1 && lx <= mid && interiorCell(lx, lz, w, d)) return false;
    return true;
}

/** T-shape: wide bar across top + stem down center. */
function tShapeMask(lx, lz, w, d) {
    const stemW = Math.max(3, Math.floor(w / 3));
    const stemX0 = Math.floor((w - stemW) / 2);
    const barD = Math.max(2, Math.floor(d / 3));
    if (lz < barD) return true;
    if (lx >= stemX0 && lx < stemX0 + stemW) return true;
    return false;
}

/** H-plan wing depth in blocks (wider than legacy w/4 for usable bedrooms). */
function hPlanWingWidth(w) {
    return Math.max(3, Math.min(Math.floor(w / 3), Math.floor((w - 1) / 3)));
}

/** H-plan: two side wings connected by narrow center bar. */
function hPlanMask(lx, lz, w, d) {
    const wingW = hPlanWingWidth(w);
    const barZ0 = Math.floor(d / 3);
    const barZ1 = d - barZ0 - 1;
    const inBar = lz >= barZ0 && lz <= barZ1;
    if (lx < wingW || lx >= w - wingW) return true;
    if (inBar && lx >= wingW && lx < w - wingW) return true;
    return false;
}

/** Inset bed foot cell inside an H-plan wing (not in the courtyard gap). */
function hPlanWingBedLx(w, side) {
    const wingW = hPlanWingWidth(w);
    return side === "left" ? wingW - 1 : w - wingW;
}

/** U-plan: three sides around open courtyard facing door (south). */
function uPlanMask(lx, lz, w, d) {
    const courtD = Math.max(2, Math.floor(d / 3));
    const courtX0 = Math.floor(w / 4);
    const courtX1 = w - courtX0 - 1;
    if (lz >= d - courtD && lx > courtX0 && lx < courtX1) return false;
    return true;
}

/** Cross nave + transept for churches (wide enough to walk). */
function crossMask(lx, lz, w, d) {
    const cx = Math.floor(w / 2);
    const cz = Math.floor(d / 2);
    const naveW = Math.max(2, Math.floor(w / 4));
    const trW = Math.max(3, Math.floor(d / 3));
    const inNave = Math.abs(lx - cx) <= naveW;
    const inTransept = Math.abs(lz - cz) <= trW;
    return inNave || inTransept;
}

/** Standing L: long nave + transept wing (vanilla church silhouette). */
function churchLMask(lx, lz, w, d) {
    const naveW = Math.max(5, Math.floor(w * 0.48));
    const naveX0 = w - naveW;
    const wingZ0 = Math.max(2, Math.floor(d * 0.34));
    const wingZ1 = wingZ0 + Math.max(4, Math.floor(d * 0.22));
    const wingDepth = Math.max(4, Math.floor(w * 0.38));
    if (lx >= naveX0) return true;
    if (lz >= wingZ0 && lz <= wingZ1 && lx >= naveX0 - wingDepth && lx < naveX0) return true;
    if (lz < Math.max(3, Math.floor(d * 0.15)) && lx >= naveX0 - 2) return true;
    return false;
}

/**
 * Solid worship-hall floor inside a mask (no random skip gaps).
 * @param {(lx: number, lz: number, w: number, d: number) => boolean} [mask]
 * @param {"stone"|"plank"|"log"} floorKind
 */
function churchSolidFloor(mask, floorKind) {
    if (mask) {
        return (lx, lz, w, d) => (mask(lx, lz, w, d) ? floorKind : "skip");
    }
    return () => floorKind;
}

/** C-shape: three sides open on one long face. */
function cShapeMask(lx, lz, w, d) {
    const wingD = Math.max(3, Math.floor(d * 0.55));
    const cutX = Math.max(2, Math.floor(w * 0.35));
    if (lx >= cutX && lz < wingD) return false;
    return true;
}

/** Longhouse: enclosed rear + sides, open front bay. */
function longhouseMask(lx, lz, w, d) {
    if (edge(lx, lz, w, d)) return true;
    return lz >= Math.max(2, Math.floor(d / 3));
}

/** Desert arcade: solid back row + side wings, open front. */
function arcadeMask(lx, lz, w, d) {
    if (lz >= d - 2) return true;
    if (lx <= 1 || lx >= w - 2) return true;
    if (lz <= Math.floor(d / 3)) return true;
    return false;
}

/** Jungle stilt deck: center bay open (air under floor). */
function stiltOpenBayMask(lx, lz, w, d) {
    const x0 = Math.floor(w / 3);
    const x1 = w - x0;
    const z0 = Math.floor(d / 4);
    const z1 = d - z0;
    if (lx > x0 && lx < x1 && lz > z0 && lz < z1 && interiorCell(lx, lz, w, d)) return false;
    return true;
}

/** Plus / small cross footprint. */
function plusMask(lx, lz, w, d) {
    const cx = Math.floor(w / 2);
    const cz = Math.floor(d / 2);
    const arm = Math.max(1, Math.floor(Math.min(w, d) / 4));
    if (Math.abs(lx - cx) <= arm) return true;
    if (Math.abs(lz - cz) <= arm) return true;
    return false;
}

/** Cut corners for octagon-ish outline. */
function octagonMask(lx, lz, w, d) {
    if (lx === 0 && lz === 0) return false;
    if (lx === w - 1 && lz === 0) return false;
    if (lx === 0 && lz === d - 1) return false;
    if (lx === w - 1 && lz === d - 1) return false;
    return true;
}

/** Biome-exclusive variant indices (50–69). */
const BIOME_EXCLUSIVE_BY_RULESET = /** @type {Record<SettlementRuleset, number[]>} */ ({
    plains: [50, 51, 69],
    desert: [52, 53, 54],
    savanna: [55, 56],
    jungle: [57, 58, 59],
    taiga: [60, 61, 62],
    snowy: [63, 64, 65],
    ice: [63, 64, 65],
    infected: [66, 67, 68]
});

/** Universal variants with non-rect silhouettes (masks, wings, courtyards). */
const SHAPED_UNIVERSAL_VARIANTS = [
    5, 6, 10, 11, 15, 16, 32, 33, 34, 36, 37, 38, 40, 41, 43, 44, 45, 46, 47
];

/** Loft: open upper air over rear half (builder uses occupied skip). */
function loftOpenMask(lx, lz, w, d) {
    if (lz >= Math.floor(d / 2) && interiorCell(lx, lz, w, d)) return false;
    return true;
}

/** @type {Omit<HousePlan, "floor"|"interior"|"partitions">[]} */
const HOUSE_SHELLS = [
    { id: "small_1", w: 7, d: 7, wallH: 3, cobCount: 4, glassChance: 38 },
    { id: "small_2", w: 7, d: 6, wallH: 3, cobCount: 5, glassChance: 42 },
    { id: "medium_1", w: 7, d: 7, wallH: 3, cobCount: 5, glassChance: 40 },
    { id: "medium_2", w: 8, d: 6, wallH: 3, cobCount: 6, glassChance: 45 },
    { id: "medium_3", w: 7, d: 6, wallH: 3, cobCount: 6, glassChance: 35 },
    { id: "tall_1", w: 5, d: 6, wallH: 4, cobCount: 6, glassChance: 30 },
    { id: "wide_1", w: 8, d: 6, wallH: 3, cobCount: 7, glassChance: 48, roofStyle: "peaked", roofFramed: true },
    { id: "wide_2", w: 7, d: 7, wallH: 3, cobCount: 7, glassChance: 42 },
    { id: "narrow_1", w: 5, d: 7, wallH: 3, cobCount: 5, glassChance: 36 },
    { id: "narrow_2", w: 6, d: 8, wallH: 3, cobCount: 6, glassChance: 40 },
    { id: "loft_1", w: 7, d: 5, wallH: 4, cobCount: 6, glassChance: 44 },
    { id: "l_wing_house", w: 12, d: 10, wallH: 3, cobCount: 8, glassChance: 44, roofStyle: "peaked", roofFramed: true },
    { id: "two_story_a", w: 7, d: 6, wallH: 6, cobCount: 7, glassChance: 40, stories: 2, midFloorH: 3 },
    { id: "two_story_b", w: 8, d: 7, wallH: 6, cobCount: 8, glassChance: 42, stories: 2, midFloorH: 3 },
    { id: "wide_3", w: 9, d: 6, wallH: 3, cobCount: 8, glassChance: 44, roofStyle: "peaked", roofFramed: true },
    { id: "courtyard", w: 10, d: 10, wallH: 3, cobCount: 7, glassChance: 50 },
    { id: "shed", w: 5, d: 8, wallH: 3, cobCount: 4, glassChance: 32, roofStyle: "shed" },
    { id: "long_hall", w: 9, d: 5, wallH: 3, cobCount: 6, glassChance: 38 },
    { id: "two_story_c", w: 7, d: 7, wallH: 6, cobCount: 7, glassChance: 41, stories: 2, midFloorH: 3 },
    { id: "two_story_d", w: 8, d: 6, wallH: 6, cobCount: 8, glassChance: 43, stories: 2, midFloorH: 3 },
    { id: "cottage_thatch", w: 5, d: 6, wallH: 3, cobCount: 4, glassChance: 44, roofStyle: "shed" },
    { id: "cottage_hermit", w: 7, d: 7, wallH: 3, cobCount: 3, glassChance: 28 },
    { id: "cottage_bee", w: 6, d: 5, wallH: 3, cobCount: 4, glassChance: 46 },
    { id: "cottage_stone_chimney", w: 6, d: 6, wallH: 3, cobCount: 5, glassChance: 36 },
    { id: "cottage_porch", w: 6, d: 6, wallH: 3, cobCount: 5, glassChance: 42, facade: { columns: true } },
    { id: "cottage_split", w: 6, d: 6, wallH: 3, cobCount: 5, glassChance: 40 },
    { id: "row_2bay", w: 5, d: 9, wallH: 3, cobCount: 6, glassChance: 34 },
    { id: "row_3bay", w: 6, d: 10, wallH: 5, cobCount: 7, glassChance: 38, roofStyle: "shed" },
    { id: "row_shopfront", w: 6, d: 8, wallH: 3, cobCount: 5, glassChance: 58, facade: { doorArc: true } },
    { id: "row_dormer", w: 5, d: 9, wallH: 4, cobCount: 6, glassChance: 40, roofStyle: "shed" },
    { id: "duplex", w: 7, d: 8, wallH: 3, cobCount: 7, glassChance: 42 },
    { id: "farmhouse_saltbox", w: 8, d: 7, wallH: 3, cobCount: 7, glassChance: 44, roofStyle: "shed" },
    { id: "farmhouse_dogtrot", w: 13, d: 8, wallH: 3, cobCount: 8, glassChance: 46, roofStyle: "shed" },
    { id: "farmhouse_t_shaped", w: 9, d: 9, wallH: 3, cobCount: 8, glassChance: 42, roofStyle: "peaked", roofFramed: true },
    { id: "barnhouse", w: 9, d: 7, wallH: 4, cobCount: 7, glassChance: 35, roofStyle: "shed" },
    { id: "granary_ruin", w: 7, d: 7, wallH: 5, cobCount: 6, glassChance: 32, stories: 2, midFloorH: 3 },
    { id: "stable_loft", w: 8, d: 6, wallH: 4, cobCount: 5, glassChance: 30, roofStyle: "shed" },
    { id: "manor_h", w: 11, d: 11, wallH: 4, cobCount: 9, glassChance: 48, roofStyle: "peaked", roofFramed: true },
    { id: "manor_u", w: 9, d: 8, wallH: 4, cobCount: 8, glassChance: 46, roofStyle: "peaked", roofFramed: true },
    { id: "manor_library", w: 8, d: 7, wallH: 6, cobCount: 8, glassChance: 52, stories: 2, midFloorH: 3 },
    { id: "inn_tavern", w: 10, d: 8, wallH: 4, cobCount: 9, glassChance: 50, facade: { doorArc: true, gableTrim: true } },
    { id: "merchant_house", w: 8, d: 7, wallH: 3, cobCount: 7, glassChance: 48 },
    { id: "townhouse_3story", w: 6, d: 7, wallH: 9, cobCount: 8, glassChance: 42, stories: 3, midFloorLevels: [3, 6] },
    { id: "tower_house", w: 7, d: 7, wallH: 9, cobCount: 7, glassChance: 38, stories: 3, midFloorLevels: [3, 6], roofStyle: "peaked" },
    { id: "split_level", w: 7, d: 6, wallH: 4, cobCount: 6, glassChance: 40, hasCellar: true },
    { id: "attic_crawl", w: 6, d: 7, wallH: 5, cobCount: 5, glassChance: 36, roofStyle: "shed" },
    { id: "two_story_e", w: 9, d: 7, wallH: 6, cobCount: 8, glassChance: 44, stories: 2, midFloorH: 3 },
    { id: "two_story_f", w: 6, d: 9, wallH: 6, cobCount: 7, glassChance: 41, stories: 2, midFloorH: 3 },
    { id: "cellar_cottage", w: 6, d: 6, wallH: 3, cobCount: 5, glassChance: 34, hasCellar: true },
    { id: "crypt_house", w: 7, d: 7, wallH: 3, cobCount: 7, glassChance: 30, buildStyle: "stone", hasCellar: true },
    { id: "plains_gabled_el", w: 9, d: 7, wallH: 4, cobCount: 7, glassChance: 46, roofStyle: "peaked", roofFramed: true, facade: { gableTrim: true, columns: true } },
    { id: "plains_wrap_farm", w: 10, d: 8, wallH: 3, cobCount: 8, glassChance: 44, roofStyle: "shed" },
    { id: "desert_riad", w: 9, d: 9, wallH: 3, cobCount: 6, glassChance: 42, buildStyle: "stone", roofStyle: "flat", roofDeck: true },
    { id: "desert_arcade", w: 11, d: 7, wallH: 3, cobCount: 7, glassChance: 38, buildStyle: "stone", roofStyle: "flat", facade: { columns: true } },
    { id: "desert_minaret", w: 7, d: 10, wallH: 5, cobCount: 8, glassChance: 48, buildStyle: "stone", roofStyle: "steeple" },
    { id: "savanna_kraal", w: 9, d: 9, wallH: 3, cobCount: 6, glassChance: 40, roofStyle: "peaked", roofFramed: true },
    { id: "savanna_baobab_shade", w: 8, d: 7, wallH: 3, cobCount: 6, glassChance: 44, roofStyle: "shed", facade: { columns: true } },
    { id: "jungle_stilt_lodge", w: 10, d: 8, wallH: 4, cobCount: 7, glassChance: 50, roofStyle: "shed" },
    { id: "jungle_canopy_hall", w: 9, d: 9, wallH: 4, cobCount: 8, glassChance: 52, roofStyle: "peaked", roofFramed: true },
    { id: "jungle_treetop_ruin", w: 7, d: 9, wallH: 6, cobCount: 7, glassChance: 48, stories: 2, midFloorH: 3, roofStyle: "peaked" },
    { id: "taiga_log_l", w: 8, d: 8, wallH: 4, cobCount: 7, glassChance: 36, roofStyle: "peaked", roofFramed: true },
    { id: "taiga_longhouse", w: 11, d: 6, wallH: 3, cobCount: 6, glassChance: 32, roofStyle: "shed" },
    { id: "taiga_smoke_cabin", w: 7, d: 7, wallH: 3, cobCount: 6, glassChance: 34, roofStyle: "peaked", roofFramed: true, hasCellar: true },
    { id: "snowy_aframe", w: 7, d: 8, wallH: 4, cobCount: 6, glassChance: 38, roofStyle: "peaked", roofFramed: true },
    { id: "ice_fisher_dock", w: 8, d: 7, wallH: 3, cobCount: 6, glassChance: 42, roofStyle: "shed" },
    { id: "ice_drifting_shed", w: 6, d: 9, wallH: 3, cobCount: 5, glassChance: 30, roofStyle: "shed" },
    { id: "infected_blighted_wing", w: 9, d: 9, wallH: 4, cobCount: 9, glassChance: 28, roofStyle: "peaked" },
    { id: "infected_spire_shack", w: 6, d: 10, wallH: 5, cobCount: 8, glassChance: 26, roofStyle: "steeple", buildStyle: "stone" },
    { id: "infected_corrupted_h", w: 10, d: 9, wallH: 4, cobCount: 10, glassChance: 30, buildStyle: "stone", roofStyle: "peaked" },
    { id: "meadow_bloom_court", w: 8, d: 8, wallH: 3, cobCount: 6, glassChance: 52, roofStyle: "peaked", roofFramed: true }
];

/**
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 */
function floorForVariant(variant, w, d) {
    const v = variant % HOUSE_VARIANT_COUNT;
    switch (v) {
        case 0:
            return (lx, lz) => (corner(lx, lz, w, d) ? "log" : "plank");
        case 1:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (lx === Math.floor(w / 2)) return "log";
                return "plank";
            };
        case 2:
            return (lx, lz) => (edge(lx, lz, w, d) ? "log" : "plank");
        case 3:
            return (lx, lz) => ((lx + lz) % 2 === 0 ? "log" : "plank");
        case 4:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (lz === Math.floor(d / 2)) return "log";
                return "plank";
            };
        case 5:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (hashChunkRoll(lx, lz, 17, 100) < 55) return "plank";
                return "skip";
            };
        case 6:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (lz <= 2) return "plank";
                return "log";
            };
        case 7:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (interiorCell(lx, lz, w, d) && (lx + lz) % 3 === 0) return "log";
                return "plank";
            };
        case 8:
            return (lx, lz) => (lz < Math.floor(d / 2) ? "plank" : "log");
        case 9:
            return (lx, lz) => (lx < Math.floor(w / 2) ? "log" : "plank");
        case 10:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (lz >= Math.floor(d / 2)) return "skip";
                return "plank";
            };
        case 11:
            return (lx, lz) => {
                if (!lWingHouseMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 12:
        case 13:
        case 18:
        case 19:
        case 46:
        case 47:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (lx === 1 || lx === w - 2 || lz === 1 || lz === d - 2) return "log";
                return "plank";
            };
        case 14:
            return (lx, lz) => (lx === Math.floor(w / 2) || lz === 0 ? "log" : "plank");
        case 15:
            return (lx, lz) => {
                if (!openCenterMask(3)(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 16:
            return (lx, lz) => (lz < 2 ? "log" : hashChunkRoll(lx, lz, 16, 100) < 40 ? "plank" : "skip");
        case 17:
            return (lx, lz) => (lx % 2 === 0 ? "log" : "plank");
        case 20:
            return (lx, lz) => (edge(lx, lz, w, d) ? "log" : hashChunkRoll(lx, lz, 20, 100) < 70 ? "plank" : "skip");
        case 21:
            return (lx, lz) => (corner(lx, lz, w, d) ? "log" : "plank");
        case 22:
            return (lx, lz) => ((lx + lz) % 2 === 0 ? "log" : "plank");
        case 23:
            return (lx, lz) => (edge(lx, lz, w, d) ? "log" : "stone");
        case 24:
        case 25:
            return (lx, lz) => (corner(lx, lz, w, d) ? "log" : "plank");
        case 26:
            return (lx, lz) => (lz % 3 === 0 ? "log" : "plank");
        case 27:
            return (lx, lz) => (lx === Math.floor(w / 2) ? "log" : "plank");
        case 28:
            return (lx, lz) => (lz === 0 ? "log" : "plank");
        case 29:
            return (lx, lz) => (lz < 2 ? "log" : "plank");
        case 30:
            return (lx, lz) => (lx < Math.floor(w / 2) ? "plank" : "log");
        case 31:
            return (lx, lz) => (lz >= Math.floor(d * 0.6) ? "log" : "plank");
        case 32:
            return (lx, lz) => {
                if (!dogtrotMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 33:
            return (lx, lz) => {
                if (!tShapeMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 34:
            return (lx, lz) => (lz < Math.floor(d / 2) ? "skip" : corner(lx, lz, w, d) ? "log" : "plank");
        case 35:
            return (lx, lz) => (edge(lx, lz, w, d) ? "log" : "plank");
        case 36:
            return (lx, lz) => (hashChunkRoll(lx, lz, 36, 100) < 55 ? "skip" : "log");
        case 37:
            return (lx, lz) => {
                if (!hPlanMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 38:
            return (lx, lz) => {
                if (!uPlanMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 39:
        case 40:
        case 41:
            return (lx, lz) => (corner(lx, lz, w, d) ? "log" : "plank");
        case 42:
        case 43:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (lx === Math.floor(w / 2)) return "log";
                return "plank";
            };
        case 44:
            return (lx, lz) => (lz >= Math.floor(d / 2) ? "log" : "plank");
        case 45:
            return (lx, lz) => (lz >= d - 3 ? "skip" : corner(lx, lz, w, d) ? "log" : "plank");
        case 48:
            return (lx, lz) => (edge(lx, lz, w, d) ? "log" : "plank");
        case 49:
            return (lx, lz) => (corner(lx, lz, w, d) ? "stone" : "stone");
        case 50:
        case 60:
        case 64:
            return (lx, lz) => {
                if (!lWingMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 51:
        case 55:
            return (lx, lz) => {
                if (!uPlanMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 52:
            return (lx, lz) => {
                if (!openCenterMask(4)(lx, lz, w, d)) return "skip";
                return "stone";
            };
        case 53:
            return (lx, lz) => {
                if (!arcadeMask(lx, lz, w, d)) return "skip";
                return "stone";
            };
        case 57:
            return (lx, lz) => {
                if (!stiltOpenBayMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 58:
        case 68:
            return (lx, lz) => {
                const mask = v === 68 ? hPlanMask : tShapeMask;
                if (!mask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        case 61:
            return (lx, lz) => {
                if (!longhouseMask(lx, lz, w, d)) return "skip";
                return edge(lx, lz, w, d) ? "log" : "plank";
            };
        case 65:
            return (lx, lz) => {
                if (!cShapeMask(lx, lz, w, d)) return "skip";
                return "plank";
            };
        case 66:
            return (lx, lz) => {
                if (!openCenterMask(2)(lx, lz, w, d) || !lWingMask(lx, lz, w, d)) return "skip";
                return hashChunkRoll(lx, lz, 66, 100) < 50 ? "plank" : "skip";
            };
        case 69:
            return (lx, lz) => {
                if (!openCenterMask(3)(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            };
        default:
            return (lx, lz) => {
                if (corner(lx, lz, w, d)) return "log";
                if (lx === 1 || lx === w - 2 || lz === 1 || lz === d - 2) return "log";
                return "plank";
            };
    }
}

/**
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 * @param {string} houseLoot
 * @param {SettlementRuleset} ruleset
 */
function interiorForVariant(variant, w, d, houseLoot, ruleset) {
    const midX = Math.max(1, Math.floor(w / 2) - 1);
    const midZ = Math.max(1, Math.floor(d / 2) - 1);
    const storageLoot = houseStorageLootForVariant(variant, houseLoot, ruleset);
    /** @type {InteriorSpec[]} */
    const base = [
        { lx: 2, lz: 2, id: "minecraft:white_bed" },
        { lx: Math.min(w - 3, 4), lz: 2, id: "minecraft:white_bed" },
        { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot, lootSlot: "primary" }
    ];
    const v = variant % HOUSE_VARIANT_COUNT;
    switch (v) {
        case 0:
            return [
                { lx: 2, lz: 3, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:white_bed" },
                { lx: w - 2, lz: 2, id: "minecraft:chest", loot: storageLoot },
                { lx: 1, lz: 2, id: "minecraft:barrel", loot: storageLoot }
            ];
        case 1:
            return [
                { lx: 1, lz: 2, id: "minecraft:white_bed" },
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:loom" },
                { lx: 1, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 2:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:white_bed" },
                { lx: w - 2, lz: 1, id: "minecraft:chest", loot: storageLoot },
                { lx: 1, lz: 4, id: "minecraft:barrel", loot: storageLoot }
            ];
        case 3:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" },
                { lx: midX, lz: d - 2, id: "minecraft:stonecutter" },
                { lx: 1, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 4:
            return [
                { lx: 2, lz: midZ, id: "minecraft:white_bed" },
                { lx: 4, lz: midZ, id: "minecraft:white_bed" },
                { lx: 5, lz: midZ, id: "minecraft:grindstone" },
                { lx: 1, lz: 2, id: "minecraft:barrel", loot: storageLoot }
            ];
        case 5:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 3, lz: 2, id: "minecraft:smoker" },
                { lx: midX, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 6:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" },
                { lx: 5, lz: 3, id: "minecraft:smoker" },
                { lx: 2, lz: 4, id: "minecraft:cauldron" },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 7:
            return [
                { lx: 2, lz: 3, id: "minecraft:white_bed" },
                { lx: 4, lz: 3, id: "minecraft:white_bed" },
                { lx: 5, lz: 4, id: "minecraft:smoker" },
                { lx: 3, lz: 5, id: "minecraft:cauldron" },
                { lx: w - 2, lz: 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 8:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 4, id: "minecraft:loom" },
                { lx: 1, lz: 5, id: "minecraft:barrel", loot: storageLoot },
                { lx: w - 2, lz: 1, id: "minecraft:chest", loot: storageLoot }
            ];
        case 9:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" },
                { lx: 1, lz: 4, id: "minecraft:barrel", loot: storageLoot },
                { lx: w - 2, lz: 5, id: "minecraft:chest", loot: storageLoot }
            ];
        case 10:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 3, lz: 2, id: "minecraft:smithing_table" },
                { lx: 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 11:
            return [
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: 6, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 6, id: "minecraft:loom" },
                { lx: 2, lz: 8, id: "minecraft:barrel", loot: storageLoot },
                { lx: 4, lz: 8, id: "minecraft:chest", loot: storageLoot }
            ];
        case 12:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot, floor: 2 },
                { lx: 4, lz: 2, id: "minecraft:loom", floor: 2 },
                { lx: 5, lz: 2, id: "minecraft:white_bed", floor: 2 },
                { lx: 6, lz: 2, id: "minecraft:white_bed", floor: 2 }
            ];
        case 13:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 2, lz: 4, id: "minecraft:chest", loot: storageLoot, floor: 2 },
                { lx: 4, lz: 3, id: "minecraft:grindstone", floor: 2 },
                { lx: 5, lz: 2, id: "minecraft:white_bed", floor: 2 },
                { lx: 6, lz: 2, id: "minecraft:white_bed", floor: 2 }
            ];
        case 14:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" },
                { lx: 6, lz: 3, id: "minecraft:smoker" },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 15:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 3, lz: 2, id: "minecraft:white_bed" },
                { lx: 2, lz: d - 3, id: "minecraft:chest", loot: storageLoot },
                { lx: w - 3, lz: d - 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: Math.floor(w / 2), lz: 1, id: "minecraft:smoker" }
            ];
        case 16:
            return [
                { lx: 2, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: 3, lz: 4, id: "minecraft:grindstone" },
                { lx: 2, lz: 6, id: "minecraft:chest", loot: storageLoot }
            ];
        case 17:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" },
                { lx: 6, lz: 2, id: "minecraft:barrel", loot: storageLoot },
                { lx: w - 2, lz: 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 18:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot, floor: 2 },
                { lx: 4, lz: 3, id: "minecraft:loom", floor: 2 },
                { lx: 5, lz: 2, id: "minecraft:white_bed", floor: 2 },
                { lx: 6, lz: 2, id: "minecraft:white_bed", floor: 2 }
            ];
        case 19:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 2, lz: 4, id: "minecraft:chest", loot: storageLoot, floor: 2 },
                { lx: 3, lz: 4, id: "minecraft:grindstone", floor: 2 },
                { lx: 5, lz: 2, id: "minecraft:white_bed", floor: 2 },
                { lx: 6, lz: 2, id: "minecraft:white_bed", floor: 2 }
            ];
        case 20:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: 1, lz: 4, id: "minecraft:flower_pot" },
                { lx: w - 2, lz: 3, id: "minecraft:chest", loot: storageLoot }
            ];
        case 21:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:brewing_stand" },
                { lx: 1, lz: 3, id: "minecraft:cauldron" }
            ];
        case 22:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:flower_pot" },
                { lx: 1, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: w - 2, lz: 3, id: "minecraft:chest", loot: storageLoot }
            ];
        case 23:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 24:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: 1, lz: d - 2, id: "minecraft:barrel", loot: storageLoot }
            ];
        case 25:
            return [
                { lx: 1, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 4, id: "minecraft:chest", loot: storageLoot }
            ];
        case 26:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 2, lz: 5, id: "minecraft:white_bed" },
                { lx: 3, lz: 7, id: "minecraft:chest", loot: storageLoot }
            ];
        case 27:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 2, lz: 5, id: "minecraft:white_bed" },
                { lx: 2, lz: 8, id: "minecraft:white_bed" },
                { lx: 4, lz: 4, id: "minecraft:chest", loot: storageLoot }
            ];
        case 28:
            return [
                { lx: 3, lz: 3, id: "minecraft:cartography_table" },
                { lx: 2, lz: 4, id: "minecraft:chest", loot: storageLoot },
                { lx: 4, lz: 5, id: "minecraft:barrel", loot: storageLoot }
            ];
        case 29:
            return [
                { lx: 2, lz: 3, id: "minecraft:white_bed" },
                { lx: 2, lz: 6, id: "minecraft:white_bed" },
                { lx: 3, lz: 4, id: "minecraft:chest", loot: storageLoot }
            ];
        case 30:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 5, lz: 2, id: "minecraft:white_bed" },
                { lx: 2, lz: 5, id: "minecraft:barrel", loot: storageLoot },
                { lx: 5, lz: 5, id: "minecraft:chest", loot: storageLoot }
            ];
        case 31:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:smoker" },
                { lx: 3, lz: 4, id: "minecraft:cauldron" },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 32:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 3, lz: 2, id: "minecraft:white_bed" },
                { lx: 2, lz: 5, id: "minecraft:smoker" },
                { lx: w - 3, lz: 5, id: "minecraft:chest", loot: storageLoot }
            ];
        case 33: {
            const stemW = Math.max(3, Math.floor(w / 3));
            const stemX0 = Math.floor((w - stemW) / 2);
            return [
                { lx: Math.floor(w / 2), lz: d - 3, id: "minecraft:smoker" },
                { lx: Math.floor(w / 2) - 1, lz: d - 3, id: "minecraft:cauldron" },
                { lx: stemX0 + 1, lz: 2, id: "minecraft:white_bed" },
                { lx: stemX0 + stemW - 2, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 3, lz: Math.floor(d / 3) + 1, id: "minecraft:chest", loot: storageLoot }
            ];
        }
        case 34:
            return [
                { lx: 3, lz: 5, id: "minecraft:barrel", loot: storageLoot },
                { lx: 5, lz: 5, id: "minecraft:barrel", loot: storageLoot },
                { lx: 4, lz: 3, id: "minecraft:chest", loot: storageLoot }
            ];
        case 35:
            return [
                { lx: 3, lz: 2, id: "minecraft:ladder" },
                { lx: 3, lz: 4, id: "minecraft:barrel", loot: storageLoot, floor: 2 },
                { lx: 4, lz: 4, id: "minecraft:chest", loot: storageLoot, floor: 2 }
            ];
        case 36:
            return [
                { lx: 3, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: 5, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: 4, lz: 4, id: "minecraft:chest", loot: storageLoot }
            ];
        case 37:
            return [
                { lx: hPlanWingBedLx(w, "left"), lz: 3, id: "minecraft:white_bed" },
                { lx: hPlanWingBedLx(w, "right"), lz: 3, id: "minecraft:white_bed" },
                { lx: Math.floor(w / 2), lz: Math.floor(d / 2) + 1, id: "minecraft:lectern" },
                { lx: Math.floor(w / 2), lz: Math.floor(d / 3) + 1, id: "minecraft:chest", loot: storageLoot }
            ];
        case 38:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 3, lz: 2, id: "minecraft:white_bed" },
                { lx: Math.floor(w / 2) - 1, lz: Math.min(d - 3, 4), id: "minecraft:barrel", loot: storageLoot },
                { lx: Math.floor(w / 2) + 1, lz: Math.min(d - 3, 4), id: "minecraft:chest", loot: storageLoot }
            ];
        case 39:
            return [
                { lx: 2, lz: 3, id: "minecraft:bookshelf" },
                { lx: 4, lz: 3, id: "minecraft:bookshelf" },
                { lx: 3, lz: 3, id: "minecraft:lectern" },
                { lx: 1, lz: Math.min(d - 2, 5), id: "minecraft:chest", loot: storageLoot, lootSlot: "primary" },
                { lx: 3, lz: 4, id: "minecraft:enchanting_table", floor: 2 },
                { lx: 4, lz: 3, id: "minecraft:bookshelf", floor: 2 }
            ];
        case 40:
            return [
                { lx: 3, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: 5, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: 7, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: 4, lz: 5, id: "minecraft:chest", loot: storageLoot }
            ];
        case 41:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:cartography_table" },
                { lx: 2, lz: 4, id: "minecraft:chest", loot: storageLoot },
                { lx: 5, lz: 4, id: "minecraft:chest", loot: storageLoot }
            ];
        case 42:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed", floor: 2 },
                { lx: 3, lz: 2, id: "minecraft:white_bed", floor: 3 },
                { lx: 4, lz: 3, id: "minecraft:chest", loot: storageLoot, floor: 2 }
            ];
        case 43:
            return [
                { lx: 3, lz: 3, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:chest", loot: storageLoot, floor: 2 },
                { lx: 3, lz: 3, id: "minecraft:barrel", loot: storageLoot, floor: 3 }
            ];
        case 44:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 3, id: "minecraft:smoker" },
                { lx: 3, lz: 4, id: "minecraft:chest", loot: storageLoot }
            ];
        case 45:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:chest", loot: storageLoot },
                { lx: 4, lz: 2, id: "minecraft:barrel", loot: storageLoot }
            ];
        case 46:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: 6, lz: 3, id: "minecraft:loom", floor: 2 },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot, floor: 2 }
            ];
        case 47:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 2, lz: 5, id: "minecraft:white_bed", floor: 2 },
                { lx: 4, lz: 4, id: "minecraft:grindstone", floor: 2 },
                { lx: 4, lz: 6, id: "minecraft:chest", loot: storageLoot, floor: 2 }
            ];
        case 48:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" }
            ];
        case 49:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" }
            ];
        case 50:
        case 60:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 2, lz: 3, id: "minecraft:smoker" },
                { lx: 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 51:
        case 55:
            return [
                { lx: 2, lz: 3, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:white_bed" },
                { lx: midX, lz: midZ, id: "minecraft:composter" },
                { lx: w - 2, lz: d - 2, id: "minecraft:barrel", loot: storageLoot }
            ];
        case 52:
        case 53:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot },
                { lx: midX, lz: 2, id: "minecraft:brewing_stand" }
            ];
        case 54:
            return [
                { lx: 3, lz: 4, id: "minecraft:lectern" },
                { lx: 2, lz: 3, id: "minecraft:bookshelf" },
                { lx: 4, lz: 3, id: "minecraft:chest", loot: storageLoot }
            ];
        case 56:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: 3, lz: 4, id: "minecraft:flower_pot" }
            ];
        case 57:
        case 58:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:white_bed" },
                { lx: midX, lz: d - 2, id: "minecraft:cartography_table" },
                { lx: 2, lz: d - 2, id: "minecraft:barrel", loot: storageLoot }
            ];
        case 59:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 4, id: "minecraft:chest", loot: storageLoot, floor: 2 },
                { lx: 3, lz: 5, id: "minecraft:loom", floor: 2 }
            ];
        case 61:
            return [
                { lx: 3, lz: 3, id: "minecraft:white_bed" },
                { lx: 4, lz: 3, id: "minecraft:white_bed" },
                { lx: 2, lz: 4, id: "minecraft:smoker" },
                { lx: w - 2, lz: 4, id: "minecraft:chest", loot: storageLoot }
            ];
        case 62:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:cauldron" },
                { lx: 4, lz: 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 63:
        case 65:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:barrel", loot: storageLoot },
                { lx: 4, lz: 2, id: "minecraft:chest", loot: storageLoot }
            ];
        case 64:
            return [
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 2, id: "minecraft:barrel", loot: storageLoot },
                { lx: 3, lz: 4, id: "minecraft:chest", loot: storageLoot }
            ];
        case 66:
        case 68:
            return [
                { lx: hPlanWingBedLx(w, "left"), lz: 3, id: "minecraft:white_bed" },
                { lx: hPlanWingBedLx(w, "right"), lz: 3, id: "minecraft:white_bed" },
                { lx: midX, lz: midZ, id: "minecraft:barrel", loot: storageLoot },
                { lx: midX, lz: Math.floor(d / 3) + 1, id: "minecraft:chest", loot: storageLoot }
            ];
        case 67:
            return [
                { lx: 2, lz: 3, id: "minecraft:brewing_stand" },
                { lx: 3, lz: 4, id: "minecraft:chest", loot: storageLoot },
                { lx: 2, lz: 5, id: "minecraft:bookshelf" }
            ];
        case 69:
            return [
                { lx: 2, lz: 3, id: "minecraft:white_bed" },
                { lx: 3, lz: 3, id: "minecraft:white_bed" },
                { lx: midX, lz: midZ, id: "minecraft:flower_pot" },
                { lx: w - 2, lz: d - 2, id: "minecraft:chest", loot: storageLoot }
            ];
        default:
            return base;
    }
}

/**
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 * @returns {PartitionSpec[]|undefined}
 */
function partitionsForVariant(variant, w, d) {
    const v = variant % HOUSE_VARIANT_COUNT;
    switch (v) {
        case 0:
            return [{ lx: 2, lz0: 1, lz1: d - 2 }];
        case 1:
            return w >= 6 ? [{ lx: 3, lz0: 1, lz1: Math.min(3, d - 2) }] : undefined;
        case 2:
            return [{ lz: Math.floor(d / 2), lx0: 1, lx1: w - 2 }];
        case 3:
            return [{ lx: Math.floor(w / 2), lz0: 1, lz1: 2 }];
        case 4:
            return w >= 7 ? [{ lx: Math.floor(w / 2), lz0: 1, lz1: d - 2 }] : undefined;
        case 8:
        case 17:
            return [{ lz: Math.floor(d / 2), lx0: 1, lx1: w - 2 }];
        case 9:
            return [{ lx: Math.floor(w / 2), lz0: 1, lz1: d - 2 }];
        case 11:
            return [
                { lz: 4, lx0: 1, lx1: 5 },
                { lx: 6, lz0: 1, lz1: 3 }
            ];
        case 15:
            return [
                { lx: Math.floor(w / 2), lz0: 0, lz1: Math.floor(d / 2) - 2 },
                { lz: Math.floor(d / 2), lx0: 0, lx1: w - 1 }
            ];
        case 25:
            return [{ lx: 3, lz0: 1, lz1: d - 2 }];
        case 26:
        case 27:
            return [{ lz: 3, lx0: 1, lx1: w - 2 }, { lz: 6, lx0: 1, lx1: w - 2 }];
        case 30:
            return [{ lx: Math.floor(w / 2), lz0: 1, lz1: d - 2 }];
        case 33:
            return [{ lz: Math.floor(d / 3), lx0: 1, lx1: w - 2 }];
        case 37: {
            const wingW = hPlanWingWidth(w);
            return [{ lz: Math.floor(d / 2), lx0: wingW, lx1: w - wingW - 1 }];
        }
        case 38:
            return [{ lx: Math.floor(w / 4), lz0: 1, lz1: d - 2 }, { lx: w - Math.floor(w / 4) - 1, lz0: 1, lz1: d - 2 }];
        case 40:
            return [{ lx: 5, lz0: 1, lz1: 4 }];
        default:
            return undefined;
    }
}

/**
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 * @returns {((lx: number, lz: number, bw: number, bd: number) => boolean)|undefined}
 */
function occupiedForVariant(variant, w, d) {
    const v = variant % HOUSE_VARIANT_COUNT;
    switch (v) {
        case 5:
        case 7:
            return octagonMask;
        case 10:
            return loftOpenMask;
        case 11:
            return lWingHouseMask;
        case 15:
        case 69:
            return openCenterMask(3);
        case 32:
            return dogtrotMask;
        case 33:
            return tShapeMask;
        case 37:
            return hPlanMask;
        case 38:
            return uPlanMask;
        case 40:
            return plusMask;
        case 41:
            return cShapeMask;
        case 50:
            return lWingMask;
        case 51:
            return uPlanMask;
        case 52:
            return openCenterMask(4);
        case 53:
            return arcadeMask;
        case 55:
            return uPlanMask;
        case 56:
            return lWingMask;
        case 57:
            return stiltOpenBayMask;
        case 58:
            return tShapeMask;
        case 59:
            return (lx, lz, bw, bd) => tShapeMask(lx, lz, bw, bd);
        case 60:
            return lWingMask;
        case 61:
            return longhouseMask;
        case 62:
            return lWingMask;
        case 63:
            return loftOpenMask;
        case 64:
            return lWingMask;
        case 65:
            return cShapeMask;
        case 66:
            return lWingMask;
        case 68:
            return hPlanMask;
        default:
            return undefined;
    }
}

/**
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 * @returns {AppendageSpec[]|undefined}
 */
function appendagesForVariant(variant, w, d) {
    const v = variant % HOUSE_VARIANT_COUNT;
    switch (v) {
        case 0:
            return [{ ox: Math.floor(w / 2) - 1, oz: -2, w: 3, d: 2, wallH: 2, role: "porch" }];
        case 16:
            return [{ ox: w - 2, oz: d - 1, w: 3, d: 2, wallH: 2, role: "lean_to" }];
        case 23:
            return [{ ox: Math.floor(w / 2) - 1, oz: -2, w: 2, d: 2, wallH: 4, buildStyle: "stone", role: "chimney" }];
        case 24:
            return [{ ox: Math.floor(w / 2) - 1, oz: -2, w: 3, d: 2, wallH: 2, role: "porch" }];
        case 43:
            return [{ ox: Math.floor(w / 2) - 1, oz: Math.floor(d / 2) - 1, w: 3, d: 3, wallH: 6, role: "tower" }];
        case 50:
            return [{ ox: Math.floor(w / 2) - 1, oz: -2, w: 3, d: 2, wallH: 2, role: "porch" }];
        case 54:
            return [{ ox: Math.floor(w / 2) - 2, oz: 1, w: 4, d: 4, wallH: 8, buildStyle: "stone", role: "bell_tower" }];
        case 56:
            return [{ ox: 0, oz: -2, w: 4, d: 2, wallH: 2, role: "porch" }];
        case 57:
            return [
                { ox: Math.floor(w / 3), oz: -1, w: Math.max(3, Math.floor(w / 3)), d: 2, wallH: 3, role: "stilt_deck" },
                { ox: Math.floor(w / 2) - 1, oz: d - 1, w: 3, d: 2, wallH: 2, role: "porch" }
            ];
        case 59:
            return [{ ox: Math.floor(w / 2) - 1, oz: 2, w: 3, d: 3, wallH: 7, role: "tower" }];
        case 62:
            return [{ ox: Math.floor(w / 2) - 1, oz: -2, w: 2, d: 3, wallH: 4, buildStyle: "stone", role: "chimney" }];
        case 64:
            return [{ ox: 1, oz: -3, w: 4, d: 3, wallH: 1, role: "dock_porch" }];
        case 67:
            return [{ ox: Math.floor(w / 2) - 1, oz: 1, w: 3, d: 3, wallH: 9, buildStyle: "stone", role: "bell_tower" }];
        default:
            return undefined;
    }
}

/**
 * Cellar carve depth — always 3–5 blocks below main floor.
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 * @returns {3|4|5}
 */
function cellarDepthForVariant(variant, w, d) {
    const roll = hashChunkRoll(variant, w * 31 + d, 773, 3);
    return /** @type {3|4|5} */ (3 + roll);
}

/**
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 * @returns {{ depth?: 3|4|5, floor?: HousePlan["basementFloor"], hatch?: { lx: number, lz: number } }}
 */
function basementForVariant(variant, w, d) {
    const v = variant % HOUSE_VARIANT_COUNT;
    switch (v) {
        case 44:
            return {
                depth: cellarDepthForVariant(v, w, d),
                floor: (lx, lz) => (edge(lx, lz, w, d) ? "stone" : "plank"),
                hatch: { lx: Math.floor(w / 2), lz: Math.floor(d / 2) }
            };
        case 48:
            return {
                depth: cellarDepthForVariant(v + 1, w, d),
                floor: (lx, lz) => (corner(lx, lz, w, d) ? "stone" : "plank"),
                hatch: { lx: 3, lz: 3 }
            };
        case 49:
            return {
                depth: cellarDepthForVariant(v + 2, w, d),
                floor: () => "stone",
                hatch: { lx: 3, lz: 3 }
            };
        default:
            return {};
    }
}

/**
 * @param {number} variant
 * @returns {HousePlan["roofStyle"]|undefined}
 */
function roofStyleForVariant(variant) {
    const shell = HOUSE_SHELLS[variant % HOUSE_VARIANT_COUNT];
    return shell.roofStyle;
}

/**
 * @param {number} variant
 * @returns {FacadeSpec|undefined}
 */
function facadeForVariant(variant) {
    const shell = HOUSE_SHELLS[variant % HOUSE_VARIANT_COUNT];
    if (shell.facade) return shell.facade;
    const v = variant % HOUSE_VARIANT_COUNT;
    if (v === 6 || v === 14) return { gableTrim: true };
    if (v === 31) return { gableTrim: true, doorArc: false };
    return undefined;
}

/**
 * @param {number} variant
 * @param {number} w
 * @param {number} d
 * @returns {((lx: number, lz: number) => number)|undefined}
 */
function wallHAtForVariant(variant, w, d) {
    const v = variant % HOUSE_VARIANT_COUNT;
    if (v === 29) {
        return (lx, lz) => (lz === 1 && lx >= 2 && lx <= w - 3 ? 5 : 4);
    }
    if (v === 45) {
        return (lx, lz) => (lz <= 2 ? 5 : 3);
    }
    return undefined;
}

/** @type {Map<string, HousePlan[]>} */
const housePlanCache = new Map();

/**
 * Pick a house variant index: biome-exclusive shapes, shaped universal pool, or any universal plan.
 * @param {SettlementRuleset} ruleset
 * @param {number} cx
 * @param {number} cz
 * @param {number} salt
 * @returns {number}
 */
export function pickHouseVariantIndex(ruleset, cx, cz, salt) {
    const roll = hashChunkRoll(cx, cz, salt, 100);
    const biomePool = BIOME_EXCLUSIVE_BY_RULESET[ruleset] ?? BIOME_EXCLUSIVE_BY_RULESET.plains;
    if (biomePool.length > 0 && roll < 45) {
        return biomePool[hashChunkRoll(cx, cz, salt + 11, biomePool.length)];
    }
    if (roll < 78) {
        return SHAPED_UNIVERSAL_VARIANTS[hashChunkRoll(cx, cz, salt + 22, SHAPED_UNIVERSAL_VARIANTS.length)];
    }
    return hashChunkRoll(cx, cz, salt + 33, HOUSE_UNIVERSAL_COUNT);
}

/**
 * @param {SettlementRuleset} ruleset
 * @returns {HousePlan[]}
 */
export function getHousePlansForRuleset(ruleset) {
    const cached = housePlanCache.get(ruleset);
    if (cached) return cached;
    const houseLoot = houseLootKeyForRuleset(ruleset);
    const plans = HOUSE_SHELLS.map((shell, variant) => {
        const basement = basementForVariant(variant, shell.w, shell.d);
        /** @type {HousePlan} */
        const plan = {
            ...shell,
            id: `${ruleset}_${shell.id}`,
            floor: floorForVariant(variant, shell.w, shell.d),
            interior: interiorForVariant(variant, shell.w, shell.d, houseLoot, ruleset),
            partitions: partitionsForVariant(variant, shell.w, shell.d),
            occupied: occupiedForVariant(variant, shell.w, shell.d),
            appendages: appendagesForVariant(variant, shell.w, shell.d),
            roofStyle: roofStyleForVariant(variant),
            facade: facadeForVariant(variant),
            wallHAt: wallHAtForVariant(variant, shell.w, shell.d)
        };
        if (basement.depth) {
            plan.basementDepth = basement.depth;
            plan.basementFloor = basement.floor;
            plan.basementHatch = basement.hatch;
        }
        if ((shell.hasCellar || shell.basementDepth) && !plan.basementDepth) {
            plan.basementDepth = cellarDepthForVariant(variant, shell.w, shell.d);
            plan.basementFloor = (lx, lz) => (edge(lx, lz, shell.w, shell.d) ? "stone" : "plank");
            plan.basementHatch = { lx: Math.floor(shell.w / 2), lz: Math.floor(shell.d / 2) };
        }
        const vi = variant % HOUSE_VARIANT_COUNT;
        if (vi === 32) {
            plan.dogtrot = { wingDoorInset: 2 };
        }
        if (vi === 11) {
            plan.lWingWide = true;
        }
        return appendFloorPantryToPlan(
            stripHousePantryStorageFromPlan(
                plan.basementDepth ? appendBasementCellarStorage(plan) : plan
            ),
            ruleset
        );
    });
    housePlanCache.set(ruleset, plans);
    return plans;
}

/**
 * @param {SettlementRuleset} ruleset
 * @param {number} planIndex
 * @returns {HousePlan}
 */
export function getHousePlanForRuleset(ruleset, planIndex) {
    const plans = getHousePlansForRuleset(ruleset);
    const i = ((planIndex % HOUSE_VARIANT_COUNT) + HOUSE_VARIANT_COUNT) % HOUSE_VARIANT_COUNT;
    return plans[i];
}

/**
 * Shell metadata for dev menus (plan index 0 … HOUSE_VARIANT_COUNT - 1).
 * @param {number} planIndex
 */
export function getHouseShellSummary(planIndex) {
    const i = ((planIndex % HOUSE_VARIANT_COUNT) + HOUSE_VARIANT_COUNT) % HOUSE_VARIANT_COUNT;
    const shell = HOUSE_SHELLS[i];
    return { index: i, id: shell.id, w: shell.w, d: shell.d };
}

/** @returns {{ index: number, id: string, w: number, d: number }[]} */
export function listHouseShellSummaries() {
    return HOUSE_SHELLS.map((shell, index) => ({
        index,
        id: shell.id,
        w: shell.w,
        d: shell.d
    }));
}

/** @typedef {"chapel_small"|"chapel_stone"|"church_cross"|"church_belltower"|"cathedral_ruin"|"desert_shrine"} ChurchVariantId */

/**
 * @param {SettlementRuleset} ruleset
 * @param {number} roll
 * @returns {HousePlan}
 */
export function getChurchPlan(ruleset, roll) {
    const variants = /** @type {ChurchVariantId[]} */ ([
        "chapel_small",
        "chapel_stone",
        "church_cross",
        "church_belltower",
        "cathedral_ruin",
        "desert_shrine"
    ]);
    let idx = roll % variants.length;
    if (ruleset === "desert" || ruleset === "savanna") {
        idx = roll % 100 < 35 ? 5 : roll % (variants.length - 1);
    }
    const variantId = variants[idx];
    const isDesertShrine = variantId === "desert_shrine";

    /** @type {Record<ChurchVariantId, Omit<HousePlan, "floor"|"interior"|"partitions"|"occupied"|"appendages">>} */
    const shells = {
        chapel_small: {
            id: "chapel_small",
            w: 10, d: 13, wallH: 5, cobCount: 8, glassChance: 52, buildStyle: "stone", roofStyle: "peaked",
            facade: { doorArc: true, gableTrim: true }
        },
        chapel_stone: {
            id: "chapel_stone",
            w: 11, d: 15, wallH: 7, cobCount: 10, glassChance: 58, stories: 2, midFloorH: 3, buildStyle: "stone",
            roofStyle: "peaked", facade: { doorArc: true, columns: true, gableTrim: true }
        },
        church_cross: {
            id: "church_cross",
            w: 14, d: 17, wallH: 6, cobCount: 12, glassChance: 60, buildStyle: "stone", roofStyle: "peaked",
            facade: { doorArc: true, gableTrim: true, columns: true }
        },
        church_belltower: {
            id: "church_belltower",
            w: 12, d: 15, wallH: 7, cobCount: 11, glassChance: 55, stories: 2, midFloorH: 3, buildStyle: "stone",
            roofStyle: "steeple", facade: { columns: true, doorArc: true }
        },
        cathedral_ruin: {
            id: "cathedral_ruin",
            w: 16, d: 20, wallH: 10, cobCount: 14, glassChance: 62, stories: 2, midFloorH: 5, buildStyle: "stone",
            roofStyle: "peaked", hasCellar: true, facade: { doorArc: true, columns: true, gableTrim: true }
        },
        desert_shrine: {
            id: "desert_shrine",
            w: 10, d: 12, wallH: 4, cobCount: 7, glassChance: 20, buildStyle: "stone", roofStyle: "flat",
            facade: { columns: true }
        }
    };

    const shell = shells[variantId];
    const w = shell.w;
    const d = shell.d;
    const cx = Math.floor(w / 2);
    const cz = Math.floor(d / 2);
    const floorKind = "stone";

    /** @type {HousePlan} */
    let plan = {
        ...shell,
        id: `${ruleset}_${variantId}`,
        floor: churchSolidFloor(undefined, floorKind),
        interior: [
            { lx: cx, lz: d - 3, id: "minecraft:lectern" },
            { lx: cx - 1, lz: d - 4, id: "minecraft:bookshelf" },
            { lx: cx + 1, lz: d - 4, id: "minecraft:bookshelf" },
            { lx: cx, lz: cz, id: "minecraft:chest" }
        ],
        facade: shell.facade
    };

    if (variantId === "chapel_small" || variantId === "chapel_stone") {
        plan.occupied = churchLMask;
        plan.floor = churchSolidFloor(churchLMask, floorKind);
        plan.interior.push(
            { lx: cx, lz: 2, id: "minecraft:bookshelf" },
            { lx: cx - 1, lz: 3, id: "minecraft:bookshelf" },
            { lx: cx + 1, lz: 3, id: "minecraft:bookshelf" },
            { lx: cx - 2, lz: cz, id: "minecraft:bookshelf" },
            { lx: cx - 2, lz: cz + 1, id: "minecraft:bookshelf" },
            { lx: w - 3, lz: cz, id: "minecraft:bookshelf" },
            { lx: w - 3, lz: cz + 1, id: "minecraft:bookshelf" }
        );
        plan.partitions = [{ lx: w - 4, lz0: 2, lz1: d - 4 }];
    }

    if (variantId === "chapel_small") {
        plan.appendages = [{ ox: cx - 1, oz: -2, w: 3, d: 2, wallH: 2, buildStyle: "stone", role: "porch" }];
    }

    if (variantId === "chapel_stone") {
        plan.interior.push(
            { lx: cx, lz: 4, id: "minecraft:ladder" },
            { lx: cx - 1, lz: 5, id: "minecraft:bookshelf", floor: 2 },
            { lx: cx, lz: 5, id: "minecraft:bookshelf", floor: 2 },
            { lx: cx + 1, lz: 5, id: "minecraft:bookshelf", floor: 2 },
            { lx: cx - 2, lz: 6, id: "minecraft:bookshelf", floor: 2 },
            { lx: cx + 2, lz: 6, id: "minecraft:bookshelf", floor: 2 },
            { lx: cx, lz: 7, id: "minecraft:chest", floor: 2 },
            { lx: w - 3, lz: 5, id: "minecraft:bookshelf", floor: 2 },
            { lx: w - 3, lz: 6, id: "minecraft:bookshelf", floor: 2 }
        );
        plan.wallHAt = (lx, lz) => (lx >= w - 4 ? shell.wallH + 1 : shell.wallH);
        plan.partitions = [
            { lx: w - 4, lz0: 2, lz1: d - 4 },
            { lz: cz, lx0: cx - 2, lx1: cx + 2 }
        ];
    }

    if (variantId === "church_cross" || variantId === "cathedral_ruin") {
        plan.occupied = crossMask;
        plan.floor = churchSolidFloor(crossMask, floorKind);
        plan.partitions = [{ lz: cz, lx0: cx - 2, lx1: cx + 2 }];
        plan.interior.push(
            { lx: cx - 2, lz: cz - 1, id: "minecraft:bookshelf" },
            { lx: cx + 2, lz: cz - 1, id: "minecraft:bookshelf" },
            { lx: cx - 2, lz: cz + 1, id: "minecraft:bookshelf" },
            { lx: cx + 2, lz: cz + 1, id: "minecraft:bookshelf" },
            { lx: cx, lz: 3, id: "minecraft:bookshelf" },
            { lx: cx, lz: d - 5, id: "minecraft:bookshelf" }
        );
        if (variantId === "cathedral_ruin") {
            plan.interior.push(
                { lx: cx, lz: 4, id: "minecraft:ladder" },
                { lx: cx - 1, lz: 4, id: "minecraft:bookshelf", floor: 2 },
                { lx: cx, lz: 4, id: "minecraft:bookshelf", floor: 2 },
                { lx: cx + 1, lz: 4, id: "minecraft:bookshelf", floor: 2 },
                { lx: cx - 2, lz: 5, id: "minecraft:bookshelf", floor: 2 },
                { lx: cx + 2, lz: 5, id: "minecraft:bookshelf", floor: 2 },
                { lx: cx - 1, lz: d - 5, id: "minecraft:bookshelf", floor: 2 },
                { lx: cx + 1, lz: d - 5, id: "minecraft:bookshelf", floor: 2 },
                { lx: cx, lz: d - 4, id: "minecraft:chest", lootSlot: "records", floor: 2 }
            );
            plan.basementDepth = cellarDepthForVariant(roll + 50, w, d);
            plan.basementFloor = () => "stone";
            plan.basementHatch = { lx: cx, lz: cz };
            plan = appendBasementCellarStorage(plan);
            plan.wallHAt = (lx, lz) => (Math.abs(lx - cx) <= 1 ? shell.wallH + 1 : shell.wallH);
        }
    }

    if (variantId === "church_belltower") {
        plan.occupied = churchLMask;
        plan.floor = churchSolidFloor(churchLMask, floorKind);
        plan.appendages = [{ ox: cx - 2, oz: 2, w: 4, d: 4, wallH: 10, buildStyle: "stone", role: "bell_tower" }];
        plan.interior.push(
            { lx: cx, lz: 4, id: "minecraft:ladder" },
            { lx: cx - 1, lz: 5, id: "minecraft:bookshelf" },
            { lx: cx + 1, lz: 5, id: "minecraft:bookshelf" },
            { lx: w - 3, lz: cz, id: "minecraft:bookshelf" },
            { lx: w - 3, lz: cz + 1, id: "minecraft:bookshelf" },
            { lx: cx - 1, lz: 6, id: "minecraft:bookshelf", floor: 2 },
            { lx: cx + 1, lz: 6, id: "minecraft:bookshelf", floor: 2 },
            { lx: cx, lz: 7, id: "minecraft:chest", floor: 2 }
        );
        plan.roofStyle = "steeple";
        plan.partitions = [{ lx: w - 4, lz0: 2, lz1: d - 4 }];
    }

    if (variantId === "desert_shrine") {
        plan.occupied = (lx, lz, bw, bd) => lx !== 0 && lx !== bw - 1 && lz !== bd - 1;
        plan.floor = churchSolidFloor(plan.occupied, floorKind);
        plan.glassChance = 10;
    }

    return applyStructureLootToPlan(plan, "church", ruleset);
}

/** @typedef {"weaponsmith"|"armorer"|"toolsmith"|"farmer"|"butcher"|"librarian"|"cartographer"|"cleric"|"fisherman"|"fletcher"|"leatherworker"|"shepherd"|"mason"|"market"|"church"|"bakery"|"brewery"|"apiary_shed"|"hunter_lodge"|"mill_ruin"|"schoolhouse"|"town_hall"|"prison_cell"|"greenhouse_ruin"|"trading_post"} WorkStructureKind */

/** @type {Record<WorkStructureKind, HousePlan|HousePlan[]>} */
export const WORK_BUILDING_PLANS = {
    weaponsmith: [
        {
            id: "weaponsmith",
            w: 7, d: 6, wallH: 4, cobCount: 6, glassChance: 35,
            roofStyle: "shed",
            appendages: [{ ox: 4, oz: -1, w: 2, d: 2, wallH: 2, role: "forge_patio" }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 2, lz: 2, id: "minecraft:grindstone" },
                { lx: 4, lz: 2, id: "minecraft:anvil" },
                { lx: 3, lz: 3, id: "minecraft:smithing_table" },
                { lx: 3, lz: 4, id: "minecraft:blast_furnace" },
                { lx: 2, lz: 4, id: "minecraft:chest", lootSlot: "primary" },
                { lx: 4, lz: 4, id: "minecraft:barrel", lootSlot: "pantry" }
            ]
        },
        {
            id: "smithy_workshop",
            w: 10, d: 7, wallH: 4, cobCount: 8, glassChance: 38, roofStyle: "shed",
            appendages: [{ ox: 6, oz: -1, w: 3, d: 2, wallH: 2, role: "forge_patio" }],
            partitions: [{ lx: 7, lz0: 1, lz1: 5 }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 2, id: "minecraft:anvil" },
                { lx: 5, lz: 2, id: "minecraft:grindstone" },
                { lx: 4, lz: 3, id: "minecraft:smithing_table" },
                { lx: 3, lz: 4, id: "minecraft:blast_furnace" },
                { lx: 3, lz: 5, id: "minecraft:chest", lootSlot: "primary" },
                { lx: 5, lz: 5, id: "minecraft:barrel", lootSlot: "pantry" },
                { lx: 8, lz: 4, id: "minecraft:barrel", lootSlot: "pantry" }
            ]
        }
    ],
    toolsmith: [
        {
            id: "toolsmith",
            w: 7, d: 6, wallH: 3, cobCount: 5, glassChance: 35,
            roofStyle: "flat",
            appendages: [{ ox: 2, oz: -1, w: 3, d: 2, wallH: 2, role: "porch" }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 2, id: "minecraft:smithing_table" },
                { lx: 2, lz: 2, id: "minecraft:grindstone" },
                { lx: 1, lz: 4, id: "minecraft:chest", lootSlot: "primary" },
                { lx: 5, lz: 4, id: "minecraft:barrel", lootSlot: "pantry" }
            ]
        },
        {
            id: "toolsmith_wide",
            w: 7, d: 5, wallH: 3, cobCount: 6, glassChance: 36,
            roofStyle: "flat",
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 2, id: "minecraft:smithing_table" },
                { lx: 2, lz: 2, id: "minecraft:grindstone" },
                { lx: 5, lz: 2, id: "minecraft:anvil" },
                { lx: 1, lz: 4, id: "minecraft:chest", lootSlot: "primary" },
                { lx: 5, lz: 4, id: "minecraft:barrel", lootSlot: "pantry" }
            ]
        }
    ],
    armorer: [
        {
            id: "armorer",
            w: 6, d: 6, wallH: 3, cobCount: 6, glassChance: 40,
            floor: (lx, lz, w, d) => (edge(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:blast_furnace" },
                { lx: 2, lz: 3, id: "minecraft:anvil" },
                { lx: 1, lz: 4, id: "minecraft:chest", lootSlot: "primary" },
                { lx: 4, lz: 4, id: "minecraft:barrel", lootSlot: "pantry" }
            ]
        },
        {
            id: "armorer_forge",
            w: 8, d: 7, wallH: 4, cobCount: 7, glassChance: 42, roofStyle: "shed",
            occupied: uPlanMask,
            appendages: [{ ox: 3, oz: -1, w: 2, d: 2, wallH: 3, role: "forge_patio" }],
            floor: (lx, lz, w, d) => {
                if (!uPlanMask(lx, lz, w, d)) return "skip";
                return edge(lx, lz, w, d) ? "log" : "plank";
            },
            interior: [
                { lx: 3, lz: 3, id: "minecraft:blast_furnace" },
                { lx: 4, lz: 3, id: "minecraft:blast_furnace" },
                { lx: 2, lz: 4, id: "minecraft:anvil" },
                { lx: 5, lz: 4, id: "minecraft:chest", lootSlot: "primary" },
                { lx: 6, lz: 4, id: "minecraft:barrel", lootSlot: "pantry" }
            ]
        }
    ],
    farmer: [
        {
            id: "farmer",
            w: 7, d: 6, wallH: 3, cobCount: 5, glassChance: 42,
            roofStyle: "flat",
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:composter" },
                { lx: 2, lz: 4, id: "minecraft:barrel" },
                { lx: 5, lz: 2, id: "minecraft:chest" }
            ]
        },
        {
            id: "farmer_barn",
            w: 10, d: 7, wallH: 4, cobCount: 7, glassChance: 35, roofStyle: "shed",
            partitions: [{ lx: 5, lz0: 1, lz1: 5 }],
            floor: (lx, lz, w, d) => (lz >= 4 ? "skip" : corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 2, id: "minecraft:composter" },
                { lx: 7, lz: 2, id: "minecraft:barrel" },
                { lx: 2, lz: 3, id: "minecraft:chest" }
            ]
        },
        {
            id: "farmer_desert_yard",
            w: 10, d: 7, wallH: 3, cobCount: 6, glassChance: 36, buildStyle: "stone", roofStyle: "flat",
            rulesets: ["desert", "savanna"],
            occupied: arcadeMask,
            floor: (lx, lz, w, d) => {
                if (!arcadeMask(lx, lz, w, d)) return "skip";
                return edge(lx, lz, w, d) ? "stone" : "plank";
            },
            interior: [
                { lx: 3, lz: 4, id: "minecraft:composter" },
                { lx: 5, lz: 3, id: "minecraft:barrel" },
                { lx: 7, lz: 4, id: "minecraft:chest" }
            ]
        }
    ],
    butcher: [
        {
            id: "butcher",
            w: 6, d: 6, wallH: 3, cobCount: 6, glassChance: 38, roofStyle: "shed",
            appendages: [{ ox: 2, oz: -1, w: 2, d: 1, wallH: 3, role: "smoke_chimney" }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:smoker" },
                { lx: 2, lz: 2, id: "minecraft:barrel" },
                { lx: 4, lz: 4, id: "minecraft:chest" }
            ]
        },
        {
            id: "butcher_lwing",
            w: 10, d: 7, wallH: 3, cobCount: 7, glassChance: 40, roofStyle: "shed",
            occupied: lWingMask,
            appendages: [{ ox: 4, oz: -1, w: 2, d: 1, wallH: 4, role: "smoke_chimney" }],
            floor: (lx, lz, w, d) => {
                if (!lWingMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            },
            interior: [
                { lx: 2, lz: 4, id: "minecraft:smoker" },
                { lx: 1, lz: 3, id: "minecraft:barrel" },
                { lx: 2, lz: 5, id: "minecraft:chest" }
            ]
        }
    ],
    librarian: [
        {
            id: "librarian",
            w: 9, d: 8, wallH: 7, cobCount: 8, glassChance: 50, stories: 2, midFloorH: 3,
            roofStyle: "peaked", facade: { gableTrim: true },
            partitions: [{ lz: 4, lx0: 1, lx1: 6 }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 2, lz: 2, id: "minecraft:bookshelf" },
                { lx: 3, lz: 2, id: "minecraft:bookshelf" },
                { lx: 4, lz: 2, id: "minecraft:bookshelf" },
                { lx: 5, lz: 2, id: "minecraft:bookshelf" },
                { lx: 2, lz: 3, id: "minecraft:bookshelf" },
                { lx: 5, lz: 3, id: "minecraft:bookshelf" },
                { lx: 3, lz: 3, id: "minecraft:lectern" },
                { lx: 7, lz: 6, id: "minecraft:bookshelf" },
                { lx: 2, lz: 6, id: "minecraft:chest", lootSlot: "primary" },
                { lx: 2, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 3, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 4, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 5, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 6, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 2, lz: 3, id: "minecraft:bookshelf", floor: 2 },
                { lx: 5, lz: 3, id: "minecraft:bookshelf", floor: 2 },
                { lx: 3, lz: 3, id: "minecraft:enchanting_table", floor: 2 },
                { lx: 4, lz: 3, id: "minecraft:bookshelf", floor: 2 },
                { lx: 7, lz: 5, id: "minecraft:chest", lootSlot: "primary", floor: 2 }
            ]
        },
        {
            id: "librarian_study",
            w: 10, d: 8, wallH: 7, cobCount: 9, glassChance: 52, stories: 2, midFloorH: 3,
            roofStyle: "peaked",
            partitions: [{ lx: 5, lz0: 1, lz1: 6 }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 2, lz: 2, id: "minecraft:bookshelf" },
                { lx: 3, lz: 2, id: "minecraft:bookshelf" },
                { lx: 4, lz: 2, id: "minecraft:bookshelf" },
                { lx: 2, lz: 3, id: "minecraft:bookshelf" },
                { lx: 4, lz: 3, id: "minecraft:bookshelf" },
                { lx: 3, lz: 3, id: "minecraft:lectern" },
                { lx: 7, lz: 3, id: "minecraft:bookshelf" },
                { lx: 8, lz: 3, id: "minecraft:bookshelf" },
                { lx: 2, lz: 6, id: "minecraft:chest", lootSlot: "primary" },
                { lx: 2, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 3, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 4, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 7, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 8, lz: 2, id: "minecraft:bookshelf", floor: 2 },
                { lx: 3, lz: 3, id: "minecraft:enchanting_table", floor: 2 },
                { lx: 4, lz: 3, id: "minecraft:bookshelf", floor: 2 },
                { lx: 8, lz: 5, id: "minecraft:chest", lootSlot: "primary", floor: 2 }
            ]
        }
    ],
    cartographer: [
        {
            id: "cartographer",
            w: 7, d: 7, wallH: 3, cobCount: 5, glassChance: 48,
            occupied: octagonMask,
            floor: (lx, lz, w, d) => {
                if (!octagonMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            },
            interior: [
                { lx: 3, lz: 3, id: "minecraft:cartography_table" },
                { lx: 2, lz: 2, id: "minecraft:barrel" },
                { lx: 4, lz: 4, id: "minecraft:chest" }
            ]
        },
        {
            id: "cartographer_maproom",
            w: 7, d: 6, wallH: 3, cobCount: 6, glassChance: 55,
            floor: (lx, lz, w, d) => (edge(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:cartography_table" },
                { lx: 2, lz: 2, id: "minecraft:barrel" },
                { lx: 5, lz: 3, id: "minecraft:chest" }
            ]
        }
    ],
    cleric: [
        {
            id: "cleric",
            w: 7, d: 6, wallH: 3, cobCount: 6, glassChance: 35,
            appendages: [{ ox: 2, oz: -1, w: 3, d: 2, wallH: 2, role: "porch" }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:brewing_stand" },
                { lx: 2, lz: 4, id: "minecraft:cauldron" },
                { lx: 4, lz: 2, id: "minecraft:chest" }
            ]
        },
        {
            id: "cleric_herbal",
            w: 6, d: 7, wallH: 3, cobCount: 6, glassChance: 38,
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:brewing_stand" },
                { lx: 2, lz: 4, id: "minecraft:cauldron" },
                { lx: 4, lz: 5, id: "minecraft:cauldron" },
                { lx: 2, lz: 2, id: "minecraft:chest" }
            ]
        }
    ],
    fisherman: {
        id: "fisherman",
        w: 6, d: 5, wallH: 3, cobCount: 5, glassChance: 40,
        appendages: [{ ox: 2, oz: -2, w: 2, d: 2, wallH: 1, role: "dock_porch" }],
        floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
        interior: [
            { lx: 3, lz: 2, id: "minecraft:barrel" },
            { lx: 2, lz: 3, id: "minecraft:barrel" },
            { lx: 4, lz: 3, id: "minecraft:chest" }
        ]
    },
    fletcher: [
        {
            id: "fletcher_lwing",
            w: 10, d: 8, wallH: 3, cobCount: 6, glassChance: 42, roofStyle: "shed",
            occupied: lWingMask,
            appendages: [{ ox: 3, oz: -1, w: 4, d: 2, wallH: 2, role: "porch" }],
            floor: (lx, lz, w, d) => {
                if (!lWingMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            },
            interior: [
                { lx: 4, lz: 1, id: "minecraft:fletching_table" },
                { lx: 2, lz: 4, id: "minecraft:barrel" },
                { lx: 2, lz: 6, id: "minecraft:chest" }
            ]
        },
        {
            id: "fletcher_tower",
            w: 6, d: 7, wallH: 4, cobCount: 6, glassChance: 44, roofStyle: "peaked",
            appendages: [{ ox: 2, oz: -1, w: 2, d: 2, wallH: 3, role: "porch" }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:fletching_table" },
                { lx: 2, lz: 4, id: "minecraft:barrel" },
                { lx: 4, lz: 2, id: "minecraft:chest" }
            ]
        }
    ],
    leatherworker: {
        id: "leatherworker",
        w: 8, d: 6, wallH: 3, cobCount: 5, glassChance: 38, roofStyle: "shed",
        appendages: [{ ox: 3, oz: -1, w: 2, d: 2, wallH: 2, role: "porch" }],
        floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
        interior: [
            { lx: 3, lz: 2, id: "minecraft:cauldron" },
            { lx: 2, lz: 3, id: "minecraft:barrel" },
            { lx: 5, lz: 3, id: "minecraft:chest" }
        ]
    },
    shepherd: [
        {
            id: "shepherd",
            w: 8, d: 7, wallH: 3, cobCount: 5, glassChance: 40, roofStyle: "peaked",
            occupied: uPlanMask,
            floor: (lx, lz, w, d) => {
                if (!uPlanMask(lx, lz, w, d)) return "skip";
                return corner(lx, lz, w, d) ? "log" : "plank";
            },
            interior: [
                { lx: 3, lz: 3, id: "minecraft:loom" },
                { lx: 2, lz: 2, id: "minecraft:white_bed" },
                { lx: 2, lz: 4, id: "minecraft:barrel" },
                { lx: 4, lz: 4, id: "minecraft:chest" }
            ]
        },
        {
            id: "shepherd_pen",
            w: 9, d: 6, wallH: 3, cobCount: 6, glassChance: 38,
            occupied: dogtrotMask,
            floor: (lx, lz, w, d) => {
                if (!dogtrotMask(lx, lz, w, d)) return "skip";
                return edge(lx, lz, w, d) ? "log" : "plank";
            },
            interior: [
                { lx: 2, lz: 2, id: "minecraft:loom" },
                { lx: 7, lz: 2, id: "minecraft:white_bed" },
                { lx: 4, lz: 4, id: "minecraft:barrel" }
            ]
        }
    ],
    mason: [
        {
            id: "mason",
            w: 7, d: 6, wallH: 3, cobCount: 6, glassChance: 36,
            appendages: [{ ox: 2, oz: -1, w: 3, d: 2, wallH: 2, role: "porch" }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:stonecutter" },
                { lx: 2, lz: 4, id: "minecraft:barrel" },
                { lx: 5, lz: 2, id: "minecraft:chest" }
            ]
        },
        {
            id: "mason_yard",
            w: 8, d: 6, wallH: 3, cobCount: 7, glassChance: 34, buildStyle: "stone",
            floor: (lx, lz, w, d) => (edge(lx, lz, w, d) ? "stone" : "plank"),
            interior: [
                { lx: 4, lz: 3, id: "minecraft:stonecutter" },
                { lx: 2, lz: 3, id: "minecraft:barrel" },
                { lx: 6, lz: 4, id: "minecraft:chest" }
            ]
        }
    ],
    market: [
        {
            id: "market_hall",
            w: 8, d: 6, wallH: 5, cobCount: 8, glassChance: 55, stories: 2, midFloorH: 3,
            roofStyle: "flat", roofDeck: true,
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            partitions: [{ lx: 4, lz0: 1, lz1: 4 }],
            interior: [
                { lx: 3, lz: 3, id: "minecraft:lectern" },
                { lx: 2, lz: 2, id: "minecraft:barrel" },
                { lx: 5, lz: 4, id: "minecraft:chest" },
                { lx: 4, lz: 4, id: "minecraft:barrel", floor: 2 },
                { lx: 6, lz: 3, id: "minecraft:chest", floor: 2 }
            ]
        },
        {
            id: "market_bazaar",
            w: 9, d: 7, wallH: 4, cobCount: 7, glassChance: 50, facade: { doorArc: true },
            partitions: [{ lz: 3, lx0: 1, lx1: 7 }],
            floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 2, lz: 2, id: "minecraft:barrel" },
                { lx: 6, lz: 2, id: "minecraft:barrel" },
                { lx: 4, lz: 5, id: "minecraft:chest" }
            ]
        },
        {
            id: "market_open",
            w: 8, d: 6, wallH: 3, cobCount: 6, glassChance: 45,
            floor: (lx, lz, w, d) => (edge(lx, lz, w, d) ? "log" : "plank"),
            interior: [
                { lx: 3, lz: 3, id: "minecraft:lectern" },
                { lx: 2, lz: 2, id: "minecraft:barrel" },
                { lx: 5, lz: 4, id: "minecraft:chest" }
            ]
        }
    ],
    church: {
        id: "church",
        w: 11, d: 15, wallH: 7, cobCount: 10, glassChance: 58, stories: 2, midFloorH: 3, buildStyle: "stone",
        occupied: churchLMask,
        roofStyle: "peaked",
        facade: { doorArc: true, columns: true },
        floor: (lx, lz, w, d) => (churchLMask(lx, lz, w, d) ? "stone" : "skip"),
        partitions: [{ lx: 7, lz0: 2, lz1: 12 }],
        interior: [
            { lx: 5, lz: 12, id: "minecraft:lectern" },
            { lx: 4, lz: 11, id: "minecraft:bookshelf" },
            { lx: 6, lz: 11, id: "minecraft:bookshelf" },
            { lx: 8, lz: 7, id: "minecraft:bookshelf" },
            { lx: 8, lz: 8, id: "minecraft:bookshelf" },
            { lx: 3, lz: 7, id: "minecraft:bookshelf" },
            { lx: 3, lz: 8, id: "minecraft:bookshelf" },
            { lx: 5, lz: 7, id: "minecraft:chest" },
            { lx: 5, lz: 4, id: "minecraft:ladder" },
            { lx: 4, lz: 5, id: "minecraft:bookshelf", floor: 2 },
            { lx: 5, lz: 5, id: "minecraft:bookshelf", floor: 2 },
            { lx: 6, lz: 5, id: "minecraft:bookshelf", floor: 2 },
            { lx: 8, lz: 6, id: "minecraft:bookshelf", floor: 2 },
            { lx: 5, lz: 6, id: "minecraft:chest", floor: 2 }
        ]
    },
    bakery: {
        id: "bakery",
        w: 6, d: 6, wallH: 3, cobCount: 6, glassChance: 44, roofStyle: "shed",
        appendages: [{ ox: 2, oz: -1, w: 2, d: 1, wallH: 3, role: "oven_chimney" }],
        floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
        interior: [
            { lx: 3, lz: 3, id: "minecraft:smoker" },
            { lx: 2, lz: 2, id: "minecraft:barrel" },
            { lx: 4, lz: 4, id: "minecraft:chest" }
        ]
    },
    brewery: {
        id: "brewery",
        w: 10, d: 8, wallH: 3, cobCount: 6, glassChance: 40, roofStyle: "shed",
        occupied: lWingMask,
        partitions: [{ lz: 4, lx0: 1, lx1: 6 }],
        floor: (lx, lz, w, d) => {
            if (!lWingMask(lx, lz, w, d)) return "skip";
            return edge(lx, lz, w, d) ? "log" : "plank";
        },
        interior: [
            { lx: 2, lz: 5, id: "minecraft:brewing_stand" },
            { lx: 1, lz: 4, id: "minecraft:cauldron" },
            { lx: 3, lz: 4, id: "minecraft:cauldron" },
            { lx: 2, lz: 6, id: "minecraft:barrel" },
            { lx: 1, lz: 6, id: "minecraft:chest" }
        ]
    },
    apiary_shed: {
        id: "apiary_shed",
        w: 7, d: 6, wallH: 3, cobCount: 4, glassChance: 46, roofStyle: "shed",
        occupied: longhouseMask,
        appendages: [{ ox: 2, oz: -2, w: 3, d: 2, wallH: 2, role: "porch" }],
        floor: (lx, lz, w, d) => {
            if (!longhouseMask(lx, lz, w, d)) return "skip";
            return edge(lx, lz, w, d) ? "log" : "plank";
        },
        interior: [
            { lx: 2, lz: 2, id: "minecraft:flower_pot" },
            { lx: 3, lz: 3, id: "minecraft:flower_pot" },
            { lx: 2, lz: 4, id: "minecraft:barrel" },
            { lx: 4, lz: 4, id: "minecraft:chest" }
        ]
    },
    hunter_lodge: {
        id: "hunter_lodge",
        w: 7, d: 6, wallH: 3, cobCount: 6, glassChance: 38, roofStyle: "peaked",
        floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
        interior: [
            { lx: 3, lz: 3, id: "minecraft:smoker" },
            { lx: 4, lz: 3, id: "minecraft:fletching_table" },
            { lx: 2, lz: 4, id: "minecraft:barrel" },
            { lx: 5, lz: 4, id: "minecraft:chest" }
        ]
    },
    mill_ruin: {
        id: "mill_ruin",
        w: 9, d: 9, wallH: 5, cobCount: 8, glassChance: 30, stories: 2, midFloorH: 3, roofStyle: "shed",
        occupied: plusMask,
        appendages: [{ ox: 7, oz: 3, w: 2, d: 3, wallH: 4, role: "mill_wheel" }],
        floor: (lx, lz, w, d) => {
            if (!plusMask(lx, lz, w, d)) return "skip";
            return edge(lx, lz, w, d) ? "log" : hashChunkRoll(lx, lz, 88, 100) < 50 ? "plank" : "skip";
        },
        interior: [
            { lx: 4, lz: 3, id: "minecraft:grindstone" },
            { lx: 3, lz: 4, id: "minecraft:barrel" },
            { lx: 5, lz: 5, id: "minecraft:chest", floor: 2 }
        ]
    },
    schoolhouse: {
        id: "schoolhouse",
        w: 8, d: 6, wallH: 4, cobCount: 7, glassChance: 52,
        partitions: [{ lx: 4, lz0: 1, lz1: 4 }],
        floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
        interior: [
            { lx: 2, lz: 3, id: "minecraft:lectern" },
            { lx: 5, lz: 3, id: "minecraft:lectern" },
            { lx: 3, lz: 2, id: "minecraft:bookshelf" },
            { lx: 6, lz: 2, id: "minecraft:bookshelf" },
            { lx: 4, lz: 4, id: "minecraft:chest" }
        ]
    },
    town_hall: {
        id: "town_hall",
        w: 10, d: 8, wallH: 6, cobCount: 10, glassChance: 55, stories: 2, midFloorH: 3,
        roofStyle: "peaked", facade: { doorArc: true, columns: true, gableTrim: true },
        floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
        interior: [
            { lx: 4, lz: 4, id: "minecraft:lectern" },
            { lx: 3, lz: 3, id: "minecraft:bookshelf" },
            { lx: 6, lz: 3, id: "minecraft:bookshelf" },
            { lx: 5, lz: 5, id: "minecraft:chest" },
            { lx: 4, lz: 4, id: "minecraft:barrel", floor: 2 }
        ]
    },
    prison_cell: {
        id: "prison_cell",
        w: 5, d: 7, wallH: 3, cobCount: 5, glassChance: 25, buildStyle: "stone",
        floor: (lx, lz, w, d) => (edge(lx, lz, w, d) ? "stone" : "stone"),
        interior: [
            { lx: 2, lz: 3, id: "minecraft:white_bed" },
            { lx: 3, lz: 5, id: "minecraft:chest" }
        ]
    },
    greenhouse_ruin: {
        id: "greenhouse_ruin",
        w: 8, d: 7, wallH: 3, cobCount: 6, glassChance: 75, roofStyle: "flat",
        occupied: octagonMask,
        floor: (lx, lz, w, d) => {
            if (!octagonMask(lx, lz, w, d)) return "skip";
            return corner(lx, lz, w, d) ? "log" : "plank";
        },
        interior: [
            { lx: 3, lz: 3, id: "minecraft:composter" },
            { lx: 2, lz: 4, id: "minecraft:flower_pot" },
            { lx: 4, lz: 4, id: "minecraft:flower_pot" },
            { lx: 3, lz: 5, id: "minecraft:barrel" }
        ]
    },
    trading_post: {
        id: "trading_post",
        w: 9, d: 6, wallH: 3, cobCount: 7, glassChance: 48,
        appendages: [{ ox: 3, oz: -2, w: 3, d: 2, wallH: 2, role: "porch" }],
        floor: (lx, lz, w, d) => (corner(lx, lz, w, d) ? "log" : "plank"),
        interior: [
            { lx: 3, lz: 3, id: "minecraft:barrel" },
            { lx: 5, lz: 3, id: "minecraft:barrel" },
            { lx: 7, lz: 3, id: "minecraft:barrel" },
            { lx: 4, lz: 4, id: "minecraft:chest" }
        ]
    }
};

/**
 * @param {WorkStructureKind|string} kind
 * @param {number} [cx]
 * @param {number} [cz]
 * @param {number} [salt]
 * @param {SettlementRuleset} [ruleset]
 * @returns {HousePlan|null}
 */
export function getWorkBuildingPlan(kind, cx, cz, salt, ruleset = "plains") {
    if (kind === "smithy") kind = "weaponsmith";
    if (kind === "farm") kind = "farmer";
    if (kind === "hall") kind = "market";
    if (kind === "church") {
        const roll = cx !== undefined && cz !== undefined ? hashChunkRoll(cx, cz, salt ?? 701, 100) : 0;
        return getChurchPlan(ruleset, roll);
    }
    const entry = WORK_BUILDING_PLANS[kind];
    if (!entry) return null;
    /** @type {HousePlan[]} */
    const all = Array.isArray(entry) ? entry : [entry];
    /** @type {(HousePlan & { rulesets?: SettlementRuleset[] })[]} */
    const tagged = all.filter((p) => !p.rulesets || p.rulesets.includes(ruleset));
    const pool = tagged.length > 0 ? tagged : all;
    if (cx === undefined || cz === undefined) return applyStructureLootToPlan(pool[0], kind, ruleset);
    const shaped = pool.filter((p) => p.occupied || (p.appendages?.length ?? 0) > 0);
    let pickPool = pool;
    if (kind === "weaponsmith") {
        const fullFoot = pool.filter((p) => !p.occupied);
        if (fullFoot.length > 0) pickPool = fullFoot;
    } else if (shaped.length > 0 && hashChunkRoll(cx, cz, (salt ?? 700) + 3, 100) < 58) {
        pickPool = shaped;
    }
    const picked = pickPool[hashChunkRoll(cx, cz, salt ?? 700, pickPool.length)];
    return applyStructureLootToPlan(picked, kind, ruleset);
}

/**
 * @param {SettlementTier} tier
 * @param {number} i
 * @param {number} count
 * @param {number} cx
 * @param {number} cz
 * @returns {WorkStructureKind|"house"}
 */
export function structureKindForSlot(tier, i, count, cx, cz) {
    if (i === count - 1) return "market";
    if (tier !== "hamlet" && i === count - 2) return "church";
    if (tier === "hamlet") {
        if (i === 1) return "weaponsmith";
        if (hashChunkRoll(cx, cz, 910 + i, 100) < 10) {
            return hashChunkRoll(cx, cz, 920 + i, 2) === 0 ? "cartographer" : "shepherd";
        }
        return "house";
    }
    /** @type {WorkStructureKind[]} */
    const largeExtra = [
        "armorer", "cartographer", "shepherd", "mason", "fletcher",
        "leatherworker", "toolsmith", "cleric", "fisherman", "bakery",
        "brewery", "hunter_lodge", "trading_post", "schoolhouse", "apiary_shed"
    ];
    if (tier === "village") {
        if (i === 1) return "weaponsmith";
        if (i === 2) return "farmer";
        if (i === 3) return "fisherman";
        if (i === 4) return "librarian";
        if (i === 5) return "fletcher";
        if (i === 7) return "shepherd";
        return "house";
    }
    if (i === 1) return "weaponsmith";
    if (i === 2) return "farmer";
    if (i === 4) return "librarian";
    if (i === 6) return "butcher";
    if (i === 8) return "armorer";
    if (i === 10) return largeExtra[hashChunkRoll(cx, cz, 880 + i, largeExtra.length)];
    if (i === 12) {
        let pick = largeExtra[hashChunkRoll(cx, cz, 890 + i, largeExtra.length)];
        const first = largeExtra[hashChunkRoll(cx, cz, 880 + 10, largeExtra.length)];
        if (pick === first) pick = largeExtra[(hashChunkRoll(cx, cz, 890 + i, largeExtra.length) + 1) % largeExtra.length];
        return pick;
    }
    return "house";
}

/** @typedef {"well"|"fountain"|"market"|"campfire"|"shrine"} MeetingVariant */

export const MEETING_VARIANT_COUNT = 5;

/**
 * @param {SettlementRuleset} ruleset
 * @param {number} cx
 * @param {number} cz
 * @returns {MeetingVariant}
 */
export function pickMeetingVariant(ruleset, cx, cz) {
    const roll = hashChunkRoll(cx, cz, 1201, MEETING_VARIANT_COUNT);
    /** @type {MeetingVariant[]} */
    const desertOrder = ["well", "fountain", "market", "shrine", "campfire"];
    /** @type {MeetingVariant[]} */
    const coldOrder = ["well", "campfire", "shrine", "market", "fountain"];
    /** @type {MeetingVariant[]} */
    const defaultOrder = ["well", "market", "fountain", "campfire", "shrine"];
    const order =
        ruleset === "desert"
            ? desertOrder
            : ruleset === "snowy" || ruleset === "ice" || ruleset === "taiga" || ruleset === "infected"
              ? coldOrder
              : defaultOrder;
    return order[roll % order.length];
}

/** @typedef {0|1|2|3|4} SettlementLayoutVariant */

export const SETTLEMENT_LAYOUT_COUNT = 5;

/**
 * Village structure placement style (ring, cross, arc, double ring, square).
 * @param {number} cx
 * @param {number} cz
 * @returns {SettlementLayoutVariant}
 */
export function pickSettlementLayoutVariant(cx, cz) {
    return /** @type {SettlementLayoutVariant} */ (hashChunkRoll(cx, cz, 1188, SETTLEMENT_LAYOUT_COUNT));
}

/**
 * @param {SettlementLayoutVariant} layout
 * @param {number} i
 * @param {number} count
 * @param {number} cx
 * @param {number} cz
 * @param {number} salt
 * @param {number} minRing
 * @param {number} spread
 * @returns {{ ox: number, oz: number }}
 */
export function settlementLayoutOffset(layout, i, count, cx, cz, salt, minRing, spread) {
    const dist = minRing + (hashChunkRoll(cx, cz, salt + 1, spread) % spread);
    if (layout === 1) {
        /** Cross arms — first four slots on N/S/E/W. */
        if (i === 0) return { ox: 0, oz: -dist };
        if (i === 1) return { ox: 0, oz: dist };
        if (i === 2) return { ox: -dist, oz: 0 };
        if (i === 3) return { ox: dist, oz: 0 };
    }
    if (layout === 2) {
        /** Semicircle arc (270° sweep). */
        const t = count <= 1 ? 0.5 : i / (count - 1);
        const angle = Math.PI * 0.25 + t * Math.PI * 1.5;
        return { ox: Math.floor(Math.cos(angle) * dist), oz: Math.floor(Math.sin(angle) * dist) };
    }
    if (layout === 3) {
        /** Inner / outer alternating rings. */
        const ringDist = i % 2 === 0 ? dist : minRing + Math.floor(spread * 0.72);
        const angle = (2 * Math.PI * (i + hashChunkRoll(cx, cz, salt + 2, 100) / 100)) / count;
        return { ox: Math.floor(Math.cos(angle) * ringDist), oz: Math.floor(Math.sin(angle) * ringDist) };
    }
    if (layout === 4) {
        /** Square corners + fill. */
        if (i < 4) {
            const corners = [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1]
            ];
            const [sx, sz] = corners[i];
            const cornerDist = minRing + Math.floor(spread * 0.55);
            return { ox: sx * cornerDist, oz: sz * cornerDist };
        }
    }
    const angle = (hashChunkRoll(cx, cz, salt, 360) * Math.PI) / 180;
    return { ox: Math.floor(Math.cos(angle) * dist), oz: Math.floor(Math.sin(angle) * dist) };
}

