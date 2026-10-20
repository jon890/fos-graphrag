package dev.fos.workbench.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

@ConfigurationProperties("workbench")
data class WorkbenchProperties(
    val graph: Graph = Graph(),
) {
    data class Graph(
        val maxHops: Int = 2,
        val maxNodes: Int = 150,
        val maxRelationships: Int = 300,
        val timeout: Duration = Duration.ofSeconds(5),
    )
}
