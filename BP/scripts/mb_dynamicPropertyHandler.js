/**
 * Quick Dynamic Property Handler
 * Caches dynamic property reads/writes in memory for performance
 * Batches saves on server shutdown and periodic intervals
 * Based on Quick Dynamic Property Handler by 77Carchi
 */

import { system, world } from "@minecraft/server";

// Cache for player properties: playerId -> Map<key, value>
const playerPropertyCache = new Map();

// Cache for world properties: key -> value
const worldPropertyCache = new Map();

// Track which properties have been modified (need saving)
const playerDirtyFlags = new Map(); // playerId -> Set<key>
const worldDirtyFlags = new Set(); // Set<key>

// Save interval: every 600 ticks (30 seconds)
const SAVE_INTERVAL_TICKS = 600;
const MAX_DYNAMIC_PROPERTY_SIZE = 32767;
const CHUNK_SIZE = 32000;

/**
 * Initialize handler - set up event listeners and save interval
 * Note: Properties are loaded lazily on first access to avoid early execution errors
 */
export function initializePropertyHandler() {
    try {
        // Load player properties on player spawn
        world.afterEvents.playerSpawn.subscribe((event) => {
            if (event.initialSpawn) {
                loadPlayerProperties(event.player);
            }
        });
        
        // Save and clear cache when player leaves
        world.beforeEvents.playerLeave.subscribe((event) => {
            try {
                savePlayerProperties(event.player);
                clearPlayerCache(event.player.id);
            } catch (error) {
                console.warn("[PropertyHandler] Error on player leave:", error);
            }
        });
        
        // Load properties for players already in world (delayed to avoid early execution)
        system.runTimeout(() => {
            try {
                for (const player of world.getAllPlayers()) {
                    loadPlayerProperties(player);
                }
            } catch (error) {
                console.warn("[PropertyHandler] Error loading properties for existing players:", error);
            }
        }, 1);
        
        // Periodic save interval
        system.runInterval(() => {
            saveAllDirtyProperties();
        }, SAVE_INTERVAL_TICKS);
        
        // Save on world shutdown (use system shutdown event if available)
        // Note: Bedrock doesn't have a reliable shutdown event, so we rely on periodic saves
        
        console.log("[PropertyHandler] Initialized (lazy loading enabled)");
    } catch (error) {
        console.warn("[PropertyHandler] Initialization error:", error);
    }
}

/**
 * Load all properties for a player
 */
function loadPlayerProperties(player) {
    try {
        const playerId = player.id;
        const cache = new Map();
        
        // List of all player properties to load
        const playerProps = [
            "mb_codex",
            "mb_infection",
            "mb_infection_type",
            "mb_immunity_end",
            "mb_bear_hit_count",
            "mb_first_time_messages",
            "mb_max_snow_level",
            "mb_minor_infection_cured",
            "mb_permanent_immunity",
            "mb_minor_cure_golden_apple",
            "mb_minor_cure_golden_carrot",
            "mb_infection_experience",
            "mb_debug_settings",
            // Add any other player properties here
        ];
        
        for (const key of playerProps) {
            try {
                const value = player.getDynamicProperty(key);
                if (value !== undefined) {
                    cache.set(key, value);
                }
            } catch (e) {
                // Property doesn't exist yet, that's fine
            }
        }
        
        playerPropertyCache.set(playerId, cache);
        playerDirtyFlags.set(playerId, new Set());
    } catch (error) {
        console.warn(`[PropertyHandler] Failed to load properties for ${player.name}:`, error);
    }
}

/**
 * Save all dirty properties for a player
 */
function savePlayerProperties(player) {
    const playerId = player.id;
    const dirtySet = playerDirtyFlags.get(playerId);
    if (!dirtySet || dirtySet.size === 0) return;
    
    const cache = playerPropertyCache.get(playerId);
    if (!cache) return;
    
    for (const key of dirtySet) {
        try {
            const value = cache.get(key);
            if (typeof player.setDynamicProperty === 'function') {
                player.setDynamicProperty(key, value);
            }
        } catch (e) {
            console.warn(`[PropertyHandler] Failed to save property ${key}:`, e);
        }
    }
    dirtySet.clear();
}

/**
 * Get player property (cached)
 */
export function getPlayerProperty(player, key) {
    try {
        const playerId = player.id;
        const cache = playerPropertyCache.get(playerId);
        
        if (!cache) {
            // Cache doesn't exist, load it
            loadPlayerProperties(player);
            const newCache = playerPropertyCache.get(playerId);
            if (newCache) {
                return newCache.get(key);
            }
            // Fallback to direct read
            return player.getDynamicProperty(key);
        }
        
        return cache.get(key);
    } catch (error) {
        console.warn(`[PropertyHandler] Error getting player property ${key}:`, error);
        // Fallback to direct read
        return player.getDynamicProperty(key);
    }
}

/**
 * Set player property (cached, marks as dirty)
 */
export function setPlayerProperty(player, key, value) {
    try {
        const playerId = player.id;
        let cache = playerPropertyCache.get(playerId);
        
        if (!cache) {
            // Cache doesn't exist, create it
            cache = new Map();
            playerPropertyCache.set(playerId, cache);
            playerDirtyFlags.set(playerId, new Set());
        }
        
        // Update cache
        if (value === undefined || value === null) {
            cache.delete(key);
        } else {
            cache.set(key, value);
        }
        
        // Mark as dirty
        const dirtySet = playerDirtyFlags.get(playerId);
        if (dirtySet) {
            dirtySet.add(key);
        }
    } catch (error) {
        console.warn(`[PropertyHandler] Error setting player property ${key}:`, error);
        // Fallback to direct write
        try {
            player.setDynamicProperty(key, value);
        } catch (e) {
            console.warn(`[PropertyHandler] Fallback write also failed:`, e);
        }
    }
}

/**
 * Get world property (cached, lazy-loaded)
 */
export function getWorldProperty(key) {
    try {
        if (worldPropertyCache.has(key)) {
            return worldPropertyCache.get(key);
        }
        
        // Not in cache, load it lazily
        try {
            const value = world.getDynamicProperty(key);
            if (value !== undefined) {
                worldPropertyCache.set(key, value);
            }
            return value;
        } catch (e) {
            // If still in early execution, return undefined and cache will be populated later
            if (e.message && e.message.includes("early execution")) {
                return undefined;
            }
            throw e;
        }
    } catch (error) {
        console.warn(`[PropertyHandler] Error getting world property ${key}:`, error);
        // Fallback to direct read
        try {
            return world.getDynamicProperty(key);
        } catch (e) {
            return undefined;
        }
    }
}

/**
 * Set world property (cached, marks as dirty)
 */
export function setWorldProperty(key, value) {
    try {
        if (value === undefined || value === null) {
            worldPropertyCache.delete(key);
        } else {
            worldPropertyCache.set(key, value);
        }
        
        // Mark as dirty
        worldDirtyFlags.add(key);
    } catch (error) {
        console.warn(`[PropertyHandler] Error setting world property ${key}:`, error);
        // Fallback to direct write
        try {
            world.setDynamicProperty(key, value);
        } catch (e) {
            console.warn(`[PropertyHandler] Fallback write also failed:`, e);
        }
    }
}

/** World property for addon difficulty: -1 Easy, 0 Normal, 1 Hard */
export const ADDON_DIFFICULTY_PROPERTY = "mb_addonDifficulty";

/**
 * Get addon difficulty state (spawn, hits to infect, infection speed, mining speed, torpedo max blocks).
 * @returns {{ value: number, spawnMultiplier: number, hitsBase: number, infectionDecayMultiplier: number, miningIntervalMultiplier: number, torpedoMaxBlocksMultiplier: number }}
 */
export function getAddonDifficultyState() {
    const raw = getWorldProperty(ADDON_DIFFICULTY_PROPERTY);
    const num = Number(raw);
    const value = Math.max(-1, Math.min(1, Number.isNaN(num) ? 0 : num));
    if (value === -1) {
        return { value: -1, spawnMultiplier: 0.7, hitsBase: 4, infectionDecayMultiplier: 0.8, miningIntervalMultiplier: 1.2, torpedoMaxBlocksMultiplier: 0.85 };
    }
    if (value === 1) {
        // Hard: mining significantly faster (0.5x interval), torpedo max blocks significantly higher (2x)
        return { value: 1, spawnMultiplier: 1.3, hitsBase: 2, infectionDecayMultiplier: 1.2, miningIntervalMultiplier: 0.5, torpedoMaxBlocksMultiplier: 2.0 };
    }
    return { value: 0, spawnMultiplier: 1.0, hitsBase: 3, infectionDecayMultiplier: 1.0, miningIntervalMultiplier: 1.0, torpedoMaxBlocksMultiplier: 1.0 };
}

function readPlayerDynamicPropertyDirect(player, key) {
    try {
        return player.getDynamicProperty(key);
    } catch {
        return undefined;
    }
}

function readWorldDynamicPropertyDirect(key) {
    try {
        return world.getDynamicProperty(key);
    } catch {
        return undefined;
    }
}

function clearPlayerChunks(player, key, chunkCount) {
    if (!chunkCount || Number.isNaN(chunkCount)) return;
    for (let i = 0; i < chunkCount; i++) {
        setPlayerProperty(player, `${key}_chunk_${i}`, undefined);
    }
    setPlayerProperty(player, `${key}_chunks`, undefined);
}

function clearWorldChunks(key, chunkCount) {
    if (!chunkCount || Number.isNaN(chunkCount)) return;
    for (let i = 0; i < chunkCount; i++) {
        setWorldProperty(`${key}_chunk_${i}`, undefined);
    }
    setWorldProperty(`${key}_chunks`, undefined);
}

function splitIntoChunks(value) {
    const chunks = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    return chunks;
}

export function getPlayerPropertyChunked(player, key) {
    const direct = getPlayerProperty(player, key);
    if (direct !== undefined && direct !== null) return direct;

    const rawCount = readPlayerDynamicPropertyDirect(player, `${key}_chunks`);
    const count = parseInt(rawCount, 10);
    if (!count || Number.isNaN(count)) return undefined;

    let combined = "";
    for (let i = 0; i < count; i++) {
        const chunk = readPlayerDynamicPropertyDirect(player, `${key}_chunk_${i}`);
        if (typeof chunk !== "string") return undefined;
        combined += chunk;
    }
    return combined;
}

export function setPlayerPropertyChunked(player, key, value) {
    if (value === undefined || value === null) {
        const rawCount = readPlayerDynamicPropertyDirect(player, `${key}_chunks`);
        clearPlayerChunks(player, key, parseInt(rawCount, 10));
        setPlayerProperty(player, key, undefined);
        return;
    }

    let stringValue = value;
    if (typeof stringValue !== "string") {
        stringValue = JSON.stringify(value);
    }

    if (stringValue.length <= MAX_DYNAMIC_PROPERTY_SIZE) {
        const rawCount = readPlayerDynamicPropertyDirect(player, `${key}_chunks`);
        clearPlayerChunks(player, key, parseInt(rawCount, 10));
        setPlayerProperty(player, key, stringValue);
        return;
    }

    const chunks = splitIntoChunks(stringValue);
    const rawCount = readPlayerDynamicPropertyDirect(player, `${key}_chunks`);
    const previousCount = parseInt(rawCount, 10);
    if (previousCount > chunks.length) {
        clearPlayerChunks(player, key, previousCount);
    }
    setPlayerProperty(player, key, undefined);
    setPlayerProperty(player, `${key}_chunks`, String(chunks.length));
    chunks.forEach((chunk, index) => {
        setPlayerProperty(player, `${key}_chunk_${index}`, chunk);
    });
}

export function getWorldPropertyChunked(key) {
    const direct = getWorldProperty(key);
    if (direct !== undefined && direct !== null) return direct;

    const rawCount = readWorldDynamicPropertyDirect(`${key}_chunks`);
    const count = parseInt(rawCount, 10);
    if (!count || Number.isNaN(count)) return undefined;

    let combined = "";
    for (let i = 0; i < count; i++) {
        const chunk = readWorldDynamicPropertyDirect(`${key}_chunk_${i}`);
        if (typeof chunk !== "string") return undefined;
        combined += chunk;
    }
    return combined;
}

export function setWorldPropertyChunked(key, value) {
    if (value === undefined || value === null) {
        const rawCount = readWorldDynamicPropertyDirect(`${key}_chunks`);
        clearWorldChunks(key, parseInt(rawCount, 10));
        setWorldProperty(key, undefined);
        return;
    }

    let stringValue = value;
    if (typeof stringValue !== "string") {
        stringValue = JSON.stringify(value);
    }

    if (stringValue.length <= MAX_DYNAMIC_PROPERTY_SIZE) {
        const rawCount = readWorldDynamicPropertyDirect(`${key}_chunks`);
        clearWorldChunks(key, parseInt(rawCount, 10));
        setWorldProperty(key, stringValue);
        return;
    }

    const chunks = splitIntoChunks(stringValue);
    const rawCount = readWorldDynamicPropertyDirect(`${key}_chunks`);
    const previousCount = parseInt(rawCount, 10);
    if (previousCount > chunks.length) {
        clearWorldChunks(key, previousCount);
    }
    setWorldProperty(key, undefined);
    setWorldProperty(`${key}_chunks`, String(chunks.length));
    chunks.forEach((chunk, index) => {
        setWorldProperty(`${key}_chunk_${index}`, chunk);
    });
}

/**
 * Save all dirty properties
 */
function saveAllDirtyProperties() {
    try {
        // Save dirty player properties
        for (const [playerId, dirtySet] of playerDirtyFlags.entries()) {
            if (!dirtySet || dirtySet.size === 0) continue;
            
            try {
                const allPlayers = world.getAllPlayers();
                if (!allPlayers) continue;
                
                const player = Array.from(allPlayers).find(p => p && p.id === playerId);
                if (!player) {
                    // Player not online, properties will be saved when they join
                    continue;
                }
                
                // Check if player is valid (isValid might be a property or method)
                let isValid = true;
                if (typeof player.isValid === 'function') {
                    isValid = player.isValid();
                } else if (typeof player.isValid === 'boolean') {
                    isValid = player.isValid;
                }
                
                if (!isValid) {
                    // Player not valid, skip
                    continue;
                }
                
                const cache = playerPropertyCache.get(playerId);
                if (!cache) continue;
                
                // Save each dirty property
                for (const key of dirtySet) {
                    try {
                        const value = cache.get(key);
                        if (typeof player.setDynamicProperty === 'function') {
                            player.setDynamicProperty(key, value);
                        }
                    } catch (e) {
                        console.warn(`[PropertyHandler] Failed to save player property ${key} for ${playerId}:`, e);
                    }
                }
                
                // Clear dirty flags
                if (typeof dirtySet.clear === 'function') {
                    dirtySet.clear();
                }
            } catch (e) {
                console.warn(`[PropertyHandler] Error processing player ${playerId}:`, e);
                continue;
            }
        }
        
        // Save dirty world properties
        if (worldDirtyFlags && typeof worldDirtyFlags.forEach === 'function') {
            const dirtyKeys = Array.from(worldDirtyFlags);
            for (const key of dirtyKeys) {
                try {
                    const value = worldPropertyCache.get(key);
                    if (typeof world.setDynamicProperty === 'function') {
                        world.setDynamicProperty(key, value);
                    }
                } catch (e) {
                    console.warn(`[PropertyHandler] Failed to save world property ${key}:`, e);
                }
            }
            
            if (typeof worldDirtyFlags.clear === 'function') {
                worldDirtyFlags.clear();
            }
        }
    } catch (error) {
        console.warn("[PropertyHandler] Error saving dirty properties:", error);
    }
}

/**
 * Force immediate save of all properties (use on shutdown)
 */
export function saveAllProperties() {
    saveAllDirtyProperties();
}

/**
 * Clear cache for a player (when they leave)
 */
export function clearPlayerCache(playerId) {
    // Save any dirty properties first
    const dirtySet = playerDirtyFlags.get(playerId);
    if (dirtySet && dirtySet.size > 0) {
        try {
            const allPlayers = world.getAllPlayers();
            const player = Array.from(allPlayers).find(p => p && p.id === playerId);
            if (player) {
                const cache = playerPropertyCache.get(playerId);
                if (cache) {
                    for (const key of dirtySet) {
                        try {
                            const value = cache.get(key);
                            if (typeof player.setDynamicProperty === 'function') {
                                player.setDynamicProperty(key, value);
                            }
                        } catch (e) {
                            // Ignore save errors during cleanup
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore errors during cleanup
        }
    }
    playerPropertyCache.delete(playerId);
    playerDirtyFlags.delete(playerId);
}

/**
 * Get player cache (for debugging)
 */
export function getPlayerCache(playerId) {
    return playerPropertyCache.get(playerId);
}

/**
 * Get world cache (for debugging)
 */
export function getWorldCache() {
    return worldPropertyCache;
}
