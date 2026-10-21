# Phase 02. 검토 대기, 변경 이력, 온톨로지 탭

**Execution profile**: standard

## 목표

검토 대기, 변경 이력, 온톨로지 탭을 shadcn 부품과 Tailwind class 로 옮긴다. 보이는 문구와 동작은 바꾸지 않는다.
옮긴 화면만 쓰던 옛 규칙은 `legacy.css` 에서 지운다.

**범위 외**: 검토 대기 목록을 「내가 검토할 수 있는 것」 과 「내가 쓴 것」 으로 나누는 일, 변경 이력의 대상과 사용자를 이름으로 고르는 일, 변경 내용의 `subjectId` 같은 원문 키를 이름으로 바꾸는 일, 온톨로지 탭을 「입력 규칙 안내」 로 바꾸는 일은 화면 구조를 다시 짜는 다음 계획이다. 작업 공간의 패널과 폼도 고치지 않는다.

## Blocked 조건

- `financial-workbench/web/src/components/tabs.test.tsx` 가 없으면 phase 01 이 끝나지 않은 것이다. `PHASE_BLOCKED: phase 01 이 먼저다` 를 출력하고 멈춘다.

## 컨텍스트

- 부품은 `financial-workbench/web/src/components/ui/`, class 합치기는 `cn`(`financial-workbench/web/src/lib/utils.ts`), 경로 별칭은 `@/` 다. 옛 규칙은 `financial-workbench/web/src/legacy.css` 에 있고 `legacy` 레이어라 shadcn 부품과 utility class 에 진다. 옮긴 요소에는 옛 class 를 남기지 않는다.
- phase 01 이 머리글, 로그인, 목록, 사용자 탭을 같은 방식으로 옮겼다. 부품 고르기와 표의 가로 스크롤은 `financial-workbench/web/src/components/ListTab.tsx` 와 `financial-workbench/web/src/components/UsersTab.tsx` 를 따른다.
- 대상 파일과 지금 쓰는 옛 class 다.

  | 파일 | 옛 class |
  | --- | --- |
  | `financial-workbench/web/src/components/ReviewTab.tsx` | `tab-page`, `row toolbar`, `data-table`, `review-actions`, `primary`, `danger`, `link-button`, `notice notice-success`, `error-box`, `muted`, `muted small` |
  | `financial-workbench/web/src/components/ChangesTab.tsx` | `tab-page`, `row toolbar`, `field-inline`, `data-table`, `action-badge action-<작업>`, `change-list`, `mono`, `link-button`, `error-box`, `muted`, `muted small` |
  | `financial-workbench/web/src/components/OntologyTab.tsx` | `tab-page ontology`, `ontology-type`, `data-table compact`, `mono`, `hint`, `muted`, `muted small` |

- `ChangesTab.tsx` 는 `ChangeRows` 를 export 하고 `financial-workbench/web/src/components/ChangesTab.test.tsx` 가 그것을 `renderToStaticMarkup` 으로 그려 문구를 본다(`'>보관<'`, `'>공급한다<'`, `'title="alice@example.com"'`, `'시스템'` 등). 작업 이름을 `Badge` 로 감싸도 글자가 요소 안에 바로 들어가 이 단언이 그대로 통과해야 한다. 이 테스트는 고치지 않는다.
- 브라우저 테스트는 `financial-workbench/web/e2e/workbench.spec.ts` 와 `financial-workbench/web/e2e/mobile.spec.ts` 다. 검토 대기의 승인과 반려, 메모 입력, 변경 이력 필터와 행을 `data-testid` 로 찾는다.

**근거 문서**: `financial-workbench/docs/code-architecture.md` 의 「웹 구조」

## 의도 메모

- 부품 고르기는 phase 01 과 같다. 승인은 `Button`(기본), 반려는 `variant="destructive"`, 옛 `link-button` 은 `variant="link"`, 작업 이름(`action-badge`)은 `Badge`, 알림 상자는 `Alert` 다.
- 변경 이력의 필터 입력(대상 ID, 사용자 이메일)은 `Input` 으로 바꾸기만 한다. 입력 방식을 바꾸는 것은 범위 밖이다.
- `data-testid`, `data-kind` 같은 속성은 하나도 바꾸거나 지우지 않는다.
- 옛 규칙을 지우기 전에 아래 명령으로 다른 파일이 쓰지 않는지 본다. `CLS` 에 class 이름을 넣는다. `check`, `row`, `tab` 처럼 짧은 이름이 `checked`, `arrow` 에 걸리지 않게 class 경계로 찾는다.

  ```bash
  CLS=row; grep -rnE "className=[^>]*[\"'{\` ]${CLS}[\"'}\` ]" financial-workbench/web/src
  ```

  작업 공간의 패널과 폼이 쓰는 규칙은 남긴다.

## 작업 항목

### 1. `financial-workbench/web/src/components/ReviewTab.tsx`

- 도구 줄과 안내(`review-own-hint`, `review-viewer-hint`)는 좁은 화면에서 줄바꿈한다.
- 표는 `Table`, 행의 메모 입력(`review-row-note`)은 `Input`, 승인(`review-row-approve`)과 반려(`review-row-reject`)는 `Button` 이다. 버튼이 꺼지는 조건은 그대로다.
- `review-message`, `review-error` 는 `Alert` 다.

### 2. `financial-workbench/web/src/components/ChangesTab.tsx`

- 필터(`changes-target-filter`, `changes-actor-filter`, `changes-filter-submit`, `changes-filter-clear`)는 `Input` 과 `Button` 이고 좁은 화면에서 줄바꿈한다.
- 표(`changes-table`)는 `Table` 이다. 작업 칸(`change-action`)은 `Badge` 로, 작업마다 색을 다르게 둔다(만들기는 초록, 보관은 회색, 복원은 파랑, 그 밖은 기본). 변경 내용 목록(`change-list`)은 Tailwind class 로 같은 모양을 낸다.
- `ChangeRows` 의 export 와 props 는 그대로 둔다.

### 3. `financial-workbench/web/src/components/OntologyTab.tsx`

타입마다 `Card` 하나에 속성 표(`Table`)를 둔다. 버전 표시(`ontology-version`), 관계(`ontology-relationships`), 주장 종류(`ontology-predicates`) 절은 그대로다.

### 4. `financial-workbench/web/src/legacy.css` 정리

이 phase 에서 옮긴 화면만 쓰던 규칙을 지운다. 후보는 `.review-actions`, `.action-badge`, `.action-*`, `.change-list`, `.ontology`, `.ontology-type`, `.data-table`, `.compact`, `.field-inline`, `.danger`, `.tab-page`, `@media (max-width: 1023px)` 안의 `.tab-page` 와 표 규칙이다. 지우기 전에 위 grep 으로 남은 사용처를 본다. 남은 사용처가 있으면 남긴다.

### 5. 이 phase 를 검증하는 `financial-workbench/web/src/components/tabs.test.tsx` 수정

phase 01 이 만든 파일에 아래를 더한다. `renderToStaticMarkup` 과 `withApp` 으로 그린다.
- `OntologyTab`: `data-testid="ontology-version"` 이 있고 옛 class `ontology-type` 이 없다.
- `ReviewTab`: 첫 렌더에 `data-testid="review-tab"` 이 있고 옛 class `review-actions` 가 없다.
- `ChangesTab`: `data-testid="changes-target-filter"` 가 `<input` 이고 옛 class `data-table` 이 없다.

## 보정 (구현 전 검토 반영, 아래가 위 본문보다 우선한다)

- 작업 배지 색은 만들기 `bg-emerald-100 text-emerald-900`, 보관 `variant="secondary"`, 복원 `bg-blue-100 text-blue-900`, 그 밖 `variant="outline"` 이다.
- `ReviewTab` 테스트는 옛 class `data-table` 이 없고 `data-slot="table"` 이 있는지 본다. 행까지 보려면 `ReviewRow` 를 export 해 claim 하나로 그리고 `review-actions` 가 없는지 본다.
- 표 칸의 `lg:whitespace-normal` 은 phase 01 이 `ui/table.tsx` 에 준 것을 따른다.
- 기존 폭(`.review-actions input` 120px, `min-width: 280px`, `changes-target-filter` 의 `size={38}`)은 `w-*`, `min-w-*` class 로 옮긴다.
- phase 가 끝나 쓰는 곳이 없어진 `.toolbar`, `.toolbar h2` 도 grep 으로 확인해 지운다. 범위 밖 화면이 쓰는 `info-box`, `check`, `sub-form`, `danger`, `field-inline` 은 남긴다.
- `Alert` 는 기존 role 을 유지한다. 검증 블록의 각 줄은 저장소 루트에서 따로 실행한다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/components/tabs.test.tsx src/components/ChangesTab.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
for f in ReviewTab.tsx ChangesTab.tsx OntologyTab.tsx; do diff <(git show HEAD:financial-workbench/web/src/components/$f | grep -o 'data-testid=[^ >]*' | sort -u) <(grep -o 'data-testid=[^ >]*' financial-workbench/web/src/components/$f | sort -u) || exit 1; done
! grep -n "review-actions\|action-badge\|ontology-type" financial-workbench/web/src/legacy.css
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan005 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan005 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- `diff` 줄은 커밋하기 전에 돌린다. 작업 트리의 test id 집합이 `HEAD` 와 같아야 한다.
- 브라우저 테스트 스크린샷에서 검토 대기, 변경 이력, 온톨로지 화면이 넓은 폭과 390px 에서 넘치지 않는지 눈으로 본다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/components/ReviewTab.tsx` | 수정 |
| `financial-workbench/web/src/components/ChangesTab.tsx` | 수정 |
| `financial-workbench/web/src/components/OntologyTab.tsx` | 수정 |
| `financial-workbench/web/src/legacy.css` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 수정 |
