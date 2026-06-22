/**
 * Shared abandoned-village distances (no imports — safe for notify/builder/sites).
 * Chebyshev distance from settlement center to nearest player.
 */

/** Construction HUD, build pause, and Village Complete witness band. */
export const SETTLEMENT_BUILD_PAUSE_DIST = 192;

/** Resume phased build (hysteresis below pause dist). */
export const SETTLEMENT_BUILD_RESUME_DIST = Math.max(128, SETTLEMENT_BUILD_PAUSE_DIST - 32);

/** Village Complete title only when a player is this close (stricter than pause band). */
export const SETTLEMENT_COMPLETE_WITNESS_DIST = SETTLEMENT_BUILD_RESUME_DIST;

/** “Paused until you return…” action bar after leaving construction HUD range (~10s @ 20 TPS). */
export const SETTLEMENT_HUD_PAUSED_LINGER_TICKS = 200;

/**
 * Action-bar “Generating…” only within this distance of the settlement center (Chebyshev).
 * Build pause still uses {@link SETTLEMENT_BUILD_PAUSE_DIST} and the lamp — the lamp can sit
 * far from center, so HUD must not follow you at the lamp after you leave the built area.
 */
export const SETTLEMENT_HUD_CENTER_DIST = 96;

/**
 * Only chunks within this Chebyshev distance of the nearest player must be loaded to run build ticks
 * (not the whole large-tier footprint — matches simulation distance).
 */
export const SETTLEMENT_CHUNK_SIM_CHECK_DIST = 80;

/**
 * Clean .mcstructure exports (saved without structure_block in the volume).
 * Skips runtime lamp-column scans and build cleanup phases that stripped export artifacts.
 */
export const SKIP_WORLDGEN_ARTIFACT_CLEANUP = true;
