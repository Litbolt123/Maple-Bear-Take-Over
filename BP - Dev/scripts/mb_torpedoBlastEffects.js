/**
 * Player-facing torpedo explosion effects (camera shake, cough dust, infection penalty).
 * Infection state is applied via callback registered from main.js (avoids circular imports).
 */

import { world, Player } from "@minecraft/server";
import { getPlayerSoundVolume, getInfectionCueEmitterTier, getInfectionCueHearOthersTier } from "./mb_codex.js";
import { playForcedCoughDustBurst } from "./mb_infectionAudio.js";
import { triggerTorpedoBlastCameraBuzz } from "./mb_infectionCameraShake.js";

/** Horizontal blast radius (matches torpedo snow placement). */
export const TORPEDO_BLAST_RADIUS = 5;

/**
 * Major infection: snow severity bump (~1.3× a direct torpedo melee hit of 0.9).
 * Also applies {@link getSnowTimeEffect} via main callback.
 */
export const TORPEDO_BLAST_SNOW_INCREASE = 1.2;

/** Major infection: flat timer loss on top of snow tier time effect (0.1 Minecraft day = 2400 ticks). */
export const TORPEDO_BLAST_MAJOR_TIMER_REDUCE_TICKS = 2400;

/** Minor infection: flat timer loss (0.05 Minecraft day = 1200 ticks). */
export const TORPEDO_BLAST_MINOR_TIMER_REDUCE_TICKS = 1200;

/** @type {((player: import("@minecraft/server").Player) => void)|null} */
let applyTorpedoBlastInfectionFn = null;

/**
 * @param {(player: import("@minecraft/server").Player) => void} fn
 */
export function registerTorpedoBlastInfectionHandler(fn) {
    applyTorpedoBlastInfectionFn = typeof fn === "function" ? fn : null;
}

function distSq(ax, ay, az, bx, by, bz) {
    const dx = ax - bx;
    const dy = ay - by;
    const dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Shake, cough dust, and infection penalty for players inside a torpedo blast.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {{ x: number, y: number, z: number }} center
 * @param {number} [radius]
 */
export function applyTorpedoBlastPlayerEffects(dimension, center, radius = TORPEDO_BLAST_RADIUS) {
    if (!dimension || !center) return;

    const r2 = radius * radius;
    const getEmitterTier = (p) => getInfectionCueEmitterTier(p);
    const getHearOthersTier = (p) => getInfectionCueHearOthersTier(p);
    const getMasterVolume = (p) => getPlayerSoundVolume(p);

    for (const entity of world.getPlayers()) {
        if (!(entity instanceof Player) || !entity.isValid) continue;
        if (entity.dimension?.id !== dimension.id) continue;

        const loc = entity.location;
        if (!loc) continue;
        if (distSq(center.x, center.y, center.z, loc.x, loc.y, loc.z) > r2) continue;

        try {
            if (entity.getGameMode?.() === "spectator") continue;
        } catch {
            /* ignore */
        }

        triggerTorpedoBlastCameraBuzz(entity, 1);
        playForcedCoughDustBurst(entity, getEmitterTier, getHearOthersTier, getMasterVolume);

        try {
            applyTorpedoBlastInfectionFn?.(entity);
        } catch {
            /* ignore */
        }
    }
}
