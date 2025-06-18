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
                // Check if this bear was transformed from a player using dynamic property
                const infectedBy = entity.getDynamicProperty("infected_by");
                const inventoryJson = entity.getDynamicProperty("original_inventory");
                
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
                }
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
            if (inventory) {
                bear.setDynamicProperty("original_inventory", JSON.stringify(inventory));
            }
            
            // Add particle effects
            spreadSnowEffect(location, dimension);
            
            // Play sounds
            dimension.playSound("mob.wither.death", location, {
                pitch: 0.7,
                volume: 0.5
            });
            dimension.playSound("random.glass", location, {
                pitch: 0.5,
                volume: 1.0
            });
            
            // Broadcast death message
            dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§8[MBI] §4${player.name} was consumed by the infection..."}]}`);
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
    const pos = `${x.toFixed(2)} ${(y + 1).toFixed(2)} ${z.toFixed(2)}`;
    
    // Smoke and ash particles
    dimension.runCommand(`particle minecraft:smoke_particle ${pos}`);
    dimension.runCommand(`particle minecraft:ash ${pos}`);
    
    // Snowflakes with proper formatting
    dimension.runCommand(`particle minecraft:snowflake ${pos} 0.5 0.5 0.5 0.01 100 force`);
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
                        // Store player data before killing
                        const playerName = player.name;
                        const playerDimension = player.dimension;
                        const location = player.location;
                        
                        // Capture player inventory right before transformation (includes items added after eating snow)
                        const inventory = [];
                        let totalItemCount = 0;
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
                            }
                        }
                        console.log(`Captured inventory for ${playerName}: ${inventory.length} item stacks (${totalItemCount} total items)`);
                        
                        // Clear player inventory before killing to prevent item drops
                        for (let i = 0; i < player.getComponent("inventory").container.size; i++) {
                            player.getComponent("inventory").container.setItem(i, undefined);
                        }
                        
                        // Notify player about lost belongings
                        player.runCommand(`tellraw @s {"rawtext":[{"text":"§8[MBI] §cYour belongings are lost inside your corrupted form..."}]}`);
                        
                        // Kill the player first
                        player.addTag("just_transformed");
                        player.kill();
                        
                        // Spawn infected Maple Bear with player tracking
                        const bear = playerDimension.spawnEntity(INFECTED_BEAR_ID, location);
                        if (bear) {
                            // Set name tag for visual identification
                            bear.nameTag = `§4☣️ ${playerName}'s Infected Form`;
                            
                            // Set dynamic property for tracking
                            bear.setDynamicProperty("infected_by", playerId);
                            
                            // Store inventory in the bear's dynamic properties
                            if (inventory) {
                                bear.setDynamicProperty("original_inventory", JSON.stringify(inventory));
                            }
                            
                            // Buff the player-transformed bear
                            try {
                                // Trigger the "become_buffed" event to apply enhanced stats
                                bear.triggerEvent("become_buffed");
                                console.log(`✅ Triggered buffed component group on transformed bear for ${playerName}`);
                            } catch (error) {
                                console.warn("❌ Failed to trigger buff on bear:", error);
                            }
                            
                            // Broadcast transformation using stored player name
                            playerDimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${playerName} transformed into a Maple Bear!"}]}`);
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

// Main tick loop for proximity effects
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        // Find nearby tiny Maple Bears within 6 blocks
        const nearbyTinyBears = player.dimension.getEntities({
            location: player.location,
            maxDistance: 5,
            type: MAPLE_BEAR_ID
        });

        // Apply nausea if tiny bears are nearby
        if (nearbyTinyBears.length > 0) {
            system.run(() => {
                player.addEffect("minecraft:nausea", 100, { amplifier: 0.5 }); // 5 seconds, level 3
            });
        }
    }
}, 20); // Run every second