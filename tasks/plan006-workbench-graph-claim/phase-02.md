# Phase 02. 그래프에서 주장을 선으로 접기

**Execution profile**: standard

## 목표

작업 공간 그래프가 기본으로 주장을 「주체 → 대상」 선 하나로 접어 그린다. 선 이름은 관계 종류의 표시 이름이고, 선을 누르면 그 주장이 상세에 열린다.
도구 줄의 「주장을 따로 보기」 를 켜면 지금처럼 주장을 마름모 노드로 그린다. 이웃을 넓힌 뒤에는 화면 맞춤을 다시 하고 노드 사이를 넓혀 글자가 덜 겹치게 한다.

**범위 외**: 서버 응답과 Claim 이름은 phase 01 이 끝냈다. 주장 만들기 폼과 입구는 phase 03 이다. 상세 패널과 검색 패널은 고치지 않는다.

## 컨텍스트

- phase 01 뒤로 주변 그래프 응답은 모은 Claim 의 주체와 대상(`SUBJECT`, `OBJECT` 끝 노드)을 홉 수와 상관없이 담는다. `GraphNode`(`financial-workbench/web/src/api/types.ts`)에 `predicate?: string | null` 이 있고 Claim 일 때만 값이 있다. Claim 의 `label` 은 「주체 → 대상 관계」 다.
- 웹이 들고 있는 그래프는 `GraphData`(`financial-workbench/web/src/lib/graph.ts` 4행)다. `mergeGraph` 가 여러 응답을 합치고 끝점 노드가 없는 관계는 버린다. 관계 방향은 Claim 에서 나간다. `SUBJECT` 는 Claim→주체, `OBJECT` 는 Claim→대상, `SUPPORTED_BY` 는 Claim→문서다.
- `financial-workbench/web/src/components/GraphPanel.tsx`
  - `toElements(data, ontology)`(68행)가 노드와 관계를 Cytoscape 요소로 바꾼다. 관계 이름은 `relationshipLabel` 이다.
  - Cytoscape 는 처음 그릴 때 한 번 만들고(113행), `tap` 과 `dbltap` 을 노드에만 건다(114행, 115행). 최신 콜백은 `handlers` ref 로 읽는다.
  - 요소를 맞추는 effect(124행부터 150행)는 `wanted` 의 id 로 지울 것과 더할 것을 정하고, 같은 id 가 있으면 `existing.data(el.data)` 로 값만 바꾼다. 새 요소가 생기면 `runLayout`(89행부터 93행, `cose`, `nodeRepulsion: () => 8000`, `idealEdgeLength: () => 90`, `padding: 40`)을 돌린다.
  - 선택 표시 effect(167행부터 173행)는 노드에만 `center`, `selected` class 를 붙인다.
  - 도구 줄(180행부터 209행)에 `graph-hops`, `graph-expand`, `graph-recenter`, `graph-fit`, `graph-status`(「항목 N · 관계 M」)가 있다.
  - 캔버스 div 는 `data-testid="graph-canvas"` 와 `data-layout-pending` 을 가진다(223행).
  - 「그래프에 나온 항목」 목록(248행부터 260행)의 `li[data-testid="graph-node"]` 는 `data-node-id`, `data-node-type`, `data-review-status` 를 가지고, 안의 button 이 `props.onSelect(n.id)` 를 부른다.
- `financial-workbench/web/src/components/Workspace.tsx` 가 그래프 상태를 들고 `GraphPanel` 에 넘긴다. `App.tsx` 는 작업 공간 탭이 아닐 때 `Workspace` 를 그리지 않는다. 그래서 `Workspace` 의 state 는 작업 공간을 떠날 때까지 남는다.
- 좁은 화면에서 그래프의 노드를 고르면 그래프 탭에 머물고 선택 막대(`graph-selection-bar`)가 나온다. 막대는 `graph.nodes` 에 고른 id 가 있을 때 나온다(`Workspace.tsx` 165행, 187행). 접힌 주장도 `graph.nodes` 에는 남아 있으므로 선을 눌러 고르면 같은 막대가 나온다.
- 캔버스 위의 선은 DOM 요소가 아니라 브라우저 테스트가 직접 고를 수 없다. 그래서 테스트는 캔버스의 data 속성과 「그래프에 나온 항목」 목록을 본다.
- 브라우저 테스트 `financial-workbench/web/e2e/workbench.spec.ts` 의 4번 테스트(「A 가 공급사 주변 그래프와 근거, 검토자를 확인한다」)는 phase 01 에서 `data-node-type` 으로 좁힌 상태다. 확장 뒤 문서 항목이 1개라고 기대한다. 접힌 보기에서는 문서가 목록에 나오지 않는다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주장 접기」 절, `financial-workbench/docs/code-architecture.md` 의 「웹 구조」 의 `web/src/lib/` 행과 「결정」, `financial-workbench/docs/prd.md` 의 「요구가 충족됐다고 보는 관측」

## 의도 메모

- 접기는 화면이 한다. 서버 계약은 phase 01 의 응답 그대로다. 접기와 펼치기는 보기 선택이라 서버 계약을 둘로 나누지 않는다(`code-architecture.md` 「결정」).
- 접기는 `graph.ts` 의 순수 함수로 둔다. Cytoscape 는 vitest 의 `node` 환경에서 그리지 않으므로 규칙은 함수에서 확인한다.
- 접은 선의 Cytoscape id 는 `claim:<주장 id>` 로 둔다. 주장 id 를 그대로 쓰면 보기를 바꿀 때 같은 id 의 노드가 남아 있는 동안 `existing.data(el.data)` 가 노드에 선의 값을 덮는다.
- 중심 노드가 주장이면 접지 않는다. 중심 노드는 언제나 그린다.
- 접힌 주장에만 걸린 근거 문서는 그리지도 목록에 넣지도 않는다. 근거는 선을 눌러 연 상세에서 본다. 중심 노드는 문서여도 그린다.
- 「주장을 따로 보기」 는 체크 상자로 둔다. 브라우저 테스트가 `setChecked` 와 `toBeChecked` 로 다룬다.
- 선 누르기는 브라우저 테스트로 확인하지 않는다. 캔버스 좌표가 배치마다 바뀌고, 좌표를 얻으려고 운영 코드에 테스트용 hook 을 두지 않는다. 목록의 접힌 주장 단추가 같은 `onSelect(주장 id)` 를 부르는 것을 근거로 삼는다. 선의 `tap` 처리는 작업 항목 2 의 한 줄이라 코드 리뷰로 확인한다.
- 접힌 주장의 선을 더블클릭하거나 「이웃 확장」 하면 주장의 이웃(주체, 대상, 근거 문서) 가운데 새로 오는 것이 숨긴 문서뿐이라 화면이 그대로일 수 있다. 의도한 동작이다. 근거 문서는 상세에서 보고, 그래프에서 보려면 「주장을 따로 보기」 를 켠다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. `financial-workbench/web/src/lib/graph.ts` 의 `collapseClaims`

```ts
/** 접힌 주장 하나. 주체에서 대상으로 가는 선 하나로 그린다 */
export interface ClaimEdge {
  /** 주장 id */
  claimId: string
  source: string
  target: string
  predicate: string | null
  reviewStatus: ReviewStatus | null
}

/** 화면에 그릴 그래프 */
export interface GraphDisplay {
  /** 그릴 노드. 접힌 주장과 접힌 주장에만 걸린 근거 문서는 빠진다 */
  nodes: GraphNode[]
  /** 그릴 관계. 접힌 주장에 닿은 관계는 빠진다 */
  edges: GraphEdge[]
  claimEdges: ClaimEdge[]
  /** 「그래프에 나온 항목」 목록. nodes 에 접힌 주장을 더한 것이고, 순서는 data.nodes 순서다 */
  listed: GraphNode[]
}

/** 주장을 선으로 접는다. 주체와 대상이 모두 그래프에 있는 주장만 접고, 중심 노드는 접거나 숨기지 않는다 */
export function collapseClaims(data: GraphData, centerId: string | null): GraphDisplay

/** 접지 않은 보기. 「주장을 따로 보기」 를 켰을 때 쓴다 */
export function expandedDisplay(data: GraphData): GraphDisplay
```

- 접을 주장: `type === 'Claim'` 이고 id 가 `centerId` 가 아니며, `data.edges` 에 그 주장에서 나가는 `SUBJECT` 관계와 `OBJECT` 관계가 하나씩 있다. `mergeGraph` 가 끝점 없는 관계를 버리므로 관계가 있으면 끝 노드도 있다.
- 접은 주장의 `ClaimEdge` 는 `source` 가 주체 id, `target` 이 대상 id, `predicate` 와 `reviewStatus` 는 그 주장 노드의 값이다.
- 빠지는 관계: `source` 나 `target` 이 접은 주장인 관계 전부다.
- 숨기는 노드: `centerId` 가 아니고, 닿은 관계가 하나 이상 있으며, 닿은 관계가 모두 접은 주장에서 오는 `SUPPORTED_BY` 인 노드다.
- `expandedDisplay` 는 `nodes` 와 `listed` 가 `data.nodes`, `edges` 가 `data.edges`, `claimEdges` 가 빈 배열이다.

### 2. `financial-workbench/web/src/components/GraphPanel.tsx`

- `Props` 에 `claimsAsNodes: boolean` 과 `onClaimsAsNodesChange: (value: boolean) => void` 를 더한다.
- `const display = useMemo(() => (claimsAsNodes ? expandedDisplay(data) : collapseClaims(data, centerId)), [data, centerId, claimsAsNodes])`.
- `toElements(display, ontology)` 로 바꾼다. 노드와 일반 관계는 지금과 같다. 접은 주장마다 관계 요소 하나를 더한다.

  ```ts
  { group: 'edges', data: { id: `claim:${c.claimId}`, source: c.source, target: c.target, kind: 'claim', claimId: c.claimId,
    type: 'Claim', label: c.predicate ? predicateLabel(ontology, c.predicate) : '', reviewStatus: c.reviewStatus ?? '' } }
  ```
- `STYLE` 에 더한다.
  - `edge[kind = "claim"]`: `width: 2.5`, `'line-color': '#dc2626'`, `'target-arrow-color': '#dc2626'`, `'font-size': 10`. 색은 `TYPE_COLORS.Claim` 과 같다.
  - `edge[kind = "claim"][reviewStatus = "DRAFT"]`: `'line-style': 'dashed'`.
  - `edge[kind = "claim"][reviewStatus = "REJECTED"]`: `opacity: 0.55`.
  - `edge.selected`: `width: 4`, `'line-color': '#111827'`, `'target-arrow-color': '#111827'`.
- 이벤트를 더한다. `cy.on('tap', 'edge[kind = "claim"]', (evt) => handlers.current.onSelect(evt.target.data('claimId')))`, `cy.on('dbltap', 'edge[kind = "claim"]', (evt) => handlers.current.onExpand(evt.target.data('claimId')))`.
- 요소를 맞추는 effect 의 의존성은 `[display, ontology]` 다.
- 선택 표시 effect 는 `cy.elements().removeClass('center selected')` 로 지우고, `selectedId` 가 있으면 노드 `cy.getElementById(selectedId)` 와 선 `cy.getElementById('claim:' + selectedId)` 에 `selected` 를 붙인다. 의존성에 `display` 를 넣는다.
- 도구 줄의 「화면 맞춤」 뒤에 체크 상자를 둔다. `<label className="field-inline"><input type="checkbox" data-testid="graph-claims-as-nodes" checked={claimsAsNodes} onChange={(e) => props.onClaimsAsNodesChange(e.target.checked)} /> 주장을 따로 보기</label>`.
- `graph-status` 는 `항목 {display.listed.length} · 관계 {display.edges.length + display.claimEdges.length}` 다. 주장이 없는 그래프에서는 지금과 같은 수가 나온다.
- 캔버스 div 에 `data-collapsed-claims={String(display.claimEdges.length)}` 를 더한다.
- 「그래프에 나온 항목」 목록은 `display.listed` 를 그린다. 제목의 개수도 `display.listed.length` 다. `li` 에 `data-collapsed={String(접힌 주장이면 true)}` 를 더한다. 단추는 지금처럼 `props.onSelect(n.id)` 다.
- `graph-fit` 의 `disabled` 와 `empty` 판정은 지금처럼 `data.nodes` 를 쓴다.
- 범례의 안내 문구를 `점선: {labels.status('DRAFT')} · 흐림: {labels.status('REJECTED')} · 주장 선을 누르면 상세 · 더블클릭: 이웃 확장` 으로 바꾼다.

### 3. `GraphPanel.tsx` 의 배치 간격과 화면 맞춤

- `runLayout` 의 옵션을 `{ name: 'cose', animate: false, fit: true, padding: 48, nodeRepulsion: () => 20000, idealEdgeLength: () => 140, nodeOverlap: 20, componentSpacing: 120 }` 로 바꾼다.
- `layoutstop` 에서 `cy.fit(undefined, 48)` 을 부른 뒤 `limitZoom(cy)` 를 부른다.
- `graph-fit` 단추와 다시 보일 때의 맞춤(161행부터 164행)도 여백을 48 로 맞춘다.
- 이웃 확장은 새 요소를 더하므로 요소를 맞추는 effect 가 배치와 맞춤을 다시 돈다. 보기를 바꿀 때도 선이나 노드가 새로 생기므로 같다.

### 4. `financial-workbench/web/src/components/Workspace.tsx`

- `const [claimsAsNodes, setClaimsAsNodes] = useState(false)` 를 두고 `GraphPanel` 에 `claimsAsNodes={claimsAsNodes}`, `onClaimsAsNodesChange={setClaimsAsNodes}` 를 넘긴다.
- 넓은 배치와 탭 배치가 같은 `graphPanel` 요소를 쓰므로 다른 곳은 고치지 않는다.

### 5. `financial-workbench/web/TESTIDS.md`

「작업 공간: 가운데 그래프」 절을 고친다.

- `graph-status` 행: 「항목 N · 관계 M」. N 은 「그래프에 나온 항목」 수, M 은 그린 관계와 접은 주장 선을 합한 수다.
- `graph-claims-as-nodes` 행을 더한다. 「주장을 따로 보기」 체크 상자. 켜면 주장을 노드로 그린다. 작업 공간을 떠날 때까지 남는다.
- `graph-canvas` 행에 `data-collapsed-claims`(선으로 접은 주장 수. 「주장을 따로 보기」 를 켜면 `"0"`)를 적는다.
- `graph-node` 행에 `data-collapsed`(`"true"` 면 선으로 접힌 주장)를 적고, 접힌 주장에만 걸린 근거 문서는 목록에 없다고 적는다.

### 6. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/lib/graph.test.ts` 에 `describe('collapseClaims')` 를 더한다. 노드 `a`(Company), `b`(Company), `c`(Claim, `predicate: 'SUPPLIES_TO'`, `reviewStatus: 'DRAFT'`), `d`(Document)와 관계 `c→a SUBJECT`, `c→b OBJECT`, `c→d SUPPORTED_BY` 를 기본으로 쓴다.
  1. 중심 `a`: `nodes` 의 id 는 `['a', 'b']`, `edges` 는 빈 배열, `claimEdges` 는 `[{ claimId: 'c', source: 'a', target: 'b', predicate: 'SUPPLIES_TO', reviewStatus: 'DRAFT' }]`, `listed` 의 id 는 `['a', 'c', 'b']`(입력 순서가 `a, c, b, d` 일 때)다.
  2. `OBJECT` 관계가 없으면(대상이 그래프에 없음) 주장을 접지 않는다. `nodes` 에 `c` 와 `d` 가 있고 `claimEdges` 는 비어 있다.
  3. `d` 가 접히지 않는 다른 주장 `c2`(`OBJECT` 없음)도 근거로 받치면 `d` 는 숨기지 않는다.
  4. 중심이 `d` 면 `c` 는 접히고 `d` 는 `nodes` 에 남는다.
  5. 중심이 `c` 면 접지 않는다. `nodes` 에 `c` 가 있고 `claimEdges` 는 비어 있다.
  6. `expandedDisplay` 는 입력 노드와 관계를 그대로 돌려주고 `claimEdges` 가 비어 있다.
- `financial-workbench/web/e2e/workbench.spec.ts` 의 4번 테스트를 접힌 보기 기준으로 바꾼다.
  1. `searchAndOpen(pageA, data.supplier)` 뒤 `graph-canvas` 의 `data-collapsed-claims` 가 `"1"` 이다.
  2. 근거 카드에서 `data-claim-id` 를 읽는다. `[data-testid="graph-node"][data-node-id="<claimId>"]` 가 `data-collapsed="true"`, `data-review-status="REVIEWED"` 이고 `${data.supplier} → ${data.customer} 공급한다` 를 담는다. 고객사 Company 항목이 1개다.
  3. 기존 근거 카드 확인과 `shot(pageA, '04-graph-and-evidence')` 는 그대로 둔다.
  4. 접힌 주장 항목의 단추를 누르면 `detail-panel` 의 `data-node-id` 가 그 주장이다. `graph-expand` 를 누르고 `graph-loading` 이 0개가 될 때까지 기다린다(`toHaveCount(0)`). 확장 전에도 아래 5 의 개수가 참이라, 기다리지 않으면 확장이 끝났는지 알 수 없다.
  5. 확장 뒤 공급사와 고객사 Company 항목은 1개씩이고 문서 항목(`[data-node-type="Document"]` 를 `data.docTitle` 로 좁힘)은 0개다. `data-collapsed-claims` 는 `"1"` 이다.
  6. `graph-claims-as-nodes` 를 `setChecked(true)` 하면 `data-collapsed-claims` 가 `"0"` 이고, 문서 항목이 1개이며, 주장 항목의 `data-collapsed` 가 `"false"` 다. 여기서 `shot(pageA, '04-expanded')` 를 남긴다.
  7. `setChecked(false)` 로 되돌리면 `data-collapsed-claims` 가 다시 `"1"` 이다. 뒤 테스트가 기본 보기에서 돈다.
- `financial-workbench/web/e2e/mobile.spec.ts` 는 고치지 않는다. 주장이 없는 그래프라 `graph-status` 의 「항목 2 · 관계 1」 이 그대로여야 한다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/graph.test.ts
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
grep -q 'data-collapsed-claims' financial-workbench/web/src/components/GraphPanel.tsx
grep -q 'graph-claims-as-nodes' financial-workbench/web/TESTIDS.md
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan006 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan006 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 두 project 가 모두 통과해야 한다. `mobile` 이 통과하면 좁은 화면의 그래프 탭과 선택 막대가 그대로 동작한다는 근거다.
- `04-graph-and-evidence.png` 에서 공급사와 고객사 사이에 「공급한다」 선 하나가 보이고 마름모가 없는지, `04-expanded.png` 에서 노드 이름이 서로 덮이지 않는지 눈으로 본다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/lib/graph.ts` | 수정 |
| `financial-workbench/web/src/lib/graph.test.ts` | 수정 |
| `financial-workbench/web/src/components/GraphPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/Workspace.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
