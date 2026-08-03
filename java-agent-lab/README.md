# Java 에이전트 실습

Java 21, Spring Boot 4.1, Spring AI 2.0, Ollama, LangGraph4j를 학습하기 위한 최소 프로젝트다.

그래프, 도구, 에이전트 코드를 작성하기 전에 의존성 연결과 애플리케이션 문맥 시작만 검증한다.
완성된 에이전트 예제는 포함하지 않는다.

## 사전 조건

- Java 21
- 프로젝트에 포함된 Gradle Wrapper
- 이후 실제 모델을 호출할 때만 Ollama 필요

기본 Ollama 연결 정보는 환경변수로 바꿀 수 있다.

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

모델 자동 다운로드 전략은 `never`로 설정되어 있다.

## 버전 관리

Spring Boot, Spring AI, LangGraph4j 버전과 의존성 좌표는 `gradle/libs.versions.toml`에서 관리한다.
각 생태계의 전이 의존성 정렬은 같은 파일에 선언된 BOM이 담당한다.
Gradle `8.14.3`은 `gradle-wrapper.properties`, Java 21은 `build.gradle.kts`의 도구 체인 설정에서 관리한다.

## 검증

```bash
./gradlew --version
./gradlew dependencies
./gradlew test
```

## 실행

```bash
./gradlew bootRun
```

현재 애플리케이션에는 웹 API가 없으며 시작할 때 모델을 호출하지 않는다.

## 학습 순서

[학습 가이드](ROADMAP.md)를 따라 LangGraph4j 개념을 한 단계씩 구현한다.
