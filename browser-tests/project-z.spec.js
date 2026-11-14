import { test, expect } from '@playwright/test';

test('research, persistence, responsive layout and chat handoff', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://mcp.exa.ai/mcp', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ result: { content: [{ type: 'text', text: 'Title: Example source\nURL: https://example.com/report\nText: Test evidence, not actual financial data.' }] } }),
  }));
  await page.goto('/research.html');
  await page.getByLabel('Ticker', { exact: true }).fill('AAPL');
  await page.getByLabel('Company and exchange').fill('Apple Inc., NASDAQ');
  await page.getByRole('button', { name: 'Add research agent' }).click();
  await page.getByRole('button', { name: 'Run research', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Finished 1');
  await expect(page.getByRole('link', { name: 'Example source' })).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Example source' })).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Draft summary in Z Chat' }).click();
  await expect(page.locator('#user-input')).toHaveValue(/Summarize this research for Apple/);
  await page.locator('.z-voice-drawer > summary').click();
  await expect(page.getByRole('button', { name: 'Talk to Z', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('Command Center decisions and validated backup restore', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/command-center.html');
  await page.getByLabel('Name', { exact: true }).fill('Research workflow');
  await page.getByLabel('What will it do?').fill('Check linked sources');
  await page.getByRole('button', { name: 'Save proposal', exact: true }).click();
  await page.getByRole('button', { name: 'approve', exact: true }).first().click();
  await expect(page.locator('#queue')).toContainText('Pending');
  await page.locator('#queue textarea').fill('Checked rollback and cancellation');
  await page.getByRole('button', { name: 'Save validation note' }).click();
  await expect(page.locator('#queue')).toContainText('Conditionally approved');
  await page.getByRole('button', { name: 'reject', exact: true }).last().click();
  await expect(page.locator('#queue')).toContainText('Blocked');
  await page.reload();
  await expect(page.locator('#queue')).toContainText('Blocked');
  await page.locator('#restore').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"proposals":[null],"ideas":[]}') });
  await expect(page.locator('#status')).toContainText('Restore failed');
  await expect(page.locator('#queue')).toContainText('Research workflow');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Simplified Command Center stays usable on phone and desktop', async ({ page }) => {
  await page.goto('/command-center.html');
  await expect(page.getByRole('heading', { name: 'Project Z · Command Center' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Propose a change' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Changes awaiting a decision' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save proposal' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
