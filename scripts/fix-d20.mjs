import fs from 'fs';

const p = 'src/components/character/CharacterSheet.tsx';
let s = fs.readFileSync(p, 'utf8');

s = s.replaceAll('notation="1d100"', 'notation="1d20"');

fs.writeFileSync(p, s);
console.log('d20 count', (s.match(/1d20/g) || []).length);
console.log('d100 remaining', (s.match(/1d100/g) || []).length);
