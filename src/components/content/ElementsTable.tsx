import { ALL_ELEMENTS, ELEMENT_LABELS } from '@/lib/constants';
import { DrawnElementSymbol } from '@/components/fx/DrawnElementSymbol';
import type { ElementType } from '@/types/database';

const COLOR_NAMES: Record<ElementType, string> = {
  fogo: 'Vermelho alaranjado',
  agua: 'Azul escuro',
  terra: 'Verde escuro',
  ar: 'Cinza claro',
  sangue: 'Vermelho forte escuro',
  encantamento: 'Azul clarinho',
  veneno: 'Verde claro',
  gelo: 'Azul-bebê-cinza',
  eletricidade: 'Amarelo',
  luz: 'Branco (não puro)',
  sombra: 'Preto (não puro)',
};

/** "Os 11 elementos" (Regras → Elementos e Fragmentos). */
export function ElementsTable() {
  return (
    <div className="not-prose overflow-x-auto rounded-md border border-ink-border">
      <table className="w-full text-left text-base">
        <thead className="bg-ink-raised text-sm text-ink-muted">
          <tr>
            <th className="w-16 px-3 py-2 font-medium">Símbolo</th>
            <th className="px-3 py-2 font-medium">Elemento</th>
            <th className="px-3 py-2 font-medium">Cor</th>
          </tr>
        </thead>
        <tbody>
          {ALL_ELEMENTS.map((el) => (
            <tr key={el} className="border-t border-ink-border">
              <td className="px-3 py-1.5">
                <DrawnElementSymbol element={el} size={28} decorative />
              </td>
              <td className="px-3 py-1.5 text-parchment">{ELEMENT_LABELS[el]}</td>
              <td className="px-3 py-1.5 text-ink-muted">{COLOR_NAMES[el]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
