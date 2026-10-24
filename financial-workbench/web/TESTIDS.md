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
| `tab-map`, `tab-workspace`, `tab-list` | 상단 탭(개념 지도, 작업 공간, 목록). `role=tab`, 고른 탭은 `aria-selected="true"` |
| `more-open` | 「더보기」 메뉴 단추. 메뉴의 화면(변경 이력, 온톨로지 상세, 검토 대기, 사용자)이 열려 있으면 `data-active="true"` |
| `more-item-<key>` | 더보기 메뉴 항목. `key` 는 `changes`, `ontology`, `review`(EDITOR, ADMIN), `users`(ADMIN). 열람자가 주소로 연 `/review` 도 `more-open` 이 `data-active="true"` 다 |
| `current-user-name`, `current-user-email` | 로그인 사용자의 표시 이름, 이메일 |
| `current-user-role` | 역할 배지. `data-role` 이 VIEWER, EDITOR, ADMIN |
| `guide-open` | 머리글의 「사용법」. 개념 지도나 작업 공간이 아니면 개념 지도로 옮겨 첫 접속 가이드를 처음부터 연다 |
| `logout-button` | 로그아웃 |
| `ontology-error` | 온톨로지를 받지 못했을 때 |
| `ontology-stale`, `ontology-reload` | 다른 곳에서 온톨로지 버전이 바뀌었다는 안내와 「다시 읽기」 단추. 응답 헤더의 버전이 들고 있는 버전보다 클 때만 나온다 |

## ＋ 추가

머리글의 「＋ 추가」 메뉴와 만들기 창이다. 메뉴와 창은 Portal 로 `body` 아래에 그려진다. 편집 권한이 없으면(VIEWER) 여는 단추가 없다.

| testid | 요소 |
| --- | --- |
| `add-open` | 머리글의 「＋ 추가」 단추. 좁은 화면에서는 ＋ 만 보이고 `aria-label="추가"` 다. 온톨로지를 받기 전에는 없다 |
| `add-type-<타입>` * | 메뉴의 타입 줄. 타입 순서대로이고 주장(`add-type-Claim`)은 맨 아래 구분선 밑에 있다. 주장 종류가 없으면 주장 줄이 없다 |
| `add-dialog` | 만들기 창. `data-type` 이 고른 타입이다. 주장이면 안에 주장 만들기 폼(`claim-add-form`)이 있다 |
| `add-steps` | 창 위쪽의 단계 표시(「1. 종류 고르기」, 「2. 내용 적기」, 「3. 연결하기」). 주장과 고르기 칸이 없는 타입은 3단계가 없다 |
| `graph-add` | 작업 공간 그래프 오른쪽 아래의 둥근 ＋ 단추. `add-open` 과 같은 메뉴를 연다 |
| `map-add-type` | 개념 지도 타입 칸의 「＋ {타입} 추가」. 메뉴 없이 그 타입의 창을 연다 |
| `create-optional-toggle` | 「선택 항목 더 보기」. `aria-expanded`. 선택 속성이 없는 타입에는 없다. 선택 속성에 오류가 생기면 저절로 펼친다 |
| `create-form`, `create-submit`, `create-cancel`, `create-error` | 만들기 창의 폼 |
| `create-prop-<속성>` | 만들기 창 폼의 속성 입력. 선택 속성은 `create-optional-toggle` 을 눌러야 나온다. 예: `create-prop-name`, `create-prop-market` |
| `create-prop-<속성>-error` | 그 속성의 오류 |
| `create-duplicate` | 같은 이름 경고(`role=status`). 저장 전에 같은 이름이 있으면 나온다 |
| `create-duplicate-item` * | 경고의 후보 한 줄. `data-node-id` |
| `create-duplicate-open` | 후보의 「열기」 단추. `claim-doc-create-` 에서는 「이 문서 고르기」 |
| `create-duplicate-confirm` | 「그래도 만들기」 단추 |
| `create-link-<관계>-picker-*` | 만들기 창 폼의 시작 노드 고르기(NodePicker). 예: `create-link-ISSUES-picker-input` |
| `create-link-<관계>-selected` | 고른 시작 노드 |
| `create-link-<관계>-clear` | 「다시 고르기」 단추 |

`create-duplicate*` 와 `create-link-*` 는 근거 문서 등록 폼에서 `claim-doc-create-` 접두사로도 생긴다.

## 첫 접속 가이드

`guideDoneAt` 이 없는 사용자가 개념 지도나 작업 공간에 들어오거나 「사용법」(`guide-open`)을 누르면 열린다. `e2e/support.ts` 의 `loginAs` 는 기본으로 가이드를 건너뛴다. 가이드를 확인하는 테스트만 `{ guide: 'keep' }` 을 넘긴다.

| testid | 요소 |
| --- | --- |
| `guide-bubble` | 말풍선(`role=dialog`). `data-step` 이 단계 id 다. 둘러보기는 `intro`, `map`, `search`, `graph`, `detail`, 따라하기는 `intro`, `company`, `document`, `claim`, `done` 이다. 진행 중인 따라하기를 이어서 할지 묻는 단계는 `resume` 이다. `data-placement` 는 `anchored`(대상 옆) 또는 `card`(화면 아래쪽 카드)다 |
| `guide-start` | 소개 단계의 「시작」 |
| `guide-next` | 둘러보기 중간 단계의 「다음」. 따라하기의 만드는 단계에는 없다 |
| `guide-finish` | 마지막 단계의 「끝내기」 |
| `guide-skip` | 「건너뛰기」. 둘러보기의 모든 단계와 따라하기의 소개에 있다. 말풍선 안에 초점이 있을 때 `Escape` 도 같다 |
| `guide-stop` | 따라하기의 기업, 근거 문서, 주장 단계와 `resume` 단계의 「그만두기」. 만든 연습 항목을 보관하고 끝낸다 |
| `guide-resume` | `resume` 단계의 「이어서 하기」. 저장된 단계로 연다 |
| `guide-reopen` | 「폼 다시 열기」. 따라하기의 주장 단계에서 주장 폼을 취소했을 때만 나온다. 기업과 근거 문서 단계에서 창을 닫으면 말풍선은 다시 `add-open` 을 가리킨다 |
| `guide-message` | 끝낸 기록을 남기지 못했거나 연습 항목을 보관하지 못했을 때 머리글 아래 안내 |
| `guide-archive-failed` | `guide-message` 안의 보관하지 못한 연습 항목 이름 한 줄. 누르면 `/workspace?node=<id>` 로 연다 |

가이드가 가리키는 요소에는 class `guide-target` 이 붙는다. 단계가 바뀌거나 가이드가 닫히면 떨어진다.
따라하기의 기업과 근거 문서 단계는 만들기 창이 열려 있으면 `create-submit`, 아니면 `add-open` 을 가리킨다. 말풍선은 창 위에 보이고, 말풍선을 눌러도 창이 닫히지 않는다.

## 개념 지도

첫 화면(`/map`)이다. `e2e/support.ts` 의 `loginAs` 는 `/` 로 들어오면 `tab-map` 과 `concept-map` 이 보일 때까지 기다린다.

| testid | 요소 |
| --- | --- |
| `concept-map` | 개념 지도 화면 전체 |
| `map-intro` | 지도 위 소개(「투자 지식 지도」) |
| `map-counts-error` | 항목 수(`GET /api/nodes/counts`)를 받지 못했을 때의 안내와 이유 |
| `map-empty` | 모든 타입의 항목 수가 0 일 때의 안내 |
| `concept-map-canvas` | Cytoscape 컨테이너. `data-node-count` 는 그린 타입 노드 수, `data-layout-done` 은 배치가 끝나면 `"true"` |
| `map-claim-note` | 지도 아래 「주장은 어느 항목에나 붙일 수 있습니다」 와 주장 수. 주장 타입이 온톨로지에 없으면 없다 |
| `map-type-list` | 타입 목록 |
| `map-type` * | 타입 단추. `data-type`, 고른 타입은 `aria-pressed="true"`. 순서는 타입 순서다 |
| `map-type-count` * | 타입 단추 안의 항목 수. 개수를 받지 못하면 없다 |
| `map-type-panel` | 고른 타입의 칸. `data-type`. 주소의 `type` 이 지도에 있는 타입일 때만 나온다 |
| `map-type-description` | 타입 설명 |
| `map-recent-item` * | 최근 항목 한 줄. `data-node-id`. 누르면 작업 공간에서 그 항목의 상세를 연다 |
| `map-recent-empty`, `map-recent-error` | 최근 항목이 없음, 받지 못한 오류 |
| `map-relation` * | 관계 문장 한 줄. `data-relationship` |
| `map-open-list`, `map-open-workspace` | 「목록에서 보기」, 「작업 공간에서 보기」 |

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
| `filter-type-Company` 등 `filter-type-<타입>` | 종류 칩 단추. `aria-pressed` 로 눌림을 보인다. 주변 그래프에도 적용된다 |
| `advanced-filters` | 「고급 필터」 `<details>`. 기본은 접힘이고 열림은 주소에 두지 않는다 |
| `advanced-filters-toggle` | 고급 필터의 `<summary>`. 바뀐 조건이 있으면 「고급 필터 (N)」 |
| `filter-review-status` | (고급 필터 안) Claim 검토 상태 select(`""`, DRAFT, REVIEWED, REJECTED) |
| `filter-include-archived` | (고급 필터 안) 「보관 포함」 체크 |
| `graph-hops` | (고급 필터 안) 이웃 단계 select(1, 2) |
| `graph-claims-as-nodes` | (고급 필터 안) 「주장을 따로 보기」 체크 상자. 켜면 주장을 노드로 그린다. 작업 공간을 떠날 때까지 남는다 |
| `search-results` | 결과 영역 |
| `search-result` * | 결과 한 줄. `data-node-id`, `data-node-type`. 이름은 안쪽 `.result-label` |
| `search-result-hint` * | 결과 한 줄의 구분 정보(`hintProperties` 값과 만든 날) |
| `search-empty` | 결과 없음 |
| `search-pager-prev`, `search-pager-next`, `search-pager-info` | 결과가 2쪽 이상일 때 |

## 작업 공간: 가운데 그래프

| testid | 요소 |
| --- | --- |
| `graph-expand` | 선택 노드 이웃 확장(더블클릭과 같다) |
| `graph-recenter` | 선택 노드를 새 중심으로 다시 불러온다 |
| `graph-fit` | 화면 맞춤 |
| `graph-status` | 「항목 N · 관계 M」. N 은 「그래프에 나온 항목」 수, M 은 그린 관계와 접은 주장 선을 합한 수 |
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
| `workspace-pane-detail` | 상세 칸. 넓은 화면에서는 오른쪽 칸(`aside.pane-right`), 좁은 화면에서는 상세 탭의 내용이다. 항목을 고르지 않아도 있다 |
| `detail-empty`, `detail-error` | 선택 없음, 상세 조회 실패 |
| `detail-panel` | 상세 전체. `data-node-id`, `data-node-type` |
| `detail-label`, `detail-archived` | 노드 이름, 「보관됨」 표시 |
| `detail-notice` | 저장, 보관 결과 안내. `data-kind` 가 `success`, `conflict`(409 REVISION_CONFLICT), `error` |
| `viewer-hint` | VIEWER 에게 보이는 「조회만 할 수 있습니다」 안내 |
| `node-history-link` | 「이 노드 이력」. 변경 이력 탭으로 가며 targetId 필터를 채운다 |
| `node-center-graph` | 이 노드를 그래프 중심으로 |
| `node-copy-link`, `node-copy-link-done`, `node-copy-link-fallback` | 「링크 복사」 단추, 복사했다는 안내, 클립보드를 못 쓸 때 주소를 보이는 읽기 전용 입력칸. 열람자에게도 보인다 |
| `node-archive-reason`, `node-archive-button` | 보관 사유와 보관 버튼(보관되지 않은 노드) |
| `node-restore-button` | 복원 버튼(보관된 노드) |
| `node-meta`, `node-revision`, `node-updated-by` | 메타 정보 |
| `node-edit-form`, `node-save`, `node-edit-local-message` | 속성 수정 폼(Claim 이 아닌 노드) |
| `node-undefined-type` | 온톨로지에서 빠진 타입의 노드일 때 폼 대신 나오는 안내. 속성은 읽기 전용으로 보이고 주장 추가 단추는 없다 |
| `edit-conflict`, `edit-conflict-field` *(`data-field`, `data-kind` 가 `theirs`, `mine`, `both`)*, `edit-conflict-choice-<속성>-mine`, `edit-conflict-choice-<속성>-latest`, `edit-conflict-apply`, `edit-conflict-discard` | 409 뒤 내 입력과 최신 값의 칸별 비교. 다시 읽은 뒤 되살릴 입력이 있을 때만 나온다 |
| `edit-prop-<속성>` | 수정 폼의 속성 입력. 예: `edit-prop-description` |
| `edit-prop-<속성>-unlisted` | 저장된 값이 목록 밖일 때만 나오는 선택지 |
| `relationship-section` | 관계 영역 |
| `relationship-row` * | 관계 한 줄. `data-rel-type` |
| `relationship-archive-toggle` * | 관계 보관 또는 복원. 정의에서 빠진 관계 종류에는 없다 |
| `relationship-undefined` * | 「정의에서 빠진 관계」 배지. 온톨로지에 없는 관계 종류의 행에만 나온다 |
| `relationship-add-toggle`, `relationship-add-form` | 「관계 추가」 |
| `relationship-type-select` | 값은 `<타입>:out`(이 노드가 시작점) 또는 `<타입>:in`(이 노드가 끝점). 예: Security 에서는 `ISSUES:in` |
| `relationship-target-picker-*` | 대상 노드 고르기(아래 「노드 고르기」) |
| `relationship-target-selected`, `relationship-add-submit`, `relationship-add-error` | 고른 대상, 추가, 오류 |
| `node-claims-section` | 이 노드에 걸린 Claim 영역 |
| `claim-add-toggle`, `claim-add-form` | 「주장 추가」 와 주장 만들기 폼(왼쪽 「주장」 선택지에서도 열린다) |
| `claim-predicate-select` | predicate select |
| `claim-sentence`, `claim-sentence-text` * | 문장 틀, 문장 틀의 칸 사이 글 |
| `claim-subject-picker-*`, `claim-subject-selected` | 주체 고르기, 고른 주체 |
| `claim-object-picker-*`, `claim-object-selected` | 대상 고르기, 고른 대상 |
| `claim-swap` | 「주체와 대상 바꾸기」 |
| `claim-doc-picker-*`, `claim-doc-selected` * | 근거 문서 고르기, 고른 문서 |
| `claim-doc-create-toggle` | 「문서 새로 등록」 |
| `claim-doc-create-form`, `claim-doc-create-prop-<속성>`, `claim-doc-create-submit` | 그 자리에서 문서를 만드는 폼 |
| `claim-description`, `claim-evidence` | 설명, 근거 문장 |
| `claim-valid-from-input`, `claim-valid-to-input` | 유효기간(선택) |
| `claim-add-submit`, `claim-add-cancel`, `claim-add-error` | 만들기, 취소, 오류 |

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
| `self-review-hint` | 내가 쓰거나 마지막으로 고친 Claim 이라 검토 버튼이 꺼졌다는 안내 |
| `self-review-copy-link`, `self-review-copy-link-done`, `self-review-copy-link-fallback` | 그 안내 안의 「링크 복사」 |
| `claim-edit-form`, `claim-edit-description`, `claim-edit-evidence`, `claim-edit-valid-from`, `claim-edit-valid-to`, `claim-edit-confidence`, `claim-edit-submit`, `claim-edit-message` | Claim 내용 수정 |

## 노드 고르기(NodePicker)

접두사 `<p>` 는 `relationship-target-picker`, `claim-subject-picker`, `claim-object-picker`, `claim-doc-picker`, `create-link-ISSUES-picker`, `create-link-AUTHORED-picker`(근거 문서 폼의 「저자」) 가운데 하나다.

| testid | 요소 |
| --- | --- |
| `<p>-input`, `<p>-search` | 검색어와 검색 버튼(Enter 도 된다) |
| `<p>-result` * | 결과 한 줄. `data-node-id` |
| `<p>-result-hint` * | 결과 한 줄의 구분 정보 |
| `<p>-empty` | 결과 없음 |
| `<p>-none` | 고를 후보가 하나도 없을 때의 안내(예: 「먼저 기업을 만드세요」) |

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
| `review-tab`, `review-refresh` | 탭, 새로고침(두 구역을 모두 다시 읽는다) |
| `review-section-reviewable`, `review-section-mine` | 편집자의 두 구역: 내가 검토할 주장, 내가 쓰거나 고친 주장. 열람자에게는 구역이 없고 `review-table` 한 목록만 있다 |
| `review-table` | 구역 1(열람자는 유일한) 표 |
| `review-mine-table`, `review-mine-row` *, `review-mine-empty`, `review-mine-pager-prev`, `review-mine-pager-next`, `review-mine-pager-info` | 구역 2 의 표, 행(`data-claim-id`), 빈 목록, 페이지 이동 |
| `review-mine-copy-link`, `review-mine-copy-link-done`, `review-mine-copy-link-fallback` | 구역 2 행의 「링크 복사」 |
| `review-row` * | 행. `data-claim-id` |
| `review-row-note`, `review-row-approve`, `review-row-reject` | 행 안의 메모, 검토 완료, 반려 |
| `review-own-hint` | 자기 Claim 이라 버튼이 꺼졌다는 안내 |
| `review-viewer-hint` | VIEWER 라 버튼이 꺼졌다는 안내 |
| `review-message`, `review-error`, `review-empty` | 처리 결과, 처리 오류, 구역 1 의 빈 목록 |
| `review-load-error`, `review-mine-load-error` | 구역 목록을 읽지 못한 오류 |
| `review-pager-prev`, `review-pager-next`, `review-pager-info` | 페이지 이동 |

## 변경 이력 탭

| testid | 요소 |
| --- | --- |
| `changes-tab`, `changes-table` | 탭과 표 |
| `changes-target-picker-input`, `changes-target-picker-search`, `changes-target-picker-result` *(`data-node-id`)*, `changes-target-picker-empty`, `changes-target-picker-none` | 대상 고르기. 대상이 골라지지 않았을 때만 보인다. 이름이나 종목 코드로 찾는다 |
| `changes-target-selected`, `changes-filter-clear` | 고른 대상(타입 배지와 이름)과 「지우기」 |
| `changes-actor-filter` | 사용자 select. 선택지는 표시 이름이고 값은 이메일, `''` 은 「(모두)」 |
| `change-row` * | 행. `data-action`(CREATE, UPDATE, REVIEW, ARCHIVE, RESTORE), `data-target-id`. 수정 번호는 열이 아니라 행 `title` 에 있다 |
| `change-actor` * | 행의 사용자 칸 |
| `change-action` * | action 칸 |
| `changes-empty` | 이력 없음 |
| `changes-pager-prev`, `changes-pager-next`, `changes-pager-info` | 페이지 이동 |

## 온톨로지 탭

| testid | 요소 |
| --- | --- |
| `ontology-tab`, `ontology-version` | 탭, 버전 번호(「버전 N」) |
| `ontology-node-type` * | 노드 타입 한 개. `data-type` |
| `ontology-relationships`, `ontology-predicates` | 관계 타입 표, Claim predicate 표 |
| `ontology-message` | 저장이나 되돌리기 결과. `data-kind` 가 `success` |

ADMIN 에게만 나오는 요소다.

| testid | 요소 |
| --- | --- |
| `ontology-edit-form`, `ontology-edit-yaml`, `ontology-history-open` | 「폼으로 편집」, 「YAML 로 편집」, 「버전 기록」 |
| `ontology-export` | 「YAML 내려받기」 링크 |
| `ontology-yaml-editor`, `ontology-yaml-help`, `ontology-yaml-input`, `ontology-yaml-error` | YAML 편집기, 접힌 도움말, YAML 입력칸, 초안을 읽지 못한 오류 |
| `ontology-preview`, `ontology-preview-failed`, `ontology-draft-discard` | 「저장 전에 확인」, 미리보기 요청 오류, 「초안 버리기」. 폼과 YAML 편집기가 같은 id 를 쓴다 |
| `ontology-yaml-to-form`, `ontology-yaml-back-to-form` | YAML 편집기의 「폼으로 보기」, 폼 초안을 YAML 로 옮기지 못했을 때의 「폼으로 돌아가기」 |
| `ontology-form`, `ontology-form-convert-error`, `ontology-form-back-to-yaml` | 폼 편집기, YAML 을 폼으로 옮기지 못한 오류, 「YAML 로 돌아가기」 |
| `ontology-form-type` *(`data-type`)*, `ontology-form-type-label` | 노드 타입 카드, 그 표시 이름 입력칸 |
| `ontology-form-prop` *(`data-prop`)*, `ontology-form-required`, `ontology-form-enum-value` *(`data-value`)* | 속성 한 줄, 필수 확인란, enum 값 한 줄 |
| `ontology-form-rel` *(`data-rel`)*, `ontology-form-predicate` *(`data-predicate`)* | 관계 종류 행, 주장 종류 행 |
| `ontology-form-rel-sentence` | 관계 종류 행의 문장 틀 입력칸 |
| `ontology-form-new-sentence` | 더하기 줄의 문장 틀 입력칸. 주장 종류와 관계 종류가 같은 이름을 쓴다 |
| `ontology-form-remove`, `ontology-form-restore` | 「빼기」, 「되살리기」(뺄 예정인 행에만 나온다) |
| `ontology-form-type-add`, `ontology-form-prop-add`, `ontology-form-rel-add`, `ontology-form-predicate-add` | 「노드 타입 더하기」, 「속성 더하기」(타입 카드 안), 「관계 종류 더하기」, 「주장 종류 더하기」 |
| `ontology-form-new` | 더하기 입력 영역. 안에 `ontology-form-new-key`, `-new-type`(속성 값 타입), `-new-label`, `-new-values`(enum 값), `-new-sentence`(문장 틀), `-new-submit`(「더하기」) |
| `ontology-form-error`, `ontology-form-emptied` | 키나 문장 틀 오류, 「이 종류도 함께 빼야 합니다」 |
| `ontology-form-to-yaml` | 폼의 「YAML 로 보기」 |
| `ontology-preview-panel` | 미리보기 결과 |
| `ontology-preview-error` * | 틀린 YAML 이나 저장 거절의 오류 한 줄 |
| `ontology-diff-added`, `ontology-diff-removed`, `ontology-diff-changed`, `ontology-diff-empty` | 더함, 뺌, 바뀜 경로 목록과 「바뀐 점이 없습니다」 |
| `ontology-impact` * | 영향 한 줄. `data-kind` 가 영향 종류 |
| `ontology-save-note`, `ontology-save-confirm`, `ontology-save`, `ontology-save-error` | 메모, 영향 확인란, 「저장」, 그 밖의 저장 오류 |
| `ontology-conflict`, `ontology-conflict-restart`, `ontology-conflict-rebase` | 다른 관리자가 먼저 저장했다는 안내와 두 단추 |
| `ontology-history`, `ontology-history-row` *(`data-version`)*, `ontology-history-pager-prev`, `ontology-history-pager-next`, `ontology-history-pager-info` | 버전 기록과 행, 쪽 넘기기 |
| `ontology-history-detail`, `ontology-history-yaml`, `ontology-history-download`, `ontology-restore` | 연 버전, 읽기 전용 YAML, 「이 버전 내려받기」, 「이 버전으로 되돌리기」(최신 버전에는 없다) |

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
