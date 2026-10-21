# 흐름

## 로그인

```mermaid
sequenceDiagram
  participant W as 브라우저
  participant A as API
  participant G as Google
  participant N as Neo4j
  W->>A: GET /api/auth/me
  A-->>W: 401 UNAUTHENTICATED
  W->>A: GET /oauth2/authorization/google
  A-->>W: 302 Google 동의 화면 (state, nonce)
  W->>G: 로그인과 동의
  G-->>W: 302 /login/oauth2/code/google?code
  W->>A: 콜백
  A->>G: code 로 ID 토큰 교환
  A->>A: email_verified 확인
  A->>N: googleSub 으로 사용자 찾기, 없으면 이메일로 찾고 sub 묶기
  alt 허용 목록에 있고 활성
    A-->>W: 302 /, 새 세션 쿠키
  else 확인 안 된 이메일, 목록 밖, 다른 sub, 비활성
    A-->>W: 302 /?login=denied, 세션 없음
  end
```

로그인한 뒤에도 API 는 요청마다 사용자 상태와 역할을 다시 읽는다.
관리자가 사용자를 비활성화하면 그 사용자의 다음 요청은 `401` 이고 세션이 지워진다.

## 공급 관계 Claim 등록과 검토

```mermaid
sequenceDiagram
  participant UA as 사용자 A
  participant UB as 사용자 B
  participant A as API
  participant N as Neo4j
  UA->>A: POST /api/nodes (Company 둘, Security 하나)
  UA->>A: POST /api/relationships (ISSUES)
  UA->>A: POST /api/nodes (Document)
  UA->>A: POST /api/claims (SUPPLIES_TO, documentIds)
  A->>A: 온톨로지 검증 (predicate, 주어와 목적어 타입, Document 여부)
  A->>N: 한 트랜잭션: Claim, SUBJECT, OBJECT, SUPPORTED_BY, ChangeEvent 생성
  A-->>UA: 201 ClaimView (DRAFT)
  UB->>A: GET /api/claims?reviewStatus=DRAFT
  UB->>A: POST /api/claims/{id}/review (REVIEWED, expectedRevision)
  alt 작성자나 마지막 내용 수정자가 검토
    A-->>UB: 403 SELF_REVIEW_FORBIDDEN
  else revision 일치
    A->>N: 한 트랜잭션: 잠금, 비교, 상태 변경, ChangeEvent
    A-->>UB: 200 ClaimView (REVIEWED, reviewedBy = B)
  end
```

## 동시 수정

```mermaid
sequenceDiagram
  participant UA as 사용자 A
  participant UB as 사용자 B
  participant A as API
  participant N as Neo4j
  UA->>A: GET /api/nodes/{id} (revision 3)
  UB->>A: GET /api/nodes/{id} (revision 3)
  UA->>A: PATCH expectedRevision 3
  A->>N: 잠금 획득, revision 3 확인, 갱신 4, 이력, 커밋
  A-->>UA: 200 (revision 4)
  UB->>A: PATCH expectedRevision 3
  A->>N: 잠금 획득, revision 4 확인
  A->>N: 롤백
  A-->>UB: 409 REVISION_CONFLICT (current 4)
  UB->>A: GET /api/nodes/{id} (화면이 최신 값을 다시 읽는다)
```

두 요청이 같은 순간에 오면 한쪽이 잠금을 기다린다. 기다린 쪽은 먼저 커밋된 revision 을 읽고 409 를 받는다.

## 쓰기 공통 분기

```mermaid
flowchart TD
  R[쓰기 요청] --> S{세션}
  S -- 없음 --> E401[401 UNAUTHENTICATED]
  S -- 있음 --> RL{역할}
  RL -- 모자람 --> E403R[403 FORBIDDEN]
  RL -- 충분 --> C{CSRF 토큰}
  C -- 틀림 --> E403[403 CSRF_REJECTED]
  C -- 맞음 --> V{입력 형식}
  V -- 틀림 --> E400[400 VALIDATION_FAILED]
  V -- 맞음 --> O{온톨로지}
  O -- 위반 --> E400O[400 ONTOLOGY_VIOLATION]
  O -- 통과 --> L[트랜잭션 시작, 대상 잠금]
  L --> F{대상 존재}
  F -- 없음 --> E404[404 NOT_FOUND]
  F -- 있음 --> AR{보관됨}
  AR -- 예, 수정 요청 --> E409A[409 ARCHIVED]
  AR -- 아니오 --> RV{revision 일치}
  RV -- 다름 --> E409[409 REVISION_CONFLICT]
  RV -- 같음 --> W[갱신, revision+1, ChangeEvent, 커밋]
  W --> OK[200]
```

이력 기록이 실패하면 트랜잭션 전체가 롤백된다. 데이터만 바뀌고 이력이 없는 상태는 생기지 않는다.

## 주변 그래프

```mermaid
flowchart TD
  Q[GET /api/graph/neighborhood] --> H{hops 가 1 이상 max-hops 이하}
  H -- 아니오 --> E400[400 VALIDATION_FAILED]
  H -- 예 --> C{중심 노드가 있고 보관되지 않음}
  C -- 아니오 --> E404[404 NOT_FOUND]
  C -- 예 --> N[보관되지 않은 경로로 이웃 노드 수집, max-nodes+1 개까지]
  N --> T[필터: types, reviewStatus]
  T --> R[수집한 노드 사이의 보관되지 않은 관계, max-relationships+1 개까지]
  R --> X{한도를 넘었나}
  X -- 예 --> TR[한도까지 자르고 truncated=true]
  X -- 아니오 --> OK[truncated=false]
```

이웃이 없으면 중심 노드 하나만 돌려준다. 화면은 「연결된 노드가 없습니다」 를 표시한다.
시간 제한(`workbench.graph.timeout`)을 넘으면 트랜잭션이 끊기고 `500 INTERNAL_ERROR` 가 아니라 `503 QUERY_TIMEOUT` 을 낸다.

## 좁은 화면의 작업 공간

폭 1024px 이상에서는 검색, 그래프, 상세가 세 칸으로 함께 보인다.
1024px 미만에서는 같은 세 칸을 탭으로 나누고 한 번에 하나만 보인다.
작업 공간을 열 때 고른 항목이 없으면 검색 탭, 있으면 상세 탭으로 시작한다. 목록, 검토 대기, 변경 이력에서 항목을 열면 상세 탭이 열린다.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"'Noto Sans KR', sans-serif","fontSize":"14px","lineColor":"#7A8594","primaryTextColor":"#1D1F23","edgeLabelBackground":"#FFFFFF","clusterBkg":"#FAFAFA"},"flowchart":{"curve":"basis","nodeSpacing":40,"rankSpacing":60,"padding":14}}}%%
flowchart TD
  subgraph 사용자
    A1[검색 결과를 누른다]
    A2[그래프에서 노드를 누른다]
    A3[「상세 보기」 막대를 누른다]
    A4[탭을 직접 누른다]
  end
  subgraph 화면
    S[검색 탭]
    G[그래프 탭]
    D[상세 탭]
    B[그래프 아래 「이름 상세 보기」 막대]
  end
  S --> A1 --> D
  G --> A2 --> B
  B --> A3 --> D
  A4 --> S
  A4 --> G
  A4 --> D
  classDef c1 fill:#E8F1FB,stroke:#3B7DD8,stroke-width:1.5px,color:#0B2545
  classDef c2 fill:#E9F7EF,stroke:#2E9E5B,stroke-width:1.5px,color:#0E3B22
  class A1,A2,A3,A4 c1
  class S,G,D,B c2
  style 사용자 fill:#F6FAFE,stroke:#3B7DD8,stroke-dasharray:4 3
  style 화면 fill:#F5FBF7,stroke:#2E9E5B,stroke-dasharray:4 3
```

- 검색 결과를 누르면 그래프 중심과 상세를 함께 바꾸고 상세 탭으로 넘어간다. 검색 탭에서 노드를 새로 만들어도 같다.
- 그래프에서 노드를 누르면 상세만 바꾸고 그래프 탭에 머문다. 이웃을 잇달아 둘러볼 수 있게 하려는 것이다. 그래프 아래 「그래프에 나온 항목」 목록에서 고를 때도 같다. 고른 노드가 그래프에 있으면 그래프 아래 막대에 그 이름이 나오고, 막대를 누르면 상세 탭으로 간다. 더블클릭이나 「이웃 확장」 으로 이웃을 넓히는 동작과 「선택한 항목을 중심으로」 는 넓은 화면과 같고 탭을 옮기지 않는다.
- 아무것도 고르지 않았으면 상세 탭은 「항목을 선택하면 상세가 여기에 나옵니다.」 를 보인다. 그래프 탭은 넓은 화면과 같은 시작 안내(`WelcomeGuide`)를 보인다.
- 그래프를 읽다 실패하면 오류는 그래프 탭 안에 나온다. 다른 탭에 있으면 그 탭으로 옮기지 않는다.
- 창 폭이 1024px 를 넘나들어도 고른 노드, 그래프, 마지막 탭은 그대로다. 그래프 탭이 다시 보이면 그래프 크기를 다시 재고 화면에 맞춘다. 숨겨져 있던 동안에는 크기가 0 이라 그대로 두면 빈 캔버스가 남는다.
- 머리글의 탭 여섯 개와 표 화면(목록, 검토 대기, 변경 이력, 사용자)은 좁은 화면에서 가로로 밀어서 본다. 페이지 전체에는 가로 스크롤이 생기지 않는다.

## 보관과 복원

```mermaid
flowchart LR
  A[활성] -- archive, expectedRevision --> B[보관됨]
  B -- restore, expectedRevision --> A
```

두 전이 모두 revision 을 올리고 ChangeEvent(`ARCHIVE`, `RESTORE`)를 남긴다. 이전 이력은 지우지 않는다.
