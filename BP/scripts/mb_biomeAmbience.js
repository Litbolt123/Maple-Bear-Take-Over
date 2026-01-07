// ============================================================================
// MAPLE BEAR BIOME AMBIENCE
// ============================================================================
// Handles ambient sound playback when players are in infected biomes.
// Plays looping biome ambience sounds based on current day progression.
// Starts immediately when player joins if in infected biome.
// ============================================================================

import { system, world } from "@minecraft/server";
import { getCurrentDay } from "./mb_dayTracker.js";
import { getPlayerSoundVolume, isDebugEnabled } from "./mb_codex.js";

// Track active biome ambience per player
// Map: playerId -> { soundId: string, biomeId: string, lastCheckTick: number, biomeSize: string }
const activeBiomeAmbience = new Map();

// Infected biome identifiers
const INFECTED_BIOME_IDS = [
    "mb:infected_biome_small",
    "mb:infected_biome_medium",
    "mb:infected_biome_large"
];

// Biome ambience sound variants (all sizes use same sounds)
const BIOME_AMBIENCE_SOUNDS = [
    "biome.infected_ambient_1",
    "biome.infected_ambient_2",
    "biome.infected_ambient_3",
    "biome.infected_ambient_4"
];

// Check intervals - more frequent when in biome
const BIOME_CHECK_INTERVAL_OUT = 60; // Every 3 seconds when not in biome
const BIOME_CHECK_INTERVAL_IN = 20; // Every 1 second when in biome (more frequent checks)

// Sound restart interval (for continuous looping)
const SOUND_RESTART_INTERVAL = 100; // Every 5 seconds

/**
 * Get biome ambience sound based on current day
 * Early days (1-10): variant 1
 * Mid days (11-20): variant 2 or 3
 * Late days (21+): variant 4
 */
function getBiomeAmbienceSound(day) {
    if (day <= 10) {
        return BIOME_AMBIENCE_SOUNDS[0]; // Early days
    } else if (day <= 20) {
        // Mid days - alternate between 2 and 3
        return BIOME_AMBIENCE_SOUNDS[day % 2 === 0 ? 1 : 2];
    } else {
        return BIOME_AMBIENCE_SOUNDS[3]; // Late days
    }
}

/**
 * Get volume multiplier based on biome size
 * Large biomes are slightly louder
 */
function getBiomeVolumeMultiplier(biomeId) {
    if (biomeId === "mb:infected_biome_large") {
        return 1.15; // 15% louder for large biomes
    }
    return 1.0; // Normal volume for small and medium
}

/**
 * Get base volume based on current day
 * Volume increases as days progress, with a cap
 * Day 1-5: 0.7 (quiet)
 * Day 6-10: 0.75
 * Day 11-15: 0.8
 * Day 16-20: 0.9
 * Day 21+: 1.0 (max cap)
 */
function getBiomeVolumeByDay(day) {
    if (day <= 5) {
        return 0.7; // Early days - quiet
    } else if (day <= 10) {
        return 0.75; // Early-mid days
    } else if (day <= 15) {
        return 0.8; // Mid days
    } else if (day <= 20) {
        return 0.9; // Late-mid days
    } else {
        return 1.0; // Late days - max volume (cap)
    }
}

/**
 * Check if player is in an infected biome and return biome info
 */
function getInfectedBiomeInfo(player) {
    try {
        if (!player || !player.isValid || !player.dimension) {
            if (isDebugEnabled("biome_ambience", "biome_check")) {
                console.warn(`[BIOME AMBIENCE DEBUG] ${player?.name || "unknown"}: Invalid player or dimension`);
            }
            return null;
        }
        
        // Get biome directly from dimension at player location
        const biome = player.dimension.getBiome(player.location);
        if (!biome) {
            if (isDebugEnabled("biome_ambience", "biome_check")) {
                console.warn(`[BIOME AMBIENCE DEBUG] ${player.name}: No biome found at location ${JSON.stringify(player.location)}`);
            }
            return null;
        }
        
        // Biome can be an object with .id or a string
        const biomeId = typeof biome === "string" ? biome : (biome.id || null);
        if (!biomeId) {
            if (isDebugEnabled("biome_ambience", "biome_check")) {
                console.warn(`[BIOME AMBIENCE DEBUG] ${player.name}: Biome found but no ID (type: ${typeof biome}, value: ${JSON.stringify(biome)})`);
            }
            return null;
        }
        
        if (isDebugEnabled("biome_ambience", "biome_check")) {
            console.warn(`[BIOME AMBIENCE DEBUG] ${player.name}: Biome ID = ${biomeId}, checking against: ${JSON.stringify(INFECTED_BIOME_IDS)}`);
        }
        
        if (INFECTED_BIOME_IDS.includes(biomeId)) {
            const size = biomeId.includes("large") ? "large" : (biomeId.includes("medium") ? "medium" : "small");
            if (isDebugEnabled("biome_ambience", "biome_check")) {
                console.warn(`[BIOME AMBIENCE DEBUG] ${player.name}: ✓ In infected biome (${biomeId}, size: ${size})`);
            }
            return {
                id: biomeId,
                size: size
            };
        } else {
            if (isDebugEnabled("biome_ambience", "biome_check")) {
                console.warn(`[BIOME AMBIENCE DEBUG] ${player.name}: ✗ Not in infected biome (${biomeId} not in list)`);
            }
        }
        return null;
    } catch (error) {
        // Log error for debugging
        if (isDebugEnabled("biome_ambience", "errors")) {
            console.warn(`[BIOME AMBIENCE ERROR] Error getting biome info for ${player?.name || "unknown"}:`, error);
        }
        return null;
    }
}

/**
 * Check and update biome ambience for a player
 */
function checkBiomeAmbienceForPlayer(player, currentDay) {
    try {
        if (!player || !player.isValid) {
            if (isDebugEnabled("biome_ambience", "player_check")) {
                console.warn(`[BIOME AMBIENCE DEBUG] Invalid player in checkBiomeAmbienceForPlayer`);
            }
            return;
        }
        
        const playerId = player.id;
        const currentAmbience = activeBiomeAmbience.get(playerId);
        const biomeInfo = getInfectedBiomeInfo(player);
        
        if (isDebugEnabled("biome_ambience", "player_check")) {
            const biome = player.dimension.getBiome(player.location);
            const biomeId = typeof biome === "string" ? biome : (biome?.id || "unknown");
            console.warn(`[BIOME AMBIENCE DEBUG] ${player.name} (day ${currentDay}): biome=${biomeId}, inInfected=${!!biomeInfo}, activeAmbience=${!!currentAmbience}, tick=${system.currentTick}`);
        }
        
        if (biomeInfo) {
            // Player is in infected biome
            const soundId = getBiomeAmbienceSound(currentDay);
            const biomeSize = biomeInfo.size;
            const volumeMultiplier = getBiomeVolumeMultiplier(biomeInfo.id);
            
            // Check if we need to start or continue playing ambience
            // Use lastPlayTick (or lastCheckTick for backwards compatibility) to track when sound was last played
            const lastPlayTick = currentAmbience?.lastPlayTick || currentAmbience?.lastCheckTick || 0;
            const shouldRestart = !currentAmbience || 
                                 currentAmbience.soundId !== soundId ||
                                 currentAmbience.biomeSize !== biomeSize ||
                                 (system.currentTick - lastPlayTick) > SOUND_RESTART_INTERVAL;
            
            if (shouldRestart) {
                // Start or restart ambience
                const playerVolumeMultiplier = getPlayerSoundVolume(player);
                const baseVolume = getBiomeVolumeByDay(currentDay); // Volume increases with day progression
                const finalVolume = baseVolume * volumeMultiplier * playerVolumeMultiplier;
                
                try {
                    player.playSound(soundId, {
                        pitch: 1.0,
                        volume: finalVolume
                    });
                    activeBiomeAmbience.set(playerId, {
                        soundId: soundId,
                        biomeId: biomeInfo.id,
                        biomeSize: biomeSize,
                        lastCheckTick: system.currentTick,
                        lastPlayTick: system.currentTick // Track when sound was actually played
                    });
                    if (isDebugEnabled("biome_ambience", "sound_playback")) {
                        console.warn(`[BIOME AMBIENCE] Playing ${soundId} for ${player.name} (day ${currentDay}, ${biomeSize} biome, volume ${finalVolume.toFixed(2)})`);
                        console.warn(`[BIOME AMBIENCE DEBUG] Sound details: baseVolume=${baseVolume.toFixed(2)}, biomeMultiplier=${volumeMultiplier.toFixed(2)}, playerMultiplier=${playerVolumeMultiplier.toFixed(2)}, finalVolume=${finalVolume.toFixed(2)}, tick=${system.currentTick}`);
                    }
                } catch (error) {
                    // Log error to help debug
                    if (isDebugEnabled("biome_ambience", "errors")) {
                        console.warn(`[BIOME AMBIENCE ERROR] Error playing sound ${soundId} for ${player.name}:`, error);
                    }
                }
            } else {
                // Update last check tick (but NOT lastPlayTick - that only updates when sound plays)
                if (currentAmbience) {
                    currentAmbience.lastCheckTick = system.currentTick;
                }
            }
        } else {
            // Player left infected biome - stop ambience
            if (currentAmbience) {
                activeBiomeAmbience.delete(playerId);
                if (isDebugEnabled("biome_ambience", "sound_playback")) {
                    console.warn(`[BIOME AMBIENCE] Stopped for ${player.name} (left infected biome)`);
                    console.warn(`[BIOME AMBIENCE DEBUG] Stopped ambience for ${player.name}, was playing ${currentAmbience.soundId} in ${currentAmbience.biomeSize} biome`);
                }
            }
        }
    } catch (error) {
        if (isDebugEnabled("biome_ambience", "errors")) {
            console.warn(`[BIOME AMBIENCE ERROR] Error checking biome for player ${player?.name || "unknown"}:`, error);
        }
    }
}

/**
 * Main biome ambience check loop - slower interval when no players in biomes
 */
system.runInterval(() => {
    try {
        const allPlayers = world.getAllPlayers();
        if (allPlayers.length === 0) return;
        
        const currentDay = getCurrentDay();
        
        if (isDebugEnabled("biome_ambience", "loop_status")) {
            console.warn(`[BIOME AMBIENCE DEBUG] Main loop: ${allPlayers.length} players, day ${currentDay}, ${activeBiomeAmbience.size} active ambience entries, tick ${system.currentTick}`);
        }
        
        for (const player of allPlayers) {
            checkBiomeAmbienceForPlayer(player, currentDay);
        }
        
        // Cleanup stale entries (players who left)
        const now = system.currentTick;
        for (const [playerId, ambience] of activeBiomeAmbience.entries()) {
            if (now - ambience.lastCheckTick > BIOME_CHECK_INTERVAL_OUT * 3) {
                // Player hasn't been checked in a while - likely disconnected
                if (isDebugEnabled("biome_ambience", "cleanup")) {
                    console.warn(`[BIOME AMBIENCE DEBUG] Cleaning up stale ambience entry for player ${playerId} (last check: ${now - ambience.lastCheckTick} ticks ago)`);
                }
                activeBiomeAmbience.delete(playerId);
            }
        }
    } catch (error) {
        if (isDebugEnabled("biome_ambience", "errors")) {
            console.warn(`[BIOME AMBIENCE ERROR] Error in main loop:`, error);
        }
    }
}, BIOME_CHECK_INTERVAL_OUT);

/**
 * Fast check loop - runs more frequently when players are in biomes
 */
system.runInterval(() => {
    try {
        // Only run if there are active ambience entries (players in biomes)
        if (activeBiomeAmbience.size === 0) return;
        
        const allPlayers = world.getAllPlayers();
        if (allPlayers.length === 0) return;
        
        const currentDay = getCurrentDay();
        
        if (isDebugEnabled("biome_ambience", "loop_status")) {
            console.warn(`[BIOME AMBIENCE DEBUG] Fast check loop: ${activeBiomeAmbience.size} active ambience entries, checking ${allPlayers.length} players, tick ${system.currentTick}`);
        }
        
        // Only check players who have active ambience (in biomes)
        for (const player of allPlayers) {
            if (!player || !player.isValid) continue;
            const playerId = player.id;
            if (activeBiomeAmbience.has(playerId)) {
                checkBiomeAmbienceForPlayer(player, currentDay);
            }
        }
    } catch (error) {
        if (isDebugEnabled("biome_ambience", "errors")) {
            console.warn(`[BIOME AMBIENCE ERROR] Error in fast check loop:`, error);
        }
    }
}, BIOME_CHECK_INTERVAL_IN);

// Initialize ambience for players already in biomes when they join
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    if (!player || !player.isValid) return;
    
    // Small delay to ensure world is ready
    system.runTimeout(() => {
        try {
            if (!player.isValid) return;
            const biomeInfo = getInfectedBiomeInfo(player);
            if (biomeInfo) {
                const currentDay = getCurrentDay();
                const soundId = getBiomeAmbienceSound(currentDay);
                const volumeMultiplier = getBiomeVolumeMultiplier(biomeInfo.id);
                const playerVolumeMultiplier = getPlayerSoundVolume(player);
                const baseVolume = 0.8;
                const finalVolume = baseVolume * volumeMultiplier * playerVolumeMultiplier;
                
                player.playSound(soundId, {
                    pitch: 1.0,
                    volume: finalVolume
                });
                
                activeBiomeAmbience.set(player.id, {
                    soundId: soundId,
                    biomeId: biomeInfo.id,
                    biomeSize: biomeInfo.size,
                    lastCheckTick: system.currentTick,
                    lastPlayTick: system.currentTick // Track when sound was actually played
                });
                
                if (isDebugEnabled("biome_ambience", "initialization")) {
                    console.warn(`[BIOME AMBIENCE] Initialized for ${player.name} on spawn (${biomeInfo.size} biome)`);
                    console.warn(`[BIOME AMBIENCE DEBUG] Spawn initialization: ${player.name} in ${biomeInfo.id} (${biomeInfo.size}), sound=${soundId}, volume=${finalVolume.toFixed(2)}, day=${currentDay}`);
                }
            } else {
                if (isDebugEnabled("biome_ambience", "initialization")) {
                    console.warn(`[BIOME AMBIENCE DEBUG] Spawn initialization: ${player.name} NOT in infected biome`);
                }
            }
        } catch (error) {
            if (isDebugEnabled("biome_ambience", "errors")) {
                console.warn(`[BIOME AMBIENCE ERROR] Error in spawn initialization for ${player?.name || "unknown"}:`, error);
            }
        }
    }, 20); // 1 second delay
});
