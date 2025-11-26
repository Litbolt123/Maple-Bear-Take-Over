import { system, world } from "@minecraft/server";
import { MINING_BREAKABLE_BLOCK_SET } from "./mb_miningBlockList.js";
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

const BREAKABLE_BLOCKS = MINING_BREAKABLE_BLOCK_SET;
// Mining speed: starts at iron pickaxe speed (4 ticks) at day 15, increases to efficiency 5 diamond (1 tick) by day 25
function getMiningInterval() {
    const currentDay = getCurrentDay();
    if (currentDay < 15) return 4; // Iron pickaxe speed
    if (currentDay >= 25) return 1; // Efficiency 5 diamond pickaxe speed
    // Linear progression: 4 ticks at day 15, 1 tick at day 25
    // Formula: 4 - 0.3 * (day - 15)
    const interval = Math.max(1, Math.floor(4 - 0.3 * (currentDay - 15)));
    return interval;
}
const MAX_BLOCKS_PER_ENTITY = 3;
const FOLLOWER_BLOCK_BUDGET = 1;
const FOLLOWER_ASSIST_BLOCK_BUDGET = 1;
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
    return !!id && !AIR_BLOCKS.has(id) && BREAKABLE_BLOCKS.has(id);
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

function clearBlock(dimension, x, y, z, digContext) {
    if (digContext && digContext.cleared >= digContext.max) return false;
    const block = getBlock(dimension, x, y, z);
    if (!isBreakableBlock(block)) return false;
    const originalType = block.typeId;
    try {
        block.setType("minecraft:air");
        playBreakSound(dimension, x, y, z, originalType);
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

function clearVerticalColumn(entity, tunnelHeight, extraHeight, digContext) {
    const dimension = entity?.dimension;
    if (!dimension) return;
    const loc = entity.location;
    const x = Math.floor(loc.x);
    const z = Math.floor(loc.z);
    const startY = Math.floor(loc.y);
    const height = tunnelHeight + extraHeight;
    
    // Break blocks above (for headroom)
    for (let h = 1; h < height + 1; h++) { // +1 to break one block above tunnel height
        if (digContext.cleared >= digContext.max) return;
        clearBlock(dimension, x, startY + h, z, digContext);
    }
    
    // Also break blocks below (for clearing floor obstacles)
    for (let h = -1; h >= -2; h--) {
        if (digContext.cleared >= digContext.max) return;
        clearBlock(dimension, x, startY + h, z, digContext);
    }
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

function needsAccessPath(entity, targetInfo, tunnelHeight, directionOverride = null) {
    if (!targetInfo) return false;
    const dimension = entity?.dimension;
    if (!dimension) return false;
    const targetY = targetInfo.entity?.location?.y;
    
    // More strict elevation check - only need path if significant height difference
    if (typeof targetY === "number") {
        const delta = targetY - entity.location.y;
        // Only consider path needed if elevation difference is significant (more than 2 blocks)
        if (Math.abs(delta) > 2.0) {
            return true;
        }
    }
    
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    if (dirX === 0 && dirZ === 0) return false;

    // Check if there's a clear path forward (less strict - allow attacking through thin walls)
    // Only mine if path is completely blocked for multiple steps
    let blockedSteps = 0;
    for (let step = 1; step <= ACCESS_CHECK_STEPS; step++) {
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
        
        // Check if floor is missing
        const floorBlock = getBlock(dimension, x, baseY - 1, z);
        if (!floorBlock || AIR_BLOCKS.has(floorBlock.typeId)) {
            isBlocked = true;
        }
        
        if (isBlocked) {
            blockedSteps++;
        } else {
            // Found a clear path - no need to mine
            return false;
        }
    }
    
    // Only return true if path is blocked for most steps (encourages attacking when possible)
    return blockedSteps >= 3;
}

function dampenHorizontalMotion(entity) {
    try {
        const vel = entity.getVelocity?.();
        if (!vel) return;
        entity.applyImpulse({ x: -vel.x * 0.4, y: 0, z: -vel.z * 0.4 });
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

function clearForwardTunnel(entity, tunnelHeight, extraHeight, startOffset, digContext, ascending, depth = 1, directionOverride = null) {
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

        // Break blocks above (for clearing headroom)
        for (let h = start; h < height + 1; h++) { // +1 to break one block above tunnel height
            if (digContext.cleared >= digContext.max) return;
            const targetY = baseY + h;
            const block = getBlock(dimension, targetX, targetY, targetZ);
            if (!isBreakableBlock(block)) continue;
            clearBlock(dimension, targetX, targetY, targetZ, digContext);
            return;
        }
        
        // Also break blocks below (for clearing floor obstacles)
        for (let h = -1; h >= -2; h--) {
            if (digContext.cleared >= digContext.max) return;
            const targetY = baseY + h;
            const block = getBlock(dimension, targetX, targetY, targetZ);
            if (!isBreakableBlock(block)) continue;
            clearBlock(dimension, targetX, targetY, targetZ, digContext);
            return;
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
        clearBlock(dimension, stepX, targetY, stepZ, digContext);
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
        clearBlock(dimension, landingX, targetY, landingZ, digContext);
        return;
    }
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
            clearBlock(dimension, offsetX, baseY + h, offsetZ, digContext);
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
        clearBlock(dimension, stepX, baseY + h, stepZ, digContext);
        return;
    }

    // Remove step floor and create a slot below
    if (digContext.cleared < digContext.max) {
        const block = getBlock(dimension, stepX, baseY, stepZ);
        if (isBreakableBlock(block)) {
            clearBlock(dimension, stepX, baseY, stepZ, digContext);
            return;
        }
    }
    if (digContext.cleared < digContext.max) {
        const block = getBlock(dimension, stepX, baseY - 1, stepZ);
        if (isBreakableBlock(block)) {
            clearBlock(dimension, stepX, baseY - 1, stepZ, digContext);
            return;
        }
    }

    // Prepare landing one block lower
    for (let h = 0; h < tunnelHeight; h++) {
        if (digContext.cleared >= digContext.max) return;
        const block = getBlock(dimension, landingX, baseY - 1 + h, landingZ);
        if (!isBreakableBlock(block)) continue;
        clearBlock(dimension, landingX, baseY - 1 + h, landingZ, digContext);
        return;
    }
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
        clearBlock(dimension, branchX, baseY + h, branchZ, digContext);
        return;
    }
}

function findNearestTarget(entity, maxDistance = TARGET_SCAN_RADIUS) {
    const dimension = entity?.dimension;
    if (!dimension) return null;
    const origin = entity.location;
    const maxDistSq = maxDistance * maxDistance;
    let best = null;
    let bestDistSq = maxDistSq;

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
            best = player;
            bestDistSq = distSq;
        }
    }

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
            best = mob;
            bestDistSq = distSq;
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
    if (dot < 0.35) return;

    for (let depth = 2; depth <= WALL_SCAN_DEPTH + 1; depth++) {
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
            clearBlock(dimension, targetX, targetY, targetZ, digContext);
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

    for (let i = 0; i < LIFT_ITERATIONS; i++) {
        const headBlock = getBlock(dimension, x, headY, z);
        if (!isBreakableBlock(headBlock)) break;
        if (digContext.cleared >= digContext.max) break;
        clearBlock(dimension, x, headY, z, digContext);
    }

    const headBlock2 = getBlock(dimension, x, headY, z);
    const feetBlock = getBlock(dimension, x, feetY - 1, z);
    if (!isBreakableBlock(headBlock2) && (!feetBlock || AIR_BLOCKS.has(feetBlock?.typeId))) {
        const motion = entity.getVelocity?.();
        const vy = motion?.y ?? 0;
        if (vy < RAISE_THRESHOLD) {
            try {
                const newY = Math.ceil(loc.y + 0.5);
                entity.teleport({ x: loc.x, y: newY, z: loc.z }, dimension);
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
    const impulse = FOLLOWER_IMPULSE;
    entity.applyImpulse({
        x: (dx / dist) * impulse,
        y: 0,
        z: (dz / dist) * impulse
    });
}

function idleWander(entity, tick) {
    // Removed random wandering - mining bears should be more purposeful
    // Instead, they will remain stationary and scan for targets periodically
    // This makes their actions more intentional and less chaotic
    return;
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
    const digBudget = buildPriority
        ? BUILD_PRIORITY_BLOCK_BUDGET
        : (hasTarget
            ? (role === "leader" ? MAX_BLOCKS_PER_ENTITY : (assistMode ? FOLLOWER_ASSIST_BLOCK_BUDGET : FOLLOWER_BLOCK_BUDGET))
            : 0);
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
    // Removed idleWander - mining bears without targets remain stationary
    // They will continue scanning for targets through findNearestTarget

    if (digContext.max > 0) {
        clearVerticalColumn(entity, config.tunnelHeight, extraHeight, digContext);
        clearForwardTunnel(entity, config.tunnelHeight, extraHeight + (buildPriority && ascendGoal ? 1 : 0), startOffset, digContext, ascending, forwardDepth, directionOverride);
        if (role === "leader" && targetInfo) {
            breakWallAhead(entity, config.tunnelHeight, digContext, targetInfo, directionOverride);
            branchTunnel(entity, config.tunnelHeight, digContext, tick, directionOverride);
        }
        if (ascending || ascendGoal) {
            carveStair(entity, config.tunnelHeight, digContext, directionOverride);
        }
        if (descendGoal && buildPriority) {
            carveRampDown(entity, config.tunnelHeight, digContext, directionOverride);
        }
        if (planState) {
            advanceBuildPlan(entity.id, digContext.lastBroken);
        }
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
}, 1); // Run every tick, but only process mining when interval has passed


