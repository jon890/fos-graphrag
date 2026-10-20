package dev.fos.workbench.web

import org.neo4j.driver.exceptions.ClientException
import org.neo4j.driver.exceptions.TransientException
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.InvalidDataAccessResourceUsageException
import org.springframework.dao.TransientDataAccessResourceException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

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

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun integrity(e: DataIntegrityViolationException): ResponseEntity<ApiError> = api(DuplicateException("이미 같은 값이 있습니다."))

    /** 트랜잭션 시간 제한은 드라이버가 ClientException 이나 TransientException 으로 알린다. */
    @ExceptionHandler(TransientDataAccessResourceException::class, InvalidDataAccessResourceUsageException::class, ClientException::class, TransientException::class)
    fun neo4j(e: Exception): ResponseEntity<ApiError> {
        if (isTimeout(e)) return api(QueryTimeoutException())
        return unexpected(e)
    }

    @ExceptionHandler(Exception::class)
    fun unexpected(e: Exception): ResponseEntity<ApiError> {
        log.error("처리하지 못한 예외", e)
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiError("INTERNAL_ERROR", "서버 오류가 발생했습니다."))
    }

    private fun validation(fieldErrors: Map<String, String>) =
        ResponseEntity.badRequest().body(ApiError("VALIDATION_FAILED", "입력값이 올바르지 않습니다.", mapOf("fieldErrors" to fieldErrors)))

    private fun isTimeout(e: Throwable): Boolean =
        generateSequence(e) { it.cause }.any {
            (it is org.neo4j.driver.exceptions.Neo4jException && it.code().contains("TransactionTimedOut")) ||
                (it.message?.contains("TransactionTimedOut") == true)
        }
}
