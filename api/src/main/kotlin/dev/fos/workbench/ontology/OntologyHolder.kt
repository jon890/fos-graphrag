package dev.fos.workbench.ontology

import dev.fos.workbench.auth.BootstrapAdmin
import org.springframework.stereotype.Component

/** 저장된 온톨로지 버전 하나. `createdBy` 는 `:User` 의 id 이고 서버가 만든 버전은 `system` 이다 */
data class OntologySnapshot(
    val version: Int,
    val ontology: Ontology,
    val createdAt: String,
    val createdBy: String,
    val note: String?,
    val restoredFrom: Int?,
)

/**
 * 최신 온톨로지 버전을 메모리에 둔다. 요청마다 DB 를 읽지 않는다. API 가 프로세스 하나로만 돌기 때문이다.
 * 시작 작업(`OntologyVersionStore.bootstrap`)이 처음 채우고, 저장 트랜잭션이 커밋된 뒤 새 버전으로 바꾼다.
 * 쓰는 쪽은 메서드 처음에 [current] 를 한 번 받아 끝까지 그 값을 쓴다. docs/code-architecture.md 의 「API 패키지」.
 */
@Component
class OntologyHolder {
    @Volatile
    private var value: OntologySnapshot? = null

    fun current(): Ontology = snapshot().ontology

    fun snapshot(): OntologySnapshot = value ?: throw IllegalStateException("온톨로지를 아직 읽지 않았다")

    fun snapshotOrNull(): OntologySnapshot? = value

    /** 들고 있는 번호보다 클 때만 바꾼다. 두 저장의 커밋 뒤 작업이 거꾸로 돌아도 낮은 번호로 돌아가지 않는다 */
    @Synchronized
    internal fun replace(s: OntologySnapshot) {
        val held = value
        if (held == null || s.version > held.version) value = s
    }

    companion object {
        /** DB 없이 정해진 정의 하나로 도는 단위 테스트용 */
        fun fixed(o: Ontology, version: Int = 1): OntologyHolder =
            OntologyHolder().apply { replace(OntologySnapshot(version, o, "", BootstrapAdmin.SYSTEM_ACTOR, null, null)) }
    }
}
