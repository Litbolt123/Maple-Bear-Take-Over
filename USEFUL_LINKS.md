# Useful Links & Resources

This file contains helpful links for Minecraft Bedrock development, Scripting API references, and other resources used in this project.

## GitHub Repositories & Commits

### Minecraft Bedrock Arabic Script API Snippets
- **Repository**: [Script-API-snippets](https://github.com/MinecraftBedrockArabic/Script-API-snippets)
  - Collection of useful script snippets for Minecraft Bedrock Scripting API
  - Includes examples for:
    - Structure detection and summoning
    - Entity hit location detection
    - Player crawling detection
    - Difficulty detection
    - Item drop detection

- **Structure Detection Performance Optimization**: [9f7a1d4](https://github.com/MinecraftBedrockArabic/Script-API-snippets/commit/9f7a1d4375f321f8bd1f93dbfba1828cba807dca)
  - Faster detection algorithms
  - Optimized pattern matching with smart position checking
  - Cached block references and frequent yielding for better performance
  - Structure: summon detector with debugger.js and structureDetector.js

## Official Documentation

### Primary Documentation Sites
- **[Microsoft Learn - Minecraft Creator Docs](https://learn.microsoft.com/en-us/minecraft/creator/?view=minecraft-bedrock-stable)** - Official Microsoft documentation with tutorials and references
- **[Bedrock.dev](https://bedrock.dev/)** - Comprehensive reference documentation for all Bedrock Edition features
- **[Bedrock Wiki](https://wiki.bedrock.dev/)** - Community-maintained tutorials and guides
- **[Bedrock.dev Packs](https://bedrock.dev/packs)** - Vanilla template packs for all versions

### Comprehensive Documentation Index
- **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** - Complete index of all documentation pages organized by topic

### Quick Links
- [Bedrock.dev Wiki](https://wiki.bedrock.dev/)
- [Minecraft Scripting API Reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/scriptapi/)
- [Behavior Pack Documentation](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraft_block_custom_components)

## Community Resources

### Discord Communities
- Minecraft Scripting API Discord Server (various useful snippets and help)

## Project-Specific Resources

### Maple Bear Take-Over Addon
- [Project Repository](https://github.com/your-repo/Maple-Bear-Take-Over)
- Internal documentation in `/Minecraft Bedrock Knowledge/`

## Development Tools

### Blockbench
- [Blockbench Website](https://blockbench.net/)
- [Blockbench Documentation](https://blockbench.net/wiki/)

### Texture Editors
- [GIMP](https://www.gimp.org/) (Free alternative to Photoshop)
- [Paint.NET](https://www.getpaint.net/) (Free image editor)

## Performance & Optimization

### General Performance Tips
- Use `system.runJob()` for long-running operations
- Yield frequently in loops to prevent blocking
- Cache block/entity references when possible
- Use appropriate data structures for lookups

### Structure Detection Specific
- Smart position checking (only test positions where trigger blocks could be)
- Pattern deduplication using string hashing instead of JSON operations
- Single job execution instead of concurrent jobs
- Early exit checks to stop processing once matches are found
