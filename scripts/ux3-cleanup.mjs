import fs from 'fs';

// schema
let schema = fs.readFileSync('supabase/schema.sql', 'utf8');
if (!schema.includes('resource_mods')) {
  schema = schema.replace(
    "milestone_notes jsonb not null default '{}'::jsonb,",
    "milestone_notes jsonb not null default '{}'::jsonb,\n  resource_mods jsonb not null default '{\"hp\":0,\"mana\":0,\"sanity\":0}'::jsonb,"
  );
  fs.writeFileSync('supabase/schema.sql', schema);
  console.log('schema ok');
}

// ElementsSection glow
let el = fs.readFileSync('src/components/character/ElementsSection.tsx', 'utf8');
if (!el.includes('ELEMENT_COLORS')) {
  el = el.replace(
    "import { ALL_ELEMENTS, ELEMENT_LABELS } from '@/lib/constants';",
    "import { ALL_ELEMENTS, ELEMENT_COLORS, ELEMENT_LABELS } from '@/lib/constants';"
  );
}
if (!el.includes('textShadow')) {
  el = el.replace(
    `onClick={() => addElement(el)}
            >
              {ELEMENT_LABELS[el]}
            </button>`,
    `onClick={() => addElement(el)}
              style={{
                color: ELEMENT_COLORS[el],
                textShadow:
                  el === 'luz' || el === 'sombra'
                    ? '0 0 8px rgba(255,255,255,0.55), 0 0 14px rgba(255,255,255,0.3)'
                    : undefined,
              }}
            >
              {ELEMENT_LABELS[el]}
            </button>`
  );
  fs.writeFileSync('src/components/character/ElementsSection.tsx', el);
  console.log('elements glow');
}

// Fix Character type resource_mods optional for backwards compat
let types = fs.readFileSync('src/types/database.ts', 'utf8');
types = types.replace(
  'resource_mods: ResourceMods;',
  'resource_mods?: ResourceMods;'
);
fs.writeFileSync('src/types/database.ts', types);

console.log('cleanup ok');
