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
}
