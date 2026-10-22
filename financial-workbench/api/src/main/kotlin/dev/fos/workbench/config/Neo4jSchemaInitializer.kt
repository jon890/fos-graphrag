package dev.fos.workbench.config

import dev.fos.workbench.auth.BootstrapAdmin
import dev.fos.workbench.knowledge.LegacyValueCleanup
import dev.fos.workbench.knowledge.SeedLoader
import dev.fos.workbench.ontology.Ontology
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component

/**
 * 제약 조건과 인덱스를 만든다. 목록은 docs/data-schema.md 의 「제약 조건과 인덱스」 절과 같다.
 * 그다음 목록 밖 enum 값을 고치고(`LegacyValueCleanup`), 초기 데이터를 적용한다(`SeedLoader`).
 * 모든 싱글톤이 만들어진 직후, 웹 서버가 요청을 받기 전에 돈다. 실패하면 애플리케이션이 시작하지 않는다.
 * 여러 번 돌아도 결과가 같다.
 */
@Component
class Neo4jSchemaInitializer(
    private val client: Neo4jClient,
    private val ontology: Ontology,
    private val legacyValueCleanup: LegacyValueCleanup,
    private val seedLoader: SeedLoader,
    private val bootstrapAdmin: ObjectProvider<BootstrapAdmin>,
) : SmartInitializingSingleton {

    override fun afterSingletonsInstantiated() {
        initialize()
        legacyValueCleanup.run()
        seedLoader.run()
        bootstrapAdmin.ifAvailable { it.ensureAdmin() }
    }

    fun initialize() {
        replaceRangeSearchIndex()
        STATEMENTS.forEach { client.query(it).run() }
        // 관계 타입은 온톨로지 로더가 이름 형식을 검사한 값이다
        ontology.allRelationshipTypes.sorted().forEach { type ->
            client.query("CREATE INDEX ${relationshipIndexName(type)} IF NOT EXISTS FOR ()-[r:`$type`]-() ON (r.id)").run()
        }
    }

    /** 첫 버전은 searchText 에 RANGE 인덱스를 만들었다. CONTAINS 에 쓸 수 있는 TEXT 인덱스로 바꾼다. */
    private fun replaceRangeSearchIndex() {
        val type = client.query("SHOW INDEXES YIELD name, type WHERE name = \$name RETURN type")
            .bind(SEARCH_INDEX).to("name").fetch().one().map { it["type"] as String }.orElse(null)
        if (type != null && type != "TEXT") client.query("DROP INDEX $SEARCH_INDEX IF EXISTS").run()
    }

    companion object {
        const val SEARCH_INDEX = "knowledge_search_text"

        fun relationshipIndexName(type: String) = "rel_${type.lowercase()}_id"

        val STATEMENTS = listOf(
            "CREATE CONSTRAINT knowledge_id_unique IF NOT EXISTS FOR (n:Knowledge) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE",
            "CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE",
            "CREATE CONSTRAINT user_google_sub_unique IF NOT EXISTS FOR (u:User) REQUIRE u.googleSub IS UNIQUE",
            "CREATE CONSTRAINT security_listing_unique IF NOT EXISTS FOR (s:Security) REQUIRE (s.market, s.ticker) IS UNIQUE",
            "CREATE CONSTRAINT change_event_id_unique IF NOT EXISTS FOR (e:ChangeEvent) REQUIRE e.id IS UNIQUE",
            "CREATE CONSTRAINT seed_run_key_unique IF NOT EXISTS FOR (s:SeedRun) REQUIRE s.key IS UNIQUE",
            "CREATE INDEX change_event_target IF NOT EXISTS FOR (e:ChangeEvent) ON (e.targetId)",
            "CREATE INDEX change_event_at IF NOT EXISTS FOR (e:ChangeEvent) ON (e.at)",
            "CREATE TEXT INDEX $SEARCH_INDEX IF NOT EXISTS FOR (n:Knowledge) ON (n.searchText)",
        )
    }
}
