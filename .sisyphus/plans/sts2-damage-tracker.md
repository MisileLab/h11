# STS2 Damage Tracker Mod

## TL;DR
> **Summary**: Slay the Spire 2 모드 — 피해 추적 바 (받은 피해/준 피해 + 카드 출처) 표시. Co-op 및 싱글플레이 모두 지원. Steam Workshop 배포 목표.
> **Deliverables**: 
>   - `DamageTracker.dll` (C# 어셈블리)
>   - `DamageTracker.pck` (Godot 리소스)
>   - `mod_manifest.json` (메타데이터)
>   - 소스 코드 (GitHub)
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: Phase 0 검증 → Phase 1 인프라 → Phase 2 UI → Phase 3 Co-op → Phase 5 패키징

## Context
### Original Request
Slay the Spire 2 co-op/singleplayer용 받은 피해/준 피해 바 (원인도 포함해서 보여주기) 모드 만들어서 스팀 워크샵에 올릴거야.

### Interview Summary
| 항목 | 결정 |
|------|------|
| UI 스타일 | 미니멀 바 (호버 시 상세) |
| 원인 표시 | 카드명만 (ex: "스트라이크 → 슬라임 8") |
| Co-op 범위 | 전체 플레이어 표시 |
| 바 위치 | 화면 상단 (체력/에너지 근처) |
| 기록 보관 | 런 전체 누적 + JSON 영구 저장 |
| 멀티플레이어 UI | 개별 바 (각 플레이어 체력바 옆) |

### Metis Review (gaps addressed)
**핵심 리스크 식별됨:**
1. **Damage Hooking 전략** — Reflection 기반 후킹은 Godot exported build에서 실패 가능성 높음. Harmony/MonoMod 또는 HP polling fallback 필요.
2. **UI Overlay 주의사항** — CanvasLayer는 `GetTree().Root`에 parent해야 함 (scene root X). `Layer >= 128`, `GuiEmbedAllWindows = true` 필수.
3. **Phase 0 필수** — STS2의 damage system 구조 파악 및 hooking 방식 검증이 선행되어야 함.

**보정된 기술 스택:**
- Entry Point: `[ModInitializer]` from `MegaCrit.Sts2.Core.Modding` (검증됨)
- Packaging: `.dll` + `.pck` (검증된 워크플로우)
- Hooking: Harmony 라이브러리 시도 → 실패 시 HP polling fallback

## Work Objectives
### Core Objective
STS2에서 실시간으로 피해를 추적하고 화면 상단에 미니멀 바로 표시하는 모드 개발. 싱글플레이와 4인 co-op 모두 지원하며, 각 플레이어의 피해를 개별 바로 표시.

### Deliverables
1. **Core Module**: Damage event hooking 및 데이터 수집
2. **UI Module**: CanvasLayer 기반 미니멀 피해 바
3. **Network Module**: Co-op용 RPC 동기화
4. **Persistence Module**: JSON 기반 런 기록 저장
5. **Distribution**: Steam Workshop 업로드 준비 (manifest + preview)

### Definition of Done (verifiable conditions)
```bash
# 1. 빌드 성공
dotnet build → DamageTracker.dll 생성
godot --headless --export-release "Windows Desktop" → DamageTracker.pck 생성

# 2. 게임 내 로드 확인
# 게임 실행 후 로그: "Damage Tracker loaded!" 표시
# mods/DamageTracker/ 폴더에 dll + pck 배치

# 3. 기능 검증
# - 싱글플레이에서 피해 바 표시 확인
# - Co-op에서 모든 플레이어 피해 표시 확인
# - 런 종료 후 JSON 파일에 기록 저장 확인
```

### Must Have
- `[ModInitializer]` 진입점 사용
- Harmony 기반 damage hooking (fallback: HP polling)
- CanvasLayer UI overlay (`GetTree().Root` parent)
- Godot MultiplayerAPI RPC 동기화
- JSON persistence (`user://mods/DamageTracker/`)
- mod_manifest.json 메타데이터

### Must NOT Have (guardrails)
- Scene root에 UI parent (scene transition 시 destroy됨)
- `ZIndex` 사용 (CanvasLayer에서 무시됨 — `Layer` 사용)
- Raw `Assembly.LoadFrom()` (exported build에서 type identity 실패)
- Non-atomic file writes (`.tmp` → rename 방식 사용)
- Reflection-only hooking (Harmony 없이는 불안정)

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: Manual in-game testing (STS2 modding has no automated test infra)
- QA policy: Each task has agent-executed scenarios via Playwright (game UI) or file verification
- Evidence: .sisyphus/evidence/task-{N}-{slug}.{ext}

## Execution Strategy
### Parallel Execution Waves
> Phase 0은 선행 필수. 이후 Wave 병렬 실행 가능.

**Wave 0**: Research & Validation (CRITICAL - blocks all others)
**Wave 1**: Core Infrastructure (damage hooking, data structures)
**Wave 2**: UI Implementation (CanvasLayer overlay, co-op display)
**Wave 3**: Persistence & Packaging (JSON save, manifest, distribution)

### Dependency Matrix (full, all tasks)
| Task | Depends On |
|------|------------|
| 1. Phase 0: Damage System Research | - |
| 2. Phase 0: Hooking Strategy Validation | Task 1 |
| 3. Project Setup | Task 2 |
| 4. Damage Data Model | Task 3 |
| 5. Damage Hook Implementation | Task 2, 4 |
| 6. UI CanvasLayer Overlay | Task 3 |
| 7. Damage Bar Component | Task 4, 6 |
| 8. Co-op Player Tracking | Task 4 |
| 9. Co-op RPC Sync | Task 5, 8 |
| 10. Multi-Player UI | Task 7, 9 |
| 11. JSON Persistence | Task 4 |
| 12. Run History Integration | Task 11 |
| 13. mod_manifest.json | Task 3 |
| 14. Build & Package | Task 5, 7, 9, 11, 13 |
| 15. Steam Workshop Prep | Task 14 |

### Agent Dispatch Summary
- Wave 0: 2 tasks (research/validation)
- Wave 1: 3 tasks (setup, data model, hooks)
- Wave 2: 5 tasks (UI, co-op tracking, RPC, multi-player UI)
- Wave 3: 5 tasks (persistence, packaging, distribution)

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

---

## Wave 0: Research & Validation (CRITICAL - Must Complete First)

- [x] 0.1. Phase 0: STS2 Damage System Research

  **What to do**: STS2 게임의 damage system 구조를 파악하기 위해 어셈블리 디컴파일 및 분석.
  1. STS2 설치 디렉토리에서 `sts2.dll` 및 관련 어셈블리 찾기
  2. dnSpy 또는 ILSpy로 디컴파일
  3. Damage 관련 클래스/메서드 식별:
     - `TakeDamage`, `DealDamage`, `ApplyDamage` 등 메서드
     - `AbstractPlayer`, `AbstractMonster`, `AbstractCard` 등 클래스
     - Damage events/signals 존재 여부
  4. JIT vs AOT 컴파일 확인 (`AppDomain.CurrentDomain.GetAssemblies()` 런타임 작동 여부)
  5. 결과를 `.sisyphus/research/damage-system-analysis.md`에 문서화

  **Must NOT do**:
  - 게임 파일 수정 (read-only 분석만)
  - 온라인에 게임 코드 게시 (저작권)

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 복잡한 리버스 엔지니어링 및 분석 필요
  - Skills: [] — Reason: 일반 분석 능력으로 충분
  - Omitted: [`git-master`] — Reason: 코드 작성 없음

  **Parallelization**: Can Parallel: NO | Wave 0 | Blocks: 0.2, 3-15 | Blocked By: -

  **References**:
  - Tool: https://github.com/dnSpy/dnSpy — .NET decompiler
  - Tool: https://github.com/icsharpcode/ILSpy — Alternative decompiler
  - API: `MegaCrit.Sts2.Core.Modding` namespace — Mod entry point
  - External: https://docs.bepinex.dev/articles/dev_guide/plugin_tutorial/index.html — Harmony patching basics

  **Acceptance Criteria** (agent-executable only):
  - [ ] `.sisyphus/research/damage-system-analysis.md` 파일 존재
  - [ ] 문서에 최소 3개 이상의 damage-related 클래스/메서드 식별됨
  - [ ] JIT vs AOT 여부 명시됨
  - [ ] Hooking 가능성 평가 포함됨

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Research output validation
    Tool: Read
    Steps: Read .sisyphus/research/damage-system-analysis.md
    Expected: File contains damage class names, method signatures, JIT/AOT status
    Evidence: .sisyphus/evidence/task-0-1-research-validation.txt
  ```

  **Commit**: NO | Message: - | Files: -

---

- [x] 0.2. Phase 0: Hooking Strategy Validation

  **What to do**: Phase 0.1의 분석 결과를 바탕으로 damage hooking 전략 검증.
  1. **Harmony Patching 테스트**:
     - HarmonyLib NuGet 패키지 추가
     - 간단한 test patch 작성 (예: 로그 출력)
     - 빌드 후 게임에서 로드 테스트
     - Patch가 적용되는지 확인
  2. **Fallback: HP Polling 테스트** (Harmony 실패 시):
     - 매 프레임 enemy HP 확인
     - HP delta로 damage 계산
     - Source 정보 없이도 기본 추적 가능한지 확인
  3. 결과를 `.sisyphus/research/hooking-validation.md`에 문서화
  4. 선택된 전략을 기반으로 아키텍처 결정

  **Must NOT do**:
  - Harmony 없이 순수 reflection만 사용 (불안정)
  - 게임 크래시 유발 (백업 필수)

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 기술적 검증 및 프로토타이핑 필요
  - Skills: [] — Reason: 일반 개발 능력으로 충분
  - Omitted: [`frontend-ui-ux`] — Reason: UI 작업 없음

  **Parallelization**: Can Parallel: NO | Wave 0 | Blocks: 5, 9 | Blocked By: 0.1

  **References**:
  - Library: https://github.com/pardeike/Harmony — .NET patching library
  - Pattern: `[HarmonyPatch(typeof(TargetClass), "MethodName")]`
  - Fallback: `enemy.HP` polling in `_Process(double delta)`
  - External: https://harmony.pardeike.net/articles/patching.html — Patching docs

  **Acceptance Criteria**:
  - [ ] `.sisyphus/research/hooking-validation.md` 파일 존재
  - [ ] Harmony 또는 HP polling 중 하나가 "WORKING"으로 검증됨
  - [ ] 선택된 전략과 그 이유가 명시됨
  - [ ] 프로토타입 코드가 `.sisyphus/prototypes/`에 저장됨

  **QA Scenarios**:
  ```
  Scenario: Hooking validation output
    Tool: Read
    Steps: Read .sisyphus/research/hooking-validation.md
    Expected: Contains "WORKING: Harmony" OR "WORKING: HP Polling" with explanation
    Evidence: .sisyphus/evidence/task-0-2-hooking-validation.txt
  ```

  **Commit**: NO | Message: - | Files: -

---

## Wave 1: Core Infrastructure

- [x] 1.1. Project Setup

  **What to do**: Godot C# 프로젝트 생성 및 기본 구조 설정.
  1. Godot 4.x 프로젝트 생성 (`DamageTrackerMod`)
  2. `.csproj` 파일에 STS2 `sts2.dll` 참조 추가
  3. 기본 폴더 구조 생성:
     ```
     DamageTrackerMod/
     ├── src/
     │   ├── ModEntry.cs
     │   ├── Hooks/
     │   ├── UI/
     │   ├── Network/
     │   └── Data/
     ├── assets/
     │   └── mod_manifest.json
     └── DamageTrackerMod.csproj
     ```
  4. `ModEntry.cs`에 `[ModInitializer]` 진입점 작성
  5. 빌드 테스트 → `.dll` 생성 확인

  **Must NOT do**:
  - STS1 Java/BaseMod 템플릿 사용 (호환 안됨)
  - 잘못된 namespace 사용 (`MegaCrit.Sts2.Core.Modding` 필수)

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 단순 프로젝트 설정
  - Skills: [] — Reason: 기본 설정만 필요
  - Omitted: [`git-master`] — Reason: 초기 커밋 없음

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 1.2, 1.3, 2.1 | Blocked By: 0.1

  **References**:
  - Template: https://github.com/Alchyr/ModTemplate-StS2 — (NOTE: STS2용인지 확인 필요)
  - API: `MegaCrit.Sts2.Core.Modding.ModInitializer`
  - API: `MegaCrit.Sts2.Core.Logging.Log.Warn()`
  - Pattern: `[ModInitializer("Initialize")]` attribute

  **Acceptance Criteria**:
  - [ ] `DamageTrackerMod.csproj` 파일 존재
  - [ ] `src/ModEntry.cs`에 `[ModInitializer]` 진입점 존재
  - [ ] `dotnet build` 성공
  - [ ] `.godot/mono/temp/bin/Debug/DamageTrackerMod.dll` 생성됨

  **QA Scenarios**:
  ```
  Scenario: Build verification
    Tool: Bash
    Steps: cd DamageTrackerMod && dotnet build
    Expected: Build succeeded, 0 errors
    Evidence: .sisyphus/evidence/task-1-1-build-output.txt
  ```

  **Commit**: YES | Message: `feat: initial project setup` | Files: [`DamageTrackerMod.csproj`, `src/ModEntry.cs`]

---

- [ ] 1.2. Damage Data Model

  **What to do**: 피해 추적을 위한 데이터 모델 정의.
  1. `DamageEvent` 구조체 정의:
     ```csharp
     public struct DamageEvent {
         public string Source;      // 카드명
         public string Target;      // 대상명
         public int Amount;         // 피해량
         public bool IsDealt;       // true=준 피해, false=받은 피해
         public long Timestamp;     // Unix timestamp
     }
     ```
  2. `PlayerDamageTracker` 클래스 정의:
     - `List<DamageEvent> Events` — 이벤트 리스트
     - `int TotalDealt` — 총 준 피해
     - `int TotalTaken` — 총 받은 피해
     - `Dictionary<string, int> DamageBySource` — 출처별 집계
  3. `DamageTrackerManager` 싱글톤 클래스:
     - `Dictionary<int, PlayerDamageTracker>` (player ID → tracker)
     - `RecordDamage(int playerId, DamageEvent evt)` 메서드
     - `ResetAll()` 메서드 (런 시작 시 호출)

  **Must NOT do**:
  - Mutable static fields (Godot scene 전환 시 리셋될 수 있음)
  - Network sync 없이 Dictionary 직접 수정 (co-op 불일치)

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 데이터 모델 정의만
  - Skills: [] — Reason: 기본 C# 작성
  - Omitted: [`frontend-ui-ux`] — Reason: UI 없음

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 1.3, 2.2 | Blocked By: 1.1

  **References**:
  - Pattern: Singleton pattern for manager
  - Pattern: Immutable struct for events
  - C#: `System.Collections.Generic.Dictionary<TKey, TValue>`

  **Acceptance Criteria**:
  - [ ] `src/Data/DamageEvent.cs` 파일 존재
  - [ ] `src/Data/PlayerDamageTracker.cs` 파일 존재
  - [ ] `src/Data/DamageTrackerManager.cs` 파일 존재
  - [ ] `dotnet build` 성공

  **QA Scenarios**:
  ```
  Scenario: Data model compilation
    Tool: Bash
    Steps: cd DamageTrackerMod && dotnet build
    Expected: Build succeeded, DamageEvent/PlayerDamageTracker/DamageTrackerManager found
    Evidence: .sisyphus/evidence/task-1-2-data-model.txt
  ```

  **Commit**: YES | Message: `feat: add damage data model` | Files: [`src/Data/*.cs`]

---

- [ ] 1.3. Damage Hook Implementation

  **What to do**: Phase 0.2에서 검증된 전략으로 damage hooking 구현.
  
  **Harmony 방식 (우선)**:
  1. `HarmonyLib` NuGet 패키지 추가
  2. `src/Hooks/DamageHook.cs` 작성:
     ```csharp
     [HarmonyPatch(typeof(DamageResolver), "ApplyDamage")]
     class DamageHook {
         static void Postfix(ref int amount, ref string source, ref string target) {
             // DamageTrackerManager에 기록
         }
     }
     ```
  3. `ModEntry.cs`에서 Harmony 인스턴스 생성 및 patch 적용
  
  **HP Polling Fallback**:
  1. `src/Hooks/HPPollingHook.cs` 작성:
     - `_Process(double delta)`에서 enemy HP 모니터링
     - 이전 HP와 비교하여 delta 계산
     - Damage event 생성 (source는 "Unknown")

  **Must NOT do**:
  - Main thread blocking (모든 작업은 비동기)
  - Hook 실패 시 게임 크래시 (try-catch 필수)

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 복잡한 hooking 로직 및 fallback
  - Skills: [] — Reason: 기본 C# 및 Harmony 지식
  - Omitted: [`frontend-ui-ux`] — Reason: UI 없음

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2.2, 3.1 | Blocked By: 0.2, 1.1, 1.2

  **References**:
  - Library: https://github.com/pardeike/Harmony
  - Pattern: `[HarmonyPatch]`, `[HarmonyPostfix]`, `[HarmonyPrefix]`
  - Phase 0 결과: `.sisyphus/research/hooking-validation.md`
  - Fallback: `Node._Process(double delta)` override

  **Acceptance Criteria**:
  - [ ] `src/Hooks/DamageHook.cs` 또는 `src/Hooks/HPPollingHook.cs` 존재
  - [ ] `ModEntry.cs`에서 hook 초기화 코드 존재
  - [ ] `dotnet build` 성공
  - [ ] 게임 로드 시 로그에 damage event 기록 확인

  **QA Scenarios**:
  ```
  Scenario: Hook integration verification
    Tool: Read
    Steps: Check ModEntry.cs contains Harmony patch initialization OR polling setup
    Expected: Contains "Harmony" OR "_Process" with damage tracking logic
    Evidence: .sisyphus/evidence/task-1-3-hook-integration.txt
  ```

  **Commit**: YES | Message: `feat: implement damage hooks` | Files: [`src/Hooks/*.cs`, `src/ModEntry.cs`]

---

## Wave 2: UI & Co-op

- [ ] 2.1. UI CanvasLayer Overlay

  **What to do**: 게임 UI 위에 렌더링되는 CanvasLayer overlay 생성.
  1. `src/UI/DamageTrackerOverlay.cs` 작성:
     ```csharp
     public partial class DamageTrackerOverlay : CanvasLayer {
         public override void _Ready() {
             Layer = 128;  // 게임 UI 위에 렌더링
             GuiEmbedAllWindows = true;  // Input passthrough 방지
         }
     }
     ```
  2. `ModEntry.cs`에서 overlay를 `GetTree().Root`에 추가:
     ```csharp
     var overlay = new DamageTrackerOverlay();
     GetTree().Root.AddChild(overlay);  // Scene root가 아님!
     ```
  3. Scene 전환 시에도 유지되는지 테스트

  **Must NOT do**:
  - Scene root에 parent (scene transition 시 destroy됨)
  - `ZIndex` 사용 (CanvasLayer에서 무시됨)
  - `Layer < 100` (게임 UI 아래에 렌더링됨)

  **Recommended Agent Profile**:
  - Category: `frontend-engineer` — Reason: Godot UI 작업
  - Skills: [] — Reason: 기본 Godot UI 지식
  - Omitted: [`git-master`] — Reason: UI 작업만

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 2.2, 2.5 | Blocked By: 1.1

  **References**:
  - Godot: `CanvasLayer` class, `Layer` property
  - Guardrail: Parent to `GetTree().Root`, NOT scene root
  - Guardrail: `GuiEmbedAllWindows = true`
  - Issue: Godot #85692 (scene transition destroys children)

  **Acceptance Criteria**:
  - [ ] `src/UI/DamageTrackerOverlay.cs` 파일 존재
  - [ ] `Layer = 128` 설정됨
  - [ ] `GuiEmbedAllWindows = true` 설정됨
  - [ ] `GetTree().Root.AddChild()` 사용됨
  - [ ] `dotnet build` 성공

  **QA Scenarios**:
  ```
  Scenario: Overlay structure verification
    Tool: Read
    Steps: Check DamageTrackerOverlay.cs for Layer=128, GuiEmbedAllWindows, GetTree().Root
    Expected: All three guardrails present
    Evidence: .sisyphus/evidence/task-2-1-overlay-structure.txt
  ```

  **Commit**: YES | Message: `feat: add canvas layer overlay` | Files: [`src/UI/DamageTrackerOverlay.cs`]

---

- [ ] 2.2. Damage Bar Component

  **What to do**: 미니멀 피해 바 UI 컴포넌트 생성.
  1. `src/UI/DamageBar.cs` 작성 (Control 상속):
     - 두 개의 Label: "준 피해: XXX" / "받은 피해: XXX"
     - 호버 시 Tooltip으로 출처별 분해 표시
     - 위치: 화면 상단 (AnchorTop = 0)
  2. `DamageTrackerManager`와 연결:
     - `_Process(double delta)`에서 데이터 업데이트
     - `TotalDealt`, `TotalTaken` 표시
  3. 싱글플레이용 기본 바 구현

  **Must NOT do**:
  - 매 프레임 새 Label 생성 (메모리 누수)
  - UI thread blocking

  **Recommended Agent Profile**:
  - Category: `frontend-engineer` — Reason: UI 컴포넌트 개발
  - Skills: [`frontend-ui-ux`] — Reason: 미니멀 디자인 필요
  - Omitted: [`git-master`] — Reason: UI 작업만

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 2.5 | Blocked By: 1.2, 2.1

  **References**:
  - Godot: `Control`, `Label`, `TooltipText`
  - Pattern: `_Process()` for UI updates
  - Design: Minimal bar style (user preference)

  **Acceptance Criteria**:
  - [ ] `src/UI/DamageBar.cs` 파일 존재
  - [ ] "준 피해" / "받은 피해" Label 존재
  - [ ] Tooltip 기능 구현됨
  - [ ] 화면 상단에 위치함 (AnchorTop = 0)
  - [ ] `dotnet build` 성공

  **QA Scenarios**:
  ```
  Scenario: Damage bar UI structure
    Tool: Read
    Steps: Check DamageBar.cs for Label components, TooltipText, AnchorTop
    Expected: Contains dealt/taken labels, tooltip setup, top anchor
    Evidence: .sisyphus/evidence/task-2-2-damage-bar-ui.txt
  ```

  **Commit**: YES | Message: `feat: add damage bar component` | Files: [`src/UI/DamageBar.cs`]

---

- [ ] 2.3. Co-op Player Tracking

  **What to do**: Co-op에서 각 플레이어의 피해를 개별적으로 추적.
  1. 플레이어 ID 감지 로직:
     - `Multiplayer.GetUniqueId()` — 본인 ID
     - `Multiplayer.GetPeers()` — 다른 플레이어 ID 목록
  2. `DamageTrackerManager`에 플레이어 등록/해제:
     - 플레이어 접속 시: `RegisterPlayer(int peerId)`
     - 플레이어 퇴장 시: `UnregisterPlayer(int peerId)`
  3. 각 플레이어별 `PlayerDamageTracker` 인스턴스 관리

  **Must NOT do**:
  - Disconnect 시 데이터 손실 (저장 후 해제)
  - Invalid peer ID로 데이터 기록

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 네트워크 로직
  - Skills: [] — Reason: 기본 Godot networking
  - Omitted: [`frontend-ui-ux`] — Reason: 데이터 로직만

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 2.4, 2.5 | Blocked By: 1.2

  **References**:
  - Godot: `MultiplayerApi`, `GetUniqueId()`, `GetPeers()`
  - Pattern: Dictionary<int, PlayerDamageTracker>
  - Event: 플레이어 접속/퇴장 시그널

  **Acceptance Criteria**:
  - [ ] `src/Network/PlayerTracking.cs` 파일 존재
  - [ ] `RegisterPlayer()`, `UnregisterPlayer()` 메서드 존재
  - [ ] `Multiplayer.GetUniqueId()`, `GetPeers()` 사용됨
  - [ ] `dotnet build` 성공

  **QA Scenarios**:
  ```
  Scenario: Player tracking structure
    Tool: Read
    Steps: Check PlayerTracking.cs for RegisterPlayer, UnregisterPlayer, Multiplayer API usage
    Expected: Contains all required methods and API calls
    Evidence: .sisyphus/evidence/task-2-3-player-tracking.txt
  ```

  **Commit**: YES | Message: `feat: add co-op player tracking` | Files: [`src/Network/PlayerTracking.cs`]

---

- [ ] 2.4. Co-op RPC Sync

  **What to do**: 피해 데이터를 서버-클라이언트 간 동기화.
  1. `src/Network/DamageSync.cs` 작성:
     ```csharp
     [Rpc(MultiplayerApi.RpcMode.AnyPeer, CallLocal = false)]
     public void SyncDamageEvent(int playerId, string source, int amount, bool isDealt) {
         // 서버에서 검증 후 모든 클라이언트에 브로드캐스트
     }
     ```
  2. Server-authoritative 패턴:
     - 클라이언트: 로컬 damage event → RPC로 서버에 전송
     - 서버: 검증 (amount 범위 체크) → 모든 클라이언트에 브로드캐스트
     - 클라이언트: 수신 후 로컬 UI 업데이트
  3. Anti-cheat: 서버에서 amount 범위 검증 (0 < amount < 500)

  **Must NOT do**:
  - 클라이언트에서 직접 다른 플레이어 데이터 수정
  - Unreliable RPC로 중요 데이터 전송 (순서 보장 안됨)
  - 무한 루프 (RPC → Sync → RPC ...)

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 복잡한 네트워크 동기화
  - Skills: [] — Reason: Godot RPC 지식
  - Omitted: [`frontend-ui-ux`] — Reason: 네트워크 로직만

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 2.5 | Blocked By: 1.3, 2.3

  **References**:
  - Godot: `[Rpc]` attribute, `MultiplayerApi.RpcMode`
  - Pattern: Server-authoritative validation
  - Guardrail: Validate amount range (anti-cheat)
  - External: https://docs.godotengine.org/en/4.5/tutorials/networking/high_level_multiplayer.html

  **Acceptance Criteria**:
  - [ ] `src/Network/DamageSync.cs` 파일 존재
  - [ ] `[Rpc]` attribute 사용됨
  - [ ] Server validation 로직 존재 (amount 범위 체크)
  - [ ] Broadcast to all clients 로직 존재
  - [ ] `dotnet build` 성공

  **QA Scenarios**:
  ```
  Scenario: RPC sync structure
    Tool: Read
    Steps: Check DamageSync.cs for Rpc attribute, server validation, broadcast logic
    Expected: Contains [Rpc], amount validation (0-500), RpcId(1) or similar broadcast
    Evidence: .sisyphus/evidence/task-2-4-rpc-sync.txt
  ```

  **Commit**: YES | Message: `feat: add co-op rpc sync` | Files: [`src/Network/DamageSync.cs`]

---

- [ ] 2.5. Multi-Player UI Display

  **What to do**: Co-op에서 모든 플레이어의 피해를 개별 바로 표시.
  1. `src/UI/MultiPlayerDamageDisplay.cs` 작성:
     - 플레이어별 `DamageBar` 인스턴스 동적 생성
     - HBoxContainer로 가로 배치
     - 플레이어 접속/퇴장 시 바 추가/제거
  2. 각 플레이어 체력바 근처에 위치 (또는 상단 일괄 표시)
  3. 본인 바는 하이라이트 (다른 색상 또는 테두리)

  **Must NOT do**:
  - 4명 이상 시 UI overflow (스크롤 또는 래핑 처리)
  - 매 프레임 UI 재생성

  **Recommended Agent Profile**:
  - Category: `frontend-engineer` — Reason: 동적 UI 레이아웃
  - Skills: [`frontend-ui-ux`] — Reason: 멀티플레이어 UI 디자인
  - Omitted: [`git-master`] — Reason: UI 작업만

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: - | Blocked By: 2.2, 2.4

  **References**:
  - Godot: `HBoxContainer`, dynamic node creation
  - Pattern: Player join/leave event handling
  - Design: Individual bars per player (user preference)

  **Acceptance Criteria**:
  - [ ] `src/UI/MultiPlayerDamageDisplay.cs` 파일 존재
  - [ ] HBoxContainer 사용됨
  - [ ] 플레이어별 DamageBar 동적 생성 로직 존재
  - [ ] 본인 바 하이라이트 로직 존재
  - [ ] `dotnet build` 성공

  **QA Scenarios**:
  ```
  Scenario: Multi-player UI structure
    Tool: Read
    Steps: Check MultiPlayerDamageDisplay.cs for HBoxContainer, dynamic bar creation, self-highlight
    Expected: Contains HBoxContainer, AddChild for bars, highlight logic
    Evidence: .sisyphus/evidence/task-2-5-multiplayer-ui.txt
  ```

  **Commit**: YES | Message: `feat: add multi-player damage display` | Files: [`src/UI/MultiPlayerDamageDisplay.cs`]

---

## Wave 3: Persistence & Packaging

- [ ] 3.1. JSON Persistence

  **What to do**: 피해 기록을 JSON 파일로 저장.
  1. `src/Data/DamagePersistence.cs` 작성:
     - 저장 경로: `user://mods/DamageTracker/runs/{timestamp}.json`
     - Atomic write: `.tmp` 파일에 쓰기 → `OS.RenameAbsolute()`로 rename
  2. 저장 데이터 구조:
     ```json
     {
       "runId": "20260307-123456",
       "startTime": 1709808296,
       "endTime": 1709812345,
       "players": {
         "1": { "totalDealt": 1234, "totalTaken": 567, "events": [...] },
         "2": { "totalDealt": 2345, "totalTaken": 890, "events": [...] }
       }
     }
     ```
  3. 런 종료 시 자동 저장

  **Must NOT do**:
  - Non-atomic writes (크래시 시 데이터 손실)
  - Main thread blocking I/O

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 파일 I/O 로직
  - Skills: [] — Reason: 기본 파일 작업
  - Omitted: [`frontend-ui-ux`] — Reason: 데이터 로직만

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 3.2 | Blocked By: 1.2

  **References**:
  - Godot: `FileAccess.Open()`, `OS.RenameAbsolute()`
  - Pattern: Atomic write (.tmp → rename)
  - Path: `user://mods/DamageTracker/`

  **Acceptance Criteria**:
  - [ ] `src/Data/DamagePersistence.cs` 파일 존재
  - [ ] Atomic write 로직 존재 (.tmp → rename)
  - [ ] JSON serialization 구현됨
  - [ ] `user://mods/DamageTracker/` 경로 사용됨
  - [ ] `dotnet build` 성공

  **QA Scenarios**:
  ```
  Scenario: Persistence structure
    Tool: Read
    Steps: Check DamagePersistence.cs for atomic write, JSON serialization, user:// path
    Expected: Contains .tmp write, OS.RenameAbsolute, JSON serialization
    Evidence: .sisyphus/evidence/task-3-1-persistence.txt
  ```

  **Commit**: YES | Message: `feat: add json persistence` | Files: [`src/Data/DamagePersistence.cs`]

---

- [ ] 3.2. Run History Integration

  **What to do**: 런 시작/종료 시 히스토리 관리.
  1. 런 시작 시:
     - 새 `runId` 생성
     - `DamageTrackerManager.ResetAll()` 호출
     - 시작 시간 기록
  2. 런 종료 시:
     - 종료 시간 기록
     - `DamagePersistence.Save()` 호출
     - 로그: "Run saved: {runId}"
  3. 이전 런 히스토리 조회 기능 (선택적)

  **Must NOT do**:
  - 런 중간에 데이터 리셋
  - 저장 실패 시 무시 (재시도 또는 로그)

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 런타임 이벤트 연결
  - Skills: [] — Reason: 기본 로직
  - Omitted: [`frontend-ui-ux`] — Reason: 데이터 로직만

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: - | Blocked By: 3.1

  **References**:
  - Hook: Combat start/end events
  - Pattern: Run ID generation (timestamp-based)
  - Integration: DamageTrackerManager + DamagePersistence

  **Acceptance Criteria**:
  - [ ] 런 시작 시 ResetAll() 호출됨
  - [ ] 런 종료 시 Save() 호출됨
  - [ ] Run ID 생성 로직 존재
  - [ ] `dotnet build` 성공

  **QA Scenarios**:
  ```
  Scenario: Run history integration
    Tool: Read
    Steps: Check ModEntry.cs or relevant file for run start/end hooks
    Expected: Contains ResetAll() call on start, Save() call on end
    Evidence: .sisyphus/evidence/task-3-2-run-history.txt
  ```

  **Commit**: YES | Message: `feat: integrate run history` | Files: [`src/ModEntry.cs`, `src/Data/*.cs`]

---

- [ ] 3.3. mod_manifest.json

  **What to do**: 모드 메타데이터 파일 생성.
  ```json
  {
    "pck_name": "DamageTracker",
    "name": "Damage Tracker",
    "author": "YourName",
    "description": "Real-time damage tracking overlay for single-player and co-op. Shows dealt/taken damage with card sources.",
    "version": "1.0.0",
    "min_game_version": "0.1.0"
  }
  ```
  2. Preview 이미지 준비 (선택적):
     - `assets/mod_image.png` (512x512 권장)
  3. Manifest를 PCK에 포함하도록 export_presets.cfg 설정

  **Must NOT do**:
  - 필수 필드 누락 (name, version, author)
  - 잘못된 JSON 포맷

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: JSON 파일 생성
  - Skills: [] — Reason: 기본 작업
  - Omitted: [`frontend-ui-ux`, `git-master`] — Reason: 메타데이터만

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 3.4 | Blocked By: -

  **References**:
  - Format: JSON with pck_name, name, author, description, version
  - Export: Include in Godot PCK export

  **Acceptance Criteria**:
  - [ ] `assets/mod_manifest.json` 파일 존재
  - [ ] 모든 필수 필드 포함됨
  - [ ] Valid JSON 포맷
  - [ ] PCK export 설정에 포함됨

  **QA Scenarios**:
  ```
  Scenario: Manifest validation
    Tool: Bash
    Steps: cat DamageTrackerMod/assets/mod_manifest.json && python3 -m json.tool
    Expected: Valid JSON with name, version, author, description fields
    Evidence: .sisyphus/evidence/task-3-3-manifest.txt
  ```

  **Commit**: YES | Message: `feat: add mod manifest` | Files: [`assets/mod_manifest.json`]

---

- [ ] 3.4. Build & Package

  **What to do**: 최종 빌드 및 패키징.
  1. .dll 빌드:
     ```bash
     cd DamageTrackerMod
     dotnet build -c Release
     ```
  2. .pck 익스포트:
     - Godot Editor → Export → PCK
     - Resources: mod_manifest.json (+ mod_image.png if exists)
  3. 배포 폴더 구조:
     ```
     dist/DamageTracker/
     ├── DamageTracker.dll
     ├── DamageTracker.pck
     └── mod_manifest.json
     ```
  4. 로컬 테스트:
     - `mods/DamageTracker/`에 복사
     - 게임 실행 → 모드 로드 확인

  **Must NOT do**:
  - Debug 빌드 배포 (Release 필수)
  - .pdb 파일 포함 (불필요)

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 빌드 스크립트 실행
  - Skills: [] — Reason: 기본 빌드 작업
  - Omitted: [`frontend-ui-ux`] — Reason: 빌드만

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 3.5 | Blocked By: 1.3, 2.5, 3.1, 3.3

  **References**:
  - Build: `dotnet build -c Release`
  - Export: Godot PCK export
  - Deploy: `mods/DamageTracker/`

  **Acceptance Criteria**:
  - [ ] `dist/DamageTracker/DamageTracker.dll` 존재
  - [ ] `dist/DamageTracker/DamageTracker.pck` 존재
  - [ ] `dist/DamageTracker/mod_manifest.json` 존재
  - [ ] 게임에서 모드 로드 성공

  **QA Scenarios**:
  ```
  Scenario: Build output verification
    Tool: Bash
    Steps: ls -la dist/DamageTracker/
    Expected: DamageTracker.dll, DamageTracker.pck, mod_manifest.json all present
    Evidence: .sisyphus/evidence/task-3-4-build-output.txt
  ```

  **Commit**: YES | Message: `build: package for distribution` | Files: [`dist/`]

---

- [ ] 3.5. Steam Workshop Prep

  **What to do**: Steam Workshop 업로드 준비.
  
  **NOTE**: STS2 Early Access (Mar 2026)에는 Steam Workshop 미지원. 수동 설치 안내서 준비.
  
  1. README.md 작성:
     - 설치 방법 (수동)
     - 기능 설명
     - 스크린샷
     - 알려진 문제
  2. Steam Workshop 지원 시 대비:
     - preview 이미지 준비 (512x512)
     - 태그 준비: "Gameplay", "UI", "Co-op"
  3. GitHub Release 생성:
     - v1.0.0 태그
     - .dll + .pck + manifest 첨부

  **Must NOT do**:
  - Steam Workshop 미지원 상태에서 업로드 시도
  - 불완전한 문서 배포

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: 문서 작성
  - Skills: [] — Reason: 기본 문서 작성
  - Omitted: [`frontend-ui-ux`, `git-master`] — Reason: 문서만

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: - | Blocked By: 3.4

  **References**:
  - Format: Markdown README
  - Platform: GitHub Releases
  - Future: Steam Workshop (TBD by Mega Crit)

  **Acceptance Criteria**:
  - [ ] `README.md` 존재
  - [ ] 설치 방법 포함됨
  - [ ] 기능 설명 포함됨
  - [ ] 스크린샷 최소 1장 포함됨
  - [ ] GitHub Release 생성됨

  **QA Scenarios**:
  ```
  Scenario: README completeness
    Tool: Read
    Steps: Read README.md, check for installation, features, screenshot sections
    Expected: Contains installation instructions, feature list, screenshot reference
    Evidence: .sisyphus/evidence/task-3-5-readme.txt
  ```

  **Commit**: YES | Message: `docs: add readme and release prep` | Files: [`README.md`]

---

## Final Verification Wave (4 parallel agents, ALL must APPROVE)

- [ ] F1. Plan Compliance Audit
  **Agent**: oracle
  **Check**: 모든 태스크가 요구사항(미니멀 바, 카드명만, Co-op 전체 표시, 상단 위치, 런 전체+영구 저장, 개별 바)을 충족하는지 검증.

- [ ] F2. Code Quality Review
  **Agent**: unspecified-high
  **Check**: Godot/C# 코드 품질, guardrails 준수 (GetTree().Root parent, Layer >= 128, atomic writes).

- [ ] F3. Real Manual QA
  **Agent**: unspecified-high
  **Check**: 게임 내 실제 테스트 — 싱글플레이 피해 바 표시, Co-op 멀티플레이어 표시, JSON 저장 확인.

- [ ] F4. Scope Fidelity Check
  **Agent**: deep
  **Check**: 범위 이탈 없음 확인 — damage prediction, replay system 등 EXCLUDE 항목 미포함.

## Commit Strategy
```
feat: initial project setup
feat: add damage data model
feat: implement damage hooks
feat: add canvas layer overlay
feat: add damage bar component
feat: add co-op player tracking
feat: add co-op rpc sync
feat: add multi-player damage display
feat: add json persistence
feat: integrate run history
feat: add mod manifest
build: package for distribution
docs: add readme and release prep
```

## Success Criteria
1. **Build Success**: `dotnet build -c Release` → 0 errors
2. **Load Success**: 게임 실행 시 "Damage Tracker loaded!" 로그 확인
3. **Single-Player**: 피해 바 표시, 준/받은 피해 정확히 추적
4. **Co-op**: 모든 플레이어 피해 개별 바로 표시, 서버 검증 동작
5. **Persistence**: 런 종료 시 JSON 파일 생성, `user://mods/DamageTracker/runs/`에 저장
6. **Distribution**: `.dll` + `.pck` + `mod_manifest.json` 패키지 완료
7. **Documentation**: README.md에 설치 방법, 기능 설명, 스크린샷 포함
