"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { AlertCircle, ArrowLeft, Eye, EyeOff, MailCheck, X } from "lucide-react";
import { getFirebaseAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";
import { ensureRestaurant, findRestaurantByOwner } from "@/lib/restaurant-db";
import { friendlyError, withTimeout } from "@/lib/async";
import { KardapLogo } from "@/components/brand/logo";
import { Button, TextField } from "@/components/ui/primitives";

type Mode = "login" | "register" | "reset";
const isAuthRoute = () => typeof window !== "undefined" && ["/login", "/criar-conta"].includes(window.location.pathname);
type Errors = Partial<Record<"name" | "email" | "password" | "terms", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOT_CONFIGURED = "O login ainda não foi configurado neste ambiente.";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.92 0 12s.45 3.85 1.24 5.42l4.04-3.15Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" />
    </svg>
  );
}

/** Coluna da marca: só aparece em telas largas. Conta o fluxo real do produto em três passos. */
function BrandPanel() {
  return (
    <aside className="kd-auth-brand" aria-label="Sobre o Kardap">
      <KardapLogo width={168} className="kd-auth-brand-logo" />
      <div className="kd-auth-brand-copy">
        <p className="kd-overline">Kardap para restaurantes</p>
        <p className="kd-auth-headline">
          O cliente escaneia a mesa. <span>Você recebe o chamado.</span>
        </p>
        <ol className="kd-auth-steps">
          <li>
            <b>Monte o cardápio</b>
            <span>Pratos com foto, vídeo curto e preço, organizados por seção.</span>
          </li>
          <li>
            <b>Imprima o QR de cada mesa</b>
            <span>Cada código identifica a mesa de onde vem o chamado.</span>
          </li>
          <li>
            <b>Atenda pelo painel</b>
            <span>Pedidos de garçom e de conta chegam na hora, no computador ou no celular.</span>
          </li>
        </ol>
      </div>
      <p className="kd-auth-brand-foot">Para restaurantes, bares, cafés e lanchonetes.</p>
    </aside>
  );
}

export default function AuthPage({ register, onLogin }: { register: boolean; onLogin: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(register ? "register" : "login");
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [stage, setStage] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = Boolean(stage) || googleLoading;

  // O modo acompanha a rota (/login ou /criar-conta), exceto quando o usuário abriu a recuperação.
  const routeMode: Mode = register ? "register" : "login";
  useEffect(() => {
    setMode((current) => (current === "reset" ? current : routeMode));
    setErrors({});
    setFormError("");
  }, [routeMode]);

  const showError = (message: string) => {
    setFormError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  /**
   * Depois de entrar: quem já tem restaurante vai para o painel; quem ainda não tem vai para a configuração inicial.
   * O restaurante é localizado antes de marcar a sessão, para o painel já abrir com os dados certos num aparelho novo.
   */
  const goAfterLogin = async () => {
    let found: Awaited<ReturnType<typeof findRestaurantByOwner>> = null;
    const knownId = localStorage.getItem("kardap-restaurant-id");
    if (!knownId || knownId === "unassigned") {
      try {
        const user = getFirebaseAuth().currentUser;
        if (user) found = await findRestaurantByOwner(user.uid);
      } catch {
        // Sem conexão: a configuração inicial tenta localizar ou criar o restaurante de novo.
      }
    }
    onLogin();
    // Login feito dentro de uma área protegida (painel, administração): fica na mesma página.
    if (!isAuthRoute()) return;
    const restaurantId = localStorage.getItem("kardap-restaurant-id");
    if (!restaurantId || restaurantId === "unassigned" || (found && !found.onboardingCompleted)) {
      window.location.href = "/onboarding";
      return;
    }
    router.replace("/dashboard");
  };

  const validate = () => {
    const next: Errors = {};
    if (isRegister && name.trim().length < 2) next.name = "Informe seu nome.";
    if (!email.trim()) next.email = "Informe seu e-mail.";
    else if (!EMAIL.test(email.trim())) next.email = "Confira o e-mail: falta o @ ou o domínio (ex.: nome@gmail.com).";
    if (!password) next.password = "Informe sua senha.";
    else if (isRegister && password.length < 8) next.password = "Use pelo menos 8 caracteres.";
    if (isRegister && !terms) next.terms = "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.";
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) document.getElementById(`auth-${first}`)?.focus();
    return !first;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!validate()) return;
    if (!isFirebaseConfigured) return showError(NOT_CONFIGURED);
    setStage(isRegister ? "Criando sua conta…" : "Entrando…");
    try {
      const auth = getFirebaseAuth();
      await setPersistence(auth, remember || isRegister ? browserLocalPersistence : browserSessionPersistence);
      if (isRegister) {
        localStorage.removeItem("kardap-restaurant-id");
        localStorage.removeItem("kardap-restaurant-owner");
      }
      const credential = await withTimeout(
        isRegister ? createUserWithEmailAndPassword(auth, email.trim(), password) : signInWithEmailAndPassword(auth, email.trim(), password),
        20000,
      );
      if (isRegister) {
        const fullName = name.trim();
        setStage("Preparando seu restaurante…");
        await updateProfile(credential.user, { displayName: fullName }).catch(() => undefined);
        const token = await credential.user.getIdToken();
        // A conta já existe no Auth. Se o provisionamento falhar aqui, a configuração inicial tenta de novo.
        try {
          const controller = new AbortController();
          const abort = setTimeout(() => controller.abort(), 15000);
          const response = await fetch("/api/restaurants", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: `Restaurante de ${fullName}` }),
            signal: controller.signal,
          }).finally(() => clearTimeout(abort));
          if (response.ok) {
            const { restaurantId } = await response.json();
            localStorage.setItem("kardap-restaurant-id", restaurantId);
            localStorage.setItem("kardap-restaurant-owner", credential.user.uid);
          } else {
            await ensureRestaurant(credential.user.uid, fullName);
          }
        } catch {
          await ensureRestaurant(credential.user.uid, fullName).catch(() => undefined);
        }
        onLogin();
        window.location.href = "/onboarding";
        return;
      }
      setStage("Abrindo seu painel…");
      goAfterLogin();
    } catch (error) {
      setStage("");
      showError(friendlyError(error, "Não foi possível concluir o acesso. Tente de novo."));
    }
  };

  const signInWithGoogle = async () => {
    setFormError("");
    if (isRegister && !terms) {
      setErrors({ terms: "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade." });
      document.getElementById("auth-terms")?.focus();
      return;
    }
    if (!isFirebaseConfigured) return showError(NOT_CONFIGURED);
    setGoogleLoading(true);
    try {
      // Sem await antes do popup: o Safari bloqueia janelas abertas depois de uma espera.
      // A persistência já foi aplicada quando "Manter conectado" mudou.
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      setStage("Abrindo seu painel…");
      goAfterLogin();
    } catch (error) {
      showError(friendlyError(error, "Não foi possível entrar com o Google. Tente de novo."));
    } finally {
      setGoogleLoading(false);
    }
  };

  const sendReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!EMAIL.test(email.trim())) {
      setErrors({ email: "Informe o e-mail da sua conta." });
      document.getElementById("auth-email")?.focus();
      return;
    }
    if (!isFirebaseConfigured) return showError(NOT_CONFIGURED);
    setStage("Enviando link…");
    try {
      await withTimeout(sendPasswordResetEmail(getFirebaseAuth(), email.trim()), 15000);
      setResetSent(email.trim());
    } catch (error) {
      showError(friendlyError(error, "Não foi possível enviar o e-mail agora. Tente de novo."));
    } finally {
      setStage("");
    }
  };

  const openReset = () => {
    setErrors({});
    setFormError("");
    setResetSent("");
    setMode("reset");
  };
  const closeReset = () => {
    setErrors({});
    setFormError("");
    setMode("login");
  };

  const errorBox = formError && (
    <div className="kd-auth-alert" role="alert" tabIndex={-1} ref={errorRef}>
      <AlertCircle size={18} aria-hidden />
      <p>{formError}</p>
      <button type="button" onClick={() => setFormError("")} aria-label="Fechar aviso">
        <X size={16} />
      </button>
    </div>
  );

  return (
    <div className="kd-auth">
      <BrandPanel />
      <main className="kd-auth-main">
        <header className="kd-auth-top">
          <a href="/" className="kd-auth-top-logo" aria-label="Kardap, página inicial">
            <KardapLogo width={112} alt="" />
          </a>
          <a href="/" className="kd-auth-back">
            <ArrowLeft size={16} aria-hidden />
            Voltar ao site
          </a>
        </header>

        <div className="kd-auth-card k-enter">
          {mode === "reset" ? (
            <>
              <h1 className="kd-h1">Recuperar acesso</h1>
              <p className="kd-auth-sub">Informe o e-mail da conta. Enviamos um link para você criar uma nova senha.</p>
              {resetSent ? (
                <div className="kd-auth-sent" role="status">
                  <MailCheck size={22} aria-hidden />
                  <p>
                    Se houver uma conta com <b>{resetSent}</b>, o link chega em alguns minutos. Confira também a caixa de spam.
                  </p>
                </div>
              ) : (
                <form className="kd-auth-form" onSubmit={sendReset} noValidate>
                  {errorBox}
                  <TextField
                    id="auth-email"
                    label="E-mail"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="voce@restaurante.com.br"
                    value={email}
                    error={errors.email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrors({});
                    }}
                  />
                  <Button type="submit" size="lg" block loading={Boolean(stage)}>
                    {stage || "Enviar link de recuperação"}
                  </Button>
                </form>
              )}
              <Button variant="link" className="kd-auth-backlink" onClick={closeReset} icon={<ArrowLeft size={15} aria-hidden />}>
                Voltar para o login
              </Button>
            </>
          ) : (
            <>
              <nav className="kd-auth-switch" aria-label="Acesso">
                <Link href="/login" aria-current={!isRegister ? "page" : undefined} className={!isRegister ? "is-active" : ""}>
                  Entrar
                </Link>
                <Link href="/criar-conta" aria-current={isRegister ? "page" : undefined} className={isRegister ? "is-active" : ""}>
                  Criar conta
                </Link>
              </nav>

              <h1 className="kd-h1">{isRegister ? "Criar sua conta" : "Entrar no painel"}</h1>
              <p className="kd-auth-sub">
                {isRegister
                  ? "15 dias para testar, sem cartão de crédito. Logo depois você configura o restaurante."
                  : "Mesas, chamados e cardápio do seu restaurante em um só lugar."}
              </p>

              {errorBox}

              <Button variant="secondary" size="lg" block onClick={signInWithGoogle} loading={googleLoading} disabled={busy} icon={<GoogleMark />}>
                {googleLoading ? "Conectando com o Google…" : isRegister ? "Criar conta com Google" : "Entrar com Google"}
              </Button>

              <p className="kd-auth-divider">
                <span>ou com e-mail</span>
              </p>

              <form className="kd-auth-form" onSubmit={submit} noValidate aria-busy={busy || undefined}>
                <fieldset className="kd-auth-fieldset" disabled={busy}>
                  {isRegister && (
                    <TextField
                      id="auth-name"
                      label="Seu nome"
                      autoComplete="name"
                      placeholder="Ex.: Carla Souza"
                      value={name}
                      error={errors.name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setErrors((c) => ({ ...c, name: undefined }));
                      }}
                    />
                  )}
                  <TextField
                    id="auth-email"
                    label="E-mail"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="voce@restaurante.com.br"
                    value={email}
                    error={errors.email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrors((c) => ({ ...c, email: undefined }));
                    }}
                  />
                  <TextField
                    id="auth-password"
                    label="Senha"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    placeholder={isRegister ? "Mínimo de 8 caracteres" : "Sua senha"}
                    value={password}
                    error={errors.password}
                    hint={isRegister ? "Use pelo menos 8 caracteres. Toque no olho para conferir o que digitou." : undefined}
                    labelAside={
                      !isRegister && (
                        <button type="button" className="kd-auth-forgot" onClick={openReset}>
                          Esqueceu a senha?
                        </button>
                      )
                    }
                    trailing={
                      <button
                        type="button"
                        className="kd-icon-btn"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        aria-pressed={showPassword}
                        aria-controls="auth-password"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    }
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrors((c) => ({ ...c, password: undefined }));
                    }}
                  />

                  {isRegister ? (
                    <div className="kd-field">
                      <label className="kd-check">
                        <input
                          id="auth-terms"
                          type="checkbox"
                          checked={terms}
                          aria-invalid={errors.terms ? true : undefined}
                          aria-describedby={errors.terms ? "auth-terms-msg" : undefined}
                          onChange={(e) => {
                            setTerms(e.target.checked);
                            setErrors((c) => ({ ...c, terms: undefined }));
                          }}
                        />
                        <span>
                          Li e aceito os{" "}
                          <Link href="/termos" target="_blank">
                            Termos de Uso
                          </Link>{" "}
                          e a{" "}
                          <Link href="/privacidade" target="_blank">
                            Política de Privacidade
                          </Link>
                          .
                        </span>
                      </label>
                      {errors.terms && (
                        <p id="auth-terms-msg" className="kd-error">
                          <AlertCircle size={14} aria-hidden />
                          {errors.terms}
                        </p>
                      )}
                    </div>
                  ) : (
                    <label className="kd-check">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => {
                          const keep = e.target.checked;
                          setRemember(keep);
                          if (isFirebaseConfigured) setPersistence(getFirebaseAuth(), keep ? browserLocalPersistence : browserSessionPersistence).catch(() => undefined);
                        }}
                      />
                      <span>
                        Manter conectado neste aparelho
                        <small className="kd-auth-check-hint">Desmarque em computadores compartilhados.</small>
                      </span>
                    </label>
                  )}

                  <Button type="submit" size="lg" block loading={Boolean(stage)}>
                    {stage || (isRegister ? "Criar conta" : "Entrar")}
                  </Button>
                </fieldset>
              </form>
            </>
          )}
        </div>

        <p className="kd-auth-legal">
          <Link href="/privacidade">Privacidade</Link>
          <span aria-hidden>·</span>
          <Link href="/termos">Termos de Uso</Link>
        </p>
      </main>
    </div>
  );
}
