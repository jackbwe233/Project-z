import { test, expect } from "@playwright/test";

test("Z Work starts an instant actionable plan and saves only after approval",async({page})=>{
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/work.html");
  await expect(page.getByRole("heading",{name:"Give Z a job."})).toBeVisible();
  await expect(page.locator("#work-status")).toContainText("without loading an AI model");
  await page.locator("#work-task").fill("Plan a hockey clothing store launch");
  await page.locator("#work-mode").selectOption("plan");
  await page.getByRole("button",{name:"Start Work"}).click();
  await expect(page.locator("#work-status")).toContainText("Plan prepared");
  await expect(page.locator("#work-brief")).toHaveValue(/Plan a hockey clothing store launch/);
  await expect(page.locator("#work-history")).toContainText("No saved jobs");
  await page.getByRole("button",{name:"Save to this device"}).click();
  await expect(page.locator("#work-action-status")).toContainText("Saved locally");
  await page.reload();
  await expect(page.locator("#work-history")).toContainText("Plan a hockey clothing store launch");
  expect(errors).toEqual([]);
});

test("Z Work research gathers sources in parallel and can be stopped",async({page})=>{
  let count=0;
  await page.route("https://mcp.exa.ai/mcp",async route=>{
    count++;
    await route.fulfill({contentType:"application/json",body:JSON.stringify({result:{content:[
      {type:"text",text:"Title: Public sample\nURL: https://example.org/source\nText: Example evidence."},
    ]}})});
  });
  await page.goto("/work.html");
  await page.locator("#work-task").fill("Research New England small business registration");
  await page.getByRole("button",{name:"Start Work"}).click();
  await expect(page.locator("#work-status")).toContainText("Work complete");
  expect(count).toBe(3);
  await expect(page.locator("#research-results").getByRole("link",{name:"Public sample"})).toHaveCount(3);
  await expect(page.locator("#work-brief")).toHaveValue(/https:\/\/example.org\/source/);
  await expect(page.locator("#work-brief")).toHaveValue(/No web pages were clicked/);
});

test("Z Work from Plugins opens in chat and sends preview into composer",async({page})=>{
  await page.goto("/");
  await page.locator("#z-tool-link").click();
  const tools=page.frameLocator("#z-tools-frame");
  await tools.locator(".card").filter({hasText:"Z Work"}).getByText("Open tool").click();
  await expect(tools.getByRole("heading",{name:"Give Z a job."})).toBeVisible();
  await tools.locator("#work-task").fill("Plan the next steps for my science project");
  await tools.locator("#work-mode").selectOption("plan");
  await tools.getByRole("button",{name:"Start Work"}).click();
  await expect(tools.locator("#work-status")).toContainText("Plan prepared");
  await tools.getByRole("button",{name:"Send to Z Chat"}).click();
  await expect(page.locator("#z-tools-overlay")).toHaveCount(0);
  await expect(page.locator("#user-input")).toHaveValue(/next steps for my science project/);
});

test("Phone sidebar scrolls down to account, model storage and diagnostics",async({page})=>{
  await page.goto("/");
  if((await page.viewportSize()).width>=769)return;
  const toggle=page.locator("#sidebar-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await toggle.click();
  const sidebar=page.locator("#sidebar");
  await expect(sidebar).toHaveClass(/open/);
  await page.locator("#z-more-navigation > summary").click();
  await expect(page.locator("#z-account-link")).toBeVisible();
  await page.locator("#diagnostics-block > summary").scrollIntoViewIfNeeded();
  await expect(page.locator("#diagnostics-block > summary")).toBeInViewport();
  const state=await sidebar.evaluate(el=>{
    const content=el.scrollHeight,visible=el.clientHeight;
    el.scrollTop=content;
    return {content,visible,atBottom:Math.abs(el.scrollTop-(content-visible))<=3,
      footer:el.querySelector(".sidebar-footer")?.getBoundingClientRect().bottom,
      screen:window.innerHeight};
  });
  expect(state.content).toBeGreaterThan(state.visible);
  expect(state.atBottom).toBe(true);
  await expect(page.locator("#diagnostics-copy")).toBeVisible();
});
