#!/usr/bin/env python3
"""Pick 8 REAL terms from data/trial_results.json that cover every roll-up combination
the tests need, and write them to test/fixture.json. Deterministic: within each role the
lowest term id wins.

    python3 test/make_fixture.py

Re-run after data/trial_results.json is refreshed, then regenerate the oracle:
    node test/capture-oracle.js > test/oracle.json
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "trial_results.json")
OUT = os.path.join(HERE, "fixture.json")

# role -> predicate over a term. Order here is the fixture order.
ROLES = [
    ("provisional_a", lambda t: t["failed_checks"] == []),
    ("provisional_b", lambda t: t["failed_checks"] == []),
    ("g0_only", lambda t: t["failed_checks"] == ["is_skill"]),
    ("g1_only", lambda t: t["failed_checks"] == ["not_in_taxonomy"]),
    ("g2_only_learnability", lambda t: t["failed_checks"] == ["meets_definition"]
        and t["checks"]["meets_definition"]["failure_reason"] == "Learnability not met"),
    ("g2_only_demonstrability", lambda t: t["failed_checks"] == ["meets_definition"]
        and t["checks"]["meets_definition"]["failure_reason"] == "Demonstrability not met"),
    ("multi_g1_g2", lambda t: t["failed_checks"] == ["not_in_taxonomy", "meets_definition"]),
    ("multi_g0_g1_g2", lambda t: t["failed_checks"] == ["is_skill", "not_in_taxonomy", "meets_definition"]),
]


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    terms = sorted(data["terms"], key=lambda t: t["id"])
    used, roles, picked = set(), {}, []
    for role, pred in ROLES:
        hit = next((t for t in terms if t["id"] not in used and pred(t)), None)
        if hit is None:
            sys.exit(f"no term in the data fits role {role!r}")
        used.add(hit["id"])
        roles[role] = hit["id"]
        picked.append(hit)
    # Every fixture term must have market pulse pending, as the whole cohort does today.
    assert all(t["checks"]["market_pulse"]["status"] == "pending" for t in picked)
    out = {"source": "data/trial_results.json", "roles": roles, "terms": picked}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    for role, tid in roles.items():
        t = next(x for x in picked if x["id"] == tid)
        print(f"{role:26s} {tid}  {t['overall']:11s} {t['title']}")


if __name__ == "__main__":
    main()
