import { world, system } from "@minecraft/server";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";
import { getCodex, saveCodex, getKnowledgeLevel, hasKnowledge, checkKnowledgeProgression, getPlayerSoundVolume } from "./mb_codex.js";

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
const MILESTONE_DAYS = [2, 4, 8, 11, 13, 15, 17, 20, 25, 50, 75, 100]; // Tiny Maple Bears, Infected Maple Bears, Flying Bears (day 8), Day 11 transition, Buff Bears (day 13), Mining Bears, Torpedo Bears, Day 20 escalation, Day 25 victory, Day 50 milestone, Day 75 milestone, Day 100 milestone

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
export function getDayDisplayInfo(day) {
    const isMilestone = isMilestoneDay(day);
    let color = "§a"; // light green by default
    let exclamations = 0;

    if (day <= 2) {
        // Day 1-2: Safe period
        color = isMilestone ? "§a" : "§a"; // light green
        exclamations = 0;
    } else if (day <= 5) {
        // Day 3-5: Early escalation
        color = isMilestone ? "§2" : "§2"; // dark green (milestone days are same color but will be darker in display)
        exclamations = isMilestone ? 2 : 1;
    } else if (day <= 7) {
        // Day 6-7: Warning period
        color = isMilestone ? "§6" : "§e"; // milestone: amber/orange, normal: light yellow
        exclamations = isMilestone ? 3 : 2;
    } else if (day === 8) {
        // Day 8: Milestone - Flying bears arrive
        color = "§c"; // light red - milestone day (darker than normal)
        exclamations = 4;
    } else if (day <= 10) {
        // Day 9-10: Normal days after milestone - steadier color
        color = "§6"; // amber - steadier than milestone, gradually darkening
        exclamations = 3;
    } else if (day === 11) {
        // Day 11: Transition milestone - darker than normal days
        color = "§c"; // light red - milestone day (darker)
        exclamations = 4;
    } else if (day === 12) {
        // Day 12: Normal day - steadier color
        color = "§6"; // amber - steadier than milestone
        exclamations = 3;
    } else if (day === 13) {
        // Day 13: Milestone - Buff bears arrive
        color = "§c"; // light red - milestone day (darker)
        exclamations = 5;
    } else if (day === 14) {
        // Day 14: Normal day after milestone - steadier color
        color = "§6"; // amber - steadier than milestone
        exclamations = 4;
    } else if (day === 15) {
        // Day 15: Milestone - Mining bears
        color = "§c"; // light red - milestone day (darker)
        exclamations = 5;
    } else if (day === 16) {
        // Day 16: Normal day - steadier color, gradually darkening
        color = "§6"; // amber - steadier than milestone
        exclamations = 4;
    } else if (day === 17) {
        // Day 17: Milestone - Torpedo bears
        color = "§4"; // dark red - milestone day (darker than normal)
        exclamations = 5;
    } else if (day < 20) {
        // Day 18-19: Normal days - steadier color, gradually darkening toward red
        color = "§c"; // light red - steadier than milestone, gradually darkening
        exclamations = 4;
    } else if (day === 20) {
        // Day 20: Milestone - Major escalation
        color = "§4"; // dark red - milestone day (darker than normal)
        exclamations = 5;
    } else if (day < 25) {
        // Day 21-24: Normal days before victory - steadier color, gradually darkening
        color = "§c"; // light red - steadier than milestone, gradually darkening
        exclamations = 4;
    } else if (day === 25) {
        // Day 25: Victory milestone
        color = "§a"; // green for victory day
        exclamations = 0;
    } else if (day <= 50) {
        // Day 26-50: Post-victory gradient to day 50
        const progress = (day - 25) / 25; // 0 to 1 from day 25 to 50
        if (isMilestone && day === 50) {
            color = "§5"; // dark purple - milestone day 50 (darker than normal)
            exclamations = 8;
        } else {
            // Gradual gradient for normal days: light red → dark red → dark purple (steadier)
            if (progress < 0.33) {
                color = "§c"; // light red - steadier
                exclamations = 6;
            } else if (progress < 0.66) {
                color = "§4"; // dark red - gradually darkening
                exclamations = 7;
            } else {
                color = "§5"; // dark purple - gradually darkening
                exclamations = 7;
            }
        }
    } else if (day <= 75) {
        // Day 51-75: Gradient to day 75
        const progress = (day - 50) / 25; // 0 to 1 from day 50 to 75
        if (isMilestone && day === 75) {
            color = "§0"; // black - milestone day 75 (darker than normal)
            exclamations = 9;
        } else {
            // Gradual gradient for normal days: dark purple → darker (steadier)
            color = "§5"; // dark purple - steadier than milestone
            exclamations = Math.floor(7 + progress * 2); // 7 to 9
        }
    } else if (day <= 100) {
        // Day 76-100: Gradient to day 100
        const progress = (day - 75) / 25; // 0 to 1 from day 75 to 100
        if (isMilestone && day === 100) {
            color = "§0"; // black - milestone day 100 (maximum danger, darker)
            exclamations = 10;
        } else {
            // Gradual gradient for normal days: dark purple → black (steadier)
            if (progress < 0.5) {
                color = "§5"; // dark purple - steadier than milestone
                exclamations = 9;
            } else {
                color = "§0"; // black - gradually darkening
                exclamations = 9;
            }
        }
    } else {
        // Day 100+: Maximum danger
        color = "§0"; // black - maximum danger
        exclamations = 10;
    }

    return { color, symbols: "!".repeat(exclamations) };
}

/**
 * Get custom welcome message for returning players based on current day and knowledge
 * @param {number} day The current day
 * @param {Player} player The player to get knowledge from
 * @returns {object} Object with message, title, and actionbar text
 */
function getReturningPlayerWelcome(day, player) {
    // Validate player before calling getKnowledgeLevel
    if (!player) {
        return {
            message: "§7Welcome back to your world.",
            title: "§7Welcome Back",
            actionbar: "Everything seems peaceful here."
        };
    }

    const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
    const bearKnowledge = getKnowledgeLevel(player, 'bearLevel');

    if (day < 2) {
        // Days 0-1: Before Maple Bears spawn
        return {
            message: "§aWelcome back to your world...",
            title: "§aWelcome Back!",
            actionbar: "Everything seems peaceful here..."
        };
    } else if (day < 4) {
        // Days 2-3: Tiny Maple Bears have started spawning
        if (bearKnowledge >= 1) {
            return {
                message: "§eWelcome back! The tiny ones have emerged...",
                title: "§e! Day " + day,
                actionbar: "Small white bears roam the land..."
            };
        } else {
            return {
                message: "§eWelcome back... something feels different.",
                title: "§e! Day " + day,
                actionbar: "You sense something has changed..."
            };
        }
    } else if (day < 8) {
        // Days 4-7: Normal infected Maple Bears have started spawning
        if (infectionKnowledge >= 1) {
            return {
                message: "§6Welcome back! The infection spreads...",
                title: "§6!! Day " + day,
                actionbar: "Infected Maple Bears are growing in number..."
            };
        } else if (bearKnowledge >= 1) {
            return {
                message: "§6Welcome back! More dangerous creatures appear...",
                title: "§6!! Day " + day,
                actionbar: "Larger Maple Bears have emerged..."
            };
        } else {
            return {
                message: "§6Welcome back... the world grows more dangerous.",
                title: "§6!! Day " + day,
                actionbar: "Something ominous lurks nearby..."
            };
        }
    } else {
        // Day 8+: Flying Maple Bears have started spawning
        if (infectionKnowledge >= 2) {
            return {
                message: "§cWelcome back! The end draws near...",
                title: "§c!!! Day " + day,
                actionbar: "The most dangerous Maple Bears have arrived..."
            };
        } else if (infectionKnowledge >= 1) {
            return {
                message: "§cWelcome back! The situation has become critical...",
                title: "§c!!! Day " + day,
                actionbar: "Massive threats have emerged..."
            };
        } else {
            return {
                message: "§cWelcome back... darkness approaches.",
                title: "§c!!! Day " + day,
                actionbar: "You feel an overwhelming sense of dread..."
            };
        }
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
    if (day <= 2) {
        return { sound: "random.levelup", pitch: 1.2, volume: 0.6 };
    } else if (day <= 5) {
        return { sound: "mob.enderman.portal", pitch: 1.0, volume: 0.5 };
    } else if (day <= 7) {
        return { sound: "mob.enderman.portal", pitch: 0.85, volume: 0.6 };
    } else if (day <= 10) {
        return { sound: "mob.wither.ambient", pitch: 0.8, volume: 0.6 };
    } else if (day <= 13) {
        return { sound: "mob.wither.spawn", pitch: 0.75, volume: 0.65 };
    } else if (day <= 15) {
        return { sound: "mob.wither.spawn", pitch: 0.7, volume: 0.7 };
    } else if (day <= 17) {
        return { sound: "mob.wither.death", pitch: 0.7, volume: 0.8 };
    } else if (day === 25) {
        return { sound: "mob.player.levelup", pitch: 1.2, volume: 0.8 };
    } else if (day > 25) {
        // Post-victory: Escalating danger sounds
        const daysPastVictory = day - 25;
        if (daysPastVictory <= 5) {
            return { sound: "mob.wither.spawn", pitch: 0.7, volume: 0.8 };
        } else if (daysPastVictory <= 10) {
            return { sound: "mob.wither.spawn", pitch: 0.6, volume: 0.85 };
        } else if (daysPastVictory <= 20) {
            return { sound: "mob.wither.death", pitch: 0.5, volume: 0.9 };
        } else {
            return { sound: "mob.wither.death", pitch: 0.4, volume: 0.9 };
        }
    }
    return { sound: "ambient.weather.thunder", pitch: 0.6, volume: 0.9 };
}

/**
 * Get color-coded infection messages based on world state
 * @param {string} type The infection type ("bear" or "snow")
 * @param {string} level The message level ("hit", "infected", "severe")
 * @returns {string} The color-coded message
 */
export function recordDailyEvent(player, day, event, category = "general", codexOverride = null) {
    try {
        const codex = codexOverride ?? getCodex(player);
        if (!codex.dailyEvents) {
            codex.dailyEvents = {};
        }
        if (!codex.dailyEvents[day]) {
            codex.dailyEvents[day] = {};
        }

        // Initialize category array if it doesn't exist
        if (!codex.dailyEvents[day][category]) {
            codex.dailyEvents[day][category] = [];
        }

        // Avoid duplicate events
        if (!codex.dailyEvents[day][category].includes(event)) {
            codex.dailyEvents[day][category].push(event);
        }

        if (!codexOverride) {
            saveCodex(player, codex);
        }
    } catch (error) {
        console.warn("Error recording daily event:", error);
    }
}

export function checkDailyEventsForAllPlayers() {
    try {
        const currentDay = getCurrentDay();

        // Record events one day after they occur (reflection on previous day)
        const dayToRecord = currentDay - 1;

        console.log(`[DAILY EVENTS] Current Day: ${currentDay}, Recording events for Day: ${dayToRecord}`);

        if (dayToRecord <= 0) return; // No events to record for day 0 or negative days

        // Use the centralized milestone message function
        const milestoneMessage = getMilestoneMessage(dayToRecord);

        // Record events for all players if any events occurred
        if (milestoneMessage) {
            for (const player of world.getAllPlayers()) {
                if (player && player.isValid) {
                    try {
                        // Use recordDailyEvent for consistent categorized format
                        recordDailyEvent(player, dayToRecord, milestoneMessage, "general");
                        
                        // Play sound and send message for milestone days (like item discovery)
                        if (dayToRecord === 2 || dayToRecord === 4 || dayToRecord === 8 || dayToRecord === 11 || dayToRecord === 13 || dayToRecord === 15 || dayToRecord === 17) {
                            try {
                                // Play discovery sound
                                const volumeMultiplier = getPlayerSoundVolume(player);
                                player.playSound("mob.villager.idle", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
                                player.playSound("random.orb", { pitch: 1.5, volume: 0.8 * volumeMultiplier });

                                // Send discovery message
                                player.sendMessage("§7You feel your thoughts organizing... New insights about yesterday's events have been recorded in your mind.");
                            } catch (err) {
                                console.warn("[ERROR] in milestone discovery sound/message:", err);
                            }
                        }

                        console.log(`[DAILY EVENTS] Recorded Day ${dayToRecord} events for ${player.name}`);
                    } catch (error) {
                        console.warn(`[DAILY EVENTS] Failed to record events for ${player.name}:`, error);
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
 * Get the milestone message for a specific day
 * @param {number} day The day number
 * @returns {string} The milestone message
 */
function getMilestoneMessage(day) {
    switch (day) {
        case 1:
            return "The first day has passed. You've noticed strange changes in the world around you, though you can't quite put your finger on what's different.";
        case 2:
            return "You notice strange, tiny white bears beginning to emerge from the shadows. Their eyes seem to follow you wherever you go, and they leave behind a peculiar white dust wherever they step. These creatures appear to be drawn to larger animals, and you've witnessed them attacking and converting other creatures into more of their kind. The infection has begun its silent spread across the land.";
        case 4:
            return "The tiny bears have evolved into more dangerous variants. You've observed infected Maple Bears that are larger and more aggressive than their predecessors. These creatures seem to have developed a taste for corruption, actively seeking out and transforming other animals. The white dust they leave behind has become more concentrated, and you've noticed it seems to affect the very ground they walk on.";
        case 8:
            return "The sky is no longer safe. You've witnessed Maple Bears taking flight, soaring through the air with an unnatural grace. These flying variants can reach places that were once thought secure, and they seem to hunt from above with terrifying precision. The infection has learned to take to the skies.";
        case 11:
            return "The infection continues to evolve. More dangerous variants have appeared, and the threat grows with each passing day. The white dust spreads further, and the corrupted creatures become more aggressive.";
        case 13:
            return "A new threat has emerged - massive Buff Maple Bears that tower over their smaller counterparts. These behemoths are incredibly dangerous and seem to possess an intelligence that the smaller variants lack. They actively hunt larger creatures and have been observed coordinating attacks. The infection has reached a critical point, with these powerful variants capable of spreading the corruption at an alarming rate.";
        case 15:
            return "The ground beneath your feet is no longer safe. You've discovered Maple Bears that can dig through the earth itself, tunneling towards their targets with relentless determination. These mining variants can reach you even in the deepest underground bases, and they seem to work together, creating elaborate tunnel networks. Nowhere is truly hidden from the infection.";
        case 17:
            return "A new terror has emerged from the skies - torpedo-like Maple Bears that dive with devastating speed and force. These creatures strike from above with such velocity that they can break through almost any defense. They seem to target with an almost supernatural accuracy, as if they can sense your presence through walls. The infection has become a predator from every angle.";
        case 20:
            return "The world feels hushed, as if holding its breath. Day 20 bears walk like winter's final verdict, and the dust they shed clings to the air itself. Survivors whisper that the infection now remembers every step we've taken.";
        case 25:
            return "You have survived. Twenty-five days of relentless infection, of watching the world transform under the weight of white dust and corrupted creatures. You stand as proof that humanity can endure even when the very ground beneath your feet turns against you. But the infection does not rest. It will only grow stronger, more relentless. The challenge continues, but you have proven yourself a true survivor.";
        case 50:
            return "Fifty days. The infection has become something else entirely - a force of nature that reshapes reality itself. The white dust no longer simply covers the world; it has become the world. Every surface, every breath, every moment is tainted by its presence. The bears have evolved beyond recognition, and you wonder if you're still fighting an infection, or if you're fighting the world itself.";
        case 75:
            return "Seventy-five days. The boundary between infection and existence has blurred beyond recognition. The world remembers everything - every step, every death, every moment of hope. The bears move with a purpose that transcends mere hunger or aggression. They are architects of a new reality, and you are both witness and participant in this transformation. The question is no longer whether you can survive, but what you will become.";
        case 100:
            return "One hundred days. You have reached a milestone that few could even imagine. The world you knew is gone, replaced by something that defies understanding. The infection has achieved a kind of perfection - a complete integration with reality itself. You stand at the threshold of something new, something that has never existed before. The journey continues, but you have proven that even in the face of absolute transformation, something of what you were remains. You are a survivor. You are a witness. You are part of the story that will be told long after the last bear has moved on.";
        default:
            return `Day ${day} has passed. The infection continues to evolve, and the world grows more dangerous with each sunrise.`;
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

            // Use infection-based sound if day is provided (null = silent)
            if (day !== null && day !== undefined) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                const soundConfig = getInfectionSound(day);
                player.playSound(soundConfig.sound, { pitch: soundConfig.pitch, volume: soundConfig.volume * volumeMultiplier });
            }
            // If day is null/undefined, no sound plays (silent mode)
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
export function showPlayerActionbar(player, text) {
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
                const currentDay = getWorldProperty(DAY_COUNT_KEY) ?? 1;
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
        const raw = getWorldProperty(DAY_COUNT_KEY);
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
        setWorldProperty(DAY_COUNT_KEY, safeDay);
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
            const actualDay = getCurrentDay();
            
            // Check if day was manually changed (sync issue fix)
            // This handles cases where day is changed via dev tools/book
            if (actualDay !== lastKnownDay) {
                // Day was manually changed, update our tracking
                // Only log if it's a significant change (not just natural progression)
                if (Math.abs(actualDay - lastKnownDay) > 1 || (lastTimeOfDay <= 1000 && actualDay !== lastKnownDay + 1)) {
                    console.log(`📅 Day manually changed to: Day ${actualDay} (was Day ${lastKnownDay})`);
                }
                lastKnownDay = actualDay;
            }
            
            // Detect sunrise (~1000 is safe for detection)
            if (lastTimeOfDay > 1000 && currentTime <= 1000) {
                let newDay = getCurrentDay() + 1;
                setCurrentDay(newDay);
                lastKnownDay = newDay; // Update cached value
                console.log(`🌅 New day detected: Day ${newDay}`);

                // Check for daily events to record (reflection on previous day)
                checkDailyEventsForAllPlayers();

                // Get display info for the new day
                const displayInfo = getDayDisplayInfo(newDay);

                // Notify players
                for (const player of world.getAllPlayers()) {
                    if (player && player.isValid) {
                        const soundConfig = getInfectionSound(newDay);
                        const volumeMultiplier = getPlayerSoundVolume(player);
                        player.playSound(soundConfig.sound, {
                            pitch: soundConfig.pitch,
                            volume: soundConfig.volume * volumeMultiplier
                        });
                        
                        // Enhanced title for post-victory days
                        let titleText = `${displayInfo.color}${displayInfo.symbols} Day ${newDay}`;
                        if (newDay > 25) {
                            const daysPastVictory = newDay - 25;
                            titleText = `${displayInfo.color}${displayInfo.symbols} Day ${newDay} §7(+${daysPastVictory} past victory)`;
                        }
                        
                        showPlayerTitle(player, titleText, undefined, {}, newDay);
                        
                        // Enhanced actionbar messages
                        let actionbarText = "The Maple Bear infection continues...";
                        if (newDay > 25) {
                            const daysPastVictory = newDay - 25;
                            actionbarText = `§cThe infection intensifies... §7(${daysPastVictory} days past victory)`;
                        } else if (newDay === 25) {
                            actionbarText = "§aVictory achieved! But the infection persists...";
                        }
                        showPlayerActionbar(player, actionbarText);
                        
                        // Post-victory periodic warnings (every 5 days)
                        if (newDay > 25 && (newDay - 25) % 5 === 0) {
                            const daysPastVictory = newDay - 25;
                            player.sendMessage(`§c§l[WARNING] §r§cThe infection has grown ${daysPastVictory} days stronger since victory.`);
                            player.sendMessage(`§cThe world becomes more dangerous with each passing day.`);
                            const volumeMultiplier = getPlayerSoundVolume(player);
                            player.playSound("mob.wither.spawn", { pitch: 0.8, volume: 0.7 * volumeMultiplier });
                            
                            // Track achievement milestones
                            try {
                                const codex = getCodex(player);
                                if (!codex.achievements) {
                                    codex.achievements = {};
                                }
                                const milestoneKey = `day${newDay}Survived`;
                                if (!codex.achievements[milestoneKey]) {
                                    codex.achievements[milestoneKey] = true;
                                    codex.achievements.maxDaysSurvived = Math.max(codex.achievements.maxDaysSurvived || 25, newDay);
                                    saveCodex(player, codex);
                                }
                            } catch (error) {
                                console.warn("[MBI] Failed to track post-victory milestone:", error);
                            }
                        }
                    }
                }

                // Send chat message for new day
                const worldAge = world.getAbsoluteTime ? world.getAbsoluteTime() : world.getTime();
                console.log(`🌅 Day ${newDay} - World age: ${worldAge} ticks`);
                
                // Enhanced day message for post-victory
                if (newDay > 25) {
                    const daysPastVictory = newDay - 25;
                    world.sendMessage(`${displayInfo.color}${displayInfo.symbols} Day ${newDay} §7(+${daysPastVictory} past victory) - The infection intensifies...`);
                } else {
                    world.sendMessage(`${displayInfo.color}${displayInfo.symbols} A new day begins... Day ${newDay}`);
                }

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
    setWorldProperty(LOOP_RUNNING_FLAG, true);
    console.log("Day cycle loop started successfully");
}

/**
 * Handles milestone day events
 * @param {number} day The milestone day reached
 */
export function mbiHandleMilestoneDay(day) {
    system.runTimeout(() => {
        try {
            // Broadcast milestone message
            world.sendMessage(`§8[MBI] §6Milestone reached: Day ${day}`);
            // Play milestone sound, show title, and record in codex for all players
            for (const player of world.getAllPlayers()) {
                try {
                    if (player && player.isValid) {
                        try {
                            // Use wither death for milestone (special occasion)
                            const volumeMultiplier = getPlayerSoundVolume(player);
                            player.playSound("mob.wither.death", { pitch: 0.7, volume: 0.7 * volumeMultiplier });
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
                    world.sendMessage(`§8[MBI] §cThe sky is no longer safe. Flying Maple Bears have arrived.`);
                    break;
                case 13:
                    world.sendMessage(`§8[MBI] §cIf you see one, run.`);
                    break;
                case 20:
                    world.sendMessage(`§8[MBI] §7The air feels thin. Day 20 has settled in.`);
                    break;
                case 25:
                    world.sendMessage(`§8[MBI] §a§lVICTORY! §r§aYou have survived 25 days!`);
                    world.sendMessage(`§8[MBI] §7The infection continues, but you have proven yourself a true survivor.`);
                    break;
            }

            if (day === 20) {
                for (const player of world.getAllPlayers()) {
                    try {
                        const codex = getCodex(player);
                        if (!codex.journal) {
                            codex.journal = {};
                        }
                        if (!codex.journal.day20WorldLoreUnlocked) {
                            codex.journal.day20WorldLoreUnlocked = true;
                            const loreEntry = "Day 20 pressed down like a heavy frost. The journal insists the world remembers our missteps.";
                            recordDailyEvent(player, 20, loreEntry, "lore", codex);
                            saveCodex(player, codex);
                        } else {
                            saveCodex(player, codex);
                        }
                    } catch (error) {
                        console.warn("[MBI] Failed to mark Day 20 lore for player", error);
                    }
                }
            }

            // Day 25: Victory condition - celebrate but warn of continued difficulty
            if (day === 25) {
                for (const player of world.getAllPlayers()) {
                    try {
                        // Victory celebration
                        const volumeMultiplier = getPlayerSoundVolume(player);
                        player.playSound("mob.wither.death", { pitch: 0.5, volume: 0.8 * volumeMultiplier });
                        player.playSound("mob.player.levelup", { pitch: 1.2, volume: 0.8 * volumeMultiplier });
                        showPlayerTitle(player, `§a§lVICTORY!`, `§7You survived 25 days!`, { fadeInDuration: 20, stayDuration: 100, fadeOutDuration: 20 }, day);
                        
                        // Mark victory achievement
                        const codex = getCodex(player);
                        if (!codex.achievements) {
                            codex.achievements = {};
                        }
                        if (!codex.achievements.day25Victory) {
                            codex.achievements.day25Victory = true;
                            codex.achievements.day25VictoryDate = getCurrentDay();
                            saveCodex(player, codex);
                        }
                        
                        // Send victory message
                        player.sendMessage("§a§l═══════════════════════════════════");
                        player.sendMessage("§a§l  VICTORY ACHIEVED!");
                        player.sendMessage("§7  You have survived 25 days of infection.");
                        player.sendMessage("§7  The world recognizes your resilience.");
                        player.sendMessage("§c§l  WARNING:");
                        player.sendMessage("§c  The infection will only grow stronger.");
                        player.sendMessage("§c  Continue at your own risk.");
                        player.sendMessage("§a§l═══════════════════════════════════");
                    } catch (error) {
                        console.warn("[MBI] Failed to celebrate Day 25 victory for player", error);
                    }
                }
            }

            // Milestone spawn pulse removed - no forced spawning near players
        } catch (error) {
            console.warn("[ERROR] in mbiHandleMilestoneDay:", error);
            if (error && error.stack) {
                console.warn("[ERROR STACK] mbiHandleMilestoneDay", error.stack);
            }
        }
    }, 80); // 4 seconds delay
}

// --- Milestone spawn pulse ---
const MILESTONE_PULSE_FLAG_PREFIX = "mbi_milestone_pulse_"; // e.g. mbi_milestone_pulse_2

function hasMilestonePulseRun(day) {
    try {
        return !!getWorldProperty(MILESTONE_PULSE_FLAG_PREFIX + String(day));
    } catch { }
    return false;
}

function setMilestonePulseRun(day) {
    try {
        setWorldProperty(MILESTONE_PULSE_FLAG_PREFIX + String(day), true);
    } catch { }
}

function pickSpawnTypeForDay(day) {
    // Use base identifiers to avoid cross-module constants
    if (day >= 20) {
        return ["mb:mb_day20", "mb:infected_day20", "mb:buff_mb_day20"];
    }
    if (day >= 13) {
        // Prefer day 13 variants where available
        return ["mb:mb_day13", "mb:infected_day13", "mb:buff_mb_day13"];
    }
    if (day >= 8) {
        return ["mb:mb_day8", "mb:infected_day8", "mb:flying_mb"]; // flying bears now spawn on day 8 (was buff bears)
    }
    if (day >= 4) {
        return ["mb:mb_day4", "mb:infected"]; // no buff yet
    }
    // Day 2
    return ["mb:mb"]; // tiny bears only
}

function runMilestoneSpawnPulse(day) {
    // Only once per world per milestone
    if (hasMilestonePulseRun(day)) {
        return;
    }

    const types = pickSpawnTypeForDay(day);
    if (!types || types.length === 0) {
        setMilestonePulseRun(day);
        return;
    }

    // For each player, spawn a small, capped number of entities nearby
    const players = world.getAllPlayers();
    for (const player of players) {
        try {
            if (!player || !player.isValid) continue;

            const base = player.location;
            const dim = player.dimension;
            // Spawn up to 2 entities per player for lower spam
            const spawnsPerPlayer = Math.min(2, types.length);
            for (let i = 0; i < spawnsPerPlayer; i++) {
                const typeId = types[i % types.length];
                // Offset around player (no brightness/biome restrictions; they spawn everywhere)
                const angle = Math.random() * Math.PI * 2;
                const isBuff = typeId === "mb:buff_mb" || typeId === "mb:buff_mb_day13" || typeId === "mb:buff_mb_day20";
                const radius = isBuff ? (30 + Math.floor(Math.random() * 21)) : (8 + Math.floor(Math.random() * 7));
                const targetX = base.x + Math.cos(angle) * radius;
                const targetZ = base.z + Math.sin(angle) * radius;

                let spawnLoc = { x: targetX, y: base.y, z: targetZ };

                // Try to place on surface for buff (far and surface only). For others, prefer surface when available.
                const surface = findSurfaceLocation(dim, targetX, base.y, targetZ);
                if (surface && (isBuff || true)) {
                    spawnLoc = surface;
                } else if (isBuff) {
                    // If we couldn't find surface for buff, skip to avoid cave spawns
                    continue;
                }

                try {
                    dim.spawnEntity(typeId, spawnLoc);
                } catch { }
            }
        } catch { }
    }

    setMilestonePulseRun(day);
}

// Attempt to find a surface location near x,z by scanning downward from above the player
function findSurfaceLocation(dimension, x, baseY, z) {
    try {
        // Start above the player and scan downward for first solid-with-air-above
        const yStart = Math.min(255, Math.floor(baseY) + 40);
        for (let y = yStart; y >= 1; y--) {
            const below = dimension.getBlock({ x: Math.floor(x), y: y - 1, z: Math.floor(z) });
            const at = dimension.getBlock({ x: Math.floor(x), y: y, z: Math.floor(z) });
            if (!below || !at) continue;

            const belowId = safeBlockId(below);
            const atId = safeBlockId(at);

            const belowSolid = belowId && belowId !== "minecraft:air" && !isLiquid(belowId);
            const atAir = atId === "minecraft:air";
            if (belowSolid && atAir) {
                return { x, y, z };
            }
        }
    } catch { }
    return null;
}

function safeBlockId(block) {
    try { return block.typeId; } catch { return undefined; }
}

function isLiquid(typeId) {
    return typeId === "minecraft:water" || typeId === "minecraft:flowing_water" || typeId === "minecraft:lava" || typeId === "minecraft:flowing_lava";
}

/**
 * Initializes the day tracking system
 */
export function initializeDayTracking() {
    try {
        // Check if we've already initialized
        if (getWorldProperty(INITIALIZED_FLAG)) {
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

        // If world is on day 2 or later, ensure previous day events are recorded
        // This handles cases where a world loads on day 2+ but day 1 events weren't recorded
        if (currentDay >= 2) {
            const previousDay = currentDay - 1;
            // Check if previous day events exist for any player
            let needsBackfill = false;
            for (const player of world.getAllPlayers()) {
                if (player && player.isValid) {
                    const codex = getCodex(player);
                    if (!codex.dailyEvents || !codex.dailyEvents[previousDay]) {
                        needsBackfill = true;
                        break;
                    }
                }
            }
            
            // If previous day events don't exist, record them now
            if (needsBackfill) {
                console.log(`[DAILY EVENTS] Backfilling events for Day ${previousDay} (world loaded on Day ${currentDay})`);
                checkDailyEventsForAllPlayers();
            }
        }

        // Get display info for the current day
        const displayInfo = getDayDisplayInfo(currentDay);

        // Play welcome sound and show title for all players
        for (const player of world.getAllPlayers()) {
            if (player && player.isValid) {
                system.run(() => {
                    // Use nice sound for world start
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    if (currentDay < 2) {
                        player.playSound("random.levelup", { pitch: 1.2, volume: 0.6 * volumeMultiplier });
                        showPlayerTitle(player, "§aa completely normal world...", undefined, {}, currentDay);
                        showPlayerActionbar(player, "Everything seems peaceful here...");
                    } else {
                        // Use infection-based sound for progressed worlds
                        const soundConfig = getInfectionSound(currentDay);
                        player.playSound(soundConfig.sound, { pitch: soundConfig.pitch, volume: soundConfig.volume * volumeMultiplier });
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
            setWorldProperty(INITIALIZED_FLAG, true);
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
        system.runTimeout(() => {
            initializeDayTracking();
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
                const isFirstTimeInit = !getWorldProperty(INITIALIZED_FLAG);
                // Check if player has seen intro - if yes, they're a returning player (even if returningPlayers Set is empty after reload)
                const WORLD_INTRO_SEEN_PROPERTY = "mb_world_intro_seen";
                const introSeenRaw = getWorldProperty(WORLD_INTRO_SEEN_PROPERTY);
                const introSeen = introSeenRaw === true || introSeenRaw === "true" || introSeenRaw === 1 || introSeenRaw === "1";
                const isFirstTimePlayer = !introSeen && !returningPlayers.has(playerName);

                // Add an additional delay before showing messages
                system.runTimeout(() => {
                    try {
                        if (isFirstTimeInit) {
                            console.log("First time world initialization");
                            initializeDayTracking();
                            // initializeDayTracking already shows the welcome message
                        } else {
                            // Show join message for subsequent joins
                            if (isFirstTimePlayer) {
                                // First-time player - play sound now, show message after intro delay
                                const soundConfig = getInfectionSound(currentDay);
                                const volumeMultiplier = getPlayerSoundVolume(player);
                                player.playSound(soundConfig.sound, {
                                    pitch: soundConfig.pitch,
                                    volume: soundConfig.volume * volumeMultiplier
                                });
                                // Check if intro sequence is active or has been shown - if so, skip welcome message
                                // (intro sequence handles the welcome message)
                                // Also check if intro is currently in progress by waiting a bit longer
                                
                                // Wait additional time to ensure intro sequence has had time to start and mark itself
                                // The intro sequence takes about 15+ seconds total, so wait at least that long
                                system.runTimeout(() => {
                                    if (!player || !player.isValid) return;
                                    
                                    // Check again after delay - intro should be seen by now if it was shown
                                    const introSeenNow = getWorldProperty(WORLD_INTRO_SEEN_PROPERTY);
                                    
                                    if (!introSeenNow) {
                                        // Intro still hasn't been shown - this should be very rare, but skip welcome message anyway
                                        console.log(`[DAY TRACKER] Skipping welcome message for ${playerName} - intro hasn't been shown yet`);
                                        return;
                                    }
                                    
                                    // Intro has been shown - now safe to show day-based welcome message
                                    // But only if enough time has passed since intro (intro takes ~15 seconds)
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

                                    // Show day info after a delay (same format as returning players)
                                    system.runTimeout(() => {
                                        if (!player || !player.isValid) return;
                                        const displayInfo = getDayDisplayInfo(currentDay);
                                        sendPlayerMessage(player, `${displayInfo.color}${displayInfo.symbols} Day ${currentDay}`);
                                        showPlayerTitle(player, `${displayInfo.color}${displayInfo.symbols} Day ${currentDay}`, undefined, {}, currentDay);
                                        showPlayerActionbar(player, "The Maple Bear infection continues...");
                                    }, 3000); // 3 second delay
                                }, 400); // 20 second delay to ensure intro sequence is completely done (intro takes ~15 seconds)
                                
                                console.log(`[DAY TRACKER] Scheduling welcome message check for ${playerName} after intro sequence completes`);
                            } else {
                                // Returning player - show the day with proper sound immediately
                                const displayInfo = getDayDisplayInfo(currentDay);
                                sendPlayerMessage(player, `${displayInfo.color}${displayInfo.symbols} Day ${currentDay}`);
                                showPlayerTitle(player, `${displayInfo.color}${displayInfo.symbols} Day ${currentDay}`, undefined, {}, currentDay); // Use currentDay for proper infection sound
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
