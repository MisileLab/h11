- Local codebase currently has empty initializers: Commandpreview.onInitialize() and CommandpreviewClient.onInitializeClient().
- No Fabric networking/callback symbols yet in commandpreview/src (confirmed by grep + AST).
- Fabric 1.21.x networking pattern uses CustomPayload + PacketCodec + PayloadTypeRegistry.playC2S/playS2C registration before handlers.
- commandpreview fabric.mod.json currently sets environment to "client" and must be changed to "*" for server+client install.
- HUD docs for 1.21.11 mark HudRenderCallback deprecated in favor of HudElementRegistry; plan still specifies HudRenderCallback for this implementation scope.
- Fabric 1.21.x CustomPayload API requires `CustomPayload.Id<T>` wrapper around Identifier.
- `Identifier.of(namespace, path)` is the proper factory method for creating identifiers (not the constructor).
- `PacketCodecs.STRING` returns `PacketCodec<ByteBuf>` but payloads require `PacketCodec<RegistryByteBuf>`.
- Solution: Use `.cast<RegistryByteBuf>()` on the base codec before chaining `.xmap()`.
- `xmap()` transforms codec by mapping (encode func) and unmapping (decode func) with constructor reference syntax.
- Gradle wrapper generated successfully via `gradle wrapper` - creates gradlew, gradlew.bat, gradle/ directory.
- Build now passes with no errors on `./gradlew build --no-daemon`.
14: - Fabric 1.21.11 `PacketCodec.tuple()` accepts exactly one codec + two functions (encode: T → Unit, decode: () → T), not variadic codecs.
15: - To encode multiple fields (e.g., x, y, z for BlockPos), use a custom anonymous `PacketCodec` object with direct `encode(buf, value)` and `decode(buf): T` implementations.
16: - Custom `PacketCodec` can sequentially call `writeVarInt()` and `readVarInt()` on `RegistryByteBuf` for each coordinate.
17: - This approach avoids nested lambdas, complex type inference issues, and gives full control over serialization order/structure.
- Task 4 (HUD Renderer) implemented in CommandPreviewHud.kt as object with render function.
- HudRenderCallback signature: `fun render(drawContext: DrawContext, tickCounter: RenderTickCounter)` matches 1.21.11 API.
- Null guards at render entry point prevent drawing when currentCommand or currentTargetPos is null (defensive programming).
- Text truncation: if command.length > 80, take first 77 chars + "..." to fit HUD display.
- Centering: x = (screenWidth - textWidth) / 2 ensures horizontal center alignment.
- Background: 0x80000000 = semi-transparent black (128 alpha, RGB 000000).
- Text rendering: 0xFFFFFF white color with shadow=true for readability.
- HUD y-position: screenHeight - 60 places overlay above hotbar as specified.
- Dependencies: reads only from CommandBlockDetector (currentCommand, currentTargetPos). No mutation of detector or networking state.
- Build verified: BUILD SUCCESSFUL with compileClientKotlin task passing.

- Task 3 detector implementation now uses crosshair-first targeting with feet fallback only when no crosshair command block matches.
- Command target caching uses `MutableMap<BlockPos, Pair<String, Long>>` with 30s TTL cleanup and updates active command immediately on matching S2C response.
- Client initialization now wires `ClientTickEvents.END_CLIENT_TICK` and `ClientPlayNetworking.registerGlobalReceiver(CommandPreviewResponsePayload.ID, ...)` to detector tick/response flow.

- Task 2 (Server Handler): Minecraft 1.21.11 Yarn mappings changed permission/world APIs significantly from older versions.
- `hasPermissionLevel(int)` does NOT exist in 1.21.11. Replaced by `player.permissions.hasPermission(Permission.Level(PermissionLevel.GAMEMASTERS))` for OP level 2.
- `PermissionLevel` enum: ALL(0), MODERATORS(1), GAMEMASTERS(2), ADMINS(3), OWNERS(4). GAMEMASTERS = OP level 2.
- `serverWorld` property does NOT exist on ServerPlayerEntity in 1.21.11. Use `player.entityWorld` instead (returns ServerWorld on server-side).
- `ServerPlayNetworking.registerGlobalReceiver(ID) { payload, context -> }` — context provides `player()` and `server()`.
- `ServerPlayNetworking.send(player, payload)` is the static method for sending S2C responses.
- `CommandBlockBlockEntity.commandExecutor.command` correctly accesses stored command string via Kotlin property access.
- API verification via `javap -p -cp <mapped-jar>` on Yarn-mapped classes is reliable for confirming exact method names.

- Task 5 (Integration & Build Verification): Added missing HudRenderCallback.EVENT.register(CommandPreviewHud::render) to CommandpreviewClient.onInitializeClient().
- All 3 client registrations now present: HUD callback, client tick event, S2C receiver handler.
- Server entry point already had both payload type and server handler registrations from Task 2.
- Build completes successfully with deprecation warning for HudRenderCallback (expected per plan).
- Final jar produced: commandpreview-0.0.1.jar (24 KB) in build/libs/.
- All 5 required source files exist at correct paths.
- fabric.mod.json correctly set to environment: "*" for server+client installation.
- HUD callback deprecation is acceptable trade-off (plan explicitly specified HudRenderCallback over newer HudElementRegistry).

- [F1 audit 2026-02-17] Plan compliance status: Must Have 6/7, Must NOT Have 7/7, Tasks 2/5 -> REJECT.
- [F1 audit 2026-02-17] Mismatch vs plan: server OP check uses `player.permissions.hasPermission(Permission.Level(PermissionLevel.GAMEMASTERS))` instead of `hasPermissionLevel(2)` (see `commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt:76`).
- [F1 audit 2026-02-17] Missing evidence files: `.sisyphus/evidence/task-1-*.txt`, `.sisyphus/evidence/task-2-*.txt`, `.sisyphus/evidence/task-3-*.txt` are absent; Task 4/5 evidence present.

- [Evidence Completion 2026-02-17] Generated all 12 missing evidence files for Tasks 1-3:
  - Task 1: task-1-gradlew-check.txt, task-1-environment-check.txt, task-1-build.txt, task-1-payload-registration.txt
  - Task 2: task-2-server-init.txt, task-2-permission-check.txt, task-2-build.txt, task-2-handler-structure.txt
  - Task 3: task-3-priority-check.txt, task-3-block-types.txt, task-3-debounce.txt, task-3-build.txt
  - All evidence files captured from actual test command outputs; gradle build verified successful on all tasks.

- [F1 re-audit 2026-02-17] Must Have 7/7 | Must NOT Have 7/7 | Tasks 5/5 -> APPROVE (treat PermissionLevel.GAMEMASTERS as OP level 2)

- [F1 audit 2026-02-17] Plan compliance status: Must Have 7/7, Must NOT Have 8/8, Tasks 5/5 -> APPROVE (GAMEMASTERS permission check treated as OP level 2 equivalent).
