import { test, expect } from '@playwright/test';

test('Google connection is discoverable from the plugins hub and asks for configuration', async ({ page }) => {
  await page.goto('/plugins.html');
  const connect = page.getByRole('link', { name: /Connect Google Calendar/ });
  await expect(connect).toBeVisible();
  await expect(connect).toHaveAttribute('href', './google.html');
  await page.goto('/google.html');
  await expect(page.getByRole('heading', { name: 'Connect Google Calendar' })).toBeVisible();
  await expect(page.locator('#connection-badge')).toHaveText('Not connected');
  await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await expect(page.locator('#status')).toContainText('valid Google OAuth Web Client ID');
});

test('Google Calendar sign-in can read events and copy them into Z Personal, without saving access tokens', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.google={accounts:{oauth2:{initTokenClient:(opts)=>({requestAccessToken:()=>opts.callback({access_token:"mock-google-token",expires_in:3600})}),revoke:(_token,cb)=>cb()}}};'
  }));
  await page.route('https://www.googleapis.com/calendar/v3/calendars/primary/events?**', route => {
    expect(route.request().headers().authorization).toBe('Bearer mock-google-token');
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: 'test-calendar-event-id',
          summary: 'Google calendar test event',
          start: { date: '2026-12-02' },
          end: { date: '2026-12-03' },
          htmlLink: 'https://calendar.google.com/calendar/u/0/r/eventedit'
        }]
      })
    });
  });
  await page.goto('/google.html');
  await page.locator('#client-id').fill('123456789-ztest.apps.googleusercontent.com');
  await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
  await expect(page.locator('#connection-badge')).toContainText('Connected');
  await expect(page.locator('#events')).toContainText('Google calendar test event');
  await expect(page.locator('#status')).toContainText('Showing 1 upcoming');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('mock-google-token');
  await page.getByRole('button', { name: 'Copy events to Z Personal' }).click();
  await expect(page.locator('#status')).toContainText('Copied 1 event');
  const tasks = await page.evaluate(() => JSON.parse(localStorage.getItem('z-personal-tasks-v1')));
  expect(tasks[0].googleId).toBe('test-calendar-event-id');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.locator('#connection-badge')).toHaveText('Not connected');
  await page.goto('/personal.html');
  await expect(page.locator('#tasks')).toContainText('Google calendar test event');
  expect(errors).toEqual([]);
});
