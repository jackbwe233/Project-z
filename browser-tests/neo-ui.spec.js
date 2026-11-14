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

test('Unavailable WebGPU exits checking and leaves Load actionable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: async () => null },
    });
  });
  await page.goto('/');
  await expect(page.locator('#model-status-text')).toHaveText('Graphics unavailable', { timeout: 15000 });
  await expect(page.locator('#load-model-btn')).toBeEnabled();
  await expect(page.locator('#webgpu-banner')).toHaveClass(/show/);
});

test('Personal memory is opt-in and reviewable without an active AI model', async ({ page }) => {
  await page.goto('/');
  const voiceDrawer = page.locator('.z-voice-drawer');
  await voiceDrawer.locator('summary').first().click();
  const memoryPanel = page.locator('.z-memory-panel');
  await memoryPanel.locator('summary').click();
  await expect(page.locator('#z-learning-toggle')).not.toBeChecked();
  await expect(page.locator('#z-learning-saved')).toContainText('Nothing approved yet');

  await page.locator('#z-learning-toggle').check();
  await expect(page.locator('#z-status')).toContainText('You approve each memory');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('project-z:learning:v1')));
  expect(stored.learnEnabled).toBe(true);

  // Inject a well-formed local saved memory, as though it had been explicitly approved.
  await page.evaluate(() => {
    localStorage.setItem('project-z:learning:v1', JSON.stringify({
      version: 1, learnEnabled: true,
      saved: [{ kind: 'preference', text: 'I prefer concise study guides.', createdAt: Date.now(), source: 'explicit' }],
      pending: [],
    }));
  });
  await page.reload();
  await page.locator('.z-voice-drawer > summary').click();
  await page.locator('.z-memory-panel > summary').click();
  await expect(page.locator('#z-learning-saved')).toContainText('I prefer concise study guides.');

  await page.locator('#z-learning-saved').getByRole('button', { name: 'Forget' }).click();
  await expect(page.locator('#z-learning-saved')).not.toContainText('I prefer concise study guides.');
});

test('MONO chat uses black surfaces and thin white outlines', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#sidebar')).toHaveCount(1);
  const style = await page.evaluate(() => {
    const css = sel => getComputedStyle(document.querySelector(sel));
    const side = css('#sidebar');
    const composer = css('#composer-shell');
    return {
      sideBackground: side.backgroundColor,
      composerBackground: composer.backgroundColor,
      composerBorderWidth: composer.borderTopWidth,
      composerBorderColor: composer.borderTopColor,
      monoLoaded: [...document.styleSheets].some(sheet => String(sheet.href || '').includes('monochrome.css')),
    };
  });
  expect(style.monoLoaded).toBe(true);
  expect(style.sideBackground).toBe('rgb(0, 0, 0)');
  expect(style.composerBackground).toBe('rgb(0, 0, 0)');
  expect(style.composerBorderWidth).toBe('1px');
  expect(style.composerBorderColor).toMatch(/rgba?\(/);
});

test('MONO command center and research use the same black-and-white surfaces', async ({ page }) => {
  for (const path of ['/command-center.html', '/research.html']) {
    await page.goto(path);
    const colors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      section: getComputedStyle(document.querySelector('section')).backgroundColor,
      text: getComputedStyle(document.querySelector('h1')).color,
    }));
    expect(colors.body).toBe('rgb(0, 0, 0)');
    expect(colors.section).toBe('rgb(0, 0, 0)');
    expect(colors.text).toBe('rgb(255, 255, 255)');
  }
});
