import { expect, test } from "@playwright/test";
test("Music Finder has Start, album art, previews, and streaming search links",async ({page})=>{
 await page.route("https://itunes.apple.com/search**",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({resultCount:3,results:Array.from({length:3},(_,i)=>({
  wrapperType:"track",kind:"song",trackId:21000+i,trackName:"Demo Track "+i,artistName:"Example Artist",
  collectionName:"Example Album",primaryGenreName:"Indie",trackExplicitness:"notExplicit",
  previewUrl:"https://example.com/preview"+i+".m4a",artworkUrl100:"https://example.com/art100x100bb.jpg",
  trackViewUrl:"https://music.apple.com/us/song/demo"+i
 }))})}));
 await page.route("https://example.com/art600x600bb.jpg",route=>route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"></svg>'}));
 await page.goto("/music.html");
 await expect(page.locator("#start-discovery")).toBeVisible();
 await page.locator("#start-discovery").click();
 await expect(page.locator("#card-art img")).toBeVisible();
 await expect(page.locator("#preview-button")).toBeEnabled();
 await expect(page.locator("#spotify-song-link")).toHaveAttribute("href",/open.spotify.com\/search/);
 await expect(page.locator("#soundcloud-song-link")).toHaveAttribute("href",/soundcloud.com\/search/);
 await page.locator("#start-discovery").click();
 await expect(page.locator("#card-title")).toContainText("Demo Track");
 await page.locator("#like-song").click();
 await page.locator("#tab-saved").click();
 await expect(page.locator("#saved-count")).toHaveText("1");
});
test("Paper trading offers an advanced candle chart with drawings and indicators",async({page})=>{
 await page.route("https://s3.tradingview.com/external-embedding/**",route=>route.fulfill({status:200,contentType:"application/javascript",body:""}));
 await page.goto("/paper.html");
 await expect(page.locator("#z-chart-panel")).toBeVisible();
 await expect(page.locator("#z-chart-frame")).toBeVisible();
 await page.locator("#z-chart-symbol").fill("MSFT");
 await page.locator("#z-chart-load").click();
 const config=await page.locator("#z-chart-frame script").textContent();
 expect(config).toContain("NASDAQ:MSFT");
 expect(config).toContain('"hide_side_toolbar":false');
 await expect(page.locator("#paper-cash")).toHaveText("$100,000.00");
});
test("My Day generates a real task plan and exports calendar events",async({page})=>{
 await page.goto("/personal.html");
 await page.locator("#task").fill("Finish statistics homework");
 await page.locator("#task-form button[type=submit]").click();
 await expect(page.locator("#day-plan")).toContainText("Finish statistics homework");
 await expect(page.locator("#day-progress")).toContainText("0 of 1 completed");
 await page.locator("#day-export-ics").click();
 await expect(page.locator("#day-plan-status")).toContainText("Calendar file exported");
});
test("Friends-only Z account does not offer payment checkout",async({page})=>{
 await page.goto("/account.html");
 await expect(page.getByRole("link",{name:/Z Pro plans/i})).toHaveCount(0);
 await expect(page.locator("a[href=\"./billing.html\"]")).toHaveCount(0);
});
