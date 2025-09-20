import { world, system, EntityTypes, Entity, Player, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getCodex, markCodex, showCodexBook, saveCodex } from "./mb_codex.js";
import { initializeDayTracking, getCurrentDay, getInfectionMessage } from "./mb_dayTracker.js";

// NOTE: Debug and testing features have been commented out for playability
// To re-enable testing features, uncomment the following sections:
// - Test functions (testWeaknessDetection, addWeaknessToPlayer, checkInfectionStatus)
// - Debug item use handler (book, paper, map, compass testing)
// - Test command handler (!testeffects, !addweakness, !infection, !weakness, !removeimmunity, !spawnrate)

// Constants for Maple Bear behavior
const MAPLE_BEAR_ID = "mb:mb";
const MAPLE_BEAR_DAY4_ID = "mb:mb_day4";
const MAPLE_BEAR_DAY8_ID = "mb:mb_day8";
const INFECTED_BEAR_ID = "mb:infected";
const INFECTED_BEAR_DAY8_ID = "mb:infected_day8";
const BUFF_BEAR_ID = "mb:buff_mb";
const INFECTED_PIG_ID = "mb:infected_pig";
const SNOW_ITEM_ID = "mb:snow";
const INFECTED_TAG = "mb_infected";
const INFECTED_CORPSE_ID = "mb:infected_corpse";
const SNOW_LAYER_BLOCK = "minecraft:snow_layer";

// Progressive Infection Rate System
function getInfectionRate(day) {
    if (day < 2) return 0; // No infection before day 2
    if (day === 2) return 0.20; // 20% on day 2
    if (day === 3) return 0.30; // 30% on day 3
    if (day === 4) return 0.40; // 40% on day 4
    if (day === 5) return 0.40; // 40% on day 5
    if (day === 6) return 0.50; // 50% on day 6
    if (day === 7) return 0.50; // 50% on day 7
    if (day === 8) return 0.60; // 60% on day 8
    
    // After day 8, increase by 10% every 5 days
    const daysAfter8 = day - 8;
    const rateIncrease = Math.floor(daysAfter8 / 5) * 0.10;
    const baseRate = 0.60;
    const finalRate = Math.min(baseRate + rateIncrease, 1.0); // Cap at 100%
    
    return finalRate;
}

// --- Player Codex (Unlock System) ---

// Use the getCodex function from mb_codex.js

// Use the saveCodex function from mb_codex.js

function markCodex(player, path, timestamp = false) {
    const codex = getCodex(player);
    const parts = path.split(".");
    let ref = codex;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (typeof ref[key] !== "object" || ref[key] === null) ref[key] = {};
        ref = ref[key];
    }
    const leaf = parts[parts.length - 1];
    if (timestamp) {
        ref[leaf] = Date.now();
    } else {
        ref[leaf] = true;
    }
    saveCodex(player, codex);
}

// --- Bear Symptom Scaling ---
const lastSymptomTick = new Map(); // playerId -> last tick applied
function getSymptomLevel(ticksLeft) {
    const total = INFECTION_TICKS;
    const ratio = Math.max(0, Math.min(1, (ticksLeft || 0) / total));
    if (ratio > 0.75) return 0; // none
    if (ratio > 0.5) return 1;  // mild
    if (ratio > 0.2) return 2;  // moderate
    return 3;                   // severe
}

// Note: Spawn rate progression now handled via spawn rules and multiple entity files
// Different entity files will have different spawn weights and day requirements

// Freaky effects for the tiny mb bear
const FREAKY_EFFECTS = [
    { effect: "minecraft:blindness", duration: 20, amplifier: 1 },
    { effect: "minecraft:poison", duration: 15, amplifier: 1 }
];

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
// Remove: transformingPlayers, playerInventories, infectedPlayers, isHandlingDeath, recentlyHandledInfectedDeaths, lastAttackerMap, isPlayerInfected, infectPlayer, handleInfectedDeath, prepareInfectedTransformation, simulateInfectedDeath, simulateGenericInfectedDeath, and all related transformation logic.
// Only keep the bear death handler for item corruption, and normal event listeners for item use, etc.

// Track player inventories for clone drops
const playerInventories = new Map();

// Track infected players
const infectedPlayers = new Set();

// Track if we're currently handling a death to prevent double spawning
let isHandlingDeath = false;
// Prevent double-handling of infected deaths
const recentlyHandledInfectedDeaths = new Set();

// Track last attacker for each player
const lastAttackerMap = new Map();

// --- Unified Infection System Data ---
const playerInfection = new Map(); // playerId -> { ticksLeft, snowCount, hitCount, cured }
const bearHitCount = new Map(); // playerId -> hitCount (tracks hits before infection)
const firstTimeMessages = new Map(); // playerId -> { hasBeenHit: false, hasBeenInfected: false, snowTier: 0 }
const maxSnowLevels = new Map(); // playerId -> { maxLevel: 0, achievedAt: timestamp }
const INFECTION_TICKS = 24000 * 2; // 2 Minecraft days (much faster death)
const HITS_TO_INFECT = 3; // Number of hits required to get infected
const RANDOM_EFFECT_INTERVAL = 600; // Check every 30 seconds

// --- Helper: Deceptive Snow Consumption Mechanics ---
function getSnowTimeEffect(ticksLeft, snowCount) {
    const totalTicks = INFECTION_TICKS;
    const timeRatio = ticksLeft / totalTicks; // 1.0 = full time, 0.0 = about to die
    
    // Early stages: Snow is helpful (adds time)
    if (timeRatio > 0.7) {
        // Very early: Adds significant time
        return Math.floor(totalTicks * 0.1); // Adds 10% of total time
    } else if (timeRatio > 0.4) {
        // Mid-early: Adds moderate time
        return Math.floor(totalTicks * 0.05); // Adds 5% of total time
    } else if (timeRatio > 0.2) {
        // Late-early: Adds small time
        return Math.floor(totalTicks * 0.02); // Adds 2% of total time
    } else {
        // Critical stage: Snow becomes harmful (reduces time)
        const harmAmount = Math.floor(totalTicks * 0.1 * (1 - timeRatio)); // More harmful as time runs out
        return -harmAmount; // Negative = reduces time
    }
}

function trackBearKill(player, bearType) {
    try {
        const codex = getCodex(player);
        
        // Track kills based on bear type and unlock discovery
        if (bearType === MAPLE_BEAR_ID || bearType === MAPLE_BEAR_DAY4_ID || bearType === MAPLE_BEAR_DAY8_ID) {
            codex.mobs.tinyBearKills = (codex.mobs.tinyBearKills || 0) + 1;
            // Unlock tiny bear discovery
            markCodex(player, "mobs.mapleBearSeen");
        } else if (bearType === INFECTED_BEAR_ID || bearType === INFECTED_BEAR_DAY8_ID) {
            codex.mobs.infectedBearKills = (codex.mobs.infectedBearKills || 0) + 1;
            // Unlock infected bear discovery
            markCodex(player, "mobs.infectedBearSeen");
        } else if (bearType === BUFF_BEAR_ID) {
            codex.mobs.buffBearKills = (codex.mobs.buffBearKills || 0) + 1;
            // Unlock buff bear discovery
            markCodex(player, "mobs.buffBearSeen");
        } else if (bearType === INFECTED_PIG_ID) {
            codex.mobs.infectedPigKills = (codex.mobs.infectedPigKills || 0) + 1;
            console.log(`[KILL] Player ${player.name} killed infected pig (total: ${codex.mobs.infectedPigKills})`);
            // Unlock infected pig discovery
            console.log(`[KILL] Codex before markCodex: ${JSON.stringify(codex.mobs)}`);
            markCodex(player, "mobs.infectedPigSeen");
            console.log(`[KILL] Codex after markCodex: ${JSON.stringify(getCodex(player).mobs)}`);
        }
        
        saveCodex(player, codex);
    } catch (error) {
        console.warn("Error tracking bear kill:", error);
    }
}

function checkVariantUnlock(player) {
    try {
        const codex = getCodex(player);
        const currentDay = getCurrentDay();
        
        // Check if day 4+ variants should be unlocked (1 day after they start spawning)
        if (currentDay >= 5 && !codex.mobs.day4VariantsUnlocked) {
            // Only unlock if player has seen the base type
            if (codex.mobs.mapleBearSeen || codex.mobs.infectedBearSeen) {
                codex.mobs.day4VariantsUnlocked = true;
                saveCodex(player, codex);
            }
        }
        
        // Check if day 8+ variants should be unlocked (1 day after they start spawning)
        if (currentDay >= 9 && !codex.mobs.day8VariantsUnlocked) {
            // Only unlock if player has seen any bear type
            if (codex.mobs.mapleBearSeen || codex.mobs.infectedBearSeen || codex.mobs.buffBearSeen) {
                codex.mobs.day8VariantsUnlocked = true;
                saveCodex(player, codex);
            }
        }
    } catch (error) {
        console.warn("Error checking variant unlock:", error);
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
        } catch {}
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
    } catch (error) {
        console.warn(`[HISTORY] Error tracking infection history for ${player.name}: ${error}`);
    }
}


// --- Helper: Convert mob to Maple Bear based on size and day ---
function convertMobToMapleBear(deadMob, killer) {
    try {
        const mobType = deadMob.typeId;
        const killerType = killer.typeId;
        const location = deadMob.location;
        const currentDay = getCurrentDay();
        
        // Determine Maple Bear type to spawn based on killer, mob size, and current day
        let newBearType;
        let bearSize = "normal";
        
        // Buff Maple Bears always spawn normal human-sized Maple Bears
        if (killerType === BUFF_BEAR_ID) {
            newBearType = MAPLE_BEAR_ID;
            bearSize = "normal";
        } else if (killerType === MAPLE_BEAR_ID || killerType === MAPLE_BEAR_DAY4_ID || killerType === MAPLE_BEAR_DAY8_ID) {
            // Tiny Maple Bears behavior changes based on day
            console.log(`[CONVERSION] Tiny bear detected (${killerType}), current day: ${currentDay}`);
            if (currentDay < 4) {
                // Before day 4: Tiny Maple Bears always spawn tiny Maple Bears (regardless of victim size)
                newBearType = MAPLE_BEAR_ID; // Always spawn tiny Maple Bear (mb:mb)
                bearSize = "tiny";
                console.log(`[CONVERSION] Pre-day 4: Tiny bear spawning tiny bear (${newBearType})`);
            } else if (currentDay < 8) {
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
            } else {
                // Day 8+: Tiny Maple Bears use size-based system with day 8+ variants
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
            }
        } else {
            // Normal/Infected Maple Bears spawn based on victim's size and day
            const mobSize = getMobSize(mobType);
            
            if (mobSize === "tiny") {
                // Choose appropriate tiny bear variant based on day
                if (currentDay < 4) {
                    newBearType = MAPLE_BEAR_ID; // Original tiny bears
                } else if (currentDay < 8) {
                    newBearType = MAPLE_BEAR_DAY4_ID; // Day 4+ tiny bears
                } else {
                    newBearType = MAPLE_BEAR_DAY8_ID; // Day 8+ tiny bears
                }
                bearSize = "tiny";
            } else if (mobSize === "large") {
                // Large mobs become Buff Maple Bears if it's day 8+
                if (currentDay >= 8) {
                    newBearType = BUFF_BEAR_ID;
                    bearSize = "buff";
                } else {
                    newBearType = INFECTED_BEAR_ID; // infected.json for normal bears
                    bearSize = "normal";
                }
            } else {
                // Choose appropriate normal bear variant based on day
                if (currentDay >= 8) {
                    newBearType = INFECTED_BEAR_DAY8_ID; // Day 8+ normal bears
                } else {
                    newBearType = INFECTED_BEAR_ID; // Original normal bears
                }
                bearSize = "normal";
            }
        }
        
        // Spawn the new Maple Bear
        const newBear = world.getDimension("overworld").spawnEntity(newBearType, location);
        
        // Note: Entity type ID determines the bear type (mb:mb = tiny, mb:infected = normal, mb:buff_mb = buff)
        
        console.log(`[CONVERSION] Day ${currentDay}: ${mobType} killed by ${killerType} → spawned ${newBearType} (${bearSize})`);
        
        // Add some visual feedback
        world.getDimension("overworld").spawnParticle("mb:white_dust_particale", location);
        
    } catch (error) {
        console.warn("Error converting mob to Maple Bear:", error);
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
    
    // Large/boss mobs that should spawn Buff Maple Bears (day 8+)
    const largeMobs = [
        "minecraft:warden", "minecraft:sniffer", "minecraft:ravager", "minecraft:iron_golem", "minecraft:shulker",
        "minecraft:elder_guardian", "minecraft:ender_dragon", "minecraft:wither", "minecraft:ghast"
    ];
    
    // Normal-sized mobs (horses, cows, etc.) - these should spawn normal Maple Bears
    const normalMobs = [
        "minecraft:horse", "minecraft:cow", "minecraft:mooshroom", "minecraft:llama",
        "minecraft:donkey", "minecraft:mule", "minecraft:pig", "minecraft:sheep",
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
    } else if (normalMobs.includes(mobType)) {
        return "normal";
    } else {
        return "normal"; // Default size for most mobs
    }
}

// Note: Spawn rate calculation removed - now handled via spawn rules and multiple entity files

// --- Helper: Apply random effect ---
function applyRandomEffect(player) {
    const effects = [
        // Good
        { effect: "minecraft:speed", duration: 200, amplifier: 1 },
        { effect: "minecraft:jump_boost", duration: 200, amplifier: 1 },
        { effect: "minecraft:regeneration", duration: 100, amplifier: 1 },
        // { effect: "minecraft:luck", duration: 300, amplifier: 0 }, // Not in Bedrock
        // Bad
        { effect: "minecraft:slowness", duration: 200, amplifier: 1 },
        { effect: "minecraft:weakness", duration: 200, amplifier: 1 },
        { effect: "minecraft:blindness", duration: 100, amplifier: 0 },
        { effect: "minecraft:nausea", duration: 100, amplifier: 0 },
        { effect: "minecraft:poison", duration: 100, amplifier: 0 },
        { effect: "minecraft:hunger", duration: 200, amplifier: 1 },
    ];
    const chosen = effects[Math.floor(Math.random() * effects.length)];
    try {
        player.addEffect(chosen.effect, chosen.duration, { amplifier: chosen.amplifier });
    } catch (e) {
        // Silently ignore invalid effects
    }
}

// --- Helper: Apply random potion effect for snow consumption ---
function applyRandomPotionEffect(player, duration) {
    const effects = [
        // Good effects
        { effect: "minecraft:speed", amplifier: 1 },
        { effect: "minecraft:jump_boost", amplifier: 1 },
        { effect: "minecraft:regeneration", amplifier: 1 },
        { effect: "minecraft:strength", amplifier: 1 },
        { effect: "minecraft:resistance", amplifier: 1 },
        { effect: "minecraft:fire_resistance", amplifier: 0 },
        { effect: "minecraft:water_breathing", amplifier: 0 },
        { effect: "minecraft:night_vision", amplifier: 0 },
        // Bad effects
        { effect: "minecraft:slowness", amplifier: 1 },
        { effect: "minecraft:weakness", amplifier: 1 },
        { effect: "minecraft:blindness", amplifier: 0 },
        { effect: "minecraft:nausea", amplifier: 0 },
        { effect: "minecraft:poison", amplifier: 1 },
        { effect: "minecraft:hunger", amplifier: 1 },
        { effect: "minecraft:mining_fatigue", amplifier: 1 },
        // removed wither per design
    ];
    const chosen = effects[Math.floor(Math.random() * effects.length)];
    try {
        player.addEffect(chosen.effect, duration, { amplifier: chosen.amplifier });
        console.log(`[SNOW] Applied ${chosen.effect} (amplifier ${chosen.amplifier}) for ${Math.floor(duration / 20)} seconds to ${player.name}`);
    } catch (e) {
        console.warn(`[SNOW] Error applying random effect ${chosen.effect}: ${e}`);
    }
}

// Apply a random snow effect with scaled duration and amplifier
function applyRandomSnowEffectScaled(player, duration, amplifier) {
    const effects = [
        // Bad-leaning set for snow
        { effect: "minecraft:slowness" },
        { effect: "minecraft:weakness" },
        { effect: "minecraft:blindness" },
        { effect: "minecraft:nausea" },
        { effect: "minecraft:hunger" },
        { effect: "minecraft:mining_fatigue" }
    ];
    const chosen = effects[Math.floor(Math.random() * effects.length)];
    try {
        player.addEffect(chosen.effect, duration, { amplifier: Math.max(0, Math.min(3, amplifier || 0)) });
        console.log(`[SNOW] Applied scaled ${chosen.effect} (amp ${Math.max(0, Math.min(3, amplifier || 0))}) for ${Math.floor((duration||0)/20)}s to ${player.name}`);
    } catch (e) {
        console.warn(`[SNOW] Error applying scaled effect ${chosen.effect}: ${e}`);
    }
}

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
        // console.log("Equipment component not available:", error); // Removed debug
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

// Handle weakness potion and enchanted golden apple consumption
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;

    // Handle weakness potion detection
    if (item?.typeId === "minecraft:potion") {
        try {
            // Check if it's a weakness potion by looking at the potion data
            const potionData = item.data || 0;
            console.log(`[POTION] Player ${player.name} drank a potion with data: ${potionData}`);

            // Weakness potion data values (need to verify these):
            // Let's try a broader range and log all potion data to find the correct values
            if (potionData >= 18 && potionData <= 20) {
                console.log(`[POTION] Player ${player.name} drank a weakness potion (data: ${potionData})`);
                player.sendMessage("§eYou feel weak... This might help with curing infections!");
            } else {
                // Log all potion data to help identify weakness potions
                console.log(`[POTION] Unknown potion data: ${potionData} - please check if this is a weakness potion`);
            }
        } catch (error) {
            console.warn("Error handling weakness potion:", error);
        }
    }

    // Handle enchanted golden apple consumption for cure system
    if (item?.typeId === "minecraft:enchanted_golden_apple") {
        console.log(`[APPLE] Player ${player.name} consumed a golden apple`);

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
                    player.sendMessage("§aYou have cured your infection!");
                    
                    // Track cure history
                    trackInfectionHistory(player, "cured");

                    // Grant immunity for 5 minutes
                    const immunityEndTime = Date.now() + CURE_IMMUNITY_DURATION;
                    curedPlayers.set(player.id, immunityEndTime);
                    console.log(`[CURE] Granted ${player.name} immunity until ${new Date(immunityEndTime).toLocaleTimeString()}`);

                    // IMMEDIATELY save the cure data to dynamic properties
                    saveInfectionData(player);
                    console.log(`[CURE] Immediately saved cure data for ${player.name}`);

                    // Note: We do NOT remove the weakness effect - let it run its course naturally
                    player.sendMessage("§eYou are now immune... maybe?");
                    try { markCodex(player, "cures.bearCureKnown"); markCodex(player, "cures.bearCureDoneAt", true); markCodex(player, "items.cureItemsSeen"); } catch {}
                });
            } else {
                system.run(() => {
                    player.sendMessage("§eYou need to have weakness to be cured...");
                });
            }
        } else {
            // Player is not infected
            system.run(() => {
                player.sendMessage("§aYou are not currently infected.");
            });
        }
    }
});

// Handle entity death: player infection and mob conversion
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    const source = event.damageSource;
    
    // --- MOB CONVERSION SYSTEM ---
    // If a Maple Bear killed a mob, convert it to a Maple Bear
    if (source && source.damagingEntity && !(entity instanceof Player)) {
        const killer = source.damagingEntity;
        const killerType = killer.typeId;
        
        // Check if killer is a Maple Bear or infected pig
        if (killerType === MAPLE_BEAR_ID || killerType === MAPLE_BEAR_DAY4_ID || killerType === MAPLE_BEAR_DAY8_ID || killerType === INFECTED_BEAR_ID || killerType === INFECTED_BEAR_DAY8_ID || killerType === BUFF_BEAR_ID || killerType === INFECTED_PIG_ID) {
            // Progressive conversion rate based on current day
            const currentDay = getCurrentDay();
            const conversionRate = getInfectionRate(currentDay);
            
            console.log(`[CONVERSION] Maple Bear killing mob on day ${currentDay} (${Math.round(conversionRate * 100)}% conversion rate)`);
            
            if (Math.random() < conversionRate) {
                system.run(() => {
                    convertMobToMapleBear(entity, killer);
                });
            }
            // Unlock mob sightings for nearby players
            for (const p of world.getAllPlayers()) {
                if (!p || !p.dimension || p.dimension.id !== killer.dimension.id) continue;
                const dx = p.location.x - killer.location.x;
                const dy = p.location.y - killer.location.y;
                const dz = p.location.z - killer.location.z;
                if (dx * dx + dy * dy + dz * dz <= 64 * 64) {
                    if (killerType === MAPLE_BEAR_ID || killerType === MAPLE_BEAR_DAY4_ID || killerType === MAPLE_BEAR_DAY8_ID) markCodex(p, "mobs.mapleBearSeen");
                    if (killerType === INFECTED_BEAR_ID || killerType === INFECTED_BEAR_DAY8_ID) markCodex(p, "mobs.infectedBearSeen");
                    if (killerType === INFECTED_PIG_ID) markCodex(p, "mobs.infectedPigSeen");
                    if (killerType === BUFF_BEAR_ID) markCodex(p, "mobs.buffBearSeen");
                }
            }
        }
    }
    
    // --- KILL TRACKING FOR MAPLE BEARS ---
    // Track when a Maple Bear is killed by a player
    if (source && source.damagingEntity instanceof Player && !(entity instanceof Player)) {
        const entityType = entity.typeId;
        if (entityType === MAPLE_BEAR_ID || entityType === MAPLE_BEAR_DAY4_ID || entityType === MAPLE_BEAR_DAY8_ID || 
            entityType === INFECTED_BEAR_ID || entityType === INFECTED_BEAR_DAY8_ID || entityType === BUFF_BEAR_ID || entityType === INFECTED_PIG_ID) {
            trackBearKill(source.damagingEntity, entityType);
        }
    }
    
    // --- PLAYER INFECTION SYSTEM ---
    if (entity instanceof Player) {
        // If player is infected, handle the full transformation
        if (entity.hasTag(INFECTED_TAG)) {
            try {
                handleInfectedDeath(entity);
            } catch (error) {
                console.warn("Error handling infected player death:", error);
            }
        }
        // Remove infection tag on death (will also be removed on respawn)
        entity.removeTag(INFECTED_TAG);
    }
    // Bear death corruption logic: corrupt ALL items in inventory AND equipment
    if (entity.typeId === INFECTED_BEAR_ID) {
        try {
            // 1. Corrupt all inventory items
            const inventoryComp = entity.getComponent("inventory");
            let items = [];
            if (inventoryComp && inventoryComp.container) {
                for (let i = 0; i < inventoryComp.container.size; i++) {
                    const item = inventoryComp.container.getItem(i);
                    if (item) {
                        items.push({
                            typeId: item.typeId,
                            amount: item.amount,
                            data: item.data || 0
                        });
                        // Remove the item from the inventory
                        inventoryComp.container.setItem(i, undefined);
                    }
                }
            }
            // 2. Corrupt all equipped items
            const equipmentComp = entity.getComponent("equipment");
            if (equipmentComp) {
                const equipSlots = ["head", "chest", "legs", "feet", "mainhand", "offhand"];
                for (const slot of equipSlots) {
                    const equipSlot = equipmentComp.getEquipmentSlot(slot);
                    if (equipSlot) {
                        const item = equipSlot.getItem();
                        if (item) {
                            items.push({
                                typeId: item.typeId,
                                amount: item.amount,
                                data: item.data || 0
                            });
                            // Remove the item from the slot
                            equipSlot.setItem(undefined);
                        }
                    }
                }
            }
            if (items.length === 0) {
                return;
            }
            // Corrupt ALL items into snow
            for (const entry of items) {
                for (let n = 0; n < (entry.amount || 1); n++) {
                    const dropLocation = {
                        x: entity.location.x + Math.random() - 0.5,
                        y: entity.location.y + 0.5,
                        z: entity.location.z + Math.random() - 0.5
                    };
                    const snowItem = new ItemStack("mb:snow", 1);
                    entity.dimension.spawnItem(snowItem, dropLocation);
                    try {
                        entity.dimension.runCommand(`particle minecraft:snowflake ${Math.round(dropLocation.x)} ${Math.round(dropLocation.y)} ${Math.round(dropLocation.z)}`);
                    } catch (error) { }
                }
            }
        } catch (error) {
            console.warn("Error handling infected bear death (all corrupt test):", error);
        }
    }
});



// --- Bear Infection: On hit by Maple Bear ---
world.afterEvents.entityHurt.subscribe((event) => {
    const player = event.hurtEntity;
    const source = event.damageSource;
    if (!(player instanceof Player)) return;

                const mapleBearTypes = [MAPLE_BEAR_ID, MAPLE_BEAR_DAY4_ID, MAPLE_BEAR_DAY8_ID, INFECTED_BEAR_ID, INFECTED_BEAR_DAY8_ID, BUFF_BEAR_ID, INFECTED_PIG_ID];
    if (source && source.damagingEntity && mapleBearTypes.includes(source.damagingEntity.typeId)) {
        // If already infected (bear or snow), do not progress hit counter; instead reduce active timer by half of a snow-eat reduction
        try {
            const infectionState = playerInfection.get(player.id);
            const hasActiveInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
            
            if (hasActiveInfection) {
                // Increase snow severity based on Maple Bear type
                let snowIncrease = 0.25; // Default for tiny Maple Bears (1/4 of snow consumption)
                if (source.damagingEntity.typeId === INFECTED_BEAR_ID || source.damagingEntity.typeId === INFECTED_BEAR_DAY8_ID || source.damagingEntity.typeId === INFECTED_PIG_ID) {
                    snowIncrease = 0.5; // Infected Maple Bears and infected pigs (1/2 of snow consumption)
                } else if (source.damagingEntity.typeId === BUFF_BEAR_ID) {
                    snowIncrease = 1.0; // Buff Maple Bears (1 whole snow consumption)
                }
                
                // Update snow count
                infectionState.snowCount = (infectionState.snowCount || 0) + snowIncrease;
                
                // Reduce timer by a small amount (half of what snow consumption would do)
                const timeReduction = Math.max(1, Math.floor(INFECTION_TICKS * 0.01)); // 1% of total time
                infectionState.ticksLeft = Math.max(0, infectionState.ticksLeft - timeReduction);
                playerInfection.set(player.id, infectionState);
                
                // Update maximum snow level achieved
                updateMaxSnowLevel(player, infectionState.snowCount);
                
                // Check for immediate death
                if (infectionState.ticksLeft <= 0) {
                    try { player.kill(); } catch {}
                    try {
                        const bear = player.dimension.spawnEntity(INFECTED_BEAR_ID, player.location);
                        if (bear) { bear.nameTag = `§4! ${player.name}'s Infected Form`; bear.setDynamicProperty("infected_by", player.id); }
                        player.dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${player.name} transformed into a Maple Bear!"}]}`);
                    } catch {}
                    player.removeTag(INFECTED_TAG);
                    playerInfection.delete(player.id);
                } else if (infectionState.ticksLeft <= 1200 && !infectionState.warningSent) { // 1 minute before transformation
                    // Send warning message a minute before transformation
                    player.sendMessage("§4You don't feel so good...");
                    infectionState.warningSent = true;
                    playerInfection.set(player.id, infectionState);
                }
                    return;
                }
        } catch {}
        // Mob discovery on being hit
        try {
            console.log(`[HIT] Player ${player.name} hit by ${source.damagingEntity.typeId}`);
            if (source.damagingEntity.typeId === MAPLE_BEAR_ID || source.damagingEntity.typeId === MAPLE_BEAR_DAY4_ID || source.damagingEntity.typeId === MAPLE_BEAR_DAY8_ID) {
                console.log(`[HIT] Unlocking maple bear for ${player.name}`);
                markCodex(player, "mobs.mapleBearSeen");
            }
            if (source.damagingEntity.typeId === INFECTED_BEAR_ID || source.damagingEntity.typeId === INFECTED_BEAR_DAY8_ID) {
                console.log(`[HIT] Unlocking infected bear for ${player.name}`);
                markCodex(player, "mobs.infectedBearSeen");
            }
            if (source.damagingEntity.typeId === INFECTED_PIG_ID) {
                console.log(`[HIT] Unlocking infected pig for ${player.name}`);
                markCodex(player, "mobs.infectedPigSeen");
                // Also mark the codex as saved
                const codex = getCodex(player);
                console.log(`[HIT] Codex before save: ${JSON.stringify(codex.mobs)}`);
                saveCodex(player, codex);
                console.log(`[HIT] Codex after save: ${JSON.stringify(getCodex(player).mobs)}`);
            }
            if (source.damagingEntity.typeId === BUFF_BEAR_ID) {
                console.log(`[HIT] Unlocking buff bear for ${player.name}`);
                markCodex(player, "mobs.buffBearSeen");
            }
            
            // If player is infected and gets hit by Maple Bear, unlock snow level display
            const infectionState = playerInfection.get(player.id);
            const hasActiveInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
            if (hasActiveInfection) {
                markCodex(player, "items.snowFound");
                markCodex(player, "items.snowIdentified");
            }
        } catch {}
        // Check if player is immune to infection
        if (isPlayerImmune(player)) {
            console.log(`[INFECTION] ${player.name} is immune to infection, hit ignored`);
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

        // Check if this hit causes infection
        if (newHitCount >= HITS_TO_INFECT) {
            // Apply strong immediate effects at infection moment (3rd hit)
            try {
                player.addEffect("minecraft:blindness", 200, { amplifier: 0 });
                player.addEffect("minecraft:nausea", 200, { amplifier: 0 });
                player.addEffect("minecraft:mining_fatigue", 200, { amplifier: 0 });
            } catch {}
            // Player is now infected
            playerInfection.set(player.id, { ticksLeft: INFECTION_TICKS, cured: false, hitCount: newHitCount, snowCount: 0 });
            player.addTag(INFECTED_TAG);
            
            // Track infection history
            trackInfectionHistory(player, "infected");
            
            // Get first-time message state
            const firstTime = firstTimeMessages.get(player.id) || { hasBeenHit: false, hasBeenInfected: false, snowTier: 0 };
            
            if (!firstTime.hasBeenInfected) {
                player.sendMessage(getInfectionMessage("bear", "infected"));
                firstTime.hasBeenInfected = true;
            } else {
                player.sendMessage(getInfectionMessage("bear", "infected"));
            }
            
            firstTimeMessages.set(player.id, firstTime);

            // Clear hit count since they're now infected
            bearHitCount.delete(player.id);

            // IMMEDIATELY save the infection data
            saveInfectionData(player);
            console.log(`[INFECTION] Immediately saved bear infection data for ${player.name}`);
            try { markCodex(player, "status.bearTimerSeen"); } catch {}
            try { markCodex(player, "infections.bear.discovered"); markCodex(player, "infections.bear.firstHitAt", true); } catch {}
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
            try {
                if (newHitCount === 1) {
                    player.addEffect("minecraft:blindness", 60, { amplifier: 0 });
                } else if (newHitCount === 2) {
                    player.addEffect("minecraft:blindness", 100, { amplifier: 0 });
                    player.addEffect("minecraft:nausea", 160, { amplifier: 0 });
                }
            } catch {}
        }
    }
});

// --- Snow Infection: On eating snow ---
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;
    if (item?.typeId === SNOW_ITEM_ID) {
        // Handle snow consumption with new deceptive mechanics
        const infectionState = playerInfection.get(player.id);
        
        // ALWAYS mark snow as discovered and identified when consumed
        try { markCodex(player, "items.snowFound"); markCodex(player, "items.snowIdentified"); } catch {}
        
        if (!infectionState || infectionState.cured) {
            // Not infected - start infection
            playerInfection.set(player.id, { ticksLeft: INFECTION_TICKS, cured: false, hitCount: 0, snowCount: 1 });
            player.addTag(INFECTED_TAG);
            player.sendMessage("§4You have been infected! Find a cure quickly!");
            player.playSound("mob.wither.spawn", { pitch: 0.8, volume: 0.6 });
            console.log(`[SNOW] ${player.name} started infection by eating snow`);
            
            // Mark snow infection as discovered
            try { markCodex(player, "infections.snow.discovered"); markCodex(player, "infections.snow.firstUseAt", true); } catch {}
            
            // Track infection history
            trackInfectionHistory(player, "infected");
        } else {
            // Player is infected - apply deceptive snow mechanics
            const timeEffect = getSnowTimeEffect(infectionState.ticksLeft, infectionState.snowCount);
            const newTicksLeft = Math.max(0, Math.min(INFECTION_TICKS, infectionState.ticksLeft + timeEffect));
            
            // Update infection state
            infectionState.ticksLeft = newTicksLeft;
            infectionState.snowCount++;
            playerInfection.set(player.id, infectionState);
            
            // Send appropriate message based on effect
            if (timeEffect > 0) {
                const minutesAdded = Math.floor(timeEffect / 1200);
                player.sendMessage(`§aThe snow seems to help... (+${minutesAdded} minutes)`);
            } else if (timeEffect < 0) {
                const minutesLost = Math.floor(-timeEffect / 1200);
                player.sendMessage(`§cThe snow burns! (-${minutesLost} minutes)`);
            } else {
                player.sendMessage(`§eThe snow has no effect.`);
            }
            
            // Check for immediate death
            if (newTicksLeft <= 0) {
                player.kill();
                player.dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${player.name} succumbed to the infection!"}]}`);
                player.removeTag(INFECTED_TAG);
                playerInfection.delete(player.id);
            }
        }
    }
});

// --- Test Command for Debugging Effects - COMMENTED OUT FOR PLAYABILITY ---
/*
if (world.beforeEvents && world.beforeEvents.playerSendMessage) {
    world.beforeEvents.playerSendMessage.subscribe((event) => {
        const message = event.message;
        const player = event.player;

        if (message === "!testeffects") {
            event.cancel = true;
            console.log(`[TEST] Testing effects for ${player.name}`);

            try {
                // Test all methods
                const effectsComponent = player.getComponent("effects");
                if (effectsComponent) {
                    const componentEffects = effectsComponent.getEffects();
                    console.log(`[TEST] Component effects: ${componentEffects.map(e => e.typeId).join(', ')}`);

                    // Check for weakness specifically
                    const weaknessEffect = componentEffects.find(e => e.typeId === "minecraft:weakness");
                    if (weaknessEffect) {
                        console.log(`[TEST] Found weakness: duration=${weaknessEffect.duration}, amplifier=${weaknessEffect.amplifier}`);
                    }
                }

                // Try command method
                try {
                    const result = player.runCommand("effect @s weakness");
                    console.log(`[TEST] Command result: ${result.statusMessage}`);
                } catch (cmdError) {
                    console.log(`[TEST] Command failed: ${cmdError}`);
                }

                player.sendMessage("§aEffect test completed! Check console for results.");
        } catch (error) {
                console.warn("[TEST] Error testing effects:", error);
                player.sendMessage("§cEffect test failed! Check console for error.");
            }
        }

        // Add command to manually add weakness for testing
        if (message === "!addweakness") {
            event.cancel = true;
            try {
                player.addEffect("minecraft:weakness", 200, { amplifier: 1 });
                player.sendMessage("§aAdded weakness effect for testing!");
                            } catch (error) {
                console.warn("[TEST] Error adding weakness:", error);
                player.sendMessage("§cFailed to add weakness effect!");
            }
        }

        // Add command to check infection status
        if (message === "!infection") {
            event.cancel = true;
            const infectionState = playerInfection.get(player.id);
            const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;

            player.sendMessage(`§6=== Infection Status ===`);
            player.sendMessage(`§eInfected: ${hasInfection ? '§cYES' : '§aNO'}`);
            if (hasInfection) {
                const daysLeft = Math.ceil(infectionState.ticksLeft / 24000);
                const hoursLeft = Math.ceil(infectionState.ticksLeft / 1000);
                const snowCount = infectionState.snowCount || 0;
                player.sendMessage(`§eTime until transformation: §c${daysLeft} days (${hoursLeft} hours)`);
                player.sendMessage(`§eSnow consumed: §c${snowCount}`);
                player.sendMessage(`§7Cure: §fWeakness + Enchanted Golden Apple`);
                        } else {
                player.sendMessage("§aYou are not currently infected.");
            }
        }

        // Add command to check weakness status
        if (message === "!weakness") {
            event.cancel = true;
            const hasWeakness = hasWeaknessEffect(player);
            const isImmune = isPlayerImmune(player);

            player.sendMessage(`§6=== Weakness Status ===`);
            player.sendMessage(`§eHas Weakness Effect: ${hasWeakness ? '§aYES' : '§cNO'}`);
            player.sendMessage(`§eIs Immune to Infection: ${isImmune ? '§aYES' : '§cNO'}`);
            player.sendMessage(`§7Use §e!addweakness §7to get weakness for testing`);
        }

        // Add command to check spawn rates
        if (message === "!spawnrate") {
            event.cancel = true;
            const currentDay = getCurrentDay();
            const currentWeight = SPAWN_RATE_CONFIG.currentWeight;
            const calculatedWeight = calculateSpawnRate(currentDay);
            
            player.sendMessage(`§6=== Spawn Rate Status ===`);
            player.sendMessage(`§eCurrent Day: §a${currentDay}`);
            player.sendMessage(`§eCurrent Weight: §a${currentWeight}`);
            player.sendMessage(`§eCalculated Weight: §a${calculatedWeight}`);
            player.sendMessage(`§eGrace Period: §c${SPAWN_RATE_CONFIG.gracePeriodDays} days`);
            player.sendMessage(`§eRamp Up Period: §e${SPAWN_RATE_CONFIG.rampUpDays} days`);
            player.sendMessage(`§eMax Weight: §a${SPAWN_RATE_CONFIG.maxWeight}`);
            
            if (currentDay < SPAWN_RATE_CONFIG.gracePeriodDays) {
                player.sendMessage(`§cMaple Bears are in grace period - no spawning yet!`);
            } else if (currentDay < SPAWN_RATE_CONFIG.gracePeriodDays + SPAWN_RATE_CONFIG.rampUpDays) {
                const progress = ((currentDay - SPAWN_RATE_CONFIG.gracePeriodDays) / SPAWN_RATE_CONFIG.rampUpDays * 100).toFixed(1);
                player.sendMessage(`§eSpawn rate is ramping up: §a${progress}%§e complete`);
    } else {
                player.sendMessage(`§aMaximum spawn rate reached!`);
            }
        }

        // Add command to remove immunity for testing
        if (message === "!removeimmunity") {
        event.cancel = true;
            curedPlayers.delete(player.id);
            player.sendMessage("§aRemoved immunity for testing!");
        }
    });
}
*/

// --- Cure Logic: Consolidated in itemCompleteUse above ---
// Removed duplicate cure logic since it's now handled in the main itemCompleteUse handler

// --- Infection Timers and Effects ---
system.runInterval(() => {
    // Unified infection system
    for (const [id, state] of playerInfection.entries()) {
        const player = world.getAllPlayers().find(p => p.id === id);
        if (!player || state.cured) continue;

        state.ticksLeft -= 40; // Adjusted for 40-tick interval

        // Save data periodically
        saveInfectionData(player);

        // Log remaining time every 10 minutes (24000 ticks)
        if (state.ticksLeft % 24000 === 0 && state.ticksLeft > 0) {
            const daysLeft = Math.ceil(state.ticksLeft / 24000);
            console.log(`[INFECTION] ${player.name} has ${daysLeft} days left until bear transformation`);
        }

        if (state.ticksLeft <= 0) {
            // Transform!
            console.log(`[INFECTION] ${player.name} succumbs to infection and transforms!`);
            player.kill();
            player.dimension.spawnEntity(INFECTED_BEAR_ID, player.location);
            player.sendMessage("§4You succumbed to the infection!");
            player.removeTag(INFECTED_TAG);
            playerInfection.delete(id);
        } else if (state.ticksLeft <= 1200 && !state.warningSent) { // 1 minute before transformation
            // Send warning message a minute before transformation
            player.sendMessage("§4You don't feel so good...");
            state.warningSent = true;
            playerInfection.set(id, state);
        } else {
            // Scale symptom chance and intensity
            const level = getSymptomLevel(state.ticksLeft);
            const nowTick = system.currentTick;
            const lastTick = lastSymptomTick.get(id) ?? 0;
            const cooldown = level === 0 ? 1200 : level === 1 ? 600 : level === 2 ? 300 : 120; // ticks between symptoms
            if (nowTick - lastTick >= cooldown) {
                const effectsByLevel = [
                    [],
                    [ { effect: "minecraft:slowness", duration: 60, amp: 0 } ],
                    [ { effect: "minecraft:slowness", duration: 100, amp: 1 }, { effect: "minecraft:hunger", duration: 80, amp: 1 } ],
                    [ { effect: "minecraft:slowness", duration: 140, amp: 2 }, { effect: "minecraft:weakness", duration: 140, amp: 1 }, { effect: "minecraft:blindness", duration: 60, amp: 0 } ]
                ];
                const options = effectsByLevel[level];
                if (options && options.length > 0) {
                    const chosen = options[Math.floor(Math.random() * options.length)];
                    try {
                        player.addEffect(chosen.effect, chosen.duration, { amplifier: chosen.amp });
                    } catch {}
                }
                lastSymptomTick.set(id, nowTick);
            }
        }
    }

    // One-shot inventory scan for snow discovery (stops after found)
    try {
        for (const p of world.getAllPlayers()) {
            const inv = p.getComponent("inventory")?.container;
            if (!inv) continue;
            const raw = p.getDynamicProperty("mb_codex");
            let found = false;
            if (raw) {
                try { found = !!(JSON.parse(raw)?.items?.snowFound); } catch {}
            }
            if (found) continue;
            for (let i = 0; i < inv.size; i++) {
                const it = inv.getItem(i);
                if (it && it.typeId === SNOW_ITEM_ID) { try { markCodex(p, "items.snowFound"); } catch {} break; }
            }
        }
    } catch {}
}, 40); // Changed from 20 to 40 ticks for better performance

// --- Immunity Cleanup System ---
system.runInterval(() => {
    // Clean up expired immunity entries
    const currentTime = Date.now();
    for (const [playerId, immunityEndTime] of curedPlayers.entries()) {
        if (currentTime > immunityEndTime) {
            curedPlayers.delete(playerId);
            console.log(`[IMMUNITY] Cleaned up expired immunity for player ${playerId}`);
        }
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
        // Only place on solid-ish surfaces with air above
        if (!above.isAir) return;
        // Avoid placing inside fluids
        if (below.isLiquid) return;
        // Place a thin layer of vanilla snow as a placeholder
        if (above.isAir) {
            above.setType(SNOW_LAYER_BLOCK);
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
            if (t !== MAPLE_BEAR_ID && t !== MAPLE_BEAR_DAY4_ID && t !== MAPLE_BEAR_DAY8_ID && t !== INFECTED_BEAR_ID && t !== INFECTED_BEAR_DAY8_ID && t !== BUFF_BEAR_ID && t !== INFECTED_PIG_ID) continue;

            // Snow trail placement (for all types)
            let trailChance = 0.02; // tiny default
            if (t === MAPLE_BEAR_DAY4_ID) trailChance = 0.03; // Day 4+ tiny bears
            if (t === MAPLE_BEAR_DAY8_ID) trailChance = 0.04; // Day 8+ tiny bears
            if (t === INFECTED_BEAR_ID) trailChance = 0.06;
            if (t === INFECTED_BEAR_DAY8_ID) trailChance = 0.08; // Day 8+ normal bears
            if (t === BUFF_BEAR_ID) trailChance = 0.2;
            if (t === INFECTED_PIG_ID) trailChance = 0.06; // Same as infected bear

            const lastTrail = lastSnowTrailTickByEntity.get(entity.id) ?? 0;
            if (nowTick - lastTrail >= TRAIL_COOLDOWN_TICKS && Math.random() < trailChance) {
                tryPlaceSnowLayerUnder(entity);
                lastSnowTrailTickByEntity.set(entity.id, nowTick);
            }

            // Snow item drops (only for tiny Maple Bears)
            if (t === MAPLE_BEAR_ID || t === MAPLE_BEAR_DAY4_ID || t === MAPLE_BEAR_DAY8_ID) {
                const lastDrop = lastSnowDropTickByEntity.get(entity.id) ?? 0;
                if (nowTick - lastDrop >= SNOW_DROP_COOLDOWN_TICKS && Math.random() < 0.6) { // 60% chance
                    tryDropSnowItem(entity);
                    lastSnowDropTickByEntity.set(entity.id, nowTick);
                }
            }
        }
    } catch { }
}, 20); // check every second

// --- Monitor when players get effects added (for logging only) ---
world.afterEvents.effectAdd.subscribe((event) => {
    const entity = event.entity;
    const effect = event.effect;

    if (entity instanceof Player && effect.typeId === "minecraft:weakness") {
        console.log(`[EFFECT] Player ${entity.name} got weakness effect: duration=${effect.duration}, amplifier=${effect.amplifier}`);
        try { markCodex(entity, "symptoms.weaknessSeen"); } catch {}
    }
    // Log to symptoms meta for known effects
    if (entity instanceof Player) {
        try {
            const id = effect.typeId;
            const durationTicks = effect.duration ?? 0;
            const amp = effect.amplifier ?? 0;
            let source = null;
            const infectionState = playerInfection.get(entity.id);
            const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
            if (hasInfection) source = "infection";
            let timingBucket = null;
            if (hasInfection) {
                const st = infectionState.ticksLeft || 0;
                const total = INFECTION_TICKS;
                const ratio = Math.max(0, Math.min(1, st / total));
                timingBucket = ratio > 0.5 ? (ratio > 0.8 ? "early" : "mid") : "late";
            }
            let snowCountBucket = null;
            if (hasInfection) {
                const c = infectionState.snowCount || 0;
                snowCountBucket = c <= 5 ? "low" : (c <= 10 ? "mid" : "high");
            }
            // Mark seen flag for known effects
            try {
                if (id === "minecraft:weakness") markCodex(entity, "symptoms.weaknessSeen");
                if (id === "minecraft:nausea") markCodex(entity, "symptoms.nauseaSeen");
                if (id === "minecraft:blindness") markCodex(entity, "symptoms.blindnessSeen");
                if (id === "minecraft:slowness") markCodex(entity, "symptoms.slownessSeen");
                if (id === "minecraft:hunger") markCodex(entity, "symptoms.hungerSeen");
            } catch {}
            // Update meta
            try { import("./mb_codex.js").then(m => m.updateSymptomMeta(entity, id, durationTicks, amp, source, timingBucket, snowCountBucket)); } catch {}
        } catch {}
    }
});

// --- Infection State Reset on Death/Respawn ---
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    if (entity instanceof Player) {
        // Clear all infection data on death - you're a new person when you respawn
        playerInfection.delete(entity.id);
        curedPlayers.delete(entity.id);
        bearHitCount.delete(entity.id);
        // Note: Keep maxSnowLevels persistent across deaths - it's a lifetime achievement
        entity.removeTag(INFECTED_TAG);

        // Clear dynamic properties on death
        try {
            entity.setDynamicProperty("mb_bear_infection", undefined);
            entity.setDynamicProperty("mb_snow_infection", undefined);
            entity.setDynamicProperty("mb_immunity_end", undefined);
            entity.setDynamicProperty("mb_bear_hit_count", undefined);
            // Keep first-time tutorial flags so players don't see them again after death
            // Keep codex knowledge - that persists across deaths
            // Keep max snow level - it's a lifetime achievement
            console.log(`[DEATH] Cleared all infection data for ${entity.name} - they are a new person now`);
        } catch (error) {
            console.warn(`[DEATH] Error clearing dynamic properties: ${error}`);
        }
    }
});
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    // Don't clear infection data on respawn - let it persist across sessions
    // Only clear on actual death
});

/**
 * Check if a player is infected
 * @param {Player} player - The player to check
 * @returns {boolean} Whether the player is infected
 */
function isPlayerInfected(player) {
    return player.hasTag(INFECTED_TAG) || infectedPlayers.has(player.id);
}

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
        console.warn(`[WEAKNESS] Error checking weakness effect: ${error}`);
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
        console.warn(`[SAVE] Error saving infection data for ${player.name}: ${error}`);
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
                console.warn(`[LOAD] Error parsing first-time message state for ${player.name}: ${error}`);
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
                console.warn(`[LOAD] Error parsing max snow level for ${player.name}: ${error}`);
            }
        }
    } catch (error) {
        console.warn(`[LOAD] Error loading infection data for ${player.name}: ${error}`);
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
function formatTicksDuration(ticks) {
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
function formatMillisDuration(ms) {
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
        } else {
            summary.push("§bImmunity: §7None");
        }
        const hitCount = bearHitCount.get(player.id) || 0;
        if (hitCount > 0 && !hasBear) {
            summary.push(`§eBear Hits: §f${hitCount}/${HITS_TO_INFECT}`);
        }

        // Mark knowledge
        try {
            if (hasBear) markCodex(player, "status.bearTimerSeen");
            if (hasSnow) markCodex(player, "status.snowTimerSeen");
            if (immune) markCodex(player, "status.immuneKnown");
        } catch {}

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
                lines.push(`§eWeakness: ${codex.symptoms.weaknessSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eNausea: ${codex.symptoms.nauseaSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eBlindness: ${codex.symptoms.blindnessSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eSlowness: ${codex.symptoms.slownessSeen ? '§fSeen' : '§8Unknown'}`);
                lines.push(`§eHunger: ${codex.symptoms.hungerSeen ? '§fSeen' : '§8Unknown'}`);
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
        console.warn("[BOOK] Error showing infection report:", err);
    }
}


/**
 * Mark a player as infected
 * @param {Player} player - The player to infect
 */
function infectPlayer(player) {
    player.addTag(INFECTED_TAG);
    infectedPlayers.add(player.id);
    // Notify the player
    player.playSound("mob.wither.spawn", {
        pitch: 0.8,
        volume: 0.6
    });
    player.onScreenDisplay.setTitle("§4! You are infected!");
    player.onScreenDisplay.setActionBar("§cThe Maple Bear infection spreads...");
}

/**
 * Handle the death of an infected player
 * @param {Player} player - The infected player who died
 */
function handleInfectedDeath(player) {
    try {
        const location = player.location;
        const dimension = player.dimension;
        
        // Remove infection status
        player.removeTag(INFECTED_TAG);
        infectedPlayers.delete(player.id);
        
        // Mark infection as discovered when player dies from it
        try { 
            markCodex(player, "infections.bear.discovered"); 
            markCodex(player, "infections.snow.discovered");
        } catch {}
        
        // Get the player's inventory before spawning the bear
        const inventory = playerInventories.get(player.id);
        
        // Spawn infected Maple Bear at death location
        const bear = dimension.spawnEntity(INFECTED_BEAR_ID, location);
        if (bear) {
            // Set name tag for visual identification
            bear.nameTag = `§4! ${player.name}'s Infected Form`;
            
            // Set dynamic property for tracking
            bear.setDynamicProperty("infected_by", player.id);
            
            // Store inventory in the bear's dynamic properties
                bear.setDynamicProperty("original_inventory", JSON.stringify(inventory));
            
            // Add particle effects, sounds, and broadcast as before
            spreadSnowEffect(location, dimension);
            dimension.playSound("mob.wither.death", location, { pitch: 0.7, volume: 0.5 });
            dimension.playSound("random.glass", location, { pitch: 0.5, volume: 1.0 });
            dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${player.name} transformed into a Maple Bear!"}]}`);
            

        }
    } catch (error) {
        console.warn("Error in handleInfectedDeath:", error);
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
        console.warn("Error in corruptDroppedItems:", error);
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

// Helper to prepare infected transformation: capture, split, clear inventory, and return equipables/stored
function prepareInfectedTransformation(player, playerId, playerName) {
    // Capture the full inventory before clearing
    const inventory = [];
    let totalItemCount = 0;
    const playerInventory = player.getComponent("inventory").container;

    // --- Determine best armor and weapon ---
    const best = {
        head: null, chest: null, legs: null, feet: null, weapon: null
    };
    // Use global ARMOR_PRIORITY and TOOL_PRIORITY
    const WEAPON_PRIORITY = [
        "netherite_sword", "diamond_sword", "iron_sword", "golden_sword", "stone_sword", "wooden_sword",
        "bow", "crossbow", "trident"
    ];
    function compareArmor(a, b) {
        for (let i = 0; i < ARMOR_PRIORITY.length; i++) {
            if (a.includes(ARMOR_PRIORITY[i])) return i;
        }
        return ARMOR_PRIORITY.length;
    }
    function compareWeapon(a, b) {
        for (let i = 0; i < WEAPON_PRIORITY.length; i++) {
            if (a.endsWith(WEAPON_PRIORITY[i])) return i;
        }
        return WEAPON_PRIORITY.length;
    }
    for (let i = 0; i < playerInventory.size; i++) {
        const item = playerInventory.getItem(i);
        if (!item) continue;
        const id = item.typeId;
        // Armor
        if (id.endsWith("_helmet") || id === "minecraft:turtle_helmet") {
            if (!best.head || compareArmor(id, best.head.item.typeId) < compareArmor(best.head.item.typeId, id)) best.head = { item, slot: i };
        } else if (id.endsWith("_chestplate") || id === "minecraft:elytra") {
            if (!best.chest || compareArmor(id, best.chest.item.typeId) < compareArmor(best.chest.item.typeId, id)) best.chest = { item, slot: i };
        } else if (id.endsWith("_leggings")) {
            if (!best.legs || compareArmor(id, best.legs.item.typeId) < compareArmor(best.legs.item.typeId, id)) best.legs = { item, slot: i };
        } else if (id.endsWith("_boots")) {
            if (!best.feet || compareArmor(id, best.feet.item.typeId) < compareArmor(best.feet.item.typeId, id)) best.feet = { item, slot: i };
        }
        // Weapon
        else if (WEAPON_PRIORITY.some(w => id.endsWith(w))) {
            if (!best.weapon || compareWeapon(id, best.weapon.item.typeId) < compareWeapon(best.weapon.item.typeId, id)) best.weapon = { item, slot: i };
        }
    }
    // --- Set keepOnDeath for all items ---
    for (let i = 0; i < playerInventory.size; i++) {
        const item = playerInventory.getItem(i);
        if (!item) continue;
        let shouldDrop = false;
        if (
            (best.head && i === best.head.slot) ||
            (best.chest && i === best.chest.slot) ||
            (best.legs && i === best.legs.slot) ||
            (best.feet && i === best.feet.slot) ||
            (best.weapon && i === best.weapon.slot)
        ) {
            shouldDrop = true;
        }
        try {
            item.keepOnDeath = !shouldDrop; // Drop best gear, keep everything else
            playerInventory.setItem(i, item);
        } catch (e) { }
        inventory.push({ 
            slot: i, 
            typeId: item.typeId,
            amount: item.amount,
            data: item.data || 0
        });
        totalItemCount += item.amount;
    }
    // Store captured inventory in player data for later use
    playerInventories.set(playerId, inventory);
    // Split items into equippable and stored
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
    const ARMOR_PRIORITY = [
        "minecraft:netherite", "minecraft:diamond", "minecraft:iron", "minecraft:golden", "minecraft:chainmail", "minecraft:leather"
    ];
    const TOOL_PRIORITY = [
        "minecraft:netherite", "minecraft:diamond", "minecraft:iron", "minecraft:golden", "minecraft:stone", "minecraft:wooden"
    ];
    const bestEquip = {
        head: null,
        chest: null,
        legs: null,
        feet: null,
        mainhand: null,
        offhand: null
    };
    function getArmorPriority(typeId) {
        for (let i = 0; i < ARMOR_PRIORITY.length; i++) {
            if (typeId.includes(ARMOR_PRIORITY[i])) return i;
        }
        return ARMOR_PRIORITY.length;
    }
    function getToolPriority(typeId) {
        for (let i = 0; i < TOOL_PRIORITY.length; i++) {
            if (typeId.includes(TOOL_PRIORITY[i])) return i;
        }
        return TOOL_PRIORITY.length;
    }
    const equipables = [];
    const stored = [];
    for (const item of inventory) {
        if (EQUIPPABLE_IDS.has(item.typeId)) {
            let slot = null;
            if (item.typeId.endsWith("_helmet") || item.typeId === "minecraft:turtle_helmet") slot = "head";
            else if (item.typeId.endsWith("_chestplate") || item.typeId === "minecraft:elytra") slot = "chest";
            else if (item.typeId.endsWith("_leggings")) slot = "legs";
            else if (item.typeId.endsWith("_boots")) slot = "feet";
            else if (["minecraft:shield", "minecraft:totem_of_undying", "minecraft:torch", "minecraft:soul_torch", "minecraft:lantern", "minecraft:soul_lantern"].includes(item.typeId)) slot = "offhand";
            else if (["minecraft:wooden_sword", "minecraft:stone_sword", "minecraft:golden_sword", "minecraft:iron_sword", "minecraft:diamond_sword", "minecraft:netherite_sword", "minecraft:bow", "minecraft:crossbow", "minecraft:trident", "minecraft:wooden_axe", "minecraft:stone_axe", "minecraft:golden_axe", "minecraft:iron_axe", "minecraft:diamond_axe", "minecraft:netherite_axe", "minecraft:wooden_pickaxe", "minecraft:stone_pickaxe", "minecraft:golden_pickaxe", "minecraft:iron_pickaxe", "minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe", "minecraft:wooden_shovel", "minecraft:stone_shovel", "minecraft:golden_shovel", "minecraft:iron_shovel", "minecraft:diamond_shovel", "minecraft:netherite_shovel", "minecraft:wooden_hoe", "minecraft:stone_hoe", "minecraft:golden_hoe", "minecraft:iron_hoe", "minecraft:diamond_hoe", "minecraft:netherite_hoe"].includes(item.typeId)) slot = "mainhand";
            if (slot) {
                if (!bestEquip[slot]) {
                    bestEquip[slot] = item;
                } else {
                    if (["head", "chest", "legs", "feet"].includes(slot)) {
                        if (getArmorPriority(item.typeId) < getArmorPriority(bestEquip[slot].typeId)) {
                            stored.push(bestEquip[slot]);
                            bestEquip[slot] = item;
                        } else {
                            stored.push(item);
                        }
                    } else if (slot === "mainhand") {
                        if (getToolPriority(item.typeId) < getToolPriority(bestEquip[slot].typeId)) {
                            stored.push(bestEquip[slot]);
                            bestEquip[slot] = item;
                        } else {
                            stored.push(item);
                        }
                    } else if (slot === "offhand") {
                        const offhandOrder = ["minecraft:shield", "minecraft:totem_of_undying", "minecraft:torch", "minecraft:soul_torch", "minecraft:lantern", "minecraft:soul_lantern"];
                        if (offhandOrder.indexOf(item.typeId) < offhandOrder.indexOf(bestEquip[slot].typeId)) {
                            stored.push(bestEquip[slot]);
                            bestEquip[slot] = item;
                        } else {
                            stored.push(item);
                        }
                    }
                }
            } else {
                stored.push(item);
            }
        } else {
            stored.push(item);
        }
    }
    for (const slot of Object.keys(bestEquip)) {
        if (bestEquip[slot]) equipables.push(bestEquip[slot]);
    }
    // Clear all inventory slots before death
    if (playerInventory) {
        for (let i = 0; i < playerInventory.size; i++) {
            playerInventory.setItem(i, undefined);
        }
    }
    // Clear all equipment slots before death
    try {
        const equipmentComponent = player.getComponent("equipment");
        if (equipmentComponent) {
            const equipmentSlots = ["head", "chest", "legs", "feet", "offhand"];
            for (const slot of equipmentSlots) {
                const equipSlot = equipmentComponent.getEquipmentSlot(slot);
                equipSlot?.setItem(undefined);
            }
        }
    } catch (error) { }
    return { equipables, stored };
}

// Simulate infected death instead of killing the player
function simulateInfectedDeath(player) {
    const playerId = player.id;
    const playerName = player.name;
    // Capture and split inventory, and set keepOnDeath=false for all items
    const { equipables, stored } = prepareInfectedTransformation(player, playerId, playerName);
    // Add dramatic effects
    player.playSound("random.hurt");
    player.playSound("minecraft:large_smoke");
    player.addEffect("minecraft:blindness", 60, { amplifier: 1 });
    player.addEffect("minecraft:slowness", 60, { amplifier: 255 });
    player.addEffect("minecraft:weakness", 60, { amplifier: 255 });
    // Teleport to limbo (void)
    const DEATH_ROOM = { x: 0, y: -64, z: 0 };
    player.teleport(DEATH_ROOM);
    // Spawn infected bear
    const bear = player.dimension.spawnEntity(INFECTED_BEAR_ID, player.location);
    if (bear) {
        bear.nameTag = `§4! ${playerName}'s Infected Form`;
        bear.setDynamicProperty("infected_by", playerId);
        bear.setDynamicProperty("original_inventory", JSON.stringify(stored));
        try {
            const bearEquipment = bear.getComponent("equipment");
            if (bearEquipment) {
                for (const item of equipables) {
                    let slot = null;
                    if (item.typeId.endsWith("_helmet") || item.typeId === "minecraft:turtle_helmet") slot = "head";
                    else if (item.typeId.endsWith("_chestplate") || item.typeId === "minecraft:elytra") slot = "chest";
                    else if (item.typeId.endsWith("_leggings")) slot = "legs";
                    else if (item.typeId.endsWith("_boots")) slot = "feet";
                    else if (["minecraft:shield", "minecraft:totem_of_undying", "minecraft:torch", "minecraft:soul_torch", "minecraft:lantern", "minecraft:soul_lantern"].includes(item.typeId)) slot = "offhand";
                    else if (["minecraft:wooden_sword", "minecraft:stone_sword", "minecraft:golden_sword", "minecraft:iron_sword", "minecraft:diamond_sword", "minecraft:netherite_sword", "minecraft:bow", "minecraft:crossbow", "minecraft:trident", "minecraft:wooden_axe", "minecraft:stone_axe", "minecraft:golden_axe", "minecraft:iron_axe", "minecraft:diamond_axe", "minecraft:netherite_axe", "minecraft:wooden_pickaxe", "minecraft:stone_pickaxe", "minecraft:golden_pickaxe", "minecraft:iron_pickaxe", "minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe", "minecraft:wooden_shovel", "minecraft:stone_shovel", "minecraft:golden_shovel", "minecraft:iron_shovel", "minecraft:diamond_shovel", "minecraft:netherite_shovel", "minecraft:wooden_hoe", "minecraft:stone_hoe", "minecraft:golden_hoe", "minecraft:iron_hoe", "minecraft:diamond_hoe", "minecraft:netherite_hoe"].includes(item.typeId)) slot = "mainhand";
                    if (slot) {
                        const itemStack = new ItemStack(item.typeId, item.amount);
                        bearEquipment.getEquipmentSlot(slot)?.setItem(itemStack);
                    }
                }
            }
        } catch (error) {
            console.warn("Failed to equip bear with items:", error);
        }
        bear.triggerEvent("become_buffed");
    }
    // Respawn player after short delay
    system.runTimeout(() => {
        player.runCommandAsync("effect @s clear");
        // Teleport to spawn (bed or world spawn)
        let spawnLoc = null;
        if (typeof player.getSpawnPoint === 'function') {
            spawnLoc = player.getSpawnPoint();
        }
        if (!spawnLoc || typeof spawnLoc.x !== 'number') {
            spawnLoc = player.dimension.getSpawnPosition ? player.dimension.getSpawnPosition() : { x: 0, y: 100, z: 0 };
        }
        player.teleport(spawnLoc);
        const health = player.getComponent("health");
        if (health) health.setCurrent(20);
        player.runCommandAsync("clear");
        player.removeTag(INFECTED_TAG);
        infectedPlayers.delete(player.id);
        player.removeTag("mb_simulating_death");
        player.sendMessage("§8[MBI] §cYou lost yourself to the infection...");
    }, 40); // 2 seconds
}

// Simulate generic infected death (no bear, just effects and inventory clear)
function simulateGenericInfectedDeath(player) {
    const playerId = player.id;
    const playerName = player.name;
    // Capture and clear inventory, and set keepOnDeath=false for all items
    prepareInfectedTransformation(player, playerId, playerName);
    // Add dramatic effects
    player.playSound("random.hurt");
    player.playSound("minecraft:large_smoke");
    player.addEffect("minecraft:blindness", 60, { amplifier: 1 });
    player.addEffect("minecraft:slowness", 60, { amplifier: 255 });
    player.addEffect("minecraft:weakness", 60, { amplifier: 255 });
    // Teleport to limbo (void)
    const DEATH_ROOM = { x: 0, y: -64, z: 0 };
    player.teleport(DEATH_ROOM);
    // Respawn player after short delay
    system.runTimeout(() => {
        player.runCommandAsync("effect @s clear");
        // Teleport to spawn (bed or world spawn)
        let spawnLoc = null;
        if (typeof player.getSpawnPoint === 'function') {
            spawnLoc = player.getSpawnPoint();
        }
        if (!spawnLoc || typeof spawnLoc.x !== 'number') {
            spawnLoc = player.dimension.getSpawnPosition ? player.dimension.getSpawnPosition() : { x: 0, y: 100, z: 0 };
        }
        player.teleport(spawnLoc);
        const health = player.getComponent("health");
        if (health) health.setCurrent(20);
        player.runCommandAsync("clear");
        player.removeTag(INFECTED_TAG);
        infectedPlayers.delete(player.id);
        player.removeTag("mb_simulating_death");
        player.sendMessage("§8[MBI] §cWell, that's unfortunate...");
    }, 40); // 2 seconds
}

// Note: All scripted spawning logic removed - using spawn rules and multiple entity files instead

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
            }
        }, 60); // 3 second delay
    } catch (error) {
        console.warn("[JOIN] Error in player join handler:", error);
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
    } catch (error) {
        console.warn("[LEAVE] Error in player leave handler:", error);
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
const curedPlayers = new Map(); // playerId -> immunityEndTime
const CURE_IMMUNITY_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// --- Test Functions (for console testing) - COMMENTED OUT FOR PLAYABILITY ---
/*
function testWeaknessDetection(playerName) {
    const player = world.getAllPlayers().find(p => p.name === playerName);
    if (!player) {
        console.log(`[TEST] Player ${playerName} not found`);
        return;
    }

    console.log(`[TEST] Testing weakness for ${player.name}`);

    // Use the proper API method
    const hasWeakness = hasWeaknessEffect(player);
    console.log(`[TEST] Has weakness effect (API check): ${hasWeakness}`);

    // Check immunity status
    const isImmune = isPlayerImmune(player);
    console.log(`[TEST] Is immune to infection: ${isImmune}`);

    // Get detailed effect info if available
    try {
        const weaknessEffect = player.getEffect("minecraft:weakness");
        if (weaknessEffect && weaknessEffect.isValid) {
            console.log(`[TEST] Weakness effect details: duration=${weaknessEffect.duration}, amplifier=${weaknessEffect.amplifier}`);
        } else {
            console.log(`[TEST] No weakness effect found via getEffect()`);
        }
    } catch (error) {
        console.log(`[TEST] Error getting effect details: ${error}`);
    }

    console.log(`[TEST] Weakness test completed for ${player.name}`);
}

function addWeaknessToPlayer(playerName) {
    const player = world.getAllPlayers().find(p => p.name === playerName);
    if (!player) {
        console.log(`[TEST] Player ${playerName} not found`);
        return;
    }

    try {
        player.addEffect("minecraft:weakness", 200, { amplifier: 1 });
        console.log(`[TEST] Added weakness effect to ${player.name}`);
    } catch (error) {
        console.warn("[TEST] Error adding weakness:", error);
    }
}

function checkInfectionStatus(playerName) {
    const player = world.getAllPlayers().find(p => p.name === playerName);
    if (!player) {
        console.log(`[TEST] Player ${playerName} not found`);
        return;
    }

    const infectionState = playerInfection.get(player.id);
    const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
    const ticks = hasInfection ? infectionState.ticksLeft : 0;
    const isImmune = isPlayerImmune(player);

    console.log(`[TEST] === Infection Status for ${player.name} ===`);
    console.log(`[TEST] Infection: ${hasInfection ? 'YES' : 'NO'}`);
    if (hasInfection) {
        const daysLeft = Math.ceil(ticks / 24000);
        const snowCount = infectionState.snowCount || 0;
        console.log(`[TEST] Days until transformation: ${daysLeft}`);
        console.log(`[TEST] Snow consumed: ${snowCount}`);
    }
    console.log(`[TEST] Is Immune: ${isImmune ? 'YES' : 'NO'}`);
    if (isImmune) {
        const immunityEndTime = curedPlayers.get(player.id);
        const timeLeft = Math.max(0, immunityEndTime - Date.now());
        console.log(`[TEST] Immunity time remaining: ${Math.floor(timeLeft / 1000)} seconds`);
    }
}

console.log("[INFO] Test functions available:");
console.log("[INFO] - testWeaknessDetection('playerName')");
console.log("[INFO] - addWeaknessToPlayer('playerName')");
console.log("[INFO] - checkInfectionStatus('playerName')");
console.log("[INFO] Debug items (use these items in-game):");
console.log("[INFO] - Book: Test weakness detection");
console.log("[INFO] - Paper: Add weakness effect");
console.log("[INFO] - Map: Check infection status");
console.log("[INFO] - Compass: Remove immunity for testing");
*/

// --- Gameplay Item Use Handler (snow_book for infection tracking) ---
world.beforeEvents.itemUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;

    // Infection Tracker Book - GAMEPLAY FEATURE
    if (item?.typeId === "mb:snow_book") {
        event.cancel = true;
        system.run(() => {
            try { markCodex(player, "items.snowBookCrafted"); } catch {}
            showCodexBook(player, { playerInfection, curedPlayers, formatTicksDuration, formatMillisDuration, HITS_TO_INFECT, bearHitCount, maxSnowLevels, checkVariantUnlock, getCurrentDay });
        });
        return;
    }

    // Testing features are commented out for playability
    // Uncomment the section below if you need testing features back
    /*
    // Debug commands via item use
    if (item?.typeId === "minecraft:book") {
        // Test weakness detection
        console.log(`[DEBUG] Player ${player.name} used book - testing effects`);
        system.run(() => {
            testWeaknessDetection(player.name);
        });
    } else if (item?.typeId === "minecraft:paper") {
        // Add weakness effect
        console.log(`[DEBUG] Player ${player.name} used paper - adding weakness`);
        system.run(() => {
            addWeaknessToPlayer(player.name);
        });
    } else if (item?.typeId === "minecraft:map") {
        // Check infection status
        console.log(`[DEBUG] Player ${player.name} used map - checking infection`);
        system.run(() => {
            checkInfectionStatus(player.name);
        });
    } else if (item?.typeId === "minecraft:compass") {
        // Remove immunity for testing
        console.log(`[DEBUG] Player ${player.name} used compass - removing immunity`);
        system.run(() => {
            const wasImmune = curedPlayers.has(player.id);
            curedPlayers.delete(player.id);
            player.removeTag("mb_immune_hit_message"); // Clear the hit message tag
            console.log(`[DEBUG] Immunity removal: wasImmune=${wasImmune}, nowImmune=${curedPlayers.has(player.id)}`);
            player.sendMessage("§aRemoved immunity for testing!");

            // IMMEDIATELY save the immunity removal
            saveInfectionData(player);
            console.log(`[DEBUG] Immediately saved immunity removal for ${player.name}`);

            // Check if player should be infected (they might have been hit while immune)
            const infectionState = playerInfection.get(player.id);
            const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;

            if (hasInfection) {
                const daysLeft = Math.ceil(infectionState.ticksLeft / 24000);
                const snowCount = infectionState.snowCount || 0;
                player.sendMessage(`§4You are infected! You have ${daysLeft} days left. Snow consumed: ${snowCount}`);
                player.addTag(INFECTED_TAG);
            } else {
                player.sendMessage("§aYou are not currently infected.");
            }
        });
    }
    */
});
