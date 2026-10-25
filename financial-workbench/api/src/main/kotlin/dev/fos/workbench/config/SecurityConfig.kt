package dev.fos.workbench.config

import dev.fos.workbench.agent.BearerTokenFilter
import dev.fos.workbench.agent.IntegrationTokenService
import dev.fos.workbench.agent.RateLimiter
import dev.fos.workbench.auth.AllowlistOidcUserService
import dev.fos.workbench.auth.CurrentUserFilter
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.web.ApiError
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.security.access.hierarchicalroles.RoleHierarchy
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository
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
    fun agentRateLimiter(properties: WorkbenchProperties) = RateLimiter(properties.agent.rateLimitPerMinute)

    /**
     * `/api/v1` 아래 경로만 맡고 [filterChain] 보다 먼저 돈다. 연동 토큰(`Authorization: Bearer`)으로만 인증한다.
     * 세션을 읽지도 만들지도 않고 CSRF 를 쓰지 않는다(docs/adr/012-agent-integration-token.md).
     */
    @Bean
    @Order(1)
    fun agentFilterChain(
        http: HttpSecurity,
        mapper: JsonMapper,
        tokens: IntegrationTokenService,
        limiter: RateLimiter,
        properties: WorkbenchProperties,
    ): SecurityFilterChain {
        http
            .securityMatcher("/api/v1/**")
            .authorizeHttpRequests { it.anyRequest().hasRole("VIEWER") }
            .csrf { it.disable() }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            // STATELESS 만으로는 세션 저장소가 바뀌지 않는 버전이 있어 요청 범위 저장소를 직접 둔다
            .securityContext { it.securityContextRepository(RequestAttributeSecurityContextRepository()) }
            .addFilterAfter(BearerTokenFilter(tokens, limiter, mapper), SecurityContextHolderFilter::class.java)
            .exceptionHandling {
                it.authenticationEntryPoint { _, response, _ ->
                    write(mapper, response, 401, ApiError("UNAUTHENTICATED", "연동 토큰이 없거나 올바르지 않습니다."))
                }
                it.accessDeniedHandler { _, response, _ ->
                    write(mapper, response, 403, ApiError("FORBIDDEN", "이 작업을 할 권한이 없습니다."))
                }
            }
            .headers { securityHeaders(it, properties) }
            .formLogin { it.disable() }
            .httpBasic { it.disable() }
            .logout { it.disable() }
            .requestCache { it.disable() }
        return http.build()
    }

    @Bean
    @Order(2)
    fun filterChain(
        http: HttpSecurity,
        mapper: JsonMapper,
        oidcUserService: AllowlistOidcUserService,
        users: UserRepository,
        properties: WorkbenchProperties,
    ): SecurityFilterChain {
        val csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse().apply {
            setCookieCustomizer { it.secure(properties.security.secureCookies).sameSite("Lax").path("/") }
        }
        http
            .authorizeHttpRequests {
                it.requestMatchers("/api/health", "/api/auth/csrf").permitAll()
                    .requestMatchers("/api/users", "/api/users/**").hasRole("ADMIN")
                    .requestMatchers("/api/ontology/versions", "/api/ontology/versions/**", "/api/ontology/export", "/api/ontology/preview").hasRole("ADMIN")
                    // 내 이해 표시는 열람자도 쓴다(docs/adr/011-learning-marks-and-trace.md)
                    .requestMatchers("/api/me/**").hasRole("VIEWER")
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
                    write(mapper, response, 401, ApiError("UNAUTHENTICATED", "로그인이 필요합니다."))
                }
                it.accessDeniedHandler { _, response, e ->
                    if (e is CsrfException) {
                        write(mapper, response, 403, ApiError("CSRF_REJECTED", "CSRF 토큰이 없거나 올바르지 않습니다. 화면을 새로 고친 뒤 다시 시도하세요."))
                    } else {
                        write(mapper, response, 403, ApiError("FORBIDDEN", "이 작업을 할 권한이 없습니다."))
                    }
                }
            }
            .headers { securityHeaders(it, properties) }
            .formLogin { it.disable() }
            .httpBasic { it.disable() }
            .logout { it.disable() }
            .requestCache { it.disable() }
        return http.build()
    }

    private fun write(mapper: JsonMapper, response: HttpServletResponse, status: Int, error: ApiError) {
        response.status = status
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = "UTF-8"
        response.writer.write(mapper.writeValueAsString(error))
    }

    /** CSP, Referrer-Policy, frame 금지, HSTS. 두 체인이 같은 값을 쓴다 */
    private fun securityHeaders(headers: HeadersConfigurer<HttpSecurity>, properties: WorkbenchProperties) {
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
}
