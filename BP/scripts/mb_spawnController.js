// ============================================================================
// MAPLE BEAR SPAWN CONTROLLER
// ============================================================================
// Main spawn system for Maple Bear entities. Handles tile collection, caching,
// spawn location calculation, and entity spawning based on day progression.
// ============================================================================

import { system, world } from "@minecraft/server";
import { getCurrentDay, isMilestoneDay } from "./mb_dayTracker.js";
import { isDebugEnabled, getPlayerSoundVolume } from "./mb_codex.js";

// ============================================================================
// SECTION 1: DEBUG AND ERROR LOGGING
// ============================================================================

// Debug flags - now uses codex debug system
const ERROR_LOGGING = true; // Always log errors (recommended: true)

// Error tracking to prevent spam
const errorLogCounts = new Map(); // Track error frequency
const ERROR_LOG_COOLDOWN = 6000; // Only log same error every 100 seconds (6000 ticks)
const MAX_ERROR_LOGS = 10; // Max times to log the same error

// Debug message consolidation to prevent spam
const debugMessageCounts = new Map(); // Track message counts per player/message type
const debugMessageLastTick = new Map(); // Track last tick message was logged per player/message type
const CONSOLIDATION_INTERVAL = 60; // Consolidate messages every 60 ticks (3 seconds)

// Helper function for conditional debug logging (now uses codex debug system)
function debugLog(category, message, ...args) {
    if (category === 'spawn') {
        // Check codex debug settings for spawn debug
        if (isDebugEnabled('spawn', 'general') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] ${message}`, ...args);
        }
        // Tile scanning is a separate flag
        if ((isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) && (message.includes('tile') || message.includes('Tile') || message.includes('scan'))) {
            console.warn(`[SPAWN DEBUG] ${message}`, ...args);
        }
        // Cache debug
        if ((isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'all')) && (message.includes('cache') || message.includes('Cache'))) {
            console.warn(`[SPAWN DEBUG] ${message}`, ...args);
        }
        // Validation debug
        if ((isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'all')) && (message.includes('valid') || message.includes('Valid') || message.includes('invalid'))) {
            console.warn(`[SPAWN DEBUG] ${message}`, ...args);
        }
        // Distance debug
        if ((isDebugEnabled('spawn', 'distance') || isDebugEnabled('spawn', 'all')) && (message.includes('distance') || message.includes('Distance') || message.includes('dist'))) {
            console.warn(`[SPAWN DEBUG] ${message}`, ...args);
        }
        // Spacing debug
        if ((isDebugEnabled('spawn', 'spacing') || isDebugEnabled('spawn', 'all')) && (message.includes('spacing') || message.includes('Spacing') || message.includes('spaced'))) {
            console.warn(`[SPAWN DEBUG] ${message}`, ...args);
        }
    } else if (category === 'cache') {
        // Cache debug
        if (isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[CACHE DEBUG] ${message}`, ...args);
        }
    } else if (category === 'groups') {
        // Groups debug can use spawn general
        if (isDebugEnabled('spawn', 'general') || isDebugEnabled('spawn', 'all')) {
            // Only prevent duplicates within the same tick - allow logging on every tick
            const now = system.currentTick;
            const messageKey = `groups-${message}`;
            const lastTick = debugMessageLastTick.get(messageKey) || -1;
            
            // Only suppress if this exact message was already logged in this exact tick
            // This allows the message to log on every tick, but prevents duplicates within the same tick
            if (lastTick !== now) {
                console.warn(`[GROUP DEBUG] ${message}`, ...args);
                debugMessageLastTick.set(messageKey, now);
            }
        }
    }
}

// Helper function for error logging with rate limiting
function errorLog(message, error = null, context = {}) {
    if (!ERROR_LOGGING) return;
    
    const errorKey = `${message}-${error?.message || 'unknown'}`;
    const now = system.currentTick;
    const lastLog = errorLogCounts.get(errorKey);
    
    // Check if we should log this error
    if (lastLog) {
        const timeSinceLastLog = now - lastLog.lastTick;
        const logCount = lastLog.count;
        
        // Skip if logged too recently or too many times
        if (timeSinceLastLog < ERROR_LOG_COOLDOWN || logCount >= MAX_ERROR_LOGS) {
            return;
        }
        
        // Update log count
        errorLogCounts.set(errorKey, { lastTick: now, count: logCount + 1 });
    } else {
        // First time logging this error
        errorLogCounts.set(errorKey, { lastTick: now, count: 1 });
    }
    
    // Log the error
    // Ensure context is always a valid object (fixes "cannot convert to object" errors)
    const safeContext = context && typeof context === 'object' ? context : {};
    const contextStr = Object.keys(safeContext).length > 0 ? ` Context: ${JSON.stringify(safeContext)}` : '';
    if (error) {
        console.warn(`[SPAWN ERROR] ${message}${contextStr}`, error);
    } else {
        console.warn(`[SPAWN ERROR] ${message}${contextStr}`);
    }
}

// ============================================================================
// SECTION 2: ENTITY TYPE CONSTANTS
// ============================================================================

const TINY_BEAR_ID = "mb:mb";
const DAY4_BEAR_ID = "mb:mb_day4";
const DAY8_BEAR_ID = "mb:mb_day8";
const DAY13_BEAR_ID = "mb:mb_day13";
const DAY20_BEAR_ID = "mb:mb_day20";
const INFECTED_BEAR_ID = "mb:infected";
const INFECTED_BEAR_DAY8_ID = "mb:infected_day8";
const INFECTED_BEAR_DAY13_ID = "mb:infected_day13";
const INFECTED_BEAR_DAY20_ID = "mb:infected_day20";
const BUFF_BEAR_ID = "mb:buff_mb";
const BUFF_BEAR_DAY13_ID = "mb:buff_mb_day13";
const BUFF_BEAR_DAY20_ID = "mb:buff_mb_day20";
const FLYING_BEAR_ID = "mb:flying_mb";
const FLYING_BEAR_DAY15_ID = "mb:flying_mb_day15";
const FLYING_BEAR_DAY20_ID = "mb:flying_mb_day20";
const MINING_BEAR_ID = "mb:mining_mb";
const MINING_BEAR_DAY20_ID = "mb:mining_mb_day20";
const TORPEDO_BEAR_ID = "mb:torpedo_mb";
const TORPEDO_BEAR_DAY20_ID = "mb:torpedo_mb_day20";
const SPAWN_DIFFICULTY_PROPERTY = "mb_spawnDifficulty";

// ============================================================================
// SECTION 2.1: ENTITY TYPE CONSTANTS AND CAPS
// ============================================================================

// Entity type constants
const TINY_TYPE = "tiny";
const INFECTED_TYPE = "infected";
const MINING_TYPE = "mining";
const FLYING_TYPE = "flying";
const TORPEDO_TYPE = "torpedo";

// Spawn caps for each type (all variants count toward the same cap)
const ENTITY_TYPE_CAPS = {
    [TINY_TYPE]: 75,
    [INFECTED_TYPE]: 50,
    [MINING_TYPE]: 20,
    [FLYING_TYPE]: 30,
    [TORPEDO_TYPE]: 10
};

// Map each entity ID to its type
const ENTITY_TO_TYPE_MAP = {
    // Tiny bears
    [TINY_BEAR_ID]: TINY_TYPE,
    [DAY4_BEAR_ID]: TINY_TYPE,
    [DAY8_BEAR_ID]: TINY_TYPE,
    [DAY13_BEAR_ID]: TINY_TYPE,
    [DAY20_BEAR_ID]: TINY_TYPE,
    // Infected bears
    [INFECTED_BEAR_ID]: INFECTED_TYPE,
    [INFECTED_BEAR_DAY8_ID]: INFECTED_TYPE,
    [INFECTED_BEAR_DAY13_ID]: INFECTED_TYPE,
    [INFECTED_BEAR_DAY20_ID]: INFECTED_TYPE,
    // Mining bears
    [MINING_BEAR_ID]: MINING_TYPE,
    [MINING_BEAR_DAY20_ID]: MINING_TYPE,
    // Flying bears
    [FLYING_BEAR_ID]: FLYING_TYPE,
    [FLYING_BEAR_DAY15_ID]: FLYING_TYPE,
    [FLYING_BEAR_DAY20_ID]: FLYING_TYPE,
    // Torpedo bears
    [TORPEDO_BEAR_ID]: TORPEDO_TYPE,
    [TORPEDO_BEAR_DAY20_ID]: TORPEDO_TYPE
};

/**
 * Get the entity type for a given entity ID
 * @param {string} entityId - The entity identifier
 * @returns {string|null} - The type constant or null if not a Maple Bear
 */
function getEntityType(entityId) {
    return ENTITY_TO_TYPE_MAP[entityId] || null;
}

/**
 * Get the total count of all variants of a given type
 * @param {Object} entityCounts - Object mapping entity IDs to their counts
 * @param {string} type - The type constant (e.g., TINY_TYPE, INFECTED_TYPE)
 * @returns {number} - Total count of all variants of that type
 */
function getTypeCount(entityCounts, type) {
    if (!entityCounts || typeof entityCounts !== 'object' || !type) {
        return 0;
    }
    
    let total = 0;
    for (const [entityId, count] of Object.entries(entityCounts)) {
        if (getEntityType(entityId) === type) {
            total += (count || 0);
        }
    }
    return total;
}

// Track entities that consistently fail to spawn (to reduce error spam)
// Map: entityId -> { failureCount: number, lastFailureTick: number, pendingRetries: number }
const entitySpawnFailures = new Map();
const MAX_FAILURES_BEFORE_SILENT = 3; // Stop logging errors after 3 failures, but keep trying to spawn
const MAX_PENDING_RETRIES = 5; // Maximum number of delayed retries before giving up
const RETRY_DELAY_TICKS = 100; // Wait 5 seconds (100 ticks) before retrying unregistered entities

// Track active buff bear proximity ambience per player
// Map: playerId -> { soundId: string, lastCheckTick: number }
const activeBuffAmbience = new Map();
const BUFF_AMBIENCE_RANGE = 25; // Blocks

// Fallback entity mapping: if day 20 variant fails, try the previous variant
const ENTITY_FALLBACKS = {
    [INFECTED_BEAR_DAY20_ID]: INFECTED_BEAR_DAY13_ID,
    [INFECTED_BEAR_DAY13_ID]: INFECTED_BEAR_DAY8_ID,
    [INFECTED_BEAR_DAY8_ID]: INFECTED_BEAR_ID,
    [BUFF_BEAR_DAY20_ID]: BUFF_BEAR_DAY13_ID,
    [BUFF_BEAR_DAY13_ID]: BUFF_BEAR_ID,
    [MINING_BEAR_DAY20_ID]: MINING_BEAR_ID,
    [FLYING_BEAR_DAY20_ID]: FLYING_BEAR_DAY15_ID,
    [FLYING_BEAR_DAY15_ID]: FLYING_BEAR_ID,
    [TORPEDO_BEAR_DAY20_ID]: TORPEDO_BEAR_ID,
    [DAY20_BEAR_ID]: DAY13_BEAR_ID,
    [DAY13_BEAR_ID]: DAY8_BEAR_ID,
    [DAY8_BEAR_ID]: DAY4_BEAR_ID,
    [DAY4_BEAR_ID]: TINY_BEAR_ID
};

/**
 * Get fallback entity ID if primary fails, or null if no fallback
 */
function getFallbackEntityId(entityId) {
    return ENTITY_FALLBACKS[entityId] || null;
}

// ============================================================================
// SECTION 3: BLOCK TYPE CONSTANTS AND HELPERS
// ============================================================================

const TARGET_BLOCK = "mb:dusted_dirt";
const TARGET_BLOCK_2 = "mb:snow_layer"; // Also check for snow layers
const NETHER_TARGET_BLOCKS = [
    "minecraft:netherrack",
    "minecraft:soul_sand",
    "minecraft:soul_soil",
    "minecraft:basalt",
    "minecraft:crimson_nylium",
    "minecraft:warped_nylium"
];
const END_TARGET_BLOCK = "minecraft:end_stone";

// Blocks that should NEVER be valid spawn locations (structures, player-built blocks, etc.)
const BLOCKED_SPAWN_BLOCKS = new Set([
    "minecraft:stone_bricks",
    "minecraft:mossy_stone_bricks",
    "minecraft:cracked_stone_bricks",
    "minecraft:chiseled_stone_bricks",
    "minecraft:infested_stone_bricks",
    "minecraft:infested_mossy_stone_bricks",
    "minecraft:infested_cracked_stone_bricks",
    "minecraft:infested_chiseled_stone_bricks"
]);

// Helper function to check if a block is a valid target block for a dimension
function isValidTargetBlock(typeId, dimensionId = null) {
    // Never allow blocked spawn blocks (stronghold blocks, etc.)
    if (BLOCKED_SPAWN_BLOCKS.has(typeId)) {
        return false;
    }
    
    if (typeId === TARGET_BLOCK || typeId === TARGET_BLOCK_2) {
        return true;
    }
    // Dimension-specific blocks
    if (dimensionId === "minecraft:nether" && NETHER_TARGET_BLOCKS.includes(typeId)) {
        return true;
    }
    if (dimensionId === "minecraft:the_end" && typeId === END_TARGET_BLOCK) {
        return true;
    }
    return false;
}

const AIR_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air"
]);

const FLYING_SPAWN_SETTINGS = {
    [FLYING_BEAR_ID]: { minAbsoluteY: 70, offset: 5, maxLift: 8, skyClearance: 6 },
    [FLYING_BEAR_DAY15_ID]: { minAbsoluteY: 74, offset: 6, maxLift: 9, skyClearance: 7 },
    [FLYING_BEAR_DAY20_ID]: { minAbsoluteY: 78, offset: 7, maxLift: 10, skyClearance: 8 },
    [TORPEDO_BEAR_ID]: { minAbsoluteY: 82, offset: 10, maxLift: 12, skyClearance: 10 },
    [TORPEDO_BEAR_DAY20_ID]: { minAbsoluteY: 88, offset: 12, maxLift: 14, skyClearance: 12 }
};

// ============================================================================
// SECTION 4: SPAWN SETTINGS AND CONFIGURATION
// ============================================================================

const MINING_SPAWN_SETTINGS = {
    [MINING_BEAR_ID]: { maxAbsoluteY: 55, roofProbe: 6, requiredRoofBlocks: 2, clearance: 3, allowSurface: false },
    [MINING_BEAR_DAY20_ID]: { maxAbsoluteY: 320, roofProbe: 7, requiredRoofBlocks: 2, clearance: 4, allowSurface: true }
};

// ============================================================================
// SECTION 5: BLOCK UTILITY FUNCTIONS
// ============================================================================

function getBlockSafe(dimension, x, y, z) {
    try {
        return dimension.getBlock({ x, y, z });
    } catch {
        return null;
    }
}

function columnIsClear(dimension, x, z, startY, endY) {
    if (!dimension) return false;
    
    // Get dimension bounds to prevent accessing blocks outside world boundaries
    let dimensionId;
    try {
        dimensionId = dimension.id;
    } catch {
        return false;
    }
    const bounds = getDimensionYBounds(dimensionId);
    
    const minY = Math.floor(Math.min(startY, endY));
    const maxY = Math.floor(Math.max(startY, endY));
    
    // Cap Y values to dimension bounds
    const cappedMinY = Math.max(minY, bounds.min);
    const cappedMaxY = Math.min(maxY, bounds.max);
    
    // If range is invalid after capping, return false
    if (cappedMinY > cappedMaxY) {
        return false;
    }
    
    for (let y = cappedMinY; y <= cappedMaxY; y++) {
        const block = getBlockSafe(dimension, x, y, z);
        if (!isAir(block)) {
            return false;
        }
    }
    return true;
}

function skyIsClear(dimension, x, z, startY, height) {
    if (!dimension) return false;
    
    // Get dimension bounds to prevent accessing blocks outside world boundaries
    let dimensionId;
    try {
        dimensionId = dimension.id;
    } catch {
        return false;
    }
    const bounds = getDimensionYBounds(dimensionId);
    
    const startYInt = Math.floor(startY);
    const endY = startYInt + height - 1;
    
    // Cap Y values to dimension bounds
    const cappedStartY = Math.max(startYInt, bounds.min);
    const cappedEndY = Math.min(endY, bounds.max);
    
    // If range is invalid after capping, return false
    if (cappedStartY > cappedEndY) {
        return false;
    }
    
    for (let y = cappedStartY; y <= cappedEndY; y++) {
        const block = getBlockSafe(dimension, x, y, z);
        if (!isAir(block)) {
            return false;
        }
    }
    return true;
}

function hasRoof(dimension, x, z, startY, probe, requiredSolid) {
    let solidCount = 0;
    for (let i = 0; i < probe; i++) {
        const block = getBlockSafe(dimension, x, startY + i, z);
        if (block && !isAir(block)) {
            solidCount++;
            if (solidCount >= requiredSolid) {
                return true;
            }
        }
    }
    return false;
}

// ============================================================================
// SECTION 6: SPAWN LOCATION FUNCTIONS
// ============================================================================

// Get dimension-specific Y bounds to prevent spawning outside world boundaries
function getDimensionYBounds(dimensionId) {
    if (dimensionId === "minecraft:nether") {
        return { min: -64, max: 127 }; // Nether ceiling is at Y=128, but we use 127 to be safe
    } else if (dimensionId === "minecraft:the_end") {
        return { min: -64, max: 320 }; // End has no ceiling
    } else {
        return { min: -64, max: 320 }; // Overworld
    }
}

// Check if a chunk is loaded before scanning blocks in it
// This prevents errors when trying to access blocks in unloaded chunks
function isChunkLoaded(dimension, x, z) {
    if (!dimension) return false;
    
    try {
        // Try to access a block at Y=0 (or a safe Y level) to check if chunk is loaded
        // Use a Y level that exists in all dimensions
        const testY = 0;
        const block = dimension.getBlock({ x, y: testY, z });
        return block !== null;
    } catch {
        // If we get an error, chunk is likely not loaded
        return false;
    }
}

// Cache chunk loading status to avoid repeated checks
const chunkLoadingCache = new Map(); // key: "dimensionId,x,z" -> { loaded: bool, tick: number }
const CHUNK_LOADING_CACHE_TTL = 20; // Cache for 1 second (20 ticks)

// Check if chunk is loaded with caching
function isChunkLoadedCached(dimension, x, z) {
    if (!dimension) return false;
    
    let dimensionId;
    try {
        dimensionId = dimension.id;
    } catch {
        return false;
    }
    
    // Get chunk coordinates (16x16 blocks per chunk)
    const chunkX = Math.floor(x / 16);
    const chunkZ = Math.floor(z / 16);
    const cacheKey = `${dimensionId},${chunkX},${chunkZ}`;
    
    const now = system.currentTick;
    const cached = chunkLoadingCache.get(cacheKey);
    
    // Use cached value if still valid
    if (cached && (now - cached.tick) < CHUNK_LOADING_CACHE_TTL) {
        return cached.loaded;
    }
    
    // Check chunk loading status
    const loaded = isChunkLoaded(dimension, chunkX * 16, chunkZ * 16);
    
    // Cache the result
    chunkLoadingCache.set(cacheKey, { loaded, tick: now });
    
    return loaded;
}

// Get actual player position, rounded to whole numbers
// This ensures consistent chunk calculations and handles cases where player.location
// might return vehicle position (e.g., when in a boat)
function getActualPlayerPosition(player) {
    if (!player) return null;
    
    try {
        const location = player.location;
        // Round all coordinates to whole numbers to ensure consistent chunk calculations
        return {
            x: Math.floor(location.x),
            y: Math.floor(location.y),
            z: Math.floor(location.z)
        };
    } catch {
        return null;
    }
}

// Validate spawn location is within world boundaries
function validateSpawnLocation(location, dimensionId) {
    if (!location) return null;
    
    const bounds = getDimensionYBounds(dimensionId);
    const y = Math.floor(location.y);
    
    if (y < bounds.min || y > bounds.max) {
        return null; // Invalid Y coordinate
    }
    
    return location;
}

// Generate air spawn tiles for flying/torpedo bears (air gets more infected over time)
function generateAirSpawnTiles(dimension, playerPos, minAbsoluteY, maxAbsoluteY, count = 15) {
    const airTiles = [];
    const playerX = Math.floor(playerPos.x);
    const playerZ = Math.floor(playerPos.z);
    const dimensionId = dimension.id;
    const bounds = getDimensionYBounds(dimensionId);
    
    // Cap Y levels to dimension bounds
    const cappedMinY = Math.max(minAbsoluteY, bounds.min);
    const cappedMaxY = Math.min(maxAbsoluteY, bounds.max);
    
    // Generate tiles at various Y levels in the air
    const yLevels = [];
    for (let y = cappedMinY; y <= cappedMaxY; y += 15) {
        yLevels.push(y);
    }
    
    // Guard against empty yLevels array
    if (yLevels.length === 0) {
        return airTiles;
    }
    
    for (let i = 0; i < count && airTiles.length < count; i++) {
        // Random position around player within spawn distance
        const angle = Math.random() * Math.PI * 2;
        const distance = MIN_SPAWN_DISTANCE + Math.random() * (MAX_SPAWN_DISTANCE - MIN_SPAWN_DISTANCE);
        const x = Math.floor(playerX + Math.cos(angle) * distance);
        const z = Math.floor(playerZ + Math.sin(angle) * distance);
        const y = yLevels[Math.floor(Math.random() * yLevels.length)];
        
        // Check if air is clear at this location
        if (columnIsClear(dimension, x, z, y - 5, y + 10)) {
            airTiles.push({ x, y, z });
        }
    }
    
    return airTiles;
}

function getSpawnLocationForConfig(configId, dimension, tile) {
    const dimensionId = dimension.id;
    let location = null;
    
    if (FLYING_SPAWN_SETTINGS[configId]) {
        location = getFlyingSpawnLocation(FLYING_SPAWN_SETTINGS[configId], dimension, tile);
    } else if (MINING_SPAWN_SETTINGS[configId]) {
        location = getMiningSpawnLocation(MINING_SPAWN_SETTINGS[configId], dimension, tile);
    } else {
        location = { x: tile.x + 0.5, y: tile.y + 1, z: tile.z + 0.5 };
    }
    
    // Final validation: ensure location is within world boundaries
    return validateSpawnLocation(location, dimensionId);
}

function getFlyingSpawnLocation(settings, dimension, tile) {
    const baseX = tile.x;
    const baseZ = tile.z;
    const groundY = tile.y + 1;
    const dimensionId = dimension.id;
    const bounds = getDimensionYBounds(dimensionId);
    
    // Validate groundY is within bounds
    if (groundY < bounds.min || groundY > bounds.max) {
        return null; // Ground position is outside world bounds
    }
    
    // Nether roof detection: Reject if trying to spawn in Nether roof (above Y=127)
    if (dimensionId === "minecraft:nether" && groundY > 127) {
        return null; // Cannot spawn in Nether roof
    }
    
    // Void detection: Check if there's solid ground below (at least one solid block within 10 blocks)
    let hasSolidGround = false;
    for (let checkY = Math.max(groundY - 1, bounds.min); checkY >= Math.max(groundY - 10, bounds.min); checkY--) {
        try {
            const block = dimension.getBlock({ x: baseX, y: checkY, z: baseZ });
            if (block && !isAir(block)) {
                hasSolidGround = true;
                break;
            }
        } catch {
            break; // Error accessing block, assume void
        }
    }
    
    // For End dimension, require solid ground (void is dangerous)
    if (dimensionId === "minecraft:the_end" && !hasSolidGround) {
        return null; // No solid ground in End, reject spawn
    }
    
    // Air spawning: The air gets more infected as time goes on
    // We can spawn in the air without requiring dusted_dirt below
    // Try to find a clear air space at the desired altitude
    
    let desiredY = Math.max(groundY + settings.offset, settings.minAbsoluteY);
    // Cap desiredY to dimension bounds BEFORE any block checks
    desiredY = Math.min(desiredY, bounds.max);
    desiredY = Math.max(desiredY, bounds.min);
    const targetY = Math.floor(desiredY);
    
    // Final validation: Ensure targetY is still within bounds after capping
    if (targetY < bounds.min || targetY > bounds.max) {
        return null;
    }
    
    // Check if we can spawn at the target Y (air spawning - don't require ground)
    if (columnIsClear(dimension, baseX, baseZ, targetY - 5, targetY + settings.skyClearance)) {
        // Clear air space found - spawn here
        if (skyIsClear(dimension, baseX, baseZ, targetY + 1, settings.skyClearance)) {
            const location = { x: baseX + 0.5, y: desiredY, z: baseZ + 0.5 };
            return validateSpawnLocation(location, dimensionId);
        }
    }
    
    // Fallback: Try to lift from ground if we have a tile with dusted_dirt
    if (groundY > 0 && groundY <= bounds.max) {
        if (!columnIsClear(dimension, baseX, baseZ, groundY, targetY)) {
            let lifted = false;
            for (let i = 1; i <= settings.maxLift; i++) {
                const testY = targetY + i;
                // Don't lift above dimension bounds
                if (testY > bounds.max) break;
                if (columnIsClear(dimension, baseX, baseZ, groundY, testY)) {
                    desiredY = testY;
                    lifted = true;
                    break;
                }
            }
            if (!lifted) {
                return null;
            }
        }

        // Ensure desiredY is still within bounds after lifting
        desiredY = Math.min(desiredY, bounds.max);
        desiredY = Math.max(desiredY, bounds.min);
        
        if (!skyIsClear(dimension, baseX, baseZ, Math.floor(desiredY) + 1, settings.skyClearance)) {
            return null;
        }

        const location = { x: baseX + 0.5, y: desiredY, z: baseZ + 0.5 };
        return validateSpawnLocation(location, dimensionId);
    }
    
    return null;
}

// Check if a block type is valid for mining bear spawning (stone, deepslate, etc. in caves)
function isValidMiningSpawnBlock(blockType) {
    if (!blockType) return false;
    
    // Never allow blocked spawn blocks (stronghold blocks, etc.)
    if (BLOCKED_SPAWN_BLOCKS.has(blockType)) {
        return false;
    }
    
    // Allow stone and deepslate variants for cave spawning
    // BUT exclude stone_bricks variants (already blocked above)
    return blockType.startsWith("minecraft:stone") || 
           blockType.startsWith("minecraft:deepslate") ||
           blockType.startsWith("minecraft:cobbled_deepslate") ||
           blockType.startsWith("minecraft:polished_deepslate") ||
           blockType.startsWith("minecraft:deepslate_bricks") ||
           blockType.startsWith("minecraft:deepslate_tiles") ||
           blockType === "minecraft:cobblestone" ||
           blockType === "minecraft:mossy_cobblestone" ||
           blockType.startsWith("minecraft:andesite") ||
           blockType.startsWith("minecraft:diorite") ||
           blockType.startsWith("minecraft:granite") ||
           blockType.startsWith("minecraft:tuff") ||
           blockType.startsWith("minecraft:calcite");
}

function getMiningSpawnLocation(settings, dimension, tile) {
    if (tile.y > settings.maxAbsoluteY) {
        return null;
    }

    let baseX = tile.x;
    let baseZ = tile.z;
    let spawnY = tile.y + 1;
    const clearanceTop = spawnY + settings.clearance;

    // Check if the tile position has a valid block (dusted_dirt or stone/deepslate in caves)
    let tileBlock;
    try {
        tileBlock = dimension.getBlock({ x: baseX, y: tile.y, z: baseZ });
    } catch {
        return null;
    }
    
    // If tile doesn't have dusted_dirt or snow_layer, check if it has stone/deepslate (for cave spawning)
    const dimensionId = dimension.id;
    if (!tileBlock || !isValidTargetBlock(tileBlock.typeId, dimensionId)) {
        // Check if it's a valid mining spawn block (stone/deepslate)
        if (tileBlock && isValidMiningSpawnBlock(tileBlock.typeId)) {
            // Only allow if it's in a cave (has roof) - don't spawn on surface stone
            if (!hasRoof(dimension, baseX, baseZ, clearanceTop + 1, settings.roofProbe, settings.requiredRoofBlocks)) {
                return null; // Not in a cave, skip
            }
            // Valid stone/deepslate in cave - proceed with spawn
        } else {
            // Not a valid spawn block, try nearby positions (within 2 blocks)
            let foundValidBlock = false;
            for (let dx = -2; dx <= 2 && !foundValidBlock; dx++) {
                for (let dz = -2; dz <= 2 && !foundValidBlock; dz++) {
                    if (dx === 0 && dz === 0) continue;
                    try {
                        const nearbyBlock = dimension.getBlock({ x: baseX + dx, y: tile.y, z: baseZ + dz });
                        if (nearbyBlock && (isValidTargetBlock(nearbyBlock.typeId, dimensionId) || isValidMiningSpawnBlock(nearbyBlock.typeId))) {
                            // Check if it's in a cave (for stone/deepslate)
                            if (!isValidTargetBlock(nearbyBlock.typeId, dimensionId) && !hasRoof(dimension, baseX + dx, baseZ + dz, clearanceTop + 1, settings.roofProbe, settings.requiredRoofBlocks)) {
                                continue; // Not in cave, skip
                            }
                            // Found valid block nearby - adjust spawn position
                            const nearbyAbove = dimension.getBlock({ x: baseX + dx, y: tile.y + 1, z: baseZ + dz });
                            const nearbyTwoAbove = dimension.getBlock({ x: baseX + dx, y: tile.y + 2, z: baseZ + dz });
                            if (nearbyAbove && isAirOrWater(nearbyAbove) && nearbyTwoAbove && isAirOrWater(nearbyTwoAbove)) {
                                baseX = baseX + dx;
                                baseZ = baseZ + dz;
                                foundValidBlock = true;
                                break;
                            }
                        }
                    } catch {
                        continue;
                    }
                }
            }
            if (!foundValidBlock) {
                return null; // No valid block found
            }
        }
    }

    if (!columnIsClear(dimension, baseX, baseZ, spawnY, clearanceTop)) {
        return null;
    }

    // After day 20, allow surface spawning (no roof required) - but only for dusted_dirt
    if (settings.allowSurface) {
        // Check if this is dusted_dirt (surface spawn allowed) or stone/deepslate (must be in cave)
        try {
            const checkBlock = dimension.getBlock({ x: baseX, y: tile.y, z: baseZ });
            if (checkBlock && isValidTargetBlock(checkBlock.typeId, dimensionId)) {
                // Surface spawns allowed for dusted_dirt - just need clearance
                return { x: baseX + 0.5, y: spawnY, z: baseZ + 0.5 };
            } else if (checkBlock && isValidMiningSpawnBlock(checkBlock.typeId)) {
                // Stone/deepslate - must be in cave even after day 20
                if (!hasRoof(dimension, baseX, baseZ, clearanceTop + 1, settings.roofProbe, settings.requiredRoofBlocks)) {
                    return null;
                }
                return { x: baseX + 0.5, y: spawnY, z: baseZ + 0.5 };
            }
        } catch {
            return null;
        }
    }

    // Pre-day 20: require roof (underground only)
    if (!hasRoof(dimension, baseX, baseZ, clearanceTop + 1, settings.roofProbe, settings.requiredRoofBlocks)) {
        return null;
    }

    return { x: baseX + 0.5, y: spawnY, z: baseZ + 0.5 };
}

// ============================================================================
// SECTION 7: SPAWN SYSTEM CONSTANTS
// ============================================================================

const SPAWN_ATTEMPTS = 25; // Increased from 18 for more spawns per cycle
// Spawn distance ranges
const MIN_SPAWN_DISTANCE = 15; // Minimum distance from player (15 blocks)
const MAX_SPAWN_DISTANCE = 45; // Maximum distance from player (45 blocks)
const BASE_MIN_TILE_SPACING = 2.5; // blocks between spawn tiles (reduced from 3 for better coverage on day 20+)
const SCAN_INTERVAL = 60; // ticks (~3 seconds) - reduced for more frequent smaller scans
// Dynamic scan cooldown based on player count (longer for multiplayer to spread load)
function getBlockScanCooldown(totalPlayerCount) {
    if (totalPlayerCount === 1) return SCAN_INTERVAL * 2; // 6 seconds for single player
    if (totalPlayerCount === 2) return SCAN_INTERVAL * 3; // 9 seconds for 2 players
    if (totalPlayerCount === 3) return SCAN_INTERVAL * 4; // 12 seconds for 3 players
    return SCAN_INTERVAL * 6; // 18 seconds for 4+ players (aggressive optimization)
}
const BLOCK_SCAN_COOLDOWN = SCAN_INTERVAL * 2; // Default (single player) - use getBlockScanCooldown() for multiplayer
const MAX_BLOCK_QUERIES_PER_SCAN = 6000; // Limit block queries per scan (smaller batches, more frequent)
const MAX_BLOCK_QUERIES_SINGLE_PLAYER = 12000; // Double the limit for single player (more thorough scanning)
// Total queries over time: 6000 every 60 ticks = ~100 queries/tick average (same as 12000 every 120 ticks)

// Calculate block query limit based on player count (reduces lag with multiple players)
function getBlockQueryLimit(isSinglePlayer, totalPlayerCount) {
    let baseLimit = isSinglePlayer ? MAX_BLOCK_QUERIES_SINGLE_PLAYER : MAX_BLOCK_QUERIES_PER_SCAN;
    
    // Scale down block queries when multiple players are present
    // This prevents total block query explosion (4 players × 6000 = 24,000 queries per tick!)
    if (totalPlayerCount > 1) {
        // More aggressive scaling to reduce lag: 2 players: 0.5x, 3 players: 0.35x, 4+ players: 0.2x
        const multiplier = totalPlayerCount === 2 ? 0.5 : totalPlayerCount === 3 ? 0.35 : 0.2;
        baseLimit = Math.floor(baseLimit * multiplier);
    }
    
    return baseLimit;
}

const SUNRISE_BOOST_DURATION = 200; // ticks
const SUNRISE_BOOST_MULTIPLIER = 1.25;

const MAX_CANDIDATES_PER_SCAN = 180; // Reduced from 220 for better performance with multiple players
const MAX_SPACED_TILES = 75; // Reduced from 90 for better performance
const CACHE_MOVE_THRESHOLD = 8; // blocks - increased from 6 to reduce cache invalidations
const CACHE_MOVE_THRESHOLD_SQ = CACHE_MOVE_THRESHOLD * CACHE_MOVE_THRESHOLD;
const CACHE_TICK_TTL = SCAN_INTERVAL * 4; // Increased from 3 to keep cache longer
const CACHE_STALE_TTL = 30 * 20; // Keep stale cache for 30 seconds (600 ticks) in case player returns
const CACHE_DELETE_TTL = 90 * 20; // Delete cache only if very old (90 seconds = 1800 ticks)

function getSpawnDifficultyState() {
    let rawValue = world.getDynamicProperty(SPAWN_DIFFICULTY_PROPERTY);
    if (typeof rawValue !== "number") {
        rawValue = 0;
        try {
            world.setDynamicProperty(SPAWN_DIFFICULTY_PROPERTY, rawValue);
        } catch { /* ignored */ }
    }

    const clampedValue = Math.max(-5, Math.min(5, rawValue));
    if (clampedValue !== rawValue) {
        try {
            world.setDynamicProperty(SPAWN_DIFFICULTY_PROPERTY, clampedValue);
        } catch { /* ignored */ }
    }

    const multiplier = Math.max(0.25, 1 + clampedValue * 0.15);
    const capAdjust = clampedValue * 0.02;
    const extraAdjust = clampedValue === 0 ? 0 : (clampedValue > 0 ? Math.ceil(clampedValue / 2) : Math.floor(clampedValue / 2));
    const attemptBonus = clampedValue * 2;

    return {
        value: clampedValue,
        multiplier,
        capAdjust,
        extraAdjust,
        attemptBonus
    };
}

// ============================================================================
// SECTION 8: SPAWN CONFIGURATIONS
// ============================================================================
// Defines spawn behavior for each bear type based on day progression
// ============================================================================

const SPAWN_CONFIGS = [
    {
        id: TINY_BEAR_ID,
        startDay: 2,
        endDay: Infinity, // Continues indefinitely - highest variant (DAY20_BEAR_ID) takes over at day 20
        baseChance: 0.14, // Increased from 0.12
        chancePerDay: 0.018, // Increased from 0.015
        maxChance: 0.65, // Increased from 0.6
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 2,
        maxCountCap: 8,
        delayTicks: 200,
        spreadRadius: 20
    },
    {
        id: DAY4_BEAR_ID,
        startDay: 4,
        endDay: Infinity, // Continues indefinitely - highest variant (DAY20_BEAR_ID) takes over at day 20
        baseChance: 0.34, // Increased from 0.3
        chancePerDay: 0.022, // Increased from 0.02
        maxChance: 0.56, // Increased from 0.5
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 2,
        maxCountCap: 7,
        delayTicks: 260,
        spreadRadius: 22
    },
    {
        id: INFECTED_BEAR_ID,
        startDay: 4,
        endDay: Infinity, // Continues indefinitely - highest variant (INFECTED_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.14, // Increased from 0.12
        chancePerDay: 0.018, // Increased from 0.015
        maxChance: 0.38, // Increased from 0.32
        baseMaxCount: 2,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 5,
        delayTicks: 320,
        spreadRadius: 24
    },
    {
        id: DAY8_BEAR_ID,
        startDay: 8,
        endDay: Infinity, // Continues indefinitely - highest variant (DAY20_BEAR_ID) takes over at day 20
        baseChance: 0.38, // Increased from 0.34
        chancePerDay: 0.022, // Increased from 0.02
        maxChance: 0.62, // Increased from 0.56
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 7,
        delayTicks: 320,
        spreadRadius: 25
    },
    {
        id: INFECTED_BEAR_DAY8_ID,
        startDay: 8,
        endDay: Infinity, // Continues indefinitely - highest variant (INFECTED_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.18, // Increased from 0.16
        chancePerDay: 0.018, // Increased from 0.015
        maxChance: 0.46, // Increased from 0.4
        baseMaxCount: 3,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 6,
        delayTicks: 340,
        spreadRadius: 26
    },
    {
        id: FLYING_BEAR_ID,
        startDay: 8, // Swapped: Now starts on day 8 (was day 11, where buff bears used to start)
        endDay: Infinity, // Continues indefinitely - highest variant (FLYING_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.12,
        chancePerDay: 0.015,
        maxChance: 0.38,
        baseMaxCount: 2,
        maxCountStep: 1,
        maxCountStepDays: 2,
        maxCountCap: 4,
        delayTicks: 360,
        spreadRadius: 30
    },
    {
        id: DAY13_BEAR_ID,
        startDay: 13,
        endDay: Infinity, // Continues indefinitely - highest variant (DAY20_BEAR_ID) takes over at day 20
        baseChance: 0.42, // Increased from 0.38
        chancePerDay: 0.028, // Increased from 0.025
        maxChance: 0.68, // Increased from 0.62
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 7,
        delayTicks: 360,
        spreadRadius: 27
    },
    {
        id: INFECTED_BEAR_DAY13_ID,
        startDay: 13,
        endDay: Infinity, // Continues indefinitely - highest variant (INFECTED_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.24, // Increased from 0.2
        chancePerDay: 0.018, // Increased from 0.015
        maxChance: 0.52, // Increased from 0.46
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 7,
        delayTicks: 380,
        spreadRadius: 28
    },
    {
        id: FLYING_BEAR_DAY15_ID,
        startDay: 15,
        endDay: Infinity, // Continues indefinitely - highest variant (FLYING_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.16,
        chancePerDay: 0.015,
        maxChance: 0.42,
        baseMaxCount: 3,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 5,
        delayTicks: 340,
        spreadRadius: 32
    },
    {
        id: MINING_BEAR_ID,
        startDay: 15,
        endDay: Infinity, // Continues indefinitely - highest variant (MINING_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.14,
        chancePerDay: 0.015,
        maxChance: 0.38,
        baseMaxCount: 2,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 4,
        delayTicks: 420,
        spreadRadius: 26
    },
    {
        id: BUFF_BEAR_ID,
        startDay: 13, // Swapped: Now starts on day 13 (was day 8, where flying bears used to start)
        endDay: Infinity, // Continues indefinitely - highest variant (BUFF_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.020, // Reduced from 0.032 (37.5% reduction)
        chancePerDay: 0.0015, // Reduced from 0.0025 (40% reduction)
        maxChance: 0.04, // Reduced from 0.06 (33% reduction)
        baseMaxCount: 1,
        maxCountCap: 1,
        delayTicks: 1200, // Increased from 900 (slower spawn rate)
        spreadRadius: 30
    },
    {
        id: BUFF_BEAR_DAY13_ID,
        startDay: 20, // Adjusted: Now starts on day 20 (was day 13, since buff_bear now takes that slot)
        endDay: Infinity, // Adjusted: Continues indefinitely (was day 19)
        baseChance: 0.018, // Reduced from 0.028 (36% reduction)
        chancePerDay: 0.0012, // Reduced from 0.002 (40% reduction)
        maxChance: 0.05, // Reduced from 0.07 (29% reduction)
        baseMaxCount: 1,
        maxCountCap: 2,
        delayTicks: 1500, // Increased from 1200 (slower spawn rate)
        spreadRadius: 32
    },
    {
        id: DAY20_BEAR_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.58, // Increased from 0.52
        chancePerDay: 0.028, // Increased from 0.025
        maxChance: 0.88, // Increased from 0.82
        baseMaxCount: 8, // Increased from 5
        maxCountStep: 2, // Increased from 1 - grows faster
        maxCountStepDays: 2, // Reduced from 3 - grows more frequently
        maxCountCap: 25, // Increased from 8 - much higher cap
        delayTicks: 340,
        spreadRadius: 28,
        lateRamp: {
            tierSpan: 5,
            chanceStep: 0.08,
            maxChance: 0.98, // Increased from 0.95
            capStep: 2, // Increased from 1 - cap grows faster
            capBonusMax: 5, // Increased from 3 - can grow more
            maxCountCap: 35 // Increased from 11 - huge late-game cap
        }
    },
    {
        id: INFECTED_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.38, // Increased from 0.32
        chancePerDay: 0.025, // Increased from 0.022
        maxChance: 0.72, // Increased from 0.62
        baseMaxCount: 7, // Increased from 4
        maxCountStep: 2, // Increased from 1 - grows faster
        maxCountStepDays: 2, // Reduced from 3 - grows more frequently
        maxCountCap: 20, // Increased from 7 - much higher cap
        delayTicks: 360,
        spreadRadius: 30,
        lateRamp: {
            tierSpan: 5,
            chanceStep: 0.06,
            maxChance: 0.88, // Increased from 0.82
            capStep: 2, // Increased from 1 - cap grows faster
            capBonusMax: 4, // Increased from 2 - can grow more
            maxCountCap: 30 // Increased from 9 - huge late-game cap
        }
    },
    {
        id: BUFF_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.022, // Reduced from 0.035 (37% reduction)
        chancePerDay: 0.001, // Reduced from 0.0015 (33% reduction)
        maxChance: 0.045, // Reduced from 0.065 (31% reduction)
        baseMaxCount: 1,
        maxCountCap: 2,
        delayTicks: 1800, // Increased from 1400 (slower spawn rate)
        spreadRadius: 34,
        lateRamp: {
            tierSpan: 8,
            chanceStep: 0.015, // Reduced from 0.025 (40% reduction)
            maxChance: 0.06, // Reduced from 0.08 (25% reduction)
            capStep: 0,
            capBonusMax: 0,
            maxCountCap: 2
        }
    },
    {
        id: FLYING_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.20,
        chancePerDay: 0.015,
        maxChance: 0.48,
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 7,
        delayTicks: 320,
        spreadRadius: 34,
        lateRamp: {
            tierSpan: 6,
            chanceStep: 0.03,
            maxChance: 0.60,
            capStep: 1,
            capBonusMax: 3,
            maxCountCap: 12
        }
    },
    {
        id: MINING_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.16,
        chancePerDay: 0.015,
        maxChance: 0.40,
        baseMaxCount: 3,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 6,
        delayTicks: 420,
        spreadRadius: 28,
        lateRamp: {
            tierSpan: 6,
            chanceStep: 0.025,
            maxChance: 0.52,
            capStep: 1,
            capBonusMax: 2,
            maxCountCap: 10
        }
    },
    {
        id: TORPEDO_BEAR_ID,
        startDay: 17,
        endDay: Infinity, // Continues indefinitely - highest variant (TORPEDO_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.03, // Super rare - reduced from 0.10
        chancePerDay: 0.005, // Reduced from 0.018
        maxChance: 0.08, // Reduced from 0.34
        baseMaxCount: 1,
        maxCountStep: 0, // Never increase count
        maxCountStepDays: 999,
        maxCountCap: 1, // Always just 1
        delayTicks: 600, // Reduced spawn rate
        spreadRadius: 38
    },
    {
        id: TORPEDO_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.04, // Super rare - reduced from 0.14
        chancePerDay: 0.006, // Reduced from 0.015
        maxChance: 0.12, // Reduced from 0.42
        baseMaxCount: 1,
        maxCountStep: 0, // Never increase count
        maxCountStepDays: 999,
        maxCountCap: 2, // Max 2 at day 20+
        delayTicks: 550, // Reduced spawn rate
        spreadRadius: 42,
        lateRamp: {
            tierSpan: 6,
            chanceStep: 0.01, // Reduced from 0.03
            maxChance: 0.18, // Reduced from 0.54
            capStep: 0,
            capBonusMax: 0,
            maxCountCap: 2
        }
    }
];

const lastSpawnTickByType = new Map();
let lastProcessedDay = 0;
let sunriseBoostTicks = 0;
const playerTileCache = new Map();
const entityCountCache = new Map(); // Cache entity counts per player
// Dynamic entity count cache TTL based on player count (longer for multiplayer to reduce queries)
function getEntityCountCacheTTL(totalPlayerCount) {
    if (totalPlayerCount === 1) return SCAN_INTERVAL * 4; // 12 seconds for single player
    if (totalPlayerCount === 2) return SCAN_INTERVAL * 6; // 18 seconds for 2 players
    return SCAN_INTERVAL * 8; // 24 seconds for 3+ players
}
const ENTITY_COUNT_CACHE_TTL = SCAN_INTERVAL * 4; // Default (single player) - use getEntityCountCacheTTL() for multiplayer
const MAX_SPAWNS_PER_TICK_PER_PLAYER_BASE = 4; // Base spawn limit (day 2) - increased from 3
const MAX_SPAWNS_PER_TICK_PER_PLAYER_MAX = 16; // Maximum spawn limit (day 20+) - increased from 12
// Global spawn limit to prevent entity explosion with multiple players
const MAX_GLOBAL_SPAWNS_PER_TICK = 24; // Maximum total spawns across all players per tick
let playerRotationIndex = 0;
let lastBlockScanTick = 0; // Track when we last did expensive block scans
// Global spawn counter (resets each tick)
let globalSpawnCount = 0;

// Track barren areas (where full scan found 0 target blocks) to avoid wasteful rescans
// key: "chunkX,chunkZ" -> { lastScanTick, foundBlocks, playerPositions: Set<"x,z"> }
// Store player positions that were in this chunk when marked barren, so we can clear if player moves
const barrenAreaCache = new Map();
const BARREN_AREA_COOLDOWN = SCAN_INTERVAL * 3; // 9 seconds before retrying barren area (reduced from 15)

// Cache spawn attempt results per tile to prevent repeated failed attempts
// key: "x,y,z" -> { lastAttemptTick, success }
const spawnAttemptCache = new Map();
const SPAWN_ATTEMPT_COOLDOWN = 5; // Skip tile for 5 ticks if it failed recently

// Progressive tile discovery: Track which areas have been scanned to spread discovery across multiple ticks
// key: "chunkX,chunkZ" -> { scanCycle: 0-3, lastScanTick }
const progressiveScanCache = new Map();

// Progressive block scanning: Store partial scan state to spread block queries across multiple ticks
// key: "playerId,dimensionId" -> { x, z, yIndex, candidates, blockQueryCount, queryLimit, xStart, xEnd, zStart, zEnd, yScanOrder, lastTick }
const progressiveBlockScanCache = new Map();
const PROGRESSIVE_SCAN_TIMEOUT = SCAN_INTERVAL * 2; // Clear stale scans after 6 seconds
const BLOCKS_PER_TICK_BUDGET = {
    1: 2000,  // Single player: 2000 blocks per tick
    2: 1500,  // 2 players: 1500 blocks per tick
    3: 1000,  // 3 players: 1000 blocks per tick
    4: 500    // 4+ players: 500 blocks per tick (aggressive)
};
const PROGRESSIVE_SCAN_CYCLES = 4; // Spread discovery across 4 scan cycles

// Weather detection cache (dimension -> weather state)
const weatherCache = new Map(); // Map<dimensionId, {weather: string, tick: number}>
const WEATHER_CACHE_TTL = 200; // Check weather every 10 seconds (200 ticks)
const WEATHER_MULTIPLIERS = {
    clear: 1.0,        // Normal spawns
    rain: 0.7,         // 30% reduction
    snow: 0.7,         // 30% reduction
    thunder: 1.0       // No reduction (thunderstorms don't reduce spawns)
};

/**
 * Get weather multiplier for a dimension
 * Uses API-based detection or event subscriptions to track weather state
 * @param {Dimension} dimension The dimension to check
 * @returns {number} Weather multiplier (0.7 for rain/snow, 1.0 for clear/thunder)
 */
function getWeatherMultiplier(dimension) {
    try {
        if (!dimension) return 1.0;
        
        const dimId = dimension.id;
        if (!dimId) return 1.0;
        
        const cached = weatherCache.get(dimId);
        const currentTick = system.currentTick;
        
        // Return cached value if still valid
        if (cached && (currentTick - cached.tick) < WEATHER_CACHE_TTL) {
            return WEATHER_MULTIPLIERS[cached.weather] || 1.0;
        }
        
        // Default to clear weather if not cached (will be updated by updateWeatherCache)
        if (!cached) {
            weatherCache.set(dimId, { weather: 'clear', tick: currentTick });
            return 1.0;
        }
        
        return WEATHER_MULTIPLIERS[cached.weather] || 1.0;
    } catch (error) {
        // On error, default to no weather effect
        return 1.0;
    }
}

// Weather detection method: tracks which method is available and working
let weatherDetectionMethod = null; // Will be set to 'api', 'event', or 'none'
let weatherEventSubscription = null; // Store event subscription if using events

/**
 * Update weather cache for a dimension using available API methods
 * Tries dimension/world properties first, then falls back to event-based tracking
 * @param {Dimension} dimension The dimension to check
 */
function updateWeatherCache(dimension) {
    if (!dimension) return;
    const dimId = dimension.id;
    if (!dimId) return;
    
    try {
        const currentTick = system.currentTick;
        const cached = weatherCache.get(dimId);
        
        // Only update if cache is stale
        if (cached && (currentTick - cached.tick) < WEATHER_CACHE_TTL) {
            return; // Cache still valid
        }
        
        // Determine detection method on first call (feature detection)
        if (weatherDetectionMethod === null) {
            weatherDetectionMethod = detectWeatherAPI();
        }
        
        let weather = 'clear'; // Default
        
        // Try API-based detection first
        if (weatherDetectionMethod === 'api') {
            weather = detectWeatherFromAPI(dimension);
        }
        // Event-based detection is handled by event subscription - events update cache directly
        // If method is 'event', cache will be updated by events; we default to 'clear' until event fires
        // If method is 'none', always default to 'clear' (effectively disables weather effects)
        
        // Update cache with detected weather (always set both tick and weather for consistency)
        weatherCache.set(dimId, { weather: weather, tick: currentTick });
    } catch (error) {
        // On error, keep existing cache or set to clear
        const currentTick = system.currentTick;
        if (!weatherCache.has(dimId)) {
            weatherCache.set(dimId, { weather: 'clear', tick: currentTick });
        }
    }
}

/**
 * Detect which weather API method is available
 * @returns {string} 'api', 'event', or 'none'
 */
function detectWeatherAPI() {
    try {
        // Try dimension-level properties first
        const testDim = world.getDimension("overworld");
        if (testDim) {
            // Check for dimension weather properties (if they exist in this API version)
            if (typeof testDim.isRaining === 'function' || typeof testDim.isRaining === 'boolean') {
                return 'api';
            }
            if (typeof testDim.rainLevel !== 'undefined' || typeof testDim.lightningLevel !== 'undefined') {
                return 'api';
            }
        }
        
        // Try world-level weather component
        try {
            const weatherComp = world.getComponent("minecraft:weather");
            if (weatherComp && (typeof weatherComp.rain_level !== 'undefined' || typeof weatherComp.lightning_level !== 'undefined')) {
                return 'api';
            }
        } catch (e) {
            // Component doesn't exist or not accessible
        }
        
        // Try event subscription
        if (typeof world.afterEvents !== 'undefined') {
            try {
                // Check if weatherChanged event exists
                if (world.afterEvents.weatherChanged) {
                    if (setupWeatherEventSubscription()) {
                        return 'event';
                    }
                    // Setup failed, fall through to return 'none'
                }
            } catch (e) {
                // Event doesn't exist
            }
        }
        
        // No weather API available
        return 'none';
    } catch (error) {
        return 'none';
    }
}

/**
 * Detect weather from API properties
 * @param {Dimension} dimension The dimension to check
 * @returns {string} Weather state: 'clear', 'rain', 'thunder', or 'snow'
 */
function detectWeatherFromAPI(dimension) {
    try {
        let rainLevel = 0;
        let lightningLevel = 0;
        
        // Try dimension-level properties (check for function or boolean property)
        if (typeof dimension.isRaining === 'function') {
            const isRaining = dimension.isRaining();
            const isThundering = typeof dimension.isThundering === 'function' ? dimension.isThundering() : false;
            if (isThundering) return 'thunder';
            if (isRaining) {
                // Check if in cold biome for snow (simplified: check dimension ID, overworld might have snow)
                // For now, treat all rain as rain (snow detection would require biome checking)
                return 'rain';
            }
            return 'clear';
        } else if (typeof dimension.isRaining === 'boolean') {
            // Handle boolean property case
            const isRaining = dimension.isRaining;
            const isThundering = typeof dimension.isThundering === 'boolean' ? dimension.isThundering : false;
            if (isThundering) return 'thunder';
            if (isRaining) return 'rain';
            return 'clear';
        }
        
        if (typeof dimension.rainLevel !== 'undefined') {
            rainLevel = dimension.rainLevel;
        }
        if (typeof dimension.lightningLevel !== 'undefined') {
            lightningLevel = dimension.lightningLevel;
        }
        
        // Try world-level weather component
        if (rainLevel === 0 && lightningLevel === 0) {
            try {
                const weatherComp = world.getComponent("minecraft:weather");
                if (weatherComp) {
                    if (typeof weatherComp.rain_level !== 'undefined') {
                        rainLevel = weatherComp.rain_level;
                    }
                    if (typeof weatherComp.lightning_level !== 'undefined') {
                        lightningLevel = weatherComp.lightning_level;
                    }
                }
            } catch (e) {
                // Component not accessible
            }
        }
        
        // Determine weather state from levels
        if (lightningLevel > 0) {
            return 'thunder';
        } else if (rainLevel > 0) {
            // Note: Snow detection would require biome checking, defaulting to rain
            return 'rain';
        }
        
        return 'clear';
    } catch (error) {
        return 'clear';
    }
}

/**
 * Setup event subscription for weather changes (Option B - Fallback)
 * This maintains weather state via events when direct API access isn't available
 * @returns {boolean} true if subscription succeeded, false otherwise
 */
function setupWeatherEventSubscription() {
    try {
        if (weatherEventSubscription !== null) {
            return true; // Already subscribed
        }
        
        if (typeof world.afterEvents !== 'undefined' && world.afterEvents.weatherChanged) {
            weatherEventSubscription = world.afterEvents.weatherChanged.subscribe((event) => {
                try {
                    const dimension = event.dimension;
                    if (!dimension) return;
                    
                    const dimId = dimension.id;
                    const currentTick = system.currentTick;
                    let weather = 'clear';
                    
                    // Parse event data to determine weather
                    if (event.lightning !== undefined && event.lightning) {
                        weather = 'thunder';
                    } else if (event.raining !== undefined && event.raining) {
                        weather = 'rain';
                    } else {
                        weather = 'clear';
                    }
                    
                    // Update cache with event data
                    weatherCache.set(dimId, { weather: weather, tick: currentTick });
                } catch (error) {
                    // Silently handle errors
                }
            });
            return true; // Subscription succeeded
        }
        return false; // Event not available
    } catch (error) {
        // Event subscription failed, caller will decide how to handle
        return false;
    }
}

// Player grouping system for overlapping spawn rectangles
const PLAYER_GROUP_OVERLAP_DISTANCE = MAX_SPAWN_DISTANCE * 2; // Players within this distance have overlapping rectangles (96 blocks)
const PLAYER_GROUP_OVERLAP_DISTANCE_SQ = PLAYER_GROUP_OVERLAP_DISTANCE * PLAYER_GROUP_OVERLAP_DISTANCE;
// Tight group: Players within 32 blocks are processed as a single unit (most efficient)
const TIGHT_GROUP_DISTANCE = 32; // Players within this distance are "tight group"
const TIGHT_GROUP_DISTANCE_SQ = TIGHT_GROUP_DISTANCE * TIGHT_GROUP_DISTANCE;
const playerGroups = new Map(); // playerId -> groupId
const groupCaches = new Map(); // groupId -> { tiles, density, center, tick, players: Set<playerId>, dimension }
let nextGroupId = 1;
// Track spawn attempt rotation for tight groups: groupId -> { currentPlayerIndex, lastAttemptTick }
const tightGroupAttemptRotation = new Map();
const scannedGroupsThisTick = new Set(); // Track which groups have been scanned this tick (to avoid duplicate logs)
const loggedDimensionsThisTick = new Set(); // Track which dimensions have been logged this tick
const loggedSelectedGroupsThisTick = new Set(); // Track which groups have been logged as "selected" this tick
const loggedMaintainedGroupsThisTick = new Set(); // Track which groups have been logged as "maintained" this tick

// Calculate dynamic spawn limit based on current day and player count
// When multiple players are present, reduce per-player limits to prevent total entity explosion
function getMaxSpawnsPerTick(day, totalPlayerCount = 1) {
    let baseLimit;
    if (day < 2) baseLimit = 2;
    else if (day < 4) baseLimit = 3; // Day 2-3: 3 spawns
    else if (day < 8) baseLimit = 4; // Day 4-7: 4 spawns
    else if (day < 13) baseLimit = 6; // Day 8-12: 6 spawns
    else if (day < 20) baseLimit = 8; // Day 13-19: 8 spawns
    else {
        // Day 20+: Scale from 10 to 16 based on how far past day 20
        baseLimit = Math.min(MAX_SPAWNS_PER_TICK_PER_PLAYER_MAX, 10 + Math.floor((day - 20) / 5));
    }
    
    // Reduce per-player limit when multiple players are present
    // This prevents total entity count from exploding
    if (totalPlayerCount > 1) {
        // Scale down: 2 players = 0.7x, 3 players = 0.5x, 4+ players = 0.4x
        const multiplier = totalPlayerCount === 2 ? 0.7 : totalPlayerCount === 3 ? 0.5 : 0.4;
        baseLimit = Math.max(2, Math.floor(baseLimit * multiplier));
    }
    
    return baseLimit;
}

// Spatial chunking system for dusted_dirt cache
// Divides world into chunks and only uses cache for active chunks (player is nearby)
// Inactive chunks are kept but not used, allowing cache to persist when player returns
const CHUNK_SIZE = 128; // World divided into 128x128 block chunks
const CHUNK_ACTIVATION_RADIUS = 1; // Activate chunks within 1 chunk of player (3x3 grid = 9 chunks, 384 block radius)
const CHUNK_TRIM_AGE = 72000; // Trim chunks not visited in 1 hour (72000 ticks = 1 hour)
const CHUNK_TRIM_INTERVAL = SCAN_INTERVAL * 20; // Check for chunks to trim every 20 scan intervals (~100 seconds)

// ============================================================================
// SECTION 9: CACHE SYSTEM
// ============================================================================
// Spatial chunking cache for dusted_dirt and snow_layer blocks
// ============================================================================

// Global cache for dusted_dirt block positions
// key: "x,y,z" -> { x, y, z, tick, dimension, chunkKey }
const dustedDirtCache = new Map();
// Track active chunks (chunks player is currently near)
// key: "chunkX,chunkZ" -> lastVisitTick
const activeChunks = new Map();
// Track all chunks and their last visit time
// key: "chunkX,chunkZ" -> lastVisitTick
const chunkLastVisit = new Map();
// Track chunk age (when chunk was first loaded/visited)
// key: "chunkX,chunkZ" -> firstVisitTick
const chunkFirstVisit = new Map();
const CHUNK_LOAD_DELAY = 5; // Wait 5 ticks (0.25 seconds) before doing full scan in new chunk
let lastChunkTrimTick = 0;

// Progressive spawn rate: Track when area was first entered to gradually increase spawn rate
// key: "chunkX,chunkZ" -> firstEnteredTick
const areaFirstEntered = new Map();
const PROGRESSIVE_SPAWN_RAMP_START = 5 * 20; // 5 seconds (100 ticks) - start ramping after this
const PROGRESSIVE_SPAWN_RAMP_DURATION = 10 * 20; // 10 seconds (200 ticks) - ramp duration
const PROGRESSIVE_SPAWN_INITIAL_RATE = 0.5; // Start at 50% spawn rate

// Chunk scan queue: Stagger scans across multiple ticks to prevent simultaneous scans
// key: "chunkX,chunkZ" -> { scheduledTick, playerIds: Set, scanInProgress, priority, playerPositions: Map<playerId, {x, z, chunkKey}> }
const chunkScanQueue = new Map();
const CHUNK_SCAN_STAGGER_INTERVAL = 20; // Spread scans 20 ticks apart (1 second)

const DISCOVERY_RADIUS = 75; // Scan radius for discovering all dusted_dirt/snow_layer blocks (beyond spawn range)
const CACHE_CHECK_RADIUS = 100; // Only check cached blocks within 100 blocks of player (performance optimization)
const DUSTED_DIRT_CACHE_TTL = SCAN_INTERVAL * 30; // Cache entries expire after 30 scan intervals (90 seconds)
const CACHE_VALIDATION_INTERVAL = SCAN_INTERVAL * 3; // Validate cache every 3 scan intervals (~15 seconds)
const CACHE_VALIDATION_SAMPLE_SIZE = 50; // Validate up to 50 blocks per validation cycle
let lastCacheValidationTick = 0;

// Helper: Get chunk key from world coordinates
function getChunkKey(x, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    return `${chunkX},${chunkZ}`;
}

// Helper: Get all chunk keys within activation radius of a position
function getActiveChunkKeys(centerX, centerZ) {
    const centerChunkX = Math.floor(centerX / CHUNK_SIZE);
    const centerChunkZ = Math.floor(centerZ / CHUNK_SIZE);
    const activeKeys = new Set();
    
    for (let dx = -CHUNK_ACTIVATION_RADIUS; dx <= CHUNK_ACTIVATION_RADIUS; dx++) {
        for (let dz = -CHUNK_ACTIVATION_RADIUS; dz <= CHUNK_ACTIVATION_RADIUS; dz++) {
            const chunkX = centerChunkX + dx;
            const chunkZ = centerChunkZ + dz;
            const key = `${chunkX},${chunkZ}`;
            activeKeys.add(key);
        }
    }
    
    return activeKeys;
}

// Update active chunks based on player position
function updateActiveChunks(centerX, centerZ) {
    const now = system.currentTick;
    const newActiveKeys = getActiveChunkKeys(centerX, centerZ);
    
    // Update last visit time for newly active chunks
    for (const key of newActiveKeys) {
        if (!activeChunks.has(key)) {
            // Player entered this chunk - reactivate it and record first visit
            activeChunks.set(key, now);
            chunkLastVisit.set(key, now);
            if (!chunkFirstVisit.has(key)) {
                chunkFirstVisit.set(key, now); // Record when chunk was first visited
            }
        } else {
            // Update last visit time
            chunkLastVisit.set(key, now);
        }
    }
    
    // Deactivate chunks that are no longer near player
    for (const [key] of activeChunks) {
        if (!newActiveKeys.has(key)) {
            activeChunks.delete(key);
            // Keep in chunkLastVisit for future reactivation
        }
    }
}

// Trim old chunks that haven't been visited in a long time
function trimOldChunks() {
    const now = system.currentTick;
    if (now - lastChunkTrimTick < CHUNK_TRIM_INTERVAL) {
        return; // Don't trim too frequently
    }
    lastChunkTrimTick = now;
    
    const chunksToRemove = [];
    for (const [chunkKey, lastVisit] of chunkLastVisit.entries()) {
        if (now - lastVisit > CHUNK_TRIM_AGE) {
            chunksToRemove.push(chunkKey);
        }
    }
    
    if (chunksToRemove.length === 0) return;
    
    // Remove cache entries for old chunks
    let removedCount = 0;
    for (const [key, value] of dustedDirtCache.entries()) {
        if (value.chunkKey && chunksToRemove.includes(value.chunkKey)) {
            dustedDirtCache.delete(key);
            removedCount++;
        }
    }
    
    // Remove chunk tracking entries
    for (const chunkKey of chunksToRemove) {
        chunkLastVisit.delete(chunkKey);
        activeChunks.delete(chunkKey);
    }
    
    if (isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Trimmed ${chunksToRemove.length} old chunks, removed ${removedCount} cache entries`);
    }
}

// Export functions for main.js to register dusted_dirt blocks
export function registerDustedDirtBlock(x, y, z, dimension = null) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    const chunkKey = getChunkKey(x, z);
    
    // Defensively validate dimension before accessing .id property
    const dimensionId = dimension && typeof dimension.id !== 'undefined' ? dimension.id : null;
    
    // Warn if dimension was provided but is invalid (not null/undefined, but missing id)
    if (dimension !== null && dimension !== undefined && dimensionId === null) {
        if (isDebugEnabled('spawn', 'general') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Invalid dimension provided to registerDustedDirtBlock at (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}): dimension is not null but missing id property`, {
                dimension: dimension,
                dimensionType: typeof dimension,
                hasId: 'id' in (dimension || {}),
                stack: new Error().stack
            });
        }
    }
    
    const entry = { 
        x: Math.floor(x), 
        y: Math.floor(y),
        z: Math.floor(z), 
        tick: system.currentTick,
        dimension: dimensionId,
        chunkKey: chunkKey
    };
    dustedDirtCache.set(key, entry);
    
    // Track chunk (even if not currently active)
    if (!chunkLastVisit.has(chunkKey)) {
        chunkLastVisit.set(chunkKey, system.currentTick);
    }
    
    // Debug: Log registration if debug enabled
    if (isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'all')) {
        if (dustedDirtCache.size <= 10 || dustedDirtCache.size % 50 === 0) {
            console.warn(`[SPAWN DEBUG] Registered dusted_dirt at (${entry.x}, ${entry.y}, ${entry.z}), cache size: ${dustedDirtCache.size}, chunk: ${chunkKey}, active chunks: ${activeChunks.size}`);
        }
    }
}

export function unregisterDustedDirtBlock(x, y, z) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    dustedDirtCache.delete(key);
}

// Export function to manually test a block position (for debugging)
export function testBlockAtPosition(dimension, x, y, z) {
    try {
        const block = dimension.getBlock({ x, y, z });
        if (!block) {
            console.warn(`[SPAWN DEBUG] Block at (${x}, ${y}, ${z}): null or undefined`);
            return;
        }
        const typeId = block.typeId;
        const dimensionId = dimension.id;
        const isTarget = isValidTargetBlock(typeId, dimensionId);
        console.warn(`[SPAWN DEBUG] Manual test - Block at (${x}, ${y}, ${z}):`);
        console.warn(`[SPAWN DEBUG]   typeId: "${typeId}"`);
        console.warn(`[SPAWN DEBUG]   TARGET_BLOCK: "${TARGET_BLOCK}" or "${TARGET_BLOCK_2}"`);
        console.warn(`[SPAWN DEBUG]   Match: ${isTarget}`);
        if (block.permutation) {
            console.warn(`[SPAWN DEBUG]   permutation.type.id: "${block.permutation.type?.id || 'N/A'}"`);
        }
    } catch (error) {
        console.warn(`[SPAWN DEBUG] Error testing block at (${x}, ${y}, ${z}):`, error);
    }
}

function cleanupDustedDirtCache() {
    // Chunk-based trimming handles cleanup now
    // This function is kept for compatibility but now just trims old chunks
    trimOldChunks();
}

// Validate cached blocks - check if they still exist and are still dusted_dirt
function validateDustedDirtCache(dimension) {
    const now = system.currentTick;
    if (now - lastCacheValidationTick < CACHE_VALIDATION_INTERVAL) {
        return; // Don't validate too frequently
    }
    lastCacheValidationTick = now;
    
    // Get a sample of cached blocks to validate (prioritize older entries from active chunks)
    const entries = Array.from(dustedDirtCache.entries())
        .filter(([key, value]) => {
            // Only validate blocks from active chunks
            if (value.chunkKey && !activeChunks.has(value.chunkKey)) {
                return false;
            }
            // Only validate blocks in the same dimension if dimension is provided
            if (dimension && value.dimension && value.dimension !== dimension.id) {
                return false;
            }
            // Prioritize entries that are not too new and not too old
            const age = now - value.tick;
            return age > SCAN_INTERVAL && age < DUSTED_DIRT_CACHE_TTL;
        })
        .sort((a, b) => a[1].tick - b[1].tick); // Sort by age (oldest first)
    
    // Validate a sample of entries
    const sampleSize = Math.min(CACHE_VALIDATION_SAMPLE_SIZE, entries.length);
    const toRemove = [];
    let validated = 0;
    
    for (let i = 0; i < sampleSize && validated < CACHE_VALIDATION_SAMPLE_SIZE; i++) {
        const [key, value] = entries[i];
        validated++;
        
        try {
            if (!dimension || !value.dimension || value.dimension === dimension.id) {
                const checkDim = dimension || (value.dimension ? world.getDimension(value.dimension) : null);
                if (checkDim) {
                    const block = checkDim.getBlock({ x: value.x, y: value.y, z: value.z });
                    const checkDimId = checkDim.id;
                    if (!block || !isValidTargetBlock(block.typeId, checkDimId)) {
                        // Block no longer exists or changed type, remove from cache
                        toRemove.push(key);
                        debugLog('cache', `Removed invalid cache entry: ${key} (block: ${block?.typeId || 'null'})`);
                    }
                } else if (value.dimension) {
                    // Dimension doesn't exist, remove entry
                    toRemove.push(key);
                    debugLog('cache', `Removed cache entry with invalid dimension: ${key}`);
                }
            }
        } catch (error) {
            // Chunk not loaded or error - don't remove from cache if it's just unloaded
            // Only log if it's a serious error (not chunk not loaded)
            if (error && !error.message?.includes('not loaded') && !error.message?.includes('Chunk')) {
                errorLog(`Error validating cached block ${key}`, error, { x: value.x, y: value.y, z: value.z, dimension: value.dimension });
            }
        }
    }
    
    // Remove invalid entries
    for (const key of toRemove) {
        dustedDirtCache.delete(key);
    }
    
    // Also remove entries where we can't validate (dimension mismatch or missing)
    if (dimension) {
        for (const [key, value] of dustedDirtCache.entries()) {
            if (value.dimension && value.dimension !== dimension.id) {
                // Entry is for a different dimension, skip validation
                continue;
            }
        }
    }
}

function isAir(block) {
    return !block || block.typeId === "minecraft:air" || block.typeId === "minecraft:cave_air" || block.typeId === "minecraft:void_air";
}

function isAirOrWater(block) {
    if (!block) return true;
    const typeId = block.typeId;
    return typeId === "minecraft:air" || 
           typeId === "minecraft:cave_air" || 
           typeId === "minecraft:void_air" ||
           typeId === "minecraft:water" ||
           typeId === "minecraft:flowing_water";
}

function scanAroundDustedDirt(dimension, centerX, centerY, centerZ, seen, candidates, blockQueryCount, limit) {
    // When we find a dusted_dirt or snow_layer block, check nearby blocks (10x10 area) for more patches
    // This helps find clusters of both dusted_dirt and snow_layer blocks without much performance cost
    const scanRadius = 5; // Check 5 blocks in each direction (10x10 area total)
    let localQueries = 0;
    const maxLocalQueries = 100; // Limit local scan queries (10x10 = 100 blocks max)
    
    for (let dx = -scanRadius; dx <= scanRadius && localQueries < maxLocalQueries; dx++) {
        for (let dz = -scanRadius; dz <= scanRadius && localQueries < maxLocalQueries; dz++) {
            if (dx === 0 && dz === 0) continue; // Skip center (already found)
            
            const x = centerX + dx;
            const z = centerZ + dz;
            const key = `${x},${centerY},${z}`;
            
            // Skip if already seen
            if (seen.has(key)) continue;
            
            // Check a few Y levels around the found block
            for (let dy = -1; dy <= 1 && localQueries < maxLocalQueries; dy++) {
                const y = centerY + dy;
                const yKey = `${x},${y},${z}`;
                if (seen.has(yKey)) continue;
                
                try {
                    const block = dimension.getBlock({ x, y, z });
                    localQueries++;
                    if (!block) continue;
                    
                    const dimensionId = dimension.id;
                    if (isValidTargetBlock(block.typeId, dimensionId)) {
                        const blockAbove = dimension.getBlock({ x, y: y + 1, z });
                        localQueries++;
                        if (localQueries < maxLocalQueries) {
                            const blockTwoAbove = dimension.getBlock({ x, y: y + 2, z });
                            localQueries++;
                            if (isAir(blockAbove) && isAir(blockTwoAbove)) {
                                seen.add(yKey);
                                candidates.push({ x, y, z });
                                // Register with dimension for proper cache validation
                                registerDustedDirtBlock(x, y, z, dimension);
                                if (candidates.length >= limit) {
                                    return localQueries; // Early exit if we hit limit
                                }
                            }
                        }
                        break; // Found solid block at this Y, move to next XZ
                    }
                    
                    if (!isAir(block)) {
                        break; // Hit solid non-target block, move to next XZ
                    }
                } catch (error) {
                    // Chunk not loaded - this is normal, just skip
                    if (error && error.message?.includes('not loaded') || error.message?.includes('Chunk')) {
                        // Normal case, skip silently
                    } else {
                        // Unexpected error - log it
                        errorLog(`Error in scanAroundDustedDirt`, error, { x, y, z, dimension: dimension.id });
                    }
                }
            }
        }
    }
    
    return localQueries;
}

// ============================================================================
// SECTION 10: TILE COLLECTION FUNCTIONS
// ============================================================================
// Functions for finding and collecting valid spawn tiles (dusted_dirt, snow_layer, etc.)
// ============================================================================

// Collect tiles for mining bear spawning (includes dusted_dirt AND stone/deepslate in caves)
function collectMiningSpawnTiles(dimension, center, minDistance, maxDistance, limit = MAX_CANDIDATES_PER_SCAN, isSinglePlayer = false, totalPlayerCount = 1, isTightGroup = false) {
    // Reduce candidate limit when multiple players are present (less tiles needed per player)
    let effectiveLimit = limit;
    if (totalPlayerCount > 1) {
        // 2 players: 0.9x, 3 players: 0.8x, 4+ players: 0.7x
        const multiplier = totalPlayerCount === 2 ? 0.9 : totalPlayerCount === 3 ? 0.8 : 0.7;
        effectiveLimit = Math.floor(limit * multiplier);
    }
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const cz = Math.floor(center.z);
    const minSq = minDistance * minDistance;
    const maxSq = maxDistance * maxDistance;
    const candidates = [];
    const seen = new Set();
    
    // Use scaled query limit based on player count (reduces lag with multiple players)
    const queryLimit = getBlockQueryLimit(isSinglePlayer, totalPlayerCount);
    
    // Track total query budget across both phases
    // Allocate 60% for dusted_dirt, 40% for stone/deepslate
    const dustedBudget = Math.floor(queryLimit * 0.6);
    const stoneBudget = Math.floor(queryLimit * 0.4);
    
    // Debug: Log scan start (before initialYRange is defined)
    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        const dimensionId = dimension.id;
        const isNetherOrEnd = dimensionId === "minecraft:nether" || dimensionId === "minecraft:the_end";
        let targetBlocks = `"${TARGET_BLOCK}" and "${TARGET_BLOCK_2}"`;
        if (dimensionId === "minecraft:nether") {
            targetBlocks = NETHER_TARGET_BLOCKS.map(b => `"${b}"`).join(", ");
        } else if (dimensionId === "minecraft:the_end") {
            targetBlocks = `"${END_TARGET_BLOCK}"`;
        }
        console.warn(`[SPAWN DEBUG] Starting tile collection: Center (${cx}, ${cy}, ${cz}), Discovery: 0-${DISCOVERY_RADIUS}, Spawn: ${minDistance}-${maxDistance}, Limit: ${limit}${isSinglePlayer ? ' [SINGLE PLAYER MODE - Enhanced Scanning]' : ''}${isNetherOrEnd ? ' [NETHER/END - Reduced Scanning]' : ''}`);
        console.warn(`[SPAWN DEBUG] Player position: (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}), Dimension: ${dimensionId}`);
        console.warn(`[SPAWN DEBUG] TARGET_BLOCK constants: ${targetBlocks}`);
        console.warn(`[SPAWN DEBUG] Two-phase system: Discovery finds all blocks in 0-${DISCOVERY_RADIUS} range, validation filters to ${minDistance}-${maxDistance} spawn range`);
        // Note: queryLimit is calculated in collectDustedTiles, so we can't show it here
        if (isSinglePlayer && !isNetherOrEnd) {
            console.warn(`[SPAWN DEBUG] Single player detected: Using 2x normal query limit and adaptive Y range for more thorough scanning`);
        }
        if (isNetherOrEnd) {
            const baseLimit = isSinglePlayer ? MAX_BLOCK_QUERIES_SINGLE_PLAYER : MAX_BLOCK_QUERIES_PER_SCAN;
            const netherLimit = Math.floor(baseLimit * 0.75);
            console.warn(`[SPAWN DEBUG] Nether/End detected: Using ${netherLimit} queries (75% of ${baseLimit}) - blocks are abundant, reduced scanning to prevent lag`);
        }
    }
    
    // First, get dusted_dirt tiles (reuse existing function)
    // Note: collectDustedTiles has its own internal query budget management
    // We can't directly track its usage, but we allocate the budget here for clarity
    const dustedTiles = collectDustedTiles(dimension, center, minDistance, maxDistance, Math.floor(limit * 0.6), isSinglePlayer, totalPlayerCount, isTightGroup); // 60% from dusted_dirt
    
    // Debug: Log dusted tiles found
    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Found ${dustedTiles.length} dusted_dirt tiles`);
    }
    candidates.push(...dustedTiles);
    dustedTiles.forEach(t => seen.add(`${t.x},${t.y},${t.z}`));
    
    // Then, collect stone/deepslate blocks in caves (40% from stone/deepslate)
    // Only collect if we need more tiles and have budget remaining
    let blockQueryCount = 0;
    if (candidates.length < limit && blockQueryCount < stoneBudget) {
        const xStart = cx - maxDistance;
        const xEnd = cx + maxDistance;
        const zStart = cz - maxDistance;
        const zEnd = cz + maxDistance;
        const yStart = Math.min(cy + 10, 320);
        const yEnd = Math.max(cy - 10, -64);
        
        // Use roofProbe from MINING_SPAWN_SETTINGS for consistency
        // Use the maximum roofProbe value (7 from day20) to be consistent with the most permissive setting
        const maxRoofProbe = Math.max(...Object.values(MINING_SPAWN_SETTINGS).map(s => s.roofProbe));
        const roofProbeRange = maxRoofProbe; // Check up to roofProbe blocks above for roof detection
        
        for (let x = xStart; x <= xEnd && candidates.length < limit && blockQueryCount < stoneBudget; x++) {
            for (let z = zStart; z <= zEnd && candidates.length < limit && blockQueryCount < stoneBudget; z++) {
                const dx = x + 0.5 - center.x;
                const dz = z + 0.5 - center.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < minSq || distSq > maxSq) continue;
                
                // Check Y levels from top to bottom
                for (let y = yStart; y >= yEnd && candidates.length < limit && blockQueryCount < stoneBudget; y--) {
                    if (y < -64 || y > 320) continue;
                    
                    const key = `${x},${y},${z}`;
                    if (seen.has(key)) continue;
                    
                    let block;
                    try {
                        block = dimension.getBlock({ x, y, z });
                        blockQueryCount++;
                    } catch {
                        continue;
                    }
                    if (!block) continue;
                    
                    // Check if it's a valid mining spawn block (stone/deepslate)
                    if (isValidMiningSpawnBlock(block.typeId)) {
                        // Check if it's in a cave (has roof above)
                        const blockAbove = dimension.getBlock({ x, y: y + 1, z });
                        blockQueryCount++;
                        if (blockQueryCount < stoneBudget) {
                            const blockTwoAbove = dimension.getBlock({ x, y: y + 2, z });
                            blockQueryCount++;
                            if (isAirOrWater(blockAbove) && isAirOrWater(blockTwoAbove)) {
                                // Check for roof (cave requirement) - check up to roofProbeRange blocks
                                let hasRoof = false;
                                const roofCheckStart = y + 3;
                                const roofCheckEnd = Math.min(y + 3 + roofProbeRange - 1, 320);
                                for (let checkY = roofCheckStart; checkY <= roofCheckEnd && blockQueryCount < stoneBudget; checkY++) {
                                    try {
                                        const roofBlock = dimension.getBlock({ x, y: checkY, z });
                                        blockQueryCount++;
                                        if (roofBlock && !isAir(roofBlock)) {
                                            hasRoof = true;
                                            break;
                                        }
                                    } catch {
                                        break;
                                    }
                                }
                                
                                // Only add if it has a roof (it's in a cave)
                                if (hasRoof) {
                                    seen.add(key);
                                    candidates.push({ x, y, z });
                                }
                            }
                        }
                        break; // Found solid block, move to next XZ
                    }
                    
                    if (!isAir(block)) {
                        break; // Hit solid non-target block, move to next XZ
                    }
                }
            }
        }
    }
    
    return candidates.slice(0, limit);
}

function collectDustedTiles(dimension, center, minDistance, maxDistance, limit = MAX_CANDIDATES_PER_SCAN, isSinglePlayer = false, totalPlayerCount = 1, isTightGroup = false) {
    // Reduce candidate limit when multiple players are present (less tiles needed per player)
    let effectiveLimit = limit;
    if (totalPlayerCount > 1) {
        if (isTightGroup) {
            // Tight group: More aggressive reduction (0.5x instead of 0.7x for 4+ players)
            effectiveLimit = Math.floor(limit * 0.5);
        } else {
            // Spread group: Normal reduction
            // 2 players: 0.9x, 3 players: 0.8x, 4+ players: 0.7x
            const multiplier = totalPlayerCount === 2 ? 0.9 : totalPlayerCount === 3 ? 0.8 : 0.7;
            effectiveLimit = Math.floor(limit * multiplier);
        }
    }
    
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const cz = Math.floor(center.z);
    const minSq = minDistance * minDistance;
    let maxSq = maxDistance * maxDistance; // Use let so we can update it for new chunks
    let candidates = []; // Use let instead of const to allow filtering for new chunks
    const seen = new Set();
    let blockQueryCount = 0;
    
    const dimensionId = dimension.id;
    const isNetherOrEnd = dimensionId === "minecraft:nether" || dimensionId === "minecraft:the_end";
    
    // Use scaled query limit based on player count (reduces lag with multiple players)
    // Nether/End: Use REDUCED limits since blocks are abundant (netherrack/end_stone everywhere)
    // We don't need aggressive scanning - blocks are easy to find, but we need to limit performance impact
    let baseQueryLimit = getBlockQueryLimit(isSinglePlayer, totalPlayerCount);
    if (isTightGroup) {
        // Tight group: More aggressive reduction (0.3x instead of 0.2x for 4+ players)
        baseQueryLimit = Math.floor(baseQueryLimit * 0.3);
    }
    let queryLimit;
    if (isNetherOrEnd) {
        // Nether/End: Use 75% of scaled limits (reduced from 150% to prevent lag)
        // Blocks are abundant, so we can find enough with less scanning
        queryLimit = Math.floor(baseQueryLimit * 0.75);
    } else {
        queryLimit = baseQueryLimit;
    }
    
    // Use effective limit (scaled for multiplayer)
    limit = effectiveLimit;

    // Update active chunks based on player position
    updateActiveChunks(center.x, center.z);
    
    // Trim old chunks periodically
    trimOldChunks();
    
    // Validate cache periodically
    validateDustedDirtCache(dimension);

    // First, check cached dusted_dirt positions (only from active chunks)
    const cachedTiles = [];
    const now = system.currentTick;
    // Cache validation: Use DISCOVERY_RADIUS for cache lookups (check larger area)
    // But still filter by spawn range (15-45 blocks) when adding to candidates
    const cacheMaxDistance = maxDistance; // Use maxDistance (45 blocks) for spawn range filtering
    const cacheMaxSq = cacheMaxDistance * cacheMaxDistance;
    // Use DISCOVERY_RADIUS for cache check radius (larger area to find cached blocks)
    const cacheCheckRadius = Math.max(CACHE_CHECK_RADIUS, DISCOVERY_RADIUS); // Use larger of the two
    const cacheCheckRadiusSq = cacheCheckRadius * cacheCheckRadius;
    
    // Debug: Log cache size
    if (isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'all')) {
        const totalCacheSize = dustedDirtCache.size;
        const dimensionCacheSize = Array.from(dustedDirtCache.values()).filter(v => !v.dimension || v.dimension === dimensionId).length;
        const activeCacheSize = Array.from(dustedDirtCache.values()).filter(v => v.chunkKey && activeChunks.has(v.chunkKey)).length;
        console.warn(`[SPAWN DEBUG] Cache check: Total cache size: ${totalCacheSize}, Dimension cache: ${dimensionCacheSize}, Active chunks: ${activeChunks.size}, Active cache: ${activeCacheSize}, Center: (${cx}, ${cy}, ${cz})`);
    }
    
    let cacheChecked = 0;
    let cacheExpired = 0;
    let cacheWrongDimension = 0;
    let cacheTooFar = 0;
    let cacheOutsideRange = 0;
    let cacheTooFarVertically = 0;
    let cacheValidated = 0;
    
    for (const [key, value] of dustedDirtCache.entries()) {
        cacheChecked++;
        
        // Only check cache entries from active chunks (chunks player is currently near)
        // Legacy entries without chunkKey are still checked (for backwards compatibility)
        if (value.chunkKey && !activeChunks.has(value.chunkKey)) {
            continue; // Skip inactive chunks - they're saved but not used
        }
        
        // For legacy entries without chunkKey, assign one now
        if (!value.chunkKey) {
            value.chunkKey = getChunkKey(value.x, value.z);
            // Don't activate the chunk automatically - let updateActiveChunks handle it
        }
        
        // Skip entries from different dimensions
        if (value.dimension && value.dimension !== dimensionId) {
            cacheWrongDimension++;
            continue;
        }
        
        // Quick distance check: Skip cached blocks that are too far from player
        // This prevents checking thousands of cached blocks on the other side of the world
        const dx = value.x + 0.5 - center.x;
        const dz = value.z + 0.5 - center.z;
        const dy = value.y - center.y;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);
        
        // Skip if too far from player (performance optimization)
        if (distSq > cacheCheckRadiusSq) {
            cacheTooFar++;
            if (isDebugEnabled('spawn', 'distance') || isDebugEnabled('spawn', 'all')) {
                if (cacheTooFar <= 3) { // Only log first few to avoid spam
                    console.warn(`[SPAWN DEBUG] Cache entry ${key}: Too far from center (dist: ${dist.toFixed(1)}, max: ${Math.sqrt(cacheCheckRadiusSq).toFixed(1)})`);
                }
            }
            continue;
        }
        
        // Filter: Only use cached blocks within valid spawn distance range
        // Skip blocks that are too close (< minDistance) or too far (> maxDistance)
        // Note: maxDistance may be reduced for new chunks (20-30 blocks instead of 45)
        if (distSq < minSq || distSq > cacheMaxSq) {
            cacheOutsideRange++;
            if (isDebugEnabled('spawn', 'distance') || isDebugEnabled('spawn', 'all')) {
                if (cacheOutsideRange <= 3) { // Only log first few to avoid spam
                    console.warn(`[SPAWN DEBUG] Cache entry ${key}: Outside spawn range (dist: ${dist.toFixed(1)}, range: ${minDistance}-${cacheMaxDistance})`);
                }
            }
            continue; // Outside valid range
        }
        if (Math.abs(dy) > 30) {
            cacheTooFarVertically++;
            continue; // Too far vertically
        }
        
        // Verify block still exists and is valid spawn location
        try {
            const block = dimension.getBlock({ x: value.x, y: value.y, z: value.z });
            blockQueryCount++;
            if (block && isValidTargetBlock(block.typeId, dimensionId)) {
                const blockAbove = dimension.getBlock({ x: value.x, y: value.y + 1, z: value.z });
                blockQueryCount++;
                if (blockQueryCount < queryLimit) {
                    const blockTwoAbove = dimension.getBlock({ x: value.x, y: value.y + 2, z: value.z });
                    blockQueryCount++;
                    if (blockQueryCount < queryLimit) {
                        if (isAirOrWater(blockAbove) && isAirOrWater(blockTwoAbove)) {
                            const tileKey = `${value.x},${value.y},${value.z}`;
                            if (!seen.has(tileKey)) {
                                seen.add(tileKey);
                                cachedTiles.push({ x: value.x, y: value.y, z: value.z });
                                cacheValidated++;
                                if (isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'all')) {
                                    if (cacheValidated <= 5) { // Only log first few to avoid spam
                                        console.warn(`[SPAWN DEBUG] Cache entry ${key}: Valid tile at (${value.x}, ${value.y}, ${value.z}), dist: ${dist.toFixed(1)}`);
                                    }
                                }
                            }
                        } else {
                            if (isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'all')) {
                                console.warn(`[SPAWN DEBUG] Cache entry ${key}: No air/water above (${value.x}, ${value.y}, ${value.z}), blockAbove: ${blockAbove?.typeId || 'null'}, blockTwoAbove: ${blockTwoAbove?.typeId || 'null'}`);
                            }
                        }
                    }
                }
            } else if (!block || !isValidTargetBlock(block.typeId, dimensionId)) {
                // Block no longer exists or changed, remove from cache
                unregisterDustedDirtBlock(value.x, value.y, value.z);
                debugLog('cache', `Removed invalid block from cache: ${value.x},${value.y},${value.z} (type: ${block?.typeId || 'null'})`);
                if (isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'all')) {
                    let expectedBlocks = TARGET_BLOCK;
                    if (dimensionId === "minecraft:nether") {
                        expectedBlocks = NETHER_TARGET_BLOCKS.join(" or ");
                    } else if (dimensionId === "minecraft:the_end") {
                        expectedBlocks = END_TARGET_BLOCK;
                    }
                    console.warn(`[SPAWN DEBUG] Cache entry ${key}: Block changed or missing (expected: ${expectedBlocks}, got: ${block?.typeId || 'null'})`);
                }
            }
        } catch (error) {
            // Chunk not loaded or error, skip (but don't remove from cache - might just be unloaded)
            // Only log if it's a serious error (not chunk not loaded)
            if (error && !error.message?.includes('not loaded') && !error.message?.includes('Chunk')) {
                errorLog(`Error checking cached block`, error, { x: value.x, y: value.y, z: value.z });
            }
        }
    }
    
    // Debug: Log cache statistics (always show if cache debug enabled, even if cache is empty)
    if (isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Cache stats: Checked: ${cacheChecked}, Expired: ${cacheExpired}, Wrong dimension: ${cacheWrongDimension}, Too far: ${cacheTooFar}, Outside range: ${cacheOutsideRange}, Too far vertically: ${cacheTooFarVertically}, Valid tiles: ${cacheValidated}/${cachedTiles.length}`);
    }
    
    // Debug: Log validation info even if cache is empty (to show validation debug is working)
    if ((isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'all')) && cacheChecked === 0) {
        console.warn(`[SPAWN DEBUG] Validation: Cache is empty (${dustedDirtCache.size} total entries), no blocks to validate`);
    }
    
    // Debug: Log distance info even if cache is empty (to show distance debug is working)
    if ((isDebugEnabled('spawn', 'distance') || isDebugEnabled('spawn', 'all')) && cacheChecked === 0) {
        console.warn(`[SPAWN DEBUG] Distance: No cache entries to check distances for (cache size: ${dustedDirtCache.size})`);
    }
    
    // Always log cache results if cache debug is enabled (not just if message contains "cache")
    if (isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Found ${cachedTiles.length} valid tiles from cache (filtered by distance: ${minDistance}-${cacheMaxDistance} blocks), used ${blockQueryCount} queries`);
    } else {
        debugLog('spawn', `Found ${cachedTiles.length} valid tiles from cache (filtered by distance: ${minDistance}-${cacheMaxDistance} blocks), used ${blockQueryCount} queries`);
    }
    candidates.push(...cachedTiles);
    
    // Strategy: Prioritize cached tiles and scan around them first
    // This is much more efficient than full area scans
    const CACHE_SCAN_RADIUS = 8; // Scan 8 blocks around each cached tile
    // Dynamic cache threshold based on player count (lower for multiplayer to reduce lag)
    const MIN_CACHED_TILES_FOR_FULL_SCAN = totalPlayerCount === 1 ? 8 : totalPlayerCount === 2 ? 6 : totalPlayerCount === 3 ? 4 : 3;
    
    // If we have enough tiles from cache, skip expensive scan entirely
    if (cachedTiles.length >= limit) {
        if (isDebugEnabled('spawn', 'cache') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Using cached tiles only (${cachedTiles.length} tiles), skipping block scan`);
        } else {
            debugLog('spawn', `Using cached tiles only (${cachedTiles.length} tiles), skipping block scan`);
        }
        return candidates.slice(0, limit);
    }
    
    // If we have some cached tiles, scan around them first (much more efficient)
    if (cachedTiles.length >= MIN_CACHED_TILES_FOR_FULL_SCAN && blockQueryCount < queryLimit) {
        // Scan around each cached tile to find nearby spawn locations
        // This is much more efficient than scanning the entire area
        const tilesToScanAround = cachedTiles.slice(0, Math.min(10, cachedTiles.length)); // Limit to 10 tiles to avoid too many queries
        for (const cachedTile of tilesToScanAround) {
            if (candidates.length >= limit || blockQueryCount >= queryLimit) break;
            
            // Scan in a small box around this cached tile
            const scanRadius = CACHE_SCAN_RADIUS;
            for (let dx = -scanRadius; dx <= scanRadius && candidates.length < limit && blockQueryCount < queryLimit; dx++) {
                for (let dz = -scanRadius; dz <= scanRadius && candidates.length < limit && blockQueryCount < queryLimit; dz++) {
                    // Skip the center (we already have this tile)
                    if (dx === 0 && dz === 0) continue;
                    
                    const checkX = cachedTile.x + dx;
                    const checkZ = cachedTile.z + dz;
                    
                    // Check if this position is within valid spawn distance
                    const distFromCenter = Math.hypot((checkX + 0.5) - center.x, (checkZ + 0.5) - center.z);
                    if (distFromCenter < minDistance || distFromCenter > maxDistance) continue;
                    
                    // Check Y levels around the cached tile's Y level
                    const checkYStart = Math.min(cachedTile.y + 5, 320);
                    const checkYEnd = Math.max(cachedTile.y - 5, -64);
                    
                    for (let checkY = checkYStart; checkY >= checkYEnd && candidates.length < limit && blockQueryCount < queryLimit; checkY--) {
                        if (checkY < -64 || checkY > 320) continue;
                        
                        const tileKey = `${checkX},${checkY},${checkZ}`;
                        if (seen.has(tileKey)) continue;
                        
                        let block;
                        try {
                            block = dimension.getBlock({ x: checkX, y: checkY, z: checkZ });
                            blockQueryCount++;
                        } catch {
                            continue;
                        }
                        if (!block) continue;
                        
                        const dimensionId = dimension.id;
                        if (isValidTargetBlock(block.typeId, dimensionId)) {
                            const blockAbove = dimension.getBlock({ x: checkX, y: checkY + 1, z: checkZ });
                            blockQueryCount++;
                            if (blockQueryCount < queryLimit) {
                                const blockTwoAbove = dimension.getBlock({ x: checkX, y: checkY + 2, z: checkZ });
                                blockQueryCount++;
                                if (isAirOrWater(blockAbove) && isAirOrWater(blockTwoAbove)) {
                                    seen.add(tileKey);
                                    candidates.push({ x: checkX, y: checkY, z: checkZ });
                                    // Register new tile in cache for future use
                                    registerDustedDirtBlock(checkX, checkY, checkZ, dimension);
                                    
                                    // Found solid block, move to next XZ
                                    break;
                                }
                            }
                        }
                        
                        if (!isAir(block)) {
                            // Hit solid non-target block, move to next XZ
                            break;
                        }
                    }
                }
            }
        }
        
        // If we found enough tiles from cache + scanning around cache, we're done
        // EXCEPTION: Nether/End always do full scan since we can't rely on biome replacement
        // (blocks must be found through active scanning, not cached from biome generation)
        // More aggressive: Skip full scan if we have enough tiles OR enough cached tiles (reduces lag)
        // Lower threshold for 3+ players to rely more on cache
        const minTilesNeeded = totalPlayerCount >= 3 ? Math.floor(limit * 0.2) : Math.floor(limit * 0.3); // 20% for 3+ players, 30% for 1-2 players
        const minCachedForSkip = totalPlayerCount >= 4 ? 3 : totalPlayerCount >= 3 ? 4 : MIN_CACHED_TILES_FOR_FULL_SCAN; // Lower threshold for 3+ players, even lower for 4+
        if (!isNetherOrEnd && (candidates.length >= minTilesNeeded || cachedTiles.length >= minCachedForSkip)) {
            // console.warn(`[SPAWN DEBUG] Found ${candidates.length} tiles (${cachedTiles.length} cached + ${candidates.length - cachedTiles.length} from cache scan), skipping full scan`);
            return candidates.slice(0, limit);
        }
    }
    
    // Only do full area scan if we have very few cached tiles
    // This is the expensive operation, so we avoid it when possible
    // If cache is empty or very small, we MUST do a full scan to find blocks
    // Nether/End: Always do full scan since biome replacement doesn't work there
    
    // Check if this area was recently scanned and found 0 blocks (barren area)
    // Skip full scan if area is barren and cooldown hasn't expired
    // BUT: Clear barren cache if player has moved to a different position (might have dusted_dirt nearby)
    if (!isNetherOrEnd) {
        const chunkKey = getChunkKey(cx, cz);
        const barrenInfo = barrenAreaCache.get(chunkKey);
        const now = system.currentTick;
        
        if (barrenInfo && (now - barrenInfo.lastScanTick) < BARREN_AREA_COOLDOWN) {
            // Check if player position has changed significantly (moved to different area)
            // If player moved, clear barren cache - they might be near dusted_dirt now
            const currentPosKey = `${cx},${cz}`;
            if (barrenInfo.playerPositions && !barrenInfo.playerPositions.has(currentPosKey)) {
                // Player moved to a different position in this chunk, clear barren cache
                barrenAreaCache.delete(chunkKey);
                if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                    console.warn(`[SPAWN DEBUG] Cleared barren cache for ${chunkKey} (player moved to new position)`);
                }
            } else {
                // Area was recently scanned and found 0 blocks, skip full scan
                if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                    console.warn(`[SPAWN DEBUG] Skipping full scan: Area ${chunkKey} is barren (found 0 blocks ${Math.floor((now - barrenInfo.lastScanTick) / 20)}s ago), using cache only`);
                }
                return candidates.slice(0, limit);
            }
        }
    }
    
    // Optimize new chunk handling: Check if chunk is newly loaded
    const centerChunkKey = getChunkKey(cx, cz);
    const chunkFirstVisitTick = chunkFirstVisit.get(centerChunkKey);
    // Enhanced delay for tight groups: 10 ticks instead of 5
    const chunkLoadDelay = isTightGroup ? 10 : CHUNK_LOAD_DELAY;
    const isNewChunk = chunkFirstVisitTick && (now - chunkFirstVisitTick) < chunkLoadDelay;
    
    // Progressive spawn rate: Track when area was first entered
    if (!areaFirstEntered.has(centerChunkKey)) {
        areaFirstEntered.set(centerChunkKey, now);
    }
    
    // Chunk scan queue: Stagger scans across multiple ticks to prevent simultaneous scans
    const queuedScan = chunkScanQueue.get(centerChunkKey);
    let shouldSkipScan = false;
    if (queuedScan) {
        if (queuedScan.scanInProgress || now < queuedScan.scheduledTick) {
            // Chunk is already being scanned or scheduled for later, skip scan and use cache only
            shouldSkipScan = true;
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] Chunk ${centerChunkKey} is queued (scheduled: tick ${queuedScan.scheduledTick}, current: ${now}), using cache only`);
            }
        } else {
            // Scan was scheduled and it's time - check if players are still in this chunk
            // Adaptive stagger: Cancel scan if all players moved away
            if (queuedScan.playerPositions && queuedScan.playerPositions.size > 0) {
                let playersStillInChunk = 0;
                for (const [playerId, posInfo] of queuedScan.playerPositions.entries()) {
                    const playerChunkKey = getChunkKey(posInfo.x, posInfo.z);
                    if (playerChunkKey === centerChunkKey) {
                        playersStillInChunk++;
                    }
                }
                
                if (playersStillInChunk === 0) {
                    // All players moved away, cancel scan
                    chunkScanQueue.delete(centerChunkKey);
                    shouldSkipScan = true;
                    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                        console.warn(`[SPAWN DEBUG] Chunk ${centerChunkKey} scan cancelled - all players moved away`);
                    }
                } else if (playersStillInChunk < queuedScan.playerPositions.size) {
                    // Some players moved, reduce priority but still scan
                    queuedScan.priority = playersStillInChunk;
                    queuedScan.scanInProgress = true;
                    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                        console.warn(`[SPAWN DEBUG] Chunk ${centerChunkKey} scan priority reduced (${playersStillInChunk}/${queuedScan.playerPositions.size} players still in chunk)`);
                    }
                } else {
                    // All players still here, proceed normally
                    queuedScan.scanInProgress = true;
                }
            } else {
                // No position tracking (legacy entry), proceed normally
                queuedScan.scanInProgress = true;
            }
        }
    } else if (isNewChunk && totalPlayerCount > 1) {
        // Schedule scan for this chunk (stagger based on how many players already queued)
        const staggerOffset = Array.from(chunkScanQueue.values()).filter(q => q.scheduledTick > now).length;
        const scheduledTick = now + (staggerOffset * CHUNK_SCAN_STAGGER_INTERVAL);
        
        // Track player position for adaptive stagger
        const playerPositions = new Map();
        playerPositions.set('center', { x: center.x, z: center.z, chunkKey: centerChunkKey });
        
        chunkScanQueue.set(centerChunkKey, {
            scheduledTick: scheduledTick,
            playerIds: new Set(),
            scanInProgress: false,
            priority: 1, // Start with priority 1 (will increase if more players queue for same chunk)
            playerPositions: playerPositions
        });
        shouldSkipScan = true; // Skip scan this tick, will happen later
        if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Chunk ${centerChunkKey} scheduled for scan at tick ${scheduledTick} (stagger offset: ${staggerOffset})`);
        }
    }
    
    // Cleanup old completed scans from queue
    // Use CHUNK_SCAN_STAGGER_INTERVAL * 4 to ensure we don't remove scans before they execute
    // Also cleanup cancelled scans (where all players moved away)
    for (const [chunkKey, scanInfo] of chunkScanQueue.entries()) {
        if (scanInfo.scanInProgress && (now - scanInfo.scheduledTick) > (CHUNK_SCAN_STAGGER_INTERVAL * 4)) {
            chunkScanQueue.delete(chunkKey);
        }
        // Cleanup scans that are way past their scheduled time (cancelled or failed)
        if (!scanInfo.scanInProgress && (now - scanInfo.scheduledTick) > (CHUNK_SCAN_STAGGER_INTERVAL * 8)) {
            chunkScanQueue.delete(chunkKey);
        }
    }
    
    // Chunk priority system: If multiple chunks are ready to scan, process higher priority first
    // Priority = number of players waiting for this chunk
    // This is handled implicitly by processing chunks in order, but we can optimize by sorting
    const readyScans = Array.from(chunkScanQueue.entries())
        .filter(([key, info]) => !info.scanInProgress && now >= info.scheduledTick)
        .sort((a, b) => (b[1].priority || 1) - (a[1].priority || 1)); // Sort by priority (highest first)
    
    // Process highest priority scan if multiple are ready
    if (readyScans.length > 1 && readyScans[0][0] !== centerChunkKey) {
        // Another chunk has higher priority, but we'll process current chunk if it's ready
        // The priority system mainly helps when multiple chunks are queued simultaneously
    }
    
    // For new chunks: Use reduced scan radius and rely more on cache
    let effectiveMaxDistance = maxDistance;
    if (isNewChunk) {
        // Tight groups: Even smaller radius (20 blocks instead of 30)
        effectiveMaxDistance = isTightGroup ? 20 : 30;
        if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] New chunk detected (age: ${now - chunkFirstVisitTick} ticks, tight group: ${isTightGroup}), using reduced scan radius: ${effectiveMaxDistance} blocks (was ${maxDistance})`);
        }
        
        // If we have some cached tiles, prefer using cache over scanning new chunk immediately
        // For tight groups, require more cached tiles (5 instead of 3)
        const minCachedTiles = isTightGroup ? 5 : (totalPlayerCount >= 4 ? 5 : 3);
        if (cachedTiles.length >= minCachedTiles || shouldSkipScan) {
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] New chunk: Using cache (${cachedTiles.length} tiles) instead of immediate scan`);
            }
            // Update maxDistance for distance filtering but skip full scan
            maxDistance = effectiveMaxDistance;
            const effectiveMaxSq = effectiveMaxDistance * effectiveMaxDistance;
            // Filter by spawn range (minDistance to effectiveMaxDistance)
            const filteredCandidates = candidates.filter(tile => {
                const dx = tile.x + 0.5 - center.x;
                const dz = tile.z + 0.5 - center.z;
                const distSq = dx * dx + dz * dz;
                return distSq >= minSq && distSq <= effectiveMaxSq;
            });
            return filteredCandidates.slice(0, limit);
        }
    }
    
    // Skip scan if chunk is queued for later
    if (shouldSkipScan) {
        maxDistance = effectiveMaxDistance;
        const effectiveMaxSq = effectiveMaxDistance * effectiveMaxDistance;
        // Filter by spawn range (minDistance to effectiveMaxDistance)
        const filteredCandidates = candidates.filter(tile => {
            const dx = tile.x + 0.5 - center.x;
            const dz = tile.z + 0.5 - center.z;
            const distSq = dx * dx + dz * dz;
            return distSq >= minSq && distSq <= effectiveMaxSq;
        });
        return filteredCandidates.slice(0, limit);
    }
    
    // Update maxDistance if we're using reduced radius for new chunks
    if (isNewChunk) {
        maxDistance = effectiveMaxDistance;
        // Recalculate maxSq with new maxDistance
        maxSq = effectiveMaxDistance * effectiveMaxDistance;
        // Filter candidates to new distance range
        candidates = candidates.filter(tile => {
            const dx = tile.x + 0.5 - center.x;
            const dz = tile.z + 0.5 - center.z;
            const distSq = dx * dx + dz * dz;
            return distSq >= minSq && distSq <= maxSq;
        });
    }
    
    // Track how many blocks we found before the full scan (to detect if scan found 0 new blocks)
    const candidatesBeforeScan = candidates.length;

    // Quick check: Scan blocks immediately around player first (within 10 blocks)
    // This ensures we find blocks right next to the player even if the full scan hits budget limits
    if (candidates.length < limit && blockQueryCount < queryLimit) {
        const quickCheckRadius = 10;
        const quickCheckRadiusSq = quickCheckRadius * quickCheckRadius;
        const quickXStart = Math.max(cx - quickCheckRadius, Math.floor(center.x - quickCheckRadius));
        const quickXEnd = Math.min(cx + quickCheckRadius, Math.floor(center.x + quickCheckRadius));
        const quickZStart = Math.max(cz - quickCheckRadius, Math.floor(center.z - quickCheckRadius));
        const quickZEnd = Math.min(cz + quickCheckRadius, Math.floor(center.z + quickCheckRadius));
        
        for (let qx = quickXStart; qx <= quickXEnd && candidates.length < limit && blockQueryCount < queryLimit; qx++) {
            for (let qz = quickZStart; qz <= quickZEnd && candidates.length < limit && blockQueryCount < queryLimit; qz++) {
                const qdx = qx + 0.5 - center.x;
                const qdz = qz + 0.5 - center.z;
                const qdistSq = qdx * qdx + qdz * qdz;
                if (qdistSq > quickCheckRadiusSq) continue;
                
                // Check Y range around player
                const quickYStart = Math.min(cy + 10, 320);
                const quickYEnd = Math.max(cy - 10, -64);
                
                for (let qy = quickYStart; qy >= quickYEnd && blockQueryCount < queryLimit; qy--) {
                    if (blockQueryCount >= queryLimit) break;
                    
                    let block;
                    try {
                        block = dimension.getBlock({ x: qx, y: qy, z: qz });
                        blockQueryCount++;
                    } catch {
                        continue;
                    }
                    if (!block) continue;
                    
                    const dimensionId = dimension.id;
                    if (isValidTargetBlock(block.typeId, dimensionId)) {
                        const blockAbove = dimension.getBlock({ x: qx, y: qy + 1, z: qz });
                        blockQueryCount++;
                        if (blockQueryCount < queryLimit) {
                            const blockTwoAbove = dimension.getBlock({ x: qx, y: qy + 2, z: qz });
                            blockQueryCount++;
                            if (isAirOrWater(blockAbove) && isAirOrWater(blockTwoAbove)) {
                                const key = `${qx},${qy},${qz}`;
                                if (!seen.has(key)) {
                                    seen.add(key);
                                    candidates.push({ x: qx, y: qy, z: qz });
                                    registerDustedDirtBlock(qx, qy, qz, dimension);
                                    
                                    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                                        console.warn(`[SPAWN DEBUG] Quick check found dusted_dirt at (${qx}, ${qy}, ${qz}), dist: ${Math.sqrt(qdistSq).toFixed(1)} blocks from player`);
                                    }
                                    
                                    if (candidates.length >= limit) break;
                                }
                            }
                        }
                        break; // Found solid block at this Y, move to next XZ
                    }
                    
                    if (!isAir(block)) {
                        break; // Hit solid non-target block, move to next XZ
                    }
                }
            }
        }
    }

    // Two-phase scanning system:
    // - Discovery Phase: Scan 0-DISCOVERY_RADIUS (75 blocks) to find ALL dusted_dirt/snow_layer blocks
    // - Validation Phase: Filter discovered blocks by 15-45 spawn range before returning
    // - This allows blocks to be pre-cached before players move into range
    // - Y: Initially ±10 blocks from player (20 blocks), expand if needed by ±15 more (30 more blocks)
    
    // Discovery phase: Use DISCOVERY_RADIUS for scanning (find all blocks in larger area)
    // For new chunks, still use reduced radius to prevent lag
    const discoveryRadius = isNewChunk ? effectiveMaxDistance : DISCOVERY_RADIUS;
    
    if (isDebugEnabled('spawn', 'discovery') || isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Starting discovery phase: Cache had ${cachedTiles.length} tiles, candidates so far: ${candidates.length}, discovery radius: ${discoveryRadius} blocks`);
    }
    let xStart = cx - discoveryRadius;
    let xEnd = cx + discoveryRadius;
    let zStart = cz - discoveryRadius;
    let zEnd = cz + discoveryRadius;
    
    // Progressive tile discovery: Only scan 25% of area per cycle (spread across 4 cycles)
    // Only do progressive discovery if cache has some tiles (not completely empty)
    // Uses DISCOVERY_RADIUS to spread discovery over larger area
    if (!isNetherOrEnd && cachedTiles.length > 0 && totalPlayerCount > 1) {
        const chunkKey = getChunkKey(cx, cz);
        const progressiveInfo = progressiveScanCache.get(chunkKey);
        const now = system.currentTick;
        
        if (progressiveInfo && (now - progressiveInfo.lastScanTick) < SCAN_INTERVAL * 4) {
            // Continue progressive scan - divide area into 4 quadrants
            const scanCycle = progressiveInfo.scanCycle;
            const xMid = Math.floor((xStart + xEnd) / 2);
            const zMid = Math.floor((zStart + zEnd) / 2);
            
            // Cycle 0: Top-left quadrant (x <= mid, z <= mid)
            // Cycle 1: Top-right quadrant (x > mid, z <= mid)
            // Cycle 2: Bottom-left quadrant (x <= mid, z > mid)
            // Cycle 3: Bottom-right quadrant (x > mid, z > mid)
            if (scanCycle === 0) {
                xEnd = xMid;
                zEnd = zMid;
            } else if (scanCycle === 1) {
                xStart = xMid + 1;
                zEnd = zMid;
            } else if (scanCycle === 2) {
                xEnd = xMid;
                zStart = zMid + 1;
            } else { // scanCycle === 3
                xStart = xMid + 1;
                zStart = zMid + 1;
            }
            
            // Update progressive scan cache for next cycle
            const nextCycle = (scanCycle + 1) % PROGRESSIVE_SCAN_CYCLES;
            progressiveScanCache.set(chunkKey, { scanCycle: nextCycle, lastScanTick: now });
            
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] Progressive discovery: Scanning quadrant ${scanCycle + 1}/4 (X[${xStart} to ${xEnd}], Z[${zStart} to ${zEnd}])`);
            }
        } else {
            // Start new progressive scan cycle - first cycle: scan top-left quadrant
            const xMid = Math.floor((xStart + xEnd) / 2);
            const zMid = Math.floor((zStart + zEnd) / 2);
            xEnd = xMid;
            zEnd = zMid;
            progressiveScanCache.set(chunkKey, { scanCycle: 1, lastScanTick: now });
            
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] Progressive discovery: Starting cycle 1/4 (X[${xStart} to ${xEnd}], Z[${zStart} to ${zEnd}])`);
            }
        }
    }
    
    // Smart Y-level detection: Sample blocks to determine if above ground or underground
    // This helps prioritize scanning at the right Y levels
    let surfaceYLevel = null; // Y level where grass blocks are found (surface)
    let isAboveGround = false;
    let isUnderground = false;
    const maxSampleQueries = 50; // Increased to find grass more reliably
    let sampleQueryCount = 0;
    
    // Sample more XZ positions to detect environment (increased from 5 to 15 for better coverage)
    // Sample within discovery radius (0-75) for better environment detection coverage
    const sampleXZPositions = [];
    const targetSampleCount = 15; // More samples = better chance of finding grass
    const discoveryRadiusSq = discoveryRadius * discoveryRadius; // Use discovery radius for sampling
    const xStep = Math.max(1, Math.floor((xEnd - xStart) / Math.sqrt(targetSampleCount)));
    const zStep = Math.max(1, Math.floor((zEnd - zStart) / Math.sqrt(targetSampleCount)));
    
    for (let sx = xStart; sx <= xEnd && sampleXZPositions.length < targetSampleCount; sx += xStep) {
        for (let sz = zStart; sz <= zEnd && sampleXZPositions.length < targetSampleCount; sz += zStep) {
            const dx = sx + 0.5 - center.x;
            const dz = sz + 0.5 - center.z;
            const distSq = dx * dx + dz * dz;
            // Sample within discovery radius (0-75 blocks) instead of just spawn range
            if (distSq <= discoveryRadiusSq) {
                sampleXZPositions.push({ x: sx, z: sz });
                if (sampleXZPositions.length >= targetSampleCount) break;
            }
        }
    }
    
    // If we didn't get enough samples, try a few random positions in the discovery radius
    if (sampleXZPositions.length < targetSampleCount) {
        const attempts = (targetSampleCount - sampleXZPositions.length) * 3;
        for (let i = 0; i < attempts && sampleXZPositions.length < targetSampleCount; i++) {
            const sx = xStart + Math.floor(Math.random() * (xEnd - xStart + 1));
            const sz = zStart + Math.floor(Math.random() * (zEnd - zStart + 1));
            const dx = sx + 0.5 - center.x;
            const dz = sz + 0.5 - center.z;
            const distSq = dx * dx + dz * dz;
            // Sample within discovery radius (0-75 blocks)
            if (distSq <= discoveryRadiusSq) {
                const exists = sampleXZPositions.some(p => p.x === sx && p.z === sz);
                if (!exists) {
                    sampleXZPositions.push({ x: sx, z: sz });
                }
            }
        }
    }
    
    // Check sample positions for grass (above ground) or stone/deepslate (underground)
    // Strategy: Scan from top down to find surface blocks (more reliable than random Y sampling)
    for (const pos of sampleXZPositions) {
        if (sampleQueryCount >= maxSampleQueries || blockQueryCount >= queryLimit) break;
        
        // Scan from top down (start from player Y + 20, down to player Y - 15)
        // This finds the first solid block (surface) which is more reliable
        let foundSurface = false;
        let waterDepth = 0; // Track how deep we are in water
        for (let sy = Math.min(cy + 20, 320); sy >= Math.max(cy - 15, -64) && sampleQueryCount < maxSampleQueries && blockQueryCount < queryLimit; sy--) {
            try {
                const sampleBlock = dimension.getBlock({ x: pos.x, y: sy, z: pos.z });
                sampleQueryCount++;
                blockQueryCount++; // Count sample queries in total budget
                if (!sampleBlock) continue;
                
                const typeId = sampleBlock?.typeId;
                if (!typeId) continue;
                
                // Skip water - continue down to find actual land surface
                if (typeId.includes("water")) {
                    waterDepth++;
                    continue; // Keep going down through water
                }
                
                // Reset water depth when we find non-water
                if (waterDepth > 0) {
                    waterDepth = 0;
                }
                
                // Check if this is a surface block (solid with air above)
                if (!isAir(sampleBlock)) {
                    // Found solid block - check if it's grass (surface indicator)
                    if (typeId.includes("grass_block")) {
                        // Found grass surface - we're above ground
                        isAboveGround = true;
                        if (surfaceYLevel === null || sy > surfaceYLevel) {
                            surfaceYLevel = sy;
                        }
                        foundSurface = true;
                        break; // Found surface, move to next XZ position
                    } else if (typeId.includes("stone") || typeId.includes("deepslate")) {
                        // Found stone/deepslate - likely underground (but only if no grass found)
                        if (!isAboveGround) {
                            isUnderground = true;
                        }
                        // Don't break - continue looking for grass above
                    } else if (typeId.includes("dirt") || typeId.includes("sand") || typeId.includes("gravel")) {
                        // Found dirt/sand/gravel - could be surface, check if air above
                        try {
                            const aboveBlock = dimension.getBlock({ x: pos.x, y: sy + 1, z: pos.z });
                            sampleQueryCount++;
                            blockQueryCount++;
                            if (aboveBlock && isAir(aboveBlock)) {
                                // Dirt/sand with air above - likely surface, but not as reliable as grass
                                // Continue looking for grass, but remember this as potential surface
                                if (surfaceYLevel === null || sy > surfaceYLevel) {
                                    surfaceYLevel = sy;
                                }
                            }
                        } catch {
                            // Skip if can't check above
                        }
                    }
                }
            } catch {
                // Chunk not loaded, skip
            }
        }
    }
    
    // Adjust Y range based on environment detection (STRICT range if above ground)
    let yRangeUp, yRangeDown;
    let yStart, yEnd;
    
    if (isAboveGround && surfaceYLevel !== null) {
        // Above ground: Use STRICT Y range around surface level (±8 blocks)
        // This focuses scanning where blocks are most likely to be
        const surfaceY = Math.floor(surfaceYLevel);
        yRangeUp = 8; // Only 8 blocks above surface
        yRangeDown = 8; // Only 8 blocks below surface
        yStart = Math.min(surfaceY + yRangeUp, 320);
        yEnd = Math.max(surfaceY - yRangeDown, -64);
        
        if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Environment detection: Above ground (surface Y: ${surfaceY}), using STRICT Y range: ${yEnd} to ${yStart} (±${yRangeDown} blocks from surface)`);
        }
    } else {
        // Default: Fixed Y range (15 below, 30 above player)
        // Nether/End: Use smaller range to avoid ceiling/floor issues
        if (isNetherOrEnd) {
            // Nether ceiling is ~Y=128, floor is ~Y=0-32
            // End has void below, islands at various heights
            // Use smaller range (±15) to stay closer to player level and avoid invalid areas
            yRangeUp = 15; // Reduced from 30 for Nether/End
            yRangeDown = 15; // Keep at 15
            // Cap Y start to avoid Nether ceiling (Y=128) - leave some buffer
            const maxY = dimensionId === "minecraft:nether" ? 125 : 320; // Nether ceiling buffer, End has no ceiling
            yStart = Math.min(cy + yRangeUp, maxY);
            yEnd = Math.max(cy - yRangeDown, -64);
        } else {
            // Reduce Y range for multiple players to reduce lag (fewer blocks to check)
            if (totalPlayerCount >= 4) {
                yRangeUp = 10; // Aggressively reduced for 4+ players
                yRangeDown = 10; // Aggressively reduced for 4+ players
            } else if (totalPlayerCount >= 3) {
                yRangeUp = 20; // Reduced from 30 for 3 players
                yRangeDown = 10; // Reduced from 15 for 3 players
            } else {
                yRangeUp = 30; // Always check 30 blocks above player
                yRangeDown = 15; // Always check 15 blocks below player
            }
            yStart = cy + yRangeUp;
            yEnd = cy - yRangeDown;
        }
        
        if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            if (isNetherOrEnd) {
                console.warn(`[SPAWN DEBUG] Environment detection: Nether/End (player Y: ${cy}), using reduced Y range (±${yRangeDown} blocks) to avoid ceiling/void`);
            } else if (isUnderground) {
                console.warn(`[SPAWN DEBUG] Environment detection: Underground (player Y: ${cy}), using default Y range`);
            } else {
                console.warn(`[SPAWN DEBUG] Environment detection: Unknown/neutral (player Y: ${cy}, samples checked: ${sampleQueryCount}), using default Y range`);
            }
        }
    }
    
    const initialYRange = Math.max(yRangeUp, yRangeDown); // For logging/compatibility
    const expandYRange = isSinglePlayer ? 20 : 15; // Expansion range if needed
    
    // Debug: Log Y range now that it's defined
    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Y scan range: ${yEnd} to ${yStart} (player Y: ${cy}, up: +${yRangeUp}, down: -${yRangeDown})${isSinglePlayer ? ' [SINGLE PLAYER MODE - Enhanced Scanning]' : ''}`);
    }
    
    // Adjust Y scanning strategy based on environment detection
    let yScanOrder = []; // Will be populated with Y levels in priority order
    if (isAboveGround && surfaceYLevel !== null) {
        // Above ground: Prioritize scanning around surface level (strict range)
        const surfaceY = Math.floor(surfaceYLevel);
        for (let y = surfaceY; y >= Math.max(surfaceY - yRangeDown, yEnd); y--) {
            yScanOrder.push(y);
        }
        for (let y = surfaceY + 1; y <= Math.min(surfaceY + yRangeUp, yStart); y++) {
            yScanOrder.push(y);
        }
        // No need to fill remaining - we're using strict range
        if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Prioritizing surface-level scanning (Y: ${yEnd} to ${yStart})`);
        }
    } else if (isUnderground) {
        // Underground: Scan more evenly, but prioritize around player Y
        // Start near player Y, then expand outward
        for (let offset = 0; offset <= Math.max(yRangeUp, yRangeDown); offset++) {
            if (cy + offset <= yStart && !yScanOrder.includes(cy + offset)) {
                yScanOrder.push(cy + offset);
            }
            if (cy - offset >= yEnd && !yScanOrder.includes(cy - offset)) {
                yScanOrder.push(cy - offset);
            }
        }
        // Fill in any remaining Y levels
        for (let y = yStart; y >= yEnd; y--) {
            if (!yScanOrder.includes(y)) {
                yScanOrder.push(y);
            }
        }
        if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Underground detected, using balanced scanning around player Y: ${cy}`);
        }
    } else {
        // Unknown/neutral: Use default top-to-bottom scanning
        for (let y = yStart; y >= yEnd; y--) {
            yScanOrder.push(y);
        }
    }
    
    // Calculate theoretical max blocks
    const xzArea = (maxDistance * 2 + 1) * (maxDistance * 2 + 1); // 97 x 97 = 9,409
    const ringArea = Math.PI * (maxDistance * maxDistance - minDistance * minDistance); // π * (45² - 15²) ≈ 5,655
    const yRangeTotal = yRangeUp + yRangeDown + 1;
    const theoreticalMaxBlocks = Math.floor(ringArea) * yRangeTotal;
    
    // Debug: Log scan area
    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Scan area: X[${xStart} to ${xEnd}], Z[${zStart} to ${zEnd}], Y[${yEnd} to ${yStart}], Player Y: ${cy}`);
    }
    
    // console.warn(`[SPAWN DEBUG] Scanning rectangular cuboid: X[${xStart} to ${xEnd}], Z[${zStart} to ${zEnd}], Y[${yEnd} to ${yStart}]`);
    // console.warn(`[SPAWN DEBUG] Theoretical max: ${xzArea} XZ positions total, ~${Math.floor(ringArea)} valid (15-48 block ring), ×${initialYRange * 2 + 1} Y levels = ~${theoreticalMaxBlocks} blocks (but we break early on solids)`);
    
    // Debug: Log scan start
    let blocksChecked = 0;
    let blocksFound = 0;
    let chunksNotLoaded = 0;
    let airBlocks = 0;
    let otherBlocks = 0;
    const blockTypeCounts = new Map(); // Track block types found for debugging
    
    // Check Y levels from top to bottom - define constants once outside loops
    // Minecraft Bedrock minimum Y is -64, maximum is 320
    const MIN_Y = -64;
    const MAX_Y = 320;
    const clampedYStart = Math.min(yStart, MAX_Y);
    const clampedYEnd = Math.max(yEnd, MIN_Y);
    
    // TEMPORARY: Track XZ positions checked for detailed logging
    let xzPositionsChecked = 0;
    let xzPositionsInRange = 0;
    let xzPositionsSkipped = 0;
    const checkedXZPositions = []; // Store first 20 checked positions for logging
    
    // Per-tick block budget: Limit blocks checked per tick to spread load (especially important for 4+ players)
    const blocksPerTickBudget = BLOCKS_PER_TICK_BUDGET[Math.min(totalPlayerCount, 4)] || BLOCKS_PER_TICK_BUDGET[4];
    let blocksCheckedThisTick = 0;
    
    // Scan XZ rectangle, checking Y levels
    for (let x = xStart; x <= xEnd; x++) {
        // Early exit: If we have enough candidates, stop scanning (especially important for Nether/End)
        if (candidates.length >= limit) {
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] Scan stopped: Found enough tiles (${candidates.length}/${limit})`);
            }
            break;
        }
        
        // Check per-tick block budget (spread load across multiple ticks)
        if (blocksCheckedThisTick >= blocksPerTickBudget) {
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] Scan paused: Per-tick budget reached (${blocksCheckedThisTick}/${blocksPerTickBudget}), will continue next tick`);
            }
            break; // Stop scanning this tick, will resume next tick (cache will be used)
        }
        
        if (blockQueryCount >= queryLimit) {
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] Scan stopped: Query limit reached (${blockQueryCount}/${queryLimit})${isSinglePlayer ? ' [SINGLE PLAYER MODE]' : ''}`);
            }
            break;
        }
        
        for (let z = zStart; z <= zEnd; z++) {
            // Early exit: Check candidates before each XZ position
            if (candidates.length >= limit) break;
            if (blocksCheckedThisTick >= blocksPerTickBudget) break; // Per-tick budget check
            if (blockQueryCount >= queryLimit) break;
            
            xzPositionsChecked++;
            
            // Check if chunk is loaded before scanning blocks in it
            // This prevents errors when trying to access blocks in unloaded chunks
            if (!isChunkLoadedCached(dimension, x, z)) {
                chunksNotLoaded++;
                continue; // Skip this XZ position if chunk isn't loaded
            }
            
            // Discovery phase: Check if within discovery radius (0-75 blocks)
            // No distance filtering during discovery - all blocks in range are cached
            // Validation phase: Filter by 15-45 range before returning candidates
            const dx = x + 0.5 - center.x;
            const dz = z + 0.5 - center.z;
            const distSq = dx * dx + dz * dz;
            const dist = Math.sqrt(distSq);
            const discoveryRadiusSq = discoveryRadius * discoveryRadius;
            if (distSq > discoveryRadiusSq) {
                xzPositionsSkipped++;
                continue; // Skip blocks outside discovery radius
            }
            
            xzPositionsInRange++;
            
            // TEMPORARY: Log first 20 XZ positions being checked
            if (checkedXZPositions.length < 20 && (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all'))) {
                checkedXZPositions.push({ x, z, dist: dist.toFixed(1), yRange: `${clampedYEnd} to ${clampedYStart}` });
            }
            
            // Debug: Log first few XZ positions being checked
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                if (xzPositionsInRange <= 5) {
                    console.warn(`[SPAWN DEBUG] Checking XZ (${x}, ${z}): dist=${dist.toFixed(1)}, Y range ${clampedYEnd} to ${clampedYStart}`);
                }
            }
            
            // Use smart Y-level scanning order (prioritizes surface if above ground, player Y if underground)
            const yLevelsToCheck = yScanOrder.length > 0 ? yScanOrder : (() => {
                // Fallback: default top-to-bottom if scan order not determined
                const fallback = [];
                for (let y = clampedYStart; y >= clampedYEnd; y--) {
                    fallback.push(y);
                }
                return fallback;
            })();
            
            for (const y of yLevelsToCheck) {
                // Early exit: Check if we have enough candidates
                if (candidates.length >= limit) break;
                if (blocksCheckedThisTick >= blocksPerTickBudget) break; // Per-tick budget check
                if (blockQueryCount >= queryLimit) break;
                
                // Skip if Y is out of world bounds
                if (y < MIN_Y || y > MAX_Y) continue;
                
                let block;
                try {
                    block = dimension.getBlock({ x, y, z });
                    blockQueryCount++;
                    blocksChecked++;
                    blocksCheckedThisTick++;
                } catch (error) {
                    // Chunk not loaded or out of bounds - this is normal, just skip
                    if (error && (error.message?.includes('not loaded') || error.message?.includes('Chunk') || error.message?.includes('boundaries') || error.message?.includes('LocationOutOfWorld'))) {
                        chunksNotLoaded++;
                        continue;
                    }
                    // Unexpected error - log it
                    errorLog(`Error getting block during scan`, error, { x, y, z, dimension: dimension.id });
                    continue;
                }
                if (!block) continue;

                // Debug: Log block type for first few non-air blocks to verify TARGET_BLOCK constant
                if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                    if (blocksChecked <= 10 && !isAir(block) && block.typeId) {
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        const dimensionId = dimension.id;
                        const isTarget = isValidTargetBlock(block.typeId, dimensionId);
                        console.warn(`[SPAWN DEBUG] Block at (${x}, ${y}, ${z}): typeId="${block.typeId}", TARGET_BLOCK="${TARGET_BLOCK}" or "${TARGET_BLOCK_2}", match=${isTarget}, dist: ${dist.toFixed(1)}`);
                    }
                }

                // Check for valid target blocks (dimension-specific)
                const dimensionId = dimension.id;
                if (isValidTargetBlock(block.typeId, dimensionId)) {
                    blocksFound++;
                    // Check for air above before logging/adding - only valid spawn locations
                    const blockAbove = dimension.getBlock({ x, y: y + 1, z });
                    blockQueryCount++;
                    if (blockQueryCount < queryLimit) {
                        const blockTwoAbove = dimension.getBlock({ x, y: y + 2, z });
                        blockQueryCount++;
                        if (isAir(blockAbove) && isAir(blockTwoAbove)) {
                            // Only log when we find a VALID spawn tile (has air above)
                            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                                const dist = Math.sqrt(dx * dx + dz * dz);
                                let blockType = block.typeId === TARGET_BLOCK ? "dusted_dirt" : (block.typeId === TARGET_BLOCK_2 ? "snow_layer" : block.typeId);
                                if (dimensionId === "minecraft:nether") {
                                    // Map Nether block IDs to readable names
                                    const netherBlockNames = {
                                        "minecraft:netherrack": "netherrack",
                                        "minecraft:soul_sand": "soul_sand",
                                        "minecraft:soul_soil": "soul_soil",
                                        "minecraft:basalt": "basalt",
                                        "minecraft:crimson_nylium": "crimson_nylium",
                                        "minecraft:warped_nylium": "warped_nylium"
                                    };
                                    blockType = netherBlockNames[block.typeId] || block.typeId;
                                }
                                if (dimensionId === "minecraft:the_end" && block.typeId === END_TARGET_BLOCK) blockType = "end_stone";
                                console.warn(`[SPAWN DEBUG] ✓✓✓ FOUND VALID ${blockType} at (${x}, ${y}, ${z}), dist: ${dist.toFixed(1)}, Y diff: ${(y - cy).toFixed(1)}`);
                            }
                            const key = `${x},${y},${z}`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                candidates.push({ x, y, z });
                                // Register in cache for future use (works for all dimension-specific blocks)
                                registerDustedDirtBlock(x, y, z, dimension);
                                
                                // Early exit for Nether/End: Stop scanning once we have enough valid tiles
                                // Blocks are abundant, so we don't need to scan exhaustively
                                if (isNetherOrEnd && candidates.length >= Math.min(limit, 30)) {
                                    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                                        console.warn(`[SPAWN DEBUG] Early exit: Found ${candidates.length} valid tiles in Nether/End (sufficient for spawning)`);
                                    }
                                    return candidates.slice(0, limit);
                                }
                                
                                // Scan around this block for nearby dusted_dirt/snow_layer patches (10x10 area)
                                // Skip local scan in Nether/End to reduce lag (blocks are already abundant)
                                if (!isNetherOrEnd && blockQueryCount < queryLimit - 30) { // Reserve some queries for local scan
                                    const localQueries = scanAroundDustedDirt(dimension, x, y, z, seen, candidates, blockQueryCount, limit);
                                    blockQueryCount += localQueries;
                                }
                                
                                if (candidates.length >= limit) {
                                    break;
                                }
                            }
                        }
                    }
                    break; // Found solid block, move to next XZ
                }

                if (!isAir(block)) {
                    otherBlocks++;
                    // Track block types for summary
                    if (block.typeId) {
                        blockTypeCounts.set(block.typeId, (blockTypeCounts.get(block.typeId) || 0) + 1);
                    }
                    // Debug: Log some non-air blocks to see what we're actually finding, and check if any match TARGET_BLOCK
                    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                        if (otherBlocks <= 5 && block.typeId) { // Only log first 5 to avoid spam
                            const dist = Math.sqrt(dx * dx + dz * dz);
                            const dimensionId = dimension.id;
                            const isTarget = isValidTargetBlock(block.typeId, dimensionId);
                            console.warn(`[SPAWN DEBUG] Found non-air block at (${x}, ${y}, ${z}): typeId="${block.typeId}", TARGET_BLOCK="${TARGET_BLOCK}" or "${TARGET_BLOCK_2}", match=${isTarget}, dist: ${dist.toFixed(1)}`);
                        }
                    }
                    // Don't break - continue checking lower Y levels
                    // Dusted_dirt could be below other blocks (e.g., below grass, below stone)
                    // Only break if we found dusted_dirt (already handled above)
                } else {
                    airBlocks++;
                }
            }
        }
    }
    
    // Always log scan statistics (important for debugging)
    // Sample a few blocks to see what we're actually checking
    const sampleCount = 5;
    const sampleBlocks = [];
    let samplesTaken = 0;
    
    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        // Try to get a few sample blocks from different positions
        for (let sx = xStart; sx <= xEnd && samplesTaken < sampleCount; sx += Math.floor((xEnd - xStart) / sampleCount)) {
            for (let sz = zStart; sz <= zEnd && samplesTaken < sampleCount; sz += Math.floor((zEnd - zStart) / sampleCount)) {
                if (samplesTaken >= sampleCount) break;
                const dx = sx + 0.5 - center.x;
                const dz = sz + 0.5 - center.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < minSq || distSq > maxSq) continue;
                
                // Check a few Y levels
                for (let sy = yStart; sy >= yEnd && samplesTaken < sampleCount; sy -= Math.floor((yStart - yEnd) / 3)) {
                    if (samplesTaken >= sampleCount) break;
                    try {
                        const sampleBlock = dimension.getBlock({ x: sx, y: sy, z: sz });
                        if (sampleBlock) {
                            sampleBlocks.push(`(${sx},${sy},${sz}): ${sampleBlock.typeId}`);
                            samplesTaken++;
                            break; // One sample per XZ
                        }
                    } catch { }
                }
            }
        }
    }
    
    // Log scan stats (conditional on debug)
    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Scan stats: Blocks checked: ${blocksChecked}, Found target blocks: ${blocksFound}, Chunks not loaded: ${chunksNotLoaded}, Air: ${airBlocks}, Other: ${otherBlocks}, Queries used: ${blockQueryCount}/${queryLimit}${isSinglePlayer ? ' [SINGLE PLAYER MODE]' : ''}`);
    }
    
    // Detailed XZ position stats (only when tileScanning debug enabled, and only show summary)
    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        // Only show detailed stats if we found blocks or if this is a significant scan
        if (blocksFound > 0 || blocksChecked > 5000) {
            console.warn(`[SPAWN DEBUG] XZ Position stats: Checked: ${xzPositionsChecked}, In range: ${xzPositionsInRange}, Skipped: ${xzPositionsSkipped}`);
            if (checkedXZPositions.length > 0 && blocksFound > 0) {
                const xzList = checkedXZPositions.slice(0, 5).map(p => `(${p.x},${p.z}) dist=${p.dist}`).join(', ');
                console.warn(`[SPAWN DEBUG] First 5 XZ positions checked: ${xzList}`);
            }
        }
    }
    
    // Show top block types found (only if we found blocks)
    if (blockTypeCounts.size > 0 && blocksFound > 0 && (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all'))) {
        const topTypes = Array.from(blockTypeCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type, count]) => `${type}:${count}`)
            .join(', ');
        console.warn(`[SPAWN DEBUG] Top block types found: ${topTypes}`);
    }
    
    // Sample blocks (only show if we found blocks, and limit to 3 samples)
    if (sampleBlocks.length > 0 && blocksFound > 0) {
        console.warn(`[SPAWN DEBUG] Sample blocks checked: ${sampleBlocks.slice(0, 3).join(', ')}`);
    }
    
    // Warning if no target blocks found
    if (blocksFound === 0 && (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all'))) {
        let expectedBlocks = `${TARGET_BLOCK} or ${TARGET_BLOCK_2}`;
        if (isNetherOrEnd) {
            if (dimensionId === "minecraft:nether") {
                expectedBlocks = NETHER_TARGET_BLOCKS.join(", ");
            } else if (dimensionId === "minecraft:the_end") {
                expectedBlocks = `${END_TARGET_BLOCK}`;
            }
        }
        console.warn(`[SPAWN DEBUG] ⚠️ WARNING: No ${expectedBlocks} blocks found in scan area!`);
        console.warn(`[SPAWN DEBUG] Scan area: X[${xStart} to ${xEnd}], Z[${zStart} to ${zEnd}], Y[${clampedYEnd} to ${clampedYStart}], Player: (${cx}, ${cy}, ${cz})`);
        console.warn(`[SPAWN DEBUG] Distance range: ${minDistance}-${maxDistance} blocks horizontally, Y range: +${yRangeUp}/-${yRangeDown} blocks from player Y ${cy}`);
        console.warn(`[SPAWN DEBUG] Spawn ranges: minDist=${MIN_SPAWN_DISTANCE}, maxDist=${MAX_SPAWN_DISTANCE}, YRange=+${yRangeUp}/-${yRangeDown}`);
    }
    
    // Second pass: Expand Y range if we found few tiles and have queries left
    // Adjusted threshold for smaller scan batches (more frequent scans)
    if (candidates.length < 8 && blockQueryCount < queryLimit * 0.6) {
        if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Found only ${candidates.length} tiles, expanding Y range by +${expandYRange}/-${expandYRange} blocks (expanded Y: ${cy - yRangeDown - expandYRange} to ${cy + yRangeUp + expandYRange})`);
            console.warn(`[SPAWN DEBUG] Expanded scan will check Y levels: ${cy - yRangeDown - expandYRange} to ${cy + yRangeUp + expandYRange} (total range: +${yRangeUp + expandYRange}/-${yRangeDown + expandYRange} blocks)`);
        }
        const expandedYStart = cy + yRangeUp + expandYRange;
        const expandedYEnd = cy - yRangeDown - expandYRange;
        
        for (let x = xStart; x <= xEnd; x++) {
            if (blockQueryCount >= queryLimit) break;
            
            for (let z = zStart; z <= zEnd; z++) {
                if (blockQueryCount >= queryLimit) break;
                
                const dx = x + 0.5 - center.x;
                const dz = z + 0.5 - center.z;
                const distSq = dx * dx + dz * dz;
                // Discovery phase: Check if within discovery radius (0-75 blocks)
                // No distance filtering during discovery - all blocks in range are cached
                const discoveryRadiusSq = discoveryRadius * discoveryRadius;
                if (distSq > discoveryRadiusSq) continue; // Skip if outside discovery radius
                
                // Check expanded Y range (skip already checked area)
                // Minecraft Bedrock minimum Y is -64, maximum is 320
                const MIN_Y = -64;
                const MAX_Y = 320;
                const clampedYStart = Math.min(expandedYStart, MAX_Y);
                const clampedYEnd = Math.max(expandedYEnd, MIN_Y);
                
                for (let y = clampedYStart; y >= clampedYEnd; y--) {
                    if (y <= yStart && y >= yEnd) continue; // Skip already checked
                    if (blockQueryCount >= queryLimit) break;
                    
                    // Skip if Y is out of world bounds
                    if (y < MIN_Y || y > MAX_Y) continue;
                    
                    let block;
                    try {
                        block = dimension.getBlock({ x, y, z });
                        blockQueryCount++;
                    } catch (error) {
                        // Chunk not loaded or out of bounds - this is normal, just skip
                        if (error && (error.message?.includes('not loaded') || error.message?.includes('Chunk') || error.message?.includes('boundaries') || error.message?.includes('LocationOutOfWorld'))) {
                            continue;
                        }
                        // Unexpected error - log it
                        errorLog(`Error getting block during expanded scan`, error, { x, y, z, dimension: dimension.id });
                        continue;
                    }
                    if (!block) continue;

                    const dimensionId = dimension.id;
                    if (isValidTargetBlock(block.typeId, dimensionId)) {
                        const blockAbove = dimension.getBlock({ x, y: y + 1, z });
                        blockQueryCount++;
                        if (blockQueryCount < queryLimit) {
                            const blockTwoAbove = dimension.getBlock({ x, y: y + 2, z });
                            blockQueryCount++;
                            if (isAir(blockAbove) && isAir(blockTwoAbove)) {
                                const key = `${x},${y},${z}`;
                                if (!seen.has(key)) {
                                seen.add(key);
                                candidates.push({ x, y, z });
                                // Register in cache for future use
                                registerDustedDirtBlock(x, y, z, dimension);
                                
                                // Scan around this block for nearby dusted_dirt/snow_layer patches (10x10 area)
                                if (blockQueryCount < queryLimit - 30) { // Reserve some queries for local scan
                                    const localQueries = scanAroundDustedDirt(dimension, x, y, z, seen, candidates, blockQueryCount, limit);
                                    blockQueryCount += localQueries;
                                }
                                
                                if (candidates.length >= limit) {
                                    break;
                                }
                                }
                            }
                        }
                        break;
                    }

                    if (!isAir(block)) {
                        // Don't break - continue checking lower Y levels
                        // Dusted_dirt could be below other blocks
                    }
                }
            }
        }
        
        // Debug: Log expanded scan results
        if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Expanded scan complete: Found ${candidates.length} total tiles (${cachedTiles.length} from cache), queries used: ${blockQueryCount}/${queryLimit}${isSinglePlayer ? ' [SINGLE PLAYER MODE]' : ''}`);
        }
    }

    // Always log scan results if tile scanning debug is enabled
    if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        console.warn(`[SPAWN DEBUG] Scanned ${blockQueryCount} blocks in rectangular cuboid, found ${candidates.length} total dusted dirt tiles (${cachedTiles.length} from cache)`);
    } else {
        debugLog('spawn', `Scanned ${blockQueryCount} blocks in rectangular cuboid, found ${candidates.length} total dusted dirt tiles (${cachedTiles.length} from cache)`);
    }
    
    // Track barren areas: If full scan found 0 new blocks (excluding cached tiles), mark area as barren
    if (!isNetherOrEnd && typeof candidatesBeforeScan !== 'undefined') {
        const newBlocksFound = candidates.length - candidatesBeforeScan;
        if (newBlocksFound === 0 && blockQueryCount > 100) { // Only mark as barren if we did a significant scan
            const chunkKey = getChunkKey(cx, cz);
            const posKey = `${cx},${cz}`;
            const existingBarrenInfo = barrenAreaCache.get(chunkKey);
            const playerPositions = existingBarrenInfo?.playerPositions || new Set();
            playerPositions.add(posKey);
            
            barrenAreaCache.set(chunkKey, {
                lastScanTick: system.currentTick,
                foundBlocks: 0,
                playerPositions: playerPositions
            });
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] Marked area ${chunkKey} as barren (found 0 new blocks in full scan) at position ${posKey}`);
            }
        } else if (newBlocksFound > 0) {
            // Area has blocks, remove from barren cache if present
            const chunkKey = getChunkKey(cx, cz);
            if (barrenAreaCache.has(chunkKey)) {
                barrenAreaCache.delete(chunkKey);
            }
        }
    }
    
    // Validation Phase: Filter discovered blocks by spawn range
    // Discovery phase found all blocks in discovery radius (0-75 for normal chunks, 0-20/30 for new chunks)
    // But we only return blocks in valid spawn range (15-maxDistance, where maxDistance is 45 for normal, 20/30 for new chunks)
    // Adaptive: If no blocks found in normal range, allow closer blocks (minimum 10 blocks instead of 15)
    let filteredCandidates = candidates.filter(tile => {
        const dx = tile.x + 0.5 - center.x;
        const dz = tile.z + 0.5 - center.z;
        const distSq = dx * dx + dz * dz;
        return distSq >= minSq && distSq <= maxSq;
    });
    
    // If no blocks found in normal spawn range (15-45), try allowing closer blocks
    // This handles cases where player is surrounded by dusted_dirt but it's all within 15 blocks
    if (filteredCandidates.length === 0 && candidates.length > 0) {
        // Try progressively closer ranges: first 10-45, then 8-45, then 5-45
        let adaptiveMinSq = 10 * 10; // Start with 10 blocks
        filteredCandidates = candidates.filter(tile => {
            const dx = tile.x + 0.5 - center.x;
            const dz = tile.z + 0.5 - center.z;
            const distSq = dx * dx + dz * dz;
            return distSq >= adaptiveMinSq && distSq <= maxSq;
        });
        
        // If still no blocks, try 8 blocks minimum
        if (filteredCandidates.length === 0) {
            adaptiveMinSq = 8 * 8;
            filteredCandidates = candidates.filter(tile => {
                const dx = tile.x + 0.5 - center.x;
                const dz = tile.z + 0.5 - center.z;
                const distSq = dx * dx + dz * dz;
                return distSq >= adaptiveMinSq && distSq <= maxSq;
            });
        }
        
        // If still no blocks, try 5 blocks minimum (last resort)
        if (filteredCandidates.length === 0) {
            adaptiveMinSq = 5 * 5;
            filteredCandidates = candidates.filter(tile => {
                const dx = tile.x + 0.5 - center.x;
                const dz = tile.z + 0.5 - center.z;
                const distSq = dx * dx + dz * dz;
                return distSq >= adaptiveMinSq && distSq <= maxSq;
            });
        }
        
        if (filteredCandidates.length > 0) {
            const adaptiveMin = Math.sqrt(adaptiveMinSq).toFixed(0);
            // Always log when adaptive range is used (important for debugging)
            if (isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'distance') || isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] No blocks in normal range (${minDistance}-${Math.sqrt(maxSq).toFixed(0)}), using adaptive range (${adaptiveMin}-${Math.sqrt(maxSq).toFixed(0)}) - found ${filteredCandidates.length} tiles`);
            } else {
                // Even if debug is off, log this important information
                debugLog('spawn', `No blocks in normal range (${minDistance}-${Math.sqrt(maxSq).toFixed(0)}), using adaptive range (${adaptiveMin}-${Math.sqrt(maxSq).toFixed(0)}) - found ${filteredCandidates.length} tiles`);
            }
        } else if (candidates.length > 0 && (isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'distance') || isDebugEnabled('spawn', 'all'))) {
            // Log when adaptive range still finds nothing (all blocks too close)
            const closestDist = Math.min(...candidates.map(tile => {
                const dx = tile.x + 0.5 - center.x;
                const dz = tile.z + 0.5 - center.z;
                return Math.sqrt(dx * dx + dz * dz);
            })).toFixed(1);
            console.warn(`[SPAWN DEBUG] All ${candidates.length} blocks are too close (closest: ${closestDist} blocks, minimum: 5 blocks)`);
        }
    }
    
    // Debug: Log two-phase system results
    if (isDebugEnabled('spawn', 'discovery') || isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
        const actualMaxDist = Math.sqrt(maxSq);
        const discoveryCount = candidates.length;
        const validationCount = filteredCandidates.length;
        const filteredOut = discoveryCount - validationCount;
        
        if (isDebugEnabled('spawn', 'discovery') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Discovery phase: Found ${discoveryCount} blocks in 0-${discoveryRadius} range`);
        }
        
        if (filteredOut > 0 && (isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'discovery') || isDebugEnabled('spawn', 'all'))) {
            console.warn(`[SPAWN DEBUG] Validation phase: Filtered ${discoveryCount} discovered blocks to ${validationCount} spawn-range blocks (${minDistance}-${actualMaxDist.toFixed(0)} blocks, ${filteredOut} outside spawn range)`);
        } else if (isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'all')) {
            console.warn(`[SPAWN DEBUG] Validation phase: All ${validationCount} discovered blocks are in spawn range (${minDistance}-${actualMaxDist.toFixed(0)} blocks)`);
        }
    }
    
    return filteredCandidates;
}

function calculateAverageSpacing(tiles) {
    if (tiles.length < 2) return 0;
    let totalDist = 0;
    let pairs = 0;
    for (let i = 0; i < tiles.length; i++) {
        for (let j = i + 1; j < tiles.length; j++) {
            const dx = tiles[i].x - tiles[j].x;
            const dz = tiles[i].z - tiles[j].z;
            totalDist += Math.sqrt(dx * dx + dz * dz);
            pairs++;
        }
    }
    return pairs > 0 ? totalDist / pairs : 0;
}

function filterTilesWithSpacing(candidates, minSpacing, maxResults = MAX_SPACED_TILES) {
    // Randomize candidate order to spread spawns across valid distance range
    // This ensures spawns aren't all clustered at one distance (e.g., all at 15 blocks or all at 48 blocks)
    const sorted = [...candidates].sort(() => Math.random() - 0.5);
    
    const result = [];
    for (const tile of sorted) {
        let tooClose = false;
        for (const placed of result) {
            const dx = tile.x - placed.x;
            const dz = tile.z - placed.z;
            if (dx * dx + dz * dz < minSpacing * minSpacing) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            result.push({ x: tile.x, y: tile.y, z: tile.z });
            if (result.length >= maxResults) {
                break;
            }
        }
    }
    return result;
}

function sampleTiles(tiles, max = MAX_CANDIDATES_PER_SCAN) {
    if (!tiles || tiles.length === 0) return [];
    if (tiles.length <= max) {
        return tiles.map((tile) => ({ x: tile.x, y: tile.y, z: tile.z }));
    }

    const sampled = [];
    const used = new Set();
    const len = tiles.length;

    while (sampled.length < max && used.size < len) {
        const index = Math.floor(Math.random() * len);
        if (used.has(index)) continue;
        used.add(index);
        const tile = tiles[index];
        sampled.push({ x: tile.x, y: tile.y, z: tile.z });
    }

    return sampled;
}

function removeTileFromCache(playerId, tile) {
    if (!tile) return;
    
    // Check player's individual cache
    const cache = playerTileCache.get(playerId);
    if (cache && Array.isArray(cache.tiles)) {
        const index = cache.tiles.findIndex((cached) => cached.x === tile.x && cached.y === tile.y && cached.z === tile.z);
        if (index !== -1) {
            cache.tiles.splice(index, 1);
            cache.density = cache.tiles.length;
        }
    }
    
    // Check group cache if player is in a group
    const groupId = playerGroups.get(playerId);
    if (groupId) {
        const groupCache = groupCaches.get(groupId);
        if (groupCache && Array.isArray(groupCache.tiles)) {
            const index = groupCache.tiles.findIndex((cached) => cached.x === tile.x && cached.y === tile.y && cached.z === tile.z);
            if (index !== -1) {
                groupCache.tiles.splice(index, 1);
                groupCache.density = groupCache.tiles.length;
            }
        }
    }
    
    // Also remove from global dusted dirt cache
    unregisterDustedDirtBlock(tile.x, tile.y, tile.z);
}

// Find or create a player group for overlapping spawn rectangles
function getPlayerGroup(players, dimension) {
    if (players.length === 0) return null;
    
    // Find existing groups or create new ones
    const groups = new Map(); // groupId -> Set<playerId>
    const playerToGroup = new Map(); // playerId -> groupId
    
    // Initialize: each player starts in their own group
    for (const player of players) {
        const existingGroupId = playerGroups.get(player.id);
        if (existingGroupId && groupCaches.has(existingGroupId)) {
            // Player is already in a group, check if group is still valid
            const groupCache = groupCaches.get(existingGroupId);
            if (groupCache.dimension === dimension.id) {
                // Check if any players in the group are still close enough
                let stillClose = false;
                let closestDistance = Infinity;
                let closestPlayerName = null;
                for (const otherPlayerId of groupCache.players) {
                    if (otherPlayerId === player.id) continue;
                    const otherPlayer = players.find(p => p.id === otherPlayerId);
                    if (!otherPlayer) continue;
                    
                    const playerPos = getActualPlayerPosition(player);
                    const otherPlayerPos = getActualPlayerPosition(otherPlayer);
                    if (!playerPos || !otherPlayerPos) continue;
                    const dx = playerPos.x - otherPlayerPos.x;
                    const dz = playerPos.z - otherPlayerPos.z;
                    const distSq = dx * dx + dz * dz;
                    const dist = Math.sqrt(distSq);
                    if (dist < closestDistance) {
                        closestDistance = dist;
                        closestPlayerName = otherPlayer.name;
                    }
                    if (distSq <= PLAYER_GROUP_OVERLAP_DISTANCE_SQ) {
                        stillClose = true;
                        break;
                    }
                }
                
                if (stillClose) {
                    // Add to existing group
                    if (!groups.has(existingGroupId)) {
                        groups.set(existingGroupId, new Set(groupCache.players));
                    }
                    groups.get(existingGroupId).add(player.id);
                    playerToGroup.set(player.id, existingGroupId);
                    
                    // Only log group status once per group per tick (use global tracker)
                    if (!loggedMaintainedGroupsThisTick.has(existingGroupId)) {
                        loggedMaintainedGroupsThisTick.add(existingGroupId);
                        const groupPlayerNames = Array.from(groups.get(existingGroupId)).map(id => players.find(p => p.id === id)?.name || id).join(', ');
                        debugLog('groups', `Group ${existingGroupId} maintained: ${groupPlayerNames} (distance: ${closestDistance.toFixed(1)} blocks)`);
                    }
                    continue;
                } else {
                    debugLog('groups', `${player.name} leaving group ${existingGroupId} (closest: ${closestPlayerName} at ${closestDistance.toFixed(1)} blocks, threshold: ${PLAYER_GROUP_OVERLAP_DISTANCE})`);
                }
            }
        }
        
        // Player needs a new group or existing group is invalid
        // Check if they're close to any other player
        let addedToGroup = false;
        for (const otherPlayer of players) {
            if (otherPlayer.id === player.id) continue;
            
            const playerPos = getActualPlayerPosition(player);
            const otherPlayerPos = getActualPlayerPosition(otherPlayer);
            if (!playerPos || !otherPlayerPos) continue;
            const dx = playerPos.x - otherPlayerPos.x;
            const dz = playerPos.z - otherPlayerPos.z;
            const distSq = dx * dx + dz * dz;
            const dist = Math.sqrt(distSq);
            
            if (distSq <= PLAYER_GROUP_OVERLAP_DISTANCE_SQ) {
                // Players are close enough to share a group
                const otherGroupId = playerToGroup.get(otherPlayer.id);
                if (otherGroupId) {
                    // Add to existing group
                    groups.get(otherGroupId).add(player.id);
                    playerToGroup.set(player.id, otherGroupId);
                    addedToGroup = true;
                    
                    // Only log group formation once per group per tick (tracked globally)
                    // Note: "Selected group" log already shows this, so we can skip "formed" log
                    // to reduce redundancy
                    break;
                } else {
                    // Create new group with both players
                    const newGroupId = nextGroupId++;
                    const newGroup = new Set([player.id, otherPlayer.id]);
                    groups.set(newGroupId, newGroup);
                    playerToGroup.set(player.id, newGroupId);
                    playerToGroup.set(otherPlayer.id, newGroupId);
                    addedToGroup = true;
                    // Only log group creation once per group per tick
                    // Note: "Selected group" log will show this group, so we skip individual creation log
                    // to reduce redundancy (it will be shown in the "Selected group" log)
                    break;
                }
            }
        }
        
        if (!addedToGroup) {
            // Player is alone, create their own group (only log if single player)
            if (players.length === 1) {
                const newGroupId = nextGroupId++;
                groups.set(newGroupId, new Set([player.id]));
                playerToGroup.set(player.id, newGroupId);
                debugLog('groups', `${player.name} is alone, created solo group ${newGroupId}`);
            }
        }
    }
    
    // Merge groups that are connected (players in different groups that are close)
    let merged = true;
    while (merged) {
        merged = false;
        for (const [groupId1, players1] of groups.entries()) {
            for (const [groupId2, players2] of groups.entries()) {
                if (groupId1 === groupId2) continue;
                
                // Check if any player in group1 is close to any player in group2
                let shouldMerge = false;
                for (const playerId1 of players1) {
                    const player1 = players.find(p => p.id === playerId1);
                    if (!player1) continue;
                    
                    for (const playerId2 of players2) {
                        const player2 = players.find(p => p.id === playerId2);
                        if (!player2) continue;
                        
                        const dx = player1.location.x - player2.location.x;
                        const dz = player1.location.z - player2.location.z;
                        const distSq = dx * dx + dz * dz;
                        
                        if (distSq <= PLAYER_GROUP_OVERLAP_DISTANCE_SQ) {
                            shouldMerge = true;
                            break;
                        }
                    }
                    if (shouldMerge) break;
                }
                
                if (shouldMerge) {
                    // Merge group2 into group1
                    const group1PlayerNames = Array.from(players1).map(id => players.find(p => p.id === id)?.name || id);
                    const group2PlayerNames = Array.from(players2).map(id => players.find(p => p.id === id)?.name || id);
                    debugLog('groups', `Merging group ${groupId2} (${group2PlayerNames.join(', ')}) into group ${groupId1} (${group1PlayerNames.join(', ')})`);
                    
                    for (const playerId of players2) {
                        players1.add(playerId);
                        playerToGroup.set(playerId, groupId1);
                    }
                    groups.delete(groupId2);
                    merged = true;
                    break;
                }
            }
            if (merged) break;
        }
    }
    
    // Return the first group (we'll process one group at a time)
    // For now, return the group with the most players (or first if tie)
    let largestGroup = null;
    let largestGroupSize = 0;
    for (const [groupId, playerSet] of groups.entries()) {
        if (playerSet.size > largestGroupSize) {
            largestGroupSize = playerSet.size;
            const groupPlayers = Array.from(playerSet).map(id => players.find(p => p.id === id)).filter(p => p);
            largestGroup = { groupId, players: groupPlayers };
        }
    }
    
    // Only log group selection once per group per tick
    if (largestGroup && (groups.size > 1 || largestGroupSize > 1)) {
        const groupId = largestGroup.groupId;
        if (!loggedSelectedGroupsThisTick.has(groupId)) {
            loggedSelectedGroupsThisTick.add(groupId);
            const playerNames = largestGroup.players.map(p => p.name).join(', ');
            debugLog('groups', `Selected group ${groupId} with ${largestGroupSize} players: ${playerNames}`);
        }
    }
    
    return largestGroup;
}

// Calculate combined bounding rectangle for a group of players
function calculateGroupBoundingRect(players, logDetails = false) {
    if (players.length === 0) return null;
    
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let centerX = 0, centerZ = 0;
    
    // Calculate player positions
    const playerPositions = [];
    for (const player of players) {
        const actualPos = getActualPlayerPosition(player);
        if (!actualPos) continue;
        const x = actualPos.x;
        const z = actualPos.z;
        playerPositions.push({ name: player.name, x, z });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    
    centerX = (minX + maxX) / 2;
    centerZ = (minZ + maxZ) / 2;
    
    // Calculate player spread
    const spreadX = maxX - minX;
    const spreadZ = maxZ - minZ;
    const maxSpread = Math.max(spreadX, spreadZ);
    
    // Expand rectangle to ensure all players' spawn rectangles are covered
    // Each player needs MAX_SPAWN_DISTANCE blocks around them
    const expandedMinX = centerX - MAX_SPAWN_DISTANCE;
    const expandedMaxX = centerX + MAX_SPAWN_DISTANCE;
    const expandedMinZ = centerZ - MAX_SPAWN_DISTANCE;
    const expandedMaxZ = centerZ + MAX_SPAWN_DISTANCE;
    
    // Only log when explicitly requested (e.g., when rescanning)
    if (logDetails) {
        debugLog('groups', `Calculated bounding rect for ${players.length} players: center (${centerX.toFixed(1)}, ${centerZ.toFixed(1)}), spread: ${maxSpread.toFixed(1)} blocks, rect: X[${expandedMinX.toFixed(1)} to ${expandedMaxX.toFixed(1)}], Z[${expandedMinZ.toFixed(1)} to ${expandedMaxZ.toFixed(1)}]`);
        debugLog('groups', `Player positions: ${playerPositions.map(p => `${p.name}(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).join(', ')}`);
    }
    
    return {
        center: { x: centerX, z: centerZ },
        minX: expandedMinX,
        maxX: expandedMaxX,
        minZ: expandedMinZ,
        maxZ: expandedMaxZ
    };
}

// Calculate group center (average position of all players)
function getGroupCenter(players) {
    if (players.length === 0) return null;
    
    let sumX = 0, sumY = 0, sumZ = 0;
    let validPlayerCount = 0;
    for (const player of players) {
        const actualPos = getActualPlayerPosition(player);
        if (!actualPos) continue;
        sumX += actualPos.x;
        sumY += actualPos.y;
        sumZ += actualPos.z;
        validPlayerCount++;
    }
    
    if (validPlayerCount === 0) return null;
    
    // Round to whole numbers for consistent chunk calculations
    return {
        x: Math.floor(sumX / validPlayerCount),
        y: Math.floor(sumY / validPlayerCount),
        z: Math.floor(sumZ / validPlayerCount)
    };
}

// Check if players form a tight group (all within TIGHT_GROUP_DISTANCE of each other)
function isTightGroup(players) {
    if (players.length <= 1) return false;
    if (players.length === 2) {
        // For 2 players, just check distance
        const dx = players[0].location.x - players[1].location.x;
        const dz = players[0].location.z - players[1].location.z;
        const distSq = dx * dx + dz * dz;
        return distSq <= TIGHT_GROUP_DISTANCE_SQ;
    }
    
    // For 3+ players, check if all players are within TIGHT_GROUP_DISTANCE of each other
    // Use maximum distance between any two players
    let maxDistSq = 0;
    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            const dx = players[i].location.x - players[j].location.x;
            const dz = players[i].location.z - players[j].location.z;
            const distSq = dx * dx + dz * dz;
            maxDistSq = Math.max(maxDistSq, distSq);
        }
    }
    
    return maxDistSq <= TIGHT_GROUP_DISTANCE_SQ;
}

// Cleanup stale player groups - remove groups with no active players or stale caches
function cleanupPlayerGroups(allPlayers) {
    try {
        const activePlayerIds = new Set(allPlayers.map(p => p.id));
        const now = system.currentTick;
        const groupsToRemove = [];
        
        // Find groups with no active players or stale caches
        for (const [groupId, groupCache] of groupCaches.entries()) {
            try {
                // Check if any players in the group are still active
                let hasActivePlayer = false;
                if (groupCache.players) {
                    for (const playerId of groupCache.players) {
                        if (activePlayerIds.has(playerId)) {
                            hasActivePlayer = true;
                            break;
                        }
                    }
                }
                
                // Remove group if no active players or cache is too old
                if (!hasActivePlayer || (now - groupCache.tick > CACHE_TICK_TTL * 2)) {
                    groupsToRemove.push(groupId);
                    debugLog('groups', `Marking group ${groupId} for removal (hasActive: ${hasActivePlayer}, age: ${now - groupCache.tick})`);
                }
            } catch (error) {
                errorLog(`Error processing group ${groupId} in cleanup`, error, { groupId });
                // Mark for removal on error
                groupsToRemove.push(groupId);
            }
        }
        
        // Remove stale groups
        for (const groupId of groupsToRemove) {
            try {
                groupCaches.delete(groupId);
                // Remove player assignments for this group
                for (const [playerId, assignedGroupId] of playerGroups.entries()) {
                    if (assignedGroupId === groupId) {
                        playerGroups.delete(playerId);
                    }
                }
                debugLog('groups', `Removed group ${groupId}`);
            } catch (error) {
                errorLog(`Error removing group ${groupId}`, error, { groupId });
            }
        }
        
        // Also remove player assignments for players that are no longer active
        for (const [playerId, groupId] of playerGroups.entries()) {
            if (!activePlayerIds.has(playerId)) {
                playerGroups.delete(playerId);
                debugLog('groups', `Removed player ${playerId} from group ${groupId} (player left)`);
            }
        }
    } catch (error) {
        errorLog(`Error in cleanupPlayerGroups`, error);
    }
}

/**
 * Determines if the game is in single-player mode.
 * Single-player mode is active when group cache is disabled, no group players exist, or only one player is present.
 * @param {boolean} useGroupCache - Whether group cache is enabled
 * @param {Array|null} groupPlayers - Array of players in the group, or null if not applicable
 * @returns {boolean} True if in single-player mode, false otherwise
 */
function isSinglePlayerMode(useGroupCache, groupPlayers) {
    return !useGroupCache || !groupPlayers || groupPlayers.length === 1;
}

function getTilesForPlayer(player, dimension, playerPos, currentDay, useGroupCache = false, groupPlayers = null, totalPlayerCount = 1, isTightGroupParam = false) {
    const playerId = player.id;
    const now = system.currentTick;
    
    // Detect if single player (no group cache or only one player in dimension)
    const isSinglePlayer = isSinglePlayerMode(useGroupCache, groupPlayers);
    
    // Try to use group cache if available and enabled
    let cache = null;
    let needsRescan = false;
    let movedSq = 0;
    let isGroupCache = false;
    
    if (useGroupCache && groupPlayers && groupPlayers.length > 1) {
        // Use group cache - find or create group
        const group = getPlayerGroup(groupPlayers, dimension);
        if (group && group.players.length > 1) {
            const groupId = group.groupId;
            const groupCache = groupCaches.get(groupId);
            
            if (groupCache) {
                // Check if group cache is still valid (don't log bounding rect details here)
                const boundingRect = calculateGroupBoundingRect(group.players, false);
                if (boundingRect) {
                    // Check if player is within the bounding rectangle
                    const inBounds = playerPos.x >= boundingRect.minX && playerPos.x <= boundingRect.maxX &&
                                    playerPos.z >= boundingRect.minZ && playerPos.z <= boundingRect.maxZ;
                    
                    if (inBounds) {
                        const dx = playerPos.x - groupCache.center.x;
                        const dz = playerPos.z - groupCache.center.z;
                        movedSq = dx * dx + dz * dz;
                        const timeSinceLastScan = now - lastBlockScanTick;
                        const cacheAge = now - groupCache.tick;
                        // For tight groups, use longer cooldown (SCAN_INTERVAL * 8 instead of * 6)
                        const groupPlayerCount = groupPlayers ? groupPlayers.length : 1;
                        // Check if group is tight: use parameter if provided, otherwise check using function
                        const isGroupTight = isTightGroupParam || (groupPlayers && groupPlayers.length > 1 && isTightGroup(groupPlayers));
                        const scanCooldown = isGroupTight ? SCAN_INTERVAL * 8 : getBlockScanCooldown(groupPlayerCount);
                        
                        // Use group cache if it's recent and group hasn't moved much
                        if (now - groupCache.tick < CACHE_TICK_TTL && timeSinceLastScan < scanCooldown) {
                            cache = groupCache;
                            isGroupCache = true;
                            // Update player's group assignment
                            playerGroups.set(playerId, groupId);
                            // Only log cache usage when it's first created or refreshed
                            // (per-player tile counts are logged later after filtering)
                        } else {
                            // Only log when cache expires (not every time)
                            if (cacheAge >= CACHE_TICK_TTL || timeSinceLastScan >= scanCooldown) {
                                debugLog('groups', `Group ${groupId} cache expired for ${player.name} (age: ${cacheAge}, cooldown: ${timeSinceLastScan}), rescanning`);
                            }
                            needsRescan = true;
                        }
                    } else {
                        debugLog('groups', `${player.name}: Outside group ${groupId} bounds, rescanning`);
                        needsRescan = true;
                    }
                } else {
                    debugLog('groups', `Could not calculate bounding rect for group ${groupId}, rescanning`);
                    needsRescan = true;
                }
            } else {
                // No cache yet - will be created during rescan
                needsRescan = true;
            }
        } else {
            // No group or single player - use individual cache
            useGroupCache = false;
        }
    }
    
    // Fall back to individual cache if group cache not available
    if (!cache && !useGroupCache) {
        cache = playerTileCache.get(playerId);
        if (!cache) {
            needsRescan = true;
        } else {
            // Check if cache is stale but still usable (player returned to area)
            if (cache.stale) {
                const staleAge = now - (cache.staleTick || cache.tick);
                if (staleAge < CACHE_STALE_TTL) {
                    // Stale cache is still valid, reactivate it
                    cache.stale = false;
                    delete cache.staleTick;
                    debugLog('spawn', `${player.name}: Reactivated stale cache (age: ${staleAge} ticks)`);
                } else {
                    // Stale cache expired, delete it
                    playerTileCache.delete(playerId);
                    needsRescan = true;
                }
            }
            
            if (cache && !needsRescan) {
                const dx = playerPos.x - cache.center.x;
                const dz = playerPos.z - cache.center.z;
                movedSq = dx * dx + dz * dz;
                const timeSinceLastScan = now - lastBlockScanTick;
                const scanCooldown = getBlockScanCooldown(totalPlayerCount);
                const cacheAge = now - cache.tick;
                
                // Mark as stale instead of deleting if player moved significantly
                if (movedSq > CACHE_MOVE_THRESHOLD_SQ && !cache.stale) {
                    cache.stale = true;
                    cache.staleTick = now;
                    needsRescan = true;
                    debugLog('spawn', `${player.name}: Marked cache as stale (moved ${Math.sqrt(movedSq).toFixed(1)} blocks)`);
                } else if (cacheAge > CACHE_TICK_TTL || timeSinceLastScan >= scanCooldown) {
                    needsRescan = true;
                }
            }
        }
    }

    if (needsRescan) {
        lastBlockScanTick = now;
        
        if (useGroupCache && groupPlayers && groupPlayers.length > 1) {
            // Rescan for group - scan from each player and combine tiles
            const group = getPlayerGroup(groupPlayers, dimension);
            if (group && group.players.length > 1) {
                const groupId = group.groupId;
                
                // Only scan/log once per group per tick
                if (!scannedGroupsThisTick.has(groupId)) {
                    scannedGroupsThisTick.add(groupId);
                    
                    // Log bounding rect details when rescanning
                    const boundingRect = calculateGroupBoundingRect(group.players, true);
                    if (boundingRect) {
                        // Instead of scanning from center, scan from each player and combine unique tiles
                        // This ensures we get all tiles within range of any player
                        const allTiles = new Map(); // key: "x,y,z" -> tile object
                        const tilesPerPlayer = [];
                        
                        debugLog('groups', `Scanning group ${groupId} from each player's position (${group.players.map(p => p.name).join(', ')})`);
                        
                        for (const p of group.players) {
                            const pPos = p.location;
                            // Scan from each player with their normal spawn radius
                            // Use full candidate limit per player since players may be far apart
                            // The limit prevents excessive scanning, but we need full coverage for each player
                            // For mining bears, also collect stone/deepslate tiles in caves
                            // Note: For groups, we don't use single player mode (multiple players = more load)
                            // Pass total player count to scale down block queries
                            const playerTiles = collectMiningSpawnTiles(dimension, pPos, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE, MAX_CANDIDATES_PER_SCAN, false, totalPlayerCount, isTightGroupParam);
                            
                            tilesPerPlayer.push({ name: p.name, count: playerTiles.length });
                            
                            // Add tiles to combined set (deduplicate by coordinates)
                            for (const tile of playerTiles) {
                                const key = `${tile.x},${tile.y},${tile.z}`;
                                if (!allTiles.has(key)) {
                                    allTiles.set(key, tile);
                                }
                            }
                        }
                        
                        const tiles = Array.from(allTiles.values());
                        
                        debugLog('groups', `Group ${groupId} scan results: ${tilesPerPlayer.map(t => `${t.name}: ${t.count}`).join(', ')}, combined: ${tiles.length} unique tiles`);
                        
                        // Calculate group center for cache (average of all player positions)
                        const groupCenter = {
                            x: boundingRect.center.x,
                            z: boundingRect.center.z
                        };
                        
                        cache = {
                            tiles,
                            density: tiles.length,
                            center: groupCenter,
                            tick: now,
                            players: new Set(group.players.map(p => p.id)),
                            dimension: dimension.id
                        };
                        groupCaches.set(groupId, cache);
                        
                        // Update all players in group
                        for (const p of group.players) {
                            playerGroups.set(p.id, groupId);
                        }
                        
                        isGroupCache = true;
                        debugLog('groups', `Group ${groupId} cache updated: ${tiles.length} tiles for ${group.players.length} players`);
                    }
                } else {
                    // Group was already scanned this tick, use existing cache
                    const existingCache = groupCaches.get(groupId);
                    if (existingCache && existingCache.tick === now) {
                        cache = existingCache;
                        isGroupCache = true;
                        playerGroups.set(playerId, groupId);
                    }
                }
            }
        }
        
        // If group cache failed or not using groups, use individual cache
        if (!cache || !isGroupCache) {
            // console.warn(`[SPAWN DEBUG] Rescanning tiles for ${player.name} (moved: ${Math.sqrt(movedSq).toFixed(1)} blocks, cache age: ${now - (cache?.tick || 0)} ticks)`);
            // For mining bears, also collect stone/deepslate tiles in caves
            // Single player mode: Use more thorough scanning (double query limit)
            // Pass total player count to scale down block queries when multiple players present
            const tiles = collectMiningSpawnTiles(dimension, playerPos, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE, MAX_CANDIDATES_PER_SCAN, isSinglePlayer, totalPlayerCount, isTightGroupParam);
            
            // Debug: Log tile collection results
            if (isDebugEnabled('spawn', 'tileScanning') || isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN DEBUG] ${player.name}: Collected ${tiles.length} tiles from scan (center: ${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}, ${playerPos.z.toFixed(1)})`);
            }
            cache = {
                tiles,
                density: tiles.length,
                center: { x: playerPos.x, z: playerPos.z },
                tick: now,
                stale: false
            };
            playerTileCache.set(playerId, cache);
            isGroupCache = false;
            
            // Cleanup very old stale caches periodically
            if (now % (SCAN_INTERVAL * 10) === 0) {
                for (const [pid, oldCache] of playerTileCache.entries()) {
                    if (oldCache.stale && oldCache.staleTick) {
                        const staleAge = now - oldCache.staleTick;
                        if (staleAge > CACHE_DELETE_TTL) {
                            playerTileCache.delete(pid);
                        }
                    } else if (!oldCache.stale) {
                        const cacheAge = now - oldCache.tick;
                        if (cacheAge > CACHE_DELETE_TTL) {
                            playerTileCache.delete(pid);
                        }
                    }
                }
            }
        }
    }
    
    // Filter tiles to only include those within valid spawn distance for this specific player
    // Use adaptive range: try normal range first (15-45), then fall back to closer ranges if needed
    const minSq = MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE;
    const maxSq = MAX_SPAWN_DISTANCE * MAX_SPAWN_DISTANCE;
    
    let validTiles = cache.tiles.filter(tile => {
        const dx = tile.x + 0.5 - playerPos.x;
        const dz = tile.z + 0.5 - playerPos.z;
        const distSq = dx * dx + dz * dz;
        return distSq >= minSq && distSq <= maxSq;
    });
    
    // If no tiles found in normal range, try adaptive ranges (same as main collection)
    if (validTiles.length === 0 && cache.tiles.length > 0) {
        // Try 10-45, then 8-45, then 5-45
        let adaptiveMinSq = 10 * 10;
        validTiles = cache.tiles.filter(tile => {
            const dx = tile.x + 0.5 - playerPos.x;
            const dz = tile.z + 0.5 - playerPos.z;
            const distSq = dx * dx + dz * dz;
            return distSq >= adaptiveMinSq && distSq <= maxSq;
        });
        
        if (validTiles.length === 0) {
            adaptiveMinSq = 8 * 8;
            validTiles = cache.tiles.filter(tile => {
                const dx = tile.x + 0.5 - playerPos.x;
                const dz = tile.z + 0.5 - playerPos.z;
                const distSq = dx * dx + dz * dz;
                return distSq >= adaptiveMinSq && distSq <= maxSq;
            });
        }
        
        if (validTiles.length === 0) {
            adaptiveMinSq = 5 * 5;
            validTiles = cache.tiles.filter(tile => {
                const dx = tile.x + 0.5 - playerPos.x;
                const dz = tile.z + 0.5 - playerPos.z;
                const distSq = dx * dx + dz * dz;
                return distSq >= adaptiveMinSq && distSq <= maxSq;
            });
        }
        
        if (validTiles.length > 0 && (isDebugEnabled('spawn', 'validation') || isDebugEnabled('spawn', 'distance') || isDebugEnabled('spawn', 'all'))) {
            const adaptiveMin = Math.sqrt(adaptiveMinSq).toFixed(0);
            debugLog('groups', `${player.name}: Using adaptive range (${adaptiveMin}-${MAX_SPAWN_DISTANCE}) for group cache - found ${validTiles.length} tiles`);
        }
    }

    if (isGroupCache && cache.tiles.length !== validTiles.length) {
        const actualMin = validTiles.length > 0 && validTiles.length < cache.tiles.length ? 
            (validTiles.some(t => {
                const dx = t.x + 0.5 - playerPos.x;
                const dz = t.z + 0.5 - playerPos.z;
                return Math.sqrt(dx * dx + dz * dz) < MIN_SPAWN_DISTANCE;
            }) ? "adaptive" : MIN_SPAWN_DISTANCE) : MIN_SPAWN_DISTANCE;
        debugLog('groups', `${player.name}: Filtered group cache tiles from ${cache.tiles.length} to ${validTiles.length} (within ${actualMin}-${MAX_SPAWN_DISTANCE} blocks of player)`);
    }

    const density = validTiles.length;
    let spacing = BASE_MIN_TILE_SPACING;
    // On day 20+, reduce spacing further if we have good density
    if (currentDay >= 20) {
        if (density > 30) spacing = 2; // Very dense areas: 2 block spacing (lowered threshold from 40)
        else if (density > 10) spacing = 2.5; // Medium density: 2.5 block spacing (lowered threshold from 20)
        else spacing = 2.5; // Low density: 2.5 block spacing (reduced from 3)
    } else if (density > 60) {
        spacing -= 1;
    }
    spacing = Math.max(2, spacing);

        const sampled = sampleTiles(validTiles, MAX_CANDIDATES_PER_SCAN);
        const spacedTiles = filterTilesWithSpacing(sampled, spacing, MAX_SPACED_TILES);
        
        // Debug: show spacing info
        if ((isDebugEnabled('spawn', 'spacing') || isDebugEnabled('spawn', 'all')) && spacedTiles.length > 0) {
            const avgDist = calculateAverageSpacing(spacedTiles);
            console.warn(`[SPAWN DEBUG] ${player.name}: ${spacedTiles.length} spaced tiles (spacing: ${spacing.toFixed(1)}, avg dist: ${avgDist.toFixed(1)} blocks, group: ${isGroupCache}), sampled: ${sampled.length}, valid: ${validTiles.length}`);
        }
        if ((isDebugEnabled('spawn', 'spacing') || isDebugEnabled('spawn', 'all')) && spacedTiles.length === 0 && validTiles.length > 0) {
            console.warn(`[SPAWN DEBUG] ${player.name}: Spacing filter removed all tiles! Valid: ${validTiles.length}, Sampled: ${sampled.length}, Spacing: ${spacing.toFixed(1)}`);
        }

    return { density, spacedTiles, spacing };
}

// ============================================================================
// SECTION 11: SPAWN LOGIC FUNCTIONS
// ============================================================================
// Functions for calculating spawn chances, limits, and attempting spawns
// ============================================================================

function getMaxCount(config, day) {
    if (!config.maxCountStep || !config.maxCountStepDays) {
        const baseCap = config.maxCountCap ?? config.baseMaxCount;
        // For day 20+ variants, apply late ramp cap scaling
        if (day >= 20 && config.lateRamp) {
            const rampInfo = getLateRampInfo(config, day);
            return Math.min(config.baseMaxCount, Math.max(baseCap, rampInfo.maxCountCap));
        }
        return Math.min(config.baseMaxCount, baseCap);
    }
    const steps = Math.max(0, Math.floor((day - config.startDay) / config.maxCountStepDays));
    const count = config.baseMaxCount + steps * config.maxCountStep;
    
    // For day 20+ variants, apply late ramp cap scaling
    if (day >= 20 && config.lateRamp) {
        const rampInfo = getLateRampInfo(config, day);
        return Math.min(count, rampInfo.maxCountCap);
    }
    
    return Math.min(count, config.maxCountCap ?? count);
}

function getLateRampInfo(config, day) {
    if (day < 20) return config.lateRamp;
    const over = day - 20;
    const tierSpan = config.lateRamp.tierSpan;
    const chanceStep = config.lateRamp.chanceStep;
    const maxChance = config.lateRamp.maxChance;
    const capStep = config.lateRamp.capStep;
    const capBonusMax = config.lateRamp.capBonusMax;
    const maxCountCap = config.lateRamp.maxCountCap;

    const currentTier = Math.min(Math.floor(over / tierSpan), tierSpan - 1);
    let currentChance = maxChance - currentTier * chanceStep;
    let currentCapStep = capStep + currentTier;
    let currentCapBonusMax = capBonusMax + currentTier;
    let currentMaxCountCap = maxCountCap + (currentTier * capStep); // Cap grows with each tier

    // Post-day 25: Accelerated difficulty scaling
    if (day >= 25) {
        const post25 = day - 25;
        const post25Tiers = Math.floor(post25 / (tierSpan / 2)); // Faster tier progression (every tierSpan/2 days)
        
        // Increase chance cap faster
        currentChance = Math.min(0.99, currentChance + (post25Tiers * chanceStep * 0.5));
        
        // Increase cap growth faster
        currentCapStep += post25Tiers;
        currentCapBonusMax += post25Tiers;
        currentMaxCountCap += (post25Tiers * capStep * 2); // Double cap growth rate
    }

    return {
        tierSpan,
        chanceStep,
        maxChance: Math.min(0.99, currentChance),
        capStep: currentCapStep,
        capBonusMax: currentCapBonusMax,
        maxCountCap: currentMaxCountCap
    };
}

function getLateMultipliers(config, day) {
    if (day < 20) return { chanceMultiplier: 1, chanceCap: config.maxChance ?? 1, extraCount: 0 };

    const over = day - 20;
    let chanceMultiplier = 1 + Math.min(0.6, over * 0.03);
    let chanceCap = config.maxChance ? Math.min(config.maxChance * 1.2, 0.95) : 0.95;

    // Post-day 25: Increased difficulty scaling
    if (day >= 25) {
        const post25 = day - 25;
        // Additional multiplier after day 25 (stacks with existing scaling)
        chanceMultiplier += Math.min(0.4, post25 * 0.02); // Up to +40% additional chance multiplier
        chanceCap = Math.min(chanceCap * 1.15, 0.99); // Increase cap by 15% (capped at 99%)
    }

    let extraCount = 0;
    if (config.id === DAY20_BEAR_ID) {
        // Extra count scales up significantly for day 20+ normal bears
        extraCount = Math.min(10, Math.floor(over / 3)); // Up to +10 extra at day 50+
        // Post-day 25: Additional extra count
        if (day >= 25) {
            extraCount += Math.min(5, Math.floor((day - 25) / 5)); // Up to +5 more after day 25
        }
    } else if (config.id === INFECTED_BEAR_DAY20_ID) {
        // Extra count scales up for day 20+ infected bears
        extraCount = Math.min(8, Math.floor(over / 4)); // Up to +8 extra at day 52+
        // Post-day 25: Additional extra count
        if (day >= 25) {
            extraCount += Math.min(4, Math.floor((day - 25) / 6)); // Up to +4 more after day 25
        }
    } else if (config.id === FLYING_BEAR_DAY20_ID || config.id === MINING_BEAR_DAY20_ID || config.id === TORPEDO_BEAR_DAY20_ID) {
        extraCount = Math.min(4, Math.floor(over / 6));
        if (day >= 25) {
            extraCount += Math.min(2, Math.floor((day - 25) / 8));
        }
    }

    return { chanceMultiplier, chanceCap, extraCount };
}

// Batch entity count check for all players in same dimension (more efficient)
function getBatchEntityCounts(dimension, players, totalPlayerCount = 1) {
    if (players.length === 0) return new Map();
    
    const now = system.currentTick;
    const cacheTTL = getEntityCountCacheTTL(totalPlayerCount);
    const results = new Map();
    const playersNeedingRefresh = [];
    
    // Check which players need refresh
    for (const player of players) {
        const cache = entityCountCache.get(player.id);
        if (!cache || now - cache.tick > cacheTTL) {
            playersNeedingRefresh.push(player);
        } else {
            // Ensure counts is always a valid object (fixes "cannot convert to object" errors)
            const counts = cache.counts && typeof cache.counts === 'object' ? cache.counts : {};
            results.set(player.id, counts);
        }
    }
    
    // If all players have valid cache, return cached results
    if (playersNeedingRefresh.length === 0) {
        return results;
    }
    
    // Batch check: Get entities for all players at once using a larger radius
    try {
        const maxRadius = Math.max(...SPAWN_CONFIGS.map(c => c.spreadRadius));
        const mbTypePrefixes = ["mb:mb", "mb:infected", "mb:buff_mb", "mb:flying_mb", "mb:mining_mb", "mb:torpedo_mb"];
        
        // Calculate center point of all players for batch query
        let centerX = 0, centerZ = 0;
        let validPlayerCount = 0;
        for (const player of playersNeedingRefresh) {
            const actualPos = getActualPlayerPosition(player);
            if (!actualPos) continue;
            centerX += actualPos.x;
            centerZ += actualPos.z;
            validPlayerCount++;
        }
        if (validPlayerCount > 0) {
            centerX /= validPlayerCount;
            centerZ /= validPlayerCount;
        }
        
        // Use larger radius to cover all players (max distance between players + spawn radius)
        let maxPlayerDistance = 0;
        for (const player of playersNeedingRefresh) {
            const actualPos = getActualPlayerPosition(player);
            if (!actualPos) continue;
            const dx = actualPos.x - centerX;
            const dz = actualPos.z - centerZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            maxPlayerDistance = Math.max(maxPlayerDistance, dist);
        }
        const batchRadius = maxPlayerDistance + maxRadius;
        
        // Single API call for all players
        // Get Y coordinate from first valid player's actual position
        let centerY = 64; // Default fallback
        for (const player of playersNeedingRefresh) {
            const actualPos = getActualPlayerPosition(player);
            if (actualPos) {
                centerY = actualPos.y;
                break;
            }
        }
        const allEntities = dimension.getEntities({
            location: { x: centerX, y: centerY, z: centerZ },
            maxDistance: batchRadius,
            excludeTypes: [],
            excludeFamilies: []
        });
        
        // Distribute entities to players based on distance
        const playerCounts = new Map();
        for (const player of playersNeedingRefresh) {
            playerCounts.set(player.id, {});
        }
        
        let processedCount = 0;
        const MAX_ENTITY_PROCESS_COUNT = 300; // Slightly higher for batch processing
        
        for (const entity of allEntities) {
            if (processedCount++ > MAX_ENTITY_PROCESS_COUNT) break;
            
            try {
                const typeId = entity.typeId;
                if (!mbTypePrefixes.some(prefix => typeId.startsWith(prefix))) continue;
                
                const entityPos = entity.location;
                
                // Assign entity to nearest player(s) within range
                for (const player of playersNeedingRefresh) {
                    const actualPos = getActualPlayerPosition(player);
                    if (!actualPos) continue;
                    const dx = entityPos.x - actualPos.x;
                    const dy = entityPos.y - actualPos.y;
                    const dz = entityPos.z - actualPos.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    
                    if (distSq <= maxRadius * maxRadius) {
                        const counts = playerCounts.get(player.id);
                        counts[typeId] = (counts[typeId] || 0) + 1;
                    }
                }
            } catch (error) {
                // Skip invalid entities
            }
        }
        
        // Update cache and results
        for (const player of playersNeedingRefresh) {
            let counts = playerCounts.get(player.id);
            // Ensure counts is always a valid object (fixes "cannot convert to object" errors)
            if (!counts || typeof counts !== 'object') {
                counts = {};
            }
            const cache = {
                counts,
                tick: now
            };
            entityCountCache.set(player.id, cache);
            results.set(player.id, counts);
        }
    } catch (error) {
        errorLog(`Error in batch entity count check`, error);
        // Fall back to individual checks
        for (const player of playersNeedingRefresh) {
            const counts = getEntityCountsForPlayer(player, dimension, player.location, totalPlayerCount);
            // Ensure counts is always a valid object (fixes "cannot convert to object" errors)
            results.set(player.id, counts && typeof counts === 'object' ? counts : {});
        }
    }
    
    return results;
}

function getEntityCountsForPlayer(player, dimension, playerPos, totalPlayerCount = 1) {
    const playerId = player.id;
    const now = system.currentTick;
    let cache = entityCountCache.get(playerId);
    
    const cacheTTL = getEntityCountCacheTTL(totalPlayerCount);
    if (!cache || now - cache.tick > cacheTTL) {
        try {
            // Refresh entity counts - use filter to only get Maple Bear entities (more efficient)
            const maxRadius = Math.max(...SPAWN_CONFIGS.map(c => c.spreadRadius));
            const mbTypePrefixes = ["mb:mb", "mb:infected", "mb:buff_mb", "mb:flying_mb", "mb:mining_mb", "mb:torpedo_mb"];
            
            // Use filter to reduce entity processing overhead
            const allNearbyEntities = dimension.getEntities({
                location: playerPos,
                maxDistance: maxRadius,
                excludeTypes: [], // We'll filter manually for better control
                excludeFamilies: [] // We want all entities to check their typeId
            });
            
            const counts = {};
            let processedCount = 0;
            const MAX_ENTITY_PROCESS_COUNT = 200; // Limit processing to prevent lag with too many entities
            
            for (const entity of allNearbyEntities) {
                // Early exit if too many entities (performance protection)
                if (processedCount++ > MAX_ENTITY_PROCESS_COUNT) {
                    break;
                }
                
                try {
                    const typeId = entity.typeId;
                    if (mbTypePrefixes.some(prefix => typeId.startsWith(prefix))) {
                        counts[typeId] = (counts[typeId] || 0) + 1;
                    }
                } catch (error) {
                    // Entity might have been removed - skip it
                    if (error && !error.message?.includes('invalid') && !error.message?.includes('removed')) {
                        errorLog(`Error processing entity in getEntityCountsForPlayer`, error, {
                            player: player.name,
                            entityType: entity?.typeId || 'unknown'
                        });
                    }
                }
            }
            
            cache = {
                counts,
                tick: now
            };
            entityCountCache.set(playerId, cache);
        } catch (error) {
            errorLog(`Error getting entity counts for player ${player.name}`, error, {
                player: player.name,
                dimension: dimension.id,
                position: playerPos
            });
            // Return empty counts on error
            return {};
        }
    }
    
    // Ensure we always return a valid object (fixes "cannot convert to object" errors)
    return cache && cache.counts && typeof cache.counts === 'object' ? cache.counts : {};
}

function attemptSpawnType(player, dimension, playerPos, tiles, config, modifiers = {}, entityCounts = {}, spawnCount = {}, nearbyPlayerCount = 1, totalPlayerCountInDimension = 1) {
    // Defensive checks: ensure all parameters are valid objects/arrays (fixes "cannot convert to object" errors)
    if (!modifiers || typeof modifiers !== 'object') modifiers = {};
    if (!entityCounts || typeof entityCounts !== 'object') entityCounts = {};
    if (!spawnCount || typeof spawnCount !== 'object') spawnCount = { value: 0 };
    if (!Array.isArray(tiles)) tiles = [];
    
    const currentDay = getCurrentDay();
    if (currentDay < config.startDay || currentDay > config.endDay) return false;

    const late = getLateMultipliers(config, currentDay);
    const isMilestone = isMilestoneDay(currentDay);

    const key = `${player.id}:${config.id}`;
    const lastTick = lastSpawnTickByType.get(key) || 0;
    if (system.currentTick - lastTick < config.delayTicks) {
        return false;
    }

    let maxCount = getMaxCount(config, currentDay);
    maxCount += modifiers.extraCount ?? 0;
    maxCount += late.extraCount;

    const capLimit = config.maxCountCap ?? Infinity;
    maxCount = Math.min(maxCount, capLimit);

    if (isMilestone) {
        maxCount = Math.min(maxCount + 1, capLimit);
    }

    // Use cached entity count instead of querying
    const nearbyCount = entityCounts[config.id] || 0;
    if (nearbyCount >= maxCount) {
        return false; // Too many of this type nearby - stop spawning until some are killed
    }
    
    // Note: Type-based caps are now the primary control mechanism
    // Global cap check removed - type caps (75 tiny, 50 infected, 20 mining, 30 flying, 10 torpedo) handle limits
    // Maximum theoretical total if all types hit their caps: 185 bears
    
    // Check buff bear limit - dynamic cap based on nearby player count
    if (config.id === BUFF_BEAR_ID || config.id === BUFF_BEAR_DAY13_ID || config.id === BUFF_BEAR_DAY20_ID) {
        const buffBearCount = (entityCounts[BUFF_BEAR_ID] || 0) + 
                             (entityCounts[BUFF_BEAR_DAY13_ID] || 0) + 
                             (entityCounts[BUFF_BEAR_DAY20_ID] || 0);
        
        // Dynamic cap based on player count (passed as parameter):
        // 1 player: 1 buff bear
        // 2 players: 1 buff bear
        // 3 players: 2 buff bears
        // 4 players: 2 buff bears
        // 5+ players: 3 buff bears
        let maxBuffBears;
        if (nearbyPlayerCount <= 2) {
            maxBuffBears = 1;
        } else if (nearbyPlayerCount <= 4) {
            maxBuffBears = 2;
        } else {
            maxBuffBears = 3;
        }
        
        if (buffBearCount >= maxBuffBears) {
            return false; // Too many buff bears for this player count - stop spawning
        }
    }
    
    // Check type-based spawn caps (all variants of a type count toward the same cap)
    const entityType = getEntityType(config.id);
    if (entityType && ENTITY_TYPE_CAPS[entityType] !== undefined) {
        const typeCount = getTypeCount(entityCounts, entityType);
        const typeCap = ENTITY_TYPE_CAPS[entityType];
        
        // Debug logging for type caps
        if (typeCount >= typeCap) {
            debugLog('spawn', `${config.id} (${entityType}): Type cap reached (${typeCount}/${typeCap}) - blocking spawn`);
            return false; // Too many of this type nearby - stop spawning until some are killed
        } else {
            debugLog('spawn', `${config.id} (${entityType}): Type count ${typeCount}/${typeCap} - allowing spawn`);
        }
    }

    // Throttle spawns per tick (per-player limit - dynamic based on day and player count)
    // Use cached player count passed as parameter (avoids expensive getPlayers() call)
    const maxSpawnsPerTick = getMaxSpawnsPerTick(currentDay, totalPlayerCountInDimension);
    if (spawnCount.value >= maxSpawnsPerTick) {
        // console.warn(`[SPAWN DEBUG] Per-player spawn limit reached for ${player.name} (${spawnCount.value}/${maxSpawnsPerTick})`);
        return false;
    }
    
    // Global spawn limit check (prevents total entity explosion across all players)
    if (globalSpawnCount >= MAX_GLOBAL_SPAWNS_PER_TICK) {
        // console.warn(`[SPAWN DEBUG] Global spawn limit reached (${globalSpawnCount}/${MAX_GLOBAL_SPAWNS_PER_TICK})`);
        return false;
    }

    // Per-type spawn limit per tick (prevents one type from dominating)
    const perTypeSpawnLimit = getPerTypeSpawnLimit(currentDay, config);
    const typeSpawnKey = `${player.id}:${config.id}:tick`;
    const typeSpawnCount = spawnCount.perType?.[config.id] || 0;
    if (typeSpawnCount >= perTypeSpawnLimit) {
        // Don't log this - it's normal behavior
        return false; // Too many of this type spawned this tick
    }

    // For flying/torpedo bears: add air spawn tiles (air gets more infected over time)
    const pool = [...tiles];
    const isFlyingOrTorpedo = config.id === FLYING_BEAR_ID || config.id === FLYING_BEAR_DAY15_ID || 
                               config.id === FLYING_BEAR_DAY20_ID || config.id === TORPEDO_BEAR_ID || 
                               config.id === TORPEDO_BEAR_DAY20_ID;
    if (isFlyingOrTorpedo) {
        const settings = FLYING_SPAWN_SETTINGS[config.id];
        if (settings) {
            const airTiles = generateAirSpawnTiles(dimension, playerPos, settings.minAbsoluteY, settings.minAbsoluteY + 60, 20);
            if (Array.isArray(airTiles)) {
                pool.push(...airTiles);
            }
        }
    }
    
    // Single player bonus: more spawn attempts to compensate for fewer tiles
    // With multiple players, reduce attempts per config to spread load and prevent lag
    const baseAttempts = Math.max(1, SPAWN_ATTEMPTS + (modifiers.attemptBonus ?? 0));
    // modifiers.isGroupCache is true when useGroupCache && dimensionPlayers && dimensionPlayers.length > 1
    // Use helper function: pass modifiers.isGroupCache as useGroupCache, and a dummy array when group cache is active
    // to ensure the helper returns false (since groupPlayers.length > 1 means not single-player)
    const isSinglePlayer = isSinglePlayerMode(modifiers.isGroupCache, modifiers.isGroupCache ? [1, 2] : null);
    let attemptBonus = isSinglePlayer ? Math.floor(baseAttempts * 0.5) : 0; // 50% more attempts for single players (increased from 30%)
    
    // Performance optimization: Reduce attempts when multiple players are present
    // This spreads spawn load across players and prevents lag spikes
    const isTightGroup = modifiers.isTightGroup || false;
    let multiplayerAttemptReduction = 1.0;
    if (totalPlayerCountInDimension > 1) {
        if (isTightGroup) {
            // Tight group: More aggressive reduction (50% of normal attempts since it's one check for group)
            multiplayerAttemptReduction = 0.5;
        } else {
            // Spread group: Normal reduction, but reduce by 30% since they share area
            // 2 players: 0.9x * 0.7 = 0.63x, 3 players: 0.8x * 0.7 = 0.56x, 4+ players: 0.7x * 0.7 = 0.49x
            const baseReduction = totalPlayerCountInDimension === 2 ? 0.9 : totalPlayerCountInDimension === 3 ? 0.8 : 0.7;
            multiplayerAttemptReduction = baseReduction * 0.7; // 30% reduction for spread groups
        }
    }
    
    const attempts = Math.min(Math.floor((baseAttempts + attemptBonus) * multiplayerAttemptReduction), pool.length);
    // console.warn(`[SPAWN DEBUG] Attempting ${config.id} for ${player.name}: ${attempts} attempts, ${pool.length} tiles, ${nearbyCount}/${maxCount} nearby (type limit: ${typeSpawnCount}/${perTypeSpawnLimit})`);

    // Spread spawn attempts across multiple ticks to prevent lag spikes
    // Limit spawn attempts per tick per player based on player count
    let maxAttemptsPerTick;
    if (isTightGroup) {
        // Tight group: Distribute attempts across players in group
        // Allow 1-2 attempts per tick (rotating through players over time)
        // This gives better spawn distribution while keeping load manageable
        maxAttemptsPerTick = Math.min(2, Math.max(1, Math.floor(attempts / totalPlayerCountInDimension)));
    } else {
        maxAttemptsPerTick = totalPlayerCountInDimension === 1 ? attempts : 
                            totalPlayerCountInDimension === 2 ? Math.max(3, Math.floor(attempts * 0.6)) :
                            totalPlayerCountInDimension === 3 ? Math.max(2, Math.floor(attempts * 0.5)) :
                            Math.max(1, Math.floor(attempts * 0.4)); // 4+ players: very limited per tick
    }
    
    // Progressive spawn rate: Start at 50% in new areas, ramp to 100% over 10-15 seconds
    let progressiveSpawnMultiplier = 1.0;
    try {
        const playerChunkKey = getChunkKey(playerPos.x, playerPos.z);
        const firstEnteredTick = areaFirstEntered.get(playerChunkKey);
        if (firstEnteredTick) {
            const timeSinceEntry = system.currentTick - firstEnteredTick;
            if (timeSinceEntry < PROGRESSIVE_SPAWN_RAMP_START) {
                // First 5 seconds: 50% spawn rate
                progressiveSpawnMultiplier = PROGRESSIVE_SPAWN_INITIAL_RATE;
            } else if (timeSinceEntry < (PROGRESSIVE_SPAWN_RAMP_START + PROGRESSIVE_SPAWN_RAMP_DURATION)) {
                // Ramp from 50% to 100% over 10 seconds
                const rampProgress = (timeSinceEntry - PROGRESSIVE_SPAWN_RAMP_START) / PROGRESSIVE_SPAWN_RAMP_DURATION;
                progressiveSpawnMultiplier = PROGRESSIVE_SPAWN_INITIAL_RATE + (rampProgress * (1.0 - PROGRESSIVE_SPAWN_INITIAL_RATE));
            }
            // After 15 seconds: 100% spawn rate (multiplier = 1.0)
        }
    } catch (error) {
        // On error, use full spawn rate
    }
    
    // Reduce attempts to spread across ticks, then apply progressive spawn multiplier
    const attemptsThisTick = Math.min(attempts, maxAttemptsPerTick);
    const finalAttemptsThisTick = Math.max(1, Math.floor(attemptsThisTick * progressiveSpawnMultiplier));

    let chance = config.baseChance + (config.chancePerDay ?? 0) * Math.max(0, currentDay - config.startDay);
    chance *= late.chanceMultiplier;
    chance *= modifiers.chanceMultiplier ?? 1;
    
    // Spawn rate compensation: Boost spawn chance when fewer tiles are available (due to reduced scanning)
    // Expected tiles for single player: ~50-100 tiles typical, use 75 as baseline
    const expectedTiles = 75;
    const availableTiles = pool.length;
    const tileDensityRatio = Math.min(1.0, availableTiles / expectedTiles);
    
    // Tile density-based spawn chance adjustment
    if (availableTiles < 10) {
        // Low tile density: Increase spawn chance by 20-30%
        chance *= 1.25;
    } else if (availableTiles >= 30) {
        // High tile density: Slight reduction (5-10%) to prevent over-spawning
        chance *= 0.95;
    }
    
    // Additional compensation for multiplayer when tiles are reduced
    if (tileDensityRatio < 1.0 && totalPlayerCountInDimension > 1) {
        // Boost spawn chance when we have fewer tiles than expected (compensate for reduced scanning)
        const compensationMultiplier = 1.0 + (1.0 - tileDensityRatio) * 0.5; // Up to 1.5x boost
        chance *= Math.min(compensationMultiplier, 1.5); // Cap at 1.5x
    }
    
    const chanceCap = Math.min(late.chanceCap, modifiers.chanceCap ?? late.chanceCap);
    chance = Math.min(chance, chanceCap);

    if (isMilestone) {
        chance = Math.min(chance * 1.2, chanceCap);
    }
    
    // End dimension: Increase flying/torpedo bear spawn rates over time
    const dimensionId = dimension.id;
    if (dimensionId === "minecraft:the_end") {
        if (isFlyingOrTorpedo) {
            // Flying/torpedo bears get increased spawn rates in End (balanced to avoid difficulty spikes)
            let endMultiplier = 1.5; // Start at 1.5x
            if (currentDay >= 20) endMultiplier += 0.5; // 2.0x at day 20
            if (currentDay >= 30) endMultiplier += 0.5; // 2.5x at day 30
            if (currentDay >= 40) endMultiplier += 0.5; // 3.0x at day 40
            endMultiplier = Math.min(endMultiplier, 3.0); // Cap at 3.0x (reduced from 4.0x for balance)
            chance = Math.min(chance * endMultiplier, chanceCap);
        } else {
            // Other bear types get reduced spawn rates in End (more reduction to make room for flying/torpedo)
            chance = Math.min(chance * 0.35, chanceCap); // Reduced from 0.5x to 0.35x
        }
    }
    
    // High Y level boost: If player is at high altitude, increase spawn chance for flying/torpedo bears
    const playerY = playerPos.y;
    if (isFlyingOrTorpedo && playerY >= 80) {
        // Boost spawn chance by up to 30% when player is at high Y level (reduced from 50% for balance)
        const yBoost = Math.min(1.3, 1.0 + ((playerY - 80) / 100) * 0.3); // 1.0x at Y=80, 1.3x at Y=180+
        chance = Math.min(chance * yBoost, chanceCap);
    }
    // console.warn(`[SPAWN DEBUG] ${config.id} spawn chance: ${(chance * 100).toFixed(1)}% (cap: ${(chanceCap * 100).toFixed(1)}%)`);

    for (let i = 0; i < finalAttemptsThisTick && spawnCount.value < maxSpawnsPerTick && globalSpawnCount < MAX_GLOBAL_SPAWNS_PER_TICK; i++) {
        // Check per-type limit again in loop
        if (spawnCount.perType?.[config.id] >= perTypeSpawnLimit) {
            break;
        }
        
        // Check global limit in loop
        if (globalSpawnCount >= MAX_GLOBAL_SPAWNS_PER_TICK) {
            break;
        }
        
        const index = Math.floor(Math.random() * pool.length);
        const candidate = pool.splice(index, 1)[0];
        const { x, y, z } = candidate;
        
        // Check spawn attempt cache: Skip tiles that failed recently
        const tileKey = `${x},${y},${z}`;
        const attemptCache = spawnAttemptCache.get(tileKey);
        const now = system.currentTick;
        if (attemptCache && !attemptCache.success && (now - attemptCache.lastAttemptTick) < SPAWN_ATTEMPT_COOLDOWN) {
            // This tile failed recently, skip it for a few ticks
            continue;
        }

        if (Math.random() > chance) {
            // Track failed attempt in cache
            spawnAttemptCache.set(tileKey, { lastAttemptTick: now, success: false });
            // console.warn(`[SPAWN DEBUG] Skipping tile (${x}, ${y}, ${z}) for ${config.id} due to spawn chance (${(chance * 100).toFixed(1)}%)`);
            continue;
        }

        // console.warn(`[SPAWN DEBUG] Attempt ${i + 1} for ${config.id} near ${player.name} at (${x}, ${y}, ${z})`);

        const spawnLocation = getSpawnLocationForConfig(config.id, dimension, candidate);
        if (!spawnLocation) {
            // Track failed attempt (no valid spawn location)
            spawnAttemptCache.set(tileKey, { lastAttemptTick: now, success: false });
            continue;
        }
        try {
            // Ensure entity ID is a valid string
            if (!config.id || typeof config.id !== 'string') {
                continue;
            }
            
            // Try to spawn the primary entity
            let entity = null;
            let entityIdToSpawn = config.id;
            let triedFallback = false;
            
            try {
                entity = dimension.spawnEntity(entityIdToSpawn, spawnLocation);
            } catch (spawnError) {
                // Check if this is a "cannot convert to object" error (entity not registered)
                // The error message can be in different formats, so check multiple ways
                const errorMessage = spawnError?.message || String(spawnError) || '';
                const errorString = errorMessage.toLowerCase();
                const isRegistrationError = errorString.includes('cannot convert to object') || 
                                          errorString.includes('cannot convert') ||
                                          (spawnError?.name === 'TypeError' && errorString.includes('object'));
                
                if (isRegistrationError) {
                    // Entity not registered yet - try fallback
                    const fallbackId = getFallbackEntityId(entityIdToSpawn);
                    if (fallbackId) {
                        triedFallback = true;
                        try {
                            entity = dimension.spawnEntity(fallbackId, spawnLocation);
                            entityIdToSpawn = fallbackId; // Update to fallback for tracking
                            // Log successful fallback spawn
                            debugLog('spawn', `${config.id} not registered, using fallback ${fallbackId}`);
                        } catch (fallbackError) {
                            // Fallback also failed - might also not be registered
                            // Re-throw original error so it gets tracked
                            throw spawnError;
                        }
                    } else {
                        // No fallback available, re-throw original error
                        throw spawnError;
                    }
                } else {
                    // Different error, re-throw
                    throw spawnError;
                }
            }
            
            if (entity) {
                // Clear failure tracking on successful spawn
                if (entitySpawnFailures.has(config.id)) {
                    entitySpawnFailures.delete(config.id);
                }
                if (triedFallback && entitySpawnFailures.has(entityIdToSpawn)) {
                    entitySpawnFailures.delete(entityIdToSpawn);
                }
                
                // Track successful spawn attempt
                spawnAttemptCache.set(tileKey, { lastAttemptTick: now, success: true });
                
                if (triedFallback) {
                    debugLog('spawn', `${config.id} failed, spawned fallback ${entityIdToSpawn} at (${Math.floor(spawnLocation.x)}, ${Math.floor(spawnLocation.y)}, ${Math.floor(spawnLocation.z)})`);
                } else {
                    debugLog('spawn', `${config.id} spawned at (${Math.floor(spawnLocation.x)}, ${Math.floor(spawnLocation.y)}, ${Math.floor(spawnLocation.z)})`);
                }
                lastSpawnTickByType.set(key, system.currentTick);
                removeTileFromCache(player.id, candidate);
                const originalIndex = tiles.findIndex(t => t.x === x && t.y === y && t.z === z);
                if (originalIndex !== -1) {
                    tiles.splice(originalIndex, 1);
                }
                
                // Place snow layer at spawn location (all Maple Bears spawn on snow)
                // Place snow at the block below the entity (where there's air above ground)
                try {
                    const spawnY = Math.floor(spawnLocation.y - 1);
                    const snowLoc = { x: Math.floor(spawnLocation.x), y: spawnY, z: Math.floor(spawnLocation.z) };
                    const snowBlock = dimension.getBlock(snowLoc);
                    const aboveBlock = dimension.getBlock({ x: snowLoc.x, y: spawnY + 1, z: snowLoc.z });
                    
                    // Check if there's already a snow layer at the placement location - don't stack snow on snow
                    if (aboveBlock) {
                        const existingType = aboveBlock.typeId;
                        if (existingType === "mb:snow_layer" || existingType === "minecraft:snow_layer") {
                            // Already has snow layer, skip placement to avoid stacking
                        } else if (snowBlock && snowBlock.isAir !== undefined && !snowBlock.isAir && snowBlock.isLiquid !== undefined && !snowBlock.isLiquid && aboveBlock.isAir !== undefined && aboveBlock.isAir) {
                            // Place snow if the block below is solid and the space above (where entity spawns) is air
                            // Use custom snow layer if available, otherwise vanilla
                            try {
                                aboveBlock.setType("mb:snow_layer");
                            } catch {
                                aboveBlock.setType("minecraft:snow_layer");
                            }
                        }
                    }
                } catch {
                    // Ignore snow placement errors
                }
                
                // Update cached count (use the actual entity ID that spawned, not the config ID)
                entityCounts[entityIdToSpawn] = (entityCounts[entityIdToSpawn] || 0) + 1;
                spawnCount.value++;
                globalSpawnCount++; // Increment global counter to prevent entity explosion with multiple players
                // Track per-type spawn count
                if (!spawnCount.perType) spawnCount.perType = {};
                spawnCount.perType[entityIdToSpawn] = (spawnCount.perType[entityIdToSpawn] || 0) + 1;
                return true;
            } else {
                // Track failed spawn attempt (entity spawn returned null)
                spawnAttemptCache.set(tileKey, { lastAttemptTick: now, success: false });
            }
        } catch (error) {
            // Track failed spawn attempt (error during spawn)
            spawnAttemptCache.set(tileKey, { lastAttemptTick: now, success: false });
            
            // Check if this is a registration error - suppress immediately since fallback handles it
            const errorMessage = error?.message || String(error) || '';
            const errorString = errorMessage.toLowerCase();
            const isRegistrationError = errorString.includes('cannot convert to object') || 
                                      errorString.includes('cannot convert') ||
                                      (error?.name === 'TypeError' && errorString.includes('object'));
            
            if (isRegistrationError) {
                // Registration errors are handled by fallback system - don't log or track them
                // The fallback will try to spawn an alternative entity
                continue;
            }
            
            // For non-registration errors, track and log as before
            const failureInfo = entitySpawnFailures.get(config.id);
            if (failureInfo) {
                failureInfo.failureCount++;
                failureInfo.lastFailureTick = now;
            } else {
                entitySpawnFailures.set(config.id, {
                    failureCount: 1,
                    lastFailureTick: now
                });
            }
            
            // Only log if we haven't exceeded the silent threshold (to reduce spam, but keep trying to spawn)
            const currentFailureInfo = entitySpawnFailures.get(config.id);
            if (currentFailureInfo && currentFailureInfo.failureCount < MAX_FAILURES_BEFORE_SILENT) {
                errorLog(`Failed to spawn ${config.id}`, error, {
                    location: spawnLocation,
                    player: player.name,
                    dimension: dimension.id,
                    config: config.id
                });
            }
        }
    }

    return false;
}

// Calculate per-type spawn limit per tick based on day and bear type
function getPerTypeSpawnLimit(day, config) {
    // Per-type spawn limits to prevent one type from dominating
    if (config.id === BUFF_BEAR_ID || config.id === BUFF_BEAR_DAY13_ID || config.id === BUFF_BEAR_DAY20_ID) {
        return 1; // Buff bears always limited to 1 per tick
    }
    
    if (config.id === FLYING_BEAR_ID) {
        return 2;
    }
    
    if (config.id === FLYING_BEAR_DAY15_ID) {
        return 3;
    }
    
    if (config.id === MINING_BEAR_ID) {
        return 2;
    }
    
    if (config.id === FLYING_BEAR_DAY20_ID || config.id === MINING_BEAR_DAY20_ID) {
        if (day < 25) return 3;
        if (day < 30) return 4;
        return 5;
    }

    if (config.id === TORPEDO_BEAR_ID) {
        return 1;
    }

    if (config.id === TORPEDO_BEAR_DAY20_ID) {
        if (day < 28) return 2;
        return 3;
    }
    
    // Day 20+ variants get higher limits
    if (config.id === DAY20_BEAR_ID) {
        if (day < 25) return 4; // Day 20-24: 4 per tick
        if (day < 30) return 5; // Day 25-29: 5 per tick
        return 6; // Day 30+: 6 per tick
    }
    
    if (config.id === INFECTED_BEAR_DAY20_ID) {
        if (day < 25) return 3; // Day 20-24: 3 per tick
        if (day < 30) return 4; // Day 25-29: 4 per tick
        return 5; // Day 30+: 5 per tick
    }
    
    // Day 13 variants
    if (config.id === DAY13_BEAR_ID || config.id === INFECTED_BEAR_DAY13_ID) {
        return 3;
    }
    
    // Day 8 variants
    if (config.id === DAY8_BEAR_ID || config.id === INFECTED_BEAR_DAY8_ID) {
        return 2;
    }
    
    // Day 4 variants and early game
    return 2;
}

// ============================================================================
// SECTION 12: MAIN SPAWN LOOP
// ============================================================================
// Main interval loop that handles player grouping, tile collection, and spawning
// ============================================================================

// Initialize spawn controller
if (ERROR_LOGGING) {
    console.warn("[SPAWN] Maple Bear spawn controller initialized.");
}
debugLog('spawn', "Maple Bear spawn controller initialized with debugging enabled");

system.runInterval(() => {
    try {
        // Reset global spawn counter each tick
        globalSpawnCount = 0;
        
        const currentDay = getCurrentDay(); // Cache this value
        if (currentDay < 2) {
            return;
        }

        // Cleanup old cache entries periodically
        if (system.currentTick % (SCAN_INTERVAL * 5) === 0) {
            try {
                cleanupDustedDirtCache();
                // Cleanup old spawn attempt cache entries (older than 20 ticks)
                const now = system.currentTick;
                for (const [tileKey, attempt] of spawnAttemptCache.entries()) {
                    if (now - attempt.lastAttemptTick > 20) {
                        spawnAttemptCache.delete(tileKey);
                    }
                }
                // Cleanup old progressive scan cache entries (older than 20 scan intervals)
                for (const [chunkKey, info] of progressiveScanCache.entries()) {
                    if (now - info.lastScanTick > SCAN_INTERVAL * 20) {
                        progressiveScanCache.delete(chunkKey);
                    }
                }
            } catch (error) {
                errorLog(`Error in cleanupDustedDirtCache`, error);
            }
        }

    if (currentDay > lastProcessedDay) {
        if (currentDay >= 20) {
            sunriseBoostTicks = SUNRISE_BOOST_DURATION;
            // console.warn(`[SPAWN DEBUG] Day ${currentDay} sunrise surge primed.`);
        }
        
        // Post-day 25: Extended sunrise boost for increased difficulty
        if (currentDay >= 25) {
            const daysPastVictory = currentDay - 25;
            // Longer boost duration based on days past victory (up to 2x normal duration)
            const boostMultiplier = Math.min(2.0, 1.0 + (daysPastVictory * 0.05));
            sunriseBoostTicks = Math.floor(SUNRISE_BOOST_DURATION * boostMultiplier);
            
            // Periodic difficulty spike warnings
            if (daysPastVictory > 0 && daysPastVictory % 5 === 0) {
                world.sendMessage(`§c§l[INFECTION SPIKE] §r§cThe infection surges stronger on Day ${currentDay}!`);
            }
        }
        
        lastProcessedDay = currentDay;
    }

    if (sunriseBoostTicks > 0) {
        sunriseBoostTicks = Math.max(0, sunriseBoostTicks - SCAN_INTERVAL);
        // if (sunriseBoostTicks === 0) {
        //     console.warn("[SPAWN DEBUG] Sunrise surge faded.");
        // }
    }

    const sunriseActive = sunriseBoostTicks > 0;
    const spawnDifficultyState = getSpawnDifficultyState();

        // Get all players and rotate processing
        let allPlayers;
        try {
            allPlayers = world.getAllPlayers();
        } catch (error) {
            errorLog(`Error getting all players`, error);
            return;
        }
        if (allPlayers.length === 0) return;
        
        // Clear all tick trackers for this tick (fresh start each tick)
        scannedGroupsThisTick.clear();
        loggedDimensionsThisTick.clear();
        loggedSelectedGroupsThisTick.clear();
        loggedMaintainedGroupsThisTick.clear();

        // Cleanup stale player groups periodically
        if (system.currentTick % (SCAN_INTERVAL * 5) === 0) {
            try {
                cleanupPlayerGroups(allPlayers);
            } catch (error) {
                errorLog(`Error in cleanupPlayerGroups`, error);
            }
        }

        // Group players by dimension
        const playersByDimension = new Map();
        for (const player of allPlayers) {
            try {
                if (!player || !player.dimension) {
                    if (isDebugEnabled('spawn', 'general') || isDebugEnabled('spawn', 'all')) {
                        console.warn(`[SPAWN DEBUG] Player ${player?.name || 'unknown'} has no dimension`);
                    }
                    continue;
                }
                const dimId = player.dimension.id;
                if (!dimId) {
                    if (isDebugEnabled('spawn', 'general') || isDebugEnabled('spawn', 'all')) {
                        console.warn(`[SPAWN DEBUG] Player ${player.name} dimension ID is null/undefined`);
                    }
                    continue;
                }
                if (!playersByDimension.has(dimId)) {
                    playersByDimension.set(dimId, []);
                }
                playersByDimension.get(dimId).push(player);
            } catch (error) {
                errorLog(`Error grouping player ${player?.name || 'unknown'} by dimension`, error, { player: player?.name || 'unknown' });
            }
        }
        
        // Only log dimensions once per tick
        if (loggedDimensionsThisTick.size === 0) {
            const dimensionInfo = Array.from(playersByDimension.entries()).map(([dim, players]) => `${dim}: ${players.length} (${players.map(p => p.name).join(', ')})`).join('; ');
            if (dimensionInfo) {
                // Consolidation is now handled inside debugLog function
                debugLog('groups', `Players by dimension: ${dimensionInfo}`);
                for (const dim of playersByDimension.keys()) {
                    loggedDimensionsThisTick.add(dim);
                }
            }
        }

    // Process one dimension per tick (rotate)
    const dimensions = Array.from(playersByDimension.keys());
    if (dimensions.length === 0) return;
    
    const dimensionIndex = playerRotationIndex % dimensions.length;
    const dimensionId = dimensions[dimensionIndex];
    const dimensionPlayers = playersByDimension.get(dimensionId);
    if (!dimensionPlayers || dimensionPlayers.length === 0) return;
    
    // Get dimension object - validate it exists
    const dimension = dimensionPlayers[0]?.dimension;
    if (!dimension) {
        errorLog(`Dimension is null/undefined for player ${dimensionPlayers[0]?.name || 'unknown'}`, null, { dimensionId, playerCount: dimensionPlayers.length });
        return;
    }
    
    // Validate dimension ID matches
    try {
        const actualDimId = dimension.id;
        if (actualDimId !== dimensionId) {
            errorLog(`Dimension ID mismatch: expected ${dimensionId}, got ${actualDimId}`, null, { player: dimensionPlayers[0]?.name });
        }
    } catch (error) {
        errorLog(`Error getting dimension ID`, error, { dimensionId, player: dimensionPlayers[0]?.name });
    }
    
    // Optimize for 3+ players: process all players in same dimension when grouped
    // Try to use group cache if multiple players in same dimension
    const useGroupCache = dimensionPlayers.length > 1;
    
    // Check if players form a tight group (all within 32 blocks)
    const isTightGroupMode = dimensionPlayers.length > 1 && isTightGroup(dimensionPlayers);
    
    // Enhanced time-based spreading: Each player gets a unique timing offset based on their ID
    // This ensures spawn checks are spread out evenly, not bunched together
    const playerCount = dimensionPlayers.length;
    const playersToProcess = [];
    
    if (isTightGroupMode) {
        // Tight Group Mode: Process group as single unit (only one player representative)
        // Calculate base spread interval - more aggressive for tight groups
        const baseSpreadInterval = playerCount === 2 ? 4 : playerCount === 3 ? 6 : 12; // Even more spread out for tight groups
        
        // Use group center player (first player) as representative
        // Process only one player per tight group, but spread groups across ticks
        let groupHash = 0;
        for (const player of dimensionPlayers) {
            for (let j = 0; j < player.id.length; j++) {
                groupHash = ((groupHash << 5) - groupHash) + player.id.charCodeAt(j);
                groupHash = groupHash & groupHash;
            }
        }
        const groupOffset = Math.abs(groupHash) % baseSpreadInterval;
        const tickOffset = system.currentTick % baseSpreadInterval;
        
        if (tickOffset === groupOffset) {
            // Process only the first player as representative of the tight group
            playersToProcess.push(dimensionPlayers[0]);
        }
    } else {
        // Spread Group Mode or Solo Mode: Individual processing with shared cache
        // Calculate base spread interval based on player count
        // For 2 players, use interval of 2 to ensure at least one player processes each tick
        const baseSpreadInterval = playerCount === 1 ? 1 : playerCount === 2 ? 2 : playerCount === 3 ? 4 : 10; // More aggressive for 4+ players
        
        // Give each player a unique offset based on their ID hash
        // This ensures players are processed at different times, not all at once
        for (let i = 0; i < dimensionPlayers.length; i++) {
            const player = dimensionPlayers[i];
            if (!player) continue;
            
            // Create a consistent offset for this player based on their ID
            // Use a simple hash of player ID to get a consistent offset (0 to baseSpreadInterval-1)
            let playerHash = 0;
            for (let j = 0; j < player.id.length; j++) {
                playerHash = ((playerHash << 5) - playerHash) + player.id.charCodeAt(j);
                playerHash = playerHash & playerHash; // Convert to 32-bit integer
            }
            const playerOffset = Math.abs(playerHash) % baseSpreadInterval;
            
            // Check if this player should be processed this tick
            // Each player processes every baseSpreadInterval ticks, but at different offsets
            const tickOffset = system.currentTick % baseSpreadInterval;
            if (tickOffset === playerOffset) {
                playersToProcess.push(player);
            }
        }
    }
    
    // Ensure at least one player is processed per tick when there are multiple players
    // This prevents long gaps where no processing happens
    if (playersToProcess.length === 0 && playerCount > 1) {
        // If no players were selected due to spread timing, process the first player anyway
        // This ensures continuous processing for multi-player scenarios
        if (dimensionPlayers.length > 0) {
            playersToProcess.push(dimensionPlayers[0]);
            if (isDebugEnabled('spawn', 'general') || isDebugEnabled('spawn', 'all')) {
                debugLog('spawn', `No players selected by spread timing for ${playerCount}-player group, processing ${dimensionPlayers[0].name} anyway`);
            }
        }
    }
    
    if (playersToProcess.length === 0) return;
    
    // Cache dimension player count to avoid expensive getPlayers() calls inside spawn loop
    let dimensionPlayerCount = 1;
    try {
        dimensionPlayerCount = dimensionPlayers ? dimensionPlayers.length : 1;
    } catch (error) {
        // On error, default to 1
    }
    
    // Batch entity count check for all players in dimension (more efficient)
    const batchEntityCounts = dimensionPlayerCount > 1 ? getBatchEntityCounts(dimension, dimensionPlayers, dimensionPlayerCount) : new Map();
    
    // Process all selected players
    for (const player of playersToProcess) {
        if (!player) continue;

        // For tight groups, use group center instead of individual player position
        let playerPos;
        if (isTightGroupMode) {
            const groupCenter = getGroupCenter(dimensionPlayers);
            if (groupCenter) {
                playerPos = groupCenter;
            } else {
                const actualPos = getActualPlayerPosition(player);
                playerPos = actualPos || player.location;
            }
        } else {
            const actualPos = getActualPlayerPosition(player);
            playerPos = actualPos || player.location;
        }

        let tileInfo;
        try {
            tileInfo = getTilesForPlayer(player, dimension, playerPos, currentDay, useGroupCache, dimensionPlayers, dimensionPlayerCount, isTightGroupMode);
        } catch (error) {
            errorLog(`Error getting tiles for player ${player.name}`, error, {
                player: player.name,
                dimension: dimension.id,
                position: playerPos,
                useGroupCache
            });
            continue; // Skip this player, continue with next
        }
        
        const density = tileInfo?.density ?? 0;
        const spacedTiles = tileInfo?.spacedTiles ?? [];
        const spacing = tileInfo?.spacing ?? BASE_MIN_TILE_SPACING;

        // Consolidate repeated messages to prevent spam
        const now = system.currentTick;
        const tilesMessageKey = `${player.id}-tiles-${density}-${spacedTiles.length}`;
        const noTilesMessageKey = `${player.id}-no-tiles`;
        
        if (spacedTiles.length > 0) {
            // Track "using tiles" message for consolidation (in case it repeats)
            const tilesCountData = debugMessageCounts.get(tilesMessageKey);
            if (!tilesCountData) {
                // First occurrence - log immediately
                debugLog('spawn', `Using ${density} dusted tiles near ${player.name}; ${spacedTiles.length} after spacing filter (d=${spacing})`);
                debugMessageCounts.set(tilesMessageKey, { count: 1, firstTick: now, lastTick: now });
            } else {
                // Repeated message - increment count
                tilesCountData.count++;
                tilesCountData.lastTick = now;
                // Log consolidated message if interval passed or count is high
                if (now - tilesCountData.firstTick >= CONSOLIDATION_INTERVAL || tilesCountData.count >= 3) {
                    if (tilesCountData.count > 1) {
                        debugLog('spawn', `Using ${density} dusted tiles near ${player.name}; ${spacedTiles.length} after spacing filter (d=${spacing}) - ${tilesCountData.count} times`);
                    }
                    debugMessageCounts.delete(tilesMessageKey);
                }
            }
            // Clear any pending "no tiles" consolidation
            debugMessageCounts.delete(noTilesMessageKey);
        } else {
            // Track "no tiles" occurrences for consolidation
            const lastLoggedTick = debugMessageLastTick.get(noTilesMessageKey) || -1;
            const countData = debugMessageCounts.get(noTilesMessageKey);
            
            // If we already logged this message in the current tick, skip everything (don't log again)
            if (lastLoggedTick === now) {
                // Silently track but don't log
                if (countData) {
                    countData.count++;
                } else {
                    debugMessageCounts.set(noTilesMessageKey, { count: 1, firstTick: now, lastTick: now });
                }
                continue;
            }
            
            if (!countData) {
                // First occurrence - log immediately and track
                debugLog('spawn', `No valid spawn tiles for ${player.name} (density: ${density}, spaced: ${spacedTiles.length})`);
                debugMessageCounts.set(noTilesMessageKey, { count: 1, firstTick: now, lastTick: now });
                debugMessageLastTick.set(noTilesMessageKey, now);
            } else {
                // Repeated message - increment count but don't log (already logged once this tick)
                countData.count++;
                countData.lastTick = now;
                // Don't log again - the first message already appeared, and we'll show count on next tick if it continues
            }
            continue; // Skip this player, continue with next
        }

        // Early exit if too many entities nearby (skip processing)
        // Use batch entity counts if available, otherwise fall back to individual check
        let entityCounts;
        try {
            if (batchEntityCounts.has(player.id)) {
                entityCounts = batchEntityCounts.get(player.id);
            } else {
                entityCounts = getEntityCountsForPlayer(player, dimension, playerPos, dimensionPlayerCount);
            }
        } catch (error) {
            errorLog(`Error getting entity counts for player ${player.name}`, error, {
                player: player.name,
                dimension: dimension.id,
                position: playerPos
            });
            continue; // Skip this player, continue with next
        }
        
        // Ensure entityCounts is always a valid object (fixes "cannot convert to object" errors)
        if (!entityCounts || typeof entityCounts !== 'object') {
            entityCounts = {};
        }
        
        const totalNearbyBears = entityCounts && typeof entityCounts === 'object' 
            ? Object.values(entityCounts).reduce((sum, count) => sum + (count || 0), 0)
            : 0;
        
        // Debug: Show breakdown by type
        const tinyCount = getTypeCount(entityCounts, TINY_TYPE);
        const infectedCount = getTypeCount(entityCounts, INFECTED_TYPE);
        const miningCount = getTypeCount(entityCounts, MINING_TYPE);
        const flyingCount = getTypeCount(entityCounts, FLYING_TYPE);
        const torpedoCount = getTypeCount(entityCounts, TORPEDO_TYPE);
        const buffCount = (entityCounts[BUFF_BEAR_ID] || 0) + 
                         (entityCounts[BUFF_BEAR_DAY13_ID] || 0) + 
                         (entityCounts[BUFF_BEAR_DAY20_ID] || 0);
        
        debugLog('spawn', `${player.name}: ${totalNearbyBears} total bears nearby (Tiny: ${tinyCount}/75, Infected: ${infectedCount}/50, Mining: ${miningCount}/20, Flying: ${flyingCount}/30, Torpedo: ${torpedoCount}/10, Buff: ${buffCount}/dynamic), ${spacedTiles.length} spawn tiles available`);
        
        // Buff Bear Proximity Ambience Check
        // Only check if buffCount > 0 (optimization - reuse existing count data)
        try {
            const playerId = player.id;
            const currentAmbience = activeBuffAmbience.get(playerId);
            
            if (buffCount > 0) {
                // Query for buff bears within 25 blocks specifically
                const buffBearTypes = [BUFF_BEAR_ID, BUFF_BEAR_DAY13_ID, BUFF_BEAR_DAY20_ID];
                let nearestBuffBear = null;
                let nearestDistanceSq = BUFF_AMBIENCE_RANGE * BUFF_AMBIENCE_RANGE;
                
                // Check all buff bear types
                for (const buffType of buffBearTypes) {
                    const entities = dimension.getEntities({
                        location: playerPos,
                        maxDistance: BUFF_AMBIENCE_RANGE,
                        type: buffType
                    });
                    
                    for (const entity of entities) {
                        if (!entity || !entity.isValid) continue;
                        const dx = entity.location.x - playerPos.x;
                        const dy = entity.location.y - playerPos.y;
                        const dz = entity.location.z - playerPos.z;
                        const distSq = dx * dx + dy * dy + dz * dz;
                        
                        if (distSq < nearestDistanceSq) {
                            nearestDistanceSq = distSq;
                            nearestBuffBear = entity;
                        }
                    }
                }
                
                // If buff bear found within range
                if (nearestBuffBear && nearestBuffBear.isValid) {
                    // Check if we need to start or continue playing ambience
                    const soundId = Math.random() < 0.5 ? "buff_mb.nearby_1" : "buff_mb.nearby_2";
                    
                    // For looping sounds, restart every 5 seconds (100 ticks) to maintain continuous playback
                    const shouldRestart = !currentAmbience || 
                                         currentAmbience.soundId !== soundId ||
                                         (system.currentTick - currentAmbience.lastCheckTick) > 100;
                    
                    if (shouldRestart) {
                        // Start or restart ambience
                        const volumeMultiplier = getPlayerSoundVolume(player);
                        try {
                            player.playSound(soundId, { 
                                pitch: 1.0, 
                                volume: 0.6 * volumeMultiplier 
                            });
                            activeBuffAmbience.set(playerId, { 
                                soundId: soundId, 
                                lastCheckTick: system.currentTick 
                            });
                            if (isDebugEnabled('spawn', 'all')) {
                                console.warn(`[BUFF AMBIENCE] Playing ${soundId} for ${player.name} at distance ${Math.sqrt(nearestDistanceSq).toFixed(1)} blocks`);
                            }
                        } catch (error) {
                            // Log error to help debug
                            console.warn(`[BUFF AMBIENCE] Error playing sound ${soundId} for ${player.name}:`, error);
                        }
                    } else {
                        // Update last check tick
                        currentAmbience.lastCheckTick = system.currentTick;
                    }
                } else {
                    // No buff bear in range - stop ambience if playing
                    if (currentAmbience) {
                        activeBuffAmbience.delete(playerId);
                        // Note: Minecraft Bedrock doesn't have a direct way to stop sounds,
                        // but the sound will naturally fade when out of range
                    }
                }
            } else {
                // No buff bears nearby - stop ambience if playing
                if (currentAmbience) {
                    activeBuffAmbience.delete(playerId);
                }
            }
        } catch (error) {
            // Error handling for ambience check - don't break spawn system
            if (isDebugEnabled('spawn', 'all')) {
                console.warn(`[SPAWN] Error checking buff bear ambience for ${player.name}:`, error);
            }
        }
        
        // Performance optimization: Skip spawn processing only if extremely high entity count
        // Type-based caps are the primary control mechanism, but we keep a very high safety limit
        // to prevent extreme lag (theoretical max with all type caps: 185 bears)
        // Mining and torpedo bears are exempt from this cap - they cause mayhem and should always be able to spawn
        const MAX_NEARBY_BEARS_SAFETY = 200; // Very high safety limit - only for extreme cases
        // miningCount and torpedoCount already calculated above for debug logging
        const nonMayhemBears = totalNearbyBears - miningCount - torpedoCount; // Count excluding mining/torpedo
        
        // Store whether we've hit the safety cap (for use when processing configs)
        const hasHitSafetyCap = nonMayhemBears > MAX_NEARBY_BEARS_SAFETY;
        if (hasHitSafetyCap) {
            debugLog('spawn', `Safety cap reached for ${player.name} (${nonMayhemBears} non-mayhem bears > ${MAX_NEARBY_BEARS_SAFETY}), but allowing mining/torpedo spawns`);
        }
        
        // Note: Removed the 30-bear global cap check - type-based caps now handle all spawn limiting
        // Type caps: 75 tiny, 50 infected, 20 mining, 30 flying, 10 torpedo (buff bears have dynamic cap)

        // Check if single player (no group cache benefit)
        const isSinglePlayer = !useGroupCache || (dimensionPlayers && dimensionPlayers.length === 1);
        
        // Update weather cache periodically (async, won't block)
        updateWeatherCache(dimension);
        
        // Get weather multiplier
        const weatherMultiplier = getWeatherMultiplier(dimension);
        
        let chanceMultiplier = 1;
        if (currentDay >= 20) {
            chanceMultiplier *= 1 + Math.min(0.4, (currentDay - 20) * 0.02);
        }
        if (density > 80) {
            chanceMultiplier *= 1 + Math.min(0.2, (density - 80) / 300);
        }
        // Single player bonus: compensate for lack of group cache (fewer tiles = lower density)
        if (isSinglePlayer) {
            // Give single players a boost to match multiplayer spawn rates
            // This compensates for not having shared group cache tiles
            chanceMultiplier *= 1.25; // 25% boost to spawn chance
            // Also apply density bonus at lower threshold for single players
            if (density > 50) {
                chanceMultiplier *= 1 + Math.min(0.15, (density - 50) / 250);
            }
        }
        if (sunriseActive) {
            chanceMultiplier *= SUNRISE_BOOST_MULTIPLIER;
        }
        chanceMultiplier *= spawnDifficultyState.multiplier;
        chanceMultiplier *= weatherMultiplier; // Apply weather effect

        let extraCount = 0;
        if (density > 140) {
            extraCount += Math.min(1, Math.floor((density - 140) / 120));
        }
        // Single player bonus: lower threshold for extra count
        if (isSinglePlayer && density > 80) {
            extraCount += Math.min(1, Math.floor((density - 80) / 100));
        }
        if (sunriseActive) {
            extraCount += 1;
        }
        extraCount += spawnDifficultyState.extraAdjust;
        if (extraCount < 0) {
            extraCount = 0;
        }

        const modifiers = {
            chanceMultiplier,
            chanceCap: Math.min(0.99, Math.max(0.35, 0.9 + spawnDifficultyState.capAdjust)),
            extraCount,
            isGroupCache: useGroupCache && dimensionPlayers && dimensionPlayers.length > 1,
            isTightGroup: isTightGroupMode
        };
        if (spawnDifficultyState.attemptBonus !== 0) {
            modifiers.attemptBonus = (modifiers.attemptBonus || 0) + spawnDifficultyState.attemptBonus;
        }

        const timeOfDay = dimension.getTimeOfDay ? dimension.getTimeOfDay() : 0;
        const isSunsetWindow = timeOfDay >= 12000 && timeOfDay <= 12500;
        if (isSunsetWindow) {
            modifiers.chanceMultiplier *= 1.35;
            modifiers.extraCount += 1;
        }

        // Track spawns per tick for this player (per-player budget, not shared)
        const spawnCount = { value: 0 };
        
        // Get nearby player count once (cached for all spawn attempts)
        let nearbyPlayerCount = 1;
        try {
            const nearbyPlayers = dimension.getPlayers({ location: playerPos, maxDistance: MAX_SPAWN_DISTANCE });
            nearbyPlayerCount = nearbyPlayers.length;
        } catch (error) {
            // On error, default to 1
        }

        // Only process configs that are active for current day
        // Skip lower variants when higher variants are available
        let processedConfigs = 0;
        for (const config of SPAWN_CONFIGS) {
            if (currentDay < config.startDay || currentDay > config.endDay) continue;
            
            // Skip lower variants when higher variants are available
            // This ensures only the highest variant of each bear type spawns
            let shouldSkip = false;
            if (config.id === TINY_BEAR_ID && currentDay >= 4) shouldSkip = true; // Skip if day4+ variants available
            if (config.id === DAY4_BEAR_ID && currentDay >= 8) shouldSkip = true; // Skip if day8+ variants available
            if (config.id === DAY8_BEAR_ID && currentDay >= 13) shouldSkip = true; // Skip if day13+ variants available
            if (config.id === DAY13_BEAR_ID && currentDay >= 20) shouldSkip = true; // Skip if day20+ variants available
            if (config.id === INFECTED_BEAR_ID && currentDay >= 8) shouldSkip = true; // Skip if day8+ infected variants available
            if (config.id === INFECTED_BEAR_DAY8_ID && currentDay >= 13) shouldSkip = true; // Skip if day13+ infected variants available
            if (config.id === INFECTED_BEAR_DAY13_ID && currentDay >= 20) shouldSkip = true; // Skip if day20+ infected variants available
            if (config.id === FLYING_BEAR_ID && currentDay >= 15) shouldSkip = true; // Skip if day15+ flying variants available
            if (config.id === FLYING_BEAR_DAY15_ID && currentDay >= 20) shouldSkip = true; // Skip if day20+ flying variants available
            if (config.id === MINING_BEAR_ID && currentDay >= 20) shouldSkip = true; // Skip if day20+ mining variants available
            if (config.id === BUFF_BEAR_ID && currentDay >= 20) shouldSkip = true; // Skip if day20+ buff variants available
            if (config.id === BUFF_BEAR_DAY13_ID && currentDay >= 20) shouldSkip = true; // Skip if day20+ buff variants available
            if (config.id === TORPEDO_BEAR_ID && currentDay >= 20) shouldSkip = true; // Skip if day20+ torpedo variants available
            
            if (shouldSkip) continue;
            
            // Allow mining and torpedo bears to spawn even if safety cap is reached (they cause mayhem!)
            const configType = getEntityType(config.id);
            if (hasHitSafetyCap && configType !== MINING_TYPE && configType !== TORPEDO_TYPE) {
                continue; // Skip non-mayhem types if safety cap is reached
            }
            
            processedConfigs++;
            
            try {
                // Ensure modifiers is an object before spreading (fixes "cannot convert to object" error)
                const configModifiers = modifiers && typeof modifiers === 'object' ? { ...modifiers } : {};
                if (config.id === BUFF_BEAR_ID || config.id === BUFF_BEAR_DAY13_ID || config.id === BUFF_BEAR_DAY20_ID) {
                    // Reduced multiplayer bonus for buff bears (was 0.5x, now less reduction)
                    // But still reduce chance when multiple players nearby
                    const playerCount = dimensionPlayers ? dimensionPlayers.length : 1;
                    if (playerCount > 1) {
                        // Reduce chance multiplier less aggressively for multiple players
                        // Original: 0.5x, New: scales from 0.7x (2 players) to 0.6x (5+ players)
                        const multiplayerPenalty = Math.max(0.6, 0.7 - ((playerCount - 2) * 0.033));
                        configModifiers.chanceMultiplier *= multiplayerPenalty;
                    } else {
                        // Single player: keep base multiplier (no penalty)
                        configModifiers.chanceMultiplier *= 0.7; // Slight reduction even for single player
                    }
                    
                    if (config.id === BUFF_BEAR_DAY20_ID) {
                        configModifiers.chanceCap = Math.min(configModifiers.chanceCap ?? 0.99, 0.045); // Reduced from 0.065
                    } else {
                        configModifiers.chanceCap = Math.min(configModifiers.chanceCap ?? 0.99, config.id === BUFF_BEAR_ID ? 0.04 : 0.05); // Reduced caps
                    }
                    configModifiers.extraCount = Math.min(configModifiers.extraCount ?? 0, 0);
                }
                // Use cached nearby player count (calculated once above)
                const spawned = attemptSpawnType(player, dimension, playerPos, spacedTiles, config, configModifiers, entityCounts, spawnCount, nearbyPlayerCount, dimensionPlayerCount);
                debugLog('spawn', `Successfully spawned ${config.id} for ${player.name}`, spawned);
            } catch (error) {
                // Check if this is a registration error - suppress immediately since fallback handles it
                const errorMessage = error?.message || String(error) || '';
                const errorString = errorMessage.toLowerCase();
                const isRegistrationError = errorString.includes('cannot convert to object') || 
                                          errorString.includes('cannot convert') ||
                                          (error?.name === 'TypeError' && errorString.includes('object'));
                
                if (isRegistrationError) {
                    // Registration errors are handled by fallback system - don't log or track them
                    // The fallback will try to spawn an alternative entity
                    continue;
                }
                
                // For non-registration errors, track and log as before
                const failureInfo = entitySpawnFailures.get(config.id);
                if (failureInfo) {
                    failureInfo.failureCount++;
                    failureInfo.lastFailureTick = system.currentTick;
                } else {
                    entitySpawnFailures.set(config.id, {
                        failureCount: 1,
                        lastFailureTick: system.currentTick
                    });
                }
                
                // Only log if we haven't exceeded the silent threshold (to reduce spam, but keep trying to spawn)
                const currentFailureInfo = entitySpawnFailures.get(config.id);
                if (currentFailureInfo && currentFailureInfo.failureCount < MAX_FAILURES_BEFORE_SILENT) {
                    // Defensively access properties in case player/dimension became invalid
                    const playerName = (player && typeof player.name !== 'undefined') ? player.name : 'unknown';
                    const dimensionId = (dimension && typeof dimension.id !== 'undefined') ? dimension.id : 'unknown';
                    errorLog(`Error attempting spawn for ${config.id}`, error, {
                        player: playerName,
                        config: config.id,
                        currentDay,
                        dimension: dimensionId
                    });
                }
            }
        }
        debugLog('spawn', `No active spawn configs for day ${currentDay}`, processedConfigs === 0);
    }
    
    // Update player rotation index for next tick
    // Advance by the number of players actually processed to keep rotation synchronized
    const playersProcessed = playersToProcess.length;
    playerRotationIndex += playersProcessed;
    const maxPlayers = Math.max(...Array.from(playersByDimension.values()).map(arr => arr.length), 1);
    if (playerRotationIndex >= dimensions.length * maxPlayers) {
        playerRotationIndex = 0;
    }
    } catch (error) {
        errorLog(`Error in main spawn interval`, error, { currentDay: getCurrentDay() });
    }
}, SCAN_INTERVAL);