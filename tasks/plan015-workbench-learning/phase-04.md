# Phase 04. 근거 따라가기 화면, 이해 표시 토글, 개념 칩

**Execution profile**: deep

## 목표

웹에 근거 따라가기 화면(`/trace?node=`)과 이해 표시 토글, 개념 칩을 만들고, 작업 공간 상세와 개념 지도 타입 칸에서 근거 따라가기를 연다.

**범위 외**: 공부 탭, 상단 탭 넷, 개념 상세 절, 개념 지도 글자 크기(phase 05), e2e(phase 06).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」(`/trace` 줄과 push 표), 「개념 지도」(최근 항목의 「근거 따라가기」), 「상세 칸: 읽기 카드」(버튼 줄, 내 이해, 개념 줄), 「근거 따라가기」, 「내 이해 표시」, 「개념 설명」, 「관계 문장」, 「조사 고르기」. 계약은 `financial-workbench/docs/api-contract.md` 의 「노드」(`NodeDetail.concepts`, `ConceptRef`), 「근거 따라가기」, 「내 이해 표시」.

- phase 02, 03 이 서버에 만든 것: `GET /api/nodes/{id}/trace`, `GET|PUT|DELETE /api/me/knowledge/{nodeId}`, `GET /api/me/knowledge`, `GET /api/me/knowledge/summary`, `NodeDetail.concepts`, 서버 화면 경로 `/trace`, `/study`.
- 웹 구조: `financial-workbench/docs/code-architecture.md` 의 「웹 구조」. 새 화면 부품은 `web/src/components/learning/`, 순수 함수는 `web/src/lib/trace.ts` 다. 부품은 shadcn(`web/src/components/ui/`)과 기존 `TypeBadge`, `StatusBadge` 를 쓴다.
- 주소: `web/src/routes.ts` 의 `TabKey`, `TAB_PATHS`, `tabOfPath`. `App.tsx` 는 `activeTab` 으로 화면을 고르고(`activeTab === 'map' && <ConceptMapTab …/>`), `go(url, replace)` 로 옮기고, `focusNode(id)` 가 작업 공간에서 상세를 연다. 로그인 뒤 돌아갈 주소 검사(`routes.ts` 의 returnTo 검사 함수)는 `TAB_PATHS` 의 경로만 받으므로 `trace` 를 더하면 `/trace` 링크도 로그인을 거쳐 열린다.
- 관계 문장은 `web/src/lib/relationSentence.ts` 의 `relationSentenceParts(o, relationship, from, to)` 와 `politeEnding`, 조사는 `web/src/lib/labels.ts` 의 `withJosa` 다. 기존 사용처는 `web/src/components/RelationshipSection.tsx` 다.
- API 래퍼는 `web/src/api/client.ts` 의 `api` 객체와 `request<T>(method, path, body)`, 타입은 `web/src/api/types.ts` 다. `DELETE` 의 204 응답을 `request<void>` 가 받는지 `request` 구현을 읽고 확인한다(`auth.logout` 이 같은 모양이다).
- 웹 단위 테스트는 `react-dom/server` 렌더링이다. `web/src/components/testSupport.tsx` 의 `testOntology` 와 `withApp(children, ontology, user, initialPath)` 를 쓴다. `testOntology` 에 이 phase 가 쓰는 타입과 관계(Concept, Decision, Valuation, `USES_CONCEPT`, `HAS_DECISION`, `BASED_ON`, `EVIDENCED_BY`)가 없으면 더한다. 다른 테스트가 `testOntology` 의 타입 수나 순서를 단언하는지 `git grep -n "testOntology" -- financial-workbench/web/src` 로 확인하고, 깨지면 그 테스트의 기대값을 이 phase 에서 고친다.

## 의도 메모

- 근거 따라가기는 작업 공간 안의 칸이 아니라 전용 경로다. 단계 카드가 세로로 길어 작업 공간의 세 칸에 넣으면 좁고, 주소 하나로 공유하기 쉽다.
- 이해 표시는 낙관적 갱신을 하지 않는다. 응답을 받은 뒤 바꾼다. 실패 때 되돌리는 갈래를 만들지 않기 위해서다.
- 상태 색은 글자와 함께 보인다(「근거 있음」, 「초안 주장만」, 「근거 없음」).

## 작업 항목

### 1. `web/src/api/types.ts`, `web/src/api/client.ts`

계약 그대로 `ConceptRef`, `KnowledgeLevel = 'KNOWN' | 'UNSURE' | 'LEARNING'`, `KnowledgeMark`, `TraceClaim`, `TraceMissing`, `TraceStep`(`status: 'SUPPORTED' | 'PARTIAL' | 'MISSING'`), `TraceDependent`, `TraceView`, `StudyItem`, `KnowledgeSummary` 를 더하고 `NodeDetail` 에 `concepts: ConceptRef[]` 를 더한다. `api.nodes.trace(id)`, `api.me.knowledge.get(nodeId)`, `put(nodeId, level, note)`, `remove(nodeId)`, `list({ levels, page, size })`, `summary()` 를 더한다. `NodeDetail` 을 만드는 테스트 픽스처가 있으면 `concepts: []` 를 넣는다(`git grep -n "claimsTruncated" -- financial-workbench/web/src`).

### 2. `web/src/routes.ts`, `web/src/routes.test.ts`

- `TabKey` 에 `'trace'`, `TAB_PATHS.trace = '/trace'`. `TOP_TABS` 와 `moreItems` 에는 넣지 않는다.
- `interface TraceQuery { node: string | null }`, `parseTraceQuery(search)`, `traceSearch(q)`(없으면 빈 문자열). 기존 `parseMapQuery`, `mapSearch` 모양을 따른다.
- 테스트: `/trace?node=a` 를 읽고 쓰며, `tabOfPath('/trace')` 가 `'trace'` 이고, returnTo 검사가 `/trace?node=a` 를 받는다.

### 3. `web/src/lib/trace.ts`, `web/src/lib/trace.test.ts`

- `stepCards(view: TraceView): TraceStep[]`: 화면 순서. 깊은 단계가 위, 지금 항목이 맨 아래, 같은 깊이는 응답 순서.
- `traceSummary(view)`: `{ steps, supported, partial, missing, unsure }`. `unsure` 는 `knowledge?.level === 'UNSURE'` 인 단계 수.
- `stepRole(view, step)`: `'root' | 'origin' | 'middle'`(지금 항목, 가장 깊은 단계, 나머지). 지금 항목 하나뿐이면 `'root'`.
- 테스트: 깊이 0, 1, 2 와 같은 깊이 둘이 섞인 응답으로 순서와 개수, 역할을 확인한다. 단계가 지금 항목 하나인 응답도 확인한다.

### 4. `web/src/components/learning/KnowledgeMarkControls.tsx`

Props `{ nodeId: string; mark: KnowledgeMark | null | undefined; onChange?: (mark: KnowledgeMark) => void }`. `undefined` 는 「아직 읽지 않음」 이라 마운트할 때 `api.me.knowledge.get(nodeId)` 로 읽는다. `null` 은 「표시 없음」 이라 읽지 않는다. 근거 따라가기는 응답의 `knowledge`(`null` 포함)를 그대로 넘기므로 단계마다 요청이 나가지 않는다(`docs/flow.md` 「내 이해 표시」). 동작은 `docs/flow.md` 「내 이해 표시」 대로다. testid:

| testid | 요소 |
| --- | --- |
| `knowledge-controls` | 감싸는 요소. `data-level` 은 지금 값(없으면 `none`) |
| `knowledge-known`, `knowledge-unsure` | 토글. `aria-pressed` |
| `knowledge-learning-badge` | 「공부 중」 글자. `LEARNING` 일 때만 |
| `knowledge-note-open` | 「메모 남기기」 |
| `knowledge-note-input`, `knowledge-note-save`, `knowledge-note-cancel` | 메모 입력칸(1000자 `maxLength`)과 단추 |
| `knowledge-note` | 「내 메모: …」 |
| `knowledge-error` | 실패 이유 |

### 5. `web/src/components/learning/ConceptChips.tsx`

Props `{ concepts: ConceptRef[]; onOpen: (id: string) => void }`. 비면 아무것도 그리지 않는다. 넓은 화면(`useMediaQuery('(min-width: 1024px)')`)은 마우스를 올리거나 초점이 가면 한 줄 정의를 보이고 누르면 `onOpen`, 좁은 화면은 누르면 한 줄 정의와 「개념 설명 전체 보기」 를 보인다. testid: `concept-chips`, `concept-chip`(`data-concept-id`), `concept-summary`, `concept-open`.

### 6. `web/src/components/learning/TracePage.tsx`

`docs/flow.md` 「근거 따라가기」 대로 그린다. Props `{ nodeId: string | null; onOpenNode: (id: string) => void; onTrace: (id: string) => void }`. 단계 문장은 `relationSentenceParts(ontology, step.relationshipType, 이 단계 이름, 아래 단계 이름)` 로 만들고 이 단계 이름을 굵게 한다. 설명 칸은 그 타입의 `description` 속성, 결정은 `reason` 속성을 그대로 보인다(속성이 온톨로지에 없으면 보이지 않는다). 후보 잇기는 `api.relationships.create(missing.relationshipType, candidate.id, step.node.id)` 뒤 다시 읽는다. testid:

| testid | 요소 |
| --- | --- |
| `trace-page` | 화면. `data-node-id` |
| `trace-empty` | `node` 가 없을 때의 안내. `trace-open-workspace` 단추 포함 |
| `trace-not-found`, `trace-error`, `trace-retry` | 404 안내, 그 밖의 오류와 「다시 시도」 |
| `trace-title` | 제목 |
| `trace-summary` | 요약 줄. `data-steps`, `data-supported`, `data-partial`, `data-missing`, `data-unsure` |
| `trace-truncated` | 잘렸다는 안내 |
| `trace-step` * | 단계 카드. `data-node-id`, `data-depth`, `data-status`, `data-role` |
| `trace-step-name` * | 단계 이름 단추. 누르면 그 항목으로 다시 따라간다 |
| `trace-step-sentence` * | 아래 단계와의 관계 문장 |
| `trace-step-description` * | 설명 칸의 글 |
| `trace-step-document` *, `trace-step-claim` * | 근거 문서 한 줄(링크), 주장 한 줄(`data-review-status`) |
| `trace-step-no-evidence` *, `trace-step-attach` * | 「근거 문서가 아직 없습니다.」, 「＋ 근거 문서 붙이기」 |
| `trace-missing` * | 아직 잇지 않은 관계. `data-relationship` |
| `trace-candidate-link` * | 「{후보} 잇기」. `data-candidate-id` |
| `trace-missing-open` * | 「＋ 잇기」 |
| `trace-missing-error` * | 잇기 실패 이유 |
| `trace-dependents`, `trace-dependent` * | 「이 항목에 기대는 것」 절과 한 줄 |
| `trace-open-workspace` | 「작업 공간에서 보기」 |

단계마다 `KnowledgeMarkControls`(응답의 `knowledge` 를 `mark` 로 넘기고 `onChange` 로 그 단계와 요약을 바꾼다)와 `ConceptChips`(누르면 `onOpenNode`)를 둔다.

### 7. `web/src/App.tsx`

`activeTab === 'trace'` 이면 `<TracePage nodeId={parseTraceQuery(location.search).node} onOpenNode={focusNode} onTrace={(id) => go(TAB_PATHS.trace + traceSearch({ node: id }))} />`. 상세와 지도에서 쓸 `openTrace(id)` 를 같은 `go` 로 만든다. `Workspace` 와 `ConceptMapTab` 에 `onTrace` prop 으로 넘긴다.

### 8. `web/src/components/DetailPanel.tsx`, `web/src/components/Workspace.tsx`

- `Props` 에 `onTrace: (id: string) => void`. 버튼 줄의 「그래프 중심으로」 다음에 「근거 따라가기」(`data-testid="node-trace"`, 보관된 항목에는 없다).
- 버튼 줄을 `export function NodeActions({ node, canEdit, editing, onEdit, onFocus, onTrace, menu })` 로 떼어 낸다(`menu` 는 지금의 「⋯」 메뉴 요소). 「근거 따라가기」 는 이 부품 안에 있다.
- 머리 아래의 이해 표시와 개념 칩을 `export function NodeLearningRow({ node, concepts, onOpenConcept })` 로 묶는다. 안에서 `KnowledgeMarkControls`(`mark={undefined}`, `key={node.id}`)와 `ConceptChips`(개념 노드면 그리지 않는다)를 그린다. `DetailPanel` 은 `onOpenConcept` 에 `onSelect` 를 넘긴다.
- `Workspace` 는 받은 `onTrace` 를 `DetailPanel` 로 넘긴다. `DetailPanel` 을 렌더링하는 다른 곳이 있으면 `git grep -n "<DetailPanel" -- financial-workbench/web/src` 로 찾아 함께 고친다.

### 9. `web/src/components/map/ConceptMapTab.tsx`, `web/src/components/map/TypePanel.tsx`

`onTrace` prop 을 받아 넘긴다. 최근 항목 줄마다 「근거 따라가기」(`data-testid="map-recent-trace"`, `data-node-id`)를 둔다.

### 10. 테스트

- `web/src/components/learning/learning.test.tsx`: `TracePage` 에 단계 넷(결정 `MISSING` 과 `missing` 하나·후보 하나, 종목, 기업 `PARTIAL`, 병목 `SUPPORTED`)을 담은 응답을 넘겨 렌더링하는 순수 표시 부품(예: `TraceView` 를 props 로 받는 `TraceBody`)을 만들고, 단계 순서(`data-depth` 가 큰 것부터), 요약 줄 `data-*`, 결정 카드의 `trace-missing` 과 편집자의 `trace-candidate-link`, 열람자에게 `trace-candidate-link` 와 `trace-step-attach` 가 없음을 확인한다. `KnowledgeMarkControls` 가 `UNSURE` 일 때 `knowledge-unsure` 가 `aria-pressed="true"`, `LEARNING` 일 때 `knowledge-learning-badge` 가 있음을 확인한다. `ConceptChips` 가 빈 목록이면 아무것도 그리지 않음을 확인한다.
- `web/src/components/DetailPanel.test.tsx`: `DetailPanel` 은 effect 로 상세를 받은 뒤에 버튼 줄을 그려 정적 렌더링에 나오지 않는다. 그래서 떼어 낸 `NodeActions` 를 직접 렌더링해 보관되지 않은 항목에 `node-trace` 가 있고 보관된 항목에는 없음을, `NodeLearningRow` 를 렌더링해 `concepts` 둘이면 `concept-chip` 이 둘이고 개념 노드면 없음을 확인한다.
- `web/src/components/map/map.test.tsx`: 이 파일의 `render` 는 `renderToStaticMarkup` 이라 effect 로 받는 최근 항목이 그려지지 않는다. `TypePanel.tsx` 의 최근 항목 목록을 `export function RecentItems({ items, onOpenNode, onTrace })` 로 떼어 내고, 항목 둘을 넘겨 `map-recent-item` 과 `map-recent-trace` 가 둘씩 있는지 확인한다. `ConceptMapTab` 에 새 prop `onTrace` 를 넘기도록 기존 `render` 도 고친다.

### 11. `financial-workbench/web/TESTIDS.md`

위 testid 를 새 절 「근거 따라가기와 이해 표시」 와 기존 「상세」, 「개념 지도」 절에 더한다.

## 검증

```bash
cd financial-workbench/web && npx vitest run src/lib/trace.test.ts src/routes.test.ts src/components/learning/learning.test.tsx src/components/DetailPanel.test.tsx src/components/map/map.test.tsx
cd financial-workbench/web && npm run typecheck && npm test && npm run build
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/routes.ts` | 수정 |
| `financial-workbench/web/src/routes.test.ts` | 수정 |
| `financial-workbench/web/src/lib/trace.ts` | 신규 |
| `financial-workbench/web/src/lib/trace.test.ts` | 신규 |
| `financial-workbench/web/src/components/learning/KnowledgeMarkControls.tsx` | 신규 |
| `financial-workbench/web/src/components/learning/ConceptChips.tsx` | 신규 |
| `financial-workbench/web/src/components/learning/TracePage.tsx` | 신규 |
| `financial-workbench/web/src/components/learning/learning.test.tsx` | 신규 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.test.tsx` | 수정 |
| `financial-workbench/web/src/components/Workspace.tsx` | 수정 |
| `financial-workbench/web/src/components/map/ConceptMapTab.tsx` | 수정 |
| `financial-workbench/web/src/components/map/TypePanel.tsx` | 수정 |
| `financial-workbench/web/src/components/map/map.test.tsx` | 수정 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
