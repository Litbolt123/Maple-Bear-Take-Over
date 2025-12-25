// ============================================================================
// MAPLE BEAR DIMENSION ADAPTATION SYSTEM
// ============================================================================
// Applies dimension-specific adaptations to bears based on their day variant:
// - Nether: Bears spawn with fire resistance based on day variant
//   - Day 4 variants: No fire resistance
//   - Day 13 variants: Fire Resistance I (some immunity)
//   - Day 20+ variants: Fire Resistance III (complete immunity)
// ============================================================================

import { system, world } from "@minecraft/server";

// ============================================================================
// CONSTANTS
// ============================================================================

const ADAPTATION_CHECK_INTERVAL = 100; // Check every 100 ticks (5 seconds)
const FIRE_RESISTANCE_DURATION_PERMANENT = 2147483647; // Maximum duration (effectively permanent while in Nether)
const FIRE_RESISTANCE_DURATION_TEMPORARY = 400; // 20 seconds (400 ticks) for day 13 variants
const NETHER_TIME_PROPERTY = "mb_nether_time"; // Ticks spent in Nether
const DAY13_FIRE_RESISTANCE_THRESHOLD = 200; // Day 13 variants need 200 ticks (10 seconds) in Nether before getting fire resistance

// Bear entity type IDs grouped by fire resistance level
const BEAR_ENTITY_IDS = new Set([
    "mb:mb",
    "mb:mb_day4",
    "mb:mb_day8",
    "mb:mb_day13",
    "mb:mb_day20",
    "mb:infected",
    "mb:infected_day8",
    "mb:infected_day13",
    "mb:infected_day20",
    "mb:buff_mb",
    "mb:buff_mb_day13",
    "mb:buff_mb_day20",
    "mb:flying_mb",
    "mb:flying_mb_day15",
    "mb:flying_mb_day20",
    "mb:mining_mb",
    "mb:mining_mb_day20",
    "mb:torpedo_mb",
    "mb:torpedo_mb_day20"
]);

// Day 4 and earlier variants - No fire resistance
const DAY4_VARIANTS = new Set([
    "mb:mb",           // Day 2
    "mb:mb_day4",       // Day 4
    "mb:infected"       // Day 4
]);

// Day 8-17 variants (day 13 level) - Fire Resistance I (some immunity)
// Includes all variants that spawn between day 4 and day 20
const DAY13_VARIANTS = new Set([
    "mb:mb_day8",           // Day 8
    "mb:mb_day13",          // Day 13
    "mb:infected_day8",     // Day 8
    "mb:infected_day13",    // Day 13
    "mb:buff_mb",           // Day 13
    "mb:buff_mb_day13",     // Day 20 spawn but day13 variant
    "mb:flying_mb",         // Day 8
    "mb:flying_mb_day15",   // Day 15
    "mb:mining_mb",         // Day 15
    "mb:torpedo_mb"         // Day 17
]);

// Day 20+ variants - Fire Resistance III (complete immunity)
const DAY20_VARIANTS = new Set([
    "mb:mb_day20",
    "mb:infected_day20",
    "mb:buff_mb_day20",
    "mb:flying_mb_day20",
    "mb:mining_mb_day20",
    "mb:torpedo_mb_day20"
]);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an entity is a Maple Bear
 */
function isMapleBear(entity) {
    if (!entity || !entity.typeId) return false;
    return BEAR_ENTITY_IDS.has(entity.typeId);
}

/**
 * Get fire resistance level based on entity type (day variant)
 */
function getFireResistanceLevelForVariant(entityTypeId) {
    if (DAY20_VARIANTS.has(entityTypeId)) {
        return 3; // Complete immunity
    } else if (DAY13_VARIANTS.has(entityTypeId)) {
        return 1; // Some immunity (temporary)
    } else if (DAY4_VARIANTS.has(entityTypeId)) {
        return 0; // No immunity
    }
    // Default to no immunity for unknown variants
    return 0;
}

/**
 * Get nether time from entity dynamic property
 */
function getNetherTime(entity) {
    try {
        const timeStr = entity.getDynamicProperty(NETHER_TIME_PROPERTY);
        return timeStr ? parseInt(timeStr) : 0;
    } catch {
        return 0;
    }
}

/**
 * Set nether time on entity dynamic property
 */
function setNetherTime(entity, ticks) {
    try {
        entity.setDynamicProperty(NETHER_TIME_PROPERTY, ticks.toString());
    } catch {
        // Entity may be invalid, ignore
    }
}

/**
 * Apply fire resistance effect to entity
 */
function applyFireResistance(entity, level, isTemporary = false) {
    try {
        if (!entity.isValid()) return;
        const duration = isTemporary ? FIRE_RESISTANCE_DURATION_TEMPORARY : FIRE_RESISTANCE_DURATION_PERMANENT;
        entity.addEffect("fire_resistance", duration, {
            amplifier: level - 1, // Level 1 = amplifier 0, Level 3 = amplifier 2
            showParticles: false // Reduce visual clutter
        });
    } catch {
        // Entity may be invalid or effect may fail, ignore
    }
}

/**
 * Remove fire resistance effect from entity
 */
function removeFireResistance(entity) {
    try {
        if (!entity.isValid()) return;
        entity.removeEffect("fire_resistance");
    } catch {
        // Entity may be invalid, ignore
    }
}

// ============================================================================
// MAIN ADAPTATION LOOP
// ============================================================================

system.runInterval(() => {
    try {
        // Check all dimensions for bears
        const dimensions = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
        
        for (const dimId of dimensions) {
            try {
                const dimension = world.getDimension(dimId);
                const entities = dimension.getEntities();
                
                for (const entity of entities) {
                    if (!isMapleBear(entity)) continue;
                    if (!entity.isValid()) continue;
                    
                    const currentDimensionId = entity.dimension?.id || dimId;
                    const entityTypeId = entity.typeId;
                    
                    // Check if bear is in Nether
                    if (currentDimensionId === "minecraft:nether") {
                        const resistanceLevel = getFireResistanceLevelForVariant(entityTypeId);
                        
                        if (resistanceLevel === 3) {
                            // Day 20+ variants: Permanent fire resistance
                            applyFireResistance(entity, resistanceLevel, false);
                        } else if (resistanceLevel === 1) {
                            // Day 13 variants: Temporary fire resistance after spending time in Nether
                            let netherTime = getNetherTime(entity);
                            netherTime += ADAPTATION_CHECK_INTERVAL;
                            setNetherTime(entity, netherTime);
                            
                            // Only grant fire resistance after threshold time
                            if (netherTime >= DAY13_FIRE_RESISTANCE_THRESHOLD) {
                                // Apply temporary fire resistance (will expire and need refresh)
                                applyFireResistance(entity, resistanceLevel, true);
                            }
                        }
                        // Day 4 variants: No fire resistance (resistanceLevel === 0)
                    } else {
                        // Bear is not in Nether - remove fire resistance and reset time
                        removeFireResistance(entity);
                        setNetherTime(entity, 0); // Reset time when leaving Nether
                    }
                }
            } catch (error) {
                // Dimension may not exist or error accessing entities, continue
                continue;
            }
        }
    } catch (error) {
        // Global error - log but don't crash
        console.warn(`[DIMENSION ADAPTATION] Error in adaptation loop:`, error);
    }
}, ADAPTATION_CHECK_INTERVAL);

// ============================================================================
// INITIALIZE NEW BEARS
// ============================================================================

world.afterEvents.entitySpawn.subscribe((event) => {
    try {
        const entity = event.entity;
        if (!isMapleBear(entity)) return;
        
        // If spawning in Nether, initialize tracking
        const dimensionId = entity.dimension?.id;
        if (dimensionId === "minecraft:nether") {
            const entityTypeId = entity.typeId;
            const resistanceLevel = getFireResistanceLevelForVariant(entityTypeId);
            
            // Initialize nether time tracking
            setNetherTime(entity, 0);
            
            if (resistanceLevel === 3) {
                // Day 20+ variants: Immediately apply permanent fire resistance
                system.runTimeout(() => {
                    try {
                        if (entity.isValid() && entity.dimension?.id === "minecraft:nether") {
                            applyFireResistance(entity, resistanceLevel, false);
                        }
                    } catch {
                        // Entity may be invalid, ignore
                    }
                }, 5); // 5 tick delay
            }
            // Day 13 variants will get fire resistance after threshold time
            // Day 4 variants get no fire resistance
        }
    } catch {
        // Ignore errors during initialization
    }
});
