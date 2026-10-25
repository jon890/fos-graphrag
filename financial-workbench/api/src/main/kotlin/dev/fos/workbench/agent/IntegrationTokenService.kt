package dev.fos.workbench.agent

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.TokenLimitException
import dev.fos.workbench.web.ValidationFailedException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.time.Duration
import java.time.Instant

/**
 * 로그인한 사람 본인의 연동 토큰을 발급하고 폐기하며, `/api/v1` 요청의 토큰을 확인한다.
 * 원문은 발급 응답에만 싣는다. 이력을 남기지 않는다(docs/data-schema.md 「연동 토큰」).
 */
@Service
class IntegrationTokenService(
    private val tokens: IntegrationTokenRepository,
    private val properties: WorkbenchProperties,
    transactionManager: PlatformTransactionManager,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    // 인증은 모든 /api/v1 요청 앞에서 돈다. Neo4j 가 느려도 요청 스레드가 무기한 묶이지 않게 시간 제한을 건다.
    private val readOnly = TransactionTemplate(transactionManager).apply {
        isReadOnly = true
        timeout = Limits.WRITE_TIMEOUT_SECONDS
    }

    private val write = TransactionTemplate(transactionManager).apply { timeout = Limits.WRITE_TIMEOUT_SECONDS }

    @Transactional(readOnly = true)
    fun list(userId: String): List<IntegrationTokenView> = tokens.list(userId)

    /** 사용자 노드를 잠근 뒤 세고 만든다. 같은 사람이 동시에 발급해도 상한을 넘지 않는다 */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun issue(userId: String, body: IssueTokenRequest): IssuedIntegrationToken {
        val name = body.name?.trim().orEmpty()
        if (name.isEmpty() || name.length > MAX_NAME) {
            throw ValidationFailedException(mapOf("name" to "1자 이상 ${MAX_NAME}자 이하여야 합니다."))
        }
        val scope = if (body.scope.isNullOrEmpty()) {
            TokenScope.READ
        } else {
            TokenScope.parse(body.scope) ?: throw ValidationFailedException(mapOf("scope" to "READ, READ_WRITE 가운데 하나여야 합니다."))
        }
        val max = properties.agent.maxTokensPerUser
        // 세션 필터가 지운 사용자를 먼저 막으므로 정상 흐름에서는 null 이 나오지 않는다
        val active = tokens.countActiveLocked(userId) ?: throw IllegalStateException("사용자를 찾을 수 없다: $userId")
        if (active >= max) throw TokenLimitException(max)
        val raw = IntegrationTokens.generate()
        val view = tokens.create(userId, name, scope, IntegrationTokens.hash(raw), IntegrationTokens.last4(raw))
        return IssuedIntegrationToken(view, raw)
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun revoke(userId: String, tokenId: String) {
        if (!tokens.revoke(userId, tokenId)) throw NotFoundException(tokenId)
    }

    /**
     * 원문 형식, 해시, 폐기, 주인 활성을 확인한다. 실패하면 null 이다.
     * 성공하면 읽은 lastUsedAt 이 1분 넘게 지났을 때만 새로 쓴다. 읽기와 쓰기는 각자 짧은 트랜잭션이고, 쓰기 실패는 인증을 막지 않는다.
     */
    fun authenticate(raw: String): AgentPrincipal? {
        if (!IntegrationTokens.isWellFormed(raw)) return null
        val hash = IntegrationTokens.hash(raw)
        val token = readOnly.execute { tokens.findActiveByHash(hash) } ?: return null
        val now = Instant.now()
        if (isStale(token.lastUsedAt, now)) {
            try {
                write.executeWithoutResult { tokens.touchLastUsed(token.tokenId, Timestamps.system(now)) }
            } catch (e: RuntimeException) {
                log.warn("연동 토큰 {} 의 마지막 사용 시각을 쓰지 못했다", token.tokenId, e)
            }
        }
        return AgentPrincipal(token.userId, token.displayName, token.role, token.tokenId, token.tokenName, token.last4, token.scope)
    }

    private fun isStale(lastUsedAt: String?, now: Instant): Boolean {
        val last = lastUsedAt?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return true
        return Duration.between(last, now) > LAST_USED_INTERVAL
    }

    companion object {
        const val MAX_NAME = 50
        private val LAST_USED_INTERVAL: Duration = Duration.ofSeconds(60)
    }
}
