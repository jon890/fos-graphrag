# Phase 02. 관계 문장 틀과 조사 고르기

**Execution profile**: deep

## 목표

관계 종류에 선택 필드 `sentence`(`{from}`, `{to}` 를 담는 문장 틀)를 더하고, 서버 검증기와 편집기가 이 필드를 다루게 한다. 웹에 조사 고르기 함수와 관계 문장 함수를 만든다. 뒤 phase 의 개념 지도와 상세가 이 함수로 문장을 보인다.

**범위 외**: 저장소 YAML 에 관계마다 문장 틀을 적는 일(Phase 07). 지도와 상세 화면(Phase 03, Phase 06).

## 컨텍스트

- 서버의 관계 정의는 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` 의 `data class RelationshipTypeDef(label, description, from, to, createPicker)` 다. 같은 파일의 `ClaimPredicateDef.sentence` 가 비슷한 필드다. 로더(`OntologyLoader.kt`)는 `FAIL_ON_UNKNOWN_PROPERTIES` 로 모르는 키를 거절하고, `consistencyErrors(o)` 가 저장 전과 시작할 때 일관성을 본다. 편집 미리보기의 바뀐 점은 `OntologyDiff.kt` 가 관계 정의를 트리로 비교하므로 새 필드도 따라온다.
- 서버 테스트는 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt`(`consistencyErrors` 단언이 있다)와 `OntologyEditIntegrationTest.kt`(미리보기와 저장)다.
- 웹 계약 타입은 `financial-workbench/web/src/api/types.ts` 의 `RelationshipTypeDef` 다. 편집 초안 함수는 `src/lib/ontologyDraft.ts`(`NewRelationshipType`, `RelationshipTypePatch`, `addRelationshipType`, `updateRelationshipType`, 주장 문장 틀 검사 `sentenceError`)이고, 폼 편집기의 관계 구역은 `src/components/ontology/form/RelationshipSection.tsx`, 주장 종류 구역은 같은 폴더의 `PredicateSection.tsx`(문장 틀 입력의 본보기)다. YAML 편집기의 키 설명은 `src/components/ontology/OntologyYamlEditor.tsx`, 지금 버전 보기의 관계 표는 `src/components/ontology/OntologyView.tsx` 다.
- 조사는 `src/lib/labels.ts` 의 `JOSA` 상수와 `withJosa(word, josa)`, `withEulReul` 이다. 지금은 한글이 아니면 표기를 그대로 붙인다. 주장 문장 틀은 같은 파일의 `claimSentenceParts(o, predicate, names)` 가 `withJosa` 로 채운다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「관계 문장」, 「조사 고르기」, 「폼 편집기」, `financial-workbench/docs/data-schema.md` 의 「표시 이름」, `financial-workbench/docs/api-contract.md` 의 「온톨로지」, `financial-workbench/docs/adr/010-concept-map-first-screen.md`

## 의도 메모

- 관계 표시 이름(`label`)은 선 글자와 칩에 쓰는 짧은 이름으로 둔다. 동사구로 바꾸지 않는다. 문장은 `sentence` 가 맡는다(코디네이터 결정 2026-10-25).
- 화면에 「이(가)」 처럼 두 꼴을 보이지 않는다. 영문과 숫자로 끝나는 이름도 읽는 소리 규칙으로 하나를 고른다.
- 서버 검증은 `{from}` 과 `{to}` 가 한 번씩 있는지만 본다. 문장의 자연스러움은 사람이 본다.
- 합니다체 바꾸기는 문장 끝 「다」 만 바꾼다. 형용사로 끝나는 틀(「크다」)은 「크입니다」 가 되므로 틀을 동사나 「…이다」 로 적는다. 이 제약은 `docs/flow.md` 「관계 문장」 의 규칙에 있다.

## 작업 항목

### 1. 서버: `Ontology.kt`, `OntologyLoader.kt`

- `RelationshipTypeDef` 에 `/** 관계 문장 틀. {from}, {to} 를 한 번씩 담는다 */ val sentence: String? = null` 을 `createPicker` 앞에 더한다. 필드에만 `@field:JsonInclude(JsonInclude.Include.NON_NULL)` 을 붙여 YAML 내보내기에서 `null` 이 빠지게 한다. 클래스 전체에 붙이지 않는다(DB 에 저장하는 YAML 의 `label`, `createPicker` 직렬화가 바뀐다). `ClaimPredicateDef` 에는 이 설정이 없으므로 본보기로 삼지 않는다. `toYaml` 결과에 `sentence: null` 이 생기지 않는지 테스트로 본다.
- `consistencyErrors` 에 관계마다 `sentence` 가 있으면 `{from}` 과 `{to}` 가 정확히 한 번씩 있는지 본다. 어기면 `"$name 의 sentence 는 {from} 과 {to} 를 한 번씩 담아야 한다"`.

### 2. 서버 테스트: `OntologyLabelsTest.kt`, `OntologyEditIntegrationTest.kt`

- `OntologyLabelsTest`: `{to}` 가 빠진 문장 틀의 관계를 넣은 온톨로지에서 `consistencyErrors` 가 위 문장을 내는지, 문장 틀이 없는 관계는 통과하는지.
- `OntologyEditIntegrationTest`: ADMIN 이 관계 하나에 `sentence` 를 더해 미리보기하면 바뀐 점(`changed`)에 `relationshipTypes.<관계>.sentence` 가 나오고, 저장한 뒤 `GET /api/ontology` 응답의 그 관계에 `sentence` 가 있는지. `{from}` 이 빠진 틀은 미리보기가 `valid: false` 와 오류 문장을 돌려주는지.

### 3. 웹 조사: `src/lib/labels.ts`, `src/lib/labels.test.ts`

- `JOSA` 에 `'으로(로)': ['으로', '로']` 를 더하고, `LEADING_JOSA` 정규식에도 `으로\(로\)` 를 더한다(빠지면 문장 틀의 `으로(로)` 자리가 바뀌지 않는다). 긴 표기(`으로(로)`)가 짧은 표기보다 먼저 맞도록 순서를 둔다.
- `export function finalSound(word: string): 'none' | 'rieul' | 'other' | null` 를 더한다. 끝의 공백, 괄호(`()[]{}「」『』`), 따옴표, 마침표, 쉼표를 건너뛴 마지막 글자로 정한다. 한글은 종성 없음이 `none`, ㄹ(종성 번호 8)이 `rieul`, 나머지 `other`. 영문자는 L, R 이 `rieul`, M, N 이 `other`, 나머지 `none`(대소문자 무시). 숫자는 1, 7, 8 이 `rieul`, 0, 3, 6 이 `other`, 나머지 `none`. 그 밖의 글자나 빈 문자열은 `null`.
- `withJosa` 는 `finalSound` 로 고른다. `으로(로)` 는 `none` 과 `rieul` 이 「로」, `other` 가 「으로」. 나머지 조사는 `none` 이 받침 없는 꼴, 그 밖이 받침 있는 꼴. `null` 이면 지금처럼 표기를 그대로 붙인다.
- 테스트 기대값:
  - 한글: 「병목이」, 「기업이」, ㄹ 받침과 으로/로는 「서울로」, 「산업으로」, 「기업으로」.
  - 영문: 「FLNC가」, 「HBM을」, 「DRAM이」, 「POET가」, 「SK하이닉스 (KR)을」.
  - 숫자: 「A1로」, 「버전 3을」, 「버전 2를」, 「버전 0으로」.
  - 끝의 괄호와 따옴표는 건너뛴다. 빈 문자열과 기호로 끝나는 이름은 표기를 그대로 붙인다.
- 주장 문장 틀(`claimSentenceParts`)은 이 `withJosa` 를 그대로 쓰므로 따로 고치지 않는다.
- 기존 `labels.test.ts` 의 기대값을 새 규칙으로 고친다: `withEulReul('ETF')` 는 `ETF를`(F 는 받침 없음), `withJosa('ABC', '이(가)')` 는 `ABC가`. 「한글이 아니면 적힌 그대로」 라는 테스트 이름도 「기호로 끝나면 적힌 그대로」 로 바꾸고 기호 끝 예(`'A-'`)를 넣는다. 주장 문장 단언이 영문 이름을 쓰면 같이 고친다.

### 4. 웹 관계 문장: `src/lib/relationSentence.ts`, `src/lib/relationSentence.test.ts` (신규)

```ts
export type RelationSentencePart = { kind: 'slot'; slot: 'from' | 'to'; text: string } | { kind: 'text'; text: string }
/** 한다체 문장 끝을 합니다체로. 규칙은 docs/flow.md 「관계 문장」 */
export function politeEnding(sentence: string): string
/** 문장 틀(없으면 「{from}이(가) {to}을(를) {label}」)을 두 이름으로 채운다. 자리 뒤의 조사는 그 이름으로 고르고, 끝은 합니다체다 */
export function relationSentenceParts(o: Ontology, relationship: string, from: string, to: string): RelationSentencePart[]
export function relationSentence(o: Ontology, relationship: string, from: string, to: string): string
/** 개념 지도 타입 칸의 문장. type 이 from 이나 to 인 관계의 (from 타입, to 타입) 조합마다 하나, 이름은 타입 표시 이름 */
export function typeRelationSentences(o: Ontology, type: string): { key: string; relationship: string; fromType: string; toType: string; text: string }[]
```

- 자리 뒤 조사는 `claimSentenceParts` 와 같은 방식(`LEADING_JOSA` 로 자리 바로 뒤의 조사 표기를 찾는다)으로 고른다. 같은 정규식을 두 번 적지 말고 `labels.ts` 에서 내보내 함께 쓴다.
- `politeEnding`: 「이다」 → 「입니다」, 「는다」 → 「습니다」, 「다」 앞 글자 종성이 ㄴ 이면 ㅂ 으로 바꾸고 「니다」, 다른 종성이면 「습니다」, 종성이 없으면 「다」 를 「입니다」 로. 끝에 마침표가 있으면 떼고 바꾼 뒤 붙이지 않는다. 「다」 로 끝나지 않으면 그대로.
- `typeRelationSentences` 의 `key` 는 `${relationship}:${fromType}:${toType}` 이다. 시작과 끝이 같은 타입이면 한 번만 나온다.
- 테스트: `politeEnding` 은 「발행한다→발행합니다」, 「겪는다→겪습니다」, 「썼다→썼습니다」, 「결정이다→결정입니다」, 「시나리오다→시나리오입니다」, 「관련된다→관련됩니다」, 「다」 로 끝나지 않는 문장은 그대로. `relationSentenceParts` 는 틀이 있을 때 `{to}` 가 먼저 나오는 틀의 자리 순서와 조사, 틀이 없을 때 기본 문장, 영문 이름의 조사. `typeRelationSentences` 는 테스트 온톨로지 조각에서 들어오는 관계와 나가는 관계가 모두 나오고 자기 자신을 잇는 관계가 한 번만 나오는지.

### 5. 웹 편집기: `src/api/types.ts`, `src/lib/ontologyDraft.ts`, `src/lib/ontologyDraft.test.ts`, `src/components/ontology/form/RelationshipSection.tsx`, `src/components/ontology/OntologyYamlEditor.tsx`, `src/components/ontology/OntologyView.tsx`

- `RelationshipTypeDef` 에 `/** 관계 문장 틀. {from}, {to} 자리에 두 항목 이름이 들어간다 */ sentence?: string | null`.
- `ontologyDraft.ts`: `NewRelationshipType` 에 `sentence?: string`, `RelationshipTypePatch` 의 `Pick` 에 `'sentence'`. `export function relationSentenceError(sentence: string): string | null` 은 `{from}` 과 `{to}` 가 한 번씩이 아니면 「문장 틀에 {from} 과 {to} 를 한 번씩 넣습니다」.
- 폼 편집기 관계 구역: 고치기 줄과 더하기 줄에 「문장 틀(예: {from}이(가) {to}을(를) 발행한다)」 입력을 더한다(`PredicateSection.tsx` 의 문장 틀 입력과 같은 모양). 비우면 필드를 뺀다(`undefined`). 오류는 `FieldError` 로 입력 아래에 보인다. 더하기 단추는 문장 틀이 비었거나 맞을 때만 켜진다(선택 필드).
- YAML 편집기 키 설명에 `sentence` 를 더한다: 주장 종류에서는 지금 설명, 관계 종류에서는 「{from}, {to} 를 한 번씩 담는 한다체 문장. 화면이 끝을 합니다체로 바꾸고 조사를 이름에 맞춰 고른다. 없으면 「{from}이(가) {to}을(를) 표시 이름」 으로 보인다」.
- 지금 버전 보기의 관계 표에 「문장 틀」 열을 더한다. 없으면 「-」.
- `ontology.test.tsx`: 관계 구역을 그려 문장 틀 입력이 있고, 지금 버전 보기의 관계 표에 「문장 틀」 열이 있는지.
- `ontologyDraft.test.ts`: `relationSentenceError` 의 정상, 자리 하나 빠짐, 같은 자리 두 번. `updateRelationshipType(def, key, { sentence: undefined })` 가 필드를 지우는지.

### 6. e2e: `e2e/workbench.spec.ts`

테스트 9b(폼으로 인물에 속성을 더하는 테스트, 지금 1184행 부근)에 단계를 더한다. 관계 종류 하나의 문장 틀 입력에 `{from} 테스트` 처럼 `{to}` 가 빠진 값을 넣으면 입력 아래 오류가 보이는지, 「저장 전에 확인」(`ontology-preview`)을 누르면 미리보기가 `valid: false` 의 오류 목록을 보이는지 단언한다. 「저장 전에 확인」 단추는 칸 오류로 꺼지지 않으므로 꺼짐을 단언하지 않는다. 저장하지 않고, 9c 처럼 「초안 버리기」 로 초안을 지워 끝낸다(남은 초안의 `beforeunload` 경고가 뒤 테스트의 이동을 막는다).

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.ontology.*'
cd financial-workbench/api && ./gradlew test --rerun
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/labels.test.ts src/lib/relationSentence.test.ts src/lib/ontologyDraft.test.ts src/components/ontology/ontology.test.tsx
cd financial-workbench/web && npm test && npm run build
cd financial-workbench/web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts
```

- 서버 전체 테스트는 오래 걸리므로 백그라운드로 돌린다.
- `playwright test --list` 는 서버 없이 spec 파일을 읽어 문법과 import 오류만 잡는다. 브라우저 실행은 모든 phase 를 마친 뒤 한 번 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyEditIntegrationTest.kt` | 수정 |
| `financial-workbench/web/src/lib/labels.ts` | 수정 |
| `financial-workbench/web/src/lib/labels.test.ts` | 수정 |
| `financial-workbench/web/src/lib/relationSentence.ts` | 신규 |
| `financial-workbench/web/src/lib/relationSentence.test.ts` | 신규 |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/lib/ontologyDraft.ts` | 수정 |
| `financial-workbench/web/src/lib/ontologyDraft.test.ts` | 수정 |
| `financial-workbench/web/src/components/ontology/form/RelationshipSection.tsx` | 수정 |
| `financial-workbench/web/src/components/ontology/OntologyYamlEditor.tsx` | 수정 |
| `financial-workbench/web/src/components/ontology/OntologyView.tsx` | 수정 |
| `financial-workbench/web/src/components/ontology/ontology.test.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
