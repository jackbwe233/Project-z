import { test, expect } from '@playwright/test';

test('Neo shell keeps chat controls and a usable model button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#chat-scroll')).toBeVisible();
  await expect(page.locator('#composer-shell')).toBeVisible();
  await expect(page.locator('#load-model-btn')).toBeVisible();
  await expect(page.locator('.z-voice-drawer')).toBeVisible();
  await expect(page.locator('#diagnostics-block')).toHaveCount(1);
});

test('Voice panel stays collapsed until requested', async ({ page }) => {
  await page.goto('/');
  const drawer = page.locator('.z-voice-drawer');
  await expect(drawer).not.toHaveAttribute('open', '');
  await drawer.locator(':scope > summary').click();
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
  await memoryPanel.locator(':scope > summary').click();
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

test('Orbital chat has themed surfaces and readable controls', async ({ page }) => {
  await page.goto('/');
  const style = await page.evaluate(() => {
    const css = selector => getComputedStyle(document.querySelector(selector));
    return {
      orbitalLoaded: [...document.styleSheets].some(sheet => String(sheet.href || '').includes('z-orbital.css')),
      sideGradient: css('#sidebar').backgroundImage,
      composerBorderWidth: css('#composer-shell').borderTopWidth,
      composerBorderColor: css('#composer-shell').borderTopColor,
      composerBackground: css('#composer-shell').backgroundColor,
      textColor: css('#user-input').color,
    };
  });
  expect(style.orbitalLoaded).toBe(true);
  expect(style.sideGradient).toContain('gradient');
  expect(style.composerBorderWidth).toBe('1px');
  expect(style.composerBorderColor).toContain('rgb');
  expect(style.composerBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.textColor).not.toBe('rgba(0, 0, 0, 0)');
});

test('Command Center and research load the matching Orbital panels', async ({ page }) => {
  for (const path of ['/command-center.html', '/research.html']) {
    await page.goto(path);
    const style = await page.evaluate(() => ({
      orbitalLoaded: [...document.styleSheets].some(sheet => String(sheet.href || '').includes('z-orbital.css')),
      section: getComputedStyle(document.querySelector('section')).backgroundColor,
      heading: getComputedStyle(document.querySelector('h1')).color,
      particles: document.querySelectorAll('body > .z-particle-field .z-mote').length,
    }));
    expect(style.orbitalLoaded).toBe(true);
    expect(style.section).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.heading).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.particles).toBe(16);
  }
});

test('Simplified memory tools stay discoverable and advanced actions stay tucked away', async ({ page }) => {
  await page.goto('/');
  await page.locator('.z-voice-drawer > summary').click();
  await expect(page.locator('.z-voice-drawer > summary')).toContainText('Voice & memory');
  await page.locator('.z-memory-panel > summary').click();
  await expect(page.getByLabel('Notes for Z (saved as you type)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete all memories' })).toBeHidden();
  await page.locator('.z-memory-tools > summary').click();
  await expect(page.getByRole('button', { name: 'Delete all memories' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('iPhone opens Z without probing or auto-loading the AI', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    window.__gpuProbes = 0;
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: async () => {
          window.__gpuProbes += 1;
          return null;
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#chat-scroll')).toBeVisible();
  await expect(page.locator('#model-status-text')).toHaveText('Tap Load model');
  await expect(page.locator('#load-model-btn')).toBeEnabled();
  expect(await page.evaluate(() => window.__gpuProbes)).toBe(0);
  // Reopening the page must not start the same crash loop again.
  await page.reload();
  await expect(page.locator('#model-status-text')).toHaveText('Tap Load model');
  expect(await page.evaluate(() => window.__gpuProbes)).toBe(0);

  // An explicit tap, not app startup, is what initiates the graphics probe.
  await page.locator('#load-model-btn').click();
  await expect(page.locator('#model-status-text')).toHaveText('Graphics unavailable', { timeout: 15000 });
  expect(await page.evaluate(() => window.__gpuProbes)).toBeGreaterThan(0);
});
