# Phase 06. 상세 읽기 카드, 편집 전환, ⋯ 메뉴와 보관 창, 연결 문장

**Execution profile**: deep

## 목표

작업 공간의 상세 칸을 읽기 카드로 바꾼다. 편집 폼은 「편집」 을 누를 때 열고, 링크 복사와 변경 이력, 보관과 복원은 「⋯」 메뉴로 옮긴다. 관계는 문장으로 보이고, 「＋ 연결 추가」 와 「＋ 주장 추가」 를 절 머리에 둔다.

**범위 외**: 검색 칸과 그래프(Phase 05). 화면 문구 전체 점검과 온톨로지 표시 이름(Phase 07).

## 컨텍스트

- 상세는 `financial-workbench/web/src/components/DetailPanel.tsx` 다. 지금은 머리(배지, 이름, 검토 상태, 보관됨), 알림(`detail-notice`), 동작 줄(`node-history-link`, `node-center-graph`, `node-copy-link`, `node-archive-reason`, `node-archive-button` 또는 `node-restore-button`), 열람자 안내(`viewer-hint`), 생성과 수정(`node-meta`, `node-updated-by`), 「자세히」(`node-meta-details`, `node-revision`), 그리고 주장 노드면 `ClaimCard` 와 `ReviewControls`, `ClaimEditForm`, 아니면 늘 열린 `NodeEditForm` 을 그린다. 그 아래 `RelationshipSection` 과 주장 절(`node-claims-section`, `claim-add-toggle`, `ClaimCreateForm`)이 있다.
- 동시 수정 때 입력을 지키는 `draft`(`EditDraft`)와 `onConflict`, `onDraftDone` 은 `DetailPanel` 이 들고 `NodeEditForm` 에 넘긴다(`docs/flow.md` 「화면에서 입력 지키기」). `fail(e)` 은 `REVISION_CONFLICT` 면 상세를 다시 읽는다.
- 관계는 `src/components/RelationshipSection.tsx` 가 그린다. 줄(`relationship-row`, `data-rel-type`)은 「시작 —표시 이름→ 끝」 이고, 편집자는 `relationship-archive-toggle`, 추가는 `relationship-add-toggle` → `relationship-add-form`(`relationship-type-select`, `relationship-target-picker-*`, `relationship-add-submit`)이다. `RelationshipView` 는 `from`, `to`(각 `id`, `type`, `label`)와 `archived` 를 가진다.
- 링크 복사는 `src/components/CopyLinkButton.tsx` 다. 사용자 이름은 `src/lib/format.ts` 의 `userName(ref)`(없으면 「시스템」), 날짜는 `formatDate`, 시각은 `formatDateTime` 이다. 값 표시는 `useLabels().value(type, prop, value)`, 속성 이름은 `useLabels().property(type, prop)` 이다.
- Phase 02 가 만든 `src/lib/relationSentence.ts` 의 `relationSentenceParts(o, relationship, from, to)`, Phase 03 이 만든 `src/components/ui/dialog.tsx`, `src/components/ui/dropdown-menu.tsx` 를 쓴다.
- 가이드의 주장 단계는 `DetailPanel` 이 `prefill.subjectId` 를 보고 주장 폼을 저절로 연다. 대상 testid 는 `claim-add-submit` 이다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「작업 공간」 의 「상세 칸: 읽기 카드」, 「관계 문장」, 「화면에서 입력 지키기」, 「보관과 복원」, 「주장 만들기 화면」, `financial-workbench/docs/code-architecture.md` 의 「웹 구조」

## 의도 메모

- testid 는 되도록 유지한다. `node-copy-link`, `node-history-link`, `node-archive-button`, `node-restore-button` 은 「⋯」 메뉴 항목이 되고, `node-archive-reason` 은 보관 창 안의 입력이 된다. e2e 는 메뉴를 먼저 여는 한 단계만 더한다.
- 편집 폼을 여는 상태(`editing`)는 `DetailPanel` 이 든다. 409 를 받으면 `editing` 을 그대로 두어 비교가 보이게 한다. 다른 항목을 고르면(`selectedId` 가 바뀌면) `editing` 과 `draft` 를 함께 지운다.
- 보관 창의 「보관」 이 실패하면 창을 닫고 지금의 `fail(e)` 로 상세 위에 알린다. `LAST_EVIDENCE` 의 「주장 열기」 단추도 그대로 나온다.
- 메뉴는 `modal={false}` 다(CSP 와 스크롤 잠금).

## 작업 항목

### 1. `src/components/NodeReadCard.tsx` (신규)

일반 노드의 속성 목록을 그린다(testid `node-props`). 온톨로지 속성 순서대로, 값이 `null`, `undefined`, 빈 문자열인 속성은 뺀다. 줄은 `<dt>` 속성 이름, `<dd>` 표시 값(`labels.value`)이고 testid `node-prop`, `data-prop`. 값이 하나도 없으면 「적은 내용이 없습니다.」. 정의에서 빠진 타입은 지금처럼 `UndefinedTypeProperties` 를 쓴다(이 컴포넌트를 부르지 않는다).

### 2. `src/components/DetailPanel.tsx`

`docs/flow.md` 「상세 칸: 읽기 카드」 표의 순서로 다시 짠다.

- 머리: 타입 배지, 이름(`detail-label`), 검토 상태, 보관됨(`detail-archived`). 그 아래 한 줄 `node-created-line`: `${withJosa(userName(node.createdBy), '이(가)')} ${formatDate(node.createdAt)}에 등록`.
- 버튼 줄(testid `node-actions`):
  - 「편집」(testid `node-edit`): `canEdit && !node.archived && typeDefined` 일 때. 누르면 `editing = true`.
  - 「그래프 중심으로」(testid `node-center-graph`).
  - 「⋯」(testid `node-more`, `aria-label="더 보기"`) 메뉴: 「링크 복사」(`node-copy-link`, 지금 `CopyLinkButton` 동작), 「변경 이력」(`node-history-link`), 편집 권한이 있으면 「보관」(`node-archive-button`) 또는 「복원」(`node-restore-button`). 클립보드를 쓸 수 없을 때 주소를 보이는 입력칸은 메뉴가 닫혀도 남도록 버튼 줄 아래에 그린다(`CopyLinkButton` 이 메뉴 밖에 결과를 그릴 수 있게 props 를 나눈다).
- 보관 창(testid `node-archive-dialog`): 제목 「이 항목을 보관할까요?」, 설명 「보관하면 기본 검색과 주변 그래프에서 빠집니다. 복원할 수 있습니다.」, 사유 입력 `node-archive-reason`(placeholder 「보관 사유(선택)」), 단추 「보관」(`node-archive-confirm`)과 「취소」. 복원은 묻지 않고 바로 한다.
- 열람자 안내 `viewer-hint` 는 그대로.
- 일반 노드: `editing` 이면 지금의 `NodeEditForm` 을 그리고 「취소」(testid `node-edit-cancel`)를 폼 옆에 둔다. 저장에 성공하면 `editing = false`. 아니면 `NodeReadCard` 를 그린다. 타입 설명(`hint`)은 편집할 때만 보인다.
- 주장 노드: `ClaimCard` 와 `ReviewControls` 는 늘 보이고, `ClaimEditForm` 은 `editing` 일 때만 그린다(「편집」 단추 규칙이 같다).
- 「연결」 절은 `RelationshipSection`, 「주장」 절은 머리 「주장 (N)」 과 편집 권한이 있을 때 머리 오른쪽 「＋ 주장 추가」(`claim-add-toggle`, 보관된 항목이면 끔).
- 「자세히」(`node-meta-details`) 안에 생성(작성자, 시각), 수정(`node-updated-by`), 보관 시각, revision(`node-revision`), ID 를 둔다. 기본은 접힘. 머리 아래의 `node-meta` 는 지운다.
- `selectedId` 가 바뀌면 `editing` 을 `false` 로 되돌린다. 409 면 `editing` 을 유지한다.

### 3. `src/components/RelationshipSection.tsx`

- 절 제목을 「연결」 로, 머리 오른쪽에 「＋ 연결 추가」(`relationship-add-toggle`)를 둔다. 추가 칸은 지금 그대로다. 관계 종류 선택지 글자는 `relationSentence(ontology, type, 시작 이름, 끝 이름)` 으로 만들고, 이 항목 쪽 자리에는 「이 항목」, 상대 쪽 자리에는 상대 타입 이름을 넣는다.
- 줄(`relationship-row`, `data-rel-type`, `data-direction`)은 `relationSentenceParts(ontology, r.type, r.from.label, r.to.label)` 로 그린다. 이 항목이 시작이면 `data-direction="out"`, 끝이면 `"in"` 이다. 양쪽 상세에서 같은 문장이다. 자리 조각 가운데 이 항목의 것은 `<strong>`(testid `relationship-self`)으로, 상대의 것은 단추(testid `relationship-open`, `data-node-id`)로 그리고 누르면 `onOpenNode(id)`.
- 상대 타입 배지는 문장 앞에 둔다. 보관된 관계는 흐리게 「보관됨」 을 붙이고, 편집자는 「연결 보관」 또는 「연결 복원」(`relationship-archive-toggle`). 「정의에서 빠진 관계」 표시(`relationship-undefined`)는 그대로.
- 연결이 없으면 「아직 연결된 항목이 없습니다.」.

### 4. 단위 테스트: `src/components/DetailPanel.test.tsx`, `src/components/screens.test.tsx`

- `NodeReadCard` 를 그려 빈 값 속성이 빠지고 enum 이 표시 이름으로 나오는지.
- `RelationshipSection` 을 그려 이 항목이 시작인 관계와 끝인 관계 모두에서 이 항목 이름이 `relationship-self` 로, 상대 이름이 `relationship-open` 으로 나오고, 문장 글자가 `relationSentence` 와 같은지.
- `screens.test.tsx` 에 상세를 그리는 기존 단언(`node-meta`, `NodeEditForm` 의 입력 등)이 있으면 읽기 카드 기준으로 고친다.

### 5. e2e 와 testid 계약: `e2e/workbench.spec.ts`, `e2e/mobile.spec.ts`, `TESTIDS.md`

- 편집 폼의 입력(`edit-prop-*`)과 저장 단추(`node-save`)를 쓰기 전에 `node-edit` 를 누른다. 동시 수정 테스트(B 의 409 와 `edit-conflict-*`)는 409 뒤에도 편집 폼이 열려 있는지 단언을 하나 더한다.
- 보관은 `node-more` → `node-archive-button` → `node-archive-dialog` 의 `node-archive-reason` 채우기 → `node-archive-confirm`. 복원은 `node-more` → `node-restore-button`. 링크 복사와 변경 이력도 `node-more` 를 먼저 연다.
- `node-meta` 를 보던 단언은 `node-meta-details` 를 열어 보게 바꾼다.
- 열람자 테스트(지금 926행)의 `edit-prop-name` 이 꺼져 있다는 단언은, 열람자에게 편집 폼이 그려지지 않으므로 `node-edit` 와 `edit-prop-name` 이 없다는 단언으로 바꾼다.
- 6b(지금 906행)의 `claim-edit-form` 단언 앞에 `node-edit` 를 누르는 단계를 넣는다. 열람자 테스트의 「버튼이 없다」 목록(`node-save`, `node-archive-button` 등)에 `node-edit` 를 더하고, `node-archive-button` 은 `node-more` 를 연 뒤 없음을 본다.
- `relationship-row` 의 글자를 보던 단언(「—표시 이름→」 꼴)을 바꾼다. 문장 규칙을 다시 적지 말고 `relationship-self`, `relationship-open` 의 이름과 `data-direction` 을 본다.
- 새 테스트: 「상세는 읽기 카드로 열리고 편집을 눌러야 폼이 열린다」. 항목을 열면 `node-props` 가 보이고 `edit-prop-*` 가 없으며, `node-edit` 를 누르면 폼이 열리고 `node-edit-cancel` 로 닫히는지. 스크린샷 `shot(page, 'detail-read-card')`.
- `mobile.spec.ts`: 상세 탭에서 `node-actions` 가 가로 스크롤 없이 보이는지 기존 390px 단언에 더한다.
- `TESTIDS.md`: 「작업 공간: 오른쪽(상세)」 절을 읽기 카드 기준으로 고친다. 새 testid(`node-created-line`, `node-actions`, `node-edit`, `node-edit-cancel`, `node-more`, `node-archive-dialog`, `node-archive-confirm`, `node-props`, `node-prop`, `relationship-self`, `relationship-open`)를 적고 `node-meta` 줄을 지운다.

## 검증

```bash
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npx vitest run src/components/DetailPanel.test.tsx src/components/screens.test.tsx
cd financial-workbench/web && npm test && npm run build
cd financial-workbench/web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts
! git grep -n "data-testid=\"node-meta\"" -- financial-workbench/web/src
```

- e2e 는 이 phase 에서 브라우저로 돌리지 않는다. `playwright test --list` 는 서버 없이 spec 파일을 읽어 문법과 import 오류만 잡는다. 브라우저 실행은 모든 phase 를 마친 뒤 한 번 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/components/NodeReadCard.tsx` | 신규 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.test.tsx` | 수정 |
| `financial-workbench/web/src/components/RelationshipSection.tsx` | 수정 |
| `financial-workbench/web/src/components/CopyLinkButton.tsx` | 수정 |
| `financial-workbench/web/src/components/NodeEditForm.tsx` | 수정 |
| `financial-workbench/web/src/components/screens.test.tsx` | 수정 |
| `financial-workbench/web/src/legacy.css` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
