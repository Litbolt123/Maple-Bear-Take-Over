/**
 * Infection ambient audio & short VFX — positional awareness for self and nearby players.
 * Does not import main.js or mb_codex.js (avoids circular deps); callers pass tier/volume callbacks.
 */

import { world, system } from "@minecraft/server";
import { hasInfectionExposureLineOfSight } from "./mb_infectionExposureLos.js";

const COUGH_DUST_PARTICLE = "mb:white_dust_particle_short";

const COUGH_SOUND_MINOR = "mb.infection_cough_minor";
const COUGH_SOUND_MAJOR = "mb.infection_cough_major";
const HICCUP_SOUND = "mb.dust_eat_hiccup";
const CURE_SIGH_MINOR = "mb.cure_sigh_relief_minor";
const CURE_SIGH_MAJOR = "mb.cure_sigh_relief_major";

/** Matches RP sound_definitions per-file levels (cough/hiccup 0.68, cure 0.34); script-side gain */
const BASE_DEFINITION_ATTENUATION = 0.75;
/** Major coughs louder than minor */
const MAJOR_VOLUME_MULT = 1.38;
const MINOR_VOLUME_MULT = 1;

const COUGH_RADIUS = 18;
const HICCUP_RADIUS = 14;
const CURE_SIGH_RADIUS = 16;

const EMITTER_TIER_MUL = [0, 0.52, 1];
const HEAR_OTHERS_TIER_MUL = [0, 0.48, 1];

/** Next tick when a cough may be attempted (randomized spacing per player) */
const nextCoughDueTickByPlayer = new Map();
const lastDustBreathTickByPlayer = new Map();

function randInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function distSq(ax, ay, az, bx, by, bz) {
    const dx = ax - bx;
    const dy = ay - by;
    const dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Play a sound for the source player and nearby listeners (same dimension).
 * @param {import("@minecraft/server").Player} sourcePlayer
 * @param {string} soundId
 * @param {number} pitch
 * @param {number} baseVolume - before master volume (0..~1.5)
 * @param {number} radius
 * @param {(p: import("@minecraft/server").Player) => number} getEmitterTier - 0=off 1=low 2=high (only for source)
 * @param {(p: import("@minecraft/server").Player) => number} getHearOthersTier - 0=off for *others*
 * @param {(p: import("@minecraft/server").Player) => number} getMasterVolume - 0..1
 */
export function playInfectionSpatialSound(sourcePlayer, soundId, pitch, baseVolume, radius, getEmitterTier, getHearOthersTier, getMasterVolume) {
    if (!sourcePlayer?.isValid || !soundId) return false;
    const emitterTier = Math.max(0, Math.min(2, Math.floor(getEmitterTier(sourcePlayer) ?? 2)));
    /** Tier 0 = do not broadcast to others; you still hear yourself quietly (matches journal copy). */
    const emitterMutedForOthers = emitterTier === 0;

    const dim = sourcePlayer.dimension;
    const loc = sourcePlayer.location;
    if (!dim || !loc) return false;

    const r2 = radius * radius;
    let any = false;

    for (const p of world.getPlayers()) {
        if (!p?.isValid || p.dimension?.id !== dim.id) continue;
        const pl = p.location;
        if (!pl) continue;
        if (distSq(loc.x, loc.y, loc.z, pl.x, pl.y, pl.z) > r2) continue;

        const isSelf = p.id === sourcePlayer.id;
        if (!isSelf) {
            const from = { x: loc.x, y: loc.y + 1.5, z: loc.z };
            const to = { x: pl.x, y: pl.y + 1.5, z: pl.z };
            if (!hasInfectionExposureLineOfSight(dim, from, to)) continue;
        }
        if (emitterMutedForOthers && !isSelf) continue;

        let hearMul = 1;
        if (!isSelf) {
            const ht = Math.max(0, Math.min(2, Math.floor(getHearOthersTier(p) ?? 2)));
            hearMul = HEAR_OTHERS_TIER_MUL[ht] ?? 1;
            if (hearMul <= 0) continue;
        }

        const master = Math.max(0, Math.min(1, getMasterVolume(p) ?? 1));
        let emitterMul = EMITTER_TIER_MUL[emitterTier] ?? 1;
        if (emitterMutedForOthers && isSelf) {
            emitterMul = 0.58;
        }
        const vol = Math.max(0, Math.min(1, baseVolume * emitterMul * hearMul * master));
        if (vol <= 0) continue;
        try {
            p.playSound(soundId, { pitch, volume: vol });
            any = true;
        } catch { /* ignore */ }
    }
    return any;
}

/**
 * @param {object} ctx
 * @param {boolean} [ctx.introActive]
 * @param {boolean} [ctx.environmentSynergy]
 * @param {number} [ctx.maxInfectionTicks] - minor/major cap from main (for “last quarter” dust rule)
 * @param {function} ctx.getEmitterTier
 * @param {function} ctx.getHearOthersTier
 * @param {function} ctx.getMasterVolume
 * @returns {{ playedCough: boolean, playedBreath: boolean }}
 */
export function tickInfectionCoughAndBreath(sourcePlayer, infectionState, ctx) {
    const out = { playedCough: false, playedBreath: false };
    if (!sourcePlayer?.isValid || !infectionState || infectionState.cured || infectionState.ticksLeft <= 0) return out;
    if (ctx.introActive) return out;

    const isMajor = (infectionState.infectionType || "major") === "major";
    const synergy = ctx.environmentSynergy ? 1.45 : 1;
    const snowCount = infectionState.snowCount || 0;
    const snowSynergy = isMajor ? (snowCount >= 21 ? 1.22 : snowCount >= 11 ? 1.12 : 1) : 1;

    const maxT = typeof ctx.maxInfectionTicks === "number" && ctx.maxInfectionTicks > 0 ? ctx.maxInfectionTicks : 0;
    const ticksLeft = infectionState.ticksLeft || 0;
    /** Minor: white-dust “snow” puff only in final 25% of timer (same scale as main.js ratio). */
    const minorInLastQuarter = !isMajor && maxT > 0 && ticksLeft * 4 <= maxT;

    const now = system.currentTick;
    const pid = sourcePlayer.id;

    // --- Cough (sound only, no particle): major common; minor much rarer ---
    let nextDue = nextCoughDueTickByPlayer.get(pid);
    if (nextDue === undefined) {
        nextDue = now + randInt(isMajor ? 400 : 2600, isMajor ? 1400 : 6200);
        nextCoughDueTickByPlayer.set(pid, nextDue);
    }

    if (now >= nextDue) {
        const pressure = synergy * (isMajor ? snowSynergy : 1);
        const coughThreshold = isMajor ? 0.34 : 0.052;
        if (Math.random() <= coughThreshold * pressure) {
            const soundId = isMajor ? COUGH_SOUND_MAJOR : COUGH_SOUND_MINOR;
            const baseVol = BASE_DEFINITION_ATTENUATION * (isMajor ? MAJOR_VOLUME_MULT : MINOR_VOLUME_MULT) * (0.88 + Math.random() * 0.12);
            const pitch = 0.92 + Math.random() * 0.14;
            const played = playInfectionSpatialSound(
                sourcePlayer,
                soundId,
                pitch,
                baseVol,
                COUGH_RADIUS,
                ctx.getEmitterTier,
                ctx.getHearOthersTier,
                ctx.getMasterVolume
            );
            if (played) {
                out.playedCough = true;
                const gapMin = isMajor ? 520 : 2800;
                const gapMax = isMajor ? 1280 : 7200;
                const gap = Math.max(240, Math.round(randInt(gapMin, gapMax) / pressure));
                nextCoughDueTickByPlayer.set(pid, now + gap);
            } else {
                nextCoughDueTickByPlayer.set(pid, now + randInt(isMajor ? 100 : 200, isMajor ? 320 : 520));
            }
        } else {
            nextCoughDueTickByPlayer.set(pid, now + randInt(isMajor ? 140 : 320, isMajor ? 480 : 900));
        }
    }

    // --- Dust breath: particle + cough sound. Major: rare anytime. Minor: only last quarter; rarer roll. ---
    const breathCooldown = 5600;
    const lastB = lastDustBreathTickByPlayer.get(pid) ?? -1e9;
    const allowDustBreath = isMajor || minorInLastQuarter;
    const breathChance = isMajor ? 0.095 * synergy : 0.048 * synergy;
    if (allowDustBreath && now - lastB >= breathCooldown && Math.random() < breathChance) {
        lastDustBreathTickByPlayer.set(pid, now);
        try {
            const dim = sourcePlayer.dimension;
            const l = sourcePlayer.location;
            if (dim && l) {
                dim.spawnParticle(COUGH_DUST_PARTICLE, { x: l.x, y: l.y + 1.2, z: l.z });
            }
        } catch { /* ignore */ }
        const breathVol = BASE_DEFINITION_ATTENUATION * (isMajor ? MAJOR_VOLUME_MULT : MINOR_VOLUME_MULT) * (0.36 + Math.random() * 0.12);
        const breathPitch = 0.96 + Math.random() * 0.12;
        const breathSound = isMajor ? COUGH_SOUND_MAJOR : COUGH_SOUND_MINOR;
        playInfectionSpatialSound(
            sourcePlayer,
            breathSound,
            breathPitch,
            breathVol,
            COUGH_RADIUS,
            ctx.getEmitterTier,
            ctx.getHearOthersTier,
            ctx.getMasterVolume
        );
        out.playedBreath = true;
    }

    return out;
}

/** After eating powder — higher pitch (~+25%) */
export function playPowderHiccup(sourcePlayer, getEmitterTier, getHearOthersTier, getMasterVolume) {
    const pitch = 1.25;
    const baseVol = BASE_DEFINITION_ATTENUATION * 0.85;
    return playInfectionSpatialSound(
        sourcePlayer,
        HICCUP_SOUND,
        pitch,
        baseVol,
        HICCUP_RADIUS,
        getEmitterTier,
        getHearOthersTier,
        getMasterVolume
    );
}

export function playCureSighRelief(sourcePlayer, isMajorCure, getEmitterTier, getHearOthersTier, getMasterVolume) {
    const id = isMajorCure ? CURE_SIGH_MAJOR : CURE_SIGH_MINOR;
    const baseVol = BASE_DEFINITION_ATTENUATION * (isMajorCure ? 0.95 : 0.88);
    return playInfectionSpatialSound(
        sourcePlayer,
        id,
        1,
        baseVol,
        CURE_SIGH_RADIUS,
        getEmitterTier,
        getHearOthersTier,
        getMasterVolume
    );
}

export function resetInfectionAudioCooldowns(playerId) {
    nextCoughDueTickByPlayer.delete(playerId);
    lastDustBreathTickByPlayer.delete(playerId);
}
