import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('Home Screen guide')) return;
  // Existing iPhone regression tests simulate someone who already dismissed onboarding.
  await page.addInitScript(() => {
    try { localStorage.setItem('project-z:install-guide-dismissed:v1', '1'); } catch { /* ignore */ }
  });
});

test('iPhone WebKit: start Z without loading a model, then enter chat', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#z-safe-start')).toBeVisible();
  await expect(page.locator('#z-launch-question')).toBeEditable();
  await page.locator('#z-launch-open').click();
  await expect(page.locator('#chat-scroll')).toBeVisible();
  await expect(page.locator('#user-input')).toBeEditable();
  expect(errors).toEqual([]);
});

test('iPhone WebKit: import calendar and school deadlines without account sign-in', async ({ page }) => {
  await page.goto('/personal.html');
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
    'SUMMARY:Physics project','DTSTART;VALUE=DATE:20261117',
    'END:VEVENT','END:VCALENDAR',
  ].join('\r\n');
  await page.locator('#import-ics').setInputFiles({
    name: 'events.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics),
  });
  await expect(page.locator('#import-status')).toContainText('Added 1 item');
  await expect(page.locator('#tasks')).toContainText('Physics project');
  await page.locator('#import-csv').setInputFiles({
    name: 'assignments.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Title,Due Date,Class\nRead chapter 5,2026-11-18,Psychology\n'),
  });
  await expect(page.locator('#import-status')).toContainText('Added 1 item');
  await expect(page.locator('#tasks')).toContainText('Psychology: Read chapter 5');
  await page.reload();
  await expect(page.locator('#tasks')).toContainText('Physics project');
  await expect(page.locator('#tasks')).toContainText('Psychology: Read chapter 5');
});

test('iPhone WebKit: import exported Google Docs text and save a note', async ({ page }) => {
  await page.goto('/notes.html');
  await page.locator('#import-doc').setInputFiles({
    name: 'My essay.txt', mimeType: 'text/plain',
    buffer: Buffer.from('An essay draft exported from Google Docs.'),
  });
  await expect(page.locator('#body')).toHaveValue('An essay draft exported from Google Docs.');
  await expect(page.locator('#title')).toHaveValue('My essay');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#status')).toContainText('Note saved');
});

test('iPhone WebKit: built-in tools stay in Z without a page restart', async ({ page }) => {
  await page.goto('/?z_start=1');
  await expect(page.locator('#chat-scroll')).toBeVisible();
  await page.locator('#z-tool-link').click();
  await expect(page.locator('#z-tools-overlay')).toBeVisible();
  await expect(page.frameLocator('#z-tools-frame').getByRole('heading', { name: 'Apps & Plugins.' })).toBeVisible();
  await page.locator('#z-tools-back').click();
  await expect(page.locator('#z-tools-overlay')).toHaveCount(0);
  await expect(page.locator('#chat-scroll')).toBeVisible();
});

test('iPhone WebKit: first-visit Home Screen guide appears, closes, and can be reopened', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const guide = page.locator('#z-install-guide');
  await expect(guide).toBeVisible({ timeout: 10000 });
  await expect(guide.getByRole('heading', { name: 'Add Z to your Home Screen' })).toBeVisible();
  await expect(guide).toContainText('Add to Home Screen');
  await page.getByRole('button', { name: 'Maybe later' }).click();
  await expect(guide).toHaveCount(0);
  await expect(page.locator('#z-safe-start')).toBeVisible();
  await page.reload();
  await expect(page.locator('#z-install-guide')).toHaveCount(0);
  await page.locator('[data-z-install-guide]').click();
  await expect(page.locator('#z-install-guide')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('#z-install-guide')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('iPhone WebKit: startup install link opens real instructions rather than doing nothing', async ({ page }) => {
  await page.goto('/');
  const action = page.locator('#z-safe-start a[href="./install.html"]');
  await expect(action).toBeVisible();
  await action.click();
  await expect(page).toHaveURL(/\/install\.html$/);
  await expect(page.getByRole('heading', { name: 'Put Z on your Home Screen.' })).toBeVisible();
  await expect(page.locator('#iphone-instructions')).toContainText('Add to Home Screen');
  await expect(page.getByRole('link', { name: 'Open Z to install' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Z to install' }).click();
  await expect(page.locator('#z-safe-start')).toBeVisible();
});
