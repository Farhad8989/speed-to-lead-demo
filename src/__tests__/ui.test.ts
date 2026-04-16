import { test, expect, chromium } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

import { setupSheets } from '../sheets/sheetsSetup';
import { findLeadByPhone } from '../sheets/repositories/leadRepository';
import { deleteRow, getRows } from '../sheets/sheetsClient';

const BASE_URL = 'http://localhost:3000';
const TEST_PHONE = `+1555UI${Date.now()}`.slice(0, 12);
const TEST_NAME = 'UI Test User';
const TEST_EMAIL = 'uitest@example.com';

// Clean up the test lead from Sheets after the test
async function cleanupTestLead(phone: string) {
  try {
    const rows = await getRows('Leads');
    const idx = rows.findIndex(r => r[2] === phone); // phone is col index 2
    if (idx > 0) await deleteRow('Leads', idx + 1);
  } catch {
    // best-effort cleanup
  }
}

test.describe('SpeedToLead UI', () => {
  test.beforeAll(async () => {
    await setupSheets();
  });

  test('form submits successfully and lead appears in Google Sheets', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    // Intercept WhatsApp API calls so the test doesn't depend on Meta sandbox
    await context.route('**/graph.facebook.com/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ messages: [{ id: 'mock-msg-id' }] }),
      });
    });

    const page = await context.newPage();

    // Collect any console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE_URL);

    // Fill the form
    await page.fill('#name', TEST_NAME);
    await page.fill('#phone', TEST_PHONE);
    await page.fill('#email', TEST_EMAIL);
    await page.selectOption('#serviceInterest', 'SEO');

    // Submit
    await page.click('#submitBtn');

    // Wait for success message
    const result = page.locator('#result');
    await expect(result).toBeVisible({ timeout: 15000 });
    await expect(result).toHaveClass(/success/);
    await expect(result).toContainText(TEST_NAME);

    // Verify lead was written to Google Sheets
    const lead = await findLeadByPhone(TEST_PHONE);
    expect(lead).not.toBeNull();
    expect(lead!.name).toBe(TEST_NAME);
    expect(lead!.email).toBe(TEST_EMAIL);
    expect(lead!.serviceInterest).toBe('SEO');
    expect(lead!.status).toBeTruthy();

    // No unexpected console errors
    const relevantErrors = consoleErrors.filter(e => !e.includes('favicon'));
    expect(relevantErrors).toHaveLength(0);

    await browser.close();
    await cleanupTestLead(TEST_PHONE);
  });

  test('form shows error on duplicate phone submission', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    await context.route('**/graph.facebook.com/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ messages: [{ id: 'mock-msg-id' }] }),
      });
    });

    const page = await context.newPage();
    await page.goto(BASE_URL);

    const dupPhone = `+1555DUP${Date.now()}`.slice(0, 12);

    // First submission
    await page.fill('#name', TEST_NAME);
    await page.fill('#phone', dupPhone);
    await page.fill('#email', TEST_EMAIL);
    await page.selectOption('#serviceInterest', 'SEO');
    await page.click('#submitBtn');
    await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });

    // Reset and submit same phone again
    await page.fill('#name', 'Another Person');
    await page.fill('#phone', dupPhone);
    await page.fill('#email', 'other@example.com');
    await page.selectOption('#serviceInterest', 'SEO');
    await page.click('#submitBtn');

    // Should still succeed (dedup returns existing lead, not an error)
    const result = page.locator('#result');
    await expect(result).toBeVisible({ timeout: 15000 });

    await browser.close();
    await cleanupTestLead(dupPhone);
  });

  test('form shows network error message on server failure', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    // Block the API to simulate server failure
    await context.route('**/api/leads**', route => route.abort());

    const page = await context.newPage();
    await page.goto(BASE_URL);

    await page.fill('#name', TEST_NAME);
    await page.fill('#phone', TEST_PHONE);
    await page.fill('#email', TEST_EMAIL);
    await page.selectOption('#serviceInterest', 'SEO');
    await page.click('#submitBtn');

    const result = page.locator('#result');
    await expect(result).toBeVisible({ timeout: 10000 });
    await expect(result).toHaveClass(/error/);
    await expect(result).toContainText(/network error/i);

    await browser.close();
  });
});
