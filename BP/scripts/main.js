import { world, system, EntityTypes, Entity, Player, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getCodex, getDefaultCodex, markCodex, showCodexBook, saveCodex, recordBiomeVisit, getBiomeInfectionLevel, shareKnowledge, isDebugEnabled, showBasicJournalUI, showFirstTimeWelcomeScreen, getPlayerSoundVolume } from "./mb_codex.js";
import { initializeDayTracking, getCurrentDay, setCurrentDay, getInfectionMessage, checkDailyEventsForAllPlayers, getDayDisplayInfo, recordDailyEvent, mbiHandleMilestoneDay, isMilestoneDay } from "./mb_dayTracker.js";
import { registerDustedDirtBlock, unregisterDustedDirtBlock } from "./mb_spawnController.js";
import "./mb_spawnController.js";
import "./mb_miningAI.js";
import { collectedBlocks } from "./mb_miningAI.js";
import "./mb_flyingAI.js";
import "./mb_torpedoAI.js";
import "./mb_dimensionAdaptation.js";

// NOTE: Debug and testing features have been commented out for playability
// To re-enable testing features, uncomment the following sections:
// - Test functions (testWeaknessDetection, addWeaknessToPlayer, checkInfectionStatus)
// - Debug item use handler (book, paper, map, compass testing)
// - Test command handler (!testeffects, !addweakness, !infection, !weakness, !removeimmunity, !spawnrate)

// Potion data values for Bedrock 1.21
const POTION_DATA = {
    WEAKNESS_NORMAL: 34,    // Weakness (1:30)
    WEAKNESS_EXTENDED: 35   // Weakness Extended (4:00)
};

// Track codex errors to prevent spam
const codexErrorLogged = new Set();

// Helper function for conditional codex error logging
function safeMarkCodex(player, path, timestamp = false) {
    try { 
        markCodex(player, path, timestamp); 
    } catch (error) {
        // Log only first occurrence per player to prevent spam
        if (!codexErrorLogged.has(player.id)) {
            console.warn(`[CODEX] Error marking codex for ${player.name}:`, error);
            codexErrorLogged.add(player.id);
        }
    }
}

// Track script-applied effects so they don't unlock potion knowledge
const scriptEffectSkip = new Map(); // playerId -> timestamp
const SCRIPT_EFFECT_SKIP_WINDOW_MS = 2000; // 2 seconds

function markScriptEffect(target) {
    if (target instanceof Player) {
        scriptEffectSkip.set(target.id, Date.now());
    }
}

function shouldSkipPotionUnlock(target) {
    if (!(target instanceof Player)) return false;
    const last = scriptEffectSkip.get(target.id);
    if (!last) return false;
    const now = Date.now();
    if (now - last <= SCRIPT_EFFECT_SKIP_WINDOW_MS) {
        scriptEffectSkip.delete(target.id);
        return true;
    }
    scriptEffectSkip.delete(target.id);
    return false;
}

function applyEffect(target, effectId, duration, options = {}, trackSkip = true) {
    if (!target) return;
    try {
        if (trackSkip) {
            markScriptEffect(target);
        }
        target.addEffect(effectId, duration, options);
    } catch (error) {
        console.warn(`[EFFECT] Failed to apply ${effectId} to ${target?.name ?? target?.typeId ?? "unknown"}:`, error);
    }
}

// Constants for Maple Bear behavior
const MAPLE_BEAR_ID = "mb:mb";
const MAPLE_BEAR_DAY4_ID = "mb:mb_day4";
const MAPLE_BEAR_DAY8_ID = "mb:mb_day8";
const MAPLE_BEAR_DAY13_ID = "mb:mb_day13";
const MAPLE_BEAR_DAY20_ID = "mb:mb_day20";
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
const INFECTED_PIG_ID = "mb:infected_pig";
const INFECTED_COW_ID = "mb:infected_cow";
const SNOW_ITEM_ID = "mb:snow";
const INFECTED_TAG = "mb_infected";
const INFECTED_CORPSE_ID = "mb:infected_corpse";
const SNOW_LAYER_BLOCK = "minecraft:snow_layer";

// Biome check optimization
const BIOME_CHECK_COOLDOWN = 200; // 10 seconds in ticks (200 ticks = 10 seconds)
const biomeCheckCache = new Map(); // playerId -> lastCheckTick

// Debug flag for snow mechanics
const DEBUG_SNOW_MECHANICS = false;

// Helper: robust biome id at location (moved to module scope for performance)
function getBiomeIdAt(dimension, location) {
    try {
        const b = dimension.getBiome(location);
        if (b && typeof b === "object" && b.id) return b.id;
        if (typeof b === "string") return b;
    } catch { }
    try {
        const loc = dimension.findClosestBiome(location, "mb:infected_biome", { boundingSize: { x: 48, y: 64, z: 48 } });
        if (loc) {
            const dx = Math.floor(loc.x) - Math.floor(location.x);
            const dz = Math.floor(loc.z) - Math.floor(location.z);
            const match = dx === 0 && dz === 0;
            if (match) {
                return "mb:infected_biome";
            }
        }
    } catch { }
    return null;
}

// Progressive Infection Rate System Constants
const INFECTION_RATE_CONFIG = {
    DAY_2_RATE: 0.20,    // 20% on day 2
    DAY_3_RATE: 0.30,    // 30% on day 3
    DAY_4_RATE: 0.40,    // 40% on day 4
    DAY_5_RATE: 0.40,    // 40% on day 5
    DAY_6_RATE: 0.50,    // 50% on day 6
    DAY_7_RATE: 0.50,    // 50% on day 7
    DAY_8_RATE: 0.60,    // 60% on day 8
    RATE_INCREASE: 0.10, // 10% increase every 2 days
    RATE_INTERVAL: 2,    // Every 2 days (changed from 5 to reach 100% by day 20)
    MAX_RATE: 1.0        // Cap at 100%
};

function getInfectionRate(day) {
    if (day < 2) return 0; // No infection before day 2
    if (day === 2) return INFECTION_RATE_CONFIG.DAY_2_RATE;
    if (day === 3) return INFECTION_RATE_CONFIG.DAY_3_RATE;
    if (day === 4) return INFECTION_RATE_CONFIG.DAY_4_RATE;
    if (day === 5) return INFECTION_RATE_CONFIG.DAY_5_RATE;
    if (day === 6) return INFECTION_RATE_CONFIG.DAY_6_RATE;
    if (day === 7) return INFECTION_RATE_CONFIG.DAY_7_RATE;
    if (day === 8) return INFECTION_RATE_CONFIG.DAY_8_RATE;
    
    // After day 8, increase by 10% every 2 days until reaching 100% at day 20
    const daysAfter8 = day - 8;
    const rateIncrease = Math.floor(daysAfter8 / INFECTION_RATE_CONFIG.RATE_INTERVAL) * INFECTION_RATE_CONFIG.RATE_INCREASE;
    const baseRate = INFECTION_RATE_CONFIG.DAY_8_RATE;
    const finalRate = Math.min(baseRate + rateIncrease, INFECTION_RATE_CONFIG.MAX_RATE);
    
    return finalRate;
}

// --- Player Codex (Unlock System) ---

// Use the getCodex function from mb_codex.js

// Use the saveCodex function from mb_codex.js

// --- Bear Symptom Scaling Constants ---
const SYMPTOM_LEVEL_CONFIG = {
    NONE_THRESHOLD: 0.75,      // No symptoms above 75% time remaining
    MILD_THRESHOLD: 0.5,       // Mild symptoms above 50% time remaining
    MODERATE_THRESHOLD: 0.2,    // Moderate symptoms above 20% time remaining
    // Below 20% = severe symptoms
    LEVELS: {
        NONE: 0,
        MILD: 1,
        MODERATE: 2,
        SEVERE: 3
    }
};
const lastSymptomTick = new Map(); // playerId -> last tick applied
function getSymptomLevel(ticksLeft) {
    const total = INFECTION_TICKS;
    const ratio = Math.max(0, Math.min(1, (ticksLeft || 0) / total));
    if (ratio > SYMPTOM_LEVEL_CONFIG.NONE_THRESHOLD) return SYMPTOM_LEVEL_CONFIG.LEVELS.NONE;
    if (ratio > SYMPTOM_LEVEL_CONFIG.MILD_THRESHOLD) return SYMPTOM_LEVEL_CONFIG.LEVELS.MILD;
    if (ratio > SYMPTOM_LEVEL_CONFIG.MODERATE_THRESHOLD) return SYMPTOM_LEVEL_CONFIG.LEVELS.MODERATE;
    return SYMPTOM_LEVEL_CONFIG.LEVELS.SEVERE;
}

// Note: Spawn rate progression now handled via spawn rules and multiple entity files
// Different entity files will have different spawn weights and day requirements

// Freaky effects for the tiny mb bear
const FREAKY_EFFECTS = [
    { effect: "minecraft:blindness", duration: 20, amplifier: 1 },
    { effect: "minecraft:poison", duration: 15, amplifier: 1 }
];

// Effect duration constants (in ticks)
const INFINITE_DURATION = Number.MAX_SAFE_INTEGER;

// Snow increase per hit by mob type
const SNOW_INCREASE = {
    TINY_BEAR: 0.25,    // Small increase for tiny bears
    INFECTED: 0.5,      // Moderate increase for infected bears/pigs  
    BUFF_BEAR: 3.0,     // Large increase for buff bears (equals 3 snow)
    FLYING_BEAR: 0.5,
    MINING_BEAR: 0.45,
    TORPEDO_BEAR: 0.9
};

const EFFECT_DURATIONS = {
    FREAKY_BLINDNESS: 20,    // 1 second
    FREAKY_POISON: 15,       // 0.75 seconds
    SNOW_BASE: 60,           // 3 seconds base
    SNOW_TIER_2: 120,        // 6 seconds
    SNOW_TIER_3: 200,        // 10 seconds
    SNOW_TIER_4: 400,        // 20 seconds
    SNOW_TIER_5: 600,        // 30 seconds
    SNOW_TIER_6: INFINITE_DURATION  // Infinite (Black Void)
};

// Equipment capture constants
const ARMOR_TYPES = {
    "minecraft:leather_helmet": 0, "minecraft:iron_helmet": 0, "minecraft:diamond_helmet": 0, "minecraft:netherite_helmet": 0, "minecraft:golden_helmet": 0, "minecraft:chainmail_helmet": 0, "minecraft:turtle_helmet": 0,
    "minecraft:leather_chestplate": 1, "minecraft:iron_chestplate": 1, "minecraft:diamond_chestplate": 1, "minecraft:netherite_chestplate": 1, "minecraft:golden_chestplate": 1, "minecraft:chainmail_chestplate": 1, "minecraft:elytra": 1,
    "minecraft:leather_leggings": 2, "minecraft:iron_leggings": 2, "minecraft:diamond_leggings": 2, "minecraft:netherite_leggings": 2, "minecraft:golden_leggings": 2, "minecraft:chainmail_leggings": 2,
    "minecraft:leather_boots": 3, "minecraft:iron_boots": 3, "minecraft:diamond_boots": 3, "minecraft:netherite_boots": 3, "minecraft:golden_boots": 3, "minecraft:chainmail_boots": 3
};

const OFFHAND_TYPES = [
    "minecraft:shield",
    "minecraft:totem_of_undying", 
    "minecraft:torch",
    "minecraft:soul_torch",
    "minecraft:lantern",
    "minecraft:soul_lantern",
    "minecraft:map",
    "minecraft:arrow",
    "minecraft:firework_rocket"
];

const ARMOR_SLOT_RANGES = [
    [100, 103], // Standard armor slots
    [110, 113], // Alternative armor slots
    [120, 123], // Another possible range
    [5, 8]      // Rare fallback range
];

const OFFHAND_SLOTS = [45, 40, 50, 119, 36]; // Common offhand slots

// Track players who have eaten snow and their transformation progress
// Track player inventories for clone drops (used by bear equipment system)
const playerInventories = new Map();

/**
 * @typedef {Object} InfectionState
 * @property {number} ticksLeft - Ticks until transformation (0 = transform now)
 * @property {number} snowCount - Amount of snow consumed in this infection
 * @property {number} hitCount - Number of bear hits before infection (0-3)
 * @property {boolean} cured - Whether infection was cured (true = immune)
 * @property {string} source - "bear" or "snow" (how they got infected)
 * @property {number} maxSeverity - Maximum severity level reached (0-4)
 * @property {number} lastTierMessage - Last tier message shown (prevents spam)
 * @property {number} lastDecayTick - Last tick when daily decay was applied
 * @property {boolean} warningSent - Whether final warning was sent
 * @property {number} lastActiveTick - Last tick when player was online and infection was active
 */

// --- Unified Infection System Data ---
export const playerInfection = new Map(); // playerId -> InfectionState
export const bearHitCount = new Map(); // playerId -> hitCount (tracks hits before infection)
const firstTimeMessages = new Map(); // playerId -> { hasBeenHit: false, hasBeenInfected: false, snowTier: 0 }
export const maxSnowLevels = new Map(); // playerId -> { maxLevel: 0, achievedAt: timestamp }
const infectionExperience = new Map(); // playerId -> { bearInfected, snowInfected, maxSeverity, effectsSeen }
const INFECTION_TICKS = 24000 * 5; // 5 Minecraft days
export const HITS_TO_INFECT = 3; // Number of hits required to get infected
// Random effect interval is now handled inline in the infection system

// Snow consumption mechanics are now handled inline in the itemCompleteUse handler

// Helper function to check and unlock mob discovery
function checkAndUnlockMobDiscovery(codex, player, killType, mobKillType, hitType, unlockKey, requiredKills = 3, messageType = "interesting", itemType = "") {
    // Early return if already discovered to prevent spam
    if (codex.mobs[unlockKey]) {
        return false;
    }
    
    const playerKills = codex.mobs[killType] || 0;
    const mobKills = codex.mobs[mobKillType] || 0;
    const hits = codex.mobs[hitType] || 0;
    const totalKills = playerKills + mobKills + hits;
    
    if (totalKills >= requiredKills) {
        // Mark as discovered in the codex object immediately
        codex.mobs[unlockKey] = true;
        markCodex(player, `mobs.${unlockKey}`);
        sendDiscoveryMessage(player, codex, messageType, itemType);
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
        if (requiredKills === 1) {
            player.playSound("random.orb", { pitch: 1.5, volume: 0.8 * volumeMultiplier });
        }

        // Update knowledge progression after discovery
        try {
            if (typeof checkKnowledgeProgression === 'function') {
                checkKnowledgeProgression(player);
            }
        } catch (error) {
            console.warn(`[ERROR] Failed to update knowledge progression after mob discovery:`, error);
        }

        return true;
    }
    return false;
}

function trackBearKill(player, bearType) {
    try {
        const codex = getCodex(player);
        
        // Initialize variant tracking if needed
        if (!codex.mobs.variantKills) {
            codex.mobs.variantKills = {
                tinyBear: { original: 0, day4: 0, day8: 0, day13: 0, day20: 0 },
                infectedBear: { original: 0, day8: 0, day13: 0, day20: 0 },
                buffBear: { original: 0, day13: 0, day20: 0 },
                infectedPig: { original: 0, day4: 0, day8: 0, day13: 0, day20: 0 },
                infectedCow: { original: 0, day4: 0, day8: 0, day13: 0, day20: 0 },
                flyingBear: { original: 0, day15: 0, day20: 0 },
                miningBear: { original: 0, day20: 0 },
                torpedoBear: { original: 0, day20: 0 }
            };
        }

        // Track kills based on bear type and variant
        if (bearType === MAPLE_BEAR_ID) {
            codex.mobs.tinyBearKills = (codex.mobs.tinyBearKills || 0) + 1;
            codex.mobs.variantKills.tinyBear.original = (codex.mobs.variantKills.tinyBear.original || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "tinyBearKills", "tinyBearMobKills", "tinyBearHits", "mapleBearSeen", 3, "mysterious", "tiny_bear");
        } else if (bearType === MAPLE_BEAR_DAY4_ID) {
            codex.mobs.tinyBearKills = (codex.mobs.tinyBearKills || 0) + 1;
            codex.mobs.variantKills.tinyBear.day4 = (codex.mobs.variantKills.tinyBear.day4 || 0) + 1;
        } else if (bearType === MAPLE_BEAR_DAY8_ID) {
            codex.mobs.tinyBearKills = (codex.mobs.tinyBearKills || 0) + 1;
            codex.mobs.variantKills.tinyBear.day8 = (codex.mobs.variantKills.tinyBear.day8 || 0) + 1;
        } else if (bearType === MAPLE_BEAR_DAY13_ID) {
            codex.mobs.tinyBearKills = (codex.mobs.tinyBearKills || 0) + 1;
            codex.mobs.variantKills.tinyBear.day13 = (codex.mobs.variantKills.tinyBear.day13 || 0) + 1;
        } else if (bearType === MAPLE_BEAR_DAY20_ID) {
            codex.mobs.tinyBearKills = (codex.mobs.tinyBearKills || 0) + 1;
            codex.mobs.variantKills.tinyBear.day20 = (codex.mobs.variantKills.tinyBear.day20 || 0) + 1;

            if (codex.journal && !codex.journal.day20TinyLoreUnlocked) {
                codex.journal.day20TinyLoreUnlocked = true;
                const reflectionDay = getCurrentDay() + 1;
                const loreEntry = "Witnessed the smallest bears ignite with renewed purpose. Their steps cut cold lines through the snow.";
                recordDailyEvent(player, reflectionDay, loreEntry, "lore", codex);
            }
        } else if (bearType === INFECTED_BEAR_ID) {
            codex.mobs.infectedBearKills = (codex.mobs.infectedBearKills || 0) + 1;
            codex.mobs.variantKills.infectedBear.original = (codex.mobs.variantKills.infectedBear.original || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "infectedBearKills", "infectedBearMobKills", "infectedBearHits", "infectedBearSeen", 3, "dangerous", "infected_bear");
        } else if (bearType === INFECTED_BEAR_DAY8_ID) {
            codex.mobs.infectedBearKills = (codex.mobs.infectedBearKills || 0) + 1;
            codex.mobs.variantKills.infectedBear.day8 = (codex.mobs.variantKills.infectedBear.day8 || 0) + 1;
        } else if (bearType === INFECTED_BEAR_DAY13_ID) {
            codex.mobs.infectedBearKills = (codex.mobs.infectedBearKills || 0) + 1;
            codex.mobs.variantKills.infectedBear.day13 = (codex.mobs.variantKills.infectedBear.day13 || 0) + 1;
        } else if (bearType === INFECTED_BEAR_DAY20_ID) {
            codex.mobs.infectedBearKills = (codex.mobs.infectedBearKills || 0) + 1;
            codex.mobs.variantKills.infectedBear.day20 = (codex.mobs.variantKills.infectedBear.day20 || 0) + 1;

            if (codex.journal && !codex.journal.day20InfectedLoreUnlocked) {
                codex.journal.day20InfectedLoreUnlocked = true;
                const reflectionDay = getCurrentDay() + 1;
                const loreEntry = "Saw infected husks clad in drifting dust. Their presence drapes the world in a hollow quiet.";
                recordDailyEvent(player, reflectionDay, loreEntry, "lore", codex);
            }
        } else if (bearType === BUFF_BEAR_ID) {
            codex.mobs.buffBearKills = (codex.mobs.buffBearKills || 0) + 1;
            codex.mobs.variantKills.buffBear.original = (codex.mobs.variantKills.buffBear.original || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "buffBearKills", "buffBearMobKills", "buffBearHits", "buffBearSeen", 1, "threatening", "buff_bear");
        } else if (bearType === BUFF_BEAR_DAY13_ID) {
            codex.mobs.buffBearKills = (codex.mobs.buffBearKills || 0) + 1;
            codex.mobs.variantKills.buffBear.day13 = (codex.mobs.variantKills.buffBear.day13 || 0) + 1;
        } else if (bearType === BUFF_BEAR_DAY20_ID) {
            codex.mobs.buffBearKills = (codex.mobs.buffBearKills || 0) + 1;
            codex.mobs.variantKills.buffBear.day20 = (codex.mobs.variantKills.buffBear.day20 || 0) + 1;

            if (codex.journal && !codex.journal.day20BuffLoreUnlocked) {
                codex.journal.day20BuffLoreUnlocked = true;
                const reflectionDay = getCurrentDay() + 1;
                const loreEntry = "A colossal Maple Bear vaulted the treetops; its roar bent the frost itself.";
                recordDailyEvent(player, reflectionDay, loreEntry, "lore", codex);
            }
        } else if (bearType === INFECTED_PIG_ID) {
            codex.mobs.infectedPigKills = (codex.mobs.infectedPigKills || 0) + 1;
            codex.mobs.variantKills.infectedPig.original = (codex.mobs.variantKills.infectedPig.original || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "infectedPigKills", "infectedPigMobKills", "infectedPigHits", "infectedPigSeen", 3, "dangerous", "infected_pig");
        } else if (bearType === INFECTED_COW_ID) {
            codex.mobs.infectedCowKills = (codex.mobs.infectedCowKills || 0) + 1;
            codex.mobs.variantKills.infectedCow.original = (codex.mobs.variantKills.infectedCow.original || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "infectedCowKills", "infectedCowMobKills", "infectedCowHits", "infectedCowSeen", 3, "dangerous", "infected_cow");
        } else if (bearType === FLYING_BEAR_ID) {
            codex.mobs.flyingBearKills = (codex.mobs.flyingBearKills || 0) + 1;
            codex.mobs.variantKills.flyingBear.original = (codex.mobs.variantKills.flyingBear.original || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "flyingBearKills", "flyingBearMobKills", "flyingBearHits", "flyingBearSeen", 2, "dangerous", "flying_bear");
        } else if (bearType === FLYING_BEAR_DAY15_ID) {
            codex.mobs.flyingBearKills = (codex.mobs.flyingBearKills || 0) + 1;
            codex.mobs.variantKills.flyingBear.day15 = (codex.mobs.variantKills.flyingBear.day15 || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "flyingBearKills", "flyingBearMobKills", "flyingBearHits", "flyingBearSeen", 2, "dangerous", "flying_bear");
        } else if (bearType === FLYING_BEAR_DAY20_ID) {
            codex.mobs.flyingBearKills = (codex.mobs.flyingBearKills || 0) + 1;
            codex.mobs.variantKills.flyingBear.day20 = (codex.mobs.variantKills.flyingBear.day20 || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "flyingBearKills", "flyingBearMobKills", "flyingBearHits", "flyingBearSeen", 2, "dangerous", "flying_bear");
        } else if (bearType === MINING_BEAR_ID) {
            codex.mobs.miningBearKills = (codex.mobs.miningBearKills || 0) + 1;
            codex.mobs.variantKills.miningBear.original = (codex.mobs.variantKills.miningBear.original || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "miningBearKills", "miningBearMobKills", "miningBearHits", "miningBearSeen", 2, "dangerous", "mining_bear");
        } else if (bearType === MINING_BEAR_DAY20_ID) {
            codex.mobs.miningBearKills = (codex.mobs.miningBearKills || 0) + 1;
            codex.mobs.variantKills.miningBear.day20 = (codex.mobs.variantKills.miningBear.day20 || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "miningBearKills", "miningBearMobKills", "miningBearHits", "miningBearSeen", 2, "dangerous", "mining_bear");
        } else if (bearType === TORPEDO_BEAR_ID) {
            codex.mobs.torpedoBearKills = (codex.mobs.torpedoBearKills || 0) + 1;
            codex.mobs.variantKills.torpedoBear.original = (codex.mobs.variantKills.torpedoBear.original || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "torpedoBearKills", "torpedoBearMobKills", "torpedoBearHits", "torpedoBearSeen", 1, "threatening", "torpedo_bear");
        } else if (bearType === TORPEDO_BEAR_DAY20_ID) {
            codex.mobs.torpedoBearKills = (codex.mobs.torpedoBearKills || 0) + 1;
            codex.mobs.variantKills.torpedoBear.day20 = (codex.mobs.variantKills.torpedoBear.day20 || 0) + 1;
            checkAndUnlockMobDiscovery(codex, player, "torpedoBearKills", "torpedoBearMobKills", "torpedoBearHits", "torpedoBearSeen", 1, "threatening", "torpedo_bear");
        }
        
        // Check for day variant unlocks based on specific variant kills
        checkVariantUnlock(player, codex);
        
        saveCodex(player, codex);
    } catch (error) {
        console.warn(`[BEAR KILL] Error tracking bear kill for ${player.name}:`, error);
    }
}

function trackMobKill(killer, victim) {
    try {
        // Only track kills by Maple Bears and Infected Pigs
        const killerType = killer.typeId;
        if (killerType !== MAPLE_BEAR_ID && killerType !== MAPLE_BEAR_DAY4_ID && killerType !== MAPLE_BEAR_DAY8_ID && killerType !== MAPLE_BEAR_DAY13_ID && 
            killerType !== MAPLE_BEAR_DAY20_ID && killerType !== INFECTED_BEAR_ID && killerType !== INFECTED_BEAR_DAY8_ID && killerType !== INFECTED_BEAR_DAY13_ID && killerType !== INFECTED_BEAR_DAY20_ID &&
            killerType !== BUFF_BEAR_ID && killerType !== BUFF_BEAR_DAY13_ID && killerType !== BUFF_BEAR_DAY20_ID && killerType !== INFECTED_PIG_ID &&
            killerType !== FLYING_BEAR_ID && killerType !== FLYING_BEAR_DAY15_ID && killerType !== FLYING_BEAR_DAY20_ID &&
            killerType !== MINING_BEAR_ID && killerType !== MINING_BEAR_DAY20_ID &&
            killerType !== TORPEDO_BEAR_ID && killerType !== TORPEDO_BEAR_DAY20_ID) {
            return;
        }
        
        // Find nearby players to update their codex
        for (const player of world.getAllPlayers()) {
            if (!player || !player.dimension || player.dimension.id !== killer.dimension.id) continue;
            
            const dx = player.location.x - killer.location.x;
            const dy = player.location.y - killer.location.y;
            const dz = player.location.z - killer.location.z;
            const distance = dx * dx + dy * dy + dz * dz;
            
            // Only update if player is within 64 blocks
            if (distance <= 64 * 64) {
                const codex = getCodex(player);
                
                // Track mob kills and check unlock conditions
                if (killerType === MAPLE_BEAR_ID || killerType === MAPLE_BEAR_DAY4_ID || killerType === MAPLE_BEAR_DAY8_ID || killerType === MAPLE_BEAR_DAY13_ID || killerType === MAPLE_BEAR_DAY20_ID) {
                    codex.mobs.tinyBearMobKills = (codex.mobs.tinyBearMobKills || 0) + 1; // This mob kills other entities
                    checkAndUnlockMobDiscovery(codex, player, "tinyBearKills", "tinyBearMobKills", "tinyBearHits", "mapleBearSeen", 3, "mysterious");

                    if (killerType === MAPLE_BEAR_DAY20_ID && codex.journal && !codex.journal.day20TinyLoreUnlocked) {
                        codex.journal.day20TinyLoreUnlocked = true;
                        const reflectionDay = getCurrentDay() + 1;
                        const loreEntry = "Witnessed the smallest bears ignite with renewed purpose. Their steps cut cold lines through the snow.";
                        recordDailyEvent(player, reflectionDay, loreEntry, "lore", codex);
                    }
                } else if (killerType === INFECTED_BEAR_ID || killerType === INFECTED_BEAR_DAY8_ID || killerType === INFECTED_BEAR_DAY13_ID || killerType === INFECTED_BEAR_DAY20_ID) {
                    codex.mobs.infectedBearMobKills = (codex.mobs.infectedBearMobKills || 0) + 1;
                    checkAndUnlockMobDiscovery(codex, player, "infectedBearKills", "infectedBearMobKills", "infectedBearHits", "infectedBearSeen", 3, "dangerous");

                    if (killerType === INFECTED_BEAR_DAY20_ID && codex.journal && !codex.journal.day20InfectedLoreUnlocked) {
                        codex.journal.day20InfectedLoreUnlocked = true;
                        const reflectionDay = getCurrentDay() + 1;
                        const loreEntry = "Saw infected husks clad in drifting dust. Their presence drapes the world in a hollow quiet.";
                        recordDailyEvent(player, reflectionDay, loreEntry, "lore", codex);
                    }
                } else if (killerType === BUFF_BEAR_ID || killerType === BUFF_BEAR_DAY13_ID || killerType === BUFF_BEAR_DAY20_ID) {
                    codex.mobs.buffBearMobKills = (codex.mobs.buffBearMobKills || 0) + 1;
                    checkAndUnlockMobDiscovery(codex, player, "buffBearKills", "buffBearMobKills", "buffBearHits", "buffBearSeen", 1, "threatening");

                    if (killerType === BUFF_BEAR_DAY20_ID && codex.journal && !codex.journal.day20BuffLoreUnlocked) {
                        codex.journal.day20BuffLoreUnlocked = true;
                        const reflectionDay = getCurrentDay() + 1;
                        const loreEntry = "A colossal Maple Bear vaulted the treetops; its roar bent the frost itself.";
                        recordDailyEvent(player, reflectionDay, loreEntry, "lore", codex);
                    }
                } else if (killerType === INFECTED_PIG_ID) {
                    codex.mobs.infectedPigMobKills = (codex.mobs.infectedPigMobKills || 0) + 1;
                    checkAndUnlockMobDiscovery(codex, player, "infectedPigKills", "infectedPigMobKills", "infectedPigHits", "infectedPigSeen", 3, "dangerous");
                } else if (killerType === INFECTED_COW_ID) {
                    codex.mobs.infectedCowMobKills = (codex.mobs.infectedCowMobKills || 0) + 1;
                    checkAndUnlockMobDiscovery(codex, player, "infectedCowKills", "infectedCowMobKills", "infectedCowHits", "infectedCowSeen", 3, "dangerous");
                } else if (killerType === FLYING_BEAR_ID || killerType === FLYING_BEAR_DAY15_ID || killerType === FLYING_BEAR_DAY20_ID) {
                    codex.mobs.flyingBearMobKills = (codex.mobs.flyingBearMobKills || 0) + 1;
                    checkAndUnlockMobDiscovery(codex, player, "flyingBearKills", "flyingBearMobKills", "flyingBearHits", "flyingBearSeen", 2, "dangerous", "flying_bear");
                } else if (killerType === MINING_BEAR_ID || killerType === MINING_BEAR_DAY20_ID) {
                    codex.mobs.miningBearMobKills = (codex.mobs.miningBearMobKills || 0) + 1;
                    checkAndUnlockMobDiscovery(codex, player, "miningBearKills", "miningBearMobKills", "miningBearHits", "miningBearSeen", 2, "dangerous", "mining_bear");
                } else if (killerType === TORPEDO_BEAR_ID || killerType === TORPEDO_BEAR_DAY20_ID) {
                    codex.mobs.torpedoBearMobKills = (codex.mobs.torpedoBearMobKills || 0) + 1;
                    checkAndUnlockMobDiscovery(codex, player, "torpedoBearKills", "torpedoBearMobKills", "torpedoBearHits", "torpedoBearSeen", 1, "threatening", "torpedo_bear");
                }
                
                // Day variant unlocks are handled in trackBearKill when Maple Bears are encountered
                
                saveCodex(player, codex);
            }
        }
    } catch (error) {
        console.warn(`[MOB KILL] Error tracking mob kill by ${killer.typeId}:`, error);
    }
}

/**
 * Helper function to unlock day 4+ variants for a specific bear type
 * @param {Player} player The player
 * @param {Object} codex The codex object
 * @param {boolean} condition The unlock condition
 * @param {string} individualFlagKey The individual flag property name
 * @param {string} logLabel The label for console logging
 */
function unlockDay4Variant(player, codex, condition, individualFlagKey, messageFlagKey, logLabel) {
    if (condition) {
        codex.mobs.day4VariantsUnlocked = true; // Global flag for codex display
        codex.mobs[individualFlagKey] = true; // Individual flag

        // Record this event in the daily log for tomorrow
        const tomorrowDay = getCurrentDay() + 1;
        const eventMessage = `New variants of the ${logLabel.toLowerCase()} have been observed. They appear stronger and more aggressive than before.`;
        recordDailyEvent(player, tomorrowDay, eventMessage, "variants", codex);

        // Show unlock message only if not already shown
        if (!codex.mobs[messageFlagKey]) {
            codex.mobs[messageFlagKey] = true; // Mark message as shown

            if (codex.items.snowBookCrafted) {
                player.sendMessage("§8Day 4+ variants unlocked.");
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("random.orb", { pitch: 1.5, volume: 0.8 * volumeMultiplier });
                    player.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
            } else {
                player.sendMessage("§7You feel your knowledge expanding...");
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("random.orb", { pitch: 1.3, volume: 0.6 * volumeMultiplier });
                player.playSound("mob.villager.idle", { pitch: 1.0, volume: 0.4 * volumeMultiplier });
            }
            console.log(`[CODEX] ${player.name} unlocked ${logLabel} day 4+ variants`);
        }
    }
}

function checkVariantUnlock(player, codexParam = null) {
    try {
        const codex = codexParam || getCodex(player);
        const currentDay = getCurrentDay();

        // Initialize variant tracking if needed
        if (!codex.mobs.variantKills) {
            codex.mobs.variantKills = {
                tinyBear: { original: 0, day4: 0, day8: 0, day13: 0, day20: 0 },
                infectedBear: { original: 0, day8: 0, day13: 0, day20: 0 },
                buffBear: { original: 0, day13: 0, day20: 0 },
                infectedPig: { original: 0, day4: 0, day8: 0, day13: 0, day20: 0 },
                infectedCow: { original: 0, day4: 0, day8: 0, day13: 0, day20: 0 },
                flyingBear: { original: 0, day15: 0, day20: 0 },
                miningBear: { original: 0, day20: 0 },
                torpedoBear: { original: 0, day20: 0 }
            };
        }

        // Track which variant unlocks need messages (for staggered display)
        const pendingUnlocks = [];
        let messageDelay = 0; // Start with no delay, increment for each unlock

        // Check for day 4+ variant unlock - only when day 4 variants can actually spawn
        const dayUnlock4 = currentDay >= 4 && (codex.mobs.mapleBearSeen || codex.mobs.infectedBearSeen);

        // Unlock day 4+ variants only when they can actually spawn (day 4+)
        if (dayUnlock4 && !codex.mobs.day4VariantsUnlocked) {
            // Unlock all day 4+ variant types
            codex.mobs.day4VariantsUnlocked = true;
            codex.mobs.day4VariantsUnlockedTiny = true;
            codex.mobs.day4VariantsUnlockedInfected = true;
            codex.mobs.day4VariantsUnlockedBuff = true;
            codex.mobs.day4VariantsUnlockedOther = true;

            // Record this event in the daily log for tomorrow
            const tomorrowDay = getCurrentDay() + 1;
            const eventMessage = "New variants of the Maple Bears have been observed. They appear stronger and more aggressive than before.";
            recordDailyEvent(player, tomorrowDay, eventMessage, "variants", codex);

            // Schedule unlock message with delay
            if (!codex.mobs.day4MessageShown) {
                codex.mobs.day4MessageShown = true;
                pendingUnlocks.push({
                    delay: messageDelay,
                    message: codex.items.snowBookCrafted ? "§8Day 4+ variants unlocked." : "§7You feel your knowledge expanding...",
                    sounds: codex.items.snowBookCrafted ? 
                        [{ sound: "random.orb", pitch: 1.5, volume: 0.8 }, { sound: "mob.villager.idle", pitch: 1.2, volume: 0.6 }] :
                        [{ sound: "random.orb", pitch: 1.3, volume: 0.6 }, { sound: "mob.villager.idle", pitch: 1.0, volume: 0.4 }]
                });
                messageDelay += 40; // 2 seconds delay (40 ticks) for next message
                console.log(`[CODEX] ${player.name} unlocked day 4+ variants`);
            }
        }
        
        // Check for day 8+ variant unlock (either by day OR by 3 kills of day 4+ variants, but only if day >= 8)
        if (!codex.mobs.day8VariantsUnlocked) {
            const dayUnlock = currentDay >= 8 && (codex.mobs.mapleBearSeen || codex.mobs.infectedBearSeen || codex.mobs.flyingBearSeen);

            // Separate kill checks for each bear type's day 4+ variants (only valid if day >= 8)
            const tinyBearDay4Unlock = currentDay >= 8 && (codex.mobs.variantKills.tinyBear.day4 || 0) >= 3;
            const infectedBearDay4Unlock = currentDay >= 8 && (codex.mobs.variantKills.infectedBear.day4 || 0) >= 3;
            // Note: buffBear doesn't have day4 variant (only original, day13, day20), so it's excluded from this check
            const otherMobDay4Unlock = currentDay >= 8 && ((codex.mobs.variantKills.infectedPig.day4 || 0) >= 3 || (codex.mobs.variantKills.infectedCow.day4 || 0) >= 3);

            const killUnlock = tinyBearDay4Unlock || infectedBearDay4Unlock || otherMobDay4Unlock;
            
            if (dayUnlock || killUnlock) {
                codex.mobs.day8VariantsUnlocked = true;

                // Record this event in the daily log for tomorrow
                const tomorrowDay = getCurrentDay() + 1;
                const eventMessage = "The most dangerous Maple Bear variants yet have been documented. The infection continues to evolve.";
                recordDailyEvent(player, tomorrowDay, eventMessage, "variants", codex);

                // Schedule unlock message with delay
                if (!codex.mobs.day8MessageShown) {
                    codex.mobs.day8MessageShown = true;
                    pendingUnlocks.push({
                        delay: messageDelay,
                        message: codex.items.snowBookCrafted ? "§8Day 8+ variants unlocked." : "§7You feel your knowledge expanding...",
                        sounds: codex.items.snowBookCrafted ? 
                            [{ sound: "random.orb", pitch: 1.5, volume: 0.8 }, { sound: "mob.villager.idle", pitch: 1.2, volume: 0.6 }] :
                            [{ sound: "random.orb", pitch: 1.3, volume: 0.6 }, { sound: "mob.villager.idle", pitch: 1.0, volume: 0.4 }]
                    });
                    messageDelay += 40; // 2 seconds delay for next message
                    console.log(`[CODEX] ${player.name} unlocked day 8+ variants`);
                }
            }
        }
        
        // Check for day 13+ variant unlock (either by day OR by 3 kills of day 8+ variants, but only if day >= 13)
        if (!codex.mobs.day13VariantsUnlocked) {
            const dayUnlock = currentDay >= 13 && (codex.mobs.mapleBearSeen || codex.mobs.infectedBearSeen || codex.mobs.buffBearSeen || codex.mobs.flyingBearSeen);

            // Separate kill checks for each bear type's day 8+ variants (only valid if day >= 13)
            const tinyBearDay8Unlock = currentDay >= 13 && (codex.mobs.variantKills.tinyBear.day8 || 0) >= 3;
            const infectedBearDay8Unlock = currentDay >= 13 && (codex.mobs.variantKills.infectedBear.day8 || 0) >= 3;
            const buffBearDay13Unlock = currentDay >= 13 && (codex.mobs.variantKills.buffBear?.original || 0) >= 3;
            const otherMobDay8Unlock = currentDay >= 13 && ((codex.mobs.variantKills.infectedPig.day8 || 0) >= 3 || (codex.mobs.variantKills.infectedCow.day8 || 0) >= 3);

            const killUnlock = tinyBearDay8Unlock || infectedBearDay8Unlock || buffBearDay13Unlock || otherMobDay8Unlock;
            
            if (dayUnlock || killUnlock) {
                codex.mobs.day13VariantsUnlocked = true;

                // Record this event in the daily log for tomorrow
                const tomorrowDay = getCurrentDay() + 1;
                const eventMessage = "The most advanced Maple Bear variants have been observed. The infection has reached unprecedented levels.";
                recordDailyEvent(player, tomorrowDay, eventMessage, "variants", codex);

                // Schedule unlock message with delay
                if (!codex.mobs.day13MessageShown) {
                    codex.mobs.day13MessageShown = true;
                    pendingUnlocks.push({
                        delay: messageDelay,
                        message: codex.items.snowBookCrafted ? "§8Day 13+ variants unlocked." : "§7You feel your knowledge expanding...",
                        sounds: codex.items.snowBookCrafted ? 
                            [{ sound: "random.orb", pitch: 1.5, volume: 0.8 }, { sound: "mob.villager.idle", pitch: 1.2, volume: 0.6 }] :
                            [{ sound: "random.orb", pitch: 1.3, volume: 0.6 }, { sound: "mob.villager.idle", pitch: 1.0, volume: 0.4 }]
                    });
                    messageDelay += 40; // 2 seconds delay for next message
                    console.log(`[CODEX] ${player.name} unlocked day 13+ variants`);
                }
            }
        }

        // Check for day 20+ variant unlock (either by day OR by 5 kills of day 13+ variants, but only if day >= 20)
        if (!codex.mobs.day20VariantsUnlocked) {
            const dayUnlock20 = currentDay >= 20 && (codex.mobs.mapleBearSeen || codex.mobs.infectedBearSeen || codex.mobs.buffBearSeen);

            const tinyBearDay13Unlock = currentDay >= 20 && (codex.mobs.variantKills.tinyBear.day13 || 0) >= 5;
            const infectedBearDay13Unlock = currentDay >= 20 && (codex.mobs.variantKills.infectedBear.day13 || 0) >= 5;
            const buffBearDay13Unlock = currentDay >= 20 && (codex.mobs.variantKills.buffBear.day13 || 0) >= 5;
            const otherMobDay13Unlock = currentDay >= 20 && ((codex.mobs.variantKills.infectedPig.day13 || 0) >= 5 || (codex.mobs.variantKills.infectedCow.day13 || 0) >= 5);

            const killUnlock20 = tinyBearDay13Unlock || infectedBearDay13Unlock || buffBearDay13Unlock || otherMobDay13Unlock;
            
            if (dayUnlock20 || killUnlock20) {
                codex.mobs.day20VariantsUnlocked = true;
                codex.mobs.day20VariantsUnlockedTiny = dayUnlock20 || tinyBearDay13Unlock;
                codex.mobs.day20VariantsUnlockedInfected = dayUnlock20 || infectedBearDay13Unlock;
                codex.mobs.day20VariantsUnlockedBuff = dayUnlock20 || buffBearDay13Unlock;
                codex.mobs.day20VariantsUnlockedOther = dayUnlock20 || otherMobDay13Unlock;

                const tomorrowDay = getCurrentDay() + 1;
                const eventMessage = "Day 20+ Maple Bear forms have surfaced, displaying unmatched ferocity and influence over the infection.";
                recordDailyEvent(player, tomorrowDay, eventMessage, "variants", codex);

                // Schedule unlock message with delay
                if (!codex.mobs.day20MessageShown) {
                    codex.mobs.day20MessageShown = true;
                    pendingUnlocks.push({
                        delay: messageDelay,
                        message: codex.items.snowBookCrafted ? "§8Day 20+ variants unlocked." : "§7You feel your knowledge pulled toward something dreadful...",
                        sounds: codex.items.snowBookCrafted ? 
                            [{ sound: "random.orb", pitch: 1.5, volume: 0.8 }, { sound: "mob.villager.idle", pitch: 1.2, volume: 0.6 }] :
                            [{ sound: "random.orb", pitch: 1.3, volume: 0.6 }, { sound: "mob.villager.idle", pitch: 1.0, volume: 0.4 }]
                    });
                    console.log(`[CODEX] ${player.name} unlocked day 20+ variants`);
                }
            }
        }

        // Schedule all pending unlock messages with staggered delays
        for (const unlock of pendingUnlocks) {
            system.runTimeout(() => {
                try {
                    if (player && player.isValid) {
                        player.sendMessage(unlock.message);
                        const volumeMultiplier = getPlayerSoundVolume(player);
                        for (const sound of unlock.sounds) {
                            player.playSound(sound.sound, { pitch: sound.pitch, volume: sound.volume * volumeMultiplier });
                        }
                    }
                } catch (error) {
                    console.warn(`[VARIANT] Failed to show delayed unlock message:`, error);
                }
            }, unlock.delay);
        }

        // Update knowledge progression after variant unlock check
        try {
            if (typeof checkKnowledgeProgression === 'function') {
                checkKnowledgeProgression(player);
                }
        } catch (error) {
            console.warn(`[ERROR] Failed to update knowledge progression after variant unlock:`, error);
        }
    } catch (error) {
        console.warn(`[VARIANT] Error checking variant unlock for ${player.name}:`, error);
    }
}


// --- Helper: Calculate snow time effect based on tier ---
function getSnowTimeEffect(snowCount) {
    if (snowCount <= 5) {
        // Tier 1: The Awakening - extends time (reduced)
        return Math.floor(INFECTION_TICKS * 0.05); // +5% time
    } else if (snowCount <= 10) {
        // Tier 2: The Craving - neutral effect
        return 0; // No effect
    } else if (snowCount <= 20) {
        // Tier 3: The Descent - accelerates time (reduced)
        return -Math.floor(INFECTION_TICKS * 0.01); // -1% time
    } else if (snowCount <= 50) {
        // Tier 4: The Void - heavily accelerates time (reduced)
        return -Math.floor(INFECTION_TICKS * 0.025); // -2.5% time
    } else if (snowCount <= 100) {
        // Tier 5: The Abyss - extremely accelerates time (reduced)
        return -Math.floor(INFECTION_TICKS * 0.05); // -5% time
    } else {
        // Tier 6: The Black Void - beyond comprehension
        return -Math.floor(INFECTION_TICKS * 0.15); // -15% time
    }
}

// --- Helper: Apply random effects based on snow tier ---
function applySnowTierEffects(player, snowCount) {
    try {
        // Helper function to get fully-qualified effect ID
        function getEffectId(effectName) {
            return `minecraft:${effectName}`;
        }
        
        // Determine tier and apply appropriate effects (mix of positive and negative)
        if (snowCount <= 5) {
            // Tier 1: Mild effects - mostly positive with some negative
            const effects = ["regeneration", "speed", "weakness", "nausea"];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            const isPositive = randomEffect === "regeneration" || randomEffect === "speed";
            const duration = isPositive ? 300 : 200;
            const amplifier = isPositive ? 0 : 0;
            applyEffect(player, getEffectId(randomEffect), duration, { amplifier, showParticles: true });
            
            // Track snow effects in codex
            try {
                if (randomEffect === "regeneration") markCodex(player, "snowEffects.regenerationSeen");
                if (randomEffect === "speed") markCodex(player, "snowEffects.speedSeen");
                if (randomEffect === "weakness") markCodex(player, "snowEffects.weaknessSeen");
                if (randomEffect === "nausea") markCodex(player, "snowEffects.nauseaSeen");
                markCodex(player, "symptomsUnlocks.snowEffectsUnlocked");
            } catch (error) {
                console.warn(`[SNOW EFFECTS] Error tracking snow effects:`, error);
            }
        } else if (snowCount <= 10) {
            // Tier 2: Moderate effects - balanced mix
            const effects = ["regeneration", "speed", "jump_boost", "weakness", "nausea", "slowness"];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            const isPositive = randomEffect === "regeneration" || randomEffect === "speed" || randomEffect === "jump_boost";
            const duration = isPositive ? 400 : 300;
            const amplifier = isPositive ? 0 : 1;
            applyEffect(player, getEffectId(randomEffect), duration, { amplifier, showParticles: true });
            
            // Track snow effects in codex
            try {
                if (randomEffect === "regeneration") markCodex(player, "snowEffects.regenerationSeen");
                if (randomEffect === "speed") markCodex(player, "snowEffects.speedSeen");
                if (randomEffect === "jump_boost") markCodex(player, "snowEffects.jumpBoostSeen");
                if (randomEffect === "weakness") markCodex(player, "snowEffects.weaknessSeen");
                if (randomEffect === "nausea") markCodex(player, "snowEffects.nauseaSeen");
                if (randomEffect === "slowness") markCodex(player, "snowEffects.slownessSeen");
                markCodex(player, "symptomsUnlocks.snowEffectsUnlocked");
            } catch (error) {
                console.warn(`[SNOW EFFECTS] Error tracking snow effects:`, error);
            }
        } else if (snowCount <= 20) {
            // Tier 3: Strong effects - more negative but still some positive
            const effects = ["regeneration", "speed", "jump_boost", "strength", "weakness", "nausea", "slowness", "blindness"];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            const isPositive = randomEffect === "regeneration" || randomEffect === "speed" || randomEffect === "jump_boost" || randomEffect === "strength";
            const duration = isPositive ? 500 : 400;
            const amplifier = isPositive ? 1 : 1;
            applyEffect(player, getEffectId(randomEffect), duration, { amplifier, showParticles: true });
            
            // Track snow effects in codex
            try {
                if (randomEffect === "regeneration") markCodex(player, "snowEffects.regenerationSeen");
                if (randomEffect === "speed") markCodex(player, "snowEffects.speedSeen");
                if (randomEffect === "jump_boost") markCodex(player, "snowEffects.jumpBoostSeen");
                if (randomEffect === "strength") markCodex(player, "snowEffects.strengthSeen");
                if (randomEffect === "weakness") markCodex(player, "snowEffects.weaknessSeen");
                if (randomEffect === "nausea") markCodex(player, "snowEffects.nauseaSeen");
                if (randomEffect === "slowness") markCodex(player, "snowEffects.slownessSeen");
                if (randomEffect === "blindness") markCodex(player, "snowEffects.blindnessSeen");
                markCodex(player, "symptomsUnlocks.snowEffectsUnlocked");
            } catch (error) {
                console.warn(`[SNOW EFFECTS] Error tracking snow effects:`, error);
            }
        } else if (snowCount <= 50) {
            // Tier 4: Severe effects - mostly negative with rare positive
            const effects = ["regeneration", "speed", "strength", "weakness", "nausea", "slowness", "blindness", "hunger"];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            const isPositive = randomEffect === "regeneration" || randomEffect === "speed" || randomEffect === "strength";
            const duration = isPositive ? 600 : 500;
            const amplifier = isPositive ? 1 : 2;
            applyEffect(player, getEffectId(randomEffect), duration, { amplifier, showParticles: true });
            
            // Track snow effects in codex
            try {
                if (randomEffect === "regeneration") markCodex(player, "snowEffects.regenerationSeen");
                if (randomEffect === "speed") markCodex(player, "snowEffects.speedSeen");
                if (randomEffect === "strength") markCodex(player, "snowEffects.strengthSeen");
                if (randomEffect === "weakness") markCodex(player, "snowEffects.weaknessSeen");
                if (randomEffect === "nausea") markCodex(player, "snowEffects.nauseaSeen");
                if (randomEffect === "slowness") markCodex(player, "snowEffects.slownessSeen");
                if (randomEffect === "blindness") markCodex(player, "snowEffects.blindnessSeen");
                if (randomEffect === "hunger") markCodex(player, "snowEffects.hungerSeen");
                markCodex(player, "symptomsUnlocks.snowEffectsUnlocked");
            } catch (error) {
                console.warn(`[SNOW EFFECTS] Error tracking snow effects:`, error);
            }
        } else if (snowCount <= 100) {
            // Tier 5: Extreme effects - mostly negative
            const effects = ["regeneration", "weakness", "nausea", "slowness", "blindness", "hunger", "mining_fatigue"];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            const isPositive = randomEffect === "regeneration";
            const duration = isPositive ? 700 : 600;
            const amplifier = isPositive ? 2 : 2;
            applyEffect(player, getEffectId(randomEffect), duration, { amplifier, showParticles: true });
            
            // Track snow effects in codex
            try {
                if (randomEffect === "regeneration") markCodex(player, "snowEffects.regenerationSeen");
                if (randomEffect === "weakness") markCodex(player, "snowEffects.weaknessSeen");
                if (randomEffect === "nausea") markCodex(player, "snowEffects.nauseaSeen");
                if (randomEffect === "slowness") markCodex(player, "snowEffects.slownessSeen");
                if (randomEffect === "blindness") markCodex(player, "snowEffects.blindnessSeen");
                if (randomEffect === "hunger") markCodex(player, "snowEffects.hungerSeen");
                if (randomEffect === "mining_fatigue") markCodex(player, "snowEffects.miningFatigueSeen");
                markCodex(player, "symptomsUnlocks.snowEffectsUnlocked");
            } catch (error) {
                console.warn(`[SNOW EFFECTS] Error tracking snow effects:`, error);
            }
        } else {
            // Tier 6: Devastating effects - all negative
            const effects = ["weakness", "nausea", "slowness", "blindness", "hunger", "mining_fatigue"];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            applyEffect(player, `minecraft:${randomEffect}`, 800, { amplifier: 3, showParticles: true });
            
            // Track snow effects in codex
            try {
                if (randomEffect === "weakness") markCodex(player, "snowEffects.weaknessSeen");
                if (randomEffect === "nausea") markCodex(player, "snowEffects.nauseaSeen");
                if (randomEffect === "slowness") markCodex(player, "snowEffects.slownessSeen");
                if (randomEffect === "blindness") markCodex(player, "snowEffects.blindnessSeen");
                if (randomEffect === "hunger") markCodex(player, "snowEffects.hungerSeen");
                if (randomEffect === "mining_fatigue") markCodex(player, "snowEffects.miningFatigueSeen");
                markCodex(player, "symptomsUnlocks.snowEffectsUnlocked");
            } catch (error) {
                console.warn(`[SNOW EFFECTS] Error tracking snow effects:`, error);
            }
        }
    } catch (error) {
        console.warn(`[SNOW EFFECTS] Error applying snow tier effects:`, error);
    }
}

// --- Helper: Update maximum snow level achieved ---
function updateMaxSnowLevel(player, snowCount) {
    const currentMax = maxSnowLevels.get(player.id) || { maxLevel: 0, achievedAt: 0 };
    if (snowCount > currentMax.maxLevel) {
        maxSnowLevels.set(player.id, { maxLevel: snowCount, achievedAt: Date.now() });
        console.log(`[SNOW] ${player.name} achieved new max snow level: ${snowCount.toFixed(1)}`);
        
        // Mark codex based on achievement level
        try {
            if (snowCount >= 5) markCodex(player, "items.snowTier5Reached");
            if (snowCount >= 10) markCodex(player, "items.snowTier10Reached");
            if (snowCount >= 20) markCodex(player, "items.snowTier20Reached");
            if (snowCount >= 50) markCodex(player, "items.snowTier50Reached");
        } catch { }
    }
}

// --- Helper: Track infection history ---
function trackInfectionHistory(player, event) {
    try {
        const codex = getCodex(player);
        const now = Date.now();
        
        if (event === "infected") {
            codex.history.totalInfections++;
            codex.history.lastInfectionAt = now;
            if (codex.history.firstInfectionAt === 0) {
                codex.history.firstInfectionAt = now;
            }
            console.log(`[HISTORY] ${player.name} infected (total: ${codex.history.totalInfections})`);
        } else if (event === "cured") {
            codex.history.totalCures++;
            codex.history.lastCureAt = now;
            console.log(`[HISTORY] ${player.name} cured (total: ${codex.history.totalCures})`);
        }
        
        // Save updated codex
        player.setDynamicProperty("mb_codex", JSON.stringify(codex));

        // Update knowledge progression after infection history change
        try {
            if (typeof checkKnowledgeProgression === 'function') {
                checkKnowledgeProgression(player);
            }
        } catch (error) {
            console.warn(`[ERROR] Failed to update knowledge progression after infection history:`, error);
        }
    } catch (error) {
        console.warn(`[HISTORY] Error tracking infection history for ${player.name}:`, error);
    }
}

// --- Helper: Track infection experience ---
function trackInfectionExperience(player, source, severity = 0) {
    try {
        let experience = infectionExperience.get(player.id) || { 
            bearInfected: false, 
            snowInfected: false, 
            maxSeverity: 0, 
            effectsSeen: new Set() 
        };
        
        if (source === "bear") {
            experience.bearInfected = true;
            safeMarkCodex(player, "infections.bearInfected");
        } else if (source === "snow") {
            experience.snowInfected = true;
            safeMarkCodex(player, "infections.snowInfected");
        }
        
        if (severity > experience.maxSeverity) {
            experience.maxSeverity = severity;
            // Mark severity-based codex entries
            if (severity >= 1) safeMarkCodex(player, "infections.severity1");
            if (severity >= 2) safeMarkCodex(player, "infections.severity2");
            if (severity >= 3) safeMarkCodex(player, "infections.severity3");
            if (severity >= 4) safeMarkCodex(player, "infections.severity4");
        }
        
        infectionExperience.set(player.id, experience);
        console.log(`[EXPERIENCE] ${player.name} infection experience updated: ${JSON.stringify(experience)}`);

        // Update knowledge progression after infection experience change
        try {
            if (typeof checkKnowledgeProgression === 'function') {
                checkKnowledgeProgression(player);
            }
        } catch (error) {
            console.warn(`[ERROR] Failed to update knowledge progression after infection experience:`, error);
        }
    } catch (error) {
        console.warn(`[EXPERIENCE] Error tracking infection experience for ${player.name}:`, error);
    }
}

// --- Helper: Track effect experience ---
function trackEffectExperience(player, effectId, severity) {
    try {
        let experience = infectionExperience.get(player.id) || { 
            bearInfected: false, 
            snowInfected: false, 
            maxSeverity: 0, 
            effectsSeen: new Set() 
        };
        
        experience.effectsSeen.add(`${effectId}_${severity}`);
        infectionExperience.set(player.id, experience);
        
        // Mark specific effect experiences in codex
        if (effectId === "minecraft:blindness") safeMarkCodex(player, "effects.blindnessSeen");
        if (effectId === "minecraft:nausea") safeMarkCodex(player, "effects.nauseaSeen");
        if (effectId === "minecraft:weakness") safeMarkCodex(player, "effects.weaknessSeen");
        if (effectId === "minecraft:slowness") safeMarkCodex(player, "effects.slownessSeen");
        if (effectId === "minecraft:hunger") safeMarkCodex(player, "effects.hungerSeen");
        if (effectId === "minecraft:mining_fatigue") safeMarkCodex(player, "effects.miningFatigueSeen");
        
        // Unlock infection symptoms tab when first negative effect is experienced
        if (effectId === "minecraft:blindness" || effectId === "minecraft:nausea" || effectId === "minecraft:weakness" || 
            effectId === "minecraft:slowness" || effectId === "minecraft:hunger" || effectId === "minecraft:mining_fatigue") {
            safeMarkCodex(player, "symptomsUnlocks.infectionSymptomsUnlocked");
        }
        
        console.log(`[EFFECT] ${player.name} experienced ${effectId} at severity ${severity}`);
    } catch (error) {
        console.warn(`[EFFECT] Error tracking effect experience for ${player.name}:`, error);
    }
}

// --- Helper: Handle infection expiration ---
function handleInfectionExpiration(player, infectionState) {
    const wasActiveRecently = infectionState.lastActiveTick && 
        (system.currentTick - infectionState.lastActiveTick) < 1200; // 1 minute grace period
    
    if (wasActiveRecently) {
        // Transform player
        try { 
            player.kill();
            const currentDay = getCurrentDay();
            let infectedBearType = INFECTED_BEAR_ID; // Default to original
            
            // Choose appropriate infected bear variant based on current day
            if (currentDay >= 13) {
                infectedBearType = INFECTED_BEAR_DAY13_ID; // Day 13+ variant
            } else if (currentDay >= 8) {
                infectedBearType = INFECTED_BEAR_DAY8_ID; // Day 8+ variant
            }
            
            const bear = player.dimension.spawnEntity(infectedBearType, player.location);
            if (bear) { 
                bear.nameTag = `§4! ${player.name}'s Infected Form`; 
                bear.setDynamicProperty("infected_by", player.id); 
            }
            player.dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${player.name} transformed into a Maple Bear!"}]}`);
            
            // Record this event in daily logs for all players (reflection on next day)
            const tomorrowDay = getCurrentDay() + 1;
            const eventMessage = `${player.name} has been consumed by the infection and transformed into a Maple Bear.`;
            for (const p of world.getAllPlayers()) {
                if (p && p.isValid) {
                    try {
                        recordDailyEvent(p, tomorrowDay, eventMessage, "general");
                    } catch (error) {
                        console.warn(`[DAILY LOG] Error recording player death for ${p.name}:`, error);
                    }
                }
            }
        } catch { }
            } else {
        // Infection expired while offline - just clear it
        console.log(`[INFECTION] ${player.name}'s infection expired while offline - clearing without transformation`);
    }
    
    player.removeTag(INFECTED_TAG);
    playerInfection.delete(player.id);
}

// --- Helper: Send contextual discovery message ---
function sendDiscoveryMessage(player, codex, messageType = "interesting", itemType = "") {
    if (codex?.items?.snowBookCrafted) {
        player.sendMessage("§7Check your journal.");
        // Play discovery sound
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("random.orb", { pitch: 1.8, volume: 0.6 * volumeMultiplier });
        } else {
        // Two-level mapping: messageType -> itemType -> message
        const messages = {
            important: {
                weakness: "§7A weakness potion... This seems important for curing infections!",
                enchanted_apple: "§7An enchanted golden apple... This seems important for healing!",
                snow: "§7Some mysterious powder... This seems important to remember!",
                default: "§7This seems important... I will need to remember it."
            },
            dangerous: {
                infected_bear: "§7An infected bear... This creature is dangerous and corrupted!",
                infected_pig: "§7An infected pig... This creature is dangerous and corrupted!",
                infected_cow: "§7An infected cow... This creature is dangerous and corrupted!",
                flying_bear: "§7A flying Maple Bear... the white powder rains from the sky now.",
                mining_bear: "§7A mining Maple Bear... it digs careful powder lanes straight to you.",
                default: "§7This creature is dangerous... I should remember its behavior."
            },
            mysterious: {
                tiny_bear: "§7A tiny Maple Bear... This creature is mysterious and unsettling!",
                default: "§7This creature is mysterious... I need to study it more."
            },
            threatening: {
                buff_bear: "§7A buff Maple Bear... Book it bro, run for your life.",
                torpedo_bear: "§7A torpedo Maple Bear... sky-borne white powder warheads are real.",
                default: "§7This creature is threatening... I must understand its nature."
            },
            interesting: {
                brewing_stand: "§7A brewing stand... This seems important for alchemy!",
                golden_apple: "§7A golden apple... This seems useful for healing!",
                snow: "§7Some mysterious powder... This seems important to remember!",
                default: "§7This seems interesting... I will need to remember it."
            },
            default: "§7This seems interesting... I will need to remember it."
        };

        // Lookup message with fallback chain
        const message = messages[messageType]?.[itemType] || messages[messageType]?.default || messages.default;
        player.sendMessage(message);

        // Play discovery sound
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("random.orb", { pitch: 1.8, volume: 0.6 * volumeMultiplier });
    }
}

// --- Helper: Common entity conversion logic ---
function convertEntity(deadEntity, killer, targetEntityId, conversionName) {
    // Validate entities
    if (!deadEntity || !deadEntity.isValid || !killer || !killer.isValid) {
        // console.log(`[${conversionName}] Skipping - entity or killer is invalid`);
        return null;
    }
    
    const location = deadEntity.location;
    const dimension = deadEntity.dimension;
    
    // Check chunk is loaded
    try {
        dimension.getBlock({ 
            x: Math.floor(location.x), 
            y: Math.floor(location.y), 
            z: Math.floor(location.z) 
        });
        } catch (chunkError) {
        // console.log(`[${conversionName}] Skipping - chunk not loaded at ${Math.floor(location.x)}, ${Math.floor(location.y)}, ${Math.floor(location.z)}`);
        return null;
        }
        
    // Spawn replacement entity
    const newEntity = dimension.spawnEntity(targetEntityId, location);
        
    // Add visual feedback
        dimension.spawnParticle("mb:white_dust_particle", location);
    
    // Place snow layer at spawn location (all Maple Bears spawn on snow)
    // Place snow at the block below the entity (where there's air above ground)
    try {
        const spawnY = Math.floor(location.y - 1);
        const snowLoc = { x: Math.floor(location.x), y: spawnY, z: Math.floor(location.z) };
        const snowBlock = dimension.getBlock(snowLoc);
        const aboveBlock = dimension.getBlock({ x: snowLoc.x, y: spawnY + 1, z: snowLoc.z });
        // Place snow if the block below is solid and the space above (where entity spawns) is air
        if (snowBlock && aboveBlock && snowBlock.isAir !== undefined && !snowBlock.isAir && snowBlock.isLiquid !== undefined && !snowBlock.isLiquid && aboveBlock.isAir !== undefined && aboveBlock.isAir) {
            // Use custom snow layer if available, otherwise vanilla
            try {
                aboveBlock.setType("mb:snow_layer");
            } catch {
                aboveBlock.setType(SNOW_LAYER_BLOCK);
            }
        }
    } catch {
        // Ignore snow placement errors
    }
        
    // console.log(`[${conversionName}] Conversion complete`);
    return newEntity;
}

// --- Helper: Convert pig to infected pig ---
function convertPigToInfectedPig(deadPig, killer) {
    try {
        const killerType = killer.typeId;
        const currentDay = getCurrentDay();
        
        // Use shared conversion logic
        const infectedPig = convertEntity(deadPig, killer, INFECTED_PIG_ID, "PIG CONVERSION");
        
        if (infectedPig) {
        // console.log(`[PIG CONVERSION] Day ${currentDay}: Pig killed by ${killerType} → spawned Infected Pig`);
        }
        
    } catch (error) {
        // console.warn(`[PIG CONVERSION] Error converting pig to infected pig:`, error);
    }
}

// --- Helper: Convert cow to infected cow ---
function convertCowToInfectedCow(deadCow, killer) {
    try {
        const killerType = killer.typeId;
        const currentDay = getCurrentDay();
        
        // Use shared conversion logic
        const infectedCow = convertEntity(deadCow, killer, INFECTED_COW_ID, "COW CONVERSION");
        
        if (infectedCow) {
        // console.log(`[COW CONVERSION] Day ${currentDay}: Cow killed by ${killerType} → spawned Infected Cow`);
        }
        
    } catch (error) {
        // console.warn(`[COW CONVERSION] Error converting cow to infected cow:`, error);
    }
}

// --- Helper: Convert mob to Maple Bear based on size and day ---
function convertMobToMapleBear(deadMob, killer) {
    try {
        const mobType = deadMob.typeId;
        
        // Don't convert pigs and cows - they're handled by their respective conversion systems
        if (mobType === "minecraft:pig") {
            // console.log(`[CONVERSION] Ignoring pig conversion - handled by pig conversion system`);
            return;
        }
        if (mobType === "minecraft:cow") {
            // console.log(`[CONVERSION] Ignoring cow conversion - handled by cow conversion system`);
            return;
        }
        
        // Check nearby bear count - stop converting if 40+ Maple Bears within range
        try {
            const nearbyEntities = deadMob.dimension.getEntities({
                location: deadMob.location,
                maxDistance: 64,
                families: ["maple_bear", "infected"]
            });
            let totalBearCount = 0;
            let buffBearCount = 0;
            const mbTypePrefixes = ["mb:mb", "mb:infected", "mb:buff_mb", "mb:flying_mb", "mb:mining_mb", "mb:torpedo_mb"];
            
            for (const nearby of nearbyEntities) {
                const typeId = nearby.typeId;
                if (mbTypePrefixes.some(prefix => typeId.startsWith(prefix))) {
                    totalBearCount++;
                    if (typeId === BUFF_BEAR_ID || typeId === BUFF_BEAR_DAY13_ID || typeId === BUFF_BEAR_DAY20_ID) {
                        buffBearCount++;
                    }
                }
            }
            
            // Stop conversion if too many bears (40 max)
            if (totalBearCount >= 40) {
                return; // Too many bears nearby - stop converting
            }
            // Stop buff bear creation if too many (5 max)
            if (buffBearCount >= 5) {
                const willBeBuff = (mobType.includes('warden') || mobType.includes('ravager') || 
                                  mobType.includes('iron_golem') || mobType.includes('wither') ||
                                  mobType.includes('ender_dragon') || mobType.includes('giant') ||
                                  mobType.includes('shulker') || mobType.includes('elder_guardian'));
                if (willBeBuff) {
                    return; // Would create buff bear - skip conversion
                }
            }
        } catch (error) {
            // Error checking nearby entities - allow conversion to proceed
        }
        
        const killerType = killer.typeId;
        const currentDay = getCurrentDay();
        
        // Determine Maple Bear type to spawn based on killer, mob size, and current day
        let newBearType;
        let bearSize = "normal";
        
        // Buff Maple Bears always spawn normal human-sized Maple Bears
        if (killerType === BUFF_BEAR_ID || killerType === BUFF_BEAR_DAY13_ID || killerType === BUFF_BEAR_DAY20_ID) {
            newBearType = MAPLE_BEAR_ID;
            bearSize = "normal";
        } else if (killerType === MAPLE_BEAR_ID || killerType === MAPLE_BEAR_DAY4_ID || killerType === MAPLE_BEAR_DAY8_ID || killerType === MAPLE_BEAR_DAY13_ID || killerType === MAPLE_BEAR_DAY20_ID) {
            // Tiny Maple Bears behavior changes based on day
            // console.log(`[CONVERSION] Tiny bear detected (${killerType}), current day: ${currentDay}`);
            if (currentDay < 4) {
                // Before day 4: Tiny Maple Bears always spawn tiny Maple Bears (regardless of victim size)
                newBearType = MAPLE_BEAR_ID; // Always spawn tiny Maple Bear (mb:mb)
                bearSize = "tiny";
                // console.log(`[CONVERSION] Pre-day 4: Tiny bear spawning tiny bear (${newBearType})`);
            } else if (currentDay >= 4 && currentDay < 8) {
                // Day 4-7: Tiny Maple Bears use size-based system with day 4+ variants
                const mobSize = getMobSize(mobType);
                if (mobSize === "tiny") {
                    newBearType = MAPLE_BEAR_DAY4_ID; // Day 4+ tiny bears
                    bearSize = "tiny";
                } else if (mobSize === "large") {
                    newBearType = INFECTED_BEAR_ID; // infected.json for normal bears
                    bearSize = "normal";
                } else {
                    newBearType = INFECTED_BEAR_ID; // infected.json for normal bears
                    bearSize = "normal";
                }
            } else if (currentDay < 13) {
                // Day 8-12: Tiny Maple Bears use size-based system with day 8+ variants
                const mobSize = getMobSize(mobType);
                if (mobSize === "tiny") {
                    newBearType = MAPLE_BEAR_DAY8_ID; // Day 8+ tiny bears
                    bearSize = "tiny";
                } else if (mobSize === "large") {
                    newBearType = BUFF_BEAR_ID; // Buff Maple Bears for large mobs
                    bearSize = "buff";
                } else {
                    newBearType = INFECTED_BEAR_DAY8_ID; // Day 8+ normal bears
                    bearSize = "normal";
                }
            } else if (currentDay < 20) {
                // Day 13-19: Tiny Maple Bears use size-based system with day 13+ variants
                const mobSize = getMobSize(mobType);
                if (mobSize === "tiny") {
                    newBearType = MAPLE_BEAR_DAY13_ID; // Day 13+ tiny bears
                    bearSize = "tiny";
                } else if (mobSize === "large") {
                    newBearType = BUFF_BEAR_DAY13_ID; // Day 13+ Buff Maple Bears for large mobs
                    bearSize = "buff";
                } else {
                    newBearType = INFECTED_BEAR_DAY13_ID; // Day 13+ normal bears
                    bearSize = "normal";
                }
            } else {
                // Day 20+: Tiny Maple Bears use size-based system with day 20+ variants
                const mobSize = getMobSize(mobType);
                if (mobSize === "tiny") {
                    newBearType = MAPLE_BEAR_DAY20_ID; // Day 20+ tiny bears
                    bearSize = "tiny";
                } else if (mobSize === "large") {
                    newBearType = BUFF_BEAR_DAY20_ID; // Day 20+ Buff Maple Bears for large mobs
                    bearSize = "buff";
                } else {
                    newBearType = INFECTED_BEAR_DAY20_ID; // Day 20+ normal bears
                    bearSize = "normal";
                }
            }
        } else {
            // Normal/Infected Maple Bears spawn based on victim's size and day
            const mobSize = getMobSize(mobType);
            
            if (mobSize === "tiny") {
                // Choose appropriate tiny bear variant based on day
                if (currentDay >= 20) {
                    newBearType = MAPLE_BEAR_DAY20_ID;
                } else if (currentDay >= 13) {
                    newBearType = MAPLE_BEAR_DAY13_ID; // Day 13+ tiny bears
                } else if (currentDay >= 8) {
                    newBearType = MAPLE_BEAR_DAY8_ID; // Day 8+ tiny bears
                } else if (currentDay >= 4) {
                    newBearType = MAPLE_BEAR_DAY4_ID; // Day 4+ tiny bears
                } else {
                    newBearType = MAPLE_BEAR_ID; // Original tiny bears
                }
                bearSize = "tiny";
            } else if (mobSize === "large") {
                // Large mobs become Buff Maple Bears based on day
                if (currentDay >= 20) {
                    newBearType = BUFF_BEAR_DAY20_ID;
                    bearSize = "buff";
                } else if (currentDay >= 13) {
                    newBearType = BUFF_BEAR_ID; // Day 13+ Buff Maple Bears (swapped from day 8)
                    bearSize = "buff";
                } else {
                    newBearType = INFECTED_BEAR_ID; // Original normal bears
                    bearSize = "normal";
                }
            } else {
                // Choose appropriate normal bear variant based on day
                if (currentDay >= 20) {
                    newBearType = INFECTED_BEAR_DAY20_ID;
                } else if (currentDay >= 13) {
                    newBearType = INFECTED_BEAR_DAY13_ID; // Day 13+ normal bears
                } else if (currentDay >= 8) {
                    newBearType = INFECTED_BEAR_DAY8_ID; // Day 8+ normal bears
                } else {
                    newBearType = INFECTED_BEAR_ID; // Original normal bears
                }
                bearSize = "normal";
            }
        }
        
        // Use shared conversion logic
        const newBear = convertEntity(deadMob, killer, newBearType, "MOB CONVERSION");
        
        if (newBear) {
            // console.log(`[CONVERSION] Day ${currentDay}: ${mobType} killed by ${killerType} → spawned ${newBearType} (${bearSize})`);
        }
        
    } catch (error) {
        // console.warn(`[MOB CONVERSION] Error converting ${deadMob.typeId} to Maple Bear:`, error);
    }
}

// --- Helper: Get mob size category ---
function getMobSize(mobType) {
    // Tiny mobs (bats, chickens, etc.)
    const tinyMobs = [
        "minecraft:bat", "minecraft:chicken", "minecraft:parrot", "minecraft:rabbit",
        "minecraft:silverfish", "minecraft:endermite", "minecraft:bee", "minecraft:cod",
        "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish", "minecraft:tadpole", 
        "minecraft:axolotl", "minecraft:armadillo", "minecraft:fox"
    ];
    
    // Large/boss mobs that should spawn Buff Maple Bears (day 13+)
    const largeMobs = [
        "minecraft:warden", "minecraft:sniffer", "minecraft:ravager", "minecraft:iron_golem", "minecraft:shulker",
        "minecraft:elder_guardian", "minecraft:ender_dragon", "minecraft:wither", "minecraft:ghast"
    ];
    
    // Normal-sized mobs (horses, cows, etc.) - these should spawn normal Maple Bears
    // Note: Pigs are excluded and handled separately by the pig conversion system
    const normalMobs = [
        "minecraft:horse", "minecraft:cow", "minecraft:mooshroom", "minecraft:llama",
        "minecraft:donkey", "minecraft:mule", "minecraft:sheep",
        "minecraft:goat", "minecraft:zombie", "minecraft:skeleton", "minecraft:creeper",
        "minecraft:spider", "minecraft:cave_spider", "minecraft:zombie_villager", "minecraft:husk",
        "minecraft:stray", "minecraft:drowned", "minecraft:witch", "minecraft:pillager",
        "minecraft:vindicator", "minecraft:evoker", "minecraft:vex", "minecraft:zombified_piglin",
        "minecraft:piglin", "minecraft:piglin_brute", "minecraft:hoglin", "minecraft:zoglin",
        "minecraft:blaze", "minecraft:magma_cube", "minecraft:slime", "minecraft:phantom",
        "minecraft:enderman", "minecraft:shulker"
    ];
    
    if (tinyMobs.includes(mobType)) {
        return "tiny";
    } else if (largeMobs.includes(mobType)) {
        return "large";
    } else if (mobType === "minecraft:pig") {
        return "pig"; // Special category for pigs - handled separately
    } else if (normalMobs.includes(mobType)) {
        return "normal";
    } else {
        return "normal"; // Default size for most mobs
    }
}

// Note: Spawn rate calculation removed - now handled via spawn rules and multiple entity files

// Random effect application is now handled inline in the infection system

// Random potion effects are now handled inline in the infection system

// Scaled snow effects are now handled inline in the infection system

// === Maple Bear Spawning ===
// Note: Custom spawning logic removed - using spawn rules and multiple entity files instead
// Different entity files will be created for different day ranges (e.g., day 4+ tiny bears, day 8+ normal bears)

/**
 * Get the maximum stack size for an item type
 * @param {string} itemType - The item type ID
 * @returns {number} The maximum stack size
 */
function getMaxStackSize(itemType) {
    // Items that stack to 16
    const stack16Items = [
        'minecraft:ender_pearl',
        'minecraft:snowball',
        'minecraft:egg',
        'minecraft:sign',
        'minecraft:bed',
        'minecraft:boat',
        'minecraft:minecart',
        'minecraft:chest_minecart',
        'minecraft:furnace_minecart',
        'minecraft:tnt_minecart',
        'minecraft:hopper_minecart',
        'minecraft:spawner_minecart',
        'minecraft:command_block_minecart',
        'minecraft:jukebox',
        'minecraft:note_block',
        'minecraft:jukebox',
        'minecraft:flower_pot',
        'minecraft:skull',
        'minecraft:banner',
        'minecraft:armor_stand',
        'minecraft:item_frame',
        'minecraft:painting',
        'minecraft:lead',
        'minecraft:name_tag',
        'minecraft:experience_bottle',
        'minecraft:firework_rocket',
        'minecraft:firework_star',
        'minecraft:written_book',
        'minecraft:book_and_quill',
        'minecraft:map',
        'minecraft:filled_map',
        'minecraft:clock',
        'minecraft:compass',
        'minecraft:recovery_compass',
        'minecraft:lodestone_compass',
        'minecraft:spyglass',
        'minecraft:goat_horn',
        'minecraft:music_disc',
        'minecraft:disc_fragment_5',
        'minecraft:nether_star',
        'minecraft:conduit',
        'minecraft:heart_of_the_sea',
        'minecraft:nautilus_shell',
        'minecraft:scute',
        'minecraft:turtle_helmet',
        'minecraft:trident',
        'minecraft:crossbow',
        'minecraft:shield',
        'minecraft:totem_of_undying',
        'minecraft:elytra',
        'minecraft:horse_armor',
        'minecraft:saddle',
        'minecraft:carrot_on_a_stick',
        'minecraft:warped_fungus_on_a_stick',
        'minecraft:brush',
        'minecraft:goat_horn',
        'minecraft:music_disc',
        'minecraft:disc_fragment_5',
        'minecraft:nether_star',
        'minecraft:conduit',
        'minecraft:heart_of_the_sea',
        'minecraft:nautilus_shell',
        'minecraft:scute',
        'minecraft:turtle_helmet',
        'minecraft:trident',
        'minecraft:crossbow',
        'minecraft:shield',
        'minecraft:totem_of_undying',
        'minecraft:elytra',
        'minecraft:horse_armor',
        'minecraft:saddle',
        'minecraft:carrot_on_a_stick',
        'minecraft:warped_fungus_on_a_stick',
        'minecraft:brush'
    ];
    
    // Items that stack to 1 (non-stackable)
    const stack1Items = [
        'minecraft:sword',
        'minecraft:pickaxe', 
        'minecraft:axe',
        'minecraft:shovel',
        'minecraft:hoe',
        'minecraft:bow',
        'minecraft:helmet',
        'minecraft:chestplate',
        'minecraft:leggings',
        'minecraft:boots',
        'minecraft:shears',
        'minecraft:flint_and_steel',
        'minecraft:compass',
        'minecraft:clock',
        'minecraft:map',
        'minecraft:filled_map',
        'minecraft:book',
        'minecraft:written_book',
        'minecraft:book_and_quill',
        'minecraft:enchanted_book',
        'minecraft:name_tag',
        'minecraft:lead',
        'minecraft:item_frame',
        'minecraft:painting',
        'minecraft:sign',
        'minecraft:bed',
        'minecraft:boat',
        'minecraft:minecart',
        'minecraft:chest_minecart',
        'minecraft:furnace_minecart',
        'minecraft:tnt_minecart',
        'minecraft:hopper_minecart',
        'minecraft:spawner_minecart',
        'minecraft:command_block_minecart',
        'minecraft:jukebox',
        'minecraft:note_block',
        'minecraft:flower_pot',
        'minecraft:skull',
        'minecraft:banner',
        'minecraft:armor_stand',
        'minecraft:experience_bottle',
        'minecraft:firework_rocket',
        'minecraft:firework_star',
        'minecraft:nether_star',
        'minecraft:conduit',
        'minecraft:heart_of_the_sea',
        'minecraft:nautilus_shell',
        'minecraft:scute',
        'minecraft:turtle_helmet',
        'minecraft:totem_of_undying',
        'minecraft:horse_armor',
        'minecraft:saddle',
        'minecraft:carrot_on_a_stick',
        'minecraft:warped_fungus_on_a_stick',
        'minecraft:brush',
        'minecraft:goat_horn',
        'minecraft:music_disc',
        'minecraft:disc_fragment_5'
    ];
    
    // Check for special stack sizes
    if (stack16Items.some(item => itemType.includes(item))) {
        return 16;
    } else if (stack1Items.some(item => itemType.includes(item))) {
        return 1;
    } else {
        // Default to 64 for most items
        return 64;
    }
}

/**
 * Scan armor slots by range to find equipped armor
 * @param {Player} player - The player to scan
 * @param {Object} armorTypes - Map of armor type IDs to slot indices
 * @param {Array} ranges - Array of [start, end] slot ranges to check
 * @returns {Array} Array of found armor items
 */
function scanArmorSlotsByRange(player, armorTypes, ranges) {
    const foundArmor = [];
    const inventory = player.getComponent("inventory")?.container;
    if (!inventory) return foundArmor;

    for (const [start, end] of ranges) {
        for (let i = start; i <= end; i++) {
            try {
                const item = inventory.getItem(i);
                if (item && armorTypes.hasOwnProperty(item.typeId)) {
                    foundArmor.push({
                        slot: armorTypes[item.typeId],
                        typeId: item.typeId,
                        amount: item.amount,
                        data: item.data || 0
                    });
                }
            } catch (error) {
                // Slot doesn't exist, continue to next
                continue;
            }
        }
    }

    return foundArmor;
}

/**
 * Scan inventory for armor items as fallback
 * @param {Player} player - The player to scan
 * @param {Object} armorTypes - Map of armor type IDs to slot indices
 * @returns {Array} Array of found armor items
 */
function scanInventoryForArmor(player, armorTypes) {
    const foundArmor = [];
    const inventory = player.getComponent("inventory")?.container;
    if (!inventory) return foundArmor;

    for (let i = 0; i < 36; i++) { // Check all inventory slots
        try {
            const item = inventory.getItem(i);
            if (item && armorTypes.hasOwnProperty(item.typeId)) {
                const slotIndex = armorTypes[item.typeId];
                foundArmor.push({
                    slot: slotIndex,
                    typeId: item.typeId,
                    amount: item.amount,
                    data: item.data || 0
                });
            }
        } catch (error) {
            continue;
        }
    }

    return foundArmor;
}

/**
 * Scan for offhand items using multiple methods
 * @param {Player} player - The player to scan
 * @param {Array} offhandTypes - Array of offhand item type IDs
 * @param {Array} offhandSlots - Array of slot indices to check
 * @returns {Object|null} Offhand item data or null if not found
 */
function scanForOffhandItem(player, offhandTypes, offhandSlots) {
    const inventory = player.getComponent("inventory")?.container;
    if (!inventory) return null;

    // Method 1: Try equipment component
    try {
        const equipmentComponent = player.getComponent("equipment");
        if (equipmentComponent) {
            const offhandSlot = equipmentComponent.getEquipmentSlot("offhand");
            if (offhandSlot) {
                const offhand = offhandSlot.getItem();
                if (offhand) {
                    return {
                        typeId: offhand.typeId,
                        amount: offhand.amount,
                        data: offhand.data || 0
                    };
                }
            }
        }
    } catch (error) {
        // Equipment component not available - silently continue
    }

    // Method 2: Try specific offhand slots
    for (const slotNum of offhandSlots) {
        try {
            const item = inventory.getItem(slotNum);
            if (item && offhandTypes.includes(item.typeId)) {
                return {
                    typeId: item.typeId,
                    amount: item.amount,
                    data: item.data || 0
                };
            }
        } catch (error) {
            // Slot doesn't exist, continue to next
            continue;
        }
    }

    // Method 3: Scan main inventory for offhand items
    for (let i = 0; i < 36; i++) {
        try {
            const item = inventory.getItem(i);
            if (item && offhandTypes.includes(item.typeId)) {
                return {
                    typeId: item.typeId,
                    amount: item.amount,
                    data: item.data || 0
                };
            }
        } catch (error) {
            continue;
        }
    }

    return null;
}

// Instead, set up event listeners immediately (safe in 1.21+)
console.log("World initialized, setting up event listeners...");

// Infection logic: infect player, notify, and spawn bear on death (no inventory logic)

// Handle potion detection
function handlePotion(player, item) {
    try {
        const potionData = item.data || 0;
        console.log(`[POTION] Player ${player.name} drank a potion with data: ${potionData}`);

        // Mark potions tab as discovered (only first time)
        try { 
            const codex = getCodex(player);
            if (!codex.items.potionsSeen) {
                markCodex(player, "items.potionsSeen"); 
                sendDiscoveryMessage(player, codex, "interesting", "potion");
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
            }
        } catch { }

        // Weakness potion data values for Bedrock 1.21:
        // 34 = Weakness (1:30), 35 = Weakness Extended (4:00)
        if (potionData === POTION_DATA.WEAKNESS_NORMAL || potionData === POTION_DATA.WEAKNESS_EXTENDED) {
            console.log(`[POTION] Player ${player.name} drank a weakness potion (data: ${potionData})`);
            // Mark weakness potion specifically (only first time)
            try { 
                const codex = getCodex(player);
                if (!codex.items.weaknessPotionSeen) {
                    markCodex(player, "items.weaknessPotionSeen"); 
                    sendDiscoveryMessage(player, codex, "important", "weakness");
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
                    player.playSound("random.orb", { pitch: 1.5, volume: 0.8 * volumeMultiplier });
                }
            } catch { }
            player.sendMessage("§7You feel weak... This might help with curing infections.");
        } else {
            // Log all potion data to help identify weakness potions
            console.log(`[POTION] Unknown potion data: ${potionData} - please check if this is a weakness potion`);
        }
    } catch (error) {
        console.warn(`[POTION] Error handling potion for ${player.name}:`, error);
    }
}

// Handle enchanted golden apple consumption for cure system
function handleEnchantedGoldenApple(player, item) {
    console.log(`[APPLE] Player ${player.name} consumed a golden apple`);

    // Mark enchanted golden apple as discovered (only first time)
    try { 
        const codex = getCodex(player);
        if (!codex.items.enchantedGoldenAppleSeen) {
            markCodex(player, "items.enchantedGoldenAppleSeen"); 
            sendDiscoveryMessage(player, codex, "important", "enchanted_apple");
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
            player.playSound("random.orb", { pitch: 1.5, volume: 0.8 * volumeMultiplier });
        }
    } catch { }

    // Check if player has infection
    const infectionState = playerInfection.get(player.id);
    const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;

    if (hasInfection) {
        console.log(`[CURE] Player ${player.name} attempting to cure infection`);

        // Check for weakness effect using our reliable detection system
        const hasWeakness = hasWeaknessEffect(player);
        console.log(`[CURE] Player has weakness effect: ${hasWeakness}`);

        if (hasWeakness) {
            // Cure infection
            system.run(() => {
                playerInfection.set(player.id, { ticksLeft: 0, cured: true, snowCount: 0, hitCount: 0 });
                console.log(`[CURE] Cured infection for ${player.name}`);
                player.removeTag(INFECTED_TAG);
                player.sendMessage("§7You have cured your infection.");
                
                // Track cure history and attempt
                trackInfectionHistory(player, "cured");
                trackCureAttempt(player);
                
                // Check if this is first-time cure for special effects
                const codex = getCodex(player);
                const isFirstCure = !codex.items.cureItemsSeen;
                
                // Mark cure items as discovered
                try { markCodex(player, "items.cureItemsSeen"); } catch { }
                
                const volumeMultiplier = getPlayerSoundVolume(player);
                if (isFirstCure) {
                    // Happy and relieved first-time cure sounds
                    player.playSound("mob.villager.idle", { pitch: 1.8, volume: 0.85 * volumeMultiplier });
                    player.playSound("random.orb", { pitch: 1.8, volume: 0.85 * volumeMultiplier });
                    player.playSound("mob.villager.celebrate", { pitch: 1.5, volume: 0.75 * volumeMultiplier });
                    player.playSound("random.levelup", { pitch: 1.2, volume: 0.75 * volumeMultiplier });
                    player.playSound("mob.villager.yes", { pitch: 1.3, volume: 0.6 * volumeMultiplier });
                } else {
                    // Regular cure sounds - still happy but less dramatic
                    player.playSound("random.orb", { pitch: 1.4, volume: 0.8 * volumeMultiplier });
                    player.playSound("mob.villager.idle", { pitch: 1.5, volume: 0.6 * volumeMultiplier });
                    player.playSound("mob.villager.yes", { pitch: 1.2, volume: 0.4 * volumeMultiplier });
                }

                // Grant immunity for 5 minutes
                const immunityEndTime = Date.now() + CURE_IMMUNITY_DURATION;
                curedPlayers.set(player.id, immunityEndTime);
                console.log(`[CURE] Granted ${player.name} immunity until ${new Date(immunityEndTime).toLocaleTimeString()}`);

                // IMMEDIATELY save the cure data to dynamic properties
                saveInfectionData(player);
                console.log(`[CURE] Immediately saved cure data for ${player.name}`);

                // Note: We do NOT remove the weakness effect - let it run its course naturally
                player.sendMessage("§eYou are now immune... maybe?");
                try { markCodex(player, "cures.bearCureKnown"); markCodex(player, "cures.bearCureDoneAt", true); } catch { }
            });
        } else {
            // No message for now - hint system will be added later
        }
    } else {
        // Player is not infected
        system.run(() => {
            player.sendMessage("§aYou are not currently infected.");
        });
    }
}

// Track cure attempts for progression
function trackCureAttempt(player) {
    if (!player) return;
    const codex = getCodex(player);
    codex.items.cureAttempted = true;
    saveCodex(player, codex);
}

// Handle snow consumption
function handleSnowConsumption(player, item) {
    const infectionState = playerInfection.get(player.id);
    const isImmune = isPlayerImmune(player);
    
    // ALWAYS mark snow as discovered and identified when consumed
    try { 
        markCodex(player, "items.snowFound"); 
        markCodex(player, "items.snowIdentified");

        // Record snow consumption in daily log for today (the day it happened)
        const today = getCurrentDay();
        const eventMessage = "You consumed the mysterious white powder. Its effects on your body are becoming clearer.";
        recordDailyEvent(player, today, eventMessage, "items");
    } catch { }
    
    // Handle snow consumption while immune
    if (isImmune && (!infectionState || infectionState.cured)) {
        // Mark that player now knows they have immunity
        try { 
            const codex = getCodex(player);
            if (!codex.status.immuneKnown) {
                markCodex(player, "status.immuneKnown");
                player.sendMessage("§7You realize you are immune to infection.");
            }
        } catch { }
        
        // Reduce immunity time by 1 minute (60000 milliseconds)
        const currentImmunityEnd = curedPlayers.get(player.id);
        if (currentImmunityEnd) {
            const newImmunityEnd = Math.max(Date.now(), currentImmunityEnd - 60000);
            curedPlayers.set(player.id, newImmunityEnd);
            
            if (newImmunityEnd <= Date.now()) {
                // Immunity ended, remove it
                curedPlayers.delete(player.id);
                player.removeTag("mb_immune_hit_message");
                player.sendMessage("§8Your immunity has been broken by the snow. This was your last warning.");
                try { markCodex(player, "items.snowBreaksImmunity"); } catch { }
            } else {
                const remainingMs = newImmunityEnd - Date.now();
                const remainingMinutes = Math.ceil(remainingMs / 60000);
                player.sendMessage(`§7The snow weakens your immunity. ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} remaining.`);
            }
        }
        return; // Don't proceed with normal snow consumption
    }
    
    if (!infectionState || infectionState.cured) {
        // Clear any existing immunity when infected
        curedPlayers.delete(player.id);
        player.removeTag("mb_immune_hit_message");
        
        // Not infected - start infection
        playerInfection.set(player.id, { 
            ticksLeft: INFECTION_TICKS, 
            cured: false, 
            hitCount: 0, 
            snowCount: 1,
            source: "snow",
            maxSeverity: 0,
            lastTierMessage: 0,
            lastActiveTick: system.currentTick
        });
        applyEffect(player, "minecraft:blindness", 200, { amplifier: 0 });
        applyEffect(player, "minecraft:nausea", 200, { amplifier: 0 });
        applyEffect(player, "minecraft:mining_fatigue", 200, { amplifier: 0 });
        player.addTag(INFECTED_TAG);
        player.sendMessage("§8You have been infected. Find a cure.");
        
        // Scary infection sounds
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("mob.wither.spawn", { pitch: 0.6, volume: 0.8 * volumeMultiplier });
        player.playSound("mob.enderman.portal", { pitch: 0.8, volume: 0.6 * volumeMultiplier });
        player.playSound("mob.enderman.teleport", { pitch: 1.0, volume: 0.4 * volumeMultiplier });
        player.playSound("mob.zombie.ambient", { pitch: 0.8, volume: 0.6 * volumeMultiplier });
        
        console.log(`[SNOW] ${player.name} started infection by eating snow`);
        
        // Track infection experience
        trackInfectionExperience(player, "snow", 0);
        
        // Mark snow infection as discovered
        try { markCodex(player, "infections.snow.discovered"); markCodex(player, "infections.snow.firstUseAt", true); } catch { }
        
        // Unlock snow tier analysis when first infected by snow
        try { markCodex(player, "symptomsUnlocks.snowTierAnalysisUnlocked"); } catch { }
        
        // Track infection history
        trackInfectionHistory(player, "infected");
    } else {
        // Player is infected - apply progressive snow mechanics based on tier
        const snowCount = (infectionState.snowCount || 0) + 1;
        infectionState.snowCount = snowCount;
        
        // Calculate time effect based on snow tier
        const timeEffect = getSnowTimeEffect(snowCount);
        let message = "";
        
        if (snowCount <= 5) {
            message = "§eThe substance seems to slow down the infection...";
        } else if (snowCount <= 10) {
            message = "§eThe substance seems to have no noticeable effect anymore...";
        } else if (snowCount <= 20) {
            message = "§cThe substance seems to... be accelerating the infection!?";
        } else if (snowCount <= 50) {
            message = "§4The substance seems to heavily affect you and continues to accelerate the infection...";
        } else if (snowCount <= 100) {
            message = "§4The substance seems to have nearly taken over you completely...";
        } else {
            message = "§0How are you even here? The 'snow' seems to consume all...";
        }
        
        // Apply time effect
        infectionState.ticksLeft = Math.max(0, Math.min(INFECTION_TICKS, infectionState.ticksLeft + timeEffect));
        
        updateMaxSnowLevel(player, snowCount);
        
        // Show message only for first time reaching each tier
        const currentTier = snowCount <= 5 ? 1 : snowCount <= 10 ? 2 : snowCount <= 20 ? 3 : snowCount <= 50 ? 4 : snowCount <= 100 ? 5 : 6;
        if (currentTier > (infectionState.lastTierMessage || 0)) {
            player.sendMessage(message);
            infectionState.lastTierMessage = currentTier;
            
            // Play appropriate sound based on tier message tone
            const volumeMultiplier = getPlayerSoundVolume(player);
            if (snowCount <= 5) {
                // Tier 1: Positive sound
                player.playSound("random.levelup", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
            } else if (snowCount <= 10) {
                // Tier 2: Neutral sound
                player.playSound("mob.villager.idle", { pitch: 1.0, volume: 0.5 * volumeMultiplier });
            } else if (snowCount <= 20) {
                // Tier 3: Warning sound
                player.playSound("mob.enderman.portal", { pitch: 0.8, volume: 0.6 * volumeMultiplier });
            } else if (snowCount <= 50) {
                // Tier 4: Dangerous sound
                player.playSound("mob.wither.ambient", { pitch: 0.7, volume: 0.7 * volumeMultiplier });
            } else if (snowCount <= 100) {
                // Tier 5: Extreme sound
                player.playSound("mob.wither.spawn", { pitch: 0.6, volume: 0.8 * volumeMultiplier });
            } else {
                // Tier 6: Devastating sound
                player.playSound("mob.wither.death", { pitch: 0.5, volume: 0.9 * volumeMultiplier });
            }
        }
        
        // Apply random effects based on snow tier for infected players
        applySnowTierEffects(player, snowCount);
        
        console.log(`[SNOW] ${player.name} consumed snow (count: ${snowCount}, time effect: ${timeEffect}, new ticks: ${infectionState.ticksLeft})`);
    }
}

// Main item consumption handler
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;

    // Handle potion detection
    if (item?.typeId === "minecraft:potion") {
        handlePotion(player, item);
    }
    
    // Handle enchanted golden apple consumption for cure system
    if (item?.typeId === "minecraft:enchanted_golden_apple") {
        handleEnchantedGoldenApple(player, item);
    }
    
    // Handle normal golden apple consumption for hint system and infection reduction
    if (item?.typeId === "minecraft:golden_apple") {
        // Mark normal golden apple as discovered (only first time)
        try { 
            const codex = getCodex(player);
            if (!codex.items.goldenAppleSeen) {
                markCodex(player, "items.goldenAppleSeen"); 
                sendDiscoveryMessage(player, codex, "interesting", "golden_apple");
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
            }
        } catch { }
        
        // Reduce infection snow count if player is infected
        const infectionState = playerInfection.get(player.id);
        if (infectionState && !infectionState.cured && infectionState.ticksLeft > 0) {
            const reductionAmount = 0.5; // Reduce snow count by 0.5
            const currentSnowCount = infectionState.snowCount || 0;
            const newSnowCount = Math.max(0, currentSnowCount - reductionAmount);
            infectionState.snowCount = newSnowCount;
            
            // Update max snow level if needed
            updateMaxSnowLevel(player, newSnowCount);
            
            // Show one-time narrative message and unlock codex info
            try {
                const codex = getCodex(player);
                if (!codex.items.goldenAppleInfectionReductionDiscovered) {
                    codex.items.goldenAppleInfectionReductionDiscovered = true;
                    markCodex(player, "items.goldenAppleInfectionReductionDiscovered");
                    
                    // Use the standard discovery message pattern
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    if (codex.items.snowBookCrafted) {
                        player.sendMessage("§7Check your journal.");
                        player.playSound("random.orb", { pitch: 1.8, volume: 0.6 * volumeMultiplier });
                    } else {
                        player.sendMessage("§7You feel slightly better for a moment after eating the golden apple... This seems important to remember.");
                        player.playSound("random.orb", { pitch: 1.8, volume: 0.6 * volumeMultiplier });
                    }
                    
                    saveCodex(player, codex);
                }
            } catch (error) {
                console.warn(`[GOLDEN APPLE] Error recording discovery:`, error);
            }
            
            console.log(`[GOLDEN APPLE] ${player.name} reduced infection: ${currentSnowCount.toFixed(1)} → ${newSnowCount.toFixed(1)}`);
        }
    }
    
    // Handle snow consumption
    if (item?.typeId === SNOW_ITEM_ID) {
        handleSnowConsumption(player, item);
    }
});

// Handle player death - clear infection data
function handlePlayerDeath(player) {
    // Clear all infection data on death - you're a new person when you respawn
    playerInfection.delete(player.id);
    curedPlayers.delete(player.id);
    bearHitCount.delete(player.id);
    infectionExperience.delete(player.id);
    // Note: Keep maxSnowLevels persistent across deaths - it's a lifetime achievement
    player.removeTag(INFECTED_TAG);

    // Clear dynamic properties on death
    try {
        player.setDynamicProperty("mb_bear_infection", undefined);
        player.setDynamicProperty("mb_snow_infection", undefined);
        player.setDynamicProperty("mb_immunity_end", undefined);
        player.setDynamicProperty("mb_bear_hit_count", undefined);
        // Keep first-time tutorial flags so players don't see them again after death
        // Keep codex knowledge - that persists across deaths
        // Keep max snow level - it's a lifetime achievement
        console.log(`[DEATH] Cleared all infection data for ${player.name} - they are a new person now`);
    } catch (error) {
        console.warn(`[DEATH] Error clearing dynamic properties for ${player.name}:`, error);
    }
}

// Handle mob conversion when killed by Maple Bears
function handleMobConversion(entity, killer) {
    // Validate entities are still valid before processing
    if (!entity || !entity.isValid || !killer || !killer.isValid) {
        // console.log(`[CONVERSION] Skipping conversion - entity or killer is invalid`);
        return;
    }
    
    const killerType = killer.typeId;
    const entityType = entity.typeId;
    
    // Don't convert items, XP orbs, or other non-mob entities
    if (entityType === "minecraft:item" || entityType === "minecraft:xp_orb" || entityType === "minecraft:arrow" || 
        entityType === "minecraft:fireball" || entityType === "minecraft:small_fireball" || entityType === "minecraft:firework_rocket") {
        // console.log(`[CONVERSION] Skipping conversion - ${entityType} is not a valid mob for conversion`);
        return;
    }
    
    // Progressive conversion rate based on current day
    const currentDay = getCurrentDay();
    const conversionRate = getInfectionRate(currentDay);
    
    // Check if killer is a Maple Bear (including all variants: tiny, infected, buff, flying, mining, torpedo)
    const mapleBearKillerTypes = [
        MAPLE_BEAR_ID, MAPLE_BEAR_DAY4_ID, MAPLE_BEAR_DAY8_ID, MAPLE_BEAR_DAY13_ID, MAPLE_BEAR_DAY20_ID,
        INFECTED_BEAR_ID, INFECTED_BEAR_DAY8_ID, INFECTED_BEAR_DAY13_ID, INFECTED_BEAR_DAY20_ID,
        BUFF_BEAR_ID, BUFF_BEAR_DAY13_ID, BUFF_BEAR_DAY20_ID,
        FLYING_BEAR_ID, FLYING_BEAR_DAY15_ID, FLYING_BEAR_DAY20_ID,
        MINING_BEAR_ID, MINING_BEAR_DAY20_ID,
        TORPEDO_BEAR_ID, TORPEDO_BEAR_DAY20_ID,
        INFECTED_PIG_ID, INFECTED_COW_ID
    ];
    
    if (mapleBearKillerTypes.includes(killerType)) {
        
        // PREVENT BEAR-TO-BEAR CONVERSION: Don't convert Maple Bears or infected creatures
        const allMapleBearTypes = [
            MAPLE_BEAR_ID, MAPLE_BEAR_DAY4_ID, MAPLE_BEAR_DAY8_ID, MAPLE_BEAR_DAY13_ID, MAPLE_BEAR_DAY20_ID,
            INFECTED_BEAR_ID, INFECTED_BEAR_DAY8_ID, INFECTED_BEAR_DAY13_ID, INFECTED_BEAR_DAY20_ID,
            BUFF_BEAR_ID, BUFF_BEAR_DAY13_ID, BUFF_BEAR_DAY20_ID,
            FLYING_BEAR_ID, FLYING_BEAR_DAY15_ID, FLYING_BEAR_DAY20_ID,
            MINING_BEAR_ID, MINING_BEAR_DAY20_ID,
            TORPEDO_BEAR_ID, TORPEDO_BEAR_DAY20_ID
        ];
        const isVictimABear = allMapleBearTypes.includes(entityType);
        const isVictimInfected = entityType === INFECTED_PIG_ID || entityType === INFECTED_COW_ID;
        
        if (isVictimABear || isVictimInfected) {
            // console.log(`[CONVERSION] Skipping conversion - ${killerType} killed ${entityType} (bear-to-bear/infected conversion prevented)`);
            return;
        }
        
        // Check nearby bear count - stop converting if 40+ Maple Bears within range
        try {
            const nearbyEntities = entity.dimension.getEntities({
                location: entity.location,
                maxDistance: 64,
                families: ["maple_bear", "infected"]
            });
            let totalBearCount = 0;
            let buffBearCount = 0;
            const mbTypePrefixes = ["mb:mb", "mb:infected", "mb:buff_mb", "mb:flying_mb", "mb:mining_mb", "mb:torpedo_mb"];
            
            for (const nearby of nearbyEntities) {
                const typeId = nearby.typeId;
                if (mbTypePrefixes.some(prefix => typeId.startsWith(prefix))) {
                    totalBearCount++;
                    if (typeId === BUFF_BEAR_ID || typeId === BUFF_BEAR_DAY13_ID || typeId === BUFF_BEAR_DAY20_ID) {
                        buffBearCount++;
                    }
                }
            }
            
            // Stop conversion if too many bears (40 max) or too many buff bears (5 max)
            if (totalBearCount >= 40) {
                return; // Too many bears nearby - stop converting
            }
            if (buffBearCount >= 5) {
                // Too many buff bears - only allow non-buff conversions
                const willBeBuff = (entityType.includes('warden') || entityType.includes('ravager') || 
                                  entityType.includes('iron_golem') || entityType.includes('wither') ||
                                  entityType.includes('ender_dragon') || entityType.includes('giant'));
                if (willBeBuff) {
                    return; // Would create buff bear - skip
                }
            }
        } catch (error) {
            // Error checking nearby entities - allow conversion to proceed
        }
        
        // Check if victim is a pig and convert to infected pig
        if (entityType === "minecraft:pig") {
            // console.log(`[PIG CONVERSION] Maple Bear killing pig on day ${currentDay} (${Math.round(conversionRate * 100)}% conversion rate)`);
            if (Math.random() < conversionRate) {
                system.run(() => {
                    convertPigToInfectedPig(entity, killer);
                });
            }
            return; // IMPORTANT: Return early to prevent any other conversion logic from running
        } else if (entityType === "minecraft:cow") {
            // console.log(`[COW CONVERSION] Maple Bear killing cow on day ${currentDay} (${Math.round(conversionRate * 100)}% conversion rate)`);
            if (Math.random() < conversionRate) {
                system.run(() => {
                    convertCowToInfectedCow(entity, killer);
                });
            }
            return; // IMPORTANT: Return early to prevent any other conversion logic from running
        } else {
            // Normal Maple Bear conversion for other mobs (pigs and cows handled above)
            if (Math.random() < conversionRate) {
                system.run(() => {
                    convertMobToMapleBear(entity, killer);
                });
            }
        }
    } else {
        // console.log(`[CONVERSION] Non-Maple Bear killing ${entityType} on day ${currentDay} - no conversion (only Maple Bears can convert mobs)`);
    }
        // Unlock mob sightings for nearby players
        for (const p of world.getAllPlayers()) {
            if (!p || !p.dimension || p.dimension.id !== killer.dimension.id) continue;
            const dx = p.location.x - killer.location.x;
            const dy = p.location.y - killer.location.y;
            const dz = p.location.z - killer.location.z;
            if (dx * dx + dy * dy + dz * dz <= 64 * 64) {
                // Mob discovery is now handled through proper kill tracking system
                // No direct unlocks - must reach kill requirements
                
                // Note: Infected pig discovery is now handled in convertPigToInfectedPig function
            }
        }
}

// Handle Maple Bear kill tracking
function handleMapleBearKillTracking(entity, killer) {
    if (killer instanceof Player && !(entity instanceof Player)) {
        const entityType = entity.typeId;
        if (entityType === MAPLE_BEAR_ID || entityType === MAPLE_BEAR_DAY4_ID || entityType === MAPLE_BEAR_DAY8_ID || entityType === MAPLE_BEAR_DAY13_ID || entityType === MAPLE_BEAR_DAY20_ID ||
            entityType === INFECTED_BEAR_ID || entityType === INFECTED_BEAR_DAY8_ID || entityType === INFECTED_BEAR_DAY13_ID || entityType === INFECTED_BEAR_DAY20_ID ||
            entityType === BUFF_BEAR_ID || entityType === BUFF_BEAR_DAY13_ID || entityType === BUFF_BEAR_DAY20_ID ||
            entityType === INFECTED_PIG_ID || entityType === INFECTED_COW_ID ||
            entityType === FLYING_BEAR_ID || entityType === FLYING_BEAR_DAY15_ID || entityType === FLYING_BEAR_DAY20_ID ||
            entityType === MINING_BEAR_ID || entityType === MINING_BEAR_DAY20_ID ||
            entityType === TORPEDO_BEAR_ID || entityType === TORPEDO_BEAR_DAY20_ID) {
            trackBearKill(killer, entityType);
        }
    }
}

// Global tracking for dusted_dirt blocks to prevent lag
const DUSTED_DIRT_MAX_BLOCKS = 2000; // Maximum total dusted_dirt blocks in world
const DUSTED_DIRT_CLEANUP_INTERVAL = 12000; // Cleanup every 10 minutes (12000 ticks)
const DUSTED_DIRT_MAX_AGE = 24000; // Remove blocks older than 20 minutes
let lastDustedDirtCleanup = 0;
const trackedDustedDirtBlocks = new Map(); // key: "x,y,z,dim" -> { tick, dimension }

// Run cleanup periodically
system.runInterval(() => {
    cleanupOldDustedDirt();
}, 600); // Check every 30 seconds

// Cleanup old dusted_dirt blocks to prevent lag
function cleanupOldDustedDirt() {
    const currentTick = system.currentTick;
    if (currentTick - lastDustedDirtCleanup < DUSTED_DIRT_CLEANUP_INTERVAL) return;
    lastDustedDirtCleanup = currentTick;
    
    // Count total blocks
    let totalBlocks = trackedDustedDirtBlocks.size;
    
    // If we're over the limit, remove oldest blocks from tracking (don't convert back to dirt)
    if (totalBlocks > DUSTED_DIRT_MAX_BLOCKS) {
        // Sort entries by age to find oldest blocks to remove
        const entries = Array.from(trackedDustedDirtBlocks.entries());
        const toRemove = totalBlocks - DUSTED_DIRT_MAX_BLOCKS;
        
        // Sort all entries by tick (age) - oldest first
        // For very large arrays, could use partial selection algorithms, but full sort is simpler
        entries.sort((a, b) => a[1].tick - b[1].tick);
        
        for (let i = 0; i < toRemove && i < entries.length; i++) {
            const [key, value] = entries[i];
            // Just remove from tracking, don't convert blocks back
            const parts = key.split(',');
            unregisterDustedDirtBlock(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]));
            trackedDustedDirtBlocks.delete(key);
        }
    }
    
    // Also remove blocks older than max age from tracking (don't convert back to dirt)
    const toRemoveOld = [];
    for (const [key, value] of trackedDustedDirtBlocks.entries()) {
        if (currentTick - value.tick > DUSTED_DIRT_MAX_AGE) {
            toRemoveOld.push(key);
        }
    }
    
    for (const key of toRemoveOld) {
        // Just remove from tracking, don't convert blocks back
        const parts = key.split(',');
        unregisterDustedDirtBlock(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]));
        trackedDustedDirtBlocks.delete(key);
    }
}

// Spread dusted dirt like sculk when Maple Bears kill things
function spreadDustedDirt(location, dimension, killerType, victimType) {
    try {
        // Check if we're at the limit before spreading
        cleanupOldDustedDirt();
        if (trackedDustedDirtBlocks.size >= DUSTED_DIRT_MAX_BLOCKS) {
            return; // Don't spread more if at limit
        }
        
        const x = Math.floor(location.x);
        const y = Math.floor(location.y);
        const z = Math.floor(location.z);

        // Determine victim size multiplier (toned down)
        let victimSizeMultiplier = 1.0;
        if (victimType) {
            // Large mobs (bosses, large animals)
            if (victimType.includes('wither') || victimType.includes('ender_dragon') || victimType.includes('ravager') ||
                victimType.includes('iron_golem') || victimType.includes('warden') || victimType.includes('giant')) {
                victimSizeMultiplier = 1.4;
            }
            // Medium-large mobs
            else if (victimType.includes('cow') || victimType.includes('horse') || victimType.includes('llama') ||
                victimType.includes('pig') || victimType.includes('sheep') || victimType.includes('mooshroom') ||
                victimType.includes('polar_bear') || victimType.includes('panda') || victimType.includes('strider')) {
                victimSizeMultiplier = 1.2;
            }
            // Medium mobs
            else if (victimType.includes('zombie') || victimType.includes('skeleton') || victimType.includes('creeper') ||
                victimType.includes('spider') || victimType.includes('enderman') || victimType.includes('villager') ||
                victimType.includes('witch') || victimType.includes('pillager') || victimType.includes('vindicator')) {
                victimSizeMultiplier = 1.1;
            }
            // Small mobs
            else if (victimType.includes('chicken') || victimType.includes('rabbit') || victimType.includes('bat') ||
                victimType.includes('silverfish') || victimType.includes('endermite') || victimType.includes('bee')) {
                victimSizeMultiplier = 0.8;
            }
            // Tiny mobs
            else if (victimType.includes('cod') || victimType.includes('salmon') || victimType.includes('tropical_fish') ||
                victimType.includes('pufferfish') || victimType.includes('squid') || victimType.includes('glow_squid')) {
                victimSizeMultiplier = 0.6;
            }
        }

        // Determine killer size multiplier (toned down)
        let killerSizeMultiplier = 1.0;
        // Buff Bears are largest
        if (killerType === BUFF_BEAR_ID || killerType === BUFF_BEAR_DAY13_ID || killerType === BUFF_BEAR_DAY20_ID) {
            killerSizeMultiplier = 1.3;
        }
        // Normal Maple Bears are medium-large
        else if (killerType === MAPLE_BEAR_ID || killerType === MAPLE_BEAR_DAY8_ID || killerType === MAPLE_BEAR_DAY13_ID || killerType === MAPLE_BEAR_DAY20_ID ||
            killerType === INFECTED_BEAR_ID || killerType === INFECTED_BEAR_DAY8_ID || killerType === INFECTED_BEAR_DAY13_ID || killerType === INFECTED_BEAR_DAY20_ID) {
            killerSizeMultiplier = 1.1;
        }
        // Tiny Maple Bears are small
        else if (killerType === MAPLE_BEAR_DAY4_ID) {
            killerSizeMultiplier = 0.9;
        }
        // Infected animals are medium
        else if (killerType === INFECTED_PIG_ID || killerType === INFECTED_COW_ID) {
            killerSizeMultiplier = 1.05;
        }

        // Calculate base spread values (increased)
        let baseRadius = 2; // Increased from 1
        let baseChance = 0.35; // Increased from 0.2
        let baseMaxBlocks = 8; // Increased from 4

        // Determine world infection multiplier based on current day
        let worldInfectionMultiplier = 0.0; // No spreading before day 4
        const currentDay = getCurrentDay();

        if (currentDay >= 4) {
            worldInfectionMultiplier = 0.3; // Day 4: basic spreading starts
        }
        if (currentDay >= 8) {
            worldInfectionMultiplier = 0.6; // Day 8: moderate boost
        }
        if (currentDay >= 13) {
            worldInfectionMultiplier = 1.0; // Day 13: full power
        }
        if (currentDay >= 20) {
            worldInfectionMultiplier = 1.3; // Day 20: enhanced spreading
        }
        if (currentDay >= 25) {
            worldInfectionMultiplier = 1.6; // Day 25: victory threshold, but infection intensifies
        }
        if (currentDay >= 30) {
            worldInfectionMultiplier = 2.0; // Day 30: maximum infection (post-victory scaling)
        }
        if (currentDay >= 40) {
            worldInfectionMultiplier = 2.5; // Day 40: extreme infection
        }

        // Apply all multipliers
        const totalMultiplier = victimSizeMultiplier * killerSizeMultiplier * worldInfectionMultiplier;
        const spreadRadius = Math.max(2, Math.min(8, Math.floor(baseRadius * totalMultiplier))); // Increased max from 6 to 8
        const spreadChance = Math.min(0.85, baseChance * totalMultiplier); // Increased max from 0.7 to 0.85
        const maxBlocks = Math.max(4, Math.min(20, Math.floor(baseMaxBlocks * totalMultiplier))); // Increased max from 25 to 20, min from 2 to 4

        let blocksConverted = 0;

        // Create a circular/spherical spread pattern (like powder falling from air)
        // Generate candidate positions within the radius
        const candidates = [];
        
        for (let dx = -spreadRadius; dx <= spreadRadius; dx++) {
            for (let dz = -spreadRadius; dz <= spreadRadius; dz++) {
                for (let dy = -2; dy <= 2; dy++) { // Allow some vertical spread
                    // Calculate distance from center (circular pattern)
                    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
                    const totalDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    
                    // Skip if outside circular radius
                    if (horizontalDistance > spreadRadius) continue;
                    
                    // Skip center block (where the kill happened)
                    if (dx === 0 && dz === 0 && dy === 0) continue;
                    
                    // Distance-based probability: closer blocks more likely
                    // Use a falloff curve: probability decreases with distance
                    const normalizedDistance = horizontalDistance / spreadRadius; // 0 to 1
                    const distanceMultiplier = 1 - (normalizedDistance * 0.6); // 1.0 at center, 0.4 at edge
                    
                    // Vertical falloff: prefer blocks at or below the kill location
                    const verticalMultiplier = dy <= 0 ? 1.0 : (1 - (dy / 3) * 0.5); // Prefer downward spread
                    
                    // Combined probability
                    const adjustedChance = spreadChance * distanceMultiplier * verticalMultiplier;
                    
                    if (Math.random() < adjustedChance) {
                        candidates.push({
                            x: x + dx,
                            y: y + dy,
                            z: z + dz,
                            distance: totalDistance
                        });
                    }
                }
            }
        }
        
        // Sort by distance (closer first) to create natural spread pattern
        candidates.sort((a, b) => a.distance - b.distance);
        
        // Convert blocks up to maxBlocks limit
        for (const candidate of candidates) {
            if (blocksConverted >= maxBlocks) break;
            
            try {
                const block = dimension.getBlock({ x: candidate.x, y: candidate.y, z: candidate.z });

                // Only convert certain blocks to dusted dirt
                const convertibleBlocks = [
                    'minecraft:grass_block',
                    'minecraft:dirt',
                    'minecraft:coarse_dirt',
                    'minecraft:podzol',
                    'minecraft:mycelium',
                    'minecraft:stone',
                    'minecraft:cobblestone',
                    'minecraft:mossy_cobblestone'
                ];

                if (block && convertibleBlocks.includes(block.typeId)) {
                    // Check limit before converting
                    if (trackedDustedDirtBlocks.size >= DUSTED_DIRT_MAX_BLOCKS) break;
                    
                    const key = `${candidate.x},${candidate.y},${candidate.z},${dimension.id}`;
                    
                    // Track this block BEFORE converting (atomicity)
                    try {
                        trackedDustedDirtBlocks.set(key, { tick: system.currentTick, dimension: dimension.id });
                        
                        // Register in spawn controller cache
                        try {
                            registerDustedDirtBlock(candidate.x, candidate.y, candidate.z, dimension);
                        } catch (registerError) {
                            // If registration fails, revert tracking
                            trackedDustedDirtBlocks.delete(key);
                            console.warn(`[DUSTED_DIRT] Failed to register block at ${candidate.x},${candidate.y},${candidate.z}:`, registerError);
                            // Block hasn't been converted yet, so no revert needed
                            continue;
                        }
                        
                        // Now convert the block (tracking is guaranteed)
                        block.setType('mb:dusted_dirt');
                        blocksConverted++;
                        
                        // Add particle effect for each conversion
                        dimension.runCommand(`particle minecraft:snowflake ${candidate.x} ${candidate.y + 1} ${candidate.z}`);
                    } catch (trackError) {
                        // If tracking fails, don't convert the block
                        console.warn(`[DUSTED_DIRT] Failed to track block at ${candidate.x},${candidate.y},${candidate.z}:`, trackError);
                        // Block not converted, so no revert needed
                    }
                }
            } catch (e) {
                // Ignore errors for individual blocks
            }
        }


        if (blocksConverted > 0) {
            // console.log(`[DUSTED DIRT] ${killerType} killed ${victimType || 'unknown'} on day ${currentDay} - spread dusted dirt to ${blocksConverted} blocks (radius: ${spreadRadius}, chance: ${(spreadChance * 100).toFixed(1)}%, world multiplier: ${worldInfectionMultiplier.toFixed(1)}x) at ${x}, ${y}, ${z}`);
        }

    } catch (error) {
        // console.warn('[DUSTED DIRT] Error spreading dusted dirt:', error);
    }
}

// Handle infected player death
function handleInfectedPlayerDeath(player, source) {
    // Check if player was killed by a Maple Bear
    if (!source || !source.damagingEntity) return;
    
    const killer = source.damagingEntity;
    const killerType = killer?.typeId;
    
    // Check if killer is any type of Maple Bear
    const mapleBearTypes = [
        MAPLE_BEAR_ID, MAPLE_BEAR_DAY4_ID, MAPLE_BEAR_DAY8_ID, MAPLE_BEAR_DAY13_ID, MAPLE_BEAR_DAY20_ID,
        INFECTED_BEAR_ID, INFECTED_BEAR_DAY8_ID, INFECTED_BEAR_DAY13_ID, INFECTED_BEAR_DAY20_ID,
        BUFF_BEAR_ID, BUFF_BEAR_DAY13_ID, BUFF_BEAR_DAY20_ID,
        FLYING_BEAR_ID, FLYING_BEAR_DAY15_ID, FLYING_BEAR_DAY20_ID,
        MINING_BEAR_ID, MINING_BEAR_DAY20_ID,
        TORPEDO_BEAR_ID, TORPEDO_BEAR_DAY20_ID,
        INFECTED_PIG_ID, INFECTED_COW_ID
    ];
    
    if (!mapleBearTypes.includes(killerType)) return;
    
    // Transform player into a Maple Bear
    try {
        const currentDay = getCurrentDay();
        let infectedBearType = INFECTED_BEAR_ID; // Default to original
        
        // Choose appropriate infected bear variant based on current day
        if (currentDay >= 20) {
            infectedBearType = INFECTED_BEAR_DAY20_ID;
        } else if (currentDay >= 13) {
            infectedBearType = INFECTED_BEAR_DAY13_ID;
        } else if (currentDay >= 8) {
            infectedBearType = INFECTED_BEAR_DAY8_ID;
        }
        
        const bear = player.dimension.spawnEntity(infectedBearType, player.location);
        if (bear) {
            bear.nameTag = `§4! ${player.name}'s Infected Form`;
            bear.setDynamicProperty("infected_by", player.id);
        }
        player.dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${player.name} was transformed into a Maple Bear!"}]}`);
        
        // Record this event in daily logs for all players (reflection on next day)
        const tomorrowDay = getCurrentDay() + 1;
        const eventMessage = `${player.name} was transformed into a Maple Bear after being killed by the infection.`;
        for (const p of world.getAllPlayers()) {
            if (p && p.isValid) {
                try {
                    recordDailyEvent(p, tomorrowDay, eventMessage, "general");
                } catch (error) {
                    console.warn(`[DAILY LOG] Error recording player death for ${p.name}:`, error);
                }
            }
        }
    } catch (error) {
        console.warn(`[TRANSFORMATION] Error transforming ${player.name}:`, error);
    }
}

// Main entity death handler
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    const source = event.damageSource;
    
    // Handle player death - clear infection data and transform if killed by Maple Bear
    if (entity instanceof Player) {
        handleInfectedPlayerDeath(entity, source); // Check for transformation BEFORE clearing data
        handlePlayerDeath(entity);
        return; // Exit early for player deaths
    }
    
    // Handle mob conversion when killed by Maple Bears
    if (source && source.damagingEntity && !(entity instanceof Player)) {
        handleMobConversion(entity, source.damagingEntity);
    }
    
    // Handle Maple Bear kill tracking
    if (source && source.damagingEntity) {
        handleMapleBearKillTracking(entity, source.damagingEntity);
    }

    // Handle dusted dirt spreading when Maple Bears kill things
    if (source && source.damagingEntity && !(entity instanceof Player)) {
        const killer = source.damagingEntity;
        const killerType = killer.typeId;

        // Check if killer is a Maple Bear type (including all variants)
        const mapleBearTypes = [
            MAPLE_BEAR_ID, MAPLE_BEAR_DAY4_ID, MAPLE_BEAR_DAY8_ID, MAPLE_BEAR_DAY13_ID, MAPLE_BEAR_DAY20_ID,
            INFECTED_BEAR_ID, INFECTED_BEAR_DAY8_ID, INFECTED_BEAR_DAY13_ID, INFECTED_BEAR_DAY20_ID,
            BUFF_BEAR_ID, BUFF_BEAR_DAY13_ID, BUFF_BEAR_DAY20_ID,
            FLYING_BEAR_ID, FLYING_BEAR_DAY15_ID, FLYING_BEAR_DAY20_ID,
            MINING_BEAR_ID, MINING_BEAR_DAY20_ID,
            TORPEDO_BEAR_ID, TORPEDO_BEAR_DAY20_ID,
            INFECTED_PIG_ID, INFECTED_COW_ID
        ];

        if (mapleBearTypes.includes(killerType)) {
            // Store location and dimension immediately before entity might become invalid
            try {
                const entityLocation = entity.location;
                const entityDimension = entity.dimension;
                const entityTypeId = entity.typeId;
                
                if (entityLocation && entityDimension) {
                    spreadDustedDirt(entityLocation, entityDimension, killerType, entityTypeId);
                }
            } catch (error) {
                // Entity already invalidated, skip dusted dirt spreading
                // console.warn('[DUSTED DIRT] Entity invalidated before spreading:', error);
            }
        }
    }
    // Note: Bear death corruption logic removed - no bears should spawn on death
    
    // Infected pig death: drop collected porkchops as bonus loot
    if (entity.typeId === INFECTED_PIG_ID) {
        try {
            // Check if pig collected any porkchops
            const collectedPorkchops = entity.getDynamicProperty("mb_collected_porkchops") || 0;
            
            if (collectedPorkchops > 0) {
                // Drop bonus porkchops based on collected amount
                const bonusPorkchops = Math.min(collectedPorkchops, 16); // Cap at 16 to prevent lag
                
                for (let i = 0; i < bonusPorkchops; i++) {
                    const dropLocation = {
                        x: entity.location.x + (Math.random() - 0.5) * 3,
                        y: entity.location.y + 0.5,
                        z: entity.location.z + (Math.random() - 0.5) * 3
                    };
                    const porkchopItem = new ItemStack("minecraft:porkchop", 1);
                    entity.dimension.spawnItem(porkchopItem, dropLocation);
                }
                
                // Add visual feedback for bonus drops
                entity.dimension.runCommand(`particle minecraft:heart ${Math.floor(entity.location.x)} ${Math.floor(entity.location.y + 1)} ${Math.floor(entity.location.z)} 1 1 1 0.1 10`);
                
                console.log(`[PORKCHOP] Infected pig died with ${collectedPorkchops} collected porkchops, dropped ${bonusPorkchops} bonus porkchops`);
            }
            
            // Clear the collected porkchops counter
            entity.setDynamicProperty("mb_collected_porkchops", 0);
            
        } catch (error) {
            console.warn("Error handling infected pig death:", error);
        }
    }
    
    // Infected cow death: drop collected beef as bonus loot
    if (entity.typeId === INFECTED_COW_ID) {
        try {
            // Check if cow collected any beef
            const collectedBeef = entity.getDynamicProperty("mb_collected_beef") || 0;
            
            if (collectedBeef > 0) {
                // Drop bonus beef based on collected amount
                const bonusBeef = Math.min(collectedBeef, 16); // Cap at 16 to prevent lag
                
                for (let i = 0; i < bonusBeef; i++) {
                    const dropLocation = {
                        x: entity.location.x + (Math.random() - 0.5) * 3,
                        y: entity.location.y + 0.5,
                        z: entity.location.z + (Math.random() - 0.5) * 3
                    };
                    const beefItem = new ItemStack("minecraft:beef", 1);
                    entity.dimension.spawnItem(beefItem, dropLocation);
                }
                
                // Add visual feedback for bonus drops
                entity.dimension.runCommand(`particle minecraft:heart ${Math.floor(entity.location.x)} ${Math.floor(entity.location.y + 1)} ${Math.floor(entity.location.z)} 1 1 1 0.1 10`);
                
                console.log(`[BEEF] Infected cow died with ${collectedBeef} collected beef, dropped ${bonusBeef} bonus beef`);
            }
            
            // Clear the collected beef counter
            entity.setDynamicProperty("mb_collected_beef", 0);
            
        } catch (error) {
            // console.warn("Error handling infected cow death:", error);
        }
    }
    
    // Mining bear death: drop all collected blocks
    if (entity.typeId === MINING_BEAR_ID || entity.typeId === MINING_BEAR_DAY20_ID) {
        try {
            const entityBlocks = collectedBlocks.get(entity.id);
            if (entityBlocks && entityBlocks.size > 0) {
                const loc = entity.location;
                const dimension = entity.dimension;
                
                // Drop all collected blocks
                for (const [itemTypeId, count] of entityBlocks.entries()) {
                    // Drop in stacks of up to 64
                    let remaining = count;
                    while (remaining > 0) {
                        const stackSize = Math.min(remaining, 64);
                        const dropLocation = {
                            x: loc.x + (Math.random() - 0.5) * 2,
                            y: loc.y + 0.5,
                            z: loc.z + (Math.random() - 0.5) * 2
                        };
                        const itemStack = new ItemStack(itemTypeId, stackSize);
                        dimension.spawnItem(itemStack, dropLocation);
                        remaining -= stackSize;
                    }
                }
                
                // Clear collected blocks
                collectedBlocks.delete(entity.id);
            }
        } catch (error) {
            console.warn("Error handling mining bear death (block drops):", error);
        }
    }
    
    // Torpedo bear death: explode on death and place snow layers
    if (entity.typeId === "mb:torpedo_mb" || entity.typeId === "mb:torpedo_mb_day20") {
        try {
            const loc = entity.location;
            const dimension = entity.dimension;
            
            // Only log death events if debug is enabled
            if (isDebugEnabled("main", "death")) {
                console.warn(`[TORPEDO DEATH] ====== TORPEDO BEAR DEATH ======`);
                console.warn(`[TORPEDO DEATH] Entity type: ${entity.typeId}`);
                console.warn(`[TORPEDO DEATH] Death location: (${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)})`);
                console.warn(`[TORPEDO DEATH] Dimension: ${dimension.id}`);
                console.warn(`[TORPEDO DEATH] Triggering explosion effects...`);
            }
            
            // Create explosion effect - use Bedrock Edition particle command syntax
            try {
                const x = Math.floor(loc.x);
                const y = Math.floor(loc.y);
                const z = Math.floor(loc.z);
                
                // Bedrock Edition particle command: /particle <effect> <x> <y> <z>
                // Try simplest format first (no count parameter)
                try {
                    dimension.runCommand(`particle minecraft:explosion ${x} ${y} ${z}`);
                } catch (err) {
                    if (isDebugEnabled("main", "death")) {
                        console.warn(`[TORPEDO DEATH] Particle command failed:`, err);
                    }
                }
                try {
                    dimension.runCommand(`particle minecraft:explosion_emitter ${x} ${y} ${z}`);
                } catch (err) {
                    if (isDebugEnabled("main", "death")) {
                        console.warn(`[TORPEDO DEATH] Explosion emitter command failed:`, err);
                    }
                }
                
                // Play explosion sound
                try {
                    dimension.runCommand(`playsound mob.tnt.explode @a ${x} ${y} ${z} 1 1`);
                } catch (err) {
                    if (isDebugEnabled("main", "death")) {
                        console.warn(`[TORPEDO DEATH] Sound command failed:`, err);
                    }
                }
            } catch (error) {
                if (isDebugEnabled("main", "death")) {
                    console.warn(`[TORPEDO DEATH] Error executing explosion commands:`, error);
                }
            }
            
            // Place snow layers on blocks nearby (5 block radius) - only if there are nearby blocks
            const explosionRadius = 5;
            const centerX = Math.floor(loc.x);
            const centerY = Math.floor(loc.y);
            const centerZ = Math.floor(loc.z);
            
            // First check if there are any nearby blocks before placing snow
            let hasNearbyBlocks = false;
            for (let dx = -explosionRadius; dx <= explosionRadius; dx++) {
                for (let dz = -explosionRadius; dz <= explosionRadius; dz++) {
                    const dist = Math.hypot(dx, dz);
                    if (dist > explosionRadius) continue;
                    for (let dy = -2; dy <= 2; dy++) {
                        try {
                            const checkBlock = dimension.getBlock({ x: centerX + dx, y: centerY + dy, z: centerZ + dz });
                            if (checkBlock && !checkBlock.isAir && !checkBlock.isLiquid) {
                                hasNearbyBlocks = true;
                                break;
                            }
                        } catch { }
                    }
                    if (hasNearbyBlocks) break;
                }
                if (hasNearbyBlocks) break;
            }
            
            // Only place snow layers if there are nearby blocks
            if (hasNearbyBlocks) {
                for (let dx = -explosionRadius; dx <= explosionRadius; dx++) {
                    for (let dz = -explosionRadius; dz <= explosionRadius; dz++) {
                        const dist = Math.hypot(dx, dz);
                        if (dist > explosionRadius) continue; // Skip outside radius
                        
                        const checkX = centerX + dx;
                        const checkZ = centerZ + dz;
                        
                        // Find the topmost solid block at this X,Z position (search downward from explosion center)
                        // Exclude snow layers - we want the actual solid block below any snow
                        let topSolidY = null;
                        let topSolidBlock = null;
                        for (let dy = 2; dy >= -2; dy--) {
                            const checkY = centerY + dy;
                            try {
                                const block = dimension.getBlock({ x: checkX, y: checkY, z: checkZ });
                                if (block) {
                                    const blockType = block.typeId;
                                    // Skip snow layers - they're not considered "solid" for placement purposes
                                    if (blockType === "mb:snow_layer" || blockType === "minecraft:snow_layer") {
                                        continue;
                                    }
                                    if (block.isAir !== undefined && !block.isAir && 
                                        block.isLiquid !== undefined && !block.isLiquid) {
                                        topSolidY = checkY;
                                        topSolidBlock = block;
                                        break; // Found the topmost solid block
                                    }
                                }
                            } catch {
                                continue;
                            }
                        }
                        
                        // Place snow - replace grass blocks, otherwise place on top
                        // First check if there's already a snow layer at the placement location
                        if (topSolidY !== null && topSolidBlock) {
                            try {
                                // Check if there's already a snow layer above the solid block
                                const snowCheckY = topSolidY + 1;
                                const existingSnowBlock = dimension.getBlock({ x: checkX, y: snowCheckY, z: checkZ });
                                if (existingSnowBlock) {
                                    const existingType = existingSnowBlock.typeId;
                                    if (existingType === "mb:snow_layer" || existingType === "minecraft:snow_layer") {
                                        // Already has snow layer, skip placement
                                        continue;
                                    }
                                }
                                
                                const blockType = topSolidBlock.typeId;
                                // If it's any ground foliage (grass, flowers, desert plants, etc.), replace it with snow
                                if (blockType === "minecraft:grass_block" || blockType === "minecraft:grass" || 
                                    blockType === "minecraft:tall_grass" || blockType === "minecraft:fern" || 
                                    blockType === "minecraft:large_fern" ||
                                    blockType === "minecraft:dandelion" || blockType === "minecraft:poppy" ||
                                    blockType === "minecraft:blue_orchid" || blockType === "minecraft:allium" ||
                                    blockType === "minecraft:azure_bluet" || blockType === "minecraft:red_tulip" ||
                                    blockType === "minecraft:orange_tulip" || blockType === "minecraft:white_tulip" ||
                                    blockType === "minecraft:pink_tulip" || blockType === "minecraft:oxeye_daisy" ||
                                    blockType === "minecraft:cornflower" || blockType === "minecraft:lily_of_the_valley" ||
                                    blockType === "minecraft:sunflower" || blockType === "minecraft:lilac" ||
                                    blockType === "minecraft:rose_bush" || blockType === "minecraft:peony" ||
                                    blockType === "minecraft:dead_bush" || blockType === "minecraft:cactus" ||
                                    blockType === "minecraft:sweet_berry_bush" || blockType === "minecraft:nether_sprouts" ||
                                    blockType === "minecraft:warped_roots" || blockType === "minecraft:crimson_roots" ||
                                    blockType === "minecraft:small_dripleaf" || blockType === "minecraft:big_dripleaf" ||
                                    blockType === "minecraft:big_dripleaf_stem" || blockType === "minecraft:spore_blossom" ||
                                    blockType === "minecraft:glow_lichen" || blockType === "minecraft:moss_carpet" ||
                                    blockType === "minecraft:vine" || blockType === "minecraft:weeping_vines" ||
                                    blockType === "minecraft:twisting_vines" || blockType === "minecraft:cave_vines" ||
                                    blockType === "minecraft:sea_pickle" || blockType === "minecraft:kelp" ||
                                    blockType === "minecraft:seagrass" || blockType === "minecraft:tall_seagrass" ||
                                    blockType === "minecraft:waterlily" || blockType === "minecraft:lily_pad") {
                                    // Check if there's already snow at this location before replacing
                                    const existingSnowCheck = dimension.getBlock({ x: checkX, y: topSolidY, z: checkZ });
                                    if (existingSnowCheck) {
                                        const existingType = existingSnowCheck.typeId;
                                        if (existingType === "mb:snow_layer" || existingType === "minecraft:snow_layer") {
                                            // Already has snow, skip placement
                                            continue;
                                        }
                                    }
                                    try {
                                        topSolidBlock.setType("mb:snow_layer");
                                    } catch {
                                        topSolidBlock.setType(SNOW_LAYER_BLOCK);
                                    }
                                } else {
                                    // Otherwise, place snow in the air above
                                    const snowY = topSolidY + 1;
                                    const snowBlock = dimension.getBlock({ x: checkX, y: snowY, z: checkZ });
                                    if (snowBlock) {
                                        // Check if it's already a snow layer - don't stack them
                                        const snowBlockType = snowBlock.typeId;
                                        if (snowBlockType === "mb:snow_layer" || snowBlockType === "minecraft:snow_layer") {
                                            continue; // Already has snow, skip
                                        }
                                        // Only place if it's air
                                        if (snowBlock.isAir !== undefined && snowBlock.isAir) {
                                            // Use custom snow layer if available, otherwise vanilla
                                            try {
                                                snowBlock.setType("mb:snow_layer");
                                            } catch {
                                                snowBlock.setType(SNOW_LAYER_BLOCK);
                                            }
                                        }
                                    }
                                }
                            } catch {
                                // Skip errors (chunk not loaded, etc.)
                            }
                        }
                    }
                }
            }
        } catch (error) {
            // Ignore explosion errors
        }
    }
});



// --- Bear Infection: On hit by Maple Bear ---
world.afterEvents.entityHurt.subscribe((event) => {
    const player = event.hurtEntity;
    const source = event.damageSource;
    if (!(player instanceof Player)) return;

                const mapleBearTypes = [
                    MAPLE_BEAR_ID, MAPLE_BEAR_DAY4_ID, MAPLE_BEAR_DAY8_ID, MAPLE_BEAR_DAY13_ID, MAPLE_BEAR_DAY20_ID,
                    INFECTED_BEAR_ID, INFECTED_BEAR_DAY8_ID, INFECTED_BEAR_DAY13_ID, INFECTED_BEAR_DAY20_ID,
                    BUFF_BEAR_ID, BUFF_BEAR_DAY13_ID, BUFF_BEAR_DAY20_ID,
                    INFECTED_PIG_ID, INFECTED_COW_ID,
                    FLYING_BEAR_ID, FLYING_BEAR_DAY15_ID, FLYING_BEAR_DAY20_ID,
                    MINING_BEAR_ID, MINING_BEAR_DAY20_ID,
                    TORPEDO_BEAR_ID, TORPEDO_BEAR_DAY20_ID
                ];
    if (source && source.damagingEntity && mapleBearTypes.includes(source.damagingEntity.typeId)) {
        // Track hits for mob discovery
        try {
            const codex = getCodex(player);
            const mobType = source.damagingEntity.typeId;
            
            // Increment hit counter based on mob type
            if (mobType === MAPLE_BEAR_ID || mobType === MAPLE_BEAR_DAY4_ID || mobType === MAPLE_BEAR_DAY8_ID || mobType === MAPLE_BEAR_DAY13_ID || mobType === MAPLE_BEAR_DAY20_ID) {
                codex.mobs.tinyBearHits = (codex.mobs.tinyBearHits || 0) + 1;
                checkAndUnlockMobDiscovery(codex, player, "tinyBearKills", "tinyBearMobKills", "tinyBearHits", "mapleBearSeen", 3, "mysterious");
            } else if (mobType === INFECTED_BEAR_ID || mobType === INFECTED_BEAR_DAY8_ID || mobType === INFECTED_BEAR_DAY13_ID || mobType === INFECTED_BEAR_DAY20_ID) {
                codex.mobs.infectedBearHits = (codex.mobs.infectedBearHits || 0) + 1;
                checkAndUnlockMobDiscovery(codex, player, "infectedBearKills", "infectedBearMobKills", "infectedBearHits", "infectedBearSeen", 3, "dangerous");
            } else if (mobType === BUFF_BEAR_ID || mobType === BUFF_BEAR_DAY13_ID || mobType === BUFF_BEAR_DAY20_ID) {
                codex.mobs.buffBearHits = (codex.mobs.buffBearHits || 0) + 1;
                checkAndUnlockMobDiscovery(codex, player, "buffBearKills", "buffBearMobKills", "buffBearHits", "buffBearSeen", 1, "threatening");
            } else if (mobType === INFECTED_PIG_ID) {
                codex.mobs.infectedPigHits = (codex.mobs.infectedPigHits || 0) + 1;
                checkAndUnlockMobDiscovery(codex, player, "infectedPigKills", "infectedPigMobKills", "infectedPigHits", "infectedPigSeen", 3, "dangerous");
            } else if (mobType === INFECTED_COW_ID) {
                codex.mobs.infectedCowHits = (codex.mobs.infectedCowHits || 0) + 1;
                checkAndUnlockMobDiscovery(codex, player, "infectedCowKills", "infectedCowMobKills", "infectedCowHits", "infectedCowSeen", 3, "dangerous");
            } else if (mobType === FLYING_BEAR_ID || mobType === FLYING_BEAR_DAY15_ID || mobType === FLYING_BEAR_DAY20_ID) {
                codex.mobs.flyingBearHits = (codex.mobs.flyingBearHits || 0) + 1;
                checkAndUnlockMobDiscovery(codex, player, "flyingBearKills", "flyingBearMobKills", "flyingBearHits", "flyingBearSeen", 2, "dangerous", "flying_bear");
            } else if (mobType === MINING_BEAR_ID || mobType === MINING_BEAR_DAY20_ID) {
                codex.mobs.miningBearHits = (codex.mobs.miningBearHits || 0) + 1;
                checkAndUnlockMobDiscovery(codex, player, "miningBearKills", "miningBearMobKills", "miningBearHits", "miningBearSeen", 2, "dangerous", "mining_bear");
            } else if (mobType === TORPEDO_BEAR_ID || mobType === TORPEDO_BEAR_DAY20_ID) {
                codex.mobs.torpedoBearHits = (codex.mobs.torpedoBearHits || 0) + 1;
                checkAndUnlockMobDiscovery(codex, player, "torpedoBearKills", "torpedoBearMobKills", "torpedoBearHits", "torpedoBearSeen", 1, "threatening", "torpedo_bear");
            }
            
            saveCodex(player, codex);
        } catch { }
        
        // If already infected (bear or snow), do not progress hit counter; instead reduce active timer by half of a snow-eat reduction
        try {
            const infectionState = playerInfection.get(player.id);
            const hasActiveInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
            
            if (hasActiveInfection) {
                // Increase snow count based on mob type
                let snowIncrease = 0;
                if (source.damagingEntity.typeId === MAPLE_BEAR_ID || source.damagingEntity.typeId === MAPLE_BEAR_DAY4_ID || source.damagingEntity.typeId === MAPLE_BEAR_DAY8_ID || source.damagingEntity.typeId === MAPLE_BEAR_DAY13_ID || source.damagingEntity.typeId === MAPLE_BEAR_DAY20_ID) {
                    snowIncrease = SNOW_INCREASE.TINY_BEAR;
                } else if (source.damagingEntity.typeId === INFECTED_BEAR_ID || source.damagingEntity.typeId === INFECTED_BEAR_DAY8_ID || source.damagingEntity.typeId === INFECTED_BEAR_DAY13_ID || source.damagingEntity.typeId === INFECTED_BEAR_DAY20_ID || source.damagingEntity.typeId === INFECTED_PIG_ID) {
                    snowIncrease = SNOW_INCREASE.INFECTED;
                } else if (source.damagingEntity.typeId === BUFF_BEAR_ID || source.damagingEntity.typeId === BUFF_BEAR_DAY13_ID || source.damagingEntity.typeId === BUFF_BEAR_DAY20_ID) {
                    snowIncrease = SNOW_INCREASE.BUFF_BEAR;
                } else if (source.damagingEntity.typeId === FLYING_BEAR_ID || source.damagingEntity.typeId === FLYING_BEAR_DAY15_ID || source.damagingEntity.typeId === FLYING_BEAR_DAY20_ID) {
                    snowIncrease = SNOW_INCREASE.FLYING_BEAR;
                } else if (source.damagingEntity.typeId === MINING_BEAR_ID || source.damagingEntity.typeId === MINING_BEAR_DAY20_ID) {
                    snowIncrease = SNOW_INCREASE.MINING_BEAR;
                } else if (source.damagingEntity.typeId === TORPEDO_BEAR_ID || source.damagingEntity.typeId === TORPEDO_BEAR_DAY20_ID) {
                    snowIncrease = SNOW_INCREASE.TORPEDO_BEAR;
                }
                
                // Update snow count
                infectionState.snowCount = (infectionState.snowCount || 0) + snowIncrease;
                
                // Apply time effect based on new snow count
                const snowCount = infectionState.snowCount;
                const timeEffect = getSnowTimeEffect(snowCount);
                
                // Apply time effect
                infectionState.ticksLeft = Math.max(0, Math.min(INFECTION_TICKS, infectionState.ticksLeft + timeEffect));
                playerInfection.set(player.id, infectionState);
                
                // Update maximum snow level achieved
                updateMaxSnowLevel(player, infectionState.snowCount);
                
                // Check for immediate death
                if (infectionState.ticksLeft <= 0) {
                    handleInfectionExpiration(player, infectionState);
                } else if (infectionState.ticksLeft <= 1200 && !infectionState.warningSent) { // 1 minute before transformation
                    // Send warning message a minute before transformation
                    player.sendMessage("§4You don't feel so good...");
                    infectionState.warningSent = true;
                    playerInfection.set(player.id, infectionState);
                }
                    return;
                }
        } catch { }
        // Mob discovery is now handled through proper kill tracking system
        // No direct unlocks on being hit - must reach kill requirements
        
        try {
            // If player is infected and gets hit by Maple Bear, unlock snow level display
            const infectionState = playerInfection.get(player.id);
            const hasActiveInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
            if (hasActiveInfection) {
                markCodex(player, "items.snowFound");
                markCodex(player, "items.snowIdentified");
            }
        } catch { }
        // Check if player is immune to infection
        if (isPlayerImmune(player)) {
            console.log(`[INFECTION] ${player.name} is immune to infection, hit ignored`);
            
            // Mark that player now knows they have immunity
            try { 
                const codex = getCodex(player);
                if (!codex.status.immuneKnown) {
                    markCodex(player, "status.immuneKnown");
                    player.sendMessage("§bYou realize you are immune to infection! Hopefully?");
                }
            } catch { }
            
            // Only show message once per immunity period
            if (!player.hasTag("mb_immune_hit_message")) {
                player.sendMessage("§eYou are lucky cuh...");
                player.addTag("mb_immune_hit_message");
            }
                    return;
                }

        // Track hits before infection
        const currentHits = bearHitCount.get(player.id) || 0;
        const newHitCount = currentHits + 1;
        bearHitCount.set(player.id, newHitCount);

        console.log(`[INFECTION] ${player.name} hit by Maple Bear (${newHitCount}/${HITS_TO_INFECT})`);

        // Ramping hit sounds - progressively more disturbing
        if (newHitCount < HITS_TO_INFECT) {
            const volumeMultiplier = getPlayerSoundVolume(player);
            if (newHitCount === 1) {
                // First hit: mild concern - like a tap on the shoulder
                player.playSound("mob.villager.hmm", { pitch: 0.8, volume: 0.5 * volumeMultiplier });
                player.playSound("random.pop", { pitch: 0.6, volume: 0.4 * volumeMultiplier });
            } else if (newHitCount === 2) {
                // Second hit: getting hit - more impactful but not terrifying
                player.playSound("mob.villager.hmm", { pitch: 0.6, volume: 0.6 * volumeMultiplier });
                player.playSound("mob.zombie.ambient", { pitch: 0.8, volume: 0.5 * volumeMultiplier });
                player.playSound("random.pop", { pitch: 0.8, volume: 0.5 * volumeMultiplier });
                player.playSound("mob.wolf.growl", { pitch: 0.7, volume: 0.3 * volumeMultiplier });
            }
        }

        // Check if this hit causes infection
        if (newHitCount >= HITS_TO_INFECT) {
            // Apply strong immediate effects at infection moment (3rd hit)
            applyEffect(player, "minecraft:blindness", 200, { amplifier: 0 });
            applyEffect(player, "minecraft:nausea", 200, { amplifier: 0 });
            applyEffect(player, "minecraft:mining_fatigue", 200, { amplifier: 0 });
            // Player is now infected
            playerInfection.set(player.id, { ticksLeft: INFECTION_TICKS, cured: false, hitCount: newHitCount, snowCount: 0, lastActiveTick: system.currentTick });
            player.addTag(INFECTED_TAG);
            
            // Track infection history
            trackInfectionHistory(player, "infected");
            
            // Scary infection sounds - final hit with dog snarl (LOUD!)
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mob.wither.spawn", { pitch: 0.6, volume: 0.85 * volumeMultiplier });
            player.playSound("mob.enderman.portal", { pitch: 0.8, volume: 0.75 * volumeMultiplier });
            player.playSound("mob.enderman.teleport", { pitch: 1.0, volume: 0.6 * volumeMultiplier });
            player.playSound("mob.zombie.ambient", { pitch: 0.8, volume: 0.75 * volumeMultiplier });
            player.playSound("mob.wolf.growl", { pitch: 0.7, volume: 0.85 * volumeMultiplier }); // Dog snarl for final hit
            
            // Get first-time message state
            const firstTime = firstTimeMessages.get(player.id) || { hasBeenHit: false, hasBeenInfected: false, snowTier: 0 };
            
            if (!firstTime.hasBeenInfected) {
                player.sendMessage(getInfectionMessage("bear", "infected"));
                firstTime.hasBeenInfected = true;
            }
            // No message for subsequent infections - they already know they're infected
            
            firstTimeMessages.set(player.id, firstTime);

            // Clear hit count since they're now infected
            bearHitCount.delete(player.id);

            // IMMEDIATELY save the infection data
            saveInfectionData(player);
            console.log(`[INFECTION] Immediately saved bear infection data for ${player.name}`);
            try { markCodex(player, "status.bearTimerSeen"); } catch { }
            try { markCodex(player, "infections.bear.discovered"); markCodex(player, "infections.bear.firstHitAt", true); } catch { }
                        } else {
            // Not infected yet, show progress only for first-time hits
            const firstTime = firstTimeMessages.get(player.id) || { hasBeenHit: false, hasBeenInfected: false, snowTier: 0 };
            
            if (!firstTime.hasBeenHit) {
                const hitsLeft = HITS_TO_INFECT - newHitCount;
                const hitMessage = getInfectionMessage("bear", "hit");
                player.sendMessage(`${hitMessage} (${hitsLeft} more hit${hitsLeft === 1 ? '' : 's'} until infection)`);
                firstTime.hasBeenHit = true;
                firstTimeMessages.set(player.id, firstTime);
            }
            // Apply staged effects based on hit count (pre-infection)
                if (newHitCount === 1) {
                applyEffect(player, "minecraft:blindness", 60, { amplifier: 0 });
                } else if (newHitCount === 2) {
                applyEffect(player, "minecraft:blindness", 100, { amplifier: 0 });
                applyEffect(player, "minecraft:nausea", 160, { amplifier: 0 });
                }
        }
    }
});


// Debug and testing features have been removed for playability

// --- Cure Logic: Consolidated in itemCompleteUse above ---
// Removed duplicate cure logic since it's now handled in the main itemCompleteUse handler

// --- Infection Timers and Effects ---
system.runInterval(() => {
    // Unified infection system
    for (const [id, state] of playerInfection.entries()) {
        const player = world.getAllPlayers().find(p => p.id === id);
        if (!player || state.cured) continue;

        // Update last active tick when player is online
        state.lastActiveTick = system.currentTick;
        state.ticksLeft -= 40; // Adjusted for 40-tick interval

        // Apply daily snow decay based on snow tier
        const snowCount = state.snowCount || 0;
        if (snowCount > 0) {
            let dailyDecay = 0;
            
            if (snowCount <= 5) {
                // Tier 1: The Awakening - minimal decay
                dailyDecay = 1200; // 1 minute per day
            } else if (snowCount <= 10) {
                // Tier 2: The Craving - moderate decay
                dailyDecay = 2400; // 2 minutes per day
            } else if (snowCount <= 20) {
                // Tier 3: The Descent - high decay
                dailyDecay = 4800; // 4 minutes per day
            } else if (snowCount <= 50) {
                // Tier 4: The Void - extreme decay
                dailyDecay = 7200; // 6 minutes per day
            } else if (snowCount <= 100) {
                // Tier 5: The Abyss - maximum decay
                dailyDecay = 12000; // 10 minutes per day
            } else {
                // Tier 6: The Black Void - beyond maximum decay
                dailyDecay = 18000; // 15 minutes per day
            }
            
            // Apply decay every 24000 ticks (1 day) - track last decay tick
            if (!state.lastDecayTick) state.lastDecayTick = system.currentTick;
            const ticksSinceDecay = system.currentTick - state.lastDecayTick;
            if (ticksSinceDecay >= 24000) {
                state.lastDecayTick = system.currentTick;
                state.ticksLeft = Math.max(0, state.ticksLeft - dailyDecay);
                console.log(`[SNOW DECAY] ${player.name} lost ${dailyDecay} ticks due to snow tier ${snowCount} decay`);
            }
        }
        // Save data periodically
        saveInfectionData(player);

        // Log remaining time every 10 minutes (24000 ticks) - removed action bar display
        if (state.ticksLeft % 24000 === 0 && state.ticksLeft > 0) {
            const daysLeft = Math.ceil(state.ticksLeft / 24000);
            console.log(`[INFECTION] ${player.name} has ${daysLeft} days left until bear transformation`);
        }

        if (state.ticksLeft <= 0) {
            handleInfectionExpiration(player, state);
        } else if (state.ticksLeft <= 1200 && !state.warningSent) { // 1 minute before transformation
            // Send warning message a minute before transformation
            player.sendMessage("§4You don't feel so good...");
            state.warningSent = true;
            playerInfection.set(id, state);
    } else {
            // Scale symptom chance and intensity based on snow count (not just time)
            const snowCount = state.snowCount || 0;
            const timeLevel = getSymptomLevel(state.ticksLeft);
            
            // Determine severity based on snow count
            let severityLevel = 0;
            if (snowCount <= 5) {
                severityLevel = Math.max(0, timeLevel - 1); // Tier 1: milder effects
            } else if (snowCount <= 10) {
                severityLevel = timeLevel; // Tier 2: normal effects
            } else if (snowCount <= 20) {
                severityLevel = Math.min(3, timeLevel + 1); // Tier 3: enhanced effects
            } else if (snowCount <= 50) {
                severityLevel = Math.min(3, timeLevel + 2); // Tier 4: severe effects
            } else if (snowCount <= 100) {
                severityLevel = 3; // Tier 5: maximum effects
            } else {
                severityLevel = 3; // Tier 6: Black Void - maximum effects with infinite duration
            }
            
            // Update max severity if needed
            if (severityLevel > (state.maxSeverity || 0)) {
                state.maxSeverity = severityLevel;
                playerInfection.set(id, state);
                trackInfectionExperience(player, state.source || "unknown", severityLevel);
            }
            const nowTick = system.currentTick;
            const lastTick = lastSymptomTick.get(id) ?? 0;
            const cooldown = severityLevel === 0 ? 2400 : severityLevel === 1 ? 1200 : severityLevel === 2 ? 600 : 240; // ticks between symptoms (adjusted for 5-day infection)
            if (nowTick - lastTick >= cooldown) {
                // Calculate duration based on snow tier (adjusted for 5-day infection)
                let baseDuration = 120; // Base duration in ticks (6 seconds)
                if (snowCount <= 5) {
                    baseDuration = 120; // Tier 1: 6 seconds
                } else if (snowCount <= 10) {
                    baseDuration = 200; // Tier 2: 10 seconds
                } else if (snowCount <= 20) {
                    baseDuration = 300; // Tier 3: 15 seconds
                } else if (snowCount <= 50) {
                    baseDuration = 480; // Tier 4: 24 seconds
                } else if (snowCount <= 100) {
                    baseDuration = 720; // Tier 5: 36 seconds
                        } else {
                    baseDuration = INFINITE_DURATION; // Tier 6: Infinite (Black Void)
                }
                const effectsByLevel = [
                    [],
                    [{ effect: "minecraft:slowness", duration: 60, amp: 0 }],
                    [{ effect: "minecraft:slowness", duration: 100, amp: 1 }, { effect: "minecraft:hunger", duration: 80, amp: 1 }],
                    [{ effect: "minecraft:slowness", duration: 140, amp: 2 }, { effect: "minecraft:weakness", duration: 140, amp: 1 }, { effect: "minecraft:blindness", duration: 60, amp: 0 }, { effect: "minecraft:nausea", duration: 200, amp: 0 }]
                ];
                
                // Rare good effects during infection (5% chance)
                const goodEffects = [
                    { effect: "minecraft:regeneration", duration: 200, amp: 0 },
                    { effect: "minecraft:speed", duration: 300, amp: 0 },
                    { effect: "minecraft:jump_boost", duration: 400, amp: 0 },
                    { effect: "minecraft:strength", duration: 300, amp: 0 }
                ];
                
                // Check for rare good effect (5% chance)
                if (Math.random() < 0.05) {
                    const goodEffect = goodEffects[Math.floor(Math.random() * goodEffects.length)];
                    try {
                        applyEffect(player, goodEffect.effect, goodEffect.duration, { amplifier: goodEffect.amp, showParticles: true });
                        player.sendMessage("§7You feel a brief moment of clarity.");
                        const volumeMultiplier = getPlayerSoundVolume(player);
                        player.playSound("random.levelup", { pitch: 1.5, volume: 0.6 * volumeMultiplier });
                        console.log(`[INFECTION] ${player.name} received rare good effect: ${goodEffect.effect}`);
                        
                        // Track rare good effects in codex
                        if (goodEffect.effect === "minecraft:regeneration") markCodex(player, "snowEffects.regenerationSeen");
                        if (goodEffect.effect === "minecraft:speed") markCodex(player, "snowEffects.speedSeen");
                        if (goodEffect.effect === "minecraft:jump_boost") markCodex(player, "snowEffects.jumpBoostSeen");
                        if (goodEffect.effect === "minecraft:strength") markCodex(player, "snowEffects.strengthSeen");
                        
                        // Unlock snow effects tab when first rare good effect is experienced
                        markCodex(player, "symptomsUnlocks.snowEffectsUnlocked");
                    } catch { }
                } else {
                    // Normal negative effects
                const options = effectsByLevel[severityLevel];
                if (options && options.length > 0) {
                    const chosen = options[Math.floor(Math.random() * options.length)];
                        applyEffect(player, chosen.effect, chosen.duration, { amplifier: chosen.amp });
                    }
                }
                lastSymptomTick.set(id, nowTick);
            }
        }
    }

    // One-shot inventory scan for item discoveries
    try {
        for (const p of world.getAllPlayers()) {
            const inv = p.getComponent("inventory")?.container;
            if (!inv) continue;
            const codex = getCodex(p);
            
            // Check for snow
            if (!codex?.items?.snowFound) {
                for (let i = 0; i < inv.size; i++) {
                    const it = inv.getItem(i);
                    if (it && it.typeId === SNOW_ITEM_ID) { 
                        try { 
                            markCodex(p, "items.snowFound"); 
                            sendDiscoveryMessage(p, codex, "important", "snow");
                        } catch { }
                        break; 
                    }
                }
            }
            
            // Check for brewing stand
            if (!codex?.items?.brewingStandSeen) {
                for (let i = 0; i < inv.size; i++) {
                    const it = inv.getItem(i);
                    if (it && it.typeId === "minecraft:brewing_stand") { 
                        try { 
                            markCodex(p, "items.brewingStandSeen"); 
                            sendDiscoveryMessage(p, codex, "interesting", "brewing_stand");
                            const volumeMultiplier = getPlayerSoundVolume(p);
                            p.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
                        } catch { }
                        break; 
                    }
                }
            }
            
            // Check for dusted dirt
            if (!codex?.items?.dustedDirtSeen) {
                for (let i = 0; i < inv.size; i++) {
                    const it = inv.getItem(i);
                    if (it && it.typeId === "mb:dusted_dirt") { 
                        try { 
                            markCodex(p, "items.dustedDirtSeen"); 
                            sendDiscoveryMessage(p, codex, "interesting");
                            const volumeMultiplier = getPlayerSoundVolume(p);
                            p.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
                        } catch { }
                        break; 
                    }
                }
            }
            
            // Check for basic journal
            if (!codex?.items?.basicJournalSeen) {
                for (let i = 0; i < inv.size; i++) {
                    const it = inv.getItem(i);
                    if (it && it.typeId === "mb:basic_journal") { 
                        try { 
                            markCodex(p, "items.basicJournalSeen"); 
                            sendDiscoveryMessage(p, codex, "interesting", "basic_journal");
                            const volumeMultiplier = getPlayerSoundVolume(p);
                            p.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
                        } catch { }
                        break; 
                    }
                }
            }
            
            // Check for powdery journal
            if (!codex?.items?.snowBookCrafted) {
                for (let i = 0; i < inv.size; i++) {
                    const it = inv.getItem(i);
                    if (it && it.typeId === "mb:snow_book") { 
                        try { 
                            markCodex(p, "items.snowBookCrafted"); 
                            // Only send message if not already sent (prevent duplicates)
                            if (!codex.items?.bookCraftMessageShown) {
                                markCodex(p, "items.bookCraftMessageShown");
                                codex.items.bookCraftMessageShown = true;
                            p.sendMessage("§7You feel your knowledge pulled into the book...");
                            
                            // Dramatic sound effects
                            const volumeMultiplier = getPlayerSoundVolume(p);
                            p.playSound("mob.enderman.portal", { pitch: 0.8, volume: 1.0 * volumeMultiplier });
                            p.playSound("mob.enderman.teleport", { pitch: 1.2, volume: 0.8 * volumeMultiplier });
                            p.playSound("mob.wither.spawn", { pitch: 0.6, volume: 0.6 * volumeMultiplier });
                            p.playSound("random.orb", { pitch: 1.5, volume: 1.0 * volumeMultiplier });
                            
                            // Temporary blindness effect
                                applyEffect(p, "minecraft:blindness", 60, { amplifier: 0 });
                            }
                        } catch { }
                        break; 
                    }
                }
            }
        }
    } catch { }
    
    // Biome discovery system - check if player is in infected biome (optimized with cooldown)
            try {
        const currentTick = system.currentTick || Date.now();

        for (const p of world.getAllPlayers()) {
            try {
                // Check cooldown to avoid expensive biome checks
                const lastCheck = biomeCheckCache.get(p.id) || 0;
                if (currentTick - lastCheck < BIOME_CHECK_COOLDOWN) {
                    continue; // Skip this player, cooldown not expired
                }

                const biomeId = getBiomeIdAt(p.dimension, p.location);
                // Extra fallback: check block underfoot for dusted dirt as a proxy (biome visuals may lag)
                let onDusted = false;
                try {
                    const under = p.dimension.getBlock({ x: Math.floor(p.location.x), y: Math.floor(p.location.y - 1), z: Math.floor(p.location.z) });
                    onDusted = !!under && under.typeId === "mb:dusted_dirt";
                } catch { }

                if ((biomeId && (biomeId === "mb:infected_biome" || biomeId.includes("infected_biome"))) || onDusted) {
                    const codex = getCodex(p);
                    if (!codex.biomes.infectedBiomeSeen) {
                        codex.biomes.infectedBiomeSeen = true;
                        markCodex(p, "biomes.infectedBiomeSeen");
                        p.sendMessage("§7You notice the ground beneath you feels... different. The air is heavy with an unsettling presence.");
                        const volumeMultiplier = getPlayerSoundVolume(p);
                        p.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
                        saveCodex(p, codex);
                    }

                    // Record biome visit with infection level
                    const infectionLevel = onDusted ? 8 : 5; // Higher infection level if on dusted dirt
                    recordBiomeVisit(p, "mb:infected_biome", infectionLevel);
                }

                // Update cooldown cache
                biomeCheckCache.set(p.id, currentTick);
            } catch { }
        }
    } catch { }
}, 40); // Changed from 20 to 40 ticks for better performance

// --- Immunity Cleanup System ---
system.runInterval(() => {
    try {
        // Clean up expired immunity entries
        const currentTime = Date.now();
        const expiredPlayers = [];
        
        for (const [playerId, immunityEndTime] of curedPlayers.entries()) {
            if (currentTime > immunityEndTime) {
                expiredPlayers.push(playerId);
            }
        }
        
        // Clean up expired entries
        for (const playerId of expiredPlayers) {
            curedPlayers.delete(playerId);
            console.log(`[IMMUNITY] Cleaned up expired immunity for player ${playerId}`);
        }
        
        // Also clean up any orphaned data for players who are no longer online
        const onlinePlayerIds = new Set(world.getAllPlayers().map(p => p.id));
        
        // Clean up Maps for players who are no longer online
        for (const [playerId] of playerInfection.entries()) {
            if (!onlinePlayerIds.has(playerId)) {
                playerInfection.delete(playerId);
            }
        }
        
        for (const [playerId] of bearHitCount.entries()) {
            if (!onlinePlayerIds.has(playerId)) {
                bearHitCount.delete(playerId);
            }
        }
        
        for (const [playerId] of firstTimeMessages.entries()) {
            if (!onlinePlayerIds.has(playerId)) {
                firstTimeMessages.delete(playerId);
            }
        }
        
        for (const [playerId] of infectionExperience.entries()) {
            if (!onlinePlayerIds.has(playerId)) {
                infectionExperience.delete(playerId);
            }
        }
        
        } catch (error) {
        console.warn(`[CLEANUP] Error in immunity cleanup system:`, error);
    }
}, 600); // Check every 30 seconds (600 ticks)

// --- Maple Bear Snow Trail and Item Drops ---
// Leaves occasional snow layers under bears and drops snow items, with per-type frequency and throttling
const lastSnowTrailTickByEntity = new Map();
const lastSnowDropTickByEntity = new Map();
const TRAIL_COOLDOWN_TICKS = 40; // 2s between placements per entity
const SNOW_DROP_COOLDOWN_TICKS = 200; // 10s between snow item drops per entity

function tryPlaceSnowLayerUnder(entity) {
    try {
        const blockLoc = {
            x: Math.floor(entity.location.x),
            y: Math.floor(entity.location.y - 0.5),
            z: Math.floor(entity.location.z)
        };
        const aboveLoc = { x: blockLoc.x, y: blockLoc.y + 1, z: blockLoc.z };
        const dim = entity.dimension;
        const below = dim.getBlock(blockLoc);
        const above = dim.getBlock(aboveLoc);
        if (!below || !above) return;
        
        // Check if there are nearby blocks (don't place in empty air)
        let hasNearbyBlocks = false;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;
                try {
                    const nearbyBlock = dim.getBlock({ x: blockLoc.x + dx, y: blockLoc.y, z: blockLoc.z + dz });
                    if (nearbyBlock && !nearbyBlock.isAir && !nearbyBlock.isLiquid) {
                        hasNearbyBlocks = true;
                        break;
                    }
                } catch { }
            }
            if (hasNearbyBlocks) break;
        }
        
        // Only place if there are nearby blocks
        if (!hasNearbyBlocks) return;
        
        // Avoid placing inside fluids or on air
        if (!below || below.isLiquid || below.isAir || below.isAir === undefined) return;
        
        const belowType = below.typeId;
        // If the block below is any ground foliage (grass, flowers, desert plants, etc.), replace it with snow
        if (belowType === "minecraft:grass_block" || belowType === "minecraft:grass" || 
            belowType === "minecraft:tall_grass" || belowType === "minecraft:fern" || 
            belowType === "minecraft:large_fern" ||
            belowType === "minecraft:dandelion" || belowType === "minecraft:poppy" ||
            belowType === "minecraft:blue_orchid" || belowType === "minecraft:allium" ||
            belowType === "minecraft:azure_bluet" || belowType === "minecraft:red_tulip" ||
            belowType === "minecraft:orange_tulip" || belowType === "minecraft:white_tulip" ||
            belowType === "minecraft:pink_tulip" || belowType === "minecraft:oxeye_daisy" ||
            belowType === "minecraft:cornflower" || belowType === "minecraft:lily_of_the_valley" ||
            belowType === "minecraft:sunflower" || belowType === "minecraft:lilac" ||
            belowType === "minecraft:rose_bush" || belowType === "minecraft:peony" ||
            belowType === "minecraft:dead_bush" || belowType === "minecraft:cactus" ||
            belowType === "minecraft:sweet_berry_bush" || belowType === "minecraft:nether_sprouts" ||
            belowType === "minecraft:warped_roots" || belowType === "minecraft:crimson_roots" ||
            belowType === "minecraft:small_dripleaf" || belowType === "minecraft:big_dripleaf" ||
            belowType === "minecraft:big_dripleaf_stem" || belowType === "minecraft:spore_blossom" ||
            belowType === "minecraft:glow_lichen" || belowType === "minecraft:moss_carpet" ||
            belowType === "minecraft:vine" || belowType === "minecraft:weeping_vines" ||
            belowType === "minecraft:twisting_vines" || belowType === "minecraft:cave_vines" ||
            belowType === "minecraft:sea_pickle" || belowType === "minecraft:kelp" ||
            belowType === "minecraft:seagrass" || belowType === "minecraft:tall_seagrass" ||
            belowType === "minecraft:waterlily" || belowType === "minecraft:lily_pad") {
            try {
                below.setType("mb:snow_layer");
            } catch {
                below.setType(SNOW_LAYER_BLOCK);
            }
        } else {
            // Otherwise, place snow in the air above (only if air above)
            if (!above || !above.isAir || above.isAir === undefined) return;
            // Check if it's already a snow layer - don't stack them
            const aboveType = above.typeId;
            if (aboveType === "mb:snow_layer" || aboveType === "minecraft:snow_layer") {
                return; // Already has snow, skip
            }
            // Double-check that below is actually solid before placing
            if (above.isAir && !below.isAir && !below.isLiquid) {
                try {
                    above.setType("mb:snow_layer");
                } catch {
                    above.setType(SNOW_LAYER_BLOCK);
                }
            }
        }
    } catch { }
}

function tryDropSnowItem(entity) {
    try {
                    const dropLocation = { 
            x: entity.location.x + (Math.random() - 0.5) * 2,
            y: entity.location.y + 0.5,
            z: entity.location.z + (Math.random() - 0.5) * 2
        };
                    const snowItem = new ItemStack(SNOW_ITEM_ID, 1);
        entity.dimension.spawnItem(snowItem, dropLocation);
        
        // Add particle effect
        entity.dimension.runCommand(`particle minecraft:snowflake ${Math.floor(dropLocation.x)} ${Math.floor(dropLocation.y)} ${Math.floor(dropLocation.z)}`);
    } catch { }
}

system.runInterval(() => {
    try {
        const nowTick = system.currentTick;
        for (const entity of world.getAllEntities()) {
            if (!entity || !entity.isValid) continue;
            const t = entity.typeId;
            
            // Check if it's any Maple Bear type (excluding flying and torpedo bears - they have their own snow systems)
            const isMapleBear = t === MAPLE_BEAR_ID || t === MAPLE_BEAR_DAY4_ID || t === MAPLE_BEAR_DAY8_ID || 
                               t === MAPLE_BEAR_DAY13_ID || t === MAPLE_BEAR_DAY20_ID ||
                               t === INFECTED_BEAR_ID || t === INFECTED_BEAR_DAY8_ID || 
                               t === INFECTED_BEAR_DAY13_ID || t === INFECTED_BEAR_DAY20_ID ||
                               t === BUFF_BEAR_ID || t === BUFF_BEAR_DAY13_ID || t === BUFF_BEAR_DAY20_ID ||
                               t === MINING_BEAR_ID || t === MINING_BEAR_DAY20_ID ||
                               t === INFECTED_PIG_ID || t === INFECTED_COW_ID;
            
            // Skip flying bears - they have their own snow layer system
            if (t === FLYING_BEAR_ID || t === FLYING_BEAR_DAY15_ID || t === FLYING_BEAR_DAY20_ID) {
                // Only handle snow item drops for flying bears if needed, but skip trail system
                continue;
            }
            
            // Skip torpedo bears - they fly and have explosion snow effects
            if (t === TORPEDO_BEAR_ID || t === TORPEDO_BEAR_DAY20_ID) {
                continue;
            }
            
            if (!isMapleBear) continue;

            // Snow trail placement (size-based chances: tiny < infected < buff < special)
            let trailChance = 0.02; // tiny default
            
            // Tiny bears (smallest)
            if (t === MAPLE_BEAR_ID) trailChance = 0.02;
            if (t === MAPLE_BEAR_DAY4_ID) trailChance = 0.03;
            if (t === MAPLE_BEAR_DAY8_ID) trailChance = 0.04;
            if (t === MAPLE_BEAR_DAY13_ID) trailChance = 0.05;
            if (t === MAPLE_BEAR_DAY20_ID) trailChance = 0.06;
            
            // Infected bears (medium)
            if (t === INFECTED_BEAR_ID) trailChance = 0.06;
            if (t === INFECTED_BEAR_DAY8_ID) trailChance = 0.08;
            if (t === INFECTED_BEAR_DAY13_ID) trailChance = 0.1;
            if (t === INFECTED_BEAR_DAY20_ID) trailChance = 0.12;
            
            // Buff bears (large)
            if (t === BUFF_BEAR_ID) trailChance = 0.15;
            if (t === BUFF_BEAR_DAY13_ID) trailChance = 0.2;
            if (t === BUFF_BEAR_DAY20_ID) trailChance = 0.25;
            
            // Mining bears (medium-large)
            if (t === MINING_BEAR_ID) trailChance = 0.1;
            if (t === MINING_BEAR_DAY20_ID) trailChance = 0.15;
            
            // Infected animals (same as infected bears)
            if (t === INFECTED_PIG_ID) trailChance = 0.06;
            if (t === INFECTED_COW_ID) trailChance = 0.08;

            const lastTrail = lastSnowTrailTickByEntity.get(entity.id) ?? 0;
            if (nowTick - lastTrail >= TRAIL_COOLDOWN_TICKS && Math.random() < trailChance) {
                tryPlaceSnowLayerUnder(entity);
                lastSnowTrailTickByEntity.set(entity.id, nowTick);
            }

            // Snow item drops (only for tiny Maple Bears)
            if (t === MAPLE_BEAR_ID || t === MAPLE_BEAR_DAY4_ID || t === MAPLE_BEAR_DAY8_ID || t === MAPLE_BEAR_DAY13_ID || t === MAPLE_BEAR_DAY20_ID) {
                const lastDrop = lastSnowDropTickByEntity.get(entity.id) ?? 0;
                if (nowTick - lastDrop >= SNOW_DROP_COOLDOWN_TICKS && Math.random() < 0.6) { // 60% chance
                    tryDropSnowItem(entity);
                    lastSnowDropTickByEntity.set(entity.id, nowTick);
                }
            }
        }
    } catch { }
}, 20); // check every second

// --- Snow Layer Falling/Breaking System ---
// Make snow layers fall or break when there's no solid block beneath them (like vanilla snow layers)
system.runInterval(() => {
    try {
        // Only check snow layers near players for performance
        const allPlayers = world.getAllPlayers();
        if (allPlayers.length === 0) return;
        
        const checkedSnowBlocks = new Set(); // Track checked blocks to avoid duplicates
        const SNOW_CHECK_RADIUS = 32; // Check within 32 blocks of players
        
        for (const player of allPlayers) {
            try {
                const dimension = player.dimension;
                const playerLoc = player.location;
                const checkRange = SNOW_CHECK_RADIUS;
                
                // Check a grid around the player
                for (let dx = -checkRange; dx <= checkRange; dx += 4) {
                    for (let dz = -checkRange; dz <= checkRange; dz += 4) {
                        for (let dy = -8; dy <= 8; dy += 2) {
                            const checkX = Math.floor(playerLoc.x) + dx;
                            const checkY = Math.floor(playerLoc.y) + dy;
                            const checkZ = Math.floor(playerLoc.z) + dz;
                            
                            // Skip if already checked
                            const blockKey = `${checkX},${checkY},${checkZ}`;
                            if (checkedSnowBlocks.has(blockKey)) continue;
                            checkedSnowBlocks.add(blockKey);
                            
                            try {
                                const block = dimension.getBlock({ x: checkX, y: checkY, z: checkZ });
                                if (!block) continue;
                                
                                const blockType = block.typeId;
                                // Check if it's a snow layer
                                if (blockType !== "mb:snow_layer" && blockType !== "minecraft:snow_layer") {
                                    continue;
                                }
                                
                                // Check block beneath the snow layer
                                const belowBlock = dimension.getBlock({ x: checkX, y: checkY - 1, z: checkZ });
                                
                                // If there's no block beneath, or it's air/liquid, the snow should fall/break
                                if (!belowBlock || belowBlock.isAir || belowBlock.isLiquid || 
                                    belowBlock.typeId === "minecraft:air" || 
                                    belowBlock.typeId === "minecraft:cave_air" ||
                                    belowBlock.typeId === "minecraft:void_air") {
                                    // Snow layer is floating - break it (set to air)
                                    block.setType("minecraft:air");
                                }
                            } catch {
                                // Skip errors for individual blocks
                            }
                        }
                    }
                }
            } catch {
                // Skip errors for individual players
            }
        }
    } catch {
        // Skip errors in the main loop
    }
}, 40); // Check every 2 seconds

// --- Monitor infected pig porkchop collection ---
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const entity = event.source;
    const item = event.itemStack;
    
    // Check if an infected pig is eating a porkchop
    if (entity.typeId === INFECTED_PIG_ID && item?.typeId === "minecraft:porkchop") {
        try {
            // Track porkchop consumption
            const currentPorkchops = entity.getDynamicProperty("mb_collected_porkchops") || 0;
            entity.setDynamicProperty("mb_collected_porkchops", currentPorkchops + 1);
            
            // Add visual feedback
            entity.dimension.runCommand(`particle minecraft:heart ${Math.floor(entity.location.x)} ${Math.floor(entity.location.y + 1)} ${Math.floor(entity.location.z)}`);
            
            console.log(`[PORKCHOP] Infected pig consumed porkchop (total collected: ${currentPorkchops + 1})`);
            
        } catch (error) {
            console.warn("Error tracking porkchop consumption:", error);
        }
    }
    
    // Check if an infected cow is eating beef
    if (entity.typeId === INFECTED_COW_ID && item?.typeId === "minecraft:beef") {
        try {
            // Track beef consumption
            const currentBeef = entity.getDynamicProperty("mb_collected_beef") || 0;
            entity.setDynamicProperty("mb_collected_beef", currentBeef + 1);
            
            // Add visual feedback
            entity.dimension.runCommand(`particle minecraft:heart ${Math.floor(entity.location.x)} ${Math.floor(entity.location.y + 1)} ${Math.floor(entity.location.z)}`);
            
            console.log(`[BEEF] Infected cow consumed beef (total collected: ${currentBeef + 1})`);
            
        } catch (error) {
            console.warn("Error tracking beef consumption:", error);
        }
    }
});

// --- Monitor when players get effects added (for logging only) ---
world.afterEvents.effectAdd.subscribe((event) => {
    const entity = event.entity;
    const effect = event.effect;

    const skipPotionUnlock = entity instanceof Player ? shouldSkipPotionUnlock(entity) : false;

    if (entity instanceof Player && effect.typeId === "minecraft:weakness" && !skipPotionUnlock) {
        console.log(`[EFFECT] Player ${entity.name} got weakness effect: duration=${effect.duration}, amplifier=${effect.amplifier}`);
        try { 
            const codex = getCodex(entity);
            if (!codex.items.weaknessPotionSeen) {
                markCodex(entity, "items.weaknessPotionSeen");
                sendDiscoveryMessage(entity, codex, "important");
                const volumeMultiplier = getPlayerSoundVolume(entity);
                entity.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
                entity.playSound("random.orb", { pitch: 1.5, volume: 0.8 * volumeMultiplier });
            }
        } catch { }
    }
    
    // Unlock potions tab when player gets any effect (unless it came from scripted sources)
    if (entity instanceof Player && !skipPotionUnlock) {
        try {
            const codex = getCodex(entity);
            if (!codex.items.potionsSeen) {
                markCodex(entity, "items.potionsSeen");
                sendDiscoveryMessage(entity, codex, "interesting");
                const volumeMultiplier = getPlayerSoundVolume(entity);
                entity.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
            }
        } catch { }
    }
    // Log to symptoms meta ONLY for infection-related effects
    if (entity instanceof Player) {
        try {
            const id = effect.typeId;
            const durationTicks = effect.duration ?? 0;
            const amp = effect.amplifier ?? 0;
            let source = null;
            const infectionState = playerInfection.get(entity.id);
            const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
            
            // Only track effects if player is infected or has consumed snow
            if (hasInfection) {
                source = "infection";
                let timingBucket = null;
                const st = infectionState.ticksLeft || 0;
                const total = INFECTION_TICKS;
                const ratio = Math.max(0, Math.min(1, st / total));
                timingBucket = ratio > 0.5 ? (ratio > 0.8 ? "early" : "mid") : "late";
                
                let snowCountBucket = null;
                const c = infectionState.snowCount || 0;
                snowCountBucket = c <= 5 ? "low" : (c <= 10 ? "mid" : "high");
                
                // Mark seen flag for infection-related effects only
                const infectionEffects = [
                    "minecraft:weakness", "minecraft:nausea", "minecraft:blindness", 
                    "minecraft:slowness", "minecraft:hunger", "minecraft:mining_fatigue"
                ];
                
                if (infectionEffects.includes(id)) {
                    try {
                        if (id === "minecraft:weakness") markCodex(entity, "effects.weaknessSeen");
                        if (id === "minecraft:nausea") markCodex(entity, "effects.nauseaSeen");
                        if (id === "minecraft:blindness") markCodex(entity, "effects.blindnessSeen");
                        if (id === "minecraft:slowness") markCodex(entity, "effects.slownessSeen");
                        if (id === "minecraft:hunger") markCodex(entity, "effects.hungerSeen");
                        if (id === "minecraft:mining_fatigue") markCodex(entity, "effects.miningFatigueSeen");
                    } catch { }
                    // Update meta
                    try { import("./mb_codex.js").then(m => m.updateSymptomMeta(entity, id, durationTicks, amp, source, timingBucket, snowCountBucket)); } catch { }
                }
            }
        } catch { }
    }
});

world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    // Don't clear infection data on respawn - let it persist across sessions
    // Only clear on actual death
});


/**
 * Check if a player has weakness effect using the proper API
 * @param {Player} player - The player to check
 * @returns {boolean} Whether the player has weakness
 */
function hasWeaknessEffect(player) {
    try {
        // Use the proper API method as documented
        const weaknessEffect = player.getEffect("minecraft:weakness");
        return weaknessEffect && weaknessEffect.isValid;
    } catch (error) {
        console.warn(`[WEAKNESS] Error checking weakness effect for ${player.name}:`, error);
        return false;
    }
}

/**
 * Save infection data to dynamic properties
 * @param {Player} player - The player to save data for
 */
function saveInfectionData(player) {
    try {
        // Save bear infection
        const infectionData = playerInfection.get(player.id);
        if (infectionData) {
            player.setDynamicProperty("mb_infection", JSON.stringify(infectionData));
        } else {
            player.setDynamicProperty("mb_infection", undefined);
        }

        // Save immunity
        const immunityEndTime = curedPlayers.get(player.id);
        if (immunityEndTime) {
            player.setDynamicProperty("mb_immunity_end", immunityEndTime.toString());
        } else {
            player.setDynamicProperty("mb_immunity_end", undefined);
        }

        // Save hit count
        const hitCount = bearHitCount.get(player.id);
        if (hitCount) {
            player.setDynamicProperty("mb_bear_hit_count", hitCount.toString());
        } else {
            player.setDynamicProperty("mb_bear_hit_count", undefined);
        }

        // Save first-time message state
        const firstTime = firstTimeMessages.get(player.id);
        if (firstTime) {
            player.setDynamicProperty("mb_first_time_messages", JSON.stringify(firstTime));
        } else {
            player.setDynamicProperty("mb_first_time_messages", undefined);
        }

        // Save maximum snow level
        const maxSnow = maxSnowLevels.get(player.id);
        if (maxSnow) {
            player.setDynamicProperty("mb_max_snow_level", JSON.stringify(maxSnow));
        } else {
            player.setDynamicProperty("mb_max_snow_level", undefined);
        }
    } catch (error) {
        console.warn(`[SAVE] Error saving infection data for ${player.name}:`, error);
    }
}

/**
 * Load infection data from dynamic properties
 * @param {Player} player - The player to load data for
 */
function loadInfectionData(player) {
    try {
        // Load infection data
        const infectionDataStr = player.getDynamicProperty("mb_infection");
        if (infectionDataStr) {
            const infectionData = JSON.parse(infectionDataStr);

            // Check if the infection was cured
            if (infectionData.cured) {
                console.log(`[LOAD] ${player.name} had cured infection, not loading active infection`);
                // Don't load cured infections back into memory
                player.setDynamicProperty("mb_infection", undefined);
            } else {
                playerInfection.set(player.id, infectionData);
                console.log(`[LOAD] Loaded active infection for ${player.name}: ${JSON.stringify(infectionData)}`);

                // Add infection tag if they have an active infection
                if (!player.hasTag(INFECTED_TAG)) {
                    player.addTag(INFECTED_TAG);
                    console.log(`[LOAD] Added infection tag to ${player.name}`);
                }
            }
        }

        // Load immunity
        const immunityEndTimeStr = player.getDynamicProperty("mb_immunity_end");
        if (immunityEndTimeStr) {
            const immunityEndTime = parseInt(immunityEndTimeStr);
            const currentTime = Date.now();
            if (currentTime < immunityEndTime) {
                curedPlayers.set(player.id, immunityEndTime);
                console.log(`[LOAD] Loaded immunity for ${player.name} until ${new Date(immunityEndTime).toLocaleTimeString()}`);
            } else {
                // Immunity expired, clean up
                player.setDynamicProperty("mb_immunity_end", undefined);
                console.log(`[LOAD] Immunity expired for ${player.name}, cleaned up`);
            }
        }

        // Load hit count
        const hitCountStr = player.getDynamicProperty("mb_bear_hit_count");
        if (hitCountStr) {
            const hitCount = parseInt(hitCountStr);
            bearHitCount.set(player.id, hitCount);
            console.log(`[LOAD] Loaded hit count for ${player.name}: ${hitCount}/${HITS_TO_INFECT}`);
        }

        // Load first-time message state
        const firstTimeStr = player.getDynamicProperty("mb_first_time_messages");
        if (firstTimeStr) {
            try {
                const firstTime = JSON.parse(firstTimeStr);
                firstTimeMessages.set(player.id, firstTime);
                console.log(`[LOAD] Loaded first-time message state for ${player.name}: ${JSON.stringify(firstTime)}`);
            } catch (error) {
                console.warn(`[LOAD] Error parsing first-time message state for ${player.name}:`, error);
            }
        }

        // Load maximum snow level
        const maxSnowStr = player.getDynamicProperty("mb_max_snow_level");
        if (maxSnowStr) {
            try {
                const maxSnow = JSON.parse(maxSnowStr);
                maxSnowLevels.set(player.id, maxSnow);
                console.log(`[LOAD] Loaded max snow level for ${player.name}: ${JSON.stringify(maxSnow)}`);
            } catch (error) {
                console.warn(`[LOAD] Error parsing max snow level for ${player.name}:`, error);
            }
        }
        // Load infection experience
        const experienceStr = player.getDynamicProperty("mb_infection_experience");
        if (experienceStr) {
            try {
                const experience = JSON.parse(experienceStr);
                // Convert Array back to Set for effectsSeen
                if (Array.isArray(experience.effectsSeen)) {
                    experience.effectsSeen = new Set(experience.effectsSeen);
                } else if (experience.effectsSeen && typeof experience.effectsSeen === 'object') {
                    // Handle case where effectsSeen is an object instead of array
                    experience.effectsSeen = new Set(Object.keys(experience.effectsSeen));
                } else {
                    experience.effectsSeen = new Set();
                }
                infectionExperience.set(player.id, experience);
                console.log(`[LOAD] Loaded infection experience for ${player.name}: ${JSON.stringify(experience)}`);
            } catch (error) {
                console.warn(`[LOAD] Error parsing infection experience for ${player.name}:`, error);
            }
        }
    } catch (error) {
        console.warn(`[LOAD] Error loading infection data for ${player.name}:`, error);
    }
}

/**
 * Check if a player is immune to infection (recently cured)
 * @param {Player} player - The player to check
 * @returns {boolean} Whether the player is immune
 */
function isPlayerImmune(player) {
    const immunityEndTime = curedPlayers.get(player.id);
    if (!immunityEndTime) {
        // Not immune, clear the hit message tag
        player.removeTag("mb_immune_hit_message");
        return false;
    }

    const currentTime = Date.now();
    if (currentTime > immunityEndTime) {
        // Immunity expired, clean up
        curedPlayers.delete(player.id);
        player.removeTag("mb_immune_hit_message");
        return false;
    }

    return true;
}

/**
 * Format a duration in ticks (20 ticks = 1 second) into a compact string
 * @param {number} ticks
 * @returns {string}
 */
export function formatTicksDuration(ticks) {
    const totalSeconds = Math.max(0, Math.floor((ticks || 0) / 20));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(" ");
}

/**
 * Format a duration in milliseconds into a compact string
 * @param {number} ms
 * @returns {string}
 */
export function formatMillisDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(" ");
}

/**
 * Show an infection status report to the player
 * @param {Player} player
 */
function showInfectionBookReport(player) {
    try {
        const codex = getCodex(player);
        const infectionState = playerInfection.get(player.id);
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        const immune = isPlayerImmune(player);

        // Status summary at top
        const summary = [];
        const typeText = hasInfection ? "Active" : codex.infections.bear.discovered || codex.infections.snow.discovered ? "Known (no active)" : "None";
        summary.push(`§eType: §f${typeText}`);
        if (hasInfection) {
            const ticks = infectionState.ticksLeft || 0;
            const days = Math.ceil(ticks / 24000);
            const snowCount = infectionState.snowCount || 0;
            summary.push(`§eTime: §c${formatTicksDuration(ticks)} (§f~${days} day${days !== 1 ? 's' : ''}§c)`);
            summary.push(`§eSnow consumed: §c${snowCount}`);
            if (codex.cures.bearCureKnown) summary.push("§7Cure: §fWeakness + Enchanted Golden Apple");
        } else if (codex.infections.bear.discovered || codex.infections.snow.discovered) {
            summary.push("§7Infection: §8Known (no active infection)");
        }
        if (immune) {
            const end = curedPlayers.get(player.id);
            const remainingMs = Math.max(0, end - Date.now());
            summary.push(`§bImmunity: §fACTIVE (§b${formatMillisDuration(remainingMs)} left§f)`);
        }
        const hitCount = bearHitCount.get(player.id) || 0;
        const infectionSource = hasInfection ? infectionState.source : null;
        
        if (hitCount > 0 && !hasInfection) {
            summary.push(`§eBear Hits: §f${hitCount}/${HITS_TO_INFECT}`);
        }

        // Mark knowledge
        try {
            if (hasInfection) {
                if (infectionSource === "bear") markCodex(player, "status.bearTimerSeen");
                if (infectionSource === "snow") markCodex(player, "status.snowTimerSeen");
            }
            if (immune) markCodex(player, "status.immuneKnown");
        } catch { }

        // Paged UI
        const main = new ActionFormData().title("§6Powdery Journal");
        main.body(`${summary.join("\n")}\n\n§eChoose a section:`);
        main.button("§fMy Status");
        main.button("§fInfections");
        main.button("§fSymptoms");
        main.button("§fMobs");
        main.button("§fItems");
        player.playSound("random.orb", { pitch: 1.2, volume: 0.6 });
        main.show(player).then((res) => {
            if (!res || res.canceled) return;
            const sel = res.selection;
            if (sel === 0) {
                new ActionFormData().title("§6Status").body(summary.join("\n")).button("§8Back").show(player);
            }
            if (sel === 1) {
                const lines = [];
                lines.push("§eBear Infection:");
                lines.push(codex.infections.bear.discovered ? (codex.cures.bearCureKnown ? "§7Spread by Maple Bears. Cure exists." : "§7Spread by Maple Bears. §8(Cure unknown)") : "§8Unknown");
                lines.push("");
                lines.push("§eSnow Infection:");
                lines.push(codex.infections.snow.discovered ? "§7Self-inflicted via powder. No cure." : "§8Unknown");
                new ActionFormData().title("§6Infections").body(lines.join("\n")).button("§8Back").show(player);
            }
            if (sel === 2) {
                const lines = [];
                lines.push(`§eWeakness: ${codex.effects.weaknessSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eNausea: ${codex.effects.nauseaSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eBlindness: ${codex.effects.blindnessSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eSlowness: ${codex.effects.slownessSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eHunger: ${codex.effects.hungerSeen ? '§fSeen' : '§8Unknown'}`);
                new ActionFormData().title("§6Symptoms").body(lines.join("\n")).button("§8Back").show(player);
            }
            if (sel === 3) {
                const lines = [];
                lines.push(`§eMaple Bear: ${codex.mobs.mapleBearSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eInfected Bear: ${codex.mobs.infectedBearSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eBuff Maple Bear: ${codex.mobs.buffBearSeen ? '§fSeen' : '§8Unknown'}`);
                new ActionFormData().title("§6Mobs").body(lines.join("\n")).button("§8Back").show(player);
            }
            if (sel === 4) {
                const lines = [];
                lines.push(`§eSnow: ${codex.items.snowSeen ? '§fKnown' : '§8Unknown'}`);
                lines.push(`§ePowdery Book: ${codex.items.snowBookCrafted ? '§fKnown' : '§8Unknown'}`);
                lines.push(`§eCure Items: ${codex.items.cureItemsSeen ? '§fKnown' : '§8Unknown'}`);
                new ActionFormData().title("§6Items").body(lines.join("\n")).button("§8Back").show(player);
            }
        }).catch(() => { });
    } catch (err) {
        console.warn(`[BOOK] Error showing infection report for ${player.name}:`, err);
    }
}




/**
 * Spread snow effects at a location
 * @param {Vector3} location - The location to spread effects
 * @param {Dimension} dimension - The dimension to use
 */
function spreadSnowEffect(location, dimension) {
    const { x, y, z } = location;
    // Use integer coordinates for Bedrock particle command
    const pos = `${Math.floor(x)} ${Math.floor(y + 1)} ${Math.floor(z)}`;
    // Smoke and ash particles
    dimension.runCommand(`particle minecraft:smoke_particle ${pos}`);
    dimension.runCommand(`particle minecraft:ash ${pos}`);
    // Snowflakes (no extra params)
    dimension.runCommand(`particle minecraft:snowflake ${pos}`);
}

/**
 * Corrupt dropped items into snow
 * @param {Vector3} origin - The center location to check for items
 * @param {Dimension} dimension - The dimension to search in
 */
function corruptDroppedItems(origin, dimension) {
    try {
        const radius = 5;
        const itemEntities = dimension.getEntities({
            location: origin,
            maxDistance: radius,
            type: "minecraft:item"
        });

        for (const item of itemEntities) {
            // 75% chance to corrupt each item into snow
            if (Math.random() < 0.75) {
                const loc = item.location;
                item.remove();
                dimension.spawnItem(SNOW_ITEM_ID, loc);
                
                // Add a small particle effect for the conversion
                dimension.runCommand(`particle minecraft:snowflake ${loc.x} ${loc.y} ${loc.z} 0.2 0.2 0.2 0.01 5 force`);
            }
        }
    } catch (error) {
        console.warn(`[CORRUPTION] Error in corruptDroppedItems:`, error);
    }
}

// Note: Transformation interval removed - no longer needed

// Utility: Get best armor tier
function getBestArmorTier(player) {
    // 0: none, 1: leather, 2: iron, 3: diamond, 4: netherite
    const armorPriority = [
        "minecraft:netherite", "minecraft:diamond", "minecraft:iron", "minecraft:golden", "minecraft:chainmail", "minecraft:leather"
    ];
    let bestTier = 0;
    for (let i = 0; i < 4; i++) {
        const item = player.getComponent("inventory").container.getItem(100 + i);
        if (item) {
            for (let t = 0; t < armorPriority.length; t++) {
                if (item.typeId.includes(armorPriority[t])) {
                    bestTier = Math.max(bestTier, armorPriority.length - t);
                }
            }
        }
    }
    return bestTier;
}


// Note: All scripted spawning logic removed - using spawn rules and multiple entity files instead

// --- Basic Journal First-Join Logic ---
function giveBasicJournalIfNeeded(player) {
    try {
        // Check if player already received journal using dynamic property
        const playerKey = `mb_has_basic_journal_${player.id}`;
        if (world.getDynamicProperty(playerKey)) {
            return; // Already given
        }
        
        // Wait a few seconds for player to fully load, then give journal with pop-in effect
        system.runTimeout(() => {
            try {
                if (!player || !player.isValid) return;
                
                const inventory = player.getComponent("inventory")?.container;
                if (!inventory) {
                    // Retry after another delay if inventory not ready
                    system.runTimeout(() => giveBasicJournalIfNeeded(player), 40);
                    return;
                }
                
                // Check if player already has one in inventory
                let hasJournal = false;
                for (let i = 0; i < inventory.size; i++) {
                    const item = inventory.getItem(i);
                    if (item && item.typeId === "mb:basic_journal") {
                        hasJournal = true;
                        break;
                    }
                }
                
                if (hasJournal) {
                    world.setDynamicProperty(playerKey, true);
                    return;
                }
                
                // Give the journal
                const journal = new ItemStack("mb:basic_journal", 1);
                const remaining = inventory.addItem(journal);
                
                if (!remaining) {
                    // Successfully added - show pop-in effect
                    world.setDynamicProperty(playerKey, true);
                    
                    // Visual pop-in effect with discovery sound
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("random.pop", { pitch: 1.2, volume: 0.7 * volumeMultiplier });
                    player.playSound("random.orb", { pitch: 1.5, volume: 0.5 * volumeMultiplier });
                    player.playSound("mob.villager.idle", { pitch: 1.3, volume: 0.6 * volumeMultiplier }); // Discovery sound
                    
                    // Show title
                    player.onScreenDisplay.setTitle("§6§lBasic Journal", {
                        fadeInDuration: 10,
                        stayDuration: 40,
                        fadeOutDuration: 20
                    });
                    
                    // Chat message
                    system.runTimeout(() => {
                        if (player && player.isValid) {
                            player.sendMessage("§eA journal appeared in your inventory!");
                            player.sendMessage("§7Right-click it to open and learn about your world.");
                        }
                    }, 20);
                } else {
                    // Inventory full - drop it
                    player.dimension.spawnItem(journal, player.location);
                    world.setDynamicProperty(playerKey, true);
                    player.sendMessage("§eA journal fell from your inventory!");
                    player.sendMessage("§7Right-click it to open and learn about your world.");
                    player.playSound("random.pop", { pitch: 1.0, volume: 0.5 });
                }
            } catch (error) {
                console.warn(`[BASIC JOURNAL] Error giving journal to ${player?.name}:`, error);
            }
        }, 100); // 5 second delay for pop-in effect
    } catch (error) {
        console.warn(`[BASIC JOURNAL] Error in giveBasicJournalIfNeeded:`, error);
    }
}

// --- Player Join/Leave Handlers for Infection Data ---
world.afterEvents.playerJoin.subscribe((event) => {
    try {
        const playerId = event.playerId;
        if (!playerId) return;

        // Add delay to ensure player is fully loaded
        system.runTimeout(() => {
            const player = world.getAllPlayers().find(p => p.id === playerId);
            if (player) {
                loadInfectionData(player);
                giveBasicJournalIfNeeded(player);
            }
        }, 60); // 3 second delay
    } catch (error) {
        console.warn(`[JOIN] Error in player join handler:`, error);
    }
});

world.afterEvents.playerLeave.subscribe((event) => {
    try {
        const playerId = event.playerId;
        if (!playerId) return;

        const player = world.getAllPlayers().find(p => p.id === playerId);
        if (player) {
            // Save infection data immediately when player leaves
            saveInfectionData(player);
            console.log(`[LEAVE] Saved infection data for ${player.name} before they left`);
        }
        
        // CRITICAL: Clean up all Maps and Sets to prevent memory leaks
        playerInfection.delete(playerId);
        curedPlayers.delete(playerId);
        bearHitCount.delete(playerId);
        firstTimeMessages.delete(playerId);
        infectionExperience.delete(playerId);
        // Note: Keep maxSnowLevels persistent - it's a lifetime achievement
        // Note: Keep playerInventories persistent - needed for bear equipment
        
        // Clean up codex error tracking to prevent memory leak
        codexErrorLogged.delete(playerId);
        
        // Clean up entity tracking Maps (these track by entity ID, not player ID)
        // Note: These will be cleaned up automatically when entities are removed
        
        console.log(`[LEAVE] Cleaned up all tracking data for player ${playerId}`);
    } catch (error) {
        console.warn(`[LEAVE] Error in player leave handler:`, error);
    }
});

// --- Day Tracking System Initialization ---
system.run(() => {
    try {
        initializeDayTracking();
    } catch (err) {
        console.warn("[ERROR] initializeDayTracking() failed:", err);
    }
});

// Note: Spawn rate management removed - now handled via spawn rules and multiple entity files

// --- Helper: Check if item is equippable by bear ---
function isEquippableByBear(typeId) {
    // List of equippable items for infected bear
    const EQUIPPABLE_IDS = new Set([
        // Helmets
        "minecraft:leather_helmet", "minecraft:chainmail_helmet", "minecraft:golden_helmet", "minecraft:iron_helmet", "minecraft:diamond_helmet", "minecraft:netherite_helmet", "minecraft:turtle_helmet",
        // Chestplates
        "minecraft:leather_chestplate", "minecraft:chainmail_chestplate", "minecraft:golden_chestplate", "minecraft:iron_chestplate", "minecraft:diamond_chestplate", "minecraft:netherite_chestplate", "minecraft:elytra",
        // Leggings
        "minecraft:leather_leggings", "minecraft:chainmail_leggings", "minecraft:golden_leggings", "minecraft:iron_leggings", "minecraft:diamond_leggings", "minecraft:netherite_leggings",
        // Boots
        "minecraft:leather_boots", "minecraft:chainmail_boots", "minecraft:golden_boots", "minecraft:iron_boots", "minecraft:diamond_boots", "minecraft:netherite_boots",
        // Shields and offhand
        "minecraft:shield", "minecraft:totem_of_undying", "minecraft:torch", "minecraft:soul_torch", "minecraft:lantern", "minecraft:soul_lantern",
        // Swords
        "minecraft:wooden_sword", "minecraft:stone_sword", "minecraft:golden_sword", "minecraft:iron_sword", "minecraft:diamond_sword", "minecraft:netherite_sword",
        // Axes
        "minecraft:wooden_axe", "minecraft:stone_axe", "minecraft:golden_axe", "minecraft:iron_axe", "minecraft:diamond_axe", "minecraft:netherite_axe",
        // Pickaxes
        "minecraft:wooden_pickaxe", "minecraft:stone_pickaxe", "minecraft:golden_pickaxe", "minecraft:iron_pickaxe", "minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe",
        // Shovels
        "minecraft:wooden_shovel", "minecraft:stone_shovel", "minecraft:golden_shovel", "minecraft:iron_shovel", "minecraft:diamond_shovel", "minecraft:netherite_shovel",
        // Hoes
        "minecraft:wooden_hoe", "minecraft:stone_hoe", "minecraft:golden_hoe", "minecraft:iron_hoe", "minecraft:diamond_hoe", "minecraft:netherite_hoe",
        // Other weapons/tools
        "minecraft:trident", "minecraft:bow", "minecraft:crossbow"
    ]);
    return EQUIPPABLE_IDS.has(typeId);
}

// --- Cure Immunity System ---
// Track players who are immune to infection after being cured
export const curedPlayers = new Map(); // playerId -> immunityEndTime
const CURE_IMMUNITY_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Test functions have been removed for playability

// --- Gameplay Item Use Handler (snow_book for infection tracking) ---
world.beforeEvents.itemUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;
    
    if (DEBUG_SNOW_MECHANICS) {
    console.log(`[SNOW DEBUG] itemUse event fired - Player: ${player?.name}, Item: ${item?.typeId}`);
    }

    // Basic Journal - GAMEPLAY FEATURE
    if (item?.typeId === "mb:basic_journal") {
        event.cancel = true;
        system.run(() => {
            // Check if this is the first time opening
            const firstTimeKey = `mb_basic_journal_first_open_${player.id}`;
            const hasOpenedBefore = world.getDynamicProperty(firstTimeKey);
            
            if (!hasOpenedBefore) {
                // First time - show welcome screen
                showFirstTimeWelcomeScreen(player);
            } else {
                // Show normal menu
                showBasicJournalUI(player);
            }
        });
        return;
    }

    // Infection Tracker Book - GAMEPLAY FEATURE
    if (item?.typeId === "mb:snow_book") {
        if (DEBUG_SNOW_MECHANICS) {
        console.log("[SNOW DEBUG] Snow book detected, canceling event");
        }
        event.cancel = true;
        system.run(() => {
            // Check for nearby players first (knowledge sharing)
            const nearbyPlayers = [];

            for (const otherPlayer of world.getAllPlayers()) {
                if (otherPlayer.id === player.id) continue; // Skip self

                const distance = Math.sqrt(
                    Math.pow(otherPlayer.location.x - player.location.x, 2) +
                    Math.pow(otherPlayer.location.y - player.location.y, 2) +
                    Math.pow(otherPlayer.location.z - player.location.z, 2)
                );

                // If player is within 3 blocks, they're close enough to share knowledge
                if (distance <= 3) {
                    nearbyPlayers.push(otherPlayer);
                }
            }

            // If there are nearby players, share knowledge first, then open codex
            if (nearbyPlayers.length > 0) {
                // Share knowledge with all nearby players (silently if on cooldown)
                for (const targetPlayer of nearbyPlayers) {
                    try {
                        shareKnowledge(player, targetPlayer);
                    } catch (error) {
                        console.error(`[ERROR] Failed to share knowledge from player ${player.id} to target ${targetPlayer.id}:`, error);
                        // Continue to next player - don't let one failure stop the loop
                    }
                }

                // Continue to open codex after sharing (no messages about cooldowns)
            }

            // No nearby players - normal codex behavior
            try { 
                const codex = getCodex(player);
                if (!codex.items.snowBookCrafted) {
                    markCodex(player, "items.snowBookCrafted");
                    // Only send message if not already sent (prevent duplicates)
                    if (!codex.items.bookCraftMessageShown) {
                        markCodex(player, "items.bookCraftMessageShown");
                    player.sendMessage("§7You feel your knowledge pulled into the book...");
                    
                    // Dramatic sound effects
                    player.playSound("mob.enderman.portal", { pitch: 0.8, volume: 1.0 });
                    player.playSound("mob.enderman.teleport", { pitch: 1.2, volume: 0.8 });
                    player.playSound("mob.wither.spawn", { pitch: 0.6, volume: 0.6 });
                    player.playSound("random.orb", { pitch: 1.5, volume: 1.0 });
                    
                    // Temporary blindness effect
                        applyEffect(player, "minecraft:blindness", 60, { amplifier: 0 });
                }
                }
            } catch { }
            showCodexBook(player, { playerInfection, curedPlayers, formatTicksDuration, formatMillisDuration, HITS_TO_INFECT, bearHitCount, maxSnowLevels, getCurrentDay, getDayDisplayInfo });
        });
        return;
    }
    
    // Snow item block conversion will be handled by itemUseAfterEvent below

    // Debug item testing features have been removed for playability
});


// Handle snow layer placement and block conversion underneath
world.afterEvents.playerPlaceBlock.subscribe((event) => {
    const block = event.block;
    
    // Only handle snow layer blocks
    if (block?.typeId === "mb:snow_layer") {
        const dim = event.player.dimension;
        const belowPos = { x: block.x, y: block.y - 1, z: block.z };
        
        const convertible = new Set([
            "minecraft:dirt",
            "minecraft:grass_block",
            "minecraft:podzol",
            "minecraft:coarse_dirt",
            "minecraft:mycelium",
            "minecraft:rooted_dirt",
            "minecraft:moss_block",
            "minecraft:farmland",
            "minecraft:dirt_path",
            "minecraft:grass_path"
        ]);

        // Check and convert block underneath
        const belowBlock = dim.getBlock(belowPos);
        if (belowBlock && convertible.has(belowBlock.typeId)) {
            system.run(() => {
                try {
                    // Check limit before converting
                    cleanupOldDustedDirt();
                    if (trackedDustedDirtBlocks.size < DUSTED_DIRT_MAX_BLOCKS) {
                        belowBlock.setType("mb:dusted_dirt");
                        
                        // Track this block
                        const key = `${belowPos.x},${belowPos.y},${belowPos.z},${dim.id}`;
                        trackedDustedDirtBlocks.set(key, { tick: system.currentTick, dimension: dim.id });
                        
                        // Register in spawn controller cache
                        registerDustedDirtBlock(belowPos.x, belowPos.y, belowPos.z, dim);
                    }
                    
                    // Add particle effect
                        dim.runCommand(`particle minecraft:snowflake ${Math.floor(belowPos.x)} ${Math.floor(belowPos.y + 1)} ${Math.floor(belowPos.z)}`); 
                    } catch (e) {
                    // Silently handle errors
                }
            });
        }
    }
});

// Track block breaks to remove dusted_dirt from cache
world.afterEvents.playerBreakBlock.subscribe((event) => {
    const permutation = event.brokenBlockPermutation;
    if (permutation && permutation.type?.id === "mb:dusted_dirt") {
        const pos = event.block.location;
        unregisterDustedDirtBlock(pos.x, pos.y, pos.z);
        // Also remove from tracked blocks
        const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)},${event.player.dimension.id}`;
        trackedDustedDirtBlocks.delete(key);
    }
});

function playerHasCheats(player) {
    try {
        if (typeof player.isOp === "function" && player.isOp()) {
            return true;
        }
    } catch { }

    const perm = player?.permissionLevel;
    if (typeof perm === "string") {
        if (perm.toLowerCase() !== "member") {
            return true;
        }
    } else if (typeof perm === "number") {
        if (perm > 0) {
            return true;
        }
    }

    try {
        if (player.hasTag && player.hasTag("mb_cheats")) {
            return true;
        }
    } catch { }

    return false;
}

function decodeCommandPayload(message) {
    if (!message) return [];
    try {
        const parsed = JSON.parse(message);
        if (parsed && typeof parsed === "object") {
            const sub = parsed.command ?? "";
            const args = Array.isArray(parsed.args) ? parsed.args.map(String) : [];
            return [sub, ...args];
        }
    } catch (err) {
        console.warn("[MBI] Failed to decode script event payload:", err);
    }
    return [];
}

function clearPlayerCodexState(player) {
    if (!player) return;

    try {
        player.setDynamicProperty("mb_codex", JSON.stringify(getDefaultCodex()));
    } catch (err) {
        console.warn(`[MBI] Failed writing default codex for ${player.name}:`, err);
    }

    const dynamicKeys = [
        "mb_first_time_messages",
        "mb_max_snow_level",
        "mb_infection",
        "mb_snow_infection",
        "mb_bear_infection",
        "mb_immunity_end",
        "mb_bear_hit_count"
    ];

    for (const key of dynamicKeys) {
        try {
            player.setDynamicProperty(key, undefined);
        } catch (err) {
            console.warn(`[MBI] Failed clearing ${key} for ${player.name}:`, err);
        }
    }

    playerInfection.delete(player.id);
    curedPlayers.delete(player.id);
    bearHitCount.delete(player.id);
    maxSnowLevels.delete(player.id);
}

/**
 * Unlocks all content that would normally unlock up to a given day
 * Used for testing when manually setting the day
 * @param {number} day The day to unlock content up to
 */
function unlockAllContentForDay(day) {
    try {
        const MILESTONE_DAYS = [2, 4, 8, 11, 13, 15, 17, 20, 25, 50, 75, 100];
        
        // Process all milestone days up to the set day
        for (const milestoneDay of MILESTONE_DAYS) {
            if (milestoneDay <= day && typeof mbiHandleMilestoneDay === 'function') {
                // Temporarily set the day to trigger milestone handling
                const originalDay = getCurrentDay();
                world.setDynamicProperty("mb_day_count", milestoneDay);
                
                // Handle milestone day
                mbiHandleMilestoneDay(milestoneDay);
                
                // Restore the actual day
                world.setDynamicProperty("mb_day_count", day);
            }
        }
        
        // Generate daily logs for each day up to the set day
        // Events are stored under the actual day they occurred (not the reflection day)
        for (let d = 1; d < day; d++) {
            // Get milestone message if this is a milestone day
            let milestoneMessage = null;
            if (MILESTONE_DAYS.includes(d)) {
                // We need to get the milestone message - it's not exported, so we'll recreate the logic
                switch (d) {
                    case 2:
                        milestoneMessage = "You notice strange, tiny white bears beginning to emerge from the shadows. Their eyes seem to follow you wherever you go, and they leave behind a peculiar white dust wherever they step. These creatures appear to be drawn to larger animals, and you've witnessed them attacking and converting other creatures into more of their kind. The infection has begun its silent spread across the land.";
                        break;
                    case 4:
                        milestoneMessage = "The tiny bears have evolved into more dangerous variants. You've observed infected Maple Bears that are larger and more aggressive than their predecessors. These creatures seem to have developed a taste for corruption, actively seeking out and transforming other animals. The white dust they leave behind has become more concentrated, and you've noticed it seems to affect the very ground they walk on.";
                        break;
                    case 8:
                        milestoneMessage = "The sky is no longer safe. You've witnessed Maple Bears taking flight, soaring through the air with an unnatural grace. These flying variants can reach places that were once thought secure, and they seem to hunt from above with terrifying precision. The infection has learned to take to the skies.";
                        break;
                    case 11:
                        milestoneMessage = "The infection continues to evolve. More dangerous variants have appeared, and the threat grows with each passing day. The white dust spreads further, and the corrupted creatures become more aggressive.";
                        break;
                    case 13:
                        milestoneMessage = "A new threat has emerged - massive Buff Maple Bears that tower over their smaller counterparts. These behemoths are incredibly dangerous and seem to possess an intelligence that the smaller variants lack. They actively hunt larger creatures and have been observed coordinating attacks. The infection has reached a critical point, with these powerful variants capable of spreading the corruption at an alarming rate.";
                        break;
                    case 15:
                        milestoneMessage = "The ground beneath your feet is no longer safe. You've discovered Maple Bears that can dig through the earth itself, tunneling towards their targets with relentless determination. These mining variants can reach you even in the deepest underground bases, and they seem to work together, creating elaborate tunnel networks. Nowhere is truly hidden from the infection.";
                        break;
                    case 17:
                        milestoneMessage = "A new terror has emerged from the skies - torpedo-like Maple Bears that dive with devastating speed and force. These creatures strike from above with such velocity that they can break through almost any defense. They seem to target with an almost supernatural accuracy, as if they can sense your presence through walls. The infection has become a predator from every angle.";
                        break;
                    case 20:
                        milestoneMessage = "The world feels hushed, as if holding its breath. Day 20 bears walk like winter's final verdict, and the dust they shed clings to the air itself. Survivors whisper that the infection now remembers every step we've taken.";
                        break;
                    case 25:
                        milestoneMessage = "You have survived. Twenty-five days of relentless infection, of watching the world transform under the weight of white dust and corrupted creatures. You stand as proof that humanity can endure even when the very ground beneath your feet turns against you. But the infection does not rest. It will only grow stronger, more relentless. The challenge continues, but you have proven yourself a true survivor.";
                        break;
                    case 50:
                        milestoneMessage = "Fifty days. The infection has become something else entirely - a force of nature that reshapes reality itself. The white dust no longer simply covers the world; it has become the world. Every surface, every breath, every moment is tainted by its presence. The bears have evolved beyond recognition, and you wonder if you're still fighting an infection, or if you're fighting the world itself.";
                        break;
                    case 75:
                        milestoneMessage = "Seventy-five days. The boundary between infection and existence has blurred beyond recognition. The world remembers everything - every step, every death, every moment of hope. The bears move with a purpose that transcends mere hunger or aggression. They are architects of a new reality, and you are both witness and participant in this transformation. The question is no longer whether you can survive, but what you will become.";
                        break;
                    case 100:
                        milestoneMessage = "One hundred days. You have reached a milestone that few could even imagine. The world you knew is gone, replaced by something that defies understanding. The infection has achieved a kind of perfection - a complete integration with reality itself. You stand at the threshold of something new, something that has never existed before. The journey continues, but you have proven that even in the face of absolute transformation, something of what you were remains. You are a survivor. You are a witness. You are part of the story that will be told long after the last bear has moved on.";
                        break;
                }
            }
            
            // Record daily events for all players
            for (const player of world.getAllPlayers()) {
                try {
                    const codex = getCodex(player);
                    
                    // Record milestone message if this is a milestone day
                    // Store under the actual day (d), not the reflection day
                    if (milestoneMessage) {
                        recordDailyEvent(player, d, milestoneMessage, "general", codex);
                    }
                    
                    // Record a general day progression message for non-milestone days
                    // Day 1 gets a special message, other days get progression messages
                    if (!milestoneMessage) {
                        let generalMessage;
                        if (d === 1) {
                            generalMessage = "The first day has passed. You've noticed strange changes in the world around you, though you can't quite put your finger on what's different.";
                        } else {
                            generalMessage = `Day ${d} has passed. The infection continues to evolve, and the world grows more dangerous with each sunrise.`;
                        }
                        recordDailyEvent(player, d, generalMessage, "general", codex);
                    }
                    
                    saveCodex(player, codex);
                } catch (error) {
                    console.warn(`[MBI] Failed to record daily log for day ${d} for ${player.name}:`, error);
                }
            }
        }
        
        // Unlock variants and other content for all players based on the day
        for (const player of world.getAllPlayers()) {
            try {
                const codex = getCodex(player);
                
                // Ensure mobs are marked as seen if day is high enough (for variant unlocks)
                if (day >= 2 && !codex.mobs.mapleBearSeen) {
                    codex.mobs.mapleBearSeen = true;
                }
                if (day >= 4 && !codex.mobs.infectedBearSeen) {
                    codex.mobs.infectedBearSeen = true;
                }
                if (day >= 13 && !codex.mobs.buffBearSeen) {
                    codex.mobs.buffBearSeen = true;
                }
                if (day >= 8 && !codex.mobs.flyingBearSeen) {
                    codex.mobs.flyingBearSeen = true;
                }
                
                // Unlock variants based on day
                checkVariantUnlock(player, codex);
                
                // Unlock Day 20+ lore entries if day >= 20
                if (day >= 20) {
                    if (!codex.journal) {
                        codex.journal = {};
                    }
                    
                    // Day 20 world lore (unlocked at milestone)
                    if (!codex.journal.day20WorldLoreUnlocked) {
                        codex.journal.day20WorldLoreUnlocked = true;
                        const reflectionDay = day + 1;
                        const loreEntry = "Day 20 pressed down like a heavy frost. The journal insists the world remembers our missteps.";
                        recordDailyEvent(player, reflectionDay, loreEntry, "lore", codex);
                    }
                    
                    // Day 20+ variant lore (unlocked when variants are seen/killed)
                    // These will unlock naturally when players encounter the variants
                    // But we can pre-unlock them for testing if desired
                    // (Commented out - let them unlock naturally through encounters)
                }
                
                // Unlock Day 25 victory achievement if day >= 25
                if (day >= 25) {
                    if (!codex.achievements) {
                        codex.achievements = {};
                    }
                    if (!codex.achievements.day25Victory) {
                        codex.achievements.day25Victory = true;
                        codex.achievements.day25VictoryDate = day;
                    }
                    
                    // Update max days survived
                    if (!codex.achievements.maxDaysSurvived || codex.achievements.maxDaysSurvived < day) {
                        codex.achievements.maxDaysSurvived = day;
                    }
                }
                
                saveCodex(player, codex);
            } catch (error) {
                console.warn(`[MBI] Failed to unlock content for ${player.name}:`, error);
            }
        }
        
        console.log(`[MBI] Unlocked all content up to day ${day} for testing, including daily logs.`);
    } catch (error) {
        console.warn("[MBI] Error unlocking content for day:", error);
    }
}

const SPAWN_DIFFICULTY_PROPERTY = "mb_spawnDifficulty";

function describeSpawnDifficultyLabel(value) {
    if (value === -1) return "Easy";
    if (value === 0) return "Normal";
    if (value === 1) return "Hard";
    return value > 0 ? `Custom +${value}` : `Custom ${value}`;
}

function applySpawnDifficulty(value, sender) {
    const clamped = Math.max(-5, Math.min(5, value));
    world.setDynamicProperty(SPAWN_DIFFICULTY_PROPERTY, clamped);
    sender?.sendMessage?.(`§7[MBI] Spawn difficulty set to ${describeSpawnDifficultyLabel(clamped)} (§f${clamped}§7).`);
}

function executeMbCommand(sender, subcommand, args = []) {
    if (!sender || !playerHasCheats(sender)) {
        sender?.sendMessage?.("§7[MBI] You lack permission to run Maple Bear debug commands.");
        return;
    }

    const lower = (subcommand || "").toLowerCase();
    switch (lower) {
        case "reset_codex": {
            const targetName = args[0];
            if (targetName) {
                const target = world.getAllPlayers().find(p => p.name === targetName);
                if (!target) {
                    sender.sendMessage(`§7[MBI] No player named ${targetName} found.`);
                    return;
                }
                clearPlayerCodexState(target);
                sender.sendMessage(`§7[MBI] Reset codex data for ${target.name}.`);
                target.sendMessage("§7[MBI] Your Powdery Journal feels blank again.");
            } else {
                clearPlayerCodexState(sender);
                sender.sendMessage("§7[MBI] Your Powdery Journal data has been reset.");
            }
            return;
        }
        case "reset_day":
        case "reset_daycount": {
            world.setDynamicProperty("mb_day_count", 1);
            sender.sendMessage("§7[MBI] Day counter reset to 1.");
            return;
        }
        case "set_day": {
            const dayNumber = parseInt(args[0], 10);
            if (Number.isNaN(dayNumber) || dayNumber < 1) {
                sender.sendMessage("§7[MBI] Usage: /scriptevent mb:cmd <base64('set_day\u0001<number>')>");
                return;
            }
            // Use setCurrentDay to ensure both dynamic property and scoreboard are updated
            setCurrentDay(dayNumber);
            sender.sendMessage(`§7[MBI] Forced current day to ${dayNumber}.`);
            
            // Unlock all content that would normally unlock up to this day
            unlockAllContentForDay(dayNumber);
            
            return;
        }
        case "set_spawn_difficulty": {
            const mode = (args[0] ?? "normal").toLowerCase();
            let value = 0;
            if (mode === "easy") value = -1;
            else if (mode === "hard") value = 1;
            applySpawnDifficulty(value, sender);
            return;
        }
        case "set_spawn_difficulty_value": {
            const raw = parseInt(args[0], 10);
            if (Number.isNaN(raw)) {
                sender.sendMessage("§7[MBI] Usage: set_spawn_difficulty_value <number between -5 and 5>");
                return;
            }
            applySpawnDifficulty(raw, sender);
            return;
        }
        default:
            sender.sendMessage("§7[MBI] Unknown debug command.");
            return;
    }
}

if (system.afterEvents && system.afterEvents.scriptEventReceive) {
    system.afterEvents.scriptEventReceive.subscribe((event) => {
        if (!event || event.sourceType !== "Player") return;
        const player = event.sourceEntity;
        if (!playerHasCheats(player)) {
            player.sendMessage("§7[MBI] You lack permission to run Maple Bear debug commands.");
            return;
        }

        const id = event.id ?? "";
        if (id !== "mb:cmd") return;

        const [subcommand, ...args] = decodeCommandPayload(event.message);
        executeMbCommand(player, subcommand, args);
    });
}

try {
    globalThis.mbExecuteDebugCommand = (sender, subcommand, args = []) => {
        executeMbCommand(sender, subcommand, args);
    };
} catch (err) {
    console.warn("[MBI] Failed to expose debug command bridge:", err);
}

// --- Initialize Basic Journal for Existing Players on Script Load ---
// This ensures players who load into an existing world (not joining) also get the journal
system.runTimeout(() => {
    try {
        const allPlayers = world.getAllPlayers();
        for (const player of allPlayers) {
            if (player && player.isValid) {
                giveBasicJournalIfNeeded(player);
            }
        }
    } catch (error) {
        console.warn(`[BASIC JOURNAL] Error initializing journals for existing players:`, error);
    }
}, 100); // 5 second delay to ensure world is fully loaded


