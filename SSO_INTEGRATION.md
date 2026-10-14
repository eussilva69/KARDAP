# Contrato de integração do SSO KARDAP

Para quem integra outro aplicativo do ecossistema (o primeiro é o PDV, `https://pdv.kardapp.online`) ao login
central do KARDAP (`https://kardapp.online`, também em `https://www.kardapp.online`). O kit pronto para o PDV está
em `integrations/pdv-sso/` e segue este contrato.

## 1. Arquitetura

- **Servidor central:** `kardapp.online` (e `www.kardapp.online`, que usa o mesmo cookie). Faz login, cadastro,
  recuperação de senha, emissão e revogação da sessão, logout global, verificação de sessão para os aplicativos e
  emissão de credencial do Firebase para eles.
- **Mesmo Firebase Authentication** em todos os aplicativos: mesmos usuários, mesmos UIDs, nenhuma conta duplicada.
- **Sessão central:** um Firebase Session Cookie (`kardap_sso_session`), HttpOnly, no domínio `.kardapp.online`.
  Cada sessão tem um registro no Firestore (`ssoSessoes/{sha256 do cookie}`, só o servidor acessa) para que o logout
  encerre exatamente aquela sessão.
- **Aplicativos:** recebem o cookie (mesmo domínio-pai), mas **não o validam sozinhos e não precisam de credencial do
  Firebase Admin**. O servidor do aplicativo pergunta ao servidor central (`/api/sso/introspect`), autenticado com o
  segredo do cliente.
- **Firebase Client SDK no aplicativo:** o navegador do aplicativo pede ao servidor central um **código de uso
  único** (60 s, ligado ao aplicativo, à conta e à sessão). O servidor do aplicativo troca o código por um **Firebase
  Custom Token** do mesmo uid (`/api/sso/token`, com o segredo do cliente). O navegador faz `signInWithCustomToken`
  com persistência em memória. As regras do Firestore e do Storage valem com o uid original.

```
Navegador (pdv)                     Servidor do PDV                       kardapp.online
──────────────────────────────────────────────────────────────────────────────────────────────────
GET /caixa  ─────────────────────►  middleware: há cookie?
                                     não → 302 kardapp.online/login?returnTo=https://pdv.kardapp.online/caixa
                                     sim → layout: POST /api/sso/introspect ─────►  sessão válida? permissão?
                                                                             ◄─────  { active, uid, access }
          ◄───────────────────────  página (ou login / sem-permissao)
POST kardapp.online/api/sso/code (CORS + cookie + CSRF) ────────────────────────────►  { code } (60 s, uso único)
POST /api/auth/firebase-token { code } ─►  POST /api/sso/token (Basic) ────────────►  { firebase_custom_token }
          ◄───────────────────────  { token }
signInWithCustomToken (memória) → Firestore / Storage com o mesmo uid
```

Por que assim: o cookie da sessão chega a qualquer subdomínio de `kardapp.online`. Com este desenho, um subdomínio
que não seja de confiança, mesmo recebendo o cookie, não consegue credencial do Firebase (precisa do segredo do
cliente) nem criar sessões (precisa de um login de verdade). No máximo lê os dados mínimos de
`GET /api/auth/session` ou encerra a sessão. Veja a seção 11.

## 2. Cookies

| Cookie | Conteúdo | Atributos |
| --- | --- | --- |
| `kardap_sso_session` (configurável: `SSO_COOKIE_NAME`) | Firebase Session Cookie seguido de um identificador aleatório da sessão (`<cookie>~<id>`). Trate o valor como opaco | `Domain=.kardapp.online; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=432000` (5 dias). Sem "Manter conectado": cookie de sessão do navegador |
| `kardap_sso_state` | Valor aleatório, muda a cada login, sem nenhum segredo | Mesmo domínio e validade, **legível** pelo JavaScript. Só serve para as abas perceberem login e logout |
| `kardap_csrf` | Token anti-CSRF | `Domain=.kardapp.online; Path=/; Secure; SameSite=Lax; Max-Age=43200`, legível pelo JavaScript |

Nenhum token vai em `localStorage`, `sessionStorage`, IndexedDB ou URL.

## 3. Sessão

- Duração: **5 dias** (`SSO_SESSION_MAX_AGE`, em segundos; de 300 a 1.209.600).
- Só nasce de um login **recente** (até 5 minutos). Um login antigo nunca vira sessão nova.
- A cada login, o cookie é novo e o anterior daquele navegador é encerrado (proteção contra session fixation).
- Validade conferida a cada uso: assinatura e expiração do Firebase, revogação (`checkRevoked`) e registro não
  encerrado. O servidor central guarda a validação por até 10 segundos por instância e a descarta no logout; o PDV
  não guarda nada.

## 4. Endpoints

Todas as respostas têm `Cache-Control: no-store`. Erros sempre no formato `{ "error": "<código>", "message": "<texto>" }`.

### Chamados pelo navegador (CORS com `credentials: "include"` para as origens da lista)

#### `GET /api/auth/csrf`
Grava o cookie `kardap_csrf`. Resposta `200 { "ok": true }`.

#### `POST /api/auth/session` — criar a sessão (usado pela tela de login do KARDAP)
Cabeçalhos: `Origin` da lista, `Content-Type: application/json`, `x-csrf-token: <kardap_csrf>`.
```json
{ "idToken": "<Firebase ID token>", "remember": true }
```
`201 { "authenticated": true, "uid": "…", "apps": { "pdv": true } }` e `Set-Cookie` da sessão e do estado.

#### `GET /api/auth/session` — verificar a sessão
`200 { "authenticated": true, "uid": "…", "email": "…", "name": "…", "expiresAt": 1791000000, "apps": { "pdv": true } }`
ou `401 { "authenticated": false }` (e, se havia cookie, ele é removido).

#### `POST /api/auth/logout` — encerrar a sessão
Cabeçalhos: `Origin` da lista, `x-csrf-token`. Corpo opcional:
```json
{ "scope": "current" }
```
`"current"` (padrão) encerra só esta sessão; `"all"` encerra as sessões da conta em todos os aparelhos (revoga os
refresh tokens no Firebase). `200 { "ok": true, "scope": "current", "revoked": true }` e os cookies removidos com o
mesmo `Domain` e `Path`.

#### `POST /api/sso/code` — código de uso único para o aplicativo
Cabeçalhos: `Origin` = origem cadastrada do aplicativo (é ela que identifica o aplicativo), `x-csrf-token`.
`200 { "code": "…", "expires_in": 60, "client_id": "pdv" }`.

### Chamados só pelo servidor do aplicativo (sem CORS)

Autenticação: `Authorization: Basic base64("<client_id>:<client_secret>")`.

#### `POST /api/sso/token` — trocar o código por um Firebase Custom Token
```json
{ "grant_type": "authorization_code", "code": "<code>" }
```
```json
{
  "token_type": "firebase_custom_token",
  "firebase_custom_token": "…",
  "expires_in": 3600,
  "uid": "…",
  "user": { "uid": "…", "email": "…", "name": "…" },
  "restaurants": [{ "id": "…", "name": "…", "role": "owner" }]
}
```
O código só vale uma vez, por 60 s, para o aplicativo que o pediu e enquanto a sessão que o pediu estiver ativa. O
custom token traz a claim `kardapApp: "<client_id>"` e vale 1 hora, só para `signInWithCustomToken`.

#### `POST /api/sso/introspect` — validar a sessão que chegou no cookie
```json
{ "session": "<valor do cookie kardap_sso_session>" }
```
`200 { "active": false }` ou
```json
{ "active": true, "uid": "…", "email": "…", "name": "…", "expiresAt": 1791000000,
  "access": { "allowed": true, "restaurants": [{ "id": "…", "name": "…", "role": "member", "planId": "pro" }],
              "blocked": [{ "id": "…", "name": "…", "role": "owner", "planId": "start", "reason": "plan" }] } }
```
`allowed` exige o papel (dono, `*` ou `pdv`) **e** o plano: assinatura válida que inclua o PDV (Pro, Business,
Enterprise ou o teste do Pro). `blocked` lista os restaurantes em que a pessoa tem o papel, mas o plano não libera:
`reason: "plan"` (Start: convite ao upgrade) ou `"subscription"` (vencida/pendente: regularizar). O kit manda para
`/sem-permissao?motivo=plano` ou `?motivo=assinatura`. Planos, franquia de pedidos e as APIs de pedidos:
[docs/PLANOS.md](docs/PLANOS.md).

### Páginas

| Página | Uso |
| --- | --- |
| `GET https://kardapp.online/login?returnTo=<url>` | Login central. Com sessão válida, o servidor responde `307` direto para o destino (sem mostrar a tela). `redirect=` também é aceito |
| `GET https://kardapp.online/logout?returnTo=<url>[&all=1]` | Logout global por navegação: encerra a sessão, sai do Firebase em `kardapp.online` e vai ao destino. Vindo de um dos aplicativos, sai na hora; de outro site, pede confirmação |

## 5. Fluxo de login

1. A pessoa informa e-mail e senha (ou entra com o Google) em `kardapp.online/login`.
2. O Firebase Authentication valida as credenciais.
3. A tela obtém o ID token e o envia por HTTPS para `POST /api/auth/session`, com CSRF.
4. O servidor valida o ID token com o Admin SDK (`checkRevoked`) e confere se o login tem até 5 minutos.
5. O servidor cria o Firebase Session Cookie e o registro da sessão, e encerra a sessão anterior do navegador.
6. A resposta grava `kardap_sso_session` e `kardap_sso_state` em `.kardapp.online`.
7. A tela segue para o destino autorizado (`returnTo`) ou para o painel.

## 6. Fluxo de redirecionamento

1. O aplicativo, sem sessão, manda para `https://kardapp.online/login?returnTo=<endereço completo do aplicativo>`.
2. O KARDAP valida o destino: só caminhos do próprio site (`/x`, nunca `//x` ou `/\x`) ou URLs de
   `https://kardapp.online`, `https://www.kardapp.online` e `https://pdv.kardapp.online` (lista `SSO_ALLOWED_ORIGINS`),
   sem usuário e senha na URL.
   Qualquer outro destino (outros sites, `javascript:`, `data:`) é ignorado e vale o painel.
3. Sessão válida → `307` para o destino, no servidor. Sem sessão → tela de login; depois do login, volta ao destino.
4. Conta logada no KARDAP, mas sem sessão central: se o navegador já teve uma (logout ou expiração), pede a senha; se
   nunca teve (login anterior ao SSO) e o login tem até 5 minutos, cria a sessão na hora; senão, pede a senha.
5. Sem laços: sessão recusada pelo servidor central leva ao login; servidor central fora do ar leva a uma página de
   erro, nunca a um novo redirecionamento.

## 7. Fluxo de logout

1. **No aplicativo:** `POST https://kardapp.online/api/auth/logout` (CORS, `credentials: "include"`, CSRF), depois
   `signOut` do Firebase na aba e navegação para
   `https://kardapp.online/logout?returnTo=https%3A%2F%2Fkardapp.online%2Flogin%3FreturnTo%3D<app>` (encerra também o
   login do Firebase guardado em `kardapp.online`).
2. **No KARDAP:** "Sair" no painel ou na administração chama `POST /api/auth/logout` e faz `signOut`.
3. **Abas abertas:** os aplicativos observam `kardap_sso_state` (a cada 1,5 s e ao focar a aba). Quando ele some, a
   aba sai na hora. O PDV também confere a sessão no servidor a cada 2 minutos.
4. **Política de aparelhos:** o padrão encerra só a sessão atual. `scope: "all"` (botão "Sair de todos os aparelhos",
   com aviso) revoga todas. Nos outros aparelhos, o PDV sai no próximo carregamento ou em até 2 minutos; o painel, no
   próximo carregamento ou quando o Firebase renovar o token (até 1 hora).
5. Sessão encerrada nunca volta a valer: o registro fica marcado e uma cópia do cookie é recusada em qualquer lugar.

## 8. Firebase Client SDK no aplicativo

Três credenciais diferentes, cada uma no seu lugar:

| Credencial | Onde | Para quê |
| --- | --- | --- |
| Firebase ID token | Navegador do KARDAP, só no corpo do `POST /api/auth/session` | Provar um login recente para criar a sessão |
| Firebase Session Cookie | Cookie HttpOnly `kardap_sso_session` | Sessão central entre aplicativos (não autentica o Client SDK) |
| Firebase Custom Token | Corpo da resposta de `/api/auth/firebase-token` do aplicativo | `signInWithCustomToken` no Client SDK do aplicativo |

Passos no aplicativo (o kit já faz):
1. Criar o Auth com `inMemoryPersistence` (nenhum token salvo no navegador; cada aba se conecta sozinha).
2. `POST https://kardapp.online/api/sso/code` → `{ code }`.
3. `POST /api/auth/firebase-token` (rota do próprio aplicativo, mesma origem, CSRF) com `{ code }`. O servidor do
   aplicativo confere a sessão do cookie, troca o código em `/api/sso/token` e confere se o uid é o mesmo.
4. `signInWithCustomToken(auth, token)`. Pronto: Firestore e Storage com o uid original.

O servidor central nunca emite custom token para um uid escolhido pelo pedido: só para o uid da sessão que gerou o
código. Custom tokens nunca aparecem em URL.

## 9. Variáveis de ambiente

**KARDAP (servidor central)**

| Variável | Padrão | Uso |
| --- | --- | --- |
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | já existentes | Admin SDK (somente servidor) |
| `SSO_COOKIE_DOMAIN` | `.kardapp.online` em produção | Domínio do cookie |
| `SSO_COOKIE_NAME` | `kardap_sso_session` | Nome do cookie da sessão |
| `SSO_SESSION_MAX_AGE` | `432000` | Duração em segundos |
| `SSO_ALLOWED_ORIGINS` | `https://kardapp.online`, `https://www.kardapp.online`, `https://pdv.kardapp.online` (sempre aceitas) | Origens extras (homologação), separadas por vírgula |
| `SSO_CLIENT_SECRET_PDV` | — (**obrigatória** para o PDV) | Segredo do cliente `pdv`, 32+ caracteres (`openssl rand -base64 48`) |
| `SSO_SIGNING_SECRET` | derivada da chave do Admin | Opcional: chave dos códigos de uso único, 32+ caracteres |

**Aplicativo (PDV)**

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | Os mesmos valores do KARDAP |
| `SSO_CLIENT_ID` | `pdv` |
| `SSO_CLIENT_SECRET` | O mesmo valor de `SSO_CLIENT_SECRET_PDV` (somente servidor) |
| `NEXT_PUBLIC_KARDAP_ORIGIN`, `NEXT_PUBLIC_PDV_ORIGIN`, `SSO_COOKIE_NAME`, `SSO_COOKIE_DOMAIN`, `SSO_ALLOWED_ORIGINS` | Opcionais (padrões de produção) |
| `SSO_CENTRAL_URL` | Opcional: endereço do servidor central para chamadas de servidor (padrão: `NEXT_PUBLIC_KARDAP_ORIGIN`) |

Nenhuma credencial privada usa o prefixo `NEXT_PUBLIC_`.

## 10. Tratamento de erros

| Código | HTTP | Quando | O que o aplicativo faz |
| --- | --- | --- | --- |
| `no_session`, `invalid_session` | 401 | Sem sessão, vencida, adulterada ou encerrada | Mandar para o login central com `returnTo` |
| `recent_login_required` | 401 | Login com mais de 5 minutos | A tela de login pede a senha |
| `invalid_token` | 400/401 | ID token inválido ou revogado | Entrar de novo |
| `bad_origin` | 403 | Origin ausente ou fora da lista | — (pedido de outro site) |
| `bad_csrf` | 403 | Cabeçalho `x-csrf-token` diferente do cookie | Buscar `/api/auth/csrf` e repetir |
| `forbidden` | 403 | Conta sem permissão para o aplicativo, ou restaurante suspenso | Mostrar "sem permissão" |
| `invalid_client` | 401 | Segredo do cliente errado | Erro de configuração |
| `invalid_request` | 400 | Corpo inválido | Erro de programação |
| `invalid_grant` | 400 | Código inválido, vencido, já usado ou de sessão encerrada | Pedir um código novo |
| `rate_limited` | 429 | Muitos pedidos | Esperar e repetir |
| `sso_not_configured` | 503 | Falta `SSO_CLIENT_SECRET_*` | Erro de configuração |
| `server_error` | 500 | Falha inesperada (registrada sem dados sensíveis) | Tentar de novo |

## 11. Regras de segurança

- HTTPS obrigatório. Cookie da sessão `HttpOnly` + `Secure` + `SameSite=Lax`.
- CSRF em tudo que muda estado: `Origin` da lista **e** `x-csrf-token` igual ao cookie `kardap_csrf`.
- CORS só para as origens da lista, com credenciais. `/api/sso/token` e `/api/sso/introspect` não têm CORS.
- Limites por IP: criação de sessão 60 a cada 10 min; código 120/min; logout 30/min; leitura 300/min; falha de
  autenticação de cliente 20 a cada 10 min. Por aplicativo: troca 1.200/min, introspecção 3.000/min.
- Login recente obrigatório; revogação conferida (`checkRevoked`); sessão nova a cada login.
- Allowlist de destinos (seção 6). `/logout` vindo de outro site pede confirmação.
- Autorização por usuário e estabelecimento: dono, ou membro ativo com `permissions` contendo `"pdv"` ou `"*"`, de
  restaurante não suspenso. Conferida a cada carregamento, a cada código e a cada 2 minutos com o aplicativo aberto.
- Logs sem tokens, cookies ou segredos (só código e mensagem do erro).
- **Subdomínios:** todo subdomínio de `kardapp.online` recebe o cookie. Com este desenho, um subdomínio não confiável
  não consegue credencial do Firebase nem sessão nova, mas poderia ler os dados mínimos (uid, e-mail, nome) ou
  derrubar a sessão. Antes de apontar um subdomínio para um serviço de terceiros (blog, central de ajuda, e-mail
  marketing), avalie esse risco; se necessário, use outro domínio para esse serviço.
- **Regra aberta do Firestore em produção:** enquanto `allow read, write: if true` estiver publicada, as coleções
  `ssoSessoes` e `ssoCodigosUsados` também ficam abertas. Isso não permite criar sessões, emitir tokens nem reaproveitar
  códigos (cookies e códigos são assinados), mas permite listar registros (uid e validade) e encerrar sessões alheias.
  O bloco correspondente de `firestore.rules` fecha isso quando as regras restritivas forem publicadas.

## 12. Instruções de integração (PDV)

1. Copie do KARDAP, sem alterar: `lib/sso/config.ts`, `lib/sso/http.ts`, `lib/sso/client.ts` e
   `app/api/auth/csrf/route.ts`. Mudou num repositório, copie para o outro.
2. Copie de `integrations/pdv-sso/`: `middleware.ts`, `lib/sso/pdv-server.ts`, `lib/sso/pdv-client.ts`,
   `lib/sso/pdv-firebase.ts`, `components/pdv-auth-provider.tsx`, `app/api/auth/firebase-token/route.ts`,
   `app/api/auth/status/route.ts`, `app/sem-permissao/page.tsx` e `app/(pdv)/layout.tsx`.
3. Mova as páginas protegidas para `app/(pdv)/` (o grupo não muda as URLs).
4. Remova o login próprio do PDV (ou faça `/login` redirecionar para o login central) e qualquer
   `setPersistence(browserLocalPersistence)`.
5. Use `usePdvAuth()` nas páginas: `user` (mesmo uid), `restaurants`, `logout()` e `logout(true)` (todos os aparelhos).
6. Configure as variáveis (seção 9) e o mesmo `SSO_CLIENT_SECRET` nos dois lados.
7. Requisitos: Next.js 14 ou 15 (App Router), `firebase` 10+, alias `@/*` na raiz, HTTPS.
8. Teste: `npm run test:sso` no KARDAP monta um PDV com estes arquivos e valida os fluxos (`docs/TESTES.md`).

**Configuração pendente em produção**

- [ ] `SSO_CLIENT_SECRET_PDV` no KARDAP e `SSO_CLIENT_SECRET` no PDV (mesmo valor).
- [ ] Firebase → Authentication → Authorized domains: `kardapp.online`, `www.kardapp.online` e `pdv.kardapp.online`.
- [ ] Se a chave de API do navegador tem restrição de referenciador, incluir `https://www.kardapp.online/*` e
  `https://pdv.kardapp.online/*`.
- [ ] Netlify: `kardapp.online` e `www.kardapp.online` no mesmo site (um deles como domínio principal); Node 22
  (`.nvmrc`), exigido pelo `firebase-admin`.
- [ ] Opcional: política de TTL do Firestore em `ssoSessoes.expiresAt` e `ssoCodigosUsados.expiresAt`.
- [ ] Publicar as regras restritivas do Firestore (fecha `ssoSessoes` e `ssoCodigosUsados`), quando decidido.
