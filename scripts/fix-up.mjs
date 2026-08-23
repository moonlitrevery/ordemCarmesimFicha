import fs from 'fs';

let layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
layout = layout.replace(
  'bg-ink bg-ink-veil text-parchment',
  'bg-ink text-parchment'
);
fs.writeFileSync('src/app/layout.tsx', layout);

let calc = fs.readFileSync('lib/calculations.ts', 'utf8');
calc = calc.replace(
  '  FRAGMENT_COST,\n  LEVEL_MILESTONES,\n  MAX_CHARACTER_LEVEL,',
  '  FRAGMENT_COST,\n  MAX_CHARACTER_LEVEL,'
);
fs.writeFileSync('lib/calculations.ts', calc);

fs.writeFileSync(
  'content/regras/elementos-e-fragmentos.mdx',
  `import { FragmentCostTable } from '@/components/content/FragmentCostTable';

# Elementos e Fragmentos

{/* COLAR AQUI: texto da seção — os 11 elementos e a curva de fragmentos */}

## Visão geral

{/* COLAR AQUI: introdução */}

## Detalhes

{/* COLAR AQUI: conteúdo principal */}

## Curva de fragmentos

A tabela abaixo é gerada a partir da constante \`FRAGMENT_COST\` do sistema.

<FragmentCostTable />
`
);

fs.writeFileSync(
  'types/mdx.d.ts',
  `declare module '*.mdx' {
  import type { MDXProps } from 'mdx/types';
  const MDXComponent: (props: MDXProps) => JSX.Element;
  export default MDXComponent;
}
`
);

fs.writeFileSync(
  '.env.local',
  `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder
`
);

for (const f of [
  'src/components/dice/DiceRoller.tsx',
  'src/components/dice/FloatingDiceButton.tsx',
]) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replaceAll('🎲', 'D');
  fs.writeFileSync(f, s);
}

console.log('fixes ok');
