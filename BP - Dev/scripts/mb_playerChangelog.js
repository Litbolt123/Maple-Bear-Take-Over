/**
 * Player-facing "what changed" text (journal + docs/PLAYER_CHANGELOG.md).
 * Bump PLAYER_CHANGELOG_VERSION when you edit bullets for a new beta.
 *
 * Dev pack only — public BP/scripts/mb_playerChangelog.js stays on beta.4 until store release.
 */

import {
    BUILD_FLAVOR,
    getAddonVersionDisplayString,
    PACK_DISPLAY_NAME,
    PACK_DISPLAY_NAME_DEV
} from "./mb_buildConfig.js";

export const PLAYER_CHANGELOG_VERSION = "0.9.0-beta.4.2";

/** Human label for journal What's new title (not raw semver). */
export function getPlayerChangelogDisplayLabel() {
    if (BUILD_FLAVOR === "dev") return "Dev Beta 4.2";
    const m = PLAYER_CHANGELOG_VERSION.match(/beta\.(\d+)(?:\.(\d+))?/);
    if (m) return m[2] ? `Beta ${m[1]}.${m[2]}` : `Beta ${m[1]}`;
    return PLAYER_CHANGELOG_VERSION;
}

/** @param {object} [codex] Player codex from getCodex() */
export function isPlayerChangelogUnread(codex) {
    const seen = codex?.journal?.whatsNewLastSeenVersion;
    return seen !== PLAYER_CHANGELOG_VERSION;
}

/** @returns {string} Formatted body for ActionFormData (Minecraft color codes). */
export function getPlayerChangelogBody() {
    const ver = getAddonVersionDisplayString();
    const label = getPlayerChangelogDisplayLabel();
    const packName = BUILD_FLAVOR === "dev" ? PACK_DISPLAY_NAME_DEV : PACK_DISPLAY_NAME;
    const lines = [
        `§e${packName}`,
        `§7${ver}`,
        "",
        `§6${label}`,
        "§7Highlights:",
        "§8• §7Snow buzz: camera wobble when you eat powder — stacks softer if you spam it",
        "§8• §7Infection shake: gentler day-to-day; ramps in the last ~30s before transform",
        "§8• §7Settings → Camera shake (infection + snow buzz)",
        "§8• §7Day 0 perf: village worldgen sleeps when you're far from sites/lamps",
        "§8• §7Script villages §cOFF§7 by default — §7Settings → Dev world features",
        "",
        "§8Full notes: §7docs/PLAYER_CHANGELOG.md · Patreon Dev Beta 4.2"
    ];
    return lines.join("\n");
}
