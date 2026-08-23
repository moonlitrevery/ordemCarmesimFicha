import fs from 'fs';

// specialization bonuses
let c = fs.readFileSync('src/lib/constants.ts', 'utf8');
c = c.replace(
  `export const SPECIALIZATION_BONUS: Record<string, number> = {
  none: 0,
  basico: 10,
  medio: 20,
  alto: 30,
  expert: 40,
};`,
  `export const SPECIALIZATION_BONUS: Record<string, number> = {
  none: 0,
  basico: 2,
  medio: 4,
  alto: 6,
  expert: 8,
};`
);
fs.writeFileSync('src/lib/constants.ts', c);

// font size middle ground
fs.writeFileSync(
  'src/app/globals.css',
  `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #0c0a0d;
  --foreground: #e8dfd0;
}

html {
  color-scheme: dark;
  font-size: 16.5px;
}

@media (min-width: 768px) {
  html {
    font-size: 17px;
  }
}

body {
  color: var(--foreground);
  background-color: var(--background);
  min-height: 100dvh;
  letter-spacing: 0.01em;
}

@layer base {
  ::selection {
    background: rgba(139, 30, 45, 0.45);
    color: #fff;
  }
}

@layer components {
  .panel {
    @apply rounded-lg border border-ink-border bg-ink-panel/80 shadow-panel backdrop-blur-sm;
  }

  .field {
    @apply w-full rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-[0.95rem] text-parchment outline-none transition focus:border-crimson/70 focus:ring-1 focus:ring-crimson/40;
  }

  .btn {
    @apply inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-[0.95rem] font-medium transition disabled:opacity-50;
  }

  .btn-primary {
    @apply btn bg-crimson text-parchment hover:bg-crimson-soft;
  }

  .btn-ghost {
    @apply btn border border-ink-border bg-transparent text-parchment hover:border-crimson/50 hover:bg-ink-raised;
  }

  .section-title {
    @apply font-display text-xl tracking-wide text-parchment md:text-2xl;
  }

  .label {
    @apply text-xs font-medium uppercase tracking-[0.12em] text-ink-muted;
  }
}
`
);

console.log('constants + globals ok');
