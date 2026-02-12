/**
 * Snow Storm System - Dust storm style with snow layer placement
 * Storms place snow layers and cause infection exposure
 */

import { world, system, Player } from "@minecraft/server";
import { getAddonDifficultyState, getWorldPropertyChunked, setWorldPropertyChunked } from "./mb_dynamicPropertyHandler.js";
import { getCurrentDay } from "./mb_dayTracker.js";
import { isScriptEnabled, SCRIPT_IDS, isBetaDustStormsEnabled } from "./mb_scriptToggles.js";
import { getPlayerSoundVolume, isDebugEnabled, getStormParticleDensity, markCodex } from "./mb_codex.js";
import { SNOW_REPLACEABLE_BLOCKS, SNOW_NEVER_REPLACE_BLOCKS, SNOW_TWO_BLOCK_PLANTS, STORM_PARTICLE_PASS_THROUGH, STORM_DESTRUCT_BLOCKS, STORM_DESTRUCT_GLASS, STORM_DESTRUCT_GLASS_EXCLUDE } from "./mb_blockLists.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const SNOW_LAYER_BLOCK = "mb:snow_layer";
const VANILLA_SNOW_LAYER = "minecraft:snow_layer";

// Storm state
let stormActive = false;
let stormType = null; // "minor" or "major"
let stormEndTick = 0;
let cooldownEndTick = 0;
let stormStartTick = 0;

// Storm center (moves randomly - does NOT follow players)
let stormCenterX = 0;
let stormCenterZ = 0;
let stormCenterY = 64; // Approximate surface for particles

// Storm movement (predictable but occasionally erratic)
const STORM_MOVE_INTERVAL = 20; // Move every 1 second (more frequent)
const STORM_DRIFT_SPEED = 1.0; // Blocks per move (50% of previous)
const STORM_Y_VARIANCE = 12; // Storm Y can drift up/down by this many blocks
const STORM_Y_DRIFT_CHANCE = 0.3; // 30% chance to change Y each move
let lastStormMoveTick = 0;
let stormDriftAngle = Math.random() * Math.PI * 2; // Persistent direction (predictable)
let stormDriftAngleChangeTick = 0; // When we last changed direction

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
    majorChance: null
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
const PLACEMENT_INTERVAL = 200; // Place snow every 10 seconds (200 ticks)
const PARTICLE_INTERVAL = 10; // Spawn particles every 0.5 seconds (10 ticks)

// Storm area (centered, not on player - radius at peak)
const BASE_STORM_RADIUS_MINOR = 35; // Blocks from center at peak
const BASE_STORM_RADIUS_MAJOR = 55; // Blocks from center at peak

// Placement parameters (relative to storm center)
const MINOR_PLACEMENTS_PER_PASS = 1; // Minor storms: 1 placement per pass
const MAJOR_PLACEMENTS_PER_PASS = 3; // Major storms: 3 placements per pass
const PLACEMENT_SCALE_PER_DAY = 0.05; // +5% per day to placement count

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
let lastStormSoundTick = 0;
let lastStormNauseaTick = 0;
let lastParticleSpawned = 0;
let lastParticleSkipped = 0;
let totalSnowPlacedThisStorm = 0;
let mobsInStormCount = 0;

const STORM_DESTRUCT_INTERVAL = 80; // Every 4 seconds when at peak
const STORM_DESTRUCT_CHANCE = 0.08; // 8% for leaves/grass/flowers
const STORM_DESTRUCT_GLASS_CHANCE = 0.02; // 2% for glass
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
        
        // Never place on snow
        if (belowType === SNOW_LAYER_BLOCK || belowType === VANILLA_SNOW_LAYER) return false;
        if (aboveType === SNOW_LAYER_BLOCK || aboveType === VANILLA_SNOW_LAYER) return false;
        
        // Never replace full ground blocks (dirt, grass_block, etc.)
        if (SNOW_NEVER_REPLACE_BLOCKS.has(belowType)) return false;
        
        // Do not place snow on top of grass/foliage - skip like other scripts
        if (SNOW_REPLACEABLE_BLOCKS.has(belowType)) return false;
        if (SNOW_REPLACEABLE_BLOCKS.has(aboveType)) return false;
        
        // Replace vanilla snow layer with custom
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

function startStorm(type, initialCenter = null) {
    const params = getStormParams();
    const duration = type === "major" 
        ? params.majorDuration.min + Math.floor(Math.random() * (params.majorDuration.max - params.majorDuration.min))
        : params.minorDuration.min + Math.floor(Math.random() * (params.minorDuration.max - params.minorDuration.min));
    
    stormActive = true;
    stormType = type;
    stormStartTick = system.currentTick;
    stormEndTick = system.currentTick + duration;
    totalSnowPlacedThisStorm = 0;
    cooldownEndTick = 0;
    lastStormMoveTick = system.currentTick;
    lastStormSoundTick = system.currentTick;
    
    // Set storm center - from initialCenter or random player in overworld
    if (initialCenter && typeof initialCenter.x === "number" && typeof initialCenter.z === "number") {
        stormCenterX = Math.floor(initialCenter.x);
        stormCenterZ = Math.floor(initialCenter.z);
    } else {
        const overworld = world.getDimension("overworld");
        const players = overworld?.getPlayers?.() ?? [];
        if (players.length > 0) {
            const p = players[Math.floor(Math.random() * players.length)];
            stormCenterX = Math.floor(p.location.x);
            stormCenterZ = Math.floor(p.location.z);
        } else {
            stormCenterX = 0;
            stormCenterZ = 0;
        }
    }
    
    saveStormState();
    if (isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all")) {
        console.warn(`[SNOW STORM] ${type.toUpperCase()} storm started! Duration: ${Math.floor(duration / 20)}s at (${stormCenterX}, ${stormCenterZ})`);
    }
}

function driftStormCenter(overworld) {
    // Predictable direction with occasional erratic changes (every ~30 seconds, 15% chance per move)
    const ticksSinceDirChange = system.currentTick - stormDriftAngleChangeTick;
    const shouldChangeDir = Math.random() < 0.15 || (ticksSinceDirChange > 600 && Math.random() < 0.4);
    let erratic = false;
    if (shouldChangeDir) {
        stormDriftAngleChangeTick = system.currentTick;
        erratic = Math.random() < 0.25; // 25% chance for erratic turn
        stormDriftAngle += erratic ? (Math.random() - 0.5) * Math.PI * 1.5 : (Math.random() - 0.5) * 0.5;
    }
    stormCenterX += Math.cos(stormDriftAngle) * STORM_DRIFT_SPEED;
    stormCenterZ += Math.sin(stormDriftAngle) * STORM_DRIFT_SPEED;
    
    const dbgMov = isDebugEnabled("snow_storm", "movement") || isDebugEnabled("snow_storm", "all");
    if (dbgMov) {
        const detail = shouldChangeDir ? `, dirChange, erratic=${erratic}` : "";
        console.warn(`[SNOW STORM] Movement: center (${stormCenterX.toFixed(1)}, ${stormCenterY.toFixed(1)}, ${stormCenterZ.toFixed(1)}), angle=${(stormDriftAngle * 180 / Math.PI).toFixed(0)}°, particles=${lastParticleSpawned}, skipped=${lastParticleSkipped}${detail}`);
    }
    
    // Y variance: sometimes drift up/down so storm doesn't stay stuck on tree tops
    if (Math.random() < STORM_Y_DRIFT_CHANCE) {
        const surfaceAtCenter = findSurfaceBlock(overworld, Math.floor(stormCenterX), Math.floor(stormCenterZ));
        const baseY = surfaceAtCenter ? surfaceAtCenter.y : 64;
        const targetY = baseY + (Math.random() - 0.5) * 2 * STORM_Y_VARIANCE; // ±12 blocks from surface
        stormCenterY = baseY + (stormCenterY - baseY) * 0.7 + (targetY - baseY) * 0.3; // Smooth drift
    }
}

function saveStormState() {
    try {
        const currentTick = system.currentTick;
        const state = {
            active: stormActive,
            type: stormType,
            centerX: stormCenterX,
            centerZ: stormCenterZ,
            centerY: stormCenterY,
            driftAngle: stormDriftAngle,
            ticksUntilEnd: stormActive ? Math.max(0, stormEndTick - currentTick) : 0,
            ticksUntilCooldownEnd: !stormActive && cooldownEndTick > currentTick ? Math.max(0, cooldownEndTick - currentTick) : 0,
            duration: stormActive ? stormEndTick - stormStartTick : 0
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
        stormActive = Boolean(state.active);
        stormType = state.type === "minor" || state.type === "major" ? state.type : null;
        stormCenterX = typeof state.centerX === "number" ? state.centerX : 0;
        stormCenterZ = typeof state.centerZ === "number" ? state.centerZ : 0;
        stormCenterY = typeof state.centerY === "number" ? state.centerY : 64;
        stormDriftAngle = typeof state.driftAngle === "number" ? state.driftAngle : Math.random() * Math.PI * 2;
        
        if (stormActive && typeof state.ticksUntilEnd === "number" && state.ticksUntilEnd > 0) {
            stormEndTick = currentTick + state.ticksUntilEnd;
            stormStartTick = currentTick - (typeof state.duration === "number" ? state.duration - state.ticksUntilEnd : 0);
            if (isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all")) {
                console.warn(`[SNOW STORM] Restored ${stormType} storm, ${Math.floor(state.ticksUntilEnd / 20)}s remaining at (${stormCenterX}, ${stormCenterZ})`);
            }
        } else if (stormActive) {
            stormActive = false;
            stormType = null;
        }
        
        if (!stormActive && typeof state.ticksUntilCooldownEnd === "number" && state.ticksUntilCooldownEnd > 0) {
            cooldownEndTick = currentTick + state.ticksUntilCooldownEnd;
        }
    } catch (e) {
        console.warn("[SNOW STORM] Failed to load storm state:", e);
    }
}

export function endStorm(skipCooldown = false) {
    if (!stormActive) return;
    
    // Remove blindness from all players who were in the storm
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
    
    stormActive = false;
    stormType = null;
    cooldownEndTick = system.currentTick + cooldown;
    playersInStorm.clear();
    
    saveStormState();
    if (isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all")) {
        console.warn(`[SNOW STORM] Storm ended.${skipCooldown ? " (beta disabled)" : ""} Cooldown: ${Math.floor(cooldown / 20)}s`);
    }
}

function checkStormStart() {
    if (stormActive) return; // Already active
    if (system.currentTick < cooldownEndTick) return; // Still in cooldown
    
    const currentDay = getCurrentDay();
    const startDay = getStormStartDay();
    if (currentDay < startDay) return; // Too early
    
    const params = getStormParams();
    if (Math.random() < params.startChance) {
        // After day 20: only major storms occur
        if (currentDay >= 20) {
            startStorm("major");
        } else {
            // Before day 20: roll for major vs minor based on scaled chance
            const isMajor = Math.random() < params.majorChance;
            startStorm(isMajor ? "major" : "minor");
        }
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
        
        // If beta was disabled, end any active storm (no cooldown so storms can start when re-enabled)
        if (stormActive && !isBetaDustStormsEnabled()) {
            endStorm(true);
        }
        
        // Check if storm should end
        if (stormActive && currentTick >= stormEndTick) {
            endStorm();
        }
        
        // Check if storm should start
        if (!stormActive) {
            checkStormStart();
        }
        
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
        if (!stormActive || !isScriptEnabled(SCRIPT_IDS.snowStorm) || !isBetaDustStormsEnabled()) return;
        
        const currentTick = system.currentTick;
        const overworld = world.getDimension("overworld");
        if (!overworld) return;
        
        const players = overworld.getPlayers();
        
        // Storm progress 0-1 over lifetime
        const duration = stormEndTick - stormStartTick;
        const elapsed = currentTick - stormStartTick;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        const sizeMultiplier = getStormSizeMultiplier(progress);
        
        const baseRadius = stormType === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
        const currentRadius = baseRadius * sizeMultiplier;
        
        // Drift storm center (rolls across surface - more movement, Y varies)
        if (currentTick - lastStormMoveTick >= STORM_MOVE_INTERVAL) {
            lastStormMoveTick = currentTick;
            driftStormCenter(overworld);
        }
        
        // Get surface Y at storm center for particles (blend with current stormCenterY for variance)
        const surfaceAtCenter = findSurfaceBlock(overworld, Math.floor(stormCenterX), Math.floor(stormCenterZ));
        const targetSurfaceY = surfaceAtCenter ? surfaceAtCenter.y + 2 : 64;
        stormCenterY = stormCenterY * 0.85 + targetSurfaceY * 0.15; // Slowly follow surface, keeps variance
        
        const stormCenter = { x: stormCenterX, y: stormCenterY, z: stormCenterZ };
        const density = getParticleDensity(overworld);
        const currentDay = getCurrentDay();
        const startDay = getStormStartDay();
        const placementCount = getScaledPlacementCount(
            stormType === "major" ? MAJOR_PLACEMENTS_PER_PASS : MINOR_PLACEMENTS_PER_PASS,
            currentDay,
            startDay
        );
        
        // Track which players are in storm (within radius of center) + apply/remove blindness
        const wasInStorm = new Set(playersInStorm);
        const nowInStorm = new Set();
        playersInStorm.clear();
        for (const player of players) {
            if (!player?.isValid) continue;
            const gameMode = player.getGameMode?.();
            if (gameMode === "creative" || gameMode === "spectator") continue;
            
            const dx = player.location.x - stormCenterX;
            const dz = player.location.z - stormCenterZ;
            const distSq = dx * dx + dz * dz;
            if (distSq <= currentRadius * currentRadius) {
                nowInStorm.add(player.id);
                playersInStorm.add(player.id);
                try {
                    markCodex(player, "biomes.stormSeen");
                    if (stormType === "minor") markCodex(player, "biomes.stormMinorSeen");
                    if (stormType === "major") markCodex(player, "biomes.stormMajorSeen");
                } catch { }
                
                // Blindness 1 while in storm (refreshed every tick so it stays)
                try {
                    player.addEffect("blindness", BLINDNESS_DURATION_TICKS, { amplifier: 0, showParticles: false });
                } catch { }
                
                // Play storm ambience (louder infected biome sound)
                if (currentTick - lastStormSoundTick >= STORM_SOUND_INTERVAL) {
                    try {
                        const vol = (getPlayerSoundVolume?.(player) ?? 1) * STORM_SOUND_VOLUME;
                        const soundIdx = Math.floor(Math.random() * STORM_AMBIENCE_SOUNDS.length);
                        player.playSound(STORM_AMBIENCE_SOUNDS[soundIdx], { volume: vol, pitch: 0.9 });
                    } catch { }
                }
                
                // 10% chance for nausea every 10 seconds
                if (currentTick - lastStormNauseaTick >= STORM_NAUSEA_INTERVAL) {
                    if (Math.random() < STORM_NAUSEA_CHANCE) {
                        try {
                            player.addEffect("minecraft:nausea", STORM_NAUSEA_DURATION_TICKS, { amplifier: 0 });
                        } catch { }
                    }
                }
            } else {
                // Nearby but outside storm: play distant ambience (quieter)
                const nearbyRadius = currentRadius * STORM_NEARBY_RADIUS_MULT;
                if (distSq <= nearbyRadius * nearbyRadius && currentTick - lastStormSoundTick >= STORM_SOUND_INTERVAL) {
                    try {
                        const vol = (getPlayerSoundVolume?.(player) ?? 1) * STORM_NEARBY_VOLUME;
                        const soundIdx = Math.floor(Math.random() * STORM_AMBIENCE_SOUNDS.length);
                        player.playSound(STORM_AMBIENCE_SOUNDS[soundIdx], { volume: vol, pitch: 0.85 });
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
        if (currentTick - lastStormSoundTick >= STORM_SOUND_INTERVAL) {
            lastStormSoundTick = currentTick;
        }
        if (currentTick - lastStormNauseaTick >= STORM_NAUSEA_INTERVAL) {
            lastStormNauseaTick = currentTick;
        }
        
        // Spawn particles only inside storm area (mb:white_dust_particle)
        spawnStormParticles(overworld, stormCenter, density, currentRadius);
        
        // Place snow at random surface positions within storm radius (only near players = loaded chunks)
        if (currentTick % PLACEMENT_INTERVAL === 0 && currentRadius >= 5) {
            const placeFunc = stormType === "major" ? tryPlaceSnowLayerMajor : tryPlaceSnowLayerMinor;
            let placed = 0;
            let attempts = 0;
            let noSurface = 0;
            let placeFailed = 0;
            const dbgPlace = isDebugEnabled("snow_storm", "placement") || isDebugEnabled("snow_storm", "all");
            const PLACEMENT_NEAR_PLAYER = 96; // Only place near players (loaded chunks)

            for (let i = 0; i < placementCount * 3 && placed < placementCount; i++) {
                attempts++;
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * currentRadius * 0.9;
                const x = Math.floor(stormCenterX + Math.cos(angle) * distance);
                const z = Math.floor(stormCenterZ + Math.sin(angle) * distance);

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
        
        // Mob storm damage (small damage over time; if they die, they convert like killed by infected)
        // Only when storm is near players (loaded chunks) - same as snow placement
        const MOB_DAMAGE_NEAR_PLAYER = 96;
        const stormNearPlayer = players.some(p => p?.isValid && Math.hypot(p.location.x - stormCenterX, p.location.z - stormCenterZ) <= MOB_DAMAGE_NEAR_PLAYER);
        
        if (stormNearPlayer && currentTick % STORM_MOB_DAMAGE_INTERVAL === 0 && currentRadius >= 5) {
            const excludeTypes = new Set([
                "minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:fireball",
                "minecraft:small_fireball", "minecraft:firework_rocket"
            ]);
            const mbPrefixes = ["mb:mb_day", "mb:infected", "mb:buff_mb", "mb:flying_mb", "mb:mining_mb", "mb:torpedo_mb", "mb:infected_pig", "mb:infected_cow"];
            mobsInStormCount = 0;
            let damaged = 0;
            try {
                const mobs = overworld.getEntities({
                    location: { x: stormCenterX, y: stormCenterY, z: stormCenterZ },
                    maxDistance: currentRadius
                });
                for (const mob of mobs) {
                    if (!mob?.isValid || mob instanceof Player) continue;
                    const tid = mob.typeId || "";
                    if (excludeTypes.has(tid)) continue;
                    if (mbPrefixes.some(p => tid.startsWith(p))) continue;
                    const dx = mob.location.x - stormCenterX;
                    const dz = mob.location.z - stormCenterZ;
                    if (dx * dx + dz * dz > currentRadius * currentRadius) continue;
                    mobsInStormCount++; // Count all mobs in storm (for status log)
                    try {
                        mob.applyDamage(STORM_MOB_DAMAGE_AMOUNT);
                        stormKillCandidates.set(mob.id, currentTick);
                        damaged++;
                    } catch { }
                }
                const dbgMob = isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all");
                if (dbgMob && damaged > 0) console.warn(`[SNOW STORM] Mob damage: ${damaged} mobs damaged`);
            } catch { }
        }
        
        // Major storm block destruction (leaves, grass, flowers; glass with lower chance) when at peak size
        if (stormType === "major" && stormNearPlayer && progress >= 0.25 && progress <= 0.75 && currentTick % STORM_DESTRUCT_INTERVAL === 0) {
            const DESTRUCT_SAMPLES = 8;
            for (let i = 0; i < DESTRUCT_SAMPLES; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = currentRadius * 0.85 * Math.sqrt(Math.random());
                const x = Math.floor(stormCenterX + Math.cos(angle) * r);
                const z = Math.floor(stormCenterZ + Math.sin(angle) * r);
                const surface = findSurfaceBlock(overworld, x, z);
                if (!surface) continue;
                for (let dy = 0; dy <= 6; dy++) {
                    const by = surface.y + dy;
                    try {
                        const block = overworld.getBlock({ x, y: by, z });
                        if (!block?.typeId) continue;
                        const tid = block.typeId;
                        if (STORM_DESTRUCT_BLOCKS.has(tid) && Math.random() < STORM_DESTRUCT_CHANCE) {
                            block.setType("minecraft:air");
                            break;
                        }
                        if (STORM_DESTRUCT_GLASS.has(tid) && !STORM_DESTRUCT_GLASS_EXCLUDE.has(tid) &&
                            !tid.includes("tinted") && !tid.includes("hardened") && !tid.includes("hard_glass") &&
                            Math.random() < STORM_DESTRUCT_GLASS_CHANCE) {
                            block.setType("minecraft:air");
                            break;
                        }
                    } catch { }
                }
            }
        }
        
        // Periodic comprehensive status (every ~5 sec) when general or all
        const dbgGen = isDebugEnabled("snow_storm", "general") || isDebugEnabled("snow_storm", "all");
        if (dbgGen && currentTick % 100 === 50) {
            const ticksLeft = Math.max(0, stormEndTick - currentTick);
            const secLeft = Math.floor(ticksLeft / 20);
            console.warn(`[SNOW STORM] Status: ${stormType} | center (${stormCenterX.toFixed(0)}, ${stormCenterY.toFixed(0)}, ${stormCenterZ.toFixed(0)}) | radius ${currentRadius.toFixed(0)} | progress ${(progress * 100).toFixed(0)}% | ${secLeft}s left | players: ${playersInStorm.size} | mobs: ${mobsInStormCount} | snow placed: ${totalSnowPlacedThisStorm}`);
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

/** Returns whether (x,z) is inside the current storm radius. */
export function isPositionInStormRadius(x, z) {
    if (!stormActive) return false;
    const currentTick = system.currentTick;
    const duration = stormEndTick - stormStartTick;
    const progress = Math.min(1, Math.max(0, (currentTick - stormStartTick) / duration));
    const mult = getStormSizeMultiplier(progress);
    const baseRadius = stormType === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
    const radius = baseRadius * mult;
    const dx = x - stormCenterX, dz = z - stormCenterZ;
    return (dx * dx + dz * dz) <= radius * radius;
}

/** Returns storm spawn info for spawn controller. */
export function getStormSpawnInfo() {
    if (!stormActive) return null;
    const currentTick = system.currentTick;
    const duration = stormEndTick - stormStartTick;
    const progress = Math.min(1, Math.max(0, (currentTick - stormStartTick) / duration));
    const mult = getStormSizeMultiplier(progress);
    const baseRadius = stormType === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR;
    return { active: true, centerX: stormCenterX, centerZ: stormCenterZ, radius: baseRadius * mult };
}

/** Returns spawn tiles inside storm radius (surface blocks with air above) for Maple Bear spawning. */
export function getStormSpawnTiles(dimension, playerPos, minDistSq, maxDistSq, limit = 15) {
    const info = getStormSpawnInfo();
    if (!info || !dimension) return [];
    const tiles = [];
    const seen = new Set();
    for (let i = 0; i < limit * 2; i++) {
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
        if (tiles.length >= limit) break;
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
    let centerX = loc.x;
    let centerZ = loc.z;
    if (distance > 0) {
        const angle = Math.random() * Math.PI * 2;
        centerX += Math.cos(angle) * distance;
        centerZ += Math.sin(angle) * distance;
    }
    
    startStorm(type, { x: centerX, z: centerZ });
    
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
        majorChance: null
    };
    console.warn("[SNOW STORM] Manual override reset - using day-based settings");
}

export function getStormState() {
    return {
        active: stormActive,
        type: stormType,
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
        currentRadius = Math.floor((state.type === "major" ? BASE_STORM_RADIUS_MAJOR : BASE_STORM_RADIUS_MINOR) * mult);
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
