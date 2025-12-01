import { system, world } from "@minecraft/server";

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
    const origin = entity.location;
    const maxDistSq = maxDistance * maxDistance;
    let best = null;
    let bestDistSq = maxDistSq;

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
        vector: {
            x: best.location.x - origin.x,
            y: best.location.y - origin.y,
            z: best.location.z - origin.z
        }
    };
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

system.runInterval(() => {
    const tick = system.currentTick;
    const seenIds = new Set();
    
    // Performance: Get all players once and cache their positions for distance culling
    const playerPositions = new Map(); // Map<dimensionId, positions[]>
    for (const player of world.getPlayers()) {
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
                adjustAltitude(entity, profile, groundY);
                resolveCeilingCollision(entity);
                const targetInfo = findTarget(entity);
                
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
}, 6);

