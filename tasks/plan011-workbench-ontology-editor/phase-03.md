# Phase 03. 화면의 버전 기록, YAML 편집기, 버전 바뀜 안내

**Execution profile**: standard

## 목표

온톨로지 탭에서 ADMIN 이 YAML 편집기로 초안을 고치고, 미리보기로 바뀐 점과 영향을 확인해 저장하고, 버전 기록에서 예전 버전을 보고 되돌리게 한다.
다른 화면은 응답 헤더로 버전이 바뀐 것을 알아 「다시 읽기」 안내를 보인다. 정의에서 빠진 타입과 관계 종류의 데이터도 화면이 깨지지 않고 보인다.

**범위 외**: 폼 편집기는 phase 04 다. 이 phase 의 온톨로지 탭에는 「폼으로 편집」 단추를 두지 않는다. 서버는 phase 01, 02 가 만들었고 이 phase 는 `financial-workbench/api/` 를 고치지 않는다.

## 컨텍스트

- 서버 API(phase 01, 02): `GET /api/ontology`(모든 역할, `version`, `versionCreatedAt`, `versionCreatedBy` 를 담는다), ADMIN 의 `GET /api/ontology/versions?page&size`, `GET /api/ontology/versions/{version}`(`yaml` 포함), `GET /api/ontology/export`, `POST /api/ontology/preview`, `POST /api/ontology/versions`, `POST /api/ontology/versions/{version}/restore`. 모든 API 응답에 `X-Ontology-Version` 헤더가 있다. 본문, 응답, 오류 코드는 `financial-workbench/docs/api-contract.md` 의 「온톨로지」 와 오류 코드 표가 정한다.
- 지금 온톨로지 탭은 `financial-workbench/web/src/components/OntologyTab.tsx` 하나다. `useApp().ontology` 를 읽어 노드 타입 카드, 관계 표, 주장 종류 표를 그리고, 「읽기 전용입니다. 바꾸려면 저장소의 온톨로지 YAML 을 고칩니다.」 를 보인다. testid 는 `ontology-tab`, `ontology-version`, `ontology-node-type`, `ontology-relationships`, `ontology-predicates` 다(`web/TESTIDS.md`).
- `web/src/App.tsx` 가 `ontology` 를 `useState` 로 들고 `AppContext`(`web/src/context.ts` 의 `user`, `ontology`, `canEdit`)로 내려 준다. 탭 경로와 query 는 `web/src/routes.ts` 의 순수 함수(`TAB_PATHS`, `parseWorkspaceQuery`, `workspaceSearch`, `parseChangesQuery`, `changesSearch`)가 읽고 쓴다. 테스트는 `web/src/routes.test.ts` 다. 라우터는 `BrowserRouter useTransitions={false}` 다.
- fetch 래퍼는 `web/src/api/client.ts` 의 `request<T>(method, path, body, options)` 하나다. 401 이면 `setUnauthorizedHandler` 로 등록한 함수를 부른다. 오류는 `ApiError(status, code, details)` 다. 타입은 `web/src/api/types.ts` 다.
- 상세는 `web/src/components/DetailPanel.tsx` 다. Claim 이 아니면 `NodeEditForm`(`ontology.nodeTypes[node.type]?.properties ?? {}` 로 폼을 만든다)을 그린다. 관계 목록은 `web/src/components/RelationshipSection.tsx` 이고 행마다 `relationship-archive-toggle` 이 있다. 변경 이력은 `web/src/components/ChangesTab.tsx` 와 `web/src/lib/changes.ts` 이고, `targetKind` 가 `RELATIONSHIP`, `USER` 일 때 대상 칸을 달리 그린다.
- 화면 부품은 `web/src/components/ui/` 의 shadcn 부품(Button, Input, Textarea, NativeSelect, Card, Badge, Table, Alert, Label)이다. 표시 이름은 `web/src/lib/labels.ts` 와 `useLabels()` 로 읽고, 이름이 없으면 키를 그대로 보인다.
- 웹 단위 테스트는 vitest 이고 컴포넌트는 `react-dom/server` 로 정적 렌더링해 확인한다(`web/src/components/tabs.test.tsx`, `testSupport.tsx`).
- 브라우저 테스트는 `web/e2e/workbench.spec.ts` 의 `test.describe('금융 온톨로지 워크벤치: 역할별 협업')` 이다. 테스트가 순서대로 돌며 `pageAdmin`(ADMIN), `pageA`(편집자)를 함께 쓴다. 마지막이 `8) 관리자가 열람자를 비활성화하면 …` 이다. 스크린샷은 `support.ts` 의 `shot(page, name)` 이다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」(`/ontology` 행, push 표의 온톨로지 행, ADMIN 이 아닌 사람의 `view` 처리)와 「온톨로지 편집」(초안, 미리보기와 저장, 버전 기록과 되돌리기, 다른 화면이 버전 바뀜을 아는 방법), `financial-workbench/docs/data-schema.md` 의 「온톨로지 버전」(영향 표의 `kind`, 정의에서 빠진 데이터), `financial-workbench/docs/api-contract.md` 의 「온톨로지」, `financial-workbench/docs/code-architecture.md` 「웹 구조」 의 `web/src/components/ontology/` 행

## 의도 메모

- 웹은 YAML 라이브러리를 들이지 않는다. YAML 은 텍스트로만 다루고, 정규화와 오류 검사는 미리보기 API 가 한다(`code-architecture.md`).
- 버전이 바뀌어도 저절로 다시 읽지 않는다. 쓰던 폼의 칸이 바뀌어 입력이 사라질 수 있기 때문이다(`flow.md`).
- 초안은 `App` 이 들고 있어 탭을 옮겨도 남는다. 새로고침하면 사라지고, 그 전에 `beforeunload` 로 묻는다. `sessionStorage` 에 두지 않는다. 16KB 넘는 YAML 을 탭 저장소에 쌓을 이유가 없고, 다른 관리자의 저장 뒤 낡은 초안이 되살아나는 것을 막으려는 것이다.

## 작업 항목

### 1. 타입과 API

- `web/src/api/types.ts`: `Ontology` 에 `version: number`, `versionCreatedAt: string`, `versionCreatedBy: UserRef | null` 를 더한다. `OntologyVersionSummary`, `OntologyVersionDetail`, `OntologyImpact`(`path`, `kind`, `count`), `OntologyImpactKind`(`data-schema.md` 영향 표의 열 개 값), `OntologyPreview`, `OntologyEditRequest`(`baseVersion`, `yaml?`, `definition?`, `note?`, `confirm?`)를 더한다. `ChangeEventView.targetKind` 에 `'ONTOLOGY'` 를 더한다.
- `web/src/api/types.ts` 의 `Ontology` 에 필드를 더하면 테스트 fixture 도 typecheck 에 걸린다(`tsconfig.app.json` 이 `src` 전체를 본다). `web/src/components/testSupport.tsx` 의 `testOntology`, `web/src/lib/labels.test.ts` 의 `bare` 두 곳, `web/src/lib/changes.test.ts` 의 온톨로지 fixture 에 `version: 1`, `versionCreatedAt`, `versionCreatedBy: null` 을 채운다.
- `web/src/api/client.ts`: `setOntologyVersionListener(fn: ((version: number) => void) | null)` 를 더한다. `request` 가 응답을 받을 때마다(성공과 오류 모두) `X-Ontology-Version` 을 정수로 읽어 부른다. 지금 `api.ontology` 는 함수(`ontology: () => request<Ontology>('GET', '/api/ontology')`)다. 객체로 바꿔 `api.ontology.get()` 으로 두고 호출부(`App.tsx` 의 `.ontology()`)를 고친다. 그 객체에 `versions(page)`, `version(n)`, `preview(body)`, `save(body)`, `restore(n, body)` 를 더한다. 내려받기 주소는 상수 `ONTOLOGY_EXPORT_URL = '/api/ontology/export'` 와 `ontologyVersionDownload(n)`(그 버전의 `yaml` 로 Blob 을 만들어 `financial-ontology-v<n>.yaml` 로 내려받는 함수)이다.

### 2. 주소

- `web/src/routes.ts`: `OntologyQuery = { view?: 'yaml' | 'history'; version?: number }`, `parseOntologyQuery(search)`, `ontologySearch(q)` 를 더한다. phase 04 가 `'form'` 을 더한다. 모르는 `view` 와 정수가 아닌 `version` 은 버린다.
- `App.tsx`: ADMIN 이 아닌 사람이 `/ontology?view=…` 를 열면 `/ontology` 로 `replace` 한다. 온톨로지 탭 안의 보기 바꾸기와 버전 열기는 `push` 다.

### 3. 버전 바뀜 안내와 다시 읽기

- `App.tsx` 가 `setOntologyVersionListener` 로 최신 번호를 `latestVersion` 상태에 둔다. `latestVersion` 이 `ontology.version` 보다 크면 머리글 아래에 `Alert`(testid `ontology-stale`)로 「온톨로지가 바뀌었습니다(버전 N). 다시 읽으면 바뀐 타입과 칸이 보입니다.」 와 「다시 읽기」(testid `ontology-reload`)를 보인다.
- 「다시 읽기」 는 `GET /api/ontology` 만 다시 받아 `ontology` 를 바꾼다. 주소와 열린 항목은 그대로다.
- `reloadOntology()` 를 온톨로지 탭에 넘긴다. 저장과 되돌리기가 성공하면 탭이 이것을 불러 바로 새 버전을 읽으므로 안내가 나오지 않는다.

### 4. 온톨로지 탭

`web/src/components/OntologyTab.tsx` 를 `web/src/components/ontology/` 로 옮기고 나눈다. `App.tsx` 의 import 를 고친다.

- `ontology/OntologyTab.tsx`: `view` 에 따라 보기, YAML 편집기, 버전 기록을 고른다. 머리에 「온톨로지」, `ontology-version`(「버전 N」), 저장한 사람과 시각(`versionCreatedBy` 가 `null` 이면 「시스템」)을 보인다. ADMIN 이면 「YAML 로 편집」(`ontology-edit-yaml`), 「버전 기록」(`ontology-history-open`), 「YAML 내려받기」(`ontology-export`, `href={ONTOLOGY_EXPORT_URL}` 와 `download` 를 단 링크)를 보인다. 초안이 있으면 단추 옆에 「편집 중인 초안이 있습니다」 를 보인다. 「읽기 전용입니다 …」 문장을 지운다. ADMIN 이 아니면 단추가 없다.
- `ontology/OntologyView.tsx`: 지금 표들을 그대로 옮긴다. testid 는 바꾸지 않는다.
- `ontology/OntologyYamlEditor.tsx`: 초안이 없으면 `GET /api/ontology/versions/{ontology.version}` 의 `yaml` 로 초안을 만든다(`baseVersion` 은 그 번호). 고정폭 글꼴 `Textarea`(testid `ontology-yaml-input`, `spellCheck={false}`)와 「저장 전에 확인」(`ontology-preview`), 「초안 버리기」(`ontology-draft-discard`)가 있다. 서버가 정규화한 YAML 에는 주석이 없으므로, 입력칸 위에 접힌 도움말(`<details>`, testid `ontology-yaml-help`)로 저장소 YAML 머리 주석의 키 설명(`label`, `valueLabels`, `description`, `valueAliases`, `hintProperties`, `display`, `searchProperties`, `createPicker`)과 흐름 표기의 따옴표 규칙을 한국어로 옮겨 둔다.
- `ontology/OntologyPreviewPanel.tsx`: 미리보기 결과를 그린다(testid `ontology-preview-panel`).
  - `valid` 가 거짓이면 `errors` 를 목록(`ontology-preview-error` 각 줄)으로 보이고 저장 단추가 없다.
  - 「더함」, 「뺌」, 「바뀜」 목록(`ontology-diff-added`, `-removed`, `-changed`)과 바뀐 점이 없을 때 「바뀐 점이 없습니다」(`ontology-diff-empty`). 바뀐 점이 없으면 저장 단추를 두지 않는다.
  - 영향(`ontology-impact` 각 줄, `data-kind`)은 경로와 아래 문장이다. 문장 함수는 `web/src/lib/ontologyEdit.ts` 의 `impactText(kind, count)` 다.

    | `kind` | 문장 |
    | --- | --- |
    | `REMOVED_NODE_TYPE` | 이 타입의 노드 {n}개가 정의 없이 남습니다 |
    | `REMOVED_PROPERTY` | 노드 {n}개가 이 속성 값을 가지고 있습니다 |
    | `NOW_REQUIRED` | 노드 {n}개에 이 속성 값이 없습니다 |
    | `REMOVED_ENUM_VALUE` | 노드 {n}개가 이 값을 쓰고 있습니다 |
    | `CHANGED_PROPERTY_TYPE` | 노드 {n}개의 값이 예전 타입으로 남습니다 |
    | `NARROWED_RANGE` | 노드 {n}개의 값이 새 범위를 넘습니다 |
    | `REMOVED_RELATIONSHIP_TYPE` | 이 종류의 관계 {n}개가 정의 없이 남습니다 |
    | `NARROWED_RELATIONSHIP_ENDS` | 관계 {n}개가 빠진 타입에 걸려 있습니다 |
    | `REMOVED_CLAIM_PREDICATE` | 이 종류의 주장 {n}개가 정의 없이 남습니다 |
    | `NARROWED_CLAIM_TYPES` | 주장 {n}개의 주체나 대상이 빠진 타입입니다 |

  - `codeOwnedIgnored` 가 있으면 「서버 코드가 정하는 항목이라 저장소 값으로 둡니다」 와 경로 목록.
  - 메모 입력칸(`ontology-save-note`, 1000자), 영향이 있을 때만 「기존 데이터와 어긋나는 것을 알고 저장합니다」 확인란(`ontology-save-confirm`), 「저장」(`ontology-save`). 영향이 있으면 확인란을 켜야 저장이 눌린다.
  - 저장 성공: `reloadOntology()`, 초안 지우기, `/ontology` 로 `push`, 「버전 N 을 저장했습니다.」(`ontology-message`, `data-kind="success"`).
  - `409 ONTOLOGY_IMPACT_UNCONFIRMED`: `details.impacts` 로 영향 목록을 다시 그리고 확인란을 끈다.
  - `409 REVISION_CONFLICT`: 「다른 관리자가 버전 N 을 저장했습니다.」 와 「최신 버전에서 다시 시작」(`ontology-conflict-restart`, 초안을 버리고 새로 연다), 「내 초안을 최신 버전 위에 저장」(`ontology-conflict-rebase`, `baseVersion` 을 최신으로 바꾸고 미리보기를 다시 부른다). N 은 `details.currentRevision` 이다.
  - `400 ONTOLOGY_INVALID`: `details.errors` 를 오류 목록으로 보인다.
- `ontology/OntologyHistory.tsx`(`view=history`): 버전 표(`ontology-history-row`, `data-version`)에 번호, 시각, 저장한 사람, 메모, 「버전 N 으로 되돌림」 을 보인다. 쪽 넘기기는 `web/src/components/Pager.tsx` 다. 행을 누르면 `version=N` 으로 `push` 하고, 그 버전의 YAML 을 읽기 전용 `Textarea`(`ontology-history-yaml`)로 보인다. 「이 버전 내려받기」(`ontology-history-download`)와 「이 버전으로 되돌리기」(`ontology-restore`)가 있다. 되돌리기는 그 YAML 로 미리보기를 부르고 같은 미리보기 패널을 보인다. 저장 단추는 `POST /api/ontology/versions/{N}/restore` 를 부른다. 최신 버전에는 되돌리기 단추가 없다.
- 초안 상태 `OntologyDraft = { baseVersion: number; yaml: string; dirty: boolean }` 는 `App.tsx` 가 `useState` 로 들고 `OntologyTab` 에 props 로 넘긴다. `dirty` 인 초안이 있으면 `beforeunload` 를 건다.

### 5. 정의에서 빠진 데이터

- 새 파일 `web/src/components/UndefinedTypeProperties.tsx`: props `node: NodeView` 만 받아 「이 타입은 온톨로지에서 빠졌습니다. 고칠 수 없고 보관과 복원만 됩니다.」(testid `node-undefined-type`)와 속성 키와 값 목록을 읽기 전용으로 그린다. `DetailPanel.tsx` 는 상세를 `useEffect` 로 읽어 정적 렌더링으로 테스트할 수 없으므로, 그리는 부분을 이 컴포넌트로 뺀다.
- `DetailPanel.tsx`: `ontology.nodeTypes[node.type]` 이 없으면 속성 폼 대신 `UndefinedTypeProperties` 를 그린다. 주장 만들기와 관계 더하기 단추도 숨긴다. 보관과 복원 단추는 그대로다.
- `RelationshipSection.tsx`: `ontology.relationshipTypes[r.type]` 가 없는 행은 `relationship-archive-toggle` 을 숨기고 「정의에서 빠진 관계」 배지(`relationship-undefined`)를 보인다.
- `ChangesTab.tsx`, `lib/changes.ts`: `targetKind === 'ONTOLOGY'` 인 행의 대상 칸은 「온톨로지 버전 N」(`targetLabel`)과 「(온톨로지)」 이고 누를 수 없다. `added`, `removed`, `changed` 의 목록 값은 쉼표로 이어 보인다. 항목 이름은 지금 규칙대로 `changeFields` 의 label(「더한 항목」 등)이다.

### 6. 문서

- `web/TESTIDS.md`: 온톨로지 절의 `ontology-version` 설명을 「탭, 버전 번호」 로 고치고, 이 phase 의 새 testid 를 모두 적는다. `ontology-stale`, `ontology-reload` 는 머리글 절에, `node-undefined-type` 은 상세 절에, `relationship-undefined` 는 관계 절에 적는다.

### 7. 이 phase 를 검증하는 테스트

- `web/src/routes.test.ts`: `parseOntologyQuery('?view=history&version=3')` 가 `{ view: 'history', version: 3 }`, `?view=nope&version=x` 가 `{}`, `ontologySearch({ view: 'yaml' })` 가 `?view=yaml` 이다.
- 새 파일 `web/src/lib/ontologyEdit.test.ts`: `impactText` 가 열 가지 `kind` 모두에 `{n}` 을 채운 문장을 돌려준다.
- 새 파일 `web/src/components/ontology/ontology.test.tsx`(`testSupport.tsx` 의 정적 렌더링): ADMIN 의 온톨로지 탭에 `ontology-edit-yaml`, `ontology-history-open`, `ontology-export` 가 있고 VIEWER 에게는 없다. 영향 하나를 담은 미리보기 패널은 `ontology-save-confirm` 이 있고 `ontology-save` 가 `disabled` 다. `valid: false` 미리보기는 `ontology-preview-error` 가 있고 `ontology-save` 가 없다.
- `web/src/components/tabs.test.tsx` 의 온톨로지 단언은 새 위치의 컴포넌트로 바꾼다. `ontology-version` 단언은 유지한다.
- `web/src/components/ChangesTab.test.tsx` 에 `targetKind: 'ONTOLOGY'`, `targetLabel: '버전 7'`, `changes: { added: { before: null, after: ['nodeTypes.Fund'] } }` 행이 「온톨로지」 와 `nodeTypes.Fund` 를 담고 링크 단추가 없음을 더한다.
- `web/src/components/screens.test.tsx` 에 온톨로지에 없는 타입(`type: 'Gone'`, `properties: { name: '남은 노드', memo: '메모' }`)의 `UndefinedTypeProperties` 가 `node-undefined-type`, `name`, `남은 노드` 를 담고 입력칸(`<input`)이 없음을 더한다.
- `web/e2e/workbench.spec.ts` 의 `8)` 뒤에 `9) 관리자가 YAML 로 새 타입을 더하면 편집자 화면에 안내가 나오고, 되돌리면 타입이 사라진다` 를 더한다.
  1. `pageA` 에서 온톨로지를 한 번 읽어 둔다(작업 공간을 연 상태).
  2. `pageAdmin` 이 `/ontology` 를 열고 `ontology-version` 의 번호를 저장 전 번호로 읽어 둔다 → `ontology-edit-yaml`. 입력칸 값에서 정확히 `nodeTypes:` 인 줄을 찾아 그 바로 다음에 들여쓰기 2칸으로 `Fund<suffix>` 타입 블록(label 「펀드」, description, `labelProperty: name`, `name` 속성 string 필수)을 넣고 `fill` 한다. `ontology-preview` → `ontology-diff-added` 에 `nodeTypes.Fund<suffix>` → `ontology-save` → `ontology-message` 가 success. `shot(pageAdmin, '09-ontology-saved')`.
  4. 정리: 2 단계 전에 읽어 둔 번호를 `try/finally` 로 API restore(`confirm: true`)해 되돌린다. 단계가 중간에 실패해도 `Fund<suffix>` 가 남아 다음 실행의 타입 선택지 단언을 깨지 않게 한다. 바뀐 점이 없어 400 이 나면 무시한다.
  3. `pageA` 가 아무 API 를 부르는 동작(검색)을 하면 `ontology-stale` 이 보이고, `ontology-reload` 를 누르면 사라진다. 새 노드 만들기의 타입 선택지에 「펀드」 가 있다.
  4. `pageAdmin` 이 `ontology-history-open` → 2단계에서 읽어 둔 저장 전 번호의 행(`data-version`) → `ontology-restore` → 미리보기의 `ontology-diff-removed` 에 그 타입 → `ontology-save` → success. `shot(pageAdmin, '09-ontology-restored')`.

## 검증

```bash
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
git grep -q "ontology-stale" -- financial-workbench/web/TESTIDS.md
```

- 각 줄은 저장소 루트에서 돈다.
- 브라우저 테스트(`npm run test:e2e`)는 Compose 스택이 있어야 돌아 이 절에 두지 않는다. 코디네이터가 PR 검증 때 돌린다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/routes.ts` | 수정 |
| `financial-workbench/web/src/routes.test.ts` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/OntologyTab.tsx` | 삭제 |
| `financial-workbench/web/src/components/ontology/OntologyTab.tsx` | 신규 |
| `financial-workbench/web/src/components/ontology/OntologyView.tsx` | 신규 |
| `financial-workbench/web/src/components/ontology/OntologyYamlEditor.tsx` | 신규 |
| `financial-workbench/web/src/components/ontology/OntologyPreviewPanel.tsx` | 신규 |
| `financial-workbench/web/src/components/ontology/OntologyHistory.tsx` | 신규 |
| `financial-workbench/web/src/components/ontology/ontology.test.tsx` | 신규 |
| `financial-workbench/web/src/lib/ontologyEdit.ts` | 신규 |
| `financial-workbench/web/src/lib/ontologyEdit.test.ts` | 신규 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/UndefinedTypeProperties.tsx` | 신규 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/src/lib/labels.test.ts` | 수정 |
| `financial-workbench/web/src/lib/changes.test.ts` | 수정 |
| `financial-workbench/web/src/components/RelationshipSection.tsx` | 수정 |
| `financial-workbench/web/src/components/ChangesTab.tsx` | 수정 |
| `financial-workbench/web/src/lib/changes.ts` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 수정 |
| `financial-workbench/web/src/components/ChangesTab.test.tsx` | 수정 |
| `financial-workbench/web/src/components/screens.test.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
