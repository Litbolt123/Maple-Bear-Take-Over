/**
 * Build flavor — DEV copy. Release twin: `BP/scripts/mb_buildConfig.js`.
 * Not for public distribution — use `BP/` for CurseForge / final releases.
 */

export const BUILD_FLAVOR = "dev";

export const INCLUDE_FULL_DEVELOPER_TOOLS = true;

export const INCLUDE_ADMIN_TOOLS = true;

export const ADDON_VERSION_MAJOR = 0;
export const ADDON_VERSION_MINOR = 9;
export const ADDON_VERSION_PATCH = 0;
export const ADDON_VERSION_PRERELEASE = "beta.1";

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
