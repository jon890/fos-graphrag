# Phase 05. 작업 공간 검색 칩, 고급 필터, 방향 배치 그래프

**Execution profile**: standard

## 목표

작업 공간 검색 칸을 검색창과 종류 칩만 보이게 줄이고, 나머지 조건(주장 검토 상태, 보관 포함, 이웃 단계, 주장을 따로 보기)을 「고급 필터」 한 곳에 접는다. 그래프를 관계 방향대로 위에서 아래로 놓는다.

**범위 외**: 상세 칸(Phase 06). 만들기(Phase 04 에서 끝남).

## 컨텍스트

- 검색 칸은 `financial-workbench/web/src/components/SearchPanel.tsx` 다. 지금 `<fieldset className="filters">` 안에 종류 체크박스(`filter-type-${t}`), 검토 상태 select(`filter-review-status`), 「보관 포함」 체크(`filter-include-archived`)와 안내 문장이 있다. 종류를 바꾸는 `toggleType(type, on)` 은 `labels.types`(YAML 순서)로 다시 정렬한다.
- 이웃 단계(`graph-hops`, 「홉 수」 select)와 「주장을 따로 보기」(`graph-claims-as-nodes`)는 `src/components/GraphPanel.tsx` 의 도구 줄에 있고, 값과 바꾸기는 `Workspace.tsx` 가 `hops`, `onHopsChange`, `claimsAsNodes`, `onClaimsAsNodesChange` 로 넘긴다. 주소의 query 는 `hops`, `claims=nodes`, `status`, `archived=1` 이다(`src/routes.ts` 의 `WorkspaceQuery`).
- 그래프 배치는 `GraphPanel.tsx` 의 `runLayout(cy)` 가 `cose` 로 한다. 새 요소가 생겼을 때만 배치하고, 숨겨진 동안이면 `pendingLayout` 으로 미룬다.
- Phase 03 가 만든 `src/lib/typeOrder.ts` 의 `orderedTypes`, `managedTypes` 를 칩 순서에 쓴다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「작업 공간」 의 「검색 칸」, 「그래프 칸」, 「주장 접기」, 「주소와 뒤로가기」

## 의도 메모

- query 이름과 뜻은 바꾸지 않는다. 이미 보낸 링크가 같은 화면을 연다.
- 고급 필터의 열림은 주소에 두지 않는다. 화면 상태라 새로고침하면 접힌다. 바뀐 개수 표시가 있으니 접혀 있어도 조건이 걸린 것을 안다.
- 칩의 뜻은 지금 체크박스와 같다(처음에는 모두 눌림, 모두 끄면 전체). 뜻을 바꾸면 주소의 `types` 규칙도 바뀌어야 해서 바꾸지 않는다.
- 배치 뿌리는 그래프 안에서 들어오는 선이 없는 노드다. 고리만 있으면 중심 노드를 뿌리로 준다. 확장 라이브러리(dagre)는 새 의존이라 쓰지 않는다.

## 작업 항목

### 1. `src/components/SearchPanel.tsx`

- 검색창 placeholder 를 「이름이나 종목 코드로 찾기」 로 바꾼다. 검색 단추(`search-submit`)는 그대로 둔다.
- 종류 체크박스를 칩 단추로 바꾼다. testid `filter-type-${t}` 를 유지하고 `aria-pressed` 로 눌림을 보인다. 순서는 `[...orderedTypes(ontology), ...managedTypes(ontology)]` 다. 바꾼 뒤 저장하는 `types` 순서도 이 순서다.
- `<details data-testid="advanced-filters">` 를 새로 둔다. `<summary data-testid="advanced-filters-toggle">` 의 글자는 바뀐 개수가 0 이면 「고급 필터」, 아니면 「고급 필터 (N)」 다. N 은 `status !== ''`, `includeArchived`, `hops !== 1`, `claimsAsNodes` 가운데 참인 개수다. 기본은 접힘이다.
- 고급 필터 안: 「주장 검토 상태」(`filter-review-status`), 「보관 포함」(`filter-include-archived`), 「이웃 단계」(`graph-hops`, 선택지 1과 2), 「주장을 따로 보기」(`graph-claims-as-nodes`)와 안내 「종류와 검토 상태는 그래프에도 적용됩니다.」.
- `SearchPanel` 의 props 에 `hops`, `onHopsChange`, `claimsAsNodes`, `onClaimsAsNodesChange` 를 더한다.
- 개수 계산은 `export function advancedFilterCount(f: { reviewStatus: string; includeArchived: boolean; hops: number; claimsAsNodes: boolean }): number` 로 빼서 테스트한다.

### 2. `src/components/Workspace.tsx`, `src/components/GraphPanel.tsx`

- `Workspace` 는 `hops`, `claimsAsNodes` 와 그 바꾸기를 `SearchPanel` 에 넘기고 `GraphPanel` 에는 넘기지 않는다.
- `GraphPanel` 도구 줄에서 `graph-hops` 와 `graph-claims-as-nodes` 를 지운다. 「이웃 확장」, 「선택한 항목을 중심으로」, 「화면 맞춤」, 상태 글자는 그대로다. props 에서 `hops`, `onHopsChange`, `claimsAsNodes` 바꾸기를 뺀다. 접기 계산에 쓰는 `claimsAsNodes` 값은 그대로 받는다.
- `runLayout(cy, centerId)` 를 `breadthfirst` 로 바꾼다: `{ name: 'breadthfirst', directed: true, roots, spacingFactor: 1.2, padding: 48, animate: false, fit: true }`. `roots` 는 `cy.nodes().filter(n => n.incomers('edge').filter(e => e.source().id() !== n.id()).empty())` 이고 비어 있으면 중심 노드다. `layoutstop` 뒤의 `fit` 과 `limitZoom` 은 그대로다.
- 중심 노드(`centerId`)가 바뀌면 새 요소가 없어도 다시 배치한다(숨겨져 있으면 지금처럼 미룬다).
- 뿌리를 고르는 계산은 `src/lib/graph.ts` 에 `export function layoutRoots(display: GraphDisplay, centerId: string | null): string[]` 로 두고 테스트한다. 접힌 주장 선(`claimEdges`)도 주체에서 대상으로 가는 선으로 센다.

### 3. 단위 테스트: `src/components/SearchPanel.test.tsx` (신규), `src/lib/graph.test.ts`

- `advancedFilterCount` 가 기본값에서 0, 검토 상태와 이웃 단계만 바꾸면 2 인지.
- `SearchPanel` 을 `testSupport.tsx` 로 그려 `advanced-filters` 가 `open` 없이 그려지고 머리가 「고급 필터」 인지, `hops: 2` 를 넘기면 「고급 필터 (1)」 인지, 칩 순서가 `orderedTypes` 뒤에 주장인지.
- `layoutRoots`: 들어오는 선이 없는 노드가 뿌리이고, 고리만 있으면 중심 노드인지. 접힌 주장 선이 대상 노드를 뿌리에서 빼는지.

### 4. e2e 와 testid 계약: `e2e/workbench.spec.ts`, `e2e/mobile.spec.ts`, `TESTIDS.md`

- `filter-type-*` 를 `check()`, `uncheck()`, `toBeChecked()` 로 다루던 곳을 `click()` 과 `toHaveAttribute('aria-pressed', 'true' | 'false')` 로 바꾼다.
- `graph-hops`, `graph-claims-as-nodes`, `filter-review-status`, `filter-include-archived` 를 쓰기 전에 `advanced-filters-toggle` 을 눌러 연다(이미 열렸으면 누르지 않는 도우미 `openAdvancedFilters(page)` 를 spec 안에 둔다).
- 새 테스트: 「고급 필터는 접혀 있고 바꾼 개수를 보인다」. 작업 공간에서 `advanced-filters` 에 `open` 속성이 없고, 열어 이웃 단계를 2 로 바꾸면 주소에 `hops=2` 가 붙고 머리가 「고급 필터 (1)」 인지. 새로고침하면 접혀 있고 「(1)」 이 남는지.
- 그래프 배치 단언이 `cose` 에 기대던 곳(노드 좌표 비교가 있으면)을 확인하고, 시작 노드가 끝 노드보다 위(`y` 가 작음)인 단언으로 바꾸거나 지운다.
- `TESTIDS.md`: 「작업 공간: 왼쪽」 의 필터 줄을 칩과 `advanced-filters`, `advanced-filters-toggle` 로 고치고, 그래프 도구 줄 절에서 `graph-hops`, `graph-claims-as-nodes` 를 고급 필터 아래로 옮긴다.

## 검증

```bash
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npx vitest run src/components/SearchPanel.test.tsx src/lib/graph.test.ts
cd financial-workbench/web && npm test && npm run build
cd financial-workbench/web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts
! git grep -n "cose" -- financial-workbench/web/src
```

- e2e 는 이 phase 에서 브라우저로 돌리지 않는다. `playwright test --list` 는 서버 없이 spec 파일을 읽어 문법과 import 오류만 잡는다. 브라우저 실행은 모든 phase 를 마친 뒤 한 번 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/components/SearchPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/SearchPanel.test.tsx` | 신규 |
| `financial-workbench/web/src/components/Workspace.tsx` | 수정 |
| `financial-workbench/web/src/components/GraphPanel.tsx` | 수정 |
| `financial-workbench/web/src/lib/graph.ts` | 수정 |
| `financial-workbench/web/src/lib/graph.test.ts` | 수정 |
| `financial-workbench/web/src/legacy.css` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
