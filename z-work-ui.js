import { ExaMcpSearchProvider } from "./lib/exa-search.js";
import {
  WORK_KEY, prepareWork, searchTasks, safeWorkSource, workBrief, parseWorkHistory,
} from "./lib/z-work.js";

const $ = id => document.getElementById(id);
const status = message => { $("work-status").textContent = message; };
const action = message => { $("work-action-status").textContent = message; };
const make = (tag,text) => {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  return el;
};
let running = null, active = null, history = [];
try { history = parseWorkHistory(JSON.parse(localStorage.getItem(WORK_KEY)||"[]")); }
catch { status("Couldn't read the old saved jobs. You can still start a new job; existing data was not changed."); }
const jobs = [
  { label:"Official sources", desc:"Looking for authoritative information" },
  { label:"Recent context", desc:"Looking for current details and independent coverage" },
  { label:"Risks and limits", desc:"Looking for evidence gaps and alternatives" },
];
const updateSteps = (plan, messages) => {
  const node = $("work-steps"); node.replaceChildren();
  plan.steps.forEach((text,index) => {
    const row = make("div"); row.className = "step";
    const badge = make("span",String(index+1)); badge.className = "bubble";
    const desc = make("div");
    desc.append(make("strong",text));
    const state = make("p",messages[index]||"Waiting");
    desc.append(state); row.append(badge,desc); node.append(row);
  });
};
function renderHistory() {
  const root = $("work-history"); root.replaceChildren();
  if (!history.length) { root.append(make("p","No saved jobs yet."));return; }
  for (const entry of history) {
    const row = make("div"); row.className="history-item";
    const detail=make("div");detail.append(make("strong",entry.task.slice(0,110)));
    detail.append(make("small",entry.mode+" · "+new Date(entry.createdAt).toLocaleString()));
    const open=make("button","Open");open.type="button";
    open.addEventListener("click",()=>{
      active={plan:entry,brief:entry.brief,batches:[]};
      $("work-brief").value=entry.brief;
      $("work-output").hidden=false;
      $("research-results").hidden=true;
      action("Saved draft opened for your review.");
      $("work-output").scrollIntoView({behavior:"smooth",block:"start"});
    });
    row.append(detail,open);root.append(row);
  }
}
function showResult(plan, batches) {
  const report=workBrief(plan,batches);
  active={plan,brief:report,batches};
  $("work-brief").value=report;
  const results=$("research-results");results.replaceChildren();
  if(plan.mode==="research"){
    for(const batch of batches){
      const group=make("div");group.className="evidence";
      group.append(make("strong",batch.heading));
      if(!batch.sources.length)group.append(make("p",batch.error||"No usable sources."));
      for(const source of batch.sources){
        const item=make("div");item.style.marginTop="10px";
        const a=make("a",source.title);a.href=source.url;a.target="_blank";a.rel="noopener noreferrer";
        item.append(a,make("small",source.snippet));group.append(item);
      }
      results.append(group);
    }
    results.hidden=false;
  } else results.hidden=true;
  $("work-output").hidden=false;
  action("Ready for review. Nothing was sent, saved or changed outside this page.");
}
function markBusy(value) {
  $("work-run").disabled=value;
  $("work-stop").disabled=!value;
  $("work-task").disabled=value;
  $("work-mode").disabled=value;
}
async function run() {
  let plan;
  try {plan=prepareWork({task:$("work-task").value,mode:$("work-mode").value});}
  catch(e){status(e.message);return;}
  if(running)return;
  active=null;
  $("work-output").hidden=true;
  const stepStates=plan.steps.map((_,i)=>i===0?"Starting…":"Waiting");
  updateSteps(plan,stepStates);
  status("Starting "+plan.mode+" work. You can stop research at any time.");
  markBusy(true);
  const controller=new AbortController();
  running=controller;
  try {
    if (plan.mode!=="research") {
      stepStates.fill("Prepared instantly · review below");
      updateSteps(plan,stepStates);
      showResult(plan,[]);
      status("Plan prepared. No model download, network request or external action.");
      return;
    }
    const provider=new ExaMcpSearchProvider();
    const queries=searchTasks(plan.task);
    const labels=jobs.map(x=>x.label);
    const batches=await Promise.all(queries.map(async(query,index)=>{
      const one=new AbortController();
      const abort=()=>one.abort();
      controller.signal.addEventListener("abort",abort,{once:true});
      const timer=setTimeout(()=>one.abort(),12000);
      stepStates[index]="Searching public sources…";
      updateSteps(plan,stepStates);
      try{
        const response=await provider.search(query,{signal:one.signal,maxResults:3,maxTotalChars:5000});
        controller.signal.throwIfAborted();
        const sources=(response.results||[]).map(safeWorkSource).filter(Boolean).slice(0,3);
        stepStates[index]=sources.length?sources.length+" source(s) found":"No sources returned";
        updateSteps(plan,stepStates);
        return {heading:labels[index],sources,error:sources.length?"":"No usable sources returned."};
      }catch(error){
        if(controller.signal.aborted)throw error;
        stepStates[index]=one.signal.aborted?"Search timed out":"Search unavailable";
        updateSteps(plan,stepStates);
        return {heading:labels[index],sources:[],error:one.signal.aborted?"Search timed out.":"Search unavailable. Try again."};
      }finally{
        clearTimeout(timer);
        controller.signal.removeEventListener("abort",abort);
      }
    }));
    controller.signal.throwIfAborted();
    stepStates[3]="Prepared · ready for review";
    updateSteps(plan,stepStates);
    showResult(plan,batches);
    const count=batches.reduce((n,b)=>n+b.sources.length,0);
    status("Work complete. "+count+" public source(s) retrieved. Review before using.");
  } catch(e){
    status(controller.signal.aborted?"Work stopped. No external changes were made.":"Work couldn't complete: "+e.message);
    stepStates[3]="No draft prepared";
    updateSteps(plan,stepStates);
  } finally {running=null;markBusy(false);}
}
$("work-form").addEventListener("submit",e=>{e.preventDefault();void run();});
$("work-stop").addEventListener("click",()=>running?.abort());
window.addEventListener("pagehide",()=>running?.abort());
$("work-copy").addEventListener("click",async()=>{
  if(!active)return;
  try{await navigator.clipboard.writeText(active.brief);action("Copied to clipboard.");}
  catch{$("work-brief").select();action("Clipboard unavailable; select Copy for the highlighted text.");}
});
$("work-save").addEventListener("click",()=>{
  if(!active)return;
  const entry={
    ...active.plan,id:crypto.randomUUID?.() || String(Date.now())+"-"+Math.random(),
    brief:active.brief,
  };
  try{
    const next=[entry,...history].slice(0,15);
    localStorage.setItem(WORK_KEY,JSON.stringify(next));
    history=next;renderHistory();action("Saved locally on this device.");
  }catch{action("Could not save locally. Copy your results instead.");}
});
$("work-chat").addEventListener("click",()=>{
  if(!active)return;
  const brief=active.brief;
  if(window.parent!==window){
    window.parent.postMessage({type:"z:insert-draft",text:brief},location.origin);
    return;
  }
  try{
    sessionStorage.setItem("project-z:tool-draft:v1",brief);
    location.href="./index.html?z_start=1";
  }catch{action("Could not transfer to Z Chat. Use Copy instead.");}
});
renderHistory();
$("work-run").disabled=false;
status("Ready. Work opens without loading an AI model.");
