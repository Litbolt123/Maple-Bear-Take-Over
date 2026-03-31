/**
 * Line-of-sight for infection-adjacent mechanics: cough / breath audio to other players,
 * and counting nearby corrupted blocks for ambient pressure.
 * Solid walls block; liquids and foliage/plants (shared lists) do not.
 */

import { SNOW_REPLACEABLE_BLOCKS, STORM_PARTICLE_PASS_THROUGH } from "./mb_blockLists.js";

/** Blocks exposure can pass through (not "walls"). */
const INFECTION_EXPOSURE_PASSTHROUGH = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:snow_layer",
    "mb:snow_layer",
    "minecraft:string",
    "minecraft:tripwire",
    "minecraft:tripwire_hook",
    "minecraft:redstone_wire",
    "minecraft:cobweb"
]);

for (const id of SNOW_REPLACEABLE_BLOCKS) INFECTION_EXPOSURE_PASSTHROUGH.add(id);
for (const id of STORM_PARTICLE_PASS_THROUGH) INFECTION_EXPOSURE_PASSTHROUGH.add(id);

/**
 * @param {import("@minecraft/server").Block | null | undefined} block
 * @returns {boolean} true if this block **blocks** airborne exposure (wall-like)
 */
function blockOccludesInfectionExposure(block) {
    if (!block) return false;
    try {
        if (block.isAir) return false;
    } catch { /* ignore */ }
    try {
        if (block.isLiquid) return false;
    } catch { /* ignore */ }
    const id = block.typeId;
    if (!id) return false;
    if (INFECTION_EXPOSURE_PASSTHROUGH.has(id)) return false;
    return true;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {{ x: number, y: number, z: number }} from - world coords (e.g. mouth / eye)
 * @param {{ x: number, y: number, z: number }} to - world coords (e.g. other player's eye)
 */
export function hasInfectionExposureLineOfSight(dimension, from, to) {
    if (!dimension || !from || !to) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.35) return true;

    const steps = Math.max(2, Math.min(56, Math.ceil(len * 3)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const px = from.x + dx * t;
        const py = from.y + dy * t;
        const pz = from.z + dz * t;
        try {
            const block = dimension.getBlock({
                x: Math.floor(px),
                y: Math.floor(py),
                z: Math.floor(pz)
            });
            if (blockOccludesInfectionExposure(block)) return false;
        } catch {
            return false;
        }
    }
    return true;
}
