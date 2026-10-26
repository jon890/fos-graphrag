import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** 플러그인 안내(plugin/README.md)와 같은 명령. 화면에서 명령 문자열은 여기에만 둔다 */
const MARKETPLACE = "jon890/fos-valuation-ontology";
const CLAUDE_ADD = `/plugin marketplace add ${MARKETPLACE}`;
const CLAUDE_INSTALL =
  "/plugin install valuation-ontology@fos-valuation-ontology";
const CODEX_ADD = `codex plugin marketplace add ${MARKETPLACE}`;
const CODEX_INSTALL =
  "codex plugin add valuation-ontology@fos-valuation-ontology";
const CODEX_LOGIN = "codex mcp login valuation-ontology";
const CONNECT_PHRASE = "가치투자 온톨로지 연결해 줘";

const COPIED_MS = 2000;

type Step = { before: string; command?: string; after: string };

const CLAUDE_STEPS: Step[] = [
  { before: "Claude Code 에 ", command: CLAUDE_ADD, after: " 를 입력합니다." },
  { before: "", command: CLAUDE_INSTALL, after: " 를 입력합니다." },
  { before: `「${CONNECT_PHRASE}」 라고 말합니다.`, after: "" },
  {
    before: "브라우저가 열리면 Google 로 로그인하고 「연결 허용」 을 누릅니다.",
    after: "",
  },
];

const CODEX_STEPS: Step[] = [
  { before: "터미널에서 ", command: CODEX_ADD, after: " 를 실행합니다." },
  { before: "", command: CODEX_INSTALL, after: " 를 실행합니다." },
  { before: `Codex 에서 「${CONNECT_PHRASE}」 라고 말합니다.`, after: "" },
  {
    before: "브라우저가 열리지 않으면 터미널에서 ",
    command: CODEX_LOGIN,
    after: " 를 실행합니다.",
  },
];

/** 명령 한 줄과 「복사」. 클립보드를 쓸 수 없으면 명령 글자를 선택해 직접 복사하게 둔다 */
function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <span className="inline-flex max-w-full items-center gap-2 align-middle">
      <code
        className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 text-xs"
        data-testid="install-command"
        data-command={command}
      >
        {command}
      </code>
      <Button
        type="button"
        variant="outline"
        size="xs"
        data-testid="install-copy"
        onClick={() => void copy()}
      >
        {copied ? "복사했습니다" : "복사"}
      </Button>
    </span>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="m-0 grid gap-2 pl-5 text-sm">
      {steps.map((step, i) => (
        <li key={i}>
          {step.before}
          {step.command && <CommandLine command={step.command} />}
          {step.after}
        </li>
      ))}
    </ol>
  );
}

/** 「Claude Code·Codex 에서 쓰기」. 규칙은 docs/flow.md 「연동」 */
export function InstallGuide() {
  return (
    <section data-testid="integrations-install">
      <h2 className="m-0 mb-1 text-lg font-bold">
        Claude Code·Codex 에서 쓰기
      </h2>
      <p className="my-2 text-xs text-muted-foreground">
        Claude Code 나 Codex 에 플러그인을 설치하고 로그인하면 대화로 가치투자
        온톨로지를 찾아보고 고칠 수 있습니다.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div
          className="min-w-0 rounded-md border p-3"
          data-testid="install-claude"
        >
          <h3 className="m-0 mb-2 text-sm font-bold">Claude Code</h3>
          <Steps steps={CLAUDE_STEPS} />
        </div>
        <div
          className="min-w-0 rounded-md border p-3"
          data-testid="install-codex"
        >
          <h3 className="m-0 mb-2 text-sm font-bold">Codex</h3>
          <Steps steps={CODEX_STEPS} />
        </div>
      </div>
      <p className="my-2 text-xs text-muted-foreground">
        기록과 고치기까지 하려면 로그인할 때 「조회와 기록」 을 고르세요.
        에이전트가 올린 변경은 더보기의 「제안」 에서 승인해야 반영됩니다.
      </p>
    </section>
  );
}
