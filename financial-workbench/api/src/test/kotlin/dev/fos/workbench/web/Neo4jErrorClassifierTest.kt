package dev.fos.workbench.web

import dev.fos.workbench.web.Neo4jErrorClassifier.Kind
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.neo4j.driver.exceptions.ClientException
import org.neo4j.driver.exceptions.ServiceUnavailableException
import org.neo4j.driver.exceptions.SessionExpiredException
import org.neo4j.driver.exceptions.TransientException
import org.springframework.dao.TransientDataAccessResourceException

class Neo4jErrorClassifierTest {

    /** SDN 이 드라이버 예외를 감싸는 모양을 흉내 낸다. */
    private fun wrapped(cause: Throwable) = TransientDataAccessResourceException("wrapped", cause)

    @Test
    fun `연결 끊김은 Spring 의 일시 예외로 감싸여도 사용 불가다`() {
        assertThat(Neo4jErrorClassifier.classify(wrapped(ServiceUnavailableException("down")))).isEqualTo(Kind.UNAVAILABLE)
        assertThat(Neo4jErrorClassifier.classify(wrapped(SessionExpiredException("expired")))).isEqualTo(Kind.UNAVAILABLE)
        val dbUnavailable = TransientException("Neo.TransientError.General.DatabaseUnavailable", "Database unavailable")
        assertThat(Neo4jErrorClassifier.classify(wrapped(dbUnavailable))).isEqualTo(Kind.UNAVAILABLE)
    }

    @Test
    fun `교착과 잠금 대기 초과만 일시 충돌이다`() {
        val deadlock = TransientException("Neo.TransientError.Transaction.DeadlockDetected", "deadlock")
        val lockTimeout = TransientException("Neo.TransientError.Transaction.LockAcquisitionTimeout", "lock timeout")
        assertThat(Neo4jErrorClassifier.classify(wrapped(deadlock))).isEqualTo(Kind.TRANSIENT_CONFLICT)
        assertThat(Neo4jErrorClassifier.classify(wrapped(lockTimeout))).isEqualTo(Kind.TRANSIENT_CONFLICT)
        // 코드 없는 Spring 일시 예외는 충돌로 보지 않는다
        assertThat(Neo4jErrorClassifier.classify(TransientDataAccessResourceException("unknown"))).isEqualTo(Kind.OTHER)
    }

    @Test
    fun `시간 초과가 가장 먼저 판정된다`() {
        val timedOut = ClientException("Neo.ClientError.Transaction.TransactionTimedOut", "timed out")
        assertThat(Neo4jErrorClassifier.classify(wrapped(timedOut))).isEqualTo(Kind.TIMEOUT)
        val timedOutTransient = TransientException("Neo.TransientError.Transaction.TransactionTimedOutClientConfiguration", "timed out")
        assertThat(Neo4jErrorClassifier.classify(wrapped(timedOutTransient))).isEqualTo(Kind.TIMEOUT)
        assertThat(Neo4jErrorClassifier.classify(IllegalStateException("bug"))).isEqualTo(Kind.OTHER)
    }
}
