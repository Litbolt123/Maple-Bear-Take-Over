# Context Summary

**Date:** 2026-01-31

## "Check your journal" — one-time only (fixed)

The "Check your journal" message was repeating (once per "batch" until the player opened the journal). It should behave like other discovery messages: **show once ever when the player discovers something new**, and **never repeat** for that same discovery.

### Changes made

1. **Persistent flag in codex** (`mb_codex.js`)  
   - Added `checkJournalMessageShown: false` to `codex.items` in `getDefaultCodex()` so the one-time state is saved with the player's codex.

2. **`main.js`**  
   - Removed the in-memory `checkJournalPendingByPlayer` Map and all references (including the delete when opening the journal).  
   - **`sendDiscoveryMessage`**: When the player has the journal (`snowBookCrafted`), the message and sound are shown only if `!codex.items.checkJournalMessageShown`. When shown, set `codex.items.checkJournalMessageShown = true`, call `markCodex` and `saveCodex`.  
   - **Golden apple infection reduction**: Same logic — show "Check your journal" only if the flag is false; when shown, set the flag and rely on the existing `saveCodex` to persist.

Result: "Check your journal" is sent **once per player** (first discovery with journal); it never repeats, consistent with other discovery messages.
