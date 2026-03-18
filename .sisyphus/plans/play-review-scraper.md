# Plan: Google Play Review Scraper

## TL;DR
> **Summary**: 웹 대시보드에서 구글 플레이 앱 리뷰를 스크래핑하여 CSV로 다운로드하는 도구
> **Deliverables**: React + Vite + Hono 백엔드, CSV 다운로드, 로딩/에러 UI
> **Effort**: Short (1-2일)
> **Parallel**: YES - 4 waves
> **Critical Path**: 스캐폴드 → 백엔드 API → 프론트엔드 UI → E2E 테스트

## Context

### Original Request
"특정 앱의 구글 플레이 리뷰를 스크래핑해서 csv로 변환해주는 앱"

### Interview Summary
| 결정 | 선택 | 이유 |
|------|------|------|
| 위치 | h11/review-scraper | 모노레포 구조 유지 |
| 인터페이스 | 웹 대시보드 | 브라우저에서 쉽게 사용 |
| 프레임워크 | React + Vite | pile과 동일 스택 |
| 백엔드 | Hono | ESM 네이티브, 가벼움 |
| 스타일링 | shadcn/ui + Tailwind | pile 패턴 따름 |
| 데이터 | userName, score, date, text | 기본 정보만 |
| 리뷰 개수 | 사용자 입력 (n개 또는 전체, 최대 10,000) | 유연성 |
| 정렬 | NEWEST 고정 | MVP 단순화 |
| 추가 기능 | 없음 | 최소 범위 |
| 테스트 | TDD (Vitest + Playwright) | 품질 보장 |

### Metis Review (gaps addressed)
- **백엔드 아키텍처**: Vite SSR → Hono로 변경 (API 라우트 지원)
- **리스크**: google-play-scraper 유지보수 중단 → 버전 고정 (10.1.2), 통합 테스트 추가
- **503 방지**: throttle: 10 + 지수 백오프 재시도 (3회)
- **CSV 생성**: 서버 사이드 (브라우저 메모리 회피)
- **리뷰 캡**: 최대 10,000개

## Work Objectives

### Core Objective
Google Play 앱 ID를 입력하면 리뷰를 스크래핑하여 CSV 파일로 다운로드하는 웹 대시보드 구축

### Deliverables
1. `review-scraper/` 프로젝트 디렉토리
2. React + Vite 프론트엔드 (폼 UI)
3. Hono 백엔드 (`POST /api/scrape` → CSV 응답)
4. CSV 생성 유틸리티 (RFC 4180 이스케이프)
5. google-play-scraper 래퍼 서비스 (페이지네이션, 재시도)
6. Vitest 유닛/통합 테스트
7. Playwright E2E 테스트

### Definition of Done
```bash
# 모든 명령이 0으로 종료되어야 함
cd review-scraper && pnpm install
pnpm tsc --noEmit
pnpm test
pnpm build
pnpm e2e
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/scrape \
  -H 'Content-Type: application/json' \
  -d '{"appId":"com.google.android.apps.maps","count":1}' \
  | grep -q "200"
```

### Must Have
- 단일 페이지: appId 입력, 개수 입력, 스크래핑 버튼
- 로딩 스피너 (진행 중 표시)
- 에러 메시지 + 재시도 버튼
- CSV 다운로드 (헤더: userName,score,date,text)
- 503 에러 시 자동 재시도 (3회)
- 입력 검증 (빈 appId 시 버튼 비활성화)

### Must NOT Have (guardrails)
- 클라이언트 사이드 라우팅 (단일 페이지)
- 데이터베이스/영구 저장소
- 인증/로그인
- 정렬/필터/언어/국가 옵션 (NEWEST, en, us 고정)
- 앱 검색 기능 (정확한 appId 입력 필요)
- 차트/시각화/분석
- Prettier (oxfmt 사용)
- Docker/CI/CD

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.

- **Test decision**: TDD (RED-GREEN-REFACTOR)
- **Frameworks**: Vitest (unit/integration), Playwright (E2E)
- **Mocking**: google-play-scraper 모킹 필수 (실제 Google Play 호출 금지)
- **QA policy**: 모든 태스크에 agent-executed 시나리오 포함
- **Evidence**: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves
> Target: 5-8 tasks per wave.

**Wave 1: Foundation** (병렬 가능)
- Task 1: 프로젝트 스캐폴드 (Vite + React + Tailwind)
- Task 2: shadcn/ui 설정 (button, input, card, spinner)
- Task 3: Hono 백엔드 서버 설정

**Wave 2: Backend Core** (순차)
- Task 4: CSV 생성 유틸리티 (TDD)
- Task 5: Scraper 서비스 (페이지네이션, 재시도)
- Task 6: /api/scrape 엔드포인트

**Wave 3: Frontend** (병렬 가능)
- Task 7: 스크래핑 폼 UI
- Task 8: 로딩/에러 상태 UI

**Wave 4: Integration & QA** (순차)
- Task 9: E2E 테스트 (Playwright)
- Task 10: 엣지 케이스 처리
- Task 11: README 문서

### Dependency Matrix
| Task | Blocks | Blocked By |
|------|--------|------------|
| 1 | 2, 3, 7 | - |
| 2 | 7, 8 | 1 |
| 3 | 4, 5, 6 | 1 |
| 4 | 6 | 3 |
| 5 | 6 | 3 |
| 6 | 7, 9 | 4, 5 |
| 7 | 8, 9 | 2, 6 |
| 8 | 9 | 7 |
| 9 | 10 | 8 |
| 10 | 11 | 9 |
| 11 | - | 10 |

### Agent Dispatch Summary
- Wave 1: 3 tasks → quick/senior-frontend
- Wave 2: 3 tasks → quick/senior-backend
- Wave 3: 2 tasks → senior-frontend
- Wave 4: 3 tasks → senior-qa/deep

## TODOs

- [x] 1. 프로젝트 스캐폴드 생성

  **What to do**:
  1. `review-scraper/` 디렉토리 생성
  2. `pnpm create vite@latest . --template react-ts` 실행
  3. `package.json` 수정: `"type": "module"`, `packageManager: "pnpm@10.31.0"`
  4. Tailwind v4 설정: `pnpm add -D tailwindcss @tailwindcss/vite`
  5. `vite.config.ts`에 `@tailwindcss/vite` 플러그인 추가
  6. `tsconfig.json`: ES2020 target, bundler resolution, strict mode, `@/*` alias
  7. `.gitignore`에 `dist/`, `node_modules/` 추가

  **Must NOT do**: Prettier 설치, SSR 설정 추가

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 단순 스캐폴딩 작업
  - Skills: `senior-frontend` — Vite + Tailwind 설정

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2, 3, 7 | Blocked By: none

  **References**:
  - Pattern: `pile/package.json` — pnpm 10, ESM 설정
  - Pattern: `pile/vite.config.ts` — @tailwindcss/vite 플러그인
  - Pattern: `pile/tsconfig.json` — TypeScript 설정

  **Acceptance Criteria**:
  - [ ] `pnpm install` exits 0
  - [ ] `pnpm build` exits 0
  - [ ] `pnpm tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: Build succeeds
    Tool: Bash
    Steps: cd review-scraper && pnpm install && pnpm build
    Expected: Command exits with code 0, dist/ directory exists
    Evidence: .sisyphus/evidence/task-01-build.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps: cd review-scraper && pnpm tsc --noEmit
    Expected: No errors, exits 0
    Evidence: .sisyphus/evidence/task-01-tsc.txt
  ```

  **Commit**: YES | Message: `feat(review-scraper): scaffold project with Vite + React + Tailwind` | Files: `review-scraper/package.json, vite.config.ts, tsconfig.json, index.html, src/App.tsx, src/index.css`

---

- [x] 2. shadcn/ui 설정 및 컴포넌트 추가

  **What to do**:
  1. `pnpm dlx shadcn@latest init` 실행
     - Style: new-york
     - Base color: neutral
     - CSS variables: yes
  2. `components.json`에서 `rsc: false` 확인
  3. 컴포넌트 설치: `pnpm dlx shadcn@latest add button input card`
  4. Lucide React 아이콘 설치: `pnpm add lucide-react`
  5. `src/lib/utils.ts` 생성 확인

  **Must NOT do**: RSC 컴포넌트 사용, 다른 스타일 설정

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: CLI 도구 실행
  - Skills: `senior-frontend` — shadcn/ui 설정

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 7, 8 | Blocked By: 1

  **References**:
  - Pattern: `pile/components.json` — new-york, neutral, rsc: false
  - Pattern: `pile/src/lib/utils.ts` — cn 유틸리티

  **Acceptance Criteria**:
  - [ ] `components.json` exists with correct settings
  - [ ] `src/components/ui/button.tsx` exists
  - [ ] `src/components/ui/input.tsx` exists
  - [ ] `src/components/ui/card.tsx` exists
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Components installed
    Tool: Bash
    Steps: ls review-scraper/src/components/ui/
    Expected: button.tsx, input.tsx, card.tsx exist
    Evidence: .sisyphus/evidence/task-02-components.txt

  Scenario: Build with components
    Tool: Bash
    Steps: cd review-scraper && pnpm build
    Expected: Exits 0, no import errors
    Evidence: .sisyphus/evidence/task-02-build.txt
  ```

  **Commit**: YES | Message: `feat(review-scraper): add shadcn/ui with button, input, card` | Files: `review-scraper/components.json, src/components/ui/*, src/lib/utils.ts`

---

- [x] 3. Hono 백엔드 서버 설정

  **What to do**:
  1. Hono 설치: `pnpm add hono @hono/node-server`
  2. `server/index.ts` 생성: Hono 앱 초기화
  3. `/api/health` 헬스체크 엔드포인트 추가
  4. `vite.config.ts`에 프록시 설정: `/api` → `http://localhost:3000`
  5. `package.json` 스크립트 추가:
     - `dev:server`: `tsx watch server/index.ts`
     - `dev`: 병렬로 Vite + Hono 실행 (npm-run-all 또는 concurrently)
  6. CORS 미들웨어 추가 (개발용)

  **Must NOT do**: Express/Fastify 사용, 복잡한 미들웨어 추가

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 단순 서버 설정
  - Skills: `senior-backend` — Hono 설정

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 5, 6 | Blocked By: 1

  **References**:
  - External: https://hono.dev/getting-started/nodejs — Hono Node.js 설정

  **Acceptance Criteria**:
  - [ ] `server/index.ts` exists
  - [ ] `curl http://localhost:3000/api/health` returns `{"status": "ok"}`
  - [ ] Vite dev server에서 `/api/health` 프록시 작동

  **QA Scenarios**:
  ```
  Scenario: Health endpoint works
    Tool: Bash
    Steps: cd review-scraper && pnpm dev:server & sleep 2 && curl http://localhost:3000/api/health
    Expected: {"status":"ok"} response, HTTP 200
    Evidence: .sisyphus/evidence/task-03-health.txt

  Scenario: Vite proxy works
    Tool: Bash
    Steps: cd review-scraper && pnpm dev & sleep 3 && curl http://localhost:5173/api/health
    Expected: {"status":"ok"} response via proxy
    Evidence: .sisyphus/evidence/task-03-proxy.txt
  ```

  **Commit**: YES | Message: `feat(review-scraper): add Hono backend with dev proxy` | Files: `review-scraper/server/index.ts, vite.config.ts, package.json`

---

- [x] 4. CSV 생성 유틸리티 (TDD)

  **What to do**:
  1. **RED**: `src/lib/csv.test.ts` 작성
     - 빈 배열 → 빈 문자열 (헤더만)
     - 단일 리뷰 → 올바른 CSV 라인
     - 쉼표 포함 텍스트 → 따옴표로 감싸기
     - 따옴표 포함 텍스트 → 따옴표 이스케이프 (`""`)
     - 개행 포함 텍스트 → 따옴표로 감싸기
     - 유니코드/이모지 → 그대로 유지
  2. **GREEN**: `src/lib/csv.ts` 구현
     - `reviewsToCSV(reviews: Review[]): string`
     - 헤더: `userName,score,date,text`
     - RFC 4180 이스케이프 규칙 적용
  3. **REFACTOR**: 코드 정리

  **Must NOT do**: Papa Parse 등 외부 라이브러리 사용

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 단순 유틸리티 함수
  - Skills: `tdd-guide` — TDD 사이클 가이드

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6 | Blocked By: 3

  **References**:
  - External: https://tools.ietf.org/html/rfc4180 — CSV RFC 스펙

  **Acceptance Criteria**:
  - [ ] `pnpm test` exits 0 (모든 테스트 통과)
  - [ ] `reviewsToCSV([])` returns `"userName,score,date,text\n"`
  - [ ] 쉼표/따옴표/개행 이스케이프 정상 작동

  **QA Scenarios**:
  ```
  Scenario: Unit tests pass
    Tool: Bash
    Steps: cd review-scraper && pnpm test src/lib/csv.test.ts
    Expected: All tests pass, exits 0
    Evidence: .sisyphus/evidence/task-04-tests.txt

  Scenario: CSV escaping works
    Tool: Bash
    Steps: cd review-scraper && pnpm test -- --reporter=verbose src/lib/csv.test.ts
    Expected: Escape test cases show passed
    Evidence: .sisyphus/evidence/task-04-escape.txt
  ```

  **Commit**: YES | Message: `feat(review-scraper): implement CSV generation utility` | Files: `review-scraper/src/lib/csv.ts, src/lib/csv.test.ts`

---

- [x] 5. Scraper 서비스 구현 (TDD)

  **What to do**:
  1. google-play-scraper 설치: `pnpm add google-play-scraper@10.1.2` (정확한 버전)
  2. **RED**: `server/services/scraper.test.ts` 작성 (모킹)
     - `scrapeReviews(appId, count)` 함수 테스트
     - count=0 → 모든 리뷰 (페이지네이션)
     - count=100 → 정확히 100개
     - 503 에러 시 재시도 (최대 3회)
     - 최대 10,000개 캡
     - throttle=10 적용 확인
  3. **GREEN**: `server/services/scraper.ts` 구현
     - 페이지네이션 루프 (150개/페이지)
     - 지수 백오프 재시도 (1s → 2s → 4s)
     - `throttle: 10` 설정
     - 10,000개 초과 시 자르기
  4. **REFACTOR**: 에러 처리 개선

  **Must NOT do**: 실제 Google Play 호출 (테스트는 모킹 필수)

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 서비스 레이어 로직
  - Skills: `senior-backend` — Node.js 백엔드 패턴

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6 | Blocked By: 3

  **References**:
  - External: https://github.com/facundoolano/google-play-scraper — reviews() API 문서

  **Acceptance Criteria**:
  - [ ] `pnpm test server/services/scraper.test.ts` exits 0
  - [ ] 503 에러 시 3회 재시도 로직 존재
  - [ ] throttle=10 설정 확인

  **QA Scenarios**:
  ```
  Scenario: Scraper tests pass
    Tool: Bash
    Steps: cd review-scraper && pnpm test server/services/scraper.test.ts
    Expected: All mocked tests pass
    Evidence: .sisyphus/evidence/task-05-tests.txt

  Scenario: Retry logic verified
    Tool: Bash
    Steps: cd review-scraper && grep -n "retry" server/services/scraper.ts
    Expected: Retry logic code exists
    Evidence: .sisyphus/evidence/task-05-retry.txt
  ```

  **Commit**: YES | Message: `feat(review-scraper): implement scraper service with pagination` | Files: `review-scraper/server/services/scraper.ts, server/services/scraper.test.ts, package.json`

---

- [x] 6. /api/scrape 엔드포인트 구현 (TDD)

  **What to do**:
  1. **RED**: `server/routes/scrape.test.ts` 작성
     - 유효한 요청 → CSV 응답 (Content-Type: text/csv)
     - Content-Disposition: attachment 헤더 확인
     - 잘못된 appId → 400 에러
     - 빈 appId → 400 에러
     - count > 10000 → 400 에러
  2. **GREEN**: `server/routes/scrape.ts` 구현
     - `POST /api/scrape` 핸들러
     - 요청 바디: `{ appId: string, count: number }`
     - 입력 검증 (zod 또는 수동)
     - scraper 서비스 호출
     - CSV 생성 후 응답
  3. `server/index.ts`에 라우트 등록
  4. **REFACTOR**: 에러 메시지 개선

  **Must NOT do**: JSON 응답 (반드시 CSV)

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: API 엔드포인트
  - Skills: `senior-backend` — Hono 라우팅

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 7, 9 | Blocked By: 4, 5

  **References**:
  - Pattern: `server/services/scraper.ts` — scraper 서비스
  - Pattern: `src/lib/csv.ts` — CSV 생성

  **Acceptance Criteria**:
  - [ ] `curl -X POST http://localhost:3000/api/scrape -H 'Content-Type: application/json' -d '{"appId":"com.test","count":10}'` returns CSV
  - [ ] Response Content-Type is `text/csv`
  - [ ] Invalid input returns 400

  **QA Scenarios**:
  ```
  Scenario: Valid scrape returns CSV
    Tool: Bash
    Steps: Start server, curl POST /api/scrape with valid body
    Expected: HTTP 200, Content-Type: text/csv, CSV body with headers
    Evidence: .sisyphus/evidence/task-06-valid.txt

  Scenario: Invalid appId returns error
    Tool: Bash
    Steps: curl POST /api/scrape with empty appId
    Expected: HTTP 400, error message in response
    Evidence: .sisyphus/evidence/task-06-invalid.txt

  Scenario: CSV download header
    Tool: Bash
    Steps: curl -I POST /api/scrape with valid body
    Expected: Content-Disposition: attachment header present
    Evidence: .sisyphus/evidence/task-06-header.txt
  ```

  **Commit**: YES | Message: `feat(review-scraper): implement /api/scrape endpoint` | Files: `review-scraper/server/routes/scrape.ts, server/routes/scrape.test.ts, server/index.ts`

---

- [x] 7. 스크래핑 폼 UI

  **What to do**:
  1. `src/components/ScrapeForm.tsx` 생성
  2. 입력 필드:
     - App ID (text input, required)
     - Review Count (number input, placeholder: "Leave empty for all")
  3. Scrape 버튼 (shadcn Button)
  4. 폼 제출 시:
     - 버튼 비활성화
     - fetch로 `/api/scrape` POST 요청
     - 응답을 Blob으로 받아 다운로드 트리거
  5. `src/App.tsx`에 ScrapeForm 렌더링

  **Must NOT do**: 라우팅 라이브러리 추가, 복잡한 상태관리

  **Recommended Agent Profile**:
  - Category: `senior-frontend` — Reason: React 컴포넌트
  - Skills: `senior-frontend` — React 폼 패턴

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8, 9 | Blocked By: 2, 6

  **References**:
  - Pattern: `pile/src/components/` — React 컴포넌트 구조
  - Pattern: `pile/src/App.tsx` — 앱 진입점

  **Acceptance Criteria**:
  - [ ] Form renders with two inputs and a button
  - [ ] Button is disabled when appId is empty
  - [ ] Clicking button triggers POST to /api/scrape
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Form renders correctly
    Tool: Playwright
    Steps: Navigate to /, check appId input exists, count input exists, button exists
    Expected: All elements visible, button initially disabled
    Evidence: .sisyphus/evidence/task-07-form.png

  Scenario: Button enables with valid input
    Tool: Playwright
    Steps: Type "com.test" in appId field
    Expected: Button becomes enabled
    Evidence: .sisyphus/evidence/task-07-enabled.png
  ```

  **Commit**: YES | Message: `feat(review-scraper): implement scrape form UI` | Files: `review-scraper/src/components/ScrapeForm.tsx, src/App.tsx`

---

- [x] 8. 로딩/에러 상태 UI

  **What to do**:
  1. 로딩 상태:
     - shadcn Spinner 또는 로딩 텍스트 표시
     - 버튼에 "Loading..." 텍스트
     - 버튼 비활성화
  2. 에러 상태:
     - 에러 메시지 표시 (Alert 컴포넌트)
     - "Retry" 버튼 추가
     - Retry 시 동일 요청 재전송
  3. 성공 상태:
     - 다운로드 완료 메시지 (toast 또는 alert)
     - 폼 리셋

  **Must NOT do**: 복잡한 토스트 시스템, 글로벌 상태 관리

  **Recommended Agent Profile**:
  - Category: `senior-frontend` — Reason: UI 상태 관리
  - Skills: `senior-frontend` — React 상태 패턴

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 9 | Blocked By: 7

  **References**:
  - Pattern: `pile/src/components/` — React 컴포넌트

  **Acceptance Criteria**:
  - [ ] Loading state visible during fetch
  - [ ] Error message appears on failed request
  - [ ] Retry button triggers new request
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Loading state shows
    Tool: Playwright
    Steps: Fill valid appId, click Scrape, check for loading indicator
    Expected: Loading text/spinner visible, button disabled
    Evidence: .sisyphus/evidence/task-08-loading.png

  Scenario: Error state with retry
    Tool: Playwright
    Steps: Mock failed response, trigger scrape, verify error + retry button
    Expected: Error message visible, retry button clickable
    Evidence: .sisyphus/evidence/task-08-error.png
  ```

  **Commit**: YES | Message: `feat(review-scraper): add loading and error states` | Files: `review-scraper/src/components/ScrapeForm.tsx`

---

- [x] 9. E2E 테스트 (Playwright)

  **What to do**:
  1. Playwright 설치: `pnpm add -D @playwright/test`
  2. `playwright.config.ts` 생성
  3. `e2e/scrape.spec.ts` 작성:
     - 정상 플로우: 입력 → 버튼 클릭 → 로딩 → 다운로드
     - 에러 플로우: 잘못된 appId → 에러 메시지 → 재시도
     - 빈 입력: 버튼 비활성화 확인
  4. 백엔드 모킹 (MSW 또는 실제 서버 + 모킹된 scraper)
  5. `package.json`에 `e2e` 스크립트 추가

  **Must NOT do**: 실제 Google Play 호출 (반드시 모킹)

  **Recommended Agent Profile**:
  - Category: `senior-qa` — Reason: E2E 테스트
  - Skills: `playwright-pro` — Playwright 패턴

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: 10 | Blocked By: 8

  **References**:
  - Pattern: `pile/playwright.config.ts` — Playwright 설정

  **Acceptance Criteria**:
  - [ ] `pnpm e2e` exits 0
  - [ ] All test scenarios pass

  **QA Scenarios**:
  ```
  Scenario: Full happy path
    Tool: Playwright
    Steps: Navigate to /, fill appId "com.test", fill count "10", click Scrape, wait for download
    Expected: CSV file downloaded, no errors
    Evidence: .sisyphus/evidence/task-09-happy.png

  Scenario: Error then retry
    Tool: Playwright
    Steps: Trigger error, verify error message, click retry, verify new attempt
    Expected: Error shown, retry triggers new request
    Evidence: .sisyphus/evidence/task-09-retry.png

  Scenario: Empty input validation
    Tool: Playwright
    Steps: Leave appId empty, verify button disabled
    Expected: Button remains disabled
    Evidence: .sisyphus/evidence/task-09-validation.png
  ```

  **Commit**: YES | Message: `test(review-scraper): add E2E tests with Playwright` | Files: `review-scraper/playwright.config.ts, e2e/scrape.spec.ts, package.json`

---

- [x] 10. 엣지 케이스 처리

  **What to do**:
  1. 빈 appId: 클라이언트 검증, 버튼 비활성화
  2. 음수 count: 0 또는 양수만 허용
  3. count = 0: "all reviews"로 해석
  4. 앱이 존재하지 않음: 에러 메시지 "App not found"
  5. 리뷰가 0개: "No reviews found" 메시지
  6. 10,000개 초과 요청: 10,000개로 제한 + 경고
  7. 네트워크 타임아웃: 60초 타임아웃 + 에러
  8. 더블 클릭 방지: 스크래핑 중 버튼 비활성화

  **Must NOT do**: 복잡한 클라이언트 검증 라이브러리

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 엣지 케이스 분석
  - Skills: `senior-frontend`, `senior-backend` — 풀스택 검증

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: 11 | Blocked By: 9

  **References**:
  - Pattern: `src/components/ScrapeForm.tsx` — 프론트엔드 검증
  - Pattern: `server/routes/scrape.ts` — 백엔드 검증

  **Acceptance Criteria**:
  - [ ] Empty appId shows validation error
  - [ ] Negative count is rejected
  - [ ] count=0 fetches all (capped at 10,000)
  - [ ] Non-existent app shows "App not found"
  - [ ] Zero reviews shows "No reviews found"
  - [ ] `pnpm test && pnpm e2e` exits 0

  **QA Scenarios**:
  ```
  Scenario: Negative count rejected
    Tool: Bash
    Steps: curl POST with count=-5
    Expected: HTTP 400, validation error
    Evidence: .sisyphus/evidence/task-10-negative.txt

  Scenario: Zero reviews handled
    Tool: Playwright
    Steps: Scrape app with no reviews
    Expected: "No reviews found" message
    Evidence: .sisyphus/evidence/task-10-zero.png

  Scenario: Cap at 10,000
    Tool: Bash
    Steps: curl POST with count=50000
    Expected: Returns max 10,000 reviews
    Evidence: .sisyphus/evidence/task-10-cap.txt
  ```

  **Commit**: YES | Message: `feat(review-scraper): add input validation and edge case handling` | Files: `review-scraper/src/components/ScrapeForm.tsx, server/routes/scrape.ts, src/lib/validation.ts`

---

- [x] 11. README 문서

  **What to do**:
  1. `review-scraper/README.md` 생성
  2. 내용:
     - 프로젝트 설명
     - 설치 방법 (`pnpm install`)
     - 실행 방법 (`pnpm dev`)
     - 사용법 (스크린샷 포함)
     - API 문서 (`POST /api/scrape`)
     - 주의사항 (google-play-scraper 리스크)
     - 개발 가이드 (테스트 실행)

  **Must NOT do**: 과도한 문서화, 불필요한 섹션

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 문서 작성
  - Skills: `document-writer` — README 작성

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: none | Blocked By: 10

  **References**:
  - Pattern: `pile/README.md` — README 구조

  **Acceptance Criteria**:
  - [ ] README.md exists
  - [ ] Installation instructions are correct
  - [ ] API documentation is accurate

  **QA Scenarios**:
  ```
  Scenario: README exists
    Tool: Bash
    Steps: test -f review-scraper/README.md
    Expected: File exists
    Evidence: .sisyphus/evidence/task-11-readme.txt

  Scenario: Instructions work
    Tool: Bash
    Steps: Follow README installation, run pnpm dev
    Expected: Server starts without errors
    Evidence: .sisyphus/evidence/task-11-instructions.txt
  ```

  **Commit**: YES | Message: `docs(review-scraper): add README` | Files: `review-scraper/README.md`

## Final Verification Wave (4 parallel agents, ALL must APPROVE)

- [x] F1. Plan Compliance Audit — oracle
  - Verify all tasks follow plan structure
  - Check acceptance criteria are agent-executable
  - Confirm no scope creep

- [x] F2. Code Quality Review — unspecified-high
  - TypeScript strict mode compliance
  - No `any` types
  - Proper error handling

- [x] F3. Real Manual QA — unspecified-high
  - Start dev server manually
  - Test with real app ID (e.g., `com.google.android.apps.maps`)
  - Verify CSV downloads correctly

- [x] F4. Scope Fidelity Check — deep
  - No features added beyond plan
  - No unused dependencies
  - No Prettier or disallowed tools

## Commit Strategy

| Commit | Message | Files |
|--------|---------|-------|
| 1 | `feat(review-scraper): scaffold project with Vite + React + Tailwind` | package.json, vite.config.ts, tsconfig.json, index.html, src/App.tsx, src/index.css |
| 2 | `feat(review-scraper): add shadcn/ui with button, input, card` | components.json, src/components/ui/*, src/lib/utils.ts |
| 3 | `feat(review-scraper): add Hono backend with dev proxy` | server/index.ts, vite.config.ts, package.json |
| 4 | `test(review-scraper): add CSV generation unit tests` | src/lib/csv.test.ts |
| 5 | `feat(review-scraper): implement CSV generation utility` | src/lib/csv.ts |
| 6 | `test(review-scraper): add scraper service unit tests` | server/services/scraper.test.ts |
| 7 | `feat(review-scraper): implement scraper service with pagination` | server/services/scraper.ts |
| 8 | `test(review-scraper): add /api/scrape endpoint integration tests` | server/routes/scrape.test.ts |
| 9 | `feat(review-scraper): implement /api/scrape endpoint` | server/routes/scrape.ts, server/index.ts |
| 10 | `feat(review-scraper): implement scrape form UI` | src/components/ScrapeForm.tsx, src/App.tsx |
| 11 | `feat(review-scraper): add loading and error states` | src/components/ScrapeForm.tsx |
| 12 | `test(review-scraper): add E2E tests with Playwright` | playwright.config.ts, e2e/scrape.spec.ts, package.json |
| 13 | `feat(review-scraper): add input validation and edge case handling` | src/components/ScrapeForm.tsx, server/routes/scrape.ts, src/lib/validation.ts |
| 14 | `docs(review-scraper): add README` | README.md |

## Success Criteria

### Functional
- [ ] Entering valid appId + count returns CSV download
- [ ] CSV contains headers: `userName,score,date,text`
- [ ] Loading state shows during scrape
- [ ] Error state shows on failure with retry option
- [ ] Empty appId disables Scrape button
- [ ] Count = 0 or empty fetches all reviews (capped at 10,000)

### Non-Functional
- [ ] `pnpm tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0
- [ ] `pnpm build` exits 0
- [ ] `pnpm e2e` exits 0
- [ ] 150 reviews scrape completes in < 15 seconds
- [ ] No 503 errors with throttle enabled

### Quality
- [ ] Zero `any` types
- [ ] All functions have return types
- [ ] All tests mock google-play-scraper (no real API calls in CI)
- [ ] CSV properly escapes special characters (commas, quotes, newlines)
