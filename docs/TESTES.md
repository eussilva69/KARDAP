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
como `.kardapp.online` em produção, inclusive `Secure`. Requisitos: emuladores rodando (passo 1 acima), portas 3100 e
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
| S33 | Origens de produção: `kardapp.online`, `www.kardapp.online` e `pdv.kardapp.online` aceitas no CORS e como destino; domínio antigo e imitações recusados |

## Reels do cardápio

`scripts/e2e-reels.mjs` (`npm run test:reels`) limpa os emuladores, cria um restaurante de teste com três pratos em
vídeo (os MP4 de `public/`) e um sem vídeo, sobe o app na porta 3100 (ou usa o que já estiver no ar nessa porta, com as
mesmas variáveis) e testa num celular emulado (390×844, toque de verdade pelo DevTools). Requisitos: emuladores rodando
(passo 1 acima). Leva cerca de 3 minutos. Detalhes da funcionalidade em [REELS.md](REELS.md).

```bash
BROWSER_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node scripts/e2e-reels.mjs ./reels-capturas
```

| Cenário | O que verifica |
| --- | --- |
| N1–N9, P1–P2 | Regras com tokens reais: contador sem curtida, curtida sem contador, curtida em nome de outro, +5, curtir duas vezes, mudar preço, ler curtida alheia, anônimo gravando conta, salvos alheios ou fora do formato são recusados; curtir e descurtir válidos passam |
| S1–S2 | Identidade anônima não cria restaurante nem abre sessão do SSO |
| U1–U2 | Entrada dos Reels no cardápio; o feed abre com o primeiro vídeo tocando sem som e só os vizinhos como vídeo |
| U3 | Deslizar: o próximo toca, o anterior pausa e volta ao início, nunca dois tocando |
| U4–U5 | Toque pausa/continua; segurar pausa e esconde os botões |
| U6–U8 | Dois toques curtem (coração, botão, contador e curtida no Firestore com identidade anônima); descurtir; toques rápidos sem contagem dupla |
| U9 | Contador em tempo real num segundo celular |
| U10–U11 | Enviar: link do prato sem a mesa; opções próprias quando não há folha do sistema |
| U12–U15 | Salvar no celular; criar conta pelo aviso (mesmo uid, curtidas mantidas, salvos na conta); lista de salvos; remover do celular e da conta |
| U16–U19 | Link `?reel=` abre no prato e mantém a mesa; "voltar" fecha o feed; feed de todos os pratos; som pelo alto-falante; cartão final |
| U20 | Nenhum erro de JavaScript |
| G1 | Visitante anônimo que abre `/dashboard` vê o login, sem configuração inicial nem restaurante criado |

## Planos, assinaturas e limites

`npm run test:billing` testa as regras puras de `lib/billing/plans.ts` direto no Node 24 (sem emuladores):

- preços e limites;
- situações (teste, carência, cancelada, expirada, suspensa);
- Enterprise personalizado;
- planos anteriores;
- avisos de 70/90/100%;
- virada do mês no fuso de São Paulo;
- origens dos pedidos;
- papéis.

`scripts/e2e-plans.mjs` (`npm run test:plans`):

1. limpa os emuladores e cria estabelecimentos em cada plano (Start, Pro, Business, Enterprise com e sem limite
   contratado, teste, Essencial antigo), um caixa com a permissão `pdv`, um intruso e um administrador;
2. sobe o app na porta 3100 com uma oferta de teste por plano, o segredo do webhook e o segredo do PDV (ou usa o que já
   estiver no ar com as mesmas variáveis);
3. testa as APIs, as regras e as telas.

Requisitos: emuladores rodando. Leva cerca de 4 minutos. Detalhes em [PLANOS.md](PLANOS.md).

| Cenário | O que verifica |
| --- | --- |
| M1–M4 | Start cria 8 mesas e a 9ª é recusada com a mensagem do plano; 5 criações simultâneas com 6 mesas param em 8; gravar mesa direto no Firestore é recusado; Business ilimitado |
| P1–P2 | Start não confirma pedido próprio; Pro confirma o 149º e o 150º e recusa o 151º (`402 quota_exceeded`), sem gravar o pedido |
| P3–P5 | iFood e 99Food entram com a franquia esgotada e não consomem; reenvio cai no mesmo pedido; pedido repetido não consome; origem `ifood` na confirmação e marketplace sem segredo são recusados |
| P6–P7 | 20 confirmações simultâneas com 10 de franquia restante param exatamente em 150, com 10 eventos de uso; 5 requisições simultâneas com a mesma chave consomem uma vez |
| P8–P9 | Business: 500º sim, 501º não; Enterprise respeita o limite do contrato (1000) e o ilimitado |
| P10 | Caixa confirma pedido, mas não cria mesa nem mexe na assinatura; quem não é da equipe é barrado |
| P11 | Consumo do mês anterior não conta no atual |
| A1–A2 | Pelo servidor central do SSO: Start não acessa o PDV (motivo "plano"); Pro, teste e caixa acessam; Essencial antigo mantém 30 mesas e a carência |
| C1–C6 | Checkout: upgrade sim; downgrade direto, Enterprise e o mesmo plano não; caixa não contrata. Webhook: assinatura inválida recusada; upgrade Pro → Business preserva o consumo (140/500); evento repetido sem duplicar eventos nem pagamentos; cancelamento da assinatura antiga não encerra a nova; pagar a oferta do Start com o checkout do Business não ativa o Business |
| D1–D2 | Downgrade agendado mantém o Business até o fim do período; depois, mesas e pedidos preservados e só novas criações acima do limite bloqueadas |
| AD1–AD3 | Administração só para administradores, com motivo obrigatório e `adminLog` com antes e depois; reconciliação aponta e corrige; proposta Enterprise registrada e robô ignorado |
| R1–R2 | Regras: dono não altera plano, contador nem origem, e não confirma rascunho direto; um estabelecimento não lê o consumo nem os pedidos de outro |
| U1–U4 | Preços (4 planos, Business "Mais popular", Enterprise "Sob consulta", contato com vendas, celular sem rolagem lateral); Start com "Acessar PDV" travado e "Desbloqueie o PDV do KARDAP"; "Mesas utilizadas: 8 de 8"; Meu plano em 150/150 com aviso de 100%, renovação da franquia, PDV liberado e botões por plano |

## Cadastro, escolha de plano e teste grátis de 30 dias

`scripts/e2e-onboarding.mjs` (`npm run test:onboarding`) cobre o cadastro ponta a ponta: criar conta, escolher o plano
na primeira etapa do onboarding, preencher o restante e concluir, com o teste de 30 dias ativado no plano escolhido.
Também cobre resiliência (rede instável, clique duplo), controle de acesso pelo plano durante o teste, expiração e
tentativas de obter um segundo teste. Requisitos: emuladores rodando. Leva cerca de 3 minutos. Detalhes do fluxo em
[PLANOS.md](PLANOS.md), seção "Cadastro e teste grátis".

```bash
BROWSER_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node scripts/e2e-onboarding.mjs ./onboarding-capturas
```

| Cenário | O que verifica |
| --- | --- |
| U1 | A primeira etapa mostra os 3 planos reais (Start, Pro, Business), com preço do catálogo, o Business com "Mais popular" e o Pro pré-selecionado |
| U2 | Escolher o Business, preencher as demais etapas e concluir: restaurante criado, `subscription` com `planId: "business"`, `status: "trialing"` e prazo de ~30 dias, mesas criadas, evento `trial_activated` registrado |
| U3 | Abandonar no meio (depois de escolher o plano e preencher o nome) e voltar: retoma na etapa salva com os dados preenchidos, sem criar um segundo restaurante |
| U4 | Nome do estabelecimento vazio e quantidade de mesas fora de 0–200 são barrados na tela, com mensagem clara, sem avançar |
| U5 | Rede fica offline por alguns segundos bem no momento de concluir: a nova tentativa automática supera a instabilidade e o cadastro é concluído mesmo assim |
| U6 | Clicar 5 vezes seguidas em "Concluir" cria só as mesas pedidas (uma vez) e ativa o teste uma única vez |
| U7 | Quem escolheu o Start não acessa o PDV durante o teste — travado na tela (cadeado) e no servidor (`pdvAccess: false`, pedido próprio recusado) |
| U8 | Durante o teste, a barra lateral e Meu Plano mostram o nome real do plano escolhido (não "Pro" fixo) e os dias restantes |
| U9 | Teste expirado: `entitlements.valid === false`, `reason: "trial_ended"`, PDV bloqueado, acesso cai para o básico — mas mesas e dados continuam intactos |
| U10 | Depois de expirado, o checkout para contratar o plano continua disponível |
| U11 | Login de quem já tem conta e já concluiu o onboarding vai direto ao painel, sem passar pela escolha de plano de novo |
| U12 | A mesma conta não consegue outro teste: `POST /api/restaurants` de novo devolve o mesmo estabelecimento; ativar o teste de novo no mesmo estabelecimento é idempotente (não estende nem troca o plano); um estabelecimento novo criado manualmente para o mesmo uid é recusado (`409 trial_already_used`); outra pessoa, em outro estabelecimento, consegue o próprio teste normalmente |
| U13 | Nenhum erro de JavaScript acumulado nas telas visitadas |
