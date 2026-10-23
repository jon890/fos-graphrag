# Phase 02. 가이드 틀과 열람자 둘러보기, 사용법 단추

**Execution profile**: standard

## 목표

첫 접속 가이드의 틀(단계 정의, 진행 상태, 말풍선)을 만들고, `guideDoneAt` 이 없는 사용자가 작업 공간에 들어오면 둘러보기 가이드가 열리게 한다.
머리글의 「사용법」 으로 언제든 다시 연다. 이 phase 에서는 모든 역할이 둘러보기(검색, 그래프, 상세)를 본다. 편집자와 관리자의 따라하기는 phase 03 이 이 틀 위에 더한다.

**범위 외**: 편집자 따라하기(만들기 폼 미리 채우기, 연습 항목 만들기와 보관, 이어서 하기)는 phase 03 이다. 서버는 phase 01 이 만들었고 이 phase 는 `financial-workbench/api/` 를 고치지 않는다.

## 컨텍스트

- 서버(phase 01): `GET /api/auth/me` 의 `CurrentUser` 에 `guideDoneAt: string | null` 이 있다. `POST /api/auth/me/guide-done` 은 모든 역할이 부를 수 있고 `CurrentUser` 를 돌려준다. 이미 기록돼 있으면 처음 값을 그대로 둔다.
- 웹 타입은 `financial-workbench/web/src/api/types.ts` 의 `interface CurrentUser extends UserRef { role: Role }` 이고, API 는 `web/src/api/client.ts` 의 `api.auth.me()`, `api.auth.logout()` 이다. `request` 가 CSRF 토큰을 붙인다.
- `CurrentUser` fixture 는 `web/src/components/testSupport.tsx:88`(`editor`), `web/src/components/ontology/ontology.test.tsx`(10-11줄 부근), `web/src/components/tabs.test.tsx`(77줄 부근)에 있다. 필드를 더하면 typecheck 가 이 셋에서 깨진다.
- `web/src/App.tsx` 구조: `auth` 상태(`{ status: 'signed-in', user }`)와 `ontology` 상태를 들고, 머리글(`<header>`, 오른쪽에 `current-user-name`, `current-user-role`, `logout-button`)과 `<main className="app-main">` 을 그린다. `AppContext.Provider`(`web/src/context.ts` 의 `user`, `ontology`, `canEdit`)는 온톨로지를 받은 뒤 `<main>` 안에서만 그린다. 그래서 머리글의 단추는 `useApp()` 을 쓸 수 없다. 탭은 `tabOfPath(location.pathname)` 이고 작업 공간은 `/workspace` 다. 로그인 링크로 들어온 사람의 돌아갈 주소는 `docs/flow.md` 의 「로그인을 거치는 링크」 다.
- 작업 공간은 `web/src/components/Workspace.tsx` 다. 1024px 이상에서는 세 칸(`aside.pane-left` 검색, `section.pane-center` 그래프, `aside.pane-right` 상세), 미만에서는 `Tabs` 로 나누고 주소의 `pane`(`search`, `graph`, `detail`)이 고른 탭을 정한다. 탭 바꾸기는 `push({ pane })` 다.
- 가이드가 가리킬 요소: 검색 입력칸 `search-input`, 그래프 `graph-canvas`(`web/TESTIDS.md`). 상세의 `detail-panel` 은 항목을 골랐을 때만 그려지고(`components/DetailPanel.tsx`), 고르지 않았으면 `detail-empty` 다. 그래서 상세 단계는 늘 있는 칸에 새 testid 를 달아 가리킨다.
- CSP 는 `style-src 'self'` 다(`docs/code-architecture.md` 「보안 기본값」). 실행 중에 `<style>` 요소를 넣으면 막힌다. React 의 `style` prop(CSSOM)은 막히지 않는다.
- 웹 단위 테스트는 vitest 이고 실행 환경은 `node` 다(`web/vite.config.ts`). 전역 `localStorage` 가 없다. 저장소를 쓰는 함수는 `web/src/lib/links.ts` 처럼 `storage?: Storage | null` 인자를 받고, 테스트는 `web/src/lib/links.test.ts` 의 `fakeStorage()` 방식으로 넘긴다. 컴포넌트는 `react-dom/server` 로 정적 렌더링한다(`testSupport.tsx` 의 `withApp`).
- 브라우저 테스트의 로그인은 `web/e2e/support.ts` 의 `loginAs(page, user, expectResult, startPath)` 이고 모든 spec 이 이것으로 로그인한다. e2e 의 Neo4j 는 named volume 이라 실행 사이에 남는다. 그래서 `workbench.spec.ts` 는 사용자마다 `${suffix}`(`String(Date.now())`)를 붙여 만든다(`editorA` 등, 6줄과 33-36줄 부근). 사용자는 `0)` 테스트가 사용자 탭에서 `addUser(pageAdmin, user, role)` 로 더한다. 휴대폰 테스트(`mobile.spec.ts`)는 `admin` 으로만 로그인하고 사용자를 더하지 않는다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「첫 접속 가이드」(여는 때, 열람자의 둘러보기 표, 좁은 화면), `financial-workbench/docs/api-contract.md` 의 `CurrentUser` 와 `POST /api/auth/me/guide-done`, `financial-workbench/docs/code-architecture.md` 「웹 구조」 의 `web/src/components/guide/` 행과 「결정」 의 첫 접속 가이드 항목

## 의도 메모

- 라이브러리를 쓰지 않는다. 말풍선 라이브러리는 실행 중에 `<style>` 을 넣는 것이 많아 CSP 와 부딪히고, phase 03 이 만들기 폼과 맞물려야 한다(`code-architecture.md`).
- 가이드는 다른 동작을 막지 않는다. 화면을 덮는 막(overlay)을 두지 않고, 말풍선과 대상 요소의 강조만 둔다. 탭은 단계에 들어갈 때 한 번만 옮긴다.
- 기존 브라우저 테스트가 가이드에 가려지지 않게 `loginAs` 가 기본으로 가이드를 건너뛴다. 가이드를 확인하는 테스트만 가이드를 남긴다.
- 화면 이동은 한 곳(`GuideProvider`)에서만 한다. 말풍선과 Provider 가 따로 주소를 바꾸면 늦게 실행된 쪽이 다른 쪽의 결과를 덮는다.

## 작업 항목

### 1. 타입과 API

- `api/types.ts`: `CurrentUser` 에 `guideDoneAt: string | null` 을 더한다. 위 세 fixture 에 `guideDoneAt: null` 을 채운다.
- `api/client.ts`: `api.auth.guideDone: () => request<CurrentUser>('POST', '/api/auth/me/guide-done')` 를 더한다.

### 2. 순수 함수

새 파일 `web/src/lib/guide.ts`

- `type GuideKind = 'browse' | 'practice'`, `interface GuideStep { id: string; target: string | null; pane: 'search' | 'graph' | 'detail' | null; title: string; body: string }`.
- `BROWSE_STEPS: GuideStep[]`: 소개(`intro`, 대상 없음, 「투자 지식을 근거와 함께 쌓는 곳입니다. 화면을 세 단계로 둘러봅니다.」), `search`(`search-input`, pane `search`), `graph`(`graph-canvas`, pane `graph`), `detail`(`workspace-pane-detail`, pane `detail`). 세 단계의 제목과 본문은 `docs/flow.md` 「열람자의 둘러보기」 표다.
- `interface GuideProgress { userId: string; kind: GuideKind; step: number; startedAt: string; created: Record<string, string> }`(`created` 는 phase 03 이 쓴다).
- `readProgress(userId, storage?)`, `writeProgress(p, storage?)`, `clearProgress(storage?)`: 키 `workbench.guide`. `storage` 를 주지 않으면 `globalThis.localStorage ?? null` 이다. 읽기와 쓰기는 모두 `try/catch` 로 감싸 저장소를 쓸 수 없거나 값이 깨졌으면 `null` 과 무시로 끝낸다. 다른 사용자의 값이면 `null` 이다.
- `shouldAutoStart(user: CurrentUser): boolean` 은 `guideDoneAt === null` 이다. phase 03 이 진행 중인 연습 조건을 더한다.

### 3. 가이드 상태와 말풍선

새 폴더 `web/src/components/guide/`

- `GuideProvider.tsx`: props 로 `user: CurrentUser`, `onUserChange(user)`, `ontology: Ontology | null`(App 의 온톨로지 상태, 받기 전에는 `null`)을 받는다. context 로 `{ active, kind, step, steps, busy, message, start(kind), next(), finish(), skip() }` 를 내려 준다.
  - `App.tsx` 는 `auth.status === 'signed-in'` 일 때만 `GuideProvider` 로 머리글과 `<main>` 을 함께 감싼다. 탭 단위 `ErrorBoundary` 바깥이라 탭을 옮겨도 가이드가 남는다. 로그아웃이나 세션 만료로 로그인 화면이 되면 Provider 가 사라지며 가이드도 닫힌다(진행 상태는 저장소에 남는다).
  - 단계를 바꿀 때마다 `writeProgress` 한다. 단계에 들어갈 때 좁은 화면(`useMediaQuery('(min-width: 1024px)')` 가 거짓)이고 그 단계의 `pane` 이 있으면, 지금 주소의 query 를 유지한 채 `pane` 만 바꾼 주소로 `replace` 한다. 들어갈 때 한 번만 한다.
  - `finish()` 와 `skip()` 은 `busy` 를 켜고 진행 상태를 지운 뒤 `api.auth.guideDone()` 을 기다린다. 성공하면 받은 `CurrentUser` 로 `onUserChange` 를 부르고 가이드를 닫는다. 실패하면 가이드를 닫되 머리글 아래 `Alert`(testid `guide-message`)로 「가이드를 끝냈다는 기록을 남기지 못했습니다. 다음 로그인 때 다시 열릴 수 있습니다.」 를 보이고, 이 세션에서는 다시 자동으로 열지 않는다.
- `GuideBubble.tsx`(testid `guide-bubble`, `data-step` 에 단계 id): 제목, 본문, 「n / 전체」, 단추. 소개는 「시작」(`guide-start`)과 「건너뛰기」(`guide-skip`), 중간 단계는 「다음」(`guide-next`)과 「건너뛰기」, 마지막 단계는 「끝내기」(`guide-finish`)다. `busy` 동안 단추는 꺼진다.
  - 넓은 화면에서는 대상 요소 옆에 둔다. `document.querySelector('[data-testid="<target>"]')` 의 `getBoundingClientRect()` 로 위치를 구해 `style={{ top, left }}`(`position: fixed`)로 둔다. 대상이 아직 없으면 300ms 마다 최대 5초 다시 찾고, 창 크기 변경과 스크롤에 다시 계산한다. 끝내 없거나 화면 밖이면 아래쪽 카드로 둔다.
  - 좁은 화면이거나 대상이 없으면 화면 아래쪽 카드(`position: fixed`, 좌우 16px, 높이 최대 40vh, 내부 스크롤)다. 카드가 열린 동안 `.app-main` 아래에 카드 높이만큼 여백을 둔다(`flow.md` 「좁은 화면」). 페이지에 가로 스크롤을 만들지 않는다.
  - 대상 요소에는 강조 class `guide-target`(`styles.css` 에 테두리와 그림자)을 effect 로 붙이고, 단계가 바뀌거나 닫힐 때 뗀다. React 가 다시 그리며 class 를 지울 수 있으므로 위 다시 찾기와 같은 주기로 확인해 다시 붙인다.
  - `role="dialog"`, `aria-modal="false"`, 제목에 `aria-labelledby` 를 단다. `Escape` 는 초점이 말풍선 안에 있을 때만 「건너뛰기」 로 받는다. 만들기 폼에서 누른 `Escape` 가 가이드를 끝내지 않게 하려는 것이다.
- `Workspace.tsx`: 넓은 화면의 `aside.pane-right` 와 좁은 화면의 상세 `TabsContent` 에 `data-testid="workspace-pane-detail"` 을 단다.

### 4. 여는 때와 사용법 단추

- 자동 시작: `GuideProvider` 가 `shouldAutoStart(user)` 이고 지금 탭이 작업 공간이며 `ontology` 가 `null` 이 아닐 때 연다. 다른 탭의 링크로 들어왔으면 그 화면을 그대로 두고, 이 세션에서 처음 작업 공간에 들어올 때 연다(`flow.md` 「첫 접속 가이드」 첫 문단).
- 머리글의 `current-user-name` 앞에 「사용법」(`guide-open`, `Button variant="link"`)을 둔다. 누르면 작업 공간이 아니면 `/workspace` 로 `push` 한 뒤 가이드를 처음부터 연다. 열린 가이드가 있으면 그것을 닫고 다시 연다(phase 03 이 진행 중인 연습을 먼저 묻게 바꾼다).
- 이 phase 에서는 모든 역할이 `browse` 를 연다.

### 5. 브라우저 테스트 도우미와 문서

- `web/e2e/support.ts` 의 `loginAs` 에 다섯째 인자 `options: { guide?: 'skip' | 'keep' } = {}` 를 더한다. 로그인에 성공한 뒤 `guide` 가 `'keep'` 이 아니면, `guide-bubble` 이 3초 안에 보이면 `guide-skip` 을 누르고 `guide-bubble` 이 사라질 때까지 기다린다. 기존 호출부는 고치지 않아도 된다. 로그인 뒤 새로고침하는 테스트는 기록이 남은 뒤라 다시 열리지 않는다.
- `web/e2e/workbench.spec.ts` 에 `editorA` 와 같은 형식으로 `guideViewer`(`guide-viewer-${suffix}@example.com`, VIEWER)와 `guideEditor`(`guide-editor-${suffix}@example.com`, EDITOR)를 더하고, `0)` 이 이 둘도 `addUser` 로 더한다.
- `web/TESTIDS.md` 에 이 phase 의 testid(`guide-bubble`, `guide-start`, `guide-next`, `guide-finish`, `guide-skip`, `guide-open`, `guide-message`, `workspace-pane-detail`)와 강조 class `guide-target` 을 적는다.

### 6. 이 phase 를 검증하는 테스트

- 새 파일 `web/src/lib/guide.test.ts`: `BROWSE_STEPS` 의 대상이 `null`, `search-input`, `graph-canvas`, `workspace-pane-detail` 순서다. `fakeStorage()` 에 `writeProgress` 한 뒤 같은 사용자의 `readProgress` 가 같은 값이고 다른 사용자는 `null` 이다. 깨진 JSON 이면 `null` 이다. `getItem` 이 예외를 던지는 저장소면 `readProgress` 가 `null`, `writeProgress` 가 조용히 끝난다. `storage` 를 `null` 로 주면 둘 다 아무것도 하지 않는다. `shouldAutoStart` 가 `guideDoneAt` 이 `null` 일 때만 참이다.
- 새 파일 `web/src/components/guide/guide.test.tsx`(정적 렌더링): 소개 단계의 `GuideBubble` 이 `guide-start`, `guide-skip`, `role="dialog"` 를 담는다. 중간 단계는 `guide-next` 를, 마지막 단계는 `guide-finish` 를 담고 `guide-next` 가 없다. `busy` 면 단추에 `disabled` 가 있다.
- `web/e2e/workbench.spec.ts` 의 `8)` 뒤에 `10) 열람자는 처음 로그인하면 둘러보기 가이드가 열리고, 끝내면 다시 열리지 않으며 「사용법」 으로 다시 본다` 를 더한다. 새 컨텍스트로 `loginAs(page, guideViewer, 'success', '/', { guide: 'keep' })` → `guide-bubble` 의 `data-step` 이 `intro` → `guide-start` → 세 단계를 `guide-next` 로 넘기며 각 단계에서 대상 요소(`search-input`, `graph-canvas`, `workspace-pane-detail`)에 `guide-target` class 가 있는지 본다 → `guide-finish` → `guide-bubble` 이 사라진다 → `/api/auth/me` 의 `guideDoneAt` 이 채워질 때까지 기다린 뒤 새로고침해도 열리지 않는다 → `guide-open` 을 누르면 `intro` 가 다시 열린다 → `guide-skip`. `shot(page, '10-guide-browse')` 를 `graph` 단계에서 찍는다.
- `web/e2e/mobile.spec.ts` 에 `휴대폰 폭에서 사용법 가이드가 아래쪽 카드로 열리고 단계마다 탭을 옮긴다` 를 더한다. `loginAs(page, admin)` → `workspace-tab-detail` 을 눌러 상세 탭에서 시작 → `guide-open` → `guide-start` → `search` 단계에서 `workspace-tab-search` 의 `aria-selected` 가 `true` → `guide-next` → `workspace-tab-graph` 가 `true` → `guide-next` → `workspace-tab-detail` 이 `true` → `expectNoHorizontalOverflow(page)` → `guide-skip`. `shot(page, 'm-guide')`. 이 테스트는 phase 03 이 관리자를 따라하기로 바꿀 때 함께 고친다.

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
| `financial-workbench/web/src/components/Workspace.tsx` | 수정 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/src/components/ontology/ontology.test.tsx` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/styles.css` | 수정 |
| `financial-workbench/web/e2e/support.ts` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
