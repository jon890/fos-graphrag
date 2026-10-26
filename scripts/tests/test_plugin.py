#!/usr/bin/env python3
"""플러그인 파일의 형식을 검사한다. 실패하면 이유를 한 줄씩 찍고 종료 코드 1 이다.

--self-test: plugin/ 을 임시 디렉터리에 복사해 .mcp.json 의 type 을 틀리게 바꾸고, 검사가 실패하는지 본다.
"""
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

REPO = Path(__file__).resolve().parents[2]
TOOL_NAME = re.compile(r"`((?:get|search|trace|lookup|list|record|submit|propose)_[a-z_]+)`")


def load_json(path, errors):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        errors.append(f"{path}: JSON 을 읽을 수 없다 ({e})")
        return None


def frontmatter(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return {}
    result = {}
    for line in m.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep:
            result[key.strip()] = value.strip()
    return result


def origin(url):
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def contract_tools():
    text = (REPO / "docs/api-contract.md").read_text(encoding="utf-8")
    section = re.search(r"^## 원격 MCP\(`/mcp`\)\n(.*?)(?=^## )", text, re.S | re.M).group(1)
    return set(re.findall(r"^\| `([a-z_]+)` \|", section, re.M))


def check(repo):
    errors = []
    market_path = repo / ".claude-plugin/marketplace.json"
    market = load_json(market_path, errors)
    if market:
        for entry in market.get("plugins", []):
            src = repo / entry.get("source", "")
            if not src.is_dir():
                errors.append(f"마켓플레이스 source 가 디렉터리가 아니다: {entry.get('source')}")
                continue
            for manifest in (".claude-plugin/plugin.json", ".codex-plugin/plugin.json"):
                info = load_json(src / manifest, errors) if (src / manifest).is_file() else None
                if info is None:
                    errors.append(f"{src.name}/{manifest} 가 없다")
                elif info.get("name") != entry.get("name"):
                    errors.append(f"{manifest} 의 name {info.get('name')!r} 이 마켓플레이스의 {entry.get('name')!r} 과 다르다")

    plugin = repo / "plugin"
    codex = load_json(plugin / ".codex-plugin/plugin.json", errors)
    skill_dirs = sorted(p.name for p in (plugin / "skills").iterdir() if p.is_dir())
    if codex:
        listed = [s.removeprefix("./") for s in codex.get("skills", [])]
        for s in listed:
            if not (plugin / s / "SKILL.md").is_file():
                errors.append(f"codex skills 경로에 SKILL.md 가 없다: {s}")
        for d in skill_dirs:
            if f"skills/{d}" not in listed:
                errors.append(f"skills/{d} 가 codex skills 에 없다")

    tools = contract_tools()
    if not tools:
        errors.append("docs/api-contract.md 에서 도구 표를 찾지 못했다")
    for d in skill_dirs:
        text = (plugin / "skills" / d / "SKILL.md").read_text(encoding="utf-8")
        fm = frontmatter(text)
        if fm.get("name") != d:
            errors.append(f"skills/{d}: 머리말 name {fm.get('name')!r} 이 디렉터리 이름과 다르다")
        if not fm.get("description"):
            errors.append(f"skills/{d}: 머리말 description 이 비었다")
        for name in sorted(set(TOOL_NAME.findall(text)) - tools):
            errors.append(f"skills/{d}: 도구 표에 없는 도구 이름 {name}")

    mcp = load_json(plugin / ".mcp.json", errors)
    health = re.search(r"^HEALTH_URL=(\S+)", (REPO / "scripts/deploy-prod.sh").read_text(encoding="utf-8"), re.M)
    if mcp:
        for name, server in mcp.get("mcpServers", {}).items():
            url = server.get("url", "")
            if server.get("type") != "http":
                errors.append(f".mcp.json {name}: type 이 http 가 아니다 ({server.get('type')!r})")
            if not (url.startswith("https://") and url.endswith("/mcp")):
                errors.append(f".mcp.json {name}: url 이 https:// 로 시작해 /mcp 로 끝나야 한다 ({url!r})")
            elif health and origin(url) != origin(health.group(1)):
                errors.append(f".mcp.json {name}: origin {origin(url)} 이 deploy-prod.sh 의 HEALTH_URL origin 과 다르다")
    return errors


def report(errors):
    for e in errors:
        print(f"위반: {e}")
    return 1 if errors else 0


def self_test():
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copytree(REPO / "plugin", Path(tmp) / "plugin")
        shutil.copytree(REPO / ".claude-plugin", Path(tmp) / ".claude-plugin")
        mcp = Path(tmp) / "plugin/.mcp.json"
        data = json.loads(mcp.read_text(encoding="utf-8"))
        for server in data["mcpServers"].values():
            server["type"] = "stdio"
        mcp.write_text(json.dumps(data), encoding="utf-8")
        errors = check(Path(tmp))
    if any("type 이 http 가 아니다" in e for e in errors):
        print("통과: 틀린 type 을 검사가 잡는다")
        return 0
    print("위반: 틀린 type 을 검사가 잡지 못했다")
    return 1


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    code = report(check(REPO))
    if code == 0:
        print("통과: 플러그인 형식")
    sys.exit(code)
