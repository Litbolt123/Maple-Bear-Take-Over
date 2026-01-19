/**
 * Item Event Registry
 * Modular system for registering item consumption handlers
 * Based on Item Event Registry pattern from Bedrock Add-Ons Discord
 */

import { world } from "@minecraft/server";

// Registry: itemTypeId -> handler function
const itemHandlers = new Map();

// Module-scoped initialization state and subscription handle
let initialized = false;
let itemCompleteUseSubscription = null;

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
 * Safe to call multiple times - will no-op if already initialized
 */
export function initializeItemRegistry() {
    // Guard: no-op if already initialized
    if (initialized) {
        return;
    }
    
    itemCompleteUseSubscription = world.afterEvents.itemCompleteUse.subscribe((event) => {
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
    
    initialized = true;
}

/**
 * Dispose/unregister the item registry
 * Unsubscribes from itemCompleteUse event and cleans up state
 * Safe to call multiple times
 */
export function disposeItemRegistry() {
    if (itemCompleteUseSubscription) {
        itemCompleteUseSubscription.unsubscribe();
        itemCompleteUseSubscription = null;
    }
    initialized = false;
}

/**
 * Get all registered item types
 * @returns {Array<string>} Array of registered item type IDs
 */
export function getRegisteredItems() {
    return Array.from(itemHandlers.keys());
}
