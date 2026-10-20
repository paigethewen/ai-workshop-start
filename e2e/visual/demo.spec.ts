// The demo cases: each one drives the web view through one feature, as a person would, for its video, and
// screenshots its key moments. GitHub answers from recordings/, so every run shows the same pixels.
// Add a case for a pull request's feature; keep the ones already here, they show the features merged so far.
import { expect, test, type Page } from '@playwright/test';

// A pause is for the viewer, never to wait for the page: wait for what the page shows, then pause.
const pause = (page: Page, ms = 2000) => page.waitForTimeout(ms);

// Waits for what a scan shows; a scan that fails shows its error instead, and the case fails at once with it.
async function shown(page: Page, selector: string) {
  await page.locator(`${selector}, #problem:not([hidden])`).first().waitFor();
  if (await page.locator('#problem').isVisible()) {
    throw new Error(`the scan failed: ${await page.locator('#problem-message').textContent()}`);
  }
}

async function scan(page: Page, repo: string) {
  await page.goto('/');
  await pause(page, 1500);
  await page.locator('#repo').pressSequentially(repo, { delay: 40 });
  await page.click('#scan-button');
}

/** A key moment, compared with the baseline's `<case>-<moment>.png`; soft: the case goes on, so every changed moment is reported. */
const moment = (page: Page, name: string) => expect.soft(page).toHaveScreenshot(`${test.info().title}-${name}.png`);

test.beforeEach(async ({ context, baseURL }) => {
  // Only the web view answers: an image a SKILL.md links to on the web would differ from run to run.
  await context.route((url) => !url.href.startsWith(baseURL!), (route) => route.abort());
});

// Each case's video, as demo-videos/<case>.webm, for reviewers.
test.afterEach(async ({ page }, testInfo) => {
  await page.close();
  await page.video()?.saveAs(`demo-videos/${testInfo.title}.webm`);
});

// Scan ./fixture, open a skill with copies in three agents, and switch from its rendered body to its SKILL.md
test('read-skill', async ({ page }) => {
  await scan(page, './fixture');
  await shown(page, '#skills a');
  await moment(page, 'list');
  await pause(page);
  await page.locator('#skills a', { hasText: '×3' }).click();
  await page.locator('#skill').waitFor();
  await moment(page, 'rendered');
  await pause(page, 3000);
  await page.click('[role=tab][data-view=source]');
  await moment(page, 'source');
  await pause(page, 3000);
});

// Scan JetBrains/kotlin and filter its skills by "test": the word is marked in the list and in the open skill
test('filter-skills', async ({ page }) => {
  await scan(page, 'https://github.com/JetBrains/kotlin');
  await shown(page, '#skills a');
  await moment(page, 'list');
  await pause(page, 2500);
  await page.locator('#filter').pressSequentially('test', { delay: 250 });
  await moment(page, 'filtered');
  await pause(page, 2500);
  await page.locator('#skills a:visible').first().click();
  await page.locator('#skill').waitFor();
  await moment(page, 'marked');
  await pause(page, 3000);
  await page.click('[role=tab][data-view=source]');
  await moment(page, 'source');
  await pause(page, 3000);
  await page.locator('#filter').fill('');
  await page.locator('#filter').pressSequentially('gradle api', { delay: 150 });
  await moment(page, 'two-words');
  await pause(page, 3000);
});

// Scan the modelcontextprotocol organization, open one of its repositories, and go back to the organization
test('scan-organization', async ({ page }) => {
  await scan(page, 'https://github.com/modelcontextprotocol');
  await shown(page, '#repositories li');
  await moment(page, 'organization');
  await pause(page, 3000);
  await page.locator('#repositories a').first().click();
  await shown(page, '#skills a');
  await moment(page, 'repository');
  await pause(page, 3000);
  await page.goBack();
  await page.locator('#organization').waitFor();
  await moment(page, 'back');
  await pause(page, 3000);
});
