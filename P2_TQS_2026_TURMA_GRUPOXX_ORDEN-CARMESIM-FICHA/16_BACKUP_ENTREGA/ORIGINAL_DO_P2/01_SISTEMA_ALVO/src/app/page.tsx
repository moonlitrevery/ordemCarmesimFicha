import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-[80dvh] flex-col items-center justify-center text-center">
      <p className="label mb-4 text-crimson-soft">Campanha privada</p>
      <h1 className="font-display text-5xl leading-none text-parchment md:text-7xl">
        Ordem <span className="text-crimson-soft">Carmesim</span>
      </h1>
      <p className="mt-5 max-w-md text-balance text-ink-muted">
        Compêndio de lore, regras e fichas interativas para a mesa.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link href="/login" className="btn-primary">
          Entrar
        </Link>
        <Link href="/cadastro" className="btn-ghost">
          Criar conta
        </Link>
      </div>
    </div>
  );
}
