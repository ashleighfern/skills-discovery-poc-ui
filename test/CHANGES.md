# Test suite changes (mock → real-data review UI)

## 2026-09-29 — market pulse switched from pending to live results

`data/trial_results.json` now carries real market-pulse results for all 304 terms (job postings
Aug 2025–Jul 2026, per quarter: high volume or growing demand), so the cohort is 32 PASS /
272 FAIL / 0 PROVISIONAL. The fixture has **9** terms: roles `provisional_a`/`provisional_b`
were renamed `pass_a`/`pass_b` (PASS terms) and `g3_only` (fails market pulse alone) was added.
Oracle regenerated (2 / 0 / 7). Converted: batch outcome and metrics (f3=1, singleFail 5, no
pending); decisive (PASS ⇒ all four decisive, g3_only ⇒ [3]); sole-failure override ⇒ PASS;
market pulse is overridable (switch on 4 checks, reason required, override takes effect,
g3_only override ⇒ PASS and moves between exports); exports (`passed_skills.csv` with passing
quarters + annual postings, failed CSV 16 columns without Pending Checks, audit CSV 36 columns
with Passing Quarters / Annual / Monthly / Note, summary without PROVISIONAL or Pending rows);
status filter PASS; banner wording. Added: market-pulse panel rendering ("passed in" +
quarters + 12-bar sparkline, "not met in any quarter", term 053 "no postings found"), and
DOM-captured checks that Provisional tiles / filter only appear when the count is > 0. The
pending / PROVISIONAL path is kept in one synthetic block (a fixture term copy with
`market_pulse: {status:"pending"}`). §12b: the display-order "failed" key is now
`overall==="FAIL"` (it was `!== "PROVISIONAL"`, which stopped ranking PASS before FAIL).
The tables below describe the earlier (pending-era) migration from the mock.

The original mock's suite ran 143 checks over 8 synthetic samples, pinned to an oracle
captured from the mock. That data is gone from the page. The suite now runs on
`fixture.json`: 8 real terms that `make_fixture.py` picks from `data/trial_results.json`, lowest id first within each role.

| Role | Covers |
|---|---|
| `provisional_a`, `provisional_b` | all completed checks pass, market pulse pending → PROVISIONAL |
| `g0_only` | fails "Is a skill?" alone |
| `g1_only` | fails "Already in taxonomy?" alone (used for the decisive-with-pending checks) |
| `g2_only_learnability`, `g2_only_demonstrability` | fails "Meets skill definition?" alone, one for each failure reason |
| `multi_g1_g2`, `multi_g0_g1_g2` | two and three failures |

`oracle.json` was **regenerated from the new code** (`capture-oracle.js`). It is not the only
guard: sections 2–4 and 12 also check every verdict, and the roll-up for all 304 terms, directly
against the data file. That way the oracle cannot quietly carry a code bug forward.

## What changed per section, and why

| § | Kept intent | Changed |
|---|---|---|
| 1 Structure | GATES/CHECK_NAMES agree, all four gates overridable, 3 steps | Step 1 title is now **Overview**, because there is no submit form any more. Added: GATES keys and labels match the data's `check_order` and `check_labels`, a single `<script>`, charset and viewport meta, no external resources, a 16px phone gutter, and PROVISIONAL colour tokens in all four theme blocks. |
| 2–4 Oracle | Machine verdicts pinned term by term | Pinned per-check **status** (pass/fail/pending), not booleans. The per-quarter P75 check is **removed**: it was computed from synthetic monthly mentions, and market pulse has no data yet. Batch outcome is now 0 PASS / 2 PROVISIONAL / 6 FAIL, not 3/5. Each verdict is also checked against the data. |
| 5 No short-circuit | 4 reached rows, banned strings, removed functions | A row's machine verdict is now a status that may be `pending`. Added a check that a 3-failure term reports all three failures. |
| 6 decisive[] | Hand-computed expectations per term | Keyed by fixture role, not by sample title. The "passing ⇒ all four decisive" rule becomes "not failing ⇒ every **completed** check decisive". A pending check is never decisive. |
| 7 Overrides | Single-fail flip lifts the term; multi-fail flip still fails; pass-flip fails; reason appears in failReason | The sole-failure flip now gives PROVISIONAL, not PASS, because market pulse is pending. The old "market-pulse override now takes effect" check became "taxonomy override takes effect": G3 cannot be overridden while it is pending (see §12). |
| 8 Review gate | Reason enforcement, `queueChanged` routing | The mutation sites are now `init` (load cohort) and **Clear all overrides**, so the count is 3 (was 5). The add, remove, CSV-import and sample-load sites are gone. Added: an attempted override on a pending check does not block the review. |
| 9 CSV | All four files, column and row counts, cell content | `passed_skills.csv` → `passed_and_provisional_skills.csv` (PASS + PROVISIONAL). `failed_skills.csv` goes from 14 to 17 columns (Term ID, Term Type, Similarity, Pending Checks, Status If Decisive Check Overridden, Final Status added; Source/Expert removed; "One Override From Passing?" renamed "One Override From Not Failing?"). `audit_trail.csv` goes from 25 to 34 columns: it adds Term ID, description, data-quality note, term type, confidence, reasoning, similarity, rationale, market-pulse note and pending checks. The audit evidence cells now hold the **real source URLs**, where they used to hold Google-search links. Still no `N/A` cells anywhere: pending is written "Pending" / "No (pending — not overridable)". |
| 10 Metrics | f0..f3, fc1..fc4, singleFail, totals | Adds `provisional`, `p0..p3` and `anyPending`. The **pass-route metrics (both / mpOnly / expOnly) are removed**, because they described synthetic market-pulse and expert-validation data that does not exist. |
| 11 Render | Card open/closed, 4 chips, what-if on each check, decisive marks, evidence/closest/market panels, reason box, report columns | The override switch now appears on **3** checks (pending has none; it was 4). The provisional card shows 3 decisive marks (it was 4 on a passing card). The market-pulse panel shows the pending note in place of the sparkline. The evidence panel is checked for real clickable URLs, one item per source, relevance badges, region groups, the gap note and the rationale, and no Google-search links. Added full-cohort smoke tests: all 304 expanded cards render, and all 3 pages render. |
| 12 **new** Pending / PROVISIONAL | — | Pending is never decisive and never counted as a failure (all 304). The roll-up and failed checks equal the data's `overall` / `failed_checks` for all 304. PROVISIONAL, PASS and FAIL roll-ups are tested; the PASS and G3-FAIL cases use a test-only copy of a real term with market pulse completed. A pending check cannot be overridden. A sole failure with a pending check is decisive, and overriding it gives PROVISIONAL and moves the term between the exports. Every export carries PROVISIONAL in Final Status. The review filters include PROVISIONAL. |
| 13 **new** Data + content | — | The embedded `TRIAL` deep-equals `data/trial_results.json` (304 terms). Fixture terms are verbatim from the data. None of the 8 synthetic sample titles appear, and neither do `generateSignals`, `samples(`, the demo, CSV-import or add-term UI, or Google-search links. The cohort footnote and the market-pulse banner each appear exactly once. There is no 18-term set, and the UI template has no v1/v2. |

## After refreshing the data

```
python3 build.py --from <path>/trial_results.json
python3 test/make_fixture.py
node test/capture-oracle.js > test/oracle.json   # review the diff before committing
node test/verify.js
```
