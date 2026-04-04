/**
 * Merges independent action-bar segments into one Bedrock action bar (only one HUD line).
 * Lower slot number = earlier (left) in the merged line:
 * infection → preset hint → scan perf → day/narrative → camp dev → toast.
 */

import { world, system } from "@minecraft/server";

/** Priority order (ascending = left / first). */
export const ACTION_BAR_SLOT = {
    INFECTION: 10,
    /** Dev: active spawn/scan preset hint (optional HUD). */
    SPAWN_TUNING: 15,
    SPAWN_SCAN_PERF: 20,
    /** Day tracker / ambient one-liners (merged, not a second HUD). */
    NARRATIVE: 25,
    CAMP_DEV: 30,
    /** Short-lived messages (e.g. cure congrats) — rightmost, auto-clears. */
    TOAST: 40
};

const SEP = " §8┃§r ";
const SEP_COMPACT = " §8·§r ";

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

/** Every slot we merge — use with clearAllHudSegments. */
export const HUD_MERGE_SLOTS_ORDERED = [
    ACTION_BAR_SLOT.INFECTION,
    ACTION_BAR_SLOT.SPAWN_TUNING,
    ACTION_BAR_SLOT.SPAWN_SCAN_PERF,
    ACTION_BAR_SLOT.NARRATIVE,
    ACTION_BAR_SLOT.CAMP_DEV,
    ACTION_BAR_SLOT.TOAST
];

/** Dev menu: human-readable merge order. */
export const HUD_MERGE_SLOT_META = [
    { slot: ACTION_BAR_SLOT.INFECTION, title: "Infection", detail: "Timer / cues when infected (journal settings)." },
    { slot: ACTION_BAR_SLOT.SPAWN_TUNING, title: "Preset hint", detail: "Per-player dev toggle; optional broadcast (Spawn Controller → HUD & spatial)." },
    { slot: ACTION_BAR_SLOT.SPAWN_SCAN_PERF, title: "Scan perf", detail: "Per-player; optional broadcast — addon bears, L%=load model, i×/b× scalers, P/C/D/W spatial (journal menu)." },
    { slot: ACTION_BAR_SLOT.NARRATIVE, title: "Day / ambient", detail: "Day tracker one-liners (peaceful / infection tone)." },
    { slot: ACTION_BAR_SLOT.CAMP_DEV, title: "Camp dev", detail: "Tag mb_dev_camp_watch + cheats." },
    { slot: ACTION_BAR_SLOT.TOAST, title: "Toast", detail: "Brief messages (e.g. cure) — drops off after a few seconds." }
];

export function formatHudMergeOrderForMenu() {
    return HUD_MERGE_SLOT_META.map((row) => `§8• §f${row.title} §8(${row.slot})§7 — ${row.detail}`).join("\n");
}

/** @param {import("@minecraft/server").Player} player */
export function clearAllHudSegments(player) {
    if (!player?.id) return;
    for (const slot of HUD_MERGE_SLOTS_ORDERED) {
        clearHudActionBarSegment(player, slot);
    }
}

const toastPendingClear = new Map();

/**
 * Rightmost segment; clears after durationTicks so it does not wipe other merged HUDs.
 * @param {import("@minecraft/server").Player} player
 */
export function pushHudActionBarToast(player, text, durationTicks = 55) {
    if (!player?.isValid || !player.id) return;
    const id = player.id;
    const prev = toastPendingClear.get(id);
    if (typeof prev === "number") {
        try {
            system.clearRun(prev);
        } catch {
            /* older API / invalid id */
        }
    }
    setHudActionBarSegment(player, ACTION_BAR_SLOT.TOAST, String(text));
    const runId = system.runTimeout(() => {
        toastPendingClear.delete(id);
        try {
            clearHudActionBarSegment(player, ACTION_BAR_SLOT.TOAST);
        } catch { /* ignore */ }
    }, Math.max(5, Math.min(200, durationTicks | 0)));
    toastPendingClear.set(id, runId);
}

function mergeLine(playerId) {
    const m = byPlayer.get(playerId);
    if (!m || m.size === 0) return { text: "", count: 0, parts: [] };
    const entries = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const parts = entries.map(([, s]) => s);
    const count = parts.length;
    const sep = count >= 3 ? SEP_COMPACT : SEP;
    let text = parts.join(sep);
    if (count > 1) {
        text = (count >= 4 ? `§8(${count})§r ` : `§8[${count}]§r `) + text;
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

/** How many merged segments are active (for shortening labels when many stack). */
export function getHudActiveSegmentCount(player) {
    if (!player?.id) return 0;
    return byPlayer.get(player.id)?.size ?? 0;
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
                const tr = toastPendingClear.get(id);
                if (typeof tr === "number") {
                    try { system.clearRun(tr); } catch { /* ignore */ }
                }
                toastPendingClear.delete(id);
                byPlayer.delete(id);
                lastApplied.delete(id);
                lastActionBarApplyTick.delete(id);
            }
        } catch { /* ignore */ }
    });
} catch { /* ignore */ }
