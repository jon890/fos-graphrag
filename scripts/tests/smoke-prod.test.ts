// smoke-prod.ts 를 로컬 가짜 HTTP 서버로 검사한다. 운영 주소에는 요청을 보내지 않는다.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { smoke } from "../smoke-prod.ts";

type Handler = (req: IncomingMessage, res: ServerResponse, origin: string) => boolean;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// 운영 서버처럼 응답한다. override 가 true 를 돌려주면 그 요청은 override 가 답한 것으로 본다
async function withServer(
  override: Handler | null,
  body: (origin: string, seen: { meAuthorization?: string }) => Promise<void>,
): Promise<void> {
  const seen: { meAuthorization?: string } = {};
  let origin = "";
  const server = createServer((req, res) => {
    if (override?.(req, res, origin)) return;
    const auth = req.headers.authorization;
    switch (`${req.method} ${req.url}`) {
      case "GET /api/health":
        return json(res, 200, { status: "UP" });
      case "GET /api/v1/ontology":
        return json(res, auth ? 200 : 401, {});
      case "POST /mcp":
        res.writeHead(401, {
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="read write"`,
        });
        return res.end();
      case "GET /.well-known/oauth-protected-resource/mcp":
        return json(res, 200, { resource: `${origin}/mcp` });
      case "GET /.well-known/oauth-authorization-server":
        return json(res, 200, { issuer: origin, code_challenge_methods_supported: ["S256"] });
      case "GET /api/v1/me":
        seen.meAuthorization = auth;
        return json(res, auth === "Bearer test-token" ? 200 : 401, {});
      default:
        return json(res, 404, {});
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await body(origin, seen);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("모든 응답이 맞으면 통과하고 토큰이 없으면 /api/v1/me 를 건너뛴다", async () => {
  await withServer(null, async (origin, seen) => {
    const result = await smoke(origin, undefined, { allowHttp: true });
    assert.equal(result.ok, true, result.lines.join("\n"));
    assert.ok(result.lines.every((l) => l.startsWith("통과:") || l.startsWith("건너뜀:")), result.lines.join("\n"));
    assert.ok(result.lines.includes("건너뜀: SMOKE_TOKEN 없음"), result.lines.join("\n"));
    assert.equal(seen.meAuthorization, undefined);
  });
});

test("토큰을 주면 /api/v1/me 에 Authorization 헤더가 실리고 통과한다", async () => {
  await withServer(null, async (origin, seen) => {
    const result = await smoke(`${origin}/`, "test-token", { allowHttp: true });
    assert.equal(result.ok, true, result.lines.join("\n"));
    assert.equal(seen.meAuthorization, "Bearer test-token");
    assert.ok(result.lines.some((l) => l.startsWith("통과:") && l.includes("/api/v1/me")), result.lines.join("\n"));
    assert.ok(result.lines.every((l) => !l.includes("test-token")), "출력에 토큰 원문이 있다");
  });
});

test("issuer 가 다른 origin 이면 그 줄이 실패다", async () => {
  const wrongIssuer: Handler = (req, res) => {
    if (req.url !== "/.well-known/oauth-authorization-server") return false;
    json(res, 200, { issuer: "http://other.example" });
    return true;
  };
  await withServer(wrongIssuer, async (origin) => {
    const result = await smoke(origin, undefined, { allowHttp: true });
    assert.equal(result.ok, false);
    const line = result.lines.find((l) => l.includes("issuer"));
    assert.ok(line?.startsWith("실패:"), `issuer 줄: ${line}`);
    assert.ok(line?.includes("http://other.example"), `issuer 줄에 실제 값이 없다: ${line}`);
  });
});

test("POST /mcp 가 401 이어도 WWW-Authenticate 가 없으면 실패다", async () => {
  const noHeader: Handler = (req, res) => {
    if (req.url !== "/mcp") return false;
    res.writeHead(401);
    res.end();
    return true;
  };
  await withServer(noHeader, async (origin) => {
    const result = await smoke(origin, undefined, { allowHttp: true });
    assert.equal(result.ok, false);
    const line = result.lines.find((l) => l.includes("POST /mcp"));
    assert.ok(line?.startsWith("실패:"), `POST /mcp 줄: ${line}`);
  });
});

test("http:// origin 은 allowHttp 없이 요청 없이 바로 실패한다", async () => {
  let requests = 0;
  const counter: Handler = () => {
    requests += 1;
    return false;
  };
  await withServer(counter, async (origin) => {
    const result = await smoke(origin);
    assert.equal(result.ok, false);
    assert.equal(result.lines.length, 1, result.lines.join("\n"));
    assert.ok(result.lines[0].startsWith("실패:"), result.lines[0]);
    assert.equal(requests, 0, "allowHttp 없이 http origin 에 요청을 보냈다");
  });
});

test("인가 서버 메타데이터에 S256 이 없으면 그 줄이 실패다", async () => {
  const plainOnly: Handler = (req, res, origin) => {
    if (req.url !== "/.well-known/oauth-authorization-server") return false;
    json(res, 200, { issuer: origin, code_challenge_methods_supported: ["plain"] });
    return true;
  };
  await withServer(plainOnly, async (origin) => {
    const result = await smoke(origin, undefined, { allowHttp: true });
    assert.equal(result.ok, false);
    const line = result.lines.find((l) => l.includes("code_challenge_methods_supported"));
    assert.ok(line?.startsWith("실패:"), `S256 줄: ${line}`);
  });
});

// 배포 스크립트처럼 파일을 직접 실행했을 때 검사를 돌리고 종료 코드로 알리는지 본다
const script = new URL("../smoke-prod.ts", import.meta.url).pathname;

test("직접 실행하면 검사를 돌리고 실패를 종료 코드 1 로 알린다", () => {
  const run = spawnSync(process.execPath, [script, "http://127.0.0.1:9"], { encoding: "utf8" });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.stdout.includes("실패:"), run.stdout);
});

test("직접 실행할 때 origin 이 없으면 종료 코드 2 다", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(run.status, 2, run.stdout + run.stderr);
});
