'use client';

import type { ReactNode } from 'react';
import { SectionCard } from '@/components/ui/SectionCard';

export function ListSection({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <SectionCard
      title={title}
      action={
        <button type="button" className="btn-ghost text-xs" onClick={onAdd}>
          + Adicionar
        </button>
      }
    >
      <div className="space-y-3">{children}</div>
    </SectionCard>
  );
}
