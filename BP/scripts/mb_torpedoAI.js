import { system, world } from "@minecraft/server";
import { TORPEDO_BREAKABLE_BLOCK_SET } from "./mb_miningBlockList.js";

const DIMENSION_IDS = ["overworld", "nether", "the_end"];
const TORPEDO_TYPES = [
    { id: "mb:torpedo_mb", cruiseMin: 60, cruiseMax: 150, diveRange: 70, forwardForce: 0.55, breaksPerTick: 15, structureScanRadius: 6, minY: 60, maxBlocks: 50 },
    { id: "mb:torpedo_mb_day20", cruiseMin: 70, cruiseMax: 180, diveRange: 80, forwardForce: 0.65, breaksPerTick: 18, structureScanRadius: 8, minY: 70, maxBlocks: 50 }
];
const DRIFT_FORCE = 0.03; // Reduced for straighter movement
const ALTITUDE_CORRECTION_FORCE = 0.35; // Increased for aggressive sky staying
const DIVE_BOOST_MULTIPLIER = 2.5; // High speed diving multiplier
const STATE_MAP = new Map();
const BREAK_COUNT_MAP = new Map(); // Track total blocks broken per entity
const SEE_THROUGH_BREAK_COUNT = 3; // Break this many blocks before backing off
const SEE_THROUGH_BACKOFF_TICKS = 20; // Back off for this many ticks
const BREAK_SOUND_DEFAULT = "dig.stone";
const BREAK_SOUND_RULES = [
    { sound: "dig.grass", keywords: ["grass", "dirt", "mud", "podzol", "mycelium", "farmland", "sand", "gravel", "soul", "clay"] },
    { sound: "dig.wood", keywords: ["wood", "log", "stem", "hyphae", "planks", "board", "bamboo"] },
    { sound: "dig.glass", keywords: ["glass", "ice", "packed_ice", "blue_ice", "frosted_ice"] },
    { sound: "dig.metal", keywords: ["iron", "gold", "copper", "metal", "anvil", "bell"] },
    { sound: "dig.wool", keywords: ["wool", "carpet"] },
    { sound: "dig.gravel", keywords: ["concrete_powder", "powder", "dust"] }
];
const SOUND_RADIUS = 16;
const MIN_STRUCTURE_Y = 60; // Minimum Y level - torpedos never go below this
const PASSIVE_WANDER_TICKS = 2400; // 2 minutes without seeing target = passive wandering

// Blocks that torpedos CANNOT break (diamond-pickaxe-only and unbreakable)
const UNBREAKABLE_BLOCKS = new Set([
    "minecraft:bedrock",
    "minecraft:barrier",
    "minecraft:command_block",
    "minecraft:chain_command_block",
    "minecraft:repeating_command_block",
    "minecraft:structure_block",
    "minecraft:structure_void",
    "minecraft:obsidian",
    "minecraft:crying_obsidian",
    "minecraft:ancient_debris",
    "minecraft:netherite_block",
    "minecraft:respawn_anchor",
    "minecraft:end_portal_frame",
    "minecraft:end_gateway"
]);

function getState(entity) {
    const id = entity.id;
    if (!STATE_MAP.has(id)) {
        STATE_MAP.set(id, { mode: "cruise", cooldown: 0, lastTarget: null, lastSeenTick: 0, breakCount: 0, backoffTicks: 0 });
    }
    if (!BREAK_COUNT_MAP.has(id)) {
        BREAK_COUNT_MAP.set(id, 0);
    }
    return STATE_MAP.get(id);
}

function getBreakCount(entity) {
    return BREAK_COUNT_MAP.get(entity.id) || 0;
}

function incrementBreakCount(entity) {
    const id = entity.id;
    const current = BREAK_COUNT_MAP.get(id) || 0;
    BREAK_COUNT_MAP.set(id, current + 1);
    return current + 1;
}

function checkTorpedoExhaustion(entity, config) {
    const breakCount = getBreakCount(entity);
    if (breakCount >= config.maxBlocks) {
        // Torpedo is exhausted - explode on death
        const loc = entity.location;
        const dimension = entity.dimension;
        
        try {
            // Spawn explosion particles
            dimension.runCommand(`particle minecraft:explosion ${loc.x} ${loc.y} ${loc.z} 0.5 0.5 0.5 0.1 10`);
            dimension.runCommand(`particle minecraft:explosion_emitter ${loc.x} ${loc.y} ${loc.z} 1 1 1 0.2 20`);
            
            // Play explosion sound
            dimension.runCommand(`playsound mob.tnt.explode @a ${loc.x} ${loc.y} ${loc.z} 1 1`);
            
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
                        if (dist > explosionRadius) continue;
                        
                        for (let dy = -2; dy <= 2; dy++) {
                            const checkX = centerX + dx;
                            const checkY = centerY + dy;
                            const checkZ = centerZ + dz;
                            
                            try {
                                const blockLoc = { x: checkX, y: checkY, z: checkZ };
                                const aboveLoc = { x: checkX, y: checkY + 1, z: checkZ };
                                const block = dimension.getBlock(blockLoc);
                                const above = dimension.getBlock(aboveLoc);
                                
                                if (!block || !above) continue;
                                
                                // Place snow layer if there's air above and solid below
                                if (above.isAir && !block.isAir && !block.isLiquid) {
                                    try {
                                        above.setType("mb:snow_layer");
                                    } catch {
                                        above.setType("minecraft:snow_layer");
                                    }
                                }
                            } catch {
                                // Skip errors
                            }
                        }
                    }
                }
            }
            
            entity.kill();
        } catch {
            // If explosion fails, just kill it
            try {
                entity.kill();
            } catch { }
        }
        return true;
    }
    return false;
}

function cleanupStates(seen) {
    for (const [id] of STATE_MAP) {
        if (!seen.has(id)) {
            STATE_MAP.delete(id);
        }
    }
    for (const [id] of BREAK_COUNT_MAP) {
        if (!seen.has(id)) {
            BREAK_COUNT_MAP.delete(id);
        }
    }
}

function pickBreakSound(typeId) {
    if (!typeId) return BREAK_SOUND_DEFAULT;
    const shortId = (typeId.split(":")[1] ?? typeId).toLowerCase();
    for (const rule of BREAK_SOUND_RULES) {
        if (rule.keywords.some(keyword => shortId.includes(keyword))) {
            return rule.sound;
        }
    }
    return BREAK_SOUND_DEFAULT;
}

function playBreakSound(dimension, x, y, z, typeId) {
    if (!dimension) return;
    const soundId = pickBreakSound(typeId);
    const location = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
    const volume = 0.4 + Math.random() * 0.2;
    const pitch = 0.9 + Math.random() * 0.2;
    if (typeof world.playSound === "function") {
        try {
            world.playSound(soundId, location, { volume, pitch });
            return;
        } catch {
            // fall through to command fallback
        }
    }
    try {
        const px = location.x.toFixed(1);
        const py = location.y.toFixed(1);
        const pz = location.z.toFixed(1);
        dimension.runCommandAsync?.(
            `playsound ${soundId} @a[x=${px},y=${py},z=${pz},r=${SOUND_RADIUS}] ${px} ${py} ${pz} ${volume.toFixed(2)} ${pitch.toFixed(2)}`
        );
    } catch {
        // ignore
    }
}

function findTarget(entity, maxDistance) {
    const dimension = entity?.dimension;
    if (!dimension) return null;
    const origin = entity.location;
    const maxDistSq = maxDistance * maxDistance;
    let best = null;
    let bestDistSq = maxDistSq;
    const config = TORPEDO_TYPES.find(c => c.id === entity.typeId);
    const minY = config?.minY || MIN_STRUCTURE_Y;

    // Prioritize players (skip creative mode and those below minY)
    for (const player of world.getPlayers()) {
        if (player.dimension !== dimension) continue;
        // Skip creative mode players
        try {
            if (player.getGameMode() === "creative") continue;
        } catch { }
        // Skip players below minimum Y (torpedos stay in sky)
        if (player.location.y < minY) continue;
        
        const dx = player.location.x - origin.x;
        const dy = player.location.y - origin.y;
        const dz = player.location.z - origin.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < bestDistSq) {
            // Heat-seeking: Check if we can see this target through blocks (up to 3 blocks)
            const targetInfo = {
                location: player.location,
                vector: { x: dx, y: dy, z: dz }
            };
            // Prioritize targets we can see, but also allow targeting through up to 3 blocks
            if (canSeeTargetThroughBlocks(entity, targetInfo, 3) || !best) {
                best = player;
                bestDistSq = distSq;
            }
        }
    }

    // Also target mobs if no players nearby (heat-seeking enabled)
    if (!best) {
        const mobs = dimension.getEntities({
            location: origin,
            maxDistance,
            families: ["mob"]
        });
        for (const mob of mobs) {
            if (mob === entity) continue;
            // Skip mobs below minimum Y
            if (mob.location.y < minY) continue;
            
            const dx = mob.location.x - origin.x;
            const dy = mob.location.y - origin.y;
            const dz = mob.location.z - origin.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < bestDistSq) {
                // Heat-seeking: Check if we can see this target through blocks (up to 3 blocks)
                const targetInfo = {
                    location: mob.location,
                    vector: { x: dx, y: dy, z: dz }
                };
                // Prioritize targets we can see, but also allow targeting through up to 3 blocks
                if (canSeeTargetThroughBlocks(entity, targetInfo, 3) || !best) {
                    best = mob;
                    bestDistSq = distSq;
                }
            }
        }
    }

    if (!best) return null;
    return {
        entity: best,
        location: best.location,
        vector: {
            x: best.location.x - origin.x,
            y: best.location.y - origin.y,
            z: best.location.z - origin.z
        }
    };
}

function findStructureBlocks(dimension, center, radius, minY) {
    const blocks = [];
    const centerX = Math.floor(center.x);
    const centerY = Math.floor(center.y);
    const centerZ = Math.floor(center.z);
    
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = centerX + dx;
                const y = centerY + dy;
                const z = centerZ + dz;
                if (y < minY) continue; // Only break sky base blocks
                
                let block;
                try {
                    block = dimension.getBlock({ x, y, z });
                } catch {
                    continue;
                }
                if (!block) continue;
                
                const typeId = block.typeId;
                if (typeId === "minecraft:air" || typeId === "minecraft:cave_air" || typeId === "minecraft:void_air") continue;
                // Check if block is unbreakable (diamond-pickaxe-only or unbreakable)
                if (UNBREAKABLE_BLOCKS.has(typeId)) continue;
                // For all other blocks, allow breaking (ravager-style)
                
                blocks.push({ x, y, z, typeId });
            }
        }
    }
    
    // Sort by distance from center (closest first)
    blocks.sort((a, b) => {
        const distA = Math.hypot(a.x - centerX, a.y - centerY, a.z - centerZ);
        const distB = Math.hypot(b.x - centerX, b.y - centerY, b.z - centerZ);
        return distA - distB;
    });
    
    return blocks;
}

function breakStructureBlocks(dimension, blocks, limit, entity = null, config = null) {
    let broken = 0;
    for (const blockInfo of blocks) {
        if (broken >= limit) break;
        
        // Check break count if entity and config provided
        if (entity && config) {
            const breakCount = getBreakCount(entity);
            if (breakCount >= config.maxBlocks) {
                checkTorpedoExhaustion(entity, config);
                break;
            }
        }
        
        let block;
        try {
            block = dimension.getBlock({ x: blockInfo.x, y: blockInfo.y, z: blockInfo.z });
        } catch {
            continue;
        }
        if (!block) continue;
        if (block.typeId !== blockInfo.typeId) continue; // Block changed
        
        // Check if block is unbreakable
        if (UNBREAKABLE_BLOCKS.has(blockInfo.typeId)) continue;
        
        try {
            block.setType("minecraft:air");
            playBreakSound(dimension, blockInfo.x, blockInfo.y, blockInfo.z, blockInfo.typeId);
            if (entity) incrementBreakCount(entity);
            broken++;
            if (entity && config && checkTorpedoExhaustion(entity, config)) break;
        } catch {
            // ignore
        }
    }
    return broken;
}

function breakBlocksInPath(entity, direction, config) {
    const dimension = entity?.dimension;
    if (!dimension) return 0;
    const loc = entity.location;
    const entityX = Math.floor(loc.x);
    const entityY = Math.floor(loc.y);
    const entityZ = Math.floor(loc.z);
    const minY = config.minY || MIN_STRUCTURE_Y;
    const norm = Math.hypot(direction.x, direction.z) || 1;
    const breakLimit = Math.max(1, config.breaksPerTick ?? 15);
    let broken = 0;
    
    // Break blocks ALL AROUND the entity (ravager-style) - 3x3x3 area centered on entity
    // This makes it feel like a destructive torpedo smashing through everything
    const offsets = [];
    
    // Generate all blocks in a 3x3x3 cube around the entity
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 3; dy++) { // Prioritize above (-1 to 3 = 5 blocks up, 1 block down)
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dy === 0 && dz === 0) continue; // Skip entity's own block
                offsets.push({ dx, dy, dz, priority: dy }); // Higher dy = higher priority
            }
        }
    }
    
    // Sort by priority (higher Y first, then by distance)
    offsets.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority; // Higher Y first
        const distA = Math.abs(a.dx) + Math.abs(a.dz);
        const distB = Math.abs(b.dx) + Math.abs(b.dz);
        return distA - distB; // Closer first
    });
    
    for (const offset of offsets) {
        if (broken >= breakLimit) break;
        
        const targetX = entityX + offset.dx;
        const targetY = entityY + offset.dy;
        const targetZ = entityZ + offset.dz;
        
        // Never break blocks below minimum Y
        if (targetY < minY) continue;
        
        let block;
        try {
            block = dimension.getBlock({ x: targetX, y: targetY, z: targetZ });
        } catch {
            continue;
        }
        if (!block) continue;
        const typeId = block.typeId;
        if (typeId === "minecraft:air" || typeId === "minecraft:cave_air" || typeId === "minecraft:void_air") continue;
        // Check if block is unbreakable (diamond-pickaxe-only or unbreakable)
        if (UNBREAKABLE_BLOCKS.has(typeId)) continue;
        
        // Check break count before breaking
        const breakCount = getBreakCount(entity);
        if (breakCount >= config.maxBlocks) {
            checkTorpedoExhaustion(entity, config);
            continue;
        }
        
        // For all other blocks, allow breaking (ravager-style)
        try {
            block.setType("minecraft:air");
            playBreakSound(dimension, targetX, targetY, targetZ, typeId);
            incrementBreakCount(entity);
            broken++;
            // Check exhaustion after each break
            if (checkTorpedoExhaustion(entity, config)) break;
        } catch {
            // ignore
        }
    }
    
    return broken;
}

function adjustAltitude(entity, config) {
    const loc = entity.location;
    const minY = config.minY || MIN_STRUCTURE_Y;
    
    // Never go below minimum Y - aggressively push up
    if (loc.y < minY) {
        try {
            const pushForce = Math.min(ALTITUDE_CORRECTION_FORCE * 2, 0.5); // Strong upward push
            entity.applyImpulse({ x: 0, y: pushForce, z: 0 });
        } catch { }
    } else if (loc.y < config.cruiseMin) {
        try {
            entity.applyImpulse({ x: 0, y: ALTITUDE_CORRECTION_FORCE, z: 0 });
        } catch { }
    } else if (loc.y > config.cruiseMax) {
        try {
            entity.applyImpulse({ x: 0, y: -ALTITUDE_CORRECTION_FORCE * 0.5, z: 0 });
        } catch { }
    }
}

function applyCruiseDrift(entity) {
    // Reduced random drift for straighter movement
    const angle = Math.random() * Math.PI * 2;
    try {
        entity.applyImpulse({
            x: Math.cos(angle) * DRIFT_FORCE,
            y: 0,
            z: Math.sin(angle) * DRIFT_FORCE
        });
    } catch { }
}

// Check if target is visible through a few blocks (see-through logic)
function canSeeTargetThroughBlocks(entity, targetInfo, maxBlocks = 3) {
    const dimension = entity?.dimension;
    if (!dimension || !targetInfo?.location) return false;
    
    const origin = entity.location;
    const target = targetInfo.location;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1) return true; // Very close, assume visible
    
    const steps = Math.ceil(dist);
    const stepX = dx / steps;
    const stepY = dy / steps;
    const stepZ = dz / steps;
    
    let blockCount = 0;
    for (let i = 1; i < steps && blockCount <= maxBlocks; i++) {
        const checkX = Math.floor(origin.x + stepX * i);
        const checkY = Math.floor(origin.y + stepY * i);
        const checkZ = Math.floor(origin.z + stepZ * i);
        
        try {
            const block = dimension.getBlock({ x: checkX, y: checkY, z: checkZ });
            if (block && block.typeId !== "minecraft:air" && block.typeId !== "minecraft:cave_air" && block.typeId !== "minecraft:void_air") {
                if (UNBREAKABLE_BLOCKS.has(block.typeId)) {
                    return false; // Unbreakable block in the way
                }
                blockCount++;
            }
        } catch {
            return false; // Error checking, assume blocked
        }
    }
    
    return blockCount <= maxBlocks; // Can see through if 3 or fewer blocks
}

function diveTowardsTarget(entity, targetInfo, config, state) {
    const dx = targetInfo.vector.x;
    const dy = targetInfo.vector.y;
    const dz = targetInfo.vector.z;
    const horizMag = Math.hypot(dx, dz) || 1;
    
    // Check if we're in backoff mode (see-through behavior)
    if (state.backoffTicks > 0) {
        state.backoffTicks--;
        // Back away slightly
        try {
            entity.applyImpulse({ 
                x: (-dx / horizMag) * config.forwardForce * 0.5, 
                y: 0, 
                z: (-dz / horizMag) * config.forwardForce * 0.5 
            });
        } catch { }
        return; // Don't break blocks while backing off
    }
    
    // Heat-seeking: Check if target is visible through blocks (can see through 3 blocks)
    const canSee = canSeeTargetThroughBlocks(entity, targetInfo, 3);
    if (!canSee) {
        // Can't see target, break blocks to get through
        const broken = breakBlocksInPath(entity, { x: dx, z: dz }, config);
        if (broken > 0) {
            state.breakCount = (state.breakCount || 0) + broken;
            // After breaking a few blocks, back off
            if (state.breakCount >= SEE_THROUGH_BREAK_COUNT) {
                state.backoffTicks = SEE_THROUGH_BACKOFF_TICKS;
                state.breakCount = 0;
            }
        }
    } else {
        // Can see target, reset break count
        state.breakCount = 0;
    }
    
    // High-speed diving: Apply boost multiplier during dive
    const diveForce = config.forwardForce * DIVE_BOOST_MULTIPLIER;
    const forwardX = (dx / horizMag) * diveForce;
    const forwardZ = (dz / horizMag) * diveForce;
    
    const entityY = entity.location.y;
    const targetY = targetInfo.location.y;
    
    // Check if stuck below sky base - if entity is below target by more than 5 blocks, prioritize rising
    const minY = config.minY || MIN_STRUCTURE_Y;
    let verticalForce = 0;
    if (dy < -8 && entityY < minY + 10) {
        // Stuck below sky base - rise aggressively
        verticalForce = 0.25;
    } else if (dy < -5 && targetY >= minY) {
        // Target is significantly below but still above minY, dive slightly (boosted)
        verticalForce = -0.15 * DIVE_BOOST_MULTIPLIER;
    } else if (dy > 5) {
        // Target is above, rise more aggressively (boosted)
        verticalForce = 0.2 * DIVE_BOOST_MULTIPLIER;
    } else {
        // Target is at similar level, maintain altitude
        verticalForce = 0;
    }
    
    try {
        entity.applyImpulse({ x: forwardX, y: verticalForce, z: forwardZ });
    } catch { }
    
    // If we have a target location, break structure blocks around it
    if (targetInfo.location && state.mode === "dive") {
            const minY = config.minY || MIN_STRUCTURE_Y;
            const structureBlocks = findStructureBlocks(
            entity.dimension,
            targetInfo.location,
            config.structureScanRadius,
            minY
        );
        if (structureBlocks.length > 0) {
            breakStructureBlocks(entity.dimension, structureBlocks, config.breaksPerTick, entity, config);
        }
    }
}

system.runInterval(() => {
    const seen = new Set();
    for (const dimId of DIMENSION_IDS) {
        let dimension;
        try {
            dimension = world.getDimension(dimId);
        } catch {
            continue;
        }
        if (!dimension) continue;

        for (const config of TORPEDO_TYPES) {
            let entities;
            try {
                entities = dimension.getEntities({ type: config.id });
            } catch {
                continue;
            }
            if (!entities || entities.length === 0) continue;

            for (const entity of entities) {
                if (typeof entity?.isValid === "function" && !entity.isValid()) continue;
                seen.add(entity.id);
                const state = getState(entity);
                if (state.cooldown > 0) state.cooldown--;
                
                // Always maintain altitude (enforce minimum Y)
                adjustAltitude(entity, config);
                
                // Check exhaustion first
                if (checkTorpedoExhaustion(entity, config)) continue;
                
                // Always break blocks around the entity while moving (ravager-style)
                const vel = entity.getVelocity?.();
                if (vel) {
                    const speed = Math.hypot(vel.x, vel.y, vel.z);
                    if (speed > 0.01) {
                        // Moving - break blocks all around
                        breakBlocksInPath(entity, { x: vel.x, z: vel.z }, config);
                    }
                }
                
                const targetInfo = findTarget(entity, 64);
                const currentTick = system.currentTick;
                const minY = config.minY || MIN_STRUCTURE_Y;

                if (targetInfo) {
                    // Ignore targets below minimum Y (torpedos stay in sky)
                    if (targetInfo.location.y < minY) {
                        // Target too low - just cruise
                        applyCruiseDrift(entity);
                        state.mode = "cruise";
                        continue;
                    }
                    
                    // Update last seen tick
                    if (!state.lastSeenTick) state.lastSeenTick = 0;
                    state.lastSeenTick = currentTick;
                    
                    const horizDist = Math.hypot(targetInfo.vector.x, targetInfo.vector.z);
                    
                    // Dive if within range and target is at reasonable altitude (sky base)
                    if (horizDist < config.diveRange && targetInfo.location.y >= minY && state.cooldown === 0) {
                        diveTowardsTarget(entity, targetInfo, config, state);
                        state.mode = "dive";
                        state.lastTarget = targetInfo.location;
                        state.cooldown = 8;
                    } else {
                        // Straighter line movement: Direct movement toward target (no random drift)
                        try {
                            const moveForce = config.forwardForce * 0.6; // Stronger, more direct movement
                            entity.applyImpulse({
                                x: (targetInfo.vector.x / (horizDist || 1)) * moveForce,
                                y: 0, // No vertical movement in cruise
                                z: (targetInfo.vector.z / (horizDist || 1)) * moveForce
                            });
                        } catch { }
                        state.mode = "cruise";
                    }
                } else {
                    // Check if should enter passive wandering (2 minutes without seeing target)
                    const lastSeen = state.lastSeenTick || 0;
                    const timeSinceSeen = currentTick - lastSeen;
                    if (timeSinceSeen > PASSIVE_WANDER_TICKS) {
                        // Force passive wandering - clear tracking
                        state.lastSeenTick = 0;
                        state.lastTarget = null;
                    }
                    // No target - cruise randomly
                    applyCruiseDrift(entity);
                    state.mode = "cruise";
                }
            }
        }
    }
    cleanupStates(seen);
}, 5);
