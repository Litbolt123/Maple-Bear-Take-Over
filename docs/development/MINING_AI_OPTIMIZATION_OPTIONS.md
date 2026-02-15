# Mining AI Optimization Options

**Problem:** With 3 mining bears active, the mining AI causes major lag.

**Root cause summary:** With 1–4 bears, the system runs at *full speed* (every tick). Each bear gets full `processContext()` every tick, which includes pathfinding checks, block lookups, target scanning, and coordination logic. Three bears × heavy processing × 20 ticks/sec = significant load.

---

## Minecraft 1.26 (26.0) Compatibility

**Checked:** [Minecraft 26.0 Bedrock Changelog](https://www.minecraft.net/en-us/article/minecraft-26-0-bedrock-changelog) (Feb 2026).

**Findings:** No Script API changes that would make mining AI *more* taxing. Changes are mostly:
- Entity JSON schema stricter (nearest_attackable_target, melee_attack, look_at) — affects pack loading, not runtime script cost
- Baby mob redesigns, mob movement (Nautilus), look-at distance fixes — vanilla mob behavior, not addon entities
- Block geometry, collision box — not used by mining AI

The addon's mining AI uses `dimension.getBlock`, `dimension.getEntities`, and `system.run` — none of these changed in 1.26. **Conclusion:** 1.26 does not introduce new tax on the mining AI script. Lag was pre-existing; optimizations address the script's own cost.

---

## Current Architecture (Relevant Parts)

- **Dynamic interval:** 1–4 bears → every 1 tick; 5–9 bears → every 2 ticks; 10+ bears → every 3 ticks
- **Bears with targets:** Leaders and followers run `processContext()` every tick (movement responsive)
- **Block breaking:** Throttled inside `processContext` via `lastBlockBreakTick` and `miningInterval`
- **Idle bears:** Process at `miningInterval * 2`
- **Block cache:** 1 tick TTL; cleaned every 10 ticks
- **Pathfinding:** Async, chunked (25 nodes/chunk), max 180 nodes, max 5 concurrent, cached 20 ticks

---

## Optimization Options (Ranked by Impact vs Risk)

### 1. **Lower bear-count threshold for throttling** (Low risk, high impact)

**Current:** Bears with targets process every tick when count ≤ 4.  
**Change:** Treat 3–4 bears as "medium" load — process leaders/followers every 2 ticks instead of every tick.

- Adjust `BEAR_COUNT_THRESHOLD_FEW` from 5 to 2 (so 1–2 bears = every tick, 3+ = every 2 ticks)
- Or add a new tier: 1–2 bears = 1 tick, 3–4 bears = 2 ticks, 5–9 = 2 ticks, 10+ = 3 ticks

**Impact:** ~50% fewer `processContext` calls when 3 bears are active. Slight reduction in movement responsiveness.

---

### 2. **Throttle processContext for leaders/followers by miningInterval** (Medium risk, high impact)

**Current:** Leaders and followers run full `processContext` every tick; only *block breaking* is throttled inside it.  
**Change:** Run `processContext` for leaders/followers at `miningInterval` (like the "Working mining ai" file), but keep a lighter "movement-only" pass every tick.

- Split logic: a cheap "steer only" pass every tick vs full logic (pathfinding, mining, pitfall, etc.) every `miningInterval`
- Or: run full `processContext` every `miningInterval` for leaders/followers (simplest; may make climbing/steering less responsive)

**Impact:** Large reduction in heavy work. Risk: bears may feel less responsive when climbing or turning.

---

### 3. **Pathfinding: Use `Set` for closed list** (Low risk, medium impact)

**Current:** `closed` is an array; `closed.includes(neighborKey)` is O(n) per neighbor.  
**Change:** Use `Set` for closed: `closed.add(currentKey)` and `closed.has(neighborKey)`.

**Impact:** Pathfinding scales from O(n²) to O(n) on closed-set checks. Helps especially when many nodes are expanded.

---

### 4. **Pathfinding: Reduce entity lookup in processPathfindingChunk** (Low risk, medium impact)

**Current:** For each pathfinding chunk, the code loops over `PATHFINDING_ENTITY_TYPES` (8 types) and calls `dimension.getEntities({ type: typeId })` until it finds the entity by ID.  
**Change:** Store `entityId → typeId` when pathfinding starts, so we do a single `getEntities({ type: storedTypeId })` and find by ID. Or pass entity reference if it remains valid.

**Impact:** Fewer `getEntities` calls per pathfinding chunk.

---

### 5. **Extend block cache TTL** (Low risk, small–medium impact)

**Current:** `BLOCK_CACHE_TICKS = 1`. Blocks rarely change within 1 tick.  
**Change:** `BLOCK_CACHE_TICKS = 2` or 3. Blocks change when mined, so a short TTL is still appropriate.

**Impact:** Fewer `dimension.getBlock` calls when multiple bears query nearby blocks. Some risk of stale block refs if a bear mines a block another bear just queried.

---

### 6. **Reduce pathfinding constants** (Low risk, medium impact)

**Current:**  
- `PATHFINDING_MAX_NODES = 180`  
- `PATHFINDING_NODES_PER_CHUNK = 25`  
- `PATHFINDING_MAX_CONCURRENT = 5`  

**Change:**  
- `PATHFINDING_MAX_NODES = 120` (shorter paths, faster completion)  
- `PATHFINDING_NODES_PER_CHUNK = 15` (more chunks, less work per tick)  
- `PATHFINDING_MAX_CONCURRENT = 3` (fewer simultaneous pathfinders when 3 bears are active)

**Impact:** Less pathfinding work per tick. Slight reduction in path quality for long distances.

---

### 7. **Stagger bear processing across ticks** (Low risk, medium impact)

**Current:** All bears with targets process in the same tick.  
**Change:** Use `entityId` hash or tick modulo to stagger: bear 0 processes ticks 0,3,6,...; bear 1 at 1,4,7,...; bear 2 at 2,5,8,.... Each bear still processes every N ticks but not all at once.

**Impact:** Smoother frame times; avoids 3 heavy `processContext` calls in a single tick.

---

### 8. **Block cache: Limit size and cleanup strategy** (Low risk, small impact)

**Current:** Cache grows unbounded (until cleanup every 10 ticks). Cleanup iterates all entries.  
**Change:**  
- Cap cache size (e.g. 500–1000 entries); evict oldest when full  
- Or: clear entire cache every N ticks instead of per-entry expiry when size exceeds threshold  

**Impact:** Bounded memory and cleanup cost. May increase cache misses if cap is too low.

---

### 9. **Reduce target scan frequency for bears with stable targets** (Low risk, small–medium impact)

**Current:** `findNearestTarget` is called for every valid entity every tick (with cache).  
**Change:** For entities that already have a cached target and it's still valid, skip full scan. Only re-scan when target cache expires or target becomes invalid.

**Impact:** Fewer target scans. Logic already uses `targetCache`; extending the cache or reducing scan frequency for "locked" targets could help.

---

### 10. **Distance-based processing priority** (Low risk, small impact)

**Current:** All bears within `MAX_PROCESSING_DISTANCE` (64 blocks) of any player are processed equally.  
**Change:** Process bears closer to players first; if we hit a time/iteration budget, skip distant bears this tick.

**Impact:** Prioritizes visible/nearby bears. Implementation is more complex.

---

## Recommended Order to Implement

1. **#3 Pathfinding Set for closed** – Quick, safe, improves pathfinding cost.
2. **#1 Lower bear-count threshold** – Easiest way to cut load at 3 bears.
3. **#7 Stagger bear processing** – Smooths frame spikes.
4. **#6 Reduce pathfinding constants** – Tune for 3-bear scenario.
5. **#4 Pathfinding entity lookup** – Reduces redundant getEntities.
6. **#5 Block cache TTL** – Small but easy win.
7. **#2 Split processContext** – Largest potential gain, but needs careful design to keep movement responsive.

---

## Quick Wins (Minimal Code Change)

- Change `BEAR_COUNT_THRESHOLD_FEW` from 5 to 2.
- Replace `closed` array with `closed` Set in pathfinding.
- Add stagger: `if ((tick + hash(entityId)) % 2 === 0)` before processing leaders/followers (process half each tick).
