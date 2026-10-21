package dev.fos.workbench.ontology

import dev.fos.workbench.web.OntologyViolationException
import dev.fos.workbench.web.ValidationFailedException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class OntologyValidatorTest {

    private val ontology = OntologyLoader.loadDefault()
    private val validator = OntologyValidator(ontology)

    @Test
    fun `정의된 속성은 정규화해 통과시킨다`() {
        val result = validator.validateCreate("Company", mapOf("name" to "  가상전자 ", "country" to "KR"))
        assertThat(result).containsEntry("name", "가상전자").containsEntry("country", "KR")

        val doc = validator.validateCreate(
            "Document",
            mapOf("title" to "보고서", "url" to "https://example.com/a", "collectedAt" to "2026-10-20T12:00:00+09:00", "publishedAt" to "2026-03-15"),
        )
        assertThat(doc["collectedAt"]).isEqualTo("2026-10-20T03:00:00Z")
    }

    @Test
    fun `없는 타입을 거절한다`() {
        assertThatThrownBy { validator.validateCreate("Account", mapOf("name" to "x")) }
            .isInstanceOf(OntologyViolationException::class.java)
            .hasMessageContaining("Account")
    }

    @Test
    fun `없는 속성을 거절한다`() {
        assertThatThrownBy { validator.validateCreate("Company", mapOf("name" to "x", "balance" to 1)) }
            .isInstanceOf(OntologyViolationException::class.java)
            .hasMessageContaining("balance")
        // 시스템 속성도 사용자가 보낼 수 없다
        assertThatThrownBy { validator.validatePatch("Company", mapOf("revision" to 9)) }
            .isInstanceOf(OntologyViolationException::class.java)
    }

    @Test
    fun `enum 과 필수와 날짜 형식을 검사한다`() {
        assertThatThrownBy {
            validator.validateCreate("Security", mapOf("market" to "MOON", "ticker" to "A1", "name" to "x"))
        }.isInstanceOfSatisfying(ValidationFailedException::class.java) {
            assertThat(fieldErrors(it)).containsKey("market")
        }
        assertThatThrownBy { validator.validateCreate("Company", mapOf("country" to "KR")) }
            .isInstanceOfSatisfying(ValidationFailedException::class.java) {
                assertThat(fieldErrors(it)).containsKey("name")
            }
        assertThatThrownBy {
            validator.validateCreate("Document", mapOf("title" to "t", "url" to "ftp://x", "collectedAt" to "어제"))
        }.isInstanceOfSatisfying(ValidationFailedException::class.java) {
            assertThat(fieldErrors(it)).containsKeys("url", "collectedAt")
        }
    }

    @Test
    fun `필수 속성은 지울 수 없고 선택 속성은 지운다`() {
        assertThat(validator.validatePatch("Company", mapOf("country" to null))).containsEntry("country", null)
        assertThatThrownBy { validator.validatePatch("Company", mapOf("name" to null)) }
            .isInstanceOf(ValidationFailedException::class.java)
    }

    @Test
    fun `온톨로지 파일이 스스로 일관되다`() {
        assertThat(ontology.schemaVersion).isEqualTo("1.2.0")
        assertThat(ontology.nodeTypes.keys).containsExactlyInAnyOrder("Company", "Security", "Sector", "Document", "Claim")
        assertThat(ontology.requirePredicate("SUPPLIES_TO").subjectTypes).containsExactly("Company")
        assertThatThrownBy { ontology.requireRelationshipType("OWNS_ACCOUNT") }.isInstanceOf(OntologyViolationException::class.java)
    }

    @Test
    fun `시스템 속성 이름을 정의한 온톨로지는 읽지 않는다`() {
        val yaml = """
            schemaVersion: "9"
            nodeTypes:
              Company:
                description: x
                labelProperty: name
                properties:
                  name: { type: string, required: true }
                  revision: { type: integer }
            relationshipTypes: {}
            claimRelationships: {}
            claimPredicates: {}
        """.trimIndent()
        assertThatThrownBy { OntologyLoader.load(yaml.byteInputStream()) }
            .isInstanceOf(IllegalArgumentException::class.java).hasMessageContaining("revision")
        val underscore = yaml.replace("revision: { type: integer }", "_lock: { type: boolean }")
        assertThatThrownBy { OntologyLoader.load(underscore.byteInputStream()) }.hasMessageContaining("_lock")
    }

    @Suppress("UNCHECKED_CAST")
    private fun fieldErrors(e: ValidationFailedException) = e.details["fieldErrors"] as Map<String, String>
}
