/**
 * Per-structure slot registry for abandoned settlements: position, build status, ladders.
 * Persisted on incomplete sites via mb_abandonedVillageSites (structureManifests).
 * No item-entity scans — block probes only (cheap, run on resume / slot check).
 */

import { getHousePlanForRuleset, getWorkBuildingPlan } from "./mb_settlementStructures.js";

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

/** Perimeter / shell blocks that indicate a finished structure (not paths alone). */
const STRUCTURE_SHELL_IDS = new Set([
    ...SETTLEMENT_SCRIPT_SIGNATURE_IDS,
    ...SETTLEMENT_WEAK_PRESENCE_IDS,
    "minecraft:brick_block",
    "minecraft:stone_bricks",
    "minecraft:mossy_stone_bricks",
    "minecraft:cracked_stone_bricks",
    "minecraft:deepslate_bricks",
    "minecraft:polished_deepslate",
    "minecraft:spruce_log",
    "minecraft:oak_log",
    "minecraft:acacia_log",
    "minecraft:jungle_log",
    "minecraft:spruce_stairs",
    "minecraft:oak_stairs",
    "minecraft:acacia_stairs",
    "minecraft:jungle_stairs",
    "minecraft:cobblestone_stairs",
    "minecraft:mossy_cobblestone_stairs",
    "minecraft:sandstone_stairs",
    "minecraft:smooth_sandstone_stairs",
    "minecraft:glass_pane",
    "minecraft:white_stained_glass_pane",
    "minecraft:ladder",
    "minecraft:oak_door",
    "minecraft:spruce_door",
    "minecraft:acacia_door",
    "minecraft:jungle_door",
    "minecraft:iron_door"
]);

/**
 * @param {string|undefined} id
 */
function isStructureShellBlockId(id) {
    if (!id || id === "minecraft:air" || id === "minecraft:dirt_path") return false;
    if (STRUCTURE_SHELL_IDS.has(id)) return true;
    return (
        id.includes("_planks") ||
        id.includes("_log") ||
        id.includes("_stairs") ||
        id.includes("_door") ||
        id === "mb:dusted_dirt"
    );
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} originX
 * @param {number} originZ
 * @param {number} w
 * @param {number} d
 * @param {number} baseY
 */
function structureFootprintAreaLoaded(dimension, originX, originZ, w, d, baseY) {
    const minCx = Math.floor(originX / 16);
    const maxCx = Math.floor((originX + Math.max(1, w) - 1) / 16);
    const minCz = Math.floor(originZ / 16);
    const maxCz = Math.floor((originZ + Math.max(1, d) - 1) / 16);
    const yProbe = Math.floor(baseY);
    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
            try {
                dimension.getBlock({ x: cx * 16 + 8, y: yProbe, z: cz * 16 + 8 });
            } catch {
                return false;
            }
        }
    }
    return true;
}

/**
 * True when a slot footprint has walls and a roof line — not merely plaza paths or partial debris.
 * @returns {boolean|undefined} true=complete, false=incomplete, undefined=footprint chunks not loaded
 */
export function footprintHasCompleteStructureEvidence(dimension, originX, originZ, w, d, baseY) {
    if (w < 3 || d < 3) return false;
    if (!structureFootprintAreaLoaded(dimension, originX, originZ, w, d, baseY)) {
        return undefined;
    }
    let perimeterWalls = 0;
    let probeOk = 0;
    let probeFail = 0;
    const yLow = Math.floor(baseY) + 1;
    const yHigh = yLow + 4;
    for (let y = yLow; y <= yHigh; y++) {
        for (let x = originX; x < originX + w; x++) {
            for (const z of [originZ, originZ + d - 1]) {
                try {
                    probeOk++;
                    if (isStructureShellBlockId(dimension.getBlock({ x, y, z })?.typeId)) {
                        perimeterWalls++;
                    }
                } catch {
                    probeFail++;
                }
            }
        }
        for (let z = originZ + 1; z < originZ + d - 1; z++) {
            for (const x of [originX, originX + w - 1]) {
                try {
                    probeOk++;
                    if (isStructureShellBlockId(dimension.getBlock({ x, y, z })?.typeId)) {
                        perimeterWalls++;
                    }
                } catch {
                    probeFail++;
                }
            }
        }
    }
    if (probeOk > 0 && probeFail > Math.max(2, Math.floor(probeOk * 0.2))) {
        return undefined;
    }
    let roofBlocks = 0;
    let roofOk = 0;
    let roofFail = 0;
    const roofY = yHigh + 1;
    for (let x = originX; x < originX + w; x++) {
        for (let z = originZ; z < originZ + d; z++) {
            try {
                roofOk++;
                const id = dimension.getBlock({ x, y: roofY, z })?.typeId;
                if (id && id !== "minecraft:air" && !id.includes("glass")) roofBlocks++;
            } catch {
                roofFail++;
            }
        }
    }
    if (roofOk > 0 && roofFail > Math.max(2, Math.floor(roofOk * 0.2))) {
        return undefined;
    }
    const perimeterNeed = Math.max(20, Math.floor((w + d) * 2 * 0.42));
    const roofNeed = Math.max(4, Math.floor((w * d) * 0.12));
    return perimeterWalls >= perimeterNeed && roofBlocks >= roofNeed;
}

/**
 * Perimeter wall count for shell probes (shared by complete / substantial checks).
 * @returns {{ perimeterWalls: number, probeOk: number, probeFail: number }|undefined}
 */
function countFootprintPerimeterShellBlocks(dimension, originX, originZ, w, d, baseY) {
    if (w < 3 || d < 3) return { perimeterWalls: 0, probeOk: 0, probeFail: 0 };
    if (!structureFootprintAreaLoaded(dimension, originX, originZ, w, d, baseY)) {
        return undefined;
    }
    let perimeterWalls = 0;
    let probeOk = 0;
    let probeFail = 0;
    const yLow = Math.floor(baseY) + 1;
    const yHigh = yLow + 4;
    for (let y = yLow; y <= yHigh; y++) {
        for (let x = originX; x < originX + w; x++) {
            for (const z of [originZ, originZ + d - 1]) {
                try {
                    probeOk++;
                    if (isStructureShellBlockId(dimension.getBlock({ x, y, z })?.typeId)) {
                        perimeterWalls++;
                    }
                } catch {
                    probeFail++;
                }
            }
        }
        for (let z = originZ + 1; z < originZ + d - 1; z++) {
            for (const x of [originX, originX + w - 1]) {
                try {
                    probeOk++;
                    if (isStructureShellBlockId(dimension.getBlock({ x, y, z })?.typeId)) {
                        perimeterWalls++;
                    }
                } catch {
                    probeFail++;
                }
            }
        }
    }
    if (probeOk > 0 && probeFail > Math.max(2, Math.floor(probeOk * 0.2))) {
        return undefined;
    }
    return { perimeterWalls, probeOk, probeFail };
}

/**
 * Enough perimeter shell to treat a slot as present — avoids destructive rebuild on resume.
 * @returns {boolean|undefined}
 */
export function footprintHasSubstantialShellEvidence(dimension, originX, originZ, w, d, baseY) {
    const complete = footprintHasCompleteStructureEvidence(dimension, originX, originZ, w, d, baseY);
    if (complete === true) return true;
    if (complete === undefined) return undefined;
    const counts = countFootprintPerimeterShellBlocks(dimension, originX, originZ, w, d, baseY);
    if (!counts) return undefined;
    const perimeterNeed = Math.max(12, Math.floor((w + d) * 2 * 0.28));
    return counts.perimeterWalls >= perimeterNeed;
}

/**
 * Partial script debris — enough to know something was started but not a finished shell.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} originX
 * @param {number} originZ
 * @param {number} w
 * @param {number} d
 * @param {number} baseY
 */
export function footprintHasPartialStructureEvidence(dimension, originX, originZ, w, d, baseY) {
    const midX = originX + Math.floor(w / 2);
    const midZ = originZ + Math.floor(d / 2);
    return footprintHasSettlementEvidence(dimension, midX, midZ, baseY, 4);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} hintY
 * @param {number} [radius]
 */
function footprintHasSettlementEvidence(dimension, wx, wz, hintY, radius = 5) {
    let mossy = 0;
    let scriptStrong = 0;
    let weak = 0;
    const yMid = Math.floor(hintY);
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dy = -4; dy <= 6; dy++) {
                try {
                    const id = dimension.getBlock({ x: wx + dx, y: yMid + dy, z: wz + dz })?.typeId;
                    if (!id) continue;
                    if (id === "minecraft:mossy_cobblestone") {
                        mossy++;
                        scriptStrong++;
                    } else if (SETTLEMENT_SCRIPT_SIGNATURE_IDS.has(id)) {
                        scriptStrong++;
                    } else if (SETTLEMENT_WEAK_PRESENCE_IDS.has(id)) {
                        weak++;
                    }
                } catch {
                    return mossy >= 3 && scriptStrong >= 6;
                }
            }
        }
    }
    if (mossy >= 3 && scriptStrong >= 6) return true;
    if (scriptStrong >= 12) return true;
    if (mossy >= 2 && scriptStrong >= 8 && weak >= 6) return true;
    return false;
}

/** @typedef {"pending"|"building"|"complete"|"existing"|"skipped"} StructureSlotStatus */
/** @typedef {"none"|"needed"|"pending"|"placed"} StructureLadderStatus */

/**
 * @typedef {{
 *   idx: number,
 *   type: string,
 *   ox: number,
 *   oz: number,
 *   door: number,
 *   status: StructureSlotStatus,
 *   ladders: StructureLadderStatus,
 *   housePlan?: number,
 *   label?: string,
 *   ladderWx?: number,
 *   ladderWz?: number,
 *   ladderBaseY?: number,
 *   ladderTopDy?: number
 * }} StructureSlotState
 */

/**
 * @typedef {{
 *   version: number,
 *   centerX: number,
 *   centerZ: number,
 *   y: number,
 *   tier: string,
 *   ruleset: string,
 *   slots: StructureSlotState[]
 * }} SiteStructureManifest
 */

export const STRUCTURE_MANIFEST_VERSION = 1;

/**
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {number} cx
 * @param {number} cz
 * @param {number} idx
 */
export function structureSlotExpectsLadders(slot, ruleset, cx, cz, idx) {
    const salt = 100 + (idx + 1) * 17;
    if (slot.type === "house" && slot.housePlan != null) {
        const plan = getHousePlanForRuleset(ruleset, slot.housePlan);
        if ((plan?.stories ?? 1) >= 2) return true;
        if (plan?.hasRooftopDeck) return true;
        return false;
    }
    const plan = getWorkBuildingPlan(slot.type, cx, cz, salt, ruleset);
    if (!plan) return false;
    if ((plan.stories ?? 1) >= 2) return true;
    if (plan.hasRooftopDeck) return true;
    return false;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} wx
 * @param {number} wz
 * @param {number} baseY
 * @param {number} [topDy]
 */
export function probeLadderColumnPresent(dimension, wx, wz, baseY, topDy = 8) {
    let rungs = 0;
    for (let dy = 0; dy <= topDy; dy++) {
        try {
            const id = dimension.getBlock({ x: wx, y: baseY + dy, z: wz })?.typeId;
            if (id === "minecraft:ladder") rungs++;
        } catch {
            break;
        }
    }
    return rungs >= 2;
}

/**
 * @param {StructureSlotState} state
 */
export function structureSlotCountsAsBuilt(state) {
    return state.status === "complete" || state.status === "existing";
}

/**
 * @param {StructureSlotState|undefined|null} state
 */
export function structureSlotBlocksRebuild(state) {
    if (!state) return false;
    return state.status === "complete" || state.status === "existing";
}

/**
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[] }} job
 * @param {number} idx
 */
export function getStructureSlotState(job, idx) {
    return job.structureSlotStates?.[idx] ?? null;
}

/**
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[] }} job
 * @param {number} idx
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 */
export function ensureStructureSlotState(job, idx, slot) {
    const n = job.structures?.length ?? 0;
    if (!job.structureSlotStates) job.structureSlotStates = new Array(n).fill(null);
    while (job.structureSlotStates.length <= idx) job.structureSlotStates.push(null);
    let state = job.structureSlotStates[idx];
    if (!state) {
        state = {
            idx,
            type: slot.type,
            ox: slot.ox,
            oz: slot.oz,
            door: slot.door,
            status: "pending",
            ladders: structureSlotExpectsLadders(slot, job.ruleset, job.cx, job.cz, idx)
                ? "needed"
                : "none",
            housePlan: slot.housePlan
        };
        job.structureSlotStates[idx] = state;
    }
    return state;
}

/**
 * @param {{ builtStructures?: string[] }} job
 */
export function syncBuiltStructuresListFromStates(job) {
    const rows = job.structureSlotStates;
    if (!rows?.length) return;
    /** @type {string[]} */
    const list = [];
    for (const state of rows) {
        if (state?.label) list.push(state.label);
    }
    job.builtStructures = list;
}

/**
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[], centerX: number, centerZ: number, y: number, ruleset: string, tier: string, cx: number, cz: number, dimension?: import("@minecraft/server").Dimension, pendingLadderColumns?: { originX: number, originZ: number, wx: number, wz: number, baseSy: number, ladderTopDy?: number }[] }} job
 * @param {number} idx
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {string} label
 * @param {{ alreadyPresent?: boolean, skippedFooting?: boolean, originX?: number, originZ?: number, accessLx?: number, accessLz?: number, ladderFootLx?: number, ladderFootLz?: number, wallH?: number }} [buildState]
 */
export function recordStructureSlotOutcome(job, idx, slot, label, buildState) {
    const state = ensureStructureSlotState(job, idx, slot);
    state.ox = slot.ox;
    state.oz = slot.oz;
    state.door = slot.door;
    state.label = label;
    if (buildState?.alreadyPresent) {
        state.status = "existing";
    } else if (buildState?.skippedFooting) {
        state.status = "skipped";
    } else {
        state.status = "complete";
    }
    const expects = structureSlotExpectsLadders(slot, job.ruleset, job.cx, job.cz, idx);
    if (!expects) {
        state.ladders = "none";
    } else {
        const ox = buildState?.originX ?? job.centerX + slot.ox;
        const oz = buildState?.originZ ?? job.centerZ + slot.oz;
        const ladderLx = buildState?.ladderFootLx ?? buildState?.accessLx;
        const ladderLz = buildState?.ladderFootLz ?? buildState?.accessLz;
        if (ladderLx != null && ladderLz != null) {
            state.ladderWx = ox + ladderLx;
            state.ladderWz = oz + ladderLz;
            state.ladderBaseY = job.y;
            state.ladderTopDy = (buildState?.wallH ?? 4) + 1;
        }
        const pending = (job.pendingLadderColumns ?? []).some(
            (p) => p.originX === ox && p.originZ === oz
        );
        if (pending) {
            state.ladders = "pending";
        } else if (
            job.dimension &&
            state.ladderWx != null &&
            state.ladderWz != null &&
            probeLadderColumnPresent(
                job.dimension,
                state.ladderWx,
                state.ladderWz,
                state.ladderBaseY ?? job.y,
                state.ladderTopDy ?? 8
            )
        ) {
            state.ladders = "placed";
        } else {
            state.ladders = state.status === "complete" ? "needed" : "none";
        }
    }
    syncBuiltStructuresListFromStates(job);
}

/**
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[], centerX: number, centerZ: number, y: number, ruleset: string, tier: string, cx: number, cz: number, dimension?: import("@minecraft/server").Dimension }} job
 * @param {number} idx
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {(type: string, housePlan: number|undefined, ruleset: string) => { w: number, d: number }} footprintForStructure
 */
export function refreshStructureSlotFromWorld(job, idx, slot, dimension, footprintForStructure) {
    const state = ensureStructureSlotState(job, idx, slot);
    const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
    const originX = job.centerX + slot.ox;
    const originZ = job.centerZ + slot.oz;
    if (!footprintHasCompleteStructureEvidence(dimension, originX, originZ, fp.w, fp.d, job.y)) {
        return false;
    }
    if (structureSlotBlocksRebuild(state) && state.status !== "pending") {
        if (
            state.ladders === "needed" ||
            state.ladders === "pending"
        ) {
            if (
                state.ladderWx != null &&
                state.ladderWz != null &&
                probeLadderColumnPresent(
                    dimension,
                    state.ladderWx,
                    state.ladderWz,
                    state.ladderBaseY ?? job.y,
                    state.ladderTopDy ?? 8
                )
            ) {
                state.ladders = "placed";
            }
        }
        return structureSlotBlocksRebuild(state);
    }
    state.status = "existing";
    state.ox = slot.ox;
    state.oz = slot.oz;
    if (
        state.ladderWx != null &&
        state.ladderWz != null &&
        probeLadderColumnPresent(
            dimension,
            state.ladderWx,
            state.ladderWz,
            state.ladderBaseY ?? job.y,
            state.ladderTopDy ?? 8
        )
    ) {
        state.ladders = "placed";
    } else if (structureSlotExpectsLadders(slot, job.ruleset, job.cx, job.cz, idx)) {
        state.ladders = "needed";
    }
    return true;
}

/**
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[], centerX: number, centerZ: number, y: number, ruleset: string, tier: string, siteGx?: number, siteGz?: number, siteSub?: number, dimension?: import("@minecraft/server").Dimension }} job
 * @param {(type: string, housePlan: number|undefined, ruleset: string) => { w: number, d: number }} footprintForStructure
 */
export function refreshAllStructureSlotsFromWorld(job, footprintForStructure) {
    const dim = job.dimension;
    if (!dim) return 0;
    let n = 0;
    const slots = job.structures ?? [];
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (refreshStructureSlotFromWorld(job, i, slot, dim, footprintForStructure)) {
            n++;
        }
    }
    syncBuiltStructuresListFromStates(job);
    return n;
}

/**
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[], centerX: number, centerZ: number, y: number, ruleset: string, tier: string }} job
 * @param {number} idx
 * @param {import("./mb_abandonedSettlementBuilder.js").StructureSlot} slot
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {(type: string, housePlan: number|undefined, ruleset: string) => { w: number, d: number }} footprintForStructure
 */
export function structureSlotShouldSkipBuild(job, idx, slot, dimension, footprintForStructure) {
    const state = getStructureSlotState(job, idx);
    if (structureSlotBlocksRebuild(state)) return true;
    const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
    const originX = job.centerX + slot.ox;
    const originZ = job.centerZ + slot.oz;
    const complete = footprintHasCompleteStructureEvidence(
        dimension,
        originX,
        originZ,
        fp.w,
        fp.d,
        job.y
    );
    if (complete === true) {
        return refreshStructureSlotFromWorld(job, idx, slot, dimension, footprintForStructure);
    }
    // During live placement, never infer skip from partial debris — only finished shells above.
    if (
        !job.finished &&
        (job.phase === "structures" ||
            job.phase === "structure_retry" ||
            job.phase === "structure_hold")
    ) {
        return false;
    }
    return refreshStructureSlotFromWorld(job, idx, slot, dimension, footprintForStructure);
}

/**
 * Every non-abandoned slot must be complete before the settlement counts as finished.
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[], structureSlotAbandoned?: Set<number> }} job
 */
export function allResolvableStructureSlotsFinished(job) {
    const slots = job.structures ?? [];
    if (!slots.length) return false;
    const abandoned = job.structureSlotAbandoned ?? new Set();
    for (let i = 0; i < slots.length; i++) {
        if (abandoned.has(i)) continue;
        const state = getStructureSlotState(job, i);
        if (!state || !structureSlotCountsAsBuilt(state)) return false;
    }
    return true;
}

/**
 * Demote registry rows that were marked complete from loose footprint probes but are half-built.
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[], centerX: number, centerZ: number, y: number, ruleset: string, structureSlotAbandoned?: Set<number> }} job
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {(type: string, housePlan: number|undefined, ruleset: string) => { w: number, d: number }} footprintForStructure
 */
export function reconcileStructureSlotStatesBeforeResume(job, dimension, footprintForStructure) {
    const slots = job.structures ?? [];
    let demoted = 0;
    for (let i = 0; i < slots.length; i++) {
        const state = getStructureSlotState(job, i);
        if (!state || (state.status !== "complete" && state.status !== "existing")) continue;
        const slot = slots[i];
        const fp = footprintForStructure(slot.type, slot.housePlan, job.ruleset);
        const originX = job.centerX + slot.ox;
        const originZ = job.centerZ + slot.oz;
        const complete = footprintHasCompleteStructureEvidence(
            dimension,
            originX,
            originZ,
            fp.w,
            fp.d,
            job.y
        );
        if (complete === true || complete === undefined) {
            continue;
        }
        if (!footprintHasPartialStructureEvidence(dimension, originX, originZ, fp.w, fp.d, job.y)) {
            continue;
        }
        state.status = "pending";
        delete state.label;
        if (state.ladders === "placed") state.ladders = "needed";
        demoted++;
    }
    if (demoted > 0) syncBuiltStructuresListFromStates(job);
    return demoted;
}

/**
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[], centerX: number, centerZ: number, y: number, ruleset: string, tier: string }} job
 * @returns {SiteStructureManifest}
 */
export function exportJobStructureManifest(job) {
    const slots = job.structures ?? [];
    /** @type {StructureSlotState[]} */
    const out = [];
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const state = getStructureSlotState(job, i) ?? ensureStructureSlotState(job, i, slot);
        out.push({ ...state, idx: i, type: slot.type, ox: slot.ox, oz: slot.oz, door: slot.door });
    }
    return {
        version: STRUCTURE_MANIFEST_VERSION,
        centerX: job.centerX,
        centerZ: job.centerZ,
        y: job.y,
        tier: job.tier,
        ruleset: job.ruleset,
        slots: out
    };
}

/**
 * @param {{ structures?: import("./mb_abandonedSettlementBuilder.js").StructureSlot[], structureSlotStates?: (StructureSlotState|null)[], centerX: number, centerZ: number, y: number, ruleset: string, tier: string }} job
 * @param {SiteStructureManifest|undefined|null} manifest
 */
export function applyStructureManifestToJob(job, manifest) {
    if (!manifest?.slots?.length) return;
    job.structureSlotStates = new Array(job.structures?.length ?? 0).fill(null);
    for (const saved of manifest.slots) {
        const idx = saved.idx;
        const slot = job.structures?.[idx];
        if (!slot || idx < 0) continue;
        slot.ox = saved.ox;
        slot.oz = saved.oz;
        slot.door = saved.door;
        job.structureSlotStates[idx] = { ...saved };
    }
    syncBuiltStructuresListFromStates(job);
}

/**
 * @param {{ structureSlotStates?: (StructureSlotState|null)[] }} job
 */
export function countStructuresBuiltFromStates(job) {
    let n = 0;
    const slots = job.structures?.length ?? 0;
    for (let i = 0; i < slots; i++) {
        const state = getStructureSlotState(job, i);
        if (state && structureSlotCountsAsBuilt(state)) n++;
    }
    return n;
}

/**
 * @param {{ structureSlotStates?: (StructureSlotState|null)[] }} job
 */
export function formatStructureRegistrySummary(job) {
    const lines = [];
    const slots = job.structureSlotStates ?? [];
    for (const state of slots) {
        if (!state) continue;
        const pos = `@ ${job.centerX + state.ox}, ${job.centerZ + state.oz}`;
        const lad =
            state.ladders === "none"
                ? ""
                : state.ladders === "placed"
                  ? " · ladders ok"
                  : ` · ladders ${state.ladders}`;
        lines.push(`  [${state.idx + 1}] ${state.type} ${state.status}${lad} ${pos}`);
    }
    return lines.length ? lines.join("\n") : "  (no slot registry)";
}
