export interface DiceParseResult {
  count: number;
  sides: number;
  modifier: number;
}

export interface DiceRollResult {
  notation: string;
  dice: number[];
  modifier: number;
  total: number;
  breakdown: string;
}

const DICE_REGEX = /^(\d*)d(\d+)([+-]\d+)?$/i;

export function parseDiceNotation(notation: string): DiceParseResult | null {
  const cleaned = notation.trim().replace(/\s+/g, '');
  const match = cleaned.match(DICE_REGEX);
  if (!match) return null;

  const count = match[1] === '' ? 1 : parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;

  return { count, sides, modifier };
}

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(notation: string): DiceRollResult | null {
  const parsed = parseDiceNotation(notation);
  if (!parsed) return null;

  const dice = Array.from({ length: parsed.count }, () =>
    rollDie(parsed.sides)
  );
  const diceSum = dice.reduce((a, b) => a + b, 0);
  const total = diceSum + parsed.modifier;

  const parts = [...dice.map(String)];
  if (parsed.modifier !== 0) {
    parts.push(parsed.modifier > 0 ? `+${parsed.modifier}` : String(parsed.modifier));
  }

  const breakdown =
    parts.length === 1
      ? `= ${total}`
      : `${parts.join(' + ').replace(/\+ -/g, '- ')} = ${total}`;

  return {
    notation: notation.trim(),
    dice,
    modifier: parsed.modifier,
    total,
    breakdown,
  };
}

export const COMMON_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;

// ---------- Várias parcelas: 2d6+1d4+3 ----------

export interface DiceGroupSpec {
  count: number;
  sides: number;
}

export interface DiceExpression {
  groups: DiceGroupSpec[];
  modifier: number;
}

export interface DiceGroupResult {
  sides: number;
  results: number[];
}

export interface DiceExpressionRoll {
  notation: string;
  groups: DiceGroupResult[];
  modifier: number;
  total: number;
  /** `3 + 5 + 2 + 3`, sem o total. */
  math: string;
}

const MAX_DICE_PER_ROLL = 100;
const MAX_MODIFIER = 100000;
const EXPRESSION_TERM = /([+-]?)(?:(\d*)d(\d+)|(\d+))/gi;

/**
 * Soma de parcelas. Subtrair dados (`1d20-1d4`) não existe nas regras e é recusado,
 * assim como notação sem nenhum dado.
 */
export function parseDiceExpression(notation: string): DiceExpression | null {
  const cleaned = notation.trim().replace(/\s+/g, '');
  if (!cleaned) return null;

  const groups: DiceGroupSpec[] = [];
  let modifier = 0;
  let consumed = 0;
  let dice = 0;

  for (const match of Array.from(cleaned.matchAll(EXPRESSION_TERM))) {
    if (match.index !== consumed) return null;
    if (consumed > 0 && !match[1]) return null;
    consumed += match[0].length;

    if (match[3] === undefined) {
      const value = parseInt(match[4], 10);
      modifier += match[1] === '-' ? -value : value;
      continue;
    }
    if (match[1] === '-') return null;
    const count = match[2] === '' ? 1 : parseInt(match[2], 10);
    const sides = parseInt(match[3], 10);
    if (count < 1 || sides < 2 || sides > 1000) return null;
    dice += count;
    if (dice > MAX_DICE_PER_ROLL) return null;
    groups.push({ count, sides });
  }

  if (consumed !== cleaned.length || groups.length === 0) return null;
  if (Math.abs(modifier) > MAX_MODIFIER) return null;
  return { groups, modifier };
}

export function rollDiceExpression(
  notation: string,
  random: (sides: number) => number = rollDie
): DiceExpressionRoll | null {
  const parsed = parseDiceExpression(notation);
  if (!parsed) return null;

  const groups = parsed.groups.map(({ count, sides }) => ({
    sides,
    results: Array.from({ length: count }, () => random(sides)),
  }));
  const dice = groups.flatMap((group) => group.results);
  const sum = dice.reduce((a, b) => a + b, 0);

  let math = dice.join(' + ');
  if (parsed.modifier !== 0) {
    math += ` ${parsed.modifier > 0 ? '+' : '-'} ${Math.abs(parsed.modifier)}`;
  }

  return {
    notation: notation.trim().replace(/\s+/g, ''),
    groups,
    modifier: parsed.modifier,
    total: sum + parsed.modifier,
    math,
  };
}

/** Crítico e desastre só existem em rolagem de um único d20. */
export function d20Outcome(
  groups: DiceGroupResult[]
): 'critical' | 'disaster' | null {
  if (groups.length !== 1 || groups[0].sides !== 20) return null;
  if (groups[0].results.length !== 1) return null;
  const [die] = groups[0].results;
  if (die === 20) return 'critical';
  return die === 1 ? 'disaster' : null;
}
