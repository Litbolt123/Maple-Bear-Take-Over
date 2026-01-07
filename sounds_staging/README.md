# Sounds Staging Folder

This folder is for temporarily storing sound files before they are organized into their final locations in `RP/sounds/`.

## Organization Structure

Once sounds are ready, they should be organized as follows:

### Bear Sounds
- `RP/sounds/tiny_mb/` - Tiny Maple Bear sounds
- `RP/sounds/infected_mb/` - Infected Maple Bear sounds (already exists)
- `RP/sounds/buff_mb/` - Buff Maple Bear sounds
- `RP/sounds/flying_mb/` - Flying Maple Bear sounds
- `RP/sounds/mining_mb/` - Mining Maple Bear sounds
- `RP/sounds/torpedo_mb/` - Torpedo Maple Bear sounds

### Biome Ambience
- `RP/sounds/biome_infected/` - Infected biome ambient sounds

### Existing Sounds
- `RP/sounds/infected_pig/` - Infected pig sounds (already exists)
- `RP/sounds/infected_cow/` - Infected cow sounds (already exists)
- `RP/sounds/Block Sounds/` - Block interaction sounds (already exists)
- `RP/sounds/Dusted Journal/` - Journal UI sounds (already exists)

## Naming Convention

Files should follow the naming convention from `docs/maple_bear_sound_prompts.md`:
- `{bear_type}_{sound_type}_{variation}.wav`
- Examples: `tiny_mb_ambient_1.wav`, `buff_mb_roar_1.wav`, `torpedo_mb_explosion_1.wav`

## File Format

- **Preferred**: WAV format (uncompressed, high quality)
- **Alternative**: OGG Vorbis (compressed, good quality)
- **Sample Rate**: 44.1 kHz or 48 kHz
- **Bit Depth**: 16-bit or 24-bit
- **Channels**: Mono or Stereo (mono preferred for most sounds)

## Next Steps

1. Generate sounds using the prompts in `docs/maple_bear_sound_prompts.md`
2. Dump all generated files into this staging folder
3. Organize files into appropriate subfolders
4. Move organized folders to `RP/sounds/`
5. Update `RP/sounds/sound_definitions.json` with new sound definitions


