/**
 * Player-facing abandoned settlement titles and action-bar flavor text.
 * Multiplayer: per-player witness/discovery counts; range checks use all players.
 */

import { system, world } from "@minecraft/server";
import {
    SETTLEMENT_COMPLETE_WITNESS_DIST,
    SETTLEMENT_HUD_CENTER_DIST,
    SETTLEMENT_HUD_PAUSED_LINGER_TICKS
} from "./mb_abandonedVillageConstants.js";
import {
    listActiveSettlementBuildCenters,
    tryWakeSettlementBuildAtCenter
} from "./mb_abandonedSettlementBuilder.js";
import { avLogBuildLine } from "./mb_avDebugLog.js";
import {
    ACTION_BAR_SLOT,
    clearHudActionBarSegment,
    setHudActionBarSegment
} from "./mb_actionBarHud.js";
import {
    flushPlayerPropertyToDisk,
    getPlayerProperty,
    setPlayerProperty
} from "./mb_dynamicPropertyHandler.js";

const MB_AV_SETTLEMENTS_DISCOVERED = "mb_av_settlements_discovered";
const MB_AV_CONSTRUCTION_WITNESSED = "mb_av_construction_witnessed";

/** Chebyshev distance to settlement center — construction HUD (not lamp; see constants). */
const SETTLEMENT_HUD_NEAR_DIST = SETTLEMENT_HUD_CENTER_DIST;

/**
 * @typedef {{ inHudBand?: boolean, buildPaused?: boolean, siteKey?: string }} ConstructionPresenceLogState
 */

/** Per-player HUD / pause transitions for Content Log (mirrors action-bar construction HUD). */
const constructionPresenceLogByPlayer = new Map();

/** After you leave, show “Paused until you return…” then clear (see SETTLEMENT_HUD_PAUSED_LINGER_TICKS). */
const SETTLEMENT_HUD_LINGER_TICKS = SETTLEMENT_HUD_PAUSED_LINGER_TICKS;

/** Prominent action-bar line at build start (~5s at 20 TPS). */
const CONSTRUCTION_HUD_BOOST_TICKS = 100;

const TITLE_FADE = { fadeInDuration: 8, stayDuration: 55, fadeOutDuration: 16 };

const HUD_BOOST_TEXT = "§e§lGenerating abandoned village…";
const HUD_SUBTLE_TEXT = "§7Generating village…";
const HUD_PAUSED_TEXT = "§7§oPaused until you return…";
const HUD_PAUSED_NEAR_TEXT = "§7§oConstruction paused — return to the village";

/**
 * @typedef {{
 *   dimId: string,
 *   x: number,
 *   y: number,
 *   z: number,
 *   startTick: number,
 *   paused?: boolean,
 *   lingerUntilTick?: number
 * }} ConstructionHudWatch
 */

/** @type {Map<string, ConstructionHudWatch>} */
const constructionHudByPlayer = new Map();

/** @type {Map<string, { dimId: string, x: number, y: number, z: number }>} */
const pendingCompleteNotify = new Map();

/**
 * @param {string} dimId
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function pendingNotifyKey(dimId, x, y, z) {
    return `${dimId}:${Math.floor(x)}:${Math.floor(y)}:${Math.floor(z)}`;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 * @param {number} [maxDist]
 */
export function anyPlayerNearSettlementCenter(
    dimension,
    centerX,
    centerY,
    centerZ,
    maxDist = SETTLEMENT_COMPLETE_WITNESS_DIST
) {
    const dimId = dimension?.id;
    if (!dimId) return false;
    for (const player of world.getAllPlayers()) {
        if (!player?.isValid) continue;
        try {
            if (player.dimension?.id !== dimId) continue;
            const loc = player.location;
            const dist = Math.max(Math.abs(loc.x - centerX), Math.abs(loc.z - centerZ));
            if (dist <= maxDist) return true;
        } catch {
            /* ignore */
        }
    }
    return false;
}

/**
 * Show Village Complete when a player is in witness range; otherwise queue for join/return.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 */
export function deliverSettlementCompleteNotify(dimension, centerX, centerY, centerZ) {
    const dimId = dimension?.id;
    if (!dimId) return;
    const key = pendingNotifyKey(dimId, centerX, centerY, centerZ);
    if (anyPlayerNearSettlementCenter(dimension, centerX, centerY, centerZ)) {
        pendingCompleteNotify.delete(key);
        notifyPlayersSettlementComplete(
            dimension,
            centerX,
            centerY,
            centerZ,
            SETTLEMENT_COMPLETE_WITNESS_DIST
        );
        avLogBuildLine(
            `Village Complete shown @ ${Math.floor(centerX)},${Math.floor(centerY)},${Math.floor(centerZ)} (witness range)`
        );
    } else {
        pendingCompleteNotify.set(key, { dimId, x: centerX, y: centerY, z: centerZ });
        avLogBuildLine(
            `Village Complete deferred @ ${Math.floor(centerX)},${Math.floor(centerY)},${Math.floor(centerZ)} — return nearby to see title`
        );
    }
}

/** Try to deliver any titles queued while the player was away. */
export function tickPendingSettlementCompleteNotifies() {
    if (pendingCompleteNotify.size === 0) return;
    for (const [key, entry] of [...pendingCompleteNotify.entries()]) {
        let dim;
        try {
            dim = world.getDimension(entry.dimId);
        } catch {
            continue;
        }
        if (!anyPlayerNearSettlementCenter(dim, entry.x, entry.y, entry.z)) continue;
        pendingCompleteNotify.delete(key);
        notifyPlayersSettlementComplete(dim, entry.x, entry.y, entry.z, SETTLEMENT_COMPLETE_WITNESS_DIST);
        avLogBuildLine(
            `Village Complete delivered on return @ ${Math.floor(entry.x)},${Math.floor(entry.y)},${Math.floor(entry.z)}`
        );
    }
}

/**
 * @param {ConstructionHudWatch} watch
 * @param {string} dimId
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function isSameSettlementCenter(watch, dimId, x, y, z) {
    return (
        watch.dimId === dimId &&
        Math.abs(watch.x - x) < 2 &&
        Math.abs(watch.y - y) < 4 &&
        Math.abs(watch.z - z) < 2
    );
}

/**
 * @param {number} px
 * @param {number} pz
 * @param {number} cx
 * @param {number} cz
 */
function chebyshevDistXZ(px, pz, cx, cz) {
    return Math.max(Math.abs(px - cx), Math.abs(pz - cz));
}

/**
 * HUD range uses settlement center only (lamp can be far from the plaza).
 * @param {number} px
 * @param {number} pz
 * @param {{ x: number, z: number }} build
 */
function playerDistToSettlementHud(px, pz, build) {
    return chebyshevDistXZ(px, pz, build.x, build.z);
}

/**
 * @param {import("@minecraft/server").Player} player
 */
function clearConstructionHudForPlayer(player) {
    if (!player?.id) return;
    constructionHudByPlayer.delete(player.id);
    constructionPresenceLogByPlayer.delete(player.id);
    try {
        clearHudActionBarSegment(player, ACTION_BAR_SLOT.SETTLEMENT_BUILD);
    } catch {
        /* ignore */
    }
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {ConstructionHudWatch} watch
 */
/**
 * @param {import("@minecraft/server").Player} player
 * @param {ConstructionHudWatch} watch
 * @param {{ buildPaused?: boolean }} [opts]
 */
function paintConstructionHud(player, watch, opts = {}) {
    if (!player?.isValid) return;
    const now = system.currentTick;
    if (watch.lingerUntilTick != null && now < watch.lingerUntilTick) {
        setHudActionBarSegment(player, ACTION_BAR_SLOT.SETTLEMENT_BUILD, HUD_PAUSED_TEXT);
        return;
    }
    if (opts.buildPaused) {
        setHudActionBarSegment(player, ACTION_BAR_SLOT.SETTLEMENT_BUILD, HUD_PAUSED_NEAR_TEXT);
        return;
    }
    const age = now - watch.startTick;
    const text = age < CONSTRUCTION_HUD_BOOST_TICKS ? HUD_BOOST_TEXT : HUD_SUBTLE_TEXT;
    setHudActionBarSegment(player, ACTION_BAR_SLOT.SETTLEMENT_BUILD, text);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 * @param {number} [maxDist]
 */
function registerConstructionHudWatchers(
    dimension,
    centerX,
    centerY,
    centerZ,
    maxDist = SETTLEMENT_HUD_NEAR_DIST
) {
    const dimId = dimension?.id;
    if (!dimId) return;
    const startTick = system.currentTick;
    for (const player of world.getAllPlayers()) {
        if (!player?.isValid) continue;
        try {
            if (player.dimension?.id !== dimId) continue;
            const loc = player.location;
            const dist = chebyshevDistXZ(loc.x, loc.z, centerX, centerZ);
            if (dist > maxDist) continue;
            const watch = { dimId, x: centerX, y: centerY, z: centerZ, startTick };
            constructionHudByPlayer.set(player.id, watch);
            paintConstructionHud(player, watch);
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 */
export function clearSettlementBuildHudAtCenter(dimension, centerX, centerY, centerZ) {
    const dimId = dimension?.id;
    if (!dimId) return;
    for (const player of world.getAllPlayers()) {
        if (!player?.isValid) continue;
        const watch = constructionHudByPlayer.get(player.id);
        if (!watch || !isSameSettlementCenter(watch, dimId, centerX, centerY, centerZ)) continue;
        clearConstructionHudForPlayer(player);
    }
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {{ dimId: string, x: number, y: number, z: number, paused: boolean }|undefined} match
 * @param {number} buildDist
 */
function logConstructionPresenceTransitions(player, watch, match, buildDist) {
    const prev = constructionPresenceLogByPlayer.get(player.id) ?? {};
    const watchKey = watch
        ? `${watch.dimId}:${Math.floor(watch.x)},${Math.floor(watch.y)},${Math.floor(watch.z)}`
        : undefined;
    const siteKey = watchKey ?? prev.siteKey;
    if (watchKey && prev.watchKey && watchKey !== prev.watchKey) {
        prev.inHudBand = false;
        prev.buildPaused = undefined;
    }
    const inHudBand = !!(match && buildDist <= SETTLEMENT_HUD_NEAR_DIST);
    const buildPaused = match?.paused === true;

    if (inHudBand && !prev.inHudBand && match) {
        const prog =
            match.phase != null
                ? ` phase=${match.phase} edits=${match.edits ?? 0} structures=${match.structuresBuilt ?? "?"}/${match.structuresPlanned ?? "?"} slot=${match.structureIndex ?? 0}`
                : "";
        avLogBuildLine(
            `Player entered construction HUD (${player.name}, ${Math.floor(buildDist)}ch from center @ ${Math.floor(match.x)},${Math.floor(match.y)},${Math.floor(match.z)})${prog}`
        );
        tryWakeSettlementBuildAtCenter(match.dimId, match.x, match.y, match.z);
    } else if (!inHudBand && prev.inHudBand && siteKey) {
        avLogBuildLine(
            `Player left construction HUD (${player.name}, ${Math.floor(buildDist)}ch) — action bar linger then clear`
        );
    }

    if (match && buildPaused && prev.buildPaused !== true) {
        avLogBuildLine(
            `Player left build band (${player.name}) — generation paused @ ${Math.floor(match.x)},${Math.floor(match.y)},${Math.floor(match.z)} (${Math.floor(buildDist)}ch from center)`
        );
    } else if (match && !buildPaused && prev.buildPaused === true) {
        avLogBuildLine(
            `Player returned to build band (${player.name}) — generation resumed @ ${Math.floor(match.x)},${Math.floor(match.y)},${Math.floor(match.z)} (${Math.floor(buildDist)}ch from center)`
        );
        tryWakeSettlementBuildAtCenter(match.dimId, match.x, match.y, match.z);
    }

    const now = system.currentTick;
    if (inHudBand && match && now - (prev.lastHudHeartbeat ?? 0) >= 200) {
        if (match.paused) {
            tryWakeSettlementBuildAtCenter(match.dimId, match.x, match.y, match.z);
        }
        avLogBuildLine(
            `Construction HUD @ ${Math.floor(match.x)},${Math.floor(match.y)},${Math.floor(match.z)} — phase=${match.phase ?? "?"} edits=${match.edits ?? 0} structures=${match.structuresBuilt ?? "?"}/${match.structuresPlanned ?? "?"} slot=${match.structureIndex ?? 0}${match.paused ? " PAUSED" : ""}`
        );
        prev.lastHudHeartbeat = now;
    }

    constructionPresenceLogByPlayer.set(player.id, {
        inHudBand,
        buildPaused: match ? buildPaused : prev.buildPaused,
        siteKey,
        watchKey,
        lastHudHeartbeat: prev.lastHudHeartbeat
    });
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {ConstructionHudWatch} watch
 * @param {{ dimId: string, x: number, y: number, z: number, paused: boolean }|undefined} match
 * @param {number} dist
 */
function tickConstructionHudWatch(player, watch, match, buildDist) {
    const now = system.currentTick;
    if (!match) {
        if (watch.lingerUntilTick != null && now < watch.lingerUntilTick) {
            paintConstructionHud(player, watch);
            return;
        }
        clearConstructionHudForPlayer(player);
        return;
    }

    if (buildDist <= SETTLEMENT_HUD_NEAR_DIST) {
        watch.lingerUntilTick = undefined;
        paintConstructionHud(player, watch, { buildPaused: match.paused === true });
        return;
    }

    if (match.paused === true) {
        watch.paused = true;
        if (watch.lingerUntilTick == null) {
            watch.lingerUntilTick = now + SETTLEMENT_HUD_LINGER_TICKS;
        }
        if (now >= watch.lingerUntilTick) {
            clearConstructionHudForPlayer(player);
            return;
        }
        paintConstructionHud(player, watch);
        return;
    }

    watch.paused = true;
    if (watch.lingerUntilTick == null) {
        watch.lingerUntilTick = now + SETTLEMENT_HUD_LINGER_TICKS;
    }
    if (now >= watch.lingerUntilTick) {
        clearConstructionHudForPlayer(player);
        return;
    }
    paintConstructionHud(player, watch);
}

/**
 * Show construction HUD when the player is near any in-progress build (not only at enqueue time).
 */
function syncConstructionHudWithActiveBuilds() {
    const builds = listActiveSettlementBuildCenters();
    if (builds.length === 0) {
        for (const player of world.getAllPlayers()) {
            if (!player?.isValid) continue;
            if (constructionHudByPlayer.has(player.id)) {
                clearConstructionHudForPlayer(player);
            }
        }
        return;
    }

    const now = system.currentTick;
    for (const player of world.getAllPlayers()) {
        if (!player?.isValid) continue;
        try {
            const dimId = player.dimension?.id;
            if (!dimId) continue;
            const loc = player.location;
            let nearest;
            let nearestDist = Infinity;
            for (const b of builds) {
                if (b.dimId !== dimId) continue;
                const dist = playerDistToSettlementHud(loc.x, loc.z, b);
                if (dist >= nearestDist) continue;
                nearestDist = dist;
                nearest = b;
            }

            let watch = constructionHudByPlayer.get(player.id);
            if (nearest && nearestDist <= SETTLEMENT_HUD_NEAR_DIST) {
                const sameCenter =
                    watch &&
                    isSameSettlementCenter(watch, nearest.dimId, nearest.x, nearest.y, nearest.z);
                if (!sameCenter) {
                    constructionPresenceLogByPlayer.delete(player.id);
                    watch = {
                        dimId: nearest.dimId,
                        x: nearest.x,
                        y: nearest.y,
                        z: nearest.z,
                        startTick: now
                    };
                    constructionHudByPlayer.set(player.id, watch);
                } else if (watch) {
                    watch.lingerUntilTick = undefined;
                }
            }

            watch = constructionHudByPlayer.get(player.id);
            if (!watch) continue;

            const match = builds.find((b) =>
                isSameSettlementCenter(watch, b.dimId, b.x, b.y, b.z)
            );
            const buildDist = match
                ? playerDistToSettlementHud(loc.x, loc.z, match)
                : chebyshevDistXZ(loc.x, loc.z, watch.x, watch.z);
            logConstructionPresenceTransitions(player, watch, match, buildDist);
            tickConstructionHudWatch(player, watch, match, buildDist);
        } catch {
            /* ignore */
        }
    }
}

try {
    system.runInterval(() => {
        syncConstructionHudWithActiveBuilds();
        tickPendingSettlementCompleteNotifies();
    }, 10);
} catch {
    /* ignore */
}

try {
    world.beforeEvents.playerLeave.subscribe((ev) => {
        const id = ev.player?.id;
        if (id) {
            constructionHudByPlayer.delete(id);
            constructionPresenceLogByPlayer.delete(id);
        }
        const name = ev.player?.name ?? id ?? "?";
        avLogBuildLine(`Player LEFT world (${name}) — active builds keep running; return to resume`);
    });
} catch {
    /* ignore */
}

try {
    world.afterEvents.playerSpawn.subscribe((ev) => {
        const player = ev.player;
        if (!player?.isValid) return;
        try {
            avLogBuildLine(
                `Player JOIN/spawn (${player.name}) — checking deferred village titles + construction HUD`
            );
        } catch {
            /* ignore */
        }
        tickPendingSettlementCompleteNotifies();
    });
} catch {
    /* ignore */
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {boolean} isFirst
 */
function showSettlementCompleteTitle(player, isFirst) {
    if (!player?.isValid) return;
    try {
        const osd = player.onScreenDisplay;
        if (!osd?.setTitle) return;
        osd.setTitle("§6§lVillage Complete", TITLE_FADE);
        const actionBar = isFirst
            ? "§7Your first village… or what's left of it."
            : "§7Another found. Another gone.";
        osd.setActionBar?.(actionBar);
    } catch {
        /* ignore */
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 * @param {number} [maxDist]
 */
export function notifyPlayersSettlementConstructionStarted(
    dimension,
    centerX,
    centerY,
    centerZ,
    maxDist = SETTLEMENT_HUD_NEAR_DIST
) {
    registerConstructionHudWatchers(dimension, centerX, centerY, centerZ, maxDist);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 * @param {number} [maxDist]
 */
/** Dev/testing: show construction + first-complete flavor again. */
export function resetAbandonedVillageNotifyFlagsForPlayer(player) {
    if (!player?.isValid) return;
    try {
        setPlayerProperty(player, MB_AV_SETTLEMENTS_DISCOVERED, 0);
        setPlayerProperty(player, MB_AV_CONSTRUCTION_WITNESSED, 0);
        flushPlayerPropertyToDisk(player, MB_AV_SETTLEMENTS_DISCOVERED);
        flushPlayerPropertyToDisk(player, MB_AV_CONSTRUCTION_WITNESSED);
        clearConstructionHudForPlayer(player);
    } catch {
        /* ignore */
    }
}

export function notifyPlayersSettlementComplete(
    dimension,
    centerX,
    centerY,
    centerZ,
    maxDist = SETTLEMENT_HUD_NEAR_DIST
) {
    clearSettlementBuildHudAtCenter(dimension, centerX, centerY, centerZ);
    const dimId = dimension?.id;
    if (!dimId) return;
    for (const player of world.getAllPlayers()) {
        if (!player?.isValid) continue;
        try {
            if (player.dimension?.id !== dimId) continue;
            const loc = player.location;
            const dist = chebyshevDistXZ(loc.x, loc.z, centerX, centerZ);
            if (dist > maxDist) continue;
            let count = Number(getPlayerProperty(player, MB_AV_SETTLEMENTS_DISCOVERED));
            if (!Number.isFinite(count) || count < 0) count = 0;
            const isFirst = count === 0;
            setPlayerProperty(player, MB_AV_SETTLEMENTS_DISCOVERED, count + 1);
            flushPlayerPropertyToDisk(player, MB_AV_SETTLEMENTS_DISCOVERED);
            showSettlementCompleteTitle(player, isFirst);
        } catch {
            /* ignore */
        }
    }
}
