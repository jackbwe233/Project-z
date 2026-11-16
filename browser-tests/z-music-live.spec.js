import { expect, test } from "@playwright/test";

// This is intentionally unmocked: it verifies Apple Music discovery works in a real browser.
// The test does not touch anyone's Spotify or Apple Music account.
test("Live catalog: Indie + Dreamy + New artists builds a three-song local playlist", async ({ page }) => {
  test.setTimeout(35000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/music.html");
  await page.locator('[data-genre="Indie"]').click();
  await page.locator('[data-vibe="dreamy"]').click();
  await page.locator('[data-exploration="explore"]').click();
  await expect(page.locator('[data-genre="Indie"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-vibe="dreamy"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-exploration="explore"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator("#start-discovery").click();
  await expect(page.locator("#card-title")).not.toHaveText("Find your sound", { timeout: 17000 });
  const chosen = [];
  for (let i = 0; i < 3; i++) {
    const title = (await page.locator("#card-title").textContent()).trim();
    const artist = (await page.locator("#card-artist").textContent()).trim();
    chosen.push(title + " — " + artist);
    await page.locator("#like-song").click();
    await expect(page.locator("#saved-count")).toHaveText(String(i + 1));
    if (i < 2) await expect(page.locator("#card-title")).not.toHaveText(title);
  }
  await page.locator("#tab-saved").click();
  await expect(page.locator("#saved-tracks li")).toHaveCount(3);
  await page.reload();
  await page.locator("#tab-saved").click();
  await expect(page.locator("#saved-tracks li")).toHaveCount(3);
  console.log("Z live catalog playlist checked:", chosen.join(" | "));
});
