/**
 * Powdery Journal — "What's new" screen (content from mb_playerChangelog.js).
 */

import { ActionFormData } from "@minecraft/server-ui";
import { getPlayerChangelogBody, getPlayerChangelogDisplayLabel } from "./mb_playerChangelog.js";

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 * @param {number} [volumeMultiplier]
 * @param {(player: import("@minecraft/server").Player) => void} [onViewed] Called when the screen opens (marks changelog seen).
 */
export function showJournalWhatsNew(player, onBack, volumeMultiplier = 0.85, onViewed) {
    try {
        const label = getPlayerChangelogDisplayLabel();
        const form = new ActionFormData().title(`§aWhat's new §7— §f${label}`);
        form.body(getPlayerChangelogBody());
        form.button("§8Back");
        try {
            if (onViewed) onViewed(player);
        } catch { /* ignore */ }
        form.show(player).then((res) => {
            try {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            } catch { /* ignore */ }
            if (!res || res.canceled || res.selection === 0) {
                onBack();
            }
        }).catch(() => onBack());
    } catch {
        onBack();
    }
}
