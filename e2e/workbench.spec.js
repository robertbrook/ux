import { test, expect } from '@playwright/test';
async function ready(page) {
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
}
test('real WASM, examples, stepping, error recovery, memory and files', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  await expect(page.locator('#dimensions')).toHaveText('128 × 128');
  await page.getByRole('button', { name: 'Hello, world Console' }).click();
  await expect(page.locator('#console')).toContainText('Hello, Uxn world!');
  await page.getByRole('button', { name: 'Stack arithmetic Debugger' }).click();
  await expect(page.locator('#machine-status')).toContainText('Paused');
  await page.locator('#step').click();
  await expect(page.locator('#wst')).toHaveText('03');
  await page.locator('#step').click();
  await expect(page.locator('#wst')).toHaveText('0304');
  await page.locator('#step').click();
  await expect(page.locator('#wst')).toHaveText('07');
  await page.locator('#source').fill('|0100 #gg BRK');
  await page.locator('#assemble').click();
  await expect(page.locator('#notice')).toContainText('Invalid hexadecimal');
  await page.locator('#source').fill('|0100 #2a BRK');
  await page.locator('#assemble').click();
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await page.locator('#step').click();
  await expect(page.locator('#wst')).toHaveText('2a');
  await page.getByRole('tab', { name: 'Memory' }).click();
  await expect(page.locator('#memory')).toContainText('0100  80 2a 00');
  await page.getByRole('button', { name: 'Virtual files Files' }).click();
  await page.getByRole('tab', { name: 'Virtual disk' }).click();
  await expect(page.locator('#disk-files')).toContainText('greeting.txt');
  await page.locator('#export-project').click();
  await expect(page.locator('#notice')).toBeHidden();
  expect(errors).toEqual([]);
});
test('breakpoints stop before instruction; infinite loop stays interruptible', async ({ page }) => {
  await ready(page); await page.locator('#pause').click();
  await page.locator('#source').fill('|0100\n#03\n#04\nADD\nBRK');
  await page.locator('#gutter [data-line="3"]').click();
  await page.locator('#run').click();
  await expect(page.locator('#console')).toContainText('Breakpoint at 0102');
  await expect(page.locator('#wst')).toHaveText('03');
  await page.locator('#resume').click();
  await expect(page.locator('#wst')).toHaveText('07');
  await page.locator('#source').fill('|0100 @loop !loop');
  await page.locator('#run').click();
  await expect(page.locator('#machine-status')).toContainText('Running');
  await page.locator('#pause').click();
  await expect(page.locator('#machine-status')).toContainText('Paused');
});
test('keyboard and console vectors, persistence, ROM and project downloads', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Keyboard echo Controller' }).click();
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await page.locator('#screen').focus(); await page.keyboard.type('uxn');
  await expect(page.locator('#console')).toContainText('uxn');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#download-rom').click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toMatch(/\.rom$/);
  await page.locator('#source').fill('|0100 #41 #18 DEO BRK');
  await page.keyboard.press('Control+s'); await page.reload();
  await expect(page.locator('#source')).toHaveValue('|0100 #41 #18 DEO BRK');
  await expect(page.locator('#console')).toContainText('A');
});
test('desktop and mobile have no overflow and primary actions are usable', async ({ page }) => {
  for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size); await ready(page);
    await expect.poll(async () => Number((await page.locator('#instruction-count').textContent()).replace(/\D/g, ''))).toBeGreaterThan(1000000);
    await expect(page.locator('#run')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/ux-${size.width}.png`, fullPage: true });
  }
});
