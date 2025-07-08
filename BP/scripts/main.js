import { world, system, EntityTypes, Entity, Player, ItemStack } from "@minecraft/server";
import { initializeDayTracking, getCurrentDay } from "./mb_dayTracker.js";

// Constants for Maple Bear behavior
const MAPLE_BEAR_ID = "mb:mb";
const INFECTED_BEAR_ID = "mb:infected";
const BUFF_BEAR_ID = "mb:buff_mb";
const SNOW_ITEM_ID = "mb:snow";
const INFECTED_TAG = "mb_infected";
const INFECTED_CORPSE_ID = "mb:infected_corpse";

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
const BEAR_INFECTION_TICKS = 24000 * 20; // 20 Minecraft days
const SNOW_INFECTION_START = 24000 * 3; // 3 Minecraft days
const SNOW_INFECTION_MIN = 1200; // 1 minute
const SNOW_INFECTION_DECREMENT = 2400; // 2 minutes per snow
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
                player.addEffect("minecraft:nausea", 550, { amplifier: 9 });
                player.playSound("mob.wolf.growl");
                player.dimension.runCommand(`particle minecraft:smoke_particle ${player.location.x} ${player.location.y + 1} ${player.location.z}`);
                player.sendMessage("§4You start to feel funny...");
                // Infect the player
                player.addTag(INFECTED_TAG);
                player.playSound("mob.wither.spawn", { pitch: 0.8, volume: 0.6 });
                player.onScreenDisplay.setTitle("§4☣️ You are infected!");
                player.onScreenDisplay.setActionBar("§cThe Maple Bear infection spreads...");
            });
        } catch (error) {
            console.warn("Error applying snow effects:", error);
        }
    }
});

// Handle player death: if infected, spawn a bear at their death location (no inventory logic)
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    const source = event.damageSource;
    if (entity instanceof Player) {
        // If player is infected, spawn a bear at their death location
        if (entity.hasTag(INFECTED_TAG)) {
            try {
                const bear = entity.dimension.spawnEntity(INFECTED_BEAR_ID, entity.location);
                if (bear) {
                    bear.nameTag = `§4☣️ ${entity.name}'s Infected Form`;
                }
            } catch (error) {
                console.warn("Error spawning infected bear on player death:", error);
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
                    } catch (error) {}
                }
            }
        } catch (error) {
            console.warn("Error handling infected bear death (all corrupt test):", error);
        }
    }
});

// Remove any remaining infected bear death logging
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    if (entity.typeId === INFECTED_BEAR_ID) {
        // No debug, log, or output
        // No item corruption or processing
    }
});

// Temporarily disable all item corruption on infected Maple Bear death
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    if (entity.typeId === INFECTED_BEAR_ID) {
        // Do not process inventory or equipment, do not spawn snow, do nothing to items
    }
});

// --- Bear Infection: On hit by Maple Bear ---
world.afterEvents.entityHurt.subscribe((event) => {
    const player = event.hurtEntity;
    const source = event.damageSource;
    if (!(player instanceof Player)) return;
    const mapleBearTypes = [MAPLE_BEAR_ID, INFECTED_BEAR_ID, BUFF_BEAR_ID];
    if (source && source.damagingEntity && mapleBearTypes.includes(source.damagingEntity.typeId)) {
        if (!bearInfection.has(player.id)) {
            bearInfection.set(player.id, { ticksLeft: BEAR_INFECTION_TICKS, cured: false });
            player.addTag(INFECTED_TAG);
            player.sendMessage("§4You have been infected! Cure yourself within 20 days with a weakness potion and a notch apple!");
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
            state = { ticksLeft: SNOW_INFECTION_START, snowCount: 1 };
        } else {
            state.ticksLeft = Math.max(SNOW_INFECTION_MIN, state.ticksLeft - SNOW_INFECTION_DECREMENT);
            state.snowCount++;
        }
        snowInfection.set(player.id, state);
        player.addTag(INFECTED_TAG);
        player.sendMessage(`§bYou feel cold... (${Math.floor(state.ticksLeft/1200)} min until transformation)`);
    }
});

// --- Cure Logic: On item use (notch apple) ---
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;
    if (bearInfection.has(player.id) && !bearInfection.get(player.id).cured) {
        if (item?.typeId === "minecraft:enchanted_golden_apple") {
            // Check for weakness effect
            if (player.hasEffect("minecraft:weakness")) {
                bearInfection.set(player.id, { ticksLeft: 0, cured: true });
                player.removeTag(INFECTED_TAG);
                player.sendMessage("§aYou have cured your infection!");
            } else {
                player.sendMessage("§eYou need to have weakness to cure the infection!");
            }
        }
    }
});

// --- Infection Timers and Effects ---
system.runInterval(() => {
    // Bear infection
    for (const [id, state] of bearInfection.entries()) {
        const player = world.getAllPlayers().find(p => p.id === id);
        if (!player || state.cured) continue;
        state.ticksLeft -= 20;
        if (state.ticksLeft <= 0) {
            // Transform!
            player.kill();
            player.dimension.spawnEntity(INFECTED_BEAR_ID, player.location);
            player.sendMessage("§4You succumbed to the infection!");
            player.removeTag(INFECTED_TAG);
            bearInfection.delete(id);
        } else if (Math.random() < 0.05) { // 5% chance every second
            applyRandomEffect(player);
        }
    }
    // Snow infection
    for (const [id, state] of snowInfection.entries()) {
        const player = world.getAllPlayers().find(p => p.id === id);
        if (!player) continue;
        state.ticksLeft -= 20;
        // Side effects: more frequent as timer shortens
        let effectChance = 0.01 + (SNOW_INFECTION_START - state.ticksLeft) / SNOW_INFECTION_START * 0.09; // 1% to 10%
        if (Math.random() < effectChance) {
            applyRandomEffect(player);
        }
        if (state.ticksLeft <= 0) {
            player.kill();
            player.dimension.spawnEntity(INFECTED_BEAR_ID, player.location);
            player.sendMessage("§4The snow has claimed you!");
            player.removeTag(INFECTED_TAG);
            snowInfection.delete(id);
        }
    }
}, 20);

// --- Infection State Reset on Death/Respawn ---
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    if (entity instanceof Player) {
        bearInfection.delete(entity.id);
        snowInfection.delete(entity.id);
        entity.removeTag(INFECTED_TAG);
    }
});
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    bearInfection.delete(player.id);
    snowInfection.delete(player.id);
    player.removeTag(INFECTED_TAG);
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
            console.log("=== BEAR INVENTORY STORAGE ===");
            console.log(`Storing inventory data in bear for ${player.name}...`);
            console.log(`Inventory data to store: ${JSON.stringify(inventory)}`);
                bear.setDynamicProperty("original_inventory", JSON.stringify(inventory));
            console.log("✅ Inventory data stored in bear's dynamic properties");
            console.log("=== END BEAR INVENTORY STORAGE ===");
            
            // Add particle effects, sounds, and broadcast as before
            spreadSnowEffect(location, dimension);
            dimension.playSound("mob.wither.death", location, { pitch: 0.7, volume: 0.5 });
            dimension.playSound("random.glass", location, { pitch: 0.5, volume: 1.0 });
            dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${player.name} transformed into a Maple Bear!"}]}`);
            
            // Check what items are dropped around the bear after a short delay
            system.runTimeout(() => {
                try {
                    const nearbyItems = player.dimension.getEntities({
                        location: bear.location,
                        maxDistance: 5,
                        type: "minecraft:item"
                    });
                    console.log(`=== DROPPED ITEMS CHECK ===`);
                    console.log(`Found ${nearbyItems.length} items near the transformed bear:`);
                    nearbyItems.forEach((item, index) => {
                        const itemComp = item.getComponent("item");
                        const itemStack = itemComp ? itemComp.itemStack : null;
                        if (itemStack) {
                            console.log(`  Item ${index + 1}: ${itemStack.typeId} x${itemStack.amount} at distance ${Math.round(item.location.distanceTo(bear.location) * 10) / 10}`);
                        }
                    });
                    console.log(`=== END DROPPED ITEMS CHECK ===`);
                } catch (error) {
                    console.warn("Error checking dropped items:", error);
                }
            }, 20); // Check after 1 second
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
        } catch (e) {}
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
    } catch (error) {}
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
        player.sendMessage("§8[MBI] §cYou succumbed to the infection...");
    }, 40); // 2 seconds
}

// Remove all scripted spawning logic for Maple Bears, including the system.runInterval that spawns them and any related debug logging.

// --- Day Tracking System Initialization (forced for debugging) ---
system.run(() => {
    try {
        initializeDayTracking();
        // console.warn("[DEBUG] Forced call to initializeDayTracking() on script load");
    } catch (err) {
        console.warn("[ERROR] Forced initializeDayTracking() failed:", err);
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