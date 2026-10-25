package dev.fos.workbench.agent

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.TokenLimitException
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * 로그인한 사람 본인의 연동 토큰을 발급하고 폐기한다.
 * 원문은 발급 응답에만 싣는다. 이력을 남기지 않는다(docs/data-schema.md 「연동 토큰」).
 */
@Service
class IntegrationTokenService(private val tokens: IntegrationTokenRepository, private val properties: WorkbenchProperties) {

    @Transactional(readOnly = true)
    fun list(userId: String): List<IntegrationTokenView> = tokens.list(userId)

    /** 사용자 노드를 잠근 뒤 세고 만든다. 같은 사람이 동시에 발급해도 상한을 넘지 않는다 */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun issue(userId: String, body: IssueTokenRequest): IssuedIntegrationToken {
        val name = body.name?.trim().orEmpty()
        if (name.isEmpty() || name.length > MAX_NAME) {
            throw ValidationFailedException(mapOf("name" to "1자 이상 ${MAX_NAME}자 이하여야 합니다."))
        }
        val max = properties.agent.maxTokensPerUser
        // 세션 필터가 지운 사용자를 먼저 막으므로 정상 흐름에서는 null 이 나오지 않는다
        val active = tokens.countActiveLocked(userId) ?: throw IllegalStateException("사용자를 찾을 수 없다: $userId")
        if (active >= max) throw TokenLimitException(max)
        val raw = IntegrationTokens.generate()
        val view = tokens.create(userId, name, IntegrationTokens.hash(raw), IntegrationTokens.last4(raw))
        return IssuedIntegrationToken(view, raw)
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun revoke(userId: String, tokenId: String) {
        if (!tokens.revoke(userId, tokenId)) throw NotFoundException(tokenId)
    }

    companion object {
        const val MAX_NAME = 50
    }
}
