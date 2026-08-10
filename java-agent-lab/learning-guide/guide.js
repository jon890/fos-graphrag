const lessons = [
  ["00", "LangGraph4j 개념 지도", "00-langgraph4j-concepts.html"],
  ["01", "State와 Channel", "01-state-and-channel.html"],
  ["02", "단일 Node", "02-single-node.html"],
  ["03", "START와 END", "03-basic-edges.html"],
  ["04", "여러 Node 연결", "04-state-flow.html"],
  ["05", "조건부 Edge", "05-conditional-edge.html"],
  ["06", "반복과 종료 조건", "06-loop-and-limit.html"],
  ["07", "병렬 실행과 Reducer", "07-parallel-and-reducer.html"],
  ["08", "Spring AI Node", "08-spring-ai-node.html"],
  ["09", "Checkpoint와 재개", "09-checkpoint.html"],
  ["10", "승인과 Subgraph", "10-approval-and-subgraph.html"],
];

const current = document.body.dataset.lesson ?? "index";
const sidebar = document.querySelector("[data-sidebar]");

if (sidebar) {
  const links = lessons
    .map(([number, title, href]) => `
      <a class="nav-link ${current === number ? "active" : ""}" href="${href}">
        <span class="nav-number">${number}</span>
        <span>${title}</span>
      </a>
    `)
    .join("");

  sidebar.innerHTML = `
    <a class="brand" href="index.html">
      <strong>LangGraph4j Lab</strong>
      <span>직접 타이핑하는 학습 가이드</span>
    </a>
    <nav class="nav-list" aria-label="학습 단계">${links}</nav>
  `;
}

const footer = document.querySelector("[data-lesson-footer]");
if (footer && current !== "index") {
  const index = lessons.findIndex(([number]) => number === current);
  const previous = lessons[index - 1];
  const next = lessons[index + 1];

  footer.innerHTML = `
    <span>${previous ? `<a href="${previous[2]}">← ${previous[0]}. ${previous[1]}</a>` : ""}</span>
    <span>${next ? `<a href="${next[2]}">${next[0]}. ${next[1]} →</a>` : `<a href="index.html">목차로 돌아가기</a>`}</span>
  `;
}
