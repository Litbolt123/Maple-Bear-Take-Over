/**
 * Dev-only sky-yard layout for Structure Block export → jigsaw `.mcstructure` pipeline.
 * Journal → Developer Tools → Systems → Abandoned villages debug → Starter set for export.
 */

import { BlockComponentTypes } from "@minecraft/server";
import { INCLUDE_FULL_DEVELOPER_TOOLS } from "./mb_buildConfig.js";
import {
    buildForceStructureSlot,
    doorFacingPlaza,
    footprintForStructure,
    trySetBlock,
    SETTLEMENT_REPLACE_ANY
} from "./mb_abandonedSettlementBuilder.js";
import {
    getChurchPlan,
    getHousePlanForRuleset,
    getHouseShellSummary,
    getWorkBuildingPlan
} from "./mb_settlementStructures.js";

/** Build surface Y for export yard (fly up with elytra / creative). */
export const STRUCTURE_CATALOG_Y = 200;

/** Air gap between individual structure pads. */
const CATALOG_CELL_GAP = 10;

/** Layout margin around each footprint (spacing only — no ground blocks placed). */
const CATALOG_PAD_MARGIN = 4;

/** Extra blocks above wall height for suggested export box top. */
const CATALOG_BOX_HEADROOM = 8;

/** Blocks below floor in suggested export box (surface export — floor is Y=0 in file). */
const CATALOG_BOX_FLOOR_PAD = 0;

/** Suggested Structure Block padding outside footprint — 0 = tight export for worldgen. */
const CATALOG_BOX_SIDE_PAD = 0;

/**
 * @typedef {{
 *   kind: string,
 *   housePlan?: number,
 *   churchRoll?: number
 * }} CatalogEntryDef
 */

/**
 * @typedef {{
 *   index: number,
 *   exportName: string,
 *   kind: string,
 *   type: string,
 *   variantId: string,
 *   housePlan?: number,
 *   relOx: number,
 *   relOz: number,
 *   w: number,
 *   d: number,
 *   wallH: number,
 *   padX0: number,
 *   padZ0: number,
 *   padW: number,
 *   padD: number,
 *   boxMinX: number,
 *   boxMaxX: number,
 *   boxMinZ: number,
 *   boxMaxZ: number,
 *   boxMinY: number,
 *   boxMaxY: number
 * }} CatalogManifestEntry
 */

/** Plains starter — isolated air cells for individual Structure Block export. */
export const PLAINS_STARTER_CATALOG = [
    { kind: "house", housePlan: 0 },
    { kind: "gableHouse" },
    { kind: "courtyardHouse" },
    { kind: "smithy" },
    { kind: "bakery" },
    { kind: "librarian" },
    { kind: "church", churchRoll: 4 },
    { kind: "farm" }
];

/** Salt for work-building variant pick — must match structureBuildSaltForSlot in mb_abandonedSettlementBuilder.js */
export function catalogStructureSalt(index) {
    return 500 + index * 31;
}

/**
 * Resolved floor plan for export-box sizing (matches runtime build variant).
 * @param {CatalogEntryDef} entry
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {number} cx
 * @param {number} cz
 * @param {number} index
 */
function catalogResolvedPlan(entry, slot, ruleset, cx, cz, index) {
    if (slot.type === "house" && slot.housePlan != null) {
        return getHousePlanForRuleset(ruleset, slot.housePlan);
    }
    if (slot.type === "church") {
        return getChurchPlan(ruleset, slot.churchRoll ?? entry.churchRoll ?? 0);
    }
    let workKind = slot.type;
    if (workKind === "smithy") workKind = "weaponsmith";
    if (workKind === "farm") workKind = "farmer";
    return getWorkBuildingPlan(workKind, cx, cz, catalogStructureSalt(index), ruleset);
}

/**
 * @param {import("./mb_settlementStructures.js").HousePlan|null|undefined} plan
 * @param {{ wallH: number }} fp
 */
function catalogExportBoxVertical(_plan, fp) {
    const extraHead =
        _plan?.appendages?.some((a) => (a.wallH ?? 0) > fp.wallH) || _plan?.wallHAt != null ? 4 : 0;
    return {
        boxMinY: 0,
        boxMaxY: fp.wallH + CATALOG_BOX_HEADROOM + extraHead + 1
    };
}

/**
 * Footprint for catalog layout/build (uses same variant salt as runtime build).
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {number} cx
 * @param {number} cz
 * @param {number} index
 */
export function catalogFootprintForSlot(slot, ruleset, cx, cz, index) {
    if (slot.type === "house" && slot.housePlan != null) {
        return footprintForStructure(slot.type, slot.housePlan, ruleset);
    }
    if (slot.type === "church") {
        const plan = getChurchPlan(ruleset, slot.churchRoll ?? 0);
        return { w: plan.w, d: plan.d, wallH: plan.wallH };
    }
    let workKind = slot.type;
    if (workKind === "smithy") workKind = "weaponsmith";
    if (workKind === "farm") workKind = "farmer";
    const plan = getWorkBuildingPlan(workKind, cx, cz, catalogStructureSalt(index), ruleset);
    if (plan) return { w: plan.w, d: plan.d, wallH: plan.wallH };
    return footprintForStructure(slot.type, slot.housePlan, ruleset);
}

/**
 * @param {string} token
 */
function sanitizeExportToken(token) {
    return String(token)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

/**
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {number} cx
 * @param {number} cz
 * @param {number} index
 */
export function buildCatalogExportName(ruleset, slot, cx, cz, index) {
    const biome = sanitizeExportToken(ruleset);
    const salt = catalogStructureSalt(index);
    if (slot.type === "house" && slot.housePlan != null) {
        const shell = getHouseShellSummary(slot.housePlan);
        return `${biome}_house_${sanitizeExportToken(shell.id)}_plan${String(shell.index).padStart(2, "0")}`;
    }
    if (slot.type === "church") {
        const roll = slot.churchRoll ?? 0;
        const plan = getChurchPlan(ruleset, roll);
        let planToken = sanitizeExportToken(plan.id);
        const biomePrefix = `${biome}_`;
        if (planToken.startsWith(biomePrefix)) planToken = planToken.slice(biomePrefix.length);
        return `${biome}_church_${planToken}`;
    }
    let workKind = slot.type;
    if (workKind === "smithy") workKind = "weaponsmith";
    const work = getWorkBuildingPlan(workKind, cx, cz, salt, ruleset);
    const variantId = work?.id ?? slot.type;
    return `${biome}_${sanitizeExportToken(variantId)}`;
}

/**
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {CatalogEntryDef} entry
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {number} cx
 * @param {number} cz
 * @param {number} index
 */
function catalogVariantId(ruleset, entry, slot, cx, cz, index) {
    const salt = catalogStructureSalt(index);
    if (slot.type === "house" && slot.housePlan != null) {
        return getHouseShellSummary(slot.housePlan).id;
    }
    if (slot.type === "church") {
        return getChurchPlan(ruleset, slot.churchRoll ?? 0).id;
    }
    let workKind = slot.type;
    if (workKind === "smithy") workKind = "weaponsmith";
    return getWorkBuildingPlan(workKind, cx, cz, salt, ruleset)?.id ?? slot.type;
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {CatalogEntryDef[]} entries
 * @param {{ cols?: number, gap?: number }} [opts]
 */
export function layoutStructureCatalogGrid(cx, cz, ruleset, entries, opts = {}) {
    const cols = opts.cols ?? 2;
    const gap = opts.gap ?? CATALOG_CELL_GAP;
    /** @type {import("./mb_abandonedSettlementBuilder.js").StructureSlot[]} */
    const structures = [];
    /** @type {CatalogManifestEntry[]} */
    const manifest = [];
    /** @type {{ x0: number, z0: number, w: number, d: number }[]} */
    const pads = [];

    let colOx = 0;
    let rowStartOz = 0;
    let rowMaxCellDepth = 0;
    let yardWidth = 0;
    let yardDepth = 0;

    for (let i = 0; i < entries.length; i++) {
        const col = i % cols;
        if (col === 0 && i > 0) {
            rowStartOz += rowMaxCellDepth + gap;
            colOx = 0;
            rowMaxCellDepth = 0;
        }

        const entry = entries[i];
        const slot = buildForceStructureSlot(cx, cz, entry.kind, {
            ruleset,
            housePlan: entry.housePlan,
            churchRoll: entry.churchRoll
        });
        const fp = catalogFootprintForSlot(slot, ruleset, cx, cz, i);
        const plan = catalogResolvedPlan(entry, slot, ruleset, cx, cz, i);
        const { boxMinY, boxMaxY } = catalogExportBoxVertical(plan, fp);
        const padW = fp.w + CATALOG_PAD_MARGIN * 2;
        const padD = fp.d + CATALOG_PAD_MARGIN * 2;

        slot.ox = colOx + CATALOG_PAD_MARGIN;
        slot.oz = rowStartOz + CATALOG_PAD_MARGIN;
        slot.door = doorFacingPlaza(slot.ox, slot.oz, fp.w, fp.d);
        structures.push(slot);

        const variantId = catalogVariantId(ruleset, entry, slot, cx, cz, i);
        const exportName = buildCatalogExportName(ruleset, slot, cx, cz, i);

        manifest.push({
            index: i,
            exportName,
            kind: entry.kind,
            type: slot.type,
            variantId,
            housePlan: slot.housePlan,
            relOx: slot.ox,
            relOz: slot.oz,
            w: fp.w,
            d: fp.d,
            wallH: fp.wallH,
            padX0: colOx,
            padZ0: rowStartOz,
            padW,
            padD,
            boxMinX: slot.ox - CATALOG_BOX_SIDE_PAD,
            boxMaxX: slot.ox + fp.w + CATALOG_BOX_SIDE_PAD - 1,
            boxMinZ: slot.oz - CATALOG_BOX_SIDE_PAD,
            boxMaxZ: slot.oz + fp.d + CATALOG_BOX_SIDE_PAD - 1,
            boxMinY,
            boxMaxY
        });

        pads.push({ x0: colOx, z0: rowStartOz, w: padW, d: padD });

        colOx += padW + gap;
        rowMaxCellDepth = Math.max(rowMaxCellDepth, padD);
        yardWidth = Math.max(yardWidth, colOx > 0 ? colOx - gap : padW);
        yardDepth = Math.max(yardDepth, rowStartOz + padD);
    }

    return {
        structures,
        manifest,
        pads,
        yardWidth,
        yardDepth,
        cols,
        entryCount: entries.length,
        ruleset
    };
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} [ruleset]
 */
export function layoutPlainsStarterCatalog(cx, cz, ruleset = "plains") {
    return layoutStructureCatalogGrid(cx, cz, ruleset, PLAINS_STARTER_CATALOG, { cols: 2 });
}

/**
 * Yard origin marker only — structures build in open air at floorY (no grass/stone pads).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} anchorX
 * @param {number} anchorZ
 * @param {unknown} _layout
 * @param {number} floorY
 */
export function layStructureCatalogPlatform(dimension, anchorX, anchorZ, _layout, floorY) {
    trySetBlock(dimension, anchorX, floorY + 1, anchorZ, "minecraft:gold_block", SETTLEMENT_REPLACE_ANY);
}

/**
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} floorY
 * @param {CatalogManifestEntry[]} manifest
 * @param {{ ruleset?: string, cols?: number, entryCount?: number }} [meta]
 */
export function formatStructureCatalogManifest(centerX, centerZ, floorY, manifest, meta = {}) {
    const ruleset = meta.ruleset ?? "plains";
    const folder = `structures/mb/av_${sanitizeExportToken(ruleset)}`;
    const lines = [
        "=== M.B.A starter set for export (Structure Block) ===",
        `biome/ruleset: ${ruleset} · entries=${meta.entryCount ?? manifest.length} · cols=${meta.cols ?? 2}`,
        `yard origin (gold block): ${centerX}, ${floorY + 1}, ${centerZ}`,
        `floor block Y=${floorY - 1} · export surface-only (no basement, no dirt margin)`,
        `After build: open floors / margins are filled with structure_void (vanilla terrain preserve on jigsaw place).`,
        `Structure Block: place ONE BLOCK OUTSIDE the SW bottom of each save box (not inside the volume).`,
        `After Save: npm run strip:mcstructures → npm run validate:mcstructures`,
        `save each to BP/${folder}/<exportName>.mcstructure`,
        ""
    ];
    for (const m of manifest) {
        const ox = centerX + m.relOx;
        const oz = centerZ + m.relOz;
        const bx0 = centerX + m.boxMinX;
        const bx1 = centerX + m.boxMaxX;
        const bz0 = centerZ + m.boxMinZ;
        const bz1 = centerZ + m.boxMaxZ;
        const floorBlockY = floorY - 1;
        const by0 = floorBlockY + m.boxMinY;
        const by1 = floorBlockY + m.boxMaxY;
        lines.push(
            `[${m.index}] ${m.exportName}.mcstructure`,
            `  variant=${m.variantId} · kind=${m.kind} · type=${m.type}${m.housePlan != null ? ` · plan=${m.housePlan}` : ""}`,
            `  footprint ${m.w}x${m.d} wallH=${m.wallH} · floor origin ${ox}, ${floorY - 1}, ${oz}`,
            `  suggested export box: (${bx0}, ${by0}, ${bz0}) → (${bx1}, ${by1}, ${bz1})  §8(tight — no extra margin)`,
            ""
        );
    }
    return lines.join("\n");
}

/**
 * @returns {boolean}
 */
export function isStructureCatalogDevEnabled() {
    return INCLUDE_FULL_DEVELOPER_TOOLS;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} line1
 * @param {string} [line2]
 */
export function tryPlaceCatalogSign(dimension, x, y, z, line1, line2) {
    if (!trySetBlock(dimension, x, y, z, "minecraft:smooth_stone", SETTLEMENT_REPLACE_ANY)) {
        return false;
    }
    if (!trySetBlock(dimension, x, y + 1, z, "minecraft:oak_sign", SETTLEMENT_REPLACE_ANY)) {
        return false;
    }
    try {
        const block = dimension.getBlock({ x, y: y + 1, z });
        const sign = block?.getComponent(BlockComponentTypes.Sign);
        if (sign) {
            sign.setText(line2 ? `${line1}\n${line2}` : line1);
            return true;
        }
    } catch {
        /* sign text optional */
    }
    return true;
}
