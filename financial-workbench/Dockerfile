# 웹 빌드, API 빌드, 실행 이미지를 한 파일에서 만든다. 빌드 컨텍스트는 financial-workbench/ 다.

# 베이스 이미지는 태그와 함께 digest 로 고정한다(2026-10-20 pull 로 확인한 index digest)
FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM eclipse-temurin:21.0.11_10-jdk-noble@sha256:8a79c84cdf6967ae437eba13c8859d74d41aeccb1e65a42191ca57b1992ad0b8 AS api
WORKDIR /src/api
COPY api/gradlew api/settings.gradle.kts api/build.gradle.kts ./
COPY api/gradle gradle
RUN ./gradlew --no-daemon -q dependencies > /dev/null
COPY ontology /src/ontology
COPY api/src src
RUN ./gradlew --no-daemon -q bootJar

FROM eclipse-temurin:21.0.11_10-jre-noble@sha256:b251c6e60516a48d6511a33b9afc2f8b1a427e53a598b16c1f29390c9bf916bd
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home workbench
WORKDIR /app
COPY --from=api /src/api/build/libs/*.jar /app/app.jar
COPY --from=web /src/web/dist /app/static
USER workbench
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
