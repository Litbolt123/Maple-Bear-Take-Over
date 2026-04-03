/**
 * Simple Item Finder with Priority Search
 * Priority-based search system for locating items in player equipment and inventory
 * Based on Simple Item Finder by Kodi
 */

/**
 * Find an item in player's inventory/equipment with priority search
 * @param {Object} config - Configuration object
 * @param {Entity} config.source - The entity (player) to search
 * @param {string} config.target - The item type ID to find
 * @param {Array<string>} config.priority - Priority order: ['Offhand', 'Mainhand', 'Head', 'Chest', 'Legs', 'Feet', 'hotbar', 'inventory']
 * @returns {Object|null} Object with item and slot info, or null if not found
 */
export function findItem(config) {
    const {
        source,
        target,
        priority = ['Offhand', 'Mainhand', 'Head', 'Chest', 'Legs', 'Feet', 'hotbar', 'inventory']
    } = config;

    if (!source) return null;

    const EQUIPMENT_SLOTS = {
        Head: 0,
        Chest: 1,
        Legs: 2,
        Feet: 3,
        Mainhand: 4,
        Offhand: 5
    };

    for (const method of priority) {
        if (!source) continue;

        if (method === 'hotbar' || method === 'inventory') {
            const inventory = source.getComponent('inventory')?.container;
            if (!inventory) continue;

            const start = method === 'hotbar' ? 0 : 9;
            const end = method === 'hotbar' ? 9 : inventory.size;

            for (let slot = start; slot < end; slot++) {
                try {
                    const item = inventory.getItem(slot);
                    if (item?.typeId === target) {
                        return { item, slot: { type: method, value: slot } };
                    }
                } catch (e) {
                    // Slot doesn't exist, continue
                    continue;
                }
            }
        } else {
            // Equipment slot
            try {
                const equipment = source.getComponent('equippable')?.getEquipment(method);
                if (!equipment) continue;

                if (equipment.typeId === target) {
                    return { 
                        item: equipment, 
                        slot: { type: 'equipment', value: EQUIPMENT_SLOTS[method] } 
                    };
                }
            } catch (e) {
                // Equipment slot not available, continue
                continue;
            }
        }
    }

    return null;
}

/**
 * Check if player has an item (simpler boolean check)
 * @param {Entity} source - The entity (player) to check
 * @param {string} target - The item type ID to find
 * @param {Array<string>} priority - Optional priority order
 * @returns {boolean} True if item is found
 */
export function hasItem(source, target, priority) {
    return findItem({ source, target, priority }) !== null;
}

/**
 * Find multiple items at once
 * @param {Object} config - Configuration object
 * @param {Entity} config.source - The entity (player) to search
 * @param {Array<string>} config.targets - Array of item type IDs to find
 * @param {Array<string>} config.priority - Priority order
 * @returns {Object} Map of itemTypeId -> result object or null
 */
export function findItems(config) {
    const { source, targets, priority } = config;
    const results = {};
    
    for (const target of targets) {
        results[target] = findItem({ source, target, priority });
    }
    
    return results;
}
