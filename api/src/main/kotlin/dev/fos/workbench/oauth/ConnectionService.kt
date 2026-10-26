package dev.fos.workbench.oauth

import dev.fos.workbench.config.Limits
import dev.fos.workbench.web.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** 로그인한 사람 본인의 앱 연결. 끊으면 그 연결의 접근 토큰과 갱신 토큰이 다음 요청부터 막힌다. 이력을 남기지 않는다 */
@Service
class ConnectionService(private val grants: OAuthGrantRepository) {

    @Transactional(readOnly = true)
    fun list(userId: String): List<ConnectionView> = grants.list(userId)

    /** 내 연결이 아니거나 없으면 `404 NOT_FOUND` 다 */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun disconnect(userId: String, id: String) {
        if (!grants.deleteOwned(userId, id)) throw NotFoundException(id)
    }
}
