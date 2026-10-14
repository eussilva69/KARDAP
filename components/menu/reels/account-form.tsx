"use client";

import { useState } from "react";
import { AlertCircle, Mail, MailCheck } from "lucide-react";
import { customerAuthError, resetCustomerPassword, signInCustomer, signInCustomerWithGoogle, signUpCustomer, type Customer } from "@/lib/reels";
import { Button, TextField } from "@/components/ui/primitives";
import { GoogleMark } from "@/components/ui/google-mark";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Mode = "choose" | "signup" | "signin" | "reset";

/**
 * Conta de cliente do cardápio (só para guardar pratos salvos): Google ou e-mail e senha.
 * Quem já curtiu tem uma identidade anônima, que vira esta conta ao criá-la (as curtidas continuam valendo).
 */
export function AccountForm({ onDone }: { onDone: (who: Customer) => void | Promise<void> }) {
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "google" | "email">("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [resetSent, setResetSent] = useState(false);

  const switchTo = (next: Mode) => {
    setMode(next);
    setError("");
    setFieldErrors({});
    setResetSent(false);
  };

  const google = async () => {
    setBusy("google");
    setError("");
    try {
      await onDone(await signInCustomerWithGoogle());
    } catch (err) {
      setError(customerAuthError(err));
    } finally {
      setBusy("");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const typed = email.trim();
    const errors: typeof fieldErrors = {};
    if (!EMAIL.test(typed)) errors.email = "Digite um e-mail válido.";
    if (mode !== "reset" && password.length < 6) errors.password = mode === "signup" ? "Use pelo menos 6 caracteres." : "Digite a senha.";
    setFieldErrors(errors);
    if (errors.email || errors.password) return;
    setBusy("email");
    setError("");
    try {
      if (mode === "reset") {
        await resetCustomerPassword(typed);
        setResetSent(true);
      } else {
        await onDone(mode === "signup" ? await signUpCustomer(typed, password) : await signInCustomer(typed, password));
      }
    } catch (err) {
      // Na recuperação de senha, não dizemos se o e-mail tem conta (evita descobrir quem é cliente).
      if (mode === "reset" && (err as { code?: string })?.code === "auth/user-not-found") setResetSent(true);
      else setError(customerAuthError(err));
    } finally {
      setBusy("");
    }
  };

  const legal = (
    <p className="kd-account-legal">
      Ao continuar, você concorda com os{" "}
      <a href="/termos" target="_blank" rel="noopener">
        Termos de uso
      </a>{" "}
      e a{" "}
      <a href="/privacidade" target="_blank" rel="noopener">
        Política de privacidade
      </a>
      .
    </p>
  );

  const errorBox = error && (
    <div className="kd-sheet-error" role="alert">
      <AlertCircle size={18} aria-hidden />
      <p>{error}</p>
    </div>
  );

  if (mode === "choose") {
    return (
      <div className="kd-account">
        <Button variant="secondary" size="lg" block icon={<GoogleMark />} loading={busy === "google"} disabled={Boolean(busy)} onClick={google}>
          Continuar com Google
        </Button>
        <Button variant="primary" size="lg" block icon={<Mail size={18} aria-hidden />} disabled={Boolean(busy)} onClick={() => switchTo("signup")}>
          Criar conta com e-mail
        </Button>
        <p className="kd-account-switch">
          Já tem conta?{" "}
          <button type="button" className="kd-btn kd-btn--link" onClick={() => switchTo("signin")}>
            Entrar
          </button>
        </p>
        {errorBox}
        {legal}
      </div>
    );
  }

  if (mode === "reset" && resetSent) {
    return (
      <div className="kd-account kd-account-sent" role="status">
        <MailCheck size={26} aria-hidden />
        <p>
          Se existir uma conta para <b>{email.trim()}</b>, enviamos um link para criar uma nova senha. Confira também o spam.
        </p>
        <Button variant="secondary" block onClick={() => switchTo("signin")}>
          Voltar para entrar
        </Button>
      </div>
    );
  }

  return (
    <form className="kd-account" onSubmit={submit} noValidate>
      <TextField
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        error={fieldErrors.email}
        onChange={(e) => setEmail(e.target.value)}
        maxLength={120}
        autoFocus
      />
      {mode !== "reset" && (
        <TextField
          label="Senha"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          error={fieldErrors.password}
          hint={mode === "signup" ? "Pelo menos 6 caracteres." : undefined}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={100}
        />
      )}
      {errorBox}
      <Button type="submit" size="lg" block loading={busy === "email"} disabled={Boolean(busy)}>
        {mode === "signup" ? "Criar conta e salvar" : mode === "signin" ? "Entrar e salvar" : "Enviar link para nova senha"}
      </Button>
      <div className="kd-account-links">
        {mode === "signup" && (
          <button type="button" className="kd-btn kd-btn--link" onClick={() => switchTo("signin")}>
            Já tenho conta
          </button>
        )}
        {mode === "signin" && (
          <>
            <button type="button" className="kd-btn kd-btn--link" onClick={() => switchTo("signup")}>
              Criar conta
            </button>
            <button type="button" className="kd-btn kd-btn--link" onClick={() => switchTo("reset")}>
              Esqueci a senha
            </button>
          </>
        )}
        <button type="button" className="kd-btn kd-btn--link" onClick={() => switchTo("choose")}>
          Outras opções
        </button>
      </div>
      {mode === "signup" && legal}
    </form>
  );
}
