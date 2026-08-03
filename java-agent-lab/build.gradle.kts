plugins {
    java
    alias(libs.plugins.spring.boot)
}

group = "dev.fos.graphrag"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

dependencies {
    implementation(platform(libs.spring.boot.bom))
    implementation(platform(libs.spring.ai.bom))
    implementation(platform(libs.langgraph4j.bom))

    implementation(libs.spring.ai.ollama)
    implementation(libs.langgraph4j.spring.ai)

    testImplementation(libs.spring.boot.test)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test> {
    useJUnitPlatform()
}
