plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.spring.boot)
}

group = "dev.fos.workbench"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict", "-Xannotation-default-target=param-property")
    }
}

dependencies {
    implementation(platform(libs.spring.boot.bom))
    implementation(libs.spring.boot.webmvc)
    implementation(libs.spring.boot.security)
    implementation(libs.spring.boot.oauth2.client)
    implementation(libs.spring.boot.data.neo4j)
    implementation(libs.spring.boot.validation)
    implementation(libs.jackson.kotlin)
    implementation(libs.jackson.yaml)
    implementation(libs.kotlin.reflect)

    testImplementation(libs.spring.boot.test)
    testImplementation(libs.spring.boot.testcontainers)
    testImplementation(libs.testcontainers.neo4j)
    testImplementation(libs.testcontainers.junit)
    testRuntimeOnly(libs.junit.platform.launcher)
}

// 온톨로지 정의는 저장소의 단일 파일을 jar 에 복사해 쓴다
tasks.processResources {
    from("../ontology/financial-ontology.yaml")
    // 초기 데이터는 classpath 의 seeds/ 아래에서 읽는다
    from("../ontology/seeds") { into("seeds") }
}

tasks.withType<Test> {
    useJUnitPlatform()
    // Colima 처럼 호스트 소켓 경로를 VM 안에서 마운트할 수 없는 런타임은 Ryuk 이 VM 안의 기본 소켓을 쓰게 한다
    if (System.getenv("DOCKER_HOST").orEmpty().contains(".colima") && System.getenv("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE") == null) {
        environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
    }
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

tasks.jar {
    enabled = false
}
