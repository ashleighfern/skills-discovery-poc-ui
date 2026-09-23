// Verification suite for the Skills Discovery review UI (index.html).
//   node test/verify.js            (from the site/ folder, or with any cwd)
// Sections 1-11 keep the intent of the original mock's suite, rebuilt on an 8-term REAL
// fixture (test/fixture.json) instead of synthetic samples; section 12 adds the pending /
// PROVISIONAL checks and section 13 the embedded-data and content checks. See CHANGES.md.
const fs = require("fs"), path = require("path");
const DIR = __dirname, SITE = path.join(DIR, "..");
const {load, parseCSV} = require(path.join(DIR, "harness.js"));
const HTML = path.join(SITE, "index.html");
const {api, csv, html: src} = load(HTML);
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

// ---------------------------------------------------------------- 1. structure
hdr("1. Structure / config");
eq("GATES overridable = all four (pending rows are gated per term, not per check)", api.GATES.map(g=>g.ov), [true,true,true,true]);
eq("STEPS = 3", api.STEPS.length, 3);
eq("STEPS titles", api.STEPS.map(s=>s.t), ["Overview","Review all checks","Summary"]);
eq("GATES questions == CHECK_NAMES", api.GATES.map(g=>g.q), api.CHECK_NAMES);
eq("CHECK_NAMES normalised", api.CHECK_NAMES,
   ["Is it a skill?","Already in taxonomy?","Meets skill definition?","Has market pulse?"]);
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
eq("batch outcome 0 pass / 2 provisional / 6 fail",
   {PASS:res.filter(r=>r.status==="PASS").length, PROVISIONAL:res.filter(r=>r.provisional).length, FAIL:res.filter(r=>r.failed).length}, golden.summary);

// -------------------------------------------------------- 5. no short-circuit
hdr("5. No short-circuit remains");
ok("every term has 4 reached rows", res.every(r=>r.gateRows.length===4 && r.gateRows.every(g=>g.reached===true)));
ok("every gate row carries a machine status", res.every(r=>r.gateRows.every(g=>["pass","fail","pending"].includes(g.machine.status))));
ok("a multi-failure term reports every failing check, not just the first", byId(res,ROLE.multi_g0_g1_g2).failedChecks.length===3);
for(const s of ["did not reach","Did not reach","stopped at","Stopped at","Not applicable","gcard.stopped"])
  ok(`source free of "${s}"`, !src.includes(s), "still present");
ok("renderGate is gone", !/function renderGate\b/.test(src));
ok("gateCanComplete is gone", !/function gateCanComplete\b/.test(src));
ok("renderReview exists", /function renderReview\(\)\{/.test(src));

// -------------------------------------------------------------- 6. decisive[]
hdr("6. decisive[] correctness");
const expect = {
  provisional_a:          {failed:[],      decisive:[0,1,2]},
  provisional_b:          {failed:[],      decisive:[0,1,2]},
  g0_only:                {failed:[0],     decisive:[0]},
  g1_only:                {failed:[1],     decisive:[1]},
  g2_only_learnability:   {failed:[2],     decisive:[2]},
  g2_only_demonstrability:{failed:[2],     decisive:[2]},
  multi_g1_g2:            {failed:[1,2],   decisive:[]},
  multi_g0_g1_g2:         {failed:[0,1,2], decisive:[]},
};
for(const [role, e] of Object.entries(expect)){
  const r = byId(res, ROLE[role]);
  eq(`[${role}] failedChecks`, r.failedChecks, e.failed);
  eq(`[${role}] decisive`, idxs(r.decisive), e.decisive);
}
ok("decisive rule: non-failing term => every completed check decisive",
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
ok("provisional term: overriding a passing check => FAIL",
   withOverride("provisional_a",2,"evidence too thin").status === "FAIL");
ok("override on a failing check is reflected in failReason",
   /Reviewer override — evidence too thin/.test(withOverride("provisional_a",2,"evidence too thin").failReason));
ok("G1 (taxonomy) override takes effect", withOverride("g1_only",1,"x").gateRows[1].finalPass === true);

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
  q2.find(x=>x.id===ROLE.provisional_a).overrides = {3:true};   // pending: ignored, so nothing to justify
  api.setQueue(q2);
  ok("an attempted override on a pending check does not block the review", api.fns("reviewCanComplete")() === true);
})();
fresh();
api.setPage(1); ok("page 1 can complete via reviewCanComplete", api.fns("pageCanComplete")() === true);
ok("queueChanged() clears card state + the review tick",
   /function queueChanged\(\)\{ expanded=\{\}; reviewDone\[1\]=false; recompute\(\); \}/.test(src));
["queue=toQueue(TRIAL&&TRIAL.terms); queueChanged()", "sk.overrideReasons={}; }); revPinned=new Set(); queueChanged()"].forEach(sig =>
   ok(`queue mutation uses queueChanged: ${sig.slice(0,28)}…`, src.includes(sig)));
ok("every queue mutation site routes through queueChanged (definition + 2 calls)",
   (src.match(/queueChanged\(\)/g)||[]).length === 3, String((src.match(/queueChanged\(\)/g)||[]).length));

// -------------------------------------------------------------- 9. CSV exports
hdr("9. CSV exports");
fresh();
api.exportPassed(); api.exportFailed(); api.exportSummary(); api.exportAudit();
const files = ["passed_and_provisional_skills.csv","failed_skills.csv","summary_metrics.csv","audit_trail.csv"];
files.forEach(f => ok(`${f} generated`, typeof csv[f]==="string" && csv[f].length>0));
const rowsOf = f => parseCSV(csv[f]);
const audit = rowsOf("audit_trail.csv");
eq("audit_trail.csv column count", audit[0].length, 34);
eq("audit_trail.csv row count (header + 8)", audit.length, 9);
ok("audit_trail.csv rows all have 34 cells", audit.every(r=>r.length===34));
ok("audit_trail.csv contains no N/A cell", !audit.some(r=>r.some(c=>c.trim()==="N/A")),
   JSON.stringify((audit.find(r=>r.some(c=>c.trim()==="N/A"))||[]).slice(0,3)));
ok("audit header 'Is it a skill? — Final Decision'", audit[0].includes("Is it a skill? — Final Decision"));
ok("audit has a market-pulse Reason column", audit[0].includes("Has market pulse? — Reason"));
ok("audit has Failed / Pending / Decisive Checks", ["Failed Checks","Pending Checks","Decisive Checks"].every(h=>audit[0].includes(h)));
(function(){
  const h = audit[0], row = audit.find(r=>r[0]===ROLE.g2_only_learnability), t = T("g2_only_learnability");
  const urls = t.checks.meets_definition.learnability.evidence.map(e=>e.url);
  ok("audit learnability cell carries the real evidence URLs", urls.length>0 && urls.every(u=>row[h.indexOf("Meets skill definition? — Learnability Evidence")].includes(u)));
  eq("audit market pulse output = Pending", row[h.indexOf("Has market pulse? — Output")], "Pending");
  eq("audit market pulse Override? = not overridable", row[h.indexOf("Has market pulse? — Override?")], "No (pending — not overridable)");
})();
const failed = rowsOf("failed_skills.csv");
eq("failed_skills.csv column count", failed[0].length, 17);
eq("failed_skills.csv row count (header + 6)", failed.length, 7);
ok("failed_skills.csv uses 'Failed:' not 'Failed at:'", failed[0].includes("Failed: Is it a skill?") && !failed[0].some(h=>h.startsWith("Failed at:")));
(function(){
  const h = failed[0], row = failed.find(r=>r[0]===ROLE.multi_g0_g1_g2);
  ok("multi-fail row flags THREE failed checks",
     ["Failed: Is it a skill?","Failed: Already in taxonomy?","Failed: Meets skill definition?"].every(c=>row[h.indexOf(c)]==="Yes"), JSON.stringify(row.slice(0,10)));
  eq("multi-fail row: Failed Check Count = 3", row[h.indexOf("Failed Check Count")], "3");
  eq("multi-fail row: not one override from not failing", row[h.indexOf("One Override From Not Failing?")], "No");
  eq("multi-fail row: market pulse = Pending", row[h.indexOf("Failed: Has market pulse?")], "Pending");
  const g = failed.find(r=>r[0]===ROLE.g1_only);
  eq("single-fail row: one override from not failing", g[h.indexOf("One Override From Not Failing?")], "Yes");
  eq("single-fail row: decisive check named", g[h.indexOf("Decisive Check")], "Already in taxonomy?");
  eq("single-fail row: overriding it gives PROVISIONAL", g[h.indexOf("Status If Decisive Check Overridden")], "PROVISIONAL");
  eq("single-fail row: duplicate named", g[h.indexOf("Duplicate to Existing Skill")], T("g1_only").checks.not_in_taxonomy.matched_skill_title);
})();
const summ = rowsOf("summary_metrics.csv");
ok("summary_metrics.csv uses 'Failed check:' rows", summ.some(r=>r[0]==="Failed check: Meets skill definition?"));
ok("summary_metrics.csv has no 'Stopped at' rows", !summ.some(r=>/Stopped at/.test(r[0])));
ok("summary_metrics.csv reports one-override-from-not-failing", summ.some(r=>/^Fail One Check Only/.test(r[0]) && r[1]==="4"));
const passedCsv = rowsOf("passed_and_provisional_skills.csv");
eq("passed_and_provisional_skills.csv row count (header + 2)", passedCsv.length, 3);
ok("passed_and_provisional_skills.csv lists market pulse as pending", passedCsv.slice(1).every(r=>r[passedCsv[0].indexOf("Pending Checks")]==="Has market pulse?"));

// ------------------------------------------------------------- 10. metrics
hdr("10. Summary metrics");
fresh();
const m = api.metrics();
eq("f0..f3 = failed-check counts", [m.f0,m.f1,m.f2,m.f3], [2,3,4,0]);
eq("p3 = market pulse pending for all 8", [m.p0,m.p1,m.p2,m.p3,m.anyPending], [0,0,0,8,8]);
eq("singleFail", m.singleFail, 4);
eq("failures by count fc1..fc4", [m.fc1,m.fc2,m.fc3,m.fc4], [4,1,1,0]);
eq("passed/provisional/failed/overridden", [m.passed,m.provisional,m.failed,m.overridden], [0,2,6,0]);
eq("metrics == oracle", m, golden.metrics);
ok("f0..f3 sum >= failed (multi-fail terms counted more than once)", m.f0+m.f1+m.f2+m.f3 >= m.failed);

// --------------------------------------------------------- 11. render smoke
hdr("11. Render smoke tests");
fresh();
const termCardHTML = api.fns("termCardHTML"), checkPanelHTML = api.fns("checkPanelHTML");
const R = api.getResults();
const iProv = R.findIndex(r=>r.provisional),
      iOne  = R.findIndex(r=>r.sk.id===ROLE.g1_only),
      iMany = R.findIndex(r=>r.failedChecks.length>1),
      iDef  = R.findIndex(r=>r.sk.id===ROLE.g2_only_learnability);
[["provisional",iProv],["single-fail",iOne],["multi-fail",iMany]].forEach(([label,i])=>{
  const open = termCardHTML(R[i], i, true), shut = termCardHTML(R[i], i, false);
  ok(`${label} card: expanded renders 4 check panels`, (open.match(/class="gcard-top"/g)||[]).length===4, String((open.match(/class="gcard-top"/g)||[]).length));
  ok(`${label} card: collapsed renders none`, !shut.includes('class="gcard-top"'));
  ok(`${label} card: 4 chips in the header strip`, (open.match(/class="chip /g)||[]).length===4);
  ok(`${label} card: override switch on the 3 completed checks, none on pending`, (open.match(/data-ov="/g)||[]).length===3 && !open.includes(`data-ov="${i}:3"`));
  ok(`${label} card: what-if note on every check`, (open.match(/What-if:/g)||[]).length===4);
  ok(`${label} card: market pulse chip shows pending`, open.includes('class="chip pend'));
  ok(`${label} card: no unbalanced template literal leak`, !open.includes("${"));
});
ok("provisional term card is marked PROVISIONAL", termCardHTML(R[iProv],iProv,false).includes('class="pill prov dot">PROVISIONAL<'));
ok("failing term card is marked FAIL", termCardHTML(R[iMany],iMany,false).includes(">FAIL<"));
eq("decisive marks on a single-fail card", (termCardHTML(R[iOne],iOne,true).match(/⚡ decisive/g)||[]).length, 1);
eq("decisive marks on a multi-fail card", (termCardHTML(R[iMany],iMany,true).match(/⚡ decisive/g)||[]).length, 0);
eq("decisive marks on a provisional card (3 completed checks)", (termCardHTML(R[iProv],iProv,true).match(/⚡ decisive/g)||[]).length, 3);
(function(){
  const t = T("g2_only_learnability"), d = t.checks.meets_definition;
  const ev = [...d.learnability.evidence, ...d.demonstrability.evidence];
  const html = checkPanelHTML(R[iDef],iDef,2);
  ok("evidence panel rendered on check 3", html.includes('class="evidence"'));
  ok("every real evidence URL is a clickable link", ev.length>0 && ev.every(e=>html.includes(`href="${e.url.replace(/&/g,"&amp;")}"`)), String(ev.length));
  eq("one evidence item rendered per source", (html.match(/class="ev-item"/g)||[]).length, ev.length);
  ok("region groups use Local (Singapore) / International", ev.some(e=>e.region==="Local") ? html.includes("Local (Singapore)") : html.includes(">International<"));
  eq("relevance badges (direct/adjacent) per item", (html.match(/class="ev-tag rel-(direct|adjacent)"/g)||[]).length, ev.length);
  ok("gap note and rationale shown", html.includes("Search notes:") && html.includes("Rationale:"));
  ok("no synthetic Google-search links", !html.includes("google.com/search"));
})();
ok("closest-match badges rendered on check 2", checkPanelHTML(R[iOne],iOne,1).includes('class="badges"') && checkPanelHTML(R[iOne],iOne,1).includes(esc(T("g1_only").checks.not_in_taxonomy.matched_skill_title)));
ok("is-it-a-skill reasoning rendered on check 1", checkPanelHTML(R[iOne],iOne,0).includes("Reasoning:"));
ok("check 4 shows the pending note and no override switch",
   checkPanelHTML(R[0],0,3).includes('class="pending-note"') && checkPanelHTML(R[0],0,3).includes(api.PENDING_TEXT) && !checkPanelHTML(R[0],0,3).includes("data-ov="));
ok("reason box appears once a check is overridden", (function(){
  const q=api.toQueue(fixture.terms); q[0].overrides={1:true}; const out=api.setQueue(q);
  return checkPanelHTML(out[0],0,1).includes('data-reason="0:1"'); })());
fresh();
ok("renderReport (simple) has a 'Failed checks' column", src.includes(">Failed checks</th>"));
ok("report has a Decisive column", src.includes(">Decisive</th>"));
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

// ------------------------------------------------ 12. pending / PROVISIONAL
hdr("12. Pending state + PROVISIONAL roll-up");
(function(){
  // Whole cohort: pending is never decisive, and the roll-up matches the data's own overall.
  const all = api.setQueue(api.toQueue(DATA.terms));
  ok("pending never decisive (all 304 terms)", all.every(r=>r.gateRows.every((g,i)=>!g.pending || !r.decisive[i])));
  ok("pending never counted as a failure (all 304)", all.every(r=>r.pendingChecks.every(i=>!r.failedChecks.includes(i))));
  const bad = all.filter((r,i)=>r.status!==DATA.terms[i].overall);
  ok("roll-up status == data overall for all 304 terms", bad.length===0, bad.slice(0,3).map(r=>r.sk.id).join(","));
  const badF = all.filter((r,i)=>JSON.stringify(r.failedChecks)!==JSON.stringify(DATA.terms[i].failed_checks.map(k=>CHECK_KEYS.indexOf(k))));
  ok("failed checks == data failed_checks for all 304 terms", badF.length===0, badF.slice(0,3).map(r=>r.sk.id).join(","));
  const cm = api.metrics(), cnt = s => DATA.terms.filter(t=>t.overall===s).length;
  eq("cohort metrics: pass / provisional / fail match the data", [cm.passed,cm.provisional,cm.failed], [cnt("PASS"),cnt("PROVISIONAL"),cnt("FAIL")]);
})();
fresh();
(function(){
  const r = byId(api.getResults(), ROLE.provisional_a);
  eq("PROVISIONAL roll-up: all completed checks pass + market pulse pending", [r.status, r.failedChecks, r.pendingChecks], ["PROVISIONAL", [], [3]]);
  ok("PROVISIONAL is neither passed nor failed", r.provisional && !r.passed && !r.failed);
  // Test-only construct: the same real term with market pulse completed as a pass -> PASS, all four decisive.
  const q = api.toQueue([T("provisional_a")]); q[0].checks = JSON.parse(JSON.stringify(q[0].checks));
  q[0].checks.market_pulse = {status:"pass"};
  const p = api.setQueue(q)[0];
  eq("PASS roll-up once no check is pending", [p.status, idxs(p.decisive)], ["PASS", [0,1,2,3]]);
  q[0].checks.market_pulse = {status:"fail"};
  eq("FAIL roll-up when market pulse fails (G3 then overridable + decisive)", [api.setQueue(q)[0].status, idxs(api.getResults()[0].decisive), api.getResults()[0].gateRows[3].overridable], ["FAIL",[3],true]);
})();
(function(){
  const r = withOverride("provisional_a", 3, "try to force market pulse");
  ok("pending check is not overridable", r.gateRows[3].overridable===false && r.gateRows[3].overridden===false);
  eq("override on pending is ignored: still PROVISIONAL, 0 overrides", [r.status, r.gateRows[3].finalStatus, r.overrideCount], ["PROVISIONAL","pending",0]);
  eq("pending what-if note", r.flipNote[3], "Pending — cannot be overridden until job-posting data is available");
})();
(function(){
  fresh();
  const r = byId(api.getResults(), ROLE.g1_only);
  ok("sole failure with a pending check IS decisive", r.decisive[1]===true && r.pendingChecks.length===1);
  eq("its what-if says it becomes PROVISIONAL", r.flipNote[1], "Override → this term becomes PROVISIONAL (market pulse still pending)");
  const o = withOverride("g1_only", 1, "not a true duplicate");
  eq("override of that sole failure -> PROVISIONAL", [o.status, o.failedChecks], ["PROVISIONAL", []]);
  api.exportPassed(); api.exportFailed(); api.exportAudit(); api.exportSummary();
  const pp = parseCSV(csv["passed_and_provisional_skills.csv"]), row = pp.find(x=>x[0]===ROLE.g1_only);
  ok("after override the term moves to the passed/provisional export as PROVISIONAL", row && row[pp[0].indexOf("Final Status")]==="PROVISIONAL");
  ok("after override it is gone from failed_skills.csv", !parseCSV(csv["failed_skills.csv"]).some(x=>x[0]===ROLE.g1_only));
})();
(function(){
  fresh();
  api.exportPassed(); api.exportFailed(); api.exportAudit(); api.exportSummary();
  const status = f => { const rows = parseCSV(csv[f]); const k = rows[0].indexOf("Final Status"); return k<0 ? null : rows.slice(1).map(r=>r[k]); };
  eq("passed_and_provisional export: Final Status column = PROVISIONAL x2", status("passed_and_provisional_skills.csv"), ["PROVISIONAL","PROVISIONAL"]);
  ok("failed export: Final Status column = FAIL", (status("failed_skills.csv")||[]).length===6 && status("failed_skills.csv").every(s=>s==="FAIL"));
  eq("audit export: Final Status includes PROVISIONAL", (status("audit_trail.csv")||[]).filter(s=>s==="PROVISIONAL").length, 2);
  const sm = parseCSV(csv["summary_metrics.csv"]);
  eq("summary export: Final Status: PROVISIONAL row", (sm.find(r=>r[0]==="Final Status: PROVISIONAL")||[])[1], "2");
  ok("summary export: Final Status: PASS and FAIL rows", sm.some(r=>r[0]==="Final Status: PASS") && sm.some(r=>r[0]==="Final Status: FAIL"));
  eq("summary export: market pulse pending row", (sm.find(r=>r[0]==="Pending: Has market pulse?")||[])[1], "8");
})();
(function(){
  // Review filters include PROVISIONAL.
  fresh(); const fi = api.fns("filteredIdx");
  api.setRevFilter({status:"PROVISIONAL"}); eq("status filter PROVISIONAL", fi().map(i=>api.getResults()[i].sk.id), [ROLE.provisional_a, ROLE.provisional_b]);
  api.setRevFilter({status:"FAIL"});        eq("status filter FAIL", fi().length, 6);
  api.setRevFilter({check:"single"});       eq("check filter: fails exactly one", fi().length, 4);
  api.setRevFilter({check:"1"});            eq("check filter: failed taxonomy", fi().length, 3);
  api.setRevFilter({q:T("g0_only").title}); ok("search by title", fi().some(i=>api.getResults()[i].sk.id===ROLE.g0_only));
  api.setRevFilter({});
})();

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
eq("market-pulse banner appears exactly once", src.split("Market pulse check not yet run — provisional results may still fail when job-posting data is added.").length-1, 1);
ok("no mention of an 18-term set", !/18[- ]term|\b18 terms\b|11\/18/.test(src));
ok("template (UI text, no data) never mentions v1 / v2", !/\bv[12]\b/i.test(TEMPLATE));

// ------------------------------------------------------------------- result
console.log("\n" + (fails ? `RESULT: ${fails} FAILED of ${checks}` : `RESULT: ${checks}/${checks} passed`));
process.exit(fails ? 1 : 0);
