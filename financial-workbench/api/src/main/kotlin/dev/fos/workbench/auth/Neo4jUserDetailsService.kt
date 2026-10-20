package dev.fos.workbench.auth

import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service

@Service
class Neo4jUserDetailsService(private val users: UserRepository) : UserDetailsService {
    override fun loadUserByUsername(username: String): UserDetails {
        val u = users.findByUsername(username) ?: throw UsernameNotFoundException("사용자가 없습니다.")
        return WorkbenchUser(u.id, u.username, u.displayName, u.passwordHash, u.enabled)
    }
}
