## ADR-014: 저장소에는 가치투자 온톨로지 앱 하나만 두고 앱을 루트에 둔다

- **status**: `accepted`
- **결정**: 이 저장소는 친구와 함께 만드는 가치투자 온톨로지 하나만 관리한다. Python GraphRAG 실습(`python-graphrag/`)과 Java 에이전트 실습(`java-agent-lab/`)을 지우고, `financial-workbench/` 아래에 있던 앱(`api/`, `web/`, `docs/`, `ontology/`, `scripts/`, Compose, Dockerfile)을 저장소 루트로 올린다. GitHub 저장소 이름은 `jon890/fos-valuation-ontology`, GHCR 이미지는 `ghcr.io/jon890/fos-valuation-ontology`, 화면 이름은 「가치투자 온톨로지」 다(사용자 결정 2026-10-26).
- **맥락**: 저장소는 여러 실습을 담는 학습 공간으로 시작했고, 워크벤치는 그 안의 세 번째 프로젝트였다. 지금은 워크벤치만 운영에 배포하고 두 사람이 매일 쓴다. 두 실습은 더 고치지 않는데도, 경로마다 `financial-workbench/` 를 붙여야 하고 문서의 버전과 포트 근거가 실습에 기대고 있었다. 저장소 이름 `fos-graphrag` 와 화면 이름 「금융 온톨로지 워크벤치」 는 지금 하는 일(가치투자 논리를 근거와 함께 쌓는 것)을 드러내지 못했다.
- **대안 기각**:

  | 대안 | 기각 이유 |
  | --- | --- |
  | 실습을 남기고 앱만 루트로 올린다 | 루트에 앱과 실습 폴더가 섞여 어느 것이 제품인지 다시 설명해야 한다. 실습은 Git 이력에 남아 필요하면 되살린다 |
  | 앱을 `financial-workbench/` 에 그대로 둔다 | 하위 폴더 하나만 남은 저장소에서 모든 명령과 workflow 가 `cd financial-workbench` 를 계속 거친다 |
  | 운영 서비스 키 `financial-workbench` 도 함께 바꾼다 | 홈서버 서비스 이름, 컨테이너 이름, 볼륨, Hermes 커넥터 id 가 모두 바뀌어 데이터 이전과 다른 저장소의 동시 배포가 필요하다. 사용자에게 보이는 이름만 바꾸면 얻는 것은 같다 |

- **결과**:
  - 얻는 것: 명령과 workflow 를 저장소 루트에서 바로 돌린다. 저장소와 이미지, 화면의 이름이 같은 것을 가리킨다.
  - 감당할 것: 운영 서비스 키, 환경 변수 이름(`WORKBENCH_*`), 코드 패키지(`dev.fos.workbench`), 빌드 이름(`financial-workbench-api`, `financial-workbench-web`)에는 옛 이름 「workbench」 가 남는다. 저장소 이름을 바꾼 뒤 홈서버 Compose(fos-home-infra)의 이미지 이름을 새 이름으로 바꿔야 새 이미지가 배포된다. 옛 이미지 `ghcr.io/jon890/fos-graphrag-workbench` 는 새로 올라가지 않는다.
- **적용 범위**: 디렉터리 배치는 [코드 구조](../code-architecture.md) 의 「전체 배치」, 이미지와 배포는 [배포 문서](../deployment.md) 의 「이미지 배포」 가 소유한다.
