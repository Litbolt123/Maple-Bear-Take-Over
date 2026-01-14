# Minecraft Bedrock Script API Q&A Documentation
**Source:** Bedrock Add-Ons Discord - #script-api channel  
**Compiled:** January 13, 2026

This channel is for Script API questions, troubleshooting, and discussions. Questions are organized by tags: Question, Beta APIs, GameTest, BDS (Bedrock Dedicated Server), UI & Forms, Resolved, and more.

---

## Section 1: Recent Questions & Solutions (Latest Posts)

### Script API General (Pinned)
**Author:** Cici [🆙 United Paradigms]  
**Tags:** BDS, GameTest, Resolved, UI & Forms  
**Posted:** January 24, 2023 (edited February 9, 2023)  
**Reactions:** 419 | **Messages:** 100k+

**Purpose:**  
This is the general chat for script-api discussions. It is currently not intended for direct questions - create a separate post for those. This is a work-in-progress test channel.

**Feedback:** Provide feedback in designated channels.

---

### Preventing fishing hook from attaching to entity
**Author:** onyx.rcr  
**Tags:** Question, Beta APIs  
**Posted:** February 6, 2025  
**Messages:** 7

**Question:**  
How to prevent fishing hooks from attaching to entities?

**Solution Approach:**
```javascript
world.afterEvents.entityHurt.subscribe((event) => {
  const entity = event.entity;
  const damageSource = event.damageSource;
  
  if (entity && damageSource && damageSource.cause === 'fishing_hook') {
    const ownerId = fishingHookOwners.get(damageSource.id);
    const owner = world.getPlayers().find(player => player.id === ownerId);
    
    if (owner) {
      notify.error(owner, "Fishing hook cannot attach to entities. Hook removed.");
    }
    
    entity.remove();
  }
});
Key Points:

Uses entityHurt event to detect fishing hook damage

Tracks fishing hook owners in a Map

Removes the entity when hit by fishing hook

Sends notification to hook owner

How can I detect when you use totem?
Author: Naru
Tags: Question, GameTest
Posted: May 16, 2023
Messages: 31

Question:
How can I make it so when a player uses totem (postmortal), a message appears showing the person and the entity/thing that caused the damage?

Discussion Topics:

Totem of Undying activation detection

Tracking damage source when totem is consumed

Displaying custom messages on totem use

See: "Totem Pop Event snippet" in #script-resources for a solution

Related: This is a common question - check script-resources channel for the "Totem Pop Event snippet" by Remember M9.

Delete item in BDS
Author: Zeon
Tags: BDS
Posted: January 10, 2026
Messages: 1

Question:
I want to delete an item in server so players can't craft that item or find it in any structure.

Solution Approach:

Use beforeEvents.playerInteractWithBlock to prevent crafting

Cancel item pickup events for specific items

Remove items from loot tables (requires modifying world files, not just scripts)

Use world.afterEvents.itemCompleteUse to remove crafted items

Note: Complete item deletion requires both scripting and resource pack modifications.

Fishing rod for PVP
Author: NorthBelak
Tags: Question
Posted: January 13, 2026
Messages: 0

Problem:
Fishing hook is being destroyed before it hits the entity.

Current Code:

javascript
world.afterEvents.projectileHitEntity.subscribe((event) => {
  try {
    if (event.projectile.typeId === "minecraft:fishing_hook") {
      if (event.hurtEntity === event.source) {
        event.projectile.kill();
      }
      
      if (event.hurtEntity) {
        const aim = {
          x: event.hurtEntity.location.x - event.source.location.x,
          z: event.hurtEntity.location.z - event.source.location.z
        };
        
        event.hurtEntity.applyKnockback(
          { x: aim.x * 0.2595, z: aim.z * 0.2455 },
          0.303
        );
      }
    }
  } catch (error) {
    console.warn("Erreur lors de la destruction de l'hameçon:", error);
  }
});
Issue: Hook gets cleared before registering the hit on entity.

Potential Solutions:

Remove event.projectile.kill() call before knockback

Use a delay before killing the hook

Try different event (e.g., entityHurt instead)

Team damage system
Author: New Dragonite_Xbuilding
Tags: Question
Posted: January 13, 2026
Messages: 19

Question:
Is there a way to make players on the same tag or scoreboard unable to damage each other? Especially with swords, axes, and other melee weapons (projectiles are known to be harder).

Solution Approach:

javascript
world.beforeEvents.entityHurt.subscribe((event) => {
  const victim = event.hurtEntity;
  const attacker = event.damageSource.damagingEntity;
  
  if (!victim || !attacker) return;
  if (victim.typeId !== "minecraft:player" || attacker.typeId !== "minecraft:player") return;
  
  // Check if both players have the same team tag
  const victimTags = victim.getTags();
  const attackerTags = attacker.getTags();
  
  const teamTags = victimTags.filter(tag => tag.startsWith("team:"));
  const attackerTeamTags = attackerTags.filter(tag => tag.startsWith("team:"));
  
  // If they share any team tag, cancel damage
  const sharedTeam = teamTags.some(tag => attackerTeamTags.includes(tag));
  
  if (sharedTeam) {
    event.cancel = true;
  }
});
Key Points:

Use beforeEvents.entityHurt to cancel damage

Check if both entities are players

Compare tags/scoreboard teams

Cancel event if on same team

Works for melee, projectiles require additional handling

Word Tower addon not triggering
Author: riddicKuII0
Tags: Question, Beta APIs
Posted: January 3, 2026
Messages: 70

Problem:
Behavior Pack addon imports fine but doesn't trigger in-game.

Project Details:

Minigame addon for building vertical word towers

Uses letter blocks from another addon (IDs like mrki_ab:a_white, mrki_ab:b_white)

Player types !word in chat to build tower

Should place yellow concrete, letters, then white concrete for spaces

Example: !minecraft bedrock creates vertical tower spelling the words

Tech Stack:

Bedrock 1.21.131

Behavior Pack only

Script API enabled (Beta APIs)

@minecraft/server module

UTF-8 encoding

Uses dimension.runCommandAsync

No syntax errors, correct manifest

Imports successfully

Issue: Nothing happens when triggering the command in chat.

Common Causes to Check:

Event subscription - Is world.beforeEvents.chatSend properly subscribed?

Chat prefix - Are you correctly checking for ! prefix?

Command parsing - Is the word being extracted correctly from chat?

Block placement - Are setBlock() or runCommand() calls working?

Error handling - Add try-catch blocks to see if errors are being thrown silently

Player permissions - Does player have permission to place blocks?

Module loading - Is the script file properly referenced in manifest?

Debugging Steps:

javascript
// Add logging to verify script is running
import { world } from "@minecraft/server";

world.beforeEvents.chatSend.subscribe((event) => {
  const message = event.message;
  const player = event.sender;
  
  console.warn(`Chat received: ${message}`); // Debug log
  
  if (!message.startsWith("!")) return;
  
  event.cancel = true; // Prevent chat message from showing
  
  const word = message.substring(1).toLowerCase();
  console.warn(`Building tower for word: ${word}`); // Debug log
  
  // Your tower building logic here
});
Common Themes in Section 1
Fishing Hook Mechanics
Multiple questions about fishing hook behavior:

Preventing attachment to entities

PVP knockback functionality

Hook removal timing issues

Team/PVP Systems
Friendly fire prevention

Team-based damage systems

Tag/scoreboard comparisons

Event Troubleshooting
Events not triggering

Timing issues with event handlers

Proper use of beforeEvents vs afterEvents

Totem Detection
Common question across multiple threads

See #script-resources for solutions

End of Section 1

# Script API Channel - Discord Posts Compilation

## Recent Posts

### offhand equipment slot
**Author:** flipoff  
**Tags:** Question  
**Date:** 27d ago  
**Replies:** 3  
**Description:** i have this error  
[Image attached]

---

### How to spawn an arrow and change its damage?
**Author:** LuReN  
**Tags:** Question, Beta APIs  
**Date:** 27d ago  
**Replies:** 13  
**Description:** const arrow = world.getDimension("Overworld").spawnEntity("minecraft:arrow", location); How can I change its damage?

---

### Which one should i choose?
**Author:** Weisstersire  
**Tags:** Question  
**Date:** 27d ago  
**Replies:** 9  
**Description:** I have two initializations, but i only want to use one of them yada-yada-yada now idk which one to use  
**Expectation:** I wanna make item to inflict effects when consumed  
**Versions:** NPM at 2.3.0 stable, API at 1.21.120  
[Image attached]

---

### Delay in server
**Author:** Zeon  
**Tags:** Question, Beta APIs, GameTest  
**Date:** 28d ago  
**Replies:** 27  
**Description:** So, I created a particle script that follows the player. In the local world, it follows the player smoothly, but in the server there is delay.  
[Image attached]

---

### Data
**Author:** BedrockTechnoYT  
**Tags:** Question  
**Date:** 28d ago  
**Replies:** 2  
**Description:** How do we get the item data value out of an item (js)?

---

### command builder problem
**Author:** vector  
**Tags:** Question, Beta APIs, Resolved  
**Date:** 28d ago  
**Replies:** 1  
**Description:** i have a problem in this code it detects all of the options as "off" options even if i select the "on" option  
system.beforeEvents.startup.subscribe((event) => {
const registry = event.commandRegistry || event...

text
(edited)  
[Image attached]

---

### [solved] script for a projectile to break blocks
**Author:** Whiteklr  
**Tags:** Question  
**Date:** 28d ago  
**Replies:** 4  
**Description:** sry im rly bad at scripting, does anyone know how can I make a script so my projectile can break all blocks except some specific blocks? (edited)

---

### Remove knockback
**Author:** Beyond64  
**Tags:** Question  
**Date:** 28d ago  
**Replies:** 8  
**Description:** Any way to make player take no knockback when hurt ??

---

### Entity Inventory Script
**Author:** dreamerDM8000  
**Tags:** Beta APIs  
**Date:** 28d ago  
**Replies:** 46  
**Description:** I need help to make a script that recognizes the first 5 slots of my custom entity e.g. jm:test from my inventory  
- Slot 0 Swords
- Slot 1 Bow
- Slot 2 Helmet
- Slot 3 Chest plate
- Slot 4 Leggings
- Slot 5 Boots

if not, the item will be dropped / returned to the player's inventory and then the armor must be equipped automatically on the entity.

---

### property does not exist on Entity
**Author:** Otter in distress  
**Tags:** Question  
**Date:** 28d ago  
**Replies:** 0  
**Description:** [Scripting][error]-InvalidArgumentError: Invalid value passed to argument [0]. Property "mypack:isKnight" is not defined on entity.
const isKnight = attacker.getProperty("mypack:isKnight")

text
attacker is a npc. here is the entity property in the BP file
"mypack:isKnight": {
"type": "bool",
"default": false
}

text

---

### how to check if entity is in component group
**Author:** Otter in distress  
**Tags:** Question  
**Date:** 28d ago  
**Replies:** 2  
**Description:** is it possible to get if entity is in a component group?

---

### Cycling block state
**Author:** Xenith96  
**Tags:** Question  
**Date:** 28d ago  
**Replies:** 15  
**Description:** How can I cycle through the state of a block? Currently my script only accounts for switching between two states.

---

### Error with getting topmostblock
**Author:** Clocktoon  
**Tags:** Question, Resolved, UI & Forms  
**Date:** 28d ago  
**Replies:** 3  
**Description:** Script at the bottom of the text I've got a script that is meant to get a location and spawn an entity at the highest block.
```javascript
import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
world...
[Image attached]

Pathfinding
Author: Nekode
Tags: Question
Date: 28d ago
Replies: 19
Description: So I need a good pathfinding system for my game. The 2 provided images represent a 2D map. Tiles info:

Black = Wall

Gray = Gate

Blue = Quarters / Houses

Green = Town Hall

Red 1 = Enemies

Red 2 = Enemy Spawn

The pathfinding system should be performant so I was thinking of Field-Flow. But I want that if a Tile like the wall gets destroyed, the path must be recompiled to the new hole in the map.
[Image attached]

Entity/mob move to a specific location
Author: Otter in distress
Tags: Question
Date: 29d ago
Replies: 0
Description: I am aware that you can apply impulse but for diagonal coordinates, is it possible? I want the mob to walk to a specific diagonal location.

Make entities move to specific locations.
Author: Mikenator
Tags: Question
Date: 29d ago
Replies: 2
Description: Is there a function or smth that lets you make an entity walk to a specific place.

how to make a dispenser with bonemeal not "fertilize" a wheat crop when activated?
Author: omo
Tags: Question
Date: 29d ago
Replies: 1
Description: pls help me with how the title is described. its for v1.21.130, a little strip of code for it

how do i make a custom 3 digit scoreboard/ammo counter like reims
Author: StormFlume
Tags: Question
Date: 29d ago
Replies: 53
Description: help me please
[Image attached]

help with simulatedPlayer
Author: Null
Tags: Question, GameTest
Date: >30d ago
Replies: 5
Description: How do I spawn a simulatedPlay? does anyone have some template code I could use?

Entity wont display text and wont spawn in with another creature
Author: Ducksters
Tags: Question
Date: >30d ago
Replies: 2
Description: here is all the text file of what i thought would be relevant but i just have no clue why this aint working

detect/event player open inventory?
Author: causalguide
Tags: Question
Date: >30d ago
Replies: 6
Description: anyone know how to check when player open its inventory?

simulate jump button
Author: Reclaimed
Tags: Question
Date: >30d ago
Replies: 3
Description: so I'm making a script that swaps the chestplate and elytra if both are in the player's inventory. so basically when they jump twice it will automagically swap their elytra to be equipped no matter where it is in the inventory and then swap back to their chestplate when they touch ground again. so I can make it swap to the elytra when the player is in the air and they jump again. but I would like it to also make them start gliding as soon as it swaps, and as far as I can tell the easiest way would be to "simulate" the jump button being pressed again after the swap. is there a way to send a jump event to the player? (edited)

Enchant item in mainhand
Author: Dracofou
Tags: Question
Date: >30d ago
Replies: 6
Description: hi i try to detect item in mainhand

Is it possible to crash Minecraft entirely? (RESOLVED)
Author: Kreepy
Tags: Question, Beta APIs, Resolved
Date: >30d ago
Replies: 58
Description: is there a script out there where if ran with /scriptevent, it makes the everyone in a world where they're game will crash and close

Can anyone give me a gun addon template that I can change? so I can learn it (I'm a beginner)
Author: Kimmmmmm
Tags: Question, Beta APIs
Date: >30d ago
Replies: 13
Description: I have model, texture, particle, animation. but I don't know how to make it an addon

how can i create a script that can fire projectile with custom properties like fireRate, damage etc.
Author: StormFlume
Tags: Question
Date: >30d ago
Replies: 11
Description: Original message was deleted

(SOLVED) how do they do gun scope effect and first person animations?
Author: Otter in distress
Tags: Question
Date: >30d ago
Replies: 5
Description: i have been trying with playAnimation but I noticed, first person animations dont work for some reason? How do you guys do scopes and first person animations?

Who knows how to make a block that only the person holding it can see?
Author: Rick
Tags: Question
Date: >30d ago
Replies: 12
Description: and that the item isn't visible?

Is it possible to Detect Armor points of players via script?
Author: jeffycat1
Tags: Question
Date: >30d ago
Replies: 1
Description: I've been working on a RPG server that uses a large variety of armors, and as a method of balancing the classes with magic their restricted to having lower armor. however its currently not been fully complete due to it not being possible with command blocks alone. So perhaps its possible with script instead? Say a player with a tag and has more then 8 points (which is around the amount leather has) the player gains weakness and slowness for example.

Make player invulnerable
Author: Ronin (Ping Anytime)
Tags: Question
Date: >30d ago
Replies: 4
Description: Im tryna make the player immune to all damage when i use /tag @s add immune

Block Raycast Delay
Author: The Gooner - Shadow
Tags: Question, Beta APIs, GameTest, +1
Date: >30d ago
Replies: 3
Description: The Block Detect Make So Much Delay To The Game, Can Some One Help Me?

event trigger if player is in a territory
Author: Otter in distress
Tags: Question
Date: >30d ago
Replies: 4
Description: I have an array of territories and want to trigger if player is in the territory const Area = ...

Health Component Broken?
Author: suj
Tags: Question, API Feedback
Date: >30d ago
Replies: 75
Description: [Discussion about Health Component]

setDynamicProperty to blocks
Author: Otter in distress
Tags: Question
Date: >30d ago
Replies: 11
Description: i am not sure if anyone did this before, I was wondering if it was possible. world.before...

# Script API Channel - Section 3: Comprehensive Post Details

## Post 1: Script API General (Pinned)
**Author:** Cici [🆙 United Paradigms]  
**Tags:** Pinned, BDS, GameTest, Resolved, +1, UI & Forms  
**Date:** Posted Tuesday, January 24, 2023 at 3:05 PM | Last activity: 5m ago  
**Replies:** 419  
**Views:** 100k+  
**Description:** This is the general chat for script-api. It is currently not intended for questions; for that, create a separate post. This is a work-in-progress test. Please give feedback.  
**Status:** Pinned general information post  
**Image:** Included

---

## Post 2: Preventing fishing hook from attaching to entity
**Author:** onyx.rcr  
**Tags:** Question, Beta APIs  
**Date:** Thursday, February 6, 2025 at 11:29 PM (1h ago)  
**Replies:** 7  
**Code Provided:**
```javascript
world.afterEvents.entityHurt.subscribe((event) => {
    const entity = event.entity;
    const damageSource = event.damageSource;
    if (entity && damageSource && damageSource.cause === 'fishing_hook') {
        const ownerId = fishingHookOwners.get(damageSource.id);
        const owner = world.getPlayers().find(player => player.id === ownerId);
        if (owner) {
            notify.error(owner, "Fishing hook cannot attach to entities. Hook removed.");
        }
        entity.remove();
    }
});
Status: Active discussion

Post 3: How can I detect when you use totem?
Author: Naru
Tags: Question, GameTest
Date: Tuesday, May 16, 2023 at 12:33 PM (2h ago)
Replies: 31
Description: How can I make that when a player uses totem (postmortal) a message appears with the person and the entity or thing that caused the damage?
Status: Active discussion with multiple solutions
Image: Included

Post 4: Delete item in BDS
Author: Zeon
Tags: BDS
Date: Saturday, January 10, 2026 at 10:35 PM (2h ago)
Replies: 1
Description: I want to delete an item in server, but I don't know how. So player can't craft that item or find it in any structure
Status: Recently posted, awaiting solutions

Post 5: Fishing rod for PVP
Author: NorthBelak
Tags: Question
Date: Tuesday, January 13, 2026 at 2:54 PM (3h ago)
Replies: 0
Code Provided:

javascript
world.afterEvents.projectileHitEntity.subscribe((event) => {
    try {
        if (event.projectile.typeId === "minecraft:fishing_hook") {
            if (event.hurtEntity === event.source) {
                event.projectile.kill();
            }
            if (event.hurtEntity) {
                const aim = {
                    x: event.hurtEntity.location.x - event.source.location.x,
                    z: event.hurtEntity.location.z - event.source.location.z
                };
                event.hurtEntity.applyKnockback(
                    { x: aim.x * 0.2595, z: aim.z * 0.2455 },
                    0.303
                );
            }
        }
    } catch (error) {
        console.warn("Erreur lors de la destruction de l'hameçon:", error);
    }
});
Problem: This code clears the hook before the hit on the entity
Status: Needs correction

Post 6: Team damage system
Author: New Dragonite_Xbuilding
Tags: Question
Date: Tuesday, January 13, 2026 at 9:29 AM (5h ago)
Replies: 19
Description: Is there a way to make it so that when players are on the same tag or scoreboard they can't damage each other? I know projectiles are harder but I mean swords and axes stuff like that to where you can't damage each other
Status: Active discussion with solutions

Post 7: Word Tower addon not triggering
Author: riddicKuII0
Tags: Question, Beta APIs
Date: Saturday, January 3, 2026 at 3:16 PM (9h ago)
Replies: 70
Description: Making a Behavior Pack for a minigame that builds a vertical tower under the player when they type a word in chat using !. Uses letter blocks from another addon (mrki_ab:a_white, mrki_ab:b_white, etc.).
Expected Behavior:

Player types !minecraft bedrock in chat

Creates vertical tower: player🟨 M I N E C R A F T ⬜ B E D R O C K

Yellow concrete block goes first, spaces become white concrete
Tech Details: Bedrock 1.21.131, Behavior Pack only, Script API on (Beta APIs), @minecraft/server, UTF-8 script, dimension.runCommandAsync, no syntax errors, correct manifest, no errors on import
Problem: Nothing happens when triggering
Status: Extensive troubleshooting in progress with 70 replies
Files: Behavior Pack files attached

Post 8: offhand equipment slot
Author: flipoff
Tags: Question
Date: 27d ago
Replies: 3
Description: i have this error
Status: Error troubleshooting
Image: Error screenshot included

Post 9: How to spawn an arrow and change its damage?
Author: LuReN
Tags: Question, Beta APIs
Date: 27d ago
Replies: 13
Code Provided:

javascript
const arrow = world.getDimension("Overworld").spawnEntity("minecraft:arrow", location);
Question: How can I change its damage?
Status: Active discussion with multiple suggestions

Post 10: Which one should i choose?
Author: Weisstersire
Tags: Question
Date: 27d ago
Replies: 9
Description: I have two initializations, but i only want to use one of them yada-yada-yada now idk which one to use
Expectation: I wanna make item to inflict effects when consumed
Versions:

NPM at 2.3.0 stable

API at 1.21.120
Status: Seeking guidance on best approach
Image: Code comparison included

Post 11: Delay in server
Author: Zeon
Tags: Question, Beta APIs, GameTest
Date: 28d ago
Replies: 27
Description: So, I created a particle script that follows the player. In the local world, it follows the player smoothly, but in the server there is delay.
Problem: Performance issue - particles lag in multiplayer server but work fine in local world
Status: Troubleshooting performance optimization
Image: Demonstration included

Post 12: Data
Author: BedrockTechnoYT
Tags: Question
Date: 28d ago
Replies: 2
Question: How do we get the item data value out of an item (js)?
Status: Quick question with answers

Post 13: command builder problem (RESOLVED)
Author: vector
Tags: Question, Beta APIs, Resolved
Date: 28d ago
Replies: 1
Problem: i have a problem in this code it detects all of the options as "off" options even if i select the "on" option
Code Provided:

javascript
system.beforeEvents.startup.subscribe((event) => {
    const registry = event.commandRegistry || event...
(edited)
Status: ✅ RESOLVED
Image: Code screenshot included
Note: Check replies for solution

Post 14: [solved] script for a projectile to break blocks
Author: Whiteklr
Tags: Question
Date: 28d ago
Replies: 4
Question: sry im rly bad at scripting, does anyone know how can I make a script so my projectile can break all blocks except some specific blocks?
(edited)
Status: ✅ SOLVED - solution provided in replies

Post 15: Remove knockback
Author: Beyond64
Tags: Question
Date: 28d ago
Replies: 8
Question: Any way to make player take no knockback when hurt ??
Status: Active discussion with potential solutions

Post 16: Entity Inventory Script
Author: dreamerDM8000
Tags: Beta APIs
Date: 28d ago
Replies: 46
Description: I need help to make a script that recognizes the first 5 slots of my custom entity e.g. jm:test from my inventory
Requirements:

Slot 0: Swords

Slot 1: Bow

Slot 2: Helmet

Slot 3: Chest plate

Slot 4: Leggings

Slot 5: Boots

Additional Requirement: if not, the item will be dropped / returned to the player's inventory and then the armor must be equipped automatically on the entity.
Status: Extensive discussion with 46 replies - complex inventory management system

Post 17: property does not exist on Entity
Author: Otter in distress
Tags: Question
Date: 28d ago
Replies: 0
Error: [Scripting][error]-InvalidArgumentError: Invalid value passed to argument [0]. Property "mypack:isKnight" is not defined on entity.
Code Provided:

javascript
const isKnight = attacker.getProperty("mypack:isKnight")
Entity Property (BP file):

json
"mypack:isKnight": {
    "type": "bool",
    "default": false
}
Problem: attacker is a npc. Entity property defined in BP file but not recognized by script
Status: Awaiting solutions

Post 18: how to check if entity is in component group
Author: Otter in distress
Tags: Question
Date: 28d ago
Replies: 2
Question: is it possible to get if entity is in a component group?
Status: Short discussion with answers

Post 19: Cycling block state
Author: Xenith96
Tags: Question
Date: 28d ago
Replies: 15
Question: How can I cycle through the state of a block? Currently my script only accounts for switching between two states.
Status: Discussion on cycling through multiple block states

Post 20: Error with getting topmostblock (RESOLVED)
Author: Clocktoon
Tags: Question, Resolved, UI & Forms
Date: 28d ago
Replies: 3
Description: Script at the bottom of the text I've got a script that is meant to get a location and spawn an entity at the highest block.
Code Provided:

javascript
import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
world...
Status: ✅ RESOLVED
Image: Error screenshot included
Note: Solution provided in 3 replies

Post 21: Pathfinding
Author: Nekode
Tags: Question
Date: 28d ago
Replies: 19
Description: So I need a good pathfinding system for my game. The 2 provided images represent a 2D map.
Tiles Info:

Black = Wall

Gray = Gate

Blue = Quarters / Houses

Green = Town Hall

Red 1 = Enemies

Red 2 = Enemy Spawn

Requirements:

The pathfinding system should be performant so I was thinking of Field-Flow

But I want that if a Tile like the wall gets destroyed, the path must be recompiled to the new hole in the map

Status: Extensive discussion on pathfinding algorithms
Image: Map diagrams included

Post 22: Entity/mob move to a specific location
Author: Otter in distress
Tags: Question
Date: 29d ago
Replies: 0
Question: I am aware that you can apply impulse but for diagonal coordinates, is it possible? I want the mob to walk to a specific diagonal location.
Status: No replies yet

Post 23: Make entities move to specific locations
Author: Mikenator
Tags: Question
Date: 29d ago
Replies: 2
Question: Is there a function or smth that lets you make an entity walk to a specific place.
Status: Quick answers provided

Post 24: how to make a dispenser with bonemeal not "fertilize" a wheat crop when activated?
Author: omo
Tags: Question
Date: 29d ago
Replies: 1
Description: pls help me with how the title is described. its for v1.21.130, a little strip of code for it
Version: v1.21.130
Status: Simple script request

Post 25: how do i make a custom 3 digit scoreboard/ammo counter like reims
Author: StormFlume
Tags: Question
Date: 29d ago
Replies: 53
Description: help me please
Status: Extensive discussion with 53 replies on creating custom UI displays
Image: Reference image included

Post 26: help with simulatedPlayer
Author: Null
Tags: Question, GameTest
Date: >30d ago
Replies: 5
Question: How do I spawn a simulatedPlay? does anyone have some template code I could use?
Status: Template code requests and examples provided

Post 27: Entity wont display text and wont spawn in with another creature
Author: Ducksters
Tags: Question
Date: >30d ago
Replies: 2
Description: here is all the text file of what i thought would be relevant but i just have no clue why this aint working
Status: Debugging entity behavior issues

Post 28: detect/event player open inventory?
Author: causalguide
Tags: Question
Date: >30d ago
Replies: 6
Question: anyone know how to check when player open its inventory?
Status: Event detection discussion

Post 29: simulate jump button
Author: Reclaimed
Tags: Question
Date: >30d ago
Replies: 3
Description: so I'm making a script that swaps the chestplate and elytra if both are in the player's inventory. so basically when they jump twice it will automagically swap their elytra to be equipped no matter where it is in the inventory and then swap back to their chestplate when they touch ground again. so I can make it swap to the elytra when the player is in the air and they jump again. but I would like it to also make them start gliding as soon as it swaps, and as far as I can tell the easiest way would be to "simulate" the jump button being pressed again after the swap. is there a way to send a jump event to the player?
(edited)
**
# Script API Channel - Section 3: Complete Post Archive with Solutions

## Recent Active Posts (Last 24 Hours)

### Post 1: Script API General (PINNED)
**Author:** Cici [🆙 United Paradigms]  
**Tags:** Pinned, BDS, GameTest, Resolved, UI & Forms  
**Posted:** Tuesday, January 24, 2023 at 3:05 PM  
**Last Activity:** 4m ago  
**Replies:** 419  
**Views:** 99,999  
**Description:** This is the general chat for script-api. It is currently not intended for questions; for that, create a separate post. This is a work-in-progress test. Please give feedback.  
**Status:** Pinned - General Information Post  
**Image:** Discord emoji included

---

### Post 2: Preventing fishing hook from attaching to entity
**Author:** onyx.rcr  
**Tags:** Question, Beta APIs  
**Posted:** Thursday, February 6, 2025 at 11:29 PM  
**Last Activity:** 3h ago  
**Replies:** 7  
**Problem:** Trying to prevent fishing hooks from attaching to entities  
**Code Provided:**
```javascript
world.afterEvents.entityHurt.subscribe((event) => {
    const entity = event.entity;
    const damageSource = event.damageSource;
    if (entity && damageSource && damageSource.cause === 'fishing_hook') {
        const ownerId = fishingHookOwners.get(damageSource.id);
        const owner = world.getPlayers().find(player => player.id === ownerId);
        if (owner) {
            notify.error(owner, "Fishing hook cannot attach to entities. Hook removed.");
        }
        entity.remove();
    }
});
Status: Active discussion with 7 replies providing solutions

Post 3: How can I detect when you use totem?
Author: Naru
Tags: Question, GameTest
Posted: Tuesday, May 16, 2023 at 12:33 PM
Last Activity: 4h ago
Replies: 31
Question: How can I make that when a player uses totem (postmortal) a message appears with the person and the entity or thing that caused the damage?
Status: Extensive discussion with 31 replies containing multiple solution approaches
Image: Totem demonstration included

Post 4: Delete item in BDS
Author: Zeon
Tags: BDS
Posted: Saturday, January 10, 2026 at 10:35 PM
Last Activity: 4h ago
Replies: 1
Question: I want to delete an item in server, but I don't know how. So player can't craft that item or find it in any structure
Status: Recently posted, solutions being provided

Post 5: Fishing rod for PVP
Author: NorthBelak
Tags: Question
Posted: Tuesday, January 13, 2026 at 2:54 PM
Last Activity: 5h ago
Replies: 0
Problem: This code clears the hook before the hit on the entity. How I can correct it
Code Provided:

javascript
world.afterEvents.projectileHitEntity.subscribe((event) => {
    try {
        if (event.projectile.typeId === "minecraft:fishing_hook") {
            if (event.hurtEntity === event.source) {
                event.projectile.kill();
            }
            if (event.hurtEntity) {
                const aim = {
                    x: event.hurtEntity.location.x - event.source.location.x,
                    z: event.hurtEntity.location.z - event.source.location.z
                };
                event.hurtEntity.applyKnockback(
                    { x: aim.x * 0.2595, z: aim.z * 0.2455 },
                    0.303
                );
            }
        }
    } catch (error) {
        console.warn("Erreur lors de la destruction de l'hameçon:", error);
    }
});
Status: Awaiting solutions - timing issue with hook removal

Post 6: Team damage system
Author: New Dragonite_Xbuilding
Tags: Question
Posted: Tuesday, January 13, 2026 at 9:29 AM
Last Activity: 7h ago
Replies: 9
Question: Is there a way to make it so that when players are on the same tag or scoreboard they can't damage each other? I know projectiles are harder but I mean swords and axes stuff like that to where you can't damage each other
Status: Active discussion with 9 solutions/suggestions

Post 7: Word Tower addon not triggering, need help finding what's still wrong
Author: riddicKuII0
Tags: Question, Beta APIs
Posted: Saturday, January 3, 2026 at 3:16 PM
Last Activity: 11h ago
Replies: 70
Description: Making a proper post because last message in general chat caused confusion 😅. NOT asking someone to make an addon from scratch. Already have an addon, it imports fine, improved after help, but still doesn't work in-game.

Addon Purpose: Behavior Pack for a minigame that builds vertical tower under player when typing word in chat using !

Another Addon Used: Letter blocks addon (IDs: mrki_ab:a_white, mrki_ab:b_white, etc.) - this addon works and is enabled

Expected Behavior:

Player types: !minecraft bedrock in chat

Creates vertical tower:

player

🟨 (yellow concrete)

M I N E C R A F T

⬜ (white concrete - represents space)

B E D R O C K

Technical Details:

Bedrock 1.21.131

Behavior Pack only

Script API on (Beta APIs enabled)

@minecraft/server

UTF-8 script

dimension.runCommandAsync

No syntax errors

Correct manifest

No errors on import

Problem: Nothing happens when triggering
Status: EXTENSIVE troubleshooting with 70 replies - behavior pack files attached
Note: Looking for help to DEBUG existing addon, not rebuild from scratch

Posts from 1 Day Ago
Post 8: offhand equipment slot
Author: flipoff
Tags: Question
Posted: 27d ago
Replies: 3
Description: i have this error
Status: Error troubleshooting in progress
Image: Error screenshot included
Solution Status: Being debugged in replies

Post 9: How to spawn an arrow and change its damage?
Author: LuReN
Tags: Question, Beta APIs
Posted: 27d ago
Replies: 13
Code Provided:

javascript
const arrow = world.getDimension("Overworld").spawnEntity("minecraft:arrow", location);
Question: How can I change its damage?
Status: 13 replies with various approaches
Key Discussion Points:

Arrow damage modification techniques

Entity property manipulation

Beta API usage for projectiles

Post 10: Which one should i choose?
Author: Weisstersire
Tags: Question
Posted: 27d ago
Replies: 9
Description: I have two initializations, but i only want to use one of them yada-yada-yada now idk which one to use

Goal: I wanna make item to inflict effects when consumed

Technical Versions:

NPM: 2.3.0 stable

API: 1.21.120

Status: 9 replies comparing approaches and recommending best practice
Image: Code comparison screenshot included

Post 11: Delay in server
Author: Zeon
Tags: Question, Beta APIs, GameTest
Posted: 28d ago
Replies: 27
Problem: Created a particle script that follows the player. In local world, it follows smoothly, but in server there is delay.

Status: 27 replies discussing:

Performance optimization techniques

Server-side vs client-side particle rendering

Tick rate and update frequency solutions

Network latency considerations

Image: Demonstration of lag included

Post 12: Data
Author: BedrockTechnoYT
Tags: Question
Posted: 28d ago
Replies: 2
Question: How do we get the item data value out of an item (js)?
Status: Quick question with 2 direct answers provided

Post 13: command builder problem ✅ RESOLVED
Author: vector
Tags: Question, Beta APIs, Resolved
Posted: 28d ago (edited)
Replies: 1

Problem: i have a problem in this code it detects all of the options as "off" options even if i select the "on" option

Code Snippet:

javascript
system.beforeEvents.startup.subscribe((event) => {
    const registry = event.commandRegistry || event...
Status: ✅ RESOLVED - Solution provided in reply
Image: Code screenshot with issue highlighted
Solution: Check replies for fix (1 reply contains working solution)

Post 14: [solved] script for a projectile to break blocks ✅
Author: Whiteklr
Tags: Question
Posted: 28d ago (edited)
Replies: 4

Question: sry im rly bad at scripting, does anyone know how can I make a script so my projectile can break all blocks except some specific blocks?

Status: ✅ SOLVED - Working solution provided
Solution Details: 4 replies contain:

Code for projectile break mechanics

Whitelist/blacklist approach for specific blocks

Event handling for projectile impacts

Post 15: Remove knockback
Author: Beyond64
Tags: Question
Posted: 28d ago
Replies: 8
Question: Any way to make player take no knockback when hurt ??
Status: 8 replies with various solutions:

Component manipulation approaches

Event cancellation techniques

Velocity reset methods

Post 16: Entity Inventory Script
Author: dreamerDM8000
Tags: Beta APIs
Posted: 28d ago
Replies: 46

Complex Request: I need help to make a script that recognizes the first 5 slots of my custom entity (e.g., jm:test) from my inventory

Slot Requirements:

Slot 0: Swords only

Slot 1: Bow only

Slot 2: Helmet only

Slot 3: Chest plate only

Slot 4: Leggings only

Slot 5: Boots only

Additional Requirement: if not matching, the item will be dropped/returned to player's inventory and then armor must be equipped automatically on the entity.

Status: EXTENSIVE discussion with 46 replies
Topics Covered:

Custom entity inventory management

Slot validation systems

Item type checking

Auto-equip mechanics

Inventory component usage

Post 17: property does not exist on Entity
Author: Otter in distress
Tags: Question
Posted: 28d ago
Replies: 0

Error: [Scripting][error]-InvalidArgumentError: Invalid value passed to argument [0]. Property "mypack:isKnight" is not defined on entity.

Code:

javascript
const isKnight = attacker.getProperty("mypack:isKnight")
Entity Property (defined in BP file):

json
"mypack:isKnight": {
    "type": "bool",
    "default": false
}
Context: attacker is a npc

Problem: Entity property is defined in behavior pack file but script cannot find it
Status: Awaiting solutions - possible manifest/registration issue

Post 18: how to check if entity is in component group
Author: Otter in distress
Tags: Question
Posted: 28d ago
Replies: 2
Question: is it possible to get if entity is in a component group?
Status: 2 quick replies with solutions provided

Post 19: Cycling block state
Author: Xenith96
Tags: Question
Posted: 28d ago
Replies: 15
Question: How can I cycle through the state of a block? Currently my script only accounts for switching between two states.
Status: 15 replies discussing:

Block permutation cycling

State arrays and iteration

Toggle vs cycle mechanics

Multiple state handling

Post 20: Error with getting topmostblock ✅ RESOLVED
Author: Clocktoon
Tags: Question, Resolved, UI & Forms
Posted: 28d ago
Replies: 3

Problem: Script is meant to get a location and spawn an entity at the highest block but encountering errors

Code Snippet:

javascript
import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
world...
Status: ✅ RESOLVED in 3 replies
Image: Error screenshot showing the issue
Solution: Check replies for working fix

Post 21: Pathfinding
Author: Nekode
Tags: Question
Posted: 28d ago
Replies: 19

Complex Request: Need a good pathfinding system for game. The 2 provided images represent a 2D map.

Map Tile Legend:

Black = Wall

Gray = Gate

Blue = Quarters / Houses

Green = Town Hall

Red 1 = Enemies

Red 2 = Enemy Spawn

Requirements:

Performant pathfinding system (considering Field-Flow algorithm)

Dynamic recompilation when walls are destroyed

Path updates when new holes appear in map

Status: Extensive 19-reply discussion covering:

A* algorithm vs Field-Flow comparison

Dynamic pathfinding implementations

Performance optimization techniques

Grid-based navigation systems

Real-time map updates

Images: 2 map diagrams included showing game layout

Post 22: Entity/mob move to a specific location
Author: Otter in distress
Tags: Question
Posted: 29d ago
Replies: 0
Question: I am aware that you can apply impulse but for diagonal coordinates, is it possible? I want the mob to walk to a specific diagonal location.
Status: No replies yet - seeking diagonal movement solution

Post 23: Make entities move to specific locations
Author: Mikenator
Tags: Question
Posted: 29d ago
Replies: 2
Question: Is there a function or smth that lets you make an entity walk to a specific place.
Status: 2 quick answer replies provided
Key Topics: Navigation component, pathfinding API

Post 24: how to make a dispenser with bonemeal not "fertilize" a wheat crop when activated?
Author: omo
Tags: Question
Posted: 29d ago
Replies: 1
Request: pls help me with how the title is described. its for v1.21.130, a little strip of code for it
Version: v1.21.130
Status: 1 reply with solution code