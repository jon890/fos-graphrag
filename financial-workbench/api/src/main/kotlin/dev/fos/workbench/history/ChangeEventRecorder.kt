package dev.fos.workbench.history

import dev.fos.workbench.config.Timestamps
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

enum class ChangeAction { CREATE, UPDATE, REVIEW, ARCHIVE, RESTORE }

enum class TargetKind { NODE, RELATIONSHIP, USER, ONTOLOGY }

data class FieldChange(val before: Any?, val after: Any?)

data class ChangeEventDraft(
    val actorId: String,
    val action: ChangeAction,
    val targetId: String,
    val targetKind: TargetKind,
    val targetType: String,
    val targetLabel: String,
    val revision: Long,
    val changes: Map<String, FieldChange>,
    val note: String? = null,
)

/**
 * 변경 이력을 남긴다. 호출한 서비스의 트랜잭션 안에서 돌아 데이터 변경과 함께 커밋되거나 롤백된다.
 * 인터페이스로 둔 것은 트랜잭션 일관성 테스트가 실패하는 구현을 넣기 위해서다.
 */
interface ChangeEventRecorder {
    fun record(event: ChangeEventDraft)
}

@Component
class Neo4jChangeEventRecorder(private val client: Neo4jClient, private val mapper: JsonMapper) : ChangeEventRecorder {
    override fun record(event: ChangeEventDraft) {
        client.query("CREATE (e:ChangeEvent) SET e = ${'$'}props").bind(
            mapOf(
                "id" to UUID.randomUUID().toString(),
                "at" to Timestamps.now(),
                "actorId" to event.actorId,
                "action" to event.action.name,
                "targetId" to event.targetId,
                "targetKind" to event.targetKind.name,
                "targetType" to event.targetType,
                "targetLabel" to event.targetLabel,
                "revision" to event.revision,
                "changes" to mapper.writeValueAsString(event.changes),
                "note" to event.note,
            ),
        ).to("props").run()
    }
}

/** before 와 after 를 비교해 바뀐 키만 남긴다. after 의 null 은 삭제를 뜻한다. */
fun diff(before: Map<String, Any?>, after: Map<String, Any?>): Map<String, FieldChange> =
    after.filter { (k, v) -> before[k] != v }.mapValues { (k, v) -> FieldChange(before[k], v) }
