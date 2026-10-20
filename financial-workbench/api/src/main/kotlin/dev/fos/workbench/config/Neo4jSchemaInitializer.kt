package dev.fos.workbench.config

import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component

/** 제약 조건과 인덱스를 만든다. 목록은 docs/data-schema.md 의 「제약 조건과 인덱스」 절과 같다. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class Neo4jSchemaInitializer(private val client: Neo4jClient) : ApplicationRunner {

    override fun run(args: ApplicationArguments) {
        initialize()
    }

    fun initialize() {
        STATEMENTS.forEach { client.query(it).run() }
    }

    companion object {
        val STATEMENTS = listOf(
            "CREATE CONSTRAINT knowledge_id_unique IF NOT EXISTS FOR (n:Knowledge) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE",
            "CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE",
            "CREATE CONSTRAINT user_google_sub_unique IF NOT EXISTS FOR (u:User) REQUIRE u.googleSub IS UNIQUE",
            "CREATE CONSTRAINT security_listing_unique IF NOT EXISTS FOR (s:Security) REQUIRE (s.market, s.ticker) IS UNIQUE",
            "CREATE CONSTRAINT change_event_id_unique IF NOT EXISTS FOR (e:ChangeEvent) REQUIRE e.id IS UNIQUE",
            "CREATE INDEX change_event_target IF NOT EXISTS FOR (e:ChangeEvent) ON (e.targetId)",
            "CREATE INDEX change_event_at IF NOT EXISTS FOR (e:ChangeEvent) ON (e.at)",
            "CREATE INDEX knowledge_search_text IF NOT EXISTS FOR (n:Knowledge) ON (n.searchText)",
        )
    }
}
