# STS2 Damage Tracker

솔로 및 최대 4인 코옵을 지원하는 STS2 인게임 데미지 트래커 모드.
투명 오버레이에 플레이어별 세그먼트 바 하나로 딜/피해 기여도를 즉각적으로 표시한다.

> "설치하면 바로 보이는, 솔로와 멀티 모두 되는 가장 단순한 데미지 트래커"

## Environment

- C# SDK .NET 9.0 / TargetFramework `net8.0` (sts2.dll이 .NET 8 기반)
- Godot 4.5.1 Mono, Harmony 2 (게임에 번들됨)
- macOS: STS2 Beta 브랜치 필수 (stable에서 Harmony 버그 있음)
- 빌드 산출물: `DamageTracker.dll` + `DamageTracker.pck` → `mods/DamageTracker/`

## Module: EventCollector

`CreatureCmd.Damage(PlayerChoiceContext, IEnumerable<Creature>, decimal, ValueProp, Creature?, CardModel?)` 에 Harmony Postfix를 붙여 모든 데미지 이벤트를 수집한다. 이 메서드는 직접 공격, Poison, Thorns, Relic, 자해 등 모든 경로가 수렴하는 단일 지점이다 (namespace: `MegaCrit.Sts2.Core.Commands`).

각 이벤트는 `DamageResult`(게임 내장 타입)에서 `UnblockedDamage`, `BlockedDamage`, `Receiver`를 읽어 `DamageEvent`로 변환한다.

`UnblockedDamage`가 0이면 기록하지 않는다.

### DamageEvent fields

- `Turn` — 현재 턴 번호
- `SourceType` — `Card | Dot | Burn | EnemyAttack | Passive`
- `SourceName` — 표시명 (카드명, 적 이름, "Poison" 등)
- `TargetId`, `TargetName` — Creature 식별자 및 표시명
- `Amount` — UnblockedDamage (블록 차감 후)
- `BlockedDamage` — BlockedDamage
- `Timestamp`, `PlayerId`

### SourceType 판별 규칙

- `cardSource != null` → `Card`
- `ValueProp.Unblockable | Unpowered` → `Dot` (Poison 틱)
- `dealer is MonsterModel` → `EnemyAttack`
- 나머지 → `Passive`

Poison의 경우 `PoisonPower.AfterSideTurnStart()`가 `dealer=null, cardSource=null`로 호출하므로 위 규칙으로 `Dot`으로 분류된다. Burn은 `cardSource=this`를 전달하므로 `Card`로 분류된다.

## Module: StatsEngine

수집된 `DamageEvent` 목록을 `SessionStats`로 집계한다.

### SessionStats fields

- `DamageByTurn` — 턴 번호 → 총 딜
- `DamageBySource` — SourceName → 총 딜 (Dealt 모드)
- `TakenBySource` — SourceName → 총 피해 (Taken 모드)
- `DamageByTarget` — 적 이름 → 총 누적 딜
- `DpsTimeline` — 롤링 5초 평균 DPS, 500ms마다 1포인트 생성
- `ByPlayer` — 멀티 시 플레이어별 SessionStats

DPS 공식: `DPS(t) = sum(damage in [t-5s, t]) / 5`

## Module: OverlayUI

배경 투명한 `CanvasLayer` (layer=128). Embedded window 진입 감지 시 layer=1025로 승격.

### 레이아웃

우상단 Dealt | Taken 토글 스위치. 플레이어마다 한 줄:
- 플레이어 이름 + 총합 숫자
- 세그먼트 바 하나: 카드/원인별 색깔 구간, 너비는 전체 딜 중 비율

세그먼트 또는 범례 hover 시 툴팁 표시: SourceName, Type, Total, Hits, Avg/hit, Target.

### 세그먼트 색상

SourceType별 팔레트를 미리 정의하고 `SourceName.GetHashCode() % palette.Length`로 색상을 결정론적으로 할당한다. 같은 카드는 런 전체에서 항상 같은 색.

| SourceType | 색 계열 |
|---|---|
| Card (단일) | 주황 `#d85a30`, `#e6a817` |
| Card (광역) | 파랑 `#85b7eb`, `#378add` |
| Passive / Burn | 민트 `#9FE1CB`, 보라 `#7F77DD` |
| Dot | 초록 `#639922` |
| EnemyAttack | 빨강 `#F09595` |
| Reflect | 회색 `#B4B2A9` |

### 조작

드래그로 위치 조정. F9로 표시/숨김 토글 (변경 가능). 전환은 100ms 이내.

## Module: SyncManager (멀티 전용)

STS2는 Godot `[Rpc]`를 사용하지 않고 자체 `NetMessageBus`를 사용하며, 외부 DLL에서 `[Rpc]` 어트리뷰트는 동작하지 않는다 (Source Generator 부재). `MultiplayerApi.SendBytes()`로 직접 바이트 패킷을 전송한다.

### 패킷 타입

- `EventBatch` (Unreliable, 200ms 인터벌) — 클라이언트 → Host
- `Snapshot` (Unreliable, 500ms 인터벌) — Host → 전원
- `FinalFlush` (Reliable) — 전투/런 종료 시 전원 → Host → 저장 확정

### 집계 흐름

각 클라이언트는 로컬 이벤트를 200ms 버퍼링 후 Host에 배치 전송. Host가 전원 데이터를 취합해 500ms마다 스냅샷으로 브로드캐스트. 전투/런 종료 시 FinalFlush로 최종 상태 확정.

### 엣지 케이스

- 디싱크: Host가 10초마다 체크섬 비교, 5% 이상 차이 시 강제 스냅샷 동기화
- 버전 불일치: 접속 시 버전 교환, 불일치 시 경고 표시 (플레이 차단 안 함)
- 런 재개: Host가 동일 플레이어 재합류 시 SessionStats를 Reliable로 재전송

Late join, host migration, 전투 중 reconnect는 STS2 자체에서 지원하지 않으므로 처리 불필요.

## Module: SessionStorage

런 종료 시 BSON으로 저장 (`MongoDB.Bson`). 런타임 도메인 모델과 저장용 `SessionStatsDto`를 분리해 BSON attribute는 DTO에만 적용한다.

저장 경로: `{AppData}/SlayTheSpire2/mods/DamageTracker/runs/run_{timestamp}.bson`

스키마 버전 필드 `schema_version: 1` 포함. 저장 실패 시 인게임 경고 표시, 재시도 없음.

## Module: ConfigStore

설정 파일: `{AppData}/SlayTheSpire2/mods/DamageTracker/config.json`

- `toggle_key`: 기본 `F9`
- `panel_position`: x, y 좌표
- `default_mode`: `Dealt` | `Taken`
- `layer_preference`: `auto` | `128` | `1025`

모드 초기화 시 로드, 변경 시 저장. 유효하지 않은 값은 기본값 사용.

## Constraints

- 프레임 타임 오버헤드 ≤ 2ms @ 60 FPS
- 런당 메모리 증가 ≤ 10 MB
- 이벤트 버퍼 최대 1000개 (초과 전 flush)
- 세션 저장 ≤ 2s (백그라운드 비블로킹)
- 오버레이 렌더 ≤ 1ms

## Out of Scope

런 리플레이, CSV/JSON 익스포트, 리더보드, 클라우드 동기화, 블록된 피해 트래킹, 색맹 모드, 로컬라이제이션.
