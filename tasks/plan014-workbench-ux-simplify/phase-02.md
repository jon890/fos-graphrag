# Phase 02. 타입 순서와 관계 문장, 머리글 탭 셋과 더보기, 개념 지도

**Execution profile**: deep

## 목표

첫 화면을 개념 지도(`/map`)로 바꾸고, 머리글을 탭 셋과 「더보기」 메뉴로 줄인다. 지도와 이후 phase 가 함께 쓰는 순수 함수(타입 순서, 관계 문장, 설명 첫 문장)를 만든다.

**범위 외**: 「＋ 추가」 와 지도의 「＋ {타입} 추가」 단추(Phase 03). 작업 공간 검색 칸과 그래프 배치(Phase 04). 상세 읽기 카드(Phase 05). 온톨로지 YAML 의 표시 이름(Phase 06).

## 컨텍스트

- 경로와 query 의 뜻은 `financial-workbench/docs/flow.md` 「주소와 뒤로가기」 의 표가 소유한다. 지도 동작은 같은 문서의 「개념 지도」, 「타입 순서」, 「관계 문장」 이다.
- 경로 함수는 `financial-workbench/web/src/routes.ts`(`TabKey`, `TAB_PATHS`, `tabOfPath`, `parse*Query`, `*Search`, `legacyRedirect`, `isSafeReturnTo`)다. 테스트는 `routes.test.ts`.
- 머리글과 화면 고르기는 `financial-workbench/web/src/App.tsx` 다. 지금 `TABS` 배열 여섯 개를 `<nav role="tablist">` 에 그리고 testid 는 `tab-${key}` 다. `/` 와 모르는 경로는 `legacyRedirect(...) ?? TAB_PATHS.workspace` 로, ADMIN 이 아닌 사람의 `/users` 는 `TAB_PATHS.workspace` 로 바꿔 연다. 로그아웃은 `TAB_PATHS.workspace` 로 간다.
- 역할 판정은 `financial-workbench/web/src/context.ts` 의 `canEditRole`, 표시 이름은 `useLabels()`(내부는 `src/lib/labels.ts`)다. 조사는 `withJosa(word, '이(가)')`, `withEulReul(word)` 를 쓴다.
- 그래프 색과 모양은 `src/lib/graph.ts` 의 `typeColor(o, type)`, `typeShape(o, type)` 다. 작업 공간 그래프 `src/components/GraphPanel.tsx` 가 Cytoscape 를 만들고 지우는 방식(`useEffect` 에서 `cytoscape({container, style, elements: []})`, 언마운트 때 `destroy`)을 따른다.
- API 클라이언트는 `src/api/client.ts` 의 `api.nodes.search(p: NodeSearchParams)` 다. 계약 타입은 `src/api/types.ts`.
- 화면 부품은 `src/components/ui/` 의 shadcn 부품이다. Dialog 와 DropdownMenu 는 아직 없다. `radix-ui` 1.7.0 패키지에 둘 다 들어 있으므로 새 의존 없이 shadcn 의 `dialog.tsx`, `dropdown-menu.tsx` 소스를 이 폴더에 옮겨 적는다. registry 의 `import { cn } from "cn"` 은 `@/lib/utils` 로 바꾼다(`docs/code-architecture.md` 「웹 구조」).
- 첫 접속 가이드는 `src/components/guide/GuideProvider.tsx` 와 `src/lib/guide.ts` 다. 자동 시작은 `tab !== 'workspace'` 면 하지 않고, `open()` 은 작업 공간으로 옮긴다. 단계 진입 effect 는 `here.pathname !== TAB_PATHS.workspace` 면 주소를 바꾸지 않는다.
- e2e 는 `financial-workbench/web/e2e/workbench.spec.ts`, `e2e/mobile.spec.ts`, 공용 도우미 `e2e/support.ts`(`loginAs` 가 `search-input` 이 보일 때까지 기다린다)다. testid 계약은 `financial-workbench/web/TESTIDS.md`.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」, 「개념 지도」, 「타입 순서」, 「관계 문장」, 「좁은 화면의 작업 공간」, 「첫 접속 가이드」, `financial-workbench/docs/code-architecture.md` 의 「웹 구조」, `financial-workbench/docs/adr/010-concept-map-first-screen.md`

## 의도 메모

- 타입 이름을 코드에 적지 않는다. 지도, 순서, 문장은 모두 `ontology.nodeTypes` 와 `ontology.relationshipTypes` 에서 만든다. 단위 테스트의 온톨로지 조각에만 타입 키가 나온다.
- 깊이는 뿌리에서의 너비 우선 최단 거리다. Cytoscape `breadthfirst` 가 층을 정하는 방식과 같아 지도의 층과 메뉴 순서가 어긋나지 않는다.
- 메뉴(`DropdownMenu`)는 `modal={false}` 로 연다. 모달 메뉴의 스크롤 잠금이 `<style>` 을 넣어 CSP(`style-src 'self'`)에 막히기 때문이다.
- 열람자에게 「검토 대기」 를 메뉴에서만 감추고 `/review` 주소는 그대로 열리게 둔다(`docs/flow.md` 「주소와 뒤로가기」).
- 작업 공간 그래프 자리의 시작 안내(`WelcomeGuide`)는 지도 위 소개로 옮기고 컴포넌트는 지운다. 그래프 빈 자리에는 한 줄 안내만 남긴다.

## 작업 항목

### 1. `src/lib/typeOrder.ts` 와 `src/lib/typeOrder.test.ts` (신규)

```ts
/** 관계 방향 그래프의 깊이. managedBy 타입은 빠진다. 뿌리에서 닿지 않는 타입은 들어 있지 않다 */
export function typeDepths(o: Ontology): Map<string, number>
/** 들어오는 관계가 없는 타입(자기 자신을 잇는 관계는 셈하지 않는다). managedBy 타입 제외. YAML 순서 */
export function rootTypes(o: Ontology): string[]
/** 깊이가 얕은 순, 같으면 YAML 순서. 닿지 않는 타입은 맨 뒤에 YAML 순서. managedBy 타입 제외 */
export function orderedTypes(o: Ontology): string[]
/** managedBy 가 있는 타입(지금은 Claim). YAML 순서 */
export function managedTypes(o: Ontology): string[]
```

- 간선은 `relationshipTypes` 의 각 정의에서 `from` 의 모든 타입 → `to` 의 모든 타입이다. `from === to` 인 간선과 온톨로지에 없는 타입은 뺀다.
- 테스트: 작은 온톨로지 조각으로 (a) 두 뿌리와 갈래가 있는 경우 순서, (b) 깊이가 같을 때 YAML 순서, (c) 자기 자신을 잇는 관계만 있는 타입이 뿌리, (d) 고리만 있어 닿지 않는 타입이 맨 뒤, (e) managedBy 타입이 빠지는 것을 확인한다. 저장소 YAML 을 읽어 고정 순서를 단언하지 않는다(온톨로지가 바뀌면 깨진다).

### 2. `src/lib/relationSentence.ts` 와 `src/lib/relationSentence.test.ts` (신규)

```ts
/** 한다체 표시 이름을 합니다체로. 규칙은 docs/flow.md 「관계 문장」 */
export function politeForm(label: string): string
/** out: 「{other}을(를) {polite}」, in: 「{other}이(가) {polite}」 */
export function relationSentence(label: string, direction: 'out' | 'in', other: string): string
/** 개념 지도 타입 칸의 문장. 시작과 끝 타입이 같은 관계는 out 하나만 */
export function typeRelationSentences(o: Ontology, type: string): { key: string; relationship: string; direction: 'out' | 'in'; otherType: string; text: string }[]
```

- `politeForm`: 마지막 글자가 「다」 가 아니면 그대로. 「는다」 로 끝나면 「는다」 를 떼고 「습니다」 를 붙인다. 「다」 앞 글자의 종성이 ㄴ 이면 종성을 ㅂ 으로 바꾸고 「니다」. 다른 종성이면 「습니다」. 종성이 없으면 ㅂ 종성을 붙이고 「니다」. 한글 음절 계산은 `0xAC00` 기준 `(code - 0xAC00) % 28` 이다.
- `typeRelationSentences` 의 `other` 이름은 `typeLabel(o, otherType)`, 표시 이름은 `relationshipLabel(o, key)`. `key` 는 `${relationship}:${direction}:${otherType}` 다.
- 테스트: `politeForm` 은 「만든다→만듭니다」, 「겪는다→겪습니다」, 「이롭게 한다→이롭게 합니다」, 「썼다→썼습니다」, 「이다→입니다」, 「발행」(다 로 끝나지 않음)→그대로. `relationSentence` 는 받침 있는 이름(「병목」)과 없는 이름(「기업」), 영문으로 끝나는 이름(「FLNC」)은 「FLNC을(를)」 처럼 두 꼴을 함께 적는지. `typeRelationSentences` 는 들어오는 관계와 나가는 관계가 모두 나오고 자기 자신을 잇는 관계가 한 번만 나오는지.

### 3. `src/lib/labels.ts` 와 `src/lib/labels.test.ts`

`export function firstSentence(text: string | undefined): string` 를 더한다. 처음 나오는 `.`, `!`, `?` 뒤가 공백이나 끝이면 거기까지 자른다. 없으면 전체, `undefined` 면 빈 문자열. 테스트에 문장 둘, 문장 하나, 마침표 없는 글, 「예: 2.5」 처럼 공백 없는 마침표를 넣는다.

### 4. `src/routes.ts` 와 `src/routes.test.ts`

- `TabKey` 에 `'map'`, `TAB_PATHS.map = '/map'` 을 더한다(객체 맨 앞).
- `export const TOP_TABS: TabKey[] = ['map', 'workspace', 'list']`.
- `export function moreItems(role: string): TabKey[]` 는 `['changes', 'ontology']` 에 EDITOR 와 ADMIN 이면 `'review'`, ADMIN 이면 `'users'` 를 더한다.
- `export interface MapQuery { type: string }`, `parseMapQuery(search)`, `mapSearch(q)`(빈 `type` 은 뺀다).
- `export const LANDING_PATH = TAB_PATHS.map`.
- 테스트: `tabOfPath('/map') === 'map'`, `isSafeReturnTo('/map?type=X')` 참, `moreItems` 의 역할별 결과, `mapSearch(parseMapQuery('?type=Bottleneck'))` 가 그대로 돌아오는지, `legacyRedirect('/', '?node=a')` 가 여전히 작업 공간인지.

### 5. `src/api/types.ts`, `src/api/client.ts`

- `export interface NodeCounts { counts: Record<string, number> }`.
- `NodeSearchParams` 에 `sort?: 'label' | 'recent'` 를 더하고 query 에 넣는다.
- `api.nodes.counts(): Promise<NodeCounts>` 는 `GET /api/nodes/counts`.

### 6. `src/components/ui/dialog.tsx`, `src/components/ui/dropdown-menu.tsx` (신규)

shadcn 의 Dialog, DropdownMenu 소스를 `radix-ui` 패키지(`import { Dialog as DialogPrimitive } from 'radix-ui'`, `DropdownMenu as DropdownMenuPrimitive`)로 옮긴다. `src/components/ui/ui.test.tsx` 에 두 부품이 `react-dom/server` 로 그려지는지 한 줄씩 더한다.

### 7. 머리글: `src/components/header/TopTabs.tsx`, `src/components/header/MoreMenu.tsx` (신규), `src/App.tsx`

- `TopTabs`: `TOP_TABS` 를 그린다. 이름은 「개념 지도」, 「작업 공간」, 「목록」. 지금의 탭 단추 모양과 `role="tab"`, `aria-selected`, testid `tab-${key}` 를 유지한다.
- `MoreMenu`: 단추 「더보기 ▾」(testid `more-open`). 더보기 화면이 열려 있으면 `data-active="true"` 와 선택된 탭과 같은 밑줄을 보인다. 항목은 `moreItems(role)` 순서로 「변경 이력」, 「온톨로지 상세」, 「검토 대기」, 「사용자」(testid `more-item-${key}`). `DropdownMenu` 를 `modal={false}` 로 쓴다. 항목을 누르면 `openTab(key)` 와 같은 동작(마지막으로 보던 주소)을 한다.
- `App.tsx`: `TABS` 배열을 지우고 위 둘을 쓴다. 머리글 배치는 넓은 화면 한 줄, 좁은 화면 두 줄(첫 줄 제목과 사용자 상자, 둘째 줄 탭 셋과 더보기)이다. 둘째 줄 오른쪽 끝에 Phase 03 의 「＋ 추가」 자리를 비워 둔다(이 phase 에서는 그리지 않는다). 폭 390px 에서 둘째 줄이 넘치지 않아야 한다(가로 스크롤 없는 `flex-nowrap`, 탭 글자 `text-sm`, 여백 축소).
- `/`, 모르는 경로, ADMIN 이 아닌 사람의 `/users` 는 `legacyRedirect(...) ?? LANDING_PATH`, `LANDING_PATH` 로 바꿔 연다. 로그아웃도 `LANDING_PATH` 다. `activeTab` 은 `users` 를 ADMIN 에게만 허용하고 나머지 탭 키는 모두 허용한다(열람자의 `/review` 포함).
- `activeTab === 'map'` 이면 `<ConceptMapTab />` 을 그린다.
- 로그인 뒤 돌아갈 주소가 없으면 `/` 를 거쳐 `LANDING_PATH` 가 열린다. `src/lib/links.ts` 의 `nodeLink` 는 항목 링크라 `/workspace` 그대로 둔다.

### 8. 개념 지도: `src/components/map/ConceptMapTab.tsx`, `src/components/map/TypePanel.tsx` (신규)

`docs/flow.md` 「개념 지도」 를 그대로 구현한다.

- `ConceptMapTab`: `api.nodes.counts()` 를 한 번 읽는다(실패하면 `map-counts-error` 에 「항목 수를 불러오지 못했습니다.」 와 이유). 주소의 `type` 은 `parseMapQuery` 로 읽고, 고르면 `navigate(TAB_PATHS.map + mapSearch({type}))`(push)다.
  - 소개 `map-intro`: 제목 「투자 지식 지도」, 문장 「투자 지식을 근거와 함께 쌓는 곳입니다. 상자를 누르면 그 종류의 항목을 보고 바로 추가할 수 있습니다.」
  - 그림 `concept-map-canvas`: Cytoscape. 노드는 `orderedTypes` 의 타입, `data.label` 은 `${typeLabel} ${n}개`(개수가 없으면 타입 이름만), 색과 모양은 `typeColor`, `typeShape`. 간선은 `relationshipTypes` 의 from×to 조합마다 하나(`id` 는 `${key}:${from}:${to}`), 글자는 `relationshipLabel`. 배치는 `{ name: 'breadthfirst', directed: true, roots: rootTypes 의 노드(없으면 orderedTypes[0]), spacingFactor: 1.1, padding: 24 }` 이고, 자기 자신을 잇는 간선은 배치를 돌리는 컬렉션에서 뺀다(`cy.elements().not(selfLoops).layout(...)`). 노드를 누르면 그 타입을 고른다. 속성 `data-node-count`(타입 노드 수)와 `data-layout-done`(배치가 끝나면 `true`)을 둔다. 고른 타입 노드에는 굵은 테두리를 준다.
  - 타입 목록 `map-type-list`: `orderedTypes` 순서의 단추(testid `map-type`, `data-type`, `aria-pressed`). 안에 타입 배지와 개수(`map-type-count`).
  - 주장 안내 `map-claim-note`: 「주장은 어느 항목에나 붙일 수 있습니다」 와 `managedTypes` 의 개수 합(「주장 3개」). 주장 타입이 온톨로지에 없으면 그리지 않는다.
  - 빈 상태 `map-empty`: 개수를 받았고 모든 값이 0 일 때 「아직 등록한 항목이 없습니다.」 와, 편집 권한이 있으면 「오른쪽 위 「＋ 추가」 로 첫 항목을 만드세요.」
  - 배치: 넓은 화면(`useMediaQuery('(min-width: 1024px)')`)은 그림과 목록 왼쪽, `TypePanel` 오른쪽(폭 360px). 좁은 화면은 그림(높이 360px), 목록, `TypePanel` 순서로 세로. 페이지에 가로 스크롤이 생기지 않는다.
- `TypePanel`(`map-type-panel`, `data-type`): 주소의 타입이 `orderedTypes` 에 있을 때만 그린다.
  - 머리: 타입 배지, 이름, 개수. 설명 `map-type-description` 은 `description` 전체.
  - 최근 항목: `api.nodes.search({ types: [type], size: 5, sort: 'recent' })`. 줄마다 단추(testid `map-recent-item`, `data-node-id`)이고 누르면 App 의 `focusNode(id)`(작업 공간 상세 열기)를 부른다. 없으면 `map-recent-empty`「아직 없습니다」, 실패하면 `map-recent-error`.
  - 관계 문장: `typeRelationSentences(ontology, type)` 를 줄마다(testid `map-relation`, `data-relationship`).
  - 단추: 「목록에서 보기」(`map-open-list`, `TAB_PATHS.list + listSearch({type, q:'', archived:false, page:0})` push), 「작업 공간에서 보기」(`map-open-workspace`, `TAB_PATHS.workspace + workspaceSearch({...DEFAULT_WORKSPACE_QUERY, types:[type]})` push).
- `App.tsx` 는 `ConceptMapTab` 에 `onOpenNode={focusNode}` 를 넘긴다.
- `src/components/map/map.test.tsx`(신규): `src/components/testSupport.tsx` 의 렌더 도우미로 `ConceptMapTab` 을 `react-dom/server` 로 그려, 타입 목록 단추의 `data-type` 순서가 `orderedTypes(ontology)` 와 같고 주장 타입이 목록에 없고 `map-claim-note` 가 있는지 본다. 주소에 `type` 이 있는 상태로 그리면 `map-type-panel` 이 그 타입으로 나오고, 주장 타입이면 나오지 않는지 본다.

### 9. `WelcomeGuide` 를 지운다: `src/components/WelcomeGuide.tsx`(삭제), `src/components/GraphPanel.tsx`, `src/legacy.css`

`GraphPanel` 의 `graph-empty` 자리에 `<p>` 한 줄 「항목을 검색해 고르면 이어진 항목이 그래프로 보입니다.」 만 둔다. `legacy.css` 의 `.welcome` 규칙이 남으면 지운다. `git grep -n "WelcomeGuide\|welcome-guide" financial-workbench/web` 결과가 이 phase 의 e2e 수정 뒤 없어야 한다.

### 10. 첫 접속 가이드의 첫 화면: `src/lib/guide.ts`, `src/lib/guide.test.ts`, `src/components/guide/GuideProvider.tsx`

- `GuideStep` 에 `route: 'map' | 'workspace'` 를 더한다. 따라하기 단계와 지금 둘러보기 단계는 `'workspace'` 다.
- `BROWSE_STEPS` 를 `docs/flow.md` 「열람자의 둘러보기」 표대로 바꾼다. 소개 다음에 `{ id: 'map', target: 'concept-map-canvas', pane: null, route: 'map', title: '개념 지도', body: '워크벤치가 담는 지식의 종류와 서로의 관계입니다. 상자를 누르면 그 종류의 항목을 봅니다.' }` 를 넣고, 소개 문장과 상세 단계 문장을 표와 같게 고친다.
- 자동 시작은 `tab` 이 `'map'` 이나 `'workspace'` 일 때 한다. `open()` 은 지금 화면이 `/map` 이나 `/workspace` 면 옮기지 않고, 아니면 `LANDING_PATH` 로 옮긴다.
- 단계 진입 effect: 단계의 `route` 가 `'map'` 이면 `/map` 으로, `'workspace'` 면 지금처럼 작업 공간 주소로 바꿔 연다(replace). 지금 경로가 작업 공간이 아니어도 바꾼다.
- `guide.test.ts`: 둘러보기 단계 id 가 `intro, map, search, graph, detail` 이고 `map` 단계의 `route` 가 `'map'` 인지.

### 11. e2e 와 testid 계약: `e2e/support.ts`, `e2e/workbench.spec.ts`, `e2e/mobile.spec.ts`, `TESTIDS.md`

- `support.ts`: `loginAs` 는 `search-input` 대신 `tab-map` 과 `concept-map` 이 보일 때까지 기다린다(시작 경로가 `/` 일 때). 시작 경로가 다른 화면이면 그 화면의 탭이 보이는 것을 기다린다. `export async function openScreen(page, key: 'map' | 'workspace' | 'list' | 'changes' | 'ontology' | 'review' | 'users')` 를 더한다. 상단 탭이면 `tab-${key}` 를, 아니면 `more-open` 다음 `more-item-${key}` 를 누른다.
- `workbench.spec.ts`, `mobile.spec.ts`: `tab-review`, `tab-changes`, `tab-ontology`, `tab-users` 를 누르던 곳을 `openScreen` 으로 바꾼다. 「`aria-selected` 가 참」 을 보던 단언은 더보기 화면이면 `more-open` 의 `data-active="true"` 로 바꾼다. 로그인 직후 작업 공간을 전제한 테스트는 `openScreen(page, 'workspace')` 를 먼저 부른다. `welcome-guide` 를 보던 단언(지금 215~218행)은 `map-intro` 로 옮긴다.
- 새 테스트(workbench.spec.ts, 넓은 화면): 「개념 지도가 첫 화면이고 타입을 고르면 칸이 열린다」. `/` 로 들어가 주소가 `/map` 인지, `concept-map-canvas` 의 `data-layout-done` 이 `true` 인지, `map-type` 이 하나 이상인지, 초기 데이터에 있는 타입 하나(`map-type[data-type=Bottleneck]`)를 누르면 `map-type-panel` 이 열리고 주소에 `type=Bottleneck` 이 붙고 `map-relation` 이 하나 이상, `map-recent-item` 이 하나 이상인지, `map-open-list` 가 `/list?type=Bottleneck` 으로 가는지. 스크린샷 `shot(page, 'map-wide')`.
- 새 테스트: 「더보기 메뉴는 역할별 항목을 보이고 열린 화면을 표시한다」. ADMIN 은 네 항목, EDITOR 는 `more-item-users` 가 없음, VIEWER 는 `more-item-review` 와 `more-item-users` 가 없음. `more-item-changes` 를 누르면 `/changes` 이고 `more-open` 의 `data-active` 가 `true`.
- 새 테스트(mobile.spec.ts, 390px): 「개념 지도와 머리글이 한 줄에 들어간다」. `/map` 에서 `tab-map`, `tab-workspace`, `tab-list`, `more-open` 의 `boundingBox().y` 가 같고, `document.documentElement.scrollWidth <= innerWidth` 다. `map-type` 을 눌러 `map-type-panel` 이 보이는지. 스크린샷 `shot(page, 'map-mobile')`.
- `TESTIDS.md`: 「로그인과 상단」 표의 탭 줄을 `tab-map`, `tab-workspace`, `tab-list` 와 `more-open`, `more-item-<key>` 로 바꾸고, 「개념 지도」 절을 새로 만들어 이 phase 의 testid 를 모두 적는다. `welcome-guide` 줄을 지운다. 가이드 표의 둘러보기 단계 id 에 `map` 을 더한다.

## 검증

```bash
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/typeOrder.test.ts src/lib/relationSentence.test.ts src/lib/labels.test.ts src/routes.test.ts src/lib/guide.test.ts src/components/ui/ui.test.tsx src/components/map/map.test.tsx
cd financial-workbench/web && npm test && npm run build
cd financial-workbench/web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts
! git grep -n "WelcomeGuide\|welcome-guide\|tab-review\|tab-changes\|tab-ontology\|tab-users" -- financial-workbench/web
```

- e2e 는 이 phase 에서 브라우저로 돌리지 않는다. `playwright test --list` 는 서버 없이 spec 파일을 읽어 문법과 import 오류만 잡는다. 브라우저 실행은 모든 phase 를 마친 뒤 한 번 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/lib/typeOrder.ts` | 신규 |
| `financial-workbench/web/src/lib/typeOrder.test.ts` | 신규 |
| `financial-workbench/web/src/lib/relationSentence.ts` | 신규 |
| `financial-workbench/web/src/lib/relationSentence.test.ts` | 신규 |
| `financial-workbench/web/src/lib/labels.ts` | 수정 |
| `financial-workbench/web/src/lib/labels.test.ts` | 수정 |
| `financial-workbench/web/src/routes.ts` | 수정 |
| `financial-workbench/web/src/routes.test.ts` | 수정 |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/components/ui/dialog.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/dropdown-menu.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/ui.test.tsx` | 수정 |
| `financial-workbench/web/src/components/header/TopTabs.tsx` | 신규 |
| `financial-workbench/web/src/components/header/MoreMenu.tsx` | 신규 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/map/ConceptMapTab.tsx` | 신규 |
| `financial-workbench/web/src/components/map/TypePanel.tsx` | 신규 |
| `financial-workbench/web/src/components/WelcomeGuide.tsx` | 삭제 |
| `financial-workbench/web/src/components/GraphPanel.tsx` | 수정 |
| `financial-workbench/web/src/legacy.css` | 수정 |
| `financial-workbench/web/src/lib/guide.ts` | 수정 |
| `financial-workbench/web/src/lib/guide.test.ts` | 수정 |
| `financial-workbench/web/src/components/guide/GuideProvider.tsx` | 수정 |
| `financial-workbench/web/src/components/map/map.test.tsx` | 신규 |
| `financial-workbench/web/e2e/support.ts` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
