/**
 * Shared cache system for AI scripts
 * Reduces duplicate queries across mining, torpedo, and flying AI
 */

import { world, system } from "@minecraft/server";

// Player cache - shared across all AI scripts
const PLAYER_CACHE_TICKS = 2; // Cache players for 2 ticks (same as AI_TICK_INTERVAL)
let cachedPlayers = null;
let cachedPlayersTick = 0;
let cachedPlayerPositions = null; // Map<dimensionId, positions[]>

// Mob cache - shared across all AI scripts
// Cache mobs by dimension to reduce per-entity queries
const MOB_CACHE_TICKS = 2; // Cache mobs for 2 ticks (same as AI_TICK_INTERVAL)
const MOB_CACHE_DISTANCE = 128; // Cache mobs within 128 blocks (larger than MAX_PROCESSING_DISTANCE)
let cachedMobsByDimension = new Map(); // Map<dimensionId, {mobs: Entity[], tick: number, center: {x, y, z}}>

/**
 * Get all players (cached)
 * @returns {Player[]} Array of all players
 */
export function getCachedPlayers() {
    const currentTick = system.currentTick;
    
    // Return cached players if still valid
    if (cachedPlayers && (currentTick - cachedPlayersTick) < PLAYER_CACHE_TICKS) {
        return cachedPlayers;
    }
    
    // Update cache
    try {
        cachedPlayers = world.getAllPlayers();
        cachedPlayersTick = currentTick;
        
        // Also cache player positions by dimension
        cachedPlayerPositions = new Map();
        for (const player of cachedPlayers) {
            try {
                const dimId = player.dimension.id;
                // Normalize dimension ID (minecraft:overworld -> overworld, etc.)
                const normalizedDimId = dimId.replace('minecraft:', '');
                if (!cachedPlayerPositions.has(normalizedDimId)) {
                    cachedPlayerPositions.set(normalizedDimId, []);
                }
                cachedPlayerPositions.get(normalizedDimId).push(player.location);
            } catch {
                // Skip invalid players
            }
        }
        
        return cachedPlayers;
    } catch (error) {
        // On error, return empty array
        return [];
    }
}

/**
 * Get player positions by dimension (cached)
 * @returns {Map<string, Array>} Map of dimensionId -> player positions
 */
export function getCachedPlayerPositions() {
    // Ensure cache is up to date
    getCachedPlayers();
    return cachedPlayerPositions || new Map();
}

/**
 * Clear the player cache (force refresh on next call)
 */
export function clearPlayerCache() {
    cachedPlayers = null;
    cachedPlayersTick = 0;
    cachedPlayerPositions = null;
}

/**
 * Get cached mobs for a dimension (batched query)
 * This reduces per-entity getEntities() calls by caching mobs per dimension
 * @param {Dimension} dimension - The dimension to query
 * @param {Object} center - Optional center point {x, y, z} for location-based queries
 * @param {number} maxDistance - Maximum distance from center (default: MOB_CACHE_DISTANCE)
 * @returns {Entity[]} Array of mobs in the dimension
 */
export function getCachedMobs(dimension, center = null, maxDistance = MOB_CACHE_DISTANCE) {
    if (!dimension) return [];
    
    const currentTick = system.currentTick;
    const dimId = dimension.id;
    
    // Check if we have a valid cache for this dimension
    const cached = cachedMobsByDimension.get(dimId);
    if (cached && (currentTick - cached.tick) < MOB_CACHE_TICKS) {
        // If center is provided, filter by distance
        if (center) {
            const filtered = [];
            for (const mob of cached.mobs) {
                try {
                    if (!mob.isValid()) continue;
                    const mobLoc = mob.location;
                    const dx = mobLoc.x - center.x;
                    const dy = mobLoc.y - center.y;
                    const dz = mobLoc.z - center.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq <= maxDistance * maxDistance) {
                        filtered.push(mob);
                    }
                } catch {
                    // Skip invalid mobs
                }
            }
            return filtered;
        }
        
        // Return all cached mobs if no center specified
        // Filter out invalid mobs
        return cached.mobs.filter(mob => {
            try {
                return mob.isValid();
            } catch {
                return false;
            }
        });
    }
    
    // Update cache - query all mobs in dimension
    try {
        // Use a large query to get all mobs, then filter by distance if needed
        // This batches the query instead of per-entity queries
        // Include both "mob" and "villager" families to catch all targetable entities
        const allMobs = dimension.getEntities({
            families: ["mob", "villager"]
        });
        
        // Filter out invalid mobs
        const validMobs = [];
        for (const mob of allMobs) {
            try {
                if (mob.isValid()) {
                    validMobs.push(mob);
                }
            } catch {
                // Skip invalid mobs
            }
        }
        
        // Calculate center from player positions if available
        let cacheCenter = center;
        if (!cacheCenter) {
            const playerPositions = getCachedPlayerPositions();
            const dimPlayerPositions = playerPositions.get(dimId.replace('minecraft:', '')) || [];
            if (dimPlayerPositions.length > 0) {
                // Use average player position as center
                let sumX = 0, sumY = 0, sumZ = 0;
                for (const pos of dimPlayerPositions) {
                    sumX += pos.x;
                    sumY += pos.y;
                    sumZ += pos.z;
                }
                cacheCenter = {
                    x: sumX / dimPlayerPositions.length,
                    y: sumY / dimPlayerPositions.length,
                    z: sumZ / dimPlayerPositions.length
                };
            }
        }
        
        cachedMobsByDimension.set(dimId, {
            mobs: validMobs,
            tick: currentTick,
            center: cacheCenter
        });
        
        // If center was provided, filter by distance
        if (center) {
            const filtered = [];
            for (const mob of validMobs) {
                try {
                    const mobLoc = mob.location;
                    const dx = mobLoc.x - center.x;
                    const dy = mobLoc.y - center.y;
                    const dz = mobLoc.z - center.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq <= maxDistance * maxDistance) {
                        filtered.push(mob);
                    }
                } catch {
                    // Skip invalid mobs
                }
            }
            return filtered;
        }
        
        return validMobs;
    } catch (error) {
        // On error, return empty array
        return [];
    }
}

/**
 * Clear the mob cache (force refresh on next call)
 */
export function clearMobCache() {
    cachedMobsByDimension.clear();
}

