# How to Add Sounds to Maple Bear Addon

This guide explains the complete process for adding new sounds to the Maple Bear addon. Follow these steps carefully to ensure sounds work correctly.

## Overview

Minecraft Bedrock requires sounds to be registered in **two places**:
1. `RP/sounds/sound_definitions.json` - Defines the sound files and their properties
2. `RP/sounds.json` - Maps entity events to sound identifiers (for entity sounds)

For script-triggered sounds (like proximity ambience), you only need `sound_definitions.json`.

---

## Step-by-Step Process

### Step 1: Organize Sound Files

1. **Place sound files** in the appropriate `RP/sounds/` subfolder:
   - `RP/sounds/tiny_mb/` - Tiny Maple Bear sounds
   - `RP/sounds/infected_mb/` - Infected Maple Bear sounds
   - `RP/sounds/buff_mb/` - Buff Maple Bear sounds
   - `RP/sounds/flying_mb/` - Flying Maple Bear sounds
   - `RP/sounds/mining_mb/` - Mining Maple Bear sounds
   - `RP/sounds/torpedo_mb/` - Torpedo Maple Bear sounds
   - `RP/sounds/biome_infected/` - Biome ambience sounds

2. **File naming convention**: Use lowercase with underscores
   - Example: `tiny_mb_ambient.wav`, `buff_mb_roar.wav`

3. **File format**: `.wav` or `.fsb` (both work, `.wav` is preferred for easier editing)

---

### Step 2: Add Sound Definition

Add the sound to `RP/sounds/sound_definitions.json`:

```json
{
  "format_version": "1.14.0",
  "sound_definitions": {
    "your_sound.identifier": {
      "category": "hostile",  // or "ambient", "neutral", "block", "ui"
      "min_distance": 0,
      "max_distance": 32,     // Adjust based on desired range
      "sounds": [
        {
          "name": "sounds/folder_name/file_name",  // NO .wav extension!
          "volume": 0.8
        }
      ]
    }
  }
}
```

**Important Notes:**
- Sound identifier uses dots: `tiny_mb.ambient` (not underscores)
- File path does NOT include `.wav` extension
- File path uses forward slashes: `sounds/tiny_mb/tiny_mb_ambient`
- Category affects how the sound is treated by the game

**Categories:**
- `"hostile"` - For enemy/mob sounds
- `"ambient"` - For background/atmospheric sounds
- `"neutral"` - For neutral mob sounds
- `"block"` - For block interaction sounds
- `"ui"` - For user interface sounds

---

### Step 3: Register Entity Sounds (If Applicable)

If the sound is triggered by entity events (ambient, attack, hurt, death, etc.), add it to `RP/sounds.json`:

```json
{
  "entity_sounds": {
    "entities": {
      "mb:entity_id": {
        "volume": 1,
        "pitch": 1,
        "events": {
          "ambient": {
            "sound": "sound.identifier",
            "volume": 0.8,
            "pitch": 1
          },
          "attack": "sound.identifier",
          "hurt": "sound.identifier",
          "death": "sound.identifier"
        }
      }
    }
  }
}
```

**Entity Event Types (Valid LevelSoundEvents):**
- `"ambient"` - Idle/ambient sounds (plays periodically)
- `"attack"` - Attack sounds
- `"hurt"` - Hurt/pain sounds
- `"death"` - Death sounds
- `"step"` - Footstep sounds
- `"roar"` - Special roar/ability sounds (if supported)

**⚠️ IMPORTANT: Custom Events Must Use Scripts**
The following are **NOT** valid LevelSoundEvents and **MUST** be handled by scripts:
- `"flight"` - Flight/wing sounds (use periodic script playback)
- `"dive"` - Dive attack sounds (trigger in entityHurt event handler)
- `"dig"` - Digging sounds (trigger when blocks are broken)
- `"explode"` - Explosion sounds (trigger in explosion handler)

If you try to use these in `sounds.json`, you'll get errors like:
```
[Sound][error]-sounds.json | entity_sounds | mb:entity | events | dive | Event name 'dive' is not a valid LevelSoundEvent
```

**Short vs Long Format:**
- Short format: `"ambient": "sound.identifier"` (uses default volume/pitch)
- Long format: `"ambient": { "sound": "sound.identifier", "volume": 0.8, "pitch": 1 }` (custom volume/pitch)

---

### Step 4: Add All Entity Variants

**CRITICAL**: You must add sounds for ALL entity variants (day 4, day 8, day 13, day 20, etc.):

```json
"mb:mb": { ... },
"mb:mb_day4": { ... },
"mb:mb_day8": { ... },
"mb:mb_day13": { ... },
"mb:mb_day20": { ... }
```

You can use the short format to reference the same sound:
```json
"mb:mb_day4": {
  "events": {
    "ambient": "tiny_mb.ambient",
    "attack": "tiny_mb.attack"
  }
}
```

---

### Step 5: Script-Triggered Sounds (Required for Custom Events)

For sounds triggered by scripts (like proximity ambience, dive attacks, digging, explosions), you only need `sound_definitions.json`. Then use in scripts:

```javascript
// Player-triggered sounds
player.playSound("sound.identifier", {
    pitch: 1.0,
    volume: 0.6 * volumeMultiplier
});

// World/dimension-triggered sounds
dimension.playSound("sound.identifier", location, {
    volume: 0.7,
    pitch: 1.0
});

// Or using commands (fallback)
dimension.runCommandAsync(
    `playsound sound.identifier @a[x=${x},y=${y},z=${z},r=32] ${x} ${y} ${z} 0.7 1.0`
);
```

**Common Script Triggers:**
- **Dive attacks**: In `world.afterEvents.entityHurt` when flying bear attacks player
- **Digging**: When mining bear breaks a block in `clearBlock` function
- **Explosions**: In torpedo exhaustion handler when torpedo explodes
- **Flight sounds**: Periodic playback in AI loop (every 40-50 ticks)

**Note**: For looping sounds, restart them periodically (every 5 seconds / 100 ticks) since Bedrock doesn't support native looping.

---

## Complete Example: Adding Tiny Bear Sounds

### 1. Files Organized
```
RP/sounds/tiny_mb/
  - tiny_mb_ambient.wav
  - tiny_mb_attack.wav
  - tiny_mb_hurt.wav
  - tiny_mb_death.wav
```

### 2. Sound Definitions (`RP/sounds/sound_definitions.json`)
```json
{
  "tiny_mb.ambient": {
    "category": "hostile",
    "min_distance": 0,
    "max_distance": 16,
    "sounds": [
      {
        "name": "sounds/tiny_mb/tiny_mb_ambient",
        "volume": 0.6
      }
    ]
  },
  "tiny_mb.attack": {
    "category": "hostile",
    "min_distance": 0,
    "max_distance": 16,
    "sounds": [
      {
        "name": "sounds/tiny_mb/tiny_mb_attack",
        "volume": 0.7
      }
    ]
  }
  // ... etc
}
```

### 3. Entity Sounds (`RP/sounds.json`)
```json
{
  "entity_sounds": {
    "entities": {
      "mb:mb": {
        "volume": 1,
        "pitch": 1,
        "events": {
          "ambient": "tiny_mb.ambient",
          "attack": "tiny_mb.attack",
          "hurt": "tiny_mb.hurt",
          "death": "tiny_mb.death"
        }
      },
      "mb:mb_day4": {
        "events": {
          "ambient": "tiny_mb.ambient",
          "attack": "tiny_mb.attack",
          "hurt": "tiny_mb.hurt",
          "death": "tiny_mb.death"
        }
      }
      // ... all other variants
    }
  }
}
```

---

## Common Mistakes to Avoid

1. **Forgetting to update `RP/sounds.json`** - Entity sounds won't play without this!
2. **Including `.wav` extension in paths** - Use `sounds/folder/file` not `sounds/folder/file.wav`
3. **Not adding all entity variants** - Day 4, 8, 13, 20 variants all need entries
4. **Wrong sound identifier format** - Use dots: `tiny_mb.ambient` not `tiny_mb_ambient`
5. **Incorrect file paths** - Must match actual folder structure exactly
6. **Missing sound definitions** - Script-triggered sounds still need `sound_definitions.json`

---

## Testing Sounds

1. **Entity sounds**: Spawn the entity and trigger the event (attack, hurt, etc.)
2. **Script sounds**: Check console for debug messages and errors
3. **Check console**: Look for error messages about missing sounds
4. **Verify file paths**: Ensure files exist at the specified paths

---

## File Structure Reference

```
RP/
  sounds/
    sound_definitions.json    ← Define all sounds here
    sounds.json               ← Map entity events to sounds
    tiny_mb/
      tiny_mb_ambient.wav
      tiny_mb_attack.wav
      ...
    infected_mb/
      infected_mb_ambient.wav
      ...
    buff_mb/
      buff_mb_roar.wav
      ...
    biome_infected/
      biome_infected_1.wav
      ...
```

---

## Quick Checklist

When adding new sounds, ensure you:

- [ ] Files placed in correct `RP/sounds/` subfolder
- [ ] Sound definition added to `RP/sounds/sound_definitions.json`
- [ ] Entity sound events added to `RP/sounds.json` (if entity sound)
- [ ] All entity variants added (day 4, 8, 13, 20, etc.)
- [ ] File paths don't include `.wav` extension
- [ ] Sound identifiers use dots, not underscores
- [ ] Tested in-game to verify sounds play

---

## Additional Notes

- **Sound volume**: Adjust in both `sound_definitions.json` and `sounds.json` if needed
- **Distance**: `max_distance` in `sound_definitions.json` controls how far sounds can be heard
- **Looping**: Script-triggered looping sounds need periodic restarts (every 100 ticks)
- **Format**: `.wav` files work, but `.fsb` is more compressed (used for some existing sounds)

