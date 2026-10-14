# SEO, GEO e indexação

Como o site se apresenta para buscadores e sistemas de IA, e como manter isso.

## Arquitetura

| Parte | Onde | Como o SEO é definido |
| --- | --- | --- |
| Landing (página inicial e páginas de produto) | `public/*.html`, servidas em `/` e `/<página>` pelo `middleware.ts` | `scripts/seo-landing.mjs` grava título, descrição, canonical, Open Graph, robots e JSON-LD no próprio HTML |
| Planos, páginas legais, login, painel, cardápios | `app/[...path]/page.tsx` (Next.js) | `generateMetadata` por rota; padrões em `app/layout.tsx` e `lib/seo/site.ts` |
| `robots.txt` | `app/robots.ts` | Público liberado; `/api/`, `/dashboard`, `/admin`, `/onboarding` e `/logout` bloqueados |
| `sitemap.xml` | `app/sitemap.ts` | Só páginas canônicas e indexáveis (landing via `lib/seo/landing-pages.json` + `INDEXABLE_APP_ROUTES`) |
| `llms.txt` | `public/llms.txt` | Resumo factual do produto para sistemas de IA |
| Imagem de compartilhamento | `public/brand/kardap-og.jpg` (1200×630) | Usada pela landing e pelo app |

## A landing e o `scripts/seo-landing.mjs`

As páginas estáticas vieram de um espelho do site de outra empresa (sundayapp.com) e eram traduzidas **só no
navegador** (`public/localization-ptbr.js`). Robôs que não executam JavaScript, inclusive vários de IA, liam o HTML
original: menus em inglês, marca de terceiros, canonical de todas as páginas apontando para `/`, título e descrição
sobrescritos por um texto igual em todas as páginas. O script corrige isso no próprio HTML:

- grava no HTML a tradução e a troca de marca que o navegador fazia (o texto visível ficou idêntico, conferido
  página a página no navegador);
- corrige os acentos do texto próprio das páginas;
- refaz o `<head>`: `lang="pt-BR"`, título e descrição únicos, canonical absoluto, Open Graph, Twitter e robots;
- remove metadados e links do site de origem e o código de verificação do Search Console dele;
- remove o **Google Tag Manager do site de origem** (contêiner `GTM-N27NB59`, servido por `tss.sundayapp.com`), que
  carregava o Google Analytics dele (`G-168VZZJ92Y`) e a plataforma de cookies dele (Axeptio) em todas as páginas:
  os dados de navegação dos visitantes do Kardap iam para o analytics de outra empresa, sem consentimento;
- remove códigos mortos (estatísticas Plausible que não funcionavam, metas de formulários WordPress que não existem,
  campo de telefone sem uso, um removedor do banner de cookies do site de origem que observava toda a página);
- carrega jQuery e os scripts do tema com `defer` (mesma ordem, sem bloquear a primeira pintura) e dá prioridade à
  imagem principal da página inicial (`fetchpriority="high"`);
- adiciona JSON-LD (Organization, WebSite, SoftwareApplication com os preços de `lib/cakto/plans.ts`, BreadcrumbList)
  e, na Central de ajuda, perguntas frequentes visíveis com FAQPage;
- gera `lib/seo/landing-pages.json`, lido pelo middleware, pelos redirecionamentos e pelo sitemap.

É idempotente. Ao editar uma página da landing, ou mudar títulos, descrições ou a lista de indexação, rode:

```bash
node scripts/seo-landing.mjs
```

### Páginas indexáveis e "noindex"

Indexáveis (no sitemap): `/`, `/cardapio-video`, `/qr-code-mesas`, `/cardapio-inteligente`, `/gestao-cardapio`,
`/sua-marca`, `/experiencia-visual`, `/experiencia-cliente`, `/para-restaurantes`, `/central-ajuda`, `/sobre`,
`/planos`, `/privacidade`, `/termos` e `/cookies`.

Com "noindex, follow" até terem conteúdo próprio ou até o recurso existir no produto:

| Página | Motivo |
| --- | --- |
| `/ai-menu`, `/ai-reconciliation`, `/ai-tips` | Descrevem recursos de IA que o produto não tem |
| `/produtos-destaque` | Não existe recurso de destaque no cardápio |
| `/blog`, `/materiais`, `/novidades`, `/parceiros`, `/experiencias`, `/dicas-restaurantes` | Modelo com ~60 palavras próprias, sem os artigos, materiais ou casos que anunciam |
| `/empresa` | Mesmo assunto de `/sobre` |

Para mudar, edite `PAGES` em `scripts/seo-landing.mjs` (`index: true/false`) e rode o script.

No app: login, cadastro, configuração inicial, painel, administração e logout são "noindex". Os cardápios dos
restaurantes (`/r/<slug>`) também, porque o conteúdo é carregado no navegador e há um endereço por mesa
(`?mesa=`); o canonical aponta para `/r/<slug>`.

### Redirecionamentos (301)

`/index`, `/index.html` → `/`; `/<página>.html` → `/<página>`; `/snapshot` → `/` (página que reproduzia o site de
outra empresa; o arquivo foi movido para `design/referencias/` e não é mais publicado).

## Robôs de IA

O `robots.txt` não bloqueia nenhum robô nas páginas públicas (GPTBot, OAI-SearchBot, Google-Extended, PerplexityBot,
ClaudeBot, Bingbot etc.). Liberar o rastreamento não garante indexação nem citação. Para bloquear algum, acrescente
uma regra em `app/robots.ts`, por exemplo `{ userAgent: "GPTBot", disallow: "/" }`.

## Configuração externa (pendente)

Nenhum ID ou token foi inventado. Quando houver:

| Serviço | Como configurar |
| --- | --- |
| Google Search Console | Preferível: propriedade de domínio com registro TXT no DNS de `kardapp.online` (cobre `www` e subdomínios). Alternativa: `GOOGLE_SITE_VERIFICATION` (só o código) nas variáveis da Netlify, que vale para as páginas do app; a página inicial é estática, então nesse caso use o TXT. Depois, envie `https://kardapp.online/sitemap.xml` |
| Bing Webmaster Tools | Importar o site do Search Console (mais simples) ou `BING_SITE_VERIFICATION` |
| Google Analytics 4 | Ainda não existe. Ao criar a propriedade, carregue o gtag só depois do consentimento no aviso de cookies (LGPD) e inclua o script nas páginas da landing e no `app/layout.tsx` |
| `NEXT_PUBLIC_SITE_URL` | Opcional; padrão `https://kardapp.online` |

## Validação

- `node scripts/seo-landing.mjs` duas vezes seguidas: a segunda não altera nada.
- Depois do deploy: Rich Results Test e Schema Markup Validator nas páginas `/`, `/central-ajuda` e `/planos`;
  Search Console → Inspeção de URL; `curl -I https://kardapp.online/index.html` deve responder 301.
