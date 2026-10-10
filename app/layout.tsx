import type { Metadata } from 'next';
import './globals.css';
import './dashboard.css';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Kardap | Cardapios que se movem',
  description: 'Cardapio digital por QR Code',
  icons: { icon: '/kardap-k.png', apple: '/kardap-k.png' },
};

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* media="print" evita que a fonte externa bloqueie a primeira pintura em rede lenta. */}
        <link id="kd-fonts" rel="stylesheet" href={FONTS_URL} media="print" suppressHydrationWarning />
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(l){if(!l)return;if(l.sheet){l.media='all'}else{l.addEventListener('load',function(){l.media='all'})}})(document.getElementById('kd-fonts'))",
          }}
        />
        <noscript>
          <link rel="stylesheet" href={FONTS_URL} />
        </noscript>
      </head>
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  );
}
