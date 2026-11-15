import { describe, expect, it } from "vitest";
import {
  WORK_KEY, prepareWork, searchTasks, safeWorkSource, workBrief, parseWorkHistory,
} from "../lib/z-work.js";
describe("Z Work quick jobs",()=>{
  it("prepares a detailed work plan without network or model loading",()=>{
    const p=prepareWork({task:"Launch a clothing brand",mode:"plan"});
    expect(WORK_KEY).toContain("work");
    expect(p.steps).toHaveLength(4);
    expect(workBrief(p)).toContain("No external actions");
    expect(workBrief(p)).toContain("Launch a clothing brand");
  });
  it("prepares review-only GitHub coding requests",()=>{
    const p=prepareWork({task:"Change Z sidebar",mode:"code"});
    expect(workBrief(p)).toContain("Do not merge");
    expect(workBrief(p)).toContain("has not been sent");
  });
  it("bounds queries, validates tasks and rejects untrusted source links",()=>{
    expect(()=>prepareWork({task:"",mode:"plan"})).toThrow();
    expect(()=>prepareWork({task:"task",mode:"trade"})).toThrow();
    expect(searchTasks("hockey clothing")).toHaveLength(3);
    expect(safeWorkSource({url:"javascript:alert(1)"})).toBe(null);
    expect(safeWorkSource({url:"https://example.org/a",title:"Report",snippet:"Intro"})).toMatchObject({url:"https://example.org/a"});
  });
  it("creates source-linked briefs and rejects malformed history",()=>{
    const p=prepareWork({task:"Research sports business",mode:"research"});
    const brief=workBrief(p,[{heading:"Sources",sources:[{title:"Example",url:"https://example.org/report",snippet:"Sample"}]}]);
    expect(brief).toContain("https://example.org/report");
    expect(brief).toContain("not verified");
    expect(parseWorkHistory([{id:"job",task:p.task,mode:p.mode,createdAt:p.createdAt,brief}])[0].brief).toBe(brief);
    expect(()=>parseWorkHistory([{mode:"unknown"}])).toThrow();
  });
});
