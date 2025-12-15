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
│   ├── MECHANICS_SUMMARY.md     # Currently implemented mechanics
│   ├── IDEA_BRAINSTORM.md       # 100+ feature ideas
│   └── MINING_BEAR_INTELLIGENCE_PLAN.md  # Mining bear AI plan
│
├── reference/                   # External Documentation Resources
│   ├── DOCUMENTATION_INDEX.md   # Index of official docs
│   ├── INDEXING_URLS.md         # URLs to index (verify first)
│   ├── INDEXING_URLS_VERIFIED.md # Verified URLs approach
│   └── USEFUL_LINKS.md          # Helpful development links
│
└── ai/                          # AI Assistant Context
    └── CONTEXT_SUMMARY.md       # AI's understanding of project
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

