package dev.fos.workbench.ontology

import org.springframework.core.io.ClassPathResource
import tools.jackson.databind.DeserializationFeature
import tools.jackson.dataformat.yaml.YAMLMapper
import tools.jackson.module.kotlin.kotlinModule
import tools.jackson.module.kotlin.readValue
import java.io.InputStream

object OntologyLoader {
    const val RESOURCE = "financial-ontology.yaml"
    private val HEX_COLOR = Regex("^#[0-9a-fA-F]{6}$")

    /** API 가 직접 쓰는 노드 속성 이름. 온톨로지가 이 이름을 정의하면 사용자가 시스템 값을 덮어쓸 수 있어 시작을 막는다. */
    val RESERVED_PROPERTIES = setOf(
        "id", "type", "revision", "archived", "archivedAt", "createdAt", "createdBy", "updatedAt", "updatedBy",
        "searchText", "reviewStatus", "reviewedBy", "reviewedAt", "reviewNote", "contentUpdatedBy",
    )

    /**
     * 알 수 없는 키는 시작을 막는다. YAML 흐름 표기에서 쉼표로 잘린 값(`{ description: 예 GICS, KSIC }` 의 `KSIC`)이나
     * 키 오타가 조용히 사라져 화면에 잘린 설명이 나가는 것을 시작 때 잡기 위해서다.
     */
    private val mapper = YAMLMapper.builder().addModule(kotlinModule()).enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build()

    /** 읽은 뒤 Claim predicate 선택지를 만들고 일관성을 검사한다. 오류가 있으면 첫 오류로 IllegalArgumentException 이다 */
    fun load(input: InputStream): Ontology {
        val o = withDerivedClaimPredicate(input.use { mapper.readValue<Ontology>(it) })
        val errors = consistencyErrors(o)
        require(errors.isEmpty()) { errors.first() }
        return o
    }

    fun parse(text: String): Ontology = load(text.byteInputStream())

    /** [parse] 로 다시 읽으면 같은 값이 나오는 YAML. 저장하는 버전의 yaml 이 이것이다 */
    fun toYaml(o: Ontology): String = mapper.writeValueAsString(o)

    /**
     * Claim 의 predicate 선택지는 claimPredicates 하나에서 만든다. 웹에서 주장 종류를 더하거나 빼거나 이름을 바꾸면
     * managedBy 가 claims 인 타입의 predicate enum 도 따라온다. values 는 claimPredicates 의 키, valueLabels 는 그 label 이다.
     * 파일에 적은 valueLabels 는 values 안에 있으면서 label 이 없는 키만 남는다(파생 값이 이긴다).
     */
    internal fun withDerivedClaimPredicate(o: Ontology): Ontology {
        val values = o.claimPredicates.keys.toList()
        val predicateLabels = o.claimPredicates.mapNotNull { (key, def) -> def.label?.let { key to it } }.toMap()
        return o.copy(
            nodeTypes = o.nodeTypes.mapValues { (_, type) ->
                val predicate = type.properties["predicate"]
                if (type.managedBy != "claims" || predicate == null || predicate.type != PropertyType.ENUM) {
                    type
                } else {
                    val fileLabels = predicate.valueLabels.orEmpty()
                    val labels = values.mapNotNull { key -> (predicateLabels[key] ?: fileLabels[key])?.let { key to it } }.toMap()
                    type.copy(properties = type.properties + ("predicate" to predicate.copy(values = values, valueLabels = labels.ifEmpty { null })))
                }
            },
        )
    }

    fun loadDefault(): Ontology = load(ClassPathResource(RESOURCE).inputStream)

    /** 정의 안에서 가리키는 이름과 표기 규칙을 검사해 오류 문장을 모두 돌려준다. 비면 일관되다. */
    fun consistencyErrors(o: Ontology): List<String> = buildList {
        val types = o.nodeTypes.keys
        val referenced = o.relationshipTypes.values.flatMap { it.from + it.to } +
            o.claimRelationships.values.flatMap { it.from + it.to } +
            o.claimPredicates.values.flatMap { it.subjectTypes + it.objectTypes }
        val unknown = referenced.filterNot { it in types }
        if (unknown.isNotEmpty()) add("온톨로지가 정의하지 않은 타입을 가리킨다: $unknown")
        o.nodeTypes.forEach { (name, def) ->
            if (def.labelProperty !in def.properties) add("$name 의 labelProperty 가 속성에 없다")
            val reserved = def.properties.keys.filter { it in RESERVED_PROPERTIES || it.startsWith("_") }
            if (reserved.isNotEmpty()) add("$name 이 시스템 속성 이름을 사용자 속성으로 정의한다: $reserved")
            val strayHints = def.hintProperties.filterNot { it in def.properties }
            if (strayHints.isNotEmpty()) add("$name 의 hintProperties 가 속성에 없는 이름을 가리킨다: $strayHints")
            val straySearch = def.searchProperties.filterNot { it in def.properties }
            if (straySearch.isNotEmpty()) add("$name 의 searchProperties 가 속성에 없는 이름을 가리킨다: $straySearch")
            def.display?.color?.let { if (!HEX_COLOR.matches(it)) add("$name 의 display.color 는 #rrggbb 형식이어야 한다: $it") }
            def.display?.shape?.let { if (it !in NodeDisplayDef.SHAPES) add("$name 의 display.shape 는 ${NodeDisplayDef.SHAPES} 가운데 하나여야 한다: $it") }
            def.properties.forEach { (prop, p) ->
                if (p.type == PropertyType.ENUM && p.values.isNullOrEmpty()) add("$name.$prop enum 에 values 가 없다")
                val stray = p.valueLabels.orEmpty().keys.filterNot { it in p.values.orEmpty() }
                if (stray.isNotEmpty()) add("$name.$prop 의 valueLabels 가 values 에 없는 값을 가리킨다: $stray")
                addAll(aliasErrors(name, prop, p))
            }
        }
        if (!Regex("[A-Za-z][A-Za-z0-9_]*").let { r -> (types + o.allRelationshipTypes).all { r.matches(it) } }) {
            add("타입과 관계 이름은 영문자, 숫자, 밑줄만 쓴다")
        }
    }

    /** 예전 값 정리가 한 표기를 두 값으로 고치거나 목록 값을 다른 값으로 바꾸지 않게, 별칭이 서로와 values 와 겹치지 않는지 본다. */
    private fun aliasErrors(name: String, prop: String, p: PropertyDef): List<String> = buildList {
        val aliases = p.valueAliases ?: return@buildList
        if (p.type != PropertyType.ENUM) add("$name.$prop 의 valueAliases 는 enum 이 아닌 속성에 둘 수 없다")
        val stray = aliases.keys.filterNot { it in p.values.orEmpty() }
        if (stray.isNotEmpty()) add("$name.$prop 의 valueAliases 가 values 에 없는 값을 가리킨다: $stray")
        val normalizedValues = p.values.orEmpty().map { it.trim().lowercase() }.toSet()
        val seen = mutableSetOf<String>()
        val clashes = aliases.values.flatten().filter { alias ->
            val key = alias.trim().lowercase()
            key in normalizedValues || !seen.add(key)
        }
        if (clashes.isNotEmpty()) add("$name.$prop 의 valueAliases 가 겹치거나 values 와 같은 표기를 가진다: $clashes")
    }
}
