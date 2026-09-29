// Headless loader for index.html — extracts the single inline <script> block, stubs just
// enough DOM, and exposes the module's lexical bindings via __api. No jsdom needed.
const fs = require("fs"), vm = require("vm"), path = require("path");

function fakeEl(tag){
  const e = {
    tagName:(tag||"div").toUpperCase(), className:"", id:"", innerHTML:"", textContent:"",
    value:"", checked:false, disabled:false, href:"", download:"", hidden:false,
    children:[], style:{}, dataset:{},
    classList:{ _s:new Set(), add(...c){c.forEach(x=>this._s.add(x));}, remove(...c){c.forEach(x=>this._s.delete(x));},
                toggle(c,f){ f===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c)) : (f?this._s.add(c):this._s.delete(c)); },
                contains(c){return this._s.has(c);} },
    appendChild(c){ this.children.push(c); return c; },
    append(...c){ c.forEach(x=>this.children.push(x)); },
    remove(){}, focus(){}, click(){}, scrollIntoView(){},
    setAttribute(k,v){ this[k]=v; }, getAttribute(k){ return this[k]; }, removeAttribute(k){ delete this[k]; },
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return fakeEl("div"); },
    querySelectorAll(){ return []; },
    closest(){ return null; },
    insertAdjacentHTML(){},
  };
  return e;
}

// RFC-4180-ish parser used only by the tests to read the page's CSV exports back.
function parseCSV(text){ const rows=[]; let row=[],cur="",q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(cur);cur="";} else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur="";}
      else if(c==='\r'){} else cur+=c; } }
  if(cur!==""||row.length){ row.push(cur); rows.push(row); } return rows.filter(r=>r.some(x=>x.trim()!==""));
}

function load(htmlPath){
  const html = fs.readFileSync(htmlPath, "utf8");
  const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
  if(!m) throw new Error("no <script> block found");
  let src = m[1].replace(/\ninit\(\);\s*$/, "\n");

  src += `
;globalThis.__CSV = {};
download = function(n,t){ globalThis.__CSV[n] = t; };
globalThis.__api = {
  TRIAL, GATES, STEPS, CHECK_NAMES, PENDING_TEXT, REV_PAGE_SIZE,
  toQueue, displayOrder, skillLikeScore, CONTESTED, evalGates, runPipeline, failureReason, evidenceFor, metrics, machineLabel,
  exportPassed, exportFailed, exportSummary, exportAudit, toCSV,
  fns: (n)=> (typeof eval(n)==="function" ? eval(n) : undefined),
  setQueue(q){ queue = q; queueChanged(); return results; },
  getResults(){ return results; },
  getQueue(){ return queue; },
  setPage(p){ page = p; },
  getPage(){ return page; },
  setRevFilter(f){ revFilter = Object.assign({status:"all",check:"any",q:""}, f); revPinned = new Set(); revPageNo = 0; },
};
`;

  const doc = fakeEl("document");
  doc.body = fakeEl("body");
  doc.documentElement = fakeEl("html");
  doc.createElement = fakeEl;
  doc.getElementById = ()=>fakeEl("div");
  doc.querySelector = ()=>fakeEl("div");
  doc.querySelectorAll = ()=>[];
  doc.addEventListener = ()=>{};

  const sandbox = {
    document: doc,
    window: { addEventListener(){}, matchMedia:()=>({matches:false, addEventListener(){}}),
              innerWidth:1200, innerHeight:900, scrollY:0, location:{href:""}, scrollTo(){} },
    navigator: { userAgent:"node" },
    localStorage: { _d:{}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} },
    Blob: function(parts){ this.parts = parts; },
    URL: { createObjectURL:()=> "blob:mock", revokeObjectURL(){} },
    setTimeout, clearTimeout, console, Math, Date, JSON,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: path.basename(htmlPath) });
  return { api: sandbox.__api, csv: sandbox.__CSV, sandbox, html };
}

module.exports = { load, fakeEl, parseCSV };
