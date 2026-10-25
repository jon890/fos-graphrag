# Phase 01. 쓰는 개념 관계와 개념 초기 데이터

**Execution profile**: standard

## 목표

온톨로지에 관계 종류 `USES_CONCEPT` 를 더하고, 기본 투자 개념과 그 개념을 기존 투자 온톨로지 항목에 잇는 초기 데이터 파일 `learning-concepts-2026-10` 을 더한다. 초기 데이터가 앞 파일의 노드를 만들지 않고 가리키기만 하는 `existing: true` 를 `SeedLoader` 에 더한다.

**범위 외**: 개념 칩과 상세의 `concepts` 응답(phase 02), 화면(phase 04, 05).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「관계」, 「초기 데이터」, `financial-workbench/docs/deployment.md` 의 「개념 설명을 운영에 반영할 때」, `financial-workbench/docs/adr/011-learning-marks-and-trace.md`.

- 저장소 YAML 의 편집할 수 있는 부분은 빈 DB 의 첫 버전에만 쓰인다(ADR-008). 테스트와 e2e 는 빈 DB 에서 시작하므로 새 관계 종류가 바로 쓰인다. 운영 반영 순서는 배포 문서가 소유한다.
- `SeedLoader`(`financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/SeedLoader.kt`)는 `classpath*:seeds/*.yaml` 을 파일 이름 순서로 적용한다. `apply` 는 노드마다 `findExisting(type, name)` 으로 같은 이름의 보관되지 않은 노드를 찾고, 없으면 `nodes.create` 로 만든다. 관계 끝 id 가 없으면 `warn` 로그를 남기고 건너뛴다. `SeedFile`, `SeedNode`, `SeedRelationship` 은 같은 파일 끝의 data class 이고 mapper 는 `FAIL_ON_UNKNOWN_PROPERTIES` 다.
- 관계 생성은 `RelationshipService.create` 가 온톨로지로 검증한다. 최신 버전에 관계 종류가 없으면 예외가 나고, `run()` 이 잡아 `초기 데이터 {} 를 적용하지 못했다` 로 `warn` 을 남기며 그 파일의 트랜잭션은 롤백된다(`SeedRun` 없음, 다음 시작 때 다시 시도).
- 파일 이름 순서: `learning-concepts-2026-10.yaml` 은 `investment-logic-2026-10.yaml` 뒤에 온다. 빈 DB 에서 앞 파일의 노드가 먼저 생겨야 `existing: true` 가 찾는다.

## 의도 메모

- `existing: true` 노드를 찾지 못했을 때 파일을 실패시키지 않는다. 사람이 그 노드를 보관했으면 영원히 재시도하게 되기 때문이다. 관계만 건너뛰고 `SeedRun` 을 남긴다.
- 기존 시드 노드를 이름과 전체 속성으로 다시 적는 안은 버렸다. 운영에서 사람이 보관했거나 이름을 바꾼 노드를 새로 만들어 되살린다.
- 개념 정의는 일반적인 교과서 정의만 쓴다. 수치, 인용, 인물, 주장은 넣지 않는다.

## 작업 항목

### 1. `financial-workbench/ontology/financial-ontology.yaml` 에 `USES_CONCEPT` 를 더한다

`relationshipTypes` 의 `EVIDENCED_BY` 다음에 넣는다. `createPicker` 는 두지 않는다.

```yaml
  USES_CONCEPT:
    label: 쓰는 개념
    sentence: "{from}은(는) {to} 개념을 쓴다"
    description: 투자 온톨로지 항목이 판단에 쓴 투자 개념이다. 근거가 필요 없는 식별 관계다.
    from: [Change, Bottleneck, Company, Valuation, Scenario, Decision]
    to: [Concept]
```

관계 종류 수나 목록을 상수로 단언하는 기존 테스트가 있는지 `git grep -n "EVIDENCED_BY" -- financial-workbench/api/src/test financial-workbench/web/src` 로 찾고, 깨지면 그 테스트를 이 phase 에서 고친다.

### 2. `SeedLoader.kt` 에 `existing` 을 더한다

- `data class SeedNode(val ref: String, val type: String, val properties: Map<String, Any?> = emptyMap(), val existing: Boolean = false)`.
- `apply` 의 노드 처리: `existing` 이면 `findExisting` 결과만 `ids` 에 넣는다. 찾지 못하면 `ids` 에 넣지 않고 `warn` 로그(`초기 데이터 {} 의 {} 는 기존 노드를 찾지 못해 그 관계를 건너뛴다`, key, ref)를 남긴다. 만들지 않는다.
- 클래스 주석에 `existing` 규칙 한 줄을 더한다(`docs/data-schema.md` 「초기 데이터」).

### 3. `financial-workbench/ontology/seeds/learning-concepts-2026-10.yaml` 을 만든다

머리 주석은 `investment-logic-2026-10.yaml` 처럼 적용 규칙을 적는다. `key: learning-concepts-2026-10`.

개념 노드(`type: Concept`, `name`, `englishName`, `category`, `summary`):

| ref | name | englishName | category | summary |
| --- | --- | --- | --- | --- |
| `margin-of-safety` | 안전마진 | Margin of Safety | VALUATION | 내재가치보다 충분히 낮은 값에 사서 판단 착오에 대비하는 여유 |
| `economic-moat` | 경제적 해자 | Economic Moat | BUSINESS | 경쟁자가 따라오기 어렵게 하는 기업의 오래가는 경쟁 우위 |
| `intrinsic-value` | 내재가치 | Intrinsic Value | VALUATION | 기업이 앞으로 벌어들일 현금을 지금 가치로 할인한 값 |
| `mr-market` | 미스터 마켓 | "Mr. Market" | BEHAVIOR | 날마다 감정에 따라 값을 부르는 거래 상대에 시장을 빗댄 비유 |
| `circle-of-competence` | 능력 범위 | Circle of Competence | STRATEGY | 자신이 잘 이해하는 사업에만 투자하라는 원칙 |
| `dcf` | DCF | Discounted Cash Flow | VALUATION | 앞으로 벌어들일 현금흐름을 할인율로 지금 가치로 바꿔 더하는 기업 가치 평가 방법 |
| `gross-margin` | 매출총이익률 | Gross Margin | BUSINESS | 매출에서 매출원가를 뺀 매출총이익이 매출에서 차지하는 비율 |
| `backlog` | 수주 잔고 | Backlog | BUSINESS | 계약은 맺었지만 아직 매출로 인식하지 않은 주문의 합계 |
| `supply-constraint` | 공급 제약 | Supply Constraint | BUSINESS | 수요가 늘어도 생산 능력, 원재료, 인증 같은 이유로 공급을 빨리 늘리지 못하는 상태 |

기존 노드(`existing: true`, 이름 칸만 적는다. 이름은 `investment-logic-2026-10.yaml` 의 값과 글자까지 같아야 한다):

| ref | type | 이름 칸 |
| --- | --- | --- |
| `va-flnc-valley` | Valuation | `title: "FLNC 간이 DCF (Valley AI 화면)"` |
| `va-flnc-20260914` | Valuation | `title: "FLNC 2026-09-14 가치 판단"` |
| `sc-flnc-valley-bear`, `sc-flnc-valley-base`, `sc-flnc-valley-bull` | Scenario | `"FLNC 비관 (Valley)"`, `"FLNC 기준 (Valley)"`, `"FLNC 낙관 (Valley)"` |
| `bn-grid-ess` | Bottleneck | `title: 데이터센터 전력 접속과 ESS 공급` |
| `bn-hbm` | Bottleneck | `title: HBM 생산과 고적층 패키징` |
| `bn-commodity-dram` | Bottleneck | `title: HBM 과 서버 DRAM 우선 배정에 따른 범용 DRAM 공급 부족` |

관계:

- `RELATED_TO`: `margin-of-safety → intrinsic-value`, `mr-market → margin-of-safety`, `economic-moat → intrinsic-value`, `dcf → intrinsic-value`, `gross-margin → dcf`.
- `USES_CONCEPT`: `va-flnc-valley → dcf`, `va-flnc-valley → gross-margin`, `va-flnc-valley → intrinsic-value`, `va-flnc-20260914 → gross-margin`, 시나리오 셋 → `gross-margin`, `bn-grid-ess → supply-constraint`, `bn-grid-ess → backlog`, `bn-hbm → supply-constraint`, `bn-commodity-dram → supply-constraint`.

`api/build.gradle.kts` 는 `from("../ontology/seeds") { into("seeds") }` 로 폴더째 복사하므로 고칠 것이 없다.

### 4. `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt`

기존 테스트의 `count` 도우미와 `SeedFile`, `SeedNode` 직접 생성 패턴(`이미 있는 관계를 다시 적은 파일도 적용된다`)을 따른다.

- 시작할 때 `learning-concepts-2026-10` 의 `SeedRun` 이 하나 있고, `(:Valuation {title: 'FLNC 간이 DCF (Valley AI 화면)'})-[:USES_CONCEPT]->(:Concept {name: 'DCF'})` 가 1개, `FLNC 간이 DCF (Valley AI 화면)` 이름의 Valuation 이 1개(새로 만들지 않음)다.
- `existing: true` 노드가 없으면 만들지 않는다: `SeedNode("x", "Concept", mapOf("name" to "없는개념-$suffix"), existing = true)` 와 새 개념 하나, 그 둘을 잇는 `RELATED_TO` 를 담은 파일을 `applyInTransaction` 하면 `SeedRun` 은 남고 `없는개념-$suffix` 노드는 0 개, 그 관계도 0 개다.
- 최신 버전에 없는 관계 종류를 쓰는 파일은 먼저 만든 개념까지 롤백된다: 기존 「최신 버전에 없는 타입을 쓰는 파일은 적용하지 않고 기록도 남기지 않는다」 처럼 `assertThrows<OntologyViolationException> { seeds.applyInTransaction(file) }` 로 확인한다. 파일은 새 개념 둘(`관계없음A-$suffix`, `관계없음B-$suffix`, `summary` 포함)과 그 둘을 잇는 관계 `SeedRelationship("NO_SUCH_REL", "a", "b")` 다. 뒤에 `SeedRun` 과 두 개념이 모두 0 개다. 운영에서 `USES_CONCEPT` 가 없는 버전으로 시작했을 때와 같은 경로다.

`./gradlew test` 는 `src/test/kotlin` 아래 모든 테스트를 돈다(`api/build.gradle.kts` 의 기본 `test` 작업). `--tests` 로 이 phase 의 테스트를 먼저 돌린 뒤 전체를 돈다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.knowledge.SeedLoaderIntegrationTest' --tests 'dev.fos.workbench.ontology.*'
cd financial-workbench/api && ./gradlew test --rerun
cd financial-workbench && bash scripts/tests/test_scripts.sh
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/ontology/seeds/learning-concepts-2026-10.yaml` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/SeedLoader.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt` | 수정 |
