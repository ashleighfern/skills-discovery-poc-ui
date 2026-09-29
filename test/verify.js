// Verification suite for the Skills Discovery review UI (index.html).
//   node test/verify.js            (from the site/ folder, or with any cwd)
// Sections 1-11 keep the intent of the original mock's suite, rebuilt on a 9-term REAL
// fixture (test/fixture.json: 2 PASS terms, 7 FAIL terms incl. one failing market pulse alone)
// instead of synthetic samples. Market pulse now has real job-posting results for every term,
// so the real cohort is PASS / FAIL only. Section 12 covers the market-pulse roll-up and keeps
// the generic pending / PROVISIONAL path alive with one synthetic term; 12b the display order;
// 13 the embedded-data and content checks. See CHANGES.md.
const fs = require("fs"), path = require("path");
const DIR = __dirname, SITE = path.join(DIR, "..");
const {load, parseCSV, fakeEl} = require(path.join(DIR, "harness.js"));
const HTML = path.join(SITE, "index.html");
const {api, csv, html: src, sandbox} = load(HTML);
const fixture = JSON.parse(fs.readFileSync(path.join(DIR, "fixture.json"), "utf8"));
const golden  = JSON.parse(fs.readFileSync(path.join(DIR, "oracle.json"), "utf8"));
const DATA    = JSON.parse(fs.readFileSync(path.join(SITE, "data", "trial_results.json"), "utf8"));
const TEMPLATE = fs.readFileSync(path.join(SITE, "src", "template.html"), "utf8");

let fails = 0, checks = 0;
const ok  = (name, cond, extra) => { checks++; if(!cond){ fails++; console.log("  FAIL  " + name + (extra?"  ->  "+extra:"")); } else console.log("  pass  " + name); };
const eq  = (name, a, b) => ok(name, JSON.stringify(a)===JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const hdr = t => console.log("\n== " + t + " ==");
const idxs = arr => arr.map((d,i)=>d?i:-1).filter(i=>i>=0);
function deepEqual(a,b){
  if(a===b) return true;
  if(typeof a!==typeof b || a===null || b===null || typeof a!=="object") return false;
  if(Array.isArray(a)!==Array.isArray(b)) return false;
  const ka=Object.keys(a), kb=Object.keys(b);
  if(ka.length!==kb.length) return false;
  return ka.every(k=>Object.prototype.hasOwnProperty.call(b,k) && deepEqual(a[k],b[k]));
}

const CHECK_KEYS = DATA.check_order;                        // is_skill, not_in_taxonomy, meets_definition, market_pulse
const ROLE = fixture.roles;                                  // role -> term id
const fresh = () => api.setQueue(api.toQueue(fixture.terms));
const byId = (res, id) => res.find(r=>r.sk.id===id);
const T = role => fixture.terms.find(t=>t.id===ROLE[role]);
function withOverride(role, gi, reason){
  const q = api.toQueue(fixture.terms);
  const t = q.find(x=>x.id===ROLE[role]);
  t.overrides = {[gi]: true};
  if(reason!==undefined) t.overrideReasons = {[gi]: reason};
  return byId(api.setQueue(q), ROLE[role]);
}
// Runs a DOM-driven renderer with a memoising querySelector so the rendered elements can be read back.
function captureDOM(fn){
  const doc = sandbox.document, orig = doc.querySelector, els = {};
  doc.querySelector = s => els[s] || (els[s] = fakeEl("div"));
  try { fn(); } finally { doc.querySelector = orig; }
  return els;
}
const pageHTML = els => ((els["#pageHost"]||{}).children||[]).map(c=>c.innerHTML).join("");

// ---------------------------------------------------------------- 1. structure
hdr("1. Structure / config");
eq("GATES overridable = all four (a pending row would still be gated per term, not per check)", api.GATES.map(g=>g.ov), [true,true,true,true]);
eq("STEPS = 3", api.STEPS.length, 3);
eq("STEPS titles", api.STEPS.map(s=>s.t), ["Overview","Review all checks","Summary"]);
eq("GATES questions == CHECK_NAMES", api.GATES.map(g=>g.q), api.CHECK_NAMES);
eq("CHECK_NAMES normalised", api.CHECK_NAMES,
   ["Is a skill?","Already in taxonomy?","Meets skill definition?","Has market pulse?"]);
eq("GATES keys follow the data's check_order", api.GATES.map(g=>g.key), CHECK_KEYS);
eq("GATES labels match the data's check_labels", api.GATES.map(g=>g.q), CHECK_KEYS.map(k=>DATA.check_labels[k]));
eq("exactly one <script> block", (src.match(/<script/g)||[]).length, 1);
ok("meta charset utf-8", /<meta charset="utf-8">/i.test(src));
ok("meta viewport (phone width)", /<meta name="viewport" content="width=device-width, initial-scale=1">/.test(src));
ok("self-contained: no external script / stylesheet / font", !/<(script|link)[^>]+(src|href)=["']?https?:/i.test(src) && !/@import|url\(\s*["']?https?:/i.test(src));
ok("16px side gutter at phone width", /@media \(max-width:640px\)\{ \.wrap \{ padding:0 16px; \}/.test(src));
ok("dark theme tokens incl. PROVISIONAL colour", (src.match(/--prov:/g)||[]).length===4 && src.includes("@media (prefers-color-scheme: dark)"));

// ------------------------------------------------- 2/3/4. oracle preservation
hdr("2-4. Machine-verdict oracle (real fixture)");
const res = fresh();
eq("term count", res.length, golden.terms.length);
eq("fixture ids in oracle order", res.map(r=>r.sk.id), golden.terms.map(t=>t.id));
golden.terms.forEach((gt, i) => {
  const r = res[i], g = r.gateRows.map(x=>x.machine), d = fixture.terms[i];
  const tag = `[${gt.id} ${gt.title}]`;
  eq(`${tag} machine statuses`, g.map(x=>x.status), gt.machineStatus);
  eq(`${tag} machine statuses == data`, g.map(x=>x.status), CHECK_KEYS.map(k=>d.checks[k].status));
  eq(`${tag} term type / duplicate / similarity`, [g[0].detail,g[1].matched,g[1].closest,g[1].similarity],
     [gt.g0detail,gt.g1matched,gt.g1closest,gt.g1similarity]);
  eq(`${tag} learnable/demonstrable`, [g[2].learnable,g[2].demonstrable], [gt.learnable,gt.demonstrable]);
  eq(`${tag} overall status (== data)`, [r.status, d.overall], [gt.status, gt.status]);
  eq(`${tag} failed / pending checks (== data)`, [r.failedChecks, r.pendingChecks],
     [d.failed_checks.map(k=>CHECK_KEYS.indexOf(k)), d.pending_checks.map(k=>CHECK_KEYS.indexOf(k))]);
});
eq("batch outcome 2 pass / 0 provisional / 7 fail",
   {PASS:res.filter(r=>r.status==="PASS").length, PROVISIONAL:res.filter(r=>r.provisional).length, FAIL:res.filter(r=>r.failed).length}, golden.summary);
eq("oracle summary is 2 / 0 / 7", golden.summary, {PASS:2, PROVISIONAL:0, FAIL:7});
ok("no fixture term has a pending check", res.every(r=>r.pendingChecks.length===0));

// -------------------------------------------------------- 5. no short-circuit
hdr("5. No short-circuit remains");
ok("every term has 4 reached rows", res.every(r=>r.gateRows.length===4 && r.gateRows.every(g=>g.reached===true)));
ok("every gate row carries a completed machine status (pass/fail)", res.every(r=>r.gateRows.every(g=>["pass","fail"].includes(g.machine.status))));
ok("a multi-failure term reports every failing check, not just the first", byId(res,ROLE.multi_g0_g1_g2).failedChecks.length===3);
for(const s of ["did not reach","Did not reach","stopped at","Stopped at","Not applicable","gcard.stopped"])
  ok(`source free of "${s}"`, !src.includes(s), "still present");
ok("renderGate is gone", !/function renderGate\b/.test(src));
ok("gateCanComplete is gone", !/function gateCanComplete\b/.test(src));
ok("renderReview exists", /function renderReview\(\)\{/.test(src));

// -------------------------------------------------------------- 6. decisive[]
hdr("6. decisive[] correctness");
const expect = {
  pass_a:                 {failed:[],      decisive:[0,1,2,3]},
  pass_b:                 {failed:[],      decisive:[0,1,2,3]},
  g0_only:                {failed:[0],     decisive:[0]},
  g1_only:                {failed:[1],     decisive:[1]},
  g2_only_learnability:   {failed:[2],     decisive:[2]},
  g2_only_demonstrability:{failed:[2],     decisive:[2]},
  multi_g1_g2:            {failed:[1,2],   decisive:[]},
  multi_g0_g1_g2:         {failed:[0,1,2], decisive:[]},
  g3_only:                {failed:[3],     decisive:[3]},
};
for(const [role, e] of Object.entries(expect)){
  const r = byId(res, ROLE[role]);
  eq(`[${role}] failedChecks`, r.failedChecks, e.failed);
  eq(`[${role}] decisive`, idxs(r.decisive), e.decisive);
}
ok("decisive rule: non-failing term => every check decisive (market pulse included)",
   res.filter(r=>!r.failed).every(r=>r.gateRows.every((g,i)=>r.decisive[i]===!g.pending)));
ok("decisive rule: multi-fail term => none decisive",
   res.filter(r=>r.failedChecks.length>1).every(r=>r.decisive.every(d=>!d)));
ok("multi-fail term exists in the fixture", res.some(r=>r.failedChecks.length>1));

// ------------------------------------------------- 7. override flip semantics
hdr("7. Override simulation");
ok("single-fail term: overriding its one failing check => not FAIL",
   !withOverride("g2_only_learnability",2,"accept adjacent courses").failed);
ok("multi-fail term: overriding one of two failing checks => still FAIL",
   withOverride("multi_g1_g2",1,"distinct enough").failed === true);
eq("multi-fail term after that override still fails the other check",
   withOverride("multi_g1_g2",1,"x").failedChecks, [2]);
ok("single-fail term: overriding its one failing check => PASS",
   withOverride("g2_only_learnability",2,"accept adjacent courses").status === "PASS");
ok("passing term: overriding a passing check => FAIL",
   withOverride("pass_a",2,"evidence too thin").status === "FAIL");
ok("override on a failing check is reflected in failReason",
   /Reviewer override — evidence too thin/.test(withOverride("pass_a",2,"evidence too thin").failReason));
ok("passing term: overriding market pulse => FAIL",
   withOverride("pass_a",3,"postings are noise").status === "FAIL");
ok("G1 (taxonomy) override takes effect", withOverride("g1_only",1,"x").gateRows[1].finalPass === true);
ok("G3 (market pulse) override takes effect", withOverride("g3_only",3,"x").gateRows[3].finalPass === true);

// ------------------------------------------------------ 8. review gate wiring
hdr("8. Single review gate + reason enforcement");
fresh();
ok("clean batch: review can complete", api.fns("reviewCanComplete")() === true);
(function(){
  const q = api.toQueue(fixture.terms);
  q.find(x=>x.id===ROLE.g1_only).overrides = {1:true};   // no reason
  api.setQueue(q);
  ok("un-reasoned override blocks the review", api.fns("reviewCanComplete")() === false);
  q.find(x=>x.id===ROLE.g1_only).overrideReasons = {1:"not a real duplicate"};
  api.setQueue(q);
  ok("reason supplied unblocks the review", api.fns("reviewCanComplete")() === true);
  const q2 = api.toQueue(fixture.terms);
  q2.find(x=>x.id===ROLE.pass_a).overrides = {3:true};   // market pulse is overridable now, so it needs a reason
  api.setQueue(q2);
  ok("an un-reasoned market-pulse override blocks the review", api.fns("reviewCanComplete")() === false);
  q2.find(x=>x.id===ROLE.pass_a).overrideReasons = {3:"postings are noise"};
  api.setQueue(q2);
  ok("a reasoned market-pulse override unblocks the review", api.fns("reviewCanComplete")() === true);

  // "Meets skill definition?" overrides also need the part the reviewer disagrees with (tag only)
  const q3 = api.toQueue(fixture.terms), t3 = q3.find(x=>x.id===ROLE.g2_only_learnability);
  t3.overrides = {2:true}; t3.overrideReasons = {2:"the course does teach it"};
  let R3 = api.setQueue(q3);
  ok("definition override with a reason but no part blocks the review", api.fns("reviewCanComplete")() === false);
  ok("the override still flips the check (tag only): term no longer fails", !byId(R3, ROLE.g2_only_learnability).failed);
  t3.overrideParts = {2:"learn"}; R3 = api.setQueue(q3);
  ok("choosing a part unblocks the review", api.fns("reviewCanComplete")() === true);
  const r3 = byId(R3, ROLE.g2_only_learnability), i3 = R3.indexOf(r3);
  eq("the part is recorded on the check row", r3.gateRows[2].part, "learn");
  const panel = api.fns("checkPanelHTML")(r3, i3, 2);
  eq("the definition reason box offers Learnability / Demonstrability / Both", (panel.match(/data-part="/g)||[]).length, 3);
  ok("the chosen part is checked", /value="learn" checked/.test(panel));
  t3.overrideParts = {2:"both"}; t3.overrides = {2:true};
  const q4 = api.toQueue(fixture.terms), t4 = q4.find(x=>x.id===ROLE.g1_only);
  t4.overrides = {1:true}; t4.overrideReasons = {1:"distinct"}; t4.overrideParts = {1:"learn"};
  const R4 = api.setQueue(q4), r4 = byId(R4, ROLE.g1_only);
  eq("parts are ignored on other checks", r4.gateRows[1].part, "");
  ok("other checks' reason boxes have no part picker", !/data-part=/.test(api.fns("checkPanelHTML")(r4, R4.indexOf(r4), 1)));
  ok("other checks still need only a reason", api.fns("reviewCanComplete")() === true);
})();
(function(){
  const q = api.toQueue(fixture.terms), t = q.find(x=>x.id===ROLE.g2_only_demonstrability);
  t.overrides = {2:true}; t.overrideReasons = {2:"the exam covers it"}; t.overrideParts = {2:"demo"};
  const R = api.setQueue(q), r = byId(R, ROLE.g2_only_demonstrability);
  ok("fail reason names the part", /Reviewer override \(Demonstrability\) — the exam covers it/.test(r.failReason || api.fns("failureReason")(2, r.gateRows)));
  const m = api.metrics();
  eq("summary counts definition overrides by part", [m.defOv, m.defOvLearn, m.defOvDemo, m.defOvBoth], [1,0,1,0]);
  api.exportAudit(); api.exportSummary();
  const a = parseCSV(csv["audit_trail.csv"]), h = a[0], row = a.find(x=>x[0]===ROLE.g2_only_demonstrability);
  ok("audit has a 'Meets skill definition? — Override Part' column", h.includes("Meets skill definition? — Override Part"));
  eq("audit records the part", row[h.indexOf("Meets skill definition? — Override Part")], "Demonstrability");
  const sm = parseCSV(csv["summary_metrics.csv"]);
  eq("summary CSV counts demonstrability overrides", (sm.find(x=>x[0]==="Meets skill definition? overrides — Demonstrability")||[])[1], "1");
  api.fns("clearOverrides")();
  ok("clearing overrides clears parts", Object.keys(api.getQueue().find(x=>x.id===ROLE.g2_only_demonstrability).overrideParts||{}).length===0);
})();
fresh();
api.setPage(1); ok("page 1 can complete via reviewCanComplete", api.fns("pageCanComplete")() === true);
ok("queueChanged() clears card state + the review tick",
   /function queueChanged\(\)\{ expanded=\{\}; reviewDone\[1\]=false; recompute\(\); \}/.test(src));
["queue=toQueue(displayOrder(TRIAL&&TRIAL.terms)); queueChanged()", "sk.overrideParts={}; }); revPinned=new Set(); queueChanged()"].forEach(sig =>
   ok(`queue mutation uses queueChanged: ${sig.slice(0,28)}…`, src.includes(sig)));
ok("every queue mutation site routes through queueChanged (definition + 2 calls)",
   (src.match(/queueChanged\(\)/g)||[]).length === 3, String((src.match(/queueChanged\(\)/g)||[]).length));

// -------------------------------------------------------------- 9. CSV exports
hdr("9. CSV exports");
fresh();
api.exportPassed(); api.exportFailed(); api.exportSummary(); api.exportAudit();
const files = ["passed_skills.csv","failed_skills.csv","summary_metrics.csv","audit_trail.csv"];
files.forEach(f => ok(`${f} generated`, typeof csv[f]==="string" && csv[f].length>0));
const rowsOf = f => parseCSV(csv[f]);
const audit = rowsOf("audit_trail.csv");
eq("audit_trail.csv column count", audit[0].length, 38);
eq("audit_trail.csv row count (header + 9)", audit.length, 10);
ok("audit_trail.csv rows all have 38 cells", audit.every(r=>r.length===38));
ok("audit_trail.csv contains no N/A cell", !audit.some(r=>r.some(c=>c.trim()==="N/A")),
   JSON.stringify((audit.find(r=>r.some(c=>c.trim()==="N/A"))||[]).slice(0,3)));
ok("audit header 'Is a skill? — Final Decision'", audit[0].includes("Is a skill? — Final Decision"));
ok("audit has a market-pulse Reason column", audit[0].includes("Has market pulse? — Reason"));
ok("audit has Failed / Decisive Checks", ["Failed Checks","Decisive Checks"].every(h=>audit[0].includes(h)));
ok("audit has no Pending Checks column", !audit[0].includes("Pending Checks"));
eq("audit market-pulse columns", audit[0].filter(h=>h.startsWith("Has market pulse? — ")),
   ["Output","Expert-Validated","Passing Quarters","Annual Postings","Monthly Postings (Aug 2025–Jul 2026)","Note","Override?","Reason","Final Decision"].map(x=>"Has market pulse? — "+x));
(function(){
  const h = audit[0], row = audit.find(r=>r[0]===ROLE.g2_only_learnability), t = T("g2_only_learnability");
  const urls = t.checks.meets_definition.learnability.evidence.map(e=>e.url);
  ok("audit learnability cell carries the real evidence URLs", urls.length>0 && urls.every(u=>row[h.indexOf("Meets skill definition? — Learnability Evidence")].includes(u)));
  eq("audit market pulse output = Pass (term 001)", row[h.indexOf("Has market pulse? — Output")], "Pass");
  eq("audit market pulse Override? = No (overridable, not overridden)", row[h.indexOf("Has market pulse? — Override?")], "No");
  const mp = T("pass_a").checks.market_pulse, pr = audit.find(r=>r[0]===ROLE.pass_a);
  eq("audit passing quarters (pass_a)", pr[h.indexOf("Has market pulse? — Passing Quarters")],
     mp.quarters.filter(q=>q.pass).map(q=>`${q.q} (${q.cond})`).join("; "));
  const monthly = pr[h.indexOf("Has market pulse? — Monthly Postings (Aug 2025–Jul 2026)")].split(" ");
  eq("audit monthly postings = 12 numbers == data (pass_a)", monthly.map(Number), mp.monthly);
  ok("audit monthly postings has 12 entries", monthly.length===12 && monthly.every(x=>/^\d+$/.test(x)));
  eq("audit annual postings (pass_a)", pr[h.indexOf("Has market pulse? — Annual Postings")], String(mp.annual_mentions));
  const g3 = audit.find(r=>r[0]===ROLE.g3_only);
  eq("audit market pulse output = Fail / none / Fail (g3_only)",
     ["Output","Passing Quarters","Final Decision"].map(c=>g3[h.indexOf("Has market pulse? — "+c)]), ["Fail","none","Fail"]);
})();
const failed = rowsOf("failed_skills.csv");
eq("failed_skills.csv column count", failed[0].length, 16);
eq("failed_skills.csv row count (header + 7)", failed.length, 8);
ok("failed_skills.csv has no Pending Checks column", !failed[0].includes("Pending Checks"));
ok("failed_skills.csv uses 'Failed:' not 'Failed at:'", failed[0].includes("Failed: Is a skill?") && !failed[0].some(h=>h.startsWith("Failed at:")));
(function(){
  const h = failed[0], row = failed.find(r=>r[0]===ROLE.multi_g0_g1_g2);
  ok("multi-fail row flags THREE failed checks",
     ["Failed: Is a skill?","Failed: Already in taxonomy?","Failed: Meets skill definition?"].every(c=>row[h.indexOf(c)]==="Yes"), JSON.stringify(row.slice(0,10)));
  eq("multi-fail row: Failed Check Count = 3", row[h.indexOf("Failed Check Count")], "3");
  eq("multi-fail row: not one override from not failing", row[h.indexOf("One Override From Not Failing?")], "No");
  eq("multi-fail row: market pulse = No (it passed)", row[h.indexOf("Failed: Has market pulse?")], "No");
  const g = failed.find(r=>r[0]===ROLE.g1_only);
  eq("single-fail row: one override from not failing", g[h.indexOf("One Override From Not Failing?")], "Yes");
  eq("single-fail row: decisive check named", g[h.indexOf("Decisive Check")], "Already in taxonomy?");
  eq("single-fail row: overriding it gives PASS", g[h.indexOf("Status If Decisive Check Overridden")], "PASS");
  eq("single-fail row: duplicate named", g[h.indexOf("Duplicate to Existing Skill")], T("g1_only").checks.not_in_taxonomy.matched_skill_title);
  const g3 = failed.find(r=>r[0]===ROLE.g3_only);
  eq("market-pulse-only row: flagged, decisive, PASS if overridden",
     ["Failed: Has market pulse?","Decisive Check","Status If Decisive Check Overridden","Failure Reason"].map(c=>g3[h.indexOf(c)]),
     ["Yes","Has market pulse?","PASS","No quarter met high volume or growing demand (not expert-validated)"]);
})();
const summ = rowsOf("summary_metrics.csv");
ok("summary_metrics.csv uses 'Failed check:' rows", summ.some(r=>r[0]==="Failed check: Meets skill definition?"));
ok("summary_metrics.csv has no 'Stopped at' rows", !summ.some(r=>/Stopped at/.test(r[0])));
ok("summary_metrics.csv reports one-override-from-not-failing", summ.some(r=>/^Fail One Check Only/.test(r[0]) && r[1]==="5"));
eq("summary_metrics.csv: failed market pulse = 1", (summ.find(r=>r[0]==="Failed check: Has market pulse?")||[])[1], "1");
const passedCsv = rowsOf("passed_skills.csv");
ok("passed_skills.csv 'Closest Existing Skill' is the skill title only, no %",
   passedCsv.slice(1).every(r=>{ const t=DATA.terms.find(x=>x.id===r[0]); return r[3]===(t.checks.not_in_taxonomy.matched_skill_title||"none") && !/%/.test(r[3]); }));
eq("passed_skills.csv columns", passedCsv[0], ["Term ID","Skill Title","Skill Description","Closest Existing Skill",
   "Market Pulse — Passing Quarters","Annual Postings","Override Count","Data Quality Note","Final Status"]);
eq("passed_skills.csv rows = the two PASS terms", passedCsv.slice(1).map(r=>r[0]), [ROLE.pass_a, ROLE.pass_b]);
ok("passed_skills.csv lists each term's passing quarters and annual postings", passedCsv.slice(1).every(r=>{
  const mp = fixture.terms.find(t=>t.id===r[0]).checks.market_pulse;
  return r[4]===mp.quarters.filter(q=>q.pass).map(q=>`${q.q} (${q.cond})`).join("; ") && r[5]===String(mp.annual_mentions); }));
ok("old passed_and_provisional_skills.csv no longer generated", !("passed_and_provisional_skills.csv" in csv));

// ------------------------------------------------------------- 10. metrics
hdr("10. Summary metrics");
fresh();
const m = api.metrics();
eq("f0..f3 = failed-check counts", [m.f0,m.f1,m.f2,m.f3], [2,3,4,1]);
eq("p0..p3 / anyPending = 0 (nothing pending)", [m.p0,m.p1,m.p2,m.p3,m.anyPending], [0,0,0,0,0]);
eq("singleFail", m.singleFail, 5);
eq("failures by count fc1..fc4", [m.fc1,m.fc2,m.fc3,m.fc4], [5,1,1,0]);
eq("passed/provisional/failed/overridden", [m.passed,m.provisional,m.failed,m.overridden], [2,0,7,0]);
eq("metrics == oracle", m, golden.metrics);
ok("f0..f3 sum >= failed (multi-fail terms counted more than once)", m.f0+m.f1+m.f2+m.f3 >= m.failed);

// --------------------------------------------------------- 11. render smoke
hdr("11. Render smoke tests");
fresh();
const termCardHTML = api.fns("termCardHTML"), checkPanelHTML = api.fns("checkPanelHTML");
const R = api.getResults();
const iPass = R.findIndex(r=>r.sk.id===ROLE.pass_a),
      iOne  = R.findIndex(r=>r.sk.id===ROLE.g1_only),
      iMany = R.findIndex(r=>r.failedChecks.length>1),
      iDef  = R.findIndex(r=>r.sk.id===ROLE.g2_only_learnability),
      iMP   = R.findIndex(r=>r.sk.id===ROLE.g3_only);
[["pass",iPass],["single-fail",iOne],["multi-fail",iMany],["market-pulse-fail",iMP]].forEach(([label,i])=>{
  const open = termCardHTML(R[i], i, true), shut = termCardHTML(R[i], i, false);
  ok(`${label} card: expanded renders 4 check panels`, (open.match(/class="gcard-top"/g)||[]).length===4, String((open.match(/class="gcard-top"/g)||[]).length));
  ok(`${label} card: collapsed renders none`, !shut.includes('class="gcard-top"'));
  ok(`${label} card: 4 chips in the header strip`, (open.match(/class="chip /g)||[]).length===4);
  ok(`${label} card: override switch on all 4 checks (market pulse included)`, (open.match(/data-ov="/g)||[]).length===4 && open.includes(`data-ov="${i}:3"`));
  ok(`${label} card: no what-if note, decisive mark, confidence or similarity badge (removed 2026-09-29)`,
     !/What-if:|⚡|Confidence:|Similarity:|treated as distinct/.test(open));
  ok(`${label} card: no pending chip, note or 'Not overridable' label`, !open.includes('class="chip pend') && !open.includes('class="pending-note"') && !open.includes("Not overridable while pending"));
  ok(`${label} card: no unbalanced template literal leak`, !open.includes("${"));
});
ok("passing term card is marked PASS", termCardHTML(R[iPass],iPass,false).includes('class="pill pass dot">PASS<'));
ok("failing term card is marked FAIL", termCardHTML(R[iMany],iMany,false).includes(">FAIL<"));
[iOne,iMany,iPass,iMP].forEach(ix=>ok(`no decisive mark on card ${R[ix].sk.id} (removed 2026-09-29)`,
  !/decisive/i.test(termCardHTML(R[ix],ix,true).replace(/data-[a-z-]*="[^"]*"/g,""))));
ok("review note no longer explains decisive marks", !src.includes("⚡ decisive"));
(function(){
  const t = T("g2_only_learnability"), d = t.checks.meets_definition;
  const ev = [...d.learnability.evidence, ...d.demonstrability.evidence];
  const html = checkPanelHTML(R[iDef],iDef,2);
  ok("evidence panel rendered on check 3", html.includes('class="evidence"'));
  ok("every real evidence URL is a clickable link", ev.length>0 && ev.every(e=>html.includes(`href="${e.url.replace(/&/g,"&amp;")}"`)), String(ev.length));
  eq("one evidence item rendered per source", (html.match(/class="ev-item"/g)||[]).length, ev.length);
  ok("region groups use Local (Singapore) / International", ev.some(e=>e.region==="Local") ? html.includes("Local (Singapore)") : html.includes(">International<"));
  ok("no direct/adjacent or formal/informal badges (removed 2026-09-29)", !/class="ev-tag[ "]/.test(html) && !/Formal<|Informal<|>Direct<|>Adjacent</.test(html));
  ok("no rationale, confidence or search-pass count (removed 2026-09-29)", !/Rationale:|confidence<|search pass/.test(html));
  ok("gap note still shown", html.includes("Search notes:"));
  eq("one 'Not counted' tag per non-direct source", (html.match(/class="ev-nc"/g)||[]).length, ev.filter(e=>e.relevance!=="direct").length);
  { const L=d.learnability.evidence.filter(e=>e.relevance!=="direct"), D=d.demonstrability.evidence.filter(e=>e.relevance!=="direct");
    const want=[...L.map(e=>e.has_outcomes===false?"no published learning outcomes":"covers a related or broader skill"),
                ...D.map(()=>"doesn't assess this exact skill")];
    ok("'Not counted' reasons match the recorded evidence", want.every(w=>html.includes("Not counted: "+w)), JSON.stringify(want)); }
  ok("no synthetic Google-search links", !html.includes("google.com/search"));
})();
ok("closest-match badges rendered on check 2", checkPanelHTML(R[iOne],iOne,1).includes('class="badges"') && checkPanelHTML(R[iOne],iOne,1).includes(esc(T("g1_only").checks.not_in_taxonomy.matched_skill_title)));
{ const h0 = checkPanelHTML(R[iOne],iOne,0), rsn = R[iOne].gateRows[0].machine.reasoning;
  ok("is-a-skill reasoning rendered on check 1 as one plain note", rsn && h0.includes(esc(rsn)) && !h0.includes("Reasoning:"));
  ok("no Term type badge on check 1 (the verdict already names the type)", !h0.includes("Term type:"));
  const g0 = R[iOne].gateRows[0].machine, want = g0.pass ? "Doubts considered (" : "Why it's not a skill (";
  ok("signals toggle is labelled by verdict", !g0.signalsAgainst.length || h0.includes(want), want);
  ok("old toggle label is gone", !src.includes("Signals against being a skill")); }
{ const q=api.toQueue(fixture.terms), R2=api.setQueue(q);
  const rej=R2.find(r=>!r.gateRows[0].machine.pass && r.gateRows[0].machine.signalsAgainst.length),
        acc=R2.find(r=>r.gateRows[0].machine.pass && r.gateRows[0].machine.signalsAgainst.length);
  ok("a rejected term's toggle reads \"Why it's not a skill\"", rej && checkPanelHTML(rej,R2.indexOf(rej),0).includes("Why it's not a skill ("));
  ok("an accepted term's toggle reads \"Doubts considered\"", acc && checkPanelHTML(acc,R2.indexOf(acc),0).includes("Doubts considered ("));
  fresh(); }
{ const h2 = checkPanelHTML(R[iDef],iDef,2);
  ok("definition sources sit behind collapsed 'Show sources' toggles", /<details class="more ev-more"><summary>Show sources \(\d+\)<\/summary>/.test(h2) && !/<details[^>]*open/.test(h2));
  ok("definition panel headers show only Met / Not met per part", (h2.match(/class="ev-h"/g)||[]).length===2 && !h2.includes('class="ev-sub"')); }
(function(){
  // Market-pulse panel (check 4) with real job-posting results.
  const mp = T("pass_a").checks.market_pulse, pq = mp.quarters.filter(q=>q.pass).map(q=>`${q.q} (${q.cond})`);
  const html = checkPanelHTML(R[iPass],iPass,3);
  const cond = mp.quarters.filter(q=>q.pass);
  ok("passing market pulse shows one line: pass + condition with quarters", html.includes("Has market pulse — ") &&
     cond.every(q=>html.includes(q.q)) && (cond.some(q=>q.cond==="growing") ? html.includes("growing demand (") : true), cond.map(q=>q.q+" "+q.cond).join(", "));
  ok("no posting breakdown on the page (kept in exports) — passing market-pulse panel has a sparkline", !/class="spark"|Annual postings|Postings \(12 mo\)|Expert-validated: <b>/.test(html));
  ok("no posting breakdown on the page (kept in exports) — sparkline has one bar per month (12)", !/class="spark"|Annual postings|Postings \(12 mo\)|Expert-validated: <b>/.test(html));
  ok("no posting breakdown on the page (kept in exports) — panel shows per-quarter counts and annual postings", !/class="spark"|Annual postings|Postings \(12 mo\)|Expert-validated: <b>/.test(html));
  ok("check 4 has an override switch, no pending note", html.includes(`data-ov="${iPass}:3"`) && !html.includes('class="pending-note"'));
  ok("machine label groups passing quarters by condition", html.includes("Has market pulse — "+esc(api.fns("mpCondition")(R[iPass].gateRows[3].machine))) && pq.length>0);
  const f = checkPanelHTML(R[iMP],iMP,3);
  ok("g3_only shows 'No market pulse — no quarter showed …' and no breakdown", f.includes("No market pulse — no quarter showed high volume or growing demand") && !f.includes('class="spark"'));
  ok("g3_only machine label = No market pulse + reason", f.includes('class="pill no">No market pulse — no quarter showed high volume or growing demand<'));
  eq("g3_only failReason", R[iMP].failReason, "No quarter met high volume or growing demand (not expert-validated)");
  const t053 = DATA.terms.find(t=>t.id==="053");
  ok("term 053 has no quarters in the data and fails market pulse", t053 && t053.checks.market_pulse.status==="fail" && !t053.checks.market_pulse.quarters.length);
  const r053 = api.setQueue(api.toQueue([t053]))[0], h053 = checkPanelHTML(r053,0,3);
  ok("term 053 shows 'No market pulse — no job postings found'", h053.includes("No market pulse — no job postings found"));
  ok("term 053 panel has no extra note or badges", !h053.includes("Title not found") && !h053.includes('class="badge"'));
  ok("term 053 failReason names missing postings", r053.failReasons.includes("No job postings found for this title (not expert-validated)"));
  ok("the expert-validated flag is not shown when No (the whole trial is No)",
     [iMP].every(ix=>!api.fns("checkPanelHTML")(R[ix],ix,3).includes("Expert-validated:")) &&
     DATA.terms.every(t=>t.checks.market_pulse.expert_validated===false));
  // expert route: a synthetic expert-validated term with no demand still passes market pulse
  { const t = JSON.parse(JSON.stringify(T("g3_only")));
    Object.assign(t.checks.market_pulse, {status:"pass", expert_validated:true, demand:false});
    t.failed_checks = []; t.overall = "PASS";
    const Rx = api.setQueue(api.toQueue([t])), rx = Rx[0], px = api.fns("checkPanelHTML")(rx,0,3);
    eq("expert-validated term with no demand: market pulse passes, term PASSES", [rx.gateRows[3].finalStatus, rx.status], ["pass","PASS"]);
    ok("its label says expert-validated", api.fns("machineLabel")(3, rx.gateRows[3].machine).includes("expert-validated"));
    ok("its panel says 'Has market pulse — expert-validated'", px.includes("Has market pulse — expert-validated"));
    fresh(); }
  fresh();
})();
ok("reason box appears once a check is overridden", (function(){
  const q=api.toQueue(fixture.terms); q[0].overrides={1:true}; const out=api.setQueue(q);
  return checkPanelHTML(out[0],0,1).includes('data-reason="0:1"'); })());
fresh();
ok("renderReport (simple) has a 'Failed checks' column", src.includes(">Failed checks</th>"));
ok("report no longer has a Decisive column (removed 2026-09-29)", !src.includes(">Decisive</th>"));
(function(){
  // DOM-driven renderers run end-to-end on the full cohort without throwing, and every term's
  // expanded card renders (catches data-shape edge cases across all 304).
  api.setQueue(api.toQueue(DATA.terms)); const RR = api.getResults();
  let err = null; try { RR.forEach((r,i)=>termCardHTML(r,i,true)); } catch(e){ err = e; }
  ok("all 304 expanded cards render", !err, err && err.message);
  for(const [p,fn] of [[0,"renderOverview"],[1,"renderReview"],[2,"renderSummary"]]){
    let e2=null; try { api.setPage(p); api.fns("gotoPage")(p); api.fns("renderReport")(); } catch(e){ e2=e; }
    ok(`page ${p} (${fn}) renders on the full cohort`, !e2, e2 && e2.stack);
  }
  fresh();
})();
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

// ---------------------------------- 12. market-pulse roll-up + generic pending path
hdr("12. Market-pulse roll-up (PASS / FAIL) + generic pending path");
(function(){
  // Whole cohort: market pulse has run everywhere, and the roll-up matches the data's own overall.
  const all = api.setQueue(api.toQueue(DATA.terms));
  ok("market pulse completed (pass/fail) for all 304 terms", DATA.terms.every(t=>["pass","fail"].includes(t.checks.market_pulse.status)));
  ok("no check pending and no PROVISIONAL term in the cohort", all.every(r=>r.pendingChecks.length===0 && !r.provisional));
  const bad = all.filter((r,i)=>r.status!==DATA.terms[i].overall);
  ok("roll-up status == data overall for all 304 terms", bad.length===0, bad.slice(0,3).map(r=>r.sk.id).join(","));
  const badF = all.filter((r,i)=>JSON.stringify(r.failedChecks)!==JSON.stringify(DATA.terms[i].failed_checks.map(k=>CHECK_KEYS.indexOf(k))));
  ok("failed checks == data failed_checks for all 304 terms", badF.length===0, badF.slice(0,3).map(r=>r.sk.id).join(","));
  ok("market pulse fails exactly when no quarter passes (all 304)", all.every(r=>r.gateRows[3].machine.pass === r.gateRows[3].machine.quarters.some(q=>q.pass)));
  const cm = api.metrics(), cnt = s => DATA.terms.filter(t=>t.overall===s).length;
  eq("cohort metrics: pass / provisional / fail match the data", [cm.passed,cm.provisional,cm.failed], [cnt("PASS"),cnt("PROVISIONAL"),cnt("FAIL")]);
  eq("cohort data: 32 PASS / 0 PROVISIONAL / 272 FAIL", [cnt("PASS"),cnt("PROVISIONAL"),cnt("FAIL")], [32,0,272]);
})();
fresh();
(function(){
  const r = byId(api.getResults(), ROLE.pass_a);
  eq("PASS roll-up: all four checks pass", [r.status, r.failedChecks, r.pendingChecks, idxs(r.decisive)], ["PASS", [], [], [0,1,2,3]]);
  ok("PASS is passed, not provisional or failed", r.passed && !r.provisional && !r.failed);
  eq("passing term what-if on market pulse", r.flipNote[3], "Override → this term FAILS");
  const g = byId(api.getResults(), ROLE.g3_only);
  eq("FAIL roll-up when market pulse alone fails (overridable + decisive)", [g.status, g.failedChecks, idxs(g.decisive), g.gateRows[3].overridable], ["FAIL",[3],[3],true]);
  eq("its what-if says it PASSES", g.flipNote[3], "Override → this term PASSES");
})();
(function(){
  const r = withOverride("pass_a", 3, "postings are noise");
  eq("market-pulse override on a passing term: FAIL, 1 override, reason carried",
     [r.status, r.gateRows[3].overridden, r.gateRows[3].finalStatus, r.overrideCount, r.failReason], ["FAIL", true, "fail", 1, "Reviewer override — postings are noise"]);
  const g = withOverride("g3_only", 3, "demand is real");
  eq("override of the sole market-pulse failure -> PASS", [g.status, g.failedChecks, g.failReason], ["PASS", [], ""]);
})();
(function(){
  fresh();
  const r = byId(api.getResults(), ROLE.g1_only);
  ok("sole failure is decisive (nothing pending)", r.decisive[1]===true && r.pendingChecks.length===0);
  eq("its what-if says it PASSES", r.flipNote[1], "Override → this term PASSES");
  const o = withOverride("g1_only", 1, "not a true duplicate");
  eq("override of that sole failure -> PASS", [o.status, o.failedChecks], ["PASS", []]);
  api.exportPassed(); api.exportFailed(); api.exportAudit(); api.exportSummary();
  const pp = parseCSV(csv["passed_skills.csv"]), row = pp.find(x=>x[0]===ROLE.g1_only);
  ok("after override the term moves to passed_skills.csv as PASS", row && row[pp[0].indexOf("Final Status")]==="PASS" && row[pp[0].indexOf("Override Count")]==="1");
  ok("after override it is gone from failed_skills.csv", !parseCSV(csv["failed_skills.csv"]).some(x=>x[0]===ROLE.g1_only));
  withOverride("g3_only", 3, "demand is real");
  api.exportPassed(); api.exportFailed();
  ok("market-pulse override moves g3_only to passed_skills.csv (passing quarters: none)",
     parseCSV(csv["passed_skills.csv"]).some(x=>x[0]===ROLE.g3_only && x[4]==="none" && x[8]==="PASS") &&
     !parseCSV(csv["failed_skills.csv"]).some(x=>x[0]===ROLE.g3_only));
})();
(function(){
  fresh();
  api.exportPassed(); api.exportFailed(); api.exportAudit(); api.exportSummary();
  const status = f => { const rows = parseCSV(csv[f]); const k = rows[0].indexOf("Final Status"); return k<0 ? null : rows.slice(1).map(r=>r[k]); };
  eq("passed export: Final Status column = PASS x2", status("passed_skills.csv"), ["PASS","PASS"]);
  ok("failed export: Final Status column = FAIL x7", (status("failed_skills.csv")||[]).length===7 && status("failed_skills.csv").every(s=>s==="FAIL"));
  eq("audit export: Final Status = 2 PASS, 7 FAIL, no PROVISIONAL", ["PASS","FAIL","PROVISIONAL"].map(s=>(status("audit_trail.csv")||[]).filter(x=>x===s).length), [2,7,0]);
  const sm = parseCSV(csv["summary_metrics.csv"]);
  eq("summary export: Final Status PASS / FAIL rows", ["PASS","FAIL"].map(s=>(sm.find(r=>r[0]==="Final Status: "+s)||[])[1]), ["2","7"]);
  ok("summary export: no PROVISIONAL row and no Pending rows", !sm.some(r=>/PROVISIONAL|^Pending/i.test(r[0])));
})();
(function(){
  // Review filters: PASS replaces PROVISIONAL, which is only offered while some term is provisional.
  fresh(); const fi = api.fns("filteredIdx");
  api.setRevFilter({status:"PASS"});        eq("status filter PASS", fi().map(i=>api.getResults()[i].sk.id), [ROLE.pass_a, ROLE.pass_b]);
  api.setRevFilter({status:"FAIL"});        eq("status filter FAIL", fi().length, 7);
  api.setRevFilter({check:"single"});       eq("check filter: fails exactly one", fi().length, 5);
  api.setRevFilter({check:"1"});            eq("check filter: failed taxonomy", fi().length, 3);
  api.setRevFilter({q:T("g0_only").title}); ok("search by title", fi().some(i=>api.getResults()[i].sk.id===ROLE.g0_only));
  api.setRevFilter({});
  const rc = captureDOM(()=>api.fns("renderReview")());
  const st = rc["#revStatus"].innerHTML;
  ok("status filter offers Pass (2) and Fail (7), no Provisional", st.includes(">Pass (2)<") && st.includes(">Fail (7)<") && !st.includes("PROVISIONAL"), st);
  eq("status filter order: All, Pass, Fail, Overridden", [...st.matchAll(/data-st="([A-Za-z]+)"/g)].map(m=>m[1]), ["all","PASS","FAIL","OVERRIDDEN"]);
  ok("review count line omits provisional", !/provisional/.test(rc["#revCount"].textContent) && rc["#revCount"].textContent.includes("2 pass"), rc["#revCount"].textContent);
  const ov = pageHTML(captureDOM(()=>api.fns("renderOverview")()));
  eq("overview tile order: Terms checked, Passed, Failed", [...ov.matchAll(/<div class="t-k">([^<]+)<\/div>/g)].map(m=>m[1]), ["Terms checked","Passed","Failed"]);
  ok("overview tiles: Passed shown, no Provisional tile", ov.includes('<div class="t-k">Passed</div><div class="t-v">2</div>') && !ov.includes(">Provisional<"));
  const sd = captureDOM(()=>api.fns("renderSummary")()), su = pageHTML(sd);
  ok("summary tiles: no Provisional tile; failed-market-pulse subtile", !su.includes(">Provisional<") && su.includes("Failed “Has market pulse?”"));
  eq("summary passed-export caption", sd["#cntPassed"].textContent, "2 passed");
  fresh();
})();
(function(){
  // Generic pending path (kept, data-driven): a synthetic copy of a real term whose market pulse has not run.
  const mk = role => { const t = JSON.parse(JSON.stringify(T(role))); t.checks.market_pulse = {status:"pending"}; t.overall = "PROVISIONAL"; return t; };
  const q = api.toQueue([mk("pass_a"), mk("g1_only")]);
  const [p, g] = api.setQueue(q);
  eq("pending roll-up: PROVISIONAL, nothing failed, market pulse pending", [p.status, p.failedChecks, p.pendingChecks], ["PROVISIONAL", [], [3]]);
  ok("PROVISIONAL is neither passed nor failed", p.provisional && !p.passed && !p.failed);
  ok("pending check is not overridable and not decisive", p.gateRows[3].overridable===false && p.decisive[3]===false && g.decisive[3]===false);
  eq("completed checks stay decisive", idxs(p.decisive), [0,1,2]);
  eq("pending what-if note", p.flipNote[3], "Pending — cannot be overridden until the check has run");
  eq("sole failure + pending: override -> PROVISIONAL (what-if)", g.flipNote[1], "Override → this term becomes PROVISIONAL (a check is still pending)");
  const panel = api.fns("checkPanelHTML")(p,0,3), card = api.fns("termCardHTML")(p,0,true);
  ok("pending note renders on check 4, no override switch", panel.includes('class="pending-note"') && panel.includes(api.PENDING_TEXT) && !panel.includes("data-ov=") && panel.includes("Not overridable while pending"));
  ok("pending chip + PROVISIONAL pill on the card", card.includes('class="chip pend') && card.includes('class="pill prov dot">PROVISIONAL<'));
  q[0].overrides = {3:true};
  const o = api.setQueue(q)[0];
  eq("override on pending is ignored: still PROVISIONAL, 0 overrides", [o.status, o.gateRows[3].finalStatus, o.overrideCount], ["PROVISIONAL","pending",0]);
  ok("an attempted override on a pending check does not block the review", api.fns("reviewCanComplete")() === true);
  q[0].overrides = {}; q[1].overrides = {1:true}; q[1].overrideReasons = {1:"x"};
  eq("override of the sole failure with pending -> PROVISIONAL", api.setQueue(q)[1].status, "PROVISIONAL");
  q[1].overrides = {}; q[1].overrideReasons = {}; api.setQueue(q);
  api.exportFailed(); api.exportAudit(); api.exportSummary(); api.exportPassed();
  const fr = parseCSV(csv["failed_skills.csv"]), ar = parseCSV(csv["audit_trail.csv"]), pr = parseCSV(csv["passed_skills.csv"]);
  eq("failed export: pending market pulse = Pending, status if overridden = PROVISIONAL",
     ["Failed: Has market pulse?","Status If Decisive Check Overridden"].map(c=>fr[1][fr[0].indexOf(c)]), ["Pending","PROVISIONAL"]);
  eq("audit: pending market pulse Output / Override? / Final",
     ["Output","Override?","Final Decision"].map(c=>ar[1][ar[0].indexOf("Has market pulse? — "+c)]), ["Pending","No (pending — not overridable)","Pending"]);
  eq("passed export carries the PROVISIONAL term", pr.slice(1).map(r=>[r[0],r[8]]), [[ROLE.pass_a,"PROVISIONAL"]]);
  eq("metrics count provisional + pending", (m=>[m.provisional,m.p3,m.anyPending])(api.metrics()), [1,2,2]);
  const ov = pageHTML(captureDOM(()=>api.fns("renderOverview")()));
  ok("overview shows a Provisional tile once a term is provisional", ov.includes('<div class="t-k">Provisional</div><div class="t-v">1</div>'));
  const rc = captureDOM(()=>api.fns("renderReview")());
  ok("status filter offers Provisional (1) once a term is provisional", rc["#revStatus"].innerHTML.includes('data-st="PROVISIONAL"') && rc["#revStatus"].innerHTML.includes(">Provisional (1)<"));
  fresh();
  eq("fixture queue restored", api.getResults().map(r=>r.sk.id), fixture.terms.map(t=>t.id));
})();

// ------------------------------------------- 12b. display order (most confident first)
hdr("12b. display order");
{
  const ord = api.displayOrder(DATA.terms), ids = ord.map(t=>t.id);
  const key = t => [t.data_quality_note?1:0, api.CONTESTED.has(t.id)?1:0, t.checks.is_skill.status==="fail"?1:0,
    -api.skillLikeScore(t.title), t.overall==="FAIL"?1:0, t.title.length, t.id];
  const cmp = (a,b) => { for(let i=0;i<a.length;i++){ if(a[i]<b[i]) return -1; if(a[i]>b[i]) return 1; } return 0; };
  eq("display order is a permutation of the cohort", ids.slice().sort(), DATA.terms.map(t=>t.id).slice().sort());
  ok("order follows (flag, contested, non-skill, -skill-likeness, failed, length, id) with no inversions",
     ord.every((t,i,a)=>!i || cmp(key(a[i-1]), key(t)) < 0));
  const firstDq = ord.findIndex(t=>t.data_quality_note);
  ok("every data-quality-flagged term comes after every clean term", firstDq>0 && ord.slice(firstDq).every(t=>t.data_quality_note));
  ok("clean contested terms come after clean uncontested ones",
     ord.slice(0, firstDq).every((t,i,a)=>!i || !(api.CONTESTED.has(a[i-1].id) && !api.CONTESTED.has(t.id))));
  ok("the first term shown is a clean skill with the top skill-likeness among clean uncontested skills",
     !ord[0].data_quality_note && ord[0].checks.is_skill.status==="pass" &&
     api.skillLikeScore(ord[0].title) === Math.max(...DATA.terms.filter(t=>!t.data_quality_note && !api.CONTESTED.has(t.id) &&
       t.checks.is_skill.status==="pass").map(t=>api.skillLikeScore(t.title))));
  const firstNonSkill = ord.findIndex(t=>t.checks.is_skill.status==="fail");
  ok("clean uncontested skills all come before the first non-skill",
     ord.slice(0, firstNonSkill).every(t=>t.checks.is_skill.status==="pass"));
  const top = Math.max(...DATA.terms.map(t=>api.skillLikeScore(t.title)));
  ["data analytics","waste management operations","data analysis"].forEach(x=>
    ok(`taxonomy example "${x}" scores at least as high as any cohort title`, api.skillLikeScore(x) >= top));
  ok("clearly non-taxonomy phrasing scores low", api.skillLikeScore("reports and analyses") < api.skillLikeScore("data analysis") &&
     api.skillLikeScore("the design of travel itineraries") < api.skillLikeScore("data analysis"));
  ok("data file stays in id order", DATA.terms.every((t,i,a)=>i===0 || a[i-1].id < t.id));
}

// ------------------------------------------- 13. embedded data + page content
hdr("13. Embedded cohort + content");
ok("embedded TRIAL deep-equals data/trial_results.json", deepEqual(api.TRIAL, DATA));
eq("embedded cohort has 304 terms", api.TRIAL.terms.length, 304);
eq("cohort_size == terms", api.TRIAL.cohort_size, api.TRIAL.terms.length);
ok("fixture terms are verbatim terms from the data (re-run make_fixture.py if not)",
   fixture.terms.every(t=>deepEqual(t, DATA.terms.find(x=>x.id===t.id))));
const SAMPLE_TITLES = ["AI Governance","Prompt Engineering","Clinical Documentation Improvement","Product Lifecycle Management",
  "AI-Native Mindset","Customer Delight","Green Transformation Readiness","Design Skills Discovery Process"];
SAMPLE_TITLES.forEach(t=>ok(`no sample title "${t}" in index.html`, !src.includes(t)));
for(const s of ["generateSignals","samples(","Load 8 sample","Demo controls","demoToggle","Upload CSV","Download CSV template","addSkill","ingestCSV","google.com/search"])
  ok(`index.html free of "${s}"`, !src.includes(s));
const FOOT = `${DATA.terms.length} terms after removing 34 whose text was lost or unreadable`;
eq("cohort footnote appears exactly once", src.split(FOOT).length-1, 1);
eq("market-pulse banner appears exactly once", src.split("Market pulse uses job postings from Aug 2025 to Jul 2026, analysed inside the organisation; only monthly counts per skill title were used here.").length-1, 1);
for(const s of ["Market pulse check not yet run","No term can PASS","no term can PASS","job-posting data is not yet available","until job-posting data is available"])
  ok(`index.html free of stale pending wording "${s}"`, !src.includes(s));
ok("no mention of an 18-term set", !/18[- ]term|\b18 terms\b|11\/18/.test(src));
ok("template (UI text, no data) never mentions v1 / v2", !/\bv[12]\b/i.test(TEMPLATE));

// ------------------------------------------------------------------- result
console.log("\n" + (fails ? `RESULT: ${fails} FAILED of ${checks}` : `RESULT: ${checks}/${checks} passed`));
process.exit(fails ? 1 : 0);
