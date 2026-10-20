"""CLI: python -m eval.run   (API must be running)   |   python -m eval.run --local  (API must be STOPPED: Qdrant lock)"""
import argparse
import asyncio
import os
import sys

import httpx

from app import config as C


def print_table(res: dict) -> None:
    print(f"\n{'#':>2} {'OK':<3} {'ms':>6}  {'top source':<24} question")
    print("-" * 90)
    for i, it in enumerate(res["items"], 1):
        top = it["sources"][0]["doc"] if it["sources"] else "-"
        print(f"{i:>2} {'✓' if it['correct'] else '✗':<3} {it['latency_ms']:>6}  {top:<24} {it['q'][:48]}")
    print("-" * 90)
    print(f"correct {res['correct']}/{res['total']}  accuracy {res['accuracy']:.1%}  "
          f"avg {res['avg_latency_ms']} ms  p95 {res['p95_latency_ms']} ms\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true", help="run in-process (stop the API first)")
    ap.add_argument("--api", default=C.API_BASE_URL)
    a = ap.parse_args()
    if a.local:
        from app import evaluator, rag
        rag.ensure_collection()
        res = asyncio.run(evaluator.run_eval())
    else:
        with httpx.Client(base_url=a.api, timeout=900) as h:
            r = h.post("/api/login", json={"password": os.getenv("APP_PASSWORD", "")})
            r.raise_for_status()
            r = h.post("/api/eval/run", headers={"Authorization": f"Bearer {r.json()['token']}"})
            if r.status_code != 200:
                sys.exit(f"eval failed: {r.status_code} {r.text}")
            res = r.json()
    print_table(res)


if __name__ == "__main__":
    main()
