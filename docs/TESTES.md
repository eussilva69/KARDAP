# Testes

## Worker de vídeo

```bash
cd services/video-worker
npm ci
npm test            # usa o FFmpeg instalado na máquina
```

## Ponta a ponta com os emuladores do Firebase

`scripts/e2e-emulators.mjs` cria duas contas, faz o onboarding com envio de imagens, abre o painel e o cardápio
público em abas separadas e confere o comportamento real contra os emuladores de Auth, Firestore e Storage, usando
`firestore.rules` e `storage.rules` do repositório. Nada toca no projeto Firebase de produção.

O que ele verifica:

| Grupo | Cenário |
| --- | --- |
| A | Logo e capa convertidas para WebP no navegador, gravadas no Storage com `image/webp` e cache imutável, URLs no Firestore e exibidas no cardápio |
| B | Capa trocada aparece no cardápio já aberto (URL nova) e o arquivo antigo sai do Storage |
| C | Chamar garçom desligado/religado, link do Google e paleta refletidos no cardápio aberto sem recarregar; aviso só depois da confirmação |
| D | Configurações, paleta e logo preservadas após recarregar e após sair e entrar; nada da conta fica no `localStorage` |
| E | Um estabelecimento não consegue alterar, enviar ou apagar dados do outro; mudanças de um não afetam o outro |
| F | Falha ao salvar e ao enviar: mensagem correta, nenhum aviso de sucesso, chave revertida, nenhuma URL inconsistente |
| G | Foto de produto em WebP (principal e miniatura), produto aparecendo no cardápio aberto, troca de foto, produto e categoria ocultados |

### Como rodar

Requisitos: Node 20+, **Java 21+** (exigido pelos emuladores) e Microsoft Edge ou Chrome.

```bash
# 1. Emuladores (porta e regras vêm de firebase.json)
npx firebase-tools emulators:start --only auth,firestore,storage --project demo-kardap

# 2. Em outro terminal: o app apontando para os emuladores
NEXT_PUBLIC_FIREBASE_EMULATORS=1 \
NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-kardap.firebaseapp.com \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-kardap \
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-kardap.appspot.com \
NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1 \
npx next dev -p 3100

# 3. Em outro terminal: os testes (capturas de tela vão para a pasta informada)
BROWSER_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node scripts/e2e-emulators.mjs ./e2e-capturas
```

`NEXT_PUBLIC_FIREBASE_EMULATORS=1` só existe para desenvolvimento e testes: sem essa variável, o app usa o Firebase
configurado normalmente. Projetos com prefixo `demo-` nunca acessam serviços reais.

No servidor, o Admin SDK entra no modo emulador quando `FIREBASE_AUTH_EMULATOR_HOST` ou `FIRESTORE_EMULATOR_HOST`
estão definidas, e então só aceita projeto `demo-*` e não usa credencial nenhuma (nem as `FIREBASE_ADMIN_*` do
`.env.local`). Para rotas que usam o Admin SDK, inclua no passo 2:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

## Login único (SSO) com o PDV

`scripts/e2e-sso.mjs` (`npm run test:sso`) monta um PDV de teste com o kit `integrations/pdv-sso` e os arquivos de
`lib/sso` (sem nenhuma credencial do Firebase Admin no PDV; um segredo de cliente é gerado a cada execução), sobe o
KARDAP (porta 3100) e o PDV (porta 3200) apontando para os emuladores e abre o navegador com
`kardap.test` e `pdv.kardap.test` resolvidos para a própria máquina. Assim, o cookie `Domain=.kardap.test` funciona
como `.kardap.online` em produção, inclusive `Secure`. Requisitos: emuladores rodando (passo 1 acima), portas 3100 e
3200 livres. Leva cerca de 7 minutos, porque dois cenários precisam de um login com mais de 5 minutos.

```bash
BROWSER_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node scripts/e2e-sso.mjs ./sso-capturas
```

| Cenário | O que verifica |
| --- | --- |
| K1 | O kit do PDV compila com TypeScript estrito |
| K2 | O PDV montado não importa o Firebase Admin: sessão e custom token só pelo servidor central |
| S1–S2 | PDV sem sessão vai ao login central com retorno e volta autenticado com o mesmo uid |
| S3 | Atributos do cookie (HttpOnly, Secure, Lax, domínio, caminho, 5 dias) |
| S4 | Client SDK do PDV com o custom token (emitido pelo servidor central): leitura restrita à equipe no Firestore, envio e exclusão no Storage |
| S5 | Nenhum token em armazenamento do navegador, em cookie legível ou em URL |
| S6–S9 | Equipe com "pdv" entra; recarregar, nova aba e painel na mesma sessão |
| S10–S12 | Logout no PDV derruba o painel e outras abas; cookie copiado não volta a valer; logout no painel derruba o PDV |
| S13 | Cookie forjado recusado; cada login gera cookie novo e encerra o anterior |
| S14–S16 | Sem permissão "pdv", sem restaurante e restaurante suspenso são barrados |
| S17–S18 | Sem "Manter conectado" o cookie é de sessão do navegador; cookie expirado derruba abas abertas e o painel reaberto |
| S19–S20 | CSRF, origem e CORS (inclusive uma página de outro site tentando encerrar a sessão) |
| S21 | Redirecionamento aberto recusado no login e no logout; logout vindo de outro site pede confirmação |
| S22 | "Sair de todos os aparelhos" derruba a sessão de outro navegador |
| S23–S24 | Login com mais de 5 minutos não vira sessão nova; quem estava logado antes do SSO confirma a senha |
| S25 | Limite de pedidos na criação de sessão (429 a partir do 61º em 10 minutos, por IP) |
| S26 | Login normal (sem `returnTo`) abre o painel e cria a sessão central |
| S27 | Já autenticado: `/login?returnTo=` responde 307 para o destino no servidor, sem renderizar o login |
| S28 | Cookie adulterado é recusado e removido no KARDAP, no PDV e na introspecção |
| S29 | Sessão vencida no servidor (registro com validade no passado) é recusada |
| S30 | Código de uso único: sem segredo, segredo errado, outro cliente, código forjado, reuso, origem errada, conta sem permissão e sessão encerrada são recusados; a troca válida devolve custom token do uid certo |
| S31 | Código com mais de 60 s é recusado |
| S32 | Introspecção só com o segredo do cliente; sessão inválida responde `active: false` |
