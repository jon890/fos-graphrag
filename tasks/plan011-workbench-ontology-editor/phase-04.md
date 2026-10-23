# Phase 04. 화면의 폼 편집기

**Execution profile**: standard

## 목표

ADMIN 이 YAML 을 몰라도 노드 타입, 속성, 관계 종류, 주장 종류를 더하고, 표시 이름과 설명을 고치고, 빼기를 표시하는 폼 편집기를 만든다.
폼과 YAML 편집기는 초안 하나를 함께 쓰고, 저장은 phase 03 의 미리보기 패널을 그대로 거친다.

**범위 외**: 서버는 고치지 않는다(`financial-workbench/api/`). YAML 편집기, 미리보기 패널, 버전 기록, 버전 바뀜 안내는 phase 03 이 만들었다. `hintProperties`, `searchProperties`, `valueAliases`, `createPicker`, 기존 타입의 `labelProperty` 는 폼에서 고치지 않는다(YAML 편집기에서 고친다).

## 컨텍스트

- phase 03 이 만든 것(`financial-workbench/web/src/`):
  - `components/ontology/OntologyTab.tsx` 가 주소의 `view`(`yaml`, `history`)로 화면을 고른다. 머리의 ADMIN 단추는 `ontology-edit-yaml`, `ontology-history-open`, `ontology-export` 다.
  - `components/ontology/OntologyYamlEditor.tsx`, `components/ontology/OntologyPreviewPanel.tsx`(저장, 409 처리, 저장 뒤 `reloadOntology()` 와 `/ontology` 이동).
  - 초안 `OntologyDraft = { baseVersion, yaml, dirty }` 를 `App.tsx` 가 들고 `OntologyTab` 에 넘긴다. `dirty` 면 `beforeunload` 를 건다.
  - `routes.ts` 의 `OntologyQuery = { view?: 'yaml' | 'history'; version?: number }`, `parseOntologyQuery`, `ontologySearch`.
  - `api/client.ts` 의 `api.ontology.preview(body)` 가 `OntologyPreview`(`valid`, `errors`, `added`, `removed`, `changed`, `impacts`, `codeOwnedIgnored`, `yaml`, `definition`)를 돌려준다. 본문은 `{ baseVersion, yaml }` 이나 `{ baseVersion, definition }` 이다.
- `Ontology` 타입(`api/types.ts`)의 `nodeTypes.<타입>` 은 `label`, `description`, `labelProperty`, `managedBy`, `properties`, `hintProperties`, `searchProperties`, `display`(`color`, `shape`)이고, 속성(`PropertyDef`)은 `type`, `label`, `required`, `maxLength`, `values`, `valueLabels`, `valueAliases`, `min`, `max`, `description` 이다. 값 타입은 `string, text, url, enum, date, datetime, number, integer, boolean` 이다. 모양은 서버의 `NodeDisplayDef.SHAPES`(`ellipse`, `round-rectangle`, `hexagon`, `round-diamond`, `round-tag`, `round-pentagon`)다. 관계 종류는 `label`, `description`, `from`, `to`, `createPicker`, 주장 종류는 `label`, `description`, `subjectTypes`, `objectTypes`, `sentence` 다.
- 코드가 소유하는 부분(`reviewStatuses`, `changeActions`, `changeFields`, `claimRelationships`, `managedBy` 가 있는 Claim 타입)과 코드가 이름으로 읽는 키(`Document` 의 `title`, `url`, `publisher`, `documentType`, `publishedAt`, `collectedAt`, `Security` 의 `market`, `ticker`)는 서버가 다시 검사한다(`data-schema.md`).
- 화면 부품은 `web/src/components/ui/` 의 shadcn 부품이다. 선택 칸은 `NativeSelect` 다. 좁은 화면 규칙은 `flow.md` 「좁은 화면의 작업 공간」 의 마지막 두 목록(표는 가로로 밀어서 보고 페이지 전체에는 가로 스크롤이 없다)이다.
- 휴대폰 폭 브라우저 테스트는 `web/e2e/mobile.spec.ts` 다. `expectNoHorizontalOverflow(page)` 가 문서와 `.app-main` 의 가로 넘침을 본다. `loginAs(page, admin)` 로 ADMIN 이 로그인한다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「온톨로지 편집」(초안, 폼 편집기 표와 그 아래 목록), 「주소와 뒤로가기」 의 `/ontology` 행, `financial-workbench/docs/data-schema.md` 의 「온톨로지 버전」(코드가 소유하는 부분, 코드가 이름으로 읽는 키, 키 규칙), `financial-workbench/docs/api-contract.md` 의 `OntologyPreview`

## 의도 메모

- 폼은 정의 JSON(`definition`)을 고친다. YAML 과 오갈 때는 미리보기 API 의 `yaml`, `definition` 으로 바꾼다. 웹에 YAML 라이브러리를 들이지 않는다.
- 빼기는 그 자리에서 지우지 않고 「뺄 예정」 으로 표시한다. 미리보기에 넣어야 영향이 보이기 때문이다. 미리보기와 YAML 로 옮길 때만 뺀 정의를 만든다.
- 웹이 검사하는 키 형식과 코드가 읽는 키는 입력 도움일 뿐이다. 서버가 다시 검사한다. 웹의 목록이 서버와 어긋나도 저장은 서버 판단을 따른다.

## 작업 항목

### 1. 초안 모델과 순수 함수

- `App.tsx` 의 `OntologyDraft` 를 `{ baseVersion: number; source: 'yaml' | 'form'; yaml: string | null; definition: OntologyDefinition | null; removed: string[]; dirty: boolean }` 로 넓힌다. `OntologyDefinition` 은 `api/types.ts` 에 두고 `Ontology` 에서 `version`, `versionCreatedAt`, `versionCreatedBy` 를 뺀 모양이다. YAML 편집기는 `source: 'yaml'` 로 쓴다.
- 새 파일 `web/src/lib/ontologyDraft.ts`(순수 함수, 입력을 바꾸지 않고 새 값을 돌려준다):
  - `addNodeType(def, key, { label, description, labelProperty, labelPropertyLabel, color, shape })`: 라벨 속성 하나(`string`, 필수, `maxLength: 200`)를 함께 만든다.
  - `updateNodeType(def, key, patch)`: `label`, `description`, `display` 만 바꾼다.
  - `addProperty(def, type, key, prop)`, `updateProperty(def, type, key, patch)`: patch 는 `label`, `description`, `required`, `maxLength`, `min`, `max`, `values`, `valueLabels` 다. enum 값을 뺄 때는 그 값의 `valueLabels` 와 `valueAliases` 도 지운다.
  - `addRelationshipType(def, key, { label, description, from, to })`, `updateRelationshipType(def, key, patch)`.
  - `addClaimPredicate(def, key, { label, sentence, description, subjectTypes, objectTypes })`, `updateClaimPredicate(def, key, patch)`.
  - `toggleRemoved(removed, path)`, `applyRemoved(def, removed)`: 경로는 `nodeTypes.X`, `nodeTypes.X.properties.p`, `relationshipTypes.X`, `claimPredicates.X` 다. `applyRemoved` 는 빠진 타입을 가리키는 관계 종류의 `from`, `to` 와 주장 종류의 타입 목록에서 그 타입을 함께 뺀다. 빠진 속성은 그 타입의 `hintProperties`, `searchProperties` 에서도 뺀다. 두 목록은 폼에서 고칠 수 없어, 남기면 미리보기가 「속성에 없는 이름을 가리킨다」 로 실패한다.
  - `keyError(kind: 'nodeType' | 'property' | 'relationshipType' | 'claimPredicate', key, existing: string[])`: 형식은 노드 타입 `^[A-Z][A-Za-z0-9]*$`, 관계 종류와 주장 종류 `^[A-Z][A-Z0-9_]*$`, 속성 `^[a-z][A-Za-z0-9]*$` 다. 이미 있는 키, 시스템 속성 이름(`id`, `type`, `revision`, `archived`, `archivedAt`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `searchText`, `reviewStatus`, `reviewedBy`, `reviewedAt`, `reviewNote`, `contentUpdatedBy`, 그리고 `_` 로 시작하는 이름)도 오류다. 문장은 서버(phase 02)와 같은 뜻으로 쓴다.
  - `sentenceError(sentence)`: `{subject}` 와 `{object}` 가 한 번씩 없으면 「문장 틀에 {subject} 와 {object} 를 한 번씩 넣습니다」.
  - `CODE_READ_KEYS: Record<string, string[]>`: 위 컨텍스트의 목록. 주석에 「서버의 `CodeReadKeys` 와 같게 둔다. 서버가 다시 검사한다」 를 적는다.

### 2. 폼 편집기

새 파일 `web/src/components/ontology/OntologyFormEditor.tsx`(testid `ontology-form`)

- 처음 열 때 초안이 없으면 지금 `ontology` 에서 `OntologyDefinition` 을 만든다(`source: 'form'`, `baseVersion: ontology.version`). 초안이 `source: 'yaml'` 이면 `api.ontology.preview({ baseVersion, yaml })` 를 불러 `definition` 으로 바꾼다. `definition` 이 `null` 이면 폼을 열지 않고 「YAML 에 오류가 있어 폼으로 옮기지 못했습니다」 와 `errors` 를 보이며 「YAML 로 돌아가기」 단추를 둔다.
- 「노드 타입」, 「관계 종류」, 「주장 종류」 세 구역이다. Claim(`managedBy` 가 있는 타입)과 코드 소유 항목은 나오지 않는다.
- 노드 타입 카드(`ontology-form-type`, `data-type`): 키는 글자로, 표시 이름(`ontology-form-type-label`), 설명, 색(`<Input type="color">`), 모양(`NativeSelect`)을 고친다. 속성 표(`ontology-form-prop`, `data-prop`)는 키, 값 타입(기존 속성은 글자), 필수(확인란), 표시 이름, 설명, 길이와 범위, enum 값과 그 표시 이름을 고친다. 라벨 속성과 `CODE_READ_KEYS` 의 속성은 필수 확인란과 「빼기」 가 꺼져 있고 이유를 `title` 로 보인다. `CODE_READ_KEYS` 의 타입은 타입 「빼기」 가 꺼져 있다.
- 「속성 더하기」(`ontology-form-prop-add`), 「노드 타입 더하기」(`ontology-form-type-add`), 「관계 종류 더하기」(`ontology-form-rel-add`), 「주장 종류 더하기」(`ontology-form-predicate-add`)는 키 입력칸과 필요한 칸을 연다. 키 오류(`keyError`)와 문장 틀 오류는 입력칸 아래에 바로 보이고, 오류가 있으면 「더하기」 가 눌리지 않는다.
- 관계 종류 행(`ontology-form-rel`, `data-rel`)과 주장 종류 행(`ontology-form-predicate`, `data-predicate`)은 표시 이름, 설명, 문장 틀, 시작과 끝(주체와 대상) 타입 확인란 목록을 고친다. 타입 확인란 목록에는 Claim 이 없다.
- 노드 타입 하나에서 시작과 끝 목록이 모두 비게 되는 관계 종류, 주체나 대상 목록이 비게 되는 주장 종류가 생기면 그 행에 「이 종류도 함께 빼야 합니다」 를 보인다. 미리보기가 일관성 오류로 알려 주므로 막지는 않는다.
- 「빼기」(`ontology-form-remove`)를 누르면 그 행이 흐려지고 「뺄 예정」 배지와 「되살리기」(`ontology-form-restore`)가 보인다.
- 아래에 「YAML 로 보기」(`ontology-form-to-yaml`)와 「저장 전에 확인」(`ontology-preview`)이 있다. 둘 다 `applyRemoved(definition, removed)` 를 미리보기로 보낸다. 「YAML 로 보기」 는 응답의 `yaml` 로 초안을 `source: 'yaml'` 로 바꾸고 `view=yaml` 로 `push` 한다. 「저장 전에 확인」 은 phase 03 의 미리보기 패널을 같은 방식으로 연다.
- 폼에서 무엇이든 바꾸면 `dirty: true` 다.

### 3. 탭과 주소

- `routes.ts` 의 `OntologyQuery.view` 에 `'form'` 을 더한다.
- `OntologyTab.tsx` 의 ADMIN 단추에 「폼으로 편집」(`ontology-edit-form`)을 「YAML 로 편집」 앞에 더하고, `view=form` 이면 폼 편집기를 그린다.
- YAML 편집기에 「폼으로 보기」(`ontology-yaml-to-form`)를 더한다. 누르면 `view=form` 으로 `push` 하고, 폼 편집기가 위 규칙대로 바꾼다.
- YAML 편집기도 폼 편집기와 대칭으로 둔다. 초안이 `source: 'form'` 이면(머리의 「YAML 로 편집」 을 누르거나 뒤로가기, 앞으로가기로 `view=yaml` 에 왔을 때) `api.ontology.preview({ baseVersion, definition: applyRemoved(definition, removed) })` 의 `yaml` 로 초안을 `source: 'yaml'` 로 바꾼다. 응답의 `yaml` 이 `null` 이면 오류와 「폼으로 돌아가기」 를 보이고 초안은 그대로 둔다. 초안을 버전 YAML 로 새로 만들지 않는다.

### 4. 문서

- `web/TESTIDS.md` 의 온톨로지 절에 이 phase 의 testid 를 모두 적는다.

### 5. 이 phase 를 검증하는 테스트

- 새 파일 `web/src/lib/ontologyDraft.test.ts`
  - `addNodeType` 이 라벨 속성을 필수 string 으로 만들고 입력 정의를 바꾸지 않는다.
  - `updateProperty` 로 enum 값 하나를 빼면 그 값의 `valueLabels` 도 빠진다.
  - `applyRemoved` 로 `nodeTypes.Concept` 을 빼면 `relationshipTypes.RELATED_TO.from` 과 `claimPredicates.ADVOCATES.objectTypes` 에서도 빠진다. `nodeTypes.Company.properties.country` 를 빼면 Company 의 `hintProperties` 에서도 빠지고, `nodeTypes.Person.properties.englishName` 을 빼면 Person 의 `searchProperties` 에서도 빠진다. `toggleRemoved` 를 두 번 부르면 목록이 처음과 같다.
  - `keyError('nodeType', 'fund')`, `keyError('property', 'Name')`, `keyError('property', 'revision')`, `keyError('property', '_x')`, `keyError('relationshipType', 'ISSUES', ['ISSUES'])` 는 오류이고 `keyError('nodeType', 'Fund', [])` 는 `null` 이다.
  - `sentenceError('{subject}이(가) 강조한다')` 는 오류다.
- `web/src/components/ontology/ontology.test.tsx` 에 더한다: ADMIN 탭에 `ontology-edit-form` 이 있다. 저장소 온톨로지로 그린 폼 편집기에 `data-type="Company"` 카드가 있고 Claim 카드가 없으며, `Document` 의 `url` 행의 빼기 단추가 `disabled` 다.
- `web/src/routes.test.ts` 에 `parseOntologyQuery('?view=form')` 가 `{ view: 'form' }` 임을 더한다.
- `web/e2e/workbench.spec.ts` 의 `9)` 뒤에 `9b) 관리자가 폼으로 인물에 속성을 더하면 편집자의 고치기 폼에 그 칸이 나오고, 되돌린다` 를 더한다. `pageAdmin` 이 `/ontology` 에서 `ontology-version` 의 번호를 저장 전 번호로 읽어 둔다 → `ontology-edit-form` → `data-type="Person"` 카드의 `ontology-form-prop-add` 로 `nickname${suffix}`(`suffix` 는 숫자뿐이라 형식에 맞는다. string, 표시 이름 「별명」)를 더한다 → `ontology-preview` → `ontology-diff-added` 에 그 경로 → `ontology-save` → success. `pageA` 가 검색을 한 번 해 `ontology-stale` 이 보이면 `ontology-reload` 를 누르고, 그 뒤 인물 노드(시작 때 들어간 인물 가운데 하나)의 상세 고치기 폼에 「별명」 칸이 있다. 끝에 `9)` 처럼 버전 기록에서 읽어 둔 저장 전 번호로 되돌린다. `shot(pageAdmin, '09b-ontology-form')`.
- `web/e2e/mobile.spec.ts` 에 `휴대폰 폭에서 온톨로지 폼 편집기가 가로 스크롤 없이 열린다` 를 더한다. `loginAs(page, admin)` → `tab-ontology` → `ontology-edit-form` → `ontology-form` 이 보이고 `expectNoHorizontalOverflow(page)` 다. 저장하지 않는다. `shot(page, 'm-ontology-form')`.

## 검증

```bash
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
git grep -q "ontology-edit-form" -- financial-workbench/web/TESTIDS.md
```

- 각 줄은 저장소 루트에서 돈다.
- 브라우저 테스트(`npm run test:e2e`)는 Compose 스택이 있어야 돌아 이 절에 두지 않는다. 코디네이터가 PR 검증 때 돌린다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/routes.ts` | 수정 |
| `financial-workbench/web/src/routes.test.ts` | 수정 |
| `financial-workbench/web/src/lib/ontologyDraft.ts` | 신규 |
| `financial-workbench/web/src/lib/ontologyDraft.test.ts` | 신규 |
| `financial-workbench/web/src/components/ontology/OntologyFormEditor.tsx` | 신규 |
| `financial-workbench/web/src/components/ontology/OntologyTab.tsx` | 수정 |
| `financial-workbench/web/src/components/ontology/OntologyYamlEditor.tsx` | 수정 |
| `financial-workbench/web/src/components/ontology/OntologyPreviewPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/ontology/ontology.test.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
