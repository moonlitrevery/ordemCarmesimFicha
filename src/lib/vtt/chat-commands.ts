import { parseDiceExpression } from '../dice';

/** Quem pode receber sussurro: cada nome (de usuário ou de personagem) é uma linha. */
export interface WhisperTarget {
  userId: string;
  name: string;
  /** Nome de usuário, quando `name` é de personagem. */
  hint?: string;
}

export type ChatCommand =
  | { kind: 'text'; body: string }
  | { kind: 'roll'; notation: string; label: string; hidden: boolean }
  | { kind: 'whisper'; to: WhisperTarget; body: string }
  | { kind: 'error'; message: string };

export interface ChatSuggestion {
  /** O texto inteiro do campo depois de aceitar a sugestão. */
  value: string;
  label: string;
  hint?: string;
}

const COMMANDS: { command: string; hint: string }[] = [
  { command: '/r', hint: 'rola no chat: /r 2d6+3 Dano' },
  { command: '/rs', hint: 'rolagem escondida, só a mestra vê' },
  { command: '/shiu', hint: 'sussurro: /shiu Nome mensagem' },
];

const MAX_LABEL_LENGTH = 80;
const MAX_SUGGESTIONS = 8;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR');
}

/** Nomes têm espaço: "/shiu Maria Clara oi" escolhe o nome mais longo que couber. */
function matchTarget(
  text: string,
  targets: WhisperTarget[]
): { target: WhisperTarget; rest: string } | null {
  const haystack = normalize(text);
  let best: WhisperTarget | null = null;
  for (const target of targets) {
    const needle = normalize(target.name);
    if (!needle || !haystack.startsWith(needle)) continue;
    const next = haystack[needle.length];
    if (next !== undefined && !/\s/.test(next)) continue;
    if (!best || needle.length > normalize(best.name).length) best = target;
  }
  if (!best) return null;
  // Normalizar pode mudar o tamanho; o nome tem o mesmo número de palavras.
  const words = best.name.trim().split(/\s+/).length;
  const rest = text.trim().split(/\s+/).slice(words).join(' ');
  return { target: best, rest };
}

export function parseChatInput(
  input: string,
  targets: WhisperTarget[]
): ChatCommand {
  const text = input.trim();
  if (!text.startsWith('/')) return { kind: 'text', body: text };

  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(text);
  const command = (match?.[1] ?? '').toLowerCase();
  const args = match?.[2] ?? '';

  if (command === 'r' || command === 'rs') {
    const [notation = '', ...label] = args.split(/\s+/);
    if (!parseDiceExpression(notation)) {
      return {
        kind: 'error',
        message: 'Rolagem inválida. Exemplo: /r 2d6+1d4+3 Dano',
      };
    }
    return {
      kind: 'roll',
      notation,
      label: label.join(' ').slice(0, MAX_LABEL_LENGTH),
      hidden: command === 'rs',
    };
  }

  if (command === 'shiu') {
    const found = matchTarget(args, targets);
    if (!found) {
      return { kind: 'error', message: 'Para quem? Exemplo: /shiu Nome mensagem' };
    }
    if (!found.rest) return { kind: 'error', message: 'Faltou a mensagem.' };
    return { kind: 'whisper', to: found.target, body: found.rest };
  }

  return { kind: 'error', message: `Comando desconhecido: /${command}` };
}

export function chatSuggestions(
  input: string,
  targets: WhisperTarget[]
): ChatSuggestion[] {
  if (!input.startsWith('/')) return [];

  if (!/\s/.test(input)) {
    const typed = input.toLowerCase();
    return COMMANDS.filter(({ command }) => command.startsWith(typed)).map(
      ({ command, hint }) => ({ value: `${command} `, label: command, hint })
    );
  }

  const whisper = /^\/shiu\s+(.*)$/i.exec(input);
  if (!whisper) return [];
  const typed = normalize(whisper[1]);
  // Já escolheu o nome e está escrevendo a mensagem.
  if (matchTarget(whisper[1], targets) && /\s/.test(whisper[1].slice(-1))) return [];
  return targets
    .filter((target) => normalize(target.name).includes(typed.trim()))
    .slice(0, MAX_SUGGESTIONS)
    .map((target) => ({
      value: `/shiu ${target.name} `,
      label: target.name,
      hint: target.hint,
    }));
}

/** Usuários e personagens, sem a própria pessoa: ninguém sussurra para si. */
export function buildWhisperTargets(
  people: { userId: string; name: string }[],
  characters: { owner_id: string; name: string }[],
  selfId: string
): WhisperTarget[] {
  const nameOf = new Map(people.map((person) => [person.userId, person.name]));
  const targets: WhisperTarget[] = people.filter((p) => p.userId !== selfId);
  for (const character of characters) {
    const owner = nameOf.get(character.owner_id);
    if (owner === undefined || character.owner_id === selfId) continue;
    if (!character.name.trim()) continue;
    targets.push({
      userId: character.owner_id,
      name: character.name,
      hint: owner,
    });
  }
  return targets.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
