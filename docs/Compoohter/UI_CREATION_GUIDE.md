# UI Creation Guide for Minecraft Bedrock Add-Ons

This guide explains how the UI system in the Maple Bear Takeover addon works, why we built it this way, and its limitations. This is for understanding the technical side of UI creation, even if you're primarily focused on content/text/lore.

---

## 📋 Table of Contents

1. [What We Use: ActionFormData](#what-we-use-actionformdata)
2. [Basic Structure](#basic-structure)
3. [How Our Codex UI Works](#how-our-codex-ui-works)
4. [Why This Approach Works](#why-this-approach-works)
5. [Limitations & Constraints](#limitations--constraints)
6. [Common Patterns & Examples](#common-patterns--examples)
7. [Tips for Working with UI](#tips-for-working-with-ui)

---

## What We Use: ActionFormData

**Minecraft Bedrock Edition** provides two main UI form types:

1. **`ActionFormData`** - What we use for the journal
   - Title at top
   - Body text (supports multiple lines, color codes)
   - Buttons (text + optional icon)
   - One button per action/navigation

2. **`ModalFormData`** - Used for simple yes/no or text input
   - Title
   - Body text
   - Two buttons (usually "Yes" and "No")
   - OR text input fields

We use **`ActionFormData`** because it allows multiple navigation buttons and better hierarchical menus.

---

## Basic Structure

### Minimum Form Example

```javascript
// 1. Create the form
const form = new ActionFormData();

// 2. Set title (appears at top)
form.title("§6My Journal");

// 3. Set body text (main content area)
form.body("§7Welcome to my journal!");

// 4. Add buttons (in order)
form.button("§fOption 1");
form.button("§eOption 2");
form.button("§8Back");  // Usually last

// 5. Show to player and handle response
form.show(player).then((res) => {
    if (res.canceled) {
        // Player closed the form
        return;
    }
    
    // res.selection = index of button clicked (0, 1, 2, ...)
    if (res.selection === 0) {
        // Player clicked "Option 1"
        doSomething();
    } else if (res.selection === 1) {
        // Player clicked "Option 2"
        doSomethingElse();
    } else if (res.selection === 2) {
        // Player clicked "Back"
        goBack();
    }
});
```

---

## How Our Codex UI Works

### Hierarchical Menu System

Our journal uses a **nested menu structure** like this:

```
Main Menu
├── Infection Section
│   └── (Shows infection details - no submenu)
├── Symptoms Section
│   ├── Infection Level Analysis
│   ├── Minor Infection Analysis
│   ├── Infection Symptoms
│   └── Snow Effects
├── Mobs Section
│   ├── Tiny Maple Bear
│   ├── Infected Maple Bear
│   └── (Each mob shows details - no submenu)
├── Items Section
│   └── (Item selection list)
└── Settings
```

### Implementation Pattern

Each menu level is a **separate function** that:
1. Creates its own form
2. Shows buttons for navigation/selection
3. Handles the response to navigate to the next level

**Example from our code:**

```javascript
function openMain() {
    const form = new ActionFormData().title("§6Powdery Journal");
    form.body(`${buildSummary()}\n\n§eChoose a section:`);
    
    // Build buttons dynamically
    const buttons = [];
    const buttonActions = [];
    
    // Add buttons conditionally
    buttons.push("§fInfection");
    buttonActions.push(() => openInfections());  // Function reference
    
    if (hasAnyMobs) {
        buttons.push("§fMobs");
        buttonActions.push(() => openMobs());
    }
    
    // Add buttons to form
    for (const button of buttons) {
        form.button(button);
    }
    
    // Show form and handle selection
    form.show(player).then((res) => {
        if (!res || res.canceled) return;
        
        const sel = res.selection;  // Which button was clicked (0, 1, 2, ...)
        if (sel >= 0 && sel < buttonActions.length) {
            buttonActions[sel]();  // Call the corresponding function
        }
    });
}

function openInfections() {
    // This is a submenu - builds infection details
    const form = new ActionFormData().title("§6Infection");
    const lines = [];
    lines.push("§eThe Infection");
    lines.push("");
    lines.push("§7Your infection status...");
    
    form.body(lines.join("\n"));
    form.button("§8Back");
    
    form.show(player).then((res) => {
        if (res.selection === 0) {
            openMain();  // Go back to main menu
        }
    });
}
```

### Key Concepts

#### 1. **Function Closures**
Each menu function is defined **inside** the main `showCodexBook()` function. This allows all menus to access the same:
- `player` variable
- `codex` data
- Helper functions like `buildSummary()`

#### 2. **Dynamic Button Building**
Buttons are added **conditionally** based on:
- What the player has discovered
- What sections are unlocked
- Current game state

Example:
```javascript
// Only show "Mobs" button if player has seen any mobs
const hasAnyMobs = Object.values(codex.mobs).some(seen => seen === true);
if (hasAnyMobs) {
    buttons.push("§fMobs");
    buttonActions.push(() => openMobs());
}
```

#### 3. **Progressive Content Display**
Content changes based on what the player knows:

```javascript
// Show different text based on discovery status
if (codex.items.goldenAppleSeen) {
    lines.push("§7Golden Apple: Found");
} else {
    lines.push("§8Golden Apple: ???");
}
```

---

## Why This Approach Works

### ✅ Advantages

1. **Simple & Native**
   - Uses Minecraft's built-in UI system
   - No external libraries or frameworks needed
   - Works across all Bedrock platforms (Windows 10, Mobile, Console, etc.)

2. **Hierarchical Navigation**
   - Natural back-button navigation
   - Clear menu structure
   - Easy to extend with new sections

3. **Dynamic Content**
   - Content can change based on game state
   - Progressive reveal of information
   - Conditional button visibility

4. **Color-Coded Text**
   - Supports Minecraft's color codes (`§7`, `§e`, `§c`, etc.)
   - Easy visual hierarchy
   - Can emphasize important information

5. **Icon Support**
   - Buttons can have icons (item textures)
   - Visual identification of options
   - Makes UI more appealing

### How It Handles Player State

The UI reads from the `codex` object (stored per-player) to determine:
- What sections to show
- What information to reveal
- Which buttons are available

This creates a **progressive reveal system** where players unlock information as they play.

---

## Limitations & Constraints

### ❌ What We CAN'T Do

#### 1. **No Scrollable Content**
- Body text has a **fixed height limit** (roughly 10-15 lines visible)
- If content is too long, it gets cut off at the bottom
- **Solution:** We split long content into multiple pages/sections

#### 2. **Limited Button Count**
- Maximum **14 buttons** per form (may vary by platform)
- **Solution:** We use hierarchical menus to split options across multiple screens

#### 3. **No Rich Text Formatting**
- Only supports Minecraft color codes (`§7`, `§e`, `§c`, etc.)
- No bold, italic, underline (except color codes)
- No images in body text (only button icons)
- **Solution:** We use color codes and line breaks to create visual hierarchy

#### 4. **No Input Fields in ActionFormData**
- Can't ask for player text input in ActionFormData
- **Solution:** We use `ModalFormData` for text input (like search), but it's limited to 2 buttons

#### 5. **No Real-Time Updates**
- Forms are static when shown
- Content doesn't update while the form is open
- Player must close and reopen to see changes
- **Solution:** We rebuild the form each time it's opened

#### 6. **Button Icons Are Limited**
- Icons must be 16x16 pixel item textures
- Can only use textures already in the resource pack
- Icons appear small and pixelated
- **Solution:** We choose distinctive textures and use text labels too

#### 7. **No Custom Layouts**
- Title, body, and buttons always appear in the same positions
- Can't rearrange elements
- Can't add custom UI elements
- **Solution:** We work within the constraints and use text/color to guide attention

#### 8. **Performance Concerns**
- Forms are created **every time** they're opened
- No caching or pre-rendering
- Can be slow if form building is complex
- **Solution:** We keep form-building logic efficient and avoid heavy calculations

#### 9. **Platform Differences**
- UI appearance varies slightly between platforms (Windows 10, Mobile, Console)
- Button sizes may differ
- Text rendering can vary
- **Solution:** We test on multiple platforms and use conservative line lengths

#### 10. **No Sound Control in UI**
- Can't play sounds directly from form buttons (only when opening/closing via code)
- Can't have button-specific sounds easily
- **Solution:** We play sounds in JavaScript when handling button clicks

---

## Common Patterns & Examples

### Pattern 1: Back Button Always Last

```javascript
// Build all menu buttons first
buttons.push("§fOption 1");
buttons.push("§fOption 2");
buttons.push("§fOption 3");

// Always add Back button last
form.button("§8Back");

// Handle response
form.show(player).then((res) => {
    if (res.canceled) return;
    
    const sel = res.selection;
    const lastIndex = buttons.length;  // Back is always last
    
    if (sel === lastIndex) {
        goBack();  // Back button clicked
    } else {
        handleOption(sel);  // One of the menu options
    }
});
```

### Pattern 2: Conditional Buttons

```javascript
const buttons = [];
const buttonActions = [];

// Only add if condition is met
if (hasInfection) {
    buttons.push("§cView Infection Status");
    buttonActions.push(() => showInfectionStatus());
}

if (hasMobs) {
    buttons.push("§fView Mobs");
    buttonActions.push(() => showMobs());
}

// Always add back button
buttons.push("§8Back");

// Add all buttons to form
for (const button of buttons) {
    form.button(button);
}
```

### Pattern 3: Dynamic Content Based on State

```javascript
function buildInfectionDescription(codex, hasInfection) {
    const lines = [];
    
    if (hasInfection) {
        lines.push("§cCurrent Status: Infected");
        
        // Show details only if player has discovered them
        if (codex.infections.minor.discovered) {
            lines.push("§7You have a minor infection.");
        } else {
            lines.push("§8Infection type: ???");
        }
    } else {
        lines.push("§aCurrent Status: Healthy");
    }
    
    return lines.join("\n");
}

form.body(buildInfectionDescription(codex, hasInfection));
```

### Pattern 4: Handling Cancelation

```javascript
form.show(player).then((res) => {
    if (!res || res.canceled) {
        // Player closed the form (ESC key, clicked X, etc.)
        // Play close sound, don't navigate anywhere
        player.playSound("mb.codex_close");
        return;
    }
    
    // Handle button selection
    if (res.selection === 0) {
        // Handle option...
    }
}).catch((error) => {
    // Error handling - fallback to main menu
    console.warn("Form error:", error);
    openMain();
});
```

### Pattern 5: Button Icons

```javascript
// Button with icon
form.button("§fView Items", "textures/items/basic_journal");

// Button without icon (icon parameter omitted)
form.button("§8Back");

// In our code, we track icons separately:
const buttons = ["§fOption 1", "§fOption 2"];
const buttonIcons = ["textures/items/icon1", "textures/items/icon2"];

// Then add them together:
for (let i = 0; i < buttons.length; i++) {
    if (buttonIcons[i]) {
        form.button(buttons[i], buttonIcons[i]);
    } else {
        form.button(buttons[i]);
    }
}
```

---

## Tips for Working with UI

### When Adding New Sections

1. **Create a new function** inside `showCodexBook()`:
   ```javascript
   function openNewSection() {
       const form = new ActionFormData().title("§6New Section");
       // ... build content
   }
   ```

2. **Add a button** in the appropriate parent menu:
   ```javascript
   buttons.push("§fNew Section");
   buttonActions.push(() => openNewSection());
   ```

3. **Always include a Back button**:
   ```javascript
   form.button("§8Back");
   // In response handler:
   if (res.selection === lastButtonIndex) {
       openParentMenu();  // Go back
   }
   ```

### Text Content Guidelines

1. **Line Length**
   - Keep lines under ~50 characters for readability
   - Long text gets cut off on mobile/smaller screens

2. **Use Color Codes for Hierarchy**
   - `§7` - Gray (normal text)
   - `§e` - Yellow (headings, important info)
   - `§c` - Red (warnings, danger)
   - `§a` - Green (positive status)
   - `§8` - Dark gray (unknown/masked content)
   - `§6` - Gold (titles, special items)

3. **Vertical Spacing**
   - Use empty lines (`\n\n`) to separate sections
   - Don't overdo it - space is limited

4. **Progressive Reveal**
   - Use `§8???` for undiscovered content
   - Reveal information gradually as player progresses

### Debugging UI Issues

1. **Check Console Logs**
   - JavaScript errors prevent forms from showing
   - Check browser/console logs for errors

2. **Test Button Counts**
   - If a menu doesn't show all buttons, you may have exceeded the limit
   - Split into multiple pages or use submenus

3. **Verify Button Indices**
   - `res.selection` is 0-based (first button = 0, second = 1, etc.)
   - Make sure your handling logic matches button order

4. **Test on Multiple Platforms**
   - UI can behave differently on mobile vs. desktop
   - Test on target platforms if possible

---

## Summary

### What Makes Our UI Work

✅ **Hierarchical menu system** - Easy navigation with back buttons  
✅ **Dynamic content** - Shows/hides based on player progress  
✅ **Progressive reveal** - Information unlocks as players discover things  
✅ **Color-coded text** - Visual hierarchy and emphasis  
✅ **Icon support** - Visual identification of options  

### What Limits Our UI

❌ **Fixed content area** - Can't scroll long text  
❌ **Limited buttons** - Max ~14 per form  
❌ **Static forms** - No real-time updates  
❌ **Simple formatting** - Only color codes, no rich text  
❌ **No custom layouts** - Title/body/buttons always in same positions  

### Best Practices

1. **Keep content concise** - Use multiple pages if needed
2. **Use color codes** - Create visual hierarchy
3. **Always include back buttons** - Make navigation clear
4. **Test button limits** - Split menus if too many options
5. **Build dynamically** - Content should reflect current game state

---

## Additional Resources

- **Minecraft Bedrock Script API Documentation**: Look for `ActionFormData` and `ModalFormData`
- **Color Codes Reference**: See `docs/reference/COLORS_AND_STYLING.md` in this project
- **Code Examples**: See `BP/scripts/mb_codex.js` for real implementation examples

---

**Note for Content Creators**: If you want to modify text content in the UI, you don't need to understand all of this! Just find the text strings (use Ctrl+F to search) and edit them. The structure will handle the rest. This guide is mainly for understanding how the system works and why we made certain design choices.
