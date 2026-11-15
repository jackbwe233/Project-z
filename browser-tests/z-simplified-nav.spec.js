import { test, expect } from '@playwright/test';

const pages = [
  '/account.html', '/code-lab.html', '/command-center.html', '/focus.html',
  '/google.html', '/install.html', '/music.html', '/notes.html', '/paper.html',
  '/personal.html', '/plugins.html', '/privacy.html', '/quick.html',
  '/recovery.html', '/research.html', '/shortcut.html', '/work.html',
];

test('All 17 Z tool pages: readable mobile navigation and no script errors', async ({ page }) => {
  await page.setViewportSize({width:402, height:874});
  for (const path of pages) {
    const errors = [];
    const onError = err => errors.push(err.message);
    page.on('pageerror', onError);
    await page.goto(path);
    await expect(page.locator('.z-shell').first(), path).toBeVisible();
    await expect(page.locator('main h1').first(), path).toBeVisible();
    if (path !== '/recovery.html') {
      const dock = page.getByRole('navigation', { name:'Quick navigation' });
      await expect(dock, path).toBeVisible();
      for(const name of ['Chat','Day','Work','Notes','Music','More']) {
        await expect(dock.getByRole('link',{name:name==='More'?'More Z tools':name}),path+' '+name).toBeVisible();
      }
    }
    const dimensions = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      shellRight: document.querySelector('.z-shell')?.getBoundingClientRect().right,
    }));
    expect(dimensions.overflow, path+' horizontal scroll').toBeLessThanOrEqual(4);
    expect(dimensions.shellRight, path+' shell bounds').toBeLessThanOrEqual(403);
    expect(errors,path+' script errors').toEqual([]);
    page.off('pageerror', onError);
  }
});

test('Every main page uses a small, searchable More menu instead of a scrolling tab bar',async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/notes.html');
  const shell = page.locator('.z-shell--simple');
  await expect(shell).toBeVisible();
  await expect(shell.locator('.z-shell-links')).toBeHidden();
  const trigger = shell.getByText('More',{exact:true});
  await trigger.click();
  const search = shell.getByRole('searchbox',{name:'Find a Z tool'});
  await expect(search).toBeVisible();
  await search.fill('Google');
  await expect(shell.getByRole('link',{name:'Google Calendar'})).toBeVisible();
  await expect(shell.getByRole('link',{name:'Stock research'})).toBeHidden();
  await search.fill('notrealtool');
  await expect(shell.getByText('No matching tools')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
});
