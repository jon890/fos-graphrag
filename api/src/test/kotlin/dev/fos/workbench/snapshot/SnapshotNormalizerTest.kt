package dev.fos.workbench.snapshot

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper

class SnapshotNormalizerTest {

    private val mapper = JsonMapper.builder().build()

    private fun snapshot(name: String, body: String, path: String = "/api/x", query: String = "") =
        Snapshot(name, "GET", path, query, 200, mapper.readTree(body))

    private fun normalize(vararg snapshots: Snapshot) = SnapshotNormalizer().normalize(snapshots.toList())

    @Test
    fun `같은 UUID 는 모든 문서에서 같은 자리표시가 되고 다른 UUID 는 처음 나온 순서로 번호가 붙는다`() {
        val a = "aaaaaaaa-1111-4111-8111-111111111111"
        val b = "bbbbbbbb-2222-4222-8222-222222222222"
        val c = "cccccccc-3333-4333-8333-333333333333"
        val out = normalize(
            snapshot("first", """{"id": "$b", "items": [{"id": "$a"}]}"""),
            snapshot("second", """{"refs": {"$a": {"id": "$a"}}, "redirectUrl": "http://x/cb?node=$c"}""", path = "/api/nodes/$b", query = "id=$c"),
        )

        assertThat(out[0].body.toString())
            .isEqualTo("""{"id":"00000000-0000-4000-8000-000000000001","items":[{"id":"00000000-0000-4000-8000-000000000002"}]}""")
        assertThat(out[1].path).isEqualTo("/api/nodes/00000000-0000-4000-8000-000000000001")
        assertThat(out[1].query).isEqualTo("id=00000000-0000-4000-8000-000000000003")
        assertThat(out[1].body.toString()).isEqualTo(
            """{"refs":{"00000000-0000-4000-8000-000000000002":{"id":"00000000-0000-4000-8000-000000000002"}},""" +
                """"redirectUrl":"http://x/cb?node=00000000-0000-4000-8000-000000000003"}""",
        )
    }

    @Test
    fun `시각 자리표시는 나온 순서가 아니라 실제 시각 순서를 따른다`() {
        val out = normalize(
            snapshot("late", """{"createdAt": "2026-10-25T09:00:00.000002Z"}"""),
            snapshot("early", """{"createdAt": "2026-10-25T08:59:59.999999Z", "again": "2026-10-25T09:00:00.000002Z", "user": "2026-10-20T03:00:00Z"}"""),
        )

        assertThat(out[0].body.toString()).isEqualTo("""{"createdAt":"2026-01-01T00:00:01.000000Z"}""")
        assertThat(out[1].body.toString())
            .isEqualTo("""{"createdAt":"2026-01-01T00:00:00.000000Z","again":"2026-01-01T00:00:01.000000Z","user":"2026-10-20T03:00:00Z"}""")
    }

    @Test
    fun `토큰 원문과 client_id 와 인가 코드는 종류마다 고정 문자열이 되고 last4 는 자리표시의 끝 네 글자가 된다`() {
        val token = "fwb_" + "x".repeat(39) + "9Qa1"
        val code = "fwc_" + "k".repeat(43)
        val clientId = "dddddddd-4444-4444-8444-444444444444"
        val out = normalize(
            snapshot("issued", """{"token": "$token", "last4": "9Qa1"}"""),
            snapshot("list", """[{"last4": "9Qa1"}]"""),
            snapshot("preview", """{"clientName": "앱"}""", query = "response_type=code&client_id=$clientId&state=st"),
            snapshot("decide", """{"redirectUrl": "http://127.0.0.1:43210/callback?code=$code&state=st"}"""),
        )

        val fixedToken = "fwb_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        assertThat(out[0].body.toString()).isEqualTo("""{"token":"$fixedToken","last4":"AAAA"}""")
        assertThat(out[1].body.toString()).isEqualTo("""[{"last4":"AAAA"}]""")
        assertThat(out[2].query).isEqualTo("response_type=code&client_id=fixed-client-id-1&state=st")
        assertThat(out[3].body.toString())
            .isEqualTo("""{"redirectUrl":"http://127.0.0.1:43210/callback?code=fwc_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&state=st"}""")
    }

    @Test
    fun `UUID 형식이 아닌 값은 그대로 남는다`() {
        val body = """{"id": "not-a-uuid", "n": 12345678, "short": "aaaaaaaa-1111-4111-8111-11111111111", "upper": "AAAAAAAA-1111-4111-8111-111111111111"}"""
        val out = normalize(snapshot("plain", body, query = "id=not-a-uuid&page=0"))

        assertThat(out[0].body).isEqualTo(mapper.readTree(body))
        assertThat(out[0].query).isEqualTo("id=not-a-uuid&page=0")
    }
}
