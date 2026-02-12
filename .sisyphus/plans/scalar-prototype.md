# SCALAR — 확률 조작 턴제 로그라이트 카드 게임 프로토타입

## TL;DR

> **Quick Summary**: 확률 조작(PP) 메카닉이 턴제 카드 전투에서 재미있는지 검증하는 Unity 프로토타입. 플레이스홀더 아트, 15~20장 카드, 3종 적, 미니 노드맵(3~5개), 크리스탈 동행, 탐지 시스템 포함.
> 
> **Deliverables**:
> - Unity 프로젝트 (C#, 2D)
> - 카드 전투 코어 루프 (AP + 카드 + 적 행동 공개)
> - 확률 조작 시스템 (PP → 카드 보너스 확률 ↑, 적 행동 확률 조작, 드로우 확률 조작)
> - 크리스탈 동행 시스템 (별도 HP, 전용 카드, 경유 카드)
> - 탐지 시스템 (PP 사용 → 단계 상승 → 페널티)
> - 미니 노드맵 (3~5 노드, PP로 노드 확률 조작)
> - 적 3종 (일반 2 + 추적자 1)
> - 플레이 가능한 1런 (시작 → 노드 탐색 → 탈출)
> 
> **Estimated Effort**: Medium (4~6주 솔로)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 7 → Task 8

---

## Context

### Original Request
확률 조작 턴제 로그라이트 카드 게임 "SCALAR"의 프로토타입. 핵심 메카닉인 확률 조작(PP)이 재미있는지 검증하는 것이 목표.

### Interview Summary
**핵심 결정사항**:
- 세계관: 모든 사람의 행동 확률을 구할 수 있는 세상, 유일하게 예측 불가능한 도망자 스칼라
- 스칼라: 확률 조작 능력 보유, 우주정거장에 은신, AI 크리스탈과 동행
- 카드 시스템: 기본 효과 100% 확정 + 보너스 효과에 확률 (PP로 부스트)
- 적 행동: 확률로 공개 ("공격 70% / 방어 30%"), PP로 조작 가능
- 탐지: PP 사용 시 상승, 4단계 (안전→주의→경계→추적)
- 노드맵: 슬레이 더 스파이어 방식, 프로토에선 3~5개
- 그리드 없음, 순수 카드 전투
- Unity C#, PC, 솔로 개발, 프로토는 플레이스홀더 아트

### Metis Review
**Identified Gaps** (addressed):
- 카드 실패 UX → 해결: 기본 효과 확정, 보너스만 확률
- 스코프 폭주 위험 → 해결: 프로토타입으로 축소
- 수치 밸런스 미정 → 이 플랜에서 구체 수치 정의
- Crystal 역할 과부하 → 프로토에서 최소 기능만 검증
- 키워드 기계적 정의 누락 → 프로토에서 3~4개만 정의 후 검증

---

## Work Objectives

### Core Objective
PP(확률 조작) 시스템이 턴제 카드 전투에서 의미 있는 전략적 의사결정을 만들어내는지 검증한다.

### 프로토타입이 검증해야 하는 4가지 질문
1. PP를 카드 보너스 효과에 투자하는 게 재미있는가?
2. PP를 적 행동 확률 조작에 쓰는 게 재미있는가?
3. 1과 2 사이에서 PP를 분배하는 의사결정이 전략적인가?
4. 탐지 리스크가 PP 남용을 충분히 억제하면서도 답답하지 않은가?

### Concrete Deliverables
- 플레이 가능한 Unity 빌드 (PC standalone)
- 1런 완주 가능 (시작 → 3~5노드 → 탈출)
- 15~20장 카드 (스칼라 10~13 + 크리스탈 5~7)
- 적 3종 (일반 2 + 추적자 1)
- PP 시스템 작동
- 탐지 4단계 작동
- 크리스탈 동행 작동

### Definition of Done
- [ ] 빌드 성공: `Unity -batchmode -buildTarget StandaloneWindows64` 에러 없음
- [ ] 1런 완주 가능 (시작 → 노드 선택 → 전투 → 탈출 도달)
- [ ] PP를 전혀 안 써도 전투 승리 가능 (기본 효과만으로)
- [ ] PP를 쓰면 확실히 유리함 (보너스 발동률 체감)
- [ ] PP 남용 시 탐지 상승으로 후반 불리해짐 (체감)
- [ ] 크리스탈 쓰러져도 전투 계속 가능 (크리스탈 경유 카드만 사용 불가)

### Must Have
- 카드 기본 효과는 100% 확정 발동
- 카드 보너스 효과는 확률 기반, PP로 부스트 가능
- 적 행동이 확률과 함께 사전 공개
- PP로 적 행동 확률 조작 가능
- PP 사용 시 탐지 단계 상승
- 크리스탈이 별도 HP를 가진 동행 유닛

### Must NOT Have (Guardrails)
- ❌ 메타 진행 / 정거장 업그레이드 — 프로토에 불필요
- ❌ 스토리 / 대화 / 데이터 조각 — 프로토에 불필요
- ❌ 카드 레어리티 시스템 — 프로토에선 전부 동등
- ❌ 세이브/로드 — 런이 짧아서 불필요
- ❌ 음악/사운드 — 프로토에 불필요
- ❌ 카드 애니메이션 (단순 트윈 외) — 시간 낭비
- ❌ AI 생성 아트 파이프라인 — 프로토는 도형+텍스트
- ❌ Steam 연동 — 프로토에 불필요
- ❌ 6개 키워드 전부 구현 — 프로토에서 3~4개만
- ❌ 100~150장 카드 — 15~20장만
- ❌ 이벤트 노드 내용 — 프로토에선 전투 노드만으로 충분
- ❌ 상점/은신처 노드 — 프로토에선 전투+보상만
- ❌ 난이도 스케일링 — 고정 밸런스
- ❌ 덱 편집/사전 준비 — 고정 시작 덱

---

## 수치 정의 (프로토타입 밸런스 기준)

### 전투 기본 수치
| 항목 | 값 | 비고 |
|------|-----|------|
| 스칼라 HP | 80 | |
| 크리스탈 HP | 40 | 스칼라의 절반 |
| 턴당 AP | 3 | 카드 코스트 1~3 |
| 턴당 PP 회복 | 2 | 최대 PP 보유: 5 |
| 턴당 드로우 | 5장 | 핸드 최대 10장 |
| 시작 덱 | 12장 | 스칼라 8 + 크리스탈 4 |
| 크리스탈 현장 복구 비용 | AP 2 | 전투 중 1회 제한 |

### PP 소모 기준
| 행동 | PP 비용 | 효과 |
|------|---------|------|
| 카드 보너스 확률 +20% | 1 PP | 최대 100%까지 |
| 적 행동 확률 ±15% | 1 PP | 한 행동을 밀거나 당기기 |
| 적 행동 완전 봉쇄 (0%로) | 3 PP | 고비용 강력 옵션 |
| 드로우 확률 조작 (원하는 카드) | 2 PP | 다음 드로우에 특정 카드 확률 +40% |
| 노드맵 확률 조작 | 1 PP | 노드 내용 변경 확률 |

### 탐지 단계
| 단계 | 누적 PP 사용량 | 효과 |
|------|----------------|------|
| 1. 안전 | 0~4 | 없음 |
| 2. 주의 | 5~9 | 전투마다 적 +1 추가 |
| 3. 경계 | 10~14 | 적 +1 추가, 적 행동 확률 중 공격 비중 +10% |
| 4. 추적 | 15+ | 적 +2 추가, 공격 비중 +20%, 추적자 추가 출현 |

### 적 기본 수치
| 적 | HP | 행동 패턴 | 비고 |
|----|-----|-----------|------|
| 경비병 | 25 | 공격 12 (60%) / 방어 +8 (40%) | 기본 적 |
| 드론 | 15 | 공격 8 (80%) / 자폭 20 (20%) | 낮은 HP, 자폭 위험 |
| 탐지자(추적자) | 50 | 공격 15 (50%) / 스캔 (30%) / 방어 +12 (20%) | 스캔 = 탐지 +2 강제 |

### 카드 목록 (프로토타입 15장)

**스칼라 카드 (10장):**

| 카드명 | AP | 기본 효과 | 보너스 (확률) | 키워드 |
|--------|-----|-----------|--------------|--------|
| 타격 | 1 | 데미지 8 | 추가 데미지 4 (40%) | — |
| 강타 | 2 | 데미지 14 | 방어 무시 (35%) | 과부하 |
| 수렴탄 | 1 | 데미지 6 | 같은 적 재타격 시 +4 (50%) | 수렴 |
| 방어 | 1 | 실드 7 | 다음 턴 실드 유지 (30%) | — |
| 과부하 사격 | 2 | 데미지 10 | 전체 적 데미지 5 (45%) | 과부하 |
| 은밀 이동 | 1 | 실드 5 | 다음 카드 AP -1 (40%) | 은밀 |
| 정밀 조준 | 2 | 데미지 12 | 보너스 확률 +30% 고정 부여 (50%) | 수렴 |
| 긴급 회피 | 0 | 실드 3 | — | 은밀 |
| 확률 왜곡 | 1 | PP +1 회복 | 추가 PP +1 (35%) | 과부하 |
| 전술 분석 | 1 | 다음 턴 드로우 +2 | 드로우한 카드 보너스 확률 +15% (45%) | — |

**크리스탈 카드 (5장):**

| 카드명 | AP | 기본 효과 | 보너스 (확률) | 키워드 |
|--------|-----|-----------|--------------|--------|
| 연산 스캔 | 1 | 적 1기 보너스 정보 공개 | 전체 적 정보 공개 (40%) | 연산 |
| 연산 실드 | 1 | 크리스탈 실드 8 | PP +1 회복 (50%) | 연산 |
| 링크 어택 | 2 | 데미지 10 + 스칼라 실드 5 | 탐지 -1 (35%) | 링크 |
| 데이터 복구 | 1 | 스칼라 HP 회복 6 | 크리스탈 HP 회복 4 (45%) | — |
| 링크 배리어 | 1 | 스칼라+크리스탈 실드 4씩 | 다음 적 공격 확률 -15% (40%) | 링크 |

### 프로토타입 키워드 정의 (4개)
| 키워드 | 기계적 효과 |
|--------|-------------|
| **과부하(Overload)** | 사용 시 탐지 +1. 같은 턴에 과부하 카드 2장 이상 사용 시 모든 과부하 카드 기본 데미지 +3 |
| **수렴(Converge)** | 같은 적에게 수렴 카드를 연속 사용 시 2번째부터 기본 데미지 +4 (누적) |
| **은밀(Stealth)** | 사용 시 탐지 변화 없음. 해당 턴에 은밀 카드만 사용하면 탐지 -1 |
| **연산(Compute)** | 크리스탈 전용. 사용할 때마다 해당 전투 내 "연산 스택" +1. 연산 스택이 높을수록 적 정보 상세도 증가 (스택 3 이상: 적 다음 턴 행동도 미리 공개) |
| **링크(Link)** | 직전 카드가 스칼라 카드였을 때 링크 카드를 쓰면 (또는 반대) AP 1 환불 |

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> 모든 검증은 에이전트가 직접 수행. 사람이 직접 하는 검증 없음.

### Test Decision
- **Infrastructure exists**: NO (신규 프로젝트)
- **Automated tests**: YES (Tests-after)
- **Framework**: Unity Test Framework (EditMode + PlayMode)

### 테스트 대상 핵심 시스템
- 확률 계산 로직 (PP 투자 → 확률 변화 정확성)
- 탐지 누적 로직 (PP 사용량 → 단계 전이)
- 카드 효과 해석 (기본 효과 + 보너스 판정)
- 전투 승리/패배 판정
- 크리스탈 HP 0 시 경유 카드 사용 불가

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Unity 프로젝트 셋업 + 아키텍처
└── Task 2: 카드 데이터 시스템 (ScriptableObject)

Wave 2 (After Wave 1):
├── Task 3: 전투 코어 루프 (AP, 턴, 승패)
├── Task 4: 확률 조작(PP) 시스템
└── Task 5: 적 시스템 (행동 공개 + 확률 표시)

Wave 3 (After Wave 2):
├── Task 6: 크리스탈 동행 시스템
└── Task 7: 탐지 시스템

Wave 4 (After Wave 3):
└── Task 8: 미니 노드맵

Wave 5 (After Wave 4):
└── Task 9: 통합 + 밸런스 + 플레이테스트
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4, 5, 6, 7, 8 | — |
| 2 | 1 | 3, 5, 6 | — |
| 3 | 1, 2 | 4, 5, 6, 7, 8, 9 | — |
| 4 | 3 | 9 | 5 |
| 5 | 2, 3 | 6, 7, 9 | 4 |
| 6 | 2, 3, 5 | 9 | 7 |
| 7 | 3, 4 | 9 | 6 |
| 8 | 3 | 9 | 6, 7 |
| 9 | 4, 5, 6, 7, 8 | None | — |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 → 2 | Sequential, category="unspecified-high" |
| 2 | 3, then 4+5 parallel | 3 sequential, then 4+5 parallel |
| 3 | 6+7 parallel | Both category="unspecified-high" |
| 4 | 8 | category="unspecified-high" |
| 5 | 9 | category="deep", playwright for QA |

---

## TODOs

- [ ] 1. Unity 프로젝트 셋업 + 핵심 아키텍처

  **What to do**:
  - Unity 2D 프로젝트 생성 (별도 디렉토리: `scalar-prototype/`)
  - 폴더 구조 생성:
    ```
    Assets/
    ├── Scripts/
    │   ├── Core/          # GameManager, StateMachine, EventBus
    │   ├── Cards/         # CardData, CardEffect, DeckManager, HandManager
    │   ├── Combat/        # CombatManager, TurnManager, APSystem
    │   ├── Probability/   # PPSystem, ProbabilityResolver, DetectionMeter
    │   ├── Enemies/       # EnemyData, EnemyAI, IntentDisplay
    │   ├── Crystal/       # CrystalCompanion, CrystalCardHandler
    │   ├── Map/           # NodeMap, NodeData, MapGenerator
    │   └── UI/            # All UI scripts
    ├── ScriptableObjects/
    │   ├── Cards/
    │   └── Enemies/
    ├── Prefabs/
    ├── Scenes/
    │   ├── MainMenu.unity
    │   ├── Map.unity
    │   └── Combat.unity
    └── Tests/
        ├── EditMode/
        └── PlayMode/
    ```
  - 게임 상태 머신 구현 (MainMenu → Map → Combat → Victory/Defeat)
  - EventBus (이벤트 기반 통신) 구현
  - 게임 로직과 프레젠테이션 분리 (MVC 또는 유사 패턴)

  **Must NOT do**:
  - 씬 전환 애니메이션
  - 로딩 화면
  - 세이브/로드 시스템
  - 설정 메뉴

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Unity 프로젝트 초기 설정 + 아키텍처는 도메인 특화된 카테고리가 없으나 중요도 높음
  - **Skills**: []
    - Unity C# 작업이라 기존 스킬과 도메인 겹침 없음
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: 웹 프론트엔드 전용, Unity UI와 무관

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (단독)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - 이 프로젝트는 신규 생성이므로 기존 코드 패턴 없음

  **External References**:
  - Unity 공식 2D 프로젝트 가이드: https://docs.unity3d.com/Manual/Unity2D.html
  - Unity ScriptableObject 패턴: https://docs.unity3d.com/Manual/class-ScriptableObject.html
  - Unity Test Framework: https://docs.unity3d.com/Packages/com.unity.test-framework@1.1/manual/index.html
  - Slay the Spire 아키텍처 분석 (커뮤니티): 상태 머신 + 이벤트 버스 패턴이 업계 표준

  **WHY Each Reference Matters**:
  - Unity 2D 가이드: 프로젝트 초기 설정 시 올바른 2D 파이프라인 선택 확인
  - ScriptableObject 패턴: 카드/적 데이터를 에디터에서 관리 가능하게 하는 핵심 패턴
  - Test Framework: EditMode 테스트 셋업 방법 확인

  **Acceptance Criteria**:

  - [ ] Unity 프로젝트가 에러 없이 열림
  - [ ] 폴더 구조가 위 명세대로 존재
  - [ ] GameStateMachine이 MainMenu → Map → Combat → Victory/Defeat 전이를 처리
  - [ ] EventBus로 OnCombatStart, OnCombatEnd, OnTurnStart, OnTurnEnd 이벤트 발행/구독 가능
  - [ ] 씬 3개 (MainMenu, Map, Combat) 존재, 전환 동작

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Unity 프로젝트 빌드 성공
    Tool: Bash
    Preconditions: Unity 설치됨, 프로젝트 생성 완료
    Steps:
      1. Unity -batchmode -projectPath ./scalar-prototype -buildTarget StandaloneWindows64 -quit -logFile build.log
      2. Assert: exit code 0
      3. Assert: build.log에 "Build succeeded" 포함
    Expected Result: 빌드 성공
    Evidence: build.log

  Scenario: 상태 머신 전이 테스트
    Tool: Bash (Unity EditMode Test)
    Preconditions: 테스트 프레임워크 설치됨
    Steps:
      1. Unity -batchmode -runTests -testPlatform EditMode -projectPath ./scalar-prototype -testResults results.xml
      2. Assert: GameStateMachine_Transitions_MainMenuToMap 테스트 PASS
      3. Assert: GameStateMachine_Transitions_MapToCombat 테스트 PASS
      4. Assert: GameStateMachine_Transitions_CombatToVictory 테스트 PASS
    Expected Result: 모든 상태 전이 테스트 통과
    Evidence: results.xml
  ```

  **Commit**: YES
  - Message: `feat(scalar): initialize Unity project with core architecture`
  - Files: `scalar-prototype/` 전체
  - Pre-commit: Unity 빌드 성공 확인

---

- [ ] 2. 카드 데이터 시스템

  **What to do**:
  - `CardData` ScriptableObject 정의:
    ```csharp
    [CreateAssetMenu]
    public class CardData : ScriptableObject {
        public string cardName;
        public int apCost;
        public CardOwner owner; // Scalar, Crystal, Shared
        public Keyword keyword; // None, Overload, Converge, Stealth, Compute, Link
        // 기본 효과 (100% 확정)
        public CardEffectType baseEffectType; // Damage, Shield, Heal, DrawCards, GainPP, etc.
        public int baseEffectValue;
        public CardTarget baseTarget; // SingleEnemy, AllEnemies, Self, Crystal, Both
        // 보너스 효과 (확률)
        public CardEffectType bonusEffectType;
        public int bonusEffectValue;
        public float bonusProbability; // 0.0 ~ 1.0
        public CardTarget bonusTarget;
        public string description;
    }
    ```
  - `CardEffectType` enum 정의 (Damage, Shield, Heal, DrawCards, GainPP, ReduceDetection, APRefund, ProbabilityBoost 등)
  - `CardTarget` enum 정의 (SingleEnemy, AllEnemies, Self, Crystal, ScalarAndCrystal)
  - `CardOwner` enum 정의 (Scalar, Crystal)
  - `Keyword` enum 정의 (None, Overload, Converge, Stealth, Compute, Link)
  - 프로토타입 15장 카드를 ScriptableObject 에셋으로 생성 (위 카드 목록 참조)
  - `DeckManager`: 덱 셔플, 드로우, 버리기, 리셔플 로직
  - `HandManager`: 핸드에 카드 추가/제거, 핸드 크기 제한 (10장)
  - `CardEffectResolver`: 기본 효과 즉시 적용 + 보너스 효과 확률 판정 로직

  **Must NOT do**:
  - 카드 비주얼/애니메이션 (UI는 Task 3에서)
  - 카드 업그레이드 시스템
  - 카드 레어리티

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 데이터 모델링 + 게임 로직 구현. 복잡도 높음
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 1 이후 바로 필요)
  - **Parallel Group**: Wave 1 (Task 1 직후)
  - **Blocks**: Tasks 3, 5, 6
  - **Blocked By**: Task 1

  **References**:

  **External References**:
  - Unity ScriptableObject 패턴: https://docs.unity3d.com/Manual/class-ScriptableObject.html
  - 이 플랜의 "카드 목록" 섹션: 15장 카드의 정확한 수치와 키워드

  **WHY Each Reference Matters**:
  - ScriptableObject는 카드 데이터를 Unity 에디터에서 직접 편집 가능하게 하는 핵심. JSON 대신 이걸 쓰는 이유는 에디터 통합 + 참조 안전성
  - 카드 목록 섹션: 각 카드의 AP, 기본 효과, 보너스, 확률, 키워드가 정확히 정의되어 있으므로 그대로 에셋으로 옮기면 됨

  **Acceptance Criteria**:

  - [ ] CardData ScriptableObject에 15장 카드 에셋 존재
  - [ ] 각 카드 에셋의 값이 카드 목록 표와 일치
  - [ ] DeckManager: 12장 시작 덱 셔플 후 5장 드로우 → 핸드에 5장
  - [ ] DeckManager: 드로우 파일이 빈 덱에서 시도 시 버린 카드 리셔플 후 드로우
  - [ ] HandManager: 핸드 10장 초과 시 추가 드로우 불가
  - [ ] CardEffectResolver: 기본 효과는 항상 적용됨 (100회 실행 시 100회 적용)
  - [ ] CardEffectResolver: 보너스 확률 40% 카드를 1000회 판정 시 340~460회 사이 (표준편차 3σ 이내)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 카드 데이터 무결성 검증
    Tool: Bash (Unity EditMode Test)
    Preconditions: 15장 카드 에셋 생성 완료
    Steps:
      1. 테스트: 모든 CardData 에셋 로드 → Assert count == 15
      2. 테스트: 각 카드의 apCost >= 0 && apCost <= 3
      3. 테스트: 각 카드의 bonusProbability >= 0 && <= 1.0
      4. 테스트: 스칼라 카드 10장, 크리스탈 카드 5장 확인
    Expected Result: 데이터 무결성 테스트 전체 통과
    Evidence: EditMode test results.xml

  Scenario: 덱 셔플 + 드로우 로직 검증
    Tool: Bash (Unity EditMode Test)
    Preconditions: DeckManager 구현 완료
    Steps:
      1. 12장 덱 생성 → 셔플 → 5장 드로우
      2. Assert: 핸드 카드 수 == 5
      3. Assert: 덱 남은 카드 수 == 7
      4. 7장 추가 드로우 → 덱 비어있음 → 다시 드로우 시도
      5. Assert: 버린 카드 더미가 리셔플되어 덱으로 이동
    Expected Result: 드로우/리셔플 사이클 정상
    Evidence: EditMode test results.xml

  Scenario: 보너스 확률 통계 검증
    Tool: Bash (Unity EditMode Test)
    Preconditions: CardEffectResolver 구현 완료
    Steps:
      1. bonusProbability 0.4 카드에 대해 ProbabilityResolver.Roll() 1000회 실행
      2. 성공 횟수 카운트
      3. Assert: 성공 횟수가 340~460 사이 (3σ)
    Expected Result: 확률 분포 정상
    Evidence: EditMode test results.xml
  ```

  **Commit**: YES
  - Message: `feat(scalar): implement card data system with 15 prototype cards`
  - Files: `Scripts/Cards/`, `ScriptableObjects/Cards/`
  - Pre-commit: EditMode 테스트 통과

---

- [ ] 3. 전투 코어 루프

  **What to do**:
  - `CombatManager`: 전투 초기화, 턴 루프, 승리/패배 판정
  - `TurnManager`: 플레이어 턴 → 적 턴 → 턴 종료 사이클
  - `APSystem`: 턴당 AP 3 부여, 카드 사용 시 소모, 턴 종료 시 리셋
  - `HealthSystem`: HP/실드 관리 (스칼라, 크리스탈, 적 각각)
  - 실드: 턴 종료 시 소멸 (은밀 키워드 보너스로 유지 가능)
  - 전투 UI (플레이스홀더):
    - 화면 하단: 핸드 (카드를 클릭/드래그하여 사용)
    - 화면 상단: 적 유닛 (HP바, 다음 행동 표시)
    - 화면 중앙 좌: 스칼라 (HP바)
    - 화면 중앙: 크리스탈 (HP바)
    - 화면 우하단: AP 표시, PP 표시, 탐지 표시
    - 턴 종료 버튼
  - 카드 플레이 흐름: 카드 선택 → 대상 선택 (적 또는 자기) → AP 차감 → 기본 효과 적용 → 보너스 판정
  - 적 행동: 적마다 "다음 행동" 확률과 함께 표시 (예: "공격 12 [60%] / 방어 +8 [40%]")
  - 적 턴: 적 하나씩 순서대로 행동, 확률에 따라 행동 결정 (Random.value로 판정)
  - 승리: 모든 적 HP ≤ 0
  - 패배: 스칼라 HP ≤ 0

  **Must NOT do**:
  - PP 시스템 (Task 4)
  - 크리스탈 카드 로직 (Task 6)
  - 탐지 시스템 (Task 7)
  - 카드 애니메이션 (단순 위치 이동 트윈만)
  - 데미지 숫자 팝업 애니메이션

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 전투 시스템은 게임의 핵심 루프이며 복잡도 높음
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (단독, Task 2 이후)
  - **Blocks**: Tasks 4, 5, 6, 7, 8, 9
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - Task 2에서 만든 CardData, DeckManager, HandManager, CardEffectResolver를 사용

  **External References**:
  - Slay the Spire 전투 흐름 분석: 턴 시작 → 에너지 부여 → 드로우 → 카드 사용 → 턴 종료 → 적 행동 → 턴 시작 반복
  - Unity UI Toolkit 또는 uGUI: https://docs.unity3d.com/Manual/UIToolkits.html

  **WHY Each Reference Matters**:
  - StS 전투 흐름: 입증된 턴 구조를 따르되, 적 행동 확률 공개가 추가된 변형
  - Unity UI: 카드 핸드, HP바, 적 인텐트 표시 등 프로토타입 UI 구현에 필요

  **Acceptance Criteria**:

  - [ ] 전투 시작 시 덱에서 5장 드로우
  - [ ] 카드 클릭 → 대상 선택 → AP 차감 → 효과 적용 흐름 동작
  - [ ] AP 부족 시 카드 사용 불가 (UI에서 비활성화)
  - [ ] 턴 종료 버튼 클릭 시 실드 소멸 → 적 행동 순차 실행 → 새 턴 시작 → AP 리셋 → 드로우
  - [ ] 적 행동 확률이 UI에 표시됨 ("공격 12 [60%]")
  - [ ] 적 전멸 시 Victory 상태로 전이
  - [ ] 스칼라 HP 0 시 Defeat 상태로 전이

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 기본 전투 루프 1턴 완주
    Tool: Playwright (playwright skill)
    Preconditions: Unity WebGL 빌드 또는 에디터 PlayMode
    Steps:
      1. Combat 씬 로드
      2. Assert: 핸드에 카드 5장 표시
      3. Assert: AP 표시 "3/3"
      4. Assert: 적 유닛에 행동 확률 표시됨
      5. 카드 1장 클릭 → 적 클릭 (대상 선택)
      6. Assert: AP가 카드 코스트만큼 감소
      7. Assert: 적 HP가 기본 데미지만큼 감소 (보너스는 확률)
      8. "턴 종료" 버튼 클릭
      9. Assert: 적이 순서대로 행동 실행
      10. Assert: 새 턴 시작, AP 리셋, 새 카드 드로우
    Expected Result: 1턴 사이클 정상 완주
    Evidence: .sisyphus/evidence/task-3-combat-loop.png

  Scenario: 전투 승리 판정
    Tool: Bash (Unity PlayMode Test)
    Preconditions: CombatManager 구현 완료
    Steps:
      1. 적 1기 (HP 1) 배치, 스칼라 덱에 "타격" 카드만
      2. 타격 카드 사용 → 적 HP 0
      3. Assert: CombatManager.State == CombatState.Victory
    Expected Result: 승리 상태 전이
    Evidence: PlayMode test results.xml

  Scenario: 전투 패배 판정
    Tool: Bash (Unity PlayMode Test)
    Preconditions: CombatManager 구현 완료
    Steps:
      1. 적 1기 (공격력 999) 배치
      2. 턴 종료 → 적 공격 → 스칼라 HP 0
      3. Assert: CombatManager.State == CombatState.Defeat
    Expected Result: 패배 상태 전이
    Evidence: PlayMode test results.xml
  ```

  **Commit**: YES
  - Message: `feat(scalar): implement core combat loop with turn system`
  - Files: `Scripts/Combat/`, `Scripts/UI/`, `Scenes/Combat.unity`
  - Pre-commit: PlayMode 테스트 통과

---

- [ ] 4. 확률 조작(PP) 시스템

  **What to do**:
  - `PPSystem`: PP 현재/최대 관리, 턴당 회복 (2 PP), 최대 보유 (5 PP)
  - PP 사용 인터페이스:
    - **카드 보너스 부스트**: 카드를 사용하기 전에 PP를 투자하여 보너스 확률 +20%/PP. UI에서 카드 위에 +/- 버튼 또는 슬라이더로 PP 투자량 조절
    - **적 행동 조작**: 적을 클릭하면 행동 확률 조작 패널 표시. 각 행동의 확률을 ±15%/PP로 조절. 3PP로 특정 행동 완전 봉쇄 (0%)
    - **드로우 조작**: 턴 시작 시 또는 별도 버튼으로 2PP 소모, 버린 카드 더미에서 원하는 카드를 선택하여 다음 드로우에 포함시킴 (100%는 아니고 +40%)
  - PP 사용 시 탐지 누적 카운터 +1 (탐지 시스템은 Task 7에서 처리하지만, 카운터는 여기서 기록)
  - PP 상태를 전투 UI에 표시: "PP: 2/5"
  - 확률 조작 결과가 즉시 UI에 반영 (적 행동 확률 수치 변화, 카드 보너스 확률 변화)

  **Must NOT do**:
  - 탐지 단계 효과 (Task 7)
  - 노드맵에서의 PP 사용 (Task 8)
  - PP 관련 시각 이펙트 (글리치 등)
  - PP 관련 사운드

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 게임의 코어 차별화 메카닉. 정확한 수학적 구현 + UI 연동 필요
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (Task 5와 병렬)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - Task 3의 CombatManager, TurnManager와 통합
  - Task 2의 CardEffectResolver에 PP 보너스 부스트 연동

  **External References**:
  - 이 플랜의 "PP 소모 기준" 테이블: PP 비용과 효과의 정확한 수치

  **WHY Each Reference Matters**:
  - PP 소모 기준 테이블이 구현의 유일한 스펙 소스. 이 수치를 그대로 코드에 반영해야 함

  **Acceptance Criteria**:

  - [ ] 턴 시작 시 PP가 2 회복 (최대 5 초과 불가)
  - [ ] 카드 사용 전 PP 투자 UI 동작: 1PP당 보너스 확률 +20%
  - [ ] 보너스 확률이 100% 초과 불가 (100%에서 클램프)
  - [ ] 적 행동 조작 UI 동작: 1PP당 ±15% 이동
  - [ ] 적 행동 확률 합계가 항상 100% 유지 (한쪽 올리면 다른 쪽 내림)
  - [ ] 3PP로 적 행동 완전 봉쇄 시 해당 행동 0%, 나머지에 재분배
  - [ ] 드로우 조작: 2PP 소모 → 버린 카드 목록에서 1장 선택 → 다음 드로우 시 해당 카드 확률 +40%
  - [ ] PP 사용할 때마다 내부 탐지 카운터 +1 기록
  - [ ] PP 0일 때 조작 UI 비활성화

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 카드 보너스 PP 부스트 검증
    Tool: Bash (Unity EditMode Test)
    Preconditions: PPSystem + CardEffectResolver 연동 완료
    Steps:
      1. 보너스 확률 40% 카드에 PP 2 투자
      2. Assert: 조정된 확률 == 0.8 (40% + 20%×2)
      3. PP 3 투자 (40% + 60% = 100%)
      4. Assert: 조정된 확률 == 1.0 (클램프)
      5. PP 4 투자 시도 (100% 넘음)
      6. Assert: 조정된 확률 == 1.0 (변화 없음)
    Expected Result: PP 부스트 수학 정확
    Evidence: EditMode test results.xml

  Scenario: 적 행동 확률 조작 검증
    Tool: Bash (Unity EditMode Test)
    Preconditions: PPSystem + EnemyAI 연동 완료
    Steps:
      1. 적 행동: 공격 60% / 방어 40%
      2. PP 1 사용하여 공격 -15%
      3. Assert: 공격 45% / 방어 55%
      4. PP 3 사용하여 공격 완전 봉쇄
      5. Assert: 공격 0% / 방어 100%
    Expected Result: 확률 재분배 정확, 합계 100% 유지
    Evidence: EditMode test results.xml

  Scenario: PP 자원 관리 검증
    Tool: Bash (Unity EditMode Test)
    Steps:
      1. PP 최대 5, 현재 5에서 3 소모
      2. Assert: PP == 2
      3. 턴 종료 → 턴 시작 → PP 회복 +2
      4. Assert: PP == 4
      5. 턴 종료 → 턴 시작 → PP 회복 +2
      6. Assert: PP == 5 (최대 클램프)
    Expected Result: PP 소모/회복/클램프 정확
    Evidence: EditMode test results.xml
  ```

  **Commit**: YES
  - Message: `feat(scalar): implement probability manipulation (PP) system`
  - Files: `Scripts/Probability/`, UI 수정
  - Pre-commit: EditMode 테스트 통과

---

- [ ] 5. 적 시스템 (3종 + 행동 AI)

  **What to do**:
  - `EnemyData` ScriptableObject:
    ```csharp
    [CreateAssetMenu]
    public class EnemyData : ScriptableObject {
        public string enemyName;
        public int maxHP;
        public List<EnemyAction> possibleActions;
    }
    
    [System.Serializable]
    public class EnemyAction {
        public string actionName;
        public EnemyActionType type; // Attack, Defend, Special
        public int value; // damage or shield amount
        public float baseProbability; // 0.0 ~ 1.0
        public string specialEffect; // e.g., "DetectionIncrease:2"
    }
    ```
  - 적 3종 에셋 생성 (경비병, 드론, 탐지자 — 수치는 위 테이블 참조)
  - `EnemyAI`: 매 턴 시작 시 각 적의 행동 확률 기반으로 "의도(intent)" 결정. PP 조작이 적용된 후의 확률을 사용
  - `IntentDisplay`: 적 위에 다음 행동과 확률을 UI로 표시
    - 일반: "⚔️ 12 [60%] | 🛡️ +8 [40%]" 
    - 탐지자: "⚔️ 15 [50%] | 📡 스캔 [30%] | 🛡️ +12 [20%]"
  - 적 행동 실행: 턴 종료 시 확률 Roll → 행동 결정 → 순서대로 실행
  - 탐지자 특수: "스캔" 행동 시 탐지 카운터 +2 강제 증가
  - 전투 시작 시 적 배치: 1~3기 (프로토에서는 수동 지정)

  **Must NOT do**:
  - 적 등장 애니메이션
  - 적 사망 애니메이션 (즉시 제거)
  - 탐지 단계에 따른 적 추가 (Task 7)
  - 적 스케일링/강화

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 적 AI + 확률 기반 행동 시스템
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (Task 4와 병렬)
  - **Blocks**: Tasks 6, 7, 9
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - Task 2의 ScriptableObject 패턴을 적 데이터에도 적용
  - Task 3의 CombatManager, TurnManager와 통합

  **External References**:
  - 이 플랜의 "적 기본 수치" 테이블: 3종 적의 HP, 행동, 확률

  **WHY Each Reference Matters**:
  - 적 수치 테이블이 유일한 데이터 소스. 그대로 에셋으로 변환

  **Acceptance Criteria**:

  - [ ] EnemyData 에셋 3종 존재 (경비병, 드론, 탐지자)
  - [ ] 각 적의 행동 확률 합계 == 100%
  - [ ] 전투 시작 시 적 의도(intent)가 확률과 함께 UI에 표시
  - [ ] PP로 확률 조작 후 UI의 확률 수치가 실시간 갱신
  - [ ] 턴 종료 시 조작된 확률 기반으로 행동 Roll → 결정 → 실행
  - [ ] 탐지자의 "스캔" 행동 시 탐지 카운터 +2
  - [ ] 경비병 1000턴 시뮬레이션 시 공격 비율 540~660 사이 (60% 기대)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 적 의도 표시 + 확률 조작 반영
    Tool: Playwright (playwright skill)
    Preconditions: Combat 씬에 경비병 1기 배치
    Steps:
      1. 전투 시작
      2. Assert: 경비병 위에 "공격 12 [60%] / 방어 +8 [40%]" 표시
      3. PP 1 사용하여 공격 -15%
      4. Assert: 표시가 "공격 12 [45%] / 방어 +8 [55%]"로 변경
    Expected Result: 확률 조작이 UI에 즉시 반영
    Evidence: .sisyphus/evidence/task-5-intent-display.png

  Scenario: 탐지자 스캔 행동
    Tool: Bash (Unity PlayMode Test)
    Preconditions: 탐지자 배치, 스캔 확률 100%로 고정 (테스트용)
    Steps:
      1. 턴 종료 → 탐지자 행동 → 스캔 실행
      2. Assert: 탐지 카운터가 +2 증가
    Expected Result: 스캔 시 탐지 카운터 증가
    Evidence: PlayMode test results.xml
  ```

  **Commit**: YES
  - Message: `feat(scalar): implement enemy system with 3 types and intent display`
  - Files: `Scripts/Enemies/`, `ScriptableObjects/Enemies/`
  - Pre-commit: 테스트 통과

---

- [ ] 6. 크리스탈 동행 시스템

  **What to do**:
  - `CrystalCompanion`: 크리스탈 HP 관리 (최대 40), 상태 (Active / Downed)
  - 크리스탈 카드 핸들링:
    - 크리스탈 전용 카드: 크리스탈이 Active일 때만 사용 가능
    - 크리스탈 경유 스칼라 카드: 크리스탈이 Active일 때만 사용 가능 (이 프로토에서는 "링크" 키워드 카드가 이에 해당)
    - 크리스탈 Downed 시: 위 카드들 핸드에서 비활성화 (회색 표시, 사용 불가)
  - 크리스탈 현장 복구: AP 2 소모, 전투당 1회, 크리스탈 HP 40%로 부활
  - 크리스탈이 적의 공격 대상이 될 수 있음 (적 행동 중 "크리스탈 공격" 행동 추가)
  - 연산(Compute) 키워드 구현:
    - 연산 스택: 전투 시작 시 0
    - 연산 카드 사용 시 +1
    - 스택 0~1: 적의 현재 턴 행동 확률만 표시
    - 스택 2: 적의 다음 턴 행동도 표시 (예측)
    - 스택 3+: 적의 2턴 뒤 행동까지 표시
  - 링크(Link) 키워드 구현:
    - 직전 카드가 스칼라 카드였을 때 링크 카드 사용 시 (또는 반대) AP 1 환불

  **Must NOT do**:
  - 크리스탈 모듈/장비 시스템
  - 크리스탈 대화/내러티브
  - 크리스탈 전용 비주얼 이펙트
  - 크리스탈이 적을 선택적으로 타겟팅하는 AI

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 동행 시스템 + 키워드 2개 구현 + 기존 전투 루프 통합
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (Task 7과 병렬)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 2, 3, 5

  **References**:

  **Pattern References**:
  - Task 2의 CardData (CardOwner.Crystal), CardEffectResolver
  - Task 3의 CombatManager, TurnManager (크리스탈을 전투 참여자로 등록)
  - Task 5의 EnemyAI (크리스탈 타겟팅 행동 추가)

  **External References**:
  - 이 플랜의 키워드 정의 테이블: 연산, 링크의 기계적 효과

  **WHY Each Reference Matters**:
  - 키워드 정의가 구현 스펙. "연산 스택 3 이상이면 2턴 뒤 행동 공개" 등 구체 규칙 참조

  **Acceptance Criteria**:

  - [ ] 크리스탈이 전투 UI에 별도 HP바로 표시
  - [ ] 크리스탈 HP 0 → Downed 상태 → 크리스탈 카드 전부 비활성화
  - [ ] AP 2 소모하여 크리스탈 부활 → HP 16 (40%)으로 복귀
  - [ ] 전투당 복구 1회 제한 (2회째 시도 시 버튼 비활성화)
  - [ ] 연산 카드 사용 시 연산 스택 +1
  - [ ] 연산 스택 2 도달 시 적의 다음 턴 행동이 추가 표시
  - [ ] 링크 카드: 직전 카드가 다른 owner일 때 AP 1 환불 발생
  - [ ] 링크 카드: 직전 카드가 같은 owner일 때 AP 환불 없음

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 크리스탈 쓰러짐 + 복구
    Tool: Bash (Unity PlayMode Test)
    Preconditions: 크리스탈 HP 40, 적 공격력 999
    Steps:
      1. 적이 크리스탈 공격 → 크리스탈 HP 0
      2. Assert: CrystalCompanion.State == Downed
      3. Assert: 핸드의 크리스탈 카드 전부 isPlayable == false
      4. 크리스탈 복구 실행 (AP 2)
      5. Assert: 크리스탈 HP == 16
      6. Assert: 크리스탈 카드 isPlayable == true
      7. 2번째 복구 시도
      8. Assert: 실패 (이미 1회 사용)
    Expected Result: 복구 시스템 정상
    Evidence: PlayMode test results.xml

  Scenario: 연산 스택 정보 공개
    Tool: Bash (Unity PlayMode Test)
    Preconditions: 연산 스캔 카드 3장 이상 핸드에
    Steps:
      1. 연산 스택 0 → 적 현재 턴 행동만 보임
      2. 연산 카드 2회 사용 → 스택 2
      3. Assert: 적의 다음 턴 행동 정보 공개됨
    Expected Result: 연산 스택에 따른 정보 확장
    Evidence: PlayMode test results.xml

  Scenario: 링크 키워드 AP 환불
    Tool: Bash (Unity EditMode Test)
    Steps:
      1. 스칼라 카드 "타격" 사용 (AP 3→2)
      2. 직후 크리스탈 링크 카드 "링크 어택" 사용 (AP 2, 링크 환불 -1 → 실제 소모 1)
      3. Assert: AP == 1 (3 - 1 - 1 = 1)
      4. 크리스탈 카드 직후 또 크리스탈 카드 → 같은 owner
      5. Assert: 환불 없음
    Expected Result: 링크 환불 조건 정확
    Evidence: EditMode test results.xml
  ```

  **Commit**: YES
  - Message: `feat(scalar): implement Crystal companion with Compute and Link keywords`
  - Files: `Scripts/Crystal/`, 기존 Combat/Cards 수정
  - Pre-commit: 테스트 통과

---

- [ ] 7. 탐지 시스템 + 키워드 효과 통합

  **What to do**:
  - `DetectionMeter`: 탐지 카운터 → 단계 변환, 런 단위 리셋
  - 탐지 4단계 효과 구현:
    - 안전 (0~4): 효과 없음
    - 주의 (5~9): 전투 시작 시 적 +1 추가 배치
    - 경계 (10~14): 적 +1, 적 행동 중 공격 확률 기본값 +10%
    - 추적 (15+): 적 +2, 공격 확률 +20%, 전투 시작 시 탐지자 추가 출현
  - 탐지 UI: 화면에 현재 단계 + 카운터 표시 (예: "탐지: 주의 [7/10]")
  - 단계 상승 시 시각적 알림 (화면 테두리 색 변화: 안전=없음, 주의=노란, 경계=주황, 추적=빨강)
  - 과부하(Overload) 키워드 효과 구현:
    - 사용 시 탐지 카운터 +1 (PP 사용과 별개로 추가)
    - 같은 턴에 과부하 카드 2장 이상: 모든 과부하 카드 기본 데미지 +3
  - 은밀(Stealth) 키워드 효과 구현:
    - 사용 시 탐지 변화 없음 (PP 사용해도 은밀 카드의 PP는 탐지 카운터 안 올림)
    - 해당 턴에 은밀 카드만 사용하면 턴 종료 시 탐지 카운터 -1
  - 수렴(Converge) 키워드 효과 구현:
    - 같은 적에게 수렴 카드 연속 사용 시 2번째부터 기본 데미지 +4 누적

  **Must NOT do**:
  - 탐지 관련 사운드
  - 추적자 추가 출현 연출 (즉시 배치)
  - 탐지 단계 내리는 아이템/이벤트 (프로토에선 은밀 키워드로만)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 탐지 시스템 + 키워드 3개 구현 + 기존 전투/적 시스템과 통합
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (Task 6과 병렬)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - Task 4의 PPSystem (탐지 카운터 읽기)
  - Task 5의 EnemyAI (적 추가 배치, 공격 확률 변조)
  - Task 3의 CombatManager (전투 시작 시 탐지 단계 기반 적 추가)

  **External References**:
  - 이 플랜의 "탐지 단계" 테이블: 단계별 PP 임계값, 효과
  - 이 플랜의 "키워드 정의" 테이블: 과부하, 은밀, 수렴의 기계적 효과

  **Acceptance Criteria**:

  - [ ] PP 사용 시 탐지 카운터 +1 증가
  - [ ] 카운터 0~4: 안전, 5~9: 주의, 10~14: 경계, 15+: 추적
  - [ ] 주의 단계: 전투 시작 시 적 1기 추가 배치
  - [ ] 경계 단계: 적 추가 + 공격 확률 +10%
  - [ ] 추적 단계: 적 2기 추가 + 공격 확률 +20% + 탐지자 출현
  - [ ] 탐지 UI에 현재 단계 + 카운터 표시
  - [ ] 과부하 카드 사용 시 탐지 카운터 추가 +1
  - [ ] 과부하 2장 같은 턴: 과부하 카드 기본 데미지 +3
  - [ ] 은밀 카드: PP 사용해도 탐지 카운터 안 오름
  - [ ] 은밀 카드만 쓴 턴: 턴 종료 시 탐지 -1
  - [ ] 수렴 카드: 같은 적 2번째 사용 시 데미지 +4, 3번째 +8...

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 탐지 단계 전이 + 적 추가
    Tool: Bash (Unity PlayMode Test)
    Preconditions: 탐지 카운터 4 (안전 상태)
    Steps:
      1. PP 1 사용 → 카운터 5
      2. Assert: 단계 == 주의
      3. 새 전투 시작
      4. Assert: 기본 적 수 + 1 배치됨
    Expected Result: 단계 전이 + 적 추가 동작
    Evidence: PlayMode test results.xml

  Scenario: 은밀 턴에 탐지 감소
    Tool: Bash (Unity EditMode Test)
    Steps:
      1. 탐지 카운터 7 (주의)
      2. 은밀 카드만 2장 사용 (PP 1씩 사용하여 보너스 부스트)
      3. 턴 종료
      4. Assert: 탐지 카운터 == 6 (PP 사용 탐지 안 오름 + 턴 끝 -1)
    Expected Result: 은밀 메카닉 정상
    Evidence: EditMode test results.xml

  Scenario: 과부하 시너지
    Tool: Bash (Unity EditMode Test)
    Steps:
      1. 과부하 카드 "강타" (기본 14) + "과부하 사격" (기본 10) 같은 턴 사용
      2. Assert: 강타 데미지 == 17 (14+3), 과부하 사격 데미지 == 13 (10+3)
      3. 탐지 카운터가 +2 증가 (과부하 1장당 +1)
    Expected Result: 과부하 시너지 + 탐지 페널티 동시 동작
    Evidence: EditMode test results.xml
  ```

  **Commit**: YES
  - Message: `feat(scalar): implement detection system and Overload/Stealth/Converge keywords`
  - Files: `Scripts/Probability/DetectionMeter.cs`, 기존 Cards/Combat 수정
  - Pre-commit: 테스트 통과

---

- [ ] 8. 미니 노드맵

  **What to do**:
  - `NodeMap`: 3~5개 노드로 구성된 간단한 노드 맵
  - `NodeData`:
    ```csharp
    public class NodeData {
        public NodeType type; // Combat, PursuerCombat, SupplyCache, ExtractionGate
        public float encounterProbability; // 적 조우 확률 (PP로 조작 가능)
        public List<EnemyData> possibleEnemies;
        public int enemyCount;
    }
    ```
  - 노드 구성 (고정, 프로토는 랜덤 생성 안 함):
    - 노드 1: 전투 (경비병 2기)
    - 노드 2: 전투 (경비병 1 + 드론 2) — 분기 경로 가능
    - 노드 3: 전투 (경비병 2 + 드론 1) — 분기 경로 가능
    - 노드 4: 추적자 전투 (탐지자 1 + 경비병 1)
    - 노드 5: 탈출 관문 (4웨이브 방어전)
  - 노드맵 UI: 간단한 노드 + 연결선 표시. 노드 클릭으로 진입
  - 노드에 확률 표시: "적 조우 확률 80%"
  - PP로 노드 확률 조작: 1PP로 조우 확률 ±20%. 확률이 낮아지면 전투 없이 통과 (물자만 소량 획득)
  - 노드맵에서의 PP: 전투와 같은 PP 풀 공유. 맵에서 쓰면 전투에서 쓸 PP가 줄어드는 트레이드오프
  - 전투 승리 보상: 카드 3장 중 1장 선택 (슬레이 더 스파이어 방식)
  - 탈출 관문 (노드 5):
    - 4웨이브 방어전
    - Wave 1: 경비병 2
    - Wave 2: 경비병 1 + 드론 2
    - Wave 3: 드론 3 + 경비병 1
    - Wave 4: 탐지자 1 + 경비병 2
    - 웨이브 사이 HP/실드 유지, 새 카드 안 드로우 (덱 상태 유지)
    - 4웨이브 클리어 = 런 성공

  **Must NOT do**:
  - 맵 랜덤 생성
  - 이벤트 노드, 상점 노드, 은신처 노드 (전투만)
  - 맵 시각 이펙트 / 배경
  - 뒤로 돌아가기 (맵 역행 불가)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 노드맵 + 런 구조 + 탈출 관문 4웨이브 구현
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (단독, Wave 3 이후)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - Task 1의 GameStateMachine (Map → Combat 전이)
  - Task 3의 CombatManager (전투 시작/종료)
  - Task 4의 PPSystem (맵에서 PP 사용)
  - Task 7의 DetectionMeter (전투 시작 시 탐지 단계 기반 적 추가)

  **External References**:
  - Slay the Spire 맵 구조 참조: 노드 + 연결선 + 분기

  **WHY Each Reference Matters**:
  - StS 맵: 노드 간 연결/분기의 UX 기준점. 프로토에선 단순화하되 구조는 참조

  **Acceptance Criteria**:

  - [ ] 노드맵 씬에 5개 노드 표시
  - [ ] 노드 클릭 → Combat 씬으로 전이
  - [ ] 노드에 "적 조우 확률 80%" 표시
  - [ ] PP 1 사용 → 조우 확률 ±20% 변경, UI 반영
  - [ ] 조우 확률 판정 실패 시 전투 스킵 (물자 소량 표시)
  - [ ] 전투 승리 후 카드 3장 중 1장 선택 화면 표시
  - [ ] 선택한 카드가 덱에 추가
  - [ ] 노드 5 (탈출 관문): 4웨이브 연속 전투
  - [ ] 웨이브 사이 HP/실드/덱 상태 유지
  - [ ] 4웨이브 클리어 시 "런 성공" 화면 표시
  - [ ] 스칼라 HP 0 시 "런 실패" 화면 → 메인 메뉴로

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 노드맵 탐색 + 전투 진입
    Tool: Playwright (playwright skill)
    Preconditions: Map 씬 로드됨
    Steps:
      1. Assert: 5개 노드 표시
      2. Assert: 노드 1에 "적 조우 확률" 표시
      3. 노드 1 클릭
      4. Assert: Combat 씬으로 전환
      5. 전투 완료 (적 전멸)
      6. Assert: 카드 선택 화면 표시 (3장)
      7. 카드 1장 선택
      8. Assert: Map 씬으로 복귀, 노드 1 완료 표시
    Expected Result: 노드맵 ↔ 전투 루프 정상
    Evidence: .sisyphus/evidence/task-8-map-flow.png

  Scenario: PP로 노드 확률 조작하여 전투 스킵
    Tool: Playwright (playwright skill)
    Preconditions: Map 씬, PP 5
    Steps:
      1. 노드에 "적 조우 확률 80%" 표시
      2. PP 조작 버튼으로 4PP 사용 → 확률 0%
      3. 노드 클릭
      4. Assert: 전투 없이 통과 (물자 소량 획득 표시)
    Expected Result: 확률 0%로 전투 스킵
    Evidence: .sisyphus/evidence/task-8-skip-combat.png

  Scenario: 탈출 관문 4웨이브
    Tool: Playwright (playwright skill)
    Preconditions: 노드 5 (탈출 관문) 진입
    Steps:
      1. Wave 1 전투 시작 (경비병 2기)
      2. 전멸 → Assert: "Wave 2" 표시, HP 유지
      3. Wave 2 전투 (경비병 1 + 드론 2)
      4. 전멸 → Assert: "Wave 3" 표시
      5. Wave 3 전투 (드론 3 + 경비병 1)
      6. 전멸 → Assert: "Wave 4" 표시
      7. Wave 4 전투 (탐지자 1 + 경비병 2)
      8. 전멸 → Assert: "런 성공" 화면
    Expected Result: 4웨이브 완주 후 런 성공
    Evidence: .sisyphus/evidence/task-8-extraction.png
  ```

  **Commit**: YES
  - Message: `feat(scalar): implement mini node map with 5 nodes and extraction gate`
  - Files: `Scripts/Map/`, `Scenes/Map.unity`
  - Pre-commit: 테스트 통과

---

- [ ] 9. 통합 + 밸런스 + 플레이테스트

  **What to do**:
  - 전체 시스템 통합 확인:
    - 메인 메뉴 → 노드맵 → 전투 (PP + 크리스탈 + 탐지 + 키워드) → 보상 → 다음 노드 → 탈출 관문 → 성공/실패
  - 1런 완주 플레이테스트 (에이전트가 직접):
    - PP 전혀 안 쓰고 클리어 가능한지
    - PP 적극 활용 시 확실히 유리한지
    - PP 남발 시 탐지 추적 단계 도달하여 불리해지는지
    - 크리스탈 없이도 (쓰러진 상태) 클리어 가능한지
    - 과부하 빌드 (공격적) vs 은밀 빌드 (방어적)의 체감 차이
  - 밸런스 1차 조정:
    - HP, 데미지, PP 비용, 탐지 임계값 등 수치 조정
    - 너무 쉽거나 너무 어려운 구간 파악 및 수정
  - 버그 수정 및 안정화
  - 최종 빌드 생성

  **Must NOT do**:
  - 비주얼 폴리시
  - 새 카드/적 추가
  - 새 시스템 추가
  - 최적화 (프로토에 불필요)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 전체 시스템 통합 + 밸런스는 깊은 분석이 필요
  - **Skills**: [`playwright`]
    - `playwright`: UI 기반 통합 테스트에 필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (최종, 단독)
  - **Blocks**: None (최종 태스크)
  - **Blocked By**: Tasks 4, 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - 모든 이전 Task의 시스템들

  **External References**:
  - 이 플랜의 "수치 정의" 섹션 전체: 밸런스 기준점
  - 이 플랜의 "프로토타입이 검증해야 하는 4가지 질문": 플레이테스트 판단 기준

  **WHY Each Reference Matters**:
  - 4가지 검증 질문이 프로토타입의 성공/실패 판단 기준. 이걸 기준으로 플레이테스트 결과를 평가

  **Acceptance Criteria**:

  - [ ] 1런 완주 가능 (메인 메뉴 → 노드 5개 → 탈출 성공)
  - [ ] PP 미사용 런: 클리어 가능하지만 빡빡함 (HP 30% 이하로 도착)
  - [ ] PP 적극 사용 런: 클리어 쉬워지지만 탐지 경계~추적 도달
  - [ ] PP 남발 런: 추적 단계에서 적 과다 → 패배 가능
  - [ ] 크리스탈 쓰러진 상태 런: 클리어 가능하지만 현저히 어려움
  - [ ] 빌드 에러 0
  - [ ] 크래시/무한루프 0

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 풀 런 완주 (PP 보통 사용)
    Tool: Playwright (playwright skill)
    Preconditions: 빌드 완료
    Steps:
      1. 메인 메뉴 → 게임 시작
      2. 노드맵 표시 확인
      3. 노드 1~4 순차 진입, 전투 수행
        - 매 전투에서 PP 1~2 사용
        - 카드 보상 선택
      4. 노드 5 진입 → 4웨이브 방어전
      5. 4웨이브 클리어
      6. Assert: "런 성공" 화면 표시
      7. Assert: 탐지 단계 주의~경계 사이
    Expected Result: 1런 완주 가능
    Evidence: .sisyphus/evidence/task-9-full-run.png

  Scenario: PP 남발 시 탐지 불이익 체감
    Tool: Playwright (playwright skill)
    Preconditions: 빌드 완료
    Steps:
      1. 게임 시작
      2. 매 전투 + 노드맵에서 PP 최대로 사용
      3. 노드 3~4쯤에서 탐지 "추적" 도달
      4. Assert: 적이 기본보다 +2기 추가 배치
      5. Assert: 적 공격 확률 +20% 적용
      6. Assert: 탈출 관문에서 탐지자 추가 출현
    Expected Result: PP 남발의 페널티 명확히 체감
    Evidence: .sisyphus/evidence/task-9-detection-penalty.png

  Scenario: PP 미사용 런
    Tool: Playwright (playwright skill)
    Preconditions: 빌드 완료
    Steps:
      1. 게임 시작, PP를 한 번도 사용하지 않음
      2. 기본 효과만으로 전투 수행
      3. 탐지 "안전" 유지 확인
      4. 런 완주 시도
      5. Assert: 클리어 가능하지만 HP 많이 깎임
    Expected Result: PP 없이도 플레이 가능하나 어려움
    Evidence: .sisyphus/evidence/task-9-no-pp-run.png
  ```

  **Commit**: YES
  - Message: `feat(scalar): integrate all systems and balance prototype`
  - Files: 전체 수정사항
  - Pre-commit: 풀 빌드 + 1런 완주 확인

---

## Commit Strategy

| After Task | Message | Verification |
|------------|---------|--------------|
| 1 | `feat(scalar): initialize Unity project with core architecture` | 빌드 성공 |
| 2 | `feat(scalar): implement card data system with 15 prototype cards` | EditMode 테스트 |
| 3 | `feat(scalar): implement core combat loop with turn system` | PlayMode 테스트 |
| 4 | `feat(scalar): implement probability manipulation (PP) system` | EditMode 테스트 |
| 5 | `feat(scalar): implement enemy system with 3 types and intent display` | EditMode + PlayMode 테스트 |
| 6 | `feat(scalar): implement Crystal companion with Compute and Link keywords` | PlayMode 테스트 |
| 7 | `feat(scalar): implement detection system and Overload/Stealth/Converge keywords` | EditMode 테스트 |
| 8 | `feat(scalar): implement mini node map with 5 nodes and extraction gate` | PlayMode 테스트 |
| 9 | `feat(scalar): integrate all systems and balance prototype` | 풀 빌드 + 풀 런 |

---

## Success Criteria

### 프로토타입 검증 질문 (재미 판단 기준)

| 질문 | 측정 방법 | 성공 기준 |
|------|-----------|-----------|
| PP를 카드 보너스에 투자하는 게 재미있는가? | PP 투자 후 보너스 발동 시 체감 이득 | 보너스 발동이 전투 결과를 체감 가능하게 바꿈 |
| PP를 적 행동 조작에 쓰는 게 재미있는가? | 적 행동을 밀어서 위험 회피 시 체감 | 적 행동 조작이 "아 그거 안 했으면 죽었다" 순간을 만듦 |
| PP 분배 의사결정이 전략적인가? | 매 턴 PP를 어디 쓸지 고민이 생기는가 | "이번에 카드에 쓸까 적에 쓸까" 딜레마가 매 턴 존재 |
| 탐지 리스크가 적절한가? | PP 남발 시 후반 난이도 체감 | 남발하면 확실히 불리, 아끼면 확실히 유리 |

### Final Checklist
- [ ] 모든 Must Have 존재
- [ ] 모든 Must NOT Have 부재
- [ ] 빌드 에러 0
- [ ] 1런 완주 가능 (PP 사용/미사용 모두)
- [ ] PP 전략적 의사결정 발생 확인
- [ ] 탐지 시스템 체감 확인
