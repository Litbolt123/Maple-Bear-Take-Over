/**
 * Player-facing "what changed" text (journal + docs/PLAYER_CHANGELOG.md).
 * Bump PLAYER_CHANGELOG_VERSION when you edit bullets for a new beta.
 *
 * Dev pack only — public BP/scripts/mb_playerChangelog.js stays on beta.4 until store release.
 */

import { getAddonVersionDisplayString } from "./mb_buildConfig.js";

export const PLAYER_CHANGELOG_VERSION = "0.9.0-beta.4.2";

/** @returns {string} Formatted body for ActionFormData (Minecraft color codes). */
export function getPlayerChangelogBody() {
    const ver = getAddonVersionDisplayString();
    const lines = [
        `§eM.B.A §7— §f${ver}`,
        "",
        "§7Dev Beta 4.2 highlights:",
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
