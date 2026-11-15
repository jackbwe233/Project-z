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

test('iPhone WebKit: safe model survives old heavyweight preferences and settings changes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('webllm:prefs', JSON.stringify({
      selectedModelId: 'gemma4',
      maxNewTokens: 4096,
    }));
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html?z_start=1');
  await expect(page.locator('#chat-scroll')).toBeVisible();
  await expect(page.locator('#model-picker input[value="lfm2"]')).toBeChecked();
  await expect(page.locator('#model-picker input[value="gemma4"]')).toBeDisabled();
  await expect(page.locator('#model-picker input[value="bonsai27b"]')).toBeDisabled();
  await expect(page.locator('#max-tokens')).toHaveValue('256');

  // Users cannot accidentally allocate a massive GPU cache by increasing replies.
  await page.locator('#max-tokens').fill('4096');
  await page.locator('#max-tokens').blur();
  await expect(page.locator('#max-tokens')).toHaveValue('256');

  await page.locator('#new-chat-btn').click();
  await expect(page.locator('#model-picker input[value="lfm2"]')).toBeChecked();
  await page.reload();
  await expect(page.locator('#model-picker input[value="lfm2"]')).toBeChecked();
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

test('iPhone WebKit: first-visit Home Screen guide appears, closes, and install help stays accessible', async ({ page }) => {
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
  await page.locator('#z-safe-start a[href="./install.html"]').click();
  await expect(page).toHaveURL(/\/install\.html$/);
  await expect(page.locator('#iphone-instructions')).toContainText('Add to Home Screen');
  await expect(page.getByRole('link', { name: 'Open Z to install' })).toBeVisible();
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


test('iPhone 16/17 family: chat header, input and messages fit common display widths', async ({ page }) => {
  const sizes = [
    [320, 700],   // narrow fallback
    [375, 812],   // compact iPhone
    [390, 844],   // standard iPhone
    [393, 852],   // 16-class device
    [402, 874],   // 16/17 Pro-class device
    [430, 932],   // larger iPhone
    [440, 956],   // Pro Max-class device
  ];
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto('/index.html?z_start=1');
    await expect(page.locator('#chat-scroll')).toBeVisible();
    await expect(page.locator('#composer-shell')).toBeVisible();
    const metrics = await page.evaluate(() => {
      const rect = id => {
        const el = document.getElementById(id);
        if (!el || getComputedStyle(el).display === 'none') return null;
        const b = el.getBoundingClientRect();
        return { left:b.left, right:b.right, top:b.top, bottom:b.bottom,
          width:b.width, height:b.height };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth,
        app: rect('app'), header: document.querySelector('.topbar').getBoundingClientRect().toJSON(),
        work: rect('z-work-top-link'), status: rect('model-status'),
        load: rect('load-model-btn'), theme: rect('theme-toggle'),
        composer: rect('composer-shell'), messageArea: rect('chat-scroll'),
        inputFont: getComputedStyle(document.getElementById('user-input')).fontSize,
      };
    });
    expect(metrics.overflow, width+'px horizontal overflow').toBeLessThanOrEqual(2);
    expect(metrics.inputFont, width+'px input text size').toBe('16px');
    expect(metrics.messageArea.height, width+'px chat height').toBeGreaterThan(110);
    expect(metrics.composer.bottom, width+'px composer bottom').toBeLessThanOrEqual(height+2);
    expect(metrics.header.bottom, width+'px header separation').toBeLessThan(metrics.messageArea.bottom);
    for (const id of ['work','status','load','theme','composer']) {
      const rect = metrics[id];
      expect(rect, width+'px '+id+' visible').not.toBeNull();
      expect(rect.left, width+'px '+id+' left').toBeGreaterThanOrEqual(-1);
      expect(rect.right, width+'px '+id+' right').toBeLessThanOrEqual(width+1);
    }
  }
  expect(errors).toEqual([]);
});

test('iPhone landscape: sidebar becomes a drawer, composer remains visible', async ({ page }) => {
  await page.setViewportSize({ width:874, height:402 });
  await page.goto('/index.html?z_start=1');
  const menu = page.locator('#sidebar-toggle');
  await expect(menu).toBeVisible();
  const composer = page.locator('#composer-shell');
  await expect(composer).toBeVisible();
  const bounds = await composer.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(875);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(404);
  await menu.click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await page.locator('#sidebar-close').click();
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
});


test('iPhone 16/17: Work, Stocks, Personal and Account tabs avoid horizontal clipping and focus zoom', async ({ page }) => {
  await page.setViewportSize({ width:402, height:874 });
  for (const path of [
    '/work.html', '/paper.html', '/personal.html', '/plugins.html',
    '/notes.html', '/music.html', '/account.html', '/google.html', '/install.html'
  ]) {
    await page.goto(path);
    const box = await page.evaluate(() => {
      const main = document.querySelector('main');
      const nav = document.querySelector('.z-shell');
      const field = document.querySelector('input:not([type="hidden"]):not([type="checkbox"]),textarea,select');
      return {
        screen:innerWidth,
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        mainRight:main?.getBoundingClientRect().right ?? 0,
        navRight:nav?.getBoundingClientRect().right ?? 0,
        font:field ? parseFloat(getComputedStyle(field).fontSize) : null
      };
    });
    expect(box.overflow,path+' document width').toBeLessThanOrEqual(2);
    expect(box.mainRight,path+' main content').toBeLessThanOrEqual(box.screen+1);
    expect(box.navRight,path+' tab navigation').toBeLessThanOrEqual(box.screen+1);
    if(box.font!=null)expect(box.font,path+' Safari form zoom threshold').toBeGreaterThanOrEqual(16);
  }
});


test('Installed iPhone Z: Menu and Close clear the Dynamic Island and remain reachable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  });
  for (const [width,height] of [[375,812],[393,852],[402,874],[440,956]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/index.html?z_start=1');
    await expect(page.locator('#chat-scroll')).toBeVisible();
    await expect(page.locator('#app')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('z-ios-fullscreen'))).toBe(true);
    const menu = page.locator('#sidebar-toggle');
    const menuBounds = await menu.boundingBox();
    expect(menuBounds.y, width+'px Menu must clear top cutout').toBeGreaterThanOrEqual(58);
    expect(menuBounds.height, width+'px Menu tap target').toBeGreaterThanOrEqual(44);
    expect(menuBounds.y+menuBounds.height).toBeLessThan(height);
    await menu.click();
    await expect(page.locator('#sidebar')).toHaveClass(/open/);
    const close = page.locator('#sidebar-close');
    const closeBounds = await close.boundingBox();
    expect(closeBounds.y, width+'px Close must clear top cutout').toBeGreaterThanOrEqual(58);
    expect(closeBounds.height, width+'px Close tap target').toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    const composerBounds = await page.locator('#composer-shell').boundingBox();
    expect(composerBounds.y+composerBounds.height, width+'px composer').toBeLessThanOrEqual(height+2);
  }
});

test('iPhone Safari: Menu can be tapped and reaches sidebar on compact screens', async ({ page }) => {
  await page.setViewportSize({width:375,height:812});
  await page.goto('/index.html?z_start=1');
  const menu = page.locator('#sidebar-toggle');
  await expect(menu).toBeVisible();
  const rect=await menu.boundingBox();
  expect(rect.y).toBeGreaterThanOrEqual(10);
  await menu.click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await page.locator('#sidebar-close').click();
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
});

test('iPhone WebKit: music discovery card, swipe buttons and playlist are usable', async ({ page }) => {
  const errors=[];
  page.on('pageerror', e => errors.push(e.message));
  const songs = Array.from({length:10},(_,i)=>({
    kind:'song',trackId:6000+i,trackName:'Discovery '+i,artistName:'Artist '+i,
    primaryGenreName:'Alternative',trackExplicitness:'notExplicit',
    trackViewUrl:'https://music.apple.com/us/song/demo-'+i,
  }));
  await page.route('https://itunes.apple.com/search**', async route =>
    route.fulfill({contentType:'application/json',body:JSON.stringify({results:songs})}));
  await page.setViewportSize({width:402,height:874});
  await page.goto('/music.html');
  await expect(page.locator('#card-title')).toContainText('Discovery');
  await expect(page.locator('#like-song')).toBeEnabled();
  await page.locator('#like-song').click();
  await page.locator('#tab-saved').click();
  await expect(page.locator('#saved-tracks li')).toHaveCount(1);
  const metrics = await page.evaluate(() => ({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    cardRight:document.querySelector('#swipe-card').getBoundingClientRect().right,
    font:parseFloat(getComputedStyle(document.querySelector('#playlist-name')).fontSize),
  }));
  expect(metrics.overflow).toBeLessThanOrEqual(2);
  expect(metrics.cardRight).toBeLessThanOrEqual(403);
  expect(metrics.font).toBeGreaterThanOrEqual(16);
  expect(errors).toEqual([]);
});
