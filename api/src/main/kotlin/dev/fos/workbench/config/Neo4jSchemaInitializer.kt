package dev.fos.workbench.config

import dev.fos.workbench.auth.BootstrapAdmin
import dev.fos.workbench.knowledge.LegacyValueCleanup
import dev.fos.workbench.knowledge.SeedLoader
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.ontology.OntologyLoader
import dev.fos.workbench.ontology.OntologyVersionStore
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component

/**
 * 시작 순서는 이렇다. 제약 조건과 인덱스(목록은 docs/data-schema.md 의 「제약 조건과 인덱스」 절과 같다),
 * 온톨로지 버전 준비(`OntologyVersionStore.bootstrap`, 「온톨로지 버전」 의 「시작할 때」), 최신 버전의 관계 타입마다 id 인덱스,
 * 목록 밖 enum 값 고치기(`LegacyValueCleanup`), 초기 데이터 적용(`SeedLoader`), 첫 관리자(`BootstrapAdmin`).
 * 모든 싱글톤이 만들어진 직후, 웹 서버가 요청을 받기 전에 돈다. 실패하면 애플리케이션이 시작하지 않는다.
 * 여러 번 돌아도 결과가 같다.
 */
@Component
class Neo4jSchemaInitializer(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    private val versions: OntologyVersionStore,
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
        versions.bootstrap(OntologyLoader.loadDefault())
        ensureRelationshipIndexes(holder.current().allRelationshipTypes)
    }

    /** 관계 타입마다 id 인덱스를 만든다. 타입은 온톨로지 로더가 이름 형식을 검사한 값이다. 온톨로지를 저장한 뒤에도 부른다 */
    fun ensureRelationshipIndexes(types: Collection<String>) {
        types.sorted().forEach { type ->
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
            "CREATE CONSTRAINT ontology_version_unique IF NOT EXISTS FOR (v:OntologyVersion) REQUIRE v.version IS UNIQUE",
            "CREATE CONSTRAINT ontology_head_key_unique IF NOT EXISTS FOR (h:OntologyHead) REQUIRE h.key IS UNIQUE",
            "CREATE CONSTRAINT integration_token_id_unique IF NOT EXISTS FOR (t:IntegrationToken) REQUIRE t.id IS UNIQUE",
            "CREATE CONSTRAINT integration_token_hash_unique IF NOT EXISTS FOR (t:IntegrationToken) REQUIRE t.hash IS UNIQUE",
            "CREATE CONSTRAINT oauth_client_id_unique IF NOT EXISTS FOR (c:OAuthClient) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT oauth_code_hash_unique IF NOT EXISTS FOR (c:OAuthCode) REQUIRE c.hash IS UNIQUE",
            "CREATE CONSTRAINT oauth_grant_id_unique IF NOT EXISTS FOR (g:OAuthGrant) REQUIRE g.id IS UNIQUE",
            "CREATE CONSTRAINT oauth_grant_access_hash_unique IF NOT EXISTS FOR (g:OAuthGrant) REQUIRE g.accessHash IS UNIQUE",
            "CREATE CONSTRAINT oauth_grant_refresh_hash_unique IF NOT EXISTS FOR (g:OAuthGrant) REQUIRE g.refreshHash IS UNIQUE",
            "CREATE CONSTRAINT trade_id_unique IF NOT EXISTS FOR (t:Trade) REQUIRE t.id IS UNIQUE",
            "CREATE CONSTRAINT trade_owner_external_unique IF NOT EXISTS FOR (t:Trade) REQUIRE (t.ownerId, t.broker, t.externalId) IS UNIQUE",
            "CREATE CONSTRAINT proposal_id_unique IF NOT EXISTS FOR (p:Proposal) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT proposal_owner_dedupe_unique IF NOT EXISTS FOR (p:Proposal) REQUIRE (p.ownerId, p.dedupeKey) IS UNIQUE",
            "CREATE CONSTRAINT seed_run_key_unique IF NOT EXISTS FOR (s:SeedRun) REQUIRE s.key IS UNIQUE",
            "CREATE INDEX change_event_target IF NOT EXISTS FOR (e:ChangeEvent) ON (e.targetId)",
            "CREATE INDEX change_event_at IF NOT EXISTS FOR (e:ChangeEvent) ON (e.at)",
            "CREATE INDEX trade_owner_executed IF NOT EXISTS FOR (t:Trade) ON (t.ownerId, t.executedAt)",
            "CREATE INDEX oauth_grant_previous_refresh IF NOT EXISTS FOR (g:OAuthGrant) ON (g.previousRefreshHash)",
            "CREATE INDEX proposal_owner_status IF NOT EXISTS FOR (p:Proposal) ON (p.ownerId, p.status)",
            "CREATE TEXT INDEX $SEARCH_INDEX IF NOT EXISTS FOR (n:Knowledge) ON (n.searchText)",
        )
    }
}
