'use client';

import { ListSection } from '@/components/character/ListSection';
import type { Curse } from '@/types/database';

export function CursesSection({
  curses,
  onChange,
}: {
  curses: Curse[];
  onChange: (curses: Curse[]) => void;
}) {
  return (
    <ListSection
      title="Maldições"
      onAdd={() =>
        onChange([...curses, { name: 'Maldição', story: '', effect: '' }])
      }
    >
      {curses.map((c, i) => (
        <div key={i} className="space-y-2 rounded-md border border-ink-border p-3">
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={c.name}
              onChange={(e) => {
                const next = [...curses];
                next[i] = { ...c, name: e.target.value };
                onChange(next);
              }}
            />
            <button
              type="button"
              className="btn-ghost px-2"
              onClick={() => onChange(curses.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
          <textarea
            className="field min-h-[50px]"
            placeholder="História"
            value={c.story}
            onChange={(e) => {
              const next = [...curses];
              next[i] = { ...c, story: e.target.value };
              onChange(next);
            }}
          />
          <textarea
            className="field min-h-[50px]"
            placeholder="Efeito"
            value={c.effect}
            onChange={(e) => {
              const next = [...curses];
              next[i] = { ...c, effect: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
    </ListSection>
  );
}
