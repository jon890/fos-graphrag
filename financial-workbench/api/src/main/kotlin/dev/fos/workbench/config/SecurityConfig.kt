package dev.fos.workbench.config

import dev.fos.workbench.auth.Neo4jUserDetailsService
import dev.fos.workbench.web.ApiError
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.ProviderManager
import org.springframework.security.authentication.dao.DaoAuthenticationProvider
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.security.web.context.SecurityContextRepository
import org.springframework.security.web.csrf.CsrfException
import tools.jackson.databind.json.JsonMapper

@Configuration
class SecurityConfig {

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder(10)

    @Bean
    fun authenticationManager(users: Neo4jUserDetailsService, encoder: PasswordEncoder): AuthenticationManager {
        val provider = DaoAuthenticationProvider(users).apply { setPasswordEncoder(encoder) }
        return ProviderManager(provider)
    }

    @Bean
    fun securityContextRepository(): SecurityContextRepository = HttpSessionSecurityContextRepository()

    /** user-add 명령은 웹 서버 없이 돌므로 필터 체인을 만들지 않는다. */
    @Bean
    @ConditionalOnWebApplication
    fun filterChain(http: HttpSecurity, contextRepository: SecurityContextRepository, mapper: JsonMapper): SecurityFilterChain {
        fun write(response: HttpServletResponse, status: Int, error: ApiError) {
            response.status = status
            response.contentType = MediaType.APPLICATION_JSON_VALUE
            response.characterEncoding = "UTF-8"
            response.writer.write(mapper.writeValueAsString(error))
        }
        http
            .authorizeHttpRequests {
                it.requestMatchers("/api/health", "/api/auth/csrf", "/api/auth/login").permitAll()
                    .requestMatchers("/api/**").authenticated()
                    .anyRequest().permitAll()
            }
            // XSRF-TOKEN 쿠키와 X-XSRF-TOKEN 헤더. SPA 용 요청 처리기를 함께 설정한다
            .csrf { it.spa() }
            .securityContext { it.securityContextRepository(contextRepository) }
            .exceptionHandling {
                it.authenticationEntryPoint { _, response, _ ->
                    write(response, 401, ApiError("UNAUTHENTICATED", "로그인이 필요합니다."))
                }
                it.accessDeniedHandler { _, response, e ->
                    if (e is CsrfException) {
                        write(response, 403, ApiError("CSRF_REJECTED", "CSRF 토큰이 없거나 올바르지 않습니다. 화면을 새로 고친 뒤 다시 시도하세요."))
                    } else {
                        write(response, 403, ApiError("FORBIDDEN", "권한이 없습니다."))
                    }
                }
            }
            .formLogin { it.disable() }
            .httpBasic { it.disable() }
            .logout { it.disable() }
            .requestCache { it.disable() }
        return http.build()
    }
}
