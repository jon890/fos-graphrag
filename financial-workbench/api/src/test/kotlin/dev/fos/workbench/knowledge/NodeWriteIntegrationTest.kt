package dev.fos.workbench.knowledge

import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class NodeWriteIntegrationTest : IntegrationTest() {

    @Test
    fun `노드를 만들고 고치면 revision 이 오르고 이력이 남는다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("가상전자")
        assertThat(company.revision).isEqualTo(1)
        assertThat(company["createdBy"]["email"].asString()).isEqualTo(ALICE)

        val updated = alice.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("country" to "US", "registrationNumber" to "110111-0000000")))
        assertThat(updated.status).isEqualTo(200)
        assertThat(updated.body.revision).isEqualTo(2)
        assertThat(updated.body["properties"]["country"].asString()).isEqualTo("US")

        val removed = alice.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 2, "properties" to mapOf("registrationNumber" to null)))
        assertThat(removed.body["properties"].has("registrationNumber")).isFalse()

        val history = alice.get("/api/changes?targetId=${company.id}")
        assertThat(history.body["totalItems"].asLong()).isEqualTo(3)
        val latest = history.body["items"][0]
        assertThat(latest["action"].asString()).isEqualTo("UPDATE")
        assertThat(latest["revision"].asLong()).isEqualTo(3)
        assertThat(latest["changes"]["registrationNumber"]["before"].asString()).isEqualTo("110111-0000000")
        assertThat(latest["actor"]["email"].asString()).isEqualTo(ALICE)
    }

    @Test
    fun `허용하지 않은 타입과 속성과 관계를 거절한다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)

        val unknownType = alice.post("/api/nodes", mapOf("type" to "BrokerageAccount", "properties" to mapOf("name" to "x")))
        assertThat(unknownType.status).isEqualTo(400)
        assertThat(unknownType.code).isEqualTo("ONTOLOGY_VIOLATION")

        // 레이블 자리에 Cypher 를 넣어도 허용 목록에서 막힌다
        val injection = alice.post("/api/nodes", mapOf("type" to "Company`) DETACH DELETE (x", "properties" to mapOf("name" to "x")))
        assertThat(injection.status).isEqualTo(400)

        val unknownProperty = alice.post("/api/nodes", mapOf("type" to "Company", "properties" to mapOf("name" to "x", "accountBalance" to 1)))
        assertThat(unknownProperty.status).isEqualTo(400)
        assertThat(unknownProperty.code).isEqualTo("ONTOLOGY_VIOLATION")

        val claimViaNodes = alice.post("/api/nodes", mapOf("type" to "Claim", "properties" to mapOf("predicate" to "SUPPLIES_TO")))
        assertThat(claimViaNodes.code).isEqualTo("ONTOLOGY_VIOLATION")

        val company = fx.company("가상전자")
        val sector = fx.sector("반도체")
        val badEndpoint = alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to sector.id))
        assertThat(badEndpoint.status).isEqualTo(400)
        assertThat(badEndpoint.body["details"]["rule"].asString()).isEqualTo("relationship-endpoint")

        val unknownRelationship = alice.post("/api/relationships", mapOf("type" to "SUPPLIES_TO", "fromId" to company.id, "toId" to company.id))
        assertThat(unknownRelationship.code).isEqualTo("ONTOLOGY_VIOLATION")

        val claimLink = alice.post("/api/relationships", mapOf("type" to "SUBJECT", "fromId" to company.id, "toId" to company.id))
        assertThat(claimLink.code).isEqualTo("ONTOLOGY_VIOLATION")
    }

    @Test
    fun `ISSUES 관계를 만들고 중복을 막고 보관과 복원을 기록한다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val company = fx.company("가상전자")
        val security = fx.security("가상전자 보통주")

        val created = alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id))
        assertThat(created.status).isEqualTo(201)
        assertThat(created.body["from"]["id"].asString()).isEqualTo(company.id)

        val duplicate = alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id))
        assertThat(duplicate.code).isEqualTo("DUPLICATE")

        val archived = alice.post("/api/relationships/${created.body.id}/archive", mapOf("expectedRevision" to 1, "reason" to "잘못 연결"))
        assertThat(archived.body["archived"].asBoolean()).isTrue()
        val restored = alice.post("/api/relationships/${created.body.id}/restore", mapOf("expectedRevision" to 2))
        assertThat(restored.body["archived"].asBoolean()).isFalse()

        val actions = alice.get("/api/changes?targetId=${created.body.id}").body["items"].toList().map { it["action"].asString() }
        assertThat(actions).containsExactly("RESTORE", "ARCHIVE", "CREATE")
    }

    @Test
    fun `관계 복원은 만들기와 같은 규칙으로 중복과 보관된 끝 노드를 거절한다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val company = fx.company("복원규칙")
        val security = fx.security("복원규칙 보통주")
        val first = alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id)).body
        alice.post("/api/relationships/${first.id}/archive", mapOf("expectedRevision" to 1))
        val second = alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id))
        assertThat(second.status).isEqualTo(201)

        assertThat(alice.post("/api/relationships/${first.id}/restore", mapOf("expectedRevision" to 2)).code).isEqualTo("DUPLICATE")

        alice.post("/api/relationships/${second.body.id}/archive", mapOf("expectedRevision" to 1))
        alice.post("/api/nodes/${security.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(alice.post("/api/relationships/${first.id}/restore", mapOf("expectedRevision" to 2)).code).isEqualTo("ARCHIVED")
    }

    @Test
    fun `같은 시장의 같은 종목 코드는 중복이다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val ticker = "D${fx.suffix}"
        fx.security("첫 상장", ticker)
        val response = alice.post("/api/nodes", mapOf("type" to "Security", "properties" to mapOf("market" to "KRX_KOSPI", "ticker" to ticker, "name" to "같은 코드")))
        assertThat(response.status).isEqualTo(409)
        assertThat(response.code).isEqualTo("DUPLICATE")
        // 시장이 다르면 같은 종목 코드도 허용한다
        val other = alice.post("/api/nodes", mapOf("type" to "Security", "properties" to mapOf("market" to "NASDAQ", "ticker" to ticker, "name" to "다른 시장")))
        assertThat(other.status).isEqualTo(201)
    }

    @Test
    fun `같은 revision 을 동시에 고치면 하나만 성공하고 나머지는 409 다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val company = Fixtures(alice).company("동시수정")

        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        val futures = listOf(alice to "US", bob to "JP").map { (client, country) ->
            pool.submit<Int> {
                start.await()
                client.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("country" to country))).status
            }
        }
        start.countDown()
        val statuses = futures.map { it.get(30, TimeUnit.SECONDS) }
        pool.shutdown()

        assertThat(statuses).containsExactlyInAnyOrder(200, 409)
        val current = alice.get("/api/nodes/${company.id}").body["node"]
        assertThat(current.revision).isEqualTo(2)
        assertThat(alice.get("/api/changes?targetId=${company.id}").body["totalItems"].asLong()).isEqualTo(2)
    }

    @Test
    fun `순차로 같은 revision 을 저장하면 두 번째가 409 와 현재 revision 을 받는다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val company = Fixtures(alice).company("순차수정")

        assertThat(alice.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("country" to "US"))).status).isEqualTo(200)
        val second = bob.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("country" to "JP")))
        assertThat(second.status).isEqualTo(409)
        assertThat(second.code).isEqualTo("REVISION_CONFLICT")
        assertThat(second.body["details"]["currentRevision"].asLong()).isEqualTo(2)
        assertThat(alice.get("/api/nodes/${company.id}").body["node"]["properties"]["country"].asString()).isEqualTo("US")
    }

    @Test
    fun `보관된 노드는 고칠 수 없고 복원은 새 이력을 남긴다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("보관대상")

        val archived = alice.post("/api/nodes/${company.id}/archive", mapOf("expectedRevision" to 1, "reason" to "중복 등록"))
        assertThat(archived.body["archived"].asBoolean()).isTrue()
        val edit = alice.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 2, "properties" to mapOf("country" to "US")))
        assertThat(edit.code).isEqualTo("ARCHIVED")

        val restored = alice.post("/api/nodes/${company.id}/restore", mapOf("expectedRevision" to 2))
        assertThat(restored.body["archived"].asBoolean()).isFalse()
        assertThat(restored.body.revision).isEqualTo(3)
        assertThat(alice.post("/api/nodes/${company.id}/restore", mapOf("expectedRevision" to 3)).code).isEqualTo("NOT_ARCHIVED")

        val items = alice.get("/api/changes?targetId=${company.id}").body["items"]
        assertThat(items.toList().map { it["action"].asString() }).containsExactly("RESTORE", "ARCHIVE", "CREATE")
        assertThat(items[1]["note"].asString()).isEqualTo("중복 등록")
    }

    @Test
    fun `없는 노드는 404 다`() {
        val alice = loggedIn(ALICE)
        val response = alice.patch("/api/nodes/00000000-0000-0000-0000-000000000000", mapOf("expectedRevision" to 1, "properties" to emptyMap<String, Any>()))
        assertThat(response.status).isEqualTo(404)
        assertThat(response.code).isEqualTo("NOT_FOUND")
    }
}
