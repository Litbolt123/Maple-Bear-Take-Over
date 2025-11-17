import { system, world } from "@minecraft/server";
import { MINING_BREAKABLE_BLOCK_SET } from "./mb_miningBlockList.js";

const DIMENSION_IDS = ["overworld", "nether", "the_end"];
const TORPEDO_TYPES = [
    { id: "mb:torpedo_mb", cruiseMin: 30, cruiseMax: 70, diveRange: 40, forwardForce: 0.18, breaksPerTick: 5, structureScanRadius: 8 },
    { id: "mb:torpedo_mb_day20", cruiseMin: 35, cruiseMax: 80, diveRange: 50, forwardForce: 0.22, breaksPerTick: 7, structureScanRadius: 10 }
];
const DRIFT_FORCE = 0.04;
const ALTITUDE_CORRECTION_FORCE = 0.12;
const STATE_MAP = new Map();
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
const MIN_STRUCTURE_Y = 20; // Only break blocks above this Y level (sky bases)

function getState(entity) {
    const id = entity.id;
    if (!STATE_MAP.has(id)) {
        STATE_MAP.set(id, { mode: "cruise", cooldown: 0, lastTarget: null });
    }
    return STATE_MAP.get(id);
}

function cleanupStates(seen) {
    for (const [id] of STATE_MAP) {
        if (!seen.has(id)) {
            STATE_MAP.delete(id);
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

    // Prioritize players
    for (const player of world.getPlayers()) {
        if (player.dimension !== dimension) continue;
        const dx = player.location.x - origin.x;
        const dy = player.location.y - origin.y;
        const dz = player.location.z - origin.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < bestDistSq) {
            best = player;
            bestDistSq = distSq;
        }
    }

    // Also target mobs if no players nearby
    if (!best) {
        const mobs = dimension.getEntities({
            location: origin,
            maxDistance,
            families: ["mob"]
        });
        for (const mob of mobs) {
            if (mob === entity) continue;
            const dx = mob.location.x - origin.x;
            const dy = mob.location.y - origin.y;
            const dz = mob.location.z - origin.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < bestDistSq) {
                best = mob;
                bestDistSq = distSq;
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
                if (!MINING_BREAKABLE_BLOCK_SET.has(typeId)) continue;
                
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

function breakStructureBlocks(dimension, blocks, limit) {
    let broken = 0;
    for (const blockInfo of blocks) {
        if (broken >= limit) break;
        
        let block;
        try {
            block = dimension.getBlock({ x: blockInfo.x, y: blockInfo.y, z: blockInfo.z });
        } catch {
            continue;
        }
        if (!block) continue;
        if (block.typeId !== blockInfo.typeId) continue; // Block changed
        
        try {
            block.setType("minecraft:air");
            playBreakSound(dimension, blockInfo.x, blockInfo.y, blockInfo.z, blockInfo.typeId);
            broken++;
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
    const norm = Math.hypot(direction.x, direction.z) || 1;
    const breakLimit = Math.max(1, config.breaksPerTick ?? 5);
    let broken = 0;
    
    // Break blocks in front of the entity (forward path)
    for (let forward = 1; forward <= 3; forward++) {
        if (broken >= breakLimit) break;
        const offsetX = Math.floor(loc.x + (direction.x / norm) * forward);
        const offsetY = Math.floor(loc.y);
        const offsetZ = Math.floor(loc.z + (direction.z / norm) * forward);
        
        // Check a small area around the forward position
        for (let dy = -1; dy <= 1; dy++) {
            if (broken >= breakLimit) break;
            const targetY = offsetY + dy;
            if (targetY < MIN_STRUCTURE_Y) continue; // Only break sky base blocks
            
            let block;
            try {
                block = dimension.getBlock({ x: offsetX, y: targetY, z: offsetZ });
            } catch {
                continue;
            }
            if (!block) continue;
            const typeId = block.typeId;
            if (typeId === "minecraft:air" || typeId === "minecraft:cave_air" || typeId === "minecraft:void_air") continue;
            if (!MINING_BREAKABLE_BLOCK_SET.has(typeId)) continue;
            
            try {
                block.setType("minecraft:air");
                playBreakSound(dimension, offsetX, targetY, offsetZ, typeId);
                broken++;
            } catch {
                // ignore
            }
        }
    }
    
    return broken;
}

function adjustAltitude(entity, config) {
    const loc = entity.location;
    if (loc.y < config.cruiseMin) {
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
    const angle = Math.random() * Math.PI * 2;
    try {
        entity.applyImpulse({
            x: Math.cos(angle) * DRIFT_FORCE,
            y: 0,
            z: Math.sin(angle) * DRIFT_FORCE
        });
    } catch { }
}

function diveTowardsTarget(entity, targetInfo, config, state) {
    const dx = targetInfo.vector.x;
    const dy = targetInfo.vector.y;
    const dz = targetInfo.vector.z;
    const horizMag = Math.hypot(dx, dz) || 1;
    const forwardX = (dx / horizMag) * config.forwardForce;
    const forwardZ = (dz / horizMag) * config.forwardForce;
    
    // Maintain altitude - only dive slightly if target is below, otherwise stay level or rise
    let verticalForce = 0;
    if (dy < -5) {
        // Target is significantly below, dive slightly
        verticalForce = -0.06;
    } else if (dy > 5) {
        // Target is above, rise slightly
        verticalForce = 0.08;
    } else {
        // Target is at similar level, maintain altitude
        verticalForce = 0;
    }
    
    try {
        entity.applyImpulse({ x: forwardX, y: verticalForce, z: forwardZ });
    } catch { }
    
    // Break blocks in the path
    breakBlocksInPath(entity, { x: dx, z: dz }, config);
    
    // If we have a target location, break structure blocks around it
    if (targetInfo.location && state.mode === "dive") {
        const structureBlocks = findStructureBlocks(
            entity.dimension,
            targetInfo.location,
            config.structureScanRadius,
            MIN_STRUCTURE_Y
        );
        if (structureBlocks.length > 0) {
            breakStructureBlocks(entity.dimension, structureBlocks, config.breaksPerTick);
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
                
                // Always maintain altitude
                adjustAltitude(entity, config);
                
                const targetInfo = findTarget(entity, 64);

                if (targetInfo) {
                    const horizDist = Math.hypot(targetInfo.vector.x, targetInfo.vector.z);
                    const vertDist = Math.abs(targetInfo.vector.y);
                    
                    // Dive if within range and target is at a reasonable altitude (sky base)
                    if (horizDist < config.diveRange && targetInfo.location.y >= MIN_STRUCTURE_Y && state.cooldown === 0) {
                        diveTowardsTarget(entity, targetInfo, config, state);
                        state.mode = "dive";
                        state.lastTarget = targetInfo.location;
                        state.cooldown = 8;
                    } else {
                        // Move towards target but maintain cruise altitude
                        try {
                            const moveForce = DRIFT_FORCE * 1.5;
                            entity.applyImpulse({
                                x: (targetInfo.vector.x / (horizDist || 1)) * moveForce,
                                y: 0, // No vertical movement in cruise
                                z: (targetInfo.vector.z / (horizDist || 1)) * moveForce
                            });
                        } catch { }
                        state.mode = "cruise";
                    }
                } else {
                    // No target - cruise randomly
                    applyCruiseDrift(entity);
                    state.mode = "cruise";
                }
            }
        }
    }
    cleanupStates(seen);
}, 5);
