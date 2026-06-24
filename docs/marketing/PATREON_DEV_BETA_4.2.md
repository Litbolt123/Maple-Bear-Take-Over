# Patreon — Dev Beta 4.2 post (paste-ready)

**Suggested title:** Dev Beta 4.2 — the powder buzz (camera shake + day-0 fixes)  
**Subtitle:** Small dev drop · `v0.9.0-beta.4.2` · video-friendly  
**Audience:** Patreon playtesters · **Dev pack only** (`BP - Dev` + `RP - Dev`)

Placeholders: `[VIDEO_EMBED]` `[DOWNLOAD_OR_BRIDGE_NOTE]` `[DISCORD_LINK]`

---

## Main post

Hey survivors — **Dev Beta 4.2** is a **small** dev drop. No public GitHub Release bump; this is for **The Maple Bear Apocalypse (Dev)** on Patreon.

I’m also dropping a **short video** about the new **camera jitter** — what it does when you eat snow, how it stacks, and how it’s different from the infection shake near the end. `[VIDEO_EMBED]`

---

### What’s new

**Powder buzz (snow)**  
When you eat **snow**, the screen gets a quick **buzz** — rotational wobble plus a little positional drift. It lasts a few seconds.

- Eat again within ~5 seconds → the buzz **hangs around longer**, but each new bite is **weaker** (you’re not stacking earthquake on earthquake).
- The more snow you’ve eaten this infection, the **softer** each buzz gets — same vibe as the journal lines about snow “not doing much anymore” at higher tiers.
- First bite is the punchiest; late-tier spam is more “muted static” than horror-movie cam.

**Infection camera shake (tuned)**  
The long-running infection shake is **gentler** day-to-day and **ramps** over the last ~30 seconds before transform instead of jumping to full intensity too early. Still gets serious at the end — this isn’t removing dread, just stopping day 0 from feeling like you’re always on a boat.

**One toggle**  
**Journal → Settings → Camera shake (infection + snow buzz)** — turns both on or off.

---

### Day 0 should breathe again

We chased down a nasty perf bug: script village worldgen thought **everyone** was always near a lamp post, so background scans never slept. That’s fixed.

**Important for playtest:** **script village placement is OFF by default** now. It’s laggy WIP work — the real goal is **natural jigsaw worldgen**, not block-by-block script builds.

To test villages anyway: **Settings → Dev world features → Script villages (WIP)**.

If you’re **not** testing villages, leave it off and day 0 should feel much closer to beta.4.

---

### Structures (behind the scenes)

We can now export clean `.mcstructure` files **without** baking `structure_block` into the world — huge for the collab village track. Less cleanup, less junk at lamp posts.

---

### Install

1. Remove the old **Dev** behavior + resource packs from your world.  
2. Import **The Maple Bear Apocalypse (Dev)** from Bridge (`.mcpack`).  
3. Version in journal Settings should show **`v0.9.0-beta.4.2 (dev build)`** after you bump/export.

`[DOWNLOAD_OR_BRIDGE_NOTE]`

---

### What we want from you

- **Watch the jitter video** — does snow buzz feel right? Too strong on first bite? Too weak when you’re deep in powder?
- **Day 0 on a fresh world** with script villages **OFF** — still hitching every few seconds?
- If you flip villages on: lamp post → village trigger speed when you’re standing on the post.

Reply here or `[DISCORD_LINK]` — especially if camera shake should be split into separate toggles later.

---

### Still the same core

Everything from **Dev Beta 4.1** / public **beta.4** is still there — bears, storms, infection, journal, buff fixes, etc. This is a **feel + perf** patch on top.

Thanks for testing on Patreon. The powder remembers.

— Litbolt123 & Compoohter
