import { system, world, ItemStack } from "@minecraft/server";
import { UNBREAKABLE_BLOCKS } from "./mb_miningBlockList.js";
import { getCurrentDay } from "./mb_dayTracker.js";
import { isDebugEnabled } from "./mb_codex.js";

// Basic debug to verify script is loaded
// console.warn("[MINING AI] Script loaded successfully");

const DIMENSION_IDS = ["overworld", "nether", "the_end"];
const MINING_BEAR_TYPES = [
    { id: "mb:mining_mb", tunnelHeight: 2 }, // Standard 1x2 tunnel (1 wide, 2 tall)
    { id: "mb:mining_mb_day20", tunnelHeight: 2 } // Standard 1x2 tunnel (1 wide, 2 tall)
];

const AIR_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air"
]);

// All blocks are breakable by default except unbreakable ones
// Mining speed: starts at wooden pickaxe speed (12 ticks) at day 15 (when mining bears first spawn), scales to netherite pickaxe speed (1 tick) by day 24
// Capped at netherite speed (1 tick) for all days after day 24+
function getMiningInterval() {
    const currentDay = getCurrentDay();
    if (currentDay < 15) return 12; // Wooden pickaxe speed (slowest) - before mining bears spawn
    if (currentDay >= 24) return 1; // Netherite pickaxe speed (fastest) - capped and stays the same for all days after day 24+
    // Linear progression: 12 ticks at day 15, 1 tick at day 24
    // Formula: 12 - (11/9) * (day - 15) = 12 - 1.222 * (day - 15)
    const interval = Math.max(1, Math.floor(12 - (11 / 9) * (currentDay - 15)));
    return interval;
}
const MAX_BLOCKS_PER_ENTITY = 1; // Mine one block at a time to create stairs/tunnels gradually
const FOLLOWER_BLOCK_BUDGET = 0; // Followers don't mine
const FOLLOWER_ASSIST_BLOCK_BUDGET = 0; // Followers don't mine
const WALL_SCAN_DEPTH = 1;
const RAISE_THRESHOLD = 0.55;
const LIFT_ITERATIONS = 2;
const TARGET_SCAN_RADIUS = 32;
const FOLLOWER_ASSIGN_RADIUS = 8;
const FOLLOWER_ASSIGN_RADIUS_SQ = FOLLOWER_ASSIGN_RADIUS * FOLLOWER_ASSIGN_RADIUS;
const FOLLOWER_IMPULSE = 0.035;
const BRANCH_INTERVAL_TICKS = 24;
const SIDE_CHANNEL_INTERVAL_TICKS = 24;
const SIDE_CHANNEL_DEPTH = 1;
const IDLE_DRIFT_INTERVAL = 80;
const FOLLOWER_ASSIST_DISTANCE_SQ = 16;
const TRAIL_MAX_POINTS = 24;
const TRAIL_SAMPLE_STEP = 2;
const ELEVATION_TOLERANCE = 0.75;
const BUILD_FORWARD_DEPTH = 2;
const LEADER_FORWARD_DEPTH = 1;
const ACCESS_CHECK_STEPS = 4;
const BUILD_PRIORITY_BLOCK_BUDGET = 4;
const TARGET_MEMORY_TICKS = 6000; // Match entity JSON must_see_forget_duration (5 minutes)
const MAX_PLAN_STEPS = 64;
const PASSIVE_WANDER_TICKS = 2400; // 2 minutes without seeing target = passive wandering

// Intelligence system constants
const OPTIMAL_ATTACK_DISTANCE = 6; // Best horizontal distance to attack from (for pitfall creation)
const MOVE_CLOSER_THRESHOLD = 12; // Move closer first if farther than this (blocks)
const IDLE_EXPLORATION_DELAY = 100; // Ticks before idle exploration starts (5 seconds)
const EXPLORATION_TUNNEL_LENGTH = 8; // How long to dig exploration tunnels (blocks)
const STRATEGY_RECALCULATE_INTERVAL = 20; // Recalculate strategy every second
const EXPLORATION_CHECK_TARGET_INTERVAL = 40; // Check for targets while exploring every 2 seconds

// Path creation for smaller bears (maple thralls and tiny MBs can use tunnels, but not huge buff ones)
const PATH_HEIGHT_FOR_SMALL_BEARS = 2; // Ensure 2 blocks of headroom for smaller bears (tunnels are 1 block wide, 2 blocks tall)

// Cave mining constants
const CAVE_DETECTION_RADIUS = 5; // Check 5 blocks around to detect if in cave
const CAVE_BLOCK_THRESHOLD = 8; // Need at least 8 solid blocks around to be considered "in cave"
const CAVE_Y_THRESHOLD = 50; // Below Y=50 is considered underground/cave area

// Performance optimization constants
const AI_TICK_INTERVAL = 2; // Run AI every 2 ticks instead of every tick (50% reduction)
const TARGET_CACHE_TICKS = 5; // Cache target lookups for 5 ticks
const MAX_PROCESSING_DISTANCE = 64; // Only process entities within 64 blocks of any player
const MAX_PROCESSING_DISTANCE_SQ = MAX_PROCESSING_DISTANCE * MAX_PROCESSING_DISTANCE;

// Debug flags - now controlled via Debug Menu in Journal
// (isDebugEnabled is imported at the top of the file)

// Helper functions to check debug flags dynamically
function getDebugPitfall() {
    return isDebugEnabled("mining", "pitfall") || isDebugEnabled("mining", "all");
}

function getDebugGeneral() {
    return isDebugEnabled("mining", "general") || isDebugEnabled("mining", "all");
}

function getDebugTarget() {
    return isDebugEnabled("mining", "target") || isDebugEnabled("mining", "all");
}

function getDebugPathfinding() {
    return isDebugEnabled("mining", "pathfinding") || isDebugEnabled("mining", "all");
}

function getDebugMining() {
    return isDebugEnabled("mining", "mining") || isDebugEnabled("mining", "all");
}

function getDebugMovement() {
    return isDebugEnabled("mining", "movement") || isDebugEnabled("mining", "all");
}

function getDebugStairCreation() {
    return isDebugEnabled("mining", "stairCreation") || isDebugEnabled("mining", "all");
}

// Legacy constants for backwards compatibility (now use functions above)
const DEBUG_PITFALL = false; // Use getDebugPitfall() instead
const DEBUG_LOGS = false; // Use getDebugGeneral() instead

// ALWAYS log basic script execution (even if DEBUG_PITFALL is false)
// console.warn("[MINING AI] DEBUG_PITFALL is", DEBUG_PITFALL);

const BREAK_SOUND_DEFAULT = "dig.stone";
const BREAK_SOUND_RULES = [
    { sound: "dig.grass", keywords: ["grass", "dirt", "mud", "podzol", "mycelium", "farmland", "sand", "gravel", "soul", "clay", "rooted"] },
    { sound: "dig.wood", keywords: ["wood", "log", "stem", "hyphae", "planks", "board", "bamboo"] },
    { sound: "dig.glass", keywords: ["glass", "ice", "packed_ice", "ice", "frosted_ice", "shard"] },
    { sound: "dig.metal", keywords: ["iron", "gold", "copper", "metal", "anvil", "bell"] },
    { sound: "dig.wool", keywords: ["wool", "carpet"] },
    { sound: "dig.gravel", keywords: ["concrete_powder", "powder", "dust"] }
];
const SOUND_RADIUS = 16;

const lastKnownTargets = new Map();
const lastSeenTargetTick = new Map(); // Track when target was last seen (for passive wandering)
const lastMiningTick = new Map(); // Track last mining action per entity (for dynamic speed)
const buildQueues = new Map();
const reservedNodes = new Map();
const buildModeState = new Map();

// Performance: Cache target lookups to avoid querying all players/mobs every tick
const targetCache = new Map(); // Map<entityId, {target: targetInfo, tick: number}>

const leaderTrails = new Map();

// Track collected blocks per mining bear entity
export const collectedBlocks = new Map(); // Map<entityId, Map<itemTypeId, count>>

// Intelligence system state tracking
const entityStrategies = new Map(); // Map<entityId, {strategy: string, lastCalculated: tick, optimalPosition: {x,y,z}}>
const idleExplorationState = new Map(); // Map<entityId, {startTick: number, direction: {x,z}, tunnelLength: number}>
const lastTargetSeenTick = new Map(); // Map<entityId, tick> - when target was last seen (for idle detection)

// Track recently created stairs/ramps to prevent breaking them (counter-productive)
const recentStairBlocks = new Map(); // Map<"x,y,z", tick> - blocks that are part of stairs/ramps
// Track target position when stairs were created to allow breaking if target moves significantly
const stairCreationTargetPos = new Map(); // Map<entityId, {x, y, z, tick}> - target position when stairs were created

// Track active stair work to coordinate multiple bears working on stairs simultaneously
// Map: "x,y,z" -> { entityId, tick } - tracks which bear is working on which stair block
const activeStairWork = new Map();
const STAIR_WORK_LOCK_TICKS = 40; // Lock stair blocks for 2 seconds (40 ticks) to prevent conflicts between multiple bears

// Convert block type ID to item type ID (most are the same, but some differ)
function blockToItemType(blockTypeId) {
    if (!blockTypeId) return null;
    // Most blocks have the same ID as items
    // Special cases where block ID differs from item ID
    const conversions = {
        "minecraft:grass": "minecraft:grass",
        "minecraft:grass_block": "minecraft:dirt", // Grass block drops dirt
        "minecraft:mycelium": "minecraft:dirt",
        "minecraft:podzol": "minecraft:dirt",
        "minecraft:farmland": "minecraft:dirt",
        "minecraft:grass_path": "minecraft:dirt",
        "minecraft:ice": "minecraft:ice", // Ice drops itself
        "minecraft:packed_ice": "minecraft:packed_ice",
        "minecraft:blue_ice": "minecraft:blue_ice",
        "minecraft:frosted_ice": null, // Doesn't drop
        "minecraft:fire": null, // Doesn't drop
        "minecraft:soul_fire": null, // Doesn't drop
        "minecraft:water": null, // Doesn't drop
        "minecraft:lava": null, // Doesn't drop
        "minecraft:air": null, // Doesn't drop
        "minecraft:cave_air": null,
        "minecraft:void_air": null,
        // Ores drop their respective items, not the ore blocks
        // Iron and gold ores drop raw materials, not ingots
        "minecraft:iron_ore": "minecraft:raw_iron",
        "minecraft:deepslate_iron_ore": "minecraft:raw_iron",
        "minecraft:gold_ore": "minecraft:raw_gold",
        "minecraft:deepslate_gold_ore": "minecraft:raw_gold",
        "minecraft:copper_ore": "minecraft:raw_copper",
        "minecraft:deepslate_copper_ore": "minecraft:raw_copper",
        "minecraft:coal_ore": "minecraft:coal",
        "minecraft:deepslate_coal_ore": "minecraft:coal",
        "minecraft:lapis_ore": "minecraft:lapis_lazuli",
        "minecraft:deepslate_lapis_ore": "minecraft:lapis_lazuli",
        "minecraft:diamond_ore": "minecraft:diamond",
        "minecraft:deepslate_diamond_ore": "minecraft:diamond",
        "minecraft:emerald_ore": "minecraft:emerald",
        "minecraft:deepslate_emerald_ore": "minecraft:emerald",
        "minecraft:redstone_ore": "minecraft:redstone",
        "minecraft:deepslate_redstone_ore": "minecraft:redstone",
        "minecraft:nether_gold_ore": "minecraft:gold_nugget",
        "minecraft:nether_quartz_ore": "minecraft:quartz",
        "minecraft:gilded_blackstone": "minecraft:gold_nugget"
    };
    
    if (conversions.hasOwnProperty(blockTypeId)) {
        return conversions[blockTypeId];
    }
    
    // Default: block ID is the same as item ID
    return blockTypeId;
}

// Try to add item to entity inventory, or drop it if inventory is full
function collectOrDropBlock(entity, blockTypeId, location) {
    if (!entity || !blockTypeId || !location) return;
    
    const itemTypeId = blockToItemType(blockTypeId);
    if (!itemTypeId) return; // Block doesn't drop an item
    
    try {
        // Try to add to entity inventory
        const inventory = entity.getComponent("inventory")?.container;
        if (inventory) {
            try {
                const itemStack = new ItemStack(itemTypeId, 1);
                const remaining = inventory.addItem(itemStack);
                // addItem returns undefined when all items are successfully added
                // Returns an ItemStack when there are remaining items (inventory full)
                if (!remaining) {
                    // Successfully added to inventory - track it
                    if (!collectedBlocks.has(entity.id)) {
                        collectedBlocks.set(entity.id, new Map());
                    }
                    const entityBlocks = collectedBlocks.get(entity.id);
                    entityBlocks.set(itemTypeId, (entityBlocks.get(itemTypeId) || 0) + 1);
                    return;
                }
                // If remaining is truthy, inventory is full - fall through to drop
            } catch {
                // Inventory add failed, fall through to drop
            }
        }
        
        // Inventory is full or entity doesn't have inventory - drop the item
        const itemStack = new ItemStack(itemTypeId, 1);
        const dropLocation = {
            x: location.x + (Math.random() - 0.5) * 0.5,
            y: location.y + 0.5,
            z: location.z + (Math.random() - 0.5) * 0.5
        };
        entity.dimension.spawnItem(itemStack, dropLocation);
    } catch (error) {
        // Silently fail - don't spam console
    }
}

function getBlock(dimension, x, y, z) {
    try {
        return dimension.getBlock({ x, y, z });
    } catch {
        return null;
    }
}

function isBreakableBlock(block) {
    if (!block) return false;
    const id = block.typeId;
    if (!id) return false;
    // Air blocks are not breakable
    if (AIR_BLOCKS.has(id)) return false;
    // Liquid blocks are not breakable (they're passable)
    if (block.isLiquid !== undefined && block.isLiquid) return false;
    // Unbreakable blocks cannot be broken
    if (UNBREAKABLE_BLOCKS.has(id)) return false;
    // All other blocks are breakable
    return true;
}

// Mining bear reach distance (5-6 blocks)
const PLAYER_REACH_DISTANCE = 6;

// Check if a block is within player reach distance from entity
function isBlockWithinReach(entity, blockX, blockY, blockZ) {
    if (!entity || !entity.location) return false;
    
    const loc = entity.location;
    const dx = (blockX + 0.5) - loc.x;
    const dy = (blockY + 0.5) - loc.y;
    const dz = (blockZ + 0.5) - loc.z;
    const distance = Math.hypot(dx, dy, dz);
    
    return distance <= PLAYER_REACH_DISTANCE;
}

// Check if entity has line of sight to a block (can see it)
// Similar to player reach - allows breaking blocks that are visible
// More permissive: allows seeing through multiple blocks (heat-seeking vision)
// Performance: Optimized raycast with adaptive step size
function canSeeBlock(entity, blockX, blockY, blockZ, targetInfo = null) {
    if (!entity || !entity.location) return false;
    const dimension = entity.dimension;
    if (!dimension) return false;
    
    const origin = entity.location;
    // Use eye position (typically ~1.5 blocks above feet for entities)
    const eyeY = origin.y + 1.5;
    
    // Target is the center of the block
    const targetX = blockX + 0.5;
    const targetY = blockY + 0.5;
    const targetZ = blockZ + 0.5;
    
    const dx = targetX - origin.x;
    const dy = targetY - eyeY;
    const dz = targetZ - origin.z;
    const dist = Math.hypot(dx, dy, dz);
    
    if (dist < 0.5) return true; // Very close, assume visible
    
    // Special case: If this block is underneath a target (pitfall creation), be more permissive
    let isUnderTarget = false;
    if (targetInfo && targetInfo.entity?.location) {
        const targetLoc = targetInfo.entity.location;
        const blockUnderTarget = Math.floor(targetLoc.x) === blockX && 
                                Math.floor(targetLoc.y) > blockY && 
                                Math.floor(targetLoc.z) === blockZ;
        // Also check if block is within 2 blocks horizontally of target and below them
        const horizDist = Math.hypot(targetLoc.x - targetX, targetLoc.z - targetZ);
        const vertDist = targetLoc.y - blockY;
        if (horizDist <= 2 && vertDist > 0 && vertDist <= 5) {
            isUnderTarget = true;
        }
    }
    
    // Raycast from entity eye position to block center
    // Performance: Use adaptive step size - fewer steps for longer distances
    // Sample at ~0.5 block intervals (reduced from 0.33 for better performance)
    const steps = Math.max(2, Math.ceil(dist * 2)); // Reduced from dist * 3
    const stepX = dx / steps;
    const stepY = dy / steps;
    const stepZ = dz / steps;
    
    let solidBlockCount = 0;
    // More permissive: allow seeing through up to 5 breakable blocks (heat-seeking vision)
    // If block is under target (pitfall), be even more permissive
    const maxSolidBlocks = isUnderTarget ? 8 : 5;
    
    // Check line of sight - raycast from eye to block
    for (let i = 1; i < steps; i++) {
        const checkX = origin.x + stepX * i;
        const checkY = eyeY + stepY * i;
        const checkZ = origin.z + stepZ * i;
        
        const blockCheckX = Math.floor(checkX);
        const blockCheckY = Math.floor(checkY);
        const blockCheckZ = Math.floor(checkZ);
        
        // Skip if we're checking the target block itself (we want to break it)
        if (blockCheckX === blockX && blockCheckY === blockY && blockCheckZ === blockZ) {
            continue;
        }
        
        try {
            const block = dimension.getBlock({ x: blockCheckX, y: blockCheckY, z: blockCheckZ });
            if (block && !AIR_BLOCKS.has(block.typeId)) {
                // Check if this is a solid block that would block vision
                if (block.isLiquid === undefined || !block.isLiquid) {
                    // Unbreakable blocks always block line of sight
                    if (UNBREAKABLE_BLOCKS.has(block.typeId)) {
                        return false; // Completely blocked by unbreakable block
                    }
                    // Count solid breakable blocks
                    if (isBreakableBlock(block)) {
                        solidBlockCount++;
                        // If too many solid blocks in the way, line of sight is blocked
                        if (solidBlockCount > maxSolidBlocks) {
                            return false; // Too many blocks in the way
                        }
                    }
                }
            }
        } catch {
            // Error checking block - for safety, if we can't check, allow it (better than blocking)
            continue;
        }
    }
    
    return true; // Clear line of sight (or only minor occlusion)
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
    if (!soundId) return;
    const location = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
    const volume = 0.4 + Math.random() * 0.2;
    const pitch = 0.9 + Math.random() * 0.2;
    
    // Try dimension.playSound first (most reliable)
    try {
        if (dimension.playSound) {
            dimension.playSound(soundId, location, { volume, pitch });
            return;
        }
    } catch {
        // fall through to other methods
    }
    
    // Fallback to command-based sound (most compatible)
    try {
        const px = location.x.toFixed(1);
        const py = location.y.toFixed(1);
        const pz = location.z.toFixed(1);
        dimension.runCommandAsync(
            `playsound ${soundId} @a[x=${px},y=${py},z=${pz},r=${SOUND_RADIUS}] ${px} ${py} ${pz} ${volume.toFixed(2)} ${pitch.toFixed(2)}`
        );
    } catch {
        // ignore errors
    }
}

function clearBlock(dimension, x, y, z, digContext, entity = null, targetInfo = null) {
    if (digContext && digContext.cleared >= digContext.max) {
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Budget exhausted ${digContext.cleared}/${digContext.max} at (${x}, ${y}, ${z})`);
        return false;
    }
    const block = getBlock(dimension, x, y, z);
    if (!isBreakableBlock(block)) {
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block not breakable at (${x}, ${y}, ${z}): ${block?.typeId || 'null'}, isAir=${block?.isAir}, isLiquid=${block?.isLiquid}`);
        return false;
    }
    
    // Don't break blocks that are part of recently created stairs/ramps (counter-productive)
    // UNLESS the target has moved significantly (e.g., target moved below, making stairs unnecessary)
    const blockKey = `${x},${y},${z}`;
    const currentTick = system.currentTick;
    const stairTick = recentStairBlocks.get(blockKey);
    if (stairTick !== undefined && (currentTick - stairTick) < 200) { // Protect for 10 seconds (200 ticks)
        // Check if target position has changed significantly (allow breaking if target moved below)
        if (entity && targetInfo) {
            const entityId = entity.id;
            const storedTargetPos = stairCreationTargetPos.get(entityId);
            if (storedTargetPos) {
                const targetLoc = targetInfo.entity?.location;
                if (targetLoc) {
                    const storedY = storedTargetPos.y;
                    const currentY = targetLoc.y;
                    const dy = currentY - storedY;
                    
                    // If target moved significantly below (more than 2 blocks), allow breaking stairs
                    if (dy < -2) {
                        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - target moved below (dy=${dy.toFixed(1)})`);
                        // Remove protection for this block since target changed position
                        recentStairBlocks.delete(blockKey);
                        // Continue to break the block
                    } else {
                        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp at (${x}, ${y}, ${z})`);
                        return false; // This is a stair/ramp block, don't break it
                    }
                } else {
                    // No current target, but stairs were created - still protect
                    if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp at (${x}, ${y}, ${z})`);
                    return false;
                }
            } else {
                // No stored target position, protect normally
                if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp at (${x}, ${y}, ${z})`);
                return false;
            }
        } else {
            // No entity or target info, protect normally
            if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp at (${x}, ${y}, ${z})`);
            return false;
        }
    }
    
    // Only break blocks that are within reach distance (like player reach)
    if (entity) {
        const withinReach = isBlockWithinReach(entity, x, y, z);
        if (!withinReach) {
            if (getDebugPitfall()) {
                const loc = entity.location;
                const dist = Math.hypot((x + 0.5) - loc.x, (y + 0.5) - loc.y, (z + 0.5) - loc.z);
                console.warn(`[PITFALL DEBUG] clearBlock: Block too far at (${x}, ${y}, ${z}), distance: ${dist.toFixed(1)}, reach: ${PLAYER_REACH_DISTANCE}`);
            }
            return false; // Block is too far away
        }
        
        // Only break blocks that the entity can see (line of sight check)
        // Pass targetInfo to allow more permissive vision for blocks under targets (pitfall creation)
        const canSee = canSeeBlock(entity, x, y, z, targetInfo);
        if (!canSee) {
            if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Cannot see block at (${x}, ${y}, ${z}) - line of sight blocked`);
            return false; // Block is not visible (line of sight blocked)
        }
    }
    
    const originalType = block.typeId;
    try {
        // console.warn(`[MINING AI] clearBlock: ATTEMPTING to break ${originalType} at (${x}, ${y}, ${z}), entity=${entity?.id?.substring(0, 8) || 'null'}`);
        block.setType("minecraft:air");
        playBreakSound(dimension, x, y, z, originalType);
        
        // Collect or drop the broken block
        if (entity) {
            collectOrDropBlock(entity, originalType, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
        }
        
        if (digContext) {
            digContext.lastBroken = { x, y, z };
            digContext.cleared++;
        }
        // console.warn(`[MINING AI] clearBlock: SUCCESS - Broke ${originalType} at (${x}, ${y}, ${z}), cleared: ${digContext?.cleared || 0}/${digContext?.max || 0}`);
        return true;
    } catch (error) {
        // console.error(`[MINING AI] clearBlock: ERROR - Failed to break ${block?.typeId} at ${x},${y},${z}:`, error);
        // console.error(`[MINING AI] clearBlock: Error stack:`, error.stack);
        return false;
    }
}

function clearVerticalColumn(entity, tunnelHeight, extraHeight, digContext, shouldTunnelDown = false, targetInfo = null) {
    const dimension = entity?.dimension;
    if (!dimension) return;
    const loc = entity.location;
    const x = Math.floor(loc.x);
    const z = Math.floor(loc.z);
    const startY = Math.floor(loc.y);
    
    // Only break block directly below if actively tunneling down (target is below)
    // DO NOT break blocks below just because there's budget - only when target is actually below
    if (shouldTunnelDown) {
        const feetBlock = getBlock(dimension, x, startY - 1, z);
        // Only break if it's a solid block that would block movement
        if (feetBlock && isBreakableBlock(feetBlock) && !AIR_BLOCKS.has(feetBlock.typeId)) {
            if (digContext.cleared >= digContext.max) return;
            clearBlock(dimension, x, startY - 1, z, digContext, entity, targetInfo);
        }
    }
    // Removed automatic headroom breaking - only break above when actually needed (in clearForwardTunnel, carveStair, etc.)
}

function getForwardOffset(entity) {
    let dir;
    try {
        dir = entity.getViewDirection();
    } catch {
        dir = null;
    }
    if (!dir) return { x: 0, z: 1 };

    const absX = Math.abs(dir.x);
    const absZ = Math.abs(dir.z);
    if (absX > absZ) {
        const xDir = Math.sign(dir.x) || 1;
        return { x: xDir, z: 0 };
    } else if (absZ > 0) {
        const zDir = Math.sign(dir.z) || 1;
        return { x: 0, z: zDir };
    }
    return { x: 0, z: 1 };
}

function resolveDirection(entity, override) {
    if (override && (override.x !== 0 || override.z !== 0)) {
        return override;
    }
    return getForwardOffset(entity);
}

function updateLastKnownTarget(entity, targetInfo) {
    if (!targetInfo?.entity?.location) return;
    const currentTick = system.currentTick;
    lastKnownTargets.set(entity.id, {
        position: {
            x: targetInfo.entity.location.x,
            y: targetInfo.entity.location.y,
            z: targetInfo.entity.location.z
        },
        targetId: targetInfo.entity?.id ?? null,
        tick: currentTick
    });
    // Update last seen tick when target is actually visible
    if (targetInfo.entity) {
        lastSeenTargetTick.set(entity.id, currentTick);
    }
}

function getStoredTargetInfo(entity) {
    const entry = lastKnownTargets.get(entity.id);
    if (!entry) return null;
    
    // Mining bears never forget their target (until it dies)
    // Check if target is still valid (not dead)
    if (entry.targetId) {
        try {
            // Try to find the target entity to verify it's still alive
            const dimension = entity.dimension;
            if (dimension) {
                // Check if it's a player
                for (const player of world.getPlayers()) {
                    if (player.id === entry.targetId && player.dimension.id === dimension.id) {
                        // Target is still alive - update position and return                        const loc = entity.location;
                        const targetLoc = player.location;
                        const vector = {
                            x: targetLoc.x - loc.x,
                            y: targetLoc.y - loc.y,
                            z: targetLoc.z - loc.z
                        };
                        // Update stored position
                        entry.position = { x: targetLoc.x, y: targetLoc.y, z: targetLoc.z };
                        entry.tick = system.currentTick;
                        return {
                            entity: player,
                            vector,
                            distanceSq: vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
                        };
                    }
                }
                // Check if it's a mob
                const mobs = dimension.getEntities({ location: entity.location, maxDistance: 64 });
                for (const mob of mobs) {
                    if (mob.id === entry.targetId) {
                        // Target is still alive - update position and return
                        const loc = entity.location;
                        const targetLoc = mob.location;
                        const vector = {
                            x: targetLoc.x - loc.x,
                            y: targetLoc.y - loc.y,
                            z: targetLoc.z - loc.z
                        };
                        // Update stored position
                        entry.position = { x: targetLoc.x, y: targetLoc.y, z: targetLoc.z };
                        entry.tick = system.currentTick;
                        return {
                            entity: mob,
                            vector,
                            distanceSq: vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
                        };
                    }
                }
            }
        } catch {
            // Error checking target - assume it's dead, clear memory
            lastKnownTargets.delete(entity.id);
            return null;
        }
    }
    
    // If we can't find the target, it's probably dead - clear memory
    lastKnownTargets.delete(entity.id);
    return null;
}

function distanceSq3(loc, node) {
    const dx = (node.x + 0.5) - loc.x;
    const dy = (node.y + 1) - loc.y;
    const dz = (node.z + 0.5) - loc.z;
    return dx * dx + dy * dy + dz * dz;
}

function gridDistanceSq(a, b) {
    const dx = a.x - b.x;
    const dy = (a.y ?? 0) - (b.y ?? 0);
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

function directionToward(loc, node) {
    const dx = (node.x + 0.5) - loc.x;
    const dz = (node.z + 0.5) - loc.z;
    if (Math.abs(dx) > Math.abs(dz)) {
        return { x: Math.sign(dx) || 1, z: 0 };
    }
    if (Math.abs(dz) > 0) {
        return { x: 0, z: Math.sign(dz) || 1 };
    }
    return { x: 0, z: 1 };
}

function generatePathNodes(start, goal, tunnelHeight) {
    const nodes = [];
    const current = { ...start };
    let axisToggle = 0;
    const maxVertical = Math.max(1, tunnelHeight);
    for (let i = 0; i < MAX_PLAN_STEPS; i++) {
        const dx = goal.x - current.x;
        const dz = goal.z - current.z;
        const dy = goal.y - current.y;
        if (Math.abs(dx) <= 0 && Math.abs(dz) <= 0 && Math.abs(dy) <= maxVertical) {
            break;
        }
        if (Math.abs(dy) > 0.4) {
            current.y += Math.sign(dy);
        } else if ((axisToggle % 2 === 0 && dx !== 0) || dz === 0) {
            current.x += Math.sign(dx) || (axisToggle % 2 === 0 ? 1 : -1);
        } else {
            current.z += Math.sign(dz) || (axisToggle % 2 === 0 ? 1 : -1);
        }
        axisToggle++;
        nodes.push({ x: current.x, y: current.y, z: current.z });
    }
    return nodes;
}

function createPlanQueue(entity, goalPos, tunnelHeight) {
    const start = {
        x: Math.floor(entity.location.x),
        y: Math.floor(entity.location.y),
        z: Math.floor(entity.location.z)
    };
    const goal = {
        x: Math.floor(goalPos.x),
        y: Math.floor(goalPos.y),
        z: Math.floor(goalPos.z)
    };
    const steps = generatePathNodes(start, goal, tunnelHeight);
    if (steps.length === 0) return { steps: [], index: 0, goal, lastUpdated: system.currentTick };
    return {
        steps,
        index: 0,
        goal,
        lastUpdated: system.currentTick
    };
}

function releasePlan(entityId) {
    const queue = buildQueues.get(entityId);
    if (!queue) return;
    if (queue.steps) {
        for (const node of queue.steps) {
            const key = `${node.x},${node.y},${node.z}`;
            if (reservedNodes.get(key) === entityId) {
                reservedNodes.delete(key);
            }
        }
    }
    buildQueues.delete(entityId);
}

function setBuildMode(entity, active) {
    const id = entity.id;
    const current = buildModeState.get(id) || false;
    if (current === active) return;
    buildModeState.set(id, active);
    const eventName = active ? "mb:enter_build_mode" : "mb:exit_build_mode";
    try {
        entity.triggerEvent(eventName);
    } catch { }
}

function ensureBuildPlan(entity, targetInfo, tunnelHeight, forceRebuild = false) {
    const entityId = entity.id;
    const goalPos = targetInfo?.entity?.location;
    let queue = buildQueues.get(entityId);

    const hasActivePlan = !!(queue && queue.index < (queue.steps?.length ?? 0));

    if ((forceRebuild || !hasActivePlan || !queue) && goalPos) {
        const goalGrid = {
            x: Math.floor(goalPos.x),
            y: Math.floor(goalPos.y),
            z: Math.floor(goalPos.z)
        };
        if (queue) {
            releasePlan(entityId);
            queue = null;
        }
        queue = createPlanQueue(entity, goalPos, tunnelHeight);
        queue.goal = goalGrid;
        if (!queue.steps || queue.steps.length === 0) {
            buildQueues.delete(entityId);
            return null;
        }
        buildQueues.set(entityId, queue);
        for (const node of queue.steps) {
            reservedNodes.set(`${node.x},${node.y},${node.z}`, entityId);
        }
    } else if (!queue) {
        return null;
    }

    if (!queue) return null;

    if (system.currentTick - queue.lastUpdated > TARGET_MEMORY_TICKS) {
        releasePlan(entityId);
        return null;
    }
    queue.lastUpdated = system.currentTick;

    while (queue.index < queue.steps.length) {
        const node = queue.steps[queue.index];
        const key = `${node.x},${node.y},${node.z}`;
        const owner = reservedNodes.get(key);
        if (owner && owner !== entityId) {
            queue.index++;
            continue;
        }
        const distSq = distanceSq3(entity.location, node);
        if (distSq < 1.25) {
            queue.index++;
            continue;
        }
        const direction = directionToward(entity.location, node);
        return { node, direction, queue };
    }

    releasePlan(entityId);
    return null;
}

function advanceBuildPlan(entityId, lastBroken) {
    if (!lastBroken) return;
    const queue = buildQueues.get(entityId);
    if (!queue) return;
    const nodeKey = `${lastBroken.x},${lastBroken.y},${lastBroken.z}`;
    if (reservedNodes.get(nodeKey) && reservedNodes.get(nodeKey) !== entityId) {
        return;
    }
    if (queue.index >= queue.steps.length) {
        releasePlan(entityId);
        return;
    }
    const node = queue.steps[queue.index];
    if (Math.abs(lastBroken.x - node.x) <= 1 && Math.abs(lastBroken.z - node.z) <= 1 && Math.abs(lastBroken.y - node.y) <= 2) {
        queue.index++;
        if (queue.index >= queue.steps.length) {
            releasePlan(entityId);
        } else {
            const completedNode = queue.steps[queue.index - 1];
            const releasedKey = `${completedNode.x},${completedNode.y},${completedNode.z}`;
            if (reservedNodes.get(releasedKey) === entityId) {
                reservedNodes.delete(releasedKey);
            }
        }
    }
}

function isAscending(entity) {
    try {
        const dir = entity.getViewDirection?.();
        if (dir && dir.y > 0.25) return true;
    } catch { }

    try {
        const vel = entity.getVelocity?.();
        if (vel && vel.y > 0.08) return true;
    } catch { }

    return false;
}

function getElevationIntent(entity, targetInfo) {
    if (!targetInfo) return null;
    const targetY = targetInfo.entity?.location?.y;
    if (typeof targetY !== "number") return null;
    const entityY = entity.location.y;
    const delta = targetY - entityY;
    if (delta > ELEVATION_TOLERANCE) return "up";
    if (delta < -ELEVATION_TOLERANCE) return "down";
    return null;
}

function isSolidBlock(block) {
    return !!(block && block.typeId && !AIR_BLOCKS.has(block.typeId));
}

// Check if entity can reach target by walking (without mining)
// Returns true if there's a clear path, false if mining is needed
function canReachTargetByWalking(entity, targetInfo, tunnelHeight) {
    if (!targetInfo || !targetInfo.entity?.location) return false;
    const dimension = entity?.dimension;
    if (!dimension) return false;
    
    const loc = entity.location;
    const targetLoc = targetInfo.entity.location;
    const dx = targetLoc.x - loc.x;
    const dy = targetLoc.y - loc.y;
    const dz = targetLoc.z - loc.z;
    const distance = Math.hypot(dx, dy, dz);
    
    // If very close (within attack range ~3 blocks), assume reachable
    // Exception: If target is significantly above (more than 3 blocks), we can't reach them even if close
    if (distance <= 3.5 && dy <= 3) {
        return true; // Close enough to attack, no mining needed
    }
    
    // If target is significantly above (more than 4 blocks), we can't walk to them - need to mine
    // But allow walking if the path is otherwise clear (they can jump/climb)
    // Only prevent walking if target is VERY high (more than 4 blocks up)
    if (dy > 4) {
        if (getDebugPitfall()) {
            console.warn(`[PITFALL DEBUG] canReachTargetByWalking: Target too high (dy=${dy.toFixed(1)}), need to mine`);
        }
        return false; // Target is very high above, need to mine (pitfall creation)
    }
    
    // If target is significantly below (more than 3 blocks), check if we can walk down to them
    // If target is significantly below (more than 3 blocks), check if we can walk down to them
    // If there's a clear path down, allow walking
    if (dy < -3) {
        // TODO: Implement downward path checking or remove this block
        // Currently falling through to the general path check below
    }    // Sample points along the path to see if it's clear
    // This determines if normal mining (tunneling, breaking walls) is needed
    const steps = Math.ceil(distance);
    const stepX = dx / steps;
    const stepY = dy / steps;
    const stepZ = dz / steps;
    
    let blockedCount = 0;
    // Be more strict - only walk if path is mostly clear
    // Reduce tolerance to prevent unnecessary mining when walking is possible
    const maxBlockedSteps = Math.max(1, Math.floor(steps * 0.15)); // Allow up to 15% of path to be blocked (stricter)
    
    for (let i = 1; i < steps && i < 12; i++) { // Check up to 12 steps ahead
        const checkX = Math.floor(loc.x + stepX * i);
        const checkY = Math.floor(loc.y + stepY * i);
        const checkZ = Math.floor(loc.z + stepZ * i);
        
        // Check if there's a walkable path at this point
        let isBlocked = false;
        
        // Check headroom (need at least tunnelHeight blocks of clearance)
        for (let h = 0; h < tunnelHeight; h++) {
            try {
                const block = dimension.getBlock({ x: checkX, y: checkY + h, z: checkZ });
                if (block && isSolidBlock(block) && !AIR_BLOCKS.has(block.typeId)) {
                    // If it's a breakable block in the way, we need to mine
                    if (isBreakableBlock(block)) {
                        isBlocked = true;
                        break;
                    }
                    // Unbreakable blocks also block the path
                    if (UNBREAKABLE_BLOCKS.has(block.typeId)) {
                        isBlocked = true;
                        break;
                    }
                }
            } catch {
                isBlocked = true;
                break;
            }
        }
        
        // Check if there's a floor to walk on (unless we're going down)
        // For erratic terrain, be more tolerant of small gaps
        if (!isBlocked && dy >= -1) { // Only check floor if not going significantly down
            try {
                const floorBlock = dimension.getBlock({ x: checkX, y: checkY - 1, z: checkZ });
                if (!floorBlock || AIR_BLOCKS.has(floorBlock.typeId)) {
                    // No floor - check if there's a floor nearby (within 1 block) to handle erratic terrain
                    let hasNearbyFloor = false;
                    for (const offset of [{x:0,z:0}, {x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}]) {
                        try {
                            const nearbyFloor = dimension.getBlock({ x: checkX + offset.x, y: checkY - 1, z: checkZ + offset.z });
                            if (nearbyFloor && !AIR_BLOCKS.has(nearbyFloor.typeId)) {
                                hasNearbyFloor = true;
                                break;
                            }
                        } catch {
                            // Continue checking
                        }
                    }
                    // Only count as blocked if there's no floor nearby and it's not the first step
                    if (!hasNearbyFloor && i > 2) { // Allow more tolerance for erratic terrain (i > 2 instead of i > 1)
                        isBlocked = true;
                    }
                }
            } catch {
                // Error checking floor - for erratic terrain, don't immediately assume blocked
                // Only count as blocked if we've checked multiple steps
                if (i > 3) {
                    isBlocked = true;
                }
            }
        }
        
        if (isBlocked) {
            blockedCount++;
            // If too many steps are blocked, path is not walkable
            if (blockedCount > maxBlockedSteps) {
                return false; // Path is too blocked, need to mine
            }
        }
    }
    
    // If we got here, path is mostly clear (or only slightly blocked)
    // Allow walking if less than 15% of path is blocked
    return blockedCount <= maxBlockedSteps;
}

function needsAccessPath(entity, targetInfo, tunnelHeight, directionOverride = null) {
    if (!targetInfo) return false;
    const dimension = entity?.dimension;
    if (!dimension) return false;
    
    const loc = entity.location;
    const targetLoc = targetInfo.entity?.location;
    if (!targetLoc) return false;
    
    // FIRST: Check if entity can reach target by walking (without mining)
    // Only mine if there's no other way to get to the target
    if (canReachTargetByWalking(entity, targetInfo, tunnelHeight)) {
        return false; // Can reach by walking, no mining needed
    }
    
    // If we can't reach by walking, check if we need to mine
    const dx = targetLoc.x - loc.x;
    const dy = targetLoc.y - loc.y;
    const dz = targetLoc.z - loc.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const distance = Math.sqrt(distSq);
    
    // Get elevation intent to determine if we need stairs/ramps
    const elevationIntent = getElevationIntent(entity, targetInfo);
    const needsElevationChange = elevationIntent === "up" || elevationIntent === "down";
    
    // If target is far away (>8 blocks), only break blocks if:
    // 1. We need to create stairs/ramps (elevation change required)
    // 2. OR we're within 8 blocks (normal forward tunneling)
    // This allows creating stairs from farther away, but prevents random block breaking
    if (distance > 8 && !needsElevationChange) {
        return false; // Too far away and no elevation change needed - just move closer
    }
    
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    if (dirX === 0 && dirZ === 0) return false;

    // Check if there's a clear path forward toward the target
    // Only break blocks that are directly in the way to get to the target
    // Check a reasonable number of steps (but not too many when far away)
    const maxSteps = Math.min(ACCESS_CHECK_STEPS, Math.ceil(distance));
    
    for (let step = 1; step <= maxSteps; step++) {
        const x = baseX + dirX * step;
        const z = baseZ + dirZ * step;
        let isBlocked = false;
        
        // Check if headroom is blocked
        for (let h = 0; h < tunnelHeight; h++) {
            const block = getBlock(dimension, x, baseY + h, z);
            if (isSolidBlock(block)) {
                isBlocked = true;
                break;
            }
        }
        
        // Check if floor is missing (only if we're not tunneling down)
        if (elevationIntent !== "down") {
            const floorBlock = getBlock(dimension, x, baseY - 1, z);
            if (!floorBlock || AIR_BLOCKS.has(floorBlock.typeId)) {
                isBlocked = true;
            }
        }
        
        if (isBlocked) {
            // Path is blocked - need to mine
            // If far away, only mine if we need elevation change (stairs/ramps)
            // If close, mine normally
            if (distance > 8) {
                return needsElevationChange; // Only mine if creating stairs/ramps
            }
            return true; // Close enough, mine normally
        }
    }
    
    // Path is clear - no need to mine
    return false;
}

function dampenHorizontalMotion(entity) {
    // Reduced damping to prevent interference with natural movement
    // Only dampen if velocity is very high (prevents sliding, but allows normal movement)
    try {
        const vel = entity.getVelocity?.();
        if (!vel) return;
        const speed = Math.hypot(vel.x, vel.z);
        // Only dampen if moving very fast (likely sliding)
        if (speed > 0.5) {
            entity.applyImpulse({ x: -vel.x * 0.2, y: 0, z: -vel.z * 0.2 });
        }
    } catch {
        // ignore
    }
}

function distanceSq(a, b) {
    const dx = a.x - b.x;
    const dy = (a.y ?? 0) - (b.y ?? 0);
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

function clearForwardTunnel(entity, tunnelHeight, extraHeight, startOffset, digContext, ascending, depth = 1, directionOverride = null, shouldTunnelDown = false, targetInfo = null) {
    const dimension = entity?.dimension;
    if (!dimension) {
        // console.warn(`[MINING AI] clearForwardTunnel: No dimension`);
        return;
    }

    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);

    if (dirX === 0 && dirZ === 0) {
        // console.warn(`[MINING AI] clearForwardTunnel: No direction (dirX=${dirX}, dirZ=${dirZ})`);
        return;
    }
    
    // console.warn(`[MINING AI] clearForwardTunnel: entity=${entity.id.substring(0, 8)}, dir=(${dirX}, ${dirZ}), depth=${depth}, cleared=${digContext.cleared}/${digContext.max}`);

    const height = tunnelHeight + extraHeight;

    for (let step = 1; step <= depth; step++) {
        const targetX = baseX + dirX * step;
        const targetZ = baseZ + dirZ * step;
        const footBlock = getBlock(dimension, targetX, baseY, targetZ);
        const footBlocked = isBreakableBlock(footBlock);
        let start = Math.max(1, startOffset);
        if (!ascending) {
            start = footBlocked ? 0 : start;
        }

        // Break blocks above only if they're blocking the path forward (not automatically)
        // For tough/erratic terrain, check more thoroughly
        for (let h = start; h < height + 1; h++) { // +1 to break one block above tunnel height
            if (digContext.cleared >= digContext.max) {
                return;
            }
            const targetY = baseY + h;
            const block = getBlock(dimension, targetX, targetY, targetZ);
            // Only break if it's actually blocking the path
            if (isBreakableBlock(block) && isSolidBlock(block)) {
                // Pass targetInfo to allow more permissive vision for blocks in the way
                clearBlock(dimension, targetX, targetY, targetZ, digContext, entity, targetInfo);
                return;
            }
        }
        
        // REMOVED: Side block clearing that was creating star patterns
        // Only break blocks directly in the forward path, not side blocks
        
        // Break block below ONLY if tunneling down (target is below)
        // Do NOT break below just because floor is blocked - only when actually descending
        if (shouldTunnelDown) {
            const floorBlock = getBlock(dimension, targetX, baseY - 1, targetZ);
            // Only break if it's a solid block that would block movement
            if (floorBlock && isBreakableBlock(floorBlock) && !AIR_BLOCKS.has(floorBlock.typeId)) {
                if (digContext.cleared >= digContext.max) return;
                clearBlock(dimension, targetX, baseY - 1, targetZ, digContext, entity, targetInfo);
                return;
            }
        }
    }
}

function carveStair(entity, tunnelHeight, digContext, directionOverride = null, targetInfo = null) {
    const dimension = entity?.dimension;
    if (!dimension) return;

    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    if (dirX === 0 && dirZ === 0) return;

    const entityId = entity.id;
    const currentTick = system.currentTick;
    const stepX = baseX + dirX;
    const stepZ = baseZ + dirZ;
    
    // Coordinate with other bears: Check if another bear is already working on this stair location
    const stepKey = `${stepX},${baseY},${stepZ}`;
    // Define landingKey early so it's always available for protection marking
    const landingX = stepX + dirX;
    const landingZ = stepZ + dirZ;
    const landingKey = `${landingX},${baseY + 1},${landingZ}`;
    
    // Helper function to mark both stair locations as protected
    const markStairProtected = () => {
        recentStairBlocks.set(stepKey, currentTick);
        recentStairBlocks.set(landingKey, currentTick);
    };
    
    const existingWork = activeStairWork.get(stepKey);
    if (existingWork && existingWork.entityId !== entityId) {
        const ticksSinceWork = currentTick - existingWork.tick;
        if (ticksSinceWork < STAIR_WORK_LOCK_TICKS) {
            // Another bear is working on this stair - skip it and try a different location
            // Try landing area or look for alternative path
            const landingWork = activeStairWork.get(landingKey);
            if (!landingWork || landingWork.entityId === entityId || (currentTick - landingWork.tick) >= STAIR_WORK_LOCK_TICKS) {
                // Landing area is available - work on that instead
                for (let h = 0; h < tunnelHeight + 1; h++) { // +1 extra headroom for tough terrain
                    if (digContext.cleared >= digContext.max) return;
                    const targetY = baseY + 1 + h;
                    const block = getBlock(dimension, landingX, targetY, landingZ);
                    if (!isBreakableBlock(block)) continue;
                    activeStairWork.set(landingKey, { entityId, tick: currentTick });
                    clearBlock(dimension, landingX, targetY, landingZ, digContext, entity);
                    markStairProtected();
                    return;
                }
            }
            // Both areas are being worked on - skip this tick
            return;
        }
        // Lock expired - this bear can work on it now
    }
    
    // For upward stairs, we need to:
    // 1. Break the block at the step location (baseY) to create the step the bear can walk onto
    // 2. Break blocks above the step (baseY + 1) to create headroom
    // 3. Break blocks at the landing area (baseY + 1, one block forward) for the next step
    // 4. Clear obstacles in adjacent blocks that might block movement
    
    // FIRST: Break the block at the step location (the actual stair step)
    if (digContext.cleared < digContext.max) {
        const stepBlock = getBlock(dimension, stepX, baseY, stepZ);
        if (isBreakableBlock(stepBlock)) {
            // Claim this stair location
            activeStairWork.set(stepKey, { entityId, tick: currentTick });
            clearBlock(dimension, stepX, baseY, stepZ, digContext, entity);
            // Mark as protected
            markStairProtected();
            return; // Break one block at a time
        }
    }
    
    // SECOND: Remove blocks on top of the step to create headroom (with extra clearance for tough terrain)
    for (let h = 0; h < tunnelHeight + 1; h++) { // +1 extra headroom for erratic terrain
        if (digContext.cleared >= digContext.max) return;
        const targetY = baseY + 1 + h;
        const block = getBlock(dimension, stepX, targetY, stepZ);
        if (!isBreakableBlock(block)) continue;
        // Claim this stair location
        if (!activeStairWork.has(stepKey)) {
            activeStairWork.set(stepKey, { entityId, tick: currentTick });
        }
        clearBlock(dimension, stepX, targetY, stepZ, digContext, entity);
        markStairProtected();
        return; // Break one block at a time
    }
    
    // REMOVED: Side block clearing that was creating star patterns
    // Only break blocks directly in the forward path, not side blocks

    // THIRD: Ensure landing area one block up and forward is clear (for the next step up).
    const landingWork = activeStairWork.get(landingKey);
    if (landingWork && landingWork.entityId !== entityId) {
        const ticksSinceWork = currentTick - landingWork.tick;
        if (ticksSinceWork < STAIR_WORK_LOCK_TICKS) {
            // Another bear is working on landing area - skip it for now
            return;
        }
    }
    
    // Break the block at the landing location (the next step up)
    if (digContext.cleared < digContext.max) {
        const landingBlock = getBlock(dimension, landingX, baseY + 1, landingZ);
        if (isBreakableBlock(landingBlock)) {
            // Claim this landing location
            activeStairWork.set(landingKey, { entityId, tick: currentTick });
            clearBlock(dimension, landingX, baseY + 1, landingZ, digContext, entity);
            // Mark as protected
            markStairProtected();
            return; // Break one block at a time
        }
    }
    
    // FOURTH: Ensure headroom above the landing area (with extra clearance for tough terrain)
    for (let h = 0; h < tunnelHeight + 1; h++) { // +1 extra headroom for erratic terrain
        if (digContext.cleared >= digContext.max) return;
        const targetY = baseY + 2 + h; // +2 because landing is at baseY + 1
        const block = getBlock(dimension, landingX, targetY, landingZ);
        if (!isBreakableBlock(block)) continue;
        // Claim this landing location
        if (!activeStairWork.has(landingKey)) {
            activeStairWork.set(landingKey, { entityId, tick: currentTick });
        }
        clearBlock(dimension, landingX, targetY, landingZ, digContext, entity);
        markStairProtected();
        return; // Break one block at a time
    }
    
    // FIFTH: For erratic terrain, also check and clear blocks that might be above the current position
    // This helps with unpredictable terrain variations
    if (digContext.cleared < digContext.max) {
        for (let h = 0; h < tunnelHeight; h++) {
            if (digContext.cleared >= digContext.max) break;
            const targetY = baseY + h;
            const block = getBlock(dimension, baseX, targetY, baseZ);
            // If there's a block directly above the entity that's blocking, clear it
            if (h > 0 && isBreakableBlock(block) && isSolidBlock(block)) {
                clearBlock(dimension, baseX, targetY, baseZ, digContext, entity);
                markStairProtected();
                return;
            }
        }
    }
    
    // All stairs are cleared - mark locations as protected
    markStairProtected();
}

function carveSupportCorridor(entity, tunnelHeight, digContext, directionHint = 0, directionOverride = null) {
    const dimension = entity?.dimension;
    if (!dimension) return;
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    if (dirX === 0 && dirZ === 0) return;

    const sides = [
        { x: -dirZ, z: dirX },
        { x: dirZ, z: -dirX }
    ];

    let sideIndex = 0;
    if (directionHint > 0) sideIndex = 0;
    else if (directionHint < 0) sideIndex = 1;
    else sideIndex = Math.random() < 0.5 ? 0 : 1;

    const side = sides[sideIndex];

    for (let depth = 0; depth < SIDE_CHANNEL_DEPTH; depth++) {
        const offsetX = baseX + dirX * depth + side.x;
        const offsetZ = baseZ + dirZ * depth + side.z;
        for (let h = 0; h < tunnelHeight; h++) {
            if (digContext.cleared >= digContext.max) return;
            const block = getBlock(dimension, offsetX, baseY + h, offsetZ);
            if (!isBreakableBlock(block)) continue;
            clearBlock(dimension, offsetX, baseY + h, offsetZ, digContext, entity);
            return;
        }
    }
}

function carveRampDown(entity, tunnelHeight, digContext, directionOverride = null, targetInfo = null) {
    const dimension = entity?.dimension;
    if (!dimension) return;
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    if (dirX === 0 && dirZ === 0) return;

    const stepX = baseX + dirX;
    const stepZ = baseZ + dirZ;
    const landingX = baseX + dirX * 2;
    const landingZ = baseZ + dirZ * 2;

    // Ensure headroom above the step
    for (let h = 1; h <= tunnelHeight; h++) {
        if (digContext.cleared >= digContext.max) return;
        const block = getBlock(dimension, stepX, baseY + h, stepZ);
        if (!isBreakableBlock(block)) continue;
        clearBlock(dimension, stepX, baseY + h, stepZ, digContext, entity);
        return;
    }

    // Remove step floor and create a slot below
    if (digContext.cleared < digContext.max) {
        const block = getBlock(dimension, stepX, baseY, stepZ);
        if (isBreakableBlock(block)) {
            clearBlock(dimension, stepX, baseY, stepZ, digContext, entity);
            return;
        }
    }
    if (digContext.cleared < digContext.max) {
        const block = getBlock(dimension, stepX, baseY - 1, stepZ);
        if (isBreakableBlock(block)) {
            clearBlock(dimension, stepX, baseY - 1, stepZ, digContext, entity);
            return;
        }
    }

    // Prepare landing one block lower
    for (let h = 0; h < tunnelHeight; h++) {
        if (digContext.cleared >= digContext.max) return;
        const block = getBlock(dimension, landingX, baseY - 1 + h, landingZ);
        if (!isBreakableBlock(block)) continue;
        clearBlock(dimension, landingX, baseY - 1 + h, landingZ, digContext, entity);
        return;
    }
    
    // Mark ramp blocks as protected (prevent breaking them)
    const currentTick = system.currentTick;
    recentStairBlocks.set(`${stepX},${baseY},${stepZ}`, currentTick);
    recentStairBlocks.set(`${stepX},${baseY - 1},${stepZ}`, currentTick);
    recentStairBlocks.set(`${landingX},${baseY - 1},${landingZ}`, currentTick);
}

function branchTunnel(entity, tunnelHeight, digContext, tick, directionOverride = null) {
    if (tick % BRANCH_INTERVAL_TICKS !== 0) return;
    const dimension = entity?.dimension;
    if (!dimension) return;
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    if (dirX === 0 && dirZ === 0) return;

    const perpendicular = [
        { x: -dirZ, z: dirX },
        { x: dirZ, z: -dirX }
    ];
    const index = ((tick / BRANCH_INTERVAL_TICKS) | 0) % perpendicular.length;
    const side = perpendicular[index];
    const branchX = baseX + side.x;
    const branchZ = baseZ + side.z;

    for (let h = 1; h < Math.min(tunnelHeight, 3); h++) {
        if (digContext.cleared >= digContext.max) return;
        const block = getBlock(dimension, branchX, baseY + h, branchZ);
        if (!isBreakableBlock(block)) continue;
        clearBlock(dimension, branchX, baseY + h, branchZ, digContext, entity);
        return;
    }
}

// Check if target is visible through breakable blocks (heat-seeking vision)
function canSeeTargetThroughBlocks(entity, targetInfo, maxBlocks = 3) {
    const dimension = entity?.dimension;
    if (!dimension || !targetInfo?.entity?.location) return false;
    
    const origin = entity.location;
    const target = targetInfo.entity.location;
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
            if (block && !AIR_BLOCKS.has(block.typeId)) {
                // If it's an unbreakable block, we can't see through it
                if (UNBREAKABLE_BLOCKS.has(block.typeId)) {
                    return false;
                }
                // Count breakable blocks
                if (isBreakableBlock(block)) {
                    blockCount++;
                }
            }
        } catch {
            return false; // Error checking, assume blocked
        }
    }
    
    return blockCount <= maxBlocks; // Can see through if maxBlocks or fewer breakable blocks
}

// Break blocks under an elevated target (like a pillar) when close enough
// Also breaks blocks under targets for pitfall creation
function breakBlocksUnderTarget(entity, targetInfo, digContext) {
            if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Called for entity ${entity.id.substring(0, 8)}`);
    
    if (!targetInfo || !digContext || digContext.cleared >= digContext.max) {
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Early return - targetInfo: ${!!targetInfo}, digContext: ${!!digContext}, cleared: ${digContext?.cleared}, max: ${digContext?.max}`);
        return;
    }
    const dimension = entity?.dimension;
    if (!dimension) {
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: No dimension`);
        return;
    }
    
    const targetLoc = targetInfo.entity?.location;
    if (!targetLoc) {
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: No target location`);
        return;
    }
    
    const loc = entity.location;
    const dx = targetLoc.x - loc.x;
    const dy = targetLoc.y - loc.y;
    const dz = targetLoc.z - loc.z;
    const distance = Math.hypot(dx, dz);
    
            if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Entity at (${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)}), Target at (${targetLoc.x.toFixed(1)}, ${targetLoc.y.toFixed(1)}, ${targetLoc.z.toFixed(1)}), Distance: ${distance.toFixed(1)}, dy: ${dy.toFixed(1)}`);
    
    // Break blocks under target for pitfall creation (when target is above or at same level)
    // This allows mining bears to create pitfalls by breaking blocks underneath players
    const targetX = Math.floor(targetLoc.x);
    const targetY = Math.floor(targetLoc.y);
    const targetZ = Math.floor(targetLoc.z);
    
            if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: distance=${distance.toFixed(1)}, dy=${dy.toFixed(1)}, targetX=${targetX}, targetY=${targetY}, targetZ=${targetZ}`);
    
    // Check if we should break blocks under target (pitfall creation)
    // Break if: within 6 blocks horizontally AND target is at same level or above
    if (distance <= 6 && dy >= -1) {
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Conditions met! distance: ${distance.toFixed(1)} <= 6, dy: ${dy.toFixed(1)} >= -1`);
        // Break blocks from the target's feet down to a reasonable depth
        const startY = targetY - 1; // Start at the block under the target's feet
        const endY = Math.max(targetY - 5, Math.floor(loc.y) - 2); // Break down to a reasonable depth
        
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Checking Y range: ${startY} to ${endY}`);
        
        for (let y = startY; y >= endY; y--) {
            if (digContext.cleared >= digContext.max) {
                if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Budget exhausted: ${digContext.cleared}/${digContext.max}`);
                return;
            }
            const block = getBlock(dimension, targetX, y, targetZ);
            if (isBreakableBlock(block)) {
                if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Found breakable block at (${targetX}, ${y}, ${targetZ}): ${block?.typeId}, attempting to break...`);
                // Pass targetInfo to allow more permissive vision for pitfall creation
                const result = clearBlock(dimension, targetX, y, targetZ, digContext, entity, targetInfo);
                if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: clearBlock returned: ${result}, cleared=${digContext.cleared}/${digContext.max}`);
                return; // Break one block at a time
            } else {
                if (y === startY && getDebugPitfall()) {
                    console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Block at (${targetX}, ${y}, ${targetZ}) is not breakable: ${block?.typeId || 'null'}`);
                }
            }
        }
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: No breakable blocks found in Y range ${startY} to ${endY}`);
    } else {
        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Conditions NOT met: distance: ${distance.toFixed(1)} ${distance > 6 ? '> 6' : 'OK'}, dy: ${dy.toFixed(1)} ${dy < -1 ? '< -1' : 'OK'}`);
    }
    
    // Also handle elevated targets (pillars) - original behavior
    // Only break blocks under target if:
    // 1. Target is above us (elevation intent is "up")
    // 2. We're close enough (within 6 blocks horizontally)
    // 3. Target is significantly above us (at least 2 blocks)
    const elevationIntent = getElevationIntent(entity, targetInfo);
    if (elevationIntent === "up" && distance <= 6 && dy >= 2) {
        const startY = targetY - 1;
        const endY = Math.max(targetY - 5, Math.floor(loc.y) - 2);
        
        for (let y = startY; y >= endY; y--) {
            if (digContext.cleared >= digContext.max) return;
            const block = getBlock(dimension, targetX, y, targetZ);
            if (isBreakableBlock(block)) {
                clearBlock(dimension, targetX, y, targetZ, digContext, entity, targetInfo);
                return;
            }
        }
    }
}

function findNearestTarget(entity, maxDistance = TARGET_SCAN_RADIUS, useCache = true) {
    const dimension = entity?.dimension;
    if (!dimension) return null;
    const entityId = entity.id;
    const currentTick = system.currentTick;
    
    // Check cache first (performance optimization)
    if (useCache) {
        const cached = targetCache.get(entityId);
        if (cached && (currentTick - cached.tick) < TARGET_CACHE_TICKS) {
            // Validate cached target is still valid
            try {
                if (cached.target?.entity?.isValid && cached.target.entity.isValid()) {
                    const origin = entity.location;
                    const targetLoc = cached.target.entity.location;
                    const dx = targetLoc.x - origin.x;
                    const dy = targetLoc.y - origin.y;
                    const dz = targetLoc.z - origin.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq <= maxDistance * maxDistance) {
                        // Update vector and distance
                        cached.target.vector = { x: dx, y: dy, z: dz };
                        cached.target.distanceSq = distSq;
                        return cached.target;
                    }
                }
            } catch {
                // Target invalid, fall through to fresh lookup
            }
        }
    }
    
    const origin = entity.location;
    const maxDistSq = maxDistance * maxDistance;
    let best = null;
    let bestDistSq = maxDistSq;
    let bestPlayer = null;
    let bestPlayerDistSq = maxDistSq;

    // FIRST PASS: Find the closest player (ALWAYS prioritize players over mobs)
    for (const player of world.getPlayers()) {
        if (player.dimension !== dimension) continue;
        // Skip creative mode players
        try {
            if (player.getGameMode() === "creative") continue;
        } catch { }
        const dx = player.location.x - origin.x;
        const dy = player.location.y - origin.y;
        const dz = player.location.z - origin.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < bestPlayerDistSq) {
            // Heat-seeking: Check if we can see this target through blocks (up to 3 blocks)
            const targetInfo = {
                entity: player,
                distanceSq: distSq,
                vector: { x: dx, y: dy, z: dz }
            };
            // Allow targeting through up to 3 breakable blocks (heat-seeking vision)
            if (canSeeTargetThroughBlocks(entity, targetInfo, 3)) {
                bestPlayer = player;
                bestPlayerDistSq = distSq;
            }
        }
    }
    
    // If we found a player, use it (players always take priority)
    if (bestPlayer) {
        best = bestPlayer;
        bestDistSq = bestPlayerDistSq;
    } else {
        // Only look for mobs if NO players found (with see-through vision)
        const mobs = dimension.getEntities({
            maxDistance,
            location: origin,
            families: ["mob"]
        });
        for (const mob of mobs) {
            if (mob === entity) continue;
            const dx = mob.location.x - origin.x;
            const dy = mob.location.y - origin.y;
            const dz = mob.location.z - origin.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < bestDistSq) {
                // Heat-seeking: Check if we can see this target through blocks (up to 3 blocks)
                const targetInfo = {
                    entity: mob,
                    distanceSq: distSq,
                    vector: { x: dx, y: dy, z: dz }
                };
                // Allow targeting through up to 3 breakable blocks (heat-seeking vision)
                if (canSeeTargetThroughBlocks(entity, targetInfo, 3) || !best) {
                    best = mob;
                    bestDistSq = distSq;
                }
            }
        }
    }

    if (!best) {
        // Cache null result too (no target found)
        if (useCache) {
            targetCache.set(entityId, { target: null, tick: currentTick });
        }
        return null;
    }
    
    const result = {
        entity: best,
        distanceSq: bestDistSq,
        vector: {
            x: best.location.x - origin.x,
            y: best.location.y - origin.y,
            z: best.location.z - origin.z
        }
    };
    
    // Cache the result
    if (useCache) {
        targetCache.set(entityId, { target: result, tick: currentTick });
    }
    
    return result;
}

function breakWallAhead(entity, tunnelHeight, digContext, targetInfo, directionOverride = null) {
    const dimension = entity?.dimension;
    if (!dimension || !targetInfo) return;
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    if (dirX === 0 && dirZ === 0) return;

    const horizLen = Math.sqrt(targetInfo.vector.x * targetInfo.vector.x + targetInfo.vector.z * targetInfo.vector.z);
    if (horizLen < 0.01) return;
    const dirToTargetX = targetInfo.vector.x / horizLen;
    const dirToTargetZ = targetInfo.vector.z / horizLen;
    const dot = dirToTargetX * dirX + dirToTargetZ * dirZ;
    if (dot < 0.35) return; // Not moving toward target
    
    // Calculate distance to target - only break forward path blocks if close enough
    const targetLoc = targetInfo.entity?.location;
    let distance = 0;
    if (targetLoc) {
        const dx = targetLoc.x - loc.x;
        const dz = targetLoc.z - loc.z;
        distance = Math.hypot(dx, dz);
        
        // Only break forward path blocks if within 8 blocks of target
        // This prevents breaking blocks when far away (stairs/ramps handle elevation changes)
        if (distance > 8) {
            return; // Too far away for forward tunneling - let stairs/ramps handle it
        }
    }

    // Only check blocks directly in the path to the target (not too far ahead)
    const maxDepth = distance > 0 ? Math.min(WALL_SCAN_DEPTH + 1, Math.ceil(distance)) : WALL_SCAN_DEPTH + 1;
    for (let depth = 2; depth <= maxDepth; depth++) {
        const targetX = baseX + dirX * depth;
        const targetZ = baseZ + dirZ * depth;
        let hasSolid = false;
        for (let h = 0; h < tunnelHeight; h++) {
            const block = getBlock(dimension, targetX, baseY + h, targetZ);
            if (isBreakableBlock(block)) {
                hasSolid = true;
                break;
            }
        }
        if (!hasSolid) {
            break;
        }
        const columnFoot = getBlock(dimension, targetX, baseY, targetZ);
        const columnFootBlocked = isBreakableBlock(columnFoot);
        const columnStart = columnFootBlocked ? 0 : 1;
        for (let h = columnStart; h < tunnelHeight; h++) {
            if (digContext.cleared >= digContext.max) return;
            const targetY = baseY + h;
            const block = getBlock(dimension, targetX, targetY, targetZ);
            if (!isBreakableBlock(block)) continue;
            // Pass targetInfo to allow more permissive vision for blocks in the way
            clearBlock(dimension, targetX, targetY, targetZ, digContext, entity, targetInfo);
            return;
        }
    }
}

function liftIfBuried(entity, tunnelHeight, digContext) {
    const dimension = entity?.dimension;
    if (!dimension) return;
    const loc = entity.location;
    const feetY = Math.floor(loc.y);
    const headY = Math.ceil(loc.y + tunnelHeight);
    const x = Math.floor(loc.x);
    const z = Math.floor(loc.z);

    // Only break head blocks if they're actually blocking (not just check)
    for (let i = 0; i < LIFT_ITERATIONS; i++) {
        const headBlock = getBlock(dimension, x, headY, z);
        if (!isBreakableBlock(headBlock)) break;
        if (digContext.cleared >= digContext.max) break;
        clearBlock(dimension, x, headY, z, digContext, entity);
    }

    // Only lift if actually buried - be very strict about this
    // Entity must have: solid block at head level AND solid block below feet
    const headBlock2 = getBlock(dimension, x, headY, z);
    const feetBlock = getBlock(dimension, x, feetY - 1, z);
    
    // Check if head is blocked by a solid, unbreakable block
    const headBlocked = headBlock2 && !AIR_BLOCKS.has(headBlock2?.typeId) && 
                       headBlock2.isLiquid !== undefined && !headBlock2.isLiquid &&
                       !isBreakableBlock(headBlock2);
    
    // Check if feet are on solid ground
    const feetOnSolid = feetBlock && !AIR_BLOCKS.has(feetBlock?.typeId) && 
                       feetBlock.isLiquid !== undefined && !feetBlock.isLiquid;
    
    // Only teleport if truly buried (head blocked AND feet on solid ground)
    // AND entity is not already moving upward significantly
    if (headBlocked && feetOnSolid) {
        const motion = entity.getVelocity?.();
        const vy = motion?.y ?? 0;
        // Only teleport if not already moving up significantly (prevents constant teleporting)
        if (vy < 0.1) {
            try {
                // Teleport to just above the blocking block
                const newY = headY + 0.1;
                // Only teleport if it's a significant difference (prevents micro-teleports)
                if (Math.abs(newY - loc.y) > 0.3) {
                    entity.teleport({ x: loc.x, y: newY, z: loc.z }, dimension);
                }
            } catch { }
        }
    }
}

function updateLeaderTrailRecord(entity) {
    const id = entity.id;
    let record = leaderTrails.get(id);
    if (!record) {
        record = { points: [] };
        leaderTrails.set(id, record);
    }
    record.points.unshift({ x: entity.location.x, y: entity.location.y, z: entity.location.z });
    if (record.points.length > TRAIL_MAX_POINTS) {
        record.points.pop();
    }
    return record.points;
}

function getLeaderTrailRecord(id) {
    const record = leaderTrails.get(id);
    return record ? record.points : [];
}

function cleanupLeaderTrails(activeIds) {
    for (const [leaderId] of leaderTrails) {
        if (!activeIds.has(leaderId)) {
            leaderTrails.delete(leaderId);
        }
    }
}

function pickTrailWaypoint(trail, entity) {
    if (!trail || trail.length === 0) return null;
    const loc = entity.location;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < trail.length; i++) {
        if (i % TRAIL_SAMPLE_STEP !== 0) continue;
        const point = trail[i];
        const dist = distanceSq(point, loc);
        if (dist < bestDist) {
            bestDist = dist;
            best = point;
        }
    }
    return best;
}

function shouldAssistDigging(entity, leaderSummary) {
    if (!leaderSummary) return false;
    const distSq = distanceSq(entity.location, leaderSummary.position);
    if (distSq > FOLLOWER_ASSIST_DISTANCE_SQ) return false;
    const dimension = entity?.dimension;
    if (!dimension) return false;
    const { x: dirX, z: dirZ } = getForwardOffset(entity);
    if (dirX === 0 && dirZ === 0) return false;
    const baseX = Math.floor(entity.location.x);
    const baseY = Math.floor(entity.location.y);
    const baseZ = Math.floor(entity.location.z);
    const blockAhead = getBlock(dimension, baseX + dirX, baseY + 1, baseZ + dirZ);
    return isBreakableBlock(blockAhead);
}

function followLeader(entity, waypoint) {
    if (!waypoint) return;
    const loc = entity.location;
    const dx = waypoint.x - loc.x;
    const dz = waypoint.z - loc.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) return;
    
    // Check if entity is on ground before applying impulse (prevents jumping/falling)
    const dimension = entity?.dimension;
    if (dimension) {
        const feetY = Math.floor(loc.y);
        const feetBlock = dimension.getBlock({ x: Math.floor(loc.x), y: feetY - 1, z: Math.floor(loc.z) });
        const isOnGround = feetBlock && !feetBlock.isAir && !feetBlock.isLiquid;
        
        // Only apply impulse if on ground (prevents jumping/falling)
        if (!isOnGround) return;
    }
    
    const impulse = FOLLOWER_IMPULSE;
    entity.applyImpulse({
        x: (dx / dist) * impulse,
        y: 0,
        z: (dz / dist) * impulse
    });
}

function idleWander(entity, tick) {
    // Random wandering when idle (no target)
    // This makes mining bears more natural when not actively pursuing a target
    if (tick % 80 !== 0) return; // Only wander occasionally (less frequent)
    
    const dimension = entity?.dimension;
    if (!dimension) return;
    
    // Check if entity is on ground before applying impulse (prevents jumping/falling)
    const loc = entity.location;
    const feetY = Math.floor(loc.y);
    const feetBlock = dimension.getBlock({ x: Math.floor(loc.x), y: feetY - 1, z: Math.floor(loc.z) });
    const isOnGround = feetBlock && !feetBlock.isAir && !feetBlock.isLiquid;
    
    // Only wander if on ground (prevents jumping/falling)
    if (!isOnGround) return;
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 2 + Math.random() * 3; // 2-5 blocks away
    
    const targetX = loc.x + Math.cos(angle) * distance;
    const targetZ = loc.z + Math.sin(angle) * distance;
    
    // Apply smaller impulse toward random direction (reduced from 0.15 to 0.08)
    const dx = targetX - loc.x;
    const dz = targetZ - loc.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.1) {
        const impulse = 0.08; // Reduced impulse to prevent jumping
        entity.applyImpulse({
            x: (dx / dist) * impulse,
            y: 0,
            z: (dz / dist) * impulse
        });
    }
}

function hasActiveQueue(queue) {
    return !!(queue && queue.steps && queue.index < queue.steps.length);
}

// ============================================
// INTELLIGENCE SYSTEM FUNCTIONS
// ============================================

// Calculate optimal attack position - where the bear should be to best attack the target
function calculateOptimalAttackPosition(entity, targetInfo) {
    if (!targetInfo || !targetInfo.entity?.location) return null;
    
    const loc = entity.location;
    const targetLoc = targetInfo.entity.location;
    const dx = targetLoc.x - loc.x;
    const dy = targetLoc.y - loc.y;
    const dz = targetLoc.z - loc.z;
    const horizontalDist = Math.hypot(dx, dz);
    
    // If target is above (for pitfall creation), optimal position is directly under them
    if (dy > 2) {
        return {
            x: targetLoc.x,
            y: Math.floor(targetLoc.y) - 2, // 2 blocks below target
            z: targetLoc.z
        };
    }
    
    // Otherwise, optimal position is at OPTIMAL_ATTACK_DISTANCE from target
    if (horizontalDist > OPTIMAL_ATTACK_DISTANCE) {
        const angle = Math.atan2(dz, dx);
        return {
            x: targetLoc.x - Math.cos(angle) * OPTIMAL_ATTACK_DISTANCE,
            y: loc.y, // Keep same Y level
            z: targetLoc.z - Math.sin(angle) * OPTIMAL_ATTACK_DISTANCE
        };
    }
    
    // Already at optimal distance
    return null;
}

// Determine mining strategy based on target position and distance
function determineMiningStrategy(entity, targetInfo, tick) {
    if (!targetInfo || !targetInfo.entity?.location) return "idle";
    
    const entityId = entity.id;
    const cached = entityStrategies.get(entityId);
    
    // Reuse cached strategy if recent (within STRATEGY_RECALCULATE_INTERVAL)
    if (cached && (tick - cached.lastCalculated) < STRATEGY_RECALCULATE_INTERVAL) {
        return cached.strategy;
    }
    
    const loc = entity.location;
    const targetLoc = targetInfo.entity.location;
    const dx = targetLoc.x - loc.x;
    const dy = targetLoc.y - loc.y;
    const dz = targetLoc.z - loc.z;
    const horizontalDist = Math.hypot(dx, dz);
    const totalDist = Math.hypot(dx, dy, dz);
    
    let strategy = "direct";
    let optimalPosition = null;
    
    // Strategy decision logic
    if (horizontalDist > MOVE_CLOSER_THRESHOLD) {
        // Far away - move closer first
        strategy = "move_closer";
        optimalPosition = calculateOptimalAttackPosition(entity, targetInfo);
    } else if (dy > 3 && horizontalDist <= OPTIMAL_ATTACK_DISTANCE) {
        // Target is above and we're close - pitfall strategy
        strategy = "pitfall";
        optimalPosition = { x: targetLoc.x, y: Math.floor(targetLoc.y) - 2, z: targetLoc.z };
    } else if (dy > 3) {
        // Target is above but we're not close - move closer then pitfall
        strategy = "hybrid_pitfall";
        optimalPosition = calculateOptimalAttackPosition(entity, targetInfo);
    } else if (horizontalDist > 6) {
        // Medium distance - tunnel approach
        strategy = "tunnel";
    } else {
        // Close - direct path or tunnel if blocked
        strategy = "direct";
    }
    
    // Cache the strategy
    entityStrategies.set(entityId, {
        strategy,
        lastCalculated: tick,
        optimalPosition
    });
    
    return strategy;
}

// Check if bear should move closer before mining
function shouldMoveCloserFirst(entity, targetInfo) {
    if (!targetInfo || !targetInfo.entity?.location) return false;
    
    const loc = entity.location;
    const targetLoc = targetInfo.entity.location;
    const dx = targetLoc.x - loc.x;
    const dz = targetLoc.z - loc.z;
    const horizontalDist = Math.hypot(dx, dz);
    
    // Move closer if farther than threshold
    return horizontalDist > MOVE_CLOSER_THRESHOLD;
}

// Create exploratory tunnel when idle
function createExploratoryTunnel(entity, config, digContext, tick) {
    const entityId = entity.id;
    let exploration = idleExplorationState.get(entityId);
    
    if (!exploration) {
        // Start new exploration
        const directions = [
            { x: 1, z: 0 }, { x: -1, z: 0 },
            { x: 0, z: 1 }, { x: 0, z: -1 },
            { x: 1, z: 1 }, { x: -1, z: -1 },
            { x: 1, z: -1 }, { x: -1, z: 1 }
        ];
        const dir = directions[Math.floor(Math.random() * directions.length)];
        exploration = {
            startTick: tick,
            direction: dir,
            tunnelLength: 0
        };
        idleExplorationState.set(entityId, exploration);
    }
    
    // Check if we should continue this tunnel or start a new one
    if (exploration.tunnelLength >= EXPLORATION_TUNNEL_LENGTH) {
        // Tunnel complete, start new direction
        idleExplorationState.delete(entityId);
        return false; // Don't mine this tick, will start new tunnel next tick
    }
    
    // Continue digging tunnel in chosen direction
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    
    // Dig forward in the exploration direction
    const forwardX = baseX + exploration.direction.x;
    const forwardZ = baseZ + exploration.direction.z;
    
    // Check if we're in a cave - if so, prefer cave exploration
    const inCave = isInCave(entity);
    
    // Clear tunnel forward (height of tunnelHeight)
    for (let h = 0; h < config.tunnelHeight; h++) {
        if (digContext.cleared >= digContext.max) break;
        const block = getBlock(entity.dimension, forwardX, baseY + h, forwardZ);
        if (isBreakableBlock(block)) {
            clearBlock(entity.dimension, forwardX, baseY + h, forwardZ, digContext, entity);
            exploration.tunnelLength++;
            return true;
        }
    }
    
    // In caves, also check ceiling and walls for exploration
    if (inCave && digContext.cleared < digContext.max) {
        // Check ceiling
        const ceilingBlock = getBlock(entity.dimension, forwardX, baseY + config.tunnelHeight, forwardZ);
        if (isBreakableBlock(ceilingBlock)) {
            clearBlock(entity.dimension, forwardX, baseY + config.tunnelHeight, forwardZ, digContext, entity);
            exploration.tunnelLength++;
            return true;
        }
    }
    
    // Also check floor if needed
    const floorBlock = getBlock(entity.dimension, forwardX, baseY - 1, forwardZ);
    if (AIR_BLOCKS.has(floorBlock?.typeId)) {
        // Fill gap in floor
        // Don't fill, just mark as explored
    }
    
    return false;
}

// ============================================
// CAVE MINING FUNCTIONS
// ============================================

// Detect if entity is in a cave (underground, surrounded by stone/deepslate)
function isInCave(entity) {
    const dimension = entity?.dimension;
    if (!dimension) return false;
    
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    
    // Check if we're below the cave threshold
    if (baseY > CAVE_Y_THRESHOLD) return false;
    
    // Count solid blocks around the entity
    let solidBlockCount = 0;
    const checkRadius = CAVE_DETECTION_RADIUS;
    
    for (let dx = -checkRadius; dx <= checkRadius; dx++) {
        for (let dy = -checkRadius; dy <= checkRadius; dy++) {
            for (let dz = -checkRadius; dz <= checkRadius; dz++) {
                // Skip the center (where entity is)
                if (dx === 0 && dy === 0 && dz === 0) continue;
                
                // Skip blocks too far away
                const dist = Math.hypot(dx, dy, dz);
                if (dist > checkRadius) continue;
                
                try {
                    const block = getBlock(dimension, baseX + dx, baseY + dy, baseZ + dz);
                    if (block && isSolidBlock(block) && !AIR_BLOCKS.has(block.typeId)) {
                        solidBlockCount++;
                    }
                } catch {
                    // Error checking block, skip
                }
            }
        }
    }
    
    // Consider it a cave if there are enough solid blocks around
    return solidBlockCount >= CAVE_BLOCK_THRESHOLD;
}

// ============================================
// PATH ACCESSIBILITY FOR SMALLER BEARS
// ============================================

// Ensure tunnel has proper headroom for smaller bears (maple thralls, tiny MBs)
// Tunnels are 1 block wide, 2 blocks tall - not sized for huge buff bears
function ensurePathAccessibility(entity, tunnelHeight, digContext, directionOverride = null, tick) {
    // Ensure proper headroom for smaller bears (2 blocks is enough for maple thralls and tiny MBs)
    const dimension = entity?.dimension;
    if (!dimension) return;
    
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    
    // Check headroom above - ensure at least PATH_HEIGHT_FOR_SMALL_BEARS blocks
    for (let h = tunnelHeight; h < PATH_HEIGHT_FOR_SMALL_BEARS; h++) {
        if (digContext.cleared >= digContext.max) return;
        const block = getBlock(dimension, baseX, baseY + h, baseZ);
        if (isBreakableBlock(block) && isSolidBlock(block)) {
            clearBlock(dimension, baseX, baseY + h, baseZ, digContext, entity);
            return; // Break one block at a time
        }
    }
}

function processContext(ctx, config, tick, leaderSummaryById) {
    const { entity, targetInfo, elevationIntent, role, leaderId } = ctx;
    let ascending = ctx.ascending;
    let extraHeight = ctx.extraHeight;
    const ascendGoal = elevationIntent === "up";
    const descendGoal = elevationIntent === "down";
    if (ascendGoal && extraHeight < 1) {
        extraHeight = 1;
        ascending = true;
    }
    const hasTarget = !!targetInfo;
    const leaderSummary = leaderId ? leaderSummaryById.get(leaderId) : null;
    const followerCount = role === "leader"
        ? (ctx.followers ?? leaderSummary?.followerCount ?? 0)
        : (leaderSummary?.followerCount ?? 0);
    const assistMode = role === "follower" && shouldAssistDigging(entity, leaderSummary);
    const needsPath = needsAccessPath(entity, targetInfo, config.tunnelHeight + extraHeight);
    let planQueue = buildQueues.get(entity.id);
    let hasActivePlan = hasActiveQueue(planQueue);

    if (planQueue && !needsPath) {
        releasePlan(entity.id);
        planQueue = null;
        hasActivePlan = false;
    }

    let planState = null;
    if (needsPath && !hasActivePlan && targetInfo) {
        planState = ensureBuildPlan(entity, targetInfo, config.tunnelHeight + extraHeight, true);
        planQueue = planState;
        hasActivePlan = hasActiveQueue(planQueue);
    } else if (hasActivePlan) {
        planState = planQueue;
    }

    const directionOverride = planQueue?.direction ?? planState?.direction ?? null;
    const buildPriority = hasActivePlan;
    if (buildPriority) {
        dampenHorizontalMotion(entity);
    }
    setBuildMode(entity, buildPriority);
    // Followers should not mine - they just follow the leader's path
    // Only leaders mine to create paths
    const digBudget = (role === "follower") 
        ? 0  // Followers don't mine
        : (buildPriority
            ? BUILD_PRIORITY_BLOCK_BUDGET
            : (hasTarget
                ? MAX_BLOCKS_PER_ENTITY
                : 0));
    const digContext = { cleared: 0, max: digBudget, lastBroken: null };
    
    if (getDebugPitfall() && digBudget > 0) {
        console.warn(`[PITFALL DEBUG] processContext: digBudget=${digBudget} (role=${role}, buildPriority=${buildPriority}, hasTarget=${hasTarget}, MAX_BLOCKS_PER_ENTITY=${MAX_BLOCKS_PER_ENTITY})`);
    }
    
    const startOffset = ascending ? 1 : 0;
    const forwardDepth = buildPriority ? BUILD_FORWARD_DEPTH : (role === "leader" ? LEADER_FORWARD_DEPTH : 1);

    if (role === "leader") {
        const trail = updateLeaderTrailRecord(entity);
        const summary = leaderSummaryById.get(entity.id);
        if (summary) {
            summary.position = { x: entity.location.x, y: entity.location.y, z: entity.location.z };
            summary.trail = trail;
        }
        if (buildPriority && tick % SIDE_CHANNEL_INTERVAL_TICKS === 0) {
            let lateralHint = 0;
            if (targetInfo) {
                const { x: dirX, z: dirZ } = getForwardOffset(entity);
                lateralHint = dirX * targetInfo.vector.z - dirZ * targetInfo.vector.x;
            }
            carveSupportCorridor(entity, config.tunnelHeight + extraHeight, digContext, lateralHint, directionOverride);
        }
    } else if (role === "follower" && leaderSummary) {
        const waypoint = pickTrailWaypoint(leaderSummary.trail, entity) ?? leaderSummary.position;
        followLeader(entity, waypoint);
    }
    
    // Idle behavior: exploration or wandering
    if (!hasTarget) {
        // Check if we should start idle exploration (after IDLE_EXPLORATION_DELAY ticks without target)
        const lastSeen = lastTargetSeenTick.get(entity.id) || tick;
        const ticksSinceTarget = tick - lastSeen;
        
        if (ticksSinceTarget >= IDLE_EXPLORATION_DELAY && digBudget > 0 && role !== "follower") {
            // Create exploratory tunnels
            if (createExploratoryTunnel(entity, config, digContext, tick)) {
                // Tunnel created, continue
            } else {
                // Fall back to normal wandering
                idleWander(entity, tick);
            }
        } else {
            // Normal wandering
            idleWander(entity, tick);
        }
    } else {
        // Update last seen tick when we have a target
        lastTargetSeenTick.set(entity.id, tick);
        // Clear exploration state when we get a target
        idleExplorationState.delete(entity.id);
    }

    // Only mine if we have a target (path creation only when pursuing target)
    // Followers should not mine - they just follow the leader's path
    // IMPORTANT: Only mine if there's no other way to reach the target (can't walk to it)
    if (getDebugMining() && tick % 20 === 0) {
        console.warn(`[MINING AI] Mining decision: digContext.max=${digContext.max}, hasTarget=${hasTarget}, role=${role}, willMine=${(digContext.max > 0 && hasTarget && role !== "follower")}`);
    }
    
    if (digContext.max > 0 && hasTarget && role !== "follower") {
        // Determine strategy for this entity
        const strategy = determineMiningStrategy(entity, targetInfo, tick);
        const strategyData = entityStrategies.get(entity.id);
        const optimalPosition = strategyData?.optimalPosition;
        
        // Check if we can reach the target by walking - if so, don't mine at all
        const canReachByWalking = canReachTargetByWalking(entity, targetInfo, config.tunnelHeight + extraHeight);
        
        // Smart positioning: If strategy is "move_closer" or "hybrid_pitfall", prioritize moving toward optimal position
        const shouldMoveCloser = shouldMoveCloserFirst(entity, targetInfo);
        
        if (getDebugPitfall()) {
            const loc = entity.location;
            const targetLoc = targetInfo?.entity?.location;
            const dy = targetLoc ? (targetLoc.y - loc.y) : 0;
            const dist = targetLoc ? Math.hypot(targetLoc.x - loc.x, targetLoc.z - loc.z) : 0;
            console.warn(`[PITFALL DEBUG] Mining check: entity=${entity.id.substring(0, 8)}, strategy=${strategy}, digBudget=${digContext.max}, canReachByWalking=${canReachByWalking}, shouldMoveCloser=${shouldMoveCloser}, dy=${dy.toFixed(1)}, dist=${dist.toFixed(1)}, hasTarget=${hasTarget}, role=${role}`);
        }
        
        // If we should move closer first, apply movement impulse toward optimal position
        if (shouldMoveCloser && optimalPosition && strategy !== "direct") {
            const loc = entity.location;
            const dx = optimalPosition.x - loc.x;
            const dz = optimalPosition.z - loc.z;
            const dist = Math.hypot(dx, dz);
            
            if (dist > 1) {
                // Move toward optimal position
                const impulse = 0.02;
                try {
                    entity.applyImpulse({
                        x: (dx / dist) * impulse,
                        y: 0,
                        z: (dz / dist) * impulse
                    });
                } catch { }
                
                // Still allow some mining while moving (for tunneling through obstacles)
                // But prioritize movement
            }
        }
        
        // IMPORTANT: Priority is WALKING, not mining
        // Only mine if we CAN'T reach by walking
        // If canReachByWalking is true, don't mine at all - just let them walk
        const loc = entity.location;
        const targetLoc = targetInfo?.entity?.location;
        const dy = targetLoc ? (targetLoc.y - loc.y) : 0;
        const horizontalDist = targetLoc ? Math.hypot(targetLoc.x - loc.x, targetLoc.z - loc.z) : 0;
        
        if (getDebugPitfall() || getDebugMining()) {
            console.warn(`[MINING AI] Mining decision: canReachByWalking=${canReachByWalking}, strategy=${strategy}, dy=${dy.toFixed(1)}, horizontalDist=${horizontalDist.toFixed(1)}`);
        }
        
        // Only mine if we CAN'T reach by walking - prioritize walking over mining
        if (!canReachByWalking) {
            if (getDebugMining()) console.warn(`[MINING AI] NEEDS mining (canReachByWalking=${canReachByWalking}, strategy=${strategy}) - attempting to mine`);
            // Can't reach by walking - mining is needed
            // Determine if we should tunnel down - ONLY if target is SIGNIFICANTLY below (more than 2 blocks)
            // Don't dig down if we're already at or below the target level
            const loc = entity.location;
            const targetLoc = targetInfo?.entity?.location;
            const dy = targetLoc ? (targetLoc.y - loc.y) : 0;
            // Only tunnel down if target is SIGNIFICANTLY below (more than 2 blocks)
            // Don't dig down if we're at or below the target level (dy >= 0 means target is at or above us)
            // This prevents digging down when at or below player level
            const shouldTunnelDown = elevationIntent === "down" && dy < -2 && dy < 0;
            
            if (getDebugMining()) console.warn(`[MINING AI] processContext: role=${role}, hasTarget=${hasTarget}, canReachByWalking=${canReachByWalking}, digBudget=${digBudget}, strategy=${strategy}, shouldTunnelDown=${shouldTunnelDown}, shouldMoveCloser=${shouldMoveCloser}, dy=${dy.toFixed(1)}`);
            
            // Smart mining based on strategy
            // Only do heavy mining if we're close enough OR if strategy requires it
            if (!shouldMoveCloser || strategy === "pitfall" || strategy === "hybrid_pitfall") {
                // IMPORTANT: PRIORITY - Break forward blocks BEFORE digging down
                // Check if there are blocks directly in front blocking movement
                // Reuse loc and targetLoc from above
                const dimension = entity?.dimension;
                const baseX = Math.floor(loc.x);
                const baseY = Math.floor(loc.y);
                const baseZ = Math.floor(loc.z);
                const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
                
                let hasForwardBlock = false;
                if (dimension && (dirX !== 0 || dirZ !== 0)) {
                    // Check if there's a block directly in front blocking movement (first 2 blocks ahead)
                    for (let step = 1; step <= 2; step++) {
                        const forwardX = baseX + dirX * step;
                        const forwardZ = baseZ + dirZ * step;
                        for (let h = 0; h < config.tunnelHeight + extraHeight; h++) {
                            const block = getBlock(dimension, forwardX, baseY + h, forwardZ);
                            if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                                hasForwardBlock = true;
                                break;
                            }
                        }
                        if (hasForwardBlock) break;
                    }
                }
                
                if (getDebugGeneral()) console.warn(`[MINING AI] Block check: hasForwardBlock=${hasForwardBlock}, shouldTunnelDown=${shouldTunnelDown}`);
                
                // ALWAYS try to break forward path first (walls blocking movement)
                // This prevents digging down when blocked by walls
                clearForwardTunnel(entity, config.tunnelHeight, extraHeight + (buildPriority && ascendGoal ? 1 : 0), startOffset, digContext, ascending, forwardDepth, directionOverride, false, targetInfo); // Don't tunnel down in forward tunnel
                if (getDebugGeneral()) console.warn(`[MINING AI] After clearForwardTunnel: cleared=${digContext.cleared}/${digContext.max}`);
                
                // Re-check if forward path is clear after breaking blocks
                let forwardStillBlocked = false;
                if (dimension && (dirX !== 0 || dirZ !== 0) && digContext.cleared < digContext.max) {
                    const forwardX = baseX + dirX;
                    const forwardZ = baseZ + dirZ;
                    for (let h = 0; h < config.tunnelHeight + extraHeight; h++) {
                        const block = getBlock(dimension, forwardX, baseY + h, forwardZ);
                        if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                            forwardStillBlocked = true;
                            break;
                        }
                    }
                }
                
                // ONLY dig down if:
                // 1. Target is actually below (shouldTunnelDown is true)
                // 2. AND forward path is clear (no walls blocking forward movement)
                // This prevents digging down when blocked by walls - always break walls first
                if (shouldTunnelDown && !forwardStillBlocked && !hasForwardBlock) {
                    if (getDebugMining()) console.warn(`[MINING AI] Calling clearVerticalColumn (forward path is clear)`);
                    clearVerticalColumn(entity, config.tunnelHeight, extraHeight, digContext, shouldTunnelDown, targetInfo);
                    if (getDebugMining()) console.warn(`[MINING AI] After clearVerticalColumn: cleared=${digContext.cleared}/${digContext.max}`);
                } else {
                    if (getDebugMining()) console.warn(`[MINING AI] Skipping clearVerticalColumn - forward path blocked (hasForwardBlock=${hasForwardBlock}, forwardStillBlocked=${forwardStillBlocked}, shouldTunnelDown=${shouldTunnelDown})`);
                }
            } else {
                if (getDebugMining()) console.warn(`[MINING AI] Skipping clearVerticalColumn/clearForwardTunnel (shouldMoveCloser=${shouldMoveCloser}, strategy=${strategy})`);
            }
            
            // Cave mining: If in a cave, allow more aggressive mining through cave walls/ceilings
            const inCave = isInCave(entity);
            if (inCave && digContext.cleared < digContext.max) {
                // In cave - allow mining through walls and ceilings more aggressively
                const loc = entity.location;
                const baseX = Math.floor(loc.x);
                const baseY = Math.floor(loc.y);
                const baseZ = Math.floor(loc.z);
                const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
                
                if (dirX !== 0 || dirZ !== 0) {
                    // Check for blocks blocking path in cave
                    for (let step = 1; step <= 2; step++) {
                        if (digContext.cleared >= digContext.max) break;
                        const checkX = baseX + dirX * step;
                        const checkZ = baseZ + dirZ * step;
                        
                        // Check ceiling and walls in cave
                        for (let h = 0; h < config.tunnelHeight + 1; h++) {
                            if (digContext.cleared >= digContext.max) break;
                            const block = getBlock(entity.dimension, checkX, baseY + h, checkZ);
                            if (isBreakableBlock(block) && isSolidBlock(block)) {
                                clearBlock(entity.dimension, checkX, baseY + h, checkZ, digContext, entity, targetInfo);
                                break; // Break one block at a time
                            }
                        }
                    }
                }
            }
            
            if (role === "leader" && targetInfo) {
                if (getDebugGeneral()) console.warn(`[MINING AI] Leader with target: Calling breakBlocksUnderTarget, strategy=${strategy}`);
                
                // Only break walls and branch if not moving closer
                if (!shouldMoveCloser || strategy === "tunnel") {
                    if (getDebugGeneral()) console.warn(`[MINING AI] Calling breakWallAhead and branchTunnel`);
                    breakWallAhead(entity, config.tunnelHeight, digContext, targetInfo, directionOverride);
                    branchTunnel(entity, config.tunnelHeight, digContext, tick, directionOverride);
                    if (getDebugGeneral()) console.warn(`[MINING AI] After breakWallAhead/branchTunnel: cleared=${digContext.cleared}/${digContext.max}`);
                } else {
                    if (getDebugGeneral()) console.warn(`[MINING AI] Skipping breakWallAhead/branchTunnel (shouldMoveCloser=${shouldMoveCloser}, strategy=${strategy})`);
                }
                
                // Ensure path is accessible for smaller bears (maple thralls and tiny MBs can use tunnels)
                // Note: Not sized for huge buff bears
                ensurePathAccessibility(entity, config.tunnelHeight + extraHeight, digContext, directionOverride, tick);
                
                // Break blocks under target for pitfall creation - ONLY when very close and target is clearly above
                // Reduce pitfall priority - focus on getting to target first
                const loc = entity.location;
                const targetLoc = targetInfo.entity.location;
                const horizontalDist = Math.hypot(targetLoc.x - loc.x, targetLoc.z - loc.z);
                const dy = targetLoc.y - loc.y;
                
                if (getDebugPitfall()) console.warn(`[MINING AI] Pitfall check: strategy=${strategy}, horizontalDist=${horizontalDist.toFixed(1)}, dy=${dy.toFixed(1)}, OPTIMAL_ATTACK_DISTANCE=${OPTIMAL_ATTACK_DISTANCE}, shouldMoveCloser=${shouldMoveCloser}`);
                
                // Only create pitfalls when:
                // 1. Very close (within 4 blocks horizontally)
                // 2. Target is significantly above (dy > 3)
                // 3. NOT moving closer (we're in position)
                // 4. Strategy explicitly requires pitfall (not hybrid_pitfall which should prioritize movement)
                if (!shouldMoveCloser && horizontalDist <= 4 && dy > 3 && strategy === "pitfall") {
                    if (getDebugPitfall()) console.warn(`[MINING AI] Calling breakBlocksUnderTarget (pitfall creation)`);
                    breakBlocksUnderTarget(entity, targetInfo, digContext);
                    if (getDebugPitfall()) console.warn(`[MINING AI] After breakBlocksUnderTarget: cleared=${digContext.cleared}/${digContext.max}`);
                } else {
                    if (getDebugPitfall()) console.warn(`[MINING AI] NOT calling breakBlocksUnderTarget (shouldMoveCloser=${shouldMoveCloser}, horizontalDist=${horizontalDist.toFixed(1)}, dy=${dy.toFixed(1)}, strategy=${strategy})`);
                }
            } else {
                if (getDebugPitfall()) {
                    console.warn(`[PITFALL DEBUG] processContext: NOT calling breakBlocksUnderTarget - role=${role}, hasTarget=${!!targetInfo}`);
                }
            }
            // Only carve stairs if we're actually mining (not just moving closer)
            // AND only if there's something actually blocking upward movement
            if ((ascending || ascendGoal) && !shouldMoveCloser && digContext.cleared < digContext.max) {
                if (getDebugGeneral()) console.warn(`[MINING AI] Calling carveStair (ascending=${ascending}, ascendGoal=${ascendGoal}, shouldMoveCloser=${shouldMoveCloser})`);
                carveStair(entity, config.tunnelHeight, digContext, directionOverride, targetInfo);
                if (getDebugGeneral()) console.warn(`[MINING AI] After carveStair: cleared=${digContext.cleared}/${digContext.max}`);
                // Store target position when stairs were created (to allow breaking if target moves)
                if (targetInfo?.entity?.location) {
                    const targetLoc = targetInfo.entity.location;
                    stairCreationTargetPos.set(entity.id, {
                        x: targetLoc.x,
                        y: targetLoc.y,
                        z: targetLoc.z,
                        tick: system.currentTick
                    });
                }
            }
            // Only create ramps down if target is SIGNIFICANTLY below (more than 2 blocks)
            // Don't dig down if we're already at or below the target level
            if (descendGoal && shouldTunnelDown) {
                const loc = entity.location;
                const targetLoc = targetInfo?.entity?.location;
                const dy = targetLoc ? (targetLoc.y - loc.y) : 0;
                // Only create ramps if target is significantly below (more than 2 blocks)
                if (dy < -2) {
                    if (getDebugGeneral()) console.warn(`[MINING AI] Calling carveRampDown (descendGoal=${descendGoal}, shouldTunnelDown=${shouldTunnelDown}, dy=${dy.toFixed(1)})`);
                    carveRampDown(entity, config.tunnelHeight, digContext, directionOverride, targetInfo);
                    if (getDebugGeneral()) console.warn(`[MINING AI] After carveRampDown: cleared=${digContext.cleared}/${digContext.max}`);
                    // Store target position when ramp was created (to allow breaking if target moves)
                    if (targetInfo?.entity?.location) {
                        const targetLoc = targetInfo.entity.location;
                        stairCreationTargetPos.set(entity.id, {
                            x: targetLoc.x,
                            y: targetLoc.y,
                            z: targetLoc.z,
                            tick: system.currentTick
                        });
                    }
                } else {
                    if (getDebugGeneral()) console.warn(`[MINING AI] Skipping carveRampDown - target not significantly below (dy=${dy.toFixed(1)}, need < -2)`);
                }
            }
            if (planState) {
                advanceBuildPlan(entity.id, digContext.lastBroken);
            }
        } else {
            // If canReachByWalking is true, don't mine at all - just let the entity walk/attack normally
            if (canReachByWalking && tick % 40 === 0) {
                if (getDebugPathfinding()) console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can reach target by walking - NOT mining, using entity AI to walk/attack`);
            }
        }
    }

    const rescueContext = digContext.max > 0 ? digContext : { cleared: 0, max: FOLLOWER_BLOCK_BUDGET, lastBroken: digContext.lastBroken };
    liftIfBuried(entity, config.tunnelHeight, rescueContext);
}

// Initialize mining AI with delay to ensure world is ready
let miningAIIntervalId = null;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 10;
const INIT_DELAY_TICKS = 40; // 2 second delay (40 ticks = 2 seconds)
const STARTUP_DEBUG_TICKS = 200; // Log more frequently for first 200 ticks (10 seconds) to debug startup

function initializeMiningAI() {
    // Prevent multiple initializations
    if (miningAIIntervalId !== null) {
        console.warn("[MINING AI] AI loop already initialized, skipping duplicate initialization");
        return;
    }
    
    initializationAttempts++;
    
    // Check if system and world are ready
    if (typeof system?.runInterval !== "function") {
        console.warn(`[MINING AI] System not ready (attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS}), retrying...`);
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            system.runTimeout(() => initializeMiningAI(), INIT_DELAY_TICKS);
        } else {
            console.error("[MINING AI] ERROR: Failed to initialize after max attempts. System.runInterval is not available.");
        }
        return;
    }
    
    // Check if world is ready (try to get players or a dimension)
    try {
        const players = world.getAllPlayers();
        const overworld = world.getDimension("minecraft:overworld");
        if (!overworld) {
            console.warn(`[MINING AI] World not ready (attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS}), retrying...`);
            if (initializationAttempts < MAX_INIT_ATTEMPTS) {
                system.runTimeout(() => initializeMiningAI(), INIT_DELAY_TICKS);
            } else {
                console.error("[MINING AI] ERROR: Failed to initialize after max attempts. World dimensions not available.");
            }
            return;
        }
    } catch (error) {
        console.warn(`[MINING AI] World check failed (attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS}):`, error);
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            system.runTimeout(() => initializeMiningAI(), INIT_DELAY_TICKS);
        } else {
            console.error("[MINING AI] ERROR: Failed to initialize after max attempts.");
        }
        return;
    }
    
    // Everything is ready - start the AI loop
    if (getDebugGeneral()) {
        console.warn(`[MINING AI] Initialization successful (attempt ${initializationAttempts}), starting AI loop...`);
    }
    
    // Capture the initial tick when the AI loop starts
    const aiLoopStartTick = system.currentTick;
    if (getDebugGeneral()) {
        console.warn(`[MINING AI] AI loop starting at world tick ${aiLoopStartTick}`);
    }
    
    // Starting AI loop
    miningAIIntervalId = system.runInterval(() => {
        try {
            const tick = system.currentTick;
            const ticksSinceStart = tick - aiLoopStartTick;
            const isStartupPhase = ticksSinceStart <= STARTUP_DEBUG_TICKS;
            
            // Log very frequently during startup to verify script is running (only if debug enabled)
            if (getDebugGeneral()) {
                if (isStartupPhase && (ticksSinceStart <= 10 || ticksSinceStart % 20 === 0)) {
                    console.warn(`[MINING AI] Script running at world tick ${tick} (${ticksSinceStart} ticks since AI loop start)`);
                } else if (!isStartupPhase && tick % 200 === 0) {
                    console.warn(`[MINING AI] Script running at world tick ${tick}`);
                }
            }
            
            // Note: system.runInterval already handles the interval, so we don't need to check tick % AI_TICK_INTERVAL
            // The interval callback is only called every AI_TICK_INTERVAL ticks automatically
            
            // Log when we actually process AI (only if debug enabled)
            if (getDebugGeneral() && (isStartupPhase || tick % 40 === 0)) {
                console.warn(`[MINING AI] Processing AI at tick ${tick} (${ticksSinceStart} ticks since start, interval: ${AI_TICK_INTERVAL} ticks)`);
            }
    
            // AI processing (runs every AI_TICK_INTERVAL ticks)
            const activeLeaderIdsThisTick = new Set();
            const activeWorkerIds = new Set();
            
            // Performance: Get all players once and cache their positions for distance culling
            const allPlayers = world.getAllPlayers();
            
            // Log player count more frequently during startup (only if debug enabled)
            if (getDebugGeneral() && (isStartupPhase || tick % 40 === 0)) {
                if (allPlayers.length === 0) {
                    console.warn(`[MINING AI] No players found at tick ${tick} (${ticksSinceStart} ticks since start)`);
                } else {
                    console.warn(`[MINING AI] Found ${allPlayers.length} player(s) at tick ${tick} (${ticksSinceStart} ticks since start)`);
                }
            }
    const playerPositions = new Map(); // Map<dimensionId, positions[]>
    for (const player of allPlayers) {
        try {
            const dimId = player.dimension.id;
            // Normalize dimension ID (minecraft:overworld -> overworld, minecraft:nether -> nether, minecraft:the_end -> the_end)
            const normalizedDimId = dimId.replace('minecraft:', '');
            if (!playerPositions.has(normalizedDimId)) {
                playerPositions.set(normalizedDimId, []);
            }
            playerPositions.get(normalizedDimId).push(player.location);
            
            // Player position cached (only log occasionally for debugging)
        } catch (error) {
            console.error(`[MINING AI] Error processing player:`, error);
        }
    }
    
    // Player positions cached (only log if no players for debugging)

    // Process all dimensions
    for (const dimId of DIMENSION_IDS) {
        let dimension;
        try {
            dimension = world.getDimension(dimId);
        } catch (error) {
            console.error(`[MINING AI] Error getting dimension ${dimId}:`, error);
            continue;
        }
        if (!dimension) continue;

        // Process each mining bear type
        for (const config of MINING_BEAR_TYPES) {
            let entities;
            try {
                entities = dimension.getEntities({ type: config.id });
            } catch (error) {
                console.error(`[MINING AI] Error getting entities for ${config.id}:`, error);
                continue;
            }
            // Log entity discovery (more frequently during startup) - only if debug enabled
            if (!entities || entities.length === 0) {
                if (getDebugGeneral() && isStartupPhase && ticksSinceStart % 40 === 0) {
                    console.warn(`[MINING AI] No ${config.id} entities found in ${dimId} at tick ${tick}`);
                }
                continue;
            }
            
            if (getDebugGeneral() && (isStartupPhase || tick % 40 === 0)) {
                console.warn(`[MINING AI] Found ${entities.length} ${config.id} entities in ${dimId} at tick ${tick}`);
            }
            
            // Performance: Distance-based culling - only process entities near players
            // Check both normalized and full dimension ID
            const dimPlayerPositions = playerPositions.get(dimId) || playerPositions.get(`minecraft:${dimId}`) || [];
            if (dimPlayerPositions.length === 0) {
                if (getDebugGeneral() && (isStartupPhase || tick % 40 === 0)) {
                    console.warn(`[MINING AI] No players in ${dimId} (checked: ${dimId} and minecraft:${dimId}), available: ${Array.from(playerPositions.keys()).join(', ')}, skipping`);
                }
                continue; // No players in this dimension, skip
            }
            
            if (getDebugGeneral() && (isStartupPhase || tick % 40 === 0)) {
                console.warn(`[MINING AI] Found ${dimPlayerPositions.length} player positions in ${dimId}`);
            }
            
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
                // Log more frequently during startup or occasionally (only if debug enabled)
                if (getDebugGeneral()) {
                    const isStartup = tick <= STARTUP_DEBUG_TICKS;
                    if (isStartup || tick % 40 === 0) {
                        console.warn(`[MINING AI] No valid entities within range for ${config.id} in ${dimId} (checked ${entities.length} entities)`);
                    }
                }
                continue;
            }
            
            // Log when we find entities (more frequently during startup) - only if debug enabled
            if (getDebugGeneral()) {
                const isStartup = tick <= STARTUP_DEBUG_TICKS;
                if (isStartup || tick % 40 === 0) {
                    console.warn(`[MINING AI] Processing ${validEntities.length} ${config.id} entities in ${dimId}`);
                }
            }
            
            const contexts = [];

            for (const entity of validEntities) {
                activeWorkerIds.add(entity.id);
                
                // Performance: Use cached target lookup (only refreshes every TARGET_CACHE_TICKS)
                const liveTarget = findNearestTarget(entity, TARGET_SCAN_RADIUS, true);
                if (liveTarget) {
                    updateLastKnownTarget(entity, liveTarget);
                }
                const storedTarget = getStoredTargetInfo(entity);
                const targetInfo = liveTarget || storedTarget;
                
                // Log target detection when debug is enabled
                if (getDebugTarget() && tick % 20 === 0) {
                    console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)}: liveTarget=${!!liveTarget}, storedTarget=${!!storedTarget}, hasTarget=${!!targetInfo}`);
                    if (targetInfo && targetInfo.entity?.location) {
                        const loc = entity.location;
                        const targetLoc = targetInfo.entity.location;
                        const dy = targetLoc.y - loc.y;
                        const dist = Math.hypot(targetLoc.x - loc.x, targetLoc.z - loc.z);
                        console.warn(`[MINING AI] Target info: dist=${dist.toFixed(1)}, dy=${dy.toFixed(1)}, targetType=${targetInfo.entity?.typeId || 'unknown'}`);
                    } else if (!targetInfo) {
                        console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)}: NO TARGET FOUND!`);
                    }
                }
                
                const elevationIntent = getElevationIntent(entity, targetInfo);
                const ascending = elevationIntent === "up" ? true : isAscending(entity);
                contexts.push({
                    entity,
                    targetInfo,
                    ascending,
                    extraHeight: ascending ? 1 : 0,
                    role: null,
                    leaderId: null,
                    elevationIntent,
                    followers: 0
                });
            }

            if (contexts.length === 0) continue;

            const targetBuckets = new Map();
            for (const ctx of contexts) {
                const key = ctx.targetInfo?.entity?.id ?? null;
                if (!targetBuckets.has(key)) {
                    targetBuckets.set(key, []);
                }
                targetBuckets.get(key).push(ctx);
            }

            const leaderSummaryById = new Map();

            for (const [targetId, bucket] of targetBuckets.entries()) {
                if (!targetId) continue;
                bucket.sort((a, b) => (a.targetInfo?.distanceSq ?? Infinity) - (b.targetInfo?.distanceSq ?? Infinity));
                const leaderCtx = bucket[0];
                leaderCtx.role = "leader";
                leaderCtx.leaderId = leaderCtx.entity.id;
                leaderCtx.followers = 0;
                const summary = {
                    id: leaderCtx.entity.id,
                    targetId,
                    position: { x: leaderCtx.entity.location.x, y: leaderCtx.entity.location.y, z: leaderCtx.entity.location.z },
                    trail: getLeaderTrailRecord(leaderCtx.entity.id),
                    followerCount: 0
                };
                leaderSummaryById.set(summary.id, summary);
                activeLeaderIdsThisTick.add(summary.id);

                for (let i = 1; i < bucket.length; i++) {
                    const followerCtx = bucket[i];
                    const distSq = distanceSq(followerCtx.entity.location, leaderCtx.entity.location);
                    if (distSq <= FOLLOWER_ASSIGN_RADIUS_SQ) {
                        followerCtx.role = "follower";
                        followerCtx.leaderId = summary.id;
                        summary.followerCount += 1;
                        leaderCtx.followers += 1;
                    }
                }
            }

            const leaderQueue = [];
            const followerQueue = [];
            const idleQueue = [];

            for (const ctx of contexts) {
                // Check if should enter passive wandering (2 minutes without seeing target)
                const lastSeen = lastSeenTargetTick.get(ctx.entity.id) || 0;
                const timeSinceSeen = tick - lastSeen;
                if (timeSinceSeen > PASSIVE_WANDER_TICKS && !ctx.targetInfo) {
                    // Force passive wandering - clear stored target
                    lastKnownTargets.delete(ctx.entity.id);
                    lastSeenTargetTick.delete(ctx.entity.id);
                    ctx.targetInfo = null;
                }
                
                if (ctx.role === "leader") {
                    leaderQueue.push(ctx);
                } else if (ctx.role === "follower") {
                    followerQueue.push(ctx);
                } else {
                    idleQueue.push(ctx);
                }
            }

            // Get dynamic mining interval based on current day
            const miningInterval = getMiningInterval();
            
            if (getDebugPitfall() && leaderQueue.length > 0 && tick % 20 === 0) {
                console.warn(`[PITFALL DEBUG] ${leaderQueue.length} leaders in queue, miningInterval=${miningInterval}`);
            }
            
            for (const ctx of leaderQueue) {
                // Check if enough time has passed since last mining action for this entity
                const lastTick = lastMiningTick.get(ctx.entity.id) || 0;
                const ticksSinceLastMining = tick - lastTick;
                if (ticksSinceLastMining >= miningInterval) {
                    if (DEBUG_PITFALL && tick % 20 === 0) {
                        console.warn(`[PITFALL DEBUG] Processing leader ${ctx.entity.id.substring(0, 8)}, hasTarget=${!!ctx.targetInfo}, role=${ctx.role}`);
                    }
                    processContext(ctx, config, tick, leaderSummaryById);
                    lastMiningTick.set(ctx.entity.id, tick);
                } else if (DEBUG_PITFALL && tick % 40 === 0) {
                    console.warn(`[PITFALL DEBUG] Leader ${ctx.entity.id.substring(0, 8)} waiting: ${ticksSinceLastMining}/${miningInterval} ticks`);
                }
            }
            for (const ctx of followerQueue) {
                // Check if enough time has passed since last mining action for this entity
                const lastTick = lastMiningTick.get(ctx.entity.id) || 0;
                if (tick - lastTick >= miningInterval) {
                    processContext(ctx, config, tick, leaderSummaryById);
                    lastMiningTick.set(ctx.entity.id, tick);
                }
            }
            for (const ctx of idleQueue) {
                // Idle bears without targets - they remain stationary and scan
                // No random wandering, more purposeful behavior
                // Still process to allow target scanning, but less frequently
                const lastTick = lastMiningTick.get(ctx.entity.id) || 0;
                if (tick - lastTick >= miningInterval * 2) {
                    processContext(ctx, config, tick, leaderSummaryById);
                    lastMiningTick.set(ctx.entity.id, tick);
                }
            }
        }
    }

    cleanupLeaderTrails(activeLeaderIdsThisTick);
    for (const entityId of Array.from(buildQueues.keys())) {
        if (!activeWorkerIds.has(entityId)) {
            releasePlan(entityId);
        }
    }
    for (const [entityId, entry] of lastKnownTargets.entries()) {
        if (!activeWorkerIds.has(entityId) && system.currentTick - entry.tick > TARGET_MEMORY_TICKS) {
            lastKnownTargets.delete(entityId);
            lastSeenTargetTick.delete(entityId);
        }
    }
    for (const [entityId] of lastSeenTargetTick.entries()) {
        if (!activeWorkerIds.has(entityId)) {
            lastSeenTargetTick.delete(entityId);
        }
    }
    for (const [entityId] of lastMiningTick.entries()) {
        if (!activeWorkerIds.has(entityId)) {
            lastMiningTick.delete(entityId);
        }
    }
    for (const entityId of Array.from(buildModeState.keys())) {
        if (!activeWorkerIds.has(entityId)) {
            buildModeState.delete(entityId);
        }
    }
    for (const entityId of Array.from(collectedBlocks.keys())) {
        if (!activeWorkerIds.has(entityId)) {
            collectedBlocks.delete(entityId);
        }
    }
    
    // Performance: Clean up target cache for inactive entities
    for (const [entityId] of targetCache.entries()) {
        if (!activeWorkerIds.has(entityId)) {
            targetCache.delete(entityId);
        }
    }
    
    // Clean up old stair work locks (expired or from inactive entities)
    const currentTick = system.currentTick;
    for (const [blockKey, work] of activeStairWork.entries()) {
        const ticksSinceWork = currentTick - work.tick;
        if (!activeWorkerIds.has(work.entityId) || ticksSinceWork >= STAIR_WORK_LOCK_TICKS * 3) {
            // Remove if entity is inactive or lock expired long ago (3x lock duration)
            activeStairWork.delete(blockKey);
        }
    }
    
    // Clean up stair creation target positions for inactive entities
    for (const [entityId] of stairCreationTargetPos.entries()) {
        if (!activeWorkerIds.has(entityId)) {
            stairCreationTargetPos.delete(entityId);
        }
    }
    
    // Clean up old stair block protections (older than 10 seconds / 200 ticks)
    for (const [blockKey, tick] of recentStairBlocks.entries()) {
        if (currentTick - tick > 200) {
            recentStairBlocks.delete(blockKey);
        }
    }
        } catch (error) {
            // Log errors to help debug
            console.error(`[MINING AI] ERROR in runInterval at tick ${system.currentTick}:`, error);
            console.error(`[MINING AI] Error stack:`, error.stack);
        }
    }, AI_TICK_INTERVAL); // Run every AI_TICK_INTERVAL ticks (reduced frequency for performance)
    
    if (miningAIIntervalId !== null) {
        if (getDebugGeneral()) {
            console.warn(`[MINING AI] AI loop started successfully with interval ${AI_TICK_INTERVAL} ticks`);
        }
    } else {
        console.error("[MINING AI] ERROR: Failed to start AI loop interval");
    }
}

// Start initialization with a delay to ensure world is ready
if (getDebugGeneral()) {
    console.warn("[MINING AI] Script loaded, starting delayed initialization...");
}
system.runTimeout(() => {
    initializeMiningAI();
}, INIT_DELAY_TICKS);
