// Otimiza vídeos antigos (enviados antes do worker de vídeo), sem apagar nada.
//
// Uso:
//   node scripts/reprocess-legacy-videos.mjs                      simula: lista o que seria processado
//   node scripts/reprocess-legacy-videos.mjs --aplicar            processa até 20 vídeos
//   node scripts/reprocess-legacy-videos.mjs --aplicar --max=50 --restaurante=<id>
//
// Para cada produto com vídeo antigo (restaurantes/{id}/produtos/videos/...) e sem vídeo otimizado:
//   1. cria o registro em restaurantes/{id}/videos/{videoId};
//   2. copia o arquivo antigo para restaurantes/{id}/produtos/{produto}/videos/original/{videoId}.{ext};
//   3. a cópia dispara o worker, que otimiza e troca o videoUrl do produto quando a versão nova estiver pronta.
// O arquivo antigo continua no Storage (o produto só muda de URL depois da validação no worker).
//
// --versoes: em vez de vídeos antigos, pega os já otimizados que ainda não têm as versões extras (540p, 360p, AV1;
// só faz sentido com VIDEO_VARIANTS ligado no worker). A cópia é a versão otimizada: o worker a remonta sem perda
// (já é H.264 compatível) e gera as versões a partir dela. Quando o vídeo novo fica pronto, o worker apaga os
// arquivos do anterior. Cada vídeo conta na cota diária do estabelecimento (DAILY_VIDEO_QUOTA): use --max.
//   node scripts/reprocess-legacy-videos.mjs --versoes [--aplicar] [--max=20] [--restaurante=<id>]
//
// Requer FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY e o bucket
// (FIREBASE_ADMIN_STORAGE_BUCKET ou NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET), lidos do ambiente ou do .env.local.
import { existsSync, readFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const args = process.argv.slice(2);
const apply = args.includes("--aplicar");
const variantsMode = args.includes("--versoes");
const max = Number(args.find((a) => a.startsWith("--max="))?.split("=")[1] ?? 20);
const onlyRestaurant = args.find((a) => a.startsWith("--restaurante="))?.split("=")[1];

const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const bucketName = process.env.FIREBASE_ADMIN_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!projectId || !clientEmail || !privateKey || !bucketName) {
  console.error("Credenciais de servidor ausentes. Defina FIREBASE_ADMIN_* e o bucket no .env.local.");
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: bucketName });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

const ID = /^[A-Za-z0-9_-]{6,64}$/;
const TYPES = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/** Caminho no bucket a partir da URL de download do Firebase, só se for um vídeo antigo deste restaurante. */
function legacyPath(url, restaurantId) {
  const m = /\/o\/([^?]+)/.exec(String(url || ""));
  if (!m) return null;
  const path = decodeURIComponent(m[1]);
  return path.startsWith(`restaurantes/${restaurantId}/produtos/videos/`) ? path : null;
}

/** Caminho da versão otimizada publicada, só se for deste restaurante e produto. */
function optimizedPath(video, restaurantId, productId) {
  const path = String(video?.optimizedPath || "");
  return path.startsWith(`restaurantes/${restaurantId}/produtos/${productId}/videos/optimized/`) && /^[A-Za-z0-9_-]{6,64}\.mp4$/.test(path.split("/").pop()) ? path : null;
}

async function detectExt(file) {
  const [head] = await file.download({ start: 0, end: 15 });
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp") return head.toString("latin1", 8, 12) === "qt  " ? "mov" : "mp4";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  return null;
}

const restaurants = onlyRestaurant ? [await db.doc(`restaurantes/${onlyRestaurant}`).get()] : (await db.collection("restaurantes").get()).docs;
let queued = 0;
const skipped = [];
for (const restaurant of restaurants) {
  if (!restaurant.exists || !ID.test(restaurant.id)) continue;
  const products = await restaurant.ref.collection("produtos").get();
  for (const product of products.docs) {
    if (queued >= max) break;
    const data = product.data();
    if (!data.videoUrl) continue;
    if (variantsMode ? !data.video || data.video.variants?.length : data.video) continue;
    const source = variantsMode ? optimizedPath(data.video, restaurant.id, product.id) : legacyPath(data.videoUrl, restaurant.id);
    if (!source || !ID.test(product.id)) {
      skipped.push(`${restaurant.id}/${product.id}: ${variantsMode ? "vídeo otimizado fora do padrão" : "URL fora do padrão antigo"}`);
      continue;
    }
    const file = bucket.file(source);
    const [exists] = await file.exists();
    if (!exists) {
      skipped.push(`${restaurant.id}/${product.id}: arquivo antigo não encontrado (${source})`);
      continue;
    }
    const ext = await detectExt(file);
    if (!ext) {
      skipped.push(`${restaurant.id}/${product.id}: formato não reconhecido (${source})`);
      continue;
    }
    const [meta] = await file.getMetadata();
    const videoRef = restaurant.ref.collection("videos").doc();
    const original = `restaurantes/${restaurant.id}/produtos/${product.id}/videos/original/${videoRef.id}.${ext}`;
    console.log(`${apply ? "processando" : "processaria"}: ${data.name || product.id} (${(Number(meta.size) / 1048576).toFixed(1)} MB) → ${original}`);
    if (apply) {
      await videoRef.set({
        productId: product.id,
        status: "uploading",
        originalPath: original,
        originalSize: Number(meta.size),
        contentType: TYPES[ext],
        fileName: source.split("/").pop().slice(0, 120),
        createdBy: variantsMode ? "script:reprocess-legacy-videos:versoes" : "script:reprocess-legacy-videos",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        uploadCompletedAt: FieldValue.serverTimestamp(),
      });
      if (variantsMode) {
        // Objeto novo, sem herdar os metadados do otimizado: "kardapGenerated" faria o worker ignorar o evento.
        await pipeline(file.createReadStream(), bucket.file(original).createWriteStream({ resumable: false, metadata: { contentType: TYPES[ext], metadata: { legacySource: source, videoId: videoRef.id, productId: product.id } } }));
      } else {
        await file.copy(bucket.file(original), { contentType: TYPES[ext], metadata: { legacySource: source, videoId: videoRef.id, productId: product.id } });
      }
    }
    queued++;
  }
}

console.log(`\n${apply ? "Enviados para otimização" : "Seriam enviados"}: ${queued} vídeo(s).`);
if (skipped.length) console.log(`Ignorados (${skipped.length}):\n  ${skipped.join("\n  ")}`);
if (!apply && queued) console.log("Nada foi alterado. Rode de novo com --aplicar para processar.");
