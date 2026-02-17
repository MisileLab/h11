# Issues & Fixes

## Empty Command Cache Persistence (FIXED)
**Root Cause:** Server responds with empty command string on initial command block check before user sets command. This empty value was cached for 30s TTL, causing HUD to render empty background/text when user hovered over block within cache window.

**Fix Applied:**
1. `CommandBlockDetector.tick()`: Added guard to evict cache entries that are empty strings or expired TTL (not just expired).
2. `CommandBlockDetector.handleResponse()`: Added check to reject empty command strings from cache, remove stale entries, and prevent setting `currentCommand` to empty.
3. `CommandPreviewHud.render()`: Added guard to skip rendering if command is empty string.

**Result:** Empty commands no longer persist in cache or render to HUD. User sees no preview until a real command is set.
