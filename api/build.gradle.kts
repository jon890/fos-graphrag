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

val neo4jHarness by configurations.creating

dependencies {
    neo4jHarness(libs.neo4j.harness)
    implementation(platform(libs.spring.boot.bom))
    implementation(libs.spring.boot.webmvc)
    implementation(libs.spring.boot.security)
    implementation(libs.spring.boot.oauth2.client)
    implementation(libs.spring.boot.data.neo4j)
    implementation(libs.spring.boot.validation)
    implementation(libs.jackson.kotlin)
    implementation(libs.jackson.yaml)
    implementation(libs.kotlin.reflect)
    implementation(libs.mcp)

    testImplementation(libs.spring.boot.test)
    testImplementation(libs.mock.oauth2.server)
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
    // Neo4j 하네스는 Netty 4.1 을, 앱의 드라이버는 Netty 4.2 를 써서 하네스를 BOM 밖에서 받아 격리 클래스로더로 띄운다
    inputs.files(neo4jHarness)
    jvmArgumentProviders.add(CommandLineArgumentProvider { listOf("-Dneo4j.harness.classpath=${neo4jHarness.asPath}") })
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

tasks.jar {
    enabled = false
}
