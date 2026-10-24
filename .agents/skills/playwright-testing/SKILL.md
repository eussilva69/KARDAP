---
name: playwright-testing
description: "Suíte definitiva de testes End-to-End (E2E) com Playwright + Eliminação de Flakiness. Cobre Page Object Model (POM), locators acessíveis (getByRole, getByTestId), assertions web-first com auto-waiting, reutilização de autenticação (storageState), interceptação de rede e diagnósticos com Trace Viewer."
when_to_use: "Ao criar, refatorar ou debugar testes E2E com Playwright, automatizar jornadas completas de usuário, configurar CI ou resolver testes intermitentes (flaky tests)."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 2.1.0
priority: HIGH
---

# Suíte Completa de Testes E2E com Playwright

> **Diretiva de Confiabilidade:** Testes E2E devem testar o comportamento visível ao usuário, usar auto-waiting automático e NUNCA depender de sleeps fixos como `page.waitForTimeout(3000)`.

---

## 1. Hierarquia de Locators Resilientes

Priorize sempre os locators que refletem a experiência real do usuário e a acessibilidade:

```typescript
// 1. Recomendado: Papel semântico acessível (botões, links, caixas de diálogo)
page.getByRole('button', { name: 'Finalizar Pedido' });
page.getByRole('heading', { name: 'Painel de Controle', level: 1 });

// 2. Rótulos de formulário (acoplado à etiqueta visível)
page.getByLabel('E-mail');
page.getByPlaceholder('Buscar produtos...');

// 3. Texto visível
page.getByText('Pedido realizado com sucesso!');

// 4. Test ID (para componentes dinâmicos complexos)
page.getByTestId('cart-item-row');

// ❌ EVITAR: Seletores CSS frágeis acoplados à árvore do DOM
// page.locator('div.container > div:nth-child(2) > button.btn-primary');
```

---

## 2. Assertions Web-First (Auto-Waiting)

Assertions web-first aguardam automaticamente até que a condição seja verdadeira ou o timeout expire:

```typescript
// ✅ CORRETO: Aguarda o elemento renderizar e atingir o estado esperado
await expect(page.getByRole('alert')).toBeVisible();
await expect(page.getByRole('button', { name: 'Salvar' })).toBeEnabled();
await expect(page.getByTestId('cart-count')).toHaveText('3');
await expect(page).toHaveURL(/.*checkout/);

// ❌ ERRADO: Não possui auto-waiting; falha em transições assíncronas
expect(await page.getByRole('alert').isVisible()).toBe(true);
```

---

## 3. Arquitetura Page Object Model (POM)

Mantenha testes desacoplados da marcação HTML encapsulando ações em classes de página:

```typescript
// tests/pages/CheckoutPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly payButton: Locator;
  readonly successBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.payButton = page.getByRole('button', { name: 'Pagar com PIX' });
    this.successBanner = page.getByTestId('payment-confirmed-banner');
  }

  async goto() {
    await this.page.goto('/checkout');
  }

  async confirmPayment() {
    await this.payButton.click();
    await expect(this.successBanner).toBeVisible();
  }
}
```

---

## 4. Eliminação de Flaky Tests (Testes Intermitentes)

1. **Substitua Sleeps por Esperas de Estado:**
   - Em vez de `waitForTimeout(2000)`, use `page.waitForLoadState('networkidle')` ou `expect(locator).toBeHidden()`.
2. **Interceptação de Rede (Mocking):**
   ```typescript
   await page.route('**/api/payments/**', async route => {
     await route.fulfill({ status: 200, json: { success: true, txId: '123' } });
   });
   ```
3. **Persistência de Sessão (`storageState`):**
   Faça login uma única vez no `globalSetup` e salve os cookies em `playwright/.auth/user.json`. Carregue o estado nos testes via `use: { storageState: 'playwright/.auth/user.json' }`.
4. **Diagnóstico com Trace Viewer:**
   Execute `npx playwright test --trace on` para inspecionar snapshots do DOM, ações de clique e requisições de rede de qualquer teste com falha.
