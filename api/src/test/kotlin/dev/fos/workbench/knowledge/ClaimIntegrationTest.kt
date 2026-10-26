package dev.fos.workbench.knowledge

import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ClaimIntegrationTest : IntegrationTest() {

    @Test
    fun `산업 소속 Claim 을 만들고 다른 사용자가 검토한다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val supplier = fx.company("가상부품")
        val customer = fx.sector("반도체")
        val document = fx.document("2026 사업보고서")

        val created = fx.claim("BELONGS_TO_SECTOR", supplier.id, customer.id, listOf(document.id))
        assertThat(created.status).isEqualTo(201)
        val claim = created.body
        assertThat(claim["reviewStatus"].asString()).isEqualTo("DRAFT")
        assertThat(claim["properties"]["authoringMethod"].asString()).isEqualTo("MANUAL")
        assertThat(claim["properties"].has("validFrom")).isFalse()
        assertThat(claim["subject"]["id"].asString()).isEqualTo(supplier.id)
        assertThat(claim["object"]["id"].asString()).isEqualTo(customer.id)
        assertThat(claim["documents"][0]["url"].asString()).startsWith("https://example.com/")

        val self = alice.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED"))
        assertThat(self.status).isEqualTo(403)
        assertThat(self.code).isEqualTo("SELF_REVIEW_FORBIDDEN")

        val reviewed = bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED", "note" to "공시 원문과 대조함"))
        assertThat(reviewed.status).isEqualTo(200)
        assertThat(reviewed.body["reviewStatus"].asString()).isEqualTo("REVIEWED")
        assertThat(reviewed.body["reviewedBy"]["email"].asString()).isEqualTo(BOB)
        assertThat(reviewed.body["reviewNote"].asString()).isEqualTo("공시 원문과 대조함")

        // 상세 조회에서 근거와 검토자가 함께 보인다
        val detail = alice.get("/api/nodes/${supplier.id}").body
        val linked = detail["claims"].single { it["id"].asString() == claim.id }
        assertThat(linked["reviewedBy"]["displayName"].asString()).isEqualTo("Bob")
        assertThat(linked["properties"]["evidenceText"].asString()).contains("주요 매출처")

        val history = alice.get("/api/changes?targetId=${claim.id}").body["items"]
        assertThat(history[0]["action"].asString()).isEqualTo("REVIEW")
        assertThat(history[0]["actor"]["email"].asString()).isEqualTo(BOB)
    }

    @Test
    fun `Claim 이름은 읽을 때 주체와 대상 이름으로 만들고 이력에는 그때의 이름을 남긴다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val supplier = fx.company("가상부품")
        val customer = fx.sector("반도체")
        val first = "가상부품-${fx.suffix} → 반도체-${fx.suffix} 속한다"

        val claim = fx.claim("BELONGS_TO_SECTOR", supplier.id, customer.id, listOf(fx.document("보고서").id)).body
        assertThat(claim["label"].asString()).isEqualTo(first)
        fun history(action: String) = alice.get("/api/changes?targetId=${claim.id}").body["items"].toList()
            .single { it["action"].asString() == action }["targetLabel"].asString()
        assertThat(history("CREATE")).isEqualTo(first)

        val renamed = "가상소재-${fx.suffix}"
        val patched = alice.patch("/api/nodes/${supplier.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("name" to renamed)))
        assertThat(patched.status).describedAs(patched.body.toString()).isEqualTo(200)
        assertThat(alice.get("/api/claims/${claim.id}").body["label"].asString()).startsWith(renamed)
        assertThat(alice.get("/api/nodes/${claim.id}").body["node"]["label"].asString()).startsWith(renamed)
        assertThat(alice.get("/api/nodes/${customer.id}").body["claims"][0]["label"].asString()).startsWith(renamed)

        val reviewed = bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED"))
        assertThat(reviewed.status).describedAs(reviewed.body.toString()).isEqualTo(200)
        assertThat(history("REVIEW")).startsWith(renamed)
        assertThat(history("CREATE")).isEqualTo(first)

        alice.post("/api/nodes/${claim.id}/archive", mapOf("expectedRevision" to reviewed.body.revision))
        assertThat(history("ARCHIVE")).isEqualTo("$renamed → 반도체-${fx.suffix} 속한다")
    }

    @Test
    fun `인물이 쓴 책을 AUTHORED 로 잇고 그 책을 근거로 인물이 개념을 강조한다는 주장을 만든다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val person = fx.node("Person", mapOf("name" to "가상 투자자-${fx.suffix}", "englishName" to "Virtual Investor ${fx.suffix}"))
        val concept = fx.node("Concept", mapOf("name" to "안전마진-${fx.suffix}", "summary" to "손실 가능성을 줄이는 여유다."))
        val book = fx.node(
            "Document",
            mapOf("title" to "안전마진 해설서-${fx.suffix}", "url" to "https://example.com/book-${fx.suffix}", "documentType" to "BOOK", "collectedAt" to "2026-10-20T03:00:00Z"),
        )

        val authored = alice.post("/api/relationships", mapOf("type" to "AUTHORED", "fromId" to person.id, "toId" to book.id))
        assertThat(authored.status).describedAs(authored.body.toString()).isEqualTo(201)
        val reversed = alice.post("/api/relationships", mapOf("type" to "AUTHORED", "fromId" to book.id, "toId" to person.id))
        assertThat(reversed.status).isEqualTo(400)
        assertThat(reversed.code).isEqualTo("ONTOLOGY_VIOLATION")
        assertThat(alice.get("/api/nodes/${book.id}").body["relationships"].toList().map { it["type"].asString() }).containsExactly("AUTHORED")

        val created = fx.claim("ADVOCATES", person.id, concept.id, listOf(book.id))
        assertThat(created.status).describedAs(created.body.toString()).isEqualTo(201)
        assertThat(created.body["label"].asString()).isEqualTo("가상 투자자-${fx.suffix} → 안전마진-${fx.suffix} 강조한다")
        assertThat(alice.get("/api/nodes/${person.id}").body["claims"].toList().map { it.id }).containsExactly(created.body.id)
    }

    @Test
    fun `내용을 고치면 검토 상태가 DRAFT 로 돌아가고 유효 기간을 미상으로 되돌릴 수 있다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val claim = fx.claim("BELONGS_TO_SECTOR", fx.company("a").id, fx.sector("b").id, listOf(fx.document("d").id)).body
        bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED"))

        val edited = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to 2, "validFrom" to "2025-01-01", "description" to "수정한 설명"))
        assertThat(edited.status).isEqualTo(200)
        assertThat(edited.body["reviewStatus"].asString()).isEqualTo("DRAFT")
        assertThat(edited.body["reviewedBy"].isNull).isTrue()
        assertThat(edited.body["properties"]["validFrom"].asString()).isEqualTo("2025-01-01")

        val unknown = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to edited.body.revision, "validFrom" to null))
        assertThat(unknown.body["properties"].has("validFrom")).isFalse()

        val immutable = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to unknown.body.revision, "predicate" to "CRITICIZES"))
        assertThat(immutable.code).isEqualTo("ONTOLOGY_VIOLATION")

        val badPeriod = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to unknown.body.revision, "validFrom" to "2026-01-01", "validTo" to "2025-01-01"))
        assertThat(badPeriod.code).isEqualTo("VALIDATION_FAILED")
    }

    @Test
    fun `predicate 의 대상 타입과 근거 문서를 검증한다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val company = fx.company("c")
        val sector = fx.sector("s")
        val document = fx.document("d")

        val wrongSubject = fx.claim("BELONGS_TO_SECTOR", sector.id, company.id, listOf(document.id))
        assertThat(wrongSubject.status).isEqualTo(400)
        assertThat(wrongSubject.body["details"]["rule"].asString()).isEqualTo("claim-subject-type")

        val wrongObject = fx.claim("BELONGS_TO_SECTOR", company.id, company.id, listOf(document.id))
        assertThat(wrongObject.body["details"]["rule"].asString()).isEqualTo("claim-object-type")

        val noEvidence = fx.claim("BELONGS_TO_SECTOR", company.id, sector.id, emptyList())
        assertThat(noEvidence.code).isEqualTo("VALIDATION_FAILED")

        val companyAsEvidence = fx.claim("BELONGS_TO_SECTOR", company.id, sector.id, listOf(company.id))
        assertThat(companyAsEvidence.body["details"]["rule"].asString()).isEqualTo("claim-evidence-type")

        val unknownPredicate = fx.claim("OWNS_SHARES_OF", company.id, company.id, listOf(document.id))
        assertThat(unknownPredicate.code).isEqualTo("ONTOLOGY_VIOLATION")

        assertThat(fx.claim("BELONGS_TO_SECTOR", company.id, sector.id, listOf(document.id)).status).isEqualTo(201)
    }

    @Test
    fun `내용을 마지막으로 고친 사람도 자기 수정본을 검토할 수 없다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val claim = fx.claim("BELONGS_TO_SECTOR", fx.company("a").id, fx.sector("b").id, listOf(fx.document("d").id)).body

        val edited = bob.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to 1, "evidenceText" to "B 가 바꾼 근거 문장"))
        assertThat(edited.status).isEqualTo(200)
        val selfReview = bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 2, "status" to "REVIEWED"))
        assertThat(selfReview.code).isEqualTo("SELF_REVIEW_FORBIDDEN")
        // 작성자 A 도 여전히 검토할 수 없다. 두 사람 모두 손댄 내용은 제3자가 검토한다
        assertThat(alice.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 2, "status" to "REVIEWED")).code)
            .isEqualTo("SELF_REVIEW_FORBIDDEN")
        assertThat(loggedIn(ADMIN).post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 2, "status" to "REVIEWED")).status)
            .isEqualTo(200)
    }

    @Test
    fun `검토 대기는 요청한 사람 기준으로 나뉜다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val admin = loggedIn(ADMIN)
        val fx = Fixtures(alice)
        val (x, y, d) = Triple(fx.node("Person", mapOf("name" to "x-${fx.suffix}")).id, fx.node("Concept", mapOf("name" to "y-${fx.suffix}", "summary" to "개념")).id, fx.document("d").id)
        val a = fx.claim("ADVOCATES", x, y, listOf(d)).body.id
        val b = Fixtures(bob).claim("CRITICIZES", x, y, listOf(d)).body.id
        val c = fx.claim("ADVOCATES", x, y, listOf(d)).body.id
        assertThat(bob.patch("/api/claims/$c", mapOf("expectedRevision" to 1, "evidenceText" to "B 가 바꾼 근거 문장")).status).isEqualTo(200)

        // 같은 컨테이너를 다른 테스트와 함께 쓰므로 개수는 세지 않고 이 테스트가 만든 id 가 있는지만 본다.
        // 테스트 전체가 만드는 DRAFT 주장이 한 쪽(100개)을 넘지 않는다는 전제다
        fun ids(client: ApiClient, scope: String): List<String> {
            val response = client.get("/api/claims?reviewStatus=DRAFT&scope=$scope&size=100")
            assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
            return response.body["items"].toList().map { it.id }
        }
        assertThat(ids(alice, "reviewable")).describedAs("Alice 가 검토할 것").contains(b).doesNotContain(a, c)
        assertThat(ids(alice, "mine")).describedAs("Alice 가 쓰거나 고친 것").contains(a, c).doesNotContain(b)
        assertThat(ids(bob, "reviewable")).describedAs("Bob 이 검토할 것").contains(a).doesNotContain(b, c)
        assertThat(ids(bob, "mine")).describedAs("Bob 이 쓰거나 고친 것").contains(b, c)
        assertThat(ids(admin, "reviewable")).describedAs("제3자가 검토할 것").contains(a, b, c)

        val invalid = alice.get("/api/claims?reviewStatus=DRAFT&scope=everything")
        assertThat(invalid.status).isEqualTo(400)
        assertThat(invalid.code).isEqualTo("VALIDATION_FAILED")

        assertThat(alice.get("/api/claims/$c").body["contentUpdatedBy"]["email"].asString()).isEqualTo(BOB)
    }
}
