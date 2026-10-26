package dev.fos.workbench.ontology

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * `/api` 응답에 최신 온톨로지 버전 번호(`X-Ontology-Version`)를 붙인다. 화면은 들고 있는 버전과 다르면 다시 읽으라는 안내를 보인다.
 * 인증 실패(401)와 오류 응답에도 붙도록 Security 필터보다 앞에서 돈다. 더 앞의 `RequestSizeFilter` 가 거절한 413, 411 응답에는 붙지 않는다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
class OntologyVersionHeaderFilter(private val holder: OntologyHolder) : OncePerRequestFilter() {

    override fun shouldNotFilter(request: HttpServletRequest): Boolean = !request.requestURI.startsWith("/api/")

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        holder.snapshotOrNull()?.let { response.setHeader(HEADER, it.version.toString()) }
        chain.doFilter(request, response)
    }

    companion object {
        const val HEADER = "X-Ontology-Version"
    }
}
