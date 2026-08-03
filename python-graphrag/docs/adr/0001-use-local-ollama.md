# 로컬 언어 모델은 Ollama로 실행한다

## 맥락

GraphRAG 학습 과정에서 LLM 호출 비용과 외부 API 키 없이 모델 연결부터 실습해야 한다.
주 개발 환경은 Apple Silicon Mac이며 소형 NVIDIA Nemotron 계열을 사용하려 한다.

## 결정

Ollama를 macOS 호스트에서 실행하고 LangChain의 `ChatOllama`로 연결한다.
기본 모델은 `nemotron-3-nano:4b`로 한다.

## 기각한 대안

- NVIDIA 호스팅 API는 로컬 연산 부담이 없지만 별도 API 키와 외부 서비스 의존이 필요하다.
- Ollama Docker 컨테이너는 Neo4j와 실행 방식을 통일할 수 있지만 macOS의 로컬 가속 활용에 불리하다.
- `nemotron-3-nano:30b`는 품질 여지가 크지만 학습용 연결 확인에 24GB 모델 다운로드는 과하다.

## 결과

모델 추론 비용은 발생하지 않지만 모델 파일 저장 공간과 로컬 메모리·연산 시간을 사용한다.
Ollama 설치와 모델 다운로드는 Neo4j Compose 수명 주기와 별도로 관리한다.
