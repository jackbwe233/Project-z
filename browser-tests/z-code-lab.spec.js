import { test, expect } from '@playwright/test';

test('Change Z builds and saves a reviewable coding request without touching GitHub', async ({ page }) => {
  await page.goto('/code-lab.html');
  await page.getByLabel('What do you want Z to do differently?').fill('Make the chat buttons easier to use on iPhone');
  await page.getByLabel('Area of the app').selectOption('design');
  await page.getByRole('button', { name: 'Prepare change request' }).click();
  await expect(page.locator('#request-preview')).toHaveValue(/Make the chat buttons easier to use on iPhone/);
  await expect(page.locator('#request-preview')).toHaveValue(/Do not merge without my approval/);
  await expect(page.locator('#status')).toContainText('prepared locally');
  await page.getByRole('button', { name: 'Save request' }).click();
  await expect(page.locator('#saved-requests')).toContainText('Make the chat buttons easier');
  await page.reload();
  await expect(page.locator('#saved-requests')).toContainText('Make the chat buttons easier');
  await page.getByRole('button', { name: 'Open request' }).click();
  await expect(page.locator('#request-preview')).toHaveValue(/Make the chat buttons easier/);
});

test('Change Z can read its public source without write credentials', async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/jackbwe233/Project-z/master/plugins.html', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Plugins</h1>' })
  );
  await page.goto('/code-lab.html');
  await page.locator('#source-file').selectOption('plugins.html');
  await page.getByRole('button', { name: 'Read GitHub source' }).click();
  await expect(page.locator('#source-preview')).toContainText('<h1>Plugins</h1>');
  await expect(page.locator('#source-status')).toContainText('read-only');
});

test('Change Z opens inside chat and can hand a request to the existing composer', async ({ page }) => {
  await page.goto('/');
  await page.locator('#z-tool-link').click();
  const frame = page.frameLocator('#z-tools-frame');
  const card = frame.locator('.card').filter({ hasText: 'Change Z' });
  await card.getByText('Open tool').click();
  await expect(frame.getByRole('heading', { name: 'Change Z.' })).toBeVisible();
  await frame.locator('#change-text').fill('Give Z an optional sidebar search');
  await frame.getByRole('button', { name: 'Prepare change request' }).click();
  await frame.getByRole('button', { name: 'Send to Z Chat' }).click();
  await expect(page.locator('#z-tools-overlay')).toHaveCount(0);
  await expect(page.locator('#user-input')).toHaveValue(/Give Z an optional sidebar search/);
  await expect(page).toHaveURL(/\/$/);
});
