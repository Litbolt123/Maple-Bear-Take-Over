/**
 * Infected Maple Bear AI - nox7-style pathfinding with smart gap jumping
 * Uses the same pathfinding system as mining bears for intelligent movement.
 * Infected bears (and optionally infected pig/cow) use A* pathfinding to reach
 * players and apply jump impulse when crossing 1-block gaps.
 * Optimized for many entities: per-tick cap, longer interval, skip pathfinding when far.
 */

import { system, world } from "@minecraft/server";
import { getPathfindingPath, getPathfindingWaypoint, steerAlongPath } from "./mb_miningAI.js";
import { getCachedPlayers } from "./mb_sharedCache.js";
import { isDebugEnabled } from "./mb_codex.js";
import { isScriptEnabled, SCRIPT_IDS, isBetaInfectedAIEnabled } from "./mb_scriptToggles.js";

const INFECTED_TYPES = [
    "mb:infected",
    "mb:infected_day08",
    "mb:infected_day13",
    "mb:infected_day20",
    "mb:infected_pig",
    "mb:infected_cow"
];

const TUNNEL_HEIGHT = 2; // 2-block-tall entities
const TARGET_RADIUS = 32;
const AI_INTERVAL_TICKS = 6; // Run every 6 ticks (lighter - many infected MBs)
const INIT_DELAY_TICKS = 40;
const MAX_INFECTED_PER_TICK = 28; // Cap entities processed per run (spreads load)
const PATHFINDING_DISTANCE_SQ = 16 * 16; // Only use pathfinding when within 16 blocks (cheaper)

function getDebugInfected(flag) {
    return isDebugEnabled("infected", flag) || isDebugEnabled("infected", "all");
}

// Gap jump: when approaching 1-block gap, apply upward impulse
const GAP_JUMP_UPWARD = 0.06;
const GAP_JUMP_FORWARD = 0.08;
const GAP_DETECT_DISTANCE = 1.2;

// Fallback direct movement when no path
const FALLBACK_IMPULSE = 0.04;

// Anger spread: when hit by a player or when another bear hits a player
const angerTargetMap = new Map(); // entityId -> { entity: Player, expireTick: number }
const ANGER_DURATION_TICKS = 600; // 30 seconds
const ANGER_SPREAD_RADIUS = 24;
const ANGER_CLEANUP_INTERVAL_TICKS = 60; // Run cleanup every 60 ticks (~3s) to limit cost

let infectedAIIntervalId = null;
let lastAngerCleanupTick = -ANGER_CLEANUP_INTERVAL_TICKS;

function getTargetPlayer(entity) {
    const loc = entity.location;
    const dimension = entity?.dimension;
    if (!dimension) return null;

    const entityId = entity.id;
    const currentTick = system.currentTick;
    const maxDistSq = TARGET_RADIUS * TARGET_RADIUS;

    // Anger: prefer player who hit this entity or who was hit by another bear
    const anger = angerTargetMap.get(entityId);
    if (anger && anger.expireTick > currentTick && anger.entity) {
        try {
            const p = anger.entity;
            if (p.dimension?.id === dimension.id) {
                const gameMode = p.getGameMode?.();
                if (gameMode !== "creative" && gameMode !== "spectator") {
                    const dx = p.location.x - loc.x;
                    const dz = p.location.z - loc.z;
                    const dy = p.location.y - loc.y;
                    const distSq = dx * dx + dz * dz;
                    if (distSq < maxDistSq && distSq > 0.01) {
                        return { entity: p, distSq, dx, dz, dy };
                    }
                }
            }
        } catch { }
        angerTargetMap.delete(entityId);
    }

    const players = getCachedPlayers();
    let nearest = null;
    let nearestDistSq = maxDistSq;

    for (const player of players) {
        if (!player?.location || player.dimension?.id !== dimension.id) continue;
        try {
            const gameMode = player.getGameMode?.();
            if (gameMode === "creative" || gameMode === "spectator") continue;
        } catch { }
        const dx = player.location.x - loc.x;
        const dz = player.location.z - loc.z;
        const dy = player.location.y - loc.y;
        const distSq = dx * dx + dz * dz;
        if (distSq < nearestDistSq && distSq > 0.01) {
            nearestDistSq = distSq;
            nearest = { entity: player, distSq, dx, dz, dy };
        }
    }
    return nearest;
}

function findNearestPlayer(entity) {
    return getTargetPlayer(entity);
}

/**
 * Check if there's a 1-block gap ahead (air in front at feet, solid on other side).
 * If so, apply jump impulse to cross it.
 */
function tryGapJump(entity, targetInfo, dimension) {
    if (!targetInfo?.entity?.location || !dimension) return false;

    const loc = entity.location;
    const targetLoc = targetInfo.entity.location;
    const dx = targetLoc.x - loc.x;
    const dz = targetLoc.z - loc.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5 || dist > GAP_DETECT_DISTANCE) return false;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const baseX = Math.floor(loc.x);
    const baseY = Math.floor(loc.y);
    const baseZ = Math.floor(loc.z);

    // Check block 1 forward at feet level - is it air? (the gap)
    const frontX = baseX + Math.round(dirX);
    const frontZ = baseZ + Math.round(dirZ);
    const frontBlock = dimension.getBlock({ x: frontX, y: baseY, z: frontZ });
    if (!frontBlock || !frontBlock.isAir) return false; // Not a gap

    // Check block 2 forward at feet - solid? (landing spot on other side of 1-block gap)
    const landX = baseX + 2 * Math.round(dirX);
    const landZ = baseZ + 2 * Math.round(dirZ);
    const landingBlock = dimension.getBlock({ x: landX, y: baseY, z: landZ });
    if (!landingBlock || landingBlock.isAir || landingBlock.isLiquid) return false;

    // Check we're on ground
    const feetBlock = dimension.getBlock({ x: baseX, y: baseY - 1, z: baseZ });
    if (!feetBlock || feetBlock.isAir || feetBlock.isLiquid) return false;

    // Gap detected - apply jump impulse
    if (getDebugInfected("gapJump")) {
        console.warn(`[INFECTED AI] Gap jump for ${entity.typeId?.substring(0, 15) || "entity"} at (${baseX},${baseY},${baseZ})`);
    }
    try {
        entity.applyImpulse({
            x: dirX * GAP_JUMP_FORWARD,
            y: GAP_JUMP_UPWARD,
            z: dirZ * GAP_JUMP_FORWARD
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Fallback: direct impulse toward target when no pathfinding path available
 */
function applyFallbackImpulse(entity, targetInfo) {
    if (!targetInfo?.entity?.location) return false;

    const loc = entity.location;
    const targetLoc = targetInfo.entity.location;
    const dx = targetLoc.x - loc.x;
    const dz = targetLoc.z - loc.z;
    const dy = targetLoc.y - loc.y;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return false;

    const dimension = entity?.dimension;
    if (dimension) {
        const feetBlock = dimension.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y) - 1, z: Math.floor(loc.z) });
        if (!feetBlock || feetBlock.isAir || feetBlock.isLiquid) return false;
    }

    const dirX = dx / dist;
    const dirZ = dz / dist;
    let verticalImpulse = 0;
    if (dy > 0.5 && dy <= 2) {
        verticalImpulse = Math.min(dy * 0.02, 0.03); // Small upward for steps
    }

    try {
        entity.applyImpulse({
            x: dirX * FALLBACK_IMPULSE,
            y: verticalImpulse,
            z: dirZ * FALLBACK_IMPULSE
        });
        return true;
    } catch {
        return false;
    }
}

function processInfectedEntity(entity, targetInfo, tick) {
    try {
        const dimension = entity?.dimension;
        if (!dimension) return;

        // Try gap jump first when approaching target (smart jumping over 1-block gaps)
        if (tryGapJump(entity, targetInfo, dimension)) return;

        const distSq = targetInfo?.distSq ?? Infinity;

        // Only use pathfinding when within 16 blocks - cheaper for distant entities (many infected MBs)
        const usePathfinding = distSq <= PATHFINDING_DISTANCE_SQ;

        if (usePathfinding) {
            const config = { tunnelHeight: TUNNEL_HEIGHT };
            const path = getPathfindingPath(entity, targetInfo, TUNNEL_HEIGHT);

            if (path && path.length >= 2) {
                const moved = steerAlongPath(entity, path, targetInfo, config);
                if (getDebugInfected("pathfinding") && tick % 40 === 0) {
                    console.warn(`[INFECTED AI] steerAlongPath pathLen=${path.length} moved=${moved}`);
                }
                if (moved) return;
            }

            // Trigger pathfinding if not running; getPathfindingWaypoint starts it and returns waypoint when cached
            const waypoint = getPathfindingWaypoint(entity, targetInfo, TUNNEL_HEIGHT);

            // Use waypoint-based movement when pathfinding has a cached path (same as mining AI)
            if (waypoint) {
            const loc = entity.location;
            const waypointLoc = { x: waypoint.x + 0.5, y: waypoint.y, z: waypoint.z + 0.5 };
            const waypointDx = waypointLoc.x - loc.x;
            const waypointDz = waypointLoc.z - loc.z;
            const waypointDist = Math.hypot(waypointDx, waypointDz);

            if (waypointDist > 0.5 && waypointDist < 50) {
                try {
                    const impulse = FALLBACK_IMPULSE;
                    const dirX = waypointDx / waypointDist;
                    const dirZ = waypointDz / waypointDist;
                    let verticalImpulse = 0;
                    const dy = waypointLoc.y - loc.y;
                    if (dy > 0.5 && dy <= 2) {
                        verticalImpulse = Math.min(dy * 0.02, 0.03);
                    }
                    entity.applyImpulse({
                        x: dirX * impulse,
                        y: verticalImpulse,
                        z: dirZ * impulse
                    });
                } catch { }
            }
        } else {
            // Fallback: direct impulse toward target when no pathfinding waypoint
            applyFallbackImpulse(entity, targetInfo);
        }
        } else {
            // Far from target - skip pathfinding, use fallback only (lighter)
            applyFallbackImpulse(entity, targetInfo);
        }
    } catch (error) {
        // Silently ignore - infected AI is supplementary
    }
}

/**
 * Remove stale entries from angerTargetMap: expired or whose stored player is no longer valid/alive.
 * Runs every ANGER_CLEANUP_INTERVAL_TICKS to limit cost.
 */
function pruneAngerTargetMap(currentTick) {
    for (const [entityId, anger] of angerTargetMap.entries()) {
        let shouldDelete = anger.expireTick <= currentTick;
        if (!shouldDelete && anger.entity) {
            try {
                const valid = typeof anger.entity.isValid === "function"
                    ? anger.entity.isValid() : Boolean(anger.entity.isValid);
                const alive = typeof anger.entity.isAlive === "function"
                    ? anger.entity.isAlive() : (anger.entity.isAlive !== false);
                if (!valid || !alive) shouldDelete = true;
            } catch {
                shouldDelete = true; // Reference invalid or throws on access
            }
        }
        if (shouldDelete) angerTargetMap.delete(entityId);
    }
}

function runInfectedAI() {
    if (!isScriptEnabled(SCRIPT_IDS.infected) || !isBetaInfectedAIEnabled()) return;
    try {
        const tick = system.currentTick;
        if (tick - lastAngerCleanupTick >= ANGER_CLEANUP_INTERVAL_TICKS) {
            pruneAngerTargetMap(tick);
            lastAngerCleanupTick = tick;
        }
        const players = getCachedPlayers();
        const processedIds = new Set();
        let processedCount = 0;

        for (const player of players) {
            if (!player?.location || !player?.dimension || processedCount >= MAX_INFECTED_PER_TICK) break;
            const dimension = player.dimension;            const center = player.location;

            for (const typeId of INFECTED_TYPES) {
                if (processedCount >= MAX_INFECTED_PER_TICK) break;
                try {
                    const entities = dimension.getEntities({
                        location: center,
                        maxDistance: TARGET_RADIUS,
                        type: typeId
                    });

                    for (const entity of entities) {
                        if (processedCount >= MAX_INFECTED_PER_TICK) break;
                        if (!entity?.isValid || processedIds.has(entity.id)) continue;
                        const targetInfo = findNearestPlayer(entity);
                        if (!targetInfo) continue;

                        processedIds.add(entity.id);
                        processInfectedEntity(entity, targetInfo, tick);
                        processedCount++;
                    }
                } catch {
                    // Skip this type/dimension
                }
            }
        }
        if (getDebugInfected("general") && processedCount > 0 && tick % 60 === 0) {
            console.warn(`[INFECTED AI] Processed ${processedCount} entities this tick`);
        }
    } catch (error) {
        // Silently ignore
    }
}

function initializeInfectedAI() {
    if (infectedAIIntervalId != null) return;

    infectedAIIntervalId = system.runInterval(() => {
        runInfectedAI();
    }, AI_INTERVAL_TICKS);

    console.warn("[INFECTED AI] Script loaded - nox7-style pathfinding with gap jumping");
}

/** Set an infected entity to target a specific player (e.g. after being hit by that player). */
export function setInfectedAngerTarget(infectedEntity, player) {
    if (!infectedEntity?.id || !player) return;
    const currentTick = system.currentTick;
    angerTargetMap.set(infectedEntity.id, { entity: player, expireTick: currentTick + ANGER_DURATION_TICKS });
}

/** Make nearby infected entities target this player (e.g. when another bear hit the player — anger spread). */
export function angerNearbyInfectedAtPlayer(dimension, location, targetPlayer, radius = ANGER_SPREAD_RADIUS) {
    if (!dimension || !location || !targetPlayer) return;
    const currentTick = system.currentTick;
    const expireTick = currentTick + ANGER_DURATION_TICKS;
    for (const typeId of INFECTED_TYPES) {
        let entities;
        try {
            entities = dimension.getEntities({ type: typeId, location, maxDistance: radius });
        } catch {
            continue;
        }
        for (const entity of entities) {
            if (entity?.id) {
                angerTargetMap.set(entity.id, { entity: targetPlayer, expireTick });
            }
        }
    }
}

// Start after a delay (ensure world is ready)
system.runTimeout(() => {
    initializeInfectedAI();
}, INIT_DELAY_TICKS);
