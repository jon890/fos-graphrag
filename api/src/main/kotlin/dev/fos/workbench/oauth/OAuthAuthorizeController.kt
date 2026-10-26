package dev.fos.workbench.oauth

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * 인가 요청의 입구. 검사하지 않고 받은 query 를 그대로 붙여 동의 화면 `/connect` 로 넘긴다.
 * 오류를 앱에 돌려보낼지 화면에 보일지는 동의 화면이 부르는 `/api/oauth/authorize` 가 정한다.
 */
@RestController
class OAuthAuthorizeController {

    @GetMapping("/oauth/authorize")
    fun authorize(request: HttpServletRequest): ResponseEntity<Void> {
        val query = request.queryString
        val location = if (query.isNullOrEmpty()) CONNECT_PATH else "$CONNECT_PATH?$query"
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, location).build()
    }

    companion object {
        const val CONNECT_PATH = "/connect"
    }
}
