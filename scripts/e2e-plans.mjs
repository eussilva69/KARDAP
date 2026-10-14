// Testes de ponta a ponta dos planos (docs/PLANOS.md) contra os emuladores do Firebase, com as regras do repositório.
// Cobre os critérios de aceite: limites de mesas e de pedidos próprios aplicados no servidor, concorrência,
// idempotência, pedidos de marketplace fora da franquia, acesso ao PDV pelo login único, webhook da Cakto
// (assinatura, duplicidade, oferta errada, upgrade e eventos da assinatura antiga), downgrade sem perda de dados,
// administração auditada, regras do Firestore e as telas (preços, Meu Plano, Acessar PDV, mesas).
//
// Pré-requisito: emuladores rodando (firebase emulators:start --only auth,firestore,storage --project demo-kardap).
// O script sobe o app em http://localhost:3100 (ou usa o que já estiver no ar com as mesmas variáveis).
// Uso: node scripts/e2e-plans.mjs [pasta-de-capturas]
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { usagePeriod } from "../lib/billing/plans.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "kardap-planos-")));
fs.mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:3100";
const PROJECT = "demo-kardap";
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `http://127.0.0.1:8080/v1/${DOCS}`;
const AUTH = "http://127.0.0.1:9099";
const EDGE = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const WEBHOOK_SECRET = "segredo-de-teste-do-webhook-cakto-0123456789";
const PDV_SECRET = "segredo-do-cliente-pdv-para-testes-0123456789abcdef";
const OFFERS = { start: "oferta-start-teste", pro: "oferta-pro-teste", business: "oferta-business-teste" };
const PERIOD = usagePeriod().periodId;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let page = null;
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
    await page?.shot(`falha-${id}`).catch(() => undefined);
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

// ───────── Firestore e Auth (emuladores) ─────────
const admin = { Authorization: "Bearer owner" };
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === "number") return { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
function fromValue(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("timestampValue" in v) return v.timestampValue;
  return undefined;
}
const fromFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, fromValue(v)]));
async function fsSet(docPath, data) {
  const r = await fetch(`${FS}/${docPath}`, { method: "PATCH", headers: { "content-type": "application/json", ...admin }, body: JSON.stringify({ fields: toFields(data) }) });
  if (!r.ok) throw new Error(`seed ${docPath}: ${r.status} ${await r.text()}`);
}
async function fsGet(docPath, token) {
  const r = await fetch(`${FS}/${docPath}`, { headers: token ? { Authorization: `Bearer ${token}` } : admin });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, data: fromFields(body.fields) };
}
async function fsList(parent, collectionId) {
  const r = await fetch(`${FS}${parent ? `/${parent}` : ""}:runQuery`, { method: "POST", headers: { "content-type": "application/json", ...admin }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } }) });
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).filter((x) => x.document).map((x) => ({ id: x.document.name.split("/").pop(), ...fromFields(x.document.fields) }));
}
async function fsCount(parent, collectionId) {
  return (await fsList(parent, collectionId)).length;
}
async function rest(method, docPath, token, body, mask) {
  const q = mask ? "?" + mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&") : "";
  const r = await fetch(`${FS}/${docPath}${q}`, { method, headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify({ fields: toFields(body) }) : undefined });
  return r.status;
}
async function createUser(email, password = "senha-de-teste-1") {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const body = await r.json();
  if (!body.localId) throw new Error(`usuário ${email}: ${JSON.stringify(body)}`);
  return { uid: body.localId, email, password, token: body.idToken };
}
async function freshToken(user) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true }) });
  return (await r.json()).idToken;
}

// ───────── App ─────────
const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(FIREBASE_|FIRESTORE_|SSO_|NEXT_PUBLIC_|CAKTO_)/.test(k)));
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
  SSO_CLIENT_SECRET_PDV: PDV_SECRET,
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  CAKTO_WEBHOOK_SECRET: WEBHOOK_SECRET,
  CAKTO_OFFER_START: OFFERS.start,
  CAKTO_OFFER_PRO: OFFERS.pro,
  CAKTO_OFFER_BUSINESS: OFFERS.business,
};
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const running = await fetch(`${APP}/api/auth/csrf`).then((r) => r.ok).catch(() => false);
const log = path.join(OUT, "app-server.log");
const server = running ? null : spawn(process.execPath, [NEXT_BIN, "dev", "-p", "3100"], { cwd: ROOT, env: appEnv, stdio: ["ignore", fs.openSync(log, "w"), fs.openSync(log, "a")] });
function killTree(proc) {
  if (!proc?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  else proc.kill("SIGTERM");
}
async function waitHttp(url, timeout = 240000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`servidor não respondeu: ${url}`);
}

async function api(method, url, token, body, extraHeaders = {}) {
  const r = await fetch(`${APP}${url}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const confirm = (token, restaurantId, orderId, source = "kardap_pdv") => api("POST", "/api/pedidos/confirmar", token, { restaurantId, source, orderId, order: { itens: [{ nome: "Prato", quantidade: 2 }], total: 59.8 } });
const basic = (id, secret) => ({ Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` });
const external = (restaurantId, provider, externalOrderId, secret = PDV_SECRET) =>
  fetch(`${APP}/api/pedidos/externos`, { method: "POST", headers: { "content-type": "application/json", ...basic("pdv", secret) }, body: JSON.stringify({ restaurantId, provider, externalOrderId, order: { total: 42 } }) }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const usageOf = async (rid) => (await fsGet(`restaurantes/${rid}/uso/${PERIOD}`)).data.nativeOrdersUsed || 0;
function signedWebhook(payload, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = `v1=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;
  return fetch(`${APP}/api/cakto/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-cakto-timestamp": ts, "x-cakto-signature": signature }, body: raw }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
}

// ───────── Dados ─────────
const DAY = 86_400_000;
const future = (days) => new Date(Date.now() + days * DAY).toISOString();
const users = {};
const R = { start: "r-start", start2: "r-start-2", pro: "r-pro", pro2: "r-pro-2", business: "r-business", enterprise: "r-enterprise", enterpriseFree: "r-enterprise-livre", trial: "r-trial", legacy: "r-essencial" };

async function seedRestaurant(id, owner, subscription, extra = {}) {
  await fsSet(`restaurantes/${id}`, {
    name: `Restaurante ${id}`,
    slug: `slug-${id}`,
    ownerId: owner.uid,
    status: "active",
    createdAt: new Date(Date.now() - 60 * DAY).toISOString(),
    onboarding: { completed: true },
    onboardingCompleted: true,
    ...(subscription ? { subscription } : {}),
    ...extra,
  });
  await fsSet(`restaurantes/${id}/membros/${owner.uid}`, { uid: owner.uid, role: "owner", permissions: ["*"], active: true });
  await fsSet(`usuarios/${owner.uid}`, { email: owner.email, restaurantIds: [id] });
}
const sub = (planId, extra = {}) => ({ planId, planName: planId, planVersion: 2, status: "active", cycle: "monthly", priceCents: 0, currentPeriodStart: new Date().toISOString(), currentPeriodEnd: future(20), nextPaymentDate: future(20), ...extra });

async function seed() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  for (const key of ["start", "start2", "pro", "pro2", "business", "enterprise", "enterpriseFree", "trial", "legacy", "cashier", "outsider", "admin"]) {
    users[key] = await createUser(`${key.toLowerCase()}-${Date.now()}@teste.kardap`);
  }
  await seedRestaurant(R.start, users.start, sub("start", { priceCents: 4990 }));
  await seedRestaurant(R.start2, users.start2, sub("start", { priceCents: 4990 }));
  await seedRestaurant(R.pro, users.pro, sub("pro", { priceCents: 12990, caktoSubscriptionId: "assinatura-pro-antiga", caktoOrderId: "pedido-pro-antigo", paymentProvider: "cakto" }));
  await seedRestaurant(R.pro2, users.pro2, sub("pro", { priceCents: 12990 }));
  await seedRestaurant(R.business, users.business, sub("business", { priceCents: 19990, caktoSubscriptionId: "assinatura-business", paymentProvider: "cakto" }));
  await seedRestaurant(R.enterprise, users.enterprise, sub("enterprise", { priceCents: 90000, customLimits: { maxNativeOrdersPerMonth: 1000, maxTables: 40 }, customFeatures: { multiUnit: true } }));
  await seedRestaurant(R.enterpriseFree, users.enterpriseFree, sub("enterprise", { priceCents: 150000 }));
  await seedRestaurant(R.trial, users.trial, null, { createdAt: new Date().toISOString() });
  await seedRestaurant(R.legacy, users.legacy, { planId: "essencial", planName: "Essencial", status: "late", lateSince: new Date().toISOString(), cycle: "monthly", priceCents: 4900, currentPeriodEnd: future(5) });
  // Caixa do Pro: só a permissão "pdv".
  await fsSet(`restaurantes/${R.pro}/membros/${users.cashier.uid}`, { uid: users.cashier.uid, role: "caixa", permissions: ["pdv"], active: true });
  await fsSet(`usuarios/${users.cashier.uid}`, { email: users.cashier.email, restaurantIds: [R.pro] });
  await fsSet(`admins/${users.admin.uid}`, { email: users.admin.email });
  // Consumo do mês perto dos limites (e o mês anterior cheio: não pode contar no atual).
  const previous = usagePeriod(Date.parse(usagePeriod().start) - DAY).periodId;
  await fsSet(`restaurantes/${R.pro}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 148 });
  await fsSet(`restaurantes/${R.pro}/uso/${previous}`, { periodId: previous, nativeOrdersUsed: 150 });
  await fsSet(`restaurantes/${R.pro2}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 140 });
  await fsSet(`restaurantes/${R.business}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 498 });
  await fsSet(`restaurantes/${R.enterprise}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 999 });
  await fsSet(`restaurantes/${R.enterpriseFree}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 5000 });
  await fsSet(`restaurantes/${R.trial}/uso/${previous}`, { periodId: previous, nativeOrdersUsed: 150 });
  // Start 2 com 6 mesas (concorrência na criação).
  for (let n = 1; n <= 6; n++) await fsSet(`restaurantes/${R.start2}/mesas/mesa-00${n}`, { id: `mesa-00${n}`, number: n, name: `Mesa 0${n}`, capacity: 4, status: "livre", qrToken: randomUUID() });
}

// ───────── Navegador (para as telas) ─────────
async function openBrowser() {
  const port = 9200 + Math.floor(Math.random() * 90);
  const proc = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(OUT, ".edge-planos-" + port)}`, "--no-first-run", "--disable-extensions", "about:blank"], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 80 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await sleep(250);
    }
  }
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
  return {
    proc,
    ws,
    async newPage(contextId) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank", ...(contextId ? { browserContextId: contextId } : {}) });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s("Page.enable");
      await s("Runtime.enable");
      const errors = [];
      listeners.push((m) => m.sessionId === sessionId && m.method === "Runtime.exceptionThrown" && errors.push(m.params.exceptionDetails?.exception?.description?.split("\n")[0]));
      const evaluate = async (expression) => {
        const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
        return r.result.value;
      };
      const p = {
        errors,
        evaluate,
        size: (width, height, mobile = false) => s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile }),
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
          while (Date.now() - start < timeout) {
            try {
              const v = await evaluate(expr);
              if (v) return v;
            } catch {}
            await sleep(200);
          }
          throw new Error(`tempo esgotado esperando: ${label}`);
        },
        async fill(label, value) {
          const ok = await evaluate(`(() => { const lab = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)})); const el = lab && (document.getElementById(lab.htmlFor) || lab.querySelector("input")); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
          if (!ok) throw new Error(`campo não encontrado: ${label}`);
        },
        click: (selectorExpr) => evaluate(`(() => { const el = ${selectorExpr}; if (!el) return false; el.click(); return true; })()`),
        async shot(name) {
          const r = await s("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
        },
      };
      return p;
    },
    createContext: () => send("Target.createBrowserContext").then((r) => r.browserContextId),
  };
}
const byText = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim().includes(${JSON.stringify(text)}))`;
async function login(p, user) {
  await p.goto(`${APP}/login`);
  await p.waitFor(`["E-mail", "Senha"].every(t => [...document.querySelectorAll("label")].some(l => l.textContent.trim().startsWith(t)))`, 90000, "login");
  await sleep(1500);
  await p.fill("E-mail", user.email);
  await p.fill("Senha", user.password);
  await p.evaluate(`document.querySelector("form button[type=submit]").click(), true`);
  await p.waitFor(`location.pathname.startsWith("/dashboard") && !!document.querySelector(".kd-side")`, 90000, "painel");
}

let browser;
try {
  console.log(`Capturas e registros: ${OUT}`);
  await seed();
  await waitHttp(`${APP}/api/auth/csrf`);

  // ───────── Mesas ─────────
  await test("M1", "Start: cria até 8 mesas e bloqueia a 9ª no servidor, com a mensagem do plano", async () => {
    const first = await api("POST", `/api/restaurants/${R.start}/mesas`, users.start.token, { quantity: 8 });
    expect(first.status === 201 && first.data.tables?.length === 8, `8 mesas: ${first.status} ${JSON.stringify(first.data).slice(0, 120)}`);
    const ninth = await api("POST", `/api/restaurants/${R.start}/mesas`, users.start.token, {});
    expect(ninth.status === 403 && ninth.data.error === "table_limit", `9ª: ${ninth.status} ${ninth.data.error}`);
    expect(ninth.data.message === "Você atingiu o limite de oito mesas do seu plano. Faça upgrade para cadastrar mesas ilimitadas.", ninth.data.message);
    expect((await fsCount(`restaurantes/${R.start}`, "mesas")) === 8, "mesas gravadas ≠ 8");
  });
  await test("M2", "Start: criações simultâneas não passam do limite (6 + 5 ao mesmo tempo = 8)", async () => {
    const all = await Promise.all(Array.from({ length: 5 }, () => api("POST", `/api/restaurants/${R.start2}/mesas`, users.start2.token, {})));
    const ok = all.filter((r) => r.status === 201).length;
    const count = await fsCount(`restaurantes/${R.start2}`, "mesas");
    expect(ok === 2 && count === 8, `criadas ${ok}, total ${count}, status ${all.map((r) => r.status).join(",")}`);
  });
  await test("M3", "Regras: dono não grava mesa direto no Firestore (contornar o limite)", async () => {
    const status = await rest("PATCH", `restaurantes/${R.start}/mesas/mesa-099`, users.start.token, { id: "mesa-099", number: 99, name: "Mesa 99", qrToken: "x", status: "livre", capacity: 4 });
    expect(status === 403, `status ${status}`);
  });
  await test("M4", "Business e Pro: mesas ilimitadas", async () => {
    const r = await api("POST", `/api/restaurants/${R.business}/mesas`, users.business.token, { quantity: 12 });
    expect(r.status === 201 && r.data.tables.length === 12, `${r.status}`);
  });

  // ───────── Pedidos ─────────
  await test("P1", "Start: não confirma pedido próprio", async () => {
    const r = await confirm(users.start.token, R.start, "pedido-start-1");
    expect(r.status === 402 && r.data.error === "quota_exceeded" && r.data.limit === 0, `${r.status} ${JSON.stringify(r.data)}`);
  });
  await test("P2", "Pro: confirma até o 150º e bloqueia o 151º pedido próprio", async () => {
    const a = await confirm(users.pro.token, R.pro, "pedido-pro-149");
    const b = await confirm(users.pro.token, R.pro, "pedido-pro-150");
    expect(a.status === 201 && b.status === 201 && b.data.usage.used === 150 && b.data.usage.remaining === 0, `${a.status} ${b.status} ${JSON.stringify(b.data.usage)}`);
    const c = await confirm(users.pro.token, R.pro, "pedido-pro-151");
    expect(c.status === 402 && c.data.error === "quota_exceeded" && c.data.used === 150 && c.data.limit === 150, `${c.status} ${JSON.stringify(c.data)}`);
    expect(c.data.message.startsWith("Você utilizou 150 de 150 pedidos neste mês."), c.data.message);
    expect((await usageOf(R.pro)) === 150, "contador ≠ 150");
    expect(!(await fsGet(`restaurantes/${R.pro}/pedidos/pedido-pro-151`)).data.quota, "pedido 151 foi gravado como confirmado");
  });
  await test("P3", "Pro no limite: pedidos do iFood e do 99Food entram e não consomem a franquia", async () => {
    const i = await external(R.pro, "ifood", "IFOOD-1001");
    const n = await external(R.pro, "99food", "99-2002");
    expect(i.status === 201 && n.status === 201, `${i.status} ${n.status} ${JSON.stringify(i.data)}`);
    const again = await external(R.pro, "ifood", "IFOOD-1001");
    expect(again.status === 200 && again.data.orderId === i.data.orderId, "reenvio do iFood criou outro pedido");
    expect((await usageOf(R.pro)) === 150, "marketplace mexeu no contador");
    const doc = (await fsGet(`restaurantes/${R.pro}/pedidos/${i.data.orderId}`)).data;
    expect(doc.origin?.source === "ifood" && doc.origin?.isNativeOrder === false && !doc.quota, JSON.stringify(doc.origin));
  });
  await test("P4", "Pedido repetido (mesmo id) não consome de novo", async () => {
    const r = await confirm(users.pro.token, R.pro, "pedido-pro-150");
    expect(r.status === 200 && r.data.duplicate === true && (await usageOf(R.pro)) === 150, `${r.status} ${JSON.stringify(r.data)}`);
  });
  await test("P5", "Origem não pode ser forjada: 'ifood' na confirmação é recusado; marketplace sem segredo do cliente é recusado", async () => {
    const fake = await confirm(users.pro2.token, R.pro2, "pedido-falso", "ifood");
    const noSecret = await external(R.pro2, "ifood", "X1", "segredo-errado-segredo-errado-segredo-errado");
    expect(fake.status === 400 && fake.data.error === "invalid_source" && noSecret.status === 401, `${fake.status} ${noSecret.status}`);
  });
  await test("P6", "Concorrência: 20 confirmações simultâneas com 10 de franquia restante → exatamente 150", async () => {
    const all = await Promise.all(Array.from({ length: 20 }, (_, i) => confirm(users.pro2.token, R.pro2, `paralelo-${i}`)));
    const ok = all.filter((r) => r.status === 201).length;
    const used = await usageOf(R.pro2);
    const events = (await fsList(`restaurantes/${R.pro2}`, "eventosUso")).length;
    expect(used === 150 && ok === 10 && events === 10, `confirmados ${ok}, contador ${used}, eventos ${events}, status ${[...new Set(all.map((r) => r.status))].join(",")}`);
  });
  await test("P7", "Requisições duplicadas simultâneas (mesma chave de idempotência) consomem uma vez", async () => {
    // Libera espaço no Pro 2 para este teste.
    await fsSet(`restaurantes/${R.pro2}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 100 });
    const key = `chave-${randomUUID()}`;
    const all = await Promise.all(Array.from({ length: 5 }, () => api("POST", "/api/pedidos/confirmar", users.pro2.token, { restaurantId: R.pro2, source: "kardap_table", idempotencyKey: key })));
    const created = all.filter((r) => r.status === 201).length;
    const ids = new Set(all.map((r) => r.data.orderId));
    expect(created === 1 && ids.size === 1 && (await usageOf(R.pro2)) === 101, `criados ${created}, ids ${ids.size}, contador ${await usageOf(R.pro2)}`);
  });
  await test("P8", "Business: confirma até o 500º e bloqueia o 501º", async () => {
    const a = await confirm(users.business.token, R.business, "b-499");
    const b = await confirm(users.business.token, R.business, "b-500");
    const c = await confirm(users.business.token, R.business, "b-501");
    expect(a.status === 201 && b.status === 201 && c.status === 402 && c.data.limit === 500, `${a.status} ${b.status} ${c.status}`);
  });
  await test("P9", "Enterprise: respeita o limite do contrato (1000) e o ilimitado", async () => {
    const a = await confirm(users.enterprise.token, R.enterprise, "e-1000");
    const b = await confirm(users.enterprise.token, R.enterprise, "e-1001");
    const free = await confirm(users.enterpriseFree.token, R.enterpriseFree, "livre-5001");
    expect(a.status === 201 && b.status === 402 && b.data.limit === 1000 && free.status === 201 && free.data.usage.limit === null, `${a.status} ${b.status} ${free.status}`);
  });
  await test("P10", "Papéis: caixa (permissão pdv) confirma pedido, mas não cria mesa nem mexe na assinatura; quem não é da equipe é barrado", async () => {
    await fsSet(`restaurantes/${R.pro}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 10 });
    const order = await confirm(users.cashier.token, R.pro, "pedido-do-caixa");
    const table = await api("POST", `/api/restaurants/${R.pro}/mesas`, users.cashier.token, {});
    const downgrade = await api("POST", "/api/billing/change-plan", users.cashier.token, { restaurantId: R.pro, planId: "start" });
    const outsider = await confirm(users.outsider.token, R.pro, "pedido-intruso");
    expect(order.status === 201 && table.status === 403 && downgrade.status === 403 && outsider.status === 403, `${order.status} ${table.status} ${downgrade.status} ${outsider.status}`);
  });
  await test("P11", "Virada do mês: consumo do mês anterior não conta no atual", async () => {
    const r = await api("GET", `/api/billing/entitlements?restaurantId=${R.trial}`, users.trial.token);
    expect(r.status === 200 && r.data.usage.nativeOrdersUsed === 0 && r.data.usage.periodId === PERIOD, `${r.status} ${JSON.stringify(r.data.usage)}`);
  });

  // ───────── Acesso ao PDV (login único) ─────────
  async function ssoSession(user) {
    const csrfRes = await fetch(`${APP}/api/auth/csrf`);
    const csrf = csrfRes.headers.getSetCookie().find((c) => c.startsWith("kardap_csrf="))?.split(";")[0].split("=")[1];
    const r = await fetch(`${APP}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-csrf-token": csrf, cookie: `kardap_csrf=${csrf}` }, body: JSON.stringify({ idToken: await freshToken(user) }) });
    const set = r.headers.getSetCookie().find((c) => c.startsWith("kardap_sso_session="));
    if (!set) throw new Error(`sessão não criada: ${r.status}`);
    return set.split(";")[0].slice("kardap_sso_session=".length);
  }
  const introspect = async (session) => (await fetch(`${APP}/api/sso/introspect`, { method: "POST", headers: { "content-type": "application/json", ...basic("pdv", PDV_SECRET) }, body: JSON.stringify({ session }) })).json();
  await test("A1", "Start não acessa o PDV (servidor central), com motivo 'plano'; Pro, teste e caixa acessam", async () => {
    const start = await introspect(await ssoSession(users.start));
    const pro = await introspect(await ssoSession(users.pro));
    const trial = await introspect(await ssoSession(users.trial));
    const cashier = await introspect(await ssoSession(users.cashier));
    expect(start.active && start.access.allowed === false && start.access.blocked?.[0]?.reason === "plan", `start ${JSON.stringify(start.access)}`);
    expect(pro.access.allowed && trial.access.allowed && cashier.access.allowed, `pro ${pro.access.allowed} teste ${trial.access.allowed} caixa ${cashier.access.allowed}`);
  });
  await test("A2", "Essencial antigo com pagamento pendente: mantém 30 mesas e acesso na carência", async () => {
    const r = await api("GET", `/api/billing/entitlements?restaurantId=${R.legacy}`, users.legacy.token);
    const e = r.data.entitlements;
    expect(e.planId === "start" && e.legacy && e.status === "past_due" && e.valid && e.limits.maxTables === 30 && r.data.pdv.allowed === false, JSON.stringify({ planId: e.planId, status: e.status, valid: e.valid, tables: e.limits.maxTables }));
  });

  // ───────── Cobrança (Cakto) ─────────
  let upgradeToken = "";
  await test("C1", "Checkout: upgrade liberado; downgrade direto, Enterprise e o mesmo plano recusados", async () => {
    const up = await api("POST", "/api/cakto/checkout", users.pro.token, { restaurantId: R.pro, planId: "business" });
    expect(up.status === 200 && up.data.kind === "upgrade" && up.data.checkoutUrl.includes(OFFERS.business), `${up.status} ${JSON.stringify(up.data)}`);
    upgradeToken = up.data.sessionToken;
    const down = await api("POST", "/api/cakto/checkout", users.business.token, { restaurantId: R.business, planId: "start" });
    const ent = await api("POST", "/api/cakto/checkout", users.pro.token, { restaurantId: R.pro, planId: "enterprise" });
    const same = await api("POST", "/api/cakto/checkout", users.pro.token, { restaurantId: R.pro, planId: "pro" });
    const cashier = await api("POST", "/api/cakto/checkout", users.cashier.token, { restaurantId: R.pro, planId: "business" });
    expect(down.status === 409 && ent.status === 400 && same.status === 409 && cashier.status === 403, `${down.status} ${ent.status} ${same.status} ${cashier.status}`);
  });
  const approved = (callback, offer, subscriptionId, orderId) => ({
    secret: "",
    event: "purchase_approved",
    data: { id: orderId, refId: orderId, callback, amount: 199.9, paymentMethod: "credit_card", paidAt: new Date().toISOString(), offer: { id: offer }, subscription: { id: subscriptionId, next_payment_date: future(30) }, customer: { email: "comprador@teste.kardap" } },
  });
  await test("C2", "Webhook sem assinatura válida é recusado", async () => {
    const r = await signedWebhook(approved(upgradeToken, OFFERS.business, "assinatura-business-nova", "pedido-up-1"), "segredo-errado");
    const still = (await fsGet(`restaurantes/${R.pro}`)).data.subscription.planId;
    expect(r.status === 401 && still === "pro", `${r.status} ${still}`);
  });
  await test("C3", "Upgrade Pro → Business confirmado pelo webhook: limite 500 e o consumo do mês preservado", async () => {
    await fsSet(`restaurantes/${R.pro}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 140 });
    const r = await signedWebhook(approved(upgradeToken, OFFERS.business, "assinatura-business-nova", "pedido-up-1"));
    const restaurant = (await fsGet(`restaurantes/${R.pro}`)).data;
    expect(r.status === 200 && restaurant.subscription.planId === "business" && restaurant.subscription.caktoSubscriptionId === "assinatura-business-nova", `${r.status} ${JSON.stringify(r.data)}`);
    const e = await api("GET", `/api/billing/entitlements?restaurantId=${R.pro}`, users.pro.token);
    expect(e.data.usage.nativeOrdersUsed === 140 && e.data.usage.nativeOrdersLimit === 500 && e.data.usage.remaining === 360, JSON.stringify(e.data.usage));
    const order = await confirm(users.pro.token, R.pro, "depois-do-upgrade");
    expect(order.status === 201 && order.data.usage.used === 141, `${order.status}`);
  });
  await test("C4", "Webhook repetido não duplica eventos nem pagamentos", async () => {
    const events = await fsCount(`restaurantes/${R.pro}`, "eventosAssinatura");
    const payments = await fsCount(`restaurantes/${R.pro}`, "pagamentos");
    const r = await signedWebhook(approved(upgradeToken, OFFERS.business, "assinatura-business-nova", "pedido-up-1"));
    expect(r.status === 200 && r.data.duplicate === true, JSON.stringify(r.data));
    expect((await fsCount(`restaurantes/${R.pro}`, "eventosAssinatura")) === events && (await fsCount(`restaurantes/${R.pro}`, "pagamentos")) === payments, "evento ou pagamento duplicado");
  });
  await test("C5", "Cancelamento da assinatura ANTIGA (depois do upgrade) não encerra o plano novo", async () => {
    const r = await signedWebhook({ secret: "", event: "subscription_canceled", data: { id: "cancelamento-antigo", subscription: { id: "assinatura-pro-antiga" }, canceledAt: new Date().toISOString() } });
    const s = (await fsGet(`restaurantes/${R.pro}`)).data.subscription;
    expect(r.status === 200 && s.status === "active" && s.planId === "business", `${r.status} ${s.status} ${s.planId}`);
  });
  await test("C6", "Pagar a oferta de um plano mais barato com o checkout de outro não ativa o plano caro", async () => {
    const co = await api("POST", "/api/cakto/checkout", users.start.token, { restaurantId: R.start, planId: "business" });
    const r = await signedWebhook(approved(co.data.sessionToken, OFFERS.start, "assinatura-trapaca", "pedido-trapaca"));
    const s = (await fsGet(`restaurantes/${R.start}`)).data.subscription;
    const failures = await fsList("", "falhasSincronizacao").catch(() => []);
    expect(r.status === 200 && r.data.note === "offer_mismatch" && s.planId === "start", `${r.status} ${JSON.stringify(r.data)} ${s.planId}`);
    void failures;
  });

  // ───────── Downgrade ─────────
  await test("D1", "Downgrade Business → Start: agendado para o fim do período, sem perder nada até lá", async () => {
    const r = await api("POST", "/api/billing/change-plan", users.business.token, { restaurantId: R.business, planId: "start" });
    const s = (await fsGet(`restaurantes/${R.business}`)).data.subscription;
    expect(r.status === 200 && s.scheduledChange?.planId === "start" && s.cancelAtPeriodEnd === true && s.planId === "business", `${r.status} ${JSON.stringify(r.data)}`);
    const table = await api("POST", `/api/restaurants/${R.business}/mesas`, users.business.token, {});
    expect(table.status === 201, `ainda Business, mesa: ${table.status}`);
  });
  await test("D2", "Depois da mudança para o Start: dados preservados, só novas criações acima do limite bloqueadas", async () => {
    const before = await fsCount(`restaurantes/${R.business}`, "mesas");
    const orders = await fsCount(`restaurantes/${R.business}`, "pedidos");
    const change = await api("POST", "/api/admin/assinaturas", users.admin.token, { restaurantId: R.business, action: "set_subscription", planId: "start", status: "active", reason: "Simulação: Start assinado no fim do período" });
    expect(change.status === 200, `admin ${change.status} ${JSON.stringify(change.data)}`);
    const table = await api("POST", `/api/restaurants/${R.business}/mesas`, users.business.token, {});
    const order = await confirm(users.business.token, R.business, "depois-do-downgrade");
    const after = await fsCount(`restaurantes/${R.business}`, "mesas");
    expect(table.status === 403 && order.status === 402 && after === before && (await fsCount(`restaurantes/${R.business}`, "pedidos")) === orders, `mesa ${table.status}, pedido ${order.status}, mesas ${before}→${after}`);
  });

  // ───────── Administração e auditoria ─────────
  await test("AD1", "Administração: só administradores, com motivo obrigatório e registro antes/depois", async () => {
    const owner = await api("POST", "/api/admin/assinaturas", users.pro.token, { restaurantId: R.pro, action: "set_subscription", planId: "enterprise", status: "active", reason: "tentativa do dono" });
    const noReason = await api("POST", "/api/admin/assinaturas", users.admin.token, { restaurantId: R.enterprise, action: "set_subscription", planId: "enterprise", status: "active", reason: "" });
    const ok = await api("POST", "/api/admin/assinaturas", users.admin.token, { restaurantId: R.enterprise, action: "set_subscription", planId: "enterprise", status: "active", customLimits: { maxNativeOrdersPerMonth: 2000 }, reason: "Aditivo de contrato: 2000 pedidos" });
    expect(owner.status === 403 && noReason.status === 400 && ok.status === 200, `${owner.status} ${noReason.status} ${ok.status}`);
    const logs = (await fsList("", "adminLog")).filter((l) => l.restaurantId === R.enterprise);
    const last = logs.find((l) => l.reason === "Aditivo de contrato: 2000 pedidos");
    expect(last && last.adminEmail === users.admin.email && last.before?.customLimits?.maxNativeOrdersPerMonth === 1000 && last.after?.customLimits?.maxNativeOrdersPerMonth === 2000, JSON.stringify(last || logs[0] || {}).slice(0, 200));
    const order = await confirm(users.enterprise.token, R.enterprise, "e-1001-depois");
    expect(order.status === 201, `novo limite: ${order.status}`);
  });
  await test("AD2", "Conferência do consumo (reconciliação) aponta e corrige com registro", async () => {
    const check = await api("POST", "/api/admin/assinaturas", users.admin.token, { restaurantId: R.pro2, action: "reconcile_usage", periodId: PERIOD });
    expect(check.status === 200 && check.data.consistent === false && check.data.confirmed === 11, JSON.stringify(check.data));
    const fix = await api("POST", "/api/admin/assinaturas", users.admin.token, { restaurantId: R.pro2, action: "reconcile_usage", periodId: PERIOD, apply: true, reason: "Ajuste após teste de carga" });
    expect(fix.data.applied && (await usageOf(R.pro2)) === 11, JSON.stringify(fix.data));
  });
  await test("AD3", "Pedido de proposta Enterprise registrado (e robô ignorado)", async () => {
    const ok = await api("POST", "/api/enterprise/contato", null, { name: "Ana Rede", email: "ana@rede.test", company: "Rede Sabor", units: "12" });
    const bot = await api("POST", "/api/enterprise/contato", null, { name: "Bot", email: "bot@x.test", company: "Bot", website: "http://spam" });
    const list = await fsList("", "propostasEnterprise");
    expect(ok.status === 201 && bot.status === 202 && list.length === 1 && list[0].company === "Rede Sabor", `${ok.status} ${bot.status} ${list.length}`);
  });

  // ───────── Regras do Firestore ─────────
  await test("R1", "Regras: dono não altera plano, limites, contador, origem dos pedidos nem confirma rascunho direto", async () => {
    const t = await freshToken(users.pro2);
    const plan = await rest("PATCH", `restaurantes/${R.pro2}`, t, { subscription: { planId: "enterprise", status: "active" } }, ["subscription"]);
    const usage = await rest("PATCH", `restaurantes/${R.pro2}/uso/${PERIOD}`, t, { nativeOrdersUsed: 0 }, ["nativeOrdersUsed"]);
    const forged = await rest("PATCH", `restaurantes/${R.pro2}/pedidos/forjado`, t, { status: "confirmado", origin: { source: "ifood", isNativeOrder: false } });
    const draft = await rest("PATCH", `restaurantes/${R.pro2}/pedidos/rascunho-1`, t, { status: "rascunho", itens: [] });
    const promote = await rest("PATCH", `restaurantes/${R.pro2}/pedidos/rascunho-1`, t, { status: "confirmado" }, ["status"]);
    expect(plan === 403 && usage === 403 && forged === 403 && draft === 200 && promote === 403, `plano ${plan}, contador ${usage}, origem ${forged}, rascunho ${draft}, promover ${promote}`);
  });
  await test("R2", "Regras: um estabelecimento não lê o consumo nem os pedidos de outro", async () => {
    const t = await freshToken(users.start);
    const other = await fsGet(`restaurantes/${R.pro2}/uso/${PERIOD}`, t);
    const orders = await fsGet(`restaurantes/${R.pro2}/pedidos/paralelo-0`, t);
    const own = await fsGet(`restaurantes/${R.start}/mesas/mesa-001`, t);
    expect(other.status === 403 && orders.status === 403 && own.status === 200, `${other.status} ${orders.status} ${own.status}`);
  });

  // ───────── Telas ─────────
  browser = await openBrowser();
  page = await browser.newPage(await browser.createContext());
  await test("U1", "Preços: quatro planos, Business 'Mais popular', Enterprise 'Sob consulta' e contato com vendas", async () => {
    await page.size(1366, 900);
    await page.goto(`${APP}/planos`);
    // Espera o React assumir a página (o HTML do servidor chega antes; clicar antes disso não faz nada).
    await page.waitFor(`document.querySelectorAll(".kd-plan").length === 4 && [...document.querySelectorAll(".kd-plan button")].some(b => Object.keys(b).some(k => k.startsWith("__reactProps")))`, 90000, "4 planos (hidratado)");
    const info = await page.evaluate(`({ names: [...document.querySelectorAll(".kd-plan-name")].map(e => e.textContent.trim()), popular: document.querySelector(".kd-plan.is-popular .kd-plan-name")?.textContent.trim(), ribbon: document.querySelector(".kd-plan-ribbon")?.textContent, prices: [...document.querySelectorAll(".kd-plan-price")].map(e => e.textContent.replace(/\\s+/g, " ").trim()) })`);
    expect(info.popular?.includes("Business") && info.ribbon === "Mais popular", JSON.stringify(info));
    expect(info.prices[0].includes("49,90") && info.prices[1].includes("129,90") && info.prices[2].includes("199,90") && info.prices[3].includes("Sob consulta"), info.prices.join(" | "));
    await page.shot("01-precos-computador");
    await page.click(byText(".kd-plan button", "Falar com vendas"));
    await page.waitFor(`!!${byText(".kd-modal h2", "Falar com vendas")}`, 5000, "modal Enterprise");
    await page.shot("02-enterprise-contato");
    await page.size(390, 844, true);
    await page.goto(`${APP}/planos`);
    await page.waitFor(`document.querySelectorAll(".kd-plan").length === 4`, 30000, "4 planos no celular");
    const overflow = await page.evaluate(`document.documentElement.scrollWidth > innerWidth + 1`);
    expect(!overflow, "rolagem horizontal no celular");
    await page.shot("03-precos-celular");
  });
  await test("U2", "Start: botão 'Acessar PDV' com cadeado abre 'Desbloqueie o PDV do KARDAP'", async () => {
    await page.size(1366, 900);
    await login(page, users.start);
    await page.waitFor(`!!document.querySelector(".kd-side .kd-pdv-btn.is-locked")`, 30000, "botão travado");
    await page.click(`document.querySelector(".kd-side .kd-pdv-btn")`);
    await page.waitFor(`!!${byText(".kd-modal h2", "Desbloqueie o PDV do KARDAP")}`, 5000, "modal");
    const modal = await page.evaluate(`document.querySelector(".kd-modal").textContent`);
    expect(modal.includes("Disponível a partir do plano Pro") && modal.includes("Conhecer planos") && modal.includes("Fazer upgrade"), modal.slice(0, 200));
    await page.shot("04-pdv-bloqueado-start");
  });
  await test("U3", "Start: Mesas mostra 'Mesas utilizadas: 8 de 8' e o aviso de limite", async () => {
    await page.goto(`${APP}/dashboard/mesas`);
    await page.waitFor(`document.body.textContent.includes("Mesas utilizadas: 8 de 8")`, 60000, "contador de mesas");
    await page.waitFor(`document.body.textContent.includes("Você atingiu o limite de 8 mesas do seu plano")`, 10000, "aviso");
    await page.shot("05-mesas-limite-start");
  });
  await test("U4", "Meu Plano (Pro no limite): 150/150, aviso de 100%, renovação da franquia e PDV liberado", async () => {
    const ctx = await browser.createContext();
    const p2 = await browser.newPage(ctx);
    page = p2;
    await fsSet(`restaurantes/${R.pro2}/uso/${PERIOD}`, { periodId: PERIOD, nativeOrdersUsed: 150 });
    await p2.size(1366, 900);
    await login(p2, users.pro2);
    await p2.goto(`${APP}/dashboard/plano`);
    await p2.waitFor(`document.body.textContent.includes("150 / 150")`, 60000, "consumo 150/150");
    const text = await p2.evaluate(`document.body.textContent`);
    expect(text.includes("Você utilizou 150 de 150 pedidos neste mês.") && text.includes("Renovação da franquia"), "aviso ou renovação ausente");
    const pdv = await p2.evaluate(`document.querySelector(".kd-side a.kd-pdv-btn")?.getAttribute("href")`);
    expect(pdv === "https://pdv.kardapp.online/", `link do PDV: ${pdv}`);
    const buttons = await p2.evaluate(`[...document.querySelectorAll("#planos-secao .kd-plan-action button")].map(b => b.textContent.trim())`);
    expect(buttons[0] === "Alterar plano" && buttons[1] === "Plano atual" && buttons[2] === "Fazer upgrade" && buttons[3] === "Falar com vendas", buttons.join(" | "));
    await p2.shot("06-meu-plano-pro-limite");
    await p2.size(390, 844, true);
    await p2.goto(`${APP}/dashboard/plano`);
    await p2.waitFor(`document.body.textContent.includes("150 / 150")`, 60000, "celular");
    const overflow = await p2.evaluate(`document.documentElement.scrollWidth > innerWidth + 1`);
    expect(!overflow, "rolagem horizontal no celular");
    await p2.shot("07-meu-plano-celular");
    expect(p2.errors.length === 0, p2.errors.join(" | "));
  });
} catch (error) {
  record("X", "execução", false, error.stack || error.message);
} finally {
  try {
    browser?.ws.close();
  } catch {}
  killTree(browser?.proc);
  killTree(server);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passaram`);
  fs.writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
