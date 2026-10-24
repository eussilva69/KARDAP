---
name: playwright-testing
description: "Complete Playwright end-to-end (E2E) testing suite + Flaky Test Elimination. Covers Page Object Model (POM), web-first locators (getByRole, getByTestId), auto-waiting assertions, authentication state reuse (storageState), trace viewer diagnostics, and CI stability."
when_to_use: "When writing, debugging, or optimizing Playwright E2E tests, automating browser flows, diagnosing CI test failures, or eliminating flaky tests."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 2.0.0
priority: HIGH
---

# Complete Playwright E2E Testing & Flakiness Elimination Suite

> **CORE PRINCIPLE:** Reliable E2E tests test user-visible behavior, rely on web-first assertions with auto-waiting, use resilient locators, and never rely on hardcoded `page.waitForTimeout()`.

---

## 1. Modern Playwright Standards

### Locators Hierarchy (Prioritize Top to Bottom)
1. `page.getByRole('button', { name: 'Salvar' })` (Accessible, mirrors user perception)
2. `page.getByLabel('E-mail')` (Form inputs)
3. `page.getByText('Pedido Confirmado')` (Non-interactive text)
4. `page.getByTestId('cart-item')` (Dynamic or complex elements)
*AVOID:* Fragile CSS selectors like `div > span:nth-child(3) > button`.

### Web-First Assertions (Auto-Waiting)
```typescript
// Correct: waits automatically up to expect timeout
await expect(page.getByRole('alert')).toBeVisible();
await expect(page.getByRole('button', { name: 'Pagar' })).toBeEnabled();

// WRONG: no waiting, race condition prone
expect(await page.getByRole('alert').isVisible()).toBe(true);
```

### Authentication State Reuse
Use `storageState` to log in once in global setup or test fixtures, saving cookies and local storage to `.auth/user.json`, avoiding repeated login flows across tests.

---

## 2. Flaky Test Elimination Protocol

1. **Eliminate Arbitrary Sleeps:** Replace every `page.waitForTimeout(3000)` with state-based assertions:
   - `await page.waitForLoadState('networkidle')`
   - `await expect(page.getByTestId('spinner')).toBeHidden()`
   - `await page.waitForURL('/dashboard')`
2. **Network Race Conditions:** Use `page.waitForResponse(url)` before triggering actions that initiate asynchronous requests.
3. **Trace Viewer Diagnostics:** Run tests with `--trace on-first-retry` or `--trace on` to capture DOM snapshots, action logs, and network waterfalls for failing CI runs.
