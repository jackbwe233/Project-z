import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './browser-tests',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:8081', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', testIgnore: '**/ios-webkit.spec.js', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-layout', testIgnore: '**/ios-webkit.spec.js', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'iphone-webkit', testMatch: '**/ios-webkit.spec.js', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: { command: 'python3 -m http.server 8081', url: 'http://127.0.0.1:8081', reuseExistingServer: false },
});
