import fs from 'fs';

const p = 'src/components/character/CharacterSheet.tsx';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('DEFAULT_SKILLS')) {
  s = s.replace(
    "ORDER_RANKS,\n  SPECIALIZATION_LABELS,",
    "DEFAULT_SKILLS,\n  ORDER_RANKS,\n  SPECIALIZATION_LABELS,"
  );
}

s = s.replace(
  'skills: c.skills ?? [],',
  "skills: c.skills && c.skills.length > 0 ? c.skills : DEFAULT_SKILLS.map((sk) => ({ ...sk })),"
);

const marker =
  '<label key={key} className="rounded-md border border-ink-border bg-ink-raised/50 p-2 text-center">';
const start = s.indexOf(marker);
if (start === -1) {
  console.error('attr label block not found');
} else {
  const end = s.indexOf('</label>', start) + '</label>'.length;
  const replacement = [
    '<div key={key} className="rounded-md border border-ink-border bg-ink-raised/50 p-3 text-center">',
    '                <span className="label block">{ATTRIBUTE_LABELS[key]}</span>',
    '                <span className="mt-0.5 block text-xs text-ink-muted">{key}</span>',
    '                <input',
    '                  type="number"',
    '                  className="field mt-2 text-center font-display text-2xl"',
    '                  value={value}',
    '                  onChange={(e) =>',
    '                    patch({',
    '                      attributes: {',
    '                        ...sheet.attributes,',
    '                        [key]: Number(e.target.value) || 0,',
    '                      },',
    '                    })',
    '                  }',
    '                />',
    '                <div className="mt-2 flex items-center justify-center gap-2">',
    '                  <span className="text-base text-crimson-soft">',
    "                    {mod >= 0 ? '+' + mod : mod}",
    '                  </span>',
    '                  <InlineRollButton',
    '                    notation="1d100"',
    "                    label={ATTRIBUTE_LABELS[key] + ' (meta ' + value + ')'}",
    '                  />',
    '                </div>',
    '              </div>',
  ].join('\n');
  s = s.slice(0, start) + replacement + s.slice(end);
  console.log('attr block replaced');
}

// skill roll button
if (s.includes('InlineRollButton notation={`1d100`}')) {
  s = s.replace(
    'InlineRollButton notation={`1d100`}',
    'InlineRollButton notation="1d100" label={skill.name + " (meta " + total + ")"}'
  );
  console.log('skill roll label updated');
} else if (s.includes('InlineRollButton notation="1d100"') && !s.includes('skill.name + " (meta "')) {
  s = s.replace(
    '<InlineRollButton notation="1d100" />',
    '<InlineRollButton notation="1d100" label={skill.name + " (meta " + total + ")"} />'
  );
  console.log('skill roll label updated (alt)');
}

fs.writeFileSync(p, s);
console.log('ok', {
  defaults: s.includes('DEFAULT_SKILLS'),
  attrRoll: s.includes("ATTRIBUTE_LABELS[key] + ' (meta '"),
  skillRoll: s.includes('skill.name + " (meta "'),
});
