import { world, system, EntityTypes, Entity, Player } from "@minecraft/server";

// Constants for Maple Bear behavior
const MAPLE_BEAR_ID = "mb:mb";
const INFECTED_BEAR_ID = "mb:infected";
const BUFF_BEAR_ID = "mb:buff_mb";
const SNOW_ITEM_ID = "mb:snow";

// Random effects for freaky behavior
const FREAKY_EFFECTS = [
    { effect: "minecraft:blindness", duration: 20, amplifier: 1 },
    { effect: "minecraft:slowness", duration: 30, amplifier: 2 },
    { effect: "minecraft:weakness", duration: 25, amplifier: 1 },
    { effect: "minecraft:poison", duration: 15, amplifier: 1 }
];

// Initialize Maple Bear behavior
world.afterEvents.entitySpawn.subscribe((event) => {
    const entity = event.entity;
    if (entity.typeId === MAPLE_BEAR_ID) {
        // Make the bear more aggressive
        entity.addEffect("strength", 999999, { amplifier: 1 });
        entity.addEffect("speed", 999999, { amplifier: 1 });
    }
});

// Main tick loop for freaky behaviors
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        // Find nearby Maple Bears
        const nearbyBears = player.dimension.getEntities({
            type: MAPLE_BEAR_ID,
            maxDistance: 16
        });

        for (const bear of nearbyBears) {
            // Random chance to trigger freaky behavior
            if (Math.random() < 0.1) {
                triggerFreakyBehavior(bear, player);
            }
        }
    }
}, 20); // Run every second

function triggerFreakyBehavior(bear, player) {
    // Random freaky effects
    const randomEffect = FREAKY_EFFECTS[Math.floor(Math.random() * FREAKY_EFFECTS.length)];
    player.addEffect(randomEffect.effect, randomEffect.duration, { amplifier: randomEffect.amplifier });

    // Make the bear do something freaky
    const randomAction = Math.random();
    if (randomAction < 0.3) {
        // Teleport randomly around player
        const offset = new Vector(
            (Math.random() - 0.5) * 5,
            0,
            (Math.random() - 0.5) * 5
        );
        bear.teleport(player.location.offset(offset));
    } else if (randomAction < 0.6) {
        // Make the bear growl and shake
        bear.playAnimation("animation.mb.growl");
        bear.dimension.runCommand(`particle minecraft:smoke_particle ${bear.location.x} ${bear.location.y} ${bear.location.z}`);
    } else {
        // Make the bear transform temporarily
        bear.addEffect("invisibility", 20, { amplifier: 0 });
        setTimeout(() => {
            bear.removeEffect("invisibility");
        }, 1000);
    }
}

// Handle player interactions with Maple Bears
world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const player = event.player;
    const entity = event.target;

    if (entity.typeId === MAPLE_BEAR_ID) {
        // Random chance to infect the player
        if (Math.random() < 0.2) {
            player.addEffect("poison", 100, { amplifier: 1 });
            player.addEffect("blindness", 50, { amplifier: 0 });
            player.playSound("mob.wolf.growl");
        }
    }
});

// Handle snow item consumption
world.afterEvents.itemCompleteUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;

    if (item.typeId === SNOW_ITEM_ID) {
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
