package dev.fos.workbench.auth

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.userdetails.UserDetails

/** 세션에 저장되는 로그인 사용자. 변경 이력의 actor 로 `id` 를 쓴다. */
class WorkbenchUser(
    val id: String,
    private val username: String,
    val displayName: String,
    private var passwordHash: String?,
    private val enabled: Boolean,
) : UserDetails, java.io.Serializable {
    override fun getAuthorities(): Collection<GrantedAuthority> = listOf(SimpleGrantedAuthority("ROLE_EDITOR"))
    override fun getPassword(): String? = passwordHash
    override fun getUsername(): String = username
    override fun isEnabled(): Boolean = enabled

    fun eraseCredentials() {
        passwordHash = null
    }

    fun toRef() = UserRef(id, username, displayName)
}
