import { FRAGMENT_COST } from '@/lib/constants';

export function FragmentCostTable() {
  return (
    <div className="overflow-x-auto rounded-md border border-ink-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-raised text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Nível atual</th>
            <th className="px-3 py-2 font-medium">Fragmentos para o próximo</th>
          </tr>
        </thead>
        <tbody>
          {FRAGMENT_COST.map((cost, level) => (
            <tr key={level} className="border-t border-ink-border">
              <td className="px-3 py-1.5">{level}</td>
              <td className="px-3 py-1.5 text-crimson-soft">{cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
