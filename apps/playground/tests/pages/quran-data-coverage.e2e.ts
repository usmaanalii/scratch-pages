import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('opens the coverage page directly and after refresh', async ({ page }) => {
  await page.goto('./quran-data-coverage/')
  await expect(page.getByRole('table', { name: 'Dictionary coverage' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Qur’an data coverage' })).toBeVisible()
})

test('fits the built coverage page and supports keyboard lookup on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.route('**/functions/v1/quran/v2/coverage/lookup?*', route => route.fulfill({
    json: {
      mode: 'word', total: 1, nextCursor: null,
      occurrences: [{
        chapter: 2, verse: 20, position: 11, spelling: 'أَظْلَمَ',
        analyses: [{
          segment: 1, root: 'ظلم', lemma: 'أَظْلَمَ',
          lane: { status: 'indexed', basis: 'root', count: 2 },
          mufradat: { status: 'missing' },
        }],
      }],
    },
  }))
  await page.goto('./quran-data-coverage/')
  const query = page.getByRole('textbox', { name: 'Arabic query' })
  await query.fill('أظلم')
  await query.press('Enter')
  await expect(page.getByText('2:20, word 11')).toBeVisible()
  await expect(query).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
