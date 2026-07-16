/**
 * RELEASE behavior pack — ship **only** `BP/` + `RP/` to players (CurseForge, etc.).
 *
 * When merging scripts from `BP - Dev/`, copy into `BP/scripts/` but **do not** overwrite this file
 * with the dev copy. Dev must keep `INCLUDE_FULL_DEVELOPER_TOOLS === true` in `BP - Dev/scripts/mb_buildConfig.js`.
 *
 * Gating (this file):
 * - `INCLUDE_FULL_DEVELOPER_TOOLS === false` → no Developer Tools / Debug menus.
 * - `INCLUDE_ADMIN_TOOLS === true` → journal **Host tools** only (`mb_cheats` / Litbolt123): capped storms/spawns.
 *
 * `BP - Dev/` is internal only — never publish it.
 */

export const BUILD_FLAVOR = "release";

/** MUST stay `false` on this pack. Full dev UI lives only in `BP - Dev/`. */
export const INCLUDE_FULL_DEVELOPER_TOOLS = false;

/** Dumbed-down journal Host tools on release; requires one-time disclaimer per player. */
export const INCLUDE_ADMIN_TOOLS = true;

/** Release admin: allowed `force_spawn` entity types (toy spawns only). */
export const RELEASE_ADMIN_FORCE_SPAWN_IDS = new Set([
    "mb:mb_day00",
    "mb:mb_day04",
    "mb:infected"
]);

/** Release admin: max bears per force-spawn action. */
export const RELEASE_ADMIN_FORCE_SPAWN_MAX = 3;

/** True on public `BP/` when only dumbed-down host tools should show (not full Developer Tools). */
export function isReleaseAdminBuild() {
    return INCLUDE_ADMIN_TOOLS && !INCLUDE_FULL_DEVELOPER_TOOLS;
}

export const ADDON_VERSION_MAJOR = 0;
export const ADDON_VERSION_MINOR = 9;
export const ADDON_VERSION_PATCH = 0;
/** Semver pre-release label, e.g. beta.1, beta.2 — keep in sync with `PLAYER_CHANGELOG_VERSION` and pack manifest descriptions. */
export const ADDON_VERSION_PRERELEASE = "beta.5";

/** In-game / Bridge export display name (release). */
export const PACK_DISPLAY_NAME = "The Maple Bear Apocalypse";

/** Dev pack label (used by tools/syncPackMetadata.js for BP - Dev / RP - Dev). */
export const PACK_DISPLAY_NAME_DEV = "The Maple Bear Apocalypse (Dev)";

/** Semver string for manifests, Bridge, changelogs — bump with ADDON_VERSION_* above. */
export function getAddonSemverString() {
    const core = `${ADDON_VERSION_MAJOR}.${ADDON_VERSION_MINOR}.${ADDON_VERSION_PATCH}`;
    return ADDON_VERSION_PRERELEASE ? `${core}-${ADDON_VERSION_PRERELEASE}` : core;
}

/** Manifest `header.version` as three integers (Bedrock has no prerelease field). */
export function getManifestVersionTriple() {
    return [ADDON_VERSION_MAJOR, ADDON_VERSION_MINOR, ADDON_VERSION_PATCH];
}

/**
 * Shown in Settings and disclaimer forms. Omits internal “release” word for public release builds.
 */
export function getAddonVersionDisplayString() {
    const v = `v${ADDON_VERSION_MAJOR}.${ADDON_VERSION_MINOR}.${ADDON_VERSION_PATCH}-${ADDON_VERSION_PRERELEASE}`;
    if (BUILD_FLAVOR === "dev") return `${v} (dev build)`;
    return `${v} (beta)`;
}

/** Public builds: silence noisy script logging (errors still pass through). Loaded early from main.js. */
try {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS && typeof globalThis !== "undefined") {
        const silent = function () {};
        const c = globalThis.console;
        if (c && typeof c.log === "function") {
            c.log = silent;
            c.info = silent;
            c.warn = silent;
            c.debug = silent;
        }
    }
} catch {
    /* ignore */
}
