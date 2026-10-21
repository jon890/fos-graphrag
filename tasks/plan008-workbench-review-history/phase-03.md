# Phase 03. 변경 이력의 이름 표시와 대상, 사용자 고르기

**Execution profile**: standard

## 목표

변경 이력 탭의 칸 이름과 값을 화면에 보일 말로 바꾸고, 노드 ID 를 이름으로 보인다.
대상은 이름으로 검색해 고르고, 사용자는 이력에 나온 사람 가운데 표시 이름으로 고르게 한다. 수정 번호(revision) 열을 뺀다.

**범위 외**: 검토 대기와 링크는 phase 02 에서 끝났다. 서버는 phase 01 에서 끝났다. 이 phase 는 `financial-workbench/api/` 를 고치지 않는다.

## 컨텍스트

- 서버 계약(phase 01 결과): `ChangeEventView` 에 `refs: Record<id, { id, type, label, archived }>` 가 있다. `GET /api/changes/actors` 는 `UserRef[]`(`id`, `email`, `displayName`)를 표시 이름 순서로 준다. `/api/ontology` 에 `changeFields: Record<키, { label }>` 가 있다. 뜻은 `financial-workbench/docs/api-contract.md` 「변경 이력」 과 `financial-workbench/docs/data-schema.md` 표시 이름 표다.
- 이력 탭은 `financial-workbench/web/src/components/ChangesTab.tsx` 다.
  - `changeLine(ontology, targetType, key, diff)` 가 enum 이면 `enumValueLabel`, 아니면 `summarizeValue` 로 「전 → 후」 를 만든다. 속성이 아닌 키는 `propertyLabel` 이 키를 그대로 돌려줘 `font-mono` 로 보인다.
  - `ChangeRows({ items, onOpen })` 가 행을 그리고, 열은 시각, 사용자, 작업, 대상 종류, 대상 이름, 수정 번호, 변경 내용, 메모 여덟 개다. 빈 목록 칸은 `colSpan={8}` 이다.
  - `ChangesTab({ targetId, onTargetIdChange, onOpen })` 의 좁혀 보기 폼은 대상 ID 입력(`changes-target-filter`), 사용자 이메일 입력(`changes-actor-filter`), 「조회」(`changes-filter-submit`), 「대상 필터 해제」(`changes-filter-clear`)다. 목록은 `api.changes.list({ targetId, actor, page, size: 20 })` 다. `actor` 는 이메일이다.
- `financial-workbench/web/src/lib/format.ts` 의 `summarizeValue(value)` 는 `null` 을 「없음」, 문자열은 40자, 나머지는 `JSON.stringify` 40자로 보인다. 그래서 `true`, `false` 와 ID 목록이 원문으로 나온다.
- 역할 이름은 `financial-workbench/web/src/context.ts` 의 `ROLE_LABEL`(`VIEWER: 열람자`, `EDITOR: 편집자`, `ADMIN: 관리자`)이다. 검토 상태 이름은 `useLabels().status(s)` 다.
- 노드 고르기는 `financial-workbench/web/src/components/NodePicker.tsx` 다. `types` 가 비면 모든 타입을 찾는다. 후보는 `${testIdPrefix}-result` 다.
- 상세의 「이 항목의 변경 이력」 은 `App.tsx` 의 `openHistory(id)` 가 `changesTargetId` 를 채우고 이력 탭으로 간다. 그 노드의 이름은 `api.nodes.get(id)` 의 `node` 로 읽을 수 있다.
- 테스트: `financial-workbench/web/src/components/ChangesTab.test.tsx` 가 `ChangeRows` 를 정적으로 그려 시스템 작업자, 이메일 툴팁, 표시 이름을 본다. 그 fixture 의 `ChangeEventView` 에 `refs` 가 없으면 채워야 컴파일된다. `financial-workbench/web/src/components/tabs.test.tsx` 의 「ChangesTab 은 대상 필터를 input 으로 그리고…」 가 `changes-target-filter` input 을 찾는다. 테스트 온톨로지는 `testSupport.tsx` 의 `testOntology` 다.
- 브라우저 테스트 `financial-workbench/web/e2e/workbench.spec.ts` 의 `0c)` 는 필터 없이 이력 탭을 열고 「시작 설정으로 만든 첫 관리자」 행을 찾는다. `6)` 은 상세의 `node-history-link` 로 이력 탭을 열어 `ARCHIVE`, `RESTORE` 행을 하나씩 센다.
- `financial-workbench/web/TESTIDS.md` 의 「변경 이력 탭」 절에 testid 가 있다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「변경 이력 보기」 절, `financial-workbench/docs/api-contract.md` 「변경 이력」, `financial-workbench/docs/data-schema.md` 의 `changeFields` 행, `financial-workbench/docs/prd.md` 「남은 한계」 의 이력 이름 항목

## 의도 메모

- 이름은 읽는 시점의 이름이다. 이력이 그때의 이름을 보여 준다고 쓰지 않는다(prd 「남은 한계」).
- 사용자 고르기 값은 이메일 그대로 둔다. 서버의 `actor` 파라미터를 바꾸지 않기 위해서다. 화면에는 표시 이름만 보인다.
- revision 열은 빼되 행의 `title` 에 남긴다. 문제를 볼 때 필요하다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. 계약 타입과 클라이언트

- `types.ts` 에 `ChangeRef { id: string; type: string; label: string; archived: boolean }` 를 두고 `ChangeEventView` 에 `/** changes 안 노드 ID 의 지금 이름 */ refs: Record<string, ChangeRef>` 를 더한다. `Ontology` 에 `/** 변경 이력 키의 표시 이름 */ changeFields?: Record<string, LabelDef>` 를 더한다.
- `client.ts` 의 `changes` 에 `actors: () => request<UserRef[]>('GET', '/api/changes/actors')` 를 더한다.

### 2. 표시 함수 `financial-workbench/web/src/lib/changes.ts` 신규

```ts
/** 이력 키의 이름. 속성이면 속성 label, 아니면 changeFields label, 둘 다 없으면 키 */
export function changeFieldLabel(o: Ontology, targetType: string, key: string): string
/** 이력 값 하나를 보일 말로. refs 에 있는 ID 는 이름, 목록은 쉼표로 잇는다 */
export function changeValueText(o: Ontology, targetType: string, key: string, value: unknown, refs: Record<string, ChangeRef>): string
```

`changeValueText` 의 규칙은 아래 순서다.

| 조건 | 결과 |
| --- | --- |
| `null`, `undefined`, `''` | 「(없음)」 |
| 키가 `subjectId`, `objectId`, `documentIds`, `fromId`, `toId` | ID 마다 `refs[id]` 의 `nodeDisplayLabel(o, ref)`, 없으면 「(찾을 수 없는 항목)」. 목록이면 `, ` 로 잇는다 |
| 키가 `reviewStatus` | `reviewStatusLabel(o, value)` |
| 키가 `role` | `ROLE_LABEL[value] ?? value` |
| `true` / `false` | 「예」 / 「아니오」 |
| 속성 정의가 enum | `enumValueLabel(def, value)` |
| 나머지 | 지금 `summarizeValue` 와 같다 |

`ROLE_LABEL` 은 `context.ts` 에 있다. `lib` 가 `context.ts` 를 import 하면 순환이 생기는지 확인하고, 생기면 `ROLE_LABEL` 을 `lib/labels.ts` 로 옮겨 `context.ts` 가 다시 내보내게 한다.

### 3. `ChangesTab.tsx` 의 행

- `changeLine` 을 지우고 `changeFieldLabel`, `changeValueText` 를 쓴다. 키 이름에 `font-mono` 를 붙이는 분기를 지운다.
- ID 를 이름으로 보인 값이 한 개짜리 ID(목록이 아님)이고 `refs` 에 있으면 그 이름을 `Button variant="link"` 로 그려 누르면 `onOpen(id)` 한다. 목록 값은 글자로만 보인다.
- 「수정 번호」 열과 그 칸을 지우고, 행(`change-row`)의 `title` 에 `수정 번호 ${c.revision}` 을 둔다. 빈 목록 칸은 `colSpan={7}` 이다.

### 4. `ChangesTab.tsx` 의 좁혀 보기

- 대상: `targetId` 가 비면 `NodePicker`(`types={[]}`, `testIdPrefix="changes-target-picker"`, `placeholder="이름이나 종목 코드로 대상 찾기"`)를 보인다. 고르면 `onTargetIdChange(node.id)` 다. `targetId` 가 있으면 `div[data-testid="changes-target-selected"]` 에 `TypeBadge` 와 이름, 「지우기」(`changes-filter-clear`)를 보인다. 이름은 고를 때 받은 노드로 채우고, 상세에서 들어와 이름을 모르면 `api.nodes.get(targetId)` 로 읽는다. 읽지 못하면(사용자나 관계 ID) 「선택한 항목」 이다.
- 사용자: 탭을 열 때 `api.changes.actors()` 를 한 번 읽어 HTML 기본 `select`(`NativeSelect`, `data-testid="changes-actor-filter"`)에 「(모두)」(값 `''`)와 표시 이름(값 이메일)을 넣는다. 바꾸면 쪽을 0 으로 돌리고 바로 다시 읽는다. 읽기에 실패하면 선택 칸을 그리지 않고 오류 없이 넘어간다.
- 「조회」 단추(`changes-filter-submit`)와 대상 ID 입력(`changes-target-filter`), 이메일 입력을 지운다.

### 5. `financial-workbench/web/TESTIDS.md`

「변경 이력 탭」 표에서 `changes-target-filter`, `changes-filter-submit` 를 지우고 `changes-target-picker-*`, `changes-target-selected`, `changes-filter-clear`(지우기), `changes-actor-filter`(select, 값은 이메일)를 적는다. revision 이 행 `title` 로 옮겨 갔다고 적는다.

### 6. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/lib/changes.test.ts` 신규. `testOntology` 에 `changeFields: { subjectId: { label: '주체' }, documentIds: { label: '근거 문서' }, archived: { label: '보관' }, reviewStatus: { label: '검토 상태' }, role: { label: '역할' } }` 를 더한 온톨로지로 본다(테스트 안에서 펼쳐 만든다).
  - `changeFieldLabel(o, 'Company', 'name')` 은 속성 label, `'subjectId'` 는 「주체」, `'unknownKey'` 는 키 그대로다.
  - `subjectId` 값 `'c1'` 과 `refs = { c1: { id: 'c1', type: 'Company', label: '가나전자', archived: false } }` 이면 「가나전자」, `refs` 가 비면 「(찾을 수 없는 항목)」 이다. `documentIds` 값 `['d1', 'd2']` 는 두 이름을 `, ` 로 잇는다.
  - `archived` 의 `false`, `true` 는 「아니오」, 「예」, `reviewStatus` 의 `'DRAFT'` 는 「초안」, `role` 의 `'EDITOR'` 는 「편집자」, `null` 은 「(없음)」 이다.
- `financial-workbench/web/src/components/ChangesTab.test.tsx`: fixture 에 `refs: {}` 를 채운다. 테스트를 더한다. 주장 `CREATE` 이력(`changes: { subjectId: { before: null, after: 'c1' } }`, `refs` 에 c1)을 그리면 「주체」 와 「가나전자」 가 있고 `c1` 원문과 `font-mono` 가 없다. 「수정 번호」 열 머리가 없다.
- `financial-workbench/web/src/components/tabs.test.tsx`: 「ChangesTab 은 대상 필터를 input 으로…」 를 「ChangesTab 은 대상 고르기 칸을 그리고 옛 표 class 를 쓰지 않는다」 로 바꾼다. `changes-target-picker-input` 이 있고 `changes-target-filter` 가 없다.
- `financial-workbench/web/e2e/workbench.spec.ts`
  - `6)` 끝에 단언을 더한다. ARCHIVE 행이 「보관」 과 「아니오 → 예」 를 담는다.
  - `6)` 다음에 `6c) 변경 이력에서 사용자를 표시 이름으로 고르고 주장 이력의 주체와 대상이 이름으로 보인다` 를 더한다.
    1. `pageA` 로 `tab-changes` 를 연다. 대상이 골라져 있으면 `changes-filter-clear` 로 지운다.
    2. `changes-actor-filter` 에서 편집자 A 의 표시 이름을 고르면 보이는 모든 `change-row` 의 사용자 칸이 그 이름이다.
    3. `changes-target-picker-input` 에 `data.supplier` 를 넣고 `changes-target-picker-search` 를 누른 뒤, `changes-target-picker-result` 가운데 `data-node-id` 가 공급사 기업인 후보를 누른다. `changes-target-selected` 에 `data.supplier` 가 보이고 모든 `change-row` 의 `data-target-id` 가 그 id 다.
    4. `3b)` 가 적어 둔 주장 id 로 `pageA.goto(\`/?node=${주장 id}\`)` 를 열어 주장 상세를 연다. 주장은 기업 이름으로 검색되지 않으므로(`docs/prd.md` 「남은 한계」) 검색으로 찾지 않는다. `detail-label` 이 주장 이름이 될 때까지 기다린다. `node-history-link` 를 누르면 `CREATE` 행이 「주체」, `data.supplier`, 「대상」, `data.customer` 를 담고 UUID 형식 글자(`/[0-9a-f]{8}-[0-9a-f]{4}-/`)를 담지 않는다. `shot(pageA, '06c-changes-names')` 를 남긴다.
  - `0c)` 는 그대로 통해야 한다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/changes.test.ts src/components/ChangesTab.test.tsx src/components/tabs.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
! grep -n 'changes-target-filter' financial-workbench/web/src/components/ChangesTab.tsx
grep -q 'changes-target-picker' financial-workbench/web/TESTIDS.md
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan008 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan008 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
cd financial-workbench/api && ./gradlew test
```

- 두 project 가 모두 통과해야 한다. 마지막 `./gradlew test` 는 세 phase 를 합친 뒤 서버 테스트가 그대로인지 다시 본다.
- `06c-changes-names.png` 에서 변경 내용 칸에 UUID 와 영문 키가 없고, 좁은 칸에서 이름이 겹치지 않는지 눈으로 본다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/lib/changes.ts` | 신규 |
| `financial-workbench/web/src/lib/changes.test.ts` | 신규 |
| `financial-workbench/web/src/components/ChangesTab.tsx` | 수정 |
| `financial-workbench/web/src/components/ChangesTab.test.tsx` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
