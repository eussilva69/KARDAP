// Aplica o rodapé da Kardap em todas as páginas estáticas da landing (public/*.html).
//
// Uso: node scripts/site-footer.mjs
//
// O que faz em cada página:
//   - troca o bloco <footer id="footer">…</footer> pelo rodapé abaixo;
//   - carrega /kardap-footer.css (uma vez só);
//   - aponta os links de "Planos" para /planos.
// Pode rodar quantas vezes quiser: o resultado é o mesmo.
// O rodapé das páginas do app fica em components/site/site-chrome.tsx; mantenha os dois iguais.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = join(process.cwd(), "public");
const CSS_VERSION = "1";
const WHATSAPP = { href: "https://wa.me/5511932138691" };

const COLUMNS = [
  {
    title: "Produto",
    links: [
      ["Cardápio em vídeo", "/cardapio-video"],
      ["QR Code para mesas", "/qr-code-mesas"],
      ["Cardápio inteligente", "/cardapio-inteligente"],
      ["Gestão do cardápio", "/gestao-cardapio"],
      ["Sua marca no cardápio", "/sua-marca"],
      ["Planos e preços", "/planos"],
    ],
  },
  {
    title: "Conteúdo",
    links: [
      ["Blog", "/blog"],
      ["Dicas para restaurantes", "/dicas-restaurantes"],
      ["Materiais", "/materiais"],
      ["Novidades", "/novidades"],
    ],
  },
  {
    title: "Kardap",
    links: [
      ["Sobre a Kardap", "/sobre"],
      ["Para restaurantes", "/para-restaurantes"],
      ["Parceiros", "/parceiros"],
    ],
  },
  {
    title: "Atendimento",
    links: [
      ["Central de ajuda", "/central-ajuda"],
      ["(11) 93213-8691", "tel:+5511932138691"],
      ["Entrar no painel", "/login"],
    ],
  },
];

const LEGAL = [
  ["Privacidade", "/privacidade"],
  ["Termos de Uso", "/termos"],
  ["Cookies", "/cookies"],
];

const CHAT_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const link = ([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`;

const footer = `<footer id="footer" class="kf">
  <div class="kf-wrap">
    <section class="kf-cta" aria-labelledby="kf-cta-title">
      <div class="kf-cta-copy">
        <p class="kf-cta-kicker">30 dias grátis, escolha o plano</p>
        <h2 class="kf-cta-title" id="kf-cta-title">Seu cardápio na mesa ainda hoje</h2>
        <p class="kf-cta-text">Cadastre os pratos com fotos e vídeos, imprima um QR Code por mesa e receba os chamados do salão em tempo real.</p>
        <div class="kf-cta-actions">
          <a class="kf-btn kf-btn--primary" href="/criar-conta">Criar conta grátis</a>
          <a class="kf-btn kf-btn--ghost" href="/planos">Ver planos e preços</a>
        </div>
        <p class="kf-cta-note">Sem cartão de crédito e sem fidelidade.</p>
      </div>
      <img class="kf-cta-media" src="/imagens/display-cardapio-kardap.webp" width="720" height="658" loading="lazy" decoding="async" alt="Display de mesa da Kardap com QR Code para abrir o cardápio digital">
    </section>

    <div class="kf-main">
      <div class="kf-brand">
        <a class="kf-logo" href="/" aria-label="Kardap, página inicial"><img src="/brand/kardap-logo.png" width="140" height="50" alt=""></a>
        <p>Cardápio digital com vídeo, QR Code por mesa e chamados de garçom em tempo real.</p>
        <a class="kf-contact" href="${WHATSAPP.href}" target="_blank" rel="noopener">${CHAT_ICON}<span>Falar no WhatsApp</span></a>
      </div>
${COLUMNS.map(
  (col, i) => `      <nav class="kf-col" aria-labelledby="kf-col-${i}">
        <h2 class="kf-col-title" id="kf-col-${i}">${esc(col.title)}</h2>
        <ul>${col.links.map(link).join("")}</ul>
      </nav>`,
).join("\n")}
    </div>

    <div class="kf-bottom">
      <p>© ${new Date().getFullYear()} Kardap</p>
      <ul class="kf-legal" aria-label="Documentos legais">${LEGAL.map(link).join("")}</ul>
    </div>
  </div>
</footer>`;

const CSS_LINK = `<link rel="stylesheet" href="/kardap-footer.css?v=${CSS_VERSION}">`;
let pages = 0;
for (const file of readdirSync(PUBLIC).filter((f) => f.endsWith(".html"))) {
  const path = join(PUBLIC, file);
  let html = readFileSync(path, "utf8");
  const start = html.indexOf('<footer id="footer"');
  if (start < 0) {
    console.log(`  sem rodapé, mantida: ${file}`);
    continue;
  }
  const end = html.indexOf("</footer>", start) + "</footer>".length;
  html = html.slice(0, start) + footer + html.slice(end);
  html = html.replace(/<link rel="stylesheet" href="\/kardap-footer\.css[^"]*">\n?/g, "");
  html = html.replace("</head>", `${CSS_LINK}\n</head>`);
  html = html.split('href="/#planos"').join('href="/planos"');
  writeFileSync(path, html);
  pages++;
}
console.log(`Rodapé aplicado em ${pages} páginas.`);
