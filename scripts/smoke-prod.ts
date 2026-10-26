// 배포한 워크벤치를 공개 origin 으로 확인한다. 읽기 요청만 보낸다.
// 사용법: node scripts/smoke-prod.ts https://<공개 origin>
// SMOKE_TOKEN 환경 변수가 있으면 그 토큰으로 GET /api/v1/me 도 본다. 토큰은 출력하지 않는다.
// 검사마다 「통과:」 나 「실패:」 로 시작하는 줄을 찍고, 하나라도 실패하면 종료 코드 1 이다.

const TIMEOUT_MS = 10_000;

type Check = { name: string; run: () => Promise<string | null> };

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function expectStatus(url: string, expected: number, init?: RequestInit): Promise<string | null> {
  const res = await request(url, init);
  await res.body?.cancel();
  return res.status === expected ? null : `상태 ${res.status}, 기대 ${expected}`;
}

async function expectJsonField(url: string, field: string, expected: string): Promise<string | null> {
  const res = await request(url, { headers: { Accept: "application/json" } });
  if (res.status !== 200) {
    await res.body?.cancel();
    return `상태 ${res.status}, 기대 200`;
  }
  const body: unknown = await res.json();
  const actual = body !== null && typeof body === "object" ? (body as Record<string, unknown>)[field] : undefined;
  return actual === expected ? null : `${field} 가 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)}`;
}

export async function smoke(
  origin: string,
  token?: string,
  options: { allowHttp?: boolean } = {},
): Promise<{ ok: boolean; lines: string[] }> {
  const base = origin.replace(/\/+$/, "");
  if (!base.startsWith("https://") && !(options.allowHttp && base.startsWith("http://"))) {
    return { ok: false, lines: [`실패: origin 이 https:// 로 시작하지 않는다(${base})`] };
  }

  const resourceMetadata = `${base}/.well-known/oauth-protected-resource/mcp`;
  const checks: Check[] = [
    { name: "GET /api/health 가 200", run: () => expectStatus(`${base}/api/health`, 200) },
    { name: "토큰 없는 GET /api/v1/ontology 가 401", run: () => expectStatus(`${base}/api/v1/ontology`, 401) },
    {
      name: "토큰 없는 POST /mcp 가 401 이고 WWW-Authenticate 가 resource_metadata 를 담는다",
      run: async () => {
        const res = await request(`${base}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        await res.body?.cancel();
        if (res.status !== 401) return `상태 ${res.status}, 기대 401`;
        const header = res.headers.get("www-authenticate");
        const expected = `Bearer resource_metadata="${resourceMetadata}"`;
        if (header === null) return "WWW-Authenticate 헤더가 없다";
        return header.includes(expected) ? null : `WWW-Authenticate 가 ${header}, 기대 ${expected} 를 담는다`;
      },
    },
    {
      name: "보호 자원 메타데이터의 resource 가 <origin>/mcp",
      run: () => expectJsonField(resourceMetadata, "resource", `${base}/mcp`),
    },
    {
      name: "인가 서버 메타데이터의 issuer 가 <origin>",
      run: () => expectJsonField(`${base}/.well-known/oauth-authorization-server`, "issuer", base),
    },
  ];
  if (token) {
    checks.push({
      name: "SMOKE_TOKEN 으로 GET /api/v1/me 가 200",
      run: () => expectStatus(`${base}/api/v1/me`, 200, { headers: { Authorization: `Bearer ${token}` } }),
    });
  }

  const lines: string[] = [];
  let ok = true;
  for (const check of checks) {
    let problem: string | null;
    try {
      problem = await check.run();
    } catch (error) {
      problem = `요청 실패(${error instanceof Error ? error.message : String(error)})`;
    }
    if (problem === null) {
      lines.push(`통과: ${check.name}`);
    } else {
      ok = false;
      lines.push(`실패: ${check.name}: ${problem}`);
    }
  }
  if (!token) lines.push("건너뜀: SMOKE_TOKEN 없음");
  return { ok, lines };
}

if (import.meta.main) {
  const origin = process.argv[2];
  if (!origin) {
    console.error("사용법: node scripts/smoke-prod.ts https://<공개 origin>");
    process.exit(2);
  }
  const result = await smoke(origin, process.env.SMOKE_TOKEN || undefined);
  for (const line of result.lines) console.log(line);
  process.exit(result.ok ? 0 : 1);
}
