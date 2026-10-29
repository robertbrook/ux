import { expect } from '@playwright/test';

export async function selectExample(page, name) {
  const examples = page.locator('#example-programs');
  if (!await examples.evaluate(element => element.open)) await examples.locator('summary').click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(examples).not.toHaveAttribute('open', '');
}

export async function assembleOnly(page) {
  await page.getByRole('button', { name: 'Run options', exact: true }).click();
  await page.getByRole('button', { name: 'Assemble only', exact: true }).click();
}

export async function exportFile(page, id) {
  await page.locator('#export-toggle').click();
  const download = page.waitForEvent('download');
  await page.locator(`#${id}`).click();
  return download;
}
