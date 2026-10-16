"use client";

import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { LoaderCircle, MapPin, Plus, Trash2 } from "lucide-react";
import { getFirebaseAuth } from "@/lib/auth";
import { friendlyError, isQueued } from "@/lib/async";
import { saveCustomerProfile, type CustomerAddress, type CustomerProfile } from "@/lib/restaurant-db";
import { Panel } from "./panel";

type Notify = (message: string, tone?: "success" | "error") => void;

export const signOutCustomer = () => signOut(getFirebaseAuth());

const saveError = (error: unknown, notify: Notify) =>
  notify(
    isQueued(error)
      ? "Sem resposta do servidor. A alteração ficou guardada neste aparelho e será enviada quando a conexão voltar."
      : friendlyError(error, "Não foi possível salvar agora. Tente de novo."),
    "error",
  );

function Field({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="pm-field">
      {label}
      <input className="pm-input" {...input} />
    </label>
  );
}

/* ───────────────────────── Login ───────────────────────── */

export function LoginPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"" | "email" | "google" | "reset">("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const run = async (kind: "email" | "google" | "reset", task: () => Promise<unknown>, done = true) => {
    setLoading(kind);
    setError("");
    setInfo("");
    try {
      await task();
      if (done) onDone();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível entrar agora. Tente de novo."));
    } finally {
      setLoading("");
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "register" && name.trim().length < 2) return setError("Informe seu nome.");
    run("email", async () => {
      const auth = getFirebaseAuth();
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        return;
      }
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(user, { displayName: name.trim() });
      await saveCustomerProfile(user.uid, { name: name.trim(), email: user.email || email.trim(), emailNotifications: false, addresses: [] });
    });
  };

  const google = () =>
    run("google", async () => {
      const { user } = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      await saveCustomerProfile(user.uid, { email: user.email || "" });
    });

  const reset = () => {
    if (!email.trim()) return setError("Informe seu e-mail para receber o link de redefinição.");
    run(
      "reset",
      async () => {
        await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
        setInfo("Enviamos um link de redefinição de senha para o seu e-mail.");
      },
      false,
    );
  };

  return (
    <Panel title={mode === "login" ? "Entrar" : "Criar conta"} onClose={onClose}>
      <div className="pm-block pm-stack">
        <p className="pm-muted pm-small">Com uma conta você salva seus dados e endereços para os próximos pedidos.</p>
        <button type="button" className="pm-btn pm-btn--outline" onClick={google} disabled={Boolean(loading)} aria-busy={loading === "google" || undefined}>
          {loading === "google" ? <LoaderCircle size={15} className="pm-spin" aria-hidden /> : <img src="/google-logo.png" alt="" width={15} height={15} />}
          Continuar com Google
        </button>
        <p className="pm-divider">ou</p>
        <form className="pm-form" onSubmit={submit} noValidate>
          {mode === "register" && <Field label="Nome" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
          <Field label="E-mail" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field
            label="Senha"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="pm-alert" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="pm-success" role="status">
              {info}
            </p>
          )}
          <button type="submit" className="pm-btn" disabled={Boolean(loading)} aria-busy={loading === "email" || undefined}>
            {loading === "email" && <LoaderCircle size={15} className="pm-spin" aria-hidden />}
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
          <button type="button" className="pm-link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setInfo(""); }}>
            {mode === "login" ? "Criar conta" : "Já tenho conta"}
          </button>
          {mode === "login" && (
            <button type="button" className="pm-link-btn" onClick={reset} disabled={Boolean(loading)}>
              Esqueci minha senha
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ───────────────────────── Meu perfil ───────────────────────── */

type AccountProps = { user: User; profile: CustomerProfile | null; onClose: () => void; notify: Notify };

export function AccountPanel({ user, profile, onClose, notify }: AccountProps) {
  const [name, setName] = useState(profile?.name || user.displayName || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Informe seu nome.");
    setSaving(true);
    setError("");
    try {
      await saveCustomerProfile(user.uid, { name: name.trim(), phone: phone.trim(), email: user.email || "" });
      if (user.displayName !== name.trim()) await updateProfile(user, { displayName: name.trim() }).catch(() => undefined);
      notify("Dados atualizados");
      onClose();
    } catch (err) {
      saveError(err, notify);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Meu perfil" onClose={onClose}>
      <form className="pm-block pm-form" onSubmit={save} noValidate>
        <Field label="Nome" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Telefone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(00) 00000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Field label="E-mail" type="email" value={user.email || ""} readOnly disabled />
        {error && (
          <p className="pm-alert" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="pm-btn" disabled={saving} aria-busy={saving || undefined}>
          {saving && <LoaderCircle size={15} className="pm-spin" aria-hidden />}
          Salvar
        </button>
      </form>
    </Panel>
  );
}

/* ───────────────────────── Notificações ───────────────────────── */

export function NotificationsPanel({ user, profile, onClose, notify }: AccountProps) {
  const [saving, setSaving] = useState(false);
  const enabled = Boolean(profile?.emailNotifications);
  const toggle = async (checked: boolean) => {
    setSaving(true);
    try {
      await saveCustomerProfile(user.uid, { emailNotifications: checked, email: user.email || "" });
      notify(checked ? "Notificações por e-mail ativadas" : "Notificações por e-mail desativadas");
    } catch (err) {
      saveError(err, notify);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel title="Notificações por e-mail" onClose={onClose}>
      <div className="pm-block pm-stack">
        <label className="pm-toggle">
          <span>
            Receber notificações por e-mail
            <small className="pm-muted pm-small" style={{ display: "block", marginTop: 2 }}>
              {user.email ? `Enviadas para ${user.email}` : "Sua conta não tem e-mail cadastrado."}
            </small>
          </span>
          <input type="checkbox" role="switch" checked={enabled} disabled={saving || !user.email} onChange={(e) => toggle(e.target.checked)} />
          <span className="pm-toggle-track" aria-hidden />
        </label>
        <p className="pm-muted pm-small">Você pode desativar a qualquer momento.</p>
      </div>
    </Panel>
  );
}

/* ───────────────────────── Endereços ───────────────────────── */

const emptyAddress = (): Omit<CustomerAddress, "id"> => ({ label: "", street: "", number: "", complement: "", district: "", city: "", reference: "" });

export function AddressesPanel({ user, profile, loaded, onClose, notify }: AccountProps & { loaded: boolean }) {
  const addresses = profile?.addresses || [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyAddress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof ReturnType<typeof emptyAddress>) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const persist = async (next: CustomerAddress[], message: string) => {
    setSaving(true);
    try {
      await saveCustomerProfile(user.uid, { addresses: next });
      notify(message);
      return true;
    } catch (err) {
      saveError(err, notify);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.street.trim() || !draft.number.trim() || !draft.city.trim()) return setError("Preencha rua, número e cidade.");
    setError("");
    const clean = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])) as Omit<CustomerAddress, "id">;
    if (await persist([...addresses, { id: crypto.randomUUID(), ...clean }], "Endereço salvo")) {
      setDraft(emptyAddress());
      setAdding(false);
    }
  };

  return (
    <Panel title="Meus endereços" onClose={onClose}>
      <div className="pm-block pm-stack">
        {!loaded ? (
          <span className="pm-skel" style={{ height: 58 }} />
        ) : addresses.length ? (
          addresses.map((address) => (
            <div key={address.id} className="pm-address">
              <MapPin size={15} aria-hidden />
              <span>
                <b style={{ fontWeight: 600 }}>{address.label || `${address.street}, ${address.number}`}</b>
                <small>
                  {[address.label && `${address.street}, ${address.number}`, address.complement, address.district, address.city].filter(Boolean).join(" · ")}
                </small>
                {address.reference && <small>Ref.: {address.reference}</small>}
              </span>
              <button
                type="button"
                className="pm-icon-btn"
                aria-label="Excluir endereço"
                disabled={saving}
                onClick={() => persist(addresses.filter((item) => item.id !== address.id), "Endereço excluído")}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        ) : (
          !adding && <p className="pm-muted pm-small">Você ainda não salvou nenhum endereço.</p>
        )}

        {adding ? (
          <form className="pm-form" onSubmit={add} noValidate style={{ marginTop: 6 }}>
            <Field label="Nome do endereço (opcional)" placeholder="Casa, Trabalho…" value={draft.label} onChange={set("label")} />
            <div className="pm-field-row">
              <Field label="Rua" autoComplete="address-line1" value={draft.street} onChange={set("street")} />
              <Field label="Número" inputMode="numeric" value={draft.number} onChange={set("number")} />
            </div>
            <Field label="Complemento" autoComplete="address-line2" value={draft.complement} onChange={set("complement")} />
            <Field label="Bairro" value={draft.district} onChange={set("district")} />
            <Field label="Cidade" autoComplete="address-level2" value={draft.city} onChange={set("city")} />
            <Field label="Ponto de referência" value={draft.reference} onChange={set("reference")} />
            {error && (
              <p className="pm-alert" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="pm-btn" disabled={saving} aria-busy={saving || undefined}>
              {saving && <LoaderCircle size={15} className="pm-spin" aria-hidden />}
              Salvar endereço
            </button>
            <button type="button" className="pm-btn pm-btn--outline" onClick={() => { setAdding(false); setError(""); }}>
              Cancelar
            </button>
          </form>
        ) : (
          <button type="button" className="pm-btn pm-btn--outline" onClick={() => setAdding(true)} disabled={!loaded}>
            <Plus size={15} aria-hidden /> Adicionar endereço
          </button>
        )}
      </div>
    </Panel>
  );
}
