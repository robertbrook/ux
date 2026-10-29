import { test, expect } from '@playwright/test';
import { selectExample, assembleOnly, exportFile } from './helpers.js';

async function contents(download) {
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks);
}

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`progressive controls, keyboard access and settings at ${width}px in ${theme}`, async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('./');
      await expect(page.locator('#runtime-status')).toContainText('ready');
      await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
      await expect(page.locator('#assemble')).toBeHidden();
      await expect(page.locator('#font-size')).toBeHidden();
      await expect(page.locator('#scale')).toBeHidden();
      await expect(page.locator('#instruction-count')).toBeHidden();
      await expect(page.locator('#pc-readout')).toBeHidden();
      await expect(page.getByRole('tab', { name: 'Memory', exact: true })).toBeHidden();
      await expect(page.locator('.app-header')).not.toContainText('Small machine');
      await expect(page.locator('.app-header')).not.toContainText('WebAssembly');
      await expect(page.locator('.editor-footer')).not.toContainText('UTF-8');
      await expect(page.locator('.statusbar')).not.toContainText('Local execution');
      expect(await page.locator('#source').evaluate(element => getComputedStyle(element).fontSize)).toBe('14px');

      const options = page.getByRole('button', { name: 'Run options', exact: true });
      await options.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
      await expect(page.locator('#assemble')).toBeFocused();
      const bounds = await page.locator('#run-menu').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await expect(page.locator('#assemble')).toBeHidden();
      await expect(options).toBeFocused();

      await page.getByRole('button', { name: 'Editor settings', exact: true }).click();
      await page.getByLabel('Text size').selectOption('18');
      expect(await page.locator('#source').evaluate(element => getComputedStyle(element).fontSize)).toBe('18px');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Display settings', exact: true }).click();
      await expect(page.getByLabel('Display scale')).toHaveValue('fit');
      await page.getByLabel('Display scale').selectOption('2');
      await expect(page.locator('#screen')).not.toHaveClass('fit');
      await page.getByLabel('Display scale').selectOption('fit');
      await expect(page.locator('#screen')).toHaveClass('fit');
      await page.keyboard.press('Escape');

      await selectExample(page, 'Stack arithmetic Debugger');
      await expect(page.getByRole('tab', { name: 'Debug', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.inspector')).toHaveClass('inspector expanded');
      await expect(page.locator('#instruction-count')).toBeVisible();
      await expect(page.locator('#step')).toBeEnabled();
      await page.keyboard.press('F10');
      await expect(page.locator('#wst')).toHaveText('03');
      await page.getByRole('tab', { name: 'Stacks', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: 'Memory', exact: true })).toBeFocused();
      await expect(page.locator('#memory')).toContainText('0100');
      await page.keyboard.press('End');
      await expect(page.locator('#devices .device-row')).toHaveCount(16);
      if (width === 1440 && theme === 'light') await page.screenshot({ path: 'test-results/simplified-debug.png', fullPage: true });
      await page.getByRole('tab', { name: 'Console' }).click();
      await expect(page.locator('.inspector')).not.toHaveClass(/expanded/);
      await expect(page.locator('#instruction-count')).toBeHidden();
      await page.getByRole('tab', { name: 'Debug', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Devices', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.getByRole('tab', { name: 'Console' }).click();

      await selectExample(page, 'Interference Screen');
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
      await page.keyboard.press('F6');
      await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
      await page.keyboard.press('F5');
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/simplified-${theme}-${width}.png`, fullPage: true });
      await page.locator('#export-toggle').click();
      if (width === 390 && theme === 'dark') await page.screenshot({ path: 'test-results/simplified-export.png', fullPage: true });
      await page.locator('#filename').click();
      await expect(page.locator('#export-menu')).not.toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

test('one Export menu preserves project, source, ROM and unmodified PNG downloads', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#machine-status')).toContainText('Paused');
  const png = await page.locator('#screen').evaluate(canvas => canvas.toDataURL().split(',')[1]);
  expect(await contents(await exportFile(page, 'screenshot'))).toEqual(Buffer.from(png, 'base64'));
  const source = '|0100 #2a BRK';
  await page.locator('#source').fill(source);
  await assembleOnly(page);
  await expect(page.locator('#runtime-status')).toContainText('ready');
  expect(await contents(await exportFile(page, 'download-rom'))).toEqual(Buffer.from([0x80, 0x2a, 0x00]));
  expect((await contents(await exportFile(page, 'download-source'))).toString()).toBe(source);
  const project = JSON.parse((await contents(await exportFile(page, 'export-project'))).toString());
  expect(project.version).toBe(1);
  expect(project.project.sources[project.project.entry]).toBe(source);
  await expect(page.locator('#export-menu')).not.toBeVisible();
  await page.locator('#source').fill('|0100 #01 #0f DEO BRK');
  await page.locator('#run').click();
  await expect(page.locator('#machine-status')).toContainText('Halted');
  await expect(page.locator('#execution-toggle')).toBeDisabled();
  await expect(page.locator('#reset')).toBeEnabled();
});

test('explicit file entry action, project actions and imports survive persistence', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  const original = await page.locator('#filename').textContent();
  await page.locator('#import').setInputFiles({ name: 'second.tal', mimeType: 'text/plain', buffer: Buffer.from('|0100 #42 #18 DEO BRK') });
  await expect(page.locator('#filename')).toHaveText('second.tal');
  await expect(page.locator('#entry-label')).toContainText(original);
  await page.getByRole('button', { name: 'Actions for second.tal', exact: true }).click();
  await page.getByRole('button', { name: 'Set as entry', exact: true }).click();
  await expect(page.locator('#entry-label')).toContainText('second.tal');
  await page.locator('#run').click();
  await expect(page.locator('#console')).toContainText('B');
  await page.reload();
  await expect(page.locator('#entry-label')).toContainText('second.tal');
  await expect(page.locator('#console')).toContainText('B');

  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Renamed project');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#project-title')).toHaveText('Renamed project');
  await page.getByRole('button', { name: 'New source file', exact: true }).click();
  await page.getByLabel('Relative file name').fill('library.tal');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#filename')).toHaveText('library.tal');
  await page.getByRole('button', { name: 'Actions for library.tal', exact: true }).click();
  await page.getByRole('button', { name: 'Delete library.tal', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#filename')).toHaveText('second.tal');

  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Temporary project');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#project-title')).toHaveText('Temporary project');
  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#project-title')).toHaveText('Renamed project');
  expect(errors).toEqual([]);
});
