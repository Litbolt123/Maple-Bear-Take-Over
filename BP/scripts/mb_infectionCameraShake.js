import { system, world } from "@minecraft/server";
import { getInfectionCameraShakeEnabled, getCameraShakeCategoryEnabled } from "./mb_codex.js";
import { INCLUDE_FULL_DEVELOPER_TOOLS } from "./mb_buildConfig.js";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";
import {
    TINY_BEAR_ID,
    DAY4_BEAR_ID,
    DAY8_BEAR_ID,
    DAY13_BEAR_ID,
    DAY20_BEAR_ID,
    INFECTED_BEAR_ID,
    INFECTED_BEAR_DAY8_ID,
    INFECTED_BEAR_DAY13_ID,
    INFECTED_BEAR_DAY20_ID,
    BUFF_BEAR_ID,
    BUFF_BEAR_DAY13_ID,
    BUFF_BEAR_DAY20_ID,
    FLYING_BEAR_ID,
    FLYING_BEAR_DAY15_ID,
    FLYING_BEAR_DAY20_ID,
    MINING_BEAR_ID,
    MINING_BEAR_DAY20_ID,
    TORPEDO_BEAR_ID,
    TORPEDO_BEAR_DAY20_ID,
    INFECTED_PIG_ID,
    INFECTED_COW_ID
} from "./mb_spawnEntityIds.js";

const SHAKE_DEBUG_PROP = "mb_infection_shake_debug";

/** Peak intensity window before bear transformation (last 2s @ 20 TPS). */
export const TRANSFORM_FULL_SHAKE_TICKS = 40;
/** Ramp from base → peak over the last 30s real-time before transform. */
const TRANSFORM_RAMP_SHAKE_TICKS = 600;

/** ~70% of prior outside-final strength (was 0.4). */
const SHAKE_INTENSITY_BASE = 0.28;
/** ~70% of prior peak (was 1.0) — still strongest at transform, not overwhelming. */
const SHAKE_INTENSITY_PEAK = 0.7;

/** Powder buzz on eating mb:snow — separate from infection death-rattle. */
const SNOW_BUZZ_BASE_INTENSITY = 0.48;
const SNOW_BUZZ_MIN_INTENSITY = 0.08;
const SNOW_BUZZ_BASE_DURATION_SEC = 1.15;
const SNOW_BUZZ_EXTEND_PER_STACK_SEC = 0.22;
const SNOW_BUZZ_MAX_DURATION_SEC = 3.2;
const SNOW_BUZZ_STACK_WINDOW_TICKS = 100;
const SNOW_BUZZ_MAX_STACK = 8;

/** One-shot pulses (snow, melee, blasts) — shorter than early beta.5 tuning. */
const REFERENCE_PULSE_DURATION_SCALE = 0.55;
const EXPLOSION_PULSE_DURATION_SCALE = 0.45;
const INFECTION_JITTER_DURATION_SCALE = 0.58;
const INFECTION_BURST_DURATION_SCALE = 0.5;

/** Bear melee hit — intensity vs snow-eat first-bite baseline; scales with bear SIZE (bigger = harder shake). */
export const BEAR_HIT_SHAKE_RATIO_TINY = 0.24;
export const BEAR_HIT_SHAKE_RATIO_SMALL = 0.36;
export const BEAR_HIT_SHAKE_RATIO_STANDARD = 0.5;
/** Alias — mid-size day13/day20 and mining bears. */
export const BEAR_HIT_SHAKE_RATIO_DEFAULT = BEAR_HIT_SHAKE_RATIO_STANDARD;
export const BEAR_HIT_SHAKE_RATIO_LARGE = 0.62;
export const BEAR_HIT_SHAKE_RATIO_LARGE_PLUS = 0.66;
export const BEAR_HIT_SHAKE_RATIO_LARGE_MAX = 0.7;
export const BEAR_HIT_SHAKE_RATIO_HEAVY = 0.76;
export const BEAR_HIT_SHAKE_RATIO_BUFF = 1.0;
/** Flying MBs — light aerial hits; between tiny and standard, scaled by day variant. */
export const BEAR_HIT_SHAKE_RATIO_FLYING = 0.28;
export const BEAR_HIT_SHAKE_RATIO_FLYING_DAY15 = 0.38;
export const BEAR_HIT_SHAKE_RATIO_FLYING_DAY20 = 0.44;
/** Torpedo melee vs powder blast (blast stronger than body slam). */
export const BEAR_HIT_SHAKE_RATIO_TORPEDO_HIT = 0.54;
export const TORPEDO_BLAST_SHAKE_RATIO = 0.86;
/** Buff death powder burst — matches torpedo blast. */
export const BUFF_BURST_SHAKE_RATIO = TORPEDO_BLAST_SHAKE_RATIO;
/** Exposed inside active storm — ~flying MB base hit. */
export const STORM_EXPOSURE_SHAKE_RATIO = BEAR_HIT_SHAKE_RATIO_FLYING;
/** Normal infection cough (sound only). */
export const COUGH_SHAKE_RATIO_MINOR = 0.12;
export const COUGH_SHAKE_RATIO_MAJOR = 0.18;
/** Dust breath / forced dust cough — much stronger than normal cough. */
export const DUST_COUGH_SHAKE_RATIO_MINOR = 0.38;
export const DUST_COUGH_SHAKE_RATIO_MAJOR = 0.55;
/** Major cure relief — brief settle pulse. */
export const MAJOR_CURE_SETTLE_SHAKE_RATIO = 0.2;
/** World day milestone at sunrise. */
export const DAY_MILESTONE_SHAKE_RATIO = 0.24;

const STORM_SHAKE_INTERVAL_TICKS = 55;
/** @type {Map<string, number>} */
const lastStormExposureShakeTick = new Map();

const SMALL_BEAR_TYPE_IDS = new Set([DAY4_BEAR_ID, DAY8_BEAR_ID]);
const STANDARD_BEAR_TYPE_IDS = new Set([DAY13_BEAR_ID, DAY20_BEAR_ID, MINING_BEAR_ID]);
const LARGE_BEAR_TYPE_IDS = new Set([INFECTED_BEAR_ID, INFECTED_PIG_ID, INFECTED_COW_ID]);
const LARGE_PLUS_BEAR_TYPE_IDS = new Set([INFECTED_BEAR_DAY8_ID]);
const LARGE_MAX_BEAR_TYPE_IDS = new Set([INFECTED_BEAR_DAY13_ID, MINING_BEAR_DAY20_ID]);
const HEAVY_BEAR_TYPE_IDS = new Set([INFECTED_BEAR_DAY20_ID]);
const FLYING_BEAR_TYPE_IDS = new Set([
    FLYING_BEAR_ID,
    FLYING_BEAR_DAY15_ID,
    FLYING_BEAR_DAY20_ID
]);
const TORPEDO_BEAR_TYPE_IDS = new Set([TORPEDO_BEAR_ID, TORPEDO_BEAR_DAY20_ID]);
const BUFF_BEAR_TYPE_IDS = new Set([BUFF_BEAR_ID, BUFF_BEAR_DAY13_ID, BUFF_BEAR_DAY20_ID]);
const ALL_MAPLE_BEAR_HIT_TYPE_IDS = new Set([
    TINY_BEAR_ID,
    ...SMALL_BEAR_TYPE_IDS,
    ...STANDARD_BEAR_TYPE_IDS,
    ...LARGE_BEAR_TYPE_IDS,
    ...LARGE_PLUS_BEAR_TYPE_IDS,
    ...LARGE_MAX_BEAR_TYPE_IDS,
    ...HEAVY_BEAR_TYPE_IDS,
    ...FLYING_BEAR_TYPE_IDS,
    ...TORPEDO_BEAR_TYPE_IDS,
    ...BUFF_BEAR_TYPE_IDS
]);

/** @type {Map<string, { lastEatTick: number, stack: number, untilTick: number }>} */
const snowBuzzByPlayer = new Map();

/** @type {Map<string, number>} */
const lastJitterTick = new Map();
/** @type {Map<string, number>} */
const lastBurstTick = new Map();
/** @type {Map<string, number>} */
const nextBurstTick = new Map();

/** @type {Map<string, object>} */
const lastDebugByPlayer = new Map();

/** @type {Map<string, number>} playerId → world tick when shake may resume */
const shakeSuppressedUntilTick = new Map();

const POWDER_SNOW_BLOCK = "minecraft:powder_snow";
const VANILLA_FREEZE_PREVIEW_RESISTANCE_AMP = 4;
const VANILLA_FREEZE_PREVIEW_REPLACEABLE = new Set([
    POWDER_SNOW_BLOCK,
    "minecraft:air",
    "minecraft:snow_layer",
    "mb:snow_layer",
    "minecraft:short_grass",
    "minecraft:tall_grass",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:water",
    "minecraft:flowing_water"
]);

/** @type {Map<string, { saved: Array<{ x: number, y: number, z: number, typeId: string }>, restoreTick: number }>} */
const activeVanillaFreezePreviewByPlayer = new Map();

/**
 * Block infection/snow camera shake until a future tick (death screen, respawn grace).
 * @param {import("@minecraft/server").Player} player
 * @param {number} [ticks]
 */
export function suppressInfectionCameraShake(player, ticks = 100) {
    if (!player?.id) return;
    const until = system.currentTick + Math.max(1, ticks);
    const prev = shakeSuppressedUntilTick.get(player.id) ?? 0;
    shakeSuppressedUntilTick.set(player.id, Math.max(prev, until));
}

/**
 * @param {string} playerId
 * @returns {boolean}
 */
export function isInfectionCameraShakeSuppressed(playerId) {
    const until = shakeSuppressedUntilTick.get(playerId) ?? 0;
    if (until <= system.currentTick) {
        if (until > 0) shakeSuppressedUntilTick.delete(playerId);
        return false;
    }
    return true;
}

/**
 * camerashake stop often fails once on death; retry across a few ticks.
 * @param {import("@minecraft/server").Player} player
 * @param {number} [attempts]
 */
export function pulseClearInfectionCameraShake(player, attempts = 6) {
    const playerId = player?.id;
    if (!playerId) return;

    const clearLive = () => {
        try {
            for (const p of world.getAllPlayers()) {
                if (p.id === playerId && p.isValid) {
                    clearInfectionCameraShake(p);
                    return;
                }
            }
        } catch {
            /* ignore */
        }
    };

    clearLive();
    const delays = [1, 3, 8, 15, 30, 50, 80];
    for (let i = 0; i < Math.min(attempts, delays.length); i++) {
        system.runTimeout(clearLive, delays[i]);
    }
}

/**
 * @returns {boolean}
 */
export function isInfectionCameraShakeDebugEnabled() {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS) return false;
    try {
        return getWorldProperty(SHAKE_DEBUG_PROP) === 1 || getWorldProperty(SHAKE_DEBUG_PROP) === "1";
    } catch {
        return false;
    }
}

/**
 * @param {boolean} on
 */
export function setInfectionCameraShakeDebugEnabled(on) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS) return;
    try {
        setWorldProperty(SHAKE_DEBUG_PROP, on ? 1 : 0);
    } catch {
        /* ignore */
    }
}

/**
 * @param {string} playerId
 * @returns {object|undefined}
 */
export function getLastInfectionShakeDebug(playerId) {
    return lastDebugByPlayer.get(playerId);
}

/**
 * @param {string} playerId
 * @param {object} info
 */
function recordShakeDebug(playerId, info) {
    if (!isInfectionCameraShakeDebugEnabled()) return;
    const entry = { ...info, atTick: system.currentTick };
    lastDebugByPlayer.set(playerId, entry);
    console.warn(`[INFECTION SHAKE] ${JSON.stringify(entry)}`);
}

/** @type {Map<string, "script"|"command"|"none">} */
const shakeApiModeByPlayer = new Map();

/**
 * Skip camera shake when infection is still early (saves codex reads + API calls on day 0).
 * @param {{ ticksLeft?: number, cured?: boolean }} state
 * @param {number} maxTicks
 * @returns {boolean}
 */
export function shouldTickInfectionCameraShake(state, maxTicks) {
    if (!state || state.cured) return false;
    const ticksLeft = Math.max(0, state.ticksLeft || 0);
    if (ticksLeft <= 12000) return true;
    if (ticksLeft <= 24000) return true;
    const cap = Math.max(1, maxTicks || 1);
    return ticksLeft / cap <= 0.45;
}

/**
 * Softer most of the infection; ramps over the last 30s; peaks at {@link SHAKE_INTENSITY_PEAK} in the final 2s.
 * @param {number} ticksLeft
 * @returns {number}
 */
export function getInfectionShakeIntensityMultiplier(ticksLeft) {
    const t = Math.max(0, ticksLeft || 0);
    if (t <= TRANSFORM_FULL_SHAKE_TICKS) return SHAKE_INTENSITY_PEAK;
    if (t <= TRANSFORM_RAMP_SHAKE_TICKS) {
        const span = Math.max(1, TRANSFORM_RAMP_SHAKE_TICKS - TRANSFORM_FULL_SHAKE_TICKS);
        const u = 1 - (t - TRANSFORM_FULL_SHAKE_TICKS) / span;
        return SHAKE_INTENSITY_BASE + u * (SHAKE_INTENSITY_PEAK - SHAKE_INTENSITY_BASE);
    }
    return SHAKE_INTENSITY_BASE;
}

/**
 * Stop infection-driven camera shake for a player.
 * @param {import("@minecraft/server").Player} player
 */
export function clearInfectionCameraShake(player) {
    if (!player?.isValid) return;
    try {
        player.camera?.stopShaking?.();
    } catch {
        /* ignore */
    }
    try {
        player.runCommand?.("camerashake stop @s");
    } catch {
        try {
            player.dimension?.runCommand?.(`camerashake stop "${player.name}"`);
        } catch {
            /* ignore */
        }
    }
    lastJitterTick.delete(player.id);
    lastBurstTick.delete(player.id);
    nextBurstTick.delete(player.id);
    shakeApiModeByPlayer.delete(player.id);
    snowBuzzByPlayer.delete(player.id);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {Array<{ x: number, y: number, z: number, typeId: string }>} saved
 */
function restoreVanillaFreezePreviewBlocks(dimension, saved) {
    if (!dimension || !saved?.length) return;
    for (const entry of saved) {
        try {
            const block = dimension.getBlock({ x: entry.x, y: entry.y, z: entry.z });
            if (!block) continue;
            if (block.typeId !== POWDER_SNOW_BLOCK) continue;
            block.setType(entry.typeId);
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {boolean} [notify]
 */
function stopVanillaFreezeCameraShakePreview(player, notify = false) {
    const pid = player?.id;
    if (!pid) return;
    const active = activeVanillaFreezePreviewByPlayer.get(pid);
    if (!active) return;
    activeVanillaFreezePreviewByPlayer.delete(pid);
    try {
        if (player.isValid) {
            restoreVanillaFreezePreviewBlocks(player.dimension, active.saved);
            if (notify) {
                player.sendMessage("§7[Dev] Vanilla freeze shake preview stopped.");
            }
        }
    } catch {
        /* ignore */
    }
}

/**
 * Fallback when powder snow cannot be placed: ramping rotational camerashake pulses (approximation).
 * @param {import("@minecraft/server").Player} player
 * @param {number} durationSec
 */
function runVanillaFreezeShakeFallback(player, durationSec) {
    const durationTicks = Math.max(20, Math.floor(durationSec * 20));
    const pulseEvery = 8;
    const totalPulses = Math.ceil(durationTicks / pulseEvery);
    let pulse = 0;

    const tickPulse = () => {
        if (!player?.isValid) return;
        if (!activeVanillaFreezePreviewByPlayer.has(player.id)) return;
        const t = pulse / Math.max(1, totalPulses - 1);
        const intensity = 0.06 + t * 0.22;
        applyShakePulse(player, intensity, 0.55 + t * 0.35, "Rotational");
        pulse++;
        if (pulse < totalPulses) {
            system.runTimeout(tickPulse, pulseEvery);
        }
    };

    tickPulse();
}

/**
 * Dev-only: trigger client-hardcoded powder-snow freeze camera shake for comparison with MBA shake.
 * Places powder snow at the player's feet/head blocks, restores afterward, and suppresses MBA shake.
 * @param {import("@minecraft/server").Player} player
 * @param {number} [durationSec]
 */
export function previewVanillaFreezeCameraShake(player, durationSec = 15) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS) return;
    if (!player?.isValid) return;

    const durationTicks = Math.max(20, Math.floor(durationSec * 20));
    stopVanillaFreezeCameraShakePreview(player);

    clearInfectionCameraShake(player);
    suppressInfectionCameraShake(player, durationTicks + 40);

    const loc = player.location;
    const dim = player.dimension;
    const bx = Math.floor(loc.x);
    const by = Math.floor(loc.y);
    const bz = Math.floor(loc.z);
    const slots = [
        { x: bx, y: by, z: bz },
        { x: bx, y: by + 1, z: bz }
    ];

    /** @type {Array<{ x: number, y: number, z: number, typeId: string }>} */
    const saved = [];
    for (const pos of slots) {
        try {
            const block = dim.getBlock(pos);
            if (!block) continue;
            const typeId = block.typeId;
            if (!VANILLA_FREEZE_PREVIEW_REPLACEABLE.has(typeId)) continue;
            saved.push({ x: pos.x, y: pos.y, z: pos.z, typeId });
            block.setType(POWDER_SNOW_BLOCK);
        } catch {
            /* ignore */
        }
    }

    if (saved.length === 0) {
        player.sendMessage("§e[Dev] Could not place powder snow — using camerashake approximation.");
        activeVanillaFreezePreviewByPlayer.set(player.id, { saved: [], restoreTick: system.currentTick + durationTicks });
        runVanillaFreezeShakeFallback(player, durationSec);
        system.runTimeout(() => {
            activeVanillaFreezePreviewByPlayer.delete(player.id);
            try {
                if (player.isValid) {
                    player.sendMessage("§7[Dev] Vanilla freeze shake preview stopped (approximation).");
                }
            } catch {
                /* ignore */
            }
        }, durationTicks);
        return;
    }

    try {
        player.addEffect("resistance", durationTicks + 60, {
            amplifier: VANILLA_FREEZE_PREVIEW_RESISTANCE_AMP,
            showParticles: false
        });
    } catch {
        /* ignore */
    }

    activeVanillaFreezePreviewByPlayer.set(player.id, {
        saved,
        restoreTick: system.currentTick + durationTicks
    });

    player.sendMessage(`§b[Dev] Vanilla freeze shake preview started (~${durationSec}s). MBA shake suppressed.`);

    system.runTimeout(() => {
        stopVanillaFreezeCameraShakePreview(player, true);
    }, durationTicks);
}

/**
 * Per-bite intensity falls as lifetime snowCount rises; rapid re-eats stack duration but each pulse is weaker.
 * @param {number} snowCount
 * @param {number} stackIndex 0 = first bite in a chain
 * @returns {number}
 */
export function computeSnowEatBuzzIntensity(snowCount, stackIndex) {
    const count = Math.max(1, snowCount || 1);
    const lifetimeDim = 1 / Math.sqrt(1 + (count - 1) * 0.22);
    const stackDim = 1 / (1 + Math.max(0, stackIndex) * 0.32);
    return Math.max(SNOW_BUZZ_MIN_INTENSITY, SNOW_BUZZ_BASE_INTENSITY * lifetimeDim * stackDim);
}

/**
 * Size-tier shake multiplier vs snow-eat first bite (tiny → buff).
 * @param {string} attackerTypeId
 * @returns {number}
 */
export function getBearHitShakeRatio(attackerTypeId) {
    if (!attackerTypeId) return BEAR_HIT_SHAKE_RATIO_STANDARD;
    if (BUFF_BEAR_TYPE_IDS.has(attackerTypeId)) return BEAR_HIT_SHAKE_RATIO_BUFF;
    if (TORPEDO_BEAR_TYPE_IDS.has(attackerTypeId)) return BEAR_HIT_SHAKE_RATIO_TORPEDO_HIT;
    if (attackerTypeId === FLYING_BEAR_DAY20_ID) return BEAR_HIT_SHAKE_RATIO_FLYING_DAY20;
    if (attackerTypeId === FLYING_BEAR_DAY15_ID) return BEAR_HIT_SHAKE_RATIO_FLYING_DAY15;
    if (attackerTypeId === FLYING_BEAR_ID) return BEAR_HIT_SHAKE_RATIO_FLYING;
    if (HEAVY_BEAR_TYPE_IDS.has(attackerTypeId)) return BEAR_HIT_SHAKE_RATIO_HEAVY;
    if (LARGE_MAX_BEAR_TYPE_IDS.has(attackerTypeId)) return BEAR_HIT_SHAKE_RATIO_LARGE_MAX;
    if (LARGE_PLUS_BEAR_TYPE_IDS.has(attackerTypeId)) return BEAR_HIT_SHAKE_RATIO_LARGE_PLUS;
    if (LARGE_BEAR_TYPE_IDS.has(attackerTypeId)) return BEAR_HIT_SHAKE_RATIO_LARGE;
    if (STANDARD_BEAR_TYPE_IDS.has(attackerTypeId)) return BEAR_HIT_SHAKE_RATIO_STANDARD;
    if (SMALL_BEAR_TYPE_IDS.has(attackerTypeId)) return BEAR_HIT_SHAKE_RATIO_SMALL;
    if (attackerTypeId === TINY_BEAR_ID) return BEAR_HIT_SHAKE_RATIO_TINY;
    return BEAR_HIT_SHAKE_RATIO_STANDARD;
}

/**
 * Shorter shake linger for the smallest bears so hits feel subtle, not buzzy.
 * @param {string} attackerTypeId
 * @returns {number}
 */
export function getBearHitShakeDurationScale(attackerTypeId) {
    const ratio = getBearHitShakeRatio(attackerTypeId);
    if (ratio <= BEAR_HIT_SHAKE_RATIO_TINY + 0.01) return 0.5;
    if (ratio <= BEAR_HIT_SHAKE_RATIO_FLYING + 0.01) return 0.55;
    if (ratio <= BEAR_HIT_SHAKE_RATIO_SMALL + 0.01) return 0.65;
    if (ratio <= BEAR_HIT_SHAKE_RATIO_FLYING_DAY20 + 0.01) return 0.75;
    return 1;
}

/**
 * @param {string} typeId
 * @returns {boolean}
 */
export function isMapleBearHitShakeType(typeId) {
    return ALL_MAPLE_BEAR_HIT_TYPE_IDS.has(typeId);
}

/**
 * Shared snow-reference camera buzz (snow eat, bear hits, torpedo blast).
 * @param {import("@minecraft/server").Player} player
 * @param {number} snowCount
 * @param {number} intensityRatio vs first-bite snow buzz
 * @param {string} mode debug label
 * @param {string} [detail] optional attacker type id etc.
 * @param {number} [durationScale] multiplier on pulse length (tiny/small bear hits)
 * @param {"infection"|"snow"|"combat"|"storm"|"cues"} [category]
 */
function triggerReferenceCameraBuzz(player, snowCount = 1, intensityRatio = 1, mode = "snow_buzz", detail, durationScale = 1, category = "snow") {
    if (!player?.isValid) return;
    if (isInfectionCameraShakeSuppressed(player.id)) return;
    try {
        if (player.getGameMode?.() === "spectator") return;
    } catch {
        /* ignore */
    }
    if (!getCameraShakeCategoryEnabled(player, category)) return;

    const pid = player.id;
    const now = system.currentTick;
    let entry = snowBuzzByPlayer.get(pid);
    if (!entry) {
        entry = { lastEatTick: 0, stack: 0, untilTick: 0 };
    }

    if (now - entry.lastEatTick <= SNOW_BUZZ_STACK_WINDOW_TICKS) {
        entry.stack = Math.min(SNOW_BUZZ_MAX_STACK, entry.stack + 1);
    } else {
        entry.stack = 0;
    }
    entry.lastEatTick = now;

    const baseIntensity = computeSnowEatBuzzIntensity(snowCount, entry.stack);
    const intensity = Math.max(SNOW_BUZZ_MIN_INTENSITY, baseIntensity * Math.max(0.05, intensityRatio));
    const durationSec = Math.min(
        SNOW_BUZZ_MAX_DURATION_SEC,
        SNOW_BUZZ_BASE_DURATION_SEC + entry.stack * SNOW_BUZZ_EXTEND_PER_STACK_SEC
    );
    const extendFromActive = entry.untilTick > now ? Math.min(1.2, (entry.untilTick - now) / 20 * 0.35) : 0;
    const totalDuration = Math.min(
        SNOW_BUZZ_MAX_DURATION_SEC,
        (durationSec + extendFromActive) * Math.max(0.25, durationScale) * REFERENCE_PULSE_DURATION_SCALE
    );

    const rotApi = applyShakePulse(player, intensity, totalDuration, "Rotational");
    if (intensity >= 0.14) {
        applyShakePulse(player, intensity * 0.38, totalDuration * 0.7, "Positional");
    }

    entry.untilTick = now + Math.floor(totalDuration * 20);
    snowBuzzByPlayer.set(pid, entry);

    if (isInfectionCameraShakeDebugEnabled()) {
        recordShakeDebug(pid, {
            player: player.name,
            mode,
            detail,
            snowCount,
            stack: entry.stack,
            intensityRatio: Number(intensityRatio.toFixed(2)),
            intensity: Number(intensity.toFixed(2)),
            durationSec: Number(totalDuration.toFixed(2)),
            api: rotApi,
            skipped: rotApi === "none",
            reason: rotApi === "none" ? "api_unavailable" : mode
        });
    }
}

/**
 * Immediate camera "buzz" when eating snow. Stacks if eaten again within ~5s (longer linger, weaker pulses).
 * @param {import("@minecraft/server").Player} player
 * @param {number} [snowCount] lifetime snow eaten this infection (after this bite)
 */
export function triggerSnowEatCameraBuzz(player, snowCount = 1) {
    triggerReferenceCameraBuzz(player, snowCount, 1, "snow_buzz", undefined, 1, "snow");
}

/**
 * Camera buzz when struck by a Maple Bear (size-tiered vs snow-eat baseline).
 * @param {import("@minecraft/server").Player} player
 * @param {string} attackerTypeId
 * @param {number} [snowCount] lifetime snow severity when infected (else 1)
 */
export function triggerMapleBearHitCameraBuzz(player, attackerTypeId, snowCount = 1) {
    if (!isMapleBearHitShakeType(attackerTypeId)) return;
    const ratio = getBearHitShakeRatio(attackerTypeId);
    const durationScale = getBearHitShakeDurationScale(attackerTypeId);
    triggerReferenceCameraBuzz(player, snowCount, ratio, "bear_hit", attackerTypeId, durationScale, "combat");
}

/**
 * Camera buzz when caught in a torpedo bear explosion.
 * @param {import("@minecraft/server").Player} player
 * @param {number} [snowCount]
 */
export function triggerTorpedoBlastCameraBuzz(player, snowCount = 1) {
    triggerReferenceCameraBuzz(player, snowCount, TORPEDO_BLAST_SHAKE_RATIO, "torpedo_blast", undefined, EXPLOSION_PULSE_DURATION_SCALE, "combat");
}

/**
 * Buff bear death powder burst — torpedo-class shake for players in radius.
 * @param {import("@minecraft/server").Player} player
 */
export function triggerBuffBurstCameraBuzz(player) {
    triggerReferenceCameraBuzz(player, 1, BUFF_BURST_SHAKE_RATIO, "buff_burst", undefined, EXPLOSION_PULSE_DURATION_SCALE, "combat");
}

/**
 * Normal infection cough (small wobble).
 * @param {import("@minecraft/server").Player} player
 * @param {boolean} [isMajor]
 */
export function triggerInfectionCoughCameraBuzz(player, isMajor = false) {
    const ratio = isMajor ? COUGH_SHAKE_RATIO_MAJOR : COUGH_SHAKE_RATIO_MINOR;
    triggerReferenceCameraBuzz(player, 1, ratio, "cough", isMajor ? "major" : "minor", 0.55, "cues");
}

/**
 * Dust breath / forced dust cough — stronger than normal cough.
 * @param {import("@minecraft/server").Player} player
 * @param {boolean} [isMajor]
 */
export function triggerInfectionDustCoughCameraBuzz(player, isMajor = false) {
    const ratio = isMajor ? DUST_COUGH_SHAKE_RATIO_MAJOR : DUST_COUGH_SHAKE_RATIO_MINOR;
    triggerReferenceCameraBuzz(player, 1, ratio, "dust_cough", isMajor ? "major" : "minor", 0.85, "cues");
}

/**
 * Brief settle pulse on major infection cure.
 * @param {import("@minecraft/server").Player} player
 */
export function triggerMajorCureSettleCameraBuzz(player) {
    triggerReferenceCameraBuzz(player, 1, MAJOR_CURE_SETTLE_SHAKE_RATIO, "major_cure_settle", undefined, 0.45, "cues");
}

/**
 * Subtle pulse when a milestone world day begins.
 * @param {import("@minecraft/server").Player} player
 * @param {number} [day]
 */
export function triggerDayMilestoneCameraBuzz(player, day = 0) {
    triggerReferenceCameraBuzz(player, 1, DAY_MILESTONE_SHAKE_RATIO, "day_milestone", String(day), 0.6, "cues");
}

/**
 * Throttled ambient shake while exposed inside an active storm (~flying MB hit).
 * @param {import("@minecraft/server").Player} player
 */
export function tickStormExposureCameraBuzz(player) {
    if (!player?.isValid) return;
    const pid = player.id;
    const now = system.currentTick;
    const last = lastStormExposureShakeTick.get(pid) ?? 0;
    if (now - last < STORM_SHAKE_INTERVAL_TICKS) return;
    lastStormExposureShakeTick.set(pid, now);
    triggerReferenceCameraBuzz(player, 1, STORM_EXPOSURE_SHAKE_RATIO, "storm_exposure", undefined, 0.7, "storm");
}

/**
 * @param {number} ticksLeft
 * @param {number} maxTicks
 * @returns {number} 0–3
 */
export function computeInfectionShakeSeverity(ticksLeft, maxTicks) {
    const t = Math.max(0, ticksLeft || 0);
    const cap = Math.max(1, maxTicks || 1);

    if (t <= 24000) {
        const phaseRatio = t / 24000;
        if (phaseRatio > 0.75) return 1;
        if (phaseRatio > 0.5) return 2;
        if (phaseRatio > 0.2) return 2;
        return 3;
    }

    const ratio = Math.max(0, Math.min(1, t / cap));
    if (ratio > 0.75) return 0;
    if (ratio > 0.5) return 1;
    if (ratio > 0.2) return 2;
    return 3;
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {number} intensity
 * @param {number} durationSec
 * @param {"Rotational"|"Positional"} type
 * @returns {"script"|"command"|"none"}
 */
function applyShakePulse(player, intensity, durationSec, type) {
    const shakeType = type === "Positional" ? "positional" : "rotational";
    const i = Math.min(4, Math.max(0.08, intensity));
    const d = Math.min(8, Math.max(0.1, durationSec));
    const pid = player.id;
    const cached = shakeApiModeByPlayer.get(pid);

    if (cached !== "command" && cached !== "none") {
        try {
            const cam = player.camera;
            if (cam?.addShake) {
                cam.addShake({ intensity: i, duration: d, type });
                shakeApiModeByPlayer.set(pid, "script");
                return "script";
            }
        } catch {
            /* try command */
        }
    }

    if (cached === "none") return "none";

    try {
        player.runCommand(`camerashake add @s ${i.toFixed(2)} ${d.toFixed(2)} ${shakeType}`);
        shakeApiModeByPlayer.set(pid, "command");
        return "command";
    } catch {
        try {
            player.dimension?.runCommand(`camerashake add "${player.name}" ${i.toFixed(2)} ${d.toFixed(2)} ${shakeType}`);
            shakeApiModeByPlayer.set(pid, "command");
            return "command";
        } catch {
            shakeApiModeByPlayer.set(pid, "none");
            return "none";
        }
    }
}

/**
 * Minor is calmer while healthy; both infection types reach full shake near death.
 * Major uses full scale throughout (snow tier adds on top).
 * @param {boolean} isMinor
 * @param {number} urgency 0–1
 * @param {number} severity 0–3
 * @returns {number}
 */
function getShakeIntensityScale(isMinor, urgency, severity) {
    if (!isMinor) return 0.7;
    if (urgency >= 0.88 || severity >= 3) return 0.7;
    if (urgency >= 0.65 || severity >= 2) return 0.55 + urgency * 0.15;
    return 0.3 + urgency * 0.27;
}

/**
 * @param {number} urgency 0–1
 * @param {number} severity 0–3
 * @returns {number} ticks between jitter attempts
 */
function jitterCooldownTicks(urgency, severity) {
    const base = 140 - urgency * 115 - severity * 8;
    const spread = 0.65 + Math.random() * 0.7;
    return Math.max(12, Math.floor(base * spread));
}

/**
 * @param {number} urgency
 * @returns {number} 0–1 chance to fire jitter this tick window
 */
function jitterFireChance(urgency) {
    if (urgency >= 0.92) return 1;
    if (urgency >= 0.75) return 0.88 + Math.random() * 0.12;
    return 0.12 + urgency * 0.72;
}

/**
 * @param {string} playerId
 * @param {number} urgency
 * @param {number} severity
 * @param {number} now
 */
function scheduleNextBurst(playerId, urgency, severity, now) {
    const minGap = Math.max(50, Math.floor(220 - urgency * 160 - severity * 12));
    const maxGap = minGap + 80 + Math.floor((1 - urgency) * 280);
    const gap = minGap + Math.floor(Math.random() * Math.max(1, maxGap - minGap));
    nextBurstTick.set(playerId, now + gap);
}

/**
 * Queue camera shake: long low jitters + occasional sharp bursts (random timing).
 * @param {import("@minecraft/server").Player} player
 * @param {{ ticksLeft?: number, cured?: boolean, infectionType?: string, snowCount?: number }} state
 * @param {{ maxTicks: number, severityLevel?: number, introActive?: boolean, forceBurst?: boolean }} opts
 */
export function tickInfectionCameraShake(player, state, opts) {
    if (!player?.isValid || !state || state.cured || opts.introActive) return;

    if (isInfectionCameraShakeSuppressed(player.id)) {
        clearInfectionCameraShake(player);
        return;
    }

    try {
        if (player.getGameMode?.() === "spectator") return;
    } catch {
        /* ignore */
    }

    try {
        const health = player.getComponent("minecraft:health");
        if (health && health.currentValue <= 0) {
            clearInfectionCameraShake(player);
            return;
        }
    } catch {
        /* ignore */
    }

    if (!getCameraShakeCategoryEnabled(player, "infection")) return;

    const maxTicks = Math.max(1, opts?.maxTicks ?? 1);
    if (!opts.forceBurst && !shouldTickInfectionCameraShake(state, maxTicks)) return;

    const debug = {
        player: player?.name,
        skipped: true,
        reason: "unknown",
        ticksLeft: state?.ticksLeft,
        maxTicks: opts?.maxTicks,
        severity: 0,
        urgency: 0,
        mode: "none",
        api: "none"
    };

    const ticksLeft = Math.max(0, state.ticksLeft || 0);
    const isMinor = state.infectionType === "minor";

    const severity = Math.max(
        computeInfectionShakeSeverity(ticksLeft, maxTicks),
        Math.max(0, Math.min(3, opts.severityLevel ?? 0))
    );

    const phaseCap = Math.min(maxTicks, 24000);
    const urgency =
        ticksLeft <= phaseCap
            ? 1 - ticksLeft / Math.max(1, phaseCap)
            : 1 - ticksLeft / maxTicks;

    debug.severity = severity;
    debug.urgency = Number(urgency.toFixed(3));
    debug.isMinor = isMinor;

    if (severity <= 0 && urgency < 0.12) {
        debug.reason = "too_early";
        recordShakeDebug(player.id, debug);
        return;
    }

    const snowCount = state.snowCount || 0;
    const snowBoost = isMinor ? 0 : Math.min(1, snowCount / 50);
    const phaseIntensity = getInfectionShakeIntensityMultiplier(ticksLeft);
    const intensityScale =
        getShakeIntensityScale(isMinor, urgency, severity) * phaseIntensity;
    debug.intensityScale = Number(intensityScale.toFixed(2));
    debug.phaseIntensity = phaseIntensity;

    const now = system.currentTick;
    const pid = player.id;

    if (!nextBurstTick.has(pid)) {
        scheduleNextBurst(pid, urgency, severity, now);
    }

    let api = "none";
    let didShake = false;

    // --- Long low jitters (overlap more as death nears) ---
    const lastJit = lastJitterTick.get(pid) ?? 0;
    const jitCd = jitterCooldownTicks(urgency, severity);
    if (now - lastJit >= jitCd && Math.random() < jitterFireChance(urgency)) {
        const jitterIntensity = Math.min(
            isMinor ? 0.85 : 1.05,
            (0.08 + urgency * 0.3 + severity * 0.05 + (isMinor ? 0 : snowBoost * 0.09)) * intensityScale
        );
        const jitterDuration = (1.2 + urgency * 2.2 + severity * 0.2 + Math.random() * 0.75) * INFECTION_JITTER_DURATION_SCALE;
        const jitApi = applyShakePulse(player, jitterIntensity, jitterDuration, "Rotational");
        if (jitApi !== "none") {
            api = jitApi;
            didShake = true;
            lastJitterTick.set(pid, now);
            debug.mode = "jitter";
            debug.jitterIntensity = Number(jitterIntensity.toFixed(2));
            debug.jitterDuration = Number(jitterDuration.toFixed(2));
        }
    }

    // --- Random sharp bursts ---
    const burstDue = opts.forceBurst || now >= (nextBurstTick.get(pid) ?? 0);
    if (burstDue) {
        if (!opts.forceBurst) {
            scheduleNextBurst(pid, urgency, severity, now);
        }
        const burstChance =
            (opts.forceBurst ? 1 : 0.18 + urgency * 0.45 + severity * 0.1) *
            (phaseIntensity < SHAKE_INTENSITY_PEAK * 0.95 ? 0.5 : 1);
        if (Math.random() < burstChance) {
            const burstIntensity = Math.min(
                2.85,
                (0.5 + urgency * 1.55 + severity * 0.45 + snowBoost * 0.65) * intensityScale
            );
            const burstDuration = (0.18 + Math.random() * 0.38 + urgency * 0.1) * INFECTION_BURST_DURATION_SCALE;
            const rotApi = applyShakePulse(player, burstIntensity, burstDuration, "Rotational");
            if (rotApi !== "none") {
                api = rotApi;
                didShake = true;
                lastBurstTick.set(pid, now);
                debug.mode = didShake && debug.mode === "jitter" ? "jitter+burst" : "burst";
                debug.burstIntensity = Number(burstIntensity.toFixed(2));
                debug.burstDuration = Number(burstDuration.toFixed(2));
            }
            const burstPositional =
                severity >= 2 || urgency > 0.5 || (!isMinor && snowBoost > 0.35);
            if (burstPositional) {
                const posApi = applyShakePulse(
                    player,
                    Math.min(1.65, burstIntensity * 0.42),
                    burstDuration * 0.8,
                    "Positional"
                );
                if (api === "none" && posApi !== "none") api = posApi;
            }
        }
    }

    debug.api = api;
    if (!didShake) {
        debug.reason = burstDue ? "burst_roll_miss" : `jitter_cd_${now - lastJit}`;
        recordShakeDebug(player.id, debug);
        return;
    }

    debug.skipped = false;
    debug.reason = "shook";
    recordShakeDebug(player.id, debug);

    if (isInfectionCameraShakeDebugEnabled()) {
        try {
            const detail =
                debug.mode === "jitter+burst"
                    ? `jit ${debug.jitterIntensity}/${debug.jitterDuration}s + burst ${debug.burstIntensity}`
                    : debug.mode === "jitter"
                      ? `jit ${debug.jitterIntensity} ${debug.jitterDuration}s`
                      : `burst ${debug.burstIntensity} ${debug.burstDuration}s`;
            player.onScreenDisplay?.setActionBar?.(
                `§d[Shake] §7${debug.mode} §8urg§f${debug.urgency} §7${detail} §8${api}`
            );
        } catch {
            /* ignore */
        }
    }
}
