# Phase 02. 작업 공간의 주소 상태와 뒤로가기

**Execution profile**: standard

## 목표

작업 공간의 좁은 화면 탭(`pane`), 검색 조건(`q`, `types`, `status`, `archived`), 홉 수(`hops`), 「주장을 따로 보기」(`claims`), 그래프 중심(`center`)을 주소의 query 로 옮긴다.
좁은 화면의 검색, 그래프, 상세 탭 이동과 항목 열기는 주소를 쌓고(push), 나머지는 주소만 바꾼다(replace).
뒤로가기로 앞 항목과 앞 탭에 돌아오는 것을 넓은 화면과 휴대폰 폭 브라우저 테스트로 확인한다.

**범위 외**: 목록, 검토 대기, 변경 이력의 query 는 phase 03 이다. 상단 탭 경로와 `node` 를 주소에서 읽는 일은 phase 01 에서 끝났다.

## 컨텍스트

- 앞 phase 결과
  - `financial-workbench/web/src/routes.ts` 에 `parseWorkspaceQuery(search)`, `workspaceSearch(q)` 와 `WorkspaceQuery`(`node`, `center`, `pane`, `q`, `types`, `status`, `archived`, `hops`, `claimsAsNodes`)가 있다. 기본값은 쓰지 않는다.
  - `App.tsx` 가 `/workspace` 의 `node`, `center ?? node` 를 `Workspace` 의 `selectedId`, `centerId` 로 넘긴다. `focusNode(id)`(그래프 중심과 상세를 함께, `pane: 'detail'`, push)와 `onSelect`(상세만, push)가 주소를 바꾼다.
- `financial-workbench/web/src/components/Workspace.tsx`
  - 좁은 화면 탭은 `const [mobileTab, setMobileTab] = useState<MobileTab>(() => initialMobileTab(selectedId))` 이고, 검색 결과를 누를 때와 노드를 만들 때 `setMobileTab('detail')`, 탭 단추(`Tabs` 의 `onValueChange`)와 그래프 아래 「상세 보기」(`graph-selection-open`)가 바꾼다.
  - 검색 조건은 `const [filters, setFilters] = useState<SearchFilters>({ q: '', types: allTypes, reviewStatus: '', includeArchived: false })` 이고 `SearchPanel` 의 `onFiltersChange={setFilters}` 로 바뀐다. `typesParam(types)` 이 전체 타입이면 `undefined` 를 낸다.
  - `hops`, `claimsAsNodes` 도 `useState` 이고 `GraphPanel` 의 `onHopsChange`, `onClaimsAsNodesChange` 로 바뀐다. 「선택한 항목을 중심으로」 는 `onRecenter={onFocus}` 다.
  - `wide`(`useMediaQuery('(min-width: 1024px)')`)이면 세 칸, 아니면 `Tabs` 로 나눈다. 탭 내용은 `forceMount` 로 모두 그려 둔다.
- `financial-workbench/web/src/components/SearchPanel.tsx` 는 검색어 입력을 `qInput` 으로 따로 들고, 제출할 때 `filters.q` 로 넘긴다. 쪽 번호(`pageNo`)는 내부 상태다. 주소의 `q` 가 바뀌면 `qInput` 도 따라가야 뒤로가기 뒤 입력칸이 맞는다.
- 브라우저 테스트: `financial-workbench/web/e2e/workbench.spec.ts` 의 `searchAndOpen(page, label)` 은 `tab-workspace` 를 누르고 검색해 결과를 연다. `financial-workbench/web/e2e/mobile.spec.ts` 는 390×844 에서 `workspace-tab-search`, `workspace-tab-graph`, `workspace-tab-detail` 의 `aria-selected` 를 본다. `pageA` 의 데이터는 `data.supplier`, `data.customer` 이고 `4)` 부터 공급 관계가 그래프에 있다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」(작업 공간 행), 「뒤로가기 한 번으로 되돌리는 동작」, 「좁은 화면의 작업 공간」 절, `financial-workbench/docs/adr/007-routes-in-url.md`

## 의도 메모

- 검색어를 칠 때마다 주소를 바꾸지 않는다. 제출할 때만 `q` 를 바꾼다(replace).
- 「이웃 확장」 으로 넓힌 그래프는 주소에 담지 않는다(prd 「남은 한계」). 뒤로가기로 돌아오면 `center` 의 주변만 다시 읽는다.
- 넓은 화면에서는 `pane` 을 읽지도 쓰지도 않는다. 넓은 화면에서 생긴 주소를 휴대폰에서 열면 `pane` 이 없으므로 `node` 유무로 첫 탭을 정한다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. `Workspace.tsx` 의 상태를 주소로

- `useSearchParams()`(또는 `useLocation`) 로 `query = parseWorkspaceQuery(search)` 를 읽는다. 바꾸는 함수 둘을 둔다.

  ```ts
  /** 기록을 쌓는다. 좁은 화면 탭 이동에 쓴다 */
  const push = (patch: Partial<WorkspaceQuery>) => navigate('/workspace' + workspaceSearch({ ...query, ...patch }))
  /** 주소만 바꾼다. 검색 조건, 홉 수, 주장 보기, 중심 이동에 쓴다 */
  const replace = (patch: Partial<WorkspaceQuery>) => navigate('/workspace' + workspaceSearch({ ...query, ...patch }), { replace: true })
  ```
  바꾼 결과가 지금 주소와 같으면 부르지 않는다.
- `mobileTab` 상태를 지우고 `const mobileTab = query.pane ?? initialMobileTab(selectedId)` 로 읽는다. 탭 단추와 「상세 보기」 는 `push({ pane })` 다. 검색 결과를 누를 때와 노드를 만들 때의 `setMobileTab('detail')` 은 지운다. `onFocus` 가 이미 `pane: 'detail'` 로 주소를 쌓는다(phase 01). 넓은 화면이면 `pane` 을 쓰지 않는다(`onFocus` 가 넣은 `pane` 은 주소에 남아도 넓은 화면은 읽지 않는다).
- `filters` 상태를 지우고 `{ q: query.q, types: query.types ?? allTypes, reviewStatus: query.status, includeArchived: query.archived }` 로 만든다. 렌더마다 새 객체를 만들면 `SearchPanel` 의 `run`(의존성에 `filters` 객체)이 그때마다 다시 돌아 검색 요청이 쌓이고, 늦게 온 옛 응답이 새 결과를 덮을 수 있다. 그래서 `useMemo` 로 만들고 의존성은 `query.q`, `types` 를 쉼표로 이은 문자열, `query.status`, `query.archived` 로 둔다. `onFiltersChange` 는 `replace({ q, types: 전체면 null, status, archived })` 다. 종류를 모두 끄면 `types` 가 비어 `null`(전체)로 돌아간다. 모두 꺼진 상태를 보이던 지금 동작이 바뀐다(`docs/flow.md` 「주소와 뒤로가기」).
- `hops` 와 `claimsAsNodes` 상태를 지우고 query 에서 읽는다. 바꾸면 `replace` 다.
- `onRecenter`(「선택한 항목을 중심으로」)는 `replace({ center: id })` 다. 노드를 「연다」 가 아니라 그래프를 옮기는 것이라 기록을 쌓지 않는다.
- 상세만 바꾸는 `onSelect` 는 phase 01 그대로다(push, 그때의 중심을 `center` 로 남긴다). 상세의 「그래프 중심으로」(`node-center-graph`)는 `onFocus` 라 push 다(`docs/flow.md` 의 push 표).

### 2. `SearchPanel.tsx`

- `qInput` 이 `filters.q` 와 맞도록 `useEffect(() => setQInput(filters.q), [filters.q])` 를 둔다. 쪽 번호는 내부 상태 그대로다.

### 3. 이 phase 를 검증하는 테스트

- 좁은 화면 탭 판정을 순수 함수로 둔다. `Workspace.tsx` 에 `export function mobileTabOf(pane: MobileTab | null, selectedId: string | null): MobileTab` 를 두고(`pane ?? initialMobileTab(selectedId)`), 기존 `financial-workbench/web/src/components/Workspace.test.ts` 에 테스트를 더한다. `('graph', 'n1')` 은 `graph`, `(null, 'n1')` 은 `detail`, `(null, null)` 은 `search` 다.
- `financial-workbench/web/src/components/screens.test.tsx` 에 정적 렌더 테스트를 더한다. 서버 렌더에서는 `useMediaQuery` 가 넓은 화면(`fallback = true`)이라 세 칸이 그려진다. `withApp(<Workspace … />, testOntology, undefined, '/workspace?q=abc&archived=1')` 로 그리면 `search-input` 의 값이 `abc` 이고 `filter-include-archived` 가 `checked` 다. `Workspace` 의 props 는 App 이 넘기는 것과 같게 채운다(`centerId`, `selectedId` 는 `null`).
- `financial-workbench/web/e2e/workbench.spec.ts` 에 `4b) 작업 공간에서 뒤로가기는 앞 항목으로 돌아가고 검색 조건은 남는다` 를 `4)` 다음에 더한다.
  1. `pageA` 로 `tab-workspace` 를 누르고 `search-input` 에 `data.supplier` 를 넣어 검색한 뒤 결과를 연다. 주소에 `node=` 와 `q=` 가 있다.
  2. 그래프 아래 「그래프에 나온 항목」 목록에서 고객사(`data.customer`)를 누른다. `detail-label` 이 고객사다.
  3. `pageA.goBack()` 하면 `detail-label` 이 공급사다. `search-input` 값이 `data.supplier` 다.
  4. `tab-list` 를 누른 뒤 `goBack()` 하면 작업 공간이고 `search-input` 값과 `detail-label` 이 그대로다.
  5. `hops` 를 2로 바꾸면 주소에 `hops=2` 가 생긴다. 여기서 `goBack()` 하면 홉을 되돌리는 것이 아니라 2단계의 고객사 열기 전, 곧 1단계에서 공급사를 연 화면으로 간다. `detail-label` 이 공급사이고 주소에 `hops=` 가 없다. 홉 변경이 기록을 쌓지 않았다는 근거다. 이 단언은 앞 단계의 뒤로가기 횟수에 따라 도착점이 달라지므로, 5단계 직전에 `const before = pageA.url()` 을 적어 두지 말고 위 두 값으로만 본다.
  - 「그래프에 나온 항목」 은 `graph-node-list` 안의 단추다(`financial-workbench/web/TESTIDS.md`). 고객사는 `hasText: data.customer` 인 단추 가운데 기업 항목이다.
- `financial-workbench/web/e2e/mobile.spec.ts` 에 단계를 더한다. 위치는 그래프 탭에서 노드를 고르고 「상세 보기」 로 상세 탭에 가는 기존 흐름 바로 뒤, `page.goto('/?node=' …)` 단계 앞이다. 그 흐름의 기록은 「그래프 탭(앞 노드) → 노드 고르기(push) → 상세 보기(push)」 다.
  1. `page.goBack()` 하면 `workspace-tab-graph` 가 `aria-selected="true"` 이고 `graph-selection-bar` 에 고른 노드 이름이 보인다.
  2. 한 번 더 `goBack()` 하면 여전히 그래프 탭이고 막대가 앞 노드 이름이다(노드 고르기도 push 다).
  3. 각 뒤로가기 뒤 `graph-canvas` 의 `data-layout-pending` 이 `false` 다. 그래프 탭이 다시 보일 때 크기를 다시 쟀다는 근거다.
  4. `goForward()` 를 두 번 하면 다시 상세 탭이다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/components/Workspace.test.ts src/components/screens.test.tsx src/routes.test.ts
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan009 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan009 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 각 줄은 저장소 루트에서 돈다. 두 project 가 모두 통과해야 한다.
- 휴대폰 폭 스크린샷에서 뒤로가기 뒤 그래프가 빈 캔버스로 남지 않는지(크기를 다시 재는지) 눈으로 본다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/components/Workspace.tsx` | 수정 |
| `financial-workbench/web/src/components/SearchPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/Workspace.test.ts` | 수정 |
| `financial-workbench/web/src/components/screens.test.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
