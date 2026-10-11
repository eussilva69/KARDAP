"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, LoaderCircle } from "lucide-react";
import { createInitialTables, ensureRestaurant, reserveMenuSlug, saveRestaurant } from "@/lib/restaurant-db";
import { uploadRestaurantImage } from "@/lib/storage";
import { getFirebaseAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";
import { friendlyError, isQueued } from "@/lib/async";
import { initial, plural } from "@/lib/format";
import { KardapLogo } from "@/components/brand/logo";
import { Button, Callout, SelectField, TextField } from "@/components/ui/primitives";

const STEPS = ["Seu estabelecimento", "Marca", "Avaliações", "Mesas", "Revisão"] as const;
const KINDS = ["Restaurante", "Hamburgueria", "Pizzaria", "Bar", "Cafeteria", "Lanchonete", "Delivery", "Outro"];

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);

/** Configuração inicial do restaurante: 5 etapas curtas, com rascunho guardado neste aparelho. */
export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Restaurante");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [menuSlug, setMenuSlug] = useState("");
  const [logo, setLogo] = useState("");
  const [cover, setCover] = useState("");
  const [review, setReview] = useState("");
  const [tableCount, setTableCount] = useState("");
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
  const draftCookieName = `kardap-onboarding-draft-${typeof window === "undefined" ? "new" : localStorage.getItem("kardap-restaurant-owner") || "new"}`;

  useEffect(() => {
    document.title = "Configurar restaurante · Kardap";
  }, []);

  useEffect(() => {
    const value = document.cookie.split("; ").find((item) => item.startsWith(`${draftCookieName}=`))?.split("=")[1];
    if (value) {
      try {
        const draft = JSON.parse(decodeURIComponent(value));
        setStep(Number(draft.step) || 1);
        setName(draft.name || "");
        setKind(draft.kind || "Restaurante");
        setPhone(draft.phone || "");
        setEmail(draft.email || "");
        setMenuSlug(draft.menuSlug || "");
        setLogo(draft.logo || "");
        setCover(draft.cover || "");
        setReview(draft.review || "");
        setTableCount(draft.tableCount || "");
      } catch {
        document.cookie = `${draftCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
      }
    }
    setDraftReady(true);
  }, [draftCookieName]);

  useEffect(() => {
    if (!draftReady) return;
    const draft = encodeURIComponent(JSON.stringify({ step, name, kind, phone, email, menuSlug, logo, cover, review, tableCount }));
    document.cookie = `${draftCookieName}=${draft}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax`;
  }, [draftReady, draftCookieName, step, name, kind, phone, email, menuSlug, logo, cover, review, tableCount]);

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
    if (step === 1 && name.trim().length < 2) return "Informe o nome do estabelecimento.";
    if (step === 3 && review.trim()) {
      try {
        if (!/^https?:$/.test(new URL(review.trim()).protocol)) throw new Error();
      } catch {
        return "Cole o link completo, começando com https://, ou pule esta etapa.";
      }
    }
    if (step === 4 && (tableCount.trim() === "" || !Number.isInteger(Number(tableCount)) || Number(tableCount) < 0 || Number(tableCount) > 200))
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
      const payload = {
        name: name.trim(),
        establishmentType: kind,
        businessPhone: phone,
        businessEmail: email,
        brand: { logo, cover },
        setup: { tableCount: Number(tableCount) || 0 },
        onboarding: { completed: false, currentStep: nextStep, updatedAt: new Date().toISOString() },
        ...(review.trim() && !skip ? { settings: { googleReviewUrl: review.trim() } } : {}),
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
        setStage("Criando as mesas…");
        await createInitialTables(Number(tableCount) || 0);
        setStage("Finalizando…");
        await saveRestaurant({ slug: reserved, onboarding: { ...payload.onboarding, completed: true, completedAt: new Date().toISOString() } });
        localStorage.setItem("kardap-restaurant-slug", reserved);
        document.cookie = `${draftCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
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

  const uploadImage = async (input: HTMLInputElement, target: "logos" | "capas") => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setSaving(true);
    setUploadingKind(target);
    setUploadPct(0);
    setError("");
    try {
      const url = await uploadRestaurantImage(file, target, setUploadPct);
      if (target === "logos") setLogo(url);
      else setCover(url);
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
      ? `Enviando imagem… ${uploadPct}%`
      : saving
        ? stage || "Salvando…"
        : step === 5
          ? "Concluir e abrir o painel"
          : "Continuar";

  return (
    <div className="kd-onb">
      <header className="kd-onb-bar">
        <div className="kd-onb-bar-inner">
          <KardapLogo width={104} />
          <p className="kd-onb-count">
            Etapa <b className="kd-num">{step}</b> de 5 · {STEPS[step - 1]}
          </p>
        </div>
        <div className="kd-onb-progress" role="progressbar" aria-label="Progresso da configuração" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step}>
          <i style={{ width: `${step * 20}%` }} />
        </div>
      </header>

      <main className="kd-onb-main">
        <div key={step} className="kd-onb-step k-enter">
          {step === 1 && (
            <>
              <p className="kd-overline">Bem-vindo ao Kardap</p>
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
                    <TextField label="WhatsApp" optional type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
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

          {step === 2 && (
            <>
              <p className="kd-overline">Marca</p>
              <h1 className="kd-h1">Deixe o cardápio com a cara da casa</h1>
              <p className="kd-lead">Logo e foto de capa aparecem no topo do cardápio. Você pode pular e adicionar depois em Personalização.</p>
              <div className="kd-onb-brand">
                <label className={`kd-onb-upload ${uploadingKind ? "is-busy" : ""}`}>
                  <input className="kd-sr" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadImage(e.currentTarget, "logos")} disabled={busy} />
                  <span className="kd-onb-logo" aria-hidden>
                    {logo ? <img src={logo} alt="" /> : initial(name)}
                  </span>
                  <span className="kd-onb-upload-text" aria-live="polite">
                    <b>{uploadingKind === "logos" ? `Enviando… ${uploadPct}%` : logo ? "Trocar logo" : "Adicionar logo"}</b>
                    <small>Quadrada · PNG, JPG ou WebP até 10 MB</small>
                  </span>
                </label>
                <label className={`kd-onb-upload kd-onb-upload--cover ${uploadingKind ? "is-busy" : ""}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
                  <input className="kd-sr" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadImage(e.currentTarget, "capas")} disabled={busy} />
                  <span className="kd-onb-upload-text" aria-live="polite">
                    {uploadingKind === "capas" ? <LoaderCircle size={20} className="k-spin" aria-hidden /> : <ImagePlus size={20} aria-hidden />}
                    <b>{uploadingKind === "capas" ? `Enviando… ${uploadPct}%` : cover ? "Trocar foto de capa" : "Adicionar foto de capa"}</b>
                    <small>Horizontal · do salão ou de um prato da casa</small>
                  </span>
                </label>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="kd-overline">Avaliações</p>
              <h1 className="kd-h1">Quer receber avaliações no Google?</h1>
              <p className="kd-lead">Com o link, o cardápio mostra um botão para o cliente avaliar o restaurante depois do atendimento.</p>
              <div className="kd-form">
                <TextField
                  label="Link de avaliação do Google"
                  optional
                  type="url"
                  inputMode="url"
                  placeholder="https://g.page/r/…/review"
                  value={review}
                  error={fieldError}
                  hint={
                    <>
                      No Perfil da Empresa no Google, toque em <b>Pedir avaliações</b> e copie o link.
                    </>
                  }
                  onChange={(e) => {
                    setReview(e.target.value);
                    setFieldError("");
                  }}
                />
              </div>
            </>
          )}

          {step === 4 && (
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

          {step === 5 && (
            <>
              <p className="kd-overline">Revisão</p>
              <h1 className="kd-h1">Tudo pronto para publicar</h1>
              <p className="kd-lead">Confira o resumo. Ao concluir, reservamos o endereço do cardápio e criamos as mesas com QR Code.</p>
              <dl className="kd-onb-summary">
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
                  <dd>{review.trim() ? "Link configurado" : "Não configurado"}</dd>
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
            {(step === 2 || step === 3) && (
              <Button variant="link" onClick={() => saveStep(step + 1, false, true)} disabled={busy}>
                Pular por agora
              </Button>
            )}
            <Button
              size="lg"
              onClick={() => saveStep(Math.min(5, step + 1), step === 5)}
              loading={busy}
              disabled={Boolean(provisionError)}
              iconEnd={step === 5 ? <Check size={18} aria-hidden /> : <ArrowRight size={18} aria-hidden />}
            >
              {primaryLabel}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
