# 웹 빌드, API 빌드, 실행 이미지를 한 파일에서 만든다. 빌드 컨텍스트는 financial-workbench/ 다.

FROM node:24.15.0-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM eclipse-temurin:21.0.11_10-jdk-noble AS api
WORKDIR /src/api
COPY api/gradlew api/settings.gradle.kts api/build.gradle.kts ./
COPY api/gradle gradle
RUN ./gradlew --no-daemon -q dependencies > /dev/null
COPY ontology /src/ontology
COPY api/src src
RUN ./gradlew --no-daemon -q bootJar

FROM eclipse-temurin:21.0.11_10-jre-noble
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
