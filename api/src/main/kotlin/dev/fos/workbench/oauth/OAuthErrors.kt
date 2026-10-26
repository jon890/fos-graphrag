package dev.fos.workbench.oauth

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty
import dev.fos.workbench.web.Neo4jErrorClassifier
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.HttpMediaTypeNotSupportedException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

/** OAuth 형식의 오류(RFC 6749 5.2). `/oauth/` 아래 컨트롤러만 던진다. `/api/oauth/` 아래 경로는 [dev.fos.workbench.web.ApiException] 을 쓴다 */
class OAuthException(val status: HttpStatus, val error: String, val description: String) : RuntimeException(description)

/** OAuth 경로의 오류 본문. `{code, message}` 가 아니다(docs/api-contract.md 「OAuth 인가 서버」) */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class OAuthErrorBody(
    @get:JsonProperty("error") val error: String,
    @get:JsonProperty("error_description") val errorDescription: String? = null,
)

/**
 * `/oauth/` 아래 컨트롤러의 오류를 OAuth 형식으로 쓴다. 전역 처리기보다 먼저 보도록 순서를 앞에 둔다.
 * 본문을 읽기 전에 난 오류(누락 파라미터, 읽을 수 없는 본문, Content-Type, 타입 불일치)도 여기서 바꾼다.
 * 받은 값(코드, 토큰, 주소)은 `error_description` 과 로그에 담지 않는다.
 */
@RestControllerAdvice(
    assignableTypes = [OAuthMetadataController::class, OAuthRegisterController::class, OAuthAuthorizeController::class, OAuthTokenController::class],
)
@Order(Ordered.HIGHEST_PRECEDENCE)
class OAuthExceptionHandler {

    private val log = LoggerFactory.getLogger(javaClass)

    @ExceptionHandler(OAuthException::class)
    fun oauth(e: OAuthException): ResponseEntity<OAuthErrorBody> = ResponseEntity.status(e.status).body(OAuthErrorBody(e.error, e.description))

    @ExceptionHandler(MissingServletRequestParameterException::class)
    fun missing(e: MissingServletRequestParameterException, request: HttpServletRequest) =
        badRequest(request, "${e.parameterName} 이 필요합니다.")

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun unreadable(e: HttpMessageNotReadableException, request: HttpServletRequest) =
        badRequest(request, "본문을 읽을 수 없습니다. 형식을 확인하세요.")

    @ExceptionHandler(HttpMediaTypeNotSupportedException::class)
    fun mediaType(e: HttpMediaTypeNotSupportedException, request: HttpServletRequest) =
        badRequest(request, "지원하지 않는 Content-Type 입니다.")

    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun mismatch(e: MethodArgumentTypeMismatchException, request: HttpServletRequest) =
        badRequest(request, "${e.name} 의 형식이 올바르지 않습니다.")

    /** 전역 처리기의 `{code, message}` 로 새지 않게 나머지도 OAuth 형식으로 쓴다. Neo4j 를 쓸 수 없으면 503 이다 */
    @ExceptionHandler(Exception::class)
    fun unexpected(e: Exception): ResponseEntity<OAuthErrorBody> = when (Neo4jErrorClassifier.classify(e)) {
        Neo4jErrorClassifier.Kind.OTHER -> {
            log.error("OAuth 요청에서 처리하지 못한 예외", e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(OAuthErrorBody("server_error", "서버 오류가 발생했습니다."))
        }
        else -> {
            log.warn("OAuth 요청을 처리하지 못했다(데이터베이스): {}", e.javaClass.simpleName)
            ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(OAuthErrorBody("temporarily_unavailable", "잠시 뒤 다시 시도하세요."))
        }
    }

    /** 등록 경로는 RFC 7591 의 `invalid_client_metadata`, 토큰과 폐기 경로는 RFC 6749 의 `invalid_request` 다 */
    private fun badRequest(request: HttpServletRequest, description: String): ResponseEntity<OAuthErrorBody> {
        val error = if (request.requestURI == OAuthRegisterController.PATH) INVALID_CLIENT_METADATA else INVALID_REQUEST
        return ResponseEntity.badRequest().body(OAuthErrorBody(error, description))
    }

    companion object {
        const val INVALID_REQUEST = "invalid_request"
        const val INVALID_CLIENT_METADATA = "invalid_client_metadata"
        const val INVALID_REDIRECT_URI = "invalid_redirect_uri"
        const val TOO_MANY_REQUESTS = "too_many_requests"
    }
}
