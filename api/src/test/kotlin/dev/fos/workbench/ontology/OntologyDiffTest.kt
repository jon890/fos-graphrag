package dev.fos.workbench.ontology

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class OntologyDiffTest {

    private val repo = OntologyLoader.loadDefault()

    @Test
    fun `타입을 더하고 속성을 빼고 이름을 바꾸면 세 목록에 그 경로가 하나씩 있다`() {
        val concept = repo.nodeTypes.getValue("Concept")
        val company = repo.nodeTypes.getValue("Company")
        val book = NodeTypeDef(
            label = "책", description = "x", labelProperty = "title",
            properties = mapOf("title" to PropertyDef(PropertyType.STRING, label = "제목", required = true)),
        )
        val edited = repo.copy(
            nodeTypes = repo.nodeTypes + mapOf(
                "Book" to book,
                "Concept" to concept.copy(properties = concept.properties - "description"),
                "Company" to company.copy(label = "회사"),
            ),
        )

        val diff = OntologyDiff.diff(repo, edited)

        assertThat(diff.added).containsExactly("nodeTypes.Book")
        assertThat(diff.removed).containsExactly("nodeTypes.Concept.properties.description")
        assertThat(diff.changed).containsExactly("nodeTypes.Company.label")
    }

    @Test
    fun `enum 값을 빼면 그 값의 경로가 removed 에 있다`() {
        val concept = repo.nodeTypes.getValue("Concept")
        val category = concept.properties.getValue("category")
        val narrowed = concept.copy(properties = concept.properties + ("category" to category.copy(values = category.values!! - "OTHER")))
        val edited = repo.copy(nodeTypes = repo.nodeTypes + ("Concept" to narrowed))

        val diff = OntologyDiff.diff(repo, edited)

        assertThat(diff.removed).containsExactly("nodeTypes.Concept.properties.category.values.OTHER")
        assertThat(diff.added).isEmpty()
    }

    @Test
    fun `없던 제한이 생기면 그 필드 경로가 changed 에 있고 코드가 소유하는 Claim 은 비교하지 않는다`() {
        val person = repo.nodeTypes.getValue("Person")
        val name = person.properties.getValue("name")
        val predicate = ClaimPredicateDef(label = "테스트", description = "x", subjectTypes = listOf("Company"), objectTypes = listOf("Company"))
        val edited = OntologyLoader.withDerivedClaimPredicate(
            repo.copy(
                nodeTypes = repo.nodeTypes + ("Person" to person.copy(properties = person.properties + ("name" to name.copy(min = 1.0)))),
                claimPredicates = repo.claimPredicates + ("TEST_PREDICATE" to predicate),
            ),
        )

        val diff = OntologyDiff.diff(repo, edited)

        assertThat(diff.changed).containsExactly("nodeTypes.Person.properties.name.min")
        assertThat(diff.added).describedAs("Claim 의 predicate 선택지가 바뀌어도 주장 종류 경로만 나온다").containsExactly("claimPredicates.TEST_PREDICATE")
    }

    @Test
    fun `같은 정의는 바뀐 점이 없다`() {
        assertThat(OntologyDiff.diff(repo, OntologyLoader.parse(OntologyLoader.toYaml(repo))).isEmpty()).isTrue()
    }
}
