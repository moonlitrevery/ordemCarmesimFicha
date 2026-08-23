import type { Metadata } from 'next';
import { Cormorant_Garamond, Source_Sans_3 } from 'next/font/google';
import { Nav } from '@/components/layout/Nav';
import './globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

const sans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Ordem Carmesim',
  description: 'Fichas, lore e regras da campanha Ordem Carmesim',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${display.variable} ${sans.variable} font-sans antialiased bg-ink text-parchment`}
      >
        <div className="min-h-dvh bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,30,45,0.22),transparent),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(92,15,26,0.15),transparent)]">
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 md:px-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
