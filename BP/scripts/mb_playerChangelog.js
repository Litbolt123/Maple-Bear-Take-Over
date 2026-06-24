/**
 * Player-facing "what changed" text (journal + docs/PLAYER_CHANGELOG.md).
 * Bump PLAYER_CHANGELOG_VERSION when you edit bullets for a new beta.
 *
 * DRAFT (next beta — do not ship until version bump):
 * See docs/PLAYER_CHANGELOG.md § Unreleased and docs/development/releases/UNRELEASED_DRAFT.md
 * - Performance: villages, chunk re-pass, day 0–1 spread, spawn auto-throttle
 * - Buff bears: near + dimension dual cap; no more stacking after leave/return
 * - Torpedo: ~5% duds (no death explosion)
 * - Mining: stair stall fix; more snow while digging
 */

import { getAddonVersionDisplayString } from "./mb_buildConfig.js";

export const PLAYER_CHANGELOG_VERSION = "0.9.0-beta.4";

/** @returns {string} Formatted body for ActionFormData (Minecraft color codes). */
export function getPlayerChangelogBody() {
    const ver = getAddonVersionDisplayString();
    const lines = [
        `§eMapleBear TakeOver §7— §f${ver}`,
        "",
        "§7Recent highlights:",
        "§8• §7Snow buzz: camera wobble when you eat powder — §eSettings §7→ camera shake",
        "§8• §7Infection shake: gentler day-to-day; ramps in the last ~30s before transform",
        "§8• §7Performance: smoother day 0–1 and village approach (spread work, smaller scans)",
        "§8• §7Buff bears: death explosion back; kills respect victim size",
        "§8• §7Buff cap on all paths — storms/conversions spawn infected when over limit",
        "§8• §7Storms: no double convert on bear kills; storm waves respect buff cap",
        "",
        "§8Full notes: §7see docs/PLAYER_CHANGELOG.md in the repo"
    ];
    return lines.join("\n");
}
