// Testes de ponta a ponta dos Reels do cardápio (docs/REELS.md) contra os emuladores do Firebase, com as regras
// do repositório. Celular emulado com toque de verdade (CDP), vídeos reais da pasta public/.
//
// Pré-requisito: emuladores rodando (ver docs/TESTES.md):
//   firebase emulators:start --only auth,firestore,storage --project demo-kardap
// O script sobe o app em http://localhost:3100 apontando para eles (porta 3100 livre).
// Uso: node scripts/e2e-reels.mjs [pasta-de-capturas]
// Navegador: BROWSER_PATH (padrão: Microsoft Edge no Windows).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "kardap-reels-")));
fs.mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:3100";
const PROJECT = "demo-kardap";
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `http://127.0.0.1:8080/v1/${DOCS}`;
const AUTH = "http://127.0.0.1:9099";
const EDGE = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let phone;
const results = [];
const record = (id, name, ok, detail = "") => {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASSOU" : "FALHOU"}  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
};
async function test(id, name, fn) {
  try {
    const detail = await fn();
    record(id, name, true, typeof detail === "string" ? detail : "");
  } catch (error) {
    record(id, name, false, error.message);
    await phone?.shot(`falha-${id}`).catch(() => undefined);
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

// ───────── Dados de teste nos emuladores (credencial de administrador do emulador, ignora regras) ─────────
const admin = { Authorization: "Bearer owner" };
const RID = "reels-bistro";
const SLUG = "bistro-dos-reels";
const MESA = "mesa-reels-7";

function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === "number") return { doubleValue: v };
  return { mapValue: { fields: toFields(v) } };
}
const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
async function fsSet(docPath, data) {
  const r = await fetch(`${FS}/${docPath}`, { method: "PATCH", headers: { "content-type": "application/json", ...admin }, body: JSON.stringify({ fields: toFields(data) }) });
  if (!r.ok) throw new Error(`seed ${docPath}: ${r.status} ${await r.text()}`);
}
async function fsGet(docPath, token) {
  const r = await fetch(`${FS}/${docPath}`, { headers: token ? { Authorization: `Bearer ${token}` } : admin });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function fsQuery(parent, collectionId, token) {
  const r = await fetch(`${FS}${parent ? `/${parent}` : ""}:runQuery`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : admin) },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } }),
  });
  const rows = await r.json();
  return Array.isArray(rows) ? rows.filter((x) => x.document).map((x) => x.document) : [];
}
async function commit(writes, token) {
  const r = await fetch(`http://127.0.0.1:8080/v1/${DOCS}:commit`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ writes }) });
  return r.status;
}
const likesOf = async (pid) => Number((await fsGet(`restaurantes/${RID}/produtos/${pid}`)).body.fields?.likes?.integerValue || 0);
const likeDocs = async () => (await fsQuery(`restaurantes/${RID}`, "curtidas")).map((d) => ({ id: d.name.split("/").pop(), uid: d.fields.uid?.stringValue, productId: d.fields.productId?.stringValue }));
async function anonymousToken() {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
  const body = await r.json();
  return { token: body.idToken, uid: body.localId };
}
async function emailAccount(email, password) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const body = await r.json();
  return { token: body.idToken, uid: body.localId };
}
async function lookup(uid) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: "POST", headers: { "content-type": "application/json", ...admin }, body: JSON.stringify({ localId: [uid] }) });
  return (await r.json()).users?.[0] || null;
}
async function waitUntil(fn, timeout, label) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch {}
    await sleep(250);
  }
  throw new Error(`tempo esgotado: ${label}`);
}

const PRODUCTS = [
  { id: "p-burger", name: "Hambúrguer da casa", video: "/hamburguer.mp4", description: "Blend de 180 g na brasa, queijo prato derretido, cebola caramelizada, picles da casa e maionese de alho no pão de fermentação natural. Acompanha fritas rústicas." },
  { id: "p-pizza", name: "Pizza margherita", video: "/pizzavideo.mp4", description: "Molho de tomate italiano, muçarela de búfala e manjericão." },
  { id: "p-carne", name: "Carne na tábua", video: "/carne%20tabua.mp4", description: "Picanha fatiada servida na tábua com farofa e vinagrete." },
  { id: "p-salada", name: "Salada verde", video: "", description: "Folhas da estação, tomate-cereja e molho de mostarda." },
];

async function seed() {
  const reset = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  expect(reset.ok, "não foi possível limpar o emulador do Firestore");
  await fsSet(`restaurantes/${RID}`, { name: "Bistrô dos Reels", slug: SLUG, status: "active", ownerId: "dono-reels", createdAt: new Date().toISOString(), settings: { waiter: true, bill: false } });
  await fsSet(`restaurantes/${RID}/categorias/pratos`, { name: "Pratos", order: 0, active: true });
  await fsSet(`restaurantes/${RID}/mesas/m7`, { name: "Mesa 7", number: 7, qrToken: MESA });
  const base = Date.now();
  for (const [i, p] of PRODUCTS.entries()) {
    await fsSet(`restaurantes/${RID}/produtos/${p.id}`, {
      name: p.name,
      description: p.description,
      category: "Pratos",
      categoryId: "pratos",
      price: "39,90",
      priceCents: 3990 + i * 1000,
      available: true,
      // Lista ordenada pelo mais recente: o hambúrguer é o primeiro.
      createdAt: new Date(base - i * 60_000).toISOString(),
      ...(p.video ? { videoUrl: p.video } : {}),
    });
  }
}

// ───────── App (servidor de desenvolvimento apontando para os emuladores) ─────────
const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(FIREBASE_|FIRESTORE_|SSO_|NEXT_PUBLIC_)/.test(k)));
const appEnv = {
  ...inherited,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_FIREBASE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-kardap.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-kardap.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
  SSO_ALLOWED_ORIGINS: APP,
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
};
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
// Se o app já estiver rodando na porta 3100 com estas variáveis (ex.: depurando), usa o que está no ar.
const running = await fetch(`${APP}/api/auth/csrf`).then((r) => r.ok).catch(() => false);
const server = running ? null : spawn(process.execPath, [NEXT_BIN, "dev", "-p", "3100"], { cwd: ROOT, env: appEnv, stdio: ["ignore", fs.openSync(path.join(OUT, "app-server.log"), "w"), fs.openSync(path.join(OUT, "app-server.log"), "a")] });
function killTree(proc) {
  if (!proc?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  else proc.kill("SIGTERM");
}
async function waitHttp(url, timeout = 240000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`servidor não respondeu: ${url}`);
}

// ───────── Navegador (CDP) ─────────
const port = 9300 + Math.floor(Math.random() * 90);
const browserProc = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(OUT, ".edge-reels-" + port)}`, "--no-first-run", "--disable-extensions", "--mute-audio", "about:blank"], { stdio: "ignore" });
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

async function newPage({ phone = true, contextId } = {}) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank", ...(contextId ? { browserContextId: contextId } : {}) });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  if (phone) {
    await s("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await s("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" });
  } else {
    await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  }
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
      await Promise.race([loaded, sleep(60000)]);
    },
    async waitFor(expr, timeout = 20000, label = expr) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const v = await evaluate(expr);
          if (v) return v;
        } catch {}
        await sleep(150);
      }
      throw new Error(`tempo esgotado esperando: ${label}`);
    },
    /** Centro de um elemento visível (para tocar nele). */
    async center(selector) {
      const box = await evaluate(`(() => { const el = ${selector}; if (!el) return null; let r = el.getBoundingClientRect(); if (r.top < 90 || r.bottom > innerHeight - 150) { el.scrollIntoView({ block: "center" }); r = el.getBoundingClientRect(); } return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!box) throw new Error(`elemento não encontrado: ${selector}`);
      return box;
    },
    async touch(x, y) {
      await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    async tapEl(selector) {
      const { x, y } = await page.center(selector);
      await page.touch(x, y);
    },
    async hold(x, y, ms) {
      await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await sleep(ms);
      return () => s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    /** Arrasta o dedo para cima (rolagem real do navegador, com o encaixe dos slides). */
    async swipeUp() {
      await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 650 }] });
      for (let i = 1; i <= 10; i++) {
        await s("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 650 - i * 45 }] });
        await sleep(16);
      }
      await s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    key: async (key) => {
      await s("Input.dispatchKeyEvent", { type: "keyDown", key, code: key === "Escape" ? "Escape" : undefined, windowsVirtualKeyCode: key === "Escape" ? 27 : undefined });
      await s("Input.dispatchKeyEvent", { type: "keyUp", key, code: key === "Escape" ? "Escape" : undefined, windowsVirtualKeyCode: key === "Escape" ? 27 : undefined });
    },
    async fill(label, value) {
      const ok = await evaluate(`(() => {
        const lab = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)}));
        const el = lab && document.getElementById(lab.htmlFor);
        if (!el) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error(`campo não encontrado: ${label}`);
    },
    async shot(name) {
      const r = await s("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
    },
  };
  return page;
}

// Atalhos de leitura da tela.
const ACTIVE = `document.querySelector('.kd-reel[aria-hidden="false"]')`;
const activeName = `(${ACTIVE}?.getAttribute("aria-label") || "")`;
const activeVideo = `(() => { const v = ${ACTIVE}?.querySelector("video"); return v ? { paused: v.paused, muted: v.muted, t: v.currentTime, ready: v.readyState } : null; })()`;
const button = (label) => `[...${ACTIVE}?.querySelectorAll(".kd-reel-act") || []].find(b => b.getAttribute("aria-label")?.startsWith(${JSON.stringify(label)}))`;
const byText = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim().startsWith(${JSON.stringify(text)}))`;

let anonUid = "";
try {
  console.log(`Capturas e registros: ${OUT}`);
  await seed();
  await waitHttp(`${APP}/api/auth/csrf`);
  // Primeira compilação da rota do cardápio (o servidor de desenvolvimento compila sob demanda).
  await fetch(`${APP}/r/${SLUG}`).catch(() => undefined);
  const version = await (async () => {
    for (let i = 0; i < 80; i++) {
      try {
        return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      } catch {
        await sleep(250);
      }
    }
    throw new Error("devtools indisponível");
  })();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  });

  // ───────── Regras do Firestore (REST com tokens reais do emulador de Auth) ─────────
  const anon = await anonymousToken();
  const doc = (p) => `${DOCS}/${p}`;
  const likeWrite = (uid, pid) => ({ update: { name: doc(`restaurantes/${RID}/curtidas/${pid}_${uid}`), fields: toFields({ productId: pid, uid }) }, updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }] });
  const counter = (pid, n) => ({ transform: { document: doc(`restaurantes/${RID}/produtos/${pid}`), fieldTransforms: [{ fieldPath: "likes", increment: { integerValue: String(n) } }] } });

  await test("N1", "Regras: somar curtida no contador sem criar a curtida é recusado", async () => {
    expect((await commit([counter("p-salada", 1)], anon.token)) === 403, "contador alterado sozinho");
    expect((await likesOf("p-salada")) === 0, "contador mudou");
  });
  await test("N2", "Regras: criar a curtida sem somar no contador é recusado", async () => {
    expect((await commit([likeWrite(anon.uid, "p-salada")], anon.token)) === 403, "curtida sem contador aceita");
  });
  await test("N3", "Regras: curtir em nome de outra pessoa é recusado", async () => {
    expect((await commit([likeWrite("outra-pessoa", "p-salada"), counter("p-salada", 1)], anon.token)) === 403, "curtida de outro uid aceita");
  });
  await test("N4", "Regras: somar mais de 1 por curtida é recusado", async () => {
    expect((await commit([likeWrite(anon.uid, "p-salada"), counter("p-salada", 5)], anon.token)) === 403, "+5 aceito");
  });
  await test("P1", "Regras: curtida + contador no mesmo lote é aceito (identidade anônima)", async () => {
    expect((await commit([likeWrite(anon.uid, "p-salada"), counter("p-salada", 1)], anon.token)) === 200, "lote válido recusado");
    expect((await likesOf("p-salada")) === 1, "contador não chegou a 1");
  });
  await test("N5", "Regras: curtir de novo o mesmo prato é recusado (uma curtida por pessoa)", async () => {
    expect((await commit([likeWrite(anon.uid, "p-salada"), counter("p-salada", 1)], anon.token)) === 403, "segunda curtida aceita");
    expect((await likesOf("p-salada")) === 1, "contador passou de 1");
  });
  await test("N6", "Regras: visitante não altera outros campos do produto (preço, nome)", async () => {
    const r = await fetch(`${FS}/restaurantes/${RID}/produtos/p-salada?updateMask.fieldPaths=priceCents`, { method: "PATCH", headers: { "content-type": "application/json", Authorization: `Bearer ${anon.token}` }, body: JSON.stringify({ fields: toFields({ priceCents: 1 }) }) });
    expect(r.status === 403, `alteração de preço: ${r.status}`);
  });
  await test("N7", "Regras: ninguém lê as curtidas de outra pessoa", async () => {
    const other = await anonymousToken();
    const r = await fsGet(`restaurantes/${RID}/curtidas/p-salada_${anon.uid}`, other.token);
    expect(r.status === 403, `leitura alheia: ${r.status}`);
    const own = await fsGet(`restaurantes/${RID}/curtidas/p-salada_${anon.uid}`, anon.token);
    expect(own.status === 200, `leitura da própria curtida: ${own.status}`);
  });
  await test("P2", "Regras: descurtir (apagar curtida + subtrair 1) é aceito", async () => {
    const del = { delete: doc(`restaurantes/${RID}/curtidas/p-salada_${anon.uid}`) };
    expect((await commit([del, counter("p-salada", -1)], anon.token)) === 200, "descurtir recusado");
    expect((await likesOf("p-salada")) === 0, "contador não voltou a 0");
  });
  await test("N8", "Regras: identidade anônima não grava conta de cliente nem salvos", async () => {
    const status = await commit([{ update: { name: doc(`clientes/${anon.uid}`), fields: toFields({ tipo: "cliente", email: null }) }, updateTransforms: [{ fieldPath: "atualizadoEm", setToServerValue: "REQUEST_TIME" }] }], anon.token);
    expect(status === 403, `cliente anônimo: ${status}`);
  });
  await test("N9", "Regras: cliente só grava os próprios salvos, no formato esperado", async () => {
    const c = await emailAccount(`cliente-regras-${Date.now()}@teste.kardap`, "senha-segura-1");
    const item = { restaurantId: RID, restaurantSlug: SLUG, restaurantName: "Bistrô dos Reels", productId: "p-pizza", name: "Pizza margherita", priceCents: 4990, image: "", savedAt: Date.now() };
    const own = await commit([{ update: { name: doc(`clientes/${c.uid}/salvos/${RID}_p-pizza`), fields: toFields(item) } }], c.token);
    const other = await commit([{ update: { name: doc(`clientes/outra-pessoa/salvos/${RID}_p-pizza`), fields: toFields(item) } }], c.token);
    const extra = await commit([{ update: { name: doc(`clientes/${c.uid}/salvos/${RID}_p-carne`), fields: toFields({ ...item, productId: "p-carne", admin: true }) } }], c.token);
    const wrongId = await commit([{ update: { name: doc(`clientes/${c.uid}/salvos/qualquer`), fields: toFields(item) } }], c.token);
    expect(own === 200 && other === 403 && extra === 403 && wrongId === 403, `próprio ${own}, alheio ${other}, campo extra ${extra}, id errado ${wrongId}`);
  });

  // ───────── Servidor: identidade anônima não é conta ─────────
  await test("S1", "Servidor: identidade anônima não cria restaurante", async () => {
    const r = await fetch(`${APP}/api/restaurants`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${anon.token}` }, body: JSON.stringify({ name: "Restaurante anônimo" }) });
    expect(r.status === 403, `status ${r.status}`);
    const all = await fsQuery("", "restaurantes");
    expect(!all.some((d) => d.fields.ownerId?.stringValue === anon.uid), "restaurante criado para identidade anônima");
  });
  await test("S2", "Servidor: identidade anônima não abre sessão compartilhada (SSO)", async () => {
    const csrfRes = await fetch(`${APP}/api/auth/csrf`);
    const csrf = csrfRes.headers.getSetCookie().find((c) => c.startsWith("kardap_csrf="))?.split(";")[0].split("=")[1];
    const fresh = await anonymousToken();
    const r = await fetch(`${APP}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-csrf-token": csrf, cookie: `kardap_csrf=${csrf}` }, body: JSON.stringify({ idToken: fresh.token }) });
    const body = await r.json().catch(() => ({}));
    expect(r.status === 401 && !r.headers.getSetCookie().some((c) => c.startsWith("kardap_sso_session=")), `status ${r.status} ${JSON.stringify(body)}`);
  });

  // ───────── Celular: Reels ─────────
  phone = await newPage({ phone: true });
  await phone.goto(`${APP}/r/${SLUG}?mesa=${MESA}`);

  await test("U1", "Cardápio mostra a entrada dos Reels (bolhas só dos pratos com vídeo) e o botão na barra", async () => {
    await phone.waitFor(`document.querySelectorAll(".kd-reels-bubble").length === 3`, 90000, "bolhas dos pratos em vídeo");
    await phone.waitFor(`document.querySelector(".kd-menu-table")?.textContent.includes("Mesa 7")`, 20000, "mesa identificada");
    const names = await phone.evaluate(`[...document.querySelectorAll(".kd-reels-bubble-name")].map(e => e.textContent)`);
    expect(JSON.stringify(names) === JSON.stringify(["Hambúrguer da casa", "Pizza margherita", "Carne na tábua"]), `bolhas: ${names}`);
    expect(await phone.evaluate(`!!document.querySelector('[aria-label="Assistir os pratos em vídeo (Reels)"]')`), "botão Reels na barra");
    await sleep(1200); // hidratação
    await phone.shot("01-cardapio-entrada-reels");
  });

  await test("U2", "Abrir Reels: primeiro vídeo toca sem som, só os vizinhos existem como vídeo", async () => {
    await phone.tapEl(byText(".kd-reels-rail-all", "Assistir"));
    await phone.waitFor(`!!document.querySelector(".kd-reels-track")`, 15000, "visualizador aberto");
    expect((await phone.evaluate(activeName)) === "Hambúrguer da casa", `prato ativo: ${await phone.evaluate(activeName)}`);
    const v = await phone.waitFor(`(() => { const v = ${activeVideo}; return v && !v.paused && v.t > 0.3 ? v : null; })()`, 20000, "vídeo tocando");
    expect(v.muted, "deveria começar sem som");
    const videos = await phone.evaluate(`document.querySelectorAll(".kd-reels video").length`);
    expect(videos <= 2, `${videos} elementos de vídeo`);
    expect(await phone.evaluate(`history.state?.kdReel === true`), "entrada no histórico");
    await phone.shot("02-reels-primeiro-video");
    return `${videos} vídeos no DOM`;
  });

  await test("U3", "Deslizar para cima: próximo prato toca, o anterior pausa e volta ao início", async () => {
    await phone.swipeUp();
    await phone.waitFor(`${activeName} === "Pizza margherita"`, 8000, "segundo prato ativo");
    await phone.waitFor(`(() => { const v = ${activeVideo}; return v && !v.paused && v.t > 0.2; })()`, 20000, "segundo vídeo tocando");
    const first = await phone.evaluate(`(() => { const v = document.querySelector('.kd-reel[data-index="0"] video'); return v ? { paused: v.paused, t: v.currentTime } : null; })()`);
    expect(first && first.paused && first.t === 0, `primeiro vídeo: ${JSON.stringify(first)}`);
    const playing = await phone.evaluate(`[...document.querySelectorAll(".kd-reels video")].filter(v => !v.paused).length`);
    expect(playing === 1, `${playing} vídeos tocando ao mesmo tempo`);
    const videos = await phone.evaluate(`document.querySelectorAll(".kd-reels video").length`);
    expect(videos <= 3, `${videos} elementos de vídeo`);
  });

  await test("U4", "Um toque pausa (ícone de play) e outro toque continua", async () => {
    await phone.touch(195, 380);
    await phone.waitFor(`(() => { const v = ${activeVideo}; return v && v.paused && !!${ACTIVE}.querySelector(".kd-reel-state"); })()`, 3000, "pausado com ícone");
    await phone.shot("03-reels-pausado");
    await phone.touch(195, 380);
    await phone.waitFor(`(() => { const v = ${activeVideo}; return v && !v.paused && !${ACTIVE}.querySelector(".kd-reel-state"); })()`, 3000, "tocando de novo");
  });

  await test("U5", "Segurar o dedo pausa e esconde os botões; soltar continua", async () => {
    const release = await phone.hold(195, 380, 700);
    const during = await phone.evaluate(`({ holding: document.querySelector(".kd-reels").classList.contains("is-holding"), paused: ${activeVideo}.paused, opacity: getComputedStyle(${ACTIVE}.querySelector(".kd-reel-actions")).opacity })`);
    await phone.shot("04-reels-segurando");
    await release();
    await phone.waitFor(`!document.querySelector(".kd-reels").classList.contains("is-holding") && !${activeVideo}.paused`, 3000, "voltou a tocar");
    expect(during.holding && during.paused, `durante: ${JSON.stringify(during)}`);
  });

  await test("U6", "Dois toques curtem: coração na tela, botão ativo e contador gravado com identidade anônima", async () => {
    await phone.touch(200, 400);
    await sleep(90);
    await phone.touch(205, 405);
    await phone.waitFor(`!!${ACTIVE}.querySelector(".kd-reel-burst")`, 1500, "coração da curtida");
    await phone.shot("05-reels-curtida");
    await phone.waitFor(`${button("Curtir")}?.getAttribute("aria-pressed") === "true"`, 3000, "botão curtido");
    await waitUntil(async () => (await likesOf("p-pizza")) === 1, 15000, "contador = 1 no Firestore");
    const likes = await likeDocs();
    const mine = likes.find((l) => l.productId === "p-pizza");
    expect(mine && mine.id === `p-pizza_${mine.uid}`, `curtida: ${JSON.stringify(likes)}`);
    anonUid = mine.uid;
    const user = await lookup(anonUid);
    expect(user && !user.email && !(user.providerUserInfo || []).length, "deveria ser uma identidade anônima");
    expect((await phone.evaluate(`${button("Curtir")}.textContent`)).includes("1"), "contador na tela");
    // Pausado? Não: dois toques não pausam.
    expect(!(await phone.evaluate(activeVideo)).paused, "dois toques pausaram o vídeo");
  });

  await test("U7", "Tocar no coração de novo descurte (curtida apagada e contador volta a 0)", async () => {
    await phone.tapEl(button("Curtir"));
    await phone.waitFor(`${button("Curtir")}?.getAttribute("aria-pressed") === "false"`, 3000, "botão descurtido");
    await waitUntil(async () => (await likesOf("p-pizza")) === 0 && !(await likeDocs()).some((l) => l.productId === "p-pizza"), 15000, "contador 0 e curtida apagada");
  });

  await test("U8", "Toques rápidos seguidos terminam no estado do último toque, sem contagem dupla", async () => {
    for (let i = 0; i < 5; i++) {
      await phone.tapEl(button("Curtir"));
      await sleep(70);
    }
    await phone.waitFor(`${button("Curtir")}?.getAttribute("aria-pressed") === "true"`, 3000, "curtido no fim");
    await sleep(2500);
    await waitUntil(async () => (await likesOf("p-pizza")) === 1, 15000, "contador = 1");
    const docs = (await likeDocs()).filter((l) => l.productId === "p-pizza");
    expect(docs.length === 1, `${docs.length} curtidas gravadas`);
  });

  await test("U9", "Contador em tempo real em outro celular", async () => {
    const { browserContextId } = await send("Target.createBrowserContext");
    const other = await newPage({ phone: true, contextId: browserContextId });
    await other.goto(`${APP}/r/${SLUG}?reel=p-pizza`);
    await other.waitFor(`${activeName} === "Pizza margherita"`, 60000, "outro celular no prato");
    await other.waitFor(`${button("Curtir")}?.textContent.includes("1")`, 10000, "outro celular vê 1 curtida");
    await phone.tapEl(button("Curtir"));
    await other.waitFor(`${button("Curtir")}?.textContent.includes("Curtir")`, 10000, "outro celular vê a descurtida");
    await phone.tapEl(button("Curtir"));
    await waitUntil(async () => (await likesOf("p-pizza")) === 1, 15000, "contador = 1");
    await other.waitFor(`${button("Curtir")}?.textContent.includes("1")`, 10000, "outro celular vê a curtida de volta");
    await send("Target.disposeBrowserContext", { browserContextId });
  });

  await test("U10", "Enviar: folha do celular recebe o link do prato, sem a mesa de quem compartilhou", async () => {
    await phone.evaluate(`(() => { window.__shared = null; Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__shared = d; return Promise.resolve(); } }); return true; })()`);
    await phone.tapEl(button("Enviar"));
    const shared = await phone.waitFor(`window.__shared`, 3000, "navigator.share chamado");
    expect(shared.url === `${APP}/r/${SLUG}?reel=p-pizza`, `link: ${shared.url}`);
    expect(!shared.url.includes("mesa"), "link levou a mesa");
  });

  await test("U11", "Enviar sem folha do sistema: opções próprias (WhatsApp, Telegram, e-mail, copiar)", async () => {
    await phone.evaluate(`(() => { Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); return true; })()`);
    await phone.tapEl(button("Enviar"));
    await phone.waitFor(`!!${byText(".kd-sheet .kd-overline", "Enviar para alguém")}`, 3000, "folha de envio");
    const wa = await phone.evaluate(`[...document.querySelectorAll(".kd-share-opt")].map(a => a.textContent.trim() + "|" + (a.getAttribute("href") || ""))`);
    expect(wa.some((o) => o.startsWith("WhatsApp|https://wa.me/?text=") && o.includes(encodeURIComponent(`${APP}/r/${SLUG}?reel=p-pizza`))), `opções: ${wa.join(", ")}`);
    expect(wa.some((o) => o.startsWith("Copiar link")), "copiar link");
    await phone.shot("06-reels-enviar");
    await phone.key("Escape");
    await phone.waitFor(`!document.querySelector(".kd-sheet")`, 3000, "folha fechada");
    expect(await phone.evaluate(`!!document.querySelector(".kd-reels")`), "Esc fechou o visualizador junto");
  });

  await test("U12", "Salvar sem conta: fica no celular na hora, com aviso oferecendo salvar na conta", async () => {
    await phone.tapEl(button("Salvar"));
    await phone.waitFor(`${button("Salvar")}?.getAttribute("aria-pressed") === "true"`, 3000, "botão salvo");
    await phone.waitFor(`document.querySelector(".kd-reels-toast")?.textContent.includes("Salvo neste celular")`, 3000, "aviso");
    const local = await phone.evaluate(`JSON.parse(localStorage.getItem("kardap-salvos") || "[]")`);
    expect(local.length === 1 && local[0].productId === "p-pizza" && local[0].restaurantId === RID && local[0].priceCents === 4990, `salvos: ${JSON.stringify(local)}`);
    await phone.shot("07-reels-salvo-aviso");
  });

  const email = `cliente-${Date.now()}@teste.kardap`;
  await test("U13", "Criar conta de cliente pelo aviso: mesmo uid da identidade anônima, salvos sobem para a conta", async () => {
    await phone.tapEl(`document.querySelector(".kd-reels-toast button")`);
    await phone.waitFor(`!!${byText(".kd-sheet h2", "Guardar na sua conta")}`, 3000, "folha salvar na conta");
    await phone.shot("08-salvar-na-conta");
    await phone.tapEl(byText(".kd-sheet button", "Criar conta com e-mail"));
    await phone.waitFor(`[...document.querySelectorAll(".kd-sheet label")].some(l => l.textContent.trim().startsWith("Senha"))`, 3000, "formulário");
    await phone.fill("E-mail", email);
    await phone.fill("Senha", "senha-cliente-1");
    await phone.tapEl(byText(".kd-sheet button", "Criar conta e salvar"));
    await phone.waitFor(`!!${byText(".kd-sheet h2", "Salvo na sua conta")}`, 20000, "confirmação");
    await phone.shot("09-salvo-na-conta");
    const user = await lookup(anonUid);
    expect(user?.email === email, `conta: ${JSON.stringify(user && { email: user.email, id: user.localId })}`);
    const client = await fsGet(`clientes/${anonUid}`);
    expect(client.body.fields?.tipo?.stringValue === "cliente", "documento do cliente");
    const saved = await fsGet(`clientes/${anonUid}/salvos/${RID}_p-pizza`);
    expect(saved.status === 200 && saved.body.fields?.name?.stringValue === "Pizza margherita", `salvo na conta: ${saved.status}`);
    const like = (await likeDocs()).find((l) => l.productId === "p-pizza");
    expect(like?.uid === anonUid, "a curtida continuou com a conta");
  });

  await test("U14", "Ver salvos e voltar: o \"voltar\" do celular fecha o visualizador e fica no cardápio", async () => {
    await phone.tapEl(byText(".kd-sheet button", "Ver salvos"));
    await phone.waitFor(`!!${byText(".kd-sheet h2", "Salvos")} && document.querySelectorAll(".kd-saved-row").length === 1`, 8000, "lista de salvos");
    await phone.shot("10-salvos");
    await phone.key("Escape");
    await phone.waitFor(`!document.querySelector(".kd-sheet")`, 3000, "lista fechada");
    await phone.evaluate(`history.back(), true`);
    await phone.waitFor(`!document.querySelector(".kd-reels")`, 5000, "visualizador fechado pelo voltar");
    expect((await phone.evaluate(`location.pathname`)) === `/r/${SLUG}`, "saiu do cardápio");
    expect((await phone.evaluate(`location.search`)) === `?mesa=${MESA}`, "mesa preservada");
  });

  await test("U15", "Salvos no topo do cardápio: contador, abrir o prato e remover (também da conta)", async () => {
    await phone.waitFor(`document.querySelector(".kd-menu-saved .kd-menu-pill-count")?.textContent === "1"`, 5000, "contador de salvos");
    await phone.tapEl(`document.querySelector(".kd-menu-saved")`);
    await phone.waitFor(`document.querySelectorAll(".kd-saved-row").length === 1`, 8000, "lista");
    await sleep(600); // a folha termina de subir
    await phone.tapEl(`document.querySelector(".kd-saved-row [aria-label^='Remover']")`);
    await phone.waitFor(`document.querySelectorAll(".kd-saved-row").length === 0`, 3000, "removido da lista");
    await waitUntil(async () => (await fsGet(`clientes/${anonUid}/salvos/${RID}_p-pizza`)).status === 404, 10000, "removido da conta");
    expect((await phone.evaluate(`JSON.parse(localStorage.getItem("kardap-salvos") || "[]").length`)) === 0, "removido do celular");
    await phone.key("Escape");
    await phone.waitFor(`!document.querySelector(".kd-sheet")`, 3000, "lista fechada");
  });

  await test("U16", "Link compartilhado (?reel=) abre direto no prato e limpa o endereço, mantendo a mesa", async () => {
    await phone.goto(`${APP}/r/${SLUG}?mesa=${MESA}&reel=p-carne`);
    await phone.waitFor(`${activeName} === "Carne na tábua"`, 60000, "aberto no prato do link");
    await phone.waitFor(`location.search === "?mesa=${MESA}"`, 5000, "endereço sem ?reel");
    await phone.waitFor(`document.querySelector(".kd-menu-table")?.textContent.includes("Mesa 7")`, 10000, "mesa continua identificada");
    await phone.evaluate(`history.back(), true`);
    await phone.waitFor(`!document.querySelector(".kd-reels")`, 5000, "voltar fecha o visualizador");
    expect((await phone.evaluate(`location.pathname`)) === `/r/${SLUG}`, "saiu do cardápio");
  });

  await test("U17", "Prato da lista abre o feed com todos os pratos (inclusive sem vídeo)", async () => {
    await phone.tapEl(byText(".kd-dish-open", "Salada verde"));
    await phone.waitFor(`${activeName} === "Salada verde"`, 5000, "prato sem vídeo ativo");
    const info = await phone.evaluate(`({ slides: document.querySelectorAll(".kd-reel:not(.kd-reel-end)").length, title: document.querySelector(".kd-reels-title").textContent, blank: !!${ACTIVE}.querySelector(".kd-reel-blank"), mute: !!document.querySelector('.kd-reels-bar [aria-label="Ativar som"]') })`);
    expect(info.slides === 4 && info.title === "Pratos" && info.blank && !info.mute, JSON.stringify(info));
    await phone.shot("11-feed-cardapio-sem-video");
    await phone.evaluate(`history.back(), true`);
    await phone.waitFor(`!document.querySelector(".kd-reels")`, 5000, "fechado");
  });

  await test("U18", "Som: o alto-falante liga o som do vídeo (dentro do toque) e lembra na sessão", async () => {
    await phone.tapEl(`document.querySelector('[aria-label="Assistir os pratos em vídeo (Reels)"]')`);
    await phone.waitFor(`(() => { const v = ${activeVideo}; return v && !v.paused; })()`, 20000, "tocando");
    await phone.tapEl(`document.querySelector('.kd-reels-bar [aria-label="Ativar som"]')`);
    await phone.waitFor(`(() => { const v = ${activeVideo}; return v && !v.muted && !v.paused; })()`, 3000, "com som");
    expect((await phone.evaluate(`sessionStorage.getItem("kardap-reels-som")`)) === "1", "preferência de som");
  });

  await test("U19", "Fim do feed: cartão final com volta ao cardápio", async () => {
    for (let i = 0; i < 4; i++) {
      await phone.swipeUp();
      await sleep(700);
    }
    await phone.waitFor(`document.querySelector('.kd-reel-end')?.getAttribute("aria-hidden") === "false"`, 6000, "cartão final");
    await phone.shot("12-fim-do-feed");
    await phone.tapEl(byText(".kd-reel-end-btn", "Ver o cardápio completo"));
    await phone.waitFor(`!document.querySelector(".kd-reels")`, 5000, "voltou ao cardápio");
  });

  await test("U20", "Nenhum erro de JavaScript no celular", async () => {
    expect(phone.errors.length === 0, phone.errors.join(" | "));
  });

  // ───────── Painel: identidade anônima não entra ─────────
  await test("G1", "Visitante que curtiu (anônimo) e abre /dashboard vê o login (não a configuração inicial), sem criar restaurante", async () => {
    const { browserContextId } = await send("Target.createBrowserContext");
    const visitor = await newPage({ phone: true, contextId: browserContextId });
    await visitor.goto(`${APP}/r/${SLUG}?reel=p-burger`);
    await visitor.waitFor(`${activeName} === "Hambúrguer da casa"`, 60000, "Reels aberto");
    await sleep(800);
    await visitor.tapEl(button("Curtir"));
    const uid = await waitUntil(async () => (await likeDocs()).find((l) => l.productId === "p-burger")?.uid, 15000, "curtida anônima");
    await visitor.goto(`${APP}/dashboard`);
    // Sem sessão, o painel mostra o formulário de login no próprio endereço.
    const loginForm = `["E-mail", "Senha"].every(t => [...document.querySelectorAll("label")].some(l => l.textContent.trim().startsWith(t))) && !!document.querySelector("form button[type=submit]")`;
    await visitor.waitFor(loginForm, 90000, "formulário de login");
    await sleep(4000);
    const where = await visitor.evaluate(`({ path: location.pathname, login: ${loginForm} })`);
    expect(where.path === "/dashboard" && where.login, `depois de 4 s: ${JSON.stringify(where)}`);
    const all = await fsQuery("", "restaurantes");
    expect(!all.some((d) => d.fields.ownerId?.stringValue === uid), "restaurante criado para o anônimo");
    await send("Target.disposeBrowserContext", { browserContextId });
  });
} catch (error) {
  record("X", "execução", false, error.stack || error.message);
} finally {
  try {
    ws?.close();
  } catch {}
  killTree(browserProc);
  killTree(server);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passaram`);
  fs.writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
