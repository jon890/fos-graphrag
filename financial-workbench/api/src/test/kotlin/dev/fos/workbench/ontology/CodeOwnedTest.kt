package dev.fos.workbench.ontology

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class CodeOwnedTest {

    private val repo = OntologyLoader.loadDefault()

    @Test
    fun `고친 검토 상태 이름은 저장소 값으로 돌아가고 무시한 경로로 알린다`() {
        val edited = repo.copy(reviewStatuses = repo.reviewStatuses + ("DRAFT" to LabelDef("바꾼 초안")))

        val merged = CodeOwned.merge(edited, repo)

        assertThat(merged.reviewStatuses.getValue("DRAFT").label).isEqualTo(repo.reviewStatuses.getValue("DRAFT").label)
        assertThat(CodeOwned.ignoredPaths(edited, merged)).containsExactly("reviewStatuses.DRAFT")
    }

    @Test
    fun `Claim 타입을 뺀 정의를 합치면 Claim 이 돌아온다`() {
        val edited = repo.copy(nodeTypes = repo.nodeTypes - "Claim")

        val merged = CodeOwned.merge(edited, repo)

        assertThat(merged.nodeTypes["Claim"]).isEqualTo(repo.nodeTypes.getValue("Claim"))
        assertThat(CodeOwned.ignoredPaths(edited, merged)).containsExactly("nodeTypes.Claim")
    }

    @Test
    fun `주장 종류만 더한 정의는 무시한 경로가 없다`() {
        val added = repo.copy(
            claimPredicates = repo.claimPredicates +
                ("TEST_PREDICATE" to ClaimPredicateDef(label = "테스트 관계", description = "x", subjectTypes = listOf("Company"), objectTypes = listOf("Concept"))),
        )
        // 미리보기는 보낸 YAML 을 로더로 읽은 값을 합친다
        val edited = OntologyLoader.parse(OntologyLoader.toYaml(added))

        assertThat(CodeOwned.ignoredPaths(edited, CodeOwned.merge(edited, repo))).isEmpty()
    }

    @Test
    fun `서버 코드가 읽는 속성을 빼거나 필수 여부를 바꾸면 오류다`() {
        val document = repo.nodeTypes.getValue("Document")
        val withoutUrl = repo.copy(nodeTypes = repo.nodeTypes + ("Document" to document.copy(properties = document.properties - "url")))
        assertThat(CodeReadKeys.violations(withoutUrl, repo)).singleElement().asString().contains("Document.url")

        val security = repo.nodeTypes.getValue("Security")
        val ticker = security.properties.getValue("ticker")
        val optionalTicker = repo.copy(
            nodeTypes = repo.nodeTypes + ("Security" to security.copy(properties = security.properties + ("ticker" to ticker.copy(required = false)))),
        )
        assertThat(ticker.required).isTrue()
        assertThat(CodeReadKeys.violations(optionalTicker, repo)).singleElement().asString().contains("Security.ticker")
    }

    @Test
    fun `서버 코드가 읽는 속성의 표시 이름만 바꾸면 오류가 없다`() {
        val document = repo.nodeTypes.getValue("Document")
        val title = document.properties.getValue("title")
        val relabeled = repo.copy(
            nodeTypes = repo.nodeTypes + ("Document" to document.copy(properties = document.properties + ("title" to title.copy(label = "자료 제목")))),
        )
        assertThat(CodeReadKeys.violations(relabeled, repo)).isEmpty()
    }

    @Test
    fun `저장소에 없는 타입에 managedBy 를 달면 오류다`() {
        val fund = NodeTypeDef(
            label = "펀드", description = "x", labelProperty = "name", managedBy = "claims",
            properties = mapOf("name" to PropertyDef(type = PropertyType.STRING, label = "이름", required = true)),
        )
        val edited = repo.copy(nodeTypes = repo.nodeTypes + ("Fund" to fund))

        assertThat(CodeOwned.errors(edited, repo)).singleElement().asString().contains("Fund").contains("managedBy")
        assertThat(CodeOwned.errors(repo, repo)).isEmpty()
    }
}
