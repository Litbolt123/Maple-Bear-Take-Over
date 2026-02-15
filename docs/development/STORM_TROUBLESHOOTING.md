# Storm Troubleshooting

## Storm Not Visible / Not Affecting After Rejoin

**Cause**: Storm state was not being restored from save. The `loadStormState` function was missing the code to set `stormActive`, `stormType`, `stormCenterX/Z/Y`, etc. from the persisted state.

**Fix**: Applied in `mb_snowStorm.js` — `loadStormState` now restores all storm variables from the saved state.

---

## Village Freeze (Villagers Freeze, Block Sounds Don't Play)

**Likely cause**: Storm destruction heavily modified terrain (removed leaves, grass, flowers; placed snow). Villagers have complex pathfinding AI. In heavily modified terrain, spawning many villagers can overload pathfinding — each villager tries to compute paths through irregular terrain (holes, snow layers), causing the game to stall.

**Characteristics**:
- Only in the storm-affected area (village)
- Only when spawning many villagers
- Maple Bears and other entities keep animating (different AI)
- Persists across rejoin (world data in those chunks)

### Recovery Options

1. **Avoid the area**: Play elsewhere until the chunks are no longer "hot" or you rebuild the village.

2. **End any stuck storm**: If a storm was active when you left, it may be in a bad state. Use **Developer Tools → Storm Debug → End Storm** (or the Storm State menu) to force-end it. With the load fix, rejoining should now correctly restore the storm.

3. **Reduce village entity count**: Don't spawn large numbers of villagers at once in storm-affected villages. Add them gradually.

4. **Rebuild terrain**: Manually replacing destroyed foliage and smoothing the terrain may reduce pathfinding complexity. Slow but can help.

5. **Backup and test**: If the world is important, back it up. Test in a copy to see if the freeze persists or if it's tied to specific chunks.

### Prevention (Future Storms)

- A per-pass destruction cap (80 blocks max) was added to reduce the chance of overloading chunks in a single pass.
- Storm state load fix prevents "ghost" storms on rejoin.
