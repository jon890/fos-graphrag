package dev.fos.workbench.graph

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class GraphController(private val graph: GraphService) {

    @GetMapping("/api/graph/neighborhood")
    fun neighborhood(
        @RequestParam id: String,
        @RequestParam(required = false, defaultValue = "1") hops: Int,
        @RequestParam(required = false) types: List<String>?,
        @RequestParam(required = false) reviewStatus: String?,
    ): GraphView = graph.neighborhood(id, hops, types, reviewStatus?.takeIf { it.isNotBlank() })
}
