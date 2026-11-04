import { SPELL_PRESETS, type FxPreset } from './presets';

export type SpellTarget = 'token' | 'addon';

export interface Spell {
  id: string;
  name: string;
  preset: FxPreset;
  appliesTo: SpellTarget;
}

/** Cadastro à mão: a mestra e o jogador escolhem juntos, e ela acrescenta aqui. */
export const SPELLS: readonly Spell[] = [
  { id: 'covardia', name: 'Covardia', preset: SPELL_PRESETS.covardia, appliesTo: 'token' },
  { id: 'carneirinho', name: 'Carneirinho', preset: SPELL_PRESETS.carneirinho, appliesTo: 'token' },
  { id: 'ginastica', name: 'Ginástica', preset: SPELL_PRESETS.ginastica, appliesTo: 'token' },
  { id: 'varredura', name: 'Varredura', preset: SPELL_PRESETS.varredura, appliesTo: 'token' },
  { id: 'balas-de-veneno', name: 'Balas de Veneno', preset: SPELL_PRESETS.balasDeVeneno, appliesTo: 'addon' },
];

/** Sem acento e sem caixa: "ginastica" acha "Ginástica". */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/** Procura em todas as magias, servindo ou não no alvo: quem filtra é o menu. */
export function searchSpells(query: string, spells: readonly Spell[] = SPELLS): Spell[] {
  const wanted = normalizeSearch(query);
  return spells.filter((spell) => normalizeSearch(spell.name).includes(wanted));
}
