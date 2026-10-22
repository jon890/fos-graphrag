# Phase 03. 화면의 타입 표시와 거장의 생각 흐름

**Execution profile**: standard

## 목표

그래프 노드, 타입 배지, 범례의 색과 그래프 노드 모양을 온톨로지의 `display` 에서 읽게 한다. 웹 코드에서 타입 이름(`Company`, `Claim` 등)으로 색과 모양을 정하는 곳을 없앤다.
인물과 개념, 책을 근거로 「인물 → 개념 강조한다」 주장을 만드는 흐름을 브라우저 테스트로 확인하고, 초기 데이터가 화면에 보이는지 본다.

**범위 외**: 서버와 온톨로지는 phase 01, 02 에서 끝났다. 첫 화면 안내(`WelcomeGuide`)의 문구 개편은 다음 계획(④ 첫 접속 가이드)이다.

## 컨텍스트

- 앞 phase 결과: `/api/ontology` 의 `nodeTypes.<타입>.display` 가 `{ color, shape }` 이다. 일곱 타입 모두 값이 있다. 모양은 `ellipse`, `round-rectangle`, `hexagon`, `round-diamond`, `round-tag`, `round-pentagon` 가운데 하나다(Cytoscape 의 노드 `shape` 값). `Person`, `Concept` 타입, `ADVOCATES`(「강조한다」), `CRITICIZES` 주장 종류, `AUTHORED` 관계(근거 문서 폼의 「저자」 칸), 자료 종류 책(`BOOK`)이 있다. 초기 데이터로 인물 「워런 버핏」 과 개념 「안전마진」 등이 들어가 있다.
- 색: `financial-workbench/web/src/lib/graph.ts` 의 `TYPE_COLORS`(다섯 타입)와 `colorForType(type)`(없으면 이름 해시로 `FALLBACK_COLORS` 에서 고름)이다. `colorForType` 을 `components/TypeBadge.tsx`(배지 배경), `components/GraphPanel.tsx`(노드 data 의 `color`, 범례 점) 가 쓴다. 다른 사용처와 테스트는 `git grep -n "colorForType\|TYPE_COLORS" -- financial-workbench/web` 로 찾는다.
- 모양: `GraphPanel.tsx` 의 스타일 배열이 `node[type = "Claim"]`(round-diamond, 22×22), `node[type = "Document"]`(round-rectangle), `node[type = "Sector"]`(hexagon)를 타입 이름으로 정한다. 나머지는 기본 모양이다.
- 계약 타입은 `financial-workbench/web/src/api/types.ts` 의 `NodeTypeDef`(`hintProperties` 까지)다. 온톨로지는 `useApp().ontology` 로 읽는다.
- 브라우저 테스트 `financial-workbench/web/e2e/workbench.spec.ts`
  - `0e)` 가 `new-node-type` 의 선택지를 `toHaveText([...])` 로 정확히 단언한다. 새 타입 「인물」, 「개념」 이 더해져 기대값이 바뀐다.
  - `createNode(page, type, label, props)` 도우미, `pick(page, prefix, label)` 도우미, `searchAndOpen(page, label)` 이 있다. 주장 폼은 문장 채우기이고 testid 는 `financial-workbench/web/TESTIDS.md` 의 「Claim 카드와 Claim 노드 상세」, 「작업 공간: 오른쪽 상세」 절이다.
  - 데이터 이름은 실행마다 접미사가 붙는다. 초기 데이터는 접미사가 없다(「워런 버핏」).

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「만들기 폼과 구분 정보」 표의 `display` 행, `financial-workbench/docs/flow.md` 의 「거장의 생각 담기」, `financial-workbench/docs/code-architecture.md` 「결정」 의 표시 항목

## 의도 메모

- 웹 코드에 타입 이름을 적지 않는다(`docs/code-architecture.md` 「웹 구조」). 다음 계획에서 온톨로지를 웹에서 편집하면 새 타입의 색과 모양도 코드 수정 없이 바뀐다.
- `display` 가 없는 타입은 지금처럼 이름 해시 색과 기본 모양이다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. 계약 타입

- `types.ts` 에 `NodeDisplayDef { color?: string | null; shape?: string | null }` 를 두고 `NodeTypeDef` 에 `display?: NodeDisplayDef | null`, `searchProperties?: string[]` 를 더한다.

### 2. 색과 모양 함수

- `lib/graph.ts` 의 `TYPE_COLORS` 를 지우고 `colorForType(type)` 을 `typeColor(o: Ontology, type: string): string` 로 바꾼다. `o.nodeTypes[type]?.display?.color` 가 있으면 그 값, 없으면 지금 해시 방식이다. 해시 팔레트의 주석(「위 다섯 타입 색과 다른 계열」)을 「온톨로지에 색이 없는 타입에 쓴다」 로 고친다.
- 같은 파일에 `typeShape(o: Ontology, type: string): string` 를 둔다. `display.shape` 가 있으면 그 값, 없으면 `ellipse` 다.
- `TypeBadge` 와 `GraphPanel` 의 사용처를 `typeColor(ontology, type)` 로 바꾼다. 그 밖의 사용처도 함께 바꾼다.

### 3. `GraphPanel.tsx` 의 모양

- 노드 data 에 `shape: typeShape(ontology, n.type)` 를 넣고, 기본 노드 스타일에 함수 mapper `shape: (ele) => ele.data('shape') as cytoscape.Css.NodeShape` 를 둔다. Cytoscape 3.34 의 타입은 `shape` 를 `NodeShape` 문자열 union 으로 받아 `'data(shape)'` 문자열은 typecheck 에서 실패한다(`TS2322`). `typeShape` 의 반환 타입도 `cytoscape.Css.NodeShape` 로 두고, 그 안에서 온톨로지 값을 한 번만 단언한다.
- `node[type = "Claim"]`, `node[type = "Document"]`, `node[type = "Sector"]` 선택자를 지운다. 주장 노드의 작은 크기(22×22)는 모양에 묶지 않는다. 노드 data 에 `compact: ontology.nodeTypes[n.type]?.managedBy === 'claims'` 를 넣고 `node[?compact]` 선택자로 옮긴다. 다른 타입이 같은 모양을 골라도 작아지지 않게 하려는 것이다. 주장을 선으로 접는 코드의 `type: 'Claim'` 처럼 동작에 쓰는 타입 비교는 이 phase 범위가 아니라 그대로 둔다.

### 4. `financial-workbench/web/TESTIDS.md`

「노드 고르기(NodePicker)」 절의 접두사 목록에 `create-link-AUTHORED-picker`(근거 문서 폼의 「저자」)를 더한다.

### 5. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/lib/graph.test.ts`: `colorForType` 테스트가 있으면 `typeColor` 로 바꾼다. 온톨로지에 `display.color` 가 있는 타입은 그 값, 없는 타입은 팔레트 색(같은 이름은 늘 같은 색)이다. `typeShape` 는 값이 있으면 그 값, 없으면 `ellipse` 다. 테스트 온톨로지는 `financial-workbench/web/src/components/testSupport.tsx` 의 `testOntology` 에 `display` 를 더해 쓴다(Company `{ color: '#2563eb', shape: 'ellipse' }`, Person 은 `display` 없이 두어 기본값을 본다).
- `financial-workbench/web/src/components/screens.test.tsx`: `TypeBadge type="Company"` 의 배경이 `#2563eb`(정적 렌더의 `style` 에 `background-color:#2563eb`)다.
- `financial-workbench/web/e2e/workbench.spec.ts`
  - `0e)` 의 `new-node-type` 선택지 기대값에 「인물」, 「개념」 을 YAML 순서대로 더하고(「주장」 은 이미 있다), 바로 아래 `toHaveCount(6)` 을 `toHaveCount(8)` 로 고친다.
  - `0e)` 끝에 단언을 더한다. `search-input` 에 `Warren Buffett` 를 넣어 검색하면 `search-result` 에 「워런 버핏」 이 있고 그 `TypeBadge` 가 「인물」 이다(초기 데이터와 영문 이름 검색).
  - `2)` 다음에 `2d) A 가 책을 근거로 거장의 생각을 주장으로 만든다` 를 더한다.
    1. `createNode(pageA, 'Document', 책 제목, { title, url: 'https://example.com/book-<suffix>', documentType: 'BOOK', collectedAt })` 로 만들되, 만들기 전에 「저자」 칸(`create-link-AUTHORED-picker-*`)에서 「워런 버핏」 을 고른다. `createNode` 도우미가 고르기 칸을 다루지 못하면 이 단계는 도우미를 쓰지 않고 직접 채운다. 만든 상세의 `relationship-row` 에 「워런 버핏」 이 `data-rel-type="AUTHORED"` 로 있다.
    2. `searchAndOpen(pageA, '워런 버핏')` 뒤 「주장 추가」 에서 관계 종류를 `ADVOCATES` 로 고른다. 문장(`claim-sentence`)에 「강조한다」 가 보인다. 대상에서 「안전마진」 을, 근거 문서에서 1의 책을 고르고, 설명과 근거 문장(짧은 인용, 예: 「안전마진은 투자의 핵심이다(테스트 문장)」)을 넣어 만든다.
    3. 성공 안내 뒤 만든 주장 카드의 `data-claim-id` 를 읽는다. 그래프의 `graph-node-list` 에 「안전마진」 이 있고, 그 목록에서 그 id 의 주장 항목이 「워런 버핏 → 안전마진 강조한다」 를 담는다. 초기 데이터 이름에는 접미사가 없어 같은 DB 에서 다시 돌리면 같은 이름의 주장이 쌓이므로, 항목은 id 로 좁혀 찾는다(목록 항목에 id 속성이 없으면 단추를 눌러 열린 상세의 `data-node-id` 로 본다). 책 제목에는 접미사를 붙인다. `shot(pageA, '02d-master-claim')` 를 남긴다.
  - 이 테스트가 만든 주장은 검토하지 않는다. 뒤 테스트가 세는 검토 대기 개수나 주장 개수가 있으면 `data-claim-id` 로 좁혀 영향을 없앤다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/graph.test.ts src/components/screens.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
! git grep -n "TYPE_COLORS\|node\[type = \"Sector\"\]\|node\[type = \"Document\"\]\|node\[type = \"Claim\"\]" -- financial-workbench/web/src
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan010 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan010 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
cd financial-workbench/api && ./gradlew test
```

- 각 줄은 저장소 루트에서 돈다. 두 project 가 모두 통과해야 한다. 마지막 `./gradlew test` 는 세 phase 를 합친 뒤 서버 테스트가 그대로인지 다시 본다.
- `02d-master-claim.png` 에서 인물과 개념 노드의 색과 모양이 다른 타입과 구분되는지, 기존 다섯 타입의 색과 모양이 바뀌지 않았는지 눈으로 본다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/lib/graph.ts` | 수정 |
| `financial-workbench/web/src/lib/graph.test.ts` | 수정 |
| `financial-workbench/web/src/components/TypeBadge.tsx` | 수정 |
| `financial-workbench/web/src/components/GraphPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/src/components/screens.test.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
