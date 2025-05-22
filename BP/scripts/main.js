import { world, system, EntityTypes, Entity, Player } from "@minecraft/server";

// Constants for Maple Bear behavior
const MAPLE_BEAR_ID = "mb:mb";
const INFECTED_BEAR_ID = "mb:infected";
const BUFF_BEAR_ID = "mb:buff_mb";
const SNOW_ITEM_ID = "mb:snow";

// Constants for progressive spawning system
const GRACE_PERIOD_DAYS = 2; // Number of days before Maple Bears start spawning
const MAX_SPAWN_DAY = 100; // Day when spawn rate reaches maximum
const MAX_SPAWN_ATTEMPTS_PER_INTERVAL = 5; // Maximum spawn attempts per interval at day 100
const SPAWN_CHECK_INTERVAL_TICKS = 200; // How often to attempt spawning (10 seconds)
const SPAWN_RADIUS_MIN = 24; // Minimum distance from player to spawn
const SPAWN_RADIUS_MAX = 48; // Maximum distance from player to spawn
const FOOD_MOBS = ["minecraft:cow", "minecraft:pig", "minecraft:sheep", "minecraft:chicken"];

// Freaky effects for the tiny mb bear
const FREAKY_EFFECTS = [
    { effect: "minecraft:blindness", duration: 20, amplifier: 1 },
    { effect: "minecraft:poison", duration: 15, amplifier: 1 }
];

// Track players who have eaten snow and their transformation progress
const transformingPlayers = new Map();

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

    // Prevent vanilla food mobs from spawning after grace period (by removing them immediately after spawn)
    // Defer this subscription by one tick to ensure all event objects are fully initialized
    system.run(() => {
        if (world.afterEvents.entitySpawn && typeof world.afterEvents.entitySpawn.subscribe === 'function') {
            world.afterEvents.entitySpawn.subscribe((event) => {
                const currentDay = Math.floor(world.getTimeOfDay() / 24000) + 1;
                const entity = event.entity; // Get the spawned entity

                // If we're past grace period and this is a food mob, remove it
                if (currentDay > GRACE_PERIOD_DAYS && entity && FOOD_MOBS.includes(entity.typeId)) {
                    try {
                        entity.kill(); // Kill the unwanted food mob
                    } catch (e) {
                        console.warn(`Failed to remove food mob ${entity.typeId}: ${e}`);
                    }
                }
            });
            console.log("entitySpawn listener subscribed after deferral.");
        } else {
            console.error("world.afterEvents.entitySpawn or its subscribe method is not available even after deferral!");
        }
    });

    console.log("Event listeners set up (entitySpawn subscription deferred).");
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

// Progressive spawning system
system.runInterval(() => {
    // Get current day
    const currentDay = Math.floor(world.getTimeOfDay() / 24000) + 1;
    
    // Check if we're past the grace period
    if (currentDay <= GRACE_PERIOD_DAYS) {
        // Still in grace period, allow normal food mob spawning
        return;
    }
    
    // Calculate spawn rate based on current day
    const daysSinceGrace = currentDay - GRACE_PERIOD_DAYS;
    const progressFactor = Math.min(daysSinceGrace / (MAX_SPAWN_DAY - GRACE_PERIOD_DAYS), 1);
    const spawnAttempts = Math.max(1, Math.floor(progressFactor * MAX_SPAWN_ATTEMPTS_PER_INTERVAL));
    
    // For each player, attempt to spawn Maple Bears around them
    for (const player of world.getAllPlayers()) {
        for (let i = 0; i < spawnAttempts; i++) {
            // Random chance to spawn (increases with days)
            if (Math.random() < progressFactor * 0.7) { // Increased base chance with progressFactor
                spawnRandomMapleBear(player);
            }
        }
    }
}, SPAWN_CHECK_INTERVAL_TICKS);

// Function to spawn a random Maple Bear around a player
function spawnRandomMapleBear(player) {
    const currentDay = Math.floor(world.getTimeOfDay() / 24000) + 1;
    const daysSinceGrace = Math.max(0, currentDay - GRACE_PERIOD_DAYS);
    const progressFactor = Math.min(daysSinceGrace / (MAX_SPAWN_DAY - GRACE_PERIOD_DAYS), 1);

    const baseWeights = [
        { id: MAPLE_BEAR_ID, weight: 70 },
        { id: INFECTED_BEAR_ID, weight: 20 },
        { id: BUFF_BEAR_ID, weight: 10 }
    ];

    const adjustedWeights = baseWeights.map((bear, index) => {
        if (index === 0) { // Regular Maple Bear
            return { ...bear, weight: Math.max(1, bear.weight * (1 - progressFactor * 0.75)) }; // Ensure weight doesn't drop below 1
        }
        return { ...bear, weight: bear.weight * (1 + progressFactor * 1.5) }; // Increase weight of stronger bears more significantly
    });

    const totalWeight = adjustedWeights.reduce((sum, type) => sum + type.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedBearType = adjustedWeights[0].id;

    for (const bearType of adjustedWeights) {
        random -= bearType.weight;
        if (random <= 0) {
            selectedBearType = bearType.id;
            break;
        }
    }

    const angle = Math.random() * Math.PI * 2;
    const distance = SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN);
    const spawnX = Math.floor(player.location.x + Math.cos(angle) * distance);
    const spawnZ = Math.floor(player.location.z + Math.sin(angle) * distance);

    try {
        // Use `trySpawn` for safer spawning that finds a valid Y position
        const spawnedEntity = player.dimension.trySpawnEntity(selectedBearType, { x: spawnX, y: player.location.y, z: spawnZ });

        if (spawnedEntity && Math.random() < progressFactor * 0.8) { // Apply buffs if spawn successful & chance met
            const possibleBuffs = [
                { effect: "minecraft:strength", duration: 999999, amplifier: Math.max(0, Math.floor(progressFactor * 2 -1)) }, // Ensure amplifier is at least 0
                { effect: "minecraft:speed", duration: 999999, amplifier: Math.max(0, Math.floor(progressFactor * 1.5 -1)) },
                { effect: "minecraft:resistance", duration: 999999, amplifier: Math.max(0, Math.floor(progressFactor * 1.5)) },
                { effect: "minecraft:jump_boost", duration: 999999, amplifier: Math.max(0, Math.floor(progressFactor * 1)) }
            ];
            
            const numBuffs = Math.floor(Math.random() * 2) + 1; // Apply 1-2 random buffs
            let appliedBuffs = new Set();

            for (let i = 0; i < numBuffs; i++) {
                let randomBuff = possibleBuffs[Math.floor(Math.random() * possibleBuffs.length)];
                // Ensure we don't apply the same buff type twice
                while(appliedBuffs.has(randomBuff.effect)) {
                    randomBuff = possibleBuffs[Math.floor(Math.random() * possibleBuffs.length)];
                }
                appliedBuffs.add(randomBuff.effect);
                if (randomBuff.amplifier >= 0) { // Only apply if amplifier is valid
                    spawnedEntity.addEffect(randomBuff.effect, randomBuff.duration, { amplifier: randomBuff.amplifier, displayParticles: false });
                }
            }
        }
    } catch (e) {
        console.warn(`Failed to spawn or buff Maple Bear ${selectedBearType}:`, e);
    }
}
