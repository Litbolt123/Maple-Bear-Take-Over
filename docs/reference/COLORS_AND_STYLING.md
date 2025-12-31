# Colors and Styling Reference

This document lists all color codes and easy-to-change styling elements in the Maple Bear TakeOver addon. Use this as a quick reference when you want to adjust colors manually without using AI credits.

## Minecraft Color Codes

| Code | Color | Name |
|------|-------|------|
| `§0` | Black | Very dark text |
| `§1` | Dark Blue | Dark blue text |
| `§2` | Dark Green | Dark green text |
| `§3` | Dark Aqua | Dark cyan text |
| `§4` | Dark Red | Dark red text |
| `§5` | Dark Purple | Dark purple text |
| `§6` | Gold | Gold/amber text |
| `§7` | Gray | Gray text (default body text) |
| `§8` | Dark Gray | Dark gray text (hidden/unknown info) |
| `§9` | Blue | Blue text |
| `§a` | Green | Green text (positive/healthy) |
| `§b` | Aqua | Aqua/cyan text |
| `§c` | Red | Red text (danger/infected) |
| `§d` | Light Purple | Light purple text |
| `§e` | Yellow | Yellow text (warnings/goals) |
| `§f` | White | White text (emphasis) |

## Formatting Codes

| Code | Effect |
|------|--------|
| `§k` | Obfuscated (random characters) |
| `§l` | Bold |
| `§m` | Strikethrough |
| `§n` | Underline |
| `§o` | Italic |
| `§r` | Reset (removes all formatting) |

## Basic Journal UI Colors

**File:** `BP/scripts/mb_codex.js` (around line 2900-2913)

### Title
- **Basic Journal Title**: `§6` (Gold) - Line 2902
- **Welcome Screen Title**: `§6` (Gold) - Line 2936

### Body Text
- **Welcome Message**: `§7` (Gray) - Line 2908
- **Welcome Screen Body**: `§e` (Yellow) for "Welcome, Survivor!" and `§7` (Gray) for rest - Line 2937

### Buttons
- **"Your Goal" Button**: `§e` (Yellow) - Line 2910
- **"Settings" Button**: `§b` (Aqua) - Line 2911
- **"Recipe: Powdery Journal" Button**: `§a` (Green) - Line 2912
- **"Tips" Button**: `§e` (Yellow) - Line 2913
- **"Yes, Play Audio" Button**: `§a` (Green) - Line 2938
- **"Skip for Now" Button**: `§7` (Gray) - Line 2939

### Button Icons
- **Your Goal Icon**: `textures/items/mb_snow` - Line 2910
- **Settings Icon**: `textures/ui/settings_glyph_color_2x` - Line 2911
- **Recipe Icon**: `textures/items/snow_book` - Line 2912
- **Tips Icon**: `textures/items/book_writable` - Line 2913

## Powdery Journal UI Colors

**File:** `BP/scripts/mb_codex.js` (around line 733+)

### Main Menu
- **Title**: `§6Powdery Journal` - Line 733
- **Body Summary Text**: `§7` (Gray) for most text, `§e` (Yellow) for "Choose a section:" - Line 734
- **Status Colors**:
  - Infected: `§c` (Red) - Line 690
  - Healthy: `§a` (Green) - Line 707
  - Previously Infected: `§a` (Green) - Line 705
  - Immunity Active: `§b` (Aqua) - Line 715
  - No Immunity: `§7` (Gray) - Line 717

### Section Buttons
- **Infection Button**: `§f` (White) - Line 741
- **Symptoms Button**: `§f` (White) - Line 752
- **Mobs Button**: `§f` (White) - Line 759
- **Items Button**: `§f` (White) - Line 766
- **Biomes Button**: `§f` (White) - Line 772
- **Late Lore Button**: `§f` (White) - Line 778
- **Timeline Button**: `§f` (White) - Line 787
- **Achievements Button**: `§f` (White) - Line 794
- **Debug Menu Button**: `§b` (Aqua) - Line 801
- **Developer Tools Button**: `§c` (Red) - Line 803
- **Settings Button**: `§e` (Yellow) - Line 808
- **Search Button**: `§b` (Aqua) - Line 814

### Back Buttons
- **Back Button**: `§8` (Dark Gray) - Used throughout (e.g., Line 886, 916, 940)

### Infection Section
- **Section Title**: `§6Infection` - Line 845
- **Cure Text**: `§7` (Gray) if known, `§8` (Dark Gray) if unknown - Line 849
- **Notes**: `§7` (Gray) - Line 850
- **Mechanics Title**: `§6` (Gold) - Line 852
- **Mechanics List**: `§7` (Gray) - Lines 853-857

### Symptoms Section
- **Section Title**: `§6Symptoms` - Line 911
- **No Symptoms Message**: `§7` (Gray) and `§8` (Dark Gray) - Line 915
- **Category Buttons**:
  - Infection Level Analysis: `§e` (Yellow) - Line 924
  - Infection Symptoms: `§c` (Red) - Line 930
  - Snow Effects: `§b` (Aqua) - Line 936

### Snow Effects
- **Positive Effects**: `§a` (Green) with `§a+` prefix - Line 1073
- **Harmful Effects**: `§c` (Red) with `§c-` prefix - Line 1073
- **Effect Type Labels**: `§aBeneficial` or `§cHarmful` - Line 1099

### Infection Level Analysis
- **Tier Labels**: `§7` (Gray) - Lines 1127-1163
- **Tier Names**: `§f` (White) - Lines 1127-1163

### Mobs Section
- **Section Title**: `§6Mobs` - Line 1205
- **Entries Label**: `§7` (Gray) - Line 1206
- **Mob Buttons**: `§f` (White) for known mobs - Line 1237

### Items Section
- **Section Title**: `§6Items` - Line 1484
- **Entries Label**: `§7` (Gray) - Line 1485

## Day Display Colors

**File:** `BP/scripts/mb_dayTracker.js` (around line 53-175)

### Day Color Progression
- **Days 0-2 (Safe)**: `§a` (Light Green) - Line 60
- **Days 3-5 (Early Escalation)**: `§2` (Dark Green) - Line 64
- **Days 6-7 (Warning)**: `§e` (Light Yellow) normal, `§6` (Amber) milestone - Line 68
- **Day 8 (Milestone - Flying Bears)**: `§c` (Light Red) - Line 72
- **Days 9-12**: `§6` (Amber) normal, `§c` (Light Red) milestone - Line 76
- **Days 13-15**: `§c` (Light Red) - Line 80
- **Day 17 (Milestone - Torpedo Bears)**: `§4` (Dark Red) - Line 88
- **Days 18-19**: `§4` (Dark Red) - Line 96
- **Day 20 (Milestone - Major Escalation)**: `§4` (Dark Red) - Line 112
- **Days 21-24**: `§c` (Light Red) - Line 116
- **Day 25 (Victory)**: `§a` (Green) - Line 120
- **Days 26-50**: Gradient from `§c` (Light Red) → `§4` (Dark Red) → `§5` (Dark Purple) - Lines 130-138
- **Day 50 (Milestone)**: `§5` (Dark Purple) - Line 126
- **Days 51-75**: Gradient from `§5` (Dark Purple) → `§d` (Light Purple) - Lines 142-150
- **Day 75 (Milestone)**: `§d` (Light Purple) - Line 146
- **Days 76-100**: Gradient from `§d` (Light Purple) → `§9` (Blue) - Lines 154-162
- **Day 100 (Milestone)**: `§9` (Blue) - Line 158
- **Days 101+**: `§1` (Dark Blue) - Line 166

## Chat Messages

**File:** `BP/scripts/mb_codex.js` and `BP/scripts/main.js`

### Settings Messages
- **Settings Saved**: `§7Settings saved!` - Line 3128 (Basic Journal), Line 2638 (Powdery Journal)

### Discovery Messages
**File:** `BP/scripts/main.js` (around line 1106-1155)
- **Important Items**: `§7` (Gray) - Lines 1116-1119
- **Dangerous Creatures**: `§7` (Gray) - Lines 1122-1127
- **Mysterious Creatures**: `§7` (Gray) - Lines 1130-1131
- **Threatening Creatures**: `§7` (Gray) - Lines 1133+

### Sharing Messages
**File:** `BP/scripts/mb_codex.js` (around line 541-545)
- **Shared With Message**: `§7` (Gray) for text, `§f` (White) for player name, `§a` (Green) for summary - Line 541
- **Received Share Message**: `§b` (Aqua) for sender name, `§7` (Gray) for text, `§a` (Green) for summary - Line 543
- **No Journal Message**: `§7` (Gray) - Line 545

## Timeline Section Colors

**File:** `BP/scripts/mb_codex.js` (around line 2010-2035)

### Day Progression Ranges
- **Days 0-2 (Safe)**: `§a` (Light Green) - Line 2013
- **Days 3-5 (Caution)**: `§2` (Dark Green) - Line 2014
- **Days 6-7 (Warning)**: `§e` (Light Yellow) - Line 2015
- **Days 8-10 (High Danger)**: `§c` (Light Red) - Line 2016
- **Days 11-12 (Danger)**: `§6` (Amber) - Line 2017
- **Days 13-15 (Critical)**: `§c` (Light Red) - Line 2018
- **Days 16-17 (Extreme)**: `§4` (Dark Red) - Line 2019
- **Days 18-24 (Maximum)**: `§4` (Dark Red) - Line 2020
- **Day 25 (Victory)**: `§a` (Green) - Line 2021
- **Reached Ranges**: `§7` (Gray) for range, color code for label - Line 2027
- **Upcoming Ranges**: `§8` (Dark Gray) - Line 2030
- **Hidden Ranges**: `§8` (Dark Gray) - Line 2033

## Quick Color Change Guide

### To Change a Color:
1. Open the file listed in the section above
2. Find the line number mentioned
3. Replace the color code (e.g., `§7` → `§e` for yellow)
4. Save the file

### Common Color Swaps:
- **Make text more visible**: Change `§7` (Gray) to `§e` (Yellow) or `§f` (White)
- **Make text less prominent**: Change bright colors to `§7` (Gray) or `§8` (Dark Gray)
- **Emphasize important info**: Use `§f` (White) or `§e` (Yellow)
- **Show danger/warning**: Use `§c` (Red) or `§6` (Amber)
- **Show positive/healthy**: Use `§a` (Green)
- **Show unknown/hidden**: Use `§8` (Dark Gray)

## Notes

- Color codes must be placed directly before the text they affect
- Multiple color codes can be used in the same string
- Use `§r` to reset formatting if needed
- Colors can be combined with formatting codes (e.g., `§l§c` for bold red)
- All color codes are case-sensitive (use lowercase letters)

