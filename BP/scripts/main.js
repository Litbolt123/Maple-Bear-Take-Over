import { world, system, EntityTypes, Entity, Player } from "@minecraft/server";

// Constants for Maple Bear behavior
const MAPLE_BEAR_ID = "mb:mb";
const INFECTED_BEAR_ID = "mb:infected";
const BUFF_BEAR_ID = "mb:buff_mb";
const SNOW_ITEM_ID = "mb:snow";

// Freaky effects for the tiny mb bear
const FREAKY_EFFECTS = [
    { effect: "minecraft:blindness", duration: 20, amplifier: 1 },
    { effect: "minecraft:poison", duration: 15, amplifier: 1 }
];

// Track players who have eaten snow and their transformation progress
const transformingPlayers = new Map();

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
                
                // Send initial message
                player.dimension.runCommand(`tellraw "${player.name}" {"rawtext":[{"text":"§4You start to feel funny..."}]}`);
                
                // Start transformation tracking
                transformingPlayers.set(player.id, {
                    ticks: 0,
                    playerName: player.name
                });
            });
        } catch (error) {
            console.warn("Error applying snow effects:", error);
        }
    }
});

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
                    player.dimension.runCommand(`tellraw "${player.name}" {"rawtext":[{"text":"§4You don't feel so good..."}]}`);
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
                    // Get player location
                    const location = player.location;
                    
                    // Kill the player
                    player.kill();
                    
                    // Spawn infected Maple Bear
                    player.dimension.runCommand(`summon ${INFECTED_BEAR_ID} ${location.x} ${location.y} ${location.z}`);
                    
                    // Broadcast transformation
                    player.dimension.runCommand(`tellraw @a {"rawtext":[{"text":"§4${player.name} transformed into a Maple Bear!"}]}`);
                });
            }
            
            // Remove from tracking regardless of whether player was found
            transformingPlayers.delete(playerId);
        }
    }
}, 20); // Run every second (20 ticks)

// Handle player death to clean up transformation timers
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    if (entity instanceof Player) {
        transformingPlayers.delete(entity.id);
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
            });
        }
    }
});

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
