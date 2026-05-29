# Template — React MVP

MVP 단계 React 애플리케이션용 템플릿. Vercel 배포를 기본으로 하되, on-prem nginx 호스팅도 동일 산출물로 가능하도록 구성.

## 스택

| 영역 | 선택 |
| --- | --- |
| 프레임워크 | React 19 |
| 번들러 / 개발 서버 | Vite 6 |
| 라우팅 | TanStack Router (file-based) |
| 데이터 페칭 | TanStack Query |
| 전역 상태 | Zustand |
| UI / 디자인 | Tailwind CSS v4 + shadcn/ui (new-york) |
| 폼 | React Hook Form + Zod |
| 환경 변수 검증 | Zod (`src/env.ts`) |
| 테스트 | Vitest + Testing Library |
| Lint / Format | ESLint + Prettier |
| Git hook | Husky + lint-staged |
| 패키지 매니저 | pnpm |

## 디렉토리

```
src/
├── main.tsx
├── styles.css            # Tailwind v4 진입점 + 디자인 토큰
├── env.ts                # zod로 검증된 환경 변수
├── routes/               # TanStack Router (file-based)
│   ├── __root.tsx
│   └── index.tsx
├── components/ui/        # shadcn 컴포넌트
├── lib/utils.ts          # cn 헬퍼
├── stores/               # Zustand 스토어
└── test/                 # Vitest 셋업 + 예제
```

## 개발

```bash
pnpm install
cp .env.example .env
pnpm dev          # 5173 포트
pnpm typecheck
pnpm lint
pnpm test
pnpm build        # 산출물: dist/
```

shadcn 컴포넌트 추가:

```bash
pnpm dlx shadcn@latest add dialog input form
```

## 배포 — Vercel

저장소를 Vercel에 연결하면 `vercel.json`이 자동 적용된다.

- SPA 폴백, 보안 헤더, `/assets/*` immutable 캐시까지 설정 포함.
- 환경 변수는 Vercel 대시보드 → Project → Settings → Environment Variables 에 `VITE_*` 로 등록.

## 배포 — On-prem (Docker + nginx)

빌드된 정적 파일을 `nginx:alpine`에서 호스팅하는 멀티스테이지 구성.

```bash
# 빌드 + 실행 (8080 포트)
docker compose up --build -d

# 또는 직접
docker build \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  -t template-react-mvp:latest .
docker run --rm -p 8080:8080 template-react-mvp:latest
```

- 헬스체크: `GET /healthz` → `200 ok`
- nginx 설정: `nginx.conf`
  - SPA fallback (`try_files`)
  - 보안 헤더 (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
  - `/assets/*` 1년 immutable 캐시 / `index.html` no-cache
  - gzip 활성화. CSP는 도메인/외부 자원에 맞춰 주석 처리된 라인을 활성화하여 조정.

### 환경변수와 빌드의 관계

Vite는 빌드 타임에 `VITE_*` 변수를 정적으로 인라인한다. 즉:

- Vercel: 대시보드의 환경변수가 빌드 시 주입.
- Docker: `--build-arg VITE_API_BASE_URL=...` 로 주입. **런타임 컨테이너에서 env 변경해도 반영되지 않는다.** 다른 환경에 같은 이미지를 쓰려면 entrypoint에서 치환하는 별도 전략이 필요.

## 바이브 코딩 워크플로우 (Claude Code)

이 레포는 멀티에이전트 파이프라인으로 기능을 추가하도록 셋업되어 있다.

```
사용자 요구사항
   ↓
Planner   → docs/specs/<slug>/spec.md (needsE2E 플래그 포함)
   ↓  (사용자 승인 게이트)
Developer → 코드 변경 + devlog-iter-N.md
   ↓
Reviewer ∥ Tester → review-iter-N.md / test-iter-N.md
   │  하나라도 FAIL → Developer (iter++, 최대 3)
   ↓  둘 다 PASS
needsE2E ?
   │  false / 누락 → 완료
   ↓  true
e2e-tester (Playwright MCP, 실제 브라우저) → e2e-iter-N.md
   │  FAIL → Developer (iter++, 최대 3)
   ↓  PASS or SKIP
완료
```

### 구성 요소
- `.claude/agents/`
  - `planner.md` — 요구사항 → spec
  - `developer.md` — spec + 레이어드 아키텍처 준수 구현
  - `reviewer.md` — 컨벤션/AC 검토 (코드 수정 금지)
  - `tester.md` — Vitest + typecheck + lint
  - `e2e-tester.md` — Playwright MCP로 실제 브라우저 시나리오 검증 (spec의 `needsE2E: true` 일 때만)
- `.claude/skills/vibe-feature/SKILL.md` — 위 5개를 오케스트레이션
- `.mcp.json` — Playwright MCP 서버 등록
- `docs/specs/<slug>/` — 기능별 산출물 (spec + iteration별 로그 + 실패 시 스크린샷)

### 사용법
Claude Code에서 자연어로 기능 요구사항을 던지면 끝.

```
> 사용자 로그인 페이지 만들어줘. 이메일/비밀번호 + "로그인 유지" 체크박스.
```

Claude가 `vibe-feature` Skill을 자동으로 호출 → Planner가 spec 작성 → 사용자 승인 받고 → Developer/Reviewer/Tester 루프 시작 → 필요 시 E2E까지.

### Playwright MCP 셋업 (E2E 사용 시 1회만)

E2E 단계는 Playwright MCP를 통해 실제 브라우저로 검증한다. 첫 실행 전 다음을 확인.

1. **MCP 등록 확인**: `.mcp.json` 이 이미 작성되어 있다. Claude Code가 프로젝트 진입 시 자동 인식.
   ```bash
   # 등록된 MCP 목록 확인
   claude mcp list
   ```
   `playwright` 가 보이지 않으면 Claude Code를 한 번 재시작.

2. **Chromium 설치** (최초 1회):
   ```bash
   npx @playwright/mcp@latest --help    # 실행 한 번으로 의존성 fetch
   npx playwright install chromium      # 브라우저 바이너리 다운로드 (~150MB)
   ```

3. **포트 확보**: e2e-tester는 `pnpm preview --port 4173` 으로 띄운다. 4173이 다른 프로세스에 점유되어 있으면 실패하니 사전에 비워둘 것.

4. **headless 동작**: 기본은 headless. 디버깅 필요 시 `.mcp.json` 의 args에 `"--headed"` 추가.

### 강제 / 생략 옵션

- E2E를 **강제 생략**하려면 spec의 `needsE2E` 를 `false`로 두면 됨 — e2e-tester가 자동 스킵.
- 반대로 단순 기능이라도 굳이 E2E를 돌리고 싶으면 `needsE2E: true` + 시나리오 작성. Planner는 기본적으로 다단계 사용자 플로우일 때만 true를 권한다.

### 레이어드 아키텍처 (강제 규약)
```
Routes (src/routes/)            # file-based, TanStack Router
  ↓
Components (src/components/)     # ui/(shadcn), <feature>/(비즈니스)
  ↓
Hooks (src/hooks/)
  ↓
Stores (src/stores/, zustand)    Queries (src/lib/queries/, TanStack Query)
  ↓
API Client (src/lib/api/)        Schemas (src/lib/schemas/, zod)
```

**의존성 방향은 항상 위 → 아래.** Reviewer가 위반을 잡아낸다.

## 다음에 고려할 것

- CI: GitHub Actions로 lint / typecheck / test / build on PR
- 에러 트래킹: Sentry (소스맵 업로드)
- 의존성 자동 PR: Renovate 또는 Dependabot
- E2E: Playwright (Tester 서브에이전트 확장)
- CSP 강화: `nginx.conf`의 CSP 라인 활성화
- 이미지 레지스트리 푸시: GHCR / ECR
