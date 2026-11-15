/* External HTTP smoke check: never logs in, clicks destructive controls, or sends private content. */
import fs from "node:fs";
const base = process.env.Z_LIVE_URL || "https://jackbwe233.github.io/Project-z/";
const routes = [
  ["", /project z/i],
  ["music.html", /Z Music/i],
  ["personal.html", /Z.*Personal/i],
  ["paper.html", /Stock Workbench/i],
  ["account.html", /Z.*Account/i],
  ["quick.html", /Talk.*Capture/i],
  ["plugins.html", /Plugins|Apps/i],
  ["notes.html", /Notes/i],
  ["work.html", /Work/i],
  ["focus.html", /Focus/i],
  ["research.html", /Research/i],
  ["z-trading-chart.js", /mountChart/],
  ["music.js", /loadSongs/],
];
const results=[];
for (const [route, pattern] of routes) {
  const url = new URL(route, base).href;
  let result;
  for (let attempt=0; attempt<2; attempt++) {
    try {
      const res=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{"Cache-Control":"no-cache"}});
      const body=await res.text();
      if (!res.ok) throw new Error("HTTP " + res.status);
      if(!pattern.test(body)) throw new Error("Unexpected page content (possibly stale deployment)");
      result={route:route||"index.html",ok:true,status:res.status};
      break;
    } catch(e) {
      result={route:route||"index.html",ok:false,error:String(e?.message||e).slice(0,240)};
      if(attempt===0) await new Promise(resolve=>setTimeout(resolve,1500));
    }
  }
  results.push(result);
  console.log((result.ok?"PASS":"FAIL")+" "+result.route+(result.error?" "+result.error:""));
}
const report={checkedAt:new Date().toISOString(),base,passed:results.filter(r=>r.ok).length,total:results.length,results};
fs.mkdirSync("health-reports",{recursive:true});
fs.writeFileSync("health-reports/live.json",JSON.stringify(report,null,2)+"\n");
if(report.passed!==report.total) process.exitCode=1;
