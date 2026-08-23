import fs from 'fs';
const p = 'src/components/character/CharacterSheet.tsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  `            <input
              type="number"
              step="0.1"
              className="field"
              value={item.weight}
              onChange={(e) => {
                const inventory = [...sheet.inventory];
                inventory[i] = { ...item, weight: Number(e.target.value) || 0 };
                patch({ inventory });
              }}
            />`,
  `            <input
              type="number"
              step={1}
              min={0}
              className="field"
              value={item.weight}
              onChange={(e) => {
                const inventory = [...sheet.inventory];
                inventory[i] = {
                  ...item,
                  weight: Math.trunc(Number(e.target.value) || 0),
                };
                patch({ inventory });
              }}
            />`
);
fs.writeFileSync(p, s);
console.log('inventory int', !s.includes('step="0.1"'));
