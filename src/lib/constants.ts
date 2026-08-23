import type { ElementType } from '@/types/database';

/** Fragmentos necessários pra sair do nível n e chegar no nível n+1 */
export const FRAGMENT_COST: number[] = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181,
  6765, 10946,
];

export const MAX_CHARACTER_LEVEL = 20;
export const MAX_ELEMENT_LEVEL = 20;

export const ALL_ELEMENTS: ElementType[] = [
  'fogo',
  'agua',
  'terra',
  'ar',
  'sangue',
  'encantamento',
  'veneno',
  'gelo',
  'eletricidade',
  'luz',
  'sombra',
];

export const ELEMENT_COLORS: Record<ElementType, string> = {
  fogo: '#E1531E',
  agua: '#1B3B5C',
  terra: '#35502E',
  ar: '#C9CDD3',
  sangue: '#6E0E1A',
  encantamento: '#A8D0E6',
  veneno: '#8BC34A',
  gelo: '#AEC6CF',
  eletricidade: '#F4D03F',
  luz: '#F5EFDD',
  sombra: '#17141C',
};

export const ELEMENT_LABELS: Record<ElementType, string> = {
  fogo: 'Fogo',
  agua: 'Água',
  terra: 'Terra',
  ar: 'Ar',
  sangue: 'Sangue',
  encantamento: 'Encantamento',
  veneno: 'Veneno',
  gelo: 'Gelo',
  eletricidade: 'Eletricidade',
  luz: 'Luz',
  sombra: 'Sombra',
};

/** Ajustável — curva ainda não definitiva do sistema */
export const PER_LEVEL_GROWTH = {
  attributePoints: 1,
  hpPerLevel: 2,
  manaPerLevel: 2,
};

export const ORDER_RANKS = [
  'Agente Principiante',
  'Agente',
  'Agente Sênior',
  'Especialista',
  'Comandante',
  'Conselheiro',
  'Líder',
] as const;

export const SPECIALIZATION_BONUS: Record<string, number> = {
  none: 0,
  basico: 2,
  medio: 4,
  alto: 6,
  expert: 8,
};


export const DEFAULT_SKILLS: {
  name: string;
  attribute: 'FOR' | 'CON' | 'DES' | 'INT' | 'EDU' | 'CAR' | 'POD';
  specialization: 'none' | 'basico' | 'medio' | 'alto' | 'expert';
}[] = [
  { name: 'Combate', attribute: 'FOR', specialization: 'none' },
  { name: 'Arremesso', attribute: 'DES', specialization: 'none' },
  { name: 'Atletismo', attribute: 'FOR', specialization: 'none' },
  { name: 'Escutar', attribute: 'INT', specialization: 'none' },
  { name: 'Acrobacia', attribute: 'DES', specialization: 'none' },
  { name: 'Furtividade', attribute: 'DES', specialization: 'none' },
  { name: 'Condução', attribute: 'DES', specialization: 'none' },
  { name: 'Tiro', attribute: 'DES', specialization: 'none' },
  { name: 'Esquiva', attribute: 'DES', specialization: 'none' },
  { name: 'Refletir', attribute: 'INT', specialization: 'none' },
  { name: 'Computação', attribute: 'INT', specialization: 'none' },
  { name: 'Percepção', attribute: 'INT', specialization: 'none' },
  { name: 'Investigação', attribute: 'INT', specialization: 'none' },
  { name: 'Medicina', attribute: 'EDU', specialization: 'none' },
  { name: 'Psicoanalisar', attribute: 'CAR', specialization: 'none' },
  { name: 'Natureza', attribute: 'EDU', specialization: 'none' },
  { name: 'Profissão', attribute: 'EDU', specialization: 'none' },
  { name: 'Charme', attribute: 'CAR', specialization: 'none' },
  { name: 'Intimidação', attribute: 'CAR', specialization: 'none' },
  { name: 'Lábia', attribute: 'CAR', specialization: 'none' },
  { name: 'Arcano', attribute: 'POD', specialization: 'none' },
  { name: 'Mitos', attribute: 'POD', specialization: 'none' },
];

export const SPECIALIZATION_LABELS: Record<string, string> = {
  none: 'Nenhuma',
  basico: 'Básico',
  medio: 'Médio',
  alto: 'Alto',
  expert: 'Expert',
};

export interface LevelMilestone {
  level: number;
  title: string;
  description: string;
  /** Se true, só se aplica quando is_order_agent */
  requiresOrderAgent?: boolean;
}

export const LEVEL_MILESTONES: LevelMilestone[] = [
  {
    level: 3,
    title: 'Raízes da Arcana',
    description:
      'A Arcana começa a se enraizar no personagem, curiosa com suas ações. Vantagem narrativa concedida pelo Mestre durante a sessão, conforme o comportamento do personagem — não é um bônus fixo automático.',
  },
  {
    level: 5,
    title: 'Primeira Manifestação',
    description:
      'Primeira manifestação física visível de magia, ligada ao elemento dominante do personagem até aqui, mais um pequeno passivo daquele elemento.',
  },
  {
    level: 8,
    title: 'Escolha da Arcana',
    description: 'O personagem escolhe sua Arcana.',
  },
  {
    level: 10,
    title: '+1 Poder Passivo',
    description: 'O personagem ganha +1 Poder Passivo.',
  },
  {
    level: 13,
    title: 'Reconhecimento na Ordem',
    description:
      'Ganha um favor/contato/acesso da liderança da Ordem Carmesim. Exclusivo para agentes da Ordem.',
    requiresOrderAgent: true,
  },
  {
    level: 15,
    title: 'Escolha da Subarcana',
    description: 'O personagem escolhe sua Subarcana.',
  },
  {
    level: 18,
    title: 'Fusão Elemental',
    description:
      'Fusão visível dos elementos dominantes — a magia do personagem vira uma assinatura própria, combinando os elementos mais desenvolvidos.',
  },
  {
    level: 20,
    title: 'Transformação em Apexion/Numen/Eldrath',
    description:
      'O personagem deixa de ser humano. A partir daqui, evolução vem de Feitos Históricos (positivos ou negativos), não mais de fragmentos.',
  },
];

export const VALID_IMAGE_URL =
  /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;

export const LORE_PAGES = [
  { slug: 'historia', title: 'História' },
  { slug: 'estrutura', title: 'Estrutura' },
  { slug: 'cargos', title: 'Cargos' },
  { slug: 'planos-de-existencia', title: 'Planos de Existência' },
  { slug: 'lideres', title: 'Líderes' },
] as const;

export const RULES_PAGES = [
  { slug: 'atributos', title: 'Atributos' },
  { slug: 'pericias', title: 'Perícias' },
  { slug: 'elementos-e-fragmentos', title: 'Elementos e Fragmentos' },
  { slug: 'arcanas', title: 'Arcanas' },
  { slug: 'armas-e-runas', title: 'Armas e Runas' },
  { slug: 'itens-amaldicoados', title: 'Itens Amaldiçoados' },
] as const;

export const WEAPON_TYPES = [
  'Corpo a Corpo',
  'A distância',
  'Explosivo',
  'Mágica',
] as const;

export function isDefaultSkillName(name: string): boolean {
  const n = name.trim().toLocaleLowerCase('pt-BR');
  return DEFAULT_SKILLS.some((s) => s.name.toLocaleLowerCase('pt-BR') === n);
}
