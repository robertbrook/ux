import { test, expect } from '@playwright/test';
import { selectExample, assembleOnly } from './helpers.js';

test('follows the system until a manual theme is chosen, then persists across reloads and projects', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  const toggle = page.getByRole('button', { name: 'Dark mode', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ux-theme'))).toBe('dark');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await selectExample(page, 'Hello, world Console');
  await expect(page.locator('#console')).toHaveValue(/Hello, Uxn world!/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('saved theme applies before the application module executes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('ux-theme', 'dark'));
  await page.route('**/src/main.js', route => route.abort());
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#212529');
});

test('uses the current system theme when it changes before the application module executes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  let releaseModule;
  let notifyModuleRequested;
  const moduleRequested = new Promise(resolve => { notifyModuleRequested = resolve; });
  const moduleReleased = new Promise(resolve => { releaseModule = resolve; });
  await page.route('**/src/main.js', async route => {
    notifyModuleRequested();
    await moduleReleased;
    await route.continue();
  });

  const navigation = page.goto('./');
  await moduleRequested;
  await page.emulateMedia({ colorScheme: 'light' });
  releaseModule();
  await navigation;

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff');
});

test('theme changes synchronize between tabs without touching workspace data', async ({ page, context }) => {
  await page.goto('./');
  const other = await context.newPage(); await other.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  const workspace = await page.evaluate(() => localStorage.getItem('ux-workbench-v1'));
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await expect(other.locator('html')).toHaveAttribute('data-theme', await page.locator('html').getAttribute('data-theme'));
  expect(await page.evaluate(() => localStorage.getItem('ux-workbench-v1'))).toBe(workspace);
});

test('dark surfaces, syntax, notices and controls remain legible on desktop and mobile', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#machine-status')).toContainText('Paused');
  const initialPixels = await page.locator('#screen').evaluate(canvas => canvas.toDataURL());
  await page.locator('#theme-toggle').click();
  expect(await page.locator('#screen').evaluate(canvas => canvas.toDataURL())).toBe(initialPixels);
  await page.locator('#theme-toggle').click();
  const pairs = await page.evaluate(() => {
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    const rgb = color => {
      context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = color => rgb(color).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    return ['fg-body bg-body', 'fg-2 bg-1', 'fg-primary bg-body', 'fg-emphasis-warning bg-body', 'fg-success bg-body', 'alert theme-danger', 'alert theme-info'].map(classes => {
      const element = document.createElement('div'); element.className = classes; element.textContent = 'Contrast'; document.body.append(element);
      const style = getComputedStyle(element), result = { pair: classes, ratio: ratio(style.color, style.backgroundColor) };
      element.remove(); return result;
    });
  });
  for (const pair of pairs) expect(pair.ratio, pair.pair).toBeGreaterThanOrEqual(4.5);
  await page.locator('#source').fill('|0100 #gg BRK'); await assembleOnly(page);
  await expect(page.locator('#notice')).toHaveAttribute('data-error', 'true');
  await page.locator('#reference-toggle').click();
  await expect(page.locator('#reference')).toBeVisible();
  await page.locator('#reference-close').click();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#theme-toggle')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/dark-${viewport.width}.png`, fullPage: true });
  }
});
