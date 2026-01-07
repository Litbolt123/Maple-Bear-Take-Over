// ============================================================================
// MAPLE BEAR BIOME AMBIENCE
// ============================================================================
// Handles ambient sound playback when players are in infected biomes.
// Plays looping biome ambience sounds based on current day progression.
// ============================================================================

import { system, world } from "@minecraft/server";
import { getCurrentDay } from "./mb_dayTracker.js";
import { getPlayerSoundVolume } from "./mb_codex.js";

// Track active biome ambience per player
// Map: playerId -> { soundId: string, biomeId: string, lastCheckTick: number }
const activeBiomeAmbience = new Map();

// Infected biome identifiers
const INFECTED_BIOME_IDS = [
    "mb:mb_infected_biome_small",
    "mb:mb_infected_biome_medium",
    "mb:mb_infected_biome_large"
];

// Biome ambience sound variants
const BIOME_AMBIENCE_SOUNDS = [
    "biome.infected_ambient_1",
    "biome.infected_ambient_2",
    "biome.infected_ambient_3",
    "biome.infected_ambient_4"
];

// Check interval (every 3 seconds = 60 ticks)
const BIOME_CHECK_INTERVAL = 60;

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
 * Check if player is in an infected biome
 */
function isInInfectedBiome(player) {
    try {
        const block = player.dimension.getBlock(player.location);
        if (!block) return false;
        
        const biome = block.dimension.getBiome(block.location);
        if (!biome) return false;
        
        const biomeId = biome.id;
        return INFECTED_BIOME_IDS.includes(biomeId);
    } catch (error) {
        return false;
    }
}

/**
 * Main biome ambience check loop
 */
system.runInterval(() => {
    try {
        const currentDay = getCurrentDay();
        if (currentDay < 2) return; // Don't play ambience before day 2
        
        const allPlayers = world.getAllPlayers();
        if (allPlayers.length === 0) return;
        
        for (const player of allPlayers) {
            if (!player || !player.isValid) continue;
            
            try {
                const playerId = player.id;
                const currentAmbience = activeBiomeAmbience.get(playerId);
                const inInfectedBiome = isInInfectedBiome(player);
                
                if (inInfectedBiome) {
                    // Player is in infected biome
                    const soundId = getBiomeAmbienceSound(currentDay);
                    
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
                                volume: 0.5 * volumeMultiplier
                            });
                            activeBiomeAmbience.set(playerId, {
                                soundId: soundId,
                                biomeId: "infected",
                                lastCheckTick: system.currentTick
                            });
                            console.warn(`[BIOME AMBIENCE] Playing ${soundId} for ${player.name} (day ${currentDay})`);
                        } catch (error) {
                            // Log error to help debug
                            console.warn(`[BIOME AMBIENCE] Error playing sound ${soundId} for ${player.name}:`, error);
                        }
                    } else {
                        // Update last check tick
                        currentAmbience.lastCheckTick = system.currentTick;
                    }
                } else {
                    // Player left infected biome - stop ambience
                    if (currentAmbience) {
                        activeBiomeAmbience.delete(playerId);
                        // Note: Minecraft Bedrock doesn't have a direct way to stop sounds,
                        // but the sound will naturally fade when leaving the biome
                    }
                }
            } catch (error) {
                // Error handling for individual player - continue with next player
                console.warn(`[BIOME AMBIENCE] Error checking biome for player:`, error);
            }
        }
        
        // Cleanup stale entries (players who left)
        const now = system.currentTick;
        for (const [playerId, ambience] of activeBiomeAmbience.entries()) {
            if (now - ambience.lastCheckTick > BIOME_CHECK_INTERVAL * 2) {
                // Player hasn't been checked in a while - likely disconnected
                activeBiomeAmbience.delete(playerId);
            }
        }
    } catch (error) {
        console.warn(`[BIOME AMBIENCE] Error in main loop:`, error);
    }
}, BIOME_CHECK_INTERVAL);

