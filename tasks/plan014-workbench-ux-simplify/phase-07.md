# Phase 07. 온톨로지 관계 문장 틀과 화면 문구 다듬기, 투자 온톨로지 명칭

**Execution profile**: standard

## 목표

저장소 온톨로지의 관계마다 문장 틀(`sentence`)을 적고, 타입 설명의 첫 문장을 「＋ 추가」 메뉴에 맞게 다듬는다. 화면 문구(TSX, `src/lib/guide.ts`)를 `korean-check` 기준으로 점검해 어색한 표현을 고치고, 「투자 논리 사슬」 이 남은 곳을 「투자 온톨로지」 로 바꾼다.

**범위 외**: 운영 온톨로지에 같은 문구를 저장하는 일(배포 뒤 ADMIN 이 한다. `docs/deployment.md` 「저장소 온톨로지의 문구를 운영에 반영할 때」). 화면 구조 변경(앞 phase 에서 끝남).

## 컨텍스트

- 온톨로지는 `financial-workbench/ontology/financial-ontology.yaml` 이다. 관계 종류는 `relationshipTypes`, 타입 설명은 `nodeTypes.<타입>.description` 이다. 이 파일의 편집할 수 있는 부분은 DB 가 비어 있을 때만 첫 버전이 된다([ADR-008](../../financial-workbench/docs/adr/008-ontology-versions-in-db.md)). 테스트와 e2e 는 빈 DB 에서 시작하므로 이 파일의 값을 쓴다.
- 관계 문장 규칙은 `financial-workbench/docs/flow.md` 「관계 문장」, 「조사 고르기」, 문장 틀 규칙은 `financial-workbench/docs/data-schema.md` 「표시 이름」 이다. 문장 틀 필드와 검사, 채우는 함수(`src/lib/relationSentence.ts`)는 Phase 02 가 만들었다.
- 표시 이름과 주장 문장 틀이 있는지는 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` 가 확인한다.
- 화면 문구는 TSX 안에 인라인으로 있고, 첫 접속 가이드 문구는 `src/lib/guide.ts` 다. 문구 규칙은 `korean-check` 스킬의 `references/korean-style.md` 이고 검사기는 같은 스킬의 `scripts/korean-style-check.py` 다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「관계 문장」, 「노드 만들기」, 「첫 접속 가이드」, `financial-workbench/docs/data-schema.md` 의 「표시 이름」, 「투자 온톨로지」, `financial-workbench/docs/deployment.md` 의 「저장소 온톨로지의 문구를 운영에 반영할 때」

## 의도 메모

- 키(`ISSUES`, `CREATES` 등)와 속성 정의, `createPicker` 의 관계는 바꾸지 않는다. 표시 문구만 바꾼다.
- 바꾼 문구는 PR 본문의 「문구 변경 표」 로 옮긴다. 커밋 메시지 본문에 전과 후를 줄마다 적어 두면 PR 을 쓸 때 그대로 옮길 수 있다.
- 새 번역어를 만들지 않는다. 저장소 문서와 코드가 이미 쓰는 표기를 따른다.

## 작업 항목

### 1. `financial-workbench/ontology/financial-ontology.yaml` 의 관계 문장 틀

관계마다 `sentence` 를 더한다. 표시 이름(`label`)과 `createPicker` 는 바꾸지 않는다. 화면은 끝을 합니다체로 바꿔 보인다.

| 관계 | `sentence` | 화면 예 |
| --- | --- | --- |
| `ISSUES` | `{from}이(가) {to}을(를) 발행한다` | SK하이닉스가 SK하이닉스 보통주를 발행합니다 |
| `AUTHORED` | `{from}이(가) {to}을(를) 썼다` | 워런 버핏이 주주서한을 썼습니다 |
| `RELATED_TO` | `{from}은(는) {to}와(과) 관련된다` | 안전마진은 경제적 해자와 관련됩니다 |
| `CREATES` | `{from}이(가) {to}을(를) 만든다` | AI 서버 증가가 HBM 병목을 만듭니다 |
| `HAS_BOTTLENECK` | `{to}은(는) {from}에 있는 병목이다` | HBM 병목은 메모리 반도체에 있는 병목입니다 |
| `BENEFITS` | `{from}이(가) {to}에 이익을 준다` | HBM 병목이 SK하이닉스에 이익을 줍니다 |
| `HAS_VALUATION` | `{to}은(는) {from}의 가치를 평가한다` | FLNC 간이 DCF는 Fluence Energy의 가치를 평가합니다 |
| `HAS_SCENARIO` | `{to}은(는) {from}의 시나리오 가운데 하나다` | FLNC 비관은 FLNC 간이 DCF의 시나리오 가운데 하나입니다 |
| `HAS_DECISION` | `{to}은(는) {from}에 대한 결정이다` | FLNC 첫 매수는 FLNC에 대한 결정입니다 |
| `BASED_ON` | `{to}은(는) {from}을(를) 근거로 한다` | FLNC 첫 매수는 FLNC 간이 DCF를 근거로 합니다 |
| `EVIDENCED_BY` | `{to}이(가) {from}을(를) 뒷받침한다` | 공개 자료가 HBM 병목을 뒷받침합니다 |

YAML 흐름 표기(`{ ... }`) 안에 넣지 않고 블록 표기의 따옴표 문자열로 적는다(`{` 로 시작하는 값은 따옴표가 필요하다. `docs/data-schema.md` 「표시 이름」 아래의 로더 주의).
화면 예의 문장이 실제로 그렇게 보이는지는 Phase 02 의 `relationSentence` 로 확인한다(아래 5).

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

- 사용자에게 보이는 문자열을 Markdown 한 파일로 모아 검사기에 넣는다. 저장소 밖 임시 경로에 두고 커밋하지 않는다.

  ```bash
  # cwd: 저장소 루트
  git grep -h -o -E "[\"'\`>][^\"'\`<{}]*[가-힣][^\"'\`<{}]*" -- 'financial-workbench/web/src/**/*.tsx' financial-workbench/web/src/lib/guide.ts | grep -v "^\s*//" | sed -E 's/^[\"'\`>]//' | sort -u > "$TMPDIR/ui-strings.md"
  bash /Users/nhn/personal/fos-skills/korean-check/scripts/check.sh "$TMPDIR/ui-strings.md"
  ```

  통과 기준은 종료 코드 0(매핑 표 금지어 0건)이다. 경고 줄은 문맥을 보고 고칠지 정한다.
- 검사기 밖의 점검 대상은 아래 세 가지이고, 고친 것만 문구 변경 표에 적는다.
  - 조사가 빠진 문장, 명사만 이은 문장.
  - 한 화면 안에서 합니다체와 한다체가 섞인 곳. 화면 문구는 합니다체로 맞춘다.
  - 「사슬」 이 단독으로 쓰인 곳.
- 「사슬」 이 단독으로 쓰인 화면 문구가 있으면 문맥에 맞게 고친다(「투자 온톨로지」, 「연결」 등).
- 고친 문구가 단위 테스트나 e2e 에 그대로 적혀 있으면 함께 고친다. e2e 는 문구 대신 testid 와 속성으로 단언하는 쪽으로 바꿀 수 있으면 바꾼다.

### 4. 이름 바꾸기: `financial-workbench/web/e2e/workbench.spec.ts`

`test('1c) 투자 논리 사슬을 만들고 결정에서 변화까지 따라간다'` 를 `test('1c) 투자 온톨로지 항목을 이어 만들고 결정에서 변화까지 따라간다'` 로 바꾼다. 다른 테스트 이름의 「무엇을 만들까요?」 가 Phase 04 뒤에도 남아 있으면 「＋ 추가」 로 바꾼다.

### 5. 이 phase 를 검증하는 테스트: `OntologyLabelsTest.kt`, `src/lib/relationSentence.test.ts`

- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` 에 「저장소 온톨로지의 모든 관계 종류는 문장 틀이 있다」 를 더한다. `OntologyLoader.loadDefault()` 의 모든 `relationshipTypes` 에 `sentence` 가 있고 `consistencyErrors` 가 비어 있는지 본다. 관계 수나 키 목록을 테스트에 적지 않는다.
- `relationSentence.test.ts` 에 위 표의 `HAS_DECISION` 과 `EVIDENCED_BY` 두 줄을 테스트 온톨로지 조각으로 옮겨 화면 예와 같은 문장이 나오는지 더한다(조사, 자리 순서, 합니다체를 함께 확인한다).

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

- 화면 문구 검사기(작업 항목 3 의 두 명령)도 커밋 전에 돌리고 종료 코드 0 을 확인한다.

- 서버 테스트는 백그라운드로 돌린다.
- `playwright test --list` 는 서버 없이 spec 파일을 읽어 문법과 import 오류만 잡는다. 브라우저 실행은 모든 phase 를 마친 뒤 한 번 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/web/src/lib/guide.ts` | 수정 |
| `financial-workbench/web/src/lib/guide.test.ts` | 수정 |
| `financial-workbench/web/src/components/**/*.tsx` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/lib/relationSentence.test.ts` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
