package dev.fos.workbench.ontology

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class OntologyLoaderReservedTest {

    private val repo = OntologyLoader.loadDefault()

    @Test
    fun `저장소 정의는 서버 코드가 쓰는 이름을 쓰지 않는다`() {
        assertThat(OntologyLoader.consistencyErrors(repo)).isEmpty()
    }

    @Test
    fun `노드 타입으로 Trade 를 더하면 일관성 검사 오류다`() {
        val withTrade = repo.copy(nodeTypes = repo.nodeTypes + ("Trade" to repo.nodeTypes.getValue("Company")))

        assertThat(OntologyLoader.consistencyErrors(withTrade))
            .containsExactly("Trade 은 서버 코드가 쓰는 이름이라 노드 타입으로 쓸 수 없다")
    }

    @Test
    fun `관계 종류로 OWNS 를 더하면 일관성 검사 오류다`() {
        val withOwns = repo.copy(
            relationshipTypes = repo.relationshipTypes + ("OWNS" to RelationshipTypeDef(description = "x", from = listOf("Company"), to = listOf("Security"))),
        )

        assertThat(OntologyLoader.consistencyErrors(withOwns))
            .containsExactly("OWNS 은 서버 코드가 쓰는 이름이라 관계 종류로 쓸 수 없다")
    }
}
