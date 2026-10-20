package dev.fos.workbench.support

import org.assertj.core.api.Assertions.assertThat
import tools.jackson.databind.JsonNode
import java.util.UUID

/** 합성 금융 데이터를 API 로 만든다. 이름에 실행마다 다른 접미사를 붙여 테스트끼리 겹치지 않게 한다. */
class Fixtures(private val client: ApiClient) {
    val suffix: String = UUID.randomUUID().toString().take(8)

    fun node(type: String, properties: Map<String, Any?>): JsonNode {
        val response = client.post("/api/nodes", mapOf("type" to type, "properties" to properties))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return response.body
    }

    fun company(name: String) = node("Company", mapOf("name" to "$name-$suffix", "country" to "KR"))

    fun sector(name: String) = node("Sector", mapOf("name" to "$name-$suffix", "scheme" to "GICS"))

    fun security(name: String, ticker: String = "T$suffix") =
        node("Security", mapOf("market" to "KRX_KOSPI", "ticker" to ticker, "name" to "$name-$suffix", "securityType" to "COMMON"))

    fun document(title: String) = node(
        "Document",
        mapOf(
            "title" to "$title-$suffix", "url" to "https://example.com/$suffix", "publisher" to "가상공시",
            "documentType" to "FILING", "publishedAt" to "2026-03-15", "collectedAt" to "2026-10-20T03:00:00Z",
        ),
    )

    fun claim(predicate: String, subjectId: String, objectId: String, documentIds: List<String>): ApiClient.Response =
        client.post(
            "/api/claims",
            mapOf(
                "predicate" to predicate, "subjectId" to subjectId, "objectId" to objectId, "documentIds" to documentIds,
                "description" to "합성 주장 $suffix", "evidenceText" to "당사의 주요 매출처는 고객사이다.",
            ),
        )
}

val JsonNode.id: String get() = this["id"].asString()
val JsonNode.revision: Long get() = this["revision"].asLong()
