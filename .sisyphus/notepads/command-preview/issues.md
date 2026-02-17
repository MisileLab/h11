- Notepad files were missing initially; created baseline files before first delegation.
- Need to keep implementation aligned to plan even where newer docs suggest HudElementRegistry over HudRenderCallback.
- Initial payload codec attempt used wrong API signatures (writeString/readString instead of PacketCodecs).
- Identifier constructor is private in Fabric 1.21.x; must use `Identifier.of()` factory.
- PacketCodec type mismatch required cast from ByteBuf to RegistryByteBuf for network payload compliance.
- All issues resolved; no blockers for next checkpoint.
- Plan required BlockPos fields instead of String; initial implementation used wrong payload data types. Fixed by updating CommandPreviewRequestPayload field from `val command: String` to `val pos: BlockPos` and using `PacketCodecs.BLOCK_POS` codec.
- Plan required BlockPos + String fields in CommandPreviewResponsePayload; initial implementation used preview String only. Fixed by updating fields to `val pos: BlockPos, val command: String` and using `PacketCodec.tuple()` to encode/decode both fields.
- PacketCodecs.BLOCK_POS doesn't exist in Fabric 1.21.11 API; PacketCodec.tuple() only accepts single codec + two transform functions (encode/decode), not multiple codecs. Fixed by using tuple(VAR_INT_codec, extractField, constructPayload) pattern for each payload class.

- LSP diagnostics tool timed out repeatedly on Kotlin files (`initialize` timeout), so static validation relied on grep checks and Gradle compile output.
- Current build fails outside Task 3 scope in `commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt` due unresolved references (`hasPermissionLevel`, `serverWorld`) from server handler code.
11: - Initial custom codec attempt (nested tuple composition) exceeded Fabric 1.21.11 API capability; tuple() only handles single-field transformation. Resolved: Implement custom anonymous `PacketCodec` object for full BlockPos encode/decode control. Build verified successful.

- Task 2: Plan specified `hasPermissionLevel(2)` and `player.serverWorld` but these don't exist in Yarn-mapped 1.21.11. Resolved by using `player.permissions.hasPermission(Permission.Level(PermissionLevel.GAMEMASTERS))` and `player.entityWorld`.
- Task 2: File was modified by parallel agents multiple times during implementation, reverting edits. Required careful re-application of changes after each revert.

- Task 5: Only one missing registration found (HudRenderCallback) in client entry point. All other registrations were already wired by Tasks 2, 3, 4.
- Deprecation warnings for HudRenderCallback in compileClientKotlin task are expected and acceptable (plan explicitly specifies this API).
## F2 Code Quality Review Findings (Build + Review)

### Build Result: PASS
- `./gradlew build --no-daemon` → BUILD SUCCESSFUL (all tasks UP-TO-DATE)
- No compilation errors. No deprecation warnings observed (cached build).

### Per-File Review

**1. CommandPreviewNetworking.kt — 2 issues**
- [MEDIUM] :74-83 No server-side rate limiting. Malicious/modified client can spam C2S packets bypassing client debounce. Server processes every request (world lookup + S2C response). Mitigated by OP-level permission gate (only trusted players can trigger), but a modified OP client could still flood.
- [LOW] :20,:45 Namespace string `"commandpreview"` repeated twice. Could extract shared `MOD_ID` constant.
- Null checks: adequate (`!is` handles null from getBlockEntity). All imports used. No AI slop.

**2. Commandpreview.kt — 0 issues**
- Clean 12-line entrypoint. No hardcoded values, no unused imports, no slop.

**3. CommandBlockDetector.kt — 1 issue**
- [LOW] :15 Cache `MutableMap` has no max size cap. Unbounded growth possible if player encounters many unique command blocks in <30s window. Practical risk negligible (entries are ~40 bytes, TTL cleanup runs every tick).
- Constants properly extracted (DEBOUNCE_TICKS=10, CACHE_TTL_MS=30000). Null checks comprehensive. All imports used. No AI slop.
- Cache cleanup: `clearExpiredCacheEntries()` called every tick via `removeIf {}`. Correct TTL enforcement.

**4. CommandPreviewHud.kt — 2 issues**
- [LOW] :21,22,40,43,46 Magic numbers should be named constants: `80` (max display length), `77` (truncation), `60` (Y offset from bottom), `4` (padding), `0x80000000` (bg color), `0xFFFFFF` (text color).
- [LOW] :8,13,20,27,31,35,38,42,45 AI slop — 9 redundant comments restating obvious code (e.g. `// Early return if no command is available` before `if (... == null) return`). Every comment is deletable without information loss.
- Null safety: Lines 9/14 early-return guards + line 18 `?: return` capture — correct pattern for concurrent mutable var access. No thread-safety annotations but acceptable since render runs on client thread.

**5. CommandpreviewClient.kt — 0 issues**
- Clean 23-line client initializer. All 3 registrations present. No unused imports. No slop.

### Packet Spam Assessment
- **Client→Server debounce**: DEBOUNCE_TICKS=10 (~500ms) per same-position. Position changes trigger immediate request. Worst case: ~20 pkt/s oscillating between two blocks.
- **Server-side mitigation**: Permission gate only (OP level 2). No per-player rate limit.
- **Verdict**: LOW-MEDIUM risk. OP-only gate limits attack surface significantly. For a private mod this is acceptable; for public distribution, server-side rate limiting would be advisable.

### Cache Cleanup Assessment
- TTL: 30s, enforced every tick via `removeIf`. No stale entries survive.
- Max size: Unbounded but practically self-limiting (30s window × realistic encounter rate).
- Memory leak: NONE.

### Summary
- Unused imports: 0 across all files
- Missing null checks: 0
- AI slop: CommandPreviewHud.kt (9 redundant comments)
- Hardcoded values: CommandPreviewHud.kt (6 magic numbers)
- Over-abstraction: None
- Packet spam: Client debounced; server lacks rate limit (OP-gated, acceptable)
- Cache leak: None (TTL cleanup works correctly)
