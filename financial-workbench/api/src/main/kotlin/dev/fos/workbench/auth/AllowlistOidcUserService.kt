package dev.fos.workbench.auth

import org.slf4j.LoggerFactory
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.stereotype.Component

/**
 * Google 이 확인한 이메일이 허용 사용자 목록에 있고 활성일 때만 로그인시킨다.
 * 거절 사유는 로그에만 남기고 응답에는 드러내지 않는다(이메일이 목록에 있는지 알 수 없게).
 */
@Component
class AllowlistOidcUserService(private val users: UserRepository) : OAuth2UserService<OidcUserRequest, OidcUser> {

    private val log = LoggerFactory.getLogger(javaClass)
    private val delegate = OidcUserService()

    override fun loadUser(request: OidcUserRequest): OidcUser {
        val oidc = delegate.loadUser(request)
        val user = resolve(oidc.subject ?: deny("sub 이 없는 토큰"), oidc.email, oidc.emailVerified == true)
        users.touchLogin(user.id)
        return WorkbenchPrincipal(user.id, user.role.authorities(), oidc.idToken, oidc.userInfo)
    }

    fun resolve(sub: String, email: String?, emailVerified: Boolean): UserRecord {
        if (!emailVerified || email.isNullOrBlank()) deny("이메일이 확인되지 않은 계정")
        val bySub = users.findByGoogleSub(sub)
        val user = when {
            bySub != null -> bySub
            else -> {
                val byEmail = users.findByEmail(email!!) ?: deny("허용 목록에 없는 이메일")
                if (byEmail.googleSub != null) deny("같은 이메일에 다른 Google 계정이 이미 묶임")
                users.bindGoogleSub(byEmail.id, sub) ?: deny("Google 계정 묶기 경합")
            }
        }
        if (!user.enabled) deny("비활성 사용자")
        return user
    }

    private fun deny(reason: String): Nothing {
        log.info("로그인 거절: {}", reason)
        throw OAuth2AuthenticationException(OAuth2Error("access_denied", "접근 권한이 없습니다.", null))
    }
}
