# Phase 05. 공부 탭, 개념 상세 절, 개념 지도 글자 크기

**Execution profile**: deep

## 목표

상단 탭에 「공부」(`/study`)를 더해 내 공부 목록과 능력 범위를 보이고, 개념 노드의 상세에 강조한 사람, 비판한 사람, 관련 개념, 이 개념을 쓴 곳 절을 더하고, 넓은 화면 개념 지도의 글자가 읽히게 한다.

**범위 외**: e2e(phase 06).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」(`/study` 줄과 `level`, `page`), 「공부」, 「개념 설명」 의 「개념 상세」, 「개념 지도」(글자 크기와 지도 높이 600px), 「좁은 화면의 작업 공간」(머리글 탭 넷). 계약은 `financial-workbench/docs/api-contract.md` 의 「내 이해 표시」(`StudyItem`, `KnowledgeSummary`). 결정은 `financial-workbench/docs/adr/011-learning-marks-and-trace.md`.

- phase 04 가 만든 것: `web/src/api/types.ts` 의 `StudyItem`, `KnowledgeSummary`, `KnowledgeMark`, `api.me.knowledge.*`, `web/src/routes.ts` 의 `trace` 경로, `web/src/lib/trace.ts`, `web/src/components/learning/KnowledgeMarkControls.tsx`, `ConceptChips.tsx`, `TracePage.tsx`, `App.tsx` 의 `openTrace`, `DetailPanel` 의 `onTrace`.
- 머리글 탭: `web/src/components/header/TopTabs.tsx` 의 `TOP_TAB_LABEL` 과 `web/src/routes.ts` 의 `TOP_TABS`. 폭 390px 에서 한 줄을 지켜야 한다(`docs/flow.md` 「좁은 화면의 작업 공간」). 기존 탭 단추 클래스 `HEADER_TAB_CLASS` 의 `px-2` 를 그대로 쓰고 넘치면 좁은 화면의 글자 간격만 줄인다.
- 개념 지도: `web/src/components/map/ConceptMapTab.tsx` 의 `STYLE`(노드 `font-size: 12`, 선 `font-size: 10`), `limitZoom(cy)`, `layoutstop` 처리, 지도 컨테이너 `h-[360px] … lg:h-[520px]`, testid `concept-map-canvas`(`data-node-count`, `data-layout-done`).
- 개념 상세 데이터는 `GET /api/nodes/{id}` 의 `relationships`(`RelationshipView` 의 `from`, `to` 에 타입이 있다)와 `claims`(`ClaimView` 의 `subject`, `object`, `properties.predicate`, `reviewStatus`)로 만든다.

## 의도 메모

- `min-zoomed-font-size` 는 작아진 글자를 숨기기만 해서 버렸다(`docs/code-architecture.md` 「결정」). 글자 크기를 배율로 나눈다.
- 강조, 비판 절의 제목은 주장 종류 키 `ADVOCATES`, `CRITICIZES` 로 고른다. 그 밖의 종류는 표시 이름으로 「{표시 이름} 주장」 절을 만든다. 온톨로지에서 두 키가 빠져도 화면은 깨지지 않는다.
- 공부 목록의 할 일은 서버 응답의 `documents`, `concepts` 로 화면이 만든다. 서버에 할 일 목록을 두지 않는다.

## 작업 항목

### 1. `web/src/routes.ts`, `web/src/routes.test.ts`

- `TabKey` 에 `'study'`, `TAB_PATHS.study = '/study'`, `TOP_TABS = ['map', 'workspace', 'list', 'study']`.
- `interface StudyQuery { level: 'UNSURE' | 'LEARNING' | null; page: number }`, `parseStudyQuery`, `studySearch`(기본값은 쓰지 않는다. 모르는 `level` 은 `null`).
- 테스트: `/study?level=LEARNING&page=2` 를 읽고 쓰고, 기본값이면 빈 문자열이고, `level=WRONG` 은 `null` 이다. `TOP_TABS` 끝이 `study` 다.

### 2. `web/src/components/header/TopTabs.tsx`, `web/src/components/tabs.test.tsx`

`TOP_TAB_LABEL.study = '공부'`. `tabs.test.tsx` 가 탭 수나 이름을 단언하면 넷으로 고친다. testid 는 `tab-study` 다.

### 3. `web/src/lib/trace.ts`, `web/src/lib/trace.test.ts` 에 공부 규칙을 더한다

- `studyContextText(item: StudyItem): string`: 결정이 아니면 「{결정 이름}의 {N}단계 위」 를 쉼표로 잇고(앞 셋), 항목이 결정(`depth 0`)이면 「투자 결정」, 없으면 「이어진 투자 결정이 없습니다」.
- `studyTodos(item): { kind: 'document' | 'concept' | 'attach'; label: string; url?: string; id?: string }[]`: 문서마다 「「{제목}」 읽기」, 개념마다 「개념 「{이름}」 설명 읽기」, 문서가 없으면 `attach` 하나(「근거 문서가 없습니다. 공부한 자료를 근거로 붙여 주세요」).
- `competenceText(summary)`: 「투자 결정 {total}개 가운데 {understood}개는 근거를 다 이해함」, `total` 이 0 이면 「아직 투자 결정이 없습니다.」, `decisionsTruncated` 면 끝에 「(앞 200개만 셌습니다)」.
- 테스트: 결정 둘인 맥락, 결정 자신, 맥락 없음, 문서 둘과 개념 하나, 문서 없음, 결정 0 개와 잘린 요약.

### 4. `web/src/lib/mapFont.ts`, `web/src/lib/mapFont.test.ts`

- `readableFontSize(base: number, minPx: number, zoom: number): number` 는 `zoom >= 1` 이면 `base`, 아니면 `Math.max(base, minPx / zoom)` 다.
- `MAP_NODE_FONT = { base: 12, minPx: 13 }`, `MAP_EDGE_FONT = { base: 10, minPx: 11 }`.
- 테스트: 배율 1.2, 1, 0.5, 0.2 에서 값과, 그 값에 배율을 곱한 화면 크기가 `minPx` 이상인지.

### 5. `web/src/components/map/ConceptMapTab.tsx`

- `layoutstop` 의 `limitZoom` 뒤와 `cy.on('zoom')` 에서 노드와 선의 `font-size` 를 `readableFontSize` 로 다시 둔다(`cy.style().selector('node').style('font-size', …).update()` 처럼 스타일만 바꾸고 요소는 다시 놓지 않는다).
- 컨테이너에 `data-node-font-px`(화면에 그려지는 노드 글자 크기, `font-size × zoom` 을 반올림한 정수)를 둔다.
- 넓은 화면 지도 높이를 `lg:h-[600px]` 로 바꾼다.

### 6. `web/src/components/learning/StudyTab.tsx`

`docs/flow.md` 「공부」 대로 그린다. Props `{ onOpenNode: (id: string) => void; onTrace: (id: string) => void }`. 주소의 `level`, `page` 로 `api.me.knowledge.list({ levels: level ? [level] : ['UNSURE', 'LEARNING'], page, size: 20 })` 와 `api.me.knowledge.summary()` 를 읽는다. 「공부 중」, 「이해했어요」 는 `api.me.knowledge.put` 뒤 둘을 다시 읽는다. 메모는 `KnowledgeMarkControls` 를 쓰지 않고 카드 안의 입력칸으로 같은 `put` 을 부른다(카드의 `level` 을 유지한다). 쪽 넘기기는 기존 `web/src/components/Pager.tsx` 를 쓴다. testid:

| testid | 요소 |
| --- | --- |
| `study-tab` | 화면 |
| `study-counts` | 개수 줄. `data-known`, `data-unsure`, `data-learning` |
| `study-competence` | 능력 범위 줄. `data-total`, `data-understood` |
| `study-filter` * | 「잘 모름」, 「공부 중」 칩. `data-level`, `aria-pressed` |
| `study-item` * | 항목 카드. `data-node-id`, `data-level`, 보관이면 `data-archived="true"` |
| `study-item-name` *, `study-item-context` *, `study-item-note` * | 이름 단추(작업 공간 상세를 연다), 단계 맥락, 내 메모 |
| `study-todo` * | 할 일 한 줄. `data-kind` |
| `study-trace` *, `study-learning` *, `study-known` *, `study-note-open` * | 단추 |
| `study-empty`, `study-error`, `study-retry` | 빈 상태, 오류와 「다시 시도」 |

### 7. `web/src/App.tsx`

`activeTab === 'study'` 이면 `<StudyTab onOpenNode={focusNode} onTrace={openTrace} />`.

### 8. `web/src/components/learning/ConceptSections.tsx`, `web/src/components/DetailPanel.tsx`

- `ConceptSections({ detail, onSelect })`: 개념 노드 상세에서 `docs/flow.md` 「개념 상세」 의 표대로 절을 만든다. 「관련 개념」 은 양 끝이 모두 Concept 인 관계의 상대, 「이 개념을 쓴 곳」 은 `to` 가 이 개념이고 `from` 이 Concept 가 아닌 보관되지 않은 관계의 `from` 이다. 강조와 비판은 `claims` 가운데 `object.id` 가 이 개념인 것을 `properties.predicate` 로 나눈다. testid: `concept-sections`, `concept-section`(`data-section` 은 `advocates`, `criticizes`, `related`, `used-by`, 그 밖의 주장 종류는 `predicate-<키>`), `concept-section-item`, `concept-section-empty`.
- `DetailPanel` 은 `node.type === 'Concept'` 일 때 머리 아래에 `ConceptSections` 를 그린다(개념 칩 대신).

### 9. 테스트

- `web/src/components/learning/learning.test.tsx` 에 더한다: `StudyTab` 의 표시 부품(예: 항목 카드 `StudyCard`, 요약 `StudySummary` 를 props 로 받는 부품으로 떼어 낸다)이 보관된 항목에 `study-trace` 를 그리지 않고 `data-archived="true"` 를 두는지, `LEARNING` 항목에 `study-learning` 이 없는지, 할 일 줄 수가 `studyTodos` 와 같은지. `ConceptSections` 가 `ADVOCATES` 주장 하나, 관련 개념 하나, 쓴 곳 하나인 상세에서 네 절과 그 항목을 그리고, 빈 절에 `concept-section-empty` 를 그리는지.
- `web/src/components/tabs.test.tsx`: 상단 탭에 `tab-study` 가 있다.

### 10. `financial-workbench/web/TESTIDS.md`

`tab-study` 를 상단 줄에, 새 절 「공부」 와 「개념 상세」 를, `concept-map-canvas` 설명에 `data-node-font-px` 를 더한다.

## 검증

```bash
cd financial-workbench/web && npx vitest run src/lib/trace.test.ts src/lib/mapFont.test.ts src/routes.test.ts src/components/learning/learning.test.tsx src/components/tabs.test.tsx
cd financial-workbench/web && npm run typecheck && npm test && npm run build
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/routes.ts` | 수정 |
| `financial-workbench/web/src/routes.test.ts` | 수정 |
| `financial-workbench/web/src/components/header/TopTabs.tsx` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 수정 |
| `financial-workbench/web/src/lib/trace.ts` | 수정 |
| `financial-workbench/web/src/lib/trace.test.ts` | 수정 |
| `financial-workbench/web/src/lib/mapFont.ts` | 신규 |
| `financial-workbench/web/src/lib/mapFont.test.ts` | 신규 |
| `financial-workbench/web/src/components/map/ConceptMapTab.tsx` | 수정 |
| `financial-workbench/web/src/components/learning/StudyTab.tsx` | 신규 |
| `financial-workbench/web/src/components/learning/ConceptSections.tsx` | 신규 |
| `financial-workbench/web/src/components/learning/learning.test.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
