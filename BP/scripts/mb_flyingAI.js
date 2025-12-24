import { system, world } from "@minecraft/server";
import { getCachedPlayers, getCachedPlayerPositions, getCachedMobs } from "./mb_sharedCache.js";
import { isDebugEnabled } from "./mb_codex.js";

// Debug helper functions
function getDebugGeneral() {
    return isDebugEnabled("flying", "general") || isDebugEnabled("flying", "all");
}

function getDebugTargeting() {
    return isDebugEnabled("flying", "targeting") || isDebugEnabled("flying", "all");
}

function getDebugPathfinding() {
    return isDebugEnabled("flying", "pathfinding") || isDebugEnabled("flying", "all");
}

const DIMENSION_IDS = ["overworld", "nether", "the_end"];
const FLYING_TYPES = [
    {
        id: "mb:flying_mb",
        lowProfile: { minAltitude: 3, maxAltitude: 8, horizontalImpulse: 0.065, verticalImpulse: 0.045 },
        highProfile: { minAltitude: 12, maxAltitude: 24, horizontalImpulse: 0.055, verticalImpulse: 0.04 }
    },
    {
        id: "mb:flying_mb_day15",
        lowProfile: { minAltitude: 4, maxAltitude: 10, horizontalImpulse: 0.07, verticalImpulse: 0.05 },
        highProfile: { minAltitude: 14, maxAltitude: 26, horizontalImpulse: 0.06, verticalImpulse: 0.045 }
    },
    {
        id: "mb:flying_mb_day20",
        lowProfile: { minAltitude: 5, maxAltitude: 12, horizontalImpulse: 0.075, verticalImpulse: 0.055 },
        highProfile: { minAltitude: 16, maxAltitude: 28, horizontalImpulse: 0.065, verticalImpulse: 0.05 }
    }
];

const MAX_TARGET_DISTANCE = 40;
const ALTITUDE_PROBE_DEPTH = 16;
const DRIFT_INTERVAL = 40;
const HIGH_PROFILE_RATIO = 0.3;
const CEILING_CHECK_STEPS = 3;
const CEILING_PUSH_FORCE = 0.12;
const HORIZONTAL_BUMP_FORCE = 0.04;
const PASSIVE_WANDER_TICKS = 2400; // 2 minutes without seeing target = passive wandering

// Performance: Distance-based culling constants
const MAX_PROCESSING_DISTANCE = 64; // Only process entities within 64 blocks of any player
const MAX_PROCESSING_DISTANCE_SQ = MAX_PROCESSING_DISTANCE * MAX_PROCESSING_DISTANCE;

// Performance: AI tick interval (reduced frequency for performance)
const AI_TICK_INTERVAL = 2; // Run AI every 2 ticks instead of every tick (50% reduction)

const AIR_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air"
]);

const flightRoleMap = new Map();
const lastSeenTargetTick = new Map(); // Track when target was last seen (for passive wandering)

function findTarget(entity, maxDistance = MAX_TARGET_DISTANCE) {
    const dimension = entity?.dimension;
    if (!dimension) return null;
    
    // Performance: Check cache first
    const entityId = entity.id;
    const currentTick = system.currentTick;
    const cached = targetCache.get(entityId);
    if (cached && cached.tick === currentTick) {
        return cached.target;
    }
    
    const origin = entity.location;
    const maxDistSq = maxDistance * maxDistance;
    let best = null;
    let bestDistSq = maxDistSq;

    // Use shared cache instead of querying all players
    const allPlayers = getCachedPlayers();
    const dimensionId = dimension?.id;
    if (!dimensionId) return null;
    for (const player of allPlayers) {
        if (!player.dimension?.id || player.dimension.id !== dimensionId) continue;
        // Skip creative and spectator mode players (they can't be attacked)
        try {
            const gameMode = player.getGameMode();
            if (gameMode === "creative" || gameMode === "spectator") continue;
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

    // Use shared cache instead of per-entity query
    const mobs = getCachedMobs(dimension, origin, maxDistance);
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

    let target = null;
    if (best) {
        target = {
            entity: best,
            vector: {
                x: best.location.x - origin.x,
                y: best.location.y - origin.y,
                z: best.location.z - origin.z
            }
        };
    }
    
    // Cache the result for this tick
    targetCache.set(entityId, { target, tick: currentTick });
    return target;
}

function probeGroundHeight(entity) {
    const dimension = entity?.dimension;
    if (!dimension) return entity.location.y - ALTITUDE_PROBE_DEPTH;
    const loc = entity.location;
    const x = Math.floor(loc.x);
    const z = Math.floor(loc.z);
    const startY = Math.floor(loc.y);
    for (let i = 0; i < ALTITUDE_PROBE_DEPTH; i++) {
        const y = startY - i;
        try {
            const block = dimension.getBlock({ x, y, z });
            if (block && block.typeId && block.typeId !== "minecraft:air") {
                return y + 1;
            }
        } catch {
            break;
        }
    }
    return loc.y - ALTITUDE_PROBE_DEPTH;
}

function adjustAltitude(entity, config, groundY) {
    const loc = entity.location;
    const altitude = loc.y - groundY;
    if (altitude > config.maxAltitude) {
        entity.applyImpulse({ x: 0, y: -0.05, z: 0 });
    } else if (altitude < config.minAltitude) {
        entity.applyImpulse({ x: 0, y: 0.05, z: 0 });
    }
}

function steerTowards(entity, targetInfo, config) {
    const vector = targetInfo.vector;
    const horizMag = Math.hypot(vector.x, vector.z);
    if (horizMag > 0.01) {
        const impulse = config.horizontalImpulse;
        entity.applyImpulse({
            x: (vector.x / horizMag) * impulse,
            y: 0,
            z: (vector.z / horizMag) * impulse
        });
    }
    const verticalImpulse = Math.max(-config.verticalImpulse, Math.min(config.verticalImpulse, vector.y * 0.05));
    entity.applyImpulse({ x: 0, y: verticalImpulse, z: 0 });
}

function applyDrift(entity, tickCount, config) {
    if (tickCount % DRIFT_INTERVAL !== 0) return;
    const angle = Math.random() * Math.PI * 2;
    const impulse = config.horizontalImpulse * 0.5;
    entity.applyImpulse({
        x: Math.cos(angle) * impulse,
        y: 0,
        z: Math.sin(angle) * impulse
    });
}

function getFlightProfile(entity, config) {
    const id = entity?.id;
    if (!id) return config.lowProfile;
    let role = flightRoleMap.get(id);
    if (!role) {
        role = Math.random() < HIGH_PROFILE_RATIO ? "high" : "low";
        flightRoleMap.set(id, role);
    }
    return role === "high" ? config.highProfile : config.lowProfile;
}

function cleanupFlightRoles(seenIds) {
    if (seenIds.size === flightRoleMap.size) return;
    for (const key of flightRoleMap.keys()) {
        if (!seenIds.has(key)) {
            flightRoleMap.delete(key);
        }
    }
}

function isAir(block) {
    return !block || AIR_BLOCKS.has(block.typeId);
}

function resolveCeilingCollision(entity) {
    const dimension = entity?.dimension;
    if (!dimension) return;
    const loc = entity.location;
    const x = Math.floor(loc.x);
    const y = Math.floor(loc.y);
    const z = Math.floor(loc.z);
    let ceilingFound = false;

    for (let i = 1; i <= CEILING_CHECK_STEPS; i++) {
        let block;
        try {
            block = dimension.getBlock({ x, y: y + i, z });
        } catch {
            continue;
        }
        if (!isAir(block)) {
            ceilingFound = true;
            break;
        }
    }

    if (ceilingFound) {
        try {
            const vel = entity.getVelocity?.();
            entity.applyImpulse({
                x: (Math.random() - 0.5) * HORIZONTAL_BUMP_FORCE,
                y: -CEILING_PUSH_FORCE - (vel?.y ?? 0),
                z: (Math.random() - 0.5) * HORIZONTAL_BUMP_FORCE
            });
        } catch {
            // Ignore impulse failures
        }
    }
}

// Performance: Cache target lookups to avoid querying all players/mobs every tick
const targetCache = new Map(); // Map<entityId, {target: targetInfo, tick: number}>

// Track AI loop start tick for debug logging
let aiLoopStartTick = system.currentTick;

system.runInterval(() => {
    const tick = system.currentTick;
    const ticksSinceStart = tick - aiLoopStartTick;
    const seenIds = new Set();
    
    // Note: system.runInterval already handles the interval, so we don't need to check tick % AI_TICK_INTERVAL
    // The interval callback is only called every AI_TICK_INTERVAL ticks automatically
    
    // Always log when debug is enabled (frequently to confirm it's working)
    if (getDebugGeneral()) {
        // Log very frequently in first 20 ticks, then every 50 ticks (only when debug enabled)
        if (getDebugGeneral() && (ticksSinceStart <= 20 || ticksSinceStart % 50 === 0)) {
            console.warn(`[FLYING AI] AI loop running at tick ${tick} (${ticksSinceStart} ticks since start) - DEBUG ENABLED`);
        }
    }
    
    // Performance: Use shared player cache
    const allPlayers = getCachedPlayers();
    const playerPositions = getCachedPlayerPositions();
    
    // Log player count for troubleshooting (only when debug enabled)
    if (getDebugGeneral() && (ticksSinceStart <= 20 || tick % 50 === 0)) {
        console.warn(`[FLYING AI] Player detection: found ${allPlayers.length} player(s)`);
        if (allPlayers.length > 0) {
            for (const player of allPlayers) {
                try {
                    const dimId = player.dimension?.id || 'unknown';
                    let isValid = 'unknown';
                    try {
                        const gameMode = player.getGameMode();
                        if (gameMode === "creative" || gameMode === "spectator") {
                            isValid = 'invalid (creative/spectator)';
                        } else if (player.dimension) {
                            isValid = 'valid';
                        } else {
                            isValid = 'invalid (no dimension)';
                        }
                    } catch {
                        isValid = player.dimension ? 'valid' : 'invalid (no dimension)';
                    }
                    console.warn(`[FLYING AI]   Player: ${player.name}, dimension: ${dimId}, valid: ${isValid}`);
                } catch (err) {
                    console.warn(`[FLYING AI]   Player: ${player.name}, error getting info:`, err);
                }
            }
        }
    }
    
    // Build player positions map from cached data (if needed for compatibility)
    // Note: getCachedPlayerPositions() already returns Map<dimensionId, positions[]>
    // But we may need to iterate for other purposes, so keep the loop structure
    for (const player of allPlayers) {
        try {
            const dimId = player.dimension.id;
            if (!playerPositions.has(dimId)) {
                playerPositions.set(dimId, []);
            }
            playerPositions.get(dimId).push(player.location);
        } catch {
            // Skip invalid players
        }
    }

    for (const dimId of DIMENSION_IDS) {
        let dimension;
        try {
            dimension = world.getDimension(dimId);
        } catch {
            continue;
        }
        if (!dimension) continue;

        // Performance: Distance-based culling - only process entities near players
        const dimPlayerPositions = playerPositions.get(dimId) || [];
        if (dimPlayerPositions.length === 0) continue; // No players in this dimension, skip

        for (const config of FLYING_TYPES) {
            let entities;
            try {
                entities = dimension.getEntities({ type: config.id });
            } catch {
                continue;
            }
            if (!entities || entities.length === 0) continue;
            
            // Debug logging for entity count
            if (getDebugGeneral() && (ticksSinceStart <= 20 || tick % 50 === 0)) {
                console.warn(`[FLYING AI] Found ${entities.length} ${config.id} entities in ${dimId}`);
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
            
            if (validEntities.length === 0) continue;

            for (const entity of validEntities) {
                seenIds.add(entity.id);
                const profile = getFlightProfile(entity, config);
                const groundY = probeGroundHeight(entity);
                
                // Debug pathfinding info
                if (getDebugPathfinding() && (ticksSinceStart <= 20 || tick % 100 === 0)) {
                    const loc = entity.location;
                    const altitude = loc.y - groundY;
                    console.warn(`[FLYING AI] Entity ${entity.id.substring(0, 8)}: Y=${loc.y.toFixed(1)}, groundY=${groundY.toFixed(1)}, altitude=${altitude.toFixed(1)}, profile=${profile === config.highProfile ? 'high' : 'low'}`);
                }
                
                adjustAltitude(entity, profile, groundY);
                resolveCeilingCollision(entity);
                const targetInfo = findTarget(entity);
                
                // Debug targeting info
                if (getDebugTargeting() && targetInfo) {
                    const dist = Math.hypot(targetInfo.vector.x, targetInfo.vector.y, targetInfo.vector.z);
                    const targetType = targetInfo.entity?.typeId || 'unknown';
                    console.warn(`[FLYING AI] Entity ${entity.id.substring(0, 8)}: Targeting ${targetType} at distance ${dist.toFixed(1)}`);
                }
                
                // Track last seen target tick
                if (targetInfo) {
                    lastSeenTargetTick.set(entity.id, tick);
                    steerTowards(entity, targetInfo, profile);
                } else {
                    // Check if should enter passive wandering (2 minutes without seeing target)
                    const lastSeen = lastSeenTargetTick.get(entity.id) || 0;
                    const timeSinceSeen = tick - lastSeen;
                    if (timeSinceSeen > PASSIVE_WANDER_TICKS) {
                        // Force passive wandering - clear tracking
                        lastSeenTargetTick.delete(entity.id);
                        if (getDebugGeneral() && (ticksSinceStart <= 20 || tick % 200 === 0)) {
                            console.warn(`[FLYING AI] Entity ${entity.id.substring(0, 8)}: Entering passive wandering (no target for ${timeSinceSeen} ticks)`);
                        }
                    }
                    applyDrift(entity, tick, profile);
                }
            }
        }
    }

    if (seenIds.size > 0) {
        cleanupFlightRoles(seenIds);
        // Clean up tracking for removed entities
        for (const [entityId] of lastSeenTargetTick.entries()) {
            if (!seenIds.has(entityId)) {
                lastSeenTargetTick.delete(entityId);
            }
        }
    }
    
    // Clean up target cache for entities that no longer exist
    for (const [entityId, cached] of targetCache.entries()) {
        try {
            // Check if entity still exists (this is expensive, so only do it occasionally)
            if (tick % 100 === 0) {
                // Every 5 seconds, clean up stale cache entries
                const entity = world.getEntity(entityId);
                if (!entity || !entity.isValid()) {
                    targetCache.delete(entityId);
                }
            }
        } catch {
            targetCache.delete(entityId);
        }
    }
}, AI_TICK_INTERVAL); // Run every AI_TICK_INTERVAL ticks (reduced frequency for performance)

