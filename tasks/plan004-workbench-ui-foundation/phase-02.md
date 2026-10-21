# Phase 02. 반응형 배치와 휴대폰 브라우저 테스트

**Execution profile**: standard

## 목표

폭 1024px 미만에서 작업 공간을 검색, 그래프, 상세 탭으로 나누고 페이지 전체의 가로 스크롤을 없앤다.
휴대폰 폭(390px)에서 노드를 만들고, 그래프에서 고르고, 상세를 여는 흐름을 브라우저 테스트로 확인한다.

**범위 외**: 목록, 검토 대기, 변경 이력, 사용자, 온톨로지 탭과 머리글을 shadcn 부품으로 바꾸는 일은 다음 계획(`plan005-workbench-ui-tabs`)이다. 검색 패널, 그래프 패널, 상세 패널 안쪽의 폼과 문구는 고치지 않는다.

## 컨텍스트

- phase 01 이 Tailwind 4, shadcn 부품(`financial-workbench/web/src/components/ui/tabs.tsx`, `button.tsx` 등), `cn`(`financial-workbench/web/src/lib/utils.ts`), 경로 별칭 `@/` 를 들였다. 옛 규칙은 `financial-workbench/web/src/legacy.css` 에 있다.
- `financial-workbench/web/src/components/Workspace.tsx` 가 세 칸을 그린다. 상태는 필터, `hops`, `graph`, `graphLoading`, `graphError`, `changeTick`, `flash` 다. 배치는 `<div className="workspace">` 아래 `aside.pane-left`(SearchPanel), `section.pane-center`(GraphPanel), `aside.pane-right`(DetailPanel)이고, 폭은 `legacy.css` 의 `.workspace { grid-template-columns: 300px minmax(0, 1fr) 440px }` 가 정한다.
- `financial-workbench/web/src/App.tsx` 는 작업 공간 탭이 아닐 때 `Workspace` 를 그리지 않는다. 그래서 목록, 검토 대기, 변경 이력에서 항목을 열면(`openNode`) `Workspace` 가 새로 그려지고, 그때 `selectedId` 가 이미 정해져 있다.
- `financial-workbench/web/src/components/GraphPanel.tsx` 는 처음 그릴 때 `cytoscape({ container: containerRef.current, ... })` 를 한 번 만들고(91행), 새 요소가 생기면 `cy.layout({ name: 'cose', ..., fit: true, padding: 40 })` 를 돌린 뒤 배율이 1.2 를 넘으면 1.2 로 줄이고 가운데로 옮긴다(122~130행). 숨겨진 컨테이너는 크기가 0 이라, 숨겨진 동안 돈 배치와 맞춤은 다시 보일 때 쓸모가 없다.
- 그래프 아래 「그래프에 나온 항목」 목록은 `data-testid="graph-node"` 인 `li` 안의 버튼이 `props.onSelect(n.id)` 를 부른다. 노드 표시 이름은 `useLabels().node(n)` 이다(`financial-workbench/web/src/context.ts`).
- 머리글은 `App.tsx` 의 `header.app-header` 안에 제목, `nav.tabs`(버튼 `data-testid="tab-<key>"` 여섯 개), `div.user-box`(이름 `current-user-name`, 이메일 `current-user-email`, 역할, 로그아웃)다. 스타일은 `legacy.css` 의 `.app-header`, `.tabs`, `.tab`, `.user-box` 다.
- `body { min-width: 1280px }` 가 `legacy.css` 에 있다.
- 브라우저 테스트는 `financial-workbench/web/e2e/workbench.spec.ts` 한 파일이고 설정은 `financial-workbench/web/playwright.config.ts` 다(project `chromium`, 1440×900, `workers: 1`). 로그인 도우미 `loginAs`, 정규식 도우미 `exact`, 사용자 `admin` 은 그 파일 안에만 있다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「좁은 화면의 작업 공간」, `financial-workbench/docs/code-architecture.md` 의 「웹 구조」 와 「테스트」, `financial-workbench/docs/prd.md` 의 「요구가 충족됐다고 보는 관측」

## 의도 메모

- 경계 판정은 CSS 의 `lg:` 만으로 하지 않는다. 탭 배치에서는 `GraphPanel` 이 자기가 보이는지 알아야 크기를 다시 잴 수 있다.
- 탭 배치에서도 세 칸을 모두 그려 두고 고르지 않은 칸만 숨긴다. 상세에서 쓰던 입력이 탭을 옮겨도 남아야 한다. 넓은 배치와 탭 배치를 넘나들 때는 패널이 새로 그려져 입력이 사라지는 것을 받아들인다.
- `useMediaQuery` 는 `matchMedia` 가 없는 환경(vitest 의 node, `renderToStaticMarkup`)에서 넓은 배치(`true`)를 돌려준다. 기존 화면 테스트가 지금 배치 그대로 그려지게 하려는 것이다.
- 휴대폰 테스트는 기존 흐름 테스트와 파일을 나눈다. 기존 테스트는 사용자 여럿과 순서에 기대고 있어 두 폭에서 함께 돌리기 어렵다.

## 작업 항목

### 1. `financial-workbench/web/src/hooks/useMediaQuery.ts` 신규

```ts
/** matchMedia 가 없으면 fallback 을 돌려준다 */
export function readMediaQuery(query: string, fallback: boolean, win: Pick<Window, 'matchMedia'> | null): boolean
/** 미디어 쿼리가 맞는지 구독한다. 서버 렌더링과 테스트에서는 fallback(기본 true) */
export function useMediaQuery(query: string, fallback = true): boolean
```

`win` 이 `null` 이거나 `matchMedia` 가 없으면 `fallback` 이다. `useMediaQuery` 는 `typeof window === 'undefined' ? null : window` 를 넘긴다. `useMediaQuery` 는 `useSyncExternalStore` 로 만든다. 구독은 `matchMedia(query).addEventListener('change', ...)` 이고, 서버 스냅샷은 `fallback` 이다.

### 2. `financial-workbench/web/src/components/Workspace.tsx` 의 배치

- `export type MobileTab = 'search' | 'graph' | 'detail'` 과 `export function initialMobileTab(selectedId: string | null): MobileTab` 를 둔다. `selectedId` 가 있으면 `'detail'`, 없으면 `'search'` 다.
- `const wide = useMediaQuery('(min-width: 1024px)')`, `const [mobileTab, setMobileTab] = useState<MobileTab>(() => initialMobileTab(selectedId))`.
- 세 패널 요소는 한 번만 만들어 변수에 담고 두 배치가 같이 쓴다.
  - `SearchPanel` 의 `onFocus` 는 `(id) => { onFocus(id); setMobileTab('detail') }` 로 감싼다. `onCreated` 도 지금 동작 뒤에 `setMobileTab('detail')` 을 한다. 넓은 배치에서는 `mobileTab` 이 쓰이지 않으므로 해가 없다.
  - `GraphPanel` 의 `onSelect`, `onExpand`, `onRecenter` 는 지금 그대로다. 탭을 옮기지 않는다.
  - `GraphPanel` 에 `visible={wide || mobileTab === 'graph'}` 를 넘긴다.
- `wide` 면 지금 마크업(`div.workspace` 와 세 `pane`)을 그대로 그린다.
- `wide` 가 아니면 `Tabs`(`value={mobileTab}`, `onValueChange={(v) => setMobileTab(v as MobileTab)}`)로 그린다. Radix 는 값을 `string` 으로 넘긴다.
  - `TabsList` 의 트리거 셋: `value="search"` 「검색」 `data-testid="workspace-tab-search"`, `value="graph"` 「그래프」 `data-testid="workspace-tab-graph"`, `value="detail"` 「상세」 `data-testid="workspace-tab-detail"`.
  - `TabsContent` 셋에 모두 `forceMount` 를 주고, 고르지 않은 쪽은 `data-[state=inactive]:hidden` 으로 숨긴다.
  - 그래프 탭 안, `GraphPanel` 아래에 선택 막대를 둔다. `selectedId` 가 있고 `graph.nodes` 에 그 노드가 있을 때만 보인다. `div[data-testid="graph-selection-bar"]` 안의 `Button`(`data-testid="graph-selection-open"`)이 「{labels.node(노드)} 상세 보기」 를 보이고, 누르면 `setMobileTab('detail')` 이다.
  - 탭 배치 전체는 남은 높이를 채우고(`flex h-full flex-col`), 각 탭 내용은 세로로만 스크롤한다.

### 3. `financial-workbench/web/src/components/GraphPanel.tsx` 의 `visible`

- `Props` 에 `visible?: boolean`(기본 `true`)을 더한다.
- 요소를 맞추는 effect 에서 새 요소가 생겼는데 `visible` 이 `false` 면 배치를 돌리지 않고 `pendingLayout` ref 를 `true` 로 둔다.
- `visible` 이 `true` 가 되는 effect 에서 `cy.resize()` 를 부르고, `pendingLayout` 이면 지금과 같은 배치(`cose`, 1.2 배율 제한 포함)를 돌리고 ref 를 내린다. 아니면 노드가 있을 때 `cy.fit(undefined, 40)` 뒤 1.2 배율 제한만 한다.
- 배치와 배율 제한 코드는 함수 하나로 묶어 두 effect 가 함께 부른다.
- `graph-canvas` div 에 `data-layout-pending={pendingLayout 상태}` 를 둔다(`"true"` 또는 `"false"`). ref 만으로는 렌더에 반영되지 않으므로 같은 값을 state 로도 든다. 숨겨진 동안 새 요소가 생기면 `"true"`, 다시 보여 배치를 돌리면 `"false"` 다. 브라우저 테스트가 이 값을 본다.
- 캔버스 크기는 CSS(`.graph-canvas { inset: 0 }`)와 cytoscape 3.34 의 ResizeObserver 가 맞춘다. 고칠 결함은 크기 0 에서 돈 배치와 맞춤 때문에 노드가 화면 밖에 남는 것이다.

### 4. `financial-workbench/web/src/legacy.css` 의 폭 규칙

- `body` 에서 `min-width: 1280px` 를 지운다. `body { overflow-x: hidden }` 은 두지 않는다. 가로 스크롤은 원인을 고쳐 없앤다.
- `.workspace` 의 열을 `260px minmax(0, 1fr) 380px` 로 바꾼다.
- `@media (max-width: 1023px)` 에서 아래를 둔다.
  - `.app-header { gap: 8px; padding: 0 8px }`, `.app-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1 }`, `.tabs { overflow-x: auto; flex-wrap: nowrap; min-width: 0 }`, `.user-box { flex-shrink: 0 }`. 390px 에서 제목과 사용자 상자만으로 폭이 넘칠 수 있어 제목이 줄어들게 한다.
  - `.user-box [data-testid="current-user-email"]` 은 숨긴다(`display: none`).
  - `.tab-page` 의 좌우 여백을 12px 로 줄이고, 그 안의 `table` 은 감싼 요소에서 가로로 밀어 볼 수 있게 한다. 감싼 요소가 없는 표는 `display: block; overflow-x: auto` 로 둔다.

### 5. `financial-workbench/web/e2e/support.ts` 신규와 `financial-workbench/web/e2e/workbench.spec.ts` 수정

- `workbench.spec.ts` 의 `TestUser`, `admin`, `escapeRegExp`, `exact`, `loginAs`, `newPage`, `shot`, `screenshotDir` 을 `support.ts` 로 옮겨 export 하고, `workbench.spec.ts` 는 그것을 import 한다. 동작은 바꾸지 않는다.
- `suffix`, `data`, 편집자와 열람자 사용자, `createNode` 같은 흐름 도우미는 `workbench.spec.ts` 에 남긴다.

### 6. `financial-workbench/web/playwright.config.ts` 의 project 둘과 `financial-workbench/web/package.json` 의 스크립트

- `package.json` 의 `scripts` 에 `"test:e2e": "playwright test"` 를 더한다. 기존 `e2e` 는 남긴다.
- `chromium`: 지금 설정(1440×900)에 `testIgnore: /mobile\.spec\.ts$/` 를 더한다.
- `mobile`: `testMatch: /mobile\.spec\.ts$/`, `use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true }`.

### 7. `financial-workbench/web/TESTIDS.md` 갱신

「작업 공간: 왼쪽」 절 앞에 「작업 공간: 좁은 화면」 절을 새로 두고 `workspace-tab-search`, `workspace-tab-graph`, `workspace-tab-detail`(1024px 미만의 탭. `aria-selected` 로 고른 탭을 본다), `graph-selection-bar`, `graph-selection-open`(그래프에서 고른 노드의 상세 보기 막대와 단추)을 적는다. 「작업 공간: 가운데 그래프」 절의 `graph-canvas` 행에 `data-layout-pending` 을 적는다. 머리말의 「`e2e/workbench.spec.ts` 도 함께 고친다」 에 `e2e/mobile.spec.ts` 를 더한다.

### 8. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/hooks/useMediaQuery.test.ts` 신규
  - `readMediaQuery('(min-width: 1024px)', true, null)` 은 `true` 다.
  - `matches: false` 를 돌려주는 가짜 `matchMedia` 를 넘기면 `false`, `matches: true` 면 `true` 다.
- `financial-workbench/web/src/components/Workspace.test.ts` 신규
  - `initialMobileTab(null)` 은 `'search'`, `initialMobileTab('id-1')` 은 `'detail'` 이다.
- `financial-workbench/web/e2e/mobile.spec.ts` 신규. `support.ts` 의 `loginAs(page, admin)` 으로 들어간다. 이름에는 `Date.now()` 접미사를 붙인다.
  1. 로그인 뒤 `document.documentElement.scrollWidth <= window.innerWidth` 가 참이다(`expect.poll`).
  2. `workspace-tab-search` 의 `aria-selected` 가 `true` 이고 `search-input` 이 보이며 `graph-canvas` 는 보이지 않는다.
  3. `new-node-type` 에서 `Company` 를 고르고 `new-node-button`, `create-prop-name` 에 `모바일기업-<접미사>` 를 넣고 `create-submit` 을 누른다. `workspace-tab-detail` 의 `aria-selected` 가 `true` 이고 `detail-label` 이 그 이름으로 보인다.
  4. 3 에서 노드를 만든 것은 그래프 탭이 숨겨진 동안이다. `workspace-tab-graph` 를 누르면 `graph-canvas` 가 보이고, `data-layout-pending` 이 `false` 가 된다(`toHaveAttribute`). 다시 보일 때 배치를 돌리지 않으면 `true` 로 남아 실패한다. 이 시점에 `shot(page, 'mobile-graph')` 로 노드가 화면 안에 있는지 남긴다.
  5. 그 이름을 담은 `graph-node` 의 버튼을 누르면 `workspace-tab-graph` 가 그대로 선택돼 있고 `graph-selection-bar` 가 그 이름을 담아 보인다.
  6. `graph-selection-open` 을 누르면 `workspace-tab-detail` 이 선택되고 `detail-label` 이 보인다.
  7. `tab-list` 를 누른 뒤에도 1 의 가로 스크롤 조건이 참이다.
  8. 끝에 `shot(page, 'mobile-workspace')` 로 스크린샷을 남긴다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/hooks/useMediaQuery.test.ts src/components/Workspace.test.ts
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
! grep -n "min-width: 1280px" financial-workbench/web/src/legacy.css
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan004 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan004 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 두 project 가 모두 통과해야 한다. `chromium` 이 통과하면 넓은 화면의 흐름이 그대로라는 근거이고, `mobile` 이 통과하면 좁은 화면의 흐름이 동작한다는 근거다.
- `mobile-graph.png` 에서 노드가 캔버스 안에 보이는지, `mobile-workspace.png` 에서 글자와 버튼이 화면 밖으로 넘치지 않는지 눈으로 본다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/hooks/useMediaQuery.ts` | 신규 |
| `financial-workbench/web/src/hooks/useMediaQuery.test.ts` | 신규 |
| `financial-workbench/web/src/components/Workspace.tsx` | 수정 |
| `financial-workbench/web/src/components/Workspace.test.ts` | 신규 |
| `financial-workbench/web/src/components/GraphPanel.tsx` | 수정 |
| `financial-workbench/web/src/legacy.css` | 수정 |
| `financial-workbench/web/e2e/support.ts` | 신규 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 신규 |
| `financial-workbench/web/playwright.config.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
| `financial-workbench/web/package.json` | 수정 |
