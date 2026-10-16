import { Suspense } from "react";
import { cookies } from "next/headers";
import { SSO_COOKIE } from "@/lib/sso/config";
import { PLANS_FAQ } from "@/lib/plans-faq";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo/site";
import type { Metadata } from "next";
import PlansPageClient from "./plans-page-client";

export const metadata: Metadata = {
  title: "Planos e preços do cardápio digital",
  description:
    "Compare os planos do KARDAP: Start por R$ 49,90/mês (cardápio em vídeo e até 8 mesas), Pro por R$ 129,90 (PDV e 150 pedidos próprios), Business por R$ 199,90 (500 pedidos) e Enterprise sob consulta. 30 dias grátis no plano escolhido.",
  alternates: { canonical: "/planos" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SITE_NAME,
    url: "/planos",
    title: "Planos e preços | Kardap",
    description:
      "Compare os planos do KARDAP: Start por R$ 49,90/mês, Pro por R$ 129,90, Business por R$ 199,90 e Enterprise sob consulta. 30 dias grátis.",
    images: [OG_IMAGE],
  },
};

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
        mainEntity: PLANS_FAQ.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function Page() {
  const jar = cookies();
  // Detecta sessão pelo cookie SSO para exibir "Ver meu plano" vs "Começar grátis".
  const session = jar.has(SSO_COOKIE);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: plansJsonLd() }} />
      <Suspense>
        <PlansPageClient session={session} />
      </Suspense>
    </>
  );
}
