---
name: vibe-feature
description: 사용자가 새 기능 요구사항을 자연어로 전달할 때 호출. Planner → 사용자 승인 → Developer → Reviewer ∥ Tester 피드백 루프를 최대 3회 실행해 요구사항을 만족시킨다. 단순 버그픽스/리팩토링/단일 파일 편집/타입 에러 수정에는 사용하지 말 것 — 그건 메인 에이전트가 직접 처리.
---

# vibe-feature — 멀티에이전트 기능 개발 워크플로우

## 트리거 기준

다음 같은 입력에서 호출:
- "사용자 로그인 페이지 만들어줘"
- "TODO 리스트 추가하고 싶어"
- "결제 화면 흐름 구현해줘"
- "마이페이지에 비밀번호 변경 기능 추가"

다음에는 호출하지 말 것 (메인 에이전트가 직접 처리):
- 단일 파일 수정 ("이 함수 이름 바꿔줘")
- 버그 픽스 ("이 에러 고쳐줘")
- 의존성/설정 변경
- 코드 리뷰 한 번만 ("이 코드 봐줘")

## 단계 (반드시 이 순서)

### 1. Planner 호출

Agent tool로 `subagent_type=planner` 호출. 프롬프트에 사용자의 원본 요구사항을 그대로 전달 + slug 후보를 제안.

결과: `docs/specs/<slug>/spec.md` 생성. Planner가 slug와 AC 요약을 반환.

### 2. 사용자 승인 게이트 (생략 금지)

Planner의 결과를 받은 뒤, **반드시** 사용자에게 spec 요약을 보여주고 AskUserQuestion으로 다음을 묻는다:

질문: "이 spec으로 진행할까요?"
옵션:
- "예, 진행" → 단계 3으로
- "수정 요청" → 사용자에게 어떤 점을 수정할지 추가로 받고 Planner 재호출 (slug 동일 유지, spec.md를 덮어씀)
- "취소" → 워크플로우 종료, spec 파일은 남겨둠

### 3. 피드백 루프 (최대 3 iteration)

`N = 1`부터 시작. `N <= 3` 동안:

#### 3-1. Developer 호출
- `subagent_type=developer`
- 프롬프트에 포함: spec 파일 경로, 현재 iteration N, (N > 1이면) 이전 review/test 보고서 경로들.
- 결과: 코드 변경 + `docs/specs/<slug>/devlog-iter-N.md`.

#### 3-2. Reviewer + Tester 병렬 호출
- **반드시 단일 메시지에서 두 Agent 호출을 동시에 보낸다.** (Agent 도구 호출 블록 2개를 같은 응답에 포함.)
- Reviewer: `subagent_type=reviewer`, 프롬프트에 spec 경로 + devlog 경로 + iter 번호.
- Tester: `subagent_type=tester`, 동일.
- 결과: `review-iter-N.md`, `test-iter-N.md`.

#### 3-3. Verdict 판정 (1차)
- 두 보고서를 Read 도구로 직접 읽는다 (서브에이전트의 요약을 믿지 말고 파일에서 Verdict 라인 확인).
- **하나라도 FAIL** → `N = N + 1` 로 증가시키고 3-1로 돌아간다 (N > 3이면 단계 5).
- **둘 다 PASS** → 단계 3-4(E2E)로.

#### 3-4. E2E 게이트 (조건부)
- `docs/specs/<slug>/spec.md` 의 "10. E2E 검증 필요 여부" 섹션을 Read로 확인.
- `needsE2E: false` 또는 섹션 누락 → **e2e-tester 호출 생략**, 단계 4(종료)로.
- `needsE2E: true` → `subagent_type=e2e-tester` 호출 (순차, 병렬 아님 — preview 서버 자원 점유).
  - 입력: spec 경로 + 현재 iter 번호 N + 시나리오 목록.
  - 결과: `docs/specs/<slug>/e2e-iter-N.md` 와 (실패 시) 스크린샷.

#### 3-5. Verdict 판정 (2차, E2E 포함)
- `e2e-iter-N.md` 의 Verdict 라인 확인.
- **PASS 또는 SKIP** → 단계 4(종료)로.
- **FAIL** → `N = N + 1` 로 증가시키고 3-1로 돌아간다 (N > 3이면 단계 5).
  - 다음 iteration의 Developer에게는 review/test 보고서뿐 아니라 **e2e 보고서 경로도 전달**해야 한다.

### 4. 정상 종료

사용자에게 다음 보고:
```
✅ <feature 이름> 구현 완료 (iter N)

- Spec: docs/specs/<slug>/spec.md
- 변경 파일 (devlog-iter-N에서): ...
- 통과한 AC: N/M
- Review/Test 산출물: docs/specs/<slug>/

다음 단계 제안:
- 수동 브라우저 확인 (`pnpm dev`)
- (있다면) E2E 시나리오 작성
```

### 5. 한도 초과 종료

N > 3에 도달했는데도 FAIL인 경우:

```
⚠ 자동 루프 3회 초과 — 사용자 개입 요청

남은 실패 항목:
- (review-iter-3.md 의 FAIL 항목들 요약)
- (test-iter-3.md 의 FAIL 항목들 요약)

선택지:
1. 사용자가 직접 코드 확인 후 수정
2. spec을 다시 손보고 (요구사항 자체가 불명확할 수 있음) 다시 시작
3. 한 번 더 자동 시도 (강제, 권장하지 않음)
```

AskUserQuestion으로 위 선택을 받는다.

## 가드레일 (반드시 지킬 것)

- **Planner 단계에서 코드 파일을 만지지 않는다.** Planner는 spec만.
- **Reviewer는 코드를 수정하지 않는다.** Reviewer가 코드를 수정하려는 시도가 보이면 즉시 중단하고 사용자 통지.
- **사용자 승인 없이 spec → 개발로 넘어가지 않는다.** 게이트 생략 금지.
- **3회 초과 자동 시도 금지.** 안전망이다.
- **Reviewer와 Tester는 항상 병렬 호출.** 순차 호출하지 말 것 (시간 낭비).
- **사용자와의 대화는 한국어로.**
- 보고서 파일이 누락되면 (서브에이전트가 작성 실패) 즉시 사용자에게 알리고 재시도 여부 확인.

## 산출물 디렉토리 구조 (참고)

각 feature 한 개당:
```
docs/specs/<slug>/
├── spec.md                # Planner
├── devlog-iter-1.md       # Developer (iter 1)
├── review-iter-1.md       # Reviewer (iter 1)
├── test-iter-1.md         # Tester (iter 1)
├── e2e-iter-1.md          # (needsE2E=true 일 때) e2e-tester
├── screenshots/           # (E2E 실패 시) 스크린샷
│   └── e2e1-iter-1-fail.png
├── devlog-iter-2.md       # (필요 시) iter 2
├── review-iter-2.md
├── test-iter-2.md
├── e2e-iter-2.md
└── ...                    # 최대 iter 3
```

이 디렉토리는 git에 커밋되어 의사결정 기록으로 남는다.

## 단계별 게이팅 요약

```
Developer
   ↓
Reviewer ∥ Tester (병렬)
   ↓ 둘 다 PASS?
   │  NO → Developer 재호출 (iter++)
   │
   ↓ YES, needsE2E=true?
   │  NO  → 완료
   │  YES → e2e-tester (순차)
   │           ↓ PASS or SKIP?
   │           │  NO → Developer 재호출 (iter++)
   │           │  YES → 완료
```

E2E를 단위/정적 PASS 이후에만 실행하는 이유: preview 빌드+서버 기동+브라우저 자동화는 분 단위 비용이 들어, 깨진 코드에 돌리면 시간 낭비.
