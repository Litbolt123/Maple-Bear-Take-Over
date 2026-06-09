/**
 * Post-build structure_void fill for Structure Block export catalog (vanilla terrain preserve via jigsaw processor).
 */

import { BlockPermutation } from "@minecraft/server";
import {
    getChurchPlan,
    getHousePlanForRuleset,
    getWorkBuildingPlan
} from "./mb_settlementStructures.js";

const CATALOG_VOID_BLOCK = "minecraft:structure_void";
const CATALOG_BOX_HEADROOM = 8;

/** @type {Set<string>} */
const CATALOG_AIR_IDS = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);

/** Must match {@link catalogStructureSalt} in mb_abandonedStructureCatalog.js */
function catalogStructureSalt(index) {
    return 500 + index * 31;
}

/**
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {number} w
 * @param {number} d
 * @param {number} defaultWallH
 * @param {number} lx
 * @param {number} lz
 * @param {number} ly
 */
export function catalogAirShouldBeVoid(plan, w, d, defaultWallH, lx, lz, ly) {
    if (ly < 0) return true;
    const occupied = plan?.occupied ? plan.occupied(lx, lz, w, d) : lx >= 0 && lz >= 0 && lx < w && lz < d;
    if (!occupied) return true;
    const cellWallH = plan?.wallHAt ? plan.wallHAt(lx, lz) : defaultWallH;
    if (ly === 0) return true;
    if (ly <= cellWallH + 1) return false;
    if (ly <= cellWallH + CATALOG_BOX_HEADROOM + 2) return false;
    return true;
}

/**
 * @param {{ kind: string, housePlan?: number, index: number }} entry
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {number} cx
 * @param {number} cz
 */
function planForManifestEntry(entry, slot, ruleset, cx, cz) {
    if (slot.type === "house" && slot.housePlan != null) {
        return getHousePlanForRuleset(ruleset, slot.housePlan);
    }
    if (slot.type === "church") {
        return getChurchPlan(ruleset, slot.churchRoll ?? 0);
    }
    let workKind = slot.type;
    if (workKind === "smithy") workKind = "weaponsmith";
    if (workKind === "farm") workKind = "farmer";
    return getWorkBuildingPlan(workKind, cx, cz, catalogStructureSalt(entry.index), ruleset);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function trySetStructureVoid(dimension, x, y, z) {
    try {
        dimension.setPermutation({ x, y, z }, BlockPermutation.resolve(CATALOG_VOID_BLOCK));
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} floorY
 * @param {Array<{ index: number, relOx: number, relOz: number, w: number, d: number, wallH: number, boxMinX: number, boxMaxX: number, boxMinZ: number, boxMaxZ: number, boxMinY: number, boxMaxY: number, kind: string, housePlan?: number }>} manifest
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot[]} structures
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {number} cx
 * @param {number} cz
 * @param {{ entryIdx?: number, lx?: number, ly?: number, lz?: number }} cursor
 * @param {number} budget
 */
export function tickCatalogExportVoidFill(
    dimension,
    centerX,
    centerZ,
    floorY,
    manifest,
    structures,
    ruleset,
    cx,
    cz,
    cursor,
    budget
) {
    const floorBlockY = floorY - 1;
    let entryIdx = cursor.entryIdx ?? 0;
    let lx = cursor.lx ?? 0;
    let ly = cursor.ly ?? 0;
    let lz = cursor.lz ?? 0;
    let spent = 0;

    while (spent < budget && entryIdx < manifest.length) {
        const entry = manifest[entryIdx];
        const slot = structures[entryIdx];
        if (!entry || !slot) {
            entryIdx++;
            lx = 0;
            ly = 0;
            lz = 0;
            continue;
        }
        const plan = planForManifestEntry(entry, slot, ruleset, cx, cz);
        const originX = centerX + entry.relOx;
        const originZ = centerZ + entry.relOz;
        const boxW = entry.boxMaxX - entry.boxMinX + 1;
        const boxD = entry.boxMaxZ - entry.boxMinZ + 1;
        const boxH = entry.boxMaxY - entry.boxMinY + 1;

        while (spent < budget) {
            if (ly >= boxH) {
                ly = 0;
                lz++;
            }
            if (lz >= boxD) {
                lz = 0;
                lx++;
            }
            if (lx >= boxW) {
                entryIdx++;
                lx = 0;
                ly = 0;
                lz = 0;
                break;
            }

            const wx = centerX + entry.boxMinX + lx;
            const wz = centerZ + entry.boxMinZ + lz;
            const wy = floorBlockY + entry.boxMinY + ly;
            const cellLx = wx - originX;
            const cellLz = wz - originZ;
            const cellLy = wy - floorBlockY;

            let block;
            try {
                block = dimension.getBlock({ x: wx, y: wy, z: wz });
            } catch {
                lx++;
                continue;
            }
            const id = block?.typeId;
            if (!id || !CATALOG_AIR_IDS.has(id)) {
                lx++;
                continue;
            }
            if (!catalogAirShouldBeVoid(plan, entry.w, entry.d, entry.wallH, cellLx, cellLz, cellLy)) {
                lx++;
                continue;
            }
            if (trySetStructureVoid(dimension, wx, wy, wz)) spent++;
            lx++;
        }
    }

    return {
        spent,
        done: entryIdx >= manifest.length,
        cursor: { entryIdx, lx, ly, lz }
    };
}
