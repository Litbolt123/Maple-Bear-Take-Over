import { system, world } from "@minecraft/server";
import { getCurrentDay, isMilestoneDay } from "./mb_dayTracker.js";

const TINY_BEAR_ID = "mb:mb";
const DAY4_BEAR_ID = "mb:mb_day4";
const DAY8_BEAR_ID = "mb:mb_day8";
const DAY13_BEAR_ID = "mb:mb_day13";
const DAY20_BEAR_ID = "mb:mb_day20";
const INFECTED_BEAR_ID = "mb:infected";
const INFECTED_BEAR_DAY8_ID = "mb:infected_day8";
const INFECTED_BEAR_DAY13_ID = "mb:infected_day13";
const INFECTED_BEAR_DAY20_ID = "mb:infected_day20";
const BUFF_BEAR_ID = "mb:buff_mb";
const BUFF_BEAR_DAY13_ID = "mb:buff_mb_day13";
const BUFF_BEAR_DAY20_ID = "mb:buff_mb_day20";

const TARGET_BLOCK = "mb:dusted_dirt";

const SPAWN_ATTEMPTS = 12;
const MIN_SPAWN_DISTANCE = 15;
const MAX_SPAWN_DISTANCE = 48;
const BASE_MIN_TILE_SPACING = 4; // blocks between spawn tiles
const SCAN_INTERVAL = 100; // ticks (~5 seconds)

const SUNRISE_BOOST_DURATION = 200; // ticks
const SUNRISE_BOOST_MULTIPLIER = 1.25;

const MAX_CANDIDATES_PER_SCAN = 220;
const MAX_SPACED_TILES = 90;
const CACHE_MOVE_THRESHOLD = 6; // blocks
const CACHE_MOVE_THRESHOLD_SQ = CACHE_MOVE_THRESHOLD * CACHE_MOVE_THRESHOLD;
const CACHE_TICK_TTL = SCAN_INTERVAL * 3;

const SPAWN_CONFIGS = [
    {
        id: TINY_BEAR_ID,
        startDay: 2,
        endDay: Infinity,
        baseChance: 0.12,
        chancePerDay: 0.015,
        maxChance: 0.6,
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 2,
        maxCountCap: 8,
        delayTicks: 200,
        spreadRadius: 20
    },
    {
        id: DAY4_BEAR_ID,
        startDay: 4,
        endDay: 7,
        baseChance: 0.3,
        chancePerDay: 0.02,
        maxChance: 0.5,
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 2,
        maxCountCap: 7,
        delayTicks: 260,
        spreadRadius: 22
    },
    {
        id: INFECTED_BEAR_ID,
        startDay: 4,
        endDay: 7,
        baseChance: 0.12,
        chancePerDay: 0.015,
        maxChance: 0.32,
        baseMaxCount: 2,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 5,
        delayTicks: 320,
        spreadRadius: 24
    },
    {
        id: DAY8_BEAR_ID,
        startDay: 8,
        endDay: 12,
        baseChance: 0.34,
        chancePerDay: 0.02,
        maxChance: 0.56,
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 7,
        delayTicks: 320,
        spreadRadius: 25
    },
    {
        id: INFECTED_BEAR_DAY8_ID,
        startDay: 8,
        endDay: 12,
        baseChance: 0.16,
        chancePerDay: 0.015,
        maxChance: 0.4,
        baseMaxCount: 3,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 6,
        delayTicks: 340,
        spreadRadius: 26
    },
    {
        id: DAY13_BEAR_ID,
        startDay: 13,
        endDay: 19,
        baseChance: 0.38,
        chancePerDay: 0.025,
        maxChance: 0.62,
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 7,
        delayTicks: 360,
        spreadRadius: 27
    },
    {
        id: INFECTED_BEAR_DAY13_ID,
        startDay: 13,
        endDay: 19,
        baseChance: 0.2,
        chancePerDay: 0.015,
        maxChance: 0.46,
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 7,
        delayTicks: 380,
        spreadRadius: 28
    },
    {
        id: BUFF_BEAR_ID,
        startDay: 8,
        endDay: 12,
        baseChance: 0.04,
        chancePerDay: 0.003,
        maxChance: 0.075,
        baseMaxCount: 1,
        maxCountCap: 1,
        delayTicks: 900,
        spreadRadius: 30
    },
    {
        id: BUFF_BEAR_DAY13_ID,
        startDay: 13,
        endDay: 19,
        baseChance: 0.035,
        chancePerDay: 0.0025,
        maxChance: 0.09,
        baseMaxCount: 1,
        maxCountCap: 2,
        delayTicks: 1200,
        spreadRadius: 32
    },
    {
        id: DAY20_BEAR_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.42,
        chancePerDay: 0.02,
        maxChance: 0.72,
        baseMaxCount: 5,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 8,
        delayTicks: 340,
        spreadRadius: 28,
        lateRamp: {
            tierSpan: 5,
            chanceStep: 0.08,
            maxChance: 0.9,
            capStep: 1,
            capBonusMax: 3,
            maxCountCap: 11
        }
    },
    {
        id: INFECTED_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.26,
        chancePerDay: 0.018,
        maxChance: 0.52,
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 7,
        delayTicks: 360,
        spreadRadius: 30,
        lateRamp: {
            tierSpan: 5,
            chanceStep: 0.06,
            maxChance: 0.72,
            capStep: 1,
            capBonusMax: 2,
            maxCountCap: 9
        }
    },
    {
        id: BUFF_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.045,
        chancePerDay: 0.002,
        maxChance: 0.08,
        baseMaxCount: 1,
        maxCountCap: 2,
        delayTicks: 1400,
        spreadRadius: 34,
        lateRamp: {
            tierSpan: 8,
            chanceStep: 0.03,
            maxChance: 0.1,
            capStep: 0,
            capBonusMax: 0,
            maxCountCap: 2
        }
    }
];

const lastSpawnTickByType = new Map();
let lastProcessedDay = 0;
let sunriseBoostTicks = 0;
const playerTileCache = new Map();

function isAir(block) {
    return !block || block.typeId === "minecraft:air" || block.typeId === "minecraft:cave_air" || block.typeId === "minecraft:void_air";
}

function collectDustedTiles(dimension, center, minDistance, maxDistance, limit = MAX_CANDIDATES_PER_SCAN) {
    const cx = Math.floor(center.x);
    const cz = Math.floor(center.z);
    const minSq = minDistance * minDistance;
    const maxSq = maxDistance * maxDistance;
    const candidates = [];
    const seen = new Set();
    const topY = Math.floor(center.y + 20);
    const bottomY = Math.floor(center.y) - 40;

    outer: for (let x = cx - maxDistance; x <= cx + maxDistance; x++) {
        for (let z = cz - maxDistance; z <= cz + maxDistance; z++) {
            const dx = x + 0.5 - center.x;
            const dz = z + 0.5 - center.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minSq || distSq > maxSq) continue;

            for (let y = topY; y >= bottomY; y--) {
                let block;
                try {
                    block = dimension.getBlock({ x, y, z });
                } catch {
                    continue;
                }
                if (!block) continue;

                if (block.typeId === TARGET_BLOCK) {
                    const blockAbove = dimension.getBlock({ x, y: y + 1, z });
                    const blockTwoAbove = dimension.getBlock({ x, y: y + 2, z });
                    if (!isAir(blockAbove) || !isAir(blockTwoAbove)) {
                        break;
                    }
                    const key = `${x},${y},${z}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        candidates.push({ x, y, z });
                        if (candidates.length >= limit) {
                            break outer;
                        }
                    }
                    break;
                }

                if (!isAir(block)) {
                    break;
                }
            }
        }
    }

    return candidates;
}

function filterTilesWithSpacing(candidates, minSpacing, maxResults = MAX_SPACED_TILES) {
    const result = [];
    for (const tile of candidates) {
        let tooClose = false;
        for (const placed of result) {
            const dx = tile.x - placed.x;
            const dz = tile.z - placed.z;
            if (dx * dx + dz * dz < minSpacing * minSpacing) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            result.push({ x: tile.x, y: tile.y, z: tile.z });
            if (result.length >= maxResults) {
                break;
            }
        }
    }
    return result;
}

function sampleTiles(tiles, max = MAX_CANDIDATES_PER_SCAN) {
    if (!tiles || tiles.length === 0) return [];
    if (tiles.length <= max) {
        return tiles.map((tile) => ({ x: tile.x, y: tile.y, z: tile.z }));
    }

    const sampled = [];
    const used = new Set();
    const len = tiles.length;

    while (sampled.length < max && used.size < len) {
        const index = Math.floor(Math.random() * len);
        if (used.has(index)) continue;
        used.add(index);
        const tile = tiles[index];
        sampled.push({ x: tile.x, y: tile.y, z: tile.z });
    }

    return sampled;
}

function removeTileFromCache(playerId, tile) {
    if (!tile) return;
    const cache = playerTileCache.get(playerId);
    if (!cache || !Array.isArray(cache.tiles)) return;
    const index = cache.tiles.findIndex((cached) => cached.x === tile.x && cached.y === tile.y && cached.z === tile.z);
    if (index !== -1) {
        cache.tiles.splice(index, 1);
        cache.density = cache.tiles.length;
    }
}

function getTilesForPlayer(player, dimension, playerPos, currentDay) {
    const playerId = player.id;
    const now = system.currentTick;
    let cache = playerTileCache.get(playerId);
    let needsRescan = false;

    if (!cache) {
        needsRescan = true;
    } else {
        const dx = playerPos.x - cache.center.x;
        const dz = playerPos.z - cache.center.z;
        const movedSq = dx * dx + dz * dz;
        if (movedSq > CACHE_MOVE_THRESHOLD_SQ || now - cache.tick > CACHE_TICK_TTL) {
            needsRescan = true;
        }
    }

    if (needsRescan) {
        const tiles = collectDustedTiles(dimension, playerPos, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE, MAX_CANDIDATES_PER_SCAN);
        cache = {
            tiles,
            density: tiles.length,
            center: { x: playerPos.x, z: playerPos.z },
            tick: now
        };
        playerTileCache.set(playerId, cache);
    }

    const density = cache.density ?? cache.tiles.length;
    let spacing = BASE_MIN_TILE_SPACING;
    if (currentDay >= 20 && density > 60) spacing -= 1;
    spacing = Math.max(2, spacing);

    const sampled = sampleTiles(cache.tiles, MAX_CANDIDATES_PER_SCAN);
    const spacedTiles = filterTilesWithSpacing(sampled, spacing, MAX_SPACED_TILES);

    return { density, spacedTiles, spacing };
}

function getMaxCount(config, day) {
    if (!config.maxCountStep || !config.maxCountStepDays) {
        return Math.min(config.baseMaxCount, config.maxCountCap ?? config.baseMaxCount);
    }
    const steps = Math.max(0, Math.floor((day - config.startDay) / config.maxCountStepDays));
    const count = config.baseMaxCount + steps * config.maxCountStep;
    return Math.min(count, config.maxCountCap ?? count);
}

function getLateRampInfo(config, day) {
    if (day < 20) return config.lateRamp;
    const over = day - 20;
    const tierSpan = config.lateRamp.tierSpan;
    const chanceStep = config.lateRamp.chanceStep;
    const maxChance = config.lateRamp.maxChance;
    const capStep = config.lateRamp.capStep;
    const capBonusMax = config.lateRamp.capBonusMax;
    const maxCountCap = config.lateRamp.maxCountCap;

    const currentTier = Math.min(Math.floor(over / tierSpan), tierSpan - 1);
    const currentChance = maxChance - currentTier * chanceStep;
    const currentCapStep = capStep + currentTier;
    const currentCapBonusMax = capBonusMax + currentTier;
    const currentMaxCountCap = maxCountCap + currentTier;

    return {
        tierSpan,
        chanceStep,
        maxChance: currentChance,
        capStep: currentCapStep,
        capBonusMax: currentCapBonusMax,
        maxCountCap: currentMaxCountCap
    };
}

function getLateMultipliers(config, day) {
    if (day < 20) return { chanceMultiplier: 1, chanceCap: config.maxChance ?? 1, extraCount: 0 };

    const over = day - 20;
    const chanceMultiplier = 1 + Math.min(0.6, over * 0.03);
    const chanceCap = config.maxChance ? Math.min(config.maxChance * 1.2, 0.95) : 0.95;

    let extraCount = 0;
    if (config.id === DAY20_BEAR_ID) {
        extraCount = Math.min(3, Math.floor(over / 6));
    } else if (config.id === INFECTED_BEAR_DAY20_ID) {
        extraCount = Math.min(2, Math.floor(over / 8));
    }

    return { chanceMultiplier, chanceCap, extraCount };
}

function attemptSpawnType(player, dimension, playerPos, tiles, config, modifiers = {}) {
    const currentDay = getCurrentDay();
    if (currentDay < config.startDay || currentDay > config.endDay) return false;

    const late = getLateMultipliers(config, currentDay);
    const isMilestone = isMilestoneDay(currentDay);

    const key = `${player.id}:${config.id}`;
    const lastTick = lastSpawnTickByType.get(key) || 0;
    if (system.currentTick - lastTick < config.delayTicks) {
        return false;
    }

    let maxCount = getMaxCount(config, currentDay);
    maxCount += modifiers.extraCount ?? 0;
    maxCount += late.extraCount;

    const capLimit = config.maxCountCap ?? Infinity;
    maxCount = Math.min(maxCount, capLimit);

    if (isMilestone) {
        maxCount = Math.min(maxCount + 1, capLimit);
    }

    const nearby = dimension.getEntities({
        type: config.id,
        location: playerPos,
        maxDistance: config.spreadRadius
    });
    if (nearby.length >= maxCount) {
        return false;
    }

    const pool = [...tiles];
    const attempts = Math.min(SPAWN_ATTEMPTS + (modifiers.attemptBonus ?? 0), pool.length);

    let chance = config.baseChance + (config.chancePerDay ?? 0) * Math.max(0, currentDay - config.startDay);
    chance *= late.chanceMultiplier;
    chance *= modifiers.chanceMultiplier ?? 1;
    const chanceCap = Math.min(late.chanceCap, modifiers.chanceCap ?? late.chanceCap);
    chance = Math.min(chance, chanceCap);

    if (isMilestone) {
        chance = Math.min(chance * 1.2, chanceCap);
    }

    for (let i = 0; i < attempts; i++) {
        const index = Math.floor(Math.random() * pool.length);
        const candidate = pool.splice(index, 1)[0];
        const { x, y, z } = candidate;

        if (Math.random() > chance) {
            console.warn(`[SPAWN DEBUG] Skipping tile (${x}, ${y}, ${z}) for ${config.id} due to spawn chance (${(chance * 100).toFixed(1)}%)`);
            continue;
        }

        console.warn(`[SPAWN DEBUG] Attempt ${i + 1} for ${config.id} near ${player.name} at (${x}, ${y}, ${z})`);

        const spawnLocation = { x: x + 0.5, y: y + 1, z: z + 0.5 };
        try {
            const entity = dimension.spawnEntity(config.id, spawnLocation);
            if (entity) {
                console.warn(`[SPAWN DEBUG] Spawned ${config.id} at ${spawnLocation.x.toFixed(1)}, ${spawnLocation.y.toFixed(1)}, ${spawnLocation.z.toFixed(1)} for ${player.name}`);
                lastSpawnTickByType.set(key, system.currentTick);
                removeTileFromCache(player.id, candidate);
                const originalIndex = tiles.findIndex(t => t.x === x && t.y === y && t.z === z);
                if (originalIndex !== -1) {
                    tiles.splice(originalIndex, 1);
                }
                return true;
            } else {
                console.warn(`[SPAWN DEBUG] spawnEntity returned no entity for ${config.id} at ${spawnLocation.x.toFixed(1)}, ${spawnLocation.y.toFixed(1)}, ${spawnLocation.z.toFixed(1)}`);
            }
        } catch (error) {
            console.warn(`[SPAWN] Failed to spawn ${config.id} at ${spawnLocation.x}, ${spawnLocation.y}, ${spawnLocation.z}:`, error);
        }
    }

    return false;
}

console.warn("[SPAWN DEBUG] Maple Bear spawn controller initialized.");

system.runInterval(() => {
    const currentDay = getCurrentDay();
    if (currentDay < 2) {
        return;
    }

    if (currentDay > lastProcessedDay) {
        if (currentDay >= 20) {
            sunriseBoostTicks = SUNRISE_BOOST_DURATION;
            console.warn(`[SPAWN DEBUG] Day ${currentDay} sunrise surge primed.`);
        }
        lastProcessedDay = currentDay;
    }

    if (sunriseBoostTicks > 0) {
        sunriseBoostTicks = Math.max(0, sunriseBoostTicks - SCAN_INTERVAL);
        if (sunriseBoostTicks === 0) {
            console.warn("[SPAWN DEBUG] Sunrise surge faded.");
        }
    }

    const sunriseActive = sunriseBoostTicks > 0;

    for (const player of world.getAllPlayers()) {
        const dimension = player.dimension;
        const playerPos = player.location;

        const tileInfo = getTilesForPlayer(player, dimension, playerPos, currentDay);
        const density = tileInfo?.density ?? 0;
        const spacedTiles = tileInfo?.spacedTiles ?? [];
        const spacing = tileInfo?.spacing ?? BASE_MIN_TILE_SPACING;

        console.warn(`[SPAWN DEBUG] Using ${density} dusted tiles near ${player.name}; ${spacedTiles.length} after spacing filter (d=${spacing})`);
        if (spacedTiles.length === 0) {
            continue;
        }

        let chanceMultiplier = 1;
        if (currentDay >= 20) {
            chanceMultiplier *= 1 + Math.min(0.4, (currentDay - 20) * 0.02);
        }
        if (density > 80) {
            chanceMultiplier *= 1 + Math.min(0.2, (density - 80) / 300);
        }
        if (sunriseActive) {
            chanceMultiplier *= SUNRISE_BOOST_MULTIPLIER;
        }

        let extraCount = 0;
        if (density > 140) {
            extraCount += Math.min(1, Math.floor((density - 140) / 120));
        }
        if (sunriseActive) {
            extraCount += 1;
        }

        const modifiers = {
            chanceMultiplier,
            chanceCap: 0.9,
            extraCount
        };

        const timeOfDay = dimension.getTimeOfDay ? dimension.getTimeOfDay() : 0;
        const isSunsetWindow = timeOfDay >= 12000 && timeOfDay <= 12500;
        if (isSunsetWindow) {
            modifiers.chanceMultiplier *= 1.35;
            modifiers.extraCount += 1;
        }

        for (const config of SPAWN_CONFIGS) {
            const configModifiers = { ...modifiers };
            if (config.id === BUFF_BEAR_DAY20_ID) {
                configModifiers.chanceMultiplier *= 0.6;
                configModifiers.chanceCap = Math.min(configModifiers.chanceCap, 0.08);
                configModifiers.extraCount = Math.min(configModifiers.extraCount, 0);
            }
            attemptSpawnType(player, dimension, playerPos, spacedTiles, config, configModifiers);
        }
    }
}, SCAN_INTERVAL);