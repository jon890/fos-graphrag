package dev.fos.workbench.ontology

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class OntologyController(private val ontology: Ontology) {
    @GetMapping("/api/ontology")
    fun get(): Ontology = ontology
}
