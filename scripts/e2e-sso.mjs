// Testes de ponta a ponta do SSO (SSO_INTEGRATION.md): KARDAP como servidor central e um PDV de teste, contra os
// emuladores do Firebase.
//
// O script monta um PDV de teste com o kit integrations/pdv-sso (os mesmos arquivos que vão para o repositório
// do PDV, sem credencial do Firebase Admin: o PDV fala com o servidor central usando só o segredo do cliente),
// sobe os dois apps e abre um navegador em que kardap.test e
// pdv.kardap.test apontam para esta máquina (só dentro do navegador de teste). Assim os cookies de domínio
// (.kardap.test) se comportam como em kardapp.online / pdv.kardapp.online. Cookies Secure: o navegador trata as
// duas origens de teste como seguras (--unsafely-treat-insecure-origin-as-secure).
//
// Pré-requisitos (docs/TESTES.md): emuladores rodando
//   firebase emulators:start --only auth,firestore,storage --project demo-kardap
// e as portas 3100 e 3200 livres. Uso: node scripts/e2e-sso.mjs [pasta-de-capturas]
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "kardap-sso-")));
fs.mkdirSync(OUT, { recursive: true });
const KARDAP = "http://kardap.test:3100";
const PDV = "http://pdv.kardap.test:3200";
const K_LOCAL = "http://127.0.0.1:3100";
const P_LOCAL = "http://127.0.0.1:3200";
const PROJECT = "demo-kardap";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = "http://127.0.0.1:9099";
const EDGE = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// ───────── 1. PDV de teste montado a partir do kit ─────────
const PDV_DIR = path.join(os.tmpdir(), "kardap-pdv-sso-app");
const KIT = path.join(ROOT, "integrations", "pdv-sso");
fs.mkdirSync(PDV_DIR, { recursive: true });
for (const dir of ["app", "lib", "components"]) fs.rmSync(path.join(PDV_DIR, dir), { recursive: true, force: true });
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
const copyTree = (from, to, skip = () => false) => {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    if (skip(src)) continue;
    if (entry.isDirectory()) copyTree(src, path.join(to, entry.name), skip);
    else copy(src, path.join(to, entry.name));
  }
};
// Do KARDAP, sem alteração (SSO_INTEGRATION.md, "Instruções de integração").
for (const file of ["lib/sso/config.ts", "lib/sso/http.ts", "lib/sso/client.ts", "app/api/auth/csrf/route.ts"]) {
  copy(path.join(ROOT, file), path.join(PDV_DIR, file));
}
// Do kit (passo 2) e as páginas de teste.
copyTree(KIT, PDV_DIR, (src) => src.startsWith(path.join(KIT, "test-app")) || /README\.md$|\.env\.example$/.test(src));
copyTree(path.join(KIT, "test-app"), PDV_DIR);
fs.writeFileSync(path.join(PDV_DIR, "package.json"), JSON.stringify({ name: "pdv-sso-test", private: true }, null, 2));
fs.writeFileSync(path.join(PDV_DIR, "next-env.d.ts"), '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');
if (!fs.existsSync(path.join(PDV_DIR, "node_modules"))) fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(PDV_DIR, "node_modules"), "junction");

// Tipagem do kit montado (o mesmo que o build do PDV vai checar).
const tsc = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", PDV_DIR], { encoding: "utf8" });
record("K1", "Kit do PDV compila (TypeScript estrito)", tsc.status === 0, tsc.status === 0 ? "" : (tsc.stdout + tsc.stderr).split("\n").slice(0, 6).join(" | "));
const pdvSources = [];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? !["node_modules", ".next"].includes(e.name) && walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && pdvSources.push(path.join(dir, e.name))));
walk(PDV_DIR);
const adminImports = pdvSources.filter((f) => /from ["']firebase-admin|lib\/firebase-admin/.test(fs.readFileSync(f, "utf8")));
record("K2", "PDV sem Firebase Admin: login, sessão e custom token só pelo servidor central", adminImports.length === 0, adminImports.map((f) => path.relative(PDV_DIR, f)).join(", "));

// ───────── 2. Os dois apps ─────────
const CLIENT_SECRET = randomBytes(36).toString("base64url"); // segredo do PDV, gerado para esta execução
const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(FIREBASE_|FIRESTORE_|SSO_|NEXT_PUBLIC_)/.test(k)));
const sharedEnv = {
  ...inherited,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_FIREBASE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-kardap.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-kardap.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
  SSO_COOKIE_DOMAIN: ".kardap.test",
  SSO_ALLOWED_ORIGINS: `${KARDAP},${PDV}`,
  NEXT_PUBLIC_KARDAP_ORIGIN: KARDAP,
  NEXT_PUBLIC_PDV_ORIGIN: PDV,
};
// KARDAP: Admin SDK nos emuladores (projeto demo-*) e o segredo do cliente PDV.
const kardapEnv = {
  ...sharedEnv,
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  SSO_CLIENT_SECRET_PDV: CLIENT_SECRET,
};
// PDV: nenhuma credencial do Firebase Admin; só o segredo do cliente e o endereço do servidor central.
const pdvEnv = { ...sharedEnv, SSO_CLIENT_ID: "pdv", SSO_CLIENT_SECRET: CLIENT_SECRET, SSO_CENTRAL_URL: K_LOCAL };
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const servers = [];
function startServer(cwd, port, log, env) {
  const fd = fs.openSync(path.join(OUT, log), "w");
  const proc = spawn(process.execPath, [NEXT_BIN, "dev", "-p", String(port)], { cwd, env, stdio: ["ignore", fd, fd] });
  servers.push(proc);
  return proc;
}
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
startServer(ROOT, 3100, "kardap-server.log", kardapEnv);
startServer(PDV_DIR, 3200, "pdv-server.log", pdvEnv);
await Promise.all([waitHttp(`${K_LOCAL}/api/auth/csrf`), waitHttp(`${P_LOCAL}/sem-permissao`)]);
// Aquecimento: compila páginas e rotas antes dos cenários. A primeira compilação do next dev é lenta e, numa pasta
// .next recém-criada (ainda mais dentro de uma pasta sincronizada, como o OneDrive), pode falhar uma vez.
async function warm(url, headers = {}) {
  for (let i = 0; i < 5; i++) {
    try {
      if ((await fetch(url, { redirect: "manual", headers })).status < 500) return;
    } catch {}
    await sleep(3000);
  }
}
const fakeSession = { cookie: "kardap_sso_session=aquecimento~0123456789abcdefghij" };
for (const [url, headers] of [
  [`${K_LOCAL}/login`],
  [`${K_LOCAL}/login?returnTo=%2Fdashboard`, fakeSession],
  [`${K_LOCAL}/dashboard`],
  [`${K_LOCAL}/logout`],
  [`${K_LOCAL}/api/auth/session`],
  [`${P_LOCAL}/caixa`, fakeSession],
]) {
  await warm(url, headers);
}

// ───────── 3. Navegador (CDP) ─────────
const port = 9400 + Math.floor(Math.random() * 400);
const browserProc = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.resolve(OUT, ".edge-sso-" + port)}`,
    "--no-first-run",
    "--disable-extensions",
    "--mute-audio",
    "--host-resolver-rules=MAP kardap.test 127.0.0.1,MAP pdv.kardap.test 127.0.0.1,MAP evil.test 127.0.0.1",
    `--unsafely-treat-insecure-origin-as-secure=${KARDAP},${PDV}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
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

const requestedUrls = []; // tudo o que os navegadores pediram (navegação e fetch), para procurar tokens em URL
async function newContext() {
  const { browserContextId } = await send("Target.createBrowserContext", {});
  return browserContextId;
}
async function newPage(contextId) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank", ...(contextId ? { browserContextId: contextId } : {}) });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Network.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 1200, height: 820, deviceScaleFactor: 1, mobile: false });
  listeners.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Network.requestWillBeSent") requestedUrls.push(m.params.request.url);
  });
  const evaluate = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  return {
    contextId,
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
    async waitFor(expr, timeout = 30000, label = expr) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const v = await evaluate(expr);
          if (v) return v;
        } catch {}
        await sleep(250);
      }
      let where = "";
      try {
        where = await evaluate(`location.href + ((t => t ? " — aviso na tela: " + t : "")(document.querySelector("[role=alert]")?.textContent?.trim()))`);
      } catch {}
      throw new Error(`tempo esgotado esperando: ${label} (em ${where})`);
    },
    url: () => evaluate("location.href"),
    async fill(label, value) {
      const ok = await evaluate(`(() => {
        const lab = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)}));
        const el = lab && (document.getElementById(lab.htmlFor) || lab.querySelector("input,textarea"));
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
    deleteCookie: (name) => s("Network.deleteCookies", { name, domain: ".kardap.test", path: "/" }),
  };
}
const cookiesOf = async (contextId) => (await send("Storage.getCookies", contextId ? { browserContextId: contextId } : {})).cookies;
const cookie = async (contextId, name) => (await cookiesOf(contextId)).find((c) => c.name === name);

// Login pela tela do KARDAP (como uma pessoa faria).
async function loginForm(page, email, password, { remember = true } = {}) {
  // O next dev pode recarregar a página ao compilar uma rota nova: se o formulário sumir, espera e tenta de novo.
  for (let attempt = 1; ; attempt++) {
    await page.waitFor(
      `location.host === "kardap.test:3100" && location.pathname === "/login" && !!document.querySelector("form fieldset") && !document.querySelector("form fieldset").disabled && [...document.querySelectorAll("label")].some(l => l.textContent.trim().startsWith("Senha"))`,
      90000,
      "formulário de login do KARDAP",
    );
    await sleep(1200); // hidratação do React
    try {
      await page.fill("E-mail", email);
      await page.fill("Senha", password);
      if (!remember) {
        await page.evaluate(`(() => { const box = [...document.querySelectorAll("input[type=checkbox]")].find(c => c.closest("label")?.textContent.includes("Manter conectado")); if (box && box.checked) box.click(); return true; })()`);
      }
      await page.evaluate(`document.querySelector("form button[type=submit]").click()`);
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}
const atLogin = `location.host === "kardap.test:3100" && location.pathname === "/login"`;
const pdvReady = (uid) => `location.host === "pdv.kardap.test:3200" && document.querySelector("#pdv-uid")?.textContent === ${JSON.stringify(uid)}`;
const dashboardReady = `!!document.querySelector('[aria-label="Sair da conta"]')`;

// ───────── 4. Contas (Auth e Firestore dos emuladores) ─────────
const ownerHeaders = { Authorization: "Bearer owner" }; // credencial de administrador do emulador (só para preparar dados)
const stamp = Date.now().toString(36);
async function signUp(label) {
  const email = `${label}-${stamp}@sso.test`;
  const password = "senha-forte-123";
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await r.json();
  if (!body.localId) throw new Error(`cadastro falhou: ${JSON.stringify(body)}`);
  return { email, password, uid: body.localId, idToken: body.idToken, refreshToken: body.refreshToken, signedAt: Date.now() };
}
async function freshIdToken(user) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true }),
  });
  return (await r.json()).idToken;
}
const value = (v) =>
  v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(value) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } };
async function fsSet(docPath, data, mask) {
  const q = mask ? "?" + mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&") : "";
  const r = await fetch(`${FS}/${docPath}${q}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...ownerHeaders },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)])) }),
  });
  if (!r.ok) throw new Error(`firestore ${docPath}: ${r.status}`);
}

const A = await signUp("dono"); // dono do restaurante
const B = await signUp("garcom"); // equipe sem a permissão "pdv"
const C = await signUp("caixa"); // equipe com a permissão "pdv"
const D = await signUp("semloja"); // conta sem restaurante
const E = await signUp("antigo"); // só entra no cadastro: o login dela fica velho para o S23
// Restaurante criado pela rota real do KARDAP (Admin SDK): restaurante, membro dono e perfil.
const created = await fetch(`${K_LOCAL}/api/restaurants`, {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${A.idToken}` },
  body: JSON.stringify({ name: "Bistrô do SSO" }),
});
const { restaurantId: RID } = await created.json();
if (!RID) throw new Error(`não foi possível criar o restaurante (${created.status})`);
await fsSet(`restaurantes/${RID}`, { onboarding: { completed: true } }, ["onboarding.completed"]);
await fsSet(`restaurantes/${RID}/membros/${B.uid}`, { uid: B.uid, role: "staff", permissions: ["cardapio"], active: true });
await fsSet(`usuarios/${B.uid}`, { restaurantIds: [RID] });
await fsSet(`restaurantes/${RID}/membros/${C.uid}`, { uid: C.uid, role: "staff", permissions: ["pdv"], active: true });
await fsSet(`usuarios/${C.uid}`, { restaurantIds: [RID] });

// ───────── 5. Cenários ─────────
const main = await newPage(); // contexto padrão: o computador do dono

await test("S1", "Acesso direto ao PDV sem sessão leva ao login central com retorno", async () => {
  await main.goto(`${PDV}/caixa`);
  await main.waitFor(atLogin, 90000, "login do KARDAP");
  const redirect = await main.evaluate(`new URLSearchParams(location.search).get("returnTo")`);
  assert(redirect === `${PDV}/caixa`, `returnTo=${redirect}`);
  await main.waitFor(`document.querySelector("h1")?.textContent.includes("PDV") && !document.querySelector("form fieldset")?.disabled`, 30000, "título do login para o PDV");
  await main.shot("s1-login-para-o-pdv");
  return `returnTo=${redirect}`;
});

await test("S2", "Login no KARDAP volta ao PDV autenticado com o mesmo uid", async () => {
  await loginForm(main, A.email, A.password);
  await main.waitFor(pdvReady(A.uid), 90000, "PDV com o uid do dono");
  return `PDV em ${await main.url()}`;
});

await test("S3", "Cookie kardap_sso_session: HttpOnly, Secure, SameSite=Lax, Domain .kardap.test, Path /, 5 dias", async () => {
  const c = await cookie(undefined, "kardap_sso_session");
  assert(c, "cookie ausente");
  assert(c.httpOnly && c.secure && c.sameSite === "Lax" && c.domain === ".kardap.test" && c.path === "/", JSON.stringify({ ...c, value: "…" }));
  const days = (c.expires * 1000 - Date.now()) / 86400000;
  assert(days > 4.99 && days <= 5.001, `validade ${days.toFixed(3)} dias`);
  const state = await cookie(undefined, "kardap_sso_state");
  assert(state && !state.httpOnly && state.domain === ".kardap.test", "cookie de estado");
  return `validade ${days.toFixed(3)} dias; estado legível sem segredo`;
});

await test("S4", "Firebase Client SDK do PDV: mesmo uid, leitura só da equipe no Firestore, envio e exclusão no Storage", async () => {
  const raw = await main.waitFor(`document.querySelector("#pdv-result")?.textContent`, 60000, "resultado das operações do PDV");
  const r = JSON.parse(raw);
  assert(!r.error, r.error);
  assert(r.uid === A.uid && r.app === "pdv" && r.member === true && r.uploaded > 0 && r.deleted === true, raw);
  await main.shot("s4-pdv-caixa");
  return raw;
});

await test("S5", "Nenhum token no armazenamento do PDV, em cookies legíveis ou em URLs", async () => {
  const storage = await main.evaluate(`(async () => ({
    local: Object.keys(localStorage), session: Object.keys(sessionStorage),
    idb: (await indexedDB.databases()).map(d => d.name), cookie: document.cookie }))()`);
  assert(storage.local.length === 0 && storage.session.length === 0, JSON.stringify(storage));
  assert(!storage.idb.includes("firebaseLocalStorageDb"), `IndexedDB: ${storage.idb}`);
  assert(!storage.cookie.includes("kardap_sso_session"), "cookie da sessão visível ao JavaScript");
  const leaked = requestedUrls.filter((u) => /eyJ[A-Za-z0-9_-]{10,}|[?&](id_?token|token|customToken)=/i.test(u));
  assert(leaked.length === 0, leaked.slice(0, 2).join(" "));
  return `${requestedUrls.length} URLs verificadas`;
});

// Contexto separado para a pessoa do caixa (C): o login dela é o "antigo" do cenário S20.
const ctxCaixa = await newContext();
const caixa = await newPage(ctxCaixa);
await test("S6", "Equipe com a permissão \"pdv\" entra no PDV", async () => {
  await caixa.goto(`${PDV}/caixa`);
  await loginForm(caixa, C.email, C.password);
  await caixa.waitFor(pdvReady(C.uid), 90000, "PDV com o uid da equipe");
  C.browserLoginAt = Date.now();
  const raw = await caixa.waitFor(`document.querySelector("#pdv-result")?.textContent`, 60000, "operações do PDV");
  assert(JSON.parse(raw).member === true, raw);
});

await test("S7", "Recarregar o PDV mantém a sessão", async () => {
  await main.goto(`${PDV}/caixa`);
  await main.waitFor(pdvReady(A.uid), 60000);
});

const pdvTab2 = await newPage();
await test("S8", "Nova aba do PDV entra direto, sem login", async () => {
  await pdvTab2.goto(`${PDV}/caixa`);
  await pdvTab2.waitFor(pdvReady(A.uid), 60000);
});

const kardapTab = await newPage();
await test("S9", "Painel KARDAP aberto na mesma sessão", async () => {
  await kardapTab.goto(`${KARDAP}/dashboard`);
  await kardapTab.waitFor(dashboardReady, 90000, "painel");
});

let oldCookie = "";
await test("S10", "Logout no PDV: as abas abertas do KARDAP e do PDV saem sozinhas e o cookie é removido", async () => {
  oldCookie = (await cookie(undefined, "kardap_sso_session"))?.value || "";
  await main.evaluate(`document.querySelector("#pdv-logout").click()`);
  await main.waitFor(atLogin, 30000, "PDV → login");
  await pdvTab2.waitFor(atLogin, 15000, "outra aba do PDV → login");
  await kardapTab.waitFor(`!(${dashboardReady}) && [...document.querySelectorAll("label")].some(l => l.textContent.trim().startsWith("Senha"))`, 15000, "painel → login");
  assert(!(await cookie(undefined, "kardap_sso_session")), "cookie continua no navegador");
  await kardapTab.waitFor(`document.body.innerText.includes("Sua sessão foi encerrada")`, 5000, "aviso de sessão encerrada");
  await sleep(1500);
  const text = await kardapTab.evaluate("document.body.innerText");
  assert(!text.includes("desfeita") && !text.includes("permissão"), "aviso de erro depois do logout");
  await kardapTab.shot("s10-painel-saiu");
});

await test("S11", "Cookie copiado antes do logout não é aceito depois (KARDAP e PDV)", async () => {
  assert(oldCookie, "sem cookie para testar");
  const headers = { cookie: `kardap_sso_session=${oldCookie}` };
  const k = await fetch(`${K_LOCAL}/api/auth/session`, { headers });
  const p = await fetch(`${P_LOCAL}/api/auth/status`, { headers });
  const page = await fetch(`${P_LOCAL}/caixa`, { headers, redirect: "manual" });
  assert(k.status === 401 && p.status === 401, `KARDAP ${k.status}, PDV ${p.status}`);
  assert(page.status === 307 && page.headers.get("location")?.startsWith(`${KARDAP}/login`), `página do PDV: ${page.status} ${page.headers.get("location")}`);
  return "401 nas APIs; página do PDV redireciona ao login";
});

await test("S12", "Logout no painel KARDAP encerra o PDV aberto", async () => {
  await main.goto(`${PDV}/caixa`);
  await loginForm(main, A.email, A.password);
  await main.waitFor(pdvReady(A.uid), 60000);
  await kardapTab.goto(`${KARDAP}/dashboard`);
  await kardapTab.waitFor(dashboardReady, 60000, "painel");
  await kardapTab.evaluate(`document.querySelector('[aria-label="Sair da conta"]').click()`);
  await main.waitFor(atLogin, 15000, "PDV → login");
  assert(!(await cookie(undefined, "kardap_sso_session")), "cookie continua");
});

// Chamadas diretas às APIs, como um atacante faria (sem navegador).
async function csrfPair() {
  const r = await fetch(`${K_LOCAL}/api/auth/csrf`);
  const token = r.headers.getSetCookie().find((c) => c.startsWith("kardap_csrf="))?.split(";")[0].split("=")[1];
  return token;
}
async function createSessionApi(user, { previous, origin = KARDAP, idToken } = {}) {
  const csrf = await csrfPair();
  const r = await fetch(`${K_LOCAL}/api/auth/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-csrf-token": csrf,
      cookie: `kardap_csrf=${csrf}${previous ? `; kardap_sso_session=${previous}` : ""}`,
    },
    body: JSON.stringify({ idToken: idToken || (await freshIdToken(user)) }),
  });
  const set = r.headers.getSetCookie().find((c) => c.startsWith("kardap_sso_session="));
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: set ? set.split(";")[0].slice("kardap_sso_session=".length) : "", raw: set || "" };
}
const sessionStatus = async (value) => (await fetch(`${K_LOCAL}/api/auth/session`, { headers: { cookie: `kardap_sso_session=${value}` } })).status;

await test("S13", "Session fixation: cookie forjado é recusado e cada login gera um cookie novo, encerrando o anterior", async () => {
  // No navegador: cookie plantado antes do login.
  await send("Storage.setCookies", { cookies: [{ name: "kardap_sso_session", value: "forjado-pelo-atacante", domain: ".kardap.test", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }] });
  await main.goto(`${PDV}/caixa`);
  await main.waitFor(atLogin, 60000, "cookie forjado → login");
  await loginForm(main, A.email, A.password);
  await main.waitFor(pdvReady(A.uid), 60000);
  const now = (await cookie(undefined, "kardap_sso_session"))?.value;
  assert(now && now !== "forjado-pelo-atacante", "o cookie forjado continuou");
  // Pela API: um segundo login no mesmo navegador encerra o cookie anterior.
  const first = await createSessionApi(A);
  await sleep(1100); // o conteúdo do cookie tem precisão de segundos
  const second = await createSessionApi(A, { previous: first.cookie });
  assert(first.status === 201 && second.status === 201 && first.cookie !== second.cookie, `${first.status}/${second.status}`);
  const [old, fresh] = [await sessionStatus(first.cookie), await sessionStatus(second.cookie)];
  assert(old === 401 && fresh === 200, `anterior ${old}, novo ${fresh}`);
  // Dois logins da mesma conta no mesmo segundo (mesmo ID token): sessões distintas, cada uma com seu registro.
  const token = await freshIdToken(A);
  const x = await createSessionApi(A, { idToken: token });
  const z = await createSessionApi(A, { idToken: token });
  const y = await createSessionApi(A, { idToken: token, previous: x.cookie });
  const same = [await sessionStatus(x.cookie), await sessionStatus(z.cookie), await sessionStatus(y.cookie)];
  assert(x.cookie !== z.cookie && same.join() === "401,200,200", `mesmo segundo: ${same.join()}`);
  return "forjado recusado; anterior 401, novo 200; logins no mesmo segundo são sessões separadas";
});

const ctxGarcom = await newContext();
const garcom = await newPage(ctxGarcom);
await test("S14", "Equipe sem a permissão \"pdv\" é barrada (página e token)", async () => {
  await garcom.goto(`${PDV}/caixa`);
  await loginForm(garcom, B.email, B.password);
  await garcom.waitFor(`location.host === "pdv.kardap.test:3200" && location.pathname === "/sem-permissao"`, 60000, "sem permissão");
  const token = await garcom.evaluate(`(async () => {
    const csrf = document.cookie.split("; ").find(c => c.startsWith("kardap_csrf="))?.split("=")[1] || "";
    const r = await fetch("${KARDAP}/api/sso/code", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-csrf-token": csrf } });
    return r.status + " " + (await r.json()).error;
  })()`);
  assert(token === "403 forbidden", token);
  await garcom.shot("s14-sem-permissao");
  return `código: ${token}`;
});

await test("S15", "Conta sem restaurante não abre o PDV", async () => {
  const s = await createSessionApi(D);
  assert(s.status === 201 && s.body.apps?.pdv === false, JSON.stringify(s.body));
  const status = await fetch(`${P_LOCAL}/api/auth/status`, { headers: { cookie: `kardap_sso_session=${s.cookie}` } });
  const page = await fetch(`${P_LOCAL}/caixa`, { headers: { cookie: `kardap_sso_session=${s.cookie}` }, redirect: "manual" });
  assert(status.status === 403 && page.headers.get("location")?.endsWith("/sem-permissao"), `${status.status} ${page.headers.get("location")}`);
});

await test("S16", "Restaurante suspenso bloqueia o PDV; reativado, volta a abrir", async () => {
  await fsSet(`restaurantes/${RID}`, { status: "suspended" }, ["status"]);
  await caixa.goto(`${PDV}/caixa`);
  await caixa.waitFor(`location.pathname === "/sem-permissao"`, 60000, "suspenso → sem permissão");
  await fsSet(`restaurantes/${RID}`, { status: "active" }, ["status"]);
  await caixa.goto(`${PDV}/caixa`);
  await caixa.waitFor(pdvReady(C.uid), 60000, "reativado → PDV");
});

const ctxShared = await newContext();
const shared = await newPage(ctxShared);
await test("S17", "Sem \"Manter conectado\": cookies de sessão do navegador (somem ao fechar)", async () => {
  await shared.goto(`${PDV}/caixa`);
  await loginForm(shared, A.email, A.password, { remember: false });
  await shared.waitFor(pdvReady(A.uid), 60000);
  const c = await cookie(ctxShared, "kardap_sso_session");
  assert(c && c.session === true && c.httpOnly && c.secure, JSON.stringify({ ...c, value: "…" }));
});

await test("S18", "Expiração no navegador (cookie some): painel e PDV abertos saem", async () => {
  await kardapTab.goto(`${KARDAP}/dashboard`);
  await kardapTab.waitFor(dashboardReady, 60000, "painel");
  await pdvTab2.goto(`${PDV}/caixa`);
  await pdvTab2.waitFor(pdvReady(A.uid), 60000);
  await main.deleteCookie("kardap_sso_session");
  await main.deleteCookie("kardap_sso_state");
  await pdvTab2.waitFor(atLogin, 15000, "PDV → login");
  await kardapTab.waitFor(`!(${dashboardReady})`, 15000, "painel saiu");
  // Com tudo fechado: o cookie expira e o painel é aberto depois. O login guardado no navegador não vale mais.
  await main.goto(`${PDV}/caixa`);
  await loginForm(main, A.email, A.password);
  await main.waitFor(pdvReady(A.uid), 60000);
  for (const p of [main, pdvTab2, kardapTab]) await p.goto("about:blank");
  await main.deleteCookie("kardap_sso_session");
  await main.deleteCookie("kardap_sso_state");
  await kardapTab.goto(`${KARDAP}/dashboard`);
  await kardapTab.waitFor(`[...document.querySelectorAll("label")].some(l => l.textContent.trim().startsWith("Senha"))`, 60000, "login ao reabrir");
  await sleep(2000);
  assert(!(await kardapTab.evaluate(dashboardReady)), "painel abriu sem sessão");
  return "abas abertas saíram; painel reaberto pede login";
});

await test("S19", "CSRF e origem: pedidos sem token ou de outro site são recusados", async () => {
  const a = await createSessionApi(A);
  const csrf = await csrfPair();
  const call = (method, url, headers) => fetch(url, { method, headers: { "content-type": "application/json", ...headers } }).then(async (r) => `${r.status}:${(await r.json().catch(() => ({}))).error || ""}`);
  const both = `kardap_csrf=${csrf}; kardap_sso_session=${a.cookie}`;
  const outcomes = {
    criarDeOutroSite: await call("POST", `${K_LOCAL}/api/auth/session`, { origin: "http://evil.test", "x-csrf-token": csrf, cookie: both }),
    criarSemToken: await call("POST", `${K_LOCAL}/api/auth/session`, { origin: KARDAP, cookie: both }),
    sairDeOutroSite: await call("POST", `${K_LOCAL}/api/auth/logout`, { origin: "http://evil.test", "x-csrf-token": csrf, cookie: both }),
    sairTokenErrado: await call("POST", `${K_LOCAL}/api/auth/logout`, { origin: PDV, "x-csrf-token": "x".repeat(csrf.length), cookie: both }),
    sairSemOrigem: await call("POST", `${K_LOCAL}/api/auth/logout`, { "x-csrf-token": csrf, cookie: both }),
    codigoDeOutroSite: await call("POST", `${K_LOCAL}/api/sso/code`, { origin: "http://evil.test", "x-csrf-token": csrf, cookie: both }),
    codigoSemToken: await call("POST", `${K_LOCAL}/api/sso/code`, { origin: PDV, cookie: both }),
    tokenPdvPeloKardap: await call("POST", `${P_LOCAL}/api/auth/firebase-token`, { origin: KARDAP, "x-csrf-token": csrf, cookie: both }),
    tokenPdvSemCsrf: await call("POST", `${P_LOCAL}/api/auth/firebase-token`, { origin: PDV, cookie: both }),
  };
  const expected = { criarDeOutroSite: "403:bad_origin", criarSemToken: "403:bad_csrf", sairDeOutroSite: "403:bad_origin", sairTokenErrado: "403:bad_csrf", sairSemOrigem: "403:bad_origin", codigoDeOutroSite: "403:bad_origin", codigoSemToken: "403:bad_csrf", tokenPdvPeloKardap: "403:bad_origin", tokenPdvSemCsrf: "403:bad_csrf" };
  const wrong = Object.entries(expected).filter(([k, v]) => outcomes[k] !== v);
  assert(wrong.length === 0, JSON.stringify(outcomes));
  assert((await sessionStatus(a.cookie)) === 200, "a sessão caiu com um pedido recusado");
  // Pedido legítimo do PDV (mesmo site) com token: aceito.
  const ok = await call("POST", `${K_LOCAL}/api/auth/logout`, { origin: PDV, "x-csrf-token": csrf, cookie: both });
  assert(ok === "200:" && (await sessionStatus(a.cookie)) === 401, `logout legítimo: ${ok}`);
  return "9 tentativas recusadas; logout legítimo aceito";
});

await test("S20", "CORS: só kardapp.online e pdv.kardapp.online leem a sessão", async () => {
  const evil = await fetch(`${K_LOCAL}/api/auth/session`, { headers: { origin: "http://evil.test" } });
  const pdv = await fetch(`${K_LOCAL}/api/auth/session`, { headers: { origin: PDV } });
  const pre = await fetch(`${K_LOCAL}/api/auth/session`, { method: "OPTIONS", headers: { origin: "http://evil.test", "access-control-request-method": "POST" } });
  assert(!evil.headers.get("access-control-allow-origin") && !pre.headers.get("access-control-allow-origin"), "origem estranha recebeu CORS");
  assert(pdv.headers.get("access-control-allow-origin") === PDV && pdv.headers.get("access-control-allow-credentials") === "true", "PDV sem CORS");
  assert(evil.headers.get("cache-control") === "no-store", "resposta pode ir para cache");
  // No navegador: uma página de outro site tenta derrubar a sessão.
  const attacker = await newPage();
  await attacker.goto("http://evil.test:3100/privacidade");
  const blocked = await attacker.evaluate(`fetch("${KARDAP}/api/auth/logout", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-csrf-token": "x" } }).then(r => "passou " + r.status, e => "bloqueado")`);
  assert(blocked === "bloqueado", blocked);
});

await test("S21", "Redirecionamento aberto bloqueado no login e no logout", async () => {
  await main.goto(`${PDV}/caixa`);
  await main.waitFor(`${atLogin} || location.host === "pdv.kardap.test:3200"`, 60000);
  if ((await main.url()).includes("kardap.test:3100/login")) {
    await loginForm(main, A.email, A.password);
    await main.waitFor(pdvReady(A.uid), 60000);
  }
  const payloads = ["https://evil.test/x", "//evil.test/x", "/\\evil.test", "javascript:alert(1)", "http://pdv.kardap.test:3200.evil.test/", "http://user@pdv.kardap.test:3200/", "http://evil.test:3200/", "data:text/html,oi"];
  const landed = [];
  for (const p of payloads) {
    await main.goto(`${KARDAP}/login?returnTo=${encodeURIComponent(p)}`);
    await sleep(3500);
    landed.push(new URL(await main.url()).host);
  }
  assert(landed.every((h) => h === "kardap.test:3100"), landed.join(", "));
  // Controle: destino da lista funciona.
  await main.goto(`${KARDAP}/login?returnTo=${encodeURIComponent(`${PDV}/caixa`)}`);
  await main.waitFor(pdvReady(A.uid), 60000, "destino permitido");
  // Logout aberto direto (sem vir de um dos apps): pede confirmação e não segue para fora.
  await main.goto(`${KARDAP}/logout?returnTo=${encodeURIComponent("https://evil.test/")}`);
  await main.waitFor(`document.querySelector("h1")?.textContent === "Sair da conta?"`, 60000, "confirmação do logout");
  assert(await cookie(undefined, "kardap_sso_session"), "saiu sem confirmar");
  await main.shot("s21-logout-confirmacao");
  await main.evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Sair").click()`);
  await main.waitFor(atLogin, 30000, "logout → login");
  assert(!(await cookie(undefined, "kardap_sso_session")), "cookie continua");
  return `${payloads.length} destinos recusados`;
});

const ctxOther = await newContext();
const otherDevice = await newPage(ctxOther);
await test("S22", "\"Sair de todos os aparelhos\" revoga a sessão do outro aparelho", async () => {
  await otherDevice.goto(`${PDV}/caixa`);
  await loginForm(otherDevice, A.email, A.password);
  await otherDevice.waitFor(pdvReady(A.uid), 60000);
  await main.goto(`${PDV}/caixa`);
  await loginForm(main, A.email, A.password);
  await main.waitFor(pdvReady(A.uid), 60000);
  await main.evaluate(`document.querySelector("#pdv-logout-all").click()`);
  await main.waitFor(atLogin, 30000, "este aparelho → login");
  // O outro aparelho ainda tem o cookie, mas a sessão foi revogada no Firebase.
  const start = Date.now();
  let kicked = false;
  while (Date.now() - start < 25000 && !kicked) {
    await otherDevice.goto(`${PDV}/caixa`);
    await sleep(1500);
    kicked = (await otherDevice.url()).includes("kardap.test:3100/login");
  }
  assert(kicked, "o outro aparelho continuou no PDV");
  return `outro aparelho saiu em ${((Date.now() - start) / 1000).toFixed(1)} s`;
});

// Fluxo por código, como o PDV usa (aqui chamado direto, como um atacante tentaria).
async function requestCodeApi(sessionCookie, origin = PDV) {
  const csrf = await csrfPair();
  const r = await fetch(`${K_LOCAL}/api/sso/code`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-csrf-token": csrf, cookie: `kardap_csrf=${csrf}; kardap_sso_session=${sessionCookie}` },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const basic = (id, secret) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
async function redeem(code, auth = basic("pdv", CLIENT_SECRET)) {
  const r = await fetch(`${K_LOCAL}/api/sso/token`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify({ grant_type: "authorization_code", code }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cors: r.headers.get("access-control-allow-origin") };
}
async function introspect(session, auth = basic("pdv", CLIENT_SECRET)) {
  const r = await fetch(`${K_LOCAL}/api/sso/introspect`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ session }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
let lateCode = "";
let lateCodeAt = 0;

const ctxNovo = await newContext();
const novo = await newPage(ctxNovo);
await test("S26", "Login normal no KARDAP (sem returnTo) abre o painel e cria a sessão central", async () => {
  await novo.goto(`${KARDAP}/login`);
  await loginForm(novo, A.email, A.password);
  await novo.waitFor(`location.pathname === "/dashboard" && ${dashboardReady}`, 90000, "painel");
  const c = await cookie(ctxNovo, "kardap_sso_session");
  assert(c && c.domain === ".kardap.test" && c.httpOnly, "cookie da sessão central ausente");
});

await test("S27", "Já autenticado: /login?returnTo= devolve ao destino no servidor (307), sem renderizar o login", async () => {
  const s = await createSessionApi(A);
  const target = `${PDV}/caixa`;
  const go = (cookieValue, param = "returnTo") =>
    fetch(`${K_LOCAL}/login?${param}=${encodeURIComponent(target)}`, { redirect: "manual", headers: cookieValue ? { cookie: `kardap_sso_session=${cookieValue}` } : {} });
  const valid = await go(s.cookie);
  const alias = await go(s.cookie, "redirect");
  const none = await go("");
  const bad = await go("cookie-invalido");
  assert(valid.status === 307 && valid.headers.get("location") === target, `com sessão: ${valid.status} ${valid.headers.get("location")}`);
  assert(alias.status === 307, `?redirect=: ${alias.status}`);
  assert(none.status === 200 && bad.status === 200, `sem sessão: ${none.status}; inválida: ${bad.status}`);
  return "307 com sessão; 200 (tela de login) sem sessão ou com cookie inválido";
});

await test("S28", "Cookie adulterado é recusado e removido (KARDAP, PDV e introspecção)", async () => {
  const s = await createSessionApi(A);
  const i = Math.floor(s.cookie.length / 2);
  const tampered = s.cookie.slice(0, i) + (s.cookie[i] === "A" ? "B" : "A") + s.cookie.slice(i + 1);
  const k = await fetch(`${K_LOCAL}/api/auth/session`, { headers: { cookie: `kardap_sso_session=${tampered}` } });
  const cleared = k.headers.getSetCookie().some((c) => c.startsWith("kardap_sso_session=;") || /kardap_sso_session=;|kardap_sso_session=(;|$)|Max-Age=0/i.test(c));
  const p = await fetch(`${P_LOCAL}/api/auth/status`, { headers: { cookie: `kardap_sso_session=${tampered}` } });
  const intro = await introspect(tampered);
  assert(k.status === 401 && cleared && p.status === 401 && intro.body.active === false, `KARDAP ${k.status} (limpou: ${cleared}), PDV ${p.status}, introspecção ${JSON.stringify(intro.body)}`);
  assert((await sessionStatus(s.cookie)) === 200, "o cookie original deixou de valer");
});

await test("S29", "Sessão vencida no servidor é recusada (registro com validade no passado)", async () => {
  const s = await createSessionApi(A);
  const sid = createHash("sha256").update(s.cookie).digest("hex");
  await fsSet(`ssoSessoes/${sid}`, { expiresAt: new Date(Date.now() - 1000) }, ["expiresAt"]);
  const status = await sessionStatus(s.cookie);
  const page = await fetch(`${P_LOCAL}/caixa`, { headers: { cookie: `kardap_sso_session=${s.cookie}` }, redirect: "manual" });
  assert(status === 401 && page.status === 307 && page.headers.get("location")?.startsWith(`${KARDAP}/login`), `KARDAP ${status}, PDV ${page.status}`);
});


await test("S30", "Código de uso único: só com o segredo do cliente, uma vez, para a conta, o aplicativo e a sessão certos", async () => {
  const sA = await createSessionApi(A);
  const c1 = await requestCodeApi(sA.cookie);
  assert(c1.status === 200 && c1.body.code && c1.body.expires_in === 60, `código: ${c1.status}`);
  const results = {
    semSegredo: (await redeem(c1.body.code, null)).status,
    segredoErrado: (await redeem(c1.body.code, basic("pdv", "x".repeat(48)))).status,
    outroCliente: (await redeem(c1.body.code, basic("admin", CLIENT_SECRET))).status,
  };
  // Código forjado: mesmo formato, outro uid, assinatura que o servidor não emitiu.
  const [body] = c1.body.code.split(".");
  const forged = JSON.parse(Buffer.from(body, "base64url").toString());
  forged.sub = B.uid;
  results.forjado = (await redeem(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${randomBytes(32).toString("base64url")}`)).status;
  const ok = await redeem(c1.body.code);
  const claims = JSON.parse(Buffer.from(String(ok.body.firebase_custom_token).split(".")[1] || "", "base64url").toString() || "{}");
  results.reuso = (await redeem(c1.body.code)).status;
  results.origemKardap = (await requestCodeApi(sA.cookie, KARDAP)).status;
  results.semPermissao = (await requestCodeApi((await createSessionApi(B)).cookie)).status;
  // Sessão encerrada depois da emissão do código: o código morre junto.
  const c2 = await requestCodeApi(sA.cookie);
  const csrf = await csrfPair();
  await fetch(`${K_LOCAL}/api/auth/logout`, { method: "POST", headers: { "content-type": "application/json", origin: KARDAP, "x-csrf-token": csrf, cookie: `kardap_csrf=${csrf}; kardap_sso_session=${sA.cookie}` } });
  results.aposLogout = (await redeem(c2.body.code)).status;
  const expected = { semSegredo: 401, segredoErrado: 401, outroCliente: 401, forjado: 400, reuso: 400, origemKardap: 403, semPermissao: 403, aposLogout: 400 };
  const wrong = Object.entries(expected).filter(([k, v]) => results[k] !== v);
  assert(ok.status === 200 && ok.body.token_type === "firebase_custom_token" && ok.body.uid === A.uid && !ok.cors, `troca: ${ok.status} ${JSON.stringify(ok.body).slice(0, 120)}`);
  assert(claims.uid === A.uid && claims.claims?.kardapApp === "pdv", `custom token: ${JSON.stringify(claims).slice(0, 160)}`);
  assert(wrong.length === 0, JSON.stringify(results));
  // Um código guardado para o teste de validade (S31), depois da espera.
  lateCode = (await requestCodeApi((await createSessionApi(A)).cookie)).body.code || "";
  lateCodeAt = Date.now();
  return `custom token do uid certo; recusas: ${JSON.stringify(results)}`;
});

await test("S32", "Introspecção da sessão só com o segredo do cliente", async () => {
  const s = await createSessionApi(A);
  const results = {
    semSegredo: (await introspect(s.cookie, null)).status,
    segredoErrado: (await introspect(s.cookie, basic("pdv", "y".repeat(48)))).status,
  };
  const valid = await introspect(s.cookie);
  const invalid = await introspect("nao-e-uma-sessao");
  assert(results.semSegredo === 401 && results.segredoErrado === 401, JSON.stringify(results));
  assert(valid.body.active === true && valid.body.uid === A.uid && valid.body.access?.allowed === true, JSON.stringify(valid.body).slice(0, 160));
  assert(invalid.status === 200 && invalid.body.active === false, JSON.stringify(invalid.body));
});

await test("S33", "Origens de produção: kardapp.online, www.kardapp.online e pdv.kardapp.online aceitas; domínio antigo e imitações recusados", async () => {
  const allowed = ["https://kardapp.online", "https://www.kardapp.online", "https://pdv.kardapp.online"];
  const refused = ["https://kardap.online", "https://pdv.kardap.online", "https://kardapp.online.evil.test", "https://evilkardapp.online", "http://kardapp.online"];
  const cors = async (origin) => (await fetch(`${K_LOCAL}/api/auth/session`, { headers: { origin } })).headers.get("access-control-allow-origin");
  const badCors = [];
  for (const o of allowed) if ((await cors(o)) !== o) badCors.push(`${o} recusada`);
  for (const o of refused) if (await cors(o)) badCors.push(`${o} aceita`);
  assert(badCors.length === 0, badCors.join("; "));
  // Destino de retorno: com sessão válida, o servidor só devolve para as origens oficiais.
  const sA = await createSessionApi(A);
  const back = async (target) => {
    const r = await fetch(`${K_LOCAL}/login?returnTo=${encodeURIComponent(target)}`, { redirect: "manual", headers: { cookie: `kardap_sso_session=${sA.cookie}` } });
    return r.status === 307 ? r.headers.get("location") : null;
  };
  const okTargets = ["https://www.kardapp.online/dashboard", "https://pdv.kardapp.online/caixa", "https://kardapp.online/dashboard"];
  const badTargets = ["https://kardap.online/dashboard", "https://pdv.kardap.online/", "https://www.kardapp.online.evil.test/"];
  const wrong = [];
  for (const t of okTargets) if ((await back(t)) !== t) wrong.push(`${t} não voltou`);
  for (const t of badTargets) if (await back(t)) wrong.push(`${t} voltou`);
  assert(wrong.length === 0, wrong.join("; "));
  return `${allowed.length} origens aceitas, ${refused.length} recusadas; destinos conferidos`;
});

// Os últimos cenários precisam de logins com mais de 5 minutos (E no cadastro, C no S6).
const newest = Math.max(E.signedAt, C.browserLoginAt || Date.now());
// …e o código guardado no S30 precisa ter mais de 60 s (S31).
const wait = Math.max(newest + 5 * 60_000 + 10_000, lateCodeAt + 65_000) - Date.now();
if (wait > 0) {
  console.log(`… aguardando ${Math.ceil(wait / 1000)} s para os logins ficarem com mais de 5 minutos`);
  await sleep(wait);
}

await test("S23", "Login antigo não vira sessão nova (exige login recente)", async () => {
  const r = await fetch(`${AUTH}/securetoken.googleapis.com/v1/token?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(E.refreshToken)}`,
  });
  const { id_token } = await r.json();
  const s = await createSessionApi(E, { idToken: id_token });
  assert(s.status === 401 && s.body.error === "recent_login_required", `${s.status} ${s.body.error}`);
  return "401 recent_login_required";
});

await test("S24", "Logado no KARDAP há mais de 5 min e sem sessão compartilhada: confirma a senha e volta ao PDV", async () => {
  // Simula o navegador de alguém que entrou no painel antes do SSO existir (sem a marca e sem os cookies).
  await caixa.goto(`${KARDAP}/privacidade`);
  await caixa.evaluate(`localStorage.removeItem("kardap-sso-uid")`);
  await caixa.deleteCookie("kardap_sso_session");
  await caixa.deleteCookie("kardap_sso_state");
  await caixa.goto(`${PDV}/caixa`);
  await caixa.waitFor(`${atLogin} && document.querySelector(".kd-auth-notice")?.textContent.includes("confirme sua senha")`, 60000, "aviso de confirmar a senha");
  const prefilled = await caixa.evaluate(`document.getElementById("auth-email")?.value`);
  assert(prefilled === C.email, `e-mail preenchido: ${prefilled}`);
  await caixa.shot("s24-confirmar-senha");
  await loginForm(caixa, C.email, C.password);
  await caixa.waitFor(pdvReady(C.uid), 60000, "PDV depois da confirmação");
});

await test("S31", "Código vencido (mais de 60 s) é recusado", async () => {
  assert(lateCode, "sem código guardado");
  const r = await redeem(lateCode);
  assert(r.status === 400 && r.body.error === "invalid_grant", `${r.status} ${r.body.error}`);
  return "400 invalid_grant";
});

await test("S25", "Limite de tentativas na criação de sessão (429 depois de 60 pedidos em 10 min por IP)", async () => {
  // IP próprio para este cenário: os outros pedidos do teste não entram na conta, e vice-versa.
  const statuses = [];
  for (let i = 0; i < 62; i++) {
    const r = await fetch(`${K_LOCAL}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json", origin: KARDAP, "x-forwarded-for": "203.0.113.9" }, body: "{}" });
    statuses.push(r.status);
  }
  const first429 = statuses.indexOf(429);
  assert(first429 === 60 && statuses.slice(0, 60).every((x) => x === 403), `primeiro 429 no pedido ${first429 + 1}`);
  return "pedidos 1–60 avaliados (403 sem CSRF), 61 e 62 recusados com 429";
});

// ───────── 6. Resultado ─────────
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, "resultado-sso.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} cenários passaram. Capturas e logs: ${OUT}`);
ws.close();
killTree(browserProc);
servers.forEach(killTree);
process.exit(failed.length ? 1 : 0);
