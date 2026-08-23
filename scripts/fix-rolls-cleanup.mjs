import fs from 'fs';
const p = 'src/components/rolls/LiveRollsFeed.tsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace("import { formatModifier } from '@/lib/calculations';\n", '');
fs.writeFileSync(p, s);
console.log('cleaned');

// Append to schema.sql a note about dice_rolls
let readme = fs.readFileSync('README.md', 'utf8');
if (!readme.includes('003_dice_rolls')) {
  readme += `
## Rolagens ao vivo (mestra)

1. Rode \`supabase/migrations/003_dice_rolls.sql\` no SQL Editor.
2. No Supabase → Database → Replication, confirme que \`dice_rolls\` está no Realtime (o SQL já tenta adicionar).
3. Conta com \`role = mestre\` vê o link **Rolagens** no menu (\`/rolagens\`).
`;
  fs.writeFileSync('README.md', readme);
}
