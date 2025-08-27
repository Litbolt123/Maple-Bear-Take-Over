import { world, system, EntityTypes, Entity, Player, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { initializeDayTracking, getCurrentDay } from "./mb_dayTracker.js";

// NOTE: Debug and testing features have been commented out for playability
// To re-enable testing features, uncomment the following sections:
// - Test functions (testWeaknessDetection, addWeaknessToPlayer, checkInfectionStatus)
// - Debug item use handler (book, paper, map, compass testing)
// - Test command handler (!testeffects, !addweakness, !infection, !weakness, !removeimmunity)

// Constants for Maple Bear behavior
const MAPLE_BEAR_ID = "mb:mb";
const INFECTED_BEAR_ID = "mb:infected";
const BUFF_BEAR_ID = "mb:buff_mb";
const SNOW_ITEM_ID = "mb:snow";
const INFECTED_TAG = "mb_infected";
const INFECTED_CORPSE_ID = "mb:infected_corpse";
const SNOW_LAYER_BLOCK = "minecraft:snow_layer";

// Constants for progressive spawning system
const GRACE_PERIOD_DAYS = 2; // Number of days before Maple Bears start spawning
const MAX_SPAWN_DAY = 100; // Day when spawn rate reaches maximum
const FOOD_MOBS = ["minecraft:cow", "minecraft:pig", "minecraft:sheep", "minecraft:chicken"];

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

// --- Infection System Data ---
const bearInfection = new Map(); // playerId -> { ticksLeft, cured }
const snowInfection = new Map(); // playerId -> { ticksLeft, snowCount }
const BEAR_INFECTION_TICKS = 24000 * 20; // 20 Minecraft days (as originally intended)
const SNOW_INFECTION_START = 20 * 20; // 20 seconds (20 ticks per second)
const SNOW_INFECTION_MIN = 400; // 20 seconds minimum
const SNOW_INFECTION_DECREMENT = 400; // 20 seconds per additional snow
const RANDOM_EFFECT_INTERVAL = 600; // Check every 30 seconds

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

// === Scripted Spawning for Maple Bears ===
const MAPLE_BEAR_MIN_DAY = 3;
const INFECTED_BEAR_MIN_DAY = 3;
const BUFF_BEAR_MIN_DAY = 10;

const MAPLE_BEAR_SPAWN_CHANCE = 1.0; // 100% per interval per player (for testing)
const INFECTED_BEAR_SPAWN_CHANCE = 1.0; // 100%
const BUFF_BEAR_SPAWN_CHANCE = 1.0; // 100%

const SPAWN_INTERVAL = 600; // every 30 seconds (600 ticks)
const SPAWN_RADIUS = 48; // blocks from player
const MIN_SPAWN_RADIUS = 16; // don't spawn right on top of player
const MAX_ATTEMPTS = 30; // increased from 10 for better spawn chance

const VALID_SURFACE_BLOCKS = [
    "minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:podzol",
    "minecraft:snow", "minecraft:snow_block", "minecraft:stone", "minecraft:sand", "minecraft:gravel",
    "minecraft:mycelium", "minecraft:moss_block", "minecraft:rooted_dirt", "minecraft:deepslate"
];
const VALID_ABOVE_BLOCKS = [
    "minecraft:air", "minecraft:tallgrass", "minecraft:grass", "minecraft:snow_layer", "minecraft:leaves"
];

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

// Handle snow item consumption
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;
    if (item?.typeId === SNOW_ITEM_ID) {
        try {
            system.run(() => {
                player.playSound("mob.wolf.growl");
                player.dimension.runCommand(`particle minecraft:smoke_particle ${player.location.x} ${player.location.y + 1} ${player.location.z}`);
                player.sendMessage("§4You start to feel really funny...");
                // Infect the player
                player.addTag(INFECTED_TAG);
                player.playSound("mob.wither.spawn", { pitch: 0.8, volume: 0.6 });
                player.onScreenDisplay.setTitle("§4☣️ You are infected!");
                player.onScreenDisplay.setActionBar("§cWhat is this?...");
            });
        } catch (error) {
            console.warn("Error applying snow effects:", error);
        }
    }

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

    // Handle golden apple consumption for cure system
    if (item?.typeId === "minecraft:golden_apple") {
        console.log(`[APPLE] Player ${player.name} consumed a golden apple`);

        // Check if player has bear infection (only bear infection can be cured)
        const hasBearInfection = bearInfection.has(player.id) && !bearInfection.get(player.id).cured;
        const hasSnowInfection = snowInfection.has(player.id);

        if (hasBearInfection) {
            console.log(`[CURE] Player ${player.name} attempting to cure bear infection. Snow infection: ${hasSnowInfection}`);

            // Check for weakness effect using our reliable detection system
            const hasWeakness = hasWeaknessEffect(player);
            console.log(`[CURE] Player has weakness effect: ${hasWeakness}`);

            if (hasWeakness) {
                // Cure only bear infection
                system.run(() => {
                    bearInfection.set(player.id, { ticksLeft: 0, cured: true });
                    console.log(`[CURE] Cured bear infection for ${player.name}`);
                    player.removeTag(INFECTED_TAG);
                    player.sendMessage("§aYou have cured your Maple Bear infection!");

                    // Grant immunity for 5 minutes
                    const immunityEndTime = Date.now() + CURE_IMMUNITY_DURATION;
                    curedPlayers.set(player.id, immunityEndTime);
                    console.log(`[CURE] Granted ${player.name} immunity until ${new Date(immunityEndTime).toLocaleTimeString()}`);

                    // IMMEDIATELY save the cure data to dynamic properties
                    saveInfectionData(player);
                    console.log(`[CURE] Immediately saved cure data for ${player.name}`);

                    // Note: We do NOT remove the weakness effect - let it run its course naturally
                    player.sendMessage("§eYou are now immune... maybe?");
                });
            } else {
                system.run(() => {
                    player.sendMessage("§eYou need to have weakness to be cured...");
                });
            }
        } else if (hasSnowInfection) {
            // Player has snow infection but not bear infection
            system.run(() => {
                player.sendMessage("§eNah bro, you are doomed...");
            });
        }
    }
});

// Handle player death: if infected, spawn a bear at their death location (no inventory logic)
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    const source = event.damageSource;
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

                const mapleBearTypes = [MAPLE_BEAR_ID, INFECTED_BEAR_ID, BUFF_BEAR_ID];
    if (source && source.damagingEntity && mapleBearTypes.includes(source.damagingEntity.typeId)) {
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

        // Normal infection logic - can infect if not already infected
        if (!bearInfection.has(player.id)) {
            bearInfection.set(player.id, { ticksLeft: BEAR_INFECTION_TICKS, cured: false, hitWhileImmune: false });
            player.addTag(INFECTED_TAG);
            player.sendMessage("§4You start to feel off...");

            // IMMEDIATELY save the infection data
            saveInfectionData(player);
            console.log(`[INFECTION] Immediately saved bear infection data for ${player.name}`);
        } else {
            // Player already has infection data, check if it was cured
            const existingInfection = bearInfection.get(player.id);
            if (existingInfection.cured) {
                // They were cured before, can be infected again
                bearInfection.set(player.id, { ticksLeft: BEAR_INFECTION_TICKS, cured: false, hitWhileImmune: false });
                player.addTag(INFECTED_TAG);
                player.sendMessage("§4You start to feel off...");

                // IMMEDIATELY save the new infection data
                saveInfectionData(player);
                console.log(`[INFECTION] Immediately saved new bear infection data for ${player.name}`);
            }
        }
    }
});

// --- Snow Infection: On eating snow ---
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;
    if (item?.typeId === SNOW_ITEM_ID) {
        let state = snowInfection.get(player.id);
        if (!state) {
            // Check if player is immune to infection - if so, make transformation take 6x longer (20s -> 2min)
            const isImmune = isPlayerImmune(player);
            const baseTime = SNOW_INFECTION_START; // 20 seconds
            const adjustedTime = isImmune ? baseTime * 6 : baseTime; // 6x = 2 minutes

            state = { ticksLeft: adjustedTime, snowCount: 1 };

            if (isImmune) {
                console.log(`[INFECTION] ${player.name} is immune, drug addiction will take 6x longer (${Math.floor(adjustedTime / 20)}s)`);
                player.sendMessage("§eYour recent cure makes you more resistant to the 'snow'... but why did you eat it again cuh?");
            } else {
                console.log(`[INFECTION] ${player.name} normal drug addiction (${Math.floor(adjustedTime / 20)}s)`);
            }
        } else {
            state.ticksLeft = Math.max(SNOW_INFECTION_MIN, state.ticksLeft - SNOW_INFECTION_DECREMENT);
            state.snowCount++;
        }
        snowInfection.set(player.id, state);
        player.addTag(INFECTED_TAG);

        // IMMEDIATELY save the snow infection data
        saveInfectionData(player);
        console.log(`[SNOW] Immediately saved snow infection data for ${player.name}`);

        // Apply nausea effect for the full duration of the infection
        const nauseaDuration = state.ticksLeft; // Use the actual infection duration (already adjusted for immunity)

        try {
            player.addEffect("minecraft:nausea", nauseaDuration, { amplifier: 9 });
            console.log(`[SNOW] Applied nausea effect for ${nauseaDuration} ticks (${Math.floor(nauseaDuration / 20)} seconds) to ${player.name}`);
        } catch (error) {
            console.warn(`[SNOW] Error applying nausea effect: ${error}`);
        }

        // The "You start to feel funny..." message is handled in the itemCompleteUse handler above
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
            const hasBearInfection = bearInfection.has(player.id) && !bearInfection.get(player.id).cured;
            const hasSnowInfection = snowInfection.has(player.id);
            const bearTicks = hasBearInfection ? bearInfection.get(player.id).ticksLeft : 0;
            const snowTicks = hasSnowInfection ? snowInfection.get(player.id).ticksLeft : 0;

            player.sendMessage(`§6=== Infection Status ===`);
            player.sendMessage(`§eBear Infection: ${hasBearInfection ? '§cYES' : '§aNO'}`);
            if (hasBearInfection) {
                const daysLeft = Math.ceil(bearTicks / 24000);
                player.sendMessage(`§eDays until transformation: §c${daysLeft}`);
            }
            player.sendMessage(`§eSnow Infection: ${hasSnowInfection ? '§cYES' : '§aNO'}`);
            if (hasSnowInfection) {
                const minutesLeft = Math.ceil(snowTicks / 1200);
                player.sendMessage(`§eMinutes until transformation: §c${minutesLeft}`);
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
    // Bear infection
    for (const [id, state] of bearInfection.entries()) {
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
            console.log(`[INFECTION] ${player.name} succumbs to bear infection and transforms!`);
            player.kill();
            player.dimension.spawnEntity(INFECTED_BEAR_ID, player.location);
            player.sendMessage("§4You succumbed to the infection!");
            player.removeTag(INFECTED_TAG);
            bearInfection.delete(id);
        } else if (Math.random() < 0.025) { // Reduced chance for 40-tick interval
            applyRandomEffect(player);
        }
    }
    // Snow infection
    for (const [id, state] of snowInfection.entries()) {
        const player = world.getAllPlayers().find(p => p.id === id);
        if (!player) continue;
        state.ticksLeft -= 40; // Adjusted for 40-tick interval

        // Save data periodically
        saveInfectionData(player);

        // Side effects: more frequent as timer shortens
        let effectChance = 0.005 + (SNOW_INFECTION_START - state.ticksLeft) / SNOW_INFECTION_START * 0.045; // Reduced for 40-tick interval
        if (Math.random() < effectChance) {
            applyRandomEffect(player);
        }
        if (state.ticksLeft <= 0) {
            console.log(`[INFECTION] ${player.name} succumbs to snow infection and transforms!`);
            player.kill();
            player.dimension.spawnEntity(INFECTED_BEAR_ID, player.location);
            player.sendMessage("§4I knew that snow was too good to be true...");
            player.removeTag(INFECTED_TAG);
            snowInfection.delete(id);
        } else if (state.ticksLeft <= 100 && !state.warningSent) { // 5 seconds before transformation
            // Send warning message a few seconds before transformation
            player.sendMessage("§4You don't feel so good...");
            state.warningSent = true;
            snowInfection.set(id, state);
        }
    }
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

// --- Maple Bear Snow Trail (lightweight placeholder) ---
// Leaves occasional snow layers under bears, with per-type frequency and throttling
const lastSnowTrailTickByEntity = new Map();
const TRAIL_COOLDOWN_TICKS = 40; // 2s between placements per entity
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

system.runInterval(() => {
    try {
        const nowTick = system.currentTick;
        for (const entity of world.getAllEntities()) {
            if (!entity || !entity.isValid) continue;
            const t = entity.typeId;
            if (t !== MAPLE_BEAR_ID && t !== INFECTED_BEAR_ID && t !== BUFF_BEAR_ID) continue;

            // Per-type chance
            let chance = 0.02; // tiny default
            if (t === INFECTED_BEAR_ID) chance = 0.06;
            if (t === BUFF_BEAR_ID) chance = 0.2;

            // Per-entity cooldown
            const last = lastSnowTrailTickByEntity.get(entity.id) ?? 0;
            if (nowTick - last < TRAIL_COOLDOWN_TICKS) continue;
            if (Math.random() < chance) {
                tryPlaceSnowLayerUnder(entity);
                lastSnowTrailTickByEntity.set(entity.id, nowTick);
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
    }
});

// --- Infection State Reset on Death/Respawn ---
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    if (entity instanceof Player) {
        // Clear all infection data on death
        bearInfection.delete(entity.id);
        snowInfection.delete(entity.id);
        curedPlayers.delete(entity.id);
        entity.removeTag(INFECTED_TAG);

        // Clear dynamic properties on death
        try {
            entity.setDynamicProperty("mb_bear_infection", undefined);
            entity.setDynamicProperty("mb_snow_infection", undefined);
            entity.setDynamicProperty("mb_immunity_end", undefined);
            console.log(`[DEATH] Cleared all infection data for ${entity.name}`);
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
        const bearData = bearInfection.get(player.id);
        if (bearData) {
            player.setDynamicProperty("mb_bear_infection", JSON.stringify(bearData));
        } else {
            player.setDynamicProperty("mb_bear_infection", undefined);
        }

        // Save snow infection
        const snowData = snowInfection.get(player.id);
        if (snowData) {
            player.setDynamicProperty("mb_snow_infection", JSON.stringify(snowData));
        } else {
            player.setDynamicProperty("mb_snow_infection", undefined);
        }

        // Save immunity
        const immunityEndTime = curedPlayers.get(player.id);
        if (immunityEndTime) {
            player.setDynamicProperty("mb_immunity_end", immunityEndTime.toString());
        } else {
            player.setDynamicProperty("mb_immunity_end", undefined);
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
        // Load bear infection
        const bearDataStr = player.getDynamicProperty("mb_bear_infection");
        if (bearDataStr) {
            const bearData = JSON.parse(bearDataStr);

            // Check if the infection was cured
            if (bearData.cured) {
                console.log(`[LOAD] ${player.name} had cured bear infection, not loading active infection`);
                // Don't load cured infections back into memory
                player.setDynamicProperty("mb_bear_infection", undefined);
            } else {
                bearInfection.set(player.id, bearData);
                console.log(`[LOAD] Loaded active bear infection for ${player.name}: ${JSON.stringify(bearData)}`);

                // Add infection tag if they have an active infection
                if (!player.hasTag(INFECTED_TAG)) {
                    player.addTag(INFECTED_TAG);
                    console.log(`[LOAD] Added infection tag to ${player.name}`);
                }
            }
        }

        // Load snow infection
        const snowDataStr = player.getDynamicProperty("mb_snow_infection");
        if (snowDataStr) {
            const snowData = JSON.parse(snowDataStr);
            snowInfection.set(player.id, snowData);
            console.log(`[LOAD] Loaded snow infection for ${player.name}: ${JSON.stringify(snowData)}`);

            // Add infection tag if they have snow infection
            if (!player.hasTag(INFECTED_TAG)) {
                player.addTag(INFECTED_TAG);
                console.log(`[LOAD] Added infection tag to ${player.name} for snow infection`);
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
        const hasBear = bearInfection.has(player.id) && !bearInfection.get(player.id).cured;
        const hasSnow = snowInfection.has(player.id);
        const immune = isPlayerImmune(player);

        const typeText = hasBear && hasSnow
            ? "Bear + Snow"
            : hasBear
                ? "Bear"
                : hasSnow
                    ? "Snow"
                    : "None";

        const lines = [];
        lines.push("§6=== Infection Tracker ===");
        lines.push(`§eType: §f${typeText}`);

        if (hasBear) {
            const bearTicks = bearInfection.get(player.id).ticksLeft || 0;
            const bearDays = Math.ceil(bearTicks / 24000);
            lines.push(`§eBear: §c${formatTicksDuration(bearTicks)} (§f~${bearDays} day${bearDays !== 1 ? 's' : ''}§c)`);
            lines.push("§7Cure: §fDrink Weakness then eat a Golden Apple");
        }

        if (hasSnow) {
            const snowTicks = snowInfection.get(player.id).ticksLeft || 0;
            lines.push(`§eSnow: §c${formatTicksDuration(snowTicks)}`);
            lines.push("§7Cure: §fNone. Transformation at timer end");
        }

        if (!hasBear && !hasSnow) {
            lines.push("§aYou are currently healthy.");
        }

        if (immune) {
            const end = curedPlayers.get(player.id);
            const remainingMs = Math.max(0, end - Date.now());
            lines.push(`§bImmunity: §fACTIVE (§b${formatMillisDuration(remainingMs)} left§f)`);
        } else {
            lines.push("§bImmunity: §7None");
        }

        // Build UI like a signed book page
        const body = lines.join("\n");
        const form = new ActionFormData()
            .title("§6Infection Tracker")
            .body(body)
            .button("§8Close");
        player.playSound("random.orb", { pitch: 1.2, volume: 0.6 });
        form.show(player).catch(() => { });
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
    player.onScreenDisplay.setTitle("§4☣️ You are infected!");
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
        
        // Get the player's inventory before spawning the bear
        const inventory = playerInventories.get(player.id);
        
        // Spawn infected Maple Bear at death location
        const bear = dimension.spawnEntity(INFECTED_BEAR_ID, location);
        if (bear) {
            // Set name tag for visual identification
            bear.nameTag = `§4☣️ ${player.name}'s Infected Form`;
            
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

// Run transformation process every second
// Comment out tick counter logging
system.runInterval(() => {
    // Process each transforming player
    // Remove transformation interval and all references to transformingPlayers
}, 20); // Run every second

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
        bear.nameTag = `§4☣️ ${playerName}'s Infected Form`;
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

// Remove all scripted spawning logic for Maple Bears, including the system.runInterval that spawns them and any related debug logging.

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

    const hasBearInfection = bearInfection.has(player.id) && !bearInfection.get(player.id).cured;
    const hasSnowInfection = snowInfection.has(player.id);
    const bearTicks = hasBearInfection ? bearInfection.get(player.id).ticksLeft : 0;
    const snowTicks = hasSnowInfection ? snowInfection.get(player.id).ticksLeft : 0;
    const isImmune = isPlayerImmune(player);

    console.log(`[TEST] === Infection Status for ${player.name} ===`);
    console.log(`[TEST] Bear Infection: ${hasBearInfection ? 'YES' : 'NO'}`);
    if (hasBearInfection) {
        const daysLeft = Math.ceil(bearTicks / 24000);
        console.log(`[TEST] Days until transformation: ${daysLeft}`);
    }
    console.log(`[TEST] Snow Infection: ${hasSnowInfection ? 'YES' : 'NO'}`);
    if (hasSnowInfection) {
        const minutesLeft = Math.ceil(snowTicks / 1200);
        console.log(`[TEST] Minutes until transformation: ${minutesLeft}`);
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
            showInfectionBookReport(player);
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
            const hasBearInfection = bearInfection.has(player.id) && !bearInfection.get(player.id).cured;
            const hasSnowInfection = snowInfection.has(player.id);

            if (hasBearInfection) {
                player.sendMessage("§4You are infected with bear infection! Cure yourself within 20 days with a weakness potion and a golden apple!");
                player.addTag(INFECTED_TAG);
            } else if (hasSnowInfection) {
                player.sendMessage("§4You are infected with snow infection!");
                player.addTag(INFECTED_TAG);
            } else {
                player.sendMessage("§aYou are not currently infected.");
            }
        });
    }
    */
});
