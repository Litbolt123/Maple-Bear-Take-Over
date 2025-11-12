import { system, world } from "@minecraft/server";
import { getCurrentDay, isMilestoneDay } from "./mb_dayTracker.js";

// Debug flags - set to true to enable detailed logging
const DEBUG_SPAWNING = false; // Enable detailed spawn debugging
const DEBUG_CACHE = false; // Enable cache debugging
const DEBUG_GROUPS = false; // Enable player group debugging
const ERROR_LOGGING = true; // Always log errors (recommended: true)

// Error tracking to prevent spam
const errorLogCounts = new Map(); // Track error frequency
const ERROR_LOG_COOLDOWN = 6000; // Only log same error every 100 seconds (6000 ticks)
const MAX_ERROR_LOGS = 10; // Max times to log the same error

// Helper function for conditional debug logging
function debugLog(category, message, ...args) {
    if (category === 'spawn' && DEBUG_SPAWNING) {
        console.warn(`[SPAWN DEBUG] ${message}`, ...args);
    } else if (category === 'cache' && DEBUG_CACHE) {
        console.warn(`[CACHE DEBUG] ${message}`, ...args);
    } else if (category === 'groups' && DEBUG_GROUPS) {
        console.warn(`[GROUP DEBUG] ${message}`, ...args);
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
    const contextStr = Object.keys(context).length > 0 ? ` Context: ${JSON.stringify(context)}` : '';
    if (error) {
        console.warn(`[SPAWN ERROR] ${message}${contextStr}`, error);
    } else {
        console.warn(`[SPAWN ERROR] ${message}${contextStr}`);
    }
}

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

const TARGET_BLOCK = "mb:dusted_dirt";

const SPAWN_ATTEMPTS = 18; // Increased from 12 for more spawns per cycle
const MIN_SPAWN_DISTANCE = 15;
const MAX_SPAWN_DISTANCE = 48;
const BASE_MIN_TILE_SPACING = 2.5; // blocks between spawn tiles (reduced from 3 for better coverage on day 20+)
const SCAN_INTERVAL = 100; // ticks (~5 seconds)
const BLOCK_SCAN_COOLDOWN = SCAN_INTERVAL * 1.5; // Only scan blocks every 1.5 intervals (~7.5 seconds)
const MAX_BLOCK_QUERIES_PER_SCAN = 30000; // Limit block queries per scan (reduced from 50000 for better performance)

const SUNRISE_BOOST_DURATION = 200; // ticks
const SUNRISE_BOOST_MULTIPLIER = 1.25;

const MAX_CANDIDATES_PER_SCAN = 220;
const MAX_SPACED_TILES = 90;
const CACHE_MOVE_THRESHOLD = 6; // blocks
const CACHE_MOVE_THRESHOLD_SQ = CACHE_MOVE_THRESHOLD * CACHE_MOVE_THRESHOLD;
const CACHE_TICK_TTL = SCAN_INTERVAL * 3;

const SPAWN_CONFIGS = [
    {
        id: TINY_BEAR_ID,
        startDay: 2,
        endDay: 3,
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
        endDay: 7,
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
        endDay: 7,
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
        endDay: 12,
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
        endDay: 12,
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
        id: DAY13_BEAR_ID,
        startDay: 13,
        endDay: 19,
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
        endDay: 19,
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
        id: BUFF_BEAR_ID,
        startDay: 8,
        endDay: 12,
        baseChance: 0.032,
        chancePerDay: 0.0025,
        maxChance: 0.06,
        baseMaxCount: 1,
        maxCountCap: 1,
        delayTicks: 900,
        spreadRadius: 30
    },
    {
        id: BUFF_BEAR_DAY13_ID,
        startDay: 13,
        endDay: 19,
        baseChance: 0.028,
        chancePerDay: 0.002,
        maxChance: 0.07,
        baseMaxCount: 1,
        maxCountCap: 2,
        delayTicks: 1200,
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
        baseChance: 0.035,
        chancePerDay: 0.0015,
        maxChance: 0.065,
        baseMaxCount: 1,
        maxCountCap: 2,
        delayTicks: 1400,
        spreadRadius: 34,
        lateRamp: {
            tierSpan: 8,
            chanceStep: 0.025,
            maxChance: 0.08,
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
const ENTITY_COUNT_CACHE_TTL = SCAN_INTERVAL * 2; // Refresh entity counts every 2 scan intervals
const MAX_SPAWNS_PER_TICK_PER_PLAYER_BASE = 3; // Base spawn limit (day 2) - increased from 2
const MAX_SPAWNS_PER_TICK_PER_PLAYER_MAX = 12; // Maximum spawn limit (day 20+) - increased from 8
const PLAYER_PROCESSING_ROTATION = []; // Rotate which players to process
let playerRotationIndex = 0;
let lastBlockScanTick = 0; // Track when we last did expensive block scans

// Player grouping system for overlapping spawn rectangles
const PLAYER_GROUP_OVERLAP_DISTANCE = MAX_SPAWN_DISTANCE * 2; // Players within this distance have overlapping rectangles (96 blocks)
const PLAYER_GROUP_OVERLAP_DISTANCE_SQ = PLAYER_GROUP_OVERLAP_DISTANCE * PLAYER_GROUP_OVERLAP_DISTANCE;
const playerGroups = new Map(); // playerId -> groupId
const groupCaches = new Map(); // groupId -> { tiles, density, center, tick, players: Set<playerId>, dimension }
let nextGroupId = 1;
const scannedGroupsThisTick = new Set(); // Track which groups have been scanned this tick (to avoid duplicate logs)
const loggedDimensionsThisTick = new Set(); // Track which dimensions have been logged this tick
const loggedSelectedGroupsThisTick = new Set(); // Track which groups have been logged as "selected" this tick
const loggedMaintainedGroupsThisTick = new Set(); // Track which groups have been logged as "maintained" this tick

// Calculate dynamic spawn limit based on current day
function getMaxSpawnsPerTick(day) {
    if (day < 2) return 1;
    if (day < 4) return 2; // Day 2-3: 2 spawns
    if (day < 8) return 3; // Day 4-7: 3 spawns
    if (day < 13) return 4; // Day 8-12: 4 spawns
    if (day < 20) return 5; // Day 13-19: 5 spawns
    // Day 20+: Scale from 6 to 8 based on how far past day 20
    return Math.min(MAX_SPAWNS_PER_TICK_PER_PLAYER_MAX, 6 + Math.floor((day - 20) / 5));
}

// Global cache for dusted_dirt block positions
const dustedDirtCache = new Map(); // key: "x,y,z" -> { x, y, z, tick, dimension }
const DUSTED_DIRT_CACHE_TTL = SCAN_INTERVAL * 10; // Keep cache entries for 10 scan intervals (~50 seconds)
const MAX_CACHE_SIZE = 5000; // Maximum cached positions
const CACHE_CHECK_RADIUS = 100; // Only check cached blocks within 100 blocks of player (performance optimization)
const CACHE_VALIDATION_INTERVAL = SCAN_INTERVAL * 3; // Validate cache every 3 scan intervals (~15 seconds)
const CACHE_VALIDATION_SAMPLE_SIZE = 50; // Validate up to 50 blocks per validation cycle
let lastCacheValidationTick = 0;

// Export functions for main.js to register dusted_dirt blocks
export function registerDustedDirtBlock(x, y, z, dimension = null) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    dustedDirtCache.set(key, { 
        x: Math.floor(x), 
        y: Math.floor(y), 
        z: Math.floor(z), 
        tick: system.currentTick,
        dimension: dimension ? dimension.id : null
    });
    
    // Trim cache if it gets too large
    if (dustedDirtCache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(dustedDirtCache.entries());
        entries.sort((a, b) => a[1].tick - b[1].tick); // Sort by age
        const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE * 0.2)); // Remove oldest 20%
        for (const [key] of toRemove) {
            dustedDirtCache.delete(key);
        }
    }
}

export function unregisterDustedDirtBlock(x, y, z) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    dustedDirtCache.delete(key);
}

function cleanupDustedDirtCache() {
    const now = system.currentTick;
    const toRemove = [];
    for (const [key, value] of dustedDirtCache.entries()) {
        if (now - value.tick > DUSTED_DIRT_CACHE_TTL) {
            toRemove.push(key);
        }
    }
    for (const key of toRemove) {
        dustedDirtCache.delete(key);
    }
}

// Validate cached blocks - check if they still exist and are still dusted_dirt
function validateDustedDirtCache(dimension) {
    const now = system.currentTick;
    if (now - lastCacheValidationTick < CACHE_VALIDATION_INTERVAL) {
        return; // Don't validate too frequently
    }
    lastCacheValidationTick = now;
    
    // Get a sample of cached blocks to validate (prioritize older entries)
    const entries = Array.from(dustedDirtCache.entries())
        .filter(([key, value]) => {
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
                    if (!block || block.typeId !== TARGET_BLOCK) {
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

function scanAroundDustedDirt(dimension, centerX, centerY, centerZ, seen, candidates, blockQueryCount, limit) {
    // When we find a dusted_dirt block, check nearby blocks (3x3 area) for more patches
    // This helps find clusters of dusted_dirt without much performance cost
    const scanRadius = 2; // Check 2 blocks in each direction (5x5 area total)
    let localQueries = 0;
    const maxLocalQueries = 25; // Limit local scan queries (5x5 = 25 blocks max)
    
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
                    
                    if (block.typeId === TARGET_BLOCK) {
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

function collectDustedTiles(dimension, center, minDistance, maxDistance, limit = MAX_CANDIDATES_PER_SCAN) {
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const cz = Math.floor(center.z);
    const minSq = minDistance * minDistance;
    const maxSq = maxDistance * maxDistance;
    const candidates = [];
    const seen = new Set();
    let blockQueryCount = 0;

    // Validate cache periodically
    validateDustedDirtCache(dimension);

    // First, check cached dusted_dirt positions
    const cachedTiles = [];
    const now = system.currentTick;
    const cacheMaxDistance = 45; // Stricter limit for cached blocks (45 instead of 48)
    const cacheMaxSq = cacheMaxDistance * cacheMaxDistance;
    const cacheCheckRadiusSq = CACHE_CHECK_RADIUS * CACHE_CHECK_RADIUS; // Only check blocks within this radius
    const dimensionId = dimension.id;
    
    for (const [key, value] of dustedDirtCache.entries()) {
        if (now - value.tick > DUSTED_DIRT_CACHE_TTL) continue; // Skip expired entries
        
        // Skip entries from different dimensions
        if (value.dimension && value.dimension !== dimensionId) continue;
        
        // Quick distance check: Skip cached blocks that are too far from player
        // This prevents checking thousands of cached blocks on the other side of the world
        const dx = value.x + 0.5 - center.x;
        const dz = value.z + 0.5 - center.z;
        const dy = value.y - center.y;
        const distSq = dx * dx + dz * dz;
        
        // Skip if too far from player (performance optimization)
        if (distSq > cacheCheckRadiusSq) continue;
        
        // Filter: Only use cached blocks within valid spawn distance range (15-45 blocks)
        // Skip blocks that are too close (< 15 blocks) or too far (> 45 blocks)
        if (distSq < minSq || distSq > cacheMaxSq) continue; // Outside valid range
        if (Math.abs(dy) > 30) continue; // Too far vertically
        
        // Verify block still exists and is valid spawn location
        try {
            const block = dimension.getBlock({ x: value.x, y: value.y, z: value.z });
            blockQueryCount++;
            if (block && block.typeId === TARGET_BLOCK) {
                const blockAbove = dimension.getBlock({ x: value.x, y: value.y + 1, z: value.z });
                blockQueryCount++;
                if (blockQueryCount < MAX_BLOCK_QUERIES_PER_SCAN) {
                    const blockTwoAbove = dimension.getBlock({ x: value.x, y: value.y + 2, z: value.z });
                    blockQueryCount++;
                    if (isAir(blockAbove) && isAir(blockTwoAbove)) {
                        const tileKey = `${value.x},${value.y},${value.z}`;
                        if (!seen.has(tileKey)) {
                            seen.add(tileKey);
                            cachedTiles.push({ x: value.x, y: value.y, z: value.z });
                        }
                    }
                }
            } else if (!block || block.typeId !== TARGET_BLOCK) {
                // Block no longer exists or changed, remove from cache
                unregisterDustedDirtBlock(value.x, value.y, value.z);
                debugLog('cache', `Removed invalid block from cache: ${value.x},${value.y},${value.z} (type: ${block?.typeId || 'null'})`);
            }
        } catch (error) {
            // Chunk not loaded or error, skip (but don't remove from cache - might just be unloaded)
            // Only log if it's a serious error (not chunk not loaded)
            if (error && !error.message?.includes('not loaded') && !error.message?.includes('Chunk')) {
                errorLog(`Error checking cached block`, error, { x: value.x, y: value.y, z: value.z });
            }
        }
    }
    
    // console.warn(`[SPAWN DEBUG] Found ${cachedTiles.length} valid tiles from cache (filtered by distance: ${minDistance}-${cacheMaxDistance} blocks), used ${blockQueryCount} queries`);
    candidates.push(...cachedTiles);
    
    // If we have enough tiles from cache, skip expensive scan
    if (cachedTiles.length >= 20) {
        // console.warn(`[SPAWN DEBUG] Using cached tiles only (${cachedTiles.length} tiles), skipping block scan`);
        return candidates.slice(0, limit);
    }

    // Conceptualize as a rectangular cuboid:
    // - XZ: Square area from -maxDistance to +maxDistance around player (48 blocks = 97x97 = 9,409 XZ positions)
    // - Filter: Only check XZ positions within 15-48 block distance range (ring area ≈ 6,530 XZ positions)
    // - Y: Initially ±10 blocks from player (20 blocks), expand if needed by ±15 more (30 more blocks)
    // - Math: 6,530 XZ × 20 Y = 130,600 potential blocks, but we break early on solid blocks
    // - With 30,000 query limit, we check ~23% of potential area, which is reasonable
    
    const initialYRange = 10; // Blocks above and below player
    const expandYRange = 15; // Additional blocks to check if initial scan finds few tiles
    
    // Calculate theoretical max blocks
    const xzArea = (maxDistance * 2 + 1) * (maxDistance * 2 + 1); // 97 x 97 = 9,409
    const ringArea = Math.PI * (maxDistance * maxDistance - minDistance * minDistance); // π * (48² - 15²) ≈ 6,530
    const theoreticalMaxBlocks = Math.floor(ringArea) * (initialYRange * 2 + 1); // ~6,530 × 20 ≈ 130,600
    
    // First pass: Check rectangular cuboid (XZ square, Y ± initialYRange)
    const xStart = cx - maxDistance;
    const xEnd = cx + maxDistance;
    const zStart = cz - maxDistance;
    const zEnd = cz + maxDistance;
    const yStart = cy + initialYRange;
    const yEnd = cy - initialYRange;
    
    // console.warn(`[SPAWN DEBUG] Scanning rectangular cuboid: X[${xStart} to ${xEnd}], Z[${zStart} to ${zEnd}], Y[${yEnd} to ${yStart}]`);
    // console.warn(`[SPAWN DEBUG] Theoretical max: ${xzArea} XZ positions total, ~${Math.floor(ringArea)} valid (15-48 block ring), ×${initialYRange * 2 + 1} Y levels = ~${theoreticalMaxBlocks} blocks (but we break early on solids)`);
    
    // Scan XZ rectangle, checking Y levels
    for (let x = xStart; x <= xEnd; x++) {
        if (blockQueryCount >= MAX_BLOCK_QUERIES_PER_SCAN) break;
        
        for (let z = zStart; z <= zEnd; z++) {
            if (blockQueryCount >= MAX_BLOCK_QUERIES_PER_SCAN) break;
            
            // Check if this XZ position is within valid distance range
            const dx = x + 0.5 - center.x;
            const dz = z + 0.5 - center.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minSq || distSq > maxSq) continue;
            
            // Check Y levels from top to bottom
            for (let y = yStart; y >= yEnd; y--) {
                if (blockQueryCount >= MAX_BLOCK_QUERIES_PER_SCAN) break;
                
                let block;
                try {
                    block = dimension.getBlock({ x, y, z });
                    blockQueryCount++;
                } catch (error) {
                    // Chunk not loaded - this is normal, just skip
                    if (error && error.message?.includes('not loaded') || error.message?.includes('Chunk')) {
                        continue;
                    }
                    // Unexpected error - log it
                    errorLog(`Error getting block during scan`, error, { x, y, z, dimension: dimension.id });
                    continue;
                }
                if (!block) continue;

                if (block.typeId === TARGET_BLOCK) {
                    const blockAbove = dimension.getBlock({ x, y: y + 1, z });
                    blockQueryCount++;
                    if (blockQueryCount < MAX_BLOCK_QUERIES_PER_SCAN) {
                        const blockTwoAbove = dimension.getBlock({ x, y: y + 2, z });
                        blockQueryCount++;
                        if (isAir(blockAbove) && isAir(blockTwoAbove)) {
                            const key = `${x},${y},${z}`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                candidates.push({ x, y, z });
                                // Register in cache for future use
                                registerDustedDirtBlock(x, y, z, dimension);
                                
                                // Scan around this block for nearby dusted_dirt patches
                                if (blockQueryCount < MAX_BLOCK_QUERIES_PER_SCAN - 30) { // Reserve some queries for local scan
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
                    break; // Hit solid non-target block, move to next XZ
                }
            }
        }
    }
    
    // Second pass: Expand Y range if we found few tiles and have queries left
    if (candidates.length < 10 && blockQueryCount < MAX_BLOCK_QUERIES_PER_SCAN * 0.7) {
        // console.warn(`[SPAWN DEBUG] Found only ${candidates.length} tiles, expanding Y range by ±${expandYRange} blocks`);
        const expandedYStart = cy + initialYRange + expandYRange;
        const expandedYEnd = cy - initialYRange - expandYRange;
        
        for (let x = xStart; x <= xEnd; x++) {
            if (blockQueryCount >= MAX_BLOCK_QUERIES_PER_SCAN) break;
            
            for (let z = zStart; z <= zEnd; z++) {
                if (blockQueryCount >= MAX_BLOCK_QUERIES_PER_SCAN) break;
                
                const dx = x + 0.5 - center.x;
                const dz = z + 0.5 - center.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < minSq || distSq > maxSq) continue;
                
                // Check expanded Y range (skip already checked area)
                for (let y = expandedYStart; y >= expandedYEnd; y--) {
                    if (y <= yStart && y >= yEnd) continue; // Skip already checked
                    if (blockQueryCount >= MAX_BLOCK_QUERIES_PER_SCAN) break;
                    
                    let block;
                    try {
                        block = dimension.getBlock({ x, y, z });
                        blockQueryCount++;
                    } catch (error) {
                        // Chunk not loaded - this is normal, just skip
                        if (error && error.message?.includes('not loaded') || error.message?.includes('Chunk')) {
                            continue;
                        }
                        // Unexpected error - log it
                        errorLog(`Error getting block during expanded scan`, error, { x, y, z, dimension: dimension.id });
                        continue;
                    }
                    if (!block) continue;

                    if (block.typeId === TARGET_BLOCK) {
                        const blockAbove = dimension.getBlock({ x, y: y + 1, z });
                        blockQueryCount++;
                        if (blockQueryCount < MAX_BLOCK_QUERIES_PER_SCAN) {
                            const blockTwoAbove = dimension.getBlock({ x, y: y + 2, z });
                            blockQueryCount++;
                            if (isAir(blockAbove) && isAir(blockTwoAbove)) {
                                const key = `${x},${y},${z}`;
                                if (!seen.has(key)) {
                                seen.add(key);
                                candidates.push({ x, y, z });
                                // Register in cache for future use
                                registerDustedDirtBlock(x, y, z, dimension);
                                
                                // Scan around this block for nearby dusted_dirt patches
                                if (blockQueryCount < MAX_BLOCK_QUERIES_PER_SCAN - 30) { // Reserve some queries for local scan
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
                        break;
                    }
                }
            }
        }
    }

    // console.warn(`[SPAWN DEBUG] Scanned ${blockQueryCount} blocks in rectangular cuboid, found ${candidates.length} total dusted dirt tiles (${cachedTiles.length} from cache)`);
    return candidates;
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
                    
                    const dx = player.location.x - otherPlayer.location.x;
                    const dz = player.location.z - otherPlayer.location.z;
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
            
            const dx = player.location.x - otherPlayer.location.x;
            const dz = player.location.z - otherPlayer.location.z;
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
        const x = player.location.x;
        const z = player.location.z;
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

function getTilesForPlayer(player, dimension, playerPos, currentDay, useGroupCache = false, groupPlayers = null) {
    const playerId = player.id;
    const now = system.currentTick;
    
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
                        
                        // Use group cache if it's recent and group hasn't moved much
                        if (now - groupCache.tick < CACHE_TICK_TTL && timeSinceLastScan < BLOCK_SCAN_COOLDOWN) {
                            cache = groupCache;
                            isGroupCache = true;
                            // Update player's group assignment
                            playerGroups.set(playerId, groupId);
                            // Only log cache usage when it's first created or refreshed
                            // (per-player tile counts are logged later after filtering)
                        } else {
                            // Only log when cache expires (not every time)
                            if (cacheAge >= CACHE_TICK_TTL || timeSinceLastScan >= BLOCK_SCAN_COOLDOWN) {
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
            const dx = playerPos.x - cache.center.x;
            const dz = playerPos.z - cache.center.z;
            movedSq = dx * dx + dz * dz;
            const timeSinceLastScan = now - lastBlockScanTick;
            if (movedSq > CACHE_MOVE_THRESHOLD_SQ || now - cache.tick > CACHE_TICK_TTL || timeSinceLastScan >= BLOCK_SCAN_COOLDOWN) {
                needsRescan = true;
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
                            const playerTiles = collectDustedTiles(dimension, pPos, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE, MAX_CANDIDATES_PER_SCAN);
                            
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
            const tiles = collectDustedTiles(dimension, playerPos, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE, MAX_CANDIDATES_PER_SCAN);
            cache = {
                tiles,
                density: tiles.length,
                center: { x: playerPos.x, z: playerPos.z },
                tick: now
            };
            playerTileCache.set(playerId, cache);
            isGroupCache = false;
        }
    }
    
    // Filter tiles to only include those within valid spawn distance for this specific player
    const validTiles = cache.tiles.filter(tile => {
        const dx = tile.x + 0.5 - playerPos.x;
        const dz = tile.z + 0.5 - playerPos.z;
        const distSq = dx * dx + dz * dz;
        const minSq = MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE;
        const maxSq = MAX_SPAWN_DISTANCE * MAX_SPAWN_DISTANCE;
        return distSq >= minSq && distSq <= maxSq;
    });

    if (isGroupCache && cache.tiles.length !== validTiles.length) {
        debugLog('groups', `${player.name}: Filtered group cache tiles from ${cache.tiles.length} to ${validTiles.length} (within ${MIN_SPAWN_DISTANCE}-${MAX_SPAWN_DISTANCE} blocks of player)`);
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
    // if (spacedTiles.length > 0) {
    //     const avgDist = calculateAverageSpacing(spacedTiles);
    //     console.warn(`[SPAWN DEBUG] ${player.name}: ${spacedTiles.length} spaced tiles (spacing: ${spacing.toFixed(1)}, avg dist: ${avgDist.toFixed(1)} blocks, group: ${isGroupCache})`);
    // }

    return { density, spacedTiles, spacing };
}

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
    }

    return { chanceMultiplier, chanceCap, extraCount };
}

function getEntityCountsForPlayer(player, dimension, playerPos) {
    const playerId = player.id;
    const now = system.currentTick;
    let cache = entityCountCache.get(playerId);
    
    if (!cache || now - cache.tick > ENTITY_COUNT_CACHE_TTL) {
        try {
            // Refresh entity counts
            const maxRadius = Math.max(...SPAWN_CONFIGS.map(c => c.spreadRadius));
            const allNearbyEntities = dimension.getEntities({
                location: playerPos,
                maxDistance: maxRadius
            });
            
            const counts = {};
            const mbTypePrefixes = ["mb:mb", "mb:infected", "mb:buff_mb"];
            for (const entity of allNearbyEntities) {
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
    
    return cache.counts;
}

function attemptSpawnType(player, dimension, playerPos, tiles, config, modifiers = {}, entityCounts = {}, spawnCount = {}) {
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

    // Throttle spawns per tick (global limit - dynamic based on day)
    const maxSpawnsPerTick = getMaxSpawnsPerTick(currentDay);
    if (spawnCount.value >= maxSpawnsPerTick) {
        // console.warn(`[SPAWN DEBUG] Global spawn limit reached for ${player.name} (${spawnCount.value}/${maxSpawnsPerTick})`);
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

    const pool = [...tiles];
    // Single player bonus: more spawn attempts to compensate for fewer tiles
    const baseAttempts = SPAWN_ATTEMPTS + (modifiers.attemptBonus ?? 0);
    const isSinglePlayer = !modifiers.isGroupCache;
    const attemptBonus = isSinglePlayer ? Math.floor(baseAttempts * 0.3) : 0; // 30% more attempts for single players
    const attempts = Math.min(baseAttempts + attemptBonus, pool.length);
    // console.warn(`[SPAWN DEBUG] Attempting ${config.id} for ${player.name}: ${attempts} attempts, ${pool.length} tiles, ${nearbyCount}/${maxCount} nearby (type limit: ${typeSpawnCount}/${perTypeSpawnLimit})`);

    let chance = config.baseChance + (config.chancePerDay ?? 0) * Math.max(0, currentDay - config.startDay);
    chance *= late.chanceMultiplier;
    chance *= modifiers.chanceMultiplier ?? 1;
    const chanceCap = Math.min(late.chanceCap, modifiers.chanceCap ?? late.chanceCap);
    chance = Math.min(chance, chanceCap);

    if (isMilestone) {
        chance = Math.min(chance * 1.2, chanceCap);
    }
    // console.warn(`[SPAWN DEBUG] ${config.id} spawn chance: ${(chance * 100).toFixed(1)}% (cap: ${(chanceCap * 100).toFixed(1)}%)`);

    for (let i = 0; i < attempts && spawnCount.value < maxSpawnsPerTick; i++) {
        // Check per-type limit again in loop
        if (spawnCount.perType?.[config.id] >= perTypeSpawnLimit) {
            break;
        }
        
        const index = Math.floor(Math.random() * pool.length);
        const candidate = pool.splice(index, 1)[0];
        const { x, y, z } = candidate;

        if (Math.random() > chance) {
            // console.warn(`[SPAWN DEBUG] Skipping tile (${x}, ${y}, ${z}) for ${config.id} due to spawn chance (${(chance * 100).toFixed(1)}%)`);
            continue;
        }

        // console.warn(`[SPAWN DEBUG] Attempt ${i + 1} for ${config.id} near ${player.name} at (${x}, ${y}, ${z})`);

        const spawnLocation = { x: x + 0.5, y: y + 1, z: z + 0.5 };
        try {
            const entity = dimension.spawnEntity(config.id, spawnLocation);
            if (entity) {
                debugLog('spawn', `${config.id} spawned at (${Math.floor(spawnLocation.x)}, ${Math.floor(spawnLocation.y)}, ${Math.floor(spawnLocation.z)})`);
                lastSpawnTickByType.set(key, system.currentTick);
                removeTileFromCache(player.id, candidate);
                const originalIndex = tiles.findIndex(t => t.x === x && t.y === y && t.z === z);
                if (originalIndex !== -1) {
                    tiles.splice(originalIndex, 1);
                }
                // Update cached count
                entityCounts[config.id] = (entityCounts[config.id] || 0) + 1;
                spawnCount.value++;
                // Track per-type spawn count
                if (!spawnCount.perType) spawnCount.perType = {};
                spawnCount.perType[config.id] = (spawnCount.perType[config.id] || 0) + 1;
                return true;
            }
        } catch (error) {
            // Log spawn failures - these are important to track
            errorLog(`Failed to spawn ${config.id}`, error, {
                location: spawnLocation,
                player: player.name,
                dimension: dimension.id,
                config: config.id
            });
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

// Initialize spawn controller
if (ERROR_LOGGING) {
    console.warn("[SPAWN] Maple Bear spawn controller initialized.");
}
debugLog('spawn', "Maple Bear spawn controller initialized with debugging enabled");

system.runInterval(() => {
    try {
        const currentDay = getCurrentDay(); // Cache this value
        if (currentDay < 2) {
            return;
        }

        // Cleanup old cache entries periodically
        if (system.currentTick % (SCAN_INTERVAL * 5) === 0) {
            try {
                cleanupDustedDirtCache();
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
                const dimId = player.dimension.id;
                if (!playersByDimension.has(dimId)) {
                    playersByDimension.set(dimId, []);
                }
                playersByDimension.get(dimId).push(player);
            } catch (error) {
                errorLog(`Error grouping player ${player.name} by dimension`, error, { player: player.name });
            }
        }
        
        // Only log dimensions once per tick
        if (loggedDimensionsThisTick.size === 0) {
            const dimensionInfo = Array.from(playersByDimension.entries()).map(([dim, players]) => `${dim}: ${players.length} (${players.map(p => p.name).join(', ')})`).join('; ');
            if (dimensionInfo) {
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
    
    // Get dimension object
    const dimension = dimensionPlayers[0].dimension;
    
    // Try to use group cache if multiple players in same dimension
    const useGroupCache = dimensionPlayers.length > 1;
    
    // Process one player per tick (rotate within dimension)
    const playerIndex = Math.floor(playerRotationIndex / dimensions.length) % dimensionPlayers.length;
    const player = dimensionPlayers[playerIndex];
    if (!player) return;

    const playerPos = player.location;

    // Update player rotation index for next tick
    playerRotationIndex++;
    if (playerRotationIndex >= dimensions.length * dimensionPlayers.length) {
        playerRotationIndex = 0;
    }

    let tileInfo;
    try {
        tileInfo = getTilesForPlayer(player, dimension, playerPos, currentDay, useGroupCache, dimensionPlayers);
    } catch (error) {
        errorLog(`Error getting tiles for player ${player.name}`, error, {
            player: player.name,
            dimension: dimension.id,
            position: playerPos,
            useGroupCache
        });
        return;
    }
    
    const density = tileInfo?.density ?? 0;
    const spacedTiles = tileInfo?.spacedTiles ?? [];
    const spacing = tileInfo?.spacing ?? BASE_MIN_TILE_SPACING;

    debugLog('spawn', `Using ${density} dusted tiles near ${player.name}; ${spacedTiles.length} after spacing filter (d=${spacing})`);
    if (spacedTiles.length === 0) {
        debugLog('spawn', `No valid spawn tiles for ${player.name} (density: ${density}, spaced: ${spacedTiles.length})`);
        return;
    }

    // Early exit if too many entities nearby (skip processing)
    let entityCounts;
    try {
        entityCounts = getEntityCountsForPlayer(player, dimension, playerPos);
    } catch (error) {
        errorLog(`Error getting entity counts for player ${player.name}`, error, {
            player: player.name,
            dimension: dimension.id,
            position: playerPos
        });
        return;
    }
    
    const totalNearbyBears = Object.values(entityCounts).reduce((sum, count) => sum + count, 0);
    debugLog('spawn', `${player.name}: ${totalNearbyBears} nearby bears, ${spacedTiles.length} spawn tiles available`);
    if (totalNearbyBears > 30) {
        debugLog('spawn', `Skipping ${player.name} - too many bears nearby (${totalNearbyBears})`);
        return; // Too many bears, skip this cycle
    }

    // Check if single player (no group cache benefit)
    const isSinglePlayer = !useGroupCache || (dimensionPlayers && dimensionPlayers.length === 1);
    
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

    const modifiers = {
        chanceMultiplier,
        chanceCap: 0.9,
        extraCount,
        isGroupCache: useGroupCache && dimensionPlayers && dimensionPlayers.length > 1
    };

    const timeOfDay = dimension.getTimeOfDay ? dimension.getTimeOfDay() : 0;
    const isSunsetWindow = timeOfDay >= 12000 && timeOfDay <= 12500;
    if (isSunsetWindow) {
        modifiers.chanceMultiplier *= 1.35;
        modifiers.extraCount += 1;
    }

    // Track spawns per tick for this player
    const spawnCount = { value: 0 };

    // Only process configs that are active for current day
    let processedConfigs = 0;
    for (const config of SPAWN_CONFIGS) {
        if (currentDay < config.startDay || currentDay > config.endDay) continue;
        processedConfigs++;
        
        try {
            const configModifiers = { ...modifiers };
            if (config.id === BUFF_BEAR_ID || config.id === BUFF_BEAR_DAY13_ID || config.id === BUFF_BEAR_DAY20_ID) {
                configModifiers.chanceMultiplier *= 0.5;
                if (config.id === BUFF_BEAR_DAY20_ID) {
                    configModifiers.chanceCap = Math.min(configModifiers.chanceCap, 0.065);
                } else {
                    configModifiers.chanceCap = Math.min(configModifiers.chanceCap, config.id === BUFF_BEAR_ID ? 0.06 : 0.07);
                }
                configModifiers.extraCount = Math.min(configModifiers.extraCount, 0);
            }
            const spawned = attemptSpawnType(player, dimension, playerPos, spacedTiles, config, configModifiers, entityCounts, spawnCount);
            debugLog('spawn', `Successfully spawned ${config.id} for ${player.name}`, spawned);
        } catch (error) {
            errorLog(`Error attempting spawn for ${config.id}`, error, {
                player: player.name,
                config: config.id,
                currentDay,
                dimension: dimension.id
            });
        }
    }
        debugLog('spawn', `No active spawn configs for day ${currentDay}`, processedConfigs === 0);
    } catch (error) {
        errorLog(`Error in main spawn interval`, error, { currentDay: getCurrentDay() });
    }
}, SCAN_INTERVAL);