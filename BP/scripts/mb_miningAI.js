import { system, world, ItemStack } from "@minecraft/server";
import { UNBREAKABLE_BLOCKS } from "./mb_miningBlockList.js";
import { getCurrentDay } from "./mb_dayTracker.js";
import { isDebugEnabled } from "./mb_codex.js";
import { getCachedPlayers, getCachedPlayerPositions, getCachedMobs } from "./mb_sharedCache.js";

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

// Blocks that entities can walk through (non-solid blocks)
// These should not block pathfinding - entities can walk through them
const WALKABLE_THROUGH_BLOCKS = new Set([
    // Grass and plants
    "minecraft:grass",
    "minecraft:short_grass", // Short grass (Bedrock edition)
    "minecraft:tall_grass",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:deadbush",
    "minecraft:seagrass",
    "minecraft:tall_seagrass",
    // Flowers
    "minecraft:dandelion",
    "minecraft:poppy",
    "minecraft:blue_orchid",
    "minecraft:allium",
    "minecraft:azure_bluet",
    "minecraft:red_tulip",
    "minecraft:orange_tulip",
    "minecraft:white_tulip",
    "minecraft:pink_tulip",
    "minecraft:oxeye_daisy",
    "minecraft:cornflower",
    "minecraft:lily_of_the_valley",
    "minecraft:sunflower",
    "minecraft:lilac",
    "minecraft:rose_bush",
    "minecraft:peony",
    // Saplings
    "minecraft:sapling",
    "minecraft:birch_sapling",
    "minecraft:spruce_sapling",
    "minecraft:jungle_sapling",
    "minecraft:acacia_sapling",
    "minecraft:dark_oak_sapling",
    // Crops
    "minecraft:wheat",
    "minecraft:carrots",
    "minecraft:potatoes",
    "minecraft:beetroot",
    "minecraft:pumpkin_stem",
    "minecraft:melon_stem",
    "minecraft:nether_wart",
    // Vines and climbing plants
    "minecraft:vine",
    "minecraft:weeping_vines",
    "minecraft:twisting_vines",
    "minecraft:cave_vines",
    // Carpets and thin layers
    "minecraft:carpet",
    "minecraft:moss_carpet",
    "minecraft:snow_layer",
    // Pressure plates and buttons
    "minecraft:wooden_pressure_plate",
    "minecraft:stone_pressure_plate",
    "minecraft:light_weighted_pressure_plate",
    "minecraft:heavy_weighted_pressure_plate",
    "minecraft:polished_blackstone_pressure_plate",
    "minecraft:stone_button",
    "minecraft:wooden_button",
    // Torches and light sources (non-solid)
    "minecraft:torch",
    "minecraft:wall_torch",
    "minecraft:redstone_torch",
    "minecraft:redstone_wall_torch",
    "minecraft:soul_torch",
    "minecraft:soul_wall_torch",
    // Signs
    "minecraft:standing_sign",
    "minecraft:wall_sign",
    // Other walkable blocks
    "minecraft:small_dripleaf_block",
    "minecraft:big_dripleaf",
    "minecraft:scaffolding",
    "minecraft:ladder",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava"
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
  } // ← add this line
  
  const MAX_BLOCKS_PER_ENTITY = 1; // Mine one block at a time to create stairs/tunnels gradually
  const FOLLOWER_BLOCK_BUDGET = 0; // Followers don't mine
  const FOLLOWER_ASSIST_BLOCK_BUDGET = 0;
  const WALL_SCAN_DEPTH = 1;
const RAISE_THRESHOLD = 0.55;
const LIFT_ITERATIONS = 2;
const TARGET_SCAN_RADIUS = 32;
const FOLLOWER_ASSIGN_RADIUS = 8;
const FOLLOWER_ASSIGN_RADIUS_SQ = FOLLOWER_ASSIGN_RADIUS * FOLLOWER_ASSIGN_RADIUS;
const FOLLOWER_IMPULSE = 0.035;
// Movement/steering constants (nox7-inspired)
const MOVEMENT_MAX_SPEED = 0.08; // Maximum impulse strength
const MOVEMENT_MAX_FORCE = 0.12; // Maximum steering force
const MOVEMENT_ARRIVAL_RADIUS = 0.5; // Slow down when within this distance of waypoint
const MOVEMENT_LOOK_AHEAD_DISTANCE = 2.0; // Look ahead this many waypoints for smoother turns
const MOVEMENT_DAMPING = 0.85; // Velocity damping factor (0-1, lower = more damping)
const BRANCH_INTERVAL_TICKS = 24;
const SIDE_CHANNEL_INTERVAL_TICKS = 24;
const SIDE_CHANNEL_DEPTH = 1;
const IDLE_DRIFT_INTERVAL = 80;
const FOLLOWER_ASSIST_DISTANCE_SQ = 16;
const TRAIL_MAX_POINTS = 24;
const TRAIL_SAMPLE_STEP = 2;
const ELEVATION_TOLERANCE = 0.75; // For general elevation intent
const VERTICAL_MINING_THRESHOLD = 1.5; // More aggressive threshold for triggering vertical mining (up/down)
const VERTICAL_PATH_CHECK_DISTANCE = 20; // Check vertical path up to 20 blocks ahead (for high targets)
const HIGH_TARGET_THRESHOLD = 10; // Target is considered "high" if 10+ blocks above
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
const CAVE_AHEAD_SCAN_DISTANCE = 8; // How far ahead to scan for caves
const CAVE_AHEAD_AIR_THRESHOLD = 3; // Need at least 3 air blocks ahead to consider it a cave entrance

// Performance optimization constants
// Dynamic AI tick interval based on bear count:
// - 1-4 bears: every 1 tick (full speed)
// - 5-9 bears: every 2 ticks (50% reduction)
// - 10+ bears: every 3 ticks (66% reduction)
// Bears with targets always run at full speed (every 1 tick)
const AI_TICK_INTERVAL_BASE = 3; // Base interval for many bears
const AI_TICK_INTERVAL_FEW = 1; // Interval for few bears (1-4)
const AI_TICK_INTERVAL_MEDIUM = 2; // Interval for medium bears (5-9)
const BEAR_COUNT_THRESHOLD_FEW = 5; // Switch to medium interval at 5 bears
const BEAR_COUNT_THRESHOLD_MEDIUM = 10; // Switch to slow interval at 10 bears
const TARGET_CACHE_TICKS = 5; // Cache target lookups for 5 ticks
const MAX_PROCESSING_DISTANCE = 64; // Only process entities within 64 blocks of any player
const MAX_PROCESSING_DISTANCE_SQ = MAX_PROCESSING_DISTANCE * MAX_PROCESSING_DISTANCE;
const BLOCK_CACHE_TICKS = 1; // Cache block lookups for 1 tick (very short, blocks change frequently)
const PATHFINDING_CACHE_TICKS = 20; // Cache path for 1 second
const PATHFINDING_RADIUS = 12; // Pathfinding search radius (blocks)
const PATHFINDING_MAX_NODES = 180; // Hard cap on node expansions for performance
const PATHFINDING_NODES_PER_CHUNK = 25; // Nodes to process per tick (chunked processing)
const PATHFINDING_MAX_AGE_TICKS = 60; // Max ticks before canceling stale pathfinding
const PATHFINDING_STATE_CLEANUP_INTERVAL = 100; // Cleanup stale states every N ticks
const PATHFINDING_MAX_CONCURRENT = 5; // Maximum concurrent pathfinding operations (reduced for better performance with many bears)

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

function getDebugVertical() {
    return isDebugEnabled("mining", "vertical") || isDebugEnabled("mining", "all");
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
    // IMPORTANT: More specific rules should come FIRST (they're checked in order)
    // Gravel must come before grass rule, otherwise "gravel" matches "grass" keyword
    { sound: "dig.gravel", keywords: ["gravel", "concrete_powder", "powder", "dust"] },
    { sound: "dig.grass", keywords: ["grass", "dirt", "mud", "podzol", "mycelium", "farmland", "sand", "soul", "clay", "rooted"] },
    { sound: "dig.wood", keywords: ["wood", "log", "stem", "hyphae", "planks", "board", "bamboo"] },
    { sound: "dig.glass", keywords: ["glass", "ice", "packed_ice", "frosted_ice", "shard"] },
    { sound: "dig.metal", keywords: ["iron", "gold", "copper", "metal", "anvil", "bell"] },
    { sound: "dig.wool", keywords: ["wool", "carpet"] }
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
// Performance: Cache pathfinding results per entity
const pathfindingCache = new Map(); // Map<entityId, { path: Array<{x,y,z}>, tick: number, targetKey: string }>
// Async pathfinding state management
const pathfindingState = new Map(); // Map<entityId, { status, startTick, targetKey, start, goal, open, closed, cameFrom, costSoFar, expansions, dimensionId, tunnelHeight }>
const pathfindingQueue = new Set(); // Set<entityId> - Entities waiting for pathfinding to start

// Performance: Cache block lookups to reduce redundant getBlock() calls
// Map<"dimId:x:y:z", {block: Block, tick: number}>
const blockCache = new Map();

// Track entity status for debugging (valid, inRange, distance)
const entityStatusCache = new Map(); // Map<configId, Map<entityId, {valid: boolean, inRange: boolean, dist: number}>>

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
const SPIRAL_STAIR_THRESHOLD = 4; // Use spiral stairs if need to climb 4+ blocks
const SPIRAL_STAIR_RADIUS = 2; // Spiral staircase radius (2 blocks = 5x5 area)

// Track leader-follower relationships for death handling
// Map: leaderId -> Set<followerId> - tracks which entities are followers of which leader
const leaderFollowerMap = new Map(); // Map<leaderId, Set<followerId>>
// Map: followerId -> leaderId - reverse lookup for quick leader finding
const followerLeaderMap = new Map(); // Map<followerId, leaderId>

// Target coordination: Limit how many bears can target the same target
// Map: targetId -> Set<bearId> - tracks which bears are targeting which target
const targetCoordination = new Map(); // Map<targetId, Set<bearId>>
const MAX_BEARS_PER_TARGET = 2; // Maximum number of bears that can actively target the same target
const TARGET_COORDINATION_CLEANUP_TICKS = 100; // Clean up old entries every 5 seconds
const targetFullLogCache = new Map(); // Cache to prevent spam of "target is full" messages

// Stuck detection for multi-directional pathfinding
// Map: entityId -> {lastPosition: {x,y,z}, lastProgressTick: number, stuckTicks: number}
const entityProgress = new Map();
const STUCK_DETECTION_TICKS = 20; // Check if stuck after 1 second (20 ticks) - more responsive
const STUCK_THRESHOLD_DISTANCE = 0.5; // Consider stuck if moved less than 0.5 blocks
const STUCK_DIRECTION_CHANGE_TICKS = 10; // Change direction faster when stuck (10 ticks = 0.5 seconds) // Change direction every 1 second when stuck

// Loop detection: Track when bears are stuck in the same situation repeatedly
// Map: entityId -> {lastSituation: string, repeatCount: number, lastTick: number}
const stuckLoopDetection = new Map();
const STUCK_LOOP_THRESHOLD = 5; // If same situation repeats 5 times, try different approach
const STUCK_LOOP_RESET_TICKS = 40; // Reset loop detection after 2 seconds of different behavior

// Convert block type ID to item type ID (most are the same, but some differ)
function blockToItemType(blockTypeId) {
    if (!blockTypeId) return null;
    // Convert blocks to their natural drops (like player breaking, no silk touch)
    // This ensures blocks drop the correct items when broken
    const conversions = {
        // Stone variants -> cobblestone/deepslate variants
        "minecraft:stone": "minecraft:cobblestone", // Stone drops cobblestone
        "minecraft:infested_stone": "minecraft:cobblestone",
        "minecraft:stone_bricks": "minecraft:stone_bricks", // Stone bricks drop themselves
        "minecraft:cracked_stone_bricks": "minecraft:cracked_stone_bricks",
        "minecraft:mossy_stone_bricks": "minecraft:mossy_stone_bricks",
        "minecraft:chiseled_stone_bricks": "minecraft:chiseled_stone_bricks",
        "minecraft:deepslate": "minecraft:cobbled_deepslate", // Deepslate drops cobbled deepslate
        "minecraft:deepslate_bricks": "minecraft:deepslate_bricks",
        "minecraft:deepslate_tiles": "minecraft:deepslate_tiles",
        "minecraft:cracked_deepslate_bricks": "minecraft:cracked_deepslate_bricks",
        "minecraft:cracked_deepslate_tiles": "minecraft:cracked_deepslate_tiles",
        "minecraft:polished_deepslate": "minecraft:polished_deepslate",
        "minecraft:chiseled_deepslate": "minecraft:chiseled_deepslate",
        
        // Dirt/grass variants
        "minecraft:grass": "minecraft:grass",
        "minecraft:grass_block": "minecraft:dirt", // Grass block drops dirt
        "minecraft:mycelium": "minecraft:dirt",
        "minecraft:podzol": "minecraft:dirt",
        "minecraft:farmland": "minecraft:dirt",
        "minecraft:grass_path": "minecraft:dirt",
        
        // Ice variants - don't drop without silk touch
        "minecraft:ice": null, // Doesn't drop without silk touch
        "minecraft:packed_ice": null, // Doesn't drop without silk touch
        "minecraft:blue_ice": null, // Doesn't drop without silk touch
        "minecraft:frosted_ice": null, // Doesn't drop
        
        // Glass variants - don't drop without silk touch
        "minecraft:glass": null,
        "minecraft:white_stained_glass": null,
        "minecraft:orange_stained_glass": null,
        "minecraft:magenta_stained_glass": null,
        "minecraft:light_blue_stained_glass": null,
        "minecraft:yellow_stained_glass": null,
        "minecraft:lime_stained_glass": null,
        "minecraft:pink_stained_glass": null,
        "minecraft:gray_stained_glass": null,
        "minecraft:light_gray_stained_glass": null,
        "minecraft:cyan_stained_glass": null,
        "minecraft:purple_stained_glass": null,
        "minecraft:blue_stained_glass": null,
        "minecraft:brown_stained_glass": null,
        "minecraft:green_stained_glass": null,
        "minecraft:red_stained_glass": null,
        "minecraft:black_stained_glass": null,
        
        // Leaves - don't drop the leaf block (may drop saplings, but not the leaves themselves)
        "minecraft:oak_leaves": null,
        "minecraft:birch_leaves": null,
        "minecraft:spruce_leaves": null,
        "minecraft:jungle_leaves": null,
        "minecraft:acacia_leaves": null,
        "minecraft:dark_oak_leaves": null,
        "minecraft:mangrove_leaves": null,
        "minecraft:cherry_leaves": null,
        "minecraft:azalea_leaves": null,
        "minecraft:flowering_azalea_leaves": null,
        
        // Glowstone drops glowstone dust, not the block
        "minecraft:glowstone": "minecraft:glowstone_dust",
        
        // Sea lantern doesn't drop without silk touch
        "minecraft:sea_lantern": null,
        
        // Non-droppable blocks
        "minecraft:fire": null, // Doesn't drop
        "minecraft:soul_fire": null, // Doesn't drop
        "minecraft:water": null, // Doesn't drop
        "minecraft:lava": null, // Doesn't drop
        "minecraft:air": null, // Doesn't drop
        "minecraft:cave_air": null,
        "minecraft:void_air": null,
        
        // Ores drop their respective items, not the ore blocks
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
    
    // Default: block ID is the same as item ID (most blocks drop themselves)
    return blockTypeId;
}

// Blocks that don't drop items without silk touch (should not be collected)
// Note: grass_block, mycelium, podzol are NOT here because they drop dirt (handled in blockToItemType)
const NO_DROP_BLOCKS = new Set([
    "minecraft:oak_leaves",
    "minecraft:birch_leaves",
    "minecraft:spruce_leaves",
    "minecraft:jungle_leaves",
    "minecraft:acacia_leaves",
    "minecraft:dark_oak_leaves",
    "minecraft:mangrove_leaves",
    "minecraft:cherry_leaves",
    "minecraft:azalea_leaves",
    "minecraft:flowering_azalea_leaves",
    "minecraft:glass",
    "minecraft:white_stained_glass",
    "minecraft:orange_stained_glass",
    "minecraft:magenta_stained_glass",
    "minecraft:light_blue_stained_glass",
    "minecraft:yellow_stained_glass",
    "minecraft:lime_stained_glass",
    "minecraft:pink_stained_glass",
    "minecraft:gray_stained_glass",
    "minecraft:light_gray_stained_glass",
    "minecraft:cyan_stained_glass",
    "minecraft:purple_stained_glass",
    "minecraft:blue_stained_glass",
    "minecraft:brown_stained_glass",
    "minecraft:green_stained_glass",
    "minecraft:red_stained_glass",
    "minecraft:black_stained_glass",
    "minecraft:ice",
    "minecraft:packed_ice",
    "minecraft:blue_ice",
    "minecraft:glowstone", // Drops glowstone dust, not glowstone block
    "minecraft:sea_lantern",
    "minecraft:budding_amethyst",
    "minecraft:spawner",
    "minecraft:barrier",
    "minecraft:structure_void",
    "minecraft:structure_block",
    "minecraft:command_block",
    "minecraft:chain_command_block",
    "minecraft:repeating_command_block"
]);

// Try to add item to entity inventory, or drop it if inventory is full
function collectOrDropBlock(entity, blockTypeId, location) {
    if (!entity || !blockTypeId || !location) return;
    
    // Don't collect blocks that don't drop items without silk touch
    if (NO_DROP_BLOCKS.has(blockTypeId)) {
        return; // Block doesn't drop an item without silk touch
    }
    
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

/**
 * Get a block with caching to reduce redundant queries
 * @param {Dimension} dimension - The dimension to query
 * @param {number} x - Block X coordinate
 * @param {number} y - Block Y coordinate
 * @param {number} z - Block Z coordinate
 * @returns {Block|null} The block at the specified coordinates, or null if error
 */
function getBlock(dimension, x, y, z) {
    if (!dimension) return null;
    
    const currentTick = system.currentTick;
    const dimId = dimension.id;
    const blockKey = `${dimId}:${Math.floor(x)}:${Math.floor(y)}:${Math.floor(z)}`;
    
    // Check cache first
    const cached = blockCache.get(blockKey);
    if (cached && (currentTick - cached.tick) < BLOCK_CACHE_TICKS) {
        // Verify block is still valid (blocks can change)
        if (cached.block) {
            const isValid = typeof cached.block.isValid === "function" ? cached.block.isValid() : Boolean(cached.block.isValid);
            if (isValid) {
                return cached.block;
            }
        }
    }
    
    // Query block and cache it
    try {
        const block = dimension.getBlock({ x, y, z });
        blockCache.set(blockKey, { block, tick: currentTick });
        return block;
    } catch {
        // Cache null result too (to avoid repeated failed queries)
        blockCache.set(blockKey, { block: null, tick: currentTick });
        return null;
    }
}

/**
 * Clear block cache for a specific dimension or all dimensions
 * @param {string} dimensionId - Optional dimension ID to clear, or null to clear all
 */
function clearBlockCache(dimensionId = null) {
    if (dimensionId) {
        // Clear only blocks for this dimension
        for (const [key] of blockCache.entries()) {
            if (key.startsWith(`${dimensionId}:`)) {
                blockCache.delete(key);
            }
        }
    } else {
        // Clear all blocks
        blockCache.clear();
    }
}

function isBreakableBlock(block) {
    if (!block) return false;
    const id = block.typeId;
    if (!id) return false;
    // Air blocks are not breakable
    if (AIR_BLOCKS.has(id)) return false;
    // Walkable-through blocks (grass, flowers, etc.) are not breakable - entities can walk through them
    if (WALKABLE_THROUGH_BLOCKS.has(id)) return false;
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
    // UNLESS the target has moved significantly, entity is stuck, OR path is blocked
    const blockKey = `${x},${y},${z}`;
    const currentTick = system.currentTick;
    const stairTick = recentStairBlocks.get(blockKey);
    if (stairTick !== undefined && (currentTick - stairTick) < 200) { // Protect for 10 seconds (200 ticks)
        // Check if entity is stuck - if stuck, allow breaking protected stairs to escape
        let isStuck = false;
        if (entity) {
            const progress = entityProgress.get(entity.id);
            if (progress && progress.stuckTicks >= 2) {
                isStuck = true;
            }
        }
        
        // Check if path is blocked - if so, allow breaking protected blocks to clear path
        // BUT: CRITICAL - do NOT allow breaking protected stair blocks when building upward stairs (target is above)
        // When building upward stairs, the protected blocks ARE the path - don't break them!
        let pathBlocked = false;
        if (entity && targetInfo && entity.dimension) {
            const loc = entity.location;
            const targetLoc = targetInfo.entity?.location;
            if (targetLoc) {
                const dx = targetLoc.x - loc.x;
                const dyTarget = targetLoc.y - loc.y;
                const dz = targetLoc.z - loc.z;
                const horizontalDist = Math.hypot(dx, dz);
                
                // CRITICAL: When target is above (dyTarget > 1), do NOT allow breaking protected stair blocks
                // These blocks are part of the upward stair path - breaking them is counter-productive
                // Only allow breaking protected stairs if target moved below OR if target is at same level or below
                if (dyTarget <= 1) {
                    // Target is at same level or below - check if path is blocked
                    // If far enough away (> 3 blocks), check if path is blocked
                    // For close targets, protection still applies (stairs might be needed)
                    if (horizontalDist > 3) {
                        // Check if this block is in the path to target
                        const blockInPath = Math.abs(x - loc.x) <= Math.abs(dx) && Math.abs(z - loc.z) <= Math.abs(dz);
                        if (blockInPath) {
                            // This block is in the path - allow breaking if path is blocked
                            // We'll check canReachTargetByWalking, but that's expensive, so we'll be lenient
                            // If block is in path and we're trying to break it, likely path is blocked
                            pathBlocked = true;
                        }
                    }
                }
                // If dyTarget > 1, pathBlocked stays false - don't break protected stairs when building upward!
            }
        }
        
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
                    
                    // CRITICAL: When building upward stairs (target is above), protect stair blocks STRICTLY
                    // Only allow breaking protected stairs if:
                    // 1. Target moved significantly below (more than 2 blocks) - stairs are no longer needed upward
                    // 2. Entity is stuck and needs to escape - emergency only
                    // Do NOT allow breaking just because path is blocked - when building upward, protected blocks ARE the path!
                    const targetLocForProtection = targetInfo.entity?.location;
                    const currentDyToTarget = targetLocForProtection ? (targetLocForProtection.y - entity.location.y) : 0;
                    
                    // If target is currently above (currentDyToTarget > 1), be very strict about protection
                    // Only break protected stairs if target moved significantly below OR entity is genuinely stuck
                    if (currentDyToTarget > 1) {
                        // Building upward stairs - only break if target moved significantly below or entity is stuck
                        // Do NOT break just because path is blocked - the protected blocks ARE the path!
                        if (dy < -2 || isStuck) {
                            if (getDebugPitfall()) {
                                if (isStuck) {
                                    console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break (building upward) - entity is stuck`);
                                } else {
                                    console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break (building upward) - target moved below (dy=${dy.toFixed(1)})`);
                                }
                            }
                            // Remove protection for this block since target changed position or entity is stuck
                            recentStairBlocks.delete(blockKey);
                            // Continue to break the block
                        } else {
                            // Target is above - protect stair blocks strictly
                            if (getDebugPitfall()) {
                                console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp (building upward, dy=${currentDyToTarget.toFixed(1)} > 1) at (${x}, ${y}, ${z}) - NOT breaking`);
                            }
                            return false; // This is a protected stair block for upward path - don't break it
                        }
                    } else {
                        // Target is at same level or below - normal protection rules apply
                        if (dy < -2 || isStuck || pathBlocked) {
                            if (getDebugPitfall()) {
                                if (isStuck) {
                                    console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - entity is stuck`);
                                } else if (pathBlocked) {
                                    console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - path is blocked`);
                                } else {
                                    console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - target moved below (dy=${dy.toFixed(1)})`);
                                }
                            }
                            // Remove protection for this block since target changed position, entity is stuck, or path is blocked
                            recentStairBlocks.delete(blockKey);
                            // Continue to break the block
                        } else {
                            if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp at (${x}, ${y}, ${z})`);
                            return false; // This is a stair/ramp block, don't break it
                        }
                    }
                } else {
                    // No current target, but if stuck or path blocked, allow breaking
                    if (isStuck || pathBlocked) {
                        if (getDebugPitfall()) {
                            if (isStuck) {
                                console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - entity is stuck (no target)`);
                            } else {
                                console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - path is blocked (no target)`);
                            }
                        }
                        recentStairBlocks.delete(blockKey);
                        // Continue to break the block
                    } else {
                        // No current target, but stairs were created - still protect
                        if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp at (${x}, ${y}, ${z})`);
                        return false;
                    }
                }
            } else {
                // No stored target position, but if stuck or path blocked, allow breaking
                if (isStuck || pathBlocked) {
                    if (getDebugPitfall()) {
                        if (isStuck) {
                            console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - entity is stuck (no stored target)`);
                        } else {
                            console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - path is blocked (no stored target)`);
                        }
                    }
                    recentStairBlocks.delete(blockKey);
                    // Continue to break the block
                } else {
                    // No stored target position, protect normally
                    if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp at (${x}, ${y}, ${z})`);
                    return false;
                }
            }
        } else {
            // No entity or target info, but if stuck or path blocked, allow breaking
            if ((isStuck || pathBlocked) && entity) {
                if (getDebugPitfall()) {
                    if (isStuck) {
                        console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - entity is stuck (no target info)`);
                    } else {
                        console.warn(`[PITFALL DEBUG] clearBlock: Allowing stair break - path is blocked (no target info)`);
                    }
                }
                recentStairBlocks.delete(blockKey);
                // Continue to break the block
            } else {
                // No entity or target info, protect normally
                if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] clearBlock: Block is protected stair/ramp at (${x}, ${y}, ${z})`);
                return false;
            }
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
        // Break the block
        block.setType("minecraft:air");
        playBreakSound(dimension, x, y, z, originalType);
        
        // Play mining dig sound if this is a mining bear
        if (entity) {
            const entityType = entity.typeId;
            if (entityType === "mb:mining_mb" || entityType === "mb:mining_mb_day20") {
                try {
                    const location = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
                    const volume = 0.7;
                    const pitch = 0.9 + Math.random() * 0.2;
                    if (dimension.playSound) {
                        dimension.playSound("mining_mb.dig", location, { volume, pitch });
                    } else {
                        const px = location.x.toFixed(1);
                        const py = location.y.toFixed(1);
                        const pz = location.z.toFixed(1);
                        dimension.runCommandAsync(
                            `playsound mining_mb.dig @a[x=${px},y=${py},z=${pz},r=16] ${px} ${py} ${pz} ${volume.toFixed(2)} ${pitch.toFixed(2)}`
                        );
                    }
                } catch {
                    // Ignore sound errors
                }
            }
        }
        
        // Collect or drop the broken block (using natural drops, not silk touch)
        // Use blockToItemType to convert blocks to their natural drops (e.g., stone -> cobblestone, grass_block -> dirt)
        // This ensures blocks drop like player breaking (no silk touch)
        // Only drop 25% of the time to reduce lag from too many items
        if (entity && Math.random() < 0.25) {
            collectOrDropBlock(entity, originalType, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
        }
        
        if (digContext) {
            digContext.lastBroken = { x, y, z };
            digContext.cleared++;
        }
        return true;
    } catch (error) {
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
    
    // CRITICAL: Don't store creative/spectator mode players as targets
    if (targetInfo.entity?.typeId === "minecraft:player") {
        try {
            const gameMode = targetInfo.entity.getGameMode();
            if (gameMode === "creative" || gameMode === "spectator") {
                // Don't store creative/spectator players as targets
                return;
            }
        } catch { }
    }
    
    const entityId = entity.id;
    const targetId = targetInfo.entity?.id ?? null;
    const currentTick = system.currentTick;
    
    // Get previous target to unregister if changed
    const previousEntry = lastKnownTargets.get(entityId);
    const previousTargetId = previousEntry?.targetId;
    
    // If target changed, unregister from old target
    if (previousTargetId && previousTargetId !== targetId) {
        unregisterBearFromTarget(entityId, previousTargetId);
    }
    
    // Don't automatically register - let processContext handle registration
    // when bear has clear line of sight. This allows bears to see and attack
    // targets even if targeting system is full, but only mine if they join the system.
    
    lastKnownTargets.set(entityId, {
        position: {
            x: targetInfo.entity.location.x,
            y: targetInfo.entity.location.y,
            z: targetInfo.entity.location.z
        },
        targetId: targetId,
        tick: currentTick
    });
    // Update last seen tick when target is actually visible
    if (targetInfo.entity) {
        lastSeenTargetTick.set(entityId, currentTick);
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
                // Check if it's a player (use shared cache)
                const allPlayers = getCachedPlayers();
                for (const player of allPlayers) {
                    if (player.id === entry.targetId && player.dimension.id === dimension.id) {
                        // Check if player is in creative/spectator mode - ignore them
                        try {
                            const gameMode = player.getGameMode();
                            if (gameMode === "creative" || gameMode === "spectator") {
                                // Target is in creative/spectator mode, clear stored target
                                lastKnownTargets.delete(entity.id);
                                return null;
                            }
                        } catch { }
                        
                        // Target is still alive - update position and return
                        const loc = entity.location;
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
                // Check if it's a mob (use shared cache)
                const mobs = getCachedMobs(dimension, entity.location, 64);
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

/**
 * Check if vertical mining is needed (more aggressive than elevation intent)
 * Returns "up", "down", or null
 */
function needsVerticalMining(entity, targetInfo, dimension, tunnelHeight) {
    if (!targetInfo || !targetInfo.entity?.location || !dimension) return null;
    
    const loc = entity.location;
    const targetLoc = targetInfo.entity.location;
    const dy = targetLoc.y - loc.y;
    const horizontalDist = Math.hypot(targetLoc.x - loc.x, targetLoc.z - loc.z);
    
    if (getDebugVertical()) {
        console.warn(`[MINING AI] Vertical check: dy=${dy.toFixed(1)}, horizontalDist=${horizontalDist.toFixed(1)}, threshold=${VERTICAL_MINING_THRESHOLD}`);
    }
    
    // Check if target is significantly above (need upward mining)
    if (dy > VERTICAL_MINING_THRESHOLD) {
        // Check if there's a clear vertical path upward
        const baseX = Math.floor(loc.x);
        const baseY = Math.floor(loc.y);
        const baseZ = Math.floor(loc.z);
        
        // Check if path upward is blocked
        let upwardBlocked = false;
        const checkHeight = Math.min(Math.ceil(dy), VERTICAL_PATH_CHECK_DISTANCE);
        for (let h = 1; h <= checkHeight; h++) {
            // Check if there's a solid block blocking upward movement
            for (let tunnelH = 0; tunnelH < tunnelHeight; tunnelH++) {
                const block = getBlock(dimension, baseX, baseY + h + tunnelH, baseZ);
                if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                    upwardBlocked = true;
                    if (getDebugVertical()) {
                        console.warn(`[MINING AI] Upward path blocked at y=${baseY + h + tunnelH}`);
                    }
                    break;
                }
            }
            if (upwardBlocked) break;
        }
        
        // Also check forward path - if forward is clear but we need to go up, mine up
        if (upwardBlocked || (horizontalDist <= 3 && dy > 2)) {
            if (getDebugVertical()) {
                console.warn(`[MINING AI] Vertical mining needed: UP (upwardBlocked=${upwardBlocked}, horizontalDist=${horizontalDist.toFixed(1)}, dy=${dy.toFixed(1)})`);
            }
            return "up";
        }
    }
    
    // Check if target is significantly below (need downward mining)
    if (dy < -VERTICAL_MINING_THRESHOLD) {
        // Check if there's a clear vertical path downward
        const baseX = Math.floor(loc.x);
        const baseY = Math.floor(loc.y);
        const baseZ = Math.floor(loc.z);
        
        // Check if path downward is blocked
        let downwardBlocked = false;
        const checkDepth = Math.min(Math.ceil(-dy), VERTICAL_PATH_CHECK_DISTANCE);
        for (let h = 1; h <= checkDepth; h++) {
            // Check if there's a solid block blocking downward movement
            const block = getBlock(dimension, baseX, baseY - h, baseZ);
            if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                downwardBlocked = true;
                if (getDebugVertical()) {
                    console.warn(`[MINING AI] Downward path blocked at y=${baseY - h}`);
                }
                break;
            }
            // Also check if there's floor below (can't fall into void)
            const floorBlock = getBlock(dimension, baseX, baseY - h - 1, baseZ);
            if (!floorBlock || AIR_BLOCKS.has(floorBlock.typeId)) {
                // No floor - might be safe to mine down, but check if target is actually below
                if (dy < -2) {
                    downwardBlocked = true; // Need to mine down to reach target
                }
            }
        }
        
        // If downward path is blocked or target is significantly below, mine down
        if (downwardBlocked || dy < -2) {
            if (getDebugVertical()) {
                console.warn(`[MINING AI] Vertical mining needed: DOWN (downwardBlocked=${downwardBlocked}, dy=${dy.toFixed(1)})`);
            }
            return "down";
        }
    }
    
    return null;
}

function isSolidBlock(block) {
    if (!block || !block.typeId) return false;
    // Air blocks are not solid
    if (AIR_BLOCKS.has(block.typeId)) return false;
    // Walkable-through blocks are not considered solid for pathfinding
    if (WALKABLE_THROUGH_BLOCKS.has(block.typeId)) return false;
    return true;
}

// Check if a block can be walked through (non-solid, like grass, flowers, etc.)
function canWalkThrough(block) {
    if (!block || !block.typeId) return true; // No block = can walk through
    return AIR_BLOCKS.has(block.typeId) || WALKABLE_THROUGH_BLOCKS.has(block.typeId);
}

function isWalkableAt(dimension, x, y, z, tunnelHeight) {
    const blockBelow = getBlock(dimension, x, y - 1, z);
    if (!blockBelow || !isSolidBlock(blockBelow)) return false;
    for (let h = 0; h < tunnelHeight; h++) {
        const block = getBlock(dimension, x, y + h, z);
        if (!canWalkThrough(block)) return false;
    }
    return true;
}

// Helper function to reconstruct path from cameFrom map
function reconstructPath(state) {
    const { cameFrom, goal } = state;
    const key = (loc) => `${loc.x},${loc.y},${loc.z}`;
    
    // Find the goal node in cameFrom (or use goal directly)
    const path = [];
    let node = goal;
    
    // Reconstruct path backwards from goal
    while (node) {
        path.unshift(node);
        const nodeKey = key(node);
        if (cameFrom[nodeKey]) {
            node = cameFrom[nodeKey];
        } else {
            break;
        }
    }
    
    return path.length > 0 ? path : null;
}

// Initialize async pathfinding for an entity
function findPathToTargetAsync(entity, targetLoc, tunnelHeight) {
    const dimension = entity?.dimension;
    if (!dimension || !targetLoc) return null;
    
    const entityId = entity.id;
    const now = system.currentTick;
    
    // Check if pathfinding already in progress
    const existingState = pathfindingState.get(entityId);
    if (existingState && existingState.status === 'in_progress') {
        // Check if target changed significantly
        const targetKey = `${Math.floor(targetLoc.x)},${Math.floor(targetLoc.y)},${Math.floor(targetLoc.z)}`;
        if (existingState.targetKey === targetKey) {
            return existingState; // Continue existing pathfinding
        } else {
            // Target changed, cancel old and start new
            cancelPathfinding(entityId);
        }
    }
    
    const start = {
        x: Math.floor(entity.location.x),
        y: Math.floor(entity.location.y),
        z: Math.floor(entity.location.z)
    };
    const goal = {
        x: Math.floor(targetLoc.x),
        y: Math.floor(targetLoc.y),
        z: Math.floor(targetLoc.z)
    };
    
    // Use Euclidean distance for heuristic (like nox7)
    const dx = goal.x - start.x;
    const dy = goal.y - start.y;
    const dz = goal.z - start.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > PATHFINDING_RADIUS * PATHFINDING_RADIUS) return null;
    
    // Check concurrent limit
    let activeCount = 0;
    for (const state of pathfindingState.values()) {
        if (state.status === 'in_progress') activeCount++;
    }
    if (activeCount >= PATHFINDING_MAX_CONCURRENT) {
        // Queue for later
        pathfindingQueue.add(entityId);
        return null;
    }
    
    // Initialize A* structures (convert to serializable format)
    const initialF = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const open = [{ ...start, g: 0, f: initialF }];
    const cameFrom = {}; // Object instead of Map
    const costSoFar = {}; // Object instead of Map
    const closed = []; // Array of keys instead of Set
    
    const key = (loc) => `${loc.x},${loc.y},${loc.z}`;
    const startKey = key(start);
    costSoFar[startKey] = 0;
    
    const targetKey = `${goal.x},${goal.y},${goal.z}`;
    
    // Create pathfinding state
    const state = {
        status: 'in_progress',
        startTick: now,
        targetKey: targetKey,
        start: start,
        goal: goal,
        open: open,
        closed: closed,
        cameFrom: cameFrom,
        costSoFar: costSoFar,
        expansions: 0,
        dimensionId: dimension.id,
        tunnelHeight: tunnelHeight
    };
    
    pathfindingState.set(entityId, state);
    
    // Start processing first chunk
    processPathfindingChunk(entityId);
    
    return state;
}

// Process one chunk of pathfinding nodes
function processPathfindingChunk(entityId) {
    const state = pathfindingState.get(entityId);
    if (!state || state.status !== 'in_progress') return;
    
    const dimension = world.getDimension(state.dimensionId);
    if (!dimension) {
        // Dimension invalid, cancel
        cancelPathfinding(entityId);
        return;
    }
    
    // Get entity to verify it still exists
    let entity = null;
    try {
        const entities = dimension.getEntities({ type: "mb:mining_mb" });
        for (const e of entities) {
            if (e.id === entityId) {
                entity = e;
                break;
            }
        }
        // Also check day20 variant
        if (!entity) {
            const entities2 = dimension.getEntities({ type: "mb:mining_mb_day20" });
            for (const e of entities2) {
                if (e.id === entityId) {
                    entity = e;
                    break;
                }
            }
        }
    } catch { }
    
    if (!entity) {
        // Entity no longer exists, cancel
        cancelPathfinding(entityId);
        return;
    }
    
    // Check if entity moved significantly from start
    const currentLoc = entity.location;
    const start = state.start;
    const distMoved = Math.hypot(
        currentLoc.x - (start.x + 0.5),
        currentLoc.y - start.y,
        currentLoc.z - (start.z + 0.5)
    );
    if (distMoved > 3) {
        // Entity moved too far, cancel
        cancelPathfinding(entityId);
        return;
    }
    
    const key = (loc) => `${loc.x},${loc.y},${loc.z}`;
    const heuristic = (a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    
    const goal = state.goal;
    let { open, closed, cameFrom, costSoFar, expansions } = state;
    
    // Process up to PATHFINDING_NODES_PER_CHUNK nodes
    let nodesProcessed = 0;
    while (open.length > 0 && expansions < PATHFINDING_MAX_NODES && nodesProcessed < PATHFINDING_NODES_PER_CHUNK) {
        // Find node with lowest f-score
        let bestIndex = 0;
        for (let i = 1; i < open.length; i++) {
            if (open[i].f < open[bestIndex].f) bestIndex = i;
        }
        const current = open.splice(bestIndex, 1)[0];
        const currentKey = key(current);
        
        // Check if we reached the goal (allow 1 block height difference)
        if (current.x === goal.x && current.z === goal.z && Math.abs(current.y - goal.y) <= 1) {
            // Goal reached! Reconstruct path
            const finalState = { ...state, goal: current, cameFrom };
            const path = reconstructPath(finalState);
            
            if (path && path.length > 0) {
                // Store in cache
                const now = system.currentTick;
                pathfindingCache.set(entityId, { 
                    path: path, 
                    tick: now, 
                    targetKey: state.targetKey 
                });
                state.status = 'completed';
            } else {
                state.status = 'failed';
            }
            
            cleanupPathfindingState(entityId);
            return;
        }
        
        closed.push(currentKey);
        expansions++;
        nodesProcessed++;
        
        // Get neighbors - enhanced with better direction checking (like nox7)
        const neighbors = getNeighborsEnhanced(current, dimension, goal, state.tunnelHeight);
        
        for (const neighbor of neighbors) {
            const neighborKey = key(neighbor);
            if (closed.includes(neighborKey)) continue;
            
            // Cost to reach neighbor (1 for horizontal, 1.5 for diagonal, 2 for vertical)
            const moveCost = (neighbor.x !== current.x && neighbor.z !== current.z) ? 1.414 : 
                            (neighbor.y !== current.y) ? 2.0 : 1.0;
            const tentativeG = (costSoFar[currentKey] ?? 0) + moveCost;
            
            // Check if we found a better path to this neighbor
            if (!costSoFar[neighborKey] || tentativeG < costSoFar[neighborKey]) {
                cameFrom[neighborKey] = current;
                costSoFar[neighborKey] = tentativeG;
                const h = heuristic(neighbor, goal);
                const f = tentativeG + h;
                
                // Check if neighbor is already in open list
                const existingIndex = open.findIndex(n => key(n) === neighborKey);
                if (existingIndex >= 0) {
                    // Update existing node
                    open[existingIndex] = { ...neighbor, g: tentativeG, f };
                } else {
                    // Add new node
                    open.push({ ...neighbor, g: tentativeG, f });
                }
            }
        }
    }
    
    // Update state
    state.open = open;
    state.closed = closed;
    state.cameFrom = cameFrom;
    state.costSoFar = costSoFar;
    state.expansions = expansions;
    
    // Check if we hit max nodes or ran out of nodes
    if (expansions >= PATHFINDING_MAX_NODES || open.length === 0) {
        // Failed to find path
        state.status = 'failed';
        cleanupPathfindingState(entityId);
        return;
    }
    
    // Schedule next chunk using system.run (async execution)
    system.run(() => {
        processPathfindingChunk(entityId);
    });
}

// State management helper functions
function cleanupPathfindingState(entityId) {
    pathfindingState.delete(entityId);
    pathfindingQueue.delete(entityId);
}

function cancelPathfinding(entityId) {
    const state = pathfindingState.get(entityId);
    if (state && state.status === 'in_progress') {
        state.status = 'failed';
    }
    cleanupPathfindingState(entityId);
}

function getPathfindingStatus(entityId) {
    const state = pathfindingState.get(entityId);
    if (!state) return null;
    return state.status;
}

// Enhanced A* pathfinder based on nox7's performant pathfinder approach
// Optimized for mining bears with tunnel height support
// Now a wrapper that uses async pathfinding (for backward compatibility)
function findPathToTarget(entity, targetLoc, tunnelHeight) {
    // Check cache first
    const entityId = entity.id;
    const targetKey = `${Math.floor(targetLoc.x)},${Math.floor(targetLoc.y)},${Math.floor(targetLoc.z)}`;
    const now = system.currentTick;
    
    const cached = pathfindingCache.get(entityId);
    if (cached && (now - cached.tick) < PATHFINDING_CACHE_TICKS && cached.targetKey === targetKey) {
        return cached.path;
    }
    
    // Check if pathfinding in progress
    const state = pathfindingState.get(entityId);
    if (state && state.status === 'in_progress') {
        // Pathfinding in progress, return null (will be available in cache when done)
        return null;
    }
    
    // Start async pathfinding (returns null immediately)
    findPathToTargetAsync(entity, targetLoc, tunnelHeight);
    return null; // Path will be available in cache when async completes
}

// Enhanced neighbor generation (inspired by nox7's approach)
function getNeighborsEnhanced(current, dimension, target, tunnelHeight) {
    const neighbors = [];
    
    // 8 horizontal directions (N, NE, E, SE, S, SW, W, NW)
    const directions = [
        { x: 0, z: -1 },   // N
        { x: 1, z: -1 },   // NE
        { x: 1, z: 0 },    // E
        { x: 1, z: 1 },    // SE
        { x: 0, z: 1 },    // S
        { x: -1, z: 1 },   // SW
        { x: -1, z: 0 },   // W
        { x: -1, z: -1 }   // NW
    ];
    
    for (const dir of directions) {
        const neighborX = current.x + dir.x;
        const neighborZ = current.z + dir.z;
        
        // Try same level, step up (1-2 blocks), then step down (1-2 blocks)
        const candidateYs = [
            current.y,           // Same level
            current.y + 1,       // Step up 1
            current.y + 2,       // Step up 2 (jump)
            current.y - 1,       // Step down 1
            current.y - 2        // Step down 2
        ];
        
        for (const y of candidateYs) {
            // Check if walkable (has solid block below and clear space above)
            if (isWalkableAt(dimension, neighborX, y, neighborZ, tunnelHeight)) {
                neighbors.push({ x: neighborX, y, z: neighborZ });
                break; // Use first valid Y for this direction
            }
        }
    }
    
    return neighbors;
}

function getPathfindingWaypoint(entity, targetInfo, tunnelHeight) {
    if (!targetInfo?.entity?.location) return null;
    
    const targetLoc = targetInfo.entity.location;
    const entityId = entity.id;
    const targetKey = `${Math.floor(targetLoc.x)},${Math.floor(targetLoc.y)},${Math.floor(targetLoc.z)}`;
    const now = system.currentTick;
    
    // 1. Check cache first (existing logic)
    const cached = pathfindingCache.get(entityId);
    if (cached && (now - cached.tick) < PATHFINDING_CACHE_TICKS && cached.targetKey === targetKey) {
        const path = cached.path;
        if (path && path.length > 1) {
            let closestIndex = 0;
            let closestDist = Infinity;
            const loc = entity.location;
            for (let i = 0; i < Math.min(path.length, 6); i++) {
                const point = path[i];
                const dx = point.x + 0.5 - loc.x;
                const dz = point.z + 0.5 - loc.z;
                const dist = dx * dx + dz * dz;
                if (dist < closestDist) {
                    closestDist = dist;
                    closestIndex = i;
                }
            }
            const nextIndex = Math.min(closestIndex + 1, path.length - 1);
            return path[nextIndex];
        }
    }
    
    // 2. Check if pathfinding in progress
    const state = pathfindingState.get(entityId);
    if (state && state.status === 'in_progress') {
        // Check if target changed
        if (state.targetKey === targetKey) {
            // Pathfinding in progress for same target, return null (fallback behavior)
            return null;
        } else {
            // Target changed, cancel old and start new
            cancelPathfinding(entityId);
        }
    }
    
    // 3. Check if pathfinding completed but not yet in cache (shouldn't happen, but handle it)
    if (state && state.status === 'completed') {
        // Should be in cache, but if not, cleanup and start new
        cleanupPathfindingState(entityId);
    }
    
    // 4. If no pathfinding active, start async pathfinding
    findPathToTargetAsync(entity, targetLoc, tunnelHeight);
    
    // Return null while pathfinding is in progress (AI will use fallback behavior)
    return null;
}

// Get full pathfinding path for an entity (for movement/steering)
function getPathfindingPath(entity, targetInfo, tunnelHeight) {
    if (!targetInfo?.entity?.location) return null;
    
    const targetLoc = targetInfo.entity.location;
    const entityId = entity.id;
    const targetKey = `${Math.floor(targetLoc.x)},${Math.floor(targetLoc.y)},${Math.floor(targetLoc.z)}`;
    const now = system.currentTick;
    
    // Check cache
    const cached = pathfindingCache.get(entityId);
    if (cached && (now - cached.tick) < PATHFINDING_CACHE_TICKS && cached.targetKey === targetKey) {
        return cached.path || null;
    }
    
    return null;
}

// nox7-inspired movement/steering system for following pathfinding paths
// This provides smooth, velocity-based movement with look-ahead and arrival behavior
function steerAlongPath(entity, path, targetInfo, config) {
    if (!path || path.length < 2) return false;
    
    const loc = entity.location;
    const velocity = entity.getVelocity();
    
    // Find closest point on path
    let closestIndex = 0;
    let closestDist = Infinity;
    for (let i = 0; i < Math.min(path.length, 8); i++) {
        const point = path[i];
        const dx = point.x + 0.5 - loc.x;
        const dz = point.z + 0.5 - loc.z;
        const dist = dx * dx + dz * dz;
        if (dist < closestDist) {
            closestDist = dist;
            closestIndex = i;
        }
    }
    
    // Look ahead along path for smoother steering (nox7 approach)
    const lookAheadSteps = Math.ceil(MOVEMENT_LOOK_AHEAD_DISTANCE);
    const targetIndex = Math.min(closestIndex + lookAheadSteps, path.length - 1);
    const targetWaypoint = path[targetIndex];
    
    const targetLoc = {
        x: targetWaypoint.x + 0.5,
        y: targetWaypoint.y,
        z: targetWaypoint.z + 0.5
    };
    
    // Calculate desired velocity (direction to target)
    const dx = targetLoc.x - loc.x;
    const dz = targetLoc.z - loc.z;
    const dy = targetLoc.y - loc.y;
    const dist = Math.hypot(dx, dz);
    
    // Arrival behavior: slow down when close to waypoint
    let desiredSpeed = MOVEMENT_MAX_SPEED;
    if (dist < MOVEMENT_ARRIVAL_RADIUS * 2) {
        // Within arrival radius - slow down proportionally
        desiredSpeed = MOVEMENT_MAX_SPEED * (dist / (MOVEMENT_ARRIVAL_RADIUS * 2));
        desiredSpeed = Math.max(desiredSpeed, MOVEMENT_MAX_SPEED * 0.3); // Minimum speed
    }
    
    // Calculate desired velocity vector
    const desiredVel = {
        x: dist > 0.01 ? (dx / dist) * desiredSpeed : 0,
        z: dist > 0.01 ? (dz / dist) * desiredSpeed : 0
    };
    
    // Calculate steering force (desired velocity - current velocity)
    // This creates smooth acceleration/deceleration
    const steering = {
        x: desiredVel.x - velocity.x,
        z: desiredVel.z - velocity.z
    };
    
    // Limit steering force
    const steeringMag = Math.hypot(steering.x, steering.z);
    if (steeringMag > MOVEMENT_MAX_FORCE) {
        steering.x = (steering.x / steeringMag) * MOVEMENT_MAX_FORCE;
        steering.z = (steering.z / steeringMag) * MOVEMENT_MAX_FORCE;
    }
    
    // Apply damping to current velocity (prevents sliding)
    const dampedVel = {
        x: velocity.x * MOVEMENT_DAMPING,
        z: velocity.z * MOVEMENT_DAMPING
    };
    
    // Final impulse = steering force + damped velocity
    const impulse = {
        x: steering.x + dampedVel.x * 0.1, // Small damping component
        z: steering.z + dampedVel.z * 0.1
    };
    
    // Limit final impulse
    const impulseMag = Math.hypot(impulse.x, impulse.z);
    if (impulseMag > MOVEMENT_MAX_SPEED) {
        impulse.x = (impulse.x / impulseMag) * MOVEMENT_MAX_SPEED;
        impulse.z = (impulse.z / impulseMag) * MOVEMENT_MAX_SPEED;
    }
    
    // Vertical component for climbing
    // Be more aggressive when target is above - bears need to climb/jump
    let verticalImpulse = 0;
    if (dy > 0.5) {
        // Target is above - add upward push
        // Scale with distance: closer targets get stronger push, but also push for far targets
        if (dist <= 5) {
            // Close and above - strong upward push
            verticalImpulse = Math.min(dy * 0.03, 0.025);
        } else if (dist <= 12) {
            // Medium distance - moderate push
            verticalImpulse = Math.min(dy * 0.02, 0.02);
        } else if (dy > 2) {
            // Far but target is significantly above - still push upward
            verticalImpulse = Math.min(dy * 0.015, 0.015);
        }
    }
    
    // Check if entity is on ground before applying impulse
    const dimension = entity?.dimension;
    if (dimension) {
        const feetY = Math.floor(loc.y);
        const feetBlock = dimension.getBlock({ x: Math.floor(loc.x), y: feetY - 1, z: Math.floor(loc.z) });
        const isOnGround = feetBlock && !feetBlock.isAir && !feetBlock.isLiquid;
        
        // Only apply if on ground (prevents jumping/falling issues)
        if (!isOnGround && verticalImpulse <= 0) {
            return false; // Don't apply horizontal movement if airborne
        }
    }
    
    // Apply impulse
    try {
        entity.applyImpulse({
            x: impulse.x,
            y: verticalImpulse,
            z: impulse.z
        });
        return true;
    } catch {
        return false;
    }
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
    const horizontalDist = Math.hypot(dx, dz);
    
    // CRITICAL: If target is above by more than 2 blocks and we're close horizontally (<= 10 blocks),
    // we probably need stairs even if there's technically a "path". Bears can't jump 3+ blocks straight up.
    // Only allow "can reach by walking" if dy <= 2 OR if dy > 2 but we're far away (will build stairs while approaching)
    if (dy > 2 && horizontalDist <= 10) {
        // Target is above and we're close - definitely need stairs, can't reach by walking
        if (getDebugPathfinding() || getDebugGeneral()) {
            console.warn(`[MINING AI] canReachTargetByWalking: Target above (dy=${dy.toFixed(1)} > 2) and close horizontally (dist=${horizontalDist.toFixed(1)} <= 10) - requiring stairs/mining`);
        }
        // Continue to vertical path checking to confirm, but likely need mining
    }
    
    // Trust native AI more - only mine when path is REALLY blocked
    // For moderate distances and heights, let native AI handle pathfinding
    // Native AI can handle jumping, climbing, and navigating around obstacles
    // Only do strict checking when path is clearly blocked or target is very high/low
    if (horizontalDist <= 12 && Math.abs(dy) <= 4 && !(dy > 2 && horizontalDist <= 10)) {
        // When close (dist <= 3), skip quick check and always do detailed path checking
        // This ensures consistent detection of blocking blocks
        // BUT: Skip quick check if target is above and close (need stairs)
        if (horizontalDist > 5) {
            // Further away - use quick line-of-sight check first
            // Be more lenient - allow up to 3 blocks obstruction (native AI can navigate)
            const hasClearPath = canSeeTargetThroughBlocks(entity, targetInfo, 3);
            if (hasClearPath) {
                if (getDebugPathfinding() || getDebugGeneral()) {
                    console.warn(`[MINING AI] canReachTargetByWalking: Quick check passed (horizontalDist=${horizontalDist.toFixed(1)} <= 12, dy=${dy.toFixed(1)}, abs=${Math.abs(dy).toFixed(1)} <= 4) - trusting native AI`);
                }
                // Trust native AI - path is clear enough for it to handle
                return true;
            } else {
                // Path might be blocked - check detailed path
                if (getDebugPathfinding() || getDebugGeneral()) {
                    console.warn(`[MINING AI] canReachTargetByWalking: Quick check failed (horizontalDist=${horizontalDist.toFixed(1)}, dy=${dy.toFixed(1)}) - checking detailed path`);
                }
                // Continue to path checking below to determine if mining is needed
            }
        } else {
            // Close (dist <= 5) - trust native AI for close targets, only check if heavily blocked
            if (getDebugPathfinding() || getDebugGeneral()) {
                console.warn(`[MINING AI] canReachTargetByWalking: Close range (horizontalDist=${horizontalDist.toFixed(1)} <= 5) - checking detailed path`);
            }
            // Continue to detailed path checking below
        }
    }
    
    // If target is significantly above (dy > 2), we need to check if there's a clear path upward
    // Bears can't climb straight up through walls - they need to mine
    // Check if vertical path is actually clear before allowing "walking"
    if (dy > 2) {
        // Check if there's a clear vertical path upward
        const baseX = Math.floor(loc.x);
        const baseY = Math.floor(loc.y);
        const baseZ = Math.floor(loc.z);
        
        let verticalPathBlocked = false;
        const checkHeight = Math.min(Math.ceil(dy), 10); // Check up to 10 blocks or target height
        for (let h = 1; h <= checkHeight && !verticalPathBlocked; h++) {
            // Check if there's a solid block blocking upward movement at this height
            for (let tunnelH = 0; tunnelH < tunnelHeight; tunnelH++) {
                const block = getBlock(dimension, baseX, baseY + h + tunnelH, baseZ);
                if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                    verticalPathBlocked = true;
                    break;
                }
            }
        }
        
        // If target is above and we're close horizontally, always require mining (need stairs)
        // Even if vertical path isn't "blocked", bears can't jump 3+ blocks straight up
        if (dy > 2 && horizontalDist <= 10) {
            if (getDebugPathfinding() || getDebugGeneral()) {
                console.warn(`[MINING AI] canReachTargetByWalking: Target above (dy=${dy.toFixed(1)} > 2) and close (dist=${horizontalDist.toFixed(1)} <= 10) - requiring stairs/mining`);
            }
            return false; // Can't reach by walking - need stairs
        }
        
        // If vertical path is blocked and target is more than 3 blocks above, require mining
        if (verticalPathBlocked && dy > 3) {
            if (getDebugPathfinding()) {
                console.warn(`[MINING AI] canReachTargetByWalking: Vertical path blocked (dy=${dy.toFixed(1)}) - requiring mining`);
            }
            return false; // Can't reach by walking - need to mine upward
        }
        
        // If target is very high (8+ blocks) and vertical path is blocked, definitely need mining
        if (dy > 8 && verticalPathBlocked) {
            if (getDebugPathfinding()) {
                console.warn(`[MINING AI] canReachTargetByWalking: Target very high (dy=${dy.toFixed(1)}) and path blocked - requiring mining`);
            }
            return false;
        }
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
    // More lenient path checking - trust native AI to handle pathfinding
    // Allow up to 40% of path to be blocked (native AI can navigate around obstacles)
    // Only require mining if path is heavily blocked (more than 40%)
    // This makes bears pathfind as well as vanilla mobs (skeletons, zombies)
    const maxBlockedSteps = steps <= 3 ? 1 : (steps <= 5 ? 2 : Math.max(2, Math.floor(steps * 0.4))); // Much more lenient (40% vs 15%)
    
    if (getDebugPathfinding() || getDebugGeneral()) {
        console.warn(`[MINING AI] canReachTargetByWalking: Checking path (distance=${distance.toFixed(1)}, steps=${steps}, maxBlockedSteps=${maxBlockedSteps})`);
    }
    
    // Check blocks around the target's location that would prevent the bear from reaching/attacking
    // Only check blocks that would actually block the bear, not normal floor blocks
    const targetX = Math.floor(targetLoc.x);
    const targetY = Math.floor(targetLoc.y);
    const targetZ = Math.floor(targetLoc.z);
    
    // Check if there are blocks that would prevent the bear from getting close enough to attack
    // Check blocks at head/body level (targetY + 1 to targetY + 2) - these would block the bear
    // Don't check targetY (feet level) as that's usually a floor block which is normal
    let targetBlocked = false;
    for (let h = 1; h < tunnelHeight; h++) { // Start at h=1 (skip feet level)
        try {
            const block = dimension.getBlock({ x: targetX, y: targetY + h, z: targetZ });
            if (block && isSolidBlock(block) && !AIR_BLOCKS.has(block.typeId)) {
                if (isBreakableBlock(block) || UNBREAKABLE_BLOCKS.has(block.typeId)) {
                    // This block would prevent the bear from reaching the target
                    targetBlocked = true;
                    if (getDebugPathfinding() || getDebugGeneral()) {
                        console.warn(`[MINING AI] canReachTargetByWalking: Target location blocked at (${targetX}, ${targetY + h}, ${targetZ})`);
                    }
                    break;
                }
            }
        } catch {
            // Error checking block, assume not blocked (be lenient)
        }
    }
    
    // Only block if there are blocks that would actually prevent reaching the target
    // If the target is in a corner with blocks around them, we need to mine
    // But if it's just a floor block, that's normal and shouldn't block
    // ALSO: Check if other entities (especially other bears) are blocking the path
    if (targetBlocked) {
        // Check if there are other entities at the target location (might be other bears)
        // If it's another entity, don't count it as blocked - entities can move
        let hasOtherEntity = false;
        try {
            const entitiesAtTarget = dimension.getEntities({
                location: { x: targetX + 0.5, y: targetY + 1, z: targetZ + 0.5 },
                maxDistance: 1.5,
                excludeTypes: ["minecraft:item", "minecraft:xp_orb"]
            });
            for (const otherEntity of entitiesAtTarget) {
                if (otherEntity.id !== entity.id && otherEntity.id !== targetInfo.entity?.id) {
                    // Another entity is at the target location - don't count as blocked
                    // Entities can move, so this isn't a permanent block
                    hasOtherEntity = true;
                    if (getDebugPathfinding() || getDebugGeneral()) {
                        console.warn(`[MINING AI] canReachTargetByWalking: Other entity (${otherEntity.typeId}) at target location - not counting as blocked`);
                    }
                    break;
                }
            }
        } catch {
            // Error checking entities, continue with block check
        }
        
        // If it's just another entity, don't block - entities can move
        if (hasOtherEntity) {
            targetBlocked = false;
        } else {
            // Also check if there are blocks adjacent to the target that would block access
            // Check blocks in front of target (toward the bear) - these would block the path
            const dirToTargetX = Math.sign(dx) || 0;
            const dirToTargetZ = Math.sign(dz) || 0;
            if (dirToTargetX !== 0 || dirToTargetZ !== 0) {
                // Check block directly in front of target (toward bear)
                // Also check if there's an entity there (entities can move, so don't count as blocked)
                const frontX = targetX + dirToTargetX;
                const frontZ = targetZ + dirToTargetZ;
                let hasEntityInFront = false;
                
                try {
                    const entitiesInFront = dimension.getEntities({
                        location: { x: frontX + 0.5, y: targetY + 0.5, z: frontZ + 0.5 },
                        maxDistance: 1.0,
                        excludeTypes: ["minecraft:item", "minecraft:xp_orb"]
                    });
                    for (const otherEntity of entitiesInFront) {
                        if (otherEntity.id !== entity.id && otherEntity.id !== targetInfo.entity?.id) {
                            // Another entity is in front of target - don't count as blocked
                            hasEntityInFront = true;
                            if (getDebugPathfinding() || getDebugGeneral()) {
                                console.warn(`[MINING AI] canReachTargetByWalking: Entity (${otherEntity.typeId}) in front of target at (${frontX}, ${targetY}, ${frontZ}) - not counting as blocked`);
                            }
                            break;
                        }
                    }
                } catch {
                    // Error checking entities, continue with block check
                }
                
                if (!hasEntityInFront) {
                    try {
                        const frontBlock = dimension.getBlock({ x: frontX, y: targetY, z: frontZ });
                        if (frontBlock && isSolidBlock(frontBlock) && !AIR_BLOCKS.has(frontBlock.typeId)) {
                            if (isBreakableBlock(frontBlock) || UNBREAKABLE_BLOCKS.has(frontBlock.typeId)) {
                                // Block in front of target would prevent bear from reaching them
                                if (getDebugPathfinding() || getDebugGeneral()) {
                                    console.warn(`[MINING AI] canReachTargetByWalking: Block in front of target at (${frontX}, ${targetY}, ${frontZ}) - returning false (need to mine)`);
                                }
                                return false; // Block in front of target - must mine to clear it
                            }
                        }
                    } catch {
                        // Error checking, be lenient
                    }
                }
            }
            
            // Target has blocks at head/body level - need to mine to clear them
            if (getDebugPathfinding() || getDebugGeneral()) {
                console.warn(`[MINING AI] canReachTargetByWalking: Target location blocked - returning false (need to mine to clear target location)`);
            }
            return false; // Target location is blocked - must mine to clear it
        }
    }
    
    for (let i = 1; i < steps && i < 12; i++) { // Check up to 12 steps ahead
        const checkX = Math.floor(loc.x + stepX * i);
        const checkY = Math.floor(loc.y + stepY * i);
        const checkZ = Math.floor(loc.z + stepZ * i);
        
        // Skip if we're checking the target location (already checked above)
        if (checkX === targetX && checkY === targetY && checkZ === targetZ) {
            continue;
        }
        
        // Check if there's a walkable path at this point
        let isBlocked = false;
        
        // Check headroom (need at least tunnelHeight blocks of clearance)
        // Use entity's Y level as reference, not interpolated Y (to ensure consistent headroom checking)
        const baseCheckY = Math.floor(loc.y);
        
        // FIRST: Check if there are entities at this location (especially other bears)
        // Entities can move, so they shouldn't block the path
        let isEntityBlocking = false;
        try {
            // Check for entities at multiple Y levels (entity might be at different heights)
            for (let checkY = baseCheckY; checkY <= baseCheckY + tunnelHeight; checkY++) {
                const entitiesAtStep = dimension.getEntities({
                    location: { x: checkX + 0.5, y: checkY + 0.5, z: checkZ + 0.5 },
                    maxDistance: 1.5, // Increased from 1.0 to catch entities better
                    excludeTypes: ["minecraft:item", "minecraft:xp_orb"]
                });
                for (const otherEntity of entitiesAtStep) {
                    if (otherEntity.id !== entity.id && otherEntity.id !== targetInfo.entity?.id) {
                        // Another entity is blocking this step - don't count as blocked
                        // Entities can move, so this isn't a permanent block
                        // This is especially important for other mining bears
                        isEntityBlocking = true;
                        if (getDebugPathfinding() || getDebugGeneral()) {
                            console.warn(`[MINING AI] canReachTargetByWalking: Step ${i} blocked by entity (${otherEntity.typeId}) at (${checkX}, ${checkY}, ${checkZ}) - not counting as blocked`);
                        }
                        break;
                    }
                }
                if (isEntityBlocking) break;
            }
        } catch {
            // Error checking entities, continue with block check
        }
        
        // If an entity is blocking, skip block check entirely (entities can move)
        let hasBlockingBlock = false;
        if (!isEntityBlocking) {
            for (let h = 0; h < tunnelHeight; h++) {
                try {
                    const block = dimension.getBlock({ x: checkX, y: baseCheckY + h, z: checkZ });
                    if (block && isSolidBlock(block) && !AIR_BLOCKS.has(block.typeId)) {
                        // If it's a breakable block in the way, we need to mine
                        if (isBreakableBlock(block)) {
                            hasBlockingBlock = true;
                            break;
                        }
                        // Unbreakable blocks also block the path
                        if (UNBREAKABLE_BLOCKS.has(block.typeId)) {
                            hasBlockingBlock = true;
                            break;
                        }
                    }
                } catch {
                    hasBlockingBlock = true;
                    break;
                }
            }
        }
        
        // If this step is blocked, check if it's just a corner (can walk around it)
        // Check adjacent blocks to see if there's a walkable path around the corner
        if (hasBlockingBlock) {
            // Check if it's a corner we can walk around
            if (isEntityBlocking) {
                isBlocked = false; // Entity blocking - don't count as blocked
            } else {
                // Check if it's a corner we can walk around
                let canWalkAround = false;
                const adjacentOffsets = [
                    { x: 1, z: 0 }, { x: -1, z: 0 },
                    { x: 0, z: 1 }, { x: 0, z: -1 }
                ];
                
                for (const offset of adjacentOffsets) {
                    const adjX = checkX + offset.x;
                    const adjZ = checkZ + offset.z;
                    let adjClear = true;
                    
                    // First check if there are entities at adjacent position (entities can move, so don't count as blocking)
                    let hasEntityAtAdj = false;
                    try {
                        for (let checkY = baseCheckY; checkY <= baseCheckY + tunnelHeight; checkY++) {
                            const entitiesAtAdj = dimension.getEntities({
                                location: { x: adjX + 0.5, y: checkY + 0.5, z: adjZ + 0.5 },
                                maxDistance: 1.5,
                                excludeTypes: ["minecraft:item", "minecraft:xp_orb"]
                            });
                            for (const otherEntity of entitiesAtAdj) {
                                if (otherEntity.id !== entity.id && otherEntity.id !== targetInfo.entity?.id) {
                                    // Entity at adjacent position - don't count as blocking (entities can move)
                                    hasEntityAtAdj = true;
                                    break;
                                }
                            }
                            if (hasEntityAtAdj) break;
                        }
                    } catch {
                        // Error checking entities, continue with block check
                    }
                    
                    // If entity is at adjacent position, treat it as clear (entities can move)
                    if (hasEntityAtAdj) {
                        adjClear = true; // Entities can move, so adjacent is effectively clear
                    } else {
                        // Check if adjacent position is clear (has headroom)
                        for (let h = 0; h < tunnelHeight; h++) {
                            try {
                                const adjBlock = dimension.getBlock({ x: adjX, y: baseCheckY + h, z: adjZ });
                                if (adjBlock && isSolidBlock(adjBlock) && !AIR_BLOCKS.has(adjBlock.typeId)) {
                                    if (isBreakableBlock(adjBlock) || UNBREAKABLE_BLOCKS.has(adjBlock.typeId)) {
                                        adjClear = false;
                                        break;
                                    }
                                }
                            } catch {
                                adjClear = false;
                                break;
                            }
                        }
                    }
                    
                    // If adjacent position is clear, we can walk around the corner
                    if (adjClear) {
                        canWalkAround = true;
                        break;
                    }
                }
                
                // If we can walk around the corner, don't count it as blocked
                if (canWalkAround) {
                    if (getDebugPathfinding() || getDebugGeneral()) {
                        console.warn(`[MINING AI] canReachTargetByWalking: Step ${i} blocked at (${checkX}, ${baseCheckY}, ${checkZ}) but can walk around corner - not counting as blocked`);
                    }
                    isBlocked = false; // Can walk around corner
                } else {
                    isBlocked = true; // Actually blocked, can't walk around
                }
            }
        } else {
            isBlocked = false;
        }
        
        // Check if there's a floor to walk on (unless we're going down)
        // Use entity's Y level as reference for floor checking
        // Be more lenient - native AI can handle jumping over gaps
        if (!isBlocked && dy >= -2) { // Allow going down up to 2 blocks (native AI can handle it)
            try {
                const floorBlock = dimension.getBlock({ x: checkX, y: baseCheckY - 1, z: checkZ });
                if (!floorBlock || AIR_BLOCKS.has(floorBlock.typeId)) {
                    // No floor - check if there's a floor nearby (within 1 block) to handle erratic terrain
                    let hasNearbyFloor = false;
                    for (const offset of [{x:0,z:0}, {x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}]) {
                        try {
                            const nearbyFloor = dimension.getBlock({ x: checkX + offset.x, y: baseCheckY - 1, z: checkZ + offset.z });
                            if (nearbyFloor && !AIR_BLOCKS.has(nearbyFloor.typeId)) {
                                hasNearbyFloor = true;
                                break;
                            }
                        } catch {
                            // Continue checking
                        }
                    }
                    // Be very lenient about floor - only count as blocked if no floor nearby and multiple steps checked
                    // Native AI can jump over small gaps
                    if (!hasNearbyFloor && i > 4) { // Increased tolerance (i > 4 instead of i > 2)
                        isBlocked = true;
                    }
                }
            } catch {
                // Error checking floor - be lenient, don't assume blocked
                // Only count as blocked if we've checked many steps
                if (i > 5) {
                    isBlocked = true;
                }
            }
        }
        
        if (isBlocked) {
            blockedCount++;
            if (getDebugPathfinding() || getDebugGeneral()) {
                console.warn(`[MINING AI] canReachTargetByWalking: Step ${i} blocked at (${checkX}, ${baseCheckY}, ${checkZ}), blockedCount=${blockedCount}/${maxBlockedSteps}`);
            }
            // If too many steps are blocked, path is not walkable
            if (blockedCount > maxBlockedSteps) {
                if (getDebugPathfinding() || getDebugGeneral()) {
                    console.warn(`[MINING AI] canReachTargetByWalking: Returning false - path too blocked (${blockedCount} > ${maxBlockedSteps})`);
                }
                return false; // Path is too blocked, need to mine
            }
        }
    }
    
    // If we got here, path is mostly clear (or only slightly blocked)
    // Trust native AI to handle pathfinding - only mine if path is heavily blocked
    // This makes bears pathfind as well as vanilla mobs
    const canWalk = blockedCount <= maxBlockedSteps;
    if (getDebugPathfinding() || getDebugGeneral()) {
        console.warn(`[MINING AI] canReachTargetByWalking: Returning ${canWalk} - blockedCount=${blockedCount}, maxBlockedSteps=${maxBlockedSteps} (${((blockedCount/steps)*100).toFixed(1)}% blocked)`);
    }
    return canWalk;
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

    // CRITICAL: Do NOT run this function when target is above - it breaks blocks at foot level
    // Only run when target is at same Y level or below
    if (targetInfo && targetInfo.entity?.location) {
        const loc = entity.location;
        const dy = targetInfo.entity.location.y - loc.y;
        if (dy > 1) {
            // Target is above - skip this function entirely, let carveStair handle upward movement
            if (getDebugGeneral() || getDebugMining()) {
                console.warn(`[MINING AI] clearForwardTunnel: Skipping - target is above (dy=${dy.toFixed(1)}), use carveStair instead`);
            }
            return;
        }
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
        
        // CRITICAL: Never break blocks at feet level (baseY + 0) when target is above
        // This function should not run when target is above (checked at function start),
        // but as a safety measure, always start from baseY + 1 (head level) when target is above
        let start = Math.max(1, startOffset);
        
        // Check if target is above - if so, NEVER break blocks at feet level
        let targetIsAbove = false;
        if (targetInfo && targetInfo.entity?.location) {
            const dy = targetInfo.entity.location.y - loc.y;
            targetIsAbove = dy > 1;
        }
        
        // Only break blocks at feet level if target is NOT above AND foot is blocked
        if (!targetIsAbove && !ascending) {
            start = footBlocked ? 0 : start;
        } else {
            // Target is above OR ascending - start from head level (baseY + 1)
            start = Math.max(1, start);
        }

        // When ascending (target is above), build upward tunnel:
        // 1. First clear the forward path at head level (NOT foot level)
        // 2. Then clear blocks above (so bear can step up)
        // Note: This function should not run when target is above (checked at function start)
        // This code only runs when target is at same level or below
        if (ascending && step === 1) {
            // Step 1: Clear forward path at head level (baseY + 1) and above - NOT at feet level
            // Start from baseY + 1 (head level) to avoid breaking blocks at feet
            for (let h = 1; h < tunnelHeight; h++) {
                if (digContext.cleared >= digContext.max) return;
                const block = getBlock(dimension, targetX, baseY + h, targetZ);
                if (isBreakableBlock(block) && isSolidBlock(block)) {
                    clearBlock(dimension, targetX, baseY + h, targetZ, digContext, entity, targetInfo);
                    return; // Break one block at a time
                }
            }
            
            // Step 2: Clear blocks above (for upward movement)
            // Check at baseY + 1 (one block up) to create upward tunnel
            for (let h = 1; h < height + 1; h++) {
                if (digContext.cleared >= digContext.max) return;
                const targetY = baseY + h;
                const block = getBlock(dimension, targetX, targetY, targetZ);
                if (isBreakableBlock(block) && isSolidBlock(block)) {
                    clearBlock(dimension, targetX, targetY, targetZ, digContext, entity, targetInfo);
                    return; // Break one block at a time
                }
            }
        } else {
            // Normal forward tunneling (not ascending)
            // Break blocks above only if they're blocking the path forward (not automatically)
            // For tough/erratic terrain, check more thoroughly
            // CRITICAL: start is already set to avoid feet level when target is above
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
    
    // Check if aggressive upward mining is needed (target is significantly above)
    const aggressiveUpward = targetInfo ? needsVerticalMining(entity, targetInfo, dimension, tunnelHeight) === "up" : false;
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
    
    // Helper function to mark a specific block as protected (for individual cleared blocks)
    const markBlockProtected = (x, y, z) => {
        const blockKey = `${x},${y},${z}`;
        recentStairBlocks.set(blockKey, currentTick);
        // Also mark nearby blocks (within 1 block horizontally) as protected to prevent overlapping stairs
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue; // Skip the block itself (already marked)
                const nearbyKey = `${x + dx},${y},${z + dz}`;
                // Only mark if not already protected (to preserve older protection times)
                if (!recentStairBlocks.has(nearbyKey)) {
                    recentStairBlocks.set(nearbyKey, currentTick);
                }
            }
        }
    };
    
    // Helper function to check if any nearby blocks are protected (within 1 block horizontally, multiple Y levels)
    const hasNearbyProtectedBlocks = (x, y, z, checkRadius = 1) => {
        // Check multiple Y levels (y-1 to y+2) to catch protected blocks at different heights
        for (let dy = -1; dy <= 2; dy++) {
            for (let dx = -checkRadius; dx <= checkRadius; dx++) {
                for (let dz = -checkRadius; dz <= checkRadius; dz++) {
                    const checkKey = `${x + dx},${y + dy},${z + dz}`;
                    const checkStairTick = recentStairBlocks.get(checkKey);
                    if (checkStairTick !== undefined && (currentTick - checkStairTick) < 200) {
                        return true; // Found a nearby protected block
                    }
                }
            }
        }
        return false; // No nearby protected blocks
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
    
    // Check if target is above - if so, we need to build upward stairs
    let targetIsAbove = false;
    let targetDy = 0;
    if (targetInfo && targetInfo.entity?.location) {
        const targetLoc = targetInfo.entity.location;
        targetDy = targetLoc.y - loc.y;
        targetIsAbove = targetDy > 1; // Target is more than 1 block above
    }
    
    // Always log when building stairs to debug
    if (getDebugGeneral() || getDebugMining()) {
        console.warn(`[MINING AI] carveStair called: targetIsAbove=${targetIsAbove}, dy=${targetDy.toFixed(1)}, baseY=${baseY}, stepX=${stepX}, stepZ=${stepZ}`);
    }
    
    // Before building stairs, check if we're too close to recently built stairs (prevent overlapping)
    // This prevents the bear from building stairs in locations that overlap with recently built stairs
    if (targetIsAbove) {
        // Check if any of the 3-block pattern positions have nearby protected blocks
        const checkPositions = [
            { x: baseX, y: baseY + 2, z: baseZ }, // Block above head
            { x: stepX, y: baseY + 1, z: stepZ }, // Block in front at head level
            { x: stepX, y: baseY + 2, z: stepZ }  // Block above forward block
        ];
        
        let tooCloseToProtectedStairs = false;
        for (const pos of checkPositions) {
            if (hasNearbyProtectedBlocks(pos.x, pos.y, pos.z, 1)) {
                tooCloseToProtectedStairs = true;
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Too close to protected stairs at (${pos.x}, ${pos.y}, ${pos.z}) - skipping stair building this tick`);
                }
                break;
            }
        }
        
        // If too close to protected stairs, skip building stairs this tick (bear should move forward first)
        if (tooCloseToProtectedStairs) {
            return; // Skip building stairs - wait for protection to expire or move further away
        }
    }
    
    // For upward stairs (target is above), we need to:
    // 1. Break blocks ABOVE the current position (baseY + 1, baseY + 2) to create headroom and steps
    // 2. Break blocks in front and above to create a stair going up
    // For downward stairs (target is below), we need to:
    // 1. Break the block at the step location (baseY) to create the step the bear can walk onto
    // 2. Break blocks above the step (baseY + 1) to create headroom
    // 3. Break blocks at the landing area (baseY + 1, one block forward) for the next step
    
    if (targetIsAbove) {
        if (getDebugGeneral() || getDebugMining()) {
            console.warn(`[MINING AI] carveStair: Building UPWARD stairs (dy=${targetDy.toFixed(1)})`);
        }
        // UPWARD STAIRS: 3-block pattern
        // Pattern: Break 3 blocks in order:
        // 1. Block above head (baseX, baseY + 2, baseZ) - headroom
        // 2. Block in front at head level (stepX, baseY + 1, stepZ) - clears forward path
        // 3. Block above the forward block (stepX, baseY + 2, stepZ) - headroom in front
        // Then bear jumps up and forward into that space, increasing Y level by 1, and repeats
        
        // FIRST: Break block above head (baseX, baseY + 2, baseZ) - headroom above current position
        if (digContext.cleared < digContext.max) {
            // CRITICAL: Check if this block OR nearby blocks are protected (part of previously built stairs) BEFORE trying to break it
            const blockAboveHeadKey = `${baseX},${baseY + 2},${baseZ}`;
            const blockAboveHeadStairTick = recentStairBlocks.get(blockAboveHeadKey);
            const hasNearbyProtected = hasNearbyProtectedBlocks(baseX, baseY + 2, baseZ);
            if (blockAboveHeadStairTick !== undefined && (currentTick - blockAboveHeadStairTick) < 200) {
                // This block is part of a protected stair - skip it
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Skipping protected stair block above head (${baseX}, ${baseY + 2}, ${baseZ})`);
                }
                // Continue to next block check
            } else if (hasNearbyProtected) {
                // Nearby blocks are protected - skip to avoid breaking recently built stairs
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Skipping block above head (${baseX}, ${baseY + 2}, ${baseZ}) - nearby protected blocks detected`);
                }
                // Continue to next block check
            } else {
                const blockAboveHead = getBlock(dimension, baseX, baseY + 2, baseZ);
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Checking block above head (${baseX}, ${baseY + 2}, ${baseZ}), type=${blockAboveHead?.typeId || 'null'}, isBreakable=${isBreakableBlock(blockAboveHead)}, isSolid=${isSolidBlock(blockAboveHead)}`);
                }
                if (isBreakableBlock(blockAboveHead) && isSolidBlock(blockAboveHead)) {
                    activeStairWork.set(stepKey, { entityId, tick: currentTick });
                    const cleared = clearBlock(dimension, baseX, baseY + 2, baseZ, digContext, entity, targetInfo);
                if (getDebugGeneral() || getDebugMining()) {
                    if (cleared) {
                        console.warn(`[MINING AI] carveStair (UPWARD): Cleared block above head (${baseX}, ${baseY + 2}, ${baseZ}), type=${blockAboveHead?.typeId}`);
                        // Mark this specific block as protected
                        markBlockProtected(baseX, baseY + 2, baseZ);
                    } else {
                        console.warn(`[MINING AI] carveStair (UPWARD): Failed to clear block above head (${baseX}, ${baseY + 2}, ${baseZ}), cleared=${digContext.cleared}/${digContext.max}`);
                    }
                }
                markStairProtected();
                return; // Break one block at a time
                }
            }
        }
        
        // SECOND: Break block in front at head level (stepX, baseY + 1, stepZ) - block in front of face
        if (digContext.cleared < digContext.max) {
            // CRITICAL: Check if this block OR nearby blocks are protected (part of previously built stairs) BEFORE trying to break it
            const blockInFrontKey = `${stepX},${baseY + 1},${stepZ}`;
            const blockInFrontStairTick = recentStairBlocks.get(blockInFrontKey);
            const hasNearbyProtected = hasNearbyProtectedBlocks(stepX, baseY + 1, stepZ);
            if (blockInFrontStairTick !== undefined && (currentTick - blockInFrontStairTick) < 200) {
                // This block is part of a protected stair - skip it
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Skipping protected stair block in front at head level (${stepX}, ${baseY + 1}, ${stepZ})`);
                }
                // Continue to next block check
            } else if (hasNearbyProtected) {
                // Nearby blocks are protected - skip to avoid breaking recently built stairs
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Skipping block in front at head level (${stepX}, ${baseY + 1}, ${stepZ}) - nearby protected blocks detected`);
                }
                // Continue to next block check
            } else {
                const blockInFront = getBlock(dimension, stepX, baseY + 1, stepZ);
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Checking block in front at head level (${stepX}, ${baseY + 1}, ${stepZ}), type=${blockInFront?.typeId || 'null'}, isBreakable=${isBreakableBlock(blockInFront)}, isSolid=${isSolidBlock(blockInFront)}`);
                }
                if (isBreakableBlock(blockInFront) && isSolidBlock(blockInFront)) {
                    if (!activeStairWork.has(stepKey)) {
                        activeStairWork.set(stepKey, { entityId, tick: currentTick });
                    }
                    const cleared = clearBlock(dimension, stepX, baseY + 1, stepZ, digContext, entity, targetInfo);
                if (getDebugGeneral() || getDebugMining()) {
                    if (cleared) {
                        console.warn(`[MINING AI] carveStair (UPWARD): Cleared block in front at head level (${stepX}, ${baseY + 1}, ${stepZ}), type=${blockInFront?.typeId}`);
                        // Mark this specific block as protected
                        markBlockProtected(stepX, baseY + 1, stepZ);
                    } else {
                        console.warn(`[MINING AI] carveStair (UPWARD): Failed to clear block in front at head level (${stepX}, ${baseY + 1}, ${stepZ}), cleared=${digContext.cleared}/${digContext.max}`);
                    }
                }
                markStairProtected();
                return; // Break one block at a time
                }
            }
        }
        
        // THIRD: Break block above the forward block (stepX, baseY + 2, stepZ) - above the block in front
        if (digContext.cleared < digContext.max) {
            // CRITICAL: Check if this block OR nearby blocks are protected (part of previously built stairs) BEFORE trying to break it
            const blockAboveFrontKey = `${stepX},${baseY + 2},${stepZ}`;
            const blockAboveFrontStairTick = recentStairBlocks.get(blockAboveFrontKey);
            const hasNearbyProtected = hasNearbyProtectedBlocks(stepX, baseY + 2, stepZ);
            if (blockAboveFrontStairTick !== undefined && (currentTick - blockAboveFrontStairTick) < 200) {
                // This block is part of a protected stair - skip it
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Skipping protected stair block above forward block (${stepX}, ${baseY + 2}, ${stepZ})`);
                }
                // Continue to next block check
            } else if (hasNearbyProtected) {
                // Nearby blocks are protected - skip to avoid breaking recently built stairs
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Skipping block above forward block (${stepX}, ${baseY + 2}, ${stepZ}) - nearby protected blocks detected`);
                }
                // Continue to next block check
            } else {
                const blockAboveFront = getBlock(dimension, stepX, baseY + 2, stepZ);
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] carveStair (UPWARD): Checking block above forward block (${stepX}, ${baseY + 2}, ${stepZ}), type=${blockAboveFront?.typeId || 'null'}, isBreakable=${isBreakableBlock(blockAboveFront)}, isSolid=${isSolidBlock(blockAboveFront)}`);
                }
                if (isBreakableBlock(blockAboveFront) && isSolidBlock(blockAboveFront)) {
                    if (!activeStairWork.has(stepKey)) {
                        activeStairWork.set(stepKey, { entityId, tick: currentTick });
                    }
                    const cleared = clearBlock(dimension, stepX, baseY + 2, stepZ, digContext, entity, targetInfo);
                if (getDebugGeneral() || getDebugMining()) {
                    if (cleared) {
                        console.warn(`[MINING AI] carveStair (UPWARD): Cleared block above forward block (${stepX}, ${baseY + 2}, ${stepZ}), type=${blockAboveFront?.typeId}`);
                        // Mark this specific block as protected
                        markBlockProtected(stepX, baseY + 2, stepZ);
                    } else {
                        console.warn(`[MINING AI] carveStair (UPWARD): Failed to clear block above forward block (${stepX}, ${baseY + 2}, ${stepZ}), cleared=${digContext.cleared}/${digContext.max}`);
                    }
                }
                markStairProtected();
                return; // Break one block at a time
            }
        }
        
        // If all 3 blocks are already air (open cave), check for blocks higher up that might block upward movement
        // OR: The bear can still jump up even if there are no blocks to break (it's an open cave)
        // Check a few blocks higher to see if there are blocks blocking the upward path
        // ALSO: Check blocks along the path toward the target (not just directly above)
        if (digContext.cleared < digContext.max) {
            // Check blocks higher up (baseY + 3, baseY + 4, baseY + 5) that might block upward movement
            for (let checkY = baseY + 3; checkY <= baseY + 5; checkY++) {
                if (digContext.cleared >= digContext.max) break;
                
                // Check block above current position
                const blockAbove = getBlock(dimension, baseX, checkY, baseZ);
                if (isBreakableBlock(blockAbove) && isSolidBlock(blockAbove)) {
                    if (!activeStairWork.has(stepKey)) {
                        activeStairWork.set(stepKey, { entityId, tick: currentTick });
                    }
                    // Double-check that block is still solid before clearing
                    const blockBeforeClear = getBlock(dimension, baseX, checkY, baseZ);
                    if (!isBreakableBlock(blockBeforeClear) || !isSolidBlock(blockBeforeClear)) {
                        if (getDebugGeneral() || getDebugMining()) {
                            console.warn(`[MINING AI] carveStair (UPWARD): Skipping block at (${baseX}, ${checkY}, ${baseZ}) - not breakable/solid, type=${blockBeforeClear?.typeId}, isBreakable=${isBreakableBlock(blockBeforeClear)}, isSolid=${isSolidBlock(blockBeforeClear)}`);
                        }
                        continue; // Skip this block - it's not actually breakable
                    }
                    const cleared = clearBlock(dimension, baseX, checkY, baseZ, digContext, entity, targetInfo);
                    if (getDebugGeneral() || getDebugMining()) {
                        if (cleared) {
                            const blockAfterClear = getBlock(dimension, baseX, checkY, baseZ);
                            console.warn(`[MINING AI] carveStair (UPWARD): Cleared blocking block higher up above head (${baseX}, ${checkY}, ${baseZ}), was=${blockBeforeClear?.typeId}, now=${blockAfterClear?.typeId}`);
                            // Mark this specific block as protected
                            markBlockProtected(baseX, checkY, baseZ);
                        } else {
                            const blockAfterAttempt = getBlock(dimension, baseX, checkY, baseZ);
                            console.warn(`[MINING AI] carveStair (UPWARD): Failed to clear block at (${baseX}, ${checkY}, ${baseZ}), was=${blockBeforeClear?.typeId}, now=${blockAfterAttempt?.typeId}`);
                        }
                    }
                    markStairProtected();
                    return; // Break one block at a time
                }
                
                // Check block in front at this height
                const blockInFront = getBlock(dimension, stepX, checkY, stepZ);
                if (isBreakableBlock(blockInFront) && isSolidBlock(blockInFront)) {
                    if (!activeStairWork.has(stepKey)) {
                        activeStairWork.set(stepKey, { entityId, tick: currentTick });
                    }
                    // Double-check that block is still solid before clearing
                    const blockBeforeClear = getBlock(dimension, stepX, checkY, stepZ);
                    if (!isBreakableBlock(blockBeforeClear) || !isSolidBlock(blockBeforeClear)) {
                        if (getDebugGeneral() || getDebugMining()) {
                            console.warn(`[MINING AI] carveStair (UPWARD): Skipping block at (${stepX}, ${checkY}, ${stepZ}) - not breakable/solid, type=${blockBeforeClear?.typeId}, isBreakable=${isBreakableBlock(blockBeforeClear)}, isSolid=${isSolidBlock(blockBeforeClear)}`);
                        }
                        continue; // Skip this block - it's not actually breakable
                    }
                    const cleared = clearBlock(dimension, stepX, checkY, stepZ, digContext, entity, targetInfo);
                    if (getDebugGeneral() || getDebugMining()) {
                        if (cleared) {
                            const blockAfterClear = getBlock(dimension, stepX, checkY, stepZ);
                            console.warn(`[MINING AI] carveStair (UPWARD): Cleared blocking block higher up in front (${stepX}, ${checkY}, ${stepZ}), was=${blockBeforeClear?.typeId}, now=${blockAfterClear?.typeId}`);
                            // Mark this specific block as protected
                            markBlockProtected(stepX, checkY, stepZ);
                        } else {
                            const blockAfterAttempt = getBlock(dimension, stepX, checkY, stepZ);
                            console.warn(`[MINING AI] carveStair (UPWARD): Failed to clear block at (${stepX}, ${checkY}, ${stepZ}), was=${blockBeforeClear?.typeId}, now=${blockAfterAttempt?.typeId}`);
                        }
                    }
                    markStairProtected();
                    return; // Break one block at a time
                }
            }
            
            // Also check blocks along the diagonal path toward the target (if target is above and in a direction)
            // This helps find blocks that might be blocking the upward path when the bear is in an open cave
            if (targetInfo && targetInfo.entity?.location && targetDy > 2) {
                const targetLoc = targetInfo.entity.location;
                const dx = targetLoc.x - loc.x;
                const dz = targetLoc.z - loc.z;
                const horizontalDist = Math.hypot(dx, dz);
                
                // Only check if target is reasonably close (within 15 blocks)
                if (horizontalDist > 0 && horizontalDist <= 15) {
                    const dirX = dx / horizontalDist;
                    const dirZ = dz / horizontalDist;
                    
                    // Check blocks 2-3 steps ahead along the path toward the target, at various heights
                    for (let stepAhead = 2; stepAhead <= 3 && digContext.cleared < digContext.max; stepAhead++) {
                        const checkX = Math.floor(loc.x + dirX * stepAhead);
                        const checkZ = Math.floor(loc.z + dirZ * stepAhead);
                        
                        // Check heights that would block upward movement (baseY+1 to baseY+3 relative to bear's position)
                        for (let checkY = baseY + 1; checkY <= baseY + 3 && digContext.cleared < digContext.max; checkY++) {
                            // CRITICAL: Check if this block is protected (part of previously built stairs) BEFORE trying to break it
                            // If it's protected, skip it - we don't want to break stairs we just built
                            const checkBlockKey = `${checkX},${checkY},${checkZ}`;
                            const checkStairTick = recentStairBlocks.get(checkBlockKey);
                            if (checkStairTick !== undefined && (currentTick - checkStairTick) < 200) {
                                // This block is part of a protected stair - skip it
                                if (getDebugGeneral() || getDebugMining()) {
                                    console.warn(`[MINING AI] carveStair (UPWARD): Skipping protected stair block along path (${checkX}, ${checkY}, ${checkZ}), stepAhead=${stepAhead}`);
                                }
                                continue; // Skip this protected block
                            }
                            
                            const block = getBlock(dimension, checkX, checkY, checkZ);
                            if (isBreakableBlock(block) && isSolidBlock(block)) {
                                if (!activeStairWork.has(stepKey)) {
                                    activeStairWork.set(stepKey, { entityId, tick: currentTick });
                                }
                                const cleared = clearBlock(dimension, checkX, checkY, checkZ, digContext, entity, targetInfo);
                                if (getDebugGeneral() || getDebugMining()) {
                                    if (cleared) {
                                        // Re-check block type in case it was cleared
                                        const blockAfter = getBlock(dimension, checkX, checkY, checkZ);
                                        console.warn(`[MINING AI] carveStair (UPWARD): Cleared blocking block along path toward target (${checkX}, ${checkY}, ${checkZ}), was=${block?.typeId}, now=${blockAfter?.typeId}, stepAhead=${stepAhead}`);
                                        // Mark this specific block as protected
                                        markBlockProtected(checkX, checkY, checkZ);
                                    } else {
                                        // Block wasn't cleared - log why
                                        const blockAfter = getBlock(dimension, checkX, checkY, checkZ);
                                        console.warn(`[MINING AI] carveStair (UPWARD): Failed to clear block along path (${checkX}, ${checkY}, ${checkZ}), was=${block?.typeId}, now=${blockAfter?.typeId}, isBreakable=${isBreakableBlock(block)}, isSolid=${isSolidBlock(block)}, stepAhead=${stepAhead}`);
                                    }
                                }
                                markStairProtected();
                                return; // Break one block at a time
                            }
                        }
                    }
                }
            }
        }
        
        // Pattern: Break 3 blocks: (x, y+2), (x+1, y+1), (x+1, y+2)
        // If all are already air (open cave), bear can still jump up - movement code will handle it
        if (getDebugGeneral() || getDebugMining()) {
            console.warn(`[MINING AI] carveStair (UPWARD): Completed checking 3-block upward stair pattern (dy=${targetDy.toFixed(1)}) - all blocks checked are air (open cave), bear should jump up via movement`);
        }
    } else {
        // DOWNWARD/LEVEL STAIRS: Break blocks at same level or below
        // FIRST: Break the block at the step location (the actual stair step)
        if (digContext.cleared < digContext.max) {
            const stepBlock = getBlock(dimension, stepX, baseY, stepZ);
            if (getDebugGeneral() && digContext.cleared === 0) {
                console.warn(`[MINING AI] carveStair: Checking step block at (${stepX}, ${baseY}, ${stepZ}), type=${stepBlock?.typeId || 'null'}, isBreakable=${isBreakableBlock(stepBlock)}, isSolid=${isSolidBlock(stepBlock)}`);
            }
            if (isBreakableBlock(stepBlock) && isSolidBlock(stepBlock)) {
                // Claim this stair location
                activeStairWork.set(stepKey, { entityId, tick: currentTick });
                const cleared = clearBlock(dimension, stepX, baseY, stepZ, digContext, entity, targetInfo);
                if (getDebugGeneral()) {
                    if (cleared) {
                        console.warn(`[MINING AI] carveStair: Cleared step block at (${stepX}, ${baseY}, ${stepZ}), type=${stepBlock?.typeId}`);
                    } else {
                        const block = getBlock(dimension, stepX, baseY, stepZ);
                        console.warn(`[MINING AI] carveStair: Failed to clear step block at (${stepX}, ${baseY}, ${stepZ}): ${block?.typeId || 'null'}, isBreakable=${isBreakableBlock(block)}, cleared=${digContext.cleared}/${digContext.max}`);
                    }
                }
                // Mark as protected
                markStairProtected();
                return; // Break one block at a time
            }
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
        const cleared = clearBlock(dimension, stepX, targetY, stepZ, digContext, entity, targetInfo);
        if (getDebugGeneral()) {
            if (cleared) {
                console.warn(`[MINING AI] carveStair: Cleared headroom block at (${stepX}, ${targetY}, ${stepZ}), type=${block?.typeId}`);
            } else {
                console.warn(`[MINING AI] carveStair: Failed to clear headroom block at (${stepX}, ${targetY}, ${stepZ}): ${block?.typeId || 'null'}, cleared=${digContext.cleared}/${digContext.max}`);
            }
        }
        markStairProtected();
        // Don't apply upward impulse here - let the bear walk naturally
        // Upward impulses are too strong and cause flying/jumping
        return; // Break one block at a time
    }
    
    // REMOVED: Side block clearing that was creating star patterns
    // Only break blocks directly in the forward path, not side blocks

    // THIRD: Ensure landing area one block up and forward is clear (for the next step up).
    // This is PRIORITY - clear the immediate path first before checking target level
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
        if (getDebugGeneral() && digContext.cleared === 0) {
            console.warn(`[MINING AI] carveStair: Checking landing block at (${landingX}, ${baseY + 1}, ${landingZ}), type=${landingBlock?.typeId || 'null'}, isBreakable=${isBreakableBlock(landingBlock)}, isSolid=${isSolidBlock(landingBlock)}`);
        }
        if (isBreakableBlock(landingBlock) && isSolidBlock(landingBlock)) {
            // Claim this landing location
            activeStairWork.set(landingKey, { entityId, tick: currentTick });
            const cleared = clearBlock(dimension, landingX, baseY + 1, landingZ, digContext, entity, targetInfo);
            if (getDebugGeneral()) {
                if (cleared) {
                    console.warn(`[MINING AI] carveStair: Cleared landing block at (${landingX}, ${baseY + 1}, ${landingZ}), type=${landingBlock?.typeId}`);
                } else {
                    const block = getBlock(dimension, landingX, baseY + 1, landingZ);
                    // Check why it failed
                    const withinReach = entity ? isBlockWithinReach(entity, landingX, baseY + 1, landingZ) : false;
                    const canSee = entity ? canSeeBlock(entity, landingX, baseY + 1, landingZ, targetInfo) : false;
                    const blockKey = `${landingX},${baseY + 1},${landingZ}`;
                    const isProtected = recentStairBlocks.has(blockKey);
                    console.warn(`[MINING AI] carveStair: Failed to clear landing block at (${landingX}, ${baseY + 1}, ${landingZ}): ${block?.typeId || 'null'}, isBreakable=${isBreakableBlock(block)}, withinReach=${withinReach}, canSee=${canSee}, isProtected=${isProtected}, cleared=${digContext.cleared}/${digContext.max}`);
                }
            }
            // Mark as protected
            markStairProtected();
            // Don't apply upward impulse here - let the bear walk naturally onto the landing
            // Upward impulses are too strong and cause flying/jumping
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
        const cleared = clearBlock(dimension, landingX, targetY, landingZ, digContext, entity, targetInfo);
        if (getDebugGeneral() && !cleared) {
            console.warn(`[MINING AI] carveStair: Failed to clear landing headroom block at (${landingX}, ${targetY}, ${landingZ}): ${block?.typeId || 'null'}, cleared=${digContext.cleared}/${digContext.max}`);
        }
        markStairProtected();
        return; // Break one block at a time
    }
    
    // FIFTH: If target is provided and significantly above, also check blocks at target's Y level
    // This ensures we clear blocks that would block reaching the target, but only after clearing immediate path
    // IMPORTANT: Only check blocks that are within reach - don't try to break blocks that are too far away
    // CRITICAL: When bear is far below target, focus ONLY on building stairs - skip target-level checks entirely
    if (targetInfo && targetInfo.entity?.location && digContext.cleared < digContext.max) {
        const targetLoc = targetInfo.entity.location;
        const targetY = Math.floor(targetLoc.y);
        const dy = targetLoc.y - loc.y;
        
        // Calculate horizontal distance to target
        const dx = targetLoc.x - loc.x;
        const dz = targetLoc.z - loc.z;
        const horizontalDist = Math.hypot(dx, dz);
        
        // If target is significantly above (more than 2 blocks), check blocks at target's level
        // BUT: Only if we're close enough horizontally OR have climbed high enough
        // If bear is far below AND far horizontally, skip target checks entirely - just build stairs
        if (dy > 2) {
            // Skip target-level checks if:
            // 1. Bear is far below (dy > 3) AND far horizontally (distance > 6) - focus on stairs only
            // 2. OR if target-level blocks are out of reach
            const shouldCheckTargetLevel = horizontalDist <= 6 || dy <= 3;
            
            if (!shouldCheckTargetLevel) {
                if (getDebugGeneral()) {
                    console.warn(`[MINING AI] carveStair: Skipping target-level checks - bear too far below (dy=${dy.toFixed(1)}) and horizontally (dist=${horizontalDist.toFixed(1)}) - focusing on building stairs`);
                }
                // Don't check target level - just focus on building stairs
                return;
            }
            
            const targetX = Math.floor(targetLoc.x);
            const targetZ = Math.floor(targetLoc.z);
            const dirToTargetX = Math.sign(targetLoc.x - loc.x) || 0;
            const dirToTargetZ = Math.sign(targetLoc.z - loc.z) || 0;
            
            // Check blocks at target location (head/body level) - these would block reaching target
            // BUT: Only if they're within reach (don't try to break blocks 10+ blocks away)
            for (let h = 1; h < tunnelHeight; h++) {
                if (digContext.cleared >= digContext.max) return;
                const checkX = targetX;
                const checkY = targetY + h;
                const checkZ = targetZ;
                
                // CRITICAL: Check if block is within reach before trying to break it
                if (!isBlockWithinReach(entity, checkX, checkY, checkZ)) {
                    if (getDebugGeneral()) {
                        const dist = Math.hypot((checkX + 0.5) - loc.x, (checkY + 0.5) - loc.y, (checkZ + 0.5) - loc.z);
                        console.warn(`[MINING AI] carveStair: Skipping block at target level (${checkX}, ${checkY}, ${checkZ}) - too far (${dist.toFixed(1)} > ${PLAYER_REACH_DISTANCE})`);
                    }
                    continue; // Skip this block, it's too far - focus on building stairs closer first
                }
                
                const block = getBlock(dimension, checkX, checkY, checkZ);
                if (isBreakableBlock(block) && isSolidBlock(block)) {
                    if (getDebugGeneral()) {
                        console.warn(`[MINING AI] carveStair: Clearing block at target level (${checkX}, ${checkY}, ${checkZ}), type=${block?.typeId}`);
                    }
                    clearBlock(dimension, checkX, checkY, checkZ, digContext, entity, targetInfo);
                    markStairProtected();
                    return;
                }
            }
            
            // Check block in front of target (toward bear) at target's Y level
            // BUT: Only if within reach
            if ((dirToTargetX !== 0 || dirToTargetZ !== 0) && digContext.cleared < digContext.max) {
                const frontX = targetX + dirToTargetX;
                const frontZ = targetZ + dirToTargetZ;
                for (let h = 0; h < tunnelHeight; h++) {
                    if (digContext.cleared >= digContext.max) return;
                    const checkY = targetY + h;
                    
                    // CRITICAL: Check if block is within reach before trying to break it
                    if (!isBlockWithinReach(entity, frontX, checkY, frontZ)) {
                        if (getDebugGeneral()) {
                            const dist = Math.hypot((frontX + 0.5) - loc.x, (checkY + 0.5) - loc.y, (frontZ + 0.5) - loc.z);
                            console.warn(`[MINING AI] carveStair: Skipping block in front of target (${frontX}, ${checkY}, ${frontZ}) - too far (${dist.toFixed(1)} > ${PLAYER_REACH_DISTANCE})`);
                        }
                        continue; // Skip this block, it's too far
                    }
                    
                    const block = getBlock(dimension, frontX, checkY, frontZ);
                    if (isBreakableBlock(block) && isSolidBlock(block)) {
                        if (getDebugGeneral()) {
                            console.warn(`[MINING AI] carveStair: Clearing block in front of target at target level (${frontX}, ${checkY}, ${frontZ}), type=${block?.typeId}`);
                        }
                        clearBlock(dimension, frontX, checkY, frontZ, digContext, entity, targetInfo);
                        markStairProtected();
                        return;
                    }
                }
            }
        }
    }
    
    // FIFTH: Improved stair casing - clear side blocks ONLY when they're blocking movement
    // This prevents getting stuck on stair edges, but maintains efficiency (still mines 1 block at a time)
    // Only clears side blocks when absolutely necessary - doesn't create wider tunnels
    const improveStairCasing = true; // Always enable improved stair casing
    if (improveStairCasing && digContext.cleared < digContext.max) {
        // Calculate perpendicular directions (left and right of forward direction)
        const leftDir = { x: -dirZ, z: dirX };
        const rightDir = { x: dirZ, z: -dirX };
        
        // Only check side blocks at the step position (not landing) to be more conservative
        // Clear side blocks ONLY if they're directly blocking the step path
        const sidePositions = [
            { x: stepX + leftDir.x, z: stepZ + leftDir.z },
            { x: stepX + rightDir.x, z: stepZ + rightDir.z }
        ];
        
        for (const sidePos of sidePositions) {
            if (digContext.cleared >= digContext.max) break;
            // Only check at foot level (baseY) - side blocks at this height can block movement onto the step
            const sideBlock = getBlock(dimension, sidePos.x, baseY, sidePos.z);
            if (sideBlock && isBreakableBlock(sideBlock) && isSolidBlock(sideBlock)) {
                // Only clear if the step itself is clear (we're ready to use it)
                const stepBlock = getBlock(dimension, stepX, baseY, stepZ);
                if (!stepBlock || AIR_BLOCKS.has(stepBlock.typeId)) {
                    // Step is clear, side block at foot level might block movement - clear it
                    // This is the ONLY side block we clear - maintains 1-block-wide path efficiency
                    clearBlock(dimension, sidePos.x, baseY, sidePos.z, digContext, entity, targetInfo);
                    markStairProtected();
                    return; // Still mines one block at a time
                }
            }
        }
    }
    
    // SIXTH: For erratic terrain, also check and clear blocks that might be above the current position
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
    
    // SEVENTH: If aggressive upward mining, also check and clear blocks 2 blocks up (for faster upward progress)
    if (aggressiveUpward && digContext.cleared < digContext.max) {
        // Check blocks 2 blocks up in the forward direction
        for (let h = 0; h < tunnelHeight; h++) {
            if (digContext.cleared >= digContext.max) return;
            const block = getBlock(dimension, stepX, baseY + 2 + h, stepZ);
            if (isBreakableBlock(block) && isSolidBlock(block)) {
                if (getDebugVertical()) {
                    console.warn(`[MINING AI] Aggressive upward: clearing block at (${stepX}, ${baseY + 2 + h}, ${stepZ})`);
                }
                clearBlock(dimension, stepX, baseY + 2 + h, stepZ, digContext, entity, targetInfo);
                return;
            }
        }
    }
    
    // All stairs are cleared - mark locations as protected
    markStairProtected();
}

/**
 * Check if a spiral staircase is viable at the current location
 * Returns true if there are blocks to break and the terrain is suitable
 * @param {Entity} entity - The entity checking viability
 * @param {number} tunnelHeight - Height of the tunnel
 * @param {Object} directionOverride - Optional direction override
 * @param {boolean} goingDown - If true, check for downward spiral; if false, check for upward spiral
 */
function isSpiralStairViable(entity, tunnelHeight, directionOverride = null, goingDown = false) {
    const dimension = entity?.dimension;
    if (!dimension) return false;
    
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    if (dirX === 0 && dirZ === 0) return false;
    
    // CRITICAL: Check if path is already clear (open cave) - don't use spiral stairs!
    // Spiral stairs are only for when you're in solid blocks and need to mine your way up/down
    let pathIsClear = true;
    const centerX = baseX;
    const centerZ = baseZ;
    
    // Check 3x3 area around center - if most blocks are air, it's an open cave
    let solidBlockCount = 0;
    let breakableBlockCount = 0;
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            // Skip center (we never break it anyway)
            if (i === 0 && j === 0) continue;
            
            // Check blocks at current level and above/below
            for (let h = 0; h <= (goingDown ? 1 : 2); h++) {
                const checkY = goingDown ? baseY - h : baseY + h;
                const block = getBlock(dimension, centerX + i, checkY, centerZ + j);
                if (block && isSolidBlock(block)) {
                    solidBlockCount++;
                    if (isBreakableBlock(block)) {
                        breakableBlockCount++;
                    }
                }
            }
        }
    }
    
    // If there are very few solid blocks (less than 3), it's likely an open cave
    // Spiral stairs need a good amount of blocks to mine (at least 5-6 blocks in 3x3 area)
    if (breakableBlockCount < 5) {
        if (getDebugGeneral()) {
            console.warn(`[MINING AI] Spiral stair not viable: open cave detected (only ${breakableBlockCount} breakable blocks in 3x3 area)`);
        }
        return false; // Open cave - use regular movement instead
    }
    
    // Also check if the immediate path forward is clear
    // If you can already walk forward and up, don't need spiral stairs
    const forwardX = baseX + dirX;
    const forwardZ = baseZ + dirZ;
    const forwardY = goingDown ? baseY - 1 : baseY + 1;
    
    let forwardPathClear = true;
    for (let h = 0; h < tunnelHeight; h++) {
        const checkY = forwardY + (goingDown ? -h : h);
        const block = getBlock(dimension, forwardX, checkY, forwardZ);
        if (block && isBreakableBlock(block) && isSolidBlock(block)) {
            forwardPathClear = false;
            break;
        }
    }
    
    // If forward path is clear, don't use spiral stairs (just walk/climb normally)
    if (forwardPathClear) {
        if (getDebugGeneral()) {
            console.warn(`[MINING AI] Spiral stair not viable: forward path is already clear`);
        }
        return false; // Path is clear - use regular movement
    }
    
    const spiralDir = { x: -dirZ, z: dirX }; // Perpendicular to forward
    const heightOffset = ((baseY % 4) + 4) % 4; // Normalize to 0-3 for negative Y
    
    // Calculate the first step position
    let stepX = baseX;
    let stepZ = baseZ;
    switch (heightOffset) {
        case 0:
            stepX = baseX + dirX;
            stepZ = baseZ + dirZ;
            break;
        case 1:
            stepX = baseX + dirX + spiralDir.x;
            stepZ = baseZ + dirZ + spiralDir.z;
            break;
        case 2:
            stepX = baseX + dirX;
            stepZ = baseZ + dirZ;
            break;
        case 3:
            stepX = baseX + dirX - spiralDir.x;
            stepZ = baseZ + dirZ - spiralDir.z;
            break;
    }
    
    // Check if there are blocks to break in the spiral path
    // We need at least one breakable block in the step location or headroom/floor
    let hasBreakableBlocks = false;
    
    if (goingDown) {
        // For downward spirals, check blocks below (floor) and at current level
        // Check step location (floor below)
        const stepBlock = getBlock(dimension, stepX, baseY - 1, stepZ);
        if (isBreakableBlock(stepBlock) && isSolidBlock(stepBlock)) {
            hasBreakableBlocks = true;
        }
        
        // Check step location at current level
        if (!hasBreakableBlocks) {
            const stepBlockAtLevel = getBlock(dimension, stepX, baseY, stepZ);
            if (isBreakableBlock(stepBlockAtLevel) && isSolidBlock(stepBlockAtLevel)) {
                hasBreakableBlocks = true;
            }
        }
        
        // Check landing area below
        if (!hasBreakableBlocks) {
            const landingX = stepX + dirX;
            const landingZ = stepZ + dirZ;
            const landingBlock = getBlock(dimension, landingX, baseY - 1, landingZ);
            if (isBreakableBlock(landingBlock) && isSolidBlock(landingBlock)) {
                hasBreakableBlocks = true;
            }
        }
        
        // Check landing area at current level
        if (!hasBreakableBlocks) {
            const landingX = stepX + dirX;
            const landingZ = stepZ + dirZ;
            const landingBlock = getBlock(dimension, landingX, baseY, landingZ);
            if (isBreakableBlock(landingBlock) && isSolidBlock(landingBlock)) {
                hasBreakableBlocks = true;
            }
        }
    } else {
        // For upward spirals, check blocks above (headroom) and at current level
        // Check step location
        const stepBlock = getBlock(dimension, stepX, baseY, stepZ);
        if (isBreakableBlock(stepBlock) && isSolidBlock(stepBlock)) {
            hasBreakableBlocks = true;
        }
        
        // Check headroom above step
        if (!hasBreakableBlocks) {
            for (let h = 0; h < tunnelHeight + 1; h++) {
                const targetY = baseY + 1 + h;
                const block = getBlock(dimension, stepX, targetY, stepZ);
                if (isBreakableBlock(block) && isSolidBlock(block)) {
                    hasBreakableBlocks = true;
                    break;
                }
            }
        }
        
        // Check landing area
        if (!hasBreakableBlocks) {
            const landingX = stepX + dirX;
            const landingZ = stepZ + dirZ;
            const landingBlock = getBlock(dimension, landingX, baseY + 1, landingZ);
            if (isBreakableBlock(landingBlock) && isSolidBlock(landingBlock)) {
                hasBreakableBlocks = true;
            }
        }
        
        // Check headroom above landing
        if (!hasBreakableBlocks) {
            const landingX = stepX + dirX;
            const landingZ = stepZ + dirZ;
            for (let h = 0; h < tunnelHeight + 1; h++) {
                const targetY = baseY + 2 + h;
                const block = getBlock(dimension, landingX, targetY, landingZ);
                if (isBreakableBlock(block) && isSolidBlock(block)) {
                    hasBreakableBlocks = true;
                    break;
                }
            }
        }
    }
    
    // Also check if there are too many unbreakable blocks in the path (terrain not suitable)
    let unbreakableCount = 0;
    const checkPositions = goingDown ? [
        { x: stepX, y: baseY - 1, z: stepZ },
        { x: stepX, y: baseY, z: stepZ },
        { x: stepX + dirX, y: baseY - 1, z: stepZ + dirZ },
        { x: stepX + dirX, y: baseY, z: stepZ + dirZ }
    ] : [
        { x: stepX, y: baseY, z: stepZ },
        { x: stepX, y: baseY + 1, z: stepZ },
        { x: stepX + dirX, y: baseY + 1, z: stepZ + dirZ },
        { x: stepX + dirX, y: baseY + 2, z: stepZ + dirZ }
    ];
    
    for (const pos of checkPositions) {
        const block = getBlock(dimension, pos.x, pos.y, pos.z);
        if (block && !AIR_BLOCKS.has(block.typeId) && UNBREAKABLE_BLOCKS.has(block.typeId)) {
            unbreakableCount++;
        }
    }
    
    // Spiral is viable if there are breakable blocks and not too many unbreakable blocks
    return hasBreakableBlocks && unbreakableCount < 2;
}

/**
 * Create a spiral staircase for easier, less damaging scaling of tall structures
 * Spiral stairs are more efficient for climbs/descents of 4+ blocks
 * @param {Entity} entity - The entity creating the spiral
 * @param {number} tunnelHeight - Height of the tunnel
 * @param {Object} digContext - Digging context
 * @param {Object} directionOverride - Optional direction override
 * @param {Object} targetInfo - Optional target info (used to determine direction)
 */
function carveSpiralStair(entity, tunnelHeight, digContext, directionOverride = null, targetInfo = null) {
    // Determine if we're going up or down based on target position
    let goingDown = false;
    if (targetInfo && targetInfo.entity?.location) {
        const loc = entity.location;
        const targetLoc = targetInfo.entity.location;
        const dy = targetLoc.y - loc.y;
        goingDown = dy < -SPIRAL_STAIR_THRESHOLD; // Use spiral for descents of 4+ blocks
    }
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
    
    // TRUE 3x3 SPIRAL STAIRCASE IMPLEMENTATION
    // Center pillar is at (baseX, baseY, baseZ) - NEVER break this!
    // Spiral rotates around this center pillar in a 3x3 grid
    // Pattern: Mine 1 block above + 3 blocks in front (keep bottom intact), turn 90 degrees, repeat
    
    // Determine current position in 3x3 spiral based on height
    // Each step goes up 1 block, so height determines which step we're on
    // 4 steps = one full rotation around the center (North -> East -> South -> West)
    // We use a simple approach: track spiral state and rotate direction each step
    
    // Calculate which step in the spiral based on height
    // Each step = 1 block up, so we can use height to determine position
    const heightOffset = ((baseY % 4) + 4) % 4; // Which step in current 4-step rotation (0-3)
    
    // Rotate direction 90 degrees clockwise for each step
    // Start with initial direction, rotate for each step taken
    let currentDir = { x: dirX, z: dirZ };
    for (let i = 0; i < heightOffset; i++) {
        // Rotate 90 degrees clockwise: (x, z) -> (-z, x)
        const newX = -currentDir.z;
        const newZ = currentDir.x;
        currentDir = { x: newX, z: newZ };
    }
    
    // Calculate current position: start at edge of 3x3, move forward each step
    // For simplicity, we'll use the entity's current position as the step position
    // The center is always at the starting position
    const centerX = baseX;
    const centerZ = baseZ;
    
    // Current step position - if we're at center, move to first edge position
    let stepX = baseX;
    let stepZ = baseZ;
    
    // If at center, move to first position in spiral (one step in initial direction)
    if (stepX === centerX && stepZ === centerZ) {
        stepX = centerX + dirX;
        stepZ = centerZ + dirZ;
    }
    
    // Forward direction (where we're mining next) - use rotated direction
    let forwardX = stepX + currentDir.x;
    let forwardZ = stepZ + currentDir.z;
    
    // CRITICAL: Never break the center pillar!
    if (forwardX === centerX && forwardZ === centerZ) {
        // Would break center - rotate direction and try again
        const rotatedDir = { x: -currentDir.z, z: currentDir.x };
        const newForwardX = stepX + rotatedDir.x;
        const newForwardZ = stepZ + rotatedDir.z;
        if (newForwardX !== centerX || newForwardZ !== centerZ) {
            currentDir = rotatedDir;
            forwardX = newForwardX;
            forwardZ = newForwardZ;
        } else {
            return; // Can't proceed without breaking center
        }
    }
    
    const stepKey = goingDown ? `${stepX},${baseY - 1},${stepZ}` : `${stepX},${baseY},${stepZ}`;
    const forwardKey = goingDown ? `${forwardX},${baseY - 1},${forwardZ}` : `${forwardX},${baseY + 1},${forwardZ}`;
    
    // Helper function to mark spiral stair locations as protected (including center pillar)
    const markSpiralProtected = () => {
        recentStairBlocks.set(stepKey, currentTick);
        recentStairBlocks.set(forwardKey, currentTick);
        // Protect center pillar - NEVER break it
        const centerKey = `${centerX},${baseY},${centerZ}`;
        recentStairBlocks.set(centerKey, currentTick);
        // Protect all 3x3 positions
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const protectKey = `${centerX + i},${baseY},${centerZ + j}`;
                recentStairBlocks.set(protectKey, currentTick);
            }
        }
    };
    
    // Check if another bear is working on this step
    const existingWork = activeStairWork.get(stepKey);
    if (existingWork && existingWork.entityId !== entityId) {
        const ticksSinceWork = currentTick - existingWork.tick;
        if (ticksSinceWork < STAIR_WORK_LOCK_TICKS) {
            return;
        }
    }
    
    if (goingDown) {
        // DOWNWARD SPIRAL STAIRS
        // Pattern: Mine 1 block above + 2-3 blocks in front (keep bottom intact)
        
        // FIRST: Ensure headroom above current position (1 block above)
        if (digContext.cleared < digContext.max) {
            const blockAbove = getBlock(dimension, stepX, baseY + 1, stepZ);
            if (blockAbove && isBreakableBlock(blockAbove) && isSolidBlock(blockAbove)) {
                if (!activeStairWork.has(stepKey)) {
                    activeStairWork.set(stepKey, { entityId, tick: currentTick });
                }
                // Check line of sight
                if (canSeeBlock(entity, stepX, baseY + 1, stepZ, targetInfo)) {
                    clearBlock(dimension, stepX, baseY + 1, stepZ, digContext, entity, targetInfo);
                    markSpiralProtected();
                    return;
                }
            }
        }
        
        // SECOND: Mine 2-3 blocks in front (top blocks only, keep bottom intact)
        // Forward position is one block down from current
        const forwardY = baseY - 1;
        // Mine blocks at forwardY + 1, forwardY + 2, forwardY + 3 (top blocks)
        // Keep forwardY (bottom block) intact so we can step onto it
        for (let h = 1; h <= 3; h++) {
            if (digContext.cleared >= digContext.max) return;
            const targetY = forwardY + h;
            const block = getBlock(dimension, forwardX, targetY, forwardZ);
            if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                // Check line of sight
                if (canSeeBlock(entity, forwardX, targetY, forwardZ, targetInfo)) {
                    if (!activeStairWork.has(forwardKey)) {
                        activeStairWork.set(forwardKey, { entityId, tick: currentTick });
                    }
                    clearBlock(dimension, forwardX, targetY, forwardZ, digContext, entity, targetInfo);
                    markSpiralProtected();
                    return;
                }
            }
        }
        
        // THIRD: Ensure we have headroom at forward position (for movement)
        if (digContext.cleared < digContext.max) {
            for (let h = 1; h <= tunnelHeight; h++) {
                const targetY = forwardY + h;
                const block = getBlock(dimension, forwardX, targetY, forwardZ);
                if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                    if (canSeeBlock(entity, forwardX, targetY, forwardZ, targetInfo)) {
                        if (!activeStairWork.has(forwardKey)) {
                            activeStairWork.set(forwardKey, { entityId, tick: currentTick });
                        }
                        clearBlock(dimension, forwardX, targetY, forwardZ, digContext, entity, targetInfo);
                        markSpiralProtected();
                        return;
                    }
                }
            }
        }
    } else {
        // UPWARD SPIRAL STAIRS
        // Pattern: Mine 1 block above you + 3 blocks in front (but skip the bottom block in front)
        // This creates: 1x3 space where you are, and 1x2 space in front but 1 block up
        
        // FIRST: Mine 1 block above current position (creates 1x3 space)
        if (digContext.cleared < digContext.max) {
            const blockAbove = getBlock(dimension, stepX, baseY + 1, stepZ);
            if (blockAbove && isBreakableBlock(blockAbove) && isSolidBlock(blockAbove)) {
                if (!activeStairWork.has(stepKey)) {
                    activeStairWork.set(stepKey, { entityId, tick: currentTick });
                }
                // Check line of sight
                if (canSeeBlock(entity, stepX, baseY + 1, stepZ, targetInfo)) {
                    clearBlock(dimension, stepX, baseY + 1, stepZ, digContext, entity, targetInfo);
                    markSpiralProtected();
                    return;
                }
            }
        }
        
        // SECOND: Mine 3 blocks in front (top blocks only, keep bottom intact)
        // Forward position: mine at baseY + 2, baseY + 3, baseY + 4 (top 3 blocks)
        // Keep baseY + 1 (bottom block) intact so we can step onto it
        for (let h = 2; h <= 4; h++) {
            if (digContext.cleared >= digContext.max) return;
            const targetY = baseY + h;
            const block = getBlock(dimension, forwardX, targetY, forwardZ);
            if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                // Check line of sight
                if (canSeeBlock(entity, forwardX, targetY, forwardZ, targetInfo)) {
                    if (!activeStairWork.has(forwardKey)) {
                        activeStairWork.set(forwardKey, { entityId, tick: currentTick });
                    }
                    clearBlock(dimension, forwardX, targetY, forwardZ, digContext, entity, targetInfo);
                    markSpiralProtected();
                    return;
                }
            }
        }
        
        // THIRD: Ensure we have headroom at forward position (for movement after stepping up)
        // After stepping onto forwardX at baseY + 1, we need headroom at baseY + 2, baseY + 3, etc.
        if (digContext.cleared < digContext.max) {
            for (let h = 2; h <= tunnelHeight + 1; h++) {
                const targetY = baseY + h;
                const block = getBlock(dimension, forwardX, targetY, forwardZ);
                if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                    if (canSeeBlock(entity, forwardX, targetY, forwardZ, targetInfo)) {
                        if (!activeStairWork.has(forwardKey)) {
                            activeStairWork.set(forwardKey, { entityId, tick: currentTick });
                        }
                        clearBlock(dimension, forwardX, targetY, forwardZ, digContext, entity, targetInfo);
                        markSpiralProtected();
                        return;
                    }
                }
            }
        }
    }
    
    markSpiralProtected();
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
    
    // If target is provided, check if we should mine more aggressively downward
    let aggressiveDownward = false;
    if (targetInfo && targetInfo.entity?.location) {
        const targetLoc = targetInfo.entity.location;
        const dy = targetLoc.y - loc.y;
        const horizontalDist = Math.hypot(targetLoc.x - loc.x, targetLoc.z - loc.z);
        // If target is significantly below and we're close horizontally, mine more aggressively
        aggressiveDownward = dy < -2 && horizontalDist <= 6;
    }

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
        clearBlock(dimension, landingX, baseY - 1 + h, landingZ, digContext, entity, targetInfo);
        return;
    }
    
    // If target is provided and significantly below, also check blocks at target's Y level
    // This ensures we clear blocks that would block reaching the target, not just immediate ramps
    if (targetInfo && targetInfo.entity?.location && digContext.cleared < digContext.max) {
        const targetLoc = targetInfo.entity.location;
        const targetY = Math.floor(targetLoc.y);
        const dy = targetLoc.y - loc.y;
        
        // If target is significantly below (more than 2 blocks), check blocks at target's level
        // This helps plan ramps that will eventually reach the target
        if (dy < -2) {
            const targetX = Math.floor(targetLoc.x);
            const targetZ = Math.floor(targetLoc.z);
            const dirToTargetX = Math.sign(targetLoc.x - loc.x) || 0;
            const dirToTargetZ = Math.sign(targetLoc.z - loc.z) || 0;
            
            // Check blocks at target location (head/body level) - these would block reaching target
            for (let h = 1; h < tunnelHeight; h++) {
                if (digContext.cleared >= digContext.max) return;
                const block = getBlock(dimension, targetX, targetY + h, targetZ);
                if (isBreakableBlock(block) && isSolidBlock(block)) {
                    if (getDebugGeneral()) {
                        console.warn(`[MINING AI] carveRampDown: Clearing block at target level (${targetX}, ${targetY + h}, ${targetZ}), type=${block?.typeId}`);
                    }
                    clearBlock(dimension, targetX, targetY + h, targetZ, digContext, entity, targetInfo);
                    return;
                }
            }
            
            // Check block in front of target (toward bear) at target's Y level
            if ((dirToTargetX !== 0 || dirToTargetZ !== 0) && digContext.cleared < digContext.max) {
                const frontX = targetX + dirToTargetX;
                const frontZ = targetZ + dirToTargetZ;
                for (let h = 0; h < tunnelHeight; h++) {
                    if (digContext.cleared >= digContext.max) return;
                    const block = getBlock(dimension, frontX, targetY + h, frontZ);
                    if (isBreakableBlock(block) && isSolidBlock(block)) {
                        if (getDebugGeneral()) {
                            console.warn(`[MINING AI] carveRampDown: Clearing block in front of target at target level (${frontX}, ${targetY + h}, ${frontZ}), type=${block?.typeId}`);
                        }
                        clearBlock(dimension, frontX, targetY + h, frontZ, digContext, entity, targetInfo);
                        return;
                    }
                }
            }
        }
    }
    
    // If aggressive downward mining, also check and clear blocks 2 blocks down (for faster downward progress)
    if (aggressiveDownward && digContext.cleared < digContext.max) {
        // Check blocks 2 blocks down in the forward direction
        const block = getBlock(dimension, stepX, baseY - 2, stepZ);
        if (isBreakableBlock(block) && isSolidBlock(block)) {
            if (getDebugVertical()) {
                console.warn(`[MINING AI] Aggressive downward: clearing block at (${stepX}, ${baseY - 2}, ${stepZ})`);
            }
            clearBlock(dimension, stepX, baseY - 2, stepZ, digContext, entity, targetInfo);
            return;
        }
        // Also check landing area 2 blocks down
        for (let h = 0; h < tunnelHeight; h++) {
            if (digContext.cleared >= digContext.max) return;
            const block = getBlock(dimension, landingX, baseY - 2 + h, landingZ);
            if (isBreakableBlock(block) && isSolidBlock(block)) {
                if (getDebugVertical()) {
                    console.warn(`[MINING AI] Aggressive downward: clearing landing block at (${landingX}, ${baseY - 2 + h}, ${landingZ})`);
                }
                clearBlock(dimension, landingX, baseY - 2 + h, landingZ, digContext, entity, targetInfo);
                return;
            }
        }
    }
    
    // Mark ramp blocks as protected (prevent breaking them)
    const currentTick = system.currentTick;
    recentStairBlocks.set(`${stepX},${baseY},${stepZ}`, currentTick);
    recentStairBlocks.set(`${stepX},${baseY - 1},${stepZ}`, currentTick);
    recentStairBlocks.set(`${landingX},${baseY - 1},${landingZ}`, currentTick);
}

function branchTunnel(entity, tunnelHeight, digContext, tick, directionOverride = null) {
    // DISABLED: branchTunnel creates wide, inefficient tunnels by breaking side blocks
    // Only break blocks directly in the forward path for more concise tunnels
    // If needed in the future, this could be re-enabled with stricter conditions
    return;
    
    // Original code (disabled):
    // if (tick % BRANCH_INTERVAL_TICKS !== 0) return;
    // const dimension = entity?.dimension;
    // if (!dimension) return;
    // const loc = entity.location;
    // const baseX = Math.floor(loc.x);
    // const baseY = Math.floor(loc.y);
    // const baseZ = Math.floor(loc.z);
    // const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    // if (dirX === 0 && dirZ === 0) return;
    // 
    // const perpendicular = [
    //     { x: -dirZ, z: dirX },
    //     { x: dirZ, z: -dirX }
    // ];
    // const index = ((tick / BRANCH_INTERVAL_TICKS) | 0) % perpendicular.length;
    // const side = perpendicular[index];
    // const branchX = baseX + side.x;
    // const branchZ = baseZ + side.z;
    // 
    // for (let h = 1; h < Math.min(tunnelHeight, 3); h++) {
    //     if (digContext.cleared >= digContext.max) return;
    //     const block = getBlock(dimension, branchX, baseY + h, branchZ);
    //     if (!isBreakableBlock(block)) continue;
    //     clearBlock(dimension, branchX, baseY + h, branchZ, digContext, entity);
    //     return;
    // }
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
    
    // Use eye level for raycast (entities see from their eyes, not feet)
    const eyeY = origin.y + 1.5; // Typical eye height for entities
    const targetEyeY = target.y + 1.5; // Target's eye level
    
    // Check if target is on same level (within 1 block vertically)
    const sameLevel = Math.abs(dy) <= 1.0;
    const horizontalDist = Math.hypot(dx, dz);
    
    // Be more lenient for same-level targets (they're easier to see)
    // Allow more blocks if on same level and close horizontally
    let effectiveMaxBlocks = maxBlocks;
    if (sameLevel && horizontalDist <= 20) {
        effectiveMaxBlocks = maxBlocks + 2; // Allow 2 more blocks for same-level targets
    }
    
    const steps = Math.ceil(dist);
    const stepX = dx / steps;
    const stepY = (targetEyeY - eyeY) / steps; // Use eye-to-eye raycast
    const stepZ = dz / steps;
    
    let blockCount = 0;
    // Check blocks along the path from eye to eye
    for (let i = 1; i <= steps && blockCount <= effectiveMaxBlocks; i++) {
        const checkX = origin.x + stepX * i;
        const checkY = eyeY + stepY * i;
        const checkZ = origin.z + stepZ * i;
        
        const blockX = Math.floor(checkX);
        const blockY = Math.floor(checkY);
        const blockZ = Math.floor(checkZ);
        
        // Skip if checking the target's position itself
        if (blockX === Math.floor(target.x) && blockY === Math.floor(target.y) && blockZ === Math.floor(target.z)) {
            continue;
        }
        
        try {
            const block = dimension.getBlock({ x: blockX, y: blockY, z: blockZ });
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
    
    // Also check blocks directly in front of target (at target's position offset by 1 block toward entity)
    // This catches blocks that are directly blocking the target but might be missed by raycast
    // Only do this strict check when requiring 0 blocks (clear line of sight)
    if (dist <= 3 && maxBlocks === 0) {
        // When requiring 0 blocks, also check blocks adjacent to target position
        const targetX = Math.floor(target.x);
        const targetY = Math.floor(target.y);
        const targetZ = Math.floor(target.z);
        
        // Check block directly in front of target (toward entity)
        const dirToEntityX = Math.sign(-dx) || 0;
        const dirToEntityZ = Math.sign(-dz) || 0;
        if (dirToEntityX !== 0 || dirToEntityZ !== 0) {
            try {
                const frontBlock = dimension.getBlock({ x: targetX + dirToEntityX, y: targetY, z: targetZ + dirToEntityZ });
                if (frontBlock && !AIR_BLOCKS.has(frontBlock.typeId)) {
                    if (UNBREAKABLE_BLOCKS.has(frontBlock.typeId) || isBreakableBlock(frontBlock)) {
                        return false; // Block directly in front of target blocks the path
                    }
                }
            } catch {
                // Error checking, assume blocked
                return false;
            }
        }
    }
    
    // For same-level targets that are close, be even more lenient
    // If on same level and within 15 blocks horizontally, allow through more blocks
    if (sameLevel && horizontalDist <= 15 && blockCount <= effectiveMaxBlocks + 1) {
        return true; // Very lenient for same-level close targets
    }
    
    return blockCount <= effectiveMaxBlocks; // Can see through if effectiveMaxBlocks or fewer breakable blocks
}

/**
 * Check if a target is on a pillar or bridge (has breakable blocks underneath them)
 * @param {Entity} entity - The entity checking
 * @param {Object} targetInfo - Target information
 * @returns {Object|null} - Returns info about the pillar/bridge, or null if not on one
 */
function isTargetOnPillarOrBridge(entity, targetInfo) {
    if (!targetInfo || !targetInfo.entity?.location) return null;
    
    const dimension = entity?.dimension;
    if (!dimension) return null;
    
    const targetLoc = targetInfo.entity.location;
    const targetX = Math.floor(targetLoc.x);
    const targetY = Math.floor(targetLoc.y);
    const targetZ = Math.floor(targetLoc.z);
    
    // Check if there are breakable blocks underneath the target (indicating a pillar/bridge)
    // Check a 3x3 area under the target to catch bridges
    let hasBreakableBlocks = false;
    let breakableCount = 0;
    const checkRadius = 1; // Check 3x3 area (radius 1)
    
    for (let dx = -checkRadius; dx <= checkRadius; dx++) {
        for (let dz = -checkRadius; dz <= checkRadius; dz++) {
            // Check from target's feet down to 10 blocks below
            for (let y = targetY - 1; y >= targetY - 10; y--) {
                const block = getBlock(dimension, targetX + dx, y, targetZ + dz);
                if (isBreakableBlock(block) && isSolidBlock(block)) {
                    hasBreakableBlocks = true;
                    breakableCount++;
                    break; // Found one breakable block in this column, move to next
                }
            }
        }
    }
    
    if (hasBreakableBlocks) {
        return {
            isOnPillar: true,
            breakableCount: breakableCount,
            targetX: targetX,
            targetY: targetY,
            targetZ: targetZ
        };
    }
    
    return null;
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
    
    const targetX = Math.floor(targetLoc.x);
    const targetY = Math.floor(targetLoc.y);
    const targetZ = Math.floor(targetLoc.z);
    
    // Check if target is on a pillar/bridge
    const pillarInfo = isTargetOnPillarOrBridge(entity, targetInfo);
    const isOnPillar = pillarInfo !== null;
    
    if (getDebugPitfall()) {
        console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: distance=${distance.toFixed(1)}, dy=${dy.toFixed(1)}, targetX=${targetX}, targetY=${targetY}, targetZ=${targetZ}, isOnPillar=${isOnPillar}`);
    }
    
    // CRITICAL: If target is too far away, don't try pitfall - move closer first
    // Pitfall requires being close to the target to break blocks under them
    if (distance > 8) {
        if (getDebugPitfall()) {
            console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Target too far (${distance.toFixed(1)} > 8) - need to move closer first`);
        }
        return; // Too far - need to move closer before trying pitfall
    }
    
    // If target is too high above (dy > 5) and not on pillar, pitfall won't work well
    // This check is already handled in strategy determination, but add safety check here too
    if (dy > 5 && !isOnPillar) {
        if (getDebugPitfall()) {
            console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Target too high (dy=${dy.toFixed(1)} > 5) - pitfall not effective, should use stairs`);
        }
        return; // Too high for pitfall - should use stairs instead
    }
    
    // CRITICAL: Do NOT break blocks under target when target is above (dy > 1)
    // Only break blocks under target when target is at same level or below (dy <= 1)
    // EXPANDED CONDITIONS: Break blocks under target if:
    // 1. Target is on a pillar/bridge AND at same level or below (dy <= 1) - HIGHEST PRIORITY
    // 2. OR: within 8 blocks horizontally AND target is at same level or below (dy <= 1)
    // Do NOT use pitfall for targets above (dy > 1) - stairs are needed instead
    const shouldBreakUnder = dy <= 1 && (isOnPillar || (distance <= 8 && dy <= 1));
    
    if (shouldBreakUnder) {
        if (getDebugPitfall()) {
            console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Conditions met! isOnPillar=${isOnPillar}, distance: ${distance.toFixed(1)} ${distance <= (isOnPillar ? 999 : 8) ? 'OK' : '> 8'}, dy: ${dy.toFixed(1)} ${dy >= (isOnPillar ? -999 : -1) ? 'OK' : '< -1'}`);
        }
        
        // If target is on a pillar/bridge, check a wider area (3x3) to catch bridges
        // Otherwise, just check directly under the target
        const checkRadius = isOnPillar ? 1 : 0; // 3x3 for pillars, 1x1 for normal
        
        // Break blocks from the target's feet down to a reasonable depth
        // For pillars, break deeper to ensure the pillar collapses
        const maxDepth = isOnPillar ? 15 : 5; // Break deeper for pillars
        const startY = targetY - 1; // Start at the block under the target's feet
        const endY = Math.max(targetY - maxDepth, Math.floor(loc.y) - 2); // Break down to a reasonable depth
        
        if (getDebugPitfall()) {
            console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Checking Y range: ${startY} to ${endY}, radius: ${checkRadius} (${isOnPillar ? 'pillar/bridge' : 'normal'})`);
        }
        
        // Check blocks in a grid (3x3 for pillars, 1x1 for normal)
        for (let dx = -checkRadius; dx <= checkRadius; dx++) {
            for (let dz = -checkRadius; dz <= checkRadius; dz++) {
                if (digContext.cleared >= digContext.max) {
                    if (getDebugPitfall()) console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Budget exhausted: ${digContext.cleared}/${digContext.max}`);
                    return;
                }
                
                // Check from top to bottom in this column
                for (let y = startY; y >= endY; y--) {
                    if (digContext.cleared >= digContext.max) return;
                    
                    const checkX = targetX + dx;
                    const checkZ = targetZ + dz;
                    
                    // CRITICAL: Check if block is within reach before trying to break it
                    if (!isBlockWithinReach(entity, checkX, y, checkZ)) {
                        if (getDebugPitfall()) {
                            const blockDist = Math.hypot((checkX + 0.5) - loc.x, (y + 0.5) - loc.y, (checkZ + 0.5) - loc.z);
                            console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Block at (${checkX}, ${y}, ${checkZ}) too far (${blockDist.toFixed(1)} > ${PLAYER_REACH_DISTANCE}) - skipping`);
                        }
                        continue; // Too far, skip this block
                    }
                    
                    const block = getBlock(dimension, checkX, y, checkZ);
                    if (isBreakableBlock(block) && isSolidBlock(block)) {
                        // Check line of sight (pitfall creation is more permissive via canSeeBlock)
                        if (canSeeBlock(entity, checkX, y, checkZ, targetInfo)) {
                            if (getDebugPitfall()) {
                                console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Found breakable block at (${checkX}, ${y}, ${checkZ}): ${block?.typeId}, attempting to break...`);
                            }
                            // Pass targetInfo to allow more permissive vision for pitfall creation
                            const result = clearBlock(dimension, checkX, y, checkZ, digContext, entity, targetInfo);
                            if (getDebugPitfall()) {
                                console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: clearBlock returned: ${result}, cleared=${digContext.cleared}/${digContext.max}`);
                            }
                            return; // Break one block at a time
                        }
                    }
                }
            }
        }
        
        if (getDebugPitfall()) {
            console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: No breakable blocks found in Y range ${startY} to ${endY}, radius: ${checkRadius}`);
        }
    } else {
        if (getDebugPitfall()) {
            console.warn(`[PITFALL DEBUG] breakBlocksUnderTarget: Conditions NOT met: isOnPillar=${isOnPillar}, distance: ${distance.toFixed(1)} ${distance > 8 ? '> 8' : 'OK'}, dy: ${dy.toFixed(1)} ${dy < -1 ? '< -1' : 'OK'}`);
        }
    }
}

/**
 * Check if entity is stuck (hasn't moved much in the last STUCK_DETECTION_TICKS)
 * @param {Entity} entity - The entity to check
 * @param {number} tick - Current tick
 * @returns {boolean} - True if entity is stuck
 */
function isEntityStuck(entity, tick) {
    if (!entity || (typeof entity.isValid === "function" && !entity.isValid())) return false;
    
    const entityId = entity.id;
    const currentPos = entity.location;
    
    // Get or create progress tracking
    let progress = entityProgress.get(entityId);
    if (!progress) {
        progress = {
            lastPosition: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
            lastProgressTick: tick,
            stuckTicks: 0
        };
        entityProgress.set(entityId, progress);
        return false; // Not stuck yet, just started tracking
    }
    
    // Calculate distance moved since last check
    const dx = currentPos.x - progress.lastPosition.x;
    const dy = currentPos.y - progress.lastPosition.y;
    const dz = currentPos.z - progress.lastPosition.z;
    const distanceMoved = Math.hypot(dx, dy, dz);
    
    // Check if entity has moved enough
    if (distanceMoved >= STUCK_THRESHOLD_DISTANCE) {
        // Entity is moving - reset stuck tracking
        progress.lastPosition = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
        progress.lastProgressTick = tick;
        progress.stuckTicks = 0;
        return false;
    }
    
    // Entity hasn't moved much - check how long it's been stuck
    const ticksSinceProgress = tick - progress.lastProgressTick;
    if (ticksSinceProgress >= STUCK_DETECTION_TICKS) {
        // Entity has been stuck for STUCK_DETECTION_TICKS or more
        progress.stuckTicks = ticksSinceProgress;
        return true;
    }
    
    // Not stuck yet, but hasn't moved much
    return false;
}

/**
 * Find the best direction to mine when stuck (checks all 6 directions)
 * @param {Entity} entity - The entity that's stuck
 * @param {Object} targetInfo - Target information (can be null)
 * @param {Dimension} dimension - The dimension
 * @param {number} tunnelHeight - Tunnel height
 * @returns {Object|null} - Best direction {x, y, z} or null if no good direction found
 */
function findBestDirectionWhenStuck(entity, targetInfo, dimension, tunnelHeight) {
    if (!entity || (typeof entity.isValid === "function" && !entity.isValid()) || !dimension) return null;
    
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    
    // All 6 directions: N, S, E, W, Up, Down
    const directions = [
        { x: 0, y: 0, z: -1, name: "North" },
        { x: 0, y: 0, z: 1, name: "South" },
        { x: 1, y: 0, z: 0, name: "East" },
        { x: -1, y: 0, z: 0, name: "West" },
        { x: 0, y: 1, z: 0, name: "Up" },
        { x: 0, y: -1, z: 0, name: "Down" }
    ];
    
    let bestDir = null;
    let bestScore = -Infinity;
    
    // Calculate target direction if we have a target
    let targetDir = null;
    if (targetInfo?.entity?.location) {
        const targetLoc = targetInfo.entity.location;
        const dx = targetLoc.x - loc.x;
        const dy = targetLoc.y - loc.y;
        const dz = targetLoc.z - loc.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 0.1) {
            targetDir = { x: dx / dist, y: dy / dist, z: dz / dist };
        }
    }
    
    for (const dir of directions) {
        let score = 0;
        
        // Check if path is clear (no solid blocks blocking)
        let isClear = true;
        let hasBreakableBlocks = false;
        let hasUnbreakableBlocks = false;
        
        // Check blocks in the direction
        for (let h = 0; h < tunnelHeight; h++) {
            const checkX = baseX + dir.x;
            const checkY = baseY + dir.y + h;
            const checkZ = baseZ + dir.z;
            
            try {
                const block = getBlock(dimension, checkX, checkY, checkZ);
                if (block && !AIR_BLOCKS.has(block.typeId)) {
                    isClear = false;
                    if (isBreakableBlock(block)) {
                        hasBreakableBlocks = true;
                    } else {
                        hasUnbreakableBlocks = true;
                    }
                }
            } catch {
                // Error checking block
            }
        }
        
        // Skip directions with unbreakable blocks
        if (hasUnbreakableBlocks) continue;
        
        // Score based on:
        // 1. Towards target (highest priority)
        // 2. Vertical paths (medium priority)
        // 3. Clear paths (low priority)
        // 4. Paths with breakable blocks (lowest priority)
        
        if (targetDir) {
            // Score based on alignment with target direction
            const dot = dir.x * targetDir.x + dir.y * targetDir.y + dir.z * targetDir.z;
            score += dot * 100; // High weight for moving towards target
        }
        
        // Vertical paths get bonus (can help escape)
        if (dir.y !== 0) {
            score += 20;
        }
        
        // Clear paths are better than blocked paths
        if (isClear) {
            score += 10;
        } else if (hasBreakableBlocks) {
            score += 5; // Can break through, but not ideal
        }
        
        if (score > bestScore) {
            bestScore = score;
            bestDir = dir;
        }
    }
    
    return bestDir;
}

// Target coordination: Manage how many bears can target the same target
function registerBearForTarget(bearId, targetId) {
    if (!targetId) return false;
    let bears = targetCoordination.get(targetId);
    if (!bears) {
        bears = new Set();
        targetCoordination.set(targetId, bears);
    }
    
    // Check if we're already at max capacity
    if (bears.size >= MAX_BEARS_PER_TARGET) {
        return false; // Target is full, can't register
    }
    
    bears.add(bearId);
    return true; // Successfully registered
}

function unregisterBearFromTarget(bearId, targetId) {
    if (!targetId) return;
    const bears = targetCoordination.get(targetId);
    if (bears) {
        bears.delete(bearId);
        // Clean up empty sets
        if (bears.size === 0) {
            targetCoordination.delete(targetId);
        }
    }
}

function getBearsTargeting(targetId) {
    if (!targetId) return new Set();
    return targetCoordination.get(targetId) || new Set();
}

function canBearTarget(bearId, targetId, targetEntity = null) {
    if (!targetId) return true;
    
    // Validate target is still alive if we have the entity object
    if (targetEntity) {
        const isValid = typeof targetEntity.isValid === "function" ? targetEntity.isValid() : Boolean(targetEntity.isValid);
        if (!isValid) {
            // Target is dead - clean it up
            targetCoordination.delete(targetId);
            return true; // Allow targeting (will find new target)
        }
    }
    
    const bears = getBearsTargeting(targetId);
    // Can target if: not at max capacity OR already registered for this target
    return bears.size < MAX_BEARS_PER_TARGET || bears.has(bearId);
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
            // If cached result is null, return null (no target found)
            if (!cached.target) {
                if (getDebugTarget()) {
                    console.warn(`[MINING AI] findNearestTarget: Returning cached null result for entity ${entityId.substring(0, 8)}`);
                }
                return null;
            }
            // Validate cached target is still valid
            if (cached.target?.entity) {
                // Check if entity is valid (handles both function and boolean property)
                const isValid = typeof cached.target.entity.isValid === "function" ? cached.target.entity.isValid() : Boolean(cached.target.entity.isValid);
                // If entity is invalid, fall through to fresh lookup
                if (!isValid) {
                    targetCache.delete(entityId);
                    if (getDebugTarget()) {
                        console.warn(`[MINING AI] findNearestTarget: Cached target invalid for entity ${entityId.substring(0, 8)}`);
                    }
                } else {
                    // Check if target is a player in creative/spectator mode - ignore them
                    const targetEntity = cached.target.entity;
                    if (targetEntity.typeId === "minecraft:player") {
                        try {
                            const gameMode = targetEntity.getGameMode();
                            if (gameMode === "creative" || gameMode === "spectator") {
                                // Target is in creative/spectator mode, invalidate cache and fall through
                                targetCache.delete(entityId);
                                return null;
                            }
                        } catch { }
                    }
                    
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
                        if (getDebugTarget() && currentTick % 20 === 0) {
                            console.warn(`[MINING AI] findNearestTarget: Returning cached target for entity ${entityId.substring(0, 8)}`);
                        }
                        return cached.target;
                    } else {
                        // Target too far, invalidate cache
                        targetCache.delete(entityId);
                        if (getDebugTarget()) {
                            console.warn(`[MINING AI] findNearestTarget: Cached target too far (${Math.sqrt(distSq).toFixed(1)} > ${maxDistance}) for entity ${entityId.substring(0, 8)}`);
                        }
                    }
                }
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
    // Use shared cache instead of querying all players again
    const allPlayers = getCachedPlayers();
    if (getDebugTarget()) {
        console.warn(`[MINING AI] findNearestTarget: Checking ${allPlayers.length} players, maxDistance=${maxDistance}, entity=${entity.id.substring(0, 8)}`);
    }
    for (const player of allPlayers) {
        if (player.dimension !== dimension) {
            if (getDebugTarget()) {
                console.warn(`[MINING AI] findNearestTarget: Player ${player.id.substring(0, 8)} wrong dimension (${player.dimension?.id || 'unknown'} vs ${dimension.id})`);
            }
            continue;
        }
        // Skip creative and spectator mode players (they can't be attacked)
        let gameMode = null;
        try {
            gameMode = player.getGameMode();
            if (gameMode === "creative" || gameMode === "spectator") {
                if (getDebugTarget()) {
                    console.warn(`[MINING AI] findNearestTarget: Player ${player.id.substring(0, 8)} in ${gameMode} mode - skipping`);
                }
                continue;
            }
        } catch (e) {
            if (getDebugTarget()) {
                console.warn(`[MINING AI] findNearestTarget: Error getting gameMode for player ${player.id.substring(0, 8)}:`, e);
            }
        }
        const dx = player.location.x - origin.x;
        const dy = player.location.y - origin.y;
        const dz = player.location.z - origin.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq);
        if (getDebugTarget()) {
            console.warn(`[MINING AI] findNearestTarget: Player ${player.id.substring(0, 8)} at distance ${dist.toFixed(1)} (max: ${maxDistance})`);
        }
        if (distSq < bestPlayerDistSq) {
            // Heat-seeking: Check if we can see this target through blocks (up to 3 blocks)
            const targetInfo = {
                entity: player,
                distanceSq: distSq,
                vector: { x: dx, y: dy, z: dz }
            };
            // Allow targeting through up to 3 breakable blocks (heat-seeking vision)
            const canSee = canSeeTargetThroughBlocks(entity, targetInfo, 3);
            if (getDebugTarget()) {
                console.warn(`[MINING AI] findNearestTarget: Player ${player.id.substring(0, 8)} canSee=${canSee}`);
            }
            if (canSee) {
                bestPlayer = player;
                bestPlayerDistSq = distSq;
            }
        }
    }
    
    // If we found a player, use it (players always take priority)
    // Allow bears to see and attack targets even if targeting system is full
    // They can still attack like normal hostile mobs, just won't mine unless they join the system
    if (bestPlayer) {
        if (getDebugTarget()) {
            console.warn(`[MINING AI] findNearestTarget: Found bestPlayer ${bestPlayer.id.substring(0, 8)}, validating...`);
        }
        const targetId = bestPlayer.id;
        // Check if we can actively target this player (coordination check)
        // Validate target is still alive before checking coordination
        const playerIsValid = typeof bestPlayer.isValid === "function" ? bestPlayer.isValid() : Boolean(bestPlayer.isValid);
        if (!playerIsValid) {
            // Target is dead, skip it
            if (getDebugTarget()) {
                console.warn(`[MINING AI] findNearestTarget: bestPlayer ${targetId.substring(0, 8)} is invalid/dead`);
            }
            bestPlayer = null;
            bestPlayerDistSq = maxDistSq;
        }
        
        if (bestPlayer) {
            // Even if we can't actively target, we can still see and attack them
            const canTarget = canBearTarget(entityId, targetId, bestPlayer);
            if (getDebugTarget()) {
                console.warn(`[MINING AI] findNearestTarget: canBearTarget(${entityId.substring(0, 8)}, ${targetId.substring(0, 8)}) = ${canTarget}`);
            }
            if (canTarget) {
                best = bestPlayer;
                bestDistSq = bestPlayerDistSq;
                if (getDebugTarget()) {
                    console.warn(`[MINING AI] findNearestTarget: Setting best to bestPlayer (canTarget=true)`);
                }
            } else {
                // Target is full for active targeting, but bear can still see and attack
                // Return the target anyway so the bear can attack, but mark it as "not actively targeting"
                // This allows the bear to behave like a normal hostile mob
                best = bestPlayer;
                bestDistSq = bestPlayerDistSq;
                if (getDebugTarget()) {
                    console.warn(`[MINING AI] findNearestTarget: Setting best to bestPlayer (canTarget=false, but allowing attack)`);
                }
                // Only log once per target every 20 ticks to reduce spam
                const logKey = `target_full_${targetId}`;
                const lastLog = targetFullLogCache.get(logKey) || 0;
                if (getDebugTarget() && (system.currentTick - lastLog) > 20) {
                    console.warn(`[MINING AI] Target ${targetId.substring(0, 8)} is full (${getBearsTargeting(targetId).size}/${MAX_BEARS_PER_TARGET} bears) - bear can still see/attack but won't mine`);
                    targetFullLogCache.set(logKey, system.currentTick);
                }
            }
        }
    }
    
    if (!best) {
        // Only look for mobs if NO players found (with see-through vision)
        // Use shared cache instead of per-entity query
        const mobs = getCachedMobs(dimension, origin, maxDistance);
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
                    // Allow bears to see and attack targets even if targeting system is full
                    // They can still attack like normal hostile mobs, just won't mine unless they join the system
                    const targetId = mob.id;
                    best = mob;
                    bestDistSq = distSq;
                    if (!canBearTarget(entityId, targetId, mob)) {
                        // Only log once per target every 20 ticks to reduce spam
                        const logKey = `target_full_${targetId}`;
                        const lastLog = targetFullLogCache.get(logKey) || 0;
                        if (getDebugTarget() && (system.currentTick - lastLog) > 20) {
                            console.warn(`[MINING AI] Target ${targetId.substring(0, 8)} is full - bear can still see/attack but won't mine`);
                            targetFullLogCache.set(logKey, system.currentTick);
                        }
                    }
                }
            }
        }
    }

    if (!best) {
        // Cache null result too (no target found)
        if (useCache) {
            targetCache.set(entityId, { target: null, tick: currentTick });
        }
        if (getDebugTarget()) {
            console.warn(`[MINING AI] findNearestTarget: No target found for entity ${entityId.substring(0, 8)} (checked ${allPlayers.length} players, ${getCachedMobs(dimension, origin, maxDistance).length} mobs)`);
        }
        return null;
    }
    
    if (getDebugTarget()) {
        const targetType = best.typeId || 'unknown';
        const dist = Math.sqrt(bestDistSq);
        console.warn(`[MINING AI] findNearestTarget: Found target ${best.id.substring(0, 8)} (${targetType}) at distance ${dist.toFixed(1)}`);
    }
    
    // Final check: Allow bear to see target even if targeting system is full
    // Bear can still attack like normal hostile mob, just won't mine unless registered
    const targetId = best.id;
    
    // Validate target is still alive (handles both function and boolean property)
    const bestIsValid = typeof best.isValid === "function" ? best.isValid() : Boolean(best.isValid);
    if (!bestIsValid) {
        // Target is dead, return null
        if (useCache) {
            targetCache.set(entityId, { target: null, tick: currentTick });
        }
        if (getDebugTarget()) {
            console.warn(`[MINING AI] findNearestTarget: Target ${targetId.substring(0, 8)} is invalid/dead`);
        }
        return null;
    }
    
    const canActivelyTarget = canBearTarget(entityId, targetId, best);
    // Only log once per target every 20 ticks to reduce spam
    if (!canActivelyTarget && getDebugTarget()) {
        const logKey = `target_full_${targetId}`;
        const lastLog = targetFullLogCache.get(logKey) || 0;
        if ((system.currentTick - lastLog) > 20) {
            console.warn(`[MINING AI] Target ${targetId.substring(0, 8)} is full - bear can see/attack but won't mine`);
            targetFullLogCache.set(logKey, system.currentTick);
        }
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

function breakWallAhead(entity, tunnelHeight, digContext, targetInfo, directionOverride = null, tick = 0) {
    const dimension = entity?.dimension;
    if (!dimension || !targetInfo) return;
    
    const loc = entity.location;
    
    // CRITICAL: Do NOT run this function when target is above - it breaks blocks at foot level
    // Only run when target is at same Y level or below
    if (targetInfo.entity?.location) {
        const dy = targetInfo.entity.location.y - loc.y;
        if (dy > 1) {
            // Target is above - skip this function entirely, let carveStair handle upward movement
            if (getDebugGeneral() || getDebugMining()) {
                console.warn(`[MINING AI] breakWallAhead: Skipping - target is above (dy=${dy.toFixed(1)}), use carveStair instead`);
            }
            return;
        }
    }
    
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
    
    // Calculate distance to target first - needed for direction check and depth limit
    const targetLoc = targetInfo.entity?.location;
    let distance = 0;
    if (targetLoc) {
        const dx = targetLoc.x - loc.x;
        const dz = targetLoc.z - loc.z;
        distance = Math.hypot(dx, dz);
    } else {
        // No target location, use horizontal length as fallback
        distance = horizLen;
    }
    
    // When close to target (within 4 blocks), be more lenient with direction check
    // This ensures we mine blocking blocks even if the entity isn't perfectly aligned
    // When blocked, the entity might not be moving, so we need to mine anyway
    const minDot = distance <= 4 ? 0.0 : 0.35; // Allow any direction when close, stricter when far
    if (dot < minDot) return; // Not moving toward target (or close enough when near target)
        
        // Only break forward path blocks if within 8 blocks of target
        // This prevents breaking blocks when far away (stairs/ramps handle elevation changes)
        // BUT: If bear is stuck, always allow breaking blocks regardless of distance
        // This helps bears get unstuck even when they're close to the target
        const isStuck = isEntityStuck(entity, tick);
        if (distance > 8 && !isStuck) {
            return; // Too far away for forward tunneling - let stairs/ramps handle it
            // But if stuck, always try to break blocks
        }

    // FIRST: PRIORITY - Check blocks directly in front of bear (at bear's current Y level)
    // BUT: CRITICAL - Only do this when target is at same level or below (dy <= 1)
    // When target is above (dy > 1), we should NOT break blocks at foot level - use carveStair instead
    // This check should already be prevented by the early return above, but adding safety check here too
    const targetDyCheck = targetLoc ? (targetLoc.y - loc.y) : 0;
    if (targetDyCheck <= 1) {
        // Only check blocks at bear's foot level when target is at same level or below
        const forwardX = baseX + dirX;
        const forwardZ = baseZ + dirZ;
        
        // Check if block is within reach before trying to break it
        // CRITICAL: Only check blocks at head level and above (h >= 1) - never break blocks at feet level (h = 0)
        // This prevents breaking blocks at the bear's feet, which interferes with stair building
        if (isBlockWithinReach(entity, forwardX, baseY + 1, forwardZ)) {
            for (let h = 1; h < tunnelHeight; h++) {
                if (digContext.cleared >= digContext.max) return;
                const block = getBlock(dimension, forwardX, baseY + h, forwardZ);
                if (isBreakableBlock(block) && isSolidBlock(block)) {
                    // Check line of sight before breaking
                    if (canSeeBlock(entity, forwardX, baseY + h, forwardZ, targetInfo)) {
                        if (getDebugGeneral()) {
                            console.warn(`[MINING AI] breakWallAhead: PRIORITY - Breaking block directly in front (${forwardX}, ${baseY + h}, ${forwardZ}), type=${block?.typeId}, h=${h}`);
                        }
                        clearBlock(dimension, forwardX, baseY + h, forwardZ, digContext, entity, targetInfo);
                        return;
                    }
                }
            }
        }
    }
    
    // SECOND: Check blocks along the actual path to the target (at bear's Y level, interpolating toward target)
    // This matches what pathfinding detects, ensuring we break the blocks that are actually blocking
    // CRITICAL: Only check blocks within reach (6 blocks) - don't try to break blocks that are too far
    const maxSteps = Math.min(Math.ceil(distance), Math.min(12, Math.ceil(PLAYER_REACH_DISTANCE))); // Limit to reach distance
    const steps = maxSteps;
    const stepX = targetLoc ? (targetLoc.x - loc.x) / steps : dirX;
    const stepZ = targetLoc ? (targetLoc.z - loc.z) / steps : dirZ;
    const stepY = targetLoc ? (targetLoc.y - loc.y) / steps : 0; // Also interpolate Y to check target's level
    
    if (getDebugGeneral()) {
        console.warn(`[MINING AI] breakWallAhead: Checking ${steps} steps along path to target, direction=(${dirX}, ${dirZ}), base=(${baseX}, ${baseY}, ${baseZ}), targetY=${targetLoc ? Math.floor(targetLoc.y) : 'N/A'}`);
    }
    
    // Check blocks along the path (prioritize closer blocks first)
    // NOTE: This function only runs when target is at same level or below (dy <= 1) due to early return above
    const targetDy = targetLoc ? (targetLoc.y - loc.y) : 0;
    
    for (let i = 1; i <= steps && i <= 5; i++) { // Check first 5 steps (most important)
        const checkX = Math.floor(loc.x + stepX * i);
        const checkZ = Math.floor(loc.z + stepZ * i);
        const checkY = Math.floor(loc.y + stepY * i); // Interpolate Y along path to target
        
        // CRITICAL: Check if block is within reach before trying to break it
        if (!isBlockWithinReach(entity, checkX, checkY, checkZ)) {
            if (getDebugGeneral() && i === 1) {
                console.warn(`[MINING AI] breakWallAhead: Block at step ${i} is too far (${checkX}, ${checkY}, ${checkZ}) - should move closer first`);
            }
            continue; // Too far, skip this step
        }
        
        // Since we have an early return for targetDy > 1, at this point we know targetDy <= 1
        // Check blocks at both the bear's level and the interpolated path level for same-level or downward targets
        // For same-level targets, check both levels to ensure we clear the path properly
        // CRITICAL: Never break blocks at feet level (yLevel + 0) - always start from head level (yLevel + 1)
        // This prevents breaking blocks at the bear's feet, which interferes with stair building
        const yLevelsToCheck = targetDy <= 0 ? [baseY, checkY] : [checkY];
        
        for (const yLevel of yLevelsToCheck) {
            let hasSolid = false;
            // Check from head level (h=1) instead of feet level (h=0) to avoid breaking blocks at feet
            for (let h = 1; h < tunnelHeight; h++) {
                const block = getBlock(dimension, checkX, yLevel + h, checkZ);
                if (isBreakableBlock(block)) {
                    hasSolid = true;
                    if (getDebugGeneral()) {
                        console.warn(`[MINING AI] breakWallAhead: Found breakable block at step=${i}, (${checkX}, ${yLevel + h}, ${checkZ}), type=${block?.typeId}, yLevel=${yLevel === baseY ? 'bear' : 'interpolated'}`);
                    }
                    break;
                }
            }
            if (!hasSolid) {
                continue; // No blocks at this Y level, check next
            }
            
            // Found blocks at this step - break them (only if in line of sight)
            // CRITICAL: Always start from head level (h=1) - never break blocks at feet level (h=0)
            // This prevents breaking blocks at the bear's feet, which interferes with stair building
            const columnStart = 1; // Always start from head level, never break at feet level
            for (let h = columnStart; h < tunnelHeight; h++) {
                if (digContext.cleared >= digContext.max) return;
                const targetY = yLevel + h;
                const block = getBlock(dimension, checkX, targetY, checkZ);
                if (!isBreakableBlock(block)) continue;
                // Check line of sight before breaking
                if (!canSeeBlock(entity, checkX, targetY, checkZ, targetInfo)) continue;
                if (getDebugGeneral()) {
                    console.warn(`[MINING AI] breakWallAhead: Breaking block at (${checkX}, ${targetY}, ${checkZ}), type=${block?.typeId}`);
                }
                // Pass targetInfo to allow breaking protected blocks if path is blocked
                clearBlock(dimension, checkX, targetY, checkZ, digContext, entity, targetInfo);
                return; // Break one block at a time
            }
        }
    }
    
    // Also check blocks directly forward (fallback if path check didn't find anything)
    // CRITICAL: Only check blocks within reach
    const maxDepth = Math.min(WALL_SCAN_DEPTH + 1, Math.min(3, Math.ceil(PLAYER_REACH_DISTANCE))); // Limit to reach distance
    for (let depth = 1; depth <= maxDepth; depth++) {
        const targetX = baseX + dirX * depth;
        const targetZ = baseZ + dirZ * depth;
        
        // Check if block is within reach before trying to break it
        if (!isBlockWithinReach(entity, targetX, baseY, targetZ)) {
            continue; // Too far, skip
        }
        
        let hasSolid = false;
        // Check from head level (h=1) instead of feet level (h=0) to avoid breaking blocks at feet
        for (let h = 1; h < tunnelHeight; h++) {
            const block = getBlock(dimension, targetX, baseY + h, targetZ);
            if (isBreakableBlock(block)) {
                hasSolid = true;
            break;
        }
        }
        if (!hasSolid) continue;
        
        // CRITICAL: Always start from head level (h=1) - never break blocks at feet level (h=0)
        // This prevents breaking blocks at the bear's feet, which interferes with stair building
        const columnStart = 1; // Always start from head level, never break at feet level
        for (let h = columnStart; h < tunnelHeight; h++) {
            if (digContext.cleared >= digContext.max) return;
            const targetY = baseY + h;
            const block = getBlock(dimension, targetX, targetY, targetZ);
            if (!isBreakableBlock(block)) continue;
            // Check line of sight before breaking
            if (!canSeeBlock(entity, targetX, targetY, targetZ, targetInfo)) continue;
            if (getDebugGeneral()) {
                console.warn(`[MINING AI] breakWallAhead: Breaking forward block at (${targetX}, ${targetY}, ${targetZ}), type=${block?.typeId}`);
            }
            clearBlock(dimension, targetX, targetY, targetZ, digContext, entity, targetInfo);
            return;
        }
    }
    
    if (getDebugGeneral()) {
        console.warn(`[MINING AI] breakWallAhead: No blocks found to break in path (checked ${steps} steps along path and ${maxDepth} forward)`);
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
    } else {
        // Check if target is on a pillar/bridge - if so, prioritize pitfall strategy
        // BUT: Only if target is at reasonable height (not too high above)
        // If target is too high (dy > 5), use stairs instead - pitfall won't work well
        const pillarInfo = isTargetOnPillarOrBridge(entity, targetInfo);
        if (pillarInfo && dy <= 5) {
            // Target is on a pillar/bridge AND at reasonable height (5 blocks or less above)
            // This allows bears to undermine pillars and bridges when they're at reasonable height
            if (horizontalDist <= 10) {
                // Close enough - use pitfall strategy
                strategy = "pitfall";
                optimalPosition = { x: targetLoc.x, y: Math.floor(targetLoc.y) - 2, z: targetLoc.z };
            } else {
                // Not close enough - move closer then pitfall
                strategy = "hybrid_pitfall";
                optimalPosition = calculateOptimalAttackPosition(entity, targetInfo);
            }
        } else if (dy > 1) {
            // Target is above (more than 1 block) - prioritize stairs/tunnel strategy
            // This ensures bears build upward tunnels instead of trying pitfall when target is high
            if (dy >= HIGH_TARGET_THRESHOLD) {
                // Target is very high above (10+ blocks) - stairs are essential
                strategy = "tunnel";
            } else if (dy > 5) {
                // Target is high above (5-10 blocks) - prefer stairs over pitfall
                strategy = "tunnel";
            } else if (dy > 3 && dy <= 5 && horizontalDist <= OPTIMAL_ATTACK_DISTANCE) {
                // Target is moderately above (3-5 blocks) and close - pitfall can work
                strategy = "pitfall";
                optimalPosition = { x: targetLoc.x, y: Math.floor(targetLoc.y) - 2, z: targetLoc.z };
            } else {
                // Target is moderately above (1-5 blocks) but not close - use tunnel to build stairs
                strategy = "tunnel";
            }
            if (!optimalPosition) {
                optimalPosition = calculateOptimalAttackPosition(entity, targetInfo);
            }
        } else if (dy > 3 && dy <= 5 && horizontalDist <= OPTIMAL_ATTACK_DISTANCE) {
            // Target is above at reasonable height (3-5 blocks) and we're close - pitfall strategy
            // Pitfall is only effective when target is at reasonable height - if too high (5+ blocks), use stairs instead
            strategy = "pitfall";
            optimalPosition = { x: targetLoc.x, y: Math.floor(targetLoc.y) - 2, z: targetLoc.z };
        } else if (dy > 3 && dy <= 5) {
            // Target is above at reasonable height but we're not close - move closer then pitfall
            strategy = "hybrid_pitfall";
            optimalPosition = calculateOptimalAttackPosition(entity, targetInfo);
        } else if (dy >= HIGH_TARGET_THRESHOLD) {
            // Target is very high above (10+ blocks) - stairs are essential
            // Use tunnel strategy to allow continuous stair building
            strategy = "tunnel";
            optimalPosition = calculateOptimalAttackPosition(entity, targetInfo);
        } else if (dy > 5) {
            // Target is high above (5-10 blocks) - prefer stairs over pitfall
            // Stairs are more effective for high targets, pitfall is only for reasonable heights
            // Use tunnel strategy to allow stairs to be built
            strategy = "tunnel";
            optimalPosition = calculateOptimalAttackPosition(entity, targetInfo);
        } else if (horizontalDist > 6) {
            // Medium distance - tunnel approach
            strategy = "tunnel";
        } else {
            // Close - direct path or tunnel if blocked
            strategy = "direct";
        }
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

/**
 * Detect if there's a cave ahead using heat-seeking vision (raycast through blocks)
 * Returns the direction to the cave entrance, or null if no cave found
 */
function detectCaveAhead(entity, directionOverride = null, tunnelHeight = 2) {
    const dimension = entity?.dimension;
    if (!dimension) return null;
    
    const loc = entity.location;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);
    const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
    
    if (dirX === 0 && dirZ === 0) return null;
    
    // Scan ahead for cave entrances (air blocks)
    let airBlockCount = 0;
    let caveEntrancePos = null;
    const maxScanDistance = CAVE_AHEAD_SCAN_DISTANCE;
    
    // Use heat-seeking vision: raycast through up to 5 breakable blocks
    const maxBlocksThrough = 5;
    let blocksThrough = 0;
    
    for (let step = 1; step <= maxScanDistance; step++) {
        const checkX = baseX + dirX * step;
        const checkZ = baseZ + dirZ * step;
        
        // Check multiple Y levels (cave could be at different heights)
        for (let yOffset = -2; yOffset <= 2; yOffset++) {
            const checkY = baseY + yOffset;
            
            // Check a 3x3 area at this position (cave entrance might be wider)
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    try {
                        const block = getBlock(dimension, checkX + dx, checkY, checkZ + dz);
                        
                        // If we hit an unbreakable block, stop scanning in this direction
                        if (block && UNBREAKABLE_BLOCKS.has(block.typeId)) {
                            blocksThrough = maxBlocksThrough + 1; // Force stop
                            break;
                        }
                        
                        // Count air blocks (potential cave entrance)
                        if (block && AIR_BLOCKS.has(block.typeId)) {
                            airBlockCount++;
                            // Mark first significant air pocket as potential cave entrance
                            if (!caveEntrancePos && airBlockCount >= CAVE_AHEAD_AIR_THRESHOLD) {
                                caveEntrancePos = { x: checkX, y: checkY, z: checkZ };
                            }
                        } else if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                            // Count breakable blocks we're looking through
                            blocksThrough++;
                        }
                    } catch {
                        // Error checking block, skip
                    }
                }
                if (blocksThrough > maxBlocksThrough) break;
            }
            if (blocksThrough > maxBlocksThrough) break;
        }
        
        // If we've found a cave entrance, return its position
        if (caveEntrancePos && airBlockCount >= CAVE_AHEAD_AIR_THRESHOLD) {
            if (getDebugPathfinding()) {
                console.warn(`[MINING AI] Cave detected ahead at (${caveEntrancePos.x}, ${caveEntrancePos.y}, ${caveEntrancePos.z}), air blocks: ${airBlockCount}`);
            }
            return caveEntrancePos;
        }
        
        // If we've looked through too many solid blocks, stop
        if (blocksThrough > maxBlocksThrough) {
            break;
        }
    }
    
    return null;
}

/**
 * Check if we should mine towards a detected cave entrance
 * Returns true if cave is detected and we should prioritize mining towards it
 */
function shouldMineTowardsCave(entity, targetInfo, directionOverride = null, tunnelHeight = 2) {
    // Only mine towards caves if we don't have a target, or target is far away
    if (targetInfo && targetInfo.entity?.location) {
        const loc = entity.location;
        const targetLoc = targetInfo.entity.location;
        const dist = Math.hypot(targetLoc.x - loc.x, targetLoc.y - loc.y, targetLoc.z - loc.z);
        // If target is close, prioritize target over cave
        if (dist <= 8) {
            return false;
        }
    }
    
    // Check if there's a cave ahead
    const caveEntrance = detectCaveAhead(entity, directionOverride, tunnelHeight);
    return caveEntrance !== null;
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
    const { entity, targetInfo: initialTargetInfo, elevationIntent, role, leaderId } = ctx;
    
    if (getDebugGeneral() && tick % 20 === 0) {
        console.warn(`[MINING AI] processContext called for entity ${entity.id.substring(0, 8)}, hasTarget=${!!initialTargetInfo}, role=${role}`);
    }
    
    // CRITICAL: Check if target is in spectator/creative mode FIRST, before any processing
    // This ensures we never process targets that should be ignored
    let targetInfo = initialTargetInfo;
    if (targetInfo && targetInfo.entity?.typeId === "minecraft:player") {
        try {
            const gameMode = targetInfo.entity.getGameMode();
            if (gameMode === "creative" || gameMode === "spectator") {
                // Clear the target immediately - don't process anything for this target
                const oldTargetId = lastKnownTargets.get(entity.id)?.targetId;
                if (oldTargetId) {
                    unregisterBearFromTarget(entity.id, oldTargetId);
                }
                lastKnownTargets.delete(entity.id);
                targetCache.delete(entity.id);
                targetInfo = null;
                if (getDebugTarget() && tick % 20 === 0) {
                    console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)}: Cleared target at start of processContext - player in creative/spectator mode`);
                }
                // Return early - don't process anything for spectator/creative players
                return;
            }
        } catch { }
    }
    let ascending = ctx.ascending;
    let extraHeight = ctx.extraHeight;
    let ascendGoal = elevationIntent === "up"; // Changed to let because it can be modified for high targets
    const descendGoal = elevationIntent === "down";
    
    // If target is above, ensure ascending is true (needed for upward tunnel building)
    if (targetInfo && targetInfo.entity?.location) {
        const dy = targetInfo.entity.location.y - entity.location.y;
        if (dy > 1) {
            // Target is above - we need to ascend
            ascending = true;
            ascendGoal = true;
            if (extraHeight < 1) {
                extraHeight = 1;
            }
        }
    }
    
    if (ascendGoal && extraHeight < 1) {
        extraHeight = 1;
        ascending = true;
    }
    const hasTarget = !!targetInfo;
    
    // Check if bear is actively registered for targeting (can mine)
    // Bears can see and attack targets even if not registered, but can only mine if registered
    let isActivelyTargeting = false;
    if (hasTarget && targetInfo.entity) {
        const targetId = targetInfo.entity.id;
        const entityId = entity.id;
        const bearsTargeting = getBearsTargeting(targetId);
        isActivelyTargeting = bearsTargeting.has(entityId);
        
        // If bear can see target and has line of sight, try to join the targeting system
        // This allows more bears to mine when they have clear line of sight
        if (!isActivelyTargeting && canBearTarget(entityId, targetId)) {
            const loc = entity.location;
            const targetLoc = targetInfo.entity.location;
            const dist = Math.hypot(targetLoc.x - loc.x, targetLoc.z - loc.z);
            const dy = targetLoc.y - loc.y;
            
            // Check if bear has clear line of sight (0 blocks obstruction)
            // If so, allow them to join the targeting system
            const hasClearLineOfSight = canSeeTargetThroughBlocks(entity, targetInfo, 0);
            const isCloseEnough = dist <= 12 && Math.abs(dy) <= 8;
            
            if (getDebugTarget() && tick % 20 === 0) {
                console.warn(`[MINING AI] Registration check: entity=${entityId.substring(0, 8)}, canBearTarget=true, hasClearLineOfSight=${hasClearLineOfSight}, dist=${dist.toFixed(1)}, dy=${dy.toFixed(1)}, isCloseEnough=${isCloseEnough}`);
            }
            
            if (hasClearLineOfSight && isCloseEnough) {
                // Try to register for active targeting
                if (registerBearForTarget(entityId, targetId)) {
                    isActivelyTargeting = true;
                    if (getDebugTarget()) {
                        console.warn(`[MINING AI] Entity ${entityId.substring(0, 8)} joined targeting system for ${targetId.substring(0, 8)} (clear line of sight)`);
                    }
                } else if (getDebugTarget() && tick % 20 === 0) {
                    console.warn(`[MINING AI] Entity ${entityId.substring(0, 8)} failed to register for target ${targetId.substring(0, 8)} (target full?)`);
                }
            } else {
                // Even if not close enough or no clear line of sight, try to register anyway if target isn't full
                // This allows bears to start moving toward targets even if they can't see them clearly yet
                if (registerBearForTarget(entityId, targetId)) {
                    isActivelyTargeting = true;
                    if (getDebugTarget()) {
                        console.warn(`[MINING AI] Entity ${entityId.substring(0, 8)} joined targeting system for ${targetId.substring(0, 8)} (no clear line of sight, but registered anyway)`);
                    }
                }
            }
        } else if (!isActivelyTargeting && getDebugTarget() && tick % 20 === 0) {
            const canTarget = canBearTarget(entityId, targetId);
            console.warn(`[MINING AI] Entity ${entityId.substring(0, 8)} not registered: canBearTarget=${canTarget}`);
        }
    }
    
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

    let directionOverride = planQueue?.direction ?? planState?.direction ?? null;
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
        
        // Make bear face the target (look at it) - "locked on" behavior
        if (targetInfo && targetInfo.entity?.location) {
            try {
                const targetLoc = targetInfo.entity.location;
                // Use eye level for looking (entity.y + 1.5)
                const eyeY = entity.location.y + 1.5;
                entity.lookAt({
                    x: targetLoc.x,
                    y: targetLoc.y + 1.5, // Look at target's eye level
                    z: targetLoc.z
                });
            } catch {
                // Silently fail if lookAt doesn't work
            }
        }
    }

    // Only mine if we have a target AND are actively registered for targeting
    // Followers should not mine - they just follow the leader's path
    // Bears can attack targets they can see even if not actively targeting, but can only mine if registered
    // IMPORTANT: Only mine if there's no other way to reach the target (can't walk to it)
    if (getDebugMining() && tick % 20 === 0) {
        console.warn(`[MINING AI] Mining decision: digContext.max=${digContext.max}, hasTarget=${hasTarget}, isActivelyTargeting=${isActivelyTargeting}, role=${role}, willMine=${(digContext.max > 0 && hasTarget && isActivelyTargeting && role !== "follower")}`);
    }
    
    // Allow bears to attack even if not actively targeting (let native AI handle it)
    // But allow mining if blocks are blocking the path, even if not actively targeting
    if (hasTarget && !isActivelyTargeting && role !== "follower") {
        // Bear can see target but isn't actively targeting - check if blocks are blocking path
        const loc = entity.location;
        const targetLoc = targetInfo.entity.location;
        const dx = targetLoc.x - loc.x;
        const dz = targetLoc.z - loc.z;
        const dist = Math.hypot(dx, dz);
        
        // Check if path is blocked - if so, allow mining even if not actively targeting
        // This ensures bears can clear their path to attack, even when target is "full"
        const canReachByWalkingCheck = canReachTargetByWalking(entity, targetInfo, config.tunnelHeight + extraHeight);
        
        if (!canReachByWalkingCheck && dist <= 15) {
            // Path is blocked and target is close - allow mining to clear path
            // This makes bears more aggressive about clearing obstacles
            if (getDebugPathfinding() && tick % 40 === 0) {
                console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can see target but path blocked (dist=${dist.toFixed(1)}) - allowing mining to clear path`);
            }
            // Don't return - continue to mining section below
        } else {
            // Path is clear or target is far - just apply movement impulses
            if (getDebugPathfinding() && tick % 40 === 0) {
                console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can see target but not actively targeting (dist=${dist.toFixed(1)}) - applying movement impulse`);
            }
            
            // Apply stronger movement impulse toward target to help native AI
            if (dist > 1 && dist < 50) {
                try {
                    // Stronger impulse to ensure bear moves toward target
                    let impulse = 0.04; // Base impulse (increased from 0.03)
                    if (dist > 10) {
                        impulse = 0.05; // Stronger when far
                    } else if (dist <= 5) {
                        impulse = 0.045; // Stronger when close
                    }
                    
                    // Add upward component if target is above
                    const dy = targetLoc.y - loc.y;
                    let verticalImpulse = 0;
                    if (dy > 0.5) {
                        // Target is above - add upward push
                        // Scale with distance and height difference
                        if (dy > 2 && dist <= 8) {
                            verticalImpulse = 0.02; // Stronger when close and high
                        } else if (dy > 1 && dist <= 12) {
                            verticalImpulse = 0.015; // Moderate when medium distance
                        } else if (dy > 3) {
                            verticalImpulse = 0.01; // Still push even when far if very high
                        }
                    }
                    
                    const waypoint = getPathfindingWaypoint(entity, targetInfo, config.tunnelHeight + extraHeight);
                    const moveTarget = waypoint ? { x: waypoint.x + 0.5, z: waypoint.z + 0.5 } : { x: targetLoc.x, z: targetLoc.z };
                    const moveDx = moveTarget.x - loc.x;
                    const moveDz = moveTarget.z - loc.z;
                    const moveDist = Math.hypot(moveDx, moveDz) || 1;
                    
                    entity.applyImpulse({
                        x: (moveDx / moveDist) * impulse,
                        y: verticalImpulse,
                        z: (moveDz / moveDist) * impulse
                    });
                } catch { }
            }
            // Don't return - continue to allow native AI to work, but skip mining section
        }
    }
    
    if (getDebugGeneral() && tick % 20 === 0) {
        console.warn(`[MINING AI] processContext: digContext.max=${digContext.max}, hasTarget=${hasTarget}, isActivelyTargeting=${isActivelyTargeting}, role=${role}, willEnterMining=${(digContext.max > 0 && hasTarget && isActivelyTargeting && role !== "follower")}`);
    }
    
    // Allow mining if:
    // 1. Actively targeting (normal case)
    // 2. OR: Has target, path is blocked, and target is close (aggressive path clearing)
    const pathBlocked = hasTarget && targetInfo && targetInfo.entity?.location && 
                       !canReachTargetByWalking(entity, targetInfo, config.tunnelHeight + extraHeight);
    const targetClose = hasTarget && targetInfo && targetInfo.entity?.location && 
                       Math.hypot(targetInfo.entity.location.x - entity.location.x, 
                                targetInfo.entity.location.z - entity.location.z) <= 15;
    const shouldMine = digContext.max > 0 && hasTarget && role !== "follower" && 
                      (isActivelyTargeting || (pathBlocked && targetClose));
    
    if (shouldMine) {
        // Determine strategy for this entity
        const strategy = determineMiningStrategy(entity, targetInfo, tick);
        const strategyData = entityStrategies.get(entity.id);
        const optimalPosition = strategyData?.optimalPosition;
        
        const loc = entity.location;
        const targetLoc = targetInfo?.entity?.location;
        // Ensure dy and dist are always defined to avoid ReferenceError
        let dy = 0;
        let dist = 0;
        if (targetLoc) {
            dy = targetLoc.y - loc.y;
            dist = Math.hypot(targetLoc.x - loc.x, targetLoc.z - loc.z);
        }
        
        // Check if we can reach the target by walking - if so, don't mine at all
        let canReachByWalking = canReachTargetByWalking(entity, targetInfo, config.tunnelHeight + extraHeight);
        
        // Smart positioning: If strategy is "move_closer" or "hybrid_pitfall", prioritize moving toward optimal position
        const shouldMoveCloser = shouldMoveCloserFirst(entity, targetInfo);
        
        if (getDebugPitfall() || getDebugPathfinding() || getDebugGeneral()) {
            console.warn(`[PITFALL DEBUG] Mining check: entity=${entity.id.substring(0, 8)}, strategy=${strategy}, digBudget=${digContext.max}, canReachByWalking=${canReachByWalking}, shouldMoveCloser=${shouldMoveCloser}, dy=${dy.toFixed(1)}, dist=${dist.toFixed(1)}, hasTarget=${hasTarget}, role=${role}`);
        }
        
        // CRITICAL: If we can reach by walking, check if we can attack first
        if (canReachByWalking) {
            // Check if we can actually attack (within range and line of sight)
            const isWithinAttackRange = dist <= 7 && dist >= 0;
            let hasLineOfSight = false;
            if (isWithinAttackRange && targetInfo) {
                // For melee attacks, require clear path when very close (dist <= 2)
                // This prevents corner-blocking issues where blocks adjacent to the path block attacks
                // Mobs can't attack through corners of blocks, so we need a completely clear path
                if (dist <= 2 && Math.abs(dy) <= 2) {
                    // Very close - require 0 blocks obstruction for melee attacks
                    // This ensures the bear can actually attack, not just see the target
                    hasLineOfSight = canSeeTargetThroughBlocks(entity, targetInfo, 0);
                } else if (dist <= 3 && Math.abs(dy) <= 3) {
                    // Close - allow 1 block obstruction (minor obstacles)
                    hasLineOfSight = canSeeTargetThroughBlocks(entity, targetInfo, 1);
                } else if (dist <= 5) {
                    // Medium distance - allow 1 block obstruction
                    hasLineOfSight = canSeeTargetThroughBlocks(entity, targetInfo, 1);
                } else {
                    // Further away - require clear line of sight
                    hasLineOfSight = canSeeTargetThroughBlocks(entity, targetInfo, 0);
                }
            }
            
            const canActuallyAttack = hasLineOfSight && (
                dy <= 3 ||  // Normal case: target within 3 blocks vertically
                (dist <= 3 && dy <= 8) ||  // Close horizontally: allow up to 8 blocks vertically
                (Math.abs(dy) <= 1 && dist <= 3)  // Same level and close: always allow
            );
            
            // Debug logging to understand why canActuallyAttack is false
            if (getDebugGeneral() && tick % 20 === 0 && dist <= 5 && !canActuallyAttack) {
                console.warn(`[MINING AI] canActuallyAttack=false: dist=${dist.toFixed(1)}, dy=${dy.toFixed(1)}, hasLineOfSight=${hasLineOfSight}, isWithinAttackRange=${isWithinAttackRange}`);
            }
            const needsMiningForHeight = dy > 3;
            
            // If we can attack AND are within native AI's activation range, stop ALL custom impulses and mining
            // Native AI's move_towards_target activates within 3 blocks (within_radius: 3)
            // Only stop custom impulses when within this range to avoid conflicts with native AI pathfinding
            if (canActuallyAttack && !needsMiningForHeight && dist <= 3) {
                if (getDebugPathfinding() || getDebugGeneral() || getDebugPitfall()) {
                    console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can attack target (canReachByWalking=true, canActuallyAttack=true, dist=${dist.toFixed(1)}, dy=${dy.toFixed(1)}) - STOPPING all custom impulses/mining, letting native AI handle attack`);
                }
                
                // CRITICAL: Don't apply any custom impulses - native AI needs full control within 3 blocks
                // Custom impulses interfere with native AI's pathfinding and can cause the bear to move away
                // Native AI's move_towards_target behavior (within_radius: 3) will handle movement toward the target
                // Native AI's melee_attack behavior will handle attacking when in range
                
                // Don't mine - let native AI handle attacking
                return;
            }
            
            // If we can attack but are further than 3 blocks, apply movement impulses to help
            // Native AI's move_towards_target activates within 3 blocks, but we help it get there
            if (canActuallyAttack && !needsMiningForHeight) {
                if (getDebugPathfinding() || getDebugGeneral() || getDebugPitfall()) {
                    console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can attack target (canReachByWalking=true, canActuallyAttack=true, dist=${dist.toFixed(1)}, dy=${dy.toFixed(1)}) - Applying movement impulses to help native AI`);
                }
                
                // Apply movement impulses toward target to help native AI
                const targetLoc = targetInfo.entity.location;
                const dx = targetLoc.x - loc.x;
                const dz = targetLoc.z - loc.z;
                const horizontalDist = Math.hypot(dx, dz);
                
                if (horizontalDist > 1 && horizontalDist < 50) {
                    try {
                        // Stronger impulse to ensure bear moves toward target
                        let impulse = 0.04; // Base impulse (increased from 0.03)
                        if (horizontalDist > 10) {
                            impulse = 0.05; // Stronger when far
                        } else if (horizontalDist <= 5) {
                            impulse = 0.045; // Stronger when close
                        }
                        
                        // Add upward component if target is above
                        const dy = targetLoc.y - loc.y;
                        let verticalImpulse = 0;
                        if (dy > 0.5) {
                            // Target is above - add upward push
                            // Scale with distance and height difference
                            if (dy > 2 && horizontalDist <= 8) {
                                verticalImpulse = 0.02; // Stronger when close and high
                            } else if (dy > 1 && horizontalDist <= 12) {
                                verticalImpulse = 0.015; // Moderate when medium distance
                            } else if (dy > 3) {
                                verticalImpulse = 0.01; // Still push even when far if very high
                            }
                        }
                        
                        entity.applyImpulse({
                            x: (dx / horizontalDist) * impulse,
                            y: verticalImpulse,
                            z: (dz / horizontalDist) * impulse
                        });
                        if (getDebugPathfinding() && tick % 40 === 0) {
                            console.warn(`[MINING AI] Applied movement impulse toward target (dist=${horizontalDist.toFixed(1)}, dy=${dy.toFixed(1)}, impulse=${impulse.toFixed(3)}) to help native AI attack`);
                        }
                    } catch { }
                }
                
                // Don't mine - let native AI handle attacking, but help with movement
                return;
            }
            
            // Can reach by walking but can't attack yet - let native AI handle movement
            // BUT: If bear is stuck, force mining even if path seems clear
            // Native AI might not be able to pathfind through tunnels with corners
            const isStuck = isEntityStuck(entity, tick);
            if (isStuck && dist > 2) {
                // Bear is stuck and target is still far - native AI can't pathfind, force mining
                if (getDebugPathfinding() || getDebugGeneral() || getDebugPitfall()) {
                    console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can reach by walking BUT is stuck (dist=${dist.toFixed(1)}) - forcing mining to help native AI`);
                }
                // Don't return - continue to mining logic below
                // Override canReachByWalking to force mining
                canReachByWalking = false;
            } else {
                // Bear is not stuck or is very close - apply movement impulses to help native AI
                // Native AI might not be aggressive enough, so we help it move toward the target
                // Get target location for movement calculations
                const targetLocForMove = targetInfo.entity.location;
                const dx = targetLocForMove.x - loc.x;
                const dz = targetLocForMove.z - loc.z;
                const horizontalDist = Math.hypot(dx, dz);
                // dy is already defined at the top of this block (line 4612-4613), use it directly
                
                if (getDebugPathfinding() || getDebugGeneral() || getDebugPitfall()) {
                    // canActuallyAttack might not be defined in this scope, use a safe check
                    const canAttackValue = typeof canActuallyAttack !== 'undefined' ? canActuallyAttack : false;
                    console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can reach by walking (canReachByWalking=true, canActuallyAttack=${canAttackValue}, dist=${dist.toFixed(1)}, dy=${dy.toFixed(1)}, isStuck=${isStuck}) - Applying movement impulses to help native AI`);
                }
                
                // Use nox7-inspired pathfinding movement/steering system
                const path = getPathfindingPath(entity, targetInfo, config.tunnelHeight + extraHeight);
                if (path && path.length >= 2) {
                    // Use smooth steering along path
                    const moved = steerAlongPath(entity, path, targetInfo, config);
                    if (moved && getDebugPathfinding() && tick % 40 === 0) {
                        const waypoint = getPathfindingWaypoint(entity, targetInfo, config.tunnelHeight + extraHeight);
                        if (waypoint) {
                            const waypointDist = Math.hypot(waypoint.x + 0.5 - loc.x, waypoint.z + 0.5 - loc.z);
                            console.warn(`[MINING AI] Applied pathfinding-based steering (pathLength=${path.length}, waypointDist=${waypointDist.toFixed(1)})`);
                        }
                    }
                } else {
                    // Fallback: if no pathfinding waypoint, use direct target movement (less preferred)
                    if (horizontalDist > 1 && horizontalDist < 50) {
                        try {
                            let impulse = 0.03; // Reduced impulse when no pathfinding
                            let verticalImpulse = 0;
                            if (dy > 0.5) {
                                // Target is above - add upward push
                                if (dy > 2 && horizontalDist <= 8) {
                                    verticalImpulse = 0.015; // Stronger when close and high
                                } else if (dy > 1 && horizontalDist <= 12) {
                                    verticalImpulse = 0.01; // Moderate when medium distance
                                } else if (dy > 3) {
                                    verticalImpulse = 0.008; // Still push even when far if very high
                                }
                            }
                            
                            entity.applyImpulse({
                                x: (dx / horizontalDist) * impulse,
                                y: verticalImpulse,
                                z: (dz / horizontalDist) * impulse
                            });
                        } catch { }
                    }
                }
                
                // Don't mine - pathfinding-based movement will handle getting closer
                return;
            }
        }
        
        // IMPORTANT: Priority is WALKING/ATTACKING, not mining
        // Only mine if we CAN'T reach by walking AND we're not close enough to attack
        // (canReachByWalking check already handled above - if true, we returned early)
        const horizontalDist = dist; // Already calculated above
        
        // If close enough to attack (within ~7 blocks horizontally) AND has clear line of sight, let native AI handle attacking
        // Don't interfere with mining - the bear should attack, not mine
        // But if there are blocks in the way, even if close, we should mine
        const isWithinAttackRange = horizontalDist <= 7 && horizontalDist >= 0;
        // Check line of sight for ATTACKING
        // More lenient for close targets - allow minor obstructions
        // Heat-seeking vision (3 blocks) is for TARGETING, not attacking - bears can't attack through walls!
        // IMPORTANT: If there's a wall (2+ blocks), always break it first, even if close
        let hasLineOfSight = false;
        if (isWithinAttackRange && targetInfo) {
            // More lenient line-of-sight for close targets
            if (horizontalDist <= 3 && Math.abs(dy) <= 3) {
                // Close (within 3 blocks horizontally and vertically) - allow up to 1 block in the way
                // This allows attacking through minor obstructions (like grass, single blocks)
                // Native AI can handle minor obstructions when very close
                hasLineOfSight = canSeeTargetThroughBlocks(entity, targetInfo, 1);
            } else if (horizontalDist <= 5) {
                // Medium distance (3-5 blocks) - allow up to 1 block for minor obstructions
                hasLineOfSight = canSeeTargetThroughBlocks(entity, targetInfo, 1);
            } else {
                // Further away (5-7 blocks) - require clear line of sight (0 blocks)
                hasLineOfSight = canSeeTargetThroughBlocks(entity, targetInfo, 0);
            }
        }
        
        // IMPORTANT: Even if within range and has line of sight, if target is significantly above (dy > 3),
        // the bear can't actually attack it - it needs to climb/mine to get closer
        // BUT: If very close horizontally (within 3 blocks), allow attacking even if target is higher
        // This allows bears to attack targets directly above them when they're right next to them
        // The native AI can handle upward attacks when the bear is close enough
        // ALSO: If target is on same level (dy <= 1) and close (horizontalDist <= 3), always allow attacking
        // MORE LENIENT: If bear can reach by walking and is close, allow attacking even with minor obstructions
        // This prevents bears from mining when they could just walk a few blocks to attack
        let canActuallyAttack = false;
        if (canReachByWalking && horizontalDist <= 5) {
            // If bear can reach by walking and is close (within 5 blocks), be more lenient
            // Allow attacking even if line-of-sight is slightly blocked - native AI can handle it
            // This prevents unnecessary mining when the bear could just walk closer
            canActuallyAttack = (hasLineOfSight || horizontalDist <= 3) && (
                dy <= 4 ||  // More lenient: allow up to 4 blocks vertically when close
                (horizontalDist <= 3 && dy <= 8) ||  // Close horizontally: allow up to 8 blocks vertically
                (Math.abs(dy) <= 2 && horizontalDist <= 4)  // Same level and close: always allow
            );
        } else {
            // Normal case: require line of sight
            canActuallyAttack = hasLineOfSight && (
                dy <= 3 ||  // Normal case: target within 3 blocks vertically
                (horizontalDist <= 3 && dy <= 8) ||  // Close horizontally: allow up to 8 blocks vertically
                (Math.abs(dy) <= 1 && horizontalDist <= 3)  // Same level and close: always allow
            );
        }
        
        // ALSO: If bear is very close horizontally (within 2 blocks), allow attacking even if target is high
        // Native AI can handle upward attacks when the bear is right next to the target
        if (!canActuallyAttack && horizontalDist <= 2 && hasLineOfSight) {
            canActuallyAttack = true; // Very close - allow attacking regardless of vertical distance
        }
        
        // If target is too high above (dy > 4 when close, or dy > 3 when far), the bear needs to mine to get closer
        // This ensures bears mine upward when targets are above them
        // BUT: If bear can reach by walking and is close, don't require mining unless target is very high
        const needsMiningForHeight = canReachByWalking && horizontalDist <= 5 
            ? dy > 4  // More lenient when close and can walk
            : dy > 3;  // Normal threshold when far
        
        // CRITICAL: If bear can actually attack, STOP all mining and movement impulses - let native AI handle it
        // This prevents jumping in circles when the bear is in attack range
        if (canActuallyAttack && !needsMiningForHeight) {
            if ((getDebugPathfinding() || getDebugGeneral()) && tick % 20 === 0) {
                console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can attack target (canActuallyAttack=true, dy=${dy.toFixed(1)}, horizontalDist=${horizontalDist.toFixed(1)}, hasLineOfSight=${hasLineOfSight}, canReachByWalking=${canReachByWalking}) - STOPPING all mining/impulses, letting native AI attack`);
            }
            // Don't apply movement impulses, don't mine - just let the native AI handle attacking
            return;
        } else if (getDebugGeneral() && tick % 20 === 0 && isWithinAttackRange) {
            // Log why we're NOT stopping (for debugging)
            console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} NOT stopping to attack: canActuallyAttack=${canActuallyAttack}, hasLineOfSight=${hasLineOfSight}, dy=${dy.toFixed(1)}, horizontalDist=${horizontalDist.toFixed(1)}, needsMiningForHeight=${needsMiningForHeight}, canReachByWalking=${canReachByWalking}`);
        }
        
        // If bear can reach by walking but can't attack yet, help it move closer instead of mining
        // This prevents unnecessary mining when the bear just needs to walk a few blocks
        // BUT: If target is above (dy > 2), we still need to build stairs even if "can reach by walking"
        // CRITICAL: Don't skip mining when target is above and close - need stairs!
        let targetDyForEarlyReturn = 0;
        if (targetInfo && targetInfo.entity?.location) {
            targetDyForEarlyReturn = targetInfo.entity.location.y - loc.y;
        }
        const shouldSkipForStairs = targetDyForEarlyReturn > 2 && horizontalDist <= 10;
        if (canReachByWalking && !canActuallyAttack && !needsMiningForHeight && horizontalDist <= 8 && !shouldSkipForStairs) {
            // Bear can walk to target but can't attack yet - use pathfinding to guide movement
            const waypoint = getPathfindingWaypoint(entity, targetInfo, config.tunnelHeight + extraHeight);
            if (waypoint) {
                const waypointLoc = { x: waypoint.x + 0.5, y: waypoint.y, z: waypoint.z + 0.5 };
                const waypointDx = waypointLoc.x - loc.x;
                const waypointDz = waypointLoc.z - loc.z;
                const waypointDy = waypointLoc.y - loc.y;
                const waypointDist = Math.hypot(waypointDx, waypointDz);
                
                if (waypointDist > 1 && waypointDist <= 8) {
                    try {
                        // Apply pathfinding-based movement toward waypoint
                        let verticalImpulse = 0;
                        if (waypointDy > 0.5) {
                            verticalImpulse = 0.01;
                        }
                        
                        entity.applyImpulse({
                            x: (waypointDx / waypointDist) * 0.03,
                            y: verticalImpulse,
                            z: (waypointDz / waypointDist) * 0.03
                        });
                        if (getDebugPathfinding() && tick % 40 === 0) {
                            console.warn(`[MINING AI] Pathfinding-based movement toward waypoint (dist=${waypointDist.toFixed(1)}, dy=${waypointDy.toFixed(1)})`);
                        }
                    } catch { }
                }
            }
            // Don't mine - pathfinding will guide movement
            return;
        }
        
        // If we should move closer first, apply movement impulse toward optimal position
        // (Only if we can't actually attack yet)
        if (shouldMoveCloser && optimalPosition && strategy !== "direct") {
            const dx = optimalPosition.x - loc.x;
            const dz = optimalPosition.z - loc.z;
            const dist = Math.hypot(dx, dz);
            
            if (dist > 1) {
                // Move toward optimal position
                let impulse = 0.03; // Base impulse (increased from 0.02)
                if (dist > 10) {
                    impulse = 0.04; // Stronger when far
                }
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
        } else if (targetInfo && targetInfo.entity?.location && !canActuallyAttack) {
            // Use nox7-inspired pathfinding movement/steering while mining
            const path = getPathfindingPath(entity, targetInfo, config.tunnelHeight + extraHeight);
            if (path && path.length >= 2) {
                // Use smooth steering along path
                const moved = steerAlongPath(entity, path, targetInfo, config);
                if (moved && getDebugPathfinding() && tick % 40 === 0) {
                    const waypoint = getPathfindingWaypoint(entity, targetInfo, config.tunnelHeight + extraHeight);
                    if (waypoint) {
                        const waypointDist = Math.hypot(waypoint.x + 0.5 - loc.x, waypoint.z + 0.5 - loc.z);
                        console.warn(`[MINING AI] Pathfinding-based steering while mining (pathLength=${path.length}, waypointDist=${waypointDist.toFixed(1)})`);
                    }
                }
            } else {
                // Fallback: direct movement if no path available
                const waypoint = getPathfindingWaypoint(entity, targetInfo, config.tunnelHeight + extraHeight);
                if (waypoint) {
                    const waypointLoc = { x: waypoint.x + 0.5, y: waypoint.y, z: waypoint.z + 0.5 };
                    const waypointDx = waypointLoc.x - loc.x;
                    const waypointDz = waypointLoc.z - loc.z;
                    const waypointDist = Math.hypot(waypointDx, waypointDz);
                    
                    if (waypointDist > 2 && waypointDist < 50) {
                        try {
                            entity.applyImpulse({
                                x: (waypointDx / waypointDist) * 0.03,
                                y: 0,
                                z: (waypointDz / waypointDist) * 0.03
                            });
                        } catch { }
                    }
                }
            }
        }
        
        if (getDebugPitfall() || getDebugMining()) {
            console.warn(`[MINING AI] Mining decision: canReachByWalking=${canReachByWalking}, strategy=${strategy}, dy=${dy.toFixed(1)}, horizontalDist=${horizontalDist.toFixed(1)}, isWithinAttackRange=${isWithinAttackRange}, hasLineOfSight=${hasLineOfSight}, canActuallyAttack=${canActuallyAttack}, needsMiningForHeight=${needsMiningForHeight}`);
        }
        
        // Check if entity is stuck (multi-directional pathfinding)
        const isStuck = isEntityStuck(entity, tick);
        let stuckDirectionOverride = null;
        
        if (isStuck) {
            if (getDebugPathfinding()) {
                console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} is stuck - checking all directions`);
            }
            
            // First, check if there's a cave ahead in any direction - prioritize caves
            const caveAhead = detectCaveAhead(entity, directionOverride, config.tunnelHeight + extraHeight);
            if (!caveAhead) {
                // Check other directions for caves
                const directions = [
                    { x: 1, z: 0 }, { x: -1, z: 0 },
                    { x: 0, z: 1 }, { x: 0, z: -1 }
                ];
                
                for (const dir of directions) {
                    const testCave = detectCaveAhead(entity, dir, config.tunnelHeight + extraHeight);
                    if (testCave) {
                        directionOverride = dir;
                        if (getDebugPathfinding()) {
                            console.warn(`[MINING AI] Found cave in direction (${dir.x}, ${dir.z}), changing direction`);
                        }
                        break;
                    }
                }
            }
            
            // If no cave found, use standard stuck direction finding
            if (!caveAhead && !directionOverride) {
                const dimension = entity?.dimension;
                if (dimension) {
                    stuckDirectionOverride = findBestDirectionWhenStuck(entity, targetInfo, dimension, config.tunnelHeight + extraHeight);
                }
                if (stuckDirectionOverride) {
                    // Use stuck direction override (only horizontal for now, vertical handled separately)
                    if (stuckDirectionOverride.y === 0) {
                        directionOverride = { x: stuckDirectionOverride.x, z: stuckDirectionOverride.z };
                        if (getDebugPathfinding()) {
                            console.warn(`[MINING AI] Changed direction to: (${directionOverride.x}, ${directionOverride.z})`);
                        }
                    }
                }
            }
        }
        
        // Check if there's a block directly blocking movement forward
        // Bears should try to walk/climb first, only mine when physically blocked
        const dimension = entity?.dimension;
        let hasBlockingBlock = false;
        if (dimension) {
        const loc = entity.location;
            const baseX = Math.floor(loc.x);
            const baseY = Math.floor(loc.y);
            const baseZ = Math.floor(loc.z);
            const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
            
            // Check if there's a block directly in front (1 block ahead) blocking movement
            // Ignore walkable-through blocks (grass, flowers, etc.) and single-block obstacles that can be jumped over
            if (dirX !== 0 || dirZ !== 0) {
                const forwardX = baseX + dirX;
                const forwardZ = baseZ + dirZ;
                // Check at foot level and head level
                for (let h = 0; h < config.tunnelHeight + extraHeight; h++) {
                    const block = getBlock(dimension, forwardX, baseY + h, forwardZ);
                    // Skip walkable-through blocks (grass, flowers, etc.)
                    if (canWalkThrough(block)) continue;
                    
                    if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                        // Check if this is a single-block obstacle at foot level (h=0) that can be jumped over
                        if (h === 0) {
                            try {
                                const blockAbove = getBlock(dimension, forwardX, baseY + 1, forwardZ);
                                // If there's clear space above, can jump over it - don't count as blocking
                                if (canWalkThrough(blockAbove)) {
                                    continue; // Can jump over, not blocking
                                }
                            } catch {
                                // Error checking above block, treat as blocking
                            }
                        }
                        hasBlockingBlock = true;
                        break;
                    }
                }
            }
        }
        
        // Edge detection: If bear is stuck on a narrow edge (can't reach by walking but no blocking blocks),
        // apply movement impulse toward target to help it move off the edge
        if (!canReachByWalking && !hasBlockingBlock && !needsMiningForHeight && targetInfo && targetInfo.entity?.location) {
            // Bear is on an edge - apply movement impulse toward target to help it move
            const targetLoc = targetInfo.entity.location;
            const dx = targetLoc.x - loc.x;
            const dz = targetLoc.z - loc.z;
            const dist = Math.hypot(dx, dz);
            
            if (dist > 0.1 && dist < 20) {
                // Apply a stronger impulse when stuck on edge to help move off
                const impulse = 0.04; // Stronger than normal (0.02) to help unstuck
                try {
                    entity.applyImpulse({
                        x: (dx / dist) * impulse,
                        y: 0.01, // Small upward impulse to help jump off edge
                        z: (dz / dist) * impulse
                    });
                    if (getDebugPathfinding() && tick % 20 === 0) {
                        console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} stuck on edge - applying movement impulse toward target (dist=${dist.toFixed(1)})`);
                    }
                } catch { }
            }
        }
        
        // Only mine if:
        // 1. There's a blocking block AND we can't reach by walking, OR
        // 2. Target is too high above (needs mining to get closer), OR
        // 3. We can't actually attack (either no line of sight OR target too high above)
        // Priority: Try walking/climbing/attacking first, only mine when physically blocked, target too high, or can't attack
        // This ensures bears try to walk/climb/attack first before mining, but mine when target is too high
        if ((hasBlockingBlock && !canReachByWalking) || needsMiningForHeight || !canActuallyAttack) {
            if (getDebugMining()) console.warn(`[MINING AI] NEEDS mining (canReachByWalking=${canReachByWalking}, hasBlockingBlock=${hasBlockingBlock}, strategy=${strategy}) - attempting to mine`);
            // Can't reach by walking AND blocked - mining is needed
            // Determine if we should tunnel down - ONLY if target is SIGNIFICANTLY below (more than 2 blocks)
            // Don't dig down if we're already at or below the target level
            const loc = entity.location;
            const targetLoc = targetInfo?.entity?.location;
            const dy = targetLoc ? (targetLoc.y - loc.y) : 0;
            // Only tunnel down if target is SIGNIFICANTLY below (more than 2 blocks)
            // Don't dig down if we're at or below the target level (dy >= 0 means target is at or above us)
            // This prevents digging down when at or below player level
            // Also check if stuck and best direction is down
            const shouldTunnelDown = (elevationIntent === "down" && dy < -2 && dy < 0) || 
                                     (isStuck && stuckDirectionOverride && stuckDirectionOverride.y === -1);
            
            if (getDebugMining()) console.warn(`[MINING AI] processContext: role=${role}, hasTarget=${hasTarget}, canReachByWalking=${canReachByWalking}, digBudget=${digBudget}, strategy=${strategy}, shouldTunnelDown=${shouldTunnelDown}, shouldMoveCloser=${shouldMoveCloser}, dy=${dy.toFixed(1)}`);
            
            // Smart mining based on strategy
            // Only do heavy mining if we're close enough OR if strategy requires it
            // BUT: If target is too high above (dy > 5) and strategy is pitfall, move closer first instead
            // Pitfall doesn't work well for high targets - need to get closer first
            const shouldDoMining = !shouldMoveCloser || 
                                  (strategy === "pitfall" && dy <= 5) || 
                                  (strategy === "hybrid_pitfall" && dy <= 5) ||
                                  (strategy !== "pitfall" && strategy !== "hybrid_pitfall");
            if (shouldDoMining) {
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
                    // Ignore walkable-through blocks and single-block obstacles that can be jumped over
                    for (let step = 1; step <= 2; step++) {
                        const forwardX = baseX + dirX * step;
                        const forwardZ = baseZ + dirZ * step;
                        for (let h = 0; h < config.tunnelHeight + extraHeight; h++) {
                            const block = getBlock(dimension, forwardX, baseY + h, forwardZ);
                            // Skip walkable-through blocks (grass, flowers, etc.)
                            if (canWalkThrough(block)) continue;
                            
                            if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                                // Check if this is a single-block obstacle at foot level (h=0) that can be jumped over
                                if (h === 0) {
                                    try {
                                        const blockAbove = getBlock(dimension, forwardX, baseY + 1, forwardZ);
                                        // If there's clear space above, can jump over it - don't count as blocking
                                        if (canWalkThrough(blockAbove)) {
                                            continue; // Can jump over, not blocking
                                        }
                                    } catch {
                                        // Error checking above block, treat as blocking
                                    }
                                }
                                hasForwardBlock = true;
                                break;
                            }
                        }
                        if (hasForwardBlock) break;
                    }
                }
                
                if (getDebugGeneral()) console.warn(`[MINING AI] Block check: hasForwardBlock=${hasForwardBlock}, shouldTunnelDown=${shouldTunnelDown}`);
                
                // If target is too high above (dy > 5) and strategy is pitfall, prioritize movement over mining
                // Pitfall doesn't work well for high targets - need to get closer first
                if (strategy === "pitfall" && dy > 5) {
                    // Target is too high for pitfall - apply movement impulse to get closer
                    const targetLoc = targetInfo.entity.location;
                    const dx = targetLoc.x - loc.x;
                    const dz = targetLoc.z - loc.z;
                    const horizontalDist = Math.hypot(dx, dz);
                    
                    if (horizontalDist > 1 && horizontalDist < 50) {
                        try {
                            // Use pathfinding waypoint if available
                            const waypoint = getPathfindingWaypoint(entity, targetInfo, config.tunnelHeight + extraHeight);
                            const moveTarget = waypoint ? { x: waypoint.x + 0.5, z: waypoint.z + 0.5 } : { x: targetLoc.x, z: targetLoc.z };
                            const moveDx = moveTarget.x - loc.x;
                            const moveDz = moveTarget.z - loc.z;
                            const moveDist = Math.hypot(moveDx, moveDz) || 1;
                            
                            // Stronger impulse to move closer
                            let impulse = 0.06;
                            if (horizontalDist > 10) {
                                impulse = 0.08;
                            }
                            
                            // Add upward component since target is above
                            let verticalImpulse = Math.min(dy * 0.02, 0.02);
                            
                            entity.applyImpulse({
                                x: (moveDx / moveDist) * impulse,
                                y: verticalImpulse,
                                z: (moveDz / moveDist) * impulse
                            });
                            
                            if (getDebugPathfinding() && tick % 20 === 0) {
                                console.warn(`[MINING AI] Target too high for pitfall (dy=${dy.toFixed(1)}) - moving closer first`);
                            }
                        } catch { }
                    }
                    // Don't mine - just move closer
                    return;
                }
                
                // If target is above and we're building upward stairs, SKIP clearForwardTunnel
                // clearForwardTunnel breaks blocks at foot level, which interferes with stair building
                // The stair pattern (carveStair) will handle breaking blocks correctly for upward movement
                const shouldSkipForwardTunnelForStairs = ascending && targetInfo && targetInfo.entity?.location && (targetInfo.entity.location.y - loc.y) > 1;
                
                if (!shouldSkipForwardTunnelForStairs) {
                    // ALWAYS try to break forward path first (walls blocking movement)
                    // This prevents digging down when blocked by walls
                    clearForwardTunnel(entity, config.tunnelHeight, extraHeight + (buildPriority && ascendGoal ? 1 : 0), startOffset, digContext, ascending, forwardDepth, directionOverride, false, targetInfo); // Don't tunnel down in forward tunnel
                    if (getDebugGeneral()) console.warn(`[MINING AI] After clearForwardTunnel: cleared=${digContext.cleared}/${digContext.max}`);
                } else {
                    if (getDebugGeneral()) console.warn(`[MINING AI] Skipping clearForwardTunnel - building upward stairs instead (target is above, dy=${(targetInfo.entity.location.y - loc.y).toFixed(1)})`);
                }
                
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
                
                // ONLY dig straight down if:
                // 1. Target is actually below (shouldTunnelDown is true)
                // 2. AND forward path is clear (no walls blocking forward movement)
                // 3. AND target is VERY close vertically (within 1 block) - otherwise use ramps
                // This prevents digging straight down when we should create ramps instead
                // Ramps are better for descending because they allow the bear to walk down naturally
                const shouldDigStraightDown = shouldTunnelDown && !forwardStillBlocked && !hasForwardBlock;
                if (shouldDigStraightDown && targetInfo && targetInfo.entity?.location) {
                    const targetLoc = targetInfo.entity.location;
                    const dy = targetLoc.y - loc.y;
                    // Only dig straight down if target is very close (within 1 block below)
                    // Otherwise, carveRampDown will handle it (called later in the code)
                    // This ensures bears create ramps for descending instead of mining straight down
                    if (dy >= -1 && dy < 0) {
                        // Very close (within 1 block below) - can dig straight down
                        if (getDebugMining()) console.warn(`[MINING AI] Calling clearVerticalColumn (target very close below, dy=${dy.toFixed(1)})`);
                        clearVerticalColumn(entity, config.tunnelHeight, extraHeight, digContext, shouldTunnelDown, targetInfo);
                        if (getDebugMining()) console.warn(`[MINING AI] After clearVerticalColumn: cleared=${digContext.cleared}/${digContext.max}`);
                    } else {
                        // Target is further below - skip straight down mining, let carveRampDown handle it
                        if (getDebugMining()) console.warn(`[MINING AI] Skipping clearVerticalColumn - target too far below (dy=${dy.toFixed(1)}), will use ramps instead`);
                    }
                } else {
                    if (getDebugMining()) console.warn(`[MINING AI] Skipping clearVerticalColumn - forward path blocked (hasForwardBlock=${hasForwardBlock}, forwardStillBlocked=${forwardStillBlocked}, shouldTunnelDown=${shouldTunnelDown})`);
                }
            } else {
                if (getDebugMining()) console.warn(`[MINING AI] Skipping clearVerticalColumn/clearForwardTunnel (shouldMoveCloser=${shouldMoveCloser}, strategy=${strategy})`);
            }
            
            // Cave mining: If in a cave, allow more aggressive mining through cave walls/ceilings
            const inCave = isInCave(entity);
            const caveAhead = shouldMineTowardsCave(entity, targetInfo, directionOverride, config.tunnelHeight + extraHeight);
            
            if ((inCave || caveAhead) && digContext.cleared < digContext.max) {
                // In cave or cave detected ahead - allow mining through walls and ceilings more aggressively
                const loc = entity.location;
                const baseX = Math.floor(loc.x);
                const baseY = Math.floor(loc.y);
                const baseZ = Math.floor(loc.z);
                const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
                
                if (getDebugPathfinding() && caveAhead) {
                    console.warn(`[MINING AI] Mining towards detected cave ahead`);
                }
                
                if (dirX !== 0 || dirZ !== 0) {
                    // If cave is detected ahead, mine more aggressively (up to 4 steps instead of 2)
                    const maxSteps = caveAhead ? 4 : 2;
                    
                    // Check for blocks blocking path in cave
                    for (let step = 1; step <= maxSteps; step++) {
                        if (digContext.cleared >= digContext.max) break;
                        const checkX = baseX + dirX * step;
                        const checkZ = baseZ + dirZ * step;
                        
                        // Check ceiling and walls in cave (more thorough if cave ahead)
                        const heightCheck = caveAhead ? config.tunnelHeight + 2 : config.tunnelHeight + 1;
                        for (let h = 0; h < heightCheck; h++) {
                            if (digContext.cleared >= digContext.max) break;
                            const block = getBlock(entity.dimension, checkX, baseY + h, checkZ);
                            if (isBreakableBlock(block) && isSolidBlock(block)) {
                                clearBlock(entity.dimension, checkX, baseY + h, checkZ, digContext, entity, targetInfo);
                                break; // Break one block at a time
                            }
                        }
                        
                        // If cave ahead, also check diagonally and sides for faster cave access
                        if (caveAhead && step <= 2) {
                            // Check diagonal directions
                            const diagonals = [
                                { x: dirX, z: dirZ + 1 }, { x: dirX, z: dirZ - 1 },
                                { x: dirX + 1, z: dirZ }, { x: dirX - 1, z: dirZ }
                            ];
                            
                            for (const diag of diagonals) {
                                if (digContext.cleared >= digContext.max) break;
                                const diagX = baseX + diag.x * step;
                                const diagZ = baseZ + diag.z * step;
                                
                                // Check if this direction has fewer blocks (closer to cave)
                                let blockCount = 0;
                                for (let h = 0; h < config.tunnelHeight; h++) {
                                    const block = getBlock(entity.dimension, diagX, baseY + h, diagZ);
                                    if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                                        blockCount++;
                                    }
                                }
                                
                                // If this direction has fewer blocks, it might be closer to cave - mine it
                                if (blockCount <= 1) {
                                    for (let h = 0; h < config.tunnelHeight; h++) {
                                        if (digContext.cleared >= digContext.max) break;
                                        const block = getBlock(entity.dimension, diagX, baseY + h, diagZ);
                                        if (isBreakableBlock(block) && isSolidBlock(block)) {
                                            clearBlock(entity.dimension, diagX, baseY + h, diagZ, digContext, entity, targetInfo);
                                            break;
                                        }
                                    }
                                    break; // Only mine one diagonal per step
                                }
                            }
                        }
                    }
                }
            }
            
            if (role === "leader" && targetInfo) {
                // Note: breakBlocksUnderTarget is now handled in adaptive mining strategy below
                // This log is just for debugging - actual pitfall logic is in the strategy system
                if (getDebugGeneral() || getDebugMining()) {
                    console.warn(`[MINING AI] Leader with target: In mining section, strategy=${strategy}, dy=${dy.toFixed(1)}, horizontalDist=${horizontalDist.toFixed(1)}, targetInfo=${!!targetInfo}`);
                }
                
                // CRITICAL: Check original canReachTargetByWalking before stuck override
                // If bear can reach by walking (even if stuck), prioritize movement over mining
                const originalCanReachByWalking = canReachTargetByWalking(entity, targetInfo, config.tunnelHeight + extraHeight);
                
                // Only break walls and branch if:
                // 1. Path is blocked (canReachByWalking=false) - we MUST break walls to clear path
                // 2. OR not moving closer (shouldMoveCloser=false) - normal mining
                // 3. OR strategy is tunnel - always break walls
                // If path is clear (originalCanReachByWalking=true) and shouldMoveCloser=true, prioritize movement
                // BUT: Even if shouldMoveCloser=false, if we can't reach by walking AND target is far, we should move closer first
                // Check if target is too far to mine effectively (blocks would be out of reach)
                // BUT: If target is above, we still need to build stairs even when moving closer
                let shouldMoveCloserForMining = false;
                let targetIsAboveForMining = false;
                if (!canReachByWalking && targetInfo && targetInfo.entity?.location) {
                    const targetLocCheck = targetInfo.entity.location;
                    const dxCheck = targetLocCheck.x - loc.x;
                    const dzCheck = targetLocCheck.z - loc.z;
                    const dyCheck = targetLocCheck.y - loc.y;
                    const horizontalDistCheck = Math.hypot(dxCheck, dzCheck);
                    targetIsAboveForMining = dyCheck > 1; // Target is above
                    // If target is more than 8 blocks away, we need to move closer before mining
                    // (blocks we'd try to break would be too far - reach is 6)
                    // BUT: If target is above, we can still build stairs while moving closer
                    if (horizontalDistCheck > 8 && !targetIsAboveForMining) {
                        shouldMoveCloserForMining = true;
                    }
                }
                // Allow mining if:
                // 1. Not moving closer for mining (normal case), OR
                // 2. Target is above (need stairs even when moving closer), OR
                // 3. Strategy is tunnel (always mine)
                const willMine = (!shouldMoveCloserForMining || targetIsAboveForMining) && ((!canReachByWalking && (!shouldMoveCloser || !originalCanReachByWalking)) || strategy === "tunnel");
                
                // If shouldMoveCloser and can reach by walking, apply movement impulses instead of mining
                // OR if we need to move closer for mining (blocks would be out of reach)
                if ((shouldMoveCloser && originalCanReachByWalking) || shouldMoveCloserForMining) {
                    // Apply strong movement impulse toward target
                    const targetLoc = targetInfo.entity.location;
                    const dx = targetLoc.x - loc.x;
                    const dz = targetLoc.z - loc.z;
                    const horizontalDist = Math.hypot(dx, dz);
                    
                    if (horizontalDist > 1 && horizontalDist < 50) {
                        try {
                            // Use nox7-inspired pathfinding movement/steering
                            const path = getPathfindingPath(entity, targetInfo, config.tunnelHeight + extraHeight);
                            if (path && path.length >= 2) {
                                // Use smooth steering along path
                                steerAlongPath(entity, path, targetInfo, config);
                            } else {
                                // Fallback: direct movement
                                const waypoint = getPathfindingWaypoint(entity, targetInfo, config.tunnelHeight + extraHeight);
                                const moveTarget = waypoint ? { x: waypoint.x + 0.5, z: waypoint.z + 0.5 } : { x: targetLoc.x, z: targetLoc.z };
                                const moveDx = moveTarget.x - loc.x;
                                const moveDz = moveTarget.z - loc.z;
                                const moveDist = Math.hypot(moveDx, moveDz) || 1;
                                
                                // Stronger impulse when shouldMoveCloser
                                let impulse = 0.06;
                                if (horizontalDist > 15) {
                                    impulse = 0.08;
                                }
                                
                                // Add upward component if target is above
                                const dy = targetLoc.y - loc.y;
                                let verticalImpulse = 0;
                                if (dy > 0.5) {
                                    // Target is above - add upward push
                                    if (dy > 2 && horizontalDist <= 8) {
                                        verticalImpulse = 0.02; // Stronger when close and high
                                    } else if (dy > 1 && horizontalDist <= 12) {
                                        verticalImpulse = 0.015; // Moderate when medium distance
                                    } else if (dy > 3) {
                                        verticalImpulse = 0.01; // Still push even when far if very high
                                    }
                                }
                                
                                entity.applyImpulse({
                                    x: (moveDx / moveDist) * impulse,
                                    y: verticalImpulse,
                                    z: (moveDz / moveDist) * impulse
                                });
                            }
                            
                            if (getDebugPathfinding() && tick % 20 === 0) {
                                console.warn(`[MINING AI] Applied movement impulse (shouldMoveCloser=${shouldMoveCloser}, shouldMoveCloserForMining=${shouldMoveCloserForMining}, canReachByWalking=${originalCanReachByWalking}, dist=${horizontalDist.toFixed(1)})`);
                            }
                        } catch { }
                    }
                    
                    // Only mine blocks that are directly blocking and within reach (2-3 blocks)
                    if (digContext.cleared < digContext.max) {
                        const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
                        if (dirX !== 0 || dirZ !== 0) {
                            // CRITICAL: Check if target is above before breaking blocks at foot level
                            // When target is above (dy > 1), we should NOT break blocks at foot level
                            // We should use carveStair instead to build upward stairs
                            const targetLocForMining = targetInfo.entity.location;
                            const dyForMining = targetLocForMining.y - loc.y;
                            
                            // Only check blocks at foot level when target is at same level or below (dy <= 1)
                            // When target is above (dy > 1), skip this section - use stairs instead
                            if (dyForMining <= 1) {
                                // Only check blocks within 3 steps (reachable)
                                for (let step = 1; step <= 3; step++) {
                                    if (digContext.cleared >= digContext.max) break;
                                    const checkX = Math.floor(loc.x) + dirX * step;
                                    const checkZ = Math.floor(loc.z) + dirZ * step;
                                    const checkY = Math.floor(loc.y);
                                    
                                    // Check if block is within reach
                                    if (!isBlockWithinReach(entity, checkX, checkY, checkZ)) {
                                        continue; // Too far, skip
                                    }
                                    
                                    // Check blocks at this step (only when target is at same level or below)
                                    for (let h = 0; h < config.tunnelHeight; h++) {
                                        if (digContext.cleared >= digContext.max) break;
                                        const block = getBlock(entity.dimension, checkX, checkY + h, checkZ);
                                        if (block && isBreakableBlock(block) && isSolidBlock(block)) {
                                            // Check line of sight
                                            if (canSeeBlock(entity, checkX, checkY + h, checkZ, targetInfo)) {
                                                clearBlock(entity.dimension, checkX, checkY + h, checkZ, digContext, entity, targetInfo);
                                                if (getDebugMining()) {
                                                    console.warn(`[MINING AI] Mined blocking block at (${checkX}, ${checkY + h}, ${checkZ}) while moving closer`);
                                                }
                                                return; // Break one block at a time
                                            }
                                        }
                                    }
                                }
                            } else {
                                // Target is above - skip breaking blocks at foot level, use stairs instead
                                if (getDebugMining() || getDebugGeneral()) {
                                    console.warn(`[MINING AI] Skipping foot-level block breaking while moving closer - target is above (dy=${dyForMining.toFixed(1)}), use stairs instead`);
                                }
                            }
                        }
                    }
                    
                    // If target is above, continue to stair building section (need stairs while moving closer)
                    // Otherwise, just move and return
                    const targetLocForStairs = targetInfo.entity.location;
                    const dyForStairs = targetLocForStairs.y - loc.y;
                    const shouldBuildStairsWhileMoving = dyForStairs > 1; // Target is above - need stairs
                    
                    if (!shouldBuildStairsWhileMoving) {
                        // Don't call breakWallAhead when shouldMoveCloser - prioritize movement
                        if (getDebugMining() || getDebugGeneral()) {
                            console.warn(`[MINING AI] Skipping breakWallAhead (shouldMoveCloser=true, originalCanReachByWalking=true, dy=${dyForStairs.toFixed(1)}) - prioritizing movement`);
                        }
                        return;
                    } else {
                        // Target is above - continue to stair building section below
                        if (getDebugMining() || getDebugGeneral()) {
                            console.warn(`[MINING AI] Target is above (dy=${dyForStairs.toFixed(1)}) - will build stairs while moving closer`);
                        }
                        // Don't return - continue to stair building logic below
                    }
                }
                
                if (getDebugMining() || getDebugGeneral()) {
                    console.warn(`[MINING AI] Mining condition check: canReachByWalking=${canReachByWalking}, originalCanReachByWalking=${originalCanReachByWalking}, shouldMoveCloser=${shouldMoveCloser}, shouldMoveCloserForMining=${shouldMoveCloserForMining}, strategy=${strategy}, willMine=${willMine}, digContext.max=${digContext.max}, digContext.cleared=${digContext.cleared}`);
                }
                if (willMine) {
                    // CRITICAL: If target is above and we're building upward stairs, SKIP breakWallAhead
                    // breakWallAhead breaks blocks at foot level, which interferes with stair building
                    // The stair pattern will handle breaking blocks correctly for upward movement
                    const shouldSkipWallBreakingForStairs = targetInfo && targetInfo.entity?.location && (targetInfo.entity.location.y - loc.y) > 1;
                    
                    // Check for stuck loop: if bear keeps trying to break same blocks without progress
                    // Define inLoop BEFORE the conditional so it's available in both branches
                    const entityId = entity.id;
                    const situationKey = `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}-${targetInfo?.entity?.location ? `${Math.floor(targetInfo.entity.location.x)},${Math.floor(targetInfo.entity.location.y)},${Math.floor(targetInfo.entity.location.z)}` : 'no-target'}`;
                    const loopData = stuckLoopDetection.get(entityId);
                    const currentTick = system.currentTick;
                    
                    if (loopData && loopData.lastSituation === situationKey) {
                        // Same situation as before
                        const ticksSinceLast = currentTick - loopData.lastTick;
                        if (ticksSinceLast < STUCK_LOOP_RESET_TICKS) {
                            loopData.repeatCount++;
                            loopData.lastTick = currentTick;
                        } else {
                            // Too much time passed, reset
                            loopData.lastSituation = situationKey;
                            loopData.repeatCount = 1;
                            loopData.lastTick = currentTick;
                        }
                    } else {
                        // New situation or first time
                        stuckLoopDetection.set(entityId, {
                            lastSituation: situationKey,
                            repeatCount: 1,
                            lastTick: currentTick
                        });
                    }
                    
                    const finalLoopData = stuckLoopDetection.get(entityId);
                    const inLoop = finalLoopData && finalLoopData.repeatCount >= STUCK_LOOP_THRESHOLD;
                    
                    if (!shouldSkipWallBreakingForStairs) {
                        if (inLoop && getDebugGeneral()) {
                            console.warn(`[MINING AI] Bear ${entityId.substring(0, 8)} stuck in loop (${finalLoopData.repeatCount} repeats) - trying direct target block breaking`);
                        }
                        
                        if (getDebugGeneral() || getDebugMining()) {
                            console.warn(`[MINING AI] Calling breakWallAhead and branchTunnel (canReachByWalking=${canReachByWalking}, shouldMoveCloser=${shouldMoveCloser}, strategy=${strategy}, inLoop=${inLoop}, digContext.max=${digContext.max}, digContext.cleared=${digContext.cleared})`);
                        }
                        breakWallAhead(entity, config.tunnelHeight, digContext, targetInfo, directionOverride, tick);
                        if (getDebugGeneral() || getDebugMining()) {
                            console.warn(`[MINING AI] After breakWallAhead: cleared=${digContext.cleared}/${digContext.max}`);
                        }
                        branchTunnel(entity, config.tunnelHeight, digContext, tick, directionOverride);
                        if (getDebugGeneral() || getDebugMining()) {
                            console.warn(`[MINING AI] After branchTunnel: cleared=${digContext.cleared}/${digContext.max}`);
                        }
                    } else {
                        if (getDebugGeneral() || getDebugMining()) {
                            const dy = targetInfo.entity.location.y - loc.y;
                            console.warn(`[MINING AI] Skipping breakWallAhead/branchTunnel - building upward stairs instead (target is above, dy=${dy.toFixed(1)})`);
                        }
                    }
                    
                    // If in loop and still no progress, try more aggressive approach
                    // BUT: Only try to break blocks that are within reach - don't waste time on blocks that are too far
                    if (inLoop && digContext.cleared === 0 && targetInfo?.entity?.location) {
                        const targetLoc = targetInfo.entity.location;
                        const targetX = Math.floor(targetLoc.x);
                        const targetY = Math.floor(targetLoc.y);
                        const targetZ = Math.floor(targetLoc.z);
                        const loc = entity.location;
                        
                        // Try breaking any breakable block near target location (more aggressive)
                        // BUT: Prioritize blocks closer to the bear first, and only try blocks within reach
                        // Start with blocks closer to the bear's position
                        const checkRadius = 3; // Check up to 3 blocks around target
                        let foundBlock = false;
                        
                        for (let radius = 0; radius <= checkRadius && !foundBlock; radius++) {
                            for (let dx = -radius; dx <= radius && !foundBlock; dx++) {
                                for (let dz = -radius; dz <= radius && !foundBlock; dz++) {
                                    // Only check blocks at the edge of the current radius (avoid duplicates)
                                    if (Math.abs(dx) !== radius && Math.abs(dz) !== radius && radius > 0) continue;
                                    
                                    if (digContext.cleared >= digContext.max) break;
                                    for (let h = 0; h < config.tunnelHeight && !foundBlock; h++) {
                                        if (digContext.cleared >= digContext.max) break;
                                        
                                        const checkX = targetX + dx;
                                        const checkY = targetY + h;
                                        const checkZ = targetZ + dz;
                                        
                                        // CRITICAL: Only try to break blocks that are within reach
                                        if (!isBlockWithinReach(entity, checkX, checkY, checkZ)) {
                                            continue; // Skip blocks that are too far away
                                        }
                                        
                                        const block = getBlock(entity.dimension, checkX, checkY, checkZ);
                                        if (isBreakableBlock(block) && isSolidBlock(block)) {
                                            if (getDebugGeneral()) {
                                                const dist = Math.hypot((checkX + 0.5) - loc.x, (checkY + 0.5) - loc.y, (checkZ + 0.5) - loc.z);
                                                console.warn(`[MINING AI] Loop detected - aggressively breaking block at (${checkX}, ${checkY}, ${checkZ}), type=${block?.typeId}, distance=${dist.toFixed(1)}`);
                                            }
                                            const cleared = clearBlock(entity.dimension, checkX, checkY, checkZ, digContext, entity, targetInfo);
                                            if (cleared) {
                                                foundBlock = true;
                                                // Reset loop counter on success
                                                if (stuckLoopDetection.has(entityId)) {
                                                    stuckLoopDetection.delete(entityId);
                                                }
                                            }
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if (getDebugGeneral()) console.warn(`[MINING AI] After breakWallAhead/branchTunnel: cleared=${digContext.cleared}/${digContext.max}`);
                } else {
                    if (getDebugGeneral()) console.warn(`[MINING AI] Skipping breakWallAhead/branchTunnel (canReachByWalking=${canReachByWalking}, shouldMoveCloser=${shouldMoveCloser}, strategy=${strategy})`);
                }
                
                // Ensure path is accessible for smaller bears (maple thralls and tiny MBs can use tunnels)
                // Note: Not sized for huge buff bears
                ensurePathAccessibility(entity, config.tunnelHeight + extraHeight, digContext, directionOverride, tick);
                
                // Pitfall creation is now handled in the adaptive mining strategy system below
                // This ensures pitfall is evaluated alongside other options and chosen when most effective
            } else {
                if (getDebugPitfall()) {
                    console.warn(`[PITFALL DEBUG] processContext: NOT calling breakBlocksUnderTarget - role=${role}, hasTarget=${!!targetInfo}`);
                }
            }
            // Proactively create stairs/ramps when target is above/below, even while moving horizontally
            // This ensures bears plan ahead and create stairs on the way to the target, not just when directly below
            // Check vertical difference to determine if stairs/ramps are needed
            let needsStairsOrRamps = false;
            if (targetInfo && targetInfo.entity?.location) {
                const targetLoc = targetInfo.entity.location;
                const dy = targetLoc.y - loc.y;
                // If target is significantly above (more than 1 block), start creating stairs proactively
                // Don't wait until directly below - create stairs while moving toward target
                // For high targets (10+ blocks), be even more aggressive
                // Also prioritize stairs when target is above (even if not extremely high)
                if (dy > 1) {
                    needsStairsOrRamps = true;
                    // For very high targets, prioritize stairs even more
                    if (dy >= HIGH_TARGET_THRESHOLD) {
                        // Force stair building for high targets - they need continuous stairs
                        ascendGoal = true; // This will trigger stair building
                    } else if (dy > 3) {
                        // Target is moderately high (3-10 blocks) - also prioritize stairs
                        // This ensures bears build stairs instead of just trying to walk/jump
                        ascendGoal = true;
                    }
                }
                // If target is significantly below (more than 2 blocks), start creating ramps proactively
                if (dy < -2) {
                    needsStairsOrRamps = true;
                }
            }
            
            // Only carve stairs if we're actually mining
            // AND target is above OR if stuck and best direction is up
            // OR if we proactively need stairs/ramps (target is above/below)
            // CRITICAL: Build stairs even when shouldMoveCloser=true if target is above - need to climb while moving closer
            // Only skip stairs if target is NOT above (dy <= 0) and shouldMoveCloser=true
            const shouldBuildStairs = (ascending || ascendGoal || needsStairsOrRamps || (isStuck && stuckDirectionOverride && stuckDirectionOverride.y === 1));
            
            // Check if target is above - if so, always build stairs even when moving closer
            let targetDy = 0;
            if (targetInfo && targetInfo.entity?.location) {
                targetDy = targetInfo.entity.location.y - loc.y;
            }
            const skipStairsForMovement = shouldMoveCloser && targetDy <= 0; // Only skip if target is NOT above
            
            if (shouldBuildStairs && !skipStairsForMovement && digContext.cleared < digContext.max) {
                // Adaptive mining strategy: Evaluate all options and pick the best one
                // Priority order: Pitfall > Regular Stairs > Spiral Stairs
                let chosenAction = null;
                let actionScore = -1;
                
                if (targetInfo && targetInfo.entity?.location) {
                    const targetLoc = targetInfo.entity.location;
                    const dy = targetLoc.y - loc.y;
                    const dx = targetLoc.x - loc.x;
                    const dz = targetLoc.z - loc.z;
                    const horizontalDist = Math.hypot(dx, dz);
                    
                    // OPTION 1: Pitfall creation (breaking blocks under target)
                    // Best when: Target is on a pillar/bridge OR at reasonable height (3-5 blocks) and close
                    // Pitfall is NOT effective for high targets (5+ blocks) - use stairs instead
                    const pillarInfo = isTargetOnPillarOrBridge(entity, targetInfo);
                    const isOnPillar = pillarInfo !== null;
                    // Only consider pitfall if:
                    // CRITICAL: Do NOT use pitfall when target is above (dy > 1)
                    // Pitfall breaks blocks under target, which is counterproductive when target is above
                    // Only use pitfall when target is at same level or below (dy <= 1)
                    // 1. Target is on a pillar/bridge AND at same level or below (dy <= 1), OR
                    // 2. Target is at same level or slightly below (dy <= 1)
                    // Do NOT use pitfall for targets above (dy > 1) - stairs are needed instead
                    const shouldConsiderPitfall = dy <= 1 && ((isOnPillar && dy <= 1) || (dy <= 1 && horizontalDist <= 4));
                    
                    if (shouldConsiderPitfall && (strategy === "pitfall" || strategy === "hybrid_pitfall" || isOnPillar)) {
                        // Check if there are blocks to break under the target
                        const targetX = Math.floor(targetLoc.x);
                        const targetY = Math.floor(targetLoc.y);
                        const targetZ = Math.floor(targetLoc.z);
                        let pitfallScore = 0;
                        
                        // Check for breakable blocks under target
                        // For pillars, check a wider area (3x3); for normal, just directly under
                        const checkRadius = isOnPillar ? 1 : 0;
                        const maxDepth = isOnPillar ? 15 : 5;
                        
                        for (let dx = -checkRadius; dx <= checkRadius; dx++) {
                            for (let dz = -checkRadius; dz <= checkRadius; dz++) {
                                for (let y = targetY - 1; y >= Math.max(targetY - maxDepth, Math.floor(loc.y) - 2); y--) {
                                    const block = getBlock(entity.dimension, targetX + dx, y, targetZ + dz);
                                    if (isBreakableBlock(block) && isSolidBlock(block)) {
                                        // Higher score for pillars (more strategic)
                                        pitfallScore = isOnPillar ? 12 : 8; // Reduced from 15/10 to prefer stairs more
                                        break;
                                    }
                                }
                                if (pitfallScore > 0) break;
                            }
                            if (pitfallScore > 0) break;
                        }
                        
                        if (pitfallScore > actionScore) {
                            actionScore = pitfallScore;
                            chosenAction = "pitfall";
                        }
                    }
                    
                    // OPTION 2: Regular stairs
                    // Good for: All climbs, especially high targets (5+ blocks)
                    // Create stairs proactively when target is above, even while moving horizontally
                    // This ensures stairs are built on the way to the target, not just when directly below
                    if (dy > 1) {
                        // Regular stairs are always viable (they adapt to terrain)
                        // Higher score if target is significantly above (more planning needed)
                        // Prefer stairs over pitfall for high targets (dy > 5)
                        // For very high targets (10+ blocks), stairs are essential
                        let regularStairScore = 5; // Base score
                        if (dy >= HIGH_TARGET_THRESHOLD) {
                            regularStairScore = 15; // Highest priority for very high targets (10+ blocks)
                        } else if (dy > 5) {
                            regularStairScore = 10; // High score for high targets - stairs are better than pitfall
                        } else if (dy > 3) {
                            regularStairScore = 8; // Higher score for moderate heights
                        } else {
                            regularStairScore = 6; // Base score for low heights
                        }
                        if (regularStairScore > actionScore) {
                            actionScore = regularStairScore;
                            chosenAction = "regular_stair";
                        }
                    }
                    
                    // OPTION 3: Spiral stairs (upward) - 3x3 area for vertical ascent
                    // Use for high targets (10+ blocks) - creates stairs in a 3x3 area, allowing bears to go out of way
                    // Higher priority for very high targets where regular stairs might not be enough
                    if (dy >= SPIRAL_STAIR_THRESHOLD) {
                        if (isSpiralStairViable(entity, config.tunnelHeight, directionOverride, false)) {
                            // Higher score for very high targets - spiral stairs work better in 3x3 area
                            let spiralScore = 3; // Base score
                            if (dy >= HIGH_TARGET_THRESHOLD) {
                                spiralScore = 12; // High priority for very high targets - 3x3 area is essential
                            } else if (dy > 5) {
                                spiralScore = 7; // Medium-high priority for high targets
                            }
                            if (spiralScore > actionScore) {
                                actionScore = spiralScore;
                                chosenAction = "spiral_stair";
                            }
                        }
                    }
                }
                
                // Execute the chosen action
                if (chosenAction === "pitfall") {
                    if (getDebugGeneral() || getDebugPitfall()) {
                        console.warn(`[MINING AI] Chosen action: PITFALL (breaking blocks under target) - Score: 10`);
                    }
                    breakBlocksUnderTarget(entity, targetInfo, digContext);
                    if (getDebugGeneral() || getDebugPitfall()) {
                        console.warn(`[MINING AI] After breakBlocksUnderTarget: cleared=${digContext.cleared}/${digContext.max}`);
                    }
                } else if (chosenAction === "spiral_stair") {
                    if (getDebugGeneral()) {
                        const dy = targetInfo?.entity?.location ? (targetInfo.entity.location.y - loc.y) : 0;
                        console.warn(`[MINING AI] Chosen action: SPIRAL_STAIR (dy=${dy.toFixed(1)}, threshold=${SPIRAL_STAIR_THRESHOLD}) - Score: 3`);
                    }
                    carveSpiralStair(entity, config.tunnelHeight, digContext, directionOverride, targetInfo);
                    if (getDebugGeneral()) console.warn(`[MINING AI] After carveSpiralStair: cleared=${digContext.cleared}/${digContext.max}`);
            } else {
                    // Default to regular stairs (most reliable)
                    if (getDebugGeneral()) {
                        console.warn(`[MINING AI] Chosen action: REGULAR_STAIR (ascending=${ascending}, ascendGoal=${ascendGoal}, shouldMoveCloser=${shouldMoveCloser}, isStuck=${isStuck}) - Score: 5`);
                }
                carveStair(entity, config.tunnelHeight, digContext, directionOverride, targetInfo);
                if (getDebugGeneral()) console.warn(`[MINING AI] After carveStair: cleared=${digContext.cleared}/${digContext.max}`);
                    
                    // CRITICAL: Apply movement and JUMP after building stairs (even if only 1 block was broken)
                    // Pattern: Break 3 blocks (above head, in front at head level, above forward block), then JUMP into that space
                    // This helps the bear move forward and UPWARD to climb the stairs
                    // Apply movement even if only 1-2 blocks are broken - don't wait for all 3
                    if (targetInfo && targetInfo.entity?.location) {
                        const targetLoc = targetInfo.entity.location;
                        const dy = targetLoc.y - loc.y;
                        const { x: dirX, z: dirZ } = resolveDirection(entity, directionOverride);
                        
                        // CRITICAL: Always apply movement when target is above (dy > 1) AND we broke at least 1 block
                        // The bear MUST jump into the cleared space to actually ascend
                        const dimension = entity.dimension;
                        if (dimension && (dirX !== 0 || dirZ !== 0) && dy > 1 && digContext.cleared > 0) {
                            const baseX = Math.floor(loc.x);
                            const baseY = Math.floor(loc.y);
                            const baseZ = Math.floor(loc.z);
                            const stepX = baseX + dirX;
                            const stepZ = baseZ + dirZ;
                            
                            // Check if ANY of the stair blocks are clear (don't need all 3 to be clear)
                            const blockAboveHead = getBlock(dimension, baseX, baseY + 2, baseZ);
                            const blockInFront = getBlock(dimension, stepX, baseY + 1, stepZ);
                            const blockAboveFront = getBlock(dimension, stepX, baseY + 2, stepZ);
                            
                            // Check if at least one of the stair blocks is clear (we broke at least one)
                            const hasClearedSpace = (!blockAboveHead || AIR_BLOCKS.has(blockAboveHead.typeId)) ||
                                                   (!blockInFront || AIR_BLOCKS.has(blockInFront.typeId)) ||
                                                   (!blockAboveFront || AIR_BLOCKS.has(blockAboveFront.typeId));
                            
                            // Check if the forward space is clear enough to move into
                            const forwardBlockAtHead = getBlock(dimension, stepX, baseY + 1, stepZ);
                            const forwardBlockAbove = getBlock(dimension, stepX, baseY + 2, stepZ);
                            const forwardSpaceIsClear = (!forwardBlockAtHead || AIR_BLOCKS.has(forwardBlockAtHead.typeId)) && 
                                                        (!forwardBlockAbove || AIR_BLOCKS.has(forwardBlockAbove.typeId));
                            
                            // Apply movement if we cleared at least one block OR if forward space is clear
                            if (hasClearedSpace || forwardSpaceIsClear) {
                                try {
                                    // Strong forward impulse to move into the cleared space
                                    const forwardImpulse = 0.08; // Stronger to move into space
                                    
                                    // STRONG upward impulse to JUMP into the cleared space
                                    // This is critical - the bear needs to jump UP into the cleared space
                                    let upwardImpulse = 0.05; // Base upward impulse (stronger for jumping)
                                    if (dy > 5) {
                                        upwardImpulse = 0.06; // Even stronger for high targets
                                    } else if (dy > 3) {
                                        upwardImpulse = 0.055; // Strong for medium heights
                                    }
                                    
                                    // Also add horizontal movement toward target
                                    const dx = targetLoc.x - loc.x;
                                    const dz = targetLoc.z - loc.z;
                                    const horizontalDist = Math.hypot(dx, dz);
                                    let targetImpulseX = 0;
                                    let targetImpulseZ = 0;
                                    if (horizontalDist > 0.1 && horizontalDist < 20) {
                                        const targetDirX = dx / horizontalDist;
                                        const targetDirZ = dz / horizontalDist;
                                        const targetImpulse = 0.05; // Movement toward target (stronger)
                                        targetImpulseX = targetDirX * targetImpulse;
                                        targetImpulseZ = targetDirZ * targetImpulse;
                                    }
                                    
                                    // Apply strong forward and upward impulse to JUMP into the cleared space
                                    entity.applyImpulse({
                                        x: (dirX * forwardImpulse) + targetImpulseX, // Forward into cleared space + toward target
                                        y: upwardImpulse, // UPWARD JUMP into the cleared space
                                        z: (dirZ * forwardImpulse) + targetImpulseZ
                                    });
                                    if (getDebugGeneral() || getDebugMining()) {
                                        console.warn(`[MINING AI] Applied JUMP movement after stairs (dy=${dy.toFixed(1)}, cleared=${digContext.cleared}, forward=${forwardImpulse}, upward=${upwardImpulse}, forwardSpaceClear=${forwardSpaceIsClear}, hasClearedSpace=${hasClearedSpace}, targetImpulse=(${targetImpulseX.toFixed(3)}, ${targetImpulseZ.toFixed(3)})`);
                                    }
                                } catch (e) {
                                    if (getDebugGeneral()) {
                                        console.warn(`[MINING AI] Error applying jump movement: ${e}`);
                                    }
                                }
                            } else if (getDebugGeneral() || getDebugMining()) {
                                console.warn(`[MINING AI] Skipped movement after stairs - no cleared space yet (dy=${dy.toFixed(1)}, cleared=${digContext.cleared}, forwardSpaceClear=${forwardSpaceIsClear}, hasClearedSpace=${hasClearedSpace})`);
                            }
                        } else if (getDebugGeneral() || getDebugMining()) {
                            if (dy <= 1) {
                                console.warn(`[MINING AI] Skipped movement after stairs - target not above (dy=${dy.toFixed(1)})`);
                            } else if (digContext.cleared === 0) {
                                console.warn(`[MINING AI] Skipped movement after stairs - no blocks cleared yet (cleared=${digContext.cleared})`);
                            } else {
                                console.warn(`[MINING AI] Skipped movement after stairs (dy=${dy.toFixed(1)}, dirX=${dirX}, dirZ=${dirZ}, cleared=${digContext.cleared})`);
                            }
                        }
                    }
                }
                
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
            // Proactively create ramps/spiral stairs down when target is below, even while moving horizontally
            // This ensures bears plan ahead and create ramps/spirals on the way to the target
            if (targetInfo && targetInfo.entity?.location && digContext.cleared < digContext.max) {
                const loc = entity.location;
                const targetLoc = targetInfo.entity.location;
                const dy = targetLoc.y - loc.y;
                const dx = targetLoc.x - loc.x;
                const dz = targetLoc.z - loc.z;
                const horizontalDist = Math.hypot(dx, dz);
                
                // Create ramps/spiral stairs proactively if:
                // 1. Target is significantly below (more than 2 blocks) OR
                // 2. Target is below and we're close horizontally (within 8 blocks) OR
                // 3. Stuck and best direction is down
                // This ensures ramps/spirals are created on the way to the target, not just when directly above
                const shouldCreateRamp = (dy < -2) || 
                                        (dy < 0 && horizontalDist <= 8) ||
                                        (isStuck && stuckDirectionOverride && stuckDirectionOverride.y === -1);
                
                if (shouldCreateRamp && (descendGoal || dy < 0)) {
                    // Adaptive descending strategy: Leaders should use stair-like descent (spiral stairs)
                    // This works better than straight down mining and allows followers to follow
                    // Regular ramps are only for non-leaders or when spiral isn't viable
                    // Spiral stairs are better for deep descents (4+ blocks), ramps are better for shallow descents
                    let chosenDescendAction = "ramp";
                    let descendActionScore = 0;
                    
                    // OPTION 1: Spiral stairs (for deep descents) - stair-like descent
                    // Better for: Deep descents (4+ blocks), close horizontally, terrain is suitable
                    // Leaders should prioritize spiral stairs so followers can follow
                    const isLeader = role === "leader" && followerCount > 0;
                    if (dy <= -SPIRAL_STAIR_THRESHOLD && horizontalDist <= 12) {
                        if (isSpiralStairViable(entity, config.tunnelHeight, directionOverride, true)) {
                            // Leaders with followers get higher priority for spiral stairs (stair-like descent)
                            const spiralScore = isLeader ? 10 : 6; // Higher score for leaders - allows followers to follow
                            if (spiralScore > descendActionScore) {
                                descendActionScore = spiralScore;
                                chosenDescendAction = "spiral_stair";
                            }
                        }
                    }
                    
                    // Also prefer spiral stairs for leaders even if not deep descent (2+ blocks)
                    // This ensures leaders create stair-like paths that followers can use
                    if (isLeader && dy <= -2 && horizontalDist <= 12) {
                        if (isSpiralStairViable(entity, config.tunnelHeight, directionOverride, true)) {
                            const spiralScore = 8; // High priority for leaders - stair-like descent works better
                            if (spiralScore > descendActionScore) {
                                descendActionScore = spiralScore;
                                chosenDescendAction = "spiral_stair";
                            }
                        }
                    }
                    
                    // OPTION 2: Regular ramps (for moderate/shallow descents)
                    // Better for: Moderate descents (2-4 blocks) or when spiral isn't viable
                    const rampScore = Math.abs(dy) >= 2 ? 4 : 2; // Higher score for deeper descents
                    if (rampScore > descendActionScore) {
                        descendActionScore = rampScore;
                        chosenDescendAction = "ramp";
                    }
                    
                    // Execute the chosen descending action
                    if (chosenDescendAction === "spiral_stair") {
                        if (getDebugGeneral()) {
                            console.warn(`[MINING AI] Chosen descending action: SPIRAL_STAIR (dy=${dy.toFixed(1)}, threshold=${SPIRAL_STAIR_THRESHOLD}) - Score: ${descendActionScore}`);
                        }
                        carveSpiralStair(entity, config.tunnelHeight, digContext, directionOverride, targetInfo);
                        if (getDebugGeneral()) console.warn(`[MINING AI] After carveSpiralStair (down): cleared=${digContext.cleared}/${digContext.max}`);
                    } else {
                        if (getDebugGeneral()) console.warn(`[MINING AI] Calling carveRampDown (dy=${dy.toFixed(1)}, horizontalDist=${horizontalDist.toFixed(1)}, isStuck=${isStuck}) - Score: ${descendActionScore}`);
                        carveRampDown(entity, config.tunnelHeight, digContext, directionOverride, targetInfo);
                        if (getDebugGeneral()) console.warn(`[MINING AI] After carveRampDown: cleared=${digContext.cleared}/${digContext.max}`);
                    }
                    
                    // Store target position when ramp/spiral was created (to allow breaking if target moves)
                    stairCreationTargetPos.set(entity.id, {
                        x: targetLoc.x,
                        y: targetLoc.y,
                        z: targetLoc.z,
                        tick: system.currentTick
                    });
                }
            }
            if (planState) {
                advanceBuildPlan(entity.id, digContext.lastBroken);
            }
        } else {
            // If canReachByWalking is true AND no blocking block AND can actually attack AND target not too high, don't mine - just let the entity walk/attack normally
            // Bears should try to walk/climb/attack first, but if target is too high (can't reach with hands), mine to get closer
            if (canReachByWalking && !hasBlockingBlock && canActuallyAttack && !needsMiningForHeight && tick % 40 === 0) {
                if (getDebugPathfinding()) {
                    console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} can reach target by walking/climbing/attacking (canReachByWalking=${canReachByWalking}, hasBlockingBlock=${hasBlockingBlock}, isWithinAttackRange=${isWithinAttackRange}, hasLineOfSight=${hasLineOfSight}, canActuallyAttack=${canActuallyAttack}, needsMiningForHeight=${needsMiningForHeight}, dy=${dy.toFixed(1)}) - NOT mining, using entity AI to walk/attack`);
                }
            } else if (needsMiningForHeight && tick % 40 === 0) {
                if (getDebugPathfinding()) {
                    console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)} target too high (dy=${dy.toFixed(1)} > 3) - NEEDS mining to get closer, cannot reach with hands`);
                }
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
    
    // Starting AI loop - run every tick, but use dynamic processing based on bear count
    // Bears with targets always process at full speed
    let lastBearCount = 0;
    let lastProcessedTick = 0;
    
    miningAIIntervalId = system.runInterval(() => {
        try {
            const tick = system.currentTick;
            const ticksSinceStart = tick - aiLoopStartTick;
            const isStartupPhase = ticksSinceStart <= STARTUP_DEBUG_TICKS;
            
            // Count total bears across all dimensions to determine processing interval
            let totalBearsThisTick = 0;
            for (const dimId of DIMENSION_IDS) {
                try {
                    const dimension = world.getDimension(dimId);
                    if (!dimension) continue;
                    for (const config of MINING_BEAR_TYPES) {
                        try {
                            const entities = dimension.getEntities({ type: config.id });
                            totalBearsThisTick += entities?.length || 0;
                        } catch { }
                    }
                } catch { }
            }
            
            // Calculate dynamic interval based on bear count
            let dynamicInterval = AI_TICK_INTERVAL_BASE;
            if (totalBearsThisTick < BEAR_COUNT_THRESHOLD_FEW) {
                dynamicInterval = AI_TICK_INTERVAL_FEW; // 1-4 bears: full speed
            } else if (totalBearsThisTick < BEAR_COUNT_THRESHOLD_MEDIUM) {
                dynamicInterval = AI_TICK_INTERVAL_MEDIUM; // 5-9 bears: medium speed
            } else {
                dynamicInterval = AI_TICK_INTERVAL_BASE; // 10+ bears: slower
            }
            
            // Log interval changes
            if (totalBearsThisTick !== lastBearCount && getDebugGeneral()) {
                console.warn(`[MINING AI] Bear count: ${totalBearsThisTick}, using interval: ${dynamicInterval} ticks`);
                lastBearCount = totalBearsThisTick;
            }
            
            // Log very frequently during startup to verify script is running (only if debug enabled)
            if (getDebugGeneral()) {
                if (isStartupPhase && (ticksSinceStart <= 10 || ticksSinceStart % 20 === 0)) {
                    console.warn(`[MINING AI] Script running at world tick ${tick} (${ticksSinceStart} ticks since start)`);
                } else if (!isStartupPhase && tick % 200 === 0) {
                    console.warn(`[MINING AI] Script running at world tick ${tick}`);
                }
            }
            
            // Determine if we should process bears without targets this tick
            // Bears with targets always process at full speed (every tick)
            const ticksSinceLastProcess = tick - lastProcessedTick;
            const shouldProcessIdleBears = ticksSinceLastProcess >= dynamicInterval;
            
            // Log when we actually process AI (only if debug enabled)
            if (getDebugGeneral() && (isStartupPhase || tick % 40 === 0)) {
                console.warn(`[MINING AI] Processing AI at tick ${tick} (${ticksSinceStart} ticks since start, interval: ${dynamicInterval} ticks, total bears: ${totalBearsThisTick}, shouldProcessIdle: ${shouldProcessIdleBears})`);
            }
            
            // Store the dynamic interval and processing flag for use in processing
            const currentDynamicInterval = dynamicInterval;
            const processIdleBears = shouldProcessIdleBears;
            
            // Update last processed tick if we're processing idle bears
            if (processIdleBears) {
                lastProcessedTick = tick;
            }
    
            // AI processing (runs every AI_TICK_INTERVAL ticks)
            const activeLeaderIdsThisTick = new Set();
            const activeWorkerIds = new Set();
            
            // Performance: Use shared player cache
            const allPlayers = getCachedPlayers();
            const playerPositions = getCachedPlayerPositions();
            
            // Log player count more frequently during startup (only if debug enabled)
            if (getDebugGeneral() && (isStartupPhase || tick % 40 === 0)) {
                if (allPlayers.length === 0) {
                    console.warn(`[MINING AI] No players found at tick ${tick} (${ticksSinceStart} ticks since start)`);
                } else {
                    console.warn(`[MINING AI] Found ${allPlayers.length} player(s) at tick ${tick} (${ticksSinceStart} ticks since start)`);
                }
            }
            
            // Player positions already cached in shared cache

    // Process all dimensions
    for (const dimId of DIMENSION_IDS) {
        let dimension;
        try {
            dimension = world.getDimension(dimId);
        } // end per-tick processing block
        catch (error) {
            console.error(`[MINING AI] Error getting dimension ${dimId}:`, error);
            continue;
        }
        if (!dimension) continue;

        // Process each mining bear type
        let totalMiningBears = 0;
        const variantCounts = new Map();
        const entityMap = new Map(); // Store entities for processing
        
        for (const config of MINING_BEAR_TYPES) {
            let entities;
            try {
                entities = dimension.getEntities({ type: config.id });
            } catch (error) {
                console.error(`[MINING AI] Error getting entities for ${config.id}:`, error);
                continue;
            }
            
            const count = entities?.length || 0;
            if (count > 0) {
                totalMiningBears += count;
                variantCounts.set(config.id, count);
                entityMap.set(config.id, entities);
            }
        }
        
        // Combined debug logging for all mining bear variants
        if (getDebugGeneral() && (isStartupPhase || tick % 40 === 0)) {
            if (totalMiningBears === 0) {
                console.warn(`[MINING AI] No mining bear entities found in ${dimId} at tick ${tick}`);
            } else {
                const variantList = Array.from(variantCounts.entries())
                    .map(([id, count]) => `${count} ${id}`)
                    .join(', ');
                console.warn(`[MINING AI] Found ${totalMiningBears} total mining bear(s) in ${dimId} at tick ${tick} (${variantList})`);
            }
        }
        
        // Process each mining bear type (using cached entities)
        for (const config of MINING_BEAR_TYPES) {
            const entities = entityMap.get(config.id);
            if (!entities || entities.length === 0) {
                if (getDebugGeneral() && variantCounts.has(config.id)) {
                    console.warn(`[MINING AI] WARNING: ${config.id} was counted (${variantCounts.get(config.id)}) but not found in entityMap!`);
                }
                continue;
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
            let invalidCount = 0;
            let outOfRangeCount = 0;
            let minDistSq = Infinity;
            const entityStatus = new Map(); // Track entity status for debugging
            
            for (const entity of entities) {
                const entityId = entity.id;
                let status = { valid: true, inRange: false, dist: 0 };
                
                // Check if entity is valid (handles both function and boolean property)
                const entityIsValid = typeof entity?.isValid === "function" ? entity.isValid() : Boolean(entity?.isValid);
                if (!entityIsValid) {
                    invalidCount++;
                    status.valid = false;
                    entityStatus.set(entityId, status);
                    continue;
                }
                
                // Check if entity is within processing distance of any player
                const entityLoc = entity.location;
                let withinRange = false;
                let closestDist = Infinity;
                for (const playerPos of dimPlayerPositions) {
                    const dx = entityLoc.x - playerPos.x;
                    const dy = entityLoc.y - playerPos.y;
                    const dz = entityLoc.z - playerPos.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    const dist = Math.sqrt(distSq);
                    closestDist = Math.min(closestDist, dist);
                    minDistSq = Math.min(minDistSq, distSq);
                    if (distSq <= MAX_PROCESSING_DISTANCE_SQ) {
                        withinRange = true;
                        status.inRange = true;
                        status.dist = dist;
                        break;
                    }
                }
                
                if (withinRange) {
                    validEntities.push(entity);
                } else {
                    outOfRangeCount++;
                    status.dist = closestDist;
                }
                entityStatus.set(entityId, status);
            }
            
            // Debug: Log entity status changes
            if (getDebugGeneral() && entities.length > 0) {
                const prevStatus = entityStatusCache.get(config.id) || new Map();
                for (const [entityId, status] of entityStatus.entries()) {
                    const prev = prevStatus.get(entityId);
                    if (!prev || prev.valid !== status.valid || prev.inRange !== status.inRange) {
                        if (tick % 20 === 0) { // Only log every 20 ticks to reduce spam
                            console.warn(`[MINING AI] Entity ${entityId.substring(0, 8)} status changed: valid=${status.valid}, inRange=${status.inRange}, dist=${status.dist.toFixed(1)} (was: valid=${prev?.valid ?? 'unknown'}, inRange=${prev?.inRange ?? 'unknown'})`);
                        }
                    }
                }
                entityStatusCache.set(config.id, entityStatus);
            }
            
            if (validEntities.length === 0) {
                // Log more frequently during startup or occasionally (only if debug enabled)
                if (getDebugGeneral()) {
                    const isStartup = tick <= STARTUP_DEBUG_TICKS;
                    if (isStartup || tick % 40 === 0) {
                        const minDist = minDistSq !== Infinity ? Math.sqrt(minDistSq).toFixed(1) : "N/A";
                        console.warn(`[MINING AI] No valid entities within range for ${config.id} in ${dimId} (checked ${entities.length} entities: ${invalidCount} invalid, ${outOfRangeCount} out of range, closest: ${minDist} blocks, max: ${MAX_PROCESSING_DISTANCE})`);
                    }
                }
                continue;
            }
            
            // Log when we find entities (always log if debug enabled, not just every 40 ticks)
            if (getDebugGeneral()) {
                console.warn(`[MINING AI] Processing ${validEntities.length} ${config.id} entities in ${dimId} (out of ${entities.length} total)`);
            }
            
            const contexts = [];

            for (const entity of validEntities) {
                activeWorkerIds.add(entity.id);
                
                // Performance: Use cached target lookup (only refreshes every TARGET_CACHE_TICKS)
                const liveTarget = findNearestTarget(entity, TARGET_SCAN_RADIUS, true);
                if (getDebugTarget() && tick % 20 === 0) {
                    console.warn(`[MINING AI] Context creation: entity=${entity.id.substring(0, 8)}, liveTarget=${!!liveTarget}`);
                }
                if (liveTarget) {
                    updateLastKnownTarget(entity, liveTarget);
                    if (getDebugTarget() && tick % 20 === 0) {
                        console.warn(`[MINING AI] Updated last known target for entity ${entity.id.substring(0, 8)}`);
                    }
                }
                const storedTarget = getStoredTargetInfo(entity);
                if (getDebugTarget() && tick % 20 === 0) {
                    console.warn(`[MINING AI] Context creation: entity=${entity.id.substring(0, 8)}, storedTarget=${!!storedTarget}`);
                }
                let targetInfo = liveTarget || storedTarget;
                        
                        // Final validation: Make sure target is not in creative/spectator mode
                        // (This catches cases where player switched modes after target was stored)
                        // CRITICAL: Check this BEFORE creating context to avoid processing spectator players
                        if (targetInfo && targetInfo.entity?.typeId === "minecraft:player") {
                            try {
                                const gameMode = targetInfo.entity.getGameMode();
                                if (gameMode === "creative" || gameMode === "spectator") {
                                    // Clear the target and stored target immediately
                                    const oldTargetId = lastKnownTargets.get(entity.id)?.targetId;
                                    if (oldTargetId) {
                                        unregisterBearFromTarget(entity.id, oldTargetId);
                                    }
                                    lastKnownTargets.delete(entity.id);
                                    targetCache.delete(entity.id);
                                    targetInfo = null;
                                    if (getDebugTarget() && tick % 20 === 0) {
                                        console.warn(`[MINING AI] Entity ${entity.id.substring(0, 8)}: Cleared target - player in creative/spectator mode`);
                                    }
                                    // Skip creating context for this entity - don't process spectator/creative players
                                    continue;
                                }
                            } catch { }
                        }
                
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
                        
                        // Separate registered bears (can mine) from unregistered bears (can only attack)
                        // Registered bears can mine, unregistered bears can still attack like normal hostile mobs
                        const registeredBears = bucket.filter(ctx => {
                            const bearId = ctx.entity.id;
                            return canBearTarget(bearId, targetId);
                        });
                        
                        const unregisteredBears = bucket.filter(ctx => {
                            const bearId = ctx.entity.id;
                            return !canBearTarget(bearId, targetId);
                        });
                        
                        // Process registered bears (can mine)
                        if (registeredBears.length > 0) {
                            // Sort by distance - closest becomes leader
                            registeredBears.sort((a, b) => (a.targetInfo?.distanceSq ?? Infinity) - (b.targetInfo?.distanceSq ?? Infinity));
                            const leaderCtx = registeredBears[0];
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

                            // Assign followers from registered bears only
                            for (let i = 1; i < registeredBears.length; i++) {
                                const followerCtx = registeredBears[i];
                                const distSq = distanceSq(followerCtx.entity.location, leaderCtx.entity.location);
                                if (distSq <= FOLLOWER_ASSIGN_RADIUS_SQ) {
                                    followerCtx.role = "follower";
                                    followerCtx.leaderId = summary.id;
                                    summary.followerCount += 1;
                                    leaderCtx.followers += 1;
                                    
                                    // Track leader-follower relationship for death handling
                                    if (!leaderFollowerMap.has(summary.id)) {
                                        leaderFollowerMap.set(summary.id, new Set());
                                    }
                                    leaderFollowerMap.get(summary.id).add(followerCtx.entity.id);
                                    followerLeaderMap.set(followerCtx.entity.id, summary.id);
                                }
                            }
                        }
                        
                        // Process unregistered bears (can see/attack but can't mine)
                        // Give them a role so they can attack, but they won't mine (handled in processContext)
                        for (const ctx of unregisteredBears) {
                            // Assign as "leader" role so they can attack, but isActivelyTargeting will be false
                            // This allows them to attack like normal hostile mobs
                            if (ctx.role === null) {
                                ctx.role = "leader";
                                ctx.leaderId = ctx.entity.id;
                                ctx.followers = 0;
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
                        
                        // If role is still null, assign default role based on whether they have a target
                        // Bears with targets should be leaders (they're targeting on their own)
                        // Bears without targets will be handled in idleQueue
                        if (ctx.role === null && ctx.targetInfo) {
                            ctx.role = "leader";
                            ctx.leaderId = ctx.entity.id;
                            ctx.followers = 0;
                            // Create a summary for this solo leader
                            const summary = {
                                id: ctx.entity.id,
                                targetId: ctx.targetInfo?.entity?.id ?? null,
                                position: { x: ctx.entity.location.x, y: ctx.entity.location.y, z: ctx.entity.location.z },
                                trail: getLeaderTrailRecord(ctx.entity.id),
                                followerCount: 0
                            };
                            leaderSummaryById.set(summary.id, summary);
                            activeLeaderIdsThisTick.add(summary.id);
                        }
                
                // Separate bears with targets (always process) from idle bears (process at interval)
                const hasTarget = !!ctx.targetInfo;
                if (hasTarget) {
                    // Bears with targets always process - add to appropriate queue
                    if (ctx.role === "leader") {
                        leaderQueue.push(ctx);
                    } else if (ctx.role === "follower") {
                        followerQueue.push(ctx);
                    } else {
                        // Has target but no role assigned - treat as leader
                        ctx.role = "leader";
                        ctx.leaderId = ctx.entity.id;
                        ctx.followers = 0;
                        leaderQueue.push(ctx);
                    }
                } else {
                    // Bears without targets only process at dynamic interval
                    if (shouldProcessIdleBears) {
                        idleQueue.push(ctx);
                    }
                    // Otherwise skip processing this tick
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
            
            // Clean up block cache periodically (every 10 ticks to prevent memory bloat)
            if (tick % 10 === 0) {
                // Remove stale cache entries (older than 2 ticks)
                for (const [key, cached] of blockCache.entries()) {
                    if (tick - cached.tick > 2) {
                        blockCache.delete(key);
                    }
                }
            }
            
            // Clean up progress tracking for entities that no longer exist
            for (const [entityId] of entityProgress.entries()) {
                if (!activeWorkerIds.has(entityId)) {
                    entityProgress.delete(entityId);
                }
            }
            
            // Clean up leader-follower maps for entities that no longer exist
            for (const [leaderId, followerSet] of leaderFollowerMap.entries()) {
                if (!activeLeaderIdsThisTick.has(leaderId) && !activeWorkerIds.has(leaderId)) {
                    // Leader no longer active, clean up followers
                    for (const followerId of followerSet) {
                        followerLeaderMap.delete(followerId);
                    }
                    leaderFollowerMap.delete(leaderId);
                } else {
                    // Clean up followers that no longer exist
                    for (const followerId of Array.from(followerSet)) {
                        if (!activeWorkerIds.has(followerId)) {
                            followerSet.delete(followerId);
                            followerLeaderMap.delete(followerId);
                        }
                    }
                }
            }
            
            // Clean up build queues for inactive entities
            for (const entityId of Array.from(buildQueues.keys())) {
                if (!activeWorkerIds.has(entityId)) {
                    releasePlan(entityId);
                }
            }
            
            // Clean up target memory for inactive entities
            for (const [entityId, entry] of lastKnownTargets.entries()) {
                if (!activeWorkerIds.has(entityId) && system.currentTick - entry.tick > TARGET_MEMORY_TICKS) {
                    lastKnownTargets.delete(entityId);
                    lastSeenTargetTick.delete(entityId);
                }
            }
            
            // Clean up last seen target tick for inactive entities
            for (const [entityId] of lastSeenTargetTick.entries()) {
                if (!activeWorkerIds.has(entityId)) {
                    lastSeenTargetTick.delete(entityId);
                }
            }
            
            // Clean up last mining tick for inactive entities
            for (const [entityId] of lastMiningTick.entries()) {
                if (!activeWorkerIds.has(entityId)) {
                    lastMiningTick.delete(entityId);
                }
            }
            
            // Clean up target coordination - remove dead bears from coordination map
            // This prevents the "Target is full" issue when bears are killed
            // Only do expensive target validation every 20 ticks (1 second) to avoid performance issues
            let activeTargetIds = null;
            if (tick % 20 === 0) {
                activeTargetIds = new Set();
                try {
                    // Get all players and mobs to check which targets are still alive
                    const allPlayers = getCachedPlayers();
                    for (const player of allPlayers) {
                        const playerIsValid = typeof player.isValid === "function" ? player.isValid() : Boolean(player.isValid);
                        if (playerIsValid) {
                            activeTargetIds.add(player.id);
                        }
                    }
                    const dimension = world.getDimension("overworld");
                    if (dimension) {
                        const mobs = getCachedMobs(dimension, { x: 0, y: 0, z: 0 }, 1000);
                        for (const mob of mobs) {
                            const mobIsValid = typeof mob.isValid === "function" ? mob.isValid() : Boolean(mob.isValid);
                            if (mobIsValid) {
                                activeTargetIds.add(mob.id);
                            }
                        }
                    }
                } catch { }
            }
            
            for (const [targetId, bearSet] of targetCoordination.entries()) {
                // Check each bear in the set to see if it's still alive
                for (const bearId of Array.from(bearSet)) {
                    if (!activeWorkerIds.has(bearId)) {
                        // Bear is dead - remove it from coordination
                        bearSet.delete(bearId);
                        if (getDebugTarget()) {
                            console.warn(`[MINING AI] Removed dead bear ${bearId.substring(0, 8)} from target ${targetId.substring(0, 8)} coordination`);
                        }
                    }
                }
                
                // Clean up if target is dead (only check every 20 ticks) or set is empty
                if (bearSet.size === 0) {
                    targetCoordination.delete(targetId);
                    if (getDebugTarget()) {
                        console.warn(`[MINING AI] Removed empty target coordination entry for ${targetId.substring(0, 8)}`);
                    }
                } else if (activeTargetIds && !activeTargetIds.has(targetId)) {
                    // Target is dead - clean it up (only check every 20 ticks to avoid performance issues)
                    targetCoordination.delete(targetId);
                    if (getDebugTarget()) {
                        console.warn(`[MINING AI] Removed dead target ${targetId.substring(0, 8)} from coordination`);
                    }
                }
            }
            
            // Clean up old log cache entries (older than 200 ticks = 10 seconds)
            if (tick % 100 === 0) {
                for (const [logKey, lastLogTick] of targetFullLogCache.entries()) {
                    if (tick - lastLogTick > 200) {
                        targetFullLogCache.delete(logKey);
                    }
                }
            }
            
            // Clean up build mode state for inactive entities
            for (const entityId of Array.from(buildModeState.keys())) {
                if (!activeWorkerIds.has(entityId)) {
                    buildModeState.delete(entityId);
                }
            }
            
            // Clean up collected blocks for inactive entities
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
            // End of per-tick processing block
        }
        } catch (error) {
            // Log errors to help debug
            console.error(`[MINING AI] ERROR in runInterval at tick ${system.currentTick}:`, error);
            console.error(`[MINING AI] Error stack:`, error.stack);
        }
    }, 1); // Run every tick - bears with targets always process, idle bears process at dynamic interval
    
    if (miningAIIntervalId !== null) {
        if (getDebugGeneral()) {
            console.warn(`[MINING AI] AI loop started successfully with interval ${AI_TICK_INTERVAL} ticks`);
        }
    } else {
        console.error("[MINING AI] ERROR: Failed to start AI loop interval");
    }
    
    // Cleanup interval for async pathfinding state management
    let lastCleanupTick = 0;
    system.runInterval(() => {
        const now = system.currentTick;
        
        // Only run cleanup every PATHFINDING_STATE_CLEANUP_INTERVAL ticks
        if (now - lastCleanupTick < PATHFINDING_STATE_CLEANUP_INTERVAL) return;
        lastCleanupTick = now;
        
        // Clean up stale pathfinding operations
        for (const [entityId, state] of pathfindingState.entries()) {
            const age = now - state.startTick;
            
            // Cancel pathfinding operations older than max age
            if (age > PATHFINDING_MAX_AGE_TICKS && state.status === 'in_progress') {
                if (getDebugPathfinding()) {
                    console.warn(`[MINING AI] Canceling stale pathfinding for entity ${entityId.substring(0, 8)} (age: ${age} ticks)`);
                }
                cancelPathfinding(entityId);
                continue;
            }
            
            // Remove completed/failed states older than cache timeout
            if ((state.status === 'completed' || state.status === 'failed') && age > PATHFINDING_CACHE_TICKS) {
                cleanupPathfindingState(entityId);
                continue;
            }
            
            // Check if entity still exists
            try {
                let entityExists = false;
                for (const dimId of DIMENSION_IDS) {
                    try {
                        const dimension = world.getDimension(dimId);
                        if (!dimension) continue;
                        
                        const entities = dimension.getEntities({ type: "mb:mining_mb" });
                        for (const e of entities) {
                            if (e.id === entityId) {
                                entityExists = true;
                                break;
                            }
                        }
                        if (entityExists) break;
                        
                        const entities2 = dimension.getEntities({ type: "mb:mining_mb_day20" });
                        for (const e of entities2) {
                            if (e.id === entityId) {
                                entityExists = true;
                                break;
                            }
                        }
                        if (entityExists) break;
                    } catch { }
                }
                
                if (!entityExists && state.status === 'in_progress') {
                    // Entity no longer exists, cancel pathfinding
                    if (getDebugPathfinding()) {
                        console.warn(`[MINING AI] Canceling pathfinding for non-existent entity ${entityId.substring(0, 8)}`);
                    }
                    cancelPathfinding(entityId);
                }
            } catch { }
        }
        
        // Process queued pathfinding operations (if under concurrent limit)
        if (pathfindingQueue.size > 0) {
            let activeCount = 0;
            for (const state of pathfindingState.values()) {
                if (state.status === 'in_progress') activeCount++;
            }
            
            const availableSlots = PATHFINDING_MAX_CONCURRENT - activeCount;
            if (availableSlots > 0) {
                // Process up to availableSlots queued operations
                const toProcess = Array.from(pathfindingQueue).slice(0, availableSlots);
                for (const entityId of toProcess) {
                    pathfindingQueue.delete(entityId);
                    // Note: The entity needs to call findPathToTargetAsync again to start pathfinding
                    // This cleanup just removes them from queue if they're still waiting
                }
            }
        }
    }, PATHFINDING_STATE_CLEANUP_INTERVAL);
}

/**
 * Handle leader death - promote nearest follower to leader
 * @param {string} deadLeaderId - ID of the dead leader entity
 */
function handleLeaderDeath(deadLeaderId) {
    try {
        const followers = leaderFollowerMap.get(deadLeaderId);
        if (!followers || followers.size === 0) {
            // No followers to promote
            leaderFollowerMap.delete(deadLeaderId);
            return;
        }
        
        // Find the nearest follower to promote
        let nearestFollowerId = null;
        let nearestDistanceSq = Infinity;
        let deadLeaderEntity = null;
        
        // Try to get the dead leader's position (if entity still exists briefly)
        try {
            deadLeaderEntity = world.getEntity(deadLeaderId);
        } catch { }
        
        const deadLeaderPos = deadLeaderEntity?.location || null;
        
        // Find nearest follower
        for (const followerId of followers) {
            try {
                const followerEntity = world.getEntity(followerId);
                if (followerEntity) {
                    const followerIsValid = typeof followerEntity.isValid === "function" ? followerEntity.isValid() : Boolean(followerEntity.isValid);
                    if (!followerIsValid) {
                        continue; // Follower no longer exists
                    }
                    
                    if (deadLeaderPos) {
                        const distSq = distanceSq(deadLeaderPos, followerEntity.location);
                        if (distSq < nearestDistanceSq) {
                            nearestDistanceSq = distSq;
                            nearestFollowerId = followerId;
                        }
                    } else {
                        // If we can't get leader position, just use first valid follower
                        nearestFollowerId = followerId;
                        break;
                    }
                } else {
                    continue; // Follower entity not found
                }
            } catch {
                continue; // Skip invalid followers
            }
        }
        
        if (!nearestFollowerId) {
            // No valid followers found, clean up
            for (const followerId of followers) {
                followerLeaderMap.delete(followerId);
            }
            leaderFollowerMap.delete(deadLeaderId);
            return;
        }
        
        // Promote the nearest follower
        const promotedFollowerId = nearestFollowerId;
        const remainingFollowers = new Set(followers);
        remainingFollowers.delete(promotedFollowerId);
        
        // Update maps: new leader gets all old followers
        leaderFollowerMap.delete(deadLeaderId);
        followerLeaderMap.delete(promotedFollowerId);
        
        if (remainingFollowers.size > 0) {
            leaderFollowerMap.set(promotedFollowerId, remainingFollowers);
            for (const followerId of remainingFollowers) {
                followerLeaderMap.set(followerId, promotedFollowerId);
            }
        }
        
        if (getDebugGeneral()) {
            console.warn(`[MINING AI] Leader ${deadLeaderId.substring(0, 8)} died. Promoted follower ${promotedFollowerId.substring(0, 8)} to leader. ${remainingFollowers.size} followers reassigned.`);
        }
    } catch (error) {
        console.error(`[MINING AI] Error handling leader death for ${deadLeaderId}:`, error);
    }
}

// Subscribe to entity death events to handle leader deaths
if (typeof world !== "undefined" && world.afterEvents) {
    world.afterEvents.entityDie.subscribe((event) => {
        try {
            const deadEntity = event.deadEntity;
            if (!deadEntity) return;
            
            const entityType = deadEntity.typeId;
            // Check if it's a mining bear
            if (entityType === "mb:mining_mb" || entityType === "mb:mining_mb_day20") {
                const deadEntityId = deadEntity.id;
                
                // Check if this was a leader
                if (leaderFollowerMap.has(deadEntityId)) {
                    handleLeaderDeath(deadEntityId);
                }
                
                // Also check if this was a follower (clean up the mapping)
                if (followerLeaderMap.has(deadEntityId)) {
                    const leaderId = followerLeaderMap.get(deadEntityId);
                    const followerSet = leaderFollowerMap.get(leaderId);
                    if (followerSet) {
                        followerSet.delete(deadEntityId);
                        if (followerSet.size === 0) {
                            leaderFollowerMap.delete(leaderId);
                        }
                    }
                    followerLeaderMap.delete(deadEntityId);
                }
            }
        } catch (error) {
            // Silently handle errors to prevent spam
            if (getDebugGeneral()) {
                console.error(`[MINING AI] Error in entity death handler:`, error);
            }
        }
    });
}

// Start initialization with a delay to ensure world is ready
console.warn("[MINING AI] Script loaded, starting delayed initialization...");
system.runTimeout(() => {
    initializeMiningAI();
}, INIT_DELAY_TICKS);
