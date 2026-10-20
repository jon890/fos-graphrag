package dev.fos.workbench.auth

import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.history.ChangeAction
import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.FieldChange
import dev.fos.workbench.history.TargetKind
import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/** 사용자가 한 명도 없을 때만 WORKBENCH_BOOTSTRAP_ADMIN_EMAIL 로 첫 ADMIN 을 만든다. 공개 가입은 없다. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
class BootstrapAdmin(
    private val users: UserRepository,
    private val recorder: ChangeEventRecorder,
    private val properties: WorkbenchProperties,
) : ApplicationRunner {

    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    override fun run(args: ApplicationArguments) {
        val email = properties.bootstrap.adminEmail?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return
        if (users.countWithEmail() > 0) return
        val admin = users.create(email, properties.bootstrap.adminName, Role.ADMIN, SYSTEM_ACTOR)
        recorder.record(
            ChangeEventDraft(
                SYSTEM_ACTOR, ChangeAction.CREATE, admin.id, TargetKind.USER, "User", admin.email, 1L,
                mapOf("email" to FieldChange(null, admin.email), "role" to FieldChange(null, Role.ADMIN.name)),
                "시작 설정으로 만든 첫 관리자",
            ),
        )
        log.info("첫 관리자를 만들었다")
    }

    companion object {
        const val SYSTEM_ACTOR = "system"
    }
}
