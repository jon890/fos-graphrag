package dev.fos.workbench.config

import dev.fos.workbench.auth.AllowlistOidcUserService
import dev.fos.workbench.auth.CurrentUserFilter
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.web.ApiError
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.security.access.hierarchicalroles.RoleHierarchy
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.context.SecurityContextHolderFilter
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfException
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy
import tools.jackson.databind.json.JsonMapper
import java.time.Duration

@Configuration
class SecurityConfig {

    /** ADMIN 은 EDITOR 의, EDITOR 는 VIEWER 의 권한을 모두 가진다. */
    @Bean
    fun roleHierarchy(): RoleHierarchy = RoleHierarchyImpl.fromHierarchy("ROLE_ADMIN > ROLE_EDITOR\nROLE_EDITOR > ROLE_VIEWER")

    @Bean
    fun filterChain(
        http: HttpSecurity,
        mapper: JsonMapper,
        oidcUserService: AllowlistOidcUserService,
        users: UserRepository,
        properties: WorkbenchProperties,
    ): SecurityFilterChain {
        fun write(response: HttpServletResponse, status: Int, error: ApiError) {
            response.status = status
            response.contentType = MediaType.APPLICATION_JSON_VALUE
            response.characterEncoding = "UTF-8"
            response.writer.write(mapper.writeValueAsString(error))
        }
        val csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse().apply {
            setCookieCustomizer { it.secure(properties.security.secureCookies).sameSite("Lax").path("/") }
        }
        http
            .authorizeHttpRequests {
                it.requestMatchers("/api/health", "/api/auth/csrf").permitAll()
                    .requestMatchers("/api/users", "/api/users/**").hasRole("ADMIN")
                    .requestMatchers("/api/ontology/versions", "/api/ontology/versions/**", "/api/ontology/export", "/api/ontology/preview").hasRole("ADMIN")
                    .requestMatchers(HttpMethod.GET, "/api/**").hasRole("VIEWER")
                    .requestMatchers("/api/auth/logout").authenticated()
                    .requestMatchers(HttpMethod.POST, "/api/auth/me/guide-done").authenticated()
                    .requestMatchers("/api/**").hasRole("EDITOR")
                    // 정적 파일, OAuth 경로, 오류 페이지
                    .anyRequest().permitAll()
            }
            .oauth2Login {
                it.loginPage("/")
                    .userInfoEndpoint { endpoint -> endpoint.oidcUserService(oidcUserService) }
                    .defaultSuccessUrl("/", true)
                    .failureUrl("/?login=denied")
            }
            // XSRF-TOKEN 쿠키와 X-XSRF-TOKEN 헤더. SPA 용 요청 처리기를 쓰고 쿠키 속성만 바꾼다
            .csrf {
                it.spa()
                it.csrfTokenRepository(csrfRepository)
            }
            .addFilterAfter(CurrentUserFilter(users), SecurityContextHolderFilter::class.java)
            .exceptionHandling {
                it.authenticationEntryPoint { _, response, _ ->
                    write(response, 401, ApiError("UNAUTHENTICATED", "로그인이 필요합니다."))
                }
                it.accessDeniedHandler { _, response, e ->
                    if (e is CsrfException) {
                        write(response, 403, ApiError("CSRF_REJECTED", "CSRF 토큰이 없거나 올바르지 않습니다. 화면을 새로 고친 뒤 다시 시도하세요."))
                    } else {
                        write(response, 403, ApiError("FORBIDDEN", "이 작업을 할 권한이 없습니다."))
                    }
                }
            }
            .headers { headers ->
                headers.contentSecurityPolicy {
                    it.policyDirectives(
                        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
                            "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
                    )
                }
                headers.referrerPolicy { it.policy(ReferrerPolicy.SAME_ORIGIN) }
                headers.frameOptions { it.deny() }
                if (properties.security.hsts) {
                    headers.httpStrictTransportSecurity { it.maxAgeInSeconds(Duration.ofDays(365).seconds).includeSubDomains(true) }
                } else {
                    headers.httpStrictTransportSecurity { it.disable() }
                }
            }
            .formLogin { it.disable() }
            .httpBasic { it.disable() }
            .logout { it.disable() }
            .requestCache { it.disable() }
        return http.build()
    }
}
