import { system, world, ItemStack } from "@minecraft/server";
import { UNBREAKABLE_BLOCKS } from "./mb_miningBlockList.js";
import { getCurrentDay } from "./mb_dayTracker.js";

const DIMENSION_IDS = ["overworld", "nether", "the_end"];
const MINING_BEAR_TYPES = [
    { id: "mb:mining_mb", tunnelHeight: 2 },
    { id: "mb:mining_mb_day20", tunnelHeight: 3 }
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
const TARGET_MEMORY_TICKS = 400;
const MAX_PLAN_STEPS = 64;
const PASSIVE_WANDER_TICKS = 2400; // 2 minutes without seeing target = passive wandering

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

const leaderTrails = new Map();

// Track collected blocks per mining bear entity
export const collectedBlocks = new Map(); // Map<entityId, Map<itemTypeId, count>>

// Track recently created stairs/ramps to prevent breaking them (counter-productive)
const recentStairBlocks = new Map(); // Map<"x,y,z", tick> - blocks that are part of stairs/ramps

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

function clearBlock(dimension, x, y, z, digContext, entity = null) {
    if (digContext && digContext.cleared >= digContext.max) return false;
    const block = getBlock(dimension, x, y, z);
    if (!isBreakableBlock(block)) return false;
    
    // Don't break blocks that are part of recently created stairs/ramps (counter-productive)
    const blockKey = `${x},${y},${z}`;
    const currentTick = system.currentTick;
    const stairTick = recentStairBlocks.get(blockKey);
    if (stairTick !== undefined && (currentTick - stairTick) < 200) { // Protect for 10 seconds (200 ticks)
        return false; // This is a stair/ramp block, don't break it
    }
    
    const originalType = block.typeId;
    try {
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
        return true;
    } catch (error) {
        console.warn(`[MBI] Mining bear failed to clear ${block?.typeId} at ${x},${y},${z}:`, error);
        return false;
    }
}

function clearVerticalColumn(entity, tunnelHeight, extraHeight, digContext, shouldTunnelDown = false) {
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
            clearBlock(dimension, x, startY - 1, z, digContext, entity);
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
    if (system.currentTick - entry.tick > TARGET_MEMORY_TICKS) {
        lastKnownTargets.delete(entity.id);
        return null;
    }
    const loc = entity.location;
    const vector = {
        x: entry.position.x - loc.x,
        y: entry.position.y - loc.y,
        z: entry.position.z - loc.z
    };
    return {
        entity: {
            id: entry.targetId ?? `memory-${entity.id}`,
            location: entry.position
        },
        vector,
        distanceSq: vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
    };
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
    if (distance <= 3.5) {
        return true; // Close enough to attack, no mining needed
    }
    
    // Check if there's a walkable path to the target
    // Sample points along the path to see if it's clear
    const steps = Math.ceil(distance);
    const stepX = dx / steps;
    const stepY = dy / steps;
    const stepZ = dz / steps;
    
    let blockedCount = 0;
    const maxBlockedSteps = Math.max(2, Math.floor(steps * 0.3)); // Allow up to 30% of path to be blocked
    
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
                    isBlocked = true;
                    break;
                }
            } catch {
                isBlocked = true;
                break;
            }
        }
        
        // Check if there's a floor to walk on (unless we're going down)
        if (!isBlocked && dy >= -1) { // Only check floor if not going significantly down
            try {
                const floorBlock = dimension.getBlock({ x: checkX, y: checkY - 1, z: checkZ });
                if (!floorBlock || AIR_BLOCKS.has(floorBlock.typeId)) {
                    // No floor - but this might be okay if we can jump or if it's a small gap
                    // Only count as blocked if it's a significant gap
                    if (i > 1) { // Don't count first step as blocked (might be jumping)
                        isBlocked = true;
                    }
                }
            } catch {
                // Error checking floor, assume blocked
                isBlocked = true;
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
    // Allow walking if less than 30% of path is blocked
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

function clearForwardTunnel(entity, tunnelHeight, extraHeight, startOffset, digContext, ascending, depth = 1, directionOverride = null, shouldTunnelDown = false) {
    const dimension = entity?.dimension;
    if (!dimension) return;

    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);

    if (dirX === 0 && dirZ === 0) return;

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
        for (let h = start; h < height + 1; h++) { // +1 to break one block above tunnel height
            if (digContext.cleared >= digContext.max) return;
            const targetY = baseY + h;
            const block = getBlock(dimension, targetX, targetY, targetZ);
            // Only break if it's actually blocking the path
            if (isBreakableBlock(block) && isSolidBlock(block)) {
                clearBlock(dimension, targetX, targetY, targetZ, digContext, entity);
                return;
            }
        }
        
        // Break block below ONLY if tunneling down (target is below)
        // Do NOT break below just because floor is blocked - only when actually descending
        if (shouldTunnelDown) {
            const floorBlock = getBlock(dimension, targetX, baseY - 1, targetZ);
            // Only break if it's a solid block that would block movement
            if (floorBlock && isBreakableBlock(floorBlock) && !AIR_BLOCKS.has(floorBlock.typeId)) {
                if (digContext.cleared >= digContext.max) return;
                clearBlock(dimension, targetX, baseY - 1, targetZ, digContext, entity);
                return;
            }
        }
    }
}

function carveStair(entity, tunnelHeight, digContext, directionOverride = null) {
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
    // Remove the block on top of the step to create headroom.
    for (let h = 0; h < tunnelHeight; h++) {
        if (digContext.cleared >= digContext.max) return;
        const targetY = baseY + 1 + h;
        const block = getBlock(dimension, stepX, targetY, stepZ);
        if (!isBreakableBlock(block)) continue;
        clearBlock(dimension, stepX, targetY, stepZ, digContext, entity);
        return;
    }

    // Ensure landing area beyond the step is clear.
    const landingX = stepX + dirX;
    const landingZ = stepZ + dirZ;
    for (let h = 0; h < tunnelHeight; h++) {
        if (digContext.cleared >= digContext.max) return;
        const targetY = baseY + 1 + h;
        const block = getBlock(dimension, landingX, targetY, landingZ);
        if (!isBreakableBlock(block)) continue;
        clearBlock(dimension, landingX, targetY, landingZ, digContext, entity);
        return;
    }
    
    // Mark the step location as a stair block (protect it from being broken)
    const currentTick = system.currentTick;
    recentStairBlocks.set(`${stepX},${baseY},${stepZ}`, currentTick);
    recentStairBlocks.set(`${landingX},${baseY + 1},${landingZ}`, currentTick);
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

function carveRampDown(entity, tunnelHeight, digContext, directionOverride = null) {
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
function breakBlocksUnderTarget(entity, targetInfo, digContext) {
    if (!targetInfo || !digContext || digContext.cleared >= digContext.max) return;
    const dimension = entity?.dimension;
    if (!dimension) return;
    
    const targetLoc = targetInfo.entity?.location;
    if (!targetLoc) return;
    
    const loc = entity.location;
    const dx = targetLoc.x - loc.x;
    const dy = targetLoc.y - loc.y;
    const dz = targetLoc.z - loc.z;
    const distance = Math.hypot(dx, dz);
    
    // Only break blocks under target if:
    // 1. Target is above us (elevation intent is "up")
    // 2. We're close enough (within 6 blocks horizontally)
    // 3. Target is significantly above us (at least 2 blocks)
    const elevationIntent = getElevationIntent(entity, targetInfo);
    if (elevationIntent !== "up") return; // Target not above us
    if (distance > 6) return; // Too far away - come closer first
    if (dy < 2) return; // Target not high enough above us
    
    // Break blocks directly under the target to collapse the pillar
    const targetX = Math.floor(targetLoc.x);
    const targetY = Math.floor(targetLoc.y);
    const targetZ = Math.floor(targetLoc.z);
    
    // Break blocks from the target's feet down to ground level (or a few blocks below)
    const startY = targetY - 1; // Start at the block under the target's feet
    const endY = Math.max(targetY - 5, Math.floor(loc.y) - 2); // Break down to a reasonable depth
    
    for (let y = startY; y >= endY; y--) {
        if (digContext.cleared >= digContext.max) return;
        const block = getBlock(dimension, targetX, y, targetZ);
        if (isBreakableBlock(block)) {
            clearBlock(dimension, targetX, y, targetZ, digContext, entity);
            return; // Break one block at a time
        }
    }
}

function findNearestTarget(entity, maxDistance = TARGET_SCAN_RADIUS) {
    const dimension = entity?.dimension;
    if (!dimension) return null;
    const origin = entity.location;
    const maxDistSq = maxDistance * maxDistance;
    let best = null;
    let bestDistSq = maxDistSq;

    // Prioritize players (with see-through vision)
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
        if (distSq < bestDistSq) {
            // Heat-seeking: Check if we can see this target through blocks (up to 3 blocks)
            const targetInfo = {
                entity: player,
                distanceSq: distSq,
                vector: { x: dx, y: dy, z: dz }
            };
            // Allow targeting through up to 3 breakable blocks (heat-seeking vision)
            if (canSeeTargetThroughBlocks(entity, targetInfo, 3) || !best) {
                best = player;
                bestDistSq = distSq;
            }
        }
    }

    // Also target mobs if no players nearby (with see-through vision)
    if (!best) {
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

    if (!best) return null;
    return {
        entity: best,
        distanceSq: bestDistSq,
        vector: {
            x: best.location.x - origin.x,
            y: best.location.y - origin.y,
            z: best.location.z - origin.z
        }
    };
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
            clearBlock(dimension, targetX, targetY, targetZ, digContext, entity);
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
    
    // Idle wandering when no target
    if (!hasTarget) {
        idleWander(entity, tick);
    }

    // Only mine if we have a target (path creation only when pursuing target)
    // Followers should not mine - they just follow the leader's path
    // IMPORTANT: Only mine if there's no other way to reach the target (can't walk to it)
    if (digContext.max > 0 && hasTarget && role !== "follower") {
        // Check if we can reach the target by walking - if so, don't mine at all
        const canReachByWalking = canReachTargetByWalking(entity, targetInfo, config.tunnelHeight + extraHeight);
        
        if (!canReachByWalking) {
            // Can't reach by walking - mining is needed
            // Determine if we should tunnel down - ONLY if target is actually below us
            const shouldTunnelDown = elevationIntent === "down";
            
            // Only break blocks below if target is below (not just because we have budget)
            clearVerticalColumn(entity, config.tunnelHeight, extraHeight, digContext, shouldTunnelDown);
            clearForwardTunnel(entity, config.tunnelHeight, extraHeight + (buildPriority && ascendGoal ? 1 : 0), startOffset, digContext, ascending, forwardDepth, directionOverride, shouldTunnelDown);
            if (role === "leader" && targetInfo) {
                breakWallAhead(entity, config.tunnelHeight, digContext, targetInfo, directionOverride);
                branchTunnel(entity, config.tunnelHeight, digContext, tick, directionOverride);
                // Break blocks under elevated targets (like pillars) when close enough
                breakBlocksUnderTarget(entity, targetInfo, digContext);
            }
            if (ascending || ascendGoal) {
                carveStair(entity, config.tunnelHeight, digContext, directionOverride);
            }
            // Only create ramps down if target is actually below
            if (descendGoal && shouldTunnelDown) {
                carveRampDown(entity, config.tunnelHeight, digContext, directionOverride);
            }
            if (planState) {
                advanceBuildPlan(entity.id, digContext.lastBroken);
            }
        }
        // If canReachByWalking is true, don't mine at all - just let the entity walk/attack normally
    }

    const rescueContext = digContext.max > 0 ? digContext : { cleared: 0, max: FOLLOWER_BLOCK_BUDGET, lastBroken: digContext.lastBroken };
    liftIfBuried(entity, config.tunnelHeight, rescueContext);
}

system.runInterval(() => {
    const tick = system.currentTick;
    const activeLeaderIdsThisTick = new Set();
    const activeWorkerIds = new Set();

    for (const dimId of DIMENSION_IDS) {
        let dimension;
        try {
            dimension = world.getDimension(dimId);
        } catch {
            continue;
        }
        if (!dimension) continue;

        for (const config of MINING_BEAR_TYPES) {
            let entities;
            try {
                entities = dimension.getEntities({ type: config.id });
            } catch {
                continue;
            }
            if (!entities || entities.length === 0) continue;

            const contexts = [];

            for (const entity of entities) {
                if (typeof entity?.isValid === "function" && !entity.isValid()) continue;
                activeWorkerIds.add(entity.id);
                
                const liveTarget = findNearestTarget(entity);
                if (liveTarget) {
                    updateLastKnownTarget(entity, liveTarget);
                }
                const storedTarget = getStoredTargetInfo(entity);
                const targetInfo = liveTarget || storedTarget;
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
            
            for (const ctx of leaderQueue) {
                // Check if enough time has passed since last mining action for this entity
                const lastTick = lastMiningTick.get(ctx.entity.id) || 0;
                if (tick - lastTick >= miningInterval) {
                    processContext(ctx, config, tick, leaderSummaryById);
                    lastMiningTick.set(ctx.entity.id, tick);
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
    
    // Clean up old stair block protections (older than 10 seconds / 200 ticks)
    const currentTick = system.currentTick;
    for (const [blockKey, tick] of recentStairBlocks.entries()) {
        if (currentTick - tick > 200) {
            recentStairBlocks.delete(blockKey);
        }
    }
}, 1); // Run every tick, but only process mining when interval has passed


