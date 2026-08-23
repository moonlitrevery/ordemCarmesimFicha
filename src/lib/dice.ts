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
