/**
 * Snow Storm System - Dust storm style with snow layer placement
 * Storms place snow layers and cause infection exposure
 */

import { world, system, Player } from "@minecraft/server";
import { getAddonDifficultyState, getWorldPropertyChunked, setWorldPropertyChunked, getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";
import { getCurrentDay } from "./mb_dayTracker.js";
import { isScriptEnabled, SCRIPT_IDS, isBetaDustStormsEnabled } from "./mb_scriptToggles.js";
import { getPlayerSoundVolume, isDebugEnabled, getStormParticleDensity, markCodex } from "./mb_codex.js";
import { SNOW_REPLACEABLE_BLOCKS, SNOW_NEVER_REPLACE_BLOCKS, SNOW_TWO_BLOCK_PLANTS, STORM_PARTICLE_PASS_THROUGH, STORM_DESTRUCT_BLOCKS, STORM_DESTRUCT_GLASS, STORM_DESTRUCT_GLASS_EXCLUDE } from "./mb_blockLists.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const SNOW_LAYER_BLOCK = "mb:snow_layer";
const VANILLA_SNOW_LAYER = "minecraft:snow_layer";

// Storm state — supports multiple concurrent storms
let stormIdCounter = 0;
/** @type {{id:number,type:string,centerX:number,centerZ:number,centerY:number,endTick:number,startTick:number,intensity:number,driftAngle:number,driftAngleChangeTick:number,lastMoveTick:number}[]} */
let storms = [];
let cooldownEndTick = 0;

// Primary storm vars (synced from storms[0] for exports/legacy) — updated when storms change
let stormActive = false;
let stormType = null;
let stormEndTick = 0;
let stormStartTick = 0;
let stormIntensity = 1.0;
let stormCenterX = 0;
let stormCenterZ = 0;
let stormCenterY = 64;

function syncPrimaryStorm() {
    const s = storms.find(st => st.enabled !== false) ?? storms[0];
    if (s) {
        stormActive = true;
        stormType = s.type;
        stormEndTick = s.endTick;
        stormStartTick = s.startTick;
        stormIntensity = s.intensity;
        stormCenterX = s.centerX;
        stormCenterZ = s.centerZ;
        stormCenterY = s.centerY;
    } else {
        stormActive = false;
        stormType = null;
        stormEndTick = 0;
        stormStartTick = 0;
        stormIntensity = 1.0;
        stormCenterX = 0;
        stormCenterZ = 0;
        stormCenterY = 64;
    }
}

// Storm movement (predictable but occasionally erratic)
const STORM_MOVE_INTERVAL = 20; // Move every 1 second (more frequent)
const STORM_DRIFT_SPEED = 1.0; // Blocks per move (50% of previous)
const STORM_Y_VARIANCE = 12; // Storm Y can drift up/down by this many blocks
const STORM_Y_DRIFT_CHANCE = 0.3; // 30% chance to change Y each move
const STORM_DEFLECT_INSIDE = true; // Deflect when target is inside terrain
const STORM_DEFLECT_MOUNTAIN_CHANCE = 0.7; // 70% deflect when mountain ahead (prefer going around)
const STORM_MOUNTAIN_THRESHOLD = 8; // Blocks higher = "mountain" (prefer going around)

// Manual override settings (null = use day-based, otherwise override)
let manualOverride = {
    enabled: false,
    minorDurationMin: null,
    minorDurationMax: null,
    majorDurationMin: null,
    majorDurationMax: null,
    cooldownMin: null,
    cooldownMax: null,
    startChance: null,
    majorChance: null,
    intensity: null,           // 0.5–2.0 override (null = per-storm random)
    maxConcurrentStorms: null, // 1–3 (null = 1)
    secondaryStormChance: null // 0–0.5 when storms >= 1 (null = 0)
};

// Base storm parameters (before day scaling)
const BASE_MINOR_DURATION_MIN_TICKS = 60 * 20; // 1 minute
const BASE_MINOR_DURATION_MAX_TICKS = 240 * 20; // 4 minutes
const BASE_MAJOR_DURATION_MIN_TICKS = 180 * 20; // 3 minutes
const BASE_MAJOR_DURATION_MAX_TICKS = 600 * 20; // 10 minutes
const BASE_COOLDOWN_MIN_TICKS = 300 * 20; // 5 minutes (start)
const BASE_COOLDOWN_MAX_TICKS = 600 * 20; // 10 minutes (start)
const COOLDOWN_DAY_20_TICKS = 180 * 20; // 3 minutes (by day 20)
const BASE_START_CHANCE = 0.001; // 0.1% per check (very small at first)
const BASE_MAJOR_CHANCE_DAY_20 = 0.05; // 5% on day 20

// Day scaling factors
const DURATION_SCALE_PER_DAY = 0.02; // +2% per day to min duration
const COOLDOWN_DAY_CAP = 20; // By day 20, cooldown is 3 min; interpolates from start day
const CHANCE_SCALE_PER_DAY = 0.0001; // +0.01% per day to start chance

// Check intervals
const STORM_CHECK_INTERVAL = 100; // Check every 5 seconds (100 ticks)
const STORM_PERSIST_KEY = "mb_storm_state";
const STORM_MULTI_ENABLED_PROPERTY = "mb_storm_multi_enabled";

// Storm intersection — overlapping storms spur each other on (more violent)
const STORM_INTERSECTION_BOOST_PER_TICK = 0.002; // Per tick when overlapping
const STORM_INTERSECTION_DECAY_PER_TICK = 0.001; // Per tick when separate
const STORM_INTERSECTION_MAX_BOOST = 0.8; // Cap: baseIntensity + boost ≤ ~2.0 effective
const PLACEMENT_INTERVAL = 200; // Place snow every 10 seconds (minor)
const MAJOR_PLACEMENT_INTERVAL = 100; // Major storms place every 5 seconds
const PARTICLE_INTERVAL = 10; // Spawn particles every 0.5 seconds (10 ticks)

// Storm intensity (per-storm random, bell-curve like)
const STORM_INTENSITY_MIN = 0.85;
const STORM_INTENSITY_MAX = 1.15;

// Storm area (centered, not on player - radius at peak)
const BASE_STORM_RADIUS_MINOR = 35; // Blocks from center at peak
const BASE_STORM_RADIUS_MAJOR = 55; // Blocks from center at peak

// Storm spawn — distance from player, initially moving toward them
const STORM_SPAWN_MIN_DISTANCE = 25;
const STORM_SPAWN_MAX_DISTANCE = 52;

// Placement parameters (relative to storm center)
const MINOR_PLACEMENTS_PER_PASS = 2; // Minor storms: 2 placements per pass
const MAJOR_PLACEMENTS_PER_PASS = 12; // Major storms: many more placements
const PLACEMENT_SCALE_PER_DAY = 0.08; // +8% per day to placement count

// Particle settings (performance-optimized)
const PARTICLE_DENSITY_LOW = 2; // Particles per spawn
const PARTICLE_DENSITY_MEDIUM = 5;
const PARTICLE_DENSITY_HIGH = 10;
const PARTICLE_SPAWN_RADIUS = 8; // Random offset from storm center for particles

// Storm ambience sound (infected biome sound, louder)
const STORM_AMBIENCE_SOUNDS = ["biome.infected_ambient_1", "biome.infected_ambient_2", "biome.infected_ambient_3", "biome.infected_ambient_4"];
const STORM_SOUND_VOLUME = 1.8; // Much louder than normal biome (normal ~0.7-1.0)
const STORM_SOUND_INTERVAL = 80; // Play sound every 4 seconds
const STORM_NEARBY_RADIUS_MULT = 1.8; // Players within 1.8x radius hear distant ambience
const STORM_NEARBY_VOLUME = 0.4; // Quieter when outside storm

// Mob storm damage
const STORM_MOB_DAMAGE_INTERVAL = 200; // Damage mobs every 10 seconds
const STORM_MOB_DAMAGE_AMOUNT = 1; // 1 HP every 10 sec
const STORM_KILL_CANDIDATE_TICKS = 400; // Expire 20 sec after LAST storm damage (timestamp refreshed each damage)

// Storm exposure rates (uses OLD ground exposure rates - faster than current ground)
const STORM_EXPOSURE_SECONDS_PER_TICK = 2; // Old rate (before doubling)
const STORM_EXPOSURE_WARNING_SECONDS = 60; // Old rate
const STORM_EXPOSURE_MINOR_WARNING_SECONDS = 10; // Old rate
const STORM_EXPOSURE_INFECTION_SECONDS = 90; // Old rate
const STORM_EXPOSURE_DECAY_SECONDS_PER_TICK = 1; // Old rate

// Track players in storm (for exposure + blindness) - players within storm radius of center
const playersInStorm = new Set(); // playerId -> true

// Track mobs we damaged (for storm conversion on death)
const stormKillCandidates = new Map(); // entityId -> tick
// Per-player timestamps so each player gets sound/effects independently
const lastStormSoundTickByPlayer = new Map();
const lastStormNauseaTickByPlayer = new Map();
let lastParticleSpawned = 0;
let lastParticleSkipped = 0;
let totalSnowPlacedThisStorm = 0;
let mobsInStormCount = 0;

const STORM_DESTRUCT_INTERVAL = 20; // Every 1 second when at peak
const STORM_DESTRUCT_CHANCE_BASE = 0.58; // Base 58% for foliage (scales up at storm height)
const STORM_DESTRUCT_CHANCE_PEAK = 0.90; // 90% at storm height — most leaves/grass destroyed
const STORM_DESTRUCT_BAMBOO_CHANCE = 0.96; // Bamboo basically all destroyed
const STORM_DESTRUCT_GLASS_CHANCE_BASE = 0.22; // 22% base for glass
const STORM_DESTRUCT_GLASS_CHANCE_PEAK = 0.72; // 72% at storm height — most glass destroyed in strong storm
const BLINDNESS_DURATION_TICKS = 40; // 2 seconds, refreshed while in storm

// Storm nausea (10% chance every 10 seconds, 10 second duration)
const STORM_NAUSEA_INTERVAL = 200; // Check every 10 seconds
const STORM_NAUSEA_CHANCE = 0.1;
const STORM_NAUSEA_DURATION_TICKS = 200; // 10 seconds

// ============================================================================
// DIFFICULTY-BASED DAY GATES
// ============================================================================

function getStormStartDay() {
    const difficulty = getAddonDifficultyState();
    if (difficulty.value === -1) return 13; // Easy: Day 13
    if (difficulty.value === 1) return 4; // Hard: Day 4
    return 8; // Normal: Day 8
}

// ============================================================================
// DAY-BASED SCALING
// ============================================================================

function getScaledDuration(minBase, maxBase, currentDay, startDay) {
    if (currentDay < startDay) return { min: minBase, max: maxBase };
    const daysSinceStart = currentDay - startDay;
    const minScale = 1 + (daysSinceStart * DURATION_SCALE_PER_DAY);
    const scaledMin = Math.floor(minBase * minScale);
    const scaledMax = Math.floor(maxBase * (1 + (daysSinceStart * DURATION_SCALE_PER_DAY * 1.5))); // Max scales faster
    return { min: scaledMin, max: scaledMax };
}

function getScaledCooldown(minBase, maxBase, currentDay, startDay) {
    if (currentDay < startDay) return { min: minBase, max: maxBase };
    // Interpolate from 5–10 min (start) down to 3 min by day 20
    const daysToCap = COOLDOWN_DAY_CAP - startDay;
    const progress = daysToCap > 0
        ? Math.min(1, (currentDay - startDay) / daysToCap)
        : 1;
    const min = Math.floor(minBase + (COOLDOWN_DAY_20_TICKS - minBase) * progress);
    const max = Math.floor(maxBase + (COOLDOWN_DAY_20_TICKS - maxBase) * progress);
    return { min, max };
}

function getScaledStartChance(currentDay, startDay) {
    if (currentDay < startDay) return 0;
    const daysSinceStart = currentDay - startDay;
    return BASE_START_CHANCE + (daysSinceStart * CHANCE_SCALE_PER_DAY);
}

function getScaledMajorChance(currentDay, startDay) {
    // Major storms can occur before day 20, but with low chance that scales up
    // After day 20, only major storms occur (100% chance when storm starts)
    if (currentDay < startDay) return 0; // Too early for any storms
    
    // Before day 20: low chance that increases as day approaches 20
    if (currentDay < 20) {
        const daysUntil20 = 20 - currentDay;
        const daysFromStart = currentDay - startDay;
        const totalDaysRange = 20 - startDay;
        // Scale from 0% at start day to BASE_MAJOR_CHANCE_DAY_20 at day 20
        const progress = totalDaysRange > 0 ? daysFromStart / totalDaysRange : 0;
        return BASE_MAJOR_CHANCE_DAY_20 * progress; // Linear scaling from 0 to BASE_MAJOR_CHANCE_DAY_20
    }
    
    // After day 20: only major storms (return high chance, but checkStormStart will force major)
    const daysSinceMajor = currentDay - 20;
    return Math.min(0.5, BASE_MAJOR_CHANCE_DAY_20 + (daysSinceMajor * 0.01)); // +1% per day, cap at 50%
}

function getScaledPlacementCount(baseCount, currentDay, startDay) {
    if (currentDay < startDay) return baseCount;
    const daysSinceStart = currentDay - startDay;
    const scale = 1 + (daysSinceStart * PLACEMENT_SCALE_PER_DAY);
    return Math.floor(baseCount * scale);
}

// ============================================================================
// STORM PARAMETERS (with manual override support)
// ============================================================================

function getStormParams() {
    const currentDay = getCurrentDay();
    const startDay = getStormStartDay();
    
    if (manualOverride.enabled) {
        return {
            minorDuration: {
                min: manualOverride.minorDurationMin ?? BASE_MINOR_DURATION_MIN_TICKS,
                max: manualOverride.minorDurationMax ?? BASE_MINOR_DURATION_MAX_TICKS
            },
            majorDuration: {
                min: manualOverride.majorDurationMin ?? BASE_MAJOR_DURATION_MIN_TICKS,
                max: manualOverride.majorDurationMax ?? BASE_MAJOR_DURATION_MAX_TICKS
            },
            cooldown: {
                min: manualOverride.cooldownMin ?? BASE_COOLDOWN_MIN_TICKS,
                max: manualOverride.cooldownMax ?? BASE_COOLDOWN_MAX_TICKS
            },
            startChance: manualOverride.startChance ?? getScaledStartChance(currentDay, startDay),
            majorChance: manualOverride.majorChance ?? getScaledMajorChance(currentDay, startDay)
        };
    }
    
    const minorDuration = getScaledDuration(BASE_MINOR_DURATION_MIN_TICKS, BASE_MINOR_DURATION_MAX_TICKS, currentDay, startDay);
    const majorDuration = getScaledDuration(BASE_MAJOR_DURATION_MIN_TICKS, BASE_MAJOR_DURATION_MAX_TICKS, currentDay, startDay);
    const cooldown = getScaledCooldown(BASE_COOLDOWN_MIN_TICKS, BASE_COOLDOWN_MAX_TICKS, currentDay, startDay);
    
    return {
        minorDuration,
        majorDuration,
        cooldown,
        startChance: getScaledStartChance(currentDay, startDay),
        majorChance: getScaledMajorChance(currentDay, startDay)
    };
}

// ============================================================================
// SHELTER CHECK (Phase 1 + 2 — only around entities for performance)
// ============================================================================

const SHELTER_RAY_UP_MAX = 64;
const SHELTER_RAY_HORIZ_MAX = 48;
const SHELTER_RAY_DIRS = [
    { x: 0, y: 1, z: 0 },   // up
    { x: 0, y: -1, z: 0 },  // down
    { x: 1, y: 0, z: 0 },   // +x
    { x: -1, y: 0, z: 0 },  // -x
    { x: 0, y: 0, z: 1 },   // +z
    { x: 0, y: 0, z: -1 }   // -z
];

/**
 * Check if entity is sheltered from storm (cave, house, enclosed space).
 * Phase 1: upward raycast — no block above = exposed.
 * Phase 2: 6-direction raycast — any direction with no block within range = opening = exposed.
 * Only called for entities already in storm radius (performance).
 */
function isEntityShelteredFromStorm(entity) {
    if (!entity?.isValid) return false;
    const dim = entity.dimension;
    if (!dim) return false;
    const loc = entity.location;
    if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number" || typeof loc.z !== "number") return false;
    
    const headPos = { x: loc.x, y: Math.floor(loc.y) + 1.5, z: loc.z };
    const rayOpts = { includeLiquidBlocks: true, includePassableBlocks: false };
    
    try {
        for (let i = 0; i < SHELTER_RAY_DIRS.length; i++) {
            const dir = SHELTER_RAY_DIRS[i];
            const maxDist = dir.y !== 0 ? SHELTER_RAY_UP_MAX : SHELTER_RAY_HORIZ_MAX;
            const hit = dim.getBlockFromRay(headPos, dir, { ...rayOpts, maxDistance: maxDist });
            if (!hit) return false; // Ray escaped — opening in this direction — exposed
        }
        return true; // All 6 directions hit solid — enclosed — sheltered
    } catch {
        return false;
    }
}

// ============================================================================
// SURFACE & PLACEMENT
// ============================================================================

const WORLD_HEIGHT_OVERWORLD = 320; // Bedrock overworld max Y

/**
 * Find world surface at x,z - highest solid block (stays above ground, not underground)
 * @param {Dimension} dimension 
 * @param {number} x 
 * @param {number} z 
 * @returns {{x: number, y: number, z: number} | null}
 */
function findSurfaceBlock(dimension, x, z) {
    try {
        // Search downward from world height - finds actual terrain surface, not cave ceilings
        for (let y = WORLD_HEIGHT_OVERWORLD; y >= -64; y--) {
            const block = dimension.getBlock({ x, y, z });
            if (!block) continue;
            if (block.isAir || block.isLiquid) continue;
            const typeId = block.typeId;
            if (typeId === SNOW_LAYER_BLOCK || typeId === VANILLA_SNOW_LAYER) continue;
            return { x, y, z };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Find ground for particles - passes through leaves/foliage so storm rolls over landscape
 * @param {Dimension} dimension 
 * @param {number} x 
 * @param {number} z 
 * @returns {{x: number, y: number, z: number} | null}
 */
function findGroundForParticles(dimension, x, z) {
    try {
        for (let y = WORLD_HEIGHT_OVERWORLD; y >= -64; y--) {
            const block = dimension.getBlock({ x, y, z });
            if (!block) continue;
            if (block.isAir || block.isLiquid) continue;
            const typeId = block.typeId;
            if (typeId === SNOW_LAYER_BLOCK || typeId === VANILLA_SNOW_LAYER) continue;
            if (STORM_PARTICLE_PASS_THROUGH.has(typeId)) continue; // Pass through leaves, grass, flowers
            return { x, y, z };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Update intersection boost for all storms. Overlapping storms spur each other on (more violent).
 * When separated, boost decays back to 0. Uses base radius for overlap check (no circular dep).
 */
function updateStormIntersections(currentTick) {
    for (let i = 0; i < storms.length; i++) {
        const s = storms[i];
        if (!s.enabled) continue;
        const duration = s.endTick - s.startTick;
        const progress = Math.min(1, Math.max(0, (currentTick - s.startTick) / duration));
        const mult = getStormSizeMultiplier(progress);
        const baseR = s.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
        const radius = baseR * mult * s.baseIntensity;

        let overlapping = false;
        for (let j = 0; j < storms.length; j++) {
            if (i === j || !storms[j].enabled) continue;
            const o = storms[j];
            const oDuration = o.endTick - o.startTick;
            const oProgress = Math.min(1, Math.max(0, (currentTick - o.startTick) / oDuration));
            const oMult = getStormSizeMultiplier(oProgress);
            const oBaseR = o.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
            const oRadius = oBaseR * oMult * o.baseIntensity;
            const dx = s.centerX - o.centerX, dz = s.centerZ - o.centerZ;
            const dist = Math.hypot(dx, dz);
            if (dist < radius + oRadius) {
                overlapping = true;
                break;
            }
        }

        let boost = s.intersectionBoost ?? 0;
        if (overlapping) {
            boost = Math.min(STORM_INTERSECTION_MAX_BOOST, boost + STORM_INTERSECTION_BOOST_PER_TICK);
        } else {
            boost = Math.max(0, boost - STORM_INTERSECTION_DECAY_PER_TICK);
        }
        s.intersectionBoost = boost;
        s.intensity = Math.min(2.5, s.baseIntensity + boost);
    }
}

/**
 * Storm size multiplier over lifetime: start small (0.3), peak at middle (1.0), die down at end (0.3)
 * @param {number} progress 0-1 (elapsed / total duration)
 * @returns {number} Size multiplier
 */
function getStormSizeMultiplier(progress) {
    if (progress < 0.25) {
        return 0.3 + (progress / 0.25) * 0.7; // Ramp up: 0.3 -> 1.0
    }
    if (progress < 0.75) {
        return 1.0; // Peak
    }
    return 1.0 - ((progress - 0.75) / 0.25) * 0.7; // Ramp down: 1.0 -> 0.3
}

/**
 * Place snow layer at location (minor storm - no grass replacement)
 * @param {Dimension} dimension 
 * @param {number} x 
 * @param {number} y Top solid block Y
 * @param {number} z 
 * @returns {boolean} Success
 */
function tryPlaceSnowLayerMinor(dimension, x, y, z) {
    try {
        const placementY = y + 1;
        const blockBelow = dimension.getBlock({ x, y, z });
        const blockAbove = dimension.getBlock({ x, y: placementY, z });
        
        if (!blockBelow || !blockAbove) return false;
        
        const belowType = blockBelow.typeId;
        const aboveType = blockAbove.typeId;
        
        // Never place on snow
        if (belowType === SNOW_LAYER_BLOCK || belowType === VANILLA_SNOW_LAYER) return false;
        if (aboveType === SNOW_LAYER_BLOCK || aboveType === VANILLA_SNOW_LAYER) return false;
        
        // Never replace full ground blocks (dirt, grass_block, etc.)
        if (SNOW_NEVER_REPLACE_BLOCKS.has(belowType)) return false;
        
        // Minor storms: Don't replace grass/small blocks - only place on solid blocks
        if (SNOW_REPLACEABLE_BLOCKS.has(belowType)) return false; // Skip grass/foliage
        if (SNOW_REPLACEABLE_BLOCKS.has(aboveType)) return false; // Skip grass/foliage above
        
        // Only place if block below is solid and above is air
        if (!blockBelow.isAir && !blockBelow.isLiquid && blockAbove.isAir) {
            try {
                blockAbove.setType(SNOW_LAYER_BLOCK);
                return true;
            } catch {
                try {
                    blockAbove.setType(VANILLA_SNOW_LAYER);
                    return true;
                } catch {
                    return false;
                }
            }
        }
        
        return false;
    } catch {
        return false;
    }
}

/**
 * Place snow layer at location (major storm - no grass replacement, same as minor)
 * @param {Dimension} dimension 
 * @param {number} x 
 * @param {number} y Top solid block Y
 * @param {number} z 
 * @returns {boolean} Success
 */
function tryPlaceSnowLayerMajor(dimension, x, y, z) {
    try {
        const placementY = y + 1;
        const blockBelow = dimension.getBlock({ x, y, z });
        const blockAbove = dimension.getBlock({ x, y: placementY, z });
        
        if (!blockBelow || !blockAbove) return false;
        
        const belowType = blockBelow.typeId;
        const aboveType = blockAbove.typeId;
        
        // Never place on custom snow; vanilla snow is handled below (replacement)
        if (belowType === SNOW_LAYER_BLOCK) return false;
        if (aboveType === SNOW_LAYER_BLOCK || aboveType === VANILLA_SNOW_LAYER) return false;
        
        // Never replace full ground blocks (dirt, grass_block, etc.)
        if (SNOW_NEVER_REPLACE_BLOCKS.has(belowType)) return false;
        
        // Do not place snow on top of grass/foliage - skip like other scripts
        if (SNOW_REPLACEABLE_BLOCKS.has(belowType)) return false;
        if (SNOW_REPLACEABLE_BLOCKS.has(aboveType)) return false;
        
        // Replace vanilla snow layer with custom (single handling of VANILLA_SNOW_LAYER)
        if (belowType === VANILLA_SNOW_LAYER) {
            try {
                blockBelow.setType(SNOW_LAYER_BLOCK);
                return true;
            } catch {
                return false;
            }
        }
        
        // Place in air above solid block
        if (!blockBelow.isAir && !blockBelow.isLiquid && blockAbove.isAir) {
            try {
                blockAbove.setType(SNOW_LAYER_BLOCK);
                return true;
            } catch {
                try {
                    blockAbove.setType(VANILLA_SNOW_LAYER);
                    return true;
                } catch {
                    return false;
                }
            }
        }
        
        return false;
    } catch {
        return false;
    }
}

// ============================================================================
// PARTICLE SYSTEM (Performance-optimized)
// ============================================================================

function getParticleDensity(dimension) {
    const setting = getStormParticleDensity?.(dimension) ?? 0; // 0=Low, 1=Medium, 2=High
    if (setting >= 2) return PARTICLE_DENSITY_HIGH;
    if (setting >= 1) return PARTICLE_DENSITY_MEDIUM;
    return PARTICLE_DENSITY_LOW;
}

/**
 * Spawn a single particle (custom white dust only) - runCommand or spawnParticle fallback
 * @param {Dimension} dimension 
 * @param {{x: number, y: number, z: number}} loc 
 * @param {boolean} debugLog 
 */
function spawnOneParticle(dimension, loc, debugLog = false) {
    if (!dimension || !loc || typeof loc.x !== "number" || typeof loc.y !== "number" || typeof loc.z !== "number") {
        if (debugLog) console.warn(`[SNOW STORM] Particle skip: invalid dim/loc`);
        return false;
    }
    if (!Number.isFinite(loc.x) || !Number.isFinite(loc.y) || !Number.isFinite(loc.z)) {
        if (debugLog) console.warn(`[SNOW STORM] Particle skip: non-finite loc`);
        return false;
    }
    const x = Math.floor(loc.x), y = Math.floor(loc.y), z = Math.floor(loc.z);
    try {
        dimension.runCommand(`particle mb:white_dust_particle ${x} ${y} ${z}`);
        return true;
    } catch (err) {
        try {
            dimension.spawnParticle("mb:white_dust_particle", { x: loc.x, y: loc.y, z: loc.z });
            return true;
        } catch (e) {
            if (debugLog) console.warn(`[SNOW STORM] Particle FAILED at (${x},${y},${z}):`, String(err?.message ?? err));
            return false;
        }
    }
}

/**
 * Spawn particles only inside the storm area (center + radius). No spawns around players outside the storm.
 * Players see particles when within render distance (~32 blocks) of any spawn point.
 * @param {Dimension} dimension 
 * @param {{x: number, y: number, z: number}} center Storm center
 * @param {number} density 
 * @param {number} radius Current storm radius
 */
function spawnStormParticles(dimension, center, density, radius) {
    lastParticleSpawned = 0;
    lastParticleSkipped = 0;
    const dbgParts = isDebugEnabled("snow_storm", "particles") || isDebugEnabled("snow_storm", "all");

    try {
        const centerCount = Math.min(12, Math.max(2, Math.floor(density * (radius / 40))));
        let spawned = 0;
        let skipped = 0;
        let firstFailLogged = false;

        for (let i = 0; i < centerCount * 2; i++) {
            const r = radius * Math.sqrt(Math.random());
            const angle = Math.random() * Math.PI * 2;
            const px = center.x + Math.cos(angle) * r;
            const pz = center.z + Math.sin(angle) * r;
            let surface = findGroundForParticles(dimension, Math.floor(px), Math.floor(pz));
            if (!surface) surface = findSurfaceBlock(dimension, Math.floor(px), Math.floor(pz));
            const particleY = surface ? surface.y + 1 + Math.random() * 5 : center.y + Math.random() * 6;
            const particleLoc = { x: px, y: particleY, z: pz };
            const ok = spawnOneParticle(dimension, particleLoc, dbgParts && !firstFailLogged);
            if (ok) spawned++;
            else if (!surface) skipped++;
            else if (dbgParts) firstFailLogged = true;
        }

        lastParticleSpawned = spawned;
        lastParticleSkipped = skipped;
        if (dbgParts) {
            console.warn(`[SNOW STORM] Particle pass: density=${density}, radius=${radius.toFixed(0)}, spawned=${spawned}, skipped=${skipped}`);
        }
    } catch (e) {
        console.warn(`[SNOW STORM] Particle pass ERROR:`, String(e?.message ?? e), e?.stack);
    }
}

// ============================================================================
// STORM MANAGEMENT
// ============================================================================

/** Bell-curve-like random intensity (0.85–1.15) for storm variation. Override from manualOverride.intensity if set. */
function rollStormIntensity() {
    const override = manualOverride.intensity;
    if (override != null && override >= 0.5 && override <= 2) return override;
    const r = (Math.random() + Math.random() + Math.random()) / 3;
    return STORM_INTENSITY_MIN + r * (STORM_INTENSITY_MAX - STORM_INTENSITY_MIN);
}

function startStorm(type, initialCenter = null) {
    const params = getStormParams();
    const duration = type === "major" 
        ? params.majorDuration.min + Math.floor(Math.random() * (params.majorDuration.max - params.majorDuration.min))
        : params.minorDuration.min + Math.floor(Math.random() * (params.minorDuration.max - params.minorDuration.min));
    
    const now = system.currentTick;
    const overworld = world.getDimension("overworld");
    const players = overworld?.getPlayers?.() ?? [];
    let centerX = 0, centerZ = 0, driftAngle = Math.random() * Math.PI * 2;

    if (initialCenter && typeof initialCenter.x === "number" && typeof initialCenter.z === "number") {
        centerX = Math.floor(initialCenter.x);
        centerZ = Math.floor(initialCenter.z);
        if (initialCenter.targetX != null && initialCenter.targetZ != null) {
            driftAngle = Math.atan2(initialCenter.targetZ - centerZ, initialCenter.targetX - centerX);
        }
    } else if (players.length > 0) {
        const p = players[Math.floor(Math.random() * players.length)];
        const px = p.location.x;
        const pz = p.location.z;
        const dist = STORM_SPAWN_MIN_DISTANCE + Math.random() * (STORM_SPAWN_MAX_DISTANCE - STORM_SPAWN_MIN_DISTANCE);
        const angle = Math.random() * Math.PI * 2;
        centerX = px + Math.cos(angle) * dist;
        centerZ = pz + Math.sin(angle) * dist;
        driftAngle = Math.atan2(pz - centerZ, px - centerX);
    }

    const surfaceAtCenter = overworld ? findSurfaceBlock(overworld, Math.floor(centerX), Math.floor(centerZ)) : null;
    const centerY = surfaceAtCenter ? surfaceAtCenter.y + 2 : 64;

    const baseInt = rollStormIntensity();
    const storm = {
        id: ++stormIdCounter,
        type,
        centerX,
        centerZ,
        centerY,
        endTick: now + duration,
        startTick: now,
        baseIntensity: baseInt,
        intensity: baseInt,
        intersectionBoost: 0,
        enabled: true,
        driftAngle,
        driftAngleChangeTick: now,
        lastMoveTick: now
    };
    storms.push(storm);

    if (storms.length === 1) totalSnowPlacedThisStorm = 0;
    cooldownEndTick = 0;

    for (const p of players) {
        if (p?.id) {
            lastStormSoundTickByPlayer.set(p.id, now);
            lastStormNauseaTickByPlayer.set(p.id, now);
        }
    }

    syncPrimaryStorm();
    saveStormState();
    if (isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all")) {
        console.warn(`[SNOW STORM] ${type.toUpperCase()} storm started! (${storms.length} active) Duration: ${Math.floor(duration / 20)}s at (${centerX}, ${centerZ})`);
    }
}

function driftStormCenter(overworld, storm) {
    const ticksSinceDirChange = system.currentTick - storm.driftAngleChangeTick;
    const shouldChangeDir = Math.random() < 0.15 || (ticksSinceDirChange > 600 && Math.random() < 0.4);
    let erratic = false;
    if (shouldChangeDir) {
        storm.driftAngleChangeTick = system.currentTick;
        erratic = Math.random() < 0.25;
        storm.driftAngle += erratic ? (Math.random() - 0.5) * Math.PI * 1.5 : (Math.random() - 0.5) * 0.5;
    }

    const newX = storm.centerX + Math.cos(storm.driftAngle) * STORM_DRIFT_SPEED;
    const newZ = storm.centerZ + Math.sin(storm.driftAngle) * STORM_DRIFT_SPEED;
    const surfaceAtNew = findSurfaceBlock(overworld, Math.floor(newX), Math.floor(newZ));
    const surfaceAtCur = findSurfaceBlock(overworld, Math.floor(storm.centerX), Math.floor(storm.centerZ));
    const curSurfaceY = surfaceAtCur?.y ?? 64;
    const newSurfaceY = surfaceAtNew?.y ?? 64;

    let shouldDeflect = false;
    if (STORM_DEFLECT_INSIDE && surfaceAtNew && storm.centerY < newSurfaceY - 2) {
        shouldDeflect = true;
    } else if (newSurfaceY > curSurfaceY + STORM_MOUNTAIN_THRESHOLD && Math.random() < STORM_DEFLECT_MOUNTAIN_CHANCE) {
        shouldDeflect = true;
    }
    if (shouldDeflect) {
        storm.driftAngle += (Math.random() - 0.5) * Math.PI * 1.2;
    } else {
        storm.centerX = newX;
        storm.centerZ = newZ;
    }

    if (shouldDeflect) {
        storm.centerX += Math.cos(storm.driftAngle) * STORM_DRIFT_SPEED;
        storm.centerZ += Math.sin(storm.driftAngle) * STORM_DRIFT_SPEED;
    }

    const dbgMov = isDebugEnabled("snow_storm", "movement") || isDebugEnabled("snow_storm", "all");
    if (dbgMov && storms.length <= 1) {
        const detail = shouldChangeDir ? `, dirChange, erratic=${erratic}` : "";
        const deflectDetail = shouldDeflect ? ", deflected" : "";
        console.warn(`[SNOW STORM] Movement: center (${storm.centerX.toFixed(1)}, ${storm.centerY.toFixed(1)}, ${storm.centerZ.toFixed(1)}), angle=${(storm.driftAngle * 180 / Math.PI).toFixed(0)}°, particles=${lastParticleSpawned}, skipped=${lastParticleSkipped}${deflectDetail}${detail}`);
    }

    if (Math.random() < STORM_Y_DRIFT_CHANCE) {
        const surfaceAtCenter = findSurfaceBlock(overworld, Math.floor(storm.centerX), Math.floor(storm.centerZ));
        const baseY = surfaceAtCenter ? surfaceAtCenter.y : 64;
        const targetY = baseY + (Math.random() - 0.5) * 2 * STORM_Y_VARIANCE;
        storm.centerY = baseY + (storm.centerY - baseY) * 0.7 + (targetY - baseY) * 0.3;
    }
}

function saveStormState() {
    try {
        const currentTick = system.currentTick;
        const stormStates = storms.map(s => ({
            type: s.type,
            centerX: s.centerX,
            centerZ: s.centerZ,
            centerY: s.centerY,
            baseIntensity: s.baseIntensity ?? s.intensity,
            driftAngle: s.driftAngle,
            enabled: s.enabled !== false,
            ticksUntilEnd: Math.max(0, s.endTick - currentTick),
            duration: s.endTick - s.startTick
        }));
        const state = {
            storms: stormStates,
            ticksUntilCooldownEnd: storms.length === 0 && cooldownEndTick > currentTick ? Math.max(0, cooldownEndTick - currentTick) : 0
        };
        setWorldPropertyChunked(STORM_PERSIST_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn("[SNOW STORM] Failed to save storm state:", e);
    }
}

function loadStormState() {
    try {
        const raw = getWorldPropertyChunked(STORM_PERSIST_KEY);
        if (!raw || typeof raw !== "string") return;
        const state = JSON.parse(raw);
        if (!state || typeof state !== "object") return;

        const currentTick = system.currentTick;
        storms = [];

        if (Array.isArray(state.storms)) {
            for (const s of state.storms) {
                if (s.type !== "minor" && s.type !== "major") continue;
                const ticksUntilEnd = typeof s.ticksUntilEnd === "number" ? s.ticksUntilEnd : 0;
                if (ticksUntilEnd <= 0) continue;
                const centerX = typeof s.centerX === "number" ? s.centerX : 0;
                const centerZ = typeof s.centerZ === "number" ? s.centerZ : 0;
                if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) continue;
                const duration = typeof s.duration === "number" ? s.duration : ticksUntilEnd;
                const baseInt = typeof s.baseIntensity === "number" && s.baseIntensity >= 0.5 ? s.baseIntensity : (typeof s.intensity === "number" && s.intensity >= 0.5 ? s.intensity : 1.0);
                storms.push({
                    id: ++stormIdCounter,
                    type: s.type,
                    centerX,
                    centerZ,
                    centerY: typeof s.centerY === "number" ? s.centerY : 64,
                    endTick: currentTick + ticksUntilEnd,
                    startTick: currentTick - (duration - ticksUntilEnd),
                    baseIntensity: baseInt,
                    intensity: baseInt,
                    intersectionBoost: 0,
                    enabled: s.enabled !== false,
                    driftAngle: typeof s.driftAngle === "number" ? s.driftAngle : Math.random() * Math.PI * 2,
                    driftAngleChangeTick: currentTick,
                    lastMoveTick: currentTick
                });
            }
        } else {
            // Legacy single-storm format
            if (Boolean(state.active) && (state.type === "minor" || state.type === "major") && typeof state.ticksUntilEnd === "number" && state.ticksUntilEnd > 0) {
                const centerX = typeof state.centerX === "number" ? state.centerX : 0;
                const centerZ = typeof state.centerZ === "number" ? state.centerZ : 0;
                if (Number.isFinite(centerX) && Number.isFinite(centerZ)) {
                    const duration = typeof state.duration === "number" ? state.duration : state.ticksUntilEnd;
                    const baseInt = typeof state.intensity === "number" && state.intensity >= 0.5 ? state.intensity : 1.0;
                    storms.push({
                        id: ++stormIdCounter,
                        type: state.type,
                        centerX,
                        centerZ,
                        centerY: typeof state.centerY === "number" ? state.centerY : 64,
                        endTick: currentTick + state.ticksUntilEnd,
                        startTick: currentTick - (duration - state.ticksUntilEnd),
                        baseIntensity: baseInt,
                        intensity: baseInt,
                        intersectionBoost: 0,
                        enabled: true,
                        driftAngle: typeof state.driftAngle === "number" ? state.driftAngle : Math.random() * Math.PI * 2,
                        driftAngleChangeTick: currentTick,
                        lastMoveTick: currentTick
                    });
                }
            }
        }

        syncPrimaryStorm();

        if (storms.length === 0 && typeof state.ticksUntilCooldownEnd === "number" && state.ticksUntilCooldownEnd > 0) {
            cooldownEndTick = currentTick + state.ticksUntilCooldownEnd;
        }

        if (storms.length > 0 && (isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all"))) {
            console.warn(`[SNOW STORM] Restored ${storms.length} storm(s), primary at (${stormCenterX}, ${stormCenterZ})`);
        }
    } catch (e) {
        console.warn("[SNOW STORM] Failed to load storm state:", e);
    }
}

export function endStorm(skipCooldown = false) {
    if (storms.length === 0) return;

    try {
        const overworld = world.getDimension("overworld");
        const players = overworld?.getPlayers?.() ?? [];
        for (const pid of playersInStorm) {
            const p = players.find(pl => pl?.id === pid);
            if (p?.isValid) p.removeEffect("blindness");
        }
    } catch { }

    const params = getStormParams();
    const cooldown = skipCooldown ? 0 : params.cooldown.min + Math.floor(Math.random() * (params.cooldown.max - params.cooldown.min));

    storms = [];
    syncPrimaryStorm();
    cooldownEndTick = system.currentTick + cooldown;
    playersInStorm.clear();

    saveStormState();
    if (isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all")) {
        console.warn(`[SNOW STORM] All storms ended.${skipCooldown ? " (beta disabled)" : ""} Cooldown: ${Math.floor(cooldown / 20)}s`);
    }
}

function checkStormStart() {
    const ctrl = getStormControlParams();
    const multiEnabled = isMultiStormEnabled();
    const maxConcurrent = multiEnabled ? ctrl.maxConcurrentStorms : 1;
    const secondaryChance = multiEnabled ? ctrl.secondaryStormChance : 0;
    const activeCount = storms.filter(s => s.enabled !== false).length;

    if (activeCount >= maxConcurrent) return;

    const currentDay = getCurrentDay();
    const startDay = getStormStartDay();
    if (currentDay < startDay) return;

    const params = getStormParams();
    let rollChance;
    if (activeCount === 0) {
        if (system.currentTick < cooldownEndTick) return;
        rollChance = params.startChance;
    } else {
        rollChance = secondaryChance;
        if (rollChance <= 0) return;
    }

    if (Math.random() >= rollChance) return;

    if (currentDay >= 20) {
        startStorm("major");
    } else {
        const isMajor = Math.random() < params.majorChance;
        startStorm(isMajor ? "major" : "minor");
    }
}

// ============================================================================
// MAIN LOOPS
// ============================================================================

// Load persisted storm state on world load
system.runTimeout(() => {
    try {
        if (isScriptEnabled(SCRIPT_IDS.snowStorm) && isBetaDustStormsEnabled()) loadStormState();
    } catch (e) {
        console.warn("[SNOW STORM] Error loading state:", e);
    }
}, 1);

// Storm check loop (start/end storms)
system.runInterval(() => {
    try {
        if (!isScriptEnabled(SCRIPT_IDS.snowStorm) || !isBetaDustStormsEnabled()) return;
        
        const currentTick = system.currentTick;
        
        if (storms.length > 0 && !isBetaDustStormsEnabled()) {
            endStorm(true);
        }

        const beforeCount = storms.length;
        storms = storms.filter(s => s.endTick > currentTick);
        if (storms.length < beforeCount) {
            syncPrimaryStorm();
            if (storms.length === 0) {
                const params = getStormParams();
                const cooldown = params.cooldown.min + Math.floor(Math.random() * (params.cooldown.max - params.cooldown.min));
                cooldownEndTick = currentTick + cooldown;
                playersInStorm.clear();
                saveStormState();
                if (isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all")) {
                    console.warn(`[SNOW STORM] Storm(s) ended. Cooldown: ${Math.floor(cooldown / 20)}s`);
                }
            } else {
                saveStormState();
            }
        }

        checkStormStart();
        
        // Persist storm state periodically
        if (currentTick % STORM_CHECK_INTERVAL === 0) saveStormState();
        
        // Expire storm-damaged mobs after 20s without storm damage (runs even when storm inactive)
        for (const [id, tick] of [...stormKillCandidates.entries()]) {
            if (currentTick - tick > STORM_KILL_CANDIDATE_TICKS) stormKillCandidates.delete(id);
        }
    } catch (error) {
        console.warn(`[SNOW STORM] Error in storm check loop:`, error);
    }
}, STORM_CHECK_INTERVAL);

// Particle and placement loop (during active storms)
system.runInterval(() => {
    try {
        if (storms.length === 0 || !isScriptEnabled(SCRIPT_IDS.snowStorm) || !isBetaDustStormsEnabled()) return;

        const currentTick = system.currentTick;
        const overworld = world.getDimension("overworld");
        if (!overworld) return;

        const players = overworld.getPlayers();
        const currentDay = getCurrentDay();
        const startDay = getStormStartDay();

        updateStormIntersections(currentTick);

        // Precompute per-storm: duration, progress, radius, center (skip disabled)
        const stormData = [];
        for (const storm of storms) {
            if (!storm.enabled) continue;
            const duration = storm.endTick - storm.startTick;
            const elapsed = currentTick - storm.startTick;
            const progress = Math.min(1, Math.max(0, elapsed / duration));
            const sizeMultiplier = getStormSizeMultiplier(progress);
            const baseRadius = storm.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
            const currentRadius = baseRadius * sizeMultiplier * storm.intensity;
            if (currentTick - storm.lastMoveTick >= STORM_MOVE_INTERVAL) {
                storm.lastMoveTick = currentTick;
                driftStormCenter(overworld, storm);
            }
            const surfaceAtCenter = findSurfaceBlock(overworld, Math.floor(storm.centerX), Math.floor(storm.centerZ));
            const targetSurfaceY = surfaceAtCenter ? surfaceAtCenter.y + 2 : 64;
            storm.centerY = storm.centerY * 0.85 + targetSurfaceY * 0.15;
            stormData.push({ storm, duration, progress, currentRadius });
        }
        syncPrimaryStorm();

        // Track which players are in storm (any storm)
        const wasInStorm = new Set(playersInStorm);
        const nowInStorm = new Set();
        playersInStorm.clear();
        for (const player of players) {
            if (!player?.isValid) continue;
            const gameMode = player.getGameMode?.();
            if (gameMode === "creative" || gameMode === "spectator") continue;

            let inAnyStorm = false;
            let stormTypeForCodex = null;
            for (const { storm, currentRadius } of stormData) {
                const dx = player.location.x - storm.centerX;
                const dz = player.location.z - storm.centerZ;
                const distSq = dx * dx + dz * dz;
                if (distSq <= currentRadius * currentRadius) {
                    inAnyStorm = true;
                    stormTypeForCodex = storm.type;
                    break;
                }
            }
            if (inAnyStorm) {
                const sheltered = isEntityShelteredFromStorm(player);
                if (!sheltered) {
                    nowInStorm.add(player.id);
                    playersInStorm.add(player.id);
                    try {
                        markCodex(player, "biomes.stormSeen");
                        if (stormTypeForCodex === "minor") markCodex(player, "biomes.stormMinorSeen");
                        if (stormTypeForCodex === "major") markCodex(player, "biomes.stormMajorSeen");
                    } catch { }
                    try {
                        player.addEffect("blindness", BLINDNESS_DURATION_TICKS, { amplifier: 0, showParticles: false });
                    } catch { }
                    const lastSound = lastStormSoundTickByPlayer.get(player.id) ?? 0;
                    if (currentTick - lastSound >= STORM_SOUND_INTERVAL) {
                        try {
                            const vol = (getPlayerSoundVolume?.(player) ?? 1) * STORM_SOUND_VOLUME;
                            const soundIdx = Math.floor(Math.random() * STORM_AMBIENCE_SOUNDS.length);
                            player.playSound(STORM_AMBIENCE_SOUNDS[soundIdx], { volume: vol, pitch: 0.9 });
                            lastStormSoundTickByPlayer.set(player.id, currentTick);
                        } catch { }
                    }
                    const lastNausea = lastStormNauseaTickByPlayer.get(player.id) ?? 0;
                    if (currentTick - lastNausea >= STORM_NAUSEA_INTERVAL && Math.random() < STORM_NAUSEA_CHANCE) {
                        try {
                            player.addEffect("minecraft:nausea", STORM_NAUSEA_DURATION_TICKS, { amplifier: 0 });
                            lastStormNauseaTickByPlayer.set(player.id, currentTick);
                        } catch { }
                    }
                }
            } else {
                // Nearby but outside storm: play distant ambience (quieter)
                let nearAny = false;
                for (const { storm, currentRadius } of stormData) {
                    const dx = player.location.x - storm.centerX;
                    const dz = player.location.z - storm.centerZ;
                    const distSq = dx * dx + dz * dz;
                    const nearbyRadius = currentRadius * STORM_NEARBY_RADIUS_MULT;
                    if (distSq <= nearbyRadius * nearbyRadius) {
                        nearAny = true;
                        break;
                    }
                }
                const lastNearbySound = lastStormSoundTickByPlayer.get(player.id) ?? 0;
                if (nearAny && currentTick - lastNearbySound >= STORM_SOUND_INTERVAL) {
                    try {
                        const vol = (getPlayerSoundVolume?.(player) ?? 1) * STORM_NEARBY_VOLUME;
                        const soundIdx = Math.floor(Math.random() * STORM_AMBIENCE_SOUNDS.length);
                        player.playSound(STORM_AMBIENCE_SOUNDS[soundIdx], { volume: vol, pitch: 0.85 });
                        lastStormSoundTickByPlayer.set(player.id, currentTick);
                    } catch { }
                }
            }
        }
        // Remove blindness immediately when player leaves storm
        for (const pid of wasInStorm) {
            if (!nowInStorm.has(pid)) {
                try {
                    const p = players.find(pl => pl?.id === pid);
                    if (p?.isValid) p.removeEffect("blindness");
                } catch { }
            }
        }

        // Spawn particles for each storm
        for (const { storm, currentRadius } of stormData) {
            const stormCenter = { x: storm.centerX, y: storm.centerY, z: storm.centerZ };
            const density = Math.max(1, Math.floor(getParticleDensity(overworld) * storm.intensity));
            spawnStormParticles(overworld, stormCenter, density, currentRadius);
        }

        // Place snow for each storm (only near players = loaded chunks)
        const PLACEMENT_NEAR_PLAYER = 96;
        const dbgPlace = isDebugEnabled("snow_storm", "placement") || isDebugEnabled("snow_storm", "all");
        for (const { storm, currentRadius, progress } of stormData) {
            const placeInterval = storm.type === "major" ? MAJOR_PLACEMENT_INTERVAL : PLACEMENT_INTERVAL;
            if (currentTick % placeInterval !== 0 || currentRadius < 5) continue;
            const basePlacementCount = getScaledPlacementCount(
                storm.type === "major" ? MAJOR_PLACEMENTS_PER_PASS : MINOR_PLACEMENTS_PER_PASS,
                currentDay,
                startDay
            );
            const placementCount = Math.max(1, Math.floor(basePlacementCount * storm.intensity));
            const attemptMultiplier = storm.type === "major" ? 5 : 3;
            const placeFunc = storm.type === "major" ? tryPlaceSnowLayerMajor : tryPlaceSnowLayerMinor;
            let placed = 0;
            let attempts = 0;
            let noSurface = 0;
            let placeFailed = 0;

            for (let i = 0; i < placementCount * attemptMultiplier && placed < placementCount; i++) {
                attempts++;
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * currentRadius * 0.9;
                const x = Math.floor(storm.centerX + Math.cos(angle) * distance);
                const z = Math.floor(storm.centerZ + Math.sin(angle) * distance);

                const nearPlayer = players.some(p => p?.isValid && Math.hypot(p.location.x - x, p.location.z - z) <= PLACEMENT_NEAR_PLAYER);
                if (!nearPlayer) continue;

                const surface = findSurfaceBlock(overworld, x, z);
                if (!surface) {
                    noSurface++;
                    continue;
                }
                if (placeFunc(overworld, surface.x, surface.y, surface.z)) {
                    placed++;
                    totalSnowPlacedThisStorm++;
                    if (dbgPlace) console.warn(`[SNOW STORM] Placed snow at (${surface.x}, ${surface.y + 1}, ${surface.z})`);
                } else {
                    placeFailed++;
                }
            }
            if (dbgPlace || placed === 0) {
                console.warn(`[SNOW STORM] Placement: ${placed}/${placementCount} placed, ${attempts} attempts, noSurface=${noSurface}, failed=${placeFailed}`);
            }
        }
        
        // Mob storm damage — for each storm near players
        const MOB_DAMAGE_NEAR_PLAYER = 96;
        mobsInStormCount = 0;
        for (const { storm, currentRadius } of stormData) {
            const stormNearPlayer = players.some(p => p?.isValid && Math.hypot(p.location.x - storm.centerX, p.location.z - storm.centerZ) <= MOB_DAMAGE_NEAR_PLAYER);
            if (!stormNearPlayer || currentTick % STORM_MOB_DAMAGE_INTERVAL !== 0 || currentRadius < 5) continue;

            const excludeTypes = new Set([
                "minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:fireball",
                "minecraft:small_fireball", "minecraft:firework_rocket"
            ]);
            const mbPrefixes = ["mb:mb_day", "mb:infected", "mb:buff_mb", "mb:flying_mb", "mb:mining_mb", "mb:torpedo_mb", "mb:infected_pig", "mb:infected_cow"];
            let damaged = 0;
            try {
                const mobs = overworld.getEntities({
                    location: { x: storm.centerX, y: storm.centerY, z: storm.centerZ },
                    maxDistance: currentRadius
                });
                for (const mob of mobs) {
                    if (!mob?.isValid || mob instanceof Player) continue;
                    const tid = mob.typeId || "";
                    if (excludeTypes.has(tid)) continue;
                    if (mbPrefixes.some(pr => tid.startsWith(pr))) continue;
                    const dx = mob.location.x - storm.centerX;
                    const dz = mob.location.z - storm.centerZ;
                    if (dx * dx + dz * dz > currentRadius * currentRadius) continue;
                    mobsInStormCount++;
                    if (isEntityShelteredFromStorm(mob)) continue;
                    const mobDamage = Math.max(1, Math.round(STORM_MOB_DAMAGE_AMOUNT * storm.intensity));
                    try {
                        mob.applyDamage(mobDamage);
                        stormKillCandidates.set(mob.id, currentTick);
                        damaged++;
                    } catch { }
                }
                const dbgMob = isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all");
                if (dbgMob && damaged > 0) console.warn(`[SNOW STORM] Mob damage: ${damaged} mobs damaged`);
            } catch { }
        }
        
        // Major storm block destruction — for each major storm
        const MOB_DAMAGE_NEAR_PLAYER_DESTRUCT = 96;
        for (const { storm, currentRadius, progress } of stormData) {
            if (storm.type !== "major") continue;
            const stormNearPlayer = players.some(p => p?.isValid && Math.hypot(p.location.x - storm.centerX, p.location.z - storm.centerZ) <= MOB_DAMAGE_NEAR_PLAYER_DESTRUCT);
            if (!stormNearPlayer || progress < 0.2 || progress > 0.8 || currentTick % STORM_DESTRUCT_INTERVAL !== 0) continue;

            const distFromPeak = Math.abs(progress - 0.5);
            const peakScale = Math.max(0, 1 - distFromPeak / 0.3);
            const foliageChance = Math.min(0.96, STORM_DESTRUCT_CHANCE_BASE + (STORM_DESTRUCT_CHANCE_PEAK - STORM_DESTRUCT_CHANCE_BASE) * peakScale);
            const glassChance = Math.min(0.85, STORM_DESTRUCT_GLASS_CHANCE_BASE + (STORM_DESTRUCT_GLASS_CHANCE_PEAK - STORM_DESTRUCT_GLASS_CHANCE_BASE) * peakScale);

            const DESTRUCT_SAMPLES = 50;
            const DESTRUCT_HEIGHT = 20;
            const DESTRUCT_MAX_PER_PASS = 140;
            let destroyedThisPass = 0;
            for (let i = 0; i < DESTRUCT_SAMPLES && destroyedThisPass < DESTRUCT_MAX_PER_PASS; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = currentRadius * 0.92 * Math.sqrt(Math.random());
                const x = Math.floor(storm.centerX + Math.cos(angle) * r);
                const z = Math.floor(storm.centerZ + Math.sin(angle) * r);
                const surface = findSurfaceBlock(overworld, x, z);
                if (!surface) continue;
                let glassBroken = false;
                for (let dy = 0; dy <= DESTRUCT_HEIGHT && !glassBroken && destroyedThisPass < DESTRUCT_MAX_PER_PASS; dy++) {
                    const by = surface.y + dy;
                    try {
                        const block = overworld.getBlock({ x, y: by, z });
                        if (!block?.typeId) continue;
                        const tid = block.typeId;
                        const isBamboo = tid.includes("bamboo");
                        const destructChance = isBamboo ? STORM_DESTRUCT_BAMBOO_CHANCE : foliageChance;
                        if (STORM_DESTRUCT_BLOCKS.has(tid) && Math.random() < destructChance) {
                            block.setType("minecraft:air");
                            destroyedThisPass++;
                        } else if (STORM_DESTRUCT_GLASS.has(tid) && !STORM_DESTRUCT_GLASS_EXCLUDE.has(tid) &&
                            !tid.includes("tinted") && !tid.includes("hardened") && !tid.includes("hard_glass") &&
                            Math.random() < glassChance) {
                            block.setType("minecraft:air");
                            glassBroken = true;
                            destroyedThisPass++;
                        }
                    } catch { }
                }
            }
        }
        
        // Periodic comprehensive status (every ~5 sec) when general or all
        const dbgGen = isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all");
        if (dbgGen && currentTick % 100 === 50) {
            const parts = storms.map((s, i) => {
                const ticksLeft = Math.max(0, s.endTick - currentTick);
                const progress = Math.min(1, Math.max(0, (currentTick - s.startTick) / (s.endTick - s.startTick)));
                const mult = getStormSizeMultiplier(progress);
                const r = (s.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR) * mult * s.intensity;
                return `#${i + 1} ${s.type} (${Math.floor(s.centerX)},${Math.floor(s.centerZ)}) r${Math.floor(r)} ${Math.floor(ticksLeft / 20)}s`;
            });
            console.warn(`[SNOW STORM] ${storms.length} storm(s): ${parts.join(" | ")} | players: ${playersInStorm.size} | mobs: ${mobsInStormCount} | snow: ${totalSnowPlacedThisStorm}`);
        }
    } catch (error) {
        console.warn(`[SNOW STORM] Error in particle/placement loop:`, error);
    }
}, 10); // Run every 0.5 seconds

// ============================================================================
// EXPORTS (for integration with main.js ground exposure)
// ============================================================================

export function isPlayerInStorm(playerId) {
    return playersInStorm.has(playerId);
}

/** Returns true if entity was recently damaged by storm (for conversion on death). Consumes the flag. */
export function wasKilledByStorm(entityId) {
    if (!entityId) return false;
    const had = stormKillCandidates.has(entityId);
    stormKillCandidates.delete(entityId);
    return had;
}

export function getStormExposureRates() {
    return {
        secondsPerTick: STORM_EXPOSURE_SECONDS_PER_TICK,
        warningSeconds: STORM_EXPOSURE_WARNING_SECONDS,
        minorWarningSeconds: STORM_EXPOSURE_MINOR_WARNING_SECONDS,
        infectionSeconds: STORM_EXPOSURE_INFECTION_SECONDS,
        decaySecondsPerTick: STORM_EXPOSURE_DECAY_SECONDS_PER_TICK
    };
}

/** Returns whether (x,z) is inside any storm radius. */
export function isPositionInStormRadius(x, z) {
    if (storms.length === 0) return false;
    const currentTick = system.currentTick;
    for (const storm of storms) {
        const duration = storm.endTick - storm.startTick;
        const progress = Math.min(1, Math.max(0, (currentTick - storm.startTick) / duration));
        const mult = getStormSizeMultiplier(progress);
        const baseRadius = storm.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
        const radius = baseRadius * mult * storm.intensity;
        const dx = x - storm.centerX, dz = z - storm.centerZ;
        if ((dx * dx + dz * dz) <= radius * radius) return true;
    }
    return false;
}

/** Returns storm spawn info for spawn controller (primary storm for backward compat). */
export function getStormSpawnInfo() {
    if (storms.length === 0) return null;
    syncPrimaryStorm();
    const s = storms[0];
    const currentTick = system.currentTick;
    const duration = s.endTick - s.startTick;
    const progress = Math.min(1, Math.max(0, (currentTick - s.startTick) / duration));
    const mult = getStormSizeMultiplier(progress);
    const baseRadius = s.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
    return { active: true, centerX: s.centerX, centerZ: s.centerZ, radius: baseRadius * mult * s.intensity };
}

/** Returns storm spawn infos for all active storms. */
function getAllStormSpawnInfos() {
    if (storms.length === 0) return [];
    const currentTick = system.currentTick;
    return storms.filter(s => s.enabled !== false).map(s => {
        const duration = s.endTick - s.startTick;
        const progress = Math.min(1, Math.max(0, (currentTick - s.startTick) / duration));
        const mult = getStormSizeMultiplier(progress);
        const baseRadius = s.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
        return { centerX: s.centerX, centerZ: s.centerZ, radius: baseRadius * mult * s.intensity };
    });
}

/** Returns spawn tiles inside storm radius (surface blocks with air above) for Maple Bear spawning. Merges tiles from all storms. */
export function getStormSpawnTiles(dimension, playerPos, minDistSq, maxDistSq, limit = 15) {
    const infos = getAllStormSpawnInfos();
    if (infos.length === 0 || !dimension) return [];
    const tiles = [];
    const seen = new Set();
    const perStorm = Math.max(1, Math.ceil((limit * 2) / infos.length));
    for (const info of infos) {
        for (let i = 0; i < perStorm && tiles.length < limit; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = info.radius * 0.9 * Math.sqrt(Math.random());
            const x = Math.floor(info.centerX + Math.cos(angle) * r);
            const z = Math.floor(info.centerZ + Math.sin(angle) * r);
            const key = `${x},${z}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const dx = x + 0.5 - playerPos.x, dz = z + 0.5 - playerPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minDistSq || distSq > maxDistSq) continue;
            const surface = findSurfaceBlock(dimension, x, z);
            if (!surface) continue;
            const above = dimension.getBlock({ x: surface.x, y: surface.y + 1, z: surface.z });
            if (!above?.isAir) continue;
            tiles.push({ x: surface.x, y: surface.y, z: surface.z });
            if (tiles.length >= limit) return tiles;
        }
    }
    return tiles;
}

// ============================================================================
// DEVELOPER TOOLS (for testing)
// ============================================================================

export function summonStorm(type, targetPlayer = null, distance = 0) {
    // type: "minor" | "major"
    // targetPlayer: Player object or null (random)
    // distance: blocks away from player (0 = at player)
    
    if (!isBetaDustStormsEnabled()) {
        console.warn("[SNOW STORM] Cannot summon - Dust storms (beta) disabled in Settings > Beta Features");
        return false;
    }
    
    const overworld = world.getDimension("overworld");
    if (!overworld) {
        console.warn("[SNOW STORM] Cannot summon storm - overworld not found");
        return false;
    }
    
    const players = overworld.getPlayers();
    if (players.length === 0) {
        console.warn("[SNOW STORM] Cannot summon storm - no players");
        return false;
    }
    
    let target = targetPlayer;
    if (!target || !target.isValid) {
        target = players[Math.floor(Math.random() * players.length)];
    }
    
    if (!target || !target.isValid) {
        console.warn("[SNOW STORM] Cannot summon storm - invalid target");
        return false;
    }
    
    const loc = target.location;
    const targetX = loc.x;
    const targetZ = loc.z;
    const dist = distance > 0 ? distance : (STORM_SPAWN_MIN_DISTANCE + Math.random() * (STORM_SPAWN_MAX_DISTANCE - STORM_SPAWN_MIN_DISTANCE));
    const angle = Math.random() * Math.PI * 2;
    const centerX = targetX + Math.cos(angle) * dist;
    const centerZ = targetZ + Math.sin(angle) * dist;

    startStorm(type, { x: centerX, z: centerZ, targetX, targetZ });
    
    console.warn(`[SNOW STORM] Summoned ${type} storm at (${Math.floor(centerX)}, ${Math.floor(centerZ)}) near ${target.name}`);
    return true;
}

export function setStormOverride(settings) {
    manualOverride = { ...manualOverride, ...settings };
    manualOverride.enabled = true;
    console.warn("[SNOW STORM] Manual override enabled:", manualOverride);
}

export function resetStormOverride() {
    manualOverride = {
        enabled: false,
        minorDurationMin: null,
        minorDurationMax: null,
        majorDurationMin: null,
        majorDurationMax: null,
        cooldownMin: null,
        cooldownMax: null,
        startChance: null,
        majorChance: null,
        intensity: null,
        maxConcurrentStorms: null,
        secondaryStormChance: null
    };
    console.warn("[SNOW STORM] Manual override reset - using day-based settings");
}

/** Get storm control params for dev tools (intensity, multi-storm) */
export function getStormControlParams() {
    const max = manualOverride.maxConcurrentStorms;
    const secondary = manualOverride.secondaryStormChance;
    return {
        intensity: manualOverride.intensity,
        maxConcurrentStorms: max != null ? Math.max(1, Math.min(3, Math.floor(max))) : 1,
        secondaryStormChance: secondary != null ? Math.max(0, Math.min(0.5, secondary)) : 0
    };
}

/** Whether multiple storms can spawn (dev toggle). Default true. */
export function isMultiStormEnabled() {
    const v = getWorldProperty(STORM_MULTI_ENABLED_PROPERTY);
    if (v === false || v === "false" || v === "0") return false;
    return true;
}

/** Set multi-storm enabled (dev). */
export function setMultiStormEnabled(enabled) {
    setWorldProperty(STORM_MULTI_ENABLED_PROPERTY, enabled ? undefined : false);
}

/** Get all storms for dev menu (id, type, enabled, center, intensity, boost, ticksLeft). */
export function getStorms() {
    const currentTick = system.currentTick;
    return storms.map(s => ({
        id: s.id,
        type: s.type,
        enabled: s.enabled !== false,
        centerX: s.centerX,
        centerZ: s.centerZ,
        baseIntensity: s.baseIntensity ?? s.intensity,
        intensity: s.intensity,
        intersectionBoost: s.intersectionBoost ?? 0,
        ticksLeft: Math.max(0, s.endTick - currentTick)
    }));
}

/** End a single storm by id. */
export function endStormById(id) {
    const idx = storms.findIndex(s => s.id === id);
    if (idx < 0) return false;
    storms.splice(idx, 1);
    syncPrimaryStorm();
    saveStormState();
    if (storms.length === 0) {
        const params = getStormParams();
        cooldownEndTick = system.currentTick + params.cooldown.min + Math.floor(Math.random() * (params.cooldown.max - params.cooldown.min));
        try {
            const overworld = world.getDimension("overworld");
            const players = overworld?.getPlayers?.() ?? [];
            for (const pid of playersInStorm) {
                const p = players.find(pl => pl?.id === pid);
                if (p?.isValid) p.removeEffect("blindness");
            }
        } catch { }
        playersInStorm.clear();
    }
    return true;
}

/** Enable or disable a storm by id. Disabled storms don't drift, place snow, or affect players. */
export function setStormEnabled(id, enabled) {
    const s = storms.find(st => st.id === id);
    if (!s) return false;
    s.enabled = !!enabled;
    syncPrimaryStorm();
    saveStormState();
    return true;
}

export function getStormState() {
    syncPrimaryStorm();
    return {
        active: stormActive,
        type: stormType,
        stormCount: storms.length,
        intensity: stormIntensity,
        endTick: stormEndTick,
        cooldownEndTick: cooldownEndTick,
        startTick: stormStartTick,
        playersInStorm: playersInStorm.size,
        override: manualOverride.enabled
    };
}

/** Returns detailed storm info for debug menu */
export function getStormDebugInfo() {
    const currentDay = getCurrentDay();
    const startDay = getStormStartDay();
    const params = getStormParams();
    const state = getStormState();
    const currentTick = system.currentTick;

    const activeStr = state.active ? `§aYes §7(Type: §f${state.type}§7)` : "§cNo";
    const endsIn = state.active && state.endTick > currentTick
        ? `${Math.floor((state.endTick - currentTick) / 20)}s`
        : "N/A";
    const cooldown = state.cooldownEndTick > currentTick
        ? `${Math.floor((state.cooldownEndTick - currentTick) / 20)}s`
        : "§aReady";
    
    let sizeProgress = 0;
    let currentRadius = 0;
    if (state.active && state.endTick > state.startTick) {
        const progress = (currentTick - state.startTick) / (state.endTick - state.startTick);
        sizeProgress = Math.round(progress * 100);
        const mult = getStormSizeMultiplier(progress);
        currentRadius = Math.floor((state.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR) * mult * stormIntensity);
    }

    return {
        stormCenter: `(${Math.floor(stormCenterX)}, ${Math.floor(stormCenterZ)})`,
        currentRadius,
        sizeProgress,
        lastParticlesSpawned: lastParticleSpawned,
        lastParticlesSkipped: lastParticleSkipped,
        active: activeStr,
        type: state.type,
        endsIn,
        cooldown,
        playersInStorm: state.playersInStorm,
        override: state.override ? "§cEnabled" : "§aDisabled",
        currentDay,
        startDay,
        minorDurationMin: Math.floor((params.minorDuration?.min ?? 0) / 20),
        minorDurationMax: Math.floor((params.minorDuration?.max ?? 0) / 20),
        majorDurationMin: Math.floor((params.majorDuration?.min ?? 0) / 20),
        majorDurationMax: Math.floor((params.majorDuration?.max ?? 0) / 20),
        cooldownMin: Math.floor((params.cooldown?.min ?? 0) / 20),
        cooldownMax: Math.floor((params.cooldown?.max ?? 0) / 20),
        startChance: (params.startChance * 100).toFixed(2) + "%",
        majorChance: (params.majorChance * 100).toFixed(2) + "%"
    };
}
