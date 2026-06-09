/**
 * Lightweight abandoned-village Content Log helpers (no imports from worldgen/builder).
 */

import { getWorldProperty } from "./mb_dynamicPropertyHandler.js";

const DEBUG_LOG_PROP = "mb_av_debug_log";
const DEBUG_LOG_MASK_PROP = "mb_av_debug_log_mask";

export const AV_DEBUG_LOG_CAT = {
    SCANS: 1,
    ACTIVATION: 2,
    BUILD: 4,
    SUCCESS: 8,
    FAILURES: 16,
    LAMP: 32
};

export const AV_DEBUG_LOG_ALL =
    AV_DEBUG_LOG_CAT.SCANS |
    AV_DEBUG_LOG_CAT.ACTIVATION |
    AV_DEBUG_LOG_CAT.BUILD |
    AV_DEBUG_LOG_CAT.SUCCESS |
    AV_DEBUG_LOG_CAT.FAILURES |
    AV_DEBUG_LOG_CAT.LAMP;

export const AV_DEBUG_LOG_DEFAULT = AV_DEBUG_LOG_ALL & ~AV_DEBUG_LOG_CAT.SCANS;

/**
 * @returns {boolean}
 */
export function isAvContentLogEnabled() {
    try {
        const v = getWorldProperty(DEBUG_LOG_PROP);
        if (v === undefined || v === null) return true;
        if (v === false || v === 0 || v === "0") return false;
        return true;
    } catch {
        return true;
    }
}

/**
 * @returns {number}
 */
function getAvDebugLogMask() {
    try {
        const v = getWorldProperty(DEBUG_LOG_MASK_PROP);
        if (v === undefined || v === null) return AV_DEBUG_LOG_DEFAULT;
        const n = Number(v);
        return Number.isFinite(n) ? n & AV_DEBUG_LOG_ALL : AV_DEBUG_LOG_DEFAULT;
    } catch {
        return AV_DEBUG_LOG_DEFAULT;
    }
}

/**
 * @param {number} cat
 * @returns {boolean}
 */
function isAvLogCategoryEnabled(cat) {
    if (!isAvContentLogEnabled()) {
        return cat === AV_DEBUG_LOG_CAT.FAILURES;
    }
    return (getAvDebugLogMask() & cat) !== 0;
}

/**
 * Build / presence / join-leave lines (respects master switch + Build category).
 * @param {string} msg
 */
export function avLogBuildLine(msg) {
    if (!isAvLogCategoryEnabled(AV_DEBUG_LOG_CAT.BUILD)) return;
    try {
        console.warn(`[ABANDONED VILLAGE] ${msg}`);
    } catch {
        /* ignore */
    }
}
