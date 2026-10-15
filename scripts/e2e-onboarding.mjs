// Testes de ponta a ponta do cadastro, escolha de plano e teste grátis de 30 dias (docs/PLANOS.md, "Teste grátis"),
// contra os emuladores do Firebase, com as regras do repositório.
//
// Cobre os 12 cenários pedidos: conta nova + escolha de plano; onboarding concluído com sucesso; abandono e volta
// (persistência); dados inválidos; falha de rede durante o salvamento (recuperação automática); clique duplo no
// botão de concluir; acesso a recurso de outro plano (bloqueado no servidor); acesso ao painel durante o teste;
// expiração do teste; contratação depois do teste; login de quem já tem conta; tentativa de obter outro teste
// grátis (segunda conta/segundo estabelecimento).
//
// Pré-requisito: emuladores rodando (firebase emulators:start --only auth,firestore,storage --project demo-kardap).
// O script sobe o app em http://localhost:3100 (ou usa o que já estiver no ar com as mesmas variáveis).
// Uso: node scripts/e2e-onboarding.mjs [pasta-de-capturas]
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "kardap-onboarding-")));
fs.mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:3100";
const PROJECT = "demo-kardap";
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `http://127.0.0.1:8080/v1/${DOCS}`;
const AUTH = "http://127.0.0.1:9099";
const EDGE = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let page = null;
// Página logada como a dona do restaurante 1 (Bistrô da Dona / Business), usada ao longo da narrativa 2→8→9→10;
// os testes 3-7 usam páginas próprias (descartáveis) e não devem mexer nesta referência.
let mainPage = null;
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
// Um PATCH sem updateMask SUBSTITUI o documento inteiro pelos campos dados — não é um merge. fsSet() é para
// gravar (ou sobrescrever de propósito) um documento inteiro; para mudar só alguns campos, usar fsMerge().
async function fsSet(docPath, data) {
  const r = await fetch(`${FS}/${docPath}`, { method: "PATCH", headers: { "content-type": "application/json", ...admin }, body: JSON.stringify({ fields: toFields(data) }) });
  if (!r.ok) throw new Error(`seed ${docPath}: ${r.status} ${await r.text()}`);
}
/** Lê o documento e regrava com os campos de `patch` sobrepostos (merge raso, nível superior). */
async function fsMerge(docPath, patch) {
  const current = await fsGet(docPath);
  await fsSet(docPath, { ...(current.data || {}), ...patch });
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
async function createUser(email, password = "senha-teste-123") {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const body = await r.json();
  if (!body.localId) throw new Error(`usuário ${email}: ${JSON.stringify(body)}`);
  return { uid: body.localId, email, password, token: body.idToken };
}
async function freshToken(user) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true }) });
  return (await r.json()).idToken;
}
async function api(method, url, token, body) {
  const r = await fetch(`${APP}${url}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// ───────── App (usa o que já estiver no ar, se as variáveis baterem) ─────────
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
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
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

// ───────── Navegador (CDP) ─────────
async function openBrowser() {
  const port = 9250 + Math.floor(Math.random() * 90);
  const proc = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(OUT, ".edge-onb-" + port)}`, "--no-first-run", "--disable-extensions", "about:blank"], { stdio: "ignore" });
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
      await s("Network.enable");
      await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
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
        network: (opts) => s("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, ...opts }),
        async goto(url) {
          const loaded = new Promise((resolve) => {
            const l = (m) => {
              if (m.sessionId === sessionId && m.method === "Page.loadEventFired") resolve();
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
            await sleep(250);
          }
          throw new Error(`tempo esgotado esperando: ${label}`);
        },
        async fill(label, value) {
          const ok = await evaluate(`(() => { const lab = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)})); const el = lab && (document.getElementById(lab.htmlFor) || lab.querySelector("input,textarea")); if (!el) return false; const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
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
    disposeContext: (id) => send("Target.disposeBrowserContext", { browserContextId: id }),
  };
}
const byText = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim().includes(${JSON.stringify(text)}))`;

async function fillSignupForm(p, name, email, password) {
  await p.goto(`${APP}/criar-conta`);
  await p.waitFor(`["Seu nome", "E-mail", "Senha"].every(t => [...document.querySelectorAll("label")].some(l => l.textContent.trim() === t))`, 90000, "formulário de cadastro");
  await sleep(1500);
  await p.fill("Seu nome", name);
  await p.fill("E-mail", email);
  await p.fill("Senha", password);
  await p.evaluate(`(() => { const box = [...document.querySelectorAll("input[type=checkbox]")].find(c => c.closest("label")?.textContent.includes("Termos")); if (box && !box.checked) box.click(); return !!box; })()`);
}

const planStep = () => page.waitFor(`document.body.textContent.includes("Qual plano você quer testar?") && document.querySelectorAll(".kd-onb-plan").length === 3`, 30000, "etapa de escolha de plano");
const businessStep = () => page.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Nome do estabelecimento"))`, 30000, "etapa do estabelecimento");
const reviewStep = () => page.waitFor(`document.body.textContent.includes("Tudo pronto para publicar")`, 30000, "etapa de revisão");
/** Clica no cartão do plano pelo nome exibido ("Start", "Pro" ou "Business") e confirma a seleção. */
async function selectPlan(p, name) {
  const ok = await p.evaluate(`(() => { const el = ${byText(".kd-onb-plan-name", name)}?.closest(".kd-onb-plan"); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`cartão do plano não encontrado: ${name}`);
  await p.waitFor(`document.querySelector(".kd-onb-plan.is-selected .kd-onb-plan-name")?.textContent.trim() === ${JSON.stringify(name)}`, 3000, `${name} selecionado`);
}
const clickContinue = (p) => p.evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Continuar" && !b.disabled)?.click(), true`);
/** Preenche e envia o login. Se o formulário sumir (o next dev pode recarregar ao compilar uma rota nova), tenta de novo. */
async function loginForm(p, email, password) {
  for (let attempt = 1; ; attempt++) {
    await p.waitFor(
      `location.pathname === "/login" && !!document.querySelector("form fieldset") && !document.querySelector("form fieldset").disabled && [...document.querySelectorAll("label")].some(l => l.textContent.trim().startsWith("Senha"))`,
      90000,
      "formulário de login",
    );
    await sleep(1200); // hidratação do React
    try {
      await p.fill("E-mail", email);
      await p.fill("Senha", password);
      await p.evaluate(`document.querySelector("form button[type=submit]").click()`);
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}
async function fillBusinessStep(p, name) {
  await businessStep();
  await p.fill("Nome do estabelecimento", name);
  await clickContinue(p);
  await p.waitFor(`document.querySelectorAll(".kd-onb-upload input[type=file]").length === 2`, 15000, "etapa de marca");
  await p.click(byText("button", "Pular por agora"));
  await p.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Link de avaliação"))`, 15000, "etapa de avaliações");
  await p.click(byText("button", "Pular por agora"));
  await p.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Quantidade de mesas"))`, 15000, "etapa de mesas");
}
async function startSignupToPlanStep(p, name, email) {
  await fillSignupForm(p, name, email, "senha-teste-123");
  await p.evaluate(`document.querySelector("form button[type=submit]").click()`);
  await p.waitFor(`location.pathname === "/onboarding"`, 90000, "redirecionado ao onboarding");
  await planStep();
}

let browser;
try {
  console.log(`Capturas e registros: ${OUT}`);
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await waitHttp(`${APP}/api/auth/csrf`);
  browser = await openBrowser();

  // ───────── 1-2. Conta nova, escolha de plano, onboarding concluído ─────────
  const email1 = `dona-${Date.now()}@teste.kardap`;
  let restaurantId1 = "";
  await test("U1", "Conta nova: tela de escolha de plano mostra os 3 planos reais, com preço e o Business em destaque", async () => {
    page = await browser.newPage(await browser.createContext());
    await startSignupToPlanStep(page, "Dona do Bistrô", email1);
    const info = await page.evaluate(`({
      names: [...document.querySelectorAll(".kd-onb-plan-name")].map(e => e.textContent.trim()),
      prices: [...document.querySelectorAll(".kd-onb-plan-price")].map(e => e.textContent.replace(/\\s+/g, " ").trim()),
      popular: document.querySelector(".kd-onb-plan.is-popular .kd-onb-plan-name")?.textContent.trim(),
      selected: document.querySelector(".kd-onb-plan.is-selected .kd-onb-plan-name")?.textContent.trim(),
    })`);
    expect(JSON.stringify(info.names) === JSON.stringify(["Start", "Pro", "Business"]), `planos: ${info.names.join(", ")}`);
    expect(info.prices[0].includes("49,90") && info.prices[1].includes("129,90") && info.prices[2].includes("199,90"), info.prices.join(" | "));
    expect(info.popular === "Business", `destaque: ${info.popular}`);
    expect(info.selected === "Pro", `pré-selecionado: ${info.selected}`);
    await page.shot("01-escolha-plano");
  });

  await test("U2", "Escolher o Business, preencher as etapas e concluir: restaurante criado, teste de 30 dias do Business ativo", async () => {
    await selectPlan(page, "Business");
    await clickContinue(page);
    await fillBusinessStep(page, "Bistrô da Dona");
    await page.fill("Quantidade de mesas", "5");
    await clickContinue(page);
    await reviewStep();
    const summary = await page.evaluate(`document.querySelector(".kd-onb-summary").textContent`);
    expect(summary.includes("Business") && summary.includes("30 dias grátis"), summary.slice(0, 200));
    await page.shot("02-revisao");
    await page.click(byText("button", "Concluir e abrir o painel"));
    await page.waitFor(`location.pathname === "/dashboard"`, 60000, "painel aberto");
    await sleep(1000);
    expect(page.errors.length === 0, "erros no console: " + page.errors.join(" | "));

    const restaurants = await fsList("", "restaurantes");
    const mine = restaurants.find((r) => r.name === "Bistrô da Dona");
    expect(!!mine, "restaurante não encontrado no Firestore");
    restaurantId1 = mine.id;
    expect(mine.subscription?.planId === "business" && mine.subscription?.status === "trialing", `assinatura: ${JSON.stringify(mine.subscription)}`);
    const trialEnd = Date.parse(mine.subscription.trialEndsAt);
    const days = Math.round((trialEnd - Date.now()) / 86400000);
    expect(days >= 29 && days <= 30, `prazo do teste: ${days} dias (esperado ~30)`);
    expect(!!mine.onboarding?.completed, "onboarding não marcado como concluído");
    expect(mine.onboarding?.selectedPlanId === "business", `plano salvo no onboarding: ${mine.onboarding?.selectedPlanId}`);
    expect(!!mine.trialActivatedAt, "trialActivatedAt não gravado");
    const tables = await fsList(`restaurantes/${restaurantId1}`, "mesas");
    expect(tables.length === 5, `mesas criadas: ${tables.length}`);
    const events = await fsList(`restaurantes/${restaurantId1}`, "eventosAssinatura");
    expect(events.some((e) => e.type === "trial_activated"), "evento trial_activated não registrado");
    const user = await fsGet(`usuarios/${mine.ownerId}`);
    expect(user.data?.trialActivatedAt && user.data?.trialRestaurantId === restaurantId1, `usuarios/{uid}: ${JSON.stringify(user.data)}`);
    mainPage = page; // os testes 3-7 usam páginas próprias; U8/U9 retomam esta sessão explicitamente
  });

  // ───────── 3. Abandono e retomada (persistência do rascunho) ─────────
  await test("U3", "Abandona o onboarding no meio e volta: plano e dados preenchidos continuam lá, sem recriar o restaurante", async () => {
    const email = `abandona-${Date.now()}@teste.kardap`;
    page = await browser.newPage(await browser.createContext());
    await startSignupToPlanStep(page, "Vai e Volta", email);
    await selectPlan(page, "Start");
    await clickContinue(page);
    await page.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Nome do estabelecimento"))`, 15000, "etapa do estabelecimento");
    await page.fill("Nome do estabelecimento", "Padaria Inacabada");
    await sleep(600); // o rascunho é salvo a cada mudança (cookie) e a cada "Continuar" (Firestore)

    const restaurantsBefore = (await fsList("", "restaurantes")).length;
    await page.goto(`${APP}/onboarding`);
    await page.waitFor(`document.querySelectorAll(".kd-onb-upload input[type=file]").length === 2 || [...document.querySelectorAll("label")].some(l => l.textContent.includes("Nome do estabelecimento"))`, 60000, "onboarding retomado");
    // O passo salvo no Firestore (após o primeiro "Continuar") é de onde ele retoma; os dados preenchidos continuam.
    const name = await page.evaluate(`document.getElementById([...document.querySelectorAll("label")].find(l => l.textContent.includes("Nome do estabelecimento"))?.htmlFor)?.value || ""`);
    expect(name === "Padaria Inacabada", `nome recuperado: "${name}"`);
    const restaurantsAfter = (await fsList("", "restaurantes")).length;
    expect(restaurantsAfter === restaurantsBefore, `restaurantes antes ${restaurantsBefore}, depois ${restaurantsAfter} (não deveria duplicar)`);
    await page.shot("03-retomado");
  });

  // ───────── 4. Dados inválidos ─────────
  await test("U4", "Dados inválidos: nome curto e quantidade de mesas fora do intervalo são barrados com mensagem clara", async () => {
    const email = `invalido-${Date.now()}@teste.kardap`;
    page = await browser.newPage(await browser.createContext());
    await startSignupToPlanStep(page, "Teste Inválido", email);
    await clickContinue(page);
    await page.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Nome do estabelecimento"))`, 15000, "etapa do estabelecimento");
    await clickContinue(page);
    await sleep(500);
    const nameError = await page.evaluate(`document.body.textContent.includes("Informe o nome do estabelecimento")`);
    expect(nameError, "não mostrou o erro de nome");
    expect((await page.evaluate(`location.pathname`)) === "/onboarding", "avançou mesmo com nome inválido");

    await page.fill("Nome do estabelecimento", "Padaria Válida");
    await clickContinue(page);
    await page.waitFor(`document.querySelectorAll(".kd-onb-upload input[type=file]").length === 2`, 15000, "marca");
    await page.click(byText("button", "Pular por agora"));
    await page.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Link de avaliação"))`, 15000, "avaliações");
    await page.click(byText("button", "Pular por agora"));
    await page.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.includes("Quantidade de mesas"))`, 15000, "mesas");
    await page.fill("Quantidade de mesas", "500");
    await clickContinue(page);
    await sleep(500);
    const tableError = await page.evaluate(`document.body.textContent.includes("Informe de 0 a 200 mesas")`);
    expect(tableError, "não mostrou o erro de quantidade de mesas");
    await page.shot("04-dados-invalidos");
  });

  // ───────── 5. Falha de rede durante o salvamento (recupera sozinho) ─────────
  await test("U5", "Falha de rede ao criar as mesas: tenta de novo sozinho e conclui o cadastro mesmo assim", async () => {
    const email = `rede-instavel-${Date.now()}@teste.kardap`;
    page = await browser.newPage(await browser.createContext());
    await startSignupToPlanStep(page, "Rede Instável", email);
    await clickContinue(page);
    await fillBusinessStep(page, "Hamburgueria da Rede Fraca");
    await page.fill("Quantidade de mesas", "3");
    await clickContinue(page);
    await reviewStep();

    // Simula uma rede que falha por alguns segundos bem no momento de concluir (a nova tentativa automática
    // do cliente, com espera entre tentativas, deve superar isso sem travar o cadastro).
    await page.click(byText("button", "Concluir e abrir o painel"));
    await page.network({ offline: true });
    await sleep(3000);
    await page.network({ offline: false });
    await page.waitFor(`location.pathname === "/dashboard"`, 60000, "concluiu mesmo com a rede instável");
    const restaurants = await fsList("", "restaurantes");
    const mine = restaurants.find((r) => r.name === "Hamburgueria da Rede Fraca");
    expect(!!mine && mine.onboarding?.completed, "onboarding não foi concluído depois da instabilidade");
    await page.shot("05-rede-instavel-concluido");
  });

  // ───────── 6. Clique duplo no botão de concluir ─────────
  await test("U6", "Clicar várias vezes em 'Concluir' não cria mesas nem ativa o teste em duplicidade", async () => {
    const email = `clique-duplo-${Date.now()}@teste.kardap`;
    page = await browser.newPage(await browser.createContext());
    await startSignupToPlanStep(page, "Clique Duplo", email);
    await clickContinue(page);
    await fillBusinessStep(page, "Clique Duplo Ltda");
    await page.fill("Quantidade de mesas", "4");
    await clickContinue(page);
    await reviewStep();
    // 5 cliques rápidos: o botão deve desabilitar sozinho assim que o primeiro clique começa a processar.
    await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.includes("Concluir e abrir o painel")); for (let i = 0; i < 5; i++) b.click(); return true; })()`);
    await page.waitFor(`location.pathname === "/dashboard"`, 60000, "concluiu");
    const restaurants = await fsList("", "restaurantes");
    const mine = restaurants.find((r) => r.name === "Clique Duplo Ltda");
    const tables = await fsList(`restaurantes/${mine.id}`, "mesas");
    const events = await fsList(`restaurantes/${mine.id}`, "eventosAssinatura");
    expect(tables.length === 4, `mesas criadas: ${tables.length} (esperado 4, não 8, 12...)`);
    expect(events.filter((e) => e.type === "trial_activated").length === 1, `eventos de ativação: ${events.filter((e) => e.type === "trial_activated").length}`);
  });

  // ───────── 7. Recurso de outro plano (Start não acessa o PDV) ─────────
  await test("U7", "Quem escolheu o Start não acessa o PDV durante o teste (bloqueado no servidor, não só escondido na tela)", async () => {
    const email = `start-${Date.now()}@teste.kardap`;
    page = await browser.newPage(await browser.createContext());
    await startSignupToPlanStep(page, "Dono do Start", email);
    await selectPlan(page, "Start");
    await clickContinue(page);
    await fillBusinessStep(page, "Café do Start");
    await page.fill("Quantidade de mesas", "2");
    await clickContinue(page);
    await reviewStep();
    await page.click(byText("button", "Concluir e abrir o painel"));
    await page.waitFor(`location.pathname === "/dashboard"`, 60000, "painel aberto");

    const restaurants = await fsList("", "restaurantes");
    const mine = restaurants.find((r) => r.name === "Café do Start");
    expect(mine.subscription?.planId === "start", `plano: ${mine.subscription?.planId}`);
    // PDV travado na tela (cadeado), e travado de verdade no servidor (API de recursos efetivos).
    await page.waitFor(`!!document.querySelector(".kd-pdv-btn.is-locked")`, 15000, "botão do PDV com cadeado");
    const token = await freshToken({ email, password: "senha-teste-123" });
    const ent = await api("GET", `/api/billing/entitlements?restaurantId=${mine.id}`, token);
    expect(ent.status === 200 && ent.data.entitlements.features.pdvAccess === false && ent.data.pdv.allowed === false, JSON.stringify(ent.data.entitlements?.features));
    const order = await api("POST", "/api/pedidos/confirmar", token, { restaurantId: mine.id, source: "kardap_pdv", orderId: "pedido-start-1" });
    expect(order.status === 402, `pedido próprio no Start: ${order.status} (deveria ser bloqueado, 402)`);
    await page.shot("06-start-pdv-travado");
  });

  // ───────── 8. Acesso ao painel durante o teste ─────────
  await test("U8", "Durante o teste, o painel mostra o nome real do plano escolhido e os dias restantes (não hardcoded 'Pro')", async () => {
    page = mainPage; // retoma a sessão da dona do Bistrô (Business), não a última página criada em U3-U7
    await page.goto(`${APP}/dashboard`);
    await page.waitFor(`document.body.textContent.includes("Teste grátis do Business")`, 30000, "faixa do plano no painel");
    const text = await page.evaluate(`document.querySelector(".kd-side-plan")?.textContent || ""`);
    expect(text.includes("Business") && text.includes("dia"), text);
    await page.goto(`${APP}/dashboard/plano`);
    await page.waitFor(`document.body.textContent.includes("Business")`, 30000, "Meu plano");
    const my = await page.evaluate(`document.body.textContent`);
    expect(my.includes("Teste grátis") || my.includes("Assinatura em dia") || my.includes("Business"), "Meu plano não reflete o Business");
    await page.shot("07-painel-durante-teste");
  });

  // ───────── 9. Expiração do teste ─────────
  await test("U9", "Teste expirado: acesso cai para o básico, mas nada é apagado (produtos, mesas, pedidos continuam)", async () => {
    page = mainPage;
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const current = await fsGet(`restaurantes/${restaurantId1}`);
    await fsMerge(`restaurantes/${restaurantId1}`, { subscription: { ...current.data.subscription, trialEndsAt: past } });

    const token = await freshToken({ email: email1, password: "senha-teste-123" });
    const ent = await api("GET", `/api/billing/entitlements?restaurantId=${restaurantId1}`, token);
    expect(ent.data.entitlements.valid === false && ent.data.entitlements.reason === "trial_ended", JSON.stringify(ent.data.entitlements));
    expect(ent.data.pdv.allowed === false, "PDV deveria estar bloqueado após o teste expirar");

    await page.goto(`${APP}/dashboard/plano`);
    await page.waitFor(`document.body.textContent.includes("terminou") || document.body.textContent.includes("Teste encerrado")`, 30000, "aviso de teste encerrado");
    const text = await page.evaluate(`document.body.textContent`);
    expect(text.includes("Business"), "não menciona o plano Business que estava em teste");
    await page.shot("08-teste-expirado");

    const tables = await fsList(`restaurantes/${restaurantId1}`, "mesas");
    expect(tables.length === 5, `mesas preservadas: ${tables.length}`);
  });

  // ───────── 10. Contratar depois do teste ─────────
  await test("U10", "Depois do teste expirado, o checkout do plano continua disponível (contratação)", async () => {
    const token = await freshToken({ email: email1, password: "senha-teste-123" });
    const checkout = await api("POST", "/api/cakto/checkout", token, { restaurantId: restaurantId1, planId: "business" });
    // Sem oferta configurada neste teste (não é o foco aqui): o importante é que o pedido seja aceito como uma
    // NOVA contratação (não recusado por já ter uma assinatura "em dia", já que o teste expirou).
    expect(checkout.status === 200 || checkout.data?.code === "offer_not_configured", `checkout: ${checkout.status} ${JSON.stringify(checkout.data)}`);
  });

  // ───────── 11. Quem já tem conta, loga de novo ─────────
  await test("U11", "Login de quem já tem conta e já concluiu o onboarding: vai direto para o painel, sem passar pela escolha de plano", async () => {
    page = await browser.newPage(await browser.createContext());
    await page.goto(`${APP}/login`);
    await loginForm(page, email1, "senha-teste-123");
    await page.waitFor(`location.pathname === "/dashboard"`, 60000, "painel direto");
    expect((await page.evaluate(`location.pathname`)) === "/dashboard", "não foi direto ao painel");
    mainPage = page;
  });

  // ───────── 12. Tentar obter outro teste grátis indevidamente ─────────
  await test("U12", "Mesma conta não consegue um segundo teste criando outro estabelecimento, nem chamando a API de novo", async () => {
    const token = await freshToken({ email: email1, password: "senha-teste-123" });
    // 12a: POST /api/restaurants de novo devolve o MESMO estabelecimento (não cria um segundo).
    const again = await api("POST", "/api/restaurants", token, { name: "Segundo Restaurante Indevido" });
    expect(again.status === 200 && again.data.restaurantId === restaurantId1, `esperava reaproveitar ${restaurantId1}, veio ${JSON.stringify(again.data)}`);
    const count = (await fsList("", "restaurantes")).filter((r) => r.ownerId && r.name === "Segundo Restaurante Indevido").length;
    expect(count === 0, "criou um restaurante com o nome indevido");

    // 12b: chamar a ativação do teste de novo no MESMO estabelecimento é idempotente (não estende o prazo).
    const before = await fsGet(`restaurantes/${restaurantId1}`);
    const again2 = await api("POST", "/api/billing/activate-trial", token, { restaurantId: restaurantId1, planId: "pro" });
    const after = await fsGet(`restaurantes/${restaurantId1}`);
    expect(again2.status === 200 && again2.data.activated === false, `segunda ativação: ${again2.status} ${JSON.stringify(again2.data)}`);
    expect(after.data.subscription.trialEndsAt === before.data.subscription.trialEndsAt, "o prazo do teste mudou numa chamada repetida");
    expect(after.data.subscription.planId === before.data.subscription.planId, "o plano mudou numa chamada repetida (deveria ignorar o novo planId)");

    // 12c: um estabelecimento NOVO, criado manualmente (contornando o passo 12a), para o MESMO uid, não recebe teste.
    const secondId = `segundo-${Date.now()}`;
    await fsSet(`restaurantes/${secondId}`, { name: "Filial Oportunista", ownerId: (await fsGet(`restaurantes/${restaurantId1}`)).data.ownerId, status: "active", createdAt: new Date().toISOString() });
    const trialOnSecond = await api("POST", "/api/billing/activate-trial", token, { restaurantId: secondId, planId: "pro" });
    expect(trialOnSecond.status === 409 && trialOnSecond.data.error === "trial_already_used", `${trialOnSecond.status} ${JSON.stringify(trialOnSecond.data)}`);

    // 12d: um estabelecimento de outra pessoa não é afetado (nunca usou o teste).
    const other = await createUser(`outra-pessoa-${Date.now()}@teste.kardap`);
    await fsSet(`restaurantes/outro-restaurante-${Date.now()}`, { name: "Restaurante de Outra Pessoa", ownerId: other.uid, status: "active", createdAt: new Date().toISOString() });
    const restaurants = await fsList("", "restaurantes");
    const theirs = restaurants.find((r) => r.ownerId === other.uid);
    const theirToken = await freshToken(other);
    const theirTrial = await api("POST", "/api/billing/activate-trial", theirToken, { restaurantId: theirs.id, planId: "start" });
    expect(theirTrial.status === 201 && theirTrial.data.activated === true, `outra pessoa deveria conseguir o próprio teste: ${theirTrial.status} ${JSON.stringify(theirTrial.data)}`);
  });

  await test("U13", "Nenhum erro de JavaScript acumulado nas telas visitadas", async () => {
    expect(page.errors.length === 0, page.errors.join(" | "));
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
