# Phase 01. 화면 경로, 상단 탭 경로, 링크와 로그인 복귀

**Execution profile**: standard

## 목표

서버가 화면 경로의 GET 을 `index.html` 로 돌려주게 하고, 웹에 React Router 를 들여 상단 탭을 경로(`/workspace`, `/list`, `/review`, `/changes`, `/ontology`, `/users`)로 바꾼다.
항목 열기는 `/workspace?node=<id>&pane=detail` 로, 「이 항목의 변경 이력」 은 `/changes?target=<id>` 로 주소를 쌓아 이동한다.
로그인을 거치는 링크는 보던 경로와 query 를 탭 저장소에 두었다가 로그인 뒤 연다. 옛 `/?node=<id>` 링크도 연다.
주소의 query 를 읽고 쓰는 순수 함수를 모두 이 phase 에서 만든다. 다음 두 phase 가 그 함수로 각 화면의 상태를 주소로 옮긴다.

**범위 외**: 작업 공간 안의 `pane`, 검색 조건, 홉 수, 「주장을 따로 보기」 는 phase 02 다. 목록, 검토 대기, 변경 이력의 query 는 phase 03 이다. 이 phase 에서 `Workspace.tsx`, `ListTab.tsx`, `ReviewTab.tsx` 의 내부 상태는 그대로 둔다. `ChangesTab.tsx` 는 고치지 않고, App 이 `targetId` 를 주소에서 읽어 넘긴다.

## 컨텍스트

- 결정과 경로, query 이름은 `financial-workbench/docs/adr/007-routes-in-url.md` 와 `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」 절(표 셋)이 소유한다. 이 phase 의 코드는 그 표를 그대로 따른다.
- 서버
  - 정적 파일은 `container` 프로필에서 `spring.web.resources.static-locations: file:/app/static/`(`financial-workbench/api/src/main/resources/application.yaml`)다. 그 밖의 프로필은 Spring 기본 위치(`classpath:/static/` 등)다. 지금 `/` 는 정적 `index.html` 로 열린다.
  - 정적 파일이 없는 경로는 `web/GlobalExceptionHandler.kt` 가 `NoResourceFoundException` 을 받아 `404` 와 `{"code":"NOT_FOUND"}` 로 답한다. 익명 `GET /api/**` 는 그 전에 `SecurityConfig` 의 `hasRole("VIEWER")` 에 막혀 `401 UNAUTHENTICATED` 다.
  - `config/SecurityConfig.kt` 는 `/api/**` 밖의 요청을 `anyRequest().permitAll()` 로 열고, Google 로그인을 마치면 `.defaultSuccessUrl("/", true)` 로 `/` 에 돌려보낸다.
  - 통합 테스트(`support/IntegrationTest.kt`)는 `mockoidc` 프로필이라 `container` 의 정적 위치를 쓰지 않는다. `financial-workbench/api/src/test/resources/` 는 아직 없다.
- 웹
  - `financial-workbench/web/package.json` 의 의존에 router 가 없다. React 19.3.1, Node 빌드 이미지 24.15 다. 쓸 버전은 `react-router@8.4.0`(2026-09-15)이다. 8.5.0 은 2026-10-19 에 나와 두 주가 지나지 않았다. 8 은 React 19.2.7 이상, Node 22.22 이상을 요구한다. 단순 모드(`BrowserRouter`, `Routes`, `useNavigate`, `useLocation`, `useSearchParams`)만 쓴다. 데이터 모드와 파일 기반 경로는 쓰지 않는다. API 를 쓰기 전에 그 버전의 문서나 `node_modules/react-router` 의 타입 정의로 이름을 확인한다.
  - `financial-workbench/web/src/main.tsx` 는 `<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>` 를 그린다.
  - `financial-workbench/web/src/App.tsx`
    - 상단 탭은 `TABS`(`workspace`, `list`, `review`, `changes`, `ontology`, `users`)와 `const [tab, setTab] = useState<TabKey>('workspace')` 이고, 탭 단추(`data-testid="tab-<key>"`)가 `setTab(key)` 한다. `users` 는 ADMIN 에게만 보이고, 보이지 않는 탭이면 `activeTab` 이 `workspace` 로 바뀐다.
    - `centerId`, `selectedId`, `focusSeq`, `changesTargetId` 를 상태로 들고, `focusNode(id)`(중심과 상세를 함께 바꾸고 `focusSeq` 를 올림), `openNode(id)`(`focusNode` 뒤 `setTab('workspace')`), `openHistory(id)`(`setChangesTargetId(id)` 뒤 `setTab('changes')`)가 있다. `Workspace` 에는 `onFocus={focusNode}`, `onSelect={setSelectedId}` 를 넘긴다.
    - 링크: 첫 `useEffect` 에서 `nodeFromSearch(window.location.search)` 를 `rememberPendingNode` 로 두고, `api.auth.me()` 성공 콜백에서 `takePendingNode()` 를 `pendingNodeRef` 에 옮긴 뒤 `window.history.replaceState(null, '', window.location.pathname)` 로 query 를 지운다. 온톨로지를 받는 `api.ontology().then` 콜백에서 `focusNode(id)`, `setTab('workspace')` 를 함께 부른다.
    - `api.auth.me()` 가 실패하면 `LoginView` 를 그린다. `/?login=denied` 는 `readLoginDenied()` 가 읽는다.
  - `financial-workbench/web/src/lib/links.ts` 의 `nodeLink(id, origin)` 은 `${origin}/?node=<id>` 이고, `rememberPendingNode`, `takePendingNode` 는 키 `workbench.pendingNode` 로 `sessionStorage` 를 쓴다. `CopyLinkButton.tsx` 가 `nodeLink` 를 쓴다.
  - Vite 개발 서버는 모르는 경로에 `index.html` 을 돌려준다(`appType` 기본값 `spa`). 개발 중에는 서버 설정이 필요 없다.
- 브라우저 테스트
  - `financial-workbench/web/e2e/support.ts` 의 `loginAs(page, user, expectResult, startPath = '/')` 는 `page.goto(startPath)` 뒤 로그인하고 `search-input` 이 보일 때까지 기다린다.
  - `financial-workbench/web/e2e/workbench.spec.ts` 의 `3b)` 는 `/?node=${supplyClaimId}` 로 로그인한 뒤 그 주장의 상세가 열리는지 본다. `financial-workbench/web/e2e/mobile.spec.ts` 끝 단계는 `page.goto('/?node=' + id)` 뒤 `workspace-tab-detail` 이 골라져 있고 `expect(page).not.toHaveURL(/node=/)` 다. 이 단언은 새 주소 체계에서 바뀐다.

**근거 문서**: `financial-workbench/docs/adr/007-routes-in-url.md`, `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」, 「로그인을 거치는 링크」 절, `financial-workbench/docs/code-architecture.md` 의 「API 패키지」 표(`SpaRouteController`)와 「웹 구조」 표(`web/src/routes.ts`)

## 의도 메모

- 서버의 화면 경로는 목록으로 둔다. 모든 경로를 `index.html` 로 넘기면 `/api/없는경로` 같은 잘못된 요청도 화면이 받아 JSON 오류가 사라진다.
- 로그인 복귀는 서버의 `defaultSuccessUrl` 을 바꾸지 않고 화면이 한다. OAuth 의 `state` 에 주소를 싣는 안은 Spring Security 설정을 크게 바꾼다.
- 탭 이동은 그 탭에서 마지막으로 보던 주소로 간다. 탭을 옮겼다 돌아오면 검색 조건이 남는다. 기억은 화면 메모리에만 두고 새로고침하면 사라진다.

## Blocked 조건

- `npm ci` 가 `react-router@8.4.0` 을 받지 못하면 `PHASE_BLOCKED: react-router 를 받을 수 없음` 을 출력하고 멈춘다. 다른 버전으로 바꾸지 않는다.
- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. 서버 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` 신규

```kotlin
/** 화면 경로의 GET 을 index.html 로 넘긴다. 경로 목록은 docs/flow.md 「주소와 뒤로가기」 의 표와 같다 */
@Controller
class SpaRouteController {
    @GetMapping("/workspace", "/list", "/review", "/changes", "/ontology", "/users")
    fun route(): String = "forward:/index.html"
}
```

- 목록 밖 경로와 `/api/**` 는 지금처럼 답한다(404 는 `GlobalExceptionHandler`, 익명 `/api/**` 는 401).
- 테스트용 정적 파일 `financial-workbench/api/src/test/resources/static/index.html` 을 만든다. 내용은 `<!doctype html><title>workbench-test-index</title>` 한 줄이다. 다른 통합 테스트가 `/` 의 응답 본문을 단언하는지 `git grep -n '"/"' -- financial-workbench/api/src/test` 로 확인하고, 있으면 함께 고친다.
- 테스트 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` 신규(`IntegrationTest` 상속, 로그인 없이 `anonymous()`):
  - `support/ApiClient` 는 JSON 본문만 읽고 `Accept: application/json` 을 보내므로, 화면 경로는 처음부터 `java.net.http.HttpClient` 로 직접 부른다(`Accept: text/html`).
  - 익명 `GET /changes?target=x` 와 `GET /users` 가 `200` 이고 본문에 `workbench-test-index` 가 있다.
  - 익명 `GET /nope` 은 `404` 이고 `code` 가 `NOT_FOUND` 다.
  - `loggedIn(VIEWER)` 의 `GET /api/nope` 은 `404`, `NOT_FOUND` 다. 익명 `GET /api/nope` 은 `401` 이다.

### 2. 의존과 시작점

- `financial-workbench/web` 에서 `npm install --save-exact react-router@8.4.0` 로 `package.json` 과 `package-lock.json` 을 고친다.
- `main.tsx` 에서 `<App />` 을 `<BrowserRouter useTransitions={false}>` 로 감싼다(`ErrorBoundary` 안쪽). 8.4.0 의 `BrowserRouter` 는 이 prop 이 `false` 가 아니면 주소 갱신을 `React.startTransition` 으로 감싼다(`dist/production/lib/dom/lib.js`). 그러면 `navigate` 와 같은 콜백에서 바꾼 일반 상태(예: 노드를 만든 뒤의 `setFlash`)가 옛 주소로 먼저 그려져, `Workspace` 의 「다른 노드를 고르면 안내를 지운다」 effect 가 성공 안내를 지운다. 주소 갱신과 상태 변경을 한 번에 그리려고 끈다. `MemoryRouter` 에도 같은 prop 이 있으면 테스트에서도 끈다.
- 컴포넌트 테스트(`renderToStaticMarkup`)가 `useNavigate` 같은 router 훅을 쓰는 부품을 그리면 router 밖이라 실패한다. `financial-workbench/web/src/components/testSupport.tsx` 의 `withApp(children, ontology = testOntology, user = editor)` 를 `withApp(children, ontology = testOntology, user = editor, initialPath = '/workspace')` 로 바꾸고 `<MemoryRouter initialEntries={[initialPath]}>` 로 함께 감싼다.

### 3. 순수 함수 `financial-workbench/web/src/routes.ts` 신규

```ts
export type TabKey = 'workspace' | 'list' | 'review' | 'changes' | 'ontology' | 'users'
export const TAB_PATHS: Record<TabKey, string> // '/workspace' 등
/** 경로의 탭. 모르는 경로면 null */
export function tabOfPath(pathname: string): TabKey | null

export interface WorkspaceQuery { node: string | null; center: string | null; pane: 'search' | 'graph' | 'detail' | null; q: string; types: string[] | null; status: string; archived: boolean; hops: number; claimsAsNodes: boolean }
export function parseWorkspaceQuery(search: string): WorkspaceQuery
/** 기본값(빈 q, null types, 빈 status, false, hops 1, false)은 쓰지 않는다. 키 순서는 표 순서다 */
export function workspaceSearch(q: WorkspaceQuery): string // '' 또는 '?node=…'

export interface ListQuery { type: string; q: string; archived: boolean; page: number }
export function parseListQuery(search: string): ListQuery
export function listSearch(q: ListQuery): string
export interface ReviewQuery { page: number; minePage: number }
export function parseReviewQuery(search: string): ReviewQuery
export function reviewSearch(q: ReviewQuery): string
export interface ChangesQuery { target: string; actor: string; page: number }
export function parseChangesQuery(search: string): ChangesQuery
export function changesSearch(q: ChangesQuery): string

/** 옛 /?node=<id> 를 새 주소로. 해당 없으면 null */
export function legacyRedirect(pathname: string, search: string): string | null // '/workspace?node=<id>&pane=detail'
/** 로그인 뒤 돌아갈 주소로 받아도 되는가. TAB_PATHS 의 경로로 시작하고 '//' 나 'http' 로 시작하지 않아야 한다 */
export function isSafeReturnTo(path: string): boolean
```

- query 이름과 기본값은 flow.md 의 표 그대로다. `types` 는 쉼표로 잇고, 비거나 없으면 `null`(전체)이다. `hops` 는 1 이나 2 만 받는다(화면 선택지와 서버 `workbench.graph.max-hops` 가 2 다). `page`, `minePage` 는 0 이상의 정수만 받는다. 그 밖의 값은 기본값으로 읽는다. 모르는 `pane` 값은 `null` 이다.
- query 문자열은 `URLSearchParams.toString()`(공백을 `+` 로 바꾼다)이 아니라 키마다 `encodeURIComponent` 로 만든다. 공백은 `%20` 이다. 읽을 때는 `URLSearchParams` 로 읽는다.
- `isSafeReturnTo` 는 `?` 앞의 경로 부분이 `TAB_PATHS` 의 값 가운데 하나와 정확히 같을 때만 참이다.
- `routes.ts` 는 React 와 router 를 import 하지 않는다.

### 4. 링크 `financial-workbench/web/src/lib/links.ts`

- `nodeLink(id, origin)` 을 `${origin}/workspace?node=${encodeURIComponent(id)}` 로 바꾼다.
- `rememberPendingNode`, `takePendingNode` 를 `rememberReturnTo(path, storage?)`, `takeReturnTo(storage?)` 로 바꾼다. 키는 `workbench.returnTo` 다. `rememberReturnTo` 는 `isSafeReturnTo(path)` 가 아니면 저장하지 않고, `takeReturnTo` 도 꺼낸 값이 안전하지 않으면 `null` 이다. 저장소 접근은 지금처럼 모두 `try` 안이다.
- `nodeFromSearch` 는 `legacyRedirect` 가 대신하므로 지운다. 쓰는 곳을 함께 고친다.

### 5. `App.tsx` 를 경로로

- `tab` 상태를 지우고 `const tab = tabOfPath(useLocation().pathname)` 로 읽는다.
- 인증 확인 `useEffect` 맨 앞: `legacyRedirect(pathname, search)` 가 있으면 그 주소를, 없으면 지금 `pathname + search` 를 `rememberReturnTo` 한다(로그인 화면을 보이기 전이라 두 경우 모두 잃지 않는다). `me()` 성공 콜백에서 `const back = takeReturnTo(); if (back) returnToRef.current = back` 으로 둔다. 지금 코드의 StrictMode 보호(`if (pending) pendingNodeRef.current = pending`)와 같은 이유다. 개발 모드에서 콜백이 두 번 돌아도 둘째가 첫 값을 `null` 로 덮지 않는다.
- 세션이 끝나 로그인 화면으로 가는 경로(`setUnauthorizedHandler` 의 콜백)에서도 그 순간의 `pathname + search` 를 `rememberReturnTo` 한다. `window.history.replaceState` 로 query 를 지우는 지금 코드는 지운다(`login=denied` 는 `LoginView` 로 가는 경우라 로그인 성공 때는 없다).
- 온톨로지를 받는 콜백에서 `setOntology(o)` 와 함께, `returnToRef.current` 가 있을 때만 `navigateRef.current(returnToRef.current, { replace: true })` 를 부르고 `returnToRef.current = null` 로 비운다. `useTransitions={false}` 라 두 변경이 한 번에 그려져 `Workspace` 가 `node` 가 있는 상태로 처음 그려진다(좁은 화면의 첫 탭). 지금 `pendingNodeRef` 처리를 이것으로 바꾼다.
- 이 effect 의 의존성은 `[signedIn]` 하나다. `useNavigate()` 가 돌려주는 함수는 경로가 바뀔 때마다 새로 만들어지므로(`useNavigateUnstable` 의 deps 에 `locationPathname`), `const navigateRef = useRef(navigate); navigateRef.current = navigate` 로 들고 쓴다. 의존성에 `navigate` 나 그것을 쓰는 함수를 넣으면 탭을 옮길 때마다 온톨로지를 다시 받는다.
- 로그인한 뒤의 경로 판정은 한 곳(`useEffect` 하나 또는 렌더 중 `<Navigate replace>`)에서 한다.
  - `tab` 이 `null`(모르는 경로, `/` 포함)이면 `legacyRedirect` 결과나 `/workspace` 로 바꾼다.
  - `users` 인데 ADMIN 이 아니면 `/workspace` 로 바꾼다.
  - 모두 `replace` 다.
- 탭 단추는 `navigate(lastUrlOf[key] ?? TAB_PATHS[key])` 다(push). `lastUrlOf` 는 `useRef<Partial<Record<TabKey, string>>>` 이고, 경로가 바뀔 때마다 그 탭의 `pathname + search` 를 적는다. 지금 보고 있는 탭을 다시 누르면 아무것도 하지 않는다.
- `selectedId`, `centerId` 상태를 지우고 `/workspace` 의 query 에서 읽는다(`parseWorkspaceQuery(location.search)` 의 `node`, `center ?? node`).
- `focusNode(id)` 는 `navigate('/workspace' + workspaceSearch({ ...current, node: id, center: null, pane: 'detail' }))`(push) 뒤 `focusSeq` 를 올린다. `current` 는 지금 주소가 `/workspace` 면 그 query, 아니면 `lastUrlOf.workspace` 의 query, 그것도 없으면 기본값이다. 이렇게 하면 다른 탭에서 항목을 열어도 작업 공간의 검색 조건이 남는다. 같은 주소면 `replace: true` 로 부른다.
- `Workspace` 의 `onSelect={setSelectedId}` 를 `onSelect={(id) => navigate('/workspace' + workspaceSearch({ ...q, node: id, center: q.center ?? q.node }))}`(push)로 바꾼다. `center` 가 비어 있으면 지금 `node` 가 중심이었으므로 그것을 `center` 로 남겨, 상세만 바뀌고 그래프 중심은 그대로 둔다(`Workspace.tsx` 의 `onSelect` 주석 「상세만 바꾼다」). 이 `onSelect` 는 그래프 노드, 「그래프에 나온 항목」, 상세 안의 관계와 주장 카드 이름, 「주장 열기」 안내가 함께 쓴다. `pane` 은 그대로 둔다. `pane` 은 phase 02 가 다룬다.
- `openNode(id)` 는 `focusNode(id)` 와 같다(탭 이동이 주소에 들어 있다). `openHistory(id)` 는 `navigate('/changes' + changesSearch({ target: id, actor: '', page: 0 }))` 다.
- `ChangesTab` 에는 `targetId={parseChangesQuery(location.search).target}` 과 `onTargetIdChange={(id) => navigate('/changes' + changesSearch({ ...q, target: id, page: 0 }), { replace: true })}` 를 넘긴다. `changesTargetId` 상태를 지운다.
- `logout` 은 지금의 `focusNode(null)` 과 `setTab('workspace')` 를 지우고 `navigate('/workspace', { replace: true })` 를 부른 뒤, 온톨로지와 인증 상태를 지금처럼 비운다.

### 6. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/routes.test.ts` 신규
  - `tabOfPath('/changes')` 는 `changes`, `'/'` 와 `'/nope'` 은 `null` 이다.
  - `workspaceSearch` 는 기본값이면 `''`, `{ node: 'a', pane: 'detail', hops: 2, types: ['Company','Security'] }` 이면 표 순서의 query 다. `parseWorkspaceQuery(workspaceSearch(x))` 가 `x` 로 돌아온다(왕복). `hops=abc`, `pane=zzz` 는 기본값과 `null` 이다.
  - 목록, 검토, 이력도 왕복과 기본값 생략을 하나씩 본다.
  - `legacyRedirect('/', '?node=a%20b')` 는 `/workspace?node=a%20b&pane=detail`, `legacyRedirect('/workspace', '?node=a')` 와 `legacyRedirect('/', '')` 는 `null` 이다.
  - `isSafeReturnTo` 는 `/changes?target=x` 와 `/workspace` 가 참이고 `//evil.example`, `https://x`, `/nope`, `/workspacefoo`, `''` 는 거짓이다.
  - `parseWorkspaceQuery('?hops=3')` 의 `hops` 는 1, `parseListQuery('?page=-1')` 의 `page` 는 0 이다. `workspaceSearch({ ...기본값, q: 'a b' })` 는 `?q=a%20b` 다.
- `financial-workbench/web/src/lib/links.test.ts`: `nodeLink` 기대값을 `/workspace?node=` 로 바꾸고, pending 테스트를 `rememberReturnTo`/`takeReturnTo` 로 바꾼다. 안전하지 않은 주소는 저장하지 않는 경우를 더한다.
- `financial-workbench/web/src/components/tabs.test.tsx`, `screens.test.tsx`, `ChangesTab.test.tsx` 가 `withApp` 의 `MemoryRouter` 로 그대로 통과하는지 돌린다. 실패하면 감싸기만 고친다.
- 브라우저 테스트
  - `financial-workbench/web/e2e/workbench.spec.ts` 의 `0e)` 다음에 `0f) 상단 탭은 경로를 바꾸고 뒤로가기로 앞 탭에 돌아온다` 를 더한다. `pageAdmin` 으로 `tab-list` 를 누르면 주소가 `/\/list(\?|$)/` 에 맞고, `tab-changes` 를 누르면 `/\/changes(\?|$)/` 에 맞는다(phase 03 뒤에는 탭이 마지막 query 를 기억하므로 정확히 같은지로 보지 않는다). `pageAdmin.goBack()` 하면 주소가 목록이고 `tab-list` 가 `aria-selected="true"` 다. `reload()` 해도 목록 탭이다. `pageAdmin.goto('/')` 는 `/workspace` 로 바뀐다.
  - `1)` 에서 편집자 A 가 로그인한 직후 `pageA.goto('/users')` 하면 `/workspace` 로 바뀐다(ADMIN 이 아니다).
  - `3b)` 의 기대값을 바꾼다. `loginAs(..., '/?node=' + supplyClaimId)` 로 옛 링크를 그대로 쓰고, 로그인한 뒤 주소가 `/workspace?node=${supplyClaimId}&pane=detail` 이다. 같은 테스트에서 새 형식 `/workspace?node=…` 로 한 번 더 로그인해 같은 상세가 열리는지 본다(새 context).
  - `6c)` 의 4단계(`workbench.spec.ts` 에서 `pageA.goto('/?node=' + supplyClaimId)` 뒤 `expect(pageA).not.toHaveURL(/node=/)`)를 `toHaveURL(new RegExp('/workspace\\?node=' + supplyClaimId))` 로 바꾼다.
  - `financial-workbench/web/e2e/mobile.spec.ts` 끝 단계의 `expect(page).not.toHaveURL(/node=/)` 를 `toHaveURL(new RegExp('/workspace\\?node=' + id))` 로 바꾼다. `workspace-tab-detail` 단언은 그대로다.
  - `CopyLinkButton` 의 대체 입력칸 값이 `/workspace?node=` 를 담는지 `3)` 의 `review-mine-copy-link-fallback` 이 보일 때만 단언한다(클립보드가 되면 건너뛴다).

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.web.SpaRouteIntegrationTest'
cd financial-workbench/api && ./gradlew test
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/routes.test.ts src/lib/links.test.ts
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
grep -q '"react-router": "8.4.0"' financial-workbench/web/package.json
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan009 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan009 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 각 줄은 저장소 루트에서 돈다.
- 두 project 가 모두 통과해야 한다. e2e 스택은 운영 이미지와 같은 방식(`/app/static`)으로 웹을 내보내므로 `/list` 새로고침이 서버의 `SpaRouteController` 를 거친다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` | 신규 |
| `financial-workbench/api/src/test/resources/static/index.html` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` | 신규 |
| `financial-workbench/web/package.json` | 수정 |
| `financial-workbench/web/package-lock.json` | 수정 |
| `financial-workbench/web/src/main.tsx` | 수정 |
| `financial-workbench/web/src/routes.ts` | 신규 |
| `financial-workbench/web/src/routes.test.ts` | 신규 |
| `financial-workbench/web/src/lib/links.ts` | 수정 |
| `financial-workbench/web/src/lib/links.test.ts` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
