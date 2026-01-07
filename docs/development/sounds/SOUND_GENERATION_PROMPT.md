# Maple Bear Apocalypse - Sound Generation Prompt Guide

## Purpose
This document is designed to be given to an AI assistant that will create detailed prompts for sound generation AI tools (like ElevenLabs, or other voice/sound synthesis tools). The goal is to generate a comprehensive sound library for the Maple Bear Apocalypse Minecraft Bedrock addon.

---

## Context: What Are Maple Bears?

### Origin Story
- **Concept Origin**: Based on an inside joke about the Teeny Beany Baby "Maple Bear" toy
- **In-Game Lore**: Maple Da Bear is a fictional "drug lord" character
- **Transformation**: A mysterious white powdery substance has infected the world, transforming players and mobs into Maple Bears
- **Identity**: They are **infected/transformed players and mobs**, not original bears
- **Retention**: They retain **slight bear-like traits** in their sounds, but are **mostly human-like** for the Maple Bears specifically

### Physical Characteristics
- **Damaged throats**: All Maple Bears have damaged, corrupted throats from the infection
- **Dust-filled lungs**: Their respiratory system is filled with the white powdery substance
- **Size variations**:
  - **Tiny Maple Bears**: Less than one block tall (0.3x0.5 collision box)
  - **Infected Maple Bears**: Same size as human (0.5x1.9 collision box)
  - **Buff Maple Bears**: Almost twice as tall as a human (0.3x0.7 collision box, but very tall)
  - **Flying Maple Bears**: Similar to infected size, but with wings
  - **Mining Bears**: Similar to infected size
  - **Torpedo Bears**: Similar to infected size, but streamlined for flight

### Vocal Characteristics
- **Base Style**: **Mixed** - Bear-like sounds mixed with human-like elements
- **Dust-Choked Quality**: **Combination** of:
  - Choking/gasping (struggling to breathe)
  - Raspy/dry (throat full of dust)
  - Muffled (like speaking through powder)
  - Wheezy/breathless
- **Emotional Tone**: **Situational**
  - **Idle/Not Attacking**: Raspy, wheezy, mindless, empty
  - **Targeting/Attacking**: Aggravated, aggressive, desperate, compelled
  - **Hurt**: Painful, suffering, but still corrupted
  - **Death**: Final, but with dust-choked quality

### Size-Based Sound Characteristics
- **Tiny Maple Bears**: 
  - Tiny, quieter sounds
  - Higher pitch (but still corrupted)
  - Less powerful, but still unsettling
- **Infected Maple Bears**: 
  - Human-sized, medium volume
  - Standard corrupted human-bear hybrid sounds
  - Dust-choked roars (existing, but needs improvement)
- **Buff Maple Bears**: 
  - Deeper sounds
  - More scary/intimidating
  - Powerful, resonant (but still corrupted)
  - Much louder than other types

---

## Bear Types and Their Characteristics

### 1. Tiny Maple Bears (mb:mb, mb:mb_day4, mb:mb_day8, mb:mb_day13, mb:mb_day20)
- **Spawn**: Day 2+
- **Size**: Less than one block tall
- **Health**: 1 HP
- **Damage**: 1
- **Behavior**: Weak, numerous, first threat
- **Movement Speed**: 0.35 (slow)
- **Sound Characteristics**: 
  - Tiny, quiet, higher pitch
  - Still corrupted/dust-choked
  - Less intimidating but unsettling
  - Should sound like a small corrupted creature

### 2. Infected Maple Bears (mb:infected, mb:infected_day8, mb:infected_day13, mb:infected_day20)
- **Spawn**: Day 4+
- **Size**: Same as human
- **Health**: 30 HP
- **Damage**: 4
- **Behavior**: Stronger, spread infection
- **Movement Speed**: Standard
- **Sound Characteristics**: 
  - Human-sized, medium volume
  - Standard corrupted human-bear hybrid
  - **Existing Sounds**: "Dust_choked_roar1/2/3" (idle sounds - need improvement)
  - Should sound like a corrupted human trying to roar/groan
  - More aggressive when targeting players

### 3. Buff Maple Bears (mb:buff_mb, mb:buff_mb_day13, mb:buff_mb_day20)
- **Spawn**: Day 8+
- **Size**: Almost twice as tall as human
- **Health**: 100 HP
- **Damage**: 8
- **Behavior**: Mini-bosses, limited spawns
- **Movement Speed**: 0.6 (moderate)
- **Special Ability**: Knockback roar (powerful area attack)
- **Sound Characteristics**: 
  - Deeper, more scary/intimidating
  - Powerful, resonant (but still corrupted)
  - Much louder than other types
  - **Special**: Needs a powerful roar sound for the knockback ability
  - Should sound like a corrupted giant

### 4. Flying Maple Bears (mb:flying_mb, mb:flying_mb_day15, mb:flying_mb_day20)
- **Spawn**: Day 15+
- **Size**: Similar to infected
- **Health**: 4 HP
- **Damage**: 4
- **Behavior**: Counter sky bases, fly
- **Movement Speed**: Flying speed (1.2)
- **Sound Characteristics**: 
  - Similar to infected, but with flying elements
  - Wing sounds (flapping, whooshing)
  - Should sound corrupted but airborne
  - May have wind/dust sounds when diving

### 5. Mining Bears (mb:mining_mb, mb:mining_mb_day20)
- **Spawn**: Day 20+
- **Size**: Similar to infected
- **Health**: 25 HP
- **Damage**: 6
- **Behavior**: Smart pathfinding, dig to underground bases
- **Movement Speed**: Standard
- **Sound Characteristics**: 
  - Similar to infected, but with digging elements
  - Digging/breaking block sounds
  - Should sound corrupted but determined
  - May have earth/stone sounds when mining

### 6. Torpedo Bears (mb:torpedo_mb, mb:torpedo_mb_day20)
- **Spawn**: Day 20+
- **Size**: Similar to infected, streamlined
- **Health**: 7 HP
- **Damage**: 2
- **Behavior**: Sky-borne threats, explosive attacks, very fast
- **Movement Speed**: 0.85 ground, 1.2 flying (very fast)
- **Special Ability**: Explosive dust attack
- **Sound Characteristics**: 
  - Similar to infected, but with speed elements
  - Whooshing/dive sounds
  - **Special**: Needs explosion sound with dust effects
  - Should sound corrupted but fast/agile
  - May have wind rush sounds when diving

---

## Sound Types Needed

### For Each Bear Type (Tiny, Infected, Buff, Flying, Mining, Torpedo):

#### 1. Ambient/Idle Sounds
- **Purpose**: Play when bear is not attacking, just existing
- **Characteristics**: 
  - Raspy, wheezy, mindless
  - Dust-choked groans
  - Breathing sounds (labored, dust-filled)
  - Occasional low growls/roars
  - Should vary in frequency and intensity
- **Quantity**: 3-5 variations per bear type
- **Duration**: 1-3 seconds each
- **Frequency**: Should play occasionally, not constantly

#### 2. Attack Sounds
- **Purpose**: Play when bear attacks a player
- **Characteristics**: 
  - Aggravated, aggressive
  - Desperate, compelled
  - Should sound like they're trying to harm
  - Mix of growls, roars, and corrupted human sounds
- **Quantity**: 2-4 variations per bear type
- **Duration**: 0.5-2 seconds each
- **Frequency**: Play on each attack

#### 3. Hurt/Pain Sounds
- **Purpose**: Play when bear takes damage
- **Characteristics**: 
  - Painful, suffering
  - Still corrupted/dust-choked
  - Should sound like they're in pain but still aggressive
  - Mix of human pain sounds and bear-like growls
- **Quantity**: 3-5 variations per bear type
- **Duration**: 0.5-1.5 seconds each
- **Frequency**: Play when damaged

#### 4. Death Sounds
- **Purpose**: Play when bear dies
- **Characteristics**: 
  - Final, conclusive
  - Still dust-choked
  - Should sound like final breath/gasp
  - Mix of human death sounds and bear-like final growl
- **Quantity**: 1-2 variations per bear type
- **Duration**: 1-3 seconds each
- **Frequency**: Play once on death

#### 5. Movement Sounds
- **Purpose**: Play when bear moves
- **Characteristics**: 
  - Footsteps (for ground-based bears)
  - Wing flaps (for flying bears)
  - Digging sounds (for mining bears)
  - Should match the bear's size and movement type
- **Quantity**: 2-4 variations per movement type
- **Duration**: 0.2-0.5 seconds each
- **Frequency**: Play on each step/movement

#### 6. Special Ability Sounds

##### Buff Bear Roar
- **Purpose**: Play when buff bear uses knockback roar ability
- **Characteristics**: 
  - Powerful, intimidating
  - Deep, resonant
  - Should sound like a corrupted giant roaring
  - Much louder than normal sounds
- **Quantity**: 1-2 variations
- **Duration**: 2-4 seconds
- **Frequency**: Play when ability activates

##### Torpedo Bear Explosion
- **Purpose**: Play when torpedo bear explodes (dust explosion)
- **Characteristics**: 
  - Explosive, impactful
  - Should have dust/powder sound elements
  - Mix of explosion and dust cloud sounds
  - Should sound like white powder dispersing
- **Quantity**: 1-2 variations
- **Duration**: 1-3 seconds
- **Frequency**: Play when explosion occurs

##### Mining Bear Digging
- **Purpose**: Play when mining bear actively digs
- **Characteristics**: 
  - Breaking block sounds
  - Earth/stone sounds
  - Should sound like determined digging
  - Mix of block breaking and corrupted breathing
- **Quantity**: 2-3 variations
- **Duration**: 0.5-1.5 seconds each
- **Frequency**: Play when actively mining

##### Flying Bear Dive
- **Purpose**: Play when flying bear dives at player
- **Characteristics**: 
  - Whooshing wind sounds
  - Wing rush sounds
  - Should sound fast and aggressive
  - Mix of wind and corrupted vocalizations
- **Quantity**: 1-2 variations
- **Duration**: 1-2 seconds
- **Frequency**: Play when diving

---

## Biome Ambience

### Infected Biome Ambience
- **Purpose**: Background atmosphere for infected/corrupted biomes
- **Characteristics**: 
  - **Super dusty sounds** (primary characteristic)
  - **Desert-like** (dry, sandy, windy)
  - Should sound like a dusty, corrupted wasteland
  - Mix of:
    - Wind through dust/powder
    - Distant corrupted sounds (faint bear sounds)
    - Dust settling/shifting
    - Dry, desolate atmosphere
    - Occasional distant groans/roars
- **Day Progression**: 
  - **Early Days (1-10)**: Lighter, more mysterious, less intense
  - **Mid Days (11-20)**: More intense, more corrupted sounds
  - **Late Days (21+)**: Very intense, very corrupted, more aggressive
- **Quantity**: 5-10 variations
- **Duration**: 10-30 seconds each (looping)
- **Frequency**: Continuous background ambience

### Dimension Variations
- **Overworld**: Standard infected biome ambience
- **Nether**: Louder, more intense, with fire/lava elements (but still dusty)
- **End**: Quieter, more desolate, with void-like elements (but still dusty)

---

## Technical Specifications

### File Format
- **Preferred**: WAV format (uncompressed, high quality)
- **Alternative**: OGG Vorbis (compressed, good quality)
- **Sample Rate**: 44.1 kHz or 48 kHz
- **Bit Depth**: 16-bit or 24-bit
- **Channels**: Mono or Stereo (mono preferred for most sounds)

### Volume Levels
- **Tiny Bears**: Lower volume (0.6-0.8x)
- **Infected Bears**: Standard volume (1.0x)
- **Buff Bears**: Higher volume (1.2-1.5x)
- **Flying/Mining/Torpedo**: Standard volume (1.0x)
- **Biome Ambience**: Background level (0.3-0.5x)

### Naming Convention
- **Format**: `{bear_type}_{sound_type}_{variation}.wav`
- **Examples**: 
  - `tiny_mb_ambient_1.wav`
  - `infected_mb_attack_1.wav`
  - `buff_mb_roar_1.wav`
  - `flying_mb_hurt_1.wav`
  - `mining_mb_dig_1.wav`
  - `torpedo_mb_explosion_1.wav`
  - `biome_infected_ambient_1.wav`

---

## Prompt Engineering Guidelines

### For Sound Generation AI (ElevenLabs, etc.)

When creating prompts for sound generation, use this structure:

#### Example Prompt Template:

```
Create a [SOUND_TYPE] sound for a [BEAR_TYPE] Maple Bear.

Context:
- This is a corrupted/infected creature, originally a human/mob transformed by a mysterious white powdery substance
- The creature has damaged throats and dust-filled lungs
- Size: [SIZE_DESCRIPTION]
- Current state: [IDLE/ATTACKING/HURT/DEATH]

Sound Characteristics:
- Base: Mixed bear-like and human-like vocalizations
- Dust-choked quality: [CHOKING/RASPY/MUFFLED/WHEEZY or COMBINATION]
- Emotional tone: [RASPY/WHEEZY/MINDLESS/AGGRESSIVE/DESPERATE/PAINFUL]
- Volume: [LOW/MEDIUM/HIGH]
- Pitch: [HIGH/MEDIUM/LOW]

Specific Requirements:
- [SPECIFIC_SOUND_REQUIREMENTS]

Duration: [X] seconds
Variations needed: [N] variations
```

#### Specific Prompt Examples:

**Example 1: Tiny Bear Ambient Sound**
```
Create an ambient idle sound for a Tiny Maple Bear.

Context:
- This is a corrupted creature, less than one block tall
- Originally a human/mob transformed by white powdery substance
- Has damaged throat and dust-filled lungs
- Currently idle, not attacking

Sound Characteristics:
- Base: Mixed bear-like and human-like, but tiny
- Dust-choked quality: Combination of choking, raspy, muffled, and wheezy
- Emotional tone: Raspy, wheezy, mindless, empty
- Volume: Low (tiny creature)
- Pitch: Higher than normal (small size), but still corrupted

Specific Requirements:
- Should sound like a small corrupted creature breathing/groaning
- Quiet, unsettling, but not intimidating
- Dust-choked quality should be present but subtle
- 1-2 seconds duration
- Should be eerie but not scary

Create 3 variations of this sound.
```

**Example 2: Buff Bear Roar**
```
Create a powerful roar sound for a Buff Maple Bear's special ability.

Context:
- This is a corrupted creature, almost twice as tall as a human
- Originally a human/mob transformed by white powdery substance
- Has damaged throat and dust-filled lungs
- Currently using special knockback roar ability

Sound Characteristics:
- Base: Mixed bear-like and human-like, but deep and powerful
- Dust-choked quality: Combination of choking, raspy, muffled, and wheezy
- Emotional tone: Aggressive, aggravated, desperate, compelled
- Volume: High (powerful creature)
- Pitch: Low/deep (large size), but still corrupted

Specific Requirements:
- Should sound like a corrupted giant roaring
- Powerful, intimidating, resonant
- Dust-choked quality should be present but not overwhelming the power
- Should have impact and force
- 2-4 seconds duration
- Should be scary and threatening

Create 2 variations of this sound.
```

**Example 3: Infected Biome Ambience**
```
Create ambient background sound for an infected biome.

Context:
- This is a corrupted wasteland filled with white powdery substance
- The area is super dusty, like a desert
- Bears and other corrupted creatures roam here
- The corruption intensifies over time

Sound Characteristics:
- Primary: Super dusty, desert-like atmosphere
- Mix of: Wind through dust/powder, distant corrupted sounds, dust settling/shifting
- Dry, desolate, corrupted atmosphere
- Occasional distant groans/roars

Specific Requirements:
- Should sound like a dusty, corrupted wasteland
- Windy, dry, sandy
- Faint corrupted sounds in the distance
- Should be atmospheric and immersive
- 10-30 seconds duration (looping)
- Should be eerie and unsettling

Create 5 variations of this sound for different day progression levels.
```

---

## Implementation Notes

### Current State
- **Existing Sounds**: 
  - Infected Maple Bears have "Dust_choked_roar1/2/3" idle sounds (need improvement)
  - Infected pigs have complete sound sets (can use as reference)
  - Infected cows have complete sound sets (can use as reference)
  - Tiny and Buff bears have step sounds
- **Missing Sounds**: 
  - Most ambient/idle sounds (except infected)
  - Most attack sounds
  - Most hurt sounds
  - Most death sounds
  - Special ability sounds (roar, explosion, digging, dive)
  - Biome ambience

### Future Considerations
- **Day Variants**: Currently, sounds are per bear type, not per day variant. In the future, day variants (Day 8, Day 13, Day 20) may have slightly different sounds (more corrupted). For now, can adjust frequency/pitch of existing sounds.
- **More Corrupted = More Corrupted Sounds**: As bears evolve (higher day variants), their sounds should become more corrupted/distorted.

---

## Summary Checklist

### Sound Types Needed:
- [ ] Tiny Bear: Ambient, Attack, Hurt, Death, Movement
- [ ] Infected Bear: Ambient (improve existing), Attack, Hurt, Death, Movement
- [ ] Buff Bear: Ambient, Attack, Hurt, Death, Movement, Special Roar
- [ ] Flying Bear: Ambient, Attack, Hurt, Death, Movement (flying), Special Dive
- [ ] Mining Bear: Ambient, Attack, Hurt, Death, Movement, Special Digging
- [ ] Torpedo Bear: Ambient, Attack, Hurt, Death, Movement (flying), Special Explosion
- [ ] Biome Ambience: Infected biome (multiple variations for day progression)

### Total Estimated Sounds Needed:
- **Per Bear Type**: ~15-20 sounds (ambient, attack, hurt, death, movement, special)
- **6 Bear Types**: ~90-120 sounds
- **Biome Ambience**: ~5-10 sounds
- **Total**: ~95-130 sounds

---

## Final Notes

This document should be given to an AI assistant that specializes in prompt engineering for sound generation. The AI should:
1. Read this document thoroughly
2. Understand the context and characteristics
3. Create detailed, specific prompts for each sound needed
4. Format prompts appropriately for the target sound generation tool (ElevenLabs, etc.)
5. Ensure consistency across all sounds (same corruption/dust-choked quality)
6. Consider the emotional tone and situational context for each sound
7. Account for size-based variations (tiny = quiet/high, buff = loud/deep)

The goal is to create a cohesive, immersive sound library that enhances the horror/apocalypse atmosphere of the Maple Bear Apocalypse addon.

