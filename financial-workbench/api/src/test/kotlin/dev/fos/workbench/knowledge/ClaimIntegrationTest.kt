package dev.fos.workbench.knowledge

import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ClaimIntegrationTest : IntegrationTest() {

    @Test
    fun `공급 관계 Claim 을 만들고 다른 사용자가 검토한다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val supplier = fx.company("가상부품")
        val customer = fx.company("가상전자")
        val document = fx.document("2026 사업보고서")

        val created = fx.claim("SUPPLIES_TO", supplier.id, customer.id, listOf(document.id))
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
    fun `내용을 고치면 검토 상태가 DRAFT 로 돌아가고 유효 기간을 미상으로 되돌릴 수 있다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val claim = fx.claim("SUPPLIES_TO", fx.company("a").id, fx.company("b").id, listOf(fx.document("d").id)).body
        bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED"))

        val edited = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to 2, "validFrom" to "2025-01-01", "description" to "수정한 설명"))
        assertThat(edited.status).isEqualTo(200)
        assertThat(edited.body["reviewStatus"].asString()).isEqualTo("DRAFT")
        assertThat(edited.body["reviewedBy"].isNull).isTrue()
        assertThat(edited.body["properties"]["validFrom"].asString()).isEqualTo("2025-01-01")

        val unknown = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to edited.body.revision, "validFrom" to null))
        assertThat(unknown.body["properties"].has("validFrom")).isFalse()

        val immutable = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to unknown.body.revision, "predicate" to "COMPETES_WITH"))
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

        val wrongSubject = fx.claim("SUPPLIES_TO", sector.id, company.id, listOf(document.id))
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
        val claim = fx.claim("SUPPLIES_TO", fx.company("a").id, fx.company("b").id, listOf(fx.document("d").id)).body

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
}
