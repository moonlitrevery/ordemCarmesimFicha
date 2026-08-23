import fs from 'fs';

// Update QuickRollButton in DiceRoller to use toast context
let dice = fs.readFileSync('src/components/dice/DiceRoller.tsx', 'utf8');

const oldQuick = dice.slice(
  dice.indexOf('/** Clique = rola na hora'),
  dice.indexOf('export function DiceRoller')
);

const newQuick = `/** Clique = rola na hora 1d20+bonus (toast no canto inferior direito). */
export function QuickRollButton({
  bonus,
  label,
}: {
  bonus: number;
  label: string;
}) {
  const { pushRoll } = useDiceToast();

  return (
    <button
      type="button"
      className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
      onClick={() => pushRoll(label, bonus)}
      title={'Rolar 1d20' + formatModifier(bonus) + ' — ' + label}
      aria-label={'Rolar ' + label}
    >
      <DiceIcon className="h-5 w-5" />
    </button>
  );
}

`;

if (oldQuick.length > 50) {
  dice = dice.replace(oldQuick, newQuick);
} else {
  console.log('WARN quick block');
}

if (!dice.includes("import { useDiceToast }")) {
  dice = dice.replace(
    "import { formatModifier } from '@/lib/calculations';",
    "import { formatModifier } from '@/lib/calculations';\nimport { useDiceToast } from '@/components/dice/DiceToast';"
  );
}

// Remove unused createPortal/motion from QuickRoll if still needed for InlineRoll
fs.writeFileSync('src/components/dice/DiceRoller.tsx', dice);
console.log('quickroll updated', dice.includes('pushRoll'));

// Layout provider
let layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
if (!layout.includes('DiceToastProvider')) {
  layout = layout.replace(
    "import { Nav } from '@/components/layout/Nav';",
    "import { Nav } from '@/components/layout/Nav';\nimport { DiceToastProvider } from '@/components/dice/DiceToast';"
  );
  layout = layout.replace(
    '{children}',
    '<DiceToastProvider>{children}</DiceToastProvider>'
  );
  // only wrap main children once - careful
  fs.writeFileSync('src/app/layout.tsx', layout);
  console.log('layout provider');
}
