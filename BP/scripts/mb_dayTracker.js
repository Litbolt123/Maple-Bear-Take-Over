import { world, system } from "@minecraft/server";

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
const MILESTONE_DAYS = [10, 25, 50, 75, 100];

// Scoreboard
const SCOREBOARD_OBJECTIVE = "mb_days";
const SCOREBOARD_ID = "mb_day_counter";
const LOOP_RUNNING_FLAG = "mb_day_loop_running";

// Track time of day for sunrise detection
let lastTimeOfDay = 0;

// Track players who have received their welcome message
const welcomedPlayers = new Set();

// Track if the loop is running
let dayCycleLoopId = null;

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
 * Shows a title to a player with optional subtitle and timing
 * @param {Player} player The player to show the title to
 * @param {string|RawMessage} text The text to display as the title
 * @param {string|RawMessage} [subtitle] Optional subtitle
 * @param {object} [options] Optional TitleDisplayOptions (fadeInDuration, stayDuration, fadeOutDuration)
 */
function showPlayerTitle(player, text, subtitle = undefined, options = {}) {
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
            player.playSound("mob.wither.spawn", { pitch: 0.8, volume: 0.5 });
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

                // Notify players
                for (const player of world.getAllPlayers()) {
                    if (player && player.isValid) {
                        player.playSound("mob.wither.hurt", {
                            pitch: 0.9,
                            volume: 0.4
                        });
                        showPlayerTitle(player, `§e☀️ Day ${newDay}`);
                        showPlayerActionbar(player, "The Maple Bear infection continues...");
                    }
                }

                // Send chat message for new day and world age
                const worldAge = world.getAbsoluteTime ? world.getAbsoluteTime() : world.getTime();
                world.sendMessage(`§6☀️ A new day begins... Day §e${newDay} §7(World age: §b${worldAge}§7 ticks)`);

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
                            player.playSound("mob.wither.death", { pitch: 0.7, volume: 0.7 });
                        } catch (err) {
                            console.warn("[ERROR] in player.playSound:", err);
                        }
                        try {
                            showPlayerTitle(player, `§eDay ${day} Milestone!`);
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
                case 10:
                    world.sendMessage(`§8[MBI] §7The first Maple Bear clones have been spotted...`);
                    break;
                case 25:
                    world.sendMessage(`§8[MBI] §7Reports of infected Maple Bears are increasing...`);
                    break;
                case 50:
                    world.sendMessage(`§8[MBI] §7The Buff Maple Bears have emerged...`);
                    break;
                case 75:
                    world.sendMessage(`§8[MBI] §7The infection is spreading rapidly...`);
                    break;
                case 100:
                    world.sendMessage(`§8[MBI] §4Maximum infection rate reached. The end is near...`);
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

        // Play welcome sound and show title for all players
        for (const player of world.getAllPlayers()) {
            if (player && player.isValid) {
                system.run(() => {
                    player.playSound("mob.wither.ambient", {
                        pitch: 0.6,
                        volume: 0.6
                    });
                    showPlayerTitle(player, `§e☀️ Day ${currentDay}`);
                    showPlayerActionbar(player, "The Maple Bear infection begins...");
                });
            }
        }

        // Show welcome message
        system.run(() => {
            world.sendMessage(`§6☀️ Welcome to Day §e${currentDay}`);
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

                // Add an additional delay before showing messages
                system.runTimeout(async () => {
                    try {
                        if (isFirstTimeInit) {
                            console.log("First time world initialization");
                            await initializeDayTracking();
                            // initializeDayTracking already shows the welcome message
                        } else {
                            // Show normal join message for subsequent joins
                            player.playSound("mob.wither.ambient", {
                                pitch: 0.6,
                                volume: 0.6
                            });
                            sendPlayerMessage(player, `§6☀️ Welcome! It is currently Day §e${currentDay}`);
                            showPlayerTitle(player, `§e☀️ Day ${currentDay}`);
                            showPlayerActionbar(player, "The Maple Bear infection continues...");
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
            console.log(`Cleaned up welcome status for player ${player.name}`);
        }
    } catch (error) {
        console.warn("Error in player leave handler:", error);
    }
}); 