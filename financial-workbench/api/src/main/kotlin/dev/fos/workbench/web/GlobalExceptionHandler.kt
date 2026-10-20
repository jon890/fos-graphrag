package dev.fos.workbench.web

import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.HttpRequestMethodNotSupportedException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.servlet.resource.NoResourceFoundException

@RestControllerAdvice
class GlobalExceptionHandler {

    private val log = LoggerFactory.getLogger(javaClass)

    @ExceptionHandler(ApiException::class)
    fun api(e: ApiException): ResponseEntity<ApiError> = ResponseEntity.status(e.status).body(ApiError(e.code, e.message, e.details))

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun invalid(e: MethodArgumentNotValidException): ResponseEntity<ApiError> =
        validation(e.bindingResult.fieldErrors.associate { it.field to (it.defaultMessage ?: "올바르지 않은 값") })

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun unreadable(e: HttpMessageNotReadableException): ResponseEntity<ApiError> =
        validation(mapOf("body" to "본문을 읽을 수 없습니다. JSON 형식과 필드 타입을 확인하세요."))

    @ExceptionHandler(MissingServletRequestParameterException::class)
    fun missing(e: MissingServletRequestParameterException): ResponseEntity<ApiError> =
        validation(mapOf(e.parameterName to "필수 값입니다."))

    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun mismatch(e: MethodArgumentTypeMismatchException): ResponseEntity<ApiError> =
        validation(mapOf(e.name to "형식이 올바르지 않습니다."))

    @ExceptionHandler(NoResourceFoundException::class)
    fun noResource(e: NoResourceFoundException): ResponseEntity<ApiError> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError("NOT_FOUND", "대상을 찾을 수 없습니다."))

    @ExceptionHandler(HttpRequestMethodNotSupportedException::class)
    fun method(e: HttpRequestMethodNotSupportedException): ResponseEntity<ApiError> =
        ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(ApiError("METHOD_NOT_ALLOWED", "지원하지 않는 메서드입니다."))

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun integrity(e: DataIntegrityViolationException): ResponseEntity<ApiError> = api(DuplicateException("이미 같은 값이 있습니다."))

    /**
     * 트랜잭션 시간 제한, Neo4j 연결 끊김, 잠금 충돌은 Spring 이 여러 예외로 감싸 올린다.
     * 분류는 Neo4jErrorClassifier 가 한다. Neo4j 오류 원문은 응답에 담지 않는다.
     */
    @ExceptionHandler(Exception::class)
    fun unexpected(e: Exception): ResponseEntity<ApiError> = when (Neo4jErrorClassifier.classify(e)) {
        Neo4jErrorClassifier.Kind.TIMEOUT -> api(QueryTimeoutException())
        Neo4jErrorClassifier.Kind.UNAVAILABLE -> {
            log.warn("Neo4j 에 연결할 수 없다: {}", e.javaClass.simpleName)
            api(DatabaseUnavailableException())
        }
        Neo4jErrorClassifier.Kind.TRANSIENT_CONFLICT -> {
            log.info("일시적 잠금 충돌: {}", e.javaClass.simpleName)
            api(TransientConflictException())
        }
        Neo4jErrorClassifier.Kind.OTHER -> {
            log.error("처리하지 못한 예외", e)
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiError("INTERNAL_ERROR", "서버 오류가 발생했습니다."))
        }
    }

    private fun validation(fieldErrors: Map<String, String>) =
        ResponseEntity.badRequest().body(ApiError("VALIDATION_FAILED", "입력값이 올바르지 않습니다.", mapOf("fieldErrors" to fieldErrors)))
}
