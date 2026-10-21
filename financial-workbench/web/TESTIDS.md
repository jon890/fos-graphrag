# data-testid 목록

e2e 테스트가 기대는 셀렉터다. 이름을 바꾸면 `e2e/workbench.spec.ts` 와 `e2e/mobile.spec.ts` 도 함께 고친다.
`*` 표시는 같은 화면에 여러 개 나오는 요소다. `filter({ hasText })` 나 `data-*` 속성으로 좁힌다.

## 로그인과 상단

| testid | 요소 |
| --- | --- |
| `app-loading` | 세션 확인 중 표시 |
| `login-form` | 로그인 화면 |
| `login-google` | 「Google 로 로그인」. `/oauth2/authorization/google` 로 브라우저가 이동한다 |
| `login-denied` | `/?login=denied` 로 돌아왔을 때 「접근 권한이 없습니다」 안내. `login-google` 도 함께 보인다 |
| `login-notice` | 세션이 끊겨 돌아왔을 때의 안내 |
| `tab-workspace`, `tab-list`, `tab-review`, `tab-changes`, `tab-ontology` | 상단 탭 |
| `tab-users` | 사용자 탭. ADMIN 에게만 나온다 |
| `current-user-name`, `current-user-email` | 로그인 사용자의 표시 이름, 이메일 |
| `current-user-role` | 역할 배지. `data-role` 이 VIEWER, EDITOR, ADMIN |
| `logout-button` | 로그아웃 |
| `ontology-error` | 온톨로지를 받지 못했을 때 |

## 작업 공간: 좁은 화면

폭 1024px 미만에서만 나온다. 세 칸을 모두 그려 두고 고르지 않은 탭만 숨긴다.

| testid | 요소 |
| --- | --- |
| `workspace-tab-search`, `workspace-tab-graph`, `workspace-tab-detail` | 검색, 그래프, 상세 탭. `aria-selected` 로 고른 탭을 본다 |
| `graph-selection-bar` | 그래프 탭 아래의 선택 막대. 고른 노드가 그래프에 있을 때만 나온다 |
| `graph-selection-open` | 막대의 「<이름> 상세 보기」 단추. 누르면 상세 탭으로 간다 |

## 작업 공간: 왼쪽

| testid | 요소 |
| --- | --- |
| `search-input`, `search-submit` | 검색어(q)와 검색 버튼 |
| `filter-type-Company` 등 `filter-type-<타입>` | 타입 필터 체크박스. 주변 그래프에도 적용된다 |
| `filter-review-status` | Claim 검토 상태 select(`""`, DRAFT, REVIEWED, REJECTED) |
| `filter-include-archived` | 「보관 포함」 체크 |
| `search-results` | 결과 영역 |
| `search-result` * | 결과 한 줄. `data-node-id`, `data-node-type`. 이름은 안쪽 `.result-label` |
| `search-empty` | 결과 없음 |
| `search-pager-prev`, `search-pager-next`, `search-pager-info` | 결과가 2쪽 이상일 때 |
| `new-node-type`, `new-node-button` | 새 노드 타입 select 와 만들기 버튼. VIEWER 에게는 없다 |
| `viewer-create-hint` | VIEWER 에게 보이는 「노드를 만들 수 없습니다」 안내 |
| `create-form`, `create-submit`, `create-cancel`, `create-error` | 새 노드 폼 |
| `create-prop-<속성>` | 새 노드 폼의 속성 입력. 예: `create-prop-name`, `create-prop-market` |
| `create-prop-<속성>-error` | 그 속성의 오류 |

## 작업 공간: 가운데 그래프

| testid | 요소 |
| --- | --- |
| `graph-hops` | 홉 수 select(1, 2) |
| `graph-expand` | 선택 노드 이웃 확장(더블클릭과 같다) |
| `graph-recenter` | 선택 노드를 새 중심으로 다시 불러온다 |
| `graph-fit` | 화면 맞춤 |
| `graph-status` | 「항목 N · 관계 M」. N 은 「그래프에 나온 항목」 수, M 은 그린 관계와 접은 주장 선을 합한 수 |
| `graph-claims-as-nodes` | 「주장을 따로 보기」 체크 상자. 켜면 주장을 노드로 그린다. 작업 공간을 떠날 때까지 남는다 |
| `graph-loading`, `graph-error` | 로딩, 오류(서버 `message`) |
| `graph-truncated` | 「결과가 잘렸습니다(최대 노드 N, 관계 M)」 |
| `graph-empty` | 선택한 노드가 없음 |
| `graph-no-neighbors` | 이웃이 없음 |
| `graph-canvas` | Cytoscape 컨테이너. `data-layout-pending` 이 `"true"` 면 숨겨진 동안 생긴 요소의 배치를 미뤄 둔 상태이고, 다시 보여 배치를 돌리면 `"false"` 다. `data-collapsed-claims` 는 선으로 접은 주장 수이고, 「주장을 따로 보기」 를 켜면 `"0"` 이다 |
| `graph-legend` | 타입별 색 범례 |
| `graph-node-list` | 그래프에 올라간 노드 목록(캔버스 대신 검증용으로 쓴다) |
| `graph-node` * | 목록 한 줄. `data-node-id`, `data-node-type`, `data-review-status`, `data-collapsed`(`"true"` 면 선으로 접힌 주장). 접힌 주장에만 걸린 근거 문서는 목록에 없다. 안의 button 을 누르면 선택된다 |

## 작업 공간: 오른쪽 상세

VIEWER 에게는 `node-save`, `node-archive-*`, `node-restore-button`, `relationship-add-toggle`, `relationship-archive-toggle`, `claim-add-toggle`, `review-controls`, `claim-edit-form` 이 나오지 않는다. `edit-prop-*` 입력은 비활성이다.

| testid | 요소 |
| --- | --- |
| `detail-empty`, `detail-error` | 선택 없음, 상세 조회 실패 |
| `detail-panel` | 상세 전체. `data-node-id`, `data-node-type` |
| `detail-label`, `detail-archived` | 노드 이름, 「보관됨」 표시 |
| `detail-notice` | 저장, 보관 결과 안내. `data-kind` 가 `success`, `conflict`(409 REVISION_CONFLICT), `error` |
| `viewer-hint` | VIEWER 에게 보이는 「조회만 할 수 있습니다」 안내 |
| `node-history-link` | 「이 노드 이력」. 변경 이력 탭으로 가며 targetId 필터를 채운다 |
| `node-center-graph` | 이 노드를 그래프 중심으로 |
| `node-archive-reason`, `node-archive-button` | 보관 사유와 보관 버튼(보관되지 않은 노드) |
| `node-restore-button` | 복원 버튼(보관된 노드) |
| `node-meta`, `node-revision`, `node-updated-by` | 메타 정보 |
| `node-edit-form`, `node-save`, `node-edit-local-message` | 속성 수정 폼(Claim 이 아닌 노드) |
| `edit-prop-<속성>` | 수정 폼의 속성 입력. 예: `edit-prop-description` |
| `relationship-section` | 관계 영역 |
| `relationship-row` * | 관계 한 줄. `data-rel-type` |
| `relationship-archive-toggle` * | 관계 보관 또는 복원 |
| `relationship-add-toggle`, `relationship-add-form` | 「관계 추가」 |
| `relationship-type-select` | 값은 `<타입>:out`(이 노드가 시작점) 또는 `<타입>:in`(이 노드가 끝점). 예: Security 에서는 `ISSUES:in` |
| `relationship-target-picker-*` | 대상 노드 고르기(아래 「노드 고르기」) |
| `relationship-target-selected`, `relationship-add-submit`, `relationship-add-error` | 고른 대상, 추가, 오류 |
| `node-claims-section` | 이 노드에 걸린 Claim 영역 |
| `claim-add-toggle`, `claim-add-form` | 「Claim 추가」 |
| `claim-predicate-select` | predicate select |
| `claim-object-picker-*`, `claim-object-selected` | 목적어 고르기, 고른 목적어 |
| `claim-doc-picker-*`, `claim-doc-selected` * | 근거 문서 고르기, 고른 문서 |
| `claim-doc-create-toggle` | 「문서 새로 등록」 |
| `claim-doc-create-form`, `claim-doc-create-prop-<속성>`, `claim-doc-create-submit` | 그 자리에서 문서를 만드는 폼 |
| `claim-description`, `claim-evidence` | 설명, 근거 문장 |
| `claim-valid-from-input`, `claim-valid-to-input` | 유효기간(선택) |
| `claim-add-submit`, `claim-add-error` | 만들기, 오류 |

## Claim 카드와 Claim 노드 상세

| testid | 요소 |
| --- | --- |
| `claim-card` * | Claim 한 개. `data-claim-id`, `data-review-status` |
| `claim-predicate`, `claim-subject`, `claim-object` | 관계 종류의 표시 이름(예: 공급한다), 주어, 목적어 |
| `claim-description-text`, `claim-evidence-text` | 설명, 근거 문장 |
| `claim-document` *, `claim-document-title` * | 출처 문서와 제목 링크 |
| `claim-valid-from`, `claim-valid-to` | 유효기간. 값이 없으면 「미상」 |
| `claim-author` | 작성자 표시 이름 |
| `claim-reviewer`, `claim-reviewed-at`, `claim-review-note` | 검토자 표시 이름, 검토 시각, 메모 |
| `claim-open` | 「Claim 열기」(Claim 노드를 상세로 연다) |
| `review-status-badge` * | 검토 상태 배지 |
| `review-controls` | Claim 노드 상세의 검토 영역 |
| `review-note`, `review-approve`, `review-reject`, `review-draft` | 메모, 검토 완료, 반려, 초안으로 되돌리기 |
| `self-review-hint` | 자기 Claim 이라 검토 버튼이 꺼졌다는 안내 |
| `claim-edit-form`, `claim-edit-description`, `claim-edit-evidence`, `claim-edit-valid-from`, `claim-edit-valid-to`, `claim-edit-confidence`, `claim-edit-submit`, `claim-edit-message` | Claim 내용 수정 |

## 노드 고르기(NodePicker)

접두사 `<p>` 는 `relationship-target-picker`, `claim-object-picker`, `claim-doc-picker` 가운데 하나다.

| testid | 요소 |
| --- | --- |
| `<p>-input`, `<p>-search` | 검색어와 검색 버튼(Enter 도 된다) |
| `<p>-result` * | 결과 한 줄. `data-node-id` |
| `<p>-empty` | 결과 없음 |

## 목록 탭

| testid | 요소 |
| --- | --- |
| `list-tab`, `list-table` | 탭과 표 |
| `list-type-filter`, `list-search-input`, `list-search-submit`, `list-include-archived` | 필터 |
| `list-row` * | 행. `data-node-id`. 누르면 작업 공간에서 그 노드를 연다 |
| `list-empty` | 결과 없음 |
| `list-pager-prev`, `list-pager-next`, `list-pager-info` | 페이지 이동 |

## 검토 대기 탭

| testid | 요소 |
| --- | --- |
| `review-tab`, `review-table`, `review-refresh` | 탭, 표, 새로고침 |
| `review-row` * | 행. `data-claim-id` |
| `review-row-note`, `review-row-approve`, `review-row-reject` | 행 안의 메모, 검토 완료, 반려 |
| `review-own-hint` | 자기 Claim 이라 버튼이 꺼졌다는 안내 |
| `review-viewer-hint` | VIEWER 라 버튼이 꺼졌다는 안내 |
| `review-message`, `review-error`, `review-empty` | 처리 결과, 오류, 빈 목록 |
| `review-pager-prev`, `review-pager-next`, `review-pager-info` | 페이지 이동 |

## 변경 이력 탭

| testid | 요소 |
| --- | --- |
| `changes-tab`, `changes-table` | 탭과 표 |
| `changes-target-filter`, `changes-actor-filter`, `changes-filter-submit`, `changes-filter-clear` | targetId 필터, actor(이메일) 필터 |
| `change-row` * | 행. `data-action`(CREATE, UPDATE, REVIEW, ARCHIVE, RESTORE), `data-target-id` |
| `change-action` * | action 칸 |
| `changes-empty` | 이력 없음 |
| `changes-pager-prev`, `changes-pager-next`, `changes-pager-info` | 페이지 이동 |

## 온톨로지 탭

| testid | 요소 |
| --- | --- |
| `ontology-tab`, `ontology-version` | 탭, schemaVersion |
| `ontology-node-type` * | 노드 타입 한 개. `data-type` |
| `ontology-relationships`, `ontology-predicates` | 관계 타입 표, Claim predicate 표 |

## 사용자 탭 (ADMIN)

| testid | 요소 |
| --- | --- |
| `users-tab`, `users-table`, `users-refresh` | 탭, 표, 새로고침 |
| `users-add-form`, `users-add-email`, `users-add-name`, `users-add-role`, `users-add-submit` | 허용 사용자 추가 |
| `users-message` | 처리 결과. `data-kind` 가 `success` 나 `error`. 오류(LAST_ADMIN, REVISION_CONFLICT, DUPLICATE 등)는 서버 `message` |
| `users-row` * | 행. `data-email`, `data-enabled`(`true`, `false`) |
| `users-row-role`, `users-row-save` | 역할 select 와 저장 |
| `users-row-disable`, `users-row-enable` | 비활성화, 다시 활성화(상태에 따라 하나만 보인다) |
| `users-row-enabled`, `users-row-linked` | 「활성」/「비활성」, 「로그인함」/「첫 로그인 전」 |
| `users-row-history` | 그 사용자의 변경 이력 |
