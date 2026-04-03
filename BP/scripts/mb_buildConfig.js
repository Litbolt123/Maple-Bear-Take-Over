/**
 * Build flavor — keep in sync when copying scripts between release (`BP/`) and dev (`BP - Dev/`).
 *
 * Public / CurseForge / “final” release: ship **only** this `BP/` + matching `RP/`. Keep
 * `INCLUDE_FULL_DEVELOPER_TOOLS === false` so no dev UI is reachable (dead code may remain for
 * parity with `BP - Dev/`; do not ship `BP - Dev/` to players).
 *
 * Admin tools (storms, force spawn, list bears) stay available when `INCLUDE_ADMIN_TOOLS` is true;
 * players must accept a separate in-game disclaimer once per player.
 */

export const BUILD_FLAVOR = "release";

/** Full Powdery Journal “Developer Tools” tree (risky / save-breaking). MUST stay false on public packs. */
export const INCLUDE_FULL_DEVELOPER_TOOLS = false;

/** Safer host shortcuts; still requires disclaimer on release builds. */
export const INCLUDE_ADMIN_TOOLS = true;

export const ADDON_VERSION_MAJOR = 0;
export const ADDON_VERSION_MINOR = 9;
export const ADDON_VERSION_PATCH = 0;
/** Semver pre-release label, e.g. beta.1, beta.2 */
export const ADDON_VERSION_PRERELEASE = "beta.1";

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
