import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import "./auth.css";
import "./dashboard.css";
import "./menu.css";
import "./site.css";
import "./admin.css";
// Rodapé compartilhado com a landing estática (public/*.html).
import "../public/kardap-footer.css";

/* Archivo variável (peso e largura): a largura condensada ecoa o display de mesa do Kardap. */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: { default: "Kardap · Cardápio digital por QR Code", template: "%s · Kardap" },
  description: "Cardápio digital com fotos e vídeos dos pratos, QR Code por mesa e chamados de garçom em tempo real para restaurantes, bares e cafés.",
  applicationName: "Kardap",
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
    siteName: "Kardap",
    title: "Kardap · Cardápio digital por QR Code",
    description: "Cardápio com fotos e vídeos, QR Code por mesa e chamados de garçom em tempo real.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e1912",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={archivo.variable}>
      <body>
        {children}
      </body>
    </html>
  );
}
