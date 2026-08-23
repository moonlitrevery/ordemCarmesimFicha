import fs from 'fs';

const p = 'src/components/character/CharacterSheet.tsx';
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
  `import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  ORDER_RANKS,
  SPECIALIZATION_LABELS,
  VALID_IMAGE_URL,
} from '@/lib/constants';`,
  `import {
  ORDER_RANKS,
  SPECIALIZATION_LABELS,
  VALID_IMAGE_URL,
} from '@/lib/constants';`
);

// Remove standalone DEFAULT_ATTRIBUTES import; we'll add a combined one
s = s.replace(
  /import \{ DEFAULT_ATTRIBUTES \} from '@\/types\/database';\n?/,
  ''
);

// Ensure types import includes ATTRIBUTE_KEYS/LABELS/DEFAULT
s = s.replace(
  /import type \{([^}]+)\} from '@\/types\/database';/,
  (match, inner) => {
    const names = new Set(
      inner
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    );
    names.add('Attributes');
    // keep as type-only for interfaces; add value import separately
    return match;
  }
);

if (!s.includes("import {\n  ATTRIBUTE_KEYS")) {
  s = s.replace(
    /import type \{([^}]+)\} from '@\/types\/database';/,
    `import type {$1} from '@/types/database';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  DEFAULT_ATTRIBUTES,
} from '@/types/database';`
  );
}

fs.writeFileSync(p, s);
console.log('fixed CharacterSheet imports');
console.log(
  s
    .split('\n')
    .slice(0, 55)
    .join('\n')
);
