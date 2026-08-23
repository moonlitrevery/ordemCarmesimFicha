import fs from 'fs';

const p = 'src/components/character/CharacterSheet.tsx';
let s = fs.readFileSync(p, 'utf8');

// Add DEFAULT_SKILLS to constants import
if (!s.includes('DEFAULT_SKILLS')) {
  s = s.replace(
    `import {
  ORDER_RANKS,
  SPECIALIZATION_LABELS,
  VALID_IMAGE_URL,
} from '@/lib/constants';`,
    `import {
  DEFAULT_SKILLS,
  ORDER_RANKS,
  SPECIALIZATION_LABELS,
  VALID_IMAGE_URL,
} from '@/lib/constants';`
  );
}

// Seed skills when empty
s = s.replace(
  'skills: c.skills ?? [],',
  'skills: c.skills && c.skills.length > 0 ? c.skills : DEFAULT_SKILLS.map((sk) => ({ ...sk })),'
);

// Attributes section: add roll button
const oldAttr = `              <label key={key} className="rounded-md border border-ink-border bg-ink-raised/50 p-2 text-center">
                <span className="label block">{ATTRIBUTE_LABELS[key]}</span>
                <span className="mt-0.5 block text-[10px] text-ink-muted">{key}</span>
                <input
                  type="number"
                  className="field mt-2 text-center font-display text-xl"
                  value={value}
                  onChange={(e) =>
                    patch({
                      attributes: {
                        ...sheet.attributes,
                        [key]: Number(e.target.value) || 0,
                      },
                    })
                  }
                />
                <span className="mt-1 block text-sm text-crimson-soft">
                  {mod >= 0 ? \`+\${mod}\` : mod}
                </span>
              </label>`;

const newAttr = `              <div key={key} className="rounded-md border border-ink-border bg-ink-raised/50 p-3 text-center">
                <span className="label block">{ATTRIBUTE_LABELS[key]}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{key}</span>
                <input
                  type="number"
                  className="field mt-2 text-center font-display text-2xl"
                  value={value}
                  onChange={(e) =>
                    patch({
                      attributes: {
                        ...sheet.attributes,
                        [key]: Number(e.target.value) || 0,
                      },
                    })
                  }
                />
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="text-base text-crimson-soft">
                    {mod >= 0 ? \`+\${mod}\` : mod}
                  </span>
                  <InlineRollButton
                    notation="1d100"
                    label={\`\${ATTRIBUTE_LABELS[key]} (meta \${value})\`}
                  />
                </div>
              </div>`;

if (!s.includes('label={`${ATTRIBUTE_LABELS[key]}')) {
  if (s.includes(oldAttr)) {
    s = s.replace(oldAttr, newAttr);
    console.log('attributes roll added');
  } else {
    // try without escaped templates - file has real backticks
    const oldAttrReal = `              <label key={key} className="rounded-md border border-ink-border bg-ink-raised/50 p-2 text-center">
                <span className="label block">{ATTRIBUTE_LABELS[key]}</span>
                <span className="mt-0.5 block text-[10px] text-ink-muted">{key}</span>
                <input
                  type="number"
                  className="field mt-2 text-center font-display text-xl"
                  value={value}
                  onChange={(e) =>
                    patch({
                      attributes: {
                        ...sheet.attributes,
                        [key]: Number(e.target.value) || 0,
                      },
                    })
                  }
                />
                <span className="mt-1 block text-sm text-crimson-soft">
                  {mod >= 0 ? \`+\${mod}\` : mod}
                </span>
              </label>`;
    // Read what's actually in the file around attributes
    const idx = s.indexOf('ATTRIBUTE_KEYS.map((key)');
    console.log('attr section snippet:', JSON.stringify(s.slice(idx, idx + 600)));
  }
}

// Skill InlineRollButton - add label
s = s.replace(
  '<InlineRollButton notation={`1d100`} />',
  '<InlineRollButton notation="1d100" label={`${skill.name} (meta ${total})`} />'
);

fs.writeFileSync(p, s);
console.log('CharacterSheet patched');
