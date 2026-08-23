'use client';

import { ListSection } from '@/components/character/ListSection';
import type { HistoricalFeat } from '@/types/database';

export function HistoricalFeatsSection({
  feats,
  totalLevel,
  onChange,
}: {
  feats: HistoricalFeat[];
  totalLevel: number;
  onChange: (feats: HistoricalFeat[]) => void;
}) {
  return (
    <ListSection
      title="Feitos Históricos"
      onAdd={() =>
        onChange([
          ...feats,
          {
            title: 'Feito',
            description: '',
            alignment: 'positivo',
          },
        ])
      }
    >
      {totalLevel >= 20 && (
        <p className="text-sm text-crimson-soft">
          Após o nível 20, a evolução do personagem vem destes feitos.
        </p>
      )}
      {feats.map((f, i) => (
        <div key={i} className="space-y-2 rounded-md border border-ink-border p-3">
          <div className="flex flex-wrap gap-2">
            <input
              className="field flex-1"
              value={f.title}
              onChange={(e) => {
                const next = [...feats];
                next[i] = { ...f, title: e.target.value };
                onChange(next);
              }}
            />
            <select
              className="field w-36"
              value={f.alignment}
              onChange={(e) => {
                const next = [...feats];
                next[i] = {
                  ...f,
                  alignment: e.target.value as 'positivo' | 'negativo',
                };
                onChange(next);
              }}
            >
              <option value="positivo">Positivo</option>
              <option value="negativo">Negativo</option>
            </select>
            <button
              type="button"
              className="btn-ghost px-2"
              onClick={() => onChange(feats.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
          <textarea
            className="field min-h-[50px]"
            value={f.description}
            onChange={(e) => {
              const next = [...feats];
              next[i] = { ...f, description: e.target.value };
              onChange(next);
            }}
          />
          <input
            className="field"
            placeholder="Sessão / data"
            value={f.dateOrSession ?? ''}
            onChange={(e) => {
              const next = [...feats];
              next[i] = { ...f, dateOrSession: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
    </ListSection>
  );
}
