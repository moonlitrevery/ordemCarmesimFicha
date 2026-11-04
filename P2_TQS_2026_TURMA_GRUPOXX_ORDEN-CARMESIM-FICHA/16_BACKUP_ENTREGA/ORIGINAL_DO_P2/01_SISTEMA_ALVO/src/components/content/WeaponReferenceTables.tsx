import type { ReactNode } from 'react';
import {
  ARMOR_REF,
  MODIFIER_REF,
  WEAPON_REF_GROUPS,
} from '@/lib/weapons-reference';

const WEAPON_COLUMNS = [
  'Nome',
  'Tipo',
  'Dano',
  'Munição',
  'Hits/turno',
  'Alcance',
  'Defeito',
  'Área',
  'Peso',
  'Dado',
  'Grau p/ compra',
  'Preço',
  'Disponibilidade',
];

const AVAILABILITY_STYLES: Record<string, string> = {
  Disponível: 'border-emerald-700/50 bg-emerald-900/20 text-emerald-300',
  'Por encomenda': 'border-amber-700/50 bg-amber-900/20 text-amber-300',
  'Não disponível': 'border-crimson/40 bg-crimson/10 text-crimson-soft/80',
};

function AvailabilityBadge({ value }: { value: string }) {
  const style = AVAILABILITY_STYLES[value];
  if (!style) return <span className="text-ink-muted">{value}</span>;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs ${style}`}
    >
      {value}
    </span>
  );
}

function RefTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-ink-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-raised text-ink-muted">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col}
                className={`whitespace-nowrap px-3 py-2 font-medium ${
                  i === 0 ? 'sticky left-0 z-10 bg-ink-raised' : ''
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr
              key={r}
              className={`border-t border-ink-border ${
                r % 2 === 1 ? 'bg-ink-raised/30' : 'bg-ink'
              }`}
            >
              {cells.map((cell, c) => (
                <td
                  key={c}
                  className={`px-3 py-1.5 align-top ${
                    c === 0
                      ? `sticky left-0 z-10 whitespace-nowrap font-medium text-parchment ${
                          r % 2 === 1 ? 'bg-ink-raised' : 'bg-ink'
                        }`
                      : ''
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-ink-border bg-ink-raised/30">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-display text-lg text-parchment [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-ink-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-3 border-t border-ink-border p-3">{children}</div>
    </details>
  );
}

export function WeaponReferenceTables() {
  return (
    <div className="not-prose mt-8 space-y-8">
      {WEAPON_REF_GROUPS.map((group) => (
        <section key={group.id} className="space-y-3">
          <h2 className="font-display text-2xl text-parchment">{group.title}</h2>
          <RefTable
            columns={WEAPON_COLUMNS}
            rows={group.rows.map((w) => [
              w.name,
              <span key="type" className="whitespace-nowrap">{w.type}</span>,
              <span key="damage" className="whitespace-nowrap text-crimson-soft">
                {w.damage}
              </span>,
              w.ammo,
              w.hitsPerTurn,
              w.range,
              <span key="flaw" className="whitespace-nowrap">{w.flaw}</span>,
              w.area,
              w.weight,
              w.skill,
              <span key="rank" className="whitespace-nowrap">{w.rank}</span>,
              <span key="price" className="whitespace-nowrap">{w.price}</span>,
              <AvailabilityBadge key="avail" value={w.availability} />,
            ])}
          />
        </section>
      ))}

      <div className="space-y-3">
        <Collapsible title="Armaduras">
          <RefTable
            columns={['Nome', 'Redução', 'Grau p/ compra', 'Preço']}
            rows={ARMOR_REF.map((a) => [
              a.name,
              <span key="red" className="block min-w-[16rem]">{a.reduction}</span>,
              <span key="rank" className="whitespace-nowrap">{a.rank}</span>,
              <span key="price" className="whitespace-nowrap">{a.price}</span>,
            ])}
          />
        </Collapsible>

        <Collapsible title="Modificadores">
          <p className="text-sm text-ink-muted">
            Máximo de 3 modificadores por arma.
          </p>
          <RefTable
            columns={['Nome', 'Descrição', 'Peso', 'Preço', 'Disponibilidade']}
            rows={MODIFIER_REF.map((m) => [
              m.name,
              <span key="desc" className="block min-w-[18rem]">{m.description}</span>,
              m.weight,
              <span key="price" className="whitespace-nowrap">{m.price}</span>,
              <AvailabilityBadge key="avail" value={m.availability} />,
            ])}
          />
        </Collapsible>
      </div>
    </div>
  );
}
