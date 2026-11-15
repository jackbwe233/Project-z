import { test, expect } from '@playwright/test';

const pages = [
  'account.html', 'code-lab.html', 'command-center.html', 'focus.html',
  'google.html', 'install.html', 'music.html', 'notes.html', 'paper.html',
  'personal.html', 'plugins.html', 'privacy.html', 'quick.html',
  'recovery.html', 'research.html', 'shortcut.html', 'work.html'
];

test('every tool page has a clear path back to chat and no JavaScript page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of pages) {
    await page.goto('/' + route);
    const header = page.locator('.z-shell');
    await expect(header, route).toBeVisible();
    await expect(header.getByRole('link', { name: 'Back to Z Chat' })).toBeVisible();
    if (route !== 'paper.html') {
      await expect(header.locator('.z-shell--impossible')).toHaveCount(0);
      await expect(header).toHaveClass(/z-shell--simple/);
    } else {
      await expect(header).toHaveClass(/z-shell--stocks/);
    }
  }
  expect(errors).toEqual([]);
});

test('the simplified tool menu is searchable, keyboard accessible, and keeps active page visible', async ({ page }) => {
  await page.goto('/notes.html');
  const header = page.locator('.z-shell--simple');
  const activeNotesLink = (await page.viewportSize()).width <= 760
    ? page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('link', { name: 'Notes' })
    : header.locator('.z-shell-links a[href="./notes.html"]');
  await expect(activeNotesLink).toHaveAttribute('aria-current', 'page');
  await header.locator('.z-shell-more-trigger').click();
  await header.locator('.z-shell-search').fill('calendar');
  await expect(header.locator('.z-shell-more-menu a[href="./google.html"]')).toBeVisible();
  await expect(header.locator('.z-shell-more-menu a[href="./focus.html"]')).toBeHidden();
  await header.locator('.z-shell-search').fill('absolutely-unlisted');
  await expect(header.locator('.z-shell-no-results')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(header.locator('.z-shell-more-menu')).toBeHidden();
  await expect(header.locator('.z-shell-more-trigger')).toBeFocused();
});

test('phone: every tool page has thumb-friendly navigation without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of pages) {
    await page.goto('/' + route);
    const shell = page.locator('.z-shell');
    await expect(shell, route).toBeVisible();
    if (route === 'recovery.html') continue; // intentionally minimal crash-recovery page
    const dock = page.getByRole('navigation', { name: 'Quick navigation' });
    await expect(dock, route).toBeVisible();
    await expect(dock.getByRole('link')).toHaveCount(6);
    const bounds = await page.evaluate(() => {
      const rect = el => {
        const r = el.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
      };
      return {
        width:window.innerWidth,height:window.innerHeight,
        shell:rect(document.querySelector('.z-shell')),
        dock:rect(document.querySelector('.z-mobile-dock')),
      };
    });
    expect(bounds.shell.left, route + ' header left').toBeGreaterThanOrEqual(-1);
    expect(bounds.shell.right, route + ' header right').toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.dock.left, route + ' dock left').toBeGreaterThanOrEqual(-1);
    expect(bounds.dock.right, route + ' dock right').toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.dock.top, route + ' dock top').toBeGreaterThan(bounds.height - 120);
    expect(bounds.dock.bottom, route + ' dock bottom').toBeLessThanOrEqual(bounds.height + 1);
  }
  expect(errors).toEqual([]);
});

test('tool directory finds music directly without hiding other tools permanently', async ({ page }) => {
  await page.goto('/plugins.html');
  await expect(page.locator('#count')).toHaveText('8 enabled');
  await page.locator('#tool-search').fill('music');
  await expect(page.locator('#tool-list .card')).toHaveCount(1);
  await expect(page.locator('#tool-list')).toContainText('Music Finder');
  await page.locator('#tool-search').fill('not-a-tool');
  await expect(page.locator('#tool-filter-empty')).toBeVisible();
  await page.locator('#tool-search').fill('');
  await expect(page.locator('#tool-list .card')).toHaveCount(8);
});
