import { test, expect } from "@playwright/test";

test("Stock Workbench previews paper orders, requires approval, saves positions, and resets", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto("/paper.html");
  await expect(page.getByRole("heading", {name:"Stock Workbench."})).toBeVisible();
  await expect(page.locator("#paper-cash")).toHaveText("$100,000.00");
  await page.locator("#paper-symbol").fill("AAPL");
  await page.locator("#paper-shares").fill("3");
  await page.locator("#paper-price").fill("100.25");
  await page.getByRole("button", {name:"Review paper order"}).click();
  await expect(page.locator("#order-preview")).toBeVisible();
  await expect(page.locator("#paper-positions")).toContainText("No paper holdings");
  await page.getByRole("button", {name:"Approve SIMULATED order"}).click();
  await expect(page.locator("#paper-status")).toContainText("No real trade");
  await expect(page.locator("#paper-positions")).toContainText("AAPL");
  await expect(page.locator("#paper-cash")).toHaveText("$99,699.25");
  await page.reload();
  await expect(page.locator("#paper-positions")).toContainText("AAPL");
  await page.locator("#mark-symbol").fill("AAPL");
  await page.locator("#mark-price").fill("110.25");
  await page.getByRole("button", {name:"Update simulated valuation"}).click();
  await expect(page.locator("#paper-pnl")).toHaveText("$30.00");
  await page.locator("#paper-symbol").fill("AAPL");
  await page.locator("#paper-side").selectOption("sell");
  await page.locator("#paper-shares").fill("2");
  await page.locator("#paper-price").fill("110.25");
  await page.getByRole("button", {name:"Review paper order"}).click();
  await page.getByRole("button", {name:"Approve SIMULATED order"}).click();
  await expect(page.locator("#paper-history")).toContainText("SELL · 2 AAPL");
  await expect(page.locator("#paper-positions")).toContainText("1");
  await page.getByRole("button", {name:"Reset paper account"}).click();
  await expect(page.locator("#paper-cash")).toHaveText("$100,000.00");
  await expect(page.locator("#paper-positions")).toContainText("No paper holdings");
  expect(errors).toEqual([]);
});

test("Stock Workbench rejects unsupported paper sells and invalid prices", async ({ page }) => {
  await page.goto("/paper.html");
  await page.locator("#paper-symbol").fill("TSLA");
  await page.locator("#paper-side").selectOption("sell");
  await page.locator("#paper-shares").fill("2");
  await page.locator("#paper-price").fill("100.00");
  await page.getByRole("button", {name:"Review paper order"}).click();
  await expect(page.locator("#paper-status")).toContainText("Cannot sell more");
  await expect(page.locator("#order-preview")).toBeHidden();
  await expect(page.locator("#paper-cash")).toHaveText("$100,000.00");
});

test("Stock Workbench agent runs bounded source searches and gives a reviewable draft", async ({ page }) => {
  await page.route("https://mcp.exa.ai/mcp", route => route.fulfill({
    contentType:"application/json",
    body:JSON.stringify({result:{content:[{type:"text",text:"Title: Simulated source\nURL: https://example.org/source\nText: Public test data only, not real stock advice."}]}})
  }));
  await page.goto("/paper.html");
  await page.locator("#agent-symbol").fill("MSFT");
  await page.locator("#agent-company").fill("Microsoft Inc., NASDAQ");
  await page.getByRole("button", {name:"Run research workflow"}).click();
  await expect(page.locator("#agent-status")).toContainText("Research completed");
  await expect(page.locator("#agent-sources").getByRole("link", {name:"Simulated source"})).toHaveCount(3);
  await expect(page.locator("#agent-draft")).toHaveValue(/Summarize this research for Microsoft/);
  await expect(page.locator("#agent-steps")).toContainText("Draft prepared");
  await page.getByRole("button", {name:"Save to Z Notes"}).click();
  await expect(page.locator("#agent-draft-status")).toContainText("Saved");
  await page.goto("/notes.html");
  await expect(page.locator("#list")).toContainText("MSFT source research");
});

test("Stock Workbench opens from Z Plugins without restarting the current chat", async ({ page }) => {
  await page.goto("/");
  await page.locator("#z-tool-link").click();
  const panel = page.frameLocator("#z-tools-frame");
  const tool = panel.locator(".card").filter({hasText:"Stock Workbench"});
  await tool.getByText("Open tool").click();
  await expect(panel.getByRole("heading", {name:"Stock Workbench."})).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.locator("#z-tools-back").click();
  await expect(page.locator("#z-tools-overlay")).toHaveCount(0);
  await expect(page.locator("#chat-scroll")).toBeVisible();
});


test("Stocks header is minimal, keeps other tools behind Menu, and fits iPhone widths", async ({ page }) => {
  for (const width of [320, 375, 402, 440]) {
    await page.setViewportSize({width,height:850});
    await page.goto("/paper.html");
    const shell=page.locator(".z-shell--stocks");
    await expect(shell).toBeVisible();
    await expect(shell.locator(".z-shell-stock-title")).toHaveText("Stocks");
    await expect(shell.getByRole("link", {name:"Back to Z Chat"})).toBeVisible();
    await expect(shell.locator(".z-shell-links")).toHaveCount(0);
    await expect(page.locator("main > header")).toHaveCount(0);
    await expect(shell.locator(".z-shell-more-menu")).toBeHidden();

    const positions = await page.evaluate(()=>{
      const el=document.querySelector(".z-shell--stocks");
      const box=el.getBoundingClientRect();
      const actions=[...el.querySelectorAll(".z-shell-stock-actions > a,.z-shell-more-trigger")];
      return {docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        shellRight:box.right,actionRight:Math.max(...actions.map(x=>x.getBoundingClientRect().right))};
    });
    expect(positions.docOverflow,width+"px overflow").toBeLessThanOrEqual(2);
    expect(positions.shellRight,width+"px shell right").toBeLessThanOrEqual(width+1);
    expect(positions.actionRight,width+"px menu right").toBeLessThanOrEqual(width+1);

    await shell.locator(".z-shell-more-trigger").click();
    const nav=page.getByRole("navigation",{name:"Z app navigation"});
    await expect(nav.getByRole("link",{name:"Detailed stock research"})).toBeVisible();
    await expect(nav.getByRole("link",{name:"Account"})).toBeVisible();
    await expect(nav.getByRole("link",{name:"All tools"})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(shell.locator(".z-shell-more-menu")).toBeHidden();
  }
});

test("Stocks menu links to detailed research without hiding the portfolio controls", async ({page})=>{
  await page.goto("/paper.html");
  await expect(page.locator("#paper-cash")).toBeVisible();
  await page.locator(".z-shell-more-trigger").click();
  await page.getByRole("navigation",{name:"Z app navigation"}).getByRole("link",{name:"Detailed stock research"}).click();
  await expect(page).toHaveURL(/research[.]html$/);
});
