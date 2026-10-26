# Phase 03. 폼 편집기를 지우고 YAML 편집기를 화면 높이와 고정 툴바로 바꾼다

**Execution profile**: standard

## 목표

온톨로지 편집을 YAML 편집기 하나로 줄이고, 긴 YAML 에서도 툴바와 미리보기 결과가 늘 보이게 한다.

**범위 외**: 「제안」 화면(phase 04). 서버는 바꾸지 않는다.

## 컨텍스트

- 지금 구성: `web/src/components/ontology/OntologyTab.tsx` 가 `?view=form|yaml|history` 로 `OntologyFormEditor`, `OntologyYamlEditor`, `OntologyHistory` 를 고른다. `OntologyYamlEditor.tsx` 는 `Textarea className="min-h-96"` 이라 내용만큼 늘어난다. 미리보기 결과는 `OntologyPreviewPanel.tsx` 가 그리고 `OntologyHistory.tsx` 의 되돌리기도 같은 패널을 쓴다.
- 초안 타입은 `web/src/lib/ontologyEdit.ts` 의 `OntologyDraft`(`source`, `yaml`, `definition`, `removed`, `dirty`)이고 `App.tsx` 가 들고 있다. 폼 전용 함수는 `web/src/lib/ontologyDraft.ts` 에 있다. 폼 밖에서 쓰는 것은 `reloadSucceeded`, `RELOAD_FAILED_HINT`, `restartError`, `savedMessage` 와 테스트의 `toDefinition` 이다(`git grep -n "ontologyDraft" web/src` 로 다시 확인한다).
- 주소: `web/src/routes.ts` 의 `parseOntologyQuery`, `ontologySearch`, `OntologyQuery`.
- 창은 `web/src/components/ui/dialog.tsx`, 단추는 `ui/button.tsx` 다. 배치 경계는 `web/src/hooks/useMediaQuery.ts` 의 `useMediaQuery('(min-width: 1024px)')` 다.
- 단위 테스트는 `react-dom/server` 로 렌더링해 확인한다(`web/src/components/ontology/ontology.test.tsx`).

**근거 문서**: `docs/flow.md` 의 「온톨로지 편집」(「초안」, 「편집기 배치」, 「미리보기와 저장」), `docs/flow.md` 「주소와 뒤로가기」 의 온톨로지 줄, `web/TESTIDS.md` 의 「온톨로지 상세 화면」, `docs/adr/016-ontology-yaml-only-editor.md`

## 의도 메모

- 코드 편집기 라이브러리(CodeMirror, Monaco)는 기각했다(ADR-016). 새 의존을 넣지 않는다.
- 편집기 높이는 CSS 의 `calc(100dvh - 머리글)` 로 짐작하지 않고 편집기 윗변의 `getBoundingClientRect().top` 으로 잰다. 머리글 높이가 화면 폭과 안내 배너에 따라 바뀌기 때문이다. 값은 React `style` 속성으로 둔다(CSP `style-src 'self'` 와 맞는다).
- 줄 번호 칸은 `<textarea wrap="off">` 와 같은 글꼴, 글자 크기, 줄 높이를 써야 줄이 맞는다. 칸은 `aria-hidden` 이다.

## 작업 항목

### 1. 폼 편집기 지우기

- 삭제: `web/src/components/ontology/OntologyFormEditor.tsx`, `web/src/components/ontology/form/` 아래 네 파일.
- `web/src/lib/ontologyDraft.ts`: 폼 전용 함수(`keyError`, `sentenceError`, `relationSentenceError`, `toDefinition`, `addNodeType`, `updateNodeType`, `addProperty`, `updateProperty`, `addRelationshipType`, `updateRelationshipType`, `addClaimPredicate`, `updateClaimPredicate`, `toggleRemoved`, `applyRemoved`, `NODE_SHAPES`, `CODE_READ_KEYS`, `KEY_RULES` 와 그 타입)를 지운다. `reloadSucceeded`, `RELOAD_FAILED_HINT`, `restartError`, `savedMessage` 는 남긴다. `web/src/lib/ontologyDraft.test.ts` 도 남긴 함수의 테스트만 둔다. `ontology.test.tsx` 의 `toDefinition` 쓰임은 다른 방법(테스트 안의 작은 정의)으로 바꾼다.
- `web/src/lib/ontologyEdit.ts` 의 `OntologyDraft` 를 `{ baseVersion: number; yaml: string; dirty: boolean }` 로 줄인다. `App.tsx` 의 쓰임을 맞춘다.

### 2. 주소 `web/src/routes.ts`, `OntologyTab.tsx`

- `OntologyQuery.view` 를 `'yaml' | 'history'` 로 줄인다. `parseOntologyQuery` 는 `view=form` 을 `yaml` 로 읽는다.
- `OntologyTab` 은 원래 query 의 `view` 가 `form` 이면 `navigate(TAB_PATHS.ontology + ontologySearch({ view: 'yaml' }), { replace: true })` 로 주소를 바꾼다.
- 보기 화면의 단추는 「YAML 로 편집」, 「버전 기록」, 「YAML 내려받기」 셋이다. 「폼으로 편집」(`ontology-edit-form`)을 지운다.

### 3. YAML 편집기 `OntologyYamlEditor.tsx`

- 초안이 없으면 지금 버전의 YAML 로 초안을 만든다(지금과 같다). 폼 초안 변환 갈래와 「폼으로 돌아가기」, 「폼으로 보기」 를 지운다.
- 배치(`docs/flow.md` 「편집기 배치」):
  - 바깥 영역 `ontology-yaml-editor` 의 높이 = `window.innerHeight - 윗변`(최소 320px). `resize` 때 다시 잰다. 안은 세로 flex 다.
  - 툴바 `ontology-yaml-toolbar`(`sticky top-0`, 배경색 있음): 「저장 전에 확인」(`ontology-preview`), 「초안 버리기」(`ontology-draft-discard`), 「버전 기록」(`ontology-toolbar-history`, `onOpenHistory` prop), 「YAML 내려받기」(`ontology-toolbar-export`, `ONTOLOGY_EXPORT_URL`), 초안 상태(`ontology-draft-status`, `data-dirty`), 「키 설명」(`ontology-yaml-help-open`).
  - 본문: 넓은 화면은 `grid-cols-[1fr_400px]` 로 왼쪽 편집칸, 오른쪽 결과 칸(`ontology-preview-side`, `data-layout="side"`, `overflow-auto`). 좁은 화면은 편집칸 아래 `<details open>` 결과 칸(`data-layout="below"`). 결과가 없으면 결과 칸을 그리지 않는다.
  - 편집칸: 줄 번호 칸(`ontology-yaml-gutter`)과 `<textarea wrap="off">`(`ontology-yaml-input`)를 가로로 둔다. textarea 의 `onScroll` 에서 줄 번호 칸의 `scrollTop` 을 맞춘다.
- 「초안 버리기」 는 `draft.dirty` 면 확인 창(`ontology-discard-confirm`, 「고친 내용을 버릴까요?」, `-submit` 「버리기」, `-cancel` 「취소」)을 연다.
- 「키 설명」 창(`ontology-yaml-help`)은 지금 `YamlHelp` 의 내용을 `Dialog` 로 옮긴 것이다.
- 초안을 고치면 결과를 지운다(지금과 같다).

### 4. 결과 칸의 오류 줄 이동 `OntologyPreviewPanel.tsx`

- 오류 문장에서 `/\(줄 (\d+)\)/` 을 찾으면 그 부분을 단추(`ontology-preview-error-line`, `data-line`)로 그린다. 누르면 `onGoToLine(line)` 을 부른다. `onGoToLine` 은 선택 prop 이라 `OntologyHistory` 는 넘기지 않는다.
- 줄 이동 순수 함수 `lineRange(text: string, line: number): { start: number; end: number }` 를 `web/src/lib/yamlLines.ts`(신규)에 둔다. 줄 수보다 큰 번호는 마지막 줄이다. 편집기는 `textarea.focus()`, `setSelectionRange(start, end)` 뒤 `scrollTop = (line - 1) * 줄 높이 - 편집칸 높이 / 3` 으로 스크롤한다.
- 바뀐 점 목록(`DiffList`)과 영향 목록은 phase 04 가 쓸 수 있게 `export function OntologyDiffSummary({ preview })` 로 꺼낸다.

### 5. 이 phase 를 검증하는 테스트

- `web/src/lib/yamlLines.test.ts`(신규): 3줄 문자열의 2번째 줄 범위, 줄 수를 넘는 번호, 빈 문자열.
- `web/src/routes.test.ts`(수정): `parseOntologyQuery('?view=form')` 이 `{ view: 'yaml' }` 이다.
- `web/src/components/ontology/ontology.test.tsx`(수정): ADMIN 의 보기 화면에 `ontology-edit-form` 이 없다. 초안이 있는 YAML 편집기 렌더링에 `ontology-yaml-toolbar` 안의 `ontology-preview`, `ontology-draft-discard`, `ontology-toolbar-history`, `ontology-toolbar-export`, `ontology-draft-status` 가 있다. `(줄 7)` 오류가 든 미리보기의 결과 패널에 `data-line="7"` 단추가 있다.
- `web/src/lib/ontologyDraft.test.ts`(수정): 남긴 함수만 검사한다.

## 검증

```bash
cd web && npm ci && npm run typecheck && npm test && npm run build
! git grep -n "OntologyFormEditor\|ontology-edit-form\|ontology-form" -- web/src ':!web/src/**/*.test.tsx' ':!web/src/**/*.test.ts'
```

모두 종료 코드 0.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `web/src/components/ontology/OntologyFormEditor.tsx` | 삭제 |
| `web/src/components/ontology/form/NodeTypeSection.tsx` | 삭제 |
| `web/src/components/ontology/form/PredicateSection.tsx` | 삭제 |
| `web/src/components/ontology/form/RelationshipSection.tsx` | 삭제 |
| `web/src/components/ontology/form/shared.tsx` | 삭제 |
| `web/src/components/ontology/OntologyTab.tsx` | 수정 |
| `web/src/components/ontology/OntologyYamlEditor.tsx` | 수정 |
| `web/src/components/ontology/OntologyPreviewPanel.tsx` | 수정 |
| `web/src/components/ontology/ontology.test.tsx` | 수정 |
| `web/src/lib/ontologyDraft.ts` | 수정 |
| `web/src/lib/ontologyDraft.test.ts` | 수정 |
| `web/src/lib/ontologyEdit.ts` | 수정 |
| `web/src/lib/yamlLines.ts` | 신규 |
| `web/src/lib/yamlLines.test.ts` | 신규 |
| `web/src/routes.ts` | 수정 |
| `web/src/routes.test.ts` | 수정 |
| `web/src/App.tsx` | 수정 |
