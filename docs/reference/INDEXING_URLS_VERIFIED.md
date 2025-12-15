# Verified URLs to Index for AI Assistant

⚠️ **IMPORTANT**: Many documentation URLs change frequently. This file contains only URLs that should be verified before indexing, or uses base URLs that are more stable.

## 🔍 How to Find Working URLs

Instead of guessing URLs, use these methods:

### Method 1: Start with Base URLs (Most Reliable)
Index the main landing pages first, then let the AI search within them:

```
https://learn.microsoft.com/en-us/minecraft/creator/
https://bedrock.dev/
https://wiki.bedrock.dev/
```

### Method 2: Use Site Search/Navigation
1. Go to the base URL
2. Use the site's search function
3. Navigate through the site's menu structure
4. Copy the actual URLs from working pages

### Method 3: Verify Each URL
Before indexing, manually visit each URL to confirm it works.

---

## ✅ VERIFIED Base URLs (These Should Work)

### Microsoft Learn - Main Landing Pages
```
https://learn.microsoft.com/en-us/minecraft/creator/
https://learn.microsoft.com/en-us/minecraft/creator/?view=minecraft-bedrock-stable
```

### Bedrock.dev - Main Pages
```
https://bedrock.dev/
https://bedrock.dev/packs
```

### Bedrock Wiki - Main Pages
```
https://wiki.bedrock.dev/
```

---

## 📋 URLs to Verify Before Indexing

### Microsoft Learn - Common Patterns (Verify These)

#### Scripting API (Most Important)
Try these patterns - verify they work first:
```
https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/scriptapi/
https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft-scripting-api-getting-started
```

#### Reference Documentation
```
https://learn.microsoft.com/en-us/minecraft/creator/reference/
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/
```

#### Documents/Tutorials
```
https://learn.microsoft.com/en-us/minecraft/creator/documents/
```

### Bedrock.dev - Stable Documentation

The URL structure appears to be:
```
https://bedrock.dev/docs/stable/{Topic}
```

**Verify these work first:**
```
https://bedrock.dev/docs/stable/Entities
https://bedrock.dev/docs/stable/Blocks
https://bedrock.dev/docs/stable/Item
https://bedrock.dev/docs/stable/Molang
https://bedrock.dev/docs/stable/Animations
https://bedrock.dev/docs/stable/Biomes
https://bedrock.dev/docs/stable/Features
https://bedrock.dev/docs/stable/Particles
https://bedrock.dev/docs/stable/Recipes
https://bedrock.dev/docs/stable/Schemas
```

### Bedrock Wiki - Tutorial Pages

The URL structure appears to be:
```
https://wiki.bedrock.dev/{section}/{page}.html
```

**Verify these patterns work:**
```
https://wiki.bedrock.dev/guide/introduction.html
https://wiki.bedrock.dev/scripting/intro-to-scripting.html
https://wiki.bedrock.dev/entities/intro-to-entities-bp.html
https://wiki.bedrock.dev/blocks/intro-to-blocks.html
https://wiki.bedrock.dev/items/intro-to-items.html
https://wiki.bedrock.dev/commands/intro-to-command-blocks.html
```

---

## 🎯 Recommended Indexing Strategy

### Step 1: Index Base Landing Pages (These Should Work)
Start with these main pages - they're the most stable:

```
https://learn.microsoft.com/en-us/minecraft/creator/
https://bedrock.dev/
https://wiki.bedrock.dev/
```

### Step 2: Use Site Navigation to Find Pages
1. Index the base URL
2. Ask the AI to search within that site for specific topics
3. The AI can use web_search to find pages within those domains

### Step 3: Index Specific Working Pages
Only after verifying they work, add specific pages you've confirmed exist.

---

## 🔧 Alternative: Use Web Search Instead

Instead of indexing every page, you can:
1. Index just the base URLs
2. When you need specific info, ask me to search those sites
3. I'll use `web_search` to find the current, working URLs

This approach is more reliable because:
- URLs change frequently
- I can find the current working URLs
- You don't need to maintain a huge list

---

## 📝 How to Verify URLs

### Quick Verification Script
You can use this approach to verify URLs:

1. **Browser Method**:
   - Open each URL in your browser
   - If it loads, it's good to index
   - If it's 404, skip it

2. **Command Line Method** (if you have curl):
   ```bash
   curl -I "https://learn.microsoft.com/en-us/minecraft/creator/"
   # Look for "200 OK" status
   ```

3. **Indexing Tool Method**:
   - Try indexing one URL at a time
   - Check if it reports success
   - If it says "404", skip that URL

---

## ✅ Minimal Working Set (Start Here)

If you want to start small, index just these base URLs:

```
https://learn.microsoft.com/en-us/minecraft/creator/
https://bedrock.dev/
https://wiki.bedrock.dev/
https://bedrock.dev/packs
```

Then when you need specific information, I can:
- Search within those sites using web_search
- Find the current working URLs
- Provide you with the information

---

## 🚨 Common Issues

### Issue: URLs with `.html` extension
- **Bedrock Wiki** uses `.html` extensions
- **Microsoft Learn** does NOT use `.html`
- **Bedrock.dev** does NOT use `.html`

### Issue: URL encoding
- Spaces become `%20` or `-` (hyphens)
- Example: `Client%20Biomes` or `Client-Biomes`
- Verify which format the site actually uses

### Issue: Trailing slashes
- Some sites require trailing `/`, others don't
- Try both: `/creator/` and `/creator`

### Issue: Version parameters
- Microsoft Learn uses `?view=minecraft-bedrock-stable`
- This might be optional - try with and without

---

## 📌 Next Steps

1. **Start with base URLs only** - Index the 4 main landing pages above
2. **Test indexing** - Verify they work
3. **Use web search** - When you need specific info, I'll search for it
4. **Gradually add pages** - Only add specific pages after verifying they work

This approach is more reliable than trying to guess all the URLs upfront.

---

**Last Updated**: 2025-01-27
**Status**: URLs need verification before indexing

