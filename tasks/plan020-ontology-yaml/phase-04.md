# Phase 04. 「제안」 화면의 새 종류와 온톨로지 변경 승인, 「연동」 화면 재배치

**Execution profile**: standard

## 목표

「제안」 화면이 새 제안 종류를 문장으로 보이고, ADMIN 이 온톨로지 변경 제안의 바뀐 점과 영향을 보고 승인하게 한다. 「연동」 화면은 Claude Code·Codex 설치 안내를 맨 위에 두고 연동 토큰을 접힌 고급 절로 옮긴다.

**범위 외**: 서버(phase 01, 02), YAML 편집기(phase 03), 플러그인 스킬과 e2e(phase 05).

## 컨텍스트

- 제안 화면은 `web/src/components/proposals/ProposalsTab.tsx` 의 `ProposalsTab` 과 `ProposalCard`, 내용 문장은 `web/src/lib/proposals.ts`(`KIND_LABEL`, `proposalSummary`, `canAccept`, `nodeName`)다. 계약 타입은 `web/src/api/types.ts` 의 `ProposalKind`, `ProposalView`, 요청은 `web/src/api/client.ts` 의 `api.proposals.accept(id, payload?)` 다.
- phase 01, 02 가 `ProposalView` 에 `requiredRole`, `refs.relationships`, `result.ontologyVersion` 을 더했고 승인 본문에 `confirm` 을 받는다.
- phase 03 이 `OntologyPreviewPanel.tsx` 에서 `OntologyDiffSummary({ preview })` 를 꺼냈다. 온톨로지 변경 카드는 이것으로 바뀐 점과 영향을 그린다.
- 관계 문장은 `web/src/lib/relationSentence.ts`, 주장 문장 틀은 온톨로지의 `claimPredicates.<predicate>.sentence` 다(`ClaimCreateForm.tsx` 가 쓰는 방법을 따른다).
- 온톨로지 다시 읽기는 `App.tsx` 의 `reloadOntology` 다. `ProposalsTab` 에 선택 prop `reloadOntology?: () => Promise<void>` 로 넘긴다. 선택이라 `ProposalsTab` 을 그리는 기존 테스트(`tabs.test.tsx`)는 고치지 않아도 된다.
- 「연동」 화면은 `web/src/components/tokens/TokensTab.tsx`(안에 `ConnectionsSection` 이 있다)다. 클립보드 복사는 `TokensTab` 의 발급 결과 「복사」 가 쓰는 방법을 따른다.
- 플러그인 설치 명령은 `plugin/README.md` 와 같다.

**근거 문서**: `docs/flow.md` 의 「제안」 과 「온톨로지 변경 카드」, 「연동」(「Claude Code·Codex 에서 쓰기」, 「연동 토큰」), `docs/api-contract.md` 의 「제안」, `web/TESTIDS.md` 의 「제안 화면」 과 「연동 화면」

## 의도 메모

- 온톨로지 변경 카드의 미리보기는 ADMIN 에게만 부른다. 미리보기 API 가 ADMIN 전용이다.
- 기준 버전이 다르면 승인 단추를 끈다. 서버도 `409 REVISION_CONFLICT` 로 막지만, 화면이 먼저 덮어쓰기 위험을 설명한다.
- 새 종류에는 「고쳐서 승인」 을 두지 않는다.

## 작업 항목

### 1. 타입과 요청 `web/src/api/types.ts`, `web/src/api/client.ts`

- `ProposalKind` 에 `UPDATE_NODE`, `ARCHIVE_NODE`, `ARCHIVE_RELATIONSHIP`, `CREATE_CLAIM`, `ONTOLOGY_CHANGE`.
- `ProposalView` 에 `requiredRole: Role`, `refs.relationships: Record<string, RelationshipView>`, `result` 의 `ontologyVersion: number | null`.
- `api.proposals.accept(id, body?: { payload?: Record<string, unknown>; confirm?: boolean })`. 기존 호출부를 맞춘다.

### 2. 내용 문장 `web/src/lib/proposals.ts`

- `KIND_LABEL`: 「항목 고치기」, 「항목 보관」, 「관계 보관」, 「주장 만들기」, 「온톨로지 바꾸기」.
- `proposalSummary` 에 새 종류의 문장(`docs/flow.md` 「제안」 의 카드 내용)을 더한다. 주장 문장은 틀의 `{subject}`, `{object}` 를 이름으로 바꾼다. 관계 보관은 `refs.relationships` 의 관계로 관계 문장을 만든다.
- `updateNodeParts(p)`: 바꿀 속성 목록(`null` 은 「(지움)」).
- `canAccept(role, p)` 를 `requiredRole` 비교로 바꾼다(`VIEWER < EDITOR < ADMIN`).
- `isStaleOntologyChange(p, currentVersion)`: `ONTOLOGY_CHANGE` 이고 `payload.baseVersion !== currentVersion`.

### 3. 카드 `ProposalsTab.tsx`

- 역할 안내: `requiredRole` 이 `EDITOR` 면 지금의 `proposal-editor-required`, `ADMIN` 이면 `proposal-admin-required`(「관리자만 승인할 수 있습니다. 관리자에게 부탁하거나 거절하세요.」).
- 「고쳐서 승인」 은 `CREATE_NODE`, `STUDY_NOTE` 에만 둔다.
- 온톨로지 변경 카드(새 부품 `OntologyChangeCard.tsx` 로 나눠도 된다): 「YAML 보기」 접힘 칸(`proposal-ontology-yaml`, 줄 번호와 함께 읽기 전용). ADMIN 이고 대기 중이면 마운트할 때 `api.ontology.preview({ baseVersion, yaml })` 를 불러 `OntologyDiffSummary` 를 `proposal-ontology-preview` 안에 그린다. 실패하면 `proposal-ontology-preview-error` 와 「다시 확인」(`proposal-ontology-preview-retry`). 기준 버전이 다르면 `proposal-ontology-stale` 안내를 보이고 「승인」 을 끈다. 영향이 있으면 `proposal-ontology-confirm` 확인란을 켜야 「승인」 이 켜지고 `confirm: true` 를 보낸다.
- 승인 결과: `ONTOLOGY_CHANGE` 성공이면 `reloadOntology()` 를 부르고 「승인했습니다. 온톨로지 버전 {N} 을(를) 저장했습니다.」. `409 REVISION_CONFLICT` 면 미리보기를 다시 부른다. `409 ONTOLOGY_IMPACT_UNCONFIRMED` 면 응답 `details.impacts` 로 영향 목록을 다시 그린다.
- 빈 상태 문장을 `docs/flow.md` 와 맞춘다.

### 4. 「연동」 화면 `TokensTab.tsx`

- 새 부품 `web/src/components/tokens/InstallGuide.tsx`: `integrations-install` 안에 `install-claude`, `install-codex` 두 칸. 단계와 명령은 `docs/flow.md` 「Claude Code·Codex 에서 쓰기」 다. 명령 줄마다 `install-command`(`data-command`)와 `install-copy`. 복사하면 2초 동안 「복사했습니다」.
- `TokensTab` 의 순서: `InstallGuide`, `ConnectionsSection`, `<details data-testid="tokens-advanced">`(제목 「고급: 개인 비서 연동」, 기본 접힘) 안에 지금의 토큰 안내(`tokens-guide`), 표, 발급 단추.
- 명령 문자열은 한 곳(`InstallGuide.tsx` 의 상수)에만 둔다.

### 5. 이 phase 를 검증하는 테스트

- `web/src/lib/proposals.test.ts`(수정): 새 종류의 `kindLabel`, `proposalSummary`(고치기, 보관, 관계 보관, 주장, 온톨로지), `canAccept`(EDITOR 는 `ONTOLOGY_CHANGE` 를 승인하지 못하고 ADMIN 은 한다), `isStaleOntologyChange`.
- `web/src/components/proposals/ProposalsTab.test.tsx`(수정): EDITOR 가 본 `ONTOLOGY_CHANGE` 카드에 `proposal-admin-required` 와 꺼진 `proposal-accept` 가 있다. 미리보기 결과를 넘긴 ADMIN 카드에 영향이 있으면 `proposal-ontology-confirm` 이 있다. 기준 버전이 다른 카드에 `proposal-ontology-stale` 이 있다. 새 종류에 `proposal-edit-open` 이 없다.
- `web/src/components/tokens/TokensTab.test.tsx`(수정): `integrations-install` 이 `connections-section` 앞에 있고, `tokens-advanced` 가 `open` 속성 없이 그려지며 그 안에 `tokens-guide` 가 있다. `install-command` 의 `data-command` 에 `/plugin install valuation-ontology@fos-valuation-ontology` 와 `codex plugin add valuation-ontology@fos-valuation-ontology` 가 있다.

## 검증

```bash
cd web && npm run typecheck && npm test && npm run build
```

종료 코드 0.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `web/src/api/types.ts` | 수정 |
| `web/src/api/client.ts` | 수정 |
| `web/src/lib/proposals.ts` | 수정 |
| `web/src/lib/proposals.test.ts` | 수정 |
| `web/src/components/proposals/ProposalsTab.tsx` | 수정 |
| `web/src/components/proposals/OntologyChangeCard.tsx` | 신규 |
| `web/src/components/proposals/ProposalsTab.test.tsx` | 수정 |
| `web/src/components/tokens/TokensTab.tsx` | 수정 |
| `web/src/components/tokens/InstallGuide.tsx` | 신규 |
| `web/src/components/tokens/TokensTab.test.tsx` | 수정 |
| `web/src/App.tsx` | 수정 |
