# Phase 04. 웹 화면

**Execution profile**: standard

## 목표

React, TypeScript, Vite, Cytoscape.js 로 로그인, 작업 공간(검색, 그래프, 상세 편집), 목록, 검토 대기, 변경 이력, 온톨로지 화면을 만든다.

**범위 외**: 브라우저 테스트 실행(Phase 05, Compose 스택이 필요하다).

## 컨텍스트

- API 는 `financial-workbench/docs/api-contract.md` 를 그대로 따른다.
- 웹 배치는 `financial-workbench/docs/code-architecture.md` 의 「웹 구조」 절이다.
- 개발 서버는 `/api` 를 `http://127.0.0.1:8080` 으로 proxy 한다.

**근거 문서**: `financial-workbench/docs/adr/004-session-csrf-same-origin.md`, `financial-workbench/docs/prd.md`

## 의도 메모

- 런타임 의존성은 react, react-dom, cytoscape 만 둔다. 화면이 여섯 개라 라우터와 상태 관리 라이브러리가 필요 없다.
- 그래프는 전체 DB 를 그리지 않는다. 선택 노드의 이웃만 불러오고 확장할 때 합친다.
- 409 를 받으면 덮어쓰지 않고 최신 값을 다시 읽어 안내한다.

## 작업 항목

### 1. 프로젝트

`financial-workbench/web/package.json`(정확한 버전 고정), `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`.

### 2. API 클라이언트와 화면

`web/src/api/`, `web/src/components/`, `web/src/lib/`, `web/src/App.tsx`, `web/src/main.tsx`, 스타일.

### 3. 테스트

- `web/src/lib/*.test.ts`: 그래프 병합(중복 제거, `truncated` 합침), 입력값 변환, CSRF 쿠키 파싱.
- `web/e2e/workbench.spec.ts`, `web/playwright.config.ts`: 흐름 1~6. 실행은 Phase 05.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck && npm test && npm run build
cd financial-workbench/web && npx playwright test --list
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/package.json` | 신규 |
| `financial-workbench/web/package-lock.json` | 신규 |
| `financial-workbench/web/vite.config.ts` | 신규 |
| `financial-workbench/web/index.html` | 신규 |
| `financial-workbench/web/.gitignore` | 신규 |
| `financial-workbench/web/playwright.config.ts` | 신규 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 신규 |
| `financial-workbench/web/tsconfig*.json` | 신규 |
| `financial-workbench/web/src/**` | 신규 |
| `financial-workbench/web/TESTIDS.md` | 신규 |
