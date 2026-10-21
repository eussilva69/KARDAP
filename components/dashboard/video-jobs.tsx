"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, LoaderCircle, Pause, Play, RotateCw, WifiOff, X } from "lucide-react";
import { IconButton } from "@/components/ui/primitives";
import {
  VIDEO_ERROR_MESSAGES,
  cancelUpload,
  dismissUpload,
  isActive,
  pauseUpload,
  resumeUpload,
  retryProcessing,
  retryUpload,
  useVideoUploads,
  watchVideoJobs,
  type ProductVideoDoc,
  type UploadItem,
} from "@/lib/video-upload";
import type { Notify } from "./types";

type JobDoc = ProductVideoDoc & { id: string };

// Uma assinatura do Firestore para o painel inteiro, ligada enquanto houver quem acompanhe.
let jobs: JobDoc[] = [];
let jobsError = "";
const jobListeners = new Set<() => void>();
let stopJobs: (() => void) | null = null;
function subscribeJobs(listener: () => void) {
  jobListeners.add(listener);
  if (!stopJobs) {
    try {
      stopJobs = watchVideoJobs(
        (next) => {
          jobs = next;
          jobsError = "";
          jobListeners.forEach((l) => l());
        },
        (error) => {
          jobsError = error.message;
          jobListeners.forEach((l) => l());
        },
      );
    } catch {
      // Firebase não configurado: o painel segue sem status de vídeo.
    }
  }
  return () => {
    jobListeners.delete(listener);
    if (!jobListeners.size && stopJobs) {
      stopJobs();
      stopJobs = null;
    }
  };
}
const NO_JOBS: JobDoc[] = [];

export type JobPhase = "preparing" | "uploading" | "paused" | "offline" | "processing" | "retrying" | "ready" | "failed" | "interrupted";

export type JobView = {
  videoId: string;
  productId: string;
  phase: JobPhase;
  /** Progresso real do envio (bytes enviados / total). Só existe durante o envio nesta aba. */
  percent?: number;
  bytes?: number;
  total?: number;
  message?: string;
  reductionPercent?: number;
  local?: UploadItem;
  doc?: JobDoc;
  at: number;
  /** Pode tentar de novo: reenviando o arquivo (local) ou reprocessando o original (servidor). */
  retry?: "upload" | "processing";
};

const millis = (value: unknown) => (value && typeof (value as { toMillis?: () => number }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : Date.now());
const RECENT = 10 * 60_000;
const INTERRUPTED_AFTER = 30 * 60_000;
const RETRYABLE = new Set(["processing_failed", "validation_failed", "stale"]);

function viewFor(local: UploadItem | undefined, doc: JobDoc | undefined): JobView | null {
  const base = { videoId: (local?.videoId ?? doc?.id)!, productId: (local?.productId ?? doc?.productId)!, local, doc, at: local?.startedAt ?? millis(doc?.createdAt) };
  if (local?.phase === "canceled" || doc?.status === "canceled") return null;
  if (local && isActive(local.phase)) {
    return { ...base, phase: local.phase as JobPhase, bytes: local.bytes, total: local.total, percent: local.total ? Math.floor((local.bytes / local.total) * 100) : 0 };
  }
  if (local?.phase === "error") return { ...base, phase: "failed", message: local.error, retry: "upload" };
  const status = doc?.status;
  if (status === "ready") return { ...base, phase: "ready", reductionPercent: doc!.reductionPercent, at: millis(doc!.processedAt ?? doc!.updatedAt) };
  if (status === "failed") {
    const code = doc!.error;
    return { ...base, phase: "failed", message: code ? VIDEO_ERROR_MESSAGES[code] : VIDEO_ERROR_MESSAGES.processing_failed, retry: code && RETRYABLE.has(code) ? "processing" : local ? "upload" : undefined };
  }
  if (status === "processing" || status === "retrying") return { ...base, phase: status };
  // Arquivo enviado e aguardando o worker.
  if (local?.phase === "uploaded" || doc?.uploadCompletedAt) return { ...base, phase: "processing" };
  if (doc && Date.now() - millis(doc.createdAt) > INTERRUPTED_AFTER) return { ...base, phase: "interrupted", message: "O envio foi interrompido. Envie o vídeo de novo." };
  return doc ? { ...base, phase: "uploading" } : null;
}

/** Status de vídeo por produto, juntando o envio desta aba com o Firestore (atualiza sozinho). */
export function useVideoJobs() {
  const uploads = useVideoUploads();
  const docs = useSyncExternalStore(subscribeJobs, () => jobs, () => NO_JOBS);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    const views: JobView[] = [];
    const seen = new Set<string>();
    for (const local of uploads) {
      seen.add(local.videoId);
      const view = viewFor(local, docs.find((d) => d.id === local.videoId));
      if (view) views.push(view);
    }
    for (const doc of docs) {
      if (seen.has(doc.id)) continue;
      const view = viewFor(undefined, doc);
      if (view) views.push(view);
    }
    views.sort((a, b) => b.at - a.at);
    const byProduct = new Map<string, JobView>();
    for (const v of views) {
      if (byProduct.has(v.productId)) continue;
      if (v.phase === "ready" && Date.now() - v.at > RECENT) continue;
      byProduct.set(v.productId, v);
    }
    return { views, byProduct, error: jobsError };
  }, [uploads, docs]);
}

const mb = (bytes = 0) => (bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: bytes > 10 * 1048576 ? 0 : 1 });

export function jobLabel(job: JobView) {
  switch (job.phase) {
    case "preparing":
      return "Preparando o envio…";
    case "uploading":
      return job.total ? `Enviando · ${job.percent}% (${mb(job.bytes)} de ${mb(job.total)} MB)` : "Enviando em outra aba ou aparelho…";
    case "paused":
      return `Envio pausado em ${job.percent}%`;
    case "offline":
      return `Sem conexão · continua sozinho quando a internet voltar (${job.percent}%)`;
    case "processing":
      return "Otimizando o vídeo para o cardápio…";
    case "retrying":
      return "Otimização falhou; nova tentativa automática em instantes…";
    case "ready": {
      const published = job.reductionPercent && job.reductionPercent > 0 ? `Publicado no cardápio · arquivo ${job.reductionPercent.toLocaleString("pt-BR")}% menor` : "Publicado no cardápio";
      // Versões extras (VIDEO_VARIANTS no worker): o cardápio escolhe a que cabe na conexão de cada cliente.
      const variants = job.doc?.variants?.map((v) => v.kind).join(", ");
      return variants ? `${published} · também em ${variants}` : published;
    }
    case "failed":
    case "interrupted":
      return job.message || "Não foi possível publicar o vídeo.";
  }
}

const ICONS: Partial<Record<JobPhase, React.ReactNode>> = {
  ready: <CheckCircle2 size={14} aria-hidden />,
  failed: <AlertTriangle size={14} aria-hidden />,
  interrupted: <AlertTriangle size={14} aria-hidden />,
  offline: <WifiOff size={14} aria-hidden />,
  processing: <LoaderCircle size={14} className="k-spin" aria-hidden />,
  retrying: <LoaderCircle size={14} className="k-spin" aria-hidden />,
  preparing: <LoaderCircle size={14} className="k-spin" aria-hidden />,
};

const tone = (p: JobPhase) => (p === "ready" ? "is-ok" : p === "failed" || p === "interrupted" ? "is-bad" : p === "offline" || p === "paused" ? "is-wait" : "is-busy");

/** Etiqueta curta na lista de produtos. */
export function VideoJobChip({ job }: { job?: JobView }) {
  if (!job) return null;
  const short: Record<JobPhase, string> = {
    preparing: "preparando vídeo",
    uploading: job.total ? `enviando vídeo ${job.percent}%` : "enviando vídeo",
    paused: `vídeo pausado ${job.percent}%`,
    offline: "vídeo aguardando conexão",
    processing: "otimizando vídeo",
    retrying: "otimizando vídeo",
    ready: "vídeo publicado",
    failed: "vídeo com falha",
    interrupted: "envio interrompido",
  };
  return (
    <span className={`kd-vchip ${tone(job.phase)}`}>
      {ICONS[job.phase]}
      {short[job.phase]}
    </span>
  );
}

/** Linha de status dentro do formulário do produto. */
export function VideoJobInline({ job }: { job?: JobView }) {
  if (!job || job.phase === "ready") return null;
  return (
    <p className={`kd-vinline ${tone(job.phase)}`} role="status">
      {ICONS[job.phase]}
      <span>{jobLabel(job)}</span>
    </p>
  );
}

function JobActions({ job, notify }: { job: JobView; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const local = job.local;
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) notify(ok);
    } catch (error) {
      notify((error as Error).message || "Não foi possível concluir. Tente de novo.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="kd-vjob-actions">
      {local && (job.phase === "uploading" || job.phase === "offline") && (
        <IconButton label="Pausar envio" onClick={() => pauseUpload(job.videoId)}>
          <Pause size={15} />
        </IconButton>
      )}
      {local && job.phase === "paused" && (
        <IconButton label="Continuar envio" onClick={() => resumeUpload(job.videoId)}>
          <Play size={15} />
        </IconButton>
      )}
      {job.retry === "upload" && local && (
        <IconButton label="Enviar de novo" disabled={busy} onClick={() => run(() => retryUpload(job.videoId), "Enviando o vídeo de novo")}>
          <RotateCw size={15} />
        </IconButton>
      )}
      {job.retry === "processing" && (
        <IconButton label="Otimizar de novo" disabled={busy} onClick={() => run(() => retryProcessing(job.videoId), "Pedido enviado. O vídeo será otimizado de novo.")}>
          <RotateCw size={15} />
        </IconButton>
      )}
      {local && isActive(local.phase) ? (
        <IconButton label="Cancelar envio" tone="danger" onClick={() => cancelUpload(job.videoId)}>
          <X size={15} />
        </IconButton>
      ) : (
        (job.phase === "ready" || job.phase === "failed" || job.phase === "interrupted") && (
          <IconButton label="Dispensar aviso" onClick={() => dismiss(job.videoId)}>
            <X size={15} />
          </IconButton>
        )
      )}
    </span>
  );
}

// Avisos dispensados nesta sessão (não altera nada no servidor).
const DISMISSED_KEY = "kardap-video-dismissed";
let dismissed = new Set<string>();
try {
  if (typeof window !== "undefined") dismissed = new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || "[]"));
} catch {
  /* sessão sem armazenamento: avisos voltam ao recarregar */
}
const dismissListeners = new Set<() => void>();
function dismiss(videoId: string) {
  dismissed = new Set(dismissed).add(videoId);
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(dismissed)));
  } catch {
    /* ignore */
  }
  dismissUpload(videoId);
  dismissListeners.forEach((l) => l());
}
const subscribeDismissed = (l: () => void) => {
  dismissListeners.add(l);
  return () => dismissListeners.delete(l);
};

/**
 * Bandeja de envios: aparece enquanto há vídeo enviando, otimizando ou com resultado recente.
 * Fica fora das páginas, então o envio continua visível enquanto a pessoa usa o painel.
 */
export function VideoUploadsTray({ products, notify }: { products: { id?: string; name?: string }[]; notify: Notify }) {
  const { views } = useVideoJobs();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Direto no <body>: nenhum ancestral com transform muda a referência do position: fixed.
  return mounted ? createPortal(<VideoTrayView views={views} products={products} notify={notify} />, document.body) : null;
}

/** Parte visual da bandeja: recebe os status já combinados. */
export function VideoTrayView({ views, products, notify }: { views: JobView[]; products: { id?: string; name?: string }[]; notify: Notify }) {
  const hidden = useSyncExternalStore(subscribeDismissed, () => dismissed, () => dismissed);
  const [open, setOpen] = useState(true);
  const visible = views.filter((v) => !hidden.has(v.videoId) && (v.phase !== "ready" || Date.now() - v.at < RECENT) && (v.phase !== "failed" || Date.now() - v.at < 24 * 3600_000));
  if (!visible.length) return null;
  const busy = visible.filter((v) => !["ready", "failed", "interrupted"].includes(v.phase)).length;
  const name = (v: JobView) => v.local?.productName || products.find((p) => p.id === v.productId)?.name || "Produto";
  const summary = busy ? `${busy} ${busy === 1 ? "vídeo em andamento" : "vídeos em andamento"}` : "Vídeos";

  return (
    <section className={`kd-vtray ${open ? "is-open" : ""}`} aria-label="Envios de vídeo">
      <button type="button" className="kd-vtray-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <b>{summary}</b>
        <ChevronDown size={16} aria-hidden />
      </button>
      <p className="kd-sr" aria-live="polite">
        {visible.map((v) => `${name(v)}: ${v.phase === "uploading" ? "enviando" : jobLabel(v)}`).join(". ")}
      </p>
      {open && (
        <ul className="kd-vtray-list">
          {visible.map((v) => (
            <li key={v.videoId} className={`kd-vjob ${tone(v.phase)}`}>
              <span className="kd-vjob-main">
                <b>{name(v)}</b>
                <small>
                  {ICONS[v.phase]}
                  {jobLabel(v)}
                </small>
                {v.percent !== undefined && (v.phase === "uploading" || v.phase === "paused" || v.phase === "offline") && (
                  <span className="kd-upload-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.percent} aria-label={`Envio do vídeo de ${name(v)}`}>
                    <i style={{ width: `${v.percent}%` }} />
                  </span>
                )}
              </span>
              <JobActions job={v} notify={notify} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
