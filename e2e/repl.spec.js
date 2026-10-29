import { test, expect } from '@playwright/test';
import { selectExample } from './helpers.js';

async function open(page) {
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await page.getByRole('tab', { name: 'REPL', exact: true }).click();
  await expect(page.locator('#repl-status')).toHaveText('Ready');
}
async function evaluate(page, source) {
  await page.locator('#repl-input').fill(source);
  await page.locator('#repl-input').press('Enter');
  await expect(page.locator('#repl-form')).toHaveAttribute('aria-busy', 'false');
}

test('REPL evaluates incrementally with persistent stacks, memory, definitions and console output', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  const projectSource = await page.locator('#source').inputValue();
  await evaluate(page, '#03 #04 ADD');
  await expect(page.locator('#repl-wst')).toHaveText('07');
  await evaluate(page, '#02 MUL #09 STH');
  await expect(page.locator('#repl-wst')).toHaveText('0e');
  await expect(page.locator('#repl-rst')).toHaveText('09');
  await evaluate(page, '#2a #10 STZ %DOUBLE { DUP ADD }');
  await evaluate(page, '#10 LDZ DOUBLE #41 #18 DEO');
  await expect(page.locator('#repl-wst')).toHaveText('0e 54');
  await expect(page.locator('#repl-output')).toHaveValue(/A/);
  await expect(page.locator('#repl-output')).toHaveValue(/wst \[07\]/);
  await expect(page.locator('#source')).toHaveValue(projectSource);
  await expect(page.locator('#machine-status')).toContainText('Running');
  await page.locator('#repl-input').fill('#gg');
  await page.locator('#repl-input').press('Control+Enter');
  await expect(page.locator('#repl-output')).toHaveValue(/Invalid hexadecimal/);
  await expect(page.locator('#repl-wst')).toHaveText('0e 54');
  await evaluate(page, 'INC');
  await expect(page.locator('#repl-wst')).toHaveText('0e 55');
  await page.locator('#repl-clear').click();
  await expect(page.locator('#repl-output')).toHaveValue('');
  await expect(page.locator('#repl-wst')).toHaveText('0e 55');

  await selectExample(page, 'Hello, world Console');
  await expect(page.locator('#console')).toHaveValue(/Hello, Uxn world!/);
  await page.getByRole('tab', { name: 'REPL', exact: true }).click();
  await expect(page.locator('#repl-wst')).toHaveText('0e 55');
  await page.locator('#repl-reset').click();
  await expect(page.locator('#repl-status')).toHaveText('Ready');
  await evaluate(page, '#10 LDZ');
  await expect(page.locator('#repl-wst')).toHaveText('00');
  await expect(page.locator('#repl-rst')).toHaveText('Empty');
  await evaluate(page, 'DOUBLE');
  await expect(page.locator('#repl-output')).toHaveValue(/Unknown label/);
  expect(errors).toEqual([]);
});

test('multiline input, history, stop, execution limit and halt recovery', async ({ page }) => {
  await open(page);
  const input = page.locator('#repl-input');
  await input.fill('#03'); await input.press('End'); await input.press('Shift+Enter');
  await input.pressSequentially('#04 ADD');
  await expect(input).toHaveValue('#03\n#04 ADD');
  await input.press('Enter');
  await expect(page.locator('#repl-wst')).toHaveText('07');
  await input.press('ArrowUp');
  await expect(input).toHaveValue('#03\n#04 ADD');
  await input.press('Control+End'); await input.press('ArrowDown');
  await expect(input).toHaveValue('');
  await input.fill('@loop !loop'); await input.press('Enter');
  await expect(page.locator('#repl-stop')).toBeEnabled();
  await page.locator('#repl-stop').click();
  await expect(page.locator('#repl-status')).toContainText('Stopped');
  await expect(page.locator('#repl-wst')).toHaveText('07');
  await evaluate(page, '@forever !forever');
  await expect(page.locator('#repl-output')).toHaveValue(/Stopped after 1,000,000 instructions/);
  await evaluate(page, '#01 #0f DEO');
  await expect(page.locator('#repl-status')).toContainText('Halted');
  await expect(page.locator('#repl-eval')).toBeDisabled();
  await page.locator('#repl-reset').click();
  await expect(page.locator('#repl-status')).toHaveText('Ready');
  await evaluate(page, '#2a');
  await expect(page.locator('#repl-wst')).toHaveText('2a');
});

test('REPL is usable in both themes on desktop and mobile', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await open(page);
      await evaluate(page, '#03 #04 ADD');
      await expect(page.locator('#repl-wst')).toHaveText('07');
      await expect(page.locator('#instruction-count')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/repl-${theme}-${width}.png`, fullPage: true });
    }
  }
});

test('REPL worker loading failure is visible and reset retries without affecting the project', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#runtime-status')).toContainText('ready');
  await page.route('**/uxn.wasm', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('tab', { name: 'REPL', exact: true }).click();
  await expect(page.locator('#repl-output')).toHaveValue(/REPL WASM download failed \(503\)/);
  await expect(page.locator('#repl-eval')).toBeDisabled();
  await expect(page.locator('#machine-status')).toContainText('Running');
  await page.unroute('**/uxn.wasm');
  await page.locator('#repl-reset').click();
  await expect(page.locator('#repl-status')).toHaveText('Ready');
  await evaluate(page, '#2a');
  await expect(page.locator('#repl-wst')).toHaveText('2a');
});
