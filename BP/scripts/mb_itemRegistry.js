/**
 * Item Event Registry
 * Modular system for registering item consumption handlers
 * Based on Item Event Registry pattern from Bedrock Add-Ons Discord
 */

import { world } from "@minecraft/server";

// Registry: itemTypeId -> handler function
const itemHandlers = new Map();

/**
 * Register a handler for an item type
 * @param {string} itemTypeId - The item type ID to handle
 * @param {Function} handler - Handler function: (player, itemStack) => void
 */
export function registerItemHandler(itemTypeId, handler) {
    if (typeof handler !== "function") {
        console.warn(`[ItemRegistry] Handler for ${itemTypeId} is not a function`);
        return;
    }
    itemHandlers.set(itemTypeId, handler);
}

/**
 * Unregister a handler for an item type
 * @param {string} itemTypeId - The item type ID to unregister
 */
export function unregisterItemHandler(itemTypeId) {
    itemHandlers.delete(itemTypeId);
}

/**
 * Initialize the item registry and subscribe to itemCompleteUse event
 * This should be called once during initialization
 */
export function initializeItemRegistry() {
    world.afterEvents.itemCompleteUse.subscribe((event) => {
        const player = event.source;
        const item = event.itemStack;
        
        if (!player || !item) return;
        
        const handler = itemHandlers.get(item.typeId);
        if (handler) {
            try {
                handler(player, item);
            } catch (error) {
                console.warn(`[ItemRegistry] Error in handler for ${item.typeId}:`, error);
            }
        }
    });
}

/**
 * Get all registered item types
 * @returns {Array<string>} Array of registered item type IDs
 */
export function getRegisteredItems() {
    return Array.from(itemHandlers.keys());
}
