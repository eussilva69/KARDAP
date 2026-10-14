// SEO das páginas estáticas da landing (public/*.html) — docs/SEO.md.
//
// As páginas vieram de um espelho de outro site e eram traduzidas só no navegador (public/localization-ptbr.js).
// Robôs que não executam JavaScript liam o HTML original: textos em inglês, metadados e marca de terceiros.
// Este script grava no HTML o mesmo resultado que o navegador mostra e corrige o <head>:
//   - tradução e troca de marca aplicadas no próprio HTML (mesma aparência);
//   - acentos no texto próprio das páginas (estavam sem acento);
//   - título, descrição, canonical, Open Graph, Twitter, robots e lang por página;
//   - remove metadados, links, verificação do Search Console e Tag Manager de terceiros;
//   - remove scripts sem uso (estatísticas que não funcionavam, campo de telefone que não existe);
//   - dados estruturados (JSON-LD) com informações reais do produto (preços de lib/cakto/plans.ts);
//   - perguntas frequentes reais na Central de ajuda (visíveis na página e em FAQPage).
// É idempotente: rodar de novo não muda nada. Uso: node scripts/seo-landing.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUB = path.join(ROOT, "public");
const SITE = "https://kardapp.online";
const OG_IMAGE = `${SITE}/brand/kardap-og.jpg`;
const PHONE = "+55-11-93213-8691";
const WHATSAPP = "https://wa.me/5511932138691";

// ───────── Páginas: título, descrição e indexação ─────────
// index: false → noindex (conteúdo curto de modelo ou recurso que o produto ainda não tem). Ver docs/SEO.md.
const PAGES = {
  index: {
    path: "/",
    title: "Cardápio digital com vídeo e QR Code por mesa | Kardap",
    description:
      "Crie o cardápio digital do seu restaurante com fotos e vídeos dos pratos, QR Code por mesa e chamados de garçom em tempo real. Teste grátis por 15 dias, sem cartão.",
    index: true,
  },
  "cardapio-video": {
    title: "Cardápio em vídeo para restaurantes | Kardap",
    description:
      "Mostre cada prato em vídeo curto no cardápio digital. O Kardap otimiza os vídeos para abrirem rápido no celular do cliente, direto pelo QR Code da mesa.",
    index: true,
  },
  "qr-code-mesas": {
    title: "QR Code por mesa para cardápio digital | Kardap",
    description:
      "Gere um QR Code para cada mesa: o cliente abre o cardápio no navegador, sem baixar aplicativo, e chama o garçom pelo celular. Displays prontos para imprimir em A4.",
    index: true,
  },
  "cardapio-inteligente": {
    title: "Cardápio digital com busca e categorias | Kardap",
    description:
      "Cardápio digital organizado por categorias, com busca de pratos, fotos, vídeos e descrições. Seu cliente encontra o que procura em segundos, no próprio celular.",
    index: true,
  },
  "gestao-cardapio": {
    title: "Gestão do cardápio digital pelo painel | Kardap",
    description:
      "Cadastre pratos, preços, categorias, fotos e vídeos em um painel simples. As alterações aparecem na hora no cardápio aberto nas mesas, sem reimprimir nada.",
    index: true,
  },
  "sua-marca": {
    title: "Cardápio digital com a identidade do seu restaurante | Kardap",
    description:
      "Use o logo, a capa e as cores do seu restaurante no cardápio digital. O Kardap ajusta o contraste automaticamente para manter tudo legível no celular.",
    index: true,
  },
  "experiencia-visual": {
    title: "Cardápio visual com fotos e vídeos dos pratos | Kardap",
    description:
      "Apresente cada prato com foto e vídeo, carregados de forma leve para o celular. Um cardápio digital que desperta vontade antes do pedido.",
    index: true,
  },
  "experiencia-cliente": {
    title: "Experiência do cliente no cardápio digital | Kardap",
    description:
      "O cliente escaneia o QR Code da mesa, navega pelas categorias, busca pratos e chama o garçom pelo celular, sem instalar aplicativo.",
    index: true,
  },
  "para-restaurantes": {
    title: "Cardápio digital para restaurantes, bares e cafés | Kardap",
    description:
      "Para restaurantes, bares, cafés e lanchonetes: cardápio com vídeo, QR Code por mesa e chamados de garçom em tempo real. Planos a partir de R$ 49 por mês.",
    index: true,
  },
  "central-ajuda": {
    title: "Central de ajuda e perguntas frequentes | Kardap",
    description:
      "Respostas sobre o cardápio digital Kardap: como funciona o QR Code, vídeos dos pratos, planos e preços, teste grátis, chamados de garçom e suporte pelo WhatsApp.",
    index: true,
  },
  sobre: {
    title: "Sobre o Kardap | Cardápio digital com vídeo",
    description:
      "Conheça o Kardap: cardápio digital com vídeo, QR Code por mesa e chamados de garçom em tempo real para restaurantes, bares, cafés e lanchonetes.",
    index: true,
  },
  // Sem índice até terem conteúdo próprio ou até o recurso existir no produto.
  "produtos-destaque": { title: "Produtos em destaque | Kardap", description: "Apresente novidades, combos e os mais pedidos no cardápio digital do seu restaurante.", index: false },
  "ai-menu": { title: "AI Menu® | Kardap", description: "Atualize seu cardápio sem reimprimir nada.", index: false },
  "ai-reconciliation": { title: "AI Reconciliation® | Kardap", description: "Fechamento de caixa para restaurantes.", index: false },
  "ai-tips": { title: "AI Tips® | Kardap", description: "Sugestões para destacar o melhor do seu cardápio.", index: false },
  blog: { title: "Blog da Kardap | Kardap", description: "Histórias e boas práticas para restaurantes.", index: false },
  materiais: { title: "Materiais | Kardap", description: "Materiais para restaurantes.", index: false },
  novidades: { title: "Novidades | Kardap", description: "Novidades do produto Kardap.", index: false },
  parceiros: { title: "Parceiros | Kardap", description: "Parceiros da Kardap.", index: false },
  experiencias: { title: "Experiências | Kardap", description: "Restaurantes que usam a Kardap.", index: false },
  "dicas-restaurantes": { title: "Dicas para restaurantes | Kardap", description: "Dicas para a operação e o cardápio do seu restaurante.", index: false },
  empresa: { title: "A empresa | Kardap", description: "Informações sobre a empresa Kardap.", index: false },
};

const NAMES = {
  "cardapio-video": "Cardápio em vídeo",
  "qr-code-mesas": "QR Code para mesas",
  "cardapio-inteligente": "Cardápio inteligente",
  "gestao-cardapio": "Gestão do cardápio",
  "sua-marca": "Sua marca",
  "experiencia-visual": "Experiência visual",
  "experiencia-cliente": "Experiência do cliente",
  "para-restaurantes": "Para restaurantes",
  "central-ajuda": "Central de ajuda",
  sobre: "Sobre",
};

// ───────── Perguntas frequentes (respostas conferidas no código: planos, onboarding, vídeos, chamados) ─────────
const FAQ = [
  [
    "O que é o Kardap?",
    "O Kardap é um cardápio digital para restaurantes, bares, cafés e lanchonetes. O restaurante cadastra os pratos com fotos e vídeos curtos, gera um QR Code para cada mesa e recebe no painel, em tempo real, os chamados feitos pelos clientes.",
  ],
  [
    "O cliente precisa baixar algum aplicativo?",
    "Não. O cliente aponta a câmera do celular para o QR Code da mesa e o cardápio abre direto no navegador.",
  ],
  [
    "Quanto custa o Kardap?",
    "São dois planos. Essencial: R$ 49,00 por mês ou R$ 470,00 por ano, com até 30 mesas. Pro: R$ 99,00 por mês ou R$ 950,00 por ano, com mesas e produtos ilimitados, pedido de conta pelo cardápio, relatórios de chamados e personalização avançada.",
  ],
  ["Tem teste grátis?", "Sim. Ao criar a conta, você testa o Kardap por 15 dias sem cadastrar cartão de crédito."],
  [
    "Posso colocar vídeos dos pratos?",
    "Sim. Você envia um vídeo curto para cada prato e o Kardap converte o arquivo para um formato leve, de até 720p, e gera a imagem de capa, para o vídeo abrir rápido no celular do cliente.",
  ],
  [
    "Como o cliente chama o garçom?",
    "Pelo próprio cardápio aberto no celular. O chamado aparece no painel do restaurante na hora, com a identificação da mesa e alerta sonoro. No plano Pro, o cliente também pode pedir a conta pelo cardápio.",
  ],
  ["Quantas mesas posso cadastrar?", "Até 30 mesas no plano Essencial. No plano Pro, mesas ilimitadas."],
  [
    "Como começo a usar?",
    "Crie a conta, informe o nome do estabelecimento, envie o logo e a capa, cadastre os pratos e imprima os QR Codes das mesas. O display de mesa sai pronto para imprimir em folha A4.",
  ],
  ["Posso usar a identidade visual do meu restaurante?", "Sim. Você aplica o logo, a capa e as cores do restaurante no cardápio. A personalização avançada faz parte do plano Pro."],
  ["Como falo com o suporte?", "Pelo WhatsApp (11) 93213-8691."],
];

// ───────── Utilitários ─────────
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", raquo: "»", laquo: "«", copy: "©", reg: "®", trade: "™", agrave: "à", aacute: "á", atilde: "ã", acirc: "â", eacute: "é", ecirc: "ê", iacute: "í", oacute: "ó", ocirc: "ô", otilde: "õ", uacute: "ú", ccedil: "ç", Aacute: "Á", Eacute: "É", Ccedil: "Ç" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : NAMED[e] ?? m,
  );
const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");

// Dicionário da tradução que o navegador aplica (o mesmo de public/localization-ptbr.js).
function loadDictionary() {
  const src = fs.readFileSync(path.join(PUB, "localization-ptbr.js"), "utf8");
  const blocks = [...src.matchAll(/(?:const copy = |Object\.assign\(copy, )(\{[\s\S]*?\n {2}\})/g)].map((m) => m[1]);
  const copy = {};
  for (const b of blocks) Object.assign(copy, vm.runInNewContext(`(${b})`));
  const testimonials = vm.runInNewContext(`(${src.match(/const testimonials = (\[[\s\S]*?\n {4}\]);/)[1]})`);
  return { copy, testimonials };
}

// Palavras do texto próprio das páginas que estavam sem acento.
const ACCENTS = Object.fromEntries(
  `agencias agências|almoco almoço|america américa|cardapio cardápio|cardapios cardápios|consistencia consistência|conteudo conteúdo|conteudos conteúdos|descricoes descrições|divergencias divergências|edicao edição|experiencia experiência|experiencias experiências|garcom garçom|gestao gestão|harmonizacoes harmonizações|historia história|historias histórias|historico histórico|integracao integração|integracoes integrações|metricas métricas|missao missão|multilingue multilíngue|multiplas múltiplas|obsessao obsessão|operacao operação|operacoes operações|portugues português|precificacao precificação|producao produção|solucoes soluções|sugestao sugestão|sugestoes sugestões|treinavel treinável|video vídeo|videos vídeos|visao visão|voce você|acrilico acrílico|angulo ângulo|apresentacao apresentação|ate até|atualizacoes atualizações|auditavel auditável|automatica automática|bistro bistrô|camarao camarão|campeoes campeões|comeca começa|composicao composição|conexao conexão|decisao decisão|devolucoes devoluções|diferenca diferença|duvida dúvida|editaveis editáveis|estao estão|facil fácil|familia família|friccao fricção|generico genérico|gluten glúten|horario horário|horarios horários|impecavel impecável|impressao impressão|informacoes informações|ingles inglês|inquietacao inquietação|inscricao inscrição|intuicao intuição|lancado lançado|lancamentos lançamentos|legiveis legíveis|maximo máximo|medio médio|mudancas mudanças|nao não|numero número|padrao padrão|pagina página|posicoes posições|pratica prática|praticas práticas|preco preço|precos preços|preferencia preferência|principio princípio|propoe propõe|propria própria|proprio próprio|proximo próximo|rapido rápido|rapidos rápidos|reconciliacao reconciliação|reimpressao reimpressão|salao salão|satisfacao satisfação|tambem também|unico único|varias várias|versao versão|ja já|so só|ha há|reforca reforça|formulario formulário`
    .split("|")
    .map((pair) => pair.split(" ")),
);
// Frases em que "e" é verbo ("é"): corrigidas uma a uma, porque a palavra sozinha é ambígua.
const PHRASES = [
  ["cardápio em vídeo e o próximo padrão", "cardápio em vídeo é o próximo padrão"],
  ["O topo do cardápio e seu outdoor", "O topo do cardápio é seu outdoor"],
];
const accentuate = (text) => {
  const words = text.replace(/[A-Za-z]+/g, (word) => {
    const fixed = ACCENTS[word.toLowerCase()];
    if (!fixed) return word;
    return word[0] === word[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
  });
  return PHRASES.reduce((t, [from, to]) => t.split(from).join(to), words);
};

// Percorre o HTML do <body> separando texto, comentários, scripts e estilos.
function mapBodyText(html, fn) {
  return html.replace(/(<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>)|([^<]+)/g, (m, tag, text) => (tag ? tag : fn(text)));
}

// ───────── Transformação ─────────
const { copy, testimonials } = loadDictionary();

function translateText(raw) {
  const decoded = decode(raw);
  const trimmed = decoded.trim();
  if (!trimmed) return raw;
  let out = decoded;
  const t = testimonials.find(([source]) => trimmed.includes(source));
  if (t) out = decoded.replace(trimmed, t[1]);
  else if (copy[trimmed]) out = decoded.replace(trimmed, copy[trimmed]);
  out = out.replace(/\bsunday\b/gi, "Kardap");
  return out === decoded ? raw : escText(out);
}

function jsonLd(slug, page) {
  const url = `${SITE}${page.path}`;
  const graph = [];
  if (slug === "index") {
    graph.push(
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "Kardap",
        url: `${SITE}/`,
        logo: { "@type": "ImageObject", url: `${SITE}/brand/kardap-logo.png` },
        contactPoint: [{ "@type": "ContactPoint", telephone: PHONE, contactType: "customer support", areaServed: "BR", availableLanguage: "Portuguese" }],
        sameAs: [WHATSAPP],
      },
      { "@type": "WebSite", "@id": `${SITE}/#website`, url: `${SITE}/`, name: "Kardap", inLanguage: "pt-BR", publisher: { "@id": `${SITE}/#organization` } },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE}/#software`,
        name: "Kardap",
        url: `${SITE}/`,
        description: page.description,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Cardápio digital para restaurantes",
        operatingSystem: "Web",
        inLanguage: "pt-BR",
        provider: { "@id": `${SITE}/#organization` },
        featureList: [
          "Cardápio digital interativo e responsivo",
          "Vídeos curtos e fotos nos produtos",
          "QR Code individual por mesa",
          "Chamados das mesas em tempo real com alerta sonoro",
          "Avaliações no Google integradas ao cardápio",
          "Pedido de conta pelo cardápio (plano Pro)",
          "Relatórios de chamados e horários de pico (plano Pro)",
        ],
        offers: [
          { "@type": "Offer", name: "Plano Essencial (mensal)", price: "49.00", priceCurrency: "BRL", url: `${SITE}/planos`, availability: "https://schema.org/InStock" },
          { "@type": "Offer", name: "Plano Essencial (anual)", price: "470.00", priceCurrency: "BRL", url: `${SITE}/planos`, availability: "https://schema.org/InStock" },
          { "@type": "Offer", name: "Plano Pro (mensal)", price: "99.00", priceCurrency: "BRL", url: `${SITE}/planos`, availability: "https://schema.org/InStock" },
          { "@type": "Offer", name: "Plano Pro (anual)", price: "950.00", priceCurrency: "BRL", url: `${SITE}/planos`, availability: "https://schema.org/InStock" },
        ],
      },
    );
  } else {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Kardap", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: NAMES[slug], item: url },
      ],
    });
  }
  if (slug === "central-ajuda") {
    graph.push({
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function headBlock(slug, page) {
  const url = `${SITE}${page.path}`;
  const robots = page.index ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" : "noindex, follow";
  const lines = [
    `<title>${escText(page.title)}</title>`,
    `<meta name="description" content="${escAttr(page.description)}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:site_name" content="Kardap">`,
    `<meta property="og:title" content="${escAttr(page.title)}">`,
    `<meta property="og:description" content="${escAttr(page.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Kardap: cardápio digital com vídeo e QR Code por mesa">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escAttr(page.title)}">`,
    `<meta name="twitter:description" content="${escAttr(page.description)}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
    `<meta name="theme-color" content="#0e1912">`,
    `<link rel="icon" type="image/png" sizes="48x48" href="/brand/kardap-icon-48.png">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="/brand/kardap-icon-192.png">`,
    `<link rel="apple-touch-icon" href="/brand/kardap-icon-180.png">`,
  ];
  if (page.index) lines.push(`<script type="application/ld+json">${jsonLd(slug, page).replace(/</g, "\\u003c")}</script>`);
  return `<!-- kardap-seo:inicio -->\n${lines.join("\n")}\n<!-- kardap-seo:fim -->`;
}

function cleanHead(head) {
  return (
    head
      .replace(/<!-- kardap-seo:inicio -->[\s\S]*?<!-- kardap-seo:fim -->\n?/g, "")
      .replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/gi, "")
      .replace(/<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']*|article:[^"']*|twitter:[^"']*|generator|google-site-verification|msapplication-[^"']*|theme-color)["'][^>]*>\s*/gi, "")
      .replace(/<meta\b[^>]*name=["']viewport["'][^>]*>/i, '<meta name="viewport" content="width=device-width, initial-scale=1">')
      .replace(/<link\b[^>]*rel=["'](?:canonical|shortlink|profile|pingback|author|EditURI|wlwmanifest|alternate|icon|apple-touch-icon|shortcut icon)["'][^>]*>\s*/gi, "")
      .replace(/<link\b[^>]*href=["']https:\/\/fonts\.gstatic\.com["'][^>]*>\s*/gi, "")
      .replace(/<link\b[^>]*intlTelInput\.css[^>]*>\s*/gi, "")
      .replace(/<script\b[^>]*src=["'][^"']*(?:plausible\.io|intl-tel-input)[^"']*["'][^>]*><\/script>\s*/gi, "")
      .replace(/<script type=["']speculationrules["']>[\s\S]*?<\/script>\s*/gi, "")
  );
}

const FAQ_CSS = `.kardap-page .faq{display:grid;gap:12px;margin-top:24px}
.kardap-page .faq details{background:rgba(0,0,0,.04);border-radius:18px;padding:20px 24px}
[data-theme="dark"] .kardap-page .faq details,.--dark .kardap-page .faq details{background:rgba(255,255,255,.06)}
.kardap-page .faq summary{cursor:pointer;font-weight:700;font-size:18px;line-height:1.4;list-style-position:outside}
.kardap-page .faq details p{margin:12px 0 0;opacity:.8;font-size:16px;line-height:1.6;max-width:760px}`;

function faqSection() {
  const items = FAQ.map(([q, a]) => `        <details><summary>${escText(q)}</summary><p>${escText(a)}</p></details>`).join("\n");
  return `<!-- kardap-faq:inicio -->
      <div class="section" id="perguntas-frequentes">
        <h2>Perguntas frequentes</h2>
        <div class="faq">
${items}
        </div>
      </div>
      <!-- kardap-faq:fim -->`;
}

function transform(slug, html) {
  const page = { path: `/${slug}`, ...PAGES[slug] };
  let [, before, head, after] = html.match(/^([\s\S]*?<head[^>]*>)([\s\S]*?)(<\/head>[\s\S]*)$/i);
  // <html lang>
  before = before.replace(/<html\b([^>]*?)\blang=["'][^"']*["']/i, '<html$1lang="pt-BR"');
  // <head>
  head = cleanHead(head);
  head = head.replace(/(<meta charset=["'][^"']*["']\s*\/?>)/i, `$1\n${headBlock(slug, page)}`);
  if (slug === "central-ajuda" && !head.includes(".kardap-page .faq{")) head = head.replace(/(\.kardap-page \.section p\{[^}]*\})/, `$1\n${FAQ_CSS}`);
  // <body>
  let body = after;
  body = body.replace(/\sdata-ajax-(?:url|nonce)=["'][^"']*["']/gi, "");
  body = body.replace(/\s*<!-- Google Tag Manager \(noscript\) -->\s*<noscript>[\s\S]*?<\/noscript>\s*<!-- End Google Tag Manager \(noscript\) -->/gi, "");
  body = body.replace(/<script\b[^>]*src=["'][^"']*(?:plausible\.io|intl-tel-input)[^"']*["'][^>]*><\/script>\s*/gi, "");
  // Rastreamento do site de origem (Google Tag Manager GTM-N27NB59, que carregava o Google Analytics e a
  // plataforma de cookies dele) e códigos mortos ligados a ele: saem do <head> e do <body>.
  const dropInline = (s) =>
    s
      .replace(/\s*<!-- Google Tag Manager -->\s*(?=<script>)/g, "\n")
      .replace(/\s*<!-- End Google Tag Manager -->/g, "")
      .replace(/<script>(?:(?!<\/script>)[\s\S])*?(?:GTM-N27NB59|"page_country"|window\.plausible\.init|wpformsAjaxSubmitSuccess|function nukeAxeptio)(?:(?!<\/script>)[\s\S])*<\/script>\s*/g, "")
      .replace(/\.axeptio_widget,#axeptio_overlay,\[class\*="axeptio"\]\{display:none !important;visibility:hidden !important\}\n?/g, "");
  head = dropInline(head);
  body = dropInline(body);
  // Scripts do tema sem bloquear a primeira pintura: "defer" mantém a ordem e roda antes do DOMContentLoaded
  // (os códigos embutidos que usam jQuery só rodam nesse evento ou conferem se ele existe).
  const deferScripts = (s) =>
    s.replace(/<script\b(?![^>]*\b(?:defer|async)\b)([^>]*\bsrc=["'][^"']*(?:jquery\.min|static\/global\.|legacy-dropdown\/script|localization-ptbr\.js)[^"']*["'][^>]*)><\/script>/g, "<script defer$1></script>");
  head = deferScripts(head);
  body = deferScripts(body);
  // Imagem principal da página inicial (elemento de maior pintura no celular): baixar primeiro.
  // Seletor de idioma herdado do cabeçalho: sem rótulo, leitores de tela não sabem o que ele é.
  body = body.replace(/<select>/g, '<select aria-label="Idioma">');
  // (só a primeira ocorrência: o carrossel repete os cartões para girar sem fim)
  if (slug === "index" && !body.includes('fetchpriority="high"')) {
    body = body.replace(/<img([^>]*src="\/imagens\/hero\/cafe-moderno-com-cardapio-digital\.webp")/, '<img fetchpriority="high"$1');
  }
  // Nova versão do script de interface (sem as sobrescritas de título e descrição): invalida o cache antigo.
  head = head.replace(/localization-ptbr\.js\?v=[^"']*/g, "localization-ptbr.js?v=20261013-seo");
  body = body.replace(/localization-ptbr\.js\?v=[^"']*/g, "localization-ptbr.js?v=20261013-seo");
  body = mapBodyText(body, translateText);
  body = body.replace(/(<[^>]+\s(?:alt|aria-label|title)=["'])([^"']*)/gi, (m, pre, value) => pre + value.replace(/\bsunday\b/gi, "Kardap"));
  body = body.replace(/href=["']https:\/\/sundayapp\.com\/cookies-2\/?["']/gi, 'href="/cookies"');
  body = body.replace(/(<a\b[^>]*?)\shref=["']https?:\/\/[^"']*sundayapp\.com[^"']*["']([^>]*>)/gi, (m, a, rest) => `${a} href="#"${rest.replace(/\starget=["'][^"']*["']/i, "")}`);
  body = body.replace(/<a\b([^>]*\bclass=["'][^"']*\blogo\b[^"']*["'][^>]*)>[\s\S]*?<\/a>/gi, (m, attrs) => {
    const withClass = /kardap-brand/.test(attrs) ? attrs : attrs.replace(/\bclass=["']([^"']*)["']/i, 'class="$1 kardap-brand"');
    return `<a${withClass}><img class="kardap-brand__full" src="/brand/kardap-logo.png" alt="Kardap"><img class="kardap-brand__mark" src="/brand/kardap-icon-192.png" alt="Kardap"></a>`;
  });
  // Texto próprio das páginas (<main class="kardap-page">): acentos e, na Central de ajuda, as perguntas frequentes.
  body = body.replace(/<main id="content" class="kardap-page">[\s\S]*?<\/main>/i, (main) => {
    let out = mapBodyText(main, (text) => {
      const fixed = accentuate(decode(text));
      return fixed === decode(text) ? text : escText(fixed);
    });
    if (slug === "central-ajuda") {
      out = out.replace(/\s*<!-- kardap-faq:inicio -->[\s\S]*?<!-- kardap-faq:fim -->/, "");
      out = out.replace(/(\n\s*<\/div>\n\s*<\/section>\n<\/main>)$/, `\n      ${faqSection()}$1`);
    }
    return out;
  });
  return before + head + body;
}

let changed = 0;
for (const slug of Object.keys(PAGES)) {
  const file = path.join(PUB, `${slug}.html`);
  const html = fs.readFileSync(file, "utf8");
  // Trabalha com LF e devolve o arquivo com a quebra de linha original (o Git no Windows usa CRLF).
  const crlf = html.includes("\r\n");
  const lf = transform(slug, html.replace(/\r\n/g, "\n"));
  const out = crlf ? lf.replace(/\r?\n/g, "\r\n") : lf;
  if (out !== html) {
    fs.writeFileSync(file, out);
    changed++;
  }
}
console.log(`${changed} página(s) atualizada(s) de ${Object.keys(PAGES).length}.`);

// Mesma lista para o app/sitemap.ts (só as páginas indexáveis entram no sitemap).
const manifest = Object.fromEntries(Object.entries(PAGES).map(([slug, p]) => [slug, { path: p.path || `/${slug}`, title: p.title, index: p.index }]));
fs.mkdirSync(path.join(ROOT, "lib", "seo"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "lib", "seo", "landing-pages.json"), JSON.stringify(manifest, null, 2) + "\n");
