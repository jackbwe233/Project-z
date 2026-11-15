import { test, expect } from '@playwright/test';

test('Z opens and closes built-in tools without restarting chat', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#chat-scroll')).toBeVisible();
  await page.locator('#z-tool-link').click();
  await expect(page.locator('#z-tools-overlay')).toBeVisible();
  await expect(page.frameLocator('#z-tools-frame').getByRole('heading', { name: 'Apps & Plugins.' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.locator('#z-tools-back').click();
  await expect(page.locator('#z-tools-overlay')).toHaveCount(0);
  await expect(page.locator('#chat-scroll')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Built-in Notes passes a real draft to the existing Z chat composer', async ({ page }) => {
  await page.goto('/');
  await page.locator('#z-tool-link').click();
  const tools = page.frameLocator('#z-tools-frame');
  await tools.locator('.card').filter({ hasText: 'Notes & documents' })
    .getByText('Open tool').click();
  await expect(tools.getByRole('heading', { name: 'Notes & Docs.' })).toBeVisible();
  await tools.locator('#title').fill('Class outline');
  await tools.locator('#body').fill('Three chapters to review');
  await tools.getByRole('button', { name: 'Save note' }).click();
  await expect(tools.locator('#status')).toContainText('Note saved');
  await tools.getByRole('button', { name: 'Send to Z Chat' }).click();
  await expect(page.locator('#z-tools-overlay')).toHaveCount(0);
  await expect(page.locator('#user-input')).toHaveValue(/Class outline[\s\S]*Three chapters to review/);
  await expect(page).toHaveURL(/\/$/);
});

test('Personal tasks persist, can be completed and are used by voice briefings', async ({ page }) => {
  await page.goto('/personal.html');
  await page.locator('#task').fill('Prepare for practice');
  await page.getByRole('button', { name: 'Add to my day' }).click();
  await expect(page.locator('#tasks')).toContainText('Prepare for practice');
  await page.goto('/quick.html');
  await page.getByRole('button', { name: "What's next?" }).click();
  await expect(page.locator('#answer')).toContainText('Prepare for practice');
  await page.goto('/personal.html');
  await page.locator('#tasks').getByRole('button', { name: 'Complete Prepare for practice' }).click();
  await expect(page.locator('#open')).toHaveText('0');
  await page.reload();
  await expect(page.locator('#tasks')).toContainText('Prepare for practice');
  await expect(page.locator('#open')).toHaveText('0');
});

test('Plugins hub enables and disables tools and rejects unsafe URLs', async ({ page }) => {
  await page.goto('/plugins.html');
  await expect(page.locator('#count')).toHaveText('6 enabled');
  const focus = page.locator('#tool-list .card').filter({ hasText: 'Focus timer' });
  await focus.locator('input[type=checkbox]').uncheck();
  await expect(page.locator('#count')).toHaveText('5 enabled');
  await page.locator('#custom-name').fill('Not safe');
  await page.locator('#custom-url').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Add app shortcut' }).click();
  await expect(page.locator('#custom-status')).toContainText('secure HTTPS');
  await page.locator('#custom-url').fill('https://example.com/');
  await page.getByRole('button', { name: 'Add app shortcut' }).click();
  await expect(page.locator('#custom-list')).toContainText('Not safe');
  await page.reload();
  await expect(page.locator('#count')).toHaveText('5 enabled');
  await expect(page.locator('#custom-list')).toContainText('Not safe');
  await page.locator('#custom-list').getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('#custom-list')).not.toContainText('Not safe');
});

test('Voice capture saves text as tasks and notes, with typed fallback', async ({ page }) => {
  await page.goto('/quick.html');
  await page.locator('#words').fill('Buy materials for school project');
  await page.getByRole('button', { name: 'Add as reminder' }).click();
  await expect(page.locator('#result')).toContainText('Saved to Z Personal');
  await page.getByRole('button', { name: 'Save as note' }).click();
  await expect(page.locator('#result')).toContainText('Saved to Z Notes');
  await page.goto('/notes.html');
  await expect(page.locator('#list')).toContainText('Buy materials for school project');
});

test('Focus timer and notes save control work', async ({ page }) => {
  await page.goto('/focus.html');
  await page.locator('#mins').fill('1');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('#clock')).toHaveText('01:00');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#status')).toHaveText('Timer running.');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#status')).toHaveText('Paused.');
  await page.locator('#goal').fill('Finish assignment section');
  await page.getByRole('button', { name: 'Save as Z note' }).click();
  await expect(page.locator('#status')).toContainText('Focus goal saved');
});

test('Stock research creates draft preview without triggering navigation', async ({ page }) => {
  await page.route('https://mcp.exa.ai/mcp', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ result: { content: [{ type: 'text', text: 'Title: Official source\nURL: https://example.com/filing\nText: Document excerpt' }] } }),
  }));
  await page.goto('/research.html');
  await page.locator('#symbol').fill('MSFT');
  await page.locator('#company').fill('Microsoft NASDAQ');
  await page.getByRole('button', { name: 'Add research agent' }).click();
  await page.getByRole('button', { name: 'Run research', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Finished 1');
  await page.getByRole('button', { name: 'Draft summary', exact: true }).click();
  await expect(page.locator('#research-preview')).toBeVisible();
  await expect(page.locator('#research-draft-text')).toHaveValue(/Summarize this research for Microsoft/);
  await expect(page).toHaveURL(/research\.html$/);
  await page.getByRole('button', { name: 'Save to Z Notes' }).click();
  await expect(page.locator('#research-draft-status')).toContainText('Saved to Z Notes');
});

test('All first-party tool pages load without JavaScript page errors', async ({ page }) => {
  for (const path of ['/personal.html', '/plugins.html', '/quick.html', '/notes.html',
    '/focus.html', '/shortcut.html', '/research.html', '/paper.html', '/code-lab.html', '/command-center.html', '/recovery.html']) {
    const errors = [];
    const handler = error => errors.push(error.message);
    page.on('pageerror', handler);
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(errors, path).toEqual([]);
    page.off('pageerror', handler);
  }
});
