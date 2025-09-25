import { world, system } from "@minecraft/server";
import { getCodex, saveCodex } from "./mb_codex.js";

// Minimal dynamic property test (must be delayed until after startup)
// system.run(() => {
//     try {
//         world.setDynamicProperty("mb_test_number", 123);
//         const testValue = world.getDynamicProperty("mb_test_number");
//         if (testValue === 123) {
//             console.warn("[MBI] Dynamic property test succeeded: mb_test_number = 123");
//         } else {
//             console.warn("[MBI] Dynamic property test failed: value is", testValue);
//         }
//     } catch (err) {
//         console.warn("[MBI] ERROR: Dynamic properties are not working!", err);
//     }
// });

// Debug logging
console.log("📜 Maple Bear Day Tracker script loaded");

// Constants
const TICKS_PER_DAY = 24000;
const TICK_STORAGE_KEY = "mb_tick_counter";
const INITIALIZED_FLAG = "mb_day_tracker_initialized";
const DAY_COUNT_KEY = "mb_day_count";
const SCOREBOARD_NAME = "mb_day_tracker";
const DAY_SCORE_ID = "current_day";
const MILESTONE_DAYS = [2, 4, 8, 13]; // Tiny Maple Bears, Infected Maple Bears, Buff Maple Bears, Day 13 variants

// Scoreboard
const SCOREBOARD_OBJECTIVE = "mb_days";
const SCOREBOARD_ID = "mb_day_counter";
const LOOP_RUNNING_FLAG = "mb_day_loop_running";

// Track time of day for sunrise detection
let lastTimeOfDay = 0;

// Track players who have received their welcome message
const welcomedPlayers = new Set();

// Track players who have joined before (for first-time welcome message)
const returningPlayers = new Set();

// Track if the loop is running
let dayCycleLoopId = null;

/**
 * Get the color code and hazard symbols for a given day
 * @param {number} day The current day
 * @returns {object} Object with color and symbols
 */
function getDayDisplayInfo(day) {
    if (day < 2) {
        // Days 0-1: Green, no hazard symbols
        return { color: "§a", symbols: "" };
    } else if (day < 4) {
        // Days 2-3: Yellow, 1 warning symbol (tiny Maple Bears start)
        return { color: "§e", symbols: "!" };
    } else if (day < 8) {
        // Days 4-7: Orange, 2 warning symbols (infected Maple Bears start)
        return { color: "§6", symbols: "!!" };
    } else {
        // Day 8+: Red, 3 warning symbols (buff Maple Bears start)
        return { color: "§c", symbols: "!!!" };
    }
}

/**
 * Get custom welcome message for returning players based on current day
 * @param {number} day The current day
 * @returns {object} Object with message, title, and actionbar text
 */
function getReturningPlayerWelcome(day) {
    if (day < 2) {
        // Days 0-1: Before Maple Bears spawn
        return {
            message: "§aWelcome back to your normal world...",
            title: "§aWelcome Back!",
            actionbar: "Everything is still peaceful here..."
        };
    } else if (day < 4) {
        // Days 2-3: Tiny Maple Bears have started spawning
        return {
            message: "§eWelcome back! The tiny ones have emerged...",
            title: "§e! Day " + day,
            actionbar: "Small Maple Bears roam the land..."
        };
    } else if (day < 8) {
        // Days 4-7: Normal infected Maple Bears have started spawning
        return {
            message: "§6Welcome back! The infection spreads...",
            title: "§6!! Day " + day,
            actionbar: "Infected Maple Bears are growing in number..."
        };
    } else {
        // Day 8+: Buff Maple Bears have started spawning
        return {
            message: "§cWelcome back! The end draws near...",
            title: "§c!!! Day " + day,
            actionbar: "The most dangerous Maple Bears have arrived..."
        };
    }
}

/**
 * Gets a player by their ID
 * @param {string} playerId The ID of the player to find
 * @returns {Player|null} The player if found, null otherwise
 */
function getPlayerById(playerId) {
    return [...world.getPlayers()].find(p => p.id === playerId);
}

// Use playerJoin as a fallback for world initialization in 1.21+
let hasInitialized = false;
world.afterEvents.playerJoin.subscribe(() => {
    if (!hasInitialized) {
        console.log("🌍 First player joined, initializing day tracker");
        welcomedPlayers.clear();
        hasInitialized = true;
    }
});

/**
 * Get sound based on infection level (day)
 * @param {number} day The current day
 * @returns {object} Sound configuration
 */
function getInfectionSound(day) {
    if (day < 2) {
        // Days 0-1: Peaceful sounds
        return { sound: "random.levelup", pitch: 1.2, volume: 0.6 };
    } else if (day < 4) {
        // Days 2-3: Slightly ominous
        return { sound: "mob.enderman.portal", pitch: 0.8, volume: 0.5 };
    } else if (day < 8) {
        // Days 4-7: More threatening
        return { sound: "mob.wither.ambient", pitch: 0.7, volume: 0.6 };
    } else {
        // Day 8+: Full threat
        return { sound: "mob.wither.spawn", pitch: 0.6, volume: 0.7 };
    }
}

/**
 * Get color-coded infection messages based on world state
 * @param {string} type The infection type ("bear" or "snow")
 * @param {string} level The message level ("hit", "infected", "severe")
 * @returns {string} The color-coded message
 */
export function recordDailyEvent(player, day, event) {
    try {
        const codex = getCodex(player);
        if (!codex.dailyEvents) {
            codex.dailyEvents = {};
        }
        if (!codex.dailyEvents[day]) {
            codex.dailyEvents[day] = [];
        }
        codex.dailyEvents[day].push(event);
        saveCodex(player, codex);
    } catch (error) {
        console.warn("Error recording daily event:", error);
    }
}

export function checkDailyEventsForAllPlayers() {
    try {
        const currentDay = getCurrentDay();
        
        // Record events one day after they occur (reflection on previous day)
        const dayToRecord = currentDay - 1;
        
        if (dayToRecord <= 0) return; // No events to record for day 0 or negative days
        
        const events = [];
        
        // Day 2: Tiny Maple Bears start spawning
        if (dayToRecord === 2) {
            events.push("Tiny Maple Bears began appearing in the world. The infection spreads...");
        }
        
        // Day 4: Normal Infected Maple Bears start spawning
        if (dayToRecord === 4) {
            events.push("Larger, more dangerous Infected Maple Bears have emerged. The situation grows dire.");
        }
        
        // Day 8: Buff Maple Bears start spawning
        if (dayToRecord === 8) {
            events.push("Massive Buff Maple Bears now roam the land. The infection has reached a critical stage.");
        }
        
        // Day 5: Day 4+ variants unlock (reflection on day 4)
        if (dayToRecord === 5) {
            events.push("New variants of the Maple Bears have been observed. They appear stronger and more aggressive than before.");
        }
        
        // Day 9: Day 8+ variants unlock (reflection on day 8)
        if (dayToRecord === 9) {
            events.push("The most dangerous Maple Bear variants yet have been documented. The infection continues to evolve.");
        }
        
        // Day 13: Day 13+ variants start spawning
        if (dayToRecord === 13) {
            events.push("The infection has increased to new heights. Powerful variants are beginning to emerge.");
        }
        
        // Day 14: Day 13+ variants unlock (reflection on day 13)
        if (dayToRecord === 14) {
            events.push("The most advanced Maple Bear variants have been observed. The infection has reached unprecedented levels.");
        }
        
        // Record events for all players if any events occurred
        if (events.length > 0) {
            const eventText = events.join(" ");
            for (const player of world.getAllPlayers()) {
                if (player && player.isValid()) {
                    const codex = getCodex(player);
                    // Only record if we haven't already recorded for this day
                    if (!codex.dailyEvents || !codex.dailyEvents[dayToRecord]) {
                        recordDailyEvent(player, dayToRecord, eventText);
                    }
                }
            }
        }
        
    } catch (error) {
        console.warn("Error checking daily events for all players:", error);
    }
}


export function getInfectionMessage(type, level = "normal") {
    const currentDay = getCurrentDay();
    
    // Early days (0-3): Calm, mysterious
    if (currentDay < 4) {
        const earlyMessages = {
            bear: {
                hit: "§7Something brushes against you...",
                infected: "§7You feel a strange presence...",
                severe: "§8The shadows seem to follow you..."
            },
            snow: {
                hit: "§7A cold sensation spreads through you...",
                infected: "§7You feel drawn to something...",
                severe: "§8The craving grows stronger..."
            }
        };
        return earlyMessages[type]?.[level] || earlyMessages[type]?.infected || "§7Something feels different...";
    }
    
    // Mid days (4-7): More direct, concerning
    else if (currentDay < 8) {
        const midMessages = {
            bear: {
                hit: "§eYou were struck by something unnatural!",
                infected: "§6You start to feel off...",
                severe: "§cThe infection spreads through your body..."
            },
            snow: {
                hit: "§eThe powder burns as it enters your system...",
                infected: "§6You start to feel funny...",
                severe: "§cThe substance takes hold of your mind..."
            }
        };
        return midMessages[type]?.[level] || midMessages[type]?.infected || "§6Something is wrong...";
    }
    
    // Late days (8+): Urgent, dangerous
    else {
        const lateMessages = {
            bear: {
                hit: "§cA Maple Bear attacks you!",
                infected: "§4You start to feel off...",
                severe: "§4The transformation begins..."
            },
            snow: {
                hit: "§cThe powder sears through your veins!",
                infected: "§4You start to feel funny...",
                severe: "§4The substance consumes your soul..."
            }
        };
        return lateMessages[type]?.[level] || lateMessages[type]?.infected || "§4You are in grave danger...";
    }
}

/**
 * Shows a title to a player with optional subtitle and timing
 * @param {Player} player The player to show the title to
 * @param {string|RawMessage} text The text to display as the title
 * @param {string|RawMessage} [subtitle] Optional subtitle
 * @param {object} [options] Optional TitleDisplayOptions (fadeInDuration, stayDuration, fadeOutDuration)
 * @param {number} [day] Optional day for sound selection
 */
function showPlayerTitle(player, text, subtitle = undefined, options = {}, day = null) {
    try {
        if (player && player.isValid) {
            const titleOptions = {
                fadeInDuration: options.fadeInDuration ?? 10,   // 0.5s
                stayDuration: options.stayDuration ?? 60,       // 3s
                fadeOutDuration: options.fadeOutDuration ?? 20, // 1s
            };
            if (subtitle !== undefined) {
                titleOptions.subtitle = subtitle;
            }
            player.onScreenDisplay.setTitle(text, titleOptions);
            
            // Use infection-based sound if day is provided
            if (day !== null) {
                const soundConfig = getInfectionSound(day);
                player.playSound(soundConfig.sound, { pitch: soundConfig.pitch, volume: soundConfig.volume });
            } else {
                // Default sound for backwards compatibility
                player.playSound("mob.wither.spawn", { pitch: 0.8, volume: 0.5 });
            }
        }
    } catch (error) {
        console.warn("Error showing title to player:", error);
    }
}

/**
 * Shows an actionbar message to a player
 * @param {Player} player The player to show the message to
 * @param {string|RawMessage} text The text to display
 */
function showPlayerActionbar(player, text) {
    try {
        if (player && player.isValid) {
            player.onScreenDisplay.setActionBar(text);
        }
    } catch (error) {
        console.warn("Error showing actionbar to player:", error);
    }
}

/**
 * Safely sends a message to a player
 * @param {Player} player The player to send the message to
 * @param {string|RawMessage} message The message to send
 */
function sendPlayerMessage(player, message) {
    try {
        if (player && player.isValid) {
            player.sendMessage(message);
        }
    } catch (error) {
        console.warn("Error sending message to player:", error);
    }
}

/**
 * Ensures the scoreboard exists and is initialized
 */
export function ensureScoreboardExists() {
    try {
        const exists = world.scoreboard.getObjective(SCOREBOARD_OBJECTIVE);
        if (!exists) {
            world.scoreboard.addObjective(SCOREBOARD_OBJECTIVE, "Maple Bear Days");
            const obj = world.scoreboard.getObjective(SCOREBOARD_OBJECTIVE);
            if (obj) {
                // Get the persisted day count or default to 1
                const currentDay = world.getDynamicProperty(DAY_COUNT_KEY) ?? 1;
                obj.setScore(SCOREBOARD_ID, currentDay);
            }
        }
    } catch (error) {
        console.warn("Error initializing scoreboard:", error);
        // Retry after a short delay
        system.runTimeout(() => {
            ensureScoreboardExists();
        }, 20); // Retry after 1 second
    }
}

/**
 * Gets the current day count
 * @returns {number} The current day count
 */
export function getCurrentDay() {
    try {
        const raw = world.getDynamicProperty(DAY_COUNT_KEY);
        const parsed = parseInt(raw);
        const day = isNaN(parsed) ? 0 : parsed; // Default to day 0
        return day;
    } catch (error) {
        console.warn("Error getting current day:", error);
        return 0; // Default to day 0 on error
    }
}

/**
 * Sets the current day count
 * @param {number} day The new day count
 */
export function setCurrentDay(day) {
    try {
        const safeDay = Math.max(0, Math.floor(day)); // Allow day 0

        // Update both storage methods
        world.setDynamicProperty(DAY_COUNT_KEY, safeDay);
        const obj = world.scoreboard.getObjective(SCOREBOARD_OBJECTIVE);
        if (obj) {
            obj.setScore(SCOREBOARD_ID, safeDay);
        } else {
            console.warn("Failed to get scoreboard objective for update");
        }
    } catch (error) {
        console.warn("Error setting current day:", error);
    }
}

/**
 * Checks if a day milestone has been reached
 * @param {number} day The current day
 * @returns {boolean} Whether this is a milestone day
 */
export function isMilestoneDay(day) {
    return MILESTONE_DAYS.includes(day);
}

/**
 * Starts the day cycle loop
 */
function startDayCycleLoop() {
    // Don't start if already running
    if (dayCycleLoopId !== null) {
        return;
    }

    console.log("Starting day cycle loop");
    let lastKnownDay = getCurrentDay();
    let lastTimeOfDay = world.getTimeOfDay();

    // Uncommented: day cycle loop to advance day on sunrise
    dayCycleLoopId = system.runInterval(() => {
        try {
            const currentTime = world.getTimeOfDay();
            // Detect sunrise (~1000 is safe for detection)
            if (lastTimeOfDay > 1000 && currentTime <= 1000) {
                let newDay = getCurrentDay() + 1;
                setCurrentDay(newDay);
                console.log(`🌅 New day detected: Day ${newDay}`);
                
                // Check for daily events to record (reflection on previous day)
                checkDailyEventsForAllPlayers();

                // Get display info for the new day
                const displayInfo = getDayDisplayInfo(newDay);
                
                // Notify players
                for (const player of world.getAllPlayers()) {
                    if (player && player.isValid) {
                        const soundConfig = getInfectionSound(newDay);
                        player.playSound(soundConfig.sound, {
                            pitch: soundConfig.pitch,
                            volume: soundConfig.volume
                        });
                        showPlayerTitle(player, `${displayInfo.color}${displayInfo.symbols} Day ${newDay}`, undefined, {}, newDay);
                        showPlayerActionbar(player, "The Maple Bear infection continues...");
                    }
                }

                // Send chat message for new day and world age
                const worldAge = world.getAbsoluteTime ? world.getAbsoluteTime() : world.getTime();
                world.sendMessage(`${displayInfo.color}${displayInfo.symbols} A new day begins... Day ${newDay} §7(World age: §b${worldAge}§7 ticks)`);

                // Handle milestone days
                if (isMilestoneDay(newDay)) {
                    mbiHandleMilestoneDay(newDay);
                }
            }

            lastTimeOfDay = currentTime;
        } catch (error) {
            console.warn("Error in day cycle loop:", error);
        }
    }, 40); // ~every 2 seconds

    // Mark that the loop is running
    world.setDynamicProperty(LOOP_RUNNING_FLAG, true);
    console.log("Day cycle loop started successfully");
}

/**
 * Handles milestone day events
 * @param {number} day The milestone day reached
 */
export async function mbiHandleMilestoneDay(day) {
    system.runTimeout(() => {
        try {
            // Broadcast milestone message
            world.sendMessage(`§8[MBI] §6Milestone reached: Day ${day}`);
            // Play milestone sound and show title for all players
            for (const player of world.getAllPlayers()) {
                try {
                    if (player && player.isValid) {
                        try {
                            // Use wither death for milestone (special occasion)
                            player.playSound("mob.wither.death", { pitch: 0.7, volume: 0.7 });
                        } catch (err) {
                            console.warn("[ERROR] in player.playSound:", err);
                        }
                        try {
                            showPlayerTitle(player, `§eDay ${day} Milestone!`, undefined, {}, day);
                        } catch (err) {
                            console.warn("[ERROR] in showPlayerTitle:", err);
                        }
                    }
                } catch (err) {
                    console.warn("[ERROR] in player milestone for-loop:", err);
                }
            }
            // Trigger specific milestone events
            switch (day) {
                case 2:
                    world.sendMessage(`§8[MBI] §eThe tiny ones have emerged...`);
                    break;
                case 4:
                    world.sendMessage(`§8[MBI] §6Who is that over there...?`);
                    break;
                case 8:
                    world.sendMessage(`§8[MBI] §cIf you see one, run.`);
                    break;
                case 13:
                    world.sendMessage(`§8[MBI] §4The infection has increased to new heights...`);
                    break;
            }
        } catch (error) {
            console.warn("[ERROR] in mbiHandleMilestoneDay:", error);
            if (error && error.stack) {
                console.warn("[ERROR STACK] mbiHandleMilestoneDay", error.stack);
            }
        }
    }, 80); // 4 seconds delay
}

/**
 * Initializes the day tracking system
 */
export async function initializeDayTracking() {
    try {
        // Check if we've already initialized
        if (world.getDynamicProperty(INITIALIZED_FLAG)) {
            console.log("Day tracking already initialized");
            return;
        }

        console.log("🌅 Initializing day tracking system...");

        // Set up scoreboard
        ensureScoreboardExists();

        // Get current day
        const currentDay = getCurrentDay();
        if (typeof currentDay !== 'number' || isNaN(currentDay)) {
            console.warn('[ERROR] getCurrentDay() did not return a valid number!');
        }

        // Get display info for the current day
        const displayInfo = getDayDisplayInfo(currentDay);
        
        // Play welcome sound and show title for all players
        for (const player of world.getAllPlayers()) {
            if (player && player.isValid) {
                system.run(() => {
                    // Use nice sound for world start
                    if (currentDay < 2) {
                        player.playSound("random.levelup", { pitch: 1.2, volume: 0.6 });
                        showPlayerTitle(player, "§aa completely normal world...", undefined, {}, currentDay);
                        showPlayerActionbar(player, "Everything seems peaceful here...");
                    } else {
                        // Use infection-based sound for progressed worlds
                        const soundConfig = getInfectionSound(currentDay);
                        player.playSound(soundConfig.sound, { pitch: soundConfig.pitch, volume: soundConfig.volume });
                        showPlayerTitle(player, `${displayInfo.color}${displayInfo.symbols} Day ${currentDay}`, undefined, {}, currentDay);
                        showPlayerActionbar(player, "The Maple Bear infection continues...");
                    }
                });
            }
        }

        // Show welcome message
        system.run(() => {
            world.sendMessage(`${displayInfo.color}${displayInfo.symbols} Welcome to Day ${currentDay}`);
        });

        // Mark as initialized
        system.run(() => {
            world.setDynamicProperty(INITIALIZED_FLAG, true);
        });

        // Start the day cycle loop
        system.run(() => {
            startDayCycleLoop();
        });

        // Check for milestone on first load
        if (typeof isMilestoneDay === 'function' && typeof mbiHandleMilestoneDay === 'function') {
            if (isMilestoneDay(currentDay)) {
                mbiHandleMilestoneDay(currentDay);
            }
        } else {
            console.warn('[ERROR] isMilestoneDay or mbiHandleMilestoneDay is not a function! Skipping milestone check.');
        }

        console.log("Day tracking system initialized successfully");
    } catch (error) {
        console.warn("[ERROR] in day tracking initialization:", error);
        if (error && error.stack) {
            console.warn("[ERROR STACK]", error.stack);
        }
        // Retry after a short delay
        system.runTimeout(async () => {
            await initializeDayTracking();
        }, 20);
    }
}

// Initialize when a player joins
world.afterEvents.playerJoin.subscribe((event) => {
    try {
        const playerId = event.playerId;

        if (!playerId) {
            console.warn("Join event has no playerId, skipping");
            return;
        }

        // Ensure day cycle loop is running
        if (dayCycleLoopId === null) {
            console.log("Day cycle loop not running, starting it now");
            startDayCycleLoop();
        }

        // Add a longer delay to ensure player is fully loaded and retry until available
        const tryWelcome = (retries = 20) => {
            try {
                const player = getPlayerById(playerId);
                if (!player) {
                    if (retries > 0) {
                        system.runTimeout(() => tryWelcome(retries - 1), 40);
                    }
                    return;
                }

                const playerName = player.name;

                // Load infection data from dynamic properties (import from main.js)
                try {
                    // This will be handled by the main.js player join handler
                    console.log(`[JOIN] Player ${playerName} joined, infection data will be loaded by main.js`);
                } catch (error) {
                    console.warn(`[JOIN] Error loading infection data: ${error}`);
                }

                // Check if this player has already been welcomed
                if (welcomedPlayers.has(playerName)) {
                    return;
                }

                const currentDay = getCurrentDay();

                                        // Check if this is the first time the world is being initialized
                        const isFirstTimeInit = !world.getDynamicProperty(INITIALIZED_FLAG);
                        const isFirstTimePlayer = !returningPlayers.has(playerName);

                        // Add an additional delay before showing messages
                        system.runTimeout(async () => {
                            try {
                                if (isFirstTimeInit) {
                                    console.log("First time world initialization");
                                    await initializeDayTracking();
                                    // initializeDayTracking already shows the welcome message
                                } else {
                                    // Show join message for subsequent joins
                                    const soundConfig = getInfectionSound(currentDay);
                                    player.playSound(soundConfig.sound, {
                                        pitch: soundConfig.pitch,
                                        volume: soundConfig.volume
                                    });
                                    
                                    if (isFirstTimePlayer) {
                                        // First-time player - show welcome message based on current day
                                        const displayInfo = getDayDisplayInfo(currentDay);
                                        if (currentDay < 2) {
                                            sendPlayerMessage(player, "§aWelcome to a completely normal world...");
                                            showPlayerTitle(player, "§aWelcome...", undefined, { stayDuration: 40 }, currentDay);
                                            showPlayerActionbar(player, "Everything seems peaceful here...");
                                        } else {
                                            sendPlayerMessage(player, `${displayInfo.color}${displayInfo.symbols} Welcome to Day ${currentDay}...`);
                                            showPlayerTitle(player, `${displayInfo.color}${displayInfo.symbols} Welcome...`, undefined, { stayDuration: 40 }, currentDay);
                                            showPlayerActionbar(player, "The Maple Bear infection continues...");
                                        }
                                        
                                        // Mark as returning player for future joins
                                        returningPlayers.add(playerName);
                                        
                                        // Show day info after a delay
                                        system.runTimeout(() => {
                                            const displayInfo = getDayDisplayInfo(currentDay);
                                            sendPlayerMessage(player, `${displayInfo.color}${displayInfo.symbols} It is currently Day ${currentDay}`);
                                            showPlayerTitle(player, `${displayInfo.color}${displayInfo.symbols} Day ${currentDay}`, undefined, {}, currentDay);
                                            showPlayerActionbar(player, "The Maple Bear infection continues...");
                                        }, 3000); // 3 second delay
                                    } else {
                                        // Returning player - just show the day
                                        const displayInfo = getDayDisplayInfo(currentDay);
                                        sendPlayerMessage(player, `${displayInfo.color}${displayInfo.symbols} Day ${currentDay}`);
                                        showPlayerTitle(player, `${displayInfo.color}${displayInfo.symbols} Day ${currentDay}`, undefined, {}, currentDay);
                                        showPlayerActionbar(player, "The Maple Bear infection continues...");
                                    }
                                }

                                // Mark player as welcomed
                                welcomedPlayers.add(playerName);
                            } catch (error) {
                                console.warn("Error in delayed welcome handler:", error);
                            }
                        }, 200); // 10 second delay for welcome messages
            } catch (error) {
                console.warn("Error in delayed player join handler:", error);
            }
        };
        system.runTimeout(() => tryWelcome(20), 80); // start after 4s, retry up to ~40s
    } catch (error) {
        console.warn("Error in player join event subscription:", error);
    }
});

// Clean up welcomed players when they leave
world.afterEvents.playerLeave.subscribe((event) => {
    try {
        const playerId = event.playerId;
        if (!playerId) {
            console.warn("Leave event has no playerId, skipping");
            return;
        }

        const player = getPlayerById(playerId);
        if (player) {
            welcomedPlayers.delete(player.name);
            // Note: We don't delete from returningPlayers to remember they've joined before
            console.log(`Cleaned up welcome status for player ${player.name}`);
        }
    } catch (error) {
        console.warn("Error in player leave handler:", error);
    }
});
