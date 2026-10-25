# Phase 04. 웹: 토큰 범위 고르기, 더보기의 「제안」 과 대기 배지, 제안 화면

**Execution profile**: standard

## 목표

연동 토큰 발급 창에서 「조회만」 과 「조회와 기록」 을 고르고 목록에 범위를 보인다. 더보기 메뉴에 「제안」 을 더하고 대기 수를 배지로 보이며, `/proposals` 화면에서 제안의 내용과 까닭을 보고 승인(고쳐서 승인 포함)하거나 거절한다.

**범위 외**: 「내 체결」 화면과 상세, 근거 따라가기의 체결 절(phase 05). 브라우저 테스트(phase 06). `/trades` 경로는 phase 05 가 더한다.

## 컨텍스트

**근거 문서**: `financial-workbench/docs/flow.md` 의 「제안」, 「연동 토큰」, 「주소와 뒤로가기」(경로 표와 더보기 규칙), `financial-workbench/docs/api-contract.md` 의 「제안」, 「제안 내용」, 「연동 토큰」(`scope`), `financial-workbench/web/TESTIDS.md` 의 「로그인과 상단」(`more-*`), 「연동 토큰 화면」, 「제안 화면」, `financial-workbench/docs/code-architecture.md` 의 「웹 구조」(`components/proposals/`, `lib/proposals.ts`).

경로는 모두 `financial-workbench/web/src/` 아래다.

- 경로: `routes.ts` 의 `TabKey`, `TAB_PATHS`, `moreItems(role)`, `tabOfPath`. 화면 query 를 읽는 순수 함수의 예는 같은 파일의 `parseTraceQuery` 와 공부 화면의 query 함수다. 서버의 화면 경로 목록은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` 의 `@GetMapping(...)` 이고 `SpaRouteIntegrationTest` 가 확인한다.
- 머리글: `components/header/MoreMenu.tsx`(`MORE_LABEL`, `more-open`, `more-item-<key>`), `App.tsx`(267행 근처 `MoreMenu`, 화면 고르기 `activeTab === 'tokens' && <TokensTab />`).
- API: `api/client.ts` 의 `api.tokens`(`issue(name)`), `request<T>(method, path, body)`, `buildQuery`, `enc`. 타입은 `api/types.ts`(`IntegrationTokenView`, `IssuedIntegrationToken`, `Page<T>`, `NodeRef`).
- 토큰 화면: `components/tokens/TokensTab.tsx` 와 그 테스트(`renderToStaticMarkup(withApp(...))`).
- 화면 부품: `components/ui/`(`button`, `badge`, `card`, `dialog`, `textarea`, `native-select`). 라디오는 HTML 기본 `<input type="radio">`(`components/NodeEditForm.tsx` 61행 근처)를 쓴다.
- 이름과 문장: `lib/labels.ts` 의 `typeLabel`, `propertyLabel`, `valueLabel`, `withJosa`, `withEulReul`, `lib/relationSentence.ts` 의 `relationSentence(o, relationship, from, to)`, `politeEnding`. 문구는 합니다체다.
- 속성 입력칸: `components/PropertyFields.tsx`(만들기 창과 편집 폼이 쓰는 칸). 「고쳐서 승인」 의 항목 만들기 칸으로 그대로 쓴다.
- 쪽 나누기: `components/Pager.tsx`. 항목 열기: `App` 의 `focusNode(id)`(다른 화면이 `onOpenNode` 로 받는다).
- 단위 테스트 도우미: `components/testSupport.tsx` 의 `withApp(children, ontology, user, initialPath)`, `testOntology`.

## 의도 메모

- 배지 수는 `ProposalCountProvider`(React context)가 들고 있다. 로그인한 뒤, `location.pathname` 이 바뀔 때, 승인이나 거절 뒤에 `GET /api/me/proposals/summary` 로 다시 읽는다. 실패하면 수를 `null` 로 두고 배지를 숨긴다. 주기적으로 묻지 않는다.
- 머리글 한 줄(폭 390px)에 새 단추를 더하지 않는다. 배지는 「더보기」 단추 안의 작은 숫자다. 단추 폭이 늘어 한 줄을 넘지 않는지 phase 06 의 모바일 테스트가 확인한다.
- 제안 내용을 문장으로 바꾸는 규칙은 `lib/proposals.ts` 의 순수 함수로 두고 단위 테스트한다. 컴포넌트는 그 결과를 그린다.
- 「고쳐서 승인」 은 `payload` 전체를 다시 보낸다. 고친 칸만 보내지 않는다(계약: `payload` 는 고친 내용 전체).
- 열람자의 공유 지식 제안은 단추를 끄고 이유를 보인다. 서버도 `403` 으로 막는다.

## 작업 항목

### 1. `api/types.ts`, `api/client.ts`

- `IntegrationTokenView` 에 `scope: 'READ' | 'READ_WRITE'`. `api.tokens.issue(name, scope)` 가 `{ name, scope }` 를 보낸다.
- `TradeView`(계약의 모양), `ProposalKind`, `ProposalStatus`, `ProposalView`(`refs: { nodes: Record<string, NodeRef>; trades: Record<string, TradeView> }`, `lastError: { code; message; at } | null`, `result: { nodeIds: string[]; relationshipIds: string[]; tradeIds: string[] } | null`), `ProposalSummary { pending: number }`.
- `api.proposals = { list(status, page), summary(), accept(id, payload?), reject(id, reason?) }`.

### 2. `routes.ts`

- `TabKey` 에 `'proposals'` 를 더하고 `TAB_PATHS.proposals = '/proposals'`. `moreItems` 는 모든 역할에 `tokens` 뒤 `proposals` 를 더한다.
- `parseProposalsQuery(search): { status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; page: number }`(없거나 모르는 값이면 `PENDING`, `page` 0)와 `proposalsSearch(q)`(기본값은 쓰지 않는다).
- `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` 의 목록에 `"/proposals"` 를 더하고 `SpaRouteIntegrationTest` 의 경로 목록에도 더한다.

### 3. `components/tokens/TokensTab.tsx`

- 발급 창에 범위 라디오 둘(`tokens-issue-scope-read` 기본, `tokens-issue-scope-write`)과 「조회와 기록」 을 골랐을 때의 안내(`tokens-issue-scope-hint`, 문구는 flow 「연동 토큰」).
- 표에 범위 칸(`tokens-row-scope`, `data-scope`). 이름표는 「조회만」, 「조회와 기록」. 좁은 화면은 이름 아래 작은 글자.
- 위쪽 안내 문구를 flow 「연동 토큰」 의 새 문장으로 바꾼다.
- 순수 함수 `scopeLabel(scope): string` 을 내보낸다.

### 4. `components/proposals/ProposalCountProvider.tsx`(신규)

```tsx
export function ProposalCountProvider({ children }: { children: ReactNode }): JSX.Element
export function useProposalCount(): { count: number | null; refresh: () => void }
```

`App` 이 로그인한 화면을 이 Provider 로 감싸고, `location.pathname` 이 바뀔 때 `refresh()` 를 부른다.

### 5. `components/header/MoreMenu.tsx`

- `MORE_LABEL.proposals = '제안'`.
- `pendingCount: number | null` prop. 1 이상이면 「더보기」 단추 안에 `more-pending-badge`(`data-count`), 메뉴의 「제안」 항목 옆에 `more-item-proposals-badge` 를 그린다. 0 이나 `null` 이면 그리지 않는다.
- 더보기 쪽 화면 판정(`active`)에 `proposals` 가 들어간다(`MORE_LABEL` 에 키가 있으므로 그대로 된다).

### 6. `lib/proposals.ts`(신규)와 테스트

```ts
export function kindLabel(kind: ProposalKind): string   // 항목 만들기, 관계 잇기, 체결과 결정 잇기, 공부 메모
export function proposalSummary(o: Ontology, p: ProposalView): string
export function proposalLinkSentences(o: Ontology, p: ProposalView): string[]
export function tradeLine(t: TradeView): string        // 「{날짜} {종목} {매수|매도} {수량}주 {금액} {통화}」
export function canAccept(role: string, p: ProposalView): boolean
export function nodeName(p: ProposalView, id: string): string  // refs 에 없으면 「찾을 수 없는 항목」
```

- `proposalSummary`: `CREATE_NODE` 는 「{타입 표시 이름} 「{이름}」을(를) 만듭니다」(조사는 `withEulReul` 로 고른다. 이름은 그 타입의 `labelProperty` 값), `CREATE_RELATIONSHIP` 은 `politeEnding(relationSentence(...))`, `LINK_TRADE_DECISION` 은 「체결 N건을 「{결정 이름}」에 잇습니다」, `STUDY_NOTE` 는 「「{항목 이름}」을(를) 「{표시 이름}」 으로 표시합니다」.
- `proposalLinkSentences`: 새 노드 이름을 한쪽 끝에 넣은 관계 문장 목록.
- `tradeLine` 의 수와 금액 표시는 `Intl.NumberFormat('ko-KR')` 를 쓴다. phase 05 의 `lib/trades.ts` 가 같은 함수를 옮겨 쓰지 않게, 이 phase 에서 `lib/trades.ts`(신규)에 `formatQuantity`, `formatMoney(amount, currency)`, `sideLabel(side)` 를 만들고 `tradeLine` 이 그것을 부른다.
- `lib/proposals.test.ts`, `lib/trades.test.ts`(신규): 종류마다 문장 하나, 조사(받침 있는 이름과 없는 이름), `refs` 에 없는 id, 열람자와 편집자의 `canAccept`, `formatMoney(1234.5, 'USD')` 와 `formatQuantity(0.5)`.

### 7. `components/proposals/ProposalsTab.tsx`(신규)

flow 「제안」 의 화면이다. testid 는 `TESTIDS.md` 「제안 화면」 과 같다.

- 상태 칩, 목록(`api.proposals.list`), `Pager`, 빈 상태, 오류와 「다시 시도」.
- `ProposalCard`: 종류, 올린 때와 토큰 이름, 내용 문장, 항목 만들기의 속성 목록(`propertyLabel`, `valueLabel`), 관계 문장, 체결 줄, 까닭, 근거, 마지막 실패, 단추.
- 「고쳐서 승인」: `CREATE_NODE` 는 `PropertyFields` 로 그 타입의 속성 칸을 열고 처음 값은 `payload.properties` 다. `STUDY_NOTE` 는 표시 고르기(`KNOWN`, `UNSURE`, `LEARNING`)와 메모 칸. 나머지 종류에는 「고쳐서 승인」 단추가 없다.
- 「거절」 창: 이유 칸(1000자), 「거절」, 「취소」.
- 처리 중에는 그 카드의 단추를 끈다. 성공하면 `proposals-message` 와 목록 다시 읽기, `useProposalCount().refresh()`. 실패는 `proposal-card-error`. `PROPOSAL_NOT_PENDING` 이면 「이미 처리한 제안입니다」 와 다시 읽기.
- 항목 이름(`proposal-node-open`)과 결과 링크(`proposal-result-open`)는 `onOpenNode(id)` 를 부른다.

`App.tsx` 에 `activeTab === 'proposals' && <ProposalsTab onOpenNode={focusNode} />` 와 Provider, `MoreMenu` 의 `pendingCount` 를 연결한다.

### 8. 이 phase 를 검증하는 테스트

- `lib/proposals.test.ts`, `lib/trades.test.ts`: 위 작업 항목 6.
- `components/proposals/ProposalsTab.test.tsx`(신규): `renderToStaticMarkup(withApp(<ProposalCard … />))` 로 `CREATE_NODE` 대기 카드에 `proposal-summary`, `proposal-prop`, `proposal-accept`, `proposal-edit-open`, `proposal-reject-open` 이 있다. 열람자(`withApp` 의 `user` 를 VIEWER 로)에게는 `proposal-editor-required` 가 있고 `proposal-accept` 가 `disabled` 다. `lastError` 가 있는 카드에 `proposal-last-error` 와 그 문장이 있다. 결정한 카드에는 승인 단추가 없고 `proposal-decided` 가 있다.
- `components/tokens/TokensTab.test.tsx`(수정): `scopeLabel('READ_WRITE')` 가 「조회와 기록」 이다.
- `routes.test.ts`(수정): `moreItems` 세 역할의 기대 목록 끝에 `proposals` 가 있고, `tabOfPath('/proposals')`, `parseProposalsQuery('?status=REJECTED&page=2')`, 모르는 `status` 는 `PENDING`.
- `components/tabs.test.tsx`(수정, 더보기 메뉴를 렌더링하는 테스트가 있으면): `pendingCount = 3` 이면 `more-pending-badge` 의 `data-count="3"`, `0` 이면 없다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt`(수정): `/proposals` 가 `index.html` 이다.

## 검증

```bash
cd financial-workbench/web && npm run typecheck && npm test && npm run build
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.web.SpaRouteIntegrationTest'
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/routes.ts` | 수정 |
| `financial-workbench/web/src/routes.test.ts` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/header/MoreMenu.tsx` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 수정 |
| `financial-workbench/web/src/components/tokens/TokensTab.tsx` | 수정 |
| `financial-workbench/web/src/components/tokens/TokensTab.test.tsx` | 수정 |
| `financial-workbench/web/src/components/proposals/ProposalCountProvider.tsx` | 신규 |
| `financial-workbench/web/src/components/proposals/ProposalsTab.tsx` | 신규 |
| `financial-workbench/web/src/components/proposals/ProposalsTab.test.tsx` | 신규 |
| `financial-workbench/web/src/lib/proposals.ts` | 신규 |
| `financial-workbench/web/src/lib/proposals.test.ts` | 신규 |
| `financial-workbench/web/src/lib/trades.ts` | 신규 |
| `financial-workbench/web/src/lib/trades.test.ts` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` | 수정 |
