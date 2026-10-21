// Medição de desempenho dos vídeos do cardápio (docs/VIDEOS.md, "Medição"), contra os emuladores do Firebase.
// Celular emulado (Edge/Chrome via CDP), rede limitada pelo próprio navegador, vídeos reais da pasta public/.
//
// Pré-requisito: emuladores rodando (docs/TESTES.md):
//   firebase emulators:start --only auth,firestore,storage --project demo-kardap
// O script compila o app numa pasta separada (.next-perf, não mexe na .next do `npm run dev`) e sobe em
// http://localhost:3200. PERF_MODE=dev usa o servidor de desenvolvimento (mais rápido de subir, JS mais lento).
// Uso: node scripts/perf-reels.mjs [pasta-de-saída]   (BROWSER_PATH: navegador; PERF_BUILD=0 reaproveita o build)
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "kardap-perf-")));
fs.mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:3200";
const PROJECT = "demo-kardap";
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `http://127.0.0.1:8080/v1/${DOCS}`;
const EDGE = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const MODE = process.env.PERF_MODE === "dev" ? "dev" : "prod";
const DIST = process.env.KARDAP_DIST_DIR || ".next-perf";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROBE = fs.readFileSync(path.join(ROOT, "scripts", "perf", "video-probe.js"), "utf8");

// Perfis de rede (mesmos números dos presets do DevTools). Bytes por segundo.
const NET = {
  wifi: null,
  fast4g: { latency: 60, downloadThroughput: (9_000_000 / 8) * 0.9, uploadThroughput: (1_500_000 / 8) * 0.9 },
  slow4g: { latency: 150, downloadThroughput: (1_600_000 / 8) * 0.9, uploadThroughput: (750_000 / 8) * 0.9 },
  "3g": { latency: 300, downloadThroughput: (750_000 / 8) * 0.9, uploadThroughput: (250_000 / 8) * 0.9 },
};

const results = {};
const checks = [];
const check = (id, name, ok, detail = "") => {
  checks.push({ id, name, ok, detail });
  console.log(`${ok ? "PASSOU" : "FALHOU"}  [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
};

// ───────── Dados de teste (credencial de administrador do emulador, ignora regras) ─────────
const admin = { Authorization: "Bearer owner" };
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === "number") return { doubleValue: v };
  return { mapValue: { fields: toFields(v) } };
}
const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
async function commitAll(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const r = await fetch(`http://127.0.0.1:8080/v1/${DOCS}:commit`, { method: "POST", headers: { "content-type": "application/json", ...admin }, body: JSON.stringify({ writes: writes.slice(i, i + 400) }) });
    if (!r.ok) throw new Error(`seed: ${r.status} ${await r.text()}`);
  }
}
const put = (docPath, data) => ({ update: { name: `${DOCS}/${docPath}`, fields: toFields(data) } });

// ───────── Servidor de mídia (faz o papel do Firebase Storage) ─────────
// Outro endereço que o do app, Range e `Cache-Control: immutable` como os arquivos gerados pelo worker.
// Conta os bytes realmente enviados por arquivo: é a medida de consumo de internet dos cenários.
const MEDIA_PORT = 3300;
const MEDIA = `http://localhost:${MEDIA_PORT}`;
const FILES = ["/hamburguer.mp4", "/pizzavideo.mp4", "/carne%20tabua.mp4"];
const POSTER = `${MEDIA}/imagens/display-cardapio-kardap.webp`;
const media = { bytes: new Map(), requests: 0, open: 0, maxOpen: 0 };
const mediaServer = http.createServer((req, res) => {
  const url = new URL(req.url, MEDIA);
  const file = path.join(ROOT, "public", decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(ROOT, "public")) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  const size = fs.statSync(file).size;
  const type = file.endsWith(".mp4") ? "video/mp4" : file.endsWith(".webp") ? "image/webp" : "image/png";
  const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable" };
  let start = 0;
  let end = size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range) {
    start = range[1] ? Number(range[1]) : size - Number(range[2]);
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
  } else {
    res.writeHead(200, { ...headers, "content-length": size });
  }
  if (req.method === "HEAD") return res.end();
  const key = url.search.match(/v=([^&]+)/)?.[0] || url.pathname;
  const isVideo = !url.pathname.startsWith("/imagens/");
  if (isVideo) {
    media.requests++;
    media.open++;
    media.maxOpen = Math.max(media.maxOpen, media.open);
  }
  const stream = fs.createReadStream(file, { start, end, highWaterMark: 16 * 1024 });
  stream.on("data", (chunk) => {
    if (isVideo) media.bytes.set(key, (media.bytes.get(key) || 0) + chunk.length);
  });
  res.on("close", () => {
    stream.destroy();
    if (isVideo) media.open--;
  });
  stream.pipe(res);
});
const mediaNet = {
  reset() {
    media.bytes.clear();
    media.requests = 0;
    media.maxOpen = media.open;
  },
  summary() {
    const total = [...media.bytes.values()].reduce((a, b) => a + b, 0);
    return { requests: media.requests, maxInFlight: media.maxOpen, MB: +(total / 1e6).toFixed(2), perVideoKB: Object.fromEntries([...media.bytes].map(([k, b]) => [k, Math.round(b / 1000)])) };
  },
};

const A = { id: "perf-bistro", slug: "perf-bistro", products: 120, videos: 40 };
const B = { id: "perf-cantina", slug: "perf-cantina", products: 6, videos: 6 };
// Endereços distintos por prato (como em produção, um arquivo por vídeo): o cache não mistura pratos.
const videoUrl = (rid, i) => `${MEDIA}${FILES[i % FILES.length]}?r=${rid}&v=${rid === A.id ? "" : "b"}${i}`;
const BROKEN = { missing: "p-sem-arquivo", corrupt: "p-arquivo-ruim" };

async function seed() {
  const reset = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!reset.ok) throw new Error("não foi possível limpar o emulador do Firestore");
  const writes = [];
  const base = Date.now();
  for (const r of [A, B]) {
    writes.push(put(`restaurantes/${r.id}`, { name: r.id === A.id ? "Bistrô Perf" : "Cantina Perf", slug: r.slug, status: "active", ownerId: `dono-${r.id}`, createdAt: new Date().toISOString(), settings: { waiter: true, bill: false } }));
    writes.push(put(`restaurantes/${r.id}/categorias/pratos`, { name: "Pratos", order: 0, active: true }));
    for (let i = 0; i < r.products; i++) {
      const id = `p-${i}`;
      const withVideo = i < r.videos;
      writes.push(
        put(`restaurantes/${r.id}/produtos/${id}`, {
          name: `Prato ${i + 1}`,
          description: "Prato de teste de desempenho com descrição curta.",
          category: "Pratos",
          categoryId: "pratos",
          price: "39,90",
          priceCents: 3990,
          available: true,
          // Lista ordenada pelo mais recente: p-0 é o primeiro.
          createdAt: new Date(base - i * 60_000).toISOString(),
          image: POSTER,
          ...(withVideo ? { videoUrl: videoUrl(r.id, i), videoPoster: POSTER, video: { width: 720, height: 1280 } } : {}),
        }),
      );
    }
  }
  // Vídeo que não existe e arquivo que não é vídeo, logo depois dos 40 bons (fim do feed de Reels).
  writes.push(put(`restaurantes/${A.id}/produtos/${BROKEN.missing}`, { name: "Prato sem arquivo", category: "Pratos", categoryId: "pratos", price: "1", priceCents: 100, available: true, createdAt: new Date(base - 41 * 60_000 + 30_000).toISOString(), image: POSTER, videoUrl: `${MEDIA}/perf-nao-existe.mp4?v=x1`, videoPoster: POSTER }));
  writes.push(put(`restaurantes/${A.id}/produtos/${BROKEN.corrupt}`, { name: "Prato com arquivo ruim", category: "Pratos", categoryId: "pratos", price: "1", priceCents: 100, available: true, createdAt: new Date(base - 41 * 60_000 + 20_000).toISOString(), image: POSTER, videoUrl: `${MEDIA}/google-logo.png?v=x2`, videoPoster: POSTER }));
  await commitAll(writes);
}

// ───────── App ─────────
const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(FIREBASE_|FIRESTORE_|SSO_|NEXT_PUBLIC_)/.test(k)));
const appEnv = {
  ...inherited,
  KARDAP_DIST_DIR: DIST,
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
const log = fs.openSync(path.join(OUT, "app-server.log"), "w");
if (MODE === "prod" && process.env.PERF_BUILD !== "0") {
  console.log(`Compilando o app em ${DIST} (alguns minutos)...`);
  const build = spawnSync(process.execPath, [NEXT_BIN, "build"], { cwd: ROOT, env: appEnv, stdio: ["ignore", log, log] });
  if (build.status !== 0) throw new Error(`next build falhou (veja ${path.join(OUT, "app-server.log")})`);
}
const server = spawn(process.execPath, [NEXT_BIN, MODE === "prod" ? "start" : "dev", "-p", "3200"], { cwd: ROOT, env: appEnv, stdio: ["ignore", log, log] });
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
const port = 9400 + Math.floor(Math.random() * 90);
const browserProc = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(OUT, ".edge-perf-" + port)}`, "--no-first-run", "--disable-extensions", "--mute-audio", "about:blank"], { stdio: "ignore" });
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

/** Vídeos atendidos pelo cache do navegador (sem ir ao servidor de mídia). */
const cache = { hits: 0 };
listeners.push((m) => {
  if (m.method === "Network.responseReceived" && m.params.response.url.startsWith(MEDIA) && m.params.response.fromDiskCache && /[?&]v=/.test(m.params.response.url)) cache.hits++;
});

async function newPhone({ script = "" } = {}) {
  const { browserContextId } = await send("Target.createBrowserContext", { disposeOnDetach: true });
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Network.enable", { maxTotalBufferSize: 0, maxResourceBufferSize: 0 });
  await s("Performance.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await s("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" });
  // A máquina de teste pode pedir "reduzir movimento" (Windows sem animações): o padrão aqui é o de um celular comum.
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
  if (script) await s("Page.addScriptToEvaluateOnNewDocument", { source: script });
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
        await sleep(50);
      }
      throw new Error(`tempo esgotado esperando: ${label}`);
    },
    async network(profile) {
      const p = NET[profile];
      await s("Network.emulateNetworkConditions", p ? { offline: false, ...p } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    },
    offline: (value) => s("Network.emulateNetworkConditions", { offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
    clearCache: () => s("Network.clearBrowserCache"),
    reducedMotion: (on) => s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }] }),
    async heapMB() {
      await s("HeapProfiler.enable");
      await s("HeapProfiler.collectGarbage");
      const { metrics } = await s("Performance.getMetrics");
      const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
      return { heapMB: +(m.JSHeapUsedSize / 1e6).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners };
    },
    async touch(x, y) {
      await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    async tapEl(selector) {
      const box = await evaluate(`(() => { const el = ${selector}; if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!box) throw new Error(`elemento não encontrado: ${selector}`);
      await page.touch(box.x, box.y);
    },
    async swipe(direction = "up") {
      const from = direction === "up" ? 650 : 250;
      const step = direction === "up" ? -45 : 45;
      await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: from }] });
      for (let i = 1; i <= 10; i++) {
        await s("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: from + i * step }] });
        await sleep(16);
      }
      await s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    async shot(name) {
      const r = await s("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
    },
    close: () => send("Target.disposeBrowserContext", { browserContextId }),
  };
  return page;
}

const ACTIVE = `document.querySelector('.kd-reel[aria-hidden="false"]')`;
const activeIndex = `Number(${ACTIVE}?.dataset.index ?? -1)`;
const activeState = `(() => { const v = ${ACTIVE}?.querySelector("video"); return v ? { paused: v.paused, t: +v.currentTime.toFixed(2), ready: v.readyState, net: v.networkState, buffered: v.buffered.length ? +v.buffered.end(v.buffered.length - 1).toFixed(1) : 0 } : null; })()`;
const probe = () => phone.evaluate(`window.__kdProbe.snapshot()`);
const median = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};
const p90 = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.ceil(v.length * 0.9) - 1)] : null;
};

let phone;
/** Abre o cardápio do restaurante e os Reels no primeiro prato; devolve o tempo do toque ao primeiro quadro. */
async function openReels(slug, { network = "wifi", cold = true } = {}) {
  phone = await newPhone();
  if (cold) await phone.clearCache();
  await phone.network(network);
  await phone.goto(`${APP}/r/${slug}`);
  await phone.waitFor(`document.querySelectorAll(".kd-reels-bubble").length > 0`, 90000, "bolhas dos Reels");
  // Feed já baixado no ocioso (comportamento normal do cardápio): mede só o vídeo.
  await sleep(2500);
  mediaNet.reset();
  await phone.evaluate(`window.__kdProbe.reset(), window.__kdProbe.mark("tap")`);
  await phone.tapEl(`[...document.querySelectorAll(".kd-reels-rail-all")][0]`);
  await phone.waitFor(`window.__kdProbe.activations[0]?.firstFrame != null`, 60000, "primeiro quadro");
  const snap = await probe();
  return Math.round(snap.activations[0].at + snap.activations[0].firstFrame - snap.marks.tap);
}

/** Assiste `watchMs`, desliza e mede a troca. */
async function swipeAndMeasure(direction, watchMs) {
  await sleep(watchMs);
  const before = await phone.evaluate(activeIndex);
  await phone.evaluate(`window.__kdProbe.mark("swipe")`);
  await phone.swipe(direction);
  const target = direction === "up" ? before + 1 : before - 1;
  await phone.waitFor(`${activeIndex} === ${target}`, 10000, `prato ${target} ativo`);
  const ok = await phone.waitFor(`window.__kdProbe.activations.at(-1)?.firstFrame != null`, 30000, "primeiro quadro após a troca").catch(() => false);
  const snap = await probe();
  const a = snap.activations.at(-1);
  // Só vale a amostra em que o prato ativo é exatamente o seguinte (o encaixe não pulou nenhum).
  const valid = ok && a.index === target && a.at >= snap.marks.swipe;
  return { index: target, fromActivation: valid ? a.firstFrame : null, fromSwipe: valid ? Math.round(a.at + a.firstFrame - snap.marks.swipe) : null };
}

const ONLY = process.env.PERF_ONLY ? new RegExp(process.env.PERF_ONLY) : null;
async function scenario(id, name, fn) {
  if (ONLY && !ONLY.test(id)) return;
  try {
    console.log(`\n── ${id}: ${name}`);
    results[id] = await fn();
    if (phone?.errors.length) results[id].jsErrors = phone.errors.slice(0, 5);
    console.log(JSON.stringify(results[id], null, 1).slice(0, 2500));
  } catch (error) {
    const state = await phone?.evaluate(`({ active: ${activeState}, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, saveData: navigator.connection?.saveData, playIcon: !!${ACTIVE}?.querySelector(".kd-reel-state:not(.is-loading)") })`).catch(() => null);
    results[id] = { error: error.message, state };
    console.log(JSON.stringify(state));
    check(id, name, false, error.message);
    await phone?.shot(`falha-${id}`).catch(() => undefined);
  } finally {
    await phone?.close().catch(() => undefined);
    phone = null;
  }
}

try {
  console.log(`Saída: ${OUT}`);
  await new Promise((r) => mediaServer.listen(MEDIA_PORT, r));
  await seed();
  await waitHttp(`${APP}/api/auth/csrf`);
  for (const slug of [A.slug, B.slug]) await fetch(`${APP}/r/${slug}`).catch(() => undefined);
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
  // Aquece a compilação/caches do servidor numa aba descartável.
  phone = await newPhone();
  await phone.goto(`${APP}/r/${A.slug}`);
  await phone.waitFor(`document.querySelectorAll(".kd-reels-bubble").length > 0`, 120000, "aquecimento");
  await phone.close();

  for (const network of ["wifi", "fast4g", "slow4g", "3g"]) {
    await scenario(`abrir-${network}`, `Primeiro acesso e trocas (${network})`, async () => {
      const open = await openReels(A.slug, { network });
      const startupNet = mediaNet.summary();
      const swaps = [];
      for (let i = 0; i < 4; i++) swaps.push(await swipeAndMeasure("up", network === "3g" ? 6000 : 3000));
      const back = await swipeAndMeasure("down", 1500);
      const snap = await probe();
      const net = mediaNet.summary();
      return {
        connection: await phone.evaluate(`navigator.connection ? { type: navigator.connection.effectiveType, downlink: navigator.connection.downlink, rtt: navigator.connection.rtt } : null`),
        openToFirstFrameMs: open,
        startupVideoRequests: { maxInFlight: startupNet.maxInFlight, files: Object.keys(startupNet.perVideoKB).length, MB: startupNet.MB },
        switchFromActivationMs: swaps.map((s) => s.fromActivation),
        switchFromSwipeMs: swaps.map((s) => s.fromSwipe),
        backFromSwipeMs: back.fromSwipe,
        stalls: snap.activations.reduce((n, a) => n + a.stalls, 0),
        stallMs: snap.activations.reduce((n, a) => n + a.stallMs, 0),
        maxPlaying: snap.maxPlaying,
        maxReelVideos: snap.maxReelVideos,
        longTaskMs: snap.longTaskMs,
        maxEventMs: snap.maxEventMs,
        activations: snap.activations.map((a) => [a.index, a.firstFrame]),
        video: { requests: net.requests, maxInFlight: net.maxInFlight, MB: net.MB, perVideoKB: net.perVideoKB },
      };
    });
  }

  await scenario("rolagem-rapida", "Rolagem rápida por 25 vídeos (slow4g) e parada", async () => {
    await openReels(A.slug, { network: "slow4g" });
    const heap0 = await phone.heapMB();
    mediaNet.reset();
    await phone.evaluate(`window.__kdProbe.reset()`);
    // Um gesto atrás do outro, sem esperar o vídeo: ~3 pratos por segundo.
    for (let i = 0; i < 25; i++) {
      await phone.swipe("up");
      await sleep(150);
    }
    await sleep(800);
    const landed = await phone.evaluate(activeIndex);
    mediaNet.reset();
    await phone.evaluate(`window.__kdProbe.mark("stop")`);
    const ff = await phone.waitFor(`(() => { const a = window.__kdProbe.activations.at(-1); return a && a.firstFrame != null ? a : null; })()`, 30000, "vídeo do prato onde parou");
    const settle = await probe();
    await sleep(4000);
    const after = mediaNet.summary();
    const snap = await probe();
    const heap1 = await phone.heapMB();
    return {
      landed,
      landedFirstFrameMs: ff.firstFrame,
      maxPlayingDuringScroll: snap.maxPlaying,
      maxReelVideos: snap.maxReelVideos,
      reelVideosNow: settle.reelVideosNow,
      playingNow: snap.playingNow,
      afterStopVideoMB: after.MB,
      afterStopUrls: Object.keys(after.perVideoKB),
      heap: { before: heap0, after: heap1 },
      maxEventMs: snap.maxEventMs,
      longTaskMs: snap.longTaskMs,
    };
  });

  await scenario("voltar", "Voltar para vídeos já vistos (wifi): o que é baixado de novo", async () => {
    await openReels(A.slug, { network: "fast4g" });
    for (let i = 0; i < 3; i++) await swipeAndMeasure("up", 2500);
    mediaNet.reset();
    cache.hits = 0;
    const back = [];
    for (let i = 0; i < 3; i++) back.push(await swipeAndMeasure("down", 1200));
    const net = mediaNet.summary();
    return { backFromSwipeMs: back.map((b) => b.fromSwipe), redownloadMB: net.MB, requests: net.requests, fromBrowserCache: cache.hits, perVideoKB: net.perVideoKB };
  });

  await scenario("queda-conexao", "Queda de conexão de 6 s no meio de um vídeo (slow4g) e volta", async () => {
    await openReels(A.slug, { network: "slow4g" });
    await swipeAndMeasure("up", 1500);
    await sleep(800);
    await phone.offline(true);
    mediaNet.reset();
    await sleep(6000);
    const whileOffline = mediaNet.summary();
    const during = await phone.evaluate(activeState);
    await phone.network("slow4g");
    const t0 = Date.now();
    const t = during?.t ?? 0;
    const resumed = await phone
      .waitFor(`(() => { const s = ${activeState}; return s && !s.paused && s.t > ${t + 0.5} ? s : null; })()`, 40000, "vídeo voltou a tocar")
      .then(() => Date.now() - t0)
      .catch(() => null);
    await sleep(3000);
    const snap = await probe();
    const net = mediaNet.summary();
    // A interface continua utilizável: o próximo prato abre.
    const next = await swipeAndMeasure("up", 300).catch(() => null);
    return { stateWhileOffline: during, requestsWhileOffline: whileOffline.requests, resumedAfterMs: resumed, requestsAfter: net.requests, mediaErrors: snap.mediaErrors.length, nextAfterRecoveryMs: next?.fromSwipe ?? null };
  });

  await scenario("video-quebrado", "Vídeo inexistente e arquivo que não é vídeo no feed", async () => {
    phone = await newPhone();
    await phone.network("fast4g");
    await phone.goto(`${APP}/r/${A.slug}?reel=${BROKEN.missing}`);
    await phone.waitFor(`${ACTIVE}?.getAttribute("aria-label") === "Prato sem arquivo"`, 90000, "abriu no prato sem arquivo");
    mediaNet.reset();
    await sleep(8000);
    const missing = { requests: mediaNet.summary().requests, poster: await phone.evaluate(`!!${ACTIVE}?.querySelector(".kd-reel-poster")`), spinner: await phone.evaluate(`!!${ACTIVE}?.querySelector(".is-loading")`) };
    await phone.swipe("up");
    await phone.waitFor(`${ACTIVE}?.getAttribute("aria-label") === "Prato com arquivo ruim"`, 10000, "foi para o arquivo ruim");
    mediaNet.reset();
    await sleep(8000);
    const corrupt = { requests: mediaNet.summary().requests, poster: await phone.evaluate(`!!${ACTIVE}?.querySelector(".kd-reel-poster")`), spinner: await phone.evaluate(`!!${ACTIVE}?.querySelector(".is-loading")`) };
    await phone.swipe("down");
    await phone.swipe("down");
    const usable = await phone.waitFor(`(() => { const s = ${activeState}; return s && !s.paused && s.t > 0.3; })()`, 20000, "vídeo bom anterior toca").catch(() => false);
    await phone.shot("video-quebrado");
    return { missing, corrupt, feedStillWorks: Boolean(usable) };
  });

  await scenario("autoplay-bloqueado", "Navegador que recusa tocar sozinho (ex.: iPhone em economia de energia)", async () => {
    // play() só funciona dentro de um toque ou clique, mesmo sem som.
    phone = await newPhone({
      script: `(() => { const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { const e = window.event; if (!e || !/^(pointerup|touchend|click|keydown|keyup)$/.test(e.type)) return Promise.reject(new DOMException("bloqueado", "NotAllowedError")); return play.call(this); }; })();`,
    });
    await phone.goto(`${APP}/r/${A.slug}`);
    await phone.waitFor(`document.querySelectorAll(".kd-reels-bubble").length > 0`, 90000, "bolhas");
    await sleep(2000);
    await phone.tapEl(`[...document.querySelectorAll(".kd-reels-rail-all")][0]`);
    await phone.waitFor(`!!${ACTIVE}`, 15000, "feed aberto");
    await sleep(1500);
    await phone.swipe("up");
    await phone.waitFor(`${activeIndex} === 1`, 10000, "segundo prato");
    await sleep(2000);
    const blocked = { state: await phone.evaluate(activeState), playIcon: await phone.evaluate(`!!${ACTIVE}?.querySelector(".kd-reel-state:not(.is-loading)")`), spinner: await phone.evaluate(`!!${ACTIVE}?.querySelector(".is-loading")`) };
    // Um toque deveria bastar para tocar.
    await phone.touch(195, 420);
    await sleep(1200);
    const afterOneTap = await phone.evaluate(activeState);
    await sleep(400);
    return { blocked, playsAfterOneTap: Boolean(afterOneTap && !afterOneTap.paused && afterOneTap.t > 0), afterOneTap };
  });

  await scenario("reduzir-movimento", "Reduzir movimento: nada toca sozinho, um toque inicia", async () => {
    phone = await newPhone();
    await phone.reducedMotion(true);
    await phone.goto(`${APP}/r/${A.slug}`);
    await phone.waitFor(`document.querySelectorAll(".kd-reels-bubble").length > 0`, 90000, "bolhas");
    await sleep(1500);
    mediaNet.reset();
    await phone.tapEl(`[...document.querySelectorAll(".kd-reels-rail-all")][0]`);
    await phone.waitFor(`!!${ACTIVE}`, 15000, "feed aberto");
    await sleep(2500);
    const idle = { state: await phone.evaluate(activeState), requests: mediaNet.summary().requests, MB: mediaNet.summary().MB };
    await phone.touch(195, 420);
    const t0 = Date.now();
    const started = await phone.waitFor(`(() => { const s = ${activeState}; return s && !s.paused && s.t > 0; })()`, 15000, "tocou após o toque").then(() => Date.now() - t0).catch(() => null);
    return { idle, tapToPlayMs: started };
  });

  await scenario("longa-duracao", "Uso prolongado: 3 voltas por 30 vídeos (fast4g), memória e elementos", async () => {
    await openReels(A.slug, { network: "fast4g" });
    const start = await phone.heapMB();
    const samples = [];
    for (let lap = 0; lap < 3; lap++) {
      for (let i = 0; i < 30; i++) {
        await phone.swipe("up");
        await sleep(450);
      }
      await phone.evaluate(`document.querySelector(".kd-reels-track").scrollTo({ top: 0 })`);
      await sleep(1500);
      samples.push(await phone.heapMB());
    }
    const snap = await probe();
    return { start, samples, maxPlaying: snap.maxPlaying, maxReelVideos: snap.maxReelVideos, reelVideosNow: snap.reelVideosNow };
  });

  await scenario("troca-restaurante", "Troca de restaurante: nada do anterior continua tocando ou baixando", async () => {
    await openReels(A.slug, { network: "fast4g" });
    await phone.goto(`${APP}/r/${B.slug}`);
    mediaNet.reset();
    await phone.waitFor(`document.querySelectorAll(".kd-reels-bubble").length === ${B.videos}`, 60000, "cardápio B");
    await sleep(3000);
    const net = mediaNet.summary();
    const names = await phone.evaluate(`[...document.querySelectorAll(".kd-reels-bubble-name")].map(e => e.textContent)`);
    return { requestsToA: Object.keys(net.perVideoKB).filter((u) => !u.startsWith("v=b")).length, urlsSeen: Object.keys(net.perVideoKB), bubbles: names.length, playingNow: (await probe()).playingNow };
  });

  fs.writeFileSync(path.join(OUT, "perf-results.json"), JSON.stringify({ mode: MODE, at: new Date().toISOString(), results, checks }, null, 2));
  console.log(`\nResultados: ${path.join(OUT, "perf-results.json")}`);
} finally {
  try {
    ws?.close();
  } catch {}
  killTree(browserProc);
  killTree(server);
  mediaServer.closeAllConnections();
  mediaServer.close();
}
