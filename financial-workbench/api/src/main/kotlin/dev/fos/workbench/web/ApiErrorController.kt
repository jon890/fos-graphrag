package dev.fos.workbench.web

import jakarta.servlet.RequestDispatcher
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.webmvc.error.ErrorController
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** 컨트롤러 밖에서 난 오류(없는 정적 파일 등)도 문서화한 오류 형식으로만 응답한다. 경로, 예외, 시각은 담지 않는다. */
@RestController
class ApiErrorController : ErrorController {

    @RequestMapping("/error")
    fun error(request: HttpServletRequest): ResponseEntity<ApiError> {
        val status = (request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) as? Int)
            ?.let { HttpStatus.resolve(it) } ?: HttpStatus.INTERNAL_SERVER_ERROR
        val error = when (status) {
            HttpStatus.NOT_FOUND -> ApiError("NOT_FOUND", "대상을 찾을 수 없습니다.")
            HttpStatus.METHOD_NOT_ALLOWED -> ApiError("METHOD_NOT_ALLOWED", "지원하지 않는 메서드입니다.")
            HttpStatus.UNAUTHORIZED -> ApiError("UNAUTHENTICATED", "로그인이 필요합니다.")
            HttpStatus.FORBIDDEN -> ApiError("FORBIDDEN", "이 작업을 할 권한이 없습니다.")
            else -> if (status.is4xxClientError) ApiError("BAD_REQUEST", "요청을 처리할 수 없습니다.")
            else ApiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.")
        }
        return ResponseEntity.status(status).body(error)
    }
}
