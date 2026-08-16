"""API smoke test against a running backend (uses the live database).

Usage: python smoke.py [base_url]
"""
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=60) as r:
        return r.status, json.loads(r.read())


def check(name, path, assert_fn=None, show=None):
    try:
        status, data = get(path)
        ok = status == 200
        if ok and assert_fn:
            ok = bool(assert_fn(data))
        print(f"{'PASS' if ok else 'FAIL'}  {status}  {name}  {show(data) if show else ''}")
        return ok, data
    except Exception as e:
        print(f"FAIL  ERR  {name}  {type(e).__name__}: {str(e)[:120]}")
        return False, None


def main():
    results = []
    results.append(check("health", "/api/health", lambda d: d["status"] == "ok"))
    results.append(check("projects", "/api/projects", lambda d: isinstance(d, list) and len(d) >= 1,
                         lambda d: f"{len(d)} project(s)"))
    _, projects = results[-1]
    pid = projects[0]["id"] if projects else 1

    results.append(check("project detail", f"/api/projects/{pid}",
                         lambda d: d["status"] == "ready" and d["paper_count"] > 0,
                         lambda d: f"status={d['status']} papers={d['paper_count']}"))
    results.append(check("papers list", f"/api/projects/{pid}/papers?page_size=5",
                         lambda d: len(d["items"]) > 0 and d["total"] > 0,
                         lambda d: f"total={d['total']}"))
    _, plist = results[-1]
    paper_id = plist["items"][0]["id"] if plist and plist["items"] else 1
    results.append(check("paper detail", f"/api/projects/{pid}/papers/{paper_id}",
                         lambda d: d["title"] and "related" in d,
                         lambda d: f"'{d.get('title','')[:40]}'"))
    results.append(check("papers search", f"/api/projects/{pid}/papers?q=agent&sort=cited&order=desc",
                         lambda d: d["total"] > 0, lambda d: f"total={d['total']}"))
    results.append(check("authors", f"/api/projects/{pid}/authors",
                         lambda d: len(d) > 0 and d[0]["paper_count"] > 0,
                         lambda d: f"{len(d)} authors"))
    results.append(check("topics", f"/api/projects/{pid}/topics",
                         lambda d: len(d) > 0, lambda d: f"{len(d)} topics"))
    results.append(check("timeline", f"/api/projects/{pid}/timeline",
                         lambda d: len(d.get("years", [])) > 0,
                         lambda d: f"years={d.get('years')[:3]} milestones={len(d.get('milestones', []))}"))
    results.append(check("graph", f"/api/projects/{pid}/graph",
                         lambda d: len(d["nodes"]) > 0 and len(d["edges"]) > 0,
                         lambda d: f"nodes={len(d['nodes'])} edges={len(d['edges'])}"))
    _, g = results[-1]
    if g:
        rels = sorted({e["data"]["relation"] for e in g["edges"]})
        types = sorted({n["data"]["type"] for n in g["nodes"]})
        print(f"      graph node types: {types}")
        print(f"      graph relations:  {rels}")
    results.append(check("analysis", f"/api/projects/{pid}/analysis",
                         lambda d: d.get("overview") and d.get("roadmap"),
                         lambda d: f"model={d.get('model')} phases={len(d.get('roadmap',{}).get('phases',[]))}"))
    results.append(check("gaps", f"/api/projects/{pid}/gaps",
                         lambda d: len(d) > 0,
                         lambda d: f"{len(d)} gaps, signals={sorted({x['signal'] for x in d})}"))
    results.append(check("overview", f"/api/projects/{pid}/overview",
                         lambda d: d["stats"]["papers"] > 0 and d["graph"]["nodes"],
                         lambda d: f"papers={d['stats']['papers']} authors={d['stats']['authors']} topics={d['stats']['topics']} gaps={d['stats']['gaps']}"))

    failed = [r for r in results if not r[0]]
    print()
    print(f"SMOKE: {len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
