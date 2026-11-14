import { test, expect } from '@playwright/test';

test('Neo shell keeps chat controls and a usable model button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#chat-scroll')).toBeVisible();
  await expect(page.locator('#composer-shell')).toBeVisible();
  await expect(page.locator('#load-model-btn')).toBeVisible();
  await expect(page.locator('#z-voice-drawer')).toBeVisible();
  await expect(page.locator('#diagnostics-block')).toHaveCount(1);
});

test('Voice panel stays collapsed until requested', async ({ page }) => {
  await page.goto('/');
  const drawer = page.locator('.z-voice-drawer');
  await expect(drawer).not.toHaveAttribute('open', '');
  await drawer.locator('summary').click();
  await expect(drawer).toHaveAttribute('open', '');
  await expect(page.locator('#z-talk')).toBeVisible();
});

test('Mobile navigation can close with X and outside tap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-layout', 'Mobile layout only');
  await page.goto('/');
  const sidebar = page.locator('#sidebar');
  const toggle = page.locator('#sidebar-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(sidebar).toHaveClass(/open/);
  await expect(page.locator('#sidebar-close')).toBeVisible();
  await page.locator('#sidebar-close').click();
  await expect(sidebar).not.toHaveClass(/open/);

  await toggle.click();
  await expect(page.locator('#sidebar-backdrop')).toBeVisible();
  await page.locator('#sidebar-backdrop').click({ position: { x: 380, y: 200 } });
  await expect(sidebar).not.toHaveClass(/open/);
  await expect(page.locator('#composer-shell')).toBeVisible();
});
