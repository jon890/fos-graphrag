# Phase 03. 편집자 따라하기와 연습 항목 보관

**Execution profile**: standard

## 목표

편집자와 관리자의 첫 접속 가이드를 따라하기로 바꾼다. 말풍선을 따라 연습 기업, 연습 근거 문서, 연습 주장을 직접 만들고, 끝내거나 그만두면 만든 연습 항목을 보관한다.
가이드는 만들기 폼을 미리 채워 열고, 만들기가 성공하면 다음 단계로 간다. 새로고침이나 다시 로그인 뒤에는 이어서 할지 묻는다.

**범위 외**: 서버는 고치지 않는다. 가이드 틀(진행 상태, 말풍선, 사용법 단추, 열람자 둘러보기, `loginAs` 의 가이드 건너뛰기)은 phase 02 가 만들었다.

## 컨텍스트

- phase 02 가 만든 것(`financial-workbench/web/src/`):
  - `lib/guide.ts`: `GuideKind = 'browse' | 'practice'`, `GuideStep { id, target, pane, title, body }`, `BROWSE_STEPS`, `GuideProgress { userId, kind, step, startedAt, created }`, `readProgress(userId, storage?)`, `writeProgress(p, storage?)`, `clearProgress(storage?)`, `shouldAutoStart(user)`.
  - `components/guide/GuideProvider.tsx`: App 이 로그인한 동안 머리글과 `<main>` 을 함께 감싼다. props `user`, `onUserChange`. context `{ active, kind, step, steps, busy, message, start(kind), next(), finish(), skip() }`. 화면 이동(좁은 화면의 `pane`)은 이 Provider 만 한다. `finish`/`skip` 은 진행 상태를 지우고 `api.auth.guideDone()` 을 기다린다.
  - `components/guide/GuideBubble.tsx`: testid `guide-bubble`(`data-step`), `guide-start`, `guide-next`, `guide-finish`, `guide-skip`. 대상 요소를 다시 찾아 `guide-target` class 를 붙인다. `Escape` 는 말풍선 안에서만 받는다.
  - `Workspace.tsx` 의 상세 칸 testid `workspace-pane-detail`.
  - 머리글 「사용법」(`guide-open`). 지금은 모든 역할이 `browse` 다.
  - `e2e/support.ts` 의 `loginAs(..., { guide: 'keep' })`, `e2e/workbench.spec.ts` 의 `guideEditor`(`guide-editor-${suffix}@example.com`, EDITOR, `0)` 에서 더한다), `10)` 테스트, `e2e/mobile.spec.ts` 의 휴대폰 가이드 테스트(관리자로 둘러보기 세 단계를 넘긴다).
- 만들기 폼:
  - `components/SearchPanel.tsx` 의 왼쪽 아래 「무엇을 만들까요?」 는 `createType`, `creating` 상태와 `new-node-type` select, `new-node-button` 이다. `creating` 이면 `NodeCreateForm`(`key={createType}`, `type`, `testIdPrefix="create"`, `onCancel`, `onUseExisting`, `onCreated(node, linkError)`)을 연다. 성공하면 `onCreated(node, 안내)` 로 작업 공간에 알리고 작업 공간이 그 노드를 고른다.
  - `components/NodeCreateForm.tsx` 는 `useState(() => initialCreateValues(defs))`(`lib/formValues.ts`)로 값을 시작한다. 필수 `datetime`(근거 문서의 `collectedAt`)은 지금 시각으로 채운다. 입력칸은 `create-prop-<속성>`, 저장은 `create-submit` 이다.
  - `components/DetailPanel.tsx` 는 `addingClaim` 상태와 「주장 추가」(`claim-add-toggle`)로 `ClaimCreateForm`(`initialSubject={node}`, `onCreated`)을 연다. `useEffect(..., [selectedId, flash])` 가 고른 노드나 성공 안내(`flash`)가 바뀔 때마다 `setAddingClaim(false)` 를 한다. `Workspace.tsx` 는 다른 노드를 고르면 `flash` 를 지운다.
  - `components/ClaimCreateForm.tsx` 는 `predicate`(첫 값은 주체 타입을 받는 첫 주장 종류), `subject`, `object`, `documents`(`useState<NodeView[]>([])`, 처음 그릴 때만 초깃값을 읽는다), `description`, `evidenceText` 상태를 둔다. 저장 전에 `description` 과 `evidenceText` 가 비면 「필수 값입니다.」 다(80-81줄 부근). testid 는 `claim-predicate-select`, `claim-object-picker-*`, `claim-doc-picker-*`, `claim-doc-selected`, `claim-description`, `claim-evidence`, `claim-add-submit` 이다(`web/TESTIDS.md`).
- `api.nodes.get(id)` 는 `NodeDetail` 을 돌려주고 노드는 `.node`(`NodeView`, `revision`, `archived`)다. 보관은 `api.nodes.archive(id, expectedRevision, reason)` 이고 주장도 같은 API 다. 이미 보관된 노드를 보관하면 `409 ARCHIVED` 다. 근거 문서보다 주장을 먼저 보관해야 `409 LAST_EVIDENCE` 에 걸리지 않는다. 노드 검색은 `api.nodes.search` 계열(`client.ts`)이다.
- 온톨로지는 ADMIN 이 바꿀 수 있다. 표시 이름은 `useLabels()` 로 읽는다. `Document` 는 서버 코드가 이름으로 읽는 타입이라 빠지지 않는다. `Company`, 주장 종류, 자료 종류의 `OTHER` 값은 빠질 수 있다.
- 웹 테스트의 `testSupport.tsx` 의 `testOntology` 에는 `claimPredicates.SUPPLIES_TO` 하나뿐이고 `Sector` 타입이 없다. 웹에는 YAML 을 읽는 라이브러리가 없다.
- 시작 데이터(`ontology/seeds/`)에는 산업(Sector)이 없다. e2e 의 Neo4j 는 실행 사이에 남지만 첫 실행에는 산업이 없을 수 있다. 휴대폰 테스트와 넓은 화면 테스트는 따로 돌아 서로의 데이터에 기대지 않는다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「첫 접속 가이드」(편집자와 관리자의 따라하기 표와 그 아래 목록, 좁은 화면), `financial-workbench/docs/prd.md` 의 「만드는 것」 과 관측 항목, 「남은 한계」 의 연습 주장 항목

## 의도 메모

- 다음 단계로 가는 판단은 그 종류의 항목을 만들었는지만 본다. 사용자가 미리 채운 값을 바꿔도 된다(`flow.md`).
- 끝내기, 그만두기, 소개의 건너뛰기 모두 연습 항목을 보관한다(사용자 결정 2026-10-21, 「연습 데이터는 끝나면 보관」).
- 고를 대상이 없거나 가이드가 쓰는 정의가 온톨로지에서 빠졌으면 따라하기 대신 둘러보기를 연다. 새로 배포한 DB 의 첫 관리자가 3단계에서 막히지 않게 하려는 것이다.
- 진행 중인 연습은 끝낸 기록과 상관없이 이어서 할지 묻는다. 「사용법」 으로 다시 연습하던 사람의 연습 항목이 남지 않게 하려는 것이다.

## 작업 항목

### 1. 순수 함수

`lib/guide.ts` 에 더한다.

- `practiceSteps(labels, plan): GuideStep[]`: 소개(`intro`), `company`(대상 `create-submit`, pane `search`), `document`(대상 `create-submit`, pane `search`), `claim`(대상 `claim-add-submit`, pane `detail`), `done`(대상 `graph-canvas`, pane `graph`). 제목과 본문은 `docs/flow.md` 「편집자와 관리자의 따라하기」 표의 말풍선이다. 타입, 관계, 대상 이름은 `labels` 와 아래 `plan` 으로 채운다.
- `practiceNames(displayName, startedAt: Date): { company: string; document: string }`: `[연습] <표시 이름> 기업 <MMDD-HHmm>`, `[연습] <표시 이름> 메모 <MMDD-HHmm>`. 시각은 실행 환경의 지역 시각이다.
- `PRACTICE_TEXT = '[연습] 가이드로 만든 주장입니다'`(주장의 설명과 근거 문장에 넣는다).
- `practicePredicateCandidates(ontology): string[]`: `Company` 를 주체로 받는 주장 종류를 `BELONGS_TO_SECTOR` 먼저, 나머지는 온톨로지 순서로. `Company` 나 `Document` 타입이 없으면 빈 목록.
- `interface PracticePlan { predicate: string; objectType: string }`. 실제 고르기는 비동기라 Provider 가 한다(아래 2절).
- `practiceDocumentValues(ontology, title): Record<string, string>`: `title`, `url: 'https://example.com/practice'`, 그리고 `Document.documentType` 의 `values` 에 `OTHER` 가 있으면 `documentType: 'OTHER'`. 그 타입에 없는 속성은 뺀다.
- `archiveOrder(created): string[]`: `claim`, `document`, `company` 순서로 있는 ID 만.
- `shouldAutoStart(user, progress)`: `user.guideDoneAt === null || progress?.kind === 'practice'` 로 바꾼다.

### 2. 가이드 상태

`components/guide/GuideProvider.tsx`

- props 의 `ontology`(phase 02 가 넘긴다)로 아래 판단을 한다.
- 여는 종류: 편집자와 관리자(`canEditRole(user.role)`)면 `practicePredicateCandidates` 를 차례로 보며, 그 종류의 `objectTypes` 가운데 보관되지 않은 노드가 하나라도 있는 첫 타입을 찾는다(타입마다 `size=1` 검색). 찾으면 `practice` 와 `PracticePlan { predicate, objectType }`, 못 찾으면 `browse` 다. 열람자는 언제나 `browse` 다. 이 판단은 자동 시작과 「사용법」 모두에서 한다.
- `GuideProgress` 에 `plan` 과 `created`(`company`, `document`, `claim` 키)를 담는다.
- `report(event: { kind: 'node-created' | 'claim-created'; node: NodeView })`: 지금 단계가 `company` 이고 `node.type === 'Company'` 면 `created.company` 에 담고 다음 단계, `document` 이고 `Document` 면 `created.document`, `claim` 이고 `claim-created` 면 `created.claim` 에 담고 다음 단계다. 그 밖의 이벤트는 무시한다. 단계가 바뀌면 `writeProgress` 한다.
- `prefill`: `company` 단계면 `{ step, type: 'Company', values: { name } }`, `document` 면 `{ step, type: 'Document', values: practiceDocumentValues(...) }`, `claim` 이면 `{ step, subjectId: created.company, predicate: plan.predicate, documentId: created.document, description: PRACTICE_TEXT, evidenceText: PRACTICE_TEXT }`. 소비한 쪽이 `consumePrefill()` 을 불러 같은 단계에서 다시 열리지 않게 한다. 말풍선의 「폼 다시 열기」(`guide-reopen`, 폼을 취소했을 때만 보인다)는 다시 열 수 있게 되돌린다.
- 단계에 들어갈 때 주소를 한 번 바꾼다(`replace`, 한 곳에서 `node` 와 `pane` 을 함께 담은 주소를 만든다). `company`, `document` 는 `/workspace`(좁은 화면은 `pane=search`), `claim` 은 `/workspace?node=<company>`(좁은 화면은 `pane=detail`), `done` 은 `/workspace?node=<company>&center=<company>`(좁은 화면은 `pane=graph`).
- 단계 단추: `practice` 의 `company`, `document`, `claim` 은 `guide-next` 를 두지 않고 「그만두기」(`guide-stop`)를 둔다. `done` 은 「끝내기」(`guide-finish`), 소개는 「시작」 과 「건너뛰기」(`guide-skip`)다. `GuideBubble.tsx` 가 `kind` 와 단계로 고른다.
- `finish()`, `stop()`, `skip()` 이 `practice` 면 `busy` 를 켜고 `archiveOrder(created)` 순서로 `api.nodes.get(id)` → 보관되지 않았으면 `api.nodes.archive(id, detail.node.revision, '첫 접속 가이드 연습 항목')` 한다. 하나가 실패해도 나머지를 계속한다. 실패한 것이 있으면 `guide-message` 에 「연습 항목을 보관하지 못했습니다. 이름을 눌러 직접 보관하세요.」 와 실패한 항목 이름(`guide-archive-failed` 각 줄, 누르면 `/workspace?node=<id>` 로 연다)을 보인다. 그다음 phase 02 와 같이 `guideDone()` 을 부르고 진행 상태를 지운다.
- 이어서 하기: 자동 시작이나 「사용법」 을 열 때 `readProgress(user.id)` 가 `practice` 면 소개 대신 「이어서 하기」(`guide-resume`, 저장된 단계로 연다)와 「그만두기」(`guide-stop`, 위와 같이 보관하고 끝낸다)를 묻는 단계(`data-step="resume"`)를 연다.

### 3. 화면 연결

- `NodeCreateForm.tsx`: prop `initialValues?: Record<string, string>` 를 더해 `initialCreateValues(defs)` 위에 덮어쓴다. 폼 값의 형식(`FormValues`)을 `lib/formValues.ts` 에서 확인하고 맞춘다.
- `SearchPanel.tsx`: 가이드의 `prefill.type` 이 있고 지금 폼이 닫혀 있으면 `createType` 을 그 타입으로, `creating` 을 `true` 로 열고, 그 프리필을 자기 상태(`openedPrefill`)에 복사한 뒤 `consumePrefill()` 한다. `NodeCreateForm` 의 `key` 와 `initialValues` 는 이 복사본에서 읽는다. context 의 프리필이 비어도 폼이 다시 만들어지지 않게 하려는 것이다(두 폼은 `useState` 초깃값으로만 값을 읽는다). 복사본은 폼을 닫거나 만들기가 끝나면 비운다. `onCreated` 가 성공하면 가이드에 `report({ kind: 'node-created', node })` 한다. `onCancel` 은 가이드에 폼을 닫았다고 알려 「폼 다시 열기」 가 보이게 한다. 같은 이름 경고에서 「열기」 를 고르면 만들기로 보지 않는다(가이드는 그 단계에 남는다).
- `ClaimCreateForm.tsx`: prop `initialPredicate?: string`, `initialDocuments?: NodeView[]`, `initialDescription?: string`, `initialEvidenceText?: string` 을 더한다. 주어진 주장 종류가 주체 타입을 받지 않으면 무시한다.
- `DetailPanel.tsx`: 가이드의 `prefill.subjectId` 가 `detail?.node.id` 와 같으면 `api.nodes.get(prefill.documentId)` 의 `.node` 를 읽은 뒤에 `addingClaim` 을 `true` 로 연다. 위 `[selectedId, flash]` effect 보다 뒤에 열리도록 별도 effect 로 두고 `detail` 과 `prefill` 을 의존성으로 한다. 이때 프리필과 읽은 문서를 자기 상태(`openedPrefill`)에 복사한 뒤 `consumePrefill()` 한다. `ClaimCreateForm` 의 `key`(`openedPrefill.documentId`)와 초깃값들은 이 복사본에서 읽는다. 복사본은 폼을 닫거나 만들기가 끝나면 비운다. `onCreated` 가 성공하면 가이드에 `report({ kind: 'claim-created', node: claim })` 한다.
- 가이드 context 가 없는 렌더링(단위 테스트, 가이드 꺼짐)에서도 이 컴포넌트들이 지금처럼 동작하게, context 기본값은 `active: false`, `prefill: null` 과 빈 함수다.

### 4. 문서

- `web/TESTIDS.md` 에 `guide-stop`, `guide-resume`, `guide-reopen`, `guide-archive-failed` 를 적고, `guide-bubble` 의 `data-step` 값에 `resume`, `company`, `document`, `claim`, `done` 을 적는다.

### 5. 이 phase 를 검증하는 테스트

- `lib/guide.test.ts` 에 더한다. 테스트 안에서 `testOntology` 를 복사해 `Sector` 타입, `Document.documentType`(`values: ['NEWS', 'OTHER']`), `BELONGS_TO_SECTOR`(주체 `Company`, 대상 `Sector`)를 더한 fixture 를 만든다.
  - `practiceNames('관리자', new Date(2026, 9, 23, 14, 5))` 의 기업 이름이 `[연습] 관리자 기업 1023-1405` 다.
  - `practicePredicateCandidates` 가 위 fixture 에서 `['BELONGS_TO_SECTOR', 'SUPPLIES_TO']`, `BELONGS_TO_SECTOR` 를 뺀 fixture 에서 `['SUPPLIES_TO']`, `Company` 를 뺀 fixture 에서 `[]` 다.
  - `practiceDocumentValues` 가 `OTHER` 가 있으면 `documentType: 'OTHER'` 를 담고, `values` 에서 `OTHER` 를 뺀 fixture 에서는 `documentType` 이 없다.
  - `archiveOrder({ company: 'c', document: 'd', claim: 'm' })` 가 `['m', 'd', 'c']`, `archiveOrder({ company: 'c' })` 가 `['c']` 다.
  - `shouldAutoStart` 가 `guideDoneAt` 이 있어도 진행 상태가 `practice` 면 참이다.
- `components/guide/guide.test.tsx` 에 더한다: `practice` 의 `company` 단계 말풍선이 `guide-stop` 을 담고 `guide-next` 가 없다. `resume` 단계가 `guide-resume`, `guide-stop` 을 담는다. `NodeCreateForm` 에 `initialValues={{ name: '[연습] A 기업' }}` 를 넘겨 정적 렌더링하면 `create-prop-name` 의 값이 그 이름이다(`screens.test.tsx` 의 렌더링 방식을 따른다). `ClaimCreateForm` 에 `initialDescription` 을 넘기면 `claim-description` 의 값이 그 문장이다.
- `web/e2e/workbench.spec.ts` 의 `10)` 뒤에 `11) 편집자는 처음 로그인하면 연습 기업, 근거 문서, 주장을 따라 만들고, 끝내면 연습 항목이 보관된다` 를 더한다.
  1. `pageAdmin` 으로 산업 하나(`가이드산업-${suffix}`)를 만든다(이 파일의 노드 만들기 도우미를 쓴다).
  2. 새 컨텍스트로 `loginAs(page, guideEditor, 'success', '/', { guide: 'keep' })` → `intro` → `guide-start`.
  3. `company` 단계: `guide-next` 가 없다. `create-prop-name` 의 값이 `[연습] ` 으로 시작한다 → `create-submit` → `data-step` 이 `document`.
  4. `document` 단계: `create-prop-title` 이 채워져 있다 → `create-submit` → `claim` 단계이고 `detail-panel` 의 `data-node-type` 이 `Company` 다.
  5. `claim` 단계: `claim-predicate-select` 의 값이 `BELONGS_TO_SECTOR`, `claim-doc-selected` 에 연습 문서가 있고 `claim-description` 이 채워져 있다 → 대상 고르기로 1번의 산업을 고른다 → `claim-add-submit` → `done` 단계. `shot(page, '11-guide-practice-done')`.
  6. `guide-finish` 를 누르기 전에 `page.evaluate` 로 `localStorage['workbench.guide']` 의 `created` 를 읽어 둔다 → `guide-finish` → `guide-bubble` 이 사라진다 → 세 ID 마다 `GET /api/nodes/<id>` 의 `node.archived` 가 `true` 다. 연습 기업 이름으로 검색하면 결과가 없다.
  7. 새로고침해도 가이드가 열리지 않는다.
- `web/e2e/workbench.spec.ts` 에 `11b) 다시 연습하다 새로고침하면 이어서 하기를 묻고, 그만두면 만든 연습 항목을 보관한다` 를 더한다. `pageAdmin`(이미 기록이 있다)이 `guide-open` → `guide-start` → 기업을 만든다 → `created.company` 를 읽어 둔다 → 새로고침 → `data-step="resume"` 과 `guide-resume`, `guide-stop` 이 보인다 → `guide-stop` → 그 기업의 `node.archived` 가 `true` 다.
- `web/e2e/mobile.spec.ts` 의 휴대폰 가이드 테스트를 따라하기에 맞게 다시 쓴다. 관리자가 따라하기를 열려면 산업이 있어야 하므로 먼저 `createNodeOnMobile(page, 'Sector', ...)` 로 산업 하나를 만든다 → `workspace-tab-detail` 에서 시작 → `guide-open` → `guide-start` → `company` 단계에서 `workspace-tab-search` 의 `aria-selected` 가 `true`, 만들기 폼이 열려 있고 아래쪽 카드가 보인다 → `create-submit` 을 `scrollIntoViewIfNeeded` 했을 때 카드에 가리지 않는다(두 요소의 `boundingBox` 가 겹치지 않는다) → `expectNoHorizontalOverflow(page)` → `guide-stop`. `shot(page, 'm-guide')`.

## 검증

```bash
cd financial-workbench/web && npm run typecheck
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
git grep -q "guide-resume" -- financial-workbench/web/TESTIDS.md
```

- 각 줄은 저장소 루트에서 돈다.
- 브라우저 테스트(`npm run test:e2e`)는 Compose 스택이 있어야 돌아 이 절에 두지 않는다. 코디네이터가 PR 검증 때 돌린다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/lib/guide.ts` | 수정 |
| `financial-workbench/web/src/lib/guide.test.ts` | 수정 |
| `financial-workbench/web/src/components/guide/GuideProvider.tsx` | 수정 |
| `financial-workbench/web/src/components/guide/GuideBubble.tsx` | 수정 |
| `financial-workbench/web/src/components/guide/guide.test.tsx` | 수정 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/NodeCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/components/SearchPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/ClaimCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
