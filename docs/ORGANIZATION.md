# Documentation Organization

This document explains how the documentation is organized in this project.

## 📁 Structure

```
docs/
├── README.md                    # Documentation index (start here)
├── ORGANIZATION.md              # This file - explains organization
│
├── design/                      # Design & Vision Documents
│   ├── DESIGN_VISION.md         # Core design philosophy and vision
│   └── SAFE_BIOMES.md           # Analysis of safer biomes
│
├── development/                 # Development Planning & Mechanics
│   ├── guides/                  # How-to guides and tutorials
│   │   └── HOW_TO_ADD_SOUNDS.md
│   ├── sounds/                  # Sound-related documentation
│   │   ├── SOUND_PROGRESS.md
│   │   ├── SOUND_GENERATION_PROMPT.md
│   │   └── maple_bear_sound_prompts.md
│   ├── ai/                      # AI and behavior documentation
│   │   ├── MINING_BEAR_INTELLIGENCE_PLAN.md
│   │   ├── AI_OPTIMIZATION_AUDIT.md
│   │   └── HEAT_SEEKING_VISION.md
│   ├── systems/                 # System documentation
│   │   ├── SPAWN_SYSTEM_EXPLANATION.md
│   │   ├── BIOME_GENERATION_VARIABLE_SIZES.md
│   │   ├── DIMENSION_ADAPTATIONS.md
│   │   └── LEADER_DEATH_HANDLER.md
│   ├── planning/                # Planning and brainstorming
│   │   ├── IMPLEMENTATION_PLAN.md
│   │   ├── TASK_PRIORITY.md
│   │   └── IDEA_BRAINSTORM.md
│   ├── tracking/                # Progress tracking and summaries
│   │   ├── CHANGELOG.md
│   │   ├── SESSION_SUMMARY.md
│   │   └── MECHANICS_SUMMARY.md
│   ├── prompts/                 # Prompt files for AI generation
│   │   └── maple_bear_condensed_prompts.md
│   └── testing/                 # Testing documentation
│       ├── TEST_SCENARIOS.md
│       └── TESTING_CHECKLIST.md
│
├── reference/                   # External Documentation Resources
│   ├── DOCUMENTATION_INDEX.md   # Index of official docs
│   ├── INDEXING_URLS.md         # URLs to index (verify first)
│   ├── INDEXING_URLS_VERIFIED.md # Verified URLs approach
│   ├── USEFUL_LINKS.md          # Helpful development links
│   └── COLORS_AND_STYLING.md    # UI color codes and styling reference
│
├── ai/                          # AI Assistant Context
│   └── CONTEXT_SUMMARY.md       # AI's understanding of project
│
└── Compoohter/                  # Co-Creator Resources
    ├── TASKS_FOR_CO_CREATOR.md  # Task list with file locations
    ├── UI_CREATION_GUIDE.md     # UI creation guide
    └── NEXT_SESSION_TASKS.md    # Planned improvements
```

## 🎯 Root-Level Files

- `README.md` - Main project README with quick links
- `TODO.md` - Current task list and project status

## 📝 File Categories

### Design Documents (`design/`)
High-level design philosophy, vision, and world-building decisions. These documents define **what** the addon should be and **how** it should feel.

### Development Documents (`development/`)
Technical documentation, planning, and mechanics. These documents explain **how** things work and **what** needs to be built.

### Reference Documents (`reference/`)
External resources and links for Minecraft Bedrock development. These are reference materials, not project-specific documentation.

### AI Context (`ai/`)
Files specifically for AI assistant understanding. These help maintain context across development sessions.

### Co-Creator Resources (`Compoohter/`)
Documentation for team members working on textures, lore, and design (non-scripting work). Includes task lists with file locations and line numbers, UI creation guides, and planning documents.

## 🔄 When to Update

- **Design docs**: Update when design philosophy or vision changes
- **Development docs**: Update when mechanics change or new features are planned
- **Reference docs**: Update when new resources are found or links change
- **AI context**: Updated automatically during development sessions

## 📌 Best Practices

1. **Keep root clean**: Only `README.md` and `TODO.md` should be in root
2. **Categorize properly**: Put files in the most appropriate category
3. **Update references**: When moving files, update all links that reference them
4. **Document changes**: Note significant organizational changes in this file

