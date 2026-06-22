import { system } from "@minecraft/server";
import { getInfectionCameraShakeEnabled } from "./mb_codex.js";
import { INCLUDE_FULL_DEVELOPER_TOOLS } from "./mb_buildConfig.js";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";

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
const SNOW_BUZZ_BASE_DURATION_SEC = 2.1;
const SNOW_BUZZ_EXTEND_PER_STACK_SEC = 0.45;
const SNOW_BUZZ_MAX_DURATION_SEC = 6.5;
const SNOW_BUZZ_STACK_WINDOW_TICKS = 100;
const SNOW_BUZZ_MAX_STACK = 8;

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
 * Immediate camera "buzz" when eating snow. Stacks if eaten again within ~5s (longer linger, weaker pulses).
 * @param {import("@minecraft/server").Player} player
 * @param {number} [snowCount] lifetime snow eaten this infection (after this bite)
 */
export function triggerSnowEatCameraBuzz(player, snowCount = 1) {
    if (!player?.isValid) return;
    try {
        if (player.getGameMode?.() === "spectator") return;
    } catch {
        /* ignore */
    }
    if (!getInfectionCameraShakeEnabled(player)) return;

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

    const intensity = computeSnowEatBuzzIntensity(snowCount, entry.stack);
    const durationSec = Math.min(
        SNOW_BUZZ_MAX_DURATION_SEC,
        SNOW_BUZZ_BASE_DURATION_SEC + entry.stack * SNOW_BUZZ_EXTEND_PER_STACK_SEC
    );
    const extendFromActive = entry.untilTick > now ? Math.min(1.2, (entry.untilTick - now) / 20 * 0.35) : 0;
    const totalDuration = Math.min(SNOW_BUZZ_MAX_DURATION_SEC, durationSec + extendFromActive);

    const rotApi = applyShakePulse(player, intensity, totalDuration, "Rotational");
    if (intensity >= 0.14) {
        applyShakePulse(player, intensity * 0.38, totalDuration * 0.7, "Positional");
    }

    entry.untilTick = now + Math.floor(totalDuration * 20);
    snowBuzzByPlayer.set(pid, entry);

    if (isInfectionCameraShakeDebugEnabled()) {
        recordShakeDebug(pid, {
            player: player.name,
            mode: "snow_buzz",
            snowCount,
            stack: entry.stack,
            intensity: Number(intensity.toFixed(2)),
            durationSec: Number(totalDuration.toFixed(2)),
            api: rotApi,
            skipped: rotApi === "none",
            reason: rotApi === "none" ? "api_unavailable" : "snow_buzz"
        });
    }
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

    try {
        if (player.getGameMode?.() === "spectator") return;
    } catch {
        /* ignore */
    }

    if (!getInfectionCameraShakeEnabled(player)) return;

    const maxTicks = Math.max(1, opts.maxTicks || 1);
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
        const jitterDuration = 1.2 + urgency * 2.2 + severity * 0.2 + Math.random() * 0.75;
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
            const burstDuration = 0.18 + Math.random() * 0.38 + urgency * 0.1;
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
