/**
 * Addon-wide chat color constants. Single source of truth for message colors.
 * No imports from other addon scripts (avoids circular dependencies).
 */

export const CHAT_ACHIEVEMENT = "§6";   // Gold - achievements (KO, first kill, etc.)
export const CHAT_DANGER = "§c";        // Red - infection, severe warnings
export const CHAT_DANGER_STRONG = "§4"; // Dark red - critical / highest severity
export const CHAT_SUCCESS = "§a";      // Green - cure, immunity, saved, unlock confirmed
export const CHAT_WARNING = "§e";      // Yellow - caution (ground wrong, immunity weakening)
export const CHAT_INFO = "§7";         // Gray - neutral info (hits left, journal hints)
export const CHAT_DEV = "§8";          // Dark gray - MBI/debug only
export const CHAT_HIGHLIGHT = "§f";    // White - names, numbers, emphasis within a line
export const CHAT_SPECIAL = "§b";       // Aqua/cyan - special emphasis (e.g. who shared, temp immunity)

/**
 * Optional helper: prefix a message with a color.
 * @param {string} msg - Plain message text
 * @param {string} color - Color code (e.g. CHAT_INFO)
 * @returns {string} color + msg
 */
export function chat(msg, color) {
    return (color || "") + (msg || "");
}
