# Phase 02. 가이드 틀과 열람자 둘러보기, 사용법 단추

**Execution profile**: standard

## 목표

첫 접속 가이드의 틀(단계 정의, 진행 상태, 말풍선)을 만들고, `guideDoneAt` 이 없는 사용자가 로그인하면 작업 공간에서 둘러보기 가이드가 열리게 한다.
머리글의 「사용법」 으로 언제든 다시 연다. 이 phase 에서는 모든 역할이 둘러보기(검색, 그래프, 상세)를 본다. 편집자와 관리자의 따라하기는 phase 03 이 이 틀 위에 더한다.

**범위 외**: 편집자 따라하기(만들기 폼 미리 채우기, 연습 항목 만들기와 보관)는 phase 03 이다. 서버는 phase 01 이 만들었고 이 phase 는 `financial-workbench/api/` 를 고치지 않는다.

## 컨텍스트

- 서버(phase 01): `GET /api/auth/me` 의 `CurrentUser` 에 `guideDoneAt: string | null` 이 있다. `POST /api/auth/me/guide-done` 은 모든 역할이 부를 수 있고 `CurrentUser` 를 돌려준다. 이미 기록돼 있으면 처음 값을 그대로 둔다.
- 웹 타입은 `financial-workbench/web/src/api/types.ts` 의 `interface CurrentUser extends UserRef { role: Role }` 이고, API 는 `web/src/api/client.ts` 의 `api.auth.me()`, `api.auth.logout()` 이다. `request` 가 CSRF 토큰을 붙인다.
- `web/src/App.tsx` 가 `auth` 상태(`{ status: 'signed-in', user }`)를 들고, 머리글 오른쪽에 `current-user-name`, `current-user-role`, `logout-button` 을 둔다. 탭은 `tabOfPath(location.pathname)` 이고 작업 공간은 `/workspace` 다.
- 작업 공간은 `web/src/components/Workspace.tsx` 다. 1024px 이상에서는 세 칸(`pane-left` 검색, `pane-center` 그래프, `pane-right` 상세), 미만에서는 `Tabs` 로 나누고 주소의 `pane`(`search`, `graph`, `detail`)이 고른 탭을 정한다. 탭 바꾸기는 `push({ pane })` 다. 경로와 query 의 뜻은 `docs/flow.md` 의 「주소와 뒤로가기」 다.
- 가이드가 가리킬 요소의 testid: 검색 입력칸 `search-input`, 그래프 `graph-canvas`, 상세 `detail-panel`, 좁은 화면의 탭 `workspace-tab-search`, `workspace-tab-graph`, `workspace-tab-detail`(`web/TESTIDS.md`).
- 지금의 `web/src/components/WelcomeGuide.tsx` 는 아무것도 고르지 않은 그래프 칸의 시작 안내다. 가이드와 별개로 그대로 둔다.
- CSP 는 `style-src 'self'` 다(`docs/code-architecture.md` 「보안 기본값」). 실행 중에 `<style>` 요소를 넣으면 막힌다. React 의 `style` prop(CSSOM)은 막히지 않는다.
- 웹 단위 테스트는 vitest 이고 컴포넌트는 `react-dom/server` 로 정적 렌더링한다(`web/src/components/testSupport.tsx`). `testSupport.tsx` 의 테스트 사용자 fixture 에도 `guideDoneAt` 을 채워야 typecheck 가 통과한다(`git grep -n "role: '" -- financial-workbench/web/src` 로 `CurrentUser` fixture 를 찾는다).
- 브라우저 테스트의 로그인은 `web/e2e/support.ts` 의 `loginAs(page, user, expectResult, startPath)` 이고, 모든 spec 이 이것으로 로그인한다. e2e 스택은 실행마다 새 DB 라 모든 사용자가 처음 로그인한다. 사용자는 `workbench.spec.ts` 의 `0)` 테스트가 사용자 탭에서 `addUser(pageAdmin, user, role)` 로 더한다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「첫 접속 가이드」(열람자의 둘러보기 표, 좁은 화면, 진행 상태 저장), `financial-workbench/docs/api-contract.md` 의 `CurrentUser` 와 `POST /api/auth/me/guide-done`, `financial-workbench/docs/code-architecture.md` 「웹 구조」 의 `web/src/components/guide/` 행과 「결정」 의 첫 접속 가이드 항목

## 의도 메모

- 라이브러리를 쓰지 않는다. 말풍선 라이브러리는 실행 중에 `<style>` 을 넣는 것이 많아 CSP 와 부딪히고, phase 03 이 만들기 폼과 맞물려야 한다(`code-architecture.md`).
- 가이드는 다른 동작을 막지 않는다. 화면을 덮는 막(overlay)을 두지 않고, 말풍선과 대상 요소의 강조만 둔다.
- 기존 브라우저 테스트가 가이드에 가려지지 않게 `loginAs` 가 기본으로 가이드를 건너뛴다. 가이드를 확인하는 테스트만 가이드를 남긴다.

## 작업 항목

### 1. 타입과 API

- `api/types.ts`: `CurrentUser` 에 `guideDoneAt: string | null` 을 더한다.
- `api/client.ts`: `api.auth.guideDone: () => request<CurrentUser>('POST', '/api/auth/me/guide-done')` 를 더한다.

### 2. 순수 함수

새 파일 `web/src/lib/guide.ts`

- `type GuideKind = 'browse' | 'practice'`, `interface GuideStep { id: string; target: string | null; pane: 'search' | 'graph' | 'detail' | null; title: string; body: string }`.
- `BROWSE_STEPS: GuideStep[]`: `docs/flow.md` 「열람자의 둘러보기」 표의 세 단계(대상 `search-input`/`search`, `graph-canvas`/`graph`, `detail-panel`/`detail`)와 표의 문장. 앞에 소개 단계(대상 없음) 하나를 둔다. 소개 문장은 「투자 지식을 근거와 함께 쌓는 곳입니다. 화면을 세 단계로 둘러봅니다.」 다.
- `interface GuideProgress { userId: string; kind: GuideKind; step: number; startedAt: string; created: Record<string, string> }`(`created` 는 phase 03 이 쓴다).
- `readProgress(userId): GuideProgress | null`, `writeProgress(p)`, `clearProgress()`: `localStorage` 키 `workbench.guide`. 읽기와 쓰기는 모두 `try/catch` 로 감싸 저장소를 쓸 수 없으면 `null` 과 무시로 끝낸다. 다른 사용자의 값이면 `null` 이다.
- `shouldAutoStart(user: CurrentUser): boolean` 은 `guideDoneAt === null` 이다.

### 3. 가이드 상태와 말풍선

새 폴더 `web/src/components/guide/`

- `GuideProvider.tsx`: React context 로 `{ active, kind, step, start(kind), next(), finish(), skip() }` 를 내려 준다. `finish()` 와 `skip()` 은 진행 상태를 지우고 `api.auth.guideDone()` 을 부른 뒤 가이드를 닫는다. 실패하면 말풍선에 「기록하지 못했습니다. 다음 로그인 때 다시 열릴 수 있습니다.」 를 보이고 닫기는 그대로 한다. 단계를 바꿀 때마다 `writeProgress` 한다. phase 03 이 같은 context 에 연습 단계의 이벤트(`report`)와 미리 채울 값(`prefill`)을 더한다.
- `GuideBubble.tsx`(testid `guide-bubble`, `data-step` 에 단계 id): 제목, 본문, 「n / 전체」, 단추 「다음」(`guide-next`) 또는 마지막 단계의 「끝내기」(`guide-finish`), 「건너뛰기」(`guide-skip`)를 둔다. 소개 단계는 「시작」(`guide-start`)과 「건너뛰기」 다.
  - 넓은 화면(`useMediaQuery('(min-width: 1024px)')`)에서는 대상 요소 옆에 둔다. `document.querySelector('[data-testid="<target>"]')` 의 `getBoundingClientRect()` 로 위치를 구해 `style={{ top, left }}`(`position: fixed`)로 둔다. 창 크기 변경과 스크롤에 다시 계산한다. 대상이 없거나 화면 밖이면 아래쪽 카드로 둔다.
  - 좁은 화면이거나 대상이 없으면 화면 아래쪽 카드(`position: fixed`, 좌우 16px, 높이 최대 40vh, 내부 스크롤)다. 페이지에 가로 스크롤을 만들지 않는다.
  - 대상 요소에는 강조 class(`guide-target`, `styles.css` 에 테두리와 그림자)를 effect 로 붙이고 단계가 바뀌거나 닫힐 때 뗀다.
  - 좁은 화면에서 단계의 `pane` 이 지금 탭과 다르면 그 탭으로 바꾼다. 주소는 `replace` 로 바꾼다(`docs/flow.md` 「좁은 화면」).
  - `role="dialog"`, `aria-modal="false"`, 제목에 `aria-labelledby` 를 단다. 「건너뛰기」 는 `Escape` 로도 누른다.

### 4. 여는 때와 사용법 단추

- `App.tsx`: 로그인한 뒤 온톨로지를 받고 작업 공간이 그려진 다음, `shouldAutoStart(user)` 면 `readProgress(user.id)` 가 있으면 그 단계부터, 없으면 처음부터 연다. 작업 공간이 아닌 탭으로 들어와도 첫 단계는 작업 공간으로 옮겨(`/workspace`, `push`) 연다.
- 머리글의 `current-user-name` 앞에 「사용법」(`guide-open`, `variant="link"`)을 둔다. 누르면 작업 공간으로 옮겨 가이드를 처음부터 연다. 열린 가이드가 있으면 그것을 닫고 다시 연다.
- 이 phase 에서는 모든 역할이 `browse` 가이드를 연다. phase 03 이 편집자와 관리자를 `practice` 로 바꾼다.
- `guideDone()` 이 돌려준 `CurrentUser` 로 `auth.user` 를 바꿔, 같은 세션에서 다시 자동으로 열리지 않게 한다.

### 5. 브라우저 테스트 도우미와 문서

- `web/e2e/support.ts` 의 `loginAs` 에 다섯째 인자 `options: { guide?: 'skip' | 'keep' } = {}` 를 더한다. 로그인에 성공한 뒤 `guide` 가 `'keep'` 이 아니면, `guide-bubble` 이 2초 안에 보이면 `guide-skip` 을 누르고 사라질 때까지 기다린다. 기존 호출부는 고치지 않아도 된다.
- `support.ts` 에 테스트 사용자 `guideViewer`(`guide-viewer@example.com`, VIEWER)와 `guideEditor`(`guide-editor@example.com`, EDITOR)를 `admin` 과 같은 형식으로 더한다. 같은 이메일이 다른 테스트에 없는지 `git grep -n "guide-viewer\|guide-editor" -- financial-workbench/web/e2e` 로 확인한다. `workbench.spec.ts` 의 `0)` 이 이 둘도 `addUser` 로 더한다.
- `web/TESTIDS.md` 에 이 phase 의 testid(`guide-bubble`, `guide-start`, `guide-next`, `guide-finish`, `guide-skip`, `guide-open`)와 강조 class `guide-target` 을 적는다.

### 6. 이 phase 를 검증하는 테스트

- 새 파일 `web/src/lib/guide.test.ts`: `BROWSE_STEPS` 의 대상이 `search-input`, `graph-canvas`, `detail-panel` 순서다. `writeProgress` 뒤 같은 사용자의 `readProgress` 가 같은 값이고 다른 사용자는 `null` 이다. `localStorage` 가 예외를 던지면(vitest 에서 `globalThis.localStorage` 를 던지는 객체로 바꾼다) `readProgress` 가 `null`, `writeProgress` 가 조용히 끝난다. `shouldAutoStart` 가 `guideDoneAt` 이 `null` 일 때만 참이다.
- 새 파일 `web/src/components/guide/guide.test.tsx`(정적 렌더링): 소개 단계의 `GuideBubble` 이 `guide-start`, `guide-skip`, `role="dialog"` 를 담는다. 마지막 단계는 `guide-finish` 를 담고 `guide-next` 가 없다.
- `web/e2e/workbench.spec.ts` 의 `8)` 뒤에 `10) 열람자는 처음 로그인하면 둘러보기 가이드가 열리고, 끝내면 다시 열리지 않으며 「사용법」 으로 다시 본다` 를 더한다. 새 컨텍스트로 `loginAs(page, guideViewer, 'success', '/', { guide: 'keep' })` → `guide-bubble` 의 `data-step` 이 소개 → `guide-start` → 세 단계를 `guide-next` 로 넘기며 각 단계에서 대상 요소에 `guide-target` class 가 있는지 본다 → `guide-finish` → 가이드가 사라진다 → 새로고침해도 열리지 않는다 → `guide-open` 을 누르면 소개 단계가 다시 열린다 → `guide-skip`. `shot(page, '10-guide-browse')` 를 둘째 단계에서 찍는다.
- `web/e2e/mobile.spec.ts` 에 `휴대폰 폭에서 사용법 가이드가 아래쪽 카드로 열리고 단계마다 탭을 옮긴다` 를 더한다. `loginAs(page, admin)` → `guide-open` → `guide-start` → 검색 단계에서 `workspace-tab-search` 의 `aria-selected` 가 `true`, `guide-next` 뒤 `workspace-tab-graph` 가 `true` → `expectNoHorizontalOverflow(page)` → `guide-skip`. `shot(page, 'm-guide')`.

## 검증

```bash
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
git grep -q "guide-bubble" -- financial-workbench/web/TESTIDS.md
```

- 각 줄은 저장소 루트에서 돈다.
- 브라우저 테스트(`npm run test:e2e`)는 Compose 스택이 있어야 돌아 이 절에 두지 않는다. 코디네이터가 PR 검증 때 돌린다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/lib/guide.ts` | 신규 |
| `financial-workbench/web/src/lib/guide.test.ts` | 신규 |
| `financial-workbench/web/src/components/guide/GuideProvider.tsx` | 신규 |
| `financial-workbench/web/src/components/guide/GuideBubble.tsx` | 신규 |
| `financial-workbench/web/src/components/guide/guide.test.tsx` | 신규 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/styles.css` | 수정 |
| `financial-workbench/web/e2e/support.ts` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
