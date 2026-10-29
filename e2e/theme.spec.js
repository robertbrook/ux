import { test, expect } from '@playwright/test';

test('follows the system until a manual theme is chosen, then persists across reloads and projects', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const toggle = page.getByRole('button', { name: 'Dark mode', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ux-theme'))).toBe('dark');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Hello, world Console' }).click();
  await expect(page.locator('#console')).toContainText('Hello, Uxn world!');
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
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#14191f');
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
  await page.locator('#pause').click();
  await expect(page.locator('#machine-status')).toContainText('Paused');
  const initialPixels = await page.locator('#screen').evaluate(canvas => canvas.toDataURL());
  await page.locator('#theme-toggle').click();
  expect(await page.locator('#screen').evaluate(canvas => canvas.toDataURL())).toBe(initialPixels);
  await page.locator('#theme-toggle').click();
  const pairs = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const rgb = color => {
      const element = document.createElement('span'); element.style.color = color; document.body.append(element);
      const result = getComputedStyle(element).color.match(/[\d.]+/g).slice(0, 3).map(Number); element.remove(); return result;
    };
    const luminance = color => rgb(color).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const value = name => root.getPropertyValue(name).trim();
    return [['--text', '--page'], ['--muted', '--panel'], ['--gutter-text', '--gutter-bg'], ['--comment', '--paper'], ['--literal', '--paper'], ['--label', '--paper'], ['--opcode', '--paper'], ['--string', '--paper'], ['--error', '--error-bg'], ['--info', '--info-bg'], ['--link', '--paper'], ['--selected-text', '--selected'], ['--breakpoint-text', '--breakpoint-bg']].map(([a, b]) => ({ pair: `${a} / ${b}`, ratio: ratio(value(a), value(b)) }));
  });
  for (const pair of pairs) expect(pair.ratio, pair.pair).toBeGreaterThanOrEqual(4.5);
  await page.locator('#source').fill('|0100 #gg BRK'); await page.locator('#assemble').click();
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
