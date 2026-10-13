# Login único (SSO): o KARDAP como servidor central

Para quem mantém este repositório. O contrato com os outros aplicativos (endpoints, formatos, fluxos, variáveis,
erros e segurança) está em [`SSO_INTEGRATION.md`](../SSO_INTEGRATION.md). Aqui ficam a organização do código e as
decisões internas.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `lib/sso/config.ts` | Nomes dos cookies, duração, origens permitidas, aplicativos clientes, `safeRedirect`, `returnTo`. Sem segredos; usado no servidor e no navegador. Copiado para os aplicativos |
| `lib/sso/http.ts` | Servidor, sem Admin SDK: erros, cookies, CSRF, limite de tentativas, CORS, registro de erros sem dados sensíveis. Copiado para os aplicativos |
| `lib/sso/server.ts` | Servidor do KARDAP: criar, validar e revogar sessões (Admin SDK + registro `ssoSessoes`) |
| `lib/sso/access.ts` | Servidor do KARDAP: quem pode usar cada aplicativo (dono ou membro com a permissão, restaurante não suspenso) |
| `lib/sso/oauth.ts` | Servidor do KARDAP: autenticação dos aplicativos, emissão e troca dos códigos de uso único |
| `lib/sso/continue.ts` | `/login?returnTo=` com sessão válida: redireciona no servidor, antes de renderizar |
| `lib/sso/client.ts` | Navegador: cria a sessão depois do login, encerra no logout, observa o cookie de estado |
| `app/api/auth/csrf`, `session`, `logout` | Rotas da sessão central |
| `app/api/sso/code`, `token`, `introspect` | Rotas para os aplicativos |
| `app/[...path]/page.tsx` | Chama `continueIfSignedIn` em `/login` |
| `components/auth/auth-page.tsx` | Login: cria a sessão central e respeita `returnTo` |
| `components/auth/logout-page.tsx` | `/logout?returnTo=`: logout global por navegação |
| `components/app.tsx` | Sai deste site quando a sessão central termina em outro lugar |
| `components/dashboard/dashboard.tsx`, `components/admin/admin-panel.tsx` | "Sair" encerra também a sessão central |
| `lib/firebase-admin.ts` | Modo emulador para testes (só com projeto `demo-*`) |
| `integrations/pdv-sso/` | Kit do PDV (fora do build do KARDAP) |
| `scripts/e2e-sso.mjs` | Testes de ponta a ponta |

## Decisões

- **Identificador por login no cookie** (`<Firebase Session Cookie>~<aleatório>`): o Firebase Session Cookie tem
  precisão de segundos e assinatura determinística, então dois logins da mesma conta no mesmo segundo gerariam o mesmo
  valor e dividiriam o registro (o logout de um derrubaria o outro, e um login novo reativaria um registro revogado).
- **Registro da sessão** (`ssoSessoes/{sha256 do cookie}`: uid, validade, revogação). Permite encerrar uma sessão sem
  revogar a conta inteira. Guarda só o hash; o cookie nunca vai para o banco.
- **Códigos assinados** (HMAC-SHA256 com `SSO_SIGNING_SECRET` ou chave derivada de `FIREBASE_ADMIN_PRIVATE_KEY`): o
  conteúdo (uid, aplicativo, sessão, validade) não depende do Firestore, que hoje está com a regra aberta em
  produção. O banco só guarda "já usado" (`ssoCodigosUsados/{jti}`, gravado com `create`, que falha se já existe).
- **O PDV não tem credencial do Firebase Admin:** quem valida sessões e emite custom tokens é só o servidor central.
  Um servidor de aplicativo comprometido não consegue emitir tokens para qualquer uid, só trocar códigos de sessões
  reais.
- **Vigia do cookie de estado** (`kardap_sso_state`): o painel sai quando o cookie some, sem depender da marca
  `kardap-sso-uid` (outra aba pode apagá-la antes). Ao abrir, a marca serve para sair quando a sessão acabou com o
  site fechado.
- **A tela de login nunca desfaz um logout:** se o navegador já teve sessão central e ela acabou, pede a senha, mesmo
  com o Firebase do KARDAP ainda logado.
- **Nada é gravado depois do logout:** sem sessão, o painel não envia mais nada ao Firestore. A cópia local dos
  chamados antigos deixou de ser sincronizada entre abas pelo `localStorage`; o Firestore em tempo real já faz isso, e a
  cópia vazia de uma aba nova apagava a lista.
- **Cache:** só no servidor central, por até 10 s em cada instância, para juntar as verificações de um carregamento.
  O logout apaga a entrada da sessão na hora (na instância que o recebe). O PDV não guarda resposta nenhuma: uma sessão
  encerrada ou uma permissão retirada valem no PDV já no pedido seguinte.
- **Limite de tentativas** em memória, por instância. Com várias instâncias, cada uma conta separadamente; o Firebase
  Auth tem limites próprios para senha.

## Testes

`npm run test:sso` — ver `docs/TESTES.md`.
