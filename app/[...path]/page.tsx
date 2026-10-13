import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SSO_COOKIE } from "@/lib/sso/config";
import App from "@/components/app";

const TITLES: Record<string, string> = {
  login: "Entrar",
  "criar-conta": "Criar conta",
  onboarding: "Configurar restaurante",
  dashboard: "Painel",
  r: "Cardápio",
  planos: "Planos",
  admin: "Administração",
  privacidade: "Política de Privacidade",
  termos: "Termos de Uso",
  cookies: "Política de Cookies",
  logout: "Sair",
};
const PRIVATE = new Set(["dashboard", "onboarding", "login", "criar-conta", "admin", "logout"]);

/** Título por rota e sem indexação das áreas privadas (painel, login, configuração inicial). */
export function generateMetadata({ params }: { params: { path?: string[] } }): Metadata {
  const first = params.path?.[0] || "";
  return {
    title: TITLES[first] || "Página não encontrada",
    robots: PRIVATE.has(first) ? { index: false, follow: false } : undefined,
  };
}

export default async function Page({ params, searchParams }: { params: { path?: string[] }; searchParams: Record<string, string | string[] | undefined> }) {
  // Endereços desconhecidos respondem 404 (as páginas da landing são servidas antes, pelo middleware).
  // O <Suspense> fica aqui, e não no layout, para o 404 ser decidido antes de a resposta começar.
  const first = params.path?.[0] || "";
  if (!TITLES[first]) notFound();
  // Login pedido por outro aplicativo (?returnTo=) com a sessão central válida: volta direto, sem renderizar o login.
  // O módulo de sessão (Admin SDK) só é carregado quando há destino e cookie; se ele falhar por qualquer motivo,
  // a tela de login abre normalmente e faz a mesma verificação pelo navegador.
  if (first === "login" && (searchParams.returnTo || searchParams.redirect) && cookies().has(SSO_COOKIE)) {
    let target: string | null = null;
    try {
      const { continueIfSignedIn } = await import("@/lib/sso/continue");
      target = await continueIfSignedIn(searchParams);
    } catch (error) {
      console.error("[sso] login: verificação no servidor indisponível —", (error as Error)?.message?.split("\n")[0]);
    }
    if (target) redirect(target);
  }
  return (
    <Suspense>
      <App />
    </Suspense>
  );
}
