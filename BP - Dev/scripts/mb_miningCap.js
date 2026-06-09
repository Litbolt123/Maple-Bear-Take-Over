/**
 * Mining bear caps: near-player (spawn scan) + dimension-wide (loaded).
 * Mining AI is expensive — default 2 per player in dimension, 2 near each anchor.
 */

import { system, world } from "@minecraft/server";
import {
    getMaxMiningBearsNearPlayerCount,
    getMaxMiningBearsDimensionWideCount
} from "./mb_balance.js";
import { shouldPauseDayZeroAddonLoops } from "./mb_dayZeroPerfBisect.js";
import { isScriptEnabled, SCRIPT_IDS } from "./mb_scriptToggles.js";
import { getBearSnapshot, invalidateBearSnapshots } from "./mb_bearSnapshot.js";
import { isEntityValid } from "./mb_sharedCache.js";
import { MINING_BEAR_ID, MINING_BEAR_DAY20_ID } from "./mb_spawnEntityIds.js";
import { getPlayerCountInDimension } from "./mb_buffCap.js";

const MINING_BEAR_TYPE_IDS = [MINING_BEAR_ID, MINING_BEAR_DAY20_ID];

const OVERFLOW_CULL_INTERVAL_TICKS = 40;

/** Sum mining variant counts from spawn controller entityCounts cache. */
export function countMiningBearsFromEntityCounts(entityCounts) {
    if (!entityCounts || typeof entityCounts !== "object") return 0;
    return (entityCounts[MINING_BEAR_ID] || 0) + (entityCounts[MINING_BEAR_DAY20_ID] || 0);
}

/** Loaded mining bears in dimension (bear snapshot). */
export function countLoadedMiningBearsInDimension(dimension) {
    if (!dimension) return 0;
    let n = 0;
    try {
        const snap = getBearSnapshot(dimension);
        for (const typeId of MINING_BEAR_TYPE_IDS) {
            const bucket = snap.byType.get(typeId);
            if (bucket?.length) n += bucket.length;
        }
    } catch {
        /* ignore */
    }
    return n;
}

/** @param {import("@minecraft/server").Dimension} dimension */
export function getMiningBearDimensionCap(dimension) {
    return getMaxMiningBearsDimensionWideCount(getPlayerCountInDimension(dimension));
}

/**
 * True when either cap would block another mining bear spawn.
 * @param {object} opts
 * @param {import("@minecraft/server").Dimension} opts.dimension
 * @param {Record<string, number>} [opts.entityCounts] spawn scan counts near player
 * @param {number} [opts.extraPending] reserved slots this tick
 */
export function isMiningBearSpawnBlocked(opts) {
    const dimension = opts?.dimension;
    if (!dimension) return true;

    const playersInDim = getPlayerCountInDimension(dimension);
    let nearCount = 0;
    if (opts.entityCounts) {
        nearCount = countMiningBearsFromEntityCounts(opts.entityCounts);
    }

    const dimCount = countLoadedMiningBearsInDimension(dimension) + Math.max(0, opts.extraPending ?? 0);

    if (nearCount >= getMaxMiningBearsNearPlayerCount()) return true;
    if (dimCount >= getMaxMiningBearsDimensionWideCount(playersInDim)) return true;
    return false;
}

function nearestPlayerDistSq(entity, players) {
    if (!isEntityValid(entity)) return 0;
    let minSq = Infinity;
    const locE = entity.location;
    const dimId = entity.dimension?.id;
    for (const p of players) {
        if (!p?.isValid || p.dimension?.id !== dimId) continue;
        try {
            const l = p.location;
            const dx = l.x - locE.x;
            const dy = l.y - locE.y;
            const dz = l.z - locE.z;
            const s = dx * dx + dy * dy + dz * dz;
            if (s < minSq) minSq = s;
        } catch {
            /* ignore */
        }
    }
    return minSq;
}

/** Remove farthest loaded mining bears down to the dimension cap. */
function cullExcessMiningBearsInDimension(dimension) {
    const cap = getMiningBearDimensionCap(dimension);
    const snap = getBearSnapshot(dimension);
    const miners = [];
    for (const typeId of MINING_BEAR_TYPE_IDS) {
        const bucket = snap.byType.get(typeId);
        if (!bucket) continue;
        for (const entity of bucket) {
            if (isEntityValid(entity)) miners.push(entity);
        }
    }
    const excess = miners.length - cap;
    if (excess <= 0) return 0;

    const players = world.getAllPlayers();
    const ranked = miners.map((entity) => ({ entity, dSq: nearestPlayerDistSq(entity, players) }));
    ranked.sort((a, b) => b.dSq - a.dSq);

    let removed = 0;
    for (let i = 0; i < ranked.length && removed < excess; i++) {
        const { entity } = ranked[i];
        if (!isEntityValid(entity)) continue;
        try {
            entity.remove();
            removed++;
        } catch {
            /* ignore */
        }
    }
    if (removed > 0) {
        try {
            invalidateBearSnapshots();
        } catch {
            /* ignore */
        }
    }
    return removed;
}

let overflowCullStarted = false;

export function initializeMiningBearOverflowCull() {
    if (overflowCullStarted) return;
    overflowCullStarted = true;
    system.runInterval(() => {
        try {
            if (!isScriptEnabled(SCRIPT_IDS.miningOverflowCull)) return;
            if (shouldPauseDayZeroAddonLoops()) return;
            for (const dimId of ["overworld", "nether", "the_end"]) {
                let dimension;
                try {
                    dimension = world.getDimension(dimId);
                } catch {
                    continue;
                }
                if (!dimension) continue;
                cullExcessMiningBearsInDimension(dimension);
            }
        } catch {
            /* ignore */
        }
    }, OVERFLOW_CULL_INTERVAL_TICKS);
}
