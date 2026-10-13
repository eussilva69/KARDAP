/** Configuração por variáveis de ambiente, com padrões seguros e limites para não estourar custo. */

export type Config = {
  bucket: string;
  port: number;
  maxAttempts: number;
  leaseMs: number;
  ffmpegTimeoutMs: number;
  crf: number;
  preset: string;
  audioBitrate: string;
  maxBitrate: string;
  deleteOriginalAfterSuccess: boolean;
  /** Vídeos por estabelecimento em 24 h (0 = sem limite). */
  dailyQuota: number;
  /** Dias que originais de vídeos com falha ou cancelados ficam guardados antes da limpeza. */
  retentionDays: number;
  cleanupMaxFiles: number;
  ffmpegPath: string;
  ffprobePath: string;
};

const PRESETS = new Set(["veryfast", "faster", "fast", "medium", "slow"]);

function int(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number) {
  const raw = env[key];
  const n = raw === undefined || raw === "" ? fallback : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${key} deve ser um inteiro entre ${min} e ${max}`);
  return n;
}

function bool(env: NodeJS.ProcessEnv, key: string, fallback: boolean) {
  const raw = env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "sim", "yes"].includes(raw)) return true;
  if (["0", "false", "nao", "não", "no"].includes(raw)) return false;
  throw new Error(`${key} deve ser true ou false`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bucket = env.STORAGE_BUCKET?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) throw new Error("Defina STORAGE_BUCKET com o bucket do Firebase Storage (ex.: projeto.firebasestorage.app)");
  const preset = env.VIDEO_PRESET?.trim() || "medium";
  if (!PRESETS.has(preset)) throw new Error(`VIDEO_PRESET deve ser um de: ${[...PRESETS].join(", ")}`);
  const audioBitrate = env.AUDIO_BITRATE?.trim() || "96k";
  if (!/^\d{2,3}k$/.test(audioBitrate)) throw new Error("AUDIO_BITRATE deve ser como 96k");
  const maxBitrate = env.MAX_VIDEO_BITRATE?.trim() || "4M";
  if (!/^\d{1,2}M$/.test(maxBitrate)) throw new Error("MAX_VIDEO_BITRATE deve ser como 4M");
  return {
    bucket,
    port: int(env, "PORT", 8080, 1, 65535),
    maxAttempts: int(env, "MAX_ATTEMPTS", 3, 1, 5),
    leaseMs: int(env, "LEASE_SECONDS", 900, 120, 3600) * 1000,
    ffmpegTimeoutMs: int(env, "FFMPEG_TIMEOUT_SECONDS", 480, 60, 3300) * 1000,
    crf: int(env, "VIDEO_CRF", 25, 18, 30),
    preset,
    audioBitrate,
    maxBitrate,
    deleteOriginalAfterSuccess: bool(env, "DELETE_ORIGINAL_AFTER_SUCCESS", true),
    dailyQuota: int(env, "DAILY_VIDEO_QUOTA", 30, 0, 10_000),
    retentionDays: int(env, "ORIGINAL_RETENTION_DAYS", 7, 1, 365),
    cleanupMaxFiles: int(env, "CLEANUP_MAX_FILES", 2000, 100, 50_000),
    ffmpegPath: env.FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath: env.FFPROBE_PATH?.trim() || "ffprobe",
  };
}
