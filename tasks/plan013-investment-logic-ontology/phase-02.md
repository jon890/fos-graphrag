# Phase 02. 기업 사이의 주장 종류를 뺀다

**Execution profile**: standard

## 목표

주장 종류 `SUPPLIES_TO`, `COMPETES_WITH`, `HAS_EXPOSURE_TO` 를 저장소 YAML 에서 빼고, 이 셋을 쓰던 테스트를 남는 주장 종류(`BELONGS_TO_SECTOR`, `ADVOCATES`, `CRITICIZES`)로 옮긴다.

**범위 외**: 새 타입과 관계(phase 01), 초기 데이터 교체(phase 03). 웹 단위 테스트(`web/src/**/*.test.ts*`)는 자기 안의 가짜 온톨로지(`web/src/components/testSupport.tsx`)를 써서 YAML 과 무관하므로 고치지 않는다.

## 컨텍스트

- `Claim` 타입은 코드가 소유한다(`managedBy: claims`). `Claim.predicate` 의 `values` 는 로더가 `claimPredicates` 키로 다시 만든다(`OntologyLoader.withDerivedClaimPredicate`). YAML 에 적힌 `values` 도 남는 셋으로 맞춘다.
- 첫 접속 가이드는 `BELONGS_TO_SECTOR` 를 먼저 고르고(`web/src/lib/guide.ts` 의 `PREFERRED_PREDICATE`), Company 를 주어로 받는 주장 종류의 대상에 활성 노드가 있어야 연습을 연다. `BELONGS_TO_SECTOR` 를 남기므로 가이드 코드는 바꾸지 않는다.
- API 테스트의 주장 도우미는 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/support/Fixtures.kt` 의 `claim(predicate, subjectId, objectId, documentIds)` 이고, `company(name)`, `sector(name)`, `security(name)`, `document(title)` 이 있다.
- 기업과 기업을 잇던 테스트는 기업과 산업을 잇는 `BELONGS_TO_SECTOR` 로 바꾸면 같은 동작(생성, 검증, 검토, 동시 수정, 이력, 그래프 접기)을 확인할 수 있다. 「경쟁」 처럼 같은 두 끝 사이에 다른 종류의 주장을 하나 더 만들던 테스트는 `ADVOCATES` 와 `CRITICIZES`(Person → Concept)로 옮긴다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「관계」, `financial-workbench/docs/flow.md` 의 「산업 소속 Claim 등록과 검토」, 「주장 만들기 화면」, `financial-workbench/docs/adr/009-investment-logic-chain.md`

## 의도 메모

- 테스트가 확인하던 동작은 줄이지 않는다. 주장 종류만 바꾸고 단언하는 동작은 그대로 둔다. 바꿀 수 없는 단언이 나오면 지우지 말고 이 phase 를 멈추고 알린다.
- `NodeWriteIntegrationTest.kt:66` 처럼 「관계 API 로 주장 종류 이름을 보내면 거부한다」 는 테스트는 남는 주장 종류 이름(`BELONGS_TO_SECTOR`)으로 바꾼다.
- 브라우저 테스트의 순차 흐름(공급 주장 만들기 → 검토 → 그래프 접기 → 동시 수정)은 「가상전자-<suffix> 가 가상산업-<suffix> 에 속한다」 로 바꾼다. 「주체와 대상 바꾸기」 는 산업 상세에서 시작해 기업을 주체로 만드는 흐름으로 확인한다.

## 작업 항목

### 1. `financial-workbench/ontology/financial-ontology.yaml`

- `claimPredicates` 에서 `SUPPLIES_TO`, `COMPETES_WITH`, `HAS_EXPOSURE_TO` 를 지운다.
- `Claim.properties.predicate.values` 를 `[BELONGS_TO_SECTOR, ADVOCATES, CRITICIZES]` 로 바꾼다.

### 2. API 테스트를 남는 주장 종류로 옮긴다

`git grep -n "SUPPLIES_TO\|COMPETES_WITH\|HAS_EXPOSURE_TO" financial-workbench/api` 가 아무것도 내지 않게 한다. 대상과 할 일이다.

- `ontology/OntologyLabelsTest.kt:48`: `claimPredicates.keys` 를 `containsExactly("BELONGS_TO_SECTOR", "ADVOCATES", "CRITICIZES")` 로. 같은 파일의 predicate `valueLabels`, `sentence` 단언(96, 106행 근처)도 남는 종류로.
- `ontology/OntologyValidatorTest.kt:72`: `requirePredicate("BELONGS_TO_SECTOR").subjectTypes` 가 `Company`, `Security` 를 담는지로.
- `ontology/OntologyVersionIntegrationTest.kt:57`: `.contains("SUPPLIES_TO")` 를 `.contains("BELONGS_TO_SECTOR")` 로.
- `knowledge/ClaimIntegrationTest.kt`, `graph/SearchAndGraphIntegrationTest.kt`, `ReviewFixIntegrationTest.kt`, `ConcurrencyIntegrationTest.kt`, `history/ChangeHistoryIntegrationTest.kt`, `knowledge/TransactionConsistencyIntegrationTest.kt`, `RoleAndUserAdminIntegrationTest.kt`, `knowledge/NodeWriteIntegrationTest.kt`: 기업과 기업 주장을 `fx.sector(...)` 를 대상으로 한 `BELONGS_TO_SECTOR` 로 바꾼다. 주장의 이름 단언(「A → B 공급한다」)은 「A → B 속한다」 로 바꾼다. `COMPETES_WITH`, `HAS_EXPOSURE_TO` 로 「같은 끝에 다른 종류」 나 「대상 타입 위반」 을 확인하던 곳은 `ADVOCATES`, `CRITICIZES` 와 `fx.node("Person", ...)`, `fx.node("Concept", ...)` 로 옮긴다.
- 그래프 접기 테스트(`SearchAndGraphIntegrationTest`)의 「두 기업 사이 선 하나」 는 「기업과 산업 사이 선 하나」 로 바꾼다.

이 phase 를 검증하는 테스트는 위 파일들 자체다. 정상 경로는 `BELONGS_TO_SECTOR` 주장 생성과 검토, 실패 경로는 `ClaimIntegrationTest` 의 대상 타입 위반(예: `BELONGS_TO_SECTOR` 의 대상에 Company 를 주면 `400`)이다.

### 3. 브라우저 테스트를 옮긴다

`financial-workbench/web/e2e/workbench.spec.ts` 에서 `git grep -n "SUPPLIES_TO\|COMPETES_WITH\|공급한다\|경쟁한다" financial-workbench/web/e2e` 가 아무것도 내지 않게 한다.

- 파일 머리의 `data`(`supplier`, `customer`, `description`, `description2`)를 기업과 산업 이름(`company`, `sector`, 「가상전자-<suffix> 는 가상산업-<suffix> 에 속한다.」)으로 바꾼다. 산업 노드는 흐름 1에서 만든다.
- 363행 「2) A 가 문서를 등록하고 SUPPLIES_TO Claim 을 만든다」 를 `BELONGS_TO_SECTOR` 로. 445행부터 478행의 「주체와 대상 바꾸기」 와 두 번째 주장은 산업 상세에서 시작해 기업을 주체로 고르는 `BELONGS_TO_SECTOR` 주장과, 다른 기업의 같은 산업 소속 주장으로 바꾼다.
- 519, 530, 541, 561행의 주장 이름 단언을 「<기업> → <산업> 속한다」 로.
- 첫 접속 가이드 테스트(902행부터 935행)는 `BELONGS_TO_SECTOR` 를 그대로 쓰므로 바꾸지 않는다. 통과하는지만 본다.
- `financial-workbench/web/e2e/mobile.spec.ts` 는 빼는 종류를 쓰지 않는다. 통과하는지만 본다.

## 검증

```bash
cd financial-workbench && ! git grep -n "SUPPLIES_TO\|COMPETES_WITH\|HAS_EXPOSURE_TO" -- ontology api web/e2e
cd financial-workbench/api && ./gradlew test --rerun
cd financial-workbench/web && npm run typecheck && npm test && npm run build
cd financial-workbench && COMPOSE_PROJECT_NAME=plan013-p2-verify NEO4J_PASSWORD=e2e-local-password COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && COMPOSE_PROJECT_NAME=plan013-p2-verify COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyVersionIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/ClaimIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/graph/SearchAndGraphIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ReviewFixIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ConcurrencyIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/history/ChangeHistoryIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/TransactionConsistencyIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/RoleAndUserAdminIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
