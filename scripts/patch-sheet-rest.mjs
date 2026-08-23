import fs from 'fs';

const p = 'src/components/character/CharacterSheet.tsx';
let s = fs.readFileSync(p, 'utf8');

// Skills: lock default names
const skillNameInput = `              <input
                className="field"
                value={skill.name}
                onChange={(e) => {
                  const skills = [...sheet.skills];
                  skills[i] = { ...skill, name: e.target.value };
                  patch({ skills });
                }}
              />`;

const skillNameLocked = `              {isDefaultSkillName(skill.name) ? (
                <p className="field border-transparent bg-transparent px-1 font-medium text-parchment">
                  {skill.name}
                </p>
              ) : (
                <input
                  className="field"
                  value={skill.name}
                  onChange={(e) => {
                    const skills = [...sheet.skills];
                    skills[i] = { ...skill, name: e.target.value };
                    patch({ skills });
                  }}
                />
              )}`;

if (s.includes(skillNameInput) && !s.includes('isDefaultSkillName(skill.name)')) {
  s = s.replace(skillNameInput, skillNameLocked);
  console.log('skills locked');
} else {
  console.log('skills lock skip', s.includes('isDefaultSkillName'));
}

// Custom skills on add should not match default names - already "Nova perícia"

// Weapons section - rewrite add default and fields
s = s.replace(
  `weapons: [
              ...sheet.weapons,
              {
                name: 'Nova arma',
                type: '',
                damage: '1d6',
                ammo: '',
                hitsPerTurn: 1,
                range: '',
                flaw: '',
                area: '',
              },
            ],`,
  `weapons: [
              ...sheet.weapons,
              {
                name: 'Nova arma',
                type: 'Corpo a Corpo',
                damage: '1d6',
                ammo: '',
                hitsPerTurn: 1,
                weight: 1,
                range: '',
                flaw: '',
                area: '',
              },
            ],`
);

// Replace weapon card body - find weapons.map and replace carefully
const wStart = s.indexOf('{sheet.weapons.map((w, i) => (');
const wEnd = s.indexOf('{/* Inventário */}', wStart);
if (wStart !== -1 && wEnd !== -1) {
  const weaponsBlock = `        {sheet.weapons.map((w, i) => (
          <div key={i} className="space-y-2 rounded-md border border-ink-border bg-ink-raised/40 p-3">
            <div className="flex flex-wrap gap-2">
              <input
                className="field flex-1"
                value={w.name}
                onChange={(e) => {
                  const weapons = [...sheet.weapons];
                  weapons[i] = { ...w, name: e.target.value };
                  patch({ weapons });
                }}
              />
              <input
                className="field w-24"
                placeholder="Dano"
                value={w.damage}
                onChange={(e) => {
                  const weapons = [...sheet.weapons];
                  weapons[i] = { ...w, damage: e.target.value };
                  patch({ weapons });
                }}
              />
              <InlineRollButton notation={w.damage || '1d6'} />
              <button
                type="button"
                className="btn-ghost px-2"
                onClick={() =>
                  patch({ weapons: sheet.weapons.filter((_, j) => j !== i) })
                }
              >
                ×
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="label">Tipo</span>
                <select
                  className="field"
                  value={w.type || 'Corpo a Corpo'}
                  onChange={(e) => {
                    const weapons = [...sheet.weapons];
                    weapons[i] = { ...w, type: e.target.value };
                    patch({ weapons });
                  }}
                >
                  {WEAPON_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="label">Hits/turno</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  className="field"
                  value={w.hitsPerTurn}
                  onChange={(e) => {
                    const weapons = [...sheet.weapons];
                    weapons[i] = {
                      ...w,
                      hitsPerTurn: Math.trunc(Number(e.target.value) || 0),
                    };
                    patch({ weapons });
                  }}
                />
              </label>
              <label className="space-y-1">
                <span className="label">Peso</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  className="field"
                  value={w.weight ?? 0}
                  onChange={(e) => {
                    const weapons = [...sheet.weapons];
                    weapons[i] = {
                      ...w,
                      weight: Math.trunc(Number(e.target.value) || 0),
                    };
                    patch({ weapons });
                  }}
                />
              </label>
              {(
                [
                  ['ammo', 'Munição'],
                  ['range', 'Alcance'],
                  ['flaw', 'Falha'],
                  ['area', 'Área'],
                ] as const
              ).map(([key, ph]) => (
                <input
                  key={key}
                  className="field"
                  placeholder={ph}
                  value={w[key]}
                  onChange={(e) => {
                    const weapons = [...sheet.weapons];
                    weapons[i] = { ...w, [key]: e.target.value };
                    patch({ weapons });
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </ListSection>

      `;
  s = s.slice(0, wStart) + weaponsBlock + s.slice(wEnd);
  console.log('weapons rewritten');
}

// Inventory weight: step=1, integer
s = s.replace(
  `              <input
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
  `              <input
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

// Also weight display toFixed(1) -> integer
s = s.replace(
  'Inventário (${weight.toFixed(1)} / ${limit} peso)',
  'Inventário (${weight} / ${limit} peso)'
);
// might be template in file differently
s = s.replace(
  'title={`Inventário (${weight.toFixed(1)} / ${limit} peso)`}',
  'title={`Inventário (${weight} / ${Math.floor(limit)} peso)`}'
);
s = s.replace(/weight\.toFixed\(1\)/g, 'weight');

fs.writeFileSync(p, s);
console.log('done', {
  locked: s.includes('isDefaultSkillName'),
  weaponTypes: s.includes('WEAPON_TYPES'),
  hits: s.includes('Hits/turno'),
  wWeight: s.includes('w.weight'),
});
