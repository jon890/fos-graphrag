package dev.fos.workbench.agent.v1

import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.ontology.PropertyType
import org.springframework.stereotype.Component

/** 지금 온톨로지의 표시 이름으로 v1 표현을 만든다. 표시 이름이 없으면 키를 그대로 쓴다 */
@Component
class V1Mapper(private val holder: OntologyHolder) {

    fun typeLabel(type: String): String = holder.current().nodeTypes[type]?.label ?: type

    fun ref(id: String, type: String, label: String): V1NodeRef = V1NodeRef(id, type, typeLabel(type), label)

    /** 화면용 값(색, 모양, 만들기 폼 정보, 예전 값 별칭)은 담지 않는다. 순서는 정의 순서다. 버전과 정의는 같은 스냅샷에서 읽는다 */
    fun ontology(): V1Ontology {
        val snapshot = holder.snapshot()
        val o = snapshot.ontology
        return V1Ontology(
            version = snapshot.version,
            nodeTypes = o.nodeTypes.map { (key, def) ->
                V1NodeType(
                    key = key,
                    label = def.label ?: key,
                    description = def.description,
                    labelProperty = def.labelProperty,
                    properties = def.properties.map { (propertyKey, p) ->
                        V1PropertyDef(
                            key = propertyKey,
                            label = p.label ?: propertyKey,
                            type = p.type.yaml,
                            required = p.required,
                            description = p.description,
                            values = if (p.type == PropertyType.ENUM) {
                                p.values.orEmpty().map { V1EnumValue(it, p.valueLabels?.get(it) ?: it) }
                            } else {
                                null
                            },
                        )
                    },
                )
            },
            relationshipTypes = o.relationshipTypes.map { (key, def) ->
                V1RelationshipType(key, def.label ?: key, def.description, def.from, def.to, def.sentence)
            },
            claimPredicates = o.claimPredicates.map { (key, def) ->
                V1ClaimPredicate(key, def.label ?: key, def.description, def.subjectTypes, def.objectTypes, def.sentence)
            },
        )
    }

    /** 관계 문장 틀의 `{from}`, `{to}` 를 두 끝의 이름으로 바꾼다. 조사는 고르지 않는다. 틀이 없으면 `from -[표시 이름]-> to` 다 */
    fun sentence(type: String, fromLabel: String, toLabel: String): String {
        val def = holder.current().relationshipTypes[type]
        val template = def?.sentence ?: return "$fromLabel -[${def?.label ?: type}]-> $toLabel"
        return template.replace("{from}", fromLabel).replace("{to}", toLabel)
    }
}
