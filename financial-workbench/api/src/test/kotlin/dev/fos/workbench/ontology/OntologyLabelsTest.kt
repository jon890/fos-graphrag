package dev.fos.workbench.ontology

import dev.fos.workbench.history.ChangeAction
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
    }

    @Test
    fun `저장되는 값은 표시 이름과 상관없이 그대로다`() {
        val market = ontology.nodeTypes.getValue("Security").properties.getValue("market")
        assertThat(market.values).containsExactly("KRX_KOSPI", "KRX_KOSDAQ", "NASDAQ", "NYSE", "OTHER")
        assertThat(market.valueLabels).containsEntry("KRX_KOSPI", "코스피").containsEntry("KRX_KOSDAQ", "코스닥")
        assertThat(ontology.claimPredicates.keys).containsExactly("SUPPLIES_TO", "BELONGS_TO_SECTOR", "COMPETES_WITH", "HAS_EXPOSURE_TO")
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
    fun `Claim predicate 선택지 이름은 claimPredicates 의 label 에서 온다`() {
        val predicate = ontology.nodeTypes.getValue("Claim").properties.getValue("predicate")
        assertThat(predicate.valueLabels).isEqualTo(ontology.claimPredicates.mapValues { it.value.label })
        assertThat(predicate.valueLabels).containsEntry("SUPPLIES_TO", "공급한다")
    }

    @Test
    fun `모든 predicate 에 주체와 대상 자리가 한 번씩 있는 문장 틀이 있다`() {
        val invalid = ontology.claimPredicates.filterValues { def ->
            val sentence = def.sentence.orEmpty()
            sentence.split("{subject}").size != 2 || sentence.split("{object}").size != 2
        }.keys
        assertThat(invalid).describedAs("문장 틀이 없거나 자리가 어긋난 predicate").isEmpty()
        assertThat(ontology.claimPredicates.getValue("SUPPLIES_TO").sentence).isEqualTo("{subject}이(가) {object}에 공급한다")
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
