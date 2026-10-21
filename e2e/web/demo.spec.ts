// The demo cases: each one drives the web view through one feature, as a person would, and is recorded as a
// video for the pull request's reviewer. Its key moments are screenshots, compared to the pixel with the
// baselines in screenshots/. GitHub answers from github.json, so every run shows the same.
// Add a case for a pull request's feature; keep the ones already here, they show the features merged so far.
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ORGANIZATION, REPOSITORY } from './serve.ts';

// A pause is for the viewer, never to wait for the page: wait for what the page shows, then pause.
const pause = (page: Page, ms = 2000) => page.waitForTimeout(ms);

/**
 * A key moment: the page as it is now, the same as its baseline. Soft: the case goes on, so every changed moment
 * shows. Without a baseline Playwright takes no screenshot: the moment is attached as its `-actual`, for review,
 * after the comparison, so the comparison is timed as when the baselines are taken.
 */
async function moment(page: Page, name: string) {
  const missing = !existsSync(test.info().snapshotPath(`${name}.png`, { kind: 'screenshot' }));
  await expect.soft(page).toHaveScreenshot(`${name}.png`);
  if (missing && test.info().config.updateSnapshots === 'none') {
    const path = test.info().outputPath(`${name}-actual.png`);
    await page.screenshot({ path, animations: 'disabled', caret: 'hide' });
    await test.info().attach(`${name}-actual.png`, { path, contentType: 'image/png' });
  }
}

// Waits for what a scan shows; a scan that fails shows its error instead, and the case fails at once with it.
async function shown(page: Page, selector: string) {
  await page.locator(`${selector}, #problem:not([hidden])`).first().waitFor();
  if (await page.locator('#problem').isVisible()) {
    throw new Error(`the scan failed: ${await page.locator('#problem-message').textContent()}`);
  }
}

/** Scans `repo` from the welcome page; one case checks the welcome page too, the same for all. */
async function scan(page: Page, repo: string, welcome = false) {
  await page.goto('/');
  if (welcome) await moment(page, 'welcome');
  await pause(page, 1500);
  await page.locator('#repo').pressSequentially(repo, { delay: 40 });
  await page.click('#scan-button');
}

test('read-skill: scan ./fixture, open a skill with copies in three agents, and switch from its rendered body to its SKILL.md', async ({ page }) => {
  await scan(page, './fixture', true);
  await shown(page, '#skills a');
  await moment(page, 'read-skill-1-list');
  await pause(page);
  await page.locator('#skills a', { hasText: '×3' }).click();
  await expect(page.locator('#skill')).toBeVisible();
  await moment(page, 'read-skill-2-rendered');
  await pause(page, 3000);
  await page.click('[role=tab][data-view=source]');
  await expect(page.locator('#skill-source')).toBeVisible();
  await moment(page, 'read-skill-3-source');
  await pause(page, 3000);
});

test('filter-skills: scan JetBrains/kotlin and filter its skills by "test": the word is marked in the list and in the open skill', async ({ page }) => {
  await scan(page, REPOSITORY);
  await shown(page, '#skills a');
  await moment(page, 'filter-skills-1-list');
  await pause(page, 2500);
  await page.locator('#filter').pressSequentially('test', { delay: 250 });
  await expect(page.locator('#skills mark:visible', { hasText: /^test$/i }).first()).toBeVisible();
  await moment(page, 'filter-skills-2-filtered');
  await pause(page, 2500);
  await page.locator('#skills a:visible').first().click();
  await expect(page.locator('#skill mark:visible', { hasText: /^test$/i }).first()).toBeVisible();
  await moment(page, 'filter-skills-3-marked');
  await pause(page, 3000);
  await page.mouse.wheel(0, 600);
  await pause(page);
  await page.click('[role=tab][data-view=source]');
  await expect(page.locator('#skill-source mark:visible', { hasText: /^test$/i }).first()).toBeVisible();
  await moment(page, 'filter-skills-4-source');
  await pause(page, 3000);
  await page.locator('#filter').fill('');
  await page.locator('#filter').pressSequentially('gradle api', { delay: 150 });
  await expect(page.locator('#skills mark:visible', { hasText: /^api$/i }).first()).toBeVisible();
  await moment(page, 'filter-skills-5-two-words');
  await pause(page, 3000);
});

test('scan-organization: scan the modelcontextprotocol organization, count its repositories as they are scanned, open one of them, and go back to the organization', async ({ page }) => {
  await scan(page, ORGANIZATION);
  // While it scans: how many repositories are done, and those with skills so far, not yet links.
  await expect(page.locator('#organization-summary')).toHaveText(/^[1-9]\d* of \d+ repositories scanned$/);
  await expect(page.locator('#repositories a:not([href])').first()).toBeVisible();
  await shown(page, '#repositories a[href]');
  await moment(page, 'scan-organization-1-repositories');
  await pause(page, 3000);
  await page.mouse.wheel(0, 500);
  await pause(page);
  await page.mouse.wheel(0, -500);
  await pause(page, 1000);
  await page.locator('#repositories a[href]').first().click();
  await shown(page, '#skills a');
  await moment(page, 'scan-organization-2-repository');
  await pause(page, 3000);
  await page.goBack();
  await expect(page.locator('#organization')).toBeVisible();
  await moment(page, 'scan-organization-3-back');
  await pause(page, 3000);
});
test('reload-skill: scan ./fixture, open test-runner, and reload: the same skill is open, its #<path> kept', async ({ page }) => {
  await scan(page, './fixture');
  await shown(page, '#skills a');
  await pause(page);
  await page.locator('#skills a', { hasText: 'test-runner' }).click();
  await expect(page.locator('#skill-name')).toHaveText('test-runner');
  await expect(page).toHaveURL(/\?repo=\.%2Ffixture#\.claude%2Fskills%2Ftest-runner%2FSKILL\.md$/);
  await moment(page, 'reload-skill-1-open');
  await pause(page, 3000);
  await page.reload();
  await shown(page, '#skills a');
  await expect(page.locator('#skill-name')).toHaveText('test-runner');
  await expect(page).toHaveURL(/\?repo=\.%2Ffixture#\.claude%2Fskills%2Ftest-runner%2FSKILL\.md$/);
  await moment(page, 'reload-skill-2-reloaded');
  await pause(page, 3000);
});
