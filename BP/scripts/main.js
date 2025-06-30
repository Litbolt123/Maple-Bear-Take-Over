import { world, system, EntityTypes, Entity, Player, ItemStack } from "@minecraft/server";
import { 
    getCurrentDay, 
    setCurrentDay, 
    isMilestoneDay, 
    initializeDayTracking, 
    ensureScoreboardExists, 
    handleMilestoneDay 
} from "./mb_dayTracker.js";

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
const transformingPlayers = new Map();

// Track player inventories for clone drops
const playerInventories = new Map();

// Track infected players
const infectedPlayers = new Set();

// Track if we're currently handling a death to prevent double spawning
let isHandlingDeath = false;

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
                    console.log(`✅ Found armor item in slot ${i}: ${item.typeId} (slot ${armorTypes[item.typeId]})`);
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
                console.log(`✅ Found armor item in inventory slot ${i}: ${item.typeId} (slot ${slotIndex})`);
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
                    console.log(`✅ Captured offhand item via equipment component: ${offhand.typeId}`);
                    return {
                        typeId: offhand.typeId,
                        amount: offhand.amount,
                        data: offhand.data || 0
                    };
                }
            }
        }
    } catch (error) {
        console.log("Equipment component not available:", error);
    }

    // Method 2: Try specific offhand slots
    for (const slotNum of offhandSlots) {
        try {
            const item = inventory.getItem(slotNum);
            if (item && offhandTypes.includes(item.typeId)) {
                console.log(`✅ Found offhand item in slot ${slotNum}: ${item.typeId}`);
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
                console.log(`✅ Found offhand item in inventory slot ${i}: ${item.typeId}`);
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

/**
 * Debug function to dump all inventory slots
 * @param {Player} player - The player to debug
 */
function debugInventoryDump(player) {
    const inventory = player.getComponent("inventory")?.container;
    if (!inventory) {
        console.log("❌ No inventory component found");
        return;
    }

    console.log("=== INVENTORY DUMP ===");
    for (let i = 0; i < inventory.size; i++) {
        try {
            const item = inventory.getItem(i);
            if (item) {
                console.log(`Slot ${i}: ${item.typeId} x${item.amount}`);
            }
        } catch (error) {
            // Slot doesn't exist
        }
    }
    console.log("=== END INVENTORY DUMP ===");
}

// Wait for the world to initialize before setting up event-driven systems
world.afterEvents.worldInitialize.subscribe(() => {
    console.log("World initialized, setting up event listeners...");

    // Handle snow item consumption
    world.afterEvents.itemCompleteUse.subscribe((event) => {
        const player = event.source;
        const item = event.itemStack;
        
        if (item?.typeId === SNOW_ITEM_ID) {
            try {
                system.run(() => {
                    // Apply nausea effect using API
                    player.addEffect("minecraft:nausea", 550, { amplifier: 9 }); // 20 seconds (400 ticks) with amplifier 9
                    // Play effects
                    player.playSound("mob.wolf.growl");
                    player.dimension.runCommand(`particle minecraft:smoke_particle ${player.location.x} ${player.location.y + 1} ${player.location.z}`);
                    
                    // Send initial message with proper formatting
                    player.runCommand(`tellraw @s {"rawtext":[{"text":"§4You start to feel funny..."}]}`);
                    
                    // Start transformation tracking (don't capture inventory yet)
                    transformingPlayers.set(player.id, {
                        ticks: 0,
                        playerName: player.name
                    });

                    // Mark player as infected
                    infectPlayer(player);
                });
            } catch (error) {
                console.warn("Error applying snow effects:", error);
            }
        }
    });

    // Handle player death to clean up transformation timers
    world.afterEvents.entityDie.subscribe((event) => {
        const entity = event.deadEntity;
        
        // Clean up transformation tracking
        if (entity instanceof Player) {
            // Check if player was just transformed via script
            if (entity.hasTag("just_transformed")) {
                entity.removeTag("just_transformed");
                console.log(`Player ${entity.name} was just transformed, skipping death handler`);
                return; // Skip bear spawn because we already did it in transformation
            }
            
            transformingPlayers.delete(entity.id);
            playerInventories.delete(entity.id);

            // Check if player was infected
            if (isPlayerInfected(entity) && !isHandlingDeath) {
                isHandlingDeath = true;
                handleInfectedDeath(entity);
                isHandlingDeath = false;
            }
        }
        
        // Handle clone death drops
        if (entity.typeId === INFECTED_BEAR_ID) {
            try {
                console.log("=== INFECTED BEAR DEATH HANDLER ===");
                // Check if this bear was transformed from a player using dynamic property
                const infectedBy = entity.getDynamicProperty("infected_by");
                const inventoryJson = entity.getDynamicProperty("original_inventory");
                
                console.log(`Bear death - Infected by: ${infectedBy}`);
                console.log(`Bear death - Has inventory data: ${!!inventoryJson}`);
                
                if (infectedBy && inventoryJson) {
                    const inventory = JSON.parse(inventoryJson);
                    console.log("Infected bear death - Inventory data:", inventory);
                    console.log("Infected bear death - Inventory length:", inventory?.length);
                    
                    if (!Array.isArray(inventory) || inventory.length === 0) {
                        console.log("Infected bear death - No valid inventory to drop");
                        return;
                    }

                    const location = entity.location;
                    const dimension = entity.dimension;

                    // Shuffle and limit how many items we try to drop
                    const shuffled = [...inventory].sort(() => 0.5 - Math.random());
                    
                    // Calculate total individual items (not stacks)
                    const totalIndividualItems = shuffled.reduce((total, entry) => total + (entry.amount || 1), 0);
                    
                    // Calculate how many individual items to preserve (20% of total individual items)
                    const individualItemsToPreserve = Math.max(1, Math.floor(totalIndividualItems * 0.2));
                    
                    console.log(`Infected bear death - Attempting to preserve ${individualItemsToPreserve} individual items from ${totalIndividualItems} total individual items (${shuffled.length} stacks)`);

                    // First, preserve individual items (not stacks) with maximum variety
                    let preservedCount = 0;
                    
                    // Group items by type for better variety
                    const itemGroups = {};
                    shuffled.forEach(entry => {
                        if (entry && entry.typeId) {
                            if (!itemGroups[entry.typeId]) {
                                itemGroups[entry.typeId] = [];
                            }
                            itemGroups[entry.typeId].push(entry);
                        }
                    });
                    
                    // Get unique item types and shuffle them for randomness
                    const uniqueItemTypes = Object.keys(itemGroups).sort(() => Math.random() - 0.5);
                    
                    // Calculate max items per type with special limits for tools
                    let maxItemsPerType = Math.max(1, Math.floor(individualItemsToPreserve / uniqueItemTypes.length));
                    
                    // Limit tools to prevent getting too many back
                    const toolTypes = ['minecraft:sword', 'minecraft:pickaxe', 'minecraft:axe', 'minecraft:shovel', 'minecraft:hoe', 'minecraft:bow', 'minecraft:crossbow', 'minecraft:trident', 'minecraft:shield'];
                    const maxToolsPerType = 1; // Only 1 tool per type maximum
                    
                    console.log(`Infected bear death - Found ${uniqueItemTypes.length} unique item types, max ${maxItemsPerType} items per type (tools limited to ${maxToolsPerType})`);
                    
                    // Preserve items from each type to ensure variety (in random order)
                    for (const itemType of uniqueItemTypes) {
                        if (preservedCount >= individualItemsToPreserve) break;
                        
                        const itemsOfThisType = itemGroups[itemType];
                        let itemsPreservedFromType = 0;
                        
                        // Check if this is a tool type
                        const isTool = toolTypes.some(toolType => itemType.includes(toolType));
                        const maxForThisType = isTool ? maxToolsPerType : maxItemsPerType;
                        
                        // Shuffle the stacks of this item type for randomness
                        const shuffledStacks = [...itemsOfThisType].sort(() => Math.random() - 0.5);
                        
                        for (const entry of shuffledStacks) {
                            if (preservedCount >= individualItemsToPreserve || itemsPreservedFromType >= maxForThisType) break;
                            
                            const dropLocation = { 
                                x: location.x + Math.random() - 0.5, 
                                y: location.y + 0.5, 
                                z: location.z + Math.random() - 0.5 
                            };

                            // Calculate how many items from this stack to preserve (with randomness)
                            const itemsInStack = entry.amount || 1;
                            const maxPossibleFromStack = Math.min(
                                itemsInStack, 
                                individualItemsToPreserve - preservedCount,
                                maxForThisType - itemsPreservedFromType
                            );
                            
                            // Add randomness to the amount preserved based on item type
                            let itemsToPreserveFromStack;
                            
                            // Check if this is a non-stackable item (tools, armor, etc.)
                            const nonStackableItems = ['minecraft:sword', 'minecraft:pickaxe', 'minecraft:axe', 'minecraft:shovel', 'minecraft:hoe', 'minecraft:bow', 'minecraft:crossbow', 'minecraft:trident', 'minecraft:shield', 'minecraft:helmet', 'minecraft:chestplate', 'minecraft:leggings', 'minecraft:boots', 'minecraft:elytra'];
                            const isNonStackable = nonStackableItems.some(itemType => entry.typeId.includes(itemType));
                            
                            if (isNonStackable) {
                                // For non-stackable items, preserve 0 or 1 (random)
                                itemsToPreserveFromStack = Math.random() < 0.5 ? 0 : Math.min(1, maxPossibleFromStack);
                            } else {
                                // For stackable items, preserve random amount between 1 and max possible (or max stack size)
                                const maxStackSize = getMaxStackSize(entry.typeId);
                                const maxToPreserve = Math.min(maxPossibleFromStack, maxStackSize);
                                itemsToPreserveFromStack = maxToPreserve > 1 ? 
                                    Math.floor(Math.random() * maxToPreserve) + 1 : 
                                    maxToPreserve;
                            }
                            
                            if (itemsToPreserveFromStack > 0) {
                                // Preserve and drop the selected items from this stack
                                try {
                                    const itemStack = new ItemStack(entry.typeId, itemsToPreserveFromStack);
                                    dimension.spawnItem(itemStack, dropLocation);
                                    console.log(`Infected bear death - Preserved and dropped ${itemsToPreserveFromStack} items of ${entry.typeId} at ${dropLocation.x}, ${dropLocation.y}, ${dropLocation.z}`);
                                    
                                    // Add preservation particle effect (simplified)
                                    try {
                                        dimension.runCommand(`particle minecraft:glow ${Math.round(dropLocation.x)} ${Math.round(dropLocation.y)} ${Math.round(dropLocation.z)}`);
                                    } catch (error) {
                                        console.warn("Failed to spawn preservation particle:", error);
                                    }
                                    
                                    preservedCount += itemsToPreserveFromStack;
                                    itemsPreservedFromType += itemsToPreserveFromStack;
                                } catch (error) {
                                    console.warn(`Failed to preserve items of ${entry.typeId}:`, error);
                                    // Fallback to snow if preservation fails
                                    const snowItem = new ItemStack(SNOW_ITEM_ID, itemsToPreserveFromStack);
                                    dimension.spawnItem(snowItem, dropLocation);
                                    console.log(`Infected bear death - Fallback snow spawned for failed items of ${entry.typeId}`);
                                    preservedCount += itemsToPreserveFromStack;
                                    itemsPreservedFromType += itemsToPreserveFromStack;
                                }
                            }
                        }
                    }
                    
                    // Then, corrupt the remaining individual items into snow (50% of remaining individual items, but capped)
                    const remainingIndividualItems = totalIndividualItems - preservedCount;
                    const corruptionCount = Math.min(
                        Math.floor(remainingIndividualItems * 0.5), // 50% of remaining
                        20 // Cap at 20 snow items maximum
                    );
                    
                    console.log(`Infected bear death - Corrupting ${corruptionCount} of ${remainingIndividualItems} remaining individual items into snow (capped at 20)`);
                    
                    for (let i = 0; i < corruptionCount; i++) {
                        const dropLocation = { 
                            x: location.x + Math.random() - 0.5, 
                            y: location.y + 0.5, 
                            z: location.z + Math.random() - 0.5 
                        };
                        
                        // Corrupt to snow
                        const snowItem = new ItemStack(SNOW_ITEM_ID, 1);
                        dimension.spawnItem(snowItem, dropLocation);
                        console.log(`Infected bear death - Spawned corrupted snow from remaining items at ${dropLocation.x}, ${dropLocation.y}, ${dropLocation.z}`);
                        
                        // Add corruption particle effect (simplified)
                        try {
                            dimension.runCommand(`particle minecraft:snowflake ${Math.round(dropLocation.x)} ${Math.round(dropLocation.y)} ${Math.round(dropLocation.z)}`);
                        } catch (error) {
                            console.warn("Failed to spawn corruption particle:", error);
                        }
                    }
                    
                    // Broadcast corruption message
                    dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§8[MBI] §7The corrupted form releases its twisted contents..."}]}`);
                } else {
                    console.log("Infected bear death - No player data found, skipping inventory drop");
                }
                console.log("=== END INFECTED BEAR DEATH HANDLER ===");
            } catch (error) {
                console.warn("Error handling infected bear death:", error);
            }
        }
    });

    // Handle player damage from Maple Bears
    world.afterEvents.entityHurt.subscribe((event) => {
        const player = event.hurtEntity;
        const source = event.damageSource;
        
        // Make sure it's a player that was hurt
        if (!player || !(player instanceof Player)) {
            return;
        }
        
        // Check if damage was caused by an entity
        if (source && source.damagingEntity) {
            const damager = source.damagingEntity;
            
            if (damager && damager.typeId === MAPLE_BEAR_ID) {
                // Apply poison when hit
                system.run(() => {
                    player.addEffect("minecraft:poison", 60, { amplifier: 0.5 }); // 3 seconds, level 1
                    
                    // Random chance (30%) to apply an additional random freaky effect
                    if (Math.random() < 0.3) {
                        const randomEffect = FREAKY_EFFECTS[Math.floor(Math.random() * FREAKY_EFFECTS.length)];
                        player.addEffect(randomEffect.effect, randomEffect.duration, { amplifier: randomEffect.amplifier });
                    }

                    // Chance to infect player (10%)
                    if (Math.random() < 0.1 && !isPlayerInfected(player)) {
                        infectPlayer(player);
                    }
                });
            }
        }
    });

    console.log("Event listeners set up.");
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
    player.runCommand(`title @s title {"rawtext":[{"text":"§4☣️ You are infected!"}]}`);
    player.runCommand(`title @s actionbar {"rawtext":[{"text":"§cThe Maple Bear infection spreads..."}]}`);
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
                        const itemStack = item.getItemStack();
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
    for (const [playerId, data] of transformingPlayers.entries()) {
        data.ticks += 20; // Increase by 20 ticks (1 second)
        
        const player = Array.from(world.getAllPlayers()).find(p => p.id === playerId);
        
        // Check transformation stages
        if (data.ticks >= 300 && data.ticks < 320) {
            // At 15 seconds (300 ticks), send warning message
            if (player) {
                system.run(() => {
                    player.runCommand(`tellraw @s {"rawtext":[{"text":"§4You don't feel so good..."}]}`);
                });
            } else {
                // If player isn't found, try with saved name
                world.getDimension("overworld").runCommand(`tellraw "${data.playerName}" {"rawtext":[{"text":"§4You don't feel so good..."}]}`);
            }
        }
        else if (data.ticks >= 400) {
            // At 20 seconds (400 ticks), transform player
            if (player) {
                system.run(() => {
                    try {
                        // Capture the full inventory before clearing weapon slots
                        // Capture player inventory right before transformation (includes items added after eating snow)
                        const inventory = [];
                        let totalItemCount = 0;
                        console.log("=== INVENTORY CAPTURE START ===");
                        console.log(`Capturing inventory for ${data.playerName}...`);

                        for (let i = 0; i < player.getComponent("inventory").container.size; i++) {
                            const item = player.getComponent("inventory").container.getItem(i);
                            if (item) {
                                // Store item data in a format that survives JSON serialization
                                inventory.push({ 
                                    slot: i, 
                                    typeId: item.typeId,
                                    amount: item.amount,
                                    data: item.data || 0
                                });
                                totalItemCount += item.amount; // Count individual items, not stacks
                                console.log(`Slot ${i}: ${item.typeId} x${item.amount}`);
                            }
                        }

                        console.log(`Total inventory captured: ${inventory.length} item stacks (${totalItemCount} total items)`);
                        console.log("=== INVENTORY CAPTURE END ===");

                        // Store captured inventory in player data for later use
                        playerInventories.set(playerId, inventory);
                        console.log(`Stored inventory data for ${data.playerName} in playerInventories map`);

                        // Kill the player first (only clear weapon/shield slots)
                        player.addTag("just_transformed");

                        // Clear only weapon/shield slots so they drop for the bear to pick up
                        try {
                            const playerInventory = player.getComponent("inventory");
                            if (playerInventory && playerInventory.container) {
                                // Clear main hand slot (slot 0) - this is where the sword would be
                                try {
                                    const mainHandItem = playerInventory.container.getItem(0);
                                    if (mainHandItem) {
                                        console.log(`Clearing main hand slot: ${mainHandItem.typeId}`);
                                        playerInventory.container.setItem(0, undefined);
                                        console.log(`✅ Main hand item will drop: ${mainHandItem.typeId}`);
                                    }
                                } catch (error) {
                                    // Slot doesn't exist, continue
                                }
                                
                                // Clear offhand slot (slot 45) - this is where the shield would be
                                try {
                                    const offhandItem = playerInventory.container.getItem(45);
                                    if (offhandItem) {
                                        console.log(`Clearing offhand slot: ${offhandItem.typeId}`);
                                        playerInventory.container.setItem(45, undefined);
                                        console.log(`✅ Offhand item will drop: ${offhandItem.typeId}`);
                                    }
                                } catch (error) {
                                    // Slot doesn't exist, continue
                                }
                                
                                console.log("✅ Cleared weapon/shield slots for bear pickup");
                            }
                        } catch (error) {
                            console.warn("Error clearing weapon/shield slots:", error);
                        }

                        player.kill();
                        
                        // Spawn infected Maple Bear with player tracking
                        const bear = player.dimension.spawnEntity(INFECTED_BEAR_ID, player.location);
                        if (bear) {
                            // Set name tag for visual identification
                            bear.nameTag = `§4☣️ ${data.playerName}'s Infected Form`;
                            
                            // Set dynamic property for tracking
                            bear.setDynamicProperty("infected_by", playerId);
                            
                            // Store inventory in the bear's dynamic properties
                            console.log("=== BEAR INVENTORY STORAGE ===");
                            console.log(`Storing inventory data in bear for ${data.playerName}...`);
                            console.log(`Inventory data to store: ${JSON.stringify(inventory)}`);
                            bear.setDynamicProperty("original_inventory", JSON.stringify(inventory));
                            console.log("✅ Inventory data stored in bear's dynamic properties");
                            console.log("=== END BEAR INVENTORY STORAGE ===");
                            
                            // Add particle effects, sounds, and broadcast as before
                            spreadSnowEffect(player.location, player.dimension);
                            player.dimension.playSound("mob.wither.death", player.location, { pitch: 0.7, volume: 0.5 });
                            player.dimension.playSound("random.glass", player.location, { pitch: 0.5, volume: 1.0 });
                            player.dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${data.playerName} transformed into a Maple Bear!"}]}`);
                            
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
                                        const itemStack = item.getItemStack();
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
                        console.warn("Error during player transformation:", error);
                    }
                });
            }
            
            // Remove from tracking regardless of whether player was found
            transformingPlayers.delete(playerId);
        }
    }
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