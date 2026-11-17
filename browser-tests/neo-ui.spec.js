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
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
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
      sidebarBackground: css('#sidebar').backgroundColor,
      composerBorderWidth: css('#composer-shell').borderTopWidth,
      composerBorderColor: css('#composer-shell').borderTopColor,
      composerBackground: css('#composer-shell').backgroundColor,
      textColor: css('#user-input').color,
    };
  });
  expect(style.orbitalLoaded).toBe(true);
  expect(style.sidebarBackground).toBe('rgb(16, 16, 19)');
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

test('Obsidian vault section sits inside memory and starts disconnected', async ({ page }) => {
  await page.goto('/');
  await page.locator('.z-voice-drawer > summary').click();
  await page.locator('.z-memory-panel > summary').click();
  await page.locator('.z-vault-panel > summary').click();
  await expect(page.locator('.z-memory-panel .z-vault-panel')).toHaveCount(1);
  await expect(page.locator('#z-vault-status')).toHaveText('No vault connected.');
  await expect(page.locator('#z-vault-toggle')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Connect vault folder' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('iPhone startup leaves graphics idle even after reopening the page', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    window.__gpuProbes = 0;
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: async () => { window.__gpuProbes += 1; return null; } },
    });
  });
  await page.goto('/');
  await expect(page.locator('#z-launch-open')).toBeVisible();
  expect(await page.evaluate(() => window.__gpuProbes)).toBe(0);
  await page.locator('#z-launch-open').click();
  await expect(page.locator('#chat-scroll')).toBeVisible();
  await expect(page.locator('#model-status-text')).toHaveText('Ask Z a question to start');
  await expect(page.locator('#load-model-btn')).toBeEnabled();
  expect(await page.evaluate(() => window.__gpuProbes)).toBe(0);
  await page.reload();
  await expect(page.locator('#z-launch-open')).toBeVisible();
  expect(await page.evaluate(() => window.__gpuProbes)).toBe(0);
  await page.locator('#z-launch-open').click();
  await expect(page.locator('#model-status-text')).toHaveText('Ask Z a question to start');
  expect(await page.evaluate(() => window.__gpuProbes)).toBe(0);
  await page.locator('#load-model-btn').click();
  await expect(page.locator('#model-status-text')).toHaveText('Graphics unavailable', { timeout: 15000 });
  expect(await page.evaluate(() => window.__gpuProbes)).toBe(1);
});

test('Failed chat deletion keeps the saved conversation visible', async ({ page }) => {
  await page.goto('/');
  // Wait for initial session restoration before opening the mobile drawer.
  await expect(page.locator('#session-list .session-item')).toHaveCount(1);
  await expect(page.locator('#user-input')).toBeEditable();
  if ((await page.viewportSize()).width < 769) {
    await page.locator('#sidebar-toggle').click();
  }
  const row = page.locator('#session-list .session-item').first();
  await expect(row).toBeVisible();
  const originalTitle = await row.locator('.session-title').textContent();
  // Simulate a Safari IndexedDB transaction failure without clearing saved data.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
      if (mode === 'readwrite' && Array.isArray(stores) && stores.includes('sessions')) {
        throw new DOMException('Simulated storage failure', 'InvalidStateError');
      }
      return original.call(this, stores, mode, ...args);
    };
  });
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await row.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.locator('#toast-stack')).toContainText('Could not delete this chat');
  await expect(page.locator('#session-list .session-item')).toHaveCount(1);
  await expect(page.locator('#session-list .session-item').first().locator('.session-title')).toHaveText(originalTitle);
  await page.reload();
  if ((await page.viewportSize()).width < 769) await page.locator('#sidebar-toggle').click();
  await expect(page.locator('#session-list .session-item').first().locator('.session-title')).toHaveText(originalTitle);
});

test('Recovery page starts without the main app or touching stored chats', async ({ page }) => {
  await page.goto('/recovery.html');
  await expect(page.getByRole('heading', { name: 'Project Z · Safe Start' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Project Z safely' })).toBeVisible();
  await expect(page.locator('#chat-scroll')).toHaveCount(0);
  expect(await page.evaluate(() => [...document.scripts].some(s => s.src.includes('/app.js')))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Z sidebar prioritizes chat and essential tabs while collapsing less-used tools', async ({ page }) => {
  await page.goto('/');
  if ((await page.viewportSize()).width < 769) {
    await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#sidebar-toggle').click();
  }
  await expect(page.locator('#new-chat-btn')).toBeVisible();
  const main = page.getByRole('navigation', { name: 'Main Z tools' });
  await expect(main.getByRole('link', { name: 'My Day' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Stocks' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Notes' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'All Tools' })).toBeVisible();
  await expect(page.locator('#conversations-block')).toHaveAttribute('open', '');
  await expect(page.locator('#z-more-navigation')).not.toHaveAttribute('open', '');
  await expect(page.locator('#system-block')).not.toHaveAttribute('open', '');
  await page.locator('#z-more-navigation > summary').click();
  await expect(page.locator('#z-open-personalization')).toBeVisible();
  await expect(page.locator('#z-account-link')).toBeVisible();
  await expect(page.locator('#z-code-lab-link')).toBeVisible();
  const install = page.locator('#z-more-navigation a[href="./install.html"]');
  await expect(install).toBeVisible();
  await install.click();
  await expect(page).toHaveURL(/\/install\.html$/);
  await expect(page.getByRole('heading', { name: 'Put Z on your Home Screen.' })).toBeVisible();
});

test('A failed model load offers a one-click lightweight retry', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: async () => ({}) },
    });
  });
  await page.route('**/lib/runtime-registry.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export function getRuntimeAdapter(runtime) {
      return {
        async loadModel(def) {
          if (runtime === "gemma") throw new TypeError("Failed to fetch");
          if (def.id !== "lfm2") throw new Error("Wrong fallback model");
          return { async warmup() {} };
        },
      };
    }`,
  }));
  await page.route('https://huggingface.co/**', route => route.abort());

  await page.goto('/');
  const load = page.locator('#load-model-btn');
  const retry = page.getByRole('button', { name: /Try LFM2.5 230M/ });
  const input = page.locator('#user-input');
  await expect(retry).toBeHidden();
  await input.fill('Keep my draft');
  await load.click();
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(load).toHaveText('Model ready');
  await expect(retry).toBeHidden();
  await expect(input).toHaveValue('Keep my draft');
});
