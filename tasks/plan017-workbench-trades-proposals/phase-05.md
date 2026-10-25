# Phase 05. 웹: 「내 체결」 화면, 상세의 「내 체결」 절, 근거 따라가기의 「실행한 체결」

**Execution profile**: standard

## 목표

더보기의 「내 체결」(`/trades`)에서 내 체결을 보고 지운다. 종목과 투자 결정 상세, 근거 따라가기의 투자 결정 단계에 이어진 내 체결을 보인다. 남의 체결은 서버가 돌려주지 않으므로 다른 사용자의 같은 화면에는 절이 없다.

**범위 외**: 제안 화면(phase 04), 브라우저 테스트(phase 06).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/flow.md` 의 「내 체결」, 「상세 칸: 읽기 카드」(「내 체결」 줄), 「근거 따라가기」(실행한 체결), 「주소와 뒤로가기」(`/trades`), `financial-workbench/docs/api-contract.md` 의 「내 체결」, `financial-workbench/web/TESTIDS.md` 의 「내 체결」, `financial-workbench/docs/code-architecture.md` 의 「웹 구조」(`components/trades/`).

경로는 모두 `financial-workbench/web/src/` 아래다.

- phase 04 가 만든 것: `api/types.ts` 의 `TradeView`, `lib/trades.ts` 의 `formatQuantity`, `formatMoney`, `sideLabel`, `lib/proposals.ts` 의 `tradeLine`, `routes.ts` 의 `moreItems`(지금 `proposals` 까지), `components/header/MoreMenu.tsx` 의 `MORE_LABEL`.
- 상세: `components/DetailPanel.tsx`(442행 근처 `NodeReadCard`, 455행 `RelationshipSection`, 465행 `node-claims-section`). 노드 타입은 `node.type`. 종목과 결정을 이름(`Security`, `Decision`)으로 고른다. 서버도 이 키를 이름으로 읽는다(`docs/data-schema.md` 「투자 온톨로지」).
- 근거 따라가기: `components/learning/TracePage.tsx`(232행 근처 `trace-step` 카드, 271행 근거 문서 목록). 단계의 타입은 `step.node.type`.
- 표: `components/ui/table.tsx`. 배치 경계: `hooks/useMediaQuery.ts` 의 `useMediaQuery('(min-width: 1024px)')`. 확인 창: `components/ui/dialog.tsx`(토큰 폐기 창 `components/tokens/TokensTab.tsx` 의 패턴).
- 시각: `lib/format.ts` 의 `formatDateTime`, `formatDate`(브라우저 시간대로 보인다).
- 서버 화면 경로: `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt`.

## 의도 메모

- 상세와 근거 따라가기의 체결 절은 같은 부품(`TradeList`)이다. 체결이 0건이면 아무것도 그리지 않는다. 남의 상세에 빈 「내 체결」 머리가 보이지 않게 하려는 것이다.
- 근거 따라가기는 투자 결정 단계마다 한 번 부른다. 근거 따라가기의 결정 단계는 보통 한두 개라 묶음 API 를 따로 두지 않는다.
- 지우기 뒤 Hermes 가 같은 체결을 다시 보내면 다시 생긴다. 확인 창 문구가 이를 알린다.

## 작업 항목

### 1. `api/client.ts`

`api.trades = { list({ securityId?, decisionId?, ticker?, page?, size? }), remove(id) }`.

### 2. `routes.ts`

`TabKey` 에 `'trades'`, `TAB_PATHS.trades = '/trades'`, `moreItems` 의 `proposals` 뒤에 `trades`. `parseTradesQuery(search): { ticker: string; page: number }`, `tradesSearch(q)`. `SpaRouteController` 와 `SpaRouteIntegrationTest` 에 `/trades`.

### 3. `components/trades/TradeList.tsx`(신규)

```tsx
export function TradeList({ filter, testId, onOpenNode }: { filter: { securityId?: string; decisionId?: string }; testId: 'detail-trades' | 'trace-step-trades'; onOpenNode: (id: string) => void }): JSX.Element | null
```

```tsx
/** 받은 쪽에서 보일 줄과 「모두 보기」 여부, 「모두 보기」 가 넣을 ticker(첫 체결의 ticker) */
export function visibleTrades(page: Page<TradeView>): { items: TradeView[]; more: boolean; ticker: string | null }
/** 읽기와 무관하게 줄을 그린다. items 가 비면 null */
export function TradeListView({ view, title, testId, onOpenNode, onMore }: { view: ReturnType<typeof visibleTrades>; title: string; testId: string; onOpenNode: (id: string) => void; onMore: (ticker: string) => void }): JSX.Element | null
```

- `TradeList` 는 `api.trades.list({ ...filter, size: 20 })` 로 읽고 `TradeListView` 를 그린다. 줄마다 `trade-list-item`(날짜, 매수·매도, 수량, 금액)이다. `more` 는 `totalItems > 20` 이다.
- `trade-list-more` 는 `/trades?ticker=<첫 체결의 ticker>` 로 옮긴다. 한 결정에 여러 종목의 체결이 이어졌으면 첫 체결의 종목만 좁혀 보인다. 이 한계는 화면 문구로 따로 알리지 않는다.
- 0건이면 `null`. 읽지 못하면 그 자리에 작은 오류 문장.

### 4. `components/trades/TradesTab.tsx`(신규)

```tsx
export function TradesTab({ onOpenNode }: { onOpenNode: (id: string) => void }): JSX.Element
/** 표의 한 행. 좁은 화면에서는 같은 내용을 카드로 그린다(variant) */
export function TradeRow({ trade, variant, onOpenNode, onDelete }: { trade: TradeView; variant: 'row' | 'card'; onOpenNode: (id: string) => void; onDelete: (t: TradeView) => void }): JSX.Element
```

flow 「내 체결」 의 화면이다. 안내, 종목 코드 칸(입력 뒤 주소 `ticker` 를 replace), 넓은 화면은 표, 좁은 화면은 카드 목록, `Pager`, 지우기 확인 창, 처리 결과, 빈 상태, 오류. 종목 링크와 결정 링크는 `onOpenNode`.

`App.tsx` 에 `activeTab === 'trades' && <TradesTab onOpenNode={focusNode} />`, `MoreMenu` 의 `MORE_LABEL.trades = '내 체결'`.

### 5. `components/DetailPanel.tsx`, `components/learning/TracePage.tsx`

- 상세: 노드 타입이 `Security` 면 `<TradeList filter={{ securityId: node.id }} testId="detail-trades" …/>`, `Decision` 이면 `decisionId`. 자리는 주장 절 다음이다. 절 머리는 「내 체결」.
- 근거 따라가기: 단계 타입이 `Decision` 인 카드에 `<TradeList filter={{ decisionId: step.node.id }} testId="trace-step-trades" …/>`. 머리는 「실행한 체결」.

### 6. 이 phase 를 검증하는 테스트

- `components/trades/TradesTab.test.tsx`(신규): `renderToStaticMarkup(withApp(<TradesTab … />))` 의 첫 렌더에 `trades-tab`, `trades-guide`, `trades-ticker` 가 있고 안내 문장에 「다른 사용자에게는 보이지 않습니다」 가 있다. 행 부품(`TradeRow`)을 체결 하나로 그리면 `trade-row` 의 `data-side="BUY"`, 금액이 `formatMoney` 결과, 이은 결정 이름 링크가 있다. 종목이 없는 체결은 증권사 이름과 종목 코드를 보인다.
- `components/trades/TradeList.test.tsx`(신규): `visibleTrades` 에 `totalItems = 21` 인 쪽을 넘기면 `more: true` 이고 `ticker` 가 첫 체결의 값이다. `totalItems = 20` 이면 `more: false`. `TradeListView` 에 빈 `items` 를 넘긴 렌더 결과는 빈 문자열이고, 체결 하나면 `trade-list-item` 이 하나다.
- `routes.test.ts`(수정): `moreItems` 끝이 `proposals`, `trades` 다. `parseTradesQuery('?ticker=FLNC&page=1')`.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt`(수정): `/trades` 가 `index.html` 이다.

## 검증

```bash
cd financial-workbench/web && npm run typecheck && npm test && npm run build
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.web.SpaRouteIntegrationTest'
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/routes.ts` | 수정 |
| `financial-workbench/web/src/routes.test.ts` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/header/MoreMenu.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/learning/TracePage.tsx` | 수정 |
| `financial-workbench/web/src/components/trades/TradeList.tsx` | 신규 |
| `financial-workbench/web/src/components/trades/TradeList.test.tsx` | 신규 |
| `financial-workbench/web/src/components/trades/TradesTab.tsx` | 신규 |
| `financial-workbench/web/src/components/trades/TradesTab.test.tsx` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` | 수정 |
