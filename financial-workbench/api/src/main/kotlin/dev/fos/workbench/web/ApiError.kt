package dev.fos.workbench.web

import org.springframework.http.HttpStatus

data class ApiError(
    val code: String,
    val message: String,
    val details: Map<String, Any?> = emptyMap(),
)

/** API 계약의 오류 코드를 그대로 응답으로 바꾸는 예외. 코드 목록은 docs/api-contract.md 「오류 형식」 절이다. */
open class ApiException(
    val status: HttpStatus,
    val code: String,
    override val message: String,
    val details: Map<String, Any?> = emptyMap(),
) : RuntimeException(message)

class ValidationFailedException(fieldErrors: Map<String, String>, message: String = "입력값이 올바르지 않습니다.") :
    ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", message, mapOf("fieldErrors" to fieldErrors))

class OntologyViolationException(rule: String, message: String) :
    ApiException(HttpStatus.BAD_REQUEST, "ONTOLOGY_VIOLATION", message, mapOf("rule" to rule))

class NotFoundException(id: String) :
    ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "대상을 찾을 수 없습니다.", mapOf("id" to id))

class RevisionConflictException(expected: Long, current: Long) :
    ApiException(
        HttpStatus.CONFLICT, "REVISION_CONFLICT", "다른 사용자가 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.",
        mapOf("expectedRevision" to expected, "currentRevision" to current),
    )

class ArchivedException : ApiException(HttpStatus.CONFLICT, "ARCHIVED", "보관된 대상입니다. 먼저 복원하세요.")

class NotArchivedException : ApiException(HttpStatus.CONFLICT, "NOT_ARCHIVED", "보관되지 않은 대상입니다.")

class DuplicateException(message: String) : ApiException(HttpStatus.CONFLICT, "DUPLICATE", message)

class SelfReviewForbiddenException :
    ApiException(HttpStatus.FORBIDDEN, "SELF_REVIEW_FORBIDDEN", "자기가 작성한 Claim 은 검토할 수 없습니다.")

class QueryTimeoutException :
    ApiException(HttpStatus.SERVICE_UNAVAILABLE, "QUERY_TIMEOUT", "그래프 조회가 시간 제한을 넘었습니다. 범위를 줄여 다시 시도하세요.")

class DatabaseUnavailableException :
    ApiException(HttpStatus.SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "데이터베이스에 연결할 수 없습니다. 백업이나 재시작 중일 수 있으니 잠시 뒤 다시 시도하세요.")
