package dev.fos.workbench.oauth

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Duration
import java.time.Instant

/**
 * `/mcp` 요청의 OAuth 접근 토큰(`fwa_`)을 확인한다. 조건은 docs/data-schema.md 「OAuth 연결」 이다.
 * 이 패키지는 `agent` 에 기대지 않으므로 연결과 주인만 돌려주고, 요청의 주체로 바꾸는 일은 `mcp` 가 한다.
 */
@Service
class OAuthAccessTokenService(
    private val grants: OAuthGrantRepository,
    transactionManager: PlatformTransactionManager,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    // 인증은 모든 /mcp 요청 앞에서 돈다. Neo4j 가 느려도 요청 스레드가 무기한 묶이지 않게 시간 제한을 건다.
    private val readOnly = TransactionTemplate(transactionManager).apply {
        isReadOnly = true
        timeout = Limits.WRITE_TIMEOUT_SECONDS
    }

    private val write = TransactionTemplate(transactionManager).apply { timeout = Limits.WRITE_TIMEOUT_SECONDS }

    /**
     * 원문 형식, 해시, 끝나는 시각, 자원 주소, 주인 활성을 확인한다. 실패하면 null 이다.
     * 성공하면 읽은 lastUsedAt 이 1분 넘게 지났을 때만 새로 쓴다. 읽기와 쓰기는 각자 짧은 트랜잭션이고, 쓰기 실패는 인증을 막지 않는다.
     */
    fun authenticate(raw: String, resource: String): ActiveGrant? {
        if (!OAuthSecrets.isWellFormed(OAuthSecrets.ACCESS, raw)) return null
        val hash = OAuthSecrets.hash(raw)
        val now = Instant.now()
        val grant = readOnly.execute { grants.findActiveByAccess(hash, resource, Timestamps.system(now)) } ?: return null
        if (isStale(grant.lastUsedAt, now)) {
            try {
                write.executeWithoutResult { grants.touchLastUsed(grant.grantId, Timestamps.system(now)) }
            } catch (e: RuntimeException) {
                log.warn("앱 연결 {} 의 마지막 사용 시각을 쓰지 못했다", grant.grantId, e)
            }
        }
        return grant
    }

    private fun isStale(lastUsedAt: String?, now: Instant): Boolean {
        val last = lastUsedAt?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return true
        return Duration.between(last, now) > LAST_USED_INTERVAL
    }

    companion object {
        private val LAST_USED_INTERVAL: Duration = Duration.ofSeconds(60)
    }
}
