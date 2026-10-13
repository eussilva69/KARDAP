import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
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
  if (first === "login") {
    const { continueIfSignedIn } = await import("@/lib/sso/continue");
    const target = await continueIfSignedIn(searchParams);
    if (target) redirect(target);
  }
  return (
    <Suspense>
      <App />
    </Suspense>
  );
}
