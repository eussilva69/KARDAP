/**
 * Servidor HTTP do worker (Cloud Run).
 *
 *   POST /                → evento CloudEvent do Eventarc (google.cloud.storage.object.v1.finalized)
 *   POST /tasks/cleanup   → limpeza diária (Cloud Scheduler)
 *   GET  /healthz         → verificação de saúde
 *
 * O serviço é implantado sem acesso público (--no-allow-unauthenticated): só as contas de serviço
 * do Eventarc e do Scheduler, com o papel run.invoker, conseguem chamar estas rotas.
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { runCleanup } from "./cleanup.ts";
import { loadConfig } from "./config.ts";
import { createBlobStore, createVideoRepo, initFirebase } from "./firebase.ts";
import { createLogger } from "./log.ts";
import { encode, encodeVariant, hasEncoder, makeThumbnail, planFor, probe, validateOutput, type MediaTools } from "./media.ts";
import { handleObjectFinalized, type Deps, type StorageEvent } from "./pipeline.ts";

const FINALIZED = "google.cloud.storage.object.v1.finalized";

/** Aceita CloudEvent em modo binário (cabeçalhos ce-*) e estruturado (application/cloudevents+json). */
export function parseCloudEvent(headers: IncomingMessage["headers"], body: string): { type: string; id: string; data: StorageEvent } | null {
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const structured = String(headers["content-type"] ?? "").includes("cloudevents+json");
  const type = String(structured ? parsed.type : headers["ce-type"] ?? "");
  const id = String(structured ? parsed.id : headers["ce-id"] ?? "");
  const data = structured ? parsed.data : parsed;
  if (!data || typeof data.name !== "string" || typeof data.bucket !== "string") return null;
  return {
    type,
    id,
    data: {
      bucket: data.bucket,
      name: data.name,
      generation: String(data.generation ?? ""),
      size: Number(data.size ?? 0),
      contentType: String(data.contentType ?? ""),
      metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : {},
    },
  };
}

function readBody(req: IncomingMessage, max = 1024 * 1024) {
  return new Promise<string>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new Error("corpo grande demais"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function main() {
  const config = loadConfig();
  const log = createLogger({ service: "video-worker" });
  if (config.variants.length) log.info("versões extras ligadas", { variants: config.variants });
  const { db, bucket } = initFirebase(config.bucket);
  const tools: MediaTools = { ffmpeg: config.ffmpegPath, ffprobe: config.ffprobePath, timeoutMs: config.ffmpegTimeoutMs };
  const deps: Deps = {
    config,
    log,
    repo: createVideoRepo(db, config.leaseMs, config.maxAttempts),
    blobs: createBlobStore(bucket),
    media: {
      probe: (file) => probe(tools, file),
      plan: (p) => planFor(p),
      encode: (input, output, plan, settings, strategy) => encode(tools, input, output, plan, settings, strategy),
      validate: (file, source, expected, codec) => validateOutput(tools, file, source, expected, codec),
      thumbnail: (input, output, plan, duration, tmp) => makeThumbnail(tools, input, output, plan, duration, tmp),
      variant: (input, output, plan, kind, settings) => encodeVariant(tools, input, output, plan, kind, settings),
      canEncode: (kind) => hasEncoder(tools, kind === "av1" ? "libsvtav1" : "libx264"),
    },
    now: () => Date.now(),
    newId: () => randomUUID(),
  };

  const server = createServer(async (req, res) => {
    const reply = (status: number, body?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && req.url === "/healthz") return reply(200, { ok: true });
      if (req.method === "POST" && req.url === "/tasks/cleanup") return reply(200, await runCleanup(db, bucket as never, config, log));
      if (req.method === "POST" && (req.url === "/" || req.url === "/events/storage")) {
        const event = parseCloudEvent(req.headers, await readBody(req));
        if (!event) {
          log.warn("evento inválido descartado");
          return reply(204);
        }
        if (event.type !== FINALIZED) return reply(204);
        const result = await handleObjectFinalized(event.data, deps);
        return reply(result.status, { outcome: result.outcome, eventId: event.id });
      }
      reply(404, { error: "rota inexistente" });
    } catch (error) {
      // Erro inesperado (ex.: Firestore indisponível): 500 devolve o evento para a fila.
      log.error("erro não tratado", { error, url: req.url });
      reply(500, { error: "erro interno" });
    }
  });
  // O Cloud Run espera até a resposta; o processamento tem limite próprio (FFMPEG_TIMEOUT_SECONDS).
  server.requestTimeout = 0;
  server.listen(config.port, () => log.info("worker de vídeo no ar", { port: config.port, bucket: config.bucket, preset: config.preset, crf: config.crf }));
  process.on("SIGTERM", () => {
    log.info("SIGTERM recebido; encerrando após as respostas em andamento");
    server.close(() => process.exit(0));
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.ts")) main();
