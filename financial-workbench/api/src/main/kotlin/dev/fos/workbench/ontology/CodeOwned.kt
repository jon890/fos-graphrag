package dev.fos.workbench.ontology

/**
 * 온톨로지 가운데 서버 코드가 소유해 저장소 YAML 의 값만 쓰는 부분. docs/data-schema.md 의 「온톨로지 버전」.
 * reviewStatuses, changeActions, changeFields, claimRelationships 와 managedBy 가 있는 노드 타입(Claim)이다.
 */
object CodeOwned {

    /** 코드가 소유하는 부분을 저장소 값으로 바꾸고 Claim predicate 선택지를 다시 만든다. 편집할 수 있는 부분은 그대로다 */
    fun merge(edited: Ontology, repo: Ontology): Ontology {
        val managed = repo.nodeTypes.filterValues { it.managedBy != null }
        val nodeTypes = edited.nodeTypes.mapValues { (name, def) ->
            managed[name] ?: if (def.managedBy != null && name in repo.nodeTypes) def.copy(managedBy = null) else def
        } + managed.filterKeys { it !in edited.nodeTypes }
        val merged = edited.copy(
            nodeTypes = nodeTypes,
            reviewStatuses = repo.reviewStatuses,
            changeActions = repo.changeActions,
            changeFields = repo.changeFields,
            claimRelationships = repo.claimRelationships,
        )
        return OntologyLoader.withDerivedClaimPredicate(merged)
    }

    /**
     * 코드가 소유하는 부분 가운데 [edited] 가 [merged]([merge] 결과)와 다른 경로. 한 단계 아래 키까지다(`reviewStatuses.DRAFT`, `nodeTypes.Claim`).
     * 파생 전 저장소 값이 아니라 merge 결과와 비교한다. 주장 종류를 더하면 Claim 의 선택지도 바뀌기 때문이다.
     */
    fun ignoredPaths(edited: Ontology, merged: Ontology): List<String> = buildList {
        fun <T> compare(section: String, a: Map<String, T>, b: Map<String, T>) {
            (a.keys + b.keys).forEach { key -> if (a[key] != b[key]) add("$section.$key") }
        }
        compare("reviewStatuses", edited.reviewStatuses, merged.reviewStatuses)
        compare("changeActions", edited.changeActions, merged.changeActions)
        compare("changeFields", edited.changeFields, merged.changeFields)
        compare("claimRelationships", edited.claimRelationships, merged.claimRelationships)
        val codeOwnedTypes = merged.nodeTypes.filterValues { it.managedBy != null }.keys +
            edited.nodeTypes.filter { (name, def) -> merged.nodeTypes[name]?.managedBy != def.managedBy }.keys
        codeOwnedTypes.forEach { name -> if (edited.nodeTypes[name] != merged.nodeTypes[name]) add("nodeTypes.$name") }
    }

    /** 웹의 검색 화면이 managedBy 로 Claim 타입을 고르므로, 저장소에 없는 노드 타입에는 managedBy 를 둘 수 없다 */
    fun errors(edited: Ontology, repo: Ontology): List<String> =
        edited.nodeTypes.filter { (name, def) -> def.managedBy != null && name !in repo.nodeTypes }.keys
            .map { "저장소에 없는 타입 $it 에는 managedBy 를 둘 수 없습니다" }
}

object CodeReadKeys {
    /**
     * 서버 코드가 이름으로 읽는 타입과 속성. `KnowledgeReader.document`, `NodeService.requireUniqueListing`,
     * `NodeService.searchText`, 제약 `security_listing_unique` 가 이 이름을 읽는다.
     */
    val PROPERTIES: Map<String, Set<String>> = mapOf(
        "Document" to setOf("title", "url", "publisher", "documentType", "publishedAt", "collectedAt"),
        "Security" to setOf("market", "ticker"),
    )

    /** 위 타입이나 속성이 빠졌거나, 속성의 type 이나 required 가 저장소 값과 다르면 오류 문장을 돌려준다 */
    fun violations(edited: Ontology, repo: Ontology): List<String> = buildList {
        PROPERTIES.forEach { (type, props) ->
            val def = edited.nodeTypes[type]
            if (def == null) {
                add("$type 은 서버 코드가 읽는 타입이라 뺄 수 없습니다")
                return@forEach
            }
            props.sorted().forEach { prop ->
                val e = def.properties[prop]
                val r = repo.nodeTypes[type]?.properties?.get(prop)
                if (e == null || r == null || e.type != r.type || e.required != r.required) {
                    add("$type.$prop 은 서버 코드가 읽는 속성이라 빼거나 타입과 필수 여부를 바꿀 수 없습니다")
                }
            }
        }
    }
}
