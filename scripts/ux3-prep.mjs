import fs from 'fs';

// Skill roll modifier: ceil((total - 10) / 2)
let calc = fs.readFileSync('src/lib/calculations.ts', 'utf8');
calc = calc.replace(
  /\/\*\* Modificador de rolagem = floor\(\(valor - 5\) \/ 2\) \*\/\nexport function getSkillRollModifier\(skillTotal: number\): number \{\n  return Math\.floor\(\(skillTotal - 5\) \/ 2\);\n\}/,
  `/** Modificador de rolagem = ceil((valor - 10) / 2) */\nexport function getSkillRollModifier(skillTotal: number): number {\n  return Math.ceil((skillTotal - 10) / 2);\n}`
);
if (!calc.includes('Math.ceil((skillTotal - 10)')) {
  calc = calc.replace(
    'return Math.floor((skillTotal - 5) / 2);',
    'return Math.ceil((skillTotal - 10) / 2);'
  );
}
fs.writeFileSync('src/lib/calculations.ts', calc);
console.log('calc ok', calc.includes('Math.ceil((skillTotal - 10)'));

// Weapon types + default skill name helper in constants
let constants = fs.readFileSync('src/lib/constants.ts', 'utf8');
if (!constants.includes('WEAPON_TYPES')) {
  constants += `
export const WEAPON_TYPES = [
  'Corpo a Corpo',
  'A distância',
  'Explosivo',
  'Mágica',
] as const;

export function isDefaultSkillName(name: string): boolean {
  const n = name.trim().toLocaleLowerCase('pt-BR');
  return DEFAULT_SKILLS.some((s) => s.name.toLocaleLowerCase('pt-BR') === n);
}
`;
  fs.writeFileSync('src/lib/constants.ts', constants);
  console.log('constants weapon types');
}

// Migration for resource_mods
fs.writeFileSync(
  'supabase/migrations/002_resource_mods.sql',
  `-- Mods de HP/Mana/Sanidade máxima (ajuste manual pontual)
alter table public.characters
  add column if not exists resource_mods jsonb not null default '{"hp":0,"mana":0,"sanity":0}'::jsonb;

notify pgrst, 'reload schema';
`
);

console.log('batch prep done');
