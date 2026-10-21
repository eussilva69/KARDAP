// Cria, popula e valida a conta demonstrativa "Brasa & Sabor" (docs/DEMO.md).
//
//   node scripts/demo/seed-demo.mjs --emulator      emuladores locais (projeto demo-kardap; ver docs/TESTES.md)
//   node scripts/demo/seed-demo.mjs --production    projeto do .env.local (exige a flag explícita)
//
// Opções: --skip-media (dados sem mídia nova: reaproveita a já publicada), --refresh-media (baixa e processa de novo),
// --review (gera uma folha de contato com as capas para conferir se cada vídeo representa o prato).
//
// Etapas: conta no Firebase Auth → mídia licenciada (Pexels: busca, download, FFmpeg, WebP) → Storage (cópia mestra
// + publicada) → dados (lib/demo/apply.ts: restaurante, cardápio, mesas, pedidos, financeiro) → validação.
// Idempotente: rodar de novo restaura o estado inicial sem duplicar registros nem reenviar arquivos iguais.
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { applyDemo, readDemoConfig, restoreMediaFiles, assertDemoTarget } from "../../lib/demo/apply.ts";
import { DEMO_PRODUCTS } from "../../lib/demo/dataset.ts";
import { DEMO_MEDIA_PREFIX, DEMO_OWNER_EMAIL, DEMO_RESTAURANT_ID, DEMO_SLUG } from "../../lib/demo/ids.ts";
import { DEFAULT_FINANCIAL_SETTINGS } from "../../lib/financial/types.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const args = new Set(process.argv.slice(2));
const EMULATOR = args.has("--emulator");
const PRODUCTION = args.has("--production");
const SKIP_MEDIA = args.has("--skip-media");
const REFRESH_MEDIA = args.has("--refresh-media");
const REVIEW = args.has("--review");
if (EMULATOR === PRODUCTION) {
  console.error("Escolha o destino: --emulator (emuladores locais) ou --production (projeto do .env.local).");
  process.exit(2);
}

const CACHE = path.join(ROOT, ".tmp", "demo-media");
const LOG_FILE = path.join(ROOT, ".tmp", `demo-seed-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
fs.mkdirSync(CACHE, { recursive: true });
const log = (message) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
};

// ───────── Ambiente (.env, depois .env.local por cima, como o Next.js) ─────────
function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  const text = fs.readFileSync(file, "utf8");
  const re = /^\s*([A-Z0-9_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(.*))\s*$/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) out[m[1]] = m[2] !== undefined ? m[2].replace(/\\n/g, "\n") : m[3] !== undefined ? m[3] : (m[4] || "").trim();
  return out;
}
const env = { ...loadEnv(path.join(ROOT, ".env")), ...loadEnv(path.join(ROOT, ".env.local")), ...process.env };

// ───────── Firebase Admin ─────────
let bucketName;
let storageBase;
if (EMULATOR) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "127.0.0.1:9199";
  bucketName = "demo-kardap.appspot.com";
  storageBase = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
  initializeApp({ projectId: "demo-kardap", storageBucket: bucketName });
} else {
  for (const k of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) delete process.env[k];
  let creds = null;
  if (env.FIREBASE_ADMIN_CREDENTIALS?.trim()) {
    const raw = env.FIREBASE_ADMIN_CREDENTIALS.trim();
    creds = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  } else {
    creds = { project_id: env.FIREBASE_ADMIN_PROJECT_ID, client_email: env.FIREBASE_ADMIN_CLIENT_EMAIL, private_key: env.FIREBASE_ADMIN_PRIVATE_KEY };
  }
  if (!creds.project_id || !creds.client_email || !creds.private_key) throw new Error("Credenciais do Firebase Admin ausentes no .env.local.");
  bucketName = env.FIREBASE_ADMIN_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  storageBase = "https://firebasestorage.googleapis.com";
  initializeApp({ credential: cert({ projectId: creds.project_id, clientEmail: creds.client_email, privateKey: String(creds.private_key).replace(/\\n/g, "\n") }), storageBucket: bucketName });
  log(`destino: PRODUÇÃO (projeto ${creds.project_id}, bucket ${bucketName})`);
}
const auth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket(bucketName);

// ───────── Utilidades ─────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function run(bin, argv, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, argv, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    p.stdout?.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(bin)} saiu com ${code}: ${err.slice(-500)}`))));
  });
}
const ffmpeg = (a) => run(env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);
const ffprobe = async (file) => JSON.parse(await run(env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { capture: true }));
const md5 = (file) => createHash("md5").update(fs.readFileSync(file)).digest("base64");
const tokenFor = (key) => {
  const h = createHash("sha256").update(`kardap-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const publicUrl = (p, token) => `${storageBase}/v0/b/${bucketName}/o/${encodeURIComponent(p)}?alt=media&token=${token}`;

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  // Grava em disco à medida que chega (conexões lentas não estouram a memória nem o prazo de uma vez só).
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + ".part"));
      fs.renameSync(dest + ".part", dest);
      return dest;
    } catch (error) {
      fs.rmSync(dest + ".part", { force: true });
      if (attempt >= 4) throw new Error(`download falhou (${url}): ${error.cause?.code || ""} ${error.cause?.message || error.message}`);
      await sleep(attempt * 4000);
    }
  }
}

// ───────── Pexels (licença: https://www.pexels.com/license/ — uso comercial gratuito, sem atribuição obrigatória) ─────────
const PEXELS_LICENSE = "Pexels License (uso comercial gratuito, sem atribuição obrigatória) — https://www.pexels.com/license/";
async function pexels(pathAndQuery) {
  if (!env.PEXELS_API_KEY) throw new Error("Defina PEXELS_API_KEY no .env.local (chave gratuita em https://www.pexels.com/api/).");
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`https://api.pexels.com${pathAndQuery}`, { headers: { Authorization: env.PEXELS_API_KEY.trim() }, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      // Falha de rede (conexão recusada, DNS, tempo esgotado): tenta de novo e, no fim, mostra a causa real.
      if (attempt < 4) {
        await sleep(attempt * 3000);
        continue;
      }
      throw new Error(`Pexels inacessível: ${error.cause?.code || ""} ${error.cause?.message || error.message}`);
    }
    if (res.status === 429 && attempt < 4) {
      await sleep(attempt * 5000);
      continue;
    }
    if (!res.ok) throw new Error(`Pexels ${res.status} em ${pathAndQuery}`);
    return res.json();
  }
}
const overridesFile = path.join(ROOT, "scripts", "demo", "media-overrides.json");
const OVERRIDES = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, "utf8")) : {};

function bestFile(video) {
  const files = (video.video_files || []).filter((f) => f.file_type === "video/mp4" && f.width && f.height);
  const tall = files.filter((f) => f.height >= 1280).sort((a, b) => a.height - b.height);
  return tall[0] || files.sort((a, b) => b.height - a.height)[0];
}
const eligible = (v) => v.height > v.width * 1.2 && v.duration >= 6 && bestFile(v);

async function chooseVideo(product, used) {
  const override = OVERRIDES[product.id];
  if (override?.pexelsVideoId) return { video: await pexels(`/videos/videos/${override.pexelsVideoId}`), start: override.start };
  for (const q of override?.queries || product.mediaQueries) {
    for (const page of [1, 2]) {
      const data = await pexels(`/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=40&page=${page}`);
      const pick = (data.videos || []).find((v) => eligible(v) && !used.has(v.id) && !(override?.exclude || []).includes(v.id));
      if (pick) return { video: pick, query: q };
    }
  }
  return null;
}

// ───────── Mídia de cada produto ─────────
async function prepareProductMedia(product, used) {
  const dir = path.join(CACHE, product.id);
  const metaFile = path.join(dir, "meta.json");
  fs.mkdirSync(dir, { recursive: true });
  const override = OVERRIDES[product.id];
  if (!REFRESH_MEDIA && fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const stale = override?.pexelsVideoId && override.pexelsVideoId !== meta.credit.id * 1;
    if (!stale && ["video.mp4", "poster.webp", "image.webp", "thumb.webp"].every((f) => fs.existsSync(path.join(dir, f)))) {
      used.add(Number(meta.credit.id));
      return meta;
    }
  }
  const choice = await chooseVideo(product, used);
  if (!choice) throw new Error(`nenhum vídeo licenciado adequado para ${product.name}`);
  const { video } = choice;
  used.add(video.id);
  const file = bestFile(video);
  const source = path.join(dir, `source-${video.id}.mp4`);
  await download(file.link, source);
  for (const f of fs.readdirSync(dir)) if (f.startsWith("source-") && f !== path.basename(source)) fs.rmSync(path.join(dir, f));

  const srcProbe = await ffprobe(source);
  const srcDuration = Number(srcProbe.format.duration) || video.duration;
  const start = choice.start ?? (srcDuration > 14 ? 1.5 : 0);
  const length = Math.min(10, Math.max(5, srcDuration - start));
  const out = path.join(dir, "video.mp4");
  // 720×1280 (9:16), H.264 High/yuv420p, 30 fps, sem áudio, moov no início (reprodução progressiva).
  await ffmpeg(["-ss", String(start), "-i", source, "-t", String(length), "-vf", "scale=720:1280:force_original_aspect_ratio=increase:flags=lanczos,crop=720:1280,fps=30,format=yuv420p,setsar=1", "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-preset", "slow", "-crf", "25", "-maxrate", "1800k", "-bufsize", "3600k", "-g", "60", "-movflags", "+faststart", "-an", out]);
  const posterAt = Math.min(2.2, length * 0.3);
  await ffmpeg(["-ss", String(posterAt), "-i", out, "-frames:v", "1", "-c:v", "libwebp", "-quality", "80", path.join(dir, "poster.webp")]);
  // Foto do produto: quadro do original em alta resolução, recorte quadrado central.
  await ffmpeg(["-ss", String(start + posterAt), "-i", source, "-frames:v", "1", "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=1080:1080:flags=lanczos", "-c:v", "libwebp", "-quality", "85", path.join(dir, "image.webp")]);
  await ffmpeg(["-i", path.join(dir, "image.webp"), "-vf", "scale=400:400:flags=lanczos", "-c:v", "libwebp", "-quality", "75", path.join(dir, "thumb.webp")]);

  const probe = await ffprobe(out);
  const v = probe.streams.find((s) => s.codec_type === "video");
  const meta = {
    productId: product.id,
    query: choice.query || "override",
    credit: { source: "Pexels", id: String(video.id), url: video.url, author: video.user?.name || "", authorUrl: video.user?.url || "", license: PEXELS_LICENSE },
    source: { width: file.width, height: file.height, duration: srcDuration, size: fs.statSync(source).size },
    video: { width: v.width, height: v.height, duration: Math.round(Number(probe.format.duration) * 10) / 10, size: fs.statSync(out).size, codec: v.codec_name, pixFmt: v.pix_fmt },
    image: { size: fs.statSync(path.join(dir, "image.webp")).size, smallSize: fs.statSync(path.join(dir, "thumb.webp")).size },
  };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  return meta;
}

// ───────── Marca (logo desenhada aqui; capa do Pexels) ─────────
const EDGE = env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const LOGO_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1024px;height:1024px;background:#18120f;overflow:hidden}
svg{display:block}
</style></head><body>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="58%" r="60%"><stop offset="0" stop-color="#3b2418"/><stop offset="1" stop-color="#18120f"/></radialGradient>
    <linearGradient id="fire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e4572e"/><stop offset=".55" stop-color="#f28b30"/><stop offset="1" stop-color="#ffc93c"/></linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <circle cx="512" cy="512" r="430" fill="none" stroke="#e4572e" stroke-width="14" opacity=".9"/>
  <circle cx="512" cy="512" r="402" fill="none" stroke="#f6ece3" stroke-width="3" opacity=".35"/>
  <path d="M512 196c40 74 132 128 132 236 0 52-24 94-58 118 10-50-8-92-40-118 4 46-18 80-46 96-30-18-50-50-50-92 0-34 14-62 30-84-58 26-104 86-104 158 0 34 10 66 28 92-46-30-78-84-78-148 0-128 120-176 186-258z" fill="url(#fire)"/>
  <text x="512" y="742" text-anchor="middle" font-family="'Segoe UI Black','Arial Black',Impact,sans-serif" font-size="128" letter-spacing="6" fill="#f6ece3">BRASA</text>
  <text x="512" y="838" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-style="italic" font-size="78" fill="#ffc93c">&amp; Sabor</text>
</svg></body></html>`;

async function prepareBrand() {
  const dir = path.join(CACHE, "_brand");
  fs.mkdirSync(dir, { recursive: true });
  const logoPng = path.join(dir, "logo.png");
  if (REFRESH_MEDIA || !fs.existsSync(logoPng)) {
    const html = path.join(dir, "logo.html");
    fs.writeFileSync(html, LOGO_HTML);
    await run(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${logoPng}`, "--window-size=1024,1024", `--user-data-dir=${path.join(dir, ".edge")}`, `file:///${html.replace(/\\/g, "/")}`]);
  }
  await ffmpeg(["-i", logoPng, "-vf", "scale=1024:1024", "-c:v", "libwebp", "-quality", "90", path.join(dir, "logo.webp")]);
  await ffmpeg(["-i", logoPng, "-vf", "scale=512:512:flags=lanczos", "-c:v", "libwebp", "-quality", "82", path.join(dir, "logo-small.webp")]);

  const coverMeta = path.join(dir, "cover.json");
  let meta = !REFRESH_MEDIA && fs.existsSync(coverMeta) ? JSON.parse(fs.readFileSync(coverMeta, "utf8")) : null;
  const override = OVERRIDES._cover;
  if (!meta || (override?.pexelsPhotoId && String(override.pexelsPhotoId) !== meta.credit.id)) {
    const photo = override?.pexelsPhotoId
      ? await pexels(`/v1/photos/${override.pexelsPhotoId}`)
      : (await pexels(`/v1/search?query=${encodeURIComponent(override?.query || "burger fries dark table")}&orientation=landscape&per_page=15`)).photos?.[0];
    if (!photo) throw new Error("nenhuma foto de capa encontrada");
    const src = path.join(dir, `cover-source-${photo.id}.jpg`);
    await download(photo.src.original, src);
    await ffmpeg(["-i", src, "-vf", "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080", "-c:v", "libwebp", "-quality", "85", path.join(dir, "cover.webp")]);
    await ffmpeg(["-i", path.join(dir, "cover.webp"), "-vf", "scale=960:540:flags=lanczos", "-c:v", "libwebp", "-quality", "82", path.join(dir, "cover-small.webp")]);
    meta = { credit: { source: "Pexels", id: String(photo.id), url: photo.url, author: photo.photographer, authorUrl: photo.photographer_url, license: PEXELS_LICENSE } };
    fs.writeFileSync(coverMeta, JSON.stringify(meta, null, 2));
  }
  return { dir, credit: meta.credit };
}

// ───────── Storage: cópia mestra (demo-media/…) + arquivo publicado (restaurantes/…) ─────────
const manifestFiles = [];
async function publish(localFile, livePath, contentType) {
  const master = `${DEMO_MEDIA_PREFIX}/${livePath.split("/").slice(2).join("/")}`;
  const token = tokenFor(livePath);
  const masterFile = bucket.file(master);
  const [exists] = await masterFile.exists();
  const sameContent = exists && (await masterFile.getMetadata())[0].md5Hash === md5(localFile);
  if (!sameContent) {
    await bucket.upload(localFile, {
      destination: master,
      resumable: false,
      metadata: { contentType, cacheControl: "public, max-age=31536000, immutable", metadata: { firebaseStorageDownloadTokens: token, demo: "true" } },
    });
  }
  const [liveExists] = await bucket.file(livePath).exists();
  if (!sameContent || !liveExists) await masterFile.copy(bucket.file(livePath));
  manifestFiles.push({ path: livePath, master });
  return publicUrl(livePath, token);
}

async function publishMedia(metas, brand) {
  const rid = DEMO_RESTAURANT_ID;
  const products = {};
  const queue = DEMO_PRODUCTS.filter((p) => metas[p.id]);
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const m = metas[p.id];
      const dir = path.join(CACHE, p.id);
      const videoId = `demo${m.credit.id}`;
      const base = `restaurantes/${rid}/produtos/${p.id}`;
      const optimizedPath = `${base}/videos/optimized/${videoId}.mp4`;
      const thumbnailPath = `${base}/thumbnails/${videoId}.webp`;
      const [videoUrl, videoPoster, image, imageThumb] = await Promise.all([
        publish(path.join(dir, "video.mp4"), optimizedPath, "video/mp4"),
        publish(path.join(dir, "poster.webp"), thumbnailPath, "image/webp"),
        publish(path.join(dir, "image.webp"), `restaurantes/${rid}/produtos/imagens/${p.id}-${m.credit.id}.webp`, "image/webp"),
        publish(path.join(dir, "thumb.webp"), `restaurantes/${rid}/produtos/imagens/${p.id}-${m.credit.id}-thumb.webp`, "image/webp"),
      ]);
      products[p.id] = {
        image,
        imageThumb,
        imageMeta: { width: 1080, height: 1080, format: "webp", size: m.image.size, smallSize: m.image.smallSize, originalSize: m.source.size },
        videoUrl,
        videoPoster,
        video: { id: videoId, width: m.video.width, height: m.video.height, duration: m.video.duration, optimizedPath, thumbnailPath, optimizedSize: m.video.size, originalSize: m.source.size },
        credit: m.credit,
      };
      log(`  publicado: ${p.name}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const [logo, logoSmall, cover, coverSmall] = await Promise.all([
    publish(path.join(brand.dir, "logo.webp"), `restaurantes/${rid}/logos/brasa-e-sabor-logo.webp`, "image/webp"),
    publish(path.join(brand.dir, "logo-small.webp"), `restaurantes/${rid}/logos/brasa-e-sabor-logo-small.webp`, "image/webp"),
    publish(path.join(brand.dir, "cover.webp"), `restaurantes/${rid}/capas/brasa-e-sabor-capa-${brand.credit.id}.webp`, "image/webp"),
    publish(path.join(brand.dir, "cover-small.webp"), `restaurantes/${rid}/capas/brasa-e-sabor-capa-${brand.credit.id}-small.webp`, "image/webp"),
  ]);
  return { brand: { logo, logoSmall, cover, coverSmall }, brandCredit: brand.credit, products, files: manifestFiles };
}

function writeCredits(media) {
  const lines = [
    "# Créditos da mídia da conta demonstrativa",
    "",
    "Gerado por `scripts/demo/seed-demo.mjs`. Todos os vídeos e fotos vêm do Pexels, sob a",
    "[Pexels License](https://www.pexels.com/license/): uso gratuito, inclusive comercial, sem atribuição obrigatória",
    "(a atribuição abaixo é por transparência). Os arquivos foram recortados para 9:16, comprimidos (H.264 720×1280,",
    "sem áudio, até 10 s) e convertidos em WebP. A logo foi desenhada para a demonstração.",
    "",
    "| Produto | Vídeo/foto no Pexels | Autor |",
    "| --- | --- | --- |",
    ...DEMO_PRODUCTS.filter((p) => media.products[p.id]).map((p) => {
      const c = media.products[p.id].credit;
      return `| ${p.name} | [${c.id}](${c.url}) | [${c.author}](${c.authorUrl}) |`;
    }),
    `| Capa do cardápio | [${media.brandCredit.id}](${media.brandCredit.url}) | [${media.brandCredit.author}](${media.brandCredit.authorUrl}) |`,
    "",
  ];
  fs.mkdirSync(path.join(ROOT, "docs", "demo"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "docs", "demo", "CREDITOS_MIDIA.md"), lines.join("\n"));
}

async function reviewSheet(metas) {
  const dir = path.join(CACHE, "_review");
  fs.mkdirSync(dir, { recursive: true });
  const cells = DEMO_PRODUCTS.filter((p) => metas[p.id])
    .map((p) => `<figure><img src="file:///${path.join(CACHE, p.id, "poster.webp").replace(/\\/g, "/")}"><figcaption>${p.name}<br><small>${metas[p.id].credit.id} · ${metas[p.id].query}</small></figcaption></figure>`)
    .join("");
  const html = path.join(dir, "review.html");
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:#eee;font:13px Segoe UI;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:6px}figure{margin:0}img{width:100%;aspect-ratio:9/16;object-fit:cover;display:block}figcaption{padding:2px}</style>${cells}`);
  const out = path.join(dir, "review.png");
  await run(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${out}`, "--window-size=1600,2000", "--allow-file-access-from-files", `--user-data-dir=${path.join(dir, ".edge")}`, `file:///${html.replace(/\\/g, "/")}`]);
  log(`folha de revisão: ${out}`);
}

// ───────── Conta de acesso ─────────
async function ensureAccount() {
  const email = env.DEMO_ACCOUNT_EMAIL || DEMO_OWNER_EMAIL;
  let password = env.DEMO_ACCOUNT_PASSWORD;
  if (!password) {
    // Senha forte gerada aqui e guardada só no .env.local (fora do Git). Nunca vai para o código.
    password = randomBytes(18).toString("base64url");
    fs.appendFileSync(path.join(ROOT, ".env.local"), `\n# Conta demonstrativa (scripts/demo/seed-demo.mjs). Não versionar.\nDEMO_ACCOUNT_EMAIL=${email}\nDEMO_ACCOUNT_PASSWORD=${password}\n`);
    log("senha da conta demo gerada e salva em .env.local (DEMO_ACCOUNT_PASSWORD)");
  }
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, emailVerified: true, displayName: "Brasa & Sabor (demonstração)", disabled: false });
    log(`conta existente atualizada: ${email}`);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email, password, emailVerified: true, displayName: "Brasa & Sabor (demonstração)" });
    log(`conta criada: ${email}`);
  }
  return { uid: user.uid, email };
}

// ───────── Validação ─────────
async function validate(media) {
  const problems = [];
  const r = db.collection("restaurantes").doc(DEMO_RESTAURANT_ID);
  const counts = {};
  for (const c of ["categorias", "produtos", "mesas", "pedidos", "chamados", "videos"]) counts[c] = (await r.collection(c).count().get()).data().count;
  log(`contagem: ${JSON.stringify(counts)}`);
  const products = await r.collection("produtos").get();
  const urls = [];
  for (const d of products.docs) {
    const p = d.data();
    if (!p.image || !p.videoUrl || !p.video?.optimizedPath) problems.push(`${p.name}: sem foto ou vídeo`);
    for (const u of [p.image, p.imageThumb, p.videoUrl, p.videoPoster]) if (u) urls.push([p.name, u]);
  }
  if (media) for (const u of Object.values(media.brand)) urls.push(["marca", u]);
  const queue = urls.slice();
  const check = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const res = await fetch(item[1], { headers: { Range: "bytes=0-1023" } }).catch((e) => ({ ok: false, status: e.message }));
      if (!res.ok) problems.push(`${item[0]}: ${res.status} ${item[1].slice(0, 120)}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, check));
  log(`mídia conferida: ${urls.length} arquivos`);
  // Totais dos pedidos (itens → subtotal → total) e canceladas fora da receita.
  const orders = await r.collection("pedidos").get();
  for (const d of orders.docs) {
    const o = d.data();
    const sum = (o.items || []).reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
    if (sum !== o.subtotalCents || o.subtotalCents + o.deliveryFeeCents - o.discountCents !== o.totalCents) problems.push(`pedido ${d.id}: totais inconsistentes`);
    if (o.establishmentId !== DEMO_RESTAURANT_ID) problems.push(`pedido ${d.id}: establishmentId incorreto`);
  }
  const balance = (await db.collection("restaurant_balances").doc(DEMO_RESTAURANT_ID).get()).data();
  const tx = await db.collection("financial_transactions").where("restaurant_id", "==", DEMO_RESTAURANT_ID).get();
  const net = tx.docs.reduce((s, d) => s + d.get("restaurant_net_cents"), 0);
  if (balance.pending_cents + balance.available_cents + balance.paid_out_cents !== net) problems.push("saldo financeiro não fecha com as transações");
  log(`financeiro: ${tx.size} transações, líquido ${(net / 100).toFixed(2)}, disponível ${(balance.available_cents / 100).toFixed(2)}, em carência ${(balance.pending_cents / 100).toFixed(2)}`);
  return problems;
}

// ───────── Execução ─────────
const started = Date.now();
try {
  log(`seed da demonstração → ${EMULATOR ? "emuladores" : "produção"} (log em ${path.relative(ROOT, LOG_FILE)})`);
  const account = await ensureAccount();
  await assertDemoTarget(db, account.uid);

  let media = null;
  if (SKIP_MEDIA) {
    media = (await readDemoConfig(db))?.media || null;
    log(media ? "mídia: reaproveitando a já publicada" : "mídia: nenhuma publicada ainda (--skip-media)");
  } else {
    log("mídia: buscando e processando vídeos licenciados (Pexels)");
    const used = new Set();
    const metas = {};
    const failed = [];
    for (const p of DEMO_PRODUCTS) {
      try {
        metas[p.id] = await prepareProductMedia(p, used);
        log(`  ${p.name}: Pexels ${metas[p.id].credit.id} (${metas[p.id].video.duration}s, ${Math.round(metas[p.id].video.size / 1024)} KB)`);
      } catch (error) {
        failed.push(p.name);
        log(`  ${p.name}: FALHOU — ${error.message}`);
      }
    }
    if (REVIEW) await reviewSheet(metas);
    const brand = await prepareBrand();
    log("mídia: enviando ao Storage");
    media = await publishMedia(metas, brand);
    writeCredits(media);
    if (failed.length) log(`ATENÇÃO: sem vídeo para ${failed.join(", ")} (o produto fica só com o nome, nunca com vídeo quebrado)`);
  }

  const settingsSnap = await db.collection("financial_settings").doc("global").get();
  const settings = { ...DEFAULT_FINANCIAL_SETTINGS, ...(settingsSnap.exists ? settingsSnap.data() : {}) };
  await applyDemo(db, { ownerId: account.uid, ownerEmail: account.email, media, settings, log });
  await db.collection("demoConfig").doc(DEMO_RESTAURANT_ID).set({ seededAt: new Date().toISOString() }, { merge: true });
  if (media) log(`arquivos restaurados a partir das cópias mestras: ${await restoreMediaFiles(bucket, media)}`);

  const problems = await validate(media);
  if (problems.length) {
    log(`VALIDAÇÃO: ${problems.length} problema(s)`);
    problems.forEach((p) => log(`  - ${p}`));
    process.exitCode = 1;
  } else {
    log("VALIDAÇÃO: tudo certo");
  }
  log(`cardápio: /r/${DEMO_SLUG} · delivery: /r/${DEMO_SLUG}/delivery · mesa: /r/${DEMO_SLUG}?mesa=demo-mesa-01-bs`);
  log(`concluído em ${Math.round((Date.now() - started) / 1000)} s`);
} catch (error) {
  log(`ERRO: ${error.stack || error.message}`);
  process.exitCode = 1;
}
