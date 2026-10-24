# Phase 03. 초기 데이터를 친구 자료의 투자 논리 사슬로 바꾼다

**Execution profile**: standard

## 목표

인물과 개념 초기 데이터(`investing-basics-2026-10`)를 지우고, 친구가 정리한 투자 기록을 옮긴 초기 데이터(`investment-logic-2026-10`)를 넣는다. 이 시드에 기대던 API 테스트와 브라우저 테스트를 새 데이터나 테스트가 직접 만든 노드로 옮긴다.

**범위 외**: 운영 DB 비우기와 운영 적용 확인(원격 검증 목록). 시드 로더 코드(`SeedLoader.kt`)는 바꾸지 않는다.

## 컨텍스트

- 시드 형식은 `key`, `nodes[{ref, type, properties}]`, `relationships[{type, from, to}]` 다. 알 수 없는 키가 있으면 그 파일을 건너뛴다. 한 파일이 트랜잭션 하나이고, 정의에 없는 타입이나 속성 검증 실패가 있으면 그 파일 전체가 롤백되고 `warn` 로그만 남는다(`api/src/main/kotlin/dev/fos/workbench/knowledge/SeedLoader.kt`). 그래서 시드가 실제로 적용됐는지는 테스트로 확인해야 한다.
- 시드는 주장(Claim)을 만들지 못한다. 일반 관계만 만든다.
- 날짜(`date`)는 `YYYY-MM-DD` 문자열, 시각(`datetime`)은 ISO-8601 문자열이다. YAML 이 날짜로 읽지 않게 따옴표로 감싼다. 종목 코드 `000660` 도 따옴표로 감싼다.
- 이 저장소는 공개다. 아래 데이터에는 친구의 실제 매매 날짜와 밸류에이션이 들어 있고, 공개하기로 사용자가 정했다(`docs/adr/009-investment-logic-chain.md`). 아래에 없는 값(거래 금액, 수량, 개인 PC 경로)은 넣지 않는다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「초기 데이터」, 「투자 논리 사슬」, `financial-workbench/docs/prd.md` 의 「요구가 충족됐다고 보는 관측」

## 의도 메모

- 값은 아래 YAML 을 그대로 쓴다. 친구 자료 원본은 이 저장소에 없으므로 값을 고치거나 보태지 않는다. 문장 다듬기도 하지 않는다.
- 결정과 밸류에이션은 잇지 않는다(`BASED_ON` 없음). 친구 자료에서 어느 결정이 어느 밸류에이션을 썼는지 확인되지 않았다.
- 인물과 개념 타입의 정의는 남긴다. 데이터만 뺀다.

## 작업 항목

### 1. `financial-workbench/ontology/seeds/investing-basics-2026-10.yaml` 을 지운다

### 2. `financial-workbench/ontology/seeds/investment-logic-2026-10.yaml` 을 만든다

아래 내용을 그대로 쓴다.

```yaml
# 친구가 Obsidian 에 정리한 투자 기록에서 옮긴 투자 논리 사슬. API 가 시작할 때 한 번만 적용한다(docs/data-schema.md 「초기 데이터」).
# 같은 key 는 다시 적용하지 않는다. 내용을 바꾸려면 새 key 의 파일을 더한다.
# 원문과 대조하지 못한 값은 description 이나 reason 에 「원문 대조 대기」 라고 적었다.
key: investment-logic-2026-10
nodes:
  - ref: ch-ai-memory
    type: Change
    properties: { title: "AI 서버가 늘면서 HBM 을 포함한 고성능 메모리 수요가 크게 늘어난다", category: TECHNOLOGY, since: "2023년", description: "NVIDIA 가 2023-11-13 H200 에 HBM3e 141GB 를 싣고 2024년 2분기부터 시스템을 공급한다고 발표했다. 2024년에는 AI 서버가 HBM 을 포함한 DRAM 수요를 크게 늘렸다(Micron 10-K). 오래 갈 이유는 따로 검증하지 않았다." }
  - ref: ch-dc-power
    type: Change
    properties: { title: "데이터센터가 늘면서 전력 공급과 계통 접속이 막히고, 전력을 저장하고 운영하는 ESS 수요가 커진다", category: TECHNOLOGY, description: "친구의 FLNC 투자 가설이다. 원문 대조 대기." }
  - ref: ch-chip-link
    type: Change
    properties: { title: "AI 반도체가 발전할수록 칩과 칩, 시스템 사이의 연결이 병목이 된다", category: TECHNOLOGY, description: "친구의 PoET 투자 가설이다. 원문 대조 대기." }
  - ref: bn-hbm
    type: Bottleneck
    properties: { title: "HBM 생산과 고적층 패키징", status: HYPOTHESIS, demandEvidence: "SK하이닉스가 2024-02-21 2024년 계획 HBM 생산량이 모두 팔렸다고 밝혔다. Micron 의 HBM 매출은 2025 회계연도 3분기에 전 분기보다 약 50% 늘었다.", supplyConstraint: "고적층, 열 제어, 수율, 고객 인증이 필요하다. 같은 비트를 만들 때 HBM3E 는 DDR5 보다 웨이퍼를 약 3배 쓴다(Micron 2024 설명).", description: "친구 자료의 판정은 「후보 병목, 당시 정보로 다시 판정하지 않음」 이다. 3년 지속 여부는 따로 검증해야 한다." }
  - ref: bn-commodity-dram
    type: Bottleneck
    properties: { title: "HBM 과 서버 DRAM 우선 배정에 따른 범용 DRAM 공급 부족", status: HYPOTHESIS, demandEvidence: "고객이 물량을 미리 확보하고 있다(TrendForce 2025-09-24).", supplyConstraint: "생산 능력이 HBM 과 서버 DRAM 에 먼저 배정된다.", description: "TrendForce 는 2025년 4분기 범용 DRAM 가격이 8~13% 오른다고 봤고, 2026-02-02 에는 2026년 1분기 계약가 상승 전망을 55~60% 에서 90~95% 로 올렸다. 확정 가격이 아니라 전망이다. 2023년 DRAM 은 공급 제약이 아니라 과잉과 재고 조정이었다(반대 사례)." }
  - ref: bn-grid-ess
    type: Bottleneck
    properties: { title: "데이터센터 전력 접속과 ESS 공급", status: HYPOTHESIS, demandEvidence: "Fluence 의 2026-02-04 공시 기준 수주 잔고 약 55억 달러, 파이프라인 약 300억 달러.", supplyConstraint: "배터리 셀 공급망이 중국에 몰려 있다. IEA 는 2024년 배터리 제조 능력의 약 85% 가 중국이라고 제시했다.", description: "친구의 가설이다. 원문 대조 대기." }
  - ref: bn-optical-link
    type: Bottleneck
    properties: { title: "칩 사이 광 연결(CPO) 상용화", status: HYPOTHESIS, supplyConstraint: "상용화와 고객 채택 여부를 시장이 의심한다고 친구가 봤다.", description: "고객 샘플, 평가 완료, 양산 계약, 매출 인식 같은 확인 지표는 아직 복원하지 못했다. 원문 대조 대기." }
  - ref: sec-memory
    type: Sector
    properties: { name: 메모리 반도체 }
  - ref: sec-ess
    type: Sector
    properties: { name: "에너지 저장(ESS)" }
  - ref: sec-optical
    type: Sector
    properties: { name: 광 연결 부품 }
  - ref: co-skhynix
    type: Company
    properties: { name: SK하이닉스, country: KR }
  - ref: co-micron
    type: Company
    properties: { name: Micron Technology, country: US }
  - ref: co-fluence
    type: Company
    properties: { name: Fluence Energy, country: US }
  - ref: co-poet
    type: Company
    properties: { name: PoET Technologies, country: OTHER, description: 캐나다 기업 }
  - ref: se-skhynix
    type: Security
    properties: { market: KRX_KOSPI, ticker: "000660", name: SK하이닉스 보통주, securityType: COMMON, currency: KRW }
  - ref: se-flnc
    type: Security
    properties: { market: NASDAQ, ticker: FLNC, name: Fluence Energy Class A, securityType: COMMON, currency: USD }
  - ref: se-poet
    type: Security
    properties: { market: NASDAQ, ticker: POET, name: PoET Technologies, securityType: COMMON, currency: USD }
  - ref: va-flnc-valley
    type: Valuation
    properties: { title: "FLNC 간이 DCF (Valley AI 화면)", currentPrice: 22.10, currency: USD, method: DCF, description: "친구가 제공한 Valley AI Simplified DCF 화면이다. 기준일은 기록에 없다. 「모든 캡처는 낙관 시나리오를 고른 화면」 이라는 정정과 「기준 시나리오 화면」 이라는 서술이 충돌한다. 원문 대조 대기." }
  - ref: sc-flnc-valley-bear
    type: Scenario
    properties: { title: "FLNC 비관 (Valley)", kind: BEAR, valuePerShare: 15.97, assumptions: "매출총이익률 8%. 일회성 비용이 다시 생기고 배터리 셀 가격이 오른다. 영업비와 연구개발비 부담이 이어진다." }
  - ref: sc-flnc-valley-base
    type: Scenario
    properties: { title: "FLNC 기준 (Valley)", kind: BASE, valuePerShare: 45.83, assumptions: "매출총이익률 12%(경영진 가이던스 중간값). 1분기 일회성 비용이 2분기에 정상화되고 고정비가 희석돼 손익분기점에 이른다." }
  - ref: sc-flnc-valley-bull
    type: Scenario
    properties: { title: "FLNC 낙관 (Valley)", kind: BULL, valuePerShare: 266.27, assumptions: "매출총이익률 15%. 공급망이 안정되고 제조원가가 내려가며 서비스와 디지털 비중이 빠르게 커진다. 구조조정 뒤 영업 레버리지가 생긴다." }
  - ref: va-flnc-20260914
    type: Valuation
    properties: { title: "FLNC 2026-09-14 가치 판단", asOf: "2026-09-14", currentPrice: 9.51, currency: USD, method: OTHER, description: "복기용 기준값으로 적은 메모다. 작성자가 친구인지 분석 도구인지 기록이 분명하지 않다. 원문 대조 대기." }
  - ref: sc-flnc-0914-bear
    type: Scenario
    properties: { title: "FLNC 비관 (2026-09-14)", kind: BEAR, valuePerShare: 6.5, assumptions: "매출총이익률 5~8% 가 이어지고 EBITDA 와 잉여현금흐름 전환이 늦어지며 추가 희석이 생긴다.", description: "가치 범위 5~8달러. 주당 가치 칸은 중간값이다." }
  - ref: sc-flnc-0914-base
    type: Scenario
    properties: { title: "FLNC 기준 (2026-09-14)", kind: BASE, valuePerShare: 13.5, assumptions: "2027 회계연도에 생산 지연이 정상화되고 매출총이익률 10~12%, EBITDA 는 손익분기점에서 소폭 흑자다.", description: "가치 범위 12~15달러. 주당 가치 칸은 중간값이다." }
  - ref: sc-flnc-0914-bull
    type: Scenario
    properties: { title: "FLNC 낙관 (2026-09-14)", kind: BULL, valuePerShare: 32.5, assumptions: "매출총이익률 15% 이상, 소프트웨어와 서비스 비중이 커지고 잉여현금흐름이 이어진다.", description: "가치 범위 25~40달러. 주당 가치 칸은 중간값이다." }
  - ref: de-flnc-buy
    type: Decision
    properties: { title: FLNC 첫 매수, action: BUY, decidedAt: "2026-05-04", reason: "이유는 예전 인터뷰 요약에만 있어 원문 대조 대기다." }
  - ref: de-flnc-add
    type: Decision
    properties: { title: FLNC 추가 매수, action: ADD, decidedAt: "2026-06-24", reason: "회상: 소량, 모멘텀, 간이 DCF 상 40달러대 가치. 어느 밸류에이션을 썼는지는 확인하지 못했다. 원문 대조 대기." }
  - ref: de-poet-buy
    type: Decision
    properties: { title: PoET 첫 매수, action: BUY, decidedAt: "2026-03-27", reason: "매수 이유 기록이 없다." }
  - ref: de-skhynix-buy
    type: Decision
    properties: { title: SK하이닉스 첫 매수, action: BUY, decidedAt: "2025-07-21", reason: "본인 진술: 매수 이유가 기억나지 않는다." }
  - ref: doc-skh-hbm-soldout
    type: Document
    properties: { title: "SK hynix HBM 영업 담당 김기태 부사장 인터뷰", url: "https://news.skhynix.com/en/new-leadership-spotlight-vice-president-kitae-kim-head-of-hbm-sales-and-marketing/", publisher: SK hynix Newsroom, documentType: IR, publishedAt: "2024-02-21", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-skh-hbm3e-dev
    type: Document
    properties: { title: "SK hynix HBM3E 개발 발표", url: "https://news.skhynix.com/en/sk-hynix-develops-worlds-best-performing-hbm3e/", publisher: SK hynix Newsroom, documentType: IR, collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-skh-hbm3e-mp
    type: Document
    properties: { title: "SK hynix HBM3E 양산 시작 발표", url: "https://news.skhynix.com/en/sk-hynix-begins-volume-production-of-industry-first-hbm3e/", publisher: SK hynix Newsroom, documentType: IR, publishedAt: "2024-03-19", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-skh-1q25
    type: Document
    properties: { title: "SK hynix 2025년 1분기 실적", url: "https://news.skhynix.com/en/sk-hynix-announces-1q25-financial-results/", publisher: SK hynix Newsroom, documentType: IR, publishedAt: "2025-04-24", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-mu-10k-2024
    type: Document
    properties: { title: "Micron 2024 회계연도 10-K", url: "https://www.sec.gov/Archives/edgar/data/723125/000072312524000027/mu-20240829.htm", publisher: SEC, documentType: FILING, collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-mu-hbm-wafer
    type: Document
    properties: { title: "Micron 투자자 자료 (HBM3E 웨이퍼 사용량)", url: "https://investors.micron.com/static-files/4550f98c-1054-4847-a929-c17d520a0564", publisher: Micron, documentType: IR, collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-mu-fq3-2025
    type: Document
    properties: { title: "Micron 2025 회계연도 3분기 실적 자료", url: "https://micron.gcs-web.com/static-files/23e319ba-a44e-4da4-9462-d4eea7376787", publisher: Micron, documentType: IR, publishedAt: "2025-06-25", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-tf-20250924
    type: Document
    properties: { title: "TrendForce 2025년 4분기 DRAM 가격 전망", url: "https://www.trendforce.com/presscenter/news/20250924-12733.html", publisher: TrendForce, documentType: REPORT, publishedAt: "2025-09-24", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-tf-20260202
    type: Document
    properties: { title: "TrendForce 2026년 1분기 DRAM 계약가 전망", url: "https://www.trendforce.com/presscenter/news/20260202-12911.html", publisher: TrendForce, documentType: REPORT, publishedAt: "2026-02-02", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-nv-h200
    type: Document
    properties: { title: "NVIDIA H200 발표", url: "https://nvidianews.nvidia.com/news/nvidia-supercharges-hopper-the-worlds-leading-ai-computing-platform", publisher: NVIDIA, documentType: NEWS, publishedAt: "2023-11-13", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-flnc-q1fy26
    type: Document
    properties: { title: "Fluence Energy 2026 회계연도 1분기 실적", url: "https://ir.fluenceenergy.com/news-releases/news-release-details/fluence-energy-inc-reports-first-quarter-2026-results-reaffirms", publisher: Fluence Energy, documentType: IR, publishedAt: "2026-02-04", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-flnc-q3fy26
    type: Document
    properties: { title: "Fluence Energy 2026 회계연도 3분기 실적", url: "https://www.sec.gov/Archives/edgar/data/1868941/000186894126000028/flncq3fy26earningspressrel.htm", publisher: SEC, documentType: FILING, publishedAt: "2026-08-05", collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-flnc-10k-2025
    type: Document
    properties: { title: "Fluence Energy 2025 회계연도 10-K", url: "https://www.sec.gov/Archives/edgar/data/1868941/000186894125000081/flnc-20250930.htm", publisher: SEC, documentType: FILING, collectedAt: "2026-10-24T00:00:00Z" }
  - ref: doc-iea-ev-2025
    type: Document
    properties: { title: "IEA Global EV Outlook 2025 배터리", url: "https://www.iea.org/reports/global-ev-outlook-2025/electric-vehicle-batteries", publisher: IEA, documentType: REPORT, collectedAt: "2026-10-24T00:00:00Z" }
relationships:
  - { type: CREATES, from: ch-ai-memory, to: bn-hbm }
  - { type: CREATES, from: ch-ai-memory, to: bn-commodity-dram }
  - { type: CREATES, from: ch-dc-power, to: bn-grid-ess }
  - { type: CREATES, from: ch-chip-link, to: bn-optical-link }
  - { type: HAS_BOTTLENECK, from: sec-memory, to: bn-hbm }
  - { type: HAS_BOTTLENECK, from: sec-memory, to: bn-commodity-dram }
  - { type: HAS_BOTTLENECK, from: sec-ess, to: bn-grid-ess }
  - { type: HAS_BOTTLENECK, from: sec-optical, to: bn-optical-link }
  - { type: BENEFITS, from: bn-hbm, to: co-skhynix }
  - { type: BENEFITS, from: bn-hbm, to: co-micron }
  - { type: BENEFITS, from: bn-grid-ess, to: co-fluence }
  - { type: BENEFITS, from: bn-optical-link, to: co-poet }
  - { type: ISSUES, from: co-skhynix, to: se-skhynix }
  - { type: ISSUES, from: co-fluence, to: se-flnc }
  - { type: ISSUES, from: co-poet, to: se-poet }
  - { type: HAS_VALUATION, from: co-fluence, to: va-flnc-valley }
  - { type: HAS_VALUATION, from: co-fluence, to: va-flnc-20260914 }
  - { type: HAS_SCENARIO, from: va-flnc-valley, to: sc-flnc-valley-bear }
  - { type: HAS_SCENARIO, from: va-flnc-valley, to: sc-flnc-valley-base }
  - { type: HAS_SCENARIO, from: va-flnc-valley, to: sc-flnc-valley-bull }
  - { type: HAS_SCENARIO, from: va-flnc-20260914, to: sc-flnc-0914-bear }
  - { type: HAS_SCENARIO, from: va-flnc-20260914, to: sc-flnc-0914-base }
  - { type: HAS_SCENARIO, from: va-flnc-20260914, to: sc-flnc-0914-bull }
  - { type: HAS_DECISION, from: se-flnc, to: de-flnc-buy }
  - { type: HAS_DECISION, from: se-flnc, to: de-flnc-add }
  - { type: HAS_DECISION, from: se-poet, to: de-poet-buy }
  - { type: HAS_DECISION, from: se-skhynix, to: de-skhynix-buy }
  - { type: EVIDENCED_BY, from: ch-ai-memory, to: doc-nv-h200 }
  - { type: EVIDENCED_BY, from: ch-ai-memory, to: doc-mu-10k-2024 }
  - { type: EVIDENCED_BY, from: bn-hbm, to: doc-skh-hbm-soldout }
  - { type: EVIDENCED_BY, from: bn-hbm, to: doc-skh-hbm3e-dev }
  - { type: EVIDENCED_BY, from: bn-hbm, to: doc-skh-hbm3e-mp }
  - { type: EVIDENCED_BY, from: bn-hbm, to: doc-mu-hbm-wafer }
  - { type: EVIDENCED_BY, from: bn-hbm, to: doc-mu-fq3-2025 }
  - { type: EVIDENCED_BY, from: bn-hbm, to: doc-skh-1q25 }
  - { type: EVIDENCED_BY, from: bn-commodity-dram, to: doc-tf-20250924 }
  - { type: EVIDENCED_BY, from: bn-commodity-dram, to: doc-tf-20260202 }
  - { type: EVIDENCED_BY, from: bn-commodity-dram, to: doc-mu-10k-2024 }
  - { type: EVIDENCED_BY, from: bn-grid-ess, to: doc-flnc-q1fy26 }
  - { type: EVIDENCED_BY, from: bn-grid-ess, to: doc-iea-ev-2025 }
  - { type: EVIDENCED_BY, from: va-flnc-valley, to: doc-flnc-10k-2025 }
  - { type: EVIDENCED_BY, from: va-flnc-20260914, to: doc-flnc-q3fy26 }
```

### 3. `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt`

- 「시작할 때 초기 데이터가 들어가고 이력은 system 이다」: 워런 버핏 대신 `GET /api/nodes?q=FLNC&types=Security` 로 `Fluence Energy Class A` 를 찾고, 첫 이력이 `CREATE` 이며 작업자가 사용자로 보이지 않는지 본다. `SeedRun` key 를 `investment-logic-2026-10` 으로. `RELATED_TO` 단언은 `GET /api/nodes/{FLNC 첫 매수 id}` 의 `relationships` 에 `HAS_DECISION` 이 있고 그 시작이 `Fluence Energy Class A` 인지로 바꾼다. Decision 은 `GET /api/nodes?q=FLNC 첫 매수&types=Decision` 으로 찾는다.
- 「다시 돌려도 새로 만들지 않는다」: `Person {name: '워런 버핏'}` 대신 `Company {name: 'Fluence Energy'}` 가 1개, `SeedRun {key: 'investment-logic-2026-10'}` 이 1개인지 본다.
- 「이미 있는 관계를 다시 적은 파일도 적용된다」 는 새 시드의 `Fluence Energy` 와 `FLNC 간이 DCF (Valley AI 화면)` 노드와 그 사이 `HAS_VALUATION` 관계를 다시 적는 파일로 옮긴다. 적용 전후 같은 끝의 관계가 1개이고 새 `SeedRun` 이 남는지 단언해 기존 관계를 다시 만들지 않는 동작을 유지한다.
- 새 테스트 「초기 데이터의 사슬이 모두 들어간다」: Cypher 로 `investment-logic-2026-10` 의 노드 수를 타입별로 세지 않는다(시드가 바뀌면 같이 낡는다). 대신 `(:Decision {title: 'FLNC 첫 매수'})<-[:HAS_DECISION]-(:Security)<-[:ISSUES]-(:Company)<-[:BENEFITS]-(:Bottleneck)<-[:CREATES]-(:Change)` 경로가 1개 있는지, 그리고 `(:Company {name: 'Fluence Energy'})-[:HAS_VALUATION]->(:Valuation)-[:HAS_SCENARIO]->(:Scenario)` 의 `kind` 가 `BEAR`, `BASE`, `BULL` 을 모두 담는지 본다. 이 테스트가 실패하면 시드 파일이 롤백된 것이다(로그에 `warn`).
- 실패 경로는 기존 「이미 있는 관계를 다시 적은 파일도 적용된다」 아래의 `SeedFile` 직접 생성 방식을 따라, 정의에 없는 타입을 쓴 파일이 `SeedRun` 을 남기지 않는지 확인하는 테스트가 이미 있으면 그대로 두고, 없으면 하나 더한다.

### 4. 시드에 기대던 브라우저 테스트를 옮긴다

`financial-workbench/web/e2e/workbench.spec.ts`

- 232행 근처 「시작할 때 들어간 인물은 영문 이름으로도 찾고」: `search-input` 에 `FLNC` 를 넣고 `Fluence Energy Class A` 결과의 타입 배지가 「종목」 인지로 바꾼다. 주석도 「시작할 때 들어간 종목은 종목 코드로도 찾는다」 로.
- 「2d) A 가 책을 근거로 거장의 생각을 주장으로 만든다」(393행 근처): 테스트 안에서 인물 `워런 버핏-${suffix}`(영문 이름 `Warren Buffett ${suffix}`)과 개념 `안전마진-${suffix}`(한 줄 정의 채움)을 만들기 폼으로 먼저 만든 뒤, 지금처럼 책 문서(`create-link-AUTHORED-picker`)와 `ADVOCATES` 주장을 만든다. 단언의 이름은 suffix 를 붙인 이름으로.
- 9b(1087행 근처)의 인물 폼 편집: 2d 에서 만든 인물을 `Warren Buffett ${suffix}` 로 찾아 연다.
- 9c(1130행 근처)의 Concept 필수 속성 영향: 「시작 때 들어간 개념」 대신 2d 에서 만든 개념이 영향 수에 잡히는지로 주석과 기대값을 바꾼다. 영향 수를 정확한 숫자로 단언하고 있으면 「1 이상」 으로 바꾼다. 다른 테스트가 만든 개념이 더 있을 수 있기 때문이다.

## 검증

```bash
cd financial-workbench && ! git grep -n "investing-basics\|워런 버핏'" -- api/src web/e2e ontology
cd financial-workbench/api && ./gradlew test --rerun
cd financial-workbench/web && npm run typecheck && npm test && npm run build
cd financial-workbench && COMPOSE_PROJECT_NAME=plan013-p3-verify NEO4J_PASSWORD=e2e-local-password COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench && COMPOSE_PROJECT_NAME=plan013-p3-verify COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose logs app | grep -q "초기 데이터 적용: 1개 파일"
cd financial-workbench && ! COMPOSE_PROJECT_NAME=plan013-p3-verify COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose logs app | grep -E "초기 데이터 .*(적용하지 못했다|건너뛴다|읽지 못했다)"
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && COMPOSE_PROJECT_NAME=plan013-p3-verify COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/ontology/seeds/investing-basics-2026-10.yaml` | 삭제 |
| `financial-workbench/ontology/seeds/investment-logic-2026-10.yaml` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
