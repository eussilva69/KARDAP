// Auditoria prática da conta demonstrativa (docs/DEMO.md): abre o app num navegador de verdade (Edge/Chrome via CDP),
// entra com a conta demo e percorre painel, pedidos, relatórios, financeiro, mesas, cardápio, QR da mesa, delivery
// completo e restauração, com capturas em celular, tablet e computador.
//
//   node scripts/demo/audit-demo.mjs [pasta-de-capturas]
//
// Por padrão usa o app em http://localhost:3100 apontando para os emuladores (ver docs/TESTES.md). Com
// AUDIT_APP=https://kardapp.online roda contra produção: aí pula os testes que criam contas (isolamento e admin).
// Credenciais da conta demo: DEMO_ACCOUNT_EMAIL / DEMO_ACCOUNT_PASSWORD do .env.local.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEMO_RESTAURANT_ID, DEMO_SLUG } from "../../lib/demo/ids.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "kardap-demo-audit-")));
fs.mkdirSync(OUT, { recursive: true });
const APP = (process.env.AUDIT_APP || "http://localhost:3100").replace(/\/$/, "");
const EMULATOR = !process.env.AUDIT_APP;
const EDGE = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const m of fs.readFileSync(file, "utf8").matchAll(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/gm)) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return out;
}
const env = { ...loadEnv(path.join(ROOT, ".env")), ...loadEnv(path.join(ROOT, ".env.local")), ...process.env };
const EMAIL = env.DEMO_ACCOUNT_EMAIL || "demo@kardapp.online";
const PASSWORD = env.DEMO_ACCOUNT_PASSWORD;
if (!PASSWORD) throw new Error("DEMO_ACCOUNT_PASSWORD ausente no .env.local (rode o seed antes).");

const results = [];
let current = null;
async function test(id, name, fn) {
  try {
    const detail = await fn();
    results.push({ id, name, ok: true, detail: detail || "" });
    console.log(`PASSOU  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push({ id, name, ok: false, detail: error.message });
    console.log(`FALHOU  [${id}] ${name} — ${error.message}`);
    await current?.shot(`falha-${id}`).catch(() => undefined);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ───────── Navegador (CDP) ─────────
const port = 9400 + Math.floor(Math.random() * 90);
const browser = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(OUT, ".edge-" + port)}`, "--no-first-run", "--disable-extensions", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
let ws;
let seq = 0;
const pending = new Map();
const listeners = [];
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  } catch {
    ws = undefined;
    await sleep(500);
  }
}
ws.onmessage = (event) => {
  const m = JSON.parse(event.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else listeners.forEach((l) => l(m));
};

const VIEWPORTS = { celular: { width: 390, height: 844, scale: 2, mobile: true }, tablet: { width: 820, height: 1180, scale: 2, mobile: true }, computador: { width: 1366, height: 900, scale: 1, mobile: false } };

async function newPage(viewport = "computador", contextId) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank", ...(contextId ? { browserContextId: contextId } : {}) });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  const errors = [];
  listeners.push((m) => {
    if (m.sessionId === sessionId && m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description?.split("\n")[0] || m.params.exceptionDetails?.text);
  });
  const evaluate = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const page = {
    errors,
    evaluate,
    async viewport(name) {
      const v = VIEWPORTS[name];
      await s("Emulation.setDeviceMetricsOverride", { width: v.width, height: v.height, deviceScaleFactor: v.scale, mobile: v.mobile });
      await s("Emulation.setTouchEmulationEnabled", { enabled: v.mobile, maxTouchPoints: v.mobile ? 5 : 1 });
    },
    async goto(url) {
      const loaded = new Promise((resolve) => {
        const l = (m) => {
          if (m.sessionId === sessionId && m.method === "Page.loadEventFired") {
            listeners.splice(listeners.indexOf(l), 1);
            resolve();
          }
        };
        listeners.push(l);
      });
      await s("Page.navigate", { url });
      await Promise.race([loaded, sleep(90000)]);
    },
    async waitFor(expr, timeout = 30000, label = expr) {
      const start = Date.now();
      let last;
      while (Date.now() - start < timeout) {
        try {
          last = await evaluate(expr);
          if (last) return last;
        } catch {}
        await sleep(200);
      }
      throw new Error(`tempo esgotado: ${label}`);
    },
    click: (text, selector = "button, a") => evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}) && !b.disabled && b.offsetParent !== null); if (!el) return false; el.click(); return true; })()`),
    async setValue(selector, value) {
      const ok = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error(`campo não encontrado: ${selector}`);
    },
    async shot(name, full = false) {
      const r = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
      fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
    },
    text: () => evaluate("document.body.innerText"),
  };
  await page.viewport(viewport);
  current = page;
  return page;
}

const money = (text) => Number(String(text).replace(/[^\d,]/g, "").replace(",", ".")) || 0;

async function login(page) {
  // O servidor de desenvolvimento pode recompilar e recarregar a página na primeira visita: tenta de novo.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${APP}/login`);
      await page.waitFor(`!!document.querySelector("#auth-email") && !!document.querySelector("#auth-password")`, 60000, "formulário de login");
      await sleep(2500);
      await page.setValue("#auth-email", EMAIL);
      await page.setValue("#auth-password", PASSWORD);
      await page.evaluate(`document.querySelector("form button[type=submit]").click()`);
      await page.waitFor(`location.pathname.startsWith("/dashboard") && !!document.querySelector(".kd-page")`, 60000, "painel depois do login");
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

// ───────── Firestore (emulador) para conferências e isolamento ─────────
const FS = `http://127.0.0.1:8080/v1/projects/demo-kardap/databases/(default)/documents`;
const countOrders = async () => {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-kardap/databases/(default)/documents/restaurantes/${DEMO_RESTAURANT_ID}:runAggregationQuery`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: "pedidos" }] }, aggregations: [{ alias: "n", count: {} }] } }),
  });
  return Number((await r.json())[0]?.result?.aggregateFields?.n?.integerValue || 0);
};
async function emailAccount(email, password) {
  const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const b = await r.json();
  return { token: b.idToken, uid: b.localId };
}

// ───────── Testes ─────────
let deliveryOrderId = "";
const ordersBefore = EMULATOR ? await countOrders() : 0;
const page = await newPage("computador");

await test("A1", "Login com a conta demo e faixa de dados simulados", async () => {
  await login(page);
  await page.waitFor(`document.body.innerText.includes("Brasa & Sabor")`, 30000, "nome do restaurante");
  const strip = await page.evaluate(`document.querySelector(".kd-demo-strip")?.textContent || ""`);
  expect(strip.includes("demonstração"), "faixa de demonstração não apareceu");
  return strip.trim();
});

await test("A2", "Visão geral com vendas calculadas dos pedidos", async () => {
  await page.waitFor(`document.querySelectorAll(".kd-sales-tiles .kd-stat").length === 4`, 30000, "indicadores de vendas");
  const tiles = await page.evaluate(`[...document.querySelectorAll(".kd-sales-tiles .kd-stat")].map(t => t.querySelector(".kd-stat-label").textContent + "=" + t.querySelector(".kd-stat-value").textContent)`);
  const month = money(tiles.find((t) => t.startsWith("Faturamento do mês")));
  expect(month > 0, `faturamento do mês zerado: ${tiles.join(" | ")}`);
  const open = await page.evaluate(`document.querySelector("#kd-sales-open")?.textContent || ""`);
  expect(/em andamento/.test(open), "pedidos em andamento não aparecem");
  await sleep(800);
  await page.shot("01-visao-geral-computador", true);
  return `${tiles.join(" | ")} · ${open}`;
});

await test("A3", "Pedidos: fila em andamento e mudança de status pelo servidor", async () => {
  await page.goto(`${APP}/dashboard/pedidos`);
  await page.waitFor(`document.querySelectorAll(".kd-order-card").length > 0`, 30000, "cartões de pedidos");
  const before = await page.evaluate(`[...document.querySelectorAll(".kd-board-col")].map(c => c.querySelector(".kd-board-title").textContent)`);
  const target = await page.evaluate(`(() => { const card = document.querySelector(".kd-order-card.is-pendente"); return card ? card.querySelector(".kd-order-card-top b").textContent : ""; })()`);
  expect(target, "nenhum pedido recebido para aceitar");
  await page.evaluate(`[...document.querySelector(".kd-order-card.is-pendente").querySelectorAll("button")].find(b => b.textContent.includes("Aceitar")).click()`);
  await page.waitFor(`[...document.querySelectorAll(".kd-order-card.is-confirmado .kd-order-card-top b")].some(b => b.textContent === ${JSON.stringify(target)})`, 20000, "pedido aceito mudou de coluna");
  await page.shot("02-pedidos-fila", true);
  return `${before.join(" · ")} → ${target} aceito`;
});

await test("A4", "Pedidos: histórico com filtros e detalhe do pedido", async () => {
  await page.click("Concluídos");
  await page.waitFor(`document.querySelectorAll(".kd-orders-table tbody tr").length > 10`, 20000, "tabela de concluídos");
  const rows = await page.evaluate(`document.querySelectorAll(".kd-orders-table tbody tr").length`);
  await page.evaluate(`document.querySelector(".kd-orders-table tbody tr .kd-link-button").click()`);
  await page.waitFor(`!!document.querySelector(".kd-order-detail .kd-order-sums .is-total")`, 10000, "detalhe do pedido");
  const total = await page.evaluate(`document.querySelector(".kd-order-detail .is-total dd").textContent`);
  await page.shot("03-pedido-detalhe");
  await page.evaluate(`document.querySelector(".kd-modal [aria-label='Fechar'], .kd-modal button[aria-label^='Fechar']")?.click()`);
  return `${rows} concluídos nos últimos 7 dias; detalhe com total ${total}`;
});

await test("A5", "Relatórios: faturamento por dia, canais, horários e produtos", async () => {
  await page.goto(`${APP}/dashboard/relatorios`);
  await page.waitFor(`document.querySelectorAll(".kd-chart-cols li").length >= 30`, 30000, "gráficos");
  const channels = await page.evaluate(`[...document.querySelectorAll(".kd-bars--money li")].map(li => li.querySelector(".kd-bars-label").firstChild.textContent.trim() + " " + li.querySelector("b").textContent)`);
  const top = await page.evaluate(`[...document.querySelectorAll("#kd-rep-top")].length && [...document.querySelector("#kd-rep-top").closest(".kd-card").querySelectorAll("tbody tr")].map(r => r.cells[0].textContent + " (" + r.cells[3].textContent + ")").slice(0, 3)`);
  expect(channels.length >= 5, "menos de 5 canais com vendas");
  await page.shot("04-relatorios", true);
  return `canais: ${channels.join(", ")} · top: ${top.join(", ")}`;
});

await test("A6", "Financeiro: saldo, carência e vendas online simuladas", async () => {
  await page.goto(`${APP}/dashboard/financeiro`);
  await page.waitFor(`document.querySelectorAll(".kd-fin__balance-grid .kd-card").length === 5`, 30000, "saldos");
  const values = await page.evaluate(`[...document.querySelectorAll(".kd-fin__balance-grid .kd-card")].map(c => c.querySelector(".kd-fin-bal__label").textContent + "=" + c.querySelector(".kd-fin-bal__value").textContent)`);
  const available = money(values.find((v) => v.startsWith("Disponível")));
  expect(available > 0, "nada disponível para saque");
  const rows = await page.evaluate(`document.querySelectorAll(".kd-data-table tbody tr").length`);
  await page.shot("05-financeiro", true);
  return `${values.join(" | ")} · ${rows} vendas online`;
});

await test("A7", "Mesas e QR Codes: 12 mesas com QR funcional", async () => {
  await page.goto(`${APP}/dashboard/qrcodes`);
  await page.waitFor(`document.querySelectorAll("svg").length > 12`, 30000, "QR codes");
  const qrs = await page.evaluate(`document.querySelectorAll(".kd-qr svg, .kd-qr-card svg, [class*=qr] svg").length`);
  await page.shot("06-qrcodes", true);
  await page.goto(`${APP}/dashboard/mesas`);
  // Os nomes aparecem em maiúsculas (CSS): a comparação ignora caixa.
  await page.waitFor(`document.body.innerText.toLowerCase().includes("mesa 12")`, 30000, "lista de mesas");
  const tables = await page.evaluate(`(document.body.innerText.toLowerCase().match(/mesa \\d\\d/g) || []).filter((v, i, a) => a.indexOf(v) === i).length`);
  expect(tables === 12, `${tables} mesas na lista`);
  return `${tables} mesas, ${qrs} QR codes na página`;
});

await test("A8", "Chamados abertos (garçom e pedido de conta)", async () => {
  await page.goto(`${APP}/dashboard/chamados`);
  await page.waitFor(`document.querySelectorAll(".kd-call").length >= 3`, 30000, "chamados");
  const open = await page.evaluate(`[...document.querySelectorAll(".kd-call.is-ativo, .kd-call.is-andamento")].map(c => c.querySelector(".kd-call-table").textContent + ": " + c.querySelector(".kd-call-reason").textContent)`);
  expect(open.some((c) => c.includes("Fechar a conta")), "sem pedido de conta aberto");
  await page.shot("07-chamados");
  return open.join(" | ");
});

// Cardápio público no celular (sessão separada, sem login).
const ctx = (await send("Target.createBrowserContext")).browserContextId;
const phone = await newPage("celular", ctx);
await test("B1", "Cardápio público: categorias, produtos, mídia e aviso discreto", async () => {
  await phone.goto(`${APP}/r/${DEMO_SLUG}`);
  await phone.waitFor(`document.querySelectorAll(".kd-dish").length >= 30`, 60000, "pratos do cardápio");
  await sleep(2500);
  const info = await phone.evaluate(`(() => {
    const imgs = [...document.querySelectorAll("img")].filter(i => i.getBoundingClientRect().top < innerHeight * 3);
    return {
      dishes: document.querySelectorAll(".kd-dish").length,
      sections: document.querySelectorAll(".kd-menu-section, section[aria-labelledby]").length,
      reels: document.querySelectorAll(".kd-reels-rail button, .kd-rail button, [class*=rail] button").length,
      brokenImages: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(0, 80)),
      note: document.querySelector(".kd-menu-demo-note")?.textContent || "",
      camarao: document.body.innerText.includes("Camarão ao Alho"),
      test: /\\b(teste|lorem|placeholder|TODO)\\b/i.test(document.body.innerText),
    };
  })()`);
  expect(info.note, "aviso de demonstração não aparece no rodapé");
  expect(!info.camarao, "produto indisponível aparece no cardápio");
  expect(!info.test, "texto de teste/placeholder visível");
  expect(!info.brokenImages.length, `imagens quebradas: ${info.brokenImages.join(", ")}`);
  await phone.shot("10-cardapio-celular");
  await phone.shot("10-cardapio-celular-inteiro", true);
  return `${info.dishes} pratos, ${info.reels} atalhos de Reels, ${info.brokenImages.length} imagens quebradas`;
});

await test("B2", "Reels: vídeo toca e rola para o próximo", async () => {
  const has = await phone.evaluate(`document.querySelectorAll(".kd-reels-rail button, .kd-dish video, .kd-dish-video-tag").length`);
  expect(has > 0, "nenhum prato com vídeo (rode o seed com mídia)");
  const opened = await phone.evaluate(`(() => { const b = document.querySelector(".kd-reels-rail button, [class*=rail] button"); if (!b) return false; b.click(); return true; })()`);
  expect(opened, "atalho de Reels não encontrado");
  await phone.waitFor(`(() => { const v = document.querySelector('.kd-reel[aria-hidden="false"] video'); return v && v.readyState >= 2 && !v.paused; })()`, 30000, "vídeo do primeiro reel tocando");
  const first = await phone.evaluate(`document.querySelector('.kd-reel[aria-hidden="false"]')?.getAttribute("aria-label")`);
  await phone.shot("11-reels-celular");
  await phone.evaluate(`(() => { const s = document.querySelector(".kd-reels-track, .kd-reels-scroller, [class*=reels] [class*=track]") || document.querySelector('.kd-reel[aria-hidden="false"]').parentElement; s.scrollBy({ top: innerHeight, behavior: "instant" }); })()`);
  await phone.waitFor(`document.querySelector('.kd-reel[aria-hidden="false"]')?.getAttribute("aria-label") !== ${JSON.stringify(first)}`, 15000, "próximo reel");
  await phone.waitFor(`(() => { const v = document.querySelector('.kd-reel[aria-hidden="false"] video'); return v && v.readyState >= 2; })()`, 20000, "vídeo do segundo reel carregado");
  const second = await phone.evaluate(`document.querySelector('.kd-reel[aria-hidden="false"]')?.getAttribute("aria-label")`);
  return `${first} → ${second}`;
});

await test("B3", "QR da mesa: identifica a mesa e o chamado chega ao painel", async () => {
  await phone.goto(`${APP}/r/${DEMO_SLUG}?mesa=demo-mesa-05-bs`);
  await phone.waitFor(`document.body.innerText.includes("Mesa 05")`, 60000, "mesa identificada");
  await sleep(1200);
  expect(await phone.click("Chamar garçom"), "botão Chamar garçom");
  await phone.waitFor(`!!document.querySelector(".kd-sheet-reasons")`, 10000, "opções do chamado");
  await phone.shot("12-mesa-chamado");
  await phone.evaluate(`[...document.querySelectorAll(".kd-sheet button")].find(b => /Chamar agora/.test(b.textContent)).click()`);
  await phone.waitFor(`document.body.innerText.includes("Equipe avisada") || document.body.innerText.includes("avisad")`, 20000, "confirmação do chamado");
  await page.goto(`${APP}/dashboard/chamados`);
  await page.waitFor(`[...document.querySelectorAll(".kd-call.is-ativo .kd-call-table")].some(t => t.textContent === "Mesa 05")`, 20000, "chamado da Mesa 05 no painel");
  return "Mesa 05 → chamado no painel";
});

await test("C1", "Delivery: carrinho, entrega por bairro, Pix e confirmação", async () => {
  await phone.goto(`${APP}/r/${DEMO_SLUG}/delivery`);
  await phone.waitFor(`document.querySelectorAll(".kd-dish").length >= 30`, 60000, "cardápio do delivery");
  await sleep(1500);
  await phone.evaluate(`[...document.querySelectorAll(".kd-dish-open")].find(b => b.textContent.includes("Burger Supreme")).click()`);
  await phone.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.startsWith("Adicionar"))`, 10000, "detalhe do produto");
  await phone.evaluate(`document.querySelector("[aria-label='Aumentar quantidade']").click()`);
  await phone.shot("20-delivery-produto");
  await phone.click("Adicionar");
  await phone.waitFor(`!!document.querySelector(".kd-cart-cta")`, 10000, "botão do carrinho");
  await phone.evaluate(`document.querySelector(".kd-cart-cta").click()`);
  await phone.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Continuar para entrega"))`, 10000, "carrinho");
  await phone.shot("21-delivery-carrinho");
  await phone.click("Continuar para entrega");
  await phone.waitFor(`!!document.querySelector("#kd-co-name")`, 10000, "checkout");
  await phone.setValue("#kd-co-name", "Cliente Demonstração");
  await phone.setValue("#kd-co-phone", "(00) 00000-0000");
  await phone.setValue("#kd-co-cep", "00000-000");
  await phone.setValue("#kd-co-street", "Rua das Acácias");
  await phone.setValue("#kd-co-number", "100");
  await phone.setValue("#kd-co-city", "São Paulo");
  await phone.waitFor(`document.querySelector("#kd-co-district")?.tagName === "SELECT" && document.querySelector("#kd-co-district").options.length > 3`, 15000, "bairros atendidos");
  await phone.setValue("#kd-co-district", "Pinheiros");
  await sleep(1500);
  await phone.evaluate(`[...document.querySelectorAll("input[name=kd-payment]")].find(i => i.value === "pix").click()`);
  await sleep(500);
  await phone.shot("22-delivery-checkout", true);
  const fee = await phone.evaluate(`document.body.innerText.match(/Taxa de entrega[^\\n]*\\n?[^\\n]*/)?.[0] || ""`);
  // O botão fica desabilitado enquanto o frete é recalculado: só clica quando ele libera.
  const submit = `document.querySelector(".kd-menu-bar button[type=submit]")`;
  await phone.waitFor(`${submit} && !${submit}.disabled && ${submit}.textContent.includes("Confirmar pedido")`, 20000, "botão Confirmar pedido habilitado");
  await phone.evaluate(`${submit}.click()`);
  try {
    await phone.waitFor(`document.body.innerText.includes("Pedido recebido")`, 30000, "acompanhamento do pedido");
  } catch (error) {
    const problem = await phone.evaluate(`[...document.querySelectorAll(".kd-sheet-error, .kd-field-error, [role=alert]")].map(e => e.textContent.trim()).filter(Boolean).join(" | ")`);
    throw new Error(`${error.message}${problem ? ` — na tela: ${problem}` : ""}`);
  }
  await phone.shot("23-delivery-acompanhamento");
  return `pedido enviado; ${fee.replace(/\n/g, " ")}`;
});

await test("C2", "Pedido do delivery chega ao painel e o cliente acompanha cada etapa", async () => {
  await page.goto(`${APP}/dashboard/pedidos`);
  await page.waitFor(`[...document.querySelectorAll(".kd-order-card.is-pendente")].some(c => c.textContent.includes("Cliente Demonstração"))`, 30000, "pedido novo no painel");
  const card = `[...document.querySelectorAll(".kd-order-card")].find(c => c.textContent.includes("Cliente Demonstração"))`;
  for (const [label, status] of [["Aceitar", "confirmado"], ["Iniciar preparo", "em_preparo"], ["Marcar pronto", "pronto"], ["Saiu para entrega", "saiu_para_entrega"], ["Entregue", "entregue"]]) {
    await page.waitFor(`!!${card} && [...${card}.querySelectorAll("button")].some(b => b.textContent.includes(${JSON.stringify(label)}) && !b.disabled)`, 20000, `botão ${label}`);
    await page.evaluate(`[...${card}.querySelectorAll("button")].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`);
    if (status !== "entregue") await page.waitFor(`${card}?.classList.contains("is-${status}")`, 20000, `status ${status}`);
    else await page.waitFor(`!${card}`, 20000, "pedido saiu da fila");
  }
  await phone.waitFor(`document.body.innerText.includes("Entregue") && !document.body.innerText.includes("Saiu para entrega\\nAgora")`, 30000, "cliente vê Entregue");
  await phone.shot("24-delivery-entregue");
  return "recebido → aceito → em preparo → pronto → saiu → entregue";
});

if (EMULATOR) {
  await test("D1", "Isolamento: outra conta não lê nem altera pedidos da demo", async () => {
    const other = await emailAccount(`intruso-${Date.now()}@teste.dev`, "Senha-forte-123");
    const read = await fetch(`${FS}/restaurantes/${DEMO_RESTAURANT_ID}/pedidos?pageSize=1`, { headers: { Authorization: `Bearer ${other.token}` } });
    const anyOrder = await (await fetch(`${FS}/restaurantes/${DEMO_RESTAURANT_ID}/pedidos?pageSize=1`, { headers: { Authorization: "Bearer owner" } })).json();
    const orderId = anyOrder.documents?.[0]?.name.split("/").pop();
    const change = await fetch(`${APP}/api/delivery/orders/${orderId}/status`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${other.token}` }, body: JSON.stringify({ restaurantId: DEMO_RESTAURANT_ID, status: "cancelado" }) });
    const reset = await fetch(`${APP}/api/demo/reset`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${other.token}` }, body: "{}" });
    const fin = await fetch(`${APP}/api/financial/restaurant?restaurant_id=${DEMO_RESTAURANT_ID}`, { headers: { Authorization: `Bearer ${other.token}` } });
    const write = await fetch(`${FS}/restaurantes/${DEMO_RESTAURANT_ID}?updateMask.fieldPaths=isDemo`, { method: "PATCH", headers: { "content-type": "application/json", Authorization: `Bearer ${other.token}` }, body: JSON.stringify({ fields: { isDemo: { booleanValue: false } } }) });
    expect(read.status === 403, `leitura de pedidos: ${read.status}`);
    expect(change.status === 403, `troca de status: ${change.status}`);
    expect(reset.status === 403, `restauração: ${reset.status}`);
    expect(fin.status === 403, `financeiro: ${fin.status}`);
    expect(write.status === 403, `alterar isDemo: ${write.status}`);
    return `leitura ${read.status} · status ${change.status} · restaurar ${reset.status} · financeiro ${fin.status} · isDemo ${write.status}`;
  });
}

// Administração (emulador): conta com admins/{uid}, para aprovar/reprovar saques e conferir a receita.
let adminToken = "";
async function ensureAdmin() {
  if (adminToken) return adminToken;
  const admin = await emailAccount(`admin-${Date.now()}@teste.dev`, "Senha-forte-123");
  const r = await fetch(`${FS}/admins/${admin.uid}`, { method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ fields: { email: { stringValue: "admin@teste.dev" } } }) });
  if (!r.ok) throw new Error(`admins: ${r.status}`);
  adminToken = admin.token;
  return adminToken;
}
async function requestWithdrawalInPanel() {
  await page.goto(`${APP}/dashboard/financeiro`);
  await page.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.startsWith("Solicitar") && !b.disabled)`, 30000, "botão de saque habilitado");
  await page.evaluate(`window.confirm = () => true`);
  await page.setValue("input[placeholder^='CPF']", "chave-pix-demonstrativa");
  await page.click("Solicitar");
  await page.waitFor(`document.body.innerText.includes("Solicitação enviada")`, 20000, "saque solicitado");
  const values = await page.evaluate(`Object.fromEntries([...document.querySelectorAll(".kd-fin__balance-grid .kd-card")].map(c => [c.querySelector(".kd-fin-bal__label").textContent, c.querySelector(".kd-fin-bal__value").textContent]))`);
  expect(money(values["Disponível para saque"]) === 0 && money(values["Reservado"]) > 0, `saldo depois do pedido: ${JSON.stringify(values)}`);
  return values;
}
async function decide(action, extra = {}) {
  const token = await ensureAdmin();
  const list = await (await fetch(`${APP}/api/financial/withdrawals?restaurant_id=${DEMO_RESTAURANT_ID}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const target = (list.withdrawals || []).find((w) => w.status === (action === "pay" ? "approved" : "pending_approval"));
  expect(target, `nenhum saque para ${action}: ${JSON.stringify(list).slice(0, 160)}`);
  const r = await fetch(`${APP}/api/financial/withdrawals`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ withdrawal_id: target.id, action, ...extra }) });
  expect(r.ok, `${action}: ${r.status} ${await r.text()}`);
  return target;
}

if (EMULATOR) {
  await test("H1", "Saque simulado: solicitação e reprovação (saldo volta)", async () => {
    const values = await requestWithdrawalInPanel();
    const w = await decide("reject", { reason: "Teste de reprovação na demonstração" });
    await page.goto(`${APP}/dashboard/financeiro`);
    await page.waitFor(`document.querySelectorAll(".kd-fin__balance-grid .kd-card").length === 5`, 30000, "saldos");
    const after = await page.evaluate(`Object.fromEntries([...document.querySelectorAll(".kd-fin__balance-grid .kd-card")].map(c => [c.querySelector(".kd-fin-bal__label").textContent, c.querySelector(".kd-fin-bal__value").textContent]))`);
    expect(money(after["Disponível para saque"]) === w.amount_cents / 100, `saldo não voltou: ${JSON.stringify(after)}`);
    return `reservado ${values["Reservado"]} → reprovado → disponível ${after["Disponível para saque"]}`;
  });

  await test("H2", "Admin: demonstração fora da receita e dos assinantes", async () => {
    const token = await ensureAdmin();
    const restaurants = await (await fetch(`${FS}/restaurantes?pageSize=50`, { headers: { Authorization: "Bearer owner" } })).json();
    const paying = (restaurants.documents || []).filter((d) => !d.name.endsWith(DEMO_RESTAURANT_ID) && d.fields?.subscription?.mapValue?.fields?.status?.stringValue === "active");
    const adminPage = await newPage("computador", (await send("Target.createBrowserContext")).browserContextId);
    await adminPage.goto(`${APP}/login`);
    await adminPage.waitFor(`!!document.querySelector("#auth-email")`, 60000, "login admin");
    await sleep(2500);
    // Mesmo usuário do token (emailAccount): entra pela tela, como a administração faria.
    const email = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).email;
    await adminPage.setValue("#auth-email", email);
    await adminPage.setValue("#auth-password", "Senha-forte-123");
    await adminPage.evaluate(`document.querySelector("form button[type=submit]").click()`);
    await sleep(4000);
    await adminPage.goto(`${APP}/admin`);
    await adminPage.waitFor(`document.body.innerText.includes("Receita mensal")`, 60000, "painel admin");
    await sleep(2000);
    const text = await adminPage.text();
    await adminPage.shot("50-admin");
    current = page;
    const revenue = text.match(/Receita mensal\s*\n?\s*(R\$\s?[\d.,]+)/)?.[1] || "";
    expect(paying.length > 0 || money(revenue) === 0, `receita mensal com a demo: ${revenue}`);
    return `receita mensal ${revenue} (${paying.length} assinantes reais no emulador)`;
  });
}

await test("E1", "Restaurar demonstração volta ao estado inicial", async () => {
  await page.goto(`${APP}/dashboard/configuracoes`);
  await page.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Restaurar demonstração"))`, 30000, "cartão de restauração");
  await page.shot("30-configuracoes-restaurar");
  await page.click("Restaurar demonstração");
  await page.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Restaurar agora"))`, 10000, "confirmação");
  await page.click("Restaurar agora");
  await page.waitFor(`document.body.innerText.includes("Demonstração restaurada")`, 90000, "aviso de restauração");
  if (EMULATOR) {
    const after = await countOrders();
    expect(after === ordersBefore, `pedidos depois de restaurar: ${after} (antes: ${ordersBefore})`);
    return `${after} pedidos simulados (o pedido de teste saiu)`;
  }
  return "restaurado";
});

if (EMULATOR) {
  await test("H3", "Saque simulado: solicitação, aprovação e pagamento registrado", async () => {
    await page.viewport("computador");
    await requestWithdrawalInPanel();
    const w = await decide("approve");
    await decide("pay", { transfer_transaction_id: "SIM-TESTE-0001" });
    await page.goto(`${APP}/dashboard/financeiro`);
    await page.waitFor(`document.querySelectorAll(".kd-fin__balance-grid .kd-card").length === 5`, 30000, "saldos");
    const after = await page.evaluate(`Object.fromEntries([...document.querySelectorAll(".kd-fin__balance-grid .kd-card")].map(c => [c.querySelector(".kd-fin-bal__label").textContent, c.querySelector(".kd-fin-bal__value").textContent]))`);
    expect(money(after["Reservado"]) === 0, `reserva não baixou: ${JSON.stringify(after)}`);
    await page.shot("31-financeiro-depois-do-saque", true);
    return `${(w.amount_cents / 100).toFixed(2)} aprovado e pago (só registro) · já recebido ${after["Já recebido"]}`;
  });
}

for (const vp of ["celular", "tablet"]) {
  await test(`F-${vp}`, `Responsividade do painel (${vp})`, async () => {
    await page.viewport(vp);
    for (const [route, name] of [["/dashboard", "visao-geral"], ["/dashboard/pedidos", "pedidos"], ["/dashboard/relatorios", "relatorios"]]) {
      await page.goto(`${APP}${route}`);
      await page.waitFor(`!!document.querySelector(".kd-page") && document.querySelectorAll(".kd-skeleton, [aria-busy=true]").length === 0`, 30000, `${route} carregada`);
      await sleep(1200);
      const overflow = await page.evaluate(`document.documentElement.scrollWidth - innerWidth`);
      expect(overflow <= 1, `${route}: rolagem horizontal de ${overflow}px`);
      await page.shot(`40-${name}-${vp}`, true);
    }
    return "sem rolagem horizontal";
  });
}

const allErrors = [...page.errors, ...phone.errors].filter(Boolean);
await test("G1", "Sem erros de JavaScript nas páginas", async () => {
  expect(!allErrors.length, allErrors.slice(0, 5).join(" | "));
});

// Deixa a demonstração como estava antes da auditoria (os testes criam pedidos, chamados e saques).
await page.viewport("computador");
await test("Z1", "Restauração final depois dos testes", async () => {
  await page.goto(`${APP}/dashboard/configuracoes`);
  await page.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Restaurar demonstração"))`, 30000, "cartão de restauração");
  await page.click("Restaurar demonstração");
  await page.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Restaurar agora"))`, 10000, "confirmação");
  await page.click("Restaurar agora");
  await page.waitFor(`document.body.innerText.includes("Demonstração restaurada")`, 90000, "aviso de restauração");
});

fs.writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passaram. Capturas: ${OUT}`);
browser.kill();
process.exit(failed.length ? 1 : 0);
