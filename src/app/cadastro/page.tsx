import Link from 'next/link';
import { SignupForm } from '@/components/auth/SignupForm';

export default function CadastroPage() {
  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-lg flex-col justify-center gap-6">
      <Link href="/" className="text-center font-display text-2xl text-parchment">
        Ordem <span className="text-crimson-soft">Carmesim</span>
      </Link>
      <SignupForm />
    </div>
  );
}
