package dev.fos.workbench.ontology

import dev.fos.workbench.history.ChangeAction
import dev.fos.workbench.history.ChangeController
import dev.fos.workbench.knowledge.ReviewStatus
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

/** 화면에 보이는 이름은 온톨로지 YAML 이 소유한다. 이름이 빠지면 화면이 영문 키를 그대로 보이므로 여기서 막는다. */
class OntologyLabelsTest {

    private val ontology = OntologyLoader.loadDefault()

    @Test
    fun `타입, 속성, enum 값, 관계, predicate 에 표시 이름이 있다`() {
        val missing = buildList {
            ontology.nodeTypes.forEach { (type, def) ->
                if (def.label.isNullOrBlank()) add("nodeTypes.$type")
                def.properties.forEach { (prop, p) ->
                    if (p.label.isNullOrBlank()) add("$type.$prop")
                    p.values.orEmpty().filter { p.valueLabels?.get(it).isNullOrBlank() }.forEach { add("$type.$prop=$it") }
                }
            }
            ontology.relationshipTypes.filterValues { it.label.isNullOrBlank() }.keys.forEach { add("relationshipTypes.$it") }
            ontology.claimRelationships.filterValues { it.label.isNullOrBlank() }.keys.forEach { add("claimRelationships.$it") }
            ontology.claimPredicates.filterValues { it.label.isNullOrBlank() }.keys.forEach { add("claimPredicates.$it") }
        }
        assertThat(missing).describedAs("표시 이름이 없는 항목").isEmpty()
    }

    @Test
    fun `서버가 정한 검토 상태와 변경 작업에 표시 이름이 있다`() {
        assertThat(ontology.reviewStatuses.keys).containsExactlyInAnyOrderElementsOf(ReviewStatus.entries.map { it.name })
        assertThat(ontology.changeActions.keys).containsExactlyInAnyOrderElementsOf(ChangeAction.entries.map { it.name })
        assertThat(ontology.reviewStatuses["DRAFT"]?.label).isEqualTo("초안")
        assertThat(ontology.changeActions["ARCHIVE"]?.label).isEqualTo("보관")
        // 서버가 이력에 새 키를 남기면 YAML 의 changeFields 에 이름을 더해야 이 단언이 통과한다
        assertThat(ontology.changeFields.keys).containsExactlyInAnyOrderElementsOf(ChangeController.CHANGE_FIELD_KEYS)
        assertThat(ontology.changeFields.filterValues { it.label.isBlank() }.keys).describedAs("표시 이름이 빈 changeFields").isEmpty()
    }

    @Test
    fun `저장되는 값은 표시 이름과 상관없이 그대로다`() {
        val market = ontology.nodeTypes.getValue("Security").properties.getValue("market")
        assertThat(market.values).containsExactly("KRX_KOSPI", "KRX_KOSDAQ", "NASDAQ", "NYSE", "OTHER")
        assertThat(market.valueLabels).containsEntry("KRX_KOSPI", "코스피").containsEntry("KRX_KOSDAQ", "코스닥")
        assertThat(ontology.claimPredicates.keys).containsExactly("BELONGS_TO_SECTOR", "ADVOCATES", "CRITICIZES")
        val country = ontology.nodeTypes.getValue("Company").properties.getValue("country")
        assertThat(country.type).isEqualTo(PropertyType.ENUM)
        assertThat(country.values).containsExactly("KR", "US", "JP", "CN", "TW", "HK", "NL", "DE", "GB", "FR", "OTHER")
        assertThat(country.valueLabels).containsEntry("KR", "대한민국 (KR)")
        val currency = ontology.nodeTypes.getValue("Security").properties.getValue("currency")
        assertThat(currency.type).isEqualTo(PropertyType.ENUM)
        assertThat(currency.valueAliases?.get("KRW")).contains("원")
    }

    @Test
    fun `목록 밖 값은 공백, 대소문자, 별칭으로 목록 값에 맞춘다`() {
        val currency = ontology.nodeTypes.getValue("Security").properties.getValue("currency")
        assertThat(currency.canonicalEnumValue(" 원 ")).isEqualTo("KRW")
        assertThat(currency.canonicalEnumValue("usd")).isEqualTo("USD")
        assertThat(currency.canonicalEnumValue("   ")).isNull()
        assertThat(currency.canonicalEnumValue("KRW")).isEqualTo("KRW")
        assertThat(currency.canonicalEnumValue("루피")).isEqualTo("루피")
    }

    @Test
    fun `별칭과 구분 정보가 잘못되면 읽지 않는다`() {
        val invalid = mapOf(
            "키가 values 밖" to minimal("{ type: enum, values: [A], valueAliases: { B: [b] } }"),
            "두 값에 같은 별칭" to minimal("{ type: enum, values: [A, B], valueAliases: { A: [x], B: [\" X \"] } }"),
            "별칭이 값과 같음" to minimal("{ type: enum, values: [A], valueAliases: { A: [\" a \"] } }"),
        )
        invalid.forEach { (case, yaml) ->
            assertThatThrownBy { OntologyLoader.load(yaml.byteInputStream()) }
                .describedAs(case).isInstanceOf(IllegalArgumentException::class.java)
        }
        assertThatThrownBy { OntologyLoader.load(minimal("{ type: string, valueAliases: { A: [a] } }").byteInputStream()) }
            .isInstanceOf(IllegalArgumentException::class.java).hasMessageContaining("enum 이 아닌")
        val strayHint = minimal("{ type: string }").replace("    labelProperty: name\n", "    labelProperty: name\n    hintProperties: [nope]\n")
        assertThat(strayHint).contains("hintProperties: [nope]")
        assertThatThrownBy { OntologyLoader.load(strayHint.byteInputStream()) }
            .isInstanceOf(IllegalArgumentException::class.java).hasMessageContaining("nope")
    }

    @Test
    fun `발행 관계는 종목 만들기 폼에 발행 기업 칸을 둔다`() {
        assertThat(ontology.relationshipTypes.getValue("ISSUES").createPicker?.label).isEqualTo("발행 기업")
    }

    @Test
    fun `투자 논리 관계는 시작과 끝, 만들기 칸을 정한다`() {
        val expected = mapOf(
            "CREATES" to Triple(listOf("Change"), listOf("Bottleneck"), "이 병목을 만든 변화"),
            "HAS_BOTTLENECK" to Triple(listOf("Sector"), listOf("Bottleneck"), "병목이 있는 산업"),
            "BENEFITS" to Triple(listOf("Bottleneck"), listOf("Company"), "이익을 가져가는 병목"),
            "HAS_VALUATION" to Triple(listOf("Company"), listOf("Valuation"), "평가한 기업"),
            "HAS_SCENARIO" to Triple(listOf("Valuation"), listOf("Scenario"), "시나리오가 속한 밸류에이션"),
            "HAS_DECISION" to Triple(listOf("Security"), listOf("Decision"), "결정한 종목"),
            "BASED_ON" to Triple(listOf("Valuation"), listOf("Decision"), "결정에 쓴 밸류에이션"),
            "EVIDENCED_BY" to Triple(listOf("Change", "Bottleneck", "Valuation"), listOf("Document"), "이 자료가 근거인 항목"),
        )

        expected.forEach { (type, values) ->
            val relationship = ontology.relationshipTypes.getValue(type)
            assertThat(relationship.from).isEqualTo(values.first)
            assertThat(relationship.to).isEqualTo(values.second)
            assertThat(relationship.createPicker?.label).isEqualTo(values.third)
        }
    }

    @Test
    fun `Claim predicate 선택지 이름은 claimPredicates 의 label 에서 온다`() {
        val predicate = ontology.nodeTypes.getValue("Claim").properties.getValue("predicate")
        assertThat(predicate.valueLabels).isEqualTo(ontology.claimPredicates.mapValues { it.value.label })
        assertThat(predicate.valueLabels).containsEntry("BELONGS_TO_SECTOR", "속한다")
    }

    @Test
    fun `모든 predicate 에 주체와 대상 자리가 한 번씩 있는 문장 틀이 있다`() {
        val invalid = ontology.claimPredicates.filterValues { def ->
            val sentence = def.sentence.orEmpty()
            sentence.split("{subject}").size != 2 || sentence.split("{object}").size != 2
        }.keys
        assertThat(invalid).describedAs("문장 틀이 없거나 자리가 어긋난 predicate").isEmpty()
        assertThat(ontology.claimPredicates.getValue("BELONGS_TO_SECTOR").sentence).isEqualTo("{subject}이(가) {object}에 속한다")
    }

    @Test
    fun `Sector scheme 설명이 쉼표에서 잘리지 않는다`() {
        val scheme = ontology.nodeTypes.getValue("Sector").properties.getValue("scheme")
        assertThat(scheme.description).isEqualTo("산업을 나눈 기준의 이름. 예: GICS, KSIC")
    }

    @Test
    fun `YAML 흐름 표기에서 쉼표로 잘린 값은 시작할 때 잡는다`() {
        // `예 GICS, KSIC` 의 KSIC 는 값 없는 키가 되어 조용히 사라지던 문제다.
        assertThatThrownBy { OntologyLoader.load(minimal("{ type: string, description: 분류 체계 이름(예 GICS, KSIC) }").byteInputStream()) }
            .hasMessageContaining("KSIC")
        // 따옴표로 감싸면 통과한다.
        val ok = OntologyLoader.load(minimal("{ type: string, description: \"분류 체계 이름(예 GICS, KSIC)\" }").byteInputStream())
        assertThat(ok.nodeTypes.getValue("Company").properties.getValue("name").description).isEqualTo("분류 체계 이름(예 GICS, KSIC)")
    }

    @Test
    fun `valueLabels 가 values 에 없는 값을 가리키면 읽지 않는다`() {
        val yaml = minimal("{ type: enum, values: [A, B], valueLabels: { A: 가, C: 다 } }")
        assertThatThrownBy { OntologyLoader.load(yaml.byteInputStream()) }
            .isInstanceOf(IllegalArgumentException::class.java).hasMessageContaining("C")
    }

    @Test
    fun `표시 이름이 없어도 읽는다`() {
        val o = OntologyLoader.load(minimal("{ type: string }").byteInputStream())
        assertThat(o.nodeTypes.getValue("Company").label).isNull()
        assertThat(o.reviewStatuses).isEmpty()
    }

    @Test
    fun `모든 노드 타입에 색과 모양이 있다`() {
        assertThat(ontology.nodeTypes.keys).hasSize(12)
        val missing = ontology.nodeTypes.filterValues { it.display?.color.isNullOrBlank() || it.display?.shape.isNullOrBlank() }.keys
        assertThat(missing).describedAs("색이나 모양이 없는 노드 타입").isEmpty()
    }

    @Test
    fun `색과 모양, 검색 속성이 잘못되면 읽지 않는다`() {
        listOf("display: { color: red }", "display: { shape: star }", "searchProperties: [nope]").forEach { extra ->
            val yaml = minimal("{ type: string }").replace("    labelProperty: name\n", "    labelProperty: name\n    $extra\n")
            assertThatThrownBy { OntologyLoader.load(yaml.byteInputStream()) }
                .describedAs(extra).isInstanceOf(IllegalArgumentException::class.java)
        }
    }

    @Test
    fun `YAML 로 쓰고 다시 읽으면 같다`() {
        assertThat(OntologyLoader.parse(OntologyLoader.toYaml(OntologyLoader.loadDefault()))).isEqualTo(OntologyLoader.loadDefault())
    }

    @Test
    fun `주장 종류를 더하면 Claim 의 predicate 선택지도 생긴다`() {
        val added = ontology.copy(
            claimPredicates = ontology.claimPredicates +
                ("TEST_PREDICATE" to ClaimPredicateDef(label = "테스트 관계", description = "x", subjectTypes = listOf("Company"), objectTypes = listOf("Company"))),
        )
        val predicate = OntologyLoader.parse(OntologyLoader.toYaml(added)).nodeTypes.getValue("Claim").properties.getValue("predicate")
        assertThat(predicate.values).contains("TEST_PREDICATE")
        assertThat(predicate.valueLabels).containsEntry("TEST_PREDICATE", "테스트 관계")
    }

    @Test
    fun `주장 종류를 빼도 읽힌다`() {
        val edited = ontology.copy(claimPredicates = ontology.claimPredicates - "ADVOCATES")
        val merged = CodeOwned.merge(edited, OntologyLoader.loadDefault())
        assertThat(OntologyLoader.consistencyErrors(merged)).isEmpty()
        val predicate = merged.nodeTypes.getValue("Claim").properties.getValue("predicate")
        assertThat(predicate.values).doesNotContain("ADVOCATES").contains("CRITICIZES")
        assertThat(predicate.valueLabels).doesNotContainKey("ADVOCATES")
    }

    @Test
    fun `주장 종류 이름을 바꾸면 Claim 선택지 이름도 바뀐다`() {
        val belongsToSector = ontology.claimPredicates.getValue("BELONGS_TO_SECTOR")
        val edited = ontology.copy(claimPredicates = ontology.claimPredicates + ("BELONGS_TO_SECTOR" to belongsToSector.copy(label = "분류된다")))
        val merged = CodeOwned.merge(edited, OntologyLoader.loadDefault())
        assertThat(merged.nodeTypes.getValue("Claim").properties.getValue("predicate").valueLabels).containsEntry("BELONGS_TO_SECTOR", "분류된다")
    }

    @Test
    fun `오류를 모두 모은다`() {
        val company = ontology.nodeTypes.getValue("Company")
        val broken = ontology.copy(
            nodeTypes = ontology.nodeTypes + ("Company" to company.copy(hintProperties = listOf("nope"), searchProperties = listOf("nope2"))),
        )
        val errors = OntologyLoader.consistencyErrors(broken)
        assertThat(errors).hasSize(2)
        assertThat(errors[0]).contains("hintProperties").contains("nope")
        assertThat(errors[1]).contains("searchProperties").contains("nope2")
    }

    @Test
    fun `관계 문장 틀에 자리가 빠지면 오류이고 문장 틀이 없는 관계는 통과한다`() {
        val issues = ontology.relationshipTypes.getValue("ISSUES")
        val broken = ontology.copy(
            relationshipTypes = ontology.relationshipTypes +
                ("ISSUES" to issues.copy(sentence = "{from}이(가) 발행한다")) +
                ("HAS_DECISION" to ontology.relationshipTypes.getValue("HAS_DECISION").copy(sentence = null)),
        )

        assertThat(OntologyLoader.consistencyErrors(broken)).containsExactly("ISSUES 의 sentence 는 {from} 과 {to} 를 한 번씩 담아야 한다")
        val twice = ontology.copy(relationshipTypes = ontology.relationshipTypes + ("ISSUES" to issues.copy(sentence = "{from} {to} {to}")))
        assertThat(OntologyLoader.consistencyErrors(twice)).containsExactly("ISSUES 의 sentence 는 {from} 과 {to} 를 한 번씩 담아야 한다")
        val ok = ontology.copy(relationshipTypes = ontology.relationshipTypes + ("ISSUES" to issues.copy(sentence = "{from}이(가) {to}을(를) 발행한다")))
        assertThat(OntologyLoader.consistencyErrors(ok)).isEmpty()
    }

    @Test
    fun `저장소 온톨로지의 모든 관계 종류는 문장 틀이 있다`() {
        val missing = ontology.relationshipTypes.filterValues { it.sentence.isNullOrBlank() }.keys
        assertThat(missing).describedAs("문장 틀이 없는 관계 종류").isEmpty()
        assertThat(OntologyLoader.consistencyErrors(ontology)).isEmpty()
    }

    @Test
    fun `관계 문장 틀이 없으면 YAML 에 sentence 키를 쓰지 않는다`() {
        val withoutSentence = ontology.copy(relationshipTypes = ontology.relationshipTypes.mapValues { it.value.copy(sentence = null) })
        assertThat(OntologyLoader.toYaml(withoutSentence)).doesNotContain("sentence: null")

        val issues = ontology.relationshipTypes.getValue("ISSUES").copy(sentence = "{from}이(가) {to}을(를) 발행한다")
        val withSentence = withoutSentence.copy(relationshipTypes = withoutSentence.relationshipTypes + ("ISSUES" to issues))
        val yaml = OntologyLoader.toYaml(withSentence)
        assertThat(yaml).doesNotContain("sentence: null")
        assertThat(OntologyLoader.parse(yaml).relationshipTypes.getValue("ISSUES").sentence).isEqualTo("{from}이(가) {to}을(를) 발행한다")
    }

    @Test
    fun `알 수 없는 키는 줄 번호와 함께 알린다`() {
        // 다섯째 줄에 Company 타입의 알 수 없는 키를 둔다
        val yaml = minimal("{ type: string }").replace("    description: x\n", "    description: x\n    oddKey: 1\n")
        assertThat(yaml.lines()[4]).isEqualTo("    oddKey: 1")

        val read = OntologyLoader.readEdited(yaml, OntologyLoader.loadDefault())

        assertThat(read).isInstanceOf(EditRead.Invalid::class.java)
        val errors = (read as EditRead.Invalid).errors
        assertThat(errors).hasSize(1)
        assertThat(errors.single()).contains("oddKey").contains("줄 5").doesNotContain("dev.fos")
        assertThat(read.ontology).isNull()
    }

    private fun minimal(nameProperty: String) = """
        schemaVersion: "9"
        nodeTypes:
          Company:
            description: x
            labelProperty: name
            properties:
              name: $nameProperty
        relationshipTypes: {}
        claimRelationships: {}
        claimPredicates: {}
    """.trimIndent()
}
