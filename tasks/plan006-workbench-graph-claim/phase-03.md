# Phase 03. 문장 채우기 주장 폼과 두 입구

**Execution profile**: standard

## 목표

주장 만들기 폼을 문장 채우기로 다시 만든다. 관계 종류의 문장 틀이 주체 칸과 대상 칸의 순서를 정하고, 조사는 고른 이름의 끝소리에 맞춰 바뀐다.
주체도 고르기 칸으로 바꾸고 「주체와 대상 바꾸기」 단추를 둔다. 왼쪽 「무엇을 만들까요?」 의 「주장」 과 항목 상세의 「주장 추가」 두 곳에서 폼을 연다.

**범위 외**: Claim 이름과 문장 틀 함수(`claimSentenceParts`, `withJosa`)는 phase 01 이 만들었다. 그래프 접기는 phase 02 다. 새 노드 만들기 폼(`NodeCreateForm`), 관계 추가, 주장 수정 폼(`ClaimEditor`)은 고치지 않는다. `NodePicker` 는 빈 후보 안내에 필요한 만큼만 고친다.

## 컨텍스트

- 지금 폼은 `financial-workbench/web/src/components/ClaimCreateForm.tsx` 다. `Props` 는 `subject: NodeView`, `onCreated: () => void`, `onCancel: () => void` 이다. 주체는 고정 글자로 보이고(106행부터 111행), predicate 는 주체 타입을 받는 것만 고른다(21행부터 24행). predicate 를 바꾸면 맞지 않는 대상을 비운다(40행부터 44행). 제출 검증은 48행부터 60행이고, 서버 오류는 `fieldErrorsOf(e.details)` 로 칸마다 보인다. `form` 요소를 쓰지 않는다. 안에 근거 문서 만들기 폼(`NodeCreateForm`)이 들어간다.
- 지금 폼의 data-testid 는 `claim-add-form`, `claim-predicate-select`, `claim-object-picker-*`, `claim-object-selected`, `claim-doc-picker-*`, `claim-doc-selected`, `claim-doc-create-toggle`, `claim-doc-create-*`, `claim-description`, `claim-evidence`, `claim-valid-from-input`, `claim-valid-to-input`, `claim-add-submit`, `claim-add-error` 다. 모두 그대로 둔다.
- 브라우저 테스트의 도우미 `pick(page, prefix, label)`(`financial-workbench/web/e2e/workbench.spec.ts` 78행)은 `${prefix}-input` 에 쓰고 `${prefix}-search` 를 누른 뒤 `${prefix}-result` 를 고른다.
- `financial-workbench/web/src/components/NodePicker.tsx` 는 `types`, `onPick`, `testIdPrefix`, `placeholder`, `excludeIds` 를 받는다. 검색 결과가 없으면 `${prefix}-empty` 에 「검색 결과가 없습니다.」 를 보인다(60행부터 64행). 검색은 `api.nodes.search({ q, types, size: 10 })` 다. 서버는 `q` 가 비면 조건 없이 찾고 보관된 노드는 뺀다.
- 입구 두 곳.
  - `financial-workbench/web/src/components/SearchPanel.tsx` 의 「무엇을 만들까요?」(`new-node-type`, 179행)는 `creatableTypes(ontology)`(80행)만 보인다. `creatableTypes`(`financial-workbench/web/src/context.ts` 55행)는 `managedBy` 가 있는 Claim 을 뺀다. 고르고 `new-node-button` 을 누르면 `NodeCreateForm` 을 그린다(196행부터 212행). 만든 뒤 `onCreated(node, message)` 로 `Workspace` 가 그 노드를 열고 안내를 띄운다.
  - `financial-workbench/web/src/components/DetailPanel.tsx` 의 「주장 추가」(`claim-add-toggle`, 279행부터 283행)는 `hasClaimPredicates`(122행, 이 항목 타입을 주체로 받는 predicate 가 있는가)일 때 나온다. 누르면 `ClaimCreateForm subject={node}` 를 그린다(284행부터 293행).
- shadcn 부품은 `financial-workbench/web/src/components/ui/` 의 `button`, `input`, `textarea`, `native-select`, `label`, `alert`, `card`, `badge` 다. 선택 칸은 `NativeSelect` 다(HTML 기본 `<select>` 라 브라우저 테스트의 `selectOption` 이 그대로 동작한다). 오류 안내는 `Alert variant="destructive"` 다(`ReviewTab.tsx` 112행).
- 화면 단위 테스트는 `renderToStaticMarkup` 과 `withApp`(`financial-workbench/web/src/components/testSupport.tsx`)으로 그린다. effect 는 돌지 않는다. `testOntology` 의 `claimPredicates.SUPPLIES_TO` 에는 아직 `sentence` 가 없다.
- `financial-workbench/web/src/components/screens.test.tsx` 45행과 46행은 만들기 선택지에 `<option value="Claim">` 이 없다고 단언한다. 이번에 「주장」 선택지가 생기므로 이 단언을 바꾼다.
- 브라우저 테스트 0e(172행부터 203행)는 `new-node-type` 의 선택지를 `['무엇을 만들까요?', '기업', '종목', '산업', '근거 문서']`, 5개로 단언한다.
- 브라우저 테스트의 뒤 단계가 이름으로 좁혀 센다. 3번은 `review-row` 를 `data.supplier` 로 좁혀 1개를 기대하고, 6b 는 `data.docTitle` 의 유일한 근거 주장 하나에 대한 `notice-action` 하나를 누른다. 새 시나리오는 다른 공급사와 다른 근거 문서를 써야 이 두 단계가 깨지지 않는다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주장 만들기 화면」 절, `financial-workbench/docs/data-schema.md` 의 `claimPredicates.<predicate>` 의 `sentence` 행, `financial-workbench/docs/prd.md` 의 범위와 「요구가 충족됐다고 보는 관측」

## 의도 메모

- 주체를 고정하지 않는다. 공급받는 기업의 상세에서 시작해도 「이 기업에 공급하는 기업」 을 만들 수 있게 바꾸기 단추를 둔다.
- predicate 선택지는 주체 타입으로 좁히지 않고 모두 보인다. 주체가 비어 있을 수 있고, 바꾸기 뒤에 주체 타입이 바뀐다. 대신 predicate 를 바꾸거나 맞바꾼 뒤 그 predicate 가 받지 않는 타입의 주체나 대상은 비운다.
- 상세의 `hasClaimPredicates` 조건은 그대로 둔다. 대상으로만 쓰이는 타입(산업)에서 시작하는 입구는 이번에 넓히지 않는다.
- 「먼저 기업을 만드세요」 는 고를 후보가 하나도 없을 때만 보인다. 검색어를 넣고 결과가 없을 때는 지금처럼 「검색 결과가 없습니다.」 다. 후보가 있는지는 고르기 칸이 처음 그려질 때 검색어 없이 한 번 찾아 본다.
- 브라우저 테스트의 이름은 숫자 접미사로 끝나 조사가 「이(가)」 로 남는다. 조사가 바뀌는 것은 단위 테스트의 한글 이름으로 확인한다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. `financial-workbench/web/src/lib/labels.ts` 의 빈 후보 안내

```ts
/** 고를 후보가 하나도 없을 때의 안내. 예: 「먼저 기업을 만드세요」 */
export function createFirstHint(typeLabels: string[]): string
```

`먼저 ${withEulReul(typeLabels.join(', '))} 만드세요` 다.

### 2. `financial-workbench/web/src/components/NodePicker.tsx` 의 `emptyHint`

- `Props` 에 `emptyHint?: string` 을 더한다.
- `emptyHint` 가 있으면 처음 그릴 때와 `types.join(',')` 나 `excludeIds.join(',')` 가 바뀔 때 `api.nodes.search({ q: '', types, size: excludeIds.length + 1 })` 를 한 번 부른다. 반대편 칸을 고르면 `excludeIds` 가 바뀌므로, 기업이 하나뿐일 때도 안내가 맞게 바뀐다. `excludeIds` 를 뺀 결과가 비면 `noCandidates` 를 `true` 로 둔다. 실패하면 조용히 `false` 로 둔다.
- `noCandidates` 면 입력 위에 `<div className="muted small" data-testid={testIdPrefix + '-none'}>{emptyHint}</div>` 를 보인다. 입력과 검색 단추는 그대로 둔다.
- `emptyHint` 를 넘기지 않는 기존 호출(`RelationshipSection.tsx`, 근거 문서 고르기)은 동작이 같다.

### 3. `financial-workbench/web/src/components/ClaimCreateForm.tsx` 다시 쓰기

- `Props` 는 아래다.

  ```ts
  interface Props {
    /** 처음 채울 주체. 상세의 「주장 추가」 는 그 항목을 넘기고, 왼쪽 「무엇을 만들까요?」 는 넘기지 않는다 */
    initialSubject?: NodeView | null
    onCreated: (claim: ClaimView) => void
    onCancel: () => void
  }
  ```
- 상태는 `predicate`, `subject`(`initialSubject ?? null`), `object`, `documents`, `creatingDoc`, `description`, `evidenceText`, `validFrom`, `validTo`, `error`, `fieldErrors`, `busy` 다.
- predicate 의 처음 값은 `initialSubject` 가 있으면 그 타입을 `subjectTypes` 에 담은 첫 predicate, 없으면 `ontology.claimPredicates` 의 첫 키다. predicate 가 하나도 없으면 `null` 을 그린다.
- 순수 함수 `keepAccepted(def: ClaimPredicateDef | undefined, subject: NodeView | null, object: NodeView | null): { subject: NodeView | null; object: NodeView | null }` 를 같은 파일에 export 한다. `def` 의 `subjectTypes` 가 받지 않는 주체와 `objectTypes` 가 받지 않는 대상을 `null` 로 바꾼다.
  - predicate 를 바꾸면 `keepAccepted(새 정의, subject, object)` 로 두 칸을 맞춘다.
  - 바꾸기 단추는 `keepAccepted(지금 정의, object, subject)` 로 두 칸을 맞바꾼다.
- 그리는 순서는 아래다. 칸 이름은 `Label`, 입력은 `Input`, `Textarea`, `NativeSelect`, 단추는 `Button` 이다. 레거시 class(`sub-form`, `field`, `chip`, `error-box`, `primary`)는 쓰지 않는다.
  1. 관계 종류: `NativeSelect`(`data-testid="claim-predicate-select"`)에 모든 predicate 를 `labels.predicate(name)` 으로 보인다. 아래에 `predicateDef.description` 을 흐린 글로 보인다.
  2. 문장: `div[data-testid="claim-sentence"]`(`flex flex-wrap items-center gap-2`) 안에 `claimSentenceParts(ontology, predicate, { subject: subject ? labels.node(subject) : null, object: object ? labels.node(object) : null })` 를 차례로 그린다.
     - 글 조각은 `<span data-testid="claim-sentence-text">{part.text.trim()}</span>` 이다. 다듬어 비면 그리지 않는다.
     - 주체 칸: 고른 주체가 있으면 `div[data-testid="claim-subject-selected"]` 에 `TypeBadge` 와 `labels.node(subject)`, 「다시 고르기」 `Button`(`variant="link"`, 누르면 주체를 비움)을 보인다. 아래 「주체와 대상 바꾸기」 와 헷갈리지 않게 「바꾸기」 라고 쓰지 않는다. 없으면 `NodePicker`(`testIdPrefix="claim-subject-picker"`, `types={predicateDef.subjectTypes}`, `excludeIds={object ? [object.id] : []}`, `emptyHint={createFirstHint(predicateDef.subjectTypes.map(labels.type))}`)다.
     - 대상 칸: 같은 방식으로 `claim-object-selected` 와 `NodePicker`(`testIdPrefix="claim-object-picker"`, `types={predicateDef.objectTypes}`, `excludeIds={subject ? [subject.id] : []}`, `emptyHint` 는 `objectTypes` 로 만든 안내)다.
  3. 문장 아래에 `Button`(`type="button"`, `variant="outline"`, `size="sm"`, `data-testid="claim-swap"`, 「주체와 대상 바꾸기」)을 둔다. 두 칸이 모두 비면 `disabled` 다.
  4. `fieldErrors.subjectId`, `fieldErrors.objectId` 를 문장 아래에 칸 이름과 함께 빨간 글로 보인다.
  5. 근거 문서: 고른 문서 목록(`li[data-testid="claim-doc-selected"]`, 「빼기」), `NodePicker`(`claim-doc-picker`, `types={['Document']}`), 「+ 근거 문서 새로 등록」(`claim-doc-create-toggle`)과 그 자리의 `NodeCreateForm`(`testIdPrefix="claim-doc-create"`)은 지금 동작 그대로다.
  6. 설명(`Textarea`, `claim-description`), 근거 문장(`Textarea`, `claim-evidence`), 시작일과 종료일(`Input type="date"`, `claim-valid-from-input`, `claim-valid-to-input`)과 「유효기간을 모르면 비워 두세요. 「미상」 으로 표시됩니다.」 안내, 각 칸의 오류는 지금과 같은 값과 검증을 쓴다.
  7. 오류 안내는 `Alert variant="destructive" role={undefined} data-testid="claim-add-error"` 다. 저장소의 다른 오류 안내(`ReviewTab.tsx` 112행)와 같이 `role` 을 지운다.
  8. 「주장 만들기」 `Button`(`data-testid="claim-add-submit"`, 저장 중이면 「저장 중…」)과 「취소」 `Button`(`variant="outline"`, `data-testid="claim-add-cancel"`)을 둔다.
- 제출 검증에 아래 한 줄을 더한다. 나머지 검증은 지금과 같다.

  ```ts
  if (!subject) errs.subjectId = `${withEulReul(labels.relationship('SUBJECT'))} 고르세요.`
  ```
- `api.claims.create` 는 `subjectId: subject!.id` 로 보내고, 돌려받은 `ClaimView` 를 `onCreated(claim)` 에 넘긴다.
- 최상위 요소는 `div[data-testid="claim-add-form"]`(`grid gap-3`)이다.

### 4. `financial-workbench/web/src/components/DetailPanel.tsx` 의 입구

`<ClaimCreateForm initialSubject={node} ... />` 로 바꾼다. `onCreated` 는 인자를 받지 않던 지금 동작(폼을 닫고 「주장을 만들었습니다. 다른 편집자의 검토를 기다립니다.」 안내)을 그대로 한다. 「주장 추가」 단추와 `hasClaimPredicates` 는 그대로다.

### 5. `financial-workbench/web/src/components/SearchPanel.tsx` 의 「주장」 선택지

- `const claimType = Object.keys(ontology.nodeTypes).find((t) => ontology.nodeTypes[t].managedBy === 'claims')` 를 둔다. `claimType` 이 있고 `Object.keys(ontology.claimPredicates).length > 0` 일 때만 `new-node-type` 의 끝에 `<option value={claimType}>{labels.type(claimType)}</option>` 를 더한다.
- `creating` 이고 `createType === claimType` 이면 `NodeCreateForm` 대신 아래를 그린다. 제목(`새 {labels.type(claimType)}`)과 설명은 지금 모양을 쓴다.

  ```tsx
  <ClaimCreateForm
    onCancel={() => setCreating(false)}
    onCreated={(claim) => {
      setCreating(false)
      onCreated(claim, `「${labels.node(claim)}」 ${withEulReul(labels.type(claim.type))} 만들었습니다. 다른 편집자의 검토를 기다립니다.`)
      void run()
    }}
  />
  ```
- `select` 와 「새로 만들기」 단추의 모양은 바꾸지 않는다.

### 6. `financial-workbench/web/src/components/testSupport.tsx`

`testOntology.claimPredicates.SUPPLIES_TO` 에 `sentence: '{subject}이(가) {object}에 공급한다'` 를 더한다.

### 7. `financial-workbench/web/TESTIDS.md`

- 「작업 공간: 왼쪽」 절의 `new-node-type` 행에 「값 `Claim` 을 고르면 주장 만들기 폼(`claim-add-form`)이 열린다」 를 적는다.
- 「작업 공간: 오른쪽 상세」 절에 행을 더하고 고친다. `claim-add-toggle, claim-add-form` 은 「주장 추가」 와 주장 만들기 폼(왼쪽 「주장」 선택지에서도 열린다), `claim-sentence` 와 `claim-sentence-text` *(문장 틀의 칸 사이 글), `claim-subject-picker-*` 와 `claim-subject-selected`(주체 고르기, 고른 주체), `claim-object-picker-*` 와 `claim-object-selected`(대상 고르기, 고른 대상), `claim-swap`(「주체와 대상 바꾸기」), `claim-add-cancel`(취소).
- 「노드 고르기(NodePicker)」 절의 접두사 목록에 `claim-subject-picker` 를 더하고, `<p>-none` 행(고를 후보가 하나도 없을 때 「먼저 기업을 만드세요」 같은 안내)을 더한다.

### 8. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/components/ClaimCreateForm.test.tsx` 신규. `renderToStaticMarkup(withApp(...))` 로 그린다. 주체 fixture 는 `{ id: 's1', type: 'Company', label: '가나전자', ... } as NodeView` 다.
  1. `initialSubject` 를 주면 `data-testid="claim-subject-selected"` 가 `가나전자` 를 담고, 그 위치가 `claim-object-picker-input` 보다 앞이며, `claim-object-picker-input` 은 `에 공급한다` 보다 앞이다(`html.indexOf` 비교). `data-testid="claim-sentence-text">가</span>` 를 담는다.
  2. `initialSubject` 없이 그리면 `claim-subject-picker-input` 이 `claim-object-picker-input` 보다 앞이고 `>이(가)</span>` 를 담는다.
  3. `<select[^>]*data-testid="claim-predicate-select"` 에 맞고 `data-slot="native-select"` 를 담는다. `data-testid="claim-swap"` 와 `data-testid="claim-add-cancel"` 를 담는다. `class="sub-form"` 은 담지 않는다.
  4. `keepAccepted`: Company 만 받는 정의에 Sector 주체와 Company 대상을 넘기면 주체만 `null` 이다. 정의가 `undefined` 면 둘 다 그대로다.
- `financial-workbench/web/src/lib/labels.test.ts`: `createFirstHint(['기업'])` 는 `먼저 기업을 만드세요`, `createFirstHint(['기업', '종목'])` 은 `먼저 기업, 종목을 만드세요` 다.
- `financial-workbench/web/src/components/screens.test.tsx`: 45행과 46행을 「Claim 은 전용 API 로 만들지만 주장 폼을 여는 선택지로 나온다」 로 바꾸고 `<option value="Claim">주장</option>` 을 담는지 단언한다.
- `financial-workbench/web/e2e/workbench.spec.ts`
  - `data` 에 아래 값을 더한다. 앞의 `data` 값과 겹치지 않고, 어느 값도 `data.supplier` 나 `data.evidence` 를 담지 않는다.

    ```ts
    supplier2: `가상소재-${suffix}`,
    docTitle2: `가상소재 감사보고서-${suffix}`,
    docUrl2: `https://example.com/financial-workbench/${suffix}/2`,
    description2: `가상소재-${suffix} 이 가상전자-${suffix} 에 소재를 공급한다.`,
    evidence2: `가상소재-${suffix} 의 주요 매출처는 가상전자-${suffix} 이다.`,
    ```
  - 0e: 선택지 기대값을 `['무엇을 만들까요?', '기업', '종목', '산업', '근거 문서', '주장']`, 개수를 6 으로 바꾼다. 끝에 `selectOption('Claim')` 과 `new-node-button` 을 누르면 `claim-add-form` 이 보이고 `claim-subject-picker-input` 과 `claim-object-picker-input` 이 보인다. `claim-add-cancel` 로 닫는다.
  - 2번 테스트는 고치지 않는다. 공급사 상세에서 열면 주체가 채워져 있어 지금 순서 그대로 통과해야 한다. 바꿔야 통과하면 폼이 입구의 주체를 받지 못한 것이다.
  - 2번 뒤에 「2b) A 가 고객사 상세에서 「주체와 대상 바꾸기」 로 공급 주장을 만든다」 를 더한다.
    1. `createNode` 로 `data.supplier2` 기업과 `data.docTitle2` 문서(2번의 문서와 같은 속성 모양, `url` 은 `data.docUrl2`)를 만든다.
    2. `searchAndOpen(pageA, data.customer)` 뒤 `claim-add-toggle` 을 누른다. `claim-subject-selected` 가 `data.customer` 를 담는다.
    3. `claim-predicate-select` 에서 `SUPPLIES_TO` 를 고르고 `claim-swap` 을 누른다. `claim-object-selected` 가 `data.customer` 를 담고 `claim-subject-selected` 는 0개다.
    4. `pick(pageA, 'claim-subject-picker', data.supplier2)` 뒤 `claim-subject-selected` 가 `data.supplier2` 를 담는다. `claim-sentence` 가 `에 공급한다` 를 담는다.
    5. `pick(pageA, 'claim-doc-picker', data.docTitle2)`, `claim-description` 에 `data.description2`, `claim-evidence` 에 `data.evidence2` 를 넣고 `claim-add-submit` 을 누른다.
    6. `detail-notice` 의 `data-kind` 가 `success` 다. `node-claims-section` 의 `claim-card` 를 `data.evidence2` 로 좁히면 `claim-subject` 가 `data.supplier2`, `claim-object` 가 `data.customer` 를 담는다. `shot(pageA, '02b-claim-from-object')` 를 남긴다.
  - 2b 뒤에 「2c) A 가 왼쪽 「무엇을 만들까요?」 에서 주장을 만든다」 를 더한다. 왼쪽 입구의 성공 경로(`SearchPanel` 의 `onCreated` 에서 `Workspace` 가 주장을 열고 안내를 띄우는 것)를 확인한다.
    1. `tab-workspace` 를 누르고 `new-node-type` 에서 `Claim` 을 고른 뒤 `new-node-button` 을 누른다.
    2. `claim-predicate-select` 에서 `COMPETES_WITH` 를 고른다. `pick(pageA, 'claim-subject-picker', data.supplier2)`, `pick(pageA, 'claim-object-picker', data.customer)` 로 두 칸을 고른다.
    3. `pick(pageA, 'claim-doc-picker', data.docTitle2)`, `claim-description` 에 `` `${data.supplier2} 와 ${data.customer} 가 같은 시장에서 경쟁한다.` ``, `claim-evidence` 에 `data.evidence2` 를 넣고 `claim-add-submit` 을 누른다.
    4. `detail-notice` 의 `data-kind` 가 `success` 이고, `detail-panel` 의 `data-node-type` 이 `Claim` 이며, `detail-label` 이 `` `${data.supplier2} → ${data.customer} 경쟁한다` `` 다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/components/ClaimCreateForm.test.tsx src/lib/labels.test.ts src/components/screens.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
! grep -n 'className="sub-form"' financial-workbench/web/src/components/ClaimCreateForm.tsx
grep -q 'claim-swap' financial-workbench/web/TESTIDS.md
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan006 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan006 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 두 project 가 모두 통과해야 한다. 2번 테스트가 고치지 않고 통과하면 상세 입구가 주체를 채운다는 근거이고, 2b 가 통과하면 바꾸기와 주체 고르기가, 2c 가 통과하면 왼쪽 입구로 만든 주장이 열리고 안내가 뜬다는 근거다.
- `02b-claim-from-object.png` 를 보고 폼이 shadcn 부품 모양이고 문장 순서가 「주체 칸, 이(가), 대상 칸, 에 공급한다」 인지 눈으로 본다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/lib/labels.ts` | 수정 |
| `financial-workbench/web/src/lib/labels.test.ts` | 수정 |
| `financial-workbench/web/src/components/NodePicker.tsx` | 수정 |
| `financial-workbench/web/src/components/ClaimCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/components/ClaimCreateForm.test.tsx` | 신규 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/SearchPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/testSupport.tsx` | 수정 |
| `financial-workbench/web/src/components/screens.test.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
