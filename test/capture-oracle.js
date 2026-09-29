// Snapshots the machine-verdict contract for the 9-term real fixture from the CURRENT build.
//   node test/capture-oracle.js > test/oracle.json
// verify.js asserts the build against this snapshot term by term. Regenerate it only when a
// verdict change is intended (e.g. after refreshing the data and re-running make_fixture.py).
const fs = require("fs"), path = require("path");
const {load} = require(path.join(__dirname, "harness.js"));
const {api} = load(path.join(__dirname, "..", "index.html"));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture.json"), "utf8"));

const res = api.setQueue(api.toQueue(fixture.terms));
const out = { roles: fixture.roles, terms: res.map(r=>{
  const g = r.gateRows.map(x=>x.machine);
  return {
    id: r.sk.id, title: r.sk.title,
    machineStatus: g.map(x=>x.status),
    g0detail: g[0].detail,
    g1matched: g[1].matched, g1closest: g[1].closest, g1similarity: g[1].similarity,
    learnable: g[2].learnable, demonstrable: g[2].demonstrable, g2failureReason: g[2].failureReason,
    status: r.status, failedChecks: r.failedChecks, pendingChecks: r.pendingChecks,
    decisive: r.decisive, failReason: r.failReason,
  };
})};
out.summary = { PASS: res.filter(r=>r.status==="PASS").length, PROVISIONAL: res.filter(r=>r.status==="PROVISIONAL").length,
                FAIL: res.filter(r=>r.status==="FAIL").length };
out.metrics = api.metrics();
console.log(JSON.stringify(out, null, 2));
