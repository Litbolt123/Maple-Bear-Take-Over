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
    const midX = job.centerX + slot.ox + Math.floor(fp.w / 2);
    const midZ = job.centerZ + slot.oz + Math.floor(fp.d / 2);
    if (!footprintHasSettlementEvidence(dimension, midX, midZ, job.y, 5)) {
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
    return refreshStructureSlotFromWorld(job, idx, slot, dimension, footprintForStructure);
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
