import { system, world } from "@minecraft/server";
import { MINING_BREAKABLE_BLOCK_SET } from "./mb_miningBlockList.js";

const DIMENSION_IDS = ["overworld", "nether", "the_end"];
const TORPEDO_TYPES = [
    { id: "mb:torpedo_mb", cruiseMin: 30, cruiseMax: 70, diveRange: 26, forwardForce: 0.16, downwardForce: 0.11, breakDepth: 4, breakRadius: 1, breaksPerTick: 4 },
    { id: "mb:torpedo_mb_day20", cruiseMin: 35, cruiseMax: 80, diveRange: 30, forwardForce: 0.2, downwardForce: 0.13, breakDepth: 5, breakRadius: 2, breaksPerTick: 6 }
];
const DRIFT_FORCE = 0.03;
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

function getState(entity) {
    const id = entity.id;
    if (!STATE_MAP.has(id)) {
        STATE_MAP.set(id, { mode: "cruise", cooldown: 0 });
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

function adjustAltitude(entity, config) {
    const loc = entity.location;
    if (loc.y < config.cruiseMin) {
        try {
            entity.applyImpulse({ x: 0, y: 0.08, z: 0 });
        } catch { }
    } else if (loc.y > config.cruiseMax) {
        try {
            entity.applyImpulse({ x: 0, y: -0.08, z: 0 });
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

function carveDivePath(entity, direction, config) {
    const dimension = entity?.dimension;
    if (!dimension) return;
    const loc = entity.location;
    const norm = Math.hypot(direction.x, direction.z) || 1;
    const breakLimit = Math.max(1, config.breaksPerTick ?? 4);
    let broken = 0;
    for (let r = 0; r <= config.breakRadius; r++) {
        const offsetX = Math.floor(loc.x + (direction.x / norm) * r);
        const offsetZ = Math.floor(loc.z + (direction.z / norm) * r);
        for (let depth = 0; depth < config.breakDepth; depth++) {
            const targetY = Math.floor(loc.y) - depth;
            let block;
            try {
                block = dimension.getBlock({ x: offsetX, y: targetY, z: offsetZ });
            } catch {
                continue;
            }
            if (!block) continue;
            const typeId = block.typeId;
            if (!MINING_BREAKABLE_BLOCK_SET.has(typeId)) continue;
            try {
                block.setType("minecraft:air");
                playBreakSound(dimension, offsetX, targetY, offsetZ, typeId);
                broken++;
                if (broken >= breakLimit) {
                    return;
                }
            } catch { /* ignore */ }
        }
    }
}

function diveTowardsTarget(entity, targetInfo, config) {
    const dx = targetInfo.vector.x;
    const dz = targetInfo.vector.z;
    const horizMag = Math.hypot(dx, dz) || 1;
    const forwardX = (dx / horizMag) * config.forwardForce;
    const forwardZ = (dz / horizMag) * config.forwardForce;
    const downward = targetInfo.vector.y < 0 ? -config.downwardForce : config.downwardForce * -0.3;
    try {
        entity.applyImpulse({ x: forwardX, y: downward, z: forwardZ });
    } catch { }
    carveDivePath(entity, { x: dx, z: dz }, config);
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
                adjustAltitude(entity, config);
                const targetInfo = findTarget(entity, 64);

                if (targetInfo) {
                    const horizDist = Math.hypot(targetInfo.vector.x, targetInfo.vector.z);
                    if (horizDist < config.diveRange && state.cooldown === 0) {
                        diveTowardsTarget(entity, targetInfo, config);
                        state.mode = "dive";
                        state.cooldown = 6;
                    } else {
                        try {
                            entity.applyImpulse({
                                x: (targetInfo.vector.x / (horizDist || 1)) * DRIFT_FORCE,
                                y: 0,
                                z: (targetInfo.vector.z / (horizDist || 1)) * DRIFT_FORCE
                            });
                        } catch { }
                        state.mode = "cruise";
                    }
                } else {
                    applyCruiseDrift(entity);
                    state.mode = "cruise";
                }
            }
        }
    }
    cleanupStates(seen);
}, 5);

