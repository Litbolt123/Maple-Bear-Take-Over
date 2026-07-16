# Patreon — beta.5 update post (paste-ready draft)

**Suggested title:** M.B.A beta.5 — the powder remembers your name now  
**Subtitle:** Public build · `v0.9.0-beta.5` · free download attached  
**Audience:** Everyone on Patreon (free tier included) — public **`BP/` + `RP/`**, not Dev pack  
**Tone:** Match [`PATREON_ORIGINAL_LAUNCH_POST.md`](PATREON_ORIGINAL_LAUNCH_POST.md) — update post, not a full re-launch.

Placeholders: `[DOWNLOAD_MCPACK]` `[DISCORD_LINK]` `[OPTIONAL_SCREENSHOT_OR_VIDEO]`

**Do not mention:** GitHub Releases, script villages, Developer Tools, vanilla villages “returning” (never removed from public releases).

---

## Main post

If you have been playing since our first post, you already know the rule: the world does not wait for you to feel ready. **Beta.5** is the public build we have been shaping in dev — everything we wanted players to feel in survival, without the laggy script-village experiments that stay in the dev pack only.

We are **Litbolt123** and **Compoohter**. **M.B.A** — **Maple Bear Apocalypse** — is still free. The pack is attached here. No paywall. If this is your first time reading about the addon, scroll to the bottom for the short version of what the invasion is; the long manifesto on our page still holds.

---

### What changed in beta.5

**The screen can lie to you now — on purpose (and you can tune it).**

Eating powder gives a **short camera buzz** — about a second, not a long whiteout. Stack it too fast and the wobble lasts longer but each pulse is **softer**. High lifetime snow count dulls the effect. While you are infected, shake stays **gentler** most of the day and only **ramps** in the last half-minute before transformation.

**Maple Bears that hit you** add tiered buzz: tiny glances from day-zero scouts, heavier slams from big infected bears, light aerial taps from flying bears. **Torpedo explosions** and **buff bear death bursts** hit harder than a body slam — same punchy blast class, **shorter** than our first beta.5 camera pass so you feel the hit without losing the fight to motion sickness. Storm exposure, cough dust, cure relief, and day milestones can nudge the camera too.

**No blindness on your first bear hit** — we pulled that after playtesting. Staged effects still build on later hits; major infection onset is unchanged.

Turn it all off or pick categories in **Journal → Settings → Camera shake** (infection, snow, combat, storm, cues).

Video link of the development of our camera shake:  
https://www.patreon.com/MapleBearApocalypse/posts/m-b-dev-beta-4-2-162007080?utm_medium=clipboard_copy&utm_source=copyLink&utm_campaign=postshare_creator&utm_content=join_link

**Day zero should breathe.**

We fixed background work that made early worlds hitch on join and when crossing chunks you already visited — including when you **backtrack through terrain you already explored**. Heavy scans spread across ticks instead of punching you in one frame. **Crowded worlds get automatic spawn throttling** when bears, item entities, storms, or lag pressure spike; spawn pressure still rises when the world gets crowded, and the journal still has performance options if your realm runs hot.

**Death is a reset — for you.**

Without permanent immunity, dying **clears** your active infection and respawns you with a **fresh minor**. No more logging back in with thirty seconds left on a major timer — and the **camera actually stops** when you die, through the death screen and respawn grace. No duplicate “Minor infection” chat on death respawn. The world may still remember you in other ways. Your timer should not.

**Cures and powder**

Minor cure (golden apple + carrot) still grants **permanent immunity to minor infection on respawn** — but eating **snow remains dangerous**. Powder can still push you into major territory. The journal warns you when you cure minor.

**Bears and balance (carried forward + tuned)**

- Buff bears respect **near-you** and **dimension** caps — no more stacking past the limit when you die, leave, and return.
- **Torpedo duds** (~5%) dive and chew blocks but **do not explode** on death.
- **Torpedo blasts** are not just visual — caught in the radius forces a **dust cough** and can **worsen infection** (timer and snow severity), not only camera shake.
- **Mining bears** stall less on stairs, leave **more snow** in their wake, and **collect loot** when they break infected ground — dirt from dusted dirt, powder from snow layers (throttled so realms do not drown in items).
- Mob conversion and storm kills still respect victim **size** and buff caps.

Full mob list and shake tiers: we documented every Maple Bear type in the repo for ourselves — ask in Discord if you want the spreadsheet vibe in plain English.

---

### What this build is not

- **Not** the dev pack — no Developer Tools tree, no script-placed abandoned villages, no biome-checker HUD.
- **Not** a custom map — behavior + resource on a normal survival world.
- **Not** finished — beta.5 is playable and dense; Day 100 is still the north star.

---

### Updating (read this if you already have a world)

**Public beta → public beta.5:** use the pack attached to this post. Import it, enable Behavior + Resource on the same world. Your infection timer, cures, and journal progress live in the **world save**, not in the download — replacing the public pack with a newer public pack should keep that data.

**Do not mix the public pack and the private/dev pack on the same world.** They are different pack identities. Swapping between them (or deleting one and installing the other mid-save) can make Minecraft treat your progress as belonging to a different addon — infection time and journal unlocks can look “wiped” even though the world file is still there.

If you were only ever on the public Patreon builds, stay on public. If you were testing a private/dev drop with us, treat that world as a test world — start fresh (or keep playing that world on the same pack line) rather than hopping to public mid-infection.

**Before you update:** save and fully quit the world (don’t force-close mid-session). Then swap packs.

---

### How to play (beta.5)

| | |
|---|---|
| **Version** | `v0.9.0-beta.5` |
| **Platform** | Minecraft Bedrock **1.26.10+** |
| **Get the pack** | `[DOWNLOAD_MCPACK]` attached to this post (**public** build — not the private/dev pack) |
| **World** | **Fresh world recommended.** On **1.26.2+** you do **not** need the Custom Biomes experiment — infected biomes work with packs applied. Mixed old/new chunks can still show ugly seams. |
| **Install** | Import the `.mcpack`; enable **Behavior** + **Resource** on the world. Updating from an older **public** beta: replace with this pack on the same world (see **Updating** above). |
| **Bugs & chat** | `[DISCORD_LINK]` — https://discord.gg/gAJ4eB3vuU |

Expect rough edges. Tell us what melted your realm. That is how beta becomes something you are proud to recommend.

---

### New here? (thirty-second version)

Maple Bear Apocalypse is a Bedrock **infection survival** addon. Days unlock deadlier bears. White powder spreads through storms, ground, and your own choices. The **Powdery Journal** teaches you what you survive long enough to discover. Underground is not safe. The sky is not safe. The Nether and End are not vacations. Co-op is the heart of the design — who touched the snow last is a real question.

For the full tone piece — dread, powder, MapleDaBear, where we are headed — our **original launch post** on this page is still the bible. This post is the **update**.

---

### Still free. Still supported.

Maple Bear Apocalypse remains **free to download and play**. Patreon helps us keep building the full invasion arc — early builds, honest dev logs, polls, credits — not a paywall on the story.

Thank you for surviving long enough to read a changelog. The powder remembers.

— Litbolt123 & Compoohter

*Don't do drugs kids…*

---

## Optional pin comment (short)

**Beta.5 is live on this post.** `.mcpack` attached (public build). Fresh world recommended. Updating from an older public beta keeps world save data — do **not** mix public and private/dev packs on the same world. Camera shake toggles in journal Settings (categories: infection, snow, combat, storm). Questions → Discord.
