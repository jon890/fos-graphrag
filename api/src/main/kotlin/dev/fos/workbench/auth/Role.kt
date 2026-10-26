package dev.fos.workbench.auth

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority

/** 사용자 역할. 위 역할은 아래 역할의 권한을 모두 가진다(SecurityConfig 의 RoleHierarchy). */
enum class Role {
    VIEWER,
    EDITOR,
    ADMIN,
    ;

    fun authorities(): List<GrantedAuthority> = listOf(SimpleGrantedAuthority("ROLE_$name"))

    companion object {
        fun parse(value: String?): Role? = entries.firstOrNull { it.name == value }
    }
}
