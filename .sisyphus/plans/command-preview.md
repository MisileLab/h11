# Command Block Preview Mod

## TL;DR

> **Quick Summary**: Fabric 1.21.11 모드. 플레이어가 커맨드 블록을 바라보거나 위에 서 있으면 저장된 커맨드를 HUD 오버레이로 표시. 커스텀 C2S/S2C 네트워킹으로 서버에서 커맨드 데이터를 가져옴.
>
> **Deliverables**:
> - 서버+클라이언트 Fabric 모드 (.jar)
> - 서버: C2S 패킷 수신 → 커맨드 블록 데이터 읽기 → S2C 응답
> - 클라이언트: 커맨드 블록 감지 + HUD 오버레이 렌더링
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves (1 foundation, 3 parallel core, 1 integration)
> **Critical Path**: Task 1 → Task 3 → Task 5

---

## Context

### Original Request
커맨드 블록 위에 있거나 보고 있으면 그 커맨드 블록에 저장되어 있는 커맨드를 띄워주는 모드를 만들어줘

### Interview Summary
**Key Discussions**:
- **표시 방식**: HUD 오버레이 (화면에 텍스트 렌더링)
- **토글**: 항상 활성화 (키바인드 토글 없음)
- **대상**: OP/크리에이티브 플레이어 전용 (서버에서 권한 체크)
- **우선순위**: 크로스헤어(바라보기) 우선, 발밑은 바라보는 블록이 없을 때만
- **데이터 접근**: 커스텀 네트워킹 패킷 (C2S 요청 + S2C 응답)
- **설치 요구**: 서버+클라이언트 모두 설치 필요

**Research Findings**:
- 바닐라 `CommandBlockBlockEntity`는 `toUpdatePacket()`/`toInitialChunkDataNbt()`를 오버라이드하지 않아 클라이언트에 커맨드 데이터가 자동 동기화되지 않음
- 커스텀 네트워킹이 가장 깔끔한 해결책 (Mixin 불필요, 권한 체크 내장)
- `HudRenderCallback.EVENT`의 시그니처: `(DrawContext, RenderTickCounter) -> Unit`
- 크로스헤어 감지 패턴: `client.crosshairTarget as? BlockHitResult`
- Fabric Networking API v2: `CustomPayload` + `PayloadTypeRegistry` 사용

### Metis Review
**Identified Gaps** (addressed):
- 커맨드 블록 데이터 미동기화 → 커스텀 네트워킹으로 해결
- `gradlew` 누락 → Task 1에서 생성
- `fabric.mod.json`의 `"environment": "client"` → `"*"`로 변경
- Mixin-Kotlin 호환성 문제 → Mixin 불필요 (네트워킹 방식)
- 긴 커맨드 처리 → 80자 초과 시 "..." 절삭

---

## Work Objectives

### Core Objective
플레이어가 커맨드 블록을 바라보거나 위에 서 있을 때, 서버에서 해당 커맨드 블록의 저장된 커맨드를 가져와 HUD 오버레이로 표시하는 Fabric 모드 구현.

### Concrete Deliverables
- `src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt` — 패킷 정의 + 서버 핸들러
- `src/main/kotlin/xyz/misile/commandpreview/Commandpreview.kt` — 서버 초기화 (네트워킹 등록)
- `src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt` — 클라이언트 감지 + 디바운스 + 캐시
- `src/client/kotlin/xyz/misile/commandpreview/client/CommandPreviewHud.kt` — HUD 렌더링
- `src/client/kotlin/xyz/misile/commandpreview/client/CommandpreviewClient.kt` — 클라이언트 초기화
- `src/main/resources/fabric.mod.json` — environment: `"*"`로 업데이트

### Definition of Done
- [ ] `gradle build --no-daemon` 빌드 성공 (commandpreview/ 디렉토리)
- [ ] 서버: C2S 패킷 수신 → OP 권한 체크 → 커맨드 읽기 → S2C 응답 전송
- [ ] 클라이언트: 크로스헤어/발밑 커맨드 블록 감지 → C2S 요청 (디바운스 적용)
- [ ] 클라이언트: S2C 응답 수신 → HUD에 커맨드 텍스트 렌더링
- [ ] 3종 커맨드 블록 모두 감지 (impulse, chain, repeating)

### Must Have
- 크로스헤어 타겟 감지 (impulse/chain/repeating 커맨드 블록 모두)
- 발밑 블록 감지 (`player.blockPos.down()`)
- 크로스헤어 우선순위 (바라보는 블록이 있으면 발밑 무시)
- 서버에서 OP 권한 체크 (`hasPermissionLevel(2)`)
- 요청 디바운스 (같은 위치 반복 요청 방지, 최소 10틱 간격)
- HUD 텍스트에 반투명 배경
- 80자 초과 커맨드 절삭 ("...")

### Must NOT Have (Guardrails)
- ❌ 키바인드 토글 시스템
- ❌ 커맨드 편집 기능
- ❌ 구문 강조 (syntax highlighting)
- ❌ 커맨드 마인카트 지원
- ❌ 설정 파일/설정 화면
- ❌ 멀티라인 줄바꿈 (단일 라인 + 절삭만)
- ❌ Mixin 사용 (네트워킹으로 해결)
- ❌ 매 틱마다 패킷 전송 (반드시 디바운스)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — 모든 검증은 에이전트가 실행. 예외 없음.

### Test Decision
- **Infrastructure exists**: NO (마인크래프트 모드 - 유닛 테스트 프레임워크 없음)
- **Automated tests**: None
- **Framework**: N/A
- **Primary verification**: `gradle build --no-daemon` + 코드 구조 검증

### QA Policy
모든 태스크는 빌드 검증 + 코드 구조 검증을 포함.
Evidence: `.sisyphus/evidence/task-{N}-{scenario-slug}.txt`

| Deliverable Type | Verification Tool | Method |
|------------------|-------------------|--------|
| Kotlin source | Bash (gradle) | `gradle build --no-daemon` 빌드 성공 |
| Config files | Bash (grep) | JSON 파일 내용 검증 |
| Registration code | Bash (grep) | 필수 API 호출 존재 확인 |

---

## Execution Strategy

### File Tree (Final State)

```
commandpreview/src/
├── main/
│   ├── kotlin/xyz/misile/commandpreview/
│   │   ├── Commandpreview.kt                    # [MODIFY] 서버 초기화
│   │   └── network/
│   │       └── CommandPreviewNetworking.kt       # [NEW] 패킷 정의 + 서버 핸들러
│   └── resources/
│       ├── fabric.mod.json                       # [MODIFY] environment → "*"
│       └── commandpreview.mixins.json            # [UNCHANGED]
└── client/
    ├── kotlin/xyz/misile/commandpreview/client/
    │   ├── CommandpreviewClient.kt               # [MODIFY] 클라이언트 초기화
    │   ├── CommandBlockDetector.kt               # [NEW] 감지 + 디바운스 + 캐시
    │   └── CommandPreviewHud.kt                  # [NEW] HUD 렌더링
    └── resources/
        └── commandpreview.client.mixins.json     # [UNCHANGED]
```

### Parallel Execution Waves

```
Wave 1 (Foundation — config + shared types):
└── Task 1: Project config + network packet definitions [quick]

Wave 2 (Core — MAX PARALLEL):
├── Task 2: Server-side packet handler (depends: 1) [unspecified-high]
├── Task 3: Client detection + networking (depends: 1) [deep]
└── Task 4: HUD renderer (depends: 1) [quick]

Wave 3 (Integration):
└── Task 5: Wire entry points + build verification (depends: 2, 3, 4) [quick]

Wave FINAL (Review — parallel):
├── F1: Plan compliance audit [oracle]
└── F2: Build + code quality review [unspecified-high]

Critical Path: Task 1 → Task 3 → Task 5 → FINAL
Parallel Speedup: ~40% faster than sequential (3 parallel in Wave 2)
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1 | — | 2, 3, 4 | 1 |
| 2 | 1 | 5 | 2 |
| 3 | 1 | 5 | 2 |
| 4 | 1 | 5 | 2 |
| 5 | 2, 3, 4 | F1, F2 | 3 |
| F1 | 5 | — | FINAL |
| F2 | 5 | — | FINAL |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks → Agent Category |
|------|------------|----------------------|
| 1 | **1** | T1 → `quick` |
| 2 | **3** | T2 → `unspecified-high`, T3 → `deep`, T4 → `quick` |
| 3 | **1** | T5 → `quick` |
| FINAL | **2** | F1 → `oracle`, F2 → `unspecified-high` |

---

## TODOs

- [ ] 1. Foundation — Project Config + Network Packet Definitions

  **What to do**:
  - Generate gradle wrapper: `gradle wrapper` in `commandpreview/` directory
  - Update `src/main/resources/fabric.mod.json`:
    - Change `"environment": "client"` to `"environment": "*"`
  - Create `src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt`:
    - Define `CommandPreviewRequestPayload` implementing `CustomPayload`:
      - Field: `val pos: BlockPos`
      - Companion: `val ID = CustomPayload.Id<CommandPreviewRequestPayload>(Identifier.of("commandpreview", "request"))`
      - Companion: `val CODEC: PacketCodec<RegistryByteBuf, CommandPreviewRequestPayload>` — encode/decode BlockPos
      - Override: `getId() = ID`
    - Define `CommandPreviewResponsePayload` implementing `CustomPayload`:
      - Fields: `val pos: BlockPos`, `val command: String`
      - Companion: `val ID = CustomPayload.Id<CommandPreviewResponsePayload>(Identifier.of("commandpreview", "response"))`
      - Companion: `val CODEC: PacketCodec<RegistryByteBuf, CommandPreviewResponsePayload>` — encode/decode BlockPos + String
      - Override: `getId() = ID`
    - Function `fun registerPayloadTypes()`:
      - `PayloadTypeRegistry.playC2S().register(CommandPreviewRequestPayload.ID, CommandPreviewRequestPayload.CODEC)`
      - `PayloadTypeRegistry.playS2C().register(CommandPreviewResponsePayload.ID, CommandPreviewResponsePayload.CODEC)`

  **Must NOT do**:
  - Don't add config/settings framework
  - Don't create any mixin files
  - Don't add dependencies beyond what's already in build.gradle.kts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config update + boilerplate Kotlin data class creation. Single-concern, low complexity.
  - **Skills**: []
    - No specialized skills needed — standard Kotlin + Fabric API patterns
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction
    - `frontend-ui-ux`: Not a web UI task

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation — everything depends on this)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `commandpreview/src/main/kotlin/xyz/misile/commandpreview/Commandpreview.kt` — Package naming convention (`xyz.misile.commandpreview`), existing main entrypoint structure
  - `commandpreview/src/main/resources/fabric.mod.json` — Current mod config, entrypoint declarations, the exact `"environment": "client"` line to change to `"*"`
  - `commandpreview/build.gradle.kts:51-58` — Dependency declarations to confirm Fabric API is available (used for networking)

  **API/Type References** (contracts to implement against):
  - Fabric Networking API: `net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry` — used to register C2S/S2C payload types
  - Minecraft: `net.minecraft.network.packet.CustomPayload` — interface that both payload classes must implement
  - Minecraft: `net.minecraft.network.codec.PacketCodec` — codec for serializing/deserializing payloads
  - Minecraft: `net.minecraft.util.Identifier` — for creating `Identifier.of("commandpreview", "request")` and `"response"`
  - Minecraft: `net.minecraft.util.math.BlockPos` — the position field in packets

  **External References**:
  - Fabric Networking API docs: https://docs.fabricmc.net/develop/networking — Custom payloads tutorial for 1.21+
  - Fabric API source (PayloadTypeRegistry usage): search `PayloadTypeRegistry.playC2S().register` in GitHub for real usage patterns

  **WHY Each Reference Matters**:
  - `Commandpreview.kt`: Copy the package structure and naming. The network package should be `xyz.misile.commandpreview.network`
  - `fabric.mod.json`: This is the exact file to edit. The `"environment"` field on line 11 must change from `"client"` to `"*"` for the mod to load on both sides
  - Fabric Networking docs: The payload registration API changed significantly in 1.21. Must use the new `CustomPayload` + `PacketCodec` pattern, NOT the old channel-based API

  **Acceptance Criteria**:

  - [ ] `commandpreview/gradlew` exists and is executable
  - [ ] `fabric.mod.json` contains `"environment": "*"` (not `"client"`)
  - [ ] `CommandPreviewNetworking.kt` exists at correct path
  - [ ] `gradle build --no-daemon` → BUILD SUCCESSFUL

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Gradle wrapper generated and functional
    Tool: Bash
    Preconditions: commandpreview/ directory exists, system gradle available
    Steps:
      1. Run `ls commandpreview/gradlew` — verify file exists
      2. Run `test -x commandpreview/gradlew` — verify executable
      3. Run `./gradlew --version` in commandpreview/ workdir — verify it runs
    Expected Result: gradlew exists, is executable, prints Gradle version
    Failure Indicators: "No such file", "Permission denied", non-zero exit code
    Evidence: .sisyphus/evidence/task-1-gradlew-check.txt

  Scenario: fabric.mod.json environment updated
    Tool: Bash (grep)
    Preconditions: fabric.mod.json modified
    Steps:
      1. Run `grep '"environment"' commandpreview/src/main/resources/fabric.mod.json`
      2. Assert output contains `"*"` and does NOT contain `"client"`
    Expected Result: `"environment": "*"`
    Failure Indicators: Still shows `"client"` or field missing
    Evidence: .sisyphus/evidence/task-1-environment-check.txt

  Scenario: Network packet classes compile
    Tool: Bash (gradle)
    Preconditions: All files created
    Steps:
      1. Run `./gradlew build --no-daemon` in commandpreview/ workdir
      2. Assert exit code 0 and output contains "BUILD SUCCESSFUL"
    Expected Result: BUILD SUCCESSFUL
    Failure Indicators: Compilation errors, missing imports, unresolved references
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: Payload type registration exists
    Tool: Bash (grep)
    Preconditions: CommandPreviewNetworking.kt created
    Steps:
      1. Run `grep -r "PayloadTypeRegistry.playC2S" commandpreview/src/`
      2. Run `grep -r "PayloadTypeRegistry.playS2C" commandpreview/src/`
      3. Assert both return matches
    Expected Result: Both C2S and S2C registrations found
    Failure Indicators: No matches for either grep
    Evidence: .sisyphus/evidence/task-1-payload-registration.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-gradlew-check.txt
  - [ ] task-1-environment-check.txt
  - [ ] task-1-build.txt
  - [ ] task-1-payload-registration.txt

  **Commit**: YES
  - Message: `feat(commandpreview): add network packet definitions and update mod environment`
  - Files: `commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt`, `commandpreview/src/main/resources/fabric.mod.json`, `commandpreview/gradlew`, `commandpreview/gradle/wrapper/*`
  - Pre-commit: `./gradlew build --no-daemon` in commandpreview/

---

- [ ] 2. Server-Side — Packet Handler

  **What to do**:
  - In `CommandPreviewNetworking.kt`, add function `fun registerServerHandler()`:
    - Use `ServerPlayNetworking.registerGlobalReceiver(CommandPreviewRequestPayload.ID, handler)`
    - Handler implementation:
      1. Get `ServerPlayerEntity` from context
      2. Check `player.hasPermissionLevel(2)` — if false, return silently
      3. Get `player.serverWorld.getBlockEntity(payload.pos)`
      4. Check if it's `CommandBlockBlockEntity` — if not, return silently
      5. Get command: `(blockEntity as CommandBlockBlockEntity).commandExecutor.command`
      6. Send response: `ServerPlayNetworking.send(player, CommandPreviewResponsePayload(payload.pos, command))`
    - Edge case: if `blockEntity` is null (chunk not loaded), return silently
  - Update `Commandpreview.onInitialize()`:
    - Call `CommandPreviewNetworking.registerPayloadTypes()`
    - Call `CommandPreviewNetworking.registerServerHandler()`

  **Must NOT do**:
  - Don't add logging for every request (performance impact)
  - Don't broadcast command data to other players
  - Don't handle command blocks that are out of render distance
  - Don't add rate limiting beyond what the client debounce provides

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Server-side networking requires understanding Fabric Networking API v2, permission model, and block entity access patterns. Not trivial but well-scoped.
  - **Skills**: []
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `commandpreview/src/main/kotlin/xyz/misile/commandpreview/Commandpreview.kt` — The `onInitialize()` method to add registration calls. Currently empty (line 7).
  - `commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt` — Created in Task 1. Add `registerServerHandler()` here alongside existing payload definitions.

  **API/Type References**:
  - `net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking` — `registerGlobalReceiver()` for C2S handling, `send()` for S2C response
  - `net.minecraft.server.network.ServerPlayerEntity` — `hasPermissionLevel(2)` for OP check, `getServerWorld()` for world access
  - `net.minecraft.block.entity.CommandBlockBlockEntity` — Target block entity type. Has `getCommandExecutor()` returning `CommandBlockExecutor`
  - `net.minecraft.world.CommandBlockExecutor` — `getCommand(): String` returns the stored command string
  - `net.minecraft.server.world.ServerWorld` — `getBlockEntity(BlockPos): BlockEntity?` to fetch block entity

  **External References**:
  - Fabric Networking API: https://docs.fabricmc.net/develop/networking — Server-side receiver registration pattern
  - Search GitHub for `ServerPlayNetworking.registerGlobalReceiver` with Kotlin for real usage examples

  **WHY Each Reference Matters**:
  - `Commandpreview.kt`: This is where `registerPayloadTypes()` and `registerServerHandler()` must be called during mod init
  - `ServerPlayNetworking`: The exact API for registering server-side C2S handlers and sending S2C responses. The API changed in 1.21 — must use the new payload-based version
  - `CommandBlockBlockEntity`: The executor must know the exact class hierarchy: `CommandBlockBlockEntity` → `getCommandExecutor()` → `getCommand()`. The executor pattern, not direct field access.

  **Acceptance Criteria**:

  - [ ] `CommandPreviewNetworking.kt` contains `registerServerHandler()` function
  - [ ] `Commandpreview.onInitialize()` calls both `registerPayloadTypes()` and `registerServerHandler()`
  - [ ] Handler checks `hasPermissionLevel(2)` before responding
  - [ ] Handler checks block entity is `CommandBlockBlockEntity`
  - [ ] `./gradlew build --no-daemon` → BUILD SUCCESSFUL

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Server handler registered in onInitialize
    Tool: Bash (grep)
    Preconditions: Commandpreview.kt and CommandPreviewNetworking.kt modified
    Steps:
      1. Run `grep -A5 "onInitialize" commandpreview/src/main/kotlin/xyz/misile/commandpreview/Commandpreview.kt`
      2. Assert output contains "registerPayloadTypes" AND "registerServerHandler"
    Expected Result: Both registration calls present in onInitialize
    Failure Indicators: Missing either call
    Evidence: .sisyphus/evidence/task-2-server-init.txt

  Scenario: Permission check exists in handler
    Tool: Bash (grep)
    Preconditions: Handler implemented
    Steps:
      1. Run `grep "hasPermissionLevel" commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt`
      2. Assert match found
    Expected Result: Permission level check present
    Failure Indicators: No match
    Evidence: .sisyphus/evidence/task-2-permission-check.txt

  Scenario: Build succeeds with server handler
    Tool: Bash (gradle)
    Preconditions: All Task 2 changes applied
    Steps:
      1. Run `./gradlew build --no-daemon` in commandpreview/
      2. Assert BUILD SUCCESSFUL
    Expected Result: BUILD SUCCESSFUL
    Failure Indicators: Compilation errors
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: Handler does NOT respond to non-command blocks (code review)
    Tool: Bash (grep)
    Preconditions: Handler implemented
    Steps:
      1. Run `grep -c "CommandBlockBlockEntity" commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt`
      2. Assert count >= 1 (type check exists)
      3. Run `grep "commandExecutor" commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt`
      4. Assert match found (command extraction exists)
    Expected Result: Both type check and command extraction present
    Failure Indicators: Missing type check or command access
    Evidence: .sisyphus/evidence/task-2-handler-structure.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-server-init.txt
  - [ ] task-2-permission-check.txt
  - [ ] task-2-build.txt
  - [ ] task-2-handler-structure.txt

  **Commit**: YES
  - Message: `feat(commandpreview): add server-side command block data handler`
  - Files: `commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt`, `commandpreview/src/main/kotlin/xyz/misile/commandpreview/Commandpreview.kt`
  - Pre-commit: `./gradlew build --no-daemon` in commandpreview/

---

- [ ] 3. Client-Side — Command Block Detection + Networking

  **What to do**:
  - Create `src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt`:
    - State fields:
      - `var currentTargetPos: BlockPos?` — currently targeted command block position
      - `var currentCommand: String?` — cached command for current target
      - `private val cache: MutableMap<BlockPos, Pair<String, Long>>` — pos → (command, timestamp)
      - `private var lastRequestPos: BlockPos?` — last position we sent a request for
      - `private var lastRequestTick: Long = 0` — tick of last request
      - `private const val DEBOUNCE_TICKS = 10` — minimum ticks between requests for same position
      - `private const val CACHE_TTL_MS = 30_000L` — 30 second cache TTL
    - Function `fun tick(client: MinecraftClient)`:
      1. Get `client.world` and `client.player` — if null, clear and return
      2. **Crosshair check**:
         - `val hitResult = client.crosshairTarget`
         - If `hitResult is BlockHitResult` and `hitResult.type != HitResult.Type.MISS`:
           - Get `blockState = world.getBlockState(hitResult.blockPos)`
           - If `isCommandBlock(blockState)` → `targetPos = hitResult.blockPos`
      3. **Feet check** (only if crosshair didn't match):
         - `val belowPos = player.blockPos.down()`
         - If `isCommandBlock(world.getBlockState(belowPos))` → `targetPos = belowPos`
      4. If `targetPos != null`:
         - Check cache: if `cache[targetPos]` exists and not expired → set `currentCommand`, skip request
         - Else if needs request (position changed OR debounce elapsed):
           - Send C2S: `ClientPlayNetworking.send(CommandPreviewRequestPayload(targetPos))`
           - Update `lastRequestPos` and `lastRequestTick`
         - Set `currentTargetPos = targetPos`
      5. If `targetPos == null`:
         - Set `currentTargetPos = null`, `currentCommand = null`
    - Function `fun isCommandBlock(state: BlockState): Boolean`:
      - Return `state.isOf(Blocks.COMMAND_BLOCK) || state.isOf(Blocks.CHAIN_COMMAND_BLOCK) || state.isOf(Blocks.REPEATING_COMMAND_BLOCK)`
    - Function `fun handleResponse(pos: BlockPos, command: String)`:
      - Store in cache: `cache[pos] = Pair(command, System.currentTimeMillis())`
      - If `pos == currentTargetPos` → update `currentCommand = command`
  - In `CommandpreviewClient.kt`, register:
    - `ClientTickEvents.END_CLIENT_TICK` → call `CommandBlockDetector.tick(client)`
    - `ClientPlayNetworking.registerGlobalReceiver(CommandPreviewResponsePayload.ID, handler)`:
      - Handler: call `CommandBlockDetector.handleResponse(payload.pos, payload.command)`

  **Must NOT do**:
  - Don't send a packet every tick — MUST debounce (minimum 10 ticks between requests for same position)
  - Don't skip the crosshair priority over feet check
  - Don't cache indefinitely — use TTL for stale data cleanup
  - Don't add distance checks (server handles block entity availability)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex task — state management, caching with TTL, debouncing, two detection methods with priority, networking integration. Requires careful design to avoid packet spam.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandpreviewClient.kt` — Client entrypoint where tick event and S2C receiver will be registered. Currently empty `onInitializeClient()`.
  - `commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt` — Created in Task 1. Contains `CommandPreviewRequestPayload` and `CommandPreviewResponsePayload` that this task sends/receives.

  **API/Type References**:
  - `net.minecraft.client.MinecraftClient` — `crosshairTarget: HitResult?` for raycast, `world: ClientWorld?`, `player: ClientPlayerEntity?`
  - `net.minecraft.util.hit.BlockHitResult` — `getBlockPos(): BlockPos`, `getType(): HitResult.Type`
  - `net.minecraft.util.hit.HitResult.Type` — `MISS`, `BLOCK`, `ENTITY`
  - `net.minecraft.block.Blocks` — `COMMAND_BLOCK`, `CHAIN_COMMAND_BLOCK`, `REPEATING_COMMAND_BLOCK`
  - `net.minecraft.block.BlockState` — `isOf(Block): Boolean`
  - `net.minecraft.entity.player.PlayerEntity` — `getBlockPos(): BlockPos`
  - `net.minecraft.util.math.BlockPos` — `down(): BlockPos`
  - `net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents` — `END_CLIENT_TICK` event
  - `net.fabricmc.fabric.api.networking.v1.ClientPlayNetworking` — `send(CustomPayload)` for C2S, `registerGlobalReceiver()` for S2C

  **External References**:
  - Fabric Client Events: https://docs.fabricmc.net/develop/events — ClientTickEvents registration pattern
  - Fabric Networking (client): https://docs.fabricmc.net/develop/networking — Client-side send and receive patterns

  **WHY Each Reference Matters**:
  - `MinecraftClient.crosshairTarget`: This is THE field for detecting what the player is looking at. Must check type before casting to `BlockHitResult`.
  - `Blocks.COMMAND_BLOCK/CHAIN/REPEATING`: All three variants must be checked. Using `isOf()` is the correct Yarn-mapped method.
  - `ClientTickEvents.END_CLIENT_TICK`: Runs after each client tick — correct place for detection logic. NOT `START_CLIENT_TICK` (world state may not be ready).
  - `ClientPlayNetworking.send()`: The 1.21+ API takes a `CustomPayload` directly, not raw bytes.

  **Acceptance Criteria**:

  - [ ] `CommandBlockDetector.kt` exists with `tick()`, `isCommandBlock()`, `handleResponse()`
  - [ ] Debounce constant ≥ 10 ticks
  - [ ] Crosshair check executes before feet check (priority)
  - [ ] Three command block types checked in `isCommandBlock()`
  - [ ] `./gradlew build --no-daemon` → BUILD SUCCESSFUL

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Detection logic has crosshair priority
    Tool: Bash (grep)
    Preconditions: CommandBlockDetector.kt created
    Steps:
      1. Read CommandBlockDetector.kt
      2. Verify crosshairTarget check appears BEFORE blockPos.down() check in tick()
      3. Verify the feet check is conditional (only when crosshair didn't match)
    Expected Result: Crosshair check is first, feet check is in an else/fallback branch
    Failure Indicators: Both checks run independently, or feet check is first
    Evidence: .sisyphus/evidence/task-3-priority-check.txt

  Scenario: All three command block types detected
    Tool: Bash (grep)
    Preconditions: CommandBlockDetector.kt created
    Steps:
      1. Run `grep -c "COMMAND_BLOCK\|CHAIN_COMMAND_BLOCK\|REPEATING_COMMAND_BLOCK" commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt`
      2. Assert count >= 3
    Expected Result: All three block types referenced
    Failure Indicators: Count < 3
    Evidence: .sisyphus/evidence/task-3-block-types.txt

  Scenario: Debounce mechanism exists
    Tool: Bash (grep)
    Preconditions: CommandBlockDetector.kt created
    Steps:
      1. Run `grep -i "debounce\|DEBOUNCE_TICKS\|lastRequest" commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt`
      2. Assert at least 2 matches (constant + usage)
    Expected Result: Debounce mechanism present with tick-based throttling
    Failure Indicators: No debounce-related code
    Evidence: .sisyphus/evidence/task-3-debounce.txt

  Scenario: Build succeeds with detection + client networking
    Tool: Bash (gradle)
    Preconditions: All Task 3 changes applied
    Steps:
      1. Run `./gradlew build --no-daemon` in commandpreview/
      2. Assert BUILD SUCCESSFUL
    Expected Result: BUILD SUCCESSFUL
    Failure Indicators: Compilation errors, unresolved imports
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-priority-check.txt
  - [ ] task-3-block-types.txt
  - [ ] task-3-debounce.txt
  - [ ] task-3-build.txt

  **Commit**: YES
  - Message: `feat(commandpreview): add client-side command block detection with debounced networking`
  - Files: `commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt`, `commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandpreviewClient.kt`
  - Pre-commit: `./gradlew build --no-daemon` in commandpreview/

---

- [ ] 4. Client-Side — HUD Renderer

  **What to do**:
  - Create `src/client/kotlin/xyz/misile/commandpreview/client/CommandPreviewHud.kt`:
    - Object or class with a render function:
    - Function `fun render(drawContext: DrawContext, tickCounter: RenderTickCounter)`:
      1. Read `CommandBlockDetector.currentCommand` — if null, return early
      2. Read `CommandBlockDetector.currentTargetPos` — if null, return early
      3. Prepare display text:
         - If command.length > 80 → truncate to 77 chars + "..."
         - Prefix: command block type indicator (optional: just the command is fine)
      4. Calculate position:
         - `val screenWidth = drawContext.scaledWindowWidth`
         - `val screenHeight = drawContext.scaledWindowHeight`
         - `val textWidth = client.textRenderer.getWidth(displayText)`
         - `val x = (screenWidth - textWidth) / 2` (horizontally centered)
         - `val y = screenHeight - 60` (above hotbar, adjust as needed)
      5. Draw background:
         - `drawContext.fill(x - 4, y - 4, x + textWidth + 4, y + 12, 0x80000000.toInt())` (semi-transparent black)
      6. Draw text:
         - `drawContext.drawText(client.textRenderer, displayText, x, y, 0xFFFFFF, true)` (white with shadow)
  - The render function will be registered as `HudRenderCallback.EVENT.register(CommandPreviewHud::render)` (wired in Task 5)

  **Must NOT do**:
  - Don't add syntax highlighting or color-coded command parts
  - Don't add multi-line text wrapping
  - Don't add command editing capability
  - Don't render when no command is available (early return)
  - Don't use deprecated rendering methods

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward rendering task. Single file, clear API (DrawContext), simple text + rectangle drawing.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Minecraft HUD rendering, not web UI
    - `visual-engineering`: Too heavyweight for simple text rendering

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt` — Created in Task 3. Read `currentCommand` and `currentTargetPos` from this object. The HUD renderer depends on these fields being set by the detector.

  **API/Type References**:
  - `net.minecraft.client.gui.DrawContext` — `drawText(TextRenderer, String, int x, int y, int color, boolean shadow)` for text, `fill(int x1, int y1, int x2, int y2, int color)` for background rectangle, `getScaledWindowWidth()`, `getScaledWindowHeight()`
  - `net.minecraft.client.render.RenderTickCounter` — Second parameter of HudRenderCallback (1.21+)
  - `net.minecraft.client.font.TextRenderer` — `getWidth(String): Int` for measuring text width
  - `net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback` — `EVENT.register { drawContext, tickCounter -> ... }`
  - `net.minecraft.client.MinecraftClient` — `getInstance().textRenderer` for text measurement

  **External References**:
  - Fabric HUD Rendering tutorial: https://docs.fabricmc.net/develop/rendering/hud — Official HudRenderCallback example with DrawContext
  - Search GitHub for `HudRenderCallback.EVENT.register` with Kotlin for real-world examples

  **WHY Each Reference Matters**:
  - `DrawContext`: This is the ONLY way to render on the HUD in 1.21+. The old `MatrixStack`-based rendering is deprecated. Must use `drawText()` and `fill()` methods.
  - `HudRenderCallback`: The Fabric event for HUD rendering. Signature is `(DrawContext, RenderTickCounter)` in 1.21+, NOT `(MatrixStack, float tickDelta)` from older versions.
  - `CommandBlockDetector.currentCommand`: The renderer reads from this. If this field is null, nothing renders. This is the data contract between Tasks 3 and 4.

  **Acceptance Criteria**:

  - [ ] `CommandPreviewHud.kt` exists with `render()` function
  - [ ] Render function has early return when `currentCommand` is null
  - [ ] Text truncation at 80 characters with "..."
  - [ ] Background rectangle drawn (semi-transparent)
  - [ ] Text centered horizontally
  - [ ] `./gradlew build --no-daemon` → BUILD SUCCESSFUL

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Render function has null guard
    Tool: Bash (grep)
    Preconditions: CommandPreviewHud.kt created
    Steps:
      1. Read CommandPreviewHud.kt
      2. Verify render function checks for null/empty command and returns early
    Expected Result: Null check exists before any drawing calls
    Failure Indicators: DrawContext calls without null guard
    Evidence: .sisyphus/evidence/task-4-null-guard.txt

  Scenario: Text truncation implemented
    Tool: Bash (grep)
    Preconditions: CommandPreviewHud.kt created
    Steps:
      1. Run `grep -c "80\|\.\.\.\|truncat" commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandPreviewHud.kt`
      2. Assert count >= 1 (truncation logic exists)
    Expected Result: Truncation logic present
    Failure Indicators: No truncation-related code
    Evidence: .sisyphus/evidence/task-4-truncation.txt

  Scenario: Background and text rendering calls exist
    Tool: Bash (grep)
    Preconditions: CommandPreviewHud.kt created
    Steps:
      1. Run `grep "drawText\|fill" commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandPreviewHud.kt`
      2. Assert both `drawText` and `fill` are found
    Expected Result: Both drawing methods used
    Failure Indicators: Missing fill (no background) or missing drawText (no text)
    Evidence: .sisyphus/evidence/task-4-render-calls.txt

  Scenario: Build succeeds with HUD renderer
    Tool: Bash (gradle)
    Preconditions: All Task 4 changes applied
    Steps:
      1. Run `./gradlew build --no-daemon` in commandpreview/
      2. Assert BUILD SUCCESSFUL
    Expected Result: BUILD SUCCESSFUL
    Failure Indicators: Compilation errors
    Evidence: .sisyphus/evidence/task-4-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-null-guard.txt
  - [ ] task-4-truncation.txt
  - [ ] task-4-render-calls.txt
  - [ ] task-4-build.txt

  **Commit**: YES
  - Message: `feat(commandpreview): add HUD overlay renderer for command text`
  - Files: `commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandPreviewHud.kt`
  - Pre-commit: `./gradlew build --no-daemon` in commandpreview/

---

- [ ] 5. Integration — Wire Entry Points + Final Build Verification

  **What to do**:
  - Verify `CommandpreviewClient.onInitializeClient()` has ALL registrations:
    - `HudRenderCallback.EVENT.register(CommandPreviewHud::render)` or equivalent lambda
    - `ClientTickEvents.END_CLIENT_TICK.register { CommandBlockDetector.tick(it) }`
    - `ClientPlayNetworking.registerGlobalReceiver(CommandPreviewResponsePayload.ID, handler)`
  - Verify `Commandpreview.onInitialize()` has ALL registrations:
    - `CommandPreviewNetworking.registerPayloadTypes()`
    - `CommandPreviewNetworking.registerServerHandler()`
  - Run full build: `./gradlew build --no-daemon`
  - Verify the built jar exists in `commandpreview/build/libs/`
  - Run comprehensive structure check on all files

  **Must NOT do**:
  - Don't add any new functionality
  - Don't refactor existing task code (only wire entry points if not done in prior tasks)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification and wiring task. Check that Tasks 2-4 correctly registered everything, fix any missing registrations, verify final build.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all prior tasks)
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: F1, F2
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandpreviewClient.kt` — Client entry point. Must have all 3 client registrations.
  - `commandpreview/src/main/kotlin/xyz/misile/commandpreview/Commandpreview.kt` — Server entry point. Must have payload type + server handler registrations.
  - All files created in Tasks 1-4 — verify they exist and integrate correctly.

  **API/Type References**:
  - All APIs from Tasks 1-4 apply here (HudRenderCallback, ClientTickEvents, networking APIs)

  **WHY Each Reference Matters**:
  - This task ensures nothing was missed during parallel development. Tasks 2, 3, 4 may have each added some registrations to the entry points. This task verifies completeness.

  **Acceptance Criteria**:

  - [ ] `CommandpreviewClient.onInitializeClient()` registers: HUD callback, tick event, S2C receiver
  - [ ] `Commandpreview.onInitialize()` registers: payload types, server handler
  - [ ] `./gradlew build --no-daemon` → BUILD SUCCESSFUL
  - [ ] Built jar exists in `build/libs/`
  - [ ] All 5 source files exist at correct paths

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Client entry point has all registrations
    Tool: Bash (grep)
    Preconditions: All prior tasks completed
    Steps:
      1. Run `grep -c "HudRenderCallback\|ClientTickEvents\|ClientPlayNetworking" commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandpreviewClient.kt`
      2. Assert count >= 3 (all three registration types)
    Expected Result: All 3 client-side registrations present
    Failure Indicators: Count < 3
    Evidence: .sisyphus/evidence/task-5-client-registrations.txt

  Scenario: Server entry point has all registrations
    Tool: Bash (grep)
    Preconditions: All prior tasks completed
    Steps:
      1. Run `grep -c "registerPayloadTypes\|registerServerHandler" commandpreview/src/main/kotlin/xyz/misile/commandpreview/Commandpreview.kt`
      2. Assert count >= 2
    Expected Result: Both server registrations present
    Failure Indicators: Count < 2
    Evidence: .sisyphus/evidence/task-5-server-registrations.txt

  Scenario: All source files exist at correct paths
    Tool: Bash
    Preconditions: All tasks completed
    Steps:
      1. Verify these 5 files exist:
         - src/main/kotlin/xyz/misile/commandpreview/Commandpreview.kt
         - src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt
         - src/client/kotlin/xyz/misile/commandpreview/client/CommandpreviewClient.kt
         - src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt
         - src/client/kotlin/xyz/misile/commandpreview/client/CommandPreviewHud.kt
      2. Assert all exist
    Expected Result: All 5 files present
    Failure Indicators: Any file missing
    Evidence: .sisyphus/evidence/task-5-file-structure.txt

  Scenario: Final build produces jar
    Tool: Bash (gradle)
    Preconditions: All files in place
    Steps:
      1. Run `./gradlew build --no-daemon` in commandpreview/
      2. Assert BUILD SUCCESSFUL
      3. Run `ls commandpreview/build/libs/*.jar`
      4. Assert at least one jar file exists
    Expected Result: BUILD SUCCESSFUL and jar file produced
    Failure Indicators: Build failure or no jar output
    Evidence: .sisyphus/evidence/task-5-final-build.txt

  Scenario: fabric.mod.json is consistent
    Tool: Bash (grep)
    Preconditions: All tasks completed
    Steps:
      1. Run `grep '"environment"' commandpreview/src/main/resources/fabric.mod.json`
      2. Assert contains `"*"`
      3. Run `grep -A2 '"main"' commandpreview/src/main/resources/fabric.mod.json`
      4. Assert contains "xyz.misile.commandpreview.Commandpreview"
      5. Run `grep -A2 '"client"' commandpreview/src/main/resources/fabric.mod.json`
      6. Assert contains "xyz.misile.commandpreview.client.CommandpreviewClient"
    Expected Result: Environment is "*", entrypoints match actual classes
    Failure Indicators: Wrong environment or mismatched entrypoints
    Evidence: .sisyphus/evidence/task-5-mod-config.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-client-registrations.txt
  - [ ] task-5-server-registrations.txt
  - [ ] task-5-file-structure.txt
  - [ ] task-5-final-build.txt
  - [ ] task-5-mod-config.txt

  **Commit**: YES
  - Message: `feat(commandpreview): wire all components and verify build`
  - Files: Any files needing final wiring adjustments
  - Pre-commit: `./gradlew build --no-daemon` in commandpreview/

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 2 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for patterns). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Build + Code Quality Review** — `unspecified-high`
  Run `./gradlew build --no-daemon`. Review all new/modified Kotlin files for: hardcoded values that should be constants, missing null checks, packet spam potential, memory leaks in cache (no cleanup). Check for AI slop: excessive comments, over-abstraction, unused imports.
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(commandpreview): add network packet definitions and update mod environment` | NetworkingKt, fabric.mod.json, gradlew | `./gradlew build --no-daemon` |
| 2 | `feat(commandpreview): add server-side command block data handler` | NetworkingKt, Commandpreview.kt | `./gradlew build --no-daemon` |
| 3 | `feat(commandpreview): add client-side command block detection with debounced networking` | DetectorKt, CommandpreviewClient.kt | `./gradlew build --no-daemon` |
| 4 | `feat(commandpreview): add HUD overlay renderer for command text` | HudKt | `./gradlew build --no-daemon` |
| 5 | `feat(commandpreview): wire all components and verify build` | Any final wiring | `./gradlew build --no-daemon` |

---

## Success Criteria

### Verification Commands
```bash
# Build succeeds
cd commandpreview && ./gradlew build --no-daemon  # Expected: BUILD SUCCESSFUL

# All source files exist
ls commandpreview/src/main/kotlin/xyz/misile/commandpreview/network/CommandPreviewNetworking.kt  # exists
ls commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt     # exists
ls commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandPreviewHud.kt        # exists

# Environment is server+client
grep '"environment"' commandpreview/src/main/resources/fabric.mod.json  # Expected: "*"

# All registrations present
grep -r "HudRenderCallback" commandpreview/src/client/     # Expected: match
grep -r "ClientTickEvents" commandpreview/src/client/       # Expected: match
grep -r "ServerPlayNetworking" commandpreview/src/main/     # Expected: match
grep -r "PayloadTypeRegistry" commandpreview/src/main/      # Expected: match
grep -r "hasPermissionLevel" commandpreview/src/main/       # Expected: match

# All three command block types handled
grep -c "COMMAND_BLOCK\|CHAIN_COMMAND_BLOCK\|REPEATING_COMMAND_BLOCK" commandpreview/src/client/kotlin/xyz/misile/commandpreview/client/CommandBlockDetector.kt  # Expected: >= 3
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `./gradlew build --no-daemon` passes
- [ ] Built jar in `build/libs/`
- [ ] 5 source files at correct paths
- [ ] `fabric.mod.json` environment: `"*"`
- [ ] No mixin files created (networking approach)
