// Testes de ponta a ponta do KARDAP contra os emuladores do Firebase (Auth, Firestore, Storage),
// com as regras do repositório. Duas abas reais (painel e cardápio) e um segundo estabelecimento.
//
// Pré-requisitos (ver docs/TESTES.md):
//   1. emuladores rodando:  firebase emulators:start --only auth,firestore,storage --project demo-kardap
//   2. app apontando para eles:  NEXT_PUBLIC_FIREBASE_EMULATORS=1 (+ variáveis demo) npx next dev -p 3100
// Uso: node scripts/e2e-emulators.mjs [pasta-de-capturas]
// Navegador: BROWSER_PATH (padrão: Microsoft Edge no Windows). Usa imagens reais que já estão no repositório.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "kardap-e2e-")));
const FILES = {
  logo: path.join(ROOT, "design", "originais", "Display de Cardápio Digital KARDAP.png"), // PNG com transparência
  photo: path.join(ROOT, "LP KARDAP", "imagens", "sessao A Kardap transforma", "Cumprimento no Café Ensoralado.png"), // foto horizontal grande
  vertical: path.join(ROOT, "LP KARDAP", "imagens", "carrossel hero", "Café moderno com cardápio digital.png"), // foto vertical
  small: path.join(ROOT, "public", "brand", "salao-noite.jpg"), // JPG pequeno
  webp: path.join(ROOT, "public", "imagens", "hero", "kardap-pedido-confirmado-no-bistro.webp"),
};
const APP = "http://localhost:3100";
const PROJECT = "demo-kardap";
const BUCKET = "demo-kardap.appspot.com";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const EDGE = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (id, name, ok, detail = "") => {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASSOU" : "FALHOU"}  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
};

// ───────── Navegador (CDP com sessões por aba) ─────────
const port = 9400 + Math.floor(Math.random() * 400);
const browserProc = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve(OUT, ".edge-e2e-" + port)}`, "--no-first-run", "--disable-extensions", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
async function getJson(url) {
  for (let i = 0; i < 80; i++) {
    try {
      return await (await fetch(url)).json();
    } catch {
      await sleep(250);
    }
  }
  throw new Error("devtools indisponível");
}
const version = await getJson(`http://127.0.0.1:${port}/json/version`);
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) listeners.forEach((l) => l(msg));
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

async function newPage(contextId) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank", ...(contextId ? { browserContextId: contextId } : {}) });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  const errors = [];
  listeners.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description?.split("\n")[0]);
  });
  const evaluate = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const page = {
    sessionId,
    errors,
    evaluate,
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
      await Promise.race([loaded, sleep(30000)]);
    },
    async waitFor(expr, timeout = 20000, label = expr) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const v = await evaluate(expr);
          if (v) return v;
        } catch {}
        await sleep(200);
      }
      throw new Error(`tempo esgotado esperando: ${label}`);
    },
    // Preenche um campo pelo texto do rótulo (como uma pessoa faria), disparando o evento do React.
    async fill(label, value) {
      const ok = await evaluate(`(() => {
        const lab = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)}));
        const el = lab && (document.getElementById(lab.htmlFor) || lab.querySelector("input,textarea"));
        if (!el) return false;
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error(`campo não encontrado: ${label}`);
    },
    async click(text, selector = "button, a") {
      const ok = await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}) && !b.disabled); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error(`botão não encontrado: ${text}`);
    },
    async files(selector, paths) {
      const { root } = await s("DOM.getDocument", { depth: -1, pierce: true });
      const { nodeId } = await s("DOM.querySelector", { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`input não encontrado: ${selector}`);
      await s("DOM.setFileInputFiles", { nodeId, files: paths });
    },
    async shot(name) {
      const r = await s("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
    },
    offline: (on) => s("Network.emulateNetworkConditions", { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
    networkEnable: () => s("Network.enable"),
  };
  return page;
}

// ───────── Emuladores (verificação independente do app) ─────────
const admin = { Authorization: "Bearer owner" }; // credencial de administrador do emulador (ignora regras)
async function fsGet(docPath, token) {
  const r = await fetch(`${FS}/${docPath}`, { headers: token ? { Authorization: `Bearer ${token}` } : admin });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function fsPatch(docPath, fields, mask, token) {
  const q = mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&");
  const r = await fetch(`${FS}/${docPath}?${q}`, { method: "PATCH", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ fields }) });
  return r.status;
}
async function signIn(email, password) {
  const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  return (await r.json()).idToken;
}
async function storageList(prefix) {
  const r = await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`, { headers: admin });
  const body = await r.json();
  return (body.items || []).map((i) => i.name);
}
async function storageMeta(name) {
  const r = await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent(name)}`, { headers: admin });
  return r.json();
}
async function restaurantOf(uid) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST",
    headers: { "content-type": "application/json", ...admin },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "restaurantes" }], where: { fieldFilter: { field: { fieldPath: "ownerId" }, op: "EQUAL", value: { stringValue: uid } } }, limit: 1 } }),
  });
  const rows = await r.json();
  const doc = rows.find((x) => x.document)?.document;
  return doc ? { id: doc.name.split("/").pop(), fields: doc.fields } : null;
}
const str = (f, k) => f?.[k]?.stringValue;
const mapField = (f, k) => f?.[k]?.mapValue?.fields || {};

// ───────── Fluxos do app ─────────
async function signupAndOnboard(page, { name, email, password, restaurant, logo, cover }) {
  await page.goto(`${APP}/criar-conta`);
  await page.waitFor(`["Seu nome", "E-mail", "Senha"].every(t => [...document.querySelectorAll("label")].some(l => l.textContent.trim() === t))`, 30000, "formulário de cadastro");
  await sleep(1500); // hidratação do React
  await page.fill("Seu nome", name);
  await page.fill("E-mail", email);
  await page.fill("Senha", password);
  await page.evaluate(`(() => { const box = [...document.querySelectorAll("input[type=checkbox]")].find(c => c.closest("label")?.textContent.includes("Termos")); if (box && !box.checked) box.click(); return !!box; })()`);
  await page.evaluate(`document.querySelector("form button[type=submit]").click()`);
  await page.waitFor(`location.pathname === "/onboarding" && !!document.querySelector(".kd-onb, .kd-onb-card, form, main")`, 45000, "onboarding");
  // Etapa 1: escolha do plano a testar grátis por 30 dias (docs/PLANOS.md). O Pro já vem pré-selecionado.
  await page.waitFor(`document.querySelectorAll(".kd-onb-plan").length === 3`, 45000, "etapa 1 (escolha de plano)");
  await page.click("Continuar");
  await page.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Nome do estabelecimento"))`, 45000, "etapa 2");
  await page.fill("Nome do estabelecimento", restaurant);
  await sleep(400);
  await page.click("Continuar");
  await page.waitFor(`document.querySelectorAll(".kd-onb-upload input[type=file]").length === 2`, 30000, "etapa 3 (marca)");
  if (logo) {
    await page.files(".kd-onb-upload input[type=file]", [logo]);
    await page.waitFor(`document.querySelector(".kd-onb-upload b")?.textContent.includes("Trocar logo")`, 60000, "logo enviada no onboarding");
  }
  if (cover) {
    const { root } = { root: null };
    void root;
    await page.evaluate(`window.__coverInput = document.querySelectorAll(".kd-onb-upload input[type=file]")[1]; window.__coverInput.setAttribute("data-e2e-cover", "1"); true`);
    await page.files("input[data-e2e-cover]", [cover]);
    await page.waitFor(`[...document.querySelectorAll(".kd-onb-upload b")].some(b => b.textContent.includes("Trocar foto de capa"))`, 60000, "capa enviada no onboarding");
  }
  await page.click("Continuar");
  await page.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Link de avaliação"))`, 30000, "etapa 4");
  await page.click("Continuar");
  await page.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Quantidade de mesas"))`, 30000, "etapa 5");
  await page.fill("Quantidade de mesas", "2");
  await sleep(300);
  await page.click("Continuar");
  await page.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Concluir e abrir o painel"))`, 30000, "etapa 6");
  await page.click("Concluir e abrir o painel");
  await page.waitFor(`location.pathname.startsWith("/dashboard") && !!document.querySelector(".kd-side, .kd-main")`, 60000, "painel");
}

const menuButtons = `[...document.querySelectorAll(".kd-menu-bar button")].map(b => b.textContent.trim())`;

try {
  const stamp = Date.now();
  const A = { name: "Dona Ana", email: `ana.${stamp}@teste.local`, password: "senha-forte-123", restaurant: `Cantina Ana ${stamp % 10000}`, logo: FILES.logo, cover: FILES.photo };
  const B = { name: "Dono Bruno", email: `bruno.${stamp}@teste.local`, password: "senha-forte-456", restaurant: `Bistro Bruno ${stamp % 10000}` };

  // ── Estabelecimento A: cadastro, onboarding e imagens ──
  const ctxA = (await send("Target.createBrowserContext")).browserContextId;
  const panel = await newPage(ctxA);
  await signupAndOnboard(panel, A);
  const uidA = await panel.evaluate(`localStorage.getItem("kardap-restaurant-owner")`);
  const restA = await restaurantOf(uidA);
  if (!restA) throw new Error("restaurante A não encontrado no Firestore");
  const brandA = mapField(restA.fields, "brand");
  const slugA = str(restA.fields, "slug");

  // Teste A — imagens convertidas, no Storage e no Firestore
  const filesA = await storageList(`restaurantes/${restA.id}/`);
  const logoPath = filesA.find((n) => /\/logos\/logo-[a-z0-9]{16}\.(webp|png|jpg)$/.test(n));
  const coverPath = filesA.find((n) => /\/capas\/capa-[a-z0-9]{16}\.(webp|png|jpg)$/.test(n));
  const logoMeta = logoPath ? await storageMeta(logoPath) : {};
  const coverMeta = coverPath ? await storageMeta(coverPath) : {};
  record("A", "Logo PNG convertida para WebP e salva no Storage", logoMeta.contentType === "image/webp", `${logoPath} · ${logoMeta.contentType} · ${logoMeta.size} B (original ${fs.statSync(A.logo).size} B) · cache "${logoMeta.cacheControl}"`);
  record("A", "Capa (foto PNG) convertida para WebP e salva no Storage", coverMeta.contentType === "image/webp", `${coverPath} · ${coverMeta.size} B (original ${fs.statSync(A.cover).size} B)`);
  record("A", "Firestore guarda as URLs (principal e pequena), sem Base64", Boolean(str(brandA, "logo")?.startsWith("http") && str(brandA, "logoSmall")?.startsWith("http") && str(brandA, "cover")?.startsWith("http") && str(brandA, "coverSmall")?.startsWith("http")) && !JSON.stringify(restA.fields).includes("base64"), `brand: logo, logoSmall, cover, coverSmall`);

  const pub = await newPage(); // visitante anônimo (outro contexto: sem a sessão da dona)
  await pub.goto(`${APP}/r/${slugA}`);
  await pub.waitFor(`!!document.querySelector(".kd-menu-name")`, 40000, "cardápio público A");
  const shown = await pub.evaluate(`({ logo: document.querySelector(".kd-menu-logo img")?.getAttribute("src"), srcset: document.querySelector(".kd-menu-cover img")?.getAttribute("srcset") })`);
  record("A", "Cardápio público exibe a logo (versão pequena) e a capa (srcset 960/1920)", shown.logo === str(brandA, "logoSmall") && shown.srcset?.includes(str(brandA, "coverSmall")) && shown.srcset?.includes(str(brandA, "cover")), "");
  const logoLoaded = await pub.waitFor(`(() => { const i = document.querySelector(".kd-menu-logo img"); return i && i.complete && i.naturalWidth > 0 ? i.naturalWidth + "x" + i.naturalHeight : false; })()`, 20000, "logo carregada");
  record("A", "Imagem servida pelo Storage e decodificada no navegador", Boolean(logoLoaded), `logo ${logoLoaded}`);
  await pub.shot("e2e-01-cardapio-A");

  // Teste C — Chamar garçom com o cardápio aberto em outra aba
  await panel.goto(`${APP}/dashboard/configuracoes`);
  await panel.waitFor(`[...document.querySelectorAll(".kd-switch-row")].some(r => r.textContent.includes("Chamar garçom"))`, 30000, "configurações");
  const before = await pub.evaluate(menuButtons);
  record("C", "Estado inicial: botão Chamar garçom visível", before.some((t) => t.includes("Chamar garçom")), JSON.stringify(before));
  const toggle = (label) => panel.evaluate(`[...document.querySelectorAll(".kd-switch-row")].find(r => r.textContent.includes(${JSON.stringify(label)})).querySelector("input").click()`);
  let t0 = Date.now();
  await toggle("Chamar garçom");
  await pub.waitFor(`!${menuButtons}.some(t => t.includes("Chamar garçom"))`, 15000, "botão sumir no cardápio aberto");
  record("C", "Desativado no painel → botão some do cardápio já aberto, sem recarregar", true, `${Date.now() - t0} ms`);
  const toastOff = await panel.waitFor(`document.querySelector(".kd-toast")?.textContent || false`, 10000, "aviso");
  record("C", "Aviso no painel só depois da confirmação do Firestore", toastOff.includes("Chamar garçom: desativado"), toastOff);
  await pub.shot("e2e-02-cardapio-sem-garcom");
  t0 = Date.now();
  await toggle("Chamar garçom");
  await pub.waitFor(`${menuButtons}.some(t => t.includes("Chamar garçom"))`, 15000, "botão voltar");
  record("C", "Reativado → botão volta ao cardápio aberto", true, `${Date.now() - t0} ms`);

  // Outras opções em tempo real: link do Google + botão de avaliação, paleta
  await panel.goto(`${APP}/dashboard/avaliacoes`);
  await panel.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Link"))`, 30000, "avaliações");
  await panel.evaluate(`(() => { const el = document.querySelector("input[type=url], input[inputmode=url], form input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "https://g.page/r/teste-kardap/review"); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  await panel.evaluate(`document.querySelector("form button[type=submit]").click()`);
  await pub.waitFor(`!!document.querySelector(".kd-menu-review")`, 15000, "botão Avaliar no Google");
  record("C", "Link do Google salvo → botão Avaliar no Google aparece no cardápio aberto", true, await pub.evaluate(`document.querySelector(".kd-menu-review").href`));
  await panel.goto(`${APP}/dashboard/personalizacao`);
  await panel.waitFor(`!!document.querySelector("input[value=brasa]")`, 30000, "paletas");
  const bgBefore = await pub.evaluate(`getComputedStyle(document.body).backgroundColor`);
  await panel.evaluate(`document.querySelector("input[value=brasa]").click()`);
  const bgAfter = await pub.waitFor(`(() => { const c = getComputedStyle(document.body).backgroundColor; return c !== ${JSON.stringify(bgBefore)} ? c : false; })()`, 15000, "paleta no cardápio");
  record("C", "Paleta escolhida no painel → cores mudam no cardápio aberto", true, `${bgBefore} → ${bgAfter}`);
  await pub.shot("e2e-03-cardapio-paleta-brasa");

  // Teste B — trocar a capa com o cardápio aberto; arquivo antigo removido depois
  const oldCover = await pub.evaluate(`document.querySelector(".kd-menu-cover img").getAttribute("src")`);
  await panel.evaluate(`document.querySelectorAll(".kd-upload-row input[type=file]")[1].setAttribute("data-e2e-cover", "1"); true`);
  await panel.files(".kd-upload-row input[data-e2e-cover]", [FILES.vertical]);
  t0 = Date.now();
  const newCover = await pub.waitFor(`(() => { const s = document.querySelector(".kd-menu-cover img")?.getAttribute("src"); return s && s !== ${JSON.stringify(oldCover)} ? s : false; })()`, 60000, "capa nova no cardápio aberto");
  record("B", "Capa substituída aparece no cardápio já aberto, sem recarregar (URL nova, sem cache antigo)", newCover !== oldCover, `${Date.now() - t0} ms após escolher o arquivo`);
  await pub.waitFor(`(() => { const i = document.querySelector(".kd-menu-cover img"); return i.complete && i.naturalWidth > 0; })()`, 20000, "capa nova carregada");
  await pub.shot("e2e-04-cardapio-capa-nova");
  const toastCover = await panel.waitFor(`document.querySelector(".kd-toast")?.textContent || false`, 10000, "aviso da capa");
  record("B", "Aviso da capa com o resultado real da otimização", /Capa atualizada no cardápio · .* → .* · WebP/.test(toastCover), toastCover);
  console.log("   … aguardando a limpeza da capa antiga (20 s)");
  await sleep(24000);
  const filesAfter = await storageList(`restaurantes/${restA.id}/capas/`);
  const oldCoverPath = decodeURIComponent(/\/o\/([^?]+)/.exec(oldCover)[1]);
  record("B", "Arquivo da capa antiga removido do Storage depois de gravada a nova", !filesAfter.includes(oldCoverPath) && filesAfter.length === 2, filesAfter.join(", "));

  // Teste G — foto de produto e exibição de categorias/produtos em tempo real
  const PROD = "Pizza Margherita E2E";
  await panel.goto(`${APP}/dashboard/categorias`);
  await panel.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Nova categoria"))`, 30000, "categorias");
  await panel.click("Nova categoria");
  await panel.waitFor(`!!document.querySelector("#kd-category-form")`, 10000, "formulário de categoria");
  await sleep(300);
  await panel.fill("Nome", "Pizzas");
  await panel.evaluate(`document.querySelector("#kd-category-form").requestSubmit()`);
  await panel.waitFor(`!document.querySelector("#kd-category-form")`, 15000, "categoria criada");
  await panel.goto(`${APP}/dashboard/produtos`);
  await panel.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Novo produto"))`, 30000, "produtos");
  await panel.click("Novo produto");
  await panel.waitFor(`!!document.querySelector("#kd-product-form")`, 10000, "formulário de produto");
  await sleep(300);
  await panel.fill("Nome", PROD);
  await panel.fill("Preço", "4990");
  await panel.evaluate(`(() => { const lab = [...document.querySelectorAll("label")].find(l => l.textContent.trim() === "Categoria"); const sel = document.getElementById(lab.htmlFor); const opt = [...sel.options].find(o => o.textContent === "Pizzas"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, opt.value); sel.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await panel.files(`input[type=file][accept*="image/jpeg"]`, [FILES.photo]);
  const note = await panel.waitFor(`(() => { const t = document.querySelector(".kd-drop small")?.textContent || ""; return t.startsWith("Otimizada") ? t : false; })()`, 30000, "foto otimizada no formulário");
  t0 = Date.now();
  await panel.evaluate(`document.querySelector("#kd-product-form").requestSubmit()`);
  await panel.waitFor(`!document.querySelector("#kd-product-form")`, 60000, "produto salvo");
  await pub.waitFor(`[...document.querySelectorAll(".kd-dish-name")].some(n => n.textContent.includes(${JSON.stringify(PROD)}))`, 20000, "produto no cardápio aberto");
  record("G", "Produto com foto criado no painel aparece no cardápio já aberto", true, `${note} · ${Date.now() - t0} ms do salvar até aparecer`);
  const prodQuery = await fetch(`${FS}/restaurantes/${restA.id}:runQuery`, { method: "POST", headers: { "content-type": "application/json", ...admin }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "produtos" }], where: { fieldFilter: { field: { fieldPath: "name" }, op: "EQUAL", value: { stringValue: PROD } } } } }) }).then((r) => r.json());
  const prodDoc = prodQuery.find((x) => x.document)?.document;
  const prodId = prodDoc.name.split("/").pop();
  const pf = prodDoc.fields;
  const meta = pf.imageMeta?.mapValue?.fields || {};
  // O emulador do Storage só filtra prefixo por pasta: lista a pasta e filtra pelo produto.
  const prodFiles = (await storageList(`restaurantes/${restA.id}/produtos/imagens/`)).filter((n) => n.includes(`/${prodId}-`));
  const prodTypes = await Promise.all(prodFiles.map(async (n) => (await storageMeta(n)).contentType));
  record("G", "Foto do produto em WebP (principal + miniatura) no Storage, com URLs e metadados no Firestore", prodFiles.length === 2 && prodTypes.every((t) => t === "image/webp") && str(pf, "image")?.startsWith("http") && str(pf, "imageThumb")?.startsWith("http") && meta.format?.stringValue === "webp", `${prodFiles.map((n) => n.split("/").pop()).join(", ")} · ${meta.width?.integerValue}x${meta.height?.integerValue} · ${meta.size?.integerValue} B de ${meta.originalSize?.integerValue} B`);
  const listSrc = await pub.evaluate(`(() => { const row = [...document.querySelectorAll(".kd-dish")].find(r => r.textContent.includes(${JSON.stringify(PROD)})); return row?.querySelector(".kd-dish-media img")?.getAttribute("src"); })()`);
  record("G", "Lista do cardápio usa a miniatura (não a foto de 1200 px)", listSrc === str(pf, "imageThumb"), "");
  await pub.shot("e2e-08-cardapio-produto");

  // Trocar a foto: cardápio aberto atualiza e os arquivos antigos saem do Storage
  await panel.evaluate(`document.querySelector(${JSON.stringify(`[aria-label="Editar ${PROD}"]`)}).click()`);
  await panel.waitFor(`!!document.querySelector("#kd-product-form")`, 10000, "editar produto");
  await panel.files(`input[type=file][accept*="image/jpeg"]`, [FILES.vertical]);
  await panel.waitFor(`(document.querySelector(".kd-drop small")?.textContent || "").startsWith("Otimizada")`, 30000, "nova foto otimizada");
  await panel.evaluate(`document.querySelector("#kd-product-form").requestSubmit()`);
  await panel.waitFor(`!document.querySelector("#kd-product-form")`, 60000, "produto atualizado");
  await pub.waitFor(`(() => { const row = [...document.querySelectorAll(".kd-dish")].find(r => r.textContent.includes(${JSON.stringify(PROD)})); const s = row?.querySelector(".kd-dish-media img")?.getAttribute("src"); return s && s !== ${JSON.stringify(listSrc)}; })()`, 20000, "foto nova no cardápio aberto");
  await sleep(2500);
  const prodFiles2 = (await storageList(`restaurantes/${restA.id}/produtos/imagens/`)).filter((n) => n.includes(`/${prodId}-`));
  record("G", "Foto substituída: cardápio aberto atualiza e os arquivos antigos saem do Storage", prodFiles2.length === 2 && !prodFiles2.some((n) => prodFiles.includes(n)), prodFiles2.map((n) => n.split("/").pop()).join(", "));

  // Ocultar produto e categoria
  await panel.evaluate(`document.querySelector(${JSON.stringify(`[aria-label="${PROD} no cardápio"]`)}).click()`);
  await pub.waitFor(`![...document.querySelectorAll(".kd-dish-name")].some(n => n.textContent.includes(${JSON.stringify(PROD)}))`, 15000, "produto oculto some do cardápio");
  record("G", "Produto desligado (\"No cardápio\") some do cardápio aberto", true);
  await panel.evaluate(`document.querySelector(${JSON.stringify(`[aria-label="${PROD} no cardápio"]`)}).click()`);
  await pub.waitFor(`[...document.querySelectorAll(".kd-dish-name")].some(n => n.textContent.includes(${JSON.stringify(PROD)}))`, 15000, "produto volta");
  await panel.goto(`${APP}/dashboard/categorias`);
  await panel.waitFor(`!!document.querySelector("[aria-label^='Editar Pizzas']")`, 30000, "categoria na lista");
  await panel.evaluate(`document.querySelector("[aria-label^='Editar Pizzas']").click()`);
  await panel.waitFor(`!!document.querySelector("#kd-category-form")`, 10000, "editar categoria");
  await panel.evaluate(`[...document.querySelectorAll(".kd-switch-row")].find(r => r.textContent.includes("Visível no cardápio")).querySelector("input").click()`);
  await panel.evaluate(`document.querySelector("#kd-category-form").requestSubmit()`);
  await pub.waitFor(`![...document.querySelectorAll(".kd-dish-name")].some(n => n.textContent.includes(${JSON.stringify(PROD)}))`, 15000, "categoria oculta some do cardápio");
  record("G", "Categoria ocultada some (com seus produtos) do cardápio aberto", true);

  // Teste D — persistência: recarregar, sair e entrar
  await panel.goto(`${APP}/dashboard/configuracoes`);
  await panel.waitFor(`[...document.querySelectorAll(".kd-switch-row")].some(r => r.textContent.includes("Chamar garçom"))`, 30000, "configurações após recarregar");
  await toggle("Pedir a conta");
  await panel.waitFor(`document.querySelector(".kd-toast")?.textContent.includes("Pedir a conta: desativado")`, 10000, "aviso pedir a conta");
  await pub.waitFor(`!${menuButtons}.some(t => t.includes("Pedir a conta"))`, 15000, "pedir a conta some do cardápio");
  await panel.goto(`${APP}/dashboard/configuracoes`);
  await panel.waitFor(`[...document.querySelectorAll(".kd-switch-row")].some(r => r.textContent.includes("Pedir a conta"))`, 30000, "configurações");
  const statesReload = await panel.evaluate(`Object.fromEntries([...document.querySelectorAll(".kd-switch-row")].map(r => [r.querySelector("b").textContent, r.querySelector("input").checked]))`);
  record("D", "Após recarregar: configurações vêm do Firestore", statesReload["Pedir a conta"] === false && statesReload["Chamar garçom"] === true, JSON.stringify(statesReload));
  await panel.evaluate(`document.querySelector("[aria-label='Sair da conta']").click()`);
  await panel.waitFor(`location.pathname === "/" || location.pathname === "/index.html"`, 30000, "saída da conta");
  const leftovers = await panel.evaluate(`["kardap-brand", "kardap-settings", "kardap-restaurant-id"].filter(k => localStorage.getItem(k))`);
  record("D", "Ao sair, dados do estabelecimento não ficam no navegador", leftovers.length === 0, leftovers.join(", ") || "nenhum");
  await panel.goto(`${APP}/login`);
  await panel.waitFor(`["E-mail", "Senha"].every(t => [...document.querySelectorAll("label")].some(l => l.textContent.trim() === t))`, 30000, "login");
  await sleep(1500);
  await panel.fill("E-mail", A.email);
  await panel.fill("Senha", A.password);
  await panel.evaluate(`document.querySelector("form button[type=submit]").click()`);
  await panel.waitFor(`location.pathname.startsWith("/dashboard")`, 60000, "painel após login");
  await panel.goto(`${APP}/dashboard/configuracoes`);
  await panel.waitFor(`[...document.querySelectorAll(".kd-switch-row")].some(r => r.textContent.includes("Pedir a conta"))`, 30000, "configurações após login");
  const statesLogin = await panel.evaluate(`Object.fromEntries([...document.querySelectorAll(".kd-switch-row")].map(r => [r.querySelector("b").textContent, r.querySelector("input").checked]))`);
  record("D", "Após sair e entrar de novo: configurações preservadas", statesLogin["Pedir a conta"] === false && statesLogin["Chamar garçom"] === true, JSON.stringify(statesLogin));
  await panel.goto(`${APP}/dashboard/personalizacao`);
  await panel.waitFor(`!!document.querySelector("input[value=brasa]")`, 30000, "personalização após login");
  const persisted = await panel.evaluate(`({ paleta: document.querySelector(".kd-pal.is-selected .kd-pal-name")?.textContent, logo: document.querySelector(".kd-upload-row img")?.getAttribute("src")?.includes("logo-") })`);
  record("D", "Após login: paleta e logo preservadas", persisted.paleta?.includes("Brasa") && persisted.logo === true, JSON.stringify(persisted));
  await panel.shot("e2e-05-painel-apos-login");

  // Teste E — segundo estabelecimento, isolado
  const ctxB = (await send("Target.createBrowserContext")).browserContextId;
  const panelB = await newPage(ctxB);
  await signupAndOnboard(panelB, B);
  const uidB = await panelB.evaluate(`localStorage.getItem("kardap-restaurant-owner")`);
  const restB = await restaurantOf(uidB);
  const tokenB = await signIn(B.email, B.password);
  const patchStatus = await fsPatch(`restaurantes/${restA.id}`, { settings: { mapValue: { fields: { waiter: { booleanValue: false } } } } }, ["settings"], tokenB);
  record("E", "Dono B não consegue alterar as configurações do restaurante A (regras do Firestore)", patchStatus === 403, `HTTP ${patchStatus}`);
  const upload = await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o?name=${encodeURIComponent(`restaurantes/${restA.id}/logos/logo-invasorinvasor1.webp`)}`, { method: "POST", headers: { Authorization: `Firebase ${tokenB}`, "content-type": "image/webp" }, body: fs.readFileSync(FILES.webp) });
  record("E", "Dono B não consegue enviar arquivo para a pasta do restaurante A (regras do Storage)", upload.status === 403, `HTTP ${upload.status}`);
  const delStatus = (await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent(logoPath)}`, { method: "DELETE", headers: { Authorization: `Firebase ${tokenB}` } })).status;
  record("E", "Dono B não consegue apagar a logo do restaurante A", delStatus === 403, `HTTP ${delStatus}`);
  await panelB.goto(`${APP}/dashboard/configuracoes`);
  await panelB.waitFor(`[...document.querySelectorAll(".kd-switch-row")].some(r => r.textContent.includes("Chamar garçom"))`, 30000, "configurações B");
  await panelB.evaluate(`[...document.querySelectorAll(".kd-switch-row")].find(r => r.textContent.includes("Chamar garçom")).querySelector("input").click()`);
  await panelB.waitFor(`document.querySelector(".kd-toast")?.textContent.includes("Chamar garçom: desativado")`, 10000, "aviso B");
  await sleep(1500);
  const aStill = await pub.evaluate(menuButtons);
  const restA2 = await fsGet(`restaurantes/${restA.id}`);
  const waiterA = restA2.body.fields?.settings?.mapValue?.fields?.waiter?.booleanValue;
  const waiterB = (await fsGet(`restaurantes/${restB.id}`)).body.fields?.settings?.mapValue?.fields?.waiter?.booleanValue;
  record("E", "B desativa o próprio Chamar garçom; o cardápio de A continua com o botão", aStill.some((t) => t.includes("Chamar garçom")) && waiterA === true && waiterB === false, `A.waiter=${waiterA} B.waiter=${waiterB}`);

  // Teste F — falhas: salvar sem permissão e enviar sem permissão
  await panelB.evaluate(`localStorage.setItem("kardap-restaurant-id", ${JSON.stringify(restA.id)}); true`);
  await panelB.evaluate(`[...document.querySelectorAll(".kd-switch-row")].find(r => r.textContent.includes("Avaliar no Google")).querySelector("input").click()`);
  const toastF = await panelB.waitFor(`(() => { const t = document.querySelector(".kd-toast"); return t && !t.textContent.includes("Chamar garçom") ? t.textContent : false; })()`, 15000, "aviso de erro ao salvar");
  const reverted = await panelB.waitFor(`(() => { const r = [...document.querySelectorAll(".kd-switch-row")].find(r => r.textContent.includes("Avaliar no Google")); return r ? String(r.querySelector("input").checked) : false; })()`, 5000, "estado revertido");
  record("F", "Falha ao salvar: mensagem de erro, sem aviso de sucesso, e a chave volta ao estado anterior", /Não foi possível|permiss/i.test(toastF) && /desfeita/.test(toastF) && !toastF.includes("ativado") && reverted === "true", `aviso: "${toastF}" · chave: ${reverted}`);
  await panelB.shot("e2e-06-falha-salvar");
  await panelB.goto(`${APP}/dashboard/personalizacao`);
  await panelB.waitFor(`document.querySelectorAll(".kd-upload-row input[type=file]").length === 2`, 30000, "personalização B");
  await panelB.files(".kd-upload-row input[type=file]", [FILES.small]);
  const toastUp = await panelB.waitFor(`(() => { const t = document.querySelector(".kd-toast"); return t ? t.textContent : false; })()`, 30000, "aviso de erro no envio");
  record("F", "Falha no envio: mensagem clara, com opção de tentar de novo, sem sucesso indevido", /permiss/i.test(toastUp) && /Tentar de novo/.test(toastUp) && !/atualizada/.test(toastUp), toastUp);
  const aBrandAfter = mapField((await fsGet(`restaurantes/${restA.id}`)).body.fields, "brand");
  record("F", "Nenhuma URL inconsistente gravada no restaurante A", str(aBrandAfter, "logo") === str(brandA, "logo"), "");
  await panelB.shot("e2e-07-falha-envio");

  const errs = [...panel.errors, ...pub.errors, ...panelB.errors].filter(Boolean);
  if (errs.length) console.log("Erros de JavaScript nas páginas:\n  " + [...new Set(errs)].join("\n  "));
} catch (error) {
  record("X", "Execução interrompida", false, String(error?.message || error));
} finally {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nResumo: ${results.length - failed} passaram, ${failed} falharam.`);
  fs.writeFileSync(path.join(OUT, "e2e-results.json"), JSON.stringify(results, null, 2));
  ws.close();
  browserProc.kill();
  setTimeout(() => process.exit(failed ? 1 : 0), 300);
}
