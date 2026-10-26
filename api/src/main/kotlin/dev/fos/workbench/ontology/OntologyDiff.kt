package dev.fos.workbench.ontology

import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.kotlinModule

/** 최신 버전과 편집한 정의 사이에 더한 것, 뺀 것, 바뀐 것의 경로. 목록은 사전순이다 */
data class DiffResult(val added: List<String>, val removed: List<String>, val changed: List<String>) {
    fun isEmpty(): Boolean = added.isEmpty() && removed.isEmpty() && changed.isEmpty()
}

/**
 * 온톨로지 두 개를 비교한다. 비교 대상은 nodeTypes, relationshipTypes, claimPredicates 이고 코드가 소유하는 노드 타입(managedBy)은 비교하지 않는다.
 * 키(타입, 관계 종류, 주장 종류, 속성, enum 값)가 생기거나 빠지면 added, removed 에, 그 밖의 필드가 바뀌면 그 필드 경로를 changed 에 담는다.
 * 미리보기, 저장 이력의 changes 가 이 경로를 쓴다. docs/api-contract.md 의 `OntologyPreview`.
 */
object OntologyDiff {
    private val mapper = JsonMapper.builder().addModule(kotlinModule()).build()

    fun diff(latest: Ontology, edited: Ontology): DiffResult {
        val out = Collector()
        val codeOwned = (latest.nodeTypes + edited.nodeTypes).filterValues { it.managedBy != null }.keys
        keyed("nodeTypes", latest.nodeTypes - codeOwned, edited.nodeTypes - codeOwned, out) { path, a, b ->
            fields(path, tree(a), tree(b), setOf("properties"), out)
            keyed("$path.properties", a.properties, b.properties, out) { propPath, pa, pb ->
                fields(propPath, tree(pa), tree(pb), setOf("values"), out)
                enumValues("$propPath.values", pa.values, pb.values, out)
            }
        }
        keyed("relationshipTypes", latest.relationshipTypes, edited.relationshipTypes, out) { path, a, b ->
            fields(path, tree(a), tree(b), emptySet(), out)
        }
        keyed("claimPredicates", latest.claimPredicates, edited.claimPredicates, out) { path, a, b ->
            fields(path, tree(a), tree(b), emptySet(), out)
        }
        return DiffResult(out.added.sorted(), out.removed.sorted(), out.changed.sorted())
    }

    private class Collector {
        val added = mutableListOf<String>()
        val removed = mutableListOf<String>()
        val changed = mutableListOf<String>()
    }

    private fun <T> keyed(prefix: String, a: Map<String, T>, b: Map<String, T>, out: Collector, both: (String, T, T) -> Unit) {
        (a.keys + b.keys).forEach { key ->
            val before = a[key]
            val after = b[key]
            when {
                before == null -> out.added.add("$prefix.$key")
                after == null -> out.removed.add("$prefix.$key")
                else -> both("$prefix.$key", before, after)
            }
        }
    }

    /** 객체는 필드마다 내려가 비교하고, 값이나 목록이 다르면 그 경로를 바뀐 것으로 담는다. 없는 필드와 null 은 같다 */
    private fun fields(path: String, a: JsonNode?, b: JsonNode?, skip: Set<String>, out: Collector) {
        val before = a?.takeUnless { it.isNull || it.isMissingNode }
        val after = b?.takeUnless { it.isNull || it.isMissingNode }
        if (before != null && after != null && before.isObject && after.isObject) {
            (before.propertyNames().toSet() + after.propertyNames()).filterNot { it in skip }.forEach { name ->
                fields("$path.$name", before.get(name), after.get(name), emptySet(), out)
            }
        } else if (before != after) {
            out.changed.add(path)
        }
    }

    /** 값이 생기거나 빠지면 그 값의 경로, 같은 값의 순서만 바뀌면 values 경로다 */
    private fun enumValues(path: String, a: List<String>?, b: List<String>?, out: Collector) {
        val before = a.orEmpty()
        val after = b.orEmpty()
        (after - before.toSet()).forEach { out.added.add("$path.$it") }
        (before - after.toSet()).forEach { out.removed.add("$path.$it") }
        if (before.toSet() == after.toSet() && before != after) out.changed.add(path)
    }

    private fun tree(value: Any): JsonNode = mapper.valueToTree(value)
}
