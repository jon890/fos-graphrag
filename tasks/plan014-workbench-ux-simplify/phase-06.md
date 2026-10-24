# Phase 06. 온톨로지 표시 이름과 화면 문구 다듬기, 투자 온톨로지 명칭

**Execution profile**: standard

## 목표

관계 표시 이름을 관계 문장으로 읽히는 동사구로 바꾸고, 타입 설명의 첫 문장을 「＋ 추가」 메뉴에 맞게 다듬는다. 화면 문구(TSX, `src/lib/guide.ts`)를 `korean-check` 기준으로 점검해 어색한 표현을 고치고, 「투자 논리 사슬」 이 남은 곳을 「투자 온톨로지」 로 바꾼다.

**범위 외**: 운영 온톨로지에 같은 문구를 저장하는 일(배포 뒤 ADMIN 이 한다. `docs/deployment.md` 「저장소 온톨로지의 문구를 운영에 반영할 때」). 화면 구조 변경(앞 phase 에서 끝남).

## 컨텍스트

- 온톨로지는 `financial-workbench/ontology/financial-ontology.yaml` 이다. 관계 종류는 `relationshipTypes`, 타입 설명은 `nodeTypes.<타입>.description` 이다. 이 파일의 편집할 수 있는 부분은 DB 가 비어 있을 때만 첫 버전이 된다([ADR-008](../../financial-workbench/docs/adr/008-ontology-versions-in-db.md)). 테스트와 e2e 는 빈 DB 에서 시작하므로 이 파일의 값을 쓴다.
- 관계 문장 규칙은 `financial-workbench/docs/flow.md` 「관계 문장」, 표시 이름 규칙은 `financial-workbench/docs/data-schema.md` 「표시 이름」 이다. 표시 이름은 끝 타입을 목적어로 받는 동사구여야 「{끝}을(를) …합니다」, 「{시작}이(가) …합니다」 가 자연스럽다.
- 표시 이름이 있는지는 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` 가 확인한다. 값 자체를 단언하는 테스트가 있는지 `git grep -n "이익을 준다\|결정의 근거\|병목이 있다\|관련된다" -- financial-workbench` 로 확인하고 함께 고친다.
- 화면 문구는 TSX 안에 인라인으로 있고, 첫 접속 가이드 문구는 `src/lib/guide.ts` 다. 문구 규칙은 `korean-check` 스킬의 `references/korean-style.md` 이고 검사기는 같은 스킬의 `scripts/korean-style-check.py` 다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「관계 문장」, 「노드 만들기」, 「첫 접속 가이드」, `financial-workbench/docs/data-schema.md` 의 「표시 이름」, 「투자 온톨로지」, `financial-workbench/docs/deployment.md` 의 「저장소 온톨로지의 문구를 운영에 반영할 때」

## 의도 메모

- 키(`ISSUES`, `CREATES` 등)와 속성 정의, `createPicker` 의 관계는 바꾸지 않는다. 표시 문구만 바꾼다.
- 바꾼 문구는 PR 본문의 「문구 변경 표」 로 옮긴다. 커밋 메시지 본문에 전과 후를 줄마다 적어 두면 PR 을 쓸 때 그대로 옮길 수 있다.
- 새 번역어를 만들지 않는다. 저장소 문서와 코드가 이미 쓰는 표기를 따른다.

## 작업 항목

### 1. `financial-workbench/ontology/financial-ontology.yaml` 의 관계 표시 이름

| 관계 | 지금 `label` | 바꿀 `label` | 바꿀 `description` |
| --- | --- | --- | --- |
| `RELATED_TO` | 관련된다 | 함께 본다 | 두 개념을 함께 본다. 근거가 필요 없는 식별 관계다. |
| `HAS_BOTTLENECK` | 병목이 있다 | 겪는다 | 산업이 병목을 겪는다. |
| `BENEFITS` | 이익을 준다 | 이롭게 한다 | 병목이 기업을 이롭게 한다. 기업이 병목의 이익을 가져간다. |
| `HAS_VALUATION` | 밸류에이션 | 가진다 | 기업이 밸류에이션을 가진다. |
| `HAS_SCENARIO` | 시나리오 | 포함한다 | 밸류에이션이 시나리오를 포함한다. |
| `HAS_DECISION` | 결정 | 받는다 | 종목이 투자 결정을 받는다. |
| `BASED_ON` | 결정의 근거 | 뒷받침한다 | 밸류에이션이 투자 결정을 뒷받침한다. |
| `EVIDENCED_BY` | 근거 자료 | 근거로 삼는다 | 변화, 병목, 밸류에이션이 자료를 근거로 삼는다. |

`ISSUES`(발행한다), `AUTHORED`(썼다), `CREATES`(만든다)는 이미 규칙에 맞아 그대로 둔다. `createPicker.label` 은 고르기 칸의 이름이라 동사구로 바꾸지 않는다. 다만 「병목이 있는 산업」 은 「이 병목을 겪는 산업」 으로 바꿔 관계 이름과 맞춘다.

### 2. 같은 파일의 타입 설명

첫 문장만 읽어도 무엇인지 알게 고친다. 둘째 문장부터는 지금 내용을 남긴다.

| 타입 | 바꿀 `description` |
| --- | --- |
| `Company` | 사업을 하는 법인이다. 상장 여부와 관계없이 담는다. |
| `Security` | 시장에서 거래되는 종목이다. 같은 기업의 여러 상장과 이름이 같은 종목을 시장과 종목 코드로 구분한다. |
| `Sector` | 기업이 속하고 병목이 생기는 산업이다. |
| `Document` | 판단과 주장의 근거가 되는 자료다. 서버가 주소를 읽어 오지 않으므로 사람이 자료 정보를 직접 등록한다. |
| `Change` | 투자 판단에 영향을 주는 세상의 변화다. |
| `Valuation` | 한 기업의 가치를 한 기준일에 평가한 기록이다. |
| `Scenario` | 비관, 기준, 낙관 가운데 한 가정으로 계산한 주당 가치다. |
| `Claim` | 근거 문서와 함께 등록하고 다른 편집자가 검토하는 주장이다. |

`Person`, `Concept`, `Bottleneck`, `Decision` 은 그대로 둔다.

### 3. 화면 문구 점검: `financial-workbench/web/src/**/*.tsx`, `financial-workbench/web/src/lib/guide.ts`

- 사용자에게 보이는 문자열을 모아(`git grep -n "[가-힣]" -- 'financial-workbench/web/src/**/*.tsx' financial-workbench/web/src/lib/guide.ts` 에서 주석을 뺀 것) `korean-check` 의 검사기로 점검한다. 걸린 표현과 어색한 표현(조사 생략, 명사만 이은 문장, 한 화면 안의 높임 섞임)을 고친다.
- 「사슬」 이 단독으로 쓰인 화면 문구가 있으면 문맥에 맞게 고친다(「투자 온톨로지」, 「연결」 등).
- 고친 문구가 단위 테스트나 e2e 에 그대로 적혀 있으면 함께 고친다. e2e 는 문구 대신 testid 와 속성으로 단언하는 쪽으로 바꿀 수 있으면 바꾼다.

### 4. 이름 바꾸기: `financial-workbench/web/e2e/workbench.spec.ts`

`test('1c) 투자 논리 사슬을 만들고 결정에서 변화까지 따라간다'` 를 `test('1c) 투자 온톨로지 항목을 이어 만들고 결정에서 변화까지 따라간다'` 로 바꾼다. 다른 테스트 이름의 「무엇을 만들까요?」 가 Phase 03 뒤에도 남아 있으면 「＋ 추가」 로 바꾼다.

### 5. 이 phase 를 검증하는 테스트: `financial-workbench/web/src/lib/relationSentence.test.ts`

저장소 YAML 을 읽어(`node:fs` 로 `../../ontology/financial-ontology.yaml` 을 읽고 `relationshipTypes` 아래 `label:` 줄을 정규식으로 뽑는다) 모든 관계 표시 이름이 「다」 로 끝나는지 확인하는 테스트를 더한다. YAML 라이브러리를 들이지 않는다(`docs/code-architecture.md` 「웹 구조」). 관계 수나 이름 목록을 테스트에 적지 않는다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.ontology.*'
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/relationSentence.test.ts
cd financial-workbench/web && npm test && npm run build
cd financial-workbench/web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts
! git grep -n "투자 논리 사슬\|무엇을 만들까요" -- financial-workbench
cd financial-workbench && bash scripts/tests/test_scripts.sh
```

- `./gradlew test --rerun --tests 'dev.fos.workbench.ontology.*'` 백그라운드
- `playwright test --list` 는 서버 없이 spec 파일을 읽어 문법과 import 오류만 잡는다. 브라우저 실행은 모든 phase 를 마친 뒤 한 번 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/web/src/lib/guide.ts` | 수정 |
| `financial-workbench/web/src/lib/guide.test.ts` | 수정 |
| `financial-workbench/web/src/components/**/*.tsx` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/lib/relationSentence.test.ts` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
