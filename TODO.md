# Maple Bear Takeover - TODO List

## 🔧 Current Status
- ✅ Basic Maple Bear entities (tiny, infected, buff)
- ✅ Item pickup behavior for all bear types
- ✅ Performance optimizations
- ✅ Bear infection system (20-day timer)
- ✅ Snow infection system (separate mechanics)
- ✅ Cure system for bear infection (weakness + golden apple)
- ✅ Day tracking system
- ✅ Item corruption on infected bear death
- ✅ API 2.0.0 compatibility fixes
- ✅ Safety checks for unavailable event handlers
- ✅ Alternative debug system using item interactions
- ✅ Infection Tracker Book (`mb:snow_book`) with on-demand UI
- ✅ Robust effects detection with multiple fallback methods
- ✅ Fixed global object and command result handling

## 🚀 Future Features

### 📖 Infection Status Book (Powdery Book)
- [x] Craftable infection tracker book (`mb:snow_book`)
- [x] Display current infection type (bear/snow)
- [x] Show time remaining until transformation/death
- [ ] Show infection progress and symptoms (future)
- [x] Display immunity status and remaining time
- [ ] Show detailed effect information (weakness, nausea, etc.)
- [x] Recipe available (currently 8 snow around a book)
- [x] Simple themed UI (action form)

### 🎮 Gameplay Enhancements
- [ ] Infection symptoms (visual effects, random events)
- [ ] Different cure methods for different infection types
- [ ] Infection resistance items/armor
- [ ] Quarantine zones or safe areas
- [ ] Infection spread mechanics between players

### 🏗️ World Building
- [ ] Custom "snow" biome for increased Maple Bear activity
- [ ] Client biome visuals (fog/sky) for "snow" biome
- [ ] Maple Bear spawn structures
- [ ] Infection research facilities
- [ ] Cure crafting stations
- [ ] Warning signs and information boards
- [ ] Emergency shelters

### 📊 UI/UX Improvements
- [ ] Infection status HUD element
- [ ] Progress bars for infection timers
- [ ] Warning notifications
- [ ] Cure attempt feedback
- [ ] Infection spread alerts

### 🎯 Advanced Mechanics
- [ ] Multiple infection stages
- [ ] Mutation system for bears
- [ ] Weather effects on infection
- [ ] Seasonal infection patterns
- [ ] Cure research progression

### 🔧 Technical Improvements
- [x] Reduce noisy logs; keep key warnings only
- [x] Simplify live tracking to on-demand UI (removed realtime actionbar)
- [ ] Enhanced debug tools for testing
- [ ] Better error handling and logging
- [ ] Performance monitoring and optimization
- [ ] Custom debug items with better UI

### 🎨 Content Additions
- [ ] More bear variants
- [ ] Custom sounds and effects
- [ ] Particle effects for infections
- [ ] Custom items and tools
- [ ] Achievement system

## 🐛 Known Issues
- Chat event handler not available in API 2.0.0 (replaced with item-based debug system)
- Animation controller errors (non-critical)
- Command syntax differences in API 2.0.0 (fixed)
- Global object not available in API 2.0.0 (fixed)

## 📌 Notes for Custom Biomes
- Custom biomes require enabling the "Custom Biomes" experiment on the world. Partial biome replacement is experimental and may change.
- Mixing custom biome generation with existing saved chunks can create seams; test on a fresh world or backup first.

## 📝 Notes
- Using API version 2.0.0 with safety checks
- Debug system available via:
  - Console functions: `testWeaknessDetection('playerName')`, `addWeaknessToPlayer('playerName')`, `checkInfectionStatus('playerName')`
  - Item interactions: Book (test effects), Paper (add weakness), Map (check infection)
- Core functionality working properly
- Cure system uses robust effects detection with 3 fallback methods:
  1. `getEffect("minecraft:weakness")` - Direct method
  2. `getEffects()` - List all effects and find weakness
  3. Command method - Final fallback (with proper null checking) 