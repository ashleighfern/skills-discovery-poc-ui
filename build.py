#!/usr/bin/env python3
"""Build index.html by embedding data/trial_results.json into src/template.html.

    python3 build.py                     # rebuild from data/trial_results.json
    python3 build.py --from PATH         # first refresh data/trial_results.json from PATH, then rebuild

The page stays a single self-contained file with exactly one inline <script> block;
the data goes inside that block in place of the /*__TRIAL_DATA__*/null placeholder.
"""
import argparse
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "src", "template.html")
DATA = os.path.join(HERE, "data", "trial_results.json")
OUT = os.path.join(HERE, "index.html")

DATA_TOKEN = "/*__TRIAL_DATA__*/null"
SIZE_TOKEN = "__COHORT_SIZE__"
CHECKS = ["is_skill", "not_in_taxonomy", "meets_definition", "market_pulse"]


def validate(d):
    terms = d.get("terms")
    if not isinstance(terms, list) or not terms:
        sys.exit("trial_results.json: no terms")
    if d.get("cohort_size") != len(terms):
        sys.exit(f"trial_results.json: cohort_size {d.get('cohort_size')} != {len(terms)} terms")
    if d.get("check_order") != CHECKS:
        sys.exit(f"trial_results.json: unexpected check_order {d.get('check_order')}")
    ids = [t["id"] for t in terms]
    if len(set(ids)) != len(ids):
        sys.exit("trial_results.json: duplicate term ids")
    for t in terms:
        for c in CHECKS:
            st = t["checks"][c]["status"]
            if st not in ("pass", "fail", "pending"):
                sys.exit(f"term {t['id']}: {c} has unknown status {st!r}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="src", help="copy this trial_results.json into data/ before building")
    a = ap.parse_args()

    if a.src:
        shutil.copyfile(a.src, DATA)
        print(f"refreshed {os.path.relpath(DATA, HERE)} from {a.src}")

    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    validate(data)

    with open(TEMPLATE, encoding="utf-8") as f:
        tpl = f.read()
    for tok in (DATA_TOKEN, SIZE_TOKEN):
        if tpl.count(tok) != 1:
            sys.exit(f"template must contain {tok} exactly once (found {tpl.count(tok)})")

    # Compact, one line; every "<" escaped as < (valid JSON and JS) so no "</script>"
    # or "<!--" inside the data can end or confuse the script block.
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    html = tpl.replace(DATA_TOKEN, blob).replace(SIZE_TOKEN, str(len(data["terms"])))
    if html.count("<script") != 1:
        sys.exit("built page must have exactly one <script> block")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"wrote {os.path.relpath(OUT, HERE)}: {len(data['terms'])} terms, {len(html.encode('utf-8')):,} bytes")


if __name__ == "__main__":
    main()
