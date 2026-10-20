package dev.fos.workbench.ontology

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.ClassPathResource
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

    private val mapper = YAMLMapper.builder().addModule(kotlinModule()).build()

    fun load(input: InputStream): Ontology = input.use { mapper.readValue<Ontology>(it) }.also(::checkConsistency)

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
            def.properties.forEach { (prop, p) ->
                require(p.type != PropertyType.ENUM || !p.values.isNullOrEmpty()) { "$name.$prop enum 에 values 가 없다" }
            }
        }
        require(Regex("[A-Za-z][A-Za-z0-9_]*").let { r -> (types + o.allRelationshipTypes).all { r.matches(it) } }) {
            "타입과 관계 이름은 영문자, 숫자, 밑줄만 쓴다"
        }
    }
}

@Configuration
class OntologyConfig {
    @Bean
    fun ontology(): Ontology = OntologyLoader.loadDefault()
}
