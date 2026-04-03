/**
 * Merges independent action-bar segments so infection, spawn perf overlay, and dev camp HUD
 * do not overwrite each other. Lower slot number = earlier in the combined line
 * (infection timer → spawn scan overlay → camp dev).
 */

import { world, system } from "@minecraft/server";

/** Priority order (ascending = left / first). */
export const ACTION_BAR_SLOT = {
    INFECTION: 10,
    SPAWN_SCAN_PERF: 20,
    CAMP_DEV: 30
};

const SEP = " §8┃§r ";

/**
 * Bedrock fades the action bar if setActionBar is not called regularly. Infection text changes
 * often; camp/spawn segments can be static for many ticks — still re-apply on this cadence.
 * Keep in line with `INFECTION_ACTIONBAR_REFRESH_TICKS` in main.js.
 */
const ACTION_BAR_HEARTBEAT_TICKS = 10;

/** @type {Map<string, Map<number, string>>} */
const byPlayer = new Map();
/** @type {Map<string, string>} last merged line applied (avoid redundant setActionBar) */
const lastApplied = new Map();
/** @type {Map<string, number>} system.currentTick when we last called setActionBar for that line */
const lastActionBarApplyTick = new Map();

function mergeLine(playerId) {
    const m = byPlayer.get(playerId);
    if (!m || m.size === 0) return { text: "", count: 0, parts: [] };
    const entries = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const parts = entries.map(([, s]) => s);
    const count = parts.length;
    let text = parts.join(SEP);
    if (count > 1) {
        text = `§8[${count}]§r ${text}`;
    }
    return { text, count, parts };
}

/**
 * @param {import("@minecraft/server").Player} player
 */
export function applyHudActionBar(player) {
    if (!player?.isValid) return;
    const osd = player.onScreenDisplay;
    if (!osd?.setActionBar) return;
    const { text } = mergeLine(player.id);
    const prevContent = lastApplied.get(player.id);
    const now = system.currentTick;
    const lastPaint = lastActionBarApplyTick.get(player.id) ?? -1_000_000;

    if (text === "") {
        lastActionBarApplyTick.delete(player.id);
        if (prevContent === "" || prevContent === undefined) return;
        lastApplied.set(player.id, "");
        try {
            osd.setActionBar("");
        } catch { /* ignore */ }
        return;
    }

    const contentChanged = prevContent !== text;
    const stale = now - lastPaint >= ACTION_BAR_HEARTBEAT_TICKS;
    if (!contentChanged && !stale) return;

    lastApplied.set(player.id, text);
    lastActionBarApplyTick.set(player.id, now);
    try {
        osd.setActionBar(text);
    } catch { /* ignore */ }
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {number} slotPriority
 * @param {string} [text] empty / null clears
 */
export function setHudActionBarSegment(player, slotPriority, text) {
    if (!player?.id) return;
    if (text == null || text === "") {
        clearHudActionBarSegment(player, slotPriority);
        return;
    }
    let m = byPlayer.get(player.id);
    if (!m) {
        m = new Map();
        byPlayer.set(player.id, m);
    }
    m.set(slotPriority, String(text));
    applyHudActionBar(player);
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {number} slotPriority
 */
export function clearHudActionBarSegment(player, slotPriority) {
    if (!player?.id) return;
    const m = byPlayer.get(player.id);
    if (!m) return;
    m.delete(slotPriority);
    if (m.size === 0) byPlayer.delete(player.id);
    applyHudActionBar(player);
}

/**
 * @param {import("@minecraft/server").Player} player
 * @returns {{ count: number, slots: number[], preview: string }}
 */
export function getHudActionBarDebugInfo(player) {
    if (!player?.id) return { count: 0, slots: [], preview: "" };
    const m = byPlayer.get(player.id);
    if (!m || m.size === 0) return { count: 0, slots: [], preview: "" };
    const slots = [...m.keys()].sort((a, b) => a - b);
    const { text, count } = mergeLine(player.id);
    return { count, slots, preview: text };
}

try {
    system.runInterval(() => {
        try {
            if (byPlayer.size === 0) return;
            const players = world.getAllPlayers();
            for (const p of players) {
                if (!p?.isValid || !byPlayer.has(p.id)) continue;
                applyHudActionBar(p);
            }
        } catch { /* ignore */ }
    }, ACTION_BAR_HEARTBEAT_TICKS);
} catch { /* ignore */ }

try {
    world.beforeEvents.playerLeave.subscribe((ev) => {
        try {
            const id = ev.player?.id;
            if (id) {
                byPlayer.delete(id);
                lastApplied.delete(id);
                lastActionBarApplyTick.delete(id);
            }
        } catch { /* ignore */ }
    });
} catch { /* ignore */ }
