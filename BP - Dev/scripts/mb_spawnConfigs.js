// ============================================================================
// Natural spawn tuning: per-type chances, caps, delays (single place to edit)
// ============================================================================

import {
    TINY_BEAR_ID,
    DAY4_BEAR_ID,
    DAY8_BEAR_ID,
    DAY13_BEAR_ID,
    DAY20_BEAR_ID,
    INFECTED_BEAR_ID,
    INFECTED_BEAR_DAY8_ID,
    INFECTED_BEAR_DAY13_ID,
    INFECTED_BEAR_DAY20_ID,
    BUFF_BEAR_ID,
    BUFF_BEAR_DAY13_ID,
    BUFF_BEAR_DAY20_ID,
    FLYING_BEAR_ID,
    FLYING_BEAR_DAY15_ID,
    FLYING_BEAR_DAY20_ID,
    MINING_BEAR_ID,
    MINING_BEAR_DAY20_ID,
    TORPEDO_BEAR_ID,
    TORPEDO_BEAR_DAY20_ID
} from "./mb_spawnEntityIds.js";

/** Natural spawn rules for each bear type (day ranges, chance curves, caps). */
export const SPAWN_CONFIGS = [
    {
        id: TINY_BEAR_ID,
        startDay: 2,
        endDay: Infinity, // Continues indefinitely - highest variant (DAY20_BEAR_ID) takes over at day 20
        baseChance: 0.14, // Increased from 0.12
        chancePerDay: 0.018, // Increased from 0.015
        maxChance: 0.65, // Increased from 0.6
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 2,
        maxCountCap: 8,
        delayTicks: 200,
        spreadRadius: 20
    },
    {
        id: DAY4_BEAR_ID,
        startDay: 4,
        endDay: Infinity, // Continues indefinitely - highest variant (DAY20_BEAR_ID) takes over at day 20
        baseChance: 0.34, // Increased from 0.3
        chancePerDay: 0.022, // Increased from 0.02
        maxChance: 0.56, // Increased from 0.5
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 2,
        maxCountCap: 7,
        delayTicks: 260,
        spreadRadius: 22
    },
    {
        id: INFECTED_BEAR_ID,
        startDay: 4,
        endDay: Infinity, // Continues indefinitely - highest variant (INFECTED_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.14, // Increased from 0.12
        chancePerDay: 0.018, // Increased from 0.015
        maxChance: 0.38, // Increased from 0.32
        baseMaxCount: 2,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 4,
        delayTicks: 320,
        spreadRadius: 24
    },
    {
        id: DAY8_BEAR_ID,
        startDay: 8,
        endDay: Infinity, // Continues indefinitely - highest variant (DAY20_BEAR_ID) takes over at day 20
        baseChance: 0.38, // Increased from 0.34
        chancePerDay: 0.022, // Increased from 0.02
        maxChance: 0.62, // Increased from 0.56
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 7,
        delayTicks: 320,
        spreadRadius: 25
    },
    {
        id: INFECTED_BEAR_DAY8_ID,
        startDay: 8,
        endDay: Infinity, // Continues indefinitely - highest variant (INFECTED_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.18, // Increased from 0.16
        chancePerDay: 0.018, // Increased from 0.015
        maxChance: 0.46, // Increased from 0.4
        baseMaxCount: 3,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 4,
        delayTicks: 340,
        spreadRadius: 26
    },
    {
        id: FLYING_BEAR_ID,
        startDay: 8, // Swapped: Now starts on day 8 (was day 11, where buff bears used to start)
        endDay: Infinity, // Continues indefinitely - highest variant (FLYING_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.12,
        chancePerDay: 0.015,
        maxChance: 0.38,
        baseMaxCount: 2,
        maxCountStep: 1,
        maxCountStepDays: 2,
        maxCountCap: 3,
        delayTicks: 360,
        spreadRadius: 30
    },
    {
        id: DAY13_BEAR_ID,
        startDay: 13,
        endDay: Infinity, // Continues indefinitely - highest variant (DAY20_BEAR_ID) takes over at day 20
        baseChance: 0.42, // Increased from 0.38
        chancePerDay: 0.028, // Increased from 0.025
        maxChance: 0.68, // Increased from 0.62
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 7,
        delayTicks: 360,
        spreadRadius: 27
    },
    {
        id: INFECTED_BEAR_DAY13_ID,
        startDay: 13,
        endDay: Infinity, // Continues indefinitely - highest variant (INFECTED_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.24, // Increased from 0.2
        chancePerDay: 0.018, // Increased from 0.015
        maxChance: 0.52, // Increased from 0.46
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 5,
        delayTicks: 380,
        spreadRadius: 28
    },
    {
        id: FLYING_BEAR_DAY15_ID,
        startDay: 15,
        endDay: Infinity, // Continues indefinitely - highest variant (FLYING_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.16,
        chancePerDay: 0.015,
        maxChance: 0.42,
        baseMaxCount: 3,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 4,
        delayTicks: 340,
        spreadRadius: 32
    },
    {
        id: MINING_BEAR_ID,
        startDay: 15,
        endDay: Infinity, // Continues indefinitely - highest variant (MINING_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.14,
        chancePerDay: 0.015,
        maxChance: 0.38,
        baseMaxCount: 1,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 2,
        delayTicks: 420,
        spreadRadius: 26
    },
    {
        id: BUFF_BEAR_ID,
        startDay: 13, // Swapped: Now starts on day 13 (was day 8, where flying bears used to start)
        endDay: Infinity, // Continues indefinitely - highest variant (BUFF_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.020, // Reduced from 0.032 (37.5% reduction)
        chancePerDay: 0.0015, // Reduced from 0.0025 (40% reduction)
        maxChance: 0.04, // Reduced from 0.06 (33% reduction)
        baseMaxCount: 1,
        maxCountCap: 1,
        delayTicks: 1200, // Increased from 900 (slower spawn rate)
        spreadRadius: 30
    },
    {
        id: BUFF_BEAR_DAY13_ID,
        startDay: 20, // Adjusted: Now starts on day 20 (was day 13, since buff_bear now takes that slot)
        endDay: Infinity, // Adjusted: Continues indefinitely (was day 19)
        baseChance: 0.018, // Reduced from 0.028 (36% reduction)
        chancePerDay: 0.0012, // Reduced from 0.002 (40% reduction)
        maxChance: 0.05, // Reduced from 0.07 (29% reduction)
        baseMaxCount: 1,
        maxCountCap: 2,
        delayTicks: 1500, // Increased from 1200 (slower spawn rate)
        spreadRadius: 32
    },
    {
        id: DAY20_BEAR_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.58, // Increased from 0.52
        chancePerDay: 0.028, // Increased from 0.025
        maxChance: 0.88, // Increased from 0.82
        baseMaxCount: 8, // Increased from 5
        maxCountStep: 2, // Increased from 1 - grows faster
        maxCountStepDays: 2, // Reduced from 3 - grows more frequently
        maxCountCap: 25, // Increased from 8 - much higher cap
        delayTicks: 340,
        spreadRadius: 28,
        lateRamp: {
            tierSpan: 5,
            chanceStep: 0.08,
            maxChance: 0.98, // Increased from 0.95
            capStep: 2, // Increased from 1 - cap grows faster
            capBonusMax: 5, // Increased from 3 - can grow more
            maxCountCap: 35 // Increased from 11 - huge late-game cap
        }
    },
    {
        id: INFECTED_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.38, // Increased from 0.32
        chancePerDay: 0.025, // Increased from 0.022
        maxChance: 0.72, // Increased from 0.62
        baseMaxCount: 7, // Increased from 4
        maxCountStep: 2, // Increased from 1 - grows faster
        maxCountStepDays: 2, // Reduced from 3 - grows more frequently
        maxCountCap: 14,
        delayTicks: 360,
        spreadRadius: 30,
        lateRamp: {
            tierSpan: 5,
            chanceStep: 0.06,
            maxChance: 0.88, // Increased from 0.82
            capStep: 2, // Increased from 1 - cap grows faster
            capBonusMax: 4, // Increased from 2 - can grow more
            maxCountCap: 22
        }
    },
    {
        id: BUFF_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.022, // Reduced from 0.035 (37% reduction)
        chancePerDay: 0.001, // Reduced from 0.0015 (33% reduction)
        maxChance: 0.045, // Reduced from 0.065 (31% reduction)
        baseMaxCount: 1,
        maxCountCap: 2,
        delayTicks: 1800, // Increased from 1400 (slower spawn rate)
        spreadRadius: 34,
        lateRamp: {
            tierSpan: 8,
            chanceStep: 0.015, // Reduced from 0.025 (40% reduction)
            maxChance: 0.06, // Reduced from 0.08 (25% reduction)
            capStep: 0,
            capBonusMax: 0,
            maxCountCap: 2
        }
    },
    {
        id: FLYING_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.20,
        chancePerDay: 0.015,
        maxChance: 0.48,
        baseMaxCount: 4,
        maxCountStep: 1,
        maxCountStepDays: 3,
        maxCountCap: 5,
        delayTicks: 320,
        spreadRadius: 34,
        lateRamp: {
            tierSpan: 6,
            chanceStep: 0.03,
            maxChance: 0.60,
            capStep: 1,
            capBonusMax: 2,
            maxCountCap: 8
        }
    },
    {
        id: MINING_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.16,
        chancePerDay: 0.015,
        maxChance: 0.40,
        baseMaxCount: 1,
        maxCountStep: 1,
        maxCountStepDays: 4,
        maxCountCap: 2,
        delayTicks: 420,
        spreadRadius: 28,
        lateRamp: {
            tierSpan: 6,
            chanceStep: 0.025,
            maxChance: 0.52,
            capStep: 0,
            capBonusMax: 0,
            maxCountCap: 2
        }
    },
    {
        id: TORPEDO_BEAR_ID,
        startDay: 17,
        endDay: Infinity, // Continues indefinitely - highest variant (TORPEDO_BEAR_DAY20_ID) takes over at day 20
        baseChance: 0.03, // Super rare - reduced from 0.10
        chancePerDay: 0.005, // Reduced from 0.018
        maxChance: 0.08, // Reduced from 0.34
        baseMaxCount: 1,
        maxCountStep: 0, // Never increase count
        maxCountStepDays: 999,
        maxCountCap: 1, // Always just 1
        delayTicks: 600, // Reduced spawn rate
        spreadRadius: 38
    },
    {
        id: TORPEDO_BEAR_DAY20_ID,
        startDay: 20,
        endDay: Infinity,
        baseChance: 0.04, // Super rare - reduced from 0.14
        chancePerDay: 0.006, // Reduced from 0.015
        maxChance: 0.12, // Reduced from 0.42
        baseMaxCount: 1,
        maxCountStep: 0, // Never increase count
        maxCountStepDays: 999,
        maxCountCap: 2, // Max 2 at day 20+
        delayTicks: 550, // Reduced spawn rate
        spreadRadius: 42,
        lateRamp: {
            tierSpan: 6,
            chanceStep: 0.01, // Reduced from 0.03
            maxChance: 0.18, // Reduced from 0.54
            capStep: 0,
            capBonusMax: 0,
            maxCountCap: 2
        }
    }
];

/** Display names for dev tools spawn type toggles (id -> label) */
export const SPAWN_CONFIG_DISPLAY_NAMES = {
    [TINY_BEAR_ID]: "Tiny (Day 0)",
    [DAY4_BEAR_ID]: "Tiny (Day 4)",
    [DAY8_BEAR_ID]: "Tiny (Day 8)",
    [DAY13_BEAR_ID]: "Tiny (Day 13)",
    [DAY20_BEAR_ID]: "Tiny (Day 20)",
    [INFECTED_BEAR_ID]: "Infected (Day 4)",
    [INFECTED_BEAR_DAY8_ID]: "Infected (Day 8)",
    [INFECTED_BEAR_DAY13_ID]: "Infected (Day 13)",
    [INFECTED_BEAR_DAY20_ID]: "Infected (Day 20)",
    [FLYING_BEAR_ID]: "Flying (Day 8)",
    [FLYING_BEAR_DAY15_ID]: "Flying (Day 15)",
    [FLYING_BEAR_DAY20_ID]: "Flying (Day 20)",
    [MINING_BEAR_ID]: "Mining (Day 15)",
    [MINING_BEAR_DAY20_ID]: "Mining (Day 20)",
    [BUFF_BEAR_ID]: "Buff (Day 13)",
    [BUFF_BEAR_DAY13_ID]: "Buff (Day 20)",
    [BUFF_BEAR_DAY20_ID]: "Buff (Day 20 max)",
    [TORPEDO_BEAR_ID]: "Torpedo (Day 17)",
    [TORPEDO_BEAR_DAY20_ID]: "Torpedo (Day 20)"
};
