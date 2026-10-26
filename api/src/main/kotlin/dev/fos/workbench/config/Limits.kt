package dev.fos.workbench.config

/** 입력과 실행 시간의 상한. 값과 근거는 docs/api-contract.md 「상한」 절과 같다. */
object Limits {
    /** 쓰기 트랜잭션 시간 제한(초). Neo4j 서버의 db.transaction.timeout 보다 짧게 둔다. */
    const val WRITE_TIMEOUT_SECONDS = 8

    /** Claim 하나에 붙일 수 있는 근거 문서 수. */
    const val MAX_DOCUMENTS_PER_CLAIM = 20

    /** 검색어 길이. */
    const val MAX_QUERY_LENGTH = 100

    /** JSON 요청 본문 크기(바이트). 가장 긴 속성(text 4000자)을 여럿 담아도 넉넉하다. */
    const val MAX_BODY_BYTES = 64 * 1024L

    /**
     * 온톨로지 미리보기, 저장, 되돌리기(`POST /api/ontology/` 아래)와 에이전트의 제안 올리기(`POST /api/v1/proposals`),
     * 원격 MCP(`POST /mcp`)의 요청 본문 크기(바이트). 정의 전체를 YAML 이나 JSON 으로 보내고, 온톨로지 변경 제안도 정의 전체를 담는다.
     */
    const val MAX_ONTOLOGY_BODY_BYTES = 512 * 1024L

    /** OAuth 등록, 토큰, 폐기(`POST /oauth/` 아래)의 요청 본문 크기(바이트). */
    const val MAX_OAUTH_BODY_BYTES = 16 * 1024L

    /** 체결 저장 요청 하나에 담는 체결 수. */
    const val MAX_TRADES_PER_REQUEST = 50

    /** 제안 올리기 요청 하나에 담는 제안 수. */
    const val MAX_PROPOSALS_PER_REQUEST = 20

    /** 사용자마다 대기 중인 제안 수. */
    const val MAX_PENDING_PROPOSALS = 200

    /** 승인하거나 거절한 제안을 남겨 두는 날 수. 지나면 올리기 트랜잭션이 지운다. */
    const val DECIDED_PROPOSAL_RETENTION_DAYS = 90L
}
