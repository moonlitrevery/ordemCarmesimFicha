import type { Metadata } from 'next';
import { Cormorant_Garamond, Lexend } from 'next/font/google';
import { Nav } from '@/components/layout/Nav';
import { DiceToastProvider } from '@/components/dice/DiceToast';
import './globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const sans = Lexend({
  subsets: ['latin'],
  // 300 não é usado (nenhum font-light).
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
        className={`${display.variable} ${sans.variable} font-sans antialiased bg-ink text-parchment text-base leading-relaxed`}
      >
        <div className="min-h-dvh bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,30,45,0.22),transparent),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(92,15,26,0.15),transparent)]">
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 md:px-8">
            <DiceToastProvider>{children}</DiceToastProvider>
          </main>
        </div>
      </body>
    </html>
  );
}
