import { test, expect } from '@playwright/test';

test('2080 launch animation zooms Z away without trapping clicks', async ({ page }) => {
  await page.goto('/');
  const intro = page.locator('.z-intro');
  await expect(intro).toHaveCount(1);
  await expect(intro.locator('.z-intro-mark')).toHaveText('Z');
  await expect(intro).toHaveCSS('pointer-events', 'none');
  await expect(intro).toHaveCSS('visibility', 'hidden', { timeout: 6000 });
  await expect(page.locator('#composer-shell')).toBeVisible();
});

test('Floating white particles are present and do not intercept input', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#main > .z-particle-field .z-mote')).toHaveCount(16);
  const field = page.locator('#main > .z-particle-field');
  await expect(field).toHaveCSS('pointer-events', 'none');
  const dot = field.locator('.z-mote').first();
  await expect(dot).toHaveCSS('border-radius', '50%');
  await expect(dot).toHaveCSS('animation-name', /z-mote-float/);
});

test('Reduced-motion devices get an immediately accessible static chat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.z-intro')).toHaveCSS('display', 'none');
  await expect(page.locator('.z-particle-field .z-mote').first()).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#composer-shell')).toBeVisible();
});

test('Side pages have restrained animated particles with original content intact', async ({ page }) => {
  for (const path of ['/command-center.html', '/research.html']) {
    await page.goto(path);
    await expect(page.locator('body > .z-particle-field .z-mote')).toHaveCount(16);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('main section').first()).toBeVisible();
  }
});
