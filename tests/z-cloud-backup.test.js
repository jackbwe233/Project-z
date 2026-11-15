import { describe, it, expect } from "vitest";
import { SYNC_KEYS, collectLocalBackup, validateBackup, applyCloudBackup } from "../lib/z-cloud-backup.js";

function storage(seed={}){
 const entries=new Map(Object.entries(seed));
 return {getItem:key=>entries.has(key)?entries.get(key):null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
}
describe("private cloud backup",()=>{
 it("only selects named non-secret app data",()=>{
  const s=storage({"z-personal-tasks-v1":"[]","secret-token":"never upload","project-z:paper-account:v1":"{}"});
  const backup=collectLocalBackup(s);
  expect(backup.values["z-personal-tasks-v1"]).toBe("[]");
  expect(backup.values["project-z:paper-account:v1"]).toBe("{}");
  expect(backup.values["secret-token"]).toBeUndefined();
  expect(SYNC_KEYS).not.toContain("secret-token");
 });
 it("rejects unexpected and oversized backups",()=>{
  expect(()=>validateBackup({version:1,values:{"z-music-finder-v1":42}})).toThrow();
  expect(()=>validateBackup({version:1,values:{"z-music-finder-v1":"x".repeat(500001)}})).toThrow();
  expect(()=>validateBackup({version:2,values:{}})).toThrow();
 });
 it("keeps a rollback before replacing account data",()=>{
  const s=storage({"z-personal-tasks-v1":"old"});
  applyCloudBackup({version:1,values:{"z-personal-tasks-v1":"new"}},s);
  expect(s.getItem("z-personal-tasks-v1")).toBe("new");
  expect(JSON.parse(s.getItem("z-cloud-backup-rollback-v1")).values["z-personal-tasks-v1"]).toBe("old");
 });
});
