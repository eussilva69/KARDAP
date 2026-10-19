"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, LoaderCircle, MapPin, Search, X } from "lucide-react";
import { activateTrial, createInitialTables, ensureRestaurant, reserveMenuSlug, saveRestaurant, searchGooglePlaces, getPlaceDetails, type PlaceResult } from "@/lib/restaurant-db";
import { scheduleImageCleanup, uploadImage, type UploadStage } from "@/lib/storage";
import { IMAGE_ACCEPT, IMAGE_HINT } from "@/lib/image-optimization";
import { getFirebaseAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";
import { friendlyError, isQueued } from "@/lib/async";
import { initial, plural, brl } from "@/lib/format";
import { PLAN_CATALOG, PLAN_ORDER, isSelfServiceTrialPlan, shortPlanName, type PlanId } from "@/lib/billing/plans";
import { KardapLogo } from "@/components/brand/logo";
import { Button, Callout, SelectField, TextField } from "@/components/ui/primitives";

const STEPS = ["Seu plano", "Seu estabelecimento", "Marca", "Avaliações", "Mesas", "Revisão"] as const;
const KINDS = ["Restaurante", "Hamburgueria", "Pizzaria", "Bar", "Cafeteria", "Lanchonete", "Delivery", "Outro"];
/** Planos que dá para testar sozinho no cadastro; o Enterprise é por proposta comercial (/planos). */
const PICKABLE_PLANS = PLAN_ORDER.filter((id) => !PLAN_CATALOG[id].salesOnly);
const DEFAULT_PLAN: PlanId = isSelfServiceTrialPlan("pro") ? "pro" : PICKABLE_PLANS[0];

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
const phoneDigits = (formatted: string) => formatted.replace(/\D/g, "");
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Guarda, para a primeira tela do painel, um aviso sobre algo que não deu certo na conclusão (não bloqueante). */
function queueDashboardNotice(message: string, label?: string, href?: string) {
  try {
    sessionStorage.setItem("kardap-onboarding-notice", JSON.stringify({ message, label, href }));
  } catch {
    /* sem sessionStorage (modo privado): o aviso simplesmente não aparece, sem quebrar o fluxo */
  }
}

/**
 * Configuração inicial: escolha do plano para testar grátis por 30 dias + 5 etapas sobre o estabelecimento,
 * com rascunho guardado neste aparelho (e, a partir da primeira etapa salva, também no documento do restaurante).
 *
 * O teste grátis só é ativado DEPOIS que a etapa final grava `onboarding.completed = true` com sucesso: se a
 * pessoa sair no meio do caminho, ou se a conclusão falhar, nenhum teste é iniciado (docs/PLANOS.md).
 */
export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Restaurante");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [menuSlug, setMenuSlug] = useState("");
  const [logo, setLogo] = useState("");
  const [cover, setCover] = useState("");
  // Versões pequenas geradas no envio (logo 512 px, capa 960 px).
  const [logoSmall, setLogoSmall] = useState("");
  const [coverSmall, setCoverSmall] = useState("");
  const [uploadStage, setUploadStage] = useState<UploadStage>("processing");
  const images = useRef<string[]>([]);
  images.current = [logo, logoSmall, cover, coverSmall];
  const [review, setReview] = useState("");
  const [tableCount, setTableCount] = useState("");
  // Google Places search state
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [placeConfirmed, setPlaceConfirmed] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const searchAbort = useRef<AbortController>();
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [provisionError, setProvisionError] = useState("");
  const [stage, setStage] = useState("");
  const [uploadingKind, setUploadingKind] = useState<"" | "logos" | "capas">("");
  const [uploadPct, setUploadPct] = useState(0);
  const suggestedSlug = slugify(name);
  const slug = menuSlug || suggestedSlug;
  const draftStorageKey = `kardap-onboarding-draft-${typeof window === "undefined" ? "new" : localStorage.getItem("kardap-restaurant-owner") || "new"}`;
  const totalSteps = STEPS.length;

  useEffect(() => {
    document.title = "Configurar restaurante · Kardap";
  }, []);

  useEffect(() => {
    let raw: string | undefined;
    try { raw = localStorage.getItem(draftStorageKey) || undefined; } catch {}
    if (!raw) {
      raw = document.cookie.split("; ").find((item) => item.startsWith(`${draftStorageKey}=`))?.split("=")[1];
      if (raw) raw = decodeURIComponent(raw);
    }
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        setStep(Number(draft.step) || 1);
        if (isSelfServiceTrialPlan(draft.planId)) setPlanId(draft.planId);
        setName(draft.name || "");
        setKind(draft.kind || "Restaurante");
        setPhone(formatPhone(draft.phone || ""));
        setEmail(draft.email || "");
        setMenuSlug(draft.menuSlug || "");
        setLogo(draft.logo || "");
        setCover(draft.cover || "");
        setLogoSmall(draft.logoSmall || "");
        setCoverSmall(draft.coverSmall || "");
        setReview(draft.review || "");
        setTableCount(draft.tableCount || "");
        if (draft.selectedPlace) { setSelectedPlace(draft.selectedPlace); setPlaceConfirmed(true); }
        if (draft.manualMode) setManualMode(true);
      } catch {
        try { localStorage.removeItem(draftStorageKey); } catch {}
        document.cookie = `${draftStorageKey}=; Max-Age=0; Path=/; SameSite=Lax`;
      }
    }
    setDraftReady(true);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftReady) return;
    const draft = JSON.stringify({ step, planId, name, kind, phone, email, menuSlug, logo, cover, logoSmall, coverSmall, review, tableCount, selectedPlace: placeConfirmed ? selectedPlace : null, manualMode });
    try { localStorage.setItem(draftStorageKey, draft); } catch {}
    document.cookie = `${draftStorageKey}=; Max-Age=0; Path=/; SameSite=Lax`;
  }, [draftReady, draftStorageKey, step, planId, name, kind, phone, email, menuSlug, logo, cover, logoSmall, coverSmall, review, tableCount, selectedPlace, placeConfirmed, manualMode]);

  const doPlaceSearch = (q: string) => {
    setPlaceQuery(q);
    setPlaceError("");
    clearTimeout(searchTimer.current);
    searchAbort.current?.abort();
    if (q.trim().length < 3) { setPlaceResults([]); setPlaceSearching(false); return; }
    setPlaceSearching(true);
    searchTimer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      searchAbort.current = ctrl;
      try {
        const results = await searchGooglePlaces(q.trim());
        if (!ctrl.signal.aborted) { setPlaceResults(results); setPlaceSearching(false); }
      } catch (err: any) {
        if (!ctrl.signal.aborted) { setPlaceError(err.message || "Erro na pesquisa."); setPlaceSearching(false); }
      }
    }, 400);
  };

  const confirmPlace = async (place: PlaceResult) => {
    setSelectedPlace(place);
    setFetchingDetails(true);
    setPlaceError("");
    try {
      const details = await getPlaceDetails(place.placeId);
      setReview(details.reviewUrl || "");
      setPlaceConfirmed(true);
    } catch {
      setReview("");
      setPlaceConfirmed(true);
    }
    setFetchingDetails(false);
  };

  const clearPlace = () => {
    setSelectedPlace(null);
    setPlaceConfirmed(false);
    setReview("");
    setPlaceQuery("");
    setPlaceResults([]);
  };

  const provision = () => {
    const user = isFirebaseConfigured ? getFirebaseAuth().currentUser : null;
    if (!user || localStorage.getItem("kardap-restaurant-id")) return;
    setProvisioning(true);
    setProvisionError("");
    ensureRestaurant(user.uid, user.displayName)
      .catch((err) => setProvisionError(friendlyError(err, "Não foi possível preparar seu restaurante.")))
      .finally(() => setProvisioning(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(provision, []);

  const validateStep = () => {
    if (step === 2 && name.trim().length < 2) return "Informe o nome do estabelecimento.";
    if (step === 2 && phone.trim() && phoneDigits(phone).length < 10) return "Informe o telefone completo com DDD (10 ou 11 dígitos).";
    if (step === 2 && email.trim() && !isValidEmail(email.trim())) return "Informe um e-mail válido.";
    if (step === 4 && review.trim()) {
      try {
        if (!/^https?:$/.test(new URL(review.trim()).protocol)) throw new Error();
      } catch {
        return "Cole o link completo, começando com https://, ou pule esta etapa.";
      }
    }
    if (step === 5 && (tableCount.trim() === "" || !Number.isInteger(Number(tableCount)) || Number(tableCount) < 0 || Number(tableCount) > 200))
      return "Informe de 0 a 200 mesas. Use 0 se você só atende por delivery.";
    return "";
  };

  const saveStep = async (nextStep: number, completed = false, skip = false) => {
    const problem = skip ? "" : validateStep();
    if (problem) {
      setFieldError(problem);
      return;
    }
    setFieldError("");
    setSaving(true);
    setError("");
    setStage("Salvando…");
    try {
      const onboardingPayload = { completed: false, currentStep: nextStep, updatedAt: new Date().toISOString(), selectedPlanId: planId };
      const payload = {
        name: name.trim(),
        establishmentType: kind,
        businessPhone: phoneDigits(phone),
        businessEmail: email.trim(),
        brand: { logo, cover, logoSmall, coverSmall },
        setup: { tableCount: Number(tableCount) || 0 },
        onboarding: onboardingPayload,
        ...(review.trim() && !skip ? { settings: { googleReviewUrl: review.trim(), google: true } } : {}),
        ...(placeConfirmed && selectedPlace && !skip ? {
          googleBusiness: {
            placeId: selectedPlace.placeId,
            name: selectedPlace.name,
            address: selectedPlace.address,
            reviewUrl: review.trim(),
            enabled: true,
            source: manualMode ? "manual" : "google_places",
            linkedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        } : {}),
      };
      try {
        await saveRestaurant(payload);
      } catch (err) {
        // Etapas intermediárias ficam na fila local do Firestore; só a conclusão exige servidor.
        if (!(isQueued(err) && !completed)) throw err;
        setError("Internet instável: suas respostas foram guardadas neste aparelho e serão enviadas quando a conexão voltar.");
      }
      if (completed) {
        setStage("Reservando o endereço do cardápio…");
        const reserved = await reserveMenuSlug(menuSlug || name.trim());

        setStage("Finalizando…");
        await saveRestaurant({ slug: reserved, onboarding: { ...onboardingPayload, completed: true, completedAt: new Date().toISOString() } });

        // Ativa o teste grátis ANTES de criar as mesas: assim o plano escolhido já está vigente quando o servidor
        // confere o limite de mesas (o Start, por exemplo, permite só 8).
        setStage("Ativando seu teste grátis…");
        let trialFailed = false;
        try {
          await activateTrial(planId);
        } catch {
          trialFailed = true;
        }

        setStage("Criando as mesas…");
        let tablesFailed = false;
        try {
          await createInitialTables(Number(tableCount) || 0);
        } catch {
          tablesFailed = true;
        }

        localStorage.setItem("kardap-restaurant-slug", reserved);
        try { localStorage.removeItem(draftStorageKey); } catch {}
        document.cookie = `${draftStorageKey}=; Max-Age=0; Path=/; SameSite=Lax`;
        if (tablesFailed && trialFailed) {
          queueDashboardNotice("Seu cardápio foi criado! Não conseguimos criar as mesas iniciais nem ativar o teste grátis agora.", "Ver meu plano", "/dashboard/plano");
        } else if (tablesFailed) {
          queueDashboardNotice("Seu cardápio foi criado! Não conseguimos criar as mesas iniciais agora — crie-as quando quiser.", "Criar mesas", "/dashboard/mesas");
        } else if (trialFailed) {
          queueDashboardNotice(`Seu cardápio foi criado! O teste grátis do ${shortPlanName(planId)} ainda não foi ativado — tente de novo em Meu plano.`, "Ativar teste", "/dashboard/plano");
        }
        onComplete();
        setStage("Abrindo o painel…");
        location.href = "/dashboard";
        return;
      }
      setStep(nextStep);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar agora. Suas respostas continuam aqui; tente de novo."));
    }
    setSaving(false);
    setStage("");
  };

  const uploadImageFor = async (input: HTMLInputElement, target: "logos" | "capas") => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setSaving(true);
    setUploadingKind(target);
    setUploadPct(0);
    setUploadStage("processing");
    setError("");
    const previous = target === "logos" ? [logo, logoSmall] : [cover, coverSmall];
    try {
      const result = await uploadImage({ file, kind: target === "logos" ? "logo" : "cover", onStage: setUploadStage, onProgress: setUploadPct });
      if (target === "logos") {
        setLogo(result.url);
        setLogoSmall(result.smallUrl);
      } else {
        setCover(result.url);
        setCoverSmall(result.smallUrl);
      }
      // Imagem trocada durante a configuração: a anterior sai do Storage se não estiver mais em uso.
      scheduleImageCleanup(previous, () => images.current);
    } catch (uploadError) {
      setError(friendlyError(uploadError, "Não foi possível enviar a imagem. Tente de novo."));
    } finally {
      setSaving(false);
      setUploadingKind("");
    }
  };

  const busy = saving || provisioning;
  const primaryLabel = provisioning
    ? "Preparando seu restaurante…"
    : uploadingKind
      ? uploadStage === "processing"
        ? "Otimizando imagem…"
        : `Enviando imagem… ${uploadPct}%`
      : saving
        ? stage || "Salvando…"
        : step === totalSteps
          ? "Concluir e abrir o painel"
          : "Continuar";

  return (
    <div className="kd-onb">
      <header className="kd-onb-bar">
        <div className="kd-onb-bar-inner">
          <KardapLogo width={104} />
          <p className="kd-onb-count">
            Etapa <b className="kd-num">{step}</b> de {totalSteps} · {STEPS[step - 1]}
          </p>
        </div>
        <div className="kd-onb-progress" role="progressbar" aria-label="Progresso da configuração" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={step}>
          <i style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>
      </header>

      <main className={`kd-onb-main ${step === 1 ? "is-wide" : ""}`}>
        <div key={step} className="kd-onb-step k-enter">
          {step === 1 && (
            <>
              <p className="kd-overline">Bem-vindo ao Kardap</p>
              <h1 className="kd-h1">Qual plano você quer testar?</h1>
              <p className="kd-lead">30 dias grátis, sem cartão de crédito. Dá para mudar de plano quando quiser, no painel.</p>
              <div className="kd-onb-plans" role="radiogroup" aria-label="Escolha o plano para testar grátis">
                {PICKABLE_PLANS.map((id) => {
                  const plan = PLAN_CATALOG[id];
                  const selected = planId === id;
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`kd-onb-plan ${selected ? "is-selected" : ""} ${plan.popular ? "is-popular" : ""}`}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPlanId(id)}
                      data-autofocus={id === DEFAULT_PLAN || undefined}
                    >
                      {plan.popular && <span className="kd-onb-plan-ribbon">Mais popular</span>}
                      <span className="kd-onb-plan-name">{shortPlanName(id)}</span>
                      <span className="kd-onb-plan-price kd-num">
                        <b>{brl(plan.priceInCents || 0)}</b>
                        <small>por mês, após o teste</small>
                      </span>
                      <ul className="kd-onb-plan-features">
                        {plan.highlights.slice(0, 4).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                      <span className="kd-onb-plan-pick">
                        {selected ? (
                          <>
                            <Check size={15} strokeWidth={2.8} aria-hidden /> Selecionado
                          </>
                        ) : (
                          "Testar grátis por 30 dias"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="kd-onb-plan-note">
                Rede com várias unidades ou volume maior de pedidos?{" "}
                <a href="/planos" target="_blank" rel="noopener noreferrer">
                  Veja o Enterprise
                </a>
                , sob consulta.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <p className="kd-overline">{shortPlanName(planId)} · 30 dias grátis</p>
              <h1 className="kd-h1">Como se chama o seu estabelecimento?</h1>
              <p className="kd-lead">O nome aparece no topo do cardápio. O resto você pode completar depois no painel.</p>
              <div className="kd-form">
                <TextField
                  label="Nome do estabelecimento"
                  placeholder="Ex.: Cantina Bella Vista"
                  value={name}
                  error={fieldError}
                  autoComplete="organization"
                  data-autofocus
                  onChange={(e) => {
                    setName(e.target.value);
                    setFieldError("");
                  }}
                />
                <TextField
                  label="Endereço do cardápio"
                  placeholder="cantina-bella-vista"
                  value={slug}
                  onChange={(e) => setMenuSlug(slugify(e.target.value))}
                  hint={
                    <>
                      O cardápio vai abrir em <b>/r/{slug || "seu-estabelecimento"}</b>. Se já estiver em uso, criamos uma variação disponível.
                    </>
                  }
                />
                <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
                  {KINDS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </SelectField>
                <fieldset className="kd-onb-group">
                  <legend>Contato do estabelecimento</legend>
                  <div className="kd-form-grid">
                    <TextField label="WhatsApp" optional type="tel" inputMode="numeric" autoComplete="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
                    <TextField
                      label="E-mail"
                      optional
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="contato@restaurante.com.br"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </fieldset>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="kd-overline">Marca</p>
              <h1 className="kd-h1">Deixe o cardápio com a cara da casa</h1>
              <p className="kd-lead">Logo e foto de capa aparecem no topo do cardápio. Você pode pular e adicionar depois em Personalização.</p>
              <div className="kd-onb-brand">
                <label className={`kd-onb-upload ${uploadingKind ? "is-busy" : ""}`}>
                  <input className="kd-sr" type="file" accept={IMAGE_ACCEPT} onChange={(e) => uploadImageFor(e.currentTarget, "logos")} disabled={busy} />
                  <span className="kd-onb-logo" aria-hidden>
                    {logo ? <img src={logoSmall || logo} alt="" /> : initial(name)}
                  </span>
                  <span className="kd-onb-upload-text" aria-live="polite">
                    <b>{uploadingKind === "logos" ? (uploadStage === "processing" ? "Otimizando…" : `Enviando… ${uploadPct}%`) : logo ? "Trocar logo" : "Adicionar logo"}</b>
                    <small>Quadrada · {IMAGE_HINT}</small>
                  </span>
                </label>
                <label className={`kd-onb-upload kd-onb-upload--cover ${uploadingKind ? "is-busy" : ""}`} style={cover ? { backgroundImage: `url(${coverSmall || cover})` } : undefined}>
                  <input className="kd-sr" type="file" accept={IMAGE_ACCEPT} onChange={(e) => uploadImageFor(e.currentTarget, "capas")} disabled={busy} />
                  <span className="kd-onb-upload-text" aria-live="polite">
                    {uploadingKind === "capas" ? <LoaderCircle size={20} className="k-spin" aria-hidden /> : <ImagePlus size={20} aria-hidden />}
                    <b>{uploadingKind === "capas" ? (uploadStage === "processing" ? "Otimizando…" : `Enviando… ${uploadPct}%`) : cover ? "Trocar foto de capa" : "Adicionar foto de capa"}</b>
                    <small>Horizontal · do salão ou de um prato da casa</small>
                  </span>
                </label>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <p className="kd-overline">Avaliações</p>
              <h1 className="kd-h1">Encontre seu estabelecimento no Google</h1>
              <p className="kd-lead">Busque seu restaurante no Google Maps e facilite o recebimento de avaliações dos seus clientes.</p>

              {!placeConfirmed && !manualMode && (
                <div className="kd-form">
                  <div className="kd-place-search">
                    <label className="kd-field">
                      <span className="kd-field-label">Buscar no Google Maps</span>
                      <span className="kd-place-input-wrap">
                        <Search size={16} className="kd-place-icon" aria-hidden />
                        <input
                          className="kd-input"
                          type="text"
                          placeholder="Digite o nome do seu restaurante..."
                          value={placeQuery}
                          data-autofocus
                          onChange={(e) => doPlaceSearch(e.target.value)}
                          style={{ paddingLeft: 36 }}
                        />
                        {placeSearching && <LoaderCircle size={16} className="k-spin kd-place-spinner" aria-label="Pesquisando…" />}
                      </span>
                    </label>
                    {placeError && <p className="kd-field-error" role="alert">{placeError}</p>}
                    {placeResults.length > 0 && (
                      <ul className="kd-place-results" role="listbox">
                        {placeResults.map((p) => (
                          <li key={p.placeId} role="option" aria-selected={false} className="kd-place-result" onClick={() => confirmPlace(p)}>
                            <MapPin size={18} className="kd-place-result-icon" aria-hidden />
                            <span className="kd-place-result-info">
                              <b>{p.name}</b>
                              <small>{p.address}{p.city && p.state ? ` · ${p.city}, ${p.state}` : ""}</small>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {placeQuery.length >= 3 && !placeSearching && placeResults.length === 0 && !placeError && (
                      <p className="kd-place-empty">Nenhum resultado encontrado. Tente outro nome ou endereço.</p>
                    )}
                  </div>
                  <button type="button" className="kd-link-btn" onClick={() => setManualMode(true)}>
                    Prefiro inserir o link manualmente
                  </button>
                </div>
              )}

              {placeConfirmed && selectedPlace && !manualMode && (
                <div className="kd-form">
                  <div className="kd-place-confirmed">
                    <div className="kd-place-confirmed-head">
                      <MapPin size={20} aria-hidden />
                      <div>
                        <b>{selectedPlace.name}</b>
                        <small>{selectedPlace.address}</small>
                      </div>
                    </div>
                    {review ? (
                      <p className="kd-place-review-ok">
                        <Check size={15} aria-hidden /> Link de avaliação obtido automaticamente
                      </p>
                    ) : (
                      <div className="kd-place-no-review">
                        <p>O Google não retornou um link de avaliação para este estabelecimento.</p>
                        <TextField
                          label="Cole o link de avaliação manualmente"
                          optional
                          type="url"
                          inputMode="url"
                          placeholder="https://g.page/r/…/review"
                          value={review}
                          error={fieldError}
                          hint="No Perfil da Empresa no Google, toque em Pedir avaliações e copie o link."
                          onChange={(e) => { setReview(e.target.value); setFieldError(""); }}
                        />
                      </div>
                    )}
                    <button type="button" className="kd-link-btn" onClick={clearPlace}>
                      Escolher outro estabelecimento
                    </button>
                  </div>
                </div>
              )}

              {fetchingDetails && (
                <div className="kd-place-loading">
                  <LoaderCircle size={20} className="k-spin" aria-hidden />
                  <span>Obtendo link de avaliação…</span>
                </div>
              )}

              {manualMode && (
                <div className="kd-form">
                  <TextField
                    label="Link de avaliação do Google"
                    optional
                    type="url"
                    inputMode="url"
                    placeholder="https://g.page/r/…/review"
                    value={review}
                    error={fieldError}
                    data-autofocus
                    hint="No Perfil da Empresa no Google, toque em Pedir avaliações e copie o link."
                    onChange={(e) => { setReview(e.target.value); setFieldError(""); }}
                  />
                  <button type="button" className="kd-link-btn" onClick={() => { setManualMode(false); setReview(""); }}>
                    Buscar no Google Maps
                  </button>
                </div>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <p className="kd-overline">O salão</p>
              <h1 className="kd-h1">Quantas mesas o salão tem?</h1>
              <p className="kd-lead">Cada mesa ganha um QR Code próprio, e os chamados chegam com o nome da mesa. Dá para ajustar depois.</p>
              <div className="kd-form">
                <TextField
                  label="Quantidade de mesas"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={200}
                  placeholder="Ex.: 12"
                  value={tableCount}
                  error={fieldError}
                  hint="De 0 a 200. Use 0 se você só atende por delivery."
                  onChange={(e) => {
                    setTableCount(e.target.value);
                    setFieldError("");
                  }}
                />
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <p className="kd-overline">Revisão</p>
              <h1 className="kd-h1">Tudo pronto para publicar</h1>
              <p className="kd-lead">Confira o resumo. Ao concluir, reservamos o endereço do cardápio, criamos as mesas com QR Code e ativamos seu teste grátis de 30 dias.</p>
              <dl className="kd-onb-summary">
                <div>
                  <dt>Plano em teste</dt>
                  <dd>
                    {shortPlanName(planId)} · 30 dias grátis · depois {brl(PLAN_CATALOG[planId].priceInCents || 0)}/mês
                  </dd>
                </div>
                <div>
                  <dt>Estabelecimento</dt>
                  <dd>
                    {name.trim() || "Sem nome"} · {kind}
                  </dd>
                </div>
                <div>
                  <dt>Endereço do cardápio</dt>
                  <dd>/r/{slug || "seu-estabelecimento"}</dd>
                </div>
                <div>
                  <dt>Mesas</dt>
                  <dd>{Number(tableCount) > 0 ? plural(Number(tableCount), "mesa com QR Code", "mesas com QR Code") : "Nenhuma (só delivery)"}</dd>
                </div>
                <div>
                  <dt>Marca</dt>
                  <dd>{logo || cover ? [logo && "logo", cover && "foto de capa"].filter(Boolean).join(" e ") + " enviadas" : "Sem logo e capa por enquanto"}</dd>
                </div>
                <div>
                  <dt>Avaliações no Google</dt>
                  <dd>
                    {placeConfirmed && selectedPlace
                      ? `${selectedPlace.name}${review.trim() ? " · link configurado" : " · sem link de avaliação"}`
                      : review.trim()
                        ? "Link configurado (manual)"
                        : "Não configurado"}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>

        <div className="kd-onb-feedback">
          {provisionError && (
            <Callout
              tone="danger"
              role="alert"
              title="Não foi possível preparar seu restaurante"
              action={
                <Button size="sm" variant="secondary" onClick={provision}>
                  Tentar de novo
                </Button>
              }
            >
              {provisionError}
            </Callout>
          )}
          {error && (
            <Callout tone={error.startsWith("Internet instável") ? "warn" : "danger"} role="alert">
              {error}
            </Callout>
          )}
        </div>

        <div className="kd-onb-actions">
          {step > 1 ? (
            <Button variant="ghost" icon={<ArrowLeft size={16} aria-hidden />} onClick={() => setStep((current) => current - 1)} disabled={saving}>
              Voltar
            </Button>
          ) : (
            <span />
          )}
          <div className="kd-onb-actions-main">
            {(step === 3 || step === 4) && (
              <Button variant="link" onClick={() => saveStep(step + 1, false, true)} disabled={busy}>
                Pular por agora
              </Button>
            )}
            <Button
              size="lg"
              onClick={() => saveStep(Math.min(totalSteps, step + 1), step === totalSteps)}
              loading={busy}
              disabled={Boolean(provisionError)}
              iconEnd={step === totalSteps ? <Check size={18} aria-hidden /> : <ArrowRight size={18} aria-hidden />}
            >
              {primaryLabel}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
