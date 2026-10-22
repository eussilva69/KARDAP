# Design system do Kardap

Vale para o login (`/login`, `/criar-conta`), o painel (`/dashboard/*`) e o cardápio público (`/r/:slug`).
Onboarding e páginas legais ainda usam os estilos antigos de `app/legacy.css`.

## De onde vem a identidade

Tudo sai da logo e do display de mesa:

| Elemento da marca | Uso na interface |
| --- | --- |
| Contorno preto-esverdeado da logo (`#021206`) | **Lousa** (`--k-lousa`): barra lateral, topo do painel no celular, faixa dos cartões de mesa, notificações |
| Creme do chapéu do chef (`#FCF5E4`) | **Giz** (`--k-giz`): texto sobre a lousa |
| Amarelo da cloche (`#FDD737`) | **Cloche** (`--k-cloche`): só para o evento central do produto, uma mesa chamando a equipe |
| Linhas de velocidade atrás do chef | Indicador de carregamento (`<SpeedLoader />`) |
| Letras condensadas do display de mesa | Rótulos em caixa alta (`.kd-overline`), nomes de mesa e títulos de seção do cardápio |

O amarelo tem significado fixo dos dois lados do produto: o cliente toca no botão amarelo **Chamar garçom**
e o dono vê o chamado em amarelo no painel (contador da barra lateral, bloco "Aguardando", ícone da sineta).
Não use o amarelo como decoração.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `app/globals.css` | Tokens (`:root`), base, tipografia, botões, campos, badges, cartões, diálogos, notificação e sistema de movimento |
| `app/auth.css` | Login e criação de conta |
| `app/dashboard.css` | Estrutura e páginas do painel, impressão dos QR Codes |
| `app/menu.css` | Cardápio público, folha de chamado, prato em tela cheia, tema escuro |
| `app/site.css` | Páginas públicas do produto: cabeçalho e rodapé do site, `/planos`, páginas legais, onboarding |
| `app/admin.css` | Administração do sistema (`/admin`) |
| `public/kardap-footer.css` | Rodapé do site, compartilhado entre a landing estática e as páginas do app (classes `kf-*`) |
| `components/ui/` | `Button`, `ButtonLink`, `IconButton`, `Badge`, `Card`, `CardHead`, `PageHeader`, `EmptyState`, `Callout`, `Skeleton`, `SpeedLoader`, `TextField`, `TextArea`, `SelectField`, `Switch`, `Segmented`, `RadioCard`, `Modal`, `ConfirmDialog`, `Toaster` |
| `lib/hooks.ts` | `useNow`, `useInView`, `usePrefersReducedMotion`, `useSaveData`, `useDialog` (foco, Esc, Tab, trava de scroll) |
| `lib/format.ts` | `brl`, `productCents`, `elapsed`, `plural`, `greeting`, `stagger` |
| `components/plans/plan-cards.tsx` | `CycleToggle`, `PlanCard`, `PlanComparison`: os mesmos blocos em `/planos`, na assinatura e no admin |
| `lib/cakto/access.ts` | Regras de acesso por plano, seguras para o navegador e para o servidor |

## Tokens

Use sempre as variáveis; não escreva cores soltas nos componentes.

- **Superfícies:** `--k-canvas` (fundo), `--k-surface` (cartões), `--k-sunken` (poços, controles segmentados)
- **Texto:** `--k-ink` (principal, 14,8:1 sobre o fundo), `--k-text-2`, `--k-muted` (mínimo 4,8:1)
- **Linhas:** `--k-line` (divisórias), `--k-line-strong`, `--k-control-line` (borda de campos, 3,4:1)
- **Estados:** `--k-success*`, `--k-danger*`, `--k-warning*`, `--k-cloche*`
- **Vidro:** `--k-glass`, `--k-glass-2`, `--k-glass-3` são a superfície translúcida (derivadas de `--k-surface`, então
  acompanham a paleta do restaurante); `--k-glass-rim` é só o brilho decorativo da borda de cartões.

Os tokens `--k-*` são os únicos que existem. Uma variável que não está em `:root` (por exemplo `--k-text`,
`--k-border`, `--k-accent`) não dá erro: o navegador simplesmente descarta a declaração, e o resultado é borda
sumindo ou texto branco sobre transparente. Antes de usar um nome, confira em `app/globals.css`.

### Nomes semânticos

Para quem vem de outros sistemas (shadcn, Tailwind), a correspondência é:

| Papel | Token Kardap | Observação |
| --- | --- | --- |
| background | `--k-canvas` | |
| foreground | `--k-ink` | |
| card / popover | `--k-surface` (ou `--k-glass*`) | |
| primary / primary-foreground | `--k-primary` / `--k-on-primary` | Nunca `#fff` fixo sobre o destaque: a paleta pode deixá-lo claro |
| primary como texto/ícone | `--k-primary-ink` | Garante 4,5:1 sobre fundo e superfície |
| secondary | `Button variant="secondary"` (superfície + `--k-control-line`) | |
| muted / muted-foreground | `--k-sunken` / `--k-muted` | |
| accent | `--k-cloche` / `--k-on-cloche` | Só chamado de mesa e avisos que pedem atenção agora |
| border | `--k-line` (divisórias), `--k-line-strong` (cartões) | Decorativas: podem ficar abaixo de 3:1 |
| input | `--k-control-line` | Obrigatória em todo controle: campo, select, busca, interruptor desligado, botão secundário |
| ring | `--k-focus` | Vira giz sobre a lousa |
| destructive | `--k-danger` (preenchimento), `--k-danger-ink` (texto) | |
| success | `--k-success` (preenchimento), `--k-success-ink` (texto) | |
| warning | `--k-warning` (preenchimento), `--k-warning-ink` (texto), `--k-warning-soft` (fundo) | Pendências e uso do plano; o amarelo continua reservado à cloche |

Regra de par: cor viva (`--k-success`, `--k-danger`, `--k-warning`, `--k-cloche`) é preenchimento de barra, ponto ou
fundo de ícone; texto colorido usa sempre a versão `-ink`.

### Visibilidade de controles

- Todo controle interativo precisa de um limite com 3:1 contra o fundo onde está: borda `--k-control-line`,
  preenchimento `--k-primary`/`--k-danger`, ou a combinação. `--k-glass-rim` e `--k-line` não contam.
- Estado selecionado nunca depende só de um fundo levemente diferente: some contorno, peso de fonte ou ✓.
- Sobre a lousa, use os tons do giz (`--k-giz`, `--k-giz-muted`, `color-mix` com `--k-giz`), nunca branco fixo:
  com uma cor de marca clara o giz vira escuro.
- Grades de página (`.kd-stack`, `.kd-group`) usam `minmax(0, 1fr)` para nenhum filho largo empurrar a página
  para fora da tela no celular.
- **Escala de espaço:** `--k-s1` a `--k-s10` (4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px)
- **Raios:** `--k-r-xs` 6 · `--k-r-sm` 8 (botões, campos) · `--k-r-md` 12 (cartões) · `--k-r-lg` 16 (diálogos)
- **Sombras:** só em camadas que flutuam: `--k-shadow-raise` (hover de cartão interativo) e `--k-shadow-float` (diálogos, gaveta, notificação). Cartões em repouso usam só borda.

## Tipografia

Archivo variável, auto-hospedada com `next/font` (sem requisição ao Google Fonts no carregamento).

| Classe | Uso |
| --- | --- |
| `.kd-display` | Nome do restaurante na visão geral |
| `.kd-h1` | Título da página (um por tela, vem do `PageHeader`) |
| `.kd-h2`, `.kd-h3` | Títulos de cartão e de diálogo |
| `.kd-overline` | Rótulo curto condensado em caixa alta |
| `.kd-lead` | Descrição da página |
| `.kd-num` | Números tabulares (preços, contagens) |

## Botões

`primary` (ação principal, tinta), `secondary`, `ghost`, `danger` (ações destrutivas), `link` e `signal`
(amarelo, exclusivo de chamar a equipe). Todos têm hover, foco visível, pressionado e `loading`
(gira o ícone, mantém o texto e bloqueia clique duplo). Ícone sem texto: `IconButton` com `label` obrigatório.
Opções que ligam/desligam juntas: `.kd-chip-toggle` com `aria-pressed`. Etapas de assistente: `.kd-stepper` com
`aria-current="step"`. Opção exclusiva com descrição: `RadioCard`.

## Movimento

| Recurso | Para quê |
| --- | --- |
| `.k-enter` + `style={stagger(i)}` | Conteúdo entrando em sequência ao abrir a página |
| `.kd-page` | Transição curta entre páginas do painel |
| `k-arrive` | Chamado novo entra deslizando, como o chef correndo |
| `k-ding` | A sineta balança uma vez quando a mesa chama |
| `k-sheet` / `k-pop` | Folhas e diálogos |
| `.kd-speed` | Carregamento da marca |

Durações: 120 ms (pressionar), 180 ms (hover), 260 ms (entrar), 420 ms (página/folha).
Com `prefers-reduced-motion`, todas as animações e transições caem para 1 ms; carregadores continuam
indicando atividade de forma estática ou lenta. Nada de animação em loop decorativa: o único loop é o
indicador "ao vivo" dos chamados, desligado em movimento reduzido.

## Acessibilidade

- Foco visível em tudo (`:focus-visible`, contorno de 2 px na cor `--k-focus`, que vira giz sobre a lousa).
- Diálogos usam `useDialog`: foco inicial, Tab preso, Esc fecha só o diálogo de cima, foco devolvido.
- Campos: `TextField`/`TextArea`/`SelectField` ligam rótulo, dica e erro (`aria-describedby`, `aria-invalid`).
- Notificações: região polida para sucesso, assertiva para erro; o tempo pausa com mouse ou foco.
- Alvos de toque: 44 px em telas de toque.

## Cardápio público

- Segue o tema do celular do cliente (`prefers-color-scheme: dark` em `.kd-menu-page`).
- **Miniaturas na lista são a foto do produto** (`photoOnly` no `MenuCatalog`): o vídeo não é carregado na lista,
  apenas quando o cliente toca para abrir o produto (no Reels em tela cheia) ou através do trilho de vídeos no topo.
- A ordem e a visibilidade das seções vêm das categorias do painel (`watchPublicRestaurantCategories`).
  Se a leitura das categorias falhar, o cardápio agrupa pelo nome salvo em cada produto.

## Delivery (`/r/:slug/delivery` e `/dashboard/delivery`)

- É o mesmo cardápio público com carrinho. O amarelo (`signal`) faz no delivery o papel que tem na mesa: marca a
  ação central do cliente (ver carrinho, avançar no checkout, enviar o pedido). Não use em outras ações do delivery.
- **Miniaturas são a foto do produto** (`photoOnly` no `MenuCatalog`): `imageThumb`, depois `image`; a capa do vídeo
  só entra sem foto. Vídeo não toca na lista do delivery; aparece na folha do produto e nos Reels.
- O "+" sobre a miniatura (`.kd-dish-add`, cor `--k-primary`) adiciona uma unidade sem observação; o selo
  "N no carrinho" entra de novo a cada item somado. Observação e quantidade ficam na folha do produto.
- Checkout em 4 etapas (Dados, Entrega, Pagamento, Revisão). O que foi digitado fica na aba
  (`checkout-draft.ts`): editar o carrinho ou trocar o pagamento não apaga o formulário. A revisão tem "Alterar" ao
  lado de cada bloco.
- Pagamento online: o pedido só chega ao restaurante com o pagamento aprovado, e o carrinho só é esvaziado então.
  A tela sempre oferece "Escolher outra forma de pagamento" (com aviso quando um pagamento pode estar em andamento).
- Pedido em andamento fica no aparelho por até 12 h: o botão "Acompanhar pedido #000" no topo do cardápio volta ao
  acompanhamento, que para de consultar quando o pedido termina ou quando a aba fica em segundo plano.
- Valores em dinheiro digitados passam por `parseMoneyCents` (`lib/format.ts`): vazio é `null`, texto inválido é
  `NaN` e vira mensagem de erro, nunca R$ 0,00. Campos numéricos do mapa gravam ao sair do campo (`CommitInput`).
- No painel, cada configuração tem um lugar só: "Taxa e área de entrega" (forma de cobrança, taxa, cidades, mapa) e
  "Pedido e pagamento" (tempo, mínimo, recado, formas de pagamento). `lib/delivery/readiness.ts` lista o que impede
  um cliente de concluir pedidos, com o atalho para corrigir.

## Hierarquia visual

O objetivo não é fazer tudo chamar atenção: é a coisa certa chamar atenção no momento certo.

**Níveis de texto.** Um `h1` por tela (vem do `PageHeader`); `.kd-h2` para títulos de seção e de cartão;
`.kd-overline` só como rótulo de contexto acima de um título, nunca sozinho. Descrições usam `.kd-lead`
(cor `--k-muted`), metadados `--k-fs-sm`/`--k-fs-xs` em `--k-muted`. Em listas e tabelas, a informação que
identifica a linha (nome do restaurante, da mesa, do produto) fica em `--k-ink` e peso 650; as demais
colunas descem para `--k-text-2` e os cabeçalhos de coluna para `--k-fs-xs` em `--k-muted`.

**Espaço.** Use a escala de 4 px sem valores soltos:

| Relação | Espaço |
| --- | --- |
| Rótulo e título, título e descrição | 4 px |
| Itens de um mesmo grupo (filtros e resultado, campos de um bloco) — `.kd-group` | 12 px |
| Conteúdo dentro de um cartão | 16 a 24 px |
| Seções de uma página — `.kd-stack` | 32 px (24 px no celular) |

Separar por espaço antes de separar por borda; borda só quando o espaço não basta (tabelas, listas longas).

**Cor.**

- Tinta (`--k-ink`) é a cor da ação principal. Uma ação primária por área visível.
- Amarelo da cloche: chamados das mesas e avisos que pedem atenção agora (teste terminando, limite do plano).
  Nunca como decoração.
- Vermelho: erro, inadimplência, suspensão e ações destrutivas. Nada mais.
- Verde: só confirmação de estado bom (assinatura ativa, QR Code ativo).

**Ações.**

| Nível | Componente | Quando |
| --- | --- | --- |
| Principal | `Button` `primary` | A ação que conclui a tarefa da tela. No máximo uma por área |
| Secundária | `secondary` | Alternativas úteis (copiar link, imprimir, ver planos) |
| Terciária | `ghost` ou `link` | Voltar, pular, ver todos, sair |
| Destrutiva | `secondary` (ou `ghost`) com `.is-destructive`; `danger` cheio só dentro do `ConfirmDialog` ou na confirmação final | Suspender, excluir, cancelar |

Quando a ação principal não pode ser concluída (por exemplo, limite de mesas do plano), ela desce para
`secondary` e um `Callout` explica o motivo antes do clique.

**Estados.** `Callout` informa sem bloquear: `info` (recurso de outro plano), `warn` (atenção, prazo),
`danger` (suspensão, falha que exige ação). O texto diz o que aconteceu e o que fazer, de acordo com a
situação real da conta (quem assina o Essencial não lê mensagem sobre teste grátis).

**Indicadores.** Em grupos de números, o mais importante vem primeiro e maior (`.kd-kpi.is-lead`, em lousa).
No celular, os secundários viram linhas compactas para não empurrar as listas para baixo.

**Tabelas no celular.** Viram cartões: identificação da linha no topo, situação à direita, demais dados
abaixo com o rótulo da coluna (`data-label`).

## Planos e acesso

As regras ficam em `lib/cakto/access.ts` e valem para o painel, o cardápio público e as rotas da API:

- Conta sem assinatura ganha 15 dias do Pro a partir da criação do restaurante (teste implícito).
- Essencial: até 30 mesas, chamar garçom, marca própria. Pro: mesas ilimitadas, pedir a conta, relatórios.
- Pagamento atrasado mantém o acesso por 3 dias de carência; assinatura cancelada vale até o fim do período pago.
- Dados de cartão (bandeira e final) ficam em `restaurantes/{id}/privado/assinatura`, fora do documento
  público do restaurante.

## Administração do sistema

`/admin` usa barra superior em lousa (e não a lateral do painel do restaurante) para deixar claro em que
área a pessoa está. O acesso depende de um documento `admins/{uid}` no Firestore, que só pode ser criado
pelo console ou por `scripts/grant-admin.mjs`. Toda ação (estender teste, suspender, reativar) fica
registrada em `adminLog` com o e-mail de quem fez.
