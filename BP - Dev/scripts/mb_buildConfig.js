/**
 * DEV behavior pack — **not for public release.** Use for Bridge, playtests, and full journal dev menus.
 *
 * After syncing scripts from here into `BP/`, restore **this** file so
 * `INCLUDE_FULL_DEVELOPER_TOOLS` stays `true`. If this flag is ever `false` in `BP - Dev/`,
 * you are accidentally running the gated public build.
 *
 * Release twin: `BP/scripts/mb_buildConfig.js` (`INCLUDE_FULL_DEVELOPER_TOOLS === false`).
 */

export const BUILD_FLAVOR = "dev";

/** MUST stay `true` in `BP - Dev/`. Full Developer Tools + Debug + spawn/storm dev hubs. */
export const INCLUDE_FULL_DEVELOPER_TOOLS = true;

if (BUILD_FLAVOR === "dev" && !INCLUDE_FULL_DEVELOPER_TOOLS) {
    console.error(
        "[MBA] DEV PACK MISCONFIG: INCLUDE_FULL_DEVELOPER_TOOLS is false — journal will show Host tools only. Restore BP - Dev/scripts/mb_buildConfig.js."
    );
}

/** Dev build also has public-style Host tools preview toggle (optional); full dev is always on. */
export const INCLUDE_ADMIN_TOOLS = true;

export const RELEASE_ADMIN_FORCE_SPAWN_IDS = new Set([
    "mb:mb_day00",
    "mb:mb_day04",
    "mb:infected"
]);

export const RELEASE_ADMIN_FORCE_SPAWN_MAX = 3;

export function isReleaseAdminBuild() {
    return INCLUDE_ADMIN_TOOLS && !INCLUDE_FULL_DEVELOPER_TOOLS;
}

export const ADDON_VERSION_MAJOR = 0;
export const ADDON_VERSION_MINOR = 9;
export const ADDON_VERSION_PATCH = 0;
/** Semver pre-release label — keep in sync with `PLAYER_CHANGELOG_VERSION` and pack manifest descriptions. */
/** Dev-only patch on public beta.4 — Patreon Dev Beta 4.1 drop. */
export const ADDON_VERSION_PRERELEASE = "beta.4.1";

export const PACK_DISPLAY_NAME = "The Maple Bear Apocalypse";

export const PACK_DISPLAY_NAME_DEV = "The Maple Bear Apocalypse (Dev)";

export function getAddonSemverString() {
    const core = `${ADDON_VERSION_MAJOR}.${ADDON_VERSION_MINOR}.${ADDON_VERSION_PATCH}`;
    return ADDON_VERSION_PRERELEASE ? `${core}-${ADDON_VERSION_PRERELEASE}` : core;
}

export function getManifestVersionTriple() {
    return [ADDON_VERSION_MAJOR, ADDON_VERSION_MINOR, ADDON_VERSION_PATCH];
}

export function getAddonVersionDisplayString() {
    const v = `v${ADDON_VERSION_MAJOR}.${ADDON_VERSION_MINOR}.${ADDON_VERSION_PATCH}-${ADDON_VERSION_PRERELEASE}`;
    if (BUILD_FLAVOR === "dev") return `${v} (dev build)`;
    return `${v} (beta)`;
}

/** Public builds only: silence noisy script logging. No-op here because `INCLUDE_FULL_DEVELOPER_TOOLS` is true. */
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
