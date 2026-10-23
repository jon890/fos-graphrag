# Phase 03. 편집자 따라하기와 연습 항목 보관

**Execution profile**: standard

## 목표

편집자와 관리자의 첫 접속 가이드를 따라하기로 바꾼다. 말풍선을 따라 연습 기업, 연습 근거 문서, 연습 주장을 직접 만들고, 끝내거나 그만두면 만든 연습 항목을 보관한다.
가이드는 만들기 폼을 미리 채워 열고, 만들기가 성공하면 다음 단계로 간다.

**범위 외**: 서버는 고치지 않는다. 가이드 틀(진행 상태, 말풍선, 사용법 단추, 열람자 둘러보기, `loginAs` 의 가이드 건너뛰기)은 phase 02 가 만들었다.

## 컨텍스트

- phase 02 가 만든 것(`financial-workbench/web/src/`):
  - `lib/guide.ts`: `GuideKind = 'browse' | 'practice'`, `GuideStep { id, target, pane, title, body }`, `BROWSE_STEPS`, `GuideProgress { userId, kind, step, startedAt, created }`, `readProgress`, `writeProgress`, `clearProgress`, `shouldAutoStart`.
  - `components/guide/GuideProvider.tsx`(context `{ active, kind, step, start(kind), next(), finish(), skip() }`, `finish`/`skip` 이 진행 상태를 지우고 `api.auth.guideDone()` 을 부른다), `components/guide/GuideBubble.tsx`(testid `guide-bubble`, `guide-start`, `guide-next`, `guide-finish`, `guide-skip`, 대상 강조 class `guide-target`, 좁은 화면의 탭 옮기기).
  - `App.tsx` 가 `guideDoneAt` 이 없으면 가이드를 열고, 머리글 「사용법」(`guide-open`)으로 다시 연다. 지금은 모든 역할이 `browse` 다.
  - `e2e/support.ts` 의 `loginAs(..., { guide: 'keep' })` 와 테스트 사용자 `guideEditor`(EDITOR, `0)` 에서 더한다).
- 만들기 폼:
  - `components/SearchPanel.tsx` 의 왼쪽 아래 「무엇을 만들까요?」 는 `createType`, `creating` 상태와 `new-node-type` select, `new-node-button` 이다. `creating` 이면 `NodeCreateForm`(`type`, `testIdPrefix="create"`, `onCreated(node, linkError)`)을 연다. 성공하면 `onCreated(node, 안내)` 로 작업 공간에 알린다.
  - `components/NodeCreateForm.tsx` 는 `useState(() => initialCreateValues(defs))`(`lib/formValues.ts`)로 값을 시작한다. 필수 `datetime`(근거 문서의 `collectedAt`)은 지금 시각으로 채운다. 입력칸은 `create-prop-<속성>`, 저장은 `create-submit` 이다.
  - `components/DetailPanel.tsx` 는 `addingClaim` 상태와 「주장 추가」(`claim-add-toggle`)로 `ClaimCreateForm`(`initialSubject={node}`, `onCreated`)을 연다.
  - `components/ClaimCreateForm.tsx` 는 `predicate`(첫 값은 주체 타입을 받는 첫 주장 종류), `subject`, `object`, `documents` 상태를 둔다. testid 는 `claim-predicate-select`, `claim-object-picker-*`, `claim-doc-picker-*`, `claim-doc-selected`, `claim-add-submit` 이다(`web/TESTIDS.md`).
- 보관은 `api.nodes.archive(id, expectedRevision, reason)` 다. 주장도 노드라 같은 API 다. 최신 revision 은 `api.nodes.get(id)` 로 읽는다. 근거 문서보다 주장을 먼저 보관해야 `409 LAST_EVIDENCE` 에 걸리지 않는다.
- 온톨로지는 ADMIN 이 바꿀 수 있다. 가이드가 쓰는 타입과 주장 종류의 표시 이름은 `useLabels()` 로 읽는다. `Document` 는 서버 코드가 이름으로 읽는 타입이라 빠지지 않는다. `Company` 와 `BELONGS_TO_SECTOR` 는 빠질 수 있다.
- 산업(Sector) 노드는 시작 때 들어간 것이 없을 수 있다. e2e 는 `1)` 등에서 산업을 만들지 않으므로, 이 phase 의 e2e 는 테스트 안에서 산업 하나를 먼저 만든다.

**근거 문서**: `financial-workbench/docs/flow.md` 의 「첫 접속 가이드」(편집자와 관리자의 따라하기 표와 그 아래 목록, 좁은 화면), `financial-workbench/docs/prd.md` 의 「만드는 것」 과 관측 항목, 「남은 한계」 의 연습 주장 항목

## 의도 메모

- 다음 단계로 가는 판단은 그 종류의 항목을 만들었는지만 본다. 사용자가 미리 채운 이름을 바꿔도 된다(`flow.md`).
- 끝내기, 그만두기, 건너뛰기 모두 연습 항목을 보관한다(사용자 결정 2026-10-21, 「연습 데이터는 끝나면 보관」).
- 가이드가 쓰는 정의가 온톨로지에서 빠졌으면 따라하기 대신 둘러보기를 연다. 가이드 때문에 화면이 깨지지 않게 하려는 것이다.

## 작업 항목

### 1. 순수 함수

`lib/guide.ts` 에 더한다.

- `PRACTICE_STEPS: GuideStep[]`: 소개, `company`(대상 `create-submit`, pane `search`), `document`(대상 `create-submit`, pane `search`), `claim`(대상 `claim-add-submit`, pane `detail`), `done`(대상 `graph-canvas`, pane `graph`). 제목과 본문은 `docs/flow.md` 「편집자와 관리자의 따라하기」 표의 말풍선이다. 「기업」, 「근거 문서」, 「속한다」, 「산업」 은 표시 이름으로 바꿀 수 있게 함수 `practiceSteps(labels)` 로 만든다.
- `practiceNames(displayName: string, startedAt: Date): { company: string; document: string }`: `[연습] <표시 이름> 기업 <MMDD-HHmm>`, `[연습] <표시 이름> 메모 <MMDD-HHmm>`.
- `practicePredicate(ontology): string | null`: `BELONGS_TO_SECTOR` 가 있고 주체에 `Company` 가 있으면 그것, 아니면 `Company` 를 주체로 받는 첫 주장 종류, 없으면 `null`.
- `practiceAvailable(ontology): boolean`: `Company`, `Document` 타입과 `practicePredicate` 가 모두 있으면 참.
- `archiveOrder(created): string[]`: `created` 의 `claim`, `document`, `company` 순서로 있는 ID 만.
- `GuideProgress.created` 에 `company`, `document`, `claim` 키로 만든 ID 를 담는다.

### 2. 가이드 상태

`components/guide/GuideProvider.tsx`

- 편집자와 관리자(`canEditRole(role)`)이고 `practiceAvailable(ontology)` 면 `practice`, 아니면 `browse` 로 연다(자동 시작과 「사용법」 모두).
- `report(event: { kind: 'node-created' | 'claim-created'; node: NodeView })`: 지금 단계가 `company` 이고 `node.type === 'Company'` 면 `created.company` 에 담고 다음 단계, `document` 이고 `Document` 면 `created.document`, `claim` 이고 `claim-created` 면 `created.claim` 에 담고 다음 단계다. 그 밖의 이벤트는 무시한다. 단계가 바뀌면 `writeProgress` 한다.
- `prefill`: 지금 단계가 `company` 면 `{ type: 'Company', values: { name } }`, `document` 면 `{ type: 'Document', values: { title, url: 'https://example.com/practice', documentType: 'OTHER' } }`(속성이 그 타입에 없으면 그 값만 뺀다), `claim` 이면 `{ subjectId: created.company, predicate, documentId: created.document }`.
- 단계에 들어갈 때 화면을 맞춘다. `company`, `document` 는 작업 공간으로 가고, `claim` 은 `/workspace?node=<company>` 로 연습 기업 상세를 연다(좁은 화면은 `pane=detail`). `done` 은 연습 기업을 그래프 중심으로 연다. 모두 `replace` 다.
- `finish()`, `skip()` 이 `practice` 면 먼저 `archiveOrder(created)` 순서로 `api.nodes.get` → `api.nodes.archive(id, revision, '첫 접속 가이드 연습 항목')` 한다. 이미 보관된 항목은 건너뛴다. 하나라도 실패하면 말풍선 대신 아래쪽 안내(`guide-archive-failed`)에 「연습 항목 하나를 보관하지 못했습니다. 이름을 눌러 직접 보관하세요.」 와 그 항목 이름(누르면 상세를 연다)을 보인다. 그래도 `guideDone()` 은 부르고 진행 상태를 지운다.
- 진행 중인 `practice` 가 저장소에 있으면(새로고침, 다시 로그인) 소개 단계 대신 「이어서 하기」(`guide-resume`)와 「그만두기」(`guide-stop`, 보관한 뒤 끝)를 묻는다.

### 3. 화면 연결

- `NodeCreateForm.tsx`: prop `initialValues?: Record<string, string>` 를 더해 `initialCreateValues(defs)` 위에 덮어쓴다. 폼 값의 형식(`FormValues`)을 `lib/formValues.ts` 에서 확인하고 맞춘다.
- `SearchPanel.tsx`: 가이드의 `prefill.type` 이 있고 지금 폼이 닫혀 있으면 `createType` 을 그 타입으로, `creating` 을 `true` 로 열고 `NodeCreateForm` 에 `initialValues`(와 `key` 에 단계 id)를 넘긴다. `onCreated` 가 성공하면 가이드에 `report({ kind: 'node-created', node })` 한다. 가이드가 꺼져 있으면 지금과 같다.
- `ClaimCreateForm.tsx`: prop `initialPredicate?: string`, `initialDocuments?: NodeView[]` 를 더한다. 주어진 주장 종류가 주체 타입을 받지 않으면 무시한다.
- `DetailPanel.tsx`: 가이드의 `prefill.subjectId` 가 지금 노드면 `addingClaim` 을 `true` 로 열고, `initialPredicate`, 근거 문서(`api.nodes.get(documentId)` 로 읽은 `NodeView`)를 넘긴다. `onCreated` 가 성공하면 가이드에 `report({ kind: 'claim-created', node: claim })` 한다.
- 가이드 context 가 없는 렌더링(단위 테스트, 가이드 꺼짐)에서도 이 컴포넌트들이 지금처럼 동작하게, context 기본값은 `active: false` 와 빈 함수다.

### 4. 문서

- `web/TESTIDS.md` 에 `guide-resume`, `guide-stop`, `guide-archive-failed` 를 적고, `guide-bubble` 의 `data-step` 값에 `company`, `document`, `claim`, `done` 을 적는다.

### 5. 이 phase 를 검증하는 테스트

- `lib/guide.test.ts` 에 더한다: `practiceNames('관리자', new Date('2026-10-23T14:05:00+09:00'))` 의 기업 이름이 `[연습] 관리자 기업 1023-1405` 다(시간대는 테스트에서 고정한다). `practicePredicate` 가 저장소 온톨로지에서 `BELONGS_TO_SECTOR`, 그것을 뺀 온톨로지에서 Company 를 주체로 받는 다른 주장 종류, Company 를 뺀 온톨로지에서 `null` 이다. `archiveOrder({ company: 'c', document: 'd', claim: 'm' })` 가 `['m', 'd', 'c']`, `archiveOrder({ company: 'c' })` 가 `['c']` 다.
- `components/guide/guide.test.tsx` 에 더한다: `practice` 의 `company` 단계 말풍선이 표시 이름 「기업」 을 담는다. `NodeCreateForm` 에 `initialValues={{ name: '[연습] A 기업' }}` 를 넘겨 정적 렌더링하면 `create-prop-name` 의 값이 그 이름이다(`screens.test.tsx` 의 렌더링 방식을 따른다).
- `web/e2e/workbench.spec.ts` 의 `10)` 뒤에 `11) 편집자는 처음 로그인하면 연습 기업, 근거 문서, 주장을 따라 만들고, 끝내면 연습 항목이 보관된다` 를 더한다.
  1. `pageAdmin` 으로 산업 하나(`가이드산업-<suffix>`)를 만든다(기존 테스트의 노드 만들기 도우미를 쓴다).
  2. 새 컨텍스트로 `loginAs(page, guideEditor, 'success', '/', { guide: 'keep' })` → 소개 → `guide-start`.
  3. `company` 단계: `create-prop-name` 의 값이 `[연습] ` 으로 시작한다 → `create-submit` → `guide-bubble` 의 `data-step` 이 `document`.
  4. `document` 단계: `create-prop-title` 이 채워져 있다 → `create-submit` → `claim` 단계이고 `detail-panel` 이 연습 기업이다.
  5. `claim` 단계: `claim-predicate-select` 가 `BELONGS_TO_SECTOR`, `claim-doc-selected` 에 연습 문서가 있다 → 대상 고르기로 1번의 산업을 고른다 → `claim-add-submit` → `done` 단계. `shot(page, '11-guide-practice-done')`.
  6. `guide-finish` → 가이드가 사라진다. 연습 기업 이름으로 검색하면 결과가 없고, 「보관 포함」 으로 검색하면 보관됨으로 나온다. 연습 주장과 문서도 보관됐다(`GET /api/nodes/<id>` 의 `archived`).
  7. 새로고침해도 가이드가 열리지 않는다.
- `web/e2e/workbench.spec.ts` 에 `11b) 따라하기 도중 새로고침하면 이어서 하기를 묻고, 그만두면 만든 연습 항목을 보관한다` 를 더한다. `pageAdmin` 이 `guide-open` → `guide-start` → 기업을 만든다 → 새로고침 → `guide-resume` 과 `guide-stop` 이 보인다 → `guide-stop` → 그 연습 기업이 보관됐다.

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
| `financial-workbench/web/src/components/NodeCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/components/SearchPanel.tsx` | 수정 |
| `financial-workbench/web/src/components/ClaimCreateForm.tsx` | 수정 |
| `financial-workbench/web/src/components/DetailPanel.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
