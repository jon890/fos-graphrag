package dev.fos.workbench.web

import org.neo4j.driver.exceptions.Neo4jException
import org.neo4j.driver.exceptions.ServiceUnavailableException
import org.neo4j.driver.exceptions.SessionExpiredException
import org.springframework.dao.DataAccessResourceFailureException

/**
 * Spring 이 여러 겹으로 감싼 Neo4j 예외를 원인 사슬과 Neo4j 오류 코드로 분류한다.
 * 판정 순서가 계약이다. 시간 초과, 사용 불가, 일시 충돌 순으로 보고, 앞에서 맞으면 뒤는 보지 않는다.
 * Spring 의 TransientDataAccessException 은 연결 끊김도 감싸므로 그 타입만으로 일시 충돌이라 판정하지 않는다.
 */
object Neo4jErrorClassifier {

    enum class Kind { TIMEOUT, UNAVAILABLE, TRANSIENT_CONFLICT, OTHER }

    private val TIMEOUT_CODES = listOf("TransactionTimedOut")
    private val UNAVAILABLE_CODES = listOf("General.DatabaseUnavailable", "Database.DatabaseUnavailable")

    /** 다시 시도하면 풀리는 잠금 충돌. 교착 감지와 잠금 대기 시간 초과다. */
    private val CONFLICT_CODES = listOf("DeadlockDetected", "LockAcquisitionTimeout", "LockClientStopped")

    fun classify(e: Throwable): Kind {
        val chain = generateSequence(e) { it.cause }.take(20).toList()
        val codes = chain.filterIsInstance<Neo4jException>().mapNotNull { it.code() } +
            chain.mapNotNull { it.message }
        fun anyCode(names: List<String>) = codes.any { text -> names.any { text.contains(it) } }
        return when {
            anyCode(TIMEOUT_CODES) -> Kind.TIMEOUT
            chain.any { it is ServiceUnavailableException || it is SessionExpiredException || it is DataAccessResourceFailureException } ||
                anyCode(UNAVAILABLE_CODES) -> Kind.UNAVAILABLE
            anyCode(CONFLICT_CODES) -> Kind.TRANSIENT_CONFLICT
            else -> Kind.OTHER
        }
    }
}
