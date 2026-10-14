import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SSO_COOKIE } from "@/lib/sso/config";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { PLANS_FAQ } from "@/lib/plans-faq";
import App from "@/components/app";

/**
 * Metadados por rota (docs/SEO.md). index: false → "noindex": áreas logadas, login, cadastro e os cardápios
 * das mesas (conteúdo carregado no navegador e endereços por mesa). As páginas indexáveis entram no sitemap.
 */
type RouteMeta = { title: string; description?: string; index: boolean };
const ROUTES: Record<string, RouteMeta> = {
  login: { title: "Entrar", description: "Acesse o painel do Kardap para gerenciar o cardápio digital, as mesas e os chamados do seu restaurante.", index: false },
  "criar-conta": { title: "Criar conta", description: "Crie a conta do seu restaurante no Kardap e teste o cardápio digital com vídeo por 15 dias, sem cartão de crédito.", index: false },
  onboarding: { title: "Configurar restaurante", index: false },
  dashboard: { title: "Painel", index: false },
  admin: { title: "Administração", index: false },
  logout: { title: "Sair", index: false },
  r: { title: "Cardápio", index: false },
  planos: {
    title: "Planos e preços do cardápio digital",
    description:
      "Compare os planos do Kardap: Essencial por R$ 49 por mês, com até 30 mesas, e Pro por R$ 99 por mês, com mesas ilimitadas, pedido de conta e relatórios. 15 dias grátis, sem cartão.",
    index: true,
  },
  privacidade: { title: "Política de Privacidade", description: "Como o Kardap coleta, usa e protege os dados de restaurantes e dos clientes que acessam o cardápio digital.", index: true },
  termos: { title: "Termos de Uso", description: "Condições de uso da plataforma Kardap de cardápio digital para restaurantes, bares e cafés.", index: true },
  cookies: { title: "Política de Cookies", description: "Quais cookies o Kardap usa e como você pode gerenciar suas preferências.", index: true },
};

export function generateMetadata({ params }: { params: { path?: string[] } }): Metadata {
  const segments = params.path || [];
  const route = ROUTES[segments[0] || ""];
  if (!route) return { title: "Página não encontrada", robots: { index: false, follow: false } };
  // Cardápio de restaurante: um endereço por restaurante (sem o ?mesa=).
  const path = segments[0] === "r" && segments[1] ? `/r/${segments[1]}` : `/${segments[0]}`;
  const title = `${route.title} | Kardap`;
  return {
    title: route.title,
    description: route.description,
    alternates: { canonical: path },
    robots: route.index ? { index: true, follow: true } : { index: false, follow: segments[0] === "r" },
    openGraph: { type: "website", locale: "pt_BR", siteName: SITE_NAME, url: path, title, description: route.description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description: route.description, images: [OG_IMAGE.url] },
  };
}

export default async function Page({ params, searchParams }: { params: { path?: string[] }; searchParams: Record<string, string | string[] | undefined> }) {
  // Endereços desconhecidos respondem 404 (as páginas da landing são servidas antes, pelo middleware).
  // O <Suspense> fica aqui, e não no layout, para o 404 ser decidido antes de a resposta começar.
  const first = params.path?.[0] || "";
  if (!ROUTES[first]) notFound();
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
    <>
      {first === "planos" && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: plansJsonLd() }} />}
      <Suspense>
        <App />
      </Suspense>
    </>
  );
}

/** Dados estruturados da página de planos: trilha de navegação e as dúvidas frequentes que aparecem na página. */
function plansJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Kardap", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Planos e preços", item: `${SITE_URL}/planos` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: PLANS_FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
