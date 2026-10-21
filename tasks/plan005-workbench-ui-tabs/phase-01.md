# Phase 01. 머리글, 로그인, 목록, 사용자 탭

**Execution profile**: standard

## 목표

머리글, 로그인 화면, 목록 탭, 사용자 탭을 shadcn 부품과 Tailwind class 로 옮긴다. 보이는 문구와 동작은 바꾸지 않는다.
옮긴 화면만 쓰던 옛 규칙은 `legacy.css` 에서 지운다.

**범위 외**: 검토 대기, 변경 이력, 온톨로지 탭은 phase 02 다. 작업 공간의 검색, 그래프, 상세 패널과 그 안의 폼(`SearchPanel`, `GraphPanel`, `DetailPanel`, `NodeCreateForm`, `NodeEditForm`, `NodePicker`, `PropertyFields`, `RelationshipSection`, `ClaimCreateForm`, `ClaimEditor`, `ClaimCard`, `TypeBadge`, `WelcomeGuide`)은 화면 구조를 다시 짜는 다음 계획이 shadcn 으로 새로 만든다. 여기서 고치지 않는다.

## Blocked 조건

- `financial-workbench/web/src/components/ui/button.tsx` 나 `financial-workbench/web/src/hooks/useMediaQuery.ts` 가 없으면 기반 계획이 아직 머지되지 않은 것이다. `PHASE_BLOCKED: shadcn 기반이 main 에 없음` 을 출력하고 멈춘다.

## 컨텍스트

- 기반은 main 에 있다. 부품은 `financial-workbench/web/src/components/ui/`(button, input, textarea, native-select, tabs, card, badge, table, alert, label), class 합치기는 `cn`(`financial-workbench/web/src/lib/utils.ts`), 경로 별칭은 `@/` 다. 색 토큰은 `financial-workbench/web/src/styles.css` 에 있다.
- 옛 규칙은 `financial-workbench/web/src/legacy.css` 에 있고 `styles.css` 가 `legacy` 레이어로 읽는다. 레이어 순서가 `theme, base, legacy, components, utilities` 라서 shadcn 부품과 utility class 가 옛 규칙(요소 선택자 `button`, `input` 포함)을 이긴다. 옛 class 를 남겨도 모양은 깨지지 않지만, 지울 규칙을 가리기 어려워지므로 옮긴 요소에는 남기지 않는다.
- 대상 파일과 지금 쓰는 옛 class 다.

  | 파일 | 옛 class |
  | --- | --- |
  | `financial-workbench/web/src/App.tsx`(머리글, `center-message`, `app`, `app-main`) | `app`, `app-header`, `app-title`, `tabs`, `tab`, `active`, `user-box`, `muted`, `role-badge`, `role-<역할>`, `link-button`, `app-main`, `center-message`, `error-box` |
  | `financial-workbench/web/src/components/LoginView.tsx` | `login-page`, `login-card`, `primary`, `info-box`, `error-box`, `muted small` |
  | `financial-workbench/web/src/components/ListTab.tsx` | `tab-page`, `row toolbar`, `data-table`, `clickable`, `check`, `muted`, `error-box` |
  | `financial-workbench/web/src/components/UsersTab.tsx` | `tab-page`, `row`, `row toolbar`, `sub-form`, `primary`, `danger`, `data-table`, `mono`, `muted`, `muted small`, `link-button small`, `hint`, `notice notice-<종류>`, `disabled-row` |
  | `financial-workbench/web/src/components/Pager.tsx` | `pager` |

- 좁은 화면 규칙이 `legacy.css` 의 `@media (max-width: 1023px)` 안에 있다(`.app-title`, `.tabs`, 이메일 숨김, `.tab-page` 여백, 표 가로 스크롤). 머리글과 이 phase 의 표를 옮기면 같은 동작을 Tailwind class 로 옮기고 그 규칙을 지운다.
- 브라우저 테스트는 `financial-workbench/web/e2e/workbench.spec.ts`(넓은 화면)와 `financial-workbench/web/e2e/mobile.spec.ts`(390px)다. 요소는 `data-testid` 와 role 로 찾는다. 사용자 탭의 역할 선택은 `selectOption` 을 쓴다(`users-add-role`, `users-row-role`).

**근거 문서**: `financial-workbench/docs/code-architecture.md` 의 「웹 구조」, `financial-workbench/docs/flow.md` 의 「좁은 화면의 작업 공간」 마지막 항목

## 의도 메모

- 부품 고르기: 주 행동 버튼은 `Button`(기본), 보조는 `variant="outline"`, 옛 `link-button` 은 `variant="link"`, 위험한 행동은 `variant="destructive"`. 입력은 `Input`, 선택은 `NativeSelect`, 표는 `Table`(감싼 요소가 가로 스크롤을 맡는다), 상태 칸은 `Badge`, 알림 상자(`error-box`, `info-box`, `notice`)는 `Alert`(오류는 `variant="destructive"`)다.
- 머리글의 탭 버튼은 shadcn `Tabs` 로 바꾸지 않는다. 탭 내용이 `App` 의 조건부 렌더링이라 `Tabs` 의 내용 영역과 맞지 않는다. `button[role=tab]` 과 `aria-selected` 를 그대로 두고 Tailwind class 로 꾸민다.
- `data-testid`, `data-email`, `data-role`, `data-kind`, `aria-selected` 같은 속성은 하나도 바꾸거나 지우지 않는다. e2e 가 이것에 기댄다.
- 옛 규칙을 지우기 전에 아래 명령으로 다른 파일이 쓰지 않는지 본다. `CLS` 에 class 이름을 넣는다. `check`, `row`, `tab` 처럼 짧은 이름이 `checked`, `arrow` 에 걸리지 않게 class 경계로 찾는다.

  ```bash
  CLS=row; grep -rnE "className=[^>]*[\"'{\` ]${CLS}[\"'}\` ]" financial-workbench/web/src
  ```

  `muted`, `error-box`, `primary`, `link-button`, `row`, `notice` 는 작업 공간의 패널과 폼이 아직 쓰므로 지우지 않는다.

## 작업 항목

### 1. `financial-workbench/web/src/App.tsx` 머리글과 바탕

- 머리글: 어두운 바탕 한 줄. 제목, 탭 버튼 줄, 사용자 상자 순서는 그대로다. 탭 버튼 줄은 `overflow-x-auto` 이고 줄바꿈하지 않는다. 고른 탭은 아래 테두리로 보인다.
- 1024px 미만에서 이메일(`current-user-email`)을 숨기는 것은 `hidden lg:inline` 으로 한다. 제목은 `truncate` 한다.
- 역할 표시는 `Badge`, 로그아웃은 `Button variant="link"` 다.
- `center-message`, 온톨로지 오류 상자(`ontology-error`)도 Tailwind class 와 `Alert` 로 옮긴다.

### 2. `financial-workbench/web/src/components/LoginView.tsx`

가운데 `Card` 하나에 제목, 설명, 「Google 로 로그인」 `Button`(`data-testid="login-google"` 유지), 거절 안내(`login-denied`)와 세션 안내를 `Alert` 로 둔다.

### 3. `financial-workbench/web/src/components/ListTab.tsx`, `financial-workbench/web/src/components/Pager.tsx`

- 도구 줄(타입 선택, 보관 포함 체크, 검색)은 좁은 화면에서 줄바꿈한다(`flex flex-wrap gap-2`).
- 표는 `Table` 로 바꾸고 행 클릭 동작과 행의 `data-testid` 를 그대로 둔다. 선택은 `NativeSelect` 다.
- `Pager` 는 `Button variant="outline" size="sm"` 두 개와 쪽 번호다. 범위 밖인 `SearchPanel` 도 `Pager` 를 쓴다(`testIdPrefix="search-pager"`). 검색 결과의 쪽 넘김 모양이 함께 바뀌는 것은 받아들인다. props 와 test id 는 바꾸지 않는다.

### 4. `financial-workbench/web/src/components/UsersTab.tsx`

- 추가 폼은 `Input` 과 `NativeSelect` 와 `Button` 이다. 좁은 화면에서 줄바꿈한다.
- 사용자 표는 `Table` 이다. 비활성 행(지금 `disabled-row`)은 흐린 글자(`text-muted-foreground`)로 둔다. 행의 `data-testid="users-row"` 와 `data-email` 을 그대로 둔다.
- 안내 문구(`users-message`, `data-kind`)는 `Alert` 로 바꾸되 `data-kind` 속성을 그대로 둔다.

### 5. `financial-workbench/web/src/legacy.css` 정리

이 phase 에서 옮긴 화면만 쓰던 규칙을 지운다. 후보는 `.app`, `.app-header`, `.app-title`, `.tabs`, `.tab`, `.tab.active`, `.user-box`, `.role-badge`, `.role-*`, `.app-main`, `.center-message`, `.login-page`, `.login-card`, `.info-box`, `.data-table` 계열 가운데 이 phase 가 옮긴 표만 쓰던 것, `.clickable`, `.check`, `.sub-form`, `.disabled-row`, `.pager`, `@media (max-width: 1023px)` 안의 머리글 규칙이다. 지우기 전에 위 「의도 메모」 의 grep 으로 남은 사용처를 본다. 남은 사용처가 있으면 그 규칙은 남긴다.

### 6. 이 phase 를 검증하는 `financial-workbench/web/src/components/tabs.test.tsx` 신규

`renderToStaticMarkup` 과 `withApp`(`financial-workbench/web/src/components/testSupport.tsx`)으로 그린다. 서버 호출이 필요한 상태는 첫 렌더에서 비어 있으므로 빈 상태와 고정 마크업을 본다.
- `LoginView`: `denied` 를 주면 `data-testid="login-denied"` 와 `data-testid="login-google"` 이 있다. 옛 class `login-card` 가 없다.
- `ListTab`: 도구 줄의 `<select` 가 있다(HTML 기본 select). 옛 class `data-table` 이 없다.
- `UsersTab`: `data-testid="users-add-role"` 이 `<select` 다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/components/tabs.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
for f in App.tsx components/LoginView.tsx components/ListTab.tsx components/UsersTab.tsx components/Pager.tsx; do diff <(git show HEAD:financial-workbench/web/src/$f | grep -o 'data-testid=[^ >]*' | sort -u) <(grep -o 'data-testid=[^ >]*' financial-workbench/web/src/$f | sort -u) || exit 1; done
! grep -n "login-card\|\.pager\b\|\.app-header" financial-workbench/web/src/legacy.css
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan005 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan005 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- `diff` 줄은 커밋하기 전에 돌린다. 작업 트리의 test id 집합이 `HEAD` 와 같아야 한다.
- 브라우저 테스트 스크린샷에서 머리글, 로그인, 목록, 사용자 화면이 넓은 폭과 390px 에서 넘치지 않는지 눈으로 본다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/web/src/components/LoginView.tsx` | 수정 |
| `financial-workbench/web/src/components/ListTab.tsx` | 수정 |
| `financial-workbench/web/src/components/UsersTab.tsx` | 수정 |
| `financial-workbench/web/src/components/Pager.tsx` | 수정 |
| `financial-workbench/web/src/legacy.css` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 신규 |
