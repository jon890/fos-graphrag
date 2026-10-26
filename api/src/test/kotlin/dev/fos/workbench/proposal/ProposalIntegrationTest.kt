package dev.fos.workbench.proposal

import dev.fos.workbench.auth.Role
import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.race
import dev.fos.workbench.trade.TradeService
import dev.fos.workbench.web.ApiException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

class ProposalIntegrationTest : IntegrationTest() {

    @Autowired lateinit var proposals: ProposalService
    @Autowired lateinit var trades: TradeService

    private val path = "/api/me/proposals"

    private fun userId(email: String): String = users.findByEmail(email)!!.id

    private fun unique() = UUID.randomUUID().toString().take(8)

    /** 주인의 체결 하나를 저장하고 id 를 돌려준다 */
    private fun trade(ownerId: String): String = trades.save(
        ownerId,
        listOf(
            mapOf(
                "broker" to "TOSS", "externalId" to "p-${unique()}", "side" to "BUY", "market" to "KR", "ticker" to "P${unique()}",
                "quantity" to 1, "price" to 1000.0, "currency" to "KRW", "amount" to 1000.0, "executedAt" to "2026-10-24T10:00:00+09:00",
            ),
        ),
        null,
    ).single().trade.id

    private fun item(kind: String, payload: Any?, dedupeKey: String? = null, evidence: Map<String, Any?>? = null): Map<String, Any?> =
        buildMap {
            put("kind", kind)
            put("payload", payload)
            put("rationale", "합성 근거 문장")
            dedupeKey?.let { put("dedupeKey", it) }
            evidence?.let { put("evidence", it) }
        }

    private fun submitOne(ownerId: String, item: Map<String, Any?>): StoredProposal =
        proposals.submit(ownerId, "tok-1", "Hermes", listOf(item)).single().proposal

    private fun failure(block: () -> Any?): ApiException {
        val error = runCatching(block).exceptionOrNull()
        assertThat(error).describedAs("ApiException 이 나야 한다").isInstanceOf(ApiException::class.java)
        return error as ApiException
    }

    @Suppress("UNCHECKED_CAST")
    private fun fieldErrors(e: ApiException): Map<String, String> = e.details["fieldErrors"] as Map<String, String>

    private fun accept(client: ApiClient, id: String, payload: Any? = null): ApiClient.Response =
        client.post("$path/$id/accept", payload?.let { mapOf("payload" to it) })

    /** 목록에서 그 제안을 다시 읽는다. 사용자마다 새로 만들어 제안이 몇 개 없다 */
    private fun read(client: ApiClient, id: String): JsonNode {
        val response = client.get("$path?size=100")
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        return response.body["items"].toList().single { it["id"].asString() == id }
    }

    private fun decision(fixtures: Fixtures, title: String = "결정-${fixtures.suffix}"): JsonNode =
        fixtures.node("Decision", mapOf("title" to title, "action" to "BUY"))

    private fun count(cypher: String, vararg params: Pair<String, Any>): Long =
        neo4j.query(cypher).bindAll(mapOf(*params)).fetch().one().get()["n"] as Long

    @Test
    fun `승인하면 기존 서비스로 노드와 관계를 만들고 승인한 사람이 이력에 남는다`() {
        val fixtures = Fixtures(loggedIn(ALICE))
        val ownerEmail = newUser(Role.EDITOR)
        val owner = loggedIn(ownerEmail)
        val ownerId = userId(ownerEmail)
        val security = fixtures.security("제안 종목")
        val tradeId = trade(ownerId)
        val title = "제안 결정-${fixtures.suffix}"
        val proposal = submitOne(
            ownerId,
            item(
                "CREATE_NODE",
                mapOf(
                    "type" to "Decision", "properties" to mapOf("title" to title, "action" to "BUY"),
                    "links" to listOf(mapOf("type" to "HAS_DECISION", "fromId" to security.id)), "tradeIds" to listOf(tradeId),
                ),
                evidence = mapOf("nodeIds" to listOf(security.id), "tradeIds" to listOf(tradeId), "urls" to listOf("https://example.com/n")),
            ),
        )
        assertThat(proposal.status).isEqualTo("PENDING")

        val pendingView = read(owner, proposal.id)
        assertThat(pendingView["requiresEditor"].asBoolean()).isTrue()
        assertThat(pendingView["requiredRole"].asString()).isEqualTo("EDITOR")
        assertThat(pendingView["token"]["name"].asString()).isEqualTo("Hermes")
        assertThat(pendingView["refs"]["nodes"][security.id]["type"].asString()).isEqualTo("Security")
        assertThat(pendingView["refs"]["trades"][tradeId]["id"].asString()).isEqualTo(tradeId)
        assertThat(pendingView["result"].isNull).isTrue()

        val accepted = accept(owner, proposal.id)
        assertThat(accepted.status).describedAs(accepted.body.toString()).isEqualTo(200)
        assertThat(accepted.body["status"].asString()).isEqualTo("ACCEPTED")
        assertThat(accepted.body["decidedAt"].isNull).isFalse()
        val nodeId = accepted.body["result"]["nodeIds"][0].asString()
        assertThat(accepted.body["result"]["relationshipIds"].size()).isEqualTo(1)
        assertThat(accepted.body["refs"]["nodes"][nodeId]["label"].asString()).isEqualTo(title)

        val node = owner.get("/api/nodes/$nodeId")
        assertThat(node.status).describedAs(node.body.toString()).isEqualTo(200)
        val history = owner.get("/api/changes?targetId=$nodeId").body["items"].toList()
        assertThat(history.map { it["action"].asString() }).containsExactly("CREATE")
        assertThat(history.single()["actor"]["email"].asString()).isEqualTo(ownerEmail)
        assertThat(history.single()["note"].asString()).isEqualTo("에이전트 제안을 승인했다")
        val relationshipTypes = owner.get("/api/nodes/${security.id}").body["relationships"].toList().map { it["type"].asString() }
        assertThat(relationshipTypes).contains("HAS_DECISION")
        val linked = owner.get("/api/me/trades?decisionId=$nodeId").body["items"].toList().map { it["id"].asString() }
        assertThat(linked).containsExactly(tradeId)
    }

    @Test
    fun `고쳐서 승인하면 고친 내용으로 만들고 제안의 payload 도 고친 값이다`() {
        val ownerEmail = newUser(Role.EDITOR)
        val owner = loggedIn(ownerEmail)
        val ownerId = userId(ownerEmail)
        val suffix = unique()
        val proposal = submitOne(
            ownerId, item("CREATE_NODE", mapOf("type" to "Decision", "properties" to mapOf("title" to "원래-$suffix", "action" to "BUY"))),
        )

        val edited = mapOf("type" to "Decision", "properties" to mapOf("title" to "고침-$suffix", "action" to "ADD"))
        val accepted = accept(owner, proposal.id, edited)

        assertThat(accepted.status).describedAs(accepted.body.toString()).isEqualTo(200)
        val nodeId = accepted.body["result"]["nodeIds"][0].asString()
        assertThat(owner.get("/api/nodes/$nodeId").body["node"]["properties"]["title"].asString()).isEqualTo("고침-$suffix")
        val reread = read(owner, proposal.id)
        assertThat(reread["payload"]["properties"]["title"].asString()).isEqualTo("고침-$suffix")
        assertThat(reread["payload"]["properties"]["action"].asString()).isEqualTo("ADD")
    }

    @Test
    fun `열람자는 공유 지식 제안을 승인하지 못하고 개인 기록 제안은 승인한다`() {
        val fixtures = Fixtures(loggedIn(ALICE))
        val viewerEmail = newUser(Role.VIEWER)
        val viewer = loggedIn(viewerEmail)
        val viewerId = userId(viewerEmail)
        val company = fixtures.company("열람자 기업")
        val security = fixtures.security("열람자 종목")
        val decision = decision(fixtures)
        val tradeId = trade(viewerId)

        val relationship = submitOne(viewerId, item("CREATE_RELATIONSHIP", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id)))
        val forbidden = accept(viewer, relationship.id)
        assertThat(forbidden.status).describedAs(forbidden.body.toString()).isEqualTo(403)
        assertThat(forbidden.code).isEqualTo("FORBIDDEN")
        val afterForbidden = read(viewer, relationship.id)
        assertThat(afterForbidden["status"].asString()).isEqualTo("PENDING")
        assertThat(afterForbidden["lastError"].isNull).describedAs("권한 오류는 기록하지 않는다").isTrue()
        assertThat(afterForbidden["requiresEditor"].asBoolean()).isTrue()
        val relationshipTypes = viewer.get("/api/nodes/${company.id}").body["relationships"].toList().map { it["type"].asString() }
        assertThat(relationshipTypes).doesNotContain("ISSUES")

        val note = submitOne(viewerId, item("STUDY_NOTE", mapOf("nodeId" to security.id, "level" to "LEARNING", "note" to "공부 중")))
        val noteAccepted = accept(viewer, note.id)
        assertThat(noteAccepted.status).describedAs(noteAccepted.body.toString()).isEqualTo(200)
        assertThat(noteAccepted.body["requiresEditor"].asBoolean()).isFalse()
        assertThat(noteAccepted.body["requiredRole"].asString()).isEqualTo("VIEWER")
        assertThat(noteAccepted.body["result"]["nodeIds"].toList().map { it.asString() }).containsExactly(security.id)
        val mark = viewer.get("/api/me/knowledge/${security.id}").body
        assertThat(mark["level"].asString()).isEqualTo("LEARNING")
        assertThat(mark["note"].asString()).isEqualTo("공부 중")

        val link = submitOne(viewerId, item("LINK_TRADE_DECISION", mapOf("tradeIds" to listOf(tradeId), "decisionId" to decision.id)))
        val linkAccepted = accept(viewer, link.id)
        assertThat(linkAccepted.status).describedAs(linkAccepted.body.toString()).isEqualTo(200)
        val linked = viewer.get("/api/me/trades?decisionId=${decision.id}").body["items"].toList().map { it["id"].asString() }
        assertThat(linked).containsExactly(tradeId)
    }

    @Test
    fun `실행이 실패하면 아무것도 바꾸지 않고 대기로 남아 마지막 오류를 기록한다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val ownerEmail = newUser(Role.EDITOR)
        val owner = loggedIn(ownerEmail)
        val ownerId = userId(ownerEmail)
        val decision = decision(fixtures)
        val tradeId = trade(ownerId)
        val link = submitOne(ownerId, item("LINK_TRADE_DECISION", mapOf("tradeIds" to listOf(tradeId), "decisionId" to decision.id)))
        val archived = alice.post("/api/nodes/${decision.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(archived.status).describedAs(archived.body.toString()).isEqualTo(200)

        val failed = accept(owner, link.id)

        assertThat(failed.status).describedAs(failed.body.toString()).isEqualTo(409)
        assertThat(failed.code).isEqualTo("ARCHIVED")
        val reread = read(owner, link.id)
        assertThat(reread["status"].asString()).isEqualTo("PENDING")
        assertThat(reread["lastError"]["code"].asString()).isEqualTo("ARCHIVED")
        assertThat(reread["lastError"]["at"].isNull).isFalse()
        assertThat(owner.get("/api/me/trades?decisionId=${decision.id}").body["items"].size()).isZero()

        val ticker = "D${fixtures.suffix}".uppercase()
        val name = "겹친 종목-${fixtures.suffix}"
        val duplicate = submitOne(
            ownerId,
            item(
                "CREATE_NODE",
                mapOf("type" to "Security", "properties" to mapOf("market" to "KRX_KOSPI", "ticker" to ticker, "name" to name, "securityType" to "COMMON")),
            ),
        )
        fixtures.security("먼저 만든 종목", ticker)

        val conflict = accept(owner, duplicate.id)

        assertThat(conflict.status).describedAs(conflict.body.toString()).isEqualTo(409)
        assertThat(conflict.code).isEqualTo("DUPLICATE")
        assertThat(read(owner, duplicate.id)["lastError"]["code"].asString()).isEqualTo("DUPLICATE")
        assertThat(count("MATCH (n:Knowledge:Security {name: \$name}) RETURN count(n) AS n", "name" to name)).isZero()
        assertThat(count("MATCH (e:ChangeEvent {targetLabel: \$name}) RETURN count(e) AS n", "name" to name)).isZero()
    }

    @Test
    fun `이미 결정한 제안은 다시 승인하거나 거절하지 못하고 동시 승인은 한 번만 실행된다`() {
        val ownerEmail = newUser(Role.EDITOR)
        val owner = loggedIn(ownerEmail)
        val ownerId = userId(ownerEmail)
        val suffix = unique()
        val once = submitOne(ownerId, item("CREATE_NODE", mapOf("type" to "Decision", "properties" to mapOf("title" to "한번-$suffix", "action" to "BUY"))))
        assertThat(accept(owner, once.id).status).isEqualTo(200)

        listOf(accept(owner, once.id), owner.post("$path/${once.id}/reject", mapOf("reason" to "늦은 거절"))).forEach { again ->
            assertThat(again.status).describedAs(again.body.toString()).isEqualTo(409)
            assertThat(again.code).isEqualTo("PROPOSAL_NOT_PENDING")
            assertThat(again.body["details"]["status"].asString()).isEqualTo("ACCEPTED")
        }

        val raced = submitOne(ownerId, item("CREATE_NODE", mapOf("type" to "Decision", "properties" to mapOf("title" to "경합-$suffix", "action" to "BUY"))))
        val results = race({ accept(owner, raced.id) }, { accept(owner, raced.id) })

        assertThat(results.map { it.status }).describedAs(results.map { it.body.toString() }.toString()).containsExactlyInAnyOrder(200, 409)
        assertThat(count("MATCH (n:Knowledge:Decision {title: \$title}) RETURN count(n) AS n", "title" to "경합-$suffix")).isEqualTo(1)
    }

    @Test
    fun `거절하면 이유를 남기고 이유가 길면 거절하지 않는다`() {
        val ownerEmail = newUser(Role.VIEWER)
        val owner = loggedIn(ownerEmail)
        val ownerId = userId(ownerEmail)
        val nodeId = Fixtures(loggedIn(ALICE)).company("거절 기업").id
        val proposal = submitOne(ownerId, item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "KNOWN")))

        val tooLong = owner.post("$path/${proposal.id}/reject", mapOf("reason" to "가".repeat(1001)))
        assertThat(tooLong.status).describedAs(tooLong.body.toString()).isEqualTo(400)
        assertThat(tooLong.code).isEqualTo("VALIDATION_FAILED")
        assertThat(read(owner, proposal.id)["status"].asString()).isEqualTo("PENDING")

        val rejected = owner.post("$path/${proposal.id}/reject", mapOf("reason" to "가".repeat(1000)))
        assertThat(rejected.status).describedAs(rejected.body.toString()).isEqualTo(200)
        assertThat(rejected.body["status"].asString()).isEqualTo("REJECTED")
        assertThat(rejected.body["decisionNote"].asString()).isEqualTo("가".repeat(1000))
        assertThat(rejected.body["result"].isNull).isTrue()
    }

    @Test
    fun `제안은 주인만 보고 주인만 승인한다`() {
        val aliceEmail = newUser(Role.EDITOR, "Alice")
        val bobEmail = newUser(Role.EDITOR, "Bob")
        val alice = loggedIn(aliceEmail)
        val bob = loggedIn(bobEmail)
        val nodeId = Fixtures(loggedIn(ALICE)).company("주인 기업").id
        val aliceProposal = submitOne(userId(aliceEmail), item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "KNOWN")))
        submitOne(userId(aliceEmail), item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "UNSURE")))
        submitOne(userId(bobEmail), item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "LEARNING")))

        val bobList = bob.get(path).body
        assertThat(bobList["items"].toList().map { it["id"].asString() }).doesNotContain(aliceProposal.id).hasSize(1)
        val byBob = accept(bob, aliceProposal.id)
        assertThat(byBob.status).describedAs(byBob.body.toString()).isEqualTo(404)
        assertThat(byBob.code).isEqualTo("NOT_FOUND")
        assertThat(alice.get("$path/summary").body["pending"].asLong()).isEqualTo(2)
        assertThat(bob.get("$path/summary").body["pending"].asLong()).isEqualTo(1)

        assertThat(accept(alice, aliceProposal.id).status).isEqualTo(200)
        assertThat(alice.get("$path/summary").body["pending"].asLong()).isEqualTo(1)
        val all = alice.get(path).body["items"].toList().map { it["status"].asString() }
        assertThat(all).describedAs("전체 목록은 대기를 앞에 둔다").containsExactly("PENDING", "ACCEPTED")
        assertThat(alice.get("$path?status=ACCEPTED").body["items"].toList().map { it["id"].asString() }).containsExactly(aliceProposal.id)
        val badStatus = alice.get("$path?status=DONE")
        assertThat(badStatus.status).isEqualTo(400)
        assertThat(badStatus.code).isEqualTo("VALIDATION_FAILED")
    }

    @Test
    fun `올리기는 항목 하나라도 틀리면 아무것도 만들지 않고 틀린 자리를 알린다`() {
        val fixtures = Fixtures(loggedIn(ALICE))
        val ownerId = userId(newUser(Role.EDITOR))
        val bobTrade = trade(userId(BOB))
        val decision = decision(fixtures)
        val goodNode = item("CREATE_NODE", mapOf("type" to "Decision", "properties" to mapOf("title" to "좋은-${fixtures.suffix}", "action" to "BUY")))
        fun pending() = count("MATCH (:User {id: \$id})-[:OWNS]->(p:Proposal) RETURN count(p) AS n", "id" to ownerId)

        val unknownKind = failure { proposals.submit(ownerId, null, null, listOf(item("DELETE_NODE", mapOf<String, Any?>()))) }
        assertThat(unknownKind.code).isEqualTo("VALIDATION_FAILED")
        assertThat(fieldErrors(unknownKind)).containsKey("proposals[0].kind")

        val claim = item("CREATE_NODE", mapOf("type" to "Claim", "properties" to mapOf("predicate" to "ADVOCATES")))
        val violation = failure { proposals.submit(ownerId, null, null, listOf(goodNode, claim)) }
        assertThat(violation.code).isEqualTo("ONTOLOGY_VIOLATION")
        assertThat(violation.details["index"]).isEqualTo(1)
        assertThat(pending()).describedAs("첫 항목도 만들지 않는다").isZero()

        val missingTitle = failure {
            proposals.submit(ownerId, null, null, listOf(item("CREATE_NODE", mapOf("type" to "Decision", "properties" to mapOf("action" to "BUY")))))
        }
        assertThat(missingTitle.code).isEqualTo("VALIDATION_FAILED")
        assertThat(fieldErrors(missingTitle)).containsKey("proposals[0].payload.properties.title")

        val othersTrade = failure {
            proposals.submit(ownerId, null, null, listOf(item("LINK_TRADE_DECISION", mapOf("tradeIds" to listOf(bobTrade), "decisionId" to decision.id))))
        }
        assertThat(othersTrade.code).isEqualTo("NOT_FOUND")
        assertThat(othersTrade.details["index"]).isEqualTo(0)
        assertThat(othersTrade.details["id"]).isEqualTo(bobTrade)

        val bothEnds = failure {
            proposals.submit(
                ownerId, null, null,
                listOf(
                    item(
                        "CREATE_NODE",
                        mapOf(
                            "type" to "Decision", "properties" to mapOf("title" to "양끝", "action" to "BUY"),
                            "links" to listOf(mapOf("type" to "HAS_DECISION", "fromId" to decision.id, "toId" to decision.id)),
                        ),
                    ),
                ),
            )
        }
        assertThat(fieldErrors(bothEnds)).containsKey("proposals[0].payload.links[0]")
        assertThat(pending()).isZero()

        val key = "same-${fixtures.suffix}"
        val first = proposals.submit(ownerId, null, null, listOf(goodNode + ("dedupeKey" to key))).single()
        val again = proposals.submit(ownerId, null, null, listOf(goodNode + ("dedupeKey" to key), goodNode + ("dedupeKey" to key)))
        assertThat(first.status).isEqualTo("created")
        assertThat(again.map { it.status }).containsExactly("existing", "existing")
        assertThat(again.map { it.proposal.id }).containsOnly(first.proposal.id)
        assertThat(pending()).isEqualTo(1)
    }

    @Test
    fun `이미 있는 종목이나 관계와 겹치는 제안은 올릴 때 거절한다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val ownerId = userId(newUser(Role.EDITOR))
        val ticker = "U${fixtures.suffix}".uppercase()
        val security = fixtures.security("있는 종목", ticker)
        val company = fixtures.company("있는 관계 기업")
        val issues = alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id))
        assertThat(issues.status).describedAs(issues.body.toString()).isEqualTo(201)
        fun pending() = count("MATCH (:User {id: \$id})-[:OWNS]->(p:Proposal) RETURN count(p) AS n", "id" to ownerId)
        val note = item("STUDY_NOTE", mapOf("nodeId" to company.id, "level" to "KNOWN"))

        val sameListing = item(
            "CREATE_NODE",
            mapOf("type" to "Security", "properties" to mapOf("market" to "KRX_KOSPI", "ticker" to ticker, "name" to "다른 이름", "securityType" to "COMMON")),
        )
        val listing = failure { proposals.submit(ownerId, null, null, listOf(note, sameListing)) }
        assertThat(listing.code).isEqualTo("DUPLICATE")
        assertThat(listing.status.value()).isEqualTo(409)
        assertThat(listing.details["index"]).isEqualTo(1)

        val sameRelationship = item("CREATE_RELATIONSHIP", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id))
        val relationship = failure { proposals.submit(ownerId, null, null, listOf(sameRelationship)) }
        assertThat(relationship.code).isEqualTo("DUPLICATE")
        assertThat(relationship.status.value()).isEqualTo(409)
        assertThat(relationship.details["index"]).isEqualTo(0)
        assertThat(pending()).isZero()
    }

    @Test
    fun `승인한 제안을 같은 키로 다시 올리면 내용을 다시 검사하지 않고 있던 제안을 돌려준다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val ownerEmail = newUser(Role.EDITOR)
        val owner = loggedIn(ownerEmail)
        val ownerId = userId(ownerEmail)
        val company = fixtures.company("다시 올릴 기업")
        val security = fixtures.security("다시 올릴 종목")
        val decision = decision(fixtures)
        val tradeId = trade(ownerId)

        val relationship = item(
            "CREATE_RELATIONSHIP", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id), dedupeKey = "rel-${fixtures.suffix}",
        )
        val link = item(
            "LINK_TRADE_DECISION", mapOf("tradeIds" to listOf(tradeId), "decisionId" to decision.id), dedupeKey = "link-${fixtures.suffix}",
        )
        val first = proposals.submit(ownerId, null, null, listOf(relationship, link)).map { it.proposal.id }
        first.forEach { id -> assertThat(accept(owner, id).status).describedAs("승인 $id").isEqualTo(200) }
        val archived = alice.post("/api/nodes/${decision.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(archived.status).describedAs(archived.body.toString()).isEqualTo(200)

        val again = proposals.submit(ownerId, null, null, listOf(relationship, link))

        assertThat(again.map { it.status }).describedAs("같은 관계가 생겼고 결정이 보관됐어도 409 가 아니다").containsExactly("existing", "existing")
        assertThat(again.map { it.proposal.id }).containsExactlyElementsOf(first)
        assertThat(again.map { it.proposal.status }).containsOnly("ACCEPTED")
    }

    @Test
    fun `오래된 결정한 제안을 같은 키로 다시 올리면 돌려주고 지우지 않는다`() {
        val ownerEmail = newUser(Role.VIEWER)
        val owner = loggedIn(ownerEmail)
        val ownerId = userId(ownerEmail)
        val nodeId = Fixtures(loggedIn(ALICE)).company("오래된 키 기업").id
        val keyed = item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "KNOWN"), dedupeKey = "old-${unique()}")
        val old = submitOne(ownerId, keyed)
        assertThat(owner.post("$path/${old.id}/reject", null).status).isEqualTo(200)
        neo4j.query("MATCH (p:Proposal {id: \$id}) SET p.decidedAt = \$at")
            .bindAll(mapOf("id" to old.id, "at" to Timestamps.system(Instant.now().minus(91, ChronoUnit.DAYS)))).run()

        val again = proposals.submit(ownerId, null, null, listOf(keyed)).single()

        assertThat(again.status).isEqualTo("existing")
        assertThat(again.proposal.id).isEqualTo(old.id)
        assertThat(count("MATCH (p:Proposal {id: \$id}) RETURN count(p) AS n", "id" to old.id)).describedAs("돌려준 제안은 남는다").isEqualTo(1)
    }

    @Test
    fun `대기 제안이 상한을 넘게 되면 아무것도 만들지 않는다`() {
        val ownerId = userId(newUser(Role.VIEWER))
        val nodeId = Fixtures(loggedIn(ALICE)).company("상한 기업").id
        val existing = Limits.MAX_PENDING_PROPOSALS - 1
        neo4j.query(
            """
            MATCH (u:User {id: ${'$'}id})
            UNWIND range(1, ${'$'}n) AS i
            CREATE (u)-[:OWNS]->(:Proposal {
              id: randomUUID(), ownerId: ${'$'}id, kind: 'STUDY_NOTE', status: 'PENDING', payload: '{}', rationale: '채움',
              evidence: '{}', createdAt: ${'$'}now, createdVia: 'AGENT'
            })
            """,
        ).bindAll(mapOf("id" to ownerId, "n" to existing, "now" to Timestamps.now())).run()
        val note = item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "KNOWN"))
        fun pending() = count("MATCH (:User {id: \$id})-[:OWNS]->(p:Proposal {status: 'PENDING'}) RETURN count(p) AS n", "id" to ownerId)

        val over = failure { proposals.submit(ownerId, null, null, listOf(note, note)) }

        assertThat(over.code).isEqualTo("PROPOSAL_LIMIT")
        assertThat(over.status.value()).isEqualTo(409)
        assertThat(over.details["max"]).isEqualTo(Limits.MAX_PENDING_PROPOSALS)
        assertThat(over.details["pending"]).isEqualTo(existing.toLong())
        assertThat(pending()).isEqualTo(existing.toLong())

        val fits = proposals.submit(ownerId, null, null, listOf(note))
        assertThat(fits.single().status).describedAs("상한까지는 올린다").isEqualTo("created")
        assertThat(pending()).isEqualTo(Limits.MAX_PENDING_PROPOSALS.toLong())
    }

    @Test
    fun `올리면 90일보다 오래 전에 결정한 제안을 지운다`() {
        val ownerEmail = newUser(Role.VIEWER)
        val owner = loggedIn(ownerEmail)
        val ownerId = userId(ownerEmail)
        val nodeId = Fixtures(loggedIn(ALICE)).company("정리 기업").id
        val note = item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "KNOWN"))
        val old = submitOne(ownerId, note)
        val recent = submitOne(ownerId, note)
        listOf(old, recent).forEach { assertThat(owner.post("$path/${it.id}/reject", null).status).isEqualTo(200) }
        fun setDecidedAt(id: String, daysAgo: Long) {
            neo4j.query("MATCH (p:Proposal {id: \$id}) SET p.decidedAt = \$at")
                .bindAll(mapOf("id" to id, "at" to Timestamps.system(Instant.now().minus(daysAgo, ChronoUnit.DAYS)))).run()
        }
        setDecidedAt(old.id, 91)
        setDecidedAt(recent.id, 89)
        fun exists(id: String) = count("MATCH (p:Proposal {id: \$id}) RETURN count(p) AS n", "id" to id) > 0

        submitOne(ownerId, note)

        assertThat(exists(old.id)).describedAs("91일 전에 결정한 제안").isFalse()
        assertThat(exists(recent.id)).describedAs("89일 전에 결정한 제안").isTrue()
    }

    @Test
    fun `제안은 지식 조회에 섞이지 않는다`() {
        val bob = loggedIn(BOB)
        val fixtures = Fixtures(loggedIn(ALICE))
        val ownerId = userId(newUser(Role.EDITOR))
        val company = fixtures.company("섞이지 않는 기업")
        val countsBefore = bob.get("/api/nodes/counts").body.toString()
        val searchBefore = bob.get("/api/nodes?q=${fixtures.suffix}").body["totalItems"].asLong()

        submitOne(
            ownerId,
            item(
                "CREATE_NODE",
                mapOf(
                    "type" to "Company", "properties" to mapOf("name" to "제안 기업-${fixtures.suffix}", "country" to "KR"),
                ),
                evidence = mapOf("nodeIds" to listOf(company.id)),
            ),
        )

        assertThat(bob.get("/api/nodes/counts").body.toString()).isEqualTo(countsBefore)
        val search = bob.get("/api/nodes?q=${fixtures.suffix}").body
        assertThat(search["totalItems"].asLong()).isEqualTo(searchBefore)
        assertThat(search.toString()).doesNotContain("제안 기업")
    }

    @Test
    fun `사용자를 지우면 그 사용자의 제안이 함께 지워진다`() {
        val ownerId = userId(newUser(Role.VIEWER))
        val nodeId = Fixtures(loggedIn(ALICE)).company("지울 사용자 기업").id
        submitOne(ownerId, item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "KNOWN")))
        submitOne(ownerId, item("STUDY_NOTE", mapOf("nodeId" to nodeId, "level" to "UNSURE")))

        neo4j.query(
            """
            MATCH (u:User {id: ${'$'}id})
            OPTIONAL MATCH (u)-[:OWNS]->(x)
            DETACH DELETE u, x
            """,
        ).bind(ownerId).to("id").run()

        assertThat(count("MATCH (p:Proposal {ownerId: \$id}) RETURN count(p) AS n", "id" to ownerId)).isZero()
    }
}
