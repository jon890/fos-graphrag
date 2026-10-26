package dev.fos.workbench.snapshot

import dev.fos.workbench.config.Timestamps
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.JsonNodeFactory
import java.net.URLDecoder
import java.time.Instant

/**
 * 저장할 응답 하나. [query] 는 `?` 를 뺀 인코딩된 문자열이고, 없으면 빈 문자열이다.
 * [namedOnly] 면 가짜 API 가 요청만 보고 이 응답을 주지 않고, 화면 테스트가 이름으로 골라 쓴다
 */
data class Snapshot(
    val name: String,
    val method: String,
    val path: String,
    val query: String,
    val status: Int,
    val body: JsonNode,
    val namedOnly: Boolean = false,
)

/**
 * 실행마다 달라지는 값(UUID, 시스템 시각, 토큰 원문, client_id)을 자리표시로 바꾼다.
 * 같은 실제 값은 모든 스냅샷에서 같은 자리표시가 되도록 먼저 전부 모은 뒤 한 번에 바꾼다.
 */
class SnapshotNormalizer {

    fun normalize(snapshots: List<Snapshot>): List<Snapshot> {
        val clientIds = LinkedHashSet<String>()
        snapshots.forEach { collectClientIds(it, clientIds) }

        val uuids = LinkedHashSet<String>()
        val times = HashSet<String>()
        val secrets = LinkedHashMap<String, LinkedHashSet<String>>()
        snapshots.forEach { s ->
            strings(s).forEach { text ->
                SECRET.findAll(text).forEach { secrets.getOrPut(it.groupValues[1]) { LinkedHashSet() } += it.value }
                UUID.findAll(text).map { it.value }.filter { it !in clientIds }.forEach { uuids += it }
                TIME.findAll(text).forEach { times += it.value }
            }
        }

        val replace = HashMap<String, String>()
        clientIds.forEachIndexed { i, v -> replace[v] = "fixed-client-id-${i + 1}" }
        uuids.forEachIndexed { i, v -> replace[v] = "00000000-0000-4000-8000-%012d".format(i + 1) }
        // 고정 자릿수라 문자열 순서가 시간 순서다
        times.sorted().forEachIndexed { i, v -> replace[v] = Timestamps.system(BASE_TIME.plusSeconds(i.toLong())) }
        val last4 = HashMap<String, String>()
        secrets.forEach { (prefix, values) ->
            values.forEachIndexed { i, v ->
                val placeholder = "${prefix}_" + "${'A' + i}".repeat(SECRET_LENGTH)
                replace[v] = placeholder
                if (prefix == "fwb") last4[v.takeLast(4)] = placeholder.takeLast(4)
            }
        }

        val rewrite = { text: String -> rewrite(text, clientIds, replace) }
        return snapshots.map { s ->
            s.copy(path = rewrite(s.path), query = rewrite(s.query), body = rewriteNode(s.body, rewrite, last4))
        }
    }

    private fun collectClientIds(s: Snapshot, into: MutableSet<String>) {
        s.query.split('&').filter { it.isNotEmpty() }.forEach {
            val (k, v) = it.split('=', limit = 2).let { parts -> parts[0] to parts.getOrElse(1) { "" } }
            if (decode(k) == CLIENT_ID) into += decode(v)
        }
        walk(s.body) { key, value -> if (key == CLIENT_ID && value.isString) into += value.stringValue() }
    }

    /** 경로, query, 본문의 키와 문자열 값을 나온 순서대로 */
    private fun strings(s: Snapshot): List<String> {
        val out = mutableListOf(s.path, s.query)
        fun visit(node: JsonNode) {
            when {
                node.isObject -> node.properties().forEach { (k, v) -> out += k; visit(v) }
                node.isArray -> node.values().forEach { visit(it) }
                node.isString -> out += node.stringValue()
            }
        }
        visit(s.body)
        return out
    }

    private fun walk(node: JsonNode, onField: (String, JsonNode) -> Unit) {
        when {
            node.isObject -> node.properties().forEach { (k, v) -> onField(k, v); walk(v, onField) }
            node.isArray -> node.values().forEach { walk(it, onField) }
        }
    }

    private fun rewrite(text: String, clientIds: Set<String>, replace: Map<String, String>): String {
        var out = SECRET.replace(text) { replace.getValue(it.value) }
        clientIds.forEach { out = out.replace(it, replace.getValue(it)) }
        out = UUID.replace(out) { replace[it.value] ?: it.value }
        return TIME.replace(out) { replace.getValue(it.value) }
    }

    private fun rewriteNode(node: JsonNode, rewrite: (String) -> String, last4: Map<String, String>): JsonNode = when {
        node.isObject -> {
            val entries = node.properties().map { (k, v) ->
                val value = if (k == "last4" && v.isString) {
                    nodes.stringNode(last4[v.stringValue()] ?: error("어느 연동 토큰의 last4 인지 모른다: 스냅샷에 그 토큰의 발급 응답이 없다"))
                } else {
                    rewriteNode(v, rewrite, last4)
                }
                rewrite(k) to value
            }
            // 키가 id 인 맵(refs 등)은 서버의 순서가 실행마다 같다는 보장이 없어 바꾼 키로 정렬한다
            val keyed = entries.any { (k, _) -> UUID.containsMatchIn(k) }
            nodes.objectNode().also { obj -> (if (keyed) entries.sortedBy { it.first } else entries).forEach { (k, v) -> obj.set(k, v) } }
        }
        node.isArray -> nodes.arrayNode().also { arr -> node.values().forEach { arr.add(rewriteNode(it, rewrite, last4)) } }
        node.isString -> nodes.stringNode(rewrite(node.stringValue()))
        else -> node
    }

    private fun decode(s: String) = URLDecoder.decode(s, Charsets.UTF_8)

    companion object {
        private const val CLIENT_ID = "client_id"
        private const val SECRET_LENGTH = 43
        private val nodes = JsonNodeFactory.instance
        private val BASE_TIME = Instant.parse("2026-01-01T00:00:00Z")
        private val UUID = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
        private val TIME = Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z")

        /** 연동 토큰(fwb), OAuth 접근 토큰(fwa), 갱신 토큰(fwr), 인가 코드(fwc). 앞자리 뒤에 base64url 43자다 */
        private val SECRET = Regex("(?<![A-Za-z0-9_-])(fw[abcr])_[A-Za-z0-9_-]{$SECRET_LENGTH}(?![A-Za-z0-9_-])")
    }
}
