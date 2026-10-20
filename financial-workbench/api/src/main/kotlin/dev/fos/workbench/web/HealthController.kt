package dev.fos.workbench.web

import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/** 인증 없이 열리므로 상태 하나만 알린다. 버전이나 구성 요소 상태는 내보내지 않는다. */
@RestController
class HealthController(private val client: Neo4jClient) {

    @GetMapping("/api/health")
    fun health(): ResponseEntity<Map<String, String>> {
        val up = runCatching { client.query("RETURN 1 AS ok").fetch().one().isPresent }.getOrDefault(false)
        return ResponseEntity.status(if (up) HttpStatus.OK else HttpStatus.SERVICE_UNAVAILABLE)
            .body(mapOf("status" to if (up) "UP" else "DOWN"))
    }
}
