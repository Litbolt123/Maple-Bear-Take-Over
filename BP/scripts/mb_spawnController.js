import { system, world } from "@minecraft/server";
import { getCurrentDay, isMilestoneDay } from "./mb_dayTracker.js";

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
const dustedDirtCache = new Map(); // key: "x,y,z" -> { x, y, z, tick }
const DUSTED_DIRT_CACHE_TTL = SCAN_INTERVAL * 10; // Keep cache entries for 10 scan intervals (~50 seconds)
const MAX_CACHE_SIZE = 5000; // Maximum cached positions
const CACHE_CHECK_RADIUS = 100; // Only check cached blocks within 100 blocks of player (performance optimization)

// Export functions for main.js to register dusted_dirt blocks
export function registerDustedDirtBlock(x, y, z) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    dustedDirtCache.set(key, { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), tick: system.currentTick });
    
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
                                registerDustedDirtBlock(x, y, z);
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
                } catch {
                    // Chunk not loaded, skip
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

    // First, check cached dusted_dirt positions
    const cachedTiles = [];
    const now = system.currentTick;
    const cacheMaxDistance = 45; // Stricter limit for cached blocks (45 instead of 48)
    const cacheMaxSq = cacheMaxDistance * cacheMaxDistance;
    const cacheCheckRadiusSq = CACHE_CHECK_RADIUS * CACHE_CHECK_RADIUS; // Only check blocks within this radius
    
    for (const [key, value] of dustedDirtCache.entries()) {
        if (now - value.tick > DUSTED_DIRT_CACHE_TTL) continue; // Skip expired entries
        
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
                        const key = `${value.x},${value.y},${value.z}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            cachedTiles.push({ x: value.x, y: value.y, z: value.z });
                        }
                    }
                }
            } else if (!block || block.typeId !== TARGET_BLOCK) {
                // Block no longer exists or changed, remove from cache
                unregisterDustedDirtBlock(value.x, value.y, value.z);
            }
        } catch {
            // Chunk not loaded or error, skip
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
                } catch {
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
                                registerDustedDirtBlock(x, y, z);
                                
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
                    } catch {
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
                                    registerDustedDirtBlock(x, y, z);
                                    
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
    const cache = playerTileCache.get(playerId);
    if (!cache || !Array.isArray(cache.tiles)) return;
    const index = cache.tiles.findIndex((cached) => cached.x === tile.x && cached.y === tile.y && cached.z === tile.z);
    if (index !== -1) {
        cache.tiles.splice(index, 1);
        cache.density = cache.tiles.length;
    }
}

function getTilesForPlayer(player, dimension, playerPos, currentDay) {
    const playerId = player.id;
    const now = system.currentTick;
    let cache = playerTileCache.get(playerId);
    let needsRescan = false;
    let movedSq = 0;

    if (!cache) {
        needsRescan = true;
    } else {
        const dx = playerPos.x - cache.center.x;
        const dz = playerPos.z - cache.center.z;
        movedSq = dx * dx + dz * dz;
        // Only rescan if moved significantly OR cache expired OR it's time for a block scan
        const timeSinceLastScan = now - lastBlockScanTick;
        if (movedSq > CACHE_MOVE_THRESHOLD_SQ || now - cache.tick > CACHE_TICK_TTL || timeSinceLastScan >= BLOCK_SCAN_COOLDOWN) {
            needsRescan = true;
        }
    }

    if (needsRescan) {
        lastBlockScanTick = now;
        // console.warn(`[SPAWN DEBUG] Rescanning tiles for ${player.name} (moved: ${Math.sqrt(movedSq).toFixed(1)} blocks, cache age: ${now - (cache?.tick || 0)} ticks)`);
        const tiles = collectDustedTiles(dimension, playerPos, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE, MAX_CANDIDATES_PER_SCAN);
        cache = {
            tiles,
            density: tiles.length,
            center: { x: playerPos.x, z: playerPos.z },
            tick: now
        };
        playerTileCache.set(playerId, cache);
    }

    const density = cache.density ?? cache.tiles.length;
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

    const sampled = sampleTiles(cache.tiles, MAX_CANDIDATES_PER_SCAN);
    const spacedTiles = filterTilesWithSpacing(sampled, spacing, MAX_SPACED_TILES);
    
    // Debug: show spacing info
    // if (spacedTiles.length > 0) {
    //     const avgDist = calculateAverageSpacing(spacedTiles);
    //     console.warn(`[SPAWN DEBUG] ${player.name}: ${spacedTiles.length} spaced tiles (spacing: ${spacing.toFixed(1)}, avg dist: ${avgDist.toFixed(1)} blocks)`);
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
        // Refresh entity counts
        const maxRadius = Math.max(...SPAWN_CONFIGS.map(c => c.spreadRadius));
        const allNearbyEntities = dimension.getEntities({
            location: playerPos,
            maxDistance: maxRadius
        });
        
        const counts = {};
        const mbTypePrefixes = ["mb:mb", "mb:infected", "mb:buff_mb"];
        for (const entity of allNearbyEntities) {
            const typeId = entity.typeId;
            if (mbTypePrefixes.some(prefix => typeId.startsWith(prefix))) {
                counts[typeId] = (counts[typeId] || 0) + 1;
            }
        }
        
        cache = {
            counts,
            tick: now
        };
        entityCountCache.set(playerId, cache);
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
    const attempts = Math.min(SPAWN_ATTEMPTS + (modifiers.attemptBonus ?? 0), pool.length);
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
                // console.warn(`[SPAWN] ${config.id} spawned at (${Math.floor(spawnLocation.x)}, ${Math.floor(spawnLocation.y)}, ${Math.floor(spawnLocation.z)})`);
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
            // console.warn(`[SPAWN] Failed to spawn ${config.id} at ${spawnLocation.x}, ${spawnLocation.y}, ${spawnLocation.z}:`, error);
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

// console.warn("[SPAWN DEBUG] Maple Bear spawn controller initialized.");

system.runInterval(() => {
    const currentDay = getCurrentDay(); // Cache this value
    if (currentDay < 2) {
        return;
    }

    // Cleanup old cache entries periodically
    if (system.currentTick % (SCAN_INTERVAL * 5) === 0) {
        cleanupDustedDirtCache();
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
    const allPlayers = world.getAllPlayers();
    if (allPlayers.length === 0) return;

    // Update player rotation list
    if (PLAYER_PROCESSING_ROTATION.length !== allPlayers.length) {
        PLAYER_PROCESSING_ROTATION.length = 0;
        PLAYER_PROCESSING_ROTATION.push(...allPlayers.map((_, i) => i));
    }

    // Process one player per tick (rotate)
    const playerIndex = PLAYER_PROCESSING_ROTATION[playerRotationIndex % allPlayers.length];
    playerRotationIndex++;
    const player = allPlayers[playerIndex];
    if (!player) return;

    const dimension = player.dimension;
    const playerPos = player.location;

    const tileInfo = getTilesForPlayer(player, dimension, playerPos, currentDay);
    const density = tileInfo?.density ?? 0;
    const spacedTiles = tileInfo?.spacedTiles ?? [];
    const spacing = tileInfo?.spacing ?? BASE_MIN_TILE_SPACING;

    // console.warn(`[SPAWN DEBUG] Using ${density} dusted tiles near ${player.name}; ${spacedTiles.length} after spacing filter (d=${spacing})`);
    if (spacedTiles.length === 0) {
        // console.warn(`[SPAWN DEBUG] No valid spawn tiles for ${player.name} (density: ${density}, spaced: ${spacedTiles.length})`);
        return;
    }

    // Early exit if too many entities nearby (skip processing)
    const entityCounts = getEntityCountsForPlayer(player, dimension, playerPos);
    const totalNearbyBears = Object.values(entityCounts).reduce((sum, count) => sum + count, 0);
    // console.warn(`[SPAWN DEBUG] ${player.name}: ${totalNearbyBears} nearby bears, ${spacedTiles.length} spawn tiles available`);
    if (totalNearbyBears > 30) {
        // console.warn(`[SPAWN DEBUG] Skipping ${player.name} - too many bears nearby (${totalNearbyBears})`);
        return; // Too many bears, skip this cycle
    }

    let chanceMultiplier = 1;
    if (currentDay >= 20) {
        chanceMultiplier *= 1 + Math.min(0.4, (currentDay - 20) * 0.02);
    }
    if (density > 80) {
        chanceMultiplier *= 1 + Math.min(0.2, (density - 80) / 300);
    }
    if (sunriseActive) {
        chanceMultiplier *= SUNRISE_BOOST_MULTIPLIER;
    }

    let extraCount = 0;
    if (density > 140) {
        extraCount += Math.min(1, Math.floor((density - 140) / 120));
    }
    if (sunriseActive) {
        extraCount += 1;
    }

    const modifiers = {
        chanceMultiplier,
        chanceCap: 0.9,
        extraCount
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
        // if (spawned) {
        //     console.warn(`[SPAWN DEBUG] Successfully spawned ${config.id} for ${player.name}`);
        // }
    }
    // if (processedConfigs === 0) {
    //     console.warn(`[SPAWN DEBUG] No active spawn configs for day ${currentDay}`);
    // }
}, SCAN_INTERVAL);