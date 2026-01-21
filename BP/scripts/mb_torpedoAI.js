import { system, world, Player } from "@minecraft/server";
import { UNBREAKABLE_BLOCKS } from "./mb_miningBlockList.js";
import { isDebugEnabled } from "./mb_codex.js";
import { getCachedPlayers, getCachedMobs } from "./mb_sharedCache.js";

// Debug helper functions
function getDebugGeneral() {
    return isDebugEnabled("torpedo", "general") || isDebugEnabled("torpedo", "all");
}

function getDebugTargeting() {
    return isDebugEnabled("torpedo", "targeting") || isDebugEnabled("torpedo", "all");
}

function getDebugDiving() {
    return isDebugEnabled("torpedo", "diving") || isDebugEnabled("torpedo", "all");
}

function getDebugBlockBreaking() {
    return isDebugEnabled("torpedo", "blockBreaking") || isDebugEnabled("torpedo", "all");
}

const DIMENSION_IDS = ["overworld", "nether", "the_end"];
const TORPEDO_TYPES = [
    { id: "mb:torpedo_mb", cruiseMin: 60, cruiseMax: 150, diveRange: 70, forwardForce: 0.55, breaksPerTick: 15, structureScanRadius: 6, minY: 60, maxBlocks: 50 },
    { id: "mb:torpedo_mb_day20", cruiseMin: 70, cruiseMax: 180, diveRange: 80, forwardForce: 0.65, breaksPerTick: 18, structureScanRadius: 8, minY: 70, maxBlocks: 50 }
];
const DRIFT_FORCE = 0.03; // Reduced for straighter movement
const ALTITUDE_CORRECTION_FORCE = 0.5; // Increased for aggressive sky staying
const DIVE_BOOST_MULTIPLIER = 2.5; // High speed diving multiplier
const DIVE_COOLDOWN_TICKS = 40; // Cooldown between dives (2 seconds)
const MAX_DIVE_DEPTH = 50; // Maximum blocks below cruise altitude before forced back up (high for maximum dive compatibility - allows diving all the way to ground)
const STATE_MAP = new Map();
const BREAK_COUNT_MAP = new Map(); // Track total blocks broken per entity
const lastTorpedoFlightSoundTick = new Map(); // Track last flight sound playback per entity
const TORPEDO_FLIGHT_SOUND_INTERVAL = 50; // Play flight sound every 2.5 seconds (50 ticks)
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
const PASSIVE_WANDER_TICKS = 6000; // 5 minutes without seeing target = passive wandering

// UNBREAKABLE_BLOCKS is imported from mb_miningBlockList.js
// All blocks are breakable by default except those in UNBREAKABLE_BLOCKS

function getState(entity) {
    const id = entity.id;
    if (!STATE_MAP.has(id)) {
        STATE_MAP.set(id, { mode: "cruise", cooldown: 0, lastTarget: null, lastSeenTick: 0, breakCount: 0, backoffTicks: 0, diveCooldown: 0, lastDiveTick: 0 });
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
        
        if (!dimension || !entity) return true; // Entity or dimension invalid
        
        try {
            // Spawn explosion particles
            try {
                dimension.runCommand(`particle minecraft:explosion ${loc.x} ${loc.y} ${loc.z} 0.5 0.5 0.5 0.1 10`);
            } catch { }
            try {
                dimension.runCommand(`particle minecraft:explosion_emitter ${loc.x} ${loc.y} ${loc.z} 1 1 1 0.2 20`);
            } catch { }
            
            // Play explosion sound
            try {
                dimension.runCommand(`playsound torpedo_mb.explode @a ${loc.x} ${loc.y} ${loc.z} 0.75 1`);
            } catch { }
            
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
                            if (checkBlock && checkBlock.isAir !== undefined && !checkBlock.isAir && 
                                checkBlock.isLiquid !== undefined && !checkBlock.isLiquid) {
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
                        
                        const checkX = centerX + dx;
                        const checkZ = centerZ + dz;
                        
                        // Find the topmost solid block at this X,Z position (search downward from explosion center)
                        // Exclude snow layers - we want the actual solid block below any snow
                        let topSolidY = null;
                        let topSolidBlock = null;
                        for (let dy = 2; dy >= -2; dy--) {
                            const checkY = centerY + dy;
                            try {
                                const block = dimension.getBlock({ x: checkX, y: checkY, z: checkZ });
                                if (block) {
                                    const blockType = block.typeId;
                                    // Skip snow layers - they're not considered "solid" for placement purposes
                                    if (blockType === "mb:snow_layer" || blockType === "minecraft:snow_layer") {
                                        continue;
                                    }
                                    if (block.isAir !== undefined && !block.isAir && 
                                        block.isLiquid !== undefined && !block.isLiquid) {
                                        topSolidY = checkY;
                                        topSolidBlock = block;
                                        break; // Found the topmost solid block
                                    }
                                }
                            } catch {
                                continue;
                            }
                        }
                        
                        // Place snow - replace grass blocks, otherwise place on top
                        if (topSolidY !== null && topSolidBlock) {
                            try {
                                const blockType = topSolidBlock.typeId;
                                // If it's any ground foliage (grass, flowers, desert plants, etc.), replace it with snow
                                if (blockType === "minecraft:grass_block" || blockType === "minecraft:grass" || 
                                    blockType === "minecraft:tall_grass" || blockType === "minecraft:fern" || 
                                    blockType === "minecraft:large_fern" ||
                                    blockType === "minecraft:dandelion" || blockType === "minecraft:poppy" ||
                                    blockType === "minecraft:blue_orchid" || blockType === "minecraft:allium" ||
                                    blockType === "minecraft:azure_bluet" || blockType === "minecraft:red_tulip" ||
                                    blockType === "minecraft:orange_tulip" || blockType === "minecraft:white_tulip" ||
                                    blockType === "minecraft:pink_tulip" || blockType === "minecraft:oxeye_daisy" ||
                                    blockType === "minecraft:cornflower" || blockType === "minecraft:lily_of_the_valley" ||
                                    blockType === "minecraft:sunflower" || blockType === "minecraft:lilac" ||
                                    blockType === "minecraft:rose_bush" || blockType === "minecraft:peony" ||
                                    blockType === "minecraft:dead_bush" || blockType === "minecraft:cactus" ||
                                    blockType === "minecraft:sweet_berry_bush" || blockType === "minecraft:nether_sprouts" ||
                                    blockType === "minecraft:warped_roots" || blockType === "minecraft:crimson_roots" ||
                                    blockType === "minecraft:small_dripleaf" || blockType === "minecraft:big_dripleaf" ||
                                    blockType === "minecraft:big_dripleaf_stem" || blockType === "minecraft:spore_blossom" ||
                                    blockType === "minecraft:glow_lichen" || blockType === "minecraft:moss_carpet" ||
                                    blockType === "minecraft:vine" || blockType === "minecraft:weeping_vines" ||
                                    blockType === "minecraft:twisting_vines" || blockType === "minecraft:cave_vines" ||
                                    blockType === "minecraft:sea_pickle" || blockType === "minecraft:kelp" ||
                                    blockType === "minecraft:seagrass" || blockType === "minecraft:tall_seagrass" ||
                                    blockType === "minecraft:waterlily" || blockType === "minecraft:lily_pad") {
                                    try {
                                        topSolidBlock.setType("mb:snow_layer");
                                    } catch {
                                        topSolidBlock.setType("minecraft:snow_layer");
                                    }
                                } else {
                                    // Otherwise, place snow in the air above
                                    const snowY = topSolidY + 1;
                                    const snowBlock = dimension.getBlock({ x: checkX, y: snowY, z: checkZ });
                                    if (snowBlock && snowBlock.isAir !== undefined && snowBlock.isAir) {
                                        // Check if it's already a snow layer - don't stack them
                                        const snowBlockType = snowBlock.typeId;
                                        if (snowBlockType === "mb:snow_layer" || snowBlockType === "minecraft:snow_layer") {
                                            continue; // Already has snow, skip
                                        }
                                        try {
                                            snowBlock.setType("mb:snow_layer");
                                        } catch {
                                            snowBlock.setType("minecraft:snow_layer");
                                        }
                                    }
                                }
                            } catch {
                                // Skip errors
                            }
                        }
                    }
                }
            }
            
            // Kill the entity - this will trigger the death event handler in main.js as well
            try {
                entity.kill();
            } catch {
                // Entity might already be dead or invalid
            }
        } catch (error) {
            // Log error for debugging and still try to kill
            console.warn(`Torpedo explosion error: ${error}`);
            try {
                entity.kill();
            } catch {
                // Entity might already be dead or invalid
            }
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
    for (const [id] of lastTorpedoFlightSoundTick) {
        if (!seen.has(id)) {
            lastTorpedoFlightSoundTick.delete(id);
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
    
    // Performance: Use cached target if available and still valid
    const cached = targetCache.get(entity.id);
    const currentTick = system.currentTick;
    if (cached && (currentTick - cached.tick) < TARGET_CACHE_TICKS) {
        // Verify cached target still exists and is valid
        try {
            if (cached.target && cached.target.entity && cached.target.entity.isValid()) {
                const origin = entity.location;
                const targetLoc = cached.target.entity.location;
                const dx = targetLoc.x - origin.x;
                const dy = targetLoc.y - origin.y;
                const dz = targetLoc.z - origin.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq <= maxDistance * maxDistance) {
                    // Update vector and location for current position
                    cached.target.vector = { x: dx, y: dy, z: dz };
                    cached.target.location = targetLoc;
                    return cached.target;
                }
            }
        } catch {
            // Target invalid, fall through to recalculate
        }
    }
    
    const origin = entity.location;
    const maxDistSq = maxDistance * maxDistance;
    let best = null;
    let bestDistSq = maxDistSq;
    const config = TORPEDO_TYPES.find(c => c.id === entity.typeId);
    const minY = config?.minY || MIN_STRUCTURE_Y;

    // Prioritize players (skip creative and spectator mode)
    // Use shared cache instead of querying all players again
    const allPlayers = getCachedPlayers();
    for (const player of allPlayers) {
        if (player.dimension !== dimension) continue;
        // Skip creative and spectator mode players (they can't be attacked)
        try {
            const gameMode = player.getGameMode();
            if (gameMode === "creative" || gameMode === "spectator") continue;
        } catch { }
        // Torpedo bears can target players at any Y level - they stay in sky and dive down to attack
        // No Y level restriction for targeting
        
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
    // Allow targeting mobs at any Y level (including ground mobs)
    // Use shared cache instead of per-entity query
    if (!best) {
        const mobs = getCachedMobs(dimension, origin, maxDistance);
        for (const mob of mobs) {
            if (mob === entity) continue;
            // Allow targeting mobs at any Y level - torpedo bears can dive to attack them
            
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

    if (!best) {
        // Cache null result too (no target found)
        targetCache.set(entity.id, { target: null, tick: system.currentTick });
        return null;
    }
    
    // Mark if target is a player (for priority diving)
    const isPlayer = best instanceof Player || best.typeId === "minecraft:player";
    
    const targetInfo = {
        entity: best,
        location: best.location,
        vector: {
            x: best.location.x - origin.x,
            y: best.location.y - origin.y,
            z: best.location.z - origin.z
        },
        isPlayer: isPlayer // Track if target is a player for dive priority
    };
    
    // Cache the target
    targetCache.set(entity.id, { target: targetInfo, tick: system.currentTick });
    return targetInfo;
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
    // Limit to 3 blocks per tick to prevent excessive destruction (3x3x3 area = 26 blocks, but we only break 3 per tick)
    const breakLimit = Math.max(1, config.breaksPerTick ?? 3);
    let broken = 0;
    
    // Break blocks ALL AROUND the entity (ravager-style) - 3x3x3 area centered on entity
    // This makes it feel like a destructive torpedo smashing through everything
    const offsets = [];
    
    // Generate all blocks in a 3x3x3 area around the entity (3x3 horizontally, 3 blocks vertically)
    // Break blocks above (1 block), same level, and below (1 block) the entity
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) { // -1 to 1 = 1 block below, same level, 1 block above
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

function breakBlocksAboveEntity(entity, maxHeight, config) {
    const dimension = entity?.dimension;
    if (!dimension) return 0;
    const loc = entity.location;
    const entityX = Math.floor(loc.x);
    const entityY = Math.floor(loc.y);
    const entityZ = Math.floor(loc.z);
    const minY = config.minY || MIN_STRUCTURE_Y;
    const breakLimit = Math.max(1, Math.min(maxHeight, config.breaksPerTick ?? 3));
    let broken = 0;
    
    for (let dy = 1; dy <= maxHeight; dy++) {
        if (broken >= breakLimit) break;
        const targetY = entityY + dy;
        if (targetY < minY) continue;
        
        let block;
        try {
            block = dimension.getBlock({ x: entityX, y: targetY, z: entityZ });
        } catch {
            continue;
        }
        if (!block) continue;
        
        const typeId = block.typeId;
        if (typeId === "minecraft:air" || typeId === "minecraft:cave_air" || typeId === "minecraft:void_air") {
            continue;
        }
        if (UNBREAKABLE_BLOCKS.has(typeId)) continue;
        
        const breakCount = getBreakCount(entity);
        if (breakCount >= config.maxBlocks) {
            checkTorpedoExhaustion(entity, config);
            continue;
        }
        
        try {
            block.setType("minecraft:air");
            playBreakSound(dimension, entityX, targetY, entityZ, typeId);
            incrementBreakCount(entity);
            broken++;
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
    const state = getState(entity);
    
    // If in dive mode and below cruise altitude, check if we should return to cruise
    if (state.mode === "dive" && loc.y < config.cruiseMin) {
        const depthBelowCruise = config.cruiseMin - loc.y;
        
        // If we've dived too deep OR dive cooldown is active, force return to cruise
        if (depthBelowCruise > MAX_DIVE_DEPTH || state.diveCooldown > 0) {
            // Force return to cruise altitude
            try {
                const pushForce = Math.min(ALTITUDE_CORRECTION_FORCE * 2.5, 0.8);
                entity.applyImpulse({ x: 0, y: pushForce, z: 0 });
                if (getDebugDiving()) {
                    console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} returning to cruise: depth=${depthBelowCruise.toFixed(1)}, cooldown=${state.diveCooldown}, Y=${loc.y.toFixed(1)}`);
                }
            } catch { }
            
            // If we're close to cruise altitude, switch back to cruise mode
            if (loc.y >= config.cruiseMin - 2) {
                state.mode = "cruise";
                if (getDebugDiving()) {
                    console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} switched to cruise mode at Y=${loc.y.toFixed(1)}`);
                }
            }
        }
    }
    
    // Never go below minimum Y - aggressively push up
    if (loc.y < minY) {
        try {
            const pushForce = Math.min(ALTITUDE_CORRECTION_FORCE * 3, 0.7); // Very strong upward push
            entity.applyImpulse({ x: 0, y: pushForce, z: 0 });
            if (getDebugDiving()) {
                console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} below minY (${loc.y.toFixed(1)} < ${minY}), forcing up`);
            }
        } catch { }
    } else if (loc.y < config.cruiseMin && state.mode === "cruise") {
        // Below cruise altitude in cruise mode - push up
        const depthBelowCruise = config.cruiseMin - loc.y;
        if (depthBelowCruise > MAX_DIVE_DEPTH) {
            // Too far below cruise - force back up immediately
            try {
                entity.applyImpulse({ x: 0, y: ALTITUDE_CORRECTION_FORCE * 2, z: 0 });
                if (getDebugDiving()) {
                    console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} too far below cruise (${depthBelowCruise.toFixed(1)} blocks), forcing up`);
                }
            } catch { }
        } else {
            // Gently push up to cruise altitude
            try {
                entity.applyImpulse({ x: 0, y: ALTITUDE_CORRECTION_FORCE * 0.5, z: 0 });
            } catch { }
        }
    } else if (loc.y > config.cruiseMax) {
        // Above cruise altitude - push down
        try {
            entity.applyImpulse({ x: 0, y: -ALTITUDE_CORRECTION_FORCE * 0.5, z: 0 });
            if (getDebugDiving() && state.mode === "cruise") {
                console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} above cruise max (${loc.y.toFixed(1)} > ${config.cruiseMax}), pushing down`);
            }
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
    const entityY = entity.location.y;
    const targetY = targetInfo.location.y;
    
    if (getDebugDiving()) {
        console.warn(`[TORPEDO AI] diveTowardsTarget: entityY=${entityY.toFixed(1)}, targetY=${targetY.toFixed(1)}, dy=${dy.toFixed(1)}, horizDist=${horizMag.toFixed(1)}, backoffTicks=${state.backoffTicks}`);
    }
    
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
        if (getDebugDiving()) {
            console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} in backoff mode, backing away`);
        }
        return; // Don't break blocks while backing off
    }
    
    // Heat-seeking: Check if target is visible through blocks (can see through 3 blocks)
    const canSee = canSeeTargetThroughBlocks(entity, targetInfo, 3);
    if (!canSee) {
        // Can't see target, break blocks to get through
        const broken = breakBlocksInPath(entity, { x: dx, z: dz }, config);
        if (broken > 0) {
            state.breakCount = (state.breakCount || 0) + broken;
            if (getDebugBlockBreaking()) {
                console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} breaking blocks to see target: broken=${broken}, total=${state.breakCount}`);
            }
            // After breaking a few blocks, back off
            if (state.breakCount >= SEE_THROUGH_BREAK_COUNT) {
                state.backoffTicks = SEE_THROUGH_BACKOFF_TICKS;
                state.breakCount = 0;
                if (getDebugDiving()) {
                    console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} entering backoff mode after breaking ${SEE_THROUGH_BREAK_COUNT} blocks`);
                }
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
    
    // Check if stuck below sky base - if entity is below target by more than 5 blocks, prioritize rising
    const minY = config.minY || MIN_STRUCTURE_Y;
    let verticalForce = 0;
    
    // Never dive below minY - always rise if below
    if (entityY < minY) {
        // Below minimum Y - force upward
        verticalForce = 0.4;
    } else if (dy < -8 && entityY < minY + 10) {
        // Stuck below sky base - rise aggressively
        verticalForce = 0.3;
    } else if (dy < -0.5) {
        // Target is below - dive down to attack (can dive all the way to ground)
        // Apply stronger dive force for ground targets (more negative = stronger dive)
        // Even small negative dy values should trigger a dive
        const diveStrength = dy < -5 ? -0.2 * DIVE_BOOST_MULTIPLIER : -0.15 * DIVE_BOOST_MULTIPLIER;
        verticalForce = diveStrength;
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
    
    if (getDebugDiving()) {
        console.warn(`[TORPEDO AI] diveTowardsTarget applied impulse: forwardX=${forwardX.toFixed(3)}, verticalForce=${verticalForce.toFixed(3)}, forwardZ=${forwardZ.toFixed(3)}`);
    }
    
    // Torpedo bears only break blocks they're ramming through (handled by breakBlocksInPath)
    // They don't break blocks around the target - only blocks in their immediate path
    // This prevents them from destroying entire bases from a distance
}

// Performance: Distance-based culling constants
const MAX_PROCESSING_DISTANCE = 64; // Only process entities within 64 blocks of any player
const MAX_PROCESSING_DISTANCE_SQ = MAX_PROCESSING_DISTANCE * MAX_PROCESSING_DISTANCE;
// Performance optimization constants
const AI_TICK_INTERVAL = 2; // Run AI every 2 ticks instead of every tick (50% reduction)
const TARGET_CACHE_TICKS = 5; // Cache target lookups for 5 ticks

// Performance: Cache target lookups to avoid querying all players/mobs every tick
const targetCache = new Map(); // Map<entityId, {target: targetInfo, tick: number}>

// Initialize torpedo AI with delay to ensure world is ready (similar to mining AI)
let torpedoAIIntervalId = null;
let torpedoInitAttempts = 0;
const MAX_TORPEDO_INIT_ATTEMPTS = 10;
const TORPEDO_INIT_DELAY_TICKS = 40; // 2 second delay

function initializeTorpedoAI() {
    if (getDebugGeneral()) {
        console.warn(`[TORPEDO AI] ====== INITIALIZATION ATTEMPT ${torpedoInitAttempts + 1}/${MAX_TORPEDO_INIT_ATTEMPTS} ======`);
        console.warn(`[TORPEDO AI] Current tick: ${system.currentTick}`);
    }
    
    // Prevent multiple initializations
    if (torpedoAIIntervalId !== null) {
        console.warn("[TORPEDO AI] WARNING: AI loop already initialized, skipping duplicate initialization");
        console.warn(`[TORPEDO AI] Interval ID: ${torpedoAIIntervalId}`);
        return;
    }
    
    torpedoInitAttempts++;
    
    // Check if system and world are ready
    if (typeof system?.runInterval !== "function") {
        console.warn(`[TORPEDO AI] ERROR: System not ready (attempt ${torpedoInitAttempts}/${MAX_TORPEDO_INIT_ATTEMPTS})`);
        console.warn(`[TORPEDO AI] system.runInterval type: ${typeof system?.runInterval}`);
        if (torpedoInitAttempts < MAX_TORPEDO_INIT_ATTEMPTS) {
            console.warn(`[TORPEDO AI] Retrying in ${TORPEDO_INIT_DELAY_TICKS} ticks...`);
            system.runTimeout(() => initializeTorpedoAI(), TORPEDO_INIT_DELAY_TICKS);
        } else {
            console.error("[TORPEDO AI] FATAL ERROR: Failed to initialize after max attempts. System not available.");
        }
        return;
    }
    
    // Check if world is ready
    try {
        const overworld = world.getDimension("minecraft:overworld");
        if (!overworld) {
            console.warn(`[TORPEDO AI] World not ready (attempt ${torpedoInitAttempts}/${MAX_TORPEDO_INIT_ATTEMPTS}), retrying...`);
            if (torpedoInitAttempts < MAX_TORPEDO_INIT_ATTEMPTS) {
                system.runTimeout(() => initializeTorpedoAI(), TORPEDO_INIT_DELAY_TICKS);
            } else {
                console.error("[TORPEDO AI] ERROR: Failed to initialize after max attempts. World dimensions not available.");
            }
            return;
        }
    } catch (error) {
        console.warn(`[TORPEDO AI] World check failed (attempt ${torpedoInitAttempts}/${MAX_TORPEDO_INIT_ATTEMPTS}):`, error);
        if (torpedoInitAttempts < MAX_TORPEDO_INIT_ATTEMPTS) {
            system.runTimeout(() => initializeTorpedoAI(), TORPEDO_INIT_DELAY_TICKS);
        } else {
            console.error("[TORPEDO AI] ERROR: Failed to initialize after max attempts.");
        }
        return;
    }
    
    // Everything is ready - start the AI loop
    const aiLoopStartTick = system.currentTick;
    if (getDebugGeneral()) {
        console.warn(`[TORPEDO AI] ====== INITIALIZATION SUCCESSFUL ======`);
        console.warn(`[TORPEDO AI] Attempt: ${torpedoInitAttempts}/${MAX_TORPEDO_INIT_ATTEMPTS}`);
        console.warn(`[TORPEDO AI] AI loop starting at tick ${aiLoopStartTick}`);
        console.warn(`[TORPEDO AI] Processing ${TORPEDO_TYPES.length} torpedo types: ${TORPEDO_TYPES.map(t => t.id).join(", ")}`);
        console.warn(`[TORPEDO AI] Dimensions to check: ${DIMENSION_IDS.join(", ")}`);
        console.warn(`[TORPEDO AI] Max processing distance: ${MAX_PROCESSING_DISTANCE} blocks`);
    }
    
    // Check debug flags after initialization (when players might have joined)
    const allPlayers = world.getAllPlayers();
    if (getDebugGeneral()) {
        console.warn(`[TORPEDO AI] Players online: ${allPlayers.length}`);
        if (allPlayers.length > 0) {
            console.warn(`[TORPEDO AI] Checking debug flags from ${allPlayers.length} player(s)...`);
            const generalDebug = getDebugGeneral();
            const targetingDebug = getDebugTargeting();
            const divingDebug = getDebugDiving();
            const blockBreakingDebug = getDebugBlockBreaking();
            console.warn(`[TORPEDO AI] Debug flags - General: ${generalDebug}, Targeting: ${targetingDebug}, Diving: ${divingDebug}, BlockBreaking: ${blockBreakingDebug}`);
            if (generalDebug) {
                console.warn(`[TORPEDO AI] ✓ General logging is ON`);
            }
            if (targetingDebug) {
                console.warn(`[TORPEDO AI] ✓ Targeting logging is ON`);
            }
            if (divingDebug) {
                console.warn(`[TORPEDO AI] ✓ Diving logging is ON`);
            }
            if (blockBreakingDebug) {
                console.warn(`[TORPEDO AI] ✓ Block breaking logging is ON`);
            }
        } else {
            console.warn(`[TORPEDO AI] No players online yet - debug flags will be checked when players join`);
        }
    }
    
    torpedoAIIntervalId = system.runInterval(() => {
        const seen = new Set();
        const currentTick = system.currentTick;
        const ticksSinceStart = currentTick - aiLoopStartTick;
        
        // Note: system.runInterval already handles the interval, so we don't need to check tick % AI_TICK_INTERVAL
        // The interval callback is only called every AI_TICK_INTERVAL ticks automatically
        
        // Always log when debug is enabled (frequently to confirm it's working)
        if (getDebugGeneral()) {
            // Log very frequently in first 20 ticks, then every 50 ticks (only when debug enabled)
            if (getDebugGeneral() && (ticksSinceStart <= 20 || ticksSinceStart % 50 === 0)) {
                console.warn(`[TORPEDO AI] AI loop running at tick ${currentTick} (${ticksSinceStart} ticks since start) - DEBUG ENABLED`);
            }
        }
        
        // Performance: Use shared player cache
        const allPlayers = getCachedPlayers();
        
        // Log player count for troubleshooting (only when debug enabled)
        if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 50 === 0)) {
            console.warn(`[TORPEDO AI] Player detection: found ${allPlayers.length} player(s)`);
            if (allPlayers.length > 0) {
                for (const player of allPlayers) {
                    try {
                        const dimId = player.dimension?.id || 'unknown';
                        const isValid = typeof player.isValid === "function" ? player.isValid() : 'unknown';
                        console.warn(`[TORPEDO AI]   Player: ${player.name}, dimension: ${dimId}, valid: ${isValid}`);
                    } catch (err) {
                        console.warn(`[TORPEDO AI]   Player: ${player.name}, error getting info:`, err);
                    }
                }
            }
        }
        
        const playerPositions = new Map(); // Map<dimensionId, positions[]>
        for (const player of allPlayers) {
            try {
                if (typeof player.isValid === "function" && !player.isValid()) {
                    if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 50 === 0)) {
                        console.warn(`[TORPEDO AI] Skipping invalid player: ${player.name}`);
                    }
                    continue;
                }
                const dimId = player.dimension?.id;
                if (!dimId) {
                    if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 50 === 0)) {
                        console.warn(`[TORPEDO AI] Player ${player.name} has no dimension ID`);
                    }
                    continue;
                }
                // Normalize dimension ID (handle both "overworld" and "minecraft:overworld")
                const normalizedDimId = dimId.startsWith("minecraft:") ? dimId.substring(10) : dimId;
                if (!playerPositions.has(normalizedDimId)) {
                    playerPositions.set(normalizedDimId, []);
                }
                playerPositions.get(normalizedDimId).push(player.location);
                if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 50 === 0)) {
                    console.warn(`[TORPEDO AI] Added player ${player.name} at (${player.location.x.toFixed(1)}, ${player.location.y.toFixed(1)}, ${player.location.z.toFixed(1)}) in ${normalizedDimId}`);
                }
            } catch (err) {
                if (getDebugGeneral()) {
                    console.warn(`[TORPEDO AI] Error processing player ${player.name}:`, err);
                }
            }
        }
        
        if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 50 === 0)) {
            console.warn(`[TORPEDO AI] Player positions cached: ${playerPositions.size} dimension(s) with players`);
            for (const [dimId, positions] of playerPositions.entries()) {
                console.warn(`[TORPEDO AI]   ${dimId}: ${positions.length} player position(s)`);
            }
        }
        
        for (const dimId of DIMENSION_IDS) {
        let dimension;
        try {
            dimension = world.getDimension(dimId);
        } catch {
            if (ticksSinceStart <= 20 || currentTick % 200 === 0) {
                console.warn(`[TORPEDO AI] Failed to get dimension ${dimId}`);
            }
            continue;
        }
        if (!dimension) {
            if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 200 === 0)) {
                console.warn(`[TORPEDO AI] Dimension ${dimId} is null`);
            }
            continue;
        }

        // Performance: Distance-based culling - only process entities near players
        // Check both normalized and full dimension ID (like mining AI does)
        const dimPlayerPositions = playerPositions.get(dimId) || playerPositions.get(`minecraft:${dimId}`) || [];
        if (dimPlayerPositions.length === 0) {
            // Log when skipping dimension due to no players (only when debug enabled)
            if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 200 === 0)) {
                console.warn(`[TORPEDO AI] Skipping ${dimId} - no players in this dimension (${allPlayers.length} total players online, cached positions: ${playerPositions.size} dimensions)`);
            }
            continue; // No players in this dimension, skip
        }
        
        // Log when we have players in a dimension and will query entities (only when debug enabled)
        if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 200 === 0)) {
            console.warn(`[TORPEDO AI] Processing ${dimId} - ${dimPlayerPositions.length} player(s) in this dimension`);
        }

        for (const config of TORPEDO_TYPES) {
            let entities;
            try {
                entities = dimension.getEntities({ type: config.id });
                // Log entity query results (only when debug enabled)
                if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 50 === 0)) {
                    console.warn(`[TORPEDO AI] Entity query for ${config.id} in ${dimId}: ${entities?.length || 0} entities found`);
                }
            } catch (err) {
                console.warn(`[TORPEDO AI] ERROR querying entities for ${config.id} in ${dimId}:`, err);
                continue;
            }
            if (!entities || entities.length === 0) {
                // Log when no entities found (only when debug enabled)
                if (getDebugGeneral() && (ticksSinceStart <= 20 || currentTick % 100 === 0)) {
                    console.warn(`[TORPEDO AI] No ${config.id} entities found in ${dimId} at tick ${currentTick}`);
                }
                continue;
            }
            
            // Log when entities are found (only when debug enabled)
            if (getDebugGeneral()) {
                console.warn(`[TORPEDO AI] ====== FOUND ${entities.length} ${config.id} ENTITIES ======`);
                console.warn(`[TORPEDO AI] Dimension: ${dimId}, Tick: ${currentTick}`);
                if (entities.length > 0) {
                    const firstEntity = entities[0];
                    if (firstEntity && typeof firstEntity.isValid === "function" && firstEntity.isValid()) {
                        const loc = firstEntity.location;
                        console.warn(`[TORPEDO AI] First entity position: (${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)})`);
                        if (dimPlayerPositions.length > 0) {
                            let minDist = Infinity;
                            for (const playerPos of dimPlayerPositions) {
                                const dx = loc.x - playerPos.x;
                                const dy = loc.y - playerPos.y;
                                const dz = loc.z - playerPos.z;
                                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                                if (dist < minDist) minDist = dist;
                            }
                            console.warn(`[TORPEDO AI] Distance to nearest player: ${minDist.toFixed(1)} blocks (max processing: ${MAX_PROCESSING_DISTANCE})`);
                        }
                    }
                }
            }
            
            // Performance: Distance-based culling - only process entities near players
            const validEntities = [];
            for (const entity of entities) {
                if (typeof entity?.isValid === "function" && !entity.isValid()) continue;
                
                // Check if entity is within processing distance of any player
                const entityLoc = entity.location;
                let withinRange = false;
                for (const playerPos of dimPlayerPositions) {
                    const dx = entityLoc.x - playerPos.x;
                    const dy = entityLoc.y - playerPos.y;
                    const dz = entityLoc.z - playerPos.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq <= MAX_PROCESSING_DISTANCE_SQ) {
                        withinRange = true;
                        break;
                    }
                }
                if (withinRange) {
                    validEntities.push(entity);
                }
            }
            
            if (validEntities.length === 0) {
                // Log when entities are out of range (only when debug enabled)
                if (getDebugGeneral() && entities.length > 0 && (ticksSinceStart <= 20 || currentTick % 50 === 0)) {
                    console.warn(`[TORPEDO AI] ====== ENTITIES OUT OF RANGE ======`);
                    console.warn(`[TORPEDO AI] Found ${entities.length} ${config.id} entities in ${dimId}, but ALL are out of range (>${MAX_PROCESSING_DISTANCE} blocks from players)`);
                    // Log distances to nearest player for debugging
                    if (dimPlayerPositions.length > 0 && entities.length > 0) {
                        const firstEntity = entities[0];
                        if (firstEntity && typeof firstEntity.isValid === "function" && firstEntity.isValid()) {
                            const entityLoc = firstEntity.location;
                            let minDist = Infinity;
                            let nearestPlayerPos = null;
                            for (const playerPos of dimPlayerPositions) {
                                const dx = entityLoc.x - playerPos.x;
                                const dy = entityLoc.y - playerPos.y;
                                const dz = entityLoc.z - playerPos.z;
                                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                                if (dist < minDist) {
                                    minDist = dist;
                                    nearestPlayerPos = playerPos;
                                }
                            }
                            console.warn(`[TORPEDO AI] Nearest entity at (${entityLoc.x.toFixed(1)}, ${entityLoc.y.toFixed(1)}, ${entityLoc.z.toFixed(1)})`);
                            if (nearestPlayerPos) {
                                console.warn(`[TORPEDO AI] Nearest player at (${nearestPlayerPos.x.toFixed(1)}, ${nearestPlayerPos.y.toFixed(1)}, ${nearestPlayerPos.z.toFixed(1)})`);
                            }
                            console.warn(`[TORPEDO AI] Distance: ${minDist.toFixed(1)} blocks (max processing: ${MAX_PROCESSING_DISTANCE} blocks)`);
                            console.warn(`[TORPEDO AI] Entity is ${(minDist - MAX_PROCESSING_DISTANCE).toFixed(1)} blocks too far away`);
                        }
                    }
                }
                continue;
            }
            
            // Log when we have valid entities to process (only when debug enabled)
            if (getDebugGeneral()) {
                console.warn(`[TORPEDO AI] ====== PROCESSING ${validEntities.length} VALID ENTITIES ======`);
                console.warn(`[TORPEDO AI] ${entities.length} total found, ${validEntities.length} within ${MAX_PROCESSING_DISTANCE} blocks of players`);
            }

            // Debug: Log when processing entities (more frequently when debug enabled)
            if (getDebugGeneral()) {
                // Log every 50 ticks when debug is enabled (more frequent)
                const tick = system.currentTick;
                if (ticksSinceStart <= 20 || tick % 50 === 0) {
                    console.warn(`[TORPEDO AI] ====== PROCESSING ENTITIES ======`);
                    console.warn(`[TORPEDO AI] Dimension: ${dimId}, Type: ${config.id}`);
                    console.warn(`[TORPEDO AI] Found ${entities.length} total entities, ${validEntities.length} within range (${MAX_PROCESSING_DISTANCE} blocks)`);
                    console.warn(`[TORPEDO AI] Players in dimension: ${dimPlayerPositions.length}`);
                    if (validEntities.length > 0) {
                        const firstEntity = validEntities[0];
                        if (firstEntity && typeof firstEntity.isValid === "function" && firstEntity.isValid()) {
                            const loc = firstEntity.location;
                            console.warn(`[TORPEDO AI] First entity position: (${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)})`);
                        }
                    }
                }
            }

            for (const entity of validEntities) {
                seen.add(entity.id);
                
                const state = getState(entity);
                const loc = entity.location;
                
                // Play periodic flight sound
                const entityId = entity.id;
                const lastSoundTick = lastTorpedoFlightSoundTick.get(entityId) || 0;
                if (!system || typeof system.currentTick === 'undefined') {
                    continue; // Skip if system is not available
                }
                const tick = system.currentTick;
                if (tick - lastSoundTick >= TORPEDO_FLIGHT_SOUND_INTERVAL) {
                    try {
                        if (dimension && loc) {
                            const volume = 0.7;
                            const pitch = 0.9 + Math.random() * 0.2;
                            if (dimension.playSound) {
                                dimension.playSound("torpedo_mb.flight", loc, { volume, pitch });
                            } else {
                                const px = loc.x.toFixed(1);
                                const py = loc.y.toFixed(1);
                                const pz = loc.z.toFixed(1);
                                dimension.runCommandAsync(
                                    `playsound torpedo_mb.flight @a[x=${px},y=${py},z=${pz},r=32] ${px} ${py} ${pz} ${volume.toFixed(2)} ${pitch.toFixed(2)}`
                                );
                            }
                            lastTorpedoFlightSoundTick.set(entityId, tick);
                        }
                    } catch {
                        // Ignore sound errors
                    }
                }
                
                // Log first processing of each entity (once per entity, using state to track, only when debug enabled)
                if (!state.activationLogged) {
                    state.activationLogged = true;
                    if (getDebugGeneral()) {
                        const entityId = entity.id.substring(0, 8);
                        console.warn(`[TORPEDO AI] ====== ENTITY ACTIVATED ======`);
                        console.warn(`[TORPEDO AI] Entity ID: ${entityId}...`);
                        console.warn(`[TORPEDO AI] Type: ${entity.typeId}`);
                        console.warn(`[TORPEDO AI] Position: (${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)})`);
                        console.warn(`[TORPEDO AI] Initial state: mode=${state.mode}, cooldown=${state.cooldown}, diveCooldown=${state.diveCooldown}`);
                        console.warn(`[TORPEDO AI] Config: cruiseMin=${config.cruiseMin}, cruiseMax=${config.cruiseMax}, minY=${config.minY}, diveRange=${config.diveRange}`);
                    }
                }
                
                if (getDebugGeneral()) {
                    // Log entity processing more frequently when debug enabled
                    const tick = system.currentTick;
                    if (ticksSinceStart <= 20 || tick % 50 === 0) {
                        const entityId = entity.id.substring(0, 8);
                        const entityY = entity.location.y;
                        const vel = entity.getVelocity?.();
                        const speed = vel ? Math.hypot(vel.x, vel.y, vel.z) : 0;
                        console.warn(`[TORPEDO AI] Entity ${entityId}: Y=${entityY.toFixed(1)}, mode=${state.mode}, speed=${speed.toFixed(2)}, cooldown=${state.cooldown}, diveCooldown=${state.diveCooldown}`);
                    }
                }
                
                // Prevent targeting creative players (entity JSON behavior can't filter this)
                // Check if entity is moving towards a creative player and stop it
                try {
                    const vel = entity.getVelocity?.();
                    if (vel) {
                        const nearbyPlayers = dimension.getEntities({
                            location: entity.location,
                            maxDistance: 50,
                            type: "minecraft:player"
                        });
                        for (const player of nearbyPlayers) {
                            try {
                                const gameMode = player.getGameMode();
                                if (gameMode === "creative" || gameMode === "spectator") {
                                    const dx = player.location.x - entity.location.x;
                                    const dy = player.location.y - entity.location.y;
                                    const dz = player.location.z - entity.location.z;
                                    const dist = Math.hypot(dx, dy, dz);
                                    
                                    // If creative player is within 40 blocks and entity is moving towards them
                                    if (dist < 40 && dist > 0) {
                                        const dirToPlayer = { x: dx / dist, y: dy / dist, z: dz / dist };
                                        const velDir = { 
                                            x: vel.x / (Math.hypot(vel.x, vel.z) || 1), 
                                            y: 0, 
                                            z: vel.z / (Math.hypot(vel.x, vel.z) || 1) 
                                        };
                                        const dot = dirToPlayer.x * velDir.x + dirToPlayer.z * velDir.z;
                                        
                                        // If moving towards creative player (dot product > 0.5), apply reverse impulse
                                        if (dot > 0.5) {
                                            try {
                                                entity.applyImpulse({
                                                    x: -vel.x * 0.3,
                                                    y: 0,
                                                    z: -vel.z * 0.3
                                                });
                                            } catch { }
                                        }
                                    }
                                }
                            } catch { }
                        }
                    }
                } catch { }
                
                // State already declared above, just update cooldowns
                if (state.cooldown > 0) state.cooldown--;
                if (state.diveCooldown > 0) state.diveCooldown--;
                
                const minY = config.minY || MIN_STRUCTURE_Y;
                
                // Always maintain altitude (enforce minimum Y) - do this BEFORE other logic
                const altitudeBefore = entity.location.y;
                adjustAltitude(entity, config);
                const altitudeAfter = entity.location.y;
                
                if (getDebugDiving()) {
                    if (Math.abs(altitudeAfter - altitudeBefore) > 0.1) {
                        console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} altitude adjusted: ${altitudeBefore.toFixed(1)} -> ${altitudeAfter.toFixed(1)}, mode=${state.mode}, cruiseMin=${config.cruiseMin}, cruiseMax=${config.cruiseMax}`);
                    }
                    // Always log altitude status when in dive mode or above cruise
                    if (state.mode === "dive" || altitudeAfter > config.cruiseMax) {
                        console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} altitude check: Y=${altitudeAfter.toFixed(1)}, mode=${state.mode}, cruiseMin=${config.cruiseMin}, cruiseMax=${config.cruiseMax}, minY=${minY}`);
                    }
                }
                
                // If entity is below minY, force it up and prevent diving
                if (entity.location.y < minY) {
                    state.diveCooldown = DIVE_COOLDOWN_TICKS; // Prevent diving when too low
                    if (getDebugDiving()) {
                        console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} below minY (${entity.location.y.toFixed(1)} < ${minY}), preventing dive`);
                    }
                }
                
                // Check exhaustion first
                if (checkTorpedoExhaustion(entity, config)) continue;
                
                // Always break blocks around the entity (ravager-style) - even when stationary
                // This ensures blocks above and below are broken
                const vel = entity.getVelocity?.();
                let blocksBroken = 0;
                if (vel) {
                    const speed = Math.hypot(vel.x, vel.y, vel.z);
                    if (speed > 0.01) {
                        // Moving - break blocks all around
                        blocksBroken = breakBlocksInPath(entity, { x: vel.x, z: vel.z }, config);
                    } else {
                        // Not moving much - still break blocks directly above and below
                        blocksBroken = breakBlocksInPath(entity, { x: 0, z: 0 }, config);
                    }
                } else {
                    // No velocity - still break blocks directly above and below
                    blocksBroken = breakBlocksInPath(entity, { x: 0, z: 0 }, config);
                }
                
                if (getDebugBlockBreaking() && blocksBroken > 0) {
                    console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} broke ${blocksBroken} blocks, total=${getBreakCount(entity)}, mode=${state.mode}`);
                }
                
                const targetInfo = findTarget(entity, 64);
                const currentTick = system.currentTick;

                if (targetInfo) {
                    // Torpedo bears can attack targets at any Y level - they dive down from the sky
                    // Priority: Ground players get almost guaranteed dive, mobs have less chance
                    
                    // Update last seen tick
                    if (!state.lastSeenTick) state.lastSeenTick = 0;
                    state.lastSeenTick = currentTick;
                    
                    const horizDist = Math.hypot(targetInfo.vector.x, targetInfo.vector.z);
                    const isPlayer = targetInfo.isPlayer || false;
                    const entityY = entity.location.y;
                    const targetY = targetInfo.location.y;
                    const dy = targetY - entityY;
                    
                    if (getDebugTargeting()) {
                        console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} found target: type=${targetInfo.entity?.typeId || 'unknown'}, isPlayer=${isPlayer}, horizDist=${horizDist.toFixed(1)}, dy=${dy.toFixed(1)}, mode=${state.mode}, cooldown=${state.cooldown}, diveCooldown=${state.diveCooldown} - TARGETING DEBUG`);
                    }
                    
                    // If target is above and close horizontally, break blocks directly above to reach them
                    if (dy > 1.5 && horizDist <= 2.5) {
                        const maxHeight = Math.min(3, Math.floor(dy));
                        if (maxHeight > 0) {
                            const brokenAbove = breakBlocksAboveEntity(entity, maxHeight, config);
                            if (getDebugBlockBreaking() && brokenAbove > 0) {
                                console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} broke ${brokenAbove} blocks above (target above), total=${getBreakCount(entity)}`);
                            }
                        }
                    }
                    
                    // If in dive mode, check if we should continue diving or return to cruise
                    if (state.mode === "dive") {
                        // Continue diving if:
                        // 1. Still within dive range
                        // 2. Target is still below us (or we haven't passed it)
                        // 3. Not too far below cruise altitude
                        const shouldContinueDive = horizDist < config.diveRange * 1.5 && 
                                                   (dy < 5 || entityY < config.cruiseMin - MAX_DIVE_DEPTH) &&
                                                   entityY >= minY;
                        
                        if (getDebugDiving()) {
                            console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} in DIVE mode - checking continuation:`);
                            console.warn(`[TORPEDO AI]   horizDist=${horizDist.toFixed(1)} < ${(config.diveRange * 1.5).toFixed(1)}? ${horizDist < config.diveRange * 1.5}`);
                            console.warn(`[TORPEDO AI]   dy=${dy.toFixed(1)}, entityY=${entityY.toFixed(1)}, cruiseMin=${config.cruiseMin}, MAX_DIVE_DEPTH=${MAX_DIVE_DEPTH}`);
                            console.warn(`[TORPEDO AI]   entityY >= minY? ${entityY >= minY} (${entityY.toFixed(1)} >= ${minY})`);
                            console.warn(`[TORPEDO AI]   shouldContinueDive: ${shouldContinueDive}`);
                        }
                        
                        if (shouldContinueDive) {
                            // Continue diving
                            diveTowardsTarget(entity, targetInfo, config, state);
                            if (getDebugDiving()) {
                                console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} CONTINUING DIVE: Y=${entityY.toFixed(1)}, targetY=${targetY.toFixed(1)}, horizDist=${horizDist.toFixed(1)}`);
                            }
                        } else {
                            // Return to cruise mode
                            const oldMode = state.mode;
                            state.mode = "cruise";
                            if (getDebugDiving()) {
                                console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} MODE CHANGE: ${oldMode} -> ${state.mode}`);
                                console.warn(`[TORPEDO AI]   Reason: Ending dive, returning to cruise`);
                                console.warn(`[TORPEDO AI]   Y=${entityY.toFixed(1)}, horizDist=${horizDist.toFixed(1)}, targetY=${targetY.toFixed(1)}`);
                            }
                        }
                    }
                    
                    // Dive priority system:
                    // - Players on ground: almost guaranteed dive (95% chance)
                    // - Other mobs: less likely dive (30% chance)
                    // Allow diving even with diveCooldown if target is very close (within 5 blocks)
                    const veryClose = horizDist < 5;
                    const shouldDive = horizDist < config.diveRange && state.cooldown === 0 && 
                                      (state.diveCooldown === 0 || veryClose) && entity.location.y >= minY &&
                                      state.mode === "cruise"; // Only dive if in cruise mode
                    
                    if (shouldDive) {
                        // Ground players get almost guaranteed dive
                        if (isPlayer) {
                            const diveChance = 0.95; // 95% chance to dive on ground players
                            const diveRoll = Math.random();
                            if (diveRoll < diveChance) {
                                const oldMode = state.mode;
                                state.mode = "dive";
                                state.lastTarget = targetInfo.location;
                                state.cooldown = 8;
                                state.diveCooldown = DIVE_COOLDOWN_TICKS;
                                state.lastDiveTick = currentTick;
                                if (getDebugDiving()) {
                                    console.warn(`[TORPEDO AI] ====== DIVE INITIATED ======`);
                                    console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} MODE CHANGE: ${oldMode} -> ${state.mode}`);
                                    console.warn(`[TORPEDO AI] Target: ${targetInfo.entity?.typeId || 'unknown'} (isPlayer: ${isPlayer})`);
                                    console.warn(`[TORPEDO AI] Entity Y: ${entityY.toFixed(1)}, Target Y: ${targetY.toFixed(1)}, dy: ${dy.toFixed(1)}`);
                                    console.warn(`[TORPEDO AI] Horizontal distance: ${horizDist.toFixed(1)} blocks`);
                                    console.warn(`[TORPEDO AI] Dive chance: 95% (player), Roll: ${(diveRoll * 100).toFixed(1)}%, Result: DIVE`);
                                }
                                diveTowardsTarget(entity, targetInfo, config, state);
                                if (getDebugDiving()) {
                                    console.warn(`[TORPEDO AI] diveTowardsTarget() called`);
                                }
                            } else {
                                // 5% chance to cruise instead
                                try {
                                    const moveForce = config.forwardForce * 0.6;
                                    entity.applyImpulse({
                                        x: (targetInfo.vector.x / (horizDist || 1)) * moveForce,
                                        y: 0,
                                        z: (targetInfo.vector.z / (horizDist || 1)) * moveForce
                                    });
                                } catch { }
                                state.mode = "cruise";
                            }
                        } else {
                            // Mobs get less likely dive (30% chance)
                            const diveChance = 0.30; // 30% chance to dive on mobs
                            const diveRoll = Math.random();
                            if (diveRoll < diveChance) {
                                const oldMode = state.mode;
                                state.mode = "dive";
                                state.lastTarget = targetInfo.location;
                                state.cooldown = 8;
                                state.diveCooldown = DIVE_COOLDOWN_TICKS;
                                state.lastDiveTick = currentTick;
                                if (getDebugDiving()) {
                                    console.warn(`[TORPEDO AI] ====== DIVE INITIATED ======`);
                                    console.warn(`[TORPEDO AI] Entity ${entity.id.substring(0, 8)} MODE CHANGE: ${oldMode} -> ${state.mode}`);
                                    console.warn(`[TORPEDO AI] Target: ${targetInfo.entity?.typeId || 'unknown'} (isPlayer: ${isPlayer})`);
                                    console.warn(`[TORPEDO AI] Entity Y: ${entityY.toFixed(1)}, Target Y: ${targetY.toFixed(1)}, dy: ${dy.toFixed(1)}`);
                                    console.warn(`[TORPEDO AI] Horizontal distance: ${horizDist.toFixed(1)} blocks`);
                                    console.warn(`[TORPEDO AI] Dive chance: 30% (mob), Roll: ${(diveRoll * 100).toFixed(1)}%, Result: DIVE`);
                                }
                                diveTowardsTarget(entity, targetInfo, config, state);
                                if (getDebugDiving()) {
                                    console.warn(`[TORPEDO AI] diveTowardsTarget() called`);
                                }
                            } else {
                                // 70% chance to cruise instead
                                try {
                                    const moveForce = config.forwardForce * 0.6;
                                    entity.applyImpulse({
                                        x: (targetInfo.vector.x / (horizDist || 1)) * moveForce,
                                        y: 0,
                                        z: (targetInfo.vector.z / (horizDist || 1)) * moveForce
                                    });
                                } catch { }
                                state.mode = "cruise";
                            }
                        }
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
                    // Check if should enter passive wandering (5 minutes without seeing target)
                    const lastSeen = state.lastSeenTick || 0;
                    const timeSinceSeen = currentTick - lastSeen;
                    
                    if (timeSinceSeen > PASSIVE_WANDER_TICKS) {
                        // Force passive wandering - clear tracking
                        state.lastTarget = null;
                        state.lastSeenTick = 0;
                        applyCruiseDrift(entity);
                        state.mode = "cruise";
                    } else if (state.lastTarget) {
                        // Still within memory window - try to find the target entity to verify it's still alive
                        const dimension = entity.dimension;
                        if (dimension) {
                            let targetFound = false;
                            // Check if it's a player (use shared cache)
                            const allPlayers = getCachedPlayers();
                            for (const player of allPlayers) {
                                if (player.dimension === dimension) {
                                    const dx = player.location.x - state.lastTarget.x;
                                    const dz = player.location.z - state.lastTarget.z;
                                    // If player is within 5 blocks of last known position, assume it's the same target
                                    if (dx * dx + dz * dz < 25) {
                                        targetFound = true;
                                        // Update target location
                                        state.lastTarget = player.location;
                                        // Continue pursuing
                                        const entityLoc = entity.location;
                                        const targetVec = {
                                            x: player.location.x - entityLoc.x,
                                            y: player.location.y - entityLoc.y,
                                            z: player.location.z - entityLoc.z
                                        };
                                        const horizDist = Math.hypot(targetVec.x, targetVec.z);
                                        if (horizDist > 0) {
                                            try {
                                                const moveForce = config.forwardForce * 0.6;
                                                entity.applyImpulse({
                                                    x: (targetVec.x / horizDist) * moveForce,
                                                    y: 0,
                                                    z: (targetVec.z / horizDist) * moveForce
                                                });
                                            } catch { }
                                        }
                                        state.mode = "cruise";
                                        break;
                                    }
                                }
                            }
                            // If target not found, it's probably dead - clear memory
                            if (!targetFound) {
                                state.lastTarget = null;
                                state.lastSeenTick = 0;
                                applyCruiseDrift(entity);
                                state.mode = "cruise";
                            }
                        } else {
                            // No dimension - clear target
                            state.lastTarget = null;
                            state.lastSeenTick = 0;
                            applyCruiseDrift(entity);
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
    }
        cleanupStates(seen);
        
        // Clean up target cache for entities that no longer exist
        for (const [entityId, cached] of targetCache.entries()) {
            try {
                // Check if entity still exists (this is expensive, so only do it occasionally)
                const tick = system.currentTick;
                if (tick % 100 === 0) {
                    // Every 5 seconds, clean up stale cache entries
                    // Check if entity ID is not in seen set (entity no longer valid this tick)
                    // or if cache entry has expired based on TARGET_CACHE_TICKS
                    const cacheAge = tick - cached.tick;
                    if (!seen.has(entityId) || cacheAge >= TARGET_CACHE_TICKS) {
                        targetCache.delete(entityId);
                    }
                }
            } catch {
                targetCache.delete(entityId);
            }
        }
    }, 5);
}

// Start initialization with a delay to ensure world is ready
// Only log script load if debug is enabled (will be checked when players join)
if (getDebugGeneral()) {
    console.warn("[TORPEDO AI] ====== SCRIPT LOADED ======");
    console.warn(`[TORPEDO AI] Script file loaded at tick ${system.currentTick}`);
    console.warn(`[TORPEDO AI] Note: Debug flags are checked dynamically when players join`);
    console.warn(`[TORPEDO AI] Starting delayed initialization in ${TORPEDO_INIT_DELAY_TICKS} ticks...`);
}
system.runTimeout(() => {
    initializeTorpedoAI();
}, TORPEDO_INIT_DELAY_TICKS);
