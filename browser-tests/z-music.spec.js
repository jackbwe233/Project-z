import { expect, test } from "@playwright/test";

const songs = Array.from({ length: 9 }, (_, i) => ({
  wrapperType:"track", kind:"song", trackId:10001+i, trackName:"Demo Song " + (i+1),
  artistName:i<4?"New Band":"Other Artist "+i, collectionName:"Demo Album",
  primaryGenreName:i%2?"Alternative":"Indie Rock", trackExplicitness:"notExplicit",
  artworkUrl100:"", previewUrl:"",
  trackViewUrl:"https://music.apple.com/us/song/demo-" + (i+1),
}));
test.beforeEach(async ({ page }) => {
  await page.route("https://itunes.apple.com/search**", async route => {
    await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({resultCount:songs.length, results:songs}) });
  });
});
test("Music Finder discovers songs without a model and builds a saved playlist", async ({ page }) => {
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/music.html");
  await expect(page.getByRole("heading",{name:/Find your next favorite/})).toBeVisible();
  await page.locator("#start-discovery").click();
  await expect(page.locator("#card-title")).toHaveText(/Demo Song/);
  await expect(page.locator("#apple-store-link")).toBeVisible();
  await page.locator("#like-song").click();
  await page.locator("#tab-saved").click();
  await expect(page.locator("#saved-count")).toHaveText("1");
  await expect(page.locator("#saved-tracks li")).toHaveCount(1);
  await expect(page.locator("#saved-tracks")).toContainText("Demo Song");
  await page.reload();
  await page.locator("#tab-saved").click();
  await expect(page.locator("#saved-tracks li")).toHaveCount(1);
  const downloadPromise=page.waitForEvent("download");
  await page.locator("#csv-export").click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe("z-music-playlist.csv");
  expect(errors).toEqual([]);
});
test("Music Finder filters on genre, vibe and discovery style on small screens", async ({ page }) => {
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/music.html");
  await page.locator("#start-discovery").click();
  await expect(page.locator("#card-title")).toHaveText(/Demo Song/);
  await page.locator('[data-genre="Indie"]').click();
  await expect(page.locator('[data-genre="Indie"]')).toHaveAttribute("aria-pressed","true");
  await page.locator('[data-vibe="dreamy"]').click();
  await expect(page.locator('[data-vibe="dreamy"]')).toHaveAttribute("aria-pressed","true");
  await page.locator('[data-exploration="explore"]').click();
  await expect(page.locator('[data-exploration="explore"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#card-title")).toHaveText(/Demo Song/);
  const layout = await page.evaluate(() => ({
    width:document.documentElement.scrollWidth, viewport:window.innerWidth,
    card:document.querySelector("#swipe-card").getBoundingClientRect().width,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport + 4);
  expect(layout.card).toBeLessThanOrEqual(Math.min(412,layout.viewport));
  expect(errors).toEqual([]);
});
