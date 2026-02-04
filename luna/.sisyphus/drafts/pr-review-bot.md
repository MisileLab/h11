# Draft: GitHub PR Review Bot with OpenCode/oh-my-opencode

## Research Findings

### Current Luna Project State
- **Language**: TypeScript
- **Framework**: Probot v14 (GitHub App framework)
- **AI Integration**: @opencode-ai/sdk v1.1.51
- **Package Manager**: pnpm
- **Current Functionality**: Responds to `issues.opened` events only
- **Entry Point**: `main.ts` (single file, ~30 lines)

### Existing Code Pattern (main.ts)
```typescript
import { createOpencode } from "@opencode-ai/sdk";
import { Context, Probot } from "probot";

const { client } = await createOpencode();  // Starts opencode server

app.on("issues.opened", async (context) => {
  const session = await client.session.create();
  await client.session.message({ ... });  // NOTE: syntax error in current code
});
```

### @opencode-ai/sdk API (Confirmed from types.gen.d.ts)
- `createOpencode()` - Starts local opencode server, returns `{ client, server }`
- `client.session.create()` - Creates new session
- `client.session.prompt()` - Send prompt and wait for response
- `client.session.promptAsync()` - Send prompt, return immediately
- `client.session.messages()` - List messages for session
- `client.event.subscribe()` - SSE event subscription
- `client.session.abort()` - Abort a session

### GitHub Webhook Events Needed
| Event | Action | Use Case |
|-------|--------|----------|
| `pull_request.opened` | PR created | Initial review |
| `pull_request.synchronize` | New commits pushed | Re-review changes |
| `issue_comment.created` | Comment posted | @mention detection |

### GitHub API for Posting Reviews
- `context.octokit.pulls.createReview()` - Post review with inline comments
- `context.octokit.issues.createComment()` - Post general PR comment
- `context.octokit.pulls.get({ mediaType: { format: 'diff' }})` - Get PR diff

### oh-my-opencode Features Available
- Multi-agent orchestration (Sisyphus, Oracle, etc.)
- LSP integration
- AST-grep for code analysis
- Web search and documentation lookup
- "ultrawork" mode for comprehensive tasks

## Requirements (Confirmed)

### User Decisions
1. **Trigger Strategy**: Auto + Mention
   - PR 생성 시 자동 리뷰
   - @luna 멘션으로 추가 질문/리뷰 요청 가능

2. **Review Depth**: Deep Analysis
   - oh-my-opencode 멀티 에이전트 활용
   - 아키텍처, 보안, 성능까지 분석

3. **Comment Style**: Both
   - 요약 코멘트 + 인라인 코멘트

4. **Repository Scope**: Owner repos only
   - 봇 소유자의 리포지토리에서만 동작

### Additional Decisions
5. **Large PR Handling**: Limit with summary
   - 50+ 파일 또는 10,000+ 라인 diff 시 요약만
   - 리소스 무리한 확장 방지

6. **Re-review Trigger**: Incremental
   - 새 커밋 푸시 시 추가된 변경사항만 리뷰
   - 전체 리리뷰 아님

7. **Bot Mention Name**: @luna
   - 봇 멘션 이름은 `@luna`

8. **Review Language**: English
   - 리뷰 코멘트는 영어로 작성

9. **Review Verdict**: Comment + Auto verdict
   - 리뷰 후 이슈 심각도에 따라 Approve/Request Changes 자동 결정

10. **Ignore Patterns**: Smart ignore
    - lock files, generated files, build artifacts 자동 무시
    - package-lock.json, yarn.lock, pnpm-lock.yaml
    - *.min.js, *.bundle.js, dist/, build/
    - *.generated.*, *.d.ts (declaration files)

11. **Security Handling**: Highlight in review
    - 🚨 이모지와 함께 강조 표시
    - 별도 Security Advisory는 생성하지 않음

12. **Agent Selection**: Full multi-agent
    - Oracle (아키텍처/디버깅 분석)
    - Explore (코드베이스 검색)
    - Librarian (문서/베스트 프랙티스 참조)

13. **Error Handling**: Retry + Silent fail
    - 3회 재시도 후 조용히 실패 (로그만)
    - PR에 에러 코멘트 안 남김

14. **Code Structure**: Modular
    - handlers/, utils/, types/, config/ 분리
    - 테스트 파일은 __tests__/ 또는 *.test.ts

15. **Hosting Target**: Local development
    - 지금은 로컬에서 개발/테스트
    - 나중에 클라우드 배포 고려

16. **Mention Commands**: Natural language
    - @luna + 자연어 질문/요청 처리
    - 예: "@luna 이 함수 왜 이렇게 작성했는지 설명해줘"
    - 예: "@luna 보안 이슈 있는지 다시 봐줘"

17. **Review Focus Areas**: All areas
    - 코드 품질, 보안, 성능, 아키텍처, 테스트 커버리지

18. **Comment Format**: Rich + Detailed + Tables
    - 이모지 + 카테고리 태그 (🐛 Bug, 💡 Suggestion, 🔒 Security, ⚡ Performance)
    - 요약 테이블 포함
    - 코드 추천 포함

19. **Test Strategy**: TDD
    - 테스트 인프라 설정: bun test
    - RED-GREEN-REFACTOR 방식

20. **PR Size Threshold**: Standard
    - 50개 파일 또는 10,000 라인 초과 시 요약만
    
21. **Existing Code**: Fix
    - main.ts 문법 오류 수정 포함

## Technical Decisions

- [x] Event handling: `pull_request.opened/synchronize` + `issue_comment.created`
- [x] Multi-agent: oh-my-opencode 에이전트 활용 (Oracle, Explore, Librarian)
- [x] Review prompt template: Natural language with multi-agent orchestration
- [x] Comment formatting: Rich format with emojis, tables, code suggestions
- [x] Error handling: 3x retry then silent fail (log only)
- [x] Configuration management: Smart defaults, .lunaignore for customization
- [x] Code structure: Modular (handlers/, utils/, types/, config/)
- [x] Test strategy: TDD with bun test

## Metis Gap Analysis Answers (Final)

### Q1: Agent Working Directory
**Decision**: Clone PR repo to temp dir
- Agents can use Read/Grep/LSP tools on actual PR files
- Temp directory per review, cleaned up after
- Enables full codebase analysis, not just diff text

### Q2: GitHub App Credentials
**Decision**: Need setup guidance
- Include GitHub App creation steps in Phase 0
- Document required permissions and scopes
- Provide .env.example template

### Q3: Concurrent Review Strategy
**Decision**: Parallel sessions
- One opencode session per PR
- Each PR gets independent analysis
- Session cleanup after review complete

### Q4: Review State Storage
**Decision**: HTML comments in PR body
- Stateless approach (like CodeRabbit)
- Store last reviewed SHA in hidden comment: `<!-- luna-reviewed: abc123 -->`
- Works across restarts, no database needed

## Scope Boundaries

**INCLUDE**:
- PR 생성/업데이트 시 자동 리뷰
- @luna 멘션 응답
- 코드 품질, 버그, 보안, 아키텍처, 성능 분석
- 요약 + 인라인 코멘트
- Owner 리포지토리만

**EXCLUDE**:
- 50+ 파일 PR의 상세 인라인 리뷰 (요약만)
- Owner가 아닌 리포지토리
- Draft PR (명시적으로 제외)
- 봇이 생성한 PR (무한 루프 방지)
