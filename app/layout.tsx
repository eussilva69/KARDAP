import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo/site";
import "./globals.css";
import "./auth.css";
import "./dashboard.css";
import "./menu.css";
import "./site.css";
import "./admin.css";
import "./public-menu.css";
// Rodapé compartilhado com a landing estática (public/*.html).
import "../public/kardap-footer.css";

/* Archivo variável (peso e largura): a largura condensada ecoa o display de mesa do Kardap. */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

const DEFAULT_DESCRIPTION = "Cardápio digital com fotos e vídeos dos pratos, QR Code por mesa e chamados de garçom em tempo real para restaurantes, bares e cafés.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Cardápio digital com vídeo e QR Code por mesa | Kardap", template: "%s | Kardap" },
  description: DEFAULT_DESCRIPTION,
  applicationName: "Kardap",
  // Verificação de propriedade: só com os códigos reais nas variáveis de ambiente (docs/SEO.md).
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
  icons: {
    icon: [
      { url: "/brand/kardap-icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/brand/kardap-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/brand/kardap-icon-180.png", sizes: "180x180" },
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SITE_NAME,
    title: "Cardápio digital com vídeo e QR Code por mesa | Kardap",
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};

const themeBootstrap = `(()=>{try{const p=location.pathname;let k="";if(p.startsWith("/dashboard"))k="kardap-theme-panel:v1";else if(p.startsWith("/r/")){const s=p.split("/")[2]||"";k="kardap-theme-menu:"+s+":v1"}if(!k)return;const t=JSON.parse(localStorage.getItem(k)||"null");if(!t||!t.vars)return;const r=document.documentElement;Object.entries(t.vars).forEach(([n,v])=>r.style.setProperty(n,String(v)));if(t.scheme)r.style.colorScheme=t.scheme}catch{}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={archivo.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>
        {children}
      </body>
    </html>
  );
}
