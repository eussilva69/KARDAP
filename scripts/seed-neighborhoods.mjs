/**
 * Pré-carrega bairros de cidades prioritárias no Firestore (geo_cache/bairros_{ibgeCode}).
 * Reutiliza os documentos que ainda não expiraram (30 dias) e só reconsulta as APIs externas
 * quando necessário, reduzindo latência e custos para os restaurantes.
 *
 * Uso:
 *   node scripts/seed-neighborhoods.mjs              # apenas cidades prioritárias
 *   node scripts/seed-neighborhoods.mjs --force      # recarrega mesmo se ainda em cache
 *   node scripts/seed-neighborhoods.mjs --list       # mostra status sem buscar nada
 *
 * Credenciais: FIREBASE_ADMIN_CREDENTIALS (JSON) ou
 *              FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY
 */

import { readFileSync, existsSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  let i = 0;
  while (i < text.length) {
    const newlineAt = text.indexOf("\n", i);
    const line = (newlineAt === -1 ? text.slice(i) : text.slice(i, newlineAt)).replace(/\r$/, "");
    i = newlineAt === -1 ? text.length : newlineAt + 1;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    for (const quote of ["'", '"']) {
      if (value.startsWith(quote)) {
        if (value.length > 1 && value.endsWith(quote)) {
          value = value.slice(1, -1);
        } else {
          const end = text.indexOf(quote, i);
          value = text.slice(i, end === -1 ? text.length : end).replace(/\r$/, "");
          value = match[2].slice(1) + "\n" + value;
          i = end === -1 ? text.length : end + 1 + (text[end + 1] === "\n" ? 1 : 0);
        }
        break;
      }
    }
    process.env[match[1]] = value;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

// ─── Firebase Admin ───────────────────────────────────────────────────────────

function parseCredentialsJson(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  try { return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8")); } catch { return null; }
}

const parsed = parseCredentialsJson(process.env.FIREBASE_ADMIN_CREDENTIALS);
const projectId = parsed?.project_id || process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = parsed?.client_email || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = (parsed?.private_key || process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Credenciais do Firebase Admin ausentes.");
  console.error("Configure FIREBASE_ADMIN_CREDENTIALS (JSON) ou as três variáveis FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY.");
  process.exit(1);
}
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// ─── Cidades prioritárias ─────────────────────────────────────────────────────

const PRIORITY_CITIES = [
  // Grande São Paulo – metrópole
  { ibgeCode: "3550308", name: "São Paulo",             uf: "SP" },
  { ibgeCode: "3518800", name: "Guarulhos",             uf: "SP" },
  { ibgeCode: "3547809", name: "Santo André",           uf: "SP" },
  { ibgeCode: "3548708", name: "São Bernardo do Campo", uf: "SP" },
  { ibgeCode: "3548807", name: "São Caetano do Sul",    uf: "SP" },
  { ibgeCode: "3513801", name: "Diadema",               uf: "SP" },
  { ibgeCode: "3529401", name: "Mauá",                  uf: "SP" },
  { ibgeCode: "3543303", name: "Ribeirão Pires",        uf: "SP" },
  { ibgeCode: "3544103", name: "Rio Grande da Serra",   uf: "SP" },
  // Microrregião de Mogi das Cruzes
  { ibgeCode: "3530607", name: "Mogi das Cruzes",       uf: "SP" },
  { ibgeCode: "3552502", name: "Suzano",                uf: "SP" },
  { ibgeCode: "3515608", name: "Ferraz de Vasconcelos", uf: "SP" },
  { ibgeCode: "3523404", name: "Itaquaquecetuba",       uf: "SP" },
  { ibgeCode: "3539400", name: "Poá",                   uf: "SP" },
  { ibgeCode: "3503505", name: "Arujá",                 uf: "SP" },
  { ibgeCode: "3546405", name: "Santa Isabel",          uf: "SP" },
  { ibgeCode: "3518404", name: "Guararema",             uf: "SP" },
  { ibgeCode: "3506607", name: "Biritiba Mirim",        uf: "SP" },
  { ibgeCode: "3545100", name: "Salesópolis",           uf: "SP" },
];

// ─── Constantes ───────────────────────────────────────────────────────────────

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OSM_TIMEOUT_MS = 30_000; // script pode esperar mais que funções serverless
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// ─── Normalização de nomes ────────────────────────────────────────────────────

const ABBR = { jd: "jardim", pq: "parque", vl: "vila", av: "avenida", r: "rua", "n sra": "nossa senhora", "nsa sra": "nossa senhora", "st": "setor", "res": "residencial" };
const ROMAN = { ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8", ix: "9" };

function neighborhoodKey(name) {
  let s = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\b(de|do|da|dos|das|e|o|a|os|as|bairro)\b/g, " ").trim();
  s = s.replace(/\b(\w+)\b/g, (w) => ABBR[w] || w);
  s = s.replace(/\b(\w+)\b/g, (w) => ROMAN[w] || w);
  return s.replace(/\s+/g, " ").trim();
}

function cityKey(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Junta listas de bairros sem duplicar grafias equivalentes e sem o nome da cidade. */
function mergeNeighborhoods(cityName, lists) {
  const city = cityKey(cityName);
  const seen = new Map();
  for (const { names, source } of lists) {
    for (const raw of names) {
      const name = raw.replace(/\s+/g, " ").trim();
      const key = neighborhoodKey(name);
      if (!key || key === city || name.length > 100 || seen.has(key)) continue;
      seen.set(key, { name, source });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ─── OSM via Overpass ─────────────────────────────────────────────────────────

function overpassQuery(ibgeCode) {
  const code = ibgeCode.replace(/\D/g, "");
  return `[out:json][timeout:60];
area["IBGE:GEOCODIGO"="${code}"]->.a;
(
  rel(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"];
  nwr(area.a)["place"~"^(suburb|neighbourhood|quarter)$"];
);
out tags;`;
}

async function fetchOsmNeighborhoods(ibgeCode) {
  const body = `data=${encodeURIComponent(overpassQuery(ibgeCode))}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSM_TIMEOUT_MS);
  try {
    return await new Promise((resolve) => {
      let pending = OVERPASS_URLS.length;
      for (const url of OVERPASS_URLS) {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: controller.signal })
          .then(async (res) => {
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            resolve((data.elements || []).map((e) => e.tags?.name || "").filter(Boolean));
          })
          .catch(() => {
            pending -= 1;
            if (pending === 0) resolve(null);
          });
      }
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

// ─── IBGE distritos ───────────────────────────────────────────────────────────

async function fetchIbgeDistricts(ibgeCode) {
  const names = [];
  const results = await Promise.allSettled([
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${ibgeCode}/distritos`, { signal: AbortSignal.timeout(10000) }),
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${ibgeCode}/subdistritos`, { signal: AbortSignal.timeout(10000) }),
  ]);
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.ok) continue;
    const list = await r.value.json().catch(() => []);
    for (const item of list) if (item?.nome) names.push(item.nome);
  }
  return names;
}

// ─── Lógica de seed ───────────────────────────────────────────────────────────

async function seedCity(city, force) {
  const docRef = db.collection("geo_cache").doc(`bairros_${city.ibgeCode}`);
  const snap = await docRef.get();

  if (!force && snap.exists && Number(snap.get("expiresAt")) > Date.now()) {
    const list = snap.get("list") || [];
    return { status: "cached", count: list.length };
  }

  const [osm, ibge] = await Promise.all([
    fetchOsmNeighborhoods(city.ibgeCode),
    fetchIbgeDistricts(city.ibgeCode).catch(() => []),
  ]);

  const list = mergeNeighborhoods(city.name, [
    { names: osm || [], source: "osm" },
    { names: ibge, source: "ibge" },
  ]);

  if (osm === null && list.length === 0) {
    return { status: "empty", count: 0 };
  }

  const expiresAt = Date.now() + TTL_MS;
  await docRef.set({
    ibgeCode: city.ibgeCode,
    cityName: city.name,
    uf: city.uf,
    list,
    fetchedAt: new Date().toISOString(),
    expiresAt,
    seededBy: "scripts/seed-neighborhoods.mjs",
  });

  return { status: osm === null ? "partial" : "seeded", count: list.length };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes("--force");
const listOnly = args.includes("--list");

console.log(`\nKardap · Seed de bairros${force ? " (--force)" : ""}${listOnly ? " (--list)" : ""}`);
console.log(`Projeto: ${projectId}`);
console.log(`Cidades: ${PRIORITY_CITIES.length}\n`);

if (listOnly) {
  console.log("Verificando status no Firestore…\n");
  for (const city of PRIORITY_CITIES) {
    const snap = await db.collection("geo_cache").doc(`bairros_${city.ibgeCode}`).get();
    if (!snap.exists) {
      console.log(`  ✗  ${city.name.padEnd(25)} não cadastrada`);
    } else {
      const expiry = Number(snap.get("expiresAt"));
      const fresh = expiry > Date.now();
      const count = (snap.get("list") || []).length;
      const expires = new Date(expiry).toLocaleDateString("pt-BR");
      const icon = fresh ? "✓" : "↻";
      console.log(`  ${icon}  ${city.name.padEnd(25)} ${count} bairros · expira ${expires}${fresh ? "" : " · EXPIRADO"}`);
    }
  }
  console.log();
  process.exit(0);
}

let seeded = 0, cached = 0, partial = 0, failed = 0;
const start = Date.now();

for (const city of PRIORITY_CITIES) {
  process.stdout.write(`  → ${city.name.padEnd(25)} `);
  try {
    const result = await seedCity(city, force);
    if (result.status === "cached") {
      process.stdout.write(`(em cache · ${result.count} bairros)\n`);
      cached++;
    } else if (result.status === "seeded") {
      process.stdout.write(`✓ ${result.count} bairros salvo\n`);
      seeded++;
    } else if (result.status === "partial") {
      process.stdout.write(`⚠ ${result.count} bairros (OSM sem resposta, só IBGE)\n`);
      partial++;
    } else {
      process.stdout.write(`✗ nenhum bairro encontrado\n`);
      failed++;
    }
  } catch (err) {
    process.stdout.write(`✗ erro: ${err.message}\n`);
    failed++;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\nConcluído em ${elapsed}s · ${seeded} seeded · ${cached} em cache · ${partial} parciais · ${failed} falhas\n`);
process.exit(failed > 0 && seeded + cached + partial === 0 ? 1 : 0);
