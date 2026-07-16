/**
 * Player-facing "what changed" text (journal + docs/PLAYER_CHANGELOG.md).
 * Bump PLAYER_CHANGELOG_VERSION when you edit bullets for a new beta.
 */

import {
    BUILD_FLAVOR,
    getAddonVersionDisplayString,
    PACK_DISPLAY_NAME,
    PACK_DISPLAY_NAME_DEV
} from "./mb_buildConfig.js";

export const PLAYER_CHANGELOG_VERSION = "0.9.0-beta.5";

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
        "§8• §7Camera: snow buzz, bear hits, torpedo & buff blasts — shorter pulses; sub-toggles in Settings",
        "§8• §7No blindness on your first bear hit; infection shake ramps near transform",
        "§8• §7Death clears active infection (fresh minor on respawn); minor cure does not make snow safe",
        "§8• §7Mining bears collect dirt & powder from infected ground",
        "§8• §7Day 0 perf + chunk travel: less hitch from spread work",
        "",
        "§8Full notes: §7docs/PLAYER_CHANGELOG.md · Patreon beta.5"
    ];
    return lines.join("\n");
}
