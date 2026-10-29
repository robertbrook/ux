import { test, expect } from '@playwright/test';

test('only Bootstrap 6 supplies styles, including menus, dialogs and syntax preview', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  const css = await page.evaluate(async () => Promise.all([...document.styleSheets].map(async sheet =>
    sheet.href ? (await fetch(sheet.href)).text() : sheet.ownerNode.textContent)));
  expect(css).toHaveLength(1);
  expect(css[0].includes('--bs-blue-025:')).toBe(true);
  expect(css[0].includes('.btn-solid')).toBe(true);
  await page.locator('#export-toggle').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#export-toggle')).toBeFocused();
  expect(await page.locator('[style]:not(.menu)').count()).toBe(0);
  await page.getByText('Syntax preview', { exact: true }).click();
  await expect(page.locator('#highlight .fg-primary').first()).toBeVisible();
  const source = page.locator('#source');
  expect(await source.evaluate(element => getComputedStyle(element).textWrapMode)).toBe('nowrap');
  const lineHeight = await source.evaluate(element => parseFloat(getComputedStyle(element).lineHeight));
  expect((await page.locator('#gutter [data-line="1"]').boundingBox()).height).toBeCloseTo(lineHeight);
  await page.locator('#reference-toggle').click();
  await expect(page.locator('#reference')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reference')).toBeHidden();
  await expect(page.locator('#reference-toggle')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(2000);
  expect(errors).toEqual([]);
});

test('bitmap scaling preserves original-resolution exports and logical mouse coordinates', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await page.locator('#source').fill(`|0100
    #0080 #22 DEO2 #0080 #24 DEO2 ;mouse #90 DEO2 BRK
    @mouse #92 DEI2 #28 DEO2 #94 DEI2 #2a DEO2 #01 #2e DEO BRK`);
  for (const value of ['1', '2', 'fit']) {
    await page.locator('#run').click();
    await expect(page.locator('#runtime-status')).toContainText('ready');
    await page.getByRole('button', { name: 'Display settings', exact: true }).click();
    await page.getByLabel('Display scale').selectOption(value);
    await page.keyboard.press('Escape');
    const raw = page.locator('#screen-raw');
    await expect(raw).toHaveAttribute('width', '128');
    const pixel = () => raw.evaluate(canvas => [...canvas.getContext('2d').getImageData(32, 48, 1, 1).data]);
    const before = await pixel();
    const screen = page.locator('#screen');
    await screen.scrollIntoViewIfNeeded();
    const bounds = await screen.boundingBox();
    if (value !== 'fit') expect(bounds.width).toBe(128 * Number(value));
    await page.mouse.click(bounds.x + bounds.width * 32.5 / 128, bounds.y + bounds.height * 48.5 / 128);
    await expect.poll(pixel).not.toEqual(before);
  }
});
