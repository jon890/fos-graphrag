package dev.fos.workbench.web

import dev.fos.workbench.ontology.Ontology
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class HealthController(private val client: Neo4jClient, private val ontology: Ontology) {

    @GetMapping("/api/health")
    fun health(): ResponseEntity<Map<String, String>> {
        val neo4jUp = runCatching { client.query("RETURN 1 AS ok").fetch().one().isPresent }.getOrDefault(false)
        val body = mapOf(
            "status" to if (neo4jUp) "UP" else "DOWN",
            "neo4j" to if (neo4jUp) "UP" else "DOWN",
            "ontologyVersion" to ontology.schemaVersion,
        )
        return ResponseEntity.status(if (neo4jUp) HttpStatus.OK else HttpStatus.SERVICE_UNAVAILABLE).body(body)
    }
}
