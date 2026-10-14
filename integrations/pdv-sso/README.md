# Login único (SSO) no PDV — kit de integração

Para quem mantém o repositório do PDV (`pdv.kardapp.online`). É a parte do PDV do contrato descrito em
[`SSO_INTEGRATION.md`](../../SSO_INTEGRATION.md), testada de ponta a ponta com um PDV montado a partir destes mesmos
arquivos (`npm run test:sso` no KARDAP).

O PDV **não precisa de credencial do Firebase Admin** para o login: valida a sessão e obtém o custom token pelo
servidor central (`kardapp.online`), autenticado com o segredo do cliente.

## Arquivos

Copiar do repositório do KARDAP, **sem alterar** (mudou num, copie para o outro):

| Arquivo | Função |
| --- | --- |
| `lib/sso/config.ts` | Cookies, origens, `returnTo`, validação de destino |
| `lib/sso/http.ts` | Erros, cookies, CSRF, limite de tentativas |
| `lib/sso/client.ts` | Vigia do cookie de estado (`watchSsoState`) |
| `app/api/auth/csrf/route.ts` | Token anti-CSRF |

Copiar deste kit:

| Arquivo | Função |
| --- | --- |
| `middleware.ts` | Sem cookie, manda ao login central com `returnTo`. Se o PDV já tem middleware, junte as duas funções |
| `lib/sso/pdv-server.ts` | `requirePdvSession()`, `introspect()`, `exchangeCode()` (servidor) |
| `lib/sso/pdv-client.ts` | Código de uso único, ida ao login central, logout global (navegador) |
| `lib/sso/pdv-firebase.ts` | App Firebase do navegador com Auth só em memória |
| `components/pdv-auth-provider.tsx` | Conecta o Firebase do navegador; `usePdvAuth()` |
| `app/api/auth/firebase-token/route.ts` | Troca o código por custom token (POST, mesma origem, CSRF) |
| `app/api/auth/status/route.ts` | Conferência periódica da sessão |
| `app/sem-permissao/page.tsx` | Conta sem acesso ao PDV |
| `app/(pdv)/layout.tsx` | Layout das páginas protegidas |

`test-app/` contém só as páginas usadas pelo teste automatizado; não vai para o PDV.

## Passos

1. Copie os arquivos acima.
2. Mova as páginas protegidas para `app/(pdv)/` (o grupo não muda as URLs).
3. Remova o login próprio do PDV (ou faça `/login` redirecionar para
   `https://kardapp.online/login?returnTo=https://pdv.kardapp.online/`) e qualquer `setPersistence(browserLocalPersistence)`.
4. Se o PDV inicializa o Firebase em outro arquivo, mantenha um único app `[DEFAULT]` e use `pdvAuth()`, ou crie o Auth
   com `initializeAuth(app, { persistence: inMemoryPersistence })`.
5. Nas páginas:

   ```tsx
   "use client";
   import { getFirestore } from "firebase/firestore";
   import { usePdvAuth } from "@/components/pdv-auth-provider";
   import { pdvFirebaseApp } from "@/lib/sso/pdv-firebase";

   export default function Caixa() {
     const { user, restaurants, logout } = usePdvAuth(); // user.uid é o mesmo uid do KARDAP
     const db = getFirestore(pdvFirebaseApp()); // já autenticado quando a página aparece
     return <button onClick={() => logout()}>Sair</button>; // logout(true): todos os aparelhos
   }
   ```

6. Variáveis: `.env.example` deste kit. O `SSO_CLIENT_SECRET` é o mesmo valor de `SSO_CLIENT_SECRET_PDV` no KARDAP.
7. Requisitos: Next.js 14 ou 15 (App Router), `firebase` 10+, alias `@/*` na raiz, HTTPS.

## Planos e pedidos (docs/PLANOS.md no KARDAP)

O servidor central decide quem usa o PDV, quanto da franquia de pedidos foi usada e a origem de cada pedido.

**Acesso ao PDV.** `/api/sso/introspect` só libera com papel **e** plano: Pro, Business, Enterprise ou o teste do Pro.
Quem está no Start vê `/sem-permissao?motivo=plano` (convite ao upgrade); quem está com a assinatura vencida vê
`?motivo=assinatura`. Nada a fazer além de copiar os arquivos deste kit.

**Arquivos novos.**

| Arquivo | Origem | Função |
| --- | --- | --- |
| `lib/kardap/billing.ts` | este kit | `getEntitlements`, `confirmOrder` e `recordMarketplaceOrder` (servidor) |
| `lib/billing/plans.ts` | repositório do KARDAP, sem alterar | Opcional: as mesmas regras para montar menus e avisos no PDV |

**Pedidos próprios** (PDV, mesa, delivery, retirada, equipe):

- grave o rascunho como sempre, com `status: "rascunho"`;
- na **confirmação**, chame `confirmOrder({ restaurantId, source: "kardap_pdv", orderId })` no servidor, numa Route
  Handler ou Server Action;
- se voltar `{ error: "quota_exceeded" }`, mostre "Você utilizou X de Y pedidos neste mês. Seu limite de pedidos
  próprios foi atingido…" com "Fazer upgrade" (`https://kardapp.online/dashboard/plano#planos`) e "Ver planos";
- o restante do PDV continua: caixa, estoque, relatórios e pedidos existentes;
- reenviar o mesmo `orderId` não consome de novo.

**Pedidos de marketplace** (iFood, 99Food, outros): no webhook ou na rotina da integração, chame
`recordMarketplaceOrder({ restaurantId, provider: "ifood", externalOrderId, order })`. Eles nunca consomem nem são
bloqueados pela franquia.

**Menus e telas.** Use `getEntitlements(restaurantId)`: `entitlements.features` (`cashRegister`, `inventory`,
`financialManagement`, `deliveryManagement`, `reports`, `promotions`, `marketplaceIntegrations`…) e
`member.permissions`. Quem tem só a permissão `pdv` não recebe finanças, relatórios, configurações nem assinatura.
O servidor central confere de novo em cada operação.

**Antes de publicar as regras do Firestore do KARDAP**, o PDV precisa confirmar pedidos só por `confirmOrder`. As regras
recusam pedido confirmado, ou com `origin`/`quota`, gravado direto pelo navegador.

## Erros comuns

| Sintoma | Causa |
| --- | --- |
| Volta sempre para o login | PDV fora de HTTPS ou fora de `*.kardapp.online` (o cookie não chega) |
| Página de erro ao abrir o PDV | `SSO_CLIENT_SECRET` ausente ou diferente do KARDAP, ou servidor central inacessível (`SSO_CENTRAL_URL`) |
| "Não foi possível conectar ao PDV" | A troca do código falhou: confira o segredo e se a conta tem a permissão `pdv` |
| Firestore recusa leitura | Projeto do Firebase do navegador diferente do KARDAP, ou a pessoa não é membro do restaurante |
