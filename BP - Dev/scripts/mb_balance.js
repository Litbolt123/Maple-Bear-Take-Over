/**
 * Central balance tuning: spawn type caps, mob→bear conversion pressure, infection conversion rates.
 * Prefer editing this file (and `SPAWN_CONFIGS` in mb_spawnConfigs.js) over scattering magic numbers.
 */

// --- Spawn: entity family keys (used with ENTITY_TYPE_CAPS and ENTITY_TO_TYPE_MAP) ---
export const TINY_TYPE = "tiny";
export const INFECTED_TYPE = "infected";
export const MINING_TYPE = "mining";
export const FLYING_TYPE = "flying";
export const TORPEDO_TYPE = "torpedo";

/** Nearby cap per family — all variants of that family count toward the same cap. */
export const ENTITY_TYPE_CAPS = {
    [TINY_TYPE]: 38,
    [INFECTED_TYPE]: 17,
    [MINING_TYPE]: 2,
    [FLYING_TYPE]: 20,
    [TORPEDO_TYPE]: 10
};

/** Natural spawn controller only: min ticks between successful buff bear spawns. Conversions ignore this. */
export const NATURAL_BUFF_SPAWN_COOLDOWN_TICKS = 20 * 120;

// --- Mob → Maple Bear conversion (mb_mainMobConversion.js) — pressure when many addon bears are nearby / in world ---
/** Below this nearby count (64m), mob→bear conversions use full pressure mult (1.0). */
export const MB_CONVERSION_NEARBY_PRESSURE_START = 24;
/** Above this nearby count, nearby pressure mult bottoms out at MB_CONVERSION_NEARBY_MULT_MIN. */
export const MB_CONVERSION_NEARBY_PRESSURE_END = 96;
export const MB_CONVERSION_NEARBY_MULT_MIN = 0.035;

/** World-wide addon bear total: start extra dampening (spread-out herds). */
export const MB_CONVERSION_WORLD_PRESSURE_START = 60;
export const MB_CONVERSION_WORLD_PRESSURE_END = 300;
export const MB_CONVERSION_WORLD_MULT_MIN = 0.025;

/** Absolute safety ceiling: block boss→buff conversions when this many buff bears already within 64m. */
export const MB_CONVERSION_BUFF_NEAR_CAP = 5;

/**
 * Max buff bears near a player / spawn site (loaded, within scan radius).
 * @param {number} playerCount players in dimension (or near the site)
 */
export function getMaxBuffBearsNearPlayerCount(playerCount) {
    const n = Math.max(1, playerCount);
    if (n <= 2) return 1;
    if (n <= 4) return 2;
    return 3;
}

/** Loaded mining bears allowed per player in a dimension (AI-heavy). */
export const MINING_BEARS_MAX_PER_PLAYER = 2;

/** Within spawn scan radius of one player — all mining variants share this cap. */
export function getMaxMiningBearsNearPlayerCount() {
    return MINING_BEARS_MAX_PER_PLAYER;
}

/**
 * Max mining bears in the whole dimension (loaded).
 * @param {number} playerCount players in the dimension
 */
export function getMaxMiningBearsDimensionWideCount(playerCount) {
    const n = Math.max(1, playerCount);
    return Math.min(12, n * MINING_BEARS_MAX_PER_PLAYER);
}

/**
 * Max buff bears in the whole dimension (loaded) — higher than near-player cap.
 * Both caps apply (`mb_buffCap.js`).
 * @param {number} playerCount players in the dimension
 */
export function getMaxBuffBearsDimensionWideCount(playerCount) {
    const n = Math.max(1, playerCount);
    if (n <= 2) return 3;
    if (n <= 4) return 5;
    return 6;
}

/** @deprecated Use getMaxBuffBearsNearPlayerCount */
export function getMaxBuffBearsForNearbyPlayerCount(nearbyPlayerCount) {
    return getMaxBuffBearsNearPlayerCount(nearbyPlayerCount);
}

// --- Global bear population cull (mb_bearPopulationCull.js): trim distant tiny + infected when world totals run high ---
/** Total MB addon bears (overworld+nether+end) at or above this → eligible for cull passes (only tiny/infected types are removed). */
export const MB_BEAR_CULL_WHEN_GLOBAL_ABOVE = 80;
/** Soft floor for global total; each pass removes up to MAX toward this (only distant tiny/infected). */
export const MB_BEAR_CULL_TARGET_GLOBAL = 68;
export const MB_BEAR_CULL_MAX_REMOVED_PER_PASS = 6;
/**
 * Only mobs with nearest player (same dimension) farther than this (blocks) are eligible — vanilla-like
 * (things nobody is "loaded next to" go first). Lower = more aggressive; tune with urgent block below.
 */
export const MB_BEAR_CULL_MIN_NEAREST_PLAYER_BLOCKS = 56;
/**
 * When count explodes, relax distance so culling can still work if everyone is bunched in one region.
 * Still culls farthest-from-player first.
 */
export const MB_BEAR_CULL_URGENT_WHEN_GLOBAL_ABOVE = 140;
export const MB_BEAR_CULL_URGENT_MIN_NEAREST_PLAYER_BLOCKS = 28;
export const MB_BEAR_CULL_INTERVAL_TICKS = 40;

// --- Progressive conversion rate by day (mob kills / storm) ---
export const INFECTION_RATE_STEPS = [
    { day: 2, rate: 0.20 },
    { day: 3, rate: 0.30 },
    { day: 4, rate: 0.40 },
    { day: 5, rate: 0.40 },
    { day: 6, rate: 0.50 },
    { day: 7, rate: 0.50 },
    { day: 8, rate: 0.60 },
    { day: 11, rate: 0.70 },
    { day: 15, rate: 0.80 },
    { day: 17, rate: 0.90 },
    { day: 20, rate: 1.00 }
];

/**
 * @param {number} day
 * @returns {number} 0 before day 2, else stepped infection probability for conversions
 */
export function getInfectionRate(day) {
    if (day < 2) return 0;
    let currentRate = 0;
    for (const step of INFECTION_RATE_STEPS) {
        if (day >= step.day) {
            currentRate = step.rate;
        } else {
            break;
        }
    }
    return currentRate;
}

// --- Infection evolution: localized storm reservoirs (Phase 2, mb_snowStorm getStormReservoirSpawnChanceMult + mb_spawnController) ---
/** Max extra natural spawn chance at storm eye; linear falloff to storm radius edge. Overworld only. */
export const STORM_RESERVOIR_SPAWN_CHANCE_MAX_BUMP = 0.08;
/** Inner fraction of storm radius where reservoir influence is full (1); outer ring fades to edge. */
export const STORM_RESERVOIR_INNER_RADIUS_FRACTION = 0.35;

// --- Infection director stages (Phase 3, mb_infectionDirector.js + mb_spawnController) ---
/** Day bands for named director tiers (inclusive upper bounds for scout/pressure/surge). */
export const INFECTION_DIRECTOR_DAY_SCOUT_MAX = 7;
export const INFECTION_DIRECTOR_DAY_PRESSURE_MAX = 14;
export const INFECTION_DIRECTOR_DAY_SURGE_MAX = 19;
/** When spawn-load snapshot load01 is at or above this, director stage bumps one tier (capped). */
export const INFECTION_DIRECTOR_LOAD_ESCALATE = 0.52;
/** Per-stage natural spawn chance multiplier (scout → stormfront). */
export const INFECTION_DIRECTOR_CHANCE_MULT = Object.freeze([1, 1.02, 1.045, 1.07]);
/** Extra tile spawn attempts per config (surge/stormfront emphasize pressure vs pure rate). */
export const INFECTION_DIRECTOR_ATTEMPT_BONUS = Object.freeze([0, 0, 1, 2]);
