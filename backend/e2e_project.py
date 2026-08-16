"""End-to-end flow test: create a NEW research project via the API and collect real data.

Usage: python e2e_project.py
"""
import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8000"


def req(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(r, timeout=180) as resp:
        return resp.status, json.loads(resp.read())


def main() -> int:
    name = "Multimodal Agents"
    status, project = req(
        "POST",
        "/api/projects",
        {
            "name": name,
            "description": "Agents that perceive and act across vision, language and action.",
            "query": "multimodal LLM agents",
        },
    )
    assert status == 201, f"create failed: {status}"
    pid = project["id"]
    print(f"created project id={pid} slug={project['slug']}")

    status, _ = req("POST", f"/api/projects/{pid}/collect")
    print(f"collect trigger -> {status}")
    assert status == 202

    final = None
    for i in range(300):
        time.sleep(3)
        status, detail = req("GET", f"/api/projects/{pid}")
        if detail["status"] in ("ready", "error"):
            final = detail
            break
        if i % 15 == 0:
            print(f"  polling... status={detail['status']}")
    assert final is not None, "collection did not finish in time"
    print(f"final: status={final['status']} papers={final['paper_count']}")
    assert final["status"] == "ready", f"collection failed: {final.get('error')}"
    assert final["paper_count"] > 20, "too few papers collected"

    # verify a downstream page payload works for the new project
    status, overview = req("GET", f"/api/projects/{pid}/overview")
    assert status == 200
    print(
        f"overview ok: papers={overview['stats']['papers']} topics={overview['stats']['topics']} "
        f"gaps={overview['stats']['gaps']} graph_nodes={len(overview['graph']['nodes'])}"
    )

    print("E2E PROJECT FLOW: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
