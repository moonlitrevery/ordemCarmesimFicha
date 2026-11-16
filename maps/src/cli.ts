// npm run maps:build -- <id|arquivo|all> [--variant <id>] [--seed <n>] [--png]
// npm run maps:watch -- <id>
// npm run maps:preview [-- --port 4178]
import fs from 'fs';
import path from 'path';
import { buildFile, findSpecFile, formatError, listSpecFiles } from './build';
import { startPreview } from './preview';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function build(target: string) {
  const files = target === 'all' ? listSpecFiles() : [findSpecFile(target)].filter(Boolean) as string[];
  if (!files.length) {
    console.error(`[maps] nenhum YAML com id ou nome "${target}" em maps/specs/`);
    process.exitCode = 1;
    return;
  }
  const seed = arg('seed');
  for (const file of files) {
    try {
      await buildFile(file, {
        seed: seed !== undefined ? Number(seed) >>> 0 : undefined,
        png: process.argv.includes('--png'),
        only: arg('variant') ?? undefined,
      });
    } catch (error) {
      console.error(formatError(error));
      process.exitCode = 1;
    }
  }
}

async function watch(target: string) {
  const file = findSpecFile(target);
  if (!file) {
    console.error(`[maps] nenhum YAML com id ou nome "${target}"`);
    process.exitCode = 1;
    return;
  }
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let again = false;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await buildFile(file, { only: arg('variant') ?? undefined });
    } catch (error) {
      console.error(formatError(error));
    }
    running = false;
    if (again) {
      again = false;
      void run();
    }
  };
  console.log(`[maps] observando ${path.relative(process.cwd(), file)} (Ctrl+C para sair)`);
  await run();
  fs.watch(file, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 250);
  });
}

const [command, target] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
async function main() {
  if (command === 'build') await build(target ?? 'all');
  else if (command === 'watch') await watch(target ?? '');
    else if (command === 'preview') startPreview(Number(arg('port') ?? 4178));
  else {
    console.log('uso: maps build <id|all> | maps watch <id> | maps preview');
    process.exitCode = 1;
  }
}

void main();
