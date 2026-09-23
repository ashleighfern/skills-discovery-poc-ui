# Skills Discovery POC — review UI

An interactive review page for the Skills Discovery proof of concept. It shows the
recorded trial results for **304 real candidate terms**, left after removing 34 whose text
was lost or unreadable. Each term was tested by all four checks:

1. **Is it a skill?** — term type, reasoning and confidence
2. **Already in taxonomy?** — closest existing skill and similarity score; duplicates fail
3. **Meets skill definition?** — learnability and demonstrability, backed by real evidence sources (provider, title, link, Local/International, direct/adjacent, quote)
4. **Has market pulse?** — **pending**: job-posting data is not yet available

A term is **FAIL** if any completed check fails. It is **PROVISIONAL** if nothing failed
but market pulse is still pending, so provisional terms may still fail once job-posting
data is added. No term can **PASS** until then.

Reviewers can override any completed check. Each override needs a written reason, and
pending checks cannot be overridden. The page also has a summary, a per-term report and
four CSV exports.

## Open it

- **Locally:** open `index.html` in any browser. It is one self-contained file with no
  network dependencies.
- **GitHub Pages:** push this repo, then go to **Settings → Pages → Build and deployment →
  Deploy from a branch**, and choose branch **`main`** and folder **`/ (root)`**. The page
  is served at `https://<user>.github.io/<repo>/`.
  - GitHub Pages on a **private** repository needs a paid plan (Pro, Team or Enterprise).
    On a free plan the repository must be public for Pages to work.

Overrides live only in the open browser tab. Reloading the page clears them, so export
the CSVs to keep a review.

## Rebuild after the data changes

`index.html` is generated. Do not edit it by hand. Edit `src/template.html` and rebuild:

```
python3 build.py                                   # from data/trial_results.json
python3 build.py --from /path/to/trial_results.json  # refresh data/ first, then build
```

`build.py` embeds `data/trial_results.json` in the page's single `<script>` block.
The copy in `data/` keeps this repo self-contained. The source of truth is the POC's
`trial_results.json`, produced by its `build/assemble.py`.

## Tests

```
node test/verify.js      # prints "RESULT: N/N passed"
```

Node ≥ 18, no packages needed. The suite loads `index.html` headlessly (`test/harness.js`)
and runs on an 8-term real fixture (`test/fixture.json`). It also checks that the embedded
cohort matches `data/trial_results.json` exactly.

After refreshing the data, regenerate the fixture and oracle:

```
python3 test/make_fixture.py
node test/capture-oracle.js > test/oracle.json
```

`test/CHANGES.md` explains how this suite differs from the original mock's.
