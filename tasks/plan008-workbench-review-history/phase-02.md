# Phase 02. 검토 대기 두 구역과 링크로 항목 열기

**Execution profile**: standard

## 목표

편집자의 검토 대기 탭을 「내가 검토할 주장」 과 「내가 쓰거나 고친 주장」 두 구역으로 나눈다.
`/?node=<id>` 링크로 항목 상세를 열고, 로그인 전이면 로그인한 뒤 연다. 상세와 검토 대기에 「링크 복사」 를 둔다.
주장 상세의 검토 칸은 작성자와 마지막 내용 수정자에게 같은 안내와 「링크 복사」 를 보인다.

**범위 외**: 변경 이력 탭은 phase 03 이다. 이 phase 는 `ChangesTab.tsx` 를 고치지 않는다.

## 컨텍스트

- 서버 계약(앞 phase 결과): `GET /api/claims` 에 `scope=reviewable|mine` 이 있다. `ClaimView` 에 `contentUpdatedBy: UserRef | null` 이 있다. 뜻은 `financial-workbench/docs/api-contract.md` 의 Claim 표다.
- 웹 클라이언트 `financial-workbench/web/src/api/client.ts` 의 `claims.list(p)` 는 `{ reviewStatus, includeArchived, page, size }` 를 `buildQuery` 로 붙인다. 계약 타입은 `financial-workbench/web/src/api/types.ts` 의 `ClaimView` 다.
- 검토 대기 탭은 `financial-workbench/web/src/components/ReviewTab.tsx` 다.
  - `ReviewRow` 는 `own = claim.createdBy?.id === user.id`, `blocked = own || !canEdit` 로 버튼을 끄고 `review-own-hint`, `review-viewer-hint` 를 보인다.
  - `ReviewTab` 은 `api.claims.list({ reviewStatus: 'DRAFT', page, size: 20 })` 한 목록을 `review-table` 에 그리고, 비면 `review-empty`, 쪽 넘기기는 `Pager`(`review-pager`)다. 처리 결과는 `review-message`, 오류는 `review-error` 다.
- 주장 상세의 검토 칸은 `financial-workbench/web/src/components/ClaimEditor.tsx` 의 `ReviewControls` 다. `own = claim.createdBy?.id === user.id`, `disabled = busy || own || claim.archived` 이고, `own` 이면 `self-review-hint` 에 「본인이 작성한 주장은 다른 사용자가 검토해야 합니다.」 를 보인다.
- 앱 시작은 `financial-workbench/web/src/App.tsx` 다. 처음 `api.auth.me()` 가 성공하면 `window.history.replaceState(null, '', window.location.pathname)` 로 주소의 query 를 지운다(`?login=denied` 흔적 처리). 로그인 뒤 `api.ontology()` 를 읽고, `openNode(id)` 가 그 노드를 그래프 중심과 상세로 열고 작업 공간 탭으로 간다. 로그인 단추는 `LoginView` 의 `api.auth.startGoogleLogin()` 이고, 로그인을 마치면 서버가 `/` 로 돌려보낸다.
- 상세 패널 `financial-workbench/web/src/components/DetailPanel.tsx` 의 `div.row.actions` 에 「이 항목의 변경 이력」(`node-history-link`), 「그래프 중심으로」(`node-center-graph`), 보관 사유와 보관 단추가 있다. 노드를 읽지 못하면 `detail-error` 를 보인다.
- 브라우저 저장소는 막혀 있거나 비어 있을 수 있다. 읽기와 쓰기를 모두 `try/catch` 로 감싼다.
- 컴포넌트 테스트는 `renderToStaticMarkup` 로 정적 HTML 만 본다(`financial-workbench/web/src/components/tabs.test.tsx` 의 「ReviewTab 은 첫 렌더에…」, 「ReviewRow 는…」). 테스트 온톨로지와 감싸기는 `financial-workbench/web/src/components/testSupport.tsx` 의 `testOntology`, `withApp(children)` 이다. `withApp` 의 사용자는 `role: 'EDITOR'`, `id: 'u1'` 이다.
- 브라우저 테스트 `financial-workbench/web/e2e/workbench.spec.ts` 의 `3)` 은 B 가 `review-table` 에서 `review-row`(`hasText: data.supplier`)를 찾아 `review-row-note`, `review-row-approve` 로 검토 완료한다. `7)` 은 열람자가 `review-table` 의 `review-row-approve` 가 꺼져 있는지 본다. 로그인 도우미는 `financial-workbench/web/e2e/support.ts` 의 `loginAs(page, user, expectResult)` 이고 처음에 `page.goto('/')` 를 한다.
- `financial-workbench/web/TESTIDS.md` 의 「검토 대기 탭」 과 「작업 공간: 오른쪽 상세」 절에 testid 가 있다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「링크로 항목 열기」, 「검토 대기 화면」 절, `financial-workbench/docs/code-architecture.md` 「결정」 의 링크 항목, `financial-workbench/docs/prd.md` 의 「만드는 것」 과 「남은 한계」

## 의도 메모

- 화면 경로(router)를 들이지 않는다. 링크 하나를 위해 탭과 상세 상태를 모두 주소로 옮기는 비용이 크다.
- 열람자에게는 구역을 나누지 않는다. 열람자는 검토하지 않으므로 「내가 검토할」 이 뜻이 없다. `scope` 없이 지금처럼 한 목록이다.
- 「링크 복사」 는 클립보드가 막혀도 동작해야 한다. 실패하면 주소를 읽기 전용 입력칸에 보여 직접 복사하게 한다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. 계약 타입과 클라이언트

- `types.ts` 의 `ClaimView` 에 `/** 마지막으로 내용을 고친 사람. 이 사람과 작성자는 검토할 수 없다 */ contentUpdatedBy: UserRef | null` 을 더한다. 테스트 fixture 가 `ClaimView` 를 직접 만들면 그 값을 채운다(`git grep -n "reviewedBy:" -- financial-workbench/web/src` 로 찾는다).
- `client.ts` 의 `claims.list` 인자에 `scope?: 'reviewable' | 'mine'` 를 더해 쿼리에 붙인다.

### 2. 링크 함수 `financial-workbench/web/src/lib/links.ts` 신규

```ts
/** 항목 상세를 여는 주소. origin 은 화면이 쓰는 주소다 */
export function nodeLink(id: string, origin: string): string
/** 주소의 query 에서 node 값을 꺼낸다. 없거나 비면 null */
export function nodeFromSearch(search: string): string | null
/** 로그인을 건너도 남도록 탭 저장소에 둔다. 저장소를 쓸 수 없으면 아무것도 하지 않는다 */
export function rememberPendingNode(id: string, storage?: Storage | null): void
/** 둔 값을 꺼내고 지운다. 없거나 저장소를 쓸 수 없으면 null */
export function takePendingNode(storage?: Storage | null): string | null
```

- 키는 `workbench.pendingNode` 다. `storage` 기본값은 `globalThis.sessionStorage` 이고, 접근 자체가 예외를 낼 수 있으므로 기본값을 읽는 것도 `try` 안에서 한다.
- `nodeLink` 는 `${origin}/?node=${encodeURIComponent(id)}` 다.

### 3. `App.tsx` 의 링크 열기

- 첫 `useEffect`(인증 확인) 맨 앞에서 `nodeFromSearch(window.location.search)` 가 있으면 `rememberPendingNode(id)` 한다. `me()` 성공 뒤 query 를 지우는 지금 코드는 그대로 둔다.
- 온톨로지를 받은 뒤(`ontology` 가 생긴 뒤) 한 번 `takePendingNode()` 를 불러 값이 있으면 `openNode(id)` 한다. 같은 렌더에서 두 번 열지 않게 `useEffect` 의 의존성을 `[ontology, openNode]` 로 두고, 꺼낸 값은 지워지므로 다시 열리지 않는다.
- 로그아웃은 저장소를 건드리지 않는다.

### 4. 「링크 복사」 부품 `financial-workbench/web/src/components/CopyLinkButton.tsx` 신규

```tsx
interface Props {
  nodeId: string
  /** data-testid. 결과는 `${testId}`, `${testId}-done`, `${testId}-fallback` */
  testId: string
  label?: string // 기본 「링크 복사」
}
```

- 누르면 `navigator.clipboard.writeText(nodeLink(nodeId, window.location.origin))` 를 부른다. 성공하면 단추 옆에 `span[data-testid="${testId}-done"]` 「링크를 복사했습니다」 를 보인다. `navigator.clipboard` 가 없거나 실패하면 `input[readonly][data-testid="${testId}-fallback"]` 에 주소를 넣어 보이고 그 칸을 선택한다.
- 단추는 shadcn `Button`(`type="button"`, `variant="link"`)이다. 폼 안에 들어가도 제출하지 않는다.

### 5. 상세와 검토 칸

- `DetailPanel` 의 `div.row.actions` 에서 「그래프 중심으로」 다음에 `<CopyLinkButton nodeId={node.id} testId="node-copy-link" />` 를 둔다. 열람자에게도 보인다.
- `ClaimEditor.tsx` 의 `ReviewControls` 에서 `own` 을 `claim.createdBy?.id === user.id || claim.contentUpdatedBy?.id === user.id` 로 바꾼다. 안내 문구를 「내가 쓰거나 마지막으로 고친 주장은 다른 편집자가 검토합니다. 링크를 복사해 검토를 요청하세요.」 로 바꾸고, 같은 상자 안에 `<CopyLinkButton nodeId={claim.id} testId="self-review-copy-link" />` 를 둔다. testid `self-review-hint` 는 그대로다.

### 6. `ReviewTab.tsx` 두 구역

- `ReviewRow` 의 `own` 도 `contentUpdatedBy` 를 함께 본다. 안내 문구는 5번과 같다.
- 목록 하나를 그리는 부분을 `ReviewSection` 으로 뽑는다. props 는 `scope?: 'reviewable' | 'mine'`, `title: string`, `testIdPrefix: string`, `emptyText: string`, `refreshKey: number`, `onOpen`, `onDone(message)`, `onError(e)` 정도다. 구역마다 쪽 번호와 목록을 따로 들고, `refreshKey` 가 바뀌면 다시 읽는다.
- 편집자(`canEdit`)이면 두 구역을 위아래로 그린다.

  | 구역 | 제목 | `scope` | testid 접두사 | 빈 안내 |
  | --- | --- | --- | --- | --- |
  | 1 | 내가 검토할 주장 | `reviewable` | `review` | 검토를 기다리는 주장이 없습니다. |
  | 2 | 내가 쓰거나 고친 주장 | `mine` | `review-mine` | 내가 쓰고 아직 검토되지 않은 주장이 없습니다. |

  구역 1 의 testid 는 지금과 같다(`review-table`, `review-row`, `review-empty`, `review-pager`). 구역 2 는 `review-mine-table`, `review-mine-row`, `review-mine-empty`, `review-mine-pager` 다. 각 구역을 `section[data-testid="review-section-reviewable"]`, `section[data-testid="review-section-mine"]` 로 감싼다.
- 구역 2 의 행은 `ReviewRow` 를 쓰지 않고 `ReviewMineRow` 로 그린다. 칸은 구역 1 과 같고, 마지막 칸에 「다른 편집자가 검토합니다.」 와 `<CopyLinkButton nodeId={claim.id} testId="review-mine-copy-link" />` 를 둔다. 검토 단추와 메모 칸은 없다.
- 열람자이면 구역을 나누지 않고 지금처럼 `scope` 없이 한 목록(`review-table`)을 그린다. 제목은 「검토 대기」 그대로다.
- 한 구역에서 처리하면(`onDone`) 두 구역을 모두 다시 읽는다. 처리한 주장이 다른 구역으로 옮겨 가는 경우는 없지만 새로고침 단추와 같은 동작으로 맞춘다. 「새로고침」(`review-refresh`)도 두 구역을 다시 읽는다.

### 7. `financial-workbench/web/TESTIDS.md`

- 「검토 대기 탭」 표에 `review-section-reviewable`, `review-section-mine`, `review-mine-table`, `review-mine-row` *, `review-mine-empty`, `review-mine-pager-*`, `review-mine-copy-link`(와 `-done`, `-fallback`)을 더하고, 열람자에게는 구역이 없다고 적는다.
- 「작업 공간: 오른쪽 상세」 에 `node-copy-link`(와 `-done`, `-fallback`), 「Claim 카드와 Claim 노드 상세」 에 `self-review-copy-link` 를 더한다.

### 8. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/lib/links.test.ts` 신규
  - `nodeLink('a b', 'https://x.io')` 가 `https://x.io/?node=a%20b` 다. `nodeFromSearch('?node=abc&x=1')` 이 `abc`, `nodeFromSearch('?login=denied')` 와 `nodeFromSearch('?node=')` 이 `null` 이다.
  - 가짜 `Storage`(Map 으로 만든 객체)로 `rememberPendingNode('n1', s)` 뒤 `takePendingNode(s)` 가 `n1`, 다시 부르면 `null` 이다.
  - `getItem` 이 예외를 던지는 저장소로 `takePendingNode` 가 `null` 이고, `setItem` 이 예외를 던져도 `rememberPendingNode` 가 예외를 내지 않는다.
- `financial-workbench/web/src/components/tabs.test.tsx`
  - 「ReviewTab 은…」 테스트를 고친다. 편집자 렌더에 `review-section-reviewable` 과 `review-section-mine` 이 있다. 열람자(`withApp` 에 VIEWER 사용자를 넘길 수 있게 `testSupport.tsx` 의 `withApp` 에 선택 인자 `user` 를 더한다)이면 두 구역 testid 가 없고 `review-table` 이 있다.
  - 「ReviewRow 는…」 옆에 테스트를 더한다. `contentUpdatedBy.id` 가 `u1` 인 주장을 `ReviewRow` 로 그리면 `review-own-hint` 가 있고 승인 단추가 `disabled` 다.
- `financial-workbench/web/src/components/screens.test.tsx` 에 `CopyLinkButton` 정적 렌더 테스트를 더한다. `data-testid="x-link"` 단추가 있고 `-done`, `-fallback` 은 없다.
- `financial-workbench/web/e2e/support.ts` 의 `loginAs` 에 선택 인자 `startPath = '/'` 를 더해 `page.goto(startPath)` 로 시작하게 한다. 기존 호출은 그대로 통한다.
- `financial-workbench/web/e2e/workbench.spec.ts`
  - `3)` 의 B 검토 앞에서 A(`pageA`)가 `tab-review` 를 열면 `review-section-mine` 안의 `review-mine-row` 가운데 `data.supplier` 를 담은 행이 있고, `review-section-reviewable` 안에는 그 행이 없다. 그 행의 `review-mine-copy-link` 를 누르면 `review-mine-copy-link-done` 이나 `review-mine-copy-link-fallback` 가운데 하나가 보인다(`locator.or`). `shot(pageA, '03-review-mine-a')` 를 남긴다.
  - 같은 테스트에서 B 의 `review-section-reviewable` 에 그 행이 있다(기존 단언의 범위를 그 구역으로 좁힌다).
  - `3b) 링크로 들어오면 로그인한 뒤 그 주장의 상세가 열린다` 를 더한다. 새 context 의 페이지로 `loginAs(page, editorB, 'success', \`/?node=${주장 id}\`)` 를 하고 `detail-label` 이 `${data.supplier} → ${data.customer} 공급한다` 다. 주장 id 는 A 의 상세 `detail-panel` 의 `data-node-id` 로 앞 테스트에서 적어 둔다. 끝나면 그 context 를 닫는다. 주소창에 `?node=` 가 남지 않는다(`page.url()` 에 `node=` 가 없다).
  - `7)` 의 열람자 단언은 그대로 통해야 한다. 열람자는 구역이 없다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/links.test.ts src/components/tabs.test.tsx src/components/screens.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
grep -q 'review-mine-copy-link' financial-workbench/web/TESTIDS.md
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan008 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan008 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 두 project 가 모두 통과해야 한다.
- `03-review-mine-a.png` 에서 두 구역 제목이 보이고, 「내가 쓰거나 고친 주장」 의 행에 「링크 복사」 가 보이는지, 이름이 잘리지 않는지 눈으로 본다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/lib/links.ts` | 신규 |
| `financial-workbench/web/src/lib/links.test.ts` | 신규 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/CopyLinkButton.tsx` | 신규 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/ClaimEditor.tsx` | 수정 |
| `financial-workbench/web/src/components/ReviewTab.tsx` | 수정 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 수정 |
| `financial-workbench/web/src/components/screens.test.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
| `financial-workbench/web/e2e/support.ts` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
