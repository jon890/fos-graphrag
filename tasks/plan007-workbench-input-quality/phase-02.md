# Phase 02. 만들기 폼 입력 도움과 구분 정보

**Execution profile**: standard

## 목표

새 노드 만들기 폼이 같은 이름을 저장 전에 경고하고, 주소에 `https://` 를 붙이고, 필수 시각을 지금 시각으로 채우고, 종목을 만들며 발행 기업을 잇게 한다.
검색 결과와 고르기 후보와 같은 이름 경고에 구분 정보(`hintProperties` 의 값과 만든 날)를 보인다.
목록에 없는 예전 값이 남은 칸은 선택지로 보여, 그 칸을 바꾸지 않으면 다른 칸을 저장할 수 있게 한다.

**범위 외**: 노드 편집 409 때 입력 지키기는 phase 03 이다. 이 phase 는 `NodeEditForm.tsx` 의 409 처리와 `DetailPanel.tsx` 의 `fail()` 을 고치지 않는다. 주장 만들기 폼(`ClaimCreateForm.tsx`)은 근거 문서 등록 폼에 넘기는 prop 하나만 고친다.

## 컨텍스트

- 서버 온톨로지(앞 phase 결과): Company `country` 와 Security `currency` 는 enum 이다. 노드 타입마다 `hintProperties`(Company `[country]`, Security `[market, ticker]`, Sector `[scheme, code]`, Document `[publisher, publishedAt]`)가 있다. `relationshipTypes.ISSUES.createPicker` 는 `{ label: '발행 기업', description: ... }` 다. 속성에 `valueAliases` 가 있을 수 있다. 화면은 별칭을 쓰지 않는다.
- 웹 계약 타입은 `financial-workbench/web/src/api/types.ts` 의 `PropertyDef`, `NodeTypeDef`, `RelationshipTypeDef` 다. `NodeView` 는 `id`, `type`, `label`, `properties`, `createdAt` 등을 가진다.
- 입력 변환은 `financial-workbench/web/src/lib/formValues.ts` 다.
  - `fromInputValue(def, raw)` 는 빈 값이면 `null`(필수면 오류)이고, `url` 은 `default` 갈래에서 길이만 본다.
  - `buildPatchProperties(defs, original, values)` 는 모든 칸을 `fromInputValue` 로 바꾸므로, 저장된 값이 목록 밖인 enum 칸은 `'허용된 값이 아닙니다.'` 오류를 내서 다른 칸 저장까지 막는다.
  - `initialFormValues(defs, properties)` 는 만들기와 편집이 함께 쓴다.
- 속성 입력칸은 `financial-workbench/web/src/components/PropertyFields.tsx` 다. enum 은 `<select>` 에 `''` 선택지와 `def.values` 를 그리고, `url` 은 `type="url"` 이라 브라우저가 `scheme://` 없는 값을 제출 전에 막는다.
- 만들기 폼은 `financial-workbench/web/src/components/NodeCreateForm.tsx` 다. `Props` 는 `type`, `onCreated(node)`, `onCancel()`, `testIdPrefix` 다. `buildCreateProperties` 로 바꾼 뒤 `api.nodes.create(type, properties)` 를 부르고, 오류는 `${prefix}-error` 와 칸별 `fieldErrorsOf` 로 보인다.
  - 쓰는 곳은 둘이다. 왼쪽 검색 패널(`financial-workbench/web/src/components/SearchPanel.tsx`, `testIdPrefix="create"`)과 주장 만들기 폼의 「근거 문서 새로 등록」(`financial-workbench/web/src/components/ClaimCreateForm.tsx`, `testIdPrefix="claim-doc-create"`)이다. 화면 테스트 `financial-workbench/web/src/components/screens.test.tsx` 도 `onCreated`, `onCancel` 만 넘겨 그린다. 새 prop 은 모두 선택으로 둔다.
  - `SearchPanel` 의 `onCreated` 는 `onCreated(node, \`「${labels.node(node)}」 ${withEulReul(labels.type(node.type))} 만들었습니다.\`)` 로 부모에 넘긴다. 부모 `financial-workbench/web/src/components/Workspace.tsx` 는 `setFlash({ id: node.id, text: message })` 뒤 그 노드를 연다. `DetailPanel` 은 `flash` 를 받아 첫 `useEffect` 에서 `{ kind: 'success', text: flash.text }` 안내로 바꾼다.
- 노드 고르기는 `financial-workbench/web/src/components/NodePicker.tsx` 다. 후보 한 줄은 `${prefix}-result` 단추이고 `TypeBadge` 와 `labels.node(n)` 를 보인다. 검색 결과 한 줄은 `SearchPanel` 의 `search-result` 단추이고 이름은 `.result-label` 안에 있다. 브라우저 테스트의 `searchResult()` 도우미가 `.result-label` 의 정확한 글자로 고르므로 구분 정보는 `.result-label` 밖에 둔다.
- 관계 API 는 `api.relationships.create(type, fromId, toId)`(`financial-workbench/web/src/api/client.ts`)다. 검색은 `api.nodes.search({ q, types, size })` 이고 `size` 최댓값은 100 이다. 서버는 `q` 를 소문자로 바꿔 `searchText` 에서 부분 일치로 찾고 보관된 노드는 뺀다.
- 표시 이름 함수는 `financial-workbench/web/src/lib/labels.ts`(`valueLabel(o, type, prop, value)` 등)와 `financial-workbench/web/src/context.ts` 의 `useLabels()` 다. 웹 코드에는 타입, 속성 이름을 적지 않는다(`financial-workbench/docs/code-architecture.md` 「웹 구조」). 구분 정보도 `hintProperties` 로만 정한다.
- 날짜 표시는 `financial-workbench/web/src/lib/format.ts` 의 `formatDateTime(iso)` 이다. 날짜만 보이는 함수는 아직 없다.
- 컴포넌트 테스트는 `renderToStaticMarkup` 로 정적 HTML 만 본다. 누르기 같은 동작은 순수 함수 테스트와 브라우저 테스트로 확인한다. 테스트 온톨로지는 `financial-workbench/web/src/components/testSupport.tsx` 의 `testOntology` 다. Company 의 `country` 가 아직 `string` 이고 `relationshipTypes.ISSUES` 가 있다.
- 브라우저 테스트 `financial-workbench/web/e2e/workbench.spec.ts` 의 `createNode(page, type, label, props)` 도우미는 `create-prop-<속성>` 입력칸을 채우고 `create-submit` 을 누른 뒤 성공 안내를 기다린다. `1)` 테스트가 기업 둘과 종목을 만들고 종목 상세의 관계 추가로 `ISSUES` 를 잇는다. 이 경로는 그대로 둔다. 데이터 이름은 실행마다 다른 접미사가 붙어 같은 이름이 생기지 않는다.
- `financial-workbench/web/TESTIDS.md` 가 e2e 가 쓰는 testid 를 표로 적는다. 「작업 공간: 왼쪽」 과 「노드 고르기(NodePicker)」 절에 더한다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「노드 만들기」 절, `financial-workbench/docs/data-schema.md` 의 「만들기 폼과 구분 정보」, 「예전 값 정리」 절, `financial-workbench/docs/prd.md` 의 「남은 한계」, `financial-workbench/docs/code-architecture.md` 「결정」 의 같은 이름과 발행 기업 항목

## 의도 메모

- 같은 이름을 서버 유일성 제약으로 막는 안은 버렸다. 이름이 같은 다른 기업이 실제로 있을 수 있다(사용자 결정 2026-10-21).
- 같은 이름 검사가 실패해도(검색 오류) 저장은 막지 않는다. 검사는 돕는 기능이다.
- 발행 기업 관계를 노드 생성 API 에 함께 싣는 안은 버렸다. 생성 계약과 검증이 커진다. 관계만 실패하면 종목은 남기고 안내한다.
- 편집 폼의 `buildPatchProperties` 는 입력칸 문자열이 원래 값의 입력칸 문자열과 같으면 변환과 검사를 건너뛴다. 목록 밖 예전 값이나 비어 있는 필수 칸이 남아도 다른 칸을 저장할 수 있게 하려는 것이다. 바뀐 칸만 보내는 지금 동작은 그대로다.
- 주소 앞에 붙이는 것은 `https://` 다. `http://` 로 적으면 그대로 둔다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. `financial-workbench/web/src/api/types.ts`

- `PropertyDef` 에 `/** enum 값의 예전 표기. 서버가 시작할 때 쓰고 화면은 쓰지 않는다 */ valueAliases?: Record<string, string[]>` 를 더한다.
- `NodeTypeDef` 에 `/** 이름 옆에 함께 보일 속성. 같은 이름의 항목을 구분하게 한다 */ hintProperties?: string[]` 를 더한다.
- 새 타입 `CreatePickerDef { label: string; description?: string | null }` 를 두고 `RelationshipTypeDef` 에 `/** 끝(to) 타입 만들기 폼에 시작(from) 노드를 고르는 칸 */ createPicker?: CreatePickerDef | null` 을 더한다.

### 2. `financial-workbench/web/src/lib/formValues.ts`

- `fromInputValue` 에 `case 'url':` 을 더한다. `^[a-z][a-z0-9+.-]*://` (대소문자 무시)로 시작하지 않으면 앞에 `https://` 를 붙이고, 그 뒤 길이 검사는 `default` 와 같다.
- `buildPatchProperties` 의 반복 맨 앞에서 `(values[name] ?? '') === toInputValue(def, original[name])` 이면 `continue` 한다. 주석에 「바꾸지 않은 칸은 검사하지 않는다. 목록 밖 예전 값이 남아도 다른 칸을 저장할 수 있다」 를 적는다.
- 새 함수를 둔다.

  ```ts
  /** 새 노드 폼의 처음 값. 필수 datetime 칸은 지금 시각(로컬, 분 단위)으로 채운다 */
  export function initialCreateValues(defs: Record<string, PropertyDef>, now: Date = new Date()): FormValues
  ```
  값은 `initialFormValues(defs)` 에 필수 `datetime` 입력칸만 `isoToLocalInput(now.toISOString())` 으로 덮은 것이다.

### 3. `financial-workbench/web/src/lib/format.ts` 와 `financial-workbench/web/src/lib/labels.ts`

- `format.ts` 에 `/** 날짜만 보인다. 형식이 아니면 그대로 */ export function formatDate(iso: string | null | undefined): string` 을 둔다. 비면 `'-'`, 아니면 `toLocaleDateString('ko-KR')` 다.
- `labels.ts` 에 구분 정보와 같은 이름 판정을 둔다.

  ```ts
  /** hintProperties 의 표시 값과 만든 날을 「 · 」 로 잇는다. 값이 빈 속성은 뺀다. 예: 「대한민국 (KR) · 2026. 10. 21.」 */
  export function nodeHint(o: Ontology, node: Pick<NodeView, 'type' | 'properties' | 'createdAt'>): string
  /** 앞뒤 공백을 지우고 연속 공백을 하나로 줄이고 소문자로 바꿔 같으면 같은 이름이다 */
  export function sameName(a: string, b: string): boolean
  ```
  표시 값은 `valueLabel(o, type, prop, value)` 이고 `date` 속성은 저장된 문자열 그대로다. 만든 날은 `formatDate(node.createdAt)` 다.
- `context.ts` 의 `useLabels()` 반환에 `hint: (node) => nodeHint(ontology, node)` 를 더한다.

### 4. `financial-workbench/web/src/components/PropertyFields.tsx`

- `url` 입력은 `type="text"` 와 `inputMode="url"`, `autoComplete="url"` 로 바꾼다. 브라우저 형식 검사가 `https://` 붙이기보다 먼저 막지 않게 하려는 것이다.
- enum 의 `<select>` 는 `value` 가 비어 있지 않고 `def.values` 에 없으면 마지막 선택지로 `<option value={value} data-testid={\`${id}-unlisted\`}>목록에 없는 값: {value}</option>` 를 더한다.

### 5. `financial-workbench/web/src/components/NodeCreateForm.tsx`

- `Props` 에 선택 prop 둘을 더한다.

  ```ts
  /** 같은 이름 경고의 후보를 누를 때. 없으면 후보에 단추가 없다 */
  onUseExisting?: (node: NodeView) => void
  /** 그 단추의 글자. 기본 「열기」 */
  useExistingLabel?: string
  ```
  `onCreated` 는 `(node: NodeView, linkError?: string) => void` 로 바꾼다. `linkError` 는 시작 노드 관계만 실패했을 때의 이유다. 기존 호출부는 둘째 인자를 받지 않아도 컴파일된다.
- 처음 값은 `initialCreateValues(defs)` 다.
- 시작 노드 고르기 칸: `Object.entries(ontology.relationshipTypes)` 가운데 `createPicker` 가 있고 `to` 에 이 `type` 이 든 관계마다 `PropertyFields` 아래에 칸 하나를 그린다.
  - 칸 제목은 `createPicker.label`, 도움말은 `createPicker.description` 이다. 고르지 않아도 된다.
  - 고르기 전에는 `NodePicker`(`types={rel.from}`, `testIdPrefix={\`${testIdPrefix}-link-${relType}-picker\`}`)를, 고른 뒤에는 `div[data-testid="${testIdPrefix}-link-${relType}-selected"]` 에 `TypeBadge`, 이름, 「다시 고르기」 단추(`${testIdPrefix}-link-${relType}-clear`)를 보인다.
- 저장 순서
  1. `buildCreateProperties` 의 칸 오류가 있으면 지금처럼 멈춘다.
  2. 같은 이름 검사: `confirmedName`(「그래도 만들기」 를 누른 이름) 상태와 지금 이름(`values[labelProperty]`)이 `sameName` 이 아니면 `api.nodes.search({ q: 이름, types: [type], size: 100 })` 를 부르고 `items` 가운데 `sameName(n.label, 이름)` 인 것을 `duplicates` 상태에 넣는다. 하나 이상이면 저장하지 않고 멈춘다. 검색이 실패하면 검사 없이 3 으로 간다.
  3. `api.nodes.create(type, properties)` 뒤 고른 시작 노드마다 `api.relationships.create(relType, picked.id, created.id)` 를 차례로 부른다. 관계가 실패하면 그 오류의 `errorMessage(e)` 를 `linkError` 로 모은다(여럿이면 줄바꿈으로 잇는다). 생성은 성공했으므로 `onCreated(created, linkError)` 를 부른다.
  - 이름 칸(`labelProperty`)을 고치면 `duplicates` 를 비우고 `confirmedName` 을 지운다.
- 같은 이름 경고: `duplicates` 가 있으면 `div[data-testid="${testIdPrefix}-duplicate"][role="status"]` 에 「같은 이름의 {타입 이름}이(가) 이미 있습니다.」 와 후보 목록을 보인다. 조사는 `labels.ts` 의 조사 함수(`withJosa(word, '이(가)')`)를 쓴다.
  - 후보 한 줄은 `li[data-testid="${testIdPrefix}-duplicate-item"][data-node-id]` 이고, `TypeBadge`, `labels.node(n)`, `labels.hint(n)`, `onUseExisting` 이 있으면 `useExistingLabel ?? '열기'` 단추(`${testIdPrefix}-duplicate-open`)다.
  - 목록 아래 「그래도 만들기」 단추(`${testIdPrefix}-duplicate-confirm`)는 `confirmedName` 을 지금 이름으로 두고 저장을 다시 시작한다.

### 6. `SearchPanel.tsx`, `NodePicker.tsx`, `ClaimCreateForm.tsx`, `Workspace.tsx`, `DetailPanel.tsx`

- `SearchPanel`
  - `search-result` 단추 안, `.result-label` 다음에 `<span className="result-hint" data-testid="search-result-hint">{labels.hint(n)}</span>` 를 둔다.
  - `NodeCreateForm` 에 `onUseExisting={(n) => { setCreating(false); onFocus(n.id) }}` 를 넘긴다.
  - `onCreated` 에 넘기는 안내: `linkError` 가 없으면 지금 문장 그대로이고 `kind` 는 `'success'` 다. 있으면 「「이름」 {타입}을(를) 만들었지만 {관계의 createPicker.label}을(를) 잇지 못했습니다. 상세의 관계 추가로 다시 이으세요. ({linkError})」 이고 `kind` 는 `'error'` 다. 이를 위해 `Props.onCreated` 를 `(node: NodeView, message: string, kind?: 'success' | 'error') => void` 로 바꾼다. 관계 이름은 이 타입을 끝으로 받는 `createPicker` 관계의 `label` 을 쓴다.
- `Workspace` 의 `flash` 상태에 `kind?: 'success' | 'error'` 를 더하고 `onCreated` 의 셋째 인자를 담는다. `DetailPanel` 의 `flash` prop 타입도 같게 바꾸고, 첫 `useEffect` 가 `{ kind: flash.kind ?? 'success', text: flash.text }` 로 안내를 만든다.
- `NodePicker` 의 `${prefix}-result` 단추 안, 이름 뒤에 `<span className="result-hint" data-testid={\`${testIdPrefix}-result-hint\`}>{labels.hint(n)}</span>` 를 둔다.
- `ClaimCreateForm` 의 「근거 문서 새로 등록」 `NodeCreateForm`(`testIdPrefix="claim-doc-create"`)에 `onUseExisting` 과 `useExistingLabel="이 문서 고르기"` 를 넘긴다. `onUseExisting` 은 그 문서를 고른 문서 목록에 더하고 등록 폼을 닫는다. 지금 `onCreated` 가 새 문서를 목록에 더하는 코드와 같은 함수를 쓴다.
- `.result-hint` 는 작은 회색 글자다. 지금 화면이 쓰는 `muted small` 과 같은 색과 크기를 Tailwind class(`text-xs text-muted-foreground`)로 준다. 결과 줄이 좁으면 줄바꿈되게 한다.

### 7. `financial-workbench/web/TESTIDS.md`

- 「작업 공간: 왼쪽」 표에 `search-result-hint`, `create-prop-<속성>-unlisted`, `create-duplicate`, `create-duplicate-item` *, `create-duplicate-open`, `create-duplicate-confirm`, `create-link-<관계>-picker-*`, `create-link-<관계>-selected`, `create-link-<관계>-clear` 를 더한다. 같은 접미사가 `claim-doc-create-` 접두사에도 생긴다고 적는다.
- 「노드 고르기(NodePicker)」 표에 `<p>-result-hint` * 를 더하고 접두사 목록에 `create-link-ISSUES-picker` 를 더한다.

### 8. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/lib/formValues.test.ts`
  - `url` 정의(`{ type: 'url', required: true, maxLength: 2000 }`)로 `'example.com/a'` 가 `'https://example.com/a'`, `'http://example.com'` 과 `'HTTPS://x.io'` 는 그대로, `'   '` 은 필수 오류다.
  - `buildPatchProperties` 에서 원래 값이 목록 밖인 enum 칸(`{ en: 'KOR' }`, 입력도 `'KOR'`)과 바꾼 문자열 칸이 함께 있으면 오류 없이 바꾼 칸만 담긴다. 같은 칸을 `'NYSE'` 로 바꾸면 그 값이 담긴다.
  - `initialCreateValues` 에 `new Date('2026-10-21T03:04:00Z')` 를 넘기면 필수 `datetime` 입력칸이 `isoToLocalInput('2026-10-21T03:04:00Z')` 이고, 필수가 아닌 `datetime` 입력칸은 `''` 이다.
- `financial-workbench/web/src/lib/labels.test.ts`
  - `nodeHint(testOntology, { type: 'Company', properties: { country: 'KR' }, createdAt: '2026-10-21T00:00:00Z' })` 가 `대한민국 (KR) · ` 로 시작한다. 속성이 비면 만든 날만이다. `hintProperties` 가 없는 타입(`Person`)도 만든 날만이다.
  - `sameName(' 가나 전자 ', '가나  전자')` 는 참, `sameName('ABC', 'abc')` 는 참, `sameName('가나', '가나전자')` 는 거짓이다.
- `financial-workbench/web/src/components/testSupport.tsx`: Company 의 `country` 를 `{ type: 'enum', label: '국가', required: false, values: ['KR', 'US'], valueLabels: { KR: '대한민국 (KR)', US: '미국 (US)' }, description: '기업이 등록된 나라' }` 로, Company 에 `hintProperties: ['country']`, Security 에 `hintProperties: ['market']` 를, `ISSUES` 에 `createPicker: { label: '발행 기업' }` 을 더한다.
- `financial-workbench/web/src/components/screens.test.tsx` 에 테스트를 더한다.
  - 종목 만들기 폼(`<NodeCreateForm type="Security" ... />`)에 「발행 기업」 과 `create-link-ISSUES-picker-input` 이 있고, 기업 폼에는 없다.
  - 저장된 값이 목록 밖인 enum 칸: `<PropertyFields defs={Company 속성} values={{ name: 'x', country: 'KOR' }} testIdPrefix="edit-prop" onChange={() => {}} />` 에 `목록에 없는 값: KOR` 와 `edit-prop-country-unlisted` 가 있다. `country: 'KR'` 이면 없다.
  - 근거 문서 폼의 `url` 입력칸이 `type="url"` 이 아니라 `inputmode="url"` 을 가진다. `testOntology` 의 Document 에 `url` 속성(`{ type: 'url', label: '주소', required: true }`)을 더해 확인한다. 더한 속성 때문에 기존 테스트의 기대값이 바뀌면 그 기대값도 고친다.
- `financial-workbench/web/e2e/workbench.spec.ts` 의 `1)` 다음에 `1b)` 를 더한다.
  - 제목: `1b) 같은 이름은 저장 전에 경고하고, 종목을 만들며 고른 발행 기업이 이어진다`.
  - `pageA` 로 `tab-workspace`, `new-node-type` 에서 `Company`, `create-prop-name` 에 `data.supplier` 를 넣고 `create-submit` 을 누른다. `create-duplicate` 가 보이고 `create-duplicate-item` 이 하나이며 「대한민국 (KR)」 을 담는다. `create-duplicate-open` 을 누르면 `detail-label` 이 `data.supplier` 다. `shot(pageA, '01b-duplicate')` 를 남긴다.
  - 다시 기업 폼을 열어 같은 이름을 넣고 `create-duplicate-confirm` 을 누르면 성공 안내가 나온다. `search-input` 에 `data.supplier` 를 넣고 `search-submit` 을 누르면 `search-result` 가운데 `.result-label` 이 `data.supplier` 인 것이 둘이며, 각 줄의 `search-result-hint` 가 비어 있지 않다. 만든 두 번째 기업은 `node-archive-button` 으로 보관해 뒤 테스트의 검색과 고르기에 섞이지 않게 한다.
  - 종목 폼을 열어 `market` `KRX_KOSDAQ`, `ticker` 는 `data.ticker` 와 다른 값, `name` 은 새 이름, `currency` `USD` 를 넣고 `create-link-ISSUES-picker-input` 에 `data.customer` 를 넣어 `create-link-ISSUES-picker-search`, 그 결과(`create-link-ISSUES-picker-result`, `hasText: data.customer`)를 누른다. `create-link-ISSUES-selected` 에 `data.customer` 가 보인다. `create-submit` 뒤 성공 안내가 나오고 상세의 `relationship-row`(`hasText: data.customer`)가 `data-rel-type="ISSUES"` 다. `shot(pageA, '01b-issuer-linked')` 를 남긴다.
  - `data` 객체에 새 종목 이름과 종목 코드를 더한다. 이름은 다른 값과 같은 방식으로 접미사를 붙인다.
- 위 브라우저 테스트가 쓰는 테스트 데이터 이름에 다른 테스트가 기대는 개수(예: `4)` 의 `graph-node` 개수)가 바뀌지 않는지 확인한다. 새 종목은 고객사와 `ISSUES` 로 이어지므로 고객사 주변 그래프에 노드가 하나 늘어난다. `4)` 이후 테스트가 고객사 주변 노드 개수를 세면 기대값을 고치고, 고친 줄과 이유를 커밋 메시지에 적는다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/formValues.test.ts src/lib/labels.test.ts src/components/screens.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
grep -q 'inputMode="url"' financial-workbench/web/src/components/PropertyFields.tsx
grep -q 'create-duplicate-confirm' financial-workbench/web/TESTIDS.md
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan007 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan007 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 두 project 가 모두 통과해야 한다.
- `01b-duplicate.png` 에서 경고와 후보의 구분 정보가 겹치지 않고, `01b-issuer-linked.png` 에서 발행 관계가 상세에 보이는지 눈으로 본다. 휴대폰 폭의 `mobile` 스크린샷에서 검색 결과의 구분 정보가 줄을 넘쳐 가로 스크롤을 만들지 않는지 본다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/lib/formValues.ts` | 수정 |
| `financial-workbench/web/src/lib/formValues.test.ts` | 수정 |
| `financial-workbench/web/src/lib/format.ts` | 수정 |
| `financial-workbench/web/src/lib/labels.ts` | 수정 |
| `financial-workbench/web/src/lib/labels.test.ts` | 수정 |
| `financial-workbench/web/src/context.ts` | 수정 |
| `financial-workbench/web/src/components/PropertyFields.tsx` | 수정 |
| `financial-workbench/web/src/components/NodeCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/components/SearchPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/NodePicker.tsx` | 수정 |
| `financial-workbench/web/src/components/ClaimCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/components/Workspace.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/src/components/screens.test.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
