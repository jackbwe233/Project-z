import { describe, expect, it } from "vitest";
import { accountStorage, resolvePersonalScope, authConfigured } from "../lib/z-account-scope.js";

const config = { url:"https://test-project.supabase.co", publishableKey:"sb_publishable_1234567890123456789012345678" };
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const data = () => {
  const map = new Map();
  return { getItem:k=>map.get(k)??null, setItem:(k,v)=>map.set(k,v), removeItem:k=>map.delete(k) };
};
describe("Account-local personal memory isolation", () => {
  it("does not accept secret keys or unconfigured authentication", () => {
    expect(authConfigured({url:"",publishableKey:""})).toBe(false);
    expect(authConfigured({url:config.url,publishableKey:"sb_secret_1234567890123456789012345678"})).toBe(false);
  });
  it("keeps each verified account's memory separate from guest and other users", async () => {
    const storage = data();
    storage.setItem("project-z:learning:v1","guest memory");
    const a = await resolvePersonalScope(storage,{config,loadClient:async()=>({auth:{getUser:async()=>({data:{user:{id:userA}},error:null})}})});
    const b = await resolvePersonalScope(storage,{config,loadClient:async()=>({auth:{getUser:async()=>({data:{user:{id:userB}},error:null})}})});
    a.storage.setItem("project-z:learning:v1","user A");
    b.storage.setItem("project-z:learning:v1","user B");
    expect(a.storage.getItem("project-z:learning:v1")).toBe("user A");
    expect(b.storage.getItem("project-z:learning:v1")).toBe("user B");
    expect(storage.getItem("project-z:learning:v1")).toBe("guest memory");
  });
  it("uses guest keys when no verified session exists", async () => {
    const storage = data();
    const scope = await resolvePersonalScope(storage,{config,loadClient:async()=>({auth:{getUser:async()=>({data:{user:null},error:{name:"AuthSessionMissingError"}})}})});
    expect(scope.identity).toBe("guest");
    expect(scope.storage).toBe(storage);
  });
  it("locks access when the provider cannot verify identity", async () => {
    const storage = data();
    await expect(resolvePersonalScope(storage,{config,loadClient:async()=>({auth:{getUser:async()=>({data:{user:null},error:new Error("Network unavailable")})}})})).rejects.toThrow("Network unavailable");
  });
  it("rejects arbitrary identity strings", () => {
    expect(() => accountStorage(data(),"../../guest")).toThrow();
  });
});
