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

// Handle snow item consumption
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;
    
    if (item?.typeId === SNOW_ITEM_ID) {
        try {
            system.run(() => {
                // Apply nausea effect using API
                player.addEffect("minecraft:nausea", 1200, { amplifier: 9 }); // 60 seconds (1200 ticks) with amplifier 9
                // Play effects
                player.playSound("mob.wolf.growl");
                player.dimension.runCommand(`particle minecraft:smoke_particle ${player.location.x} ${player.location.y + 1} ${player.location.z}`);
            });
        } catch (error) {
            console.warn("Error applying snow effects:", error);
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
                player.addEffect("minecraft:poison", 60, { amplifier: 3 }); // 3 seconds, level 1
                
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
            maxDistance: 6,
            type: MAPLE_BEAR_ID
        });

        // Apply nausea if tiny bears are nearby
        if (nearbyTinyBears.length > 0) {
            system.run(() => {
                player.addEffect("minecraft:nausea", 60, { amplifier: 0 }); // 3 seconds, level 1
            });
        }
    }
}, 20); // Run every second
