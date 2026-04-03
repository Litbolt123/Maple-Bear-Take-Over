/**
 * Spawn TPS + pressure: per-player horizontal movement EMA throttles block-query budgets;
 * per spatial-cluster centroid “camp” ramps spawn chance and storm rolls.
 *
 * Inner cylinder (30 XZ, ±50 Y): only while the cluster centroid stays here does camp ramp up;
 * leaving it pauses ramp and decays sedentary progress (2× decay rate).
 *
 * Big-base mode: after ~2 in-game days of the centroid staying inside a large footprint
 * (100 XZ, ±150 Y) around the anchor, that cluster uses a longer ramp and smaller max bonuses.
 * Leaving the large footprint drops big-base qualification until re-earned.
 */

/** Half in-game day (ticks) — “small base” full camp ramp. */
export const CAMP_RAMP_FULL_TICKS = 12000;
/** Full camp ramp for qualified big-base clusters (less aggressive). */
const CAMP_RAMP_FULL_TICKS_BIG = 36000;

/** Ramping / “at the hearth”: centroid must stay inside this cylinder around the drifting anchor. */
const CAMP_RADIUS_XZ = 30;
const CAMP_Y_TOLERANCE = 50;

/** Large footprint: time in this cylinder (around anchor) qualifies big-base treatment. */
const BASE_ZONE_RADIUS_XZ = 100;
const BASE_ZONE_Y_TOLERANCE = 150;

/** ~2 in-game days inside the large footprint to activate big-base tuning. */
const BIG_BASE_QUALIFICATION_TICKS = 48000;

const ANCHOR_LERP_SEDENTARY = 0.045;
const ANCHOR_LERP_MOVING = 0.14;
/** Max spawn chance multiplier from camp (1 → 1.35) — small-base cap. */
const SPAWN_PRESSURE_MAX_BONUS = 0.35;
/** Big-base cap (1 → 1.22). */
const SPAWN_PRESSURE_MAX_BONUS_BIG = 0.22;
/** Extra multiplicative factor on storm start roll (0 → +12%) — small base. */
const STORM_ROLL_MAX_BONUS = 0.12;
/** Big-base storm contribution cap (0 → +7%). */
const STORM_ROLL_MAX_BONUS_BIG = 0.07;
const MOBILITY_EMA_TAU = 44;
const MOBILITY_HIGH_EMA = 16;
const MOBILITY_LOW_EMA = 4.5;
const QUERY_MULT_MIN = 0.68;
const QUERY_MULT_MAX = 1;
const MAX_DT_CLAMP = 500;

/** @type {Map<string, { lx: number, lz: number, lt: number, ema: number }>} */
const playerMobility = new Map();

/**
 * @typedef {Object} ClusterCampState
 * @property {number} ax
 * @property {number} az
 * @property {number} ay
 * @property {number} sedentaryTicks
 * @property {number} lastTick
 * @property {number} bigQualTicks — ticks inside large footprint (accumulates toward big-base).
 * @property {boolean} bigBaseActive — true once qualified until the centroid leaves the large footprint.
 */

/** @type {Map<string, ClusterCampState>} */
const clusterCamp = new Map();

/** Max visual ramp 0–1 across overworld clusters (spawn pressure display / consistency). */
let lastOverworldCampRamp01 = 0;
/** max_i ( ramp01_i × stormBonus_i ) for overworld storm hook */
let lastOverworldStormCampExtra = 0;

function clusterKey(dimensionId, clusterIndex) {
    return `${dimensionId ?? "?"}::${clusterIndex}`;
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {number} tick
 */
export function recordPlayerMovementSample(player, tick) {
    if (!player?.id || !player.isValid) return;
    const loc = player.location;
    if (typeof loc?.x !== "number" || typeof loc?.z !== "number") return;
    let st = playerMobility.get(player.id);
    if (!st) {
        st = { lx: loc.x, lz: loc.z, lt: tick, ema: 0 };
        playerMobility.set(player.id, st);
        return;
    }
    const dt = Math.min(MAX_DT_CLAMP, Math.max(0, tick - st.lt));
    if (st.lt > 0 && dt > 0) {
        const horiz = Math.hypot(loc.x - st.lx, loc.z - st.lz);
        const decay = Math.exp(-dt / MOBILITY_EMA_TAU);
        st.ema = st.ema * decay + horiz;
    }
    st.lx = loc.x;
    st.lz = loc.z;
    st.lt = tick;
}

/**
 * Horizontal movement EMA → block-query multiplier (high movement = lower mult).
 * @param {string} playerId
 * @returns {number}
 */
export function getPlayerMobilityQueryMult(playerId) {
    const st = playerMobility.get(playerId);
    if (!st) return QUERY_MULT_MAX;
    const ema = st.ema;
    if (ema >= MOBILITY_HIGH_EMA) return QUERY_MULT_MIN;
    if (ema <= MOBILITY_LOW_EMA) return QUERY_MULT_MAX;
    const t = (MOBILITY_HIGH_EMA - ema) / (MOBILITY_HIGH_EMA - MOBILITY_LOW_EMA);
    return QUERY_MULT_MIN + (QUERY_MULT_MAX - QUERY_MULT_MIN) * t;
}

/**
 * @param {string} dimensionId
 * @param {number} clusterIndex
 * @param {import("@minecraft/server").Player[]} members
 * @param {number} tick
 */
export function updateClusterCampFromMembers(dimensionId, clusterIndex, members, tick) {
    if (!members || members.length === 0) return;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (const p of members) {
        if (!p?.isValid || !p.location) continue;
        sx += p.location.x;
        sy += p.location.y;
        sz += p.location.z;
        n++;
    }
    if (n === 0) return;
    const cx = sx / n;
    const cy = sy / n;
    const cz = sz / n;
    const key = clusterKey(dimensionId, clusterIndex);
    let st = clusterCamp.get(key);
    const dt = st ? Math.min(MAX_DT_CLAMP, Math.max(0, tick - st.lastTick)) : 0;
    if (!st) {
        st = {
            ax: cx,
            az: cz,
            ay: cy,
            sedentaryTicks: 0,
            lastTick: tick,
            bigQualTicks: 0,
            bigBaseActive: false
        };
        clusterCamp.set(key, st);
        return;
    }
    if (typeof st.bigQualTicks !== "number") st.bigQualTicks = 0;
    if (typeof st.bigBaseActive !== "boolean") st.bigBaseActive = false;

    const dxz = Math.hypot(cx - st.ax, cz - st.az);
    const dy = Math.abs(cy - st.ay);
    const inSmall = dxz <= CAMP_RADIUS_XZ && dy <= CAMP_Y_TOLERANCE;
    const inLarge = dxz <= BASE_ZONE_RADIUS_XZ && dy <= BASE_ZONE_Y_TOLERANCE;

    const lerp = inSmall ? ANCHOR_LERP_SEDENTARY : ANCHOR_LERP_MOVING;
    st.ax += (cx - st.ax) * lerp;
    st.ay += (cy - st.ay) * lerp;
    st.az += (cz - st.az) * lerp;

    if (dt > 0) {
        if (!inLarge) {
            st.bigQualTicks = 0;
            st.bigBaseActive = false;
        } else {
            st.bigQualTicks = Math.min(BIG_BASE_QUALIFICATION_TICKS, st.bigQualTicks + dt);
            if (st.bigQualTicks >= BIG_BASE_QUALIFICATION_TICKS) st.bigBaseActive = true;
        }

        if (inSmall) {
            st.sedentaryTicks += dt;
        } else {
            st.sedentaryTicks = Math.max(0, st.sedentaryTicks - dt * 2);
        }
    }
    st.lastTick = tick;
    clusterCamp.set(key, st);
}

/**
 * @param {string} dimensionId
 * @param {number} clusterIndex
 * @returns {number} 0–1
 */
function getClusterCampFullTicks(st) {
    return st?.bigBaseActive ? CAMP_RAMP_FULL_TICKS_BIG : CAMP_RAMP_FULL_TICKS;
}

function getClusterSpawnBonusCap(st) {
    return st?.bigBaseActive ? SPAWN_PRESSURE_MAX_BONUS_BIG : SPAWN_PRESSURE_MAX_BONUS;
}

function getClusterStormBonusCap(st) {
    return st?.bigBaseActive ? STORM_ROLL_MAX_BONUS_BIG : STORM_ROLL_MAX_BONUS;
}

export function getClusterCampRamp01(dimensionId, clusterIndex) {
    const st = clusterCamp.get(clusterKey(dimensionId, clusterIndex));
    if (!st) return 0;
    const full = getClusterCampFullTicks(st);
    return Math.min(1, st.sedentaryTicks / full);
}

/**
 * Spawn chance multiplier for this cluster (1 – 1.35 small, 1 – 1.22 big-base).
 * @param {string} dimensionId
 * @param {number} clusterIndex
 */
export function getClusterSpawnPressureMult(dimensionId, clusterIndex) {
    const st = clusterCamp.get(clusterKey(dimensionId, clusterIndex));
    const ramp = getClusterCampRamp01(dimensionId, clusterIndex);
    const bonus = getClusterSpawnBonusCap(st);
    return 1 + ramp * bonus;
}

/**
 * Run movement samples + cluster camp updates; refresh storm cache on overworld.
 * @param {string} dimensionId
 * @param {import("@minecraft/server").Player[]} dimensionPlayers
 * @param {{ count: number, byPlayerId: Map<string, number> }} dimClusterMeta
 * @param {number} tick
 */
export function tickMobilityCampForDimension(dimensionId, dimensionPlayers, dimClusterMeta, tick) {
    if (!dimensionPlayers?.length) return;
    for (const p of dimensionPlayers) {
        try {
            recordPlayerMovementSample(p, tick);
        } catch { /* ignore */ }
    }
    const count = Math.max(1, dimClusterMeta?.count ?? 1);
    for (let ci = 0; ci < count; ci++) {
        const members = dimensionPlayers.filter((pl) => (dimClusterMeta?.byPlayerId?.get(pl.id) ?? 0) === ci);
        try {
            updateClusterCampFromMembers(dimensionId, ci, members, tick);
        } catch { /* ignore */ }
    }
    if (dimensionId === "minecraft:overworld") {
        let maxR = 0;
        let maxStormExtra = 0;
        for (let ci = 0; ci < count; ci++) {
            const st = clusterCamp.get(clusterKey(dimensionId, ci));
            const r = getClusterCampRamp01(dimensionId, ci);
            maxR = Math.max(maxR, r);
            const stormCap = getClusterStormBonusCap(st);
            maxStormExtra = Math.max(maxStormExtra, r * stormCap);
        }
        lastOverworldCampRamp01 = maxR;
        lastOverworldStormCampExtra = maxStormExtra;
    }
}

/**
 * Multiplier for primary/secondary storm start rolls (1 – 1.12).
 */
export function getStormStartChanceCampScale() {
    return 1 + lastOverworldStormCampExtra;
}

/** Cached overworld storm ramp (0–1) from last overworld spawn-camp tick. */
export function getLastOverworldStormCampRamp01() {
    return lastOverworldCampRamp01;
}

export function getCampTuningConstants() {
    return {
        campRadiusXZ: CAMP_RADIUS_XZ,
        campYTolerance: CAMP_Y_TOLERANCE,
        rampFullTicks: CAMP_RAMP_FULL_TICKS,
        spawnPressureMaxBonus: SPAWN_PRESSURE_MAX_BONUS,
        stormRollMaxBonus: STORM_ROLL_MAX_BONUS,
        mobilityEmaTau: MOBILITY_EMA_TAU,
        mobilityHighEma: MOBILITY_HIGH_EMA,
        mobilityLowEma: MOBILITY_LOW_EMA,
        queryMultMin: QUERY_MULT_MIN,
        queryMultMax: QUERY_MULT_MAX
    };
}

/**
 * @param {string} dimensionId
 * @param {number} clusterIndex
 * @param {number} centroidX
 * @param {number} centroidY
 * @param {number} centroidZ
 */
export function getClusterCampDebugMetrics(dimensionId, clusterIndex, centroidX, centroidY, centroidZ) {
    const key = clusterKey(dimensionId, clusterIndex);
    const st = clusterCamp.get(key);
    if (!st) {
        return { hasState: false, key };
    }
    const dxz = Math.hypot(centroidX - st.ax, centroidZ - st.az);
    const dy = Math.abs(centroidY - st.ay);
    const inSmall = dxz <= CAMP_RADIUS_XZ && dy <= CAMP_Y_TOLERANCE;
    const inLarge = dxz <= BASE_ZONE_RADIUS_XZ && dy <= BASE_ZONE_Y_TOLERANCE;
    const fullTicks = getClusterCampFullTicks(st);
    const ramp01 = Math.min(1, st.sedentaryTicks / fullTicks);
    const spawnMult = 1 + ramp01 * getClusterSpawnBonusCap(st);
    return {
        hasState: true,
        key,
        anchor: { x: st.ax, y: st.ay, z: st.az },
        sedentaryTicks: st.sedentaryTicks,
        lastTick: st.lastTick,
        bigQualTicks: st.bigQualTicks,
        bigBaseActive: st.bigBaseActive,
        dxz,
        dy,
        inSmall,
        inLarge,
        /** @deprecated use inSmall */
        sedentary: inSmall,
        ramp01,
        spawnMult,
        rampFullTicks: fullTicks
    };
}

export function devForceClusterAnchorPosition(dimensionId, clusterIndex, x, y, z, currentTick) {
    const key = clusterKey(dimensionId, clusterIndex);
    const prev = clusterCamp.get(key);
    const st = prev
        ? {
            ax: x,
            ay: y,
            az: z,
            sedentaryTicks: prev.sedentaryTicks,
            lastTick: currentTick,
            bigQualTicks: prev.bigQualTicks ?? 0,
            bigBaseActive: prev.bigBaseActive ?? false
        }
        : {
            ax: x,
            ay: y,
            az: z,
            sedentaryTicks: 0,
            lastTick: currentTick,
            bigQualTicks: 0,
            bigBaseActive: false
        };
    clusterCamp.set(key, st);
}

export function devAddClusterSedentaryTicks(dimensionId, clusterIndex, delta, currentTick, centroidX, centroidY, centroidZ) {
    const key = clusterKey(dimensionId, clusterIndex);
    let st = clusterCamp.get(key);
    if (!st) {
        st = {
            ax: centroidX,
            ay: centroidY,
            az: centroidZ,
            sedentaryTicks: 0,
            lastTick: currentTick,
            bigQualTicks: 0,
            bigBaseActive: false
        };
    }
    const capTicks = getClusterCampFullTicks(st) * 2;
    st.sedentaryTicks = Math.max(0, Math.min(capTicks, st.sedentaryTicks + delta));
    st.lastTick = currentTick;
    clusterCamp.set(key, st);
}

export function devSetClusterSedentaryTicks(dimensionId, clusterIndex, ticks, currentTick, centroidX, centroidY, centroidZ) {
    const key = clusterKey(dimensionId, clusterIndex);
    let st = clusterCamp.get(key);
    if (!st) {
        st = {
            ax: centroidX,
            ay: centroidY,
            az: centroidZ,
            sedentaryTicks: 0,
            lastTick: currentTick,
            bigQualTicks: 0,
            bigBaseActive: false
        };
    }
    const capTicks = getClusterCampFullTicks(st) * 2;
    st.sedentaryTicks = Math.max(0, Math.min(capTicks, ticks));
    st.lastTick = currentTick;
    clusterCamp.set(key, st);
}

export function devClearClusterCampState(dimensionId, clusterIndex) {
    clusterCamp.delete(clusterKey(dimensionId, clusterIndex));
}
