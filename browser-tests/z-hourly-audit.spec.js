import { test, expect } from "@playwright/test";

/* This suite runs hourly in clean browser profiles. Destructive operations aren't clicked.
 * Existing feature tests validate important button behavior with test-only data.
 */
const routes = ["/index.html?z_start=1", "/music.html", "/personal.html", "/paper.html",
  "/account.html", "/quick.html", "/notes.html", "/plugins.html",
  "/focus.html", "/work.html", "/research.html", "/command-center.html"];

for (const route of routes) {
  test("Every hour: UI loads and buttons can be reached on " + route, async ({ page }) => {
    const failures = [];
    page.on("pageerror", error => failures.push(error.message));
    const response = await page.goto(route, {waitUntil:"domcontentloaded"});
    expect(response?.ok(),route).toBe(true);
    await expect(page.locator("body")).toBeVisible();
    const report = await page.evaluate(() => {
      const elements = [...document.querySelectorAll("button, input[type=button], input[type=submit]")];
      const interactive = elements.filter(el => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      });
      const unnamed = interactive.filter(el => !String(el.getAttribute("aria-label") || el.getAttribute("title")
        || el.getAttribute("value") || el.innerText || el.textContent || "").trim());
      const idCount=new Map();
      for (const el of document.querySelectorAll("[id]")) idCount.set(el.id,(idCount.get(el.id)||0)+1);
      const duplicates=[...idCount].filter(([,count])=>count>1).map(([id])=>id);
      const brokenAnchors=[...document.querySelectorAll('a[href^="#"]')]
        .filter(el=>el.getAttribute("href").length>1 && !document.getElementById(el.getAttribute("href").slice(1)))
        .map(el=>el.getAttribute("href")).slice(0,20);
      return {buttonCount:interactive.length,unnamed:unnamed.map(el=>el.id||el.outerHTML.slice(0,90)),
        duplicates,brokenAnchors,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
    });
    if (route === "/account.html") {
      // Guest mode intentionally has no enabled account buttons until Supabase is configured.
      await expect(page.locator("#setup-required")).toBeVisible();
    } else {
      expect(report.buttonCount,route+" interactive controls").toBeGreaterThan(0);
    }
    expect(report.duplicates,route+" duplicate IDs").toEqual([]);
    expect(failures,route+" JavaScript errors").toEqual([]);
    // Report less severe accessibility and anchors issues without confusing them with broken workflows.
    if(report.unnamed.length || report.brokenAnchors.length){
      console.warn(route, "Potential UI issues:", JSON.stringify({unnamed:report.unnamed,brokenAnchors:report.brokenAnchors}));
    }
    expect(report.overflow,route+" screen overflow").toBeLessThanOrEqual(3);
  });
}
