// src/lib/vtt/creature-tiers.ts — dados aprovados pela mestra. Não alterar.
export type Plane = 'tartaro' | 'purgatorio' | 'astral' | 'celestial';
export interface CreatureTier {
  plane: Plane; id: string; name: string;
  attributes: [number, number, number, number, number, number, number]; // FOR CON DES INT EDU CAR POD
  ndMin: number; ndMax: number;
  damageDie: string;        // ex.: 'd8', '2d6'
  hasX: boolean;            // false = sem +X (Tártaro 9º, Celestial Intermediário)
  xMode?: 'plane' | 'nd';   // 'nd' = X igual ao ND (Celestiais Inferior/Superior)
  hpPerNd: number; attacks: number; turns: number;
}
export const PLANE_LABELS: Record<Plane, string> = {
  tartaro: 'Tártaro', purgatorio: 'Purgatório', astral: 'Plano Astral', celestial: 'Celestiais',
};
export const PLANE_X_DIVISOR: Record<Exclude<Plane, 'celestial'>, number> = { tartaro: 3, purgatorio: 4, astral: 5 };
export const CREATURE_TIERS: CreatureTier[] = [
  { plane: 'tartaro', id: 't9', name: '9º Círculo', attributes: [12,10,10,8,8,6,6], ndMin: 1, ndMax: 3, damageDie: 'd6', hasX: false, hpPerNd: 4, attacks: 1, turns: 1 },
  { plane: 'tartaro', id: 't8', name: '8º Círculo', attributes: [12,12,10,10,8,8,6], ndMin: 4, ndMax: 6, damageDie: 'd6', hasX: true, hpPerNd: 4, attacks: 1, turns: 1 },
  { plane: 'tartaro', id: 't7', name: '7º Círculo', attributes: [14,14,12,10,10,8,8], ndMin: 7, ndMax: 10, damageDie: 'd8', hasX: true, hpPerNd: 4, attacks: 2, turns: 1 },
  { plane: 'tartaro', id: 't6', name: '6º Círculo', attributes: [16,14,14,12,10,10,8], ndMin: 11, ndMax: 14, damageDie: 'd8', hasX: true, hpPerNd: 5, attacks: 2, turns: 1 },
  { plane: 'tartaro', id: 't5', name: '5º Círculo', attributes: [18,16,16,14,12,10,10], ndMin: 15, ndMax: 18, damageDie: 'd10', hasX: true, hpPerNd: 5, attacks: 2, turns: 1 },
  { plane: 'tartaro', id: 't4', name: '4º Círculo', attributes: [20,18,18,16,14,12,10], ndMin: 19, ndMax: 22, damageDie: 'd10', hasX: true, hpPerNd: 6, attacks: 3, turns: 1 },
  { plane: 'tartaro', id: 't3', name: '3º Círculo', attributes: [22,20,18,16,14,12,12], ndMin: 23, ndMax: 26, damageDie: 'd12', hasX: true, hpPerNd: 6, attacks: 3, turns: 1 },
  { plane: 'tartaro', id: 't2', name: '2º Círculo', attributes: [24,22,20,18,16,14,12], ndMin: 27, ndMax: 30, damageDie: '2d6', hasX: true, hpPerNd: 7, attacks: 3, turns: 1 },
  { plane: 'tartaro', id: 't1', name: '1º Círculo', attributes: [26,24,22,20,18,16,14], ndMin: 31, ndMax: 35, damageDie: 'd10', hasX: true, hpPerNd: 7, attacks: 4, turns: 2 },
  { plane: 'tartaro', id: 'judeca', name: 'Judeca', attributes: [28,26,24,22,20,18,16], ndMin: 36, ndMax: 45, damageDie: 'd12', hasX: true, hpPerNd: 8, attacks: 5, turns: 2 },
  { plane: 'purgatorio', id: 'ante', name: 'Antepurgatório', attributes: [12,12,10,10,8,8,6], ndMin: 1, ndMax: 7, damageDie: 'd6', hasX: true, hpPerNd: 5, attacks: 1, turns: 1 },
  { plane: 'purgatorio', id: 'g3', name: 'Grau 3', attributes: [14,12,12,12,10,10,8], ndMin: 8, ndMax: 14, damageDie: 'd8', hasX: true, hpPerNd: 5, attacks: 1, turns: 1 },
  { plane: 'purgatorio', id: 'g2', name: 'Grau 2', attributes: [18,16,16,16,14,12,12], ndMin: 15, ndMax: 25, damageDie: 'd10', hasX: true, hpPerNd: 7, attacks: 2, turns: 1 },
  { plane: 'purgatorio', id: 'g1', name: 'Grau 1', attributes: [24,22,20,20,18,16,14], ndMin: 26, ndMax: 40, damageDie: '2d8', hasX: true, hpPerNd: 8, attacks: 3, turns: 1 },
  { plane: 'astral', id: 'hilico', name: 'Hílico', attributes: [12,10,10,10,8,8,8], ndMin: 1, ndMax: 7, damageDie: 'd4', hasX: true, hpPerNd: 6, attacks: 1, turns: 1 },
  { plane: 'astral', id: 'psiquico', name: 'Psíquico', attributes: [14,14,12,12,12,10,10], ndMin: 8, ndMax: 15, damageDie: 'd6', hasX: true, hpPerNd: 7, attacks: 2, turns: 1 },
  { plane: 'astral', id: 'pneumatico', name: 'Pneumático', attributes: [18,18,16,16,14,14,12], ndMin: 16, ndMax: 24, damageDie: 'd8', hasX: true, hpPerNd: 8, attacks: 2, turns: 1 },
  { plane: 'astral', id: 'neofito', name: 'Neófito', attributes: [20,20,18,18,18,16,16], ndMin: 25, ndMax: 29, damageDie: 'd8', hasX: true, hpPerNd: 10, attacks: 2, turns: 1 },
  { plane: 'astral', id: 'luminar', name: 'Luminar', attributes: [22,20,20,20,20,18,18], ndMin: 30, ndMax: 34, damageDie: 'd6', hasX: true, hpPerNd: 11, attacks: 3, turns: 2 },
  { plane: 'astral', id: 'ascendido', name: 'Ascendido', attributes: [24,22,22,22,20,20,18], ndMin: 35, ndMax: 39, damageDie: 'd8', hasX: true, hpPerNd: 11, attacks: 3, turns: 2 },
  { plane: 'astral', id: 'noetico', name: 'Noético', attributes: [26,24,24,22,22,20,18], ndMin: 40, ndMax: 44, damageDie: 'd8', hasX: true, hpPerNd: 11, attacks: 3, turns: 2 },
  { plane: 'astral', id: 'logos', name: 'Logos', attributes: [28,26,24,24,22,22,20], ndMin: 45, ndMax: 50, damageDie: 'd6', hasX: true, hpPerNd: 11, attacks: 4, turns: 3 },
  { plane: 'celestial', id: 'inferior', name: 'Inferior', attributes: [28,28,28,26,26,26,26], ndMin: 51, ndMax: 60, damageDie: 'd12', hasX: true, xMode: 'nd', hpPerNd: 7, attacks: 5, turns: 3 },
  { plane: 'celestial', id: 'intermediario', name: 'Intermediário', attributes: [30,30,28,28,28,28,28], ndMin: 61, ndMax: 70, damageDie: 'd20', hasX: false, hpPerNd: 8, attacks: 6, turns: 3 },
  { plane: 'celestial', id: 'superior', name: 'Superior', attributes: [32,32,32,30,28,28,28], ndMin: 71, ndMax: 80, damageDie: 'd20', hasX: true, xMode: 'nd', hpPerNd: 9, attacks: 7, turns: 4 },
];
export function xpForNd(nd: number): number {
  return nd * (nd <= 14 ? 4 : nd <= 26 ? 5 : 6);
}
