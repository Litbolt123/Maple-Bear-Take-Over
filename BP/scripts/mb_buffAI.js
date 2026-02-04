import { system, world } from "@minecraft/server";
import { UNBREAKABLE_BLOCKS } from "./mb_miningBlockList.js";
import { SNOW_REPLACEABLE_BLOCKS, SNOW_TWO_BLOCK_PLANTS } from "./mb_blockLists.js";
import { isDebugEnabled } from "./mb_codex.js";
import { isScriptEnabled, SCRIPT_IDS } from "./mb_scriptToggles.js";
import { getCachedPlayers } from "./mb_sharedCache.js";

// Debug helper functions
function getDebugGeneral() {
    return isDebugEnabled("buff", "general") || isDebugEnabled("buff", "all");
}

function getDebugBlockBreaking() {
    return isDebugEnabled("buff", "blockBreaking") || isDebugEnabled("buff", "all");
}

const DIMENSION_IDS = ["overworld", "nether", "the_end"];
// Buff bear collision box: height 0.7, scale 5 = 3.5 blocks tall
// Entity location is at feet, so head is at entityY + 3.5
// We break blocks starting from entityY + 4 (block above head) upward
const BUFF_BEAR_COLLISION_HEIGHT = 0.7;
const BUFF_BEAR_SCALE = 5;
const BUFF_BEAR_ACTUAL_HEIGHT = BUFF_BEAR_COLLISION_HEIGHT * BUFF_BEAR_SCALE; // 3.5 blocks

const BUFF_BEAR_TYPES = [
    { id: "mb:buff_mb", breaksPerTick: 2, maxHeight: 3 },
    { id: "mb:buff_mb_day8", breaksPerTick: 2, maxHeight: 3 },
    { id: "mb:buff_mb_day13", breaksPerTick: 3, maxHeight: 4 },
    { id: "mb:buff_mb_day20", breaksPerTick: 3, maxHeight: 4 }
];

const AI_TICK_INTERVAL = 2; // Run every 2 ticks (50% reduction in processing frequency)
const MAX_PROCESSING_DISTANCE = 64; // Only process buff bears within 64 blocks of players
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
const MIN_STRUCTURE_Y = -64; // Minimum Y level

// Stuck detection and explosion constants
const STUCK_CHECK_INTERVAL = 20; // Check for stuck every 20 ticks (1 second)
const STUCK_TIME_TICKS = 300; // 15 seconds (300 ticks) without moving = stuck
const MIN_ALIVE_TIME_TICKS = 600; // 30 seconds (600 ticks) before explosion can trigger
const EXPLOSION_RADIUS = 6; // 6 block radius for explosion (larger than before)
const SNOW_SPRAY_RADIUS = 8; // 8 block radius for snow spray (much larger)
const STUCK_MOVEMENT_THRESHOLD = 2.5; // Must move at least 2.5 blocks to not be considered stuck (harder to trap)
const HIT_REDUCTION_TICKS = 30; // Each hit reduces stuck timer by 30 ticks (1.5 seconds) when stuck

let buffAIIntervalId = null;
const MAX_BUFF_INIT_ATTEMPTS = 10;
const BUFF_INIT_DELAY_TICKS = 20;
let buffInitAttempts = 0;
let buffAIInitialized = false;

// Track spawn time and position history for stuck detection
const BUFF_SPAWN_TIME = new Map(); // entityId -> spawnTick
const BUFF_POSITION_HISTORY = new Map(); // entityId -> { lastPosition, stuckStartTick }

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

/**
 * Breaks blocks above the buff bear's head when climbing.
 * Buff bear is 3.5 blocks tall (0.7 collision height * 5 scale),
 * so head is at entityY + 3.5, and we break blocks starting from entityY + 4 upward.
 */
function breakBlocksAboveEntity(entity, maxHeight, config) {
    const dimension = entity?.dimension;
    if (!dimension) return 0;
    const loc = entity.location;
    const entityX = Math.floor(loc.x);
    const entityY = Math.floor(loc.y);
    const entityZ = Math.floor(loc.z);
    const minY = config.minY || MIN_STRUCTURE_Y;
    const breakLimit = Math.max(1, Math.min(maxHeight, config.breaksPerTick ?? 2));
    let broken = 0;
    
    // Calculate head position: entityY + actual height (3.5 blocks)
    // Head is at entityY + 3.5, so blocks above head start at entityY + 4
    const headY = Math.floor(entityY + BUFF_BEAR_ACTUAL_HEIGHT);
    const startY = headY + 1; // First block above head
    
    for (let dy = 0; dy < maxHeight; dy++) {
        if (broken >= breakLimit) break;
        const targetY = startY + dy;
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
        
        try {
            block.setType("minecraft:air");
            playBreakSound(dimension, entityX, targetY, entityZ, typeId);
            broken++;
            if (getDebugBlockBreaking()) {
                console.warn(`[BUFF AI] Entity ${entity.id.substring(0, 8)} broke block above head at (${entityX}, ${targetY}, ${entityZ}), type=${typeId} (head at Y=${headY}, feet at Y=${entityY})`);
            }
        } catch {
            // ignore
        }
    }
    
    return broken;
}

/**
 * Handles two-block plants when replacing with snow (same as torpedo bear).
 */
function handleTwoBlockPlant(dimension, checkX, topSolidY, checkZ, topSolidBlock, isAbove = false) {
    const blockAbove = dimension.getBlock({ x: checkX, y: topSolidY + 1, z: checkZ });
    const blockBelow = dimension.getBlock({ x: checkX, y: topSolidY - 1, z: checkZ });
    const blockType = topSolidBlock.typeId;
    if (!SNOW_TWO_BLOCK_PLANTS.has(blockType)) return;
    if (blockAbove && SNOW_TWO_BLOCK_PLANTS.has(blockAbove.typeId)) {
        try { topSolidBlock.setType("mb:snow_layer"); } catch { topSolidBlock.setType("minecraft:snow_layer"); }
        try { blockAbove.setType("minecraft:air"); } catch { }
    } else if (blockBelow && SNOW_TWO_BLOCK_PLANTS.has(blockBelow.typeId)) {
        try { blockBelow.setType("mb:snow_layer"); } catch { blockBelow.setType("minecraft:snow_layer"); }
        try { topSolidBlock.setType("minecraft:air"); } catch { }
    } else {
        try { topSolidBlock.setType("mb:snow_layer"); } catch { topSolidBlock.setType("minecraft:snow_layer"); }
    }
}

/**
 * Creates a white explosion effect, breaks blocks around the buff bear, AND sprays snow layers.
 * Similar to torpedo bear explosion but doesn't kill the bear.
 */
function createBuffExplosion(entity) {
    const dimension = entity?.dimension;
    if (!dimension || !entity?.isValid) return;
    
    const loc = entity.location;
    const centerX = Math.floor(loc.x);
    const centerY = Math.floor(loc.y);
    const centerZ = Math.floor(loc.z);
    
    try {
        // Create white explosion particles (like torpedo bear)
        try {
            dimension.runCommand(`particle minecraft:explosion ${loc.x} ${loc.y} ${loc.z} 0.5 0.5 0.5 0.1 10`);
        } catch { }
        try {
            dimension.runCommand(`particle minecraft:explosion_emitter ${loc.x} ${loc.y} ${loc.z} 1 1 1 0.2 20`);
        } catch { }
        
        // White dust particles
        try {
            dimension.spawnParticle("mb:white_dust_particle", { x: loc.x, y: loc.y + 1, z: loc.z });
            dimension.runCommand(`particle minecraft:ash ${centerX} ${centerY} ${centerZ} 0.5 0.5 0.5 0.05 15`);
        } catch { }
        
        // Play explosion sound
        try {
            dimension.runCommand(`playsound torpedo_mb.explode @a ${loc.x} ${loc.y} ${loc.z} 0.75 1`);
        } catch {
            try {
                dimension.runCommand(`playsound mob.tnt.explode @a ${loc.x} ${loc.y} ${loc.z} 1 1`);
            } catch { }
        }
        
        // Break blocks in explosion radius (like TNT - more blocks close, fewer farther out)
        let blocksBroken = 0;
        for (let dx = -EXPLOSION_RADIUS; dx <= EXPLOSION_RADIUS; dx++) {
            for (let dy = -EXPLOSION_RADIUS; dy <= EXPLOSION_RADIUS; dy++) {
                for (let dz = -EXPLOSION_RADIUS; dz <= EXPLOSION_RADIUS; dz++) {
                    const dist = Math.hypot(dx, dy, dz);
                    if (dist > EXPLOSION_RADIUS) continue;
                    
                    // TNT-like falloff: probability decreases with distance
                    // At distance 0: 100% chance to break
                    // At distance EXPLOSION_RADIUS: 0% chance to break
                    // Linear falloff
                    const breakChance = 1.0 - (dist / EXPLOSION_RADIUS);
                    
                    // Random chance based on distance
                    if (Math.random() > breakChance) continue;
                    
                    const targetX = centerX + dx;
                    const targetY = centerY + dy;
                    const targetZ = centerZ + dz;
                    
                    // Don't break blocks too low
                    if (targetY < MIN_STRUCTURE_Y) continue;
                    
                    // Don't break blocks where the bear is standing (protect bear from damage)
                    // Bear is 3.5 blocks tall, protect blocks from feet to head level
                    const bearBlockX = Math.floor(loc.x);
                    const bearBlockY = Math.floor(loc.y);
                    const bearBlockZ = Math.floor(loc.z);
                    const bearHeadY = Math.floor(loc.y + BUFF_BEAR_ACTUAL_HEIGHT);
                    
                    // Protect all blocks in the bear's collision box (feet to head)
                    if (targetX === bearBlockX && targetZ === bearBlockZ) {
                        if (targetY >= bearBlockY && targetY <= bearHeadY + 1) {
                            continue; // Skip blocks in bear's space
                        }
                    }
                    
                    let block;
                    try {
                        block = dimension.getBlock({ x: targetX, y: targetY, z: targetZ });
                    } catch {
                        continue;
                    }
                    if (!block) continue;
                    
                    const typeId = block.typeId;
                    if (typeId === "minecraft:air" || typeId === "minecraft:cave_air" || typeId === "minecraft:void_air") {
                        continue;
                    }
                    if (UNBREAKABLE_BLOCKS.has(typeId)) continue;
                    
                    try {
                        block.setType("minecraft:air");
                        playBreakSound(dimension, targetX, targetY, targetZ, typeId);
                        blocksBroken++;
                    } catch {
                        // ignore
                    }
                }
            }
        }
        
        if (getDebugBlockBreaking()) {
            console.warn(`[BUFF AI] Entity ${entity.id.substring(0, 8)} created explosion at (${centerX}, ${centerY}, ${centerZ}), broke ${blocksBroken} blocks`);
        }
        
        // Launch players and mobs away from explosion (like knockback roar)
        const KNOCKBACK_RANGE = 10; // Same range as knockback roar
        const KNOCKBACK_HORIZONTAL_STRENGTH = 9; // Same as knockback roar
        const KNOCKBACK_VERTICAL_STRENGTH = 7; // Same as knockback roar
        
        try {
            // Get all entities in knockback range
            const nearbyEntities = dimension.getEntities({
                location: loc,
                maxDistance: KNOCKBACK_RANGE
            });
            
            for (const targetEntity of nearbyEntities) {
                if (!targetEntity?.isValid) continue;
                if (targetEntity.id === entity.id) continue; // Don't knockback self
                
                const targetLoc = targetEntity.location;
                const dx = targetLoc.x - loc.x;
                const dy = targetLoc.y - loc.y;
                const dz = targetLoc.z - loc.z;
                const dist = Math.hypot(dx, dy, dz);
                
                if (dist === 0 || dist > KNOCKBACK_RANGE) continue;
                
                // Calculate knockback direction (away from explosion)
                const dirX = dx / dist;
                const dirY = dy / dist;
                const dirZ = dz / dist;
                
                // Apply knockback using applyImpulse (much stronger)
                // Horizontal knockback decreases with distance
                const distanceFactor = 1.0 - (dist / KNOCKBACK_RANGE); // 1.0 at center, 0.0 at edge
                const horizontalForce = KNOCKBACK_HORIZONTAL_STRENGTH * distanceFactor * 8; // 8x stronger (increased by 2)
                const verticalForce = KNOCKBACK_VERTICAL_STRENGTH * distanceFactor * 5; // 5x stronger (decreased by 1)
                
                try {
                    targetEntity.applyImpulse({
                        x: dirX * horizontalForce * 0.1, // Scale down for impulse
                        y: Math.max(0.5, dirY * verticalForce * 0.1) + 0.5, // Always push up significantly
                        z: dirZ * horizontalForce * 0.1
                    });
                    
                    if (getDebugGeneral()) {
                        console.warn(`[BUFF AI] Knocked back entity ${targetEntity.typeId} (${targetEntity.id.substring(0, 8)}) at distance ${dist.toFixed(1)}`);
                    }
                } catch {
                    // Entity might not support applyImpulse, try applyKnockback instead
                    try {
                        targetEntity.applyKnockback(dirX * horizontalForce * 0.1, dirZ * horizontalForce * 0.1, verticalForce * 0.1);
                    } catch {
                        // Ignore if both fail
                    }
                }
            }
        } catch (error) {
            if (getDebugGeneral()) {
                console.warn(`[BUFF AI] Error applying knockback:`, error);
            }
        }
        
        // Spray snow layers everywhere (like torpedo bear, but after breaking blocks)
        // Place snow layers on top of remaining blocks in a larger radius
        // Search from higher up to find the actual topmost surface after blocks were broken
        for (let dx = -SNOW_SPRAY_RADIUS; dx <= SNOW_SPRAY_RADIUS; dx++) {
            for (let dz = -SNOW_SPRAY_RADIUS; dz <= SNOW_SPRAY_RADIUS; dz++) {
                const dist = Math.hypot(dx, dz);
                if (dist > SNOW_SPRAY_RADIUS) continue;
                
                const checkX = centerX + dx;
                const checkZ = centerZ + dz;
                
                // Find the topmost solid block at this X,Z position
                // Search from explosion center + 3 blocks down to explosion center - 5 blocks
                // This covers a wider range to find surfaces after blocks were broken
                let topSolidY = null;
                let topSolidBlock = null;
                for (let dy = 3; dy >= -5; dy--) {
                    const checkY = centerY + dy;
                    if (checkY < MIN_STRUCTURE_Y) break; // Don't search below minimum Y
                    
                    try {
                        const block = dimension.getBlock({ x: checkX, y: checkY, z: checkZ });
                        if (block) {
                            const blockType = block.typeId;
                            // Skip mb:snow_layer and minecraft:snow_layer (don't count as solid for placement)
                            if (blockType === "mb:snow_layer" || blockType === "minecraft:snow_layer") {
                                continue; // Keep searching downward
                            }
                            // Found a solid block
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
                
                // Place snow on top of the solid block found
                if (topSolidY !== null && topSolidBlock) {
                    try {
                        const snowCheckY = topSolidY + 1;
                        const existingSnowBlock = dimension.getBlock({ x: checkX, y: snowCheckY, z: checkZ });
                        if (existingSnowBlock) {
                            const existingType = existingSnowBlock.typeId;
                            if (existingType === "mb:snow_layer" || existingType === "minecraft:snow_layer") {
                                continue; // Already has snow
                            }
                        }
                        const blockType = topSolidBlock.typeId;
                        
                        // Replace vanilla snow layer with custom snow layer
                        if (blockType === "minecraft:snow_layer") {
                            try { topSolidBlock.setType("mb:snow_layer"); } catch { topSolidBlock.setType("minecraft:snow_layer"); }
                            continue;
                        }
                        
                        // If it's any ground foliage (grass, flowers, etc.), replace it with snow
                        if (SNOW_REPLACEABLE_BLOCKS.has(blockType)) {
                            if (SNOW_TWO_BLOCK_PLANTS.has(blockType)) {
                                handleTwoBlockPlant(dimension, checkX, topSolidY, checkZ, topSolidBlock);
                            } else {
                                try { topSolidBlock.setType("mb:snow_layer"); } catch { topSolidBlock.setType("minecraft:snow_layer"); }
                            }
                        } else {
                            // Place snow in the air above the solid block
                            const snowY = topSolidY + 1;
                            const snowBlock = dimension.getBlock({ x: checkX, y: snowY, z: checkZ });
                            if (snowBlock) {
                                const snowBlockType = snowBlock.typeId;
                                if (snowBlockType === "mb:snow_layer" || snowBlockType === "minecraft:snow_layer") {
                                    continue; // Already has snow
                                }
                                // Replace foliage above so snow doesn't stack on top of grass
                                if (SNOW_REPLACEABLE_BLOCKS.has(snowBlockType)) {
                                    if (SNOW_TWO_BLOCK_PLANTS.has(snowBlockType)) {
                                        handleTwoBlockPlant(dimension, checkX, snowY, checkZ, snowBlock, true);
                                    } else {
                                        try { snowBlock.setType("mb:snow_layer"); } catch { snowBlock.setType("minecraft:snow_layer"); }
                                    }
                                } else if (snowBlock.isAir !== undefined && snowBlock.isAir) {
                                    // Place snow on air above solid block
                                    try {
                                        snowBlock.setType("mb:snow_layer");
                                    } catch {
                                        snowBlock.setType("minecraft:snow_layer");
                                    }
                                }
                            }
                        }
                    } catch {
                        // Skip errors
                    }
                } else {
                    // No solid block found - this might be where blocks were broken
                    // Try to find the ground below by searching further down
                    for (let dy = -6; dy >= -10; dy--) {
                        const checkY = centerY + dy;
                        if (checkY < MIN_STRUCTURE_Y) break;
                        
                        try {
                            const block = dimension.getBlock({ x: checkX, y: checkY, z: checkZ });
                            if (block) {
                                const blockType = block.typeId;
                                if (blockType === "mb:snow_layer" || blockType === "minecraft:snow_layer") {
                                    continue; // Keep searching
                                }
                                if (block.isAir !== undefined && !block.isAir && 
                                    block.isLiquid !== undefined && !block.isLiquid) {
                                    // Found ground - place snow on top
                                    const snowY = checkY + 1;
                                    const snowBlock = dimension.getBlock({ x: checkX, y: snowY, z: checkZ });
                                    if (snowBlock && (snowBlock.isAir !== undefined && snowBlock.isAir)) {
                                        try {
                                            snowBlock.setType("mb:snow_layer");
                                        } catch {
                                            snowBlock.setType("minecraft:snow_layer");
                                        }
                                    }
                                    break; // Found ground, placed snow
                                }
                            }
                        } catch {
                            continue;
                        }
                    }
                }
            }
        }
        
        if (getDebugBlockBreaking()) {
            console.warn(`[BUFF AI] Entity ${entity.id.substring(0, 8)} sprayed snow layers after explosion`);
        }
        
        // Reset stuck tracking after explosion
        BUFF_POSITION_HISTORY.delete(entity.id);
    } catch (error) {
        if (getDebugGeneral()) {
            console.warn(`[BUFF AI] Error creating explosion for entity ${entity.id.substring(0, 8)}:`, error);
        }
    }
}

/**
 * Checks if the buff bear is stuck (hasn't moved significantly for 15 seconds).
 * Returns true if stuck, false otherwise.
 */
function checkIfStuck(entity, currentTick) {
    if (!entity?.isValid) return false;
    
    const entityId = entity.id;
    const currentPos = entity.location;
    
    // Get or initialize position history
    let history = BUFF_POSITION_HISTORY.get(entityId);
    if (!history) {
        BUFF_POSITION_HISTORY.set(entityId, {
            lastPosition: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
            stuckStartTick: null
        });
        return false;
    }
    
    // Calculate distance moved
    const dx = currentPos.x - history.lastPosition.x;
    const dy = currentPos.y - history.lastPosition.y;
    const dz = currentPos.z - history.lastPosition.z;
    const distance = Math.hypot(dx, dy, dz);
    
    // If moved significantly, reset stuck tracking
    if (distance >= STUCK_MOVEMENT_THRESHOLD) {
        BUFF_POSITION_HISTORY.set(entityId, {
            lastPosition: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
            stuckStartTick: null
        });
        return false;
    }
    
    // Not moving - check if we've been stuck long enough
    if (history.stuckStartTick === null) {
        // Just started being stuck
        BUFF_POSITION_HISTORY.set(entityId, {
            lastPosition: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
            stuckStartTick: currentTick
        });
        return false;
    }
    
    // Check if stuck for long enough
    const ticksStuck = currentTick - history.stuckStartTick;
    if (ticksStuck >= STUCK_TIME_TICKS) {
        return true;
    }
    
    // Update position (even if not moving, to track time)
    BUFF_POSITION_HISTORY.set(entityId, {
        lastPosition: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
        stuckStartTick: history.stuckStartTick
    });
    
    return false;
}

/**
 * Checks if the buff bear is climbing.
 * A bear is considered climbing if:
 * - It's not on the ground AND
 * - It has upward velocity or is moving
 */
function isClimbing(entity) {
    if (!entity?.isValid) return false;
    
    try {
        // Check if on ground - if not on ground, likely climbing
        const onGround = entity.isOnGround;
        if (onGround) return false;
        
        // Check velocity - if moving upward, definitely climbing
        const velocity = entity.getVelocity();
        if (velocity && velocity.y > 0.01) {
            return true;
        }
        
        // Check if entity has movement component and is moving
        // If not on ground and has horizontal movement, likely climbing
        const movement = Math.hypot(velocity?.x || 0, velocity?.z || 0);
        if (movement > 0.01) {
            return true;
        }
        
        return false;
    } catch {
        return false;
    }
}

function initializeBuffAI() {
    // Always log initialization attempts (not just when debug is enabled)
    console.warn(`[BUFF AI] ====== INITIALIZATION ATTEMPT ${buffInitAttempts + 1}/${MAX_BUFF_INIT_ATTEMPTS} ======`);
    console.warn(`[BUFF AI] Current tick: ${system.currentTick}`);
    
    // Prevent multiple initializations
    if (buffAIIntervalId !== null) {
        console.warn("[BUFF AI] WARNING: AI loop already initialized, skipping duplicate initialization");
        return;
    }
    
    buffInitAttempts++;
    
    // Check if system and world are ready
    if (typeof system?.runInterval !== "function") {
        console.warn(`[BUFF AI] ERROR: System not ready (attempt ${buffInitAttempts}/${MAX_BUFF_INIT_ATTEMPTS})`);
        if (buffInitAttempts < MAX_BUFF_INIT_ATTEMPTS) {
            console.warn(`[BUFF AI] Retrying in ${BUFF_INIT_DELAY_TICKS} ticks...`);
            try {
                if (typeof system?.runTimeout === "function") {
                    system.runTimeout(() => initializeBuffAI(), BUFF_INIT_DELAY_TICKS);
                } else {
                    console.error("[BUFF AI] FATAL: Cannot schedule retry - system.runTimeout not available");
                }
            } catch (error) {
                console.error(`[BUFF AI] FATAL: Failed to schedule retry:`, error);
            }
        } else {
            console.error("[BUFF AI] FATAL ERROR: Failed to initialize after max attempts. System not available.");
        }
        return;
    }
    
    // Check if world is ready
    try {
        if (typeof world === "undefined" || !world?.getDimension) {
            console.warn(`[BUFF AI] World API not available (attempt ${buffInitAttempts}/${MAX_BUFF_INIT_ATTEMPTS}), retrying...`);
            if (buffInitAttempts < MAX_BUFF_INIT_ATTEMPTS) {
                try {
                    system.runTimeout(() => initializeBuffAI(), BUFF_INIT_DELAY_TICKS);
                } catch (error) {
                    console.error(`[BUFF AI] Failed to schedule retry:`, error);
                }
            } else {
                console.error("[BUFF AI] ERROR: Failed to initialize after max attempts. World API not available.");
            }
            return;
        }
        
        const overworld = world.getDimension("minecraft:overworld");
        if (!overworld) {
            console.warn(`[BUFF AI] World not ready (attempt ${buffInitAttempts}/${MAX_BUFF_INIT_ATTEMPTS}), retrying...`);
            if (buffInitAttempts < MAX_BUFF_INIT_ATTEMPTS) {
                try {
                    system.runTimeout(() => initializeBuffAI(), BUFF_INIT_DELAY_TICKS);
                } catch (error) {
                    console.error(`[BUFF AI] Failed to schedule retry:`, error);
                }
            } else {
                console.error("[BUFF AI] ERROR: Failed to initialize after max attempts. World dimensions not available.");
            }
            return;
        }
    } catch (error) {
        console.warn(`[BUFF AI] World check failed (attempt ${buffInitAttempts}/${MAX_BUFF_INIT_ATTEMPTS}):`, error);
        if (buffInitAttempts < MAX_BUFF_INIT_ATTEMPTS) {
            try {
                system.runTimeout(() => initializeBuffAI(), BUFF_INIT_DELAY_TICKS);
            } catch (error2) {
                console.error(`[BUFF AI] Failed to schedule retry:`, error2);
            }
        } else {
            console.error("[BUFF AI] ERROR: Failed to initialize after max attempts.");
        }
        return;
    }
    
    // Everything is ready - start the AI loop
    const aiLoopStartTick = system.currentTick;
    // Always log successful initialization
    console.warn(`[BUFF AI] ====== INITIALIZATION SUCCESSFUL ======`);
    console.warn(`[BUFF AI] Attempt: ${buffInitAttempts}/${MAX_BUFF_INIT_ATTEMPTS}`);
    console.warn(`[BUFF AI] AI loop starting at tick ${aiLoopStartTick}`);
    console.warn(`[BUFF AI] Processing ${BUFF_BEAR_TYPES.length} buff bear types: ${BUFF_BEAR_TYPES.map(t => t.id).join(", ")}`);
    console.warn(`[BUFF AI] Dimensions to check: ${DIMENSION_IDS.join(", ")}`);
    console.warn(`[BUFF AI] Max processing distance: ${MAX_PROCESSING_DISTANCE} blocks`);
    
    if (getDebugGeneral()) {
        const allPlayers = world.getAllPlayers();
        console.warn(`[BUFF AI] Players online: ${allPlayers.length}`);
        if (allPlayers.length > 0) {
            console.warn(`[BUFF AI] Checking debug flags from ${allPlayers.length} player(s)...`);
            const generalDebug = getDebugGeneral();
            const blockBreakingDebug = getDebugBlockBreaking();
            console.warn(`[BUFF AI] Debug flags - General: ${generalDebug}, BlockBreaking: ${blockBreakingDebug}`);
            if (generalDebug) {
                console.warn(`[BUFF AI] ✓ General logging is ON`);
            }
            if (blockBreakingDebug) {
                console.warn(`[BUFF AI] ✓ Block breaking logging is ON`);
            }
        } else {
            console.warn(`[BUFF AI] No players online yet - debug flags will be checked when players join`);
        }
    }
    
    // Mark as initialized BEFORE creating interval (so fallback knows not to retry)
    buffAIInitialized = true;
    
    buffAIIntervalId = system.runInterval(() => {
        if (!isScriptEnabled(SCRIPT_IDS.buff)) return;
        const currentTick = system.currentTick;
        
        // Cleanup tracking maps for entities that no longer exist
        const seen = new Set();
        const loggedThisTick = new Set(); // Track which entities we've logged countdown for this tick
        
        // Only process every AI_TICK_INTERVAL ticks
        if (currentTick % AI_TICK_INTERVAL !== 0) return;
        
        try {
            // Performance: Use shared player cache
            const allPlayers = getCachedPlayers();
            if (allPlayers.length === 0) return;
            
            // Process each dimension
            for (const dimId of DIMENSION_IDS) {
                try {
                    const dimension = world.getDimension(dimId);
                    if (!dimension) continue;
                    
                    // Get players in this dimension
                    const playersInDim = allPlayers.filter(p => {
                        try {
                            if (!p?.isValid) return false;
                            const playerDimId = p.dimension?.id;
                            const normalizedDimId = playerDimId?.startsWith("minecraft:") ? playerDimId.substring(10) : playerDimId;
                            return normalizedDimId === dimId || normalizedDimId === `minecraft:${dimId}`;
                        } catch {
                            return false;
                        }
                    });
                    
                    if (playersInDim.length === 0) continue;
                    
                    // Process each buff bear type
                    for (const bearType of BUFF_BEAR_TYPES) {
                        try {
                            // Query entities near each player
                            const seenEntities = new Set();
                            for (const player of playersInDim) {
                                try {
                                    if (!player?.isValid) continue;
                                    
                                    const entities = dimension.getEntities({
                                        type: bearType.id,
                                        maxDistance: MAX_PROCESSING_DISTANCE,
                                        location: player.location
                                    });
                                    
                                    for (const entity of entities) {
                                        if (!entity?.isValid) continue;
                                        const entityId = entity.id;
                                        if (seenEntities.has(entityId)) continue; // Avoid processing same entity twice
                                        seenEntities.add(entityId);
                                        seen.add(entityId); // Track for cleanup
                                        
                                        // Track spawn time (if not already tracked)
                                        // For existing bears (spawned before script initialized), initialize spawn time
                                        // to MIN_ALIVE_TIME_TICKS ago so they're immediately eligible for explosion checks
                                        if (!BUFF_SPAWN_TIME.has(entityId)) {
                                            // Assume existing bears have been alive at least MIN_ALIVE_TIME_TICKS
                                            // This allows them to immediately be checked for stuck explosions
                                            BUFF_SPAWN_TIME.set(entityId, currentTick - MIN_ALIVE_TIME_TICKS);
                                        }
                                        
                                        const spawnTick = BUFF_SPAWN_TIME.get(entityId);
                                        const aliveTime = currentTick - spawnTick;
                                        const loc = entity.location;
                                        
                                        // Check if buff bear is climbing
                                        if (isClimbing(entity)) {
                                            // Break blocks above when climbing
                                            const broken = breakBlocksAboveEntity(entity, bearType.maxHeight, bearType);
                                            if (getDebugBlockBreaking() && broken > 0) {
                                                console.warn(`[BUFF AI] Entity ${entity.id.substring(0, 8)} broke ${broken} blocks above while climbing`);
                                            }
                                        }
                                        
                                        // Check for stuck explosion (only if alive for 30+ seconds)
                                        if (aliveTime >= MIN_ALIVE_TIME_TICKS && currentTick % STUCK_CHECK_INTERVAL === 0) {
                                            const history = BUFF_POSITION_HISTORY.get(entityId);
                                            if (history && history.stuckStartTick !== null && !loggedThisTick.has(entityId)) {
                                                // Bear is stuck - show countdown
                                                const ticksStuck = currentTick - history.stuckStartTick;
                                                const secondsStuck = Math.floor(ticksStuck / 20);
                                                const ticksUntilExplosion = STUCK_TIME_TICKS - ticksStuck;
                                                const secondsUntilExplosion = Math.ceil(ticksUntilExplosion / 20);
                                                
                                                if (getDebugGeneral()) {
                                                    console.warn(`[BUFF AI] Entity ${entity.id.substring(0, 8)} STUCK COUNTDOWN: ${secondsStuck}s stuck, ${secondsUntilExplosion}s until explosion (at ${Math.floor(loc.x)}, ${Math.floor(loc.y)}, ${Math.floor(loc.z)})`);
                                                    loggedThisTick.add(entityId);
                                                }
                                            } else if (!loggedThisTick.has(entityId) && getDebugGeneral()) {
                                                // Bear is eligible but not stuck yet - show status
                                                console.warn(`[BUFF AI] Entity ${entity.id.substring(0, 8)} COUNTDOWN: Can explode if stuck for 15s (alive ${Math.floor(aliveTime / 20)}s, at ${Math.floor(loc.x)}, ${Math.floor(loc.y)}, ${Math.floor(loc.z)})`);
                                                loggedThisTick.add(entityId);
                                            }
                                            
                                            if (checkIfStuck(entity, currentTick)) {
                                                // Bear is stuck - create explosion
                                                createBuffExplosion(entity);
                                                if (getDebugGeneral()) {
                                                    console.warn(`[BUFF AI] Entity ${entity.id.substring(0, 8)} was stuck for 15 seconds, created explosion`);
                                                }
                                            }
                                        } else if (aliveTime < MIN_ALIVE_TIME_TICKS && currentTick % STUCK_CHECK_INTERVAL === 0) {
                                            // Log countdown until bear can explode (only once per tick)
                                            if (!loggedThisTick.has(entityId)) {
                                                const ticksUntilCanExplode = MIN_ALIVE_TIME_TICKS - aliveTime;
                                                const secondsUntilCanExplode = Math.ceil(ticksUntilCanExplode / 20);
                                                if (getDebugGeneral()) {
                                                    console.warn(`[BUFF AI] Entity ${entity.id.substring(0, 8)} COUNTDOWN: Can explode in ${secondsUntilCanExplode}s (then needs 15s stuck) (alive ${Math.floor(aliveTime / 20)}s, at ${Math.floor(loc.x)}, ${Math.floor(loc.y)}, ${Math.floor(loc.z)})`);
                                                    loggedThisTick.add(entityId);
                                                }
                                            }
                                        }
                                    }
                                } catch (error) {
                                    if (getDebugGeneral()) {
                                        console.warn(`[BUFF AI] Error querying entities near player:`, error);
                                    }
                                }
                            }
                        } catch (error) {
                            if (getDebugGeneral()) {
                                console.warn(`[BUFF AI] Error processing ${bearType.id}:`, error);
                            }
                        }
                    }
                } catch (error) {
                    if (getDebugGeneral()) {
                        console.warn(`[BUFF AI] Error processing dimension ${dimId}:`, error);
                    }
                }
            }
            
            // Cleanup tracking maps for entities that no longer exist
            for (const [entityId] of BUFF_SPAWN_TIME) {
                if (!seen.has(entityId)) {
                    BUFF_SPAWN_TIME.delete(entityId);
                    BUFF_POSITION_HISTORY.delete(entityId);
                }
            }
        } catch (error) {
            console.error("[BUFF AI] Error in AI loop:", error);
        }
    }, AI_TICK_INTERVAL);
}

/**
 * Gets countdown info for buff bears near a player (for debug menu).
 * Returns array of objects with entity info and countdown details.
 */
export function getBuffBearCountdowns(player) {
    if (!player?.isValid) return [];
    
    const results = [];
    const currentTick = system.currentTick;
    
    try {
        const dimension = player.dimension;
        if (!dimension) return results;
        
        // Get all buff bears within 64 blocks
        // Query each type separately since getEntities doesn't accept array for type
        const allEntities = [];
        for (const bearType of BUFF_BEAR_TYPES) {
            try {
                const entities = dimension.getEntities({
                    type: bearType.id,
                    maxDistance: 64,
                    location: player.location
                });
                for (const entity of entities) {
                    allEntities.push(entity);
                }
            } catch {
                // Skip if query fails
            }
        }
        
        for (const entity of allEntities) {
            if (!entity?.isValid) continue;
            
            const entityId = entity.id;
            const spawnTick = BUFF_SPAWN_TIME.get(entityId);
            const history = BUFF_POSITION_HISTORY.get(entityId);
            
            if (!spawnTick) continue;
            
            const aliveTime = currentTick - spawnTick;
            const aliveSeconds = Math.floor(aliveTime / 20);
            const canExplode = aliveTime >= MIN_ALIVE_TIME_TICKS;
            
            let stuckInfo = null;
            if (history && history.stuckStartTick !== null) {
                const ticksStuck = currentTick - history.stuckStartTick;
                const secondsStuck = Math.floor(ticksStuck / 20);
                const ticksUntilExplosion = STUCK_TIME_TICKS - ticksStuck;
                const secondsUntilExplosion = Math.ceil(ticksUntilExplosion / 20);
                
                stuckInfo = {
                    isStuck: true,
                    ticksStuck,
                    secondsStuck,
                    ticksUntilExplosion,
                    secondsUntilExplosion
                };
            } else {
                stuckInfo = {
                    isStuck: false,
                    ticksStuck: 0,
                    secondsStuck: 0,
                    ticksUntilExplosion: STUCK_TIME_TICKS,
                    secondsUntilExplosion: Math.ceil(STUCK_TIME_TICKS / 20)
                };
            }
            
            const ticksUntilCanExplode = Math.max(0, MIN_ALIVE_TIME_TICKS - aliveTime);
            const secondsUntilCanExplode = Math.ceil(ticksUntilCanExplode / 20);
            
            results.push({
                entityId: entityId.substring(0, 8),
                location: entity.location,
                aliveSeconds,
                canExplode,
                ticksUntilCanExplode,
                secondsUntilCanExplode,
                stuckInfo
            });
        }
    } catch (error) {
        if (getDebugGeneral()) {
            console.warn(`[BUFF AI] Error getting countdowns:`, error);
        }
    }
    
    return results;
}

// Handle buff bear being hit - reduce stuck timer if stuck
world.afterEvents.entityHurt.subscribe((event) => {
    const hurtEntity = event.hurtEntity;
    if (!hurtEntity?.isValid) return;
    
    const entityId = hurtEntity.id;
    const typeId = hurtEntity.typeId;
    
    // Check if it's a buff bear
    const isBuffBear = BUFF_BEAR_TYPES.some(t => t.id === typeId);
    if (!isBuffBear) return;
    
    // Check if bear is stuck
    const history = BUFF_POSITION_HISTORY.get(entityId);
    if (history && history.stuckStartTick !== null) {
        // Bear is stuck and being hit - reduce timer
        const currentTick = system.currentTick;
        const newStuckStartTick = history.stuckStartTick + HIT_REDUCTION_TICKS; // Move timer forward
        
        // Update history with reduced timer
        BUFF_POSITION_HISTORY.set(entityId, {
            lastPosition: history.lastPosition,
            stuckStartTick: newStuckStartTick
        });
        
        if (getDebugGeneral()) {
            const ticksStuck = currentTick - newStuckStartTick;
            const secondsStuck = Math.floor(ticksStuck / 20);
            const ticksUntilExplosion = STUCK_TIME_TICKS - ticksStuck;
            const secondsUntilExplosion = Math.ceil(ticksUntilExplosion / 20);
            console.warn(`[BUFF AI] Entity ${entityId.substring(0, 8)} HIT while stuck! Timer reduced by ${HIT_REDUCTION_TICKS} ticks. Now ${secondsStuck}s stuck, ${secondsUntilExplosion}s until explosion`);
        }
    }
});

// Auto-initialize on script load
// Don't call getDebugGeneral() at module load time - world might not be ready
// Just log basic info and initialize

// Try to initialize after delay (with error handling)
try {
    if (typeof system !== "undefined" && system?.currentTick !== undefined) {
        console.warn("[BUFF AI] ====== SCRIPT LOADED ======");
        console.warn(`[BUFF AI] Script file loaded at tick ${system.currentTick}`);
        console.warn(`[BUFF AI] Starting delayed initialization in ${BUFF_INIT_DELAY_TICKS} ticks...`);
        
        // Schedule initial initialization attempt
        try {
            system.runTimeout(() => {
                initializeBuffAI();
            }, BUFF_INIT_DELAY_TICKS);
        } catch (error) {
            console.warn(`[BUFF AI] Failed to schedule initial initialization:`, error);
        }
    } else {
        console.warn("[BUFF AI] ====== SCRIPT LOADED (system not ready yet) ======");
    }
} catch (error) {
    console.warn(`[BUFF AI] Error during script load:`, error);
}

// Fallback: Also try to initialize when first player joins (in case world wasn't ready)
try {
    if (typeof world !== "undefined" && world?.afterEvents) {
        world.afterEvents.playerJoin.subscribe(() => {
            if (!buffAIInitialized && buffAIIntervalId === null) {
                console.warn("[BUFF AI] Player joined, attempting initialization as fallback...");
                buffInitAttempts = 0; // Reset attempts for fallback initialization
                try {
                    if (typeof system !== "undefined" && system?.runTimeout) {
                        system.runTimeout(() => {
                            initializeBuffAI();
                        }, 10); // Short delay
                    } else {
                        console.warn("[BUFF AI] System not ready for fallback initialization");
                    }
                } catch (error) {
                    console.warn(`[BUFF AI] Failed to schedule fallback initialization:`, error);
                }
            }
        });
    } else {
        console.warn("[BUFF AI] World API not ready for fallback subscription");
    }
} catch (error) {
    console.warn(`[BUFF AI] Failed to set up fallback initialization:`, error);
}
