# Phase 04. 전역 ＋ 추가 메뉴와 만들기 창, 따라하기 연결

**Execution profile**: deep

## 목표

항목 만들기를 머리글의 「＋ 추가」 하나로 모은다. 타입 메뉴, 단계 표시가 있는 만들기 창, 그래프의 둥근 ＋ 단추, 개념 지도의 「＋ {타입} 추가」 를 만들고, 검색 칸 아래의 만들기 칸(`create-box`)을 없앤다. 첫 접속 가이드의 따라하기가 「＋ 추가」 에서 시작하게 맞춘다.

**범위 외**: 검색 칩과 고급 필터(Phase 05). 상세 읽기 카드와 「＋ 연결 추가」, 「＋ 주장 추가」(Phase 06). 화면 문구 전체 점검(Phase 07).

## 컨텍스트

- 지금 만들기의 유일한 입구는 `financial-workbench/web/src/components/SearchPanel.tsx` 아래의 `create-box` 다. `new-node-type` select 와 `new-node-button` 으로 타입을 고르고, 같은 칸에 `NodeCreateForm`(`testIdPrefix="create"`) 이나 `ClaimCreateForm` 을 그린다. 만든 뒤 `onCreated(node, message, kind)` 로 `Workspace` 의 `flash` 를 채우고 `onFocus(node.id)` 를 부른다. 관계만 실패했을 때의 안내 문장(`createPicker.label` 을 쓴 「…을(를) 잇지 못했습니다」)도 여기 있다.
- 첫 접속 가이드의 미리 채우기는 `useGuide()` 의 `prefill`, `consumePrefill()`, `cancelForm()`, `report()` 다. 기업과 근거 문서 단계는 `SearchPanel` 이 `prefill.type` 을 보고 폼을 저절로 연다. 주장 단계는 `DetailPanel` 이 연다(이 phase 에서 바꾸지 않는다). 가이드 단계 정의는 `src/lib/guide.ts` 의 `practiceSteps` 이고 말풍선은 `src/components/guide/GuideBubble.tsx` 가 `step.target` testid 로 대상을 찾는다.
- `NodeCreateForm`(`src/components/NodeCreateForm.tsx`)은 속성 칸을 `PropertyFields`(`src/components/PropertyFields.tsx`)로 그리고, `createPicker` 가 있는 관계마다 `NodePicker` 고르기 칸(`${testIdPrefix}-link-${relType}-*`)을 그린다. 같은 이름 검사와 관계 실패 처리를 바꾸지 않는다.
- Phase 03 가 만든 것: `src/components/ui/dialog.tsx`, `src/components/ui/dropdown-menu.tsx`, `src/lib/typeOrder.ts`(`orderedTypes`, `managedTypes`), `src/lib/labels.ts` 의 `firstSentence`, 머리글(`src/components/header/`), 개념 지도(`src/components/map/ConceptMapTab.tsx`, `TypePanel.tsx`).
- `App.tsx` 의 `focusNode(id)` 는 `/workspace?node=<id>&pane=detail` 로 간다(push).

**근거 문서**: `financial-workbench/docs/flow.md` 의 「노드 만들기」, 「개념 지도」, 「작업 공간」 의 「그래프 칸」, 「첫 접속 가이드」, `financial-workbench/docs/code-architecture.md` 의 「웹 구조」, `financial-workbench/docs/adr/010-concept-map-first-screen.md`

## 의도 메모

- 창의 상태는 `App` 바로 아래의 `AddProvider` 가 든다. 머리글, 그래프, 개념 지도가 같은 창을 연다. 성공 안내(`flash`)도 `App` 으로 올린다. 만든 곳이 작업 공간 밖일 수 있기 때문이다.
- 고르기 칸에서 새 항목을 만드는 기능은 넣지 않는다(사용자 결정 2026-10-24).
- 메뉴는 `modal={false}`, 창은 모달이다. 가이드 말풍선은 창 위에 보여야 하고 말풍선을 눌러도 창이 닫히면 안 된다. 창의 `onInteractOutside` 에서 `event.target` 이 `[data-testid="guide-bubble"]` 안이면 `preventDefault()` 한다. 말풍선은 창 오버레이보다 위(`z-index`)에 그리고 `pointer-events: auto` 다.
- 가이드 단계의 대상은 「창이 열려 있으면 창의 만들기 단추, 아니면 ＋ 추가」 다. 대상을 하나만 받는 지금 구조를 testid 목록(앞에서부터 처음 보이는 것)으로 넓힌다.

## 작업 항목

### 1. `src/components/add/AddProvider.tsx` (신규)

```ts
export interface AddContextValue {
  /** 그 타입의 만들기 창을 연다. 타입 메뉴는 AddMenu 가 그린다 */
  open: (type: string) => void
  close: () => void
  openType: string | null
}
export function AddProvider(props: { children: ReactNode; onCreated: (node: NodeView, message: string, kind?: 'success' | 'error') => void }): JSX.Element
export function useAdd(): AddContextValue
```

`openType` 이 있으면 `AddDialog` 를 그린다. `onCreated` 는 App 이 넘기며 `flash` 를 채우고 `focusNode(node.id)` 를 부른다.

### 2. `src/components/add/AddMenu.tsx` (신규)

- props: `trigger: ReactNode`(DropdownMenu 의 `asChild` 트리거), `align?: 'start' | 'end'`.
- 항목: `orderedTypes(ontology)` 의 타입마다 한 줄(testid `add-type-${type}`). 줄은 `TypeBadge`, 타입 이름, `firstSentence(description)` 를 작은 글씨로. 그 아래 구분선과 `managedTypes` 가운데 `claimPredicates` 가 하나 이상 있을 때만 주장 줄(`add-type-${claimType}`).
- 고르면 `useAdd().open(type)`.
- `DropdownMenu` 는 `modal={false}`.

### 3. `src/components/add/AddDialog.tsx` (신규)

- `Dialog` 로 `openType` 을 연다(testid `add-dialog`, `data-type`). 제목 「새 {타입 이름} 추가」, 설명은 타입 `description` 전체.
- 단계 표시(testid `add-steps`): 「1. 종류 고르기」(끝남 표시), 「2. 내용 적기」, 「3. 연결하기」. 주장이거나 그 타입의 `createPicker` 관계가 없으면 3단계를 그리지 않는다.
- 몸통: 주장 타입이면 `ClaimCreateForm`(지금 `SearchPanel` 의 주장 분기와 같은 props), 아니면 `NodeCreateForm`(`testIdPrefix="create"`).
- 가이드: 창이 열릴 때 `prefill?.type === openType` 이면 `prefill` 을 복사해 `initialValues` 로 넘기고 `consumePrefill()` 한다. 다른 타입이면 미리 채우지 않는다. 취소, 창 닫기, 「열기」(같은 이름 후보)는 `guide.cancelForm()` 을 부른다. 만들면 `guide.report({ kind: 'node-created' | 'claim-created', node })`.
- 성공: 창을 닫고 `onCreated` 를 부른다. 안내 문장은 지금 `SearchPanel` 의 세 문장(만들었습니다, 관계를 잇지 못했습니다, 주장 검토 대기)을 그대로 옮긴다. 관계 실패 문장의 「상세의 관계 추가로」 는 「상세의 「＋ 연결 추가」 로」 로 바꾼다.
- 같은 이름 후보의 「열기」 는 창을 닫고 `onOpenNode(id)`(App 의 `focusNode`)다. `AddProvider` 가 이 콜백도 받는다.
- `onInteractOutside`: 가이드 말풍선 안의 누르기는 무시한다(의도 메모).

### 4. `src/components/NodeCreateForm.tsx`, `src/components/PropertyFields.tsx`

- `PropertyFields` 에 `only?: 'required' | 'optional'` prop 을 더해 그 칸만 그린다. 기본은 전부(편집 폼이 쓴다).
- `NodeCreateForm` 은 필수 칸을 먼저 그리고, 선택 칸이 있으면 단추 「선택 항목 더 보기」(testid `${testIdPrefix}-optional-toggle`, `aria-expanded`)를 둔다. 누르면 선택 칸을 그린다. 선택 칸에 오류(`errors` 의 키)가 생기면 저절로 펼친다. 미리 채운 선택 값(가이드의 자료 종류)은 접혀 있어도 저장된다.
- 고르기 칸 묶음 위에 소제목 「3. 연결하기 (선택)」 을, 속성 칸 위에 「2. 내용 적기」 를 둔다. 단, `testIdPrefix` 가 `claim-doc-create` 인 주장 폼 안의 근거 문서 등록에서는 소제목을 그리지 않는다(prop `showStepHeadings` 기본 `false`, `AddDialog` 만 `true`).

### 5. 입구: `src/App.tsx`, `src/components/SearchPanel.tsx`, `src/components/Workspace.tsx`, `src/components/GraphPanel.tsx`, `src/components/map/TypePanel.tsx`

- `App.tsx`: `AppContext.Provider` 안쪽, 탭 `ErrorBoundary` 바깥에 `AddProvider` 를 둔다. 머리글 둘째 줄(Phase 03 가 비워 둔 자리, 더보기 왼쪽)에 `canEdit` 일 때 `<AddMenu trigger={<Button data-testid="add-open">＋ 추가</Button>} align="end" />`. 좁은 화면에서는 글자 「추가」 를 숨기고 `aria-label="추가"` 를 둔다. 머리글이 온톨로지를 받기 전에는 단추를 그리지 않는다. `flash` 상태(`{ id, text, kind }`)를 App 으로 옮겨 `Workspace` 에 prop 으로 넘긴다.
- `ClaimCreateForm.tsx`: `initialSubject` 주석의 「왼쪽 「무엇을 만들까요?」 는 넘기지 않는다」 를 「「＋ 추가」 의 주장 줄은 넘기지 않는다」 로 고친다.
- `SearchPanel.tsx`: `create-box` 전체와 가이드 프리필 effect, `NodeCreateForm`, `ClaimCreateForm` import, `onCreated` prop 을 지운다. 결과가 비었을 때의 문장을 「아직 등록한 항목이 없습니다.」 와 편집자에게 「오른쪽 위 「＋ 추가」 로 첫 항목을 만드세요.」 로 바꾼다. `viewer-create-hint` 는 지운다.
- `Workspace.tsx`: `flash` 와 `setFlash` 를 지우고 prop 으로 받는다. `SearchPanel` 의 `onCreated` 를 넘기지 않는다. `useAdd` 의 성공 뒤 그래프와 검색을 다시 읽도록 App 이 `focusNode` 로 `focusSeq` 를 올리는 지금 흐름을 그대로 쓴다.
- `GraphPanel.tsx`: 캔버스 오른쪽 아래에 편집 권한이 있을 때 둥근 단추(testid `graph-add`, `aria-label="추가"`, 글자 ＋)를 `AddMenu` 트리거로 둔다. 캔버스 위에 떠 있고 그래프 조작을 가리지 않는 크기(40px)다.
- `TypePanel.tsx`: 편집 권한이 있으면 「＋ {타입 이름} 추가」(testid `map-add-type`)를 단추 줄 맨 앞에 두고 `useAdd().open(type)` 를 부른다.

### 6. 따라하기: `src/lib/guide.ts`, `src/lib/guide.test.ts`, `src/components/guide/GuideProvider.tsx`, `src/components/guide/GuideBubble.tsx`

- `GuideStep.target` 을 `string[]`(앞에서부터 처음 보이는 것)로 바꾼다. 대상이 없으면 `[]`. `BROWSE_STEPS` 와 모든 단계를 고친다.
- `practiceSteps`: `company` 와 `document` 단계의 `target` 은 `['create-submit', 'add-open']`, `pane` 은 `null` 이다. 문장은 `docs/flow.md` 「편집자와 관리자의 따라하기」 표대로 바꾼다.
- `GuideProvider`: 기업과 근거 문서 단계에 들어갈 때 주소를 바꾸지 않는다(창은 어느 화면에서나 열린다). `formClosed` 로 「폼 다시 열기」 를 보이는 것은 주장 단계만이다. 기업과 근거 문서 단계에서 창을 닫으면 `prefillUsed` 를 되돌려(`reopen()` 과 같은 처리) 다음에 메뉴에서 같은 타입을 고를 때 다시 채운다.
- `GuideBubble`: 대상 목록을 받아 처음 보이는 요소를 쓴다. 말풍선의 `z-index` 를 창 오버레이보다 높이고 `pointer-events: auto` 를 준다.
- `guide.test.ts`: `practiceSteps` 의 `company` 단계 대상이 `['create-submit', 'add-open']` 이고 `pane` 이 `null` 인지.

### 7. 단위 테스트: `src/components/add/add.test.tsx` (신규)

`testSupport.tsx` 로 `AddMenu` 를 연 상태(`defaultOpen` 으로 렌더할 수 있게 `AddMenu` 에 `defaultOpen?: boolean` prop 을 둔다)로 그려 `add-type-*` 의 순서가 `orderedTypes` 뒤에 주장인지, 줄마다 설명 첫 문장이 있는지 본다. `NodeCreateForm` 을 그려 필수 칸만 보이고 `create-optional-toggle` 이 있는지, 선택 칸이 없는 타입에는 토글이 없는지 본다.

### 8. e2e 와 testid 계약: `e2e/workbench.spec.ts`, `e2e/mobile.spec.ts`, `TESTIDS.md`

- 도우미 `createNode(page, type, label, props)` 를 `add-open` → `add-type-${type}` → `add-dialog` 안의 `create-prop-*` 채우기로 바꾼다. 선택 속성을 채울 때는 먼저 `create-optional-toggle` 을 누른다. 만든 뒤 `add-dialog` 가 사라지고 `detail-label` 이 그 이름인지 기다린다.
- `new-node-type`, `new-node-button`, `viewer-create-hint` 를 쓰던 곳을 모두 바꾼다. 타입 목록을 단언하던 곳(지금 222행 `typeSelect.locator('option')`)은 `add-type-*` 의 마지막 줄이 주장이고 첫 줄이 `add-type-*` 가운데 하나인지만 단언하는 형태로 바꾼다(타입 목록을 테스트에 한 벌 더 적지 않는다).
- 2c 처럼 「무엇을 만들까요?」 에서 주장을 만들던 테스트는 「＋ 추가」 의 주장 줄에서 시작하게 고치고 이름을 「＋ 추가」 기준으로 바꾼다.
- 따라하기 테스트(0e, 0f 계열)는 말풍선이 `add-open` 을 가리킨 뒤(`add-open` 에 class `guide-target`), 메뉴에서 기업을 고르면 이름 칸이 연습 이름으로 채워지고 말풍선이 `create-submit` 을 가리키는지 확인하게 바꾼다.
- 열람자 테스트는 `add-open` 과 `graph-add` 가 없는지 본다.
- 새 테스트: 「개념 지도의 ＋ 타입 추가로 만든 항목이 작업 공간 상세로 열린다」. 지도에서 타입 하나를 고르고 `map-add-type` 을 눌러 `add-dialog` 의 `data-type` 이 그 타입이고 `add-steps` 가 보이는지, 필수 칸만 채워 저장하면 주소가 `/workspace?node=…&pane=detail` 이고 `detail-notice` 가 성공인지. 스크린샷 `shot(page, 'add-dialog')` 는 창이 열린 상태에서 찍는다.
- `mobile.spec.ts`: 390px 에서 `add-open` 이 탭 줄과 같은 줄이고, 창이 화면 폭 안에 들어가며 가로 스크롤이 없는지. 스크린샷 `shot(page, 'add-dialog-mobile')`.
- `TESTIDS.md`: 「작업 공간: 왼쪽」 의 `new-node-type`, `new-node-button`, `viewer-create-hint` 줄을 지우고, 「＋ 추가」 절을 새로 만들어 `add-open`, `add-type-<타입>`, `add-dialog`, `add-steps`, `graph-add`, `map-add-type`, `create-optional-toggle` 을 적는다. `create-*` 줄의 설명을 「만들기 창의 폼」 으로 고친다. 가이드 절의 대상 설명을 고친다.

## 검증

```bash
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npx vitest run src/components/add/add.test.tsx src/lib/guide.test.ts src/components/guide/guide.test.tsx
cd financial-workbench/web && npm test && npm run build
cd financial-workbench/web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts
! git grep -n "new-node-type\|new-node-button\|viewer-create-hint\|create-box\|무엇을 만들까요" -- financial-workbench/web
```

- e2e 는 이 phase 에서 브라우저로 돌리지 않는다. `playwright test --list` 는 서버 없이 spec 파일을 읽어 문법과 import 오류만 잡는다. 브라우저 실행은 모든 phase 를 마친 뒤 한 번 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/components/add/AddProvider.tsx` | 신규 |
| `financial-workbench/web/src/components/add/AddMenu.tsx` | 신규 |
| `financial-workbench/web/src/components/add/AddDialog.tsx` | 신규 |
| `financial-workbench/web/src/components/add/add.test.tsx` | 신규 |
| `financial-workbench/web/src/components/NodeCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/components/PropertyFields.tsx` | 수정 |
| `financial-workbench/web/src/components/ClaimCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/SearchPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/Workspace.tsx` | 수정 |
| `financial-workbench/web/src/components/GraphPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/map/TypePanel.tsx` | 수정 |
| `financial-workbench/web/src/legacy.css` | 수정 |
| `financial-workbench/web/src/lib/guide.ts` | 수정 |
| `financial-workbench/web/src/lib/guide.test.ts` | 수정 |
| `financial-workbench/web/src/components/guide/GuideProvider.tsx` | 수정 |
| `financial-workbench/web/src/components/guide/GuideBubble.tsx` | 수정 |
| `financial-workbench/web/src/components/guide/guide.test.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
