# Phase 03. 노드 편집 409 때 입력 지키기

**Execution profile**: standard

## 목표

노드 편집 폼이 `409 REVISION_CONFLICT` 를 받아도 내 입력을 버리지 않게 한다.
최신 값을 다시 읽은 뒤 편집 시작 값, 내 입력, 최신 값을 칸마다 비교해 「다른 쪽만 바꿈」, 「나만 바꿈」, 「둘 다 다르게 바꿈」 을 보이고, 「다시 적용」 으로 내 입력을 다시 넣게 한다.

**선행 조건**: plan006 이 머지된 `main` 위에서 시작하고, 이 계획의 phase 01 과 02 가 끝난 상태다.

**범위 외**: 주장 내용 수정 폼(`ClaimEditForm`), 검토, 보관, 복원의 409 는 지금처럼 최신 값을 다시 읽기만 한다. 서버 409 응답은 바꾸지 않는다. 만들기 폼은 앞 phase 에서 끝났다.

## 컨텍스트

- 상세 패널은 `financial-workbench/web/src/components/DetailPanel.tsx` 다.
  - `Notice` 타입은 `{ kind: 'success' | 'conflict' | 'error'; text: string; sub?: string; actions?: ... }` 다. `CONFLICT_TEXT` 상수는 「다른 사용자가 먼저 수정했습니다. 최신 내용을 불러왔습니다. 확인한 뒤 다시 수정하세요.」 다.
  - `fail(e)` 는 `REVISION_CONFLICT` 면 `{ kind: 'conflict', text: CONFLICT_TEXT, sub: e.message }` 안내를 두고 `setReloadKey(k => k + 1)` 로 상세를 다시 읽는다. 안내는 `notice.sub` 가 `notice.text` 와 다르면 「서버 응답: …」 줄을 더 보인다. `sub` 를 쓰는 곳은 이 둘뿐이다.
  - 첫 `useEffect` 는 `selectedId` 나 `flash` 가 바뀌면 안내와 주장 추가 상태를 비운다.
  - 노드 편집 폼은 `<NodeEditForm key={\`${node.id}:${node.revision}\`} node={node} onSaved={() => succeed('저장했습니다.')} onError={fail} />` 다. 다시 읽어 revision 이 바뀌면 key 가 바뀌어 폼이 새로 그려지고 입력이 사라진다. 주장 수정 폼(`ClaimEditForm`)도 같은 `fail` 을 받는다.
- 노드 편집 폼은 `financial-workbench/web/src/components/NodeEditForm.tsx` 다. `values` 상태를 `initialFormValues(defs, node.properties)` 로 시작하고, 저장은 `buildPatchProperties(defs, node.properties, values)` 뒤 `api.nodes.patch(node.id, node.revision, properties)` 다. 오류는 `onError(err)` 로 부모에 넘긴다. 입력칸은 `PropertyFields`(`testIdPrefix="edit-prop"`)다.
- 입력 변환은 `financial-workbench/web/src/lib/formValues.ts` 의 `toInputValue(def, value)` 와 `FormValues`(`Record<string, string>`)다. 비교는 입력칸 문자열로 한다. `datetime` 은 로컬 분 단위 문자열이라 서버의 초 단위 값과 직접 비교하지 않아도 된다.
- 표시 이름은 `useLabels()`(`financial-workbench/web/src/context.ts`)의 `property(type, prop)`, `value(type, prop, value)` 다.
- 화면 부품은 `financial-workbench/web/src/components/ui/` 의 shadcn 부품(Button, Alert 등)이다. 같은 폴더의 다른 화면이 쓰는 방식을 따른다. 고르기 단추 둘은 HTML 기본 라디오(`<input type="radio">`)와 `Label` 로 만든다. Radix 부품을 새로 들이지 않는다.
- 브라우저 테스트 `financial-workbench/web/e2e/workbench.spec.ts` 의 `5)` 는 A 가 고객사 `description` 을 `data.editByA` 로 저장한 뒤, 예전 revision 을 든 B 가 `data.editByB` 로 저장해 409 안내(`detail-notice` 의 `data-kind="conflict"`, 「다른 사용자가 먼저 수정했습니다」)와 최신 값(`edit-prop-description` 이 `data.editByA`)을 확인한다. 이 테스트의 기대값이 바뀐다.
- 컴포넌트 테스트는 `renderToStaticMarkup` 로 정적 HTML 만 본다. 칸마다 가르는 판정은 순수 함수로 두고 단위 테스트로 확인한다. 테스트 온톨로지는 `financial-workbench/web/src/components/testSupport.tsx` 의 `testOntology`, 감싸기는 `withApp(children)` 이다.
- `financial-workbench/web/TESTIDS.md` 의 「작업 공간: 오른쪽 상세」 절에 `detail-notice`, `node-edit-form`, `edit-prop-<속성>` 이 있다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「동시 수정」 아래 「화면에서 입력 지키기」 절, `financial-workbench/docs/api-contract.md` 의 「revision 과 동시 수정」, `financial-workbench/docs/code-architecture.md` 「결정」 의 동시 수정 항목, `financial-workbench/docs/prd.md` 의 「남은 한계」

## 의도 메모

- 409 응답에 서버 값을 담는 안은 버렸다. 화면이 상세를 어차피 다시 읽고, 편집 시작 값은 화면만 들고 있다.
- 내 입력은 `NodeEditForm` 이 아니라 `DetailPanel` 이 들고 있다. 폼은 revision 이 key 라 다시 그려지기 때문이다. key 에서 revision 을 빼는 안은 버렸다. 그러면 저장 성공 뒤에도 폼이 예전 값을 들고 있게 된다.
- 「둘 다 다르게 바꿈」 의 기본 선택은 「최신 값」 이다. 다른 사람이 저장한 값을 모르는 사이에 덮어쓰지 않기 위해서다.
- 「다시 적용」 은 폼에 값만 넣고 저장하지 않는다. 사용자가 새 값을 확인한 뒤 저장한다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. `financial-workbench/web/src/lib/conflict.ts` 신규

```ts
import type { PropertyDef, PropertyValue } from '../api/types'
import type { FormValues } from './formValues'

/** 409 를 받았을 때 화면이 들고 있던 것. revision 은 편집을 시작한 revision 이다 */
export interface EditDraft {
  nodeId: string
  revision: number
  base: Record<string, PropertyValue>
  mine: FormValues
}

export type ConflictKind = 'theirs' | 'mine' | 'both'

export interface ConflictField {
  name: string
  kind: ConflictKind
  /** 입력칸 문자열 */
  mine: string
  latest: string
}

/**
 * 편집 시작 값, 내 입력, 최신 값을 칸마다 비교한다. text 가 아니면 앞뒤 공백을 무시한다.
 * 둘 다 안 바꿨거나 같은 값으로 바꾼 칸은 넣지 않는다. 순서는 defs 순서다.
 */
export function compareConflict(
  defs: Record<string, PropertyDef>,
  base: Record<string, PropertyValue>,
  mine: FormValues,
  latest: Record<string, PropertyValue>,
): ConflictField[]

/** 최신 값으로 만든 입력에 'mine' 칸과 choices 가 'mine' 인 'both' 칸의 내 입력을 넣는다 */
export function applyConflict(latestValues: FormValues, fields: ConflictField[], choices: Record<string, 'mine' | 'latest'>): FormValues

/** 다시 적용할 칸('mine', 'both')이 하나라도 있는가 */
export function hasReapplicable(fields: ConflictField[]): boolean
```

판정은 아래 표다. `b`, `m`, `l` 은 각각 `toInputValue(def, base[name])`, `mine[name] ?? ''`, `toInputValue(def, latest[name])` 이다.

| 조건 | 결과 |
| --- | --- |
| `m == b` 이고 `l == b` | 넣지 않는다 |
| `m == b` 이고 `l != b` | `theirs` |
| `m != b` 이고 `l == b` | `mine` |
| `m != b` 이고 `l != b` 이고 `m == l` | 넣지 않는다 |
| `m != b` 이고 `l != b` 이고 `m != l` | `both` |

### 2. `financial-workbench/web/src/components/NodeEditForm.tsx`

- `Props` 에 셋을 더한다.

  ```ts
  /** 409 로 남은 내 입력. 이 노드이고 node.revision 이 draft.revision 과 다를 때만 비교를 보인다 */
  draft?: EditDraft | null
  /** 409 를 받으면 저장하려던 입력을 부모에 맡긴다. 그다음 onError 를 부른다 */
  onConflict?: (draft: EditDraft) => void
  /** 비교를 닫을 때(다시 적용, 버리기) */
  onDraftDone?: () => void
  ```
- `submit` 의 `catch` 에서 `err instanceof ApiError && err.code === 'REVISION_CONFLICT'` 이면 `onConflict?.({ nodeId: node.id, revision: node.revision, base: node.properties, mine: values })` 를 먼저 부르고 `onError(err)` 를 부른다.
- `draft` 가 보일 조건(`draft.nodeId === node.id && draft.revision !== node.revision && !node.archived`)이면 `fields = compareConflict(defs, draft.base, draft.mine, node.properties)` 를 구한다. `hasReapplicable(fields)` 가 거짓이면 비교를 보이지 않는다. 다른 사람이 보관해 revision 이 바뀐 경우에는 폼이 비활성이라 다시 적용할 수 없으므로 비교를 보이지 않는다.
- 비교 상자는 `PropertyFields` 위에 둔다. `div[data-testid="edit-conflict"]` 이다.
  - 머리 문장: 「저장하지 못한 내 입력이 있습니다. 칸마다 확인하고 다시 적용하세요.」
  - 칸 한 줄은 `li[data-testid="edit-conflict-field"][data-field={name}][data-kind={kind}]` 다. 칸 이름은 `labels.property(node.type, name)` 이다.
    - `theirs`: 「다른 쪽이 바꿈: {최신 값}」
    - `mine`: 「내 입력: {내 값}」
    - `both`: 「둘 다 바꿈」 아래에 라디오 둘. 두 라디오는 `name={\`conflict-${name}\`}` 로 묶는다. `input[type=radio][data-testid="edit-conflict-choice-{name}-mine"]` 의 이름표는 「내 값: {내 값}」, `-latest` 는 「최신 값: {최신 값}」 이다. 기본은 `latest` 다.
    - 값 표시는 enum 이면 `labels.value(node.type, name, 값)`, 빈 값이면 「(비어 있음)」, 120자를 넘으면 `truncate`(`financial-workbench/web/src/lib/format.ts`)로 줄인다.
  - 단추 둘은 모두 `type="button"` 이다. 비교 상자는 `<form onSubmit={submit}>` 안에 있어 type 이 없으면 누를 때 폼이 제출된다. 「다시 적용」(`edit-conflict-apply`)은 `setValues(applyConflict(values, fields, choices))`, `onDraftDone?.()`, 폼 안내 「내 입력을 다시 넣었습니다. 확인한 뒤 저장하세요.」(`node-edit-local-message`)다. 「버리기」(`edit-conflict-discard`)는 `onDraftDone?.()` 만 부른다.
- 비교 상자를 고르기 상태(`choices`)와 함께 컴포넌트 안에 두면 렌더링 함수가 길어진다. 같은 파일에 `ConflictBox` 컴포넌트를 따로 둔다.

### 3. `financial-workbench/web/src/components/DetailPanel.tsx`

- `const [draft, setDraft] = useState<EditDraft | null>(null)` 을 둔다. 첫 `useEffect`(선택이 바뀔 때)에서 `setDraft(null)` 한다.
- `NodeEditForm` 에 `draft={draft}`, `onConflict={setDraft}`, `onDraftDone={() => setDraft(null)}` 를 넘긴다. 저장에 성공하면(`onSaved`) `setDraft(null)` 도 한다.
- `CONFLICT_TEXT` 를 「다른 탭이나 다른 사용자가 먼저 저장했습니다. 최신 내용을 불러왔습니다.」 로 바꾼다. `fail()` 의 `REVISION_CONFLICT` 안내에서 `sub` 를 빼고, `Notice` 타입의 `sub` 와 「서버 응답」 줄을 지운다.
- 주장 수정 폼과 검토, 보관, 복원의 409 는 같은 `fail()` 을 타서 문구만 바뀐다.

### 4. `financial-workbench/web/TESTIDS.md`

「작업 공간: 오른쪽 상세」 표에 `edit-conflict`, `edit-conflict-field` *(`data-field`, `data-kind` 가 `theirs`, `mine`, `both`), `edit-conflict-choice-<속성>-mine`, `edit-conflict-choice-<속성>-latest`, `edit-conflict-apply`, `edit-conflict-discard` 를 더한다.

### 5. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/lib/conflict.test.ts` 신규
  - 정의 `{ a: string, b: string, c: string, d: string, e: string }`, `base = { a: '1', b: '1', c: '1', d: '1', e: '1' }`, `mine = { a: '1', b: '1', c: '2', d: '2', e: '2' }`, `latest = { a: '1', b: '3', c: '1', d: '2', e: '3' }` 이면 결과가 `[b theirs, c mine, e both]` 다. `d` 는 같은 값으로 바꿔 빠진다.
  - text 가 아닌 칸은 `' 1 '` 과 `'1'` 을 같은 값으로 본다. text 칸은 다르게 본다.
  - `applyConflict` 가 `c` 와, `choices.e = 'mine'` 일 때의 `e` 만 내 값으로 바꾸고 `b` 는 최신 값으로 둔다. `choices` 가 비면 `e` 는 최신 값이다.
  - `theirs` 만 있으면 `hasReapplicable` 이 거짓이다.
- `financial-workbench/web/src/components/screens.test.tsx` 에 테스트를 더한다.
  - `<NodeEditForm node={revision 3 이고 properties 가 { name: 'x', country: 'KR' } 인 Company} draft={{ nodeId 같음, revision: 2, base: { name: 'x', country: 'KR' }, mine: { name: 'y', country: 'KR' } }} ... />` 를 `withApp` 으로 그리면 `edit-conflict` 와 `data-kind="mine"` 줄이 있다. 같은 draft 의 `revision` 이 3 이면(아직 다시 읽지 않음) 비교가 없다. `nodeId` 가 다르면 비교가 없다.
  - 같은 draft 로 `archived: true` 인 노드를 그리면 비교가 없다.
  - 최신 값의 `name` 도 바뀐 노드(`properties: { name: 'z', country: 'KR' }`)를 그리면 `data-kind="both"` 줄과 `edit-conflict-choice-name-latest` 라디오가 `checked` 다.
- `financial-workbench/web/e2e/workbench.spec.ts` 의 `5)` 를 고친다. 제목은 `5) 같은 노드를 동시에 고치면 나중 저장은 409 안내 뒤 최신 값을 보이고, 내 입력을 골라 다시 적용해 저장한다` 다.
  - B 는 `description` 을 `data.editByB` 로, `registrationNumber` 를 `data.registrationByB`(새 값, `data` 객체에 더한다)로 바꿔 저장한다.
  - 409 뒤 기대값: `detail-notice` 의 `data-kind` 가 `conflict` 이고 「다른 탭이나 다른 사용자가 먼저 저장했습니다」 를 담는다. 「서버 응답」 을 담지 않는다. `edit-prop-description` 이 `data.editByA` 다. `edit-conflict-field[data-field="description"]` 의 `data-kind` 가 `both`, `[data-field="registrationNumber"]` 가 `mine` 이다. `node-revision` 은 `revisionBefore + 1` 이다. `shot(pageB, '05-conflict-b')` 를 남긴다.
  - B 가 `edit-conflict-choice-description-mine` 을 고르고 `edit-conflict-apply` 를 누르면 `edit-prop-description` 이 `data.editByB`, `edit-prop-registrationNumber` 가 `data.registrationByB` 이고 `edit-conflict` 가 사라지고, `node-edit-local-message` 가 「내 입력을 다시 넣었습니다」 를 담는다. 「바뀐 내용이 없습니다」 가 아니어야 한다. 단추가 폼을 제출하지 않았다는 근거다. `node-save` 뒤 `detail-notice` 가 `success`, `node-revision` 이 `revisionBefore + 2` 다. `shot(pageB, '05-reapplied-b')` 를 남긴다.
  - 뒤 테스트가 고객사 `description` 값에 기대면 그 기대값을 `data.editByB` 로 고친다. 고친 곳이 없으면 그대로 둔다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/conflict.test.ts src/components/screens.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
! grep -n '서버 응답' financial-workbench/web/src/components/DetailPanel.tsx
grep -q 'edit-conflict-apply' financial-workbench/web/TESTIDS.md
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan007 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan007 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
cd financial-workbench/api && ./gradlew test
```

- 두 project 가 모두 통과해야 한다. 마지막 `./gradlew test` 는 세 phase 를 합친 뒤 서버 테스트가 그대로인지 다시 본다.
- `05-conflict-b.png` 에서 비교 상자가 입력칸을 가리지 않고, 「둘 다 바꿈」 의 두 값이 모두 보이는지 눈으로 본다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/lib/conflict.ts` | 신규 |
| `financial-workbench/web/src/lib/conflict.test.ts` | 신규 |
| `financial-workbench/web/src/components/NodeEditForm.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/screens.test.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
