# 가치투자 온톨로지 플러그인

Claude Code 나 Codex 에서 대화로 가치투자 온톨로지를 찾아보고, 항목과 온톨로지 정의를 고치는 제안을 올리는 플러그인입니다.

## Claude Code 에 설치하기

Claude Code 에 아래 두 줄을 차례로 입력합니다.

```
/plugin marketplace add jon890/fos-valuation-ontology
/plugin install valuation-ontology@fos-valuation-ontology
```

## 처음 쓰기

1. Claude Code 에 「가치투자 온톨로지 연결해 줘」 라고 말합니다.
2. 브라우저가 열립니다.
3. Google 계정으로 로그인합니다.
4. 「연결 허용」 을 누릅니다. 기록까지 하려면 「조회와 기록」 을 고릅니다.
5. 앱으로 돌아와 「안전마진이 뭐야」 처럼 물어봅니다.

## Codex 에 설치하기

터미널에서 아래 두 줄을 차례로 실행합니다.

```bash
codex plugin marketplace add jon890/fos-valuation-ontology
codex plugin add valuation-ontology@fos-valuation-ontology
```

설치하면 연결 주소가 함께 등록됩니다. 그다음에는 Codex 에서 「가치투자 온톨로지 연결해 줘」 라고 말하면 됩니다.
브라우저가 열리지 않으면 터미널에서 `codex mcp login valuation-ontology` 를 실행합니다.

## 연결 끊기

웹 앱 오른쪽 위 「더보기」 에서 「연동」 을 열고, 「연결된 앱」 에서 끊을 연결의 「연결 끊기」 를 누릅니다.

## 막혔을 때

| 증상 | 할 일 |
| --- | --- |
| 브라우저가 열리지 않습니다 | Claude Code 에서 `/mcp` 를 입력하고 `valuation-ontology` 를 골라 로그인합니다. Codex 에서는 위의 `codex mcp login` 을 실행합니다 |
| 「접근 권한이 없습니다」 가 나옵니다 | 관리자에게 본인의 Gmail 을 추가해 달라고 부탁합니다 |
| 기록이 「조회만 허락된 연결」 이라며 막힙니다 | 웹 앱의 「더보기 → 연동」 에서 연결을 끊고, 다시 로그인해 「조회와 기록」 을 고릅니다 |
