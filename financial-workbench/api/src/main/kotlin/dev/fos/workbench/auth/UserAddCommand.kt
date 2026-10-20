package dev.fos.workbench.auth

import dev.fos.workbench.WorkbenchApplication
import org.springframework.boot.WebApplicationType
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.security.crypto.password.PasswordEncoder

/**
 * 계정을 만드는 유일한 경로다. 공개 가입 API 는 없다.
 * 사용: `java -jar app.jar user-add <username> <displayName>`, 비밀번호는 WORKBENCH_USER_PASSWORD 환경변수.
 */
object UserAddCommand {
    const val NAME = "user-add"
    const val PASSWORD_ENV = "WORKBENCH_USER_PASSWORD"
    const val MIN_PASSWORD_LENGTH = 12
    private val USERNAME = Regex("[a-z][a-z0-9_.-]{1,31}")

    fun run(args: List<String>): Int {
        if (args.size != 2) {
            System.err.println("사용법: $NAME <username> <displayName>  (비밀번호는 $PASSWORD_ENV)")
            return 2
        }
        val (username, displayName) = args
        val password = System.getenv(PASSWORD_ENV).orEmpty()
        val problem = validate(username, displayName, password)
        if (problem != null) {
            System.err.println(problem)
            return 2
        }
        val context = SpringApplicationBuilder(WorkbenchApplication::class.java)
            .web(WebApplicationType.NONE)
            .run()
        return context.use {
            val users = it.getBean(UserRepository::class.java)
            if (users.findByUsername(username) != null) {
                System.err.println("이미 있는 사용자 이름입니다: $username")
                return@use 1
            }
            val created = users.create(username, displayName, it.getBean(PasswordEncoder::class.java).encode(password)!!)
            println("사용자를 만들었습니다: ${created.username} (${created.id})")
            0
        }
    }

    fun validate(username: String, displayName: String, password: String): String? = when {
        !USERNAME.matches(username) -> "사용자 이름은 영문 소문자로 시작하고 2~32자의 소문자, 숫자, _ . - 만 쓴다."
        displayName.isBlank() || displayName.length > 64 -> "표시 이름은 1~64자다."
        password.length < MIN_PASSWORD_LENGTH -> "비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 한다. $PASSWORD_ENV 를 확인한다."
        else -> null
    }
}
