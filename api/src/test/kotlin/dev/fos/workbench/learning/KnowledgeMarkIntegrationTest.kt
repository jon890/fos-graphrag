package dev.fos.workbench.learning

import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.race
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode

class KnowledgeMarkIntegrationTest : IntegrationTest() {

    private fun mark(id: String) = "/api/me/knowledge/$id"

    private fun put(client: ApiClient, id: String, level: String, note: String? = null) =
        client.send("PUT", mark(id), mapOf("level" to level, "note" to note))

    private fun knowsCount(nodeId: String): Long =
        neo4j.query("MATCH (:User)-[k:KNOWS]->(:Knowledge {id: \$id}) RETURN count(k) AS n").bind(nodeId).to("id")
            .fetch().one().get()["n"] as Long

    private fun itemIds(response: ApiClient.Response): List<String> {
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        return response.body["items"].toList().map { it["node"]["id"].asString() }
    }

    private fun item(response: ApiClient.Response, nodeId: String): JsonNode =
        response.body["items"].firstOrNull { it["node"]["id"].asString() == nodeId }
            ?: throw AssertionError("목록에 $nodeId 가 없다: ${response.body}")

    private fun link(client: ApiClient, type: String, fromId: String, toId: String): JsonNode {
        val response = client.post("/api/relationships", mapOf("type" to type, "fromId" to fromId, "toId" to toId))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return response.body
    }

    @Test
    fun `열람자가 표시를 쓰고 읽어도 항목의 revision 과 이력은 그대로다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("이해표시")
        val historyBefore = alice.get("/api/changes?targetId=${company.id}").body["totalItems"].asLong()

        val viewer = loggedIn(VIEWER)
        val written = put(viewer, company.id, "UNSURE", "  메모  ")
        assertThat(written.status).describedAs(written.body.toString()).isEqualTo(200)
        assertThat(written.body["nodeId"].asString()).isEqualTo(company.id)
        assertThat(written.body["level"].asString()).isEqualTo("UNSURE")
        assertThat(written.body["note"].asString()).isEqualTo("메모")
        assertThat(written.body["updatedAt"].isNull).isFalse()

        val read = viewer.get(mark(company.id))
        assertThat(read.status).isEqualTo(200)
        assertThat(read.body["level"].asString()).isEqualTo("UNSURE")
        assertThat(read.body["note"].asString()).isEqualTo("메모")
        assertThat(read.body["updatedAt"].asString()).isEqualTo(written.body["updatedAt"].asString())

        val detail = viewer.get("/api/nodes/${company.id}")
        assertThat(detail.body["node"].revision).isEqualTo(company.revision)
        assertThat(alice.get("/api/changes?targetId=${company.id}").body["totalItems"].asLong()).isEqualTo(historyBefore)
    }

    @Test
    fun `다른 사람의 표시는 내 표시와 목록과 노드 상세에 나오지 않는다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("남의표시")
        val viewer = loggedIn(VIEWER)
        assertThat(put(viewer, company.id, "KNOWN", "열람자 메모").status).isEqualTo(200)

        val mine = alice.get(mark(company.id))
        assertThat(mine.status).isEqualTo(200)
        assertThat(mine.body["nodeId"].asString()).isEqualTo(company.id)
        assertThat(mine.body.has("level")).isTrue()
        assertThat(mine.body["level"].isNull).describedAs(mine.body.toString()).isTrue()
        assertThat(mine.body["note"].isNull).isTrue()
        assertThat(mine.body["updatedAt"].isNull).isTrue()

        assertThat(itemIds(alice.get("/api/me/knowledge?size=100"))).doesNotContain(company.id)

        val detail = alice.get("/api/nodes/${company.id}")
        assertThat(detail.body["relationships"].toList().map { it["type"].asString() }).doesNotContain("KNOWS")
    }

    @Test
    fun `두 사람이 같은 항목에 쓰면 각자 자기 값을 받고 한 사람이 지워도 다른 사람의 표시는 남는다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val company = Fixtures(alice).company("쓰기격리")

        assertThat(put(alice, company.id, "KNOWN").status).isEqualTo(200)
        assertThat(put(bob, company.id, "UNSURE").status).isEqualTo(200)
        assertThat(alice.get(mark(company.id)).body["level"].asString()).isEqualTo("KNOWN")
        assertThat(bob.get(mark(company.id)).body["level"].asString()).isEqualTo("UNSURE")
        assertThat(knowsCount(company.id)).isEqualTo(2)

        assertThat(alice.send("DELETE", mark(company.id), null).status).isEqualTo(204)
        assertThat(knowsCount(company.id)).isEqualTo(1)
        assertThat(alice.get(mark(company.id)).body["level"].isNull).isTrue()
        assertThat(bob.get(mark(company.id)).body["level"].asString()).isEqualTo("UNSURE")
    }

    @Test
    fun `잘못된 값과 없는 노드와 CSRF 없는 쓰기를 거절한다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("거절")

        val wrongLevel = put(alice, company.id, "WRONG")
        assertThat(wrongLevel.status).isEqualTo(400)
        assertThat(wrongLevel.code).isEqualTo("VALIDATION_FAILED")
        assertThat(wrongLevel.body["details"]["fieldErrors"].has("level")).isTrue()

        val noLevel = alice.send("PUT", mark(company.id), mapOf("note" to "메모"))
        assertThat(noLevel.status).isEqualTo(400)
        assertThat(noLevel.body["details"]["fieldErrors"].has("level")).isTrue()

        // 경계: 1000자는 받고 1001자는 거절한다
        assertThat(put(alice, company.id, "LEARNING", "가".repeat(1000)).status).isEqualTo(200)
        val longNote = put(alice, company.id, "LEARNING", "가".repeat(1001))
        assertThat(longNote.status).isEqualTo(400)
        assertThat(longNote.code).isEqualTo("VALIDATION_FAILED")
        assertThat(longNote.body["details"]["fieldErrors"].has("note")).isTrue()

        val missing = "00000000-0000-0000-0000-000000000000"
        assertThat(put(alice, missing, "KNOWN").status).isEqualTo(404)
        assertThat(alice.get(mark(missing)).status).isEqualTo(404)
        assertThat(alice.send("DELETE", mark(missing), null).status).isEqualTo(404)

        val noCsrf = alice.send("PUT", mark(company.id), mapOf("level" to "KNOWN"), withCsrf = false)
        assertThat(noCsrf.status).isEqualTo(403)
        assertThat(noCsrf.code).isEqualTo("CSRF_REJECTED")
        assertThat(alice.get(mark(company.id)).body["level"].asString()).isEqualTo("LEARNING")
    }

    @Test
    fun `메모를 비우면 지우고 지우기는 표시가 없어도 204 다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("지우기")

        assertThat(put(alice, company.id, "LEARNING", "처음 메모").status).isEqualTo(200)
        val cleared = put(alice, company.id, "LEARNING", "   ")
        assertThat(cleared.status).isEqualTo(200)
        assertThat(cleared.body["note"].isNull).describedAs(cleared.body.toString()).isTrue()

        assertThat(alice.send("DELETE", mark(company.id), null).status).isEqualTo(204)
        assertThat(alice.send("DELETE", mark(company.id), null).status).isEqualTo(204)
        assertThat(alice.get(mark(company.id)).body["level"].isNull).isTrue()
    }

    @Test
    fun `보관한 항목에도 쓰고 목록에는 보관됨으로 맥락 없이 나온다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val company = fx.company("보관표시")
        val security = fx.security("보관표시 보통주")
        val decision = fx.node("Decision", mapOf("title" to "보관표시 결정-${fx.suffix}", "action" to "WATCH"))
        link(alice, "ISSUES", company.id, security.id)
        link(alice, "HAS_DECISION", security.id, decision.id)
        val archived = alice.post("/api/nodes/${company.id}/archive", mapOf("expectedRevision" to company.revision))
        assertThat(archived.status).describedAs(archived.body.toString()).isEqualTo(200)

        assertThat(put(alice, company.id, "UNSURE").status).isEqualTo(200)
        val entry = item(alice.get("/api/me/knowledge?size=100"), company.id)
        assertThat(entry["node"]["archived"].asBoolean()).isTrue()
        assertThat(entry["contexts"].size()).isEqualTo(0)
    }

    @Test
    fun `공부 목록은 따라가는 관계로 닿는 결정과 근거 문서를 붙인다`() {
        val bob = loggedIn(BOB)
        val fx = Fixtures(bob)
        val change = fx.node("Change", mapOf("title" to "변화-${fx.suffix}", "category" to "TECHNOLOGY"))
        val bottleneck = fx.node("Bottleneck", mapOf("title" to "병목-${fx.suffix}", "status" to "HYPOTHESIS"))
        val company = fx.company("공부기업")
        val security = fx.security("공부기업 보통주")
        val decision = fx.node("Decision", mapOf("title" to "결정-${fx.suffix}", "action" to "BUY"))
        val document = fx.document("병목 근거")
        link(bob, "CREATES", change.id, bottleneck.id)
        link(bob, "BENEFITS", bottleneck.id, company.id)
        link(bob, "ISSUES", company.id, security.id)
        link(bob, "HAS_DECISION", security.id, decision.id)
        link(bob, "EVIDENCED_BY", bottleneck.id, document.id)

        assertThat(put(bob, change.id, "UNSURE").status).isEqualTo(200)
        assertThat(put(bob, bottleneck.id, "LEARNING").status).isEqualTo(200)
        assertThat(put(bob, company.id, "KNOWN").status).isEqualTo(200)

        val list = bob.get("/api/me/knowledge?level=UNSURE,LEARNING&size=100")
        assertThat(itemIds(list)).contains(change.id, bottleneck.id).doesNotContain(company.id)
        val changeItem = item(list, change.id)
        assertThat(changeItem["level"].asString()).isEqualTo("UNSURE")
        assertThat(changeItem["contexts"][0]["decision"]["id"].asString()).isEqualTo(decision.id)
        assertThat(changeItem["contexts"][0]["depth"].asInt()).isEqualTo(4)
        val bottleneckItem = item(list, bottleneck.id)
        assertThat(bottleneckItem["documents"].toList().map { it["id"].asString() }).containsExactly(document.id)
        // 근거 관계는 따라가지 않는다. 문서는 결정에 닿는 길이 아니라 붙는 근거다
        assertThat(bottleneckItem["contexts"][0]["depth"].asInt()).isEqualTo(3)

        val wrong = bob.get("/api/me/knowledge?level=WRONG")
        assertThat(wrong.status).isEqualTo(400)
        assertThat(wrong.code).isEqualTo("VALIDATION_FAILED")
        assertThat(wrong.body["details"]["fieldErrors"].has("level")).isTrue()
    }

    @Test
    fun `같은 사람이 동시에 두 번 써도 관계는 하나다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("동시표시")
        val second = loggedIn(ALICE)
        val userId = users.findByEmail(ALICE)!!.id

        val responses = race({ put(alice, company.id, "KNOWN") }, { put(second, company.id, "UNSURE") })
        assertThat(responses.map { it.status }).describedAs(responses.map { it.body.toString() }.toString()).containsOnly(200)

        val count = neo4j.query("MATCH (:User {id: \$userId})-[k:KNOWS]->(:Knowledge {id: \$id}) RETURN count(k) AS n")
            .bindAll(mapOf("userId" to userId, "id" to company.id)).fetch().one().get()["n"] as Long
        assertThat(count).isEqualTo(1)
        assertThat(alice.get(mark(company.id)).body["level"].asString()).isIn("KNOWN", "UNSURE")
    }

    @Test
    fun `주변 그래프는 사용자를 거쳐 이어지지 않는다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val first = fx.company("그래프1")
        val second = fx.company("그래프2")
        val bob = loggedIn(BOB)
        assertThat(put(bob, first.id, "KNOWN").status).isEqualTo(200)
        assertThat(put(bob, second.id, "UNSURE").status).isEqualTo(200)

        val graph = bob.get("/api/graph/neighborhood?id=${first.id}&hops=2")
        assertThat(graph.status).describedAs(graph.body.toString()).isEqualTo(200)
        assertThat(graph.body["nodes"].toList().map { it["id"].asString() }).doesNotContain(second.id)
    }
}
