- For Task 1, follow plan exactly: create payload definitions and payload type registration in a dedicated networking file.
- Keep Task 1 strictly foundation-only; no server/client handlers beyond payload type registration.
- Task 1 payload registration function `registerPayloadTypes()` is defined but not yet called; will be invoked by server/client handlers in Tasks 2/3.
- Used `.cast<RegistryByteBuf>()` over manual codec construction because it's cleaner and leverages existing Minecraft codec primitives.
- Kept both payloads in single file `CommandPreviewNetworking.kt` as they are tightly coupled (network layer abstraction).

## Task 4 Implementation Decision

**Decision**: Create CommandPreviewHud as a Kotlin object with single public render() function.

**Rationale**:
- Matches Fabric 1.21.11+ HudRenderCallback event callback pattern exactly
- Object pattern appropriate for singleton handler with no state mutations
- render() function is stateless, reading only from CommandBlockDetector
- Allows direct method reference registration in Task 5: HudRenderCallback.EVENT.register(CommandPreviewHud::render)

**Implementation Approach**:
1. Null guard clauses at entry point (lines 8-15) prevent processing without data
2. Simple text truncation logic (lines 20-24): if > 80 chars, take first 77 + "..."
3. Position calculation (lines 27-39):
   - Horizontal center: x = (screenWidth - textWidth) / 2
   - Vertical position: y = screenHeight - 60 (above hotbar)
4. Two-phase rendering (lines 42-46):
   - Background rectangle first (semi-transparent black)
   - Text second (white with shadow, TextRenderer for width measurement)

**Why this approach**:
- Clear separation of concerns: HUD rendering isolated from detection/networking
- Easy to test: pure function taking DrawContext and RenderTickCounter
- Performance: minimal per-frame overhead, no cache/state management
- Maintenance: straightforward to modify appearance without affecting logic

**Dependencies**:
- CommandBlockDetector.currentCommand: nullable String
- CommandBlockDetector.currentTargetPos: nullable BlockPos
- Both are read-only, no side effects

**Not included** (per plan):
- Syntax highlighting (beyond white text)
- Multi-line wrapping
- Editing/configuration
- Animation or fade effects
