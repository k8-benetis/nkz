import { test, expect } from '@playwright/test'

/**
 * Smoke tests — verify the application loads and basic navigation works.
 * These tests don't require authentication.
 */

test.describe('Application Smoke Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBeLessThan(400)
  })

  test('page has correct title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/[Nn]ekazari/)
  })

  test('login page is accessible', async ({ page }) => {
    await page.goto('/')
    // The app should redirect to Keycloak login or show a login state
    // Wait for either the app to load or a redirect
    await page.waitForLoadState('networkidle')
    // The page should have loaded without crashing
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})

test.describe('Authentication Flow', () => {
  test('unauthenticated user sees login prompt', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Should either show login button or redirect to Keycloak
    const url = page.url()
    const hasLoginFlow = url.includes('auth') || url.includes('login') ||
      await page.locator('text=/[Ll]ogin|[Ii]niciar/').isVisible().catch(() => false)
    expect(hasLoginFlow).toBeTruthy()
  })
})
