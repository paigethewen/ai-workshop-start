// The demo cases: each one drives the web view through one feature, as a person would, for a video.
// Add a case for a pull request's feature; keep the ones already here, they show the features merged so far.
import type { Page } from 'playwright';

export type Case = {
  about: string;
  // GitHub cases scan live repositories: they need the network, and GITHUB_TOKEN for an organization.
  github: boolean;
  run: (page: Page, base: string) => Promise<void>;
};

// A pause is for the viewer, never to wait for the page: wait for what the page shows, then pause.
const pause = (page: Page, ms = 2000) => page.waitForTimeout(ms);

async function scan(page: Page, base: string, repo: string) {
  await page.goto(base);
  await pause(page, 1500);
  await page.locator('#repo').pressSequentially(repo, { delay: 40 });
  await page.click('#scan-button');
}

export const cases: Record<string, Case> = {
  'read-skill': {
    about: 'Scan ./fixture, open a skill with copies in three agents, and switch from its rendered body to its SKILL.md',
    github: false,
    async run(page, base) {
      await scan(page, base, './fixture');
      await page.locator('#skills a').first().waitFor();
      await pause(page);
      await page.locator('#skills a', { hasText: '×3' }).click();
      await page.locator('#skill').waitFor();
      await pause(page, 3000);
      await page.click('[role=tab][data-view=source]');
      await pause(page, 3000);
    },
  },
  'filter-skills': {
    about: 'Scan JetBrains/kotlin and filter its skills by "test": the word is marked in the list and in the open skill',
    github: true,
    async run(page, base) {
      await scan(page, base, 'https://github.com/JetBrains/kotlin');
      await page.locator('#skills a').first().waitFor({ timeout: 60_000 });
      await pause(page, 2500);
      await page.locator('#filter').pressSequentially('test', { delay: 250 });
      await pause(page, 2500);
      await page.locator('#skills a:visible').first().click();
      await pause(page, 3000);
      await page.mouse.wheel(0, 600);
      await pause(page);
      await page.click('[role=tab][data-view=source]');
      await pause(page, 3000);
      await page.locator('#filter').fill('');
      await page.locator('#filter').pressSequentially('gradle api', { delay: 150 });
      await pause(page, 3000);
    },
  },
  'scan-organization': {
    about: 'Scan the anthropics organization, open one of its repositories, and go back to the organization',
    github: true,
    async run(page, base) {
      await scan(page, base, 'https://github.com/anthropics');
      await page.locator('#repositories li').first().waitFor({ timeout: 180_000 });
      await pause(page, 3000);
      await page.mouse.wheel(0, 500);
      await pause(page);
      await page.mouse.wheel(0, -500);
      await pause(page, 1000);
      await page.locator('#repositories a').first().click();
      await page.locator('#skills a').first().waitFor({ timeout: 60_000 });
      await pause(page, 3000);
      await page.goBack();
      await page.locator('#organization').waitFor();
      await pause(page, 3000);
    },
  },
};
