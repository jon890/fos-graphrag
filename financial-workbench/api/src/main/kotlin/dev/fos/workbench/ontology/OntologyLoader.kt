package dev.fos.workbench.ontology

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.ClassPathResource
import tools.jackson.databind.DeserializationFeature
import tools.jackson.dataformat.yaml.YAMLMapper
import tools.jackson.module.kotlin.kotlinModule
import tools.jackson.module.kotlin.readValue
import java.io.InputStream

object OntologyLoader {
    const val RESOURCE = "financial-ontology.yaml"

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

    fun load(input: InputStream): Ontology = input.use { mapper.readValue<Ontology>(it) }.let(::withDerivedLabels).also(::checkConsistency)

    /**
     * Claim 의 predicate 선택지 이름은 claimPredicates 의 label 하나에서 온다. 두 곳에 적어 어긋나지 않게,
     * managedBy 가 claims 인 타입의 predicate enum 에 valueLabels 를 채워 웹이 enum 이름을 한 방식으로만 읽게 한다.
     * 파일에 valueLabels 를 직접 적었으면 그 값이 이긴다.
     */
    private fun withDerivedLabels(o: Ontology): Ontology {
        val predicateLabels = o.claimPredicates.mapNotNull { (key, def) -> def.label?.let { key to it } }.toMap()
        if (predicateLabels.isEmpty()) return o
        return o.copy(
            nodeTypes = o.nodeTypes.mapValues { (_, type) ->
                val predicate = type.properties["predicate"]
                if (type.managedBy != "claims" || predicate == null || predicate.type != PropertyType.ENUM) type
                else type.copy(properties = type.properties + ("predicate" to predicate.copy(valueLabels = predicateLabels + (predicate.valueLabels ?: emptyMap()))))
            },
        )
    }

    fun loadDefault(): Ontology = load(ClassPathResource(RESOURCE).inputStream)

    /** 정의 안에서 가리키는 타입 이름이 모두 노드 타입에 있는지 시작할 때 확인한다. */
    private fun checkConsistency(o: Ontology) {
        val types = o.nodeTypes.keys
        val referenced = o.relationshipTypes.values.flatMap { it.from + it.to } +
            o.claimRelationships.values.flatMap { it.from + it.to } +
            o.claimPredicates.values.flatMap { it.subjectTypes + it.objectTypes }
        val unknown = referenced.filterNot { it in types }
        require(unknown.isEmpty()) { "온톨로지가 정의하지 않은 타입을 가리킨다: $unknown" }
        o.nodeTypes.forEach { (name, def) ->
            require(def.labelProperty in def.properties) { "$name 의 labelProperty 가 속성에 없다" }
            val reserved = def.properties.keys.filter { it in RESERVED_PROPERTIES || it.startsWith("_") }
            require(reserved.isEmpty()) { "$name 이 시스템 속성 이름을 사용자 속성으로 정의한다: $reserved" }
            val strayHints = def.hintProperties.filterNot { it in def.properties }
            require(strayHints.isEmpty()) { "$name 의 hintProperties 가 속성에 없는 이름을 가리킨다: $strayHints" }
            def.properties.forEach { (prop, p) ->
                require(p.type != PropertyType.ENUM || !p.values.isNullOrEmpty()) { "$name.$prop enum 에 values 가 없다" }
                val stray = p.valueLabels.orEmpty().keys.filterNot { it in p.values.orEmpty() }
                require(stray.isEmpty()) { "$name.$prop 의 valueLabels 가 values 에 없는 값을 가리킨다: $stray" }
                checkAliases(name, prop, p)
            }
        }
        require(Regex("[A-Za-z][A-Za-z0-9_]*").let { r -> (types + o.allRelationshipTypes).all { r.matches(it) } }) {
            "타입과 관계 이름은 영문자, 숫자, 밑줄만 쓴다"
        }
    }

    /** 예전 값 정리가 한 표기를 두 값으로 고치거나 목록 값을 다른 값으로 바꾸지 않게, 별칭이 서로와 values 와 겹치지 않는지 본다. */
    private fun checkAliases(name: String, prop: String, p: PropertyDef) {
        val aliases = p.valueAliases ?: return
        require(p.type == PropertyType.ENUM) { "$name.$prop 의 valueAliases 는 enum 이 아닌 속성에 둘 수 없다" }
        val stray = aliases.keys.filterNot { it in p.values.orEmpty() }
        require(stray.isEmpty()) { "$name.$prop 의 valueAliases 가 values 에 없는 값을 가리킨다: $stray" }
        val normalizedValues = p.values.orEmpty().map { it.trim().lowercase() }.toSet()
        val seen = mutableSetOf<String>()
        val clashes = aliases.values.flatten().filter { alias ->
            val key = alias.trim().lowercase()
            key in normalizedValues || !seen.add(key)
        }
        require(clashes.isEmpty()) { "$name.$prop 의 valueAliases 가 겹치거나 values 와 같은 표기를 가진다: $clashes" }
    }
}

@Configuration
class OntologyConfig {
    @Bean
    fun ontology(): Ontology = OntologyLoader.loadDefault()
}
