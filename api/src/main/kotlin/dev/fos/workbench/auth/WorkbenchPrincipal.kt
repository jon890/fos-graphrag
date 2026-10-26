package dev.fos.workbench.auth

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.OidcUserInfo
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser

/** 세션에 저장되는 로그인 사용자. `id` 는 :User 의 id 이고 변경 이력의 actor 다. 역할은 요청마다 다시 읽는다. */
class WorkbenchPrincipal(
    val id: String,
    authorities: Collection<GrantedAuthority>,
    idToken: OidcIdToken,
    userInfo: OidcUserInfo?,
) : DefaultOidcUser(authorities, idToken, userInfo, "sub")
