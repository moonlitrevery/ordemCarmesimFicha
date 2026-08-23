'use client';

import { SectionCard } from '@/components/ui/SectionCard';

export function NotesSection({
  notes,
  onChange,
}: {
  notes: string;
  onChange: (notes: string) => void;
}) {
  return (
    <SectionCard title="Anotações">
      <textarea
        className="field min-h-[120px]"
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Notas de sessão…"
      />
    </SectionCard>
  );
}

export function BackstorySection({
  backstory,
  onChange,
}: {
  backstory: string;
  onChange: (backstory: string) => void;
}) {
  return (
    <SectionCard title="História do Personagem">
      <textarea
        className="field min-h-[220px]"
        value={backstory}
        onChange={(e) => onChange(e.target.value)}
        placeholder="História de fundo…"
      />
    </SectionCard>
  );
}
