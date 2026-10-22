// Gerado a partir de 'Tabela de armas e aprimoramentos II.xlsx'. Números transcritos como estão na planilha.
// Só referência: NÃO é vinculado às fichas.

export interface WeaponRefRow {
  availability: string;
  name: string;
  type: string;
  damage: string;
  ammo: string;
  hitsPerTurn: string;
  range: string;
  flaw: string;
  area: string;
  weight: string;
  rank: string;
  price: string;
  skill: string;
}

export interface WeaponRefGroup {
  id: string;
  title: string;
  rows: WeaponRefRow[];
}

export interface ArmorRefRow {
  name: string;
  reduction: string;
  rank: string;
  price: string;
}

export interface ModifierRefRow {
  availability: string;
  name: string;
  description: string;
  weight: string;
  price: string;
}

export const WEAPON_REF_GROUPS: WeaponRefGroup[] = [
  {
    "id": "melee",
    "title": "Armas corpo a corpo",
    "rows": [
      {
        "availability": "Disponível",
        "name": "Facas pequenas",
        "type": "Corpo a Corpo",
        "damage": "1d4+1",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$20,00",
        "skill": "Briga"
      },
      {
        "availability": "Disponível",
        "name": "Facas grandes",
        "type": "Corpo a Corpo",
        "damage": "1d4+2",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$35,00",
        "skill": "Briga"
      },
      {
        "availability": "Por encomenda",
        "name": "Espadas",
        "type": "Corpo a Corpo",
        "damage": "2d6+2",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$110,00",
        "skill": "Briga"
      },
      {
        "availability": "Disponível",
        "name": "Tacos de madeira",
        "type": "Corpo a Corpo",
        "damage": "1d6+1",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$45,00",
        "skill": "Briga"
      },
      {
        "availability": "Por encomenda",
        "name": "Tacos de metal",
        "type": "Corpo a Corpo",
        "damage": "1d6+2",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$55,00",
        "skill": "Briga"
      },
      {
        "availability": "Disponível",
        "name": "Taser (Comum)",
        "type": "Corpo a Corpo",
        "damage": "-",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Novato +",
        "price": "$100,00",
        "skill": "Briga"
      },
      {
        "availability": "Por encomenda",
        "name": "Machados",
        "type": "Corpo a Corpo",
        "damage": "1d12",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$120,00",
        "skill": "Briga"
      },
      {
        "availability": "Disponível",
        "name": "Machadinhas",
        "type": "Corpo a Corpo",
        "damage": "1d8+2",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Novato +",
        "price": "$40,00",
        "skill": "Briga"
      },
      {
        "availability": "Por encomenda",
        "name": "Rapieira",
        "type": "Corpo a Corpo",
        "damage": "1d8",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Novato +",
        "price": "$65,00",
        "skill": "Briga"
      },
      {
        "availability": "Por encomenda",
        "name": "Foice",
        "type": "Corpo a Corpo",
        "damage": "1d8",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Especialista +",
        "price": "$80,00",
        "skill": "Briga"
      },
      {
        "availability": "Disponível",
        "name": "Lança",
        "type": "Corpo a Corpo",
        "damage": "1d6+2",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$70,00",
        "skill": "Briga"
      },
      {
        "availability": "Não disponível",
        "name": "Serra elétrica",
        "type": "Corpo a Corpo",
        "damage": "4d8",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "3",
        "rank": "Agente Avançado +",
        "price": "$780,00",
        "skill": "Briga"
      },
      {
        "availability": "Disponível",
        "name": "Chicote",
        "type": "Corpo a Corpo",
        "damage": "1d6+1",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$20,00",
        "skill": "Briga"
      },
      {
        "availability": "Por encomenda",
        "name": "Maça",
        "type": "Corpo a Corpo",
        "damage": "1d6+2",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$45,00",
        "skill": "Briga"
      },
      {
        "availability": "-",
        "name": "Arma Improvisada I",
        "type": "Corpo a Corpo",
        "damage": "1d4",
        "ammo": "-",
        "hitsPerTurn": "-",
        "range": "Toque",
        "flaw": "10 | 5 | 1",
        "area": "-",
        "weight": "1",
        "rank": "-",
        "price": "-",
        "skill": "Briga"
      },
      {
        "availability": "-",
        "name": "Arma Improvisada II",
        "type": "Corpo a Corpo",
        "damage": "1d6",
        "ammo": "-",
        "hitsPerTurn": "-",
        "range": "Toque",
        "flaw": "10 | 5 | 1",
        "area": "-",
        "weight": "1",
        "rank": "-",
        "price": "-",
        "skill": "Briga"
      },
      {
        "availability": "Disponível",
        "name": "Arma genérica pequena",
        "type": "Corpo a Corpo",
        "damage": "Base d4",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$20,00",
        "skill": "Briga"
      },
      {
        "availability": "Disponível",
        "name": "Arma genérica grande",
        "type": "Corpo a Corpo",
        "damage": "Base d6/d8",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "3",
        "rank": "Agente Novato +",
        "price": "$60,00",
        "skill": "Briga"
      }
    ]
  },
  {
    "id": "firearms",
    "title": "Armas de fogo",
    "rows": [
      {
        "availability": "Disponível",
        "name": "Pistolas baixo calibre",
        "type": "Arma de Fogo",
        "damage": "1d6+2",
        "ammo": "15 balas",
        "hitsPerTurn": "2",
        "range": "10m",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$350,00",
        "skill": "Tiro"
      },
      {
        "availability": "Disponível",
        "name": "Pistolas calibre médio",
        "type": "Arma de Fogo",
        "damage": "1d8+2",
        "ammo": "12 balas",
        "hitsPerTurn": "1",
        "range": "10m",
        "flaw": "2",
        "area": "-",
        "weight": "1",
        "rank": "Agente Novato +",
        "price": "$450,00",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "Pistolas calibre alto",
        "type": "Arma de Fogo",
        "damage": "2d6+2",
        "ammo": "8 balas",
        "hitsPerTurn": "1",
        "range": "10m",
        "flaw": "2",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$650,00",
        "skill": "Tiro"
      },
      {
        "availability": "Disponível",
        "name": "AK-47",
        "type": "Arma de Fogo",
        "damage": "2d6+4",
        "ammo": "30 balas",
        "hitsPerTurn": "2",
        "range": "80m",
        "flaw": "2",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$840,00",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "AK-74",
        "type": "Arma de Fogo",
        "damage": "2d6+1d4",
        "ammo": "30 balas",
        "hitsPerTurn": "2",
        "range": "110m",
        "flaw": "2",
        "area": "-",
        "weight": "2",
        "rank": "Agente Especialista +",
        "price": "$860,00",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "Barrett",
        "type": "Arma de Fogo",
        "damage": "2d10+2",
        "ammo": "15 balas",
        "hitsPerTurn": "1",
        "range": "130m",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Especialista +",
        "price": "$920,00",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "FN FAL",
        "type": "Arma de Fogo",
        "damage": "2d6+3",
        "ammo": "25 balas",
        "hitsPerTurn": "1",
        "range": "10m",
        "flaw": "2",
        "area": "-",
        "weight": "2",
        "rank": "Agente Especialista +",
        "price": "$800,00",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "Galil AR",
        "type": "Arma de Fogo",
        "damage": "2d6+3",
        "ammo": "35 balas",
        "hitsPerTurn": "1",
        "range": "100m",
        "flaw": "2",
        "area": "-",
        "weight": "2",
        "rank": "Agente Especialista +",
        "price": "$800,00",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "M16A2",
        "type": "Arma de Fogo",
        "damage": "2d8+2",
        "ammo": "20 balas",
        "hitsPerTurn": "3",
        "range": "120m",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Especialista +",
        "price": "$900,00",
        "skill": "Tiro"
      },
      {
        "availability": "Não disponível",
        "name": "AUG",
        "type": "Arma de Fogo",
        "damage": "2d6",
        "ammo": "30 balas",
        "hitsPerTurn": "1",
        "range": "110m",
        "flaw": "1",
        "area": "-",
        "weight": "3",
        "rank": "Agente Avançado +",
        "price": "$720,00",
        "skill": "Tiro"
      },
      {
        "availability": "Disponível",
        "name": "Shotgun",
        "type": "Arma de Fogo",
        "damage": "3d6 | 2d6 | 1d6",
        "ammo": "20 balas",
        "hitsPerTurn": "1",
        "range": "10m/20m/45m",
        "flaw": "3",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$800,00",
        "skill": "Tiro"
      },
      {
        "availability": "Disponível",
        "name": "Sniper comum",
        "type": "Arma de Fogo",
        "damage": "3d6+2",
        "ammo": "10 balas",
        "hitsPerTurn": "1",
        "range": "180m",
        "flaw": "2",
        "area": "-",
        "weight": "3",
        "rank": "Agente Novato +",
        "price": "$750,00",
        "skill": "Tiro"
      },
      {
        "availability": "Não disponível",
        "name": "Sniper militar",
        "type": "Arma de Fogo",
        "damage": "3d8+4",
        "ammo": "20 balas",
        "hitsPerTurn": "1",
        "range": "180m",
        "flaw": "-",
        "area": "-",
        "weight": "3",
        "rank": "-",
        "price": "-",
        "skill": "Tiro"
      },
      {
        "availability": "Não disponível",
        "name": "Sniper profissional",
        "type": "Arma de Fogo",
        "damage": "3d8+3",
        "ammo": "10 balas",
        "hitsPerTurn": "1",
        "range": "180m",
        "flaw": "1",
        "area": "-",
        "weight": "3",
        "rank": "Agente Avançado +",
        "price": "$1.050,00",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "Sniper de caça",
        "type": "Arma de Fogo",
        "damage": "2d6+3",
        "ammo": "8 balas",
        "hitsPerTurn": "1",
        "range": "180m",
        "flaw": "3",
        "area": "-",
        "weight": "2",
        "rank": "Agente Especialista +",
        "price": "$780,00",
        "skill": "Tiro"
      },
      {
        "availability": "-",
        "name": "Arma improvisada 1",
        "type": "Arma de Fogo",
        "damage": "-",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "-",
        "flaw": "12 | 7 | 3",
        "area": "-",
        "weight": "1",
        "rank": "-",
        "price": "-",
        "skill": "Tiro"
      },
      {
        "availability": "-",
        "name": "Arma improvisada 2",
        "type": "Arma de Fogo",
        "damage": "-",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "-",
        "flaw": "12 | 7 | 3",
        "area": "-",
        "weight": "1",
        "rank": "-",
        "price": "-",
        "skill": "Tiro"
      },
      {
        "availability": "Disponível",
        "name": "Arma de mão genérica",
        "type": "Arma de Fogo",
        "damage": "Base 1d6",
        "ammo": "10 balas",
        "hitsPerTurn": "1",
        "range": "10m",
        "flaw": "2",
        "area": "-",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$400,00",
        "skill": "Tiro"
      },
      {
        "availability": "Disponível",
        "name": "Rifle genérico",
        "type": "Arma de Fogo",
        "damage": "Base 2d6",
        "ammo": "8 balas",
        "hitsPerTurn": "1",
        "range": "90m",
        "flaw": "2",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$800,00",
        "skill": "Tiro"
      }
    ]
  },
  {
    "id": "extras",
    "title": "Armas extras / Arremessáveis",
    "rows": [
      {
        "availability": "Por encomenda",
        "name": "Molotov",
        "type": "Explosivo",
        "damage": "3d6 + QUEIM.",
        "ammo": "-",
        "hitsPerTurn": "-",
        "range": "até Arremesso × 5m",
        "flaw": "5",
        "area": "Raio de 3m",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$20,00",
        "skill": "Arremesso"
      },
      {
        "availability": "Por encomenda",
        "name": "C4",
        "type": "Explosivo",
        "damage": "4d6+10",
        "ammo": "-",
        "hitsPerTurn": "-",
        "range": "-",
        "flaw": "5",
        "area": "Raio de 6m",
        "weight": "1",
        "rank": "Agente Especialista +",
        "price": "$500,00",
        "skill": "Inteligência"
      },
      {
        "availability": "Por encomenda",
        "name": "Granada de mão",
        "type": "Explosivo",
        "damage": "4d6+5",
        "ammo": "-",
        "hitsPerTurn": "-",
        "range": "até Arremesso × 5m",
        "flaw": "5",
        "area": "Raio de 5m",
        "weight": "1",
        "rank": "Agente Novato +",
        "price": "$450,00",
        "skill": "Arremesso"
      },
      {
        "availability": "Não disponível",
        "name": "Lança chamas",
        "type": "Arma de Fogo",
        "damage": "2d6+5",
        "ammo": "4 turnos",
        "hitsPerTurn": "-",
        "range": "50m",
        "flaw": "3",
        "area": "-",
        "weight": "4",
        "rank": "Agente Veterano",
        "price": "$1.400,00",
        "skill": "Tiro"
      },
      {
        "availability": "Não disponível",
        "name": "Machine gun",
        "type": "Arma de Fogo",
        "damage": "Xd6+5",
        "ammo": "100 balas",
        "hitsPerTurn": "-",
        "range": "150m",
        "flaw": "1",
        "area": "-",
        "weight": "5",
        "rank": "Agente Veterano",
        "price": "$1.600,00",
        "skill": "Força"
      },
      {
        "availability": "Por encomenda",
        "name": "Banana de dinamite",
        "type": "Explosivo",
        "damage": "4d6+4",
        "ammo": "-",
        "hitsPerTurn": "-",
        "range": "até Arremesso × 5m",
        "flaw": "5",
        "area": "Raio de 4m",
        "weight": "1",
        "rank": "Agente Novato +",
        "price": "$400,00",
        "skill": "Arremesso"
      },
      {
        "availability": "Não disponível",
        "name": "Mina",
        "type": "Explosivo",
        "damage": "4d6+5",
        "ammo": "-",
        "hitsPerTurn": "-",
        "range": "-",
        "flaw": "5",
        "area": "Raio de 3m",
        "weight": "1",
        "rank": "Agente Avançado +",
        "price": "$650,00",
        "skill": "Inteligência"
      },
      {
        "availability": "Por encomenda",
        "name": "Shuriken",
        "type": "Arma a distância",
        "damage": "Xd4",
        "ammo": "18 shurikens",
        "hitsPerTurn": "6",
        "range": "até Arremesso × 1m",
        "flaw": "4",
        "area": "-",
        "weight": "1 (sacola com 18)",
        "rank": "Agente Principiante +",
        "price": "$50,00 (sacola com 18)",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "Bomba de fumaça",
        "type": "Explosivo",
        "damage": "-",
        "ammo": "-",
        "hitsPerTurn": "-",
        "range": "até Arremesso × 5m",
        "flaw": "1",
        "area": "Raio de 5m",
        "weight": "1",
        "rank": "Agente Novato +",
        "price": "$300,00",
        "skill": "Arremesso"
      },
      {
        "availability": "Disponível",
        "name": "Estilingue",
        "type": "Arma a distância",
        "damage": "1d4+1",
        "ammo": "6 pedras",
        "hitsPerTurn": "1",
        "range": "10m",
        "flaw": "3",
        "area": "-",
        "weight": "1",
        "rank": "Agente Principiante +",
        "price": "$10,00",
        "skill": "Tiro"
      },
      {
        "availability": "Disponível",
        "name": "Crossbow",
        "type": "Arma a distância",
        "damage": "1d8+2",
        "ammo": "12 virotes",
        "hitsPerTurn": "1",
        "range": "10m",
        "flaw": "2",
        "area": "-",
        "weight": "2",
        "rank": "Agente Principiante +",
        "price": "$120,00",
        "skill": "Tiro"
      },
      {
        "availability": "Por encomenda",
        "name": "Kusarigama",
        "type": "Corpo a Corpo",
        "damage": "2d4+2",
        "ammo": "-",
        "hitsPerTurn": "1",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$250,00",
        "skill": "Briga"
      },
      {
        "availability": "Por encomenda",
        "name": "Sansetsukon",
        "type": "Corpo a Corpo",
        "damage": "1d4+3",
        "ammo": "-",
        "hitsPerTurn": "2",
        "range": "Toque",
        "flaw": "2",
        "area": "-",
        "weight": "2",
        "rank": "Agente Novato +",
        "price": "$300,00",
        "skill": "Briga"
      },
      {
        "availability": "Por encomenda",
        "name": "Dardo de veneno",
        "type": "Arma a distância",
        "damage": "1d4 + VEN.",
        "ammo": "4 dardos",
        "hitsPerTurn": "1",
        "range": "até Arremesso × 5m",
        "flaw": "3",
        "area": "-",
        "weight": "1 (sacola com 4)",
        "rank": "Agente Principiante +",
        "price": "$100,00 (sacola com 4)",
        "skill": "Arremesso"
      },
      {
        "availability": "Por encomenda",
        "name": "Chakram",
        "type": "Corpo a Corpo",
        "damage": "Xd4+2",
        "ammo": "-",
        "hitsPerTurn": "2 (com 2 chakrams)",
        "range": "Toque",
        "flaw": "1",
        "area": "-",
        "weight": "1",
        "rank": "Agente Novato +",
        "price": "$200,00",
        "skill": "Briga"
      }
    ]
  }
];

export const ARMOR_REF: ArmorRefRow[] = [
  {
    "name": "Armadura Simples (Física)",
    "reduction": "5 de redução de dano mundano",
    "rank": "Agente Novato +",
    "price": "$1.000,00"
  },
  {
    "name": "Armadura Simples (Mágica)",
    "reduction": "5 de redução de dano mágico",
    "rank": "-",
    "price": "-"
  },
  {
    "name": "Armadura Mediana (Física)",
    "reduction": "10 de redução de dano mundano",
    "rank": "Agente Especialista +",
    "price": "$1.500,00"
  },
  {
    "name": "Armadura Mediana (Mágica)",
    "reduction": "10 de redução de dano mágico",
    "rank": "-",
    "price": "-"
  },
  {
    "name": "Armadura Avançada (Física)",
    "reduction": "/2 de redução de dano mundano",
    "rank": "Agente Avançado +",
    "price": "$2.000,00"
  },
  {
    "name": "Armadura Avançada (Mágica)",
    "reduction": "/2 de redução de dano mágico",
    "rank": "-",
    "price": "-"
  },
  {
    "name": "Armadura Pesada (Física)",
    "reduction": "/3 de redução de dano mundano, porém tem apenas metade do movimento e desvantagem em testes de destreza",
    "rank": "Agente Veterano",
    "price": "$2.500,00"
  },
  {
    "name": "Armadura Pesada (Mágica)",
    "reduction": "/3 de redução de dano mágico, porém tem apenas metade do movimento e desvantagem em testes de destreza",
    "rank": "-",
    "price": "-"
  }
];

export const MODIFIER_REF: ModifierRefRow[] = [
  {
    "availability": "Disponível",
    "name": "Silenciador",
    "description": "Seus tiros não fazem barulho, porém você recebe -1 dado de dano. Se a arma tiver só 1 dado de dano, role o dano com desvantagem (role 2 vezes e fique com o menor), já que não existe 0dX.",
    "weight": "1",
    "price": "$200,00"
  },
  {
    "availability": "Por encomenda",
    "name": "Carregador estendido",
    "description": "Dobra a capacidade de munição de uma arma, mas diminui em metade a distância que a bala consegue chegar.",
    "weight": "1",
    "price": "$40,00"
  },
  {
    "availability": "Disponível",
    "name": "Lanterna acoplada",
    "description": "Uma lanterna para ficar na sua arma. Ilumina o local em um cone de 5m (Dependendo do terreno).",
    "weight": "1",
    "price": "$20,00"
  },
  {
    "availability": "Por encomenda",
    "name": "Infravermelho",
    "description": "+2 no dado de acerto da arma de fogo, mas sempre será detectado por inimigos que conseguem enxergar o laser em si mesmos.",
    "weight": "1",
    "price": "$120,00"
  },
  {
    "availability": "Por encomenda",
    "name": "Mira 32x",
    "description": "Dobra a distância do alcance de uma arma, aumentando também em +1 o dado de acerto. A partir desse momento, você não consegue acertar tiros com essa arma caso esteja em uma distância menor a metade do valor de alcance atribuído a arma.",
    "weight": "1",
    "price": "$240,00"
  },
  {
    "availability": "Não disponível",
    "name": "Mira de Calor",
    "description": "Apenas para armamento militar. +4 para acerto, +2d de dano. Item extremamente raro, caro e normalmente obtido em bases militares.",
    "weight": "1",
    "price": "-"
  },
  {
    "availability": "Por encomenda",
    "name": "Detector de Inimigos",
    "description": "Um pequeno dispositivo acoplado à sua arma que emite um sinal sonoro quando um inimigo se aproxima. O dispositivo só funciona em um raio de 5 metros e não é muito preciso.",
    "weight": "1",
    "price": "$150,00"
  },
  {
    "availability": "Por encomenda",
    "name": "Empunhadura de Couro",
    "description": "Uma empunhadura mais confortável para sua arma, diminuindo a chance de você travá-la em momentos críticos. (Diminui o defeito em 1, mínimo de defeito é 1)",
    "weight": "1",
    "price": "$50,00"
  },
  {
    "availability": "Disponível",
    "name": "Alça",
    "description": "Uma alça que diminui o peso de sua arma em -1. (O mínimo de peso da arma deve ser 1).",
    "weight": "0",
    "price": "$150,00"
  },
  {
    "availability": "Por encomenda",
    "name": "Apoio",
    "description": "Um apoio para colocar em sua sniper. Te dá mais estabilidade nos tiros, aumentando seu dado para acertar em +1.",
    "weight": "1",
    "price": "$50,00"
  }
];

export const MAX_WEAPON_MODS = 3;
