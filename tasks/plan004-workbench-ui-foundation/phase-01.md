# Phase 01. Tailwind 와 shadcn 기반

**Execution profile**: standard

## 목표

워크벤치 웹(`financial-workbench/web`)에 Tailwind CSS 4 와 shadcn 화면 부품을 들인다. 지금 화면의 모양은 그대로 둔다.
다음 phase 의 반응형 배치와 뒤 계획의 화면 전환이 이 부품을 쓴다.

**범위 외**: 배치 변경(`body` 의 `min-width` 제거, 작업 공간 탭)은 phase 02 다. 기존 화면을 shadcn 부품으로 바꾸는 일도 이 phase 에서 하지 않는다.

## 컨텍스트

- 웹은 React 19.3.1, Vite 8.3.3, TypeScript 6.0.3, Cytoscape 3.34.4 다(`financial-workbench/web/package.json`). 의존성 버전은 `^` 없이 정확히 적는다. 기존 항목이 모두 그렇다.
- 스타일은 `financial-workbench/web/src/styles.css` 한 파일(239줄)이고 `financial-workbench/web/src/main.tsx` 가 `import './styles.css'` 로 읽는다. `:root` 에 `--bg`, `--panel`, `--muted`, `--primary`, `--border` 같은 색 변수와 `font-size: 14px` 가 있다. 24행부터 47행까지 `button`, `input, select, textarea`, `h1` 부터 `h4` 같은 요소 선택자 규칙이 있다.
- 운영 응답의 CSP 는 `style-src 'self'` 다(`financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt:84`). Tailwind 는 빌드한 CSS 파일 하나라 이 정책 안에서 동작한다. inline `<style>` 을 넣는 코드를 더하지 않는다.
- 운영 이미지는 `financial-workbench/Dockerfile` 이 `node:24.15.0-bookworm-slim` 안에서 `npm ci` 와 `npm run build` 로 웹을 만든다. linux/amd64 다. Tailwind 4 는 플랫폼별 네이티브 패키지(`@tailwindcss/oxide-linux-x64-gnu`, `lightningcss-linux-x64-gnu`)를 쓴다. macOS 에서 만든 `package-lock.json` 에 linux 쪽이 빠지면 이미지 빌드가 실패한다.
- `financial-workbench/web/tsconfig.json` 은 `files: []` 와 `references` 만 있고, 실제 설정은 `tsconfig.app.json` 이다. TypeScript 6.0.3 은 `baseUrl` 을 쓰면 `error TS5101` 로 멈춘다.
- 화면 단위 테스트는 `react-dom/server` 의 `renderToStaticMarkup` 으로 그린다(`financial-workbench/web/src/components/screens.test.tsx`, 도우미 `withApp` 은 `financial-workbench/web/src/components/testSupport.tsx:73`). vitest 환경은 `node` 다(`financial-workbench/web/vite.config.ts`).
- 브라우저 테스트의 스크린샷은 `E2E_SCREENSHOT_DIR`(기본 `test-results/screenshots`)에 쌓인다(`financial-workbench/web/e2e/workbench.spec.ts:40`). Playwright 는 실행할 때마다 `test-results/` 를 비운다.

**근거 문서**: `financial-workbench/docs/code-architecture.md` 의 「버전」, 「보안 기본값」 의 「CSP 와 화면 부품」 행, 「웹 구조」, 「결정」

## 의도 메모

- 옛 규칙은 `legacy.css` 로 옮기고 `legacy` 레이어로 읽는다. 레이어 순서를 `theme, base, legacy, components, utilities` 로 두면 옛 규칙은 Tailwind 의 기본 초기화(`base`)를 이기고 shadcn 부품과 utility class 에는 진다. 레이어 밖에 두면 `button`, `input` 같은 옛 요소 선택자가 모든 utility 를 이겨 shadcn 부품 모양이 깨진다(실측).
- 기본 초기화는 레이어와 상관없이 옛 화면이 기대던 기본값을 지운다. 제목 굵기, 목록 글머리, 문단 여백, 줄 높이다. 이것은 `legacy.css` 끝에 되살리는 규칙으로 막는다.
- shadcn registry 는 지금 부품 소스에 `import { cn } from "cn"` 을 넣고 `cn` 패키지(`^0.5.0`, 2026-10-16 공개)를 의존성에 더한다(실측). CLI 버전을 고정해도 registry 내용은 고정되지 않는다. 그래서 그 import 를 `@/lib/utils` 로 바꾸고 `cn` 패키지는 들이지 않는다.
- shadcn 의 Radix Select 는 쓰지 않는다. 선택 칸은 `NativeSelect` 다. 휴대폰에서 시스템 선택기가 뜨고, Radix 의 스크롤 잠금이 CSP 와 부딪히지 않는다.
- shadcn CLI 는 `npx shadcn@4.21.3` 으로만 부른다. `package.json` 의존성에 넣지 않는다.
- 새 의존성의 버전은 아래 표가 정한다. 나온 지 14일이 넘은 버전 가운데 가장 최근 것이다. CLI 가 다른 버전을 넣으면 표의 값으로 되돌린다.

## Blocked 조건

- `npm install` 이 레지스트리에 닿지 못하면 `PHASE_BLOCKED: npm 레지스트리에 닿지 못함` 을 출력하고 멈춘다.
- `docker build --platform linux/amd64` 가 네이티브 패키지 누락으로 실패하고 아래 작업 항목 8 로도 풀리지 않으면 `PHASE_BLOCKED: lockfile 에 linux 네이티브 패키지가 없음` 을 출력하고 멈춘다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. 바꾸기 전 스크린샷 남기기

코드를 고치기 전에 지금 HEAD 로 e2e 스택을 띄워 스크린샷을 남긴다. 나중에 같은 화면과 비교한다.

```bash
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan004 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && npm ci && E2E_SCREENSHOT_DIR=../../.omc/plan004-shots/before WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npx playwright test
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan004 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

`.omc/` 는 git 이 무시한다. 이 폴더는 커밋하지 않는다.

### 2. `financial-workbench/web/package.json`, `financial-workbench/web/package-lock.json` 에 의존성 더하기

`cd financial-workbench/web` 에서 정확한 버전으로 설치한다(`npm install --save-exact`).

| 패키지 | 버전 | 구분 |
| --- | --- | --- |
| `tailwindcss` | 4.3.3 | dependencies |
| `@tailwindcss/vite` | 4.3.3 | devDependencies |
| `radix-ui` | 1.7.0 | dependencies |
| `class-variance-authority` | 0.7.1 | dependencies |
| `clsx` | 2.1.1 | dependencies |
| `tailwind-merge` | 3.7.0 | dependencies |
| `lucide-react` | 1.52.0 | dependencies |
| `tw-animate-css` | 1.4.0 | dependencies |

### 3. `financial-workbench/web/vite.config.ts`, `financial-workbench/web/tsconfig.json`, `financial-workbench/web/tsconfig.app.json` 에 플러그인과 별칭

- `vite.config.ts` 의 `plugins` 를 `[react(), tailwindcss()]` 로 한다(`import tailwindcss from '@tailwindcss/vite'`). `resolve.alias` 에 `'@': path.resolve(__dirname, 'src')` 를 둔다. `server.proxy`, `build`, `test` 설정은 그대로 둔다. vitest 도 같은 설정을 읽으므로 `@/` import 가 테스트에서도 풀린다.
- `tsconfig.json` 에 `"compilerOptions": { "paths": { "@/*": ["./src/*"] } }` 를 더한다. `files` 와 `references` 는 그대로 둔다. shadcn CLI 가 이 파일의 별칭을 읽는다. 없으면 부품을 `web/@/components/ui/` 라는 실제 폴더에 쓴다(실측).
- `tsconfig.app.json` 의 `compilerOptions` 에 `"paths": { "@/*": ["./src/*"] }` 를 더한다. `baseUrl` 은 쓰지 않는다.

### 4. `financial-workbench/web/components.json` 신규

shadcn CLI 설정이다.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/styles.css", "baseColor": "slate", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "ui": "@/components/ui", "lib": "@/lib", "utils": "@/lib/utils", "hooks": "@/hooks" }
}
```

`tailwind.config` 를 빈 문자열로 둬야 CLI 가 Tailwind 4 registry 를 쓴다. 빠지면 v3 registry 를 찾다가 `native-select.json was not found` 로 멈춘다(실측).

### 5. `financial-workbench/web/src/legacy.css` 신규, `financial-workbench/web/src/styles.css` 다시 쓰기

- 지금 `styles.css` 의 내용 전체를 `legacy.css` 로 옮긴다. 고치는 것은 아래 세 가지뿐이다.
  - `--muted` 변수 이름을 `--legacy-muted` 로 바꾸고, 이 파일 안의 `var(--muted)` 를 모두 `var(--legacy-muted)` 로 바꾼다. shadcn 의 `--muted` 는 배경색이라, 이름이 같으면 흐린 글자가 거의 보이지 않게 된다(실측).
  - `:root` 의 `font-size: 14px` 를 `body` 로 옮긴다. `:root` 에 두면 `1rem` 이 14px 가 되어 shadcn 부품이 작아진다. 옛 규칙은 px 기준이라 모양은 그대로다.
  - 파일 끝에 기본 초기화가 지운 값을 되살린다: `h1, h2, h3, h4 { font-weight: 700 }`, `p { margin: 1em 0 }`, `.welcome ol { list-style: decimal; padding-left: 1.5em }`, `.graph-node-list ul, .change-list { list-style: disc; padding-left: 1.5em }`, `body { line-height: normal }`. 1 의 스크린샷과 비교해 다른 곳이 더 있으면 같은 방식으로 되살린다.
- `body { min-width: 1280px }` 는 이 phase 에서 그대로 둔다.
- `styles.css` 는 Tailwind 진입점이 된다. 순서는 아래다.
  1. `@layer theme, base, legacy, components, utilities;`
  2. `@import "tailwindcss";`
  3. `@import "tw-animate-css";`
  4. `@import "./legacy.css" layer(legacy);`
  5. shadcn 의 색 토큰을 `:root` 에 둔다(`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`). 값은 기존 색에 맞춘다: `--background` 는 `#f4f6f9`, `--card` 와 `--popover` 는 `#ffffff`, `--border` 와 `--input` 은 `#d9dee7`, `--foreground` 는 `#1f2937`, `--muted-foreground` 는 `#6b7280`, `--primary` 는 `#1d4ed8`, `--primary-foreground` 는 `#ffffff`, `--destructive` 는 `#b91c1c`, `--radius` 는 `0.375rem`. 나머지는 shadcn `slate` 기본값을 쓴다.
  6. `@theme inline` 으로 위 변수를 Tailwind 색(`--color-background: var(--background)` 등)과 `--font-sans` 에 잇는다. 글꼴은 legacy 와 같은 `'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif` 다.
  7. `@layer base { *, ::before, ::after { border-color: var(--color-border) } }`. Tailwind 4 의 기본 테두리 색은 `currentColor` 라 Card, Table, Input 의 테두리가 검게 나온다.
- 어두운 테마(`.dark`)는 두지 않는다. 지금 화면에 없다.
- `main.tsx` 의 `import './styles.css'` 는 그대로 둔다.

### 6. `financial-workbench/web/src/lib/utils.ts` 신규와 `financial-workbench/web/src/components/ui/` 부품

- `utils.ts` 는 shadcn 표준 `cn(...inputs: ClassValue[]) => twMerge(clsx(inputs))` 하나다.
- `npx shadcn@4.21.3 add button input textarea native-select tabs card badge table alert label` 로 아래 파일을 만든다.
  `button.tsx`, `input.tsx`, `textarea.tsx`, `native-select.tsx`, `tabs.tsx`, `card.tsx`, `badge.tsx`, `table.tsx`, `alert.tsx`, `label.tsx`
- 생성 직후 정리한다.
  - `import { cn } from "cn"` 을 `import { cn } from "@/lib/utils"` 로 바꾼다.
  - CLI 가 `package.json` 에 더한 `cn` 을 `npm uninstall cn` 으로 지운다. 작업 항목 2 의 표에 없는 패키지가 더해졌으면 같은 방식으로 지우고, 표의 패키지 버전이 바뀌었으면 표의 값으로 되돌린다.
  - `@radix-ui/react-*` 개별 패키지 import 가 있으면 `radix-ui` 단일 패키지 import(`import { Tabs as TabsPrimitive } from 'radix-ui'` 형태)로 바꾼다.
  - CLI 가 `styles.css` 를 고쳤으면 작업 항목 5 의 순서와 값으로 되돌린다.

### 7. 이 phase 를 검증하는 `financial-workbench/web/src/lib/utils.test.ts`, `financial-workbench/web/src/components/ui/ui.test.tsx` 신규

- `utils.test.ts`: `cn('px-2', 'px-4')` 가 `'px-4'` 이고, `cn('text-sm', false && 'hidden', undefined)` 가 `'text-sm'` 이다.
- `ui.test.tsx`: `renderToStaticMarkup` 으로 그린다.
  - `<Button>저장</Button>` 이 `<button` 과 `저장` 을 담는다.
  - `<NativeSelect data-testid="x"><option value="A">가</option></NativeSelect>` 가 `<select` 와 `data-testid="x"` 와 `<option value="A">가</option>` 를 담는다. e2e 의 `selectOption` 이 그대로 동작하려면 HTML 기본 `<select>` 여야 한다.
  - `Tabs` 에 `forceMount` 를 준 `TabsContent` 두 개를 그리면 고르지 않은 쪽도 HTML 에 남는다. phase 02 가 이 동작에 기댄다.

### 8. linux/amd64 이미지 빌드 확인

- 먼저 `grep -q 'node_modules/@tailwindcss/oxide-linux-x64-gnu' financial-workbench/web/package-lock.json` 으로 linux 패키지가 lockfile 에 있는지 본다.
- `docker build --platform linux/amd64 financial-workbench` 가 통과해야 한다. 네이티브 패키지 누락(`Cannot find module '@tailwindcss/oxide-linux-x64-gnu'`, `lightningcss.linux-x64-gnu.node`)으로 실패하면 `cd financial-workbench/web && rm -rf node_modules package-lock.json && npm install` 으로 lockfile 을 다시 만들고 다시 빌드한다.
- lockfile 을 다시 만들었으면 `git diff -- financial-workbench/web/package-lock.json` 에서 원래 있던 패키지의 `"version"` 줄이 바뀌지 않았는지 본다. 바뀌었으면 그 패키지를 원래 버전으로 `npm install --save-exact <패키지>@<원래 버전>` 해 되돌린다. 나온 지 14일이 안 된 버전이 lockfile 에 들어오지 않게 하려는 것이다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/utils.test.ts src/components/ui/ui.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
! grep -rn 'from "cn"' financial-workbench/web/src
! grep -q '"cn"' financial-workbench/web/package.json
! grep -rn "@radix-ui/react-" financial-workbench/web/src
! grep -n "var(--muted)" financial-workbench/web/src/legacy.css
grep -q '"tailwindcss": "4.3.3"' financial-workbench/web/package.json
test ! -e "financial-workbench/web/@"
grep -q 'node_modules/@tailwindcss/oxide-linux-x64-gnu' financial-workbench/web/package-lock.json
docker build --platform linux/amd64 -t workbench-plan004-p1 financial-workbench
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan004 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && E2E_SCREENSHOT_DIR=../../.omc/plan004-shots/after WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npx playwright test
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan004 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 기존 vitest 와 브라우저 테스트가 모두 통과해야 한다.
- `.omc/plan004-shots/before/` 와 `.omc/plan004-shots/after/` 의 같은 이름 스크린샷을 짝지어 보고, 작업 공간, 목록, 검토 대기, 변경 이력, 온톨로지 화면의 배치와 글자 굵기, 목록 번호와 글머리, 흐린 글자가 같은지 눈으로 본다. 다르면 작업 항목 5 의 되살리는 규칙을 더한다. 확인한 화면과 남은 차이를 PR 본문에 적는다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/package.json` | 수정 |
| `financial-workbench/web/package-lock.json` | 수정 |
| `financial-workbench/web/vite.config.ts` | 수정 |
| `financial-workbench/web/tsconfig.json` | 수정 |
| `financial-workbench/web/tsconfig.app.json` | 수정 |
| `financial-workbench/web/components.json` | 신규 |
| `financial-workbench/web/src/styles.css` | 수정 |
| `financial-workbench/web/src/legacy.css` | 신규 |
| `financial-workbench/web/src/lib/utils.ts` | 신규 |
| `financial-workbench/web/src/lib/utils.test.ts` | 신규 |
| `financial-workbench/web/src/components/ui/button.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/input.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/textarea.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/native-select.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/tabs.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/card.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/badge.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/table.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/alert.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/label.tsx` | 신규 |
| `financial-workbench/web/src/components/ui/ui.test.tsx` | 신규 |
