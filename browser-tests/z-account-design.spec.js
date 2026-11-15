import { test, expect } from "@playwright/test";

test("Z accounts show setup status when authentication is not configured", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/account.html");
  await expect(page.getByRole("heading", { name: "Welcome to Z." })).toBeVisible();
  await expect(page.locator("#setup-required")).toBeVisible();
  await expect(page.locator("#email-panel")).toBeHidden();
  await expect(page.locator("#signed-in")).toBeHidden();
  await expect(page.getByRole("link", { name: /Continue without an account/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Z account requests secure sign-up or login magic links when configured", async ({ page }) => {
  await page.route("**/z-auth-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: 'export const Z_AUTH_CONFIG = { url: "https://example-company.supabase.co", publishableKey: "sb_publishable_1234567890123456789012345678" };',
  }));
  await page.route("https://esm.sh/@supabase/supabase-js@2.75.0", route => route.fulfill({
    contentType: "application/javascript",
    headers: { "access-control-allow-origin": "*" },
    body: 'export function createClient(){window.mockAuth={requests:[]};return{auth:{async getSession(){return{data:{session:null},error:null}},onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},async signInWithOtp(options){window.mockAuth.requests.push(options);return{data:{},error:null}},async signOut(){return{error:null}}}}}',
  }));
  await page.goto("/account.html");
  await expect(page.locator("#email-panel")).toBeVisible();
  await expect(page.locator("#setup-required")).toBeHidden();
  await page.locator("#account-email").fill("student@example.com");
  await page.getByRole("button", { name: "Create account with email" }).click();
  await expect(page.locator("#auth-status")).toContainText("Check your email");
  const signup = await page.evaluate(() => window.mockAuth.requests.at(-1));
  expect(signup.email).toBe("student@example.com");
  expect(signup.options.shouldCreateUser).toBe(true);
  expect(signup.options.emailRedirectTo).toContain("/account.html");
  await page.locator("#mode-login").click();
  await page.locator("#account-email").fill("student@example.com");
  await page.getByRole("button", { name: "Send login link" }).click();
  await expect(page.locator("#auth-status")).toContainText("Check your email");
  const login = await page.evaluate(() => window.mockAuth.requests.at(-1));
  expect(login.options.shouldCreateUser).toBe(false);
});

test("Z signs out without deleting locally saved work", async ({ page }) => {
  await page.route("**/z-auth-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: 'export const Z_AUTH_CONFIG = { url: "https://example-company.supabase.co", publishableKey: "sb_publishable_1234567890123456789012345678" };',
  }));
  await page.route("https://esm.sh/@supabase/supabase-js@2.75.0", route => route.fulfill({
    contentType: "application/javascript",
    headers: { "access-control-allow-origin": "*" },
    body: 'export function createClient(){return{auth:{async getSession(){return{data:{session:{user:{email:"member@example.com"}}},error:null}},onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},async signOut(){return{error:null}}}}}',
  }));
  await page.addInitScript(() => { localStorage.setItem("z-personal-tasks-v1", JSON.stringify([{id:"1",title:"Saved task",date:"2026-11-15",time:"",type:"Task",done:false}])); });
  await page.goto("/account.html");
  await expect(page.locator("#signed-in")).toBeVisible();
  await expect(page.locator("#user-email")).toHaveText("member@example.com");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("#email-panel")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("z-personal-tasks-v1"))).toContain("Saved task");
});

test("All Z tool tabs use matching dark theme and consistent account navigation", async ({ page }) => {
  for (const path of [
    "/account.html","/privacy.html","/personal.html","/notes.html","/quick.html",
    "/paper.html","/research.html","/focus.html","/plugins.html","/google.html",
    "/code-lab.html","/command-center.html","/shortcut.html","/recovery.html"
  ]) {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Z app navigation" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name:"Account" })).toBeVisible();
    const state = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      return {
        color: body.color,
        background: body.backgroundColor,
        workspace: document.body.classList.contains("z-workspace"),
        shell: Boolean(document.querySelector(".z-shell")),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(state.workspace, path).toBe(true);
    expect(state.shell, path).toBe(true);
    expect(state.color, path).toBe("rgb(237, 242, 250)");
    expect(state.background, path).toBe("rgb(11, 17, 28)");
    expect(state.overflow, path).toBeLessThanOrEqual(2);
  }
});
