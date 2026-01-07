# Mining Bear Leader Death Handler

## Overview
When a mining bear leader dies, the system automatically promotes the nearest follower to become the new leader. This ensures mining groups continue functioning even after leader death.

## Implementation Details

### Data Structures
- **`leaderFollowerMap`**: `Map<leaderId, Set<followerId>>` - Tracks which entities are followers of which leader
- **`followerLeaderMap`**: `Map<followerId, leaderId>` - Reverse lookup for quick leader finding

### How It Works

1. **Tracking Setup**: When followers are assigned to a leader (in the main AI loop), the relationships are tracked in both maps.

2. **Death Detection**: Subscribed to `world.afterEvents.entityDie` to detect when mining bears die.

3. **Leader Promotion**:
   - When a leader dies, `handleLeaderDeath()` is called
   - Finds the nearest valid follower to the dead leader's position
   - Promotes that follower to leader
   - Reassigns all remaining followers to the new leader
   - Updates both tracking maps

4. **Follower Cleanup**: When a follower dies, it's removed from the leader's follower set and the reverse mapping.

5. **Periodic Cleanup**: The main AI loop periodically cleans up maps for entities that no longer exist.

### Code Location
- **File**: `BP/scripts/mb_miningAI.js`
- **Functions**:
  - `handleLeaderDeath(deadLeaderId)` - Main promotion logic
  - Entity death event subscription (at end of file)
  - Map updates in leader assignment section (line ~2867)

### Behavior
- Nearest follower is selected based on distance to dead leader's position
- If leader position can't be retrieved, first valid follower is used
- All remaining followers are automatically reassigned to new leader
- New leader takes over in next AI processing cycle
- Debug logging available when `mining.general` debug is enabled

### Edge Cases Handled
- No followers to promote → Clean up and return
- All followers invalid → Clean up and return
- Leader position unavailable → Use first valid follower
- Entity already invalidated → Skip gracefully

## Testing Notes
- Test with multiple followers to verify promotion
- Test with single follower to verify it becomes leader
- Test with no followers to verify cleanup
- Verify new leader continues mining path
- Check debug logs for promotion messages

