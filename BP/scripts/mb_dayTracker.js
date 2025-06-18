import { world, system } from "@minecraft/server";

// Debug logging
console.warn("📜 Maple Bear Day Tracker script loaded");

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

// Clear welcomed players on world load to prevent persistence issues
world.afterEvents.worldInitialize.subscribe(() => {
    console.warn("🌍 World initialized, clearing welcomed players");
    welcomedPlayers.clear();
});

/**
 * Safely sends a message to a player
 * @param {Player} player The player to send the message to
 * @param {string} message The message to send
 */
function sendPlayerMessage(player, message) {
    try {
        if (player && player.isValid()) {
            player.sendMessage(message);
        }
    } catch (error) {
        console.warn("Error sending message to player:", error);
    }
}

/**
 * Shows a title to a player
 * @param {Player} player The player to show the title to
 * @param {string} text The text to display
 */
async function showPlayerTitle(player, text) {
    try {
        if (player && player.isValid()) {
            await player.runCommandAsync(`title @s title §6${text}`);
            // Play ominous sound for titles
            player.playSound("mob.wither.spawn", {
                pitch: 0.8,
                volume: 0.5
            });
        }
    } catch (error) {
        console.warn("Error showing title to player:", error);
    }
}

/**
 * Shows an actionbar message to a player
 * @param {Player} player The player to show the message to
 * @param {string} text The text to display
 */
async function showPlayerActionbar(player, text) {
    try {
        if (player && player.isValid()) {
            await player.runCommandAsync(`title @s actionbar §7${text}`);
        }
    } catch (error) {
        console.warn("Error showing actionbar to player:", error);
    }
}

/**
 * Ensures the scoreboard exists and is initialized
 */
export function ensureScoreboardExists() {
    try {
        const exists = world.scoreboard.getObjective(SCOREBOARD_OBJECTIVE);
        if (!exists) {
            console.warn("Creating scoreboard objective");
            world.scoreboard.addObjective(SCOREBOARD_OBJECTIVE, "Maple Bear Days");
            const obj = world.scoreboard.getObjective(SCOREBOARD_OBJECTIVE);
            if (obj) {
                // Get the persisted day count or default to 1
                const currentDay = world.getDynamicProperty(DAY_COUNT_KEY) ?? 1;
                console.warn(`Initializing scoreboard with day ${currentDay}`);
                obj.setScore(SCOREBOARD_ID, currentDay);
            } else {
                console.warn("Failed to get scoreboard objective after creation");
            }
        } else {
            console.warn("Scoreboard objective already exists");
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
        // console.warn(`Getting current day: ${day}`);
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
        // console.warn(`Setting day to ${safeDay}`);
        
        // Update both storage methods
        world.setDynamicProperty(DAY_COUNT_KEY, safeDay);
        const obj = world.scoreboard.getObjective(SCOREBOARD_OBJECTIVE);
        if (obj) {
            obj.setScore(SCOREBOARD_ID, safeDay);
            // console.warn(`Updated scoreboard to day ${safeDay}`);
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
        console.warn("Day cycle loop already running");
        return;
    }

    console.warn("Starting day cycle loop");
    let lastKnownDay = getCurrentDay();
    let lastTimeOfDay = world.getTimeOfDay();

    // Comment out day cycle loop to stop logging spam
    /*
    dayCycleLoopId = system.runInterval(() => {
        try {
            const currentTime = world.getTimeOfDay();
            // console.warn(`Day cycle check: currentTime=${currentTime}, lastTime=${lastTimeOfDay}`);

            // Detect sunrise (~1000 is safe for detection)
            if (lastTimeOfDay > 1000 && currentTime <= 1000) {
                let newDay = getCurrentDay() + 1;
                setCurrentDay(newDay);
                console.warn(`🌅 New day detected: Day ${newDay}`);

                // Notify players
                for (const player of world.getAllPlayers()) {
                    if (player && player.isValid()) {
                        player.playSound("mob.wither.hurt", {
                            pitch: 0.9,
                            volume: 0.4
                        });
                        showPlayerTitle(player, `☀️ Day ${newDay}`);
                        showPlayerActionbar(player, "The Maple Bear infection continues...");
                    }
                }

                // Send chat message for new day
                world.sendMessage(`§6☀️ A new day begins... Day §e${newDay}`);

                // Handle milestone days
                if (isMilestoneDay(newDay)) {
                    handleMilestoneDay(newDay);
                }
            }

            lastTimeOfDay = currentTime;
        } catch (error) {
            console.warn("Error in day cycle loop:", error);
        }
    }, 40); // ~every 2 seconds
    */

    // Mark that the loop is running
    world.setDynamicProperty(LOOP_RUNNING_FLAG, true);
    console.warn("Day cycle loop started successfully");
}

/**
 * Handles milestone day events
 * @param {number} day The milestone day reached
 */
export async function handleMilestoneDay(day) {
    try {
        // Broadcast milestone message
        world.sendMessage(`§8[MBI] §6Milestone reached: Day ${day}`);
        
        // Play milestone sound and show title for all players
        for (const player of world.getAllPlayers()) {
            if (player && player.isValid()) {
                player.playSound("mob.wither.death", {
                    pitch: 0.7,
                    volume: 0.7
                });
                await showPlayerTitle(player, `Day ${day} Milestone!`);
            }
        }
        
        // Trigger specific milestone events
        switch(day) {
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
        console.warn("Error handling milestone day:", error);
    }
}

/**
 * Initializes the day tracking system
 */
export async function initializeDayTracking() {
    try {
        // Check if we've already initialized
        if (world.getDynamicProperty(INITIALIZED_FLAG)) {
            console.warn("Day tracking already initialized");
            return;
        }

        console.warn("🌅 Initializing day tracking system...");
        
        // Set up scoreboard
        ensureScoreboardExists();

        // Get current day
        const currentDay = getCurrentDay();

        // Play welcome sound and show title for all players
        for (const player of world.getAllPlayers()) {
            if (player && player.isValid()) {
                player.playSound("mob.wither.ambient", {
                    pitch: 0.6,
                    volume: 0.6
                });
                await showPlayerTitle(player, `☀️ Day ${currentDay}`);
                await showPlayerActionbar(player, "The Maple Bear infection begins...");
            }
        }

        // Show welcome message
        world.sendMessage(`§6☀️ Welcome to Day §e${currentDay}`);

        // Mark as initialized
        world.setDynamicProperty(INITIALIZED_FLAG, true);

        // Start the day cycle loop
        startDayCycleLoop();

        // Check for milestone on first load
        if (isMilestoneDay(currentDay)) {
            await handleMilestoneDay(currentDay);
        }

        console.warn("Day tracking system initialized successfully");
    } catch (error) {
        console.warn("Error in day tracking initialization:", error);
        // Retry after a short delay
        system.runTimeout(() => {
            initializeDayTracking();
        }, 20);
    }
}

// Initialize when a player joins
world.afterEvents.playerJoin.subscribe((event) => {
    // console.warn("✅ playerJoin triggered");
    
    try {
        const playerId = event.playerId;
        // console.warn("Player join event data:", { playerId });
        
        if (!playerId) {
            console.warn("Join event has no playerId, skipping");
            return;
        }

        // Ensure day cycle loop is running
        if (dayCycleLoopId === null) {
            console.warn("Day cycle loop not running, starting it now");
            startDayCycleLoop();
        }

        // Add a longer delay to ensure player is fully loaded
        system.runTimeout(async () => {
            try {
                // console.warn(`Looking up player with ID ${playerId}`);
                const player = getPlayerById(playerId);
                
                if (!player) {
                    console.warn(`Could not find player with ID ${playerId}`);
                    return;
                }

                const playerName = player.name;
                // console.warn(`Found player: ${playerName}`);

                // Check if this player has already been welcomed
                if (welcomedPlayers.has(playerName)) {
                    // console.warn(`Player ${playerName} already welcomed`);
                    return;
                }

                const currentDay = getCurrentDay();
                // console.warn(`Welcoming player ${playerName} to day ${currentDay}`);

                // Check if this is the first time the world is being initialized
                const isFirstTimeInit = !world.getDynamicProperty(INITIALIZED_FLAG);
                
                // Add an additional delay before showing messages
                system.runTimeout(async () => {
                    try {
                        if (isFirstTimeInit) {
                            console.warn("First time world initialization");
                            await initializeDayTracking();
                            // initializeDayTracking already shows the welcome message
                        } else {
                            // Show normal join message for subsequent joins
                            player.playSound("mob.wither.ambient", {
                                pitch: 0.6,
                                volume: 0.6
                            });
                            sendPlayerMessage(player, `§6☀️ Welcome! It is currently Day §e${currentDay}`);
                            await showPlayerTitle(player, `☀️ Day ${currentDay}`);
                            await showPlayerActionbar(player, "The Maple Bear infection continues...");
                        }
                        
                        // Mark player as welcomed
                        welcomedPlayers.add(playerName);
                        // console.warn(`Successfully welcomed player ${playerName}`);
                    } catch (error) {
                        console.warn("Error in delayed welcome handler:", error);
                    }
                }, 200); // 10 second delay for welcome messages
            } catch (error) {
                console.warn("Error in delayed player join handler:", error);
            }
        }, 60); // Initial 3 second delay for player lookup
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
            console.warn(`Cleaned up welcome status for player ${player.name}`);
        }
    } catch (error) {
        console.warn("Error in player leave handler:", error);
    }
}); 